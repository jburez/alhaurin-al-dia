const newsContainer = document.getElementById("news-container");
const featuredContainer = document.getElementById("featured-news");
const sourceFiltersContainer = document.getElementById("source-filters");
const guideContainer = document.getElementById("guide-container");
const guideSearch = document.getElementById("guide-search");

const appScript = document.currentScript || document.querySelector('script[src$="app.js"]');
const APP_ROOT = appScript ? new URL("./", appScript.src) : new URL("/", window.location.origin);

const IS_HOME = document.body && document.body.contains(featuredContainer) && document.getElementById("inicio");
const HOME_SECONDARY_NEWS_LIMIT = 3;

let allNews = [];
let activeSource = "Todas";

const HUBS_UTILES = [
    {
        title: "Farmacias de guardia",
        description: "Consulta farmacias, teléfonos y fuentes oficiales antes de desplazarte.",
        url: "guia-util/farmacias/",
        keywords: ["farmacia", "farmacias", "guardia", "salud", "emergencia", "urgencias"]
    },
    {
        title: "Teléfonos útiles",
        description: "Emergencias, atención municipal y contactos básicos de Alhaurín el Grande.",
        url: "guia-util/telefonos/",
        keywords: ["teléfono", "telefonos", "emergencia", "policía", "protección civil", "guardia civil", "ayuntamiento"]
    },
    {
        title: "Trámites y sede electrónica",
        description: "Accesos a sede electrónica, cita previa, padrón y gestiones municipales.",
        url: "guia-util/tramites/",
        keywords: ["trámite", "tramites", "sede", "padrón", "padron", "cita previa", "tributos"]
    },
    {
        title: "Autobuses y movilidad",
        description: "Horarios, líneas y recursos para moverse desde y hacia Alhaurín el Grande.",
        url: "guia-util/movilidad/",
        keywords: ["autobús", "autobus", "movilidad", "transporte", "horario", "málaga", "coin", "cártama"]
    },
    {
        title: "Taxi en Alhaurín el Grande",
        description: "Parada, teléfono y recursos de taxi del municipio.",
        url: "guia-util/taxis/",
        keywords: ["taxi", "taxis", "traslado"]
    },
    {
        title: "Deportes e instalaciones",
        description: "Instalaciones deportivas, piscina, pistas y recursos municipales.",
        url: "guia-util/deportes/",
        keywords: ["deporte", "deportes", "calistenia", "polideportivo", "piscina", "fútbol", "baloncesto", "pádel"]
    },
    {
        title: "Campamentos y familias",
        description: "Recursos educativos, campamentos urbanos y conciliación familiar.",
        url: "guia-util/campamentos/",
        keywords: ["campamento", "campamentos", "educación", "educacion", "familias", "niños", "conciliación"]
    },
    {
        title: "Turismo y patrimonio",
        description: "Planes, patrimonio, rutas y recursos turísticos de Alhaurín el Grande.",
        url: "guia-util/turismo/",
        keywords: ["turismo", "patrimonio", "ruta", "rutas", "mirador", "antonio gala", "visita"]
    },
    {
        title: "Restaurantes y dónde comer",
        description: "Guía gastronómica local en construcción para vecinos y visitantes.",
        url: "guia-util/restaurantes/",
        keywords: ["restaurante", "restaurantes", "bar", "bares", "comer", "cafetería", "tapas"]
    }
];

function escapeHTML(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getAssetPath(path) {
    return new URL(path.replace(/^\/+/, ""), APP_ROOT).href;
}

function normalizeLink(link = "#") {
    if (!link || link === "#") return "#";

    const value = String(link).trim();

    if (
        value.startsWith("#") ||
        value.startsWith("http://") ||
        value.startsWith("https://") ||
        value.startsWith("mailto:") ||
        value.startsWith("tel:")
    ) {
        return value;
    }

    return new URL(value.replace(/^\/+/, ""), APP_ROOT).href;
}

function isExternalLink(link = "") {
    return /^https?:\/\//i.test(link) && !link.startsWith(window.location.origin);
}

function initMobileMenu() {
    const menu = document.getElementById("main-menu");
    const button = document.querySelector(".menu-toggle");

    if (!menu || !button) return;

    button.addEventListener("click", () => {
        const isOpen = menu.classList.toggle("open");
        button.classList.toggle("open", isOpen);
        button.setAttribute("aria-expanded", String(isOpen));
        document.body.classList.toggle("menu-open", isOpen);
    });

    menu.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            menu.classList.remove("open");
            button.classList.remove("open");
            button.setAttribute("aria-expanded", "false");
            document.body.classList.remove("menu-open");
        });
    });
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
    const enlace = normalizeLink(noticia.pagina || noticia.enlace || noticia.url || "#");
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
    const enlace = normalizeLink(noticia.pagina || noticia.enlace || noticia.url || "#");
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

    fetch(getAssetPath("data/noticias.json"))
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
            .slice(0, 4)
            .map(text => `<li>${escapeHTML(text)}</li>`)
            .join("");

        const pageLink = normalizeLink(item.pagina || item.enlace || `guia-util/${item.id || ""}/`);
        const externalLinks = (item.links || [])
            .slice(0, 2)
            .map(link => `
                <a href="${escapeHTML(normalizeLink(link.url || "#"))}" target="_blank" rel="noopener noreferrer">
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

            ${externalLinks ? `<div class="guide-links">${externalLinks}</div>` : ""}

            <a class="read-more" href="${escapeHTML(pageLink)}">
                ${escapeHTML(item.cta || "Ver ficha completa")} →
            </a>
        `;

        guideContainer.appendChild(card);
    });
}

function loadGuide() {
    if (!guideContainer) return;

    fetch(getAssetPath("data/guia-util.json"))
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

function scoreHubForText(hub, text) {
    return hub.keywords.reduce((score, keyword) => {
        return text.includes(keyword.toLowerCase()) ? score + 1 : score;
    }, 0);
}

function insertUsefulHubSuggestions() {
    const articleContent = document.querySelector(".premium-article-content");
    const articleTitle = document.querySelector(".article-title");

    if (!articleContent || !articleTitle || document.querySelector(".useful-hubs-inline")) return;

    const text = `${articleTitle.textContent || ""} ${articleContent.textContent || ""}`.toLowerCase();
    const selected = HUBS_UTILES
        .map(hub => ({ ...hub, score: scoreHubForText(hub, text) }))
        .filter(hub => hub.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

    const hubs = selected.length ? selected : HUBS_UTILES.slice(0, 3);

    const block = document.createElement("aside");
    block.className = "useful-hubs-inline article-editorial-note";
    block.setAttribute("aria-label", "También te puede servir");
    block.innerHTML = `
        <strong>También te puede servir</strong>
        <div class="guide-links" style="margin-top:12px;">
            ${hubs.map(hub => `
                <a href="${escapeHTML(normalizeLink(hub.url))}">
                    ${escapeHTML(hub.title)}
                </a>
            `).join("")}
        </div>
    `;

    const sourceBox = articleContent.querySelector(".article-source-box");
    if (sourceBox) {
        articleContent.insertBefore(block, sourceBox);
    } else {
        articleContent.appendChild(block);
    }
}

initMobileMenu();
loadNews();
loadGuide();
insertUsefulHubSuggestions();
