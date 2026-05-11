const newsContainer = document.getElementById("news-container");
const featuredContainer = document.getElementById("featured-news");
const sourceFiltersContainer = document.getElementById("source-filters");
const guideContainer = document.getElementById("guide-container");
const guideSearch = document.getElementById("guide-search");

const IS_HOME = document.body && document.body.contains(featuredContainer) && document.getElementById("inicio");
const HOME_SECONDARY_NEWS_LIMIT = 3;

let allNews = [];
let activeSource = "Todas";

function escapeHTML(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getSourceCounts(noticias) {
    return noticias.reduce((counts, noticia) => {
        const fuente = noticia.fuente || "Sin fuente";
        counts[fuente] = (counts[fuente] || 0) + 1;
        return counts;
    }, {});
}

function getFilteredNews() {
    if (activeSource === "Todas") {
        return allNews;
    }

    return allNews.filter(noticia => (noticia.fuente || "Sin fuente") === activeSource);
}

function renderSourceFilters(noticias) {
    if (!sourceFiltersContainer) return;

    const counts = getSourceCounts(noticias);
    const fuentes = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
    const opciones = [
        { nombre: "Todas", total: noticias.length },
        ...fuentes.map(fuente => ({ nombre: fuente, total: counts[fuente] }))
    ];

    sourceFiltersContainer.innerHTML = `
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

    sourceFiltersContainer.querySelectorAll(".source-filter").forEach(button => {
        button.addEventListener("click", () => {
            activeSource = button.dataset.source || "Todas";
            renderSourceFilters(allNews);
            renderNewsList();
        });
    });
}

function renderFeaturedNews(noticia) {
    if (!featuredContainer || !noticia) return;

    const titulo = escapeHTML(noticia.titulo || "Noticia sin título");
    const descripcion = escapeHTML(noticia.descripcion || noticia.resumen || "Sin descripción disponible.");
    const categoria = escapeHTML(noticia.categoria || "Actualidad");
    const fuente = escapeHTML(noticia.fuente || "");
    const enlace = noticia.pagina || noticia.enlace || noticia.url || "#";
    const imagen = noticia.imagen || "";

    featuredContainer.innerHTML = `
        <article class="featured-news-card">
            <div class="featured-news-image">
                ${imagen ? `
                    <img src="${escapeHTML(imagen)}" alt="${titulo}">
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
                    ${fuente ? `<span class="source-mini-tag">${fuente}</span>` : ""}
                </div>
                <h2>${titulo}</h2>
                <p>${descripcion}</p>
                <a class="read-more" href="${escapeHTML(enlace)}">
                    Leer noticia →
                </a>
            </div>
        </article>
    `;
}

function renderNewsCard(noticia) {
    const titulo = escapeHTML(noticia.titulo || "Noticia sin título");
    const descripcion = escapeHTML(noticia.descripcion || noticia.resumen || "Sin descripción disponible.");
    const categoria = escapeHTML(noticia.categoria || "Actualidad");
    const fuente = escapeHTML(noticia.fuente || "");
    const enlace = noticia.pagina || noticia.enlace || noticia.url || "#";
    const imagen = noticia.imagen || "";

    const card = document.createElement("article");
    card.className = "content-card news-card";

    card.innerHTML = `
        ${imagen ? `
            <div class="news-image">
                <img src="${escapeHTML(imagen)}" alt="${titulo}" loading="lazy">
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
            ${fuente ? `<small>${fuente}</small>` : ""}
            <a class="read-more" href="${escapeHTML(enlace)}">
                Leer noticia →
            </a>
        </div>
    `;

    return card;
}

function renderNewsList() {
    if (!newsContainer) return;

    const filteredNews = getFilteredNews();

    newsContainer.innerHTML = "";
    if (featuredContainer) featuredContainer.innerHTML = "";

    if (!filteredNews || filteredNews.length === 0) {
        newsContainer.innerHTML = `<p class="empty-state">No hay noticias disponibles para esta fuente.</p>`;
        return;
    }

    renderFeaturedNews(filteredNews[0]);

    const secondaryNews = IS_HOME
        ? filteredNews.slice(1, 1 + HOME_SECONDARY_NEWS_LIMIT)
        : filteredNews.slice(1);

    secondaryNews.forEach(noticia => {
        newsContainer.appendChild(renderNewsCard(noticia));
    });
}

function loadNews() {
    if (!newsContainer) return;

    fetch("data/noticias.json")
        .then(response => {
            if (!response.ok) {
                throw new Error("No se pudo cargar noticias.json");
            }

            return response.json();
        })
        .then(noticias => {
            allNews = noticias || [];
            activeSource = "Todas";

            if (!allNews || allNews.length === 0) {
                newsContainer.innerHTML = "<p>No hay noticias disponibles.</p>";
                if (featuredContainer) featuredContainer.innerHTML = "";
                if (sourceFiltersContainer) sourceFiltersContainer.innerHTML = "";
                return;
            }

            renderSourceFilters(allNews);
            renderNewsList();
        })
        .catch(error => {
            console.error("Error cargando noticias:", error);

            if (featuredContainer) {
                featuredContainer.innerHTML = "";
            }

            if (sourceFiltersContainer) {
                sourceFiltersContainer.innerHTML = "";
            }

            newsContainer.innerHTML = "<p>No se han podido cargar las noticias.</p>";
        });
}

function renderGuide(items) {
    if (!guideContainer) return;

    guideContainer.innerHTML = "";

    if (!items || items.length === 0) {
        guideContainer.innerHTML = `<p class="empty-state">No se han encontrado resultados en la guía.</p>`;
        return;
    }

    items.forEach(item => {
        const card = document.createElement("article");
        card.className = "guide-card";
        card.id = item.id || "";

        const listItems = (item.items || [])
            .map(text => `<li>${escapeHTML(text)}</li>`)
            .join("");

        const linkItems = (item.links || [])
            .map(link => `
                <a href="${escapeHTML(link.url || "#")}" target="_blank" rel="noopener noreferrer">
                    ${escapeHTML(link.texto || "Abrir enlace")}
                </a>
            `)
            .join("");

        card.innerHTML = `
            <div class="guide-card-top">
                <div class="guide-icon">${escapeHTML(item.icono || "•")}</div>
                <div>
                    <span class="guide-category">${escapeHTML(item.categoria || "Guía útil")}</span>
                    <h3>${escapeHTML(item.titulo || "Recurso local")}</h3>
                </div>
            </div>

            <p>${escapeHTML(item.descripcion || "Información práctica para consultar rápidamente.")}</p>

            <ul>${listItems}</ul>

            ${linkItems ? `<div class="guide-links">${linkItems}</div>` : ""}

            <a class="read-more" href="${escapeHTML(item.enlace || "#guia-util")}" target="_blank" rel="noopener noreferrer">
                ${escapeHTML(item.cta || "Ver más")} →
            </a>
        `;

        guideContainer.appendChild(card);
    });
}

function loadGuide() {
    if (!guideContainer) return;

    fetch("data/guia-util.json")
        .then(response => {
            if (!response.ok) {
                throw new Error("No se pudo cargar guia-util.json");
            }

            return response.json();
        })
        .then(items => {
            renderGuide(items);

            if (guideSearch) {
                guideSearch.addEventListener("input", event => {
                    const query = event.target.value.trim().toLowerCase();

                    const filtered = items.filter(item => {
                        const content = [
                            item.categoria,
                            item.titulo,
                            item.descripcion,
                            ...(item.items || []),
                            ...((item.links || []).map(link => link.texto || ""))
                        ].join(" ").toLowerCase();

                        return content.includes(query);
                    });

                    renderGuide(filtered);
                });
            }
        })
        .catch(error => {
            console.error("Error cargando guía útil:", error);

            guideContainer.innerHTML = `
                <p class="empty-state">No se ha podido cargar la guía útil.</p>
            `;
        });
}

loadNews();
loadGuide();
