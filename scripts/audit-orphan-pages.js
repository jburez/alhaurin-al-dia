const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://alhaurinaldia.es';
const NEWS_FILE = path.join(ROOT, 'data', 'noticias.json');
const NEWS_ARCHIVE_FILE = path.join(ROOT, 'data', 'noticias-archivo.json');
const GUIDE_FILE = path.join(ROOT, 'data', 'guia-util.json');
const EVENTO_SLUGS_FILE = path.join(ROOT, 'data', 'evento-slugs.json');
const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_FILE = path.join(REPORT_DIR, 'orphan-pages-report.json');
const WARN_ONLY = process.argv.includes('--warn-only');

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'assets', 'reports']);
const TEMP_DIRS = new Set(['tmp']);
const IGNORE_FILES = new Set(['404.html', 'index_old.html']);

const STRUCTURAL_URLS = new Set([
  '/',
  '/noticias/',
  '/noticias/archivo/',
  '/guia-util/',
  '/guia-util/farmacias/',
  '/guia-util/farmacias/calendario/',
  '/avisos/',
  '/tiempo/',
  '/tiempo/comparador/',
  '/tiempo/agro/',
  '/tiempo/prevision-horaria/',
  '/tiempo/radar/',
  '/seguimiento/',
  '/radar-social/',
  '/mi-alhaurin/',
  '/planes/',
  '/planes/calendario/',
  '/comercios/',
  '/anunciarse/',
  '/sobre-nosotros/',
  '/contacto/',
  '/admin/',
  '/boletin-oficial/',
  '/boletin-whatsapp.html',
  '/virgen-de-gracia-2026/',
]);

const GUIDE_SKIP_PREFIXES = [
  '/guia-util/farmacias/',
];

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html') && !IGNORE_FILES.has(entry.name)) {
      files.push(fullPath);
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

function normalizeUrlPath(value = '') {
  const clean = String(value)
    .trim()
    .replace(/^https?:\/\/alhaurinaldia\.es/i, '')
    .replace(/^\.?\//, '/')
    .replace(/\/index\.html$/, '/')
    .replace(/([^:]\/)\/+/g, '$1');

  if (!clean || clean === '#') return '';
  if (clean.startsWith('http://') || clean.startsWith('https://')) return '';
  if (clean.endsWith('.html')) return clean;
  return clean.endsWith('/') ? clean : `${clean}/`;
}

function normalizeNewsPage(value = '') {
  const clean = normalizeUrlPath(value);
  return clean.startsWith('/noticias/') ? clean : `/${clean.replace(/^\/+/, '')}`;
}

function isTempUrl(url) {
  return [...TEMP_DIRS].some(dir => url === `/${dir}/` || url.startsWith(`/${dir}/`));
}

function isCategoryUrl(url) {
  return url === '/categoria/' || url.startsWith('/categoria/');
}

function isGuideSpecial(url) {
  return GUIDE_SKIP_PREFIXES.some(prefix => url === prefix || url.startsWith(prefix));
}

function isEventoUrl(url) {
  return url.startsWith('/planes/') && url !== '/planes/' && url !== '/planes/calendario/';
}

function main() {
  const htmlFiles = walk(ROOT);
  const allUrls = htmlFiles.map(file => ({ file: path.relative(ROOT, file).replace(/\\/g, '/'), url: toUrl(file) }));
  const noticias = readJson(NEWS_FILE, []);
  const noticiasArchivo = readJson(NEWS_ARCHIVE_FILE, []);
  const guideItems = readJson(GUIDE_FILE, []);
  const eventoSlugs = readJson(EVENTO_SLUGS_FILE, {});

  const expectedNewsUrls = new Set(
    [...(Array.isArray(noticias) ? noticias : []), ...(Array.isArray(noticiasArchivo) ? noticiasArchivo : [])]
      .map(item => normalizeNewsPage(item.pagina || ''))
      .filter(Boolean)
  );

  const expectedGuideUrls = new Set(
    (Array.isArray(guideItems) ? guideItems : [])
      .map(item => normalizeUrlPath(item.pagina || item.enlace || `/guia-util/${item.id || ''}/`))
      .filter(Boolean)
  );

  const expectedEventoUrls = new Set(
    Object.values(eventoSlugs && typeof eventoSlugs === 'object' ? eventoSlugs : {})
      .map(slug => normalizeUrlPath(`/planes/${slug}/`))
      .filter(Boolean)
  );

  const orphanNewsPages = [];
  const orphanGuidePages = [];
  const orphanEventoPages = [];
  const temporaryPages = [];
  const unexpectedHtmlPages = [];

  for (const item of allUrls) {
    const { url, file } = item;

    if (isTempUrl(url)) {
      temporaryPages.push({ url, file });
      continue;
    }

    if (STRUCTURAL_URLS.has(url) || isCategoryUrl(url) || isGuideSpecial(url)) {
      continue;
    }

    if (url.startsWith('/noticias/') && url.endsWith('.html')) {
      if (!expectedNewsUrls.has(url)) orphanNewsPages.push({ url, file });
      continue;
    }

    if (url.startsWith('/guia-util/')) {
      if (!expectedGuideUrls.has(url)) orphanGuidePages.push({ url, file });
      continue;
    }

    if (isEventoUrl(url)) {
      if (!expectedEventoUrls.has(url)) orphanEventoPages.push({ url, file });
      continue;
    }

    unexpectedHtmlPages.push({ url, file });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    site: SITE_URL,
    summary: {
      htmlCount: allUrls.length,
      expectedNewsCount: expectedNewsUrls.size,
      expectedGuideCount: expectedGuideUrls.size,
      expectedEventoCount: expectedEventoUrls.size,
      orphanNewsCount: orphanNewsPages.length,
      orphanGuideCount: orphanGuidePages.length,
      orphanEventoCount: orphanEventoPages.length,
      temporaryPagesCount: temporaryPages.length,
      unexpectedHtmlCount: unexpectedHtmlPages.length,
      status: orphanNewsPages.length || orphanGuidePages.length || orphanEventoPages.length || temporaryPages.length || unexpectedHtmlPages.length ? 'warn' : 'ok',
    },
    orphanNewsPages,
    orphanGuidePages,
    orphanEventoPages,
    temporaryPages,
    unexpectedHtmlPages,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');

  console.log(`Orphan audit: ${report.summary.status.toUpperCase()}`);
  console.log(`HTML analizados: ${report.summary.htmlCount}`);
  console.log(`Noticias esperadas: ${report.summary.expectedNewsCount}`);
  console.log(`Guía útil esperada: ${report.summary.expectedGuideCount}`);
  console.log(`Eventos esperados: ${report.summary.expectedEventoCount}`);
  console.log(`Noticias huérfanas: ${report.summary.orphanNewsCount}`);
  console.log(`Guía útil huérfana: ${report.summary.orphanGuideCount}`);
  console.log(`Eventos huérfanos: ${report.summary.orphanEventoCount}`);
  console.log(`Temporales detectadas: ${report.summary.temporaryPagesCount}`);
  console.log(`HTML inesperados: ${report.summary.unexpectedHtmlCount}`);
  console.log(`Informe: ${path.relative(ROOT, REPORT_FILE)}`);

  if (report.summary.status !== 'ok' && !WARN_ONLY) {
    process.exitCode = 1;
  }
}

main();
