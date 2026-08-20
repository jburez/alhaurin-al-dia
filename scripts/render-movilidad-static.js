// Genera /guia-util/movilidad/ a partir de data/transporte-ctmam.json (líneas
// reales del Consorcio de Transporte Metropolitano del Área de Málaga), en
// vez del bloque genérico de 4 bullets fijos que usa el resto de fichas de
// guia-util.json vía render-guide-pages.js (movilidad está en su SKIP_IDS,
// mismo patrón que farmacias).
//
// data/transporte-ctmam.json no lo escribía ni lo leía ningún script — era
// dato muerto, nunca visible en el sitio. No hay fuente oficial con API para
// mantenerlo fresco solo, así que sigue siendo edición manual del JSON (igual
// que farmacias.json), pero al menos ahora si se actualiza a mano, se ve.

const fs = require('fs');
const path = require('path');
const { SITE_FOOTER_HTML } = require('./lib/footer');
const { CF_ANALYTICS_SNIPPET } = require('./lib/analytics');
const { renderNav } = require('./lib/nav');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://alhaurinaldia.es';
const DATA_FILE = path.join(ROOT, 'data', 'transporte-ctmam.json');
const OUTPUT_FILE = path.join(ROOT, 'guia-util', 'movilidad', 'index.html');
const CANONICAL = `${SITE_URL}/guia-util/movilidad/`;

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderJsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data, null, 2)}</script>`;
}

function mapsUrl(parada) {
  const coords = parada.coordenadas;
  if (coords && coords.lat && coords.lng) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${parada.nombre} ${parada.direccion || ''} Alhaurín el Grande`)}`;
}

function renderLinea(linea) {
  const paradas = (linea.paradas_principales || [])
    .map((p) => `<li>${escapeHtml(p)}</li>`)
    .join('');

  return `
    <article class="linea-card">
      <div class="linea-card-header">
        <span class="linea-icon">${escapeHtml(linea.icono || '🚌')}</span>
        <div>
          <span class="linea-id">${escapeHtml(linea.id || '')}</span>
          <h3>${escapeHtml(linea.nombre || '')}</h3>
        </div>
      </div>
      <p class="linea-via">${escapeHtml(linea.operador || '')}${linea.via ? ` · Vía ${escapeHtml(linea.via)}` : ''}</p>
      <div class="linea-facts">
        <div><span>Frecuencia</span><strong>${escapeHtml(linea.frecuencia || 'Consultar')}</strong></div>
        <div><span>Duración aprox.</span><strong>${escapeHtml(linea.duracion_aprox || 'Consultar')}</strong></div>
      </div>
      ${paradas ? `<p class="linea-paradas-label">Paradas principales</p><ul class="linea-paradas">${paradas}</ul>` : ''}
      ${linea.notas ? `<p class="linea-notas">${escapeHtml(linea.notas)}</p>` : ''}
      ${linea.horario_url ? `<a href="${escapeHtml(linea.horario_url)}" target="_blank" rel="noopener noreferrer" class="editorial-inline-action">Ver horario oficial de ${escapeHtml(linea.id || 'la línea')} →</a>` : ''}
    </article>
  `;
}

function main() {
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const lineas = Array.isArray(data.lineas) ? data.lineas : [];
  const consorcio = data.consorcio || {};
  const consejos = Array.isArray(data.consejos) ? data.consejos : [];
  const parada = data.parada_alhaurin || {};

  const title = 'Líneas de autobús y horarios';
  const description = `Líneas del ${consorcio.nombre || 'Consorcio de Transporte Metropolitano del Área de Málaga'} que conectan Alhaurín el Grande con Málaga, Coín y el Hospital del Guadalhorce.`;

  const lineasHTML = lineas.map(renderLinea).join('');
  const consejosHTML = consejos.length
    ? `<h2 class="editorial-section-heading">Consejos prácticos</h2><ul class="movilidad-consejos">${consejos.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`
    : '';

  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url: CANONICAL,
    description,
    inLanguage: 'es-ES',
    isPartOf: { '@type': 'WebSite', name: 'Alhaurín al Día', url: SITE_URL },
    about: { '@type': 'Thing', name: title },
    contentLocation: { '@type': 'Place', name: 'Alhaurín el Grande' },
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Guía útil', item: `${SITE_URL}/guia-util/` },
      { '@type': 'ListItem', position: 3, name: title, item: CANONICAL },
    ],
  };

  const busSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: lineas.map((linea, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'BusTrip',
        name: linea.nombre,
        busName: linea.id,
        provider: { '@type': 'Organization', name: linea.operador || consorcio.nombre },
      },
    })),
  };

  const html = `<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} — Alhaurín al Día</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${escapeHtml(CANONICAL)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Alhaurín al Día">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(CANONICAL)}">
    <meta property="og:image" content="${SITE_URL}/assets/favicon.svg">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${SITE_URL}/assets/favicon.svg">
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap">
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="stylesheet" href="/css/mobile.css">
    <link rel="stylesheet" href="/css/ads.css">
    <style>
        .editorial-page-wrap { padding: 32px 0 60px; background: #fbf9f5; }
        .editorial-container { max-width: 860px; margin: 0 auto; padding: 0 20px; }

        .editorial-breadcrumbs { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: #666666; margin-bottom: 24px; flex-wrap: wrap; justify-content: flex-start; width: auto; }
        .editorial-breadcrumbs a { color: #455c36; font-weight: 700; text-decoration: none; }
        .editorial-breadcrumbs a:hover { text-decoration: underline; }
        .editorial-breadcrumbs span.sep { color: #999999; font-size: 11px; }

        .editorial-main-card { background: #ffffff; border: 1px solid var(--line); border-radius: 8px; padding: clamp(20px, 4vw, 32px); box-shadow: var(--shadow-soft); }
        .editorial-header-tag { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; border-radius: 4px; background: rgba(69, 92, 54, 0.08); color: #455c36; font-size: 12px; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 14px; }
        .editorial-main-card h1 { font-family: 'Fraunces', Georgia, serif; font-size: clamp(26px, 4vw, 36px); color: #181d17; margin: 0 0 12px; line-height: 1.25; font-weight: 700; }
        .editorial-lead { font-size: 16px; color: #555555; line-height: 1.6; margin: 0 0 28px; }

        .editorial-buttons-group { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #efe9de; }
        .editorial-btn-link { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 6px; background: #455c36; color: #ffffff; font-size: 13.5px; font-weight: 800; text-decoration: none; transition: background 0.18s ease, transform 0.18s ease; }
        .editorial-btn-link:hover { background: #354829; color: #ffffff; transform: translateY(-1px); }
        .editorial-btn-link .btn-arrow { font-size: 12px; opacity: 0.9; }

        .editorial-section-heading { font-family: 'Fraunces', Georgia, serif; font-size: 20px; color: #181d17; margin: 28px 0 18px; font-weight: 700; }
        .editorial-inline-action { display: inline-flex; align-items: center; gap: 4px; margin-top: 10px; color: #455c36; font-size: 13px; font-weight: 800; text-decoration: none; }
        .editorial-inline-action:hover { text-decoration: underline; }

        .lineas-wrapper { display: flex; flex-direction: column; gap: 16px; }
        .linea-card { padding: 18px 20px; border-radius: 6px; background: #fbf9f5; border: 1px solid #eae3d5; }
        .linea-card-header { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
        .linea-icon { font-size: 24px; }
        .linea-id { display: block; font-size: 11px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; color: #455c36; }
        .linea-card h3 { margin: 2px 0 0; font-size: 17px; color: #181d17; }
        .linea-via { margin: 0 0 12px; font-size: 13px; color: #666666; }
        .linea-facts { display: flex; flex-wrap: wrap; gap: 20px; margin-bottom: 10px; }
        .linea-facts div { font-size: 13px; }
        .linea-facts span { display: block; color: #888888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.03em; }
        .linea-facts strong { color: #181d17; }
        .linea-paradas-label { margin: 10px 0 4px; font-size: 12px; font-weight: 800; color: #455c36; text-transform: uppercase; letter-spacing: 0.03em; }
        .linea-paradas { margin: 0; padding-left: 18px; font-size: 13.5px; color: #2c3529; line-height: 1.6; }
        .linea-notas { margin: 10px 0 0; font-size: 13px; color: #666666; line-height: 1.5; }

        .movilidad-consejos { padding-left: 18px; margin: 0 0 28px; font-size: 14px; color: #2c3529; line-height: 1.7; }

        .parada-box { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; padding: 16px 20px; border-radius: 6px; background: rgba(69, 92, 54, 0.05); border-left: 4px solid #455c36; margin-bottom: 28px; }
        .parada-box strong { display: block; font-size: 15px; color: #181d17; }
        .parada-box span { font-size: 13px; color: #666666; }

        .editorial-disclaimer { background: rgba(69, 92, 54, 0.05); border-left: 4px solid #455c36; border-radius: 0 6px 6px 0; padding: 16px 18px; margin-top: 28px; }
        .editorial-disclaimer strong { display: block; color: #455c36; font-size: 12px; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 4px; }
        .editorial-disclaimer p { margin: 0; color: #666666; font-size: 13px; line-height: 1.5; }

        .editorial-back-link { display: inline-block; margin-top: 24px; color: #455c36; font-size: 14px; font-weight: 800; text-decoration: none; }
        .editorial-back-link:hover { text-decoration: underline; }
    </style>
    ${renderJsonLd(webPage)}
    ${renderJsonLd(breadcrumb)}
    ${renderJsonLd(busSchema)}
    ${CF_ANALYTICS_SNIPPET}
</head>
<body>
    <div class="topbar"><div class="container"><span>Guía local independiente de Alhaurín el Grande</span><span>Movilidad y Transporte · Recurso útil</span></div></div>
    <header><div class="container">${renderNav()}</div></header>
    <main class="editorial-page-wrap">
        <div class="editorial-container">
            <nav class="editorial-breadcrumbs" aria-label="Migas de pan">
                <a href="/">Inicio</a> <span class="sep">›</span>
                <a href="/guia-util/">Guía útil</a> <span class="sep">›</span>
                <span>${escapeHtml(title)}</span>
            </nav>

            <article class="editorial-main-card">
                <div class="editorial-header-tag"><span>🚌</span> <span>Movilidad y Transporte</span></div>
                <h1>${escapeHtml(title)}</h1>
                <p class="editorial-lead">${escapeHtml(description)}</p>

                <div class="editorial-buttons-group">
                    ${consorcio.web ? `<a href="${escapeHtml(consorcio.web)}" target="_blank" rel="noopener noreferrer" class="editorial-btn-link"><span>Web del Consorcio</span><span class="btn-arrow">↗</span></a>` : ''}
                    ${consorcio.telefono ? `<a href="tel:${escapeHtml(consorcio.telefono.replace(/\s+/g, ''))}" class="editorial-btn-link"><span>Llamar (${escapeHtml(consorcio.telefono)})</span><span class="btn-arrow">↗</span></a>` : ''}
                </div>

                ${parada.nombre ? `
                <div class="parada-box">
                    <div><strong>${escapeHtml(parada.nombre)}</strong><span>${escapeHtml(parada.direccion || '')}</span></div>
                    <a href="${escapeHtml(mapsUrl(parada))}" target="_blank" rel="noopener noreferrer" class="editorial-inline-action">Ver en el mapa →</a>
                </div>
                ` : ''}

                <h2 class="editorial-section-heading">Líneas disponibles</h2>
                <div class="lineas-wrapper">
                    ${lineasHTML}
                </div>

                ${consejosHTML}

                <div class="editorial-disclaimer">
                    <strong>Nota de Alhaurín al Día</strong>
                    <p>Horarios y frecuencias orientativos, sujetos a cambios por parte del Consorcio de Transporte Metropolitano. Confirma siempre en la web oficial o la app antes de viajar.</p>
                </div>
            </article>

            <a href="/guia-util/" class="editorial-back-link">← Volver a la Guía útil</a>
        </div>
    </main>
    ${SITE_FOOTER_HTML}
    <script src="/js/app.js" defer></script>
</body>
</html>
`;

  const dir = path.dirname(OUTPUT_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const previo = fs.existsSync(OUTPUT_FILE) ? fs.readFileSync(OUTPUT_FILE, 'utf8') : null;
  if (html !== previo) {
    fs.writeFileSync(OUTPUT_FILE, html);
    console.log(`[render-movilidad-static] ${OUTPUT_FILE} actualizado (${lineas.length} líneas).`);
  } else {
    console.log('[render-movilidad-static] Sin cambios.');
  }
}

main();
