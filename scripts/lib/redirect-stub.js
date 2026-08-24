// Redirect-stub reutilizable (Fase 2, task #18). Extraído del patrón ya
// probado en producción (scripts/merge-duplicate-archive-2026-08.js,
// mismo patrón que /planes/calendario/index.html): meta refresh
// instantáneo + <link rel="canonical">, sin noindex (Google recomienda no
// combinar canonical con noindex; el canonical solo ya consolida las
// señales SEO en la página buena).
//
// El helper SOLO ejecuta de forma segura una decisión ya tomada por otro
// componente -- nunca decide POR SÍ MISMO si una página merece
// sustituirse. Por eso reemplazarContenidoExistente es false por defecto
// (fail-closed: contenido real existente nunca se sobrescribe sin
// autorización explícita del caller) y por eso archive-orphan-news.js
// (task #18) NO usa esa opción todavía -- solo queda disponible para un
// futuro flujo que ya haya decidido explícitamente loser -> canonical.
//
// Escritura atómica a nivel de fichero: genera el HTML completo en
// memoria, escribe a un temporal en el MISMO directorio, fsync + cierre,
// y rename sobre el destino -- nunca abre/trunca el fichero origen
// directamente. Si cualquier paso falla, el temporal se limpia
// best-effort sin ocultar el error original, y el fichero origen queda
// intacto (mismo patrón que el lado Python,
// scripts/lib/editorial_registry.py:guardar_registro(), temp file +
// os.replace).
//
// Detección de "¿esto ya es un redirect stub?" por MARCADOR EXPLÍCITO
// (primera línea del fichero, comentario HTML reconocible), nunca por
// heurística de contenido -- evita falsos positivos/negativos al
// clasificar una página como "segura de sobrescribir" o no.
//
// El destino final de cualquier cadena de redirects DEBE existir de
// verdad en disco -- nunca se genera una URL histórica que redirige a un
// 404: eso sería reintroducir exactamente el problema que este módulo
// existe para resolver.

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE_URL = 'https://alhaurinaldia.es';

const MARCADOR_REGEX = /^<!--REDIRECT-STUB v1 destino="([^"]+)"-->/;
const PAGINA_INTERNA_REGEX = /^noticias\/[a-z0-9]+(?:-[a-z0-9]+)*\.html$/;
const PROFUNDIDAD_MAXIMA_CADENA = 10;

class RedirectStubError extends Error {}

function validarPaginaInterna(valor, etiqueta) {
  if (!valor || typeof valor !== 'string') {
    throw new RedirectStubError(`${etiqueta} vacío o no es una cadena: ${JSON.stringify(valor)}`);
  }
  if (valor.includes('..')) {
    throw new RedirectStubError(`${etiqueta} contiene '..' -- no puede escapar de noticias/: ${valor}`);
  }
  if (!PAGINA_INTERNA_REGEX.test(valor)) {
    throw new RedirectStubError(
      `${etiqueta} no es una ruta interna válida dentro de noticias/ (se esperaba noticias/<slug>.html): ${valor}`
    );
  }
  return valor;
}

function rutaAbsoluta(paginaRelativa, root) {
  return path.join(root, paginaRelativa);
}

function leerStubExistente(rutaAbs) {
  if (!fs.existsSync(rutaAbs)) return null;
  const contenido = fs.readFileSync(rutaAbs, 'utf8');
  const match = contenido.match(MARCADOR_REGEX);
  if (!match) return { esStub: false };
  return { esStub: true, destino: match[1] };
}

// Solo sigue la cadena a través de páginas YA reconocidas como stub por su
// marcador explícito -- nunca "adivina" que una página real es un
// redirect. Guarda anti-ciclo + límite defensivo de profundidad. El
// destino final (el primer eslabón que NO es un stub reconocido) debe
// existir de verdad en disco -- si no, la cadena entera falla antes de
// que crearRedirectStub() toque origen.
function resolverDestinoFinal(paginaRelativa, opciones = {}) {
  const { root = ROOT, visitados = new Set() } = opciones;
  validarPaginaInterna(paginaRelativa, 'destino');

  if (visitados.has(paginaRelativa)) {
    throw new RedirectStubError(
      `Ciclo de redirects detectado en ${paginaRelativa} (cadena: ${[...visitados, paginaRelativa].join(' -> ')})`
    );
  }
  if (visitados.size >= PROFUNDIDAD_MAXIMA_CADENA) {
    throw new RedirectStubError(
      `Cadena de redirects supera la profundidad máxima (${PROFUNDIDAD_MAXIMA_CADENA}) resolviendo ${paginaRelativa}`
    );
  }

  const siguientesVisitados = new Set(visitados);
  siguientesVisitados.add(paginaRelativa);

  const rutaAbs = rutaAbsoluta(paginaRelativa, root);
  const stub = leerStubExistente(rutaAbs);
  if (stub && stub.esStub) {
    return resolverDestinoFinal(stub.destino, { root, visitados: siguientesVisitados });
  }

  // Este es el destino final de la cadena (no es un stub reconocido, o
  // directamente no existe -- leerStubExistente() ya devuelve null en ese
  // caso). Debe existir de verdad: una cadena que termine en un fichero
  // inexistente convertiría una URL histórica en un 404 al resolverla.
  if (!fs.existsSync(rutaAbs)) {
    throw new RedirectStubError(`El destino final no existe en disco: ${paginaRelativa}`);
  }

  return paginaRelativa;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generarHtmlStub(destinoRelativo) {
  const canonicalUrl = `${SITE_URL}/${destinoRelativo}`;
  return `<!--REDIRECT-STUB v1 destino="${escapeHtml(destinoRelativo)}"-->
<!doctype html>
<html lang="es">
<head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=${escapeHtml(canonicalUrl)}">
    <link rel="canonical" href="${escapeHtml(canonicalUrl)}">
    <title>Redirigiendo...</title>
</head>
<body>
    <p>Esta página se ha fusionado con una cobertura más completa. <a href="${escapeHtml(canonicalUrl)}">Ir a la noticia</a></p>
</body>
</html>
`;
}

// Escritura atómica: nunca abre/trunca rutaAbs directamente. Escribe a un
// temporal en el MISMO directorio (mismo filesystem, para que el rename
// sea atómico), fsync + cierre, y sustituye de una vez. Si CUALQUIER paso
// falla (open/write/fsync/rename), el temporal se limpia best-effort
// (nunca oculta el error original si la propia limpieza falla) y se
// relanza el error tal cual -- el fichero origen nunca queda a medias.
function escribirAtomico(rutaAbs, contenido) {
  const dir = path.dirname(rutaAbs);
  const rutaTemporal = path.join(dir, `.${path.basename(rutaAbs)}.tmp-${process.pid}-${Date.now()}`);
  let fd;
  try {
    fd = fs.openSync(rutaTemporal, 'w');
    fs.writeSync(fd, contenido, null, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    fs.renameSync(rutaTemporal, rutaAbs);
  } catch (err) {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch (_cerrarErr) {
        // no ocultar el error original
      }
    }
    try {
      if (fs.existsSync(rutaTemporal)) fs.unlinkSync(rutaTemporal);
    } catch (_limpiezaErr) {
      // no ocultar el error original
    }
    throw err;
  }
}

/**
 * crearRedirectStub(origen, destino, opciones)
 *
 * opciones.reemplazarContenidoExistente (default false): el helper NUNCA
 * decide si una página merece sustituirse -- solo ejecuta de forma segura
 * una decisión ya tomada por otro componente. Con el valor por defecto,
 * contenido real existente en `origen` es SIEMPRE fail-closed. Solo un
 * caller que ya resolvió explícitamente una relación loser->canonical
 * (fuera de esta task) debe pasar true.
 *
 * opciones.root: raíz del repo, inyectable para tests (por defecto la
 * raíz real).
 *
 * Devuelve { estado: 'creado' | 'ya-existia' }. Lanza RedirectStubError
 * en cualquier caso ambiguo o inseguro (fail-closed) -- incluido un
 * destino final que no existe en disco.
 */
function crearRedirectStub(origen, destino, opciones = {}) {
  const { reemplazarContenidoExistente = false, root = ROOT } = opciones;

  validarPaginaInterna(origen, 'origen');
  validarPaginaInterna(destino, 'destino');

  if (origen === destino) {
    throw new RedirectStubError(`origen y destino son iguales: ${origen}`);
  }

  // Resolver cadena de destino ANTES de tocar disco -- solo sigue stubs
  // reconocidos por marcador, nunca crea redirect->redirect, y exige que
  // el destino final exista de verdad.
  const destinoFinal = resolverDestinoFinal(destino, { root });
  if (destinoFinal === origen) {
    throw new RedirectStubError(
      `El destino, tras resolver la cadena de redirects, apunta de vuelta a origen: `
      + `${origen} -> ... -> ${destinoFinal}`
    );
  }

  const origenAbs = rutaAbsoluta(origen, root);
  const existente = leerStubExistente(origenAbs);

  if (existente) {
    if (existente.esStub) {
      const destinoExistenteFinal = resolverDestinoFinal(existente.destino, { root });
      if (destinoExistenteFinal === destinoFinal) {
        return { estado: 'ya-existia' };
      }
      throw new RedirectStubError(
        `${origen} ya es un redirect stub hacia ${existente.destino} (resuelto: ${destinoExistenteFinal}), `
        + `distinto del destino solicitado ${destino} (resuelto: ${destinoFinal})`
      );
    }
    if (!reemplazarContenidoExistente) {
      throw new RedirectStubError(
        `${origen} contiene contenido real (no reconocido como redirect stub) -- no se sobrescribe sin `
        + `reemplazarContenidoExistente:true explícito`
      );
    }
    // reemplazarContenidoExistente===true: el caller ya decidió
    // explícitamente sustituir esta página real. Continúa.
  }

  escribirAtomico(origenAbs, generarHtmlStub(destinoFinal));
  return { estado: 'creado' };
}

module.exports = {
  ROOT,
  RedirectStubError,
  crearRedirectStub,
  resolverDestinoFinal,
  leerStubExistente,
  validarPaginaInterna,
};
