"""Regenera noticias/*.html y categoria/*/index.html a partir de data/noticias.json
tal cual está en disco, sin tocar el archivo ni hacer peticiones de red (no llama a
obtener_noticias()). Útil para aplicar cambios de plantilla (JSON-LD, metas, etc.)
a las noticias ya publicadas sin re-scrapear ni regenerar contenido con IA.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from generar_noticias import (  # noqa: E402
    OUTPUT_FILE,
    generar_paginas_categorias,
    generar_paginas_noticias,
)


def main():
    noticias = json.loads(OUTPUT_FILE.read_text(encoding="utf-8"))

    rutas_antes = {n["id"]: n.get("pagina") for n in noticias}

    generar_paginas_noticias(noticias)
    generar_paginas_categorias(noticias)

    cambios = [
        (n["id"], rutas_antes[n["id"]], n.get("pagina"))
        for n in noticias
        if rutas_antes[n["id"]] != n.get("pagina")
    ]
    if cambios:
        print("AVISO: la ruta de página cambió al regenerar (revisar antes de confiar en el resultado):")
        for id_, antes, despues in cambios:
            print(f"  {id_}: {antes} -> {despues}")
    else:
        print("Rutas de página idénticas a las existentes, sin renombrados.")

    print("data/noticias.json NO se ha modificado (solo lectura).")


if __name__ == "__main__":
    main()
