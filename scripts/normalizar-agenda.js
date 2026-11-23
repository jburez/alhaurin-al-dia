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
// Fase 6: los eventos de alhaurinhoy.es son solo pistas. Si no están
// validados (desde el panel, con lugar y descripción propia), los nuevos van a
// data/agenda_borradores.json y no se publican; los que ya tenían ficha la
// conservan (noindex) pero no salen en los listados. Cuando el texto de un
// evento menciona un lugar conocido de data/lugares.json con dirección, se le
// asignan lugar y dirección (anotado en reports/agenda-lugares-asignados.json).
//
// Uso: node scripts/normalizar-agenda.js

const fs = require('fs');
const path = require('path');
const {
  AGENDA_FILE, CATEGORIES, DEFAULT_CATEGORY, makeSlug, normalizeEvent, cleanTitle, cleanText, sortByDate, validado,
} = require('./lib/agenda');
const { todayIso, MESES } = require('./lib/layout');

const ROOT = path.resolve(__dirname, '..');
const LOCAL_FILE = path.join(ROOT, 'data', 'agenda-local.json');
const OVERRIDES_FILE = path.join(ROOT, 'data', 'agenda-overrides.json');
const SLUGS_FILE = path.join(ROOT, 'data', 'evento-slugs.json');
const PLANES_DIR = path.join(ROOT, 'planes');
const BORRADORES_FILE = path.join(ROOT, 'data', 'agenda_borradores.json');
const LUGARES_FILE = path.join(ROOT, 'data', 'lugares.json');
const LUGARES_REPORT = path.join(ROOT, 'reports', 'agenda-lugares-asignados.json');
const { PISTAS_SOURCES } = require('./lib/agenda');

function norm(text = '') {
  return String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function loadLugares() {
  const data = readJson(LUGARES_FILE, { lugares: [] });
  return (data.lugares || []).filter((l) => l.direccion && !/\[PENDIENTE/.test(l.direccion));
}

// Asigna lugar y dirección si el texto del evento menciona un lugar conocido.
function assignPlace(ev, lugares, asignados) {
  if (ev.direccion) return ev;
  const text = norm(`${ev.titulo} ${ev.lugar} ${ev.descripcion} ${ev.extracto_fuente}`);
  const hit = lugares.find((l) => (l.alias || [l.nombre]).some((a) => text.includes(norm(a))));
  if (!hit) return ev;
  asignados.push({ id: ev.id, titulo: ev.titulo, lugar: hit.nombre, direccion: hit.direccion });
  return { ...ev, lugar: ev.lugar || hit.nombre, direccion: hit.direccion, lugar_asignado: hit.id };
}

function wordsOf(text = '') {
  return new Set(norm(text).replace(/[^a-z0-9ñ ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3));
}

// Más del 60 % de las palabras de la descripción ya estaban en el texto de la fuente.
function pareceCopia(descripcion, fuente) {
  const a = wordsOf(descripcion);
  const b = wordsOf(String(fuente).replace(/\.\.\.$/, ''));
  if (!a.size || !b.size) return false;
  let comunes = 0;
  for (const w of a) if (b.has(w)) comunes++;
  return comunes / a.size > 0.6;
}

function saveBorradores(pistas) {
  const data = readJson(BORRADORES_FILE, { borradores: [] });
  const lista = data.borradores || [];
  const byId = new Map(lista.map((b) => [b.id, b]));
  let nuevos = 0;
  for (const p of pistas) {
    if (!byId.has(p.id)) nuevos++;
    byId.set(p.id, { ...(byId.get(p.id) || {}), ...p });
  }
  data._descripcion = 'Pistas y borradores de agenda: eventos detectados en feeds (generar_noticias.py --modo agenda) y eventos de alhaurinhoy.es pendientes de validar. NUNCA se publican solos: para publicar uno de alhaurinhoy, edítalo desde el panel de administración escribiendo lugar y descripción propia.';
  data.borradores = [...byId.values()].sort((a, b) => String(a.fecha_inicio_detectada || a.fecha_inicio || '').localeCompare(String(b.fecha_inicio_detectada || b.fecha_inicio || '')));
  writeJsonIfChanged(BORRADORES_FILE, data);
  return nuevos;
}

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
    if (PISTAS_SOURCES.has(merged.fuente)) {
      merged.validado = validado({ ...merged, descripcion: merged.descripcion, lugar: merged.lugar }, overrideMap[id] || {});
      merged.publicado = merged.validado;
      if (!merged.validado) {
        merged.descripcion = '';
        merged.lugar = '';
      }
    }
    result.set(id, merged);
  }

  // 2. Eventos vivos: siempre con los datos más recientes. Los de alhaurinhoy
  // sin validar que aún no tienen ficha van a borradores (pistas).
  const pistas = [];
  const conFicha = (raw) => Boolean(slugs[raw.id]) || previous.has(raw.id);
  for (const raw of liveEvents) {
    if (!raw.id || !raw.inicio) continue;
    const override = overrideMap[raw.id] || {};
    const esPista = PISTAS_SOURCES.has(raw.fuente) && !validado(raw, override);
    const futuro = String(raw.fin || raw.inicio).slice(0, 10) >= todayIso();
    if (esPista) {
      if (futuro) pistas.push({
        id: raw.id,
        estado: 'pista',
        origen: raw.fuente,
        titulo: cleanTitle(raw.titulo),
        fecha_inicio: String(raw.inicio).slice(0, 10),
        hora: (String(raw.inicio).match(/T(\d{2}:\d{2})/) || [])[1] || '',
        texto_fuente: cleanText(raw.descripcion || '').slice(0, 600),
        url_fuente: raw.url || '',
        ficha: conFicha(raw) ? `/planes/${slugs[raw.id] || previous.get(raw.id).slug}/` : '',
        _como_publicar: 'Edítalo desde el panel de administración con lugar y descripción propia.',
      });
      // Sin ficha previa no se crea ninguna página; si ya la tenía, se conserva
      // (noindex y fuera de listados) para no generar un 404.
      if (!conFicha(raw)) continue;
    }
    let ev = normalizeEvent(raw, slugFor(raw), override);
    // Salvaguarda: un evento de alhaurinhoy editado en el panel sin reescribir
    // la descripción (el formulario viene relleno con el texto de la fuente) no
    // cuenta como validado.
    const prev = previous.get(raw.id);
    if (ev.validado && PISTAS_SOURCES.has(ev.fuente) && prev && prev.extracto_fuente && pareceCopia(ev.descripcion, prev.extracto_fuente)) {
      console.log(`⚠️  ${raw.id} («${ev.titulo}»): la descripción coincide con la de alhaurinhoy; reescríbela en el panel para publicarlo.`);
      ev = { ...ev, validado: false, publicado: false, descripcion: '', extracto_fuente: prev.extracto_fuente, _motivo_no_validado: 'descripción copiada de la fuente' };
    }
    result.set(raw.id, ev);
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

  // 4. Lugares conocidos.
  const lugares = loadLugares();
  const asignados = [];
  for (const [id, ev] of result) result.set(id, assignPlace(ev, lugares, asignados));
  fs.mkdirSync(path.dirname(LUGARES_REPORT), { recursive: true });
  fs.writeFileSync(LUGARES_REPORT, `${JSON.stringify(asignados, null, 2)}\n`);
  const nuevasPistas = saveBorradores(pistas);

  const eventos = [...result.values()].sort(sortByDate);
  writeJsonIfChanged(AGENDA_FILE, {
    _descripcion: 'Agenda normalizada generada por scripts/normalizar-agenda.js a partir de data/agenda-local.json y data/agenda-overrides.json. No editar a mano: los datos manuales van en data/agenda-overrides.json.',
    eventos,
  });
  writeJsonIfChanged(SLUGS_FILE, slugs);

  const today = todayIso();
  const futuros = eventos.filter((ev) => (ev.fecha_fin || ev.fecha_inicio) >= today).length;
  const publicados = eventos.filter((ev) => ev.publicado !== false && (ev.fecha_fin || ev.fecha_inicio) >= today).length;
  console.log(`Agenda normalizada: ${eventos.length} eventos (${futuros} futuros, ${publicados} futuros publicables, ${liveEvents.length} vivos en agenda-local.json, ${recovered} recuperados de fichas antiguas).`);
  console.log(`Pistas de alhaurinhoy a borradores: ${pistas.length} (${nuevasPistas} nuevas). Lugares asignados: ${asignados.length}.`);
}

main();
