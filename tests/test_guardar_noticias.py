"""
Tests de guardar_noticias() contra el modulo REAL scripts/generar_noticias.py.
Escribe en un directorio temporal (patchea BASE_DIR/NOTICIAS_DIR/CATEGORIAS_DIR/
OUTPUT_FILE) para no tocar el repo real. Ejecutar con:
  python3 test_guardar_noticias.py
"""
import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import generar_noticias as gn  # noqa: E402
import lib.editorial_log as elog  # noqa: E402
from lib.editorial_registry import RegistroEditorialError, PROMPT_VERSION  # noqa: E402

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


def noticia(id_, titulo="Titulo", pagina="", categoria="Actualidad"):
    return {"id": id_, "titulo": titulo, "descripcion": "Descripcion suficientemente larga.",
            "cuerpo": "Cuerpo de prueba con contenido.", "fecha": "2026-08-20T00:00:00+00:00",
            "fuente": "Test", "categoria": categoria, "categoria_url": f"categoria/{categoria.lower()}/",
            "seo_keywords": [], "enlace": "https://x.example/a", "url": "https://x.example/a",
            "imagen": "", "prioridad": 100, "requiere_revision_geografica": False, "pagina": pagina}


def meta_base(source_identity, ia_exitosa=True, editorial_previo=None, date_modified_previa=None,
              content_hash_previo=None, ia_intentada=True, motivo_cache="CACHE_MISS_NEW"):
    return {
        "source_identity": source_identity, "content_hash": "hash-1", "content_hash_previo": content_hash_previo,
        "prompt_version": PROMPT_VERSION,
        "ia_exitosa": ia_exitosa, "ia_intentada": ia_intentada, "ai_attempts": 0, "last_ai_attempt": None,
        "date_published": "2026-08-20T00:00:00+00:00", "date_modified_previa": date_modified_previa,
        "editorial_previo": editorial_previo, "pagina_previa": None, "motivo_cache": motivo_cache,
    }


def con_tmp_dirs(tmp_dir):
    return [
        patch.object(gn, "BASE_DIR", tmp_dir),
        patch.object(gn, "NOTICIAS_DIR", tmp_dir / "noticias"),
        patch.object(gn, "CATEGORIAS_DIR", tmp_dir / "categoria"),
        patch.object(gn, "OUTPUT_FILE", tmp_dir / "data" / "noticias.json"),
        patch.object(elog, "LOG_DIR", tmp_dir / "reports"),
    ]


def con_registro_vacio(tmp_dir):
    return patch.object(gn, "REGISTRO_FILE_NO_EXISTE_PLACEHOLDER", create=True)  # no-op, ver nota abajo


print("=== 1. ids duplicados entre las noticias a publicar -> RegistroEditorialError ===")
tmp1 = Path(tempfile.mkdtemp())
noticias_dup_id = [noticia("id-X"), noticia("id-X")]
bookkeeping_dup_id = {"id-X": meta_base("guid:a:1")}
patches = con_tmp_dirs(tmp1)
with patches[0], patches[1], patches[2], patches[3], patches[4], \
     patch("lib.editorial_registry.REGISTRO_FILE", tmp1 / "data" / "noticias-editorial.json"):
    try:
        gn.guardar_noticias(noticias_dup_id, bookkeeping_dup_id)
        check("lanza RegistroEditorialError por id duplicado", False, "no lanzó nada")
    except RegistroEditorialError as exc:
        check("lanza RegistroEditorialError por id duplicado", True, str(exc))

print()
print("=== 2. dos ids distintos con la MISMA source_identity -> RegistroEditorialError ===")
tmp2 = Path(tempfile.mkdtemp())
noticias_dup_source = [noticia("id-A", pagina="noticias/a.html"), noticia("id-B", pagina="noticias/b.html")]
bookkeeping_dup_source = {
    "id-A": meta_base("guid:misma:identidad"),
    "id-B": meta_base("guid:misma:identidad"),
}
patches = con_tmp_dirs(tmp2)
with patches[0], patches[1], patches[2], patches[3], patches[4], \
     patch("lib.editorial_registry.REGISTRO_FILE", tmp2 / "data" / "noticias-editorial.json"):
    try:
        gn.guardar_noticias(noticias_dup_source, bookkeeping_dup_source)
        check("lanza RegistroEditorialError por source_identity duplicada", False, "no lanzó nada")
    except RegistroEditorialError as exc:
        check("lanza RegistroEditorialError por source_identity duplicada", True, str(exc))
    check("NO escribió noticias.json (falló antes de tocar disco)", not (tmp2 / "data" / "noticias.json").exists())

print()
print("=== 3. bookkeeping faltante para una noticia a publicar -> RegistroEditorialError ===")
tmp3 = Path(tempfile.mkdtemp())
noticias_sin_meta = [noticia("id-SIN-META")]
patches = con_tmp_dirs(tmp3)
with patches[0], patches[1], patches[2], patches[3], patches[4], \
     patch("lib.editorial_registry.REGISTRO_FILE", tmp3 / "data" / "noticias-editorial.json"):
    try:
        gn.guardar_noticias(noticias_sin_meta, {})
        check("lanza RegistroEditorialError por bookkeeping faltante", False, "no lanzó nada")
    except RegistroEditorialError:
        check("lanza RegistroEditorialError por bookkeeping faltante", True)

print()
print("=== 4. flujo normal: escribe registro con date_modified correcto (nuevo, sin cambio, con cambio) ===")
tmp4 = Path(tempfile.mkdtemp())
registro_file_4 = tmp4 / "data" / "noticias-editorial.json"

noticia_sin_cambio = noticia("id-SIN-CAMBIO", titulo="Titulo estable", pagina="noticias/estable.html")
editorial_sin_cambios = {
    "titulo": noticia_sin_cambio["titulo"], "descripcion": noticia_sin_cambio["descripcion"],
    "cuerpo": noticia_sin_cambio["cuerpo"], "categoria": noticia_sin_cambio["categoria"], "seo_keywords": [],
}
noticias4 = [
    noticia("id-NUEVA", titulo="Titulo nueva", pagina="noticias/nueva.html"),
    noticia_sin_cambio,
    noticia("id-CON-CAMBIO", titulo="Titulo cambiado ahora", pagina="noticias/cambiado.html"),
]
bookkeeping4 = {
    "id-NUEVA": meta_base("guid:a:nueva", editorial_previo=None, date_modified_previa=None, motivo_cache="CACHE_MISS_NEW"),
    "id-SIN-CAMBIO": meta_base("guid:a:estable", editorial_previo=editorial_sin_cambios, date_modified_previa="2026-08-01T00:00:00+00:00", content_hash_previo="hash-1", motivo_cache="CACHE_HIT", ia_intentada=False),
    "id-CON-CAMBIO": meta_base("guid:a:cambiado", editorial_previo={**editorial_sin_cambios, "titulo": "Titulo VIEJO"}, date_modified_previa="2026-07-01T00:00:00+00:00", content_hash_previo="hash-0", motivo_cache="CACHE_MISS_CONTENT_CHANGED"),
}
patches = con_tmp_dirs(tmp4)
with patches[0], patches[1], patches[2], patches[3], patches[4], \
     patch("lib.editorial_registry.REGISTRO_FILE", registro_file_4):
    gn.guardar_noticias(noticias4, bookkeeping4)

registro_final = json.loads(registro_file_4.read_text(encoding="utf-8"))
check("registro tiene las 3 entradas", len(registro_final) == 3, list(registro_final.keys()))
check("nueva: date_modified None", registro_final["guid:a:nueva"]["date_modified"] is None)
check("sin cambio: date_modified conserva el anterior", registro_final["guid:a:estable"]["date_modified"] == "2026-08-01T00:00:00+00:00")
check("con cambio: date_modified se actualiza (no es el anterior)", registro_final["guid:a:cambiado"]["date_modified"] != "2026-07-01T00:00:00+00:00", registro_final["guid:a:cambiado"]["date_modified"])
check("pagina persistida coincide con la de la noticia", registro_final["guid:a:cambiado"]["pagina"] == "noticias/cambiado.html")
check("editorial persistido es el payload SANEADO final, no un rescate", registro_final["guid:a:cambiado"]["editorial"]["titulo"] == "Titulo cambiado ahora")

output_final = json.loads((tmp4 / "data" / "noticias.json").read_text(encoding="utf-8"))
check("data/noticias.json escrito con las 3 noticias", len(output_final) == 3)

log_files = list((tmp4 / "reports").glob("editorial-pipeline-log-*.jsonl"))
check("guardar_noticias() escribió el log de task #17 (wiring real, no solo el módulo aislado)", len(log_files) == 1, log_files)
if log_files:
    eventos_log = [json.loads(l) for l in log_files[0].read_text(encoding="utf-8").strip().split("\n")]
    check("3 noticias -> 3 eventos de log", len(eventos_log) == 3, len(eventos_log))
    por_id = {e["id"]: e for e in eventos_log}
    check("evento de la nueva -> action=NEW_SOURCE", por_id["id-NUEVA"]["action"] == "NEW_SOURCE", por_id["id-NUEVA"]["action"])
    check("evento sin cambio -> public_content_changed=False", por_id["id-SIN-CAMBIO"]["public_content_changed"] is False)
    check("evento sin cambio -> action=UNCHANGED", por_id["id-SIN-CAMBIO"]["action"] == "UNCHANGED", por_id["id-SIN-CAMBIO"]["action"])
    check("evento con cambio -> public_content_changed=True", por_id["id-CON-CAMBIO"]["public_content_changed"] is True)
    check("evento con cambio -> action=SOURCE_CHANGED_PUBLIC_CHANGED", por_id["id-CON-CAMBIO"]["action"] == "SOURCE_CHANGED_PUBLIC_CHANGED", por_id["id-CON-CAMBIO"]["action"])
    check("ningún evento contiene título/cuerpo/descripción", not any(k in e for e in eventos_log for k in ("titulo", "cuerpo", "descripcion")))

print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
