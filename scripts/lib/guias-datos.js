// Contenido de guías construido SOLO con datos que ya están en data/
// (sin inventar nada). Lo usan las guías con "generador" en data/guias.json:
//
//   farmacias   farmacias.json + guardias-farmacias-2026.json
//   transporte  transporte-ctmam.json
//
// Cada generador devuelve { datos_clave, secciones, faq } que se añaden a lo
// que tenga la guía en guias.json.

const { escapeHtml, formatDateLong, addDays, capitalize, MESES } = require('./layout');
const { loadPharmacies, pharmacyOn, guardSchedule, mapsUrl, readJson } = require('./hoy');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OFFICIAL_PHARMACY_SOURCE = 'https://alhaurinelgrande.es/farmacias/';

function telLink(f) {
  return f.telefonoHref ? `<a href="tel:${escapeHtml(f.telefonoHref)}">${escapeHtml(f.telefono)}</a>` : escapeHtml(f.telefono || '');
}

function fullAddress(f) {
  return `${f.direccion}${f.referencia ? `, ${f.referencia}` : ''}`;
}

// Próximas guardias de una farmacia (fechas ISO) a partir de `fromIso`.
function nextGuards(farmaciaId, fromIso, data, max = 6) {
  return Object.keys(data.guardias).sort()
    .filter((d) => d >= fromIso && data.guardias[d] === farmaciaId)
    .slice(0, max);
}

// Agrupa fechas consecutivas: ["2026-11-20","2026-11-21"] -> "20 y 21 de noviembre".
function groupDates(dates) {
  const runs = [];
  for (const d of dates) {
    const last = runs[runs.length - 1];
    if (last && addDays(last[last.length - 1], 1) === d) last.push(d);
    else runs.push([d]);
  }
  return runs.map((run) => {
    if (run.length === 1) return formatDateLong(run[0], { year: false });
    return `del ${formatDateLong(run[0], { year: false })} al ${formatDateLong(run[run.length - 1], { year: false })}`;
  });
}

function joinEs(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}`;
}

function guardsThisMonth(farmaciaId, today, data) {
  const month = today.slice(0, 7);
  return Object.keys(data.guardias).sort().filter((d) => d.startsWith(month) && data.guardias[d] === farmaciaId);
}

function farmacias(today) {
  const data = loadPharmacies();
  const hoy = pharmacyOn(today, data);
  const schedule = guardSchedule(data.meta);
  const horario = schedule ? `de ${schedule.desde} a ${schedule.hasta} del día siguiente` : '';
  const monthName = MESES[Number(today.slice(5, 7)) - 1];
  const counts = data.farmacias.map((f) => ({ f, n: guardsThisMonth(f.id, today, data).length }));

  const lista = data.farmacias.map((f) => {
    const next = nextGuards(f.id, today, data, 3);
    return `<li><strong><a href="${escapeHtml(f.url)}">${escapeHtml(f.nombre)}</a></strong>: ${escapeHtml(fullAddress(f))} · ${telLink(f)} · <a href="${escapeHtml(mapsUrl(f))}" target="_blank" rel="noopener">mapa</a>${next.length ? `. Próximas guardias: ${escapeHtml(joinEs(groupDates(next)))}.` : '.'}</li>`;
  }).join('\n');

  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => {
    const f = pharmacyOn(d, data);
    return `<li>${escapeHtml(capitalize(formatDateLong(d, { year: false })))}: ${f ? `<a href="${escapeHtml(f.url)}">${escapeHtml(f.nombre)}</a> (${escapeHtml(f.direccion)})` : 'sin dato publicado'}</li>`;
  }).join('\n');

  const repartoMes = counts.filter((c) => c.n).map((c) => `${c.f.nombre} (${c.n} ${c.n === 1 ? 'día' : 'días'})`);

  return {
    datos_clave: [
      { etiqueta: 'Farmacias en el municipio', valor: String(data.farmacias.length) },
      { etiqueta: 'De guardia hoy', valor: hoy ? `${hoy.nombre} · ${fullAddress(hoy)}` : 'Sin dato publicado para hoy' },
      ...(horario ? [{ etiqueta: 'Turno de guardia', valor: capitalize(horario) }] : []),
      { etiqueta: 'Calendario', valor: 'Calendario municipal de guardias de 2026' },
      { etiqueta: 'Urgencias', valor: '112' },
    ],
    secciones: [
      {
        titulo: 'Farmacia de guardia hoy y esta semana',
        html: `<p>${hoy ? `Hoy, ${escapeHtml(formatDateLong(today, { year: false }))}, está de guardia <strong>${escapeHtml(hoy.nombre)}</strong>, en ${escapeHtml(fullAddress(hoy))} (teléfono ${telLink(hoy)}).` : 'Hoy no consta ninguna farmacia de guardia en el calendario publicado.'} Tienes la información del día siempre actualizada en la página de la <a href="/farmacia-de-guardia/">farmacia de guardia de hoy</a>.</p>
<ul>
${week}
</ul>
<p>Consulta el <a href="/guia-util/farmacias/calendario/">calendario completo de guardias</a> para ver cualquier otro día del año.</p>`,
      },
      {
        titulo: 'Las farmacias de Alhaurín el Grande',
        html: `<p>En Alhaurín el Grande hay ${data.farmacias.length} farmacias. Cada una tiene su ficha con la dirección, el teléfono, el enlace al mapa y todas sus próximas guardias.</p>
<ul>
${lista}
</ul>`,
      },
      {
        titulo: 'Cómo funcionan las guardias',
        html: `<p>Las farmacias del municipio se turnan para que siempre haya una abierta fuera del horario comercial. ${horario ? `Cada turno de guardia va ${escapeHtml(horario)}, de modo que, de madrugada, sigue de guardia la farmacia del día anterior hasta las ${escapeHtml(schedule.hasta)}.` : ''} Normalmente una misma farmacia cubre varios días seguidos.</p>
${repartoMes.length ? `<p>En ${escapeHtml(monthName)} el calendario reparte las guardias así: ${escapeHtml(joinEs(repartoMes))}.</p>` : ''}
<p>El calendario de esta guía se elabora con el que publica el Ayuntamiento de Alhaurín el Grande. Como puede haber cambios de última hora, antes de desplazarte llama a la farmacia o consulta la <a href="${OFFICIAL_PHARMACY_SOURCE}" target="_blank" rel="noopener">información oficial</a>. En caso de urgencia sanitaria, llama al 112.</p>`,
      },
    ],
    faq: [
      {
        pregunta: '¿Qué farmacia está de guardia hoy en Alhaurín el Grande?',
        respuesta: hoy ? `Hoy, ${formatDateLong(today)}, está de guardia ${hoy.nombre}, en ${fullAddress(hoy)} (teléfono ${hoy.telefono}).` : 'Hoy no consta ninguna farmacia de guardia en el calendario publicado; consulta la información oficial del Ayuntamiento.',
      },
      ...(horario ? [{ pregunta: '¿A qué hora empieza y termina la guardia?', respuesta: `Según el calendario municipal, cada turno de guardia va ${horario}.` }] : []),
      {
        pregunta: `¿Qué farmacias están de guardia en ${monthName}?`,
        respuesta: repartoMes.length ? `En ${monthName} hacen guardia: ${joinEs(repartoMes)}.` : `No hay guardias publicadas para ${monthName}.`,
      },
      {
        pregunta: '¿Dónde puedo comprobar la guardia antes de ir?',
        respuesta: 'En la página de farmacias del Ayuntamiento de Alhaurín el Grande y en el buscador de guardias del Colegio de Farmacéuticos de Málaga, enlazados en las fuentes de esta guía. También puedes llamar directamente a la farmacia.',
      },
    ],
  };
}

function transporte() {
  const t = readJson(path.join(ROOT, 'data', 'transporte-ctmam.json'), null);
  if (!t) return { datos_clave: [], secciones: [], faq: [] };
  const c = t.consorcio || {};
  const parada = t.parada_alhaurin || {};
  const lineas = t.lineas || [];
  const mapa = parada.coordenadas ? `https://www.google.com/maps/search/?api=1&query=${parada.coordenadas.lat},${parada.coordenadas.lng}` : '';

  const lineasHtml = lineas.map((l) => `<h3>${escapeHtml(l.id)}: ${escapeHtml(l.nombre)}</h3>
<p>${escapeHtml(l.notas || '')}</p>
<ul>
<li><strong>Recorrido:</strong> ${escapeHtml((l.paradas_principales || []).join(' → '))}.</li>
${l.via ? `<li><strong>Pasa por:</strong> ${escapeHtml(l.via)}.</li>` : ''}
${l.duracion_aprox ? `<li><strong>Duración aproximada:</strong> ${escapeHtml(l.duracion_aprox)}.</li>` : ''}
${l.frecuencia ? `<li><strong>Frecuencia:</strong> ${escapeHtml(l.frecuencia)}.</li>` : ''}
${l.operador ? `<li><strong>Operador:</strong> ${escapeHtml(l.operador)}.</li>` : ''}
${l.horario_url ? `<li><a href="${escapeHtml(l.horario_url)}" target="_blank" rel="noopener">Horarios oficiales de la línea ${escapeHtml(l.id)} en la web del Consorcio</a></li>` : ''}
</ul>`).join('\n');

  return {
    datos_clave: [
      { etiqueta: 'Parada principal', valor: `${parada.nombre || ''}${parada.direccion ? ` (${parada.direccion})` : ''}` },
      { etiqueta: 'Líneas', valor: lineas.map((l) => l.id).join(', ') },
      ...(c.telefono ? [{ etiqueta: 'Teléfono del Consorcio', valor: c.telefono }] : []),
      ...(c.app ? [{ etiqueta: 'App', valor: c.app }] : []),
      ...(c.tarjeta ? [{ etiqueta: 'Tarjeta', valor: c.tarjeta }] : []),
    ],
    secciones: [
      {
        titulo: 'Dónde coger el autobús',
        html: `<p>Las líneas metropolitanas paran en el <strong>${escapeHtml(parada.nombre || 'apeadero')}</strong>${parada.direccion ? `, en ${escapeHtml(parada.direccion)}` : ''}. Desde allí salen las líneas ${escapeHtml(joinEs(parada.lineas || lineas.map((l) => l.id)))}.${mapa ? ` <a href="${mapa}" target="_blank" rel="noopener">Ver la parada en el mapa</a>.` : ''}</p>`,
      },
      { titulo: 'Líneas de autobús', html: lineasHtml },
      {
        titulo: 'Consejos para viajar',
        html: `<ul>
${(t.consejos || []).map((x) => `<li>${escapeHtml(x)}</li>`).join('\n')}
</ul>
<p>Los horarios cambian según el día de la semana, los festivos y la época del año, por eso esta guía no los copia: consulta siempre los horarios oficiales de cada línea en la <a href="${escapeHtml(c.web || 'https://www.ctmam.es/')}" target="_blank" rel="noopener">web del ${escapeHtml(c.nombre || 'Consorcio de Transporte Metropolitano del Área de Málaga')}</a>.</p>`,
      },
    ],
    faq: [
      {
        pregunta: '¿Qué autobús va de Alhaurín el Grande a Málaga?',
        respuesta: lineas.filter((l) => /málaga/i.test(l.nombre)).map((l) => `La línea ${l.id} (${l.nombre}), con una duración aproximada de ${l.duracion_aprox}`).join('. ') + '.',
      },
      {
        pregunta: '¿Cómo llego en autobús al Hospital del Valle del Guadalhorce?',
        respuesta: lineas.filter((l) => /hospital valle/i.test(l.nombre)).map((l) => `Con la línea ${l.id} (${l.nombre}). ${l.frecuencia || ''}`.trim()).join(' ') || 'Consulta las líneas en la web del Consorcio.',
      },
      {
        pregunta: '¿Dónde consulto los horarios?',
        respuesta: `En la web oficial del ${c.nombre || 'Consorcio de Transporte Metropolitano del Área de Málaga'} (${c.web || 'ctmam.es'}) y en su app ${c.app || ''}.`.replace(/\s+\./, '.'),
      },
    ],
  };
}

const GENERADORES = { farmacias, transporte };

function applyGenerator(guia, today) {
  const gen = GENERADORES[guia.generador];
  if (!gen) return guia;
  const extra = gen(today);
  return {
    ...guia,
    datos_clave: [...extra.datos_clave, ...(guia.datos_clave || [])],
    secciones: [...extra.secciones, ...(guia.secciones || [])],
    faq: [...extra.faq, ...(guia.faq || [])],
  };
}

module.exports = { applyGenerator, nextGuards, groupDates, joinEs, guardsThisMonth, fullAddress, telLink, OFFICIAL_PHARMACY_SOURCE };
