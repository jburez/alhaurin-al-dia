const fs = require('fs');
const path = require('path');
const { SITE_FOOTER_HTML } = require('./lib/footer');
const { CF_ANALYTICS_SNIPPET } = require('./lib/analytics');
const { renderNav } = require('./lib/nav');

const ROOT = path.join(__dirname, '..');
const TIEMPO_HTML_PATH = path.join(ROOT, 'tiempo', 'index.html');
const TIEMPO_JSON_PATH = path.join(ROOT, 'data', 'tiempo-aemet.json');
const CLIMA_JSON_PATH = path.join(ROOT, 'data', 'clima-alhaurin.json');
const TZ = 'Europe/Madrid';
// El cron de scripts/actualizar_tiempo_aemet.py corre a las 6:15, 10:15 y
// 15:15 UTC — el hueco nocturno (15:15 a 6:15 del día siguiente) es de ~15h,
// así que el umbral de "dato obsoleto" tiene que ser mayor que eso para no
// marcar como obsoleto el estado normal de cada madrugada. 20h da margen
// para retrasos habituales de GitHub Actions sin dejar de detectar un fallo
// real del cron (AEMET caída, secret caducado, workflow desactivado...).
const STALE_THRESHOLD_HOURS = 20;

const MESES_CORTOS = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const DIRECCIONES = {
  N: 'norte', NE: 'noreste', E: 'este', SE: 'sureste',
  S: 'sur', SO: 'suroeste', O: 'oeste', NO: 'noroeste'
};
// Colores de las gráficas de climatología (validados con el validador de
// paleta de dataviz: contraste ≥ 3:1 y separación para daltonismo).
const COLOR_MAX = '#c2410c';
const COLOR_MIN = '#2563eb';
const COLOR_LLUVIA = '#2a78d6';

function readJSON(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function escapeHTML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fmt = (v, dec = 1) => Number(v).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: dec });

function uvLabel(uv) {
  const n = num(uv);
  if (n === null) return '';
  if (n < 3) return 'Bajo';
  if (n < 6) return 'Moderado';
  if (n < 8) return 'Alto';
  if (n < 11) return 'Muy alto';
  return 'Extremo';
}

function addDaysISO(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function fechaLarga(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
  }).replace(',', '');
}

// "SO 10 km/h" → "de componente suroeste a 10 km/h"
function vientoEnTexto(viento) {
  const m = String(viento || '').match(/^([A-Z]{1,2})\s+(\d+)\s*km\/h/);
  if (!m) return viento ? `viento ${String(viento).toLowerCase()}` : '';
  if (m[1] === 'C' || m[2] === '0') return 'viento en calma';
  const dir = DIRECCIONES[m[1]];
  const vel = Number(m[2]);
  const fuerza = vel < 20 ? 'flojo' : vel < 40 ? 'moderado' : 'fuerte';
  return `viento ${fuerza}${dir ? ` de componente ${dir}` : ''} a ${vel} km/h`;
}

function lluviaEnTexto(prob) {
  const p = num(prob);
  if (p === null) return 'sin dato de probabilidad de lluvia';
  if (p === 0) return 'sin lluvia prevista';
  if (p < 30) return `probabilidad de lluvia baja (${p} %)`;
  if (p < 60) return `probabilidad de lluvia moderada (${p} %)`;
  return `probabilidad de lluvia alta (${p} %)`;
}

function minuscula(s) {
  const t = String(s || '');
  return t.charAt(0).toLowerCase() + t.slice(1);
}

// ---------- Gráficas de climatología (SVG estático) ----------

const CHART = { w: 640, h: 230, left: 38, right: 46, top: 16, bottom: 30 };

function chartFrame(yMax, yStep, unit, inner, ariaLabel, title) {
  const plotH = CHART.h - CHART.top - CHART.bottom;
  const plotW = CHART.w - CHART.left - CHART.right;
  let grid = '';
  for (let v = 0; v <= yMax; v += yStep) {
    const y = CHART.top + plotH - (v / yMax) * plotH;
    grid += `<line x1="${CHART.left}" x2="${CHART.left + plotW}" y1="${y}" y2="${y}" class="clima-grid-line"/>`;
    grid += `<text x="${CHART.left - 6}" y="${y + 4}" text-anchor="end" class="clima-axis-text">${v}${unit}</text>`;
  }
  const step = plotW / 12;
  const labels = MESES_CORTOS.map((m, i) => `<text x="${CHART.left + step * i + step / 2}" y="${CHART.h - 8}" text-anchor="middle" class="clima-axis-text">${m}</text>`).join('');
  return `<svg viewBox="0 0 ${CHART.w} ${CHART.h}" class="clima-chart-svg" role="img" aria-label="${escapeHTML(ariaLabel)}"><title>${escapeHTML(title)}</title>${grid}${labels}${inner}</svg>`;
}

function renderTempChart(meses) {
  const yMax = 35;
  const plotH = CHART.h - CHART.top - CHART.bottom;
  const plotW = CHART.w - CHART.left - CHART.right;
  const step = plotW / 12;
  const x = (i) => CHART.left + step * i + step / 2;
  const y = (v) => CHART.top + plotH - (Math.max(0, v) / yMax) * plotH;
  const line = (key) => meses.map((m, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(m[key]).toFixed(1)}`).join(' ');
  const dots = (key, color) => meses.map((m, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(m[key]).toFixed(1)}" r="4" fill="${color}" stroke="#fff" stroke-width="2"/>`).join('');
  const hits = meses.map((m, i) => `<rect x="${(CHART.left + step * i).toFixed(1)}" y="${CHART.top}" width="${step.toFixed(1)}" height="${plotH}" class="clima-hit"><title>${escapeHTML(m.nombre)}: máxima media ${fmt(m.t_max)} °C · mínima media ${fmt(m.t_min)} °C</title></rect>`).join('');
  const last = meses[11];
  const inner = `
    <path d="${line('t_max')}" fill="none" stroke="${COLOR_MAX}" stroke-width="2" stroke-linejoin="round"/>
    <path d="${line('t_min')}" fill="none" stroke="${COLOR_MIN}" stroke-width="2" stroke-linejoin="round"/>
    ${dots('t_max', COLOR_MAX)}${dots('t_min', COLOR_MIN)}
    <text x="${x(11) + 9}" y="${y(last.t_max) + 4}" class="clima-direct-label">Máx</text>
    <text x="${x(11) + 9}" y="${y(last.t_min) + 4}" class="clima-direct-label">Mín</text>
    ${hits}`;
  return chartFrame(yMax, 10, '°', inner, 'Temperatura máxima y mínima media de cada mes en Alhaurín el Grande', 'Temperatura media por meses');
}

function renderRainChart(meses) {
  const yMax = Math.max(80, Math.ceil(Math.max(...meses.map((m) => m.lluvia_mm)) / 20) * 20);
  const plotH = CHART.h - CHART.top - CHART.bottom;
  const plotW = CHART.w - CHART.left - CHART.right;
  const step = plotW / 12;
  const barW = Math.min(30, step - 8);
  const base = CHART.top + plotH;
  const maxMes = meses.reduce((a, b) => (b.lluvia_mm > a.lluvia_mm ? b : a));
  const bars = meses.map((m, i) => {
    const h = (m.lluvia_mm / yMax) * plotH;
    const x0 = CHART.left + step * i + (step - barW) / 2;
    const r = Math.min(4, h, barW / 2);
    const top = base - h;
    const d = h <= 0 ? '' : `M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${base} Z`;
    const label = m === maxMes ? `<text x="${x0 + barW / 2}" y="${top - 6}" text-anchor="middle" class="clima-direct-label">${m.lluvia_mm} mm</text>` : '';
    return `${d ? `<path d="${d}" fill="${COLOR_LLUVIA}"/>` : ''}${label}<rect x="${(CHART.left + step * i).toFixed(1)}" y="${CHART.top}" width="${step.toFixed(1)}" height="${plotH}" class="clima-hit"><title>${escapeHTML(m.nombre)}: ${m.lluvia_mm} mm · ${fmt(m.dias_lluvia)} días de lluvia</title></rect>`;
  }).join('');
  return chartFrame(yMax, 20, '', bars, 'Precipitación media de cada mes en Alhaurín el Grande, en milímetros', 'Precipitación media por meses (mm)');
}

function mejoresMeses(meses) {
  const buenos = meses.filter((m) => m.t_max >= 22 && m.t_max <= 30 && m.lluvia_mm <= 35);
  return buenos.map((m) => m.nombre.toLowerCase());
}

function listaY(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

function renderClima(clima) {
  if (!clima || !Array.isArray(clima.meses) || clima.meses.length !== 12) return { html: '', faqs: [] };
  const { meses, anual, records } = clima;
  const masCalido = meses.reduce((a, b) => (b.t_max > a.t_max ? b : a));
  const masFrio = meses.reduce((a, b) => (b.t_min < a.t_min ? b : a));
  const masLluvioso = meses.reduce((a, b) => (b.lluvia_mm > a.lluvia_mm ? b : a));
  const mejores = mejoresMeses(meses);
  const fechaRec = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  const filas = meses.map((m) => `
    <tr>
      <th scope="row">${escapeHTML(m.nombre)}</th>
      <td>${fmt(m.t_max)} °C</td><td>${fmt(m.t_min)} °C</td><td>${fmt(m.t_media)} °C</td>
      <td>${m.lluvia_mm} mm</td><td>${fmt(m.dias_lluvia)}</td><td>${fmt(m.dias_35)}</td><td>${fmt(m.dias_helada)}</td>
    </tr>`).join('');

  const html = `
                <section class="clima-section" id="clima" aria-labelledby="clima-title">
                    <div class="section-title compact">
                        <div>
                            <span class="section-kicker">Climatología ${escapeHTML(clima.periodo)}</span>
                            <h2 id="clima-title">El clima de Alhaurín el Grande</h2>
                        </div>
                    </div>
                    <div class="weather-extra-card">
                        <p class="clima-intro">Alhaurín el Grande tiene clima mediterráneo, con veranos calurosos y secos e inviernos suaves en los que las heladas son raras. La lluvia se concentra entre octubre y abril; ${escapeHTML(masLluvioso.nombre.toLowerCase())} es el mes más lluvioso y ${escapeHTML(masCalido.nombre.toLowerCase())} el más caluroso.</p>
                        <div class="clima-stats">
                            <div class="clima-stat"><strong>${fmt(anual.t_media)} °C</strong><span>Temperatura media anual</span></div>
                            <div class="clima-stat"><strong>${anual.lluvia_mm} mm</strong><span>Lluvia al año</span></div>
                            <div class="clima-stat"><strong>${anual.dias_lluvia}</strong><span>Días de lluvia al año</span></div>
                            <div class="clima-stat"><strong>${fmt(anual.dias_35)}</strong><span>Días al año por encima de 35 °C</span></div>
                        </div>
                        <div class="clima-charts">
                            <figure class="clima-chart">
                                <figcaption>
                                    <strong>Temperatura media por meses</strong>
                                    <span class="clima-legend"><span class="clima-key" style="background:${COLOR_MAX}"></span>Máxima <span class="clima-key" style="background:${COLOR_MIN}"></span>Mínima</span>
                                </figcaption>
                                ${renderTempChart(meses)}
                            </figure>
                            <figure class="clima-chart">
                                <figcaption><strong>Lluvia media por meses (mm)</strong></figcaption>
                                ${renderRainChart(meses)}
                            </figure>
                        </div>
                        ${mejores.length ? `<p class="clima-best">🗓️ <strong>Mejor época para visitar Alhaurín:</strong> ${escapeHTML(listaY(mejores))}, con temperaturas agradables y poca lluvia.</p>` : ''}
                        <details class="clima-table-wrap">
                            <summary>Ver la tabla mes a mes y los récords</summary>
                            <div class="clima-table-scroll">
                                <table class="clima-table">
                                    <thead><tr><th scope="col">Mes</th><th scope="col">Máx. media</th><th scope="col">Mín. media</th><th scope="col">Media</th><th scope="col">Lluvia</th><th scope="col">Días de lluvia</th><th scope="col">Días ≥ 35 °C</th><th scope="col">Días de helada</th></tr></thead>
                                    <tbody>${filas}</tbody>
                                </table>
                            </div>
                            <ul class="clima-records">
                                <li>🔥 Máxima más alta del periodo: <strong>${fmt(records.t_max.valor)} °C</strong> (${escapeHTML(fechaRec(records.t_max.fecha))})</li>
                                <li>🥶 Mínima más baja: <strong>${fmt(records.t_min.valor)} °C</strong> (${escapeHTML(fechaRec(records.t_min.fecha))})</li>
                                <li>🌧️ Día más lluvioso: <strong>${fmt(records.lluvia_dia.valor)} mm</strong> (${escapeHTML(fechaRec(records.lluvia_dia.fecha))})</li>
                            </ul>
                        </details>
                        <p class="clima-note">Fuente: <a href="${escapeHTML(clima.fuente_url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(clima.fuente)}</a>, medias ${escapeHTML(clima.periodo)}. ${escapeHTML(clima.nota)}</p>
                    </div>
                </section>`;

  const faqs = [
    {
      q: '¿Qué clima tiene Alhaurín el Grande?',
      a: `Mediterráneo: veranos calurosos y secos e inviernos suaves. La temperatura media anual es de ${fmt(anual.t_media)} °C; ${masCalido.nombre.toLowerCase()} es el mes más caluroso (máximas medias de ${fmt(masCalido.t_max)} °C) y ${masFrio.nombre.toLowerCase()} el más frío (mínimas medias de ${fmt(masFrio.t_min)} °C).`
    },
    {
      q: '¿Cuánto llueve en Alhaurín el Grande al año?',
      a: `Unos ${anual.lluvia_mm} mm repartidos en ${anual.dias_lluvia} días de lluvia al año, sobre todo entre octubre y abril. El mes más lluvioso es ${masLluvioso.nombre.toLowerCase()}, con ${masLluvioso.lluvia_mm} mm de media; julio apenas recoge ${meses[6].lluvia_mm} mm.`
    }
  ];
  if (mejores.length) {
    faqs.push({
      q: '¿Cuál es la mejor época para visitar Alhaurín el Grande?',
      a: `${listaY(mejores).replace(/^./, (c) => c.toUpperCase())}: máximas medias entre 22 y 30 °C y poca lluvia. En cambio, julio y agosto tienen de media ${fmt(meses[6].dias_35)} y ${fmt(meses[7].dias_35)} días por encima de 35 °C.`
    });
  }
  return { html, faqs };
}

// ---------- Página ----------

function renderTiempoPage() {
  const weatherData = readJSON(TIEMPO_JSON_PATH, {
    actualizado: new Date().toISOString(),
    hoy: {},
    semana: [],
    actividades: [],
    sol_luna: {},
    embalses: {}
  });
  const clima = readJSON(CLIMA_JSON_PATH, null);

  const semana = weatherData.semana || [];
  const actividades = (weatherData.actividades || []).filter((a) => a.id !== 'polen');
  const polen = (weatherData.actividades || []).find((a) => a.id === 'polen');
  const solLuna = weatherData.sol_luna || {};
  const embalses = weatherData.embalses || {};

  // "Hoy" se determina comparando la fecha real de cada día contra la fecha
  // actual en Europe/Madrid, no por ser el primer elemento del array: AEMET
  // puede publicar su predicción con retraso y devolver un día ya pasado en
  // la posición 0 (causa real de la regresión de frescura del 2026-08-20).
  const hoyISO = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const mananaISO = addDaysISO(hoyISO, 1);
  const porFecha = (iso) => semana.find((d) => d.fecha && d.fecha.slice(0, 10) === iso);
  const hoy = porFecha(hoyISO) || weatherData.hoy || {};
  const manana = porFecha(mananaISO);
  const finde = semana.filter((d) => d.fecha && d.fecha.slice(0, 10) >= hoyISO && ['Sábado', 'Domingo'].includes(d.dia_semana)).slice(0, 2);

  const tempMax = hoy.t_max || '--';
  const tempMin = hoy.t_min || '--';
  const icono = hoy.icono || '🌤️';
  const descripcion = hoy.descripcion || 'Sin datos';
  const lluvia = hoy.lluvia || '';
  const viento = hoy.viento || '';
  const uv = hoy.uv || '';

  const actualizadoDate = new Date(weatherData.actualizado || Date.now());
  const fechaStr = actualizadoDate.toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: TZ
  });

  // Si el dato de AEMET lleva más de STALE_THRESHOLD_HOURS sin refrescarse
  // (p. ej. el cron de actualizar_tiempo_aemet.py lleva caído), no lo
  // presentamos como "en tiempo real": se apaga el punto verde de "en vivo"
  // y el texto pasa a dejar claro que es la última lectura disponible.
  const horasDesdeActualizacion = (Date.now() - actualizadoDate.getTime()) / 3600000;
  const esObsoleto = !Number.isNaN(horasDesdeActualizacion) && horasDesdeActualizacion > STALE_THRESHOLD_HOURS;
  const liveBadgeClass = esObsoleto ? 'weather-live-badge is-stale' : 'weather-live-badge';
  const liveDotHTML = esObsoleto ? '' : '<span class="live-dot"></span>';
  const liveBadgeText = esObsoleto
    ? `Última lectura de AEMET: ${escapeHTML(fechaStr)} · sin datos más recientes`
    : `AEMET actualizado ${escapeHTML(fechaStr)}`;

  // Resumen en texto del día (también sirve de entradilla para buscadores)
  const resumenHoy = hoy.t_max
    ? `Previsión de AEMET para este ${fechaLarga(hoy.fecha ? hoy.fecha.slice(0, 10) : hoyISO)} en Alhaurín el Grande: ${minuscula(descripcion)}, con máxima de ${tempMax} °C y mínima de ${tempMin} °C, ${lluviaEnTexto(lluvia)}${viento ? ` y ${vientoEnTexto(viento)}` : ''}.`
    : 'La previsión de AEMET para hoy no está disponible en este momento.';

  // Barras de rango de temperatura proporcionales al mínimo y máximo de la semana
  const mins = semana.map((d) => num(d.t_min)).filter((v) => v !== null);
  const maxs = semana.map((d) => num(d.t_max)).filter((v) => v !== null);
  const semMin = mins.length ? Math.min(...mins) : 0;
  const semMax = maxs.length ? Math.max(...maxs) : 1;
  const rango = Math.max(1, semMax - semMin);

  // Los días ya pasados (AEMET puede ir con retraso) no se muestran.
  const semanaVisible = semana.filter((d) => !d.fecha || d.fecha.slice(0, 10) >= hoyISO);
  const semanaHTML = (semanaVisible.length ? semanaVisible : semana).map((d) => {
    const isToday = d.fecha && d.fecha.slice(0, 10) === hoyISO;
    const tn = num(d.t_min);
    const tx = num(d.t_max);
    const left = tn === null ? 0 : ((tn - semMin) / rango) * 100;
    const width = tn === null || tx === null ? 100 : Math.max(8, ((tx - tn) / rango) * 100);
    return `
      <div class="aemet-day-card ${isToday ? 'is-today' : ''}">
        <span class="aemet-day-name">${isToday ? 'Hoy' : escapeHTML(d.dia_semana)}</span>
        <span class="aemet-day-date">${escapeHTML(d.fecha_corta)}</span>
        <span class="aemet-day-icon">${escapeHTML(d.icono)}</span>
        <div class="aemet-day-desc">${escapeHTML(d.descripcion)}</div>
        <div class="aemet-temp-bar">
          <span class="t-min">${escapeHTML(d.t_min)}°</span>
          <div class="temp-track"><div class="temp-fill" style="margin-left: ${left.toFixed(0)}%; width: ${Math.min(100 - left, width).toFixed(0)}%;"></div></div>
          <span class="t-max">${escapeHTML(d.t_max)}°</span>
        </div>
        <div class="aemet-day-sub">
          <span title="Probabilidad de lluvia">💧 ${escapeHTML(d.lluvia)}</span>
          <span title="Viento">💨 ${escapeHTML(d.viento)}</span>
          ${d.uv ? `<span title="Índice UV máximo">☀️ UV ${escapeHTML(d.uv)}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');

  const actividadesHTML = actividades.map((act) => `
    <div class="activity-card">
      <span class="activity-icon">${escapeHTML(act.icono)}</span>
      <div>
        <span class="activity-title">${escapeHTML(act.titulo)}</span>
        <strong class="activity-status">${escapeHTML(act.estado)}</strong>
        <p class="activity-detail">${escapeHTML(act.detalle)}</p>
      </div>
    </div>
  `).join('');

  const pantanosHTML = (embalses.pantanos || []).map((p) => `
    <div class="embalse-item">
      <div class="embalse-info">
        <span class="embalse-name">${escapeHTML(p.nombre)}</span>
        <span class="embalse-val">${escapeHTML(p.embalsado)} / ${escapeHTML(p.capacidad)} (${escapeHTML(p.porcentaje)})</span>
      </div>
      <div class="embalse-track">
        <div class="embalse-fill" style="width: ${escapeHTML(p.porcentaje)};"></div>
      </div>
    </div>
  `).join('');

  const diaResumen = (d, etiqueta) => d ? `
                        <article class="day-summary-card">
                            <span class="mini-label">${escapeHTML(etiqueta)}</span>
                            <div class="day-summary-main">
                                <span class="day-summary-icon">${escapeHTML(d.icono)}</span>
                                <div>
                                    <strong>${escapeHTML(d.t_max)}° / ${escapeHTML(d.t_min)}°</strong>
                                    <span>${escapeHTML(d.descripcion)}</span>
                                </div>
                            </div>
                            <p>💧 Lluvia ${escapeHTML(d.lluvia)} · 💨 ${escapeHTML(d.viento)}</p>
                        </article>` : '';

  const findeHTML = finde.map((d) => diaResumen(d, `${d.dia_semana} ${d.fecha_corta}`)).join('');

  // Preguntas frecuentes: respuestas generadas con los datos de cada build
  const faqs = [];
  if (manana) {
    faqs.push({
      q: '¿Qué temperatura hará mañana en Alhaurín el Grande?',
      a: `Para mañana, ${fechaLarga(mananaISO)}, AEMET prevé una máxima de ${manana.t_max} °C y una mínima de ${manana.t_min} °C (${minuscula(manana.descripcion)}).`
    });
    faqs.push({
      q: '¿Lloverá mañana en Alhaurín el Grande?',
      a: `${lluviaEnTexto(manana.lluvia).replace(/^./, (c) => c.toUpperCase())} para mañana según AEMET${num(manana.lluvia) >= 60 ? '; conviene llevar paraguas' : ''}.`
    });
  }
  if (viento) {
    faqs.push({
      q: '¿Cuánto viento hará hoy en Alhaurín el Grande?',
      a: `AEMET prevé hoy ${vientoEnTexto(viento)}. En la parte de arriba de esta página tienes el viento y las rachas en tiempo real.`
    });
  }
  if (finde.length) {
    faqs.push({
      q: '¿Lloverá este fin de semana en Alhaurín el Grande?',
      a: finde.map((d) => `${d.dia_semana}: ${lluviaEnTexto(d.lluvia)}, ${d.t_max}° de máxima`).join('. ') + '.'
    });
  }
  if (solLuna.orto && solLuna.ocaso) {
    faqs.push({
      q: '¿A qué hora amanece y anochece hoy en Alhaurín el Grande?',
      a: `Hoy el sol sale a las ${solLuna.orto.replace(/\s*h$/, '')} y se pone a las ${solLuna.ocaso.replace(/\s*h$/, '')}${solLuna.horas_luz ? `, con ${solLuna.horas_luz} de luz` : ''}.`
    });
  }
  const climaBloque = renderClima(clima);
  faqs.push(...climaBloque.faqs);

  const faqHTML = faqs.map((f) => `
                        <details class="faq-item">
                            <summary>${escapeHTML(f.q)}</summary>
                            <p>${escapeHTML(f.a)}</p>
                        </details>`).join('');
  const faqLD = faqs.length ? `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }))
  }).replace(/</g, '\\u003c')}</script>` : '';

  const polenFallback = polen
    ? `<p class="pollen-fallback">${escapeHTML(polen.estado)} · ${escapeHTML(polen.detalle)}</p>`
    : '<p class="pollen-fallback">Cargando niveles de polen…</p>';

  const htmlContent = `<!doctype html>
<html lang="es">

<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <title>El tiempo en Alhaurín el Grande hoy y a 7 días — Alhaurín al Día</title>
    <meta name="description"
        content="El tiempo en Alhaurín el Grande ahora mismo y los próximos 7 días: temperatura, sensación térmica, lluvia, viento, índice UV, polen, sol y luna y el clima del pueblo mes a mes." />
    <meta name="theme-color" content="#1c211a" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://alhaurinaldia.es/tiempo/">

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Alhaurín al Día" />
    <meta property="og:title" content="El tiempo en Alhaurín el Grande — Ahora y a 7 días" />
    <meta property="og:description" content="Tiempo en directo, previsión oficial de AEMET a 7 días, polen, sol y luna y climatología de Alhaurín el Grande." />
    <meta property="og:url" content="https://alhaurinaldia.es/tiempo/" />
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="El tiempo en Alhaurín el Grande — Ahora y a 7 días">
    <meta name="twitter:description" content="Tiempo en directo, previsión oficial de AEMET a 7 días, polen, sol y luna y climatología de Alhaurín el Grande.">
    <meta name="twitter:image" content="https://alhaurinaldia.es/assets/favicon.svg">
    <link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="preconnect" href="https://api.open-meteo.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap">
    <link rel="stylesheet" href="../css/styles.css">
    <link rel="stylesheet" href="../css/mobile.css">
    <link rel="stylesheet" href="../css/ads.css">
    <link rel="stylesheet" href="../css/home-live.css">
    ${faqLD}
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://alhaurinaldia.es/' },
        { '@type': 'ListItem', position: 2, name: 'El tiempo en Alhaurín el Grande', item: 'https://alhaurinaldia.es/tiempo/' },
      ],
    })}</script>
    ${CF_ANALYTICS_SNIPPET}
</head>

<body>
    <div class="topbar">
        <div class="container">
            <span>Guía local independiente de Alhaurín el Grande</span>
            <span>Tiempo en vivo · AEMET Oficial · Open-Meteo</span>
        </div>
    </div>

    <header>
        <div class="container">
            ${renderNav()}
        </div>
    </header>

    <main class="weather-page">
        <!-- CABECERA COMPACTA -->
        <section class="weather-compact-header">
            <div class="container">
                <div class="weather-header-shell">
                    <div>
                        <span class="section-kicker">Meteorología en tiempo real</span>
                        <h1>El tiempo en Alhaurín el Grande</h1>
                    </div>
                    <div class="${liveBadgeClass}">
                        ${liveDotHTML}
                        <span>${liveBadgeText}</span>
                    </div>
                </div>

                <!-- SUBNAVEGACIÓN DEL HUB DE TIEMPO -->
                <div class="tracking-tabs-bar" role="tablist" aria-label="Secciones de Tiempo">
                    <a class="tab-btn active" href="./" role="tab" aria-selected="true">
                        <span>📅</span> Previsión 7 días
                    </a>
                    <a class="tab-btn" href="./prevision-horaria/" role="tab" aria-selected="false">
                        <span>🕐</span> Previsión por horas
                    </a>
                    <a class="tab-btn" href="./comparador/" role="tab" aria-selected="false">
                        <span>📊</span> Comparador de modelos
                    </a>
                    <a class="tab-btn" href="./agro/" role="tab" aria-selected="false">
                        <span>🌾</span> Agro Meteo
                    </a>
                    <a class="tab-btn" href="./radar/" role="tab" aria-selected="false">
                        <span>🛰️</span> Radar de lluvia
                    </a>
                    <a class="tab-btn" href="../seguimiento/" role="tab" aria-selected="false">
                        <span>📡</span> En directo
                    </a>
                </div>
            </div>
        </section>

        <section class="weather-main-section">
            <div class="container">
                <p class="weather-summary-text">${escapeHTML(resumenHoy)}</p>

                <!-- AHORA MISMO (Open-Meteo, en el navegador) + HOY SEGÚN AEMET -->
                <div class="weather-now-grid">
                    <article class="now-card" id="now-panel" aria-live="polite">
                        <div class="now-head">
                            <span class="mini-label">Ahora mismo</span>
                            <span class="now-time" data-now="hora"></span>
                        </div>
                        <div class="now-main">
                            <span class="weather-huge-icon" data-now="icono">🌡️</span>
                            <div>
                                <div class="weather-huge-temp"><span data-now="temp">--</span>°C</div>
                                <div class="weather-sky-text"><span data-now="estado">Cargando datos en directo…</span> · Sensación <span data-now="sensacion">--</span>°</div>
                            </div>
                        </div>
                        <dl class="now-metrics">
                            <div><dt>Humedad</dt><dd><span data-now="humedad">--</span> %</dd></div>
                            <div><dt>Viento</dt><dd><span data-now="viento">--</span> km/h <span data-now="dir"></span></dd></div>
                            <div><dt>Rachas</dt><dd><span data-now="rachas">--</span> km/h</dd></div>
                            <div><dt>Presión</dt><dd><span data-now="presion">--</span> hPa</dd></div>
                            <div><dt>Índice UV</dt><dd><span data-now="uv">--</span> <small data-now="uvlabel"></small></dd></div>
                            <div><dt>Visibilidad</dt><dd><span data-now="visibilidad">--</span> km</dd></div>
                            <div><dt>Nubosidad</dt><dd><span data-now="nubes">--</span> %</dd></div>
                            <div><dt>Precipitación</dt><dd><span data-now="lluvia">--</span> mm</dd></div>
                        </dl>
                        <p class="now-source">Modelo de alta resolución vía Open-Meteo (AEMET HARMONIE, ECMWF y otros), se actualiza cada 15 minutos.</p>
                    </article>

                    <article class="weather-spotlight-card is-in-grid">
                        <span class="mini-label">Hoy según AEMET</span>
                        <div class="weather-spotlight-main">
                            <span class="weather-huge-icon">${escapeHTML(icono)}</span>
                            <div>
                                <div class="weather-huge-temp">${escapeHTML(tempMax)}° <small>/ ${escapeHTML(tempMin)}°</small></div>
                                <div class="weather-sky-text">${escapeHTML(descripcion)}</div>
                            </div>
                        </div>
                        <div class="weather-metrics-pills">
                            <div class="metric-pill"><span class="metric-icon">💧</span><span><strong>Lluvia:</strong> ${escapeHTML(lluvia || '--')} prob.</span></div>
                            <div class="metric-pill"><span class="metric-icon">💨</span><span><strong>Viento:</strong> ${escapeHTML(viento || '--')}</span></div>
                            ${uv ? `<div class="metric-pill"><span class="metric-icon">☀️</span><span><strong>UV máx.:</strong> ${escapeHTML(uv)} (${escapeHTML(uvLabel(uv))})</span></div>` : ''}
                            ${solLuna.orto ? `<div class="metric-pill"><span class="metric-icon">🌅</span><span>${escapeHTML(solLuna.orto)} · 🌇 ${escapeHTML(solLuna.ocaso)}</span></div>` : ''}
                        </div>
                    </article>
                </div>

                <!-- PRÓXIMAS 24 HORAS -->
                <section class="hourly-section" aria-labelledby="hourly-title">
                    <div class="section-title compact">
                        <div>
                            <span class="section-kicker">Hora a hora</span>
                            <h2 id="hourly-title">Próximas 24 horas</h2>
                        </div>
                        <a class="read-more" href="./prevision-horaria/">Gráficas y 7 días por horas →</a>
                    </div>
                    <div class="hourly-strip" id="hourly-strip" tabindex="0" aria-label="Previsión por horas, desplazable">
                        <p class="hourly-loading">Cargando previsión por horas…</p>
                    </div>
                </section>

                <!-- MAÑANA Y FIN DE SEMANA -->
                ${manana || finde.length ? `
                <section class="forecast-pair-section" aria-labelledby="pair-title">
                    <div class="section-title compact">
                        <div>
                            <span class="section-kicker">AEMET Oficial</span>
                            <h2 id="pair-title">Mañana y fin de semana</h2>
                        </div>
                    </div>
                    <div class="forecast-pair-grid">
                        ${diaResumen(manana, `Mañana · ${manana ? manana.dia_semana : ''}`)}
                        ${findeHTML}
                    </div>
                </section>` : ''}

                <!-- RECOMENDACIONES Y POLEN -->
                <div class="weather-extras-grid">
                    <article class="weather-extra-card">
                        <div class="extra-card-header">
                            <span class="mini-label">Consejos prácticos</span>
                            <h2>¿Qué hago hoy en Alhaurín?</h2>
                        </div>
                        <div class="activities-list">
                            ${actividadesHTML}
                        </div>
                    </article>

                    <article class="weather-extra-card">
                        <div class="extra-card-header">
                            <span class="mini-label">Alergias</span>
                            <h2>Polen hoy en Alhaurín</h2>
                        </div>
                        <div class="pollen-list" id="pollen-panel">
                            ${polenFallback}
                        </div>
                        <p class="pollen-note">Concentración máxima prevista hoy (granos/m³) según el servicio europeo Copernicus CAMS. Niveles orientativos según los umbrales de la Red Española de Aerobiología.</p>
                    </article>
                </div>

                <!-- SOL Y LUNA -->
                <section class="astro-section" aria-labelledby="astro-title">
                    <div class="section-title compact">
                        <div>
                            <span class="section-kicker">Astronomía local</span>
                            <h2 id="astro-title">Sol y Luna hoy en Alhaurín</h2>
                        </div>
                    </div>
                    <div class="astro-grid">
                        <article class="weather-extra-card astro-card" id="astro-sun">
                            <h3>☀️ Trayectoria del sol</h3>
                            <svg class="astro-arc" viewBox="0 0 300 130" aria-hidden="true">
                                <path d="M20,115 Q150,-35 280,115" class="astro-arc-path"/>
                                <line x1="10" x2="290" y1="115" y2="115" class="astro-horizon"/>
                                <circle class="astro-dot astro-dot-sun" cx="20" cy="115" r="9" data-astro="sun-dot" style="display:none"/>
                            </svg>
                            <div class="astro-times">
                                <span>🌅 Salida <strong data-astro="sun-rise">${escapeHTML((solLuna.orto || '--').replace(/\s*h$/, ''))}</strong></span>
                                <span>🌇 Puesta <strong data-astro="sun-set">${escapeHTML((solLuna.ocaso || '--').replace(/\s*h$/, ''))}</strong></span>
                            </div>
                            <p class="astro-meta"><span data-astro="sun-state">${escapeHTML(solLuna.horas_luz ? `${solLuna.horas_luz} de luz` : '')}</span></p>
                        </article>
                        <article class="weather-extra-card astro-card" id="astro-moon">
                            <h3><span data-astro="moon-icon">${escapeHTML(solLuna.icono_luna || '🌙')}</span> Trayectoria de la luna</h3>
                            <svg class="astro-arc" viewBox="0 0 300 130" aria-hidden="true">
                                <path d="M20,115 Q150,-35 280,115" class="astro-arc-path"/>
                                <line x1="10" x2="290" y1="115" y2="115" class="astro-horizon"/>
                                <circle class="astro-dot astro-dot-moon" cx="20" cy="115" r="8" data-astro="moon-dot" style="display:none"/>
                            </svg>
                            <div class="astro-times">
                                <span>Sale <strong data-astro="moon-rise">--</strong></span>
                                <span>Se pone <strong data-astro="moon-set">--</strong></span>
                            </div>
                            <p class="astro-meta"><strong data-astro="moon-phase">${escapeHTML(solLuna.fase_luna || '')}</strong> <span data-astro="moon-state"></span></p>
                        </article>
                    </div>
                </section>

                <!-- PREVISIÓN A 7 DÍAS NATIVA AEMET -->
                <div class="aemet-7days-section">
                    <div class="section-title compact">
                        <div>
                            <span class="section-kicker">AEMET Oficial</span>
                            <h2>Previsión a 7 días</h2>
                        </div>
                    </div>
                    <div class="aemet-7days-grid">
                        ${semanaHTML}
                    </div>
                </div>

                <!-- MUNICIPIOS CERCANOS -->
                <section class="nearby-section" aria-labelledby="nearby-title">
                    <div class="section-title compact">
                        <div>
                            <span class="section-kicker">Valle del Guadalhorce y Costa</span>
                            <h2 id="nearby-title">El tiempo hoy en los pueblos de alrededor</h2>
                        </div>
                        <a class="read-more" href="./comparador/">Comparar municipios →</a>
                    </div>
                    <div class="nearby-grid" id="nearby-grid">
                        <p class="hourly-loading">Cargando municipios cercanos…</p>
                    </div>
                </section>

                <!-- SECCIÓN EMBALSES DEL GUADALHORCE -->
                <div class="embalses-section">
                    <div class="section-title compact">
                        <div>
                            <span class="section-kicker">Recursos hídricos</span>
                            <h2>Agua embalsada en el Guadalhorce (${escapeHTML(embalses.porcentaje || '--')})</h2>
                        </div>
                    </div>
                    <div class="embalses-card">
                        <div class="embalses-summary">
                            <span>Total cuenca Guadalhorce-Limites: <strong>${escapeHTML(embalses.total_embalsado_hm3 || '--')} / ${escapeHTML(embalses.total_capacidad_hm3 || '--')} hm³</strong></span>
                        </div>
                        <div class="embalses-grid">
                            ${pantanosHTML}
                        </div>
                    </div>
                </div>

                ${climaBloque.html}

                ${faqs.length ? `
                <section class="faq-section" aria-labelledby="faq-title">
                    <div class="section-title compact">
                        <div>
                            <span class="section-kicker">Dudas habituales</span>
                            <h2 id="faq-title">Preguntas frecuentes sobre el tiempo en Alhaurín</h2>
                        </div>
                    </div>
                    <div class="faq-list">${faqHTML}
                    </div>
                </section>` : ''}

                <!-- TOOLBAR DE FUENTES Y ACCESOS RÁPIDOS -->
                <div class="weather-footer-actions">
                    <a class="btn btn-primary" href="../seguimiento/">📡 Ver En Directo (Radar, Rayos, Tráfico y Calidad del Aire) →</a>
                    <a class="btn btn-secondary"
                        href="https://web2.aemet.es/es/eltiempo/prediccion/municipios/alhaurin-el-grande-id29008"
                        target="_blank" rel="noopener noreferrer">AEMET.es ↗</a>
                    <a class="btn btn-secondary" href="../avisos/">Avisos locales e incidencias →</a>
                </div>
            </div>
        </section>
    </main>

    ${SITE_FOOTER_HTML}

    <script src="../js/app.js" defer></script>
    <script src="../js/vendor/suncalc.js" defer></script>
    <script src="../js/tiempo-live.js" defer></script>
</body>

</html>
`;

  fs.writeFileSync(TIEMPO_HTML_PATH, htmlContent, 'utf8');
  console.log('tiempo/index.html regenerado: ahora mismo, 24 h, mañana/finde, polen, sol y luna, AEMET 7 días, municipios, embalses, clima y FAQ.');
}

renderTiempoPage();
