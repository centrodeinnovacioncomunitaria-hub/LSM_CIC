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
    collection: (c) => ({ doc: (id) => doc(c, id), ...consulta(c, []), add: async (d) => { const id = `auto${++n}`; await doc(c, id).set(d); return { id }; } }),
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
  const { atender } = crearLogica({ db, cuentas, ahora: () => reloj });
  const pedir = async (accion, datos = {}, token = null) => atender({ accion, ...datos }, token);
  // Responde un intento con n respuestas correctas (las opciones llegan en orden aleatorio)
  const responder = (q, n) => q.preguntas.map((p, i) => (i < n ? p.opciones.indexOf('bien') : p.opciones.findIndex((o) => o !== 'bien')));
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
  assert.deepEqual(cuentas.enlaces, ['dina@correo.co']);
  await ok('solicitar-enlace', { cedula: '22222222' });
  assert.equal(cuentas.enlaces.length, 1, 'máximo un enlace cada 2 minutos');
  const r2 = await ok('solicitar-enlace', { cedula: '99999999' });
  assert.equal(r2.mensaje, r1.mensaje, 'misma respuesta para cédulas que no existen');
  await ok('solicitar-enlace', { cedula: '33333333' });
  assert.equal(cuentas.enlaces.length, 1, 'sin correo no se envía nada');
  paso('Activación: el enlace llega solo a quien tiene correo, sin revelar qué cédulas existen');

  await falla('ingresar', { cedula: '22222222', clave: 'cualquiera1', rol: 'dinamizadora' }, null, 401);
  cuentas.abrirEnlace('dina@correo.co', 'DinaClave2026');
  const dina = await ok('ingresar', { cedula: '22222222', clave: 'DinaClave2026', rol: 'dinamizadora' });
  assert.equal(dina.cuenta, 'dina@correo.co');
  assert.equal(dina.perfil.rol, 'dinamizadora');
  assert.equal(dina.perfil.cuenta_email, undefined, 'el perfil público no expone la cuenta interna');
  const tDina = dina.perfil.id;
  const rolMal = await falla('ingresar', { cedula: '22222222', clave: 'DinaClave2026', rol: 'secretaria' }, null, 403);
  assert.equal(rolMal.rol, 'dinamizadora');
  paso('Ingreso con cédula y contraseña; avisa el perfil correcto solo con la contraseña buena');

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
  assert.equal((await ok('material', { curso: 'gestion', unidad: 1, marcar: false }, tDina)).archivos.length, 1);
  assert.equal((await ok('mi-progreso', {}, tDina)).cursos.gestion[0].material_visto, false);
  assert.equal((await ok('material', { curso: 'gestion', unidad: 1 }, tDina)).archivos.length, 1);
  await falla('cuestionario', { curso: 'gestion', unidad: 1 }, tDina, 403); // falta el video
  // El video solo cuenta tras el tiempo mínimo desde que se reprodujo (sin duración cargada: 2 minutos)
  await falla('marcar', { curso: 'gestion', unidad: 1, que: 'video' }, tDina, 400);
  p = await ok('iniciar-video', { curso: 'gestion', unidad: 1 }, tDina);
  assert.equal(p.cursos.gestion[0].video_faltan, 120);
  avanzar(1);
  const temprano = await falla('marcar', { curso: 'gestion', unidad: 1, que: 'video' }, tDina, 400);
  assert.equal(temprano.faltan, 60);
  avanzar(1);
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
  await ok('iniciar-video', { curso: 'gestion', unidad: 1 }, tDina);
  avanzar(2);
  await ok('marcar', { curso: 'gestion', unidad: 1, que: 'video' }, tDina);
  p = await ok('marcar', { curso: 'gestion', unidad: 1, que: 'material' }, tDina);
  assert.equal(p.cursos.gestion[0].estado, 'en-curso');
  assert.equal(p.cursos.gestion[0].ronda, 2);
  paso('Cuestionario: 5 preguntas sin respuesta, 2 intentos, pausa hasta repasar video y material');

  const q = await ok('cuestionario', { curso: 'gestion', unidad: 1 }, tDina);
  const bien = await ok('responder', { id: q.id, respuestas: responder(q, 7) }, tDina);
  assert.equal(bien.nota, 7);
  assert.ok(bien.detalle.filter((d) => !d.bien).every((d) => d.retro === 'Justificación oficial.'), 'al aprobar se muestra la justificación');
  assert.equal(bien.aprobado, true);
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
    return ok('entregar', { curso, unidad: u, texto: 'Evidencia de la unidad con suficiente detalle.' }, token);
  }
  let fin;
  for (let u = 2; u <= 4; u++) fin = await completar(tDina, 'gestion', u);
  assert.match(fin.constancia.codigo, /^CIC-GESM-[A-Z0-9]{6}$/);
  const ver = await ok('verificar', { codigo: fin.constancia.codigo });
  assert.deepEqual([ver.valida, ver.iniciales], [true, 'D. D. D.']);
  assert.equal((await ok('verificar', { codigo: 'CIC-GESM-XXXXXX' })).valida, false);
  paso('Constancia al terminar Gestión, verificable en público solo con iniciales');

  p = await ok('mi-progreso', {}, tDina);
  assert.match(p.cursos['acompanar-hacer'][0].motivo, /transferencia/);
  await falla('hito', { hito: 'transferencia-hacer', cedula: '22222222' }, tDina, 403);
  await ok('hito', { hito: 'transferencia-hacer', cedula: '22222222' }, tSara);
  p = await ok('mi-progreso', {}, tDina);
  assert.equal(p.cursos['acompanar-hacer'][0].estado, 'disponible');
  assert.equal(p.cursos['facilitar-ser'][0].estado, 'bloqueada');
  paso('Dinamizadora: HACER se abre solo con la transferencia que registra la Secretaría');

  // ---------- Secretaría: su formación sin cuestionario y luego las rutas ----------
  await ok('hito', { hito: 'compromiso' }, tSara);
  for (let u = 1; u <= 4; u++) {
    await ok('material', { curso: 'gestion', unidad: u }, tSara);
    if (u === 1) { await ok('iniciar-video', { curso: 'gestion', unidad: 1 }, tSara); avanzar(2); await ok('marcar', { curso: 'gestion', unidad: 1, que: 'video' }, tSara); }
    else await falla('marcar', { curso: 'gestion', unidad: u, que: 'video' }, tSara, 400); // sin video
    const c = await ok('cuestionario', { curso: 'gestion', unidad: u }, tSara);
    await ok('responder', { id: c.id, respuestas: responder(c, 10) }, tSara);
    await ok('entregar', { curso: 'gestion', unidad: u, texto: 'Evidencia de la unidad con suficiente detalle.' }, tSara);
  }
  p = await ok('mi-progreso', {}, tSara);
  assert.ok(p.cursos['formacion-secretaria']);
  assert.match(p.cursos['acompanar-hacer'][0].motivo, /Formación/);
  await falla('entregar', { curso: 'formacion-secretaria', unidad: 1, texto: 'Actividad sin haber visto el material todavía.' }, tSara, 400);
  for (let u = 1; u <= 6; u++) fin = await completar(tSara, 'formacion-secretaria', u);
  assert.ok(fin.constancia);
  p = await ok('mi-progreso', {}, tSara);
  assert.equal(p.cursos['acompanar-hacer'][0].estado, 'disponible');
  assert.equal(p.cursos['facilitar-ser'][0].estado, 'disponible');
  paso('Secretaría: Gestión → Formación de la Secretaría (sin cuestionario) → HACER y SER');

  // ---------- Panel de la Secretaría ----------
  await falla('equipo', {}, tDina, 403);
  const eq = await ok('equipo', {}, tSara);
  assert.equal(eq.personas.length, 3);
  assert.equal(eq.personas.find((x) => x.cedula === '22222222').avance.gestion, 4);
  assert.ok(eq.pendientes.length >= 5);
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
  assert.equal((await ok('mi-progreso', {}, tDina)).cursos.gestion[1].video_segundos, 1080, 'el 90 % de 20 minutos');
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
  assert.equal(conv.respuestas[0].autor_rol, 'Dinamizadora');
  await ok('foro-publicar', { categoria: 'equipo', titulo: 'Reunión de la Secretaría con el equipo', texto: 'Recordatorio de la reunión del viernes.' }, tSara);
  assert.equal((await ok('foro-temas', {}, tRosa)).temas.length, 1, 'la emprendedora no ve los temas del equipo');
  assert.equal((await ok('foro-temas', {}, tDina)).temas.length, 2);
  assert.equal((await ok('foro-temas', { categoria: 'hacer' }, tDina)).temas[0].respuestas, 1);
  await falla('foro-borrar', { tipo: 'tema', id: tema.id }, tDina, 403);
  await ok('foro-fijar', { id: tema.id, fijado: true }, tSara);
  assert.equal((await ok('foro-temas', {}, tDina)).temas[0].fijado, true);
  await ok('foro-borrar', { tipo: 'respuesta', id: conv.respuestas[0].id }, tSara);
  assert.equal((await ok('foro-tema', { id: tema.id }, tRosa)).respuestas.length, 0);
  await ok('foro-borrar', { tipo: 'tema', id: tema.id }, tRosa);
  await falla('foro-tema', { id: tema.id }, tRosa, 404);
  paso('Foro: solo con cuenta; temas del equipo ocultos a emprendedoras; límite de publicación; moderación');

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
})().catch((e) => { console.error('\n✗ FALLÓ:', e.message); process.exit(1); });
