(function () {
    var containers = document.querySelectorAll("[data-sponsored-cards]");
    if (!containers.length) return;

    var script = document.currentScript || document.querySelector('script[src$="sponsored-cards.js"]');
    var root = script ? new URL("./", script.src) : new URL("/", window.location.origin);

    function escapeHTML(value) {
        return String(value || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function normalizeLink(link) {
        if (!link || link === "#") return "#";
        var value = String(link).trim();

        if (
            value.startsWith("#") ||
            value.startsWith("http://") ||
            value.startsWith("https://") ||
            value.startsWith("mailto:") ||
            value.startsWith("tel:")
        ) {
            return value;
        }

        return new URL(value.replace(/^\/+/, ""), root).href;
    }

    function isActive(item) {
        return item && item.activo !== false;
    }

    function matchesPlacement(item, placement) {
        if (!placement || placement === "todos") return true;
        var placements = Array.isArray(item.ubicaciones) ? item.ubicaciones : [];
        return placements.includes(placement) || placements.includes("todos");
    }

    function renderEmpty(container) {
        container.innerHTML = "\n            <article class=\"sponsored-empty-card\">\n                <div class=\"sponsored-empty-icon\">★</div>\n                <div>\n                    <span class=\"sponsored-label\">Ficha patrocinada</span>\n                    <h3>Espacio disponible para negocios locales</h3>\n                    <p>Ficha pensada para mostrar nombre, descripción, ubicación, teléfono, web y llamada a la acción de comercios verificados.</p>\n                </div>\n                <a href=\"" + escapeHTML(normalizeLink("anunciarse/")) + "\">Solicitar información →</a>\n            </article>\n        ";
    }

    function renderCard(item) {
        var url = normalizeLink(item.url || "comercios/");
        var phoneUrl = item.telefonoHref ? "tel:" + item.telefonoHref : "";
        var isExternal = /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
        var features = Array.isArray(item.destacados) ? item.destacados.slice(0, 3) : [];
        var image = item.imagen || "";

        return "\n            <article class=\"sponsored-card\">\n                <div class=\"sponsored-card-media\">\n                    " + (image
                        ? "<img src=\"" + escapeHTML(normalizeLink(image)) + "\" alt=\"" + escapeHTML(item.nombre || "Ficha patrocinada") + "\" loading=\"lazy\" width=\"400\" height=\"170\">"
                        : "<span>" + escapeHTML((item.nombre || "A").slice(0, 1)) + "</span>"
                    ) + "\n                </div>\n                <div class=\"sponsored-card-body\">\n                    <span class=\"sponsored-label\">" + escapeHTML(item.etiqueta || "Ficha patrocinada") + "</span>\n                    <h3>" + escapeHTML(item.nombre || "Negocio local") + "</h3>\n                    <p>" + escapeHTML(item.descripcion || "Negocio local verificado de Alhaurín el Grande.") + "</p>\n                    <div class=\"sponsored-card-meta\">\n                        " + (item.categoria ? "<span>" + escapeHTML(item.categoria) + "</span>" : "") + "\n                        " + (item.zona ? "<span>" + escapeHTML(item.zona) + "</span>" : "") + "\n                    </div>\n                    " + (features.length ? "<ul class=\"sponsored-card-features\">" + features.map(function (feature) { return "<li>" + escapeHTML(feature) + "</li>"; }).join("") + "</ul>" : "") + "\n                    <div class=\"sponsored-card-actions\">\n                        <a href=\"" + escapeHTML(url) + "\" " + (isExternal ? "target=\"_blank\" rel=\"noopener noreferrer sponsored\"" : "") + ">" + escapeHTML(item.cta || "Ver ficha") + "</a>\n                        " + (phoneUrl ? "<a class=\"secondary\" href=\"" + escapeHTML(phoneUrl) + "\">Llamar</a>" : "") + "\n                    </div>\n                </div>\n            </article>\n        ";
    }

    function renderBusinessSchema(item) {
        var data = {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": item.nombre || "Negocio local",
            "description": item.descripcion || "Negocio local de Alhaurín el Grande.",
            "url": normalizeLink(item.url || "comercios/"),
            "address": {
                "@type": "PostalAddress",
                "addressLocality": "Alhaurín el Grande",
                "addressRegion": "Málaga",
                "addressCountry": "ES"
            },
            "areaServed": { "@type": "Place", "name": "Alhaurín el Grande" }
        };
        if (item.zona) data.address.addressRegion = item.zona + ", Málaga";
        if (item.telefonoHref) data.telephone = item.telefonoHref;
        if (item.categoria) data.knowsAbout = item.categoria;
        if (item.imagen) data.image = normalizeLink(item.imagen);

        var scriptTag = document.createElement("script");
        scriptTag.type = "application/ld+json";
        scriptTag.textContent = JSON.stringify(data);
        return scriptTag;
    }

    fetch(new URL("data/fichas-patrocinadas.json", root).href)
        .then(function (response) {
            if (!response.ok) throw new Error("No se pudo cargar fichas-patrocinadas.json");
            return response.json();
        })
        .then(function (data) {
            var items = Array.isArray(data.fichas) ? data.fichas.filter(isActive) : [];

            containers.forEach(function (container) {
                var placement = container.getAttribute("data-sponsored-cards") || "todos";
                var limit = Number(container.getAttribute("data-sponsored-limit") || 3);
                var filtered = items.filter(function (item) { return matchesPlacement(item, placement); }).slice(0, limit);

                if (!filtered.length) {
                    renderEmpty(container);
                    return;
                }

                container.innerHTML = filtered.map(renderCard).join("");
                filtered.forEach(function (item) {
                    container.appendChild(renderBusinessSchema(item));
                });
            });
        })
        .catch(function (error) {
            console.error("Error cargando fichas patrocinadas:", error);
            containers.forEach(renderEmpty);
        });
})();
