"""Migración de una sola pasada: recorre noticias/*.html ya publicadas y
fuerza la variante de mayor resolución de su imagen de portada, reutilizando
la misma lógica (normalizar_imagen_hd) que generar_noticias.py ya aplica a
las noticias nuevas desde el 17 de agosto de 2026. Ese fix nunca se aplicó
retroactivamente a las páginas generadas antes de esa fecha.

Uso:
  python3 scripts/migrar_imagenes_hd.py            # dry-run, solo informe
  python3 scripts/migrar_imagenes_hd.py --write    # aplica los cambios
"""

import html
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generar_noticias import normalizar_imagen_hd  # noqa: E402

BASE_DIR = Path(__file__).resolve().parent.parent
NOTICIAS_DIR = BASE_DIR / "noticias"
NEWS_FILE = BASE_DIR / "data" / "noticias.json"
ARCHIVE_FILE = BASE_DIR / "data" / "noticias-archivo.json"
REPORT_FILE = BASE_DIR / "reports" / "image-hd-migration-report.json"

WRITE = "--write" in sys.argv

IMG_SRC_RE = re.compile(r'<figure class="article-hero-image"><img src="([^"]+)"')
OG_IMAGE_RE = re.compile(r'<meta property="og:image" content="([^"]+)">')


def escapar(texto):
    return html.escape(str(texto or ""), quote=True)


def extraer_imagen_actual(texto):
    m = IMG_SRC_RE.search(texto)
    if m:
        return html.unescape(m.group(1))
    m = OG_IMAGE_RE.search(texto)
    if m:
        return html.unescape(m.group(1))
    return None


def migrar_archivo(path):
    texto = path.read_text(encoding="utf-8")
    url_actual = extraer_imagen_actual(texto)
    if not url_actual:
        return None

    url_nueva = normalizar_imagen_hd(url_actual)
    if url_nueva == url_actual:
        return None

    nuevo_texto = texto.replace(escapar(url_actual), escapar(url_nueva))
    nuevo_texto = nuevo_texto.replace(url_actual, url_nueva)

    if nuevo_texto == texto:
        return None

    return {
        "file": str(path.relative_to(BASE_DIR)),
        "pagina": f"noticias/{path.name}",
        "antes": url_actual,
        "despues": url_nueva,
        "texto_nuevo": nuevo_texto,
    }


def actualizar_json_imagenes(data_file, migraciones_por_pagina):
    try:
        datos = json.loads(data_file.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return 0

    if not isinstance(datos, list):
        return 0

    actualizadas = 0
    for item in datos:
        pagina = item.get("pagina", "")
        migracion = migraciones_por_pagina.get(pagina)
        if migracion and item.get("imagen") == migracion["antes"]:
            item["imagen"] = migracion["despues"]
            actualizadas += 1

    if actualizadas and WRITE:
        data_file.write_text(json.dumps(datos, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    return actualizadas


def main():
    archivos = sorted(
        p for p in NOTICIAS_DIR.glob("*.html") if p.name != "index.html"
    )

    migraciones = []
    sin_html = 0

    print(f"Analizando {len(archivos)} páginas de noticias...")
    for i, path in enumerate(archivos, 1):
        resultado = migrar_archivo(path)
        if resultado:
            migraciones.append(resultado)
        if i % 50 == 0:
            print(f"  {i}/{len(archivos)} analizadas, {len(migraciones)} con mejora encontrada")

    if WRITE:
        for m in migraciones:
            (BASE_DIR / m["file"]).write_text(m["texto_nuevo"], encoding="utf-8")

    migraciones_por_pagina = {m["pagina"]: m for m in migraciones}
    actualizadas_activas = actualizar_json_imagenes(NEWS_FILE, migraciones_por_pagina)
    actualizadas_archivo = actualizar_json_imagenes(ARCHIVE_FILE, migraciones_por_pagina)

    report = {
        "mode": "write" if WRITE else "dry-run",
        "analizadas": len(archivos),
        "migradas": len(migraciones),
        "jsonActivasActualizadas": actualizadas_activas,
        "jsonArchivoActualizadas": actualizadas_archivo,
        "detalle": [
            {"pagina": m["pagina"], "antes": m["antes"], "despues": m["despues"]}
            for m in migraciones
        ],
    }

    REPORT_FILE.parent.mkdir(parents=True, exist_ok=True)
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"\nMigración de imágenes HD: {'WRITE' if WRITE else 'DRY-RUN'}")
    print(f"Analizadas: {report['analizadas']}")
    print(f"Migradas: {report['migradas']}")
    print(f"JSON activas actualizadas: {actualizadas_activas}")
    print(f"JSON archivo actualizadas: {actualizadas_archivo}")
    print(f"Informe: {REPORT_FILE.relative_to(BASE_DIR)}")


if __name__ == "__main__":
    main()
