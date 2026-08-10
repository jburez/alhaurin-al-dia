const fs = require('fs');
const path = require('path');

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

function renderActionHeroButtons(links = []) {
  if (!links.length) return '';
  return links.map(link => `
    <a href="${escapeHtml(link.url || '#')}" target="_blank" rel="noopener noreferrer" class="btn-action-pill">
      <span>${escapeHtml(link.texto || 'Abrir enlace oficial')}</span> ↗
    </a>
  `).join('');
}

function renderStreamItems(items = [], links = []) {
  if (!items.length) {
    return '<p class="resource-muted">Información pendiente de ampliar con datos verificados.</p>';
  }

  return items.map((text, idx) => {
    const link = links[idx] || (links.length === 1 ? links[0] : null);
    const actionHTML = link
      ? `<div class="stream-link-wrapper">
           <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="stream-action-btn">
             <span>${escapeHtml(link.texto || 'Abrir enlace oficial')}</span> →
           </a>
         </div>`
      : '';

    return `
      <div class="stream-item">
        <div class="stream-number">${String(idx + 1).padStart(2, '0')}</div>
        <div class="stream-body">
          <div class="stream-content">${escapeHtml(text)}</div>
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
  const heroButtons = renderActionHeroButtons(item.links || []);
  const streamItems = renderStreamItems(item.items || [], item.links || []);

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
        .guide-detail-page { padding: 40px 0 60px; background: #faf8f5; }
        .guide-breadcrumbs { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); margin-bottom: 20px; }
        .guide-breadcrumbs a { color: var(--accent); font-weight: 700; text-decoration: none; }
        .guide-header-shell { background: #ffffff; border-radius: 24px; padding: clamp(24px, 4vw, 40px); border: 1px solid var(--line); box-shadow: 0 4px 20px rgba(0,0,0,0.03); margin-bottom: 32px; }
        .guide-header-badge { display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px; border-radius: 999px; background: rgba(69, 92, 54, 0.08); color: var(--accent); font-size: 12px; font-weight: 900; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 12px; }
        .guide-header-shell h1 { font-family: var(--font-display); font-size: clamp(26px, 4vw, 38px); color: var(--ink); margin: 0 0 12px; line-height: 1.2; }
        .guide-header-shell p.lead { font-size: 16px; color: var(--muted); line-height: 1.6; margin: 0 0 24px; max-width: 800px; }
        .action-hero-buttons { display: flex; flex-wrap: wrap; gap: 12px; }
        .btn-action-pill { display: inline-flex; align-items: center; gap: 6px; padding: 12px 20px; border-radius: 999px; background: var(--accent); color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none; transition: background 0.2s ease, transform 0.2s ease; }
        .btn-action-pill:hover { background: #354829; transform: translateY(-2px); color: #ffffff; }

        /* Stream / Timeline fluido */
        .guide-stream-container { background: #ffffff; border-radius: 24px; padding: clamp(24px, 4vw, 40px); border: 1px solid var(--line); box-shadow: 0 4px 20px rgba(0,0,0,0.03); }
        .stream-title { font-family: var(--font-display); font-size: 22px; color: var(--ink); margin: 0 0 24px; display: flex; align-items: center; gap: 10px; }
        .stream-list { display: flex; flex-direction: column; gap: 20px; }
        .stream-item { display: grid; grid-template-columns: 44px 1fr; gap: 16px; padding: 20px; border-radius: 16px; background: #fdfbf7; border: 1px solid #e8e2d4; transition: border-color 0.2s ease; }
        .stream-item:hover { border-color: rgba(69, 92, 54, 0.4); }
        .stream-number { width: 44px; height: 44px; border-radius: 12px; background: rgba(69, 92, 54, 0.1); color: var(--accent); font-weight: 900; font-size: 15px; display: grid; place-items: center; flex-shrink: 0; }
        .stream-body { display: flex; flex-direction: column; justify-content: center; gap: 10px; }
        .stream-content { font-size: 15px; color: #2d3748; line-height: 1.6; font-weight: 600; }
        .stream-link-wrapper { margin-top: 4px; }
        .stream-action-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; background: rgba(69, 92, 54, 0.08); color: var(--accent); font-size: 13px; font-weight: 800; text-decoration: none; transition: background 0.2s ease; }
        .stream-action-btn:hover { background: rgba(69, 92, 54, 0.18); text-decoration: none; }

        @media(max-width: 640px) {
            .stream-item { grid-template-columns: 1fr; }
            .stream-number { display: none; }
        }
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
    <main class="guide-detail-page">
        <div class="container">
            <nav class="guide-breadcrumbs" aria-label="Migas de pan">
                <a href="/">Inicio</a> <span>›</span>
                <a href="/guia-util/">Guía útil</a> <span>›</span>
                <span>${escapeHtml(title)}</span>
            </nav>

            <header class="guide-header-shell">
                <div class="guide-header-badge"><span>${escapeHtml(icon)}</span> <span>${escapeHtml(category)}</span></div>
                <h1>${escapeHtml(title)}</h1>
                <p class="lead">${escapeHtml(description)}</p>
                <div class="action-hero-buttons">
                    ${heroButtons}
                    <a href="/guia-util/" class="btn-action-pill" style="background: transparent; color: var(--accent); border: 1px solid var(--accent);">← Volver a Guía útil</a>
                </div>
            </header>

            <section class="guide-stream-container">
                <h2 class="stream-title">📌 Pasos clave y enlaces verificados</h2>
                <div class="stream-list">
                    ${streamItems}
                </div>

                <div class="resource-note">
                    <strong>Nota de Alhaurín al Día</strong>
                    <p>Alhaurín al Día recopila y organiza esta información para facilitar el acceso a recursos útiles de Alhaurín el Grande, respetando la fuente original y enlazando siempre al contenido de referencia.</p>
                </div>
            </section>
        </div>
    </main>
    <footer><div class="container"><span>© 2026 Alhaurín al Día · Guía local independiente</span><div class="footer-links"><a href="/noticias/">Noticias</a><a href="/guia-util/">Guía útil</a><a href="/avisos/">Avisos</a><a href="/tiempo/">Tiempo</a><a href="/planes/">Planes</a><a href="/comercios/">Comercios</a><a href="/anunciarse/">Anunciarse</a></div></div></footer>
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
