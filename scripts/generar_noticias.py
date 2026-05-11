import json
from pathlib import Path
from datetime import datetime
import html
import re

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_FILE = BASE_DIR / 'data' / 'noticias.json'
NOTICIAS_DIR = BASE_DIR / 'noticias'
SITE_URL = 'https://alhaurinaldia.es'


def slugify(texto):
    texto = texto.lower()
    reemplazos = {
        'á':'a','é':'e','í':'i','ó':'o','ú':'u','ñ':'n'
    }
    for a,b in reemplazos.items():
        texto = texto.replace(a,b)
    texto = re.sub(r'[^a-z0-9]+','-',texto)
    return texto.strip('-')


def escapar(valor):
    return html.escape(str(valor or ''), quote=True)


def generar_html_noticia(noticia):
    titulo = escapar(noticia.get('titulo'))
    descripcion = escapar(noticia.get('descripcion'))
    categoria = escapar(noticia.get('categoria'))
    imagen = escapar(noticia.get('imagen'))
    fuente = escapar(noticia.get('fuente'))
    enlace = escapar(noticia.get('enlace'))
    fecha = noticia.get('fecha', datetime.now().isoformat())
    pagina = noticia.get('pagina')
    canonical = f'{SITE_URL}/{pagina}'

    schema = f'''{{
      "@context": "https://schema.org",
      "@type": "NewsArticle",
      "headline": "{titulo}",
      "description": "{descripcion}",
      "datePublished": "{fecha}",
      "dateModified": "{fecha}",
      "author": {{
        "@type": "Organization",
        "name": "Alhaurín al Día"
      }},
      "publisher": {{
        "@type": "Organization",
        "name": "Alhaurín al Día"
      }},
      "mainEntityOfPage": "{canonical}",
      "image": ["{imagen}"]
    }}'''

    return f'''<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{titulo} | Alhaurín al Día</title>
<meta name="description" content="{descripcion}">
<link rel="canonical" href="{canonical}">
<meta property="og:title" content="{titulo}">
<meta property="og:description" content="{descripcion}">
<meta property="og:image" content="{imagen}">
<meta property="og:url" content="{canonical}">
<script type="application/ld+json">
{schema}
</script>
<link rel="stylesheet" href="../styles.css">
</head>
<body>
<div class="container" style="padding:60px 20px;max-width:900px;">
<a href="../index.html">← Volver</a>
<h1>{titulo}</h1>
<p><strong>{categoria}</strong> · {fuente}</p>
<img src="{imagen}" alt="{titulo}" style="width:100%;border-radius:20px;margin:20px 0;">
<p style="font-size:20px;line-height:1.8;">{descripcion}</p>
<p>
<a href="{enlace}" target="_blank">Leer noticia original</a>
</p>
</div>
</body>
</html>'''


def generar_paginas():
    if not OUTPUT_FILE.exists():
        print('No existe noticias.json')
        return

    with open(OUTPUT_FILE, 'r', encoding='utf-8') as f:
        noticias = json.load(f)

    NOTICIAS_DIR.mkdir(exist_ok=True)

    for noticia in noticias:
        slug = slugify(noticia.get('titulo','noticia'))
        ruta = f'noticias/{slug}.html'
        noticia['pagina'] = ruta

        archivo = BASE_DIR / ruta
        archivo.write_text(generar_html_noticia(noticia), encoding='utf-8')

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(noticias, f, ensure_ascii=False, indent=2)

    print('Páginas generadas:', len(noticias))


if __name__ == '__main__':
    generar_paginas()
