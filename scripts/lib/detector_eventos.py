"""Detección heurística de eventos en entradas de feeds RSS.

Lo usa `generar_noticias.py --modo agenda`: cuando una entrada de un feed
parece anunciar un evento (palabra clave + fecha futura en el texto), en vez
de publicarse como noticia se guarda como BORRADOR en
data/agenda_borradores.json. Los borradores nunca se publican solos: una
persona debe revisarlos y pasarlos a data/agenda-local.json a mano.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import date, datetime, timezone
from pathlib import Path

PALABRAS_EVENTO = [
    "concierto", "feria", "taller", "procesion", "convocatoria", "festival",
    "exposicion", "jornada", "jornadas", "certamen", "romeria", "verbena",
    "actuacion", "representacion", "teatro", "cine de verano", "charla",
    "conferencia", "presentacion del libro", "inscripcion", "inscripciones",
    "ruta", "carrera popular", "torneo", "campeonato", "mercadillo", "zambomba",
    "cabalgata", "belen viviente", "gala", "recital", "muestra", "fiesta",
]

MESES = {
    "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
    "julio": 7, "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10,
    "noviembre": 11, "diciembre": 12,
}

_RE_FECHA_TEXTO = re.compile(
    r"\b(\d{1,2})\s+de\s+(" + "|".join(MESES) + r")(?:\s+(?:de|del)\s+(\d{4}))?\b"
)
_RE_FECHA_NUM = re.compile(r"\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b")


def _normalizar(texto: str) -> str:
    texto = unicodedata.normalize("NFKD", texto or "")
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", texto.lower())


def palabras_clave(texto: str) -> list[str]:
    norm = _normalizar(texto)
    return [p for p in PALABRAS_EVENTO if re.search(r"\b" + re.escape(p) + r"\b", norm)]


def _construir_fecha(dia: int, mes: int, anio: int | None, hoy: date) -> date | None:
    if anio:
        try:
            return date(anio, mes, dia)
        except ValueError:
            return None
    try:
        f = date(hoy.year, mes, dia)
    except ValueError:
        return None
    # Sin año: si ya pasó hace poco (≤ 90 días) se entiende que es una fecha
    # pasada de este año (crónica de algo ya celebrado); si no, el año que viene.
    if f >= hoy or (hoy - f).days <= 90:
        return f
    try:
        return date(hoy.year + 1, mes, dia)
    except ValueError:
        return None


def fechas_futuras(texto: str, hoy: date | None = None) -> list[date]:
    hoy = hoy or date.today()
    norm = _normalizar(texto)
    fechas: set[date] = set()
    for m in _RE_FECHA_TEXTO.finditer(norm):
        anio = int(m.group(3)) if m.group(3) else None
        f = _construir_fecha(int(m.group(1)), MESES[m.group(2)], anio, hoy)
        if f:
            fechas.add(f)
    for m in _RE_FECHA_NUM.finditer(norm):
        dia, mes = int(m.group(1)), int(m.group(2))
        if not (1 <= mes <= 12 and 1 <= dia <= 31):
            continue
        anio = m.group(3)
        anio_int = (2000 + int(anio) if len(anio) == 2 else int(anio)) if anio else None
        f = _construir_fecha(dia, mes, anio_int, hoy)
        if f:
            fechas.add(f)
    # Solo fechas futuras y razonablemente cercanas (≤ 1 año).
    return sorted(f for f in fechas if hoy <= f and (f - hoy).days <= 366)


def es_evento(titulo: str, texto: str, hoy: date | None = None) -> tuple[bool, list[str], list[date]]:
    """True si hay al menos una palabra clave de evento y una fecha futura."""
    completo = f"{titulo}. {texto}"
    claves = palabras_clave(completo)
    fechas = fechas_futuras(completo, hoy)
    return bool(claves and fechas), claves, fechas


def construir_borrador(titulo: str, texto: str, url: str, fuente: str, claves: list[str], fechas: list[date]) -> dict:
    ident = hashlib.sha1((url or titulo).encode("utf-8")).hexdigest()[:12]
    return {
        "id": f"borrador-{ident}",
        "estado": "borrador",
        "titulo": titulo,
        "fecha_inicio_detectada": fechas[0].isoformat() if fechas else "",
        "fechas_detectadas": [f.isoformat() for f in fechas],
        "palabras_clave": claves,
        "texto_fuente": texto[:600],
        "fuente": fuente,
        "url_fuente": url,
        "detectado_en": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "_nota": "Borrador automático: revisar y completar a mano antes de pasarlo a data/agenda-local.json.",
    }


def guardar_borradores(ruta: Path, nuevos: list[dict]) -> int:
    """Fusiona `nuevos` con los borradores ya guardados (sin duplicar por id).
    Devuelve cuántos borradores nuevos se añadieron."""
    try:
        existentes = json.loads(ruta.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        existentes = {"_descripcion": "", "borradores": []}
    lista = existentes.get("borradores", [])
    ids = {b.get("id") for b in lista}
    añadidos = 0
    for b in nuevos:
        if b["id"] in ids:
            continue
        lista.append(b)
        ids.add(b["id"])
        añadidos += 1
    existentes["_descripcion"] = (
        "Eventos detectados automáticamente en los feeds (generar_noticias.py --modo agenda). "
        "NUNCA se publican solos: revisar, completar y copiar a data/agenda-local.json."
    )
    existentes["borradores"] = lista
    ruta.write_text(json.dumps(existentes, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return añadidos
