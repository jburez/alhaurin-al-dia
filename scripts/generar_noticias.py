import html
import json
import os
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
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

CATEGORIAS_VALIDAS = [
    "Actualidad",
    "Fiestas y Tradiciones",
    "Agenda Cultural",
    "Deportes",
    "Municipal",
    "Obras y Servicios",
    "Tráfico y Movilidad",
    "Educación",
    "Comercio y Empresa",
    "Turismo y Patrimonio",
    "Sucesos",
    "Vídeos",
]

FUENTES = [
    {"nombre": "RTV Alhaurín el Grande",
        "url": "https://rtvalhaurinelgrande.com/feed/"},
    {"nombre": "ATV Alhaurín YouTube",
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UClgnTGIKzuISyUK8F3v1BFA"},
    {"nombre": "Europa Press Andalucía",
        "url": "https://www.europapress.es/rss/rss.aspx?ch=00111"},
    {"nombre": "Diario SUR Málaga",
        "url": "https://www.diariosur.es/rss/2.0/?section=malaga"},
    {"nombre": "Ayuntamiento Alhaurín el Grande",
        "url": "https://alhaurinelgrande.es/feed/"},
    {"nombre": "Hermandad Nuestro Padre Jesús Nazareno",
        "url": "https://www.nuestropadrejesusnazareno.com/feed/"},
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


def ia_activada():
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


def limpiar_html(texto):
    if not texto:
        return ""
    texto = html.unescape(str(texto))
    texto = re.sub(r"<[^>]+>", "", texto)
    texto = re.sub(r"The post .*", "", texto, flags=re.IGNORECASE).strip()
    texto = re.sub(r"\[\s*(?:\.{3}|…)\s*\]", "", texto)
    texto = texto.replace("…", "...")
    return re.sub(r"\s+", " ", texto).strip()


def limpiar_resumen_editorial(texto, max_caracteres=220):
    texto = limpiar_html(texto)
    texto = re.sub(r"\s*\[\s*(?:\.{3}|…)\s*\]\s*", " ", texto)
    texto = re.sub(r"\s+", " ", texto).strip(" -–—")

    texto = re.sub(
        r"^Noticias de Alhaurín el Grande\.?\s*Actualidad del .*? en el Informativo de ATV\.?\s*",
        "",
        texto,
        flags=re.IGNORECASE,
    )

    texto = texto.strip(" -–—")
    if not texto:
        return "Actualidad local de Alhaurín el Grande."

    if len(texto) <= max_caracteres:
        return texto

    return texto[:max_caracteres].rsplit(" ", 1)[0].rstrip(".,;:") + "..."


def normalizar_frase_completa(texto, fallback="", max_caracteres=260):
    texto = limpiar_html(texto).strip()
    texto = texto.replace("...", ".")
    texto = re.sub(r"\s+", " ", texto).strip(" -–—")

    if not texto:
        return fallback

    if len(texto) > max_caracteres:
        recorte = texto[:max_caracteres].rsplit(" ", 1)[0]
        frases = re.split(r"(?<=[.!?])\s+", recorte)
        completas = [f.strip()
                     for f in frases if re.search(r"[.!?]$", f.strip())]
        texto = " ".join(
            completas) if completas else recorte.rstrip(".,;:") + "."

    if texto and not re.search(r"[.!?]$", texto):
        texto += "."

    return texto


def dividir_parrafos(texto):
    texto = limpiar_html(texto)
    partes = [p.strip() for p in re.split(
        r"\n+|(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ])", texto) if p.strip()]
    if not partes:
        return []

    parrafos = []
    actual = ""

    for parte in partes:
        if not actual:
            actual = parte
        elif len(actual) < 220:
            actual += " " + parte
        else:
            parrafos.append(actual)
            actual = parte

    if actual:
        parrafos.append(actual)

    return [normalizar_frase_completa(p, max_caracteres=420) for p in parrafos[:3]]


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


def es_titulo_generico(titulo):
    titulo_lower = limpiar_html(titulo).lower()
    patrones = [
        r"^noticias\s+atv\s+\d{1,2}\s+\w+\s+\d{4}",
        r"^actualidad\s+de\s+alhaurín",
        r"^informativo\s+atv",
    ]
    return any(re.search(patron, titulo_lower, flags=re.IGNORECASE) for patron in patrones)


def extraer_primer_tema_informativo(texto):
    texto = limpiar_html(texto)
    patrones = [
        r"(?:^|\s)1\.\s*([A-ZÁÉÍÓÚÑ0-9][^\.]{25,180})",
        r"(?:^|\s)1\s*[-–]\s*([A-ZÁÉÍÓÚÑ0-9][^\.]{25,180})",
    ]
    for patron in patrones:
        match = re.search(patron, texto)
        if match:
            tema = re.sub(r"\s+", " ", match.group(1)).strip(" .:-–—")
            if len(tema) >= 25:
                return tema
    return ""


def titular_desde_tema(tema):
    tema = limpiar_html(tema).strip(" .:-–—")
    if not tema:
        return ""

    tema = tema.lower()
    tema = tema[0].upper() + tema[1:] if tema else tema

    if "alhaurín" not in tema.lower() and "alhaurin" not in tema.lower():
        tema = f"{tema} en Alhaurín el Grande"

    return tema[:90].rsplit(" ", 1)[0].rstrip(".,;:")


def generar_titulo_seo(titulo, texto, fuente):
    titulo_limpio = limpiar_html(titulo)

    if es_titulo_generico(titulo_limpio):
        titulo_seo = titular_desde_tema(extraer_primer_tema_informativo(texto))
        if titulo_seo:
            return titulo_seo

    titulo_limpio = re.sub(r"\s*\|\s*.*$", "", titulo_limpio).strip()
    titulo_limpio = re.sub(r"\s+", " ", titulo_limpio)

    if len(titulo_limpio) > 95:
        titulo_limpio = titulo_limpio[:95].rsplit(" ", 1)[0].rstrip(".,;:")

    return titulo_limpio or "Actualidad local de Alhaurín el Grande"


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
        getattr(entry, "content", [{}])[0].get(
            "value", "") if hasattr(entry, "content") else "",
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


def parsear_json_ia(contenido):
    contenido = contenido.strip()
    contenido = re.sub(r"^```(?:json)?", "", contenido,
                       flags=re.IGNORECASE).strip()
    contenido = re.sub(r"```$", "", contenido).strip()

    match = re.search(r"\{.*\}", contenido, flags=re.DOTALL)
    if match:
        contenido = match.group(0)

    return json.loads(contenido)


def fallback_editorial(titulo_original, texto, fuente):
    titulo = generar_titulo_seo(titulo_original, texto, fuente)
    descripcion = normalizar_frase_completa(
        limpiar_resumen_editorial(texto, 230),
        fallback="Actualidad local de Alhaurín el Grande.",
        max_caracteres=230,
    )

    parrafos = dividir_parrafos(texto)
    if not parrafos:
        parrafos = [descripcion]

    cuerpo = "\n\n".join(parrafos[:3])
    categoria = detectar_categoria(titulo, texto, fuente)

    return {
        "titulo": titulo,
        "descripcion": descripcion,
        "cuerpo": cuerpo,
        "categoria": categoria,
        "seo_keywords": [],
    }


def mejorar_noticia_con_ia(titulo_original, texto, fuente):
    fallback = fallback_editorial(titulo_original, texto, fuente)

    if not ia_activada():
        return fallback

    try:
        from openai import OpenAI

        client = OpenAI()

        prompt = f"""
Eres editor jefe SEO de un medio digital hiperlocal llamado Alhaurín al Día.

Debes mejorar esta noticia para publicarla de forma clara, útil y profesional.

Devuelve SOLO JSON válido con estas claves:
{{
  "titulo": "Titular SEO natural, máximo 90 caracteres",
  "descripcion": "Entradilla completa de 1 frase, máximo 230 caracteres",
  "cuerpo": "Texto desarrollado en 2 o 3 párrafos breves, sin repetir literalmente la entradilla",
  "categoria": "Una categoría válida",
  "seo_keywords": ["keyword 1", "keyword 2", "keyword 3"]
}}

Categorías válidas:
{json.dumps(CATEGORIAS_VALIDAS, ensure_ascii=False)}

Reglas obligatorias:
- No inventes datos, nombres, fechas, lugares, horarios ni cifras.
- No termines frases a medias.
- No uses puntos suspensivos.
- No empieces con frases vagas tipo "Durante el..." si no se completa bien.
- La descripcion debe ser distinta al cuerpo.
- El cuerpo debe ampliar y ordenar la información, no repetir la entradilla.
- Mantén foco local en Alhaurín el Grande cuando proceda.
- Si el título original es genérico tipo "NOTICIAS ATV", crea un titular basado en el tema principal real.
- No incluyas la nota de Alhaurín al Día dentro del cuerpo.
- No menciones a la IA.

Título original:
{titulo_original}

Fuente:
{fuente}

Texto disponible:
{texto[:4000]}
"""

        response = client.responses.create(
            model=OPENAI_MODEL,
            input=prompt,
            temperature=0.2,
        )

        data = parsear_json_ia(response.output_text)

        titulo = limpiar_html(data.get("titulo") or fallback["titulo"])
        descripcion = normalizar_frase_completa(
            data.get("descripcion") or fallback["descripcion"],
            fallback=fallback["descripcion"],
            max_caracteres=230,
        )

        cuerpo_raw = data.get("cuerpo") or fallback["cuerpo"]
        parrafos = dividir_parrafos(cuerpo_raw)
        cuerpo = "\n\n".join(parrafos[:3]) if parrafos else fallback["cuerpo"]

        if cuerpo.strip() == descripcion.strip():
            cuerpo = fallback["cuerpo"]

        categoria = data.get("categoria") or fallback["categoria"]
        if categoria not in CATEGORIAS_VALIDAS:
            categoria = fallback["categoria"]

        keywords = data.get("seo_keywords") or []
        if not isinstance(keywords, list):
            keywords = []
        keywords = [limpiar_html(k) for k in keywords[:6] if limpiar_html(k)]

        return {
            "titulo": titulo[:95].rsplit(" ", 1)[0].rstrip(".,;:") if len(titulo) > 95 else titulo,
            "descripcion": descripcion,
            "cuerpo": cuerpo,
            "categoria": categoria,
            "seo_keywords": keywords,
        }

    except Exception as e:
        print("Error IA:", e)
        return fallback


def leer_feed(url):
    response = requests.get(url, timeout=20, headers={
                            "User-Agent": "Mozilla/5.0"}, verify=False)
    response.raise_for_status()
    return feedparser.parse(response.text)


def schema_news_article(noticia, canonical_url):
    imagen = noticia.get("imagen") or f"{SITE_URL}/assets/favicon.svg"
    data = {
        "@context": "https://schema.org",
        "@type": "NewsArticle",
        "headline": noticia.get("titulo", ""),
        "description": noticia.get("descripcion") or noticia.get("resumen") or "",
        "articleBody": noticia.get("cuerpo", ""),
        "datePublished": noticia.get("fecha", ""),
        "dateModified": noticia.get("fecha", ""),
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical_url},
        "image": [imagen],
        "inLanguage": "es-ES",
        "isAccessibleForFree": True,
        "articleSection": noticia.get("categoria", "Actualidad"),
        "keywords": noticia.get("seo_keywords", []),
        "author": {"@type": "Organization", "name": noticia.get("fuente") or "Alhaurín al Día"},
        "publisher": {
            "@type": "Organization",
            "name": "Alhaurín al Día",
            "url": SITE_URL,
            "logo": {"@type": "ImageObject", "url": f"{SITE_URL}/assets/favicon.svg"},
        },
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def schema_breadcrumb_list(noticia, canonical_url):
    categoria = noticia.get("categoria", "Actualidad")
    data = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1,
                "name": "Inicio", "item": f"{SITE_URL}/"},
            {"@type": "ListItem", "position": 2, "name": "Noticias",
                "item": f"{SITE_URL}/noticias/"},
            {"@type": "ListItem", "position": 3, "name": categoria,
                "item": f"{SITE_URL}/categoria/{slugify(categoria)}/"},
            {"@type": "ListItem", "position": 4,
                "name": noticia.get("titulo", "Noticia local"), "item": canonical_url},
        ],
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def html_header(title, description, canonical, image="", css_prefix="..", og_type="article"):
    image = image or f"{SITE_URL}/assets/favicon.svg"
    return f'''<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{escapar(title)}</title>
    <meta name="description" content="{escapar(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="{escapar(canonical)}">
    <meta property="og:type" content="{escapar(og_type)}">
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
    relacionadas = [n for n in noticias if n.get("id") != noticia.get(
        "id") and n.get("categoria") == categoria][:3]

    if len(relacionadas) < 3:
        relacionadas += [n for n in noticias if n.get("id") != noticia.get(
            "id") and n not in relacionadas][:3 - len(relacionadas)]

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


def renderizar_parrafos_cuerpo(cuerpo):
    parrafos = dividir_parrafos(cuerpo)
    if not parrafos:
        return ""
    return "\n".join(f"<p>{escapar(parrafo)}</p>" for parrafo in parrafos)


def generar_html_noticia(noticia, noticias):
    titulo = noticia.get("titulo", "Noticia local")
    descripcion = noticia.get("descripcion") or noticia.get(
        "resumen") or "Actualidad de Alhaurín el Grande."
    cuerpo = noticia.get("cuerpo") or descripcion
    canonical = f"{SITE_URL}/{noticia.get('pagina', '')}"
    imagen = noticia.get("imagen", "")
    categoria = noticia.get("categoria", "Actualidad")
    fuente = noticia.get("fuente", "")
    fecha = formatear_fecha(noticia.get("fecha", ""))
    enlace_original = noticia.get("enlace") or noticia.get("url") or "#"
    lectura = tiempo_lectura(f"{titulo} {descripcion} {cuerpo}")
    share_text = quote(f"{titulo} {canonical}")
    share_url = quote(canonical, safe="")

    imagen_html = (
        f'<figure class="article-hero-image"><img src="{escapar(imagen)}" alt="{escapar(titulo)}"><figcaption>{escapar(fuente or "Alhaurín al Día")}</figcaption></figure>'
        if imagen else '<div class="article-hero-placeholder">Alhaurín al Día</div>'
    )

    cuerpo_html = renderizar_parrafos_cuerpo(cuerpo)
    relacionadas = bloque_relacionadas(noticia, noticias)
    breadcrumb_schema = schema_breadcrumb_list(noticia, canonical)

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
                        {cuerpo_html}

                        <div class="article-inline-ad">
                            <div class="ad-slot ad-slot-native">Publicidad integrada en la noticia</div>
                        </div>

                        <aside class="article-editorial-note">
                            <strong>Nota de Alhaurín al Día</strong>
                            <p>Alhaurín al Día recopila y organiza esta información para facilitar el acceso a la actualidad local de Alhaurín el Grande, respetando la fuente original y enlazando siempre al contenido de referencia.</p>
                        </aside>

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
    <script type="application/ld+json">{breadcrumb_schema}</script>
    '''

    return f'<!doctype html>\n<html lang="es">\n{html_header(titulo + " | Alhaurín al Día", descripcion, canonical, imagen, "..", "article")}\n{site_chrome(body, "..")}\n</html>'


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

    return f'<!doctype html>\n<html lang="es">\n{html_header(categoria + " | Alhaurín al Día", descripcion, canonical, "", "../..", "website")}\n{site_chrome(body, "../..")}\n</html>'


def generar_paginas_noticias(noticias):
    NOTICIAS_DIR.mkdir(parents=True, exist_ok=True)
    rutas_usadas = set()

    for noticia in noticias:
        ruta_base = generar_ruta_pagina(noticia.get(
            "titulo", noticia.get("id", "noticia")))
        ruta = ruta_base
        contador = 2

        while ruta in rutas_usadas:
            ruta = f"noticias/{Path(ruta_base).stem}-{contador}.html"
            contador += 1

        rutas_usadas.add(ruta)
        noticia["pagina"] = ruta

    for noticia in noticias:
        (BASE_DIR / noticia["pagina"]).write_text(
            generar_html_noticia(noticia, noticias), encoding="utf-8")

    print("Páginas individuales creadas:", len(noticias))


def generar_paginas_categorias(noticias):
    por_categoria = defaultdict(list)

    for noticia in noticias:
        por_categoria[noticia.get("categoria", "Actualidad")].append(noticia)

    for categoria, items in por_categoria.items():
        ruta = BASE_DIR / generar_ruta_categoria(categoria)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        ruta.write_text(generar_html_categoria(
            categoria, items), encoding="utf-8")

    print("Páginas de categoría creadas:", len(por_categoria))
    return sorted(por_categoria.keys())


def generar_sitemap(noticias, categorias):
    today = datetime.now(timezone.utc).date().isoformat()
    urls = []

    for item in STATIC_URLS:
        urls.append({
            "loc": f"{SITE_URL}{item['loc']}",
            "lastmod": today,
            "changefreq": item["changefreq"],
            "priority": item["priority"],
        })

    for categoria in categorias:
        urls.append({
            "loc": f"{SITE_URL}/categoria/{slugify(categoria)}/",
            "lastmod": today,
            "changefreq": "daily",
            "priority": "0.8",
        })

    for noticia in noticias:
        urls.append({
            "loc": f"{SITE_URL}/{noticia.get('pagina', '')}",
            "lastmod": fecha_sitemap(noticia.get("fecha", "")),
            "changefreq": "weekly",
            "priority": "0.8",
        })

    xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]

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
    print("IA editorial:", "activada" if ia_activada() else "desactivada")

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
            titulo_original = limpiar_html(entry.get("title", ""))
            url = entry.get("link", "")

            if not titulo_original or not url or url in urls_vistas:
                continue

            urls_vistas.add(url)

            texto_limpio = limpiar_html(
                entry.get("summary", "")
                or entry.get("description", "")
                or titulo_original
            )

            if not es_noticia_relevante_local(titulo_original, texto_limpio, fuente["nombre"]):
                print(f"✗ Descartada por no ser local: {titulo_original}")
                continue

            mejora = mejorar_noticia_con_ia(
                titulo_original, texto_limpio, fuente["nombre"])

            noticia = {
                "id": generar_id(url, titulo_original),
                "titulo": mejora["titulo"],
                "titulo_original": titulo_original,
                "descripcion": mejora["descripcion"],
                "resumen": mejora["descripcion"],
                "cuerpo": mejora["cuerpo"],
                "fecha": normalizar_fecha(entry.get("published", "")),
                "fuente": fuente["nombre"],
                "categoria": mejora["categoria"],
                "categoria_url": f"categoria/{slugify(mejora['categoria'])}/",
                "seo_keywords": mejora.get("seo_keywords", []),
                "enlace": url,
                "url": url,
                "imagen": extraer_imagen(entry, imagen_feed),
                "prioridad": prioridad_fuente(fuente["nombre"]),
            }

            noticias.append(noticia)
            print(f"✓ {noticia['categoria']} | {noticia['titulo']}")

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
