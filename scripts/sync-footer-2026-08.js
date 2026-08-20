// One-off: sincroniza el bloque <footer class="site-footer">...</footer> ya
// publicado con el contenido actual de scripts/lib/footer.js, tras renombrar
// "Seguimiento" a "En directo" en ese footer compartido. Mismo patrón que
// scripts/sync-nav-2026-08.js.
//
// Uso: node scripts/sync-footer-2026-08.js [--write]

const fs = require('fs');
const path = require('path');
const { SITE_FOOTER_HTML } = require('./lib/footer');

const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'assets', 'tmp', 'reports']);

const FOOTER_RE = /<footer class="site-footer">[\s\S]*?<\/footer>/;

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
  const match = html.match(FOOTER_RE);
  if (!match) {
    skippedNoMatch++;
    continue;
  }
  if (match[0] === SITE_FOOTER_HTML) {
    skippedAlreadyOk++;
    continue;
  }
  changed++;
  if (WRITE) {
    fs.writeFileSync(file, html.replace(FOOTER_RE, SITE_FOOTER_HTML));
  }
}

console.log(`Ficheros con footer a actualizar: ${changed}`);
console.log(`Ficheros ya con el footer canónico: ${skippedAlreadyOk}`);
console.log(`Ficheros sin bloque <footer class="site-footer"> (stubs de redirección, etc.): ${skippedNoMatch}`);
console.log(WRITE ? 'Escrito.' : 'Dry-run (usa --write para aplicar).');
