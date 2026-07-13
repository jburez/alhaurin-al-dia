const fs = require('fs');
const path = require('path');
const {
  renderFeaturedNewsHTML,
  renderNewsCardHTML,
  renderGuideCardHTML,
} = require('./lib/cards');

const ROOT = path.resolve(__dirname, '..');
const HOME_FILE = path.join(ROOT, 'index.html');
const NEWS_FILE = path.join(ROOT, 'data', 'noticias.json');
const GUIDE_FILE = path.join(ROOT, 'data', 'guia-util.json');

const HOME_SECONDARY_NEWS_LIMIT = 3;

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
  let html = fs.readFileSync(HOME_FILE, 'utf8');

  const noticias = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8')) || [];
  const guia = JSON.parse(fs.readFileSync(GUIDE_FILE, 'utf8')) || [];

  if (noticias.length === 0) {
    html = setContainerInnerHTML(html, 'featured-news', '');
    html = setContainerInnerHTML(html, 'news-container', '<p>No hay noticias disponibles.</p>');
  } else {
    const featured = renderFeaturedNewsHTML(noticias[0], { isHome: true });
    const secondary = noticias
      .slice(1, 1 + HOME_SECONDARY_NEWS_LIMIT)
      .map(noticia => renderNewsCardHTML(noticia, { isHome: true }))
      .join('\n');

    html = setContainerInnerHTML(html, 'featured-news', featured);
    html = setContainerInnerHTML(html, 'news-container', secondary);
  }

  const guideCards = guia.map(item => renderGuideCardHTML(item)).join('\n');
  html = setContainerInnerHTML(html, 'guide-container', guideCards);

  const previo = fs.existsSync(HOME_FILE) ? fs.readFileSync(HOME_FILE, 'utf8') : null;
  if (html !== previo) fs.writeFileSync(HOME_FILE, html);

  console.log('Home regenerada con contenido estático real.');
  console.log(`#featured-news / #news-container: ${Math.min(1 + HOME_SECONDARY_NEWS_LIMIT, noticias.length)} de ${noticias.length} noticias.`);
  console.log(`#guide-container: ${guia.length} recursos de guía útil.`);
}

main();
