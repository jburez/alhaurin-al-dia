// Datos de «Hoy en Alhaurín» compartidos por la portada, la farmacia de
// guardia y los avisos. Solo lee lo que ya hay en data/: no inventa nada.

const fs = require('fs');
const path = require('path');
const { addDays } = require('./layout');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = (name) => path.join(ROOT, 'data', name);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

// ---------- Farmacias ----------

function loadPharmacies() {
  const farmacias = readJson(DATA('farmacias.json'), []);
  const guardiasData = readJson(DATA('guardias-farmacias-2026.json'), { guardias: {}, meta: {} });
  const byId = Object.fromEntries(farmacias.map((f) => [f.id, f]));
  return { farmacias, byId, guardias: guardiasData.guardias || {}, meta: guardiasData.meta || {} };
}

function pharmacyOn(dateIso, data = loadPharmacies()) {
  const id = data.guardias[dateIso];
  return id ? data.byId[id] || null : null;
}

// Horario de guardia tal y como figura en la fuente (meta.descripcion).
function guardSchedule(meta = {}) {
  const m = String(meta.descripcion || '').match(/de (\d{1,2}:\d{2}) a (\d{1,2}:\d{2})/);
  return m ? { desde: m[1], hasta: m[2] } : null;
}

function mapsUrl(farmacia) {
  const q = `${farmacia.nombre}, ${farmacia.direccion}, Alhaurín el Grande`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function pharmacyCalendar(fromIso, days, data = loadPharmacies()) {
  return Array.from({ length: days }, (_, i) => {
    const date = addDays(fromIso, i);
    return { date, farmacia: pharmacyOn(date, data) };
  });
}

// ---------- Tiempo ----------

function weatherFor(dateIso) {
  const t = readJson(DATA('tiempo-aemet.json'), null);
  if (!t) return { hoy: null, manana: null, actualizado: '' };
  const dias = t.semana || [];
  const find = (iso) => dias.find((d) => d.fecha === iso) || null;
  return { hoy: find(dateIso), manana: find(addDays(dateIso, 1)), actualizado: t.actualizado || '', fuente: t.fuente || 'AEMET' };
}

// ---------- Avisos ----------

function isActiveAt(aviso, nowIso) {
  if (aviso.activo === false || aviso.resuelto === true) return false;
  const now = Date.parse(nowIso);
  const ini = aviso.inicio ? Date.parse(aviso.inicio) : null;
  const fin = aviso.fin ? Date.parse(aviso.fin) : null;
  if (fin && !Number.isNaN(fin) && fin < now) return false;
  if (ini && !Number.isNaN(ini) && ini > now + 2 * 86400000) return false; // anunciados para dentro de > 48 h
  return true;
}

function loadAvisos(nowIso = new Date().toISOString()) {
  const locales = readJson(DATA('avisos-locales.json'), { avisos: [], historial: [] });
  const oficiales = readJson(DATA('avisos-oficiales.json'), []);
  const activosLocales = (locales.avisos || []).filter((a) => isActiveAt(a, nowIso)).map((a) => ({
    origen: 'local', icono: a.icono || '⚠️', tipo: a.tipo || 'Aviso', titulo: a.titulo, detalle: a.detalle || a.valor || '',
    fuente: a.fuente || '', url: a.url || '', inicio: a.inicio || '', fin: a.fin || '',
  }));
  const activosOficiales = (Array.isArray(oficiales) ? oficiales : [])
    .filter((a) => !['finalizado', 'cancelado', 'expirado'].includes(String(a.estado_ciclo_vida || '').toLowerCase()) && isActiveAt(a, nowIso))
    .map((a) => ({
      origen: 'aemet', icono: '🌦️', tipo: `Aviso ${a.nivel || ''}`.trim(), titulo: a.titulo, detalle: a.descripcion || '',
      fuente: a.fuente || 'AEMET', url: a.fuente_url || '', inicio: a.inicio || '', fin: a.fin || '',
    }));
  const since = Date.parse(nowIso) - 60 * 86400000;
  const historial = [
    ...(locales.historial || []).map((a) => ({
      origen: 'local', icono: a.icono || '✅', tipo: a.tipo || 'Aviso', titulo: a.titulo, detalle: a.detalle || '',
      fuente: a.fuente || '', url: a.url || '', inicio: a.inicio || '', fin: a.fin || '',
    })),
    ...(Array.isArray(oficiales) ? oficiales : [])
      .filter((a) => String(a.estado_ciclo_vida || '').toLowerCase() === 'finalizado')
      .map((a) => ({
        origen: 'aemet', icono: '🌦️', tipo: `Aviso ${a.nivel || ''}`.trim(), titulo: a.titulo, detalle: a.descripcion || '',
        fuente: a.fuente || 'AEMET', url: a.fuente_url || '', inicio: a.inicio || '', fin: a.fin || '',
      })),
  ]
    .filter((a) => !a.inicio || Date.parse(a.inicio) >= since)
    .sort((a, b) => String(b.inicio).localeCompare(String(a.inicio)));
  return { activos: [...activosLocales, ...activosOficiales], historial };
}

module.exports = {
  loadPharmacies, pharmacyOn, guardSchedule, mapsUrl, pharmacyCalendar, weatherFor, loadAvisos, readJson,
};
