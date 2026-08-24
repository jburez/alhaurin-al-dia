"""Candidate retrieval + clasificación de relación entre noticias (Fase 2,
task #16). SOLO shadow mode: ningún código de producción llama todavía a
este módulo -- se calibra primero contra data/noticias.json +
data/noticias-archivo.json reales (scripts/shadow_editorial_pipeline.py,
de solo lectura) antes de cablearse en obtener_noticias()/guardar_noticias().

Este módulo se centra ÚNICAMENTE en relación entre eventos (relationship +
señales de apoyo). No incluye decision ni headline_quality -- eso lo
combinará el shadow runner (o, más adelante, el pipeline real) al juntar
esta clasificación con evaluar_titulo().

Cinco relaciones posibles, usadas tal cual en logs/informes:

- NEW_EVENT: ningún candidato dentro de la ventana temporal calificó como
  relacionado -- resultado a nivel de noticia completa (no de un par),
  lo decide clasificar_relacion().
- EXACT_DUPLICATE: texto (normalizado) idéntico [determinista,
  duplicate_confidence=1.0] o similitud Jaccard de título+entradilla >=
  umbral jaccard_exact_duplicate [heurístico, duplicate_confidence =
  jaccard]. jaccard_exact_duplicate (0.95 en data/reglas-editoriales.json)
  es PROVISIONAL/CALIBRABLE -- nada fuera de shadow mode depende de él.
- NEAR_DUPLICATE: Jaccard >= jaccard_near_duplicate (0.72) pero por debajo
  de jaccard_exact_duplicate.
- SAME_EVENT_WITH_UPDATE / SAME_EVENT_NO_NEW_INFO: candidato que supera el
  gate de "mismo evento" (ver _es_mismo_evento(), combinación de al menos
  DOS familias de señal -- nunca un único score dominado por una sola)
  pero con redacción distinta (Jaccard de título por debajo de
  jaccard_near_duplicate). Se distinguen por si la NOTICIA NUEVA aporta
  contenido sustancialmente más rico que el candidato ya conocido, o no
  (_aporta_info_nueva(), heurística deliberadamente simple).

Candidate retrieval: SOLO ventana temporal como hard filter. Categoría,
entidades en común, similitud textual y proximidad temporal son señales
de ranking dentro de evaluar_relacion(), NUNCA condiciones de existencia
del candidato -- prioriza recall: un accidente de tráfico (categoría
Sucesos) y el corte de carretera consecuente (categoría Tráfico y
Movilidad) deben poder compararse igual que si compartieran categoría.

Semántica temporal por defecto = orientada a producción: una noticia
NUEVA solo se compara contra ANTECEDENTES (candidatos con fecha <= la
suya, dentro de los `ventana_dias` anteriores) -- nunca contra
publicaciones "futuras" que en el momento real de decidir no existirían
todavía. candidatos_relacionados(solo_pasado=False) habilita la ventana
SIMÉTRICA ±ventana_dias, reservada para diagnóstico histórico en el
shadow script, nunca para la semántica principal de clasificación.

Por qué "mismo evento" exige DOS familias de señal, no un score único:
el extractor heurístico de entidades (editorial_rules.extraer_entidades)
puede producir entidades locales omnipresentes en casi cualquier noticia
del sitio (p. ej. "Alhaurín", "Málaga" si algún día se cuelan en
entidades_relevantes()) -- un jaccard_entidades alto por sí solo, sin
ningún apoyo textual, no debe bastar para declarar dos eventos distintos
como el mismo. Por eso _es_mismo_evento() exige combinación (ver más
abajo), no un umbral único sobre event_similarity.

event_similarity es un score compuesto PROVISIONAL (pesos declarados
abajo, sujetos a calibración con el shadow run) -- se usa SOLO para
desempatar/rankear entre candidatos que YA calificaron como "mismo
evento" por la regla de combinación, nunca como criterio de calificación
en sí mismo.

--- ESTADO AL CIERRE DE TASK #16 (shadow mode, sin cambios en producción) ---

Candidate retrieval: implementado, solo ventana temporal como hard filter,
probado.

EXACT_DUPLICATE: igualdad normalizada determinista + 0.95 heurístico
provisional -- el shadow run (distribución de jaccard_titulo alrededor de
0.95, prácticamente vacía) no muestra motivo para cambiarlo.

NEAR_DUPLICATE: 0.72 provisional, sin cambios -- no se ha revisado
todavía en detalle la zona cercana a 0.72 (queda para la calibración
final).

SAME_EVENT_*: funcional en shadow, NO aprobado para bloqueo en
producción. La rama A actual (entidades>=0.15 AND texto>=0.15) tiene
falsos positivos conocidos (ver muestra de shadow run). Se simuló una
rama A adaptativa -- recupera falsos negativos reales (XLIII Noche
Flamenca, 38/38) pero introduce falsos positivos NUEVOS (p. ej. episodios
distintos de "NOTICIAS ATV" cruzándose por palabras de plantilla) incluso
excluyendo alhaurín/grande/málaga del cálculo. Esa rama adaptativa NO se
ha aplicado al clasificador real -- sigue siendo (jaccard_entidades>=0.15
AND jaccard_titulo>=0.15) en producción/shadow, sin cambios.

Problema raíz identificado (no resuelto aquí, deliberadamente): no es
solo cuestión de mover thresholds -- es la calidad/discriminación de las
entidades extraídas. Un jaccard_entidades=1.0 puede venir de una firma de
evento muy específica (XLIII, Noche Flamenca, misma fecha) o de
vocabulario de plantilla/serie/mes/localidad (Noticias ATV, actualidad,
agosto) que no identifica ningún evento -- un umbral de jaccard_entidades
por sí solo no distingue ambos casos. Añadir ad hoc "alhaurín", "grande",
"málaga", "noticias", "actualidad", "agosto", "atv" a stopwords_entidades
resolvería ESTE dataset concreto pero es sobreajuste: aparecería la
siguiente familia de términos genéricos. Se deja fuera de esta task a
propósito.

UPDATE (WITH_UPDATE vs NO_NEW_INFO): update_evaluable implementado (True
solo si AMBOS lados tienen cuerpo >= cuerpo_longitud_min). El histórico
legacy es insuficiente para calibrar: los 10 casos WITH_UPDATE del
dataset son TODOS update_evaluable=False, y de 4840 NO_NEW_INFO solo 2
son evaluables (y esos 2 coinciden con un falso positivo ya identificado
de rama A). El umbral 1.25x+120 caracteres de _aporta_info_nueva() sigue
provisional y NO debe usarse como regla de producción todavía.

Ramas B/C: sin cambios. Muestras cercanas a su frontera (jaccard_titulo
0.30-0.39) recogidas pero no analizadas en profundidad -- queda para la
calibración final.

Pipeline: cero wiring de SAME_EVENT/candidate retrieval a decisiones
reales de publicación. obtener_noticias()/guardar_noticias() (task #15)
no importan ni llaman a este módulo.

Deuda documentada para la calibración final (antes de cualquier
activación semántica en producción):
- mejorar la discriminación de entidades con una estrategia general
  (frecuencia/IDF sobre el corpus, o equivalente) en vez de una lista
  creciente de stopwords ad hoc -- entidad frecuente/genérica -> menor
  peso discriminativo, entidad rara/específica -> mayor peso;
- excluir conceptualmente vocabulario de plantilla/serie/mes/localidad
  que no identifica un evento (no solo topónimos: nombres de programas
  recurrentes, meses...);
- acumular suficientes noticias con cuerpo real (no legacy vacío) para
  poder calibrar WITH_UPDATE vs NO_NEW_INFO con datos genuinos;
- repetir el shadow run completo con los cambios anteriores antes de
  activar cualquier bloqueo/fusión semántica en producción."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from lib.editorial_rules import (
    entidades_relevantes,
    extraer_entidades,
    normalizar_texto,
    similitud_jaccard,
    umbral,
)

NEW_EVENT = "NEW_EVENT"
EXACT_DUPLICATE = "EXACT_DUPLICATE"
NEAR_DUPLICATE = "NEAR_DUPLICATE"
SAME_EVENT_NO_NEW_INFO = "SAME_EVENT_NO_NEW_INFO"
SAME_EVENT_WITH_UPDATE = "SAME_EVENT_WITH_UPDATE"

# --- event_similarity: score compuesto PROVISIONAL/CALIBRABLE (task #16,
# shadow run). Prioridad conceptual: entidades = señal fuerte, texto =
# señal relevante, categoría/tiempo = señales débiles. Pesos suman 1.0
# (más un min(1.0, ...) defensivo al calcularlo, por si un futuro ajuste
# de pesos rompe la invariante sin querer).
_PESO_ENTIDADES = 0.45
_PESO_TEXTO = 0.35
_PESO_CATEGORIA = 0.10
_PESO_TEMPORAL = 0.10

# --- Gate de "mismo evento": exige combinación de al menos DOS familias
# de señal, nunca un único score dominado por una sola (ver docstring del
# módulo). Cualquiera de las dos combinaciones basta:
#   A) entidad compartida real                Y  algo de apoyo textual
#   B) similitud textual moderada              Y  categoría o proximidad
#                                                  temporal fuerte
# Todos los umbrales de esta sección son PROVISIONALES -- de partida para
# el primer shadow run, se recalibran con la distribución real observada
# contra los 671 históricos antes de que nada dependa de ellos fuera de
# shadow mode.
_UMBRAL_ENTIDADES_APOYO = 0.15
_UMBRAL_TEXTO_APOYO = 0.15
_UMBRAL_TEXTO_MODERADO = 0.30
_UMBRAL_PROXIMIDAD_TEMPORAL_FUERTE = 0.5


def _parsear_fecha(valor: Any) -> datetime | None:
    try:
        fecha = datetime.fromisoformat(str(valor).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if fecha.tzinfo is None:
        fecha = fecha.replace(tzinfo=timezone.utc)
    return fecha


def _diferencia_dias(fecha_a: datetime | None, fecha_b: datetime | None) -> float | None:
    """Diferencia en días como float exacto (total_seconds()/86400), NO
    timedelta.days -- .days trunca hacia -inf y da resultados asimétricos
    con diferencias negativas (14 días y 23h podría contarse como 14)."""
    if fecha_a is None or fecha_b is None:
        return None
    return (fecha_a - fecha_b).total_seconds() / 86400


def _texto_comparable(noticia: dict[str, Any]) -> str:
    return f"{noticia.get('titulo', '')} {noticia.get('descripcion') or noticia.get('resumen') or ''}"


def _entidades_relevantes_normalizadas(noticia: dict[str, Any]) -> set[str]:
    crudas = extraer_entidades(noticia.get("titulo", ""), noticia.get("cuerpo", ""))
    return {normalizar_texto(e) for e in entidades_relevantes(crudas)}


def calcular_event_fingerprint(noticia: dict[str, Any]) -> str:
    """Cadena informativa para AGRUPAR visualmente en el informe de shadow
    run -- entidades relevantes ordenadas + categoría normalizada. NUNCA
    se usa como clave de igualdad de evento ni participa en
    candidatos_relacionados()/evaluar_relacion(): deliberadamente NO
    incluye la fecha (una actualización al día siguiente del mismo
    acontecimiento no debe fallar una comparación de fingerprint por eso)."""
    entidades = sorted(_entidades_relevantes_normalizadas(noticia))
    categoria = normalizar_texto(noticia.get("categoria", ""))
    return f"{categoria}|{'+'.join(entidades)}"


def candidatos_relacionados(
    noticia: dict[str, Any],
    pool: list[dict[str, Any]],
    ventana_dias: float | None = None,
    solo_pasado: bool = True,
) -> list[dict[str, Any]]:
    """HARD FILTER: SOLO ventana temporal -- única condición de existencia
    del candidato. Ninguna otra señal (categoría, entidades) descarta un
    candidato aquí; son señales de ranking dentro de evaluar_relacion().

    solo_pasado=True (por defecto, semántica de producción/clasificar_relacion()):
    solo antecedentes -- 0 <= (fecha_noticia - fecha_candidato) <=
    ventana_dias. Una noticia nueva se compara contra lo YA conocido,
    nunca contra publicaciones "futuras" que en el momento real de
    decidir no existirían todavía.

    solo_pasado=False: ventana SIMÉTRICA ±ventana_dias -- reservada para
    diagnóstico histórico en el shadow script, nunca para la semántica
    principal de clasificación.

    Sin fecha parseable en la noticia o en un candidato, ESE candidato se
    descarta: no se puede aplicar la ventana con seguridad, mejor no
    compararlo que arriesgar un falso positivo/negativo silencioso.

    Defensa adicional (además de excluir por id igual): se excluye por
    identidad de objeto (`is`) incluso si la noticia no tiene id -- un
    llamador que pase datos incompletos (p. ej. sin id) nunca debe poder
    autoclasificarse a sí mismo como su propio duplicado exacto."""
    ventana_dias = umbral("ventana_dias_duplicado") if ventana_dias is None else ventana_dias
    fecha_noticia = _parsear_fecha(noticia.get("fecha"))
    id_noticia = noticia.get("id")
    if fecha_noticia is None:
        return []

    candidatos = []
    for otro in pool:
        if otro is noticia:
            continue
        if id_noticia and otro.get("id") == id_noticia:
            continue
        fecha_otro = _parsear_fecha(otro.get("fecha"))
        if fecha_otro is None:
            continue
        diferencia = _diferencia_dias(fecha_noticia, fecha_otro)
        if solo_pasado:
            if diferencia < 0 or diferencia > ventana_dias:
                continue
        elif abs(diferencia) > ventana_dias:
            continue
        candidatos.append(otro)
    return candidatos


def _aporta_info_nueva(noticia_nueva: dict[str, Any], candidato_antecedente: dict[str, Any]) -> bool:
    """Heurística deliberadamente simple (sujeta a calibración con el
    shadow run): la NOTICIA NUEVA (la candidata que se está evaluando
    ahora) aporta información nueva respecto al CANDIDATO_ANTECEDENTE (la
    noticia ya conocida/publicada) si el cuerpo de la primera es
    sustancialmente más largo (>=25% y al menos 120 caracteres más) que el
    del antecedente -- proxy débil de "la nueva cuenta algo que la ya
    publicada no contaba", no un análisis semántico real.

    Dirección importante: es la NOTICIA NUEVA la que debe ser más rica
    para contar como actualización. Si es el antecedente el más completo,
    la nueva no aporta nada nuevo, aunque hable del mismo evento."""
    cuerpo_antecedente = len(candidato_antecedente.get("cuerpo", "") or "")
    cuerpo_nueva = len(noticia_nueva.get("cuerpo", "") or "")
    if cuerpo_antecedente == 0:
        return cuerpo_nueva > 0
    return cuerpo_nueva >= cuerpo_antecedente * 1.25 and (cuerpo_nueva - cuerpo_antecedente) >= 120


def _update_evaluable(noticia_nueva: dict[str, Any], candidato_antecedente: dict[str, Any]) -> bool:
    """True solo si AMBOS lados tienen cuerpo suficiente (>=
    cuerpo_longitud_min, el mismo umbral ya usado como mínimo publicable
    en data/reglas-editoriales.json) para que _aporta_info_nueva() sea una
    comparación con sentido. data/noticias-archivo.json (histórico legacy)
    tiene 'cuerpo' vacío en prácticamente todas sus entradas -- comparar
    0 caracteres contra 0 caracteres NO significa "sin información nueva",
    significa que no hay datos con los que evaluarlo. Esta señal permite
    al informe de shadow run (y a cualquier calibración futura del umbral
    1.25x+120 caracteres) distinguir "confirmado sin novedad" de "no se
    pudo evaluar por falta de cuerpo legacy" -- nunca se debe presentar lo
    segundo como evidencia de que NO_NEW_INFO está bien calibrado."""
    minimo = umbral("cuerpo_longitud_min")
    cuerpo_nueva = len(noticia_nueva.get("cuerpo", "") or "")
    cuerpo_antecedente = len(candidato_antecedente.get("cuerpo", "") or "")
    return cuerpo_nueva >= minimo and cuerpo_antecedente >= minimo


def _es_mismo_evento(jaccard_entidades: float, jaccard_titulo: float, categoria_coincide: bool, proximidad_temporal: float) -> bool:
    """Gate de "mismo evento": exige combinación de DOS familias de señal
    (ver constantes _UMBRAL_* arriba), nunca un score único dominado por
    una sola familia -- ver docstring del módulo para el razonamiento
    (entidades locales omnipresentes no deben bastar solas)."""
    calidad_entidades = jaccard_entidades >= _UMBRAL_ENTIDADES_APOYO
    apoyo_textual = jaccard_titulo >= _UMBRAL_TEXTO_APOYO
    textual_moderado = jaccard_titulo >= _UMBRAL_TEXTO_MODERADO
    contexto_fuerte = categoria_coincide or proximidad_temporal >= _UMBRAL_PROXIMIDAD_TEMPORAL_FUERTE
    return (calidad_entidades and apoyo_textual) or (textual_moderado and contexto_fuerte)


def evaluar_relacion(
    noticia: dict[str, Any], candidato: dict[str, Any], ventana_dias: float | None = None
) -> dict[str, Any]:
    """Calcula TODAS las señales para un par (noticia, candidato) que ya
    sobrevivió el hard filter de ventana temporal -- incluso si el par
    termina sin relación significativa, las señales crudas se devuelven
    para el informe de shadow run (calibración: cambiar pesos/umbrales
    después sin tener que volver a ejecutar nada).

    relationship es None cuando ninguna de las 4 relaciones "positivas"
    aplica (candidato dentro de la ventana pero sin relación relevante) --
    NEW_EVENT es un resultado a nivel de noticia completa, no de un par
    individual; lo decide clasificar_relacion()."""
    ventana_dias = umbral("ventana_dias_duplicado") if ventana_dias is None else ventana_dias

    texto_a = _texto_comparable(noticia)
    texto_b = _texto_comparable(candidato)
    jaccard_titulo = similitud_jaccard(texto_a, texto_b)
    texto_identico = bool(normalizar_texto(texto_a)) and normalizar_texto(texto_a) == normalizar_texto(texto_b)

    entidades_a = _entidades_relevantes_normalizadas(noticia)
    entidades_b = _entidades_relevantes_normalizadas(candidato)
    entidades_comunes = sorted(entidades_a & entidades_b)
    jaccard_entidades = (
        len(entidades_a & entidades_b) / len(entidades_a | entidades_b)
        if (entidades_a or entidades_b) else 0.0
    )

    categoria_a = normalizar_texto(noticia.get("categoria", ""))
    categoria_b = normalizar_texto(candidato.get("categoria", ""))
    categoria_coincide = bool(categoria_a) and categoria_a == categoria_b

    fecha_noticia = _parsear_fecha(noticia.get("fecha"))
    fecha_candidato = _parsear_fecha(candidato.get("fecha"))
    diferencia = _diferencia_dias(fecha_noticia, fecha_candidato)
    dias_diferencia = abs(diferencia) if diferencia is not None else None
    proximidad_temporal = (
        max(0.0, 1.0 - (dias_diferencia / ventana_dias)) if dias_diferencia is not None and ventana_dias else 0.0
    )

    event_similarity = min(1.0, (
        _PESO_ENTIDADES * jaccard_entidades
        + _PESO_TEXTO * jaccard_titulo
        + _PESO_CATEGORIA * (1.0 if categoria_coincide else 0.0)
        + _PESO_TEMPORAL * proximidad_temporal
    ))

    resultado: dict[str, Any] = {
        "candidato_id": candidato.get("id"),
        "jaccard_titulo": round(jaccard_titulo, 4),
        "jaccard_entidades": round(jaccard_entidades, 4),
        "entidades_comunes": entidades_comunes,
        "num_entidades_comunes": len(entidades_comunes),
        "categoria_coincide": categoria_coincide,
        "dias_diferencia": round(dias_diferencia, 4) if dias_diferencia is not None else None,
        "proximidad_temporal": round(proximidad_temporal, 4),
        "texto_identico": texto_identico,
        "event_similarity": round(event_similarity, 4),
        "duplicate_confidence": 0.0,
        "update_evaluable": _update_evaluable(noticia, candidato),
        "relationship": None,
    }

    if texto_identico:
        resultado["relationship"] = EXACT_DUPLICATE
        resultado["duplicate_confidence"] = 1.0
    elif jaccard_titulo >= umbral("jaccard_exact_duplicate"):
        resultado["relationship"] = EXACT_DUPLICATE
        resultado["duplicate_confidence"] = round(jaccard_titulo, 4)
    elif jaccard_titulo >= umbral("jaccard_near_duplicate"):
        resultado["relationship"] = NEAR_DUPLICATE
        resultado["duplicate_confidence"] = round(jaccard_titulo, 4)
    elif _es_mismo_evento(jaccard_entidades, jaccard_titulo, categoria_coincide, proximidad_temporal):
        resultado["relationship"] = (
            SAME_EVENT_WITH_UPDATE if _aporta_info_nueva(noticia, candidato) else SAME_EVENT_NO_NEW_INFO
        )
        resultado["duplicate_confidence"] = round(jaccard_titulo, 4)

    return resultado


def clasificar_relacion(
    noticia: dict[str, Any], pool: list[dict[str, Any]], ventana_dias: float | None = None
) -> dict[str, Any]:
    """Orquesta candidate retrieval (solo_pasado=True, semántica de
    producción) + evaluación, y devuelve el resultado a nivel de noticia:
    el par con mayor duplicate_confidence (desempate por event_similarity)
    entre los que sí calificaron, o NEW_EVENT si ninguno lo hizo.
    candidatos_evaluados/candidatos_relacionados viajan en el resultado
    para el informe de shadow run (cuánto recall se perdería si
    candidatos_relacionados() añadiera algún día un hard gate adicional)."""
    ventana_dias = umbral("ventana_dias_duplicado") if ventana_dias is None else ventana_dias
    candidatos = candidatos_relacionados(noticia, pool, ventana_dias=ventana_dias, solo_pasado=True)
    evaluaciones = [evaluar_relacion(noticia, c, ventana_dias=ventana_dias) for c in candidatos]
    calificadas = [e for e in evaluaciones if e["relationship"] is not None]

    if not calificadas:
        return {
            "relationship": NEW_EVENT,
            "duplicate_confidence": 0.0,
            "event_similarity": 0.0,
            "texto_identico": False,
            "candidato_id": None,
            "jaccard_titulo": 0.0,
            "jaccard_entidades": 0.0,
            "entidades_comunes": [],
            "num_entidades_comunes": 0,
            "categoria_coincide": False,
            "dias_diferencia": None,
            "proximidad_temporal": 0.0,
            "update_evaluable": False,
            "candidatos_evaluados": len(evaluaciones),
            "candidatos_relacionados": 0,
        }

    mejor = dict(max(calificadas, key=lambda e: (e["duplicate_confidence"], e["event_similarity"])))
    mejor["candidatos_evaluados"] = len(evaluaciones)
    mejor["candidatos_relacionados"] = len(calificadas)
    return mejor
