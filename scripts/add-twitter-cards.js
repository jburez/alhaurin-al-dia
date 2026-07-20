const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'assets']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function extract(html, pattern) {
  const match = pattern.exec(html);
  return match ? match[1] : '';
}

// Añade twitter:title/description/image a cualquier página que ya tenga Open
// Graph pero no tarjeta de Twitter completa, reutilizando los valores de
// og:title/og:description/og:image (o <title>/meta description si faltan).
function addTwitterCard(html) {
  if (html.includes('name="twitter:title"')) return html;

  const ogTypeMatch = /<meta\s+property=["']og:type["']/i.exec(html);
  if (!ogTypeMatch) return html; // sin OG, no es el caso que cubre este script

  // \s+ (no solo un espacio literal) para soportar etiquetas multilínea, y
  // content=["'] con cierre opcional " />" para soportar meta autocerradas
  // al estilo XHTML — ambos formatos conviven en el repo (generadores vs.
  // HTML manual como index.html).
  const ogTitle = extract(html, /<meta\s+property=["']og:title["']\s+content=["']([^"']*)["']/i);
  const ogDescription = extract(html, /<meta\s+property=["']og:description["']\s+content=["']([^"']*)["']/i);
  const ogImage = extract(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']*)["']/i);
  const plainTitle = extract(html, /<title>([^<]*)<\/title>/i);
  const plainDescription = extract(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);

  const title = ogTitle || plainTitle;
  const description = ogDescription || plainDescription;
  const image = ogImage || 'https://alhaurinaldia.es/assets/favicon.svg';

  if (!title) return html;

  const hasCard = html.includes('name="twitter:card"');
  const block = `${hasCard ? '' : '<meta name="twitter:card" content="summary_large_image">\n    '}<meta name="twitter:title" content="${title}">\n    <meta name="twitter:description" content="${description}">\n    <meta name="twitter:image" content="${image}">\n`;

  if (hasCard) {
    return html.replace(
      /(<meta\s+name=["']twitter:card["'][^>]*>\s*)/i,
      (m) => `${m}${block}    `
    );
  }

  // Sin twitter:card previo: se inserta justo después del bloque og:image (o
  // og:url si no hay imagen), o al final del propio bloque OG si tampoco hay.
  const anchorPattern = /(<meta\s+property=["']og:(?:image|url)["'][^>]*>\s*)/gi;
  let lastMatch = null;
  let match;
  while ((match = anchorPattern.exec(html)) !== null) {
    lastMatch = match;
  }
  if (!lastMatch) return html;

  const insertAt = lastMatch.index + lastMatch[0].length;
  return html.slice(0, insertAt) + '    ' + block + html.slice(insertAt);
}

let updated = 0;

for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, 'utf8');
  const modified = addTwitterCard(original);
  if (modified !== original) {
    fs.writeFileSync(file, modified);
    updated += 1;
  }
}

console.log(`Twitter Card completada en ${updated} archivos HTML`);
