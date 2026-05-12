import html
import json
import re
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_FILE = BASE_DIR / "data" / "guia-util.json"
SITEMAP_FILE = BASE_DIR / "sitemap.xml"
SITE_URL = "https://alhaurinaldia.es"


def escapar(texto):
    return html.escape(str(texto or ""), quote=True)


def limpiar(texto):
    texto = html.unescape(str(texto or ""))
    texto = re.sub(r"<[^>]+>", "", texto)
    return re.sub(r"\s+", " ", texto).strip()


def slugify(texto):
    texto = limpiar(texto).lower()
    reemplazos = {
        "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u",
        "à": "a", "è": "e", "ì": "i", "ò": "o", "ù": "u",
        "ä": "a", "ë": "e", "ï": "i", "ö": "o", "ü": "u",
        "ñ": "n", "ç": "c",
    }
    for origen, destino in reemplazos.items():
        texto = texto.replace(origen, destino)
    texto = re.sub(r"[^a-z0-9]+", "-", texto).strip("-")
    return texto or "recurso"


def item_path(item):
    return f"guia-util/{slugify(item.get('id') or item.get('titulo'))}/"


def item_url(item):
    return f"/{item_path(item)}"


def canonical_item(item):
    return f"{SITE_URL}{item_url(item)}"


def schema_webpage(item):
    data = {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": item.get("titulo", "Recurso útil"),
        "url": canonical_item(item),
        "description": item.get("descripcion", "Información práctica de Alhaurín el Grande."),
        "inLanguage": "es-ES",
        "isPartOf": {"@type": "WebSite", "name": "Alhaurín al Día", "url": SITE_URL},
        "about": {"@type": "Thing", "name": item.get("titulo", "Guía útil")},
        "contentLocation": {"@type": "Place", "name": "Alhaurín el Grande"},
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def schema_breadcrumb(item):
    data = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Inicio", "item": f"{SITE_URL}/"},
            {"@type": "ListItem", "position": 2, "name": "Guía útil", "item": f"{SITE_URL}/guia-util/"},
            {"@type": "ListItem", "position": 3, "name": item.get("titulo", "Recurso"), "item": canonical_item(item)},
        ],
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def schema_faq(item):
    titulo = item.get("titulo", "este recurso")
    data = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": f"¿Qué información ofrece {titulo}?",
                "acceptedAnswer": {"@type": "Answer", "text": item.get("descripcion", "Información práctica para vecinos y visitantes de Alhaurín el Grande.")},
            },
            {
                "@type": "Question",
                "name": "¿La información sustituye a la fuente oficial?",
                "acceptedAnswer": {"@type": "Answer", "text": "No. Alhaurín al Día organiza la información y enlaza a fuentes oficiales o de referencia para verificar los datos actualizados."},
            },
        ],
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def html_head(item):
    titulo = item.get("titulo", "Guía útil")
    descripcion = item.get("descripcion", "Información práctica de Alhaurín el Grande.")
    canonical = canonical_item(item)
    return f'''<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{escapar(titulo)} | Alhaurín al Día</title>
    <meta name="description" content="{escapar(descripcion)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="{escapar(canonical)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Alhaurín al Día">
    <meta property="og:title" content="{escapar(titulo)}">
    <meta property="og:description" content="{escapar(descripcion)}">
    <meta property="og:url" content="{escapar(canonical)}">
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
    <link rel="stylesheet" href="/styles.css">
    <link rel="stylesheet" href="/mobile.css">
    <link rel="stylesheet" href="/ads.css">
    <style>
        .resource-hero {{ padding:58px 0 28px; }}
        .resource-card {{ background:rgba(255,255,255,.92); border:1px solid var(--line); border-radius:36px; padding:clamp(28px,5vw,56px); box-shadow:var(--shadow); }}
        .resource-layout {{ display:grid; grid-template-columns:1.1fr .9fr; gap:24px; align-items:start; margin-bottom:56px; }}
        .resource-box {{ background:white; border:1px solid var(--line); border-radius:26px; padding:24px; box-shadow:var(--shadow-soft); }}
        .resource-list {{ display:grid; gap:12px; padding-left:0; list-style:none; margin:22px 0 0; }}
        .resource-list li {{ background:var(--paper-soft); border:1px solid var(--line); border-radius:18px; padding:14px; color:var(--ink); line-height:1.55; }}
        .official-links {{ display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }}
        .official-links a {{ display:inline-flex; padding:10px 13px; border-radius:999px; background:var(--brand-soft); border:1px solid #d9e6f0; color:var(--brand); font-size:13px; font-weight:900; }}
        .resource-note {{ margin-top:18px; background:var(--paper-soft); border:1px solid var(--line); border-radius:18px; padding:16px; color:var(--muted); }}
        .resource-note p {{ margin:8px 0 0; }}
        @media(max-width:900px) {{ .resource-layout {{ grid-template-columns:1fr; }} }}
    </style>
    <script type="application/ld+json">{schema_webpage(item)}</script>
    <script type="application/ld+json">{schema_breadcrumb(item)}</script>
    <script type="application/ld+json">{schema_faq(item)}</script>
</head>'''


def html_item(item):
    titulo = item.get("titulo", "Recurso útil")
    categoria = item.get("categoria", "Guía útil")
    descripcion = item.get("descripcion", "Información práctica para consultar rápidamente.")
    icono = item.get("icono", "•")
    items_html = "".join(f"<li>{escapar(texto)}</li>" for texto in item.get("items", []))
    links_html = "".join(
        f'<a href="{escapar(link.get("url", "#"))}" target="_blank" rel="noopener noreferrer">{escapar(link.get("texto", "Abrir enlace"))}</a>'
        for link in item.get("links", [])
    )

    return f'''<!doctype html>
<html lang="es">
{html_head(item)}
<body>
    <div class="topbar"><div class="container"><span>Guía local independiente de Alhaurín el Grande</span><span>{escapar(categoria)} · Recurso útil</span></div></div>
    <header><div class="container"><nav aria-label="Navegación principal">
        <a class="logo" href="/" aria-label="Alhaurín al Día"><span class="logo-mark">A</span><span><strong>Alhaurín al Día</strong><span>Información local útil</span></span></a>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-menu" aria-label="Abrir menú de navegación"><span></span><span></span><span></span></button>
        <div class="nav-links" id="main-menu"><a href="/noticias/">Noticias</a><a href="/guia-util/">Guía útil</a><a href="/planes/">Planes</a><a href="/comercios/">Comercios</a><a href="/anunciarse/" class="nav-cta">Anunciarse</a></div>
    </nav></div></header>
    <main>
        <section class="resource-hero"><div class="container"><div class="resource-card">
            <span class="eyebrow">{escapar(categoria)}</span>
            <h1>{escapar(titulo)}</h1>
            <p class="lead">{escapar(descripcion)}</p>
            <div class="actions"><a class="btn btn-primary" href="#informacion">Consultar información</a><a class="btn btn-secondary" href="/guia-util/">Volver a Guía útil</a></div>
        </div></div></section>
        <section id="informacion"><div class="container resource-layout">
            <article class="resource-box">
                <div class="guide-card-top"><div class="guide-icon">{escapar(icono)}</div><div><span class="guide-category">{escapar(categoria)}</span><h2>Información práctica</h2></div></div>
                <ul class="resource-list">{items_html}</ul>
                <div class="resource-note"><strong>Nota de Alhaurín al Día</strong><p>Alhaurín al Día recopila y organiza esta información para facilitar el acceso a recursos útiles de Alhaurín el Grande, respetando la fuente original y enlazando siempre al contenido de referencia.</p></div>
            </article>
            <aside class="resource-box">
                <span class="section-kicker">Fuentes y enlaces</span>
                <h2>Enlaces de referencia</h2>
                <p>Consulta las fuentes oficiales o recursos externos antes de realizar gestiones, desplazamientos o reservas.</p>
                <div class="official-links">{links_html or '<span class="source-mini-tag">Sin enlaces externos disponibles por ahora</span>'}</div>
                <div class="ad-slot ad-slot-sidebar" style="margin-top:22px;">Publicidad local</div>
            </aside>
        </div></section>
    </main>
    <footer><div class="container"><span>© 2026 Alhaurín al Día · Guía local independiente</span><div class="footer-links"><a href="/noticias/">Noticias</a><a href="/guia-util/">Guía útil</a><a href="/planes/">Planes</a><a href="/comercios/">Comercios</a></div></div></footer>
    <script src="/app.js"></script>
</body>
</html>'''


def actualizar_json(items):
    for item in items:
        item["pagina"] = item_url(item)
        item["enlace"] = item_url(item)
    DATA_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def generar_paginas(items):
    for item in items:
        ruta = BASE_DIR / item_path(item) / "index.html"
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(html_item(item), encoding="utf-8")
    print("Páginas de guía creadas:", len(items))


def actualizar_sitemap(items):
    if not SITEMAP_FILE.exists():
        return
    contenido = SITEMAP_FILE.read_text(encoding="utf-8")
    bloque = []
    today = datetime.now(timezone.utc).date().isoformat()
    for item in items:
        loc = f"{SITE_URL}{item_url(item)}"
        if f"<loc>{loc}</loc>" in contenido:
            continue
        bloque.append("    <url>")
        bloque.append(f"        <loc>{loc}</loc>")
        bloque.append(f"        <lastmod>{today}</lastmod>")
        bloque.append("        <changefreq>monthly</changefreq>")
        bloque.append("        <priority>0.75</priority>")
        bloque.append("    </url>")
    if bloque:
        contenido = contenido.replace("</urlset>", "\n" + "\n".join(bloque) + "\n</urlset>")
        SITEMAP_FILE.write_text(contenido, encoding="utf-8")


def main():
    items = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    actualizar_json(items)
    generar_paginas(items)
    actualizar_sitemap(items)


if __name__ == "__main__":
    main()
