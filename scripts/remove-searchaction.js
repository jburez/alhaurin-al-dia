const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'scripts', 'assets']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
  return files;
}

function removeSearchActionFromJsonLd(html) {
  return html.replace(
    /<script\s+type=["']application\/ld\+json["']>\s*\{[\s\S]*?"@type"\s*:\s*"WebSite"[\s\S]*?"SearchAction"[\s\S]*?\}\s*<\/script>\s*/gi,
    ''
  );
}

let updated = 0;

for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, 'utf8');
  const cleaned = removeSearchActionFromJsonLd(original);
  if (cleaned !== original) {
    fs.writeFileSync(file, cleaned);
    updated += 1;
  }
}

console.log(`SearchAction eliminado de ${updated} archivos HTML`);
