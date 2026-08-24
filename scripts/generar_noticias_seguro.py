#!/usr/bin/env python3
"""Generador seguro de noticias para Alhaurín al Día.

Envuelve `scripts/generar_noticias.py` y aplica una capa final de calidad editorial
antes de escribir `data/noticias.json` y las páginas HTML generadas.

Objetivo:
- evitar titulares cortados;
- evitar entradillas incompletas;
- filtrar duplicados editoriales;
- no publicar entradas con datos mínimos insuficientes.
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path
from typing import Iterable

# Permite ejecutar el script tanto desde la raíz como desde scripts/.
BASE_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = BASE_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from generar_noticias import (  # noqa: E402
    CATEGORIAS_VALIDAS,
    detectar_categoria,
    dividir_parrafos,
    generar_titulo_seo,
    guardar_noticias,
    limpiar_html,
    normalizar_frase_completa,
    obtener_noticias,
)
from lib.editorial_rules import evaluar_titulo, titulo_truncado  # noqa: E402

MAX_TITULO = 90
MAX_DESCRIPCION = 230
MIN_DESCRIPCION = 40  # mismo umbral que exige scripts/audit-seo.js para la meta description


def normalizar_para_comparar(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = texto.lower()
    texto = re.sub(r"[^a-z0-9áéíóúñ]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def recortar_en_palabra(texto: str, limite: int) -> str:
    texto = limpiar_html(texto).strip()
    if len(texto) <= limite:
        return texto
    recorte = texto[:limite].rsplit(" ", 1)[0].strip(" .,:;¡!¿?\"'“”‘’")
    return recorte


def limpiar_titulo_basico(titulo: str) -> str:
    titulo = limpiar_html(titulo)
    titulo = titulo.replace("...", " ").replace("…", " ")
    titulo = re.sub(r"\s+", " ", titulo).strip(" .,:;¡!¿?")
    return recortar_en_palabra(titulo, MAX_TITULO)


def titulo_generico(titulo: str) -> bool:
    normalizado = normalizar_para_comparar(titulo)
    patrones = [
        r"^noticias atv",
        r"^informativo atv",
        r"^actualidad de alhaurin",
        r"^actualidad alhaurin",
        r"^noticias de alhaurin",
    ]
    return any(re.search(patron, normalizado) for patron in patrones)


def primer_trozo_util(textos: Iterable[str]) -> str:
    for texto in textos:
        limpio = limpiar_html(texto)
        frases = re.split(r"(?<=[.!?])\s+", limpio)
        for frase in frases:
            frase = limpiar_titulo_basico(frase)
            if 25 <= len(frase) <= MAX_TITULO and not titulo_truncado(frase):
                return frase
    return ""


def construir_titulo_rescate(noticia: dict) -> str:
    titulo_actual = noticia.get("titulo", "")
    titulo_original = noticia.get("titulo_original", "")
    descripcion = noticia.get("descripcion") or noticia.get("resumen") or ""
    cuerpo = noticia.get("cuerpo", "")
    fuente = noticia.get("fuente", "")

    candidatos = []

    # Si el título original no era genérico, suele ser la mejor vía de rescate.
    if titulo_original and not titulo_generico(titulo_original):
        candidatos.append(limpiar_titulo_basico(titulo_original))

    # Usar la misma heurística del generador base para títulos genéricos.
    candidatos.append(limpiar_titulo_basico(generar_titulo_seo(titulo_original, cuerpo or descripcion, fuente)))

    # Como último recurso, tomar una frase completa de la entradilla o cuerpo.
    frase_util = primer_trozo_util([descripcion, cuerpo, titulo_actual])
    if frase_util:
        candidatos.append(frase_util)

    for candidato in candidatos:
        if candidato and len(candidato) >= 25 and not titulo_truncado(candidato):
            return candidato

    return ""


def sanear_titulo(noticia: dict) -> str:
    """Quality gate de titular con segunda validación tras la regeneración.

    evaluar_titulo() combina varias señales en una puntuación, pero no todas
    pesan igual a propósito: una señal objetiva y fuerte como el
    truncamiento (comillas sin cerrar, termina en preposición/posesivo/verbo
    sin complemento...) puede hacer fallar el quality gate ella sola -- es
    intencionado, es un titular literalmente cortado. Las señales más
    heurísticas/contextuales (inicio_sospechoso, sin_entidad,
    pocas_palabras_utiles) están calibradas para no bastar solas y necesitar
    combinarse (ver lib/editorial_rules.py y los pesos ahí documentados).

    El único caso que se resuelve antes de puntuar es el de titular genérico
    (placeholders tipo "NOTICIAS ATV 20 agosto"): no es una cuestión de
    completitud lingüística, así que no tiene sentido puntuarlo, va directo
    a regeneración.
    """
    cuerpo = noticia.get("cuerpo", "")
    titulo = limpiar_titulo_basico(noticia.get("titulo", ""))

    if titulo and not titulo_generico(titulo):
        evaluacion = evaluar_titulo(titulo, cuerpo)
        if evaluacion["aceptable"]:
            return titulo

    # Regeneración (sin IA todavía -- la regeneración vía IA llega con la
    # tarea del registro editorial de Fase 2): construir_titulo_rescate()
    # prueba título original no genérico, heurística SEO, o una frase
    # completa de la entradilla/cuerpo.
    rescate = construir_titulo_rescate(noticia)
    if rescate:
        segunda_evaluacion = evaluar_titulo(rescate, cuerpo)
        if segunda_evaluacion["aceptable"]:
            return rescate

    # Ni el título original ni la regeneración superan el quality gate
    # combinado -- no hay más candidatos sin IA, no se publica (ver
    # sanear_noticia).
    return ""

def sanear_descripcion(noticia: dict) -> str:
    descripcion = noticia.get("descripcion") or noticia.get("resumen") or ""
    descripcion = descripcion.replace("...", ".").replace("…", ".")
    descripcion = normalizar_frase_completa(
        descripcion,
        fallback="Actualidad local de Alhaurín el Grande.",
        max_caracteres=MAX_DESCRIPCION,
    )
    return descripcion


def sanear_cuerpo(noticia: dict, descripcion: str) -> str:
    cuerpo = noticia.get("cuerpo") or descripcion
    cuerpo = cuerpo.replace("...", ".").replace("…", ".")
    parrafos = dividir_parrafos(cuerpo)
    if not parrafos:
        return descripcion
    cuerpo_limpio = "\n\n".join(parrafos[:3])
    if normalizar_para_comparar(cuerpo_limpio) == normalizar_para_comparar(descripcion):
        return descripcion
    return cuerpo_limpio


def noticia_publicable(noticia: dict) -> bool:
    campos_minimos = ["id", "titulo", "descripcion", "cuerpo", "fecha", "fuente", "categoria", "url"]
    if not all(str(noticia.get(campo, "")).strip() for campo in campos_minimos):
        return False
    # Fuentes sin descripción real de origen (p. ej. vídeos de YouTube sin
    # texto asociado) producen entradillas del tipo "Título." que pasan el
    # resto de comprobaciones pero no aportan valor editorial ni SEO.
    if len(str(noticia.get("descripcion", "")).strip()) < MIN_DESCRIPCION:
        return False
    return True


def sanear_noticia(noticia: dict) -> dict | None:
    noticia = dict(noticia)

    titulo = sanear_titulo(noticia)
    if not titulo:
        print(f"✗ Descartada por titular no recuperable: {noticia.get('titulo_original') or noticia.get('titulo')}")
        return None

    descripcion = sanear_descripcion(noticia)
    cuerpo = sanear_cuerpo(noticia, descripcion)
    categoria = noticia.get("categoria") or detectar_categoria(titulo, cuerpo, noticia.get("fuente", ""))
    if categoria not in CATEGORIAS_VALIDAS:
        categoria = detectar_categoria(titulo, cuerpo, noticia.get("fuente", ""))

    noticia["titulo"] = titulo
    noticia["descripcion"] = descripcion
    noticia["resumen"] = descripcion
    noticia["cuerpo"] = cuerpo
    noticia["categoria"] = categoria

    if not noticia_publicable(noticia):
        print(f"✗ Descartada por campos mínimos incompletos: {titulo}")
        return None

    return noticia


def deduplicar_noticias(noticias: list[dict]) -> list[dict]:
    resultado: list[dict] = []
    urls_vistas: set[str] = set()
    ids_vistos: set[str] = set()

    # Solo descarta duplicado exacto por URL/ID. La deduplicación fina por
    # similitud editorial (con ventana de fecha) vive únicamente en
    # scripts/dedupe-news.js (npm run news:dedupe), que se ejecuta justo
    # después de este generador en `npm run build` — mantenerla aquí también,
    # sin ventana de fecha, arriesgaba fusionar por error noticias distintas
    # que solo comparten vocabulario (p. ej. el mismo evento anual en años
    # distintos, ya que "2026" se trataba como stopword).
    for noticia in noticias:
        url = str(noticia.get("url") or noticia.get("enlace") or "").strip()
        noticia_id = str(noticia.get("id") or "").strip()
        titulo = str(noticia.get("titulo") or "")

        if url and url in urls_vistas:
            print(f"✗ Duplicada por URL: {titulo}")
            continue
        if noticia_id and noticia_id in ids_vistos:
            print(f"✗ Duplicada por ID: {titulo}")
            continue

        if url:
            urls_vistas.add(url)
        if noticia_id:
            ids_vistos.add(noticia_id)
        resultado.append(noticia)

    return resultado


def generar_noticias_seguras() -> tuple[list[dict], dict]:
    """Devuelve (noticias_finales, bookkeeping_por_id). bookkeeping_por_id
    puede traer ids de más (candidatas vistas por obtener_noticias() que
    sanear_noticia()/deduplicar_noticias() descartaron aquí) -- eso es
    aceptable, guardar_noticias() solo usa las entradas de los ids que
    realmente sobreviven en noticias_finales."""
    noticias, bookkeeping_por_id = obtener_noticias()
    saneadas: list[dict] = []

    for noticia in noticias:
        saneada = sanear_noticia(noticia)
        if saneada:
            saneadas.append(saneada)

    noticias_finales = deduplicar_noticias(saneadas)
    return noticias_finales, bookkeeping_por_id



def main() -> int:
    noticias, bookkeeping_por_id = generar_noticias_seguras()
    if not noticias:
        print("ERROR: no hay noticias publicables tras el saneado editorial")
        return 1

    guardar_noticias(noticias, bookkeeping_por_id)
    # El sitemap real (multi-sección: noticias, farmacias, servicios, Google News)
    # lo genera scripts/generate-sitemaps.js más adelante en `npm run build`.
    print(f"Noticias seguras publicadas: {len(noticias)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
