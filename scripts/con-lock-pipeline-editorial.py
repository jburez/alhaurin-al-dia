#!/usr/bin/env python3
"""Entry point del pipeline editorial principal bajo lock exclusivo (Fase
2, task #19).

Envuelve exactamente los dos comandos que hoy ejecuta el step "Generar
noticias y sitemaps" de .github/workflows/generar-noticias.yml:
`npm run build` seguido de `npm run whatsapp:today`. `npm run build` ya
encadena internamente todos los writers del pipeline editorial (news,
dedupe, archive-orphan, renders, RSS, sitemap, SEO...) -- ver
package.json. Este wrapper no reimplementa esa cadena: solo la ejecuta
bajo un único lock (ver scripts/lib/pipeline_lock.py), con la misma
semántica de "para en el primer fallo" que ya tenía el step de GitHub
Actions (bash con `set -eo pipefail` por defecto).

Uso: python3 scripts/con-lock-pipeline-editorial.py
"""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path
from typing import List, Optional

SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from lib.pipeline_lock import PipelineLockBusyError, lock_pipeline_editorial  # noqa: E402

ROOT = SCRIPTS_DIR.parent

COMANDOS_PIPELINE = [
    ["npm", "run", "build"],
    ["npm", "run", "whatsapp:today"],
]


def ejecutar_pipeline(
    comandos: Optional[List[List[str]]] = None,
    ruta_lock: Optional[Path] = None,
    cwd: Optional[Path] = None,
) -> int:
    """Adquiere el lock y ejecuta `comandos` en orden. Para en el primer
    comando con código de salida distinto de 0. Inyectable (comandos,
    ruta_lock, cwd) para tests -- con los valores por defecto ejecuta el
    pipeline real desde la raíz del repo.
    """
    comandos_a_ejecutar = comandos if comandos is not None else COMANDOS_PIPELINE
    cwd_ejecucion = cwd if cwd is not None else ROOT

    try:
        with lock_pipeline_editorial(ruta_lock):
            for comando in comandos_a_ejecutar:
                resultado = subprocess.run(comando, cwd=cwd_ejecucion)
                if resultado.returncode != 0:
                    return resultado.returncode
            return 0
    except PipelineLockBusyError as exc:
        print(f"[pipeline-lock] {exc} Abortando sin tocar datos.", file=sys.stderr)
        return 1


def main() -> int:
    return ejecutar_pipeline()


if __name__ == "__main__":
    sys.exit(main())
