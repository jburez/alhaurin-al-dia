// Páginas de información del proyecto y legales:
//
//   /sobre-nosotros/   Sobre el proyecto (URL de siempre)
//   /contacto/         email del proyecto y formulario mailto (sin backend)
//   /privacidad/       política de privacidad
//   /cookies/          política de cookies y botón «Configurar cookies»
//   /aviso-legal/      aviso legal
//
// Ninguna página incluye datos personales de la persona titular. Donde la ley
// exige un dato del titular que no debe publicarse sin revisión, se deja el
// marcador [PENDIENTE: revisar con asesoría]; mientras una página tenga
// marcadores, se genera con noindex.
//
// Uso: node scripts/render-paginas-info.js

const fs = require('fs');
const path = require('path');
const {
  SITE_URL, CONTACT_EMAIL, escapeHtml, renderPage, renderBreadcrumbs, breadcrumbSchema, writeIfChanged,
} = require('./lib/layout');

const ROOT = path.resolve(__dirname, '..');
const LAST_REVIEW = '18 de noviembre de 2026';
const PENDIENTE_ASESORIA = '<mark class="alh-pending">[PENDIENTE: revisar con asesoría]</mark>';

function page({ slug, title, h1, kicker, lead, description, content, jsonld = [] }) {
  const url = `/${slug}/`;
  const crumbs = [{ name: 'Inicio', url: '/' }, { name: h1, url }];
  const body = `
        <section class="alh-page-header">
            <div class="container alh-narrow">
                ${renderBreadcrumbs(crumbs)}
                <span class="alh-kicker">${escapeHtml(kicker)}</span>
                <h1>${escapeHtml(h1)}</h1>
                ${lead ? `<p class="alh-lead">${lead}</p>` : ''}
            </div>
        </section>
        <div class="container alh-narrow">
            <div class="alh-prose">
${content}
            </div>
        </div>`;
  const pending = /\[PENDIENTE/.test(body);
  return {
    file: path.join(ROOT, slug, 'index.html'),
    html: renderPage({
      title: `${title} — Alhaurín al Día`,
      description,
      canonical: `${SITE_URL}${url}`,
      robots: pending ? 'noindex, follow' : 'index, follow',
      jsonld: [...jsonld, breadcrumbSchema(crumbs)],
      body,
    }),
  };
}

const mail = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;

function sobreElProyecto() {
  return page({
    slug: 'sobre-nosotros',
    title: 'Sobre el proyecto',
    h1: 'Sobre el proyecto',
    kicker: 'Alhaurín al Día',
    lead: 'Alhaurín al Día es una guía práctica de Alhaurín el Grande: reúne en un solo sitio lo que vecinos y visitantes consultan a diario, como la farmacia de guardia, el tiempo, los avisos, la agenda de planes, guías de trámites y servicios y un directorio de comercios.',
    description: 'Qué es Alhaurín al Día, para quién es, qué secciones ofrece, de dónde salen los datos y cómo se actualizan. Guía práctica de Alhaurín el Grande.',
    jsonld: [{
      '@context': 'https://schema.org',
      '@type': 'AboutPage',
      name: 'Sobre el proyecto Alhaurín al Día',
      url: `${SITE_URL}/sobre-nosotros/`,
      about: { '@type': 'Organization', name: 'Alhaurín al Día', url: SITE_URL, email: CONTACT_EMAIL },
    }],
    content: `
                <h2>Qué es Alhaurín al Día</h2>
                <p>Alhaurín al Día es un proyecto independiente centrado en Alhaurín el Grande (Málaga). Nació para resolver una necesidad muy concreta: la información útil del pueblo está repartida entre la web del Ayuntamiento, la sede electrónica, AEMET, el consorcio de transportes, las redes sociales de asociaciones y hermandades y los propios comercios. Aquí la ordenamos para que se encuentre en pocos segundos desde el móvil.</p>
                <h2>Para quién es</h2>
                <p>Para cualquier persona que viva en Alhaurín el Grande, que acabe de mudarse o que vaya a visitarlo: quien necesita saber qué farmacia está de guardia esta noche, qué hacer el fin de semana, cómo empadronarse o dónde llamar si hay un problema en la calle.</p>
                <h2>Qué secciones ofrece</h2>
                <ul>
                    <li><strong>Hoy:</strong> <a href="/farmacia-de-guardia/">farmacia de guardia</a>, <a href="/tiempo/">el tiempo</a> y <a href="/avisos/">avisos</a> de cortes, tráfico y alertas.</li>
                    <li><strong>Agenda:</strong> <a href="/agenda/">planes y eventos</a> del municipio y una página con <a href="/este-fin-de-semana/">lo que hay este fin de semana</a>.</li>
                    <li><strong>Guía útil:</strong> <a href="/guia-util/">explicaciones prácticas</a> sobre farmacias, autobuses, teléfonos, trámites, educación, ocio y servicios.</li>
                    <li><strong>Comercios:</strong> un <a href="/comercios/">directorio de negocios locales</a> por categorías.</li>
                    <li><strong>Actualidad:</strong> titulares recientes publicados por el Ayuntamiento, medios y entidades locales, siempre con enlace a su fuente original.</li>
                </ul>
                <h2>De dónde salen los datos</h2>
                <ul>
                    <li><strong>Fuentes oficiales:</strong> el calendario de farmacias de guardia y los avisos municipales proceden del Ayuntamiento de Alhaurín el Grande; la previsión y las alertas meteorológicas, de AEMET; la información de autobuses, del Consorcio de Transporte Metropolitano del Área de Málaga; los anuncios oficiales, del Boletín Oficial de la Provincia de Málaga.</li>
                    <li><strong>Organizadores:</strong> los eventos de la agenda salen de los anuncios de sus organizadores, entidades y medios locales. Cada ficha indica de dónde procede la información.</li>
                    <li><strong>Comercios:</strong> los datos del directorio los facilita o confirma el propio negocio.</li>
                </ul>
                <p>No sustituimos a ninguna fuente oficial: enlazamos siempre a ella para que puedas comprobar cualquier dato.</p>
                <h2>Cómo se actualiza</h2>
                <p>La farmacia de guardia, el tiempo, los avisos y la agenda se actualizan de forma automática varias veces al día a partir de las fuentes anteriores. Las guías se revisan a mano y cada una muestra la fecha de su última actualización. Si detectamos un error, lo corregimos o retiramos la información.</p>
                <h2>Independencia y publicidad</h2>
                <p>Alhaurín al Día no depende de ninguna administración ni partido. Para mantener el proyecto, la web puede mostrar publicidad y espacios de comercios destacados, siempre identificados como tales y separados de la información.</p>
                <h2>Contacto</h2>
                <p>Para sugerencias, correcciones o colaborar, escribe a ${mail} o usa la página de <a href="/contacto/">contacto</a>.</p>`,
  });
}

function contacto() {
  return page({
    slug: 'contacto',
    title: 'Contacto',
    h1: 'Contacto',
    kicker: 'Escríbenos',
    lead: `La forma más rápida de hablar con Alhaurín al Día es por email: ${mail}.`,
    description: 'Contacta con Alhaurín al Día para corregir un dato, proponer un evento para la agenda, sugerir una guía o aparecer en el directorio de comercios.',
    jsonld: [{
      '@context': 'https://schema.org',
      '@type': 'ContactPage',
      name: 'Contacto de Alhaurín al Día',
      url: `${SITE_URL}/contacto/`,
      mainEntity: { '@type': 'Organization', name: 'Alhaurín al Día', url: SITE_URL, email: CONTACT_EMAIL },
    }],
    content: `
                <h2>¿En qué podemos ayudarte?</h2>
                <ul>
                    <li><strong>Corregir un dato:</strong> indícanos la página y qué información no es correcta. Si puedes, añade el enlace a la fuente oficial.</li>
                    <li><strong>Añadir un evento a la agenda:</strong> envíanos el nombre, la fecha, la hora, el lugar, el precio (o si es gratuito), quién lo organiza y una descripción.</li>
                    <li><strong>Sugerir una guía:</strong> cuéntanos qué gestión o tema de Alhaurín el Grande te gustaría ver explicado.</li>
                    <li><strong>Aparecer en el directorio de comercios:</strong> consulta también la página <a href="/anunciarse/">Anúnciate</a>.</li>
                </ul>
                <h2>Formulario</h2>
                <p>Este formulario no envía nada a ningún servidor: al pulsar el botón se abre tu programa de correo con el mensaje preparado para que lo revises y lo envíes tú.</p>
                <form class="alh-contact-form" action="mailto:${CONTACT_EMAIL}" method="post" enctype="text/plain" data-mailto="${CONTACT_EMAIL}">
                    <p><label for="contacto-motivo"><strong>Motivo</strong></label><br>
                    <select id="contacto-motivo" name="motivo">
                        <option>Corregir un dato</option>
                        <option>Añadir un evento a la agenda</option>
                        <option>Sugerir una guía</option>
                        <option>Directorio de comercios</option>
                        <option>Otro</option>
                    </select></p>
                    <p><label for="contacto-mensaje"><strong>Mensaje</strong></label><br>
                    <textarea id="contacto-mensaje" name="mensaje" rows="6" required style="width:100%"></textarea></p>
                    <p><button class="alh-btn" type="submit">Preparar email</button></p>
                </form>
                <script>
                (function () {
                    var form = document.querySelector('.alh-contact-form');
                    if (!form) return;
                    form.addEventListener('submit', function (e) {
                        e.preventDefault();
                        var motivo = form.querySelector('[name=motivo]').value;
                        var mensaje = form.querySelector('[name=mensaje]').value;
                        location.href = 'mailto:' + form.dataset.mailto + '?subject=' + encodeURIComponent('[Alhaurín al Día] ' + motivo) + '&body=' + encodeURIComponent(mensaje);
                    });
                })();
                </script>
                <h2>Antes de escribir</h2>
                <p>Alhaurín al Día no es un servicio oficial: no podemos tramitar quejas, citas ni gestiones municipales. Para eso, dirígete al Ayuntamiento de Alhaurín el Grande o a su sede electrónica (tienes los accesos en la <a href="/guia-util/tramites/">guía de trámites</a>). En caso de emergencia, llama al 112.</p>
                <p>Los datos que nos envíes por email solo se usan para responderte. Más información en la <a href="/privacidad/">política de privacidad</a>.</p>`,
  });
}

function privacidad() {
  return page({
    slug: 'privacidad',
    title: 'Política de privacidad',
    h1: 'Política de privacidad',
    kicker: 'Legal',
    lead: `Última revisión: ${LAST_REVIEW}. Esta página explica qué datos personales se tratan cuando usas Alhaurín al Día, para qué y qué derechos tienes.`,
    description: 'Política de privacidad de Alhaurín al Día: qué datos se tratan, con qué finalidad, durante cuánto tiempo y cómo ejercer tus derechos.',
    content: `
                <h2>Responsable del tratamiento</h2>
                <p>Responsable: titular del sitio web alhaurinaldia.es ${PENDIENTE_ASESORIA}. Contacto: ${mail}.</p>
                <h2>Qué datos tratamos y para qué</h2>
                <ul>
                    <li><strong>Mensajes que nos envías por email.</strong> Tu dirección de correo y lo que nos cuentes, para responderte. Base jurídica: tu consentimiento al escribirnos. Se conservan el tiempo necesario para atender tu consulta.</li>
                    <li><strong>Reportes del Radar Social.</strong> Si envías un reporte vecinal, se guarda el contenido del reporte y, si lo indicas, el alias y la ubicación aproximada que escribas. Se almacenan en Google Firebase (Firestore) para mostrarlos en la web. Base jurídica: tu consentimiento al enviarlo. No pidas ni publiques datos de terceros.</li>
                    <li><strong>Estadísticas de uso.</strong> Usamos Cloudflare Web Analytics, que mide visitas de forma agregada sin cookies y sin identificarte.</li>
                    <li><strong>Publicidad.</strong> Si se muestran anuncios de Google AdSense, Google y sus socios pueden tratar datos de navegación y usar cookies solo si lo aceptas en el aviso de consentimiento. Puedes cambiar tu decisión en cualquier momento con el enlace «Configurar cookies» del pie de página. Más información en la <a href="/cookies/">política de cookies</a>.</li>
                </ul>
                <h2>Datos que se guardan solo en tu dispositivo</h2>
                <p>Algunas funciones, como guardar noticias en «Mi Alhaurín», usan el almacenamiento local de tu navegador. Esos datos no salen de tu dispositivo y puedes borrarlos desde la configuración del navegador.</p>
                <h2>Servicios de terceros que se cargan en la web</h2>
                <ul>
                    <li><strong>Cloudflare</strong> (alojamiento, seguridad y estadísticas agregadas).</li>
                    <li><strong>Google Fonts</strong> (tipografías) y <strong>Google Firebase</strong> (Radar Social).</li>
                    <li><strong>Open-Meteo</strong> y <strong>RainViewer</strong> (datos meteorológicos y radar de lluvia en las páginas del tiempo).</li>
                    <li><strong>OpenStreetMap</strong> y su buscador <strong>Nominatim</strong> (mapas y búsqueda de direcciones en el radar y el Radar Social).</li>
                    <li><strong>Google AdSense</strong> (publicidad, solo con tu consentimiento).</li>
                    <li>Imágenes y enlaces de <strong>YouTube</strong> y de las webs de las fuentes citadas.</li>
                </ul>
                <p>Al cargar estos servicios, tu navegador les comunica tu dirección IP. Algunos de ellos pueden tratar datos fuera del Espacio Económico Europeo con las garantías previstas en el Reglamento General de Protección de Datos.</p>
                <h2>Tus derechos</h2>
                <p>Puedes pedir el acceso, la rectificación, la supresión, la oposición, la limitación del tratamiento o la portabilidad de tus datos escribiendo a ${mail}. Si consideras que no se han atendido correctamente, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es).</p>
                <h2>Cambios en esta política</h2>
                <p>Si cambiamos esta política, actualizaremos la fecha de revisión que aparece al principio de la página.</p>`,
  });
}

function cookies() {
  return page({
    slug: 'cookies',
    title: 'Política de cookies',
    h1: 'Política de cookies',
    kicker: 'Legal',
    lead: `Última revisión: ${LAST_REVIEW}. Aquí te contamos qué cookies y tecnologías similares se usan en Alhaurín al Día y cómo puedes configurarlas.`,
    description: 'Política de cookies de Alhaurín al Día: qué cookies se usan, para qué, quién las instala y cómo configurar o retirar tu consentimiento.',
    content: `
                <h2>Qué son las cookies</h2>
                <p>Las cookies son pequeños archivos que una web guarda en tu navegador para recordar información sobre tu visita. Algunas son necesarias para que la web funcione y otras, como las publicitarias, solo se usan si las aceptas.</p>
                <h2>Cookies y almacenamiento que usamos</h2>
                <ul>
                    <li><strong>Técnicas y de preferencias (propias):</strong> el almacenamiento local de tu navegador guarda, por ejemplo, las noticias que marcas en «Mi Alhaurín». No requieren consentimiento y no salen de tu dispositivo.</li>
                    <li><strong>Gestión del consentimiento:</strong> la herramienta de consentimiento guarda tu decisión sobre cookies para no volver a preguntarte en cada visita.</li>
                    <li><strong>Estadísticas:</strong> Cloudflare Web Analytics no usa cookies ni identificadores persistentes.</li>
                    <li><strong>Publicidad (de terceros):</strong> Google AdSense y sus socios pueden usar cookies para mostrar anuncios, limitar cuántas veces ves uno y medir su rendimiento. Solo se cargan si das tu consentimiento; si no lo das, no se muestran anuncios personalizados.</li>
                </ul>
                <h2 id="configurar">Configurar o retirar el consentimiento</h2>
                <p>Puedes cambiar tu decisión en cualquier momento:</p>
                <p><button type="button" class="alh-btn" data-consent-open>Configurar cookies</button></p>
                <p>También puedes bloquear o borrar las cookies desde la configuración de tu navegador. Si las bloqueas todas, puede que algunas funciones de la web dejen de funcionar.</p>
                <h2>Más información</h2>
                <p>Consulta la <a href="/privacidad/">política de privacidad</a> o escríbenos a ${mail}. Información de Google sobre cómo usa los datos de los sitios que usan sus servicios: policies.google.com/technologies/partner-sites.</p>`,
  });
}

function avisoLegal() {
  return page({
    slug: 'aviso-legal',
    title: 'Aviso legal',
    h1: 'Aviso legal',
    kicker: 'Legal',
    lead: `Última revisión: ${LAST_REVIEW}. Información general sobre el sitio web alhaurinaldia.es, en cumplimiento de la Ley 34/2002 de servicios de la sociedad de la información.`,
    description: 'Aviso legal de Alhaurín al Día: datos del sitio, condiciones de uso, propiedad intelectual, responsabilidad y enlaces a terceros.',
    content: `
                <h2>Datos del sitio web</h2>
                <ul>
                    <li><strong>Nombre del sitio:</strong> Alhaurín al Día (alhaurinaldia.es).</li>
                    <li><strong>Titular:</strong> ${PENDIENTE_ASESORIA}</li>
                    <li><strong>NIF:</strong> ${PENDIENTE_ASESORIA}</li>
                    <li><strong>Domicilio:</strong> ${PENDIENTE_ASESORIA}</li>
                    <li><strong>Email de contacto:</strong> ${mail}</li>
                </ul>
                <h2>Objeto</h2>
                <p>Alhaurín al Día es una guía práctica de Alhaurín el Grande que recopila y ordena información de interés público (farmacias de guardia, tiempo, avisos, agenda, guías y comercios) a partir de fuentes oficiales, organizadores y negocios locales.</p>
                <h2>Condiciones de uso</h2>
                <p>El acceso a la web es libre y gratuito. Quien la usa se compromete a hacerlo de forma lícita y a no enviar contenidos falsos, ofensivos o que vulneren derechos de terceros, por ejemplo a través del Radar Social.</p>
                <h2>Exactitud de la información</h2>
                <p>Ponemos cuidado en que la información sea correcta y esté al día, pero puede contener errores o quedar desactualizada. Los datos de carácter oficial (guardias, avisos, horarios, trámites) deben comprobarse siempre en la fuente oficial enlazada antes de tomar decisiones. Alhaurín al Día no es un servicio oficial ni sustituye a ninguna administración.</p>
                <h2>Propiedad intelectual</h2>
                <p>Los textos propios, el diseño y la organización de los contenidos de la web pertenecen a Alhaurín al Día. Los titulares, imágenes y contenidos de terceros pertenecen a sus autores y se citan con enlace a su fuente original. Si eres titular de un contenido y quieres que lo retiremos, escríbenos a ${mail}.</p>
                <h2>Enlaces a terceros</h2>
                <p>La web incluye enlaces a sitios de terceros. No controlamos su contenido ni somos responsables de él. Los enlaces patrocinados se identifican como tales.</p>
                <h2>Publicidad</h2>
                <p>La web puede mostrar anuncios de Google AdSense y espacios de comercios destacados, siempre identificados. Más información en la <a href="/cookies/">política de cookies</a>.</p>
                <h2>Legislación aplicable</h2>
                <p>Este aviso legal se rige por la legislación española ${PENDIENTE_ASESORIA}.</p>`,
  });
}

function main() {
  let written = 0;
  for (const p of [sobreElProyecto(), contacto(), privacidad(), cookies(), avisoLegal()]) {
    if (writeIfChanged(fs, p.file, p.html)) written++;
  }
  console.log(`Páginas de información y legales: ${written} escritas.`);
}

main();
