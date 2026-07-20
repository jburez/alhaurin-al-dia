const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'noticias.json');
const REPORT_DIR = path.join(ROOT, 'reports');
const REPORT_FILE = path.join(REPORT_DIR, 'news-dedupe-report.json');
const WRITE = process.argv.includes('--write');
const MAX_NEWS = Number(process.env.MAX_NOTICIAS_TOTAL || 30);

const STOPWORDS = new Set([
  'alhaurin', 'alhaurín', 'grande', 'malaga', 'málaga', '2026', '2025',
  'noticia', 'noticias', 'actualidad', 'local', 'programa', 'video', 'vídeo',
  'ayuntamiento', 'rtv', 'atv', 'diario', 'sur', 'europa', 'press', 'para',
  'sobre', 'desde', 'hasta', 'este', 'esta', 'estos', 'estas', 'entre', 'tras',
  'con', 'del', 'los', 'las', 'una', 'uno', 'por', 'que', 'como'
]);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 4) + '\n');
}

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
    .filter(word => word.length > 3 && !STOPWORDS.has(word));
}

function titleSignature(noticia) {
  return words(`${noticia.titulo || ''} ${noticia.descripcion || noticia.resumen || ''}`)
    .slice(0, 14)
    .join(' ');
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

  return priority + imageBonus + pageBonus + keywordBonus + Math.min(titleLength, 95) / 10 + Math.min(descriptionLength, 230) / 20 + Math.min(bodyLength, 900) / 100;
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
  const intersection = [...wa].filter(word => wb.has(word)).length;
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

function summarize(noticia) {
  return {
    titulo: noticia.titulo || '',
    pagina: noticia.pagina || '',
    fuente: noticia.fuente || '',
    fecha: noticia.fecha || '',
    enlace: noticia.enlace || noticia.url || '',
  };
}

function chooseCanonical(group) {
  return [...group].sort((a, b) => {
    const scoreDiff = qualityScore(b) - qualityScore(a);
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff;
    return parseDate(b.fecha) - parseDate(a.fecha);
  })[0];
}

function dedupeNews(noticias) {
  const groups = [];

  for (const noticia of noticias) {
    let matchedGroup = null;

    for (const group of groups) {
      if (group.some(existing => arePotentialDuplicates(existing, noticia))) {
        matchedGroup = group;
        break;
      }
    }

    if (matchedGroup) matchedGroup.push(noticia);
    else groups.push([noticia]);
  }

  const kept = [];
  const duplicateGroups = [];

  for (const group of groups) {
    const canonical = chooseCanonical(group);
    kept.push(canonical);

    if (group.length > 1) {
      duplicateGroups.push({
        canonical: summarize(canonical),
        duplicates: group.filter(item => item !== canonical).map(summarize),
      });
    }
  }

  kept.sort((a, b) => parseDate(b.fecha) - parseDate(a.fecha));

  return {
    kept: kept.slice(0, MAX_NEWS),
    duplicateGroups,
    removedByLimit: kept.slice(MAX_NEWS).map(summarize),
  };
}

function main() {
  const noticias = readJson(DATA_FILE, []);

  if (!Array.isArray(noticias)) {
    console.error('data/noticias.json no contiene un array');
    process.exit(1);
  }

  const result = dedupeNews(noticias);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: WRITE ? 'write' : 'dry-run',
    inputCount: noticias.length,
    outputCount: result.kept.length,
    duplicateGroupsCount: result.duplicateGroups.length,
    removedByLimitCount: result.removedByLimit.length,
    duplicateGroups: result.duplicateGroups,
    removedByLimit: result.removedByLimit,
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  writeJson(REPORT_FILE, report);

  if (WRITE) {
    writeJson(DATA_FILE, result.kept);
  }

  console.log(`Deduplicación noticias: ${WRITE ? 'WRITE' : 'DRY-RUN'}`);
  console.log(`Entrada: ${report.inputCount}`);
  console.log(`Salida: ${report.outputCount}`);
  console.log(`Grupos duplicados: ${report.duplicateGroupsCount}`);
  console.log(`Recortadas por límite: ${report.removedByLimitCount}`);
  console.log(`Informe: ${path.relative(ROOT, REPORT_FILE)}`);
}

main();
