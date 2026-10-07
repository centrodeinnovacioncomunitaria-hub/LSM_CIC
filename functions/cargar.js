// Carga en Firestore los datos PRIVADOS del CIC y, si se pide, invita al equipo por correo.
// Se ejecuta en el computador de la Secretaría (no se publica). Necesita la llave de la cuenta de servicio
// (Firebase → Configuración del proyecto → Cuentas de servicio → Generar nueva clave privada),
// guardada en privado_NO_SUBIR. Ver CONFIGURAR_FIREBASE.md.
//
// Uso (desde la carpeta functions, después de «npm install»):
//   node cargar.js --llave ../../privado_NO_SUBIR/llave-firebase.json --directorio ../../privado_NO_SUBIR/directorio.json
//   node cargar.js --llave ... --preguntas ../../privado_NO_SUBIR/banco_preguntas.json
//   node cargar.js --llave ... --material ../../privado_NO_SUBIR/material.json
//   node cargar.js --llave ... --invitar            (envía a cada persona del equipo el enlace para crear su contraseña)
//   node cargar.js --llave ... --invitar 12345678   (solo a esa cédula)
// Se pueden combinar. Volver a cargar reemplaza los datos (no duplica).
'use strict';

const fs = require('fs');
const path = require('path');
const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
const { crearLogica } = require('./logica');
const { crearCuentas } = require('./cuentas');

const args = process.argv.slice(2);
const opcion = (n) => { const i = args.indexOf(`--${n}`); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const llave = opcion('llave');
if (!llave || llave === true) {
  console.error('Falta --llave <archivo .json de la cuenta de servicio>. Ver CONFIGURAR_FIREBASE.md.');
  process.exit(1);
}
const leerJSON = (f) => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
initializeApp({ credential: cert(leerJSON(llave)) });
const db = getFirestore();

// Clave web y dirección de la página: las mismas de functions/.env
const env = Object.fromEntries((fs.existsSync(path.join(__dirname, '.env')) ? fs.readFileSync(path.join(__dirname, '.env'), 'utf8') : '')
  .split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));

async function escribirLotes(coleccion, filas) {
  for (let i = 0; i < filas.length; i += 400) {
    const lote = db.batch();
    for (const [id, datos] of filas.slice(i, i + 400)) lote.set(db.collection(coleccion).doc(id), datos);
    await lote.commit();
  }
}
async function vaciar(coleccion) {
  const docs = (await db.collection(coleccion).get()).docs;
  for (let i = 0; i < docs.length; i += 400) {
    const lote = db.batch();
    docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
    await lote.commit();
  }
}

(async () => {
  const dir = opcion('directorio');
  if (dir) {
    const personas = leerJSON(dir);
    const malas = personas.filter((p) => !/^\d{5,12}$/.test(p.cedula || '') || !['secretaria', 'dinamizadora'].includes(p.rol));
    if (malas.length) throw new Error(`Hay ${malas.length} personas sin cédula válida o sin rol (secretaria / dinamizadora).`);
    await escribirLotes('directorio', personas.map(({ cedula, ...p }) => [cedula, p]));
    // A quien ya tiene cuenta se le actualizan rol, cargo y satélite (sin tocar su contraseña)
    for (const p of personas) {
      const cuentas = (await db.collection('perfiles').where('cedula', '==', p.cedula).get()).docs;
      for (const c of cuentas) await c.ref.update({ rol: p.rol, cargo: p.cargo || null, departamento: p.departamento || null, satelite: p.satelite || null });
    }
    console.log(`Directorio: ${personas.length} personas cargadas.`);
  }

  const preguntas = opcion('preguntas');
  if (preguntas) {
    const banco = leerJSON(preguntas);
    const malas = banco.filter((q) => !q.curso || !q.unidad || !Array.isArray(q.opciones) || !(q.correcta >= 0 && q.correcta < q.opciones.length));
    if (malas.length) throw new Error(`Hay ${malas.length} preguntas incompletas.`);
    await vaciar('preguntas');
    await escribirLotes('preguntas', banco.map((q) => [`${q.curso}-${q.unidad}-${q.n}`,
      { curso: q.curso, unidad: q.unidad, n: q.n, enunciado: q.enunciado, opciones: q.opciones, correcta: q.correcta, retro: q.retro || null }]));
    console.log(`Banco de preguntas: ${banco.length} preguntas cargadas.`);
  }

  // material.json: { "gestion_1": [{ "nombre": "Guía del módulo 1", "url": "https://drive.google.com/..." }], ... }
  const material = opcion('material');
  if (material) {
    const m = leerJSON(material);
    await escribirLotes('material', Object.entries(m).map(([id, archivos]) => [id, { archivos }]));
    console.log(`Material: ${Object.keys(m).length} unidades cargadas.`);
  }

  const invitar = opcion('invitar');
  if (invitar) {
    if (!env.CIC_API_KEY) throw new Error('Para invitar, primero pega la clave web en functions/.env (CIC_API_KEY).');
    const cuentas = crearCuentas(getAuth(), () => env.CIC_API_KEY, () => env.CIC_SITIO || 'https://cicredmujeresdelcaribe.org/');
    const logica = crearLogica({ db, cuentas });
    const cedulas = invitar === true ? (await db.collection('directorio').get()).docs.map((d) => d.id) : [String(invitar)];
    let enviados = 0;
    for (const cedula of cedulas) {
      const d = (await db.collection('directorio').doc(cedula).get()).data();
      if (!d) { console.log(`- ${cedula}: no está en el directorio.`); continue; }
      if (!d.correo) { console.log(`- ${d.nombre}: sin correo → genérale un código desde el panel de la Secretaría.`); continue; }
      await db.collection('enlaces').doc(cedula).delete(); // permite reenviar ya
      const r = await logica.atender({ accion: 'solicitar-enlace', cedula }, null);
      if (r.estado === 200) { enviados++; console.log(`- ${d.nombre}: enlace enviado a ${d.correo.replace(/^(.)[^@]*/, '$1***')}.`); }
      else console.log(`- ${d.nombre}: ${r.cuerpo.mensaje}`);
    }
    console.log(`Invitaciones: ${enviados} enviadas.`);
  }

  if (!dir && !preguntas && !material && !invitar) console.log('Nada que hacer: usa --directorio, --preguntas, --material o --invitar.');
  process.exit(0);
})().catch((e) => { console.error('Error:', e.message); process.exit(1); });
