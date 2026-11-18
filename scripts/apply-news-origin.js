// Aplica el campo `origen` ("rss" | "original") a todas las noticias y ajusta
// las páginas HTML ya publicadas en consecuencia, sin borrarlas ni cambiar su
// URL:
//
//   - origen "rss" (por defecto): <meta name="robots" content="noindex, follow">,
//     atribución visible «Información publicada originalmente por [fuente]» y
//     enlaces a la fuente con rel="nofollow noopener".
//   - origen "original": indexable (index, follow).
//
// También pone en noindex los listados que solo agregan noticias RSS
// (/noticias/, /noticias/archivo/ y /categoria/*/) mientras no contengan
// ninguna noticia original.
//
// Es idempotente: se puede ejecutar en cada build.
//
// Uso: node scripts/apply-news-origin.js [--check]

const fs = require('fs');
const path = require('path');
const { escapeHtml } = require('./lib/layout');

const ROOT = path.resolve(__dirname, '..');
const NEWS_FILE = path.join(ROOT, 'data', 'noticias.json');
const ARCHIVE_FILE = path.join(ROOT, 'data', 'noticias-archivo.json');
const NEWS_DIR = path.join(ROOT, 'noticias');
const CATEGORY_DIR = path.join(ROOT, 'categoria');
const CHECK = process.argv.includes('--check');

const ROBOTS_INDEX = 'index, follow, max-image-preview:large';
const ROBOTS_NOINDEX = 'noindex, follow';
const VALID = new Set(['rss', 'original']);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonIfChanged(file, data) {
  const prev = fs.readFileSync(file, 'utf8');
  // Conserva la indentación de cada fichero (noticias.json usa 2, el archivo 4).
  const indentMatch = prev.match(/^\[?\{?\n( +)/);
  const indent = indentMatch ? indentMatch[1].length : 2;
  const next = `${JSON.stringify(data, null, indent)}\n`;
  // Respeta si el fichero original no terminaba en salto de línea.
  const out = prev.endsWith('\n') ? next : next.trimEnd();
  if (out !== prev) {
    if (!CHECK) fs.writeFileSync(file, out);
    return true;
  }
  return false;
}

function ensureOrigin(list) {
  let changed = 0;
  for (const item of list) {
    if (!VALID.has(item.origen)) {
      item.origen = 'rss';
      changed++;
    }
  }
  return changed;
}

function setRobots(html, content) {
  const re = /<meta name="robots" content="[^"]*">/;
  if (re.test(html)) return html.replace(re, `<meta name="robots" content="${content}">`);
  return html.replace(/<meta name="viewport"[^>]*>/, (m) => `${m}\n    <meta name="robots" content="${content}">`);
}

function isRedirectStub(html) {
  return /http-equiv="refresh"/i.test(html);
}

function patchRssArticle(html) {
  let out = setRobots(html, ROBOTS_NOINDEX);
  const box = out.match(/<div class="article-source-box"><div><span>Fuente original<\/span><strong>([^<]*)<\/strong><\/div>(?:<a class="btn btn-primary" href="([^"]*)")?/);
  const source = box ? box[1] : '';
  const link = box && box[2] && box[2].startsWith('http') ? box[2] : '';

  // Enlaces a la fuente original: nofollow.
  out = out.replace(/(<a class="btn btn-primary" href="https?:\/\/[^"]*" target="_blank" rel=")noopener noreferrer(">Leer en la fuente original)/g, '$1nofollow noopener$2');

  if (!out.includes('class="article-origin-note"')) {
    const name = escapeHtml(source || 'su fuente original');
    // `source` ya viene escapado del HTML: no doble-escapar.
    const label = source || 'su fuente original';
    const anchor = link
      ? `<a href="${link}" target="_blank" rel="nofollow noopener">${label}</a>`
      : (source ? label : name);
    const note = `<p class="article-origin-note" data-origen="rss">Información publicada originalmente por ${anchor}.</p>`;
    if (/<p class="article-summary">[\s\S]*?<\/p>/.test(out)) {
      out = out.replace(/(<p class="article-summary">[\s\S]*?<\/p>)/, `$1${note}`);
    } else {
      out = out.replace(/(<h1[^>]*>[\s\S]*?<\/h1>)/, `$1${note}`);
    }
  }
  return out;
}

function patchOriginalArticle(html) {
  let out = setRobots(html, ROBOTS_INDEX);
  out = out.replace(/<p class="article-origin-note" data-origen="rss">[\s\S]*?<\/p>/, '');
  return out;
}

function main() {
  const news = readJson(NEWS_FILE);
  const archive = readJson(ARCHIVE_FILE);
  const jsonChanges = ensureOrigin(news) + ensureOrigin(archive);
  const newsChanged = writeJsonIfChanged(NEWS_FILE, news);
  const archiveChanged = writeJsonIfChanged(ARCHIVE_FILE, archive);

  const originByPage = new Map();
  for (const item of [...archive, ...news]) {
    if (item.pagina) originByPage.set(item.pagina, item.origen);
  }

  const counts = { rss: 0, original: 0, stubs: 0, written: 0 };
  const originalCategories = new Set();
  for (const item of [...archive, ...news]) {
    if (item.origen === 'original' && item.categoria_url) originalCategories.add(item.categoria_url.replace(/\/$/, ''));
  }

  for (const name of fs.readdirSync(NEWS_DIR)) {
    if (!name.endsWith('.html') || name === 'index.html') continue;
    const file = path.join(NEWS_DIR, name);
    const html = fs.readFileSync(file, 'utf8');
    if (isRedirectStub(html)) {
      counts.stubs++;
      continue;
    }
    const origin = originByPage.get(`noticias/${name}`) || 'rss';
    const next = origin === 'original' ? patchOriginalArticle(html) : patchRssArticle(html);
    counts[origin]++;
    if (next !== html) {
      counts.written++;
      if (!CHECK) fs.writeFileSync(file, next);
    }
  }

  // Listados de noticias: noindex mientras solo contengan contenido RSS.
  const hasOriginal = counts.original > 0;
  const listings = [path.join(NEWS_DIR, 'index.html'), path.join(NEWS_DIR, 'archivo', 'index.html')];
  if (fs.existsSync(CATEGORY_DIR)) {
    for (const slug of fs.readdirSync(CATEGORY_DIR)) {
      const file = path.join(CATEGORY_DIR, slug, 'index.html');
      if (fs.existsSync(file)) listings.push(file);
    }
  }
  let listingsNoindex = 0;
  for (const file of listings) {
    if (!fs.existsSync(file)) continue;
    const rel = path.relative(ROOT, path.dirname(file)).split(path.sep).join('/');
    const indexable = rel.startsWith('categoria/') ? originalCategories.has(rel) : hasOriginal;
    const html = fs.readFileSync(file, 'utf8');
    const next = setRobots(html, indexable ? 'index, follow' : ROBOTS_NOINDEX);
    if (!indexable) listingsNoindex++;
    if (next !== html && !CHECK) fs.writeFileSync(file, next);
  }

  console.log(`Campo origen añadido a ${jsonChanges} noticias (noticias.json ${newsChanged ? 'actualizado' : 'sin cambios'}, archivo ${archiveChanged ? 'actualizado' : 'sin cambios'}).`);
  console.log(`Páginas de noticia: ${counts.rss} rss (noindex), ${counts.original} originales (index), ${counts.stubs} stubs de redirección sin tocar.`);
  console.log(`Páginas reescritas: ${counts.written}. Listados en noindex: ${listingsNoindex}.`);
  if (CHECK) console.log('Modo --check: no se ha escrito nada.');
}

main();
