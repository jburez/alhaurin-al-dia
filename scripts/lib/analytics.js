// Script de Cloudflare Web Analytics, compartido por todos los generadores Node.
//
// Fuente única de verdad del snippet de analítica. Debe mantenerse idéntico a
// scripts/lib/analytics.py (versión Python) y al que lleva ya insertado el
// HTML ya publicado (ver scripts/migrate-analytics-2026-08.js, que lo inserta
// retroactivamente en todo el HTML ya generado). Token obtenido en Cloudflare
// > Analytics & Logs > Web Analytics > alhaurinaldia.es (modo manual: el
// automático no llegaba a inyectarse vía GitHub Pages).

const CF_ANALYTICS_SNIPPET = `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' data-cf-beacon='{"token": "dc9eeda336f943ca87175a3b83faee35"}'></script>`;

module.exports = { CF_ANALYTICS_SNIPPET };
