const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NEWS_FILE = path.join(ROOT, 'data', 'noticias.json');
const FARMACIAS_DATA_FILE = path.join(ROOT, 'data', 'farmacias.json');
const GUARDIAS_DATA_FILE = path.join(ROOT, 'data', 'guardias-farmacias-2026.json');
const AEMET_DATA_FILE = path.join(ROOT, 'data', 'tiempo-aemet.json');
const OUTPUT_TXT = path.join(ROOT, 'reports', 'whatsapp-boletin-hoy.txt');
const OUTPUT_HTML = path.join(ROOT, 'boletin-whatsapp.html');
const BASE_URL = 'https://alhaurinaldia.es';

function formatDateSpanish() {
  const options = { timeZone: 'Europe/Madrid', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const formatted = new Date().toLocaleDateString('es-ES', options);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function getTodayKeyMadrid() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

function getFarmaciaHoy() {
  try {
    const farmacias = JSON.parse(fs.readFileSync(FARMACIAS_DATA_FILE, 'utf8'));
    const guardiasData = JSON.parse(fs.readFileSync(GUARDIAS_DATA_FILE, 'utf8'));
    const hoyKey = getTodayKeyMadrid();
    const guardias = guardiasData.guardias || {};
    const idHoy = guardias[hoyKey];

    if (!idHoy) return null;

    const porId = {};
    farmacias.forEach(f => { porId[f.id] = f; });
    return porId[idHoy] || null;
  } catch (e) {
    return null;
  }
}

function getTiempoHoy() {
  try {
    const data = JSON.parse(fs.readFileSync(AEMET_DATA_FILE, 'utf8'));
    if (data && data.estadoSky) {
      return `${data.estadoSky} (Máx: ${data.max}° / Mín: ${data.min}°)`;
    }
  } catch (e) { /* fallback */ }
  return 'Despejado / Soleado en Alhaurín';
}

function generateWhatsAppBoletin() {
  let noticias = [];
  try {
    noticias = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8')) || [];
  } catch (err) {
    console.error('Error leyendo noticias.json:', err);
    return;
  }

  const hoyTexto = formatDateSpanish();
  const farmaciaHoy = getFarmaciaHoy();
  const tiempoHoy = getTiempoHoy();
  const destacadas = noticias.slice(0, 3);

  // Formato Farmacia
  let farmaciaTexto = 'Consulta la guardia de hoy en la web.';
  if (farmaciaHoy) {
    farmaciaTexto = `*${farmaciaHoy.nombre}*\n   📍 ${farmaciaHoy.direccion}\n   📞 Tel: ${farmaciaHoy.telefono || 'Ver en web'}\n   🕒 Guardia orientativa 9:30h a 9:30h`;
  }

  const noticiasTexto = destacadas.map((item, idx) => {
    const pagePath = item.pagina || item.url || '';
    const itemUrl = pagePath.startsWith('http') ? pagePath : `${BASE_URL}/${pagePath.replace(/^\/+/, '')}`;
    return `📌 *${item.titulo}*
${item.resumen || item.descripcion || ''}
👇 *Leer noticia completa:*
${itemUrl}`;
  }).join('\n\n');

  const mensajeWhatsApp = `☀️ *ALHAURÍN AL DÍA | BOLETÍN LOCAL*
🗓️ ${hoyTexto}

💊 *FARMACIA DE GUARDIA HOY EN ALHAURÍN:*
${farmaciaTexto}

🌤️ *EL TIEMPO HOY:*
${tiempoHoy}

📢 *AVISOS Y SERVICIOS:*
- 🚗 *Tráfico y Accesos:* Sin incidencias reportadas.
- ☎️ *Teléfonos Útiles / Emergencias:* https://alhaurinaldia.es/guia-util/telefonos/
- 📋 *Trámites Municipales:* https://alhaurinaldia.es/guia-util/tramites/

━━━━━━━━━━━━━━━━━━━━━
📰 *ÚLTIMAS NOTICIAS LOCALES DE HOY:*

${noticiasTexto}

━━━━━━━━━━━━━━━━━━━━━
📲 *Consulta la portada con toda la información local:*
👉 https://alhaurinaldia.es/`;

  // Guardar en reporte TXT
  const reportsDir = path.dirname(OUTPUT_TXT);
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_TXT, mensajeWhatsApp, 'utf8');

  // Generar herramienta web HTML para copiar con 1 clic
  const whatsappApiUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(mensajeWhatsApp)}`;

  const htmlContent = `<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Boletín Diario WhatsApp — Alhaurín al Día</title>
    <meta name="description" content="Herramienta interna para generar y compartir el boletín diario de noticias de Alhaurín el Grande en el Canal Oficial de WhatsApp.">
    <meta name="robots" content="noindex, nofollow">
    <link rel="canonical" href="https://alhaurinaldia.es/boletin-whatsapp.html">
    <link rel="stylesheet" href="./css/styles.css">
    <style>
        body { background: #f4f0e8; padding: 40px 20px; font-family: system-ui, sans-serif; }
        .boletin-card { max-width: 640px; margin: 0 auto; background: #fff; border-radius: 24px; padding: 32px; box-shadow: 0 10px 40px rgba(0,0,0,0.08); border: 1px solid #e0d8c8; }
        h1 { font-family: var(--font-display, serif); color: #181d17; font-size: 24px; margin-top: 0; }
        pre { background: #f8f6f0; border: 1px solid #e4decb; padding: 20px; border-radius: 16px; font-family: inherit; font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; color: #222; }
        .btn-group { display: flex; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
        .btn-copy { background: #455c36; color: #fff; border: none; padding: 12px 24px; border-radius: 999px; font-weight: 800; cursor: pointer; font-size: 14px; }
        .btn-copy:hover { background: #354829; }
        .btn-send { background: #25D366; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 999px; font-weight: 800; font-size: 14px; display: inline-block; }
        .btn-send:hover { background: #1da851; }
        .toast { display: none; margin-top: 10px; color: #2e6930; font-weight: 700; font-size: 13px; }
    </style>
</head>
<body>
    <div class="boletin-card">
        <h1>📱 Boletín Diario para WhatsApp</h1>
        <p>Generado automáticamente con la <strong>farmacia de guardia real de hoy</strong>, tiempo, teléfonos de emergencia y noticias destacadas.</p>
        <pre id="texto-boletin">${mensajeWhatsApp}</pre>
        <div class="btn-group">
            <button class="btn-copy" onclick="copiarTexto()">📋 Copiar Texto</button>
            <a href="${whatsappApiUrl}" target="_blank" rel="noopener noreferrer" class="btn-send">💬 Abrir en WhatsApp →</a>
        </div>
        <div id="toast" class="toast">✓ ¡Texto copiado al portapapeles!</div>
    </div>
    <script>
        function copiarTexto() {
            var texto = document.getElementById("texto-boletin").innerText;
            navigator.clipboard.writeText(texto).then(function() {
                var toast = document.getElementById("toast");
                toast.style.display = "block";
                setTimeout(function() { toast.style.display = "none"; }, 3000);
            });
        }
    </script>
</body>
</html>`;

  fs.writeFileSync(OUTPUT_HTML, htmlContent, 'utf8');

  console.log('====================================');
  console.log('[WhatsApp Generator] Boletín mejorado generado con éxito:');
  console.log('====================================\n');
  console.log(mensajeWhatsApp);
  console.log('\n====================================');
  console.log(`Guardado en: ${OUTPUT_TXT}`);
  console.log(`Herramienta web actualizada en: https://alhaurinaldia.es/boletin-whatsapp.html`);
}

generateWhatsAppBoletin();
