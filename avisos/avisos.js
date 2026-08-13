(function () {
    const activeList = document.getElementById("local-notices-list");
    const historyList = document.getElementById("notices-history-list");
    const radarList = document.getElementById("radar-reports-list");

    function esc(v) { return String(v || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

    function fmtDate(iso) {
        try {
            const d = new Date(iso);
            return d.toLocaleDateString("es-ES", { day: "numeric", month: "short" }) + " · " +
                   d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
        } catch { return iso; }
    }

    function noticeCard(n, resolved) {
        const badge = resolved
            ? '<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:var(--accent-soft);color:var(--accent);font-size:11px;font-weight:700;">✅ Resuelto</span>'
            : `<span class="tag">${esc(n.tipo || "Aviso")}</span>`;
        const link = n.url && !resolved
            ? `<a class="read-more" href="${esc(n.url)}">${esc(n.cta || "Ver detalle")} →</a>`
            : n.url && resolved
            ? `<a class="read-more" href="${esc(n.url)}" style="color:var(--muted);">Ver noticia →</a>`
            : "";
        const dates = n.inicio
            ? `<span style="font-size:12px;color:var(--muted);">${fmtDate(n.inicio)}${n.fin ? " — " + fmtDate(n.fin) : ""}</span>`
            : "";
        const opacity = resolved ? 'style="opacity:.7;"' : '';
        return `<article class="notice-card daily-card ${resolved ? 'neutral' : esc(n.estado || 'neutral')}" ${opacity}>
            <div class="notice-icon">${esc(n.icono || "📢")}</div>
            <div>
                ${badge}
                <h3>${esc(n.titulo)}</h3>
                ${dates}
                <p>${esc(n.detalle)}</p>
                ${n.fuente ? `<span class="daily-source">Fuente: ${esc(n.fuente)}</span>` : ""}
                ${link}
            </div>
        </article>`;
    }

    // Load official avisos
    fetch("../data/avisos-locales.json")
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => {
            // Active
            const now = new Date();
            const active = (data.avisos || []).filter(n => {
                if (n.activo === false) return false;
                const ends = n.fin ? new Date(n.fin) : null;
                if (ends && ends < now) return false;
                return true;
            });

            if (activeList) {
                activeList.innerHTML = active.length
                    ? active.map(n => noticeCard(n, false)).join("")
                    : `<article class="notice-card"><div class="notice-icon">✅</div><div><h3>Sin avisos activos</h3><p>No constan cortes de agua, luz, tráfico ni incidencias activas en este momento.</p></div></article>`;
            }

            // History
            const history = data.historial || [];
            if (historyList) {
                historyList.innerHTML = history.length
                    ? history.map(n => noticeCard(n, true)).join("")
                    : '<p style="color:var(--muted); font-size:14px;">No hay avisos anteriores registrados.</p>';
            }
        })
        .catch(() => {
            if (activeList) activeList.innerHTML = '<article class="notice-card"><div class="notice-icon">⚠️</div><div><h3>Error cargando avisos</h3><p>Inténtalo de nuevo más tarde.</p></div></article>';
        });

    // Load Radar Social reports from localStorage
    function loadRadarReports() {
        if (!radarList) return;
        try {
            const stored = JSON.parse(localStorage.getItem("alhaurin_radar_reports") || "[]");
            const recent = stored.slice(0, 5); // Last 5 reports
            if (!recent.length) {
                radarList.innerHTML = '<article class="notice-card"><div class="notice-icon">📡</div><div><h3>Sin reportes vecinales recientes</h3><p>Los vecinos aún no han publicado reportes. <a href="/radar-social/" style="color:var(--accent);font-weight:700;">Publica el primero →</a></p></div></article>';
                return;
            }
            const typeIcons = { lluvia:"🌧️", tormenta:"⚡", granizo:"🧊", viento:"💨", arroyo:"🌊", "corte-trafico":"🚧", incidencia:"⚠️" };
            radarList.innerHTML = recent.map(r => {
                const icon = typeIcons[r.type] || "📡";
                return `<article class="notice-card daily-card neutral">
                    <div class="notice-icon">${icon}</div>
                    <div>
                        <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#fff3e0;color:#e65100;font-size:11px;font-weight:700;">Reporte vecinal</span>
                        <h3>${esc(r.title)}</h3>
                        <span style="font-size:12px;color:var(--muted);">${r.date ? fmtDate(r.date) : ""} · Por ${esc(r.name || "Anónimo")}</span>
                        ${r.street ? `<div style="font-size:12px;color:var(--muted);margin-top:2px;">📍 ${esc(r.street)}</div>` : ""}
                        <p>${esc(r.desc)}</p>
                    </div>
                </article>`;
            }).join("");
        } catch {
            radarList.innerHTML = '<p style="color:var(--muted); font-size:14px;">No se pudieron cargar los reportes vecinales.</p>';
        }
    }
    loadRadarReports();
})();
