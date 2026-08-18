// Migración one-off (2026-08-18): inserta el script de Cloudflare Web
// Analytics (scripts/lib/analytics.js) en TODAS las páginas HTML ya
// publicadas — tanto las generadas por script (noticias, eventos, guía
// útil...) como las mantenidas a mano (home, avisos, comercios, contacto...),
// ninguna de las cuales lo tenía todavía. El "Automatic setup" de Cloudflare
// llevaba 3 meses activado sin inyectar nada de verdad (comprobado en
// producción: 0 visitas registradas, script ausente del HTML servido), así
// que se instala a mano en vez de depender de él.
//
// A partir de ahora, los generadores (generar_noticias.py,
// generar_paginas_eventos.py, render-guide-pages.js, render-tiempo-static.js)
// ya incluyen el snippet en las páginas nuevas — esta migración solo cubre
// el HTML que ya existía en disco antes de ese cambio.
//
// Uso: node scripts/migrate-analytics-2026-08.js [--write]
// Sin --write hace dry-run: solo cuenta e informa, no toca disco.

const fs = require('fs');
const path = require('path');
const { CF_ANALYTICS_SNIPPET } = require('./lib/analytics');

const ROOT = path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');

const SKIP_DIRS = new Set(['.git', 'node_modules', 'scripts']);
const MARKER = 'static.cloudflareinsights.com';

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
  let noHead = 0;
  const noHeadFiles = [];

  for (const file of files) {
    const html = fs.readFileSync(file, 'utf8');
    if (html.includes(MARKER)) {
      alreadyOk++;
      continue;
    }
    if (!html.includes('</head>')) {
      noHead++;
      noHeadFiles.push(path.relative(ROOT, file));
      continue;
    }
    const updated = html.replace('</head>', `    ${CF_ANALYTICS_SNIPPET}\n</head>`);
    changed++;
    if (WRITE) {
      fs.writeFileSync(file, updated, 'utf8');
    }
  }

  console.log(`Ficheros HTML totales: ${files.length}`);
  console.log(`Ya tenían el script: ${alreadyOk}`);
  console.log(`${WRITE ? 'Actualizados' : 'Se actualizarían'}: ${changed}`);
  console.log(`Sin </head> (omitidos, revisar si es intencional): ${noHead}`);
  if (noHeadFiles.length) {
    console.log(noHeadFiles.map((f) => `  - ${f}`).join('\n'));
  }
  if (!WRITE) {
    console.log('\nDry-run. Ejecuta con --write para aplicar los cambios.');
  }
}

main();
