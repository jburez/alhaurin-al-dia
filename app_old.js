const newsContainer = document.getElementById("news-container");
const featuredContainer = document.getElementById("featured-news");

fetch("data/noticias.json")
    .then(response => {
        if (!response.ok) {
            throw new Error("No se pudo cargar noticias.json");
        }

        return response.json();
    })
    .then(noticias => {
        newsContainer.innerHTML = "";
        featuredContainer.innerHTML = "";

        if (!noticias || noticias.length === 0) {
            newsContainer.innerHTML = "<p>No hay noticias disponibles.</p>";
            return;
        }

        const principal = noticias[0];

        featuredContainer.innerHTML = `
            <article class="featured-news-card">
                <div class="featured-news-image">
                    ${principal.imagen ? `
                        <img src="${principal.imagen}" alt="${principal.titulo}">
                    ` : `
                        <div class="news-placeholder">
                            <span>Alhaurín al Día</span>
                        </div>
                    `}
                </div>

                <div class="featured-news-content">
                    <span class="featured-label">Noticia destacada</span>
                    <span class="tag">${principal.categoria || "Actualidad"}</span>

                    <h2>${principal.titulo || "Noticia sin título"}</h2>

                    <p>${principal.descripcion || principal.resumen || "Sin descripción disponible."}</p>

                    <a 
                        class="read-more"
                        href="${principal.enlace || principal.url || "#"}"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Leer noticia →
                    </a>
                </div>
            </article>
        `;

        noticias.slice(1).forEach(noticia => {
            const titulo = noticia.titulo || "Noticia sin título";
            const descripcion = noticia.descripcion || noticia.resumen || "Sin descripción disponible.";
            const categoria = noticia.categoria || "Actualidad";
            const fuente = noticia.fuente || "";
            const enlace = noticia.enlace || noticia.url || "#";
            const imagen = noticia.imagen || "";

            const card = document.createElement("article");
            card.className = "content-card news-card";

            card.innerHTML = `
                ${imagen ? `
                    <div class="news-image">
                        <img src="${imagen}" alt="${titulo}" loading="lazy">
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

                    <a 
                        class="read-more"
                        href="${enlace}"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Leer noticia →
                    </a>
                </div>
            `;

            newsContainer.appendChild(card);
        });
    })
    .catch(error => {
        console.error("Error cargando noticias:", error);

        if (featuredContainer) {
            featuredContainer.innerHTML = "";
        }

        newsContainer.innerHTML = "<p>No se han podido cargar las noticias.</p>";
    });