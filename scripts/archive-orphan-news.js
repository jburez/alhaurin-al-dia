// Antes este script (clean-orphan-news.js) borraba de /noticias/ cualquier
// .html que ya no tuviera una entrada activa en data/noticias.json. Eso
// generaba cientos de URLs "No se ha encontrado (404)" en Search Console:
// Google las había indexado mientras estaban dentro de la ventana de
// MAX_NOTICIAS_TOTAL de dedupe-news.js, y al borrarlas del disco dejaban
// de existir de verdad.
//
// Ahora, en vez de borrar, esas páginas huérfanas se conservan en disco y
// se garantiza que tengan una entrada en data/noticias-archivo.json (que
// alimenta /noticias/archivo/, ver render-news-archive.js), para que sigan
// siendo rastreables e indexables en vez de convertirse en 404.
//
// dedupe-news.js ya archiva automáticamente las noticias que caen fuera del
// límite de 30. Este script es la red de seguridad para huérfanas que
// aparecieran por otra vía (edición manual, migraciones, etc.): si no están
// ya en el archivo, extrae metadatos básicos del propio HTML para darlas de
// alta.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NEWS_DIR = path.join(ROOT, 'noticias');
const NEWS_FILE = path.join(ROOT, 'data', 'noticias.json');
const ARCHIVE_FILE = path.join(ROOT, 'data', 'noticias-archivo.json');
const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_FILE = path.join(REPORT_DIR, 'orphan-news-archive-report.json');
const WRITE = process.argv.includes('--write');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n');
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
    .filter(entry => entry.isFile() && entry.name.endsWith('.html') && entry.name !== 'index.html')
    .map(entry => path.join(NEWS_DIR, entry.name));
}

function relative(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function cleanText(value = '') {
  return String(value).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// Metadatos mínimos para una huérfana que nunca pasó por dedupe-news.js:
// el HTML ya existe y es la fuente de verdad, así que se leen sus propias
// metaetiquetas en vez de inventar nada.
function extractMetadataFromHtml(file, rel) {
  const html = fs.readFileSync(file, 'utf8');

  const ogTitle = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
  const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
  const titleTag = html.match(/<title[^>]*>(.*?)<\/title>/is);
  const titulo = cleanText(ogTitle?.[1] || h1?.[1] || titleTag?.[1] || path.basename(file, '.html').replace(/-/g, ' '))
    .replace(/\s+—\s+Alhaurín al Día$/i, '');

  const description = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
  const ogImage = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  const time = html.match(/<time\s+datetime=["']([^"']+)["']/i);
  const tag = html.match(/<span class=["']tag["']>([^<]+)<\/span>/i);

  return {
    titulo,
    descripcion: cleanText(description?.[1] || ''),
    resumen: cleanText(description?.[1] || ''),
    categoria: cleanText(tag?.[1] || 'Actualidad'),
    fuente: 'Alhaurín al Día',
    fecha: time?.[1] || fs.statSync(file).mtime.toISOString(),
    imagen: ogImage?.[1] || '',
    pagina: rel,
  };
}

function parseDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
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

  const archivo = readJson(ARCHIVE_FILE, []);
  const archivedPages = new Set(archivo.map(item => normalizePage(item.pagina || '')));
  const newlyArchived = [];

  for (const item of orphanFiles) {
    if (archivedPages.has(item.rel)) continue;
    newlyArchived.push(extractMetadataFromHtml(item.file, item.rel));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: WRITE ? 'write' : 'dry-run',
    activeNewsCount: activePages.size,
    htmlNewsCount: htmlFiles.length,
    orphanNewsCount: orphanFiles.length,
    alreadyArchivedCount: orphanFiles.length - newlyArchived.length,
    newlyArchivedCount: newlyArchived.length,
    newlyArchived: newlyArchived.map(item => ({ titulo: item.titulo, pagina: item.pagina, fecha: item.fecha })),
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  writeJson(REPORT_FILE, report);

  if (WRITE && newlyArchived.length) {
    const actualizado = [...archivo, ...newlyArchived].sort((a, b) => parseDate(b.fecha) - parseDate(a.fecha));
    writeJson(ARCHIVE_FILE, actualizado);
  }

  console.log(`Archivado de noticias huérfanas: ${WRITE ? 'WRITE' : 'DRY-RUN'}`);
  console.log(`Noticias activas: ${report.activeNewsCount}`);
  console.log(`HTML de noticias: ${report.htmlNewsCount}`);
  console.log(`Huérfanas detectadas: ${report.orphanNewsCount}`);
  console.log(`Ya archivadas: ${report.alreadyArchivedCount}`);
  console.log(`Archivadas ahora: ${report.newlyArchivedCount}`);
  console.log(`Informe: ${path.relative(ROOT, REPORT_FILE)}`);
}

main();
