const fs = require('fs');
const path = require('path');
const { SITE_FOOTER_HTML } = require('./lib/footer');
const { CF_ANALYTICS_SNIPPET } = require('./lib/analytics');
const { renderNav } = require('./lib/nav');

const ROOT = path.join(__dirname, '..');
const TIEMPO_HTML_PATH = path.join(ROOT, 'tiempo', 'index.html');
const TIEMPO_JSON_PATH = path.join(ROOT, 'data', 'tiempo-aemet.json');

function readJSON(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function escapeHTML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderTiempoPage() {
  const weatherData = readJSON(TIEMPO_JSON_PATH, {
    actualizado: new Date().toISOString(),
    hoy: {
      t_max: '35',
      t_min: '24',
      icono: '☀️',
      descripcion: 'Despejado',
      lluvia: '0%',
      viento: 'Flojo',
      uv: '9'
    },
    semana: [],
    actividades: [],
    sol_luna: {},
    embalses: {}
  });

  const hoy = weatherData.hoy || {};
  const semana = weatherData.semana || [];
  const actividades = weatherData.actividades || [];
  const solLuna = weatherData.sol_luna || {};
  const embalses = weatherData.embalses || {};

  const tempMax = hoy.t_max || '35';
  const tempMin = hoy.t_min || '24';
  const icono = hoy.icono || '☀️';
  const descripcion = hoy.descripcion || 'Despejado';
  const lluvia = hoy.lluvia || '0%';
  const viento = hoy.viento || 'Flojo';
  const uv = hoy.uv || '9';

  const fechaStr = new Date(weatherData.actualizado || Date.now()).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Generar tarjetas de predicción nativa a 7 días de AEMET
  const semanaHTML = semana.map((d, index) => {
    const isToday = index === 0;
    return `
      <div class="aemet-day-card ${isToday ? 'is-today' : ''}">
        <span class="aemet-day-name">${isToday ? 'Hoy' : escapeHTML(d.dia_semana)}</span>
        <span class="aemet-day-date">${escapeHTML(d.fecha_corta)}</span>
        <span class="aemet-day-icon">${escapeHTML(d.icono)}</span>
        <div class="aemet-day-desc">${escapeHTML(d.descripcion)}</div>
        <div class="aemet-temp-bar">
          <span class="t-min">${escapeHTML(d.t_min)}°</span>
          <div class="temp-track"><div class="temp-fill" style="width: 75%;"></div></div>
          <span class="t-max">${escapeHTML(d.t_max)}°</span>
        </div>
        <div class="aemet-day-sub">
          <span>💧 ${escapeHTML(d.lluvia)}</span>
          <span>💨 ${escapeHTML(d.viento)}</span>
        </div>
      </div>
    `;
  }).join('');

  // Generar HTML de Actividades recomendadas
  const actividadesHTML = actividades.map(act => `
    <div class="activity-card">
      <span class="activity-icon">${escapeHTML(act.icono)}</span>
      <div>
        <span class="activity-title">${escapeHTML(act.titulo)}</span>
        <strong class="activity-status">${escapeHTML(act.estado)}</strong>
        <p class="activity-detail">${escapeHTML(act.detalle)}</p>
      </div>
    </div>
  `).join('');

  // Generar HTML de Embalses
  const pantanosHTML = (embalses.pantanos || []).map(p => `
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

  const htmlContent = `<!doctype html>
<html lang="es">

<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <title>El tiempo en Alhaurín el Grande — Alhaurín al Día</title>
    <meta name="description"
        content="Previsión meteorológica detallada de Alhaurín el Grande en tiempo real. Datos oficiales AEMET a 7 días, Sol y Luna, actividades y widgets de Andalmet." />
    <meta name="theme-color" content="#1c211a" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://alhaurinaldia.es/tiempo/">

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Alhaurín al Día" />
    <meta property="og:title" content="El tiempo en Alhaurín el Grande — Previsión a 7 días" />
    <meta property="og:description" content="Previsión meteorológica oficial de Alhaurín el Grande con AEMET, Sol y Luna y Andalmet." />
    <meta property="og:url" content="https://alhaurinaldia.es/tiempo/" />
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="El tiempo en Alhaurín el Grande — Previsión a 7 días">
    <meta name="twitter:description" content="Previsión meteorológica oficial de Alhaurín el Grande con AEMET y Andalmet.">
    <meta name="twitter:image" content="https://alhaurinaldia.es/assets/favicon.svg">
    <link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap">
    <link rel="stylesheet" href="../css/styles.css">
    <link rel="stylesheet" href="../css/mobile.css">
    <link rel="stylesheet" href="../css/ads.css">
    <link rel="stylesheet" href="../css/home-live.css">
    ${CF_ANALYTICS_SNIPPET}
</head>

<body>
    <div class="topbar">
        <div class="container">
            <span>Guía local independiente de Alhaurín el Grande</span>
            <span>Tiempo en vivo · AEMET Oficial · Andalmet</span>
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
                    <div class="weather-live-badge">
                        <span class="live-dot"></span>
                        <span>Actualizado ${escapeHTML(fechaStr)}</span>
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
                    <a class="tab-btn" href="../seguimiento/" role="tab" aria-selected="false">
                        <span>📡</span> En directo
                    </a>
                </div>
            </div>
        </section>

        <!-- SECCIÓN PRINCIPAL: DATOS NATIVOS AEMET A 7 DÍAS -->
        <section class="weather-main-section">
            <div class="container">
                <!-- PANEL SPOTLIGHT HOY -->
                <div class="weather-spotlight-card">
                    <div class="weather-spotlight-main">
                        <span class="weather-huge-icon">${escapeHTML(icono)}</span>
                        <div>
                            <div class="weather-huge-temp">${escapeHTML(tempMax)}°C</div>
                            <div class="weather-sky-text">${escapeHTML(descripcion)} · Mínima ${escapeHTML(tempMin)}°C</div>
                        </div>
                    </div>
                    <div class="weather-metrics-pills">
                        <div class="metric-pill">
                            <span class="metric-icon">🌡️</span>
                            <span><strong>Máx/Mín:</strong> ${escapeHTML(tempMax)}° / ${escapeHTML(tempMin)}°C</span>
                        </div>
                        <div class="metric-pill">
                            <span class="metric-icon">💧</span>
                            <span><strong>Lluvia:</strong> ${escapeHTML(lluvia)} prob.</span>
                        </div>
                        <div class="metric-pill">
                            <span class="metric-icon">💨</span>
                            <span><strong>Viento:</strong> ${escapeHTML(viento)}</span>
                        </div>
                        ${uv ? `<div class="metric-pill"><span class="metric-icon">☀️</span><span><strong>Índice UV:</strong> ${escapeHTML(uv)} (Muy Alto)</span></div>` : ''}
                    </div>
                </div>

                <!-- SECCIÓN COMBO: RECOMENDACIONES DIARIAS Y SOL/LUNA -->
                <div class="weather-extras-grid">
                    <!-- ACTIVIDADES RECOMENDADAS -->
                    <article class="weather-extra-card">
                        <div class="extra-card-header">
                            <span class="mini-label">Consejos prácticos</span>
                            <h2>Recomendaciones del día</h2>
                        </div>
                        <div class="activities-list">
                            ${actividadesHTML}
                        </div>
                    </article>

                    <!-- TARJETA ARCO SOL Y LUNA -->
                    <article class="weather-extra-card">
                        <div class="extra-card-header">
                            <span class="mini-label">Astronomía local</span>
                            <h2>Sol y Luna en Alhaurín</h2>
                        </div>
                        <div class="sun-moon-body">
                            <div class="sun-arc-box">
                                <div class="sun-times">
                                    <span>🌅 Orto: <strong>${escapeHTML(solLuna.orto || '07:36 h')}</strong></span>
                                    <span>🌇 Ocaso: <strong>${escapeHTML(solLuna.ocaso || '21:08 h')}</strong></span>
                                </div>
                                <div class="daylight-badge">☀️ Horas de sol: <strong>${escapeHTML(solLuna.horas_luz || '13h 32m')}</strong></div>
                            </div>
                            <div class="moon-box">
                                <span class="moon-icon">${escapeHTML(solLuna.icono_luna || '🌓')}</span>
                                <div>
                                    <span class="moon-title">Fase Lunar Actual</span>
                                    <strong>${escapeHTML(solLuna.fase_luna || 'Luna Creciente (78%)')}</strong>
                                </div>
                            </div>
                        </div>
                    </article>
                </div>

                <!-- PREVISIÓN A 7 DÍAS NATIVA AEMET -->
                <div class="aemet-7days-section">
                    <div class="section-title compact">
                        <div>
                            <span class="section-kicker">AEMET Oficial</span>
                            <h2>Previsión nativa a 7 días</h2>
                        </div>
                    </div>
                    <div class="aemet-7days-grid">
                        ${semanaHTML}
                    </div>
                </div>

                <!-- SECCIÓN EMBALSES DEL GUADALHORCE -->
                <div class="embalses-section">
                    <div class="section-title compact">
                        <div>
                            <span class="section-kicker">Recursos hídricos</span>
                            <h2>Agua embalsada en el Guadalhorce (${escapeHTML(embalses.porcentaje || '34.4%')})</h2>
                        </div>
                    </div>
                    <div class="embalses-card">
                        <div class="embalses-summary">
                            <span>Total cuenca Guadalhorce-Limites: <strong>${escapeHTML(embalses.total_embalsado_hm3 || '98.4')} / ${escapeHTML(embalses.total_capacidad_hm3 || '286.2')} hm³</strong></span>
                        </div>
                        <div class="embalses-grid">
                            ${pantanosHTML}
                        </div>
                    </div>
                </div>

                <!-- SECCIÓN WIDGETS PROMINENTES DE ANDALMET -->
                <div class="andalmet-section" style="margin-top: 32px;">
                    <div class="section-title compact">
                        <div>
                            <span class="section-kicker">Andalmet Guadalhorce</span>
                            <h2>Previsión ampliada Andalmet</h2>
                        </div>
                    </div>
                    <div class="andalmet-prominent-grid">
                        <article class="andalmet-prominent-card">
                            <div class="andalmet-card-header">
                                <div>
                                    <span class="mini-label">Hoy</span>
                                    <h3>Previsión diaria Andalmet</h3>
                                </div>
                                <a class="read-more" href="https://andalmet.es/el-tiempo-en/alhaurin-el-grande"
                                    target="_blank" rel="noopener noreferrer">Andalmet.es →</a>
                            </div>
                            <div class="andalmet-prominent-frame">
                                <iframe src="https://andalmet.es/widget/alhaurin-el-grande?size=full" width="100%"
                                    height="220" frameborder="0" loading="lazy"
                                    title="Tiempo en Alhaurín el Grande - Andalmet"></iframe>
                            </div>
                        </article>

                        <article class="andalmet-prominent-card">
                            <div class="andalmet-card-header">
                                <div>
                                    <span class="mini-label">Semana</span>
                                    <h3>Evolución semanal Andalmet</h3>
                                </div>
                                <a class="read-more" href="https://andalmet.es/el-tiempo-en/alhaurin-el-grande"
                                    target="_blank" rel="noopener noreferrer">Ver gráfica →</a>
                            </div>
                            <div class="andalmet-prominent-frame">
                                <iframe src="https://andalmet.es/widget/alhaurin-el-grande?size=weekly" width="100%"
                                    height="240" frameborder="0" loading="lazy"
                                    title="Previsión semanal en Alhaurín el Grande - Andalmet"></iframe>
                            </div>
                        </article>
                    </div>
                </div>

                <!-- TOOLBAR DE FUENTES Y ACCESOS RÁPIDOS -->
                <div class="weather-footer-actions">
                    <a class="btn btn-primary" href="../seguimiento/">📡 Ver En Directo (Radar, Rayos, Tráfico y Calidad del Aire) →</a>
                    <a class="btn btn-secondary" href="https://andalmet.es/el-tiempo-en/alhaurin-el-grande"
                        target="_blank" rel="noopener noreferrer">Andalmet.es ↗</a>
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
</body>

</html>
`;

  fs.writeFileSync(TIEMPO_HTML_PATH, htmlContent, 'utf8');
  console.log('tiempo/index.html regenerado estáticamente con Actividades, Sol/Luna, Embalses, AEMET 7 días y Andalmet.');
}

renderTiempoPage();
