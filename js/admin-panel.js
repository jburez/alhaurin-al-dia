import { db, auth, ADMIN_UID } from "./firebase-init.js";
import {
    collection, addDoc, updateDoc, deleteDoc, doc, setDoc,
    onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
    signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

function escapeHTML(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

const avisosCol = collection(db, "admin_avisos");
const papeleraCol = collection(db, "admin_papelera");

// "Eliminar" en Avisos/Eventos/Comercios/Radar Social ya no borra sin más:
// mueve un snapshot completo del doc a admin_papelera (con la colección de
// origen y el id original, para poder restaurar con el mismo id — importante
// en Eventos, donde el id determina el slug de /planes/) y borra el original.
async function moveToTrash(coleccionOrigen, docId, datos) {
    await addDoc(papeleraCol, {
        coleccionOrigen,
        docIdOriginal: docId,
        datos,
        eliminadoEn: serverTimestamp(),
    });
    await deleteDoc(doc(db, coleccionOrigen, docId));
}

const loginGate = document.getElementById("admin-login-gate");
const content = document.getElementById("admin-content");
const sessionBox = document.getElementById("admin-session-box");
const sessionEmail = document.getElementById("admin-session-email");
const loginForm = document.getElementById("admin-login-form");
const loginError = document.getElementById("admin-login-error");
const loginSubmit = document.getElementById("admin-login-submit");

function showGate() {
    loginGate.hidden = false;
    content.hidden = true;
    sessionBox.hidden = true;
}

function showContent(user) {
    loginGate.hidden = true;
    content.hidden = false;
    sessionBox.hidden = false;
    sessionEmail.textContent = user.email;
}

// Los listeners en vivo (onSnapshot) de cada pestaña se registran solo tras
// confirmar sesión admin, nunca antes: registrarlos en cuanto carga el script
// (sin esperar a onAuthStateChanged) competía con la resolución inicial del
// token de Firebase Auth — en la práctica, las colecciones que no llegaban a
// tiempo se quedaban con el listener nunca disparado (ni éxito ni error) en
// vez de fallar de forma visible. Real, reproducido en producción: con las
// query registradas de golpe al cargar el módulo, avisos cargaba bien pero
// eventos/estado local/radar social se quedaban vacíos sin ningún error en
// consola; al re-registrar el mismo código un instante después (auth ya
// resuelto), funcionaban perfectamente. Empezar los listeners solo cuando
// onAuthStateChanged ya confirmó el UID admin elimina la carrera de raíz.
let liveListenersStarted = false;

onAuthStateChanged(auth, (user) => {
    if (user && user.uid === ADMIN_UID) {
        showContent(user);
        if (!liveListenersStarted) {
            liveListenersStarted = true;
            startAvisosListener();
            startEventosListener();
            startEstadoLocalListener();
            startRadarListener();
            startComerciosListener();
            startPapeleraListener();
        }
    } else {
        if (user) signOut(auth); // sesión válida pero sin permisos: no dejar a medias
        showGate();
    }
});

loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("admin-email").value;
    const password = document.getElementById("admin-password").value;
    loginError.hidden = true;
    loginSubmit.disabled = true;
    loginSubmit.textContent = "Entrando...";
    try {
        await signInWithEmailAndPassword(auth, email, password);
        loginForm.reset();
    } catch (err) {
        loginError.textContent = "No se ha podido iniciar sesión. Revisa el email y la contraseña.";
        loginError.hidden = false;
    } finally {
        loginSubmit.disabled = false;
        loginSubmit.textContent = "Entrar";
    }
});

document.getElementById("admin-logout-btn").addEventListener("click", () => signOut(auth));

// ===== Pestañas =====
document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
        if (btn.disabled) return;
        document.querySelectorAll(".admin-tab").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const tab = btn.getAttribute("data-tab");
        document.querySelectorAll(".admin-panel").forEach((panel) => {
            panel.hidden = panel.getAttribute("data-panel") !== tab;
        });
    });
});

// ===== Avisos: helpers de fecha =====
function isoToLocalInputValue(iso) {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputValueToDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

// ===== Avisos: modal =====
const avisoModal = document.getElementById("aviso-modal");
const avisoForm = document.getElementById("aviso-form");
const avisoModalTitle = document.getElementById("aviso-modal-title");

function showAvisoModal() { avisoModal.hidden = false; avisoModal.classList.add("open"); }
function hideAvisoModal() { avisoModal.hidden = true; avisoModal.classList.remove("open"); avisoForm.reset(); document.getElementById("aviso-doc-id").value = ""; }

document.getElementById("open-aviso-modal").addEventListener("click", () => {
    avisoModalTitle.textContent = "Nuevo aviso";
    showAvisoModal();
});
document.getElementById("close-aviso-modal").addEventListener("click", hideAvisoModal);
document.getElementById("cancel-aviso-modal").addEventListener("click", hideAvisoModal);
avisoModal.addEventListener("click", (e) => { if (e.target === avisoModal) hideAvisoModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !avisoModal.hidden) hideAvisoModal(); });

function fillAvisoForm(aviso) {
    document.getElementById("aviso-doc-id").value = aviso.id;
    document.getElementById("aviso-tipo").value = aviso.tipo || "";
    document.getElementById("aviso-icono").value = aviso.icono || "";
    document.getElementById("aviso-estado").value = aviso.estado || "warning";
    document.getElementById("aviso-titulo").value = aviso.titulo || "";
    document.getElementById("aviso-detalle").value = aviso.detalle || "";
    document.getElementById("aviso-fuente").value = aviso.fuente || "";
    document.getElementById("aviso-url").value = aviso.url || "";
    document.getElementById("aviso-inicio").value = isoToLocalInputValue(aviso.inicio);
    document.getElementById("aviso-fin").value = isoToLocalInputValue(aviso.fin);
    document.getElementById("aviso-resuelto").checked = Boolean(aviso.resuelto);
}

avisoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("submit-aviso-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";

    const docId = document.getElementById("aviso-doc-id").value;
    const resuelto = document.getElementById("aviso-resuelto").checked;
    const inicio = localInputValueToDate(document.getElementById("aviso-inicio").value);
    const fin = localInputValueToDate(document.getElementById("aviso-fin").value);

    const payload = {
        tipo: document.getElementById("aviso-tipo").value.trim(),
        icono: document.getElementById("aviso-icono").value.trim() || "📢",
        estado: document.getElementById("aviso-estado").value,
        titulo: document.getElementById("aviso-titulo").value.trim(),
        detalle: document.getElementById("aviso-detalle").value.trim(),
        fuente: document.getElementById("aviso-fuente").value.trim(),
        url: document.getElementById("aviso-url").value.trim(),
        inicio,
        fin,
        activo: !resuelto,
        resuelto,
        actualizadoEn: serverTimestamp(),
    };

    try {
        if (docId) {
            await updateDoc(doc(db, "admin_avisos", docId), payload);
        } else {
            await addDoc(avisosCol, { ...payload, creadoEn: serverTimestamp() });
        }
        hideAvisoModal();
    } catch (err) {
        console.error("Error guardando aviso:", err);
        alert("No se ha podido guardar el aviso.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Guardar";
    }
});

// ===== Avisos: lista en vivo =====
const avisosList = document.getElementById("admin-avisos-list");
let allAvisos = [];

function renderAvisos() {
    if (!allAvisos.length) {
        avisosList.innerHTML = '<p class="admin-empty">Todavía no hay avisos. Crea el primero con "+ Nuevo aviso".</p>';
        return;
    }
    avisosList.innerHTML = allAvisos.map((aviso) => `
        <article class="admin-list-item admin-list-item--${aviso.resuelto ? "resuelto" : aviso.estado || "neutral"}">
            <div class="admin-list-item-main">
                <span class="admin-list-item-icon">${escapeHTML(aviso.icono || "📢")}</span>
                <div>
                    <strong>${escapeHTML(aviso.titulo || "(sin título)")}</strong>
                    <span class="admin-list-item-meta">${escapeHTML(aviso.tipo || "")}${aviso.resuelto ? " · Resuelto" : ` · ${escapeHTML(aviso.estado || "neutral")}`}</span>
                </div>
            </div>
            <div class="admin-list-item-actions">
                <button type="button" class="btn btn-secondary admin-edit-btn" data-id="${aviso.id}">Editar</button>
                <button type="button" class="btn admin-delete-btn" data-id="${aviso.id}">Eliminar</button>
            </div>
        </article>
    `).join("");
}

const avisosQuery = query(avisosCol, orderBy("creadoEn", "desc"));
function startAvisosListener() {
    onSnapshot(avisosQuery, (snapshot) => {
        allAvisos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderAvisos();
        renderDashboard();
    }, (err) => {
        console.error("Error escuchando avisos:", err);
        avisosList.innerHTML = '<p class="admin-empty">No se han podido cargar los avisos.</p>';
    });
}

avisosList.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".admin-edit-btn");
    if (editBtn) {
        const aviso = allAvisos.find((a) => a.id === editBtn.getAttribute("data-id"));
        if (!aviso) return;
        avisoModalTitle.textContent = "Editar aviso";
        fillAvisoForm({
            ...aviso,
            inicio: aviso.inicio && typeof aviso.inicio.toDate === "function" ? aviso.inicio.toDate().toISOString() : aviso.inicio,
            fin: aviso.fin && typeof aviso.fin.toDate === "function" ? aviso.fin.toDate().toISOString() : aviso.fin,
        });
        showAvisoModal();
        return;
    }

    const deleteBtn = e.target.closest(".admin-delete-btn");
    if (deleteBtn) {
        const id = deleteBtn.getAttribute("data-id");
        const aviso = allAvisos.find((a) => a.id === id);
        if (!aviso || !confirm("¿Enviar este aviso a la papelera?")) return;
        try {
            const { id: _id, ...datos } = aviso;
            await moveToTrash("admin_avisos", id, datos);
        } catch (err) {
            console.error("Error eliminando aviso:", err);
            alert("No se ha podido eliminar el aviso.");
        }
    }
});

// ===== Eventos: modal =====
const eventosCol = collection(db, "admin_eventos");
const eventoModal = document.getElementById("evento-modal");
const eventoForm = document.getElementById("evento-form");
const eventoModalTitle = document.getElementById("evento-modal-title");

// Vocabulario real de categorías: el mismo que usa guess_category() en
// scripts/actualizar_agenda_alhaurinhoy.py. Un <select> con esta lista fija
// evita categorías inventadas a mano que luego no colorea bien el
// calendario (planes/calendario.js) — el bug real que motivó este cambio:
// varios eventos de "Cine" habían quedado como "Gastronomía"/"Música en
// vivo" por colisión de palabras clave en el texto libre.
const EVENTO_TIPOS = [
    "Cultos y procesiones", "Deportes", "Motor", "Cine",
    "Música en vivo", "Gastronomía", "Ocio", "Evento",
];

document.getElementById("evento-tipo").innerHTML = EVENTO_TIPOS
    .map((tipo) => `<option value="${escapeHTML(tipo)}">${escapeHTML(tipo)}</option>`)
    .join("");

function showEventoModal() { eventoModal.hidden = false; eventoModal.classList.add("open"); }
function hideEventoModal() {
    eventoModal.hidden = true;
    eventoModal.classList.remove("open");
    eventoForm.reset();
    document.getElementById("evento-doc-id").value = "";
    document.getElementById("evento-origen-id").value = "";
    document.getElementById("evento-origen-fuente").value = "";
}

document.getElementById("open-evento-modal").addEventListener("click", () => {
    eventoModalTitle.textContent = "Nuevo evento";
    document.getElementById("evento-activo").checked = true;
    showEventoModal();
});
document.getElementById("close-evento-modal").addEventListener("click", hideEventoModal);
document.getElementById("cancel-evento-modal").addEventListener("click", hideEventoModal);
eventoModal.addEventListener("click", (e) => { if (e.target === eventoModal) hideEventoModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !eventoModal.hidden) hideEventoModal(); });

function fillEventoForm(evento) {
    document.getElementById("evento-doc-id").value = evento.docId || "";
    // Solo se rellena para un importado sin reclamar todavía (ver
    // eventosList click handler): al guardar, esto decide si se hace
    // setDoc con id explícito (reclamar) en vez de addDoc/updateDoc.
    document.getElementById("evento-origen-id").value = evento._importado ? evento.id : "";
    document.getElementById("evento-origen-fuente").value = evento._importado ? (evento.fuente || "") : "";
    document.getElementById("evento-titulo").value = evento.titulo || "";
    document.getElementById("evento-tipo").value = EVENTO_TIPOS.includes(evento.tipo) ? evento.tipo : "Evento";
    document.getElementById("evento-icono").value = evento.icono || "";
    document.getElementById("evento-descripcion").value = evento.descripcion || "";
    document.getElementById("evento-lugar").value = evento.lugar || "";
    document.getElementById("evento-inicio").value = isoToLocalInputValue(evento.inicio);
    document.getElementById("evento-fin").value = isoToLocalInputValue(evento.fin);
    document.getElementById("evento-cta").value = evento.cta || "";
    document.getElementById("evento-url").value = evento.url || "";
    document.getElementById("evento-activo").checked = evento.activo !== false;
}

eventoForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("submit-evento-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";

    const docId = document.getElementById("evento-doc-id").value;
    const origenId = document.getElementById("evento-origen-id").value;
    const origenFuente = document.getElementById("evento-origen-fuente").value;
    const inicio = localInputValueToDate(document.getElementById("evento-inicio").value);
    const fin = localInputValueToDate(document.getElementById("evento-fin").value);

    const payload = {
        titulo: document.getElementById("evento-titulo").value.trim(),
        tipo: document.getElementById("evento-tipo").value || "Evento",
        icono: document.getElementById("evento-icono").value.trim() || "📅",
        descripcion: document.getElementById("evento-descripcion").value.trim(),
        lugar: document.getElementById("evento-lugar").value.trim(),
        inicio,
        fin,
        cta: document.getElementById("evento-cta").value.trim() || "Ver más",
        url: document.getElementById("evento-url").value.trim() || "#",
        activo: document.getElementById("evento-activo").checked,
        actualizadoEn: serverTimestamp(),
    };

    try {
        if (docId) {
            await updateDoc(doc(db, "admin_eventos", docId), payload);
        } else if (origenId) {
            // Reclamar: primera edición de un evento importado. Se guarda
            // con su id original como id de documento explícito, para que
            // sync-admin-firestore.js lo reconozca y sustituya la entrada
            // ya existente en agenda-local.json en vez de duplicarla — y
            // para que actualizar_agenda_alhaurinhoy.py / _ayto.py, que
            // nunca reescriben un id que ya conocen, no lo vuelvan a tocar.
            await setDoc(doc(db, "admin_eventos", origenId), {
                ...payload,
                origenId,
                origen: origenFuente || "manual",
                creadoEn: serverTimestamp(),
            });
        } else {
            await addDoc(eventosCol, { ...payload, creadoEn: serverTimestamp() });
        }
        hideEventoModal();
    } catch (err) {
        console.error("Error guardando evento:", err);
        alert("No se ha podido guardar el evento.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Guardar";
    }
});

// ===== Eventos: lista en vivo (Firestore) + importados sin reclamar =====
// Los eventos manuales y los ya "reclamados" (editados/borrados alguna vez
// desde este panel) viven en Firestore (admin_eventos, listener en vivo).
// Los importados de alhaurinhoy.es/Ayuntamiento que nadie ha tocado todavía
// solo existen en data/agenda-local.json — se leen con un fetch normal
// (dato público, sin autenticación) y se combinan en la misma lista.
const eventosList = document.getElementById("admin-eventos-list");
const eventosFiltro = document.getElementById("eventos-filtro");
let allEventos = [];
let allEventosImportados = [];
let eventosRenderizados = [];

const ORIGEN_EVENTO_LABEL = { alhaurinhoy: "alhaurinhoy.es", ayuntamiento: "Ayuntamiento", legado: "Legado" };

async function cargarEventosImportados() {
    try {
        const resp = await fetch("/data/agenda-local.json", { cache: "no-store" });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        allEventosImportados = (Array.isArray(data.eventos) ? data.eventos : [])
            .filter((ev) => ev.fuente && ev.fuente !== "manual");
        renderEventos();
    } catch (err) {
        console.error("Error cargando eventos importados:", err);
    }
}

function formatEventoFecha(iso) {
    if (!iso) return "Fecha pendiente";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Fecha pendiente";
    return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function origenEventoLabel(evento) {
    if (evento._importado) return ORIGEN_EVENTO_LABEL[evento.fuente] || evento.fuente;
    if (evento.origenId) return `${ORIGEN_EVENTO_LABEL[evento.origen] || evento.origen || "importado"} · editado`;
    return "Manual";
}

function renderEventos() {
    // Un importado deja de listarse "sin reclamar" en cuanto su id aparece
    // como origenId de un doc real en Firestore (ver eventoDesdeDoc en
    // sync-admin-firestore.js, mismo criterio).
    const idsReclamados = new Set(allEventos.filter((ev) => ev.origenId).map((ev) => ev.origenId));
    const combinados = [
        ...allEventos.map((ev) => ({ ...ev, _importado: false })),
        ...allEventosImportados
            .filter((ev) => !idsReclamados.has(ev.id))
            .map((ev) => ({ ...ev, docId: null, _importado: true })),
    ].sort((a, b) => new Date(a.inicio || "9999") - new Date(b.inicio || "9999"));

    const filtro = eventosFiltro.value.trim().toLowerCase();
    eventosRenderizados = filtro
        ? combinados.filter((ev) => (ev.titulo || "").toLowerCase().includes(filtro))
        : combinados;

    if (!eventosRenderizados.length) {
        eventosList.innerHTML = '<p class="admin-empty">Ningún evento coincide.</p>';
        return;
    }

    eventosList.innerHTML = eventosRenderizados.map((evento, idx) => `
        <article class="admin-list-item admin-list-item--${evento.activo === false ? "resuelto" : "neutral"}">
            <div class="admin-list-item-main">
                <span class="admin-list-item-icon">${escapeHTML(evento.icono || "📅")}</span>
                <div>
                    <strong>${escapeHTML(evento.titulo || "(sin título)")}</strong>
                    <span class="admin-list-item-meta">${escapeHTML(origenEventoLabel(evento))} · ${escapeHTML(evento.tipo || "Evento")} · ${escapeHTML(formatEventoFecha(evento.inicio))}${evento.lugar ? ` · ${escapeHTML(evento.lugar)}` : ""}${evento.activo === false ? " · Inactivo" : ""}</span>
                </div>
            </div>
            <div class="admin-list-item-actions">
                <button type="button" class="btn btn-secondary admin-edit-evento-btn" data-idx="${idx}">Editar</button>
                <button type="button" class="btn admin-delete-evento-btn" data-idx="${idx}">Eliminar</button>
            </div>
        </article>
    `).join("");
}

eventosFiltro.addEventListener("input", renderEventos);

const eventosQuery = query(eventosCol, orderBy("creadoEn", "desc"));
function startEventosListener() {
    onSnapshot(eventosQuery, (snapshot) => {
        allEventos = snapshot.docs.map((d) => ({ docId: d.id, ...d.data() }));
        renderEventos();
        renderDashboard();
    }, (err) => {
        console.error("Error escuchando eventos:", err);
        eventosList.innerHTML = '<p class="admin-empty">No se han podido cargar los eventos.</p>';
    });
    cargarEventosImportados();
}

eventosList.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".admin-edit-evento-btn");
    if (editBtn) {
        const evento = eventosRenderizados[Number(editBtn.getAttribute("data-idx"))];
        if (!evento) return;
        eventoModalTitle.textContent = evento._importado ? "Editar evento importado" : "Editar evento";
        fillEventoForm({
            ...evento,
            inicio: evento.inicio && typeof evento.inicio.toDate === "function" ? evento.inicio.toDate().toISOString() : evento.inicio,
            fin: evento.fin && typeof evento.fin.toDate === "function" ? evento.fin.toDate().toISOString() : evento.fin,
        });
        showEventoModal();
        return;
    }

    const deleteBtn = e.target.closest(".admin-delete-evento-btn");
    if (deleteBtn) {
        const evento = eventosRenderizados[Number(deleteBtn.getAttribute("data-idx"))];
        if (!evento) return;
        if (!confirm("¿Enviar este evento a la papelera? Su página en /planes/ desaparecerá hasta que se restaure.")) return;
        try {
            if (evento._importado) {
                // Reclamar y enviar a la papelera en el mismo paso: un
                // importado sin reclamar no tiene doc en admin_eventos
                // todavía, así que "eliminar" primero lo copia (igual que
                // al editar) y luego lo mueve a la papelera.
                const { docId: _docId, _importado: _imp, ...datos } = evento;
                await setDoc(doc(db, "admin_eventos", evento.id), {
                    ...datos,
                    origenId: evento.id,
                    origen: evento.fuente,
                    creadoEn: serverTimestamp(),
                });
                await moveToTrash("admin_eventos", evento.id, { ...datos, origenId: evento.id, origen: evento.fuente });
            } else {
                const { docId, _importado: _imp, ...datos } = evento;
                await moveToTrash("admin_eventos", docId, datos);
            }
        } catch (err) {
            console.error("Error eliminando evento:", err);
            alert("No se ha podido eliminar el evento.");
        }
    }
});

// ===== Eventos: sincronización bajo demanda =====
// Dispara scripts/actualizar_agenda_alhaurinhoy.py + actualizar_agenda_ayto.py
// vía el workflow "actualizar-agenda-ayto.yml" (ya corre cada 6h solo) sin
// esperar al siguiente ciclo. El panel es una página estática servida en el
// navegador: no puede llamar a la API de GitHub sin exponer un token, así
// que este botón llama a un Worker de Cloudflare que guarda ese token en el
// servidor y verifica el ID token de Firebase del admin antes de disparar
// el workflow (cloudflare/agenda-sync-worker/, ver docs/MANUAL-ADMINISTRACION.md).
const SYNC_WORKER_URL = "https://alhaurin-agenda-sync.jburez.workers.dev";
const syncEventosBtn = document.getElementById("sync-eventos-btn");
const syncEventosNote = document.getElementById("sync-eventos-note");

function mostrarSyncNota(texto) {
    syncEventosNote.textContent = texto;
    syncEventosNote.hidden = false;
}

syncEventosBtn.addEventListener("click", async () => {
    if (!SYNC_WORKER_URL) {
        mostrarSyncNota("Sincronización bajo demanda todavía no configurada (falta desplegar el Worker de Cloudflare). El sync automático sigue corriendo cada 6h.");
        return;
    }
    syncEventosBtn.disabled = true;
    syncEventosBtn.textContent = "Sincronizando...";
    try {
        const idToken = await auth.currentUser.getIdToken();
        const resp = await fetch(SYNC_WORKER_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        mostrarSyncNota("Sincronización lanzada. Tarda aproximadamente 1 minuto en reflejarse en la agenda.");
    } catch (err) {
        console.error("Error lanzando sincronización:", err);
        mostrarSyncNota("No se ha podido lanzar la sincronización.");
    } finally {
        syncEventosBtn.disabled = false;
        syncEventosBtn.textContent = "🔄 Sincronizar ahora";
    }
});

// ===== Estado local: documento único =====
// A diferencia de avisos/eventos (colecciones con un doc por elemento), aquí
// hay 4 tarjetas fijas dentro de un único documento admin_estado_local/main.
const ESTADO_LOCAL_IDS = ["trafico", "avisos", "agenda", "servicios"];
const estadoLocalForm = document.getElementById("estado-local-form");
const estadoLocalSaveNote = document.getElementById("estado-local-save-note");
const estadoLocalRef = doc(db, "admin_estado_local", "main");

function fillEstadoLocalForm(data) {
    document.getElementById("estado-local-resumen").value = data.resumen || "";
    const items = Array.isArray(data.items) ? data.items : [];
    const porId = new Map(items.map((item) => [item.id, item]));
    ESTADO_LOCAL_IDS.forEach((id) => {
        const item = porId.get(id) || {};
        document.getElementById(`estado-${id}-icono`).value = item.icono || "";
        document.getElementById(`estado-${id}-estado`).value = item.estado || "neutral";
        document.getElementById(`estado-${id}-valor`).value = item.valor || "";
        document.getElementById(`estado-${id}-detalle`).value = item.detalle || "";
        document.getElementById(`estado-${id}-cta`).value = item.cta || "";
        document.getElementById(`estado-${id}-url`).value = item.url || "";
    });
}

function startEstadoLocalListener() {
    onSnapshot(estadoLocalRef, (snap) => {
        if (snap.exists()) fillEstadoLocalForm(snap.data());
    }, (err) => {
        console.error("Error escuchando estado local:", err);
    });
}

estadoLocalForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("submit-estado-local-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";
    estadoLocalSaveNote.hidden = true;

    const items = ESTADO_LOCAL_IDS.map((id) => ({
        id,
        icono: document.getElementById(`estado-${id}-icono`).value.trim() || "•",
        estado: document.getElementById(`estado-${id}-estado`).value,
        valor: document.getElementById(`estado-${id}-valor`).value.trim(),
        detalle: document.getElementById(`estado-${id}-detalle`).value.trim(),
        cta: document.getElementById(`estado-${id}-cta`).value.trim() || "Ver más",
        url: document.getElementById(`estado-${id}-url`).value.trim() || "#",
    }));

    const payload = {
        resumen: document.getElementById("estado-local-resumen").value.trim(),
        items,
        actualizadoEn: serverTimestamp(),
    };

    try {
        // setDoc (no updateDoc): admin_estado_local/main puede no existir
        // todavía la primera vez que se guarda desde el panel.
        await setDoc(estadoLocalRef, payload);
        estadoLocalSaveNote.textContent = "Guardado. Se publicará en la web en un plazo de hasta 15 minutos.";
        estadoLocalSaveNote.hidden = false;
    } catch (err) {
        console.error("Error guardando estado local:", err);
        alert("No se ha podido guardar el estado local.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Guardar estado local";
    }
});

// ===== Radar Social: moderación (misma lógica que radar-social/index.html,
// solo lectura + expirar/eliminar — publicar reportes es cosa de los
// vecinos, no de este panel) =====
const radarReportsCol = collection(db, "radar_reports");

const RADAR_TTL = {
    lluvia: 3 * 3600000,
    tormenta: 2 * 3600000,
    granizo: 1 * 3600000,
    viento: 2 * 3600000,
    arroyo: 6 * 3600000,
    "corte-trafico": 12 * 3600000,
    incidencia: 6 * 3600000
};

const RADAR_TTL_LABELS = {
    lluvia: "3h", tormenta: "2h", granizo: "1h", viento: "2h",
    arroyo: "6h", "corte-trafico": "12h", incidencia: "6h"
};

function radarIconEmoji(type) {
    return { lluvia: "🌧️", tormenta: "⚡", granizo: "🧊", viento: "💨", arroyo: "🌊", "corte-trafico": "🚧", incidencia: "⚠️" }[type] || "📌";
}

function radarTypeLabel(type) {
    return { lluvia: "LLUVIA", tormenta: "TORMENTA", granizo: "GRANIZO", viento: "VIENTO", arroyo: "ARROYO", "corte-trafico": "CORTE DE TRÁFICO", incidencia: "INCIDENCIA" }[type] || String(type || "").toUpperCase();
}

function radarTimeAgo(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000) return "Ahora mismo";
    if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;
    return `Hace ${Math.floor(diff / 86400000)}d`;
}

function radarIsExpired(r) {
    if (r.dismissed) return true;
    if ((r.dismisses || 0) >= 3) return true;
    const ttl = RADAR_TTL[r.type] || 6 * 3600000;
    return (Date.now() - (r.ts || 0)) > ttl;
}

const radarList = document.getElementById("admin-radar-list");
const radarCount = document.getElementById("admin-radar-count");
let allRadarReports = [];

function renderRadarReports() {
    if (!allRadarReports.length) {
        radarCount.textContent = "";
        radarList.innerHTML = '<p class="admin-empty">Todavía no hay reportes vecinales.</p>';
        return;
    }

    const activos = allRadarReports.filter((r) => !radarIsExpired(r));
    radarCount.textContent = `${activos.length} activo${activos.length !== 1 ? "s" : ""} · ${allRadarReports.length} en total`;

    radarList.innerHTML = allRadarReports.map((r) => {
        const expired = radarIsExpired(r);
        const ttlInfo = !expired ? ` · ⏱ ${RADAR_TTL_LABELS[r.type] || "6h"}` : "";
        const ubicacion = r.street ? ` · 📍 ${escapeHTML(r.street)}` : "";
        const votosInfo = ` · 👍 ${r.votes || 0}${r.dismisses ? ` · ❌ ${r.dismisses}` : ""}`;
        return `
            <article class="admin-list-item admin-list-item--${expired ? "resuelto" : "neutral"}">
                <div class="admin-list-item-main">
                    <span class="admin-list-item-icon">${radarIconEmoji(r.type)}</span>
                    <div>
                        <strong>${escapeHTML(r.title || "(sin título)")}</strong>
                        <span class="admin-list-item-meta">${escapeHTML(radarTypeLabel(r.type))} · ${radarTimeAgo(r.ts)}${ttlInfo}${ubicacion}${votosInfo}${expired ? " · Expirado" : ""}</span>
                    </div>
                </div>
                <div class="admin-list-item-actions">
                    ${!expired ? `<button type="button" class="btn btn-secondary admin-expire-radar-btn" data-id="${r.id}">Expirar</button>` : ""}
                    <button type="button" class="btn admin-delete-radar-btn" data-id="${r.id}">Eliminar</button>
                </div>
            </article>
        `;
    }).join("");
}

const radarReportsQuery = query(radarReportsCol, orderBy("ts", "desc"));
function startRadarListener() {
    onSnapshot(radarReportsQuery, (snapshot) => {
        allRadarReports = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        renderRadarReports();
        renderDashboard();
    }, (err) => {
        console.error("Error escuchando reportes del Radar Social:", err);
        radarList.innerHTML = '<p class="admin-empty">No se han podido cargar los reportes.</p>';
    });
}

radarList.addEventListener("click", async (e) => {
    const expireBtn = e.target.closest(".admin-expire-radar-btn");
    if (expireBtn) {
        const id = expireBtn.getAttribute("data-id");
        try {
            await updateDoc(doc(db, "radar_reports", id), { dismissed: true, dismisses: 99 });
        } catch (err) {
            console.error("Error expirando reporte:", err);
            alert("No se ha podido expirar el reporte.");
        }
        return;
    }

    const deleteBtn = e.target.closest(".admin-delete-radar-btn");
    if (deleteBtn) {
        const id = deleteBtn.getAttribute("data-id");
        const reporte = allRadarReports.find((r) => r.id === id);
        if (!reporte || !confirm("¿Enviar este reporte a la papelera? Deja de verse en el mapa público.")) return;
        try {
            const { id: _id, ...datos } = reporte;
            await moveToTrash("radar_reports", id, datos);
        } catch (err) {
            console.error("Error eliminando reporte:", err);
            alert("No se ha podido eliminar el reporte.");
        }
    }
});

// ===== Comercios destacados: modal =====
const comerciosCol = collection(db, "admin_comercios");
const comercioModal = document.getElementById("comercio-modal");
const comercioForm = document.getElementById("comercio-form");
const comercioModalTitle = document.getElementById("comercio-modal-title");

function showComercioModal() { comercioModal.hidden = false; comercioModal.classList.add("open"); }
function hideComercioModal() { comercioModal.hidden = true; comercioModal.classList.remove("open"); comercioForm.reset(); document.getElementById("comercio-doc-id").value = ""; document.getElementById("comercio-activo").checked = true; }

document.getElementById("open-comercio-modal").addEventListener("click", () => {
    comercioModalTitle.textContent = "Nuevo comercio";
    showComercioModal();
});
document.getElementById("close-comercio-modal").addEventListener("click", hideComercioModal);
document.getElementById("cancel-comercio-modal").addEventListener("click", hideComercioModal);
comercioModal.addEventListener("click", (e) => { if (e.target === comercioModal) hideComercioModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !comercioModal.hidden) hideComercioModal(); });

function fillComercioForm(comercio) {
    document.getElementById("comercio-doc-id").value = comercio.docId;
    document.getElementById("comercio-nombre").value = comercio.nombre || "";
    document.getElementById("comercio-categoria").value = comercio.categoria || "";
    document.getElementById("comercio-zona").value = comercio.zona || "";
    document.getElementById("comercio-descripcion").value = comercio.descripcion || "";
    document.getElementById("comercio-etiqueta").value = comercio.etiqueta || "";
    document.getElementById("comercio-telefono").value = comercio.telefonoHref || "";
    document.getElementById("comercio-url").value = comercio.url || "";
    document.getElementById("comercio-cta").value = comercio.cta || "";
    document.getElementById("comercio-imagen").value = comercio.imagen || "";
    document.getElementById("comercio-activo").checked = comercio.activo !== false;
}

comercioForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById("submit-comercio-btn");
    submitBtn.disabled = true;
    submitBtn.textContent = "Guardando...";

    const docId = document.getElementById("comercio-doc-id").value;
    const payload = {
        nombre: document.getElementById("comercio-nombre").value.trim(),
        categoria: document.getElementById("comercio-categoria").value.trim(),
        zona: document.getElementById("comercio-zona").value.trim(),
        descripcion: document.getElementById("comercio-descripcion").value.trim(),
        etiqueta: document.getElementById("comercio-etiqueta").value.trim() || "Comercio destacado",
        telefonoHref: document.getElementById("comercio-telefono").value.trim(),
        url: document.getElementById("comercio-url").value.trim() || "./comercios/",
        cta: document.getElementById("comercio-cta").value.trim() || "Ver comercio",
        imagen: document.getElementById("comercio-imagen").value.trim(),
        activo: document.getElementById("comercio-activo").checked,
        actualizadoEn: serverTimestamp(),
    };

    try {
        if (docId) {
            await updateDoc(doc(db, "admin_comercios", docId), payload);
        } else {
            await addDoc(comerciosCol, { ...payload, creadoEn: serverTimestamp() });
        }
        hideComercioModal();
    } catch (err) {
        console.error("Error guardando comercio:", err);
        alert("No se ha podido guardar el comercio.");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Guardar";
    }
});

// ===== Comercios destacados: lista en vivo =====
const comerciosList = document.getElementById("admin-comercios-list");
let allComercios = [];

function renderComercios() {
    if (!allComercios.length) {
        comerciosList.innerHTML = '<p class="admin-empty">Todavía no hay comercios destacados. Crea el primero con "+ Nuevo comercio".</p>';
        return;
    }
    comerciosList.innerHTML = allComercios.map((comercio) => `
        <article class="admin-list-item admin-list-item--${comercio.activo === false ? "resuelto" : "ok"}">
            <div class="admin-list-item-main">
                <span class="admin-list-item-icon">🏪</span>
                <div>
                    <strong>${escapeHTML(comercio.nombre || "(sin nombre)")}</strong>
                    <span class="admin-list-item-meta">${escapeHTML(comercio.categoria || "")}${comercio.zona ? ` · ${escapeHTML(comercio.zona)}` : ""}${comercio.activo === false ? " · Inactivo" : ""}</span>
                </div>
            </div>
            <div class="admin-list-item-actions">
                <button type="button" class="btn btn-secondary admin-edit-comercio-btn" data-id="${comercio.docId}">Editar</button>
                <button type="button" class="btn admin-delete-comercio-btn" data-id="${comercio.docId}">Eliminar</button>
            </div>
        </article>
    `).join("");
}

function startComerciosListener() {
    const comerciosQuery = query(comerciosCol, orderBy("creadoEn", "desc"));
    onSnapshot(comerciosQuery, (snapshot) => {
        allComercios = snapshot.docs.map((d) => ({ docId: d.id, ...d.data() }));
        renderComercios();
        renderDashboard();
    }, (err) => {
        console.error("Error escuchando comercios:", err);
        comerciosList.innerHTML = '<p class="admin-empty">No se han podido cargar los comercios.</p>';
    });
}

comerciosList.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".admin-edit-comercio-btn");
    if (editBtn) {
        const comercio = allComercios.find((c) => c.docId === editBtn.getAttribute("data-id"));
        if (!comercio) return;
        comercioModalTitle.textContent = "Editar comercio";
        fillComercioForm(comercio);
        showComercioModal();
        return;
    }

    const deleteBtn = e.target.closest(".admin-delete-comercio-btn");
    if (deleteBtn) {
        const id = deleteBtn.getAttribute("data-id");
        const comercio = allComercios.find((c) => c.docId === id);
        if (!comercio || !confirm("¿Enviar este comercio a la papelera?")) return;
        try {
            const { docId: _docId, ...datos } = comercio;
            await moveToTrash("admin_comercios", id, datos);
        } catch (err) {
            console.error("Error eliminando comercio:", err);
            alert("No se ha podido eliminar el comercio.");
        }
    }
});

// ===== Papelera: lista en vivo =====
const papeleraList = document.getElementById("admin-papelera-list");
let allPapelera = [];

const PAPELERA_ORIGEN_LABEL = {
    admin_avisos: "Aviso",
    admin_eventos: "Evento",
    admin_comercios: "Comercio",
    radar_reports: "Radar Social",
};

function papeleraNombre(item) {
    const d = item.datos || {};
    return d.nombre || d.titulo || d.title || "(elemento)";
}

function formatPapeleraFecha(value) {
    const date = value && typeof value.toDate === "function" ? value.toDate() : (value ? new Date(value) : null);
    if (!date || Number.isNaN(date.getTime())) return "hace un momento";
    return "el " + date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }) + " a las " + date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

function renderPapelera() {
    if (!allPapelera.length) {
        papeleraList.innerHTML = '<p class="admin-empty">La papelera está vacía.</p>';
        return;
    }
    papeleraList.innerHTML = allPapelera.map((item) => `
        <article class="admin-list-item admin-list-item--papelera">
            <div class="admin-list-item-main">
                <span class="admin-list-item-icon">🗑️</span>
                <div>
                    <strong><span class="admin-trash-origin">${escapeHTML(PAPELERA_ORIGEN_LABEL[item.coleccionOrigen] || item.coleccionOrigen)}</span>${escapeHTML(papeleraNombre(item))}</strong>
                    <span class="admin-list-item-meta">Eliminado ${formatPapeleraFecha(item.eliminadoEn)}</span>
                </div>
            </div>
            <div class="admin-list-item-actions">
                <button type="button" class="btn btn-secondary admin-restore-btn" data-id="${item.trashId}">Restaurar</button>
                <button type="button" class="btn admin-purge-btn" data-id="${item.trashId}">Eliminar definitivamente</button>
            </div>
        </article>
    `).join("");
}

function startPapeleraListener() {
    const papeleraQuery = query(papeleraCol, orderBy("eliminadoEn", "desc"));
    onSnapshot(papeleraQuery, (snapshot) => {
        allPapelera = snapshot.docs.map((d) => ({ trashId: d.id, ...d.data() }));
        renderPapelera();
        renderDashboard();
    }, (err) => {
        console.error("Error escuchando la papelera:", err);
        papeleraList.innerHTML = '<p class="admin-empty">No se ha podido cargar la papelera.</p>';
    });
}

papeleraList.addEventListener("click", async (e) => {
    const restoreBtn = e.target.closest(".admin-restore-btn");
    if (restoreBtn) {
        const trashId = restoreBtn.getAttribute("data-id");
        const item = allPapelera.find((p) => p.trashId === trashId);
        if (!item) return;
        try {
            await setDoc(doc(db, item.coleccionOrigen, item.docIdOriginal), { ...item.datos, actualizadoEn: serverTimestamp() });
            await deleteDoc(doc(db, "admin_papelera", trashId));
        } catch (err) {
            console.error("Error restaurando elemento:", err);
            alert("No se ha podido restaurar.");
        }
        return;
    }

    const purgeBtn = e.target.closest(".admin-purge-btn");
    if (purgeBtn) {
        const trashId = purgeBtn.getAttribute("data-id");
        if (!confirm("¿Eliminar definitivamente? Esto ya no se puede deshacer.")) return;
        try {
            await deleteDoc(doc(db, "admin_papelera", trashId));
        } catch (err) {
            console.error("Error purgando elemento de la papelera:", err);
            alert("No se ha podido eliminar definitivamente.");
        }
    }
});

// ===== Dashboard: contadores en vivo (reutiliza los datos ya cargados por
// cada pestaña, sin lecturas extra a Firestore) =====
const dashboardStats = document.getElementById("admin-dashboard-stats");

function statTile(value, label, warning) {
    return `<div class="admin-stat-tile${warning ? " admin-stat-tile--warning" : ""}"><div class="admin-stat-tile-value">${value}</div><span class="admin-stat-tile-label">${escapeHTML(label)}</span></div>`;
}

function renderDashboard() {
    try {
        const avisosActivos = allAvisos.filter((a) => !a.resuelto).length;
        const eventosActivos = allEventos.filter((e) => e.activo !== false).length;
        const comerciosActivos = allComercios.filter((c) => c.activo !== false).length;
        const radarActivos = allRadarReports.filter((r) => !radarIsExpired(r)).length;

        dashboardStats.innerHTML = [
            statTile(avisosActivos, `Aviso${avisosActivos === 1 ? "" : "s"} activo${avisosActivos === 1 ? "" : "s"}`),
            statTile(eventosActivos, `Evento${eventosActivos === 1 ? "" : "s"} activo${eventosActivos === 1 ? "" : "s"} en Firestore`),
            statTile(comerciosActivos, `Comercio${comerciosActivos === 1 ? "" : "s"} destacado${comerciosActivos === 1 ? "" : "s"} activo${comerciosActivos === 1 ? "" : "s"}`),
            statTile(radarActivos, `Reporte${radarActivos === 1 ? "" : "s"} activo${radarActivos === 1 ? "" : "s"} en Radar Social`),
            statTile(allPapelera.length, `Elemento${allPapelera.length === 1 ? "" : "s"} en papelera`, allPapelera.length > 0),
        ].join("");
    } catch (err) {
        console.error("Error renderizando dashboard:", err);
        dashboardStats.innerHTML = `<p class="admin-empty">Error: ${escapeHTML(err.message)}</p>`;
    }
}
