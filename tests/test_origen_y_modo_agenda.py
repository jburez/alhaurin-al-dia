"""
Tests del reposicionamiento de noticias (noviembre 2026):
- la IA queda apagada por defecto y solo se activa con --reescribir-ia;
- toda noticia generada lleva origen "rss" y su página sale en noindex con
  la fuente visible y enlazada con rel="nofollow noopener";
- el detector de eventos de --modo agenda.
Ejecutar con:  python3 tests/test_origen_y_modo_agenda.py
"""
import json
import os
import sys
import tempfile
from datetime import date
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import generar_noticias as gn  # noqa: E402
from lib import detector_eventos as de  # noqa: E402

fallos = []


def check(nombre, condicion, detalle=""):
    print(f"{'OK' if condicion else 'FALLA'} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


print("=== 1. IA apagada por defecto ===")
with patch.dict(os.environ, {"OPENAI_API_KEY": "sk-falsa"}):
    gn.configurar_desde_argv([])
    check("sin flag -> ia_activada False aunque haya clave", gn.ia_activada() is False)
    gn.configurar_desde_argv(["--reescribir-ia"])
    check("con --reescribir-ia y clave -> True", gn.ia_activada() is True)
with patch.dict(os.environ, {"OPENAI_API_KEY": ""}):
    check("con flag pero sin clave -> False", gn.ia_activada() is False)
gn.configurar_desde_argv([])
check("modo por defecto = noticias", gn.MODO == "noticias")
gn.configurar_desde_argv(["--modo", "agenda"])
check("--modo agenda", gn.MODO == "agenda")
gn.configurar_desde_argv([])

print("\n=== 2. Página de noticia RSS ===")
noticia = {
    "id": "x1", "titulo": "Titular de prueba", "descripcion": "Entradilla de prueba suficientemente larga.",
    "cuerpo": "Cuerpo.", "fecha": "2026-11-18T10:00:00+00:00", "fuente": "RTV Alhaurín el Grande",
    "categoria": "Actualidad", "enlace": "https://ejemplo.es/noticia", "pagina": "noticias/titular-de-prueba.html",
    "origen": "rss",
}
html = gn.generar_html_noticia(noticia, [noticia])
check("robots noindex, follow", '<meta name="robots" content="noindex, follow">' in html)
check("texto de atribución visible", "Información publicada originalmente por" in html)
check("enlace a la fuente con nofollow noopener", 'href="https://ejemplo.es/noticia" target="_blank" rel="nofollow noopener"' in html)
original = dict(noticia, origen="original")
html_o = gn.generar_html_noticia(original, [original])
check("original -> index", 'content="index, follow, max-image-preview:large"' in html_o)
check("original -> sin nota de origen RSS", "article-origin-note" not in html_o)
sin_origen = {k: v for k, v in noticia.items() if k != "origen"}
check("sin campo origen se trata como rss", gn.es_origen_rss(sin_origen))

print("\n=== 3. Detector de eventos ===")
hoy = date(2026, 11, 18)
ok, claves, fechas = de.es_evento("Concierto de Navidad", "El concierto será el 20 de diciembre en la iglesia.", hoy)
check("concierto con fecha futura -> evento", ok and "concierto" in claves and fechas[0] == date(2026, 12, 20))
ok, _, _ = de.es_evento("Concierto celebrado", "El concierto fue el 2 de noviembre.", hoy)
check("fecha pasada -> no evento", not ok)
ok, _, _ = de.es_evento("Aprobado el presupuesto", "El pleno se reunió el 25 de noviembre.", hoy)
check("sin palabra clave -> no evento", not ok)
ok, _, fechas = de.es_evento("Taller de cerámica", "Inscripciones abiertas. Taller el 5/1 en la biblioteca.", hoy)
check("fecha numérica sin año -> próximo año", ok and fechas[0] == date(2027, 1, 5))
ok, claves, _ = de.es_evento("Procesión extraordinaria", "Saldrá el sábado 22 de noviembre.", hoy)
check("procesión (con tilde) detectada", ok and "procesion" in claves)

print("\n=== 4. Borradores: fusión sin duplicados y nunca publicados ===")
with tempfile.TemporaryDirectory() as tmp:
    ruta = Path(tmp) / "agenda_borradores.json"
    b = de.construir_borrador("Feria", "Feria el 1 de diciembre", "https://e.es/feria", "Fuente", ["feria"], [date(2026, 12, 1)])
    check("estado borrador", b["estado"] == "borrador")
    check("añade 1", de.guardar_borradores(ruta, [b]) == 1)
    check("no duplica", de.guardar_borradores(ruta, [b]) == 0)
    datos = json.loads(ruta.read_text(encoding="utf-8"))
    check("fichero con 1 borrador", len(datos["borradores"]) == 1)

print()
if fallos:
    print(f"FALLOS: {len(fallos)} -> {fallos}")
    sys.exit(1)
print("Todos los tests pasan.")
