// Pre-renderiza la farmacia de guardia de hoy como HTML estático en portada,
// /guia-util/farmacias/, /guia-util/farmacias/calendario/ y en cada ficha
// individual de farmacia, y añade/actualiza Schema.org (BreadcrumbList,
// Pharmacy, FAQPage) en esas páginas. Sin esto, la respuesta solo existía
// inyectada por JavaScript (home-guardia.js, guardia-status.js,
// guardias-calendar.js), lo que retrasa e incertidumbre su indexación para
// una búsqueda tan sensible al día como "farmacia de guardia Alhaurín el
// Grande".
//
// Debe ejecutarse a diario como mínimo porque la farmacia de hoy cambia
// cada día; se ejecuta como parte de `npm run build` (workflow
// generar-noticias.yml, cada 2 horas), no en un workflow propio. El HTML
// resultante debe coincidir con lo que produce el JS cliente correspondiente,
// para que la hidratación en el navegador no cause saltos visuales (mismo
// criterio que scripts/lib/cards.js).

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOME_FILE = path.join(ROOT, 'index.html');
const FARMACIAS_FILE = path.join(ROOT, 'guia-util', 'farmacias', 'index.html');
const CALENDARIO_FILE = path.join(ROOT, 'guia-util', 'farmacias', 'calendario', 'index.html');
const FARMACIAS_DATA_FILE = path.join(ROOT, 'data', 'farmacias.json');
const GUARDIAS_DATA_FILE = path.join(ROOT, 'data', 'guardias-farmacias-2026.json');

const SITE_URL = 'https://alhaurinaldia.es';

function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function locateContainer(html, elementId) {
  const openTagPattern = new RegExp(`<(div|section|article)([^>]*\\bid=["']${elementId}["'][^>]*)>`, 'i');
  const match = openTagPattern.exec(html);

  if (!match) {
    throw new Error(`No se encontró el contenedor #${elementId}`);
  }

  const tagName = match[1];
  const openTagStart = match.index;
  const openTagEnd = openTagStart + match[0].length;
  let cursor = openTagEnd;
  let depth = 1;
  const tagPattern = new RegExp(`<\\/?${tagName}\\b[^>]*>`, 'gi');
  tagPattern.lastIndex = openTagEnd;

  while (depth > 0) {
    const tagMatch = tagPattern.exec(html);
    if (!tagMatch) {
      throw new Error(`No se pudo encontrar el cierre de #${elementId}`);
    }
    if (tagMatch[0].startsWith('</')) depth -= 1;
    else depth += 1;
    cursor = tagMatch.index;
  }

  const closeTagEnd = html.indexOf('>', cursor) + 1;
  return { openTagEnd, closeStart: cursor, closeTagEnd };
}

function setContainerInnerHTML(html, elementId, innerHTML) {
  const { openTagEnd, closeStart } = locateContainer(html, elementId);
  return html.slice(0, openTagEnd) + innerHTML + html.slice(closeStart);
}

function insertAfterContainer(html, elementId, insertHTML) {
  const { closeTagEnd } = locateContainer(html, elementId);
  return html.slice(0, closeTagEnd) + insertHTML + html.slice(closeTagEnd);
}

function replaceOrInsertAfter(html, markerId, markerTagPattern, newHTML, afterContainerId) {
  const pattern = new RegExp(`<${markerTagPattern}[^>]*\\bid=["']${markerId}["'][^>]*>.*?<\\/${markerTagPattern}>`, 's');
  if (pattern.test(html)) {
    return html.replace(pattern, newHTML);
  }
  return insertAfterContainer(html, afterContainerId, newHTML);
}

function setJsonLd(html, scriptId, dataObject) {
  const json = JSON.stringify(dataObject);
  const tag = `<script type="application/ld+json" id="${scriptId}">${json}</script>`;
  const pattern = new RegExp(`<script[^>]*\\bid=["']${scriptId}["'][^>]*>.*?<\\/script>`, 'i');

  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }
  if (!html.includes('</head>')) {
    throw new Error('No se encontró </head> para insertar JSON-LD');
  }
  return html.replace('</head>', `${tag}</head>`);
}

function setMetaContent(html, attrValue, newContent) {
  const pattern = new RegExp(`(<meta[^>]*\\b(?:name|property)=["']${attrValue}["'][^>]*\\bcontent=)["'][^"']*["']`, 'i');

  if (!pattern.test(html)) {
    throw new Error(`No se encontró <meta name/property="${attrValue}">`);
  }

  return html.replace(pattern, (_, prefix) => `${prefix}"${escapeHTML(newContent)}"`);
}

function setFirstJsonLdDescription(html, newValue) {
  const pattern = /"description":\s*"[^"]*"/;

  if (!pattern.test(html)) {
    throw new Error('No se encontró el campo "description" en el JSON-LD estático');
  }

  return html.replace(pattern, `"description": ${JSON.stringify(newValue)}`);
}

function todayKeyMadrid() {
  // yyyy-mm-dd en zona Europe/Madrid, independiente de en qué UTC corra el runner.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());
}

function todayLabelMadrid() {
  const formatter = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return formatter.format(new Date());
}

function todayLabelCorto() {
  // Sin año ni día de la semana, para meta description (cada carácter cuenta).
  const formatter = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: 'numeric',
    month: 'long',
  });
  return formatter.format(new Date());
}

function todayLabelLargo() {
  const formatter = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return formatter.format(new Date());
}

function cargarDatos() {
  const farmacias = JSON.parse(fs.readFileSync(FARMACIAS_DATA_FILE, 'utf8'));
  const guardias = JSON.parse(fs.readFileSync(GUARDIAS_DATA_FILE, 'utf8'));
  const porId = {};
  farmacias.forEach(f => { porId[f.id] = f; });
  return { farmacias, porId, guardias: guardias.guardias || {} };
}

function renderHome(html, farmaciaHoy, fechaCorta) {
  let inner;
  if (!farmaciaHoy) {
    inner = `
            <div class="home-guard-main">
                <span class="section-kicker">Farmacia de guardia hoy</span>
                <div class="home-guard-date">${escapeHTML(fechaCorta)}</div>
                <h2>Guardia pendiente de confirmar</h2>
                <p class="home-guard-summary">No consta una farmacia asignada para hoy en nuestro calendario. Consulta la fuente oficial antes de desplazarte.</p>
                <p class="home-guard-note">Confirma siempre la guardia en la fuente oficial antes de desplazarte.</p>
            </div>
            <div class="home-guard-actions">
                <a href="guia-util/farmacias/calendario/">Ver calendario</a>
                <a class="secondary" href="https://alhaurinelgrande.es/farmacias/" target="_blank" rel="noopener noreferrer">Fuente oficial</a>
            </div>
        `;
  } else {
    const phoneHref = farmaciaHoy.telefonoHref ? `tel:${farmaciaHoy.telefonoHref}` : '#';
    const phoneText = farmaciaHoy.telefono || 'Llamar';
    const pharmacyUrl = String(farmaciaHoy.url || 'guia-util/farmacias/').replace(/^\/+/, '');
    inner = `
            <div class="home-guard-main">
                <span class="section-kicker">Farmacia de guardia hoy</span>
                <div class="home-guard-date">${escapeHTML(fechaCorta)}</div>
                <h2>${escapeHTML(farmaciaHoy.nombre || 'Farmacia de guardia')}</h2>
                <div class="home-guard-facts" aria-label="Datos de la farmacia de guardia">
                    <div>
                        <span>Dirección</span>
                        <strong>${escapeHTML(farmaciaHoy.direccion || '')}</strong>
                    </div>
                    <div>
                        <span>Horario de guardia</span>
                        <strong>9:30 a 9:30</strong>
                    </div>
                </div>
                <p class="home-guard-note">Guardia orientativa. Confirma siempre en la fuente oficial antes de desplazarte.</p>
            </div>
            <div class="home-guard-actions" aria-label="Acciones de farmacia de guardia">
                <a href="${escapeHTML(pharmacyUrl)}">Ver ficha</a>
                <a class="secondary" href="${escapeHTML(phoneHref)}">${escapeHTML(phoneText)}</a>
                <a class="secondary" href="guia-util/farmacias/calendario/">Calendario</a>
                <a class="ghost" href="https://alhaurinelgrande.es/farmacias/" target="_blank" rel="noopener noreferrer">Fuente oficial</a>
            </div>
        `;
  }
  return setContainerInnerHTML(html, 'home-pharmacy-guard', inner);
}

function renderCalendario(html, farmaciaHoy) {
  let inner;
  if (!farmaciaHoy) {
    inner = '<div><span class="section-kicker">Guardia de hoy</span><strong>Guardia pendiente de confirmar</strong><p>No consta una farmacia asignada para hoy en nuestro calendario. Consulta la fuente oficial antes de desplazarte.</p></div><div class="guard-actions"><a href="https://alhaurinelgrande.es/farmacias/" target="_blank" rel="noopener noreferrer">Fuente oficial</a></div>';
  } else {
    inner = `<div><span class="section-kicker">Guardia de hoy</span><strong>${escapeHTML(farmaciaHoy.nombre)}</strong><p>${escapeHTML(farmaciaHoy.direccion)} · Guardia orientativa de 9:30 a 9:30. Confirma siempre en la fuente oficial.</p></div><div class="guard-actions"><a href="${escapeHTML(farmaciaHoy.url)}">Ver ficha</a><a class="secondary" href="tel:${escapeHTML(farmaciaHoy.telefonoHref || '')}">${escapeHTML(farmaciaHoy.telefono || '')}</a></div>`;
  }
  return setContainerInnerHTML(html, 'today-guard', inner);
}

function textoRespuestaHoy(farmaciaHoy, fechaLarga) {
  if (!farmaciaHoy) {
    return `No consta una farmacia de guardia asignada para hoy, ${fechaLarga}, en el calendario de Alhaurín al Día. Consulta la fuente oficial del Ayuntamiento antes de desplazarte.`;
  }
  return `Hoy, ${fechaLarga}, la farmacia de guardia en Alhaurín el Grande es ${farmaciaHoy.nombre}, en ${farmaciaHoy.direccion} (teléfono ${farmaciaHoy.telefono}). La guardia es orientativa, de 9:30 a 9:30 del día siguiente; confirma siempre en la fuente oficial antes de desplazarte, especialmente de noche, fines de semana o festivos.`;
}

function metaDescripcionFarmacias(farmaciaHoy, fechaCorta) {
  if (!farmaciaHoy) {
    return 'Hoy no consta farmacia de guardia asignada en Alhaurín el Grande. Consulta el calendario completo y la fuente oficial.';
  }
  return `Hoy, ${fechaCorta}, la farmacia de guardia en Alhaurín el Grande es ${farmaciaHoy.nombre} (${farmaciaHoy.direccion}). Teléfono y calendario completo.`;
}

function renderFarmaciasCallToAction(html, farmaciaHoy, fechaLarga) {
  let strong;
  let span;
  if (!farmaciaHoy) {
    strong = 'Guardia pendiente de confirmar hoy';
    span = `No consta una farmacia asignada para hoy (${escapeHTML(fechaLarga)}) en nuestro calendario. Consulta la fuente oficial.`;
  } else {
    strong = `Hoy: guardia en ${escapeHTML(farmaciaHoy.nombre)}`;
    span = `${escapeHTML(farmaciaHoy.direccion)} · ${escapeHTML(farmaciaHoy.telefono || '')} · Guardia de 9:30 a 9:30.`;
  }
  // El enlace "Abrir calendario" ya existe como hermano fuera de este
  // contenedor en la plantilla original; el inner solo sustituye el texto.
  const inner = `<strong>${strong}</strong><span>${span}</span>`;
  return setContainerInnerHTML(html, 'today-guard-strip', inner);
}

// Réplica estática de lo que guardia-status.js inyecta por JS en cada ficha
// individual de farmacia. Debe producir el mismo HTML que su función
// render(), para que la hidratación en el navegador no cause saltos visuales.
function guardStatusCardInnerHTML(esGuardiaHoy) {
  if (esGuardiaHoy) {
    return '<span class="status-badge">DE GUARDIA HOY</span><p>Esta farmacia figura como guardia para hoy en el calendario local. Verifica siempre en la fuente oficial.</p>';
  }
  return '<span class="status-badge">No está de guardia hoy</span><p>Esta farmacia no figura como guardia para hoy en el calendario local. Consulta el calendario para próximas guardias.</p>';
}

function mapsUrlFicha(farmacia) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${farmacia.nombre || 'Farmacia'} ${farmacia.direccion || ''} Alhaurín el Grande`)}`;
}

function liveGuardBadgeHTML(farmacia, esGuardiaHoy) {
  const estado = esGuardiaHoy ? 'De guardia hoy' : 'No está de guardia hoy';
  const detalle = esGuardiaHoy
    ? 'Guardia orientativa de 9:30 a 9:30. Confirma siempre en la fuente oficial antes de desplazarte.'
    : 'Consulta el calendario para ver próximas guardias y la farmacia disponible hoy.';
  const claseEstado = esGuardiaHoy ? 'is-on-duty' : 'is-not-on-duty';
  return `<section class="live-guard-badge ${claseEstado}" id="live-guard-badge"><div><span>${estado}</span><strong>${escapeHTML(farmacia.nombre)}</strong><p>${detalle}</p></div><div class="live-guard-actions"><a href="/guia-util/farmacias/calendario/">Ver calendario</a><a class="secondary" href="https://alhaurinelgrande.es/farmacias/" target="_blank" rel="noopener noreferrer">Fuente oficial</a></div></section>`;
}

function renderFicha(html, farmacia, esGuardiaHoy) {
  let actualizado = setContainerInnerHTML(html, 'guard-status-card', guardStatusCardInnerHTML(esGuardiaHoy));
  actualizado = replaceOrInsertAfter(
    actualizado,
    'live-guard-badge',
    'section',
    liveGuardBadgeHTML(farmacia, esGuardiaHoy),
    'detail-hero-card',
  );
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Pharmacy',
    '@id': `${SITE_URL}${farmacia.url}#farmacia`,
    name: farmacia.nombre,
    url: `${SITE_URL}${farmacia.url}`,
    telephone: farmacia.telefonoHref,
    address: {
      '@type': 'PostalAddress',
      streetAddress: farmacia.direccion,
      addressLocality: 'Alhaurín el Grande',
      addressRegion: 'Málaga',
      addressCountry: 'ES',
    },
    areaServed: { '@type': 'City', name: 'Alhaurín el Grande' },
    hasMap: mapsUrlFicha(farmacia),
    sameAs: ['https://alhaurinelgrande.es/farmacias/'],
    mainEntityOfPage: `${SITE_URL}${farmacia.url}`,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Calendario de guardias', value: `${SITE_URL}/guia-util/farmacias/calendario/` },
      { '@type': 'PropertyValue', name: 'Estado de guardia hoy', value: esGuardiaHoy ? 'De guardia hoy' : 'No está de guardia hoy' },
      { '@type': 'PropertyValue', name: 'Fuente oficial de contraste', value: 'https://alhaurinelgrande.es/farmacias/' },
    ],
  };
  return setJsonLd(actualizado, 'advanced-pharmacy-schema', schema);
}

function breadcrumbList(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function faqPage(pregunta, respuesta) {
  return {
    '@type': 'FAQPage',
    mainEntity: [{
      '@type': 'Question',
      name: pregunta,
      acceptedAnswer: { '@type': 'Answer', text: respuesta },
    }],
  };
}

function pharmacyEntity(farmacia, esGuardiaHoy) {
  return {
    '@type': 'Pharmacy',
    name: farmacia.nombre,
    url: `${SITE_URL}${farmacia.url}`,
    telephone: farmacia.telefonoHref ? `+${farmacia.telefonoHref.replace(/^\+/, '')}` : undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: farmacia.direccion,
      addressLocality: 'Alhaurín el Grande',
      addressRegion: 'Málaga',
      addressCountry: 'ES',
    },
    additionalProperty: {
      '@type': 'PropertyValue',
      name: 'Estado de guardia hoy',
      value: esGuardiaHoy ? 'De guardia hoy' : 'No está de guardia hoy',
    },
  };
}

function main() {
  const { farmacias, porId, guardias } = cargarDatos();
  const hoyKey = todayKeyMadrid();
  const fechaCorta = todayLabelMadrid();
  const fechaLarga = todayLabelLargo();
  const fechaMeta = todayLabelCorto();
  const idHoy = guardias[hoyKey];
  const farmaciaHoy = idHoy ? porId[idHoy] : null;
  const respuesta = textoRespuestaHoy(farmaciaHoy, fechaLarga);
  const pregunta = '¿Qué farmacia está de guardia hoy en Alhaurín el Grande?';

  let cambios = 0;

  // Portada
  {
    const original = fs.readFileSync(HOME_FILE, 'utf8');
    const actualizado = renderHome(original, farmaciaHoy, fechaCorta);
    if (actualizado !== original) {
      fs.writeFileSync(HOME_FILE, actualizado);
      cambios += 1;
    }
  }

  // /guia-util/farmacias/
  {
    const original = fs.readFileSync(FARMACIAS_FILE, 'utf8');
    let actualizado = renderFarmaciasCallToAction(original, farmaciaHoy, fechaLarga);
    const graph = [
      breadcrumbList([
        { name: 'Inicio', url: `${SITE_URL}/` },
        { name: 'Guía útil', url: `${SITE_URL}/guia-util/` },
        { name: 'Farmacias', url: `${SITE_URL}/guia-util/farmacias/` },
      ]),
      faqPage(pregunta, respuesta),
      {
        '@type': 'ItemList',
        itemListElement: farmacias.map((f, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: pharmacyEntity(f, f.id === idHoy),
        })),
      },
    ];
    actualizado = setJsonLd(actualizado, 'ld-farmacias-guardia', {
      '@context': 'https://schema.org',
      '@graph': graph,
    });
    const descripcion = metaDescripcionFarmacias(farmaciaHoy, fechaMeta);
    actualizado = setMetaContent(actualizado, 'description', descripcion);
    actualizado = setMetaContent(actualizado, 'og:description', descripcion);
    actualizado = setMetaContent(actualizado, 'twitter:description', descripcion);
    actualizado = setFirstJsonLdDescription(actualizado, descripcion);
    if (actualizado !== original) {
      fs.writeFileSync(FARMACIAS_FILE, actualizado);
      cambios += 1;
    }
  }

  // /guia-util/farmacias/calendario/
  {
    const original = fs.readFileSync(CALENDARIO_FILE, 'utf8');
    let actualizado = renderCalendario(original, farmaciaHoy);
    const graph = [
      breadcrumbList([
        { name: 'Inicio', url: `${SITE_URL}/` },
        { name: 'Guía útil', url: `${SITE_URL}/guia-util/` },
        { name: 'Farmacias', url: `${SITE_URL}/guia-util/farmacias/` },
        { name: 'Calendario', url: `${SITE_URL}/guia-util/farmacias/calendario/` },
      ]),
      faqPage(pregunta, respuesta),
    ];
    actualizado = setJsonLd(actualizado, 'ld-calendario-guardia', {
      '@context': 'https://schema.org',
      '@graph': graph,
    });
    if (actualizado !== original) {
      fs.writeFileSync(CALENDARIO_FILE, actualizado);
      cambios += 1;
    }
  }

  // Fichas individuales de cada farmacia
  let fichasActualizadas = 0;
  farmacias.forEach((farmacia) => {
    const fichaFile = path.join(ROOT, ...farmacia.url.split('/').filter(Boolean), 'index.html');
    const original = fs.readFileSync(fichaFile, 'utf8');
    const actualizado = renderFicha(original, farmacia, farmacia.id === idHoy);
    if (actualizado !== original) {
      fs.writeFileSync(fichaFile, actualizado);
      fichasActualizadas += 1;
    }
  });

  console.log(`[farmacia-guardia-static] Fecha (Europe/Madrid): ${hoyKey}`);
  console.log(`[farmacia-guardia-static] Farmacia de guardia hoy: ${farmaciaHoy ? farmaciaHoy.nombre : 'sin dato'}`);
  console.log(`[farmacia-guardia-static] Ficheros actualizados: ${cambios} de 3 + ${fichasActualizadas} fichas de ${farmacias.length}`);
}

main();
