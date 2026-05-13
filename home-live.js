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

    function getSeverityWeight(estado = "") {
        return {
            alert: 4,
            warning: 3,
            ok: 2,
            neutral: 1
        }[estado] || 1;
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

    function buildNoticeCard(notices = []) {
        const activeNotices = notices
            .filter(isActiveNotice)
            .sort((a, b) => getSeverityWeight(b.estado) - getSeverityWeight(a.estado));

        if (!activeNotices.length) return null;

        const mainNotice = activeNotices[0];
        const countSuffix = activeNotices.length > 1 ? ` · ${activeNotices.length} avisos activos` : "";

        return {
            id: "avisos",
            icono: mainNotice.icono || "📢",
            titulo: "Avisos locales",
            valor: mainNotice.valor || mainNotice.titulo || "Aviso activo",
            detalle: `${mainNotice.detalle || "Hay un aviso local activo."}${countSuffix}`,
            estado: mainNotice.estado || "warning",
            fuente: mainNotice.fuente || "Alhaurín al Día",
            cta: mainNotice.cta || "Ver aviso",
            url: mainNotice.url || "./guia-util/"
        };
    }

    function mergeLocalNotices(items, noticesData) {
        const noticeCard = buildNoticeCard(Array.isArray(noticesData?.avisos) ? noticesData.avisos : []);
        if (!noticeCard) return items;

        let replaced = false;
        const merged = items.map(item => {
            if (item.id === "avisos") {
                replaced = true;
                return noticeCard;
            }
            return item;
        });

        if (!replaced) merged.push(noticeCard);
        return merged;
    }

    function renderItem(item) {
        const estado = item.estado || "neutral";
        const url = normalizeLink(item.url || "#");
        const isExternal = /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
        const cta = item.cta || "Ver más";
        const source = item.fuente ? `<span class="daily-source">Fuente: ${escapeHTML(item.fuente)}</span>` : "";

        return `
            <article class="daily-card ${escapeHTML(estado)}">
                <div class="daily-card-top">
                    <span class="daily-icon" aria-hidden="true">${escapeHTML(item.icono || "•")}</span>
                    <strong>${escapeHTML(item.titulo || "Estado")}</strong>
                </div>
                <div class="daily-value">${escapeHTML(item.valor || "Consultar")}</div>
                <p>${escapeHTML(item.detalle || "Información pendiente de actualización.")}</p>
                ${source}
                <a class="daily-link" href="${escapeHTML(url)}" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ""}>
                    ${escapeHTML(cta)} →
                </a>
            </article>
        `;
    }

    Promise.all([
        fetch(new URL("data/estado-local.json", root).href).then(response => {
            if (!response.ok) throw new Error("No se pudo cargar estado-local.json");
            return response.json();
        }),
        fetch(new URL("data/avisos-locales.json", root).href).then(response => {
            if (!response.ok) return { avisos: [] };
            return response.json();
        }).catch(() => ({ avisos: [] }))
    ])
        .then(([data, noticesData]) => {
            const baseItems = Array.isArray(data.items) ? data.items : [];
            const items = mergeLocalNotices(baseItems, noticesData);
            const updated = noticesData?.actualizado && Array.isArray(noticesData.avisos) && noticesData.avisos.some(isActiveNotice)
                ? noticesData.actualizado
                : data.actualizado;

            if (updatedBox) {
                updatedBox.textContent = formatUpdated(updated);
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
