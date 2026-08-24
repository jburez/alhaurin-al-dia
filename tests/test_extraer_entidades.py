import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib.editorial_rules import extraer_entidades, entidades_relevantes, normalizar_texto  # noqa: E402

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


def normalizados(entidades):
    return {normalizar_texto(e) for e in entidades}


print("=== Acrónimos cortos (2-3 caracteres): NO deben perderse por el filtro de longitud ===")
for sigla in ["PSOE", "PP", "IU", "VOX", "AEMET", "DGT", "UMA"]:
    resultado = extraer_entidades(f"El {sigla} anunció una nueva propuesta ayer en el pleno.")
    check(f"{sigla} presente", sigla.lower() in normalizados(resultado), resultado)

print()
print("=== Entidades compuestas con conector interno ===")
casos_compuestos = {
    "Alhaurín el Grande": "El municipio de Alhaurín el Grande celebró sus fiestas.",
    "Junta de Andalucía": "La Junta de Andalucía licitó las obras del polideportivo.",
    "Guardia Civil": "La Guardia Civil detuvo a un hombre por un robo.",
    "Plaza Baja": "El mercadillo se traslada a Plaza Baja durante las fiestas.",
    "Sierra de las Nieves": "La ruta discurre por la Sierra de las Nieves hasta el mirador.",
}
for esperado, texto in casos_compuestos.items():
    resultado = extraer_entidades(texto)
    check(f"'{esperado}' detectada como compuesta", normalizar_texto(esperado) in normalizados(resultado), resultado)

print()
print("=== Limitación conocida y aceptada: prefijo institucional encadenado con topónimo ===")
# "Ayuntamiento de Alhaurín el Grande" se extrae como UNA entidad larga; el
# sub-compuesto de 2 palabras "Alhaurín el Grande" NO aparece como unidad
# propia -- solo sus componentes sueltos. Esto es aceptado para task #16
# (el solapamiento de entidades es señal, no hard gate): los componentes
# sueltos ya garantizan solapamiento con un artículo que mencione el
# topónimo sin el prefijo institucional.
resultado_encadenado = extraer_entidades("El Ayuntamiento de Alhaurín el Grande aprobó el presupuesto.")
check(
    "la cadena larga completa SÍ aparece",
    normalizar_texto("Ayuntamiento de Alhaurín el Grande") in normalizados(resultado_encadenado),
    resultado_encadenado,
)
check(
    "el sub-compuesto 'Alhaurín el Grande' NO aparece como unidad propia (limitación conocida)",
    normalizar_texto("Alhaurín el Grande") not in normalizados(resultado_encadenado),
    resultado_encadenado,
)
check("pero los componentes sueltos SÍ están (garantizan solapamiento)",
      "alhaurin" in normalizados(resultado_encadenado) and "grande" in normalizados(resultado_encadenado),
      resultado_encadenado)

print()
print("=== Componentes individuales también se conservan ===")
resultado_junta = extraer_entidades("La Junta de Andalucía licitó las obras.")
check("componente 'Junta' presente", "junta" in normalizados(resultado_junta), resultado_junta)
check("componente 'Andalucía' presente", "andalucia" in normalizados(resultado_junta), resultado_junta)

print()
print("=== Casos negativos: conectores/artículos sueltos nunca son entidad ===")
resultado_neg = extraer_entidades("El pleno aprobó ayer las nuevas medidas para la ciudadanía.")
for palabra_prohibida in ["el", "las", "la", "para"]:
    check(f"'{palabra_prohibida}' NO aparece como entidad suelta", palabra_prohibida not in normalizados(resultado_neg), resultado_neg)

print()
print("=== Deduplicación por forma normalizada (determinista) ===")
resultado_dup = extraer_entidades("La Guardia Civil investiga el caso. La Guardia Civil confirmó la detención.")
apariciones_guardia_civil = sum(1 for e in resultado_dup if normalizar_texto(e) == normalizar_texto("Guardia Civil"))
check("'Guardia Civil' aparece una sola vez pese a repetirse en el texto", apariciones_guardia_civil == 1, resultado_dup)

print()
print("=== Integración con entidades_relevantes(): el filtro institucional sigue aplicándose ===")
# "El municipio de Alhaurín el Grande" (sin prefijo institucional pegado)
# produce "Alhaurín el Grande" como compuesta propia -- distinto del caso
# encadenado de arriba. Junto a "Guardia Civil", ninguna de las dos es
# vocabulario institucional genérico, así que ambas deben sobrevivir el
# filtro sin verse afectadas por él.
texto_integracion = "El municipio de Alhaurín el Grande y la Guardia Civil colaboraron en el operativo."
extraidas = extraer_entidades(texto_integracion)
relevantes = entidades_relevantes(extraidas)
relevantes_norm = normalizados(relevantes)
check("'Guardia Civil' sobrevive al filtro (no es vocabulario institucional genérico)", "guardia civil" in relevantes_norm, relevantes)
check("'Alhaurín el Grande' sobrevive al filtro", normalizar_texto("Alhaurín el Grande") in relevantes_norm, relevantes)

# Repite ahora el caso ENCADENADO de arriba a través del filtro: "Ayuntamiento"
# como palabra suelta debe desaparecer, pero la cadena larga completa
# ("Ayuntamiento de Alhaurín el Grande") no coincide LITERALMENTE con
# ningún stopword de la lista (que solo tiene "ayuntamiento" a secas), así
# que sobrevive tal cual -- comportamiento esperado, no un fallo del filtro.
extraidas_encadenadas = extraer_entidades("El Ayuntamiento de Alhaurín el Grande aprobó el presupuesto.")
relevantes_encadenadas_norm = normalizados(entidades_relevantes(extraidas_encadenadas))
check("'Ayuntamiento' suelto queda filtrado incluso en el caso encadenado", "ayuntamiento" not in relevantes_encadenadas_norm, relevantes_encadenadas_norm)

print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
