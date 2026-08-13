(function () {
    const list = document.getElementById("local-notices-list");
    const updated = document.getElementById("notices-updated");

    if (!list) return;

    function escapeHTML(value = "") {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function formatUpdated(value) {
        if (!value) return "Actualización pendiente";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "Actualización pendiente";
        return `Actualizado ${date.toLocaleDateString("es-ES", { day: "2-digit", month: "long" })} a las ${date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
    }

    function isActiveNotice(notice) {
        if (!notice || notice.activo === false) return false;

        const now = new Date();
        const starts = notice.inicio ? new Date(notice.inicio) : null;
        const ends = notice.fin ? new Date(notice.fin) : null;

        if (starts && !Number.isNaN(starts.getTime()) && starts > now) return false;
        if (ends && !Number.isNaN(ends.getTime()) && ends < now) return false;

        return true;
    }

    function noticeCard(notice) {
        const rawUrl = (notice.url || "").trim();
        const isSelfPage = !rawUrl || rawUrl === "#" || rawUrl === "./avisos/" || rawUrl === "/avisos/" || rawUrl === "avisos/";

        let link = "";
        if (!isSelfPage) {
            const url = rawUrl.startsWith("http://") || rawUrl.startsWith("https://") || rawUrl.startsWith("/")
                ? rawUrl
                : "https://alhaurinaldia.es/" + rawUrl.replace(/^\.?\/+/, "");
            const isExternal = /^https?:\/\//i.test(url) && !url.startsWith("https://alhaurinaldia.es");
            link = `
                <a class="read-more" href="${escapeHTML(url)}" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ""}>
                    ${escapeHTML(notice.cta || "Ver detalle")} →
                </a>
            `;
        }

        return `
            <article class="notice-card daily-card ${escapeHTML(notice.estado || "neutral")}">
                <div class="notice-icon">${escapeHTML(notice.icono || "📢")}</div>
                <div>
                    <span class="tag">${escapeHTML(notice.tipo || "Aviso")}</span>
                    <h3>${escapeHTML(notice.titulo || "Aviso local")}</h3>
                    <p>${escapeHTML(notice.detalle || "Información pendiente de completar.")}</p>
                    ${notice.fuente ? `<span class="daily-source">Fuente: ${escapeHTML(notice.fuente)}</span>` : ""}
                    ${link}
                </div>
            </article>
        `;
    }

    fetch("../data/avisos-locales.json")
        .then(response => {
            if (!response.ok) throw new Error("No se pudo cargar avisos-locales.json");
            return response.json();
        })
        .then(data => {
            if (updated) updated.textContent = formatUpdated(data.actualizado);

            const active = Array.isArray(data.avisos) ? data.avisos.filter(isActiveNotice) : [];

            if (!active.length) {
                list.innerHTML = `
                    <article class="notice-card">
                        <div class="notice-icon">✅</div>
                        <div>
                            <h3>Sin avisos locales activos</h3>
                            <p>No constan cortes de agua, luz, tráfico, procesiones, obras o incidencias locales activas en este momento.</p>
                        </div>
                    </article>
                `;
                return;
            }

            list.innerHTML = active.map(noticeCard).join("");
        })
        .catch(error => {
            console.error("Error cargando avisos locales:", error);
            list.innerHTML = `
                <article class="notice-card">
                    <div class="notice-icon">⚠️</div>
                    <div>
                        <h3>No se pudieron cargar los avisos</h3>
                        <p>Revisa el archivo data/avisos-locales.json.</p>
                    </div>
                </article>
            `;
        });
})();
