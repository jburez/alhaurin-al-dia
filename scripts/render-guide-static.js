const fs = require('fs');
const path = require('path');
const {
  renderGuideCardHTML,
  renderGuideFiltersHTML,
} = require('./lib/cards');

const ROOT = path.resolve(__dirname, '..');
const GUIDE_INDEX_FILE = path.join(ROOT, 'guia-util', 'index.html');
const GUIDE_FILE = path.join(ROOT, 'data', 'guia-util.json');

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

  const before = html.slice(0, openTagEnd);
  const after = html.slice(cursor);
  return `${before}${innerHTML}${after}`;
}

function main() {
  let html = fs.readFileSync(GUIDE_INDEX_FILE, 'utf8');
  const items = JSON.parse(fs.readFileSync(GUIDE_FILE, 'utf8')) || [];

  const cards = items.map(item => renderGuideCardHTML(item, { featured: true })).join('\n');
  const filters = renderGuideFiltersHTML(items, 'Todas');

  html = setContainerInnerHTML(html, 'guide-page-container', cards);
  html = setContainerInnerHTML(html, 'guide-category-filters', filters);
  html = html.replace(
    /(<strong id="total-recursos">)[^<]*(<\/strong>)/,
    `$1${items.length}$2`
  );

  const previo = fs.existsSync(GUIDE_INDEX_FILE) ? fs.readFileSync(GUIDE_INDEX_FILE, 'utf8') : null;
  if (html !== previo) fs.writeFileSync(GUIDE_INDEX_FILE, html);

  console.log('guia-util/index.html regenerado con contenido estático real.');
  console.log(`${items.length} recursos listados de forma estática.`);
}

main();
