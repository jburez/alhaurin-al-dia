(function () {
    const container = document.getElementById("daily-status");
    const updatedBox = document.getElementById("daily-updated");

    if (!container) return;

    const script = document.currentScript || document.querySelector('script[src$="home-live.js"]');
    const root = script ? new URL("../", script.src) : new URL("/", window.location.origin);

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

    function getStatusLabel(estado = "neutral") {
        return {
            ok: "Normal",
            warning: "Aviso",
            alert: "Atención",
            neutral: "Info"
        }[estado] || "Info";
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

    function getNoticeTarget(notice) {
        const type = String(notice.tipo || "").toLowerCase();
        const title = String(notice.titulo || "").toLowerCase();
        const text = `${type} ${title}`;

        if (text.includes("tráfico") || text.includes("trafico") || text.includes("calle") || text.includes("carretera") || text.includes("desvío") || text.includes("desvio")) {
            return "trafico";
        }

        if (text.includes("procesión") || text.includes("procesion") || text.includes("evento") || text.includes("agenda") || text.includes("feria") || text.includes("romería") || text.includes("romeria")) {
            return "agenda";
        }

        return "avisos";
    }

    function buildCardForTarget(target, notices = []) {
        const targetNotices = notices
            .filter(isActiveNotice)
            .filter(notice => getNoticeTarget(notice) === target)
            .sort((a, b) => getSeverityWeight(b.estado) - getSeverityWeight(a.estado));

        if (!targetNotices.length) return null;

        const mainNotice = targetNotices[0];
        const countSuffix = targetNotices.length > 1 ? ` · ${targetNotices.length} avisos activos` : "";
        const titles = {
            avisos: "Avisos locales",
            trafico: "Tráfico",
            agenda: "Agenda"
        };

        return {
            id: target,
            icono: mainNotice.icono || "📢",
            titulo: titles[target] || "Avisos locales",
            valor: mainNotice.valor || mainNotice.titulo || "Aviso activo",
            detalle: `${mainNotice.detalle || "Hay un aviso local activo."}${countSuffix}`,
            estado: mainNotice.estado || "warning",
            fuente: mainNotice.fuente || "Alhaurín al Día",
            cta: mainNotice.cta || "Ver avisos",
            url: mainNotice.url || "./avisos/"
        };
    }

    function mergeLocalNotices(items, noticesData) {
        const notices = Array.isArray(noticesData?.avisos) ? noticesData.avisos : [];
        const cardsByTarget = {
            avisos: buildCardForTarget("avisos", notices),
            trafico: buildCardForTarget("trafico", notices),
            agenda: buildCardForTarget("agenda", notices)
        };

        const replacedTargets = new Set();
        const merged = items.map(item => {
            const replacement = cardsByTarget[item.id];
            if (replacement) {
                replacedTargets.add(item.id);
                return replacement;
            }
            return item;
        });

        Object.entries(cardsByTarget).forEach(([target, card]) => {
            if (card && !replacedTargets.has(target)) {
                merged.push(card);
            }
        });

        return merged;
    }

    function isActiveAvisoOficial(aviso) {
        return Boolean(aviso) && aviso.estado_ciclo_vida !== "finalizado" && isActiveNotice(aviso);
    }

    function nivelToEstado(nivel) {
        const value = String(nivel || "").toLowerCase();
        if (value === "naranja" || value === "rojo") return "alert";
        return "warning";
    }

    function buildCardFromAvisoOficial(aviso) {
        const nivel = aviso.nivel ? ` (nivel ${aviso.nivel})` : "";
        return {
            id: "avisos",
            icono: "⚠️",
            titulo: "Avisos",
            valor: `${aviso.fenomeno || aviso.titulo || "Aviso activo"}${nivel}`,
            detalle: aviso.descripcion || "Aviso meteorológico oficial activo.",
            estado: nivelToEstado(aviso.nivel),
            fuente: aviso.fuente || "AEMET",
            cta: "Ver aviso oficial",
            url: aviso.fuente_url || "./avisos/"
        };
    }

    function mergeAvisosOficiales(items, avisosOficialesData) {
        const avisos = Array.isArray(avisosOficialesData) ? avisosOficialesData : [];
        const activos = avisos
            .filter(isActiveAvisoOficial)
            .sort((a, b) => getSeverityWeight(nivelToEstado(b.nivel)) - getSeverityWeight(nivelToEstado(a.nivel)));

        if (!activos.length) return items;

        // Un aviso oficial activo tiene prioridad sobre un aviso manual de
        // data/avisos-locales.json en el mismo hueco de portada.
        const card = buildCardFromAvisoOficial(activos[0]);
        const replaced = items.some(item => item.id === "avisos");
        const merged = items.map(item => (item.id === "avisos" ? card : item));
        return replaced ? merged : [...merged, card];
    }

    function pickLatestDate(...values) {
        let latest = null;
        for (const value of values) {
            if (!value) continue;
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) continue;
            if (!latest || date > latest) latest = date;
        }
        return latest;
    }

    function mergeWeather(items, weatherData) {
        const weatherItem = weatherData?.item;
        if (!weatherItem || typeof weatherItem !== "object") return items;

        const cleaned = items.filter(item => item.id !== "tiempo" && item.id !== "andalmet");
        return [weatherItem, ...cleaned];
    }

    function renderItem(item) {
        const estado = item.estado || "neutral";
        const url = normalizeLink(item.url || "#");
        const isExternal = /^https?:\/\//i.test(url) && !url.startsWith(window.location.origin);
        const cta = item.cta || "Ver más";
        const source = item.fuente ? `<span class="daily-source">Fuente: ${escapeHTML(item.fuente)}</span>` : "";
        const statusLabel = getStatusLabel(estado);

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
        }).catch(() => [])
    ])
        .then(([data, noticesData, weatherData, avisosOficialesData]) => {
            const baseItems = Array.isArray(data.items) ? data.items : [];
            const withWeather = mergeWeather(baseItems, weatherData);
            const withLocalNotices = mergeLocalNotices(withWeather, noticesData);
            const items = mergeAvisosOficiales(withLocalNotices, avisosOficialesData);

            // El badge "Actualizado" debe reflejar la fuente más fresca que de
            // verdad alimenta lo que se ve en pantalla (p. ej. el tiempo se
            // refresca varias veces al día aunque el resto del panel no
            // cambie), no solo la fecha del archivo base estado-local.json.
            const activosOficiales = (Array.isArray(avisosOficialesData) ? avisosOficialesData : []).filter(isActiveAvisoOficial);
            const ultimoOficial = activosOficiales.length
                ? activosOficiales.reduce((max, aviso) => {
                    const fecha = new Date(aviso.actualizado_en || aviso.inicio || 0);
                    if (Number.isNaN(fecha.getTime())) return max;
                    return (!max || fecha > max) ? fecha : max;
                }, null)
                : null;
            const noticiasActivas = Array.isArray(noticesData?.avisos) && noticesData.avisos.some(isActiveNotice);

            const updatedDate = pickLatestDate(
                data.actualizado,
                weatherData?.actualizado,
                noticiasActivas ? noticesData.actualizado : null,
                ultimoOficial
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
