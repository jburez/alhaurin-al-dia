import json
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import lib.editorial_log as elog  # noqa: E402

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


CACHE_HIT = "CACHE_HIT"
CACHE_MISS_NEW = "CACHE_MISS_NEW"
CACHE_MISS_CONTENT_CHANGED = "CACHE_MISS_CONTENT_CHANGED"
CACHE_MISS_PROMPT_VERSION = "CACHE_MISS_PROMPT_VERSION"
CACHE_MISS_AI_NOT_SUCCESSFUL = "CACHE_MISS_AI_NOT_SUCCESSFUL"

print("=== derivar_action(): tabla de verdad completa (cada combinación -> una única action) ===")
CASOS = [
    # (cache_status, source_content_changed, ai_called, public_content_changed) -> esperado
    (CACHE_MISS_NEW, False, False, False, elog.NEW_SOURCE),
    (CACHE_MISS_NEW, False, True, True, elog.NEW_SOURCE),  # NEW_SOURCE gana pase lo que pase
    (CACHE_HIT, False, False, False, elog.UNCHANGED),
    (CACHE_MISS_CONTENT_CHANGED, True, True, True, elog.SOURCE_CHANGED_PUBLIC_CHANGED),
    (CACHE_MISS_CONTENT_CHANGED, True, True, False, elog.SOURCE_CHANGED_PUBLIC_UNCHANGED),
    (CACHE_MISS_CONTENT_CHANGED, True, False, False, elog.SOURCE_CHANGED_PUBLIC_UNCHANGED),  # ia desactivada, sigue siendo source_changed
    (CACHE_MISS_PROMPT_VERSION, False, True, True, elog.REPROCESSED_PUBLIC_CHANGED),
    (CACHE_MISS_PROMPT_VERSION, False, True, False, elog.REPROCESSED_PUBLIC_UNCHANGED),
    (CACHE_MISS_PROMPT_VERSION, False, False, False, elog.REPROCESSED_PUBLIC_UNCHANGED),  # ia desactivada, sigue contando como reprocesado
    (CACHE_MISS_AI_NOT_SUCCESSFUL, False, True, True, elog.REPROCESSED_PUBLIC_CHANGED),
    (CACHE_MISS_AI_NOT_SUCCESSFUL, False, True, False, elog.REPROCESSED_PUBLIC_UNCHANGED),
    (CACHE_MISS_AI_NOT_SUCCESSFUL, False, False, False, elog.PENDING_AI_RETRY),
]
for cache_status, scc, ai_called, pcc, esperado in CASOS:
    resultado = elog.derivar_action(cache_status, scc, ai_called, pcc)
    check(
        f"cache_status={cache_status} scc={scc} ai_called={ai_called} pcc={pcc} -> {esperado}",
        resultado == esperado, resultado,
    )

print()
print("=== Casos específicamente pedidos ===")
check("CACHE_MISS_PROMPT_VERSION + mismo payload -> REPROCESSED_PUBLIC_UNCHANGED",
      elog.derivar_action(CACHE_MISS_PROMPT_VERSION, False, True, False) == elog.REPROCESSED_PUBLIC_UNCHANGED)
check("CACHE_MISS_PROMPT_VERSION + payload distinto -> REPROCESSED_PUBLIC_CHANGED",
      elog.derivar_action(CACHE_MISS_PROMPT_VERSION, False, True, True) == elog.REPROCESSED_PUBLIC_CHANGED)
check("retry/backoff con ai_called=False -> PENDING_AI_RETRY",
      elog.derivar_action(CACHE_MISS_AI_NOT_SUCCESSFUL, False, False, False) == elog.PENDING_AI_RETRY)
check("retry/backoff con ai_called=True -> REPROCESSED_PUBLIC_* (no PENDING_AI_RETRY)",
      elog.derivar_action(CACHE_MISS_AI_NOT_SUCCESSFUL, False, True, False) in (elog.REPROCESSED_PUBLIC_CHANGED, elog.REPROCESSED_PUBLIC_UNCHANGED))
check("source_content_changed=True pero public_content_changed=False -> SOURCE_CHANGED_PUBLIC_UNCHANGED",
      elog.derivar_action(CACHE_MISS_CONTENT_CHANGED, True, True, False) == elog.SOURCE_CHANGED_PUBLIC_UNCHANGED)

print()
print("=== construir_evento(): source_content_changed se calcula, no se recibe ===")
ts = datetime(2026, 8, 20, tzinfo=timezone.utc).isoformat()

evento_mismo_hash = elog.construir_evento(
    source_identity="guid:a:1", id_="id-1", pagina="noticias/a.html",
    previous_content_hash="hashA", current_content_hash="hashA",
    cache_status=CACHE_HIT, ai_called=False, ai_success=True, public_content_changed=False,
    previous_date_modified=None, resulting_date_modified=None, timestamp=ts,
)
check("misma source + mismo hash -> source_content_changed=False", evento_mismo_hash["source_content_changed"] is False)
check("misma source + mismo hash -> action=UNCHANGED", evento_mismo_hash["action"] == elog.UNCHANGED, evento_mismo_hash["action"])
check("sin cuerpo/titulo/descripcion en el evento", set(evento_mismo_hash.keys()) & {"titulo", "cuerpo", "descripcion"} == set())

evento_hash_distinto = elog.construir_evento(
    source_identity="guid:a:1", id_="id-1", pagina="noticias/a.html",
    previous_content_hash="hashA", current_content_hash="hashB",
    cache_status=CACHE_MISS_CONTENT_CHANGED, ai_called=True, ai_success=True, public_content_changed=True,
    previous_date_modified=None, resulting_date_modified="2026-08-20T00:00:00+00:00", timestamp=ts,
)
check("misma source + hash distinto -> source_content_changed=True", evento_hash_distinto["source_content_changed"] is True)
check("misma source + hash distinto -> action=SOURCE_CHANGED_PUBLIC_CHANGED", evento_hash_distinto["action"] == elog.SOURCE_CHANGED_PUBLIC_CHANGED)

evento_saneado_igual = elog.construir_evento(
    source_identity="guid:a:2", id_="id-2", pagina="noticias/b.html",
    previous_content_hash="hashA", current_content_hash="hashB",
    cache_status=CACHE_MISS_CONTENT_CHANGED, ai_called=True, ai_success=True, public_content_changed=False,
    previous_date_modified="2026-08-01T00:00:00+00:00", resulting_date_modified="2026-08-01T00:00:00+00:00", timestamp=ts,
)
check(
    "fuente cambia pero tras saneado el payload público es idéntico -> SOURCE_CHANGED_PUBLIC_UNCHANGED",
    evento_saneado_igual["action"] == elog.SOURCE_CHANGED_PUBLIC_UNCHANGED, evento_saneado_igual["action"],
)
check("dateModified NO cambia en ese caso", evento_saneado_igual["previous_date_modified"] == evento_saneado_igual["resulting_date_modified"])

evento_nuevo = elog.construir_evento(
    source_identity="guid:a:3", id_="id-3", pagina="noticias/c.html",
    previous_content_hash=None, current_content_hash="hashX",
    cache_status=CACHE_MISS_NEW, ai_called=True, ai_success=True, public_content_changed=True,
    previous_date_modified=None, resulting_date_modified=None, timestamp=ts,
)
check("noticia nueva -> source_content_changed=False (previous_content_hash=None)", evento_nuevo["source_content_changed"] is False)
check("noticia nueva -> action=NEW_SOURCE", evento_nuevo["action"] == elog.NEW_SOURCE)

print()
print("=== registrar_eventos(): I/O ===")
TMP = Path(tempfile.mkdtemp(prefix="test-editorial-log-"))


def evento(id_, **overrides):
    base = dict(
        source_identity=f"guid:x:{id_}", id_=id_, pagina=f"noticias/{id_}.html",
        previous_content_hash="h1", current_content_hash="h1",
        cache_status=CACHE_HIT, ai_called=False, ai_success=True, public_content_changed=False,
        previous_date_modified=None, resulting_date_modified=None, timestamp="2026-08-20T00:00:00+00:00",
    )
    base.update(overrides)
    return elog.construir_evento(**base)


with patch.object(elog, "LOG_DIR", TMP):
    ahora = datetime(2026, 8, 20, 10, 0, tzinfo=timezone.utc)
    elog.registrar_eventos([evento("e1"), evento("e2")], ahora=ahora)
    ruta_esperada = TMP / "editorial-pipeline-log-2026-08-20.jsonl"
    check("se crea el fichero del día", ruta_esperada.exists())
    lineas = ruta_esperada.read_text(encoding="utf-8").strip().split("\n")
    check("2 eventos -> 2 líneas", len(lineas) == 2, len(lineas))
    check("cada línea es JSON válido", all(json.loads(l) for l in lineas))

    # segunda ejecución idéntica: mismos eventos (salvo timestamp), append
    elog.registrar_eventos([evento("e1")], ahora=ahora)
    lineas2 = ruta_esperada.read_text(encoding="utf-8").strip().split("\n")
    check("segunda ejecución hace append (no sobrescribe)", len(lineas2) == 3, len(lineas2))

    # lista vacía -> no crea/escribe nada
    ruta_otro_dia = TMP / "editorial-pipeline-log-2026-08-21.jsonl"
    elog.registrar_eventos([], ahora=ahora + timedelta(days=1))
    check("lista de eventos vacía -> no crea fichero", not ruta_otro_dia.exists())

print()
print("=== registrar_eventos(): evento NO serializable -> no lanza (best-effort real) ===")
evento_malo = {"circular": None}
evento_malo["circular"] = evento_malo  # referencia circular, json.dumps lanzará ValueError
with patch.object(elog, "LOG_DIR", TMP):
    try:
        elog.registrar_eventos([evento_malo], ahora=ahora)
        check("no lanza con evento no serializable", True)
    except Exception as exc:
        check("no lanza con evento no serializable", False, repr(exc))

print()
print("=== registrar_eventos(): fallo al ESCRIBIR -> no lanza, y se intenta podar igual ===")
podar_llamado = []
with patch.object(elog, "LOG_DIR", TMP), \
     patch.object(Path, "open", side_effect=OSError("disco lleno (simulado)")), \
     patch.object(elog, "_podar_logs_antiguos", side_effect=lambda *a, **k: podar_llamado.append(True)):
    try:
        elog.registrar_eventos([evento("e3")], ahora=ahora)
        check("fallo al escribir -> no lanza", True)
    except Exception as exc:
        check("fallo al escribir -> no lanza", False, repr(exc))
    check("la poda se intenta igualmente aunque falle la escritura", podar_llamado == [True])

print()
print("=== registrar_eventos(): fallo al PODAR -> no lanza, no afecta a la escritura ya realizada ===")
TMP2 = Path(tempfile.mkdtemp(prefix="test-editorial-log-podar-"))
with patch.object(elog, "LOG_DIR", TMP2), patch.object(elog, "_podar_logs_antiguos", side_effect=OSError("fallo simulado de poda")):
    try:
        elog.registrar_eventos([evento("e4")], ahora=ahora)
        check("fallo al podar -> no lanza", True)
    except Exception as exc:
        check("fallo al podar -> no lanza", False, repr(exc))
    ruta_dia2 = TMP2 / "editorial-pipeline-log-2026-08-20.jsonl"
    check("la escritura SÍ se completó pese al fallo de poda", ruta_dia2.exists() and len(ruta_dia2.read_text(encoding="utf-8").strip().split("\n")) == 1)

print()
print("=== _podar_logs_antiguos(): retención real ===")
TMP3 = Path(tempfile.mkdtemp(prefix="test-editorial-log-retencion-"))
ahora3 = datetime(2026, 8, 20, tzinfo=timezone.utc)
(TMP3 / "editorial-pipeline-log-2026-08-19.jsonl").write_text('{"a":1}\n', encoding="utf-8")  # dentro de retención
(TMP3 / "editorial-pipeline-log-2026-07-01.jsonl").write_text('{"a":1}\n', encoding="utf-8")  # fuera (>30 días)
(TMP3 / "editorial-pipeline-log-otro-formato.jsonl").write_text('{"a":1}\n', encoding="utf-8")  # nombre no parseable, se ignora
with patch.object(elog, "LOG_DIR", TMP3):
    elog._podar_logs_antiguos(ahora3, 30)
check("fichero reciente se conserva", (TMP3 / "editorial-pipeline-log-2026-08-19.jsonl").exists())
check("fichero antiguo (>30 días) se borra", not (TMP3 / "editorial-pipeline-log-2026-07-01.jsonl").exists())
check("fichero con nombre no parseable no rompe la poda y se conserva", (TMP3 / "editorial-pipeline-log-otro-formato.jsonl").exists())

print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
