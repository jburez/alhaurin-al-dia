const fs = require('fs');
const path = require('path');

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
      viento: 'Poniente suave',
      uv: '9'
    },
    semana: []
  });

  const hoy = weatherData.hoy || {};
  const semana = weatherData.semana || [];

  const tempMax = hoy.t_max || '35';
  const tempMin = hoy.t_min || '24';
  const icono = hoy.icono || '☀️';
  const descripcion = hoy.descripcion || 'Despejado';
  const lluvia = hoy.lluvia || '0%';
  const viento = hoy.viento || 'Flojo';
  const uv = hoy.uv || '8';

  const fechaStr = new Date(weatherData.actualizado || Date.now()).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // Generar cuadrícula nativa a 7 días de AEMET
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

  const htmlContent = `<!doctype html>
<html lang="es">

<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <title>El tiempo en Alhaurín el Grande — Alhaurín al Día</title>
    <meta name="description"
        content="Previsión meteorológica detallada de Alhaurín el Grande en tiempo real. Datos oficiales AEMET a 7 días y widgets de Andalmet." />
    <meta name="theme-color" content="#1c211a" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://alhaurinaldia.es/tiempo/">

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Alhaurín al Día" />
    <meta property="og:title" content="El tiempo en Alhaurín el Grande — Previsión a 7 días" />
    <meta property="og:description" content="Previsión meteorológica oficial de Alhaurín el Grande con AEMET y Andalmet." />
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
            <nav aria-label="Navegación principal">
                <a class="logo" href="../" aria-label="Alhaurín al Día">
                    <span class="logo-mark">A</span>
                    <span><strong>Alhaurín al Día</strong><span>Información local útil</span></span>
                </a>

                <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-menu"
                    aria-label="Abrir menú de navegación">
                    <span></span>
                    <span></span>
                    <span></span>
                </button>

                <div class="nav-links" id="main-menu">
                    <a href="../noticias/">Noticias</a>
                    <a href="../guia-util/">Guía útil</a>
                    <a href="../avisos/">Avisos</a>
                    <a href="../boletin-oficial/">Boletín oficial</a>
                    <a href="./">Tiempo</a>
                    <a href="../planes/">Planes</a>
                    <a href="../comercios/">Comercios</a>
                    <a href="../anunciarse/" class="nav-cta">Anunciarse</a>
                </div>
            </nav>
        </div>
    </header>

    <main class="weather-page">
        <!-- CABECERA COMPACTA SIN HERO INNECESARIO -->
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

                <!-- PREVISIÓN A 7 DÍAS NATIVA AEMET (ESTILO EDITORIAL ALHAURÍN AL DÍA) -->
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

                <!-- SECCIÓN WIDGETS PROMINENTES DE ANDALMET -->
                <div class="andalmet-section">
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
                    <a class="btn btn-secondary" href="https://andalmet.es/el-tiempo-en/alhaurin-el-grande"
                        target="_blank" rel="noopener noreferrer">Abrir Andalmet.es ↗</a>
                    <a class="btn btn-secondary"
                        href="https://web2.aemet.es/es/eltiempo/prediccion/municipios/alhaurin-el-grande-id29008"
                        target="_blank" rel="noopener noreferrer">Abrir AEMET.es ↗</a>
                    <a class="btn btn-secondary" href="../avisos/">Avisos locales e incidencias →</a>
                </div>
            </div>
        </section>
    </main>

    <footer>
        <div class="container">
            <span>© 2026 Alhaurín al Día · Guía local independiente</span>
            <div class="footer-links">
                <a href="../noticias/">Noticias</a>
                <a href="../guia-util/">Guía útil</a>
                <a href="../avisos/">Avisos</a>
                <a href="../boletin-oficial/">Boletín oficial</a>
                <a href="./">Tiempo</a>
                <a href="../planes/">Planes</a>
                <a href="../comercios/">Comercios</a>
                <a href="../anunciarse/">Anunciarse</a>
            </div>
        </div>
    </footer>

    <script src="../js/app.js" defer></script>
</body>

</html>
`;

  fs.writeFileSync(TIEMPO_HTML_PATH, htmlContent, 'utf8');
  console.log('tiempo/index.html regenerado estáticamente con previsión AEMET 7 días y Andalmet.');
}

renderTiempoPage();
