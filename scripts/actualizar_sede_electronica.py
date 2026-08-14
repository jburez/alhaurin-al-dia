#!/usr/bin/env python3
"""Actualiza data/boletin-oficial.json con edictos de la Sede Electrónica municipal.

Fuente: https://alhaurinelgrande.sedelectronica.es/board/
Complementa al BOP Málaga (email IMAP) con edictos locales de la Sede.
"""

from __future__ import annotations

import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
BOP_PATH = ROOT / "data" / "boletin-oficial.json"
TIMEZONE = ZoneInfo("Europe/Madrid")

SEDE_BOARD_URL = "https://alhaurinelgrande.sedelectronica.es/board/"
USER_AGENT = "Mozilla/5.0 (AlhaurinAlDia/1.0; +https://alhaurinaldia.es)"


class EdictoParser(HTMLParser):
    """Parse edictos from the Sede Electrónica tablón HTML."""

    def __init__(self) -> None:
        super().__init__()
        self.edictos: list[dict[str, Any]] = []
        self._current: dict[str, Any] = {}
        self._in_row = False
        self._in_cell = False
        self._cell_idx = 0
        self._cell_text = ""
        self._in_link = False
        self._link_href = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_dict = dict(attrs)
        if tag == "tr":
            self._in_row = True
            self._cell_idx = 0
            self._current = {}
        elif tag == "td" and self._in_row:
            self._in_cell = True
            self._cell_text = ""
        elif tag == "a" and self._in_cell:
            self._in_link = True
            self._link_href = attr_dict.get("href", "")

    def handle_endtag(self, tag: str) -> None:
        if tag == "td" and self._in_cell:
            self._in_cell = False
            text = self._cell_text.strip()

            if self._cell_idx == 0:
                self._current["titulo"] = text
                if self._link_href:
                    href = self._link_href
                    if href.startswith("/"):
                        href = f"https://alhaurinelgrande.sedelectronica.es{href}"
                    self._current["enlace"] = href
            elif self._cell_idx == 1:
                self._current["area"] = text
            elif self._cell_idx == 2:
                self._current["fecha_publicacion"] = text
            elif self._cell_idx == 3:
                self._current["fecha_caducidad"] = text

            self._cell_idx += 1
            self._link_href = ""
            self._in_link = False

        elif tag == "tr" and self._in_row:
            self._in_row = False
            if self._current.get("titulo"):
                self.edictos.append(self._current)

    def handle_data(self, data: str) -> None:
        if self._in_cell:
            self._cell_text += data


def fetch_tablón() -> str:
    """Fetch the HTML of the Sede Electrónica tablón."""
    req = urllib.request.Request(SEDE_BOARD_URL, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return response.read().decode("utf-8", errors="replace")
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        print(f"⚠️  Error fetching Sede Electrónica: {e}", file=sys.stderr)
        return ""


def parse_date(date_str: str) -> str:
    """Try to parse a date string in various formats."""
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(date_str.strip(), fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return date_str.strip()


def normalize_edicto(raw: dict[str, Any]) -> dict[str, Any]:
    """Convert a raw parsed edicto to our boletin-oficial.json format."""
    titulo = raw.get("titulo", "").strip()
    # Create a deterministic ID
    slug = re.sub(r"[^\w]", "", titulo.lower())[:40]
    fecha = parse_date(raw.get("fecha_publicacion", ""))
    edicto_id = f"sede-{fecha}-{slug}"

    return {
        "id": edicto_id,
        "numero_edicto": "",
        "organismo": "Ayuntamiento de Alhaurín el Grande",
        "criterio_busqueda": "Sede Electrónica",
        "expediente": raw.get("area", ""),
        "resumen": titulo,
        "enlace": raw.get("enlace", SEDE_BOARD_URL),
        "fuente": "Sede Electrónica",
        "fecha_alerta": fecha,
        "detectado_en": datetime.now(TIMEZONE).isoformat(),
    }


def merge_with_bop(
    bop_entries: list[dict[str, Any]],
    sede_entries: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Merge Sede entries with BOP entries, deduplicating by ID."""
    existing_ids = {e["id"] for e in bop_entries}
    added = 0
    for entry in sede_entries:
        if entry["id"] not in existing_ids:
            bop_entries.append(entry)
            existing_ids.add(entry["id"])
            added += 1

    # Sort by date descending
    bop_entries.sort(key=lambda e: e.get("fecha_alerta", ""), reverse=True)

    print(f"  → {added} edictos nuevos de la Sede Electrónica añadidos")
    print(f"  → {len(bop_entries)} edictos totales en boletín oficial")
    return bop_entries


def main() -> int:
    now = datetime.now(TIMEZONE)
    print(f"📋 Actualizando Sede Electrónica — {now.strftime('%d/%m/%Y %H:%M')}")

    # 1. Fetch and parse
    html = fetch_tablón()
    if not html:
        print("❌ No se pudo obtener el tablón de la Sede Electrónica", file=sys.stderr)
        return 1

    parser = EdictoParser()
    parser.feed(html)
    print(f"📋 {len(parser.edictos)} edictos encontrados en la Sede Electrónica")

    if not parser.edictos:
        print("ℹ️  Sin edictos nuevos. No se realizan cambios.")
        return 0

    # 2. Normalize
    sede_entries = [normalize_edicto(e) for e in parser.edictos]

    # 3. Load existing BOP data
    bop_entries: list[dict[str, Any]] = []
    if BOP_PATH.exists():
        bop_entries = json.loads(BOP_PATH.read_text("utf-8"))

    # 4. Merge
    merged = merge_with_bop(bop_entries, sede_entries)

    # 5. Save
    BOP_PATH.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"✅ Boletín oficial actualizado en {BOP_PATH.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
