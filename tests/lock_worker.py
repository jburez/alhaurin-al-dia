"""Worker auxiliar para test_pipeline_lock.py: un proceso real e
independiente que intenta adquirir el lock del pipeline editorial y,
si lo consigue, se queda dormido dentro del `with` durante N segundos.

Uso: python3 lock_worker.py <ruta_lock> <segundos_dormido>

Imprime exactamente una palabra a stdout y hace flush inmediato, para que
el proceso orquestador pueda sincronizarse leyendo una línea:
  ACQUIRED  -> consiguió el lock, va a dormir segundos_dormido y luego sale 0
  BUSY      -> PipelineLockBusyError, sale con código 1
"""
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from lib.pipeline_lock import PipelineLockBusyError, lock_pipeline_editorial  # noqa: E402


def main() -> int:
    ruta_lock = Path(sys.argv[1])
    segundos = float(sys.argv[2])

    try:
        with lock_pipeline_editorial(ruta_lock):
            print("ACQUIRED", flush=True)
            time.sleep(segundos)
        return 0
    except PipelineLockBusyError:
        print("BUSY", flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
