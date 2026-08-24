"""
Tests de obtener_noticias() contra el modulo REAL scripts/generar_noticias.py,
con cargar_fuentes()/leer_feed()/cargar_registro()/cargar_identidad_legacy()
mockeados -- NO hace red, NO llama a OpenAI (ia_activada() mockeado a False).
Ejecutar con:
  python3 test_obtener_noticias.py
"""
import sys
import types
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import generar_noticias as gn  # noqa: E402
from lib.editorial_registry import (  # noqa: E402
    PROMPT_VERSION,
    canonicalizar_url,
    IdentidadDuplicadaEnEjecucionError,
    IdentidadLegacyAmbiguaError,
)

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


FUENTE = {
    "id": "fuente-test", "nombre": "Fuente Test", "url": "https://fuente-test.example/feed/",
    "nivel_confianza": "A", "prioridad": 100, "activa": True, "filtro_geografico": False,
}


def fake_feed(entries):
    return types.SimpleNamespace(entries=entries, feed=types.SimpleNamespace(image=None))


def entry(id_=None, link="", title="Titulo de prueba", summary="Texto de prueba suficientemente largo para el resumen."):
    e = {"title": title, "link": link, "summary": summary}
    if id_ is not None:
        e["id"] = id_
    return e


def contexto_base(registro=None, legado_activas=None, legado_archivo=None):
    """Aplica los patches comunes a todos los tests: sin red, sin IA, con
    registro/puente legacy controlados."""
    return [
        patch.object(gn, "cargar_fuentes", return_value=[FUENTE]),
        patch.object(gn, "ia_activada", return_value=False),
        patch.object(gn, "cargar_registro", return_value=registro or {}),
        patch.object(gn, "cargar_identidad_legacy", side_effect=lambda ruta: (
            (legado_activas or {}) if "noticias-archivo" not in str(ruta) else (legado_archivo or {})
        )),
    ]


def ejecutar_con(feed_entries, **kwargs):
    patches = contexto_base(**kwargs)
    with patches[0], patches[1], patches[2], patches[3], \
         patch.object(gn, "leer_feed", return_value=fake_feed(feed_entries)):
        return gn.obtener_noticias()


print("=== 1. IdentidadLegacyAmbiguaError se propaga (no se captura, aborta) ===")
url_ambigua = "https://fuente-test.example/articulo-ambiguo"
clave_ambigua = canonicalizar_url(url_ambigua)
legado_activas_conflicto = {clave_ambigua: {"id": "A", "pagina": "noticias/a.html", "fecha": "2026-08-01T00:00:00+00:00"}}
legado_archivo_conflicto = {clave_ambigua: {"id": "B-DISTINTO", "pagina": "noticias/b.html", "fecha": "2026-05-01T00:00:00+00:00"}}
try:
    ejecutar_con(
        [entry(link=url_ambigua)],
        legado_activas=legado_activas_conflicto,
        legado_archivo=legado_archivo_conflicto,
    )
    check("propaga IdentidadLegacyAmbiguaError", False, "no lanzó nada")
except IdentidadLegacyAmbiguaError:
    check("propaga IdentidadLegacyAmbiguaError", True)

print()
print("=== 2 y 3. reset de retry state + date_modified_previa/editorial_previo transportados en crudo ===")
entrada_previa_content_changed = {
    "id": "id-existente", "source_url": "https://fuente-test.example/articulo-2",
    "content_hash": "hash-CONTENIDO-VIEJO", "prompt_version": PROMPT_VERSION,
    "ia_exitosa": False, "ai_attempts": 4, "last_ai_attempt": "2026-08-01T00:00:00+00:00",
    "editorial": {"titulo": "Titulo viejo", "descripcion": "Desc vieja", "cuerpo": "Cuerpo viejo. Cuerpo viejo. Cuerpo viejo.", "categoria": "Municipal", "seo_keywords": []},
    "pagina": "noticias/titulo-viejo.html",
    "date_published": "2026-07-01T00:00:00+00:00", "date_modified": "2026-07-15T00:00:00+00:00",
}
# generar_source_identity con esta URL (sin guid en la entrada -> cae a URL
# canonicalizada) debe coincidir con la clave del registro para que
# entrada_previa se encuentre -- construimos la clave real con la misma
# función para no adivinar el formato.
from lib.editorial_registry import generar_source_identity  # noqa: E402
url_2 = "https://fuente-test.example/articulo-2"
source_identity_2 = generar_source_identity(entry_id=None, url=url_2, source_key=FUENTE["id"])
registro_2 = {source_identity_2: entrada_previa_content_changed}

noticias2, bookkeeping2 = ejecutar_con(
    [entry(link=url_2, title="Titulo NUEVO muy distinto", summary="Texto nuevo completamente distinto del anterior, contenido cambiado de verdad.")],
    registro=registro_2,
)
check("se generó exactamente 1 noticia", len(noticias2) == 1, len(noticias2))
meta2 = bookkeeping2[noticias2[0]["id"]]
check("motivo_cache = CACHE_MISS_CONTENT_CHANGED", meta2["motivo_cache"] == "CACHE_MISS_CONTENT_CHANGED", meta2["motivo_cache"])
check("ai_attempts se reinicia a 0 (clave de caché distinta, sin intento real)", meta2["ai_attempts"] == 0, meta2["ai_attempts"])
check("last_ai_attempt se reinicia a None (sin intento real)", meta2["last_ai_attempt"] is None, meta2["last_ai_attempt"])
check("date_modified_previa transporta el valor anterior SIN recalcular", meta2["date_modified_previa"] == "2026-07-15T00:00:00+00:00", meta2["date_modified_previa"])
check("editorial_previo transporta el payload cacheado anterior tal cual", meta2["editorial_previo"] == entrada_previa_content_changed["editorial"], meta2["editorial_previo"])

print()
print("=== 2b. AI_NOT_SUCCESSFUL SÍ conserva la racha cuando la clave de caché no cambió ===")
entrada_previa_mismo_hash = dict(entrada_previa_content_changed)
url_2b = "https://fuente-test.example/articulo-2b"
source_identity_2b = generar_source_identity(entry_id=None, url=url_2b, source_key=FUENTE["id"])
titulo_2b = "Titulo estable para hash"
texto_2b = "Texto estable para hash, no cambia entre ejecuciones de prueba."
content_hash_real = gn.calcular_content_hash(titulo_2b, texto_2b)
entrada_previa_mismo_hash["content_hash"] = content_hash_real
registro_2b = {source_identity_2b: entrada_previa_mismo_hash}

noticias2b, bookkeeping2b = ejecutar_con(
    [entry(link=url_2b, title=titulo_2b, summary=texto_2b)],
    registro=registro_2b,
)
meta2b = bookkeeping2b[noticias2b[0]["id"]]
check("motivo_cache = CACHE_MISS_AI_NOT_SUCCESSFUL", meta2b["motivo_cache"] == "CACHE_MISS_AI_NOT_SUCCESSFUL", meta2b["motivo_cache"])
check("ai_attempts CONSERVA la racha anterior (misma clave de caché)", meta2b["ai_attempts"] == 4, meta2b["ai_attempts"])
check("last_ai_attempt CONSERVA el valor anterior (sin intento real)", meta2b["last_ai_attempt"] == "2026-08-01T00:00:00+00:00", meta2b["last_ai_attempt"])

print()
print("=== 3b. noticia genuinamente nueva -> editorial_previo=None, date_modified_previa=None ===")
noticias3, bookkeeping3 = ejecutar_con([entry(link="https://fuente-test.example/articulo-nuevo")])
meta3 = bookkeeping3[noticias3[0]["id"]]
check("editorial_previo=None para noticia nueva", meta3["editorial_previo"] is None, meta3["editorial_previo"])
check("date_modified_previa=None para noticia nueva", meta3["date_modified_previa"] is None, meta3["date_modified_previa"])

print()
print("=== 4a. mismo source_identity + mismo content_hash dentro del run -> se ignora el duplicado ===")
titulo_dup = "Mismo titulo exacto"
texto_dup = "Mismo texto exacto, sin cambios entre las dos apariciones del feed."
noticias4a, bookkeeping4a = ejecutar_con([
    entry(id_="guid-compartido", link="https://fuente-test.example/version-a", title=titulo_dup, summary=texto_dup),
    entry(id_="guid-compartido", link="https://fuente-test.example/version-b", title=titulo_dup, summary=texto_dup),
])
check("solo 1 noticia (la segunda aparición se ignora)", len(noticias4a) == 1, len(noticias4a))
check("bookkeeping también tiene solo 1 entrada", len(bookkeeping4a) == 1, len(bookkeeping4a))

print()
print("=== 4b. mismo source_identity + content_hash DISTINTO dentro del run -> IdentidadDuplicadaEnEjecucionError ===")
try:
    ejecutar_con([
        entry(id_="guid-compartido-2", link="https://fuente-test.example/version-a2", title="Titulo A", summary="Texto A, distinto del B."),
        entry(id_="guid-compartido-2", link="https://fuente-test.example/version-b2", title="Titulo B", summary="Texto B, distinto del A."),
    ])
    check("lanza IdentidadDuplicadaEnEjecucionError", False, "no lanzó nada")
except IdentidadDuplicadaEnEjecucionError:
    check("lanza IdentidadDuplicadaEnEjecucionError", True)

print()
print("=== contrato: len(noticias) == len(bookkeeping_por_id) y mismos ids, en un caso normal con varias entradas ===")
noticias5, bookkeeping5 = ejecutar_con([
    entry(link="https://fuente-test.example/multi-1", title="Titulo Multi 1", summary="Texto multi 1 con contenido suficiente."),
    entry(link="https://fuente-test.example/multi-2", title="Titulo Multi 2", summary="Texto multi 2 con contenido suficiente."),
    entry(link="https://fuente-test.example/multi-3", title="Titulo Multi 3", summary="Texto multi 3 con contenido suficiente."),
])
check("len(noticias) == len(bookkeeping)", len(noticias5) == len(bookkeeping5) == 3, (len(noticias5), len(bookkeeping5)))
check("mismos ids en ambos", {n["id"] for n in noticias5} == set(bookkeeping5.keys()))

print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
