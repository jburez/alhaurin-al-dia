const fs = require('fs');
const path = require('path');
const { SITE_FOOTER_HTML } = require('./lib/footer');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://alhaurinaldia.es';
const GUIDE_FILE = path.join(ROOT, 'data', 'guia-util.json');
const GUIDE_DIR = path.join(ROOT, 'guia-util');
const SKIP_IDS = new Set([
  'farmacias',
]);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripLeadingSlash(value = '') {
  return String(value).replace(/^\/+/, '');
}

function pageUrl(item) {
  const id = item.id || '';
  const pagina = item.pagina || item.enlace || `/guia-util/${id}/`;
  return `${SITE_URL}/${stripLeadingSlash(pagina).replace(/index\.html$/, '')}`.replace(/([^:]\/)\/+/g, '$1');
}

function renderJsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data, null, 2)}</script>`;
}

function renderOfficialLinkButtons(links = []) {
  if (!links.length) return '';
  return links.map(link => `
    <a href="${escapeHtml(link.url || '#')}" target="_blank" rel="noopener noreferrer" class="editorial-btn-link">
      <span>${escapeHtml(link.texto || 'Abrir enlace oficial')}</span>
      <span class="btn-arrow">↗</span>
    </a>
  `).join('');
}

function renderEditorialSteps(items = [], links = []) {
  if (!items.length) {
    return '<p class="editorial-muted">Información pendiente de ampliar con datos verificados.</p>';
  }

  return items.map((text, idx) => {
    const link = links[idx] || (links.length === 1 ? links[0] : null);
    const actionHTML = link
      ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="editorial-inline-action">
           ${escapeHtml(link.texto || 'Abrir enlace')} →
         </a>`
      : '';

    return `
      <div class="editorial-step-card">
        <div class="editorial-step-bullet">✓</div>
        <div class="editorial-step-content">
          <p>${escapeHtml(text)}</p>
          ${actionHTML}
        </div>
      </div>
    `;
  }).join('');
}

function renderFaq(item) {
  const title = item.titulo || 'Recurso local';
  const description = item.descripcion || 'Información práctica de Alhaurín el Grande.';

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `¿Qué información ofrece ${title}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: description,
        },
      },
      {
        '@type': 'Question',
        name: '¿La información sustituye a la fuente oficial?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'No. Alhaurín al Día organiza la información y enlaza a fuentes oficiales o de referencia para verificar los datos actualizados.',
        },
      },
    ],
  };
}

function renderPage(item) {
  const title = item.titulo || 'Recurso local';
  const description = item.descripcion || 'Información práctica de Alhaurín el Grande.';
  const category = item.categoria || 'Guía útil';
  const icon = item.icono || '•';
  const canonical = pageUrl(item);
  const officialButtons = renderOfficialLinkButtons(item.links || []);
  const stepsHTML = renderEditorialSteps(item.items || [], item.links || []);

  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: title,
    url: canonical,
    description,
    inLanguage: 'es-ES',
    isPartOf: {
      '@type': 'WebSite',
      name: 'Alhaurín al Día',
      url: SITE_URL,
    },
    about: {
      '@type': 'Thing',
      name: title,
    },
    contentLocation: {
      '@type': 'Place',
      name: 'Alhaurín el Grande',
    },
  };

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: 'Guía útil', item: `${SITE_URL}/guia-util/` },
      { '@type': 'ListItem', position: 3, name: title, item: canonical },
    ],
  };

  return `<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} — Alhaurín al Día</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="index, follow, max-image-preview:large">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="Alhaurín al Día">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
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

        .editorial-section-heading { font-family: 'Fraunces', Georgia, serif; font-size: 20px; color: #181d17; margin: 0 0 18px; font-weight: 700; }
        .editorial-steps-wrapper { display: flex; flex-direction: column; gap: 14px; margin-bottom: 32px; }
        .editorial-step-card { display: flex; gap: 14px; align-items: flex-start; padding: 16px 18px; border-radius: 6px; background: #fbf9f5; border: 1px solid #eae3d5; }
        .editorial-step-bullet { width: 24px; height: 24px; border-radius: 4px; background: rgba(69, 92, 54, 0.12); color: #455c36; font-weight: 900; font-size: 12px; display: grid; place-items: center; flex-shrink: 0; margin-top: 2px; }
        .editorial-step-content { flex: 1; font-size: 14.5px; color: #2c3529; line-height: 1.55; }
        .editorial-step-content p { margin: 0; font-weight: 600; }
        .editorial-inline-action { display: inline-flex; align-items: center; gap: 4px; margin-top: 6px; color: #455c36; font-size: 13px; font-weight: 800; text-decoration: none; }
        .editorial-inline-action:hover { text-decoration: underline; }

        .editorial-disclaimer { background: rgba(69, 92, 54, 0.05); border-left: 4px solid #455c36; border-radius: 0 6px 6px 0; padding: 16px 18px; margin-top: 10px; }
        .editorial-disclaimer strong { display: block; color: #455c36; font-size: 12px; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 4px; }
        .editorial-disclaimer p { margin: 0; color: #666666; font-size: 13px; line-height: 1.5; }

        .editorial-back-link { display: inline-block; margin-top: 24px; color: #455c36; font-size: 14px; font-weight: 800; text-decoration: none; }
        .editorial-back-link:hover { text-decoration: underline; }
    </style>
    ${renderJsonLd(webPage)}
    ${renderJsonLd(breadcrumb)}
    ${renderJsonLd(renderFaq(item))}
</head>
<body>
    <div class="topbar"><div class="container"><span>Guía local independiente de Alhaurín el Grande</span><span>${escapeHtml(category)} · Recurso útil</span></div></div>
    <header><div class="container"><nav aria-label="Navegación principal">
        <a class="logo" href="/" aria-label="Alhaurín al Día"><span class="logo-mark">A</span><span><strong>Alhaurín al Día</strong><span>Información local útil</span></span></a>
        <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-menu" aria-label="Abrir menú de navegación"><span></span><span></span><span></span></button>
        <div class="nav-links" id="main-menu"><a href="/noticias/">Noticias</a><a href="/guia-util/">Guía útil</a><a href="/avisos/">Avisos</a><a href="/tiempo/">Tiempo</a><a href="/planes/">Planes</a><a href="/comercios/">Comercios</a><a href="/anunciarse/" class="nav-cta">Anunciarse</a></div>
    </nav></div></header>
    <main class="editorial-page-wrap">
        <div class="editorial-container">
            <nav class="editorial-breadcrumbs" aria-label="Migas de pan">
                <a href="/">Inicio</a> <span class="sep">›</span>
                <a href="/guia-util/">Guía útil</a> <span class="sep">›</span>
                <span>${escapeHtml(title)}</span>
            </nav>

            <article class="editorial-main-card">
                <div class="editorial-header-tag"><span>${escapeHtml(icon)}</span> <span>${escapeHtml(category)}</span></div>
                <h1>${escapeHtml(title)}</h1>
                <p class="editorial-lead">${escapeHtml(description)}</p>

                ${officialButtons ? `
                <div class="editorial-buttons-group">
                    ${officialButtons}
                </div>
                ` : ''}

                <h2 class="editorial-section-heading">Información práctica y accesos</h2>
                <div class="editorial-steps-wrapper">
                    ${stepsHTML}
                </div>

                <div class="editorial-disclaimer">
                    <strong>Nota de Alhaurín al Día</strong>
                    <p>Alhaurín al Día recopila y organiza esta información para facilitar el acceso a recursos útiles de Alhaurín el Grande, respetando la fuente original y enlazando siempre al contenido de referencia.</p>
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
}

function main() {
  const items = readJson(GUIDE_FILE, []);
  if (!Array.isArray(items)) {
    console.error('data/guia-util.json no contiene un array');
    process.exit(1);
  }

  let count = 0;
  let skipped = 0;
  let unchanged = 0;

  for (const item of items) {
    if (!item.id) continue;
    if (SKIP_IDS.has(item.id)) {
      skipped += 1;
      continue;
    }

    const dir = path.join(GUIDE_DIR, item.id);
    const file = path.join(dir, 'index.html');
    const rendered = renderPage(item);
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === rendered) {
      unchanged += 1;
      continue;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, rendered);
    count += 1;
  }

  console.log(`Páginas de guía útil renderizadas: ${count}`);
  console.log(`Páginas de guía útil sin cambios: ${unchanged}`);
  console.log(`Páginas de guía útil protegidas: ${skipped}`);
}

main();
