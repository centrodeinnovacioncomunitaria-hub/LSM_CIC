// Cloud Function «cicAcceso»: une la lógica (logica.js) con Firestore y Firebase Authentication.
// Se publica con:  firebase deploy --only functions,firestore   (ver CONFIGURAR_FIREBASE.md)
'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { crearLogica } = require('./logica');
const { crearCuentas } = require('./cuentas');

admin.initializeApp();

// Clave web de Firebase (la misma de assets/config.js) y dirección de la página.
// Van en functions/.env (ver .env.ejemplo).
const API_KEY = defineString('CIC_API_KEY');
const SITIO = defineString('CIC_SITIO', { default: 'https://centrodeinnovacioncomunitaria-hub.github.io/LSM_CIC/' });
const ORIGENES = defineString('CIC_ORIGENES', { default: 'https://centrodeinnovacioncomunitaria-hub.github.io,http://localhost:8080,http://127.0.0.1:8080' });

const cuentas = crearCuentas(admin.auth(), () => API_KEY.value(), () => SITIO.value());

const logica = crearLogica({ db: admin.firestore(), cuentas });

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
