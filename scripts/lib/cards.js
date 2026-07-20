// Renderizado de tarjetas compartido entre el build estático (SSR) y js/app.js (CSR).
// Debe producir el mismo HTML/clases que app.js para que la hidratación en cliente
// no cause saltos visuales. Cualquier cambio de markup aquí debe reflejarse también
// en js/app.js (y viceversa).

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function truncateText(value = "", maxLength = 160) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;

  const truncated = text.slice(0, maxLength + 1);
  const lastSpace = truncated.lastIndexOf(" ");
  return `${truncated.slice(0, lastSpace > 80 ? lastSpace : maxLength).trim()}…`;
}

function absoluteSitePath(value = "") {
  if (!value || value === "#") return "#";
  const str = String(value).trim();
  if (/^(https?:|mailto:|tel:|#)/i.test(str)) return str;
  return `/${str.replace(/^\/+/, "")}`;
}

function formatNewsDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
}

function renderNewsMeta(fuente = "", fecha = "", className = "news-meta-line") {
  const formattedDate = formatNewsDate(fecha);
  const safeSource = escapeHTML(fuente || "");
  const safeDate = escapeHTML(formattedDate);
  const safeDatetime = escapeHTML(fecha || "");

  if (!safeSource && !safeDate) return "";

  return `
        <div class="${className}">
            ${safeDate ? `<time datetime="${safeDatetime}">${safeDate}</time>` : ""}
            ${safeDate && safeSource ? `<span class="news-meta-separator">·</span>` : ""}
            ${safeSource ? `<span>${safeSource}</span>` : ""}
        </div>
    `;
}

const HOME_FEATURED_SUMMARY_LENGTH = 220;
const HOME_CARD_SUMMARY_LENGTH = 130;

function renderFeaturedNewsHTML(noticia, { isHome = false } = {}) {
  if (!noticia) return "";

  const titulo = escapeHTML(noticia.titulo || "Noticia sin título");
  const rawDescripcion = noticia.descripcion || noticia.resumen || "Sin descripción disponible.";
  const descripcion = escapeHTML(isHome ? truncateText(rawDescripcion, HOME_FEATURED_SUMMARY_LENGTH) : rawDescripcion);
  const categoria = escapeHTML(noticia.categoria || "Actualidad");
  const fuente = noticia.fuente || "";
  const enlace = absoluteSitePath(noticia.pagina || noticia.enlace || noticia.url || "#");
  const imagen = noticia.imagen || "";
  const meta = renderNewsMeta(fuente, noticia.fecha, "featured-date-line");

  return `
        <article class="featured-news-card">
            <div class="featured-news-image">
                ${imagen ? `
                    <img src="${escapeHTML(imagen)}" alt="${titulo}" width="600" height="390">
                ` : `
                    <div class="news-placeholder">
                        <span>Alhaurín al Día</span>
                    </div>
                `}
            </div>

            <div class="featured-news-content">
                <span class="featured-label">Noticia destacada</span>
                <div class="featured-meta">
                    <span class="tag">${categoria}</span>
                </div>
                ${meta}
                <h2>${titulo}</h2>
                <p>${descripcion}</p>
                <a class="read-more" href="${escapeHTML(enlace)}" aria-label="Leer: ${titulo}">
                    Leer noticia →
                </a>
            </div>
        </article>
    `;
}

function renderNewsCardHTML(noticia, { isHome = false } = {}) {
  const titulo = escapeHTML(noticia.titulo || "Noticia sin título");
  const rawDescripcion = noticia.descripcion || noticia.resumen || "Sin descripción disponible.";
  const descripcion = escapeHTML(isHome ? truncateText(rawDescripcion, HOME_CARD_SUMMARY_LENGTH) : rawDescripcion);
  const categoria = escapeHTML(noticia.categoria || "Actualidad");
  const fuente = noticia.fuente || "";
  const enlace = absoluteSitePath(noticia.pagina || noticia.enlace || noticia.url || "#");
  const imagen = noticia.imagen || "";
  const meta = renderNewsMeta(fuente, noticia.fecha);

  return `
        <article class="content-card news-card">
        ${imagen ? `
            <div class="news-image">
                <img src="${escapeHTML(imagen)}" alt="${titulo}" loading="lazy" width="400" height="230">
            </div>
        ` : `
            <div class="news-image news-placeholder">
                <span>Alhaurín al Día</span>
            </div>
        `}

        <div class="news-body">
            <span class="tag">${categoria}</span>
            <h3>${titulo}</h3>
            <p>${descripcion}</p>
        </div>

        <div class="news-footer">
            ${meta}
            <a class="read-more" href="${escapeHTML(enlace)}" aria-label="Leer: ${titulo}">
                Leer noticia →
            </a>
        </div>
        </article>
    `;
}

function getSourceCounts(noticias) {
  return noticias.reduce((counts, noticia) => {
    const fuente = noticia.fuente || "Sin fuente";
    counts[fuente] = (counts[fuente] || 0) + 1;
    return counts;
  }, {});
}

function renderSourceFiltersHTML(noticias, activeSource = "Todas") {
  const counts = getSourceCounts(noticias);
  const fuentes = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  const opciones = [
    { nombre: "Todas", total: noticias.length },
    ...fuentes.map(fuente => ({ nombre: fuente, total: counts[fuente] }))
  ];

  return `
        <div class="source-filters-header">
            <span>Filtrar por fuente</span>
            <small>${noticias.length} noticias disponibles</small>
        </div>
        <div class="source-filter-list" role="list" aria-label="Fuentes de noticias">
            ${opciones.map(opcion => {
              const isActive = opcion.nombre === activeSource;
              return `
                    <button
                        type="button"
                        class="source-filter ${isActive ? "active" : ""}"
                        data-source="${escapeHTML(opcion.nombre)}"
                        aria-pressed="${isActive ? "true" : "false"}"
                    >
                        <span>${escapeHTML(opcion.nombre)}</span>
                        <strong>${opcion.total}</strong>
                    </button>
                `;
            }).join("")}
        </div>
    `;
}

function renderGuideCardHTML(item, { featured = false } = {}) {
  const listItems = (item.items || [])
    .map(text => `<li>${escapeHTML(text)}</li>`)
    .join("");

  const pageLink = absoluteSitePath(item.pagina || item.enlace || `guia-util/${item.id || ""}/`);
  const links = (item.links || [])
    .map(link => `
                <a href="${escapeHTML(absoluteSitePath(link.url || "#"))}" target="_blank" rel="noopener noreferrer">
                    ${escapeHTML(link.texto || "Abrir enlace")}
                </a>
            `)
    .join("");

  return `<article class="guide-card${featured ? " featured-guide-card" : ""}" id="${escapeHTML(item.id || "")}">
            <div class="guide-card-top">
                <div class="guide-icon">${escapeHTML(item.icono || "•")}</div>
                <div>
                    <span class="guide-category">${escapeHTML(item.categoria || "Guía útil")}</span>
                    <h3>${escapeHTML(item.titulo || "Recurso local")}</h3>
                </div>
            </div>

            <p>${escapeHTML(item.descripcion || "Información práctica para consultar rápidamente.")}</p>

            <ul>${listItems}</ul>

            ${links ? `<div class="guide-links">${links}</div>` : ""}

            <a class="read-more" href="${escapeHTML(pageLink)}">
                ${escapeHTML(item.cta || "Ver ficha completa")} →
            </a>
        </article>`;
}

function renderGuideFiltersHTML(items, activeCategory = "Todas") {
  const categories = ["Todas", ...new Set(items.map(item => item.categoria || "Otros"))];
  return categories.map(category => `<button type="button" class="guide-pill ${category === activeCategory ? "active" : ""}" data-category="${escapeHTML(category)}">${escapeHTML(category)}</button>`).join("");
}

module.exports = {
  escapeHTML,
  truncateText,
  absoluteSitePath,
  formatNewsDate,
  renderNewsMeta,
  renderFeaturedNewsHTML,
  renderNewsCardHTML,
  renderSourceFiltersHTML,
  renderGuideCardHTML,
  renderGuideFiltersHTML,
};
