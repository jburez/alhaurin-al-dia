#!/usr/bin/env python3
"""Actualiza data/avisos-oficiales.json con los avisos activos de AEMET
para la zona Sol y Guadalhorce (incluye Alhaurín el Grande).

A diferencia de scripts/actualizar_tiempo_aemet.py, usa el feed RSS público
de avisos por zona: no requiere AEMET_API_KEY.

Mantiene un ciclo de vida por aviso (creado/actualizado/finalizado) en vez de
sobrescribir sin más: cada cambio de nivel o vigencia queda registrado en
`historial`, y un aviso que deja de aparecer en el feed se marca finalizado
en vez de desaparecer sin dejar rastro. Ver docs/ARQUITECTURA.md §14.

Si AEMET no responde, conserva el último data/avisos-oficiales.json válido y
sale con código 0, igual que scripts/actualizar_tiempo_aemet.py.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import feedparser

ROOT = Path(__file__).resolve().parents[1]
AVISOS_PATH = ROOT / "data" / "avisos-oficiales.json"
FEED_URL = "https://www.aemet.es/documentos_d/eltiempo/prediccion/avisos/rss/CAP_AFAZ612903_RSS.xml"
FUENTE_NOMBRE = "AEMET"
MAX_RETRIES = 3
DIAS_RETENER_FINALIZADOS = 30

CAMPOS_COMPARABLES = ["nivel", "titulo", "descripcion", "inicio", "fin"]

TITULO_AVISO = re.compile(
    r"^Aviso\.\s*Nivel\s+(?P<nivel>\w+)\.\s*(?P<fenomeno>.+?)\.\s*(?P<zona>.+)$")
VIGENCIA = re.compile(
    r"de\s+(?P<h1>\d{2}:\d{2})\s+(?P<d1>\d{2}-\d{2}-\d{4})\s+CES?T\s+\(UTC(?P<o1>[+-]\d+)\)"
    r"\s+a\s+(?P<h2>\d{2}:\d{2})\s+(?P<d2>\d{2}-\d{2}-\d{4})\s+CES?T\s+\(UTC(?P<o2>[+-]\d+)\)"
)


def log(mensaje: str) -> None:
    print(f"[avisos-aemet] {mensaje}")


def fetch_feed_once(url: str, timeout: int = 20) -> str:
    request = urllib.request.Request(url, headers={
        "User-Agent": "AlhaurinAlDia/1.0 (+https://alhaurinaldia.es)",
        "Accept": "application/rss+xml, application/xml, text/xml",
    })
    with urllib.request.urlopen(request, timeout=timeout) as response:  # nosec B310 - URL controlada
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset)


def fetch_feed(url: str, retries: int = MAX_RETRIES) -> str:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            return fetch_feed_once(url)
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
            last_error = exc
            if attempt == retries:
                break
            wait_seconds = attempt * 5
            log(f"Intento {attempt}/{retries} fallido: {exc}. Reintentando en {wait_seconds}s...")
            time.sleep(wait_seconds)
    raise RuntimeError(f"No se pudo obtener el feed de avisos AEMET: {last_error}")


def construir_fecha(hora: str, fecha: str, offset: str) -> str:
    dia, mes, anio = fecha.split("-")
    offset_int = int(offset)
    signo = "+" if offset_int >= 0 else "-"
    offset_fmt = f"{signo}{abs(offset_int):02d}:00"
    return f"{anio}-{mes}-{dia}T{hora}:00{offset_fmt}"


def extraer_vigencia(descripcion: str) -> tuple[str, str]:
    match = VIGENCIA.search(descripcion)
    if not match:
        return "", ""
    inicio = construir_fecha(match["h1"], match["d1"], match["o1"])
    fin = construir_fecha(match["h2"], match["d2"], match["o2"])
    return inicio, fin


def extraer_identificador(entry) -> str:
    """Id estable del aviso (independiente de la marca de tiempo de regeneración
    del feed, que cambia en cada publicación aunque el aviso sea el mismo)."""
    guid = str(entry.get("id") or entry.get("link") or "").strip()
    nombre_archivo = guid.rsplit("/", 1)[-1]
    sin_extension = re.sub(r"\.(xml|tar\.gz)$", "", nombre_archivo)
    return sin_extension.rsplit("_", 1)[-1] or sin_extension


def construir_aviso(entry) -> dict | None:
    titulo = str(entry.get("title", "")).strip()
    match = TITULO_AVISO.match(titulo)
    if not match:
        # No es un aviso individual (p. ej. "Estado completo de avisos para
        # Sol y Guadalhorce", el fichero .tar.gz resumen del feed).
        return None

    descripcion = str(entry.get("summary", entry.get("description", ""))).strip()
    inicio, fin = extraer_vigencia(descripcion)
    identificador = extraer_identificador(entry)

    return {
        "id": f"aemet-{identificador}",
        "tipo": "meteorologico",
        "nivel": match["nivel"].strip().lower(),
        "titulo": titulo,
        "descripcion": descripcion,
        "fenomeno": match["fenomeno"].strip(),
        "zona": match["zona"].strip(),
        "inicio": inicio,
        "fin": fin,
        "fuente": FUENTE_NOMBRE,
        "fuente_url": str(entry.get("link", FEED_URL)),
        "estado_ciclo_vida": "creado",
        "actualizado_en": "",
        "historial": [],
    }


def cargar_existentes() -> list[dict]:
    if not AVISOS_PATH.exists():
        return []
    try:
        datos = json.loads(AVISOS_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    return datos if isinstance(datos, list) else []


def snapshot(aviso: dict) -> dict:
    return {campo: aviso.get(campo) for campo in CAMPOS_COMPARABLES + ["estado_ciclo_vida", "actualizado_en"]}


def fusionar(existentes: list[dict], detectados: list[dict], ahora: str) -> list[dict]:
    por_id = {a["id"]: a for a in existentes}
    ids_detectados = {a["id"] for a in detectados}
    resultado: list[dict] = []

    for aviso in detectados:
        previo = por_id.get(aviso["id"])

        if previo is None:
            aviso["actualizado_en"] = ahora
            resultado.append(aviso)
            log(f"Nuevo aviso: {aviso['titulo']}")
            continue

        cambios = any(previo.get(campo) != aviso.get(campo) for campo in CAMPOS_COMPARABLES)
        if not cambios and previo.get("estado_ciclo_vida") != "finalizado":
            resultado.append(previo)
            continue

        aviso["historial"] = [*previo.get("historial", []), snapshot(previo)]
        aviso["estado_ciclo_vida"] = "actualizado"
        aviso["actualizado_en"] = ahora
        resultado.append(aviso)
        log(f"Aviso actualizado: {aviso['titulo']}")

    limite_poda = datetime.now(timezone.utc) - timedelta(days=DIAS_RETENER_FINALIZADOS)
    for aviso in existentes:
        if aviso["id"] in ids_detectados:
            continue

        if aviso.get("estado_ciclo_vida") == "finalizado":
            try:
                actualizado = datetime.fromisoformat(str(aviso.get("actualizado_en", "")))
            except ValueError:
                actualizado = None
            if actualizado and actualizado < limite_poda:
                log(f"Aviso podado (finalizado hace más de {DIAS_RETENER_FINALIZADOS} días): {aviso['titulo']}")
                continue
            resultado.append(aviso)
            continue

        finalizado = dict(aviso)
        finalizado["historial"] = [*aviso.get("historial", []), snapshot(aviso)]
        finalizado["estado_ciclo_vida"] = "finalizado"
        finalizado["actualizado_en"] = ahora
        resultado.append(finalizado)
        log(f"Aviso finalizado: {aviso['titulo']}")

    return resultado


def main() -> int:
    try:
        raw = fetch_feed(FEED_URL)
    except Exception as exc:
        log(f"No se pudo actualizar avisos AEMET: {exc}")
        log("Se conserva el último data/avisos-oficiales.json válido.")
        return 0

    feed = feedparser.parse(raw)
    detectados = [aviso for aviso in (construir_aviso(entry) for entry in feed.entries) if aviso]
    existentes = cargar_existentes()
    ahora = datetime.now(timezone.utc).isoformat(timespec="seconds")
    resultado = fusionar(existentes, detectados, ahora)

    AVISOS_PATH.parent.mkdir(parents=True, exist_ok=True)
    AVISOS_PATH.write_text(json.dumps(resultado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log(f"Avisos activos detectados: {len(detectados)}. Registros totales en el fichero: {len(resultado)}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
