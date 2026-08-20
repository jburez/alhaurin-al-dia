// One-off: sincroniza el bloque <nav aria-label="Navegación principal">...</nav>
// en TODO el HTML ya publicado (páginas hechas a mano + páginas históricas ya
// generadas y congeladas: archivo de noticias, eventos) con la salida actual
// de scripts/lib/nav.js, ahora que data/nav.json es la única fuente de verdad.
// Los 7 generadores ya importan renderNav()/render_nav() para las páginas
// futuras; este script alinea las que ya existen en disco.
//
// Uso: node scripts/sync-nav-2026-08.js [--write]
// Sin --write hace dry-run (solo cuenta cuántos ficheros cambiarían).

const fs = require('fs');
const path = require('path');
const { renderNav } = require('./lib/nav');

const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'assets', 'tmp', 'reports']);

const NAV_RE = /<nav aria-label="Navegación principal">[\s\S]*?<\/nav>/;
const canonicalNav = renderNav();

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) files.push(path.join(dir, entry.name));
  }
  return files;
}

let changed = 0;
let skippedNoMatch = 0;
let skippedAlreadyOk = 0;

for (const file of walk(ROOT)) {
  const html = fs.readFileSync(file, 'utf8');
  const match = html.match(NAV_RE);
  if (!match) {
    skippedNoMatch++;
    continue;
  }
  if (match[0] === canonicalNav) {
    skippedAlreadyOk++;
    continue;
  }
  changed++;
  if (WRITE) {
    fs.writeFileSync(file, html.replace(NAV_RE, canonicalNav));
  }
}

console.log(`Ficheros con nav a actualizar: ${changed}`);
console.log(`Ficheros ya con el nav canónico: ${skippedAlreadyOk}`);
console.log(`Ficheros sin bloque <nav principal> (stubs de redirección, etc.): ${skippedNoMatch}`);
console.log(WRITE ? 'Escrito.' : 'Dry-run (usa --write para aplicar).');
