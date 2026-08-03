// Pre-renderiza en index.html los tres widgets de "Hoy en Alhaurín" que hasta
// ahora solo existían inyectados por JavaScript (home-live.js, home-agenda.js,
// home-commerce.js): estado local (tiempo + avisos + tráfico + servicios),
// agenda próxima y comercio destacado. Sin esto, cualquier crawler o carga
// lenta veía literalmente "Cargando...", igual que le pasaba antes a la
// farmacia de guardia (ver render-farmacia-guardia-static.js). La lógica de
// fusión de datos replica exactamente la de esos tres scripts cliente, para
// que la hidratación en el navegador no cambie nada visible.
//
// Se ejecuta como parte de `npm run build`, igual que farmacia:static.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOME_FILE = path.join(ROOT, 'index.html');
const DATA = {
  estadoLocal: path.join(ROOT, 'data', 'estado-local.json'),
  avisosLocales: path.join(ROOT, 'data', 'avisos-locales.json'),
  tiempoAemet: path.join(ROOT, 'data', 'tiempo-aemet.json'),
  avisosOficiales: path.join(ROOT, 'data', 'avisos-oficiales.json'),
  agendaLocal: path.join(ROOT, 'data', 'agenda-local.json'),
  comercios: path.join(ROOT, 'data', 'comercios-destacados.json'),
};

const SITE_URL = 'https://alhaurinaldia.es';
const TZ = 'Europe/Madrid';

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function locateContainer(html, elementId) {
  const openTagPattern = new RegExp(`<(div|section|article|span)([^>]*\\bid=["']${elementId}["'][^>]*)>`, 'i');
  const match = openTagPattern.exec(html);

  if (!match) {
    throw new Error(`No se encontró el contenedor #${elementId}`);
  }

  const tagName = match[1];
  const openTagStart = match.index;
  const openTagEnd = openTagStart + match[0].length;
  let cursor = openTagEnd;
  let depth = 1;
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tagPattern.lastIndex = openTagEnd;

  while (depth > 0) {
    const tagMatch = tagPattern.exec(html);
    if (!tagMatch) {
      throw new Error(`No se pudo encontrar el cierre de #${elementId}`);
    }
    if (tagMatch[0].startsWith('</')) depth -= 1;
    else depth += 1;
    cursor = tagMatch.index;
  }

  return { openTagEnd, closeStart: cursor };
}

function setContainerInnerHTML(html, elementId, innerHTML) {
  const { openTagEnd, closeStart } = locateContainer(html, elementId);
  return html.slice(0, openTagEnd) + innerHTML + html.slice(closeStart);
}

function normalizeLink(link = '#') {
  if (!link || link === '#') return '#';
  const value = String(link).trim();
  if (/^(#|https?:\/\/|mailto:|tel:)/.test(value)) return value;
  return `${SITE_URL}/${value.replace(/^\.?\/+/, '')}`;
}

function isExternalLink(url) {
  return /^https?:\/\//i.test(url) && !url.startsWith(SITE_URL);
}

function formatUpdatedLong(value) {
  if (!value) return 'Actualización pendiente';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Actualización pendiente';
  const day = date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', timeZone: TZ });
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  return `Actualizado ${day} a las ${time}`;
}

function formatUpdatedShort(value, fallback) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return fallback;
  return `Actualizada ${date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', timeZone: TZ })}`;
}

// ---- Estado local (home-live.js) ----

function getStatusLabel(estado = 'neutral') {
  return { ok: 'Normal', warning: 'Aviso', alert: 'Atención', neutral: 'Info' }[estado] || 'Info';
}

function getSeverityWeight(estado = '') {
  return { alert: 4, warning: 3, ok: 2, neutral: 1 }[estado] || 1;
}

function isActiveNotice(notice) {
  if (!notice || notice.activo === false) return false;
  const now = new Date();
  const starts = notice.inicio ? new Date(notice.inicio) : null;
  const ends = notice.fin ? new Date(notice.fin) : null;
  if (starts && !Number.isNaN(starts.getTime()) && starts > now) return false;
  if (ends && !Number.isNaN(ends.getTime()) && ends < now) return false;
  return true;
}

function getNoticeTarget(notice) {
  const text = `${String(notice.tipo || '').toLowerCase()} ${String(notice.titulo || '').toLowerCase()}`;
  if (/tráfico|trafico|calle|carretera|desvío|desvio/.test(text)) return 'trafico';
  if (/procesión|procesion|evento|agenda|feria|romería|romeria/.test(text)) return 'agenda';
  return 'avisos';
}

function buildCardForTarget(target, notices) {
  const targetNotices = notices
    .filter(isActiveNotice)
    .filter((notice) => getNoticeTarget(notice) === target)
    .sort((a, b) => getSeverityWeight(b.estado) - getSeverityWeight(a.estado));
  if (!targetNotices.length) return null;
  const mainNotice = targetNotices[0];
  const countSuffix = targetNotices.length > 1 ? ` · ${targetNotices.length} avisos activos` : '';
  const titles = { avisos: 'Avisos locales', trafico: 'Tráfico', agenda: 'Agenda' };
  return {
    id: target,
    icono: mainNotice.icono || '📢',
    titulo: titles[target] || 'Avisos locales',
    valor: mainNotice.valor || mainNotice.titulo || 'Aviso activo',
    detalle: `${mainNotice.detalle || 'Hay un aviso local activo.'}${countSuffix}`,
    estado: mainNotice.estado || 'warning',
    fuente: mainNotice.fuente || 'Alhaurín al Día',
    cta: mainNotice.cta || 'Ver avisos',
    url: mainNotice.url || './avisos/',
  };
}

function mergeLocalNotices(items, noticesData) {
  const notices = Array.isArray(noticesData?.avisos) ? noticesData.avisos : [];
  const cardsByTarget = {
    avisos: buildCardForTarget('avisos', notices),
    trafico: buildCardForTarget('trafico', notices),
    agenda: buildCardForTarget('agenda', notices),
  };
  const replacedTargets = new Set();
  const merged = items.map((item) => {
    const replacement = cardsByTarget[item.id];
    if (replacement) {
      replacedTargets.add(item.id);
      return replacement;
    }
    return item;
  });
  Object.entries(cardsByTarget).forEach(([target, card]) => {
    if (card && !replacedTargets.has(target)) merged.push(card);
  });
  return merged;
}

function nivelToEstado(nivel) {
  const value = String(nivel || '').toLowerCase();
  return value === 'naranja' || value === 'rojo' ? 'alert' : 'warning';
}

function isActiveAvisoOficial(aviso) {
  return Boolean(aviso) && aviso.estado_ciclo_vida !== 'finalizado' && isActiveNotice(aviso);
}

function buildCardFromAvisoOficial(aviso) {
  const nivel = aviso.nivel ? ` (nivel ${aviso.nivel})` : '';
  return {
    id: 'avisos',
    icono: '⚠️',
    titulo: 'Avisos',
    valor: `${aviso.fenomeno || aviso.titulo || 'Aviso activo'}${nivel}`,
    detalle: aviso.descripcion || 'Aviso meteorológico oficial activo.',
    estado: nivelToEstado(aviso.nivel),
    fuente: aviso.fuente || 'AEMET',
    cta: 'Ver aviso oficial',
    url: aviso.fuente_url || './avisos/',
  };
}

function mergeAvisosOficiales(items, avisosOficialesData) {
  const avisos = Array.isArray(avisosOficialesData) ? avisosOficialesData : [];
  const activos = avisos
    .filter(isActiveAvisoOficial)
    .sort((a, b) => getSeverityWeight(nivelToEstado(b.nivel)) - getSeverityWeight(nivelToEstado(a.nivel)));
  if (!activos.length) return items;
  const card = buildCardFromAvisoOficial(activos[0]);
  const replaced = items.some((item) => item.id === 'avisos');
  const merged = items.map((item) => (item.id === 'avisos' ? card : item));
  return replaced ? merged : [...merged, card];
}

function mergeWeather(items, weatherData) {
  const weatherItem = weatherData?.item;
  if (!weatherItem || typeof weatherItem !== 'object') return items;
  const cleaned = items.filter((item) => item.id !== 'tiempo' && item.id !== 'andalmet');
  return [weatherItem, ...cleaned];
}

function renderDailyItem(item) {
  const estado = item.estado || 'neutral';
  const url = normalizeLink(item.url || '#');
  const external = isExternalLink(url);
  const cta = item.cta || 'Ver más';
  const source = item.fuente ? `<span class="daily-source">Fuente: ${escapeHTML(item.fuente)}</span>` : '';
  return `<article class="daily-card ${escapeHTML(estado)}"><div class="daily-card-top"><span class="daily-icon" aria-hidden="true">${escapeHTML(item.icono || '•')}</span><div><strong>${escapeHTML(item.titulo || 'Estado')}</strong><span class="daily-status-badge">${escapeHTML(getStatusLabel(estado))}</span></div></div><div class="daily-value">${escapeHTML(item.valor || 'Consultar')}</div><p>${escapeHTML(item.detalle || 'Información pendiente de actualización.')}</p>${source}<a class="daily-link" href="${escapeHTML(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHTML(cta)} →</a></article>`;
}

function renderDailyStatus(html) {
  const estadoLocal = readJSON(DATA.estadoLocal, { items: [] });
  const avisosLocales = readJSON(DATA.avisosLocales, { avisos: [] });
  const tiempo = readJSON(DATA.tiempoAemet, null);
  const avisosOficiales = readJSON(DATA.avisosOficiales, []);

  const baseItems = Array.isArray(estadoLocal.items) ? estadoLocal.items : [];
  const withWeather = mergeWeather(baseItems, tiempo);
  const withLocalNotices = mergeLocalNotices(withWeather, avisosLocales);
  const items = mergeAvisosOficiales(withLocalNotices, avisosOficiales);

  const updated = avisosLocales?.actualizado && Array.isArray(avisosLocales.avisos) && avisosLocales.avisos.some(isActiveNotice)
    ? avisosLocales.actualizado
    : estadoLocal.actualizado;

  let actualizado = setContainerInnerHTML(html, 'daily-updated', escapeHTML(formatUpdatedLong(updated)));

  const inner = items.length
    ? items.map(renderDailyItem).join('')
    : '<article class="daily-card neutral daily-card-wide"><strong>Estado local</strong><div class="daily-value">Pendiente</div><p>No hay información diaria configurada todavía.</p></article>';

  return setContainerInnerHTML(actualizado, 'daily-status', inner);
}

// ---- Agenda próxima (home-agenda.js) ----

function isUpcomingEvent(event) {
  const now = new Date();
  const start = event.inicio ? new Date(event.inicio) : null;
  const end = event.fin ? new Date(event.fin) : null;
  if (event.activo === false) return false;
  if (end && !Number.isNaN(end.getTime()) && end < now) return false;
  if (!start && !end) return false;
  return true;
}

function formatEventDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Fecha pendiente';
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
}

function formatEventTimeRange(event) {
  const start = event.inicio ? new Date(event.inicio) : null;
  const end = event.fin ? new Date(event.fin) : null;
  if (!start || Number.isNaN(start.getTime())) return 'Horario pendiente';
  const startTime = start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
  const endTime = end && !Number.isNaN(end.getTime()) ? end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '';
  return endTime ? `${startTime} - ${endTime}` : startTime;
}

function renderAgendaEmpty() {
  return `<article class="home-agenda-empty"><div class="home-agenda-empty-icon">📅</div><div><h3>Sin eventos destacados próximos</h3><p>Cuando haya actividades, cortes, procesiones, feria o avisos programados confirmados, aparecerán aquí.</p></div><a href="${escapeHTML(normalizeLink('planes/'))}">Ver planes →</a></article>`;
}

function renderAgendaEvent(event) {
  const url = normalizeLink(event.url || 'planes/');
  const external = isExternalLink(url);
  return `<article class="home-agenda-card ${escapeHTML(event.estado || 'neutral')}"><div class="home-agenda-date"><strong>${escapeHTML(formatEventDate(event.inicio))}</strong><span>${escapeHTML(formatEventTimeRange(event))}</span></div><div class="home-agenda-content"><span class="home-agenda-type">${escapeHTML(event.tipo || 'Agenda')}</span><h3>${escapeHTML(event.titulo || 'Evento local')}</h3><p>${escapeHTML(event.descripcion || 'Actividad local pendiente de ampliar.')}</p><small>${escapeHTML(event.lugar || 'Alhaurín el Grande')}</small></div><a class="home-agenda-link" href="${escapeHTML(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHTML(event.cta || 'Ver detalle')} →</a></article>`;
}

function renderAgenda(html) {
  const data = readJSON(DATA.agendaLocal, { eventos: [] });
  const events = Array.isArray(data.eventos) ? data.eventos : [];
  const upcoming = events
    .filter(isUpcomingEvent)
    .sort((a, b) => {
      const dateA = (a.inicio && new Date(a.inicio)) || (a.fin && new Date(a.fin)) || new Date(8640000000000000);
      const dateB = (b.inicio && new Date(b.inicio)) || (b.fin && new Date(b.fin)) || new Date(8640000000000000);
      return dateA - dateB;
    })
    .slice(0, 4);

  let actualizado = setContainerInnerHTML(html, 'home-agenda-updated', escapeHTML(formatUpdatedShort(data.actualizado, 'Agenda pendiente de actualización')));
  const inner = upcoming.length ? upcoming.map(renderAgendaEvent).join('') : renderAgendaEmpty();
  return setContainerInnerHTML(actualizado, 'home-agenda-list', inner);
}

// ---- Comercio destacado (home-commerce.js) ----

function isActiveCommerce(item) {
  return Boolean(item) && item.activo !== false;
}

function renderCommerceEmpty() {
  return `<article class="featured-commerce-empty"><div class="featured-commerce-empty-icon">★</div><div><span class="sponsored-label">Espacio patrocinado</span><h3>Comercio destacado disponible</h3><p>Un espacio limpio y visible para restaurantes, tiendas, profesionales o servicios de Alhaurín el Grande.</p></div><a href="${escapeHTML(normalizeLink('anunciarse/'))}">Quiero aparecer →</a></article>`;
}

function renderCommerceItem(item) {
  const url = normalizeLink(item.url || 'comercios/');
  const phoneUrl = item.telefonoHref ? `tel:${item.telefonoHref}` : '';
  const external = isExternalLink(url);
  const image = item.imagen || '';
  const media = image
    ? `<img src="${escapeHTML(normalizeLink(image))}" alt="${escapeHTML(item.nombre || 'Comercio destacado')}" loading="lazy">`
    : `<span>${escapeHTML((item.nombre || 'A').slice(0, 1))}</span>`;
  const meta = `${item.categoria ? `<span>${escapeHTML(item.categoria)}</span>` : ''}${item.zona ? `<span>${escapeHTML(item.zona)}</span>` : ''}`;
  return `<article class="featured-commerce-card"><div class="featured-commerce-media">${media}</div><div class="featured-commerce-content"><span class="sponsored-label">${escapeHTML(item.etiqueta || 'Comercio destacado')}</span><h3>${escapeHTML(item.nombre || 'Comercio local')}</h3><p>${escapeHTML(item.descripcion || 'Negocio local de Alhaurín el Grande.')}</p><div class="featured-commerce-meta">${meta}</div><div class="featured-commerce-actions"><a href="${escapeHTML(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHTML(item.cta || 'Ver comercio')}</a>${phoneUrl ? `<a class="secondary" href="${escapeHTML(phoneUrl)}">Llamar</a>` : ''}</div></div></article>`;
}

function renderCommerce(html) {
  const data = readJSON(DATA.comercios, { comercios: [] });
  const items = Array.isArray(data.comercios) ? data.comercios.filter(isActiveCommerce).slice(0, 2) : [];

  let actualizado = setContainerInnerHTML(html, 'featured-commerce-updated', escapeHTML(formatUpdatedShort(data.actualizado, 'Espacio comercial disponible')));
  const inner = items.length ? items.map(renderCommerceItem).join('') : renderCommerceEmpty();
  return setContainerInnerHTML(actualizado, 'featured-commerce-list', inner);
}

function main() {
  const original = fs.readFileSync(HOME_FILE, 'utf8');
  let actualizado = renderDailyStatus(original);
  actualizado = renderAgenda(actualizado);
  actualizado = renderCommerce(actualizado);

  if (actualizado !== original) {
    fs.writeFileSync(HOME_FILE, actualizado);
    console.log('[home-widgets-static] index.html actualizado.');
  } else {
    console.log('[home-widgets-static] Sin cambios.');
  }
}

main();
