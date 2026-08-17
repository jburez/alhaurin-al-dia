import { db, auth, ADMIN_UID } from "./firebase-init.js";
import {
    collection, addDoc, updateDoc, deleteDoc, doc,
    onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
    signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const avisosCol = collection(db, "admin_avisos");

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

onAuthStateChanged(auth, (user) => {
    if (user && user.uid === ADMIN_UID) {
        showContent(user);
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
                <span class="admin-list-item-icon">${aviso.icono || "📢"}</span>
                <div>
                    <strong>${aviso.titulo || "(sin título)"}</strong>
                    <span class="admin-list-item-meta">${aviso.tipo || ""}${aviso.resuelto ? " · Resuelto" : ` · ${aviso.estado || "neutral"}`}</span>
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
onSnapshot(avisosQuery, (snapshot) => {
    allAvisos = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderAvisos();
}, (err) => {
    console.error("Error escuchando avisos:", err);
    avisosList.innerHTML = '<p class="admin-empty">No se han podido cargar los avisos.</p>';
});

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
        if (!confirm("¿Eliminar este aviso permanentemente?")) return;
        try {
            await deleteDoc(doc(db, "admin_avisos", id));
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

function showEventoModal() { eventoModal.hidden = false; eventoModal.classList.add("open"); }
function hideEventoModal() { eventoModal.hidden = true; eventoModal.classList.remove("open"); eventoForm.reset(); document.getElementById("evento-doc-id").value = ""; }

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
    document.getElementById("evento-doc-id").value = evento.docId;
    document.getElementById("evento-titulo").value = evento.titulo || "";
    document.getElementById("evento-tipo").value = evento.tipo || "";
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
    const inicio = localInputValueToDate(document.getElementById("evento-inicio").value);
    const fin = localInputValueToDate(document.getElementById("evento-fin").value);

    const payload = {
        titulo: document.getElementById("evento-titulo").value.trim(),
        tipo: document.getElementById("evento-tipo").value.trim() || "Evento",
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

// ===== Eventos: lista en vivo =====
const eventosList = document.getElementById("admin-eventos-list");
let allEventos = [];

function formatEventoFecha(iso) {
    if (!iso) return "Fecha pendiente";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "Fecha pendiente";
    return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function renderEventos() {
    if (!allEventos.length) {
        eventosList.innerHTML = '<p class="admin-empty">Todavía no hay eventos manuales. Crea el primero con "+ Nuevo evento".</p>';
        return;
    }
    eventosList.innerHTML = allEventos.map((evento) => `
        <article class="admin-list-item admin-list-item--${evento.activo === false ? "resuelto" : "neutral"}">
            <div class="admin-list-item-main">
                <span class="admin-list-item-icon">${evento.icono || "📅"}</span>
                <div>
                    <strong>${evento.titulo || "(sin título)"}</strong>
                    <span class="admin-list-item-meta">${formatEventoFecha(evento.inicio)}${evento.lugar ? ` · ${evento.lugar}` : ""}${evento.activo === false ? " · Inactivo" : ""}</span>
                </div>
            </div>
            <div class="admin-list-item-actions">
                <button type="button" class="btn btn-secondary admin-edit-evento-btn" data-id="${evento.docId}">Editar</button>
                <button type="button" class="btn admin-delete-evento-btn" data-id="${evento.docId}">Eliminar</button>
            </div>
        </article>
    `).join("");
}

const eventosQuery = query(eventosCol, orderBy("creadoEn", "desc"));
onSnapshot(eventosQuery, (snapshot) => {
    allEventos = snapshot.docs.map((d) => ({ docId: d.id, ...d.data() }));
    renderEventos();
}, (err) => {
    console.error("Error escuchando eventos:", err);
    eventosList.innerHTML = '<p class="admin-empty">No se han podido cargar los eventos.</p>';
});

eventosList.addEventListener("click", async (e) => {
    const editBtn = e.target.closest(".admin-edit-evento-btn");
    if (editBtn) {
        const evento = allEventos.find((ev) => ev.docId === editBtn.getAttribute("data-id"));
        if (!evento) return;
        eventoModalTitle.textContent = "Editar evento";
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
        const id = deleteBtn.getAttribute("data-id");
        if (!confirm("¿Eliminar este evento permanentemente? También se borrará su página en /planes/.")) return;
        try {
            await deleteDoc(doc(db, "admin_eventos", id));
        } catch (err) {
            console.error("Error eliminando evento:", err);
            alert("No se ha podido eliminar el evento.");
        }
    }
});
