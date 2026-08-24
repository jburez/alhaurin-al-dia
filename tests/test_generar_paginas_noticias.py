"""
Tests de generar_paginas_noticias() (slug write-once + PaginaColisionError)
contra el modulo REAL scripts/generar_noticias.py. Escribe HTML real en un
directorio temporal (patchea NOTICIAS_DIR/BASE_DIR) para no tocar el repo.
Ejecutar con:
  python3 test_generar_paginas_noticias.py
"""
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import generar_noticias as gn  # noqa: E402
from lib.editorial_registry import PaginaColisionError  # noqa: E402

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


def noticia(id_, titulo, pagina=""):
    return {"id": id_, "titulo": titulo, "descripcion": "Desc", "cuerpo": "Cuerpo de prueba.",
            "fecha": "2026-08-20T00:00:00+00:00", "fuente": "Test", "categoria": "Actualidad",
            "seo_keywords": [], "enlace": "https://x.example/", "url": "https://x.example/",
            "imagen": "", "pagina": pagina}


tmp_dir = Path(tempfile.mkdtemp())


def con_tmp_dirs():
    return [
        patch.object(gn, "BASE_DIR", tmp_dir),
        patch.object(gn, "NOTICIAS_DIR", tmp_dir / "noticias"),
    ]


print("=== 1. noticia A pagina X, noticia B pagina X, IDs distintos -> PaginaColisionError ===")
noticias_colision = [
    noticia("id-A", "Titulo A", pagina="noticias/pagina-x.html"),
    noticia("id-B", "Titulo B", pagina="noticias/pagina-x.html"),
]
p1, p2 = con_tmp_dirs()
with p1, p2:
    try:
        gn.generar_paginas_noticias(noticias_colision)
        check("lanza PaginaColisionError", False, "no lanzó nada")
    except PaginaColisionError as exc:
        check("lanza PaginaColisionError", True)
        check("el mensaje referencia ambos ids", "id-A" in str(exc) and "id-B" in str(exc), str(exc))

print()
print("=== 2. misma pagina + mismo id -> compatible, no lanza (aparece 2 veces por error de datos, no colisión real) ===")
noticias_mismo_id = [
    noticia("id-A", "Titulo A", pagina="noticias/pagina-y.html"),
]
p1, p2 = con_tmp_dirs()
with p1, p2:
    try:
        gn.generar_paginas_noticias(noticias_mismo_id)
        check("no lanza con mismo id", True)
    except PaginaColisionError:
        check("no lanza con mismo id", False)

print()
print("=== 3. write-once: pagina heredada NUNCA se recalcula aunque cambie el título ===")
noticias_write_once = [
    noticia("id-C", "Titulo COMPLETAMENTE DISTINTO ahora", pagina="noticias/pagina-original-heredada.html"),
]
p1, p2 = con_tmp_dirs()
with p1, p2:
    gn.generar_paginas_noticias(noticias_write_once)
check("pagina no cambia pese al título distinto", noticias_write_once[0]["pagina"] == "noticias/pagina-original-heredada.html", noticias_write_once[0]["pagina"])

print()
print("=== 4. noticia genuinamente nueva (sin pagina previa) SÍ genera slug desde el título ===")
noticias_nueva = [
    noticia("id-D", "Titulo Nuevo Para Slug", pagina=""),
]
p1, p2 = con_tmp_dirs()
with p1, p2:
    gn.generar_paginas_noticias(noticias_nueva)
check("se generó una pagina no vacía", bool(noticias_nueva[0]["pagina"]), noticias_nueva[0]["pagina"])
check("la pagina generada viene del título", "titulo-nuevo-para-slug" in noticias_nueva[0]["pagina"], noticias_nueva[0]["pagina"])

print()
print("=== 5. pagina nueva no colisiona con una heredada ya reservada ===")
noticias_reserva = [
    noticia("id-E", "Titulo Nuevo Para Slug", pagina="noticias/titulo-nuevo-para-slug.html"),  # heredada, ocupa el slug "natural"
    noticia("id-F", "Titulo Nuevo Para Slug", pagina=""),  # nueva, generaría el MISMO slug si no se reservara antes
]
p1, p2 = con_tmp_dirs()
with p1, p2:
    gn.generar_paginas_noticias(noticias_reserva)
check("la heredada no cambia", noticias_reserva[0]["pagina"] == "noticias/titulo-nuevo-para-slug.html")
check("la nueva evita la colisión con un sufijo", noticias_reserva[1]["pagina"] != noticias_reserva[0]["pagina"], noticias_reserva[1]["pagina"])

print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
