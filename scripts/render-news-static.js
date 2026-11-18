// Genera /noticias/index.html, presentado como «Actualidad» (la URL se mantiene).
//
// Las noticias agregadas de RSS pasan a segundo plano: el listado muestra solo
// titular, una línea, fuente y fecha, sin imágenes ni tarjetas grandes. Mientras
// no haya noticias originales, el listado queda en noindex (ver
// scripts/apply-news-origin.js).
//
// El contenedor se llama #actualidad-list (no #news-container) para que
// js/app.js no lo vuelva a pintar en cliente.

const fs = require('fs');
const path = require('path');
const {
  SITE_URL, escapeHtml, renderPage, renderBreadcrumbs, breadcrumbSchema, writeIfChanged,
} = require('./lib/layout');
const { renderActualidadList } = require('./lib/actualidad');

const ROOT = path.resolve(__dirname, '..');
const NEWS_INDEX_FILE = path.join(ROOT, 'noticias', 'index.html');
const NEWS_FILE = path.join(ROOT, 'data', 'noticias.json');

function main() {
  const noticias = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8')) || [];
  const hasOriginal = noticias.some((n) => n.origen === 'original');
  const canonical = `${SITE_URL}/noticias/`;
  const crumbs = [{ name: 'Inicio', url: '/' }, { name: 'Actualidad', url: '/noticias/' }];

  const body = `
        <section class="alh-page-header">
            <div class="container alh-narrow">
                ${renderBreadcrumbs(crumbs)}
                <span class="alh-kicker">Actualidad</span>
                <h1>Actualidad de Alhaurín el Grande</h1>
                <p class="alh-lead">Titulares recientes sobre Alhaurín el Grande publicados por el Ayuntamiento, medios locales y entidades del municipio. Cada titular enlaza a un resumen breve y, desde ahí, a la información completa en su fuente original.</p>
            </div>
        </section>
        <section class="alh-section">
            <div class="container alh-narrow">
                <div class="alh-note">
                    <strong>Cómo funciona esta sección</strong>
                    <p>Alhaurín al Día no redacta estas noticias: las recoge de fuentes públicas para que puedas verlas de un vistazo y siempre indica quién las publicó. Si buscas algo práctico (la farmacia de guardia, los planes del fin de semana o cómo hacer un trámite), lo encontrarás en <a href="/farmacia-de-guardia/">Farmacia de guardia</a>, <a href="/agenda/">Agenda</a> y <a href="/guias/">Guías</a>.</p>
                </div>
                <div id="actualidad-list">
${renderActualidadList(noticias, { limit: 60 })}
                </div>
                <p class="alh-more"><a href="/noticias/archivo/">Ver titulares anteriores en el archivo →</a></p>
            </div>
        </section>`;

  const html = renderPage({
    title: 'Actualidad de Alhaurín el Grande — Alhaurín al Día',
    description: 'Titulares recientes sobre Alhaurín el Grande del Ayuntamiento, medios locales y entidades, con enlace a cada fuente original.',
    canonical,
    robots: hasOriginal ? 'index, follow' : 'noindex, follow',
    jsonld: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Actualidad de Alhaurín el Grande',
        url: canonical,
        inLanguage: 'es-ES',
        isPartOf: { '@type': 'WebSite', name: 'Alhaurín al Día', url: SITE_URL },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: Math.min(noticias.length, 60),
          itemListElement: noticias.slice(0, 60).map((n, i) => ({
            '@type': 'ListItem', position: i + 1, url: `${SITE_URL}/${n.pagina}`, name: n.titulo,
          })),
        },
      },
      breadcrumbSchema(crumbs),
    ],
    body,
  });

  writeIfChanged(fs, NEWS_INDEX_FILE, html);
  console.log(`noticias/index.html («Actualidad») regenerado: ${noticias.length} titulares (${escapeHtml(hasOriginal ? 'indexable' : 'noindex')}).`);
}

main();
