const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NEWS_DIR = path.join(ROOT, 'noticias');

function listNewsFiles() {
  if (!fs.existsSync(NEWS_DIR)) return [];
  return fs.readdirSync(NEWS_DIR)
    .filter(file => file.endsWith('.html') && file !== 'index.html')
    .map(file => path.join(NEWS_DIR, file));
}

function has(html, pattern) {
  return pattern.test(html);
}

function auditFile(file) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const checks = [
    ['canonical', /<link\s+rel=["']canonical["']/i],
    ['og:title', /property=["']og:title["']/i],
    ['og:description', /property=["']og:description["']/i],
    ['og:image', /property=["']og:image["']/i],
    ['NewsArticle', /"@type"\s*:\s*"NewsArticle"/i],
    ['datePublished', /"datePublished"\s*:/i],
    ['dateModified', /"dateModified"\s*:/i],
    ['publisher', /"publisher"\s*:/i],
    ['author', /"author"\s*:/i],
    ['BreadcrumbList', /"@type"\s*:\s*"BreadcrumbList"/i]
  ];
  const missing = checks.filter(([, pattern]) => !has(html, pattern)).map(([name]) => name);
  return { file: rel, missing };
}

const results = listNewsFiles().map(auditFile);
const failing = results.filter(result => result.missing.length > 0);

if (failing.length === 0) {
  console.log(`OK: ${results.length} noticias auditadas con SEO estructurado completo.`);
  process.exit(0);
}

console.log(`Aviso: ${failing.length} de ${results.length} noticias tienen campos SEO pendientes.`);
for (const result of failing) {
  console.log(`- ${result.file}: falta ${result.missing.join(', ')}`);
}

process.exitCode = 1;
