"""Log estructurado y persistente de disparadores de actualización (Fase 2,
task #17). Puramente OBSERVACIONAL: registra qué pasó con cada
sourceIdentity al llegar al persistence boundary de guardar_noticias(),
nunca decide nada ni conecta con la clasificación semántica de task #16
(SAME_EVENT_*) -- ese cableado sigue explícitamente fuera de alcance.

Dos preguntas distintas, deliberadamente separadas en el evento:

1. ¿cambió el contenido de la FUENTE? -> source_content_changed (a partir
   de content_hash, calculado sobre el texto crudo antes de IA/saneado).
2. ¿cambió la REPRESENTACIÓN PÚBLICA final? -> public_content_changed (ya
   decidido en guardar_noticias() comparando el payload saneado final
   contra editorial_previo -- la misma lógica que ya decide dateModified,
   task #15, sin reinventar nada, solo se expone con nombre).

Un contenido fuente puede cambiar y, tras normalizar/sanear/regenerar,
producir exactamente el mismo payload público -- ambas banderas pueden
divergir, y el evento las conserva por separado en vez de colapsarlas en
un único "hubo cambio".

`action` es una clasificación DERIVADA de las señales anteriores (nunca al
revés): mutuamente excluyente, con precedencia explícita, calculada por
una función pura (derivar_action()) fácil de testear con una tabla de
verdad. No se persiste como criterio de decisión en ningún otro sitio.

Frontera fail-closed vs best-effort (deliberada): el registro editorial y
la identidad (task #15) siguen fail-closed sin cambios. Este módulo es
best-effort en su totalidad -- registrar_eventos() JAMÁS lanza (captura
Exception, no BaseException, así que KeyboardInterrupt/SystemExit siguen
propagándose con normalidad). Se llama desde guardar_noticias() al FINAL
del persistence boundary completo (después de HTML, categorías,
data/noticias.json y el registro editorial ya escritos con éxito): un
fallo aquí -- incluida una excepción de serialización, no solo de I/O --
no debe impedir ni revertir una publicación cuyo estado editorial
principal ya quedó persistido correctamente. La poda de logs antiguos por
retención tiene la misma garantía best-effort, en un bloque
independiente: si falla la escritura, se intenta podar igual; si falla la
poda, no afecta a la publicación ya realizada.

Formato: JSONL, un fichero por día (reports/editorial-pipeline-log-YYYY-MM-DD.jsonl,
gitignorado igual que el resto de reports/*.json). Un evento por noticia
que llega a guardar_noticias() -- las candidatas rechazadas por el
quality gate (sanear_noticia()) NO se registran aquí todavía, quedan
fuera de alcance de esta task a propósito. Nunca se guardan
título/descripción/cuerpo -- solo identidad, hashes, banderas y fechas."""

from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

LOG_DIR = Path(__file__).resolve().parent.parent.parent / "reports"
NOMBRE_PREFIJO = "editorial-pipeline-log-"
RETENCION_DIAS_DEFECTO = 30

NEW_SOURCE = "NEW_SOURCE"
UNCHANGED = "UNCHANGED"
SOURCE_CHANGED_PUBLIC_CHANGED = "SOURCE_CHANGED_PUBLIC_CHANGED"
SOURCE_CHANGED_PUBLIC_UNCHANGED = "SOURCE_CHANGED_PUBLIC_UNCHANGED"
REPROCESSED_PUBLIC_CHANGED = "REPROCESSED_PUBLIC_CHANGED"
REPROCESSED_PUBLIC_UNCHANGED = "REPROCESSED_PUBLIC_UNCHANGED"
PENDING_AI_RETRY = "PENDING_AI_RETRY"
BOOKKEEPING_ONLY_CHANGED = "BOOKKEEPING_ONLY_CHANGED"

# Motivos de caché (task #15, lib/editorial_registry.py) que esta función
# consume tal cual -- reexportados aquí solo como referencia de valores
# válidos, no se importan para evitar un ciclo lib->lib innecesario.
_CACHE_MISS_NEW = "CACHE_MISS_NEW"
_CACHE_MISS_PROMPT_VERSION = "CACHE_MISS_PROMPT_VERSION"
_CACHE_MISS_AI_NOT_SUCCESSFUL = "CACHE_MISS_AI_NOT_SUCCESSFUL"


def derivar_action(cache_status: str, source_content_changed: bool, ai_called: bool, public_content_changed: bool) -> str:
    """Clasificación derivada, pura, mutuamente excluyente. Las señales de
    entrada son la fuente de verdad -- esta función nunca decide nada,
    solo las resume en una etiqueta legible para auditoría.

    Precedencia explícita (en este orden):

    1. NEW_SOURCE -- cache_status indica que no había entrada previa
       (source_content_changed ya es False por construcción en ese caso,
       pero se comprueba cache_status directamente por claridad).
    2. SOURCE_CHANGED_* -- el contenido de la fuente cambió (según hash).
    3. REPROCESSED_* -- "reprocesado" se define EXPLÍCITAMENTE a partir del
       estado de procesamiento, NUNCA simplemente de ai_called: incluye
       CACHE_MISS_PROMPT_VERSION (el pipeline SIEMPRE intenta reprocesar
       -vía IA real o fallback- ante un cambio de prompt_version, aunque
       ia_activada() esté desactivada y por tanto ai_called termine en
       False) y CACHE_MISS_AI_NOT_SUCCESSFUL únicamente cuando ai_called
       es True (el backoff había expirado y se reintentó de verdad) --
       un backoff SIN reintento real (ai_called=False) NO cuenta como
       reprocesado, cae en el siguiente escalón.
    4. PENDING_AI_RETRY -- CACHE_MISS_AI_NOT_SUCCESSFUL sin reintento real
       (ai_called=False, en backoff): hay un fallo de IA pendiente de
       reintentar, distinto de UNCHANGED (un CACHE_HIT genuino) porque la
       SITUACIÓN (fallo sin resolver) es relevante para auditoría --
       pero NO es BOOKKEEPING_ONLY_CHANGED: en la implementación actual
       de task #15, mientras dura el backoff, ningún byte del registro
       cambia realmente (ai_attempts/last_ai_attempt se copian tal cual
       del entrada_previa), así que afirmar "cambió el bookkeeping" sería
       falso. Etiqueta explícita en vez de inferir un cambio que no hay
       evidencia de que ocurra.
    5. BOOKKEEPING_ONLY_CHANGED -- reservado para cuando exista evidencia
       real (una señal explícita, no inferida del estado de caché) de que
       cambió metadata/bookkeeping del registro sin cambiar el contenido
       público. Con las señales disponibles hoy no hay forma de detectar
       ese caso de forma fiable -- esta rama no se alcanza todavía; se
       deja definida para cuando esa señal exista, en vez de generar el
       label sin evidencia real.
    6. UNCHANGED -- cualquier otro caso (CACHE_HIT)."""
    if cache_status == _CACHE_MISS_NEW:
        return NEW_SOURCE

    if source_content_changed:
        return SOURCE_CHANGED_PUBLIC_CHANGED if public_content_changed else SOURCE_CHANGED_PUBLIC_UNCHANGED

    reprocessed = (
        cache_status == _CACHE_MISS_PROMPT_VERSION
        or (cache_status == _CACHE_MISS_AI_NOT_SUCCESSFUL and ai_called)
    )
    if reprocessed:
        return REPROCESSED_PUBLIC_CHANGED if public_content_changed else REPROCESSED_PUBLIC_UNCHANGED

    if cache_status == _CACHE_MISS_AI_NOT_SUCCESSFUL:
        # ai_called es False aquí (si fuera True, ya se habría clasificado
        # como REPROCESSED_* arriba) -- backoff sin reintento real.
        return PENDING_AI_RETRY

    return UNCHANGED


def construir_evento(
    *,
    source_identity: str,
    id_: str,
    pagina: str,
    previous_content_hash: str | None,
    current_content_hash: str,
    cache_status: str,
    ai_called: bool,
    ai_success: bool,
    public_content_changed: bool,
    previous_date_modified: str | None,
    resulting_date_modified: str | None,
    timestamp: str,
    error: str | None = None,
) -> dict[str, Any]:
    """Función pura, sin I/O. source_content_changed se calcula aquí --
    nunca se infiere después a partir de cache_status en otro sitio:

        source_content_changed = (previous_content_hash is not None
                                   and previous_content_hash != current_content_hash)

    Nunca incluye título/descripción/cuerpo -- solo identidad, hashes,
    banderas y fechas (ver docstring del módulo)."""
    source_content_changed = (
        previous_content_hash is not None and previous_content_hash != current_content_hash
    )
    action = derivar_action(cache_status, source_content_changed, ai_called, public_content_changed)
    return {
        "timestamp": timestamp,
        "source_identity": source_identity,
        "id": id_,
        "pagina": pagina,
        "previous_content_hash": previous_content_hash,
        "current_content_hash": current_content_hash,
        "cache_status": cache_status,
        "source_content_changed": source_content_changed,
        "ai_called": ai_called,
        "ai_success": ai_success,
        "public_content_changed": public_content_changed,
        "previous_date_modified": previous_date_modified,
        "resulting_date_modified": resulting_date_modified,
        "action": action,
        "error": error,
    }


def _ruta_log_para(fecha: date) -> Path:
    return LOG_DIR / f"{NOMBRE_PREFIJO}{fecha.isoformat()}.jsonl"


def _podar_logs_antiguos(ahora: datetime, dias_retencion: int) -> None:
    """Best-effort por diseño: un fallo al evaluar/borrar UN fichero no
    debe impedir evaluar los demás, y un fallo global (p. ej. LOG_DIR sin
    permisos de listado) tampoco debe propagarse -- lo captura
    registrar_eventos()."""
    limite = ahora.date() - timedelta(days=dias_retencion)
    if not LOG_DIR.exists():
        return
    for ruta in LOG_DIR.glob(f"{NOMBRE_PREFIJO}*.jsonl"):
        try:
            fecha_str = ruta.stem[len(NOMBRE_PREFIJO):]
            fecha = date.fromisoformat(fecha_str)
            if fecha < limite:
                ruta.unlink()
        except (ValueError, OSError) as exc:
            print(f"[editorial_log] AVISO: no se pudo evaluar/borrar {ruta}: {exc}", file=sys.stderr)


def registrar_eventos(
    eventos: list[dict[str, Any]], ahora: datetime | None = None, dias_retencion: int = RETENCION_DIAS_DEFECTO
) -> None:
    """Best-effort, NUNCA lanza -- ver docstring del módulo para la
    frontera fail-closed (registro/identidad) vs best-effort (este log).
    Se llama al FINAL del persistence boundary completo de
    guardar_noticias(), después de que HTML, categorías,
    data/noticias.json y el registro editorial ya se hayan escrito con
    éxito.

    Se captura Exception (no BaseException, así que KeyboardInterrupt/
    SystemExit siguen propagándose) alrededor de TODO el bloque de
    escritura -- no solo I/O: json.dumps() puede lanzar TypeError/
    ValueError si algún evento no es serializable, y como este módulo es
    puramente observacional, ese fallo tampoco debe romper el pipeline.

    Escritura seleccionada deliberadamente simple para evitar
    infraestructura de locking nueva: el fichero se abre en append y cada
    evento se serializa como una línea independiente. Esto minimiza la
    ventana de interferencia y evita read-modify-write, pero NO
    constituye una garantía formal de atomicidad entre múltiples procesos
    concurrentes -- no hay convención de locking previa en el proyecto
    que reutilizar, y no se introduce una nueva en esta task. La
    concurrencia fuerte del logging queda como deuda documentada si
    alguna vez se ejecutan varios publishers simultáneamente.

    La poda de logs antiguos vive en un bloque try/except independiente:
    si falla la escritura, se intenta podar igualmente; si falla la
    poda, no afecta a la publicación ya realizada."""
    if not eventos:
        return
    ahora = ahora or datetime.now(timezone.utc)

    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        ruta = _ruta_log_para(ahora.date())
        with ruta.open("a", encoding="utf-8") as f:
            for evento in eventos:
                f.write(json.dumps(evento, ensure_ascii=False) + "\n")
    except Exception as exc:
        print(f"[editorial_log] AVISO: no se pudo escribir el log de eventos: {exc}", file=sys.stderr)

    try:
        _podar_logs_antiguos(ahora, dias_retencion)
    except Exception as exc:
        print(f"[editorial_log] AVISO: no se pudo podar logs antiguos: {exc}", file=sys.stderr)
