const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NEWS_FILE = path.join(ROOT, 'data', 'noticias.json');
const RSS_OUTPUT_FILE = path.join(ROOT, 'feed-news.xml');
const BASE_URL = 'https://alhaurinaldia.es';

function escapeXML(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDateRFC822(dateStr) {
  const date = dateStr ? new Date(dateStr) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toUTCString() : date.toUTCString();
}

function generateNewsRSS() {
  let noticias = [];
  try {
    noticias = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8')) || [];
  } catch (err) {
    console.error('Error leyendo noticias.json para RSS:', err);
    return;
  }

  // Tomar las 30 noticias más recientes
  const recientes = noticias.slice(0, 30);

  const itemsXML = recientes.map(item => {
    const itemUrl = item.url ? (item.url.startsWith('http') ? item.url : `${BASE_URL}/${item.url.replace(/^\/+/, '')}`) : BASE_URL;
    const pubDate = formatDateRFC822(item.fecha);
    const title = escapeXML(item.titulo || 'Noticia de Alhaurín el Grande');
    const description = escapeXML(item.resumen || item.subtitulo || item.titulo || '');
    const category = escapeXML(item.categoria || 'Noticias');
    const source = escapeXML(item.fuente || 'Alhaurín al Día');

    return `    <item>
      <title>${title}</title>
      <link>${escapeXML(itemUrl)}</link>
      <guid isPermaLink="true">${escapeXML(itemUrl)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${description}</description>
      <category>${category}</category>
      <dc:creator>${source}</dc:creator>
    </item>`;
  }).join('\n');

  const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Alhaurín al Día — Noticias de Alhaurín el Grande</title>
    <link>${BASE_URL}/</link>
    <atom:link href="${BASE_URL}/feed-news.xml" rel="self" type="application/rss+xml" />
    <description>Actualidad local, avisos, cultura, deportes y noticias de Alhaurín el Grande (Málaga).</description>
    <language>es-ES</language>
    <copyright>© ${new Date().getFullYear()} Alhaurín al Día</copyright>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <generator>Antigravity RSS Generator</generator>
${itemsXML}
  </channel>
</rss>`;

  fs.writeFileSync(RSS_OUTPUT_FILE, rssContent, 'utf8');
  console.log(`[RSS] Feed de noticias generado con éxito: ${recientes.length} noticias en ${RSS_OUTPUT_FILE}`);
}

generateNewsRSS();
