const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOME_FILE = path.join(ROOT, 'index.html');
const NEWS_FILE = path.join(ROOT, 'data', 'noticias.json');
const GUIDE_FILE = path.join(ROOT, 'data', 'guia-util.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return fallback;
  }
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeLink(link = '#') {
  if (!link) return '#';
  const value = String(link).trim();
  if (value.startsWith('#') || value.startsWith('http://') || value.startsWith('https://') || value.startsWith('mailto:') || value.startsWith('tel:')) return value;
  return `./${value.replace(/^\/+/, '')}`;
}

function renderPlaceholder() {
  return '<div class="news-placeholder"><span>Alhaurín al Día</span></div>';
}

function renderFeaturedNews(noticia) {
  if (!noticia) return '<p class="empty-state">No hay noticias destacadas disponibles.</p>';

  const titulo = escapeHtml(noticia.titulo || 'Noticia local de Alhaurín el Grande');
  const descripcion = escapeHtml(noticia.descripcion || noticia.resumen || 'Actualidad local de Alhaurín el Grande.');
  const categoria = escapeHtml(noticia.categoria || 'Actualidad');
  const fuente = escapeHtml(noticia.fuente || '');
  const enlace = escapeHtml(normalizeLink(noticia.pagina || noticia.enlace || noticia.url || '#'));
  const imagen = noticia.imagen || '';

  return `
                    <article class="featured-news-card">
                        <div class="featured-news-image">
                            ${imagen ? `<img src="${escapeHtml(imagen)}" alt="${titulo}">` : renderPlaceholder()}
                        </div>
                        <div class="featured-news-content">
                            <span class="featured-label">Noticia destacada</span>
                            <div class="featured-meta">
                                <span class="tag">${categoria}</span>
                                ${fuente ? `<span class="source-mini-tag">${fuente}</span>` : ''}
                            </div>
                            <h2>${titulo}</h2>
                            <p>${descripcion}</p>
                            <a class="read-more" href="${enlace}">Leer noticia →</a>
                        </div>
                    </article>
  `.trim();
}

function renderNewsCard(noticia) {
  const titulo = escapeHtml(noticia.titulo || 'Noticia local de Alhaurín el Grande');
  const descripcion = escapeHtml(noticia.descripcion || noticia.resumen || 'Actualidad local de Alhaurín el Grande.');
  const categoria = escapeHtml(noticia.categoria || 'Actualidad');
  const fuente = escapeHtml(noticia.fuente || '');
  const enlace = escapeHtml(normalizeLink(noticia.pagina || noticia.enlace || noticia.url || '#'));
  const imagen = noticia.imagen || '';

  return `
                    <article class="content-card news-card">
                        ${imagen ? `
                        <div class="news-image">
                            <img src="${escapeHtml(imagen)}" alt="${titulo}" loading="lazy">
                        </div>` : `
                        <div class="news-image news-placeholder">
                            <span>Alhaurín al Día</span>
                        </div>`}
                        <div class="news-body">
                            <span class="tag">${categoria}</span>
                            <h3>${titulo}</h3>
                            <p>${descripcion}</p>
                        </div>
                        <div class="news-footer">
                            ${fuente ? `<small>${fuente}</small>` : ''}
                            <a class="read-more" href="${enlace}">Leer noticia →</a>
                        </div>
                    </article>
  `.trim();
}

function renderGuideCard(item) {
  const title = escapeHtml(item.titulo || 'Recurso local');
  const description = escapeHtml(item.descripcion || 'Información práctica para consultar rápidamente.');
  const category = escapeHtml(item.categoria || 'Guía útil');
  const icon = escapeHtml(item.icono || '•');
  const pageLink = escapeHtml(normalizeLink(item.pagina || item.enlace || `guia-util/${item.id || ''}/`));
  const items = (item.items || []).slice(0, 4).map(text => `<li>${escapeHtml(text)}</li>`).join('');
  const links = (item.links || []).slice(0, 2).map(link => `
                            <a href="${escapeHtml(normalizeLink(link.url || '#'))}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.texto || 'Abrir enlace')}</a>
  `.trim()).join('');

  return `
                    <article class="guide-card" id="${escapeHtml(item.id || '')}">
                        <div class="guide-card-top">
                            <div class="guide-icon">${icon}</div>
                            <div>
                                <span class="guide-category">${category}</span>
                                <h3>${title}</h3>
                            </div>
                        </div>
                        <p>${description}</p>
                        ${items ? `<ul>${items}</ul>` : ''}
                        ${links ? `<div class="guide-links">${links}</div>` : ''}
                        <a class="read-more" href="${pageLink}">${escapeHtml(item.cta || 'Ver ficha completa')} →</a>
                    </article>
  `.trim();
}

function replaceElementInnerHtml(html, elementId, innerHtml) {
  const pattern = new RegExp(`(<[^>]+id=["']${elementId}["'][^>]*>)([\\s\\S]*?)(<\\/div>)`, 'm');
  if (!pattern.test(html)) {
    throw new Error(`No se encontró el contenedor #${elementId}`);
  }
  return html.replace(pattern, `$1\n${innerHtml}\n                $3`);
}

function main() {
  const noticias = readJson(NEWS_FILE, []);
  const guia = readJson(GUIDE_FILE, []);
  let html = fs.readFileSync(HOME_FILE, 'utf8');

  const featured = noticias[0] || null;
  const latest = noticias.slice(1, 4);
  const guideItems = guia.slice(0, 6);

  html = replaceElementInnerHtml(html, 'featured-news', renderFeaturedNews(featured));
  html = replaceElementInnerHtml(html, 'news-container', latest.length ? latest.map(renderNewsCard).join('\n') : '<p class="empty-state">No hay noticias disponibles.</p>');
  html = replaceElementInnerHtml(html, 'guide-container', guideItems.length ? guideItems.map(renderGuideCard).join('\n') : '<p class="empty-state">No se ha podido cargar la guía útil.</p>');

  fs.writeFileSync(HOME_FILE, html);

  console.log('Home estática actualizada');
  console.log(`Noticia destacada: ${featured ? featured.titulo : 'ninguna'}`);
  console.log(`Noticias secundarias: ${latest.length}`);
  console.log(`Recursos guía: ${guideItems.length}`);
}

main();
