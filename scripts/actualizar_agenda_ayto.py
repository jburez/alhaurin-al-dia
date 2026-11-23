#!/usr/bin/env python3
"""Compatibilidad: el workflow actualizar-agenda-ayto.yml ejecuta este script.

Desde la fase 6 (noviembre 2026) la agenda del Ayuntamiento es una fuente más
de data/fuentes-agenda.json (tipo wp-tribe, con iCal como alternativa), que
lee scripts/actualizar_agenda_fuentes.py junto con el resto de fuentes
configuradas. Este script solo delega en él.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import actualizar_agenda_fuentes  # noqa: E402

if __name__ == "__main__":
    sys.argv = [sys.argv[0], *sys.argv[1:]]
    sys.exit(actualizar_agenda_fuentes.main())
