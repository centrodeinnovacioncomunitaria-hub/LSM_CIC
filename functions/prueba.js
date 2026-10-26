// Prueba de la lógica completa sin conexión: Firestore y Authentication simulados en memoria.
// Uso: node prueba.js   (desde la carpeta functions)
'use strict';
const assert = require('assert/strict');
const { crearLogica, CURSOS } = require('./logica');

// ---------- Firestore en memoria (solo lo que usa logica.js) ----------
function firestoreFalso() {
  const datos = new Map(); // "coleccion/id" → objeto
  const copia = (o) => JSON.parse(JSON.stringify(o));
  let n = 0;
  const doc = (c, id) => ({
    id,
    get: async () => { const d = datos.get(`${c}/${id}`); return { exists: !!d, id, data: () => copia(d) }; },
    set: async (d, o = {}) => { datos.set(`${c}/${id}`, o.merge ? { ...(datos.get(`${c}/${id}`) || {}), ...copia(d) } : copia(d)); },
    update: async (d) => { if (!datos.has(`${c}/${id}`)) throw new Error('no existe'); datos.set(`${c}/${id}`, { ...datos.get(`${c}/${id}`), ...copia(d) }); },
    delete: async () => { datos.delete(`${c}/${id}`); },
  });
  const consulta = (c, filtros) => ({
    where: (campo, op, valor) => consulta(c, [...filtros, [campo, valor]]),
    get: async () => {
      const docs = [...datos.entries()].filter(([k]) => k.startsWith(c + '/') && k.split('/').length === 2)
        .map(([k, d]) => ({ id: k.split('/')[1], data: () => copia(d) }))
        .filter((d) => filtros.every(([campo, valor]) => d.data()[campo] === valor));
      return { docs, empty: !docs.length };
    },
  });
  return {
    datos,
    collection: (c) => ({ doc: (id) => doc(c, id || `auto${++n}`), ...consulta(c, []), add: async (d) => { const id = `auto${++n}`; await doc(c, id).set(d); return { id }; } }),
  };
}

// ---------- Authentication en memoria ----------
function cuentasFalsas() {
  const usuarios = new Map(); // uid → { email, clave }
  const enlaces = [];
  let n = 0;
  return {
    usuarios, enlaces,
    crear: async ({ email, clave }) => {
      if ([...usuarios.values()].some((u) => u.email === email)) { const e = new Error('existe'); e.code = 'auth/email-already-exists'; throw e; }
      const uid = `uid${++n}`; usuarios.set(uid, { email, clave }); return uid;
    },
    borrar: async (uid) => usuarios.delete(uid),
    cambiarClave: async (uid, clave) => { usuarios.get(uid).clave = clave; },
    cambiarCorreo: async (uid, email) => { usuarios.get(uid).email = email; },
    verificarToken: async (t) => { if (!usuarios.has(t)) throw new Error('token'); return t; }, // el «token» es el uid
    verificarClave: async (email, clave) => [...usuarios.values()].some((u) => u.email === email && u.clave === clave),
    enviarEnlace: async (email) => { enlaces.push(email); return true; },
    uidPorCorreo: async (email) => ([...usuarios.entries()].find(([, u]) => u.email === email) || [null])[0],
    // Simula que la persona abrió el enlace del correo y creó su contraseña
    abrirEnlace: (email, clave) => { [...usuarios.values()].find((u) => u.email === email).clave = clave; },
    uidDe: (email) => [...usuarios.entries()].find(([, u]) => u.email === email)[0],
  };
}

(async () => {
  let reloj = new Date('2026-10-08T10:00:00Z');
  const avanzar = (min) => { reloj = new Date(reloj.getTime() + min * 60000); };
  const db = firestoreFalso();
  const cuentas = cuentasFalsas();
  const catalogo = { archivos: { 'hacer-1-guia': { archivo: 'guias/hacer-1-guia.pdf', nombre: 'Guía de la semana 1', tipo: 'PDF', publico: 'emprendedoras' }, 'gestion-guia': { archivo: 'material/gestion.pdf', nombre: 'Guía de estudio', tipo: 'PDF', publico: 'equipo' }, 'ser-1-estudio': { archivo: 'material/ser-1.pdf', nombre: 'Estudio SER 1', tipo: 'PDF', publico: 'equipo' } }, material: { gestion_general: ['gestion-guia'], 'facilitar-ser_1': ['ser-1-estudio'] } };
  const enDrive = []; // llamadas al puente de Drive
  let driveCaido = false;
  let nSubidas = 0; // los avisos por correo también pasan por el puente: las subidas se numeran aparte
  const drive = async (c) => { if (driveCaido) throw new Error('sin conexión'); enDrive.push(c); if (c.accion !== 'subir') return { ok: true }; nSubidas++; return { ok: true, id: `drv${nSubidas}`, url: `https://drive.google.com/file/d/drv${nSubidas}/view` }; };
  const { atender } = crearLogica({ db, cuentas, ahora: () => reloj, catalogo, leerArchivo: (r) => Buffer.from('%PDF ' + r), drive });
  const pedir = async (accion, datos = {}, token = null) => atender({ accion, ...datos }, token);
  // Responde un intento con n respuestas correctas (las opciones llegan en orden aleatorio)
  const responder = (q, n) => q.preguntas.map((p, i) => (i < n ? p.opciones.indexOf('bien') : p.opciones.findIndex((o) => o !== 'bien')));
  // Ver un video: un pulso cada 15 s con la lección abierta (así lo hace el navegador)
  const verVideo = async (token, datos, seg, accion = 'pulso-video') => { let r; for (let t = 0; t < seg; t += 15) { avanzar(0.25); r = await ok(accion, datos, token); } return r; };
  const ok = async (accion, datos, token) => { const r = await pedir(accion, datos, token); assert.equal(r.estado, 200, `${accion}: ${JSON.stringify(r.cuerpo)}`); return r.cuerpo; };
  const falla = async (accion, datos, token, estado) => { const r = await pedir(accion, datos, token); assert.equal(r.estado, estado, `${accion} debía fallar con ${estado}: ${JSON.stringify(r.cuerpo)}`); return r.cuerpo; };
  let pasos = 0;
  const paso = (t) => { pasos++; console.log(`✓ ${t}`); };

  // Datos: directorio, banco (10 preguntas por unidad, la correcta es la opción 0), material y videos
  const dir = {
    '11111111': { nombre: 'Sara Secretaria Uno', rol: 'secretaria', cargo: 'Dirección técnica', correo: 'sara@correo.co', celular: '3000000001', departamento: 'Magdalena', satelite: null },
    '22222222': { nombre: 'Dina Dinamizadora Dos', rol: 'dinamizadora', cargo: 'Acompañamiento - Magdalena', correo: 'dina@correo.co', celular: '3000000002', departamento: 'Magdalena', satelite: 'magdalena' },
    '33333333': { nombre: 'Sin Correo Tres', rol: 'dinamizadora', cargo: 'Mercados', correo: null, celular: '3000000003', departamento: 'Sucre', satelite: 'sucre' },
  };
  for (const [c, d] of Object.entries(dir)) await db.collection('directorio').doc(c).set(d);
  for (const [curso, def] of Object.entries(CURSOS)) {
    if (!def.cuestionario) continue;
    for (let u = 1; u <= def.unidades; u++) for (let n = 1; n <= 10; n++) await db.collection('preguntas').doc(`${curso}-${u}-${n}`).set({ curso, unidad: u, n, enunciado: `P${n}`, opciones: ['bien', 'mal1', 'mal2', 'mal3'], correcta: 0, retro: 'Justificación oficial.' });
  }
  for (const curso of Object.keys(CURSOS)) for (let u = 1; u <= 6; u++) await db.collection('material').doc(`${curso}_${u}`).set({ archivos: [{ nombre: `Guía ${u}`, url: 'https://drive.google.com/x' }] });
  await db.collection('videos').doc('GES-M1').set({ codigo: 'GES-M1', titulo: 'Módulo 1', drive_id: 'abcdefghijklmnopqrstuvwxyz', audiencia: 'equipo', curso: 'gestion', unidad: 1 });

  // ---------- Activación con enlace al correo ----------
  const r1 = await ok('solicitar-enlace', { cedula: '22222222' });
  assert.match(r1.mensaje, /enlace/);
  assert.equal(r1.enviado, true);
  assert.equal(r1.correo, 'din***@correo.co', 'se muestra a qué correo se envió, oculto en parte');
  assert.deepEqual(cuentas.enlaces, ['dina@correo.co']);
  const r1b = await ok('solicitar-enlace', { cedula: '22222222' });
  assert.equal(cuentas.enlaces.length, 1, 'máximo un enlace cada 2 minutos');
  assert.equal(r1b.reciente, true, 'si pide otro antes de 2 minutos se le avisa');
  const r2 = await ok('solicitar-enlace', { cedula: '99999999' });
  const r3 = await ok('solicitar-enlace', { cedula: '33333333' });
  assert.equal(r2.mensaje, r3.mensaje, 'misma respuesta para cédulas que no existen y para quien no tiene correo');
  assert.equal(cuentas.enlaces.length, 1, 'sin correo no se envía nada');
  const envios = [...db.datos.entries()].filter(([k]) => k.startsWith('envios_correo/')).map(([, v]) => v);
  assert.deepEqual(envios.map((x) => x.estado), ['enviado', 'omitido', 'omitido', 'omitido'], 'cada intento queda registrado');
  const enviarAntes = cuentas.enviarEnlace;
  cuentas.enviarEnlace = async () => { throw new Error('QUOTA_EXCEEDED'); };
  avanzar(3);
  const r4 = await ok('solicitar-enlace', { cedula: '22222222' });
  assert.equal(r4.enviado, false);
  const fallo = [...db.datos.entries()].filter(([k]) => k.startsWith('envios_correo/')).map(([, v]) => v).pop();
  assert.equal(fallo.estado, 'fallido'); assert.equal(fallo.error, 'QUOTA_EXCEEDED', 'se guarda el motivo que da Google');
  cuentas.enviarEnlace = enviarAntes;
  avanzar(3);
  await ok('solicitar-enlace', { cedula: '22222222' });
  assert.equal(cuentas.enlaces.length, 2);
  paso('Activación: el enlace llega solo a quien tiene correo; se muestra a cuál se envió y cada intento queda registrado');

  const sinActivar = await falla('ingresar', { cedula: '33333333', clave: 'cualquiera1', rol: 'dinamizadora' }, null, 401);
  assert.match(sinActivar.mensaje, /Activar mi cuenta/, 'quien está en el directorio sin cuenta: se le dice que la active');
  assert.match((await falla('ingresar', { cedula: '98989898', clave: 'cualquiera1', rol: 'dinamizadora' }, null, 401)).mensaje, /no está registrada/);
  assert.match((await falla('ingresar', { cedula: '98989899', clave: 'cualquiera1', rol: 'emprendedora' }, null, 401)).mensaje, /Inscribirme/);
  const claveMala = await falla('ingresar', { cedula: '22222222', clave: 'cualquiera1', rol: 'dinamizadora' }, null, 401);
  assert.match(claveMala.mensaje, /contraseña no es correcta/); assert.equal(claveMala.quedan, 4);
  assert.match(claveMala.mensaje, /quedan 4 intentos/);
  cuentas.abrirEnlace('dina@correo.co', 'DinaClave2026');
  const dina = await ok('ingresar', { cedula: '22222222', clave: 'DinaClave2026', rol: 'dinamizadora' });
  assert.equal(dina.cuenta, 'dina@correo.co');
  assert.equal(dina.perfil.rol, 'dinamizadora');
  assert.equal(dina.perfil.cuenta_email, undefined, 'el perfil público no expone la cuenta interna');
  const tDina = dina.perfil.id;
  const rolMal = await falla('ingresar', { cedula: '22222222', clave: 'DinaClave2026', rol: 'secretaria' }, null, 403);
  assert.equal(rolMal.rol, 'dinamizadora');
  paso('Ingreso con cédula y contraseña; avisa el perfil correcto solo con la contraseña buena');

  avanzar(16);
  for (let i = 0; i < 5; i++) await falla('ingresar', { cedula: '22222222', clave: 'mala-clave', rol: 'dinamizadora' }, null, 401);
  await falla('ingresar', { cedula: '22222222', clave: 'DinaClave2026', rol: 'dinamizadora' }, null, 429);
  avanzar(16);
  await ok('ingresar', { cedula: '22222222', clave: 'DinaClave2026', rol: 'dinamizadora' });
  paso('5 intentos fallidos bloquean 15 minutos');

  // ---------- Secretaría ----------
  await ok('solicitar-enlace', { cedula: '11111111' });
  cuentas.abrirEnlace('sara@correo.co', 'SaraClave2026');
  const tSara = (await ok('ingresar', { cedula: '11111111', clave: 'SaraClave2026', rol: 'secretaria' })).perfil.id;

  // Código de la Secretaría para quien no tiene correo
  await falla('generar-codigo', { cedula: '33333333' }, tDina, 403);
  const cod = await ok('generar-codigo', { cedula: '33333333' }, tSara);
  assert.match(cod.codigo, /^\d{6}$/);
  await falla('activar', { cedula: '33333333', codigo: '000000', clave: 'TresClave2026' }, null, 400);
  const tres = await ok('activar', { cedula: '33333333', codigo: cod.codigo, clave: 'TresClave2026' });
  assert.match(tres.cuenta, /@cuentas\.cic\.invalid$/);
  await falla('activar', { cedula: '33333333', codigo: cod.codigo, clave: 'TresClave2026' }, null, 400);
  paso('Quien no tiene correo activa su cuenta con el código de la Secretaría (sirve una sola vez)');

  // ---------- Emprendedoras ----------
  const base = { nombre: 'Rosa Emprendedora', celular: '3001234567', municipio: 'Santa Marta', clave: 'RosaClave2026', acepto: true };
  await falla('registro', { ...base, cedula: '22222222' }, null, 409);
  const rosa = await ok('registro', { ...base, cedula: '44444444' });
  assert.equal(rosa.perfil.satelite, 'magdalena');
  await falla('registro', { ...base, cedula: '44444444' }, null, 409);
  await ok('registro', { ...base, cedula: '55555555', nombre: 'Luz Barranquilla', municipio: 'Baranoa', correo: 'luz@correo.co' });
  const tRosa = rosa.perfil.id;
  await falla('mi-progreso', {}, tRosa, 403);
  const dinaDeRosa = await ok('mi-dinamizadora', {}, tRosa);
  assert.equal(dinaDeRosa.dinamizadora.nombre, 'Dina Dinamizadora Dos');
  paso('Emprendedoras: inscripción, sin acceso a cursos, ven a su dinamizadora');

  const vistas = await ok('perfiles', {}, tDina);
  assert.deepEqual(vistas.perfiles.map((p) => p.cedula), ['44444444'], 'la dinamizadora solo ve emprendedoras de su departamento');
  assert.equal((await ok('perfiles', {}, tSara)).perfiles.length, 5);
  await ok('fijar-semana', { cedula: '44444444', semana: 3 }, tDina);
  await falla('fijar-semana', { cedula: '55555555', semana: 3 }, tDina, 404);
  assert.equal((await ok('mi-perfil', {}, tRosa)).perfil.semana_actual, 3);
  const cod2 = await ok('generar-codigo', { cedula: '44444444' }, tDina);
  await ok('activar', { cedula: '44444444', codigo: cod2.codigo, clave: 'RosaNueva2026' });
  await ok('ingresar', { cedula: '44444444', clave: 'RosaNueva2026', rol: 'emprendedora' });
  paso('Seguimiento: la dinamizadora ve y mueve la semana de sus emprendedoras y les genera código');

  // ---------- Curso de Gestión con desbloqueo ----------
  let p = await ok('mi-progreso', {}, tDina);
  assert.deepEqual(Object.keys(p.cursos), ['gestion', 'acompanar-hacer', 'facilitar-ser'], 'la dinamizadora no ve la formación de la Secretaría');
  assert.equal(p.cursos.gestion[0].estado, 'bloqueada');
  await falla('material', { curso: 'gestion', unidad: 1 }, tDina, 403);
  p = await ok('hito', { hito: 'compromiso' }, tDina);
  assert.equal(p.cursos.gestion[0].estado, 'disponible');
  await falla('cuestionario', { curso: 'gestion', unidad: 1 }, tDina, 403);
  // Ver el material sin marcarlo (la lección lo muestra) no cuenta como repasado
  assert.equal((await ok('material', { curso: 'gestion', unidad: 1, marcar: false }, tDina)).archivos.length, 1); // solo la guía en PDF: el enlace cargado al inicio queda reemplazado
  assert.equal((await ok('mi-progreso', {}, tDina)).cursos.gestion[0].material_visto, false);
  assert.equal((await ok('material', { curso: 'gestion', unidad: 1 }, tDina)).archivos.length, 1);
  await falla('cuestionario', { curso: 'gestion', unidad: 1 }, tDina, 403); // falta el video
  // El video se ve completo: solo cuenta el tiempo con la lección abierta (pulsos); sin duración cargada, 10 minutos
  await falla('marcar', { curso: 'gestion', unidad: 1, que: 'video' }, tDina, 400);
  p = await ok('iniciar-video', { curso: 'gestion', unidad: 1 }, tDina);
  assert.equal(p.cursos.gestion[0].video_faltan, 600);
  avanzar(30); // dejar la página cerrada no cuenta
  assert.equal((await falla('marcar', { curso: 'gestion', unidad: 1, que: 'video' }, tDina, 400)).faltan, 600);
  assert.equal((await ok('pulso-video', { curso: 'gestion', unidad: 1 }, tDina)).faltan, 560, 'tras una ausencia el pulso suma como máximo 40 s');
  assert.equal((await ok('pulso-video', { curso: 'gestion', unidad: 1, reanudar: true }, tDina)).faltan, 560, 'al reanudar no se suma el tiempo fuera');
  const mitad = await verVideo(tDina, { curso: 'gestion', unidad: 1 }, 270);
  assert.equal(mitad.faltan, 290);
  assert.equal((await falla('marcar', { curso: 'gestion', unidad: 1, que: 'video' }, tDina, 400)).faltan, 290);
  await verVideo(tDina, { curso: 'gestion', unidad: 1 }, 290);
  await ok('marcar', { curso: 'gestion', unidad: 1, que: 'video' }, tDina);
  // Pierde los dos intentos → pausa → repasa video y material → segunda ronda
  for (let i = 0; i < 2; i++) {
    const q = await ok('cuestionario', { curso: 'gestion', unidad: 1 }, tDina);
    assert.equal(q.preguntas.length, 10);
    assert.equal(q.preguntas[0].correcta, undefined, 'no se envía la respuesta correcta');
    const r = await ok('responder', { id: q.id, respuestas: responder(q, 5) }, tDina); // 5 de 10: no aprueba
    assert.equal(r.aprobado, false);
    assert.equal(r.detalle.filter((d) => d.retro).length, 5);
    assert.ok(r.detalle.every((d) => d.retro !== 'Justificación oficial.'), 'al fallar no se muestra la justificación');
  }
  p = await ok('mi-progreso', {}, tDina);
  assert.equal(p.cursos.gestion[0].estado, 'pausada');
  await falla('cuestionario', { curso: 'gestion', unidad: 1 }, tDina, 403);
  avanzar(1);
  p = await ok('mi-progreso', {}, tDina);
  assert.equal(p.cursos.gestion[0].video_visto, false, 'tras la pausa hay que volver a ver el video');
  await falla('marcar', { curso: 'gestion', unidad: 1, que: 'video' }, tDina, 400);
  assert.equal((await ok('iniciar-video', { curso: 'gestion', unidad: 1 }, tDina)).cursos.gestion[0].video_faltan, 600, 'tras la pausa el conteo empieza de cero');
  await verVideo(tDina, { curso: 'gestion', unidad: 1 }, 600);
  await ok('marcar', { curso: 'gestion', unidad: 1, que: 'video' }, tDina);
  p = await ok('marcar', { curso: 'gestion', unidad: 1, que: 'material' }, tDina);
  assert.equal(p.cursos.gestion[0].estado, 'en-curso');
  assert.equal(p.cursos.gestion[0].ronda, 2);
  // Sus respuestas: ve qué eligió y qué falló; la respuesta correcta aparece solo cuando apruebe
  let res = await ok('mis-resultados', { curso: 'gestion', unidad: 1 }, tDina);
  assert.equal(res.intentos.length, 2); assert.equal(res.aprobada, false);
  assert.equal(res.intentos[0].preguntas.length, 10);
  assert.equal(res.intentos[0].preguntas.filter((x) => !x.bien).length, 5, 've cuáles falló');
  assert.ok(res.intentos[0].preguntas.every((x) => x.respuesta && x.correcta === null && x.justificacion === null), 'antes de aprobar no se muestra la respuesta correcta');
  await falla('mis-resultados', { curso: 'gestion', unidad: 1 }, tRosa, 403);
  paso('Cuestionario: 5 preguntas sin respuesta, 2 intentos, pausa hasta repasar video y material');

  const q = await ok('cuestionario', { curso: 'gestion', unidad: 1 }, tDina);
  const bien = await ok('responder', { id: q.id, respuestas: responder(q, 7) }, tDina);
  assert.equal(bien.nota, 7);
  assert.ok(bien.detalle.filter((d) => !d.bien).every((d) => d.retro === 'Justificación oficial.'), 'al aprobar se muestra la justificación');
  assert.equal(bien.aprobado, true);
  res = await ok('mis-resultados', { curso: 'gestion', unidad: 1 }, tDina);
  assert.equal(res.aprobada, true); assert.equal(res.intentos.length, 3); assert.equal(res.intentos[0].nota, 7);
  assert.ok(res.intentos[0].preguntas.filter((x) => !x.bien).every((x) => x.correcta === 'bien' && x.justificacion), 'al aprobar ve la respuesta correcta y la justificación');
  await falla('responder', { id: q.id, respuestas: responder(q, 10) }, tDina, 409);
  assert.equal(bien.progreso.cursos.gestion[1].estado, 'bloqueada', 'falta la actividad de la unidad 1');
  await falla('entregar', { curso: 'gestion', unidad: 1, texto: 'corto' }, tDina, 400);
  p = (await ok('entregar', { curso: 'gestion', unidad: 1, texto: 'Mi actividad del módulo 1 con suficiente detalle.' }, tDina)).progreso;
  assert.equal(p.cursos.gestion[1].estado, 'disponible');
  paso('Aprueba con 4 de 5; la siguiente unidad se abre al enviar la actividad');

  const q2 = await ok('cuestionario', { curso: 'gestion', unidad: 2 }, tDina).catch((e) => e);
  assert.ok(q2 instanceof Error || q2.preguntas === undefined, 'sin material no hay cuestionario');
  async function completar(token, curso, u) {
    await ok('material', { curso, unidad: u }, token);
    if (CURSOS[curso].cuestionario) {
      const c = await ok('cuestionario', { curso, unidad: u }, token);
      assert.equal((await ok('responder', { id: c.id, respuestas: responder(c, 10) }, token)).aprobado, true);
    }
    if ((CURSOS[curso].sin_actividad || []).includes(u)) return { constancia: (await ok('mi-progreso', {}, token)).constancias.find((c) => c.curso === curso) };
    return ok('entregar', { curso, unidad: u, texto: 'Evidencia de la unidad con suficiente detalle.' }, token);
  }
  let fin;
  for (let u = 2; u <= 4; u++) fin = await completar(tDina, 'gestion', u);
  assert.match(fin.constancia.codigo, /^CIC-GESM-[A-Z0-9]{6}$/);
  p = await ok('mi-progreso', {}, tDina);
  assert.equal(p.cursos.gestion[3].sin_actividad, true, 'el módulo 4 de Gestión no tiene actividad');
  await falla('entregar', { curso: 'gestion', unidad: 4, texto: 'Intento de actividad en el módulo 4 que ya no existe.' }, tDina, 400);
  const foroM1 = await ok('foro-tema', { id: 'modulo_gestion_1' }, tDina);
  assert.equal(foroM1.tema.categoria, 'equipo');
  assert.equal(foroM1.respuestas.length, 1, 'la actividad del módulo queda publicada en el foro');
  assert.equal(foroM1.respuestas[0].texto, 'Mi actividad del módulo 1 con suficiente detalle.');
  assert.equal((await ok('foro-modulo', { curso: 'gestion', unidad: 2 }, tDina)).respuestas.length, 1);
  const ver = await ok('verificar', { codigo: fin.constancia.codigo });
  assert.deepEqual([ver.valida, ver.iniciales], [true, 'D. D. D.']);
  assert.equal((await ok('verificar', { codigo: 'CIC-GESM-XXXXXX' })).valida, false);
  paso('Constancia al terminar Gestión, verificable en público solo con iniciales');

  p = await ok('mi-progreso', {}, tDina);
  assert.equal(p.cursos['acompanar-hacer'][0].estado, 'disponible');
  assert.equal(p.cursos['facilitar-ser'][0].estado, 'disponible');
  // Completó Gestión pero el certificado no quedó emitido (cambio de reglas a mitad de camino): se emite al entrar
  for (const d of (await db.collection('constancias').where('persona', '==', tDina).get()).docs) await db.collection('constancias').doc(d.id).delete();
  p = await ok('mi-progreso', {}, tDina);
  assert.ok(p.constancias.some((c) => c.curso === 'gestion'), 'el certificado pendiente se emite solo');
  assert.equal(p.cursos['acompanar-hacer'][0].estado, 'disponible', 'y se abren las rutas');
  paso('Dinamizadora: al aprobar Gestión se abren solas las rutas HACER y SER');

  // ---------- Secretaría: su formación sin cuestionario y luego las rutas ----------
  await ok('hito', { hito: 'compromiso' }, tSara);
  p = await ok('mi-progreso', {}, tSara);
  assert.deepEqual(Object.keys(p.cursos), ['gestion', 'acompanar-hacer', 'facilitar-ser'], 'ya no existe el curso de Formación de la Secretaría');
  for (let u = 1; u <= 4; u++) {
    await ok('material', { curso: 'gestion', unidad: u }, tSara);
    if (u === 1) { await ok('iniciar-video', { curso: 'gestion', unidad: 1 }, tSara); await verVideo(tSara, { curso: 'gestion', unidad: 1 }, 600); await ok('marcar', { curso: 'gestion', unidad: 1, que: 'video' }, tSara); }
    else await falla('marcar', { curso: 'gestion', unidad: u, que: 'video' }, tSara, 400); // sin video
    const c = await ok('cuestionario', { curso: 'gestion', unidad: u }, tSara);
    await ok('responder', { id: c.id, respuestas: responder(c, 10) }, tSara);
    if (u < 4) {
      if (u === 2) { // responder en la conversación del módulo desde el foro también cuenta como la actividad
        avanzar(1);
        await ok('foro-responder', { id: 'modulo_gestion_2', texto: 'Mi aporte del módulo 2 escrito directamente en el foro.' }, tSara);
      } else await ok('entregar', { curso: 'gestion', unidad: u, texto: 'Evidencia de la unidad con suficiente detalle.' }, tSara);
    }
  }
  p = await ok('mi-progreso', {}, tSara);
  assert.equal(p.cursos.gestion[1].evidencia.tipo, 'foro');
  assert.ok(p.constancias.some((c) => c.curso === 'gestion'));
  assert.equal(p.cursos['acompanar-hacer'][0].estado, 'disponible');
  assert.equal(p.cursos['facilitar-ser'][0].estado, 'disponible');
  await falla('entregar', { curso: 'formacion-secretaria', unidad: 1, texto: 'El curso de formación ya no existe en la plataforma.' }, tSara, 400);
  const mt = await ok('material-transferencia', {}, tSara);
  assert.equal(mt.unidades.length, 6); assert.equal(mt.unidades[0].titulo, 'Método Insight');
  await falla('material-transferencia', {}, tDina, 403);
  paso('Secretaría: Gestión → HACER y SER (sin curso de Formación); el material de transferencia va aparte');

  // ---------- Panel de la Secretaría ----------
  await falla('equipo', {}, tDina, 403);
  const eq = await ok('equipo', {}, tSara);
  assert.equal(eq.personas.length, 3);
  assert.equal(eq.personas.find((x) => x.cedula === '22222222').avance.gestion, 4);
  assert.ok(eq.pendientes.length >= 5);
  assert.equal(typeof eq.pendientes[0].id, 'string', 'los id de las evidencias son texto (antes la página los convertía a número)');
  await falla('revisar', { id: eq.pendientes[0].id, estado: 'devuelta', comentario: '' }, tSara, 400);
  await ok('revisar', { id: eq.pendientes[0].id, estado: 'devuelta', comentario: 'Agrega la foto de la sesión.' }, tSara);
  await falla('revisar', { id: eq.pendientes[1].id, estado: 'aprobada' }, tDina, 403);
  paso('Panel de la Secretaría: avance del equipo y revisión de evidencias');

  // ---------- Videos ----------
  // Solo la administradora (rol aparte) publica videos y material; la Secretaría ya no.
  const tAdmin = await cuentas.crear({ email: 'admin@correo.co', clave: 'AdminClave2026', nombre: 'Administración' });
  await db.collection('perfiles').doc(tAdmin).set({ cedula: 'admin', nombre: 'Administración', rol: 'administradora', cuenta_email: 'admin@correo.co' });
  await falla('guardar-video', { video: { codigo: 'GES-M2', youtube_id: 'abcdefghijk' } }, tDina, 403);
  await falla('guardar-video', { video: { codigo: 'GES-M2', youtube_id: 'abcdefghijk' } }, tSara, 403);
  await falla('guardar-video', { video: { codigo: 'GES-M2', youtube_id: 'abcdefghijk' } }, tAdmin, 400); // sin duración no se publica
  await falla('admin-contenido', {}, tSara, 403);
  const gv = await ok('guardar-video', { video: { codigo: 'GES-M2', titulo: 'Módulo 2', url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view?usp=sharing', duracion_min: 20, audiencia: 'equipo', curso: 'gestion', unidad: 2 } }, tAdmin);
  assert.equal(gv.video.drive_id, '1AbCdEfGhIjKlMnOpQrStUvWxYz012345');
  await ok('guardar-video', { video: { codigo: 'GRAB-SER2-MAG-20261015', titulo: 'Taller 2', drive_id: 'abcdefghijklmnopqrstuvwxyz', audiencia: 'emprendedoras', curso: 'grabaciones', unidad: 2, satelite: 'magdalena' } }, tAdmin);
  await falla('admin-guardar-material', { curso: 'gestion', unidad: 2, archivos: [{ nombre: 'Guía', url: 'http://no-seguro' }] }, tAdmin, 400);
  await ok('admin-guardar-material', { curso: 'gestion', unidad: 2, archivos: [{ nombre: 'Guía del módulo 2', url: 'https://drive.google.com/file/d/x/view' }] }, tAdmin);
  const ac = await ok('admin-contenido', {}, tAdmin);
  assert.equal(ac.cursos.gestion.unidades[1].video.duracion_min, 20);
  assert.equal(ac.cursos.gestion.unidades[1].material[0].nombre, 'Guía del módulo 2');
  assert.equal(ac.cursos.gestion.unidades[0].preguntas, 10);
  assert.equal(ac.grabaciones.length, 1);
  assert.equal((await ok('mi-progreso', {}, tDina)).cursos.gestion[1].video_segundos, 1200, 'el video completo: 20 minutos');
  assert.equal((await ok('videos', {}, tDina)).videos.length, 3);
  assert.deepEqual((await ok('videos', {}, tRosa)).videos.map((v) => v.codigo), ['GRAB-SER2-MAG-20261015']);
  await falla('quitar-video', { codigo: 'GES-M2' }, tSara, 403);
  await ok('quitar-video', { codigo: 'GES-M2' }, tAdmin);
  paso('Administradora: publica videos (Drive o YouTube) y material; la Secretaría ya no; cada quien ve solo los suyos');

  // ---------- Foro ----------
  await falla('foro-temas', {}, null, 401);
  await falla('foro-publicar', { categoria: 'hacer', titulo: 'Corto', texto: 'Hola' }, tRosa, 400);
  const tema = await ok('foro-publicar', { categoria: 'hacer', titulo: '¿Cómo registran las ventas fiadas?', texto: 'En mi tienda fío mucho y no sé cómo anotarlo en el registro diario.' }, tRosa);
  await falla('foro-publicar', { categoria: 'general', titulo: 'Otra pregunta seguida', texto: 'Publicando muy rápido otra vez.' }, tRosa, 429);
  await falla('foro-publicar', { categoria: 'equipo', titulo: 'Tema del equipo solamente', texto: 'Una emprendedora no puede abrir aquí.' }, tRosa, 400);
  avanzar(1);
  const conv = await ok('foro-responder', { id: tema.id, texto: 'Anótalas aparte y súmalas cuando te paguen.' }, tDina);
  assert.equal(conv.respuestas.length, 1);
  assert.equal(conv.respuestas[0].autor, 'Dina D.');
  assert.equal(conv.respuestas[0].autor_rol, 'Dinamizadora (o dinamizador)');
  await ok('foro-publicar', { categoria: 'equipo', titulo: 'Reunión de la Secretaría con el equipo', texto: 'Recordatorio de la reunión del viernes.' }, tSara);
  assert.equal((await ok('foro-temas', {}, tRosa)).temas.length, 1, 'la emprendedora no ve los temas del equipo');
  assert.equal((await ok('foro-temas', {}, tDina)).temas.filter((t) => !t.id.startsWith('modulo_')).length, 2);
  assert.equal((await ok('foro-temas', { categoria: 'hacer' }, tDina)).temas[0].respuestas, 1);
  await falla('foro-borrar', { tipo: 'tema', id: tema.id }, tDina, 403);
  await ok('foro-fijar', { id: tema.id, fijado: true }, tSara);
  assert.equal((await ok('foro-temas', {}, tDina)).temas[0].fijado, true);
  await ok('foro-borrar', { tipo: 'respuesta', id: conv.respuestas[0].id }, tSara);
  assert.equal((await ok('foro-tema', { id: tema.id }, tRosa)).respuestas.length, 0);
  await ok('foro-borrar', { tipo: 'tema', id: tema.id }, tRosa);
  await falla('foro-tema', { id: tema.id }, tRosa, 404);
  paso('Foro: solo con cuenta; temas del equipo ocultos a emprendedoras; límite de publicación; moderación');

  // ---------- Guías en PDF y material con permiso ----------
  await falla('guia', { id: 'hacer-1-guia' }, null, 401);
  const g = await ok('guia', { id: 'hacer-1-guia' }, tRosa);
  assert.equal(Buffer.from(g.base64, 'base64').toString(), '%PDF guias/hacer-1-guia.pdf');
  assert.match(g.archivo, /\.pdf$/);
  await falla('guia', { id: 'gestion-guia' }, tRosa, 404); // el material del equipo no se entrega como guía
  const lista = await ok('material', { curso: 'gestion', unidad: 1, marcar: false }, tDina);
  assert.ok(lista.archivos.some((a) => a.id === 'gestion-guia' && a.tipo === 'PDF'));
  await ok('archivo-material', { curso: 'gestion', unidad: 1, id: 'gestion-guia' }, tDina);
  await falla('archivo-material', { curso: 'gestion', unidad: 1, id: 'ser-1-estudio' }, tDina, 404);
  await falla('archivo-material', { curso: 'gestion', unidad: 1, id: 'gestion-guia' }, tRosa, 403);
  paso('Guías en PDF solo con cuenta; material del equipo solo con la unidad abierta');

  // ---------- Video de bienvenida obligatorio antes de Gestión ----------
  const tTres0 = cuentas.uidDe(tres.cuenta);
  await falla('bienvenida', { paso: 'iniciar' }, tTres0, 400); // todavía no hay video
  await ok('guardar-video', { video: { codigo: 'BIENVENIDA', titulo: 'Bienvenida al CIC', url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view', duracion_min: 5, audiencia: 'equipo', curso: 'bienvenida', unidad: 1 } }, tAdmin);
  await ok('hito', { hito: 'compromiso' }, tTres0);
  p = await ok('mi-progreso', {}, tTres0);
  assert.equal(p.bienvenida.requerida, true);
  assert.match(p.cursos.gestion[0].motivo, /bienvenida/);
  await falla('bienvenida', { paso: 'completar' }, tTres0, 400);
  await ok('bienvenida', { paso: 'iniciar' }, tTres0);
  avanzar(5);
  await falla('bienvenida', { paso: 'completar' }, tTres0, 400); // pasó el tiempo pero sin ver el video
  await verVideo(tTres0, { paso: 'pulso' }, 240, 'bienvenida');
  await falla('bienvenida', { paso: 'completar' }, tTres0, 400); // 5 min de video: aún falta
  await verVideo(tTres0, { paso: 'pulso' }, 60, 'bienvenida');
  p = await ok('bienvenida', { paso: 'completar' }, tTres0);
  assert.equal(p.bienvenida.hecha, true);
  assert.equal(p.cursos.gestion[0].estado, 'disponible');
  await falla('bienvenida', { paso: 'iniciar' }, tRosa, 403);
  paso('Video de bienvenida obligatorio (con tiempo mínimo) antes del curso Gestión del CIC');

  // ---------- Emprendimientos: asignación y seguimiento ----------
  await falla('emprendimientos', {}, tDina, 403);
  let em = await ok('emprendimientos', {}, tSara);
  assert.ok(em.dinamizadoras.some((d) => d.cedula === '22222222' && d.satelite === 'magdalena'), 'lista las dinamizadoras del directorio, aunque no hayan ingresado');
  assert.equal(em.emprendimientos.find((x) => x.cedula === '44444444').dinamizadora, null);
  await falla('asignar', { cedulas: ['44444444'], dinamizadora: '22222222' }, tDina, 403);
  await falla('asignar', { cedulas: ['55555555'], dinamizadora: '22222222' }, tSara, 400); // Luz es de Atlántico
  const asg = await ok('asignar', { cedulas: ['44444444'], dinamizadora: '22222222' }, tSara);
  assert.equal(asg.asignados, 1);
  em = await ok('emprendimientos', {}, tSara);
  assert.equal(em.emprendimientos.find((x) => x.cedula === '44444444').dinamizadora_nombre, 'Dina Dinamizadora Dos');
  let mis = await ok('mis-emprendimientos', {}, tDina);
  assert.deepEqual(mis.emprendimientos.map((x) => x.cedula), ['44444444']);
  await falla('mis-emprendimientos', {}, tSara, 403);
  await falla('seguimiento', { cedula: '55555555' }, tDina, 403); // no asignada a ella
  await falla('seguimiento', { cedula: '44444444' }, tRosa, 403);
  let sg = await ok('seguimiento', { cedula: '44444444' }, tDina);
  assert.equal(sg.actividades.length, 10);
  assert.deepEqual(sg.actividades[0].herramientas, ['A1', 'A2', 'A3']);
  assert.equal(sg.actividades[0].requeridos[1].nombre, 'Herramientas A1, A2, A3 diligenciadas');
  const act = { cedula: '44444444', ruta: 'hacer', n: 1 };
  await falla('subir-documento', { ...act, tipo: 'acta', mime: 'image/jpeg', base64: 'AAAA' }, tDina, 400); // aún sin chulear
  await falla('marcar-actividad', { ...act, ejecutada: 'si' }, tDina, 400);
  sg = await ok('marcar-actividad', { ...act, ejecutada: true, fecha: '2026-10-08' }, tDina);
  assert.equal(sg.actividades[0].ejecutada, true);
  await falla('subir-documento', { ...act, tipo: 'acta', mime: 'text/plain', base64: 'AAAA' }, tDina, 400);
  await falla('subir-documento', { ...act, tipo: 'otro', mime: 'image/jpeg', base64: 'AAAA' }, tDina, 400);
  const grande = Buffer.alloc(2 * 1024 * 1024, 7).toString('base64'); // 2 MB → varias partes
  sg = await ok('subir-documento', { ...act, tipo: 'acta', mime: 'application/pdf', nombre: 'acta semana 1.pdf', base64: grande }, tDina);
  assert.equal(sg.actividades[0].documentos.acta[0].bytes, 2 * 1024 * 1024);
  assert.equal(sg.actividades[0].requeridos[0].nombre, 'Documentos de la sesión');
  assert.equal(sg.avance.con_documentos, 0, 'falta la herramienta');
  const doc = await ok('ver-documento', { ...act, tipo: 'acta' }, tSara);
  assert.equal(doc.base64, grande, 'la Secretaría descarga el archivo completo, armado desde sus partes');
  await ok('subir-documento', { ...act, tipo: 'acta', clave: 'acta', mime: 'image/png', nombre: 'acta.png', base64: 'iVBORw0KGgo=' }, tDina); // reemplaza el primero
  assert.ok(!db.datos.has('documentos/' + tRosa + '_hacer_1_acta_1'), 'al reemplazar, se borran las partes sobrantes');
  sg = await ok('subir-documento', { ...act, tipo: 'herramienta', mime: 'image/jpeg', nombre: 'a1.jpg', base64: '/9j/4AAQ' }, tDina);
  assert.equal(sg.avance.con_documentos, 1);
  const muy = Buffer.alloc(5 * 1024 * 1024 + 10, 1).toString('base64');
  await falla('subir-documento', { ...act, tipo: 'acta', mime: 'application/pdf', base64: muy }, tDina, 400);
  sg = await ok('marcar-actividad', { cedula: '44444444', ruta: 'ser', n: 2, ejecutada: false, motivo: 'La emprendedora estaba enferma' }, tDina);
  assert.equal(sg.actividades[7].motivo, 'La emprendedora estaba enferma');
  assert.equal(sg.avance.no_ejecutadas, 1);
  sg = await ok('quitar-documento', { ...act, tipo: 'herramienta' }, tDina);
  assert.deepEqual(sg.actividades[0].documentos.herramienta, []);
  // Varios documentos de la sesión, uno por uno: informe, fotos, asistencia…
  sg = await ok('subir-documento', { ...act, tipo: 'acta', mime: 'application/pdf', nombre: 'informe.pdf', base64: 'JVBERi0x' }, tDina);
  sg = await ok('subir-documento', { ...act, tipo: 'acta', mime: 'image/jpeg', nombre: 'fotos.jpg', base64: '/9j/4AAQ' }, tDina);
  assert.deepEqual(sg.actividades[0].documentos.acta.map((d) => d.nombre), ['acta.png', 'informe.pdf', 'fotos.jpg'], 'se suman, no se reemplazan');
  assert.deepEqual(sg.actividades[0].documentos.acta.map((d) => d.clave), ['acta', 'acta_2', 'acta_3']);
  assert.equal((await ok('ver-documento', { ...act, clave: 'acta_2' }, tSara)).nombre, 'informe.pdf');
  sg = await ok('quitar-documento', { ...act, clave: 'acta_2' }, tDina);
  assert.deepEqual(sg.actividades[0].documentos.acta.map((d) => d.nombre), ['acta.png', 'fotos.jpg'], 'se quita solo ese');
  await falla('ver-documento', { ...act, clave: 'acta_2' }, tSara, 404);
  sg = await ok('subir-documento', { ...act, tipo: 'acta', mime: 'application/pdf', nombre: 'asistencia.pdf', base64: 'JVBERi0x' }, tDina);
  assert.equal(sg.actividades[0].documentos.acta.find((d) => d.nombre === 'asistencia.pdf').clave, 'acta_2', 'reutiliza el lugar libre');
  await falla('subir-documento', { ...act, tipo: 'acta', clave: 'acta_9', mime: 'image/png', base64: 'iVBORw0KGgo=' }, tDina, 404);
  em = await ok('emprendimientos', {}, tSara);
  assert.deepEqual(em.emprendimientos.find((x) => x.cedula === '44444444').avance, { total: 10, ejecutadas: 1, no_ejecutadas: 1, con_documentos: 0, por_revisar: 0, aprobadas: 0, devueltas: 0 });
  // Envío a la Secretaría Técnica, revisión con comentarios y estado para la emprendedora
  await falla('enviar-actividad', act, tDina, 400); // falta la herramienta
  await ok('subir-documento', { ...act, tipo: 'herramienta', mime: 'image/jpeg', nombre: 'a1.jpg', base64: '/9j/4AAQ' }, tDina);
  await falla('enviar-actividad', act, tSara, 403);
  sg = await ok('enviar-actividad', { ...act, nota: 'Lista para revisar.' }, tDina);
  assert.equal(sg.actividades[0].revision.estado, 'enviada');
  assert.equal(sg.actividades[0].comentarios[0].texto, 'Lista para revisar.');
  const avisoEnvio = enDrive.filter((c) => c.accion === 'correo' && /envió documentos/.test(c.asunto)).pop();
  assert.ok(avisoEnvio, 'al enviar, le llega un correo a la Secretaría');
  assert.equal(avisoEnvio.para, 'sara@correo.co', 'a la secretaria que asignó el emprendimiento');
  assert.match(avisoEnvio.texto, /envió documentos para tu aprobación/);
  assert.match(avisoEnvio.texto, /Lista para revisar/, 'el mensaje de la dinamizadora va en el correo');
  // A fondo: nunca le llega a una persona real algo que no le corresponde
  const ultimoAviso = () => enDrive.filter((c) => c.accion === 'correo' && /envió documentos/.test(c.asunto)).pop();
  const refDe = async (ced) => { const d = (await db.collection('perfiles').where('cedula', '==', ced).get()).docs[0]; return { id: d.id, ref: db.collection('perfiles').doc(d.id) }; };
  const perfilEmp = await refDe(act.cedula);
  const perfilSara = await refDe('11111111');
  const perfilDina = await refDe('22222222');
  const volverAEnviar = async () => {
    await ok('revisar-actividad', { ...act, estado: 'devuelta', comentario: 'Prueba de devolución para reenviar.' }, tSara);
    await ok('enviar-actividad', act, tDina);
    return ultimoAviso();
  };
  // a) La secretaria que asignó entró con su perfil de dinamizadora: igual le llega a ella
  await ok('revisar-actividad', { ...act, estado: 'devuelta', comentario: 'Prueba de devolución para reenviar.' }, tSara);
  await perfilSara.ref.update({ rol: 'dinamizadora', otros_roles: { secretaria: { cargo: 'Dirección técnica' } } });
  await ok('enviar-actividad', act, tDina);
  assert.equal(ultimoAviso().para, 'sara@correo.co', 'la secretaria que asignó recibe el aviso aunque esté con su perfil de dinamizadora');
  await perfilSara.ref.update({ rol: 'secretaria', otros_roles: null });
  // b) Sin secretaria responsable: solo a soporte, nunca a otra secretaria adivinada
  await perfilEmp.ref.update({ asignada_por: null });
  let avs = await volverAEnviar();
  assert.equal(avs.para, undefined, 'sin secretaria que asignó, el aviso va solo a soporte');
  assert.match(avs.texto, /no se envió a ninguna secretaria/);
  // c) Dinamizadora de prueba: solo a soporte aunque haya secretaria que asignó
  await perfilEmp.ref.update({ asignada_por: perfilSara.id });
  await perfilDina.ref.update({ cargo: 'Cuenta de prueba · Dinamizadora' });
  avs = await volverAEnviar();
  assert.equal(avs.para, undefined, 'si la dinamizadora es de prueba, a ninguna persona real');
  await perfilDina.ref.update({ cargo: 'Acompañamiento - Magdalena' });
  // d) Secretaria real que asignó: le llega solo a ella
  avs = await volverAEnviar();
  assert.equal(avs.para, 'sara@correo.co');
  // f) Prueba con prueba: si la secretaria que asignó también es de prueba, sí le llega (nunca a una persona real)
  await perfilSara.ref.update({ prueba: true }); await perfilDina.ref.update({ prueba: true });
  avs = await volverAEnviar();
  assert.equal(avs.para, 'sara@correo.co', 'entre cuentas de prueba el aviso sí llega');
  await perfilDina.ref.update({ prueba: false });
  avs = await volverAEnviar();
  assert.equal(avs.para, undefined, 'secretaria de prueba y dinamizadora real: solo a soporte');
  await perfilSara.ref.update({ prueba: false });
  await volverAEnviar();
  // e) Cada aviso queda en el registro de admin/ con a quién se envió y por qué
  const regAvisos = (await db.collection('envios_correo').get()).docs.map((d) => d.data()).filter((x) => x.tipo === 'aviso_envio_documentos');
  assert.ok(regAvisos.length >= 4 && regAvisos.some((x) => /solo a soporte/.test(x.motivo)), 'los avisos quedan registrados con el motivo');
  await falla('quitar-documento', { ...act, tipo: 'acta' }, tDina, 409); // en revisión no se cambia
  assert.equal((await ok('emprendimientos', {}, tSara)).emprendimientos.find((x) => x.cedula === '44444444').avance.por_revisar, 1);
  assert.equal((await ok('mi-avance', {}, tRosa)).actividades[0].estado, 'en_revision');
  await falla('revisar-actividad', { ...act, estado: 'aprobada' }, tDina, 403);
  await falla('revisar-actividad', { ...act, estado: 'devuelta', comentario: '' }, tSara, 400);
  sg = await ok('revisar-actividad', { ...act, estado: 'devuelta', comentario: 'El acta no tiene la firma de la emprendedora.' }, tSara);
  assert.equal(sg.actividades[0].revision.estado, 'devuelta');
  await ok('subir-documento', { ...act, tipo: 'acta', mime: 'image/png', nombre: 'acta firmada.png', base64: 'iVBORw0KGgo=' }, tDina);
  sg = await ok('comentar-actividad', { ...act, texto: 'Ya subí el acta firmada.' }, tDina);
  await ok('enviar-actividad', act, tDina);
  sg = await ok('revisar-actividad', { ...act, estado: 'aprobada' }, tSara);
  assert.equal(sg.actividades[0].revision.estado, 'aprobada');
  assert.deepEqual(sg.actividades[0].comentarios.map((c) => c.estado).filter((x, i, l) => i < 1 || i >= l.length - 3), ['enviada', 'devuelta', null, 'aprobada']);
  await falla('marcar-actividad', { ...act, ejecutada: false }, tDina, 409); // aprobada: ya no se cambia
  const av = await ok('mi-avance', {}, tRosa);
  assert.equal(av.actividades[0].estado, 'aprobada'); assert.equal(av.aprobadas, 1);
  await falla('mi-avance', {}, tDina, 403);
  // Tabla de seguimiento: cada actividad viene como celda
  const filaTabla = (await ok('emprendimientos', {}, tSara)).emprendimientos.find((x) => x.cedula === '44444444');
  assert.deepEqual(filaTabla.celdas.hacer_1, { e: true, d: true, r: 'aprobada', f: '2026-10-08', c: 11 }); // 11 comentarios: incluye las devoluciones de la prueba de avisos
  // Cuestionario de aprendizaje semanal
  await falla('responder-aprendizaje', { semana: 1, respuestas: {} }, tRosa, 403); // aún no habilitado
  await falla('habilitar-aprendizaje', { cedula: '44444444', semana: 7 }, tDina, 400);
  sg = await ok('habilitar-aprendizaje', { cedula: '44444444', semana: 1 }, tDina);
  assert.equal(sg.aprendizaje[0].habilitada, true);
  let apr = await ok('mi-aprendizaje', {}, tRosa);
  assert.equal(apr.semanas[0].habilitada, true); assert.equal(apr.semanas[1].habilitada, false);
  await falla('responder-aprendizaje', { semana: 1, respuestas: { aprendi: 'Registrar mis ventas' } }, tRosa, 400);
  const resp = { aprendi: 'A registrar mis ventas cada día', aplicare: 'Un cuaderno de ventas', utilidad: 5, confianza: 4 };
  apr = await ok('responder-aprendizaje', { semana: 1, respuestas: resp }, tRosa);
  assert.equal(apr.semanas[0].respuestas.utilidad, 5);
  await falla('responder-aprendizaje', { semana: 1, respuestas: resp }, tRosa, 409);
  await falla('habilitar-aprendizaje', { cedula: '44444444', semana: 1, habilitada: false }, tDina, 409);
  sg = await ok('seguimiento', { cedula: '44444444' }, tSara);
  assert.equal(sg.aprendizaje[0].respuestas.aprendi, 'A registrar mis ventas cada día');
  assert.deepEqual((await ok('emprendimientos', {}, tSara)).emprendimientos.find((x) => x.cedula === '44444444').aprendizaje, { habilitadas: [1], respondidas: [1] });
  await falla('mi-aprendizaje', {}, tDina, 403);
  paso('Seguimiento: la dinamizadora envía a la Secretaría; la Secretaría aprueba o devuelve con comentarios; la emprendedora ve si se aprobó');
  await ok('asignar', { cedulas: ['44444444'], dinamizadora: null }, tSara);
  await falla('seguimiento', { cedula: '44444444' }, tDina, 403); // ya no la tiene asignada
  assert.equal((await ok('mis-emprendimientos', {}, tDina)).emprendimientos.length, 0);
  paso('Emprendimientos: la Secretaría asigna por satélite; la dinamizadora chulea actividades y sube acta y herramienta');

  // ---------- Copia en Google Drive ----------
  const subidas = enDrive.filter((c) => c.accion === 'subir');
  assert.ok(subidas.length >= 3, 'cada documento subido se copia en Drive');
  assert.deepEqual(subidas[0].ruta, ['Magdalena · Santa Marta', 'Rosa Emprendedora · CC 44444444', 'HACER · Semana 1']);
  assert.equal(subidas[0].nombre, 'Documento de la sesión · 2026-10-08.pdf');
  assert.ok(subidas.some((c) => c.nombre === 'Documento de la sesión (3) · 2026-10-08.jpg'), 'en Drive cada documento queda numerado');
  assert.equal(subidas[1].reemplazar, 'drv1', 'al reemplazar, el archivo anterior va a la papelera de Drive');
  assert.ok(enDrive.some((c) => c.accion === 'quitar'), 'al quitar un documento, también sale de Drive');
  await ok('asignar', { cedulas: ['44444444'], dinamizadora: '22222222' }, tSara);
  driveCaido = true;
  await ok('marcar-actividad', { ...act, n: 2, ejecutada: true }, tDina);
  sg = await ok('subir-documento', { ...act, n: 2, tipo: 'herramienta', mime: 'image/jpeg', nombre: 'a1.jpg', base64: '/9j/4AAQ' }, tDina);
  assert.equal(sg.actividades[1].documentos.herramienta[0].drive_pendiente, true, 'si Drive falla, el documento queda en la plataforma y pendiente');
  assert.equal((await ok('emprendimientos', {}, tSara)).drive.pendientes, 1);
  await falla('sincronizar-drive', {}, tDina, 403);
  driveCaido = false;
  const sync = await ok('sincronizar-drive', {}, tSara);
  assert.deepEqual(sync, { enviados: 1, pendientes: 0 });
  sg = await ok('seguimiento', { cedula: '44444444' }, tDina);
  assert.ok(sg.actividades[1].documentos.herramienta[0].drive_url.startsWith('https://drive.google.com/'));
  await ok('asignar', { cedulas: ['44444444'], dinamizadora: null }, tSara);
  paso('Documentos de seguimiento: copia en Google Drive por satélite, emprendimiento y semana; pendientes se reenvían');

  // ---------- Soporte técnico: tickets ----------
  const progresoAntes = JSON.stringify([...db.datos.entries()].filter(([k]) => /^(progreso|cuestionarios|evidencias|hitos|constancias|perfiles)/.test(k)));
  await falla('ticket-crear', { categoria: 'videos', asunto: 'Hola', descripcion: 'corto' }, tRosa, 400);
  const tk = await ok('ticket-crear', { categoria: 'videos', asunto: 'No me carga el video', descripcion: 'El video de la semana 2 se queda en negro en mi celular.', adjunto: { nombre: 'pantalla.png', mime: 'image/png', base64: 'iVBORw0KGgo=' } }, tRosa);
  assert.match(tk.ticket.numero, /^T-\d{6}-[0-9A-F]{4}$/);
  assert.equal(tk.ticket.estado, 'abierto');
  await falla('tickets', {}, tRosa, 403);
  await falla('tickets', {}, tDina, 403);
  await falla('tickets', {}, tSara, 403); // la Secretaría ya no atiende el soporte
  const bandeja = await ok('tickets', {}, tAdmin);
  assert.equal(bandeja.tickets.length, 1);
  // Avisos a soporte (los avisos a cada persona llevan persona: true; los de documentos enviados van a la secretaria)
  const avisos = () => enDrive.filter((c) => c.accion === 'correo' && !c.persona && !/envió documentos|Nota de/.test(c.asunto));
  const aPersonas = enDrive.filter((c) => c.accion === 'correo' && c.persona);
  assert.ok(aPersonas.some((c) => c.para === 'dina@correo.co' && /Aprobaron/.test(c.asunto)), 'la dinamizadora recibe correo cuando aprueban su sesión');
  assert.ok(aPersonas.some((c) => /Hay que corregir/.test(c.asunto)), 'y cuando se la devuelven');
  assert.ok(aPersonas.some((c) => c.para === 'dina@correo.co' && /Te asignaron/.test(c.asunto)), 'la dinamizadora recibe correo al asignarle emprendedoras');
  assert.ok(aPersonas.every((c) => /Autonomía Económica de la Mujer/.test(c.texto)), 'los avisos llevan la firma del centro');
  assert.equal(avisos().length, 1, 'la solicitud nueva llega por correo a soporte');
  assert.match(avisos()[0].asunto, /Nueva solicitud T-/);
  assert.match(avisos()[0].texto, /El video de la semana 2/);
  await falla('ticket', { id: tk.ticket.id }, tDina, 404); // la dinamizadora no ve solicitudes ajenas
  await falla('ticket-responder', { id: tk.ticket.id, texto: 'Respuesta de la Secretaría' }, tSara, 404);
  const r5 = await ok('ticket-responder', { id: tk.ticket.id, texto: 'Hola Rosa, prueba borrando la memoria del navegador.' }, tAdmin);
  assert.equal(avisos().length, 1, 'las respuestas de soporte no generan aviso');
  assert.equal(r5.ticket.estado, 'en_proceso');
  assert.equal(r5.ticket.mensajes[1].de, 'soporte');
  assert.equal((await ok('ticket-adjunto', { id: tk.ticket.id }, tAdmin)).base64, 'iVBORw0KGgo=');
  await falla('ticket-estado', { id: tk.ticket.id, estado: 'en_proceso' }, tRosa, 403);
  await ok('ticket-estado', { id: tk.ticket.id, estado: 'resuelto' }, tAdmin);
  const r6 = await ok('ticket-responder', { id: tk.ticket.id, texto: 'Sigue igual, no funciona.' }, tRosa);
  assert.equal(r6.ticket.estado, 'abierto', 'si la persona responde, la solicitud se reabre');
  assert.equal(avisos().length, 2, 'el mensaje nuevo de la persona llega por correo');
  assert.equal((await ok('mis-tickets', {}, tRosa)).tickets.length, 1);
  assert.equal((await ok('mis-tickets', {}, tDina)).tickets.length, 0);
  await ok('ticket-estado', { id: tk.ticket.id, estado: 'cerrado' }, tRosa);
  await falla('ticket-responder', { id: tk.ticket.id, texto: 'otra cosa' }, tRosa, 400);
  await ok('ticket-crear', { categoria: 'seguimiento', asunto: 'Subir acta', descripcion: 'No me deja subir el acta de la semana 1.' }, tDina);
  const pub = await ok('ticket-publico', { cedula: '44444444', nombre: 'Rosa Emprendedora', contacto: '3001234567', descripcion: 'Olvidé mi contraseña y no me llega el correo.' });
  assert.match(pub.numero, /^T-/);
  const pubVideo = await ok('ticket-publico', { cedula: '77777777', nombre: 'Ana Visitante', contacto: '3110000000', categoria: 'videos', rol: 'emprendedora', dispositivo: 'Celular', asunto: 'Videos', descripcion: 'El video no carga en mi celular desde ayer.' });
  const vistoPub = (await ok('tickets', {}, tAdmin)).tickets.find((x) => x.numero === pubVideo.numero);
  assert.equal(vistoPub.categoria, 'videos'); assert.equal(vistoPub.dispositivo, 'Celular'); assert.equal(vistoPub.rol, 'emprendedora');
  await falla('ticket-publico', { cedula: '44444444', nombre: 'Rosa', contacto: '300', descripcion: 'x' }, null, 400);
  await ok('ticket-publico', { cedula: '44444444', nombre: 'Rosa Emprendedora', contacto: 'rosa@correo.co', descripcion: 'Sigo sin poder entrar a la plataforma.' });
  await ok('ticket-publico', { cedula: '44444444', nombre: 'Rosa Emprendedora', contacto: 'rosa@correo.co', descripcion: 'Sigo sin poder entrar a la plataforma.' });
  await falla('ticket-publico', { cedula: '44444444', nombre: 'Rosa Emprendedora', contacto: 'rosa@correo.co', descripcion: 'Cuarta vez el mismo día, debe frenar.' }, null, 429);
  assert.equal((await ok('tickets', {}, tAdmin)).tickets.length, 6, 'la administración también ve la bandeja');
  assert.equal(JSON.stringify([...db.datos.entries()].filter(([k]) => /^(progreso|cuestionarios|evidencias|hitos|constancias|perfiles)/.test(k))), progresoAntes, 'los tickets no tocan el avance ni los perfiles');
  assert.ok(avisos().length >= 6, 'las solicitudes sin cuenta también llegan por correo');
  await falla('envios-correo', {}, tSara, 403);
  const env = await ok('envios-correo', {}, tAdmin);
  assert.ok(env.envios.length >= 5 && env.envios.some((x) => x.estado === 'fallido'));
  await falla('envios-correo', {}, tRosa, 403);
  paso('Soporte: tickets con respuestas, estados y adjunto; solicitud sin cuenta con límite; sin tocar el avance');

  // ---------- Dos perfiles: Secretaría y Dinamizadora con la misma cédula ----------
  const segundo = { dinamizadora: { cargo: 'Acompañamiento - Magdalena', subtitulo: null, departamento: 'Magdalena', satelite: 'magdalena' } };
  await db.collection('directorio').doc('11111111').update({ otros_roles: segundo });
  await db.collection('perfiles').doc(tSara).update({ otros_roles: segundo });
  const comoDina = await ok('ingresar', { cedula: '11111111', clave: 'SaraClave2026', rol: 'dinamizadora' });
  assert.equal(comoDina.perfil.rol, 'dinamizadora'); assert.equal(comoDina.perfil.satelite, 'magdalena');
  await ok('mis-emprendimientos', {}, tSara);
  await falla('emprendimientos', {}, tSara, 403);
  const comoSec = await ok('ingresar', { cedula: '11111111', clave: 'SaraClave2026', rol: 'secretaria' });
  assert.equal(comoSec.perfil.rol, 'secretaria'); assert.equal(comoSec.perfil.satelite, null);
  assert.ok((await ok('emprendimientos', {}, tSara)).dinamizadoras.some((x) => x.cedula === '11111111'), 'aparece entre las dinamizadoras asignables');
  await falla('ingresar', { cedula: '11111111', clave: 'SaraClave2026', rol: 'emprendedora' }, null, 403);
  paso('Dos perfiles: la misma cédula entra como Secretaría o como Dinamizadora');

  // ---------- Registro del equipo desde la administración ----------
  const nueva = { cedula: '77777001', nombre: 'Lina Nueva Dinamizadora', rol: 'dinamizadora', satelite: 'sucre', cargo: 'Acompañamiento - Sucre', correo: 'lina@correo.co', celular: '3005555555' };
  await falla('admin-guardar-persona', nueva, tSara, 403);
  await falla('admin-guardar-persona', { ...nueva, satelite: '' }, tAdmin, 400);
  await falla('admin-guardar-persona', { ...nueva, cedula: '44444444' }, tAdmin, 409);
  assert.equal((await ok('admin-guardar-persona', nueva, tAdmin)).nuevo, true);
  assert.match((await falla('admin-guardar-persona', { ...nueva, cedula: '77777002', nombre: 'Lina  Nueva Dinamizadora (prueba)' }, tAdmin, 409)).mensaje, /ese nombre/, 'no deja registrar dos personas con el mismo nombre');
  const regEq = await ok('admin-equipo', {}, tAdmin);
  const lina = regEq.personas.find((x) => x.cedula === '77777001');
  assert.equal(lina.departamento, 'Sucre'); assert.equal(lina.activada, false);
  await ok('solicitar-enlace', { cedula: '77777001' });
  assert.ok(cuentas.enlaces.includes('lina@correo.co'), 'la persona registrada ya puede activar su cuenta');
  await ok('admin-guardar-persona', { ...nueva, rol: 'secretaria', satelite: '', otro_rol: 'dinamizadora', otro_satelite: 'sucre' }, tAdmin);
  assert.equal((await ok('admin-equipo', {}, tAdmin)).personas.find((x) => x.cedula === '77777001').otros_roles.dinamizadora.satelite, 'sucre');
  const listaPuente = enDrive.filter((c) => c.accion === 'secretarias').pop();
  assert.ok(listaPuente && listaPuente.correos.includes('lina@correo.co') && listaPuente.correos.includes('sara@correo.co'), 'al registrar una secretaria, su correo pasa solo a la lista del puente');
  await falla('admin-equipo', {}, tSara, 403);
  // Reporte de avance por correo: solo la administración lo pide y solo llega a soporte
  await falla('reporte-avance', {}, tSara, 403);
  const rep = await ok('reporte-avance', {}, tAdmin);
  assert.ok(rep.personas >= 3);
  const correoRep = enDrive.filter((c) => c.accion === 'correo' && /Avance del equipo/.test(c.asunto)).pop();
  assert.equal(correoRep.para, undefined, 'el reporte va solo a soporte');
  assert.match(correoRep.texto, /DINAMIZADORAS/); assert.match(correoRep.texto, /Gestión del CIC: completo ✓ · HACER: /);
  await falla('admin-agregar-administradora', { correo: 'nueva@correo.co' }, tSara, 403);
  await falla('admin-agregar-administradora', { correo: 'dina@correo.co' }, tAdmin, 409); // es la cuenta de una dinamizadora
  const ad = await ok('admin-agregar-administradora', { correo: 'Centro.Nuevo@correo.co' }, tAdmin);
  assert.equal(ad.enviado, true);
  assert.ok(cuentas.enlaces.includes('centro.nuevo@correo.co'));
  assert.equal((await ok('admin-administradoras', {}, tAdmin)).administradoras.length, 2);
  await ok('admin-agregar-administradora', { correo: 'admin@correo.co' }, tAdmin); // ya es administración: no falla
  assert.equal((await ok('material-transferencia', {}, tAdmin)).unidades.length, 6);
  assert.ok((await ok('admin-contenido', {}, tAdmin)).cursos['formacion-secretaria'], 'los videos del material de transferencia se cargan desde admin/');
  // Novedades: la administración cuenta qué cambió y se le envía a todo el mundo con correo real (por tandas)
  await falla('admin-crear-novedad', { titulo: 'Mejoras', texto: 'Cambiamos el seguimiento para que sea más sencillo.' }, tSara, 403);
  const nov = await ok('admin-crear-novedad', { titulo: 'Mejoras en Seguimiento', texto: 'Cambiamos el seguimiento para que sea más sencillo.' }, tAdmin);
  const envNov = await ok('admin-enviar-novedad', { id: nov.id }, tAdmin);
  assert.ok(envNov.enviados >= 3 && envNov.faltan === 0, 'le llega a todas las personas con correo');
  assert.equal((await ok('admin-enviar-novedad', { id: nov.id }, tAdmin)).enviados, envNov.enviados, 'no se repite a quien ya le llegó');
  assert.equal((await ok('novedad', {}, tRosa)).novedad.titulo, 'Mejoras en Seguimiento', 'y se ve dentro de la plataforma');
  // Correo de finalización: al terminar los tres cursos (queda pendiente hasta que la administración guarde el evento)
  for (let u = 1; u <= 6; u++) await completar(tSara, 'acompanar-hacer', u);
  for (let u = 1; u <= 4; u++) await completar(tSara, 'facilitar-ser', u);
  // Sale sola al terminar el tercer curso: fecha del evento = día en que terminó; lugar = su satélite
  const correoFin = enDrive.filter((c) => c.accion === 'correo' && c.html && c.para === 'sara@correo.co').pop();
  assert.ok(correoFin && /¡Lo lograste, Sara!/.test(correoFin.html) && /Sara Secretaria Uno/.test(correoFin.html), 'el correo lleva su nombre');
  assert.ok(!/Marta/.test(correoFin.html) && !/\[Fecha|\[Lugar/.test(correoFin.html), 'no queda nada del ejemplo');
  const hoyLargo = new Date(reloj).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' });
  assert.ok(correoFin.html.split(hoyLargo).length >= 3, 'la fecha del evento es el día en que terminó');
  assert.ok(/Satélite Santa Marta · Magdalena|Magdalena/.test(correoFin.html), 'el lugar es su satélite o departamento');
  const fin3 = await ok('admin-finalizacion', {}, tAdmin);
  assert.ok(fin3.personas.find((x) => x.nombre === 'Sara Secretaria Uno').enviado_en, 'queda registrado como enviado');
  assert.ok((await ok('admin-vista-finalizacion', {}, tAdmin)).html.includes('Nombre Apellido de Ejemplo'));
  assert.equal((await ok('admin-enviar-finalizaciones', {}, tAdmin)).enviados, 0, 'no se repite');
  paso('Registro del equipo: la administración registra y edita secretarías y dinamizadoras (con segundo perfil)');

  // ---------- Mi cuenta ----------
  await falla('cambiar-clave', { clave_actual: 'mala', clave_nueva: 'OtraClave2026' }, tDina, 401);
  await falla('cambiar-clave', { clave_actual: 'DinaClave2026', clave_nueva: '22222222' }, tDina, 400);
  const cc = await ok('cambiar-clave', { clave_actual: 'DinaClave2026', clave_nueva: 'OtraClave2026' }, tDina);
  assert.equal(cc.cuenta, 'dina@correo.co');
  await ok('ingresar', { cedula: '22222222', clave: 'OtraClave2026', rol: 'dinamizadora' });
  const tTres = cuentas.uidDe(tres.cuenta);
  const nuevo = await ok('actualizar-contacto', { correo: 'tres@correo.co', celular: '3009999999' }, tTres);
  assert.equal(nuevo.perfil.correo, 'tres@correo.co');
  await ok('solicitar-enlace', { cedula: '33333333' });
  assert.ok(cuentas.enlaces.includes('tres@correo.co'), 'al registrar correo, ya puede recuperar su clave por enlace');
  await falla('mi-perfil', {}, 'token-falso', 401);
  paso('Mi cuenta: cambio de contraseña y correo nuevo para recuperar por enlace');

  console.log(`\nTodo bien: ${pasos} grupos de pruebas.`);
})().catch((e) => { console.error('\n✗ FALLÓ:', e.message, (e.stack.match(/prueba\.js:\d+/) || [''])[0]); process.exit(1); });
