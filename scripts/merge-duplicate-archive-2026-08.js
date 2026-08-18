// Migración one-off (2026-08-18): fusiona las noticias duplicadas del
// archivo histórico (la misma noticia reescrita por IA varias veces, nunca
// deduplicada retroactivamente — ver el hallazgo de la auditoría de hoy:
// 151 grupos / 436 de 651 artículos, 67%, son duplicados). Motivado por un
// rechazo de AdSense por "contenido de poco valor".
//
// Reutiliza la MISMA lógica de detección y de elección de ganadora que ya
// corre en producción en scripts/dedupe-news.js (arePotentialDuplicates,
// chooseCanonical) — copiada aquí a propósito en vez de importada, para no
// tocar ese script de producción con código de una migración de un solo uso.
//
// Las páginas perdedoras NUNCA se borran (el propio historial de este repo
// tiene la lección aprendida en scripts/archive-orphan-news.js: borrar
// páginas ya indexadas generó cientos de 404 en Search Console). En vez de
// eso, se convierten en un stub de redirección — mismo patrón exacto que ya
// usa /planes/calendario/index.html en producción: meta refresh instantáneo
// + <link rel="canonical"> hacia la ganadora, sin noindex (Google recomienda
// no combinar canonical con noindex; el canonical solo ya consolida las
// señales de SEO en la página buena). Su entrada en
// data/noticias-archivo.json no se borra tampoco, solo se marca con
// "fusionadaEn" — así scripts/audit-orphan-pages.js la sigue reconociendo
// como página esperada y no vuelve a salir como huérfana.
//
// Uso: node scripts/merge-duplicate-archive-2026-08.js [--write]
// Sin --write hace dry-run: solo escribe el informe, no toca noticias/ ni
// data/noticias-archivo.json.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITE_URL = 'https://alhaurinaldia.es';
const NEWS_FILE = path.join(ROOT, 'data', 'noticias.json');
const ARCHIVE_FILE = path.join(ROOT, 'data', 'noticias-archivo.json');
const REPORT_FILE = path.join(ROOT, 'reports', 'merge-duplicate-archive-report.json');
const WRITE = process.argv.includes('--write');

// ── Copiado de scripts/dedupe-news.js (ver cabecera) ──

const STOPWORDS = new Set([
  'alhaurin', 'alhaurín', 'grande', 'malaga', 'málaga', '2026', '2025',
  'noticia', 'noticias', 'actualidad', 'local', 'programa', 'video', 'vídeo',
  'ayuntamiento', 'rtv', 'atv', 'diario', 'sur', 'europa', 'press', 'para',
  'sobre', 'desde', 'hasta', 'este', 'esta', 'estos', 'estas', 'entre', 'tras',
  'con', 'del', 'los', 'las', 'una', 'uno', 'por', 'que', 'como',
]);

function normalize(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(value = '') {
  return normalize(value)
    .split(' ')
    .filter((word) => word.length > 3 && !STOPWORDS.has(word));
}

function sourceKey(noticia) {
  return normalize(noticia.enlace || noticia.url || '');
}

function pageKey(noticia) {
  return normalize(noticia.pagina || '');
}

function parseDate(value) {
  const date = new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function sourcePriority(noticia) {
  const fuente = normalize(noticia.fuente || '');
  if (fuente.includes('ayuntamiento')) return 120;
  if (fuente.includes('diario sur')) return 100;
  if (fuente.includes('hermandad')) return 95;
  if (fuente.includes('rtv')) return 90;
  if (fuente.includes('atv')) return 80;
  if (fuente.includes('europa press')) return 50;
  return 10;
}

function qualityScore(noticia) {
  const titleLength = String(noticia.titulo || '').length;
  const descriptionLength = String(noticia.descripcion || noticia.resumen || '').length;
  const bodyLength = String(noticia.cuerpo || '').length;
  const imageBonus = noticia.imagen ? 12 : 0;
  const pageBonus = noticia.pagina ? 8 : 0;
  const keywordBonus = Array.isArray(noticia.seo_keywords) ? Math.min(noticia.seo_keywords.length * 2, 10) : 0;
  const priority = sourcePriority(noticia);

  return priority + imageBonus + pageBonus + keywordBonus
    + Math.min(titleLength, 95) / 10
    + Math.min(descriptionLength, 230) / 20
    + Math.min(bodyLength, 900) / 100;
}

const DUPLICATE_WINDOW_DAYS = 14;

function isWithinDuplicateWindow(a, b) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.abs(parseDate(a.fecha) - parseDate(b.fecha)) / msPerDay;
  return diffDays <= DUPLICATE_WINDOW_DAYS;
}

function jaccard(a, b) {
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (!wa.size || !wb.size) return 0;
  const intersection = [...wa].filter((word) => wb.has(word)).length;
  const union = new Set([...wa, ...wb]).size;
  return intersection / union;
}

function arePotentialDuplicates(a, b) {
  const aSource = sourceKey(a);
  const bSource = sourceKey(b);
  if (aSource && bSource && aSource === bSource) return true;

  const aPage = pageKey(a);
  const bPage = pageKey(b);
  if (aPage && bPage && aPage === bPage) return true;

  const textA = `${a.titulo || ''} ${a.descripcion || a.resumen || ''}`;
  const textB = `${b.titulo || ''} ${b.descripcion || b.resumen || ''}`;
  const similarity = jaccard(textA, textB);

  return similarity >= 0.72 && isWithinDuplicateWindow(a, b);
}

function chooseCanonical(group) {
  return [...group].sort((a, b) => {
    const scoreDiff = qualityScore(b) - qualityScore(a);
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
    return parseDate(b.fecha) - parseDate(a.fecha);
  })[0];
}

// ── Fin de la parte copiada ──

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function redirectStubHTML(titulo, canonicalUrl) {
  return `<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=${canonicalUrl}">
    <link rel="canonical" href="${canonicalUrl}">
    <title>Redirigiendo...</title>
</head>
<body>
    <p>Esta noticia se ha fusionado con una cobertura más completa del mismo suceso. <a href="${canonicalUrl}">Ir a la noticia</a></p>
</body>
</html>
`;
}

function main() {
  const noticiasActivas = readJson(NEWS_FILE, []);
  const archivo = readJson(ARCHIVE_FILE, []);
  const activePaginas = new Set(noticiasActivas.map((n) => n.pagina));
  const todas = [...noticiasActivas, ...archivo];

  const groups = [];
  for (const noticia of todas) {
    let matchedGroup = null;
    for (const group of groups) {
      if (group.some((existing) => arePotentialDuplicates(existing, noticia))) {
        matchedGroup = group;
        break;
      }
    }
    if (matchedGroup) matchedGroup.push(noticia);
    else groups.push([noticia]);
  }

  const dupeGroups = groups.filter((g) => g.length > 1);

  const reportGroups = [];
  const paginaAFusionarEnCanonical = new Map(); // pagina perdedora -> pagina canónica
  let saltadasPorActiva = 0;

  for (const group of dupeGroups) {
    const canonical = chooseCanonical(group);
    const perdedoras = group.filter((n) => n !== canonical);
    const perdedorasValidas = [];

    for (const perdedora of perdedoras) {
      if (activePaginas.has(perdedora.pagina)) {
        // Salvaguarda: nunca convertir en redirección una noticia activa en
        // portada ahora mismo, aunque el algoritmo la marque como duplicada.
        // (Verificado antes de escribir este script: 0 de las 14 activas
        // caen en algún grupo, así que esto no debería activarse nunca —
        // se deja como cinturón de seguridad, no como caso esperado.)
        saltadasPorActiva += 1;
        continue;
      }
      if (!perdedora.pagina) continue;
      perdedorasValidas.push(perdedora);
      paginaAFusionarEnCanonical.set(perdedora.pagina, canonical.pagina);
    }

    if (!perdedorasValidas.length) continue;

    reportGroups.push({
      canonical: { titulo: canonical.titulo, pagina: canonical.pagina },
      perdedoras: perdedorasValidas.map((n) => ({ titulo: n.titulo, pagina: n.pagina })),
    });
  }

  reportGroups.sort((a, b) => b.perdedoras.length - a.perdedoras.length);

  let paginasEscritas = 0;
  let paginasSinArchivo = 0;

  if (WRITE) {
    for (const [paginaPerdedora, paginaCanonical] of paginaAFusionarEnCanonical) {
      const filePath = path.join(ROOT, paginaPerdedora);
      if (!fs.existsSync(filePath)) {
        paginasSinArchivo += 1;
        continue;
      }
      const canonicalUrl = `${SITE_URL}/${paginaCanonical}`;
      const titulo = (todas.find((n) => n.pagina === paginaPerdedora) || {}).titulo || '';
      fs.writeFileSync(filePath, redirectStubHTML(titulo, canonicalUrl));
      paginasEscritas += 1;
    }

    const archivoActualizado = archivo.map((entry) => {
      if (paginaAFusionarEnCanonical.has(entry.pagina)) {
        return { ...entry, fusionadaEn: paginaAFusionarEnCanonical.get(entry.pagina) };
      }
      return entry;
    });
    fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(archivoActualizado, null, 2) + '\n');
  }

  const report = {
    modo: WRITE ? 'write' : 'dry-run',
    totalCorpus: todas.length,
    gruposDuplicados: reportGroups.length,
    articulosAFusionar: paginaAFusionarEnCanonical.size,
    saltadasPorActiva,
    grupos: reportGroups,
  };

  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');

  console.log(`Fusión de duplicados del archivo: ${WRITE ? 'WRITE' : 'DRY-RUN'}`);
  console.log(`Corpus total: ${report.totalCorpus}`);
  console.log(`Grupos duplicados con al menos 1 perdedora fusionable: ${report.gruposDuplicados}`);
  console.log(`Páginas a fusionar: ${report.articulosAFusionar}`);
  if (saltadasPorActiva) console.log(`⚠️  Saltadas por ser noticia activa: ${saltadasPorActiva}`);
  if (WRITE) {
    console.log(`Páginas HTML convertidas en redirección: ${paginasEscritas}`);
    if (paginasSinArchivo) console.log(`⚠️  Sin archivo físico (omitidas): ${paginasSinArchivo}`);
  }
  console.log(`Informe: ${path.relative(ROOT, REPORT_FILE)}`);
  if (!WRITE) console.log('\nDry-run. Ejecuta con --write para aplicar los cambios.');
}

main();
