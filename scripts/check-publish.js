const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REQUIRED_FILES = [
  'index.html',
  'noticias/index.html',
  'guia-util/index.html',
  'guia-util/farmacias/index.html',
  'contacto/index.html',
  'sobre-nosotros/index.html',
  'robots.txt',
  'sitemap.xml',
  'sitemap-index.xml',
  'sitemap-news.xml',
  '_headers',
  '_redirects',
  'data/noticias.json',
  'data/guia-util.json',
];

const REQUIRED_SITEMAP_URLS = [
  'https://alhaurinaldia.es/',
  'https://alhaurinaldia.es/noticias/',
  'https://alhaurinaldia.es/guia-util/',
  'https://alhaurinaldia.es/guia-util/farmacias/',
  'https://alhaurinaldia.es/contacto/',
  'https://alhaurinaldia.es/sobre-nosotros/',
];

const REQUIRED_ROBOTS_LINES = [
  'Sitemap: https://alhaurinaldia.es/sitemap-index.xml',
];

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function read(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function readJson(relPath, fallback) {
  try {
    return JSON.parse(read(relPath));
  } catch (error) {
    return fallback;
  }
}

function checkRequiredFiles(errors) {
  for (const relPath of REQUIRED_FILES) {
    if (!fileExists(relPath)) errors.push(`Falta archivo obligatorio: ${relPath}`);
  }
}

function checkReportsIgnored(errors, warnings) {
  const gitignore = fileExists('.gitignore') ? read('.gitignore') : '';
  if (!/reports\/\*\.json/.test(gitignore)) {
    errors.push('.gitignore no ignora reports/*.json');
  }

  const reportsDir = path.join(ROOT, 'reports');
  if (!fs.existsSync(reportsDir)) return;

  const jsonReports = fs.readdirSync(reportsDir).filter(name => name.endsWith('.json'));
  if (jsonReports.length) {
    warnings.push(`Hay informes locales en reports/: ${jsonReports.join(', ')}. Deben permanecer ignorados por Git.`);
  }
}

function checkSitemap(errors) {
  if (!fileExists('sitemap.xml')) return;
  const sitemap = read('sitemap.xml');

  for (const url of REQUIRED_SITEMAP_URLS) {
    if (!sitemap.includes(`<loc>${url}</loc>`)) errors.push(`sitemap.xml no contiene ${url}`);
  }

  if (/index_old\.html/i.test(sitemap)) errors.push('sitemap.xml incluye index_old.html');
  if (/\/tmp\//i.test(sitemap)) errors.push('sitemap.xml incluye rutas /tmp/');
  if (/farmacias-de-guardia-alhaurin-grande/i.test(sitemap)) errors.push('sitemap.xml incluye landing antigua de farmacias');
}

function checkRobots(errors) {
  if (!fileExists('robots.txt')) return;
  const robots = read('robots.txt');

  for (const line of REQUIRED_ROBOTS_LINES) {
    if (!robots.includes(line)) errors.push(`robots.txt no contiene: ${line}`);
  }

  if (/sitemap-servicios\.xml/i.test(robots)) errors.push('robots.txt declara sitemap-servicios.xml, que no se genera');
}

function checkCloudflareFiles(errors) {
  if (fileExists('_headers')) {
    const headers = read('_headers');
    if (!/X-Content-Type-Options:\s*nosniff/i.test(headers)) errors.push('_headers no define X-Content-Type-Options: nosniff');
    if (!/Referrer-Policy:/i.test(headers)) errors.push('_headers no define Referrer-Policy');
    if (!/Cache-Control:/i.test(headers)) errors.push('_headers no define reglas Cache-Control');
  }

  if (fileExists('_redirects')) {
    const redirects = read('_redirects');
    if (!/https:\/\/alhaurinaldia\.com\/\*/i.test(redirects)) errors.push('_redirects no redirige alhaurinaldia.com');
    if (!/https:\/\/www\.alhaurinaldia\.com\/\*/i.test(redirects)) errors.push('_redirects no redirige www.alhaurinaldia.com');
    if (!/https:\/\/www\.alhaurinaldia\.es\/\*/i.test(redirects)) errors.push('_redirects no redirige www.alhaurinaldia.es');
    if (!/https:\/\/alhaurinaldia\.es\/:splat\s+301!/i.test(redirects)) errors.push('_redirects no fuerza el dominio canónico alhaurinaldia.es');
  }
}

function checkNewsIndex(errors) {
  if (!fileExists('noticias/index.html')) return;
  const html = read('noticias/index.html');
  if (!/<link\s+rel=["']canonical["'][^>]+https:\/\/alhaurinaldia\.es\/noticias\//i.test(html)) {
    errors.push('noticias/index.html no tiene canonical correcto');
  }
}

function checkHome(errors) {
  if (!fileExists('index.html')) return;
  const html = read('index.html');

  if (!/<link\s+rel=["']canonical["'][^>]+https:\/\/alhaurinaldia\.es\//i.test(html)) {
    errors.push('index.html no tiene canonical correcto');
  }

  if (!/NewsMediaOrganization/.test(html)) {
    errors.push('index.html no contiene JSON-LD NewsMediaOrganization');
  }

  if (!/id=["']featured-news["']/i.test(html)) {
    errors.push('index.html no contiene el contenedor #featured-news para renderizado dinámico');
  }

  if (!/id=["']news-container["']/i.test(html)) {
    errors.push('index.html no contiene el contenedor #news-container para renderizado dinámico');
  }

  if (!/id=["']guide-container["']/i.test(html)) {
    errors.push('index.html no contiene el contenedor #guide-container para renderizado dinámico');
  }
}

function checkData(errors, warnings) {
  const noticias = readJson('data/noticias.json', null);
  const guia = readJson('data/guia-util.json', null);

  if (!Array.isArray(noticias)) errors.push('data/noticias.json no es un array válido');
  else if (noticias.length === 0) errors.push('data/noticias.json no contiene noticias');
  else if (noticias.length < 10) warnings.push(`data/noticias.json contiene pocas noticias: ${noticias.length}`);
  else if (noticias.length > 30) warnings.push(`data/noticias.json contiene más noticias de las previstas: ${noticias.length}`);

  if (!Array.isArray(guia)) errors.push('data/guia-util.json no es un array válido');
  else if (guia.length < 5) warnings.push(`data/guia-util.json contiene pocos recursos: ${guia.length}`);
}

function checkAuditReports(errors, warnings) {
  const seoReportPath = 'reports/seo-audit-report.json';
  const orphanReportPath = 'reports/orphan-pages-report.json';

  if (fileExists(seoReportPath)) {
    const report = readJson(seoReportPath, null);
    if (report?.summary?.criticalCount > 0) errors.push(`SEO audit tiene críticos: ${report.summary.criticalCount}`);
    if (report?.summary?.warningsCount > 0) warnings.push(`SEO audit tiene avisos: ${report.summary.warningsCount}`);
  } else {
    warnings.push('No existe reports/seo-audit-report.json. Ejecuta npm run seo:audit antes de publicar.');
  }

  if (fileExists(orphanReportPath)) {
    const report = readJson(orphanReportPath, null);
    if (report?.summary?.orphanNewsCount > 0) errors.push(`Hay noticias huérfanas: ${report.summary.orphanNewsCount}`);
    if (report?.summary?.orphanGuideCount > 0) errors.push(`Hay páginas de guía huérfanas: ${report.summary.orphanGuideCount}`);
    if (report?.summary?.orphanEventoCount > 0) errors.push(`Hay páginas de eventos huérfanas: ${report.summary.orphanEventoCount}`);
    if (report?.summary?.temporaryPagesCount > 0) errors.push(`Hay páginas temporales: ${report.summary.temporaryPagesCount}`);
    if (report?.summary?.unexpectedHtmlCount > 0) errors.push(`Hay HTML inesperados: ${report.summary.unexpectedHtmlCount}`);
  } else {
    warnings.push('No existe reports/orphan-pages-report.json. Ejecuta npm run seo:orphans antes de publicar.');
  }
}

function main() {
  const errors = [];
  const warnings = [];

  checkRequiredFiles(errors);
  checkReportsIgnored(errors, warnings);
  checkSitemap(errors);
  checkRobots(errors);
  checkCloudflareFiles(errors);
  checkNewsIndex(errors);
  checkHome(errors);
  checkData(errors, warnings);
  checkAuditReports(errors, warnings);

  console.log('Publish check');
  console.log('-------------');

  if (warnings.length) {
    console.log('\nAvisos:');
    warnings.forEach(warning => console.log(`- ${warning}`));
  }

  if (errors.length) {
    console.log('\nErrores:');
    errors.forEach(error => console.log(`- ${error}`));
    console.log('\nResultado: FAIL');
    process.exit(1);
  }

  console.log('\nResultado: OK');
}

main();
