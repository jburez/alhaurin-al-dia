// Lista compacta de «Actualidad»: titular, una línea, fuente y fecha.
// La usan /noticias/ (render-news-static.js) y la portada (render-home.js).

const { escapeHtml, formatDateLong } = require('./layout');

function oneLine(text = '', max = 120) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 60 ? space : max).trim()}…`;
}

function renderActualidadItem(noticia) {
  const href = `/${String(noticia.pagina || '').replace(/^\/+/, '')}`;
  const fecha = (noticia.fecha || '').slice(0, 10);
  return `<li class="alh-news-item">
                        <a class="alh-news-title" href="${escapeHtml(href)}">${escapeHtml(noticia.titulo || 'Noticia')}</a>
                        <p class="alh-news-line">${escapeHtml(oneLine(noticia.descripcion || noticia.resumen || ''))}</p>
                        <p class="alh-news-meta"><span>${escapeHtml(noticia.fuente || 'Fuente externa')}</span>${fecha ? ` · <time datetime="${escapeHtml(noticia.fecha)}">${escapeHtml(formatDateLong(fecha, { weekday: false }))}</time>` : ''}</p>
                    </li>`;
}

function renderActualidadList(noticias, { limit = 5 } = {}) {
  const { isAjena } = require('./noticias-ajenas');
  const items = (noticias || []).filter((n) => !isAjena(n)).slice(0, limit);
  if (!items.length) return '<p class="alh-empty">No hay titulares recientes.</p>';
  return `<ul class="alh-news-list">
                    ${items.map(renderActualidadItem).join('\n                    ')}
                </ul>`;
}

module.exports = { renderActualidadList, oneLine };
