(function () {
    const container = document.getElementById("daily-status");
    const updatedBox = document.getElementById("daily-updated");

    if (!container) return;

    const script = document.currentScript || document.querySelector('script[src$="home-live.js"]');
    const root = script ? new URL("./", script.src) : new URL("/", window.location.origin);

    function escapeHTML(value = "") {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function normalizeLink(link = "#") {
        if (!link || link === "#") return "#";
        const value = String(link).trim();
        if (value.startsWith("#") || value.startsWith("http://") || value.startsWith("https://") || value.startsWith("mailto:") || value.startsWith("tel:")) {
            return value;
        }
        return new URL(value.replace(/^\/+/, ""), root).href;
    }

    function formatUpdated(value) {
        if (!value) return "Actualización pendiente";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Actualización pendiente";
        return `Actualizado ${date.toLocaleDateString("es-ES", { day: "2-digit", month: "long" })} a las ${date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
    }

    function renderItem(item) {
        const estado = item.estado || "neutral";
        const url = normalizeLink(item.url || "#");
        const isExternal = /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
        const cta = item.cta || "Ver más";

        return `
            <article class="daily-card ${escapeHTML(estado)}">
                <div class="daily-card-top">
                    <span class="daily-icon" aria-hidden="true">${escapeHTML(item.icono || "•")}</span>
                    <strong>${escapeHTML(item.titulo || "Estado")}</strong>
                </div>
                <div class="daily-value">${escapeHTML(item.valor || "Consultar")}</div>
                <p>${escapeHTML(item.detalle || "Información pendiente de actualización.")}</p>
                <a class="daily-link" href="${escapeHTML(url)}" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ""}>
                    ${escapeHTML(cta)} →
                </a>
            </article>
        `;
    }

    fetch(new URL("data/estado-local.json", root).href)
        .then(response => {
            if (!response.ok) throw new Error("No se pudo cargar estado-local.json");
            return response.json();
        })
        .then(data => {
            const items = Array.isArray(data.items) ? data.items : [];

            if (updatedBox) {
                updatedBox.textContent = formatUpdated(data.actualizado);
            }

            if (!items.length) {
                container.innerHTML = `
                    <article class="daily-card neutral daily-card-wide">
                        <strong>Estado local</strong>
                        <div class="daily-value">Pendiente</div>
                        <p>No hay información diaria configurada todavía.</p>
                    </article>
                `;
                return;
            }

            container.innerHTML = items.map(renderItem).join("");
        })
        .catch(error => {
            console.error("Error cargando estado local:", error);
            container.innerHTML = `
                <article class="daily-card warning daily-card-wide">
                    <strong>Estado local</strong>
                    <div class="daily-value">No disponible</div>
                    <p>No se pudo cargar el panel diario. Revisa el archivo data/estado-local.json.</p>
                </article>
            `;
        });
})();
