#!/usr/bin/env python3
"""Validación editorial y técnica para Alhaurín al Día.

Comprueba el JSON de noticias, páginas generadas y sitemap antes de publicar.
No usa dependencias externas para que pueda ejecutarse en GitHub Actions.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = BASE_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from lib.editorial_rules import (  # noqa: E402
    normalizar_texto,
    similitud_jaccard,
    titulo_truncado,
)

NEWS_FILE = BASE_DIR / "data" / "noticias.json"
FUENTES_FILE = BASE_DIR / "data" / "fuentes.json"
GEOGRAFIA_FILE = BASE_DIR / "data" / "geografia.json"
AVISOS_OFICIALES_FILE = BASE_DIR / "data" / "avisos-oficiales.json"
BOLETIN_OFICIAL_FILE = BASE_DIR / "data" / "boletin-oficial.json"
SITEMAP_FILE = BASE_DIR / "sitemap.xml"
SITE_URL = "https://alhaurinaldia.es"

NIVELES_CONFIANZA_VALIDOS = {"A", "B", "C", "D"}
CAMPOS_FUENTE_OBLIGATORIOS = ["id", "nombre", "url", "nivel_confianza"]

CATEGORIAS_VALIDAS = {
    "Actualidad",
    "Fiestas y Tradiciones",
    "Agenda Cultural",
    "Deportes",
    "Municipal",
    "Obras y Servicios",
    "Tráfico y Movilidad",
    "Educación",
    "Comercio y Empresa",
    "Turismo y Patrimonio",
    "Sucesos",
    "Vídeos",
}

CAMPOS_OBLIGATORIOS = [
    "id",
    "titulo",
    "descripcion",
    "resumen",
    "cuerpo",
    "fecha",
    "fuente",
    "categoria",
    "categoria_url",
    "enlace",
    "url",
    "pagina",
]

def es_url_valida(url: str) -> bool:
    parsed = urlparse(url or "")
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def parsear_fecha(valor: str) -> bool:
    if not valor:
        return False
    try:
        datetime.fromisoformat(valor.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


_NEWS_ARTICLE_MARCADOR_REGEX = re.compile(r'"@type"\s*:\s*"NewsArticle"')
_CLAVES_NEWS_ARTICLE_OBLIGATORIAS = ["headline", "datePublished", "mainEntityOfPage"]


def _extraer_atributo_html(fragmento_tag: str, nombre_atributo: str) -> str | None:
    """Extrae un atributo de un fragmento de etiqueta ya localizado, sin
    asumir en qué posición aparece respecto a los demás atributos."""
    patron = re.compile(rf'\b{re.escape(nombre_atributo)}\s*=\s*["\']([^"\']*)["\']', re.IGNORECASE)
    match = patron.search(fragmento_tag)
    return match.group(1) if match else None


def _encontrar_link_canonical(html: str) -> str | None:
    """Primera etiqueta <link> cuyo atributo rel contiene el token
    'canonical', o None si no hay ninguna."""
    for match in re.finditer(r"<link\b[^>]*>", html, re.IGNORECASE):
        tag = match.group(0)
        rel = _extraer_atributo_html(tag, "rel")
        if rel and "canonical" in rel.split():
            return tag
    return None


def validar_canonical(html: str, pagina: str, etiqueta: str) -> list[str]:
    """Invariante objetiva: la página debe declarar un
    <link rel="canonical"> que apunte exactamente a su propia URL
    pública. No valida nada más de SEO (eso sigue en
    seo:audit/seo:orphans, --warn-only)."""
    tag = _encontrar_link_canonical(html)
    if not tag:
        return [f"{etiqueta}: la página no tiene <link rel=\"canonical\">: {pagina}"]

    href = _extraer_atributo_html(tag, "href")
    esperado = f"{SITE_URL}/{pagina}"
    if not href or not es_url_valida(href):
        return [f"{etiqueta}: canonical con href ausente o inválido en {pagina}: '{href}'"]
    if href != esperado:
        return [
            f"{etiqueta}: canonical apunta a una URL distinta de la esperada en {pagina}: "
            f"'{href}' (se esperaba '{esperado}')"
        ]
    return []


def _bloques_ld_json(html: str) -> list[str]:
    """Contenido de cada <script type="application/ld+json">...</script>
    de la página, identificado comprobando su atributo `type` de forma
    agnóstica al orden de atributos (vía _extraer_atributo_html), no
    asumiendo que `type` es el primer atributo ni que no hay otros
    atributos (id, nonce...) en la etiqueta."""
    bloques = []
    for match in re.finditer(r"<script\b([^>]*)>(.*?)</script>", html, re.IGNORECASE | re.DOTALL):
        atributos, contenido = match.group(1), match.group(2)
        tipo = _extraer_atributo_html(atributos, "type")
        if tipo and tipo.strip().lower() == "application/ld+json":
            bloques.append(contenido)
    return bloques


def _valor_json_ld_vacio(valor) -> bool:
    if valor is None:
        return True
    if isinstance(valor, str):
        return not valor.strip()
    if isinstance(valor, (dict, list)):
        return len(valor) == 0
    return False


def validar_json_ld_news_article(html: str, pagina: str, etiqueta: str) -> list[str]:
    """Invariante objetiva: debe existir al menos un bloque JSON-LD con
    @type NewsArticle, válido, con headline/datePublished/
    mainEntityOfPage no vacíos. El bloque se localiza por contenido
    (@type), no por posición -- puede haber otros bloques JSON-LD
    (BreadcrumbList, Organization...) y eso no es un error por sí
    mismo."""
    candidatos = [
        bloque for bloque in _bloques_ld_json(html)
        if _NEWS_ARTICLE_MARCADOR_REGEX.search(bloque)
    ]
    if not candidatos:
        return [f"{etiqueta}: no se encuentra bloque JSON-LD con @type NewsArticle en {pagina}"]

    primer_error = None
    for bloque in candidatos:
        try:
            datos = json.loads(bloque)
        except json.JSONDecodeError as exc:
            if primer_error is None:
                primer_error = f"{etiqueta}: JSON-LD NewsArticle mal formado en {pagina}: {exc}"
            continue

        faltantes = [
            clave for clave in _CLAVES_NEWS_ARTICLE_OBLIGATORIAS
            if clave not in datos or _valor_json_ld_vacio(datos.get(clave))
        ]
        if faltantes:
            if primer_error is None:
                primer_error = (
                    f"{etiqueta}: JSON-LD NewsArticle en {pagina} sin la(s) clave(s) "
                    f"obligatoria(s): {', '.join(faltantes)}"
                )
            continue

        # Al menos un candidato es válido y completo: la invariante se
        # cumple, aunque otros bloques con @type NewsArticle (si los
        # hubiera) estén incompletos.
        return []

    return [primer_error]


def validar_noticia(noticia: dict, index: int, sitemap: str) -> tuple[list[str], list[str]]:
    errores: list[str] = []
    avisos: list[str] = []
    etiqueta = noticia.get("id") or noticia.get("titulo") or f"noticia #{index + 1}"

    for campo in CAMPOS_OBLIGATORIOS:
        if not str(noticia.get(campo, "")).strip():
            errores.append(f"{etiqueta}: falta el campo obligatorio '{campo}'")

    titulo = str(noticia.get("titulo", "")).strip()
    descripcion = str(noticia.get("descripcion", "")).strip()
    cuerpo = str(noticia.get("cuerpo", "")).strip()
    categoria = str(noticia.get("categoria", "")).strip()
    pagina = str(noticia.get("pagina", "")).strip()

    if titulo:
        if len(titulo) < 20:
            avisos.append(f"{etiqueta}: titular muy corto")
        if len(titulo) > 95:
            errores.append(f"{etiqueta}: titular supera 95 caracteres")
        if "..." in titulo or "…" in titulo:
            errores.append(f"{etiqueta}: titular contiene puntos suspensivos")
        if titulo_truncado(titulo):
            errores.append(f"{etiqueta}: titular parece cortado o termina a medias: '{titulo}'")

    if descripcion:
        if len(descripcion) > 230:
            errores.append(f"{etiqueta}: descripción supera 230 caracteres")
        if not re.search(r"[.!?]$", descripcion):
            errores.append(f"{etiqueta}: descripción no termina como frase completa")
        if "..." in descripcion or "…" in descripcion:
            errores.append(f"{etiqueta}: descripción contiene puntos suspensivos")

    if cuerpo and len(cuerpo) < 80:
        avisos.append(f"{etiqueta}: cuerpo de noticia muy breve")

    if categoria and categoria not in CATEGORIAS_VALIDAS:
        errores.append(f"{etiqueta}: categoría no válida: '{categoria}'")

    if noticia.get("fecha") and not parsear_fecha(str(noticia.get("fecha"))):
        errores.append(f"{etiqueta}: fecha no válida: '{noticia.get('fecha')}'")

    for campo_url in ["enlace", "url"]:
        if noticia.get(campo_url) and not es_url_valida(str(noticia.get(campo_url))):
            errores.append(f"{etiqueta}: URL inválida en '{campo_url}': {noticia.get(campo_url)}")

    if pagina:
        ruta = BASE_DIR / pagina
        if not ruta.exists():
            errores.append(f"{etiqueta}: página generada no existe: {pagina}")
        else:
            html = ruta.read_text(encoding="utf-8", errors="ignore")
            if titulo and titulo not in html:
                avisos.append(f"{etiqueta}: la página no contiene literalmente el titular")
            errores.extend(validar_canonical(html, pagina, etiqueta))
            errores.extend(validar_json_ld_news_article(html, pagina, etiqueta))

        if sitemap and f"{SITE_URL}/{pagina}" not in sitemap:
            errores.append(f"{etiqueta}: página ausente en sitemap.xml: {pagina}")

    return errores, avisos


def validar_duplicados(noticias: list[dict]) -> tuple[list[str], list[str]]:
    errores: list[str] = []
    avisos: list[str] = []

    for campo in ["id", "url", "enlace", "pagina"]:
        valores = [str(n.get(campo, "")).strip() for n in noticias if str(n.get(campo, "")).strip()]
        repetidos = [valor for valor, total in Counter(valores).items() if total > 1]
        for valor in repetidos:
            errores.append(f"Duplicado en campo '{campo}': {valor}")

    titulos = defaultdict(list)
    for noticia in noticias:
        titulos[normalizar_texto(str(noticia.get("titulo", "")))].append(noticia)
    for normalizado, items in titulos.items():
        if normalizado and len(items) > 1:
            errores.append("Titular duplicado: " + items[0].get("titulo", normalizado))

    for i, a in enumerate(noticias):
        for b in noticias[i + 1:]:
            if a.get("url") == b.get("url") or a.get("id") == b.get("id"):
                continue
            similitud = similitud_jaccard(str(a.get("titulo", "")), str(b.get("titulo", "")))
            if similitud >= 0.78:
                avisos.append(
                    "Posible duplicado editorial: "
                    f"'{a.get('titulo')}' / '{b.get('titulo')}' ({similitud:.0%})"
                )

    return errores, avisos


def validar_fuentes() -> tuple[list[str], list[str]]:
    errores: list[str] = []
    avisos: list[str] = []

    if not FUENTES_FILE.exists():
        errores.append("Falta data/fuentes.json (registro de fuentes)")
        return errores, avisos

    try:
        fuentes = json.loads(FUENTES_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errores.append(f"JSON inválido en data/fuentes.json: {exc}")
        return errores, avisos

    if not isinstance(fuentes, list):
        errores.append("data/fuentes.json debe ser una lista")
        return errores, avisos

    ids_vistos: set[str] = set()
    for index, fuente in enumerate(fuentes):
        etiqueta = fuente.get("id") or fuente.get(
            "nombre") or f"fuente #{index + 1}"

        for campo in CAMPOS_FUENTE_OBLIGATORIOS:
            if not str(fuente.get(campo, "")).strip():
                errores.append(
                    f"{etiqueta}: falta el campo obligatorio '{campo}' en data/fuentes.json")

        nivel = fuente.get("nivel_confianza")
        if nivel and nivel not in NIVELES_CONFIANZA_VALIDOS:
            errores.append(
                f"{etiqueta}: nivel_confianza no válido '{nivel}' (debe ser A, B, C o D)")

        fuente_id = str(fuente.get("id", "")).strip()
        if fuente_id:
            if fuente_id in ids_vistos:
                errores.append(f"Id de fuente duplicado en data/fuentes.json: {fuente_id}")
            ids_vistos.add(fuente_id)

    if not any(f.get("activa", True) for f in fuentes):
        avisos.append("data/fuentes.json no tiene ninguna fuente activa")

    return errores, avisos


def validar_geografia() -> list[str]:
    if not GEOGRAFIA_FILE.exists():
        return ["Falta data/geografia.json (filtro geográfico compartido)"]

    try:
        geografia = json.loads(GEOGRAFIA_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"JSON inválido en data/geografia.json: {exc}"]

    if not isinstance(geografia, dict):
        return ["data/geografia.json debe ser un objeto"]
    if not str(geografia.get("municipio_principal", "")).strip():
        return ["data/geografia.json no define 'municipio_principal'"]

    return []


def validar_avisos_oficiales() -> list[str]:
    """Validación ligera: solo estructura (JSON válido, lista). No valida campo
    a campo todavía; una única fuente de este tipo no lo justifica aún."""
    if not AVISOS_OFICIALES_FILE.exists():
        return []

    try:
        avisos = json.loads(AVISOS_OFICIALES_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"JSON inválido en data/avisos-oficiales.json: {exc}"]

    if not isinstance(avisos, list):
        return ["data/avisos-oficiales.json debe ser una lista"]

    return []


def validar_boletin_oficial() -> list[str]:
    """Validación ligera: solo estructura (JSON válido, lista). Igual criterio
    que validar_avisos_oficiales(): una única fuente de este tipo no
    justifica todavía una validación campo a campo."""
    if not BOLETIN_OFICIAL_FILE.exists():
        return []

    try:
        edictos = json.loads(BOLETIN_OFICIAL_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return [f"JSON inválido en data/boletin-oficial.json: {exc}"]

    if not isinstance(edictos, list):
        return ["data/boletin-oficial.json debe ser una lista"]

    return []


def main() -> int:
    errores: list[str] = []
    avisos: list[str] = []

    if not NEWS_FILE.exists():
        print(f"ERROR: no existe {NEWS_FILE.relative_to(BASE_DIR)}")
        return 1

    try:
        noticias = json.loads(NEWS_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: JSON inválido en {NEWS_FILE}: {exc}")
        return 1

    if not isinstance(noticias, list):
        print("ERROR: data/noticias.json debe ser una lista")
        return 1

    if not noticias:
        print("ERROR: data/noticias.json no contiene noticias")
        return 1

    sitemap = SITEMAP_FILE.read_text(encoding="utf-8", errors="ignore") if SITEMAP_FILE.exists() else ""
    if not sitemap:
        avisos.append("No se ha encontrado sitemap.xml; no se validará presencia en sitemap")

    for index, noticia in enumerate(noticias):
        if not isinstance(noticia, dict):
            errores.append(f"Elemento #{index + 1}: debe ser un objeto JSON")
            continue
        e, a = validar_noticia(noticia, index, sitemap)
        errores.extend(e)
        avisos.extend(a)

    e, a = validar_duplicados(noticias)
    errores.extend(e)
    avisos.extend(a)

    for noticia in noticias:
        if isinstance(noticia, dict) and noticia.get("requiere_revision_geografica"):
            etiqueta = noticia.get("id") or noticia.get("titulo") or "noticia"
            avisos.append(
                f"{etiqueta}: requiere revisión geográfica (menciona un municipio limítrofe junto al principal)")

    e, a = validar_fuentes()
    errores.extend(e)
    avisos.extend(a)

    errores.extend(validar_geografia())
    errores.extend(validar_avisos_oficiales())
    errores.extend(validar_boletin_oficial())

    print(f"Noticias revisadas: {len(noticias)}")
    print(f"Errores: {len(errores)}")
    print(f"Avisos: {len(avisos)}")

    if avisos:
        print("\nAVISOS")
        for aviso in avisos:
            print(f"- {aviso}")

    if errores:
        print("\nERRORES")
        for error in errores:
            print(f"- {error}")
        return 1

    print("\nValidación correcta: contenido listo para publicar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
