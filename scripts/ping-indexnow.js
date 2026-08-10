const https = require('https');

const HOST = 'api.indexnow.org';
const KEY = '8a7d4e3f2b1a0987654321fedcba0987'; // Clave pública IndexNow
const KEY_LOCATION = 'https://alhaurinaldia.es/8a7d4e3f2b1a0987654321fedcba0987.txt';

const urlList = [
  'https://alhaurinaldia.es/',
  'https://alhaurinaldia.es/noticias/',
  'https://alhaurinaldia.es/guia-util/',
  'https://alhaurinaldia.es/avisos/',
  'https://alhaurinaldia.es/tiempo/'
];

const postData = JSON.stringify({
  host: 'alhaurinaldia.es',
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList: urlList
});

const options = {
  hostname: HOST,
  port: 443,
  path: '/indexnow',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('[IndexNow] Notificando actualización de URLs a buscadores...');

const req = https.request(options, (res) => {
  console.log(`[IndexNow] Código de respuesta: ${res.statusCode}`);
  res.on('data', (d) => {
    process.stdout.write(d);
  });
});

req.on('error', (e) => {
  console.error('[IndexNow] Error notificando:', e.message);
});

req.write(postData);
req.end();
