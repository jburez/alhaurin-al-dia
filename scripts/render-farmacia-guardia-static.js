// Pre-renderiza la farmacia de guardia de hoy como HTML estático en portada,
// /guia-util/farmacias/ y /guia-util/farmacias/calendario/, y añade/actualiza
// Schema.org (BreadcrumbList, Pharmacy, FAQPage) en las dos páginas de
// farmacias. Sin esto, la respuesta solo existía inyectada por JavaScript
// (home-guardia.js, guardia-status.js, guardias-calendar.js), lo que retrasa
// e incertidumbre su indexación para una búsqueda tan sensible al día como
// "farmacia de guardia Alhaurín el Grande".
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

function setContainerInnerHTML(html, elementId, innerHTML) {
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

  return html.slice(0, openTagEnd) + innerHTML + html.slice(cursor);
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

  console.log(`[farmacia-guardia-static] Fecha (Europe/Madrid): ${hoyKey}`);
  console.log(`[farmacia-guardia-static] Farmacia de guardia hoy: ${farmaciaHoy ? farmaciaHoy.nombre : 'sin dato'}`);
  console.log(`[farmacia-guardia-static] Ficheros actualizados: ${cambios} de 3`);
}

main();
