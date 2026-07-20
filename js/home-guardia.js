(function () {
    var box = document.getElementById("home-pharmacy-guard");
    if (!box) return;

    var script = document.currentScript || document.querySelector('script[src$="home-guardia.js"]');
    var root = script ? new URL("../", script.src) : new URL("/", window.location.origin);

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

    function formatTodayLabel() {
        return new Date().toLocaleDateString("es-ES", {
            weekday: "long",
            day: "numeric",
            month: "long"
        });
    }

    var today = key(new Date());
    var calendarUrl = normalizeLink("guia-util/farmacias/calendario/");
    var officialUrl = "https://alhaurinelgrande.es/farmacias/";
    var todayLabel = formatTodayLabel();

    function renderPendingGuard() {
        box.innerHTML = "\n            <div class=\"home-guard-main\">\n                <span class=\"section-kicker\">Farmacia de guardia hoy</span>\n                <div class=\"home-guard-date\">" + escapeHTML(todayLabel) + "</div>\n                <h2>Guardia pendiente de completar</h2>\n                <p class=\"home-guard-summary\">Cuando rellenes el JSON de guardias, la farmacia de hoy aparecerá aquí automáticamente.</p>\n                <p class=\"home-guard-note\">Confirma siempre la guardia en la fuente oficial antes de desplazarte.</p>\n            </div>\n            <div class=\"home-guard-actions\">\n                <a href=\"" + escapeHTML(calendarUrl) + "\">Ver calendario</a>\n                <a class=\"secondary\" href=\"" + escapeHTML(officialUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">Fuente oficial</a>\n            </div>\n        ";
    }

    function renderPharmacyGuard(farmacia) {
        var phoneHref = farmacia.telefonoHref ? "tel:" + farmacia.telefonoHref : "#";
        var phoneText = farmacia.telefono || "Llamar";
        var pharmacyUrl = normalizeLink(farmacia.url || farmacia.pagina || "guia-util/farmacias/");
        var address = farmacia.direccion || "Consulta la dirección en la ficha de la farmacia.";

        box.innerHTML = "\n            <div class=\"home-guard-main\">\n                <span class=\"section-kicker\">Farmacia de guardia hoy</span>\n                <div class=\"home-guard-date\">" + escapeHTML(todayLabel) + "</div>\n                <h2>" + escapeHTML(farmacia.nombre || "Farmacia de guardia") + "</h2>\n                <div class=\"home-guard-facts\" aria-label=\"Datos de la farmacia de guardia\">\n                    <div>\n                        <span>Dirección</span>\n                        <strong>" + escapeHTML(address) + "</strong>\n                    </div>\n                    <div>\n                        <span>Horario de guardia</span>\n                        <strong>9:30 a 9:30</strong>\n                    </div>\n                </div>\n                <p class=\"home-guard-note\">Guardia orientativa. Confirma siempre en la fuente oficial antes de desplazarte.</p>\n            </div>\n            <div class=\"home-guard-actions\" aria-label=\"Acciones de farmacia de guardia\">\n                <a href=\"" + escapeHTML(pharmacyUrl) + "\">Ver ficha</a>\n                <a class=\"secondary\" href=\"" + escapeHTML(phoneHref) + "\">" + escapeHTML(phoneText) + "</a>\n                <a class=\"secondary\" href=\"" + escapeHTML(calendarUrl) + "\">Calendario</a>\n                <a class=\"ghost\" href=\"" + escapeHTML(officialUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">Fuente oficial</a>\n            </div>\n        ";
    }

    function renderError() {
        box.innerHTML = "\n            <div class=\"home-guard-main\">\n                <span class=\"section-kicker\">Farmacia de guardia hoy</span>\n                <div class=\"home-guard-date\">" + escapeHTML(todayLabel) + "</div>\n                <h2>No disponible</h2>\n                <p class=\"home-guard-summary\">No se pudo cargar el calendario de guardias.</p>\n                <p class=\"home-guard-note\">Puedes consultar el calendario o la fuente oficial para confirmar la guardia.</p>\n            </div>\n            <div class=\"home-guard-actions\">\n                <a href=\"" + escapeHTML(calendarUrl) + "\">Ver calendario</a>\n                <a class=\"secondary\" href=\"" + escapeHTML(officialUrl) + "\" target=\"_blank\" rel=\"noopener noreferrer\">Fuente oficial</a>\n            </div>\n        ";
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
