// Compatibilidad: la portada la genera ahora scripts/render-home.js entera
// (guía práctica: Hoy, Agenda, Guías, Comercios, Actualidad). Este script se
// mantiene porque `npm run home:static` lo invoca.
require('./render-home').main();
