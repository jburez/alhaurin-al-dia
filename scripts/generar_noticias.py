import calendar
import hashlib
import html
import json
import os
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote, urlsplit, urlunsplit

import feedparser
import requests
import urllib3
from dotenv import load_dotenv

from lib.footer import SITE_FOOTER_HTML
from lib.analytics import CF_ANALYTICS_SNIPPET
from lib.nav import render_nav
from lib.editorial_rules import titulo_truncado, ultima_palabra_incompleta
from lib.editorial_registry import (
    PROMPT_VERSION,
    cargar_registro,
    calcular_content_hash,
    generar_source_identity,
    guardar_registro,
    canonicalizar_url,
    cargar_identidad_legacy,
    resolver_identidad_noticia,
    decidir_cache_editorial,
    debe_reintentar_ia,
    ai_attempts_seguro,
    IdentidadColisionError,
    IdentidadDuplicadaEnEjecucionError,
    PaginaColisionError,
    RegistroEditorialError,
    CACHE_MISS_AI_NOT_SUCCESSFUL,
)
from lib.editorial_log import construir_evento, registrar_eventos

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_FILE = BASE_DIR / "data" / "noticias.json"
NOTICIAS_DIR = BASE_DIR / "noticias"
CATEGORIAS_DIR = BASE_DIR / "categoria"
FUENTES_FILE = BASE_DIR / "data" / "fuentes.json"
GEOGRAFIA_FILE = BASE_DIR / "data" / "geografia.json"
SITE_URL = "https://alhaurinaldia.es"

MAX_NOTICIAS_POR_FUENTE = 10
MAX_NOTICIAS_TOTAL = 30
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")

CATEGORIAS_VALIDAS = [
    "Actualidad", "Fiestas y Tradiciones", "Agenda Cultural", "Deportes", "Municipal",
    "Obras y Servicios", "Tráfico y Movilidad", "Educación", "Comercio y Empresa",
    "Turismo y Patrimonio", "Sucesos", "Vídeos",
]


def cargar_fuentes():
    """Lee el registro de fuentes (data/fuentes.json) y devuelve solo las activas."""
    try:
        fuentes = json.loads(FUENTES_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return []
    return [f for f in fuentes if f.get("activa", True)]


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
        "", texto, flags=re.IGNORECASE,
    )
    texto = texto.strip(" -–—")
    if not texto:
        return "Actualidad local de Alhaurín el Grande."
    if len(texto) <= max_caracteres:
        return texto
    return texto[:max_caracteres].rsplit(" ", 1)[0].rstrip(".,;:") + "..."


def normalizar_frase_completa(texto, fallback="", max_caracteres=260):
    texto = limpiar_html(texto).strip().replace("...", ".")
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


def normalizar_fecha_entry(entry):
    """Fecha de publicación ORIGINAL de la entrada del feed (no la hora en la
    que este script sincroniza/lee el feed). Prioriza los campos que
    feedparser ya deja parseados como struct_time (published_parsed /
    updated_parsed), porque cubren tanto RFC 2822 como ISO 8601 y evitan
    depender de reparsear el texto crudo. Si el feed no trae fecha en
    absoluto, se cae a la hora de sincronización como último recurso para no
    descartar la noticia."""
    for campo in ("published_parsed", "updated_parsed"):
        valor = entry.get(campo)
        if valor:
            try:
                return datetime.fromtimestamp(calendar.timegm(valor), tz=timezone.utc).isoformat()
            except Exception:
                pass
    fecha_raw = entry.get("published") or entry.get("updated") or ""
    return normalizar_fecha(fecha_raw)


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


def tiempo_lectura(texto):
    palabras = len(limpiar_html(texto).split())
    minutos = max(1, round(palabras / 220))
    return f"{minutos} min de lectura"


def generar_id(url, titulo):
    base = url or titulo or ""
    sufijo = hashlib.sha1(base.encode("utf-8")).hexdigest()[:8]
    return f"{slugify(base, 70)}-{sufijo}"


def generar_ruta_pagina(titulo):
    return f"noticias/{slugify(titulo)}.html"


def generar_ruta_categoria(categoria):
    return f"categoria/{slugify(categoria)}/index.html"


def prioridad_fuente(fuente):
    """Prioridad editorial de una fuente por nombre, según data/fuentes.json."""
    for registro in cargar_fuentes():
        if registro.get("nombre", "").strip().lower() == fuente.strip().lower():
            return registro.get("prioridad", 10)
    return 10


def nivel_confianza_fuente(fuente):
    """Nivel de confianza (A-D) de una fuente por nombre, según data/fuentes.json."""
    for registro in cargar_fuentes():
        if registro.get("nombre", "").strip().lower() == fuente.strip().lower():
            return registro.get("nivel_confianza")
    return None


def fuente_requiere_filtro_geo(fuente):
    """True si la fuente tiene filtro_geografico: true en data/fuentes.json."""
    for registro in cargar_fuentes():
        if registro.get("nombre", "").strip().lower() == fuente.strip().lower():
            return registro.get("filtro_geografico", False)
    return False


def calcular_score(noticia):
    fecha = fecha_para_ordenacion(noticia["fecha"])
    try:
        horas = (datetime.now(fecha.tzinfo) - fecha).total_seconds() / 3600
    except Exception:
        horas = 999
    return noticia["prioridad"] + max(0, 48 - horas)


def es_titulo_generico(titulo):
    titulo_lower = limpiar_html(titulo).lower()
    patrones = [r"^noticias\s+atv\s+\d{1,2}\s+\w+\s+\d{4}",
                r"^actualidad\s+de\s+alhaurín", r"^informativo\s+atv"]
    return any(re.search(patron, titulo_lower, flags=re.IGNORECASE) for patron in patrones)


def extraer_primer_tema_informativo(texto):
    texto = limpiar_html(texto)
    patrones = [r"(?:^|\s)1\.\s*([A-ZÁÉÍÓÚÑ0-9][^\.]{25,180})",
                r"(?:^|\s)1\s*[-–]\s*([A-ZÁÉÍÓÚÑ0-9][^\.]{25,180})"]
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
    if len(tema) > 90:
        tema = tema[:90].rsplit(" ", 1)[0].rstrip(".,;:")
        # Si el recorte a 90 caracteres deja el titular colgando en una
        # palabra de data/reglas-editoriales.json:terminales_incompletos
        # (p. ej. "...del estado de"), seguir recortando palabra a palabra
        # en vez de publicar un titular que termina a medias.
        while tema and ultima_palabra_incompleta(tema):
            tema = tema.rsplit(" ", 1)[0].rstrip(".,;:")
    return tema


def generar_titulo_seo(titulo, texto, fuente):
    titulo_limpio = limpiar_html(titulo)
    if es_titulo_generico(titulo_limpio):
        titulo_seo = titular_desde_tema(extraer_primer_tema_informativo(texto))
        if titulo_seo:
            return titulo_seo
    if "|" in titulo_limpio:
        # No asumir que lo real va antes de la barra: algunas fuentes (p. ej.
        # RTV, con su sección "La Recacha | Titular real") ponen antes una
        # etiqueta de sección corta. Se queda con el fragmento más largo.
        partes = [p.strip() for p in titulo_limpio.split("|") if p.strip()]
        if partes:
            titulo_limpio = max(partes, key=len)
    titulo_limpio = re.sub(r"\s+", " ", titulo_limpio)
    if len(titulo_limpio) > 95:
        titulo_limpio = titulo_limpio[:95].rsplit(" ", 1)[0].rstrip(".,;:")
        # Mismo criterio que titular_desde_tema(): no dejar el recorte
        # colgando en una palabra de terminales_incompletos.
        while titulo_limpio and ultima_palabra_incompleta(titulo_limpio):
            titulo_limpio = titulo_limpio.rsplit(" ", 1)[0].rstrip(".,;:")
    return titulo_limpio or "Actualidad local de Alhaurín el Grande"


def _sin_acentos(texto):
    texto = unicodedata.normalize("NFD", texto or "")
    return "".join(c for c in texto if not unicodedata.combining(c))


def cargar_geografia():
    try:
        return json.loads(GEOGRAFIA_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def evaluar_relevancia_geografica(titulo, texto, fuente):
    """Filtro geográfico de 3 capas (data/geografia.json):

    - exclusión: menciona una entidad de exclusión sin el municipio principal -> descarta.
    - inclusión: no menciona el municipio ni ninguna entidad de inclusión -> descarta.
    - revisión manual: menciona el municipio junto a un municipio limítrofe (p. ej.
      Alhaurín de la Torre) -> se mantiene pero se marca para revisión, en vez de
      publicarse sin más o descartarse (evita el riesgo de confundir ambos municipios).

    Devuelve (incluir: bool, requiere_revision: bool).
    """
    geografia = cargar_geografia()
    municipio = geografia.get("municipio_principal", "Alhaurín el Grande")
    inclusion = geografia.get("entidades_inclusion", [municipio])
    revision = geografia.get("entidades_revision_manual", [])
    exclusion = geografia.get("entidades_exclusion_si_solas", [])

    # Las fuentes ya vetadas como oficiales (A) o entidades locales verificadas
    # (B) en data/fuentes.json se dan por relevantes sin exigir que el texto
    # mencione literalmente el municipio: p. ej. una noticia de fichajes de
    # CD Alhaurino es local por naturaleza aunque no diga "Alhaurín el Grande".
    # EXCEPCIÓN: si la fuente tiene filtro_geografico: true, se aplica el filtro
    # igualmente (p. ej. revistas comarcales que cubren varios municipios).
    if nivel_confianza_fuente(fuente) in ("A", "B") and not fuente_requiere_filtro_geo(fuente):
        return True, False

    contenido = _sin_acentos(f"{titulo} {texto}".lower())
    menciona_municipio = _sin_acentos(municipio.lower()) in contenido
    menciona_inclusion = menciona_municipio or any(
        _sin_acentos(e.lower()) in contenido for e in inclusion)
    menciona_exclusion = any(_sin_acentos(e.lower())
                              in contenido for e in exclusion)
    menciona_revision = any(_sin_acentos(e.lower())
                             in contenido for e in revision)

    if menciona_exclusion and not menciona_municipio:
        return False, False
    if not menciona_inclusion:
        return False, False
    if menciona_revision:
        return True, True
    return True, False


def extraer_imagen_feed(feed):
    imagen = getattr(feed.feed, "image", None)
    if not imagen:
        return ""
    if isinstance(imagen, dict):
        return imagen.get("href") or imagen.get("url") or ""
    return getattr(imagen, "href", "") or getattr(imagen, "url", "") or ""


WP_THUMB_SUFFIX = re.compile(r"-(\d{2,5})x(\d{2,5})(\.(?:jpe?g|png|webp|gif))$", re.IGNORECASE)
YOUTUBE_THUMB = re.compile(
    r"^(https?://i\d?\.ytimg\.com/vi/[^/]+/)(?:default|mqdefault|hqdefault|sddefault|maxresdefault)\.jpg$",
    re.IGNORECASE,
)


def _url_disponible(url):
    """Comprueba con una petición ligera que la URL candidata a alta
    resolución realmente existe, para no sustituir una miniatura válida por
    un enlace roto (frecuente con maxresdefault de YouTube, que no se genera
    para todos los vídeos)."""
    try:
        resp = requests.head(url, timeout=4, headers={"User-Agent": "Mozilla/5.0"}, verify=False, allow_redirects=True)
        if resp.status_code == 405:
            resp = requests.get(url, timeout=4, headers={"User-Agent": "Mozilla/5.0"}, verify=False, stream=True)
        return resp.status_code == 200
    except Exception:
        return False


def normalizar_imagen_hd(url):
    """Fuerza siempre la variante de mayor resolución disponible de la
    imagen de portada: sustituye miniaturas de YouTube por maxresdefault/
    sddefault y quita el sufijo de tamaño (-300x200.jpg) que WordPress añade
    a sus miniaturas, recuperando el archivo original a resolución completa.
    Solo se aplica el cambio si la URL de mayor resolución existe de verdad."""
    if not url:
        return ""
    if "nuestropadrejesusnazareno.com" in url and ("32x32" in url or "192x192" in url or "favicon" in url):
        return "https://www.nuestropadrejesusnazareno.com/wp-content/uploads/2025/06/ESCUDO-REAL-HDAD.-NTRO.-PADRE-JESeS-NAZARENO.png"

    youtube_match = YOUTUBE_THUMB.match(url)
    if youtube_match:
        base = youtube_match.group(1)
        for variante in ("maxresdefault.jpg", "sddefault.jpg"):
            candidata = f"{base}{variante}"
            if _url_disponible(candidata):
                return candidata
        return url

    partes = urlsplit(url)
    wp_match = WP_THUMB_SUFFIX.search(partes.path)
    if wp_match:
        path_original = partes.path[:wp_match.start()] + wp_match.group(3)
        candidata = urlunsplit((partes.scheme, partes.netloc, path_original, partes.query, partes.fragment))
        if _url_disponible(candidata):
            return candidata

    return url


def extraer_imagen(entry, imagen_feed=""):
    url = ""
    if hasattr(entry, "media_thumbnail") and entry.media_thumbnail:
        url = entry.media_thumbnail[0].get("url", "")
    elif hasattr(entry, "media_content") and entry.media_content:
        url = entry.media_content[0].get("url", "")
    else:
        campos = [entry.get("summary", ""), entry.get("description", ""), getattr(
            entry, "content", [{}])[0].get("value", "") if hasattr(entry, "content") else ""]
        for contenido in campos:
            match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', contenido)
            if match:
                url = match.group(1)
                break
        if not url and "links" in entry:
            for link in entry.links:
                if link.get("type", "").startswith("image/"):
                    url = link.get("href", "")
                    break
    if not url:
        url = imagen_feed or ""
    return normalizar_imagen_hd(url)


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
    descripcion = normalizar_frase_completa(limpiar_resumen_editorial(
        texto, 230), fallback="Actualidad local de Alhaurín el Grande.", max_caracteres=230)
    parrafos = dividir_parrafos(texto)
    if not parrafos:
        parrafos = [descripcion]
    cuerpo = "\n\n".join(parrafos[:3])
    categoria = detectar_categoria(titulo, texto, fuente)
    return {"titulo": titulo, "descripcion": descripcion, "cuerpo": cuerpo, "categoria": categoria, "seo_keywords": []}


def mejorar_noticia_con_ia(titulo_original, texto, fuente):
    """Devuelve, además de titulo/descripcion/cuerpo/categoria/
    seo_keywords, dos marcadores de estado interno para la caché del
    registro editorial (lib/editorial_registry.py) -- NO se serializan en
    la noticia pública, viven solo en la estructura paralela de bookkeeping
    hasta que se persisten en el registro:

    - ia_intentada: True únicamente si se llegó a realizar la llamada real
      a client.responses.create(). Un fallo al importar el SDK, construir
      el cliente o montar el prompt (antes de la llamada) NO cuenta como
      intento -- no debe incrementar ai_attempts ni activar el backoff de
      debe_reintentar_ia().
    - ia_exitosa: True únicamente si la llamada real tuvo éxito Y la
      respuesta parseada contiene contenido editorial utilizable (título y
      cuerpo no vacíos) -- que la API responda HTTP correctamente no basta
      por sí solo.
    """
    fallback = fallback_editorial(titulo_original, texto, fuente)
    if not ia_activada():
        return {**fallback, "ia_exitosa": False, "ia_intentada": False}

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
    except Exception as e:
        # Fallo ANTES de la llamada real (import del SDK, construcción del
        # cliente, montaje del prompt) -- no se intentó de verdad contra
        # OpenAI, así que no cuenta para ai_attempts/backoff.
        print("Error preparando IA:", e)
        return {**fallback, "ia_exitosa": False, "ia_intentada": False}

    try:
        response = client.responses.create(
            model=OPENAI_MODEL, input=prompt, temperature=0.2)
        data = parsear_json_ia(response.output_text)
        if not isinstance(data, dict):
            raise ValueError("La IA no devolvió un objeto JSON")

        titulo = limpiar_html(data.get("titulo") or fallback["titulo"])
        descripcion = normalizar_frase_completa(data.get(
            "descripcion") or fallback["descripcion"], fallback=fallback["descripcion"], max_caracteres=230)
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
        titulo_final = titulo[:95].rsplit(" ", 1)[0].rstrip(".,;:") if len(titulo) > 95 else titulo

        # No basta con que la API responda HTTP correctamente: si tras el
        # parseo no queda título o cuerpo con contenido real en la
        # respuesta cruda (p. ej. la IA devolvió un JSON válido pero
        # vacío/degenerado), es un fallo de resultado, no un éxito -- se
        # trata igual que una excepción. Se evalúa sobre data.get(...), no
        # sobre titulo_final/cuerpo ya procesados: esos siempre caen al
        # fallback por campo y nunca quedarían vacíos.
        if not str(data.get("titulo") or "").strip() or not str(data.get("cuerpo") or "").strip():
            raise ValueError("La IA devolvió una respuesta sin título o cuerpo utilizable")

        return {
            "titulo": titulo_final,
            "descripcion": descripcion,
            "cuerpo": cuerpo,
            "categoria": categoria,
            "seo_keywords": keywords,
            "ia_exitosa": True,
            "ia_intentada": True,
        }
    except Exception as e:
        # Fallo DURANTE/DESPUÉS de la llamada real (red, rate limit, JSON
        # inválido, respuesta sin contenido utilizable...) -- esto SÍ fue un
        # intento real contra OpenAI, cuenta para ai_attempts/backoff.
        print("Error IA:", e)
        return {**fallback, "ia_exitosa": False, "ia_intentada": True}


def leer_feed(url):
    response = requests.get(url, timeout=20, headers={
                            "User-Agent": "Mozilla/5.0"}, verify=False)
    response.raise_for_status()
    return feedparser.parse(response.text)


def schema_organization():
    data = {"@context": "https://schema.org", "@type": "Organization", "name": "Alhaurín al Día", "url": SITE_URL,
            "logo": f"{SITE_URL}/assets/favicon.svg", "areaServed": {"@type": "Place", "name": "Alhaurín el Grande"}, "sameAs": []}
    return json.dumps(data, ensure_ascii=False, indent=2)


def schema_website():
    # Sin potentialAction/SearchAction: /buscar/ no existe en el sitio.
    # scripts/audit-seo.js falla el build si detecta ese bloque.
    data = {"@context": "https://schema.org", "@type": "WebSite", "name": "Alhaurín al Día", "url": SITE_URL, "inLanguage": "es-ES"}
    return json.dumps(data, ensure_ascii=False, indent=2)


def schema_news_article(noticia, canonical_url):
    imagen = noticia.get("imagen") or f"{SITE_URL}/assets/favicon.svg"
    data = {
        "@context": "https://schema.org", "@type": "NewsArticle", "headline": noticia.get("titulo", ""),
        "description": noticia.get("descripcion") or noticia.get("resumen") or "", "articleBody": noticia.get("cuerpo", ""),
        "datePublished": noticia.get("fecha", ""), "dateModified": noticia.get("fecha", ""),
        "mainEntityOfPage": {"@type": "WebPage", "@id": canonical_url}, "image": [imagen],
        "inLanguage": "es-ES", "isAccessibleForFree": True, "articleSection": noticia.get("categoria", "Actualidad"),
        "keywords": noticia.get("seo_keywords", []), "about": noticia.get("categoria", "Actualidad"),
        "contentLocation": {"@type": "Place", "name": "Alhaurín el Grande"},
        "author": {"@type": "Organization", "name": noticia.get("fuente") or "Alhaurín al Día"},
        "publisher": {"@type": "Organization", "name": "Alhaurín al Día", "url": SITE_URL, "logo": {"@type": "ImageObject", "url": f"{SITE_URL}/assets/favicon.svg"}, "areaServed": "Alhaurín el Grande"},
    }
    return json.dumps(data, ensure_ascii=False, indent=2)


def schema_breadcrumb_list(noticia, canonical_url):
    categoria = noticia.get("categoria", "Actualidad")
    data = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1,
            "name": "Inicio", "item": f"{SITE_URL}/"},
        {"@type": "ListItem", "position": 2, "name": "Noticias",
            "item": f"{SITE_URL}/noticias/"},
        {"@type": "ListItem", "position": 3, "name": categoria,
            "item": f"{SITE_URL}/categoria/{slugify(categoria)}/"},
        {"@type": "ListItem", "position": 4,
            "name": noticia.get("titulo", "Noticia local"), "item": canonical_url},
    ]}
    return json.dumps(data, ensure_ascii=False, indent=2)


def schema_breadcrumb_categoria(categoria, canonical_url):
    data = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1,
            "name": "Inicio", "item": f"{SITE_URL}/"},
        {"@type": "ListItem", "position": 2, "name": "Noticias",
            "item": f"{SITE_URL}/noticias/"},
        {"@type": "ListItem", "position": 3,
            "name": categoria, "item": canonical_url},
    ]}
    return json.dumps(data, ensure_ascii=False, indent=2)


def schema_collection_page(categoria, canonical_url, descripcion):
    data = {"@context": "https://schema.org", "@type": "CollectionPage", "name": categoria, "url": canonical_url, "description": descripcion, "inLanguage": "es-ES", "isPartOf": {
        "@type": "WebSite", "name": "Alhaurín al Día", "url": SITE_URL}, "about": {"@type": "Thing", "name": categoria}, "contentLocation": {"@type": "Place", "name": "Alhaurín el Grande"}}
    return json.dumps(data, ensure_ascii=False, indent=2)


def schema_item_list(noticias):
    data = {"@context": "https://schema.org", "@type": "ItemList", "itemListElement": [
        {"@type": "ListItem", "position": idx + 1, "url": f"{SITE_URL}/{n.get('pagina', '')}", "name": n.get("titulo", "")} for idx, n in enumerate(noticias[:20])]}
    return json.dumps(data, ensure_ascii=False, indent=2)


def html_header(title, description, canonical, image="", css_prefix="..", og_type="article", incluir_article_css=True):
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
    <meta name="twitter:title" content="{escapar(title)}">
    <meta name="twitter:description" content="{escapar(description)}">
    <meta name="twitter:image" content="{escapar(image)}">
    <link rel="icon" type="image/svg+xml" href="{css_prefix}/assets/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
    <link rel="stylesheet" href="{css_prefix}/css/styles.css">
    <link rel="stylesheet" href="{css_prefix}/css/mobile.css">
    <link rel="stylesheet" href="{css_prefix}/css/ads.css">{f"""
    <link rel="stylesheet" href="{css_prefix}/css/article.css">
    <link rel="stylesheet" href="{css_prefix}/css/article-share.css">""" if incluir_article_css else ''}
    {CF_ANALYTICS_SNIPPET}
</head>'''


def site_chrome(content, prefix=".."):
    return f'''<body>
    <div class="topbar">
        <div class="container">
            <span>Guía local independiente de Alhaurín el Grande</span>
            <div class="topbar-right">
                <a href="{prefix}/radar-social/" class="topbar-link">📡 Radar Social</a>
                <a href="{prefix}/mi-alhaurin/" class="topbar-link highlight">⭐ Mi Alhaurín</a>
                <a href="https://www.google.com/preferences/source?q=alhaurinaldia.es" target="_blank" rel="noopener noreferrer" class="topbar-link highlight">⭐ Destacar en Google ↗</a>
            </div>
        </div>
    </div>
    <header>
        <div class="container">
            {render_nav()}
        </div>
    </header>
    {content}
    {SITE_FOOTER_HTML}
    <script src="{prefix}/js/app.js" defer></script>
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
        f'''<a class="related-card" href="../{escapar(item.get('pagina', '#'))}"><span>{escapar(item.get('categoria', 'Actualidad'))}</span><strong>{escapar(item.get('titulo', 'Noticia local'))}</strong></a>''' for item in relacionadas)
    return f'''<section class="related-news" aria-label="Noticias relacionadas"><div class="section-title compact"><div><span class="section-kicker">Sigue leyendo</span><h2>Noticias relacionadas</h2></div></div><div class="related-grid">{cards}</div></section>'''


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
    imagen_html = f'<figure class="article-hero-image"><img src="{escapar(imagen)}" alt="{escapar(titulo)}" width="800" height="450"><figcaption>{escapar(fuente or "Alhaurín al Día")}</figcaption></figure>' if imagen else '<div class="article-hero-placeholder">Alhaurín al Día</div>'
    cuerpo_html = renderizar_parrafos_cuerpo(cuerpo)
    relacionadas = bloque_relacionadas(noticia, noticias)
    breadcrumb_schema = schema_breadcrumb_list(noticia, canonical)
    body = f'''
    <main class="article-page"><div class="container article-shell">
        <div class="breadcrumb"><a href="../">Inicio</a><span>›</span><a href="../noticias/">Noticias</a><span>›</span><a href="../categoria/{slugify(categoria)}/">{escapar(categoria)}</a></div>
        <div class="article-layout premium-article-layout">
            <article class="article-card premium-article-card">
                <header class="article-hero"><div class="article-meta"><span class="tag">{escapar(categoria)}</span>{f'<span class="source-mini-tag">{escapar(fuente)}</span>' if fuente else ''}{f'<span class="source-mini-tag">{escapar(fecha)}</span>' if fecha else ''}<span class="source-mini-tag">{escapar(lectura)}</span></div><h1 class="article-title">{escapar(titulo)}</h1><p class="article-summary">{escapar(descripcion)}</p></header>
                {imagen_html}
                <div class="article-content premium-article-content">
                    {cuerpo_html}
                    <div class="article-inline-ad"><div class="ad-slot ad-slot-native">Publicidad integrada en la noticia</div></div>
                    <aside class="article-editorial-note"><strong>Nota de Alhaurín al Día</strong><p>Alhaurín al Día recopila y organiza esta información para facilitar el acceso a la actualidad local de Alhaurín el Grande, respetando la fuente original y enlazando siempre al contenido de referencia.</p></aside>
                    <div class="article-source-box"><div><span>Fuente original</span><strong>{escapar(fuente or "Fuente externa")}</strong></div><a class="btn btn-primary" href="{escapar(enlace_original)}" target="_blank" rel="noopener noreferrer">Leer en la fuente original</a></div>
                </div>
            </article>
            <aside class="article-sidebar premium-article-sidebar" aria-label="Opciones de la noticia"><div class="share-card"><span class="mini-label">Opciones</span><h2>Comparte o guarda</h2><div class="share-actions"><a href="https://api.whatsapp.com/send?text={share_text}" target="_blank" rel="noopener noreferrer">WhatsApp</a><a href="https://www.facebook.com/sharer/sharer.php?u={share_url}" target="_blank" rel="noopener noreferrer">Facebook</a><a href="https://twitter.com/intent/tweet?url={share_url}&text={quote(titulo)}" target="_blank" rel="noopener noreferrer">X</a></div><button type="button" class="btn btn-secondary bookmark-btn" data-id="{escapar(noticia.get('id', ''))}" data-title="{escapar(titulo)}" data-url="{escapar(canonical)}" style="margin-top: 12px; width: 100%; text-align: center;">⭐ Guardar en Mi Alhaurín</button></div><div class="ad-slot ad-slot-sidebar ad-slot-sticky">Publicidad lateral</div></aside>
        </div>{relacionadas}</div></main>
    <script type="application/ld+json">{schema_news_article(noticia, canonical)}</script>
    <script type="application/ld+json">{breadcrumb_schema}</script>
    <script type="application/ld+json">{schema_organization()}</script>
    <script type="application/ld+json">{schema_website()}</script>'''
    return f'<!doctype html>\n<html lang="es">\n{html_header(titulo + " — Alhaurín al Día", descripcion, canonical, imagen, "..", "article")}\n{site_chrome(body, "..")}\n</html>'


def generar_html_categoria(categoria, noticias):
    slug = slugify(categoria)
    canonical = f"{SITE_URL}/categoria/{slug}/"
    descripcion = f"Últimas noticias de {categoria} en Alhaurín el Grande. Actualidad local, avisos y novedades recopiladas por Alhaurín al Día."
    cards = []
    for noticia in noticias:
        img = noticia.get("imagen", "")
        titulo_noticia = noticia.get("titulo", "Noticia")
        cards.append(f'''<article class="content-card news-card">{f'<div class="news-image"><img src="{escapar(img)}" alt="{escapar(titulo_noticia)}" loading="lazy" width="400" height="230"></div>' if img else '<div class="news-image news-placeholder"><span>Alhaurín al Día</span></div>'}<div class="news-body"><span class="tag">{escapar(categoria)}</span><h3>{
                     escapar(titulo_noticia)}</h3><p>{escapar(noticia.get("descripcion") or noticia.get("resumen") or "")}</p></div><div class="news-footer"><small>{escapar(noticia.get("fuente", ""))}</small><a class="read-more" href="../../{escapar(noticia.get("pagina", "#"))}" aria-label="Leer: {escapar(titulo_noticia)}">Leer noticia →</a></div></article>''')
    listado = ''.join(cards) if cards else '<p class="empty-state">No hay noticias publicadas en esta categoría por ahora. Consulta <a href="../../noticias/">todas las noticias</a>.</p>'
    resumen_cantidad = f"{len(noticias)} noticias disponibles en esta categoría." if noticias else "Sin noticias publicadas por ahora en esta categoría."
    body = f'''
    <main><section class="hero"><div class="container"><div class="hero-card"><span class="eyebrow">Categoría</span><h1>{escapar(categoria)}</h1><p class="lead">{escapar(descripcion)}</p></div></div></section><section><div class="container"><div class="section-title"><h2>Últimas noticias</h2><p>{escapar(resumen_cantidad)}</p></div><div class="grid-3">{listado}</div></div></section></main>
    <script type="application/ld+json">{schema_collection_page(categoria, canonical, descripcion)}</script>
    <script type="application/ld+json">{schema_item_list(noticias)}</script>
    <script type="application/ld+json">{schema_breadcrumb_categoria(categoria, canonical)}</script>
    <script type="application/ld+json">{schema_organization()}</script>
    <script type="application/ld+json">{schema_website()}</script>'''
    return f'<!doctype html>\n<html lang="es">\n{html_header(categoria + " — Alhaurín al Día", descripcion, canonical, "", "../..", "website", incluir_article_css=False)}\n{site_chrome(body, "../..")}\n</html>'


def escribir_si_cambia(ruta, contenido):
    """No reescribe si el contenido es idéntico, para que el mtime del
    archivo (usado como lastmod real en el sitemap) refleje la última
    modificación de verdad y no la fecha del último build."""
    if ruta.exists() and ruta.read_text(encoding="utf-8") == contenido:
        return False
    ruta.write_text(contenido, encoding="utf-8")
    return True


def asignar_paginas_noticias(noticias):
    """Slug write-once, puro/en memoria -- sin tocar disco. Una noticia que
    ya trae "pagina" asignada (heredada del registro editorial o del
    puente legacy vía resolver_identidad_noticia() en obtener_noticias())
    NUNCA se recalcula aquí, aunque el titular haya cambiado -- solo se
    genera una ruta nueva desde el título para noticias genuinamente sin
    página previa.

    Las páginas ya asignadas se reservan primero, con validación de
    integridad vía id_por_pagina: misma página + mismo id es la MISMA
    noticia (compatible, write-once normal); misma página + id DISTINTO es
    una colisión real -- publicar dos artículos distintos en la misma URL
    fusionaría su contenido en el HTML sin que nadie lo decidiera, así que
    se rechaza con PaginaColisionError en vez de sobrescribir en
    silencio. Separada de la escritura a disco para que guardar_noticias()
    pueda validar todo (bookkeeping, páginas, registro) ANTES de escribir
    ningún artefacto."""
    rutas_usadas = set()
    id_por_pagina = {}
    for noticia in noticias:
        pagina = noticia.get("pagina")
        if not pagina:
            continue
        id_existente = id_por_pagina.get(pagina)
        if id_existente is not None and id_existente != noticia["id"]:
            raise PaginaColisionError(pagina, id_existente, noticia["id"])
        id_por_pagina[pagina] = noticia["id"]
        rutas_usadas.add(pagina)
    for noticia in noticias:
        if noticia.get("pagina"):
            continue
        ruta_base = generar_ruta_pagina(noticia.get(
            "titulo", noticia.get("id", "noticia")))
        ruta = ruta_base
        contador = 2
        while ruta in rutas_usadas:
            ruta = f"noticias/{Path(ruta_base).stem}-{contador}.html"
            contador += 1
        rutas_usadas.add(ruta)
        noticia["pagina"] = ruta


def escribir_paginas_noticias(noticias):
    """Escribe a disco el HTML de cada noticia. Asume que asignar_paginas_noticias()
    ya se ejecutó -- toda noticia debe traer ya "pagina" asignada."""
    NOTICIAS_DIR.mkdir(parents=True, exist_ok=True)
    escritas = 0
    for noticia in noticias:
        if escribir_si_cambia(BASE_DIR / noticia["pagina"], generar_html_noticia(noticia, noticias)):
            escritas += 1
    print("Páginas individuales creadas/actualizadas:", escritas, "de", len(noticias))


def generar_paginas_noticias(noticias):
    """Envoltorio de compatibilidad: asigna páginas (write-once) y las
    escribe a disco en un solo paso. Lo usa regenerar_paginas_noticias.py
    (que no pasa por guardar_noticias()); guardar_noticias() en cambio
    llama a asignar_paginas_noticias()/escribir_paginas_noticias() por
    separado para poder validar entre ambos pasos."""
    asignar_paginas_noticias(noticias)
    escribir_paginas_noticias(noticias)


def generar_paginas_categorias(noticias):
    por_categoria = defaultdict(list)
    for noticia in noticias:
        por_categoria[noticia.get("categoria", "Actualidad")].append(noticia)
    # Regenera SIEMPRE las categorías conocidas, no solo las que tienen
    # noticias en este momento: si una categoría se queda sin artículos
    # (por dedupe/limpieza de huérfanas) su página debe quedar con un
    # estado vacío correcto en vez de conservar enlaces a noticias ya
    # borradas.
    todas_las_categorias = set(CATEGORIAS_VALIDAS) | set(por_categoria.keys())
    escritas = 0
    for categoria in sorted(todas_las_categorias):
        items = por_categoria.get(categoria, [])
        ruta = BASE_DIR / generar_ruta_categoria(categoria)
        ruta.parent.mkdir(parents=True, exist_ok=True)
        if escribir_si_cambia(ruta, generar_html_categoria(categoria, items)):
            escritas += 1
    print("Páginas de categoría creadas/actualizadas:", escritas, "de", len(todas_las_categorias))
    return sorted(todas_las_categorias)


def obtener_noticias():
    """Devuelve (noticias, bookkeeping_por_id).

    noticias: lista pública, mismo esquema de siempre -- SIN campos de
    identidad/caché internos.

    bookkeeping_por_id: dict id -> {source_identity, content_hash,
    content_hash_previo, prompt_version, ia_exitosa, ia_intentada,
    ai_attempts, last_ai_attempt, date_published, date_modified_previa,
    editorial_previo, pagina_previa, motivo_cache}, completamente separado
    del dict de noticia pública. content_hash_previo e ia_intentada
    (task #17) viajan aquí sin más uso dentro de esta función -- los
    consume guardar_noticias() para construir el log estructurado de
    disparadores de actualización (scripts/lib/editorial_log.py). Se
    filtra al final para contener EXACTAMENTE los mismos ids que
    `noticias` (el recorte a MAX_NOTICIAS_TOTAL puede dejar candidatas
    fuera).

    date_modified NO se decide aquí: date_modified_previa (el valor ya
    persistido) y editorial_previo (el payload cacheado, o None si no
    había) viajan como datos crudos -- es guardar_noticias() quien, con la
    noticia ya SANEADA (post quality-gate, que puede rescatar el titular o
    rechazar la noticia entera), decide si el contenido público final
    cambió de verdad respecto al anterior. Decidirlo aquí, sobre el
    resultado pre-quality-gate, contaría como "modificación editorial" un
    cambio que sanear_noticia() podría revertir o incluso rechazar.

    El registro editorial (data/noticias-editorial.json) NO se escribe
    aquí: esta función solo LEE el registro y el puente legacy -- la
    persistencia ocurre más tarde, en guardar_noticias(), después del
    quality gate. Escribir aquí congelaría en el registro candidatas que
    todavía pueden ser rechazadas.

    Orden por entrada: source_identity -> content_hash -> duplicado dentro
    de esta misma ejecución -> entrada previa del registro -> puente
    legacy -> resolver id/pagina/date_published -> comprobar colisión de
    id -> SOLO ENTONCES decidir caché y llamar a la IA/fallback. La
    identidad se resuelve antes de gastar una llamada real a OpenAI.

    Fail-closed, sin capturar nada: el puente legacy (cargar_identidad_legacy),
    IdentidadLegacyAmbiguaError/IdentidadLegacyInvalidaError de
    resolver_identidad_noticia(), IdentidadColisionError e
    IdentidadDuplicadaEnEjecucionError se propagan y abortan la ejecución
    completa -- son corrupciones/ambigüedades estructurales de identidad,
    no un problema de un artículo aislado (a diferencia de "no es local" o
    "sin identidad posible", que sí se descartan por artículo)."""
    noticias = []
    bookkeeping_por_id = {}
    vistos_por_source_identity = {}
    urls_vistas = set()
    fuentes = cargar_fuentes()

    registro = cargar_registro()
    # Fail-closed: SIN try/except aquí. Un fichero ausente ya es {} dentro
    # de cargar_identidad_legacy(); cualquier otro fallo (JSON corrupto,
    # colisión intra-fichero, entrada sin id) debe abortar la ejecución.
    legado_activas_indice = cargar_identidad_legacy(OUTPUT_FILE)
    legado_archivo_indice = cargar_identidad_legacy(BASE_DIR / "data" / "noticias-archivo.json")

    def _editorial_reutilizable(entrada):
        editorial = entrada.get("editorial") if entrada else None
        if isinstance(editorial, dict) and editorial.get("titulo") and editorial.get("cuerpo"):
            return editorial
        return None

    print("\nGenerando noticias para Alhaurín al Día")
    print("Archivo destino:", OUTPUT_FILE)
    print("Fuentes activas:", len(fuentes), "de", FUENTES_FILE.relative_to(BASE_DIR))
    print("IA editorial:", "activada" if ia_activada() else "desactivada")
    for fuente in fuentes:
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
            texto_limpio = limpiar_html(entry.get("summary", "") or entry.get(
                "description", "") or titulo_original)
            incluir, requiere_revision = evaluar_relevancia_geografica(
                titulo_original, texto_limpio, fuente["nombre"])
            if not incluir:
                print(f"✗ Descartada por no ser local: {titulo_original}")
                continue

            # --- 1. Identidad, ANTES de tocar la IA. ---
            try:
                source_identity = generar_source_identity(
                    entry_id=entry.get("id"),
                    url=url,
                    source_key=fuente["id"],
                    titulo_fallback=titulo_original,
                    fuente_fallback=fuente["nombre"],
                )
            except ValueError as exc:
                print(f"✗ Descartada, sin identidad posible: {titulo_original} ({exc})")
                continue

            content_hash = calcular_content_hash(titulo_original, texto_limpio)

            # Repetición de source_identity DENTRO de esta misma ejecución
            # (dos entradas de feed distintas resolviendo a la misma
            # identidad) -- se comprueba ANTES de gastar IA y antes de
            # tocar el registro/puente legacy para esta entrada.
            content_hash_previo_en_run = vistos_por_source_identity.get(source_identity)
            if content_hash_previo_en_run is not None:
                if content_hash_previo_en_run == content_hash:
                    print(f"✗ Descartada, duplicado exacto dentro de esta ejecución: {titulo_original}")
                    continue
                raise IdentidadDuplicadaEnEjecucionError(source_identity, content_hash_previo_en_run, content_hash)
            vistos_por_source_identity[source_identity] = content_hash

            entrada_previa = registro.get(source_identity)

            try:
                clave_url = canonicalizar_url(url)
            except ValueError:
                clave_url = None
            legado_activas = legado_activas_indice.get(clave_url) if clave_url else None
            legado_archivo = legado_archivo_indice.get(clave_url) if clave_url else None

            # Sin try/except: IdentidadLegacyAmbiguaError/IdentidadLegacyInvalidaError/
            # RegistroEditorialError se propagan y abortan -- una identidad
            # histórica contradictoria es un problema estructural, no de
            # un artículo aislado.
            id_final, pagina_previa, fecha_previa = resolver_identidad_noticia(
                entrada_previa, legado_activas, legado_archivo, source_identity, titulo_original, generar_id,
            )

            existente_bookkeeping = bookkeeping_por_id.get(id_final)
            if existente_bookkeeping is not None and existente_bookkeeping["source_identity"] != source_identity:
                # Colisión de id entre dos source_identity distintas DENTRO
                # de esta misma ejecución: error estructural, aborta.
                raise IdentidadColisionError(id_final, existente_bookkeeping["source_identity"], source_identity)

            # --- 2. Decisión de caché, y solo entonces IA/fallback. ---
            reusar, motivo_cache = decidir_cache_editorial(entrada_previa, content_hash)
            editorial_cacheado = _editorial_reutilizable(entrada_previa)

            if reusar:
                # CACHE_HIT real: nunca se llama a mejorar_noticia_con_ia().
                if editorial_cacheado is None:
                    raise RegistroEditorialError(
                        f"Entrada del registro para source_identity={source_identity!r} está marcada "
                        f"como reutilizable (CACHE_HIT) pero no tiene un payload editorial válido: "
                        f"{entrada_previa!r}"
                    )
                mejora = {**editorial_cacheado, "ia_exitosa": True, "ia_intentada": False}
                ai_attempts_nuevo = 0
                last_ai_attempt_nuevo = entrada_previa.get("last_ai_attempt")
            elif motivo_cache == CACHE_MISS_AI_NOT_SUCCESSFUL and not debe_reintentar_ia(entrada_previa):
                # En backoff tras fallos previos: no repetir la llamada real
                # a OpenAI todavía. content_hash no cambió, así que
                # regenerar el fallback produciría lo mismo -- se reutiliza
                # sin tocar ai_attempts (no hubo intento nuevo).
                if editorial_cacheado is None:
                    raise RegistroEditorialError(
                        f"Entrada del registro para source_identity={source_identity!r} está en "
                        f"backoff (AI_NOT_SUCCESSFUL) pero no tiene un payload de fallback "
                        f"persistido: {entrada_previa!r}"
                    )
                mejora = {**editorial_cacheado, "ia_exitosa": False, "ia_intentada": False}
                ai_attempts_nuevo = ai_attempts_seguro(entrada_previa.get("ai_attempts"))
                last_ai_attempt_nuevo = entrada_previa.get("last_ai_attempt")
            else:
                # Nueva, contenido/prompt_version cambiados, o backoff ya
                # expirado -- llamada real (o intento real) a
                # mejorar_noticia_con_ia().
                mejora = mejorar_noticia_con_ia(titulo_original, texto_limpio, fuente["nombre"])
                if mejora["ia_intentada"]:
                    # ai_attempts representa fallos consecutivos para LA
                    # MISMA clave de caché (source_identity + content_hash +
                    # prompt_version): solo AI_NOT_SUCCESSFUL continúa la
                    # racha anterior -- NEW/CONTENT_CHANGED/PROMPT_VERSION
                    # empiezan de cero, es una clave distinta.
                    last_ai_attempt_nuevo = datetime.now(timezone.utc).isoformat()
                    if mejora["ia_exitosa"]:
                        ai_attempts_nuevo = 0
                    else:
                        continua_racha = entrada_previa is not None and motivo_cache == CACHE_MISS_AI_NOT_SUCCESSFUL
                        base = ai_attempts_seguro(entrada_previa.get("ai_attempts")) if continua_racha else 0
                        ai_attempts_nuevo = base + 1
                else:
                    # IA desactivada -- no fue un intento real. Solo se
                    # conserva el estado de retry si la clave de caché es
                    # la misma que lo generó (AI_NOT_SUCCESSFUL); si la
                    # clave cambió (NEW/CONTENT_CHANGED/PROMPT_VERSION), la
                    # racha pertenece a una clave distinta y no se hereda
                    # -- si no, un cambio de contenido podría meter
                    # artificialmente en backoff a una clave que nunca falló.
                    if motivo_cache == CACHE_MISS_AI_NOT_SUCCESSFUL and entrada_previa is not None:
                        ai_attempts_nuevo = ai_attempts_seguro(entrada_previa.get("ai_attempts"))
                        last_ai_attempt_nuevo = entrada_previa.get("last_ai_attempt")
                    else:
                        ai_attempts_nuevo = 0
                        last_ai_attempt_nuevo = None

            fecha_entry = normalizar_fecha_entry(entry)
            date_published = fecha_previa or fecha_entry
            date_modified_previa = entrada_previa.get("date_modified") if entrada_previa else None

            noticia = {
                "id": id_final, "titulo": mejora["titulo"], "titulo_original": titulo_original,
                "descripcion": mejora["descripcion"], "resumen": mejora["descripcion"], "cuerpo": mejora["cuerpo"],
                "fecha": fecha_entry, "fuente": fuente["nombre"],
                "categoria": mejora["categoria"], "categoria_url": f"categoria/{slugify(mejora['categoria'])}/",
                "seo_keywords": mejora.get("seo_keywords", []), "enlace": url, "url": url,
                "imagen": extraer_imagen(entry, imagen_feed), "prioridad": prioridad_fuente(fuente["nombre"]),
                "requiere_revision_geografica": requiere_revision,
                "pagina": pagina_previa or "",
            }
            noticias.append(noticia)
            bookkeeping_por_id[id_final] = {
                "source_identity": source_identity,
                "content_hash": content_hash,
                "content_hash_previo": entrada_previa.get("content_hash") if entrada_previa else None,
                "prompt_version": PROMPT_VERSION,
                "ia_exitosa": mejora["ia_exitosa"],
                "ia_intentada": mejora["ia_intentada"],
                "ai_attempts": ai_attempts_nuevo,
                "last_ai_attempt": last_ai_attempt_nuevo,
                "date_published": date_published,
                "date_modified_previa": date_modified_previa,
                "editorial_previo": editorial_cacheado,
                "pagina_previa": pagina_previa,
                "motivo_cache": motivo_cache,
            }
            aviso_geo = " ⚠ revisar geografía" if requiere_revision else ""
            print(f"✓ [{motivo_cache}] {noticia['categoria']} | {noticia['titulo']}{aviso_geo}")
    # calcular_score (prioridad editorial + boost de recencia) decide qué
    # noticias entran cuando hay más candidatas que hueco disponible, pero el
    # ORDEN de publicación final es cronológico puro por fecha original de la
    # fuente: así "más reciente primero" refleja cuándo se publicó la
    # noticia, no la prioridad de la fuente ni la hora en que este script la
    # sincronizó.
    noticias.sort(key=calcular_score, reverse=True)
    noticias = noticias[:MAX_NOTICIAS_TOTAL]
    noticias.sort(key=lambda n: fecha_para_ordenacion(n["fecha"]), reverse=True)

    # bookkeeping_por_id debe representar EXACTAMENTE el mismo conjunto que
    # noticias -- el recorte a MAX_NOTICIAS_TOTAL de arriba puede haber
    # dejado fuera candidatas que sí llegaron a construir su bookkeeping.
    ids_finales = {n["id"] for n in noticias}
    bookkeeping_por_id = {id_: meta for id_, meta in bookkeeping_por_id.items() if id_ in ids_finales}

    return noticias, bookkeeping_por_id


def guardar_noticias(noticias, bookkeeping_por_id):
    """Persiste el resultado final. Orden deliberado: 1) validar todas las
    invariantes, 2) construir TODO en memoria (páginas asignadas + registro
    nuevo completo), 3) solo entonces escribir artefactos a disco (HTML,
    categorías, data/noticias.json, registro editorial) -- si algo
    inesperado apareciera durante la construcción (ids duplicados,
    bookkeeping faltante, página vacía, source_identity repetida con id
    distinto...), falla antes de haber tocado el sitio, no a medias.

    bookkeeping_por_id es OBLIGATORIO (sin valor por defecto): un llamador
    que lo olvide debe fallar alto (TypeError), no degradar en silencio a
    "no persistir registro editorial esta vez".

    El registro solo se actualiza para los ids presentes en `noticias` --
    cuando se invoca desde generar_noticias_seguro.py (el único punto de
    entrada real de producción), eso son exactamente los supervivientes de
    sanear_noticia()/deduplicar_noticias(); una candidata rechazada por el
    quality gate ni siquiera llega aquí. Es aceptable que bookkeeping_por_id
    traiga ids de MÁS (candidatas que obtener_noticias() vio pero que
    luego se descartaron o deduplicaron) -- lo que NO es aceptable es que
    falte alguno de los que sí se van a publicar.

    Esta función es la frontera de persistencia: no confía ciegamente en
    que obtener_noticias() ya garantizó ids únicos y una relación 1:1
    source_identity<->id -- lo revalida aquí, sobre el conjunto final que
    realmente se va a publicar (que puede ser un subconjunto filtrado por
    sanear_noticia()/deduplicar_noticias(), no necesariamente idéntico al
    que construyó obtener_noticias()).

    date_modified se decide comparando el payload público FINAL
    (titulo/descripcion/cuerpo/categoria/seo_keywords ya saneados, después
    del quality gate) contra editorial_previo (el payload cacheado de la
    ejecución anterior, transportado sin procesar en bookkeeping_por_id) --
    nunca contra el resultado crudo de mejorar_noticia_con_ia(), que
    sanear_titulo() todavía puede rescatar o rechazar. La misma comparación
    cubre, sin caso especial, que un fallback anterior se haya sustituido
    por un éxito de IA tras reintento: si el texto final cambió respecto al
    cacheado, cuenta como modificación editorial real."""
    # 1a. ids únicos -- un set oculta duplicados en silencio, así que se
    # compara la longitud contra la lista original antes de usar el set
    # para cualquier otra cosa.
    ids_noticias = [n["id"] for n in noticias]
    if len(set(ids_noticias)) != len(ids_noticias):
        raise RegistroEditorialError(
            "Hay ids duplicados entre las noticias a publicar -- cada noticia publicada debe tener un id único."
        )

    # 1b. bookkeeping presente para cada una.
    faltantes = set(ids_noticias) - set(bookkeeping_por_id.keys())
    if faltantes:
        raise RegistroEditorialError(
            f"Faltan entradas de bookkeeping para {len(faltantes)} noticia(s) a publicar: {sorted(faltantes)}"
        )

    # 1c. source_identity única -> siempre el mismo id (dos ids distintos
    # con la misma source_identity harían que el segundo sobrescribiera en
    # silencio al primero en el registro, indexado por source_identity).
    id_por_source_identity = {}
    for noticia in noticias:
        meta = bookkeeping_por_id[noticia["id"]]
        source_identity = meta["source_identity"]
        id_existente = id_por_source_identity.get(source_identity)
        if id_existente is not None and id_existente != noticia["id"]:
            raise RegistroEditorialError(
                f"source_identity={source_identity!r} está asociada a dos ids distintos entre "
                f"las noticias a publicar: {id_existente!r} y {noticia['id']!r}"
            )
        id_por_source_identity[source_identity] = noticia["id"]

    # 2. Asignar páginas (write-once) EN MEMORIA, sin escribir HTML todavía.
    asignar_paginas_noticias(noticias)
    sin_pagina = [n["id"] for n in noticias if not n.get("pagina")]
    if sin_pagina:
        raise RegistroEditorialError(
            f"Noticia(s) sin 'pagina' asignada tras asignar_paginas_noticias(): {sin_pagina}"
        )

    # 3. Construir COMPLETAMENTE el registro nuevo en memoria, y los
    # eventos de log de disparadores de actualización (task #17) -- el log
    # es puramente observacional y se escribe al FINAL, después de todos
    # los artefactos autoritativos (ver paso 5).
    registro = cargar_registro()
    eventos_log = []
    timestamp_run = datetime.now(timezone.utc).isoformat()
    for noticia in noticias:
        meta = bookkeeping_por_id[noticia["id"]]
        payload_final = {
            "titulo": noticia.get("titulo"), "descripcion": noticia.get("descripcion"),
            "cuerpo": noticia.get("cuerpo"), "categoria": noticia.get("categoria"),
            "seo_keywords": noticia.get("seo_keywords", []),
        }
        # public_content_changed: la MISMA comparación que ya decidía
        # date_modified -- sin cambiar su lógica, solo con nombre
        # explícito para que el log de task #17 la exponga. Con
        # editorial_previo=None (fuente nueva) queda False: no hay
        # representación pública previa con la que comparar.
        public_content_changed = meta["editorial_previo"] is not None and payload_final != meta["editorial_previo"]
        if meta["editorial_previo"] is None:
            date_modified = None
        elif public_content_changed:
            date_modified = datetime.now(timezone.utc).isoformat()
        else:
            date_modified = meta["date_modified_previa"]

        registro[meta["source_identity"]] = {
            "id": noticia["id"],
            "source_url": noticia.get("enlace") or noticia.get("url"),
            "content_hash": meta["content_hash"],
            "prompt_version": meta["prompt_version"],
            "ia_exitosa": meta["ia_exitosa"],
            "ai_attempts": meta["ai_attempts"],
            "last_ai_attempt": meta["last_ai_attempt"],
            "editorial": payload_final,
            "pagina": noticia["pagina"],
            "date_published": meta["date_published"],
            "date_modified": date_modified,
        }

        eventos_log.append(construir_evento(
            source_identity=meta["source_identity"],
            id_=noticia["id"],
            pagina=noticia["pagina"],
            previous_content_hash=meta["content_hash_previo"],
            current_content_hash=meta["content_hash"],
            cache_status=meta["motivo_cache"],
            ai_called=meta["ia_intentada"],
            ai_success=meta["ia_exitosa"],
            public_content_changed=public_content_changed,
            previous_date_modified=meta["date_modified_previa"],
            resulting_date_modified=date_modified,
            timestamp=timestamp_run,
        ))

    # 4. Solo ahora, con todo validado y construido, escribir artefactos
    # autoritativos.
    escribir_paginas_noticias(noticias)
    generar_paginas_categorias(noticias)

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(noticias, f, ensure_ascii=False, indent=2)

    guardar_registro(registro)

    print("Noticias guardadas:", OUTPUT_FILE)

    # 5. Log observacional (task #17), estrictamente AL FINAL del
    # persistence boundary completo -- después de HTML, categorías,
    # data/noticias.json y el registro editorial, todos ya escritos con
    # éxito. registrar_eventos() es best-effort por contrato (nunca
    # lanza): un fallo aquí no debe poder revertir ni invalidar una
    # publicación cuyo estado editorial principal ya quedó persistido
    # correctamente.
    registrar_eventos(eventos_log)


if __name__ == "__main__":
    # generar_noticias.py NO es un entrypoint de publicación: guardar_noticias()
    # asume que solo recibe supervivientes del quality gate
    # (sanear_noticia()/deduplicar_noticias()), y el único sitio que aplica
    # ese gate antes de llamarla es scripts/generar_noticias_seguro.py (el
    # entrypoint real de producción, npm run news). Delegar aquí importando
    # ese módulo arriesgaría cargar este fichero dos veces (como __main__ y
    # como import de generar_noticias_seguro.py) -- se deja sin
    # implementar deliberadamente en vez de introducir esa dependencia
    # circular.
    print(
        "Este módulo no es un entrypoint de publicación. "
        "Usa scripts/generar_noticias_seguro.py.",
        file=sys.stderr,
    )
    sys.exit(2)
