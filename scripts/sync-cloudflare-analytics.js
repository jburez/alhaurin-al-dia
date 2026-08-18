// Trae un resumen de Cloudflare Web Analytics (visitas y páginas vistas de
// las últimas 24h, top 5 páginas de los últimos 7 días) y lo escribe en
// data/analytics-resumen.json, para que el dashboard del panel admin
// (js/admin-panel.js) lo muestre con un fetch normal, sin exponer ningún
// token de Cloudflare en el navegador.
//
// El token vive en CLOUDFLARE_ANALYTICS_TOKEN (GitHub Secret, permiso
// Account > Account Analytics > Read). Si falta o la API falla, el script
// aborta con exit code != 0 sin tocar el JSON — mejor un job en rojo que
// sobrescribir en silencio con datos vacíos o desactualizados (mismo
// criterio que scripts/sync-admin-firestore.js).
//
// Es un producto distinto de la Zone Analytics normal (HTTP requests/caché)
// que ya usa CLOUDFLARE_API_TOKEN en publicar-produccion.yml para purgar
// caché — ese token no sirve aquí, hace falta uno nuevo con permiso de
// cuenta, no de zona.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(ROOT, 'data', 'analytics-resumen.json');
const API_BASE = 'https://api.cloudflare.com/client/v4';
const SITE_HOST = 'alhaurinaldia.es';
// Mismo valor que el token del beacon en scripts/lib/analytics.js — no es
// secreto (va embebido en el HTML público de las 858 páginas del sitio).
// Se usa para identificar el site de Web Analytics de forma inequívoca: el
// campo `host` que devuelve rum/site_info/list no hizo match exacto con
// SITE_HOST en la práctica (posible normalización distinta por parte de la
// API), mientras que site_token es un identificador único sin ambigüedad.
const SITE_TOKEN = 'dc9eeda336f943ca87175a3b83faee35';

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

async function cfFetch(token, url, options = {}) {
  const resp = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await resp.json();
  if (!resp.ok || data.success === false) {
    throw new Error(`Cloudflare API error (${resp.status}): ${JSON.stringify(data.errors || data)}`);
  }
  return data;
}

async function resolveAccountId(token) {
  const data = await cfFetch(token, `${API_BASE}/accounts`);
  if (!data.result || !data.result.length) {
    throw new Error('El token no tiene acceso a ninguna cuenta de Cloudflare.');
  }
  if (data.result.length > 1) {
    console.log(`[sync-cloudflare-analytics] Aviso: el token ve ${data.result.length} cuentas, usando la primera: ${JSON.stringify(data.result.map((a) => ({ id: a.id, name: a.name })))}`);
  }
  return data.result[0].id;
}

async function resolveSiteTag(token, accountId) {
  const data = await cfFetch(token, `${API_BASE}/accounts/${accountId}/rum/site_info/list`);
  const sites = data.result || [];
  const site = sites.find((s) => s.site_token === SITE_TOKEN) || sites.find((s) => s.host === SITE_HOST);
  if (!site) {
    throw new Error(
      `No se encontró ningún site de Web Analytics para ${SITE_HOST} (ni por site_token ni por host). `
      + `Sites disponibles en esta cuenta: ${JSON.stringify(sites.map((s) => ({ host: s.host, site_tag: s.site_tag, site_token: s.site_token })))}`
    );
  }
  return site.site_tag;
}

async function graphql(token, query) {
  const data = await cfFetch(token, `${API_BASE}/graphql`, {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  if (data.errors && data.errors.length) {
    throw new Error(`GraphQL error: ${JSON.stringify(data.errors)}`);
  }
  return data.data;
}

function isoHace(horas) {
  return new Date(Date.now() - horas * 3600 * 1000).toISOString();
}

async function fetchResumen24h(token, accountTag, siteTag) {
  const query = `{
    viewer {
      accounts(filter: {accountTag: "${accountTag}"}) {
        rumPageloadEventsAdaptiveGroups(limit: 1, filter: {AND: [
          {datetime_geq: "${isoHace(24)}", datetime_leq: "${isoHace(0)}"},
          {siteTag: "${siteTag}"}
        ]}) {
          count
          sum { visits }
        }
      }
    }
  }`;
  const data = await graphql(token, query);
  const grupo = data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups?.[0];
  return {
    visitas: grupo?.sum?.visits || 0,
    paginasVistas: grupo?.count || 0,
  };
}

async function fetchTopPaginas7d(token, accountTag, siteTag) {
  const query = `{
    viewer {
      accounts(filter: {accountTag: "${accountTag}"}) {
        rumPageloadEventsAdaptiveGroups(limit: 5, orderBy: [count_DESC], filter: {AND: [
          {datetime_geq: "${isoHace(24 * 7)}", datetime_leq: "${isoHace(0)}"},
          {siteTag: "${siteTag}"}
        ]}) {
          count
          dimensions { requestPath }
        }
      }
    }
  }`;
  const data = await graphql(token, query);
  const grupos = data.viewer.accounts[0]?.rumPageloadEventsAdaptiveGroups || [];
  return grupos.map((g) => ({ ruta: g.dimensions.requestPath, vistas: g.count }));
}

async function main() {
  const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN;
  if (!token) {
    console.error('[sync-cloudflare-analytics] Falta la variable de entorno CLOUDFLARE_ANALYTICS_TOKEN');
    process.exit(1);
  }

  const accountId = await resolveAccountId(token);
  const siteTag = await resolveSiteTag(token, accountId);

  const [resumen24h, topPaginas] = await Promise.all([
    fetchResumen24h(token, accountId, siteTag),
    fetchTopPaginas7d(token, accountId, siteTag),
  ]);

  const nuevo = {
    actualizado: new Date().toISOString(),
    visitas24h: resumen24h.visitas,
    paginasVistas24h: resumen24h.paginasVistas,
    topPaginas,
  };

  const previoRaw = fs.existsSync(OUTPUT_FILE) ? fs.readFileSync(OUTPUT_FILE, 'utf8') : null;
  const nuevoRaw = JSON.stringify(nuevo, null, 2) + '\n';

  if (nuevoRaw !== previoRaw) {
    writeJSON(OUTPUT_FILE, nuevo);
    console.log(`[sync-cloudflare-analytics] ${OUTPUT_FILE} actualizado.`);
  } else {
    console.log('[sync-cloudflare-analytics] analytics-resumen.json sin cambios.');
  }

  console.log(`Visitas 24h: ${nuevo.visitas24h}`);
  console.log(`Páginas vistas 24h: ${nuevo.paginasVistas24h}`);
  console.log(`Top páginas 7d: ${topPaginas.length}`);
}

main().catch((err) => {
  console.error('[sync-cloudflare-analytics] ERROR:', err.message);
  process.exit(1);
});
