#!/usr/bin/env python3
"""Genera páginas HTML individuales para cada evento de la agenda.

Lee data/agenda-local.json y genera /planes/{slug}/index.html
para cada evento, usando la plantilla del sitio.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
import unicodedata
from datetime import datetime
from html import escape
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from lib.footer import SITE_FOOTER_HTML

ROOT = Path(__file__).resolve().parents[1]
AGENDA_PATH = ROOT / "data" / "agenda-local.json"
PLANES_DIR = ROOT / "planes"
TIMEZONE = ZoneInfo("Europe/Madrid")

# ── Category colors (same as calendario.js) ──
CATEGORIES = [
    {"id": "virgen",   "name": "Virgen de Gracia",     "color": "#7EC8E3", "keywords": ["virgen", "gracia", "patrona"]},
    {"id": "cultos",   "name": "Cultos y procesiones",  "color": "#7EC8E3", "keywords": ["procesión", "procesion", "triduo", "ofrenda", "traslado procesional", "traslado", "ermita", "festividad"]},
    {"id": "nazareno", "name": "Hdad. Jesús Nazareno",  "color": "#8B5CF6", "keywords": ["nazareno", "jesús nazareno", "padre jesús", "padre jesus"]},
    {"id": "veracruz", "name": "Santa Vera Cruz",       "color": "#22C55E", "keywords": ["vera cruz", "veracruz"]},
    {"id": "futbol",   "name": "Fútbol",                "color": "#EF4444", "keywords": ["fútbol", "futbol", "cd alhaurino", "alhaurino vs", "málaga cf", "🆚"]},
    {"id": "motor",    "name": "Motor",                 "color": "#6366F1", "keywords": ["moto gp", "formula 1", "motogp", "🏍"]},
    {"id": "musica",   "name": "Música en vivo",        "color": "#F59E0B", "keywords": ["music", "músic", "dj", "🎶", "🎸", "🎙", "concierto", "live"]},
    {"id": "gastro",   "name": "Gastronomía",           "color": "#EC4899", "keywords": ["gastro", "tomate", "brunch", "ruta gastro", "🍽", "🍅"]},
]
DEFAULT_CAT = {"id": "otros", "name": "Otros eventos", "color": "#6B7280"}


def get_category(event: dict[str, Any]) -> dict[str, Any]:
    text = f"{event.get('titulo', '')} {event.get('tipo', '')} {event.get('descripcion', '')}".lower()
    for cat in CATEGORIES:
        if any(kw in text for kw in cat["keywords"]):
            return cat
    return DEFAULT_CAT


def make_slug(event: dict[str, Any]) -> str:
    """Create a URL-safe slug from the event ID."""
    raw = event["id"]
    # Already a slug-like ID
    slug = raw.replace("alhaurinhoy-", "e-")
    slug = unicodedata.normalize("NFKD", slug).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^\w\s-]", "", slug.lower())
    slug = re.sub(r"[-\s]+", "-", slug).strip("-")
    return slug or "evento"


def format_date_long(iso: str) -> str:
    try:
        d = datetime.fromisoformat(iso)
        dias = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]
        meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
                 "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
        return f"{dias[d.weekday()]}, {d.day} de {meses[d.month - 1]} de {d.year}"
    except Exception:
        return iso[:10] if iso else "Fecha por confirmar"


def format_time(iso: str) -> str:
    try:
        d = datetime.fromisoformat(iso)
        return d.strftime("%H:%M")
    except Exception:
        return ""


def clean_title(title: str) -> str:
    """Remove excessive emojis from title for page display."""
    # Remove leading/trailing emoji sequences but keep inline ones
    title = re.sub(r'^[\U00010000-\U0010ffff\s]+', '', title)
    title = re.sub(r'[\U00010000-\U0010ffff\s]+$', '', title)
    return title.strip() or "Evento"


def generate_event_page(event: dict[str, Any], slug: str) -> str:
    """Generate HTML for an individual event page."""
    cat = get_category(event)
    title = event.get("titulo", "Evento")
    clean = clean_title(title)
    desc = event.get("descripcion", "")
    lugar = event.get("lugar", "Alhaurín el Grande")
    inicio = event.get("inicio", "")
    fin = event.get("fin", "")
    fuente = event.get("fuente", "manual")
    url_original = event.get("url", "")
    icono = event.get("icono", "📅")
    tipo = event.get("tipo", "Evento")

    fecha_display = format_date_long(inicio)
    hora_display = format_time(inicio)
    hora_fin = format_time(fin) if fin else ""
    horario = f"{hora_display}" + (f" — {hora_fin}" if hora_fin else "")

    fuente_display = ""
    if fuente == "alhaurinhoy":
        fuente_display = f'<p class="ev-source">Fuente: <a href="{escape(url_original)}" target="_blank" rel="noopener noreferrer">alhaurinhoy.es</a></p>'
    elif url_original and "alhaurinaldia" not in url_original and url_original != "#":
        fuente_display = f'<p class="ev-source">Fuente: <a href="{escape(url_original)}" target="_blank" rel="noopener noreferrer">Enlace original</a></p>'

    meta_desc = f"{clean} · {fecha_display}. {desc[:120]}" if desc else f"{clean} en Alhaurín el Grande · {fecha_display}"

    return f"""<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{escape(clean)} — Alhaurín al Día</title>
    <meta name="description" content="{escape(meta_desc)}">
    <meta name="theme-color" content="#1c1f1b">
    <link rel="canonical" href="https://alhaurinaldia.es/planes/{escape(slug)}/">
    <meta property="og:type" content="event">
    <meta property="og:site_name" content="Alhaurín al Día">
    <meta property="og:title" content="{escape(clean)}">
    <meta property="og:description" content="{escape(meta_desc)}">
    <link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="../../css/styles.css">
    <link rel="stylesheet" href="../../css/mobile.css">
    <style>
        .ev-hero {{
            padding: 32px 0 24px;
            border-bottom: 1px solid var(--line);
        }}
        .ev-back {{
            display: inline-flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 600;
            color: var(--accent);
            text-decoration: none;
            margin-bottom: 16px;
        }}
        .ev-back:hover {{ text-decoration: underline; }}
        .ev-badge {{
            display: inline-block;
            padding: 4px 12px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 700;
            color: {cat['color']};
            background: {cat['color']}18;
            margin-bottom: 10px;
        }}
        .ev-title {{
            font-family: 'Fraunces', Georgia, serif;
            font-size: clamp(22px, 4vw, 32px);
            color: var(--ink);
            margin: 0 0 12px;
            line-height: 1.25;
        }}
        .ev-meta {{
            display: flex;
            flex-wrap: wrap;
            gap: 16px;
            font-size: 14px;
            color: var(--muted);
        }}
        .ev-meta-item {{
            display: flex;
            align-items: center;
            gap: 6px;
        }}
        .ev-body {{
            padding: 28px 0 40px;
            max-width: 680px;
        }}
        .ev-body p {{
            font-size: 15px;
            line-height: 1.65;
            color: var(--ink);
            margin: 0 0 16px;
        }}
        .ev-cat-stripe {{
            width: 100%;
            height: 4px;
            background: {cat['color']};
            border-radius: 2px;
            margin-bottom: 20px;
        }}
        .ev-source {{
            font-size: 13px;
            color: var(--muted);
            margin-top: 20px;
            padding-top: 16px;
            border-top: 1px solid var(--line);
        }}
        .ev-source a {{
            color: var(--accent);
            font-weight: 600;
        }}
        .ev-cta {{
            display: inline-block;
            margin-top: 20px;
            padding: 10px 24px;
            background: var(--accent);
            color: #fff;
            border-radius: var(--radius);
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
            transition: background 0.15s;
        }}
        .ev-cta:hover {{ background: var(--accent-dark); }}
    </style>
</head>
<body>
    <div class="topbar">
        <div class="container">
            <span>Evento en Alhaurín el Grande</span>
            <span>{escape(tipo)}</span>
        </div>
    </div>

    <header>
        <div class="container">
            <nav aria-label="Navegación principal">
                <a class="logo" href="/" aria-label="Alhaurín al Día">
                    <span class="logo-mark">A</span>
                    <span><strong>Alhaurín al Día</strong><span>Información local útil</span></span>
                </a>
                <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-menu" aria-label="Abrir menú de navegación"><span></span><span></span><span></span></button>
                <div class="nav-links" id="main-menu"><a href="/noticias/">Noticias</a><a href="/guia-util/">Guía útil</a><a href="/avisos/">Avisos</a><a href="/tiempo/">Tiempo</a><a href="/seguimiento/">Seguimiento</a><a href="/planes/">Planes</a><a href="/comercios/">Comercios</a><a href="/anunciarse/" class="nav-cta">Anunciarse</a></div>
            </nav>
        </div>
    </header>

    <main>
        <section class="ev-hero">
            <div class="container">
                <a class="ev-back" href="/planes/">← Volver al calendario</a>
                <div class="ev-cat-stripe"></div>
                <span class="ev-badge">{escape(icono)} {escape(cat['name'])}</span>
                <h1 class="ev-title">{escape(clean)}</h1>
                <div class="ev-meta">
                    <span class="ev-meta-item">📅 {escape(fecha_display)}</span>
                    {"<span class='ev-meta-item'>⏰ " + escape(horario) + "</span>" if hora_display else ""}
                    {"<span class='ev-meta-item'>📍 " + escape(lugar) + "</span>" if lugar else ""}
                </div>
            </div>
        </section>

        <section>
            <div class="container">
                <div class="ev-body">
                    {"<p>" + escape(desc) + "</p>" if desc else "<p>Evento en Alhaurín el Grande. Más información próximamente.</p>"}
                    {fuente_display}
                    <a class="ev-cta" href="/planes/">📅 Ver calendario completo</a>
                </div>
            </div>
        </section>
    </main>

    {SITE_FOOTER_HTML}

    <script src="../../js/app.js" defer></script>
</body>
</html>
"""


def cleanup_orphan_manual_pages(old_id_to_slug: dict[str, str], new_id_to_slug: dict[str, str]) -> int:
    """Borra /planes/{slug}/ de eventos manuales cuyo slug ya no es válido:
    o el evento se borró (id ausente en el nuevo mapa) o cambió de título y
    por tanto de slug (id presente pero con un slug distinto). Solo actúa
    sobre eventos con id "manual-*" (gestionados por
    scripts/sync-admin-firestore.js) — los automáticos (ayuntamiento/
    alhaurinhoy) nunca se borran aquí, ya que ese gap (páginas huérfanas) es
    un problema preexistente fuera de este alcance."""
    removed = 0
    for event_id, old_slug in old_id_to_slug.items():
        if not event_id.startswith("manual-"):
            continue
        if new_id_to_slug.get(event_id) == old_slug:
            continue
        stale_dir = PLANES_DIR / old_slug
        if stale_dir.is_dir():
            shutil.rmtree(stale_dir)
            removed += 1
    return removed


def main() -> int:
    print("🔨 Generando páginas de eventos...")

    data = json.loads(AGENDA_PATH.read_text("utf-8"))
    eventos = data.get("eventos", [])

    slug_map_path = ROOT / "data" / "evento-slugs.json"
    old_id_to_slug: dict[str, str] = {}
    if slug_map_path.exists():
        try:
            old_id_to_slug = json.loads(slug_map_path.read_text("utf-8"))
        except json.JSONDecodeError:
            old_id_to_slug = {}

    # Track generated slugs to avoid collisions
    slug_map: dict[str, str] = {}
    generated = 0
    skipped = 0

    for event in eventos:
        slug = make_slug(event)

        # Handle slug collisions
        if slug in slug_map:
            # Append date to make unique
            date_part = event.get("inicio", "")[:10].replace("-", "")
            slug = f"{slug}-{date_part}"

        slug_map[slug] = event["id"]

        # Create directory and write HTML
        event_dir = PLANES_DIR / slug
        event_dir.mkdir(parents=True, exist_ok=True)

        html = generate_event_page(event, slug)
        (event_dir / "index.html").write_text(html, encoding="utf-8")
        generated += 1

    # Invert: event_id -> slug
    id_to_slug = {v: k for k, v in slug_map.items()}

    removed = cleanup_orphan_manual_pages(old_id_to_slug, id_to_slug)

    # Write slug map for calendario.js to use
    slug_map_path.write_text(
        json.dumps(id_to_slug, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print(f"  ✅ {generated} páginas generadas en /planes/*/")
    if removed:
        print(f"  🗑️  {removed} páginas de eventos manuales huérfanas eliminadas")
    print(f"  📄 Mapa de slugs guardado en {slug_map_path.name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
