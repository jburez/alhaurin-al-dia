// Detección de noticias ajenas a Alhaurín el Grande (fase 6).
//
//   - ajena: menciona un lugar de data/geografia.json → entidades_ajenas y no
//     menciona Alhaurín el Grande. Se desenlaza de listados y enlaces internos.
//   - dudosa: menciona un municipio de la comarca (entidades_revision_manual,
//     Álora, Pizarra) sin mencionar Alhaurín el Grande. Solo se lista para
//     revisión manual; no se toca.
//
// Se puede forzar a mano con el campo `ajena: true | false` en la noticia.

const fs = require('fs');
const path = require('path');

const GEO = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'geografia.json'), 'utf8'));

function norm(text = '') {
  return String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function termRe(term) {
  return new RegExp(`(^|[^a-z0-9])${norm(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
}

const AJENAS = (GEO.entidades_ajenas || []).map((t) => [t, termRe(t)]);
const COMARCA = [...(GEO.entidades_revision_manual || []), 'Álora', 'Pizarra'].map((t) => [t, termRe(t)]);

function mentionsAlhaurin(text) {
  return /alhaurin/.test(norm(text).replace(/alhaurin de la torre/g, '').replace(/alhaurin al dia/g, ''));
}

function classify(noticia) {
  const text = `${noticia.titulo || ''} ${noticia.descripcion || noticia.resumen || ''}`;
  if (noticia.ajena === true) return { ajena: true, dudosa: false, motivo: ['marcada a mano'] };
  if (noticia.ajena === false || mentionsAlhaurin(text)) return { ajena: false, dudosa: false, motivo: [] };
  const n = norm(text);
  const aj = AJENAS.filter(([, re]) => re.test(n)).map(([t]) => t);
  if (aj.length) return { ajena: true, dudosa: false, motivo: aj };
  const co = COMARCA.filter(([, re]) => re.test(n)).map(([t]) => t);
  return { ajena: false, dudosa: co.length > 0, motivo: co };
}

function isAjena(noticia) {
  return classify(noticia).ajena;
}

module.exports = { classify, isAjena };
