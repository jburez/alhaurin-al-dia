const newsContainer = document.getElementById("news-container");
const featuredContainer = document.getElementById("featured-news");
const sourceFiltersContainer = document.getElementById("source-filters");
const guideContainer = document.getElementById("guide-container");
const guideSearch = document.getElementById("guide-search");

const appScript = document.currentScript || document.querySelector('script[src$="app.js"]');
const APP_ROOT = appScript ? new URL("../", appScript.src) : new URL("/", window.location.origin);

const IS_HOME = document.body && document.body.contains(featuredContainer) && document.getElementById("inicio");
const HOME_SECONDARY_NEWS_LIMIT = 3;
const HOME_FEATURED_SUMMARY_LENGTH = 220;
const HOME_CARD_SUMMARY_LENGTH = 130;

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

function truncateText(value = "", maxLength = 160) {
    const text = String(value || "").trim();
    if (text.length <= maxLength) return text;

    const truncated = text.slice(0, maxLength + 1);
    const lastSpace = truncated.lastIndexOf(" ");
    return `${truncated.slice(0, lastSpace > 80 ? lastSpace : maxLength).trim()}…`;
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

function formatNewsDate(value) {
    if (!value) return "";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric"
    });
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

function cleanupHomeStaticArtifacts() {
    if (!IS_HOME) return;

    const homeNewsSection = document.querySelector(".home-news-clean");
    const homeNewsContainer = document.querySelector(".home-news-clean > .container");

    if (featuredContainer) featuredContainer.innerHTML = "";
    if (newsContainer) newsContainer.innerHTML = "";
    if (guideContainer) guideContainer.innerHTML = "";

    if (homeNewsSection) {
        homeNewsSection.querySelectorAll(".featured-news-content, .news-body, .news-footer, article.content-card, article.news-card, article.featured-news-card, .featured-news-card").forEach(node => {
            if (featuredContainer && featuredContainer.contains(node)) return;
            if (newsContainer && newsContainer.contains(node)) return;
            node.remove();
        });
    }

    if (homeNewsContainer && newsContainer) {
        let node = newsContainer.nextElementSibling;
        while (node && !(node.classList && node.classList.contains("actions"))) {
            const next = node.nextElementSibling;
            node.remove();
            node = next;
        }
    }
}

function initMobileMenu() {
    const menu = document.getElementById("main-menu");
    const button = document.querySelector(".menu-toggle");

    if (!menu || !button) return;

    let previousActiveElement = null;

    function closeMenu() {
        menu.classList.remove("open");
        button.classList.remove("open");
        button.setAttribute("aria-expanded", "false");
        document.body.classList.remove("menu-open");
        document.removeEventListener("keydown", handleKeydown);

        if (previousActiveElement && typeof previousActiveElement.focus === "function") {
            previousActiveElement.focus();
        }
    }

    function openMenu() {
        previousActiveElement = document.activeElement;
        menu.classList.add("open");
        button.classList.add("open");
        button.setAttribute("aria-expanded", "true");
        document.body.classList.add("menu-open");
        document.addEventListener("keydown", handleKeydown);

        const firstNavFocus = menu.querySelector("a, button");
        if (firstNavFocus) firstNavFocus.focus();
    }

    function handleKeydown(e) {
        if (e.key === "Escape") {
            closeMenu();
            return;
        }

        if (e.key === "Tab") {
            const focusables = [button, ...menu.querySelectorAll("a[href], button:not([disabled])")];
            const first = focusables[0];
            const last = focusables[focusables.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    button.addEventListener("click", () => {
        const isOpen = menu.classList.contains("open");
        if (isOpen) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    menu.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            closeMenu();
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
    const rawDescripcion = noticia.descripcion || noticia.resumen || "Sin descripción disponible.";
    const descripcion = escapeHTML(IS_HOME ? truncateText(rawDescripcion, HOME_FEATURED_SUMMARY_LENGTH) : rawDescripcion);
    const categoria = escapeHTML(noticia.categoria || "Actualidad");
    const fuente = noticia.fuente || "";
    const enlace = normalizeLink(noticia.pagina || noticia.enlace || noticia.url || "#");
    const imagen = noticia.imagen || "";
    const meta = renderNewsMeta(fuente, noticia.fecha, "featured-date-line");

    featuredContainer.innerHTML = `
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

function renderNewsCard(noticia) {
    const titulo = escapeHTML(noticia.titulo || "Noticia sin título");
    const rawDescripcion = noticia.descripcion || noticia.resumen || "Sin descripción disponible.";
    const descripcion = escapeHTML(IS_HOME ? truncateText(rawDescripcion, HOME_CARD_SUMMARY_LENGTH) : rawDescripcion);
    const categoria = escapeHTML(noticia.categoria || "Actualidad");
    const fuente = noticia.fuente || "";
    const enlace = normalizeLink(noticia.pagina || noticia.enlace || noticia.url || "#");
    const imagen = noticia.imagen || "";
    const meta = renderNewsMeta(fuente, noticia.fecha);

    const card = document.createElement("article");
    card.className = "content-card news-card";

    card.innerHTML = `
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
    `;

    return card;
}

function renderNewsList() {
    if (!newsContainer) return;

    cleanupHomeStaticArtifacts();

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

function ensureStylesheet(path) {
    const href = getAssetPath(path);
    if (document.querySelector(`link[href="${href}"]`)) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
}

function ensureScript(path, id) {
    if (id && document.getElementById(id)) return;

    const script = document.createElement("script");
    if (id) script.id = id;
    script.src = getAssetPath(path);
    script.defer = true;
    document.body.appendChild(script);
}

function getCommercialPageConfig() {
    const pathname = window.location.pathname.replace(/\/+$/, "/");

    if (pathname === "/guia-util/restaurantes/") {
        return {
            placement: "restaurantes",
            title: "Restaurantes destacados de Alhaurín.",
            description: "Espacio para bares, restaurantes, cafeterías y terrazas que quieran aparecer con ficha destacada en la guía gastronómica local."
        };
    }

    if (pathname === "/guia-util/veterinarios/") {
        return {
            placement: "veterinarios",
            title: "Servicios destacados para mascotas.",
            description: "Espacio para clínicas veterinarias, peluquerías caninas, tiendas de animales y servicios para mascotas verificados."
        };
    }

    if (pathname === "/guia-util/farmacias/") {
        return {
            placement: "farmacias",
            title: "Publicidad local en salud y proximidad.",
            description: "Espacio pensado para servicios de salud, bienestar, farmacias, clínicas o comercios cercanos, siempre separado de la información de guardias."
        };
    }

    return null;
}

function insertCommercialCtas() {
    if (document.querySelector(".commercial-sponsored-injected")) return;

    const config = getCommercialPageConfig();
    if (!config) return;

    const main = document.querySelector("main");
    const firstSection = main ? main.querySelector("section") : null;
    if (!main || !firstSection) return;

    ensureStylesheet("css/sponsored-cards.css");

    const section = document.createElement("section");
    section.className = "sponsored-section commercial-sponsored-injected";
    section.setAttribute("aria-labelledby", "commercial-sponsored-title");
    section.innerHTML = `
        <div class="container">
            <div class="sponsored-shell">
                <div class="sponsored-header">
                    <div>
                        <span class="section-kicker">Fichas patrocinadas</span>
                        <h2 id="commercial-sponsored-title">${escapeHTML(config.title)}</h2>
                        <p>${escapeHTML(config.description)}</p>
                    </div>
                </div>
                <div class="sponsored-grid" data-sponsored-cards="${escapeHTML(config.placement)}" data-sponsored-limit="3" aria-live="polite">
                    <article class="sponsored-empty-card">
                        <div class="sponsored-empty-icon">★</div>
                        <div>
                            <span class="sponsored-label">Ficha patrocinada</span>
                            <h3>Cargando espacios destacados...</h3>
                            <p>Consultando fichas patrocinadas disponibles para esta sección.</p>
                        </div>
                    </article>
                </div>
            </div>
        </div>
    `;

    firstSection.insertAdjacentElement("afterend", section);
    ensureScript("js/sponsored-cards.js", "sponsored-cards-loader");
}

function initMobileBottomNav() {
    const bottomNavItems = document.querySelectorAll(".mobile-bottom-nav .mobile-nav-item");
    if (!bottomNavItems.length) return;

    bottomNavItems.forEach(item => {
        item.addEventListener("click", function () {
            bottomNavItems.forEach(el => el.classList.remove("active"));
            this.classList.add("active");
        });
    });
}

function initLiveSearchOverlay() {
    // Si ya existe el modal, evitamos duplicados
    if (document.getElementById("search-modal")) return;

    // Inyectar HTML del Modal de Búsqueda
    const modal = document.createElement("div");
    modal.className = "search-modal";
    modal.id = "search-modal";
    modal.setAttribute("aria-hidden", "true");
    modal.innerHTML = `
        <div class="search-modal-backdrop" id="search-modal-backdrop"></div>
        <div class="search-modal-box">
            <div class="search-modal-header">
                <span class="search-icon" aria-hidden="true">🔍</span>
                <input type="search" id="global-search-input" placeholder="Buscar noticias, farmacias, trámites, movilidad, avisos..." autocomplete="off" />
                <button type="button" class="search-modal-close" id="search-modal-close" aria-label="Cerrar búsqueda">✕</button>
            </div>
            <div class="search-modal-results" id="search-modal-results">
                <div class="search-modal-hint">
                    <p>💡 Escribe para buscar noticias, farmacias, teléfonos de urgencia, trámites o servicios de Alhaurín el Grande.</p>
                </div>
            </div>
            <div class="search-modal-footer">
                <span>Pulsa <kbd>ESC</kbd> para cerrar</span>
                <span>Navegación instantánea de Alhaurín al Día</span>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    const input = document.getElementById("global-search-input");
    const resultsContainer = document.getElementById("search-modal-results");
    const closeBtn = document.getElementById("search-modal-close");
    const backdrop = document.getElementById("search-modal-backdrop");

    function openSearchModal() {
        modal.classList.add("open");
        modal.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
        setTimeout(() => input.focus(), 50);
    }

    function closeSearchModal() {
        modal.classList.remove("open");
        modal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
        input.value = "";
        renderDefaultHint();
    }

    function renderDefaultHint() {
        resultsContainer.innerHTML = `
            <div class="search-modal-hint">
                <p>💡 Escribe para buscar noticias, farmacias, teléfonos de urgencia, trámites o servicios de Alhaurín el Grande.</p>
            </div>
        `;
    }

    function performSearch(query) {
        const q = String(query || "").trim().toLowerCase();
        if (!q) {
            renderDefaultHint();
            return;
        }

        // Buscar en Hubs Útiles
        const matchedHubs = HUBS_UTILES.filter(hub => {
            const str = `${hub.title} ${hub.description} ${(hub.keywords || []).join(" ")}`.toLowerCase();
            return str.includes(q);
        });

        // Buscar en Noticias
        const matchedNews = (allNews || []).filter(item => {
            const str = `${item.titulo || ""} ${item.resumen || ""} ${item.categoria || ""} ${item.fuente || ""}`.toLowerCase();
            return str.includes(q);
        }).slice(0, 5);

        if (matchedHubs.length === 0 && matchedNews.length === 0) {
            resultsContainer.innerHTML = `
                <div class="search-modal-empty">
                    <p>No se han encontrado resultados para "<strong>${escapeHTML(q)}</strong>".</p>
                </div>
            `;
            return;
        }

        let html = "";

        if (matchedHubs.length > 0) {
            html += `
                <div class="search-section-group">
                    <span class="search-section-title">Guía Útil y Servicios</span>
                    ${matchedHubs.map(hub => `
                        <a href="${escapeHTML(normalizeLink(hub.url))}" class="search-result-item">
                            <span class="search-badge">Guía Útil</span>
                            <div>
                                <strong>${escapeHTML(hub.title)}</strong>
                                <p>${escapeHTML(hub.description)}</p>
                            </div>
                        </a>
                    `).join("")}
                </div>
            `;
        }

        if (matchedNews.length > 0) {
            html += `
                <div class="search-section-group">
                    <span class="search-section-title">Noticias Recientes</span>
                    ${matchedNews.map(item => `
                        <a href="${escapeHTML(normalizeLink(item.pagina || item.url || "#"))}" class="search-result-item">
                            <span class="search-badge news">${escapeHTML(item.categoria || "Noticia")}</span>
                            <div>
                                <strong>${escapeHTML(item.titulo || "Noticia local")}</strong>
                                <p>${escapeHTML(truncateText(item.resumen || item.descripcion || "", 90))}</p>
                            </div>
                        </a>
                    `).join("")}
                </div>
            `;
        }

        resultsContainer.innerHTML = html;
    }

    // Event Listeners
    document.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            if (modal.classList.contains("open")) {
                closeSearchModal();
            } else {
                openSearchModal();
            }
        } else if (e.key === "Escape" && modal.classList.contains("open")) {
            closeSearchModal();
        }
    });

    document.querySelectorAll(".search-toggle").forEach(btn => {
        btn.addEventListener("click", openSearchModal);
    });

    closeBtn.addEventListener("click", closeSearchModal);
    backdrop.addEventListener("click", closeSearchModal);

    input.addEventListener("input", (e) => {
        performSearch(e.target.value);
    });
}

// ---- GESTIÓN DE NOTICIAS GUARDADAS ("MI ALHAURÍN") ----

function getSavedArticles() {
    try {
        return JSON.parse(localStorage.getItem("alhaurin_saved_articles") || "[]");
    } catch (e) {
        return [];
    }
}

function initBookmarksSystem() {
    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".bookmark-btn");
        if (!btn) return;

        const id = btn.getAttribute("data-id") || window.location.pathname;
        const title = btn.getAttribute("data-title") || document.title;
        const url = btn.getAttribute("data-url") || window.location.href;

        let saved = getSavedArticles();
        const index = saved.findIndex(item => String(item.id) === String(id));

        if (index !== -1) {
            saved.splice(index, 1);
            localStorage.setItem("alhaurin_saved_articles", JSON.stringify(saved));
            btn.innerHTML = "⭐ Guardar en Mi Alhaurín";
            alert("Artículo eliminado de 'Mi Alhaurín'");
        } else {
            saved.unshift({
                id,
                title,
                url,
                date: new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }),
                savedAt: new Date().toISOString()
            });
            localStorage.setItem("alhaurin_saved_articles", JSON.stringify(saved));
            btn.innerHTML = "⭐ Guardado en Mi Alhaurín";
            alert("⭐ ¡Guardado en 'Mi Alhaurín'!");
        }

        renderSavedArticlesMiAlhaurin();
    });

    renderSavedArticlesMiAlhaurin();
}

function renderSavedArticlesMiAlhaurin() {
    const container = document.getElementById("saved-list");
    if (!container) return;

    const saved = getSavedArticles();
    if (!saved.length) {
        container.innerHTML = `
            <div class="saved-empty">
                <span>📌 No tienes artículos guardados todavía.</span>
                <p>Haz clic en la estrella "⭐ Guardar en Mi Alhaurín" en cualquier noticia para leerla más tarde.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = saved.map(item => `
        <article class="saved-item" style="background: var(--paper-soft); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center; gap: 10px;">
            <div>
                <a href="${escapeHTML(item.url)}" style="font-weight: 700; color: var(--ink); text-decoration: none;">${escapeHTML(item.title)}</a>
                <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">Guardado el ${escapeHTML(item.date)}</div>
            </div>
            <button type="button" class="bookmark-btn" data-id="${escapeHTML(item.id)}" style="background: none; border: 0; color: #c62828; font-weight: 700; cursor: pointer; font-size: 13px;">Eliminar</button>
        </article>
    `).join("");
}

cleanupHomeStaticArtifacts();
initMobileMenu();
initMobileBottomNav();
loadNews();
loadGuide();
insertUsefulHubSuggestions();
insertCommercialCtas();
initLiveSearchOverlay();
initBookmarksSystem();

