// Plantilla común de las páginas generadas por Node (guías, agenda, utilidades,
// comercios, legales…). Reúne en un único sitio:
//
//   - el <head> con SEO básico, Open Graph y JSON-LD;
//   - la integración de consentimiento (CMP) preparada pero sin proveedor;
//   - la navegación (scripts/lib/nav.js) y el pie (scripts/lib/footer.js);
//   - los huecos de anuncio con altura reservada (sin CLS);
//   - utilidades de fechas en Europe/Madrid.
//
// Las rutas son absolutas ("/css/…") para que funcionen a cualquier profundidad.

const { SITE_FOOTER_HTML } = require('./footer');
const { CF_ANALYTICS_SNIPPET } = require('./analytics');
const { renderNav } = require('./nav');

const SITE_URL = 'https://alhaurinaldia.es';
const SITE_NAME = 'Alhaurín al Día';
const CONTACT_EMAIL = 'contacto@alhaurinaldia.es';
const ADSENSE_CLIENT = 'ca-pub-3892603819928798';
const TIMEZONE = 'Europe/Madrid';

// Barra superior con accesos a las herramientas de la comunidad (mismo estilo
// .topbar que las páginas antiguas).
const TOPBAR_HTML = `<div class="topbar">
        <div class="container">
            <span>Guía práctica de Alhaurín el Grande</span>
            <div class="topbar-right">
                <a href="/radar-social/" class="topbar-link">📡 Radar Social</a>
                <a href="/seguimiento/" class="topbar-link">🔴 En directo</a>
                <a href="/boletin-oficial/" class="topbar-link">📋 Boletín Oficial</a>
                <a href="/mi-alhaurin/" class="topbar-link highlight">⭐ Mi Alhaurín</a>
            </div>
        </div>
    </div>`;

// Bloque de consentimiento que se inserta en el <head> de TODAS las páginas
// (scripts/sync-site-chrome.js lo propaga también al HTML ya publicado).
// Los anuncios NO se cargan aquí: los carga js/consent.js solo cuando un CMP
// certificado (TCF v2.2) ha registrado la decisión del usuario.
const CONSENT_HEAD_HTML = `<!-- alh-consent:start -->
    <meta name="google-adsense-account" content="${ADSENSE_CLIENT}">
    <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',wait_for_update:500});</script>
    <!-- CMP: pegar aquí el script del gestor de consentimiento certificado por Google (TCF v2.2). Ver docs/ARQUITECTURA.md, apartado «Consentimiento». -->
    <script src="/js/consent.js" defer></script>
    <!-- alh-consent:end -->`;

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function absoluteUrl(pathname = '/') {
  if (/^https?:\/\//.test(pathname)) return pathname;
  return `${SITE_URL}${pathname.startsWith('/') ? '' : '/'}${pathname}`;
}

function jsonLdScript(data) {
  const json = JSON.stringify(data, null, 2).replace(/<\//g, '<\\/');
  return `<script type="application/ld+json">${json}</script>`;
}

function breadcrumbSchema(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

function renderBreadcrumbs(items) {
  const parts = items.map((item, index) => {
    const last = index === items.length - 1;
    return last
      ? `<span aria-current="page">${escapeHtml(item.name)}</span>`
      : `<a href="${escapeHtml(item.url)}">${escapeHtml(item.name)}</a>`;
  });
  return `<nav class="alh-breadcrumbs" aria-label="Migas de pan">${parts.join('<span class="sep" aria-hidden="true">›</span>')}</nav>`;
}

const PUBLISHER = {
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/favicon.svg` },
};

// Hueco de anuncio con altura reservada desde el primer render. `id` identifica
// la ubicación (js/consent.js le asigna la unidad de AdSense configurada).
function adSlot(id, variant = 'contenido') {
  return `<div class="alh-ad alh-ad-${escapeHtml(variant)}" data-ad-ubicacion="${escapeHtml(id)}" role="complementary" aria-label="Publicidad"><span class="alh-ad-label">Publicidad</span></div>`;
}

function renderHead({ title, description, canonical, robots = 'index, follow', ogType = 'website', image = '', css = [], jsonld = [] }) {
  const img = image || `${SITE_URL}/assets/favicon.svg`;
  const cssLinks = ['/css/styles.css', '/css/mobile.css', '/css/ads.css', '/css/guia.css', ...css]
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join('\n    ');
  return `<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta name="robots" content="${escapeHtml(robots)}">
    <link rel="canonical" href="${escapeHtml(canonical)}">
    <meta property="og:type" content="${escapeHtml(ogType)}">
    <meta property="og:site_name" content="${SITE_NAME}">
    <meta property="og:locale" content="es_ES">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(canonical)}">
    <meta property="og:image" content="${escapeHtml(img)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(img)}">
    <meta name="theme-color" content="#24402B">
    <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
    ${cssLinks}
    ${CONSENT_HEAD_HTML}
    ${jsonld.map(jsonLdScript).join('\n    ')}
    ${CF_ANALYTICS_SNIPPET}
</head>`;
}

function renderPage({ title, description, canonical, robots, ogType, image, css, jsonld = [], body, scripts = [], bodyClass = '' }) {
  const head = renderHead({ title, description, canonical, robots, ogType, image, css, jsonld });
  const extraScripts = scripts.map((src) => `<script src="${src}" defer></script>`).join('\n    ');
  return `<!doctype html>
<html lang="es">
${head}
<body${bodyClass ? ` class="${escapeHtml(bodyClass)}"` : ''} id="top">
    <a class="skip-link" href="#contenido">Saltar al contenido</a>
    ${TOPBAR_HTML}
    <header>
        <div class="container">
            ${renderNav()}
        </div>
    </header>
    <main id="contenido" class="alh-main">
${body}
    </main>
    ${SITE_FOOTER_HTML}
    <script src="/js/app.js" defer></script>
    ${extraScripts}
</body>
</html>
`;
}

// ---------- Fechas (Europe/Madrid) ----------

function madridParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return { iso: `${get('year')}-${get('month')}-${get('day')}`, weekday: get('weekday') };
}

// Fecha "de hoy" del build. Se puede fijar con BUILD_DATE=AAAA-MM-DD (tests).
function todayIso() {
  if (process.env.BUILD_DATE && /^\d{4}-\d{2}-\d{2}$/.test(process.env.BUILD_DATE)) return process.env.BUILD_DATE;
  return madridParts().iso;
}

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function weekdayIndex(iso) {
  // 0 = domingo … 6 = sábado
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatDateLong(iso, { weekday = true, year = true } = {}) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const base = `${d} de ${MESES[m - 1]}${year ? ` de ${y}` : ''}`;
  return weekday ? `${DIAS[weekdayIndex(iso.slice(0, 10))]} ${base}` : base;
}

function formatDateShort(iso) {
  if (!iso) return '';
  const [, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${MESES[m - 1].slice(0, 3)}`;
}

function capitalize(text = '') {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function slugify(text = '', max = 80) {
  return String(text)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

// Escribe solo si el contenido cambia (el mtime alimenta el lastmod del sitemap).
function writeIfChanged(fs, file, content) {
  const path = require('path');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.writeFileSync(file, content);
  return true;
}

// Texto visible de un HTML (sin scripts, estilos, nav, header ni footer).
function visibleText(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  SITE_URL,
  SITE_NAME,
  CONTACT_EMAIL,
  ADSENSE_CLIENT,
  CONSENT_HEAD_HTML,
  PUBLISHER,
  escapeHtml,
  absoluteUrl,
  jsonLdScript,
  breadcrumbSchema,
  renderBreadcrumbs,
  adSlot,
  renderHead,
  renderPage,
  todayIso,
  addDays,
  weekdayIndex,
  formatDateLong,
  formatDateShort,
  capitalize,
  slugify,
  writeIfChanged,
  visibleText,
  DIAS,
  MESES,
};
