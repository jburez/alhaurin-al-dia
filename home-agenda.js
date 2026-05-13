(function () {
    var container = document.getElementById("home-agenda-list");
    var updatedBox = document.getElementById("home-agenda-updated");

    if (!container) return;

    var script = document.currentScript || document.querySelector('script[src$="home-agenda.js"]');
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

    function parseDate(value) {
        if (!value) return null;
        var date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function isUpcoming(event) {
        var now = new Date();
        var start = parseDate(event.inicio);
        var end = parseDate(event.fin);

        if (event.activo === false) return false;
        if (end && end < now) return false;
        if (!start && !end) return false;

        return true;
    }

    function formatDate(value) {
        var date = parseDate(value);
        if (!date) return "Fecha pendiente";

        return date.toLocaleDateString("es-ES", {
            weekday: "short",
            day: "numeric",
            month: "short"
        });
    }

    function formatTimeRange(event) {
        var start = parseDate(event.inicio);
        var end = parseDate(event.fin);

        if (!start) return "Horario pendiente";

        var startTime = start.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
        var endTime = end ? end.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) : "";

        return endTime ? startTime + " - " + endTime : startTime;
    }

    function formatUpdated(value) {
        var date = parseDate(value);
        if (!date) return "Agenda pendiente de actualización";

        return "Actualizada " + date.toLocaleDateString("es-ES", { day: "2-digit", month: "long" });
    }

    function renderEmpty() {
        container.innerHTML = "\n            <article class=\"home-agenda-empty\">\n                <div class=\"home-agenda-empty-icon\">📅</div>\n                <div>\n                    <h3>Sin eventos destacados próximos</h3>\n                    <p>Cuando haya actividades, cortes, procesiones, feria o avisos programados confirmados, aparecerán aquí.</p>\n                </div>\n                <a href=\"" + escapeHTML(normalizeLink("planes/")) + "\">Ver planes →</a>\n            </article>\n        ";
    }

    function renderEvent(event) {
        var url = normalizeLink(event.url || "planes/");
        var isExternal = /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
        var type = event.tipo || "Agenda";
        var place = event.lugar || "Alhaurín el Grande";

        return "\n            <article class=\"home-agenda-card " + escapeHTML(event.estado || "neutral") + "\">\n                <div class=\"home-agenda-date\">\n                    <strong>" + escapeHTML(formatDate(event.inicio)) + "</strong>\n                    <span>" + escapeHTML(formatTimeRange(event)) + "</span>\n                </div>\n                <div class=\"home-agenda-content\">\n                    <span class=\"home-agenda-type\">" + escapeHTML(type) + "</span>\n                    <h3>" + escapeHTML(event.titulo || "Evento local") + "</h3>\n                    <p>" + escapeHTML(event.descripcion || "Actividad local pendiente de ampliar.") + "</p>\n                    <small>" + escapeHTML(place) + "</small>\n                </div>\n                <a class=\"home-agenda-link\" href=\"" + escapeHTML(url) + "\" " + (isExternal ? "target=\"_blank\" rel=\"noopener noreferrer\"" : "") + ">\n                    " + escapeHTML(event.cta || "Ver detalle") + " →\n                </a>\n            </article>\n        ";
    }

    fetch(new URL("data/agenda-local.json", root).href)
        .then(function (response) {
            if (!response.ok) throw new Error("No se pudo cargar agenda-local.json");
            return response.json();
        })
        .then(function (data) {
            var events = Array.isArray(data.eventos) ? data.eventos : [];
            var upcoming = events
                .filter(isUpcoming)
                .sort(function (a, b) {
                    var dateA = parseDate(a.inicio) || parseDate(a.fin) || new Date(8640000000000000);
                    var dateB = parseDate(b.inicio) || parseDate(b.fin) || new Date(8640000000000000);
                    return dateA - dateB;
                })
                .slice(0, 4);

            if (updatedBox) {
                updatedBox.textContent = formatUpdated(data.actualizado);
            }

            if (!upcoming.length) {
                renderEmpty();
                return;
            }

            container.innerHTML = upcoming.map(renderEvent).join("");
        })
        .catch(function (error) {
            console.error("Error cargando agenda local:", error);
            renderEmpty();
        });
})();
