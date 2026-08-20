// Reglas puras de fusión/severidad/orden para el panel "Hoy en Alhaurín".
// Sin DOM, sin fetch, sin fs: cómo obtener los datos (fetch en el navegador,
// fs.readFileSync en build-time) y cómo pintar el HTML (DOM vs plantillas de
// string) sigue siendo cosa de cada lado. Este módulo es la única definición
// de qué tarjeta gana, en qué orden y con qué severidad — antes vivía
// duplicado casi al carácter en js/home-live.js y en
// scripts/render-home-widgets-static.js, con el riesgo real de que divergieran
// (p. ej. mergeWeather() generaba la tira de actividades del día solo en el
// render estático, y el cliente la borraba al re-hidratar).
//
// Se consume igual desde los dos entornos vía import() dinámico: un script
// clásico (<script defer>, sin type="module") puede hacer import() dentro de
// una función async igual que CommonJS puede hacer await import(...) desde
// Node. Ver js/lib/package.json (type:module, solo scope Node de esta carpeta;
// el navegador no lo necesita, siempre trata un import() como módulo).

export function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function getStatusLabel(estado = 'neutral') {
  return { ok: 'Normal', warning: 'Aviso', alert: 'Atención', neutral: 'Info' }[estado] || 'Info';
}

export function getSeverityWeight(estado = '') {
  return { alert: 4, warning: 3, ok: 2, neutral: 1 }[estado] || 1;
}

// Ordena las tarjetas por severidad (alert primero) antes de pintarlas, para
// que un aviso urgente gane la primera posición de la rejilla en vez de
// depender del orden en que llegaron los datos. Orden estable: a igualdad de
// severidad, se conserva el orden original.
export function sortBySeverity(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const diff = getSeverityWeight(b.item.estado) - getSeverityWeight(a.item.estado);
      return diff !== 0 ? diff : a.index - b.index;
    })
    .map(({ item }) => item);
}

export function isActiveNotice(notice) {
  if (!notice || notice.activo === false) return false;
  const now = new Date();
  const starts = notice.inicio ? new Date(notice.inicio) : null;
  const ends = notice.fin ? new Date(notice.fin) : null;
  if (starts && !Number.isNaN(starts.getTime()) && starts > now) return false;
  if (ends && !Number.isNaN(ends.getTime()) && ends < now) return false;
  return true;
}

export function getNoticeTarget(notice) {
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

export function mergeLocalNotices(items, noticesData) {
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

export function nivelToEstado(nivel) {
  const value = String(nivel || '').toLowerCase();
  return value === 'naranja' || value === 'rojo' ? 'alert' : 'warning';
}

export function isActiveAvisoOficial(aviso) {
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

export function mergeAvisosOficiales(items, avisosOficialesData) {
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

// Enriquece la tarjeta de tiempo con la tira de "actividades del día"
// (tender ropa, lavar el coche, deporte exterior, alergia y polen) cuando
// data/tiempo-aemet.json trae `actividades`. Se genera aquí, una sola vez,
// para que el HTML servido de inicio y la re-hidratación en el navegador
// pinten exactamente lo mismo.
export function mergeWeather(items, weatherData) {
  const weatherItem = weatherData?.item;
  if (!weatherItem || typeof weatherItem !== 'object') return items;

  const actividades = Array.isArray(weatherData?.actividades) ? weatherData.actividades : [];
  const actividadesMini = actividades.length
    ? actividades
      .slice(0, 3)
      .map((a) => `<span class="activity-mini-pill" title="${escapeHTML(a.detalle)}">${escapeHTML(a.icono)} ${escapeHTML(a.titulo)}: <strong>${escapeHTML(a.estado)}</strong></span>`)
      .join('')
    : '';

  const enrichedItem = { ...weatherItem, actividadesMini };
  const cleaned = items.filter((item) => item.id !== 'tiempo' && item.id !== 'andalmet');
  return [enrichedItem, ...cleaned];
}

export function buildCardFromRadarTrafico(reporte) {
  const esArroyo = reporte.type === 'arroyo';
  const calleInfo = reporte.calle ? ` (${reporte.calle})` : '';
  return {
    id: 'trafico',
    icono: esArroyo ? '🌊' : '🚧',
    titulo: 'Tráfico',
    valor: reporte.titulo || (esArroyo ? 'Crecida de arroyo' : 'Corte de tráfico'),
    detalle: `${reporte.detalle || 'Reportado por vecinos en el Radar Social.'}${calleInfo}`,
    estado: 'alert',
    fuente: 'Radar Social',
    cta: 'Ver en el mapa',
    url: './radar-social/',
  };
}

export function mergeRadarTrafico(items, radarTraficoData) {
  const reportes = Array.isArray(radarTraficoData?.reportes) ? radarTraficoData.reportes : [];
  if (!reportes.length) return items;
  const card = buildCardFromRadarTrafico(reportes[0]);
  const replaced = items.some((item) => item.id === 'trafico');
  const merged = items.map((item) => (item.id === 'trafico' ? card : item));
  return replaced ? merged : [...merged, card];
}

export function isUpcomingEvent(event) {
  const now = new Date();
  const start = event.inicio ? new Date(event.inicio) : null;
  const end = event.fin ? new Date(event.fin) : null;
  if (event.activo === false) return false;
  if (end && !Number.isNaN(end.getTime()) && end < now) return false;
  if (!start && !end) return false;
  return true;
}

// Ventana de 3 días (hoy + 2), reutilizada por mergeAgendaSummary() para la
// tarjeta de Estado Local y por el listado completo de próximos eventos.
export function getUpcomingAgendaEvents(events, limit = 6) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const windowEnd = new Date(todayStart);
  windowEnd.setDate(windowEnd.getDate() + 3);

  return events
    .filter(isUpcomingEvent)
    .filter((event) => {
      const start = event.inicio ? new Date(event.inicio) : null;
      if (!start || Number.isNaN(start.getTime())) return false;
      return start >= todayStart && start < windowEnd;
    })
    .sort((a, b) => {
      const dateA = (a.inicio && new Date(a.inicio)) || (a.fin && new Date(a.fin)) || new Date(8640000000000000);
      const dateB = (b.inicio && new Date(b.inicio)) || (b.fin && new Date(b.fin)) || new Date(8640000000000000);
      return dateA - dateB;
    })
    .slice(0, limit);
}

export function formatEventDate(value, timeZone = 'Europe/Madrid') {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Fecha pendiente';
  return date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone });
}

function buildCardFromAgendaSummary(upcoming) {
  const count = upcoming.length;
  const primero = upcoming[0];
  const cuando = formatEventDate(primero.inicio);
  const detalleBase = `${primero.titulo || 'Evento local'}${primero.lugar ? ` · ${primero.lugar}` : ''} (${cuando})`;
  return {
    id: 'agenda',
    icono: '📅',
    titulo: 'Agenda',
    valor: count === 1 ? '1 actividad próxima' : `${count} actividades próximas`,
    detalle: count > 1 ? `${detalleBase} y ${count - 1} más` : detalleBase,
    estado: 'ok',
    fuente: 'Agenda local',
    cta: 'Ver planes',
    url: './planes/',
  };
}

export function mergeAgendaSummary(items, agendaLocalData) {
  const events = Array.isArray(agendaLocalData?.eventos) ? agendaLocalData.eventos : [];
  const upcoming = getUpcomingAgendaEvents(events);
  if (!upcoming.length) return items;
  const card = buildCardFromAgendaSummary(upcoming);
  const replaced = items.some((item) => item.id === 'agenda');
  const merged = items.map((item) => (item.id === 'agenda' ? card : item));
  return replaced ? merged : [...merged, card];
}

export function pickLatestDate(...values) {
  let latest = null;
  for (const value of values) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    if (!latest || date > latest) latest = date;
  }
  return latest;
}
