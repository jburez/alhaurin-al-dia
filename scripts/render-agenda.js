// Genera las páginas de la agenda a partir de data/agenda.json
// (ver scripts/normalizar-agenda.js):
//
//   /planes/<slug>/         ficha de cada evento (se reutilizan las URLs ya indexadas)
//   /agenda/                listado completo con filtros (HTML estático + JS opcional)
//   /este-fin-de-semana/    planes de viernes a domingo, regenerado en cada build
//
// Uso: node scripts/render-agenda.js   (BUILD_DATE=AAAA-MM-DD para fijar «hoy»)

const fs = require('fs');
const path = require('path');
const {
  SITE_URL, PUBLISHER, escapeHtml, renderPage, renderBreadcrumbs, breadcrumbSchema, adSlot,
  todayIso, addDays, weekdayIndex, formatDateLong, capitalize, writeIfChanged, MESES, DIAS,
} = require('./lib/layout');
const {
  CATEGORY_BY_ID, SITE_LOCALITY, POSTAL_CODE, loadAgenda, eventUrl, indexability, isPast,
  overlaps, sortByDate, upcoming, hasOwnDescription, isListed,
} = require('./lib/agenda');

const ROOT = path.resolve(__dirname, '..');
const TODAY = todayIso();
const SOURCE_NAMES = { alhaurinhoy: 'alhaurinhoy.es', ayuntamiento: 'el Ayuntamiento de Alhaurín el Grande', manual: 'Alhaurín al Día' };

// ---------- Utilidades ----------

function madridOffset(iso) {
  // "+01:00" / "+02:00" según el horario de verano en Europe/Madrid.
  const d = new Date(`${iso}T12:00:00Z`);
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', timeZoneName: 'shortOffset' })
    .formatToParts(d).find((p) => p.type === 'timeZoneName').value; // "GMT+1"
  const m = name.match(/GMT([+-])(\d{1,2})/);
  return m ? `${m[1]}${m[2].padStart(2, '0')}:00` : '+01:00';
}

function isoDateTime(date, time) {
  return time ? `${date}T${time}:00${madridOffset(date)}` : date;
}

function categoryName(ev) {
  return (CATEGORY_BY_ID[ev.categoria] || { name: 'Otros eventos' }).name;
}

function dateRangeText(ev) {
  if (!ev.fecha_fin || ev.fecha_fin === ev.fecha_inicio) return capitalize(formatDateLong(ev.fecha_inicio));
  return `Del ${formatDateLong(ev.fecha_inicio, { year: false })} al ${formatDateLong(ev.fecha_fin)}`;
}

function timeText(ev) {
  if (!ev.hora) return '';
  return ev.hora_fin ? `${ev.hora} a ${ev.hora_fin} h` : `${ev.hora} h`;
}

function priceText(ev) {
  if (ev.gratuito === true) return 'Gratuito';
  if (ev.precio !== null && ev.precio !== undefined && ev.precio !== '') return /€/.test(String(ev.precio)) ? String(ev.precio) : `${ev.precio} €`;
  return '';
}

function sourceName(ev) {
  return SOURCE_NAMES[ev.fuente] || 'la fuente original';
}

function dateBadge(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `<span class="alh-date-badge" aria-hidden="true"><span class="d">${d}</span><span class="m">${MESES[m - 1].slice(0, 3)}</span></span>`;
}

function eventListItem(ev, { dataAttrs = false } = {}) {
  const meta = [timeText(ev), ev.lugar].filter(Boolean).map(escapeHtml).join(' · ');
  const attrs = dataAttrs
    ? ` data-agenda-item data-inicio="${ev.fecha_inicio}" data-fin="${ev.fecha_fin || ev.fecha_inicio}" data-categoria="${escapeHtml(ev.categoria)}"`
    : '';
  const range = ev.fecha_fin && ev.fecha_fin !== ev.fecha_inicio ? ` (hasta el ${formatDateLong(ev.fecha_fin, { weekday: false, year: false })})` : '';
  return `<li class="alh-event-item"${attrs}>
                        ${dateBadge(ev.fecha_inicio)}
                        <div class="alh-event-body">
                            <a href="${eventUrl(ev)}">${escapeHtml(ev.titulo)}</a>
                            <p class="alh-event-meta"><span class="alh-tag">${escapeHtml(categoryName(ev))}</span>${escapeHtml(capitalize(formatDateLong(ev.fecha_inicio, { year: false })))}${escapeHtml(range)}${meta ? ` · ${meta}` : ''}</p>
                        </div>
                    </li>`;
}

function eventList(events, opts) {
  if (!events.length) return '<p class="alh-empty">No hay planes registrados.</p>';
  return `<ul class="alh-event-list">
                    ${events.map((ev) => eventListItem(ev, opts)).join('\n                    ')}
                </ul>`;
}

// Fin de semana de referencia: si hoy es viernes, sábado o domingo, el actual;
// de lunes a jueves, el siguiente.
function weekendRange(today) {
  const wd = weekdayIndex(today); // 0 domingo … 6 sábado
  let friday;
  if (wd === 5) friday = today;
  else if (wd === 6) friday = addDays(today, -1);
  else if (wd === 0) friday = addDays(today, -2);
  else friday = addDays(today, 5 - wd);
  return { friday, saturday: addDays(friday, 1), sunday: addDays(friday, 2) };
}

// ---------- Ficha de evento ----------

function generatedDescription(ev) {
  const partes = [`«${ev.titulo}» es un plan de ${categoryName(ev).toLowerCase()} en ${SITE_LOCALITY}`];
  partes.push(ev.fecha_fin && ev.fecha_fin !== ev.fecha_inicio
    ? ` que se celebra del ${formatDateLong(ev.fecha_inicio, { year: false })} al ${formatDateLong(ev.fecha_fin)}`
    : ` previsto para el ${formatDateLong(ev.fecha_inicio)}`);
  if (ev.hora) partes.push(` a las ${ev.hora} h`);
  if (ev.lugar) partes.push(` en ${ev.lugar.replace(/\.\.\.$/, '')}`);
  return `${partes.join('')}.`;
}

function eventJsonLd(ev, canonical, description) {
  const address = {
    '@type': 'PostalAddress',
    ...(ev.direccion ? { streetAddress: ev.direccion } : {}),
    addressLocality: SITE_LOCALITY,
    postalCode: POSTAL_CODE,
    addressRegion: 'Málaga',
    addressCountry: 'ES',
  };
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: ev.titulo,
    description,
    url: canonical,
    startDate: isoDateTime(ev.fecha_inicio, ev.hora),
    endDate: isoDateTime(ev.fecha_fin || ev.fecha_inicio, ev.hora_fin || (ev.fecha_fin && ev.fecha_fin !== ev.fecha_inicio ? '' : ev.hora)),
    eventStatus: ev.estado_evento === 'cancelado' ? 'https://schema.org/EventCancelled'
      : ev.estado_evento === 'aplazado' ? 'https://schema.org/EventPostponed' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: { '@type': 'Place', name: ev.lugar.replace(/\.\.\.$/, '').trim() || SITE_LOCALITY, address },
    inLanguage: 'es-ES',
  };
  if (ev.imagen) data.image = [ev.imagen];
  if (ev.organizador) data.organizer = { '@type': 'Organization', name: ev.organizador, ...(ev.organizador_url ? { url: ev.organizador_url } : {}) };
  const price = ev.gratuito === true ? '0' : (ev.precio !== null && ev.precio !== undefined && ev.precio !== '' ? String(ev.precio).replace(/[^\d.,]/g, '').replace(',', '.') : null);
  if (price !== null && price !== '') {
    data.offers = {
      '@type': 'Offer',
      price,
      priceCurrency: 'EUR',
      availability: 'https://schema.org/InStock',
      url: ev.url_entradas || canonical,
    };
  }
  return data;
}

function renderEvent(ev, events) {
  const canonical = `${SITE_URL}${eventUrl(ev)}`;
  const crumbs = [{ name: 'Inicio', url: '/' }, { name: 'Agenda', url: '/agenda/' }, { name: ev.titulo, url: eventUrl(ev) }];
  const { indexable } = indexability(ev, TODAY);
  const past = isPast(ev, TODAY);
  const own = hasOwnDescription(ev);
  const description = own ? ev.descripcion : generatedDescription(ev);
  const next = upcoming(events, TODAY).filter((e) => e.id !== ev.id).slice(0, 4);
  const price = priceText(ev);

  const facts = [
    ['Fecha', dateRangeText(ev)],
    ['Hora', timeText(ev) || 'Por confirmar'],
    ['Lugar', ev.lugar ? ev.lugar.replace(/\.\.\.$/, '…') : 'Por confirmar'],
    ...(ev.direccion ? [['Dirección', ev.direccion]] : []),
    ['Precio', price || 'Consultar en la fuente'],
    ...(ev.organizador ? [['Organiza', ev.organizador]] : []),
  ].map(([k, v]) => `<div class="alh-fact"><span>${escapeHtml(k)}</span><strong>${escapeHtml(v)}</strong></div>`).join('\n                    ');

  const sourceLink = ev.url_fuente
    ? `<a href="${escapeHtml(ev.url_fuente)}" target="_blank" rel="nofollow noopener">${escapeHtml(sourceName(ev))}</a>`
    : escapeHtml(sourceName(ev));
  // El texto de la fuente (extracto_fuente) nunca se publica (fase 6).
  const extract = isListed(ev) ? '' : '<div class="alh-note"><strong>Evento sin verificar</strong><p>Alhaurín al Día no ha comprobado todavía los datos de este plan. Consulta la publicación original antes de ir.</p></div>';
  const mapLink = ev.direccion
    ? `<a class="alh-btn alh-btn-sec" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(`${ev.direccion}, ${SITE_LOCALITY}`)}" target="_blank" rel="noopener">Ver en el mapa</a>`
    : '';

  const body = `
        <article>
            <header class="alh-page-header">
                <div class="container alh-narrow">
                    ${renderBreadcrumbs(crumbs)}
                    <span class="alh-kicker">${escapeHtml(categoryName(ev))}</span>
                    <h1>${escapeHtml(ev.titulo)}</h1>
                    ${past ? `<div class="alh-past-banner" role="status">Este evento ya se celebró el ${escapeHtml(formatDateLong(ev.fecha_fin || ev.fecha_inicio))}. Mira abajo los próximos planes en Alhaurín el Grande.</div>` : ''}
                    ${ev.estado_evento === 'cancelado' ? '<div class="alh-past-banner" role="status">Este evento figura como cancelado en la fuente original.</div>' : ''}
                </div>
            </header>
            <div class="container alh-narrow">
                <div class="alh-event-facts">
                    ${facts}
                </div>
                <div class="alh-prose">
                    <p>${escapeHtml(description)}</p>
                    ${own ? '' : `<p>La información de este plan procede de ${sourceLink}. Antes de ir, consulta la publicación original para confirmar horarios, precios y posibles cambios de última hora.</p>`}
                    ${extract}
                    <div class="alh-actions">
                        <a class="alh-btn" href="/agenda/">Ver la agenda completa</a>
                        <a class="alh-btn alh-btn-sec" href="/este-fin-de-semana/">Planes de este fin de semana</a>
                        ${mapLink}
                    </div>
                </div>
                ${adSlot('evento')}
                <section class="alh-section">
                    <h2 class="alh-h2">Próximos planes en Alhaurín el Grande</h2>
                    <div class="alh-list-box">
                    ${eventList(next)}
                    </div>
                </section>
            </div>
        </article>`;

  return renderPage({
    title: `${ev.titulo} — ${formatDateLong(ev.fecha_inicio, { weekday: false })} — Alhaurín al Día`,
    description: `${description} Fecha, hora, lugar y enlace a la fuente original.`.slice(0, 300),
    canonical,
    robots: indexable ? 'index, follow' : 'noindex, follow',
    ogType: 'article',
    image: ev.imagen || '',
    jsonld: [eventJsonLd(ev, canonical, description), breadcrumbSchema(crumbs)],
    body,
  });
}

// Si la agenda se queda corta (menos de 5 planes en los próximos 14 días), las
// páginas no quedan vacías: se añaden enlaces útiles del día (fase 6).
function shortAgendaBlock(events) {
  const next14 = upcoming(events, TODAY).filter((ev) => ev.fecha_inicio <= addDays(TODAY, 14)).length;
  if (next14 >= 5) return '';
  return `<section class="alh-section">
                <div class="alh-note">
                    <strong>Pocos planes anunciados estos días</strong>
                    <p>Ahora mismo tenemos ${next14 === 0 ? 'ningún plan verificado' : `solo ${next14} ${next14 === 1 ? 'plan verificado' : 'planes verificados'}`} para las próximas dos semanas. Solo publicamos eventos cuya fecha, lugar y descripción hemos podido comprobar con el organizador o con una fuente oficial, así que la agenda crece a medida que los confirmamos.</p>
                    <p>Mientras tanto, te puede servir: la <a href="/farmacia-de-guardia/">farmacia de guardia de hoy</a>, <a href="/tiempo/">el tiempo en Alhaurín el Grande</a> para planear una salida, los <a href="/avisos/">avisos activos</a> y la <a href="/guia-util/">guía útil</a> con autobuses, teléfonos y trámites. Si organizas un evento, <a href="/contacto/">envíanos los datos</a> y lo añadimos.</p>
                </div>
            </section>`;
}

// ---------- /agenda/ ----------

function renderAgendaIndex(events) {
  const canonical = `${SITE_URL}/agenda/`;
  const crumbs = [{ name: 'Inicio', url: '/' }, { name: 'Agenda', url: '/agenda/' }];
  const list = upcoming(events, TODAY);
  const recent = events
    .filter((ev) => isListed(ev) && isPast(ev, TODAY) && overlaps(ev, addDays(TODAY, -30), addDays(TODAY, -1)))
    .sort(sortByDate).reverse().slice(0, 10);

  // Agrupado por mes en el HTML (lo que lee Google, sin depender de JS).
  const byMonth = new Map();
  for (const ev of list) {
    const key = (ev.fecha_inicio < TODAY ? TODAY : ev.fecha_inicio).slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(ev);
  }
  const monthsHtml = [...byMonth.entries()].map(([key, items]) => {
    const [y, m] = key.split('-').map(Number);
    return `<section class="alh-section" data-agenda-mes="${key}">
                <h2 class="alh-h2">${capitalize(MESES[m - 1])} de ${y}</h2>
                <div class="alh-list-box">
                <ul class="alh-event-list">
                    ${items.map((ev) => eventListItem(ev, { dataAttrs: true })).join('\n                    ')}
                </ul>
                </div>
            </section>`;
  }).join('\n            ');

  const cats = [...new Set(list.map((ev) => ev.categoria))]
    .map((id) => ({ id, name: (CATEGORY_BY_ID[id] || { name: id }).name, n: list.filter((ev) => ev.categoria === id).length }))
    .sort((a, b) => b.n - a.n);
  const weekend = weekendRange(TODAY);
  const weekendCount = list.filter((ev) => overlaps(ev, weekend.friday, weekend.sunday)).length;
  const monthEnd = `${TODAY.slice(0, 7)}-31`;
  const monthCount = list.filter((ev) => overlaps(ev, TODAY, monthEnd)).length;
  const topCats = cats.slice(0, 3).map((c) => c.name.toLowerCase());

  const intro = list.length
    ? `Ahora mismo hay ${list.length} planes anunciados en Alhaurín el Grande, ${monthCount} de ellos durante lo que queda de ${MESES[Number(TODAY.slice(5, 7)) - 1]} y ${weekendCount} para el fin de semana. Predominan ${topCats.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`
    : 'Ahora mismo no hay planes anunciados en la agenda. Vuelve pronto: la agenda se actualiza varias veces al día.';

  const body = `
        <section class="alh-page-header">
            <div class="container alh-narrow">
                ${renderBreadcrumbs(crumbs)}
                <span class="alh-kicker">Agenda</span>
                <h1>Agenda de Alhaurín el Grande: qué hacer hoy y próximos planes</h1>
                <p class="alh-lead">${escapeHtml(intro)}</p>
                <p>Recogemos conciertos, fiestas, procesiones, partidos, talleres y actividades culturales del municipio a partir de los anuncios de organizadores, entidades y medios locales. Cada ficha indica de dónde sale la información para que puedas confirmarla antes de ir.</p>
                <p><a class="alh-btn" href="/este-fin-de-semana/">Planes de este fin de semana</a> <a class="alh-btn alh-btn-sec" href="/planes/">Ver en calendario</a></p>
            </div>
        </section>
        <div class="container alh-narrow">
            ${list.length ? `<div class="alh-filters" role="toolbar" aria-label="Filtrar por fecha" data-agenda-filtros hidden>
                <button type="button" class="alh-filter" data-filtro="todo" aria-pressed="true">Todo</button>
                <button type="button" class="alh-filter" data-filtro="hoy" aria-pressed="false">Hoy</button>
                <button type="button" class="alh-filter" data-filtro="finde" aria-pressed="false">Este fin de semana</button>
                <button type="button" class="alh-filter" data-filtro="mes" aria-pressed="false">Este mes</button>
            </div>
            <div class="alh-filters" role="toolbar" aria-label="Filtrar por categoría" data-agenda-categorias hidden>
                <button type="button" class="alh-filter" data-categoria="" aria-pressed="true">Todas las categorías</button>
                ${cats.map((c) => `<button type="button" class="alh-filter" data-categoria="${escapeHtml(c.id)}" aria-pressed="false">${escapeHtml(c.name)} (${c.n})</button>`).join('\n                ')}
            </div>
            ` : ''}
            <p class="alh-empty" data-agenda-vacio hidden>No hay planes que coincidan con el filtro. <a href="/agenda/">Ver todos</a>.</p>
            ${monthsHtml || '<p class="alh-empty">No hay planes verificados anunciados ahora mismo.</p>'}
            ${shortAgendaBlock(events)}
            ${adSlot('agenda', 'banda')}
            ${recent.length ? `<section class="alh-section">
                <h2 class="alh-h2">Celebrados recientemente</h2>
                <div class="alh-list-box">
                ${eventList(recent)}
                </div>
            </section>` : ''}
            <div class="alh-note"><strong>¿Organizas un evento en Alhaurín?</strong><p>Envíanos la fecha, la hora, el lugar, el precio y una descripción desde la página de <a href="/contacto/">contacto</a> y lo añadiremos a la agenda.</p></div>
        </div>`;

  return renderPage({
    title: 'Agenda de Alhaurín el Grande: qué hacer hoy y este fin de semana — Alhaurín al Día',
    description: `Agenda de Alhaurín el Grande con ${list.length} planes: conciertos, fiestas, procesiones, deportes y cultura. Filtra por hoy, fin de semana, mes o categoría.`,
    canonical,
    jsonld: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Agenda de Alhaurín el Grande',
        url: canonical,
        inLanguage: 'es-ES',
        isPartOf: { '@type': 'WebSite', name: 'Alhaurín al Día', url: SITE_URL },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: list.length,
          itemListElement: list.slice(0, 50).map((ev, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}${eventUrl(ev)}`, name: ev.titulo })),
        },
      },
      breadcrumbSchema(crumbs),
    ],
    body,
    scripts: ['/js/agenda-filtros.js'],
  });
}

// ---------- /este-fin-de-semana/ ----------

function renderWeekend(events) {
  const canonical = `${SITE_URL}/este-fin-de-semana/`;
  const crumbs = [{ name: 'Inicio', url: '/' }, { name: 'Agenda', url: '/agenda/' }, { name: 'Este fin de semana', url: '/este-fin-de-semana/' }];
  const { friday, saturday, sunday } = weekendRange(TODAY);
  const active = events.filter((ev) => isListed(ev) && ev.estado_evento !== 'cancelado');
  const days = [friday, saturday, sunday].map((day) => ({
    day,
    items: active.filter((ev) => overlaps(ev, day, day)).sort(sortByDate),
  }));
  const unique = [...new Map(days.flatMap((d) => d.items).map((ev) => [ev.id, ev])).values()].sort(sortByDate);
  const rangeText = `del viernes ${formatDateLong(friday, { weekday: false, year: false })} al domingo ${formatDateLong(sunday, { weekday: false })}`;

  let intro;
  if (unique.length) {
    const sample = unique.slice(0, 3).map((ev) => ev.titulo);
    const cats = [...new Set(unique.map((ev) => categoryName(ev).toLowerCase()))].slice(0, 3);
    intro = `Este fin de semana en Alhaurín hay ${unique.length} ${unique.length === 1 ? 'plan' : 'planes'} ${rangeText}: ${sample.join(', ')}${unique.length > 3 ? ' y más' : ''}. Hay propuestas de ${cats.join(', ').replace(/, ([^,]*)$/, ' y $1')}.`;
  } else {
    intro = `Por ahora no hay planes anunciados en Alhaurín el Grande para este fin de semana (${rangeText}). Te dejamos los próximos eventos de la agenda para que puedas organizarte.`;
  }

  const daysHtml = days.map(({ day, items }) => `<section class="alh-section">
                <h2 class="alh-h2">${capitalize(DIAS[weekdayIndex(day)])} ${formatDateLong(day, { weekday: false, year: false })}</h2>
                <div class="alh-list-box">
                ${items.length ? eventList(items) : '<p class="alh-empty">Sin planes anunciados para este día.</p>'}
                </div>
            </section>`).join('\n            ');

  const fallback = unique.length ? '' : `<section class="alh-section">
                <h2 class="alh-h2">Próximos planes</h2>
                <div class="alh-list-box">
                ${eventList(upcoming(events, TODAY, 6))}
                </div>
            </section>`;

  const body = `
        <section class="alh-page-header">
            <div class="container alh-narrow">
                ${renderBreadcrumbs(crumbs)}
                <span class="alh-kicker">Fin de semana</span>
                <h1>Qué hacer este fin de semana en Alhaurín el Grande</h1>
                <p class="alh-lead">${escapeHtml(intro)}</p>
                <p>Esta página se actualiza sola con los planes de viernes a domingo que figuran en la <a href="/agenda/">agenda de Alhaurín al Día</a>. Si un evento dura varios días, aparece en cada uno de ellos. Comprueba siempre la información en la fuente original de cada plan antes de desplazarte.</p>
            </div>
        </section>
        <div class="container alh-narrow">
            ${daysHtml}
            ${adSlot('fin-de-semana', 'banda')}
            ${fallback}
            ${shortAgendaBlock(events)}
            <p class="alh-more"><a href="/agenda/">Ver la agenda completa →</a></p>
        </div>`;

  return renderPage({
    title: 'Qué hacer este fin de semana en Alhaurín el Grande — Alhaurín al Día',
    description: unique.length
      ? `${unique.length} planes para este fin de semana en Alhaurín el Grande (${rangeText}): conciertos, fiestas, deportes y cultura.`
      : `Planes para este fin de semana en Alhaurín el Grande (${rangeText}) y próximos eventos de la agenda.`,
    canonical,
    jsonld: [
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Planes de este fin de semana en Alhaurín el Grande',
        numberOfItems: unique.length,
        itemListElement: unique.map((ev, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}${eventUrl(ev)}`, name: ev.titulo })),
      },
      breadcrumbSchema(crumbs),
    ],
    body,
  });
}

function main() {
  const events = loadAgenda();
  let written = 0;
  const stats = { indexables: 0, noindex: 0 };
  for (const ev of events) {
    if (!ev.slug || !ev.fecha_inicio) continue;
    if (indexability(ev, TODAY).indexable) stats.indexables++; else stats.noindex++;
    if (writeIfChanged(fs, path.join(ROOT, 'planes', ev.slug, 'index.html'), renderEvent(ev, events))) written++;
  }
  if (writeIfChanged(fs, path.join(ROOT, 'agenda', 'index.html'), renderAgendaIndex(events))) written++;
  if (writeIfChanged(fs, path.join(ROOT, 'este-fin-de-semana', 'index.html'), renderWeekend(events))) written++;
  console.log(`Agenda: ${events.length} fichas (${stats.indexables} indexables, ${stats.noindex} noindex). Páginas escritas: ${written}. Hoy: ${TODAY}.`);
}

if (require.main === module) main();

module.exports = { weekendRange, eventJsonLd, madridOffset };
