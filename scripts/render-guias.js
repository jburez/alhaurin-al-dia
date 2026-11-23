// Genera las guías prácticas a partir de data/guias.json (fuente única desde
// la fase 6, noviembre 2026):
//
//   /guia-util/             índice por categorías
//   /guia-util/<slug>/      una página por guía (URLs ya indexadas de siempre)
//
// Las antiguas /guias/ y /guias/<slug>/ redirigen con 301 (bloque generado en
// _redirects) y ya no se generan.
//
// Indexación: una guía solo es indexable si tiene estado "publicada" Y la
// página generada cumple los criterios (más de 300 palabras propias, ningún
// [PENDIENTE], al menos una fuente y fecha de actualización). Si no, se
// genera con noindex: la URL sigue existiendo con el contenido que tenga.
//
// Las guías con "generador" (farmacias, transporte) añaden secciones
// construidas con datos de data/ (scripts/lib/guias-datos.js).
//
// Uso: node scripts/render-guias.js

const fs = require('fs');
const path = require('path');
const {
  SITE_URL, PUBLISHER, escapeHtml, renderPage, renderBreadcrumbs, breadcrumbSchema,
  adSlot, formatDateLong, writeIfChanged,
} = require('./lib/layout');
const { CATEGORIAS_GUIA, loadGuias, isPublicada, guideUrl, legacyGuideUrl } = require('./lib/guias');
const { applyGenerator } = require('./lib/guias-datos');
const { todayIso } = require('./lib/layout');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'guia-util');
const LEGACY_DIR = path.join(ROOT, 'guias');
const REDIRECTS_FILE = path.join(ROOT, '_redirects');
const REDIRECTS_START = '# alh-guias:start (generado por scripts/render-guias.js)';
const REDIRECTS_END = '# alh-guias:end';
const MIN_WORDS = 300;
const TODAY = todayIso();

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
                    ${String(s.html || '').replace(/\[PENDIENTE[^\]]*\]/g, (m) => `<mark class="alh-pending">${m}</mark>`)}
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
  // Primero las publicadas; las guías en revisión también se enlazan (siguen
  // existiendo y aportan datos útiles aunque estén en noindex).
  const visible = [...all.filter(isPublicada), ...all.filter((g) => !isPublicada(g))];
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

function ownWords(html) {
  const main = html.match(/<main[\s\S]*?<\/main>/i);
  return String(main ? main[0] : html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

// Criterios para indexar una guía publicada.
function criteriosPublicacion(guia, html) {
  const fallos = [];
  const words = ownWords(html);
  if (words <= MIN_WORDS) fallos.push(`${words} palabras propias (mínimo ${MIN_WORDS + 1})`);
  if (/\[PENDIENTE/.test(html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html)) fallos.push('contiene [PENDIENTE]');
  if (!(guia.fuentes || []).length) fallos.push('sin fuentes');
  if (!guia.actualizado) fallos.push('sin fecha de actualización');
  return { ok: fallos.length === 0, fallos, words };
}

function renderGuide(rawGuia, all, { indexable }) {
  const guia = applyGenerator(rawGuia, TODAY);
  const cat = CATEGORIAS_GUIA[guia.categoria] || { nombre: guia.categoria };
  const canonical = `${SITE_URL}${guideUrl(guia)}`;
  const crumbs = [
    { name: 'Inicio', url: '/' },
    { name: 'Guía útil', url: '/guia-util/' },
    { name: guia.titulo, url: guideUrl(guia) },
  ];
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
                    ${indexable ? '' : '<div class="alh-note alh-note-warn"><strong>Guía en revisión</strong><p>Estamos verificando y ampliando esta información. Mientras tanto, comprueba siempre los datos en las fuentes oficiales enlazadas.</p></div>'}
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
                <p class="alh-more"><a href="/guia-util/">← Toda la guía útil de Alhaurín el Grande</a></p>
            </div>
        </article>`;
  return renderPage({
    title: `${guia.titulo} — Alhaurín al Día`,
    description: guia.resumen,
    canonical,
    robots: indexable ? 'index, follow, max-image-preview:large' : 'noindex, follow',
    ogType: 'article',
    jsonld: guideJsonLd(guia, canonical, crumbs),
    body,
  });
}

function renderIndex(all, indexables) {
  const canonical = `${SITE_URL}/guia-util/`;
  const crumbs = [{ name: 'Inicio', url: '/' }, { name: 'Guía útil', url: '/guia-util/' }];
  const visibles = all.filter((g) => g.slug !== 'ejemplo-plantilla');
  const groups = Object.entries(CATEGORIAS_GUIA)
    .map(([id, cat]) => ({
      id,
      cat,
      items: visibles.filter((g) => g.categoria === id)
        .sort((a, b) => Number(indexables.has(b.slug)) - Number(indexables.has(a.slug)) || a.titulo.localeCompare(b.titulo, 'es')),
    }))
    .filter((group) => group.items.length);

  const card = (g) => {
    const c = CATEGORIAS_GUIA[g.categoria] || { nombre: g.categoria };
    return `<a class="alh-card alh-guide-card" href="${guideUrl(g)}">
                        <span class="alh-tag${indexables.has(g.slug) ? ' alh-tag-oro' : ''}">${escapeHtml(c.nombre)}${indexables.has(g.slug) ? ' · guía completa' : ''}</span>
                        <h3>${escapeHtml(g.titulo)}</h3>
                        <p>${escapeHtml(g.resumen)}</p>
                    </a>`;
  };

  const groupsHtml = groups.map((group) => `<section class="alh-section" id="${group.id}">
                <h2 class="alh-h2">${escapeHtml(group.cat.icono)} ${escapeHtml(group.cat.nombre)}</h2>
                <div class="alh-grid alh-grid-3">
                    ${group.items.map(card).join('\n                    ')}
                </div>
            </section>`).join('\n            ');

  const body = `
        <section class="alh-page-header">
            <div class="container">
                ${renderBreadcrumbs(crumbs)}
                <span class="alh-kicker">Guía útil</span>
                <h1>Guía útil de Alhaurín el Grande</h1>
                <p class="alh-lead">Información práctica para resolver el día a día en Alhaurín el Grande: farmacias y guardias, autobuses, teléfonos de emergencia, trámites municipales, taxis, aparcamiento, colegios, deportes, bibliotecas, turismo y otros servicios. Cada guía indica la fecha de su última revisión y enlaza a las fuentes oficiales de las que salen los datos.</p>
                <p>Las guías marcadas como «guía completa» ya están verificadas y ampliadas. El resto están en revisión: puedes consultarlas, pero comprueba siempre los datos en la fuente oficial antes de desplazarte o hacer una gestión.</p>
            </div>
        </section>
        <div class="container">
            <div class="alh-actions">
                <a class="alh-btn" href="/farmacia-de-guardia/">Farmacia de guardia hoy</a>
                <a class="alh-btn alh-btn-sec" href="/guia-util/farmacias/calendario/">Calendario de guardias</a>
                <a class="alh-btn alh-btn-sec" href="/agenda/">Agenda</a>
            </div>
            ${groupsHtml}
            <div class="alh-note"><strong>¿Echas en falta algo?</strong><p>Si hay una gestión o un servicio de Alhaurín el Grande que te gustaría ver explicado, o un dato que no es correcto, escríbenos desde la página de <a href="/contacto/">contacto</a>.</p></div>
        </div>`;

  return renderPage({
    title: 'Guía útil de Alhaurín el Grande: farmacias, autobuses, teléfonos y trámites — Alhaurín al Día',
    description: 'Guía útil de Alhaurín el Grande: farmacias y guardias, autobuses, teléfonos de emergencia, trámites, taxis, aparcamiento y servicios, con fuentes oficiales.',
    canonical,
    jsonld: [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: 'Guía útil de Alhaurín el Grande',
        url: canonical,
        inLanguage: 'es-ES',
        isPartOf: { '@type': 'WebSite', name: 'Alhaurín al Día', url: SITE_URL },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: visibles.length,
          itemListElement: visibles.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE_URL}${guideUrl(g)}`, name: g.titulo })),
        },
      },
      breadcrumbSchema(crumbs),
    ],
    body,
  });
}

function writeRedirects(all) {
  const prev = fs.existsSync(REDIRECTS_FILE) ? fs.readFileSync(REDIRECTS_FILE, 'utf8') : '';
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const base = prev.replace(new RegExp(`\\n?${esc(REDIRECTS_START)}[\\s\\S]*?${esc(REDIRECTS_END)}\\n?`), '\n').replace(/\n+$/, '\n');
  const lines = ['/guias/ /guia-util/ 301', ...all.map((g) => `${legacyGuideUrl(g)} ${guideUrl(g)} 301`)];
  // Va antes de los bloques generados por otros scripts, justo tras las reglas de dominio.
  const next = `${base}${REDIRECTS_START}\n${lines.join('\n')}\n${REDIRECTS_END}\n`;
  if (next !== prev) fs.writeFileSync(REDIRECTS_FILE, next);
  return lines.length;
}

function main() {
  const all = loadGuias();
  let written = 0;
  const slugs = new Set();
  const indexables = new Set();
  const informe = [];
  for (const guia of all) {
    if (!guia.slug || slugs.has(guia.slug)) throw new Error(`Slug de guía vacío o duplicado: "${guia.slug}"`);
    slugs.add(guia.slug);
    let html = renderGuide(guia, all, { indexable: isPublicada(guia) });
    if (isPublicada(guia)) {
      const c = criteriosPublicacion(guia, html);
      if (c.ok) indexables.add(guia.slug);
      else {
        html = renderGuide(guia, all, { indexable: false });
        informe.push(`⚠️  ${guia.slug}: publicada en datos pero no cumple los criterios (${c.fallos.join('; ')}) → noindex`);
      }
    }
    if (writeIfChanged(fs, path.join(OUT_DIR, guia.slug, 'index.html'), html)) written++;
  }
  if (writeIfChanged(fs, path.join(OUT_DIR, 'index.html'), renderIndex(all, indexables))) written++;
  // /guias/ ya no se genera: sus URLs redirigen con 301 a /guia-util/.
  if (fs.existsSync(LEGACY_DIR)) fs.rmSync(LEGACY_DIR, { recursive: true, force: true });
  const nRedirects = writeRedirects(all);
  for (const line of informe) console.log(line);
  console.log(`Guías: ${all.length} en /guia-util/ (${indexables.size} indexables: ${[...indexables].join(', ') || 'ninguna'}). Páginas escritas: ${written}. Redirecciones /guias/ → /guia-util/: ${nRedirects}.`);
}

if (require.main === module) main();

module.exports = { relatedFor, criteriosPublicacion, ownWords };
