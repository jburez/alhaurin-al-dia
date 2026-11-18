// Sincroniza las piezas comunes en TODO el HTML publicado, incluidas las
// páginas históricas que ya no se regeneran (archivo de noticias, páginas
// hechas a mano…):
//
//   1. la navegación principal  (scripts/lib/nav.js + data/nav.json)
//   2. el pie con los enlaces legales y «Configurar cookies» (scripts/lib/footer.js)
//   3. el bloque de consentimiento del <head> (scripts/lib/layout.js)
//   4. retira la carga directa de adsbygoogle.js: los anuncios solo los carga
//      js/consent.js cuando hay consentimiento (CMP TCF).
//
// Idempotente; se ejecuta en cada build antes de assets:version.
//
// Uso: node scripts/sync-site-chrome.js [--check]

const fs = require('fs');
const path = require('path');
const { renderNav } = require('./lib/nav');
const { SITE_FOOTER_HTML } = require('./lib/footer');
const { CONSENT_HEAD_HTML } = require('./lib/layout');

const ROOT = path.resolve(__dirname, '..');
const CHECK = process.argv.includes('--check');
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'assets', 'tmp', 'reports', 'cloudflare']);

const NAV_RE = /<nav aria-label="Navegación principal">[\s\S]*?<\/nav>/;
const FOOTER_RE = /<footer class="site-footer">[\s\S]*?<\/footer>/;
const CONSENT_RE = /<!-- alh-consent:start -->[\s\S]*?<!-- alh-consent:end -->/;
const ADSENSE_RE = /[ \t]*<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^"]*"[^>]*><\/script>\n?/g;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(path.join(dir, entry.name), files);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(path.join(dir, entry.name));
    }
  }
  return files;
}

// assets:version añade ?v=hash a /js/consent.js: se ignora al comparar.
const stripVersion = (s) => s.replace(/\?v=[A-Za-z0-9]+/g, '');

function sync(html) {
  if (/http-equiv="refresh"/i.test(html)) return html; // stubs de redirección
  let out = html;
  const nav = renderNav();
  const navMatch = out.match(NAV_RE);
  if (navMatch && navMatch[0] !== nav) out = out.replace(NAV_RE, nav);
  const footerMatch = out.match(FOOTER_RE);
  if (footerMatch && footerMatch[0] !== SITE_FOOTER_HTML) out = out.replace(FOOTER_RE, SITE_FOOTER_HTML);
  out = out.replace(ADSENSE_RE, '');
  const consentMatch = out.match(CONSENT_RE);
  if (consentMatch) {
    if (stripVersion(consentMatch[0]) !== CONSENT_HEAD_HTML) out = out.replace(CONSENT_RE, CONSENT_HEAD_HTML);
  } else if (out.includes('</head>')) {
    out = out.replace('</head>', `    ${CONSENT_HEAD_HTML}\n</head>`);
  }
  return out;
}

function main() {
  const counts = { files: 0, changed: 0 };
  for (const file of walk(ROOT)) {
    counts.files++;
    const html = fs.readFileSync(file, 'utf8');
    const next = sync(html);
    if (next !== html) {
      counts.changed++;
      if (!CHECK) fs.writeFileSync(file, next);
    }
  }
  console.log(`Piezas comunes (nav, pie, consentimiento): ${counts.changed} de ${counts.files} HTML ${CHECK ? 'por actualizar (--check)' : 'actualizados'}.`);
  if (CHECK && counts.changed) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { sync };
