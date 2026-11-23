// Fichas de farmacia y calendario de guardias, generados solo con datos de
// data/farmacias.json y data/guardias-farmacias-2026.json:
//
//   /guia-util/farmacias/<id>/        ficha: dirección, teléfono, mapa, próximas
//                                     guardias y preguntas frecuentes con datos reales
//   /guia-util/farmacias/calendario/  calendario mensual completo en HTML
//
// La guía /guia-util/farmacias/ la genera render-guias.js (generador "farmacias").
// Sustituye a render-farmacia-guardia-static.js, que parcheaba páginas hechas a mano.
//
// Indexación: una ficha o el calendario solo son indexables si tienen más de 300
// palabras propias y ningún [PENDIENTE]; si no, noindex.
//
// Uso: node scripts/render-farmacias.js   (BUILD_DATE=AAAA-MM-DD para fijar «hoy»)

const fs = require('fs');
const path = require('path');
const {
  SITE_URL, escapeHtml, renderPage, renderBreadcrumbs, breadcrumbSchema, adSlot, todayIso, addDays,
  formatDateLong, capitalize, writeIfChanged, weekdayIndex, MESES,
} = require('./lib/layout');
const { loadPharmacies, pharmacyOn, guardSchedule, mapsUrl } = require('./lib/hoy');
const { nextGuards, groupDates, joinEs, guardsThisMonth, fullAddress, telLink, OFFICIAL_PHARMACY_SOURCE } = require('./lib/guias-datos');
const { ownWords } = require('./render-guias');

const ROOT = path.resolve(__dirname, '..');
const TODAY = todayIso();
const COLEGIO = 'https://farmaciasguardia.farmaceuticos.com/web_guardias/publico/Provincia_pNew.asp?id=29';
const MIN_WORDS = 300;

function robotsFor(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html;
  return ownWords(html) > MIN_WORDS && !/\[PENDIENTE/.test(main) ? 'index, follow' : 'noindex, follow';
}

function withRobots(html) {
  return html.replace(/<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${robotsFor(html)}">`);
}

function pharmacyJsonLd(f, canonical) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Pharmacy',
    name: f.nombre,
    url: canonical,
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
  };
}

function renderFicha(f, data) {
  const canonical = `${SITE_URL}${f.url}`;
  const crumbs = [
    { name: 'Inicio', url: '/' },
    { name: 'Guía útil', url: '/guia-util/' },
    { name: 'Farmacias', url: '/guia-util/farmacias/' },
    { name: f.nombre, url: f.url },
  ];
  const schedule = guardSchedule(data.meta);
  const horario = schedule ? `de ${schedule.desde} a ${schedule.hasta} del día siguiente` : '';
  const hoy = pharmacyOn(TODAY, data);
  const deGuardiaHoy = hoy && hoy.id === f.id;
  const proximas = nextGuards(f.id, TODAY, data, 12);
  const mes = guardsThisMonth(f.id, TODAY, data).filter((d) => d >= TODAY);
  const nextMonthIso = `${addDays(`${TODAY.slice(0, 7)}-28`, 7).slice(0, 7)}`;
  const mesSiguiente = Object.keys(data.guardias).sort().filter((d) => d.startsWith(nextMonthIso) && data.guardias[d] === f.id);
  const monthName = MESES[Number(TODAY.slice(5, 7)) - 1];
  const nextMonthName = MESES[Number(nextMonthIso.slice(5, 7)) - 1];
  const totalAnio = Object.values(data.guardias).filter((id) => id === f.id).length;

  const faq = [
    {
      pregunta: `¿Cuándo está de guardia ${f.nombre} este mes?`,
      respuesta: mes.length
        ? `En lo que queda de ${monthName}, ${f.nombre} está de guardia ${joinEs(groupDates(mes))}.`
        : `En lo que queda de ${monthName} no tiene guardias en el calendario publicado.`,
    },
    {
      pregunta: `¿Y en ${nextMonthName}?`,
      respuesta: mesSiguiente.length
        ? `En ${nextMonthName} le corresponde la guardia ${joinEs(groupDates(mesSiguiente))}.`
        : `No hay guardias publicadas para ${f.nombre} en ${nextMonthName}.`,
    },
    { pregunta: `¿Dónde está ${f.nombre}?`, respuesta: `En ${fullAddress(f)}, Alhaurín el Grande.` },
    ...(f.telefono ? [{ pregunta: `¿Cuál es el teléfono de ${f.nombre}?`, respuesta: `${f.telefono}.` }] : []),
    ...(horario ? [{ pregunta: '¿Cuánto dura la guardia?', respuesta: `Cada turno de guardia va ${horario}, según el calendario municipal.` }] : []),
  ];

  const body = `
        <article>
            <header class="alh-page-header">
                <div class="container alh-narrow">
                    ${renderBreadcrumbs(crumbs)}
                    <span class="alh-kicker">Farmacia en Alhaurín el Grande</span>
                    <h1>${escapeHtml(f.nombre)}</h1>
                    <p class="alh-lead">${escapeHtml(f.nombre)} está en ${escapeHtml(fullAddress(f))}, en Alhaurín el Grande${f.telefono ? `, y su teléfono es el ${escapeHtml(f.telefono)}` : ''}. Aquí tienes cómo llegar y todas sus próximas guardias según el calendario municipal.</p>
                    ${deGuardiaHoy ? `<div class="alh-note alh-note-ok"><strong>De guardia hoy</strong><p>${escapeHtml(f.nombre)} es la farmacia de guardia de hoy, ${escapeHtml(formatDateLong(TODAY, { year: false }))}${horario ? ` (${escapeHtml(horario)})` : ''}.</p></div>` : `<div class="alh-note"><strong>Hoy no está de guardia</strong><p>${hoy ? `La farmacia de guardia de hoy es <a href="${escapeHtml(hoy.url)}">${escapeHtml(hoy.nombre)}</a>.` : 'Hoy no consta ninguna farmacia de guardia en el calendario publicado.'} Consulta la <a href="/farmacia-de-guardia/">farmacia de guardia de hoy</a>.</p></div>`}
                </div>
            </header>
            <div class="container alh-narrow">
                <div class="alh-event-facts">
                    <div class="alh-fact"><span>Dirección</span><strong>${escapeHtml(fullAddress(f))}</strong></div>
                    ${f.telefono ? `<div class="alh-fact"><span>Teléfono</span><strong>${telLink(f)}</strong></div>` : ''}
                    ${horario ? `<div class="alh-fact"><span>Turno de guardia</span><strong>${escapeHtml(capitalize(horario))}</strong></div>` : ''}
                    <div class="alh-fact"><span>Guardias en 2026</span><strong>${totalAnio} días</strong></div>
                </div>
                <div class="alh-actions">
                    <a class="alh-btn" href="${escapeHtml(mapsUrl(f))}" target="_blank" rel="noopener">Cómo llegar (mapa)</a>
                    ${f.telefonoHref ? `<a class="alh-btn alh-btn-sec" href="tel:${escapeHtml(f.telefonoHref)}">Llamar</a>` : ''}
                    <a class="alh-btn alh-btn-sec" href="/guia-util/farmacias/calendario/">Calendario de guardias</a>
                </div>
                <div class="alh-prose">
                    <h2>Próximas guardias</h2>
                    ${proximas.length ? `<p>Según el calendario publicado por el Ayuntamiento, ${escapeHtml(f.nombre)} estará de guardia en estas fechas:</p>
                    <ul>
                        ${proximas.map((d) => `<li>${escapeHtml(capitalize(formatDateLong(d)))}</li>`).join('\n                        ')}
                    </ul>` : '<p>No tiene más guardias en el calendario publicado para lo que queda de año.</p>'}
                    <p>Durante la guardia la farmacia atiende fuera del horario habitual${horario ? `, ${escapeHtml(horario)}` : ''}. Como puede haber cambios de última hora, llama antes de desplazarte o comprueba la <a href="${OFFICIAL_PHARMACY_SOURCE}" target="_blank" rel="noopener">información oficial del Ayuntamiento</a>. En caso de urgencia sanitaria, llama al 112.</p>
                </div>
                ${adSlot('farmacia-ficha')}
                <section class="alh-faq alh-section">
                    <h2 class="alh-h2">Preguntas frecuentes</h2>
                    ${faq.map((q) => `<details><summary>${escapeHtml(q.pregunta)}</summary><p>${escapeHtml(q.respuesta)}</p></details>`).join('\n                    ')}
                </section>
                <section class="alh-section">
                    <h2 class="alh-h2">Otras farmacias de Alhaurín el Grande</h2>
                    <div class="alh-list-box"><ul class="alh-plain-list">
                        ${data.farmacias.filter((x) => x.id !== f.id).map((x) => `<li class="alh-news-item"><a class="alh-news-title" href="${escapeHtml(x.url)}">${escapeHtml(x.nombre)}</a><p class="alh-news-line">${escapeHtml(fullAddress(x))}</p></li>`).join('\n                        ')}
                    </ul></div>
                </section>
                <p class="alh-event-meta">Fuentes: <a href="${OFFICIAL_PHARMACY_SOURCE}" target="_blank" rel="noopener">Ayuntamiento de Alhaurín el Grande</a> · <a href="${COLEGIO}" target="_blank" rel="noopener">Colegio de Farmacéuticos de Málaga</a>.</p>
                <p class="alh-more"><a href="/guia-util/farmacias/">← Todas las farmacias y guardias</a></p>
            </div>
        </article>`;

  return withRobots(renderPage({
    title: `${f.nombre}: guardias, dirección y teléfono — Alhaurín el Grande`,
    description: `${f.nombre} (${fullAddress(f)}, Alhaurín el Grande): teléfono, mapa y próximas guardias según el calendario municipal.`.slice(0, 300),
    canonical,
    jsonld: [pharmacyJsonLd(f, canonical), {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map((q) => ({ '@type': 'Question', name: q.pregunta, acceptedAnswer: { '@type': 'Answer', text: q.respuesta } })),
    }, breadcrumbSchema(crumbs)],
    body,
  }));
}

function monthTable(year, month, data) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const offset = (weekdayIndex(first) + 6) % 7; // lunes = 0
  const cells = Array(offset).fill('<td class="is-empty"></td>');
  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const f = pharmacyOn(iso, data);
    cells.push(`<td${iso === TODAY ? ' class="is-today"' : ''}><span class="alh-cal-day">${d}</span>${f ? `<a href="${escapeHtml(f.url)}">${escapeHtml(f.nombre)}</a>` : '<span class="alh-cal-none">Sin dato</span>'}</td>`);
  }
  while (cells.length % 7) cells.push('<td class="is-empty"></td>');
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
  return `<section class="alh-section alh-cal-month" id="mes-${String(month).padStart(2, '0')}">
                <h2 class="alh-h2">${capitalize(MESES[month - 1])} de ${year}</h2>
                <div class="alh-cal-wrap">
                <table class="alh-cal">
                    <thead><tr><th>Lun</th><th>Mar</th><th>Mié</th><th>Jue</th><th>Vie</th><th>Sáb</th><th>Dom</th></tr></thead>
                    <tbody>${rows.join('')}</tbody>
                </table>
                </div>
            </section>`;
}

function renderCalendario(data) {
  const canonical = `${SITE_URL}/guia-util/farmacias/calendario/`;
  const crumbs = [
    { name: 'Inicio', url: '/' },
    { name: 'Guía útil', url: '/guia-util/' },
    { name: 'Farmacias', url: '/guia-util/farmacias/' },
    { name: 'Calendario de guardias', url: '/guia-util/farmacias/calendario/' },
  ];
  const fechas = Object.keys(data.guardias).sort();
  const year = Number((fechas[0] || TODAY).slice(0, 4));
  const schedule = guardSchedule(data.meta);
  const hoy = pharmacyOn(TODAY, data);
  const currentMonth = Number(TODAY.slice(5, 7));
  const months = [];
  // Primero el mes actual y los siguientes; después los meses ya pasados del año.
  for (let m = currentMonth; m <= 12; m++) months.push(m);
  for (let m = 1; m < currentMonth; m++) months.push(m);
  const huecos = (data.meta.huecos_sin_dato || []).map((d) => formatDateLong(d, { weekday: false }));

  const body = `
        <section class="alh-page-header">
            <div class="container">
                ${renderBreadcrumbs(crumbs)}
                <span class="alh-kicker">Farmacias de guardia ${year}</span>
                <h1>Calendario de farmacias de guardia en Alhaurín el Grande</h1>
                <p class="alh-lead">Calendario completo de ${year} con la farmacia de guardia de cada día en Alhaurín el Grande, elaborado con el calendario que publica el Ayuntamiento.${schedule ? ` Cada guardia va de ${escapeHtml(schedule.desde)} a ${escapeHtml(schedule.hasta)} del día siguiente.` : ''}</p>
                ${hoy ? `<p><strong>Hoy, ${escapeHtml(formatDateLong(TODAY, { year: false }))}:</strong> <a href="${escapeHtml(hoy.url)}">${escapeHtml(hoy.nombre)}</a> (${escapeHtml(fullAddress(hoy))}).</p>` : ''}
                <div class="alh-actions">
                    <a class="alh-btn" href="/farmacia-de-guardia/">Farmacia de guardia hoy</a>
                    <a class="alh-btn alh-btn-sec" href="/guia-util/farmacias/">Todas las farmacias</a>
                </div>
                <nav class="alh-filters" aria-label="Meses">${months.map((m) => `<a class="alh-filter" href="#mes-${String(m).padStart(2, '0')}">${capitalize(MESES[m - 1]).slice(0, 3)}</a>`).join('')}</nav>
            </div>
        </section>
        <div class="container">
            ${months.slice(0, 1).map((m) => monthTable(year, m, data)).join('')}
            ${adSlot('farmacia-calendario', 'banda')}
            ${months.slice(1).map((m) => monthTable(year, m, data)).join('\n            ')}
            <section class="alh-section alh-prose">
                <h2>Cómo usar este calendario</h2>
                <p>Cada casilla indica la farmacia que está de guardia ese día; pulsa en su nombre para ver su dirección, su teléfono y el mapa. Como el turno empieza por la mañana y termina a la misma hora del día siguiente, de madrugada sigue de guardia la farmacia del día anterior.</p>
                ${huecos.length ? `<p>El calendario municipal no indica farmacia para estos días: ${escapeHtml(joinEs(huecos))}.</p>` : ''}
                <p>Las guardias pueden cambiar por sustituciones de última hora. Antes de desplazarte, llama a la farmacia o comprueba la <a href="${OFFICIAL_PHARMACY_SOURCE}" target="_blank" rel="noopener">información oficial del Ayuntamiento</a> o el <a href="${COLEGIO}" target="_blank" rel="noopener">buscador del Colegio de Farmacéuticos</a>. En caso de urgencia sanitaria, llama al 112.</p>
            </section>
        </div>`;

  return withRobots(renderPage({
    title: `Calendario de farmacias de guardia ${year} en Alhaurín el Grande — Alhaurín al Día`,
    description: `Calendario completo de farmacias de guardia de ${year} en Alhaurín el Grande, día a día, con enlace a la ficha de cada farmacia.`,
    canonical,
    jsonld: [breadcrumbSchema(crumbs)],
    body,
  }));
}

function main() {
  const data = loadPharmacies();
  let written = 0;
  const robots = [];
  for (const f of data.farmacias) {
    const html = renderFicha(f, data);
    robots.push(`${f.id}: ${html.match(/content="(index|noindex)/)[1]} (${ownWords(html)} palabras)`);
    if (writeIfChanged(fs, path.join(ROOT, f.url.replace(/^\//, ''), 'index.html'), html)) written++;
  }
  const cal = renderCalendario(data);
  robots.push(`calendario: ${cal.match(/content="(index|noindex)/)[1]} (${ownWords(cal)} palabras)`);
  if (writeIfChanged(fs, path.join(ROOT, 'guia-util', 'farmacias', 'calendario', 'index.html'), cal)) written++;
  console.log(`Farmacias: ${data.farmacias.length} fichas y calendario (${written} escritas). ${robots.join(' · ')}`);
}

main();
