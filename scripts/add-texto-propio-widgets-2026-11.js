// One-off idempotente (noviembre 2026): añade una sección de texto propio a
// las páginas indexables que eran solo un widget (calendario, radar,
// previsión por horas, meteo agrícola y Radar Social). Explica qué muestra
// cada herramienta, de dónde salen los datos y cómo usarla. No añade datos
// locales nuevos. Requisito de AdSense: ninguna página indexable vacía o con
// solo un widget.
//
// Uso: node scripts/add-texto-propio-widgets-2026-11.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MARK = '<!-- alh-texto-propio -->';

const TEXTS = {
  'planes/index.html': {
    h2: 'Cómo usar el calendario de planes',
    ps: [
      'Este calendario reúne en una vista mensual los eventos de la agenda de Alhaurín el Grande: conciertos, fiestas y cultos, partidos del CD Alhaurino, talleres, cine y propuestas gastronómicas. Cada color corresponde a una categoría, de modo que de un vistazo puedes ver qué tipo de planes hay cada semana.',
      'Al pulsar un día se muestran sus eventos y, desde cada uno, puedes abrir su ficha con la fecha, la hora, el lugar y el enlace a la publicación original del organizador. Recuerda confirmar siempre los detalles en esa fuente antes de ir, porque los horarios pueden cambiar.',
      'Si prefieres una lista, consulta la <a href="/agenda/">agenda completa</a>, que permite filtrar por hoy, fin de semana, mes o categoría, o mira directamente <a href="/este-fin-de-semana/">qué hacer este fin de semana</a>. ¿Organizas un evento? Envíanos los datos desde la página de <a href="/contacto/">contacto</a>.',
    ],
  },
  'tiempo/agro/index.html': {
    h2: 'Para qué sirve MeteoAgro',
    ps: [
      'MeteoAgro traduce la previsión meteorológica a datos útiles para quien trabaja el campo en el Valle del Guadalhorce: riesgo de helada en las próximas noches, evapotranspiración de referencia (ET₀), balance entre lluvia y evaporación y horas de frío acumuladas, que influyen en la floración de muchos frutales.',
      'Los valores se calculan en tu navegador a partir de los modelos meteorológicos que ofrece Open-Meteo para las coordenadas de Alhaurín el Grande, por lo que son orientativos: el microclima de cada finca puede variar según la altitud, la orientación y la cercanía al río.',
      'Úsalo como apoyo para planificar riegos o proteger cultivos y contrástalo con las previsiones y avisos oficiales de AEMET, que tienes resumidos en la página principal del <a href="/tiempo/">tiempo en Alhaurín el Grande</a> y en <a href="/avisos/">avisos</a>.',
    ],
  },
  'tiempo/prevision-horaria/index.html': {
    h2: 'Cómo leer la previsión por horas',
    ps: [
      'Esta página muestra, hora a hora, la temperatura, la probabilidad y cantidad de lluvia, el viento y la humedad previstos en Alhaurín el Grande para las próximas 48 horas y los próximos siete días. Las gráficas permiten ver de un vistazo cuándo sube la temperatura, en qué franja es más probable que llueva o a qué hora arrecia el viento.',
      'Los datos proceden de los modelos de alta resolución que publica Open-Meteo y se cargan en directo cada vez que abres la página. Son útiles para decidir a qué hora salir a caminar, tender la ropa o regar, pero conviene contrastarlos con la previsión oficial de AEMET.',
      'Tienes la previsión oficial resumida, el clima medio de cada mes y las preguntas frecuentes en la página principal del <a href="/tiempo/">tiempo en Alhaurín el Grande</a>, y las alertas en vigor en <a href="/avisos/">avisos</a>.',
    ],
  },
  'tiempo/radar/index.html': {
    h2: 'Qué muestra el radar de lluvia',
    ps: [
      'El mapa enseña la precipitación detectada por radar en las últimas dos horas en torno a Alhaurín el Grande, con una animación que permite ver hacia dónde se desplazan los chubascos. Los colores indican la intensidad: los tonos claros corresponden a lluvia débil y los más intensos a chubascos fuertes o tormenta.',
      'Las imágenes del radar proceden del servicio RainViewer y el mapa base, de OpenStreetMap. Se actualizan cada pocos minutos, así que son útiles para saber si una tormenta está a punto de llegar, pero no sustituyen a los avisos oficiales.',
      'Si hay riesgo de lluvias fuertes, consulta las alertas de AEMET en <a href="/avisos/">avisos</a> y la previsión completa en <a href="/tiempo/">el tiempo en Alhaurín el Grande</a>.',
    ],
  },
  'radar-social/index.html': {
    h2: 'Qué es el Radar Social',
    ps: [
      'El Radar Social recoge reportes de vecinos y vecinas sobre lo que está pasando en Alhaurín el Grande en este momento: cortes de agua o luz en una calle, lluvia acumulada en una zona, viento fuerte, incidencias en la vía pública o problemas de tráfico. Cada reporte aparece en el mapa con su hora para que otras personas puedan saber si les afecta.',
      'Los reportes los envían los propios usuarios y se muestran tal cual, así que son información orientativa y no oficial. Para avisos confirmados, consulta la página de <a href="/avisos/">avisos</a>, donde recogemos los comunicados del Ayuntamiento y las alertas de AEMET.',
      'Al enviar un reporte no compartas datos personales tuyos ni de otras personas. Puedes consultar cómo se tratan los reportes en la <a href="/privacidad/">política de privacidad</a>.',
    ],
  },
};

let changed = 0;
for (const [rel, t] of Object.entries(TEXTS)) {
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) continue;
  const html = fs.readFileSync(file, 'utf8');
  if (html.includes(MARK)) continue;
  const section = `${MARK}
        <section class="container alh-own-text" style="max-width:860px;padding:24px 16px 40px;line-height:1.65">
            <h2>${t.h2}</h2>
            ${t.ps.map((p) => `<p>${p}</p>`).join('\n            ')}
        </section>
    </main>`;
  const idx = html.lastIndexOf('</main>');
  if (idx === -1) continue;
  fs.writeFileSync(file, html.slice(0, idx) + section + html.slice(idx + '</main>'.length));
  changed++;
}
console.log(`Texto propio añadido a ${changed} páginas de widget.`);
