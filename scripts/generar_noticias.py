import html
import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote

import feedparser
import requests
import urllib3
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_FILE = BASE_DIR / "data" / "noticias.json"
NOTICIAS_DIR = BASE_DIR / "noticias"
CATEGORIAS_DIR = BASE_DIR / "categoria"
SITEMAP_FILE = BASE_DIR / "sitemap.xml"
SITE_URL = "https://alhaurinaldia.es"

MAX_NOTICIAS_POR_FUENTE = 10
MAX_NOTICIAS_TOTAL = 30
USAR_IA = False

FUENTES = [
    {"nombre": "RTV Alhaurín el Grande", "url": "https://rtvalhaurinelgrande.com/feed/"},
    {"nombre": "ATV Alhaurín YouTube", "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UClgnTGIKzuISyUK8F3v1BFA"},
    {"nombre": "Europa Press Andalucía", "url": "https://www.europapress.es/rss/rss.aspx?ch=00111"},
    {"nombre": "Diario SUR Málaga", "url": "https://www.diariosur.es/rss/2.0/?section=malaga"},
    {"nombre": "Ayuntamiento Alhaurín el Grande", "url": "https://alhaurinelgrande.es/feed/"},
    {"nombre": "Hermandad Nuestro Padre Jesús Nazareno", "url": "https://www.nuestropadrejesusnazareno.com/feed/"},
]

STATIC_URLS = [
    {"loc": "/", "changefreq": "hourly", "priority": "1.0"},
    {"loc": "/noticias/", "changefreq": "hourly", "priority": "0.9"},
    {"loc": "/guia-util/", "changefreq": "weekly", "priority": "0.9"},
    {"loc": "/planes/", "changefreq": "weekly", "priority": "0.7"},
    {"loc": "/comercios/", "changefreq": "weekly", "priority": "0.7"},
    {"loc": "/anunciarse/", "changefreq": "monthly", "priority": "0.6"},
]

load_dotenv()
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def limpiar_html(texto):
    if not texto:
        return ""
    texto = re.sub(r"<[^>]+>", "", str(texto))
    reemplazos = {
        "&nbsp;": " ",
        "&amp;": "&",
        "&quot;": '"',
        "&#8217;": "'",
        "&#8220;": '"',
        "&#8221;": '"',
        "&#8211;": "-",
        "&#8230;": "...",
    }
    for origen, destino in reemplazos.items():
        texto = texto.replace(origen, destino)
    texto = re.sub(r"The post .*", "", texto, flags=re.IGNORECASE).strip()
    return re.sub(r"\s+", " ", texto).strip()


def limitar_texto(texto, max_caracteres=220):
    texto = limpiar_html(texto)
    if len(texto) <= max_caracteres:
        return texto
    return texto[:max_caracteres].rsplit(" ", 1)[0] + "..."


def escapar(texto):
    return html.escape(str(texto or ""), quote=True)


def slugify(texto, max_caracteres=90):
    texto = limpiar_html(texto).lower()
    reemplazos = {
        "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u",
        "à": "a", "è": "e", "ì": "i", "ò": "o", "ù": "u",
        "ä": "a", "ë": "e", "ï": "i", "ö": "o", "ü": "u",
        "ñ": "n", "ç": "c",
    }
    for origen, destino in reemplazos.items():
        texto = texto.replace(origen, destino)
    texto = re.sub(r"[^a-z0-9]+", "-", texto).strip("-")
    return texto[:max_caracteres].strip("-") or "noticia"


def normalizar_fecha(fecha_raw):
    if not fecha_raw:
        return datetime.now(timezone.utc).isoformat()
    try:
        fecha = parsedate_to_datetime(fecha_raw)
        if fecha.tzinfo is None:
            fecha = fecha.replace(tzinfo=timezone.utc)
        return fecha.isoformat()
    except Exception:
        return datetime.now(timezone.utc).isoformat()


def fecha_para_ordenacion(fecha_iso):
    try:
        fecha = datetime.fromisoformat(fecha_iso.replace("Z", "+00:00"))
        if fecha.tzinfo is None:
            fecha = fecha.replace(tzinfo=timezone.utc)
        return fecha
    except Exception:
        return datetime.min.replace(tzinfo=timezone.utc)


def formatear_fecha(fecha_iso):
    try:
        return datetime.fromisoformat(fecha_iso.replace("Z", "+00:00")).strftime("%d/%m/%Y")
    except Exception:
        return ""


def fecha_sitemap(fecha_iso=""):
    try:
        return datetime.fromisoformat(fecha_iso.replace("Z", "+00:00")).date().isoformat()
    except Exception:
        return datetime.now(timezone.utc).date().isoformat()


def tiempo_lectura(texto):
    palabras = len(limpiar_html(texto).split())
    minutos = max(1, round(palabras / 220))
    return f"{minutos} min de lectura"


def generar_id(url, titulo):
    return slugify(url or titulo, 80)


def generar_ruta_pagina(titulo):
    return f"noticias/{slugify(titulo)}.html"


def generar_ruta_categoria(categoria):
    return f"categoria/{slugify(categoria)}/index.html"


def prioridad_fuente(fuente):
    fuente = fuente.lower()
    if "ayuntamiento alhaurín" in fuente:
        return 120
    if "diario sur" in fuente:
        return 100
    if "hermandad nuestro padre jesús nazareno" in fuente:
        return 95
    if "rtv alhaurín" in fuente:
        return 90
    if "atv alhaurín" in fuente:
        return 80
    if "europa press" in fuente:
        return 50
    return 10


def calcular_score(noticia):
    fecha = fecha_para_ordenacion(noticia["fecha"])
    try:
        horas = (datetime.now(fecha.tzinfo) - fecha).total_seconds() / 3600
    except Exception:
        horas = 999
    return noticia["prioridad"] + max(0, 48 - horas)


def es_noticia_relevante_local(titulo, texto, fuente):
    fuente_lower = fuente.lower()
    fuentes_validas = [
        "rtv alhaurín el grande",
        "atv alhaurín youtube",
        "ayuntamiento alhaurín el grande",
        "hermandad nuestro padre jesús nazareno",
    ]
    if any(f in fuente_lower for f in fuentes_validas):
        return True
    contenido = f"{titulo} {texto}".lower()
    return "alhaurín el grande" in contenido or "alhaurin el grande" in contenido


def extraer_imagen_feed(feed):
    imagen = getattr(feed.feed, "image", None)
    if not imagen:
        return ""
    if isinstance(imagen, dict):
        return imagen.get("href") or imagen.get("url") or ""
    return getattr(imagen, "href", "") or getattr(imagen, "url", "") or ""


def extraer_imagen(entry, imagen_feed=""):
    if hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
        return entry.media_thumbnail[0].get("url", "")
    if hasattr(entry, "media_content") and entry.media_content:
        return entry.media_content[0].get("url", "")

    campos = [
        entry.get("summary", ""),
        entry.get("description", ""),
        getattr(entry, "content", [{}])[0].get("value", "") if hasattr(entry, "content") else "",
    ]
    for contenido in campos:
        match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', contenido)
        if match:
            return match.group(1)

    if "links" in entry:
        for link in entry.links:
            if link.get("type", "").startswith("image/"):
                return link.get("href", "")
    return imagen_feed or ""


def detectar_categoria(titulo, texto, fuente):
    contenido = f"{titulo} {texto} {fuente}".lower()
    categorias = {
        "Fiestas y Tradiciones": ["feria", "romería", "fiesta", "cruz", "semana santa", "procesión", "cabalgata", "carnaval", "pregón"],
        "Agenda Cultural": ["teatro", "concierto", "música", "exposición", "libro", "biblioteca", "arte", "flamenco", "festival", "presentación"],
        "Deportes": ["deporte", "fútbol", "baloncesto", "carrera", "trail", "torneo", "club", "partido", "pedal", "atletismo"],
        "Municipal": ["ayuntamiento", "alcalde", "alcaldesa", "pleno", "concejal", "municipal", "presupuesto", "subvención"],
        "Obras y Servicios": ["obra", "obras", "reforma", "calle", "asfaltado", "limpieza", "alumbrado", "saneamiento"],
        "Tráfico y Movilidad": ["tráfico", "carretera", "corte", "desvío", "aparcamiento", "circulación", "transporte", "autobús"],
        "Educación": ["colegio", "instituto", "escuela", "alumnado", "educación", "formación", "curso", "estudiantes"],
        "Comercio y Empresa": ["comercio", "mercado", "hostelería", "empresa", "negocio", "emprendedores", "autónomos"],
        "Turismo y Patrimonio": ["turismo", "ruta", "mirador", "sendero", "patrimonio", "visita guiada", "monumento", "historia"],
        "Sucesos": ["suceso", "detenido", "incendio", "accidente", "policía", "guardia civil", "emergencia", "rescate", "herido"],
        "Vídeos": ["youtube", "vídeo", "video", "entrevista", "atv"],
    }
    puntuaciones = {}
    titulo_lower = titulo.lower()
    for categoria, palabras in categorias.items():
        score = 0
        for palabra in palabras:
            if palabra in contenido:
                score += 10
                if palabra in titulo_lower:
                    score += 8
        if score:
            puntuaciones[categoria] = score
    return max(puntuaciones, key=puntuaciones.get) if puntuaciones else "Actualidad"


def resumir_con_ia(titulo, texto, fuente):
    if not USAR_IA:
        return limitar_texto(texto)
    try:
        from openai import OpenAI
        client = OpenAI()
        response = client.responses.create(
            model="gpt-4.1-mini",
            input=f"Resume esta noticia local en español, máximo 2 frases, sin inventar datos.\nTítulo: {titulo}\nFuente: {fuente}\nTexto: {texto}"
        )
        return response.output_text.strip() or limitar_texto(texto)
    except Exception as e:
        print("Error IA:", e)
        return limitar_texto(texto)


def leer_feed(url):
    response = requests.get(url, timeout=20, headers={"User-Agent": "Mozilla/5.0"}, verify=False)
    response.raise_for_status()
    return feedparser.parse(response.text)


def schema_news_article(noticia, canonical_url):
    imagen = noticia.get("imagen") or f"{SITE_URL}/assets/favicon.svg"
    data = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": noticia.get("titulo", ""),
        "description": noticia.get("descripcion") or noticia.get("resumen") or "",
        "datePublished": noticia.get("fecha", ""),
        "dateModified": noticia.get("fecha", ""),
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical_url},
        "image": [imagen],
        "inLanguage": "es-ES",
        "isAccessibleForFree": True,
        "author": {"@type": "Organization", "name": noticia.get("fuente") or "Alhaurín al Día"},
        "publisher": {
            "@type": "Organization",
            "name": "Alhaurín al Día",
            "url": SITE_URL,
            "logo": {"@type": "ImageObject", "url": f"{SITE_URL}/assets/favicon.svg"},
        },
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def html_header(title, description, canonical, image="", css_prefix=".."):
    image = image or f"{SITE_URL}/assets/favicon.svg"
    return f'''<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{escapar(title)}</title>
    <meta name="description" content="{escapar(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="{escapar(canonical)}">
    <meta property="og:type" content="article">
    <meta property="og:site_name" content="Alhaurín al Día">
    <meta property="og:title" content="{escapar(title)}">
    <meta property="og:description" content="{escapar(description)}">
    <meta property="og:url" content="{escapar(canonical)}">
    <meta property="og:image" content="{escapar(image)}">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" type="image/svg+xml" href="{css_prefix}/assets/favicon.svg">
    <link rel="stylesheet" href="{css_prefix}/styles.css">
    <link rel="stylesheet" href="{css_prefix}/mobile.css">
    <link rel="stylesheet" href="{css_prefix}/ads.css">
    <link rel="stylesheet" href="{css_prefix}/article.css">
</head>'''


def site_chrome(content, prefix=".."):
    return f'''<body>
    <div class="topbar"><div class="container"><span>Guía local independiente de Alhaurín el Grande</span><span>Noticias · Guía útil · Comercios · Planes</span></div></div>
    <header><div class="container"><nav aria-label="Navegación principal">
        <a class="logo" href="{prefix}/" aria-label="Alhaurín al Día"><span class="logo-mark">A</span><span><strong>Alhaurín al Día</strong><span>Información local útil</span></span></a>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-menu" aria-label="Abrir menú de navegación"><span></span><span></span><span></span></button>
        <div class="nav-links" id="main-menu"><a href="{prefix}/noticias/">Noticias</a><a href="{prefix}/guia-util/">Guía útil</a><a href="{prefix}/planes/">Planes</a><a href="{prefix}/comercios/">Comercios</a><a href="{prefix}/anunciarse/" class="nav-cta">Anunciarse</a></div>
    </nav></div></header>
    {content}
    <footer><div class="container"><span>© 2026 Alhaurín al Día · Guía local independiente</span><div class="footer-links"><a href="{prefix}/noticias/">Noticias</a><a href="{prefix}/guia-util/">Guía útil</a><a href="{prefix}/planes/">Planes</a><a href="{prefix}/comercios/">Comercios</a><a href="{prefix}/anunciarse/">Anunciarse</a></div></div></footer>
    <script src="{prefix}/app.js"></script>
</body>'''


def bloque_relacionadas(noticia, noticias):
    categoria = noticia.get("categoria", "Actualidad")
    relacionadas = [n for n in noticias if n.get("id") != noticia.get("id") and n.get("categoria") == categoria][:3]
    if len(relacionadas) < 3:
        relacionadas += [n for n in noticias if n.get("id") != noticia.get("id") and n not in relacionadas][:3 - len(relacionadas)]
    if not relacionadas:
        return ""
    cards = "".join(
        f'''<a class="related-card" href="../{escapar(item.get('pagina', '#'))}">
            <span>{escapar(item.get('categoria', 'Actualidad'))}</span>
            <strong>{escapar(item.get('titulo', 'Noticia local'))}</strong>
        </a>'''
        for item in relacionadas
    )
    return f'''<section class="related-news" aria-label="Noticias relacionadas">
        <div class="section-title compact"><div><span class="section-kicker">Sigue leyendo</span><h2>Noticias relacionadas</h2></div></div>
        <div class="related-grid">{cards}</div>
    </section>'''


def generar_html_noticia(noticia, noticias):
    titulo = noticia.get("titulo", "Noticia local")
    descripcion = noticia.get("descripcion") or noticia.get("resumen") or "Actualidad de Alhaurín el Grande."
    canonical = f"{SITE_URL}/{noticia.get('pagina', '')}"
    imagen = noticia.get("imagen", "")
    categoria = noticia.get("categoria", "Actualidad")
    fuente = noticia.get("fuente", "")
    fecha = formatear_fecha(noticia.get("fecha", ""))
    enlace_original = noticia.get("enlace") or noticia.get("url") or "#"
    lectura = tiempo_lectura(f"{titulo} {descripcion}")
    share_text = quote(f"{titulo} {canonical}")
    share_url = quote(canonical, safe="")

    imagen_html = f'<figure class="article-hero-image"><img src="{escapar(imagen)}" alt="{escapar(titulo)}"><figcaption>{escapar(fuente or "Alhaurín al Día")}</figcaption></figure>' if imagen else '<div class="article-hero-placeholder">Alhaurín al Día</div>'
    relacionadas = bloque_relacionadas(noticia, noticias)

    body = f'''
    <main class="article-page">
        <div class="container article-shell">
            <div class="breadcrumb"><a href="../">Inicio</a><span>›</span><a href="../noticias/">Noticias</a><span>›</span><a href="../categoria/{slugify(categoria)}/">{escapar(categoria)}</a></div>

            <div class="article-layout premium-article-layout">
                <article class="article-card premium-article-card">
                    <header class="article-hero">
                        <div class="article-meta"><span class="tag">{escapar(categoria)}</span>{f'<span class="source-mini-tag">{escapar(fuente)}</span>' if fuente else ''}{f'<span class="source-mini-tag">{escapar(fecha)}</span>' if fecha else ''}<span class="source-mini-tag">{escapar(lectura)}</span></div>
                        <h1 class="article-title">{escapar(titulo)}</h1>
                        <p class="article-summary">{escapar(descripcion)}</p>
                    </header>

                    {imagen_html}

                    <div class="article-content premium-article-content">
                        <p>{escapar(descripcion)}</p>

                        <div class="article-inline-ad">
                            <div class="ad-slot ad-slot-native">Publicidad integrada en la noticia</div>
                        </div>

                        <p>Alhaurín al Día recopila y organiza esta información para facilitar el acceso a la actualidad local de Alhaurín el Grande, respetando la fuente original y enlazando siempre al contenido de referencia.</p>

                        <div class="article-source-box">
                            <div><span>Fuente original</span><strong>{escapar(fuente or "Fuente externa")}</strong></div>
                            <a class="btn btn-primary" href="{escapar(enlace_original)}" target="_blank" rel="noopener noreferrer">Leer en la fuente original</a>
                        </div>
                    </div>
                </article>

                <aside class="article-sidebar premium-article-sidebar" aria-label="Opciones de la noticia">
                    <div class="share-card">
                        <span class="mini-label">Compartir</span>
                        <h2>Comparte esta noticia</h2>
                        <div class="share-actions">
                            <a href="https://api.whatsapp.com/send?text={share_text}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
                            <a href="https://www.facebook.com/sharer/sharer.php?u={share_url}" target="_blank" rel="noopener noreferrer">Facebook</a>
                            <a href="https://twitter.com/intent/tweet?url={share_url}&text={quote(titulo)}" target="_blank" rel="noopener noreferrer">X</a>
                        </div>
                    </div>

                    <div class="ad-slot ad-slot-sidebar ad-slot-sticky">Publicidad lateral</div>
                </aside>
            </div>

            {relacionadas}
        </div>
    </main>
    <script type="application/ld+json">{schema_news_article(noticia, canonical)}</script>
    '''
    return f'<!doctype html>\n<html lang="es">\n{html_header(titulo + " | Alhaurín al Día", descripcion, canonical, imagen, "..")}\n{site_chrome(body, "..")}\n</html>'


def generar_html_categoria(categoria, noticias):
    slug = slugify(categoria)
    canonical = f"{SITE_URL}/categoria/{slug}/"
    descripcion = f"Últimas noticias de {categoria} en Alhaurín el Grande. Actualidad local, avisos y novedades recopiladas por Alhaurín al Día."
    cards = []
    for noticia in noticias:
        img = noticia.get("imagen", "")
        cards.append(f'''
        <article class="content-card news-card">
            {f'<div class="news-image"><img src="{escapar(img)}" alt="{escapar(noticia.get("titulo", ""))}" loading="lazy"></div>' if img else '<div class="news-image news-placeholder"><span>Alhaurín al Día</span></div>'}
            <div class="news-body"><span class="tag">{escapar(categoria)}</span><h3>{escapar(noticia.get("titulo", "Noticia"))}</h3><p>{escapar(noticia.get("descripcion") or noticia.get("resumen") or "")}</p></div>
            <div class="news-footer"><small>{escapar(noticia.get("fuente", ""))}</small><a class="read-more" href="../../{escapar(noticia.get("pagina", "#"))}">Leer noticia →</a></div>
        </article>
        ''')
    body = f'''
    <main>
        <section class="hero"><div class="container"><div class="hero-card"><span class="eyebrow">Categoría</span><h1>{escapar(categoria)}</h1><p class="lead">{escapar(descripcion)}</p></div></div></section>
        <section><div class="container"><div class="section-title"><h2>Últimas noticias</h2><p>{len(noticias)} noticias disponibles en esta categoría.</p></div><div class="grid-3">{''.join(cards)}</div></div></section>
    </main>
    '''
    return f'<!doctype html>\n<html lang="es">\n{html_header(categoria + " | Alhaurín al Día", descripcion, canonical, "", "../..")}\n{site_chrome(body, "../..")}\n</html>'


def generar_paginas_noticias(noticias):
    NOTICIAS_DIR.mkdir(parents=True, exist_ok=True)
    rutas_usadas = set()
    for noticia in noticias:
        ruta_base = generar_ruta_pagina(noticia.get("titulo", noticia.get("id", "noticia")))
        ruta = ruta_base
        contador = 2
        while ruta in rutas_usadas:
            ruta = f"noticias/{Path(ruta_base).stem}-{contador}.html"
            contador += 1
        rutas_usadas.add(ruta)
        noticia["pagina"] = ruta
    for noticia in noticias:
        (BASE_DIR / noticia["pagina"]).write_text(generar_html_noticia(noticia, noticias), encoding="utf-8")
    print("Páginas individuales creadas:", len(noticias))


def generar_paginas_categorias(noticias):
    por_categoria = defaultdict(list)
    for noticia in noticias:
        por_categoria[noticia.get("categoria", "Actualidad")].append(noticia)
    for categoria, items in por_categoria.items():
        ruta = BASE_DIR / generar_ruta_categoria(categoria)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(generar_html_categoria(categoria, items), encoding="utf-8")
    print("Páginas de categoría creadas:", len(por_categoria))
    return sorted(por_categoria.keys())


def generar_sitemap(noticias, categorias):
    today = datetime.now(timezone.utc).date().isoformat()
    urls = []
    for item in STATIC_URLS:
        urls.append({"loc": f"{SITE_URL}{item['loc']}", "lastmod": today, "changefreq": item["changefreq"], "priority": item["priority"]})
    for categoria in categorias:
        urls.append({"loc": f"{SITE_URL}/categoria/{slugify(categoria)}/", "lastmod": today, "changefreq": "daily", "priority": "0.8"})
    for noticia in noticias:
        urls.append({"loc": f"{SITE_URL}/{noticia.get('pagina', '')}", "lastmod": fecha_sitemap(noticia.get("fecha", "")), "changefreq": "weekly", "priority": "0.8"})

    xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for item in urls:
        xml.append("    <url>")
        xml.append(f"        <loc>{escapar(item['loc'])}</loc>")
        xml.append(f"        <lastmod>{item['lastmod']}</lastmod>")
        xml.append(f"        <changefreq>{item['changefreq']}</changefreq>")
        xml.append(f"        <priority>{item['priority']}</priority>")
        xml.append("    </url>")
    xml.append("</urlset>")
    SITEMAP_FILE.write_text("\n".join(xml) + "\n", encoding="utf-8")
    print("Sitemap actualizado:", SITEMAP_FILE)


def obtener_noticias():
    noticias = []
    urls_vistas = set()
    print("\nGenerando noticias para Alhaurín al Día")
    print("Archivo destino:", OUTPUT_FILE)

    for fuente in FUENTES:
        print("\n====================================")
        print("Leyendo:", fuente["nombre"])
        print("====================================")
        try:
            feed = leer_feed(fuente["url"])
        except Exception as e:
            print("Error leyendo fuente:", fuente["nombre"], e)
            continue

        print("Entradas encontradas:", len(feed.entries))
        imagen_feed = extraer_imagen_feed(feed)

        for entry in feed.entries[:MAX_NOTICIAS_POR_FUENTE]:
            titulo = limpiar_html(entry.get("title", ""))
            url = entry.get("link", "")
            if not titulo or not url or url in urls_vistas:
                continue
            urls_vistas.add(url)
            texto_limpio = limpiar_html(entry.get("summary", "") or entry.get("description", "") or titulo)
            if not es_noticia_relevante_local(titulo, texto_limpio, fuente["nombre"]):
                print(f"✗ Descartada por no ser local: {titulo}")
                continue
            resumen = resumir_con_ia(titulo, texto_limpio, fuente["nombre"])
            categoria = detectar_categoria(titulo, texto_limpio, fuente["nombre"])
            noticia = {
                "id": generar_id(url, titulo),
                "titulo": titulo,
                "descripcion": resumen,
                "resumen": resumen,
                "fecha": normalizar_fecha(entry.get("published", "")),
                "fuente": fuente["nombre"],
                "categoria": categoria,
                "categoria_url": f"categoria/{slugify(categoria)}/",
                "enlace": url,
                "url": url,
                "imagen": extraer_imagen(entry, imagen_feed),
                "prioridad": prioridad_fuente(fuente["nombre"]),
            }
            noticias.append(noticia)
            print(f"✓ {categoria} | {titulo}")

    noticias.sort(key=calcular_score, reverse=True)
    return noticias[:MAX_NOTICIAS_TOTAL]


def guardar_noticias(noticias):
    generar_paginas_noticias(noticias)
    categorias = generar_paginas_categorias(noticias)
    generar_sitemap(noticias, categorias)
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(noticias, f, ensure_ascii=False, indent=2)
    print("\n====================================")
    print("Noticias generadas:", len(noticias))
    print("Archivo creado:", OUTPUT_FILE)
    print("====================================")


if __name__ == "__main__":
    guardar_noticias(obtener_noticias())
