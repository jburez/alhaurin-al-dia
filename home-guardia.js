(function () {
    var box = document.getElementById("home-pharmacy-guard");
    if (!box) return;

    var script = document.currentScript || document.querySelector('script[src$="home-guardia.js"]');
    var root = script ? new URL("./", script.src) : new URL("/", window.location.origin);

    function pad(value) {
        return String(value).padStart(2, "0");
    }

    function key(date) {
        return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
    }

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

    var today = key(new Date());
    var calendarUrl = normalizeLink("guia-util/farmacias/calendario/");
    var officialUrl = "https://alhaurinelgrande.es/farmacias/";

    function renderPendingGuard() {
        box.innerHTML = "\n            <div>\n                <span class=\"section-kicker\">Farmacia de guardia hoy</span>\n                <h2>Guardia pendiente de completar</h2>\n                <p>Cuando rellenes el JSON de guardias, la farmacia de hoy aparecerá aquí automáticamente.</p>\n            </div>\n            <div class=\"home-guard-actions\">\n                <a href=\"" + escapeHTML(calendarUrl) + "\">Ver calendario</a>\n                <a class=\"secondary\" href=\"" + escapeHTML(officialUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">Fuente oficial</a>\n            </div>\n        ";
    }

    function renderPharmacyGuard(farmacia) {
        var phoneHref = farmacia.telefonoHref ? "tel:" + farmacia.telefonoHref : "#";
        var phoneText = farmacia.telefono || "Llamar";
        var pharmacyUrl = normalizeLink(farmacia.url || farmacia.pagina || "guia-util/farmacias/");

        box.innerHTML = "\n            <div>\n                <span class=\"section-kicker\">Farmacia de guardia hoy</span>\n                <h2>" + escapeHTML(farmacia.nombre || "Farmacia de guardia") + "</h2>\n                <p>" + escapeHTML(farmacia.direccion || "Consulta la dirección en la ficha de la farmacia.") + " · Guardia orientativa de 9:30 a 9:30. Confirma siempre en la fuente oficial antes de desplazarte.</p>\n            </div>\n            <div class=\"home-guard-actions\">\n                <a href=\"" + escapeHTML(pharmacyUrl) + "\">Ver ficha</a>\n                <a class=\"secondary\" href=\"" + escapeHTML(phoneHref) + "\">" + escapeHTML(phoneText) + "</a>\n                <a class=\"secondary\" href=\"" + escapeHTML(calendarUrl) + "\">Calendario</a>\n            </div>\n        ";
    }

    function renderError() {
        box.innerHTML = "\n            <div>\n                <span class=\"section-kicker\">Farmacia de guardia hoy</span>\n                <h2>No disponible</h2>\n                <p>No se pudo cargar el calendario de guardias.</p>\n            </div>\n            <div class=\"home-guard-actions\">\n                <a href=\"" + escapeHTML(calendarUrl) + "\">Ver calendario</a>\n            </div>\n        ";
    }

    Promise.all([
        fetch(new URL("data/farmacias.json", root).href),
        fetch(new URL("data/guardias-farmacias-2026.json", root).href)
    ])
        .then(function (responses) {
            if (!responses[0].ok || !responses[1].ok) {
                throw new Error("Datos no disponibles");
            }

            return Promise.all([responses[0].json(), responses[1].json()]);
        })
        .then(function (data) {
            var farmacias = {};
            var farmaciasData = Array.isArray(data[0]) ? data[0] : [];
            var guardias = data[1].guardias || {};
            var id = guardias[today];
            var farmacia = null;

            farmaciasData.forEach(function (item) {
                farmacias[item.id] = item;
            });

            farmacia = id ? farmacias[id] : null;

            if (!farmacia) {
                renderPendingGuard();
                return;
            }

            renderPharmacyGuard(farmacia);
        })
        .catch(function (error) {
            console.error("Error cargando farmacia de guardia:", error);
            renderError();
        });
})();
