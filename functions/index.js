// Cloud Function «cicAcceso»: une la lógica (logica.js) con Firestore y Firebase Authentication.
// Se publica con:  firebase deploy --only functions,firestore   (ver CONFIGURAR_FIREBASE.md)
'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { crearLogica } = require('./logica');
const { crearCuentas } = require('./cuentas');

initializeApp();

// Clave web de Firebase (la misma de assets/config.js) y dirección de la página.
// Van en functions/.env (ver .env.ejemplo).
const API_KEY = defineString('CIC_API_KEY');
const SITIO = defineString('CIC_SITIO', { default: 'https://cicredmujeresdelcaribe.org/' });
// Puente a Google Drive (Apps Script publicado con la cuenta del CIC): guarda una copia de los documentos de seguimiento
const DRIVE_URL = defineString('CIC_DRIVE_URL', { default: '' });
const DRIVE_CLAVE = defineString('CIC_DRIVE_CLAVE', { default: '' });
const ORIGENES = defineString('CIC_ORIGENES', { default: 'https://cicredmujeresdelcaribe.org,https://www.cicredmujeresdelcaribe.org,https://centrodeinnovacioncomunitaria-hub.github.io,http://localhost:8080,http://127.0.0.1:8080' });

const cuentas = crearCuentas(getAuth(), () => API_KEY.value(), () => SITIO.value());

// Guías y material en PDF: viven en functions/archivos (fuera de GitHub) y se entregan con permiso
const path = require('path');
const fs = require('fs');
const catalogo = require('./archivos_catalogo.json');
const CARPETA = path.join(__dirname, 'archivos');
const leerArchivo = (ruta) => {
  const f = path.resolve(CARPETA, String(ruta));
  if (!f.startsWith(CARPETA + path.sep) || !fs.existsSync(f)) return null; // nunca fuera de la carpeta
  return fs.readFileSync(f);
};

const drive = async (cuerpo) => {
  const url = DRIVE_URL.value();
  if (!url || !DRIVE_CLAVE.value()) return null; // sin configurar: los documentos quedan solo en la plataforma
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...cuerpo, clave: DRIVE_CLAVE.value() }), redirect: 'follow' });
  const j = await r.json().catch(() => null);
  if (!j || !j.ok) throw new Error(`Drive respondió: ${(j && j.error) || r.status}`);
  return j;
};
drive.activo = () => !!(DRIVE_URL.value() && DRIVE_CLAVE.value());

const logica = crearLogica({ db: getFirestore(), cuentas, catalogo, leerArchivo, drive });

exports.cicAcceso = onRequest({ region: 'us-central1', memory: '256MiB', maxInstances: 10 }, async (req, res) => {
  const permitidos = ORIGENES.value().split(',').map((s) => s.trim());
  const origen = req.get('Origin');
  res.set('Access-Control-Allow-Origin', origen && permitidos.includes(origen) ? origen : permitidos[0]);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'authorization, content-type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ mensaje: 'Método no permitido' });
  const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '') || null;
  const { estado, cuerpo } = await logica.atender(req.body || {}, token);
  res.status(estado).json(cuerpo);
});
