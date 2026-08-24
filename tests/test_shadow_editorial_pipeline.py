import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import shadow_editorial_pipeline as sep  # noqa: E402

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


TMP = Path(tempfile.mkdtemp(prefix="test-shadow-"))


def escribir(nombre, contenido_texto):
    ruta = TMP / nombre
    ruta.write_text(contenido_texto, encoding="utf-8")
    return ruta


print("=== _cargar(): fail-closed ===")
try:
    sep._cargar(TMP / "no-existe.json")
    check("fichero ausente -> ShadowPipelineError", False, "no lanzó nada")
except sep.ShadowPipelineError:
    check("fichero ausente -> ShadowPipelineError", True)

ruta_json_invalido = escribir("invalido.json", "{ esto no es json valido")
try:
    sep._cargar(ruta_json_invalido)
    check("JSON inválido -> ShadowPipelineError", False, "no lanzó nada")
except sep.ShadowPipelineError:
    check("JSON inválido -> ShadowPipelineError", True)

ruta_no_lista = escribir("no-lista.json", json.dumps({"no": "es una lista"}))
try:
    sep._cargar(ruta_no_lista)
    check("raíz no-lista -> ShadowPipelineError", False, "no lanzó nada")
except sep.ShadowPipelineError:
    check("raíz no-lista -> ShadowPipelineError", True)

ruta_valida = escribir("valida.json", json.dumps([{"id": "a"}, {"id": "b"}]))
resultado_valido = sep._cargar(ruta_valida)
check("lista válida -> se carga tal cual", resultado_valido == [{"id": "a"}, {"id": "b"}], resultado_valido)

print()
print("=== _shadow_identity() ===")
check("con id -> 'id:X'", sep._shadow_identity({"id": "X", "pagina": "p"}) == "id:X")
check("sin id, con pagina -> 'pagina:P' (fallback legacy)", sep._shadow_identity({"pagina": "noticias/p.html"}) == "pagina:noticias/p.html")
try:
    sep._shadow_identity({"titulo": "Sin nada"})
    check("sin id NI pagina -> ShadowPipelineError", False, "no lanzó nada")
except sep.ShadowPipelineError:
    check("sin id NI pagina -> ShadowPipelineError", True)

print()
print("=== _deduplicar_pool(): sin duplicados ===")
activas = [{"id": "A1", "pagina": "noticias/a1.html", "titulo": "T1"}]
archivo = [{"id": "B1", "pagina": "noticias/b1.html", "titulo": "T2"}]
pool, dup, por_id, por_pagina = sep._deduplicar_pool(activas, archivo)
check("sin duplicados -> pool = activas+archivo", pool == activas + archivo, pool)
check("sin duplicados -> duplicados=0", dup == 0)
check("ambas tienen id -> por_id_real=2, por_pagina_fallback=0", (por_id, por_pagina) == (2, 0), (por_id, por_pagina))

print()
print("=== _deduplicar_pool(): mismo id, misma pagina -> deduplica priorizando activa ===")
activas2 = [{"id": "X", "pagina": "noticias/x.html", "titulo": "Version activa"}]
archivo2 = [{"id": "X", "pagina": "noticias/x.html", "titulo": "Version archivo (debe ignorarse)"}]
pool2, dup2, _, _ = sep._deduplicar_pool(activas2, archivo2)
check("solo 1 entrada en el pool (deduplicado)", len(pool2) == 1, pool2)
check("se prioriza la versión de activas", pool2[0]["titulo"] == "Version activa", pool2[0])
check("duplicados=1", dup2 == 1)

print()
print("=== _deduplicar_pool(): mismo id, pagina INCOMPATIBLE -> ShadowPipelineError ===")
activas3 = [{"id": "Y", "pagina": "noticias/y-activa.html", "titulo": "T"}]
archivo3 = [{"id": "Y", "pagina": "noticias/y-archivo-DISTINTA.html", "titulo": "T"}]
try:
    sep._deduplicar_pool(activas3, archivo3)
    check("pagina incompatible -> ShadowPipelineError", False, "no lanzó nada")
except sep.ShadowPipelineError as exc:
    check("pagina incompatible -> ShadowPipelineError", True, str(exc))

print()
print("=== _deduplicar_pool(): noticia sin id NI pagina -> ShadowPipelineError (fail-closed) ===")
activas4 = [{"titulo": "Noticia sin id ni pagina"}]
try:
    sep._deduplicar_pool(activas4, [])
    check("noticia sin id ni pagina -> ShadowPipelineError", False, "no lanzó nada")
except sep.ShadowPipelineError as exc:
    check("noticia sin id ni pagina -> ShadowPipelineError", True, str(exc))
    check("el mensaje incluye el título para diagnosticar", "Noticia sin id ni pagina" in str(exc), str(exc))

print()
print("=== _deduplicar_pool(): archivo legacy SIN id, con pagina -> fallback aceptado, contabilizado aparte ===")
archivo_legacy = [{"pagina": "noticias/legacy-1.html", "titulo": "Legacy sin id"}]
pool_legacy, dup_legacy, por_id_legacy, por_pagina_legacy = sep._deduplicar_pool([], archivo_legacy)
check("se acepta sin id, usando pagina como fallback", len(pool_legacy) == 1, pool_legacy)
check("se contabiliza como fallback por pagina, no como id real", (por_id_legacy, por_pagina_legacy) == (0, 1), (por_id_legacy, por_pagina_legacy))

print()
print("=== _deduplicar_pool(): duplicado DENTRO del mismo fichero (archivo con 2 entradas mismo id) ===")
archivo5 = [
    {"id": "Z", "pagina": "noticias/z.html", "titulo": "Primera aparición"},
    {"id": "Z", "pagina": "noticias/z.html", "titulo": "Segunda aparición (compatible, se ignora)"},
]
pool5, dup5, _, _ = sep._deduplicar_pool([], archivo5)
check("duplicado intra-fichero compatible se deduplica", len(pool5) == 1 and dup5 == 1, (pool5, dup5))

archivo6 = [
    {"id": "W", "pagina": "noticias/w-1.html", "titulo": "Primera"},
    {"id": "W", "pagina": "noticias/w-2-DISTINTA.html", "titulo": "Segunda"},
]
try:
    sep._deduplicar_pool([], archivo6)
    check("duplicado intra-fichero incompatible -> ShadowPipelineError", False, "no lanzó nada")
except sep.ShadowPipelineError:
    check("duplicado intra-fichero incompatible -> ShadowPipelineError", True)

print()
print("=== _deduplicar_pool(): colisión de pagina entre identidades de sombra DISTINTAS (activa con id vs archivo por pagina) ===")
activas7 = [{"id": "ID-REAL", "pagina": "noticias/compartida.html", "titulo": "Version con id"}]
archivo7 = [{"pagina": "noticias/compartida.html", "titulo": "Misma pagina, sin id"}]  # shadow_identity distinta ("pagina:...") aunque la pagina coincide
try:
    sep._deduplicar_pool(activas7, archivo7)
    check("pagina compartida entre identidades de sombra distintas -> ShadowPipelineError", False, "no lanzó nada")
except sep.ShadowPipelineError as exc:
    check("pagina compartida entre identidades de sombra distintas -> ShadowPipelineError", True, str(exc))

print()
print("=== _bin_jaccard() ===")
check("0.699 -> None (fuera de rango)", sep._bin_jaccard(0.699) is None)
check("0.70 -> '0.70-0.79'", sep._bin_jaccard(0.70) == "0.70-0.79")
check("0.799 -> '0.70-0.79'", sep._bin_jaccard(0.799) == "0.70-0.79")
check("0.80 -> '0.80-0.89'", sep._bin_jaccard(0.80) == "0.80-0.89")
check("0.90 -> '0.90-0.94'", sep._bin_jaccard(0.90) == "0.90-0.94")
check("0.95 -> '0.95-0.99'", sep._bin_jaccard(0.95) == "0.95-0.99")
check("1.0 -> '1.00'", sep._bin_jaccard(1.0) == "1.00")

print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
