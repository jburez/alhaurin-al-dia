const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://alhaurinaldia.es';
const WARN_ONLY = process.argv.includes('--warn-only');
const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_FILE = path.join(REPORT_DIR, 'seo-audit-report.json');
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'assets', 'reports', 'tmp']);
const IGNORE_FILES = new Set(['404.html', 'index_old.html']);

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

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\b(alhaurin|alhaurin el grande|el grande|malaga|2026|noticias|actualidad)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function signature(value = '') {
  const words = normalizeText(value)
    .split(' ')
    .filter(word => word.length > 3)
    .slice(0, 12);
  return words.join(' ');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function auditHtmlFiles() {
  const htmlFiles = walk(ROOT);
  const missingCanonical = [];
  const searchAction = [];
  const missingTitle = [];
  const missingDescription = [];

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, 'utf8');
    const url = toUrl(file);

    if (!/<link\s+rel=["']canonical["']/i.test(html)) {
      missingCanonical.push(url);
    }
    if (/SearchAction|\/buscar\//i.test(html)) {
      searchAction.push(url);
    }
    if (!/<title>[^<]+<\/title>/i.test(html)) {
      missingTitle.push(url);
    }
    if (!/<meta\s+name=["']description["']\s+content=["'][^"']{40,}["']/i.test(html)) {
      missingDescription.push(url);
    }
  }

  return {
    totalHtml: htmlFiles.length,
    missingCanonical,
    searchAction,
    missingTitle,
    missingDescription,
  };
}

function auditSitemaps() {
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  const sitemapIndexPath = path.join(ROOT, 'sitemap-index.xml');
  const robotsPath = path.join(ROOT, 'robots.txt');
  const issues = [];

  if (!fs.existsSync(sitemapPath)) issues.push('Falta sitemap.xml');
  if (!fs.existsSync(sitemapIndexPath)) issues.push('Falta sitemap-index.xml');
  if (!fs.existsSync(robotsPath)) issues.push('Falta robots.txt');

  if (fs.existsSync(sitemapPath)) {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    if (/index_old\.html/i.test(sitemap)) issues.push('sitemap.xml incluye index_old.html');
    if (!/\/contacto\//i.test(sitemap)) issues.push('sitemap.xml no incluye /contacto/');
    if (!/\/sobre-nosotros\//i.test(sitemap)) issues.push('sitemap.xml no incluye /sobre-nosotros/');
  }

  if (fs.existsSync(robotsPath)) {
    const robots = fs.readFileSync(robotsPath, 'utf8');
    if (!/Sitemap:\s*https:\/\/alhaurinaldia\.es\/sitemap-index\.xml/i.test(robots)) {
      issues.push('robots.txt no apunta a sitemap-index.xml');
    }
    if (/sitemap-servicios\.xml/i.test(robots)) {
      issues.push('robots.txt sigue declarando sitemap-servicios.xml');
    }
  }

  return { issues };
}

function auditNewsDuplicates() {
  const newsPath = path.join(ROOT, 'data', 'noticias.json');
  const noticias = readJson(newsPath, []);
  const byPage = new Map();
  const bySourceUrl = new Map();
  const bySignature = new Map();
  const duplicatePages = [];
  const duplicateSourceUrls = [];
  const possibleDuplicateTitles = [];

  for (const noticia of noticias) {
    const page = noticia.pagina || '';
    const sourceUrl = noticia.enlace || noticia.url || '';
    const sig = signature(`${noticia.titulo || ''} ${noticia.descripcion || noticia.resumen || ''}`);

    if (page) {
      if (byPage.has(page)) duplicatePages.push([byPage.get(page), noticia]);
      else byPage.set(page, noticia);
    }

    if (sourceUrl) {
      if (bySourceUrl.has(sourceUrl)) duplicateSourceUrls.push([bySourceUrl.get(sourceUrl), noticia]);
      else bySourceUrl.set(sourceUrl, noticia);
    }

    if (sig && sig.length >= 25) {
      if (bySignature.has(sig)) possibleDuplicateTitles.push([bySignature.get(sig), noticia]);
      else bySignature.set(sig, noticia);
    }
  }

  return {
    totalNews: noticias.length,
    duplicatePages: duplicatePages.map(pair => pair.map(toNewsSummary)),
    duplicateSourceUrls: duplicateSourceUrls.map(pair => pair.map(toNewsSummary)),
    possibleDuplicateTitles: possibleDuplicateTitles.map(pair => pair.map(toNewsSummary)),
  };
}

function toNewsSummary(noticia) {
  return {
    titulo: noticia.titulo || '',
    pagina: noticia.pagina || '',
    fuente: noticia.fuente || '',
    enlace: noticia.enlace || noticia.url || '',
    fecha: noticia.fecha || '',
  };
}

function main() {
  const html = auditHtmlFiles();
  const sitemaps = auditSitemaps();
  const news = auditNewsDuplicates();

  const criticalCount =
    html.searchAction.length +
    html.missingCanonical.length +
    html.missingTitle.length +
    html.missingDescription.length +
    sitemaps.issues.length +
    news.duplicatePages.length +
    news.duplicateSourceUrls.length;

  const warningsCount = news.possibleDuplicateTitles.length;

  const report = {
    generatedAt: new Date().toISOString(),
    site: SITE_URL,
    summary: {
      criticalCount,
      warningsCount,
      status: criticalCount ? 'fail' : warningsCount ? 'warn' : 'ok',
    },
    html,
    sitemaps,
    news,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  console.log(`SEO audit: ${report.summary.status.toUpperCase()}`);
  console.log(`HTML analizados: ${html.totalHtml}`);
  console.log(`Noticias analizadas: ${news.totalNews}`);
  console.log(`Críticos: ${criticalCount}`);
  console.log(`Avisos: ${warningsCount}`);
  console.log(`Informe: ${path.relative(ROOT, REPORT_FILE)}`);

  if (criticalCount && !WARN_ONLY) {
    process.exitCode = 1;
  }
}

main();
