(function () {
    var container = document.getElementById("featured-commerce-list");
    var updatedBox = document.getElementById("featured-commerce-updated");

    if (!container) return;

    var script = document.currentScript || document.querySelector('script[src$="home-commerce.js"]');
    var root = script ? new URL("../", script.src) : new URL("/", window.location.origin);

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

    function parseDate(value) {
        if (!value) return null;
        var date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function formatUpdated(value) {
        var date = parseDate(value);
        if (!date) return "Espacio comercial disponible";

        return "Actualizado " + date.toLocaleDateString("es-ES", { day: "2-digit", month: "long" });
    }

    function isActiveCommerce(item) {
        return item && item.activo !== false;
    }

    function renderEmpty() {
        container.innerHTML = "\n            <article class=\"featured-commerce-empty\">\n                <div class=\"featured-commerce-empty-icon\">★</div>\n                <div>\n                    <span class=\"sponsored-label\">Espacio patrocinado</span>\n                    <h3>Comercio destacado disponible</h3>\n                    <p>Un espacio limpio y visible para restaurantes, tiendas, profesionales o servicios de Alhaurín el Grande.</p>\n                </div>\n                <a href=\"" + escapeHTML(normalizeLink("anunciarse/")) + "\">Quiero aparecer →</a>\n            </article>\n        ";
    }

    function renderCommerce(item) {
        var url = normalizeLink(item.url || "comercios/");
        var phoneUrl = item.telefonoHref ? "tel:" + item.telefonoHref : "";
        var isExternal = /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
        var image = item.imagen || "";

        return "\n            <article class=\"featured-commerce-card\">\n                <div class=\"featured-commerce-media\">\n                    " + (image
                        ? "<img src=\"" + escapeHTML(normalizeLink(image)) + "\" alt=\"" + escapeHTML(item.nombre || "Comercio destacado") + "\" loading=\"lazy\">"
                        : "<span>" + escapeHTML((item.nombre || "A").slice(0, 1)) + "</span>"
                    ) + "\n                </div>\n                <div class=\"featured-commerce-content\">\n                    <span class=\"sponsored-label\">" + escapeHTML(item.etiqueta || "Comercio destacado") + "</span>\n                    <h3>" + escapeHTML(item.nombre || "Comercio local") + "</h3>\n                    <p>" + escapeHTML(item.descripcion || "Negocio local de Alhaurín el Grande.") + "</p>\n                    <div class=\"featured-commerce-meta\">\n                        " + (item.categoria ? "<span>" + escapeHTML(item.categoria) + "</span>" : "") + "\n                        " + (item.zona ? "<span>" + escapeHTML(item.zona) + "</span>" : "") + "\n                    </div>\n                    <div class=\"featured-commerce-actions\">\n                        <a href=\"" + escapeHTML(url) + "\" " + (isExternal ? "target=\"_blank\" rel=\"noopener noreferrer\"" : "") + ">" + escapeHTML(item.cta || "Ver comercio") + "</a>\n                        " + (phoneUrl ? "<a class=\"secondary\" href=\"" + escapeHTML(phoneUrl) + "\">Llamar</a>" : "") + "\n                    </div>\n                </div>\n            </article>\n        ";
    }

    fetch(new URL("data/comercios-destacados.json", root).href)
        .then(function (response) {
            if (!response.ok) throw new Error("No se pudo cargar comercios-destacados.json");
            return response.json();
        })
        .then(function (data) {
            var items = Array.isArray(data.comercios) ? data.comercios.filter(isActiveCommerce).slice(0, 2) : [];

            if (updatedBox) {
                updatedBox.textContent = formatUpdated(data.actualizado);
            }

            if (!items.length) {
                renderEmpty();
                return;
            }

            container.innerHTML = items.map(renderCommerce).join("");
        })
        .catch(function (error) {
            console.error("Error cargando comercios destacados:", error);
            renderEmpty();
        });
})();
