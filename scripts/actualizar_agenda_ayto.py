#!/usr/bin/env python3
"""Actualiza data/agenda-local.json con los eventos oficiales del Ayuntamiento de Alhaurín el Grande.

Fuente: WordPress REST API – The Events Calendar
Endpoint: https://www.alhaurinelgrande.es/wp-json/tribe/events/v1/events
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

EVENTS_API = "https://www.alhaurinelgrande.es/wp-json/tribe/events/v1/events"
ICAL_URL = "https://www.alhaurinelgrande.es/eventos/?ical=1"

# Mapeo de categorías de eventos a iconos y tipos
CATEGORY_ICONS: dict[str, tuple[str, str]] = {
    "fiestas": ("🎉", "Fiestas"),
    "tradicion": ("⛪", "Tradiciones"),
    "cultura": ("🎭", "Cultura"),
    "deporte": ("⚽", "Deportes"),
    "musica": ("🎵", "Música"),
    "flamenco": ("💃", "Flamenco"),
    "teatro": ("🎭", "Teatro"),
    "cine": ("🎬", "Cine"),
    "gastronomia": ("🍽️", "Gastronomía"),
    "infantil": ("👶", "Infantil"),
    "juvenil": ("🧑‍🎤", "Juventud"),
    "formacion": ("📚", "Formación"),
    "empleo": ("💼", "Empleo"),
    "medio ambiente": ("🌿", "Medio Ambiente"),
    "turismo": ("🏔️", "Turismo"),
}

DEFAULT_ICON = "📅"
DEFAULT_TIPO = "Evento"


def strip_html(text: str) -> str:
    """Remove HTML tags and decode entities."""
    text = unescape(text)
    text = re.sub(r"<[^>]+>", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def slugify(text: str) -> str:
    """Create a URL-friendly slug."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[-\s]+", "-", text).strip("-")


def guess_icon_and_tipo(event: dict[str, Any]) -> tuple[str, str]:
    """Guess icon and tipo from event categories and title."""
    searchable = ""

    # Collect category names
    if "categories" in event:
        for cat in event["categories"]:
            searchable += " " + cat.get("name", "").lower()

    searchable += " " + event.get("title", "").lower()

    for keyword, (icon, tipo) in CATEGORY_ICONS.items():
        if keyword in searchable:
            return icon, tipo

    return DEFAULT_ICON, DEFAULT_TIPO


def fetch_events() -> list[dict[str, Any]]:
    """Fetch upcoming events from the Ayuntamiento API."""
    now = datetime.now(TIMEZONE)
    url = f"{EVENTS_API}?start_date={now.strftime('%Y-%m-%d')}&per_page=20&status=publish"

    headers = {
        "User-Agent": "Mozilla/5.0 (AlhaurinAlDia/1.0)",
        "Accept": "application/json",
    }

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            data = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as e:
        print(f"⚠️  Error fetching events API: {e}", file=sys.stderr)
        return []

    events = data.get("events", [])
    print(f"📅 {len(events)} eventos obtenidos de la API del Ayuntamiento")
    return events


def normalize_event(event: dict[str, Any]) -> dict[str, Any]:
    """Convert a Tribe Events API event to our agenda-local.json format."""
    icon, tipo = guess_icon_and_tipo(event)
    title = strip_html(event.get("title", "Evento"))
    event_id = f"ayto-{event.get('id', slugify(title))}"

    # Description: use excerpt or truncated description
    desc = strip_html(event.get("excerpt", "") or event.get("description", ""))
    if len(desc) > 200:
        desc = desc[:197] + "..."

    # Venue
    venue = ""
    if event.get("venue"):
        v = event["venue"]
        venue = v.get("venue", "")
        if v.get("address"):
            venue += f", {v['address']}"

    # Dates
    start = event.get("start_date", "")
    end = event.get("end_date", "")

    # Determine estado based on proximity
    estado = "neutral"
    try:
        start_dt = datetime.fromisoformat(start)
        now = datetime.now()
        diff_hours = (start_dt - now).total_seconds() / 3600
        if diff_hours < 0:
            estado = "ok"  # In progress
        elif diff_hours < 24:
            estado = "alert"  # Today
        elif diff_hours < 72:
            estado = "warning"  # Soon
    except (ValueError, TypeError):
        pass

    # URL
    url = event.get("url", "")

    return {
        "id": event_id,
        "tipo": tipo,
        "icono": icon,
        "titulo": title,
        "descripcion": desc,
        "lugar": venue,
        "inicio": start.replace(" ", "T") + "+02:00" if "T" not in start and start else start,
        "fin": end.replace(" ", "T") + "+02:00" if "T" not in end and end else end,
        "estado": estado,
        "cta": "Ver en ayuntamiento",
        "url": url,
        "activo": True,
        "fuente": "ayuntamiento",
    }


def merge_events(
    manual_events: list[dict[str, Any]],
    api_events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge manual and API events. Manual events take priority."""
    # Index manual events by normalized title for dedup
    manual_titles: set[str] = set()
    for ev in manual_events:
        normalized = slugify(ev.get("titulo", ""))
        manual_titles.add(normalized)

    # Add API events that don't duplicate manual ones
    merged = list(manual_events)
    added = 0
    for ev in api_events:
        normalized = slugify(ev.get("titulo", ""))
        if normalized not in manual_titles:
            merged.append(ev)
            manual_titles.add(normalized)
            added += 1

    # Sort by start date
    def sort_key(e: dict[str, Any]) -> str:
        return e.get("inicio", "9999")

    merged.sort(key=sort_key)

    print(f"  → {len(manual_events)} eventos manuales preservados")
    print(f"  → {added} eventos nuevos del Ayuntamiento añadidos")
    print(f"  → {len(merged)} eventos totales en agenda")

    return merged


def main() -> int:
    now = datetime.now(TIMEZONE)
    print(f"🗓️  Actualizando agenda local — {now.strftime('%d/%m/%Y %H:%M')}")

    # 1. Load current agenda
    current: dict[str, Any] = {}
    if AGENDA_PATH.exists():
        current = json.loads(AGENDA_PATH.read_text("utf-8"))
    manual_events = [
        ev for ev in current.get("eventos", [])
        if ev.get("fuente") != "ayuntamiento"
    ]

    # 2. Fetch API events
    raw_events = fetch_events()
    api_events = [normalize_event(ev) for ev in raw_events]

    # 3. Merge
    merged = merge_events(manual_events, api_events)

    # 4. Save
    output = {
        "actualizado": now.isoformat(),
        "resumen": f"Agenda local de Alhaurín el Grande. {len(merged)} eventos próximos.",
        "ical_url": ICAL_URL,
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
