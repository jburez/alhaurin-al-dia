// Directorio de comercios: lectura y normalización de data/comercios.json
// (más las fichas activas que llegan del panel en comercios-destacados.json),
// reglas de «destacado» y el hueco de comercio destacado (patrocinio).

const fs = require('fs');
const path = require('path');
const { escapeHtml, slugify } = require('./layout');

const ROOT = path.resolve(__dirname, '..', '..');
const COMERCIOS_FILE = path.join(ROOT, 'data', 'comercios.json');
const PANEL_FILE = path.join(ROOT, 'data', 'comercios-destacados.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

const FIELDS = ['slug', 'nombre', 'categoria', 'descripcion', 'direccion', 'zona', 'telefono', 'web', 'redes', 'horario', 'destacado', 'patrocinado_hasta'];

function normalize(raw, categorias) {
  const nombre = String(raw.nombre || '').trim();
  const categoria = categorias.find((c) => c.slug === raw.categoria || c.nombre === raw.categoria)?.slug || slugify(raw.categoria || 'otros');
  return {
    slug: raw.slug || slugify(nombre),
    nombre,
    categoria,
    descripcion: String(raw.descripcion || '').trim(),
    direccion: String(raw.direccion || '').trim(),
    zona: String(raw.zona || '').trim(),
    telefono: String(raw.telefono || raw.telefonoHref || '').trim(),
    web: String(raw.web || '').trim(),
    redes: Array.isArray(raw.redes) ? raw.redes : [],
    horario: String(raw.horario || '').trim(),
    destacado: raw.destacado === true,
    patrocinado_hasta: raw.patrocinado_hasta || null,
    _origen: raw._origen || 'directorio',
  };
}

function loadComercios() {
  const data = readJson(COMERCIOS_FILE, { categorias: [], comercios: [] });
  const categorias = data.categorias || [];
  const comercios = (data.comercios || []).map((c) => normalize(c, categorias)).filter((c) => c.nombre);
  // Fichas destacadas dadas de alta desde el panel de administración.
  const panel = readJson(PANEL_FILE, { comercios: [] });
  for (const item of panel.comercios || []) {
    if (item.activo === false || !item.nombre) continue;
    const c = normalize({
      nombre: item.nombre, categoria: item.categoria, descripcion: item.descripcion, zona: item.zona,
      telefono: item.telefonoHref, web: /^https?:/.test(item.url || '') ? item.url : '', destacado: true,
      patrocinado_hasta: item.patrocinado_hasta || null, _origen: 'panel',
    }, categorias);
    if (!comercios.some((x) => x.slug === c.slug)) comercios.push(c);
  }
  return { categorias, comercios };
}

// Patrocinio vigente: destacado y con fecha de fin de patrocinio no vencida.
// Las fichas activas del panel cuentan como vigentes mientras estén activas.
function patrocinioVigente(c, today) {
  if (!c.destacado) return false;
  if (c._origen === 'panel' && !c.patrocinado_hasta) return true;
  return Boolean(c.patrocinado_hasta && c.patrocinado_hasta >= today);
}

function sortComercios(list, today) {
  return [...list].sort((a, b) => {
    const da = patrocinioVigente(a, today) ? 0 : 1;
    const db = patrocinioVigente(b, today) ? 0 : 1;
    return da - db || a.nombre.localeCompare(b.nombre, 'es');
  });
}

function tieneFicha(c) {
  return Boolean(c.descripcion && (c.direccion || c.horario));
}

function fichaUrl(c) {
  return `/comercios/${c.categoria}/${c.slug}/`;
}

function categoriaUrl(cat) {
  return `/comercios/${cat.slug || cat}/`;
}

// Hueco de «comercio destacado» (portada, farmacia de guardia…). Si no hay
// ningún patrocinio vigente, muestra el espacio disponible.
function renderFeaturedSlot(today, { ubicacion = 'portada' } = {}) {
  const { comercios, categorias } = loadComercios();
  const vigentes = comercios.filter((c) => patrocinioVigente(c, today));
  if (!vigentes.length) {
    return `<aside class="alh-featured-slot" data-hueco-destacado="${escapeHtml(ubicacion)}" aria-label="Comercio destacado">
                    <span class="alh-tag alh-tag-destacado">Destacado</span>
                    <h3>¿Tienes un negocio en Alhaurín?</h3>
                    <p>Este espacio está reservado para un comercio destacado de Alhaurín el Grande. <a href="/anunciarse/">Infórmate aquí</a>.</p>
                </aside>`;
  }
  // Rotación diaria determinista entre los patrocinios vigentes.
  const day = Number(today.replace(/-/g, ''));
  const c = vigentes[day % vigentes.length];
  const cat = categorias.find((x) => x.slug === c.categoria);
  const link = tieneFicha(c) ? fichaUrl(c) : (c.web || categoriaUrl(c.categoria));
  const external = /^https?:/.test(link);
  return `<aside class="alh-featured-slot" data-hueco-destacado="${escapeHtml(ubicacion)}" aria-label="Comercio destacado">
                    <span class="alh-tag alh-tag-destacado">Destacado</span>${cat ? ` <span class="alh-tag">${escapeHtml(cat.nombre)}</span>` : ''}
                    <h3>${escapeHtml(c.nombre)}</h3>
                    ${c.descripcion ? `<p>${escapeHtml(c.descripcion)}</p>` : ''}
                    <p><a href="${escapeHtml(link)}"${external ? ' target="_blank" rel="sponsored noopener"' : ''}>Ver ${tieneFicha(c) ? 'ficha' : 'más'} →</a></p>
                </aside>`;
}

module.exports = {
  FIELDS, loadComercios, patrocinioVigente, sortComercios, tieneFicha, fichaUrl, categoriaUrl, renderFeaturedSlot,
};
