// Utilidades compartidas de la agenda: categorías, slugs, normalización y
// reglas de indexación. Las usan normalizar-agenda.js, render-agenda.js, la
// portada y la auditoría.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const AGENDA_FILE = path.join(ROOT, 'data', 'agenda.json');
const SITE_LOCALITY = 'Alhaurín el Grande';
const POSTAL_CODE = '29120';

// Mismas categorías y palabras clave que scripts/generar_paginas_eventos.py y
// planes/calendario.js, para que el calendario y la agenda coincidan.
const CATEGORIES = [
  { id: 'virgen', name: 'Virgen de Gracia', keywords: ['virgen', 'gracia', 'patrona'] },
  { id: 'cultos', name: 'Cultos y procesiones', keywords: ['procesión', 'procesion', 'triduo', 'ofrenda', 'traslado procesional', 'traslado', 'ermita', 'festividad'] },
  { id: 'nazareno', name: 'Hdad. Jesús Nazareno', keywords: ['nazareno', 'jesús nazareno', 'padre jesús', 'padre jesus'] },
  { id: 'veracruz', name: 'Santa Vera Cruz', keywords: ['vera cruz', 'veracruz'] },
  { id: 'futbol', name: 'Fútbol', keywords: ['fútbol', 'futbol', 'cd alhaurino', 'alhaurino vs', 'málaga cf', '🆚'] },
  { id: 'motor', name: 'Motor', keywords: ['moto gp', 'formula 1', 'motogp', '🏍'] },
  { id: 'cine', name: 'Cine', keywords: ['cine', '🎬', '🍿'] },
  { id: 'musica', name: 'Música en vivo', keywords: ['music', 'músic', 'dj', '🎶', '🎸', '🎙', 'concierto', 'live'] },
  { id: 'gastro', name: 'Gastronomía', keywords: ['gastro', 'tomate', 'brunch', 'ruta gastro', '🍽', '🍅'] },
];
const DEFAULT_CATEGORY = { id: 'otros', name: 'Otros eventos' };
const CATEGORY_BY_ID = Object.fromEntries([...CATEGORIES, DEFAULT_CATEGORY].map((c) => [c.id, c]));

// Fuentes cuyo texto es propio de Alhaurín al Día (eventos dados de alta a
// mano desde el panel). El resto (alhaurinhoy, ayuntamiento…) es texto ajeno.
const OWN_SOURCES = new Set(['manual']);

function getCategory(raw) {
  const text = `${raw.titulo || ''} ${raw.tipo || ''} ${raw.descripcion || ''}`.toLowerCase();
  const titulo = String(raw.titulo || '').toLowerCase();
  if (/\bcine\b/.test(titulo) || text.includes('🎬') || text.includes('🍿')) return CATEGORY_BY_ID.cine;
  for (const cat of CATEGORIES) {
    if (cat.id === 'cine') continue;
    if (cat.keywords.some((kw) => text.includes(kw))) return cat;
  }
  return DEFAULT_CATEGORY;
}

const EMOJI_RE = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;

function cleanTitle(title = '') {
  const cleaned = String(title).replace(EMOJI_RE, ' ').replace(/\s+/g, ' ').replace(/^[\s\-–—·|:]+|[\s\-–—·|:]+$/g, '').trim();
  return cleaned || 'Evento';
}

function cleanText(text = '') {
  return String(text).replace(EMOJI_RE, ' ').replace(/\s+/g, ' ').trim();
}

// Igual que make_slug() de scripts/generar_paginas_eventos.py.
function makeSlug(id = '') {
  let slug = String(id).replace('alhaurinhoy-', 'e-');
  slug = slug.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x00-\x7F]/g, '');
  slug = slug.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[-\s]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'evento';
}

function datePart(iso = '') {
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : '';
}

function timePart(iso = '') {
  const m = String(iso).match(/T(\d{2}):(\d{2})/);
  if (!m) return '';
  const hhmm = `${m[1]}:${m[2]}`;
  return hhmm === '00:00' ? '' : hhmm;
}

// Convierte un evento de data/agenda-local.json (+ datos manuales opcionales
// de data/agenda-overrides.json) al esquema normalizado de data/agenda.json.
function normalizeEvent(raw, slug, override = {}) {
  const cat = getCategory(raw);
  const fuente = raw.fuente || 'manual';
  const own = OWN_SOURCES.has(fuente);
  const fechaInicio = datePart(raw.inicio);
  const fechaFin = datePart(raw.fin) || fechaInicio;
  const base = {
    id: raw.id,
    slug,
    titulo: cleanTitle(raw.titulo),
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin < fechaInicio ? fechaInicio : fechaFin,
    hora: timePart(raw.inicio),
    hora_fin: timePart(raw.fin),
    lugar: cleanText(raw.lugar || ''),
    direccion: '',
    descripcion: own ? cleanText(raw.descripcion || '') : '',
    extracto_fuente: own ? '' : cleanText(raw.descripcion || ''),
    categoria: cat.id,
    precio: null,
    gratuito: null,
    organizador: '',
    url_fuente: raw.url || '',
    fuente,
    imagen: raw.imagen || '',
    estado_evento: raw.activo === false ? 'cancelado' : 'programado',
  };
  // Los datos añadidos a mano tienen prioridad (dirección, precio, organizador,
  // descripción propia…). Nunca se rellenan automáticamente.
  for (const [key, value] of Object.entries(override || {})) {
    if (key.startsWith('_')) continue;
    if (value !== undefined && value !== '') base[key] = value;
  }
  return base;
}

function loadAgenda() {
  try {
    const data = JSON.parse(fs.readFileSync(AGENDA_FILE, 'utf8'));
    return Array.isArray(data) ? data : data.eventos || [];
  } catch (_) {
    return [];
  }
}

function eventUrl(ev) {
  return `/planes/${ev.slug}/`;
}

function hasOwnDescription(ev) {
  return Boolean(ev.descripcion && ev.descripcion.trim().length >= 80);
}

function hasLocation(ev) {
  return Boolean((ev.direccion && ev.direccion.trim()) || (ev.lugar && ev.lugar.trim()));
}

function isPast(ev, today) {
  return (ev.fecha_fin || ev.fecha_inicio) < today;
}

function daysSinceEnd(ev, today) {
  const end = new Date(`${ev.fecha_fin || ev.fecha_inicio}T12:00:00Z`);
  const now = new Date(`${today}T12:00:00Z`);
  return Math.round((now - end) / 86400000);
}

// Regla de indexación de una ficha de evento:
//   - 30 días después de su fecha de fin pasa a noindex;
//   - mientras tanto, solo es indexable si tiene descripción propia y lugar
//     (los eventos con el texto copiado de otra web quedan en noindex).
function indexability(ev, today) {
  if (daysSinceEnd(ev, today) > 30) return { indexable: false, motivo: 'pasado-30-dias' };
  if (!hasOwnDescription(ev)) return { indexable: false, motivo: 'sin-descripcion-propia' };
  if (!hasLocation(ev)) return { indexable: false, motivo: 'sin-lugar' };
  return { indexable: true, motivo: '' };
}

function overlaps(ev, from, to) {
  return ev.fecha_inicio <= to && (ev.fecha_fin || ev.fecha_inicio) >= from;
}

function sortByDate(a, b) {
  return (a.fecha_inicio + (a.hora || '99')).localeCompare(b.fecha_inicio + (b.hora || '99')) || a.titulo.localeCompare(b.titulo, 'es');
}

function upcoming(events, today, limit = Infinity) {
  return events
    .filter((ev) => ev.estado_evento !== 'cancelado' && (ev.fecha_fin || ev.fecha_inicio) >= today)
    .sort(sortByDate)
    .slice(0, limit);
}

module.exports = {
  AGENDA_FILE,
  CATEGORIES,
  CATEGORY_BY_ID,
  DEFAULT_CATEGORY,
  SITE_LOCALITY,
  POSTAL_CODE,
  getCategory,
  cleanTitle,
  cleanText,
  makeSlug,
  normalizeEvent,
  loadAgenda,
  eventUrl,
  hasOwnDescription,
  hasLocation,
  isPast,
  daysSinceEnd,
  indexability,
  overlaps,
  sortByDate,
  upcoming,
};
