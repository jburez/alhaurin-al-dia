"""Reglas de calidad editorial compartidas (Fase 2), fuente única en
data/reglas-editoriales.json.

Antes de esto, tres ficheros distintos (validar_contenido.py,
generar_noticias_seguro.py, generar_noticias.py) mantenían cada uno su
propia lista de "palabras que dejan un titular colgado", divergentes entre
sí y con huecos reales (ninguna cubría posesivos como "su"/"sus" ni verbos
conjugados sin complemento como "puedan" -- el patrón exacto que producía
titulares truncados en producción). Este módulo es la única definición;
scripts/lib/editorial_rules.js es su equivalente para el lado Node
(dedupe-news.js, audit-seo.js), mismo patrón que scripts/lib/nav.py/nav.js.
"""

from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any

REGLAS_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "reglas-editoriales.json"


@lru_cache(maxsize=1)
def _cargar_reglas() -> dict[str, Any]:
    return json.loads(REGLAS_FILE.read_text(encoding="utf-8"))


def _set(clave: str) -> set[str]:
    return set(_cargar_reglas()[clave])


def _lista(clave: str) -> list[str]:
    return list(_cargar_reglas()[clave])


def umbral(nombre: str) -> float:
    return _cargar_reglas()["umbrales"][nombre]


def normalizar_texto(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = texto.lower()
    texto = re.sub(r"[^a-z0-9áéíóúñ]+", " ", texto)
    return re.sub(r"\s+", " ", texto).strip()


def tokens_significativos(texto: str) -> set[str]:
    stopwords = _set("stopwords_jaccard")
    return {t for t in normalizar_texto(texto).split() if len(t) > 3 and t not in stopwords}


def similitud_jaccard(a: str, b: str) -> float:
    ta = tokens_significativos(a)
    tb = tokens_significativos(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def entidades_relevantes(entidades: list[str]) -> list[str]:
    """Filtra vocabulario institucional genérico (ayuntamiento, subvenciones,
    obras...) de una lista de entidades -- compartir esas palabras nunca es,
    por sí solo, señal de mismo acontecimiento (ver data/reglas-editoriales.json,
    stopwords_entidades)."""
    genericas = _set("stopwords_entidades")
    return [e for e in entidades if normalizar_texto(e) not in genericas]


_ACRONIMO = re.compile(r"\b[A-ZÁÉÍÓÚÑ]{2,}\b")
_CONECTOR_ENTIDAD = r"(?:de|del|la|el|las|los)"
_ENTIDAD_COMPUESTA = re.compile(
    rf"[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{{2,}}(?:\s+(?:{_CONECTOR_ENTIDAD}\s+)*[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{{2,}})*"
)
_CONECTORES_ENTIDAD_SET = {"de", "del", "la", "el", "las", "los"}


def extraer_entidades(titulo: str, cuerpo: str = "") -> list[str]:
    """Extracción HEURÍSTICA de candidatas a entidad, sin IA (task #16):
    deduplicadas por forma normalizada. Deliberadamente ingenua -- no
    pretende ser NER real, basta para candidate retrieval por solapamiento
    de conjuntos (ver event_classification.py). Cubre tres formas, cada
    una con su propio umbral de longitud mínima (los acrónimos son
    legítimamente cortos -- "PP", "IU" -- así que NO comparten el mínimo
    de 4 caracteres de las entidades normales/compuestas):

    - Acrónimos/siglas en mayúsculas (mínimo 2 caracteres): "PSOE", "PP",
      "IU", "VOX", "AEMET", "DGT", "UMA".
    - Entidades compuestas con conectores internos pequeños (de/del/la/el/
      las/los) entre componentes de nombre propio (mínimo 4 caracteres):
      "Alhaurín el Grande", "Junta de Andalucía", "Sierra de las Nieves".
    - Nombres compuestos sin conector (mínimo 4 caracteres): "Guardia
      Civil", "Plaza Baja".

    De cada entidad compuesta de varias palabras se conservan TAMBIÉN sus
    componentes individuales relevantes (p. ej. de "Junta de Andalucía" se
    guardan además "Junta" y "Andalucía") -- mejora el recall del
    solapamiento cuando dos fuentes nombran la misma entidad con distinto
    nivel de detalle.

    Limitación conocida y ACEPTADA para esta tarea (no se resuelve aquí):
    cuando un prefijo institucional se encadena directamente con un
    topónimo compuesto ("Ayuntamiento de Alhaurín el Grande"), el regex
    encadena TODO en una única entidad larga -- el sub-compuesto de en
    medio ("Alhaurín el Grande") nunca se extrae como unidad propia, solo
    sus componentes sueltos de una palabra (Ayuntamiento, Alhaurín,
    Grande). No se generan sub-ventanas/n-gramas internos deliberadamente
    (más complejidad, más entidades espurias) mientras el solapamiento de
    entidades sea una señal y no un hard gate: los componentes sueltos ya
    garantizan solapamiento con un artículo que mencione el topónimo sin
    el prefijo. Si el shadow run (scripts/shadow_editorial_pipeline.py)
    muestra que esto perjudica el recall en casos reales, se revisita.

    Limitación conocida y aceptada: una palabra capitalizada de 4+ letras
    al inicio de frase que NO es un nombre propio (p. ej. "Durante",
    "Finalmente") puede colarse como candidata suelta -- no hay forma
    barata de distinguirlo sin NER real. No es grave: a partir de esta
    tarea, el solapamiento de entidades NO es una condición obligatoria
    para candidate retrieval (ver candidatos_relacionados() en
    event_classification.py), solo una señal más reportada -- un falso
    positivo aquí diluye la señal, no descarta candidatos legítimos."""
    texto = f"{titulo or ''} {cuerpo or ''}"
    vistas_norm: set[str] = set()
    resultado: list[str] = []

    def _agregar(candidata: str, min_len: int) -> None:
        norm = normalizar_texto(candidata)
        if not norm or len(norm) < min_len or norm in vistas_norm:
            return
        vistas_norm.add(norm)
        resultado.append(candidata)

    for match in _ENTIDAD_COMPUESTA.finditer(texto):
        compuesta = match.group(0)
        _agregar(compuesta, min_len=4)
        palabras = compuesta.split()
        if len(palabras) > 1:
            for palabra in palabras:
                if palabra.lower() not in _CONECTORES_ENTIDAD_SET:
                    _agregar(palabra, min_len=4)

    for match in _ACRONIMO.finditer(texto):
        _agregar(match.group(0), min_len=2)

    return resultado


def titulo_truncado(titulo: str) -> bool:
    """True si el titular termina de forma que deja una idea a medias:
    puntos suspensivos, comillas sin cerrar, o la última palabra es una
    preposición/conjunción/posesivo/verbo-sin-complemento conocido."""
    titulo = (titulo or "").strip()
    if not titulo:
        return True

    if "..." in titulo or "…" in titulo:
        return True

    if titulo.count("‘") != titulo.count("’"):
        return True
    if titulo.count("“") != titulo.count("”"):
        return True
    if titulo.count('"') % 2 != 0:
        return True

    if titulo[-1] in {"‘", "“", ",", ";", ":"}:
        return True

    normalizado = normalizar_texto(titulo)
    if not normalizado:
        return True

    ultima = normalizado.split()[-1]
    return ultima in _set("terminales_incompletos")


def ultima_palabra_incompleta(texto: str) -> bool:
    """Solo la comprobación de última palabra de titulo_truncado(), sin los
    chequeos de puntos suspensivos/comillas -- útil para bucles de recorte
    palabra a palabra (ver generar_titulo_seo()/titular_desde_tema())."""
    normalizado = normalizar_texto(texto)
    if not normalizado:
        return False
    return normalizado.split()[-1] in _set("terminales_incompletos")


def titulo_empieza_sospechoso(titulo: str) -> bool:
    """True si el titular empieza con un conector propio del cuerpo de una
    noticia ("Sin embargo...", "El objetivo es...") -- señal de que es una
    frase extraída del cuerpo, no un titular editorial. No descarta por sí
    sola (ver evaluar_titulo), solo resta puntos."""
    normalizado = normalizar_texto(titulo or "")
    return any(normalizado.startswith(conector) for conector in _lista("conectores_inicio_sospechoso"))


def _sin_entidad_reconocible(titulo: str) -> bool:
    """True si el titular no nombra ninguna entidad propia (ninguna palabra
    en mayúscula salvo la primera) -- señal de 'referencia sin contexto':
    frases como 'ambas administraciones' o 'esta iniciativa' que dependen
    del párrafo anterior en vez de nombrar quién/qué concreto."""
    palabras = (titulo or "").split()
    if len(palabras) < 2:
        return True
    return not any(p and p[0].isupper() for p in palabras[1:])


def _pocas_palabras_utiles(titulo: str) -> bool:
    """True si, tras quitar stopwords, quedan muy pocas palabras con
    contenido real -- titular demasiado vacío de información propia."""
    return len(tokens_significativos(titulo)) < 4


def evaluar_titulo(titulo: str, cuerpo: str = "") -> dict[str, Any]:
    """Puntuación de calidad de titular combinando varias señales (no un
    true/false binario). score empieza en 100 y cada señal negativa resta.
    aceptable = score >= umbral configurado en data/reglas-editoriales.json."""
    titulo = (titulo or "").strip()
    señales: dict[str, Any] = {}
    score = 100.0

    if not titulo:
        return {"score": 0.0, "señales": {"vacio": True}, "aceptable": False}

    longitud = len(titulo)
    min_len = umbral("titulo_longitud_min")
    max_len = umbral("titulo_longitud_max")
    señales["longitud"] = longitud
    if longitud < min_len:
        score -= (min_len - longitud) * 2
    elif longitud > max_len:
        score -= (longitud - max_len) * 1.5

    señales["truncado"] = titulo_truncado(titulo)
    if señales["truncado"]:
        score -= 50

    # inicio_sospechoso es la señal más fiable de las dos de contexto (un
    # conector de cuerpo al principio es casi siempre indicio real de frase
    # extraída), así que carga más peso -- pero -35 por sí sola nunca baja
    # de 65, por debajo del umbral solo si se combina con otra señal.
    señales["inicio_sospechoso"] = titulo_empieza_sospechoso(titulo)
    if señales["inicio_sospechoso"]:
        score -= 35

    # sin_entidad es un proxy débil y ruidoso (capitalización no es un
    # detector fiable de entidad: hay titulares legítimos sin nombre propio,
    # y la IA no siempre capitaliza bien) -- peso bajo a propósito, no debe
    # poder rechazar un titular por sí sola.
    señales["sin_entidad"] = _sin_entidad_reconocible(titulo)
    if señales["sin_entidad"]:
        score -= 10

    señales["pocas_palabras_utiles"] = _pocas_palabras_utiles(titulo)
    if señales["pocas_palabras_utiles"]:
        score -= 15

    score = max(0.0, min(100.0, score))
    return {
        "score": round(score, 1),
        "señales": señales,
        "aceptable": score >= umbral("quality_score_aceptable"),
    }
