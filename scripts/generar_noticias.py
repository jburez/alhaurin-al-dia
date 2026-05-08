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


def normalizar_fecha(fecha_raw):
    if not fecha_raw:
        return datetime.now().isoformat()

    try:
        fecha = parsedate_to_datetime(fecha_raw)
        return fecha.isoformat()
    except Exception:
        return datetime.now().isoformat()


def generar_id(url, titulo):
    base = url or titulo
    base = base.lower()
    base = re.sub(r"[^a-z0-9]+", "-", base)

    return base.strip("-")[:80]


def extraer_imagen(entry):
    if hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
        return entry.media_thumbnail[0].get("url", "")

    if hasattr(entry, "media_content") and entry.media_content:
        return entry.media_content[0].get("url", "")

    if "links" in entry:
        for link in entry.links:
            if link.get("type", "").startswith("image/"):
                return link.get("href", "")

    return ""


# =========================================
# DETECCIÓN AUTOMÁTICA DE CATEGORÍAS
# =========================================

def detectar_categoria(titulo, texto, fuente):
    contenido = f"{titulo} {texto} {fuente}".lower()

    categorias = {
        "Fiestas y Tradiciones": {
            "peso": 90,
            "palabras": [
                "feria",
                "romería",
                "verbena",
                "fiesta",
                "fiestas",
                "cruz",
                "día de la cruz",
                "semana santa",
                "procesión",
                "navidad",
                "cabalgata",
                "carnaval",
                "san juan",
                "caseta",
                "real de la feria",
                "pregón",
            ],
        },

        "Agenda Cultural": {
            "peso": 80,
            "palabras": [
                "teatro",
                "concierto",
                "música",
                "exposición",
                "libro",
                "biblioteca",
                "arte",
                "danza",
                "flamenco",
                "festival",
                "certamen",
                "poesía",
                "literario",
                "presentación",
                "auditorio",
                "casa de la cultura",
            ],
        },

        "Deportes": {
            "peso": 75,
            "palabras": [
                "deporte",
                "deportes",
                "fútbol",
                "baloncesto",
                "carrera",
                "trail",
                "torneo",
                "club",
                "partido",
                "pedal",
                "senderismo",
                "ciclista",
                "atletismo",
                "liga",
            ],
        },

        "Municipal": {
            "peso": 65,
            "palabras": [
                "ayuntamiento",
                "alcalde",
                "alcaldesa",
                "pleno",
                "concejal",
                "concejalía",
                "municipal",
                "presupuesto",
                "subvención",
                "diputación",
                "junta de andalucía",
                "equipo de gobierno",
            ],
        },

        "Obras y Servicios": {
            "peso": 70,
            "palabras": [
                "obra",
                "obras",
                "reforma",
                "mejora",
                "urbanización",
                "calle",
                "infraestructura",
                "asfaltado",
                "remodelación",
                "limpieza",
                "jardinería",
                "alumbrado",
                "agua",
                "saneamiento",
                "servicios operativos",
            ],
        },

        "Tráfico y Movilidad": {
            "peso": 85,
            "palabras": [
                "tráfico",
                "carretera",
                "corte",
                "desvío",
                "aparcamiento",
                "circulación",
                "retención",
                "vía",
                "acceso",
                "transporte",
                "autobús",
                "movilidad",
            ],
        },

        "Educación": {
            "peso": 70,
            "palabras": [
                "colegio",
                "instituto",
                "escuela",
                "alumnado",
                "educación",
                "guardería",
                "formación",
                "curso",
                "taller",
                "estudiantes",
                "profesorado",
                "ampa",
            ],
        },

        "Comercio y Empresa": {
            "peso": 70,
            "palabras": [
                "comercio",
                "comercios",
                "mercado",
                "hostelería",
                "empresa",
                "negocio",
                "emprendedores",
                "campaña comercial",
                "autónomos",
                "feria de muestras",
            ],
        },

        "Turismo y Patrimonio": {
            "peso": 70,
            "palabras": [
                "turismo",
                "visitantes",
                "ruta",
                "mirador",
                "sendero",
                "patrimonio",
                "visita guiada",
                "turístico",
                "monumento",
                "historia",
                "entorno natural",
            ],
        },

        "Sucesos": {
            "peso": 95,
            "palabras": [
                "suceso",
                "detenido",
                "detenida",
                "incendio",
                "accidente",
                "policía",
                "guardia civil",
                "emergencia",
                "rescate",
                "herido",
                "fallecido",
                "investigación",
            ],
        },

        "Vídeos": {
            "peso": 40,
            "palabras": [
                "youtube",
                "vídeo",
                "video",
                "entrevista",
                "atv",
            ],
        },
    }

    puntuaciones = {}

    for categoria, config in categorias.items():

        puntuacion = 0

        for palabra in config["palabras"]:

            if palabra in contenido:

                puntuacion += config["peso"]

                # Si aparece en el título, suma más
                if palabra in titulo.lower():
                    puntuacion += 40

        if puntuacion > 0:
            puntuaciones[categoria] = puntuacion

    if not puntuaciones:
        return "Actualidad"

    categoria_ganadora = max(
        puntuaciones,
        key=puntuaciones.get
    )

    return categoria_ganadora


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

                "imagen": extraer_imagen(entry),
            }

            noticias.append(noticia)

            print(f"✓ {categoria} | {titulo}")

    noticias.sort(
        key=lambda noticia: noticia["fecha"],
        reverse=True
    )

    return noticias[:MAX_NOTICIAS_TOTAL]


def guardar_noticias(noticias):
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
