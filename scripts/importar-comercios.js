// Importa comercios desde un CSV (exportado de una hoja de cálculo) a
// data/comercios.json, validando los campos.
//
// Columnas: nombre, categoria, descripcion, direccion, zona, telefono, web,
// redes, horario. «redes»: pares «Nombre URL» separados por «|».
// «categoria» debe ser el slug o el nombre de una categoría de comercios.json.
//
// Uso:
//   npm run comercios:importar -- ruta/al/fichero.csv [--escribir] [--reemplazar]
//
// Sin --escribir solo valida y muestra el resultado. Con --escribir añade o
// actualiza (por slug) los comercios en data/comercios.json, conservando
// destacado y patrocinado_hasta de los que ya existían. --reemplazar sustituye
// la lista entera por la del CSV.

const fs = require('fs');
const path = require('path');
const { slugify } = require('./lib/layout');

const ROOT = path.resolve(__dirname, '..');
const COMERCIOS_FILE = path.join(ROOT, 'data', 'comercios.json');
const COLUMNS = ['nombre', 'categoria', 'descripcion', 'direccion', 'zona', 'telefono', 'web', 'redes', 'horario'];

// CSV con comillas, comas y saltos de línea dentro de campos (RFC 4180).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  const sep = (src.split('\n')[0].match(/;/g) || []).length > (src.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function parseRedes(value = '') {
  return value.split('|').map((part) => part.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^(.*?)\s*(https?:\/\/\S+)$/);
    return m ? { nombre: m[1].trim() || 'Redes', url: m[2] } : null;
  }).filter(Boolean);
}

function validate(rec, categorias, line) {
  const errors = [];
  const warnings = [];
  if (!rec.nombre) errors.push('falta el nombre');
  if (/ejemplo/i.test(rec.nombre)) errors.push('es la fila de ejemplo de la plantilla');
  const cat = categorias.find((c) => c.slug === rec.categoria || c.nombre.toLowerCase() === String(rec.categoria).toLowerCase());
  if (!cat) errors.push(`categoría desconocida «${rec.categoria}» (válidas: ${categorias.map((c) => c.slug).join(', ')})`);
  if (rec.web && !/^https?:\/\//.test(rec.web)) errors.push(`web no válida «${rec.web}» (debe empezar por http:// o https://)`);
  if (rec.telefono && !/^\+?[\d\s().-]{9,}$/.test(rec.telefono)) errors.push(`teléfono no válido «${rec.telefono}»`);
  if (rec.redes && !parseRedes(rec.redes).length) errors.push('redes en formato incorrecto (usa «Nombre URL | Nombre URL»)');
  if (!rec.descripcion) warnings.push('sin descripción: no tendrá ficha propia');
  else if (rec.descripcion.length < 60) warnings.push('descripción muy corta');
  if (!rec.direccion && !rec.horario) warnings.push('sin dirección ni horario: no tendrá ficha propia');
  return { errors: errors.map((e) => `fila ${line}: ${e}`), warnings: warnings.map((w) => `fila ${line}: ${w}`), cat };
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const write = args.includes('--escribir');
  const replace = args.includes('--reemplazar');
  if (!file) {
    console.error('Uso: npm run comercios:importar -- ruta/al/fichero.csv [--escribir] [--reemplazar]');
    process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(COMERCIOS_FILE, 'utf8'));
  const categorias = data.categorias || [];
  const rows = parseCsv(fs.readFileSync(path.resolve(file), 'utf8'));
  const header = rows.shift().map((h) => slugify(h).replace(/-/g, '_'));
  const missing = COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    console.error(`Faltan columnas en el CSV: ${missing.join(', ')}`);
    process.exit(1);
  }

  const imported = [];
  const errors = [];
  const warnings = [];
  const slugs = new Set();
  rows.forEach((cells, i) => {
    const rec = Object.fromEntries(header.map((h, j) => [h, String(cells[j] || '').trim()]));
    const v = validate(rec, categorias, i + 2);
    errors.push(...v.errors);
    warnings.push(...v.warnings);
    if (v.errors.length) return;
    const slug = slugify(rec.nombre);
    if (slugs.has(slug)) { errors.push(`fila ${i + 2}: nombre duplicado (${rec.nombre})`); return; }
    slugs.add(slug);
    imported.push({
      slug,
      nombre: rec.nombre,
      categoria: v.cat.slug,
      descripcion: rec.descripcion,
      direccion: rec.direccion,
      zona: rec.zona,
      telefono: rec.telefono,
      web: rec.web,
      redes: parseRedes(rec.redes),
      horario: rec.horario,
      destacado: false,
      patrocinado_hasta: null,
    });
  });

  for (const w of warnings) console.log(`⚠️  ${w}`);
  for (const e of errors) console.log(`❌ ${e}`);
  console.log(`Filas válidas: ${imported.length} de ${rows.length}.`);
  if (errors.length) {
    console.log('Corrige los errores antes de importar. No se ha escrito nada.');
    process.exit(1);
  }
  if (!write) {
    console.log('Validación correcta. Ejecuta de nuevo con --escribir para guardar en data/comercios.json.');
    return;
  }
  const previous = new Map((data.comercios || []).map((c) => [c.slug, c]));
  const merged = replace ? new Map() : new Map(previous);
  for (const c of imported) {
    const old = previous.get(c.slug) || {};
    merged.set(c.slug, { ...c, destacado: old.destacado === true, patrocinado_hasta: old.patrocinado_hasta || null });
  }
  data.comercios = [...merged.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  fs.writeFileSync(COMERCIOS_FILE, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`data/comercios.json actualizado: ${data.comercios.length} comercios.`);
}

if (require.main === module) main();

module.exports = { parseCsv, parseRedes, validate };
