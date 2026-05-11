import html
import json
import re
from datetime import datetime
from email.utils import parsedate_to_datetime
from pathlib import Path

import feedparser
import requests
import urllib3
from dotenv import load_dotenv
from openai import OpenAI


# =========================================
# CONFIGURACIÓN GENERAL
# =========================================

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_FILE = BASE_DIR / "data" / "noticias.json"
NOTICIAS_DIR = BASE_DIR / "noticias"
SITE_URL = "https://alhaurinaldia.es"

MAX_NOTICIAS_POR_FUENTE = 10
MAX_NOTICIAS_TOTAL = 30
USAR_IA = False

FUENTES = [
    {
        "nombre": "RTV Alhaurín el Grande",
        "url": "https://rtvalhaurinelgrande.com/feed/",
    },
    {
        "nombre": "ATV Alhaurín YouTube",
        "url": "https://www.youtube.com/feeds/videos.xml?channel_id=UClgnTGIKzuISyUK8F3v1BFA",
    },
    {
        "nombre": "Europa Press Andalucía",
        "url": "https://www.europapress.es/rss/rss.aspx?ch=00111",
    },
    {
        "nombre": "Diario SUR Málaga",
        "url": "https://www.diariosur.es/rss/2.0/?section=malaga",
    },
    {
        "nombre": "Ayuntamiento Alhaurín el Grande",
        "url": "https://alhaurinelgrande.es/feed/",
    },
    {
        "nombre": "Hermandad Nuestro Padre Jesús Nazareno",
        "url": "https://www.nuestropadrejesusnazareno.com/feed/",
    },
]


# =========================================
# OPENAI
# =========================================

load_dotenv()
client = OpenAI()

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


# =========================================
# LIMPIEZA Y UTILIDADES
# =========================================

def limpiar_html(texto):
    if not texto:
        return ""

    texto = re.sub(r"<[^>]+>", "", texto)
    texto = texto.replace("&nbsp;", " ")
    texto = texto.replace("&amp;", "&")
    texto = texto.replace("&quot;", '"')
    texto = texto.replace("&#8217;", "'")
    texto = texto.replace("&#8220;", '"')
    texto = texto.replace("&#8221;", '"')
    texto = texto.replace("&#8211;", "-")
    texto = texto.replace("&#8230;", "...")
    texto = re.sub(r"\s+", " ", texto)

    return texto.strip()


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

    texto = re.sub(r"[^a-z0-9]+", "-", texto)
    texto = texto.strip("-")

    return texto[:max_caracteres].strip("-") or "noticia"


def es_noticia_relevante_local(titulo, texto, fuente):
    contenido = f"{titulo} {texto}".lower()
    fuente_lower = fuente.lower()

    fuentes_siempre_validas = [
        "rtv alhaurín el grande",
        "atv alhaurín youtube",
        "ayuntamiento alhaurín el grande",
        "hermandad nuestro padre jesús nazareno",
    ]

    for fuente_valida in fuentes_siempre_validas:
        if fuente_valida in fuente_lower:
            return True

    palabras_obligatorias_fuentes_externas = [
        "alhaurín el grande",
        "alhaurin el grande",
    ]

    return any(
        palabra in contenido
        for palabra in palabras_obligatorias_fuentes_externas
    )


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


def normalizar_fecha(fecha_raw):
    if not fecha_raw:
        return datetime.now().isoformat()

    try:
        fecha = parsedate_to_datetime(fecha_raw)
        return fecha.isoformat()
    except Exception:
        return datetime.now().isoformat()


def fecha_para_ordenacion(fecha_iso):
    try:
        return datetime.fromisoformat(
            fecha_iso.replace("Z", "+00:00")
        )
    except Exception:
        return datetime.min


def formatear_fecha(fecha_iso):
    try:
        fecha = datetime.fromisoformat(fecha_iso.replace("Z", "+00:00"))
        return fecha.strftime("%d/%m/%Y")
    except Exception:
        return ""


def calcular_score(noticia):
    prioridad = noticia["prioridad"]

    fecha = fecha_para_ordenacion(
        noticia["fecha"]
    )

    horas = (
        datetime.now(fecha.tzinfo) - fecha
    ).total_seconds() / 3600

    frescura = max(0, 48 - horas)

    return prioridad + frescura


def generar_id(url, titulo):
    base = url or titulo
    base = base.lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)

    return base.strip("-")[:80]


def generar_ruta_pagina(titulo):
    return f"noticias/{slugify(titulo)}.html"


def extraer_imagen(entry, imagen_feed=""):
    if hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
        return entry.media_thumbnail[0].get("url", "")

    if hasattr(entry, "media_content") and entry.media_content:
        return entry.media_content[0].get("url", "")

    posibles_campos = [
        entry.get("summary", ""),
        entry.get("description", ""),
        getattr(entry, "content", [{}])[0].get("value", "")
        if hasattr(entry, "content")
        else "",
    ]

    for contenido in posibles_campos:
        coincidencia = re.search(
            r'<img[^>]+src=["\']([^"\']+)["\']',
            contenido
        )

        if coincidencia:
            return coincidencia.group(1)

    if "links" in entry:
        for link in entry.links:
            if link.get("type", "").startswith("image/"):
                return link.get("href", "")

    return imagen_feed or ""


def extraer_imagen_feed(feed):
    imagen = getattr(feed.feed, "image", None)

    if not imagen:
        return ""

    if isinstance(imagen, dict):
        return imagen.get("href") or imagen.get("url") or ""

    return getattr(imagen, "href", "") or getattr(imagen, "url", "") or ""


# =========================================
# DETECCIÓN AUTOMÁTICA DE CATEGORÍAS
# =========================================

def detectar_categoria(titulo, texto, fuente):
    contenido = f"{titulo} {texto} {fuente}".lower()

    categorias = {
        "Fiestas y Tradiciones": {
            "peso": 90,
            "palabras": [
                "feria", "romería", "verbena", "fiesta", "fiestas",
                "cruz", "día de la cruz", "semana santa", "procesión",
                "navidad", "cabalgata", "carnaval", "san juan",
                "caseta", "real de la feria", "pregón",
            ],
        },
        "Agenda Cultural": {
            "peso": 80,
            "palabras": [
                "teatro", "concierto", "música", "exposición", "libro",
                "biblioteca", "arte", "danza", "flamenco", "festival",
                "certamen", "poesía", "literario", "presentación",
                "auditorio", "casa de la cultura",
            ],
        },
        "Deportes": {
            "peso": 75,
            "palabras": [
                "deporte", "deportes", "fútbol", "baloncesto", "carrera",
                "trail", "torneo", "club", "partido", "pedal",
                "senderismo", "ciclista", "atletismo", "liga",
            ],
        },
        "Municipal": {
            "peso": 65,
            "palabras": [
                "ayuntamiento", "alcalde", "alcaldesa", "pleno",
                "concejal", "concejalía", "municipal", "presupuesto",
                "subvención", "diputación", "junta de andalucía",
                "equipo de gobierno",
            ],
        },
        "Obras y Servicios": {
            "peso": 70,
            "palabras": [
                "obra", "obras", "reforma", "mejora", "urbanización",
                "calle", "infraestructura", "asfaltado", "remodelación",
                "limpieza", "jardinería", "alumbrado", "agua",
                "saneamiento", "servicios operativos",
            ],
        },
        "Tráfico y Movilidad": {
            "peso": 85,
            "palabras": [
                "tráfico", "carretera", "corte", "desvío", "aparcamiento",
                "circulación", "retención", "vía", "acceso", "transporte",
                "autobús", "movilidad",
            ],
        },
        "Educación": {
            "peso": 70,
            "palabras": [
                "colegio", "instituto", "escuela", "alumnado", "educación",
                "guardería", "formación", "curso", "taller", "estudiantes",
                "profesorado", "ampa",
            ],
        },
        "Comercio y Empresa": {
            "peso": 70,
            "palabras": [
                "comercio", "comercios", "mercado", "hostelería",
                "empresa", "negocio", "emprendedores", "campaña comercial",
                "autónomos", "feria de muestras",
            ],
        },
        "Turismo y Patrimonio": {
            "peso": 70,
            "palabras": [
                "turismo", "visitantes", "ruta", "mirador", "sendero",
                "patrimonio", "visita guiada", "turístico", "monumento",
                "historia", "entorno natural",
            ],
        },
        "Sucesos": {
            "peso": 95,
            "palabras": [
                "suceso", "detenido", "detenida", "incendio", "accidente",
                "policía", "guardia civil", "emergencia", "rescate",
                "herido", "fallecido", "investigación",
            ],
        },
        "Vídeos": {
            "peso": 40,
            "palabras": [
                "youtube", "vídeo", "video", "entrevista", "atv",
            ],
        },
    }

    puntuaciones = {}

    for categoria, config in categorias.items():
        puntuacion = 0

        for palabra in config["palabras"]:
            if palabra in contenido:
                puntuacion += config["peso"]

                if palabra in titulo.lower():
                    puntuacion += 40

        if puntuacion > 0:
            puntuaciones[categoria] = puntuacion

    if not puntuaciones:
        return "Actualidad"

    return max(puntuaciones, key=puntuaciones.get)


# =========================================
# IA RESUMIDORA
# =========================================

def resumir_con_ia(titulo, texto, fuente):
    if not USAR_IA:
        return limitar_texto(texto)

    if not texto:
        texto = titulo

    prompt = f"""
Eres redactor de una web local de Alhaurín el Grande llamada "Alhaurín al Día".

Resume esta noticia con estas reglas:
- Español claro y natural.
- Tono informativo, cercano y elegante.
- Máximo 2 frases.
- No inventes datos.
- No añadas opiniones.
- No uses frases promocionales.
- No menciones que eres una IA.

Título:
{titulo}

Fuente:
{fuente}

Texto original:
{texto}
"""

    try:
        response = client.responses.create(
            model="gpt-4.1-mini",
            input=prompt
        )

        resumen = response.output_text.strip()

        if not resumen:
            return limitar_texto(texto)

        return resumen

    except Exception as e:
        print("Error IA:", e)
        return limitar_texto(texto)


# =========================================
# LECTURA RSS
# =========================================

def leer_feed(url):
    response = requests.get(
        url,
        timeout=20,
        headers={
            "User-Agent": "Mozilla/5.0"
        },
        verify=False
    )

    return feedparser.parse(response.text)


# =========================================
# PÁGINAS INDIVIDUALES DE NOTICIAS
# =========================================

def generar_html_noticia(noticia):
    titulo = escapar(noticia.get("titulo", "Noticia local"))
    descripcion = escapar(noticia.get("descripcion") or noticia.get("resumen") or "Actualidad de Alhaurín el Grande.")
    categoria = escapar(noticia.get("categoria", "Actualidad"))
    fuente = escapar(noticia.get("fuente", ""))
    fecha = escapar(formatear_fecha(noticia.get("fecha", "")))
    enlace_original = escapar(noticia.get("enlace") or noticia.get("url") or "#")
    imagen = escapar(noticia.get("imagen", ""))
    pagina = noticia.get("pagina", "")
    canonical_url = f"{SITE_URL}/{pagina}"
    canonical_url_esc = escapar(canonical_url)

    imagen_html = ""
    if imagen:
        imagen_html = f'''
            <figure class="article-image">
                <img src="{imagen}" alt="{titulo}">
            </figure>
        '''

    og_image = imagen or f"{SITE_URL}/favicon.ico"

    return f'''<!doctype html>
<html lang="es">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{titulo} | Alhaurín al Día</title>
    <meta name="description" content="{descripcion}">
    <link rel="canonical" href="{canonical_url_esc}">

    <meta property="og:type" content="article">
    <meta property="og:title" content="{titulo}">
    <meta property="og:description" content="{descripcion}">
    <meta property="og:url" content="{canonical_url_esc}">
    <meta property="og:image" content="{escapar(og_image)}">
    <meta property="og:site_name" content="Alhaurín al Día">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{titulo}">
    <meta name="twitter:description" content="{descripcion}">
    <meta name="twitter:image" content="{escapar(og_image)}">

    <link rel="stylesheet" href="../styles.css">

    <style>
        .article-page {{
            padding: 48px 0 64px;
        }}

        .breadcrumb {{
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            color: var(--muted);
            font-size: 14px;
            font-weight: 800;
            margin-bottom: 22px;
        }}

        .breadcrumb a {{
            color: var(--brand);
        }}

        .article-shell {{
            max-width: 900px;
            margin: 0 auto;
        }}

        .article-card {{
            background: rgba(255, 255, 255, .94);
            border: 1px solid var(--line);
            border-radius: 34px;
            box-shadow: var(--shadow);
            overflow: hidden;
        }}

        .article-content {{
            padding: clamp(26px, 5vw, 54px);
        }}

        .article-meta {{
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            align-items: center;
            margin-bottom: 18px;
        }}

        .article-title {{
            margin: 0;
            color: var(--brand);
            font-family: Georgia, "Times New Roman", serif;
            font-size: clamp(38px, 6vw, 68px);
            line-height: .98;
            letter-spacing: -.055em;
        }}

        .article-summary {{
            margin: 24px 0 0;
            color: #475467;
            font-size: 19px;
            line-height: 1.8;
        }}

        .article-image {{
            margin: 0;
            background: var(--brand-soft);
        }}

        .article-image img {{
            width: 100%;
            max-height: 560px;
            object-fit: cover;
        }}

        .article-actions {{
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 30px;
            padding-top: 24px;
            border-top: 1px solid var(--line);
        }}

        .article-note {{
            margin-top: 18px;
            color: var(--muted);
            font-size: 13px;
            line-height: 1.6;
        }}
    </style>
</head>

<body>
    <div class="topbar">
        <div class="container">
            <span>Guía local independiente de Alhaurín el Grande</span>
            <span>Agenda · Comercios · Avisos útiles · Planes</span>
        </div>
    </div>

    <header>
        <div class="container">
            <nav aria-label="Navegación principal">
                <a class="logo" href="../index.html" aria-label="Alhaurín al Día">
                    <span class="logo-mark">A</span>
                    <span><strong>Alhaurín al Día</strong><span>Información local útil</span></span>
                </a>
                <div class="nav-links">
                    <a href="../index.html#agenda">Noticias</a>
                    <a href="../index.html#guia-util">Guía útil</a>
                    <a href="../index.html#planes">Planes</a>
                    <a href="../index.html#contacto" class="nav-cta">Anunciarse</a>
                </div>
            </nav>
        </div>
    </header>

    <main class="article-page">
        <div class="container article-shell">
            <div class="breadcrumb">
                <a href="../index.html">Inicio</a>
                <span>›</span>
                <a href="../index.html#agenda">Noticias</a>
                <span>›</span>
                <span>{categoria}</span>
            </div>

            <article class="article-card">
                {imagen_html}

                <div class="article-content">
                    <div class="article-meta">
                        <span class="tag">{categoria}</span>
                        {f'<span class="source-mini-tag">{fuente}</span>' if fuente else ''}
                        {f'<span class="source-mini-tag">{fecha}</span>' if fecha else ''}
                    </div>

                    <h1 class="article-title">{titulo}</h1>
                    <p class="article-summary">{descripcion}</p>

                    <div class="article-actions">
                        <a class="btn btn-primary" href="{enlace_original}" target="_blank" rel="noopener noreferrer">
                            Leer en la fuente original
                        </a>
                        <a class="btn btn-secondary" href="../index.html#agenda">
                            Volver a noticias
                        </a>
                    </div>

                    <p class="article-note">
                        Esta página recoge una noticia enlazada desde su fuente original. Alhaurín al Día organiza y facilita el acceso a la actualidad local de Alhaurín el Grande.
                    </p>
                </div>
            </article>
        </div>
    </main>

    <footer>
        <div class="container">
            <span>© 2026 Alhaurín al Día · Guía local independiente</span>
            <div class="footer-links">
                <a href="../index.html#agenda">Noticias</a>
                <a href="../index.html#guia-util">Guía útil</a>
                <a href="../index.html#contacto">Contacto</a>
            </div>
        </div>
    </footer>
</body>

</html>
'''


def generar_paginas_noticias(noticias):
    NOTICIAS_DIR.mkdir(parents=True, exist_ok=True)

    rutas_usadas = set()

    for noticia in noticias:
        ruta_base = generar_ruta_pagina(noticia.get("titulo", noticia.get("id", "noticia")))
        ruta = ruta_base
        contador = 2

        while ruta in rutas_usadas:
            nombre = Path(ruta_base).stem
            ruta = f"noticias/{nombre}-{contador}.html"
            contador += 1

        rutas_usadas.add(ruta)
        noticia["pagina"] = ruta

        archivo = BASE_DIR / ruta
        archivo.write_text(
            generar_html_noticia(noticia),
            encoding="utf-8"
        )

    print("Páginas individuales creadas:", len(noticias))
    print("Carpeta:", NOTICIAS_DIR)


# =========================================
# GENERACIÓN DE NOTICIAS
# =========================================

def obtener_noticias():
    noticias = []
    urls_vistas = set()

    print("")
    print("Generando noticias para Alhaurín al Día")
    print("Archivo destino:", OUTPUT_FILE)

    for fuente in FUENTES:
        print("")
        print("====================================")
        print("Leyendo:", fuente["nombre"])
        print("====================================")

        try:
            feed = leer_feed(fuente["url"])
        except Exception as e:
            print("Error leyendo fuente:", fuente["nombre"])
            print(e)
            continue

        print("Entradas encontradas:", len(feed.entries))

        imagen_feed = extraer_imagen_feed(feed)

        for entry in feed.entries[:MAX_NOTICIAS_POR_FUENTE]:
            titulo = limpiar_html(entry.get("title", ""))
            url = entry.get("link", "")

            if not titulo or not url:
                continue

            if url in urls_vistas:
                continue

            urls_vistas.add(url)

            texto_original = (
                entry.get("summary", "")
                or entry.get("description", "")
                or titulo
            )

            texto_limpio = limpiar_html(texto_original)

            if not es_noticia_relevante_local(
                titulo=titulo,
                texto=texto_limpio,
                fuente=fuente["nombre"]
            ):
                print(f"✗ Descartada por no ser local: {titulo}")
                continue

            resumen = resumir_con_ia(
                titulo=titulo,
                texto=texto_limpio,
                fuente=fuente["nombre"]
            )

            categoria = detectar_categoria(
                titulo=titulo,
                texto=texto_limpio,
                fuente=fuente["nombre"]
            )

            noticia = {
                "id": generar_id(url, titulo),
                "titulo": titulo,
                "descripcion": resumen,
                "resumen": resumen,
                "fecha": normalizar_fecha(entry.get("published", "")),
                "fuente": fuente["nombre"],
                "categoria": categoria,
                "enlace": url,
                "url": url,
                "imagen": extraer_imagen(entry, imagen_feed),
                "prioridad": prioridad_fuente(fuente["nombre"]),
            }

            noticias.append(noticia)

            print(f"✓ {categoria} | {titulo}")

    noticias.sort(
        key=calcular_score,
        reverse=True
    )

    return noticias[:MAX_NOTICIAS_TOTAL]


def guardar_noticias(noticias):
    generar_paginas_noticias(noticias)

    OUTPUT_FILE.parent.mkdir(
        parents=True,
        exist_ok=True
    )

    with open(
        OUTPUT_FILE,
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(
            noticias,
            f,
            ensure_ascii=False,
            indent=2
        )

    print("")
    print("====================================")
    print("Noticias generadas:", len(noticias))
    print("Archivo creado:", OUTPUT_FILE)
    print("====================================")


# =========================================
# EJECUCIÓN
# =========================================

if __name__ == "__main__":
    noticias = obtener_noticias()
    guardar_noticias(noticias)
