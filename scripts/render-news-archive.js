// Renderiza /noticias/archivo/ a partir de data/noticias-archivo.json.
// A diferencia de los widgets de home, esta página no necesita hidratación
// por JS: se reconstruye entera en cada build (build-time only), igual que
// render-news-static.js hace con /noticias/.

const fs = require('fs');
const path = require('path');
const { renderNewsCardHTML } = require('./lib/cards');

const ROOT = path.resolve(__dirname, '..');
const ARCHIVE_INDEX_FILE = path.join(ROOT, 'noticias', 'archivo', 'index.html');
const ARCHIVE_DATA_FILE = path.join(ROOT, 'data', 'noticias-archivo.json');

function setContainerInnerHTML(html, elementId, innerHTML) {
  const openTagPattern = new RegExp(`<div([^>]*\\bid=["']${elementId}["'][^>]*)>`, 'i');
  const match = openTagPattern.exec(html);

  if (!match) {
    throw new Error(`No se encontró el contenedor #${elementId}`);
  }

  const openTagStart = match.index;
  const openTagEnd = openTagStart + match[0].length;
  let cursor = openTagEnd;
  let depth = 1;
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = openTagEnd;

  while (depth > 0) {
    const tagMatch = tagPattern.exec(html);
    if (!tagMatch) {
      throw new Error(`No se pudo encontrar el cierre de #${elementId}`);
    }

    if (tagMatch[0].startsWith('</')) {
      depth -= 1;
    } else {
      depth += 1;
    }

    cursor = tagMatch.index;
  }

  return html.slice(0, openTagEnd) + innerHTML + html.slice(cursor);
}

function setElementText(html, elementId, text) {
  const pattern = new RegExp(`(<p[^>]*\\bid=["']${elementId}["'][^>]*>)[^]*?(<\\/p>)`, 'i');
  if (!pattern.test(html)) {
    throw new Error(`No se encontró el elemento #${elementId}`);
  }
  return html.replace(pattern, `$1${text}$2`);
}

function main() {
  let html = fs.readFileSync(ARCHIVE_INDEX_FILE, 'utf8');
  let archivo = [];
  try {
    archivo = JSON.parse(fs.readFileSync(ARCHIVE_DATA_FILE, 'utf8'));
  } catch (error) {
    archivo = [];
  }
  if (!Array.isArray(archivo)) archivo = [];

  // Las noticias con "fusionadaEn" son duplicados de otra ya archivada (ver
  // scripts/merge-duplicate-archive-2026-08.js): su página en /noticias/ es
  // ahora solo una redirección, así que no tiene sentido listarlas como si
  // fueran contenido propio. La entrada se mantiene en el JSON (no se
  // borra) para que scripts/audit-orphan-pages.js la siga reconociendo.
  const visibles = archivo.filter(noticia => !noticia.fusionadaEn);

  const listHTML = visibles.length
    ? visibles.map(noticia => renderNewsCardHTML(noticia, { isHome: false })).join('\n')
    : '<p>No hay noticias archivadas todavía.</p>';

  html = setContainerInnerHTML(html, 'news-archive-list', listHTML);
  html = setElementText(html, 'news-archive-count', visibles.length === 1 ? '1 noticia archivada.' : `${visibles.length} noticias archivadas.`);

  const previo = fs.existsSync(ARCHIVE_INDEX_FILE) ? fs.readFileSync(ARCHIVE_INDEX_FILE, 'utf8') : null;
  if (html !== previo) fs.writeFileSync(ARCHIVE_INDEX_FILE, html);

  console.log(`noticias/archivo/index.html regenerado con ${visibles.length} noticias archivadas (${archivo.length} en total, ${archivo.length - visibles.length} fusionadas).`);
}

main();
