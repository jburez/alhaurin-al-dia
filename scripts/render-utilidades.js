// Páginas de utilidad diaria:
//
//   /farmacia-de-guardia/   farmacia de hoy, calendario de los próximos días y mapa
//   /avisos/                avisos activos e histórico reciente
//
// Uso: node scripts/render-utilidades.js   (BUILD_DATE=AAAA-MM-DD para fijar «hoy»)

const fs = require('fs');
const path = require('path');
const {
  SITE_URL, escapeHtml, renderPage, renderBreadcrumbs, breadcrumbSchema, adSlot, todayIso, addDays,
  formatDateLong, capitalize, writeIfChanged,
} = require('./lib/layout');
const { loadPharmacies, pharmacyOn, guardSchedule, mapsUrl, pharmacyCalendar, loadAvisos } = require('./lib/hoy');
const { renderFeaturedSlot } = require('./lib/comercios');
const { loadGuias, isPublicada, guideUrl } = require('./lib/guias');

const ROOT = path.resolve(__dirname, '..');
const TODAY = todayIso();
const OFFICIAL_PHARMACY_SOURCE = 'https://alhaurinelgrande.es/farmacias/';

function telLink(f) {
  return f.telefonoHref ? `<a href="tel:${escapeHtml(f.telefonoHref)}">${escapeHtml(f.telefono)}</a>` : escapeHtml(f.telefono || '');
}

function pharmacyJsonLd(f) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Pharmacy',
    name: f.nombre,
    url: `${SITE_URL}${f.url}`,
    ...(f.telefonoHref ? { telephone: f.telefonoHref } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: f.direccion,
      addressLocality: 'Alhaurín el Grande',
      postalCode: '29120',
      addressRegion: 'Málaga',
      addressCountry: 'ES',
    },
    hasMap: mapsUrl(f),
    additionalProperty: { '@type': 'PropertyValue', name: 'Farmacia de guardia', value: formatDateLong(TODAY) },
  };
}

function renderFarmacia() {
  const data = loadPharmacies();
  const hoy = pharmacyOn(TODAY, data);
  const ayer = pharmacyOn(addDays(TODAY, -1), data);
  const schedule = guardSchedule(data.meta);
  const horario = schedule ? `de ${schedule.desde} de hoy a ${schedule.hasta} de mañana` : '';
  const canonical = `${SITE_URL}/farmacia-de-guardia/`;
  const crumbs = [{ name: 'Inicio', url: '/' }, { name: 'Farmacia de guardia', url: '/farmacia-de-guardia/' }];
  const calendar = pharmacyCalendar(TODAY, 14, data);
  const saludGuide = loadGuias().find((g) => isPublicada(g) && g.categoria === 'salud');

  const hero = hoy
    ? `<div class="alh-pharmacy-hero">
                    <span class="alh-kicker">De guardia hoy · ${escapeHtml(capitalize(formatDateLong(TODAY)))}</span>
                    <h2>${escapeHtml(hoy.nombre)}</h2>
                    <p><strong>Dirección:</strong> ${escapeHtml(hoy.direccion)}, Alhaurín el Grande</p>
                    ${hoy.telefono ? `<p><strong>Teléfono:</strong> ${telLink(hoy)}</p>` : ''}
                    ${horario ? `<p><strong>Horario de guardia:</strong> ${escapeHtml(horario)}.</p>` : ''}
                    ${schedule && ayer && ayer.id !== hoy.id ? `<p class="alh-event-meta">Hasta las ${escapeHtml(schedule.hasta)} de hoy sigue de guardia ${escapeHtml(ayer.nombre)} (${escapeHtml(ayer.direccion)}).</p>` : ''}
                    <div class="alh-actions">
                        <a class="alh-btn" href="${escapeHtml(mapsUrl(hoy))}" target="_blank" rel="noopener">Cómo llegar (mapa)</a>
                        ${hoy.telefonoHref ? `<a class="alh-btn alh-btn-sec" href="tel:${escapeHtml(hoy.telefonoHref)}">Llamar</a>` : ''}
                        <a class="alh-btn alh-btn-sec" href="${escapeHtml(hoy.url)}">Ficha de la farmacia</a>
                    </div>
                </div>`
    : `<div class="alh-pharmacy-hero">
                    <span class="alh-kicker">${escapeHtml(capitalize(formatDateLong(TODAY)))}</span>
                    <h2>Guardia pendiente de confirmar</h2>
                    <p>No consta una farmacia de guardia para hoy en el calendario publicado. Consulta la <a href="${OFFICIAL_PHARMACY_SOURCE}" target="_blank" rel="noopener">fuente oficial del Ayuntamiento</a> antes de desplazarte.</p>
                </div>`;

  const rows = calendar.map(({ date, farmacia }) => `<tr${date === TODAY ? ' class="is-today"' : ''}>
                            <td>${escapeHtml(capitalize(formatDateLong(date, { year: false })))}${date === TODAY ? ' (hoy)' : ''}</td>
                            <td>${farmacia ? `<a href="${escapeHtml(farmacia.url)}">${escapeHtml(farmacia.nombre)}</a><br><small>${escapeHtml(farmacia.direccion)}</small>` : 'Sin dato publicado'}</td>
                        </tr>`).join('\n                        ');

  const all = data.farmacias.map((f) => `<li class="alh-news-item">
                        <a class="alh-news-title" href="${escapeHtml(f.url)}">${escapeHtml(f.nombre)}</a>
                        <p class="alh-news-line">${escapeHtml(f.direccion)} · ${telLink(f)} · <a href="${escapeHtml(mapsUrl(f))}" target="_blank" rel="noopener">mapa</a></p>
                    </li>`).join('\n                    ');

  const body = `
        <section class="alh-page-header">
            <div class="container alh-narrow">
                ${renderBreadcrumbs(crumbs)}
                <span class="alh-kicker">Salud · Hoy</span>
                <h1>Farmacia de guardia hoy en Alhaurín el Grande</h1>
                <p class="alh-lead">${hoy
    ? `Hoy, ${escapeHtml(formatDateLong(TODAY, { year: false }))}, la farmacia de guardia en Alhaurín el Grande es <strong>${escapeHtml(hoy.nombre)}</strong>, en ${escapeHtml(hoy.direccion)}.`
    : 'Consulta aquí qué farmacia está de guardia hoy en Alhaurín el Grande y el calendario de los próximos días.'}</p>
            </div>
        </section>
        <div class="container alh-narrow">
            ${hero}
            <div class="alh-note alh-note-warn" style="margin-top:14px">
                <strong>Compruebe siempre antes de desplazarse</strong>
                <p>El calendario de guardias puede cambiar por sustituciones de última hora. Antes de ir, llama a la farmacia o consulta la <a href="${OFFICIAL_PHARMACY_SOURCE}" target="_blank" rel="noopener">información oficial del Ayuntamiento de Alhaurín el Grande</a>. En caso de urgencia sanitaria, llama al 112.</p>
            </div>
            ${adSlot('farmacia')}
            <section class="alh-section">
                <h2 class="alh-h2">Calendario de guardias: próximos 14 días</h2>
                <table class="alh-calendar">
                    <thead><tr><th scope="col">Día</th><th scope="col">Farmacia de guardia</th></tr></thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
                <p class="alh-more"><a href="/guia-util/farmacias/calendario/">Ver el calendario completo de guardias →</a></p>
            </section>
            <section class="alh-section">
                ${renderFeaturedSlot(TODAY, { ubicacion: 'farmacia' })}
            </section>
            <section class="alh-section">
                <h2 class="alh-h2">Farmacias de Alhaurín el Grande</h2>
                <div class="alh-list-box">
                <ul class="alh-plain-list">
                    ${all}
                </ul>
                </div>
            </section>
            <section class="alh-section alh-prose">
                <h2>Cómo funcionan las guardias en Alhaurín el Grande</h2>
                <p>Las farmacias del municipio se turnan para cubrir el servicio fuera del horario habitual. ${schedule ? `Cada turno de guardia va ${escapeHtml(`de ${schedule.desde} a ${schedule.hasta}`)} del día siguiente, así que de madrugada sigue de guardia la farmacia del día anterior.` : ''} El calendario de esta página se elabora con el que publica el Ayuntamiento y se actualiza automáticamente cada día.</p>
                <p>Si necesitas un medicamento con urgencia, comprueba primero la guardia y lleva tu tarjeta sanitaria y la receta. Para otros servicios de salud del municipio, consulta ${saludGuide ? `la guía <a href="${guideUrl(saludGuide)}">${escapeHtml(saludGuide.titulo)}</a> y ` : ''}la sección de <a href="/guia-util/farmacias/">farmacias</a> y la de <a href="/guia-util/telefonos/">teléfonos útiles</a> de la guía.</p>
            </section>
        </div>`;

  return renderPage({
    title: 'Farmacia de guardia hoy en Alhaurín el Grande — Alhaurín al Día',
    description: hoy
      ? `Hoy ${formatDateLong(TODAY, { weekday: false, year: false })} la farmacia de guardia en Alhaurín el Grande es ${hoy.nombre} (${hoy.direccion}). Calendario de los próximos días y mapa.`
      : 'Farmacia de guardia hoy en Alhaurín el Grande, calendario de los próximos días, direcciones y mapa.',
    canonical,
    jsonld: [...(hoy ? [pharmacyJsonLd(hoy)] : []), breadcrumbSchema(crumbs)],
    body,
  });
}

function avisoItem(a) {
  const when = a.inicio ? capitalize(formatDateLong(a.inicio.slice(0, 10), { year: false })) : '';
  const source = a.url
    ? `<a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">${escapeHtml(a.fuente || 'Fuente')}</a>`
    : escapeHtml(a.fuente || '');
  return `<li class="alh-news-item">
                        <span class="alh-news-title">${escapeHtml(a.icono)} ${escapeHtml(a.titulo)}</span>
                        ${a.detalle ? `<p class="alh-news-line">${escapeHtml(a.detalle)}</p>` : ''}
                        <p class="alh-news-meta">${escapeHtml(a.tipo)}${when ? ` · ${escapeHtml(when)}` : ''}${source ? ` · Fuente: ${source}` : ''}</p>
                    </li>`;
}

function renderAvisos() {
  const nowIso = `${TODAY}T12:00:00+01:00`;
  const { activos, historial } = loadAvisos(process.env.BUILD_DATE ? nowIso : new Date().toISOString());
  const canonical = `${SITE_URL}/avisos/`;
  const crumbs = [{ name: 'Inicio', url: '/' }, { name: 'Avisos', url: '/avisos/' }];
  const body = `
        <section class="alh-page-header">
            <div class="container alh-narrow">
                ${renderBreadcrumbs(crumbs)}
                <span class="alh-kicker">Hoy</span>
                <h1>Avisos en Alhaurín el Grande: cortes, tráfico y alertas</h1>
                <p class="alh-lead">${activos.length
    ? `Hay ${activos.length} ${activos.length === 1 ? 'aviso activo' : 'avisos activos'} en Alhaurín el Grande.`
    : 'Sin avisos activos en Alhaurín el Grande en este momento.'} Aquí recogemos los cortes de agua y luz, las incidencias de tráfico y las alertas meteorológicas que afectan al municipio, con enlace a la fuente oficial de cada aviso.</p>
            </div>
        </section>
        <div class="container alh-narrow">
            <section class="alh-section">
                <h2 class="alh-h2">Avisos activos</h2>
                <div class="alh-list-box" id="local-notices-list">
                ${activos.length ? `<ul class="alh-plain-list">${activos.map(avisoItem).join('\n')}</ul>` : '<p class="alh-empty">✅ Sin avisos activos. No constan cortes, incidencias de tráfico ni alertas en vigor.</p>'}
                </div>
            </section>
            ${adSlot('avisos', 'banda')}
            <section class="alh-section">
                <h2 class="alh-h2">Histórico reciente</h2>
                <div class="alh-list-box" id="notices-history-list">
                ${historial.length ? `<ul class="alh-plain-list">${historial.slice(0, 20).map(avisoItem).join('\n')}</ul>` : '<p class="alh-empty">No hay avisos en los últimos 60 días.</p>'}
                </div>
            </section>
            <section class="alh-section alh-prose">
                <h2>De dónde salen estos avisos</h2>
                <p>Los avisos municipales (cortes de suministro, obras o cambios de tráfico) proceden de los comunicados del Ayuntamiento de Alhaurín el Grande y se revisan antes de publicarlos. Las alertas meteorológicas son las que emite la Agencia Estatal de Meteorología (AEMET) para la zona «Sol y Guadalhorce». Para el estado del tráfico en carreteras, consulta también la información de la Dirección General de Tráfico.</p>
                <p>Un aviso desaparece de la lista de activos cuando termina o se resuelve, y queda en el histórico durante unos días. Si detectas una incidencia que no aparece aquí, puedes comunicarla desde la página de <a href="/contacto/">contacto</a> o consultar los <a href="/radar-social/">reportes vecinales del Radar Social</a>.</p>
                <p>Consulta también <a href="/tiempo/">el tiempo en Alhaurín el Grande</a> y la <a href="/farmacia-de-guardia/">farmacia de guardia de hoy</a>.</p>
            </section>
        </div>`;
  return renderPage({
    title: 'Avisos en Alhaurín el Grande: cortes, tráfico y alertas — Alhaurín al Día',
    description: 'Avisos activos en Alhaurín el Grande: cortes de agua y luz, incidencias de tráfico y alertas de AEMET, con histórico reciente y fuentes oficiales.',
    canonical,
    jsonld: [breadcrumbSchema(crumbs)],
    body,
  });
}

function main() {
  let written = 0;
  if (writeIfChanged(fs, path.join(ROOT, 'farmacia-de-guardia', 'index.html'), renderFarmacia())) written++;
  if (writeIfChanged(fs, path.join(ROOT, 'avisos', 'index.html'), renderAvisos())) written++;
  console.log(`Utilidades: farmacia de guardia y avisos (${written} páginas escritas). Hoy: ${TODAY}.`);
}

main();
