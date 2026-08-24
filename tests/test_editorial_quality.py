"""Batería de regresión de calidad editorial (task #20, Bloque A).

Protege las decisiones ya cerradas en task #14 sobre evaluar_titulo() y la
orquestación sanear_titulo() (rescate + segunda validación), que hasta
ahora no tenían ningún test dedicado -- solo aparecían de refilón dentro
de otros tests. Contra el código REAL, sin mockear reglas ni umbrales.

Ejecutar con: python3 test_editorial_quality.py
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib.editorial_rules import (  # noqa: E402
    evaluar_titulo,
    titulo_empieza_sospechoso,
    titulo_truncado,
)
import generar_noticias_seguro as gns  # noqa: E402

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


print("=== 1. titular válido -> aceptable, sin señales activas ===")
titulo_valido = "El Ayuntamiento aprueba nuevas ayudas para las asociaciones locales"
ev = evaluar_titulo(titulo_valido)
check("aceptable=True", ev["aceptable"] is True, ev)
check("ninguna señal negativa activa", not any(ev["señales"][s] for s in
      ("truncado", "inicio_sospechoso", "sin_entidad", "pocas_palabras_utiles")), ev["señales"])
check("score=100 (sin penalización)", ev["score"] == 100.0, ev["score"])


print("\n=== 2. titular truncado / terminal incompleto ===")
check("puntos suspensivos -> truncado", titulo_truncado("El Ayuntamiento anuncia nuevas medidas..."))
check("comillas sin cerrar -> truncado", titulo_truncado('El alcalde dijo "vamos a mejorar la ciudad'))
check("termina en preposición -> truncado", titulo_truncado("El Ayuntamiento aprueba ayudas para"))
check("termina en posesivo -> truncado", titulo_truncado("La Diputación presenta su"))
check("termina en verbo sin complemento -> truncado", titulo_truncado("Las asociaciones locales puedan"))
check("titular completo -> NO truncado", not titulo_truncado(titulo_valido))
check("vacío -> truncado (fail-closed)", titulo_truncado(""))

titulo_truncado_texto = "La Diputación aprueba nuevas ayudas económicas para las asociaciones y"
ev_truncado = evaluar_titulo(titulo_truncado_texto)
check(
    "señal truncado activa, resto limpio (aislada de las demás)",
    ev_truncado["señales"]["truncado"] is True and not any(
        ev_truncado["señales"][s] for s in ("inicio_sospechoso", "sin_entidad", "pocas_palabras_utiles")
    ),
    ev_truncado["señales"],
)
check(
    "truncado SOLA ya basta para rechazar (score < 60)",
    ev_truncado["aceptable"] is False,
    ev_truncado,
)


print("\n=== 3. inicio sospechoso: decisión cerrada -- NO rechaza por sí solo ===")
titulo_inicio_sospechoso = "Sin embargo, el Ayuntamiento aprueba nuevas ayudas para asociaciones"
check("detectado por titulo_empieza_sospechoso()", titulo_empieza_sospechoso(titulo_inicio_sospechoso))
ev_sospechoso = evaluar_titulo(titulo_inicio_sospechoso)
check("señal inicio_sospechoso activa", ev_sospechoso["señales"]["inicio_sospechoso"] is True)
check(
    "inicio_sospechoso SOLO no basta para rechazar (score=65 >= 60)",
    ev_sospechoso["aceptable"] is True,
    ev_sospechoso,
)

titulo_sospechoso_combinado = "Sin embargo la situación mejora tras la intervención municipal"
ev_combinado = evaluar_titulo(titulo_sospechoso_combinado)
check("inicio_sospechoso + sin_entidad ambas activas", ev_combinado["señales"]["inicio_sospechoso"] and ev_combinado["señales"]["sin_entidad"], ev_combinado["señales"])
check(
    "combinado con otra señal SÍ rechaza (score < 60)",
    ev_combinado["aceptable"] is False,
    ev_combinado,
)


print("\n=== 4. falta de entidad reconocible: decisión cerrada -- NO rechaza por sí sola ===")
titulo_sin_entidad = "La situación mejora tras la intervención municipal reciente"
ev_sin_entidad = evaluar_titulo(titulo_sin_entidad)
check("señal sin_entidad activa, resto limpio", ev_sin_entidad["señales"]["sin_entidad"] is True)
check("ninguna otra señal activa en este caso", not any(
    ev_sin_entidad["señales"][s] for s in ("truncado", "inicio_sospechoso", "pocas_palabras_utiles")
), ev_sin_entidad["señales"])
check(
    "sin_entidad SOLA no basta para rechazar (score=90 >= 60)",
    ev_sin_entidad["aceptable"] is True,
    ev_sin_entidad,
)


print("\n=== 5. sanitización final (generar_noticias_seguro.py) ===")

check(
    "sanear_descripcion(): normaliza puntos suspensivos y cierra la frase",
    gns.sanear_descripcion({"descripcion": "El pleno aprobó el presupuesto municipal para el próximo año..."})
    == "El pleno aprobó el presupuesto municipal para el próximo año.",
)
check(
    "sanear_descripcion(): descripción vacía -> fallback editorial, nunca cadena vacía",
    gns.sanear_descripcion({"descripcion": ""}) == "Actualidad local de Alhaurín el Grande.",
)
check(
    "sanear_descripcion(): usa 'resumen' si falta 'descripcion'",
    gns.sanear_descripcion({"resumen": "Texto de resumen suficiente."}) == "Texto de resumen suficiente.",
)

check(
    "sanear_cuerpo(): cuerpo vacío -> reutiliza la descripción ya saneada",
    gns.sanear_cuerpo({"cuerpo": ""}, "Descripción saneada de referencia.") == "Descripción saneada de referencia.",
)
cuerpo_real = "Primera frase larga sobre el pleno municipal y sus acuerdos. Segunda frase con más detalle sobre el presupuesto aprobado."
check(
    "sanear_cuerpo(): con contenido real, distinto de la descripción -> se conserva",
    gns.sanear_cuerpo({"cuerpo": cuerpo_real}, "Descripción corta distinta.") != "Descripción corta distinta.",
)

noticia_completa = {
    "id": "id-1", "titulo": titulo_valido, "descripcion": "Descripción con longitud suficiente para superar el mínimo exigido.",
    "cuerpo": "Cuerpo de la noticia.", "fecha": "2026-08-20T00:00:00+00:00", "fuente": "Test",
    "categoria": "Municipal", "url": "https://x.example/a",
}
check("noticia_publicable(): campos completos + descripción suficiente -> True", gns.noticia_publicable(noticia_completa) is True)

noticia_sin_fuente = {**noticia_completa, "fuente": ""}
check("noticia_publicable(): falta un campo obligatorio -> False", gns.noticia_publicable(noticia_sin_fuente) is False)

noticia_descripcion_corta = {**noticia_completa, "descripcion": "Muy corta."}
check("noticia_publicable(): descripción por debajo del mínimo -> False", gns.noticia_publicable(noticia_descripcion_corta) is False)


print("\n=== 6. segunda validación tras regeneración (sanear_titulo()) ===")

noticia_titulo_valido = {"titulo": titulo_valido, "cuerpo": "Cuerpo de prueba con contenido suficiente."}
check(
    "titular original ya válido -> se conserva tal cual, sin regenerar",
    gns.sanear_titulo(noticia_titulo_valido) == titulo_valido,
)

# Original genérico (placeholder tipo "NOTICIAS ATV") -> descarta el
# original y va directo a rescate SIN puntuarlo (decisión ya cerrada:
# titulo_generico() no es una cuestión de completitud lingüística). El
# rescate usa como candidato el titulo_original si no es genérico.
noticia_generica_con_rescate = {
    "titulo": "NOTICIAS ATV 20 agosto",
    "titulo_original": "El Ayuntamiento aprueba nuevas ayudas para las asociaciones locales",
    "descripcion": "Descripción de referencia con longitud suficiente para el rescate.",
    "cuerpo": "Cuerpo de prueba con contenido suficiente para superar el mínimo exigido por las reglas editoriales.",
    "fuente": "Test",
}
rescate = gns.sanear_titulo(noticia_generica_con_rescate)
check(
    "titular genérico -> rescata desde titulo_original (no genérico) y pasa la segunda validación",
    rescate == "El Ayuntamiento aprueba nuevas ayudas para las asociaciones locales",
    rescate,
)
check("el rescate en sí pasa evaluar_titulo()", evaluar_titulo(rescate)["aceptable"] is True, rescate)

# Ni el original ni el rescate son recuperables (ambos truncados/vacíos de
# contenido útil) -> sanear_titulo() debe descartar devolviendo "".
noticia_sin_rescate_posible = {
    "titulo": "Sin embargo",
    "titulo_original": "Sin embargo",
    "descripcion": "Breve.",
    "cuerpo": "Breve.",
    "fuente": "Test",
}
check(
    "ni original ni rescate recuperables -> cadena vacía (descartar)",
    gns.sanear_titulo(noticia_sin_rescate_posible) == "",
)


print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
