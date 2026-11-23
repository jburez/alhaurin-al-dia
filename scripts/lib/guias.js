// Acceso compartido a data/guias.json (guías, portada, sitemaps, auditoría).
// Desde la fase 6 las guías se publican en /guia-util/<slug>/ (las antiguas
// URLs /guias/<slug>/ redirigen con 301).

const fs = require('fs');
const path = require('path');

const GUIAS_FILE = path.join(__dirname, '..', '..', 'data', 'guias.json');

const CATEGORIAS_GUIA = {
  tramites: { nombre: 'Trámites', icono: '📋' },
  salud: { nombre: 'Salud', icono: '🩺' },
  educacion: { nombre: 'Educación', icono: '🎒' },
  transporte: { nombre: 'Transporte', icono: '🚌' },
  ocio: { nombre: 'Ocio y cultura', icono: '🎭' },
  fiestas: { nombre: 'Fiestas y tradiciones', icono: '🎉' },
  naturaleza: { nombre: 'Naturaleza y rutas', icono: '🌿' },
  servicios: { nombre: 'Servicios', icono: '🛠️' },
};

function loadGuias() {
  const data = JSON.parse(fs.readFileSync(GUIAS_FILE, 'utf8'));
  return Array.isArray(data) ? data : data.guias || [];
}

// "publicada" en datos. La indexación final depende además de que la página
// generada cumpla los criterios (ver render-guias.js → criteriosPublicacion).
function isPublicada(guia) {
  return guia && guia.estado === 'publicada';
}

function guideUrl(guia) {
  return `/guia-util/${guia.slug}/`;
}

function legacyGuideUrl(guia) {
  return `/guias/${guia.slug}/`;
}

module.exports = { CATEGORIAS_GUIA, loadGuias, isPublicada, guideUrl, legacyGuideUrl, GUIAS_FILE };
