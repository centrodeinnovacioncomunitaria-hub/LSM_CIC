// Lógica del acceso y de los cursos del CIC (Firebase: Cloud Functions + Firestore + Authentication).
// Todo pasa por aquí: la página nunca lee ni escribe Firestore directamente (las reglas lo niegan todo).
//
// Acceso: ingreso con cédula y perfil (con límite de intentos), inscripción de emprendedoras,
// activación y recuperación con un ENLACE AL CORREO (lo envía Firebase), o con un código de 6 números
// que entrega la Secretaría o la dinamizadora a quien no tiene correo, y cambio de contraseña.
// Cursos del equipo: avance por unidad, material, cuestionarios calificados aquí, evidencias,
// revisión de la Secretaría Técnica, transferencias y constancias verificables.
//
// Este archivo no depende de Firebase: recibe `db` (Firestore) y `cuentas` (Authentication),
// así se puede probar sin conexión (ver prueba.js).
'use strict';

const crypto = require('crypto');

const ROLES = ['secretaria', 'dinamizadora', 'emprendedora'];
const NOMBRE_ROL = { secretaria: 'Secretaría Técnica', dinamizadora: 'Dinamizadora', emprendedora: 'Emprendedora' };
// Municipios de cada satélite (los mismos de herramientas/Datos.pm)
const SATELITES = {
  'la-guajira': { departamento: 'La Guajira', municipios: ['Riohacha', 'Albania'] },
  magdalena: { departamento: 'Magdalena', municipios: ['Santa Marta'] },
  valledupar: { departamento: 'Cesar', municipios: ['Valledupar'] },
  'pueblo-bello': { departamento: 'Cesar', municipios: ['Pueblo Bello'] },
  atlantico: { departamento: 'Atlántico', municipios: ['Baranoa', 'Campo de la Cruz'] },
  bolivar: { departamento: 'Bolívar', municipios: ['Cartagena', 'María la Baja'] },
  sucre: { departamento: 'Sucre', municipios: ['Sincelejo', 'Tolú'] },
  cordoba: { departamento: 'Córdoba', municipios: ['Montería', 'Tierralta'] },
};
const sateliteDe = (municipio) => (Object.entries(SATELITES).find(([, s]) => s.municipios.includes(municipio)) || [null])[0];

// Reglas de los cursos del equipo (documento técnico 6.4 y guiones del curso de Gestión)
// cuestionario: false → la unidad se aprueba al repasar el material y enviar la actividad.
const CURSOS = {
  gestion: { unidades: 5, prefijo: 'GES-M', nombre: 'Gestión del CIC', evidencia: 'actividad', cuestionario: true, roles: ['secretaria', 'dinamizadora'] },
  'formacion-secretaria': { unidades: 6, prefijo: 'STF-U', nombre: 'Formación de la Secretaría Técnica', evidencia: 'actividad', cuestionario: false, roles: ['secretaria'] },
  'acompanar-hacer': { unidades: 6, prefijo: 'HAC-S', nombre: 'Acompañar la ruta HACER', evidencia: 'verificacion', cuestionario: true, roles: ['secretaria', 'dinamizadora'] },
  'facilitar-ser': { unidades: 4, prefijo: 'SER-T', nombre: 'Facilitar la ruta SER', evidencia: 'verificacion', cuestionario: true, roles: ['secretaria', 'dinamizadora'] },
};
const PREGUNTAS_POR_INTENTO = 5;
const NOTA_MINIMA = 4;           // 4 de 5
const INTENTOS_POR_RONDA = 2;    // si pierde los dos, repasa video y material para volver a intentar
const MINUTOS_CUESTIONARIO = 60; // un intento abierto vence en una hora
const CODIGO_HORAS_EQUIPO = 24;  // código que genera la Secretaría o la dinamizadora
const FALLOS_MAX = 5;
const BLOQUEO_MIN = 15;
const DOMINIO_INTERNO = 'cuentas.cic.invalid'; // cuentas sin correo real: nunca reciben mensajes

class Falla extends Error {
  constructor(estado, codigo, mensaje, extra = {}) {
    super(mensaje);
    this.estado = estado; this.codigo = codigo; this.extra = extra;
  }
}

const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const texto = (v, max = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const correoValido = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(c || ''));
const esInterno = (c) => String(c || '').endsWith('@' + DOMINIO_INTERNO);
const enmascarar = (c) => String(c).replace(/^(.)[^@]*(@.*)$/, '$1***$2');
const iniciales = (n) => String(n || '').split(/\s+/).filter(Boolean).slice(0, 3).map((p) => p[0].toUpperCase() + '.').join(' ');

function validarCedula(v) {
  const c = soloDigitos(v);
  if (c.length < 5 || c.length > 15) throw new Falla(400, 'cedula', 'Escribe tu número de cédula, solo números.');
  return c;
}
function validarClaveNueva(clave, cedula) {
  if (String(clave).length < 8) throw new Falla(400, 'clave', 'La contraseña debe tener al menos 8 letras o números.');
  if (clave === cedula) throw new Falla(400, 'clave', 'La contraseña no puede ser tu número de cédula.');
}
function validarCurso(curso, unidad) {
  const c = String(curso ?? '');
  const u = Number(unidad);
  if (!CURSOS[c] || !Number.isInteger(u) || u < 1 || u > CURSOS[c].unidades) throw new Falla(400, 'curso', 'Ese módulo no existe.');
  return { curso: c, unidad: u };
}
const barajar = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [r[i], r[j]] = [r[j], r[i]]; } return r; };

// Campos del perfil que puede ver la propia persona (nunca el correo interno de la cuenta)
const publico = (id, p) => ({
  id, cedula: p.cedula, nombre: p.nombre, rol: p.rol, cargo: p.cargo || null, correo: p.correo || null,
  celular: p.celular || null, departamento: p.departamento || null, municipio: p.municipio || null,
  negocio: p.negocio || null, satelite: p.satelite || null, semana_actual: p.semana_actual || 1,
  creado_en: p.creado_en || null, debe_cambiar_clave: false,
});

function crearLogica({ db, cuentas, ahora = () => new Date() }) {
  const hoy = () => ahora().toISOString();
  const enMinutos = (m) => new Date(ahora().getTime() + m * 60000).toISOString();
  const col = (n) => db.collection(n);
  const datos = async (ref) => { const s = await ref.get(); return s.exists ? s.data() : null; };
  const lista = async (q) => (await q.get()).docs.map((d) => ({ _id: d.id, ...d.data() }));

  // ---------- Personas ----------
  async function perfilPorCedula(cedula) {
    const [p] = await lista(col('perfiles').where('cedula', '==', cedula));
    return p ? { id: p._id, ...p } : null;
  }
  async function perfilPorId(id) {
    const p = await datos(col('perfiles').doc(id));
    return p ? { id, ...p } : null;
  }
  // Crea la cuenta de Authentication y el perfil. Si tiene correo real, la cuenta usa ese correo
  // (así Firebase le envía los enlaces para crear o cambiar la contraseña).
  async function crearCuenta(cedula, clave, p) {
    let email = correoValido(p.correo) ? p.correo.toLowerCase() : `${cedula}@${DOMINIO_INTERNO}`;
    let uid;
    try {
      uid = await cuentas.crear({ email, clave, nombre: p.nombre });
    } catch (e) {
      if (e.code !== 'auth/email-already-exists' || esInterno(email)) throw new Falla(500, 'cuenta', 'No pudimos crear la cuenta. Escríbenos para revisarlo.');
      email = `${cedula}@${DOMINIO_INTERNO}`; // ese correo ya lo usa otra cuenta
      uid = await cuentas.crear({ email, clave, nombre: p.nombre });
    }
    const fila = { cedula, ...p, cuenta_email: email, creado_en: hoy() };
    try { await col('perfiles').doc(uid).set(fila); } catch (e) { await cuentas.borrar(uid).catch(() => {}); throw e; }
    return { id: uid, ...fila };
  }
  async function usuarioDelToken(token) {
    const uid = token ? await cuentas.verificarToken(token).catch(() => null) : null;
    const p = uid ? await perfilPorId(uid) : null;
    if (!p) throw new Falla(401, 'sesion', 'Tu sesión terminó. Vuelve a ingresar.');
    return p;
  }
  const respuestaSesion = (p) => ({ cuenta: p.cuenta_email, perfil: publico(p.id, p) });

  // ---------- Límite de intentos fallidos ----------
  async function revisarBloqueo(cedula) {
    const b = await datos(col('bloqueos').doc(cedula));
    if (b && b.bloqueado_hasta && new Date(b.bloqueado_hasta) > ahora()) {
      const min = Math.ceil((new Date(b.bloqueado_hasta) - ahora()) / 60000);
      throw new Falla(429, 'bloqueado', `Hubo demasiados intentos con esta cédula. Por seguridad, espera ${min} minuto${min === 1 ? '' : 's'} e intenta de nuevo.`);
    }
    return b;
  }
  async function registrarFallo(cedula, previo) {
    const nueva = !previo || ahora() - new Date(previo.ventana_desde) > BLOQUEO_MIN * 60000;
    const fallos = nueva ? 1 : previo.fallos + 1;
    await col('bloqueos').doc(cedula).set({
      fallos, ventana_desde: nueva ? hoy() : previo.ventana_desde,
      bloqueado_hasta: fallos >= FALLOS_MAX ? enMinutos(BLOQUEO_MIN) : null,
    });
  }

  // ---------- Enlace al correo y códigos de la Secretaría ----------
  // ¿Quién es esta cédula? Persona con cuenta (recuperación) o del directorio sin cuenta (activación).
  async function destinatario(cedula) {
    const p = await perfilPorCedula(cedula);
    if (p) return { motivo: 'recuperacion', perfil: p, nombre: p.nombre, correo: p.correo, rol: p.rol, departamento: p.departamento };
    const d = await datos(col('directorio').doc(cedula));
    if (d) return { motivo: 'activacion', directorio: d, nombre: d.nombre, correo: d.correo, rol: d.rol, departamento: d.departamento };
    return null;
  }
  const claveAlAzar = () => crypto.randomBytes(24).toString('base64url');
  async function cuentaDesdeDirectorio(cedula, d, clave) {
    return crearCuenta(cedula, clave, {
      nombre: d.nombre, rol: d.rol, cargo: d.cargo || null, correo: d.correo || null, celular: d.celular || null,
      departamento: d.departamento || null, satelite: d.satelite || null,
    });
  }

  // La persona escribe su cédula y le llega al correo un enlace para crear o cambiar su contraseña.
  // La respuesta es siempre la misma, para no revelar qué cédulas existen.
  async function solicitarEnlace(b) {
    const cedula = validarCedula(b.cedula);
    const generico = {
      ok: true,
      mensaje: 'Si esta cédula está registrada con un correo, te llegó un enlace para crear tu contraseña (revisa también «Spam» o «Correo no deseado»). Si no tienes correo registrado, pídele un código a la Secretaría Técnica o a tu dinamizadora.',
    };
    const previo = await datos(col('enlaces').doc(cedula));
    if (previo && ahora() - new Date(previo.enviado_en) < 2 * 60000) return generico; // máximo uno cada 2 minutos
    const d = await destinatario(cedula);
    if (!d) return generico;
    let p = d.perfil;
    if (!p) {
      if (!correoValido(d.correo)) return generico;
      p = await cuentaDesdeDirectorio(cedula, d.directorio, claveAlAzar());
    }
    if (esInterno(p.cuenta_email)) return generico;
    await col('enlaces').doc(cedula).set({ enviado_en: hoy() });
    await cuentas.enviarEnlace(p.cuenta_email).catch(() => false);
    return generico;
  }

  // La Secretaría (a cualquiera) o la dinamizadora (a las emprendedoras de su departamento) generan un código
  // de 6 números para entregarlo por WhatsApp o en persona, a quien no tiene correo o no lo recibe.
  const hashCodigo = (cedula, codigo) => crypto.createHash('sha256').update(`${cedula}:${codigo}:cic`).digest('hex');
  async function generarCodigo(token, b) {
    const quien = await usuarioDelToken(token);
    const cedula = validarCedula(b.cedula);
    const d = await destinatario(cedula);
    if (!d) throw new Falla(404, 'no_existe', 'No encontramos esa cédula en el directorio ni en las inscripciones.');
    const permitido = quien.rol === 'secretaria' || (quien.rol === 'dinamizadora' && d.rol === 'emprendedora' && d.departamento === quien.departamento);
    if (!permitido) throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica, o la dinamizadora del departamento de la emprendedora, puede generar este código.');
    if (cedula === quien.cedula) throw new Falla(400, 'propio', 'Para tu propia cuenta usa «¿Olvidaste tu contraseña?».');
    const codigo = String(crypto.randomInt(1000000)).padStart(6, '0');
    await col('codigos').doc(cedula).set({ motivo: d.motivo, hash: hashCodigo(cedula, codigo), expira: enMinutos(CODIGO_HORAS_EQUIPO * 60), intentos: 0, creado_por: quien.id, creado_en: hoy() });
    return { ok: true, codigo, nombre: d.nombre, motivo: d.motivo, vence_horas: CODIGO_HORAS_EQUIPO, correoEnviado: false, correo: d.correo ? enmascarar(d.correo) : null };
  }

  // Con el código, la persona crea su contraseña: activa su cuenta o recupera la suya.
  async function activar(b) {
    const cedula = validarCedula(b.cedula);
    const codigo = soloDigitos(b.codigo);
    const clave = String(b.clave ?? '');
    validarClaveNueva(clave, cedula);
    const invalido = new Falla(400, 'codigo', 'El código no es válido o ya venció. Pídele uno nuevo a la Secretaría Técnica o a tu dinamizadora.');
    const ref = col('codigos').doc(cedula);
    const c = await datos(ref);
    if (!c || new Date(c.expira) < ahora() || c.intentos >= 5 || codigo.length !== 6) throw invalido;
    if (c.hash !== hashCodigo(cedula, codigo)) { await ref.update({ intentos: c.intentos + 1 }); throw invalido; }
    await ref.delete();
    let p = await perfilPorCedula(cedula);
    if (p) await cuentas.cambiarClave(p.id, clave);
    else {
      const d = await datos(col('directorio').doc(cedula));
      if (!d) throw invalido;
      p = await cuentaDesdeDirectorio(cedula, d, clave);
    }
    await col('bloqueos').doc(cedula).delete();
    return respuestaSesion(p);
  }

  // ---------- Ingreso e inscripción ----------
  async function ingresar(b) {
    const cedula = validarCedula(b.cedula);
    const clave = String(b.clave ?? '');
    const rol = String(b.rol ?? '');
    if (!ROLES.includes(rol)) throw new Falla(400, 'rol', 'Elige tu perfil: Emprendedora, Dinamizadora o Secretaría Técnica.');
    if (!clave) throw new Falla(400, 'clave', 'Escribe tu contraseña.');
    const bloqueo = await revisarBloqueo(cedula);
    const p = await perfilPorCedula(cedula);
    const ok = p ? await cuentas.verificarClave(p.cuenta_email, clave).catch(() => false) : false;
    if (!ok) {
      await registrarFallo(cedula, bloqueo);
      throw new Falla(401, 'credenciales', rol === 'emprendedora'
        ? 'La cédula o la contraseña no coinciden. Si aún no tienes cuenta, toca «Inscribirme».'
        : 'La cédula o la contraseña no coinciden. Si es tu primera vez, toca «Activar mi cuenta» y te llegará un enlace a tu correo.');
    }
    await col('bloqueos').doc(cedula).delete();
    // La contraseña ya se verificó: aquí sí podemos decirle cuál es su perfil.
    if (p.rol !== rol) throw new Falla(403, 'rol', `Tu cuenta está registrada como ${NOMBRE_ROL[p.rol]}. Elige ese perfil para entrar.`, { rol: p.rol });
    return respuestaSesion(p);
  }

  async function registrar(b) {
    const cedula = validarCedula(b.cedula);
    const nombre = texto(b.nombre, 90);
    const correo = texto(b.correo, 120).toLowerCase();
    const celular = soloDigitos(b.celular).slice(0, 12);
    const municipio = texto(b.municipio, 60);
    const negocio = texto(b.negocio, 90);
    const clave = String(b.clave ?? '');
    const satelite = sateliteDe(municipio);
    if (nombre.length < 5 || !nombre.includes(' ')) throw new Falla(400, 'nombre', 'Escribe tu nombre y apellido.');
    if (correo && !correoValido(correo)) throw new Falla(400, 'correo', 'Revisa tu correo electrónico, o déjalo vacío.');
    if (celular.length < 7) throw new Falla(400, 'celular', 'Escribe tu número de celular o WhatsApp.');
    if (!satelite) throw new Falla(400, 'municipio', 'Elige tu municipio de la lista.');
    validarClaveNueva(clave, cedula);
    if (b.acepto !== true) throw new Falla(400, 'acepto', 'Para inscribirte debes autorizar el tratamiento de tus datos.');
    // Mismo mensaje si la cédula ya tiene cuenta o es del equipo: no revela quién es quién.
    if (await datos(col('directorio').doc(cedula)) || await perfilPorCedula(cedula)) {
      throw new Falla(409, 'existe', 'No podemos inscribir esta cédula porque ya está registrada. Si es tuya, toca «Ingresar» o «¿Olvidaste tu contraseña?».');
    }
    const p = await crearCuenta(cedula, clave, {
      nombre, rol: 'emprendedora', correo: correo || null, celular, departamento: SATELITES[satelite].departamento,
      municipio, satelite, negocio: negocio || null, semana_actual: 1, acepto_datos_en: hoy(),
    });
    return respuestaSesion(p);
  }

  async function cambiarClave(token, b) {
    const p = await usuarioDelToken(token);
    const actual = String(b.clave_actual ?? '');
    const nueva = String(b.clave_nueva ?? '');
    validarClaveNueva(nueva, p.cedula);
    if (nueva === actual) throw new Falla(400, 'clave', 'La nueva contraseña debe ser distinta de la actual.');
    if (!(await cuentas.verificarClave(p.cuenta_email, actual).catch(() => false))) throw new Falla(401, 'clave_actual', 'La contraseña actual no es correcta.');
    await cuentas.cambiarClave(p.id, nueva);
    await col('perfiles').doc(p.id).update({ clave_cambiada_en: hoy() });
    return { ok: true, cuenta: p.cuenta_email, correoEnviado: false, correo: p.correo ? enmascarar(p.correo) : null };
  }

  // ---------- Panel ----------
  const miPerfil = async (token) => { const p = await usuarioDelToken(token); return publico(p.id, p); };

  // Correo y celular de contacto. Si el correo es nuevo y válido, la cuenta pasa a usarlo para los enlaces.
  async function actualizarContacto(token, b) {
    const p = await usuarioDelToken(token);
    const correo = texto(b.correo, 120).toLowerCase();
    const celular = soloDigitos(b.celular).slice(0, 12);
    if (correo && !correoValido(correo)) throw new Falla(400, 'correo', 'Revisa tu correo electrónico.');
    const cambios = { correo: correo || null, celular: celular || null };
    if (correo && correo !== p.cuenta_email) {
      try { await cuentas.cambiarCorreo(p.id, correo); cambios.cuenta_email = correo; } catch (e) { /* ese correo ya lo usa otra cuenta: se guarda solo como contacto */ }
    }
    await col('perfiles').doc(p.id).update(cambios);
    return { ok: true, perfil: publico(p.id, { ...p, ...cambios }) };
  }

  async function verVideos(token) {
    const p = await usuarioDelToken(token);
    const todos = await lista(col('videos'));
    const visibles = p.rol === 'emprendedora' ? todos.filter((v) => v.audiencia === 'emprendedoras' && (!v.satelite || v.satelite === p.satelite)) : todos;
    return { videos: visibles.map(({ _id, ...v }) => v).sort((a, b) => a.codigo.localeCompare(b.codigo)) };
  }
  const RE_VIDEO = /^(GES-M[1-5]|STF-U[1-6]|HAC-S[1-6]|SER-T[1-4]|GRAB-SER[1-4]-[A-Z]{3,5}-[0-9]{8})$/;
  async function guardarVideo(token, b) {
    const p = await usuarioDelToken(token);
    if (p.rol !== 'secretaria') throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica publica videos.');
    const v = b.video || {};
    const codigo = String(v.codigo || '');
    if (!RE_VIDEO.test(codigo)) throw new Falla(400, 'codigo', 'El código del video no es válido.');
    const youtube_id = /^[\w-]{11}$/.test(v.youtube_id || '') ? v.youtube_id : null;
    const drive_id = /^[\w-]{20,}$/.test(v.drive_id || '') ? v.drive_id : null;
    if (!youtube_id && !drive_id) throw new Falla(400, 'video', 'Pega el enlace del video de YouTube o de Google Drive.');
    const fila = {
      codigo, titulo: texto(v.titulo, 140) || codigo, youtube_id, drive_id,
      duracion_min: Number(v.duracion_min) > 0 ? Math.min(300, Math.round(Number(v.duracion_min))) : null,
      audiencia: v.audiencia === 'emprendedoras' ? 'emprendedoras' : 'equipo',
      curso: texto(v.curso, 40), unidad: Number(v.unidad) || 1,
      satelite: SATELITES[v.satelite] ? v.satelite : null, fecha: /^\d{4}-\d{2}-\d{2}$/.test(v.fecha || '') ? v.fecha : null,
      creado_por: p.id, creado_en: hoy(),
    };
    await col('videos').doc(codigo).set(fila);
    return { ok: true, video: fila };
  }
  async function quitarVideo(token, b) {
    const p = await usuarioDelToken(token);
    if (p.rol !== 'secretaria') throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica quita videos.');
    await col('videos').doc(String(b.codigo || '')).delete();
    return { ok: true };
  }

  // Dinamizadora de una emprendedora: la asignada o la de «acompañamiento» de su satélite.
  async function miDinamizadora(token) {
    const p = await usuarioDelToken(token);
    let d = p.dinamizadora_cedula ? await datos(col('directorio').doc(p.dinamizadora_cedula)) : null;
    if (!d && p.satelite) {
      const del = (await lista(col('directorio').where('satelite', '==', p.satelite)))
        .filter((x) => x.rol === 'dinamizadora').sort((a, b) => a._id.localeCompare(b._id));
      d = del.find((x) => /acompa/i.test(x.cargo || '')) || del[0] || null;
    }
    return { dinamizadora: d ? { nombre: d.nombre, cargo: d.cargo || null, celular: d.celular || null } : null };
  }

  // Seguimiento: la Secretaría ve a todas las personas; la dinamizadora, a las emprendedoras de su departamento.
  async function verPerfiles(token) {
    const p = await usuarioDelToken(token);
    if (p.rol === 'emprendedora') throw new Falla(403, 'permiso', 'Esta lista es para el equipo del CIC.');
    const filas = p.rol === 'secretaria' ? await lista(col('perfiles')) : await lista(col('perfiles').where('rol', '==', 'emprendedora'));
    const visibles = p.rol === 'secretaria' ? filas : filas.filter((x) => x.departamento === p.departamento);
    return { perfiles: visibles.map((x) => publico(x._id, x)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) };
  }
  async function fijarSemana(token, b) {
    const p = await usuarioDelToken(token);
    if (p.rol === 'emprendedora') throw new Falla(403, 'permiso', 'Solo el equipo del CIC puede cambiar la semana.');
    const semana = Number(b.semana);
    if (!Number.isInteger(semana) || semana < 1 || semana > 6) throw new Falla(400, 'semana', 'La semana debe estar entre 1 y 6.');
    const e = await perfilPorCedula(validarCedula(b.cedula));
    if (!e || e.rol !== 'emprendedora' || (p.rol !== 'secretaria' && e.departamento !== p.departamento)) throw new Falla(404, 'no_existe', 'No encontramos a esa emprendedora en tu departamento.');
    await col('perfiles').doc(e.id).update({ semana_actual: semana });
    return { ok: true };
  }

  // ================================================================ Cursos del equipo
  async function contexto(persona) {
    const [progreso, evidencias, hitos, constancias, videos] = await Promise.all([
      lista(col('progreso').where('persona', '==', persona)),
      lista(col('evidencias').where('persona', '==', persona)),
      lista(col('hitos').where('persona', '==', persona)),
      lista(col('constancias').where('persona', '==', persona)),
      lista(col('videos').where('audiencia', '==', 'equipo')),
    ]);
    return {
      progreso, evidencias,
      hitos: new Set(hitos.map((h) => h.hito)),
      hitosLista: hitos.map((h) => ({ hito: h.hito, fecha: h.fecha })),
      constancias: constancias.map((c) => ({ codigo: c._id, curso: c.curso, emitida_en: c.emitida_en })),
      videos: new Set(videos.map((v) => v.codigo)),
    };
  }
  const filaDe = (ctx, curso, u) => ctx.progreso.find((p) => p.curso === curso && p.unidad === u);
  const evidenciaDe = (ctx, curso, u) => ctx.evidencias.find((e) => e.curso === curso && e.unidad === u && e.tipo === CURSOS[curso].evidencia);
  const tieneVideo = (ctx, curso, u) => ctx.videos.has(`${CURSOS[curso].prefijo}${u}`);
  const aprobada = (ctx, curso, u) => !!(filaDe(ctx, curso, u) || {}).aprobado_en;

  // Qué falta para abrir una unidad (null = abierta)
  function requisito(perfil, ctx, curso, u) {
    if (!CURSOS[curso].roles.includes(perfil.rol)) return 'Este curso es solo para la Secretaría Técnica.';
    if (u > 1) {
      if (!aprobada(ctx, curso, u - 1)) return `Se abre cuando apruebes el cuestionario de la unidad ${u - 1}.`;
      if (!evidenciaDe(ctx, curso, u - 1)) return `Se abre cuando envíes la ${CURSOS[curso].evidencia === 'actividad' ? 'actividad' : 'verificación de la sesión'} de la unidad ${u - 1}.`;
      return null;
    }
    if (curso === 'gestion') return ctx.hitos.has('compromiso') ? null : 'Se abre cuando confirmes tu compromiso como parte del equipo.';
    if (!ctx.constancias.some((c) => c.curso === 'gestion')) return 'Se abre cuando apruebes el curso Gestión del CIC.';
    if (curso === 'formacion-secretaria') return null;
    // La Secretaría abre las rutas al terminar su formación; las dinamizadoras, con la transferencia.
    if (perfil.rol === 'secretaria') return ctx.constancias.some((c) => c.curso === 'formacion-secretaria') ? null : 'Se abre cuando termines la Formación de la Secretaría Técnica.';
    const t = curso === 'acompanar-hacer' ? 'transferencia-hacer' : 'transferencia-ser';
    return ctx.hitos.has(t) ? null : 'Se abre cuando la Secretaría Técnica registre tu transferencia de la ruta.';
  }

  function estadoUnidad(perfil, ctx, curso, u) {
    const f = filaDe(ctx, curso, u) || {};
    const ev = evidenciaDe(ctx, curso, u);
    const falta = requisito(perfil, ctx, curso, u);
    const video = tieneVideo(ctx, curso, u);
    let estado = 'disponible';
    if (falta) estado = 'bloqueada';
    else if (f.aprobado_en) estado = 'aprobada';
    else if (f.bloqueado_en) estado = 'pausada';
    else if (f.video_en || f.material_en || f.intentos) estado = 'en-curso';
    const listo = !!f.material_en && (!video || !!f.video_en);
    const conCuestionario = CURSOS[curso].cuestionario;
    return {
      unidad: u, estado, motivo: falta,
      tiene_video: video, sin_cuestionario: !conCuestionario,
      video_visto: !!f.video_en, material_visto: !!f.material_en,
      intentos: f.intentos || 0, intentos_max: INTENTOS_POR_RONDA, ronda: f.ronda || 1,
      mejor_nota: f.mejor_nota ?? null, aprobado_en: f.aprobado_en || null,
      puede_cuestionario: conCuestionario && !falta && !f.aprobado_en && !f.bloqueado_en && (f.intentos || 0) < INTENTOS_POR_RONDA && listo,
      evidencia: ev ? { estado: ev.estado, comentario: ev.comentario || null, texto: ev.texto || null, enlace: ev.enlace || null } : null,
    };
  }

  function resumen(perfil, ctx) {
    const cursos = {};
    for (const c of Object.keys(CURSOS).filter((k) => CURSOS[k].roles.includes(perfil.rol))) {
      cursos[c] = Array.from({ length: CURSOS[c].unidades }, (_, i) => estadoUnidad(perfil, ctx, c, i + 1));
    }
    return { cursos, hitos: ctx.hitosLista, constancias: ctx.constancias, reglas: { preguntas: PREGUNTAS_POR_INTENTO, nota_minima: NOTA_MINIMA, intentos: INTENTOS_POR_RONDA } };
  }

  async function miProgreso(token) {
    const p = await usuarioDelToken(token);
    if (p.rol === 'emprendedora') throw new Falla(403, 'permiso', 'Los cursos son para el equipo del CIC.');
    return resumen(p, await contexto(p.id));
  }

  async function equipoAbierto(token, b) {
    const perfil = await usuarioDelToken(token);
    if (perfil.rol === 'emprendedora') throw new Falla(403, 'permiso', 'Los cursos son para el equipo del CIC.');
    const { curso, unidad } = validarCurso(b.curso, b.unidad);
    const ctx = await contexto(perfil.id);
    const falta = requisito(perfil, ctx, curso, unidad);
    if (falta) throw new Falla(403, 'bloqueada', falta);
    return { perfil, ctx, curso, unidad };
  }
  const idProgreso = (persona, curso, unidad) => `${persona}_${curso}_${unidad}`;
  async function guardarProgreso(persona, curso, unidad, cambios) {
    await col('progreso').doc(idProgreso(persona, curso, unidad)).set({ persona, curso, unidad, ...cambios, actualizado_en: hoy() }, { merge: true });
  }

  // Marca el video o el material como vistos. Si la unidad estaba en pausa y ya repasó ambos, se reabre.
  async function marcar(token, b) {
    const { perfil, ctx, curso, unidad } = await equipoAbierto(token, b);
    const que = String(b.que ?? '');
    if (que !== 'video' && que !== 'material') throw new Falla(400, 'que', 'Indica si viste el video o el material.');
    const f = filaDe(ctx, curso, unidad) || {};
    const t = hoy();
    const cambios = que === 'video' ? { video_en: t } : { material_en: t };
    if (f.bloqueado_en) {
      const video = que === 'video' ? t : f.video_en;
      const mat = que === 'material' ? t : f.material_en;
      const repasoVideo = !tieneVideo(ctx, curso, unidad) || (video && video > f.bloqueado_en);
      if (repasoVideo && mat && mat > f.bloqueado_en) Object.assign(cambios, { bloqueado_en: null, intentos: 0, ronda: (f.ronda || 1) + 1 });
    }
    await guardarProgreso(perfil.id, curso, unidad, cambios);
    return resumen(perfil, await contexto(perfil.id));
  }

  // Material de estudio: enlaces guardados en la colección «material» (documentos curso_unidad y curso_general).
  // Solo se entregan si la unidad está abierta.
  async function material(token, b) {
    const { perfil, curso, unidad } = await equipoAbierto(token, b);
    const archivos = [];
    for (const id of [`${curso}_${unidad}`, `${curso}_general`]) {
      const m = await datos(col('material').doc(id));
      for (const a of (m && m.archivos) || []) if (a && /^https:\/\//.test(a.url || '')) archivos.push({ nombre: String(a.nombre || 'Material'), url: a.url });
    }
    if (archivos.length) await guardarProgreso(perfil.id, curso, unidad, { material_en: hoy() });
    return { archivos };
  }

  // Abre un intento: 5 preguntas al azar del banco, sin la respuesta correcta.
  async function cuestionario(token, b) {
    const { perfil, ctx, curso, unidad } = await equipoAbierto(token, b);
    if (!CURSOS[curso].cuestionario) throw new Falla(400, 'sin_cuestionario', 'Esta unidad no tiene cuestionario: se aprueba al enviar la actividad.');
    const est = estadoUnidad(perfil, ctx, curso, unidad);
    if (!est.puede_cuestionario) {
      throw new Falla(403, 'no_disponible', est.aprobado_en ? 'Ya aprobaste este cuestionario.'
        : est.estado === 'pausada' ? 'Perdiste los dos intentos. Repasa el video y el material para volver a intentarlo.'
        : 'Primero mira el video y repasa el material de estudio.');
    }
    const banco = (await lista(col('preguntas').where('curso', '==', curso))).filter((p) => p.unidad === unidad);
    if (!banco.length) throw new Falla(503, 'sin_banco', 'El cuestionario de este módulo todavía no está cargado. Avísale a la Secretaría Técnica.');
    const elegidas = barajar(banco).slice(0, PREGUNTAS_POR_INTENTO);
    const ref = await col('cuestionarios').add({ persona: perfil.id, curso, unidad, preguntas: elegidas.map((p) => p._id), creado_en: hoy(), respondido_en: null });
    return {
      id: ref.id, intento: est.intentos + 1, de: INTENTOS_POR_RONDA, nota_minima: NOTA_MINIMA, minutos: MINUTOS_CUESTIONARIO,
      preguntas: elegidas.map((p) => ({ id: p._id, enunciado: p.enunciado, opciones: p.opciones })),
    };
  }

  // Califica aquí. Muestra cuáles fallaron y su retroalimentación, sin revelar la opción correcta.
  async function responder(token, b) {
    const perfil = await usuarioDelToken(token);
    const ref = col('cuestionarios').doc(String(b.id ?? '') || '-');
    const c = await datos(ref);
    if (!c || c.persona !== perfil.id) throw new Falla(404, 'intento', 'No encontramos este intento. Vuelve a abrir el cuestionario.');
    if (c.respondido_en) throw new Falla(409, 'respondido', 'Este intento ya se calificó.');
    if (ahora() - new Date(c.creado_en) > MINUTOS_CUESTIONARIO * 60000) throw new Falla(410, 'vencido', 'El intento venció. Abre el cuestionario de nuevo.');
    const resp = Array.isArray(b.respuestas) ? b.respuestas.map(Number) : [];
    if (resp.length !== c.preguntas.length || resp.some((x) => !Number.isInteger(x) || x < 0)) throw new Falla(400, 'respuestas', 'Responde todas las preguntas.');
    const detalle = [];
    for (let i = 0; i < c.preguntas.length; i++) {
      const p = await datos(col('preguntas').doc(String(c.preguntas[i])));
      const bien = !!p && p.correcta === resp[i];
      detalle.push({ id: c.preguntas[i], bien, retro: bien ? null : ((p && p.retro) || 'Repasa este tema en el video y en el material de estudio.') });
    }
    const nota = detalle.filter((d) => d.bien).length;
    // Se marca como respondido antes de sumar el intento: así no se puede calificar dos veces.
    await ref.update({ respuestas: resp, nota, respondido_en: hoy() });
    const ctx = await contexto(perfil.id);
    const f = filaDe(ctx, c.curso, c.unidad) || {};
    const intentos = (f.intentos || 0) + 1;
    const aprobado = nota >= NOTA_MINIMA;
    await guardarProgreso(perfil.id, c.curso, c.unidad, {
      intentos, mejor_nota: Math.max(f.mejor_nota || 0, nota),
      ...(aprobado ? { aprobado_en: hoy() } : intentos >= INTENTOS_POR_RONDA ? { bloqueado_en: hoy() } : {}),
    });
    const constancia = aprobado ? await emitirSiCompleto(perfil, c.curso) : null;
    return { nota, de: c.preguntas.length, aprobado, pausado: !aprobado && intentos >= INTENTOS_POR_RONDA, intentos, detalle, constancia, progreso: resumen(perfil, await contexto(perfil.id)) };
  }

  // Actividad (Gestión y Formación) o verificación de la sesión (HACER y SER): texto y/o enlace a la evidencia.
  async function entregar(token, b) {
    const { perfil, ctx, curso, unidad } = await equipoAbierto(token, b);
    const previa = filaDe(ctx, curso, unidad);
    if (!CURSOS[curso].cuestionario && !(previa && previa.material_en)) throw new Falla(400, 'material', 'Primero repasa el material de estudio de esta unidad.');
    const txt = String(b.texto ?? '').trim().slice(0, 4000);
    const enlace = String(b.enlace ?? '').trim().slice(0, 500);
    if (txt.length < 20 && !enlace) throw new Falla(400, 'evidencia', 'Escribe tu respuesta (al menos unas líneas) o pega el enlace a tu evidencia.');
    if (enlace && !/^https:\/\/\S+$/.test(enlace)) throw new Falla(400, 'enlace', 'El enlace debe empezar por https:// (por ejemplo, un archivo de Google Drive).');
    const tipo = CURSOS[curso].evidencia;
    await col('evidencias').doc(`${perfil.id}_${curso}_${unidad}_${tipo}`).set({
      persona: perfil.id, curso, unidad, tipo, texto: txt || null, enlace: enlace || null,
      estado: 'enviada', comentario: null, revisado_por: null, revisado_en: null, creado_en: hoy(),
    });
    if (!CURSOS[curso].cuestionario && !(previa && previa.aprobado_en)) await guardarProgreso(perfil.id, curso, unidad, { aprobado_en: hoy() });
    const constancia = await emitirSiCompleto(perfil, curso);
    return { ok: true, constancia, progreso: resumen(perfil, await contexto(perfil.id)) };
  }

  // El compromiso lo confirma cada persona; las transferencias, solo la Secretaría Técnica.
  async function hito(token, b) {
    const quien = await usuarioDelToken(token);
    const h = String(b.hito ?? '');
    if (h === 'compromiso') {
      if (quien.rol === 'emprendedora') throw new Falla(403, 'permiso', 'Este paso es para el equipo del CIC.');
      await col('hitos').doc(`${quien.id}_${h}`).set({ persona: quien.id, hito: h, fecha: hoy(), marcado_por: quien.id });
      return resumen(quien, await contexto(quien.id));
    }
    if (h !== 'transferencia-hacer' && h !== 'transferencia-ser') throw new Falla(400, 'hito', 'Hito desconocido.');
    if (quien.rol !== 'secretaria') throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica registra las transferencias.');
    const persona = await perfilPorCedula(validarCedula(b.cedula));
    if (!persona || persona.rol === 'emprendedora') throw new Falla(404, 'no_existe', 'Esa persona del equipo aún no ha activado su cuenta.');
    const ref = col('hitos').doc(`${persona.id}_${h}`);
    if (b.quitar === true) await ref.delete();
    else await ref.set({ persona: persona.id, hito: h, fecha: hoy(), marcado_por: quien.id });
    return { ok: true };
  }

  // La Secretaría Técnica aprueba o devuelve (con comentario) una evidencia.
  async function revisar(token, b) {
    const quien = await usuarioDelToken(token);
    if (quien.rol !== 'secretaria') throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica revisa evidencias.');
    const estado = String(b.estado ?? '');
    if (estado !== 'aprobada' && estado !== 'devuelta') throw new Falla(400, 'estado', 'Elige aprobar o devolver.');
    const comentario = texto(b.comentario, 1000);
    if (estado === 'devuelta' && comentario.length < 5) throw new Falla(400, 'comentario', 'Cuando devuelves una evidencia, escribe qué debe ajustar.');
    const ref = col('evidencias').doc(String(b.id ?? '') || '-');
    if (!(await datos(ref))) throw new Falla(404, 'no_existe', 'No encontramos esa evidencia.');
    await ref.update({ estado, comentario: comentario || null, revisado_por: quien.id, revisado_en: hoy() });
    return { ok: true };
  }

  // Panel de la Secretaría: avance de todo el equipo y evidencias por revisar.
  async function equipo(token) {
    const quien = await usuarioDelToken(token);
    if (quien.rol !== 'secretaria') throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica ve el avance del equipo.');
    const [dir, perf, prog, evid, hit, cons] = await Promise.all(['directorio', 'perfiles', 'progreso', 'evidencias', 'hitos', 'constancias'].map((n) => lista(col(n))));
    const delEquipo = perf.filter((p) => p.rol !== 'emprendedora');
    const cuentasPorCedula = new Map(delEquipo.map((p) => [p.cedula, p]));
    const personas = dir.map((d) => {
      const id = (cuentasPorCedula.get(d._id) || {})._id;
      const avance = {};
      for (const c of Object.keys(CURSOS)) avance[c] = prog.filter((p) => p.persona === id && p.curso === c && p.aprobado_en).length;
      const ultima = prog.filter((p) => p.persona === id).map((p) => p.actualizado_en).sort().pop() || null;
      return {
        cedula: d._id, nombre: d.nombre, rol: d.rol, cargo: d.cargo || null, departamento: d.departamento || null, satelite: d.satelite || null, celular: d.celular || null,
        activa: !!id, avance, ultima_actividad: ultima,
        pausas: prog.filter((p) => p.persona === id && p.bloqueado_en).length,
        hitos: hit.filter((h) => h.persona === id).map((h) => h.hito),
        constancias: cons.filter((x) => x.persona === id).map((x) => ({ curso: x.curso, codigo: x._id })),
      };
    });
    const nombrePorId = new Map(delEquipo.map((p) => [p._id, p.nombre]));
    const pendientes = evid.filter((e) => e.estado === 'enviada')
      .map(({ _id, persona, ...e }) => ({ id: _id, ...e, nombre: nombrePorId.get(persona) || '' }))
      .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
    return { personas, pendientes, unidades: Object.fromEntries(Object.entries(CURSOS).map(([k, v]) => [k, v.unidades])) };
  }

  // Constancia: al aprobar todas las unidades y enviar todas las evidencias del curso.
  async function emitirSiCompleto(perfil, curso) {
    const ctx = await contexto(perfil.id);
    if (ctx.constancias.some((c) => c.curso === curso)) return null;
    for (let u = 1; u <= CURSOS[curso].unidades; u++) if (!aprobada(ctx, curso, u) || !evidenciaDe(ctx, curso, u)) return null;
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const codigo = `CIC-${CURSOS[curso].prefijo.replace('-', '')}-${Array.from({ length: 6 }, () => alfabeto[crypto.randomInt(alfabeto.length)]).join('')}`;
    await col('constancias').doc(codigo).set({ persona: perfil.id, curso, nombre: perfil.nombre, emitida_en: hoy() });
    return { codigo, curso, nombre_curso: CURSOS[curso].nombre };
  }

  // Verificación pública de una constancia: solo iniciales, por privacidad.
  async function verificar(b) {
    const codigo = texto(b.codigo, 30).toUpperCase();
    if (!/^CIC-[A-Z]{3}[A-Z]-[A-Z0-9]{6}$/.test(codigo)) throw new Falla(400, 'codigo', 'Revisa el código: tiene la forma CIC-GESM-ABC123.');
    const c = await datos(col('constancias').doc(codigo));
    if (!c) return { valida: false };
    return { valida: true, iniciales: iniciales(c.nombre), curso: (CURSOS[c.curso] || {}).nombre || c.curso, emitida_en: c.emitida_en };
  }

  // ---------- Entrada única ----------
  async function atender(b, token) {
    try {
      let r;
      switch (b && b.accion) {
        // Acceso
        case 'ingresar': r = await ingresar(b); break;
        case 'registro': r = await registrar(b); break;
        case 'solicitar-enlace': case 'solicitar-codigo': r = await solicitarEnlace(b); break;
        case 'activar': r = await activar(b); break;
        case 'generar-codigo': case 'restablecer': r = await generarCodigo(token, b); break;
        case 'cambiar-clave': r = await cambiarClave(token, b); break;
        // Panel
        case 'mi-perfil': r = { perfil: await miPerfil(token) }; break;
        case 'actualizar-contacto': r = await actualizarContacto(token, b); break;
        case 'videos': r = await verVideos(token); break;
        case 'guardar-video': r = await guardarVideo(token, b); break;
        case 'quitar-video': r = await quitarVideo(token, b); break;
        case 'mi-dinamizadora': r = await miDinamizadora(token); break;
        case 'perfiles': r = await verPerfiles(token); break;
        case 'fijar-semana': r = await fijarSemana(token, b); break;
        // Cursos del equipo
        case 'mi-progreso': r = await miProgreso(token); break;
        case 'marcar': r = await marcar(token, b); break;
        case 'material': r = await material(token, b); break;
        case 'cuestionario': r = await cuestionario(token, b); break;
        case 'responder': r = await responder(token, b); break;
        case 'entregar': r = await entregar(token, b); break;
        case 'hito': r = await hito(token, b); break;
        case 'revisar': r = await revisar(token, b); break;
        case 'equipo': r = await equipo(token); break;
        case 'verificar': r = await verificar(b); break;
        default: throw new Falla(400, 'accion', 'Acción desconocida.');
      }
      return { estado: 200, cuerpo: r };
    } catch (e) {
      if (e instanceof Falla) return { estado: e.estado, cuerpo: { codigo: e.codigo, mensaje: e.message, ...e.extra } };
      console.error(e);
      return { estado: 500, cuerpo: { codigo: 'error', mensaje: 'Algo salió mal. Intenta de nuevo en un momento.' } };
    }
  }

  return { atender };
}

module.exports = { crearLogica, CURSOS, SATELITES, DOMINIO_INTERNO };
