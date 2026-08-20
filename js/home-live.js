(async function () {
    const container = document.getElementById("daily-status");
    const updatedBox = document.getElementById("daily-updated");

    if (!container) return;

    const script = document.currentScript || document.querySelector('script[src$="home-live.js"]');
    const root = script ? new URL("../", script.src) : new URL("/", window.location.origin);
    const rules = await import(new URL("js/lib/estado-local-rules.js", root).href);

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

    function insertAndalmetWidget() {
        if (document.getElementById("home-andalmet-widget")) return;

        const dashboard = document.querySelector(".daily-dashboard");
        if (!dashboard || !dashboard.parentNode) return;

        const section = document.createElement("section");
        section.className = "weather-widget-section";
        section.id = "home-andalmet-widget";
        section.setAttribute("aria-labelledby", "home-weather-title");

        const iframe = document.createElement("iframe");
        iframe.src = "https://andalmet.es/widget/alhaurin-el-grande?size=full";
        iframe.width = "320";
        iframe.height = "150";
        iframe.loading = "lazy";
        iframe.title = "Tiempo en Alhaurín el Grande - Andalmet";
        iframe.setAttribute("frameborder", "0");

        section.innerHTML = `
            <div class="container">
                <article class="andalmet-widget-card andalmet-home-card">
                    <div>
                        <span class="section-kicker">Previsión ampliada</span>
                        <h2 id="home-weather-title">El tiempo en Alhaurín, por Andalmet.</h2>
                        <p>Widget oficial de Andalmet con previsión local ampliada para Alhaurín el Grande.</p>
                        <div class="actions">
                            <a class="btn btn-primary" href="${escapeHTML(normalizeLink("tiempo/"))}">Ver página del tiempo</a>
                            <a class="btn btn-secondary" href="https://andalmet.es/el-tiempo-en/alhaurin-el-grande" target="_blank" rel="noopener noreferrer">Abrir Andalmet</a>
                        </div>
                    </div>
                    <div class="andalmet-widget-frame" data-andalmet-frame></div>
                </article>
            </div>
        `;

        const frameBox = section.querySelector("[data-andalmet-frame]");
        if (frameBox) frameBox.appendChild(iframe);
        dashboard.insertAdjacentElement("afterend", section);
    }

    // Reglas de fusión/severidad/orden: compartidas con
    // scripts/render-home-widgets-static.js vía js/lib/estado-local-rules.js
    // (importado arriba como `rules`), para que la hidratación en el
    // navegador nunca pinte algo distinto a lo que sirvió el HTML estático.

    function renderItem(item) {
        const estado = item.estado || "neutral";
        const url = normalizeLink(item.url || "#");
        const isExternal = /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
        const cta = item.cta || "Ver más";
        const source = item.fuente ? `<span class="daily-source">Fuente: ${escapeHTML(item.fuente)}</span>` : "";
        const statusLabel = rules.getStatusLabel(estado);
        const extraBadges = item.actividadesMini ? `<div class="daily-act-strip">${item.actividadesMini}</div>` : "";

        return `
            <article class="daily-card ${escapeHTML(estado)}">
                <div class="daily-card-top">
                    <span class="daily-icon" aria-hidden="true">${escapeHTML(item.icono || "•")}</span>
                    <div>
                        <strong>${escapeHTML(item.titulo || "Estado")}</strong>
                        <span class="daily-status-badge">${escapeHTML(statusLabel)}</span>
                    </div>
                </div>
                <div class="daily-value">${escapeHTML(item.valor || "Consultar")}</div>
                <p>${escapeHTML(item.detalle || "Información pendiente de actualización.")}</p>
                ${extraBadges}
                ${source}
                <a class="daily-link" href="${escapeHTML(url)}" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ""}>
                    ${escapeHTML(cta)} →
                </a>
            </article>
        `;
    }

    insertAndalmetWidget();

    Promise.all([
        fetch(new URL("data/estado-local.json", root).href).then(response => {
            if (!response.ok) throw new Error("No se pudo cargar estado-local.json");
            return response.json();
        }),
        fetch(new URL("data/avisos-locales.json", root).href).then(response => {
            if (!response.ok) return { avisos: [] };
            return response.json();
        }).catch(() => ({ avisos: [] })),
        fetch(new URL("data/tiempo-aemet.json", root).href).then(response => {
            if (!response.ok) return null;
            return response.json();
        }).catch(() => null),
        fetch(new URL("data/avisos-oficiales.json", root).href).then(response => {
            if (!response.ok) return [];
            return response.json();
        }).catch(() => []),
        fetch(new URL("data/radar-trafico.json", root).href).then(response => {
            if (!response.ok) return null;
            return response.json();
        }).catch(() => null),
        fetch(new URL("data/agenda-local.json", root).href).then(response => {
            if (!response.ok) return { eventos: [] };
            return response.json();
        }).catch(() => ({ eventos: [] }))
    ])
        .then(([data, noticesData, weatherData, avisosOficialesData, radarTraficoData, agendaLocalData]) => {
            const baseItems = Array.isArray(data.items) ? data.items : [];
            const withWeather = rules.mergeWeather(baseItems, weatherData);
            // Orden de prioridad para "trafico"/"agenda": base < automático
            // (Radar Social / resumen de agenda) < aviso local manual (si lo
            // publican expresamente, gana al automatismo).
            const withRadarTrafico = rules.mergeRadarTrafico(withWeather, radarTraficoData);
            const withAgendaSummary = rules.mergeAgendaSummary(withRadarTrafico, agendaLocalData);
            const withLocalNotices = rules.mergeLocalNotices(withAgendaSummary, noticesData);
            const merged = rules.mergeAvisosOficiales(withLocalNotices, avisosOficialesData);
            // Un aviso "alert" gana la primera posición de la rejilla en vez
            // de depender del orden en que llegaron los datos.
            const items = rules.sortBySeverity(merged);

            // El badge "Actualizado" debe reflejar la fuente más fresca que de
            // verdad alimenta lo que se ve en pantalla (p. ej. el tiempo se
            // refresca varias veces al día aunque el resto del panel no
            // cambie), no solo la fecha del archivo base estado-local.json.
            const activosOficiales = (Array.isArray(avisosOficialesData) ? avisosOficialesData : []).filter(rules.isActiveAvisoOficial);
            const ultimoOficial = activosOficiales.length
                ? activosOficiales.reduce((max, aviso) => {
                    const fecha = new Date(aviso.actualizado_en || aviso.inicio || 0);
                    if (Number.isNaN(fecha.getTime())) return max;
                    return (!max || fecha > max) ? fecha : max;
                }, null)
                : null;
            const noticiasActivas = Array.isArray(noticesData?.avisos) && noticesData.avisos.some(rules.isActiveNotice);
            const radarTraficoActivo = Boolean(radarTraficoData?.reportes?.length);
            const agendaSummaryActiva = rules.getUpcomingAgendaEvents(Array.isArray(agendaLocalData?.eventos) ? agendaLocalData.eventos : []).length > 0;

            const updatedDate = rules.pickLatestDate(
                data.actualizado,
                weatherData?.actualizado,
                noticiasActivas ? noticesData.actualizado : null,
                ultimoOficial,
                radarTraficoActivo ? radarTraficoData.actualizado : null,
                agendaSummaryActiva ? agendaLocalData.actualizado : null
            );
            const updated = updatedDate ? updatedDate.toISOString() : data.actualizado;

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
