"""Script de Cloudflare Web Analytics, compartido por todos los generadores Python.

Fuente unica de verdad del snippet de analitica. Debe mantenerse identico a
scripts/lib/analytics.js (version Node) y al que llevan ya insertados las
paginas generadas a mano (ver scripts/migrate-analytics-2026-08.py, que lo
inserto retroactivamente en todo el HTML ya publicado). Token obtenido en
Cloudflare > Analytics & Logs > Web Analytics > alhaurinaldia.es (modo manual,
el automatico no llegaba a inyectarse via GitHub Pages).
"""

CF_ANALYTICS_SNIPPET = (
    "<script defer src='https://static.cloudflareinsights.com/beacon.min.js' "
    'data-cf-beacon=\'{"token": "dc9eeda336f943ca87175a3b83faee35"}\'></script>'
)
