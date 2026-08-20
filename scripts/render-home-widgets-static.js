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
  radarTrafico: path.join(ROOT, 'data', 'radar-trafico.json'),
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

// Reglas puras de fusión/severidad/orden: cargadas dinámicamente en main()
// desde js/lib/estado-local-rules.js, la única fuente compartida con
// js/home-live.js (ver ese módulo para el porqué). `rules` se asigna antes
// de llamar a renderDailyStatus()/renderAgenda().
let rules = null;

function renderDailyItem(item) {
  const estado = item.estado || 'neutral';
  const url = normalizeLink(item.url || '#');
  const external = isExternalLink(url);
  const cta = item.cta || 'Ver más';
  const source = item.fuente ? `<span class="daily-source">Fuente: ${escapeHTML(item.fuente)}</span>` : '';
  const extraBadges = item.actividadesMini ? `<div class="daily-act-strip">${item.actividadesMini}</div>` : '';
  return `<article class="daily-card ${escapeHTML(estado)}"><div class="daily-card-top"><span class="daily-icon" aria-hidden="true">${escapeHTML(item.icono || '•')}</span><div><strong>${escapeHTML(item.titulo || 'Estado')}</strong><span class="daily-status-badge">${escapeHTML(rules.getStatusLabel(estado))}</span></div></div><div class="daily-value">${escapeHTML(item.valor || 'Consultar')}</div><p>${escapeHTML(item.detalle || 'Información pendiente de actualización.')}</p>${extraBadges}${source}<a class="daily-link" href="${escapeHTML(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHTML(cta)} →</a></article>`;
}

function renderDailyStatus(html) {
  const estadoLocal = readJSON(DATA.estadoLocal, { items: [] });
  const avisosLocales = readJSON(DATA.avisosLocales, { avisos: [] });
  const tiempo = readJSON(DATA.tiempoAemet, null);
  const avisosOficiales = readJSON(DATA.avisosOficiales, []);
  const radarTrafico = readJSON(DATA.radarTrafico, null);
  const agendaLocal = readJSON(DATA.agendaLocal, { eventos: [] });

  const baseItems = Array.isArray(estadoLocal.items) ? estadoLocal.items : [];
  const withWeather = rules.mergeWeather(baseItems, tiempo);
  // Orden de prioridad para "trafico"/"agenda": base < automático (Radar
  // Social / resumen de agenda) < aviso local manual (si alguien lo publica
  // expresamente, gana al automatismo) < aviso oficial (no toca estas dos
  // tarjetas, solo "avisos", así que no compite aquí).
  const withRadarTrafico = rules.mergeRadarTrafico(withWeather, radarTrafico);
  const withAgendaSummary = rules.mergeAgendaSummary(withRadarTrafico, agendaLocal);
  const withLocalNotices = rules.mergeLocalNotices(withAgendaSummary, avisosLocales);
  const merged = rules.mergeAvisosOficiales(withLocalNotices, avisosOficiales);
  // Un aviso "alert" gana la primera posición de la rejilla en vez de
  // depender del orden en que llegaron los datos (ver js/lib/estado-local-rules.js).
  const items = rules.sortBySeverity(merged);

  // El badge "Actualizado" debe reflejar la fuente más fresca que de verdad
  // alimenta lo que se ve en pantalla (p. ej. el tiempo se refresca varias
  // veces al día aunque el resto del panel no cambie), no solo la fecha del
  // archivo base estado-local.json. Misma lógica que js/home-live.js, para
  // que la hidratación en el navegador no cambie nada visible.
  const activosOficiales = (Array.isArray(avisosOficiales) ? avisosOficiales : []).filter(rules.isActiveAvisoOficial);
  const ultimoOficial = activosOficiales.length
    ? activosOficiales.reduce((max, aviso) => {
      const fecha = new Date(aviso.actualizado_en || aviso.inicio || 0);
      if (Number.isNaN(fecha.getTime())) return max;
      return (!max || fecha > max) ? fecha : max;
    }, null)
    : null;
  const noticiasActivas = Array.isArray(avisosLocales?.avisos) && avisosLocales.avisos.some(rules.isActiveNotice);
  const radarTraficoActivo = Boolean(radarTrafico?.reportes?.length);
  const agendaSummaryActiva = rules.getUpcomingAgendaEvents(Array.isArray(agendaLocal.eventos) ? agendaLocal.eventos : []).length > 0;

  const nowIso = new Date().toISOString();
  const updatedDate = rules.pickLatestDate(
    estadoLocal.actualizado,
    tiempo?.actualizado,
    noticiasActivas ? avisosLocales.actualizado : null,
    ultimoOficial,
    radarTraficoActivo ? radarTrafico.actualizado : null,
    agendaSummaryActiva ? agendaLocal.actualizado : null
  );
  const updated = updatedDate ? updatedDate.toISOString() : (estadoLocal.actualizado || nowIso);

  let actualizado = setContainerInnerHTML(html, 'daily-updated', escapeHTML(formatUpdatedLong(updated)));

  const inner = items.length
    ? items.map(renderDailyItem).join('')
    : '<article class="daily-card neutral daily-card-wide"><strong>Estado local</strong><div class="daily-value">Pendiente</div><p>No hay información diaria configurada todavía.</p></article>';

  return setContainerInnerHTML(actualizado, 'daily-status', inner);
}

// ---- Agenda próxima (home-agenda.js) ----

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
  return `<article class="home-agenda-card ${escapeHTML(event.estado || 'neutral')}"><div class="home-agenda-date"><strong>${escapeHTML(rules.formatEventDate(event.inicio, TZ))}</strong><span>${escapeHTML(formatEventTimeRange(event))}</span></div><div class="home-agenda-content"><span class="home-agenda-type">${escapeHTML(event.tipo || 'Agenda')}</span><h3>${escapeHTML(event.titulo || 'Evento local')}</h3><p>${escapeHTML(event.descripcion || 'Actividad local pendiente de ampliar.')}</p><small>${escapeHTML(event.lugar || 'Alhaurín el Grande')}</small></div><a class="home-agenda-link" href="${escapeHTML(url)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHTML(event.cta || 'Ver detalle')} →</a></article>`;
}

function renderAgenda(html) {
  const data = readJSON(DATA.agendaLocal, { eventos: [] });
  const events = Array.isArray(data.eventos) ? data.eventos : [];
  const upcoming = rules.getUpcomingAgendaEvents(events, 6);

  const updatedDate = data.actualizado || new Date().toISOString();
  let actualizado = setContainerInnerHTML(html, 'home-agenda-updated', escapeHTML(formatUpdatedShort(updatedDate, 'Agenda pendiente de actualización')));
  const calendarLink = `<div class="home-agenda-calendar-link"><a href="${escapeHTML(normalizeLink('planes/calendario/'))}">📅 Ver calendario completo de eventos →</a></div>`;
  const inner = upcoming.length
    ? upcoming.map(renderAgendaEvent).join('') + calendarLink
    : renderAgendaEmpty() + calendarLink;
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

  const updatedDate = data.actualizado || new Date().toISOString();
  let actualizado = setContainerInnerHTML(html, 'featured-commerce-updated', escapeHTML(formatUpdatedShort(updatedDate, 'Espacio comercial disponible')));

  // Normaliza primero: quita cualquier repetición ya acumulada de
  // style="display:none;" antes de decidir si hace falta volver a añadirlo,
  // para que el resultado sea siempre el mismo sin importar cuántas veces
  // se ejecute este script (el reemplazo anterior no comprobaba si el
  // atributo ya estaba presente y lo acumulaba en cada ejecución del cron).
  actualizado = actualizado.replace(
    /<section class="featured-commerce-section"(?:\s+style="display:none;")*/g,
    '<section class="featured-commerce-section"'
  );
  if (!items.length) {
    actualizado = actualizado.replace(
      /<section class="featured-commerce-section"/g,
      '<section class="featured-commerce-section" style="display:none;"'
    );
  }

  const inner = items.length ? items.map(renderCommerceItem).join('') : renderCommerceEmpty();
  return setContainerInnerHTML(actualizado, 'featured-commerce-list', inner);
}

async function main() {
  rules = await import('../js/lib/estado-local-rules.js');

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

main().catch((error) => {
  console.error('[home-widgets-static] Error:', error);
  process.exitCode = 1;
});
