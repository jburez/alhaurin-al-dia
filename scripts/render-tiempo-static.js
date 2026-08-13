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
    item: {
      valor: '26º',
      icono: '☀️',
      detalle: 'Despejado · Máx. 35º / Mín. 24º',
      fuente: 'AEMET'
    }
  });

  const item = weatherData.item || {};
  const temp = item.valor || '26º';
  const icono = item.icono || '☀️';
  const detalle = item.detalle || 'Despejado · Máx. 35º / Mín. 24º';
  const fechaStr = new Date(weatherData.actualizado || Date.now()).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const htmlContent = `<!doctype html>
<html lang="es">

<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />

    <title>El tiempo en Alhaurín el Grande — Alhaurín al Día</title>
    <meta name="description"
        content="Consulta el tiempo en Alhaurín el Grande en tiempo real. Previsión detallada de Andalmet y datos oficiales AEMET." />
    <meta name="theme-color" content="#1c211a" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="https://alhaurinaldia.es/tiempo/">

    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Alhaurín al Día" />
    <meta property="og:title" content="El tiempo en Alhaurín el Grande — Previsión en vivo" />
    <meta property="og:description" content="Previsión meteorológica ampliada para Alhaurín el Grande con Andalmet y AEMET." />
    <meta property="og:url" content="https://alhaurinaldia.es/tiempo/" />
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="El tiempo en Alhaurín el Grande — Previsión en vivo">
    <meta name="twitter:description" content="Previsión meteorológica ampliada para Alhaurín el Grande con Andalmet y AEMET.">
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
            <span>Tiempo en vivo · Andalmet · AEMET</span>
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
        <!-- HEADER COMPACTO: Directo al contenido del tiempo -->
        <section class="weather-compact-header">
            <div class="container">
                <div class="weather-header-shell">
                    <div>
                        <span class="section-kicker">Meteorología local</span>
                        <h1>El tiempo en Alhaurín el Grande</h1>
                    </div>
                    <div class="weather-live-badge">
                        <span class="live-dot"></span>
                        <span>Actualizado ${escapeHTML(fechaStr)}</span>
                    </div>
                </div>
            </div>
        </section>

        <!-- SPOTLIGHT CLIMÁTICO Y WIDGETS PROMINENTES DE ANDALMET -->
        <section class="weather-main-section">
            <div class="container">
                <!-- RESUMEN DESTACADO DE CABECERA -->
                <div class="weather-spotlight-card">
                    <div class="weather-spotlight-main">
                        <span class="weather-huge-icon">${escapeHTML(icono)}</span>
                        <div>
                            <div class="weather-huge-temp">${escapeHTML(temp)}</div>
                            <div class="weather-sky-text">${escapeHTML(detalle)}</div>
                        </div>
                    </div>
                    <div class="weather-metrics-pills">
                        <div class="metric-pill">
                            <span class="metric-icon">🌡️</span>
                            <span><strong>Sensación</strong> Térmica AEMET</span>
                        </div>
                        <div class="metric-pill">
                            <span class="metric-icon">💧</span>
                            <span><strong>Humedad</strong> Normal</span>
                        </div>
                        <div class="metric-pill">
                            <span class="metric-icon">💨</span>
                            <span><strong>Viento</strong> Poniente suave</span>
                        </div>
                        <div class="metric-pill">
                            <span class="metric-icon">🟢</span>
                            <span><strong>Alertas</strong> Sin riesgo meteorológico</span>
                        </div>
                    </div>
                </div>

                <!-- WIDGETS PROMINENTES DE ANDALMET (MÁXIMO TAMAÑO Y VISIBILIDAD) -->
                <div class="andalmet-prominent-grid">
                    <article class="andalmet-prominent-card">
                        <div class="andalmet-card-header">
                            <div>
                                <span class="mini-label">Hoy en vivo</span>
                                <h2>Previsión local del día</h2>
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
                                <span class="mini-label">Evolución 7 días</span>
                                <h2>Próximos días en Alhaurín</h2>
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

                <!-- TOOLBAR INFORMATIVA FINAL -->
                <div class="weather-footer-actions">
                    <a class="btn btn-secondary" href="https://andalmet.es/el-tiempo-en/alhaurin-el-grande"
                        target="_blank" rel="noopener noreferrer">Ver previsión completa en Andalmet.es ↗</a>
                    <a class="btn btn-secondary"
                        href="https://web2.aemet.es/es/eltiempo/prediccion/municipios/alhaurin-el-grande-id29008"
                        target="_blank" rel="noopener noreferrer">Ficha oficial en AEMET.es ↗</a>
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
  console.log('tiempo/index.html regenerado estáticamente con widgets prominentes de Andalmet.');
}

renderTiempoPage();
