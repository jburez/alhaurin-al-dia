#!/usr/bin/env node
// Añade ?v=<hash> a las referencias locales de CSS y JS en todos los HTML.
//
// Hasta noviembre de 2026, _headers servía CSS y JS con
// "max-age=31536000, immutable" sin versión en la URL: quien ya había visitado
// la web no recibía cambios de diseño ni de JavaScript durante un año. Cambiar
// la URL con el hash del contenido obliga al navegador a descargar la versión
// nueva cuando el fichero cambia, y deja la misma URL (cacheable) cuando no.
//
// Idempotente: si el hash no ha cambiado, el HTML no se reescribe.
// Uso: node scripts/version-assets.js [--check]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'tmp', 'reports', 'tests', 'cloudflare', 'docs']);
const CHECK = process.argv.includes('--check');
const REF = /((?:href|src)=["'])((?:\.{1,2}\/)*\/?(css|js)\/([A-Za-z0-9_.-]+\.(?:css|js)))(?:\?v=[A-Za-z0-9]+)?(["'])/g;

const hashes = new Map();
function hashFor(dir, name) {
  const key = `${dir}/${name}`;
  if (!hashes.has(key)) {
    const file = path.join(ROOT, dir, name);
    hashes.set(key, fs.existsSync(file)
      ? crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex').slice(0, 8)
      : null);
  }
  return hashes.get(key);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (entry.name.endsWith('.html')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

let changed = 0;
let missing = new Set();
for (const file of walk(ROOT)) {
  const html = fs.readFileSync(file, 'utf8');
  const next = html.replace(REF, (all, pre, ref, dir, name, quote) => {
    const hash = hashFor(dir, name);
    if (!hash) { missing.add(`${dir}/${name}`); return all; }
    return `${pre}${ref}?v=${hash}${quote}`;
  });
  if (next !== html) {
    changed++;
    if (!CHECK) fs.writeFileSync(file, next);
  }
}

if (missing.size) console.warn(`Referencias a ficheros inexistentes: ${[...missing].join(', ')}`);
console.log(`${CHECK ? 'Pendientes de versionar' : 'HTML versionados'}: ${changed}`);
if (CHECK && changed) process.exit(1);
