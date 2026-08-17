// Migración one-off (2026-08-14): sustituye el <footer>...</footer> de TODAS las
// páginas HTML existentes por el footer único compartido (scripts/lib/footer.js),
// el mismo que ya usa la home. Ver docs/AUDITORIA-2026-08-TECNICA-DISENO.md §3.1.
//
// Uso: node scripts/migrate-footer-2026-08.js [--write]
// Sin --write hace dry-run: solo cuenta e informa, no toca disco.

const fs = require('fs');
const path = require('path');
const { SITE_FOOTER_HTML } = require('./lib/footer');

const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts']);

const FOOTER_RE = /<footer[^>]*>[\s\S]*?<\/footer>/;

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function main() {
  const files = walk(ROOT, []);
  let changed = 0;
  let alreadyOk = 0;
  let noFooter = 0;
  const noFooterFiles = [];

  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    if (!FOOTER_RE.test(html)) {
      noFooter++;
      noFooterFiles.push(path.relative(ROOT, file));
      continue;
    }
    if (html.includes('class="site-footer"')) {
      alreadyOk++;
      continue;
    }
    const updated = html.replace(FOOTER_RE, SITE_FOOTER_HTML);
    changed++;
    if (WRITE) {
      fs.writeFileSync(file, updated, 'utf8');
    }
  }

  console.log(`Ficheros HTML totales: ${files.length}`);
  console.log(`Ya tenían el footer correcto: ${alreadyOk}`);
  console.log(`${WRITE ? 'Actualizados' : 'Se actualizarían'}: ${changed}`);
  console.log(`Sin <footer> (omitidos, revisar si es intencional): ${noFooter}`);
  if (noFooterFiles.length) {
    console.log(noFooterFiles.map((f) => `  - ${f}`).join('\n'));
  }
  if (!WRITE) {
    console.log('\nDry-run. Ejecuta con --write para aplicar los cambios.');
  }
}

main();
