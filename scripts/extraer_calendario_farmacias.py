#!/usr/bin/env python3
"""Extrae el calendario de farmacias de guardia publicado en
https://alhaurinelgrande.es/farmacias/ y genera
data/guardias-farmacias-{año}.json.

El Ayuntamiento no publica un calendario en texto/tabla/API: publica una
imagen (gráfico color-coded) por mes, subida a su galería de WordPress.
Cada imagen usa un mismo diseño: una cuadrícula de 7 columnas (L-D) y una
leyenda de 7 colores que asocian cada color a una dirección/farmacia.

En vez de OCR (poco fiable para decidir qué farmacia abre cada noche),
este script calcula matemáticamente en qué celda de la cuadrícula cae cada
día del mes (con el módulo `calendar`) y clasifica el color de esa celda
por distancia RGB a los 7 colores de la leyenda, que se muestrean
directamente de cada imagen. Es determinista y verificable: no depende de
que un modelo "lea" el número o el texto.

IMPORTANTE — esto es una herramienta de uso manual/puntual, no un workflow
programado: la fuente solo se actualiza cuando el Ayuntamiento publica un
calendario nuevo (una vez al año, no cada día). Vuelve a ejecutarlo cuando
haya un calendario nuevo, y antes de confiar en el resultado:
  1. Revisa visualmente al menos 2-3 meses de las imágenes nuevas.
  2. Si el diseño (tamaño de imagen, posición de la cuadrícula, orden de
     la leyenda) ha cambiado, recalibra GRID_COL_BOUNDS/GRID_ROW_BOUNDS
     muestreando píxeles como se hizo para 2026 (ver docs/ARQUITECTURA.md).
  3. Revisa los "huecos" que reporte el script: pueden ser errores reales
     de la fuente (ya ha pasado - ver MONTH_OVERRIDES) y no del script.

Calibrado y verificado visualmente contra las 12 imágenes reales de 2026
el 2026-07-31 (comprobación manual mes a mes, no solo por el script).
"""

from __future__ import annotations

import argparse
import calendar
import json
import re
import sys
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FARMACIAS_URL = "https://alhaurinelgrande.es/farmacias/"

# Cuadrícula calibrada sobre imágenes JPEG de 1024x1024 (plantilla 2026).
GRID_COL_BOUNDS = [103, 178, 252, 328, 403, 478, 553, 628]
GRID_ROW_BOUNDS = [427, 519, 611, 703, 795, 887, 979]
CLASSIFY_THRESHOLD = 4000  # distancia RGB^2 máxima para aceptar una clasificación

# Colores de leyenda muestreados en la plantilla 2026, en el mismo orden en
# que aparecen en data/farmacias.json (verificado por dirección, no por
# nombre: la leyenda llama "Farmacia López" a la de C/Virgen de Gracia,
# pero coincide en dirección con "maria-teresa-quintela" en farmacias.json).
LEGEND_2026 = {
    "farmacia-brenan": (90, 225, 229),
    "farmacia-del-centro": (255, 145, 74),
    "jose-luis-quintela": (126, 217, 86),
    "farmacia-la-variante": (255, 101, 195),
    "maria-teresa-quintela": (255, 222, 89),
    "farmacia-lourdes-quintela": (139, 82, 255),
    "farmacia-camino-de-malaga": (254, 48, 48),
}

# Correcciones puntuales verificadas a mano contra la imagen real: en 2026
# la imagen de marzo omite por completo la celda del día 1 (domingo) y
# desplaza el resto del mes una celda hacia arriba. No es un supuesto
# genérico — se confirmó comparando con la imagen (ver conversación
# 2026-07-31); si un año futuro no tiene esta anomalía, no incluir nada aquí.
MONTH_OVERRIDES = {
    2026: {
        3: lambda day: ((day - 2) // 7, (day - 2) % 7) if day >= 2 else None,
    }
}


def log(mensaje: str) -> None:
    print(f"[calendario-farmacias] {mensaje}")


def descargar(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=20) as response:  # nosec B310 - URL controlada
        return response.read()


def extraer_urls_calendario(html: str) -> list[str]:
    urls = re.findall(r'data-src="(https://alhaurinelgrande\.es/wp-content/uploads/[^"]+?-1024x1024\.jpeg)"', html)
    vistos: list[str] = []
    for url in urls:
        if url not in vistos:
            vistos.append(url)
    return vistos


def centro(bounds: list[int], indice: int) -> int:
    return (bounds[indice] + bounds[indice + 1]) // 2


def clasificar(color: tuple[int, int, int], leyenda: dict[str, tuple[int, int, int]]) -> str | None:
    mejor_id, mejor_distancia = None, float("inf")
    for pid, referencia in leyenda.items():
        distancia = sum((a - b) ** 2 for a, b in zip(color, referencia))
        if distancia < mejor_distancia:
            mejor_distancia, mejor_id = distancia, pid
    if mejor_distancia > CLASSIFY_THRESHOLD:
        return None
    return mejor_id


def extraer_mes(imagen: Image.Image, year: int, month: int, leyenda: dict) -> dict[int, str | None]:
    pixeles = imagen.convert("RGB").load()
    primer_dia_semana, num_dias = calendar.monthrange(year, month)
    override = MONTH_OVERRIDES.get(year, {}).get(month)

    resultado: dict[int, str | None] = {}
    for day in range(1, num_dias + 1):
        if override:
            posicion = override(day)
            if posicion is None:
                resultado[day] = None
                continue
            fila, columna = posicion
        else:
            indice_celda = primer_dia_semana + (day - 1)
            fila, columna = indice_celda // 7, indice_celda % 7

        if fila >= len(GRID_ROW_BOUNDS) - 1:
            resultado[day] = None
            continue

        x, y = centro(GRID_COL_BOUNDS, columna), centro(GRID_ROW_BOUNDS, fila)
        resultado[day] = clasificar(pixeles[x, y], leyenda)

    # Último día del mes fusionado visualmente con el anterior en la imagen
    # (visto en agosto y noviembre 2026: celda "30/31" o "29/30" con un solo
    # color) en vez de añadir una fila extra para un solo día.
    ultimo = num_dias
    if resultado.get(ultimo) is None and resultado.get(ultimo - 1):
        resultado[ultimo] = resultado[ultimo - 1]

    return resultado


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, default=2026, help="Año del calendario a extraer")
    args = parser.parse_args()

    if args.year != 2026:
        log(f"Aviso: la calibración de cuadrícula y leyenda está verificada para 2026, no para {args.year}.")
        log("Revisa visualmente el nuevo calendario y recalibra antes de confiar en el resultado (ver docstring).")

    leyenda = LEGEND_2026

    log(f"Descargando {FARMACIAS_URL}")
    html = descargar(FARMACIAS_URL).decode("utf-8", errors="replace")
    urls = extraer_urls_calendario(html)
    log(f"Imágenes de calendario detectadas en la página: {len(urls)}")

    if len(urls) < 12:
        log("Se esperaban al menos 12 imágenes (una por mes). Abortando sin escribir nada.")
        return 1

    guardias: dict[str, str] = {}
    huecos: list[str] = []

    for month, url in enumerate(urls[:12], start=1):
        log(f"Procesando {calendar.month_name[month]} {args.year}: {url}")
        datos_imagen = descargar(url)
        imagen = Image.open(BytesIO(datos_imagen))
        dias = extraer_mes(imagen, args.year, month, leyenda)
        for day, pid in dias.items():
            fecha = f"{args.year}-{month:02d}-{day:02d}"
            if pid is None:
                huecos.append(fecha)
                continue
            guardias[fecha] = pid

    salida = {
        "meta": {
            "fuente": FARMACIAS_URL,
            "descripcion": "Calendario de guardias de farmacias de Alhaurín el Grande. Horario habitual de 9:30 a 9:30.",
            "timezone": "Europe/Madrid",
            "huecos_sin_dato": sorted(huecos),
        },
        "guardias": dict(sorted(guardias.items())),
    }

    destino = ROOT / "data" / f"guardias-farmacias-{args.year}.json"
    destino.write_text(json.dumps(salida, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    log(f"Días asignados: {len(guardias)} de {sum(calendar.monthrange(args.year, m)[1] for m in range(1, 13))}")
    if huecos:
        log(f"Huecos sin dato en la fuente (revisar manualmente): {', '.join(sorted(huecos))}")
    log(f"Escrito {destino.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
