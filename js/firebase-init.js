// Config compartida de Firebase para las páginas que usan Firestore/Auth
// (radar-social, admin). No es secreta: la seguridad la dan las reglas de
// Firestore/Auth (ver firestore.rules), no ocultar estos valores.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyAlMutjn_SxpZ1_82oodmBRpZSdL3UFhQY",
    authDomain: "alhaurin-al-dia.firebaseapp.com",
    projectId: "alhaurin-al-dia",
    storageBucket: "alhaurin-al-dia.firebasestorage.app",
    messagingSenderId: "800516386269",
    appId: "1:800516386269:web:1190fe1f1003510ed6da34"
};

export const ADMIN_UID = "Cqm2OKSnOgUf09Leb8D5YePIcnW2";

export const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);
