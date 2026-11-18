// Filtros de /agenda/: Hoy · Este fin de semana · Este mes · categoría.
// El listado completo ya está en el HTML (lo lee Google); esto solo oculta
// elementos en el navegador. Sin JavaScript, se ve todo.
(function () {
  var dateBar = document.querySelector('[data-agenda-filtros]');
  var catBar = document.querySelector('[data-agenda-categorias]');
  var items = Array.prototype.slice.call(document.querySelectorAll('[data-agenda-item]'));
  var empty = document.querySelector('[data-agenda-vacio]');
  if (!dateBar || !items.length) return;

  function madridToday() {
    var parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    return parts; // AAAA-MM-DD
  }
  function addDays(iso, n) {
    var d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function weekend(today) {
    var wd = new Date(today + 'T12:00:00Z').getUTCDay();
    var fri = wd === 5 ? today : wd === 6 ? addDays(today, -1) : wd === 0 ? addDays(today, -2) : addDays(today, 5 - wd);
    return [fri, addDays(fri, 2)];
  }

  var today = madridToday();
  var ranges = {
    todo: null,
    hoy: [today, today],
    finde: weekend(today),
    mes: [today, today.slice(0, 7) + '-31'],
  };
  var state = { filtro: 'todo', categoria: '' };

  function apply() {
    var range = ranges[state.filtro];
    var visible = 0;
    items.forEach(function (li) {
      var ok = true;
      if (range) ok = li.dataset.inicio <= range[1] && li.dataset.fin >= range[0];
      if (ok && state.categoria) ok = li.dataset.categoria === state.categoria;
      li.hidden = !ok;
      if (ok) visible++;
    });
    document.querySelectorAll('[data-agenda-mes]').forEach(function (sec) {
      sec.hidden = !sec.querySelector('[data-agenda-item]:not([hidden])');
    });
    if (empty) empty.hidden = visible > 0;
  }

  function bind(bar, key, attr) {
    if (!bar) return;
    bar.hidden = false;
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('button[' + attr + ']');
      if (!btn) return;
      state[key] = btn.getAttribute(attr);
      bar.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b === btn)); });
      apply();
    });
  }

  bind(dateBar, 'filtro', 'data-filtro');
  bind(catBar, 'categoria', 'data-categoria');

  // Permite enlazar /agenda/#hoy, #finde o #mes.
  var hash = (location.hash || '').replace('#', '');
  if (ranges.hasOwnProperty(hash)) {
    var btn = dateBar.querySelector('[data-filtro="' + hash + '"]');
    if (btn) btn.click();
  }
})();
