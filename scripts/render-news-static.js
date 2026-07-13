const fs = require('fs');
const path = require('path');
const {
  renderFeaturedNewsHTML,
  renderNewsCardHTML,
  renderSourceFiltersHTML,
} = require('./lib/cards');

const ROOT = path.resolve(__dirname, '..');
const NEWS_INDEX_FILE = path.join(ROOT, 'noticias', 'index.html');
const NEWS_FILE = path.join(ROOT, 'data', 'noticias.json');

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
  let html = fs.readFileSync(NEWS_INDEX_FILE, 'utf8');
  const noticias = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8')) || [];

  if (noticias.length === 0) {
    html = setContainerInnerHTML(html, 'featured-news', '');
    html = setContainerInnerHTML(html, 'source-filters', '');
    html = setContainerInnerHTML(html, 'news-container', '<p>No hay noticias disponibles.</p>');
  } else {
    const featured = renderFeaturedNewsHTML(noticias[0], { isHome: false });
    const secondary = noticias
      .slice(1)
      .map(noticia => renderNewsCardHTML(noticia, { isHome: false }))
      .join('\n');
    const filters = renderSourceFiltersHTML(noticias, 'Todas');

    html = setContainerInnerHTML(html, 'featured-news', featured);
    html = setContainerInnerHTML(html, 'source-filters', filters);
    html = setContainerInnerHTML(html, 'news-container', secondary);
  }

  // El listado ya existe en el HTML servido: refleja el número real de artículos
  // en vez del placeholder "numberOfItems": 0 del JSON-LD.
  html = html.replace(/"numberOfItems":\s*0/, `"numberOfItems": ${noticias.length}`);

  const previo = fs.existsSync(NEWS_INDEX_FILE) ? fs.readFileSync(NEWS_INDEX_FILE, 'utf8') : null;
  if (html !== previo) fs.writeFileSync(NEWS_INDEX_FILE, html);

  console.log('noticias/index.html regenerado con contenido estático real.');
  console.log(`${noticias.length} noticias listadas de forma estática.`);
}

main();
