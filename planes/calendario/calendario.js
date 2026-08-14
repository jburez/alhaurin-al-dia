(function () {
  "use strict";

  // ── Category color system ──
  const CATEGORIES = [
    { id: "virgen",     name: "Virgen de Gracia",      color: "#7EC8E3", keywords: ["virgen", "gracia", "patrona"] },
    { id: "cultos",     name: "Cultos y procesiones",  color: "#7EC8E3", keywords: ["procesión", "procesion", "triduo", "ofrenda", "traslado procesional", "traslado", "ermita", "festividad"] },
    { id: "nazareno",   name: "Hdad. Jesús Nazareno",  color: "#8B5CF6", keywords: ["nazareno", "jesús nazareno", "padre jesús", "padre jesus"] },
    { id: "veracruz",   name: "Santa Vera Cruz",       color: "#22C55E", keywords: ["vera cruz", "veracruz"] },
    { id: "futbol",     name: "Fútbol",                color: "#EF4444", keywords: ["fútbol", "futbol", "cd alhaurino", "alhaurino vs", "málaga cf", "🆚"] },
    { id: "motor",      name: "Motor",                 color: "#6366F1", keywords: ["moto gp", "formula 1", "motogp", "🏍"] },
    { id: "musica",     name: "Música en vivo",        color: "#F59E0B", keywords: ["music", "músic", "dj ", "🎶", "🎸", "🎙", "concierto", "live music"] },
    { id: "gastro",     name: "Gastronomía",           color: "#EC4899", keywords: ["gastro", "tomate", "brunch", "ruta gastro", "🍽", "🍅"] },
  ];
  const DEFAULT_CAT = { id: "otros", name: "Otros eventos", color: "#6B7280" };

  function getCategory(event) {
    const text = `${event.titulo || ""} ${event.tipo || ""} ${event.descripcion || ""}`.toLowerCase();
    for (const cat of CATEGORIES) {
      if (cat.keywords.some(kw => text.includes(kw))) return cat;
    }
    return DEFAULT_CAT;
  }

  // ── Helpers ──
  const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const DIAS_SEMANA = ["L","M","X","J","V","S","D"];

  function esc(v) { return String(v || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function pad2(n) { return String(n).padStart(2, "0"); }

  function dateKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }

  function formatTime(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }

  function formatDayLong(dateStr) {
    try {
      const d = new Date(dateStr + "T12:00:00");
      return d.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
    } catch { return dateStr; }
  }

  function isToday(dateStr) {
    return dateStr === dateKey(new Date());
  }

  function isPast(dateStr) {
    const today = dateKey(new Date());
    return dateStr < today;
  }

  // ── State ──
  let allEvents = [];
  let currentYear, currentMonth;

  // ── DOM refs ──
  const monthTitle = document.getElementById("cal-month-title");
  const prevBtn = document.getElementById("cal-prev");
  const nextBtn = document.getElementById("cal-next");
  const todayBtn = document.getElementById("cal-today");
  const gridEl = document.getElementById("cal-grid");
  const listEl = document.getElementById("cal-list");
  const legendEl = document.getElementById("cal-legend");

  // ── Render legend ──
  function renderLegend() {
    const cats = new Set();
    allEvents.forEach(e => cats.add(getCategory(e).id));
    const items = CATEGORIES.filter(c => cats.has(c.id));
    if (cats.has("otros")) items.push(DEFAULT_CAT);
    legendEl.innerHTML = items.map(c =>
      `<span class="cal-legend-item"><span class="cal-legend-dot" style="background:${c.color}"></span>${esc(c.name)}</span>`
    ).join("");
  }

  // ── Build events index for a month ──
  function eventsForMonth(year, month) {
    const map = {};
    allEvents.forEach(e => {
      if (!e.inicio) return;
      const d = new Date(e.inicio);
      if (d.getFullYear() !== year || d.getMonth() !== month) return;
      const key = dateKey(d);
      if (!map[key]) map[key] = [];
      map[key].push(e);
    });
    return map;
  }

  // ── Render calendar grid ──
  function renderGrid(year, month) {
    const evMap = eventsForMonth(year, month);
    const firstDay = new Date(year, month, 1);
    let startDow = firstDay.getDay(); // 0=Sun
    startDow = startDow === 0 ? 6 : startDow - 1; // Convert to Mon=0
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = DIAS_SEMANA.map(d => `<div class="cal-dow">${d}</div>`).join("");

    // Empty cells before first day
    for (let i = 0; i < startDow; i++) html += `<div class="cal-cell cal-empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${pad2(month+1)}-${pad2(day)}`;
      const events = evMap[key] || [];
      const todayCls = isToday(key) ? " cal-today" : "";
      const pastCls = isPast(key) ? " cal-past" : "";

      let pills = "";
      events.slice(0, 3).forEach(e => {
        const cat = getCategory(e);
        const title = (e.titulo || "Evento").replace(/[\ud800-\udbff][\udc00-\udfff]\s*/g, "").substring(0, 22);
        pills += `<div class="cal-pill" style="background:${cat.color}22;color:${cat.color};border-left:3px solid ${cat.color}" title="${esc(e.titulo)}">${esc(title)}</div>`;
      });
      if (events.length > 3) {
        pills += `<div class="cal-pill-more">+${events.length - 3} más</div>`;
      }

      html += `<div class="cal-cell${todayCls}${pastCls}" data-date="${key}">
        <span class="cal-day-num">${day}</span>
        ${pills}
      </div>`;
    }

    gridEl.innerHTML = html;

    // Click handler for cells
    gridEl.querySelectorAll(".cal-cell[data-date]").forEach(cell => {
      cell.addEventListener("click", function() {
        const target = document.getElementById("day-" + this.dataset.date);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  // ── Render event list ──
  function renderList(year, month) {
    const evMap = eventsForMonth(year, month);
    const keys = Object.keys(evMap).sort();

    if (!keys.length) {
      listEl.innerHTML = `<div class="cal-no-events"><p>No hay eventos programados para ${MESES[month]} ${year}.</p></div>`;
      return;
    }

    let html = "";
    keys.forEach(key => {
      const events = evMap[key];
      const dayLabel = formatDayLong(key);
      const todayCls = isToday(key) ? " cal-day-today" : "";

      html += `<div class="cal-day-group${todayCls}" id="day-${key}">
        <h3 class="cal-day-label">${esc(dayLabel)}</h3>`;

      events.forEach(e => {
        const cat = getCategory(e);
        const time = formatTime(e.inicio);
        const linkAttr = e.url ? `href="${esc(e.url)}" target="_blank" rel="noopener noreferrer"` : `href="#"`;

        html += `<a class="cal-event-card" ${linkAttr} style="border-left:4px solid ${cat.color}">
          <div class="cal-event-time">${esc(time)}</div>
          <div class="cal-event-body">
            <span class="cal-event-badge" style="background:${cat.color}22;color:${cat.color}">${esc(cat.name)}</span>
            <h4>${esc(e.titulo)}</h4>
            ${e.descripcion ? `<p>${esc(e.descripcion.substring(0, 120))}${e.descripcion.length > 120 ? "..." : ""}</p>` : ""}
            ${e.lugar ? `<small>📍 ${esc(e.lugar)}</small>` : ""}
          </div>
          <span class="cal-event-arrow">→</span>
        </a>`;
      });

      html += `</div>`;
    });

    listEl.innerHTML = html;
  }

  // ── Navigation ──
  function render() {
    monthTitle.textContent = `${MESES[currentMonth]} ${currentYear}`;
    renderGrid(currentYear, currentMonth);
    renderList(currentYear, currentMonth);
  }

  prevBtn.addEventListener("click", () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    render();
  });

  nextBtn.addEventListener("click", () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    render();
  });

  todayBtn.addEventListener("click", () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    render();
    // Scroll to today's events
    setTimeout(() => {
      const todayEl = document.getElementById("day-" + dateKey(now));
      if (todayEl) todayEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  });

  // ── Init ──
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

  fetch("../../data/agenda-local.json")
    .then(r => { if (!r.ok) throw new Error(); return r.json(); })
    .then(data => {
      allEvents = (data.eventos || []).filter(e => e.activo !== false);
      renderLegend();
      render();
    })
    .catch(() => {
      listEl.innerHTML = `<div class="cal-no-events"><p>Error cargando eventos. <a href="/">Volver al inicio</a></p></div>`;
    });
})();
