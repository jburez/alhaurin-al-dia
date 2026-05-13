const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOME_FILE = path.join(ROOT, 'index.html');

const CLEAN_CONTAINERS = [
  'featured-news',
  'news-container',
  'guide-container',
];

function clearContainer(html, elementId) {
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
  return `${before}</div>${after.slice('</div>'.length)}`;
}

function assertClean(html) {
  const forbiddenInside = [
    ['featured-news', 'featured-news-card'],
    ['news-container', 'news-card'],
    ['guide-container', 'guide-card'],
  ];

  forbiddenInside.forEach(([containerId, forbiddenClass]) => {
    const containerPattern = new RegExp(`<div[^>]*\\bid=["']${containerId}["'][^>]*>([\\s\\S]*?)<\\/div>`, 'i');
    const match = containerPattern.exec(html);
    if (match && match[1].includes(forbiddenClass)) {
      throw new Error(`#${containerId} contiene HTML estático no esperado: ${forbiddenClass}`);
    }
  });
}

function main() {
  let html = fs.readFileSync(HOME_FILE, 'utf8');

  CLEAN_CONTAINERS.forEach((containerId) => {
    html = clearContainer(html, containerId);
  });

  assertClean(html);
  fs.writeFileSync(HOME_FILE, html);

  console.log('Home preparada como plantilla limpia');
  console.log('Los bloques #featured-news, #news-container y #guide-container quedan vacíos.');
  console.log('El contenido dinámico lo renderiza app.js en cliente.');
}

main();
