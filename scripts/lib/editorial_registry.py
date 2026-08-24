"""Registro editorial persistente (Fase 2), fuente única en
data/noticias-editorial.json, indexado por sourceIdentity.

Resuelve dos problemas verificados en producción:

1. **Caché de IA por contenido, no solo por URL.** obtener_noticias()
   volvía a llamar a mejorar_noticia_con_ia() para CUALQUIER entrada que
   siguiera dentro de la ventana de un feed, incluso si ya se había
   procesado en un ciclo anterior sin cambios reales -- con temperature=0.2
   el texto generado variaba levemente cada vez, produciendo commits
   automáticos espurios cada ~2h. Aquí se cachea por
   sourceIdentity + content_hash + prompt_version: mismo contenido real =
   se reutiliza el resultado editorial sin gastar una llamada a OpenAI.

2. **Slug write-once.** generar_paginas_noticias() recalculaba "pagina"
   desde el título en cada ejecución sin comprobar si esa noticia ya tenía
   una URL asignada -- la misma URL de origen podía cambiar de slug entre
   ciclos solo porque la IA redactó el título de forma distinta. Aquí,
   sourceIdentity -> pagina se persiste una vez y se reutiliza siempre.

sourceIdentity no depende de una URL sin normalizar: prioriza el GUID/ID
del feed (feedparser ya normaliza tanto <guid> de RSS como <id> de Atom
bajo entry.id) y, si no existe, cae a la URL canonicalizada (parámetros de
tracking INEQUÍVOCOS eliminados, todo lo demás intacto). Verificado con
datos reales: la fuente del Ayuntamiento (prioridad más alta) da un guid
estable ("https://alhaurinelgrande.es/?p=224703") distinto de su link,
justo el caso que justifica esta preferencia.

El GUID se namespacea por fuente (guid:<source_key>:<valor>) porque RSS/Atom
solo garantiza unicidad del GUID DENTRO de un mismo feed, no entre fuentes
distintas -- dos feeds distintos podrían coincidir en un guid corto/opaco
(p. ej. IDs numéricos secuenciales de dos WordPress distintos).

La deduplicación de identidad es deliberadamente conservadora: ante la duda
sobre si un parámetro de query es tracking o funcional, se conserva (mejor
separar dos veces la misma URL que fusionar dos recursos distintos).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

from lib.editorial_rules import normalizar_texto

REGISTRO_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "noticias-editorial.json"

# Versión del prompt/esquema de mejorar_noticia_con_ia(). Súbela cuando
# cambie el prompt o los campos que se le piden a la IA -- invalida la
# caché de las entradas ya registradas con una versión distinta, para no
# servir resultados con forma antigua tras actualizar el prompt.
PROMPT_VERSION = "2026-08-v1"

# Solo parámetros inequívocamente de tracking (prefijo utm_ estándar de
# Google Analytics, o parámetros de un único proveedor conocido). "ref" y
# "refsrc" se dejaron fuera deliberadamente: son nombres genéricos que
# algunas URLs usan como parámetro funcional real (p. ej. un ID de
# referencia de contenido), no exclusivamente como tracking -- ante la duda,
# se conservan en la identidad en vez de arriesgar fusionar dos recursos
# distintos.
_PARAMETROS_TRACKING = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "utm_id", "utm_reader", "fbclid", "gclid", "mc_cid", "mc_eid",
    "igshid", "_ga",
}


class RegistroEditorialError(Exception):
    """Fallo de seguridad del registro editorial. Se lanza cuando no se
    puede garantizar que un registro corrupto quede preservado antes de
    seguir -- nunca debe ser posible llegar a guardar_registro() y
    sobrescribir silenciosamente un original corrupto sin evidencia."""


def canonicalizar_url(url: str, base: str | None = None) -> str:
    """Normaliza una URL para identidad: minúsculas en esquema/host,
    parámetros de tracking inequívocos eliminados, cualquier otro parámetro
    (paginación, IDs de artículo en query string...) se conserva intacto,
    sin fragmento (#...), barra final del path normalizada.

    No se asume que `url` sea siempre absoluta: si no tiene host y se pasa
    `base` (la URL del propio feed, normalmente), se resuelve contra esa
    base con urljoin() antes de canonicalizar. Si sigue sin poder
    resolverse a una URL absoluta, se lanza ValueError en vez de fabricar
    algo como "https:///ruta" -- el llamador debe caer al siguiente nivel
    de la cadena de identidad (ver generar_source_identity)."""
    url = (url or "").strip()
    partes = urlsplit(url)

    if not partes.netloc:
        if not base:
            raise ValueError(f"URL relativa sin base para resolver: {url!r}")
        url = urljoin(base, url)
        partes = urlsplit(url)
        if not partes.netloc:
            raise ValueError(f"No se pudo resolver una URL absoluta a partir de {url!r} con base {base!r}")

    esquema = (partes.scheme or "https").lower()
    host = partes.netloc.lower()
    query_filtrada = sorted(
        (clave, valor)
        for clave, valor in parse_qsl(partes.query, keep_blank_values=True)
        if clave.lower() not in _PARAMETROS_TRACKING
    )
    query = urlencode(query_filtrada)
    ruta = partes.path.rstrip("/") or "/"
    return urlunsplit((esquema, host, ruta, query, ""))


def generar_source_identity(
    entry_id: str,
    url: str,
    source_key: str,
    *,
    titulo_fallback: str = "",
    fuente_fallback: str = "",
    base: str | None = None,
) -> str:
    """Orden de preferencia: GUID/ID del feed (namespaceado por
    source_key, ver docstring del módulo) -> URL canonicalizada -> fallback
    determinista (hash de source_key+título+fuente normalizados, cuando no
    hay ni id ni URL resoluble).

    `base` (normalmente la URL del propio feed) se usa solo para resolver
    valores relativos -- por convención feedparser ya entrega `entry.link`
    resuelto de forma absoluta contra el feed, así que en la práctica no
    debería hacer falta, pero no se asume: si `url` o un guid-con-forma-de-
    URL resultan relativos, se intentan resolver contra `base` antes de
    caer al siguiente nivel de la cadena.

    El fallback incluye siempre source_key en el material del hash: dos
    fuentes distintas sin GUID/URL podrían compartir título normalizado
    (p. ej. un título genérico repetido), y source_key + fuente_fallback no
    son intercambiables -- source_key es el identificador estable de
    data/fuentes.json, fuente_fallback es el nombre en texto libre que
    llega con la propia noticia. Si ni siquiera queda un título con el que
    diferenciar una entrada de sus hermanas del mismo feed (el único dato
    verdaderamente por-entrada de los tres), se lanza ValueError en vez de
    devolver el mismo hash constante para todas ellas -- el llamador debe
    tratarlo igual que cualquier otra entrada sin datos suficientes (ver
    obtener_noticias(), que ya descarta entradas sin título o sin URL antes
    de llegar aquí)."""
    if entry_id and str(entry_id).strip():
        valor = str(entry_id).strip()
        if valor.lower().startswith(("http://", "https://", "/")):
            try:
                valor = canonicalizar_url(valor, base=base)
            except ValueError:
                pass  # guid con forma de URL pero no resoluble: se usa tal cual, como opaco
        return f"guid:{source_key}:{valor}"

    if url and url.strip():
        try:
            return f"url:{canonicalizar_url(url, base=base)}"
        except ValueError:
            pass  # url relativa sin base resoluble: cae al fallback determinista

    titulo_norm = normalizar_texto(titulo_fallback)
    if not titulo_norm:
        raise ValueError(
            "No hay guid, ni URL resoluble, ni título con el que construir un "
            "sourceIdentity que distinga esta entrada de otras del mismo feed -- "
            "no se genera un hash constante que colisionaría silenciosamente."
        )

    base_normalizada = "|".join([
        normalizar_texto(source_key),
        titulo_norm,
        normalizar_texto(fuente_fallback),
    ])
    return f"hash:{hashlib.sha1(base_normalizada.encode('utf-8')).hexdigest()}"


def calcular_content_hash(titulo_original: str, texto: str) -> str:
    """Hash del contenido crudo de la fuente (antes de pasar por IA):
    cambia solo si la fuente publicó algo realmente distinto, no si la IA
    redacta el mismo hecho con otras palabras en el siguiente ciclo."""
    base = normalizar_texto(f"{titulo_original} {texto}")
    return hashlib.sha1(base.encode("utf-8")).hexdigest()


def cargar_registro() -> dict[str, Any]:
    """Si el fichero no existe, es la primera ejecución -- {} es correcto y
    silencioso. Si existe pero está corrupto (JSON inválido o no es un
    dict), es un estado anómalo: se avisa por stderr de forma explícita y
    se intenta conservar el fichero corrupto renombrado antes de continuar
    con un registro vacío en memoria. Si NO se puede preservar con
    seguridad (p. ej. el renombrado falla), se lanza RegistroEditorialError
    en vez de devolver {} -- eso detiene la ejecución antes de que pueda
    llegarse a guardar_registro() y sobrescribir el original corrupto sin
    haber guardado la evidencia."""
    if not REGISTRO_FILE.exists():
        return {}

    try:
        datos = json.loads(REGISTRO_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(
            f"[editorial_registry] AVISO: {REGISTRO_FILE} contiene JSON inválido ({exc}).",
            file=sys.stderr,
        )
        _archivar_registro_corrupto()
        return {}

    if not isinstance(datos, dict):
        print(
            f"[editorial_registry] AVISO: {REGISTRO_FILE} no contiene un objeto "
            f"JSON (tipo real: {type(datos).__name__}).",
            file=sys.stderr,
        )
        _archivar_registro_corrupto()
        return {}

    return datos


def _archivar_registro_corrupto() -> None:
    marca = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    destino = REGISTRO_FILE.with_name(f"{REGISTRO_FILE.stem}.corrupto-{marca}.json")
    try:
        REGISTRO_FILE.rename(destino)
    except OSError as exc:
        raise RegistroEditorialError(
            f"No se pudo preservar el registro corrupto ({REGISTRO_FILE}) antes de "
            f"continuar: {exc}. Se aborta para no arriesgar sobrescribirlo "
            "silenciosamente sin haber guardado la evidencia."
        ) from exc
    print(f"[editorial_registry] Fichero corrupto conservado en: {destino}", file=sys.stderr)


def guardar_registro(registro: dict[str, Any]) -> None:
    """Escritura atómica: nunca se escribe directamente sobre
    REGISTRO_FILE. Se escribe primero en un fichero temporal en el mismo
    directorio (mismo filesystem, para que os.replace() sea atómico) y se
    sustituye el original de una vez -- si el proceso se interrumpe a
    mitad, el fichero final sigue siendo el anterior íntegro o el nuevo
    íntegro, nunca un JSON a medias."""
    REGISTRO_FILE.parent.mkdir(parents=True, exist_ok=True)
    contenido = json.dumps(registro, ensure_ascii=False, indent=2, sort_keys=True) + "\n"

    tmp_path = REGISTRO_FILE.with_suffix(f".tmp-{os.getpid()}")
    try:
        tmp_path.write_text(contenido, encoding="utf-8")
        os.replace(tmp_path, REGISTRO_FILE)
    finally:
        if tmp_path.exists():
            tmp_path.unlink()


# --- Decisión de caché de IA. Cinco motivos posibles, usados tal cual en
# logs y en reports/editorial-pipeline-report.json (tarea #17): un resultado
# de fallback (ia_exitosa=False) NUNCA se trata como caché editorial
# definitiva solo porque el contenido no cambió -- eso congelaría un
# titular de fallback para siempre si la IA falló una sola vez. Pero
# reintentar la llamada real a OpenAI en CADA ejecución (cada ~2h) sin
# límite, para una fuente con un fallo persistente, desperdicia llamadas
# indefinidamente -- de ahí debe_reintentar_ia() con backoff exponencial
# simple, con tope. ---------------------------------------------------------

CACHE_HIT = "CACHE_HIT"
CACHE_MISS_NEW = "CACHE_MISS_NEW"
CACHE_MISS_CONTENT_CHANGED = "CACHE_MISS_CONTENT_CHANGED"
CACHE_MISS_PROMPT_VERSION = "CACHE_MISS_PROMPT_VERSION"
CACHE_MISS_AI_NOT_SUCCESSFUL = "CACHE_MISS_AI_NOT_SUCCESSFUL"

# Backoff exponencial con tope: 2h, 4h, 8h, 12h máximo a partir del 4º fallo
# consecutivo. Con el cron cada ~2h, esto significa: el 1er fallo se
# reintenta en el siguiente ciclo, y a partir de ahí se van saltando ciclos
# hasta un máximo de 1 reintento cada 12h.
_BACKOFF_MINUTOS_BASE = 120
_BACKOFF_TOPE_MINUTOS = 720


def decidir_cache_editorial(entrada: dict[str, Any] | None, content_hash: str) -> tuple[bool, str]:
    """Devuelve (reusar: bool, motivo: str).

    reusar=True implica ia_exitosa=True en la entrada -- es la ÚNICA
    condición de caché HIT definitiva: content_hash coincide, prompt_version
    coincide, e ia_exitosa es True. Si ia_exitosa es False (resultado de
    fallback_editorial(), no de la IA real), nunca es HIT aunque el
    contenido no haya cambiado -- ver debe_reintentar_ia() para decidir si
    corresponde reintentar la llamada real en esta ejecución.

    Un cambio de contenido o de prompt_version SIEMPRE gana sobre cualquier
    backoff pendiente: se comprueban antes que ia_exitosa, así que
    debe_reintentar_ia() ni siquiera se consulta en esos casos (motivo ya es
    CONTENT_CHANGED/PROMPT_VERSION, no AI_NOT_SUCCESSFUL) -- un backoff de
    intentos fallidos previos nunca retrasa un reintento que ya es
    obligatorio por otra razón."""
    if entrada is None:
        return False, CACHE_MISS_NEW
    if entrada.get("content_hash") != content_hash:
        return False, CACHE_MISS_CONTENT_CHANGED
    if entrada.get("prompt_version") != PROMPT_VERSION:
        return False, CACHE_MISS_PROMPT_VERSION
    if not entrada.get("ia_exitosa", False):
        return False, CACHE_MISS_AI_NOT_SUCCESSFUL
    return True, CACHE_HIT


def _a_utc(momento: datetime) -> datetime:
    """Normaliza cualquier datetime a aware-UTC: naive se interpreta como
    UTC (nunca se asume la zona local del proceso), aware se convierte."""
    if momento.tzinfo is None:
        return momento.replace(tzinfo=timezone.utc)
    return momento.astimezone(timezone.utc)


def ai_attempts_seguro(valor: Any) -> int:
    """ai_attempts viene de JSON persistido -- puede estar corrupto (string
    numérica, negativo, texto no numérico...). Nunca debe propagarse tal
    cual a un exponente (2 ** (intentos - 1)) NI usarse directamente como
    base de un incremento (entrada.get("ai_attempts", 0) + 1 sobre JSON sin
    validar): un valor no interpretable se trata como "sin intentos
    previos" (backoff mínimo, no bloqueante) con aviso, en vez de lanzar o
    producir un backoff/contador absurdo. Pública (sin guión bajo): la usan
    tanto debe_reintentar_ia() como generar_noticias.py al calcular el
    próximo ai_attempts."""
    try:
        intentos = int(valor)
    except (TypeError, ValueError):
        print(f"[editorial_registry] AVISO: ai_attempts no numérico ({valor!r}), se trata como 0", file=sys.stderr)
        return 0
    if intentos < 0:
        print(f"[editorial_registry] AVISO: ai_attempts negativo ({valor!r}), se trata como 0", file=sys.stderr)
        return 0
    return intentos


def debe_reintentar_ia(entrada: dict[str, Any] | None, ahora: datetime | None = None) -> bool:
    """Solo se consulta cuando decidir_cache_editorial() devolvió
    CACHE_MISS_AI_NOT_SUCCESSFUL (contenido/prompt_version sin cambios, pero
    la entrada previa no tuvo éxito real de IA). Se basa en dos campos que
    solo se actualizan cuando de verdad se intentó llamar a la IA (nunca
    cuando ia_activada() es False -- ver mejorar_noticia_con_ia() /
    ia_intentada en generar_noticias.py; no tener API key configurada no
    cuenta como intento fallido y no debe incrementar ai_attempts):

    - ai_attempts: nº de intentos reales consecutivos sin éxito.
    - last_ai_attempt: ISO-8601 del último intento real.

    Sin entrada, sin intentos previos registrados, o con un timestamp
    ilegible, siempre debe reintentarse (nada fiable que esperar)."""
    if entrada is None:
        return True
    intentos = ai_attempts_seguro(entrada.get("ai_attempts"))
    ultimo = entrada.get("last_ai_attempt")
    if intentos <= 0 or not ultimo:
        return True
    try:
        momento_ultimo = _a_utc(datetime.fromisoformat(str(ultimo).replace("Z", "+00:00")))
    except ValueError:
        return True
    ahora_utc = _a_utc(ahora) if ahora is not None else datetime.now(timezone.utc)
    minutos_espera = min(_BACKOFF_TOPE_MINUTOS, _BACKOFF_MINUTOS_BASE * (2 ** (intentos - 1)))
    minutos_transcurridos = (ahora_utc - momento_ultimo).total_seconds() / 60
    return minutos_transcurridos >= minutos_espera


class IdentidadColisionError(Exception):
    """Se lanza cuando dos source_identity DISTINTAS, dentro de la MISMA
    ejecución de obtener_noticias(), resuelven al mismo id publicado --
    colisión real (extremadamente improbable, generar_id() deriva de un
    hash) o síntoma de un fallo de identidad más profundo. Nunca se
    sobrescribe en silencio la entrada de bookkeeping ya asociada a ese id:
    publicar dos artículos distintos bajo el mismo id/pagina fusionaría su
    contenido sin que nadie lo decidiera explícitamente."""

    def __init__(self, id_colisionado: str, source_identity_existente: str, source_identity_nueva: str):
        self.id_colisionado = id_colisionado
        self.source_identity_existente = source_identity_existente
        self.source_identity_nueva = source_identity_nueva
        super().__init__(
            f"Colisión de id={id_colisionado!r} entre source_identity={source_identity_existente!r} "
            f"y source_identity={source_identity_nueva!r} dentro de la misma ejecución"
        )


class IdentidadDuplicadaEnEjecucionError(Exception):
    """Se lanza cuando la MISMA source_identity aparece dos veces dentro de
    una misma ejecución de obtener_noticias() con content_hash DISTINTO --
    dos entradas de feed que deberían representar la misma publicación pero
    traen contenido incompatible en el mismo snapshot. Un duplicado EXACTO
    (mismo content_hash) se ignora silenciosamente sin gastar IA -- esto es
    solo para el caso ambiguo, donde no hay una respuesta segura sobre cuál
    de las dos versiones es la correcta: error estructural, no un descarte
    por artículo."""

    def __init__(self, source_identity: str, content_hash_a: str, content_hash_b: str):
        self.source_identity = source_identity
        self.content_hash_a = content_hash_a
        self.content_hash_b = content_hash_b
        super().__init__(
            f"source_identity={source_identity!r} aparece dos veces en la misma ejecución "
            f"con content_hash distinto: {content_hash_a!r} vs {content_hash_b!r}"
        )


class PaginaColisionError(Exception):
    """Se lanza cuando dos noticias con id DISTINTO, dentro de la misma
    llamada a generar_paginas_noticias(), tienen la misma "pagina" ya
    asignada (heredada del registro editorial o del puente legacy). Misma
    página + mismo id es compatible (es la MISMA noticia, write-once
    normal); misma página + id distinto es una colisión real -- publicar
    dos artículos distintos en la misma URL fusionaría su contenido en el
    HTML sin que nadie lo decidiera. Fail-closed: nunca se sobrescribe en
    silencio."""

    def __init__(self, pagina: str, id_existente: str, id_nuevo: str):
        self.pagina = pagina
        self.id_existente = id_existente
        self.id_nuevo = id_nuevo
        super().__init__(
            f"Colisión de pagina={pagina!r} entre id={id_existente!r} y id={id_nuevo!r}"
        )


# --- Puente de compatibilidad con id/pagina asignados ANTES de que
# existiera este registro (data/noticias.json y data/noticias-archivo.json
# generados con generar_id(url, titulo), indexados por URL en vez de por
# sourceIdentity). Solo interviene mientras el registro editorial (arriba)
# todavía no conoce una sourceIdentity -- una vez que guardar_noticias() la
# persiste ahí, las siguientes ejecuciones ya no pasan por aquí para esa
# noticia. -----------------------------------------------------------------

class IdentidadLegacyAmbiguaError(Exception):
    """Se lanza cuando dos antecedentes legacy para la misma clave (una
    source_identity al comparar noticias.json contra noticias-archivo.json,
    o una URL canonicalizada al comparar dos entradas DENTRO del mismo
    fichero) son incompatibles entre sí (id o pagina distintos). No hay
    forma segura de elegir uno de los dos sin arriesgar publicar bajo una
    identidad equivocada -- y generar una tercera identidad nueva
    empeoraría el problema (una variante más de la misma URL, no una
    fusión). El llamador debe registrar el conflicto y NO publicar/indexar
    esa entrada automáticamente hasta resolverlo por otra vía."""

    def __init__(self, clave: str, candidato_a: dict, origen_a: str, candidato_b: dict, origen_b: str):
        self.clave = clave
        self.candidato_a = candidato_a
        self.origen_a = origen_a
        self.candidato_b = candidato_b
        self.origen_b = origen_b
        super().__init__(
            f"Antecedentes incompatibles para {clave!r}: "
            f"{origen_a}={candidato_a!r} vs {origen_b}={candidato_b!r}"
        )


class IdentidadLegacyInvalidaError(Exception):
    """Se lanza cuando un antecedente legacy (de data/noticias.json o
    data/noticias-archivo.json) no tiene un 'id' válido.
    cargar_identidad_legacy() ya filtra estos casos al construir su índice
    (líneas con "not noticia.get('id')"), así que en la práctica no debería
    llegar aquí -- pero resolver_identidad_noticia() no confía ciegamente en
    esa invariante externa: comparar dos candidatos sin id (ambos None,
    p. ej.) podría evaluarse como "compatibles" por accidente y producir
    después un KeyError en vez de un fallo claro."""

    def __init__(self, origen: str, candidato: dict):
        self.origen = origen
        self.candidato = candidato
        super().__init__(f"Antecedente legacy de {origen} sin 'id' válido: {candidato!r}")


def _validar_candidato_legacy(origen: str, candidato: dict[str, Any] | None) -> None:
    if candidato is not None and not candidato.get("id"):
        raise IdentidadLegacyInvalidaError(origen, candidato)


def cargar_identidad_legacy(json_file: Path) -> dict[str, dict[str, Any]]:
    """Indexa un fichero de noticias con la forma de data/noticias.json o
    data/noticias-archivo.json por URL de origen canonicalizada ->
    {id, pagina, fecha}. Nunca es la fuente de verdad continua -- solo
    permite heredar id/pagina/fecha de una publicación anterior a este
    registro. Nótese que el campo de fecha aquí se llama "fecha" (el nombre
    real en el esquema de noticia ya existente), distinto de
    "date_published" que usa el registro editorial nuevo (ver
    resolver_identidad_noticia) -- no es una inconsistencia, son dos
    esquemas distintos.

    Distingue explícitamente "esta URL no tiene antecedente" (no aparece en
    el dict devuelto) de "esta URL tiene un antecedente pero está corrupto o
    es ambiguo" -- lo segundo NUNCA se convierte en silencio en "no hay
    antecedente", porque resolver_identidad_noticia() interpretaría eso como
    noticia genuinamente nueva y generaría un id/URL adicional para un
    artículo que ya tenía uno:

    - URL con entrada pero sin "id" -> IdentidadLegacyInvalidaError (no se
      descarta con un simple `continue`).
    - Entrada CON "id" pero cuya URL no puede canonicalizarse (URL
      malformada/no resoluble) -> IdentidadLegacyInvalidaError también: hay
      una identidad asignada previamente que no podemos indexar, así que no
      podemos garantizar que "no aparece en el índice" signifique "no tiene
      antecedente". (Si tampoco tiene "id", no hay ninguna identidad previa
      que preservar y ninguna clave por la que localizarla más adelante --
      ahí sí se descarta, es genuinamente no indexable.)
    - Dos entradas DEL MISMO fichero con la misma URL canonicalizada pero
      id/pagina distintos -> IdentidadLegacyAmbiguaError (no gana la última
      leída). Si coinciden exactamente, se tratan como el mismo antecedente
      sin error.
    - Fichero ausente (FileNotFoundError) -> {} es legítimo, es un
      histórico opcional que simplemente no existe todavía.
    - Fichero presente pero con JSON inválido o con una forma inesperada
      (no es una lista) -> NUNCA se trata como histórico vacío (equivaldría
      a fingir que no hay antecedentes y arriesgar generar ids nuevos para
      noticias que ya tenían uno) -- se propaga como RegistroEditorialError
      explícito."""
    try:
        contenido = json_file.read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}

    try:
        datos = json.loads(contenido)
    except json.JSONDecodeError as exc:
        raise RegistroEditorialError(
            f"{json_file} existe pero contiene JSON inválido -- no se puede "
            f"usar como puente de identidad legacy sin arriesgar generar ids "
            f"nuevos para noticias que ya tenían uno: {exc}"
        ) from exc
    if not isinstance(datos, list):
        raise RegistroEditorialError(
            f"{json_file} existe pero no contiene una lista de noticias "
            f"(tipo real: {type(datos).__name__}) -- no se puede usar como "
            "puente de identidad legacy."
        )

    resultado: dict[str, dict[str, Any]] = {}
    for noticia in datos:
        if not isinstance(noticia, dict):
            continue
        url = noticia.get("enlace") or noticia.get("url") or ""
        if not url:
            continue

        try:
            clave = canonicalizar_url(url)
        except ValueError as exc:
            if noticia.get("id"):
                raise IdentidadLegacyInvalidaError(str(json_file), noticia) from exc
            continue

        if not noticia.get("id"):
            raise IdentidadLegacyInvalidaError(str(json_file), noticia)

        candidato = {
            "id": noticia["id"],
            "pagina": noticia.get("pagina"),
            "fecha": noticia.get("fecha"),
        }

        existente = resultado.get(clave)
        if existente is not None:
            compatibles = (
                existente["id"] == candidato["id"]
                and existente.get("pagina") == candidato.get("pagina")
            )
            if not compatibles:
                raise IdentidadLegacyAmbiguaError(
                    clave, existente, str(json_file), candidato, str(json_file)
                )
            continue

        resultado[clave] = candidato
    return resultado


def resolver_identidad_noticia(
    entrada_previa: dict[str, Any] | None,
    legado_activas: dict[str, Any] | None,
    legado_archivo: dict[str, Any] | None,
    source_identity: str,
    titulo_original: str,
    generar_id,
) -> tuple[str, str | None, str | None]:
    """Devuelve (id, pagina_o_None, fecha_o_None) con esta prioridad exacta:

      1. entrada_previa (registro editorial, ya indexado por la NUEVA
         sourceIdentity) -- fuente de verdad si existe. Su campo de fecha es
         "date_published" (esquema propio del registro).
      2. legado_activas (data/noticias.json actual, por URL canonicalizada).
         Su campo de fecha es "fecha" (esquema de noticia existente).
      3. legado_archivo (data/noticias-archivo.json, por URL canonicalizada,
         mismo esquema que (2)).
      4. genuinamente nueva -- se genera un id nuevo con generar_id(...).

    Solo se hereda con match EXACTO de URL canonicalizada, nunca por
    similitud de título/Jaccard.

    Lanza IdentidadLegacyInvalidaError si legado_activas o legado_archivo
    existen pero no tienen un "id" válido -- se valida ANTES de comparar
    compatibilidad, para que dos candidatos igualmente inválidos (p. ej.
    ambos con id=None) nunca se traten como "compatibles" por accidente.

    Lanza IdentidadLegacyAmbiguaError si (2) y (3), ya validados, tienen
    match para la misma URL pero representan noticias incompatibles (id o
    página distintos) -- no se elige ninguna arbitrariamente ni se genera
    una tercera identidad.

    Lanza RegistroEditorialError si entrada_previa existe pero no tiene un
    "id" válido -- un hueco así en el registro es un problema de
    integridad que debe fallar de forma explícita, no un KeyError
    accidental ni una identidad parcial silenciosa."""
    if entrada_previa is not None:
        id_previo = entrada_previa.get("id")
        if not id_previo:
            raise RegistroEditorialError(
                f"Entrada del registro editorial para source_identity={source_identity!r} "
                f"no tiene un 'id' válido: {entrada_previa!r}"
            )
        return id_previo, entrada_previa.get("pagina"), entrada_previa.get("date_published")

    _validar_candidato_legacy("noticias.json", legado_activas)
    _validar_candidato_legacy("noticias-archivo.json", legado_archivo)

    if legado_activas and legado_archivo:
        compatibles = (
            legado_activas.get("id") == legado_archivo.get("id")
            and legado_activas.get("pagina") == legado_archivo.get("pagina")
        )
        if not compatibles:
            raise IdentidadLegacyAmbiguaError(
                source_identity, legado_activas, "noticias.json", legado_archivo, "noticias-archivo.json"
            )
        return legado_activas["id"], legado_activas.get("pagina"), legado_activas.get("fecha")

    if legado_activas:
        return legado_activas["id"], legado_activas.get("pagina"), legado_activas.get("fecha")

    if legado_archivo:
        return legado_archivo["id"], legado_archivo.get("pagina"), legado_archivo.get("fecha")

    return generar_id(source_identity, titulo_original), None, None
