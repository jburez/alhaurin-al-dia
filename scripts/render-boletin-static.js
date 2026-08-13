// Pre-renderiza en boletin-oficial/index.html los edictos de data/boletin-oficial.json
// de forma totalmente estática y optimizada para SEO.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BOLETIN_DATA_PATH = path.join(ROOT, 'data', 'boletin-oficial.json');
const BOLETIN_HTML_PATH = path.join(ROOT, 'boletin-oficial', 'index.html');

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatFecha(value) {
  if (!value) return 'fecha sin confirmar';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'fecha sin confirmar';
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
}

function renderEdictoCard(edicto) {
  const meta = [
    edicto.numero_edicto ? `Edicto ${escapeHTML(edicto.numero_edicto)}` : '',
    edicto.expediente ? `Expediente ${escapeHTML(edicto.expediente)}` : '',
  ].filter(Boolean).join(' · ');

  return `
    <article class="edicto-card">
        <div class="edicto-meta">
            <span class="tag">${escapeHTML(edicto.organismo || 'BOP Málaga')}</span>
            ${meta ? `<span class="daily-source">${meta}</span>` : ''}
        </div>
        <h3>Publicado el ${formatFecha(edicto.fecha_alerta)}</h3>
        <p>${escapeHTML(edicto.resumen || 'Sin resumen disponible.')}</p>
        ${edicto.enlace ? `
            <a class="read-more" href="${escapeHTML(edicto.enlace)}" target="_blank" rel="noopener noreferrer">
                Ver edicto completo →
            </a>
        ` : ''}
    </article>
  `;
}

function main() {
  const edictos = readJSON(BOLETIN_DATA_PATH, []);
  if (!Array.isArray(edictos)) {
    console.error('boletin-oficial.json no es un array válido');
    process.exit(1);
  }

  edictos.sort((a, b) => (b.fecha_alerta || '').localeCompare(a.fecha_alerta || ''));

  let html = fs.readFileSync(BOLETIN_HTML_PATH, 'utf8');

  const updatedText = edictos.length
    ? `${edictos.length} edicto${edictos.length === 1 ? '' : 's'} registrado${edictos.length === 1 ? '' : 's'}`
    : 'Sin edictos registrados';

  const listHTML = edictos.length
    ? edictos.map(renderEdictoCard).join('\n')
    : `
    <article class="edicto-card">
        <h3>Sin edictos registrados</h3>
        <p>Todavía no se ha detectado ningún edicto del BOP Málaga para Alhaurín el Grande.</p>
    </article>
    `;

  // Reemplazar marcador de actualización y lista
  html = html.replace(/<p id="edictos-updated">.*?<\/p>/s, `<p id="edictos-updated">${updatedText}</p>`);
  html = html.replace(/<div class="edicto-list" id="edictos-list">.*?<\/div>\s*<\/div>/s, `<div class="edicto-list" id="edictos-list">${listHTML}</div></div>`);

  fs.writeFileSync(BOLETIN_HTML_PATH, html, 'utf8');
  console.log(`boletin-oficial/index.html regenerado estáticamente con ${edictos.length} edictos.`);
}

main();
