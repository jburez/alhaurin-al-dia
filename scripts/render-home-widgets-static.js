// Compatibilidad: los workflows de agenda y del panel ejecutan este script
// tras actualizar los datos. La portada la genera ahora scripts/render-home.js
// entera a partir de data/, así que aquí solo se delega en ella.
require('./render-home').main();
