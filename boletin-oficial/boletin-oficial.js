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

    function edictoCard(edicto) {
        const meta = [
            edicto.numero_edicto ? `Edicto ${escapeHTML(edicto.numero_edicto)}` : "",
            edicto.expediente ? `Expediente ${escapeHTML(edicto.expediente)}` : "",
        ].filter(Boolean).join(" · ");

        return `
            <article class="edicto-card">
                <div class="edicto-meta">
                    <span class="tag">${escapeHTML(edicto.organismo || "BOP Málaga")}</span>
                    ${meta ? `<span class="daily-source">${meta}</span>` : ""}
                </div>
                <h3>Publicado el ${formatFecha(edicto.fecha_alerta)}</h3>
                <p>${escapeHTML(edicto.resumen || "Sin resumen disponible.")}</p>
                ${edicto.enlace ? `
                    <a class="read-more" href="${escapeHTML(edicto.enlace)}" target="_blank" rel="noopener noreferrer">
                        Ver edicto completo en BOP Málaga →
                    </a>
                ` : ""}
            </article>
        `;
    }

    fetch("../data/boletin-oficial.json")
        .then(response => {
            if (!response.ok) throw new Error("No se pudo cargar boletin-oficial.json");
            return response.json();
        })
        .then(data => {
            const edictos = Array.isArray(data) ? data : [];
            edictos.sort((a, b) => (b.fecha_alerta || "").localeCompare(a.fecha_alerta || ""));

            if (updated) {
                updated.textContent = edictos.length
                    ? `${edictos.length} edicto${edictos.length === 1 ? "" : "s"} registrado${edictos.length === 1 ? "" : "s"}`
                    : "Sin edictos registrados";
            }

            if (!edictos.length) {
                list.innerHTML = `
                    <article class="edicto-card">
                        <h3>Sin edictos registrados</h3>
                        <p>Todavía no se ha detectado ningún edicto del BOP Málaga para Alhaurín el Grande.</p>
                    </article>
                `;
                return;
            }

            list.innerHTML = edictos.map(edictoCard).join("");
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
