const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOME_FILE = path.join(ROOT, 'index.html');
const SITE_URL = 'https://alhaurinaldia.es';

let html = fs.readFileSync(HOME_FILE, 'utf8');
let updated = false;

if (!html.includes('<link rel="canonical" href="https://alhaurinaldia.es/">')) {
  html = html.replace(
    '    <meta name="robots" content="index, follow" />\n',
    '    <meta name="robots" content="index, follow" />\n    <link rel="canonical" href="https://alhaurinaldia.es/">\n'
  );
  updated = true;
}

if (!html.includes('"@type": "NewsMediaOrganization"')) {
  const jsonLd = `
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": "${SITE_URL}/#website",
          "name": "Alhaurín al Día",
          "url": "${SITE_URL}/",
          "inLanguage": "es-ES",
          "publisher": {
            "@id": "${SITE_URL}/#organization"
          }
        },
        {
          "@type": "NewsMediaOrganization",
          "@id": "${SITE_URL}/#organization",
          "name": "Alhaurín al Día",
          "url": "${SITE_URL}/",
          "logo": {
            "@type": "ImageObject",
            "url": "${SITE_URL}/assets/favicon.svg"
          },
          "areaServed": {
            "@type": "Place",
            "name": "Alhaurín el Grande"
          },
          "foundingDate": "2026",
          "description": "Medio digital hiperlocal y guía útil independiente de Alhaurín el Grande.",
          "contactPoint": {
            "@type": "ContactPoint",
            "contactType": "Información, correcciones y publicidad local",
            "url": "${SITE_URL}/contacto/",
            "availableLanguage": "es"
          }
        },
        {
          "@type": "WebPage",
          "@id": "${SITE_URL}/#webpage",
          "url": "${SITE_URL}/",
          "name": "Alhaurín al Día | Noticias, guía útil y comercios de Alhaurín el Grande",
          "description": "Noticias, agenda, farmacias, teléfonos útiles, trámites, comercios, rutas y planes en Alhaurín el Grande.",
          "isPartOf": {
            "@id": "${SITE_URL}/#website"
          },
          "about": {
            "@type": "Place",
            "name": "Alhaurín el Grande"
          },
          "inLanguage": "es-ES"
        }
      ]
    }
    </script>
`;

  html = html.replace('    <link rel="stylesheet" href="./home-live.css">\n', `    <link rel="stylesheet" href="./home-live.css">\n${jsonLd}`);
  updated = true;
}

if (updated) {
  fs.writeFileSync(HOME_FILE, html);
  console.log('SEO de home actualizado');
} else {
  console.log('SEO de home ya estaba actualizado');
}
