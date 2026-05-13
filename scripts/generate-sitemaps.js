const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://alhaurinaldia.es';
const NEWS_PUBLICATION_NAME = 'Alhaurín al Día';
const NEWS_LANGUAGE = 'es';
const NEWS_MAX_AGE_MS = 48 * 60 * 60 * 1000;

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'assets', 'tmp', 'reports']);
const IGNORE_FILES = new Set(['404.html', 'index_old.html']);
const SERVICE_URLS = new Set([
  '/avisos/',
  '/tiempo/',
  '/planes/',
  '/comercios/',
  '/anunciarse/',
  '/contacto/',
]);

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

function fileDate(file) {
  return fs.statSync(file).mtime.toISOString().slice(0, 10);
}

function fileIsoDate(file) {
  return fs.statSync(file).mtime.toISOString();
}

function meta(url) {
  if (url === '/') return { changefreq: 'hourly', priority: '1.0' };
  if (url === '/noticias/') return { changefreq: 'hourly', priority: '0.95' };
  if (url === '/guia-util/') return { changefreq: 'weekly', priority: '0.95' };
  if (url === '/guia-util/farmacias/') return { changefreq: 'daily', priority: '0.95' };
  if (url === '/guia-util/farmacias/calendario/') return { changefreq: 'daily', priority: '0.95' };
  if (url === '/avisos/' || url === '/tiempo/') return { changefreq: 'daily', priority: '0.9' };
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

function renderSitemapIndex(sitemaps) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    sitemaps.map(name => `  <sitemap>\n    <loc>${SITE_URL}/${name}</loc>\n    <lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>\n  </sitemap>`).join('\n') +
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
}));

const pharmacyEntries = entries.filter(entry =>
  entry.url === '/guia-util/farmacias/' || entry.url.startsWith('/guia-util/farmacias/')
);

const serviceEntries = entries.filter(entry => SERVICE_URLS.has(entry.url));

const newsEntries = entries.filter(entry =>
  entry.url === '/noticias/' || entry.url.startsWith('/noticias/') || entry.url.startsWith('/categoria/')
);

const now = Date.now();
const googleNewsEntries = entries
  .filter(entry => entry.url.startsWith('/noticias/') && entry.url !== '/noticias/' && entry.url.endsWith('.html'))
  .filter(entry => now - fs.statSync(entry.file).mtime.getTime() <= NEWS_MAX_AGE_MS)
  .map(entry => ({
    url: entry.url,
    publicationDate: fileIsoDate(entry.file),
    title: extractTitle(entry.file)
  }));

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), renderUrlset(entries));
fs.writeFileSync(path.join(ROOT, 'sitemap-farmacias.xml'), renderUrlset(pharmacyEntries));
fs.writeFileSync(path.join(ROOT, 'sitemap-servicios.xml'), renderUrlset(serviceEntries));
fs.writeFileSync(path.join(ROOT, 'sitemap-noticias.xml'), renderUrlset(newsEntries));
fs.writeFileSync(path.join(ROOT, 'sitemap-news.xml'), renderNewsUrlset(googleNewsEntries));

const sitemapFiles = fs.readdirSync(ROOT)
  .filter(file => /^sitemap.*\.xml$/.test(file))
  .filter(file => file !== 'sitemap-index.xml')
  .sort();

fs.writeFileSync(path.join(ROOT, 'sitemap-index.xml'), renderSitemapIndex(sitemapFiles));

console.log(`Sitemap principal generado: ${entries.length} URLs`);
console.log(`Sitemap farmacias generado: ${pharmacyEntries.length} URLs`);
console.log(`Sitemap servicios generado: ${serviceEntries.length} URLs`);
console.log(`Sitemap noticias generado: ${newsEntries.length} URLs`);
console.log(`Google News sitemap generado: ${googleNewsEntries.length} noticias recientes`);
console.log(`Sitemap index generado: ${sitemapFiles.length} sitemaps`);
