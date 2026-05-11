const newsContainer = document.getElementById("news-container");
const featuredContainer = document.getElementById("featured-news");
const guideContainer = document.getElementById("guide-container");
const guideSearch = document.getElementById("guide-search");

function escapeHTML(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderFeaturedNews(noticia) {
    if (!featuredContainer || !noticia) return;

    const titulo = escapeHTML(noticia.titulo || "Noticia sin título");
    const descripcion = escapeHTML(noticia.descripcion || noticia.resumen || "Sin descripción disponible.");
    const categoria = escapeHTML(noticia.categoria || "Actualidad");
    const enlace = noticia.enlace || noticia.url || "#";
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
                <span class="tag">${categoria}</span>
                <h2>${titulo}</h2>
                <p>${descripcion}</p>
                <a class="read-more" href="${escapeHTML(enlace)}" target="_blank" rel="noopener noreferrer">
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
    const enlace = noticia.enlace || noticia.url || "#";
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
            <a class="read-more" href="${escapeHTML(enlace)}" target="_blank" rel="noopener noreferrer">
                Leer noticia →
            </a>
        </div>
    `;

    return card;
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
            newsContainer.innerHTML = "";
            if (featuredContainer) featuredContainer.innerHTML = "";

            if (!noticias || noticias.length === 0) {
                newsContainer.innerHTML = "<p>No hay noticias disponibles.</p>";
                return;
            }

            renderFeaturedNews(noticias[0]);

            noticias.slice(1).forEach(noticia => {
                newsContainer.appendChild(renderNewsCard(noticia));
            });
        })
        .catch(error => {
            console.error("Error cargando noticias:", error);

            if (featuredContainer) {
                featuredContainer.innerHTML = "";
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

            <a class="read-more" href="${escapeHTML(item.enlace || "#guia-util")}">
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
                            ...(item.items || [])
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
