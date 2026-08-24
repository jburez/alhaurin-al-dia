"""Tests de las 2 invariantes objetivas nuevas de validar_contenido.py
(task #19): canonical_valido y json_ld_news_article_valido. Contra el
módulo REAL. Ejecutar con: python3 test_validar_contenido_invariantes.py
"""
import json
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import validar_contenido as vc  # noqa: E402

fallos = []


def check(nombre, condicion, detalle=""):
    estado = "OK" if condicion else "FALLA"
    print(f"{estado} {nombre} {detalle}")
    if not condicion:
        fallos.append(nombre)


PAGINA = "noticias/articulo-de-prueba.html"
ETIQUETA = "id-prueba"
CANONICAL_OK = f'<link rel="canonical" href="{vc.SITE_URL}/{PAGINA}">'

NEWS_ARTICLE_OK = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": "Titular de prueba",
    "datePublished": "2026-08-20T10:00:00+00:00",
    "dateModified": "2026-08-20T10:00:00+00:00",
    "mainEntityOfPage": {"@type": "WebPage", "@id": f"{vc.SITE_URL}/{PAGINA}"},
}

BREADCRUMB_LIST = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": []}
ORGANIZATION = {"@context": "https://schema.org", "@type": "Organization", "name": "Alhaurín al Día"}
WEBSITE = {"@context": "https://schema.org", "@type": "WebSite", "name": "Alhaurín al Día"}


def script_ld_json(datos, atributos_extra=""):
    return f'<script type="application/ld+json"{atributos_extra}>{json.dumps(datos)}</script>'


print("=== canonical_valido ===")

print("\n--- 1. PASS: canonical correcto ---")
errores = vc.validar_canonical(f"<html><head>{CANONICAL_OK}</head></html>", PAGINA, ETIQUETA)
check("sin errores", errores == [], errores)

print("\n--- 2. FAIL: sin <link rel=\"canonical\"> ---")
errores = vc.validar_canonical("<html><head><title>x</title></head></html>", PAGINA, ETIQUETA)
check("1 error, menciona 'no tiene'", len(errores) == 1 and "no tiene" in errores[0], errores)

print("\n--- 3. FAIL: canonical apunta a otra URL ---")
html = f'<html><head><link rel="canonical" href="https://alhaurinaldia.es/noticias/otra.html"></head></html>'
errores = vc.validar_canonical(html, PAGINA, ETIQUETA)
check("1 error, menciona 'distinta'", len(errores) == 1 and "distinta" in errores[0], errores)

print("\n--- 4. FAIL: canonical con href vacío/inválido ---")
html = '<html><head><link rel="canonical" href=""></head></html>'
errores = vc.validar_canonical(html, PAGINA, ETIQUETA)
check("1 error, menciona 'inválido'", len(errores) == 1 and "inválido" in errores[0], errores)

print("\n--- 5. robustez: atributos en otro orden + whitespace ---")
html = f'''<html><head>
    <link
        href="{vc.SITE_URL}/{PAGINA}"
        rel="canonical"
    >
</head></html>'''
errores = vc.validar_canonical(html, PAGINA, ETIQUETA)
check("sin errores pese al orden/whitespace", errores == [], errores)


print("\n=== json_ld_news_article_valido ===")

print("\n--- 6. PASS: único bloque NewsArticle con las 3 claves ---")
html = f"<html><body>{script_ld_json(NEWS_ARTICLE_OK)}</body></html>"
errores = vc.validar_json_ld_news_article(html, PAGINA, ETIQUETA)
check("sin errores", errores == [], errores)

print("\n--- 7. PASS: 4 bloques reales (NewsArticle no es el primero) -> localizado por contenido ---")
html = "<html><body>" + "".join([
    script_ld_json(BREADCRUMB_LIST),
    script_ld_json(ORGANIZATION),
    script_ld_json(NEWS_ARTICLE_OK),
    script_ld_json(WEBSITE),
]) + "</body></html>"
errores = vc.validar_json_ld_news_article(html, PAGINA, ETIQUETA)
check("sin errores, NewsArticle encontrado aunque no es el primer bloque", errores == [], errores)

print("\n--- 8. FAIL: ningún bloque ld+json en la página ---")
errores = vc.validar_json_ld_news_article("<html><body>sin scripts</body></html>", PAGINA, ETIQUETA)
check("1 error, menciona 'no se encuentra'", len(errores) == 1 and "no se encuentra" in errores[0], errores)

print("\n--- 9. FAIL: hay ld+json pero ninguno con @type NewsArticle ---")
html = "<html><body>" + script_ld_json(BREADCRUMB_LIST) + script_ld_json(ORGANIZATION) + "</body></html>"
errores = vc.validar_json_ld_news_article(html, PAGINA, ETIQUETA)
check("1 error, menciona 'no se encuentra'", len(errores) == 1 and "no se encuentra" in errores[0], errores)

print("\n--- 10. FAIL: bloque NewsArticle con JSON mal formado ---")
html = '<html><body><script type="application/ld+json">{"@type": "NewsArticle", "headline": "x",</script></body></html>'
errores = vc.validar_json_ld_news_article(html, PAGINA, ETIQUETA)
check("1 error, menciona 'mal formado'", len(errores) == 1 and "mal formado" in errores[0], errores)

print("\n--- 11. FAIL: falta 'headline' ---")
sin_headline = {k: v for k, v in NEWS_ARTICLE_OK.items() if k != "headline"}
html = f"<html><body>{script_ld_json(sin_headline)}</body></html>"
errores = vc.validar_json_ld_news_article(html, PAGINA, ETIQUETA)
check("1 error, menciona 'headline'", len(errores) == 1 and "headline" in errores[0], errores)

print("\n--- 11b. FAIL: falta 'datePublished' ---")
sin_fecha = {k: v for k, v in NEWS_ARTICLE_OK.items() if k != "datePublished"}
html = f"<html><body>{script_ld_json(sin_fecha)}</body></html>"
errores = vc.validar_json_ld_news_article(html, PAGINA, ETIQUETA)
check("1 error, menciona 'datePublished'", len(errores) == 1 and "datePublished" in errores[0], errores)

print("\n--- 11c. FAIL: falta 'mainEntityOfPage' ---")
sin_main_entity = {k: v for k, v in NEWS_ARTICLE_OK.items() if k != "mainEntityOfPage"}
html = f"<html><body>{script_ld_json(sin_main_entity)}</body></html>"
errores = vc.validar_json_ld_news_article(html, PAGINA, ETIQUETA)
check("1 error, menciona 'mainEntityOfPage'", len(errores) == 1 and "mainEntityOfPage" in errores[0], errores)

print("\n--- 12. FAIL: 'headline' presente pero vacío ---")
vacio = {**NEWS_ARTICLE_OK, "headline": "   "}
html = f"<html><body>{script_ld_json(vacio)}</body></html>"
errores = vc.validar_json_ld_news_article(html, PAGINA, ETIQUETA)
check("1 error, menciona 'headline'", len(errores) == 1 and "headline" in errores[0], errores)

print("\n--- 13. PASS: <script id=\"schema-news\" nonce=\"abc\" type=\"application/ld+json\"> -> detectado por 'type', no por posición ---")
html = (
    '<html><body>'
    f'<script id="schema-news" nonce="abc" type="application/ld+json">{json.dumps(NEWS_ARTICLE_OK)}</script>'
    '</body></html>'
)
check("el HTML de prueba tiene el orden id/nonce/type pedido", 'id="schema-news" nonce="abc" type="application/ld+json"' in html)
errores = vc.validar_json_ld_news_article(html, PAGINA, ETIQUETA)
check("sin errores, detectado pese a type NO ser el primer atributo", errores == [], errores)


print("\n=== Integración: validar_noticia() real con BASE_DIR parcheado ===")


def noticia_base():
    return {
        "id": "id-integracion", "titulo": "Titular de integración suficientemente largo",
        "descripcion": "Descripcion suficientemente larga para pasar validaciones.",
        "resumen": "Descripcion suficientemente larga para pasar validaciones.",
        "cuerpo": "Cuerpo de la noticia de prueba con contenido suficiente para superar el mínimo.",
        "fecha": "2026-08-20T10:00:00+00:00", "fuente": "Test", "categoria": "Actualidad",
        "categoria_url": "categoria/actualidad/", "enlace": "https://x.example/a", "url": "https://x.example/a",
        "pagina": PAGINA,
    }


print("\n--- 14. página con canonical y JSON-LD correctos -> sin errores nuevos ---")
tmp1 = Path(tempfile.mkdtemp())
(tmp1 / "noticias").mkdir(parents=True)
html_ok = f"<html><head>{CANONICAL_OK}</head><body>{script_ld_json(NEWS_ARTICLE_OK)}</body></html>"
(tmp1 / PAGINA).write_text(html_ok, encoding="utf-8")
with patch.object(vc, "BASE_DIR", tmp1):
    errores, avisos = vc.validar_noticia(noticia_base(), 0, sitemap="")
check("sin errores relacionados con página/canonical/json-ld", not any("canonical" in e or "JSON-LD" in e for e in errores), errores)

print("\n--- 15. misma noticia con canonical roto -> error en errores (bloqueante), no en avisos ---")
tmp2 = Path(tempfile.mkdtemp())
(tmp2 / "noticias").mkdir(parents=True)
html_roto = f'<html><head><link rel="canonical" href="https://otro-sitio.example/x"></head><body>{script_ld_json(NEWS_ARTICLE_OK)}</body></html>'
(tmp2 / PAGINA).write_text(html_roto, encoding="utf-8")
with patch.object(vc, "BASE_DIR", tmp2):
    errores, avisos = vc.validar_noticia(noticia_base(), 0, sitemap="")
check("error de canonical presente en errores (bloqueante)", any("canonical" in e and "distinta" in e for e in errores), errores)
check("no aparece en avisos", not any("canonical" in a for a in avisos), avisos)


print()
if fallos:
    print(f"RESULTADO: {len(fallos)} fallo(s): {fallos}")
    sys.exit(1)
print("RESULTADO: todos los tests pasaron")
