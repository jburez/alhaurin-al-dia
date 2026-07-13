const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://alhaurinaldia.es';
const GUIDE_FILE = path.join(ROOT, 'data', 'guia-util.json');
const GUIDE_DIR = path.join(ROOT, 'guia-util');
const SKIP_IDS = new Set([
  'farmacias',
  'vivir-en-alhaurin',
  'aparcamiento',
  'restaurantes',
  'veterinarios',
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

function renderLinks(links = []) {
  if (!links.length) {
    return '<p class="resource-muted">Esta ficha se irá completando con fuentes y enlaces verificados.</p>';
  }

  return links.map(link => `
                    <a href="${escapeHtml(link.url || '#')}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.texto || 'Abrir enlace')}</a>
  `.trim()).join('');
}

function renderItems(items = []) {
  if (!items.length) {
    return '<li>Información pendiente de ampliar con datos verificados.</li>';
  }

  return items.map(item => `<li>${escapeHtml(item)}</li>`).join('');
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
  const id = item.id || 'recurso';
  const officialLinks = renderLinks(item.links || []);
  const items = renderItems(item.items || []);

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
    <link rel="stylesheet" href="/css/styles.css">
    <link rel="stylesheet" href="/css/mobile.css">
    <link rel="stylesheet" href="/css/ads.css">
    <style>
        .resource-hero { padding:58px 0 28px; }
        .resource-card { background:rgba(255,255,255,.92); border:1px solid var(--line); border-radius:36px; padding:clamp(28px,5vw,56px); box-shadow:var(--shadow); }
        .resource-layout { display:grid; grid-template-columns:1.1fr .9fr; gap:24px; align-items:start; margin-bottom:56px; }
        .resource-box { background:white; border:1px solid var(--line); border-radius:26px; padding:24px; box-shadow:var(--shadow-soft); }
        .resource-list { display:grid; gap:12px; padding-left:0; list-style:none; margin:22px 0 0; }
        .resource-list li { background:var(--paper-soft); border:1px solid var(--line); border-radius:18px; padding:14px; color:var(--ink); line-height:1.55; }
        .official-links { display:flex; flex-wrap:wrap; gap:10px; margin-top:18px; }
        .official-links a { display:inline-flex; padding:10px 13px; border-radius:999px; background:var(--brand-soft); border:1px solid #d9e6f0; color:var(--brand); font-size:13px; font-weight:900; }
        .resource-muted { color:var(--muted); line-height:1.7; }
        .resource-note { margin-top:18px; background:var(--paper-soft); border:1px solid var(--line); border-radius:18px; padding:16px; color:var(--muted); }
        .resource-note p { margin:8px 0 0; }
        @media(max-width:900px) { .resource-layout { grid-template-columns:1fr; } }
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
    <main>
        <section class="resource-hero"><div class="container"><div class="resource-card">
            <span class="eyebrow">${escapeHtml(category)}</span>
            <h1>${escapeHtml(title)}</h1>
            <p class="lead">${escapeHtml(description)}</p>
            <div class="actions"><a class="btn btn-primary" href="#informacion">Consultar información</a><a class="btn btn-secondary" href="/guia-util/">Volver a Guía útil</a></div>
        </div></div></section>
        <section id="informacion"><div class="container resource-layout">
            <article class="resource-box">
                <div class="guide-card-top"><div class="guide-icon">${escapeHtml(icon)}</div><div><span class="guide-category">${escapeHtml(category)}</span><h2>Información práctica</h2></div></div>
                <ul class="resource-list">${items}</ul>
                <div class="resource-note"><strong>Nota de Alhaurín al Día</strong><p>Alhaurín al Día recopila y organiza esta información para facilitar el acceso a recursos útiles de Alhaurín el Grande, respetando la fuente original y enlazando siempre al contenido de referencia.</p></div>
            </article>
            <aside class="resource-box">
                <span class="section-kicker">Fuentes y enlaces</span>
                <h2>Enlaces de referencia</h2>
                <p class="resource-muted">Consulta las fuentes oficiales o recursos externos antes de realizar gestiones, desplazamientos o reservas.</p>
                <div class="official-links">${officialLinks}</div>
                <div class="ad-slot ad-slot-sidebar" style="margin-top:22px;">Publicidad local</div>
            </aside>
        </div></section>
    </main>
    <footer><div class="container"><span>© 2026 Alhaurín al Día · Guía local independiente</span><div class="footer-links"><a href="/noticias/">Noticias</a><a href="/guia-util/">Guía útil</a><a href="/avisos/">Avisos</a><a href="/tiempo/">Tiempo</a><a href="/planes/">Planes</a><a href="/comercios/">Comercios</a><a href="/anunciarse/">Anunciarse</a></div></div></footer>
    <script src="/js/app.js"></script>
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
    // No reescribe si el contenido no cambió, para que el mtime del archivo
    // (usado como lastmod real en el sitemap) refleje la última modificación
    // de verdad y no la fecha del último build.
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
