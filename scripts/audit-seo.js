const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://alhaurinaldia.es';
const WARN_ONLY = process.argv.includes('--warn-only');
const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_FILE = path.join(REPORT_DIR, 'seo-audit-report.json');
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'assets', 'reports', 'tmp', 'admin']);
const IGNORE_FILES = new Set(['404.html', 'index_old.html']);
// /planes/calendario/ es un stub de redirección (meta refresh a /planes/,
// donde vive el calendario real) con su propio canonical ya correcto: no
// tiene sentido pedirle metadatos de página de contenido.
const IGNORE_URLS = new Set(['/planes/calendario/']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html') && !IGNORE_FILES.has(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function toUrl(file) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return '/' + rel.replace(/index\.html$/, '');
  return '/' + rel;
}

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\b(alhaurin|alhaurin el grande|el grande|malaga|2026|noticias|actualidad)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function signature(value = '') {
  const words = normalizeText(value)
    .split(' ')
    .filter(word => word.length > 3)
    .slice(0, 12);
  return words.join(' ');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function auditHtmlFiles() {
  const htmlFiles = walk(ROOT);
  const missingCanonical = [];
  const searchAction = [];
  const missingTitle = [];
  const missingDescription = [];

  for (const file of htmlFiles) {
    const url = toUrl(file);
    if (IGNORE_URLS.has(url)) continue;

    const html = fs.readFileSync(file, 'utf8');

    if (!/<link\s+rel=["']canonical["']/i.test(html)) {
      missingCanonical.push(url);
    }
    if (/SearchAction|\/buscar\//i.test(html)) {
      searchAction.push(url);
    }

    // Un stub de redirección (meta refresh instantáneo hacia otra URL, ver
    // /planes/calendario/ y scripts/merge-duplicate-archive-2026-08.js) no
    // es una página de contenido: le basta con el canonical, exigirle
    // título/descripción propios no tiene sentido — la página de destino ya
    // los tiene.
    const isRedirectStub = /<meta\s+http-equiv=["']refresh["']/i.test(html);
    if (isRedirectStub) continue;

    if (!/<title>[^<]+<\/title>/i.test(html)) {
      missingTitle.push(url);
    }
    if (!/<meta\s+name=["']description["']\s+content=["'][^"']{40,}["']/i.test(html)) {
      missingDescription.push(url);
    }
  }

  return {
    totalHtml: htmlFiles.length,
    missingCanonical,
    searchAction,
    missingTitle,
    missingDescription,
  };
}

function auditSitemaps() {
  const sitemapPath = path.join(ROOT, 'sitemap.xml');
  const sitemapIndexPath = path.join(ROOT, 'sitemap-index.xml');
  const robotsPath = path.join(ROOT, 'robots.txt');
  const issues = [];

  if (!fs.existsSync(sitemapPath)) issues.push('Falta sitemap.xml');
  if (!fs.existsSync(sitemapIndexPath)) issues.push('Falta sitemap-index.xml');
  if (!fs.existsSync(robotsPath)) issues.push('Falta robots.txt');

  if (fs.existsSync(sitemapPath)) {
    const sitemap = fs.readFileSync(sitemapPath, 'utf8');
    if (/index_old\.html/i.test(sitemap)) issues.push('sitemap.xml incluye index_old.html');
    if (!/\/contacto\//i.test(sitemap)) issues.push('sitemap.xml no incluye /contacto/');
    if (!/\/sobre-nosotros\//i.test(sitemap)) issues.push('sitemap.xml no incluye /sobre-nosotros/');
  }

  if (fs.existsSync(robotsPath)) {
    const robots = fs.readFileSync(robotsPath, 'utf8');
    if (!/Sitemap:\s*https:\/\/alhaurinaldia\.es\/sitemap-index\.xml/i.test(robots)) {
      issues.push('robots.txt no apunta a sitemap-index.xml');
    }
    if (/sitemap-servicios\.xml/i.test(robots)) {
      issues.push('robots.txt sigue declarando sitemap-servicios.xml');
    }
  }

  return { issues };
}

function auditNewsDuplicates() {
  const newsPath = path.join(ROOT, 'data', 'noticias.json');
  const noticias = readJson(newsPath, []);
  const byPage = new Map();
  const bySourceUrl = new Map();
  const bySignature = new Map();
  const duplicatePages = [];
  const duplicateSourceUrls = [];
  const possibleDuplicateTitles = [];

  for (const noticia of noticias) {
    const page = noticia.pagina || '';
    const sourceUrl = noticia.enlace || noticia.url || '';
    const sig = signature(`${noticia.titulo || ''} ${noticia.descripcion || noticia.resumen || ''}`);

    if (page) {
      if (byPage.has(page)) duplicatePages.push([byPage.get(page), noticia]);
      else byPage.set(page, noticia);
    }

    if (sourceUrl) {
      if (bySourceUrl.has(sourceUrl)) duplicateSourceUrls.push([bySourceUrl.get(sourceUrl), noticia]);
      else bySourceUrl.set(sourceUrl, noticia);
    }

    if (sig && sig.length >= 25) {
      if (bySignature.has(sig)) possibleDuplicateTitles.push([bySignature.get(sig), noticia]);
      else bySignature.set(sig, noticia);
    }
  }

  return {
    totalNews: noticias.length,
    duplicatePages: duplicatePages.map(pair => pair.map(toNewsSummary)),
    duplicateSourceUrls: duplicateSourceUrls.map(pair => pair.map(toNewsSummary)),
    possibleDuplicateTitles: possibleDuplicateTitles.map(pair => pair.map(toNewsSummary)),
  };
}

function toNewsSummary(noticia) {
  return {
    titulo: noticia.titulo || '',
    pagina: noticia.pagina || '',
    fuente: noticia.fuente || '',
    enlace: noticia.enlace || noticia.url || '',
    fecha: noticia.fecha || '',
  };
}

// ---------- Reposicionamiento como guía práctica (noviembre 2026) ----------
//
// Comprobaciones que fallan el build (críticos) o avisan:
//   - críticos: páginas del sitemap con noindex, URLs del listado guardado en
//     la parada 1 (reports/urls-baseline.txt) que ya no existen, marcadores
//     [PENDIENTE en páginas indexables, JSON-LD con errores de sintaxis y
//     Event sin los campos que exige Google (name, startDate, location+address);
//   - avisos: páginas indexables con menos de ~150 palabras de texto propio.
const MIN_OWN_WORDS = 150;
const BASELINE_FILE = path.join(ROOT, 'reports', 'urls-baseline.txt');

function robotsOf(html) {
  const m = html.match(/<meta\s+name=["']robots["']\s+content=["']([^"']+)["']/i);
  return m ? m[1] : '';
}

function ownText(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/i);
  return String(main ? main[0] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function urlToFile(url) {
  const rel = url.replace(/^\//, '');
  if (!rel) return path.join(ROOT, 'index.html');
  return rel.endsWith('/') ? path.join(ROOT, rel, 'index.html') : path.join(ROOT, rel);
}

function sitemapUrls() {
  const urls = new Set();
  for (const name of fs.readdirSync(ROOT)) {
    if (!/^sitemap.*\.xml$/.test(name) || name === 'sitemap-index.xml') continue;
    const xml = fs.readFileSync(path.join(ROOT, name), 'utf8');
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.add(m[1].replace(SITE_URL, ''));
  }
  return urls;
}

function auditReposicionamiento() {
  const thinPages = [];
  const pendingInIndexable = [];
  const jsonLdErrors = [];
  const eventErrors = [];
  for (const file of walk(ROOT)) {
    const url = toUrl(file);
    const html = fs.readFileSync(file, 'utf8');
    if (/<meta\s+http-equiv=["']refresh["']/i.test(html)) continue;

    for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
      let data;
      try {
        data = JSON.parse(m[1]);
      } catch (error) {
        jsonLdErrors.push({ url, error: error.message });
        continue;
      }
      const nodes = [].concat(data['@graph'] || data);
      for (const node of nodes) {
        if (!node || node['@type'] !== 'Event') continue;
        const missing = [];
        if (!node.name) missing.push('name');
        if (!node.startDate) missing.push('startDate');
        if (!node.location || !node.location.name) missing.push('location.name');
        if (!node.location || !node.location.address) missing.push('location.address');
        if (missing.length) eventErrors.push({ url, missing });
      }
    }

    if (/noindex/i.test(robotsOf(html)) || IGNORE_URLS.has(url)) continue;
    if (/\[PENDIENTE/.test(ownText(html))) pendingInIndexable.push(url);
    const words = ownText(html).split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
    if (words < MIN_OWN_WORDS) thinPages.push({ url, words });
  }

  const noindexInSitemap = [];
  for (const url of sitemapUrls()) {
    const file = urlToFile(url);
    if (!fs.existsSync(file)) {
      noindexInSitemap.push({ url, motivo: 'no existe' });
      continue;
    }
    if (/noindex/i.test(robotsOf(fs.readFileSync(file, 'utf8')))) noindexInSitemap.push({ url, motivo: 'noindex' });
  }

  const removedUrls = [];
  if (fs.existsSync(BASELINE_FILE)) {
    for (const url of fs.readFileSync(BASELINE_FILE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)) {
      if (!fs.existsSync(urlToFile(url))) removedUrls.push(url);
    }
  }

  return { thinPages, pendingInIndexable, jsonLdErrors, eventErrors, noindexInSitemap, removedUrls };
}

// ---------- Fase 6: calidad de contenido (noviembre 2026) ----------
//
// Errores: noticia indexable sin origen "original", página indexable de
// /guia-util/ con menos de 300 palabras propias o con [PENDIENTE, ficha de
// evento indexable de alhaurinhoy sin validar, y URL de
// reports/urls-indexables-antes-fase6.txt que daría 404 (puede pasar a noindex
// o a 301, pero no desaparecer). Al final, resumen de páginas indexables por
// sección antes y después.
const FASE6_FILE = path.join(ROOT, 'reports', 'urls-indexables-antes-fase6.txt');

function sectionOf(url) {
  return url === '/' ? '/' : `/${url.replace(/^\//, '').split('/')[0]}/`;
}

function redirectSources() {
  const set = new Set();
  const file = path.join(ROOT, '_redirects');
  if (!fs.existsSync(file)) return set;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.trim().match(/^(\/\S*)\s+\S+\s+30[12]/);
    if (m) set.add(m[1]);
  }
  return set;
}

function auditFase6() {
  const newsOrigin = new Map();
  for (const f of ['noticias-archivo.json', 'noticias.json']) {
    for (const n of readJson(path.join(ROOT, 'data', f), [])) if (n && n.pagina) newsOrigin.set(`/${n.pagina}`, n.origen);
  }
  const agenda = readJson(path.join(ROOT, 'data', 'agenda.json'), { eventos: [] });
  const eventBySlug = new Map((agenda.eventos || []).map((e) => [`/planes/${e.slug}/`, e]));

  const noticiasNoOriginales = [];
  const guiasFinas = [];
  const eventosSinValidar = [];
  const after = {};
  for (const file of walk(ROOT)) {
    const url = toUrl(file);
    const html = fs.readFileSync(file, 'utf8');
    if (/<meta\s+http-equiv=["']refresh["']/i.test(html)) continue;
    if (/noindex/i.test(robotsOf(html))) continue;
    after[sectionOf(url)] = (after[sectionOf(url)] || 0) + 1;
    if (url.startsWith('/noticias/') && url.endsWith('.html') && newsOrigin.get(url) !== 'original') noticiasNoOriginales.push(url);
    if (url.startsWith('/guia-util/')) {
      const text = ownText(html);
      const words = text.split(' ').filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
      if (words < 300 || /\[PENDIENTE/.test(text)) guiasFinas.push({ url, words, pendiente: /\[PENDIENTE/.test(text) });
    }
    const ev = eventBySlug.get(url);
    if (ev && ev.fuente === 'alhaurinhoy' && !ev.validado) eventosSinValidar.push(url);
  }

  const urls404 = [];
  const before = {};
  if (fs.existsSync(FASE6_FILE)) {
    const redirects = redirectSources();
    for (const raw of fs.readFileSync(FASE6_FILE, 'utf8').split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const url = line.split(/\s+/)[0];
      if (!/redireccion/.test(line)) before[sectionOf(url)] = (before[sectionOf(url)] || 0) + 1;
      if (!fs.existsSync(urlToFile(url)) && !redirects.has(url)) urls404.push(url);
    }
  }
  return { noticiasNoOriginales, guiasFinas, eventosSinValidar, urls404, before, after };
}

function main() {
  const html = auditHtmlFiles();
  const sitemaps = auditSitemaps();
  const news = auditNewsDuplicates();
  const guia = auditReposicionamiento();
  const fase6 = auditFase6();

  const criticalCount =
    html.searchAction.length +
    html.missingCanonical.length +
    html.missingTitle.length +
    html.missingDescription.length +
    sitemaps.issues.length +
    news.duplicatePages.length +
    news.duplicateSourceUrls.length +
    guia.noindexInSitemap.length +
    guia.removedUrls.length +
    guia.pendingInIndexable.length +
    guia.jsonLdErrors.length +
    guia.eventErrors.length +
    fase6.noticiasNoOriginales.length +
    fase6.guiasFinas.length +
    fase6.eventosSinValidar.length +
    fase6.urls404.length;

  const warningsCount = news.possibleDuplicateTitles.length + guia.thinPages.length;

  const report = {
    generatedAt: new Date().toISOString(),
    site: SITE_URL,
    summary: {
      criticalCount,
      warningsCount,
      status: criticalCount ? 'fail' : warningsCount ? 'warn' : 'ok',
    },
    html,
    sitemaps,
    news,
    guia,
    fase6,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));

  console.log(`SEO audit: ${report.summary.status.toUpperCase()}`);
  console.log(`HTML analizados: ${html.totalHtml}`);
  console.log(`Noticias analizadas: ${news.totalNews}`);
  console.log(`Críticos: ${criticalCount}`);
  console.log(`Avisos: ${warningsCount}`);
  console.log(`  · Páginas en sitemap con noindex o inexistentes: ${guia.noindexInSitemap.length}`);
  console.log(`  · URLs del listado inicial que ya no existen: ${guia.removedUrls.length}`);
  console.log(`  · Páginas indexables con [PENDIENTE: ${guia.pendingInIndexable.length}`);
  console.log(`  · JSON-LD con errores de sintaxis: ${guia.jsonLdErrors.length}`);
  console.log(`  · Event sin campos obligatorios: ${guia.eventErrors.length}`);
  console.log(`  · Páginas indexables con menos de ${MIN_OWN_WORDS} palabras propias (aviso): ${guia.thinPages.length}`);
  const detail = [
    ...guia.noindexInSitemap.map((x) => `SITEMAP/${x.motivo}: ${x.url}`),
    ...guia.removedUrls.map((u) => `URL DESAPARECIDA: ${u}`),
    ...guia.pendingInIndexable.map((u) => `[PENDIENTE en indexable: ${u}`),
    ...guia.jsonLdErrors.map((x) => `JSON-LD inválido: ${x.url} (${x.error})`),
    ...guia.eventErrors.map((x) => `Event incompleto: ${x.url} (${x.missing.join(', ')})`),
    ...guia.thinPages.map((x) => `Poco texto (${x.words} palabras): ${x.url}`),
  ];
  for (const line of detail.slice(0, 60)) console.log(`    - ${line}`);
  if (detail.length > 60) console.log(`    … y ${detail.length - 60} más (ver informe).`);
  console.log('  Fase 6:');
  console.log(`  · Noticias indexables sin origen "original": ${fase6.noticiasNoOriginales.length}`);
  console.log(`  · Guías indexables con menos de 300 palabras o [PENDIENTE: ${fase6.guiasFinas.length}`);
  console.log(`  · Eventos de alhaurinhoy indexables sin validar: ${fase6.eventosSinValidar.length}`);
  console.log(`  · URLs del listado de la fase 6 que darían 404: ${fase6.urls404.length}`);
  const f6detail = [
    ...fase6.noticiasNoOriginales.map((u) => `NOTICIA no original indexable: ${u}`),
    ...fase6.guiasFinas.map((g) => `GUÍA fina (${g.words} palabras${g.pendiente ? ', [PENDIENTE' : ''}): ${g.url}`),
    ...fase6.eventosSinValidar.map((u) => `EVENTO alhaurinhoy sin validar indexable: ${u}`),
    ...fase6.urls404.map((u) => `404: ${u}`),
  ];
  for (const line of f6detail.slice(0, 40)) console.log(`    - ${line}`);
  const sections = [...new Set([...Object.keys(fase6.before), ...Object.keys(fase6.after)])].sort();
  if (Object.keys(fase6.before).length) {
    console.log('  Páginas indexables por sección (antes de la fase 6 → ahora):');
    for (const sec of sections) console.log(`    ${sec.padEnd(24)} ${String(fase6.before[sec] || 0).padStart(4)} → ${String(fase6.after[sec] || 0).padStart(4)}`);
    const tb = Object.values(fase6.before).reduce((a, b) => a + b, 0);
    const ta = Object.values(fase6.after).reduce((a, b) => a + b, 0);
    console.log(`    ${'TOTAL'.padEnd(24)} ${String(tb).padStart(4)} → ${String(ta).padStart(4)}`);
  }
  console.log(`Informe: ${path.relative(ROOT, REPORT_FILE)}`);

  if (criticalCount && !WARN_ONLY) {
    process.exitCode = 1;
  }
}

main();
