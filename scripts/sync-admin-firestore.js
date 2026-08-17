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

async function main() {
  const db = initFirestore();

  const nuevoAvisosLocales = await construirAvisosLocales(db);

  const previoRaw = fs.existsSync(AVISOS_FILE) ? fs.readFileSync(AVISOS_FILE, 'utf8') : null;
  const nuevoRaw = JSON.stringify(nuevoAvisosLocales, null, 2) + '\n';

  if (nuevoRaw !== previoRaw) {
    fs.writeFileSync(AVISOS_FILE, nuevoRaw);
    console.log(`[sync-admin-firestore] ${AVISOS_FILE} actualizado (${nuevoAvisosLocales.avisos.length} avisos activos, ${nuevoAvisosLocales.historial.length} en historial).`);
  } else {
    console.log('[sync-admin-firestore] avisos-locales.json sin cambios.');
  }
}

main().catch((err) => {
  console.error('[sync-admin-firestore] ERROR:', err.message);
  process.exit(1);
});
