"""
Prueba end-to-end controlada de la task #15 (registro editorial + cache IA +
slug write-once), contra el pipeline REAL (generar_noticias.obtener_noticias
-> generar_noticias_seguro.sanear_noticia/deduplicar_noticias ->
generar_noticias.guardar_noticias), con TODO el I/O redirigido a un
directorio temporal y OpenAI mockeado -- nunca toca data/noticias.json,
data/noticias-archivo.json, noticias/*.html ni el registro editorial reales.

Ejecutar con:
  python3 test_e2e_task15.py
"""
import json
import sys
import tempfile
import types
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import generar_noticias as gn  # noqa: E402
import generar_noticias_seguro as gns  # noqa: E402
import lib.editorial_registry as ereg  # noqa: E402
import lib.editorial_log as elog  # noqa: E402

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


TMP = Path(tempfile.mkdtemp(prefix="e2e-task15-"))
REGISTRO_FILE = TMP / "data" / "noticias-editorial.json"
OUTPUT_FILE = TMP / "data" / "noticias.json"

FUENTE = {
    "id": "fuente-e2e", "nombre": "Fuente E2E", "url": "https://fuente-e2e.example/feed/",
    "nivel_confianza": "A", "prioridad": 100, "activa": True, "filtro_geografico": False,
}

# --- noticia A: recorre RUN1-4 (nueva -> cache hit -> content changed -> prompt_version) ---
URL_A = "https://fuente-e2e.example/noticia-a"
GUID_A = "guid-noticia-a"
TITULO_A = "El Ayuntamiento aprueba nuevas ayudas para asociaciones locales"
TEXTO_A_V1 = "El pleno municipal aprobó ayer un paquete de ayudas económicas para doce asociaciones vecinales de Alhaurín el Grande, con una dotación total de 45.000 euros."
TEXTO_A_V2 = TEXTO_A_V1 + " Además, el plazo de solicitud se ampliará hasta finales del próximo mes según fuentes municipales."

# --- noticia B: RUN5-6 (fallo real de IA -> backoff) ---
URL_B = "https://fuente-e2e.example/noticia-b"
GUID_B = "guid-noticia-b"
TITULO_B = "La Junta de Andalucía licita las obras de mejora del polideportivo municipal"
TEXTO_B = "La Junta ha sacado a concurso público las obras de renovación de las instalaciones deportivas municipales, con un presupuesto de 200.000 euros y un plazo de ejecución de seis meses."

# --- noticia C: candidata rechazada, en TODAS las ejecuciones ---
URL_C = "https://fuente-e2e.example/noticia-c"
GUID_C = "guid-noticia-c"
TITULO_C = "Sin embargo"  # inicio sospechoso + sin entidad + muy corto -> falla evaluar_titulo(), sin rescate viable
TEXTO_C = "Breve."  # cuerpo/descripcion demasiado cortos para noticia_publicable() incluso si hubiera rescate


def entry(id_, link, title, summary):
    return {"id": id_, "title": title, "link": link, "summary": summary}


def fake_feed(entries):
    return types.SimpleNamespace(entries=entries, feed=types.SimpleNamespace(image=None))


def fake_openai_module(client_factory):
    modulo = types.ModuleType("openai")
    modulo.OpenAI = client_factory
    return modulo


def response_ok(titulo, descripcion, cuerpo, categoria="Municipal"):
    payload = json.dumps({
        "titulo": titulo, "descripcion": descripcion, "cuerpo": cuerpo,
        "categoria": categoria, "seo_keywords": ["local"],
    })
    resp = MagicMock()
    resp.output_text = payload
    return resp


# Respuesta fija para la candidata C en TODAS las ejecuciones: título
# inrecuperable ("Sin embargo" -- conector de inicio sospechoso, sin
# entidad, demasiado corto) y sin rescate posible (descripcion/cuerpo
# también demasiado cortos para servir de candidato de rescate) -- debe
# ser descartada por sanear_noticia() pase lo que pase con A/B en ese run.
RESPUESTA_C = response_ok("Sin embargo", "Breve.", "Breve.", categoria="Actualidad")


def make_client(respuestas_por_marca):
    """Cliente OpenAI simulado cuyo comportamiento depende de qué título
    original aparece en el prompt (cada noticia lleva un título distinto y
    único como marca), en vez de una única respuesta compartida por todas
    las llamadas -- así cada noticia del feed recibe la respuesta que le
    corresponde a SU propio contenido, no la de otra entrada del mismo run."""
    client = MagicMock()

    def _create(**kwargs):
        prompt = kwargs.get("input", "")
        for marca, resultado in respuestas_por_marca.items():
            if marca in prompt:
                if isinstance(resultado, BaseException):
                    raise resultado
                return resultado
        raise AssertionError(f"Prompt sin marca conocida en el mock: {prompt[:300]!r}")

    client.responses.create.side_effect = _create
    return client


def llamadas_para(client_mock, marca):
    return sum(1 for c in client_mock.responses.create.call_args_list if marca in c.kwargs.get("input", ""))


def ejecutar_pipeline(feed_entries, openai_client_mock=None, prompt_version=None):
    """Orquesta el pipeline real: obtener_noticias() -> sanear_noticia()/
    deduplicar_noticias() (generar_noticias_seguro, sin mockear) ->
    guardar_noticias(). Devuelve (noticias_finales, todas_las_candidatas)."""
    with ExitStack() as stack:
        stack.enter_context(patch.object(gn, "BASE_DIR", TMP))
        stack.enter_context(patch.object(gn, "NOTICIAS_DIR", TMP / "noticias"))
        stack.enter_context(patch.object(gn, "CATEGORIAS_DIR", TMP / "categoria"))
        stack.enter_context(patch.object(gn, "OUTPUT_FILE", OUTPUT_FILE))
        stack.enter_context(patch.object(gn, "FUENTES_FILE", TMP / "data" / "fuentes.json"))
        stack.enter_context(patch.object(gn, "cargar_fuentes", return_value=[FUENTE]))
        stack.enter_context(patch.object(gn, "leer_feed", return_value=fake_feed(feed_entries)))
        stack.enter_context(patch.object(gn, "ia_activada", return_value=True))
        stack.enter_context(patch.object(ereg, "REGISTRO_FILE", REGISTRO_FILE))
        stack.enter_context(patch.object(elog, "LOG_DIR", TMP / "reports"))
        if prompt_version is not None:
            stack.enter_context(patch.object(gn, "PROMPT_VERSION", prompt_version))
            stack.enter_context(patch.object(ereg, "PROMPT_VERSION", prompt_version))
        if openai_client_mock is not None:
            stack.enter_context(patch.dict(sys.modules, {"openai": fake_openai_module(lambda: openai_client_mock)}))

        noticias, bookkeeping = gn.obtener_noticias()
        saneadas = [s for s in (gns.sanear_noticia(n) for n in noticias) if s]
        finales = gns.deduplicar_noticias(saneadas)
        gn.guardar_noticias(finales, bookkeeping)
        return finales, noticias


def leer_registro():
    if not REGISTRO_FILE.exists():
        return {}
    return json.loads(REGISTRO_FILE.read_text(encoding="utf-8"))


def leer_output():
    return json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))


def buscar_por_url(noticias, url):
    for n in noticias:
        if n.get("url") == url or n.get("enlace") == url:
            return n
    return None


print("========== RUN 1: noticia A nueva, IA llamada una vez ==========")
client_1 = make_client({
    TITULO_A: response_ok(
        "El Ayuntamiento aprueba ayudas para asociaciones vecinales",
        "El pleno aprobó un paquete de 45.000 euros para doce asociaciones de Alhaurín el Grande.",
        "El pleno municipal aprobó el paquete de ayudas económicas para el próximo curso. Las asociaciones podrán solicitar la subvención en las próximas semanas. El plazo de justificación se extenderá hasta final de año.",
    ),
    TITULO_C: RESPUESTA_C,
})
finales_1, _ = ejecutar_pipeline(
    [entry(GUID_A, URL_A, TITULO_A, TEXTO_A_V1), entry(GUID_C, URL_C, TITULO_C, TEXTO_C)],
    openai_client_mock=client_1,
)
check("1 llamada real a OpenAI para A", llamadas_para(client_1, TITULO_A) == 1, llamadas_para(client_1, TITULO_A))
noticia_a_1 = buscar_por_url(finales_1, URL_A)
check("noticia A publicada", noticia_a_1 is not None)
check("noticia C (rechazada) NO aparece publicada", buscar_por_url(finales_1, URL_C) is None)

registro_1 = leer_registro()
check("registro tiene 1 entrada (solo A, no C)", len(registro_1) == 1, list(registro_1.keys()))
entrada_a = next(iter(registro_1.values()))
check("ia_exitosa=True", entrada_a["ia_exitosa"] is True)
check("id/pagina/date_published presentes", bool(entrada_a["id"]) and bool(entrada_a["pagina"]) and bool(entrada_a["date_published"]))
check("candidata C no crea entrada en el registro", not any(v["source_url"] == URL_C for v in registro_1.values()))

ID_A = noticia_a_1["id"]
PAGINA_A = noticia_a_1["pagina"]
DATE_PUBLISHED_A = entrada_a["date_published"]
DATE_MODIFIED_A_1 = entrada_a["date_modified"]

print()
print("========== RUN 2: entrada IDÉNTICA -> CACHE_HIT, 0 llamadas IA ==========")
client_2 = make_client({TITULO_C: RESPUESTA_C})  # A no debería llamar en absoluto (CACHE_HIT)
finales_2, _ = ejecutar_pipeline(
    [entry(GUID_A, URL_A, TITULO_A, TEXTO_A_V1), entry(GUID_C, URL_C, TITULO_C, TEXTO_C)],
    openai_client_mock=client_2,
)
check("0 llamadas a OpenAI para A (CACHE_HIT)", llamadas_para(client_2, TITULO_A) == 0, llamadas_para(client_2, TITULO_A))
noticia_a_2 = buscar_por_url(finales_2, URL_A)
check("mismo id", noticia_a_2["id"] == ID_A, noticia_a_2["id"])
check("misma pagina", noticia_a_2["pagina"] == PAGINA_A, noticia_a_2["pagina"])

registro_2 = leer_registro()
entrada_a_2 = registro_2[[k for k in registro_2 if registro_2[k]["id"] == ID_A][0]]
check("mismo date_published", entrada_a_2["date_published"] == DATE_PUBLISHED_A)
check("date_modified NO cambia", entrada_a_2["date_modified"] == DATE_MODIFIED_A_1, entrada_a_2["date_modified"])

print()
print("========== RUN 3: misma source_identity, CONTENIDO cambiado -> cache miss por content_hash ==========")
client_3 = make_client({
    TITULO_A: response_ok(
        "El Ayuntamiento amplía el plazo de ayudas para asociaciones",
        "El Ayuntamiento amplía hasta finales de mes el plazo para solicitar las ayudas a asociaciones.",
        "El pleno municipal amplió el plazo de solicitud de las ayudas económicas tras varias peticiones vecinales. Las asociaciones dispondrán de más tiempo para presentar su documentación. La medida busca facilitar el acceso a la convocatoria.",
    ),
    TITULO_C: RESPUESTA_C,
})
finales_3, _ = ejecutar_pipeline(
    [entry(GUID_A, URL_A, TITULO_A, TEXTO_A_V2), entry(GUID_C, URL_C, TITULO_C, TEXTO_C)],
    openai_client_mock=client_3,
)
check("1 llamada real a OpenAI para A (contenido cambió)", llamadas_para(client_3, TITULO_A) == 1, llamadas_para(client_3, TITULO_A))
noticia_a_3 = buscar_por_url(finales_3, URL_A)
check("mismo id", noticia_a_3["id"] == ID_A)
check("misma pagina", noticia_a_3["pagina"] == PAGINA_A)

registro_3 = leer_registro()
entrada_a_3 = registro_3[[k for k in registro_3 if registro_3[k]["id"] == ID_A][0]]
check("mismo date_published", entrada_a_3["date_published"] == DATE_PUBLISHED_A)
check("date_modified SÍ cambia (el payload público final cambió)", entrada_a_3["date_modified"] != DATE_MODIFIED_A_1, entrada_a_3["date_modified"])
DATE_MODIFIED_A_3 = entrada_a_3["date_modified"]
CONTENT_HASH_A_3 = entrada_a_3["content_hash"]

print()
print("========== RUN 4: mismo contenido que RUN3, PROMPT_VERSION distinto -> reprocesa IA ==========")
client_4 = make_client({
    TITULO_A: response_ok(
        "El Ayuntamiento amplía el plazo de ayudas para asociaciones",
        "El Ayuntamiento amplía hasta finales de mes el plazo para solicitar las ayudas a asociaciones.",
        "El pleno municipal amplió el plazo de solicitud de las ayudas económicas tras varias peticiones vecinales. Las asociaciones dispondrán de más tiempo para presentar su documentación. La medida busca facilitar el acceso a la convocatoria.",
    ),
    TITULO_C: RESPUESTA_C,
})
finales_4, _ = ejecutar_pipeline(
    [entry(GUID_A, URL_A, TITULO_A, TEXTO_A_V2), entry(GUID_C, URL_C, TITULO_C, TEXTO_C)],
    openai_client_mock=client_4,
    prompt_version="TEST-PROMPT-v2",
)
check("1 llamada real a OpenAI para A (prompt_version cambió)", llamadas_para(client_4, TITULO_A) == 1, llamadas_para(client_4, TITULO_A))
noticia_a_4 = buscar_por_url(finales_4, URL_A)
check("mismo id", noticia_a_4["id"] == ID_A)
check("misma pagina", noticia_a_4["pagina"] == PAGINA_A)

registro_4 = leer_registro()
entrada_a_4 = registro_4[[k for k in registro_4 if registro_4[k]["id"] == ID_A][0]]
check("mismo date_published", entrada_a_4["date_published"] == DATE_PUBLISHED_A)
check("content_hash sin cambios (mismo contenido que RUN3)", entrada_a_4["content_hash"] == CONTENT_HASH_A_3)
check("prompt_version actualizado", entrada_a_4["prompt_version"] == "TEST-PROMPT-v2")

print()
print("========== RUN 5: noticia B nueva, fallo REAL de IA -> fallback publicable ==========")
client_5 = make_client({
    TITULO_B: RuntimeError("fallo simulado de red/OpenAI"),
    TITULO_C: RESPUESTA_C,
})
finales_5, _ = ejecutar_pipeline(
    [entry(GUID_B, URL_B, TITULO_B, TEXTO_B), entry(GUID_C, URL_C, TITULO_C, TEXTO_C)],
    openai_client_mock=client_5,
    prompt_version="TEST-PROMPT-v2",
)
check("1 intento real a OpenAI para B (fallido)", llamadas_para(client_5, TITULO_B) == 1, llamadas_para(client_5, TITULO_B))
noticia_b_5 = buscar_por_url(finales_5, URL_B)
check("noticia B publicada vía fallback (supera quality gate)", noticia_b_5 is not None)

registro_5 = leer_registro()
entrada_b_5 = registro_5[[k for k in registro_5 if registro_5[k]["source_url"] == URL_B][0]]
check("ia_exitosa=False", entrada_b_5["ia_exitosa"] is False)
check("ai_attempts incrementó a 1", entrada_b_5["ai_attempts"] == 1, entrada_b_5["ai_attempts"])
check("last_ai_attempt actualizado (no None)", entrada_b_5["last_ai_attempt"] is not None)
ID_B = noticia_b_5["id"]
PAGINA_B = noticia_b_5["pagina"]

print()
print("========== RUN 6: inmediato tras el fallo -> backoff, sin llamada IA, reutiliza fallback ==========")
client_6 = make_client({TITULO_C: RESPUESTA_C})  # B no debería llamar en absoluto (en backoff)
finales_6, _ = ejecutar_pipeline(
    [entry(GUID_B, URL_B, TITULO_B, TEXTO_B), entry(GUID_C, URL_C, TITULO_C, TEXTO_C)],
    openai_client_mock=client_6,
    prompt_version="TEST-PROMPT-v2",
)
check("0 llamadas a OpenAI para B (en backoff)", llamadas_para(client_6, TITULO_B) == 0, llamadas_para(client_6, TITULO_B))
noticia_b_6 = buscar_por_url(finales_6, URL_B)
check("noticia B sigue publicada (fallback persistido reutilizado)", noticia_b_6 is not None)
check("mismo id", noticia_b_6["id"] == ID_B)
check("misma pagina", noticia_b_6["pagina"] == PAGINA_B)
check("mismo titulo que el fallback de RUN5 (reutilizado, no regenerado)", noticia_b_6["titulo"] == noticia_b_5["titulo"], (noticia_b_6["titulo"], noticia_b_5["titulo"]))

registro_6 = leer_registro()
entrada_b_6 = registro_6[[k for k in registro_6 if registro_6[k]["source_url"] == URL_B][0]]
check("ai_attempts NO incrementa en backoff (sigue en 1)", entrada_b_6["ai_attempts"] == 1, entrada_b_6["ai_attempts"])

print()
print("========== Verificaciones finales de contrato ==========")
output_final = leer_output()
check("candidata C nunca apareció en ninguna ejecución (data/noticias.json final)", buscar_por_url(output_final, URL_C) is None)
registro_final = leer_registro()
check("candidata C nunca entró en el registro editorial", not any(v.get("source_url") == URL_C for v in registro_final.values()))
check("solo 2 entradas en el registro (A y B, nunca C)", len(registro_final) == 2, list(registro_final.keys()))

CAMPOS_INTERNOS = {
    "ia_exitosa", "ia_intentada", "content_hash", "source_identity", "ai_attempts",
    "last_ai_attempt", "editorial_previo", "date_modified_previa", "pagina_previa", "motivo_cache",
}
claves_presentes = set()
for n in output_final:
    claves_presentes |= set(n.keys())
fuga = CAMPOS_INTERNOS & claves_presentes
check("ningún campo interno de bookkeeping aparece en data/noticias.json", not fuga, fuga)

print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los escenarios end-to-end pasaron")
print(f"(directorio temporal usado: {TMP})")
