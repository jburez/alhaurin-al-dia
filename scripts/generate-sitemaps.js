const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://alhaurinaldia.es';
const NEWS_PUBLICATION_NAME = 'Alhaurín al Día';
const NEWS_LANGUAGE = 'es';
const NEWS_MAX_AGE_MS = 48 * 60 * 60 * 1000;

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'assets', 'tmp', 'reports']);
const IGNORE_FILES = new Set(['404.html', 'index_old.html']);
// Páginas de utilidad e información del proyecto (sitemap-servicios.xml).
const SERVICE_URLS = new Set([
  '/farmacia-de-guardia/',
  '/avisos/',
  '/boletin-oficial/',
  '/tiempo/',
  '/tiempo/comparador/',
  '/tiempo/agro/',
  '/tiempo/prevision-horaria/',
  '/tiempo/radar/',
  '/seguimiento/',
  '/radar-social/',
  '/mi-alhaurin/',
  '/contacto/',
  '/sobre-nosotros/',
  '/privacidad/',
  '/cookies/',
  '/aviso-legal/',
]);
const isServiceUrl = (url) => SERVICE_URLS.has(url) ||
  (url.startsWith('/guia-util/') && !url.startsWith('/guia-util/farmacias/'));
const isGuideUrl = (url) => url.startsWith('/guias/');
const isAgendaUrl = (url) => url === '/agenda/' || url === '/este-fin-de-semana/' ||
  url.startsWith('/planes/') || url === '/virgen-de-gracia-2026/';
const isCommerceUrl = (url) => url.startsWith('/comercios/') || url === '/anunciarse/';

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html') && !IGNORE_FILES.has(entry.name)) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

function toUrl(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.replace(/index\.html$/, '');
  return '/' + rel;
}

// Google desaconseja listar en el sitemap una URL cuyo propio <link
// rel="canonical"> apunta a otra página (p.ej. los stubs de redirección de
// scripts/merge-duplicate-archive-2026-08.js, o /planes/calendario/, que ya
// se colaba desde antes de eso). Sin este filtro, el sitemap seguiría
// enviando a Google páginas que la propia página dice que no son la buena.
function isNonCanonical(file, url) {
  const html = fs.readFileSync(file, 'utf8');
  const match = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (!match) return false;
  const canonical = match[1].trim();
  const ownUrl = (SITE_URL + url).trim();
  return canonical !== ownUrl;
}

// Una página con <meta name="robots" content="noindex…"> nunca debe ir en un
// sitemap (sería una contradicción). Así salen automáticamente las noticias de
// origen RSS, las guías en borrador y los eventos pasados hace más de 30 días.
function isNoindex(file) {
  const html = fs.readFileSync(file, 'utf8');
  const match = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i);
  return Boolean(match && /noindex/i.test(match[1]));
}

// Fechas reales. Antes se usaba el mtime del fichero, pero en GitHub Actions
// el checkout y el render reescriben todo en cada ejecución, así que todas las
// URLs salían "modificadas hoy" y Google News recibía cientos de noticias con
// la fecha de publicación del momento del build.
//  - Noticias: la fecha de publicación guardada en data/noticias*.json.
//  - Resto de páginas: la fecha del último commit que tocó el fichero.
//  - Si no hay ninguna de las dos, el mtime como último recurso.
const { execFileSync } = require('child_process');

function readNewsList(file) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    if (Array.isArray(data)) return data;
    return Object.values(data).find(Array.isArray) || [];
  } catch (_) {
    return [];
  }
}

const NEWS_DATES = new Map();
for (const file of ['data/noticias-archivo.json', 'data/noticias.json']) {
  for (const item of readNewsList(file)) {
    if (!item || !item.pagina || !item.fecha) continue;
    const time = Date.parse(item.fecha);
    if (Number.isNaN(time)) continue;
    const key = '/' + String(item.pagina).replace(/^\/+/, '');
    NEWS_DATES.set(key, new Date(time));
  }
}

const GIT_DATES = new Map();
try {
  const log = execFileSync('git', ['log', '--format=@%cI', '--name-only', '--', '*.html'], {
    cwd: ROOT, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore']
  });
  let current = null;
  for (const line of log.split('\n')) {
    if (line.startsWith('@')) { current = line.slice(1); continue; }
    if (line && current && !GIT_DATES.has(line)) GIT_DATES.set(line, new Date(current));
  }
} catch (_) {
  // Sin git (o clon superficial): se usará el mtime.
}

function realDate(file) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  return NEWS_DATES.get('/' + rel) || GIT_DATES.get(rel) || fs.statSync(file).mtime;
}

function fileDate(file) {
  return realDate(file).toISOString().slice(0, 10);
}

function fileIsoDate(file) {
  return realDate(file).toISOString();
}

function meta(url) {
  if (url === '/') return { changefreq: 'hourly', priority: '1.0' };
  if (url === '/noticias/') return { changefreq: 'hourly', priority: '0.95' };
  if (url === '/guia-util/') return { changefreq: 'weekly', priority: '0.95' };
  if (url === '/guia-util/farmacias/') return { changefreq: 'daily', priority: '0.95' };
  if (url === '/guia-util/farmacias/calendario/') return { changefreq: 'daily', priority: '0.95' };
  if (url === '/avisos/' || url === '/tiempo/' || url === '/boletin-oficial/') return { changefreq: 'daily', priority: '0.9' };
  if (url === '/farmacia-de-guardia/' || url === '/este-fin-de-semana/' || url === '/agenda/') return { changefreq: 'daily', priority: '0.95' };
  if (url === '/guias/') return { changefreq: 'weekly', priority: '0.9' };
  if (url.startsWith('/guias/')) return { changefreq: 'monthly', priority: '0.85' };
  if (url === '/planes/' || url === '/comercios/') return { changefreq: 'weekly', priority: '0.8' };
  if (url === '/contacto/') return { changefreq: 'monthly', priority: '0.6' };
  if (url.startsWith('/guia-util/farmacias/')) return { changefreq: 'weekly', priority: '0.85' };
  if (url.startsWith('/guia-util/')) return { changefreq: 'monthly', priority: '0.8' };
  if (url.startsWith('/noticias/')) return { changefreq: 'weekly', priority: '0.75' };
  if (url.startsWith('/categoria/')) return { changefreq: 'daily', priority: '0.8' };
  if (url.includes('eventos') || url.includes('feria')) return { changefreq: 'weekly', priority: '0.9' };
  if (url.includes('telefonos') || url.includes('restaurantes')) return { changefreq: 'weekly', priority: '0.85' };
  return { changefreq: 'monthly', priority: '0.7' };
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function extractTitle(file) {
  const html = fs.readFileSync(file, 'utf8');
  const og = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  if (og) return cleanTitle(og[1]);
  const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  if (h1) return cleanTitle(h1[1]);
  const title = html.match(/<title[^>]*>(.*?)<\/title>/is);
  if (title) return cleanTitle(title[1]);
  return path.basename(file, '.html').replace(/-/g, ' ');
}

function cleanTitle(value) {
  return String(value)
    .replace(/<[^>]+>/g, '')
    .replace(/\s+\|\s+Alhaurín al Día$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderUrlset(entries) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map(entry => `  <url>\n    <loc>${xmlEscape(SITE_URL + entry.url)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`).join('\n') +
    '\n</urlset>\n';
}

function renderNewsUrlset(entries) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n' +
    entries.map(entry => `  <url>\n    <loc>${xmlEscape(SITE_URL + entry.url)}</loc>\n    <news:news>\n      <news:publication>\n        <news:name>${xmlEscape(NEWS_PUBLICATION_NAME)}</news:name>\n        <news:language>${NEWS_LANGUAGE}</news:language>\n      </news:publication>\n      <news:publication_date>${entry.publicationDate}</news:publication_date>\n      <news:title>${xmlEscape(entry.title)}</news:title>\n    </news:news>\n  </url>`).join('\n') +
    '\n</urlset>\n';
}

function renderSitemapIndex(sitemaps, lastmods = {}) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    sitemaps.map(name => `  <sitemap>\n    <loc>${SITE_URL}/${name}</loc>\n    <lastmod>${lastmods[name] || new Date().toISOString().slice(0, 10)}</lastmod>\n  </sitemap>`).join('\n') +
    '\n</sitemapindex>\n';
}

function uniqueSorted(entries) {
  const map = new Map();
  for (const entry of entries) map.set(entry.url, entry);
  return Array.from(map.values()).sort((a, b) => {
    if (a.url === '/') return -1;
    if (b.url === '/') return 1;
    return a.url.localeCompare(b.url, 'es');
  });
}

const htmlFiles = walk(ROOT);

const entries = uniqueSorted(htmlFiles.map(file => {
  const url = toUrl(file);
  return { url, file, lastmod: fileDate(file), ...meta(url) };
}).filter(entry => !isNonCanonical(entry.file, entry.url) && !isNoindex(entry.file)));

const pharmacyEntries = entries.filter(entry =>
  entry.url === '/guia-util/farmacias/' || entry.url.startsWith('/guia-util/farmacias/')
);

const serviceEntries = entries.filter(entry => isServiceUrl(entry.url));
const guideEntries = entries.filter(entry => isGuideUrl(entry.url));
const agendaEntries = entries.filter(entry => isAgendaUrl(entry.url));
const commerceEntries = entries.filter(entry => isCommerceUrl(entry.url));

const newsEntries = entries.filter(entry =>
  entry.url === '/noticias/' || entry.url.startsWith('/noticias/') || entry.url.startsWith('/categoria/')
);

const now = Date.now();
const googleNewsEntries = entries
  .filter(entry => entry.url.startsWith('/noticias/') && entry.url !== '/noticias/' && entry.url.endsWith('.html'))
  .filter(entry => NEWS_DATES.has(entry.url) && now - NEWS_DATES.get(entry.url).getTime() <= NEWS_MAX_AGE_MS)
  .map(entry => ({
    url: entry.url,
    publicationDate: fileIsoDate(entry.file),
    title: extractTitle(entry.file)
  }));

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), renderUrlset(entries));
fs.writeFileSync(path.join(ROOT, 'sitemap-farmacias.xml'), renderUrlset(pharmacyEntries));
fs.writeFileSync(path.join(ROOT, 'sitemap-servicios.xml'), renderUrlset(serviceEntries));
fs.writeFileSync(path.join(ROOT, 'sitemap-noticias.xml'), renderUrlset(newsEntries));
fs.writeFileSync(path.join(ROOT, 'sitemap-guias.xml'), renderUrlset(guideEntries));
fs.writeFileSync(path.join(ROOT, 'sitemap-agenda.xml'), renderUrlset(agendaEntries));
fs.writeFileSync(path.join(ROOT, 'sitemap-comercios.xml'), renderUrlset(commerceEntries));
fs.writeFileSync(path.join(ROOT, 'sitemap-news.xml'), renderNewsUrlset(googleNewsEntries));

const sitemapFiles = [
  'sitemap.xml',
  'sitemap-news.xml',
  'sitemap-noticias.xml',
  'sitemap-farmacias.xml',
  'sitemap-servicios.xml',
  'sitemap-guias.xml',
  'sitemap-agenda.xml',
  'sitemap-comercios.xml',
].filter(file => fs.existsSync(path.join(ROOT, file)))
  // Un sitemap vacío (p. ej. el de Google News mientras no haya noticias
  // originales) se sigue escribiendo, pero no se anuncia en el índice.
  .filter(file => /<loc>/.test(fs.readFileSync(path.join(ROOT, file), 'utf8')));

const maxLastmod = list => list.reduce((max, entry) => (entry.lastmod > max ? entry.lastmod : max), '');
const indexLastmods = {
  'sitemap.xml': maxLastmod(entries),
  'sitemap-noticias.xml': maxLastmod(newsEntries),
  'sitemap-farmacias.xml': maxLastmod(pharmacyEntries),
  'sitemap-servicios.xml': maxLastmod(serviceEntries),
  'sitemap-guias.xml': maxLastmod(guideEntries),
  'sitemap-agenda.xml': maxLastmod(agendaEntries),
  'sitemap-comercios.xml': maxLastmod(commerceEntries),
  'sitemap-news.xml': googleNewsEntries.reduce((max, e) => (e.publicationDate > max ? e.publicationDate : max), '').slice(0, 10),
};
fs.writeFileSync(path.join(ROOT, 'sitemap-index.xml'), renderSitemapIndex(sitemapFiles, indexLastmods));

console.log(`Sitemap principal generado: ${entries.length} URLs`);
console.log(`Sitemap farmacias generado: ${pharmacyEntries.length} URLs`);
console.log(`Sitemap servicios generado: ${serviceEntries.length} URLs`);
console.log(`Sitemap noticias generado: ${newsEntries.length} URLs`);
console.log(`Sitemap guías generado: ${guideEntries.length} URLs`);
console.log(`Sitemap agenda generado: ${agendaEntries.length} URLs`);
console.log(`Sitemap comercios generado: ${commerceEntries.length} URLs`);
console.log(`Google News sitemap generado: ${googleNewsEntries.length} noticias recientes`);
console.log(`Sitemap index generado: ${sitemapFiles.length} sitemaps`);
