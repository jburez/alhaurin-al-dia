// Worker de Cloudflare para el botón "Sincronizar ahora" del panel admin
// (js/admin-panel.js, pestaña Eventos). El panel es una página estática
// servida en el navegador: no puede llamar a la API de GitHub sin exponer
// un token, así que este Worker guarda el token en el servidor (secreto de
// Cloudflare, nunca en el código ni en el navegador) y solo lo usa después
// de verificar que quien llama es el admin real, comprobando su ID token
// de Firebase contra las claves públicas de Google — sin necesitar el SDK
// de Firebase Admin, que no corre en el runtime de Workers.
import { jwtVerify, createRemoteJWKSet } from "jose";

const FIREBASE_PROJECT_ID = "alhaurin-al-dia";
const ADMIN_UID = "Cqm2OKSnOgUf09Leb8D5YePIcnW2";
const ALLOWED_ORIGIN = "https://alhaurinaldia.es";
const GITHUB_OWNER = "jburez";
const GITHUB_REPO = "alhaurin-al-dia";
const WORKFLOW_FILE = "actualizar-agenda-ayto.yml";

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
    }

    const authHeader = request.headers.get("Authorization") || "";
    const idToken = authHeader.replace(/^Bearer\s+/i, "");
    if (!idToken) {
      return new Response("Falta el token de sesión.", { status: 401, headers: corsHeaders() });
    }

    try {
      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
        audience: FIREBASE_PROJECT_ID,
      });

      if (payload.sub !== ADMIN_UID) {
        return new Response("No autorizado.", { status: 403, headers: corsHeaders() });
      }
    } catch (err) {
      return new Response("Token inválido o caducado.", { status: 401, headers: corsHeaders() });
    }

    const ghResponse = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "alhaurin-agenda-sync-worker",
        },
        body: JSON.stringify({ ref: "develop" }),
      }
    );

    if (!ghResponse.ok) {
      const detalle = await ghResponse.text();
      return new Response(`Error al disparar el workflow (${ghResponse.status}): ${detalle}`, {
        status: 502,
        headers: corsHeaders(),
      });
    }

    return new Response("Sincronización lanzada.", { status: 200, headers: corsHeaders() });
  },
};
