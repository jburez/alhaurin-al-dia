const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NEWS_DIR = path.join(ROOT, 'noticias');
const NEWS_FILE = path.join(ROOT, 'data', 'noticias.json');
const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_FILE = path.join(REPORT_DIR, 'orphan-news-clean-report.json');
const DELETE = process.argv.includes('--delete');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function normalizePage(value = '') {
  const clean = String(value)
    .trim()
    .replace(/^https?:\/\/alhaurinaldia\.es/i, '')
    .replace(/^\.?\//, '')
    .replace(/\\/g, '/');

  if (!clean || clean === '#') return '';
  return clean;
}

function listNewsHtmlFiles() {
  if (!fs.existsSync(NEWS_DIR)) return [];

  return fs.readdirSync(NEWS_DIR, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
    .map(entry => path.join(NEWS_DIR, entry.name));
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function main() {
  const noticias = readJson(NEWS_FILE, []);

  if (!Array.isArray(noticias)) {
    console.error('data/noticias.json no contiene un array');
    process.exit(1);
  }

  const activePages = new Set(
    noticias
      .map(item => normalizePage(item.pagina || ''))
      .filter(Boolean)
  );

  const htmlFiles = listNewsHtmlFiles();
  const orphanFiles = htmlFiles
    .map(file => ({ file, rel: relative(file) }))
    .filter(item => !activePages.has(item.rel));

  const deleted = [];
  const kept = [];

  for (const item of orphanFiles) {
    if (DELETE) {
      fs.unlinkSync(item.file);
      deleted.push(item.rel);
    } else {
      kept.push(item.rel);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: DELETE ? 'delete' : 'dry-run',
    activeNewsCount: activePages.size,
    htmlNewsCount: htmlFiles.length,
    orphanNewsCount: orphanFiles.length,
    deletedCount: deleted.length,
    keptForReviewCount: kept.length,
    deleted,
    keptForReview: kept,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');

  console.log(`Limpieza de noticias huérfanas: ${DELETE ? 'DELETE' : 'DRY-RUN'}`);
  console.log(`Noticias activas: ${report.activeNewsCount}`);
  console.log(`HTML de noticias: ${report.htmlNewsCount}`);
  console.log(`Huérfanas detectadas: ${report.orphanNewsCount}`);
  console.log(`Eliminadas: ${report.deletedCount}`);
  console.log(`Informe: ${path.relative(ROOT, REPORT_FILE)}`);
}

main();
