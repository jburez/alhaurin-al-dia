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
from validar_contenido import termina_a_medias  # noqa: E402

MAX_TITULO = 90
MAX_DESCRIPCION = 230


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
    ]
    return any(re.search(patron, normalizado) for patron in patrones)


def primer_trozo_util(textos: Iterable[str]) -> str:
    for texto in textos:
        limpio = limpiar_html(texto)
        frases = re.split(r"(?<=[.!?])\s+", limpio)
        for frase in frases:
            frase = limpiar_titulo_basico(frase)
            if 25 <= len(frase) <= MAX_TITULO and not termina_a_medias(frase):
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
        if candidato and len(candidato) >= 25 and not termina_a_medias(candidato):
            return candidato

    return ""



TERMINALES_TITULAR_INCOMPLETO = {
    "a", "al", "ante", "bajo", "con", "contra", "de", "del", "desde", "durante",
    "el", "en", "entre", "hacia", "hasta", "la", "las", "los", "para", "por",
    "que", "según", "sin", "sobre", "tras", "un", "una", "y", "o",
    "impulsar", "presentar", "celebrar", "organizar", "convocar", "abrir",
}


def titulo_incompleto(titulo: str) -> bool:
    titulo = limpiar_html(titulo).strip()
    if not titulo:
        return True

    if "..." in titulo or "…" in titulo:
        return True

    # Comillas abiertas
    if titulo.count("‘") != titulo.count("’"):
        return True
    if titulo.count("“") != titulo.count("”"):
        return True
    if titulo.count('"') % 2 != 0:
        return True

    # Final raro o claramente truncado
    normalizado = normalizar_para_comparar(titulo)
    if not normalizado:
        return True

    ultima = normalizado.split()[-1]
    if ultima in TERMINALES_TITULAR_INCOMPLETO:
        return True

    # Si termina sin puntuación no siempre es error en titulares, pero sí si queda una comilla abierta o preposición
    if titulo[-1] in {"‘", "“", ",", ";", ":"}:
        return True

    return termina_a_medias(titulo)


def sanear_titulo(noticia: dict) -> str:
    titulo = limpiar_titulo_basico(noticia.get("titulo", ""))
    if titulo and not titulo_generico(titulo) and not titulo_incompleto(titulo):
        return titulo

    rescate = construir_titulo_rescate(noticia)
    if rescate and not titulo_incompleto(rescate):
        return rescate

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
    return all(str(noticia.get(campo, "")).strip() for campo in campos_minimos)


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


def generar_noticias_seguras() -> list[dict]:
    noticias = obtener_noticias()
    saneadas: list[dict] = []

    for noticia in noticias:
        saneada = sanear_noticia(noticia)
        if saneada:
            saneadas.append(saneada)

    return deduplicar_noticias(saneadas)



def main() -> int:
    noticias = generar_noticias_seguras()
    if not noticias:
        print("ERROR: no hay noticias publicables tras el saneado editorial")
        return 1

    guardar_noticias(noticias)
    # El sitemap real (multi-sección: noticias, farmacias, servicios, Google News)
    # lo genera scripts/generate-sitemaps.js más adelante en `npm run build`.
    print(f"Noticias seguras publicadas: {len(noticias)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
