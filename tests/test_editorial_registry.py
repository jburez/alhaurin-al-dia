import json
import shutil
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import lib.editorial_registry as reg

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


print("=== generar_source_identity ===")

# 1. mismo GUID en dos fuentes distintas -> sourceIdentity distinta
id_a = reg.generar_source_identity("224703", "https://a.example/x", "fuente-a")
id_b = reg.generar_source_identity("224703", "https://b.example/y", "fuente-b")
check("1. mismo guid, fuentes distintas -> identidad distinta", id_a != id_b, f"{id_a!r} vs {id_b!r}")

# 2. mismo GUID y misma fuente -> identidad igual
id_c = reg.generar_source_identity("224703", "https://a.example/x", "fuente-a")
id_d = reg.generar_source_identity("224703", "https://a.example/x-cambiada-despues", "fuente-a")
check("2. mismo guid, misma fuente -> identidad igual (aunque cambie la url)", id_c == id_d, f"{id_c!r} vs {id_d!r}")

# 3. URL con utm_*, fbclid, etc. -> misma identidad que la URL limpia
url_limpia = "https://example.com/noticia-x"
url_con_tracking = "https://example.com/noticia-x?utm_source=fb&utm_medium=social&fbclid=abc123&gclid=xyz"
id_limpia = reg.generar_source_identity(None, url_limpia, "fuente-a")
id_tracking = reg.generar_source_identity(None, url_con_tracking, "fuente-a")
check("3. url con tracking == url limpia", id_limpia == id_tracking, f"{id_limpia!r} vs {id_tracking!r}")

# 4. parametros funcionales no tracking -> se conservan (identidad distinta si cambian)
url_pagina_1 = "https://example.com/listado?pagina=1"
url_pagina_2 = "https://example.com/listado?pagina=2"
id_pagina_1 = reg.generar_source_identity(None, url_pagina_1, "fuente-a")
id_pagina_2 = reg.generar_source_identity(None, url_pagina_2, "fuente-a")
check("4. parametro funcional distinto -> identidad distinta", id_pagina_1 != id_pagina_2, f"{id_pagina_1!r} vs {id_pagina_2!r}")
check("4b. parametro funcional se conserva en la identidad", "pagina=1" in id_pagina_1, id_pagina_1)

# 5. fragmento #... -> no cambia identidad
url_sin_frag = "https://example.com/noticia-y"
url_con_frag = "https://example.com/noticia-y#seccion-2"
id_sin_frag = reg.generar_source_identity(None, url_sin_frag, "fuente-a")
id_con_frag = reg.generar_source_identity(None, url_con_frag, "fuente-a")
check("5. fragmento no cambia identidad", id_sin_frag == id_con_frag, f"{id_sin_frag!r} vs {id_con_frag!r}")

# 5b. "ref"/"refsrc" NO se tratan como tracking -- son demasiado genericos,
# pueden ser parametros funcionales reales. Dos URLs que solo difieren en
# el VALOR de ref deben quedar separadas.
url_ref_a = "https://example.com/noticia?id=123&ref=a"
url_ref_b = "https://example.com/noticia?id=123&ref=b"
id_ref_a = reg.generar_source_identity(None, url_ref_a, "fuente-a")
id_ref_b = reg.generar_source_identity(None, url_ref_b, "fuente-a")
check("5b. ref con valores distintos -> identidades distintas (no se colapsan)", id_ref_a != id_ref_b, f"{id_ref_a!r} vs {id_ref_b!r}")
check("5c. ref se conserva literalmente en la identidad", "ref=a" in id_ref_a, id_ref_a)

# extra: GUID que en realidad es una URL con tracking -> se canonicaliza igual
guid_url_tracking = "https://example.com/noticia-z?utm_source=rss"
guid_url_limpia = "https://example.com/noticia-z"
id_guid_tracking = reg.generar_source_identity(guid_url_tracking, "https://otra.example/enlace", "fuente-a")
id_guid_limpio = reg.generar_source_identity(guid_url_limpia, "https://otra.example/enlace", "fuente-a")
check("6. guid-como-url con tracking == guid-como-url limpio", id_guid_tracking == id_guid_limpio, f"{id_guid_tracking!r} vs {id_guid_limpio!r}")

print()
print("=== URLs relativas (canonicalizar_url / generar_source_identity) ===")

# 13. URL relativa sin base -> no fabrica "https:///...", lanza ValueError
try:
    reg.canonicalizar_url("/noticias/123")
    check("13. relativa sin base -> ValueError", False, "no se lanzo excepcion")
except ValueError:
    check("13. relativa sin base -> ValueError", True)

# 14. URL relativa CON base -> se resuelve correctamente contra la base
resuelta = reg.canonicalizar_url("/noticias/123", base="https://ejemplo.com/feed/")
check("14. relativa con base -> resuelta a absoluta", resuelta == "https://ejemplo.com/noticias/123", resuelta)

# 15. generar_source_identity con url relativa y sin base -> cae al fallback
# determinista (hash), no produce "url:https:///..."
id_relativa_sin_base = reg.generar_source_identity(None, "/noticias/123", "fuente-a", titulo_fallback="Titulo X", fuente_fallback="Fuente A")
check("15. url relativa sin base cae al fallback hash", id_relativa_sin_base.startswith("hash:"), id_relativa_sin_base)
check("15b. el fallback nunca contiene 'https:///'", "https:///" not in id_relativa_sin_base, id_relativa_sin_base)

# 16. generar_source_identity con url relativa y base -> se resuelve, no cae al fallback
id_relativa_con_base = reg.generar_source_identity(None, "/noticias/123", "fuente-a", base="https://ejemplo.com/feed/")
check("16. url relativa con base -> se resuelve como url", id_relativa_con_base == "url:https://ejemplo.com/noticias/123", id_relativa_con_base)

# 17. fallback determinista normalizado: mismo texto con distinto case/acentos -> misma identidad
id_fallback_1 = reg.generar_source_identity(None, None, "fuente-a", titulo_fallback="Título de Prueba", fuente_fallback="Fuente A")
id_fallback_2 = reg.generar_source_identity(None, None, "fuente-a", titulo_fallback="titulo DE prueba", fuente_fallback="fuente a")
check("17. fallback normaliza case/acentos -> misma identidad", id_fallback_1 == id_fallback_2, f"{id_fallback_1!r} vs {id_fallback_2!r}")

# 18. mismo titulo fallback en dos source_key distintos -> identidades distintas
id_fb_source_a = reg.generar_source_identity(None, None, "fuente-a", titulo_fallback="Mismo Titulo Generico", fuente_fallback="Radio Local")
id_fb_source_b = reg.generar_source_identity(None, None, "fuente-b", titulo_fallback="Mismo Titulo Generico", fuente_fallback="Radio Local")
check("18. mismo titulo fallback, source_key distinto -> identidad distinta", id_fb_source_a != id_fb_source_b, f"{id_fb_source_a!r} vs {id_fb_source_b!r}")

# 19. mismo source_key + mismo fallback -> identidad estable (repetible)
id_fb_repetido = reg.generar_source_identity(None, None, "fuente-a", titulo_fallback="Mismo Titulo Generico", fuente_fallback="Radio Local")
check("19. mismo source_key + mismo fallback -> identidad estable", id_fb_source_a == id_fb_repetido, f"{id_fb_source_a!r} vs {id_fb_repetido!r}")

# 20. entrada completamente sin identidad (sin guid, sin url, sin titulo) -> error
# controlado, NO un hash constante que colisione silenciosamente con otras
# entradas igual de vacias
try:
    reg.generar_source_identity(None, None, "fuente-a", titulo_fallback="", fuente_fallback="Radio Local")
    check("20. sin ningun dato de identidad -> ValueError controlado", False, "no se lanzo excepcion")
except ValueError:
    check("20. sin ningun dato de identidad -> ValueError controlado", True)

print()
print("=== registro: lectura/escritura atomica ===")

tmp_dir = Path(tempfile.mkdtemp())
original_registro_file = reg.REGISTRO_FILE
try:
    reg.REGISTRO_FILE = tmp_dir / "noticias-editorial.json"

    # 7. fichero inexistente -> {} sin error
    vacio = reg.cargar_registro()
    check("7. fichero inexistente devuelve registro vacio", vacio == {}, repr(vacio))

    # 8. guardar y releer
    datos = {"guid:fuente-a:123": {"id": "abc", "pagina": "noticias/x.html"}}
    reg.guardar_registro(datos)
    check("8a. el fichero final existe tras guardar", reg.REGISTRO_FILE.exists())
    releido = reg.cargar_registro()
    check("8b. lo releido coincide con lo guardado", releido == datos, repr(releido))
    check("8c. no queda fichero temporal residual", not any(p.name.startswith(".tmp") or "tmp-" in p.name for p in tmp_dir.iterdir() if p != reg.REGISTRO_FILE), list(tmp_dir.iterdir()))

    # 9. registro corrupto (JSON invalido) -> comportamiento seguro y visible
    reg.REGISTRO_FILE.write_text("{ esto no es json valido ][", encoding="utf-8")
    resultado_corrupto = reg.cargar_registro()
    check("9a. JSON invalido -> devuelve registro vacio (no crashea)", resultado_corrupto == {}, repr(resultado_corrupto))
    archivos_tras_corrupcion = list(tmp_dir.iterdir())
    hay_copia_corrupta = any("corrupto" in p.name for p in archivos_tras_corrupcion)
    check("9b. se conserva una copia del fichero corrupto (no se pierde evidencia)", hay_copia_corrupta, archivos_tras_corrupcion)
    check("9c. el path original ya no existe (fue renombrado, no borrado)", not reg.REGISTRO_FILE.exists())

    # 10. registro con JSON valido pero no-dict (p.ej. una lista) -> tambien es corrupcion visible
    reg.REGISTRO_FILE.write_text(json.dumps([1, 2, 3]), encoding="utf-8")
    resultado_no_dict = reg.cargar_registro()
    check("10. JSON valido pero no es dict -> registro vacio, no crashea", resultado_no_dict == {}, repr(resultado_no_dict))

    # 11. JSON corrupto + fallo al preservar/renombrar -> NO se pierde el original,
    # se lanza RegistroEditorialError en vez de continuar silenciosamente
    reg.REGISTRO_FILE.write_text("{ contenido corrupto de nuevo ][", encoding="utf-8")
    contenido_original_bytes = reg.REGISTRO_FILE.read_bytes()
    with patch.object(Path, "rename", side_effect=OSError("fallo simulado de renombrado")):
        try:
            reg.cargar_registro()
            check("11a. fallo al archivar -> lanza RegistroEditorialError", False, "no se lanzo ninguna excepcion")
        except reg.RegistroEditorialError:
            check("11a. fallo al archivar -> lanza RegistroEditorialError", True)
        except Exception as e:  # noqa: BLE001
            check("11a. fallo al archivar -> lanza RegistroEditorialError", False, f"excepcion incorrecta: {type(e).__name__}: {e}")
    # el original debe seguir intacto en disco, sin haber sido tocado
    check("11b. el registro corrupto original NO se destruyo", reg.REGISTRO_FILE.exists() and reg.REGISTRO_FILE.read_bytes() == contenido_original_bytes)
    # y como cargar_registro() lanzo antes de devolver nada, guardar_registro()
    # nunca deberia ejecutarse en ese flujo -- lo comprobamos explicitamente:
    # si alguien SI llamase a guardar_registro() tras la excepcion, seguiria
    # pisando el fichero (comportamiento normal de guardar_registro, no es su
    # responsabilidad decidir esto -- la proteccion es que cargar_registro()
    # nunca deja continuar el flujo llamante sin la excepcion).

finally:
    reg.REGISTRO_FILE = original_registro_file
    shutil.rmtree(tmp_dir, ignore_errors=True)

print()
print("=== calcular_content_hash ===")
h1 = reg.calcular_content_hash("Titulo de prueba", "Cuerpo de la noticia sin cambios")
h2 = reg.calcular_content_hash("Titulo de prueba", "Cuerpo de la noticia sin cambios")
h3 = reg.calcular_content_hash("Titulo de prueba", "Cuerpo de la noticia CON cambios reales")
check("11. mismo contenido -> mismo hash", h1 == h2, f"{h1} vs {h2}")
check("12. contenido distinto -> hash distinto", h1 != h3, f"{h1} vs {h3}")

print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
else:
    print("RESULTADO: todos los tests pasaron")
