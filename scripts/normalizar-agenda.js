// Normaliza la agenda a data/agenda.json (esquema único para las páginas).
//
// Entrada:
//   - data/agenda-local.json      eventos vivos (scrapers + panel de administración)
//   - data/agenda-overrides.json  datos añadidos a mano por id (dirección, precio,
//                                 organizador, descripción propia, imagen…)
//   - data/evento-slugs.json      id -> slug de /planes/<slug>/ (acumulativo)
//   - data/agenda.json            resultado anterior (acumulativo)
//
// Salida: data/agenda.json con, por evento: slug, titulo, fecha_inicio,
// fecha_fin, hora, lugar, direccion, descripcion, categoria, precio/gratuito,
// organizador, url_fuente, imagen (más campos de apoyo).
//
// Es acumulativo: los eventos que salen de agenda-local.json (a los 30 días)
// se conservan para que su página siga existiendo (nunca 404). Los eventos de
// las fichas antiguas de /planes/ sin datos se recuperan una vez de su HTML.
//
// Uso: node scripts/normalizar-agenda.js

const fs = require('fs');
const path = require('path');
const {
  AGENDA_FILE, CATEGORIES, DEFAULT_CATEGORY, makeSlug, normalizeEvent, cleanTitle, cleanText, sortByDate,
} = require('./lib/agenda');
const { todayIso, MESES } = require('./lib/layout');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_FILE = path.join(ROOT, 'data', 'agenda-local.json');
const OVERRIDES_FILE = path.join(ROOT, 'data', 'agenda-overrides.json');
const SLUGS_FILE = path.join(ROOT, 'data', 'evento-slugs.json');
const PLANES_DIR = path.join(ROOT, 'planes');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function writeJsonIfChanged(file, data) {
  const next = `${JSON.stringify(data, null, 2)}\n`;
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === next) return false;
  fs.writeFileSync(file, next);
  return true;
}

function decode(text = '') {
  return String(text)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Recupera los datos de una ficha antigua de /planes/<slug>/ (plantilla de
// generar_paginas_eventos.py) cuando el evento ya no está en agenda-local.json.
function recoverFromHtml(id, slug) {
  const file = path.join(PLANES_DIR, slug, 'index.html');
  if (!fs.existsSync(file)) return null;
  const html = fs.readFileSync(file, 'utf8');
  const title = html.match(/<h1 class="ev-title">([\s\S]*?)<\/h1>/);
  const date = html.match(/📅\s*[A-Za-zÁÉÍÓÚáéíóúñ]+,\s*(\d{1,2}) de ([a-z]+) de (\d{4})/);
  if (!title || !date) return null;
  const month = MESES.indexOf(date[2]) + 1;
  if (month < 1) return null;
  const iso = `${date[3]}-${String(month).padStart(2, '0')}-${String(Number(date[1])).padStart(2, '0')}`;
  const hours = html.match(/⏰\s*(\d{2}:\d{2})(?:\s*—\s*(\d{2}:\d{2}))?/);
  const place = html.match(/📍\s*([^<]+)</);
  const body = html.match(/<div class="ev-body">\s*<p>([\s\S]*?)<\/p>/);
  const source = html.match(/<p class="ev-source">Fuente: <a href="([^"]+)"/);
  const badge = html.match(/<span class="ev-badge">[^<]*?([A-Za-zÁÉÍÓÚáéíóúñ][^<]*)<\/span>/);
  const cat = CATEGORIES.find((c) => badge && decode(badge[1]).includes(c.name)) || DEFAULT_CATEGORY;
  const url = source ? decode(source[1]) : '';
  return {
    id,
    slug,
    titulo: cleanTitle(decode(title[1])),
    fecha_inicio: iso,
    fecha_fin: iso,
    hora: hours ? hours[1] : '',
    hora_fin: hours && hours[2] ? hours[2] : '',
    lugar: place ? cleanText(decode(place[1])) : '',
    direccion: '',
    descripcion: '',
    extracto_fuente: body ? cleanText(decode(body[1])) : '',
    categoria: cat.id,
    precio: null,
    gratuito: null,
    organizador: '',
    url_fuente: url,
    fuente: /alhaurinhoy/.test(url) ? 'alhaurinhoy' : (id.startsWith('manual-') ? 'manual' : 'desconocida'),
    imagen: '',
    estado_evento: 'programado',
    _recuperado_de_html: true,
  };
}

function main() {
  const local = readJson(LOCAL_FILE, { eventos: [] });
  const liveEvents = local.eventos || [];
  const overrides = readJson(OVERRIDES_FILE, {});
  const overrideMap = overrides.eventos || overrides;
  const slugs = readJson(SLUGS_FILE, {});
  const prevData = readJson(AGENDA_FILE, { eventos: [] });
  const previous = new Map((prevData.eventos || []).map((ev) => [ev.id, ev]));

  const usedSlugs = new Set(Object.values(slugs));
  const slugFor = (raw) => {
    if (slugs[raw.id]) return slugs[raw.id];
    let slug = makeSlug(raw.id);
    if (usedSlugs.has(slug)) slug = `${slug}-${String(raw.inicio || '').slice(0, 10).replace(/-/g, '')}`;
    usedSlugs.add(slug);
    slugs[raw.id] = slug;
    return slug;
  };

  const liveIds = new Set(liveEvents.map((e) => e.id));
  const result = new Map();

  // 1. Eventos conservados de ejecuciones anteriores (con los datos manuales al día).
  for (const [id, ev] of previous) {
    // Un evento manual borrado desde el panel deja de existir.
    if (id.startsWith('manual-') && !liveIds.has(id)) continue;
    const merged = { ...ev };
    for (const [key, value] of Object.entries(overrideMap[id] || {})) {
      if (!key.startsWith('_') && value !== undefined && value !== '') merged[key] = value;
    }
    result.set(id, merged);
  }

  // 2. Eventos vivos: siempre con los datos más recientes.
  for (const raw of liveEvents) {
    if (!raw.id || !raw.inicio) continue;
    result.set(raw.id, normalizeEvent(raw, slugFor(raw), overrideMap[raw.id]));
  }

  // 3. Fichas antiguas de /planes/ sin datos: se recuperan una vez de su HTML.
  let recovered = 0;
  for (const [id, slug] of Object.entries(slugs)) {
    if (result.has(id) || (id.startsWith('manual-') && !liveIds.has(id))) continue;
    const ev = recoverFromHtml(id, slug);
    if (ev) {
      result.set(id, ev);
      recovered++;
    }
  }

  // Los eventos manuales borrados también salen del mapa de slugs.
  for (const id of Object.keys(slugs)) {
    if (id.startsWith('manual-') && !liveIds.has(id)) delete slugs[id];
  }

  const eventos = [...result.values()].sort(sortByDate);
  writeJsonIfChanged(AGENDA_FILE, {
    _descripcion: 'Agenda normalizada generada por scripts/normalizar-agenda.js a partir de data/agenda-local.json y data/agenda-overrides.json. No editar a mano: los datos manuales van en data/agenda-overrides.json.',
    eventos,
  });
  writeJsonIfChanged(SLUGS_FILE, slugs);

  const today = todayIso();
  const futuros = eventos.filter((ev) => (ev.fecha_fin || ev.fecha_inicio) >= today).length;
  console.log(`Agenda normalizada: ${eventos.length} eventos (${futuros} futuros, ${liveEvents.length} vivos en agenda-local.json, ${recovered} recuperados de fichas antiguas).`);
}

main();
