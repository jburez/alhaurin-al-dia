import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib.event_classification import (  # noqa: E402
    EXACT_DUPLICATE, NEAR_DUPLICATE, NEW_EVENT, SAME_EVENT_NO_NEW_INFO, SAME_EVENT_WITH_UPDATE,
    candidatos_relacionados, clasificar_relacion, evaluar_relacion,
)

fallos = []
todos_los_resultados_evaluar = []  # para el chequeo global de event_similarity en [0,1]


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


BASE_FECHA = datetime(2026, 8, 15, 0, 0, 0, tzinfo=timezone.utc)


def noticia(id_, fecha=None, titulo="", descripcion="", cuerpo="", categoria="Municipal"):
    return {
        "id": id_, "titulo": titulo, "descripcion": descripcion, "cuerpo": cuerpo,
        "categoria": categoria,
        "fecha": fecha.isoformat() if isinstance(fecha, datetime) else fecha,
    }


def tokens(prefijo, n):
    return [f"{prefijo}{i}" for i in range(n)]


def par_jaccard_controlado(n_compartidos, n_solo_a, n_solo_b, extra_compartido=None):
    """Construye dos textos con un jaccard de tokens significativos
    conocido de antemano: n_compartidos / (n_compartidos + n_solo_a + n_solo_b)."""
    compartidos = (extra_compartido or []) + tokens("tokensig", n_compartidos)
    solo_a = tokens("unicoa", n_solo_a)
    solo_b = tokens("unicob", n_solo_b)
    return " ".join(compartidos + solo_a), " ".join(compartidos + solo_b)


def evaluar(n, c, ventana_dias=None):
    r = evaluar_relacion(n, c, ventana_dias=ventana_dias)
    todos_los_resultados_evaluar.append(r)
    return r


print("========== EXACT_DUPLICATE ==========")
texto_a, texto_b = par_jaccard_controlado(80, 0, 0)  # 0 únicos -> textos idénticos
n1 = noticia("n1", BASE_FECHA, titulo=texto_a, categoria="Municipal")
c1 = noticia("c1", BASE_FECHA - timedelta(days=1), titulo=texto_b, categoria="Municipal")
r1 = evaluar(n1, c1)
check("texto idéntico -> EXACT_DUPLICATE", r1["relationship"] == EXACT_DUPLICATE, r1["relationship"])
check("texto idéntico -> duplicate_confidence=1.0", r1["duplicate_confidence"] == 1.0, r1["duplicate_confidence"])
check("texto idéntico -> texto_identico=True", r1["texto_identico"] is True)

texto_a2, texto_b2 = par_jaccard_controlado(38, 1, 1)  # 38/40 = 0.95 exacto, no idéntico
n2 = noticia("n2", BASE_FECHA, titulo=texto_a2, categoria="Municipal")
c2 = noticia("c2", BASE_FECHA - timedelta(days=1), titulo=texto_b2, categoria="Municipal")
r2 = evaluar(n2, c2)
check("jaccard=0.95 (no idéntico) -> EXACT_DUPLICATE heurístico", r2["relationship"] == EXACT_DUPLICATE, r2["jaccard_titulo"])
check("jaccard=0.95 -> texto_identico=False", r2["texto_identico"] is False)
check("jaccard=0.95 -> duplicate_confidence == jaccard_titulo", r2["duplicate_confidence"] == r2["jaccard_titulo"])

print()
print("========== NEAR_DUPLICATE ==========")
texto_a3, texto_b3 = par_jaccard_controlado(8, 2, 1)  # 8/11 = 0.727
n3 = noticia("n3", BASE_FECHA, titulo=texto_a3, categoria="Municipal")
c3 = noticia("c3", BASE_FECHA - timedelta(days=1), titulo=texto_b3, categoria="Municipal")
r3 = evaluar(n3, c3)
check("jaccard≈0.727 (>=0.72, <0.95) -> NEAR_DUPLICATE", r3["relationship"] == NEAR_DUPLICATE, r3["jaccard_titulo"])

print()
print("========== TEMPORAL ==========")
n_temp = noticia("n_temp", BASE_FECHA, titulo="x", categoria="Municipal")
c_14_exacto = noticia("c14", BASE_FECHA - timedelta(days=14), titulo="y", categoria="Municipal")
c_14_mas_1s = noticia("c14s", BASE_FECHA - timedelta(days=14, seconds=1), titulo="y", categoria="Municipal")
c_futuro = noticia("cfut", BASE_FECHA + timedelta(days=3), titulo="y", categoria="Municipal")

incluidos_pasado = {c["id"] for c in candidatos_relacionados(n_temp, [c_14_exacto, c_14_mas_1s, c_futuro], solo_pasado=True)}
check("antecedente a exactamente 14 días -> entra", "c14" in incluidos_pasado, incluidos_pasado)
check("antecedente a 14 días + 1 segundo -> NO entra", "c14s" not in incluidos_pasado, incluidos_pasado)
check("candidato futuro -> NO entra con solo_pasado=True", "cfut" not in incluidos_pasado, incluidos_pasado)

incluidos_simetrico = {c["id"] for c in candidatos_relacionados(n_temp, [c_14_exacto, c_14_mas_1s, c_futuro], solo_pasado=False)}
check("candidato futuro (3 días) -> SÍ entra con solo_pasado=False", "cfut" in incluidos_simetrico, incluidos_simetrico)

print()
print("========== SAME_EVENT: negativos ==========")
# misma categoría + cercanía, pero texto/evento distinto (sin entidades ni
# solapamiento textual real) -> NO debe ser SAME_EVENT.
texto_a4, texto_b4 = par_jaccard_controlado(0, 6, 6)  # jaccard_titulo = 0
n4 = noticia("n4", BASE_FECHA, titulo=texto_a4, categoria="Sucesos")
c4 = noticia("c4", BASE_FECHA - timedelta(days=1), titulo=texto_b4, categoria="Sucesos")
r4 = evaluar(n4, c4)
check("misma categoría + cercanía + texto distinto -> NO SAME_EVENT", r4["relationship"] is None, r4)

# entidad común SOLA (jaccard_titulo bajo, sin apoyo textual) -> NO SAME_EVENT.
titulo_n5 = "La Guardia Civil " + " ".join(tokens("unicoa", 6))
titulo_c5 = "La Guardia Civil " + " ".join(tokens("unicob", 6))
n5 = noticia("n5", BASE_FECHA, titulo=titulo_n5, categoria="Sucesos")
c5 = noticia("c5", BASE_FECHA - timedelta(days=1), titulo=titulo_c5, categoria="Tráfico y Movilidad")
r5 = evaluar(n5, c5)
check("entidad común SOLA (sin apoyo textual) -> NO SAME_EVENT", r5["relationship"] is None, (r5["jaccard_entidades"], r5["jaccard_titulo"]))
check("aun así, se reporta la entidad común para el shadow report", "guardia civil" in [e.lower() for e in r5["entidades_comunes"]] or r5["num_entidades_comunes"] > 0, r5["entidades_comunes"])

print()
print("========== SAME_EVENT: positivos ==========")
# A) entidad compartida + apoyo textual (categorías DISTINTAS a propósito,
# para confirmar que branch A no depende de la categoría).
compartidos_a, unicos_a, unicos_b = 3, 3, 3
texto_n6, texto_c6 = par_jaccard_controlado(compartidos_a, unicos_a, unicos_b, extra_compartido=["Guardia", "Civil"])
n6 = noticia("n6", BASE_FECHA, titulo=texto_n6, cuerpo="cuerpo corto", categoria="Sucesos")
c6 = noticia("c6", BASE_FECHA - timedelta(days=2), titulo=texto_c6, cuerpo="cuerpo corto", categoria="Tráfico y Movilidad")
r6 = evaluar(n6, c6)
check("entidad + apoyo textual, categoría distinta -> SAME_EVENT", r6["relationship"] in (SAME_EVENT_WITH_UPDATE, SAME_EVENT_NO_NEW_INFO), r6)
check("branch A: categoria_coincide=False confirmado", r6["categoria_coincide"] is False)

# B) similitud textual moderada + contexto (categoría) fuerte, SIN entidades.
texto_n7, texto_c7 = par_jaccard_controlado(6, 3, 3)  # jaccard = 6/12 = 0.5 (moderado, <0.72)
n7 = noticia("n7", BASE_FECHA, titulo=texto_n7, cuerpo="cuerpo corto", categoria="Obras y Servicios")
c7 = noticia("c7", BASE_FECHA - timedelta(days=1), titulo=texto_c7, cuerpo="cuerpo corto", categoria="Obras y Servicios")
r7 = evaluar(n7, c7)
check("texto moderado + misma categoría (sin entidades) -> SAME_EVENT", r7["relationship"] in (SAME_EVENT_WITH_UPDATE, SAME_EVENT_NO_NEW_INFO), r7)
check("branch B: jaccard_entidades=0 confirmado (no depende de entidades)", r7["jaccard_entidades"] == 0.0, r7["jaccard_entidades"])

print()
print("========== UPDATE vs NO_NEW_INFO (dirección: la NOTICIA NUEVA debe ser más rica) ==========")
cuerpo_corto = "Resumen breve del suceso." * 2
cuerpo_largo = "Resumen breve del suceso. " + ("Información adicional detallada sobre el desarrollo de los hechos y las circunstancias del caso. " * 4)

# noticia nueva (n) sustancialmente más rica que el antecedente (c) -> WITH_UPDATE
n8 = noticia("n8", BASE_FECHA, titulo=texto_n6, cuerpo=cuerpo_largo, categoria="Sucesos")
c8 = noticia("c8", BASE_FECHA - timedelta(days=1), titulo=texto_c6, cuerpo=cuerpo_corto, categoria="Sucesos")
r8 = evaluar(n8, c8)
check("noticia nueva más rica que el antecedente -> WITH_UPDATE", r8["relationship"] == SAME_EVENT_WITH_UPDATE, (len(cuerpo_largo), len(cuerpo_corto), r8["relationship"]))

# noticia nueva (n) igual o MENOS rica que el antecedente (c) -> NO_NEW_INFO
n9 = noticia("n9", BASE_FECHA, titulo=texto_n6, cuerpo=cuerpo_corto, categoria="Sucesos")
c9 = noticia("c9", BASE_FECHA - timedelta(days=1), titulo=texto_c6, cuerpo=cuerpo_largo, categoria="Sucesos")
r9 = evaluar(n9, c9)
check("noticia nueva menos rica que el antecedente -> NO_NEW_INFO", r9["relationship"] == SAME_EVENT_NO_NEW_INFO, r9["relationship"])

print()
print("========== RANKING ==========")
pool_ranking = [c1, c3, c6]  # c1=EXACT (vs n1), pero probamos clasificar_relacion sobre una noticia común
noticia_ranking = noticia("nr", BASE_FECHA, titulo=texto_a, categoria="Municipal")  # texto EXACTO a c1/n1
candidato_exact = noticia("cr_exact", BASE_FECHA - timedelta(days=1), titulo=texto_a, categoria="Municipal")
candidato_near = noticia("cr_near", BASE_FECHA - timedelta(days=1), titulo=texto_b3, categoria="Municipal")
candidato_same_event = noticia("cr_same", BASE_FECHA - timedelta(days=1), titulo=texto_c7, cuerpo="x", categoria="Obras y Servicios")
resultado_top = clasificar_relacion(noticia_ranking, [candidato_exact, candidato_near, candidato_same_event])
check("EXACT gana a NEAR y a SAME_EVENT en el ranking", resultado_top["relationship"] == EXACT_DUPLICATE, resultado_top["relationship"])

noticia_ranking2 = noticia("nr2", BASE_FECHA, titulo=texto_a3, categoria="Municipal")  # texto de NEAR (c3)
resultado_top2 = clasificar_relacion(noticia_ranking2, [candidato_near, candidato_same_event])
check("NEAR gana a SAME_EVENT en el ranking", resultado_top2["relationship"] == NEAR_DUPLICATE, resultado_top2["relationship"])

print()
print("========== ROBUSTEZ ==========")
check("fecha inválida en el candidato -> excluido", candidatos_relacionados(n_temp, [noticia("cx", "no-es-una-fecha", titulo="z")]) == [])
check("noticia sin fecha -> sin candidatos", candidatos_relacionados(noticia("nsf", None, titulo="z"), [c_14_exacto]) == [])
check("pool vacío -> sin candidatos", candidatos_relacionados(n_temp, []) == [])
mismo_id = noticia("n_temp", BASE_FECHA - timedelta(days=1), titulo="z")  # mismo id que n_temp
check("mismo id -> excluido aunque esté en la ventana", mismo_id not in candidatos_relacionados(n_temp, [mismo_id]))

resultado_vacio = clasificar_relacion(n_temp, [])
check("clasificar_relacion con pool vacío -> NEW_EVENT", resultado_vacio["relationship"] == NEW_EVENT, resultado_vacio["relationship"])

print()
print("=== event_similarity siempre en [0, 1] (sobre todos los pares evaluados arriba) ===")
fuera_de_rango = [r for r in todos_los_resultados_evaluar if not (0.0 <= r["event_similarity"] <= 1.0)]
check(f"event_similarity ∈ [0,1] en los {len(todos_los_resultados_evaluar)} pares evaluados", not fuera_de_rango, fuera_de_rango)

print()
print("========== Casos reales: entidades locales frecuentes no bastan solas ==========")
titulo_local_a = "El Ayuntamiento de Alhaurín el Grande organiza una jornada en Málaga sobre turismo"
titulo_local_b = "La Diputación de Málaga celebra un congreso en Alhaurín el Grande sobre agricultura"
n10 = noticia("n10", BASE_FECHA, titulo=titulo_local_a, cuerpo="Texto sobre turismo y patrimonio local.", categoria="Turismo y Patrimonio")
c10 = noticia("c10", BASE_FECHA - timedelta(days=3), titulo=titulo_local_b, cuerpo="Texto sobre agricultura y campo.", categoria="Comercio y Empresa")
r10 = evaluar(n10, c10)
check(
    "'Alhaurín'/'Grande'/'Málaga' compartidos NO bastan solos para SAME_EVENT (temas realmente distintos)",
    r10["relationship"] is None,
    (r10["entidades_comunes"], r10["jaccard_titulo"], r10["jaccard_entidades"]),
)

print()
print("========== update_evaluable ==========")
cuerpo_largo = "Contenido con longitud suficiente para superar el umbral cuerpo_longitud_min de reglas-editoriales.json, repetido varias veces para asegurar la longitud." * 2
cuerpo_vacio = ""

n_eval_ambos = noticia("n_eval_ambos", BASE_FECHA, titulo=texto_n6, cuerpo=cuerpo_largo, categoria="Sucesos")
c_eval_ambos = noticia("c_eval_ambos", BASE_FECHA - timedelta(days=1), titulo=texto_c6, cuerpo=cuerpo_largo, categoria="Sucesos")
r_eval_ambos = evaluar(n_eval_ambos, c_eval_ambos)
check("ambos con cuerpo suficiente -> update_evaluable=True", r_eval_ambos["update_evaluable"] is True, r_eval_ambos["update_evaluable"])

n_eval_vacio_ambos = noticia("n_eval_vacio", BASE_FECHA, titulo=texto_n6, cuerpo=cuerpo_vacio, categoria="Sucesos")
c_eval_vacio_ambos = noticia("c_eval_vacio", BASE_FECHA - timedelta(days=1), titulo=texto_c6, cuerpo=cuerpo_vacio, categoria="Sucesos")
r_eval_vacio_ambos = evaluar(n_eval_vacio_ambos, c_eval_vacio_ambos)
check("ambos sin cuerpo (legacy típico) -> update_evaluable=False", r_eval_vacio_ambos["update_evaluable"] is False, r_eval_vacio_ambos["update_evaluable"])
check("además, ambos sin cuerpo -> NO_NEW_INFO (comportamiento existente, sin cambios)", r_eval_vacio_ambos["relationship"] == SAME_EVENT_NO_NEW_INFO, r_eval_vacio_ambos["relationship"])

n_eval_solo_nueva = noticia("n_eval_solo_nueva", BASE_FECHA, titulo=texto_n6, cuerpo=cuerpo_largo, categoria="Sucesos")
c_eval_solo_nueva = noticia("c_eval_solo_nueva", BASE_FECHA - timedelta(days=1), titulo=texto_c6, cuerpo=cuerpo_vacio, categoria="Sucesos")
r_eval_solo_nueva = evaluar(n_eval_solo_nueva, c_eval_solo_nueva)
check("solo la nueva tiene cuerpo suficiente -> update_evaluable=False (hace falta AMBOS lados)", r_eval_solo_nueva["update_evaluable"] is False, r_eval_solo_nueva["update_evaluable"])

n_eval_solo_antecedente = noticia("n_eval_solo_ante", BASE_FECHA, titulo=texto_n6, cuerpo=cuerpo_vacio, categoria="Sucesos")
c_eval_solo_antecedente = noticia("c_eval_solo_ante2", BASE_FECHA - timedelta(days=1), titulo=texto_c6, cuerpo=cuerpo_largo, categoria="Sucesos")
r_eval_solo_antecedente = evaluar(n_eval_solo_antecedente, c_eval_solo_antecedente)
check("solo el antecedente tiene cuerpo suficiente -> update_evaluable=False", r_eval_solo_antecedente["update_evaluable"] is False, r_eval_solo_antecedente["update_evaluable"])

resultado_new_event = clasificar_relacion(noticia("n_solo", BASE_FECHA, titulo="x", categoria="Municipal"), [])
check("NEW_EVENT trae update_evaluable=False por defecto", resultado_new_event["update_evaluable"] is False, resultado_new_event["update_evaluable"])

print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
