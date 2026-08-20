// Navegación principal única, compartida por todos los generadores Node.
//
// A diferencia del footer (scripts/lib/footer.js), el CONTENIDO del menú no
// vive aquí: vive en data/nav.json, la única fuente de verdad. Este fichero
// solo aporta la plantilla HTML alrededor de esos ítems — deliberadamente
// mínima (un <a> por ítem, sin lógica condicional) para que lo único que
// pudiera divergir entre esta versión y scripts/lib/nav.py sea esa
// plantilla, no el contenido. Usa rutas absolutas ("/noticias/", etc.) para
// funcionar igual a cualquier profundidad de carpeta, mismo criterio que
// scripts/lib/footer.js.

const fs = require('fs');
const path = require('path');

const NAV_DATA_FILE = path.join(__dirname, '..', '..', 'data', 'nav.json');

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function loadNavData() {
  return JSON.parse(fs.readFileSync(NAV_DATA_FILE, 'utf8'));
}

function renderNav() {
  const { items, cta } = loadNavData();
  const links = items
    .map((item) => `<a href="${escapeHTML(item.href)}">${escapeHTML(item.label)}</a>`)
    .join('\n                    ');
  const ctaLink = cta
    ? `<a href="${escapeHTML(cta.href)}" class="nav-cta">${escapeHTML(cta.label)}</a>`
    : '';

  return `<nav aria-label="Navegación principal">
                <a class="logo" href="/" aria-label="Alhaurín al Día">
                    <span class="logo-mark">A</span>
                    <span><strong>Alhaurín al Día</strong><span>Información local útil</span></span>
                </a>
                <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="main-menu" aria-label="Abrir menú de navegación">
                    <span></span><span></span><span></span>
                </button>
                <div class="nav-links" id="main-menu">
                    ${links}
                    ${ctaLink}
                    <button type="button" class="nav-search-btn search-toggle" aria-label="Buscar en la web">🔍 Buscar</button>
                </div>
            </nav>`;
}

module.exports = { renderNav };
