const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://alhaurinaldia.es';

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'assets']);
const IGNORE_FILES = new Set(['404.html']);

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

function meta(url) {
  if (url === '/') return { changefreq: 'hourly', priority: '1.0' };
  if (url === '/noticias/') return { changefreq: 'hourly', priority: '0.95' };
  if (url === '/guia-util/') return { changefreq: 'weekly', priority: '0.95' };
  if (url === '/guia-util/farmacias/') return { changefreq: 'daily', priority: '0.95' };
  if (url === '/guia-util/farmacias/calendario/') return { changefreq: 'daily', priority: '0.95' };
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

function renderUrlset(entries) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map(entry => `  <url>\n    <loc>${xmlEscape(SITE_URL + entry.url)}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`).join('\n') +
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
  return { url, lastmod: fileDate(file), ...meta(url) };
}));

const pharmacyEntries = entries.filter(entry =>
  entry.url === '/guia-util/farmacias/' || entry.url.startsWith('/guia-util/farmacias/')
);

const newsEntries = entries.filter(entry =>
  entry.url === '/noticias/' || entry.url.startsWith('/noticias/') || entry.url.startsWith('/categoria/')
);

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), renderUrlset(entries));
fs.writeFileSync(path.join(ROOT, 'sitemap-farmacias.xml'), renderUrlset(pharmacyEntries));
fs.writeFileSync(path.join(ROOT, 'sitemap-noticias.xml'), renderUrlset(newsEntries));

const sitemapFiles = fs.readdirSync(ROOT)
  .filter(file => /^sitemap.*\.xml$/.test(file))
  .filter(file => file !== 'sitemap-index.xml')
  .sort();

fs.writeFileSync(path.join(ROOT, 'sitemap-index.xml'), renderSitemapIndex(sitemapFiles));

console.log(`Sitemap principal generado: ${entries.length} URLs`);
console.log(`Sitemap farmacias generado: ${pharmacyEntries.length} URLs`);
console.log(`Sitemap noticias generado: ${newsEntries.length} URLs`);
console.log(`Sitemap index generado: ${sitemapFiles.length} sitemaps`);
