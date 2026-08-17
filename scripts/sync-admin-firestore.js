// Sincroniza las colecciones de Firestore que alimenta el panel admin
// (admin/index.html) hacia los JSON estáticos que consume el sitio.
//
// Diseño clave: Firestore es la fuente de verdad COMPLETA del subconjunto de
// datos que gestiona el panel admin, así que cada sync reconstruye ese
// subconjunto desde cero en vez de aplicar un diff incremental. Esto hace el
// script idempotente: si un `git push` falla por chocar con otro workflow
// escribiendo a la vez en `develop` (hay varios en este repo, cada uno
// tocando archivos distintos), el siguiente run programado reconstruye el
// estado correcto igual, sin arrastrar ningún estado a medias.
//
// Si la lectura de Firestore falla, el script aborta sin tocar ningún JSON
// (exit code != 0) — mejor un job de GitHub Actions en rojo que visible en
// los logs, que sobrescribir en silencio con datos vacíos.

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const ROOT = path.resolve(__dirname, '..');
const AVISOS_FILE = path.join(ROOT, 'data', 'avisos-locales.json');
const AGENDA_FILE = path.join(ROOT, 'data', 'agenda-local.json');
const ESTADO_LOCAL_FILE = path.join(ROOT, 'data', 'estado-local.json');
const ESTADO_LOCAL_IDS = ['trafico', 'avisos', 'agenda', 'servicios'];
const ESTADO_LOCAL_TITULOS = { trafico: 'Tráfico', avisos: 'Avisos locales', agenda: 'Agenda', servicios: 'Servicios' };
const RADAR_TRAFICO_FILE = path.join(ROOT, 'data', 'radar-trafico.json');
const COMERCIOS_FILE = path.join(ROOT, 'data', 'comercios-destacados.json');

// Mismo TTL por tipo que radar-social/index.html (ver TTL/TTL_LABELS ahí) —
// duplicado a propósito: ese es código de navegador (import de CDN), este es
// Node en CI, no comparten módulo fácilmente sin añadir infraestructura de
// build solo para esto.
const RADAR_TTL_MS = {
  lluvia: 3 * 3600000,
  tormenta: 2 * 3600000,
  granizo: 1 * 3600000,
  viento: 2 * 3600000,
  arroyo: 6 * 3600000,
  'corte-trafico': 12 * 3600000,
  incidencia: 6 * 3600000,
};

// Tipos de reporte del Radar Social que afectan a la tarjeta "Tráfico" del
// Estado Local: cortes de tráfico y crecidas de arroyo (Fahala, Pasadas...),
// que en la práctica también cortan vías.
const RADAR_TRAFICO_TIPOS = new Set(['corte-trafico', 'arroyo']);

function initFirestore() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('Falta la variable de entorno FIREBASE_SERVICE_ACCOUNT_JSON');
  }
  const credential = admin.credential.cert(JSON.parse(raw));
  const app = admin.initializeApp({ credential });
  return admin.firestore(app);
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return fallback;
  }
}

function timestampToISO(value) {
  if (!value) return null;
  // admin.firestore.Timestamp expone .toDate(); un string ISO (por si algún
  // doc se creó a mano) se deja pasar tal cual.
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return null;
}

function avisoDesdeDoc(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    tipo: data.tipo || '',
    icono: data.icono || '📢',
    titulo: data.titulo || '',
    detalle: data.detalle || '',
    estado: ['ok', 'warning', 'alert', 'neutral'].includes(data.estado) ? data.estado : 'warning',
    fuente: data.fuente || '',
    url: data.url || '',
    inicio: timestampToISO(data.inicio),
    fin: timestampToISO(data.fin),
    activo: data.activo !== false,
    resuelto: Boolean(data.resuelto),
  };
}

async function construirAvisosLocales(db) {
  const snapshot = await db.collection('admin_avisos').get();
  const docsPorId = new Map();
  snapshot.forEach((doc) => docsPorId.set(doc.id, avisoDesdeDoc(doc)));

  const actual = readJSON(AVISOS_FILE, { actualizado: null, resumen: '', avisos: [], historial: [] });

  // El historial legado (entradas que nunca vivieron en Firestore, con `id`
  // ausente en admin_avisos) se preserva tal cual: no hace falta migrarlo a
  // mano para poder activar el sync.
  const historialLegado = (Array.isArray(actual.historial) ? actual.historial : [])
    .filter((entry) => !docsPorId.has(entry.id));

  const avisos = [];
  const historialGestionado = [];
  for (const aviso of docsPorId.values()) {
    if (aviso.resuelto) {
      const { resuelto, activo, ...resto } = aviso;
      historialGestionado.push({ ...resto, resuelto: true });
    } else {
      avisos.push(aviso);
    }
  }

  return {
    actualizado: new Date().toISOString(),
    resumen: actual.resumen || 'Avisos locales activos de Alhaurín el Grande.',
    avisos,
    historial: [...historialGestionado, ...historialLegado],
  };
}

function eventoDesdeDoc(doc) {
  const data = doc.data();
  return {
    id: `manual-${doc.id}`,
    tipo: data.tipo || 'Evento',
    icono: data.icono || '📅',
    titulo: data.titulo || '',
    descripcion: data.descripcion || '',
    lugar: data.lugar || '',
    inicio: timestampToISO(data.inicio),
    fin: timestampToISO(data.fin),
    estado: data.estado || 'neutral',
    cta: data.cta || 'Ver más',
    url: data.url || '#',
    activo: data.activo !== false,
    fuente: 'manual',
  };
}

async function construirAgendaLocal(db) {
  const snapshot = await db.collection('admin_eventos').get();
  const eventosManuales = [];
  snapshot.forEach((doc) => eventosManuales.push(eventoDesdeDoc(doc)));

  const actual = readJSON(AGENDA_FILE, { actualizado: null, resumen: '', eventos: [] });
  const eventosExistentes = Array.isArray(actual.eventos) ? actual.eventos : [];

  // Se preserva todo lo que no es "manual" (ayuntamiento, alhaurinhoy,
  // legado); el subconjunto "manual" se reconstruye por completo desde
  // Firestore. Ambos scripts automáticos (actualizar_agenda_ayto.py,
  // actualizar_agenda_alhaurinhoy.py) hacen lo mismo a la inversa: preservan
  // cualquier `fuente` distinta a la suya, así que conviven sin pisarse.
  const eventosNoManuales = eventosExistentes.filter((e) => e.fuente !== 'manual');
  const eventos = [...eventosNoManuales, ...eventosManuales];

  return {
    actualizado: new Date().toISOString(),
    resumen: `Agenda local de Alhaurín el Grande. ${eventos.length} eventos próximos.`,
    eventos,
  };
}

async function construirEstadoLocal(db) {
  const snap = await db.collection('admin_estado_local').doc('main').get();
  if (!snap.exists) {
    console.log('[sync-admin-firestore] admin_estado_local/main no existe todavía (nadie ha guardado desde el panel); estado-local.json no se toca.');
    return null;
  }

  const data = snap.data();
  const items = Array.isArray(data.items) ? data.items : [];
  const porId = new Map(items.map((item) => [item.id, item]));
  const faltan = ESTADO_LOCAL_IDS.filter((id) => !porId.has(id));
  if (faltan.length) {
    console.error(`[sync-admin-firestore] admin_estado_local/main incompleto (faltan tarjetas: ${faltan.join(', ')}); estado-local.json no se toca.`);
    return null;
  }

  return {
    actualizado: new Date().toISOString(),
    resumen: data.resumen || 'Información diaria orientativa para consultar antes de salir. Los avisos críticos deben confirmarse siempre en fuentes oficiales.',
    items: ESTADO_LOCAL_IDS.map((id) => {
      const item = porId.get(id);
      return {
        id,
        icono: item.icono || '•',
        titulo: ESTADO_LOCAL_TITULOS[id],
        valor: item.valor || '',
        detalle: item.detalle || '',
        estado: ['ok', 'warning', 'alert', 'neutral'].includes(item.estado) ? item.estado : 'neutral',
        cta: item.cta || 'Ver más',
        url: item.url || '#',
      };
    }),
  };
}

function radarReportActivo(data) {
  if (data.dismissed) return false;
  if ((data.dismisses || 0) >= 3) return false;
  const ttl = RADAR_TTL_MS[data.type] || 6 * 3600000;
  return (Date.now() - (data.ts || 0)) <= ttl;
}

async function construirRadarTrafico(db) {
  const snapshot = await db.collection('radar_reports').get();
  const reportes = [];
  snapshot.forEach((doc) => {
    const data = doc.data();
    if (RADAR_TRAFICO_TIPOS.has(data.type) && radarReportActivo(data)) {
      reportes.push({
        id: doc.id,
        type: data.type,
        titulo: data.title || '',
        detalle: data.desc || '',
        calle: data.street || '',
        ts: data.ts || 0,
      });
    }
  });
  reportes.sort((a, b) => b.ts - a.ts);

  return {
    actualizado: new Date().toISOString(),
    activo: reportes.length > 0,
    reportes,
  };
}

function comercioDesdeDoc(doc) {
  const data = doc.data();
  return {
    nombre: data.nombre || '',
    descripcion: data.descripcion || '',
    categoria: data.categoria || '',
    zona: data.zona || '',
    telefonoHref: data.telefonoHref || '',
    url: data.url || './comercios/',
    cta: data.cta || 'Ver comercio',
    etiqueta: data.etiqueta || 'Comercio destacado',
    imagen: data.imagen || '',
    activo: data.activo !== false,
  };
}

async function construirComercios(db) {
  const snapshot = await db.collection('admin_comercios').get();
  const comercios = [];
  snapshot.forEach((doc) => comercios.push(comercioDesdeDoc(doc)));

  const actual = readJSON(COMERCIOS_FILE, { resumen: '' });

  return {
    actualizado: new Date().toISOString(),
    resumen: actual.resumen || 'Comercios destacados de Alhaurín el Grande para espacios patrocinados o colaboraciones locales verificadas.',
    comercios,
  };
}

async function main() {
  const db = initFirestore();

  const nuevoAvisosLocales = await construirAvisosLocales(db);
  const nuevaAgendaLocal = await construirAgendaLocal(db);
  const nuevoEstadoLocal = await construirEstadoLocal(db);
  const nuevosComercios = await construirComercios(db);
  const nuevoRadarTrafico = await construirRadarTrafico(db);

  const previoAvisosRaw = fs.existsSync(AVISOS_FILE) ? fs.readFileSync(AVISOS_FILE, 'utf8') : null;
  const nuevoAvisosRaw = JSON.stringify(nuevoAvisosLocales, null, 2) + '\n';
  if (nuevoAvisosRaw !== previoAvisosRaw) {
    fs.writeFileSync(AVISOS_FILE, nuevoAvisosRaw);
    console.log(`[sync-admin-firestore] ${AVISOS_FILE} actualizado (${nuevoAvisosLocales.avisos.length} avisos activos, ${nuevoAvisosLocales.historial.length} en historial).`);
  } else {
    console.log('[sync-admin-firestore] avisos-locales.json sin cambios.');
  }

  const previoAgendaRaw = fs.existsSync(AGENDA_FILE) ? fs.readFileSync(AGENDA_FILE, 'utf8') : null;
  const nuevaAgendaRaw = JSON.stringify(nuevaAgendaLocal, null, 2) + '\n';
  if (nuevaAgendaRaw !== previoAgendaRaw) {
    fs.writeFileSync(AGENDA_FILE, nuevaAgendaRaw);
    const manuales = nuevaAgendaLocal.eventos.filter((e) => e.fuente === 'manual').length;
    console.log(`[sync-admin-firestore] ${AGENDA_FILE} actualizado (${manuales} eventos manuales, ${nuevaAgendaLocal.eventos.length} en total).`);
  } else {
    console.log('[sync-admin-firestore] agenda-local.json sin cambios.');
  }

  if (nuevoEstadoLocal) {
    const previoEstadoRaw = fs.existsSync(ESTADO_LOCAL_FILE) ? fs.readFileSync(ESTADO_LOCAL_FILE, 'utf8') : null;
    const nuevoEstadoRaw = JSON.stringify(nuevoEstadoLocal, null, 2) + '\n';
    if (nuevoEstadoRaw !== previoEstadoRaw) {
      fs.writeFileSync(ESTADO_LOCAL_FILE, nuevoEstadoRaw);
      console.log(`[sync-admin-firestore] ${ESTADO_LOCAL_FILE} actualizado.`);
    } else {
      console.log('[sync-admin-firestore] estado-local.json sin cambios.');
    }
  }

  const previoRadarRaw = fs.existsSync(RADAR_TRAFICO_FILE) ? fs.readFileSync(RADAR_TRAFICO_FILE, 'utf8') : null;
  const nuevoRadarRaw = JSON.stringify(nuevoRadarTrafico, null, 2) + '\n';
  if (nuevoRadarRaw !== previoRadarRaw) {
    fs.writeFileSync(RADAR_TRAFICO_FILE, nuevoRadarRaw);
    console.log(`[sync-admin-firestore] ${RADAR_TRAFICO_FILE} actualizado (${nuevoRadarTrafico.reportes.length} reportes activos).`);
  } else {
    console.log('[sync-admin-firestore] radar-trafico.json sin cambios.');
  }

  const previoComerciosRaw = fs.existsSync(COMERCIOS_FILE) ? fs.readFileSync(COMERCIOS_FILE, 'utf8') : null;
  const nuevoComerciosRaw = JSON.stringify(nuevosComercios, null, 2) + '\n';
  if (nuevoComerciosRaw !== previoComerciosRaw) {
    fs.writeFileSync(COMERCIOS_FILE, nuevoComerciosRaw);
    console.log(`[sync-admin-firestore] ${COMERCIOS_FILE} actualizado (${nuevosComercios.comercios.length} comercios).`);
  } else {
    console.log('[sync-admin-firestore] comercios-destacados.json sin cambios.');
  }
}

main().catch((err) => {
  console.error('[sync-admin-firestore] ERROR:', err.message);
  process.exit(1);
});
