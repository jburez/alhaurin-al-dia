// Tests de scripts/archive-orphan-news.js (fix id/enlace, task #18) contra
// el módulo REAL. El script no expone module.exports (fuera de alcance
// añadirlo) y ejecuta main() incondicionalmente al final, así que se carga
// con vm en un sandbox donde __dirname apunta a un ROOT temporal aislado
// (scripts/archive-orphan-news.js resuelve ROOT = path.resolve(__dirname,
// '..'), por lo que apuntar __dirname a <tmp>/scripts hace que todo el
// pipeline lea/escriba exclusivamente dentro de <tmp>, nunca en el repo
// real). NO se modifica el fichero real: solo esta copia en memoria.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(ROOT, 'scripts', 'archive-orphan-news.js');

const fallos = [];
function check(nombre, condicion, detalle) {
  const estado = condicion ? 'OK' : 'FALLA';
  console.log(`${estado} ${nombre}${detalle !== undefined ? ' ' + JSON.stringify(detalle) : ''}`);
  if (!condicion) fallos.push(nombre);
}

// argvOverride: WRITE se calcula en el propio módulo como
// `process.argv.includes('--write')` a nivel de módulo (no dentro de
// main()), así que debe fijarse ANTES de cargar el código, no pasarse como
// argumento a main().
function cargarModulo(dirnameOverride, argvOverride) {
  const codigoOriginal = fs.readFileSync(SCRIPT_PATH, 'utf8');
  const codigoSinMain = codigoOriginal.replace(
    /\nmain\(\);\s*$/,
    '\nmodule.exports = { extractMetadataFromHtml, extraerIdBookmark, extraerEnlaceFuente, extraerAtributo, encontrarTagConClase, main };\n'
  );
  if (codigoSinMain === codigoOriginal) {
    throw new Error('No se pudo neutralizar la llamada a main() -- revisa el patrón de reemplazo');
  }
  const moduleObj = { exports: {} };
  const sandbox = {
    module: moduleObj,
    exports: moduleObj.exports,
    require,
    __dirname: dirnameOverride,
    __filename: path.join(dirnameOverride, 'archive-orphan-news.js'),
    process: { ...process, argv: argvOverride || process.argv },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(codigoSinMain, sandbox, { filename: SCRIPT_PATH });
  return sandbox.module.exports;
}

function tmpRootConScripts() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'archive-orphan-test-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'noticias'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  return root;
}

function htmlBase({ bookmark = '', sourceBox = '' } = {}) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta property="og:title" content="Titulo de prueba">
<meta name="description" content="Descripcion de prueba suficientemente larga.">
</head>
<body>
<article>
<h1>Titulo de prueba</h1>
<time datetime="2026-08-20T10:00:00.000Z">20 ago 2026</time>
<p>Cuerpo de la noticia de prueba.</p>
${sourceBox}
</article>
<aside>
${bookmark}
</aside>
</body>
</html>
`;
}

const BOOKMARK_MODERNO = `<button type="button" class="btn btn-secondary bookmark-btn" data-id="https-fuente-example-com-articulo-abc123" data-title="Titulo de prueba" data-url="https://alhaurinaldia.es/noticias/articulo-de-prueba.html">⭐ Guardar en Mi Alhaurín</button>`;

const SOURCE_BOX_MODERNO = `<div class="article-source-box"><div><span>Fuente original</span><strong>Fuente Example</strong></div><a class="btn btn-primary" href="https://fuente.example.com/articulo-original/" target="_blank" rel="noopener noreferrer">Leer en la fuente original</a></div>`;

console.log('=== 1. HTML moderno con bookmark + source box -> extrae id y enlace ===');
{
  const root = tmpRootConScripts();
  const { extractMetadataFromHtml } = cargarModulo(path.join(root, 'scripts'));
  const file = path.join(root, 'noticias', 'articulo-de-prueba.html');
  fs.writeFileSync(file, htmlBase({ bookmark: BOOKMARK_MODERNO, sourceBox: SOURCE_BOX_MODERNO }), 'utf8');
  const meta = extractMetadataFromHtml(file, 'noticias/articulo-de-prueba.html');
  check('id extraido', meta.id === 'https-fuente-example-com-articulo-abc123', meta.id);
  check('enlace extraido', meta.enlace === 'https://fuente.example.com/articulo-original/', meta.enlace);
}

console.log('\n=== 2. HTML legacy sin bookmark ni source box -> sigue archivando sin error ===');
{
  const root = tmpRootConScripts();
  const { extractMetadataFromHtml } = cargarModulo(path.join(root, 'scripts'));
  const file = path.join(root, 'noticias', 'articulo-legacy.html');
  fs.writeFileSync(file, htmlBase(), 'utf8');
  let meta;
  let error = null;
  try {
    meta = extractMetadataFromHtml(file, 'noticias/articulo-legacy.html');
  } catch (e) {
    error = e;
  }
  check('no lanza error', error === null, error && error.message);
  check('titulo igual se extrae', meta.titulo === 'Titulo de prueba', meta.titulo);
  check('no añade clave id', !('id' in meta), meta);
  check('no añade clave enlace', !('enlace' in meta), meta);
}

console.log('\n=== 2b. source box presente pero SIN enlace "Leer en la fuente original" -> enlace null ===');
{
  const root = tmpRootConScripts();
  const { extractMetadataFromHtml } = cargarModulo(path.join(root, 'scripts'));
  const sourceBoxSinEnlace = `<div class="article-source-box"><div><span>Fuente original</span><strong>Fuente Example</strong></div></div>`;
  const file = path.join(root, 'noticias', 'articulo-sin-enlace.html');
  fs.writeFileSync(file, htmlBase({ bookmark: BOOKMARK_MODERNO, sourceBox: sourceBoxSinEnlace }), 'utf8');
  const meta = extractMetadataFromHtml(file, 'noticias/articulo-sin-enlace.html');
  check('no añade clave enlace', !('enlace' in meta), meta);
  check('sí añade id (bookmark presente)', meta.id === 'https-fuente-example-com-articulo-abc123', meta.id);
}

console.log('\n=== 3. source box con atributos/whitespace/orden distintos -> enlace correcto ===');
{
  const root = tmpRootConScripts();
  const { extractMetadataFromHtml } = cargarModulo(path.join(root, 'scripts'));
  const sourceBoxRaro = `<div id="caja-fuente" class="premium article-source-box variante-b">
    <div>
      <span>Fuente original</span>
      <strong>Otra Fuente</strong>
    </div>
    <a target="_blank"
       rel="noopener noreferrer"
       class="btn btn-primary"
       href="https://otra-fuente.example.org/2026/08/noticia-original.html"
    >
      Leer en la fuente original
    </a>
  </div>`;
  const file = path.join(root, 'noticias', 'articulo-raro.html');
  fs.writeFileSync(file, htmlBase({ bookmark: BOOKMARK_MODERNO, sourceBox: sourceBoxRaro }), 'utf8');
  const meta = extractMetadataFromHtml(file, 'noticias/articulo-raro.html');
  check(
    'enlace correcto pese a whitespace/orden de atributos',
    meta.enlace === 'https://otra-fuente.example.org/2026/08/noticia-original.html',
    meta.enlace
  );
}

console.log('\n=== 4. bookmark con atributos en orden distinto -> id correcto ===');
{
  const root = tmpRootConScripts();
  const { extractMetadataFromHtml } = cargarModulo(path.join(root, 'scripts'));
  const bookmarkOrdenDistinto = `<button data-url="https://alhaurinaldia.es/noticias/articulo-orden.html" type="button" data-title="Titulo" class="btn btn-secondary bookmark-btn" style="margin-top: 12px;" data-id="orden-distinto-id-xyz">⭐ Guardar</button>`;
  const file = path.join(root, 'noticias', 'articulo-orden.html');
  fs.writeFileSync(file, htmlBase({ bookmark: bookmarkOrdenDistinto, sourceBox: SOURCE_BOX_MODERNO }), 'utf8');
  const meta = extractMetadataFromHtml(file, 'noticias/articulo-orden.html');
  check('id correcto pese al orden de atributos', meta.id === 'orden-distinto-id-xyz', meta.id);
}

console.log('\n=== 5. data-url interno presente -> NUNCA se usa como enlace ===');
{
  const root = tmpRootConScripts();
  const { extractMetadataFromHtml } = cargarModulo(path.join(root, 'scripts'));
  const file = path.join(root, 'noticias', 'articulo-dataurl.html');
  fs.writeFileSync(file, htmlBase({ bookmark: BOOKMARK_MODERNO, sourceBox: SOURCE_BOX_MODERNO }), 'utf8');
  const meta = extractMetadataFromHtml(file, 'noticias/articulo-dataurl.html');
  check(
    'enlace distinto de data-url interno',
    meta.enlace !== 'https://alhaurinaldia.es/noticias/articulo-de-prueba.html',
    meta.enlace
  );
  check(
    'enlace es el href real de la fuente',
    meta.enlace === 'https://fuente.example.com/articulo-original/',
    meta.enlace
  );
}

console.log('\n=== 6. página ya presente en noticias-archivo.json -> comportamiento previo intacto ===');
{
  const root = tmpRootConScripts();
  const scriptsDir = path.join(root, 'scripts');

  // Entrada YA archivada (huérfana antigua, sin id/enlace, como las 671
  // reales) -- no debe tocarse.
  const entradaExistente = {
    titulo: 'Noticia ya archivada',
    descripcion: 'Descripcion existente',
    resumen: 'Descripcion existente',
    categoria: 'Actualidad',
    fuente: 'Alhaurín al Día',
    fecha: '2026-01-01T00:00:00.000Z',
    imagen: '',
    pagina: 'noticias/ya-archivada.html',
  };
  fs.writeFileSync(path.join(root, 'data', 'noticias.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(root, 'data', 'noticias-archivo.json'), JSON.stringify([entradaExistente], null, 4), 'utf8');

  // El HTML de la ya-archivada SÍ tiene bookmark+source box en disco (como
  // pasaría con una plantilla moderna), pero como ya está en el archivo NO
  // debe reprocesarse ni ganar id/enlace retroactivamente.
  fs.writeFileSync(
    path.join(root, 'noticias', 'ya-archivada.html'),
    htmlBase({ bookmark: BOOKMARK_MODERNO, sourceBox: SOURCE_BOX_MODERNO }),
    'utf8'
  );
  // Huérfana nueva de verdad, para confirmar que SÍ se procesa normalmente
  // en la misma ejecución.
  fs.writeFileSync(
    path.join(root, 'noticias', 'huerfana-nueva.html'),
    htmlBase({ bookmark: BOOKMARK_MODERNO, sourceBox: SOURCE_BOX_MODERNO }),
    'utf8'
  );

  const { main } = cargarModulo(scriptsDir, ['node', 'archive-orphan-news.js', '--write']);
  main();

  const archivoFinal = JSON.parse(fs.readFileSync(path.join(root, 'data', 'noticias-archivo.json'), 'utf8'));
  const existente = archivoFinal.find((e) => e.pagina === 'noticias/ya-archivada.html');
  const nueva = archivoFinal.find((e) => e.pagina === 'noticias/huerfana-nueva.html');

  check('entrada ya archivada sigue presente', Boolean(existente));
  check('entrada ya archivada SIN id (no se le añadió retroactivamente)', existente && !('id' in existente), existente);
  check('entrada ya archivada SIN enlace (no se le añadió retroactivamente)', existente && !('enlace' in existente), existente);
  check('entrada ya archivada con el resto de campos intactos', existente && existente.titulo === 'Noticia ya archivada', existente);
  check('huérfana nueva sí se archivó', Boolean(nueva));
  check('huérfana nueva SÍ tiene id', nueva && nueva.id === 'https-fuente-example-com-articulo-abc123', nueva && nueva.id);
  check('huérfana nueva SÍ tiene enlace', nueva && nueva.enlace === 'https://fuente.example.com/articulo-original/', nueva && nueva.enlace);
}

console.log();
if (fallos.length) {
  console.log(`RESULTADO: ${fallos.length} fallo(s): ${JSON.stringify(fallos)}`);
  process.exit(1);
}
console.log('RESULTADO: todos los tests pasaron');
