"""Lock de ejecución para el pipeline editorial principal (Fase 2, task
#19). Protege exclusivamente contra EJECUCIÓN concurrente (dos procesos
mutando data/noticias.json, noticias-editorial.json, HTML, reports/... al
mismo tiempo) -- no tiene nada que ver con la validación de CONTENIDO, que
vive por separado en validar_contenido.py.

La verdad del lock es fcntl.flock(LOCK_EX | LOCK_NB) sobre un descriptor de
fichero abierto, no la mera existencia de reports/.pipeline-editorial.lock
ni ningún dato leído de su contenido. Un diseño anterior (creación
exclusiva de fichero + PID + rename de "stale lock") se descartó por tener
una carrera TOCTOU real en la recuperación: dos recuperadores concurrentes
podían acabar renombrando/borrando el lock recién adquirido por un
tercero. flock evita esa clase de problema por construcción:

- el kernel gestiona la exclusión de forma atómica;
- si el proceso muere, incluso por SIGKILL, el SO libera el lock al
  cerrarse el descriptor -- no existe "stale lock" que detectar ni
  recuperar;
- no hay reuse de PID que interpretar, ni rename/unlink competitivo entre
  procesos, ni necesidad de un token para demostrar propiedad.

El JSON escrito dentro del fichero (pid, startedAt) es solo metadata
diagnóstica para el mensaje de una segunda ejecución -- nunca decide si el
lock está tomado; eso lo decide exclusivamente flock. La mera existencia
del fichero, sin flock activo sobre él, NO bloquea nada.

No hay unlock explícito: el `with open(...)` es quien cierra el
descriptor al salir del bloque -- con éxito, con excepción, o con
cualquier otro camino de salida -- y cerrar el descriptor libera el flock
a nivel de kernel automáticamente. Añadir una llamada explícita a
flock(LOCK_UN) en un finally sin protección propia arriesgaría enmascarar
la excepción real del pipeline si esa llamada fallara; apoyarse en el
cierre del descriptor evita ese riesgo por construcción, no solo por
convención.

Entorno objetivo: POSIX (macOS local + runners `ubuntu-latest` de GitHub
Actions). No se persigue compatibilidad Windows (fcntl no existe ahí).
"""
from __future__ import annotations

import errno
import fcntl
import json
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

ROOT = Path(__file__).resolve().parent.parent.parent
LOCK_PATH = ROOT / "reports" / ".pipeline-editorial.lock"

# fcntl.flock(..., LOCK_NB) señala "ya bloqueado por otro" con distintos
# errno según plataforma/versión de Python (EAGAIN es lo habitual en
# Linux, EACCES aparece también en algunos entornos). Cualquier otro
# errno se propaga tal cual -- puede ser un problema real de filesystem o
# permisos, y no debe reinterpretarse falsamente como "otro pipeline está
# en ejecución".
_ERRNOS_LOCK_OCUPADO = (errno.EACCES, errno.EAGAIN)


class PipelineLockBusyError(Exception):
    """Ya hay otra ejecución con el lock adquirido (flock no disponible)."""


def _leer_metadata_diagnostica(ruta_lock: Path) -> Optional[dict]:
    """Solo para componer un mensaje de error legible -- nunca se usa para
    decidir si el lock está tomado."""
    try:
        return json.loads(ruta_lock.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


@contextmanager
def lock_pipeline_editorial(ruta_lock: Optional[Path] = None) -> Iterator[None]:
    """Context manager: adquiere fcntl.flock(LOCK_EX | LOCK_NB) sobre
    ruta_lock durante el bloque `with`. Lanza PipelineLockBusyError si ya
    está tomado por otro proceso.
    """
    ruta_lock = ruta_lock if ruta_lock is not None else LOCK_PATH
    ruta_lock.parent.mkdir(parents=True, exist_ok=True)

    with open(ruta_lock, "a+") as fd:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            if exc.errno not in _ERRNOS_LOCK_OCUPADO:
                raise
            metadata = _leer_metadata_diagnostica(ruta_lock)
            if metadata:
                detalle = f" (PID {metadata.get('pid')}, iniciado {metadata.get('startedAt')})"
            else:
                detalle = ""
            raise PipelineLockBusyError(
                f"Ya hay una ejecución del pipeline editorial en curso{detalle}."
            ) from None

        fd.seek(0)
        fd.truncate(0)
        fd.write(json.dumps(
            {"pid": os.getpid(), "startedAt": datetime.now(timezone.utc).isoformat()},
            indent=2,
        ))
        fd.flush()
        yield
