import json
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape


# =========================================
# CONFIGURACIÓN
# =========================================

BASE_DIR = Path(__file__).resolve().parent.parent
NOTICIAS_FILE = BASE_DIR / "data" / "noticias.json"
SITEMAP_FILE = BASE_DIR / "sitemap.xml"
SITE_URL = "https://alhaurinaldia.es"


# =========================================
# UTILIDADES
# =========================================

def normalizar_fecha(fecha_raw):
    if not fecha_raw:
        return datetime.now().date().isoformat()

    try:
        return datetime.fromisoformat(
            fecha_raw.replace("Z", "+00:00")
        ).date().isoformat()
    except Exception:
        return datetime.now().date().isoformat()


def limpiar_url(path):
    path = str(path or "").strip()

    if not path:
        return SITE_URL + "/"

    if path.startswith("http://") or path.startswith("https://"):
        return path

    return f"{SITE_URL}/{path.lstrip('/')}"


def crear_url_xml(loc, lastmod, changefreq="weekly", priority="0.7"):
    return f"""    <url>
        <loc>{escape(loc)}</loc>
        <lastmod>{escape(lastmod)}</lastmod>
        <changefreq>{escape(changefreq)}</changefreq>
        <priority>{escape(priority)}</priority>
    </url>"""


# =========================================
# GENERACIÓN SITEMAP
# =========================================

def cargar_noticias():
    if not NOTICIAS_FILE.exists():
        print("No existe data/noticias.json. Ejecuta primero scripts/generar_noticias.py")
        return []

    with open(NOTICIAS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def generar_sitemap():
    noticias = cargar_noticias()
    hoy = datetime.now().date().isoformat()

    urls = [
        crear_url_xml(
            loc=f"{SITE_URL}/",
            lastmod=hoy,
            changefreq="hourly",
            priority="1.0"
        )
    ]

    for noticia in noticias:
        pagina = noticia.get("pagina")

        if not pagina:
            continue

        urls.append(
            crear_url_xml(
                loc=limpiar_url(pagina),
                lastmod=normalizar_fecha(noticia.get("fecha", "")),
                changefreq="weekly",
                priority="0.8"
            )
        )

    contenido = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(urls)}
</urlset>
"""

    SITEMAP_FILE.write_text(contenido, encoding="utf-8")

    print("Sitemap generado correctamente")
    print("Archivo:", SITEMAP_FILE)
    print("URLs incluidas:", len(urls))


if __name__ == "__main__":
    generar_sitemap()
