// Batería de regresión de deduplicación (task #20, Bloque B) contra el
// módulo REAL scripts/dedupe-news.js -- el motor de deduplicación vivo en
// `npm run build`, que hasta ahora no tenía NINGÚN test. dedupeNews() y
// las funciones de las que depende son puras (sin I/O); solo main() toca
// disco. Se neutraliza la llamada incondicional a main() al final del
// fichero (mismo patrón ya usado en test_archive_orphan_news.js, task
// #18) para poder importar las funciones puras sin ejecutar I/O real ni
// tocar data/noticias.json.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'dedupe-news.js');

const fallos = [];
function check(nombre, condicion, detalle) {
  const estado = condicion ? 'OK' : 'FALLA';
  console.log(`${estado} ${nombre}${detalle !== undefined ? ' ' + JSON.stringify(detalle) : ''}`);
  if (!condicion) fallos.push(nombre);
}

function cargarModulo() {
  const codigoOriginal = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const codigoSinMain = codigoOriginal.replace(
    /\nmain\(\);\s*$/,
    '\nmodule.exports = { arePotentialDuplicates, isWithinDuplicateWindow, jaccard, '
    + 'chooseCanonical, dedupeNews, sourceKey, pageKey, qualityScore, sourcePriority, DUPLICATE_WINDOW_DAYS };\n'
  );
  if (codigoSinMain === codigoOriginal) {
    throw new Error('No se pudo neutralizar la llamada a main() -- revisa el patrón de reemplazo');
  }
  const moduleObj = { exports: {} };
  const sandbox = {
    module: moduleObj,
    exports: moduleObj.exports,
    require,
    __dirname: path.dirname(SCRIPT_PATH),
    __filename: SCRIPT_PATH,
    process: { argv: process.argv, env: process.env },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(codigoSinMain, sandbox, { filename: SCRIPT_PATH });
  return sandbox.module.exports;
}

const {
  arePotentialDuplicates, isWithinDuplicateWindow, jaccard, chooseCanonical,
  dedupeNews, DUPLICATE_WINDOW_DAYS,
} = cargarModulo();

check('ventana de duplicado real es 14 días (misma que reglas-editoriales.json)', DUPLICATE_WINDOW_DAYS === 14, DUPLICATE_WINDOW_DAYS);

const FECHA_BASE = '2026-08-15T00:00:00.000Z';

function noticia(overrides) {
  return {
    titulo: 'Titulo por defecto', descripcion: 'Descripcion por defecto', pagina: '',
    enlace: '', fuente: 'Test', fecha: FECHA_BASE, categoria: 'Actualidad',
    ...overrides,
  };
}

function restarDias(fechaISO, dias) {
  return new Date(new Date(fechaISO).getTime() - dias * 24 * 60 * 60 * 1000).toISOString();
}

console.log('=== 1. exact duplicate: mismo enlace (sourceKey) -> duplicado, sin mirar jaccard ===');
{
  const a = noticia({ titulo: 'Un titular', descripcion: 'Una descripcion', enlace: 'https://fuente.example/x' });
  const b = noticia({ titulo: 'Titular completamente distinto', descripcion: 'Descripcion completamente distinta', enlace: 'https://fuente.example/x' });
  check('mismo enlace -> duplicado aunque el texto no se parezca en nada', arePotentialDuplicates(a, b) === true);
}

console.log('\n=== 2. exact duplicate: misma pagina (pageKey) -> duplicado, sin mirar jaccard ===');
{
  const a = noticia({ titulo: 'Un titular', descripcion: 'Una descripcion', pagina: 'noticias/x.html' });
  const b = noticia({ titulo: 'Titular completamente distinto', descripcion: 'Descripcion completamente distinta', pagina: 'noticias/x.html' });
  check('misma pagina -> duplicado aunque el texto no se parezca en nada', arePotentialDuplicates(a, b) === true);
}

console.log('\n=== 3. near duplicate: jaccard >= 0.72 dentro de la ventana -> duplicado ===');
{
  // Palabras significativas compartidas (longitud>3, sin stopwords locales)
  // construidas para superar 0.72 con margen.
  const a = noticia({
    titulo: 'Ayuntamiento aprueba nuevas ayudas economicas asociaciones vecinales barrio',
    descripcion: 'presupuesto destinado proyectos culturales deportivos',
    fecha: FECHA_BASE,
  });
  const b = noticia({
    titulo: 'Ayuntamiento aprueba nuevas ayudas economicas asociaciones vecinales zona',
    descripcion: 'presupuesto destinado proyectos culturales deportivos',
    fecha: restarDias(FECHA_BASE, 1),
  });
  const sim = jaccard(`${a.titulo} ${a.descripcion}`, `${b.titulo} ${b.descripcion}`);
  check('jaccard construido efectivamente >= 0.72', sim >= 0.72, sim);
  check('near duplicate -> arePotentialDuplicates=true', arePotentialDuplicates(a, b) === true, sim);
}

console.log('\n=== 4. evento distinto: texto realmente distinto -> NO duplicado ===');
{
  const a = noticia({ titulo: 'Coro rociero celebra su veinticinco aniversario parroquia', descripcion: 'certamen baile folclore tradicion' });
  const b = noticia({ titulo: 'Guardia civil investiga robo vivienda urbanizacion', descripcion: 'atestado judicial vecinos alarma' });
  check('sin solapamiento real -> NO duplicado', arePotentialDuplicates(a, b) === false);
}

console.log('\n=== 5. ventana temporal: exactamente 14 días -> SÍ; 14 días + 1h -> NO (con jaccard alto) ===');
{
  const base = { titulo: 'Ayuntamiento aprueba nuevas ayudas economicas asociaciones vecinales barrio', descripcion: 'presupuesto destinado proyectos culturales deportivos' };
  const a = noticia({ ...base, fecha: FECHA_BASE });
  const bDentro = noticia({ ...base, fecha: restarDias(FECHA_BASE, 14) });
  const bFuera = noticia({ ...base, fecha: new Date(new Date(restarDias(FECHA_BASE, 14)).getTime() - 60 * 60 * 1000).toISOString() });

  check('isWithinDuplicateWindow: exactamente 14 días -> true', isWithinDuplicateWindow(a, bDentro) === true);
  check('isWithinDuplicateWindow: 14 días + 1h -> false', isWithinDuplicateWindow(a, bFuera) === false);
  check('arePotentialDuplicates: dentro de ventana + texto similar -> true', arePotentialDuplicates(a, bDentro) === true);
  check('arePotentialDuplicates: fuera de ventana, aunque el texto sea casi idéntico -> false', arePotentialDuplicates(a, bFuera) === false);
}

console.log('\n=== 6. categoría distinta NO actúa como hard gate (dedupe-news.js no la consulta) ===');
{
  const base = { titulo: 'Ayuntamiento aprueba nuevas ayudas economicas asociaciones vecinales barrio', descripcion: 'presupuesto destinado proyectos culturales deportivos', fecha: FECHA_BASE };
  const a = noticia({ ...base, categoria: 'Municipal' });
  const b = noticia({ ...base, categoria: 'Deportes', fecha: restarDias(FECHA_BASE, 1) });
  check('categorías distintas, mismo texto -> sigue siendo duplicado (categoria no es señal)', arePotentialDuplicates(a, b) === true);
}

console.log('\n=== 7. entidades distintas NO actúan como hard gate (dedupe-news.js no extrae entidades) ===');
{
  // Fuentes/autores distintos (lo más cercano a "entidad" que toca este
  // módulo) no cambian el resultado -- solo importan enlace/pagina/texto.
  const base = { titulo: 'Ayuntamiento aprueba nuevas ayudas economicas asociaciones vecinales barrio', descripcion: 'presupuesto destinado proyectos culturales deportivos', fecha: FECHA_BASE };
  const a = noticia({ ...base, fuente: 'RTV Alhaurín el Grande' });
  const b = noticia({ ...base, fuente: 'Diario Sur', fecha: restarDias(FECHA_BASE, 1) });
  check('fuentes distintas, mismo texto -> sigue siendo duplicado (fuente no bloquea la fusión)', arePotentialDuplicates(a, b) === true);
}

console.log('\n=== 8. chooseCanonical(): prioridad de fuente + calidad deciden, no el orden de llegada ===');
{
  const pobre = noticia({ titulo: 'x', descripcion: 'y', fuente: 'Fuente Desconocida', fecha: FECHA_BASE });
  const rica = noticia({
    titulo: 'Titular mucho más completo y descriptivo del suceso ocurrido',
    descripcion: 'Descripción bastante más larga y detallada del contenido de la noticia en cuestión.',
    cuerpo: 'Cuerpo largo con mucho contenido real sobre la noticia y sus detalles.',
    imagen: 'https://x.example/img.jpg', pagina: 'noticias/rica.html',
    fuente: 'Ayuntamiento', fecha: FECHA_BASE,
  });
  const elegido = chooseCanonical([pobre, rica]);
  check('elige la entrada de mayor calidad/prioridad, no la primera del array', elegido === rica);
  const elegidoOrdenInverso = chooseCanonical([rica, pobre]);
  check('el resultado no depende del orden de entrada', elegidoOrdenInverso === rica);
}

console.log('\n=== 9. dedupeNews(): agrupa duplicados, conserva 1 canonical por grupo, no toca al resto ===');
{
  const base = { titulo: 'Ayuntamiento aprueba nuevas ayudas economicas asociaciones vecinales barrio', descripcion: 'presupuesto destinado proyectos culturales deportivos' };
  const dupA = noticia({ ...base, fuente: 'Fuente Menor', fecha: FECHA_BASE });
  const dupB = noticia({ ...base, fuente: 'Ayuntamiento', fecha: restarDias(FECHA_BASE, 1), imagen: 'https://x.example/i.jpg', pagina: 'noticias/b.html' });
  const distinta = noticia({ titulo: 'Guardia civil investiga robo vivienda urbanizacion', descripcion: 'atestado judicial vecinos alarma', fecha: FECHA_BASE });

  const resultado = dedupeNews([dupA, dupB, distinta], []);
  check('salida: 2 noticias (el grupo duplicado se fusiona en 1 + la distinta)', resultado.kept.length === 2, resultado.kept.length);
  check('1 grupo de duplicados detectado', resultado.duplicateGroups.length === 1, resultado.duplicateGroups.length);
  check('el canonical del grupo es la entrada de mayor calidad (dupB)', resultado.kept.includes(dupB));
  check('la entrada distinta se conserva intacta', resultado.kept.includes(distinta));
}

console.log('\n=== 10. dedupeNews(): coincidencia con el archivo -> se descarta, no se re-publica ===');
{
  const activa = noticia({ titulo: 'Ayuntamiento aprueba nuevas ayudas economicas asociaciones vecinales barrio', descripcion: 'presupuesto destinado proyectos culturales deportivos', fecha: FECHA_BASE, pagina: 'noticias/activa.html' });
  const archivada = noticia({ titulo: 'Ayuntamiento aprueba nuevas ayudas economicas asociaciones vecinales barrio', descripcion: 'presupuesto destinado proyectos culturales deportivos', fecha: restarDias(FECHA_BASE, 2), pagina: 'noticias/archivada-distinta.html' });

  const resultado = dedupeNews([activa], [archivada]);
  check('la activa que coincide con el archivo NO se mantiene', resultado.kept.length === 0, resultado.kept);
  check('se reporta como archiveDuplicateGroup', resultado.archiveDuplicateGroups.length === 1, resultado.archiveDuplicateGroups);
}

console.log('\n=== 11. dedupeNews(): página resucitada (misma pagina en activas y archivo) NO se descarta ===');
{
  const activa = noticia({ titulo: 'x', descripcion: 'y', pagina: 'noticias/misma.html', fecha: FECHA_BASE });
  const archivada = noticia({ titulo: 'x', descripcion: 'y', pagina: 'noticias/misma.html', fecha: restarDias(FECHA_BASE, 5) });

  const resultado = dedupeNews([activa], [archivada]);
  check('la página resucitada SÍ se mantiene activa (no es un duplicado de contenido)', resultado.kept.length === 1 && resultado.kept[0] === activa, resultado.kept);
  check('no se reporta como archiveDuplicateGroup', resultado.archiveDuplicateGroups.length === 0, resultado.archiveDuplicateGroups);
}

console.log();
if (fallos.length) {
  console.log(`RESULTADO: ${fallos.length} fallo(s): ${JSON.stringify(fallos)}`);
  process.exit(1);
}
console.log('RESULTADO: todos los tests pasaron');
