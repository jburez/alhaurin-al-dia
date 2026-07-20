#!/usr/bin/env python3
"""Validación editorial y técnica para Alhaurín al Día.

Comprueba el JSON de noticias, páginas generadas y sitemap antes de publicar.
No usa dependencias externas para que pueda ejecutarse en GitHub Actions.
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent
NEWS_FILE = BASE_DIR / "data" / "noticias.json"
FUENTES_FILE = BASE_DIR / "data" / "fuentes.json"
GEOGRAFIA_FILE = BASE_DIR / "data" / "geografia.json"
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

TERMINALES_SOSPECHOSOS = {
    "a", "al", "ante", "bajo", "con", "contra", "de", "del", "desde", "durante",
    "el", "en", "entre", "hacia", "hasta", "la", "las", "los", "para", "por",
    "que", "según", "sin", "sobre", "tras", "un", "una", "y", "o",
}

STOPWORDS = {
    "alhaurin", "alhaurín", "grande", "el", "la", "los", "las", "de", "del", "y",
    "en", "con", "por", "para", "un", "una", "sobre", "2026", "al",
}


def normalizar_texto(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = texto.lower()
    texto = re.sub(r"[^a-z0-9áéíóúñ]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def tokens_significativos(texto: str) -> set[str]:
    return {t for t in normalizar_texto(texto).split() if len(t) > 3 and t not in STOPWORDS}


def similitud_jaccard(a: str, b: str) -> float:
    ta = tokens_significativos(a)
    tb = tokens_significativos(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


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


def termina_a_medias(titulo: str) -> bool:
    limpio = titulo.strip(" .,:;¡!¿?").lower()
    ultima = limpio.split()[-1] if limpio.split() else ""
    if ultima in TERMINALES_SOSPECHOSOS:
        return True
    if titulo.count("‘") != titulo.count("’"):
        return True
    if titulo.count("\"") % 2 != 0:
        return True
    return False


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
        if termina_a_medias(titulo):
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
        elif titulo and titulo not in ruta.read_text(encoding="utf-8", errors="ignore"):
            avisos.append(f"{etiqueta}: la página no contiene literalmente el titular")

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
