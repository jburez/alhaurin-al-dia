"""Navegacion principal unica, compartida por todos los generadores Python.

A diferencia del footer (scripts/lib/footer.py), el CONTENIDO del menu no
vive aqui: vive en data/nav.json, la unica fuente de verdad. Este fichero
solo aporta la plantilla HTML alrededor de esos items -- deliberadamente
minima (un <a> por item, sin logica condicional) para que lo unico que
pudiera divergir entre esta version y scripts/lib/nav.js sea esa plantilla,
no el contenido. Usa rutas absolutas ("/noticias/", etc.) para funcionar
igual a cualquier profundidad de carpeta, mismo criterio que
scripts/lib/footer.py.
"""

import html
import json
from pathlib import Path

NAV_DATA_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "nav.json"


def _escape(value: str = "") -> str:
    return html.escape(str(value or ""), quote=True)


def _load_nav_data() -> dict:
    return json.loads(NAV_DATA_FILE.read_text(encoding="utf-8"))


def render_nav() -> str:
    data = _load_nav_data()
    items = data.get("items", [])
    cta = data.get("cta")

    links = "\n                    ".join(
        f'<a href="{_escape(item["href"])}">{_escape(item["label"])}</a>'
        for item in items
    )
    cta_link = (
        f'<a href="{_escape(cta["href"])}" class="nav-cta">{_escape(cta["label"])}</a>'
        if cta else ""
    )

    return f'''<nav aria-label="Navegación principal">
                <a class="logo" href="/" aria-label="Alhaurín al Día">
                    <span class="logo-mark">A</span>
                    <span><strong>Alhaurín al Día</strong><span>Información local útil</span></span>
                </a>
                <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-menu" aria-label="Abrir menú de navegación">
                    <span></span><span></span><span></span>
                </button>
                <div class="nav-links" id="main-menu">
                    {links}
                    {cta_link}
                    <button type="button" class="nav-search-btn search-toggle" aria-label="Buscar en la web">🔍 Buscar</button>
                </div>
            </nav>'''
