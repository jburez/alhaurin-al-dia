// Tests de scripts/lib/redirect-stub.js contra el módulo REAL.
// Sin framework (no hay ninguno en el repo). Ejecutar con:
//   node test_redirect_stub.js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');

const {
  RedirectStubError,
  crearRedirectStub,
  resolverDestinoFinal,
  leerStubExistente,
  validarPaginaInterna,
} = require(path.join(ROOT, 'scripts', 'lib', 'redirect-stub.js'));

const fallos = [];

function check(nombre, condicion, detalle) {
  const estado = condicion ? 'OK' : 'FALLA';
  console.log(`${estado} ${nombre}${detalle !== undefined ? ' ' + JSON.stringify(detalle) : ''}`);
  if (!condicion) fallos.push(nombre);
}

function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redirect-stub-test-'));
  fs.mkdirSync(path.join(root, 'noticias'), { recursive: true });
  return root;
}

function escribir(root, paginaRelativa, contenido) {
  fs.writeFileSync(path.join(root, paginaRelativa), contenido, 'utf8');
}

function existe(root, paginaRelativa) {
  return fs.existsSync(path.join(root, paginaRelativa));
}

function leer(root, paginaRelativa) {
  return fs.readFileSync(path.join(root, paginaRelativa), 'utf8');
}

function ficherosTemp(root) {
  return fs.readdirSync(path.join(root, 'noticias')).filter((f) => f.includes('.tmp-'));
}

console.log('=== 1. crear redirect nuevo ===');
{
  const root = tmpRoot();
  escribir(root, 'noticias/destino.html', '<html>real</html>');
  const res = crearRedirectStub('noticias/origen.html', 'noticias/destino.html', { root });
  check('estado creado', res.estado === 'creado', res);
  check('fichero origen existe', existe(root, 'noticias/origen.html'));
  const contenido = leer(root, 'noticias/origen.html');
  check('contiene marcador', contenido.startsWith('<!--REDIRECT-STUB v1 destino="noticias/destino.html"-->'));
  check('contiene meta refresh 0', contenido.includes('http-equiv="refresh" content="0;'));
  check('contiene canonical', contenido.includes('rel="canonical" href="https://alhaurinaldia.es/noticias/destino.html"'));
  check('sin residuos .tmp', ficherosTemp(root).length === 0, ficherosTemp(root));
}

console.log('\n=== 2. idempotente: segunda ejecución al mismo destino -> ya-existia ===');
{
  const root = tmpRoot();
  escribir(root, 'noticias/destino.html', '<html>real</html>');
  crearRedirectStub('noticias/origen.html', 'noticias/destino.html', { root });
  const contenidoAntes = leer(root, 'noticias/origen.html');
  const res = crearRedirectStub('noticias/origen.html', 'noticias/destino.html', { root });
  check('estado ya-existia', res.estado === 'ya-existia', res);
  check('contenido sin cambios', leer(root, 'noticias/origen.html') === contenidoAntes);
}

console.log('\n=== 3. redirect existente a destino DIFERENTE -> error ===');
{
  const root = tmpRoot();
  escribir(root, 'noticias/destino-a.html', '<html>real a</html>');
  escribir(root, 'noticias/destino-b.html', '<html>real b</html>');
  crearRedirectStub('noticias/origen.html', 'noticias/destino-a.html', { root });
  const contenidoAntes = leer(root, 'noticias/origen.html');
  let error = null;
  try {
    crearRedirectStub('noticias/origen.html', 'noticias/destino-b.html', { root });
  } catch (e) {
    error = e;
  }
  check('lanza RedirectStubError', error instanceof RedirectStubError, error && error.message);
  check('origen sin modificar', leer(root, 'noticias/origen.html') === contenidoAntes);
}

console.log('\n=== 4. página real existente -> NO sobrescribe por defecto ===');
{
  const root = tmpRoot();
  escribir(root, 'noticias/destino.html', '<html>real destino</html>');
  escribir(root, 'noticias/origen.html', '<html>contenido real de origen</html>');
  let error = null;
  try {
    crearRedirectStub('noticias/origen.html', 'noticias/destino.html', { root });
  } catch (e) {
    error = e;
  }
  check('lanza RedirectStubError', error instanceof RedirectStubError, error && error.message);
  check('origen sin modificar', leer(root, 'noticias/origen.html') === '<html>contenido real de origen</html>');
}

console.log('\n=== 4b. página real existente -> SÍ sobrescribe con reemplazarContenidoExistente:true ===');
{
  const root = tmpRoot();
  escribir(root, 'noticias/destino.html', '<html>real destino</html>');
  escribir(root, 'noticias/origen.html', '<html>contenido real de origen</html>');
  const res = crearRedirectStub('noticias/origen.html', 'noticias/destino.html', {
    root,
    reemplazarContenidoExistente: true,
  });
  check('estado creado', res.estado === 'creado', res);
  check('origen ahora es un stub', leer(root, 'noticias/origen.html').startsWith('<!--REDIRECT-STUB'));
}

console.log('\n=== 5. origen === destino -> error ===');
{
  const root = tmpRoot();
  escribir(root, 'noticias/x.html', '<html>x</html>');
  let error = null;
  try {
    crearRedirectStub('noticias/x.html', 'noticias/x.html', { root });
  } catch (e) {
    error = e;
  }
  check('lanza RedirectStubError', error instanceof RedirectStubError, error && error.message);
}

console.log('\n=== 6. destino inexistente -> error, origen intacto (no se crea) ===');
{
  const root = tmpRoot();
  let error = null;
  try {
    crearRedirectStub('noticias/origen.html', 'noticias/no-existe.html', { root });
  } catch (e) {
    error = e;
  }
  check('lanza RedirectStubError', error instanceof RedirectStubError, error && error.message);
  check('origen NO se creó', !existe(root, 'noticias/origen.html'));
}

console.log('\n=== 7. cadena que termina en destino inexistente -> error, origen intacto ===');
{
  const root = tmpRoot();
  // Construimos manualmente stub-b -> destino-inexistente.html (sin pasar por
  // crearRedirectStub, que ya validaría esto) para simular una cadena vieja
  // que rotó tras borrar el destino final.
  escribir(
    root,
    'noticias/stub-b.html',
    '<!--REDIRECT-STUB v1 destino="noticias/no-existe.html"-->\n<html>stub</html>'
  );
  let error = null;
  try {
    crearRedirectStub('noticias/stub-a.html', 'noticias/stub-b.html', { root });
  } catch (e) {
    error = e;
  }
  check('lanza RedirectStubError', error instanceof RedirectStubError, error && error.message);
  check('origen (stub-a) NO se creó', !existe(root, 'noticias/stub-a.html'));
}

console.log('\n=== 8. resolución de cadena a través de varios stubs reconocidos ===');
{
  const root = tmpRoot();
  escribir(root, 'noticias/final.html', '<html>final real</html>');
  crearRedirectStub('noticias/b.html', 'noticias/final.html', { root });
  crearRedirectStub('noticias/a.html', 'noticias/b.html', { root });
  const destinoFinal = resolverDestinoFinal('noticias/a.html', { root });
  check('resuelve la cadena hasta el final real', destinoFinal === 'noticias/final.html', destinoFinal);
}

console.log('\n=== 9. detección de ciclos ===');
{
  const root = tmpRoot();
  // ciclo manual: x -> y, y -> x
  escribir(root, 'noticias/x.html', '<!--REDIRECT-STUB v1 destino="noticias/y.html"-->\n<html>x</html>');
  escribir(root, 'noticias/y.html', '<!--REDIRECT-STUB v1 destino="noticias/x.html"-->\n<html>y</html>');
  let error = null;
  try {
    resolverDestinoFinal('noticias/x.html', { root });
  } catch (e) {
    error = e;
  }
  check('lanza RedirectStubError por ciclo', error instanceof RedirectStubError, error && error.message);
}

console.log('\n=== 10. límite de profundidad ===');
{
  const root = tmpRoot();
  const N = 15;
  escribir(root, `noticias/nivel-${N}.html`, '<html>real</html>');
  for (let i = N - 1; i >= 0; i--) {
    escribir(
      root,
      `noticias/nivel-${i}.html`,
      `<!--REDIRECT-STUB v1 destino="noticias/nivel-${i + 1}.html"-->\n<html>stub ${i}</html>`
    );
  }
  let error = null;
  try {
    resolverDestinoFinal('noticias/nivel-0.html', { root });
  } catch (e) {
    error = e;
  }
  check('lanza RedirectStubError por profundidad', error instanceof RedirectStubError, error && error.message);
}

console.log('\n=== 11. validación de rutas: traversal y rutas no internas ===');
{
  const root = tmpRoot();
  let e1 = null;
  try {
    validarPaginaInterna('noticias/../../../etc/passwd.html', 'origen');
  } catch (e) {
    e1 = e;
  }
  check('rechaza traversal con ..', e1 instanceof RedirectStubError, e1 && e1.message);

  let e2 = null;
  try {
    validarPaginaInterna('/etc/passwd', 'origen');
  } catch (e) {
    e2 = e;
  }
  check('rechaza ruta absoluta fuera de noticias/', e2 instanceof RedirectStubError, e2 && e2.message);

  let e3 = null;
  try {
    validarPaginaInterna('noticias/Mayusculas.html', 'origen');
  } catch (e) {
    e3 = e;
  }
  check('rechaza mayúsculas (no cumple el patrón real)', e3 instanceof RedirectStubError, e3 && e3.message);

  let e4 = null;
  try {
    validarPaginaInterna('', 'origen');
  } catch (e) {
    e4 = e;
  }
  check('rechaza cadena vacía', e4 instanceof RedirectStubError, e4 && e4.message);
}

console.log('\n=== 12. fallo durante escritura/rename -> origen intacto, sin .tmp residual ===');
{
  const root = tmpRoot();
  escribir(root, 'noticias/destino.html', '<html>real destino</html>');
  escribir(root, 'noticias/origen.html', '<html>contenido real de origen ANTES del fallo</html>');

  const renameOriginal = fs.renameSync;
  fs.renameSync = () => {
    throw new Error('fallo simulado en renameSync');
  };

  let error = null;
  try {
    crearRedirectStub('noticias/origen.html', 'noticias/destino.html', {
      root,
      reemplazarContenidoExistente: true,
    });
  } catch (e) {
    error = e;
  } finally {
    fs.renameSync = renameOriginal;
  }

  check('propaga el error original (no lo oculta)', error !== null && error.message === 'fallo simulado en renameSync', error && error.message);
  check('origen anterior intacto', leer(root, 'noticias/origen.html') === '<html>contenido real de origen ANTES del fallo</html>');
  check('ningún .tmp residual', ficherosTemp(root).length === 0, ficherosTemp(root));
}

console.log('\n=== 13. leerStubExistente(): null si no existe, {esStub:false} si es contenido real ===');
{
  const root = tmpRoot();
  check('null si el fichero no existe', leerStubExistente(path.join(root, 'noticias/nada.html')) === null);
  escribir(root, 'noticias/real.html', '<html>real</html>');
  const r = leerStubExistente(path.join(root, 'noticias/real.html'));
  check('esStub:false para contenido real', r && r.esStub === false, r);
}

console.log('\n=== 14. no modifica ningún fichero ajeno al escenario ===');
{
  const root = tmpRoot();
  escribir(root, 'noticias/destino.html', '<html>real destino</html>');
  escribir(root, 'noticias/otra.html', '<html>otra noticia sin relación</html>');
  crearRedirectStub('noticias/origen.html', 'noticias/destino.html', { root });
  check('otra.html sin cambios', leer(root, 'noticias/otra.html') === '<html>otra noticia sin relación</html>');
  check('destino.html sin cambios', leer(root, 'noticias/destino.html') === '<html>real destino</html>');
}

console.log();
if (fallos.length) {
  console.log(`RESULTADO: ${fallos.length} fallo(s): ${JSON.stringify(fallos)}`);
  process.exit(1);
}
console.log('RESULTADO: todos los tests pasaron');
