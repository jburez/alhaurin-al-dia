#!/usr/bin/env python3
"""Shadow run offline de candidate retrieval + clasificación de relación
(Fase 2, task #16). SOLO LECTURA: no escribe ni modifica
data/noticias.json, data/noticias-archivo.json, data/noticias-editorial.json
ni ningún otro artefacto. Ejecuta exactamente el mismo código de
scripts/lib/event_classification.py que se cableará más adelante en el
pipeline real, contra los datos reales, para calibrar sus umbrales/pesos
(todos declarados PROVISIONALES en ese módulo) antes de activar cualquier
bloqueo semántico. No conecta con obtener_noticias()/guardar_noticias() ni
con el flujo de publicación -- se ejecuta de forma completamente
independiente.

Fail-closed en la carga y en la integridad de identidad: una herramienta
de calibración que convirtiera silenciosamente un fichero corrupto/
ausente/mal formado en "0 noticias", o que tratara dos registros
distintos como el mismo (o el mismo registro como dos distintos),
produciría un informe aparentemente válido pero engañoso. Cualquier
problema de carga o de integridad aborta con mensaje claro, sin modificar
nada.

Nota sobre identidad en el archivo histórico: data/noticias-archivo.json
(671 entradas reales al escribir esto) nunca tuvo campo 'id' -- solo
data/noticias.json (activas) lo tiene. 'pagina' sí está presente y es
única en el archivo, así que _shadow_identity() la usa como fallback
SOLO dentro de este script, namespaceada (id:.../pagina:...) para que un
id real y una pagina no puedan colisionar por casualidad. Nunca se
inventa un id, nunca se escribe nada en noticias-archivo.json, y esta
identidad de sombra no tiene ninguna relación con la identidad real de
task #15 (sourceIdentity/generar_id). Investigar por qué el archivo
carece de 'id' (¿archive-orphan-news.js no lo extrae del HTML? -- ver
deuda técnica ya documentada en el plan de Fase 2) queda como tarea
separada; no bloquea este shadow run.
"""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = BASE_DIR / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from lib.event_classification import (  # noqa: E402
    EXACT_DUPLICATE,
    NEAR_DUPLICATE,
    NEW_EVENT,
    SAME_EVENT_NO_NEW_INFO,
    SAME_EVENT_WITH_UPDATE,
    candidatos_relacionados,
    evaluar_relacion,
)

NOTICIAS_FILE = BASE_DIR / "data" / "noticias.json"
ARCHIVO_FILE = BASE_DIR / "data" / "noticias-archivo.json"

BINS = ["0.70-0.79", "0.80-0.89", "0.90-0.94", "0.95-0.99", "1.00"]


class ShadowPipelineError(Exception):
    """Fallo de carga/integridad del shadow run. Nunca se captura para
    degradar a un dataset vacío o incompleto -- aborta el script con
    mensaje claro."""


def _cargar(ruta: Path) -> list[dict]:
    """Fail-closed: fichero ausente, JSON inválido, o raíz que no es una
    lista -> ShadowPipelineError explícito. Nunca se convierte en []
    silenciosamente."""
    try:
        contenido = ruta.read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ShadowPipelineError(f"No existe {ruta} -- el shadow run requiere ambos ficheros de datos reales.") from exc
    try:
        datos = json.loads(contenido)
    except json.JSONDecodeError as exc:
        raise ShadowPipelineError(f"{ruta} contiene JSON inválido: {exc}") from exc
    if not isinstance(datos, list):
        raise ShadowPipelineError(f"{ruta} no contiene una lista de noticias (tipo real: {type(datos).__name__}).")
    return datos


def _shadow_identity(noticia: dict) -> str:
    """Identidad SOLO para este shadow run -- nunca se persiste, nunca se
    usa como id real, nunca modifica noticias-archivo.json ni tiene
    relación con la identidad de task #15. Prioriza 'id' cuando existe;
    'pagina' es fallback (namespaceado con el prefijo 'pagina:' para que
    nunca colisione por casualidad con un 'id:' real) solo para las
    entradas legacy del archivo que nunca tuvieron 'id'."""
    if noticia.get("id"):
        return f"id:{noticia['id']}"
    if noticia.get("pagina"):
        return f"pagina:{noticia['pagina']}"
    raise ShadowPipelineError(
        f"Noticia sin 'id' NI 'pagina' -- no se puede calcular ni siquiera una identidad de "
        f"shadow run: {noticia.get('titulo', '<sin título>')!r}"
    )


def _deduplicar_pool(activas: list[dict], archivo: list[dict]) -> tuple[list[dict], int, int, int]:
    """Evita contar dos veces la misma noticia si su identidad de sombra
    (ver _shadow_identity) aparece tanto en activas como en archivo (o
    repetida dentro del mismo fichero) -- sesgaría distribución de
    relaciones, número de pares, ejemplos y bins de Jaccard. Prioriza
    SIEMPRE la primera aparición (activas primero, después archivo en
    orden) cuando son compatibles (misma 'pagina').

    Devuelve (pool_deduplicado, num_duplicados, num_por_id_real,
    num_por_pagina_fallback).

    Fail-closed en tres casos:
    - identidad de sombra incompatible entre dos apariciones (misma
      identidad, distinta 'pagina') -> problema de integridad real.
    - CUALQUIER noticia sin 'id' NI 'pagina' -> _shadow_identity() ya lo
      rechaza.
    - una misma 'pagina' identificando DOS identidades de sombra
      DISTINTAS en el pool final (p. ej. una activa con id=X y una
      entrada de archivo sin id que comparte esa misma pagina --
      probablemente el mismo artículo indexado de dos formas distintas)
      -> se valida en una segunda pasada sobre el resultado ya
      deduplicado."""
    por_identidad: dict[str, dict] = {}
    resultado: list[dict] = []
    duplicados = 0
    por_id_real = 0
    por_pagina_fallback = 0

    fuentes = [(NOTICIAS_FILE.name, activas), (ARCHIVO_FILE.name, archivo)]
    for nombre_fichero, lista in fuentes:
        for posicion, noticia in enumerate(lista):
            try:
                identidad = _shadow_identity(noticia)
            except ShadowPipelineError as exc:
                raise ShadowPipelineError(f"{nombre_fichero}[{posicion}]: {exc}") from exc

            existente = por_identidad.get(identidad)
            if existente is not None:
                if existente.get("pagina") != noticia.get("pagina"):
                    raise ShadowPipelineError(
                        f"identidad de sombra {identidad!r} aparece más de una vez con 'pagina' "
                        f"incompatible: {existente.get('pagina')!r} vs {noticia.get('pagina')!r} -- "
                        "problema de integridad en los datos reales, no se puede deduplicar de forma segura."
                    )
                duplicados += 1
                continue

            por_identidad[identidad] = noticia
            resultado.append(noticia)
            if identidad.startswith("id:"):
                por_id_real += 1
            else:
                por_pagina_fallback += 1

    # Segunda pasada: una misma 'pagina' no puede identificar dos
    # identidades de sombra DISTINTAS en el pool ya deduplicado (p. ej.
    # una activa con id=X y una entrada de archivo sin id que comparte
    # esa misma pagina -- probablemente el mismo artículo referenciado de
    # dos formas distintas).
    por_pagina: dict[str, dict] = {}
    for noticia in resultado:
        pagina = noticia.get("pagina")
        if not pagina:
            continue
        existente = por_pagina.get(pagina)
        if existente is not None and _shadow_identity(existente) != _shadow_identity(noticia):
            raise ShadowPipelineError(
                f"pagina {pagina!r} identifica dos registros con identidad de sombra distinta: "
                f"{_shadow_identity(existente)!r} vs {_shadow_identity(noticia)!r} -- "
                "probable mismo artículo indexado de dos formas distintas (activa con id vs "
                "archivo por pagina), problema de integridad."
            )
        por_pagina[pagina] = noticia

    return resultado, duplicados, por_id_real, por_pagina_fallback


def _bin_jaccard(valor: float) -> str | None:
    if valor >= 1.0:
        return "1.00"
    if valor >= 0.95:
        return "0.95-0.99"
    if valor >= 0.90:
        return "0.90-0.94"
    if valor >= 0.80:
        return "0.80-0.89"
    if valor >= 0.70:
        return "0.70-0.79"
    return None


def main() -> int:
    try:
        activas = _cargar(NOTICIAS_FILE)
        archivo = _cargar(ARCHIVO_FILE)
        pool, duplicados, por_id_real, por_pagina_fallback = _deduplicar_pool(activas, archivo)
    except ShadowPipelineError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print("Shadow run de candidate retrieval + clasificación de relación (task #16)")
    print("SOLO LECTURA -- no se modifica ningún archivo.\n")
    print(f"Noticias activas ({NOTICIAS_FILE.relative_to(BASE_DIR)}): {len(activas)}")
    print(f"Noticias en archivo ({ARCHIVO_FILE.relative_to(BASE_DIR)}): {len(archivo)}")
    print(f"ids duplicados activa/archivo detectados (deduplicados, priorizando activa): {duplicados}")
    print("Identidad shadow (nunca escrita, nunca real -- ver _shadow_identity):")
    print(f"  - por id real: {por_id_real}")
    print(f"  - fallback por pagina legacy (sin id en el archivo): {por_pagina_fallback}")
    print(f"Pool total analizado (deduplicado): {len(pool)}\n")

    contador_relacion: Counter[str] = Counter()
    bins_todos_los_pares: Counter[str] = Counter()
    bins_exact_near: Counter[str] = Counter()
    ejemplos: dict[str, list[tuple[dict, dict, dict]]] = defaultdict(list)

    total_pares_evaluados = 0
    señal_entidad_sola_sin_apoyo = 0
    positivos_sin_categoria_coincide = 0
    positivos_sin_entidad_comun = 0
    total_positivos = 0

    for noticia in pool:
        candidatos = candidatos_relacionados(noticia, pool, solo_pasado=True)
        evaluaciones = [evaluar_relacion(noticia, c) for c in candidatos]
        pares = list(zip(candidatos, evaluaciones))
        total_pares_evaluados += len(pares)

        for _candidato, e in pares:
            bin_ = _bin_jaccard(e["jaccard_titulo"])
            if bin_:
                bins_todos_los_pares[bin_] += 1
                if e["relationship"] in (EXACT_DUPLICATE, NEAR_DUPLICATE):
                    bins_exact_near[bin_] += 1
            if e["relationship"] is None and e["jaccard_entidades"] >= 0.15:
                señal_entidad_sola_sin_apoyo += 1

        calificados = [(c, e) for c, e in pares if e["relationship"] is not None]
        for _c, e in calificados:
            total_positivos += 1
            if not e["categoria_coincide"]:
                positivos_sin_categoria_coincide += 1
            if e["num_entidades_comunes"] == 0:
                positivos_sin_entidad_comun += 1

        if calificados:
            mejor_candidato, mejor = max(calificados, key=lambda par: (par[1]["duplicate_confidence"], par[1]["event_similarity"]))
        else:
            mejor_candidato, mejor = None, {"relationship": NEW_EVENT}

        contador_relacion[mejor["relationship"]] += 1

        if mejor["relationship"] != NEW_EVENT and len(ejemplos[mejor["relationship"]]) < 5:
            ejemplos[mejor["relationship"]].append((noticia, mejor_candidato, mejor))

    print("=== Distribución de relación (semántica de producción: solo antecedentes, ventana 14 días) ===")
    for tipo in [NEW_EVENT, EXACT_DUPLICATE, NEAR_DUPLICATE, SAME_EVENT_WITH_UPDATE, SAME_EVENT_NO_NEW_INFO]:
        print(f"  {tipo}: {contador_relacion.get(tipo, 0)}")

    print()
    print("=== Distribución de jaccard_titulo -- TODOS los pares evaluados dentro de la ventana ===")
    for bin_ in BINS:
        print(f"  {bin_}: {bins_todos_los_pares.get(bin_, 0)}")

    print()
    print("=== Distribución de jaccard_titulo -- SOLO pares que terminaron clasificados EXACT/NEAR ===")
    print("(compara con la distribución de arriba para calibrar si 0.72/0.95 separan bien)")
    for bin_ in BINS:
        print(f"  {bin_}: {bins_exact_near.get(bin_, 0)}")

    print()
    print("=== Recall: ¿cuánto se habría perdido con un hard gate en candidatos_relacionados()? ===")
    print(f"(sobre los {total_positivos} pares que SÍ calificaron como relacionados en el diseño actual)")
    print(f"  ...si exigiéramos misma categoría: {positivos_sin_categoria_coincide} se habrían perdido")
    print(f"  ...si exigiéramos >=1 entidad común: {positivos_sin_entidad_comun} se habrían perdido")

    print()
    print("=== Señal 'entidad común sola no basta' (jaccard_entidades>=0.15 pero SIN relación por falta de apoyo textual) ===")
    print(f"  {señal_entidad_sola_sin_apoyo} de {total_pares_evaluados} pares evaluados en total")

    print()
    print("=== Ejemplos representativos (hasta 5 por tipo) ===")
    for tipo in [EXACT_DUPLICATE, NEAR_DUPLICATE, SAME_EVENT_WITH_UPDATE, SAME_EVENT_NO_NEW_INFO]:
        print(f"\n--- {tipo} ({contador_relacion.get(tipo, 0)} en total, mostrando hasta 5) ---")
        for noticia, candidato, resultado in ejemplos.get(tipo, []):
            print(f"  [{_shadow_identity(noticia)}] {noticia.get('titulo', '')[:75]!r}")
            if candidato is not None:
                print(f"    vs [{_shadow_identity(candidato)}] {candidato.get('titulo', '')[:75]!r}")
            print(
                f"    jaccard_titulo={resultado['jaccard_titulo']} "
                f"jaccard_entidades={resultado['jaccard_entidades']} "
                f"event_similarity={resultado['event_similarity']} "
                f"categoria_coincide={resultado['categoria_coincide']} "
                f"dias_diferencia={resultado['dias_diferencia']} "
                f"proximidad_temporal={resultado['proximidad_temporal']} "
                f"entidades_comunes={resultado['entidades_comunes']}"
            )

    print("\nShadow run completado. Ningún archivo ha sido modificado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
