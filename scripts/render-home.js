// Genera la portada (index.html) como guía práctica de Alhaurín el Grande:
//
//   1. Cabecera y navegación (Hoy · Agenda · Guías · Comercios · Actualidad)
//   2. Hoy en Alhaurín: farmacia de guardia, tiempo hoy/mañana, avisos, próximo evento
//   3. Agenda: próximos planes + enlaces a fin de semana y agenda completa
//   ·  Hueco de anuncio con altura reservada
//   4. Guías: guías publicadas por categoría (o la guía útil mientras no haya)
//   5. Comercios: categorías + hueco de comercio destacado
//   6. Actualidad: 5 últimos titulares en lista compacta
//   7. Pie con enlaces legales y «Configurar cookies»
//
// Todo el contenido está en el HTML generado (sin depender de JavaScript).
// Uso: node scripts/render-home.js   (BUILD_DATE=AAAA-MM-DD para fijar «hoy»)

const fs = require('fs');
const path = require('path');
const {
  SITE_URL, SITE_NAME, CONTACT_EMAIL, escapeHtml, renderPage, adSlot, todayIso, formatDateLong, capitalize, writeIfChanged,
} = require('./lib/layout');
const { pharmacyOn, guardSchedule, loadPharmacies, weatherFor, loadAvisos } = require('./lib/hoy');
const { loadAgenda, upcoming, eventUrl, CATEGORY_BY_ID } = require('./lib/agenda');
const { CATEGORIAS_GUIA, loadGuias, isPublicada, guideUrl } = require('./lib/guias');
const { loadComercios, categoriaUrl, renderFeaturedSlot } = require('./lib/comercios');
const { renderActualidadList } = require('./lib/actualidad');

const ROOT = path.resolve(__dirname, '..');
const HOME_FILE = path.join(ROOT, 'index.html');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function hoyCard({ cls, label, title, detail, cta, href }) {
  return `<a class="alh-hoy-card ${cls}" href="${escapeHtml(href)}">
                    <span class="alh-hoy-label">${label}</span>
                    <span class="alh-hoy-title">${title}</span>
                    ${detail ? `<span class="alh-hoy-detail">${detail}</span>` : ''}
                    <span class="alh-hoy-cta">${cta} →</span>
                </a>`;
}

function weatherLine(d) {
  if (!d) return '';
  return `${escapeHtml(d.icono || '')} ${escapeHtml(d.t_max)}° / ${escapeHtml(d.t_min)}° · ${escapeHtml(d.descripcion || '')}`;
}

function renderHoy(today, events) {
  const pharmacies = loadPharmacies();
  const farmacia = pharmacyOn(today, pharmacies);
  const schedule = guardSchedule(pharmacies.meta);
  const tiempo = weatherFor(today);
  const avisos = loadAvisos(process.env.BUILD_DATE ? `${today}T12:00:00+01:00` : new Date().toISOString());
  const next = upcoming(events, today, 1)[0];

  const cards = [
    hoyCard({
      cls: 'is-farmacia',
      label: '💊 Farmacia de guardia',
      title: farmacia ? escapeHtml(farmacia.nombre) : 'Pendiente de confirmar',
      detail: farmacia
        ? `${escapeHtml(farmacia.direccion)}${schedule ? ` · de ${escapeHtml(schedule.desde)} a ${escapeHtml(schedule.hasta)}` : ''}`
        : 'Consulta la fuente oficial antes de desplazarte.',
      cta: 'Ver guardia y calendario',
      href: '/farmacia-de-guardia/',
    }),
    hoyCard({
      cls: 'is-tiempo',
      label: '🌤️ El tiempo',
      title: tiempo.hoy ? `Hoy ${escapeHtml(tiempo.hoy.t_max)}° / ${escapeHtml(tiempo.hoy.t_min)}°` : 'Previsión no disponible',
      detail: [tiempo.hoy ? weatherLine(tiempo.hoy) : '', tiempo.manana ? `Mañana: ${weatherLine(tiempo.manana)}` : ''].filter(Boolean).join('<br>'),
      cta: 'Previsión a 7 días',
      href: '/tiempo/',
    }),
    hoyCard({
      cls: 'is-avisos',
      label: '⚠️ Avisos',
      title: avisos.activos.length ? `${avisos.activos.length} ${avisos.activos.length === 1 ? 'aviso activo' : 'avisos activos'}` : 'Sin avisos activos',
      detail: avisos.activos.length ? escapeHtml(avisos.activos[0].titulo) : 'No constan cortes, incidencias de tráfico ni alertas en vigor.',
      cta: 'Ver avisos',
      href: '/avisos/',
    }),
    hoyCard({
      cls: 'is-evento',
      label: '📅 Próximo plan',
      title: next ? escapeHtml(next.titulo) : 'Sin planes anunciados',
      detail: next ? `${escapeHtml(capitalize(formatDateLong(next.fecha_inicio, { year: false })))}${next.hora ? ` · ${escapeHtml(next.hora)} h` : ''}` : 'Consulta la agenda para ver próximos eventos.',
      cta: next ? 'Ver el plan' : 'Ver la agenda',
      href: next ? eventUrl(next) : '/agenda/',
    }),
  ];

  return `<section class="alh-section" id="hoy" aria-labelledby="hoy-titulo">
            <div class="container">
                <div class="alh-section-head"><h2 class="alh-h2" id="hoy-titulo">Hoy en Alhaurín</h2><span class="alh-event-meta">${escapeHtml(capitalize(formatDateLong(today)))}</span></div>
                <div class="alh-hoy">
                ${cards.join('\n                ')}
                </div>
            </div>
        </section>`;
}

function renderAgenda(today, events) {
  const list = upcoming(events, today, 6);
  const items = list.map((ev) => {
    const [, m, d] = ev.fecha_inicio.split('-').map(Number);
    const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][m - 1];
    const cat = (CATEGORY_BY_ID[ev.categoria] || { name: '' }).name;
    const meta = [ev.hora ? `${ev.hora} h` : '', ev.lugar ? ev.lugar.replace(/\.\.\.$/, '…') : ''].filter(Boolean).map(escapeHtml).join(' · ');
    return `<li class="alh-event-item">
                        <span class="alh-date-badge" aria-hidden="true"><span class="d">${d}</span><span class="m">${mes}</span></span>
                        <div class="alh-event-body">
                            <a href="${eventUrl(ev)}">${escapeHtml(ev.titulo)}</a>
                            <p class="alh-event-meta"><span class="alh-tag">${escapeHtml(cat)}</span>${escapeHtml(capitalize(formatDateLong(ev.fecha_inicio, { year: false })))}${meta ? ` · ${meta}` : ''}</p>
                        </div>
                    </li>`;
  }).join('\n                    ');
  return `<section class="alh-section" aria-labelledby="agenda-titulo">
            <div class="container">
                <div class="alh-section-head"><h2 class="alh-h2" id="agenda-titulo">Agenda: próximos planes</h2><a href="/agenda/">Agenda completa →</a></div>
                <div class="alh-list-box">
                ${list.length ? `<ul class="alh-event-list">\n                    ${items}\n                </ul>` : '<p class="alh-empty">No hay planes anunciados ahora mismo.</p>'}
                </div>
                <div class="alh-actions">
                    <a class="alh-btn" href="/este-fin-de-semana/">Planes de este fin de semana</a>
                    <a class="alh-btn alh-btn-sec" href="/agenda/">Ver toda la agenda</a>
                </div>
            </div>
        </section>`;
}

function renderGuias() {
  const published = loadGuias().filter(isPublicada);
  let grid;
  if (published.length) {
    grid = Object.entries(CATEGORIAS_GUIA)
      .map(([id, cat]) => ({ id, cat, items: published.filter((g) => g.categoria === id) }))
      .filter((g) => g.items.length)
      .map((g) => `<div class="alh-card">
                        <h3>${escapeHtml(g.cat.icono)} ${escapeHtml(g.cat.nombre)}</h3>
                        <ul class="alh-plain-list">
                            ${g.items.map((gu) => `<li><a href="${guideUrl(gu)}">${escapeHtml(gu.titulo)}</a></li>`).join('\n                            ')}
                        </ul>
                    </div>`).join('\n                    ');
  } else {
    // Mientras no haya guías publicadas, accesos a la guía útil (páginas ya indexadas).
    const util = readJson(path.join(ROOT, 'data', 'guia-util.json'), []).slice(0, 8);
    grid = util.map((item) => `<a class="alh-card alh-guide-card" href="${escapeHtml(item.pagina || item.enlace)}">
                        <h3>${escapeHtml(item.icono || '')} ${escapeHtml(item.titulo)}</h3>
                        <p>${escapeHtml(item.descripcion)}</p>
                    </a>`).join('\n                    ');
  }
  return `<section class="alh-section" aria-labelledby="guias-titulo">
            <div class="container">
                <div class="alh-section-head"><h2 class="alh-h2" id="guias-titulo">Guías prácticas</h2><a href="/guias/">Todas las guías →</a></div>
                <p>Trámites, salud, colegios, transporte y servicios de Alhaurín el Grande explicados paso a paso, con enlace a las fuentes oficiales.</p>
                <div class="alh-grid alh-grid-4">
                    ${grid}
                </div>
            </div>
        </section>`;
}

function renderComercios(today) {
  const { categorias, comercios } = loadComercios();
  const cards = categorias.map((cat) => {
    const n = comercios.filter((c) => c.categoria === cat.slug).length;
    return `<a class="alh-card alh-guide-card" href="${categoriaUrl(cat)}">
                        <h3>${escapeHtml(cat.icono || '')} ${escapeHtml(cat.nombre)}</h3>
                        <p>${escapeHtml(cat.resumen || '')}${n ? ` (${n})` : ''}</p>
                    </a>`;
  }).join('\n                    ');
  return `<section class="alh-section" aria-labelledby="comercios-titulo">
            <div class="container">
                <div class="alh-section-head"><h2 class="alh-h2" id="comercios-titulo">Comercios de Alhaurín</h2><a href="/comercios/">Directorio →</a></div>
                <div class="alh-grid alh-grid-4">
                    ${renderFeaturedSlot(today, { ubicacion: 'portada' })}
                    ${cards}
                </div>
            </div>
        </section>`;
}

function renderActualidad() {
  const noticias = readJson(path.join(ROOT, 'data', 'noticias.json'), []);
  return `<section class="alh-section" aria-labelledby="actualidad-titulo">
            <div class="container alh-narrow">
                <div class="alh-section-head"><h2 class="alh-h2" id="actualidad-titulo">Actualidad</h2><a href="/noticias/">Más titulares →</a></div>
                <div class="alh-list-box">
                ${renderActualidadList(noticias, { limit: 5 })}
                </div>
                <p class="alh-event-meta">Titulares publicados por el Ayuntamiento, medios y entidades locales, con enlace a su fuente original.</p>
            </div>
        </section>`;
}

function buildHome() {
  const today = todayIso();
  const events = loadAgenda();
  const body = `
        <section class="alh-page-header">
            <div class="container">
                <span class="alh-kicker">Guía práctica de Alhaurín el Grande</span>
                <h1>Alhaurín al Día: lo útil de Alhaurín el Grande, hoy</h1>
                <p class="alh-lead">Farmacia de guardia, tiempo, avisos, agenda de planes, guías de trámites y servicios y comercios del pueblo, todo en un mismo sitio y pensado para consultarlo desde el móvil.</p>
            </div>
        </section>
        ${renderHoy(today, events)}
        ${renderAgenda(today, events)}
        <div class="container">${adSlot('portada', 'banda')}</div>
        ${renderGuias()}
        ${renderComercios(today)}
        ${renderActualidad()}
        <section class="alh-section">
            <div class="container alh-narrow">
                <div class="alh-note"><strong>Recibe la farmacia de guardia y los avisos en el móvil</strong><p>Síguenos en el <a href="https://whatsapp.com/channel/0029Vb8Yopz8F2pDADQLxx0S" target="_blank" rel="noopener noreferrer">canal de WhatsApp de Alhaurín al Día</a>. Si ves un dato incorrecto, <a href="/contacto/">avísanos</a>.</p></div>
            </div>
        </section>`;

  return renderPage({
    title: 'Guía práctica de Alhaurín el Grande: farmacia de guardia, agenda, servicios y comercios — Alhaurín al Día',
    description: 'Guía práctica de Alhaurín el Grande: farmacia de guardia de hoy, tiempo, avisos, agenda de planes, guías de trámites y servicios y comercios locales.',
    canonical: `${SITE_URL}/`,
    robots: 'index, follow, max-image-preview:large',
    jsonld: [{
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebSite',
          '@id': `${SITE_URL}/#website`,
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          inLanguage: 'es-ES',
          description: 'Guía práctica de Alhaurín el Grande: farmacia de guardia, agenda, servicios y comercios.',
          publisher: { '@id': `${SITE_URL}/#organization` },
        },
        {
          '@type': 'Organization',
          '@id': `${SITE_URL}/#organization`,
          name: SITE_NAME,
          url: `${SITE_URL}/`,
          logo: { '@type': 'ImageObject', url: `${SITE_URL}/assets/favicon.svg` },
          email: CONTACT_EMAIL,
          areaServed: { '@type': 'City', name: 'Alhaurín el Grande' },
          sameAs: ['https://whatsapp.com/channel/0029Vb8Yopz8F2pDADQLxx0S'],
        },
      ],
    }],
    body,
    bodyClass: 'home-guia',
  });
}

function main() {
  const changed = writeIfChanged(fs, HOME_FILE, buildHome());
  console.log(`Portada (guía práctica) ${changed ? 'regenerada' : 'sin cambios'}. Hoy: ${todayIso()}.`);
}

if (require.main === module) main();

module.exports = { buildHome, main };
