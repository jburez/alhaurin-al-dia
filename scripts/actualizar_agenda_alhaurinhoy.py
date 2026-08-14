#!/usr/bin/env python3
"""Actualiza data/agenda-local.json con eventos de alhaurinhoy.es.

Fuente: WordPress REST API (plugin eventON)
Endpoint: https://www.alhaurinhoy.es/wp-json/wp/v2/ajde_events
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from datetime import datetime
from html import unescape
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
AGENDA_PATH = ROOT / "data" / "agenda-local.json"
TIMEZONE = ZoneInfo("Europe/Madrid")

API_URL = "https://www.alhaurinhoy.es/wp-json/wp/v2/ajde_events"
PER_PAGE = 30


def strip_html(text: str) -> str:
    text = unescape(text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[-\s]+", "-", text).strip("-")


def extract_date_from_content(content: str) -> str | None:
    """Try to extract a date from the event content text."""
    text = strip_html(content)

    # Pattern: "📅 Sábado 15 de agosto" or "Sábado 8 · Sprint a las 17:00"
    meses = {
        "enero": "01", "febrero": "02", "marzo": "03", "abril": "04",
        "mayo": "05", "junio": "06", "julio": "07", "agosto": "08",
        "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12",
    }

    # "15 de agosto", "31 de julio"
    for m_name, m_num in meses.items():
        match = re.search(rf"(\d{{1,2}})\s*de\s*{m_name}", text, re.IGNORECASE)
        if match:
            day = int(match.group(1))
            year = datetime.now().year
            return f"{year}-{m_num}-{day:02d}"

    return None


def extract_time_from_content(content: str) -> str | None:
    """Try to extract a time from the event content."""
    text = strip_html(content)

    # "a las 22.00h", "a las 17:00", "⏰ 11:00 horas", "desde las 11:00"
    match = re.search(r"(?:a las|desde las|⏰)\s*(\d{1,2})[:.h](\d{2})", text)
    if match:
        return f"{int(match.group(1)):02d}:{match.group(2)}"
    # "a las 22h"
    match = re.search(r"a las\s*(\d{1,2})\s*h", text, re.IGNORECASE)
    if match:
        return f"{int(match.group(1)):02d}:00"
    return None


def guess_category(title: str, content: str) -> tuple[str, str]:
    """Guess icon and category from title/content."""
    combined = f"{title} {content}".lower()

    if any(w in combined for w in ["music", "músic", "dj", "concert", "🎶", "🎸", "🎙"]):
        return "🎵", "Música en vivo"
    if any(w in combined for w in ["procesión", "procesion", "virgen", "triduo", "ofrenda", "hermandad"]):
        return "⛪", "Religioso"
    if any(w in combined for w in ["fútbol", "futbol", "⚽", "moto gp", "🏍", "deporte"]):
        return "⚽", "Deportes"
    if any(w in combined for w in ["brunch", "gastro", "ruta", "tomate", "🍽", "🍅"]):
        return "🍽️", "Gastronomía"
    if any(w in combined for w in ["dance", "fiesta", "verbena"]):
        return "🎉", "Ocio"
    return "📅", "Evento"


def fetch_events() -> list[dict[str, Any]]:
    """Fetch events from alhaurinhoy.es REST API."""
    url = f"{API_URL}?per_page={PER_PAGE}&_fields=id,title,link,date,content"
    headers = {
        "User-Agent": "Mozilla/5.0 (AlhaurinAlDia/1.0)",
        "Accept": "application/json",
    }

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as e:
        print(f"⚠️  Error fetching alhaurinhoy.es: {e}", file=sys.stderr)
        return []

    print(f"📅 {len(data)} eventos obtenidos de alhaurinhoy.es")
    return data


def normalize_event(raw: dict[str, Any]) -> dict[str, Any]:
    """Convert API event to agenda-local.json format."""
    title = strip_html(raw.get("title", {}).get("rendered", "Evento"))
    content = raw.get("content", {}).get("rendered", "")
    content_text = strip_html(content)
    link = raw.get("link", "")
    pub_date = raw.get("date", "")

    icon, tipo = guess_category(title, content_text)

    # Extract date from content, fallback to published date
    event_date = extract_date_from_content(content) or pub_date[:10]
    event_time = extract_time_from_content(content)

    # Build ISO datetime
    if event_time:
        inicio = f"{event_date}T{event_time}:00+02:00"
    else:
        inicio = f"{event_date}T20:00:00+02:00"  # Default to 20:00

    # Description: first 200 chars of content
    desc = content_text[:200].strip()
    if len(content_text) > 200:
        desc = desc[:197] + "..."

    event_id = f"alhaurinhoy-{raw.get('id', slugify(title))}"

    return {
        "id": event_id,
        "tipo": tipo,
        "icono": icon,
        "titulo": title,
        "descripcion": desc,
        "lugar": "",
        "inicio": inicio,
        "fin": "",
        "estado": "neutral",
        "cta": "Ver en alhaurinhoy.es",
        "url": link,
        "activo": True,
        "fuente": "alhaurinhoy",
    }


def merge_events(
    existing: list[dict[str, Any]],
    new_events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge new events with existing, dedup by ID."""
    existing_ids = {e["id"] for e in existing}
    added = 0
    for ev in new_events:
        if ev["id"] not in existing_ids:
            existing.append(ev)
            existing_ids.add(ev["id"])
            added += 1

    # Sort by start date
    existing.sort(key=lambda e: e.get("inicio", "9999"))

    print(f"  → {added} eventos nuevos de alhaurinhoy.es añadidos")
    print(f"  → {len(existing)} eventos totales en agenda")
    return existing


def main() -> int:
    now = datetime.now(TIMEZONE)
    print(f"🗓️  Importando eventos de alhaurinhoy.es — {now.strftime('%d/%m/%Y %H:%M')}")

    # 1. Fetch
    raw_events = fetch_events()
    if not raw_events:
        print("ℹ️  Sin eventos. No se realizan cambios.")
        return 0

    # 2. Normalize
    api_events = [normalize_event(e) for e in raw_events]

    # 3. Load existing agenda
    current: dict[str, Any] = {}
    if AGENDA_PATH.exists():
        current = json.loads(AGENDA_PATH.read_text("utf-8"))
    existing = current.get("eventos", [])

    # 4. Merge
    merged = merge_events(existing, api_events)

    # 5. Save
    output = {
        "actualizado": now.isoformat(),
        "resumen": f"Agenda local de Alhaurín el Grande. {len(merged)} eventos próximos.",
        "ical_url": current.get("ical_url", ""),
        "eventos": merged,
    }

    AGENDA_PATH.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"✅ Agenda guardada en {AGENDA_PATH.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
