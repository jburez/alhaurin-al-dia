// Genera el directorio de comercios a partir de data/comercios.json:
//
//   /comercios/                         índice por categorías
//   /comercios/<categoria>/             listado con texto introductorio propio
//   /comercios/<categoria>/<slug>/      ficha (solo si hay descripción y dirección u horario)
//
// Uso: node scripts/render-comercios.js

const fs = require('fs');
const path = require('path');
const {
  SITE_URL, CONTACT_EMAIL, escapeHtml, renderPage, renderBreadcrumbs, breadcrumbSchema, adSlot, todayIso, writeIfChanged,
} = require('./lib/layout');
const {
  loadComercios, patrocinioVigente, sortComercios, tieneFicha, fichaUrl, categoriaUrl, renderFeaturedSlot,
} = require('./lib/comercios');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'comercios');
const TODAY = todayIso();

function telHref(tel = '') {
  return `tel:${String(tel).replace(/[^\d+]/g, '')}`;
}

function renderBusinessCard(c, cat) {
  const featured = patrocinioVigente(c, TODAY);
  const lines = [
    c.direccion ? `📍 ${escapeHtml(c.direccion)}${c.zona ? ` (${escapeHtml(c.zona)})` : ''}` : (c.zona ? `📍 ${escapeHtml(c.zona)}` : ''),
    c.horario ? `🕒 ${escapeHtml(c.horario)}` : '',
    c.telefono ? `📞 <a href="${escapeHtml(telHref(c.telefono))}">${escapeHtml(c.telefono)}</a>` : '',
  ].filter(Boolean).map((l) => `<p class="alh-event-meta">${l}</p>`).join('\n                        ');
  const webRel = featured ? 'sponsored noopener' : 'noopener';
  return `<article class="alh-card alh-business${featured ? ' is-destacado' : ''}">
                        ${featured ? '<span class="alh-tag alh-tag-destacado">Destacado</span>' : ''}<span class="alh-tag">${escapeHtml(cat ? cat.nombre : c.categoria)}</span>
                        <h3>${tieneFicha(c) ? `<a href="${fichaUrl(c)}">${escapeHtml(c.nombre)}</a>` : escapeHtml(c.nombre)}</h3>
                        ${c.descripcion ? `<p>${escapeHtml(c.descripcion)}</p>` : ''}
                        ${lines}
                        ${c.web ? `<p><a href="${escapeHtml(c.web)}" target="_blank" rel="${webRel}">Web del negocio ↗</a></p>` : ''}
                    </article>`;
}

// Fase 6: una categoría solo es indexable con texto introductorio propio y al
// menos 5 comercios con ficha completa; /comercios/ solo si alguna lo es.
const MIN_FICHAS_CATEGORIA = 5;
function categoriaIndexable(cat, comercios) {
  const fichas = comercios.filter((c) => c.categoria === cat.slug && tieneFicha(c)).length;
  return Boolean(cat.intro && cat.intro.trim()) && fichas >= MIN_FICHAS_CATEGORIA;
}

function renderIndex(categorias, comercios) {
  const algunaIndexable = categorias.some((cat) => categoriaIndexable(cat, comercios));
  const canonical = `${SITE_URL}/comercios/`;
  const crumbs = [{ name: 'Inicio', url: '/' }, { name: 'Comercios', url: '/comercios/' }];
  const catCards = categorias.map((cat) => {
    const n = comercios.filter((c) => c.categoria === cat.slug).length;
    return `<a class="alh-card alh-guide-card" href="${categoriaUrl(cat)}">
                        <span class="alh-tag">${escapeHtml(cat.icono || '')} ${n} ${n === 1 ? 'negocio' : 'negocios'}</span>
                        <h3>${escapeHtml(cat.nombre)}</h3>
                        <p>${escapeHtml(cat.resumen || '')}</p>
                    </a>`;
  }).join('\n                    ');
  const destacados = sortComercios(comercios.filter((c) => patrocinioVigente(c, TODAY)), TODAY);

  const body = `
        <section class="alh-page-header">
            <div class="container">
                ${renderBreadcrumbs(crumbs)}
                <span class="alh-kicker">Directorio local</span>
                <h1>Comercios, bares y servicios de Alhaurín el Grande</h1>
                <p class="alh-lead">Un directorio sencillo de negocios de Alhaurín el Grande ordenado por categorías: dónde comer, tiendas de proximidad y profesionales del municipio, con dirección, horario y forma de contacto cuando el propio negocio nos los ha facilitado.</p>
            </div>
        </section>
        <div class="container">
            <section class="alh-section">
                <h2 class="alh-h2">Categorías</h2>
                <div class="alh-grid alh-grid-3">
                    ${catCards}
                </div>
            </section>
            ${destacados.length ? `<section class="alh-section">
                <h2 class="alh-h2">Comercios destacados</h2>
                <div class="alh-grid alh-grid-3">
                    ${destacados.map((c) => renderBusinessCard(c, categorias.find((x) => x.slug === c.categoria))).join('\n                    ')}
                </div>
            </section>` : `<section class="alh-section">${renderFeaturedSlot(TODAY, { ubicacion: 'comercios' })}</section>`}
            ${algunaIndexable ? '' : `<div class="alh-note"><strong>Estamos preparando el directorio</strong><p>Todavía no hay suficientes negocios con ficha completa. Si tienes un comercio, un bar o un servicio en Alhaurín el Grande, aparecer en el directorio básico es gratuito: <a href="/anunciarse/">cuéntanos tus datos</a> y lo publicamos en cuanto los verifiquemos.</p></div>`}
            ${adSlot('comercios', 'banda')}
            <section class="alh-section alh-prose">
                <h2>Cómo funciona este directorio</h2>
                <p>Cada negocio aparece en la categoría que mejor describe su actividad. Solo publicamos datos que el propio comercio nos ha confirmado o que figuran en sus canales oficiales, y mostramos una ficha completa únicamente cuando tenemos una descripción y, al menos, su dirección o su horario. Si un dato ha cambiado, escríbenos y lo corregimos.</p>
                <h2>Comercios destacados y transparencia</h2>
                <p>Algunos negocios colaboran con Alhaurín al Día para aparecer como <strong>destacados</strong>. Siempre lo indicamos con una etiqueta visible y sus enlaces se marcan como patrocinados. Aparecer en el directorio básico no tiene coste. Si tienes un negocio en Alhaurín el Grande y quieres aparecer, consulta la página <a href="/anunciarse/">Anúnciate</a> o escríbenos desde <a href="/contacto/">contacto</a>.</p>
            </section>
        </div>`;

  return renderPage({
    title: 'Comercios de Alhaurín el Grande: bares, tiendas y profesionales — Alhaurín al Día',
    robots: algunaIndexable ? 'index, follow' : 'noindex, follow',
    description: 'Directorio de comercios de Alhaurín el Grande por categorías: restaurantes y bares, tiendas locales y profesionales, con datos verificados.',
    canonical,
    jsonld: [
      { '@context': 'https://schema.org', '@type': 'CollectionPage', name: 'Comercios de Alhaurín el Grande', url: canonical, inLanguage: 'es-ES', isPartOf: { '@type': 'WebSite', name: 'Alhaurín al Día', url: SITE_URL } },
      breadcrumbSchema(crumbs),
    ],
    body,
  });
}

function renderCategory(cat, comercios) {
  const canonical = `${SITE_URL}${categoriaUrl(cat)}`;
  const crumbs = [{ name: 'Inicio', url: '/' }, { name: 'Comercios', url: '/comercios/' }, { name: cat.nombre, url: categoriaUrl(cat) }];
  const list = sortComercios(comercios.filter((c) => c.categoria === cat.slug), TODAY);
  const intro = cat.intro && cat.intro.trim()
    ? `<p class="alh-lead">${escapeHtml(cat.intro)}</p>`
    : `<p class="alh-lead">${escapeHtml(cat.resumen || '')} <mark class="alh-pending">[PENDIENTE: texto introductorio propio de la categoría «${escapeHtml(cat.nombre)}»]</mark></p>`;
  const indexable = categoriaIndexable(cat, comercios);
  const body = `
        <section class="alh-page-header">
            <div class="container alh-narrow">
                ${renderBreadcrumbs(crumbs)}
                <span class="alh-kicker">${escapeHtml(cat.icono || '')} Comercios</span>
                <h1>${escapeHtml(cat.nombre)} en Alhaurín el Grande</h1>
                ${intro}
            </div>
        </section>
        <div class="container alh-narrow">
            ${list.length
    ? `<div class="alh-grid">${list.map((c) => renderBusinessCard(c, cat)).join('\n                    ')}</div>`
    : `<div class="alh-note"><strong>Todavía no hay negocios en esta categoría</strong><p>Estamos preparando el directorio. Si tienes un negocio de este tipo en Alhaurín el Grande, <a href="/anunciarse/">puedes aparecer aquí</a>.</p></div>`}
            ${adSlot(`comercios-${cat.slug}`, 'banda')}
            <p class="alh-more"><a href="/comercios/">← Todas las categorías</a></p>
        </div>`;
  return renderPage({
    title: `${cat.nombre} en Alhaurín el Grande — Alhaurín al Día`,
    description: `${cat.nombre} en Alhaurín el Grande: ${cat.resumen || 'directorio local'}`.slice(0, 160),
    canonical,
    robots: indexable ? 'index, follow' : 'noindex, follow',
    jsonld: [
      {
        '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${cat.nombre} en Alhaurín el Grande`, url: canonical, inLanguage: 'es-ES',
        mainEntity: { '@type': 'ItemList', numberOfItems: list.length, itemListElement: list.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.nombre, ...(tieneFicha(c) ? { url: `${SITE_URL}${fichaUrl(c)}` } : {}) })) },
      },
      breadcrumbSchema(crumbs),
    ],
    body,
  });
}

function renderFicha(c, cat) {
  const canonical = `${SITE_URL}${fichaUrl(c)}`;
  const crumbs = [
    { name: 'Inicio', url: '/' }, { name: 'Comercios', url: '/comercios/' },
    { name: cat ? cat.nombre : c.categoria, url: categoriaUrl(c.categoria) }, { name: c.nombre, url: fichaUrl(c) },
  ];
  const featured = patrocinioVigente(c, TODAY);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: c.nombre,
    description: c.descripcion,
    url: canonical,
    address: {
      '@type': 'PostalAddress',
      ...(c.direccion ? { streetAddress: c.direccion } : {}),
      addressLocality: 'Alhaurín el Grande',
      postalCode: '29120',
      addressRegion: 'Málaga',
      addressCountry: 'ES',
    },
    ...(c.telefono ? { telephone: c.telefono } : {}),
    ...(c.web || c.redes.length ? { sameAs: [c.web, ...c.redes.map((r) => r.url)].filter(Boolean) } : {}),
  };
  const facts = [
    ['Dirección', c.direccion], ['Zona', c.zona], ['Horario', c.horario], ['Teléfono', c.telefono],
  ].filter(([, v]) => v).map(([k, v]) => `<div class="alh-fact"><span>${k}</span><strong>${k === 'Teléfono' ? `<a href="${escapeHtml(telHref(v))}">${escapeHtml(v)}</a>` : escapeHtml(v)}</strong></div>`).join('\n                    ');
  const body = `
        <article>
            <header class="alh-page-header">
                <div class="container alh-narrow">
                    ${renderBreadcrumbs(crumbs)}
                    ${featured ? '<span class="alh-tag alh-tag-destacado">Destacado</span>' : ''}<span class="alh-kicker">${escapeHtml(cat ? cat.nombre : '')}</span>
                    <h1>${escapeHtml(c.nombre)}</h1>
                    <p class="alh-lead">${escapeHtml(c.descripcion)}</p>
                </div>
            </header>
            <div class="container alh-narrow">
                <div class="alh-event-facts">
                    ${facts}
                </div>
                <div class="alh-actions">
                    ${c.web ? `<a class="alh-btn" href="${escapeHtml(c.web)}" target="_blank" rel="${featured ? 'sponsored noopener' : 'noopener'}">Web del negocio</a>` : ''}
                    ${c.direccion ? `<a class="alh-btn alh-btn-sec" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(`${c.nombre}, ${c.direccion}, Alhaurín el Grande`)}" target="_blank" rel="noopener">Cómo llegar</a>` : ''}
                    ${c.redes.map((r) => `<a class="alh-btn alh-btn-sec" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">${escapeHtml(r.nombre || 'Redes')}</a>`).join('')}
                </div>
                ${featured ? '<p class="alh-note"><strong>Comercio destacado</strong> Este negocio colabora con Alhaurín al Día para aparecer destacado.</p>' : ''}
                ${adSlot('comercio-ficha')}
                <p class="alh-more"><a href="${categoriaUrl(c.categoria)}">← Más ${escapeHtml(cat ? cat.nombre.toLowerCase() : 'comercios')}</a></p>
            </div>
        </article>`;
  return renderPage({
    title: `${c.nombre} — ${cat ? cat.nombre : 'Comercio'} en Alhaurín el Grande`,
    description: c.descripcion.slice(0, 160),
    canonical,
    jsonld: [ld, breadcrumbSchema(crumbs)],
    body,
  });
}

// /anunciarse/ («Anúnciate»): página sencilla para comercios que quieran
// aparecer como destacados. Contacto por email (sin backend ni servicios de pago).
function renderAnunciate() {
  const canonical = `${SITE_URL}/anunciarse/`;
  const crumbs = [{ name: 'Inicio', url: '/' }, { name: 'Anúnciate', url: '/anunciarse/' }];
  const subject = encodeURIComponent('Quiero aparecer como comercio destacado');
  const mailBody = encodeURIComponent('Nombre del negocio:\nCategoría:\nDirección o zona:\nTeléfono:\nWeb o redes:\nHorario:\nQué me interesa (destacado en portada, en una categoría, en la farmacia de guardia…):\n');
  const body = `
        <section class="alh-page-header">
            <div class="container alh-narrow">
                ${renderBreadcrumbs(crumbs)}
                <span class="alh-kicker">Para negocios locales</span>
                <h1>Anúnciate en Alhaurín al Día</h1>
                <p class="alh-lead">Si tienes un comercio, un bar o un servicio en Alhaurín el Grande, puedes aparecer como <strong>comercio destacado</strong> en las páginas que más consultan los vecinos cada día: la portada, la farmacia de guardia y el directorio de comercios.</p>
            </div>
        </section>
        <div class="container alh-narrow">
            <div class="alh-grid alh-grid-2">
                <article class="alh-card">
                    <span class="alh-tag alh-tag-destacado">30 € / mes</span>
                    <h2 class="alh-h2">Comercio destacado</h2>
                    <p>Ficha destacada con descripción, dirección, horario, teléfono y enlace a tu web o redes. Sale la primera en su categoría con la etiqueta «Destacado» y entra en la rotación del hueco de comercio destacado de la portada.</p>
                </article>
                <article class="alh-card">
                    <span class="alh-tag alh-tag-destacado">60 € / mes</span>
                    <h2 class="alh-h2">Patrocinio de sección</h2>
                    <p>Tu negocio asociado a una sección de consulta diaria, como la farmacia de guardia, el tiempo o la agenda, en un espacio fijo y claramente identificado como patrocinio.</p>
                </article>
            </div>
            <section class="alh-section alh-prose">
                <h2>Cómo funciona</h2>
                <ol>
                    <li><strong>Nos escribes</strong> con los datos básicos de tu negocio: nombre, categoría, dirección o zona, teléfono, web o redes y horario.</li>
                    <li><strong>Revisamos los datos</strong> contigo antes de publicar nada y acordamos dónde aparecer y durante cuánto tiempo.</li>
                    <li><strong>Publicamos tu ficha</strong> con la etiqueta «Destacado» hasta la fecha acordada. Al terminar, el negocio sigue en el directorio básico si así lo quieres.</li>
                </ol>
                <h2>Transparencia</h2>
                <p>Todo lo que es patrocinado se indica siempre con una etiqueta visible y sus enlaces se marcan como patrocinados. No publicamos opiniones pagadas ni presentamos la publicidad como información. Aparecer en el directorio básico de comercios es gratuito.</p>
                <h2>Contacto</h2>
                <p>Escríbenos a <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> y te responderemos lo antes posible.</p>
                <p><a class="alh-btn" href="mailto:${CONTACT_EMAIL}?subject=${subject}&amp;body=${mailBody}">Escribir un email</a></p>
            </section>
        </div>`;
  return renderPage({
    title: 'Anúnciate en Alhaurín al Día: comercio destacado — Alhaurín al Día',
    description: 'Aparece como comercio destacado en Alhaurín al Día: portada, farmacia de guardia y directorio de comercios de Alhaurín el Grande. Contacto por email.',
    canonical,
    jsonld: [breadcrumbSchema(crumbs)],
    body,
  });
}

function main() {
  const { categorias, comercios } = loadComercios();
  let written = 0;
  if (writeIfChanged(fs, path.join(OUT, 'index.html'), renderIndex(categorias, comercios))) written++;
  if (writeIfChanged(fs, path.join(ROOT, 'anunciarse', 'index.html'), renderAnunciate())) written++;
  for (const cat of categorias) {
    if (writeIfChanged(fs, path.join(OUT, cat.slug, 'index.html'), renderCategory(cat, comercios))) written++;
  }
  let fichas = 0;
  for (const c of comercios) {
    if (!tieneFicha(c)) continue;
    fichas++;
    const cat = categorias.find((x) => x.slug === c.categoria);
    if (writeIfChanged(fs, path.join(ROOT, fichaUrl(c).replace(/^\//, ''), 'index.html'), renderFicha(c, cat))) written++;
  }
  console.log(`Comercios: ${comercios.length} negocios en ${categorias.length} categorías, ${fichas} fichas. Páginas escritas: ${written}.`);
}

main();
