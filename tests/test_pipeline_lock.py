"""Tests de scripts/lib/pipeline_lock.py (task #19) contra el módulo
REAL, incluyendo procesos reales del sistema operativo (no simulados) para
las escenas de contención/muerte abrupta que pide el usuario. Nunca toca
reports/ real -- todas las rutas de lock viven en directorios temporales.

Ejecutar con: python3 test_pipeline_lock.py
"""
import errno
import fcntl
import json
import os
import signal
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib.pipeline_lock import (  # noqa: E402
    PipelineLockBusyError,
    _leer_metadata_diagnostica,
    lock_pipeline_editorial,
)

WORKER = str(Path(__file__).resolve().parent / "lock_worker.py")

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


def tmp_lock_path():
    d = Path(tempfile.mkdtemp())
    return d / "test.lock"


def leer_linea_con_timeout(proc, timeout=5.0):
    """Lee una línea de stdout del proceso, con timeout defensivo para no
    colgar el test si algo va mal."""
    inicio = time.time()
    while time.time() - inicio < timeout:
        linea = proc.stdout.readline()
        if linea:
            return linea.strip()
        if proc.poll() is not None:
            return proc.stdout.readline().strip()
    raise TimeoutError("worker no respondió a tiempo")


print("=== 1. adquisición simple: lock creado, metadata pid/startedAt correcta ===")
ruta1 = tmp_lock_path()
with lock_pipeline_editorial(ruta1):
    check("fichero de lock existe durante el bloque", ruta1.exists())
    metadata = _leer_metadata_diagnostica(ruta1)
    check("metadata tiene pid propio", metadata and metadata.get("pid") == os.getpid(), metadata)
    check("metadata tiene startedAt", metadata and bool(metadata.get("startedAt")), metadata)
check("el fichero sigue existiendo tras salir (solo se libera flock, no se borra)", ruta1.exists())


print("\n=== 2. proceso A adquiere, proceso B (real) intenta a la vez -> B falla ===")
ruta2 = tmp_lock_path()
procA = subprocess.Popen(
    [sys.executable, WORKER, str(ruta2), "2.0"],
    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
)
try:
    lineaA = leer_linea_con_timeout(procA)
    check("A adquiere el lock", lineaA == "ACQUIRED", lineaA)

    procB = subprocess.Popen(
        [sys.executable, WORKER, str(ruta2), "0.1"],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
    )
    lineaB = leer_linea_con_timeout(procB)
    codigoB = procB.wait(timeout=5)
    check("B ve BUSY mientras A sigue vivo", lineaB == "BUSY", lineaB)
    check("B sale con código 1", codigoB == 1, codigoB)
finally:
    codigoA = procA.wait(timeout=5)
    check("A termina normalmente con código 0", codigoA == 0, codigoA)


print("\n=== 3. A termina normalmente -> B puede adquirir después ===")
ruta3 = tmp_lock_path()
procA = subprocess.Popen(
    [sys.executable, WORKER, str(ruta3), "0.3"],
    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
)
lineaA = leer_linea_con_timeout(procA)
check("A adquiere el lock", lineaA == "ACQUIRED", lineaA)
codigoA = procA.wait(timeout=5)
check("A termina con código 0", codigoA == 0, codigoA)

procB = subprocess.Popen(
    [sys.executable, WORKER, str(ruta3), "0.1"],
    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
)
lineaB = leer_linea_con_timeout(procB)
codigoB = procB.wait(timeout=5)
check("B adquiere el lock tras A liberar", lineaB == "ACQUIRED", lineaB)
check("B termina con código 0", codigoB == 0, codigoB)


print("\n=== 4. A muere abruptamente (SIGKILL) -> B puede adquirir después, sin cleanup manual ===")
ruta4 = tmp_lock_path()
procA = subprocess.Popen(
    [sys.executable, WORKER, str(ruta4), "30.0"],
    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
)
lineaA = leer_linea_con_timeout(procA)
check("A adquiere el lock", lineaA == "ACQUIRED", lineaA)

os.kill(procA.pid, signal.SIGKILL)
procA.wait(timeout=5)
check("A ha muerto de verdad", procA.poll() is not None)

# Sin ningún paso de recuperación/limpieza manual entre medias -- el
# kernel ya liberó el flock al morir el proceso y cerrarse su descriptor.
procB = subprocess.Popen(
    [sys.executable, WORKER, str(ruta4), "0.1"],
    stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
)
lineaB = leer_linea_con_timeout(procB, timeout=5.0)
codigoB = procB.wait(timeout=5)
check("B adquiere el lock inmediatamente tras el SIGKILL de A, sin cleanup manual", lineaB == "ACQUIRED", lineaB)
check("B termina con código 0", codigoB == 0, codigoB)


print("\n=== 5. mera existencia del fichero sin flock activo NO bloquea ===")
ruta5 = tmp_lock_path()
ruta5.parent.mkdir(parents=True, exist_ok=True)
ruta5.write_text(json.dumps({"pid": 999999, "startedAt": "2020-01-01T00:00:00+00:00"}), encoding="utf-8")
check("el fichero existe de antemano, sin flock", ruta5.exists())
try:
    with lock_pipeline_editorial(ruta5):
        adquirido = True
except PipelineLockBusyError:
    adquirido = False
check("se adquiere igualmente (la existencia del fichero no es la verdad del lock)", adquirido is True)


print("\n=== 6. excepción durante el bloque protegido -> lock liberado igualmente ===")
ruta6 = tmp_lock_path()


class ErrorDePrueba(Exception):
    pass


try:
    with lock_pipeline_editorial(ruta6):
        raise ErrorDePrueba("fallo simulado dentro del pipeline")
except ErrorDePrueba:
    pass
else:
    check("la excepción se propagó (no fue engullida por el lock)", False)

# Si el lock no se hubiera liberado, esta segunda adquisición fallaría.
try:
    with lock_pipeline_editorial(ruta6):
        segunda_adquisicion_ok = True
except PipelineLockBusyError:
    segunda_adquisicion_ok = False
check("tras la excepción, una nueva adquisición inmediata funciona", segunda_adquisicion_ok is True)


print("\n=== 7. errno no relacionado con 'ocupado' se propaga, no se reinterpreta como PipelineLockBusyError ===")
ruta7 = tmp_lock_path()
ruta7.parent.mkdir(parents=True, exist_ok=True)

flock_original = fcntl.flock


def flock_que_falla_con_eio(fd, operacion):
    if operacion == (fcntl.LOCK_EX | fcntl.LOCK_NB):
        raise OSError(errno.EIO, "fallo de E/S simulado, no relacionado con lock ocupado")
    return flock_original(fd, operacion)


fcntl.flock = flock_que_falla_con_eio
try:
    error_inesperado = None
    try:
        with lock_pipeline_editorial(ruta7):
            pass
    except PipelineLockBusyError:
        error_inesperado = "SE_CONVIRTIO_EN_BUSY_ERROR_INCORRECTAMENTE"
    except OSError as exc:
        error_inesperado = exc
finally:
    fcntl.flock = flock_original

check(
    "un OSError con errno distinto de EACCES/EAGAIN se propaga tal cual (no se enmascara como lock ocupado)",
    isinstance(error_inesperado, OSError) and error_inesperado.errno == errno.EIO,
    error_inesperado,
)


print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
