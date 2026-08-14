(function () {
    const list = document.getElementById("edictos-list");
    const updated = document.getElementById("edictos-updated");

    if (!list) return;

    function escapeHTML(value = "") {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function formatFecha(value) {
        if (!value) return "fecha sin confirmar";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "fecha sin confirmar";
        return date.toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
    }

    function sourceLabel(fuente) {
        if (fuente === "Sede Electrónica") return { tag: "Sede Electrónica", color: "#0369a1", bg: "#e0f2fe", cta: "Ver en Sede Electrónica →" };
        return { tag: "BOP Málaga", color: "#92400e", bg: "#fef3c7", cta: "Ver edicto completo en BOP Málaga →" };
    }

    function edictoCard(edicto) {
        const src = sourceLabel(edicto.fuente);
        const meta = [
            edicto.numero_edicto ? `Edicto ${escapeHTML(edicto.numero_edicto)}` : "",
            edicto.expediente ? `${escapeHTML(edicto.expediente)}` : "",
        ].filter(Boolean).join(" · ");

        return `
            <article class="edicto-card">
                <div class="edicto-meta">
                    <span class="tag" style="background:${src.bg};color:${src.color};">${src.tag}</span>
                    <span class="tag">${escapeHTML(edicto.organismo || "Ayuntamiento")}</span>
                    ${meta ? `<span class="daily-source">${meta}</span>` : ""}
                </div>
                <h3>Publicado el ${formatFecha(edicto.fecha_alerta)}</h3>
                <p>${escapeHTML(edicto.resumen || "Sin resumen disponible.")}</p>
                ${edicto.enlace ? `
                    <a class="read-more" href="${escapeHTML(edicto.enlace)}" target="_blank" rel="noopener noreferrer">
                        ${src.cta}
                    </a>
                ` : ""}
            </article>
        `;
    }

    function renderEdictos(edictos, filter) {
        const filtered = filter === "all" ? edictos :
            filter === "bop" ? edictos.filter(e => e.fuente !== "Sede Electrónica") :
            edictos.filter(e => e.fuente === "Sede Electrónica");

        if (updated) {
            const bopCount = edictos.filter(e => e.fuente !== "Sede Electrónica").length;
            const sedeCount = edictos.filter(e => e.fuente === "Sede Electrónica").length;
            updated.textContent = `${bopCount} del BOP · ${sedeCount} de la Sede Electrónica`;
        }

        if (!filtered.length) {
            list.innerHTML = `
                <article class="edicto-card">
                    <h3>Sin edictos registrados</h3>
                    <p>No se han encontrado edictos para este filtro.</p>
                </article>
            `;
            return;
        }

        list.innerHTML = filtered.map(edictoCard).join("");
    }

    fetch("../data/boletin-oficial.json")
        .then(response => {
            if (!response.ok) throw new Error("No se pudo cargar boletin-oficial.json");
            return response.json();
        })
        .then(data => {
            const edictos = Array.isArray(data) ? data : [];
            edictos.sort((a, b) => (b.fecha_alerta || "").localeCompare(a.fecha_alerta || ""));

            // Insert filter tabs before list
            const hasSede = edictos.some(e => e.fuente === "Sede Electrónica");
            if (hasSede && list.parentNode) {
                const tabs = document.createElement("div");
                tabs.style.cssText = "display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;";
                tabs.innerHTML = `
                    <button class="bop-filter-btn active" data-filter="all" style="padding:6px 14px;border-radius:20px;border:1px solid var(--line);background:var(--ink);color:#fff;font-size:13px;font-weight:700;cursor:pointer;">Todos</button>
                    <button class="bop-filter-btn" data-filter="bop" style="padding:6px 14px;border-radius:20px;border:1px solid var(--line);background:#fff;color:var(--ink);font-size:13px;font-weight:700;cursor:pointer;">BOP Málaga</button>
                    <button class="bop-filter-btn" data-filter="sede" style="padding:6px 14px;border-radius:20px;border:1px solid var(--line);background:#fff;color:var(--ink);font-size:13px;font-weight:700;cursor:pointer;">Sede Electrónica</button>
                `;
                list.parentNode.insertBefore(tabs, list);

                tabs.querySelectorAll(".bop-filter-btn").forEach(btn => {
                    btn.addEventListener("click", () => {
                        tabs.querySelectorAll(".bop-filter-btn").forEach(b => {
                            b.classList.remove("active");
                            b.style.background = "#fff";
                            b.style.color = "var(--ink)";
                        });
                        btn.classList.add("active");
                        btn.style.background = "var(--ink)";
                        btn.style.color = "#fff";
                        renderEdictos(edictos, btn.getAttribute("data-filter"));
                    });
                });
            }

            renderEdictos(edictos, "all");
        })
        .catch(error => {
            console.error("Error cargando el boletín oficial:", error);
            if (updated) updated.textContent = "Boletín oficial no disponible";
            list.innerHTML = `
                <article class="edicto-card">
                    <h3>No se pudo cargar el boletín oficial</h3>
                    <p>Revisa el archivo data/boletin-oficial.json.</p>
                </article>
            `;
        });
})();

