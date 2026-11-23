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
// Fase 6 (noviembre 2026), además:
//   - recorre TODAS las páginas de /noticias/ (no solo las de noticias.json),
//     usando noticias.json, noticias-archivo.json y noticias-editorial.json
//     para recuperar la fuente;
//   - si no se puede recuperar la fuente, muestra «Información recopilada de
//     fuentes públicas»;
//   - las páginas de redirección (meta refresh) se reapuntan a la noticia final
//     que exista (siguiendo `fusionadaEn`), llevan noindex y su redirección se
//     declara también como 301 en _redirects; si el destino no existe, la
//     página se convierte en una página mínima en noindex con título, resumen
//     y fuente (nunca 404);
//   - las noticias ajenas a Alhaurín (scripts/lib/noticias-ajenas.js) se
//     desenlazan de los bloques de «Noticias relacionadas».
//
// Es idempotente: se puede ejecutar en cada build.
//
// Uso: node scripts/apply-news-origin.js [--check]

const fs = require('fs');
const path = require('path');
const { escapeHtml, renderPage, SITE_URL, formatDateLong } = require('./lib/layout');
const { classify } = require('./lib/noticias-ajenas');

const ROOT = path.resolve(__dirname, '..');
const NEWS_FILE = path.join(ROOT, 'data', 'noticias.json');
const ARCHIVE_FILE = path.join(ROOT, 'data', 'noticias-archivo.json');
const NEWS_DIR = path.join(ROOT, 'noticias');
const CATEGORY_DIR = path.join(ROOT, 'categoria');
const EDITORIAL_FILE = path.join(ROOT, 'data', 'noticias-editorial.json');
const FUENTES_FILE = path.join(ROOT, 'data', 'fuentes.json');
const REDIRECTS_FILE = path.join(ROOT, '_redirects');
const REDIRECTS_START = '# alh-noticias-fusionadas:start (generado por scripts/apply-news-origin.js)';
const REDIRECTS_END = '# alh-noticias-fusionadas:end';
const PUBLIC_SOURCES_TEXT = 'Información recopilada de fuentes públicas.';
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
    const note = source || link
      ? `<p class="article-origin-note" data-origen="rss">Información publicada originalmente por ${anchor}.</p>`
      : `<p class="article-origin-note" data-origen="rss">${PUBLIC_SOURCES_TEXT}</p>`;
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

function domainOf(url = '') {
  const m = String(url).match(/^https?:\/\/(?:www\.)?([^/]+)/i);
  return m ? m[1].toLowerCase() : '';
}

function loadSourceIndex() {
  const byDomain = new Map();
  try {
    for (const f of readJson(FUENTES_FILE)) {
      const d = domainOf(f.url);
      if (d) byDomain.set(d, f.nombre);
    }
  } catch (_) { /* sin fuentes */ }
  byDomain.set('youtube.com', 'ATV Alhaurín YouTube');
  return byDomain;
}

function sourceFor(entry, editorialByPage, sourcesByDomain) {
  const link = (entry && entry.enlace && /^https?:/.test(entry.enlace) ? entry.enlace : '') ||
    (entry && editorialByPage.get(entry.pagina)) || '';
  let name = entry && entry.fuente && entry.fuente !== 'Alhaurín al Día' ? entry.fuente : '';
  // Sin enlace, el dominio de la imagen (alojada en la web de la fuente) da
  // al menos el nombre; YouTube → ATV Alhaurín.
  const probe = link || (entry && entry.imagen ? String(entry.imagen).replace(/^https?:\/\/i\d?\.ytimg\.com/, 'https://youtube.com') : '');
  if (!name && probe) {
    const d = domainOf(probe);
    for (const [dom, n] of sourcesByDomain) if (d === dom || d.endsWith(`.${dom}`) || dom.endsWith(d)) { name = n; break; }
  }
  return { name, link };
}

function stubTarget(html) {
  const m = html.match(/http-equiv="refresh" content="0; url=https:\/\/alhaurinaldia\.es\/([^"]+)"/);
  return m ? decodeURI(m[1]) : null;
}

// Sigue redirecciones y `fusionadaEn` hasta una página real que exista.
function resolveFinal(rel, byPage, seen = new Set()) {
  if (!rel || seen.has(rel)) return null;
  seen.add(rel);
  const file = path.join(ROOT, rel);
  if (fs.existsSync(file)) {
    const html = fs.readFileSync(file, 'utf8');
    if (!isRedirectStub(html)) return rel;
    return resolveFinal(stubTarget(html), byPage, seen);
  }
  const entry = byPage.get(rel);
  return entry && entry.fusionadaEn ? resolveFinal(entry.fusionadaEn, byPage, seen) : null;
}

function renderStub(targetRel) {
  const url = `${SITE_URL}/${targetRel}`;
  return `<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="robots" content="noindex, follow">
    <meta http-equiv="refresh" content="0; url=${url}">
    <link rel="canonical" href="${url}">
    <title>Redirigiendo...</title>
</head>
<body>
    <p>Esta noticia se ha fusionado con otra publicación sobre el mismo tema. <a href="${url}">Ir a la noticia</a></p>
</body>
</html>
`;
}

// Página mínima para una redirección cuyo destino no existe: nunca 404.
function renderMinimalNews(rel, entry, source) {
  const title = (entry && entry.titulo) || 'Noticia archivada';
  const desc = (entry && (entry.descripcion || entry.resumen)) || 'Noticia archivada de Alhaurín al Día.';
  const fecha = entry && entry.fecha ? entry.fecha.slice(0, 10) : '';
  const attribution = source.name || source.link
    ? `Información publicada originalmente por ${source.link ? `<a href="${escapeHtml(source.link)}" target="_blank" rel="nofollow noopener">${escapeHtml(source.name || 'su fuente original')}</a>` : escapeHtml(source.name)}.`
    : PUBLIC_SOURCES_TEXT;
  return renderPage({
    title: `${title} — Alhaurín al Día`,
    description: desc.slice(0, 300),
    canonical: `${SITE_URL}/${rel}`,
    robots: ROBOTS_NOINDEX,
    ogType: 'article',
    body: `
        <article class="alh-section">
            <div class="container alh-narrow">
                <span class="alh-kicker">Actualidad · archivo</span>
                <h1>${escapeHtml(title)}</h1>
                ${fecha ? `<p class="alh-event-meta">${escapeHtml(formatDateLong(fecha))}</p>` : ''}
                <p class="alh-lead">${escapeHtml(desc)}</p>
                <p class="article-origin-note" data-origen="rss">${attribution}</p>
                <p class="alh-more"><a href="/noticias/">Ver la actualidad reciente →</a></p>
            </div>
        </article>`,
  });
}

function removeRelatedLinks(html, ajenas) {
  return html.replace(/<a class="related-card" href="\.\.\/(noticias\/[^"]+)">[\s\S]*?<\/a>/g, (m, rel) => (ajenas.has(rel) ? '' : m));
}

function writeRedirects(redirects) {
  const prev = fs.existsSync(REDIRECTS_FILE) ? fs.readFileSync(REDIRECTS_FILE, 'utf8') : '';
  const base = prev.replace(new RegExp(`\\n?${REDIRECTS_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${REDIRECTS_END}\\n?`), '\n').replace(/\n+$/, '\n');
  const lines = [...redirects].sort((a, b) => a[0].localeCompare(b[0])).map(([from, to]) => `${from} ${to} 301`);
  const next = lines.length ? `${base}${REDIRECTS_START}\n${lines.join('\n')}\n${REDIRECTS_END}\n` : base;
  if (next !== prev && !CHECK) fs.writeFileSync(REDIRECTS_FILE, next);
  return lines.length;
}

function main() {
  const news = readJson(NEWS_FILE);
  const archive = readJson(ARCHIVE_FILE);
  const jsonChanges = ensureOrigin(news) + ensureOrigin(archive);
  const newsChanged = writeJsonIfChanged(NEWS_FILE, news);
  const archiveChanged = writeJsonIfChanged(ARCHIVE_FILE, archive);

  const originByPage = new Map();
  const byPage = new Map();
  for (const item of [...archive, ...news]) {
    if (item.pagina) {
      originByPage.set(item.pagina, item.origen);
      byPage.set(item.pagina, item);
    }
  }
  const editorialByPage = new Map();
  try {
    for (const e of Object.values(readJson(EDITORIAL_FILE))) if (e && e.pagina && e.source_url) editorialByPage.set(e.pagina, e.source_url);
  } catch (_) { /* sin registro editorial */ }
  const sourcesByDomain = loadSourceIndex();
  const ajenas = new Set([...byPage.values()].filter((n) => classify(n).ajena).map((n) => n.pagina));
  const redirects = new Map();
  const stubStats = { reapuntados: 0, minimos: 0 };

  const counts = { rss: 0, original: 0, stubs: 0, written: 0, sinFuente: 0 };
  const originalCategories = new Set();
  for (const item of [...archive, ...news]) {
    if (item.origen === 'original' && item.categoria_url) originalCategories.add(item.categoria_url.replace(/\/$/, ''));
  }

  for (const name of fs.readdirSync(NEWS_DIR)) {
    if (!name.endsWith('.html') || name === 'index.html') continue;
    const file = path.join(NEWS_DIR, name);
    const html = fs.readFileSync(file, 'utf8');
    const rel = `noticias/${name}`;
    if (isRedirectStub(html)) {
      counts.stubs++;
      const final = resolveFinal(stubTarget(html), byPage, new Set([rel]));
      let next;
      if (final) {
        next = renderStub(final);
        redirects.set(`/${rel}`, `/${final}`);
        stubStats.reapuntados++;
      } else {
        next = renderMinimalNews(rel, byPage.get(rel), sourceFor(byPage.get(rel), editorialByPage, sourcesByDomain));
        stubStats.minimos++;
      }
      if (next !== html) {
        counts.written++;
        if (!CHECK) fs.writeFileSync(file, next);
      }
      continue;
    }
    if (html.includes('data-origen="rss">Información recopilada')) {
      // Página mínima generada en una ejecución anterior: ya está bien.
      counts.rss++;
      continue;
    }
    const origin = originByPage.get(rel) || 'rss';
    let next = origin === 'original' ? patchOriginalArticle(html) : patchRssArticle(html);
    if (next.includes(PUBLIC_SOURCES_TEXT)) counts.sinFuente++;
    next = removeRelatedLinks(next, ajenas);
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
  const nRedirects = writeRedirects(redirects);
  console.log(`Páginas de noticia: ${counts.rss} rss (noindex, ${counts.sinFuente} sin fuente recuperable), ${counts.original} originales (index).`);
  console.log(`Redirecciones: ${counts.stubs} (${stubStats.reapuntados} reapuntadas con 301 en _redirects, ${stubStats.minimos} convertidas en página mínima noindex). Reglas 301: ${nRedirects}.`);
  console.log(`Noticias ajenas a Alhaurín (desenlazadas): ${ajenas.size}.`);
  console.log(`Páginas reescritas: ${counts.written}. Listados en noindex: ${listingsNoindex}.`);
  if (CHECK) console.log('Modo --check: no se ha escrito nada.');
}

main();
