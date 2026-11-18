// Genera las guías prácticas a partir de data/guias.json:
//
//   /guias/                 índice por categorías (solo guías publicadas)
//   /guias/<slug>/          una página por guía
//
// Las guías en estado "borrador" se generan con noindex, no salen en el
// índice, ni en la portada, ni en sitemap-guias.xml, y ninguna guía publicada
// enlaza a ellas.
//
// Uso: node scripts/render-guias.js

const fs = require('fs');
const path = require('path');
const {
  SITE_URL, PUBLISHER, escapeHtml, renderPage, renderBreadcrumbs, breadcrumbSchema,
  adSlot, formatDateLong, writeIfChanged,
} = require('./lib/layout');
const { CATEGORIAS_GUIA, loadGuias, isPublicada, guideUrl } = require('./lib/guias');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'guias');
const GUIA_UTIL_FILE = path.join(ROOT, 'data', 'guia-util.json');

function stripTags(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function pendingAware(text = '') {
  // Resalta los marcadores [PENDIENTE: …] para que se vean en la revisión.
  return escapeHtml(text).replace(/\[PENDIENTE[^\]]*\]/g, (m) => `<mark class="alh-pending">${m}</mark>`);
}

function renderKeyData(datos = []) {
  if (!datos.length) return '';
  const rows = datos.map((d) => `<dt>${escapeHtml(d.etiqueta)}</dt><dd>${pendingAware(d.valor)}</dd>`).join('\n                        ');
  return `<aside class="alh-key-data" aria-labelledby="datos-clave">
                    <h2 id="datos-clave">Datos clave</h2>
                    <dl>
                        ${rows}
                    </dl>
                </aside>`;
}

function renderSections(secciones = []) {
  if (!secciones.length) return '';
  // Hueco de anuncio en mitad del contenido (tras la mitad de las secciones).
  const mid = Math.max(1, Math.ceil(secciones.length / 2));
  return secciones.map((s, i) => {
    const block = `<section class="alh-guide-section">
                    <h2>${escapeHtml(s.titulo)}</h2>
                    ${s.html || ''}
                </section>`;
    return i === mid - 1 ? `${block}\n                ${adSlot('guia-mitad')}` : block;
  }).join('\n                ');
}

function renderFaq(faq = []) {
  if (!faq.length) return '';
  const items = faq.map((f) => `<details>
                        <summary>${escapeHtml(f.pregunta)}</summary>
                        <p>${pendingAware(f.respuesta)}</p>
                    </details>`).join('\n                    ');
  return `<section class="alh-faq alh-section">
                <h2 class="alh-h2">Preguntas frecuentes</h2>
                ${items}
            </section>`;
}

function renderSources(fuentes = []) {
  if (!fuentes.length) return '';
  const items = fuentes.map((f) => `<li><a href="${escapeHtml(f.url)}" target="_blank" rel="noopener">${escapeHtml(f.nombre)}</a></li>`).join('\n                        ');
  return `<section class="alh-section">
                <h2 class="alh-h2">Fuentes oficiales</h2>
                <div class="alh-card">
                    <p>Esta guía se ha elaborado con información de estas fuentes. Si un dato no coincide, prevalece siempre la fuente oficial.</p>
                    <ul class="alh-sources">
                        ${items}
                    </ul>
                </div>
            </section>`;
}

function relatedFor(guia, all) {
  const visible = isPublicada(guia) ? all.filter(isPublicada) : all;
  const bySlug = new Map(visible.map((g) => [g.slug, g]));
  const chosen = [];
  for (const slug of guia.relacionadas || []) {
    const g = bySlug.get(slug);
    if (g && g.slug !== guia.slug && !chosen.includes(g)) chosen.push(g);
  }
  // Completa hasta 3 con guías de la misma categoría y, si no, con otras.
  for (const pool of [visible.filter((g) => g.categoria === guia.categoria), visible]) {
    for (const g of pool) {
      if (chosen.length >= 3) break;
      if (g.slug !== guia.slug && !chosen.includes(g)) chosen.push(g);
    }
  }
  return chosen.slice(0, 3);
}

function renderGuideCard(g) {
  const cat = CATEGORIAS_GUIA[g.categoria] || { nombre: g.categoria };
  return `<a class="alh-card alh-guide-card" href="${guideUrl(g)}">
                        <span class="alh-tag">${escapeHtml(cat.nombre)}</span>
                        <h3>${escapeHtml(g.titulo)}</h3>
                        <p>${escapeHtml(g.resumen)}</p>
                    </a>`;
}

function renderRelated(guia, all) {
  const related = relatedFor(guia, all);
  if (!related.length) return '';
  return `<section class="alh-section">
                <h2 class="alh-h2">Guías relacionadas</h2>
                <div class="alh-grid alh-grid-3">
                    ${related.map(renderGuideCard).join('\n                    ')}
                </div>
            </section>`;
}

function guideJsonLd(guia, canonical, crumbs) {
  const fecha = guia.actualizado || undefined;
  const ld = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: guia.titulo,
      description: guia.resumen,
      inLanguage: 'es-ES',
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
      ...(fecha ? { datePublished: guia.publicada_el || fecha, dateModified: fecha } : {}),
      author: { '@type': 'Organization', name: 'Alhaurín al Día', url: SITE_URL },
      publisher: PUBLISHER,
      image: [`${SITE_URL}/assets/favicon.svg`],
      about: { '@type': 'Place', name: 'Alhaurín el Grande' },
      articleSection: (CATEGORIAS_GUIA[guia.categoria] || {}).nombre || guia.categoria,
    },
  ];
  if ((guia.faq || []).length) {
    ld.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: guia.faq.map((f) => ({
        '@type': 'Question',
        name: f.pregunta,
        acceptedAnswer: { '@type': 'Answer', text: stripTags(f.respuesta) },
      })),
    });
  }
  ld.push(breadcrumbSchema(crumbs));
  return ld;
}

function renderGuide(guia, all) {
  const cat = CATEGORIAS_GUIA[guia.categoria] || { nombre: guia.categoria };
  const canonical = `${SITE_URL}${guideUrl(guia)}`;
  const crumbs = [
    { name: 'Inicio', url: '/' },
    { name: 'Guías', url: '/guias/' },
    { name: cat.nombre, url: `/guias/#${guia.categoria}` },
    { name: guia.titulo, url: guideUrl(guia) },
  ];
  const draft = !isPublicada(guia);
  const updated = guia.actualizado
    ? `<p class="alh-updated">🗓️ Actualizado el ${escapeHtml(formatDateLong(guia.actualizado, { weekday: false }))}</p>`
    : '<p class="alh-updated">🗓️ Actualizado el <mark class="alh-pending">[PENDIENTE: fecha de verificación]</mark></p>';
  const body = `
        <article class="alh-guide">
            <header class="alh-page-header">
                <div class="container alh-narrow">
                    ${renderBreadcrumbs(crumbs)}
                    <span class="alh-kicker">Guía · ${escapeHtml(cat.nombre)}</span>
                    <h1>${escapeHtml(guia.titulo)}</h1>
                    ${updated}
                    <p class="alh-lead">${pendingAware(guia.resumen)}</p>
                    ${draft ? '<div class="alh-note alh-note-warn"><strong>Borrador</strong><p>Esta guía está en preparación y sus datos aún no se han verificado. No se muestra en el índice ni en buscadores.</p></div>' : ''}
                </div>
            </header>
            <div class="container alh-narrow">
                ${renderKeyData(guia.datos_clave)}
                <div class="alh-prose">
                ${renderSections(guia.secciones)}
                </div>
            </div>
            <div class="container alh-narrow">
            ${renderFaq(guia.faq)}
            ${renderSources(guia.fuentes)}
            ${renderRelated(guia, all)}
                <p class="alh-more"><a href="/guias/">← Todas las guías de Alhaurín el Grande</a></p>
            </div>
        </article>`;
  return renderPage({
    title: `${guia.titulo} — Alhaurín al Día`,
    description: guia.resumen,
    canonical,
    robots: draft ? 'noindex, follow' : 'index, follow, max-image-preview:large',
    ogType: 'article',
    jsonld: guideJsonLd(guia, canonical, crumbs),
    body,
  });
}

function renderIndex(all) {
  const published = all.filter(isPublicada);
  const canonical = `${SITE_URL}/guias/`;
  const crumbs = [{ name: 'Inicio', url: '/' }, { name: 'Guías', url: '/guias/' }];
  const groups = Object.entries(CATEGORIAS_GUIA)
    .map(([id, cat]) => ({ id, cat, items: published.filter((g) => g.categoria === id) }))
    .filter((group) => group.items.length);

  const groupsHtml = groups.length
    ? groups.map((group) => `<section class="alh-section" id="${group.id}">
                <h2 class="alh-h2">${escapeHtml(group.cat.icono)} ${escapeHtml(group.cat.nombre)}</h2>
                <div class="alh-grid alh-grid-3">
                    ${group.items.map(renderGuideCard).join('\n                    ')}
                </div>
            </section>`).join('\n            ')
    : `<div class="alh-note"><strong>Guías en preparación</strong><p>Estamos redactando las primeras guías prácticas con datos comprobados en fuentes oficiales. Mientras tanto, puedes consultar la guía útil de servicios que tienes justo debajo.</p></div>`;

  const guiaUtil = JSON.parse(fs.readFileSync(GUIA_UTIL_FILE, 'utf8'));
  const utilHtml = guiaUtil.map((item) => `<a class="alh-card alh-guide-card" href="${escapeHtml(item.pagina || item.enlace)}">
                        <span class="alh-tag alh-tag-oro">${escapeHtml(item.icono || '')} ${escapeHtml(item.categoria)}</span>
                        <h3>${escapeHtml(item.titulo)}</h3>
                        <p>${escapeHtml(item.descripcion)}</p>
                    </a>`).join('\n                    ');

  const body = `
        <section class="alh-page-header">
            <div class="container">
                ${renderBreadcrumbs(crumbs)}
                <span class="alh-kicker">Guías prácticas</span>
                <h1>Guías prácticas de Alhaurín el Grande</h1>
                <p class="alh-lead">Explicaciones paso a paso para resolver gestiones y dudas del día a día en Alhaurín el Grande: trámites municipales, salud, colegios, transporte, ocio, fiestas, rutas por la naturaleza y servicios. Cada guía indica la fecha de su última revisión y enlaza a las fuentes oficiales de las que salen los datos.</p>
            </div>
        </section>
        <div class="container">
            ${groupsHtml}
            <section class="alh-section" id="guia-util">
                <div class="alh-section-head"><h2 class="alh-h2">Guía útil de servicios</h2><a href="/guia-util/">Ver la guía útil →</a></div>
                <p>Fichas rápidas con teléfonos, accesos a la sede electrónica, farmacias, transporte y otros servicios del municipio. Comprueba siempre los datos en la fuente oficial antes de desplazarte.</p>
                <div class="alh-grid alh-grid-3">
                    ${utilHtml}
                </div>
            </section>
            <div class="alh-note"><strong>¿Echas en falta una guía?</strong><p>Si hay una gestión o un tema de Alhaurín el Grande que te gustaría ver explicado, escríbenos desde la página de <a href="/contacto/">contacto</a>.</p></div>
        </div>`;

  return renderPage({
    title: 'Guías prácticas de Alhaurín el Grande — Alhaurín al Día',
    description: 'Guías prácticas de Alhaurín el Grande: trámites, salud, educación, transporte, ocio, fiestas, naturaleza y servicios, con fuentes oficiales.',
    canonical,
    jsonld: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Guías prácticas de Alhaurín el Grande',
        url: canonical,
        inLanguage: 'es-ES',
        isPartOf: { '@type': 'WebSite', name: 'Alhaurín al Día', url: SITE_URL },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: published.length,
          itemListElement: published.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}${guideUrl(g)}`, name: g.titulo })),
        },
      },
      breadcrumbSchema(crumbs),
    ],
    body,
  });
}

function main() {
  const all = loadGuias();
  let written = 0;
  const slugs = new Set();
  for (const guia of all) {
    if (!guia.slug || slugs.has(guia.slug)) throw new Error(`Slug de guía vacío o duplicado: "${guia.slug}"`);
    slugs.add(guia.slug);
    if (writeIfChanged(fs, path.join(OUT_DIR, guia.slug, 'index.html'), renderGuide(guia, all))) written++;
  }
  if (writeIfChanged(fs, path.join(OUT_DIR, 'index.html'), renderIndex(all))) written++;
  const published = all.filter(isPublicada).length;
  console.log(`Guías: ${all.length} (${published} publicadas, ${all.length - published} en borrador). Páginas escritas: ${written}.`);
}

if (require.main === module) main();

module.exports = { relatedFor };
