#!/usr/bin/env python3
"""Actualiza data/agenda-local.json con las fuentes de agenda configuradas.

Lee data/fuentes-agenda.json. Para cada fuente activa con tipo:

  wp-tribe  API REST de The Events Calendar (WordPress), con paginación
            (next_rest_url) y registro del código HTTP y los totales.
  ical      calendario .ics (VEVENT), con zona horaria Europe/Madrid.
  rss       feed RSS/Atom: solo entradas en las que se detecta un evento con
            fecha futura (scripts/lib/detector_eventos.py).
  manual / pistas   no se descargan aquí (panel de administración y
            scripts/actualizar_agenda_alhaurinhoy.py).

Si la URL principal falla o devuelve 0 eventos y la fuente tiene
'alternativa' (iCal), se prueba la alternativa.

Los eventos de cada fuente se reemplazan solo si la descarga tuvo éxito; si
falla, se conservan los que ya había. Los eventos de otras fuentes no se tocan.

Uso: python3 scripts/actualizar_agenda_fuentes.py [--solo ID] [--diagnostico]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib.detector_eventos import es_evento  # noqa: E402

AGENDA_PATH = ROOT / "data" / "agenda-local.json"
FUENTES_PATH = ROOT / "data" / "fuentes-agenda.json"
TZ = ZoneInfo("Europe/Madrid")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; AlhaurinAlDia/1.0; +https://alhaurinaldia.es/contacto/)",
    "Accept": "application/json, text/calendar, application/rss+xml, */*;q=0.8",
}
TIMEOUT = 20
MAX_PAGES = 10


def log(msg: str) -> None:
    print(msg, flush=True)


def strip_html(text: str) -> str:
    text = unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def slugify(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:60] or "evento"


def http_get(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:300] if hasattr(e, "read") else ""
        return e.code, body
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise RuntimeError(str(e)) from e


def to_iso(local: str, tzname: str | None = None) -> str:
    """'2026-11-25 19:00:00' (hora local) -> ISO con desfase de Madrid."""
    if not local:
        return ""
    local = local.replace("T", " ").strip()
    try:
        dt = datetime.strptime(local[:19], "%Y-%m-%d %H:%M:%S")
    except ValueError:
        try:
            dt = datetime.strptime(local[:10], "%Y-%m-%d")
        except ValueError:
            return ""
    try:
        tz = ZoneInfo(tzname) if tzname else TZ
    except Exception:  # noqa: BLE001
        tz = TZ
    return dt.replace(tzinfo=tz).isoformat()


# ---------- wp-tribe ----------

def with_params(url: str, **params: Any) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query.update({k: str(v) for k, v in params.items()})
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def fetch_wp_tribe(fuente: dict) -> list[dict]:
    hoy = datetime.now(TZ).strftime("%Y-%m-%d")
    url = with_params(fuente["url"], per_page=50, start_date=f"{hoy} 00:00:00")
    eventos: list[dict] = []
    for page in range(1, MAX_PAGES + 1):
        status, body = http_get(url)
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            log(f"  [{fuente['id']}] página {page}: HTTP {status}, respuesta no JSON: {body[:200]!r}")
            raise RuntimeError(f"HTTP {status} sin JSON")
        if status != 200:
            log(f"  [{fuente['id']}] HTTP {status}: {str(data)[:300]}")
            raise RuntimeError(f"HTTP {status}")
        lote = data.get("events", []) if isinstance(data, dict) else []
        log(f"  [{fuente['id']}] página {page}: HTTP {status}, {len(lote)} eventos "
            f"(total={data.get('total')}, total_pages={data.get('total_pages')}, url={url})")
        eventos.extend(normalize_tribe(e, fuente) for e in lote)
        nxt = data.get("next_rest_url") if isinstance(data, dict) else None
        if not nxt:
            break
        url = nxt
    return eventos


def normalize_tribe(ev: dict, fuente: dict) -> dict:
    tzname = ev.get("timezone") or "Europe/Madrid"
    venue = ev.get("venue") if isinstance(ev.get("venue"), dict) else {}
    organizers = ev.get("organizer") if isinstance(ev.get("organizer"), list) else []
    cats = ev.get("categories") if isinstance(ev.get("categories"), list) else []
    image = ev.get("image") if isinstance(ev.get("image"), dict) else {}
    direccion = ", ".join(x for x in [venue.get("address", ""), venue.get("city", "")] if x)
    titulo = strip_html(ev.get("title", "Evento"))
    return {
        "id": f"{fuente['id']}-{ev.get('id') or slugify(titulo)}",
        "tipo": (cats[0].get("name") if cats else "Evento") or "Evento",
        "icono": "📅",
        "titulo": titulo,
        "descripcion": strip_html(ev.get("description", "") or ev.get("excerpt", "")),
        "lugar": strip_html(venue.get("venue", "")),
        "direccion": strip_html(direccion),
        "inicio": to_iso(ev.get("start_date", ""), tzname),
        "fin": to_iso(ev.get("end_date", ""), tzname),
        "todo_el_dia": bool(ev.get("all_day")),
        "precio": strip_html(ev.get("cost", "")) or None,
        "organizador": strip_html(organizers[0].get("organizer", "")) if organizers else "",
        "imagen": image.get("url", ""),
        "estado": "neutral",
        "cta": f"Ver en {fuente['nombre']}",
        "url": ev.get("url", ""),
        "activo": ev.get("status", "publish") == "publish",
        "fuente": fuente["id"],
    }


# ---------- iCal ----------

def unfold(text: str) -> list[str]:
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").split("\n"):
        if raw.startswith((" ", "\t")) and lines:
            lines[-1] += raw[1:]
        else:
            lines.append(raw)
    return lines


def ical_value(value: str) -> str:
    return value.replace("\\n", " ").replace("\\N", " ").replace("\\,", ",").replace("\\;", ";").replace("\\\\", "\\").strip()


def ical_date(params: str, value: str) -> str:
    value = value.strip()
    tzid = re.search(r"TZID=([^;:]+)", params)
    if re.fullmatch(r"\d{8}", value):
        return f"{value[:4]}-{value[4:6]}-{value[6:8]}"
    m = re.fullmatch(r"(\d{8})T(\d{6})(Z?)", value)
    if not m:
        return ""
    d, t, z = m.groups()
    local = f"{d[:4]}-{d[4:6]}-{d[6:8]} {t[:2]}:{t[2:4]}:{t[4:6]}"
    if z:
        return datetime.strptime(local, "%Y-%m-%d %H:%M:%S").replace(tzinfo=ZoneInfo("UTC")).astimezone(TZ).isoformat()
    return to_iso(local, tzid.group(1) if tzid else None)


def fetch_ical(url: str, fuente: dict) -> list[dict]:
    status, body = http_get(url)
    if status != 200 or "BEGIN:VCALENDAR" not in body:
        log(f"  [{fuente['id']}] iCal HTTP {status}: no es un calendario ({body[:150]!r})")
        raise RuntimeError(f"iCal HTTP {status}")
    eventos: list[dict] = []
    current: dict[str, str] | None = None
    for line in unfold(body):
        if line == "BEGIN:VEVENT":
            current = {}
        elif line == "END:VEVENT" and current is not None:
            eventos.append(current)
            current = None
        elif current is not None and ":" in line:
            key, value = line.split(":", 1)
            name, _, params = key.partition(";")
            current[name.upper()] = value
            current[f"{name.upper()}__params"] = params
    log(f"  [{fuente['id']}] iCal HTTP {status}: {len(eventos)} eventos ({url})")
    hoy = datetime.now(TZ).date().isoformat()
    out = []
    for e in eventos:
        inicio = ical_date(e.get("DTSTART__params", ""), e.get("DTSTART", ""))
        fin = ical_date(e.get("DTEND__params", ""), e.get("DTEND", ""))
        if not inicio or (fin or inicio)[:10] < hoy:
            continue
        titulo = ical_value(e.get("SUMMARY", "Evento"))
        uid = e.get("UID", "") or f"{inicio}-{titulo}"
        out.append({
            "id": f"{fuente['id']}-{slugify(uid)[:40]}",
            "tipo": "Evento",
            "icono": "📅",
            "titulo": titulo,
            "descripcion": strip_html(ical_value(e.get("DESCRIPTION", ""))),
            "lugar": ical_value(e.get("LOCATION", "")).split(",")[0].strip(),
            "direccion": ", ".join(x.strip() for x in ical_value(e.get("LOCATION", "")).split(",")[1:]).strip(),
            "inicio": inicio,
            "fin": fin,
            "estado": "neutral",
            "cta": f"Ver en {fuente['nombre']}",
            "url": ical_value(e.get("URL", "")),
            "activo": e.get("STATUS", "CONFIRMED").upper() != "CANCELLED",
            "fuente": fuente["id"],
        })
    return out


# ---------- RSS ----------

def fetch_rss(fuente: dict) -> list[dict]:
    status, body = http_get(fuente["url"])
    if status != 200:
        raise RuntimeError(f"RSS HTTP {status}")
    items = re.findall(r"<item\b.*?</item>|<entry\b.*?</entry>", body, flags=re.S)
    log(f"  [{fuente['id']}] RSS HTTP {status}: {len(items)} entradas")
    out = []
    for item in items:
        def tag(name: str) -> str:
            m = re.search(rf"<{name}[^>]*>(.*?)</{name}>", item, flags=re.S)
            return strip_html(re.sub(r"<!\[CDATA\[(.*?)\]\]>", r"\1", m.group(1), flags=re.S)) if m else ""
        titulo, texto = tag("title"), tag("description") or tag("summary")
        link = tag("link") or (re.search(r'<link[^>]+href="([^"]+)"', item) or [None, ""])[1]
        ok, _claves, fechas = es_evento(titulo, texto)
        if not ok:
            continue
        out.append({
            "id": f"{fuente['id']}-{slugify(link or titulo)[:40]}",
            "tipo": "Evento", "icono": "📅", "titulo": titulo, "descripcion": texto[:600],
            "lugar": "", "inicio": fechas[0].isoformat(), "fin": "", "estado": "neutral",
            "cta": f"Ver en {fuente['nombre']}", "url": link, "activo": True, "fuente": fuente["id"],
        })
    return out


def fetch_fuente(fuente: dict) -> list[dict]:
    tipo = fuente.get("tipo")
    eventos: list[dict] = []
    error = None
    try:
        if tipo == "wp-tribe":
            eventos = fetch_wp_tribe(fuente)
        elif tipo == "ical":
            eventos = fetch_ical(fuente["url"], fuente)
        elif tipo == "rss":
            eventos = fetch_rss(fuente)
        else:
            return []
    except RuntimeError as e:
        error = e
        log(f"  [{fuente['id']}] ⚠️  error: {e}")
    if (error or not eventos) and fuente.get("alternativa"):
        log(f"  [{fuente['id']}] probando alternativa iCal…")
        try:
            eventos = fetch_ical(fuente["alternativa"], fuente)
            error = None
        except RuntimeError as e:
            log(f"  [{fuente['id']}] ⚠️  alternativa con error: {e}")
    if error and not eventos:
        raise RuntimeError(str(error))
    return eventos


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--solo", help="Actualizar solo la fuente con este id")
    args = parser.parse_args()

    config = json.loads(FUENTES_PATH.read_text("utf-8"))
    fuentes = [f for f in config.get("fuentes", []) if f.get("activa") and f.get("tipo") in {"wp-tribe", "ical", "rss"}]
    if args.solo:
        fuentes = [f for f in fuentes if f["id"] == args.solo]

    current = json.loads(AGENDA_PATH.read_text("utf-8")) if AGENDA_PATH.exists() else {"eventos": []}
    eventos = current.get("eventos", [])
    log(f"🗓️  Fuentes de agenda — {datetime.now(TZ).strftime('%d/%m/%Y %H:%M')} ({len(fuentes)} activas)")

    for fuente in fuentes:
        log(f"📡 {fuente['nombre']} ({fuente['tipo']})")
        try:
            nuevos = fetch_fuente(fuente)
        except RuntimeError:
            log(f"  → se conservan los {sum(1 for e in eventos if e.get('fuente') == fuente['id'])} eventos anteriores")
            continue
        # Los eventos gestionados desde el panel (reclamados) no se pisan.
        gestionados = {e["id"] for e in eventos if e.get("gestionado")}
        eventos = [e for e in eventos if e.get("fuente") != fuente["id"] or e["id"] in gestionados]
        vistos = {e["id"] for e in eventos}
        añadidos = [e for e in nuevos if e["id"] not in vistos and e.get("inicio")]
        eventos.extend(añadidos)
        log(f"  → {len(añadidos)} eventos de {fuente['nombre']}")

    eventos.sort(key=lambda e: e.get("inicio", "9999"))
    current["actualizado"] = datetime.now(TZ).isoformat()
    current["resumen"] = f"Agenda local de Alhaurín el Grande. {len(eventos)} eventos próximos."
    current["eventos"] = eventos
    AGENDA_PATH.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log(f"✅ agenda-local.json: {len(eventos)} eventos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
