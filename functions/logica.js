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
  gestion: { unidades: 4, prefijo: 'GES-M', nombre: 'Gestión del CIC', evidencia: 'actividad', cuestionario: true, roles: ['secretaria', 'dinamizadora'] },
  'formacion-secretaria': { unidades: 6, prefijo: 'STF-U', nombre: 'Formación de la Secretaría Técnica', evidencia: 'actividad', cuestionario: false, roles: ['secretaria'] },
  'acompanar-hacer': { unidades: 6, prefijo: 'HAC-S', nombre: 'Acompañar la ruta HACER', evidencia: 'verificacion', cuestionario: true, roles: ['secretaria', 'dinamizadora'] },
  'facilitar-ser': { unidades: 4, prefijo: 'SER-T', nombre: 'Facilitar la ruta SER', evidencia: 'verificacion', cuestionario: true, roles: ['secretaria', 'dinamizadora'] },
};
const PREGUNTAS_POR_INTENTO = 10; // el banco oficial (octubre 2026) tiene 10 preguntas por evaluación
const NOTA_MINIMA = 7;            // 70 %: 7 de 10
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
  id, cedula: p.cedula, nombre: p.nombre, rol: p.rol, cargo: p.cargo || null, subtitulo: p.subtitulo || null, correo: p.correo || null,
  celular: p.celular || null, departamento: p.departamento || null, municipio: p.municipio || null,
  negocio: p.negocio || null, satelite: p.satelite || null, semana_actual: p.semana_actual || 1,
  creado_en: p.creado_en || null, debe_cambiar_clave: false,
});

function crearLogica({ db, cuentas, ahora = () => new Date(), catalogo = { archivos: {}, material: {} }, leerArchivo = () => null, drive = null }) {
  const CATALOGO = catalogo;
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
      nombre: d.nombre, rol: d.rol, cargo: d.cargo || null, subtitulo: d.subtitulo || null, correo: d.correo || null, celular: d.celular || null,
      departamento: d.departamento || null, satelite: d.satelite || null,
    });
  }

  // La persona escribe su cédula y le llega al correo un enlace (no un código) para crear o cambiar su contraseña.
  // Cada intento queda en la colección «envios_correo» (enviado, fallido u omitido, con el motivo) y las fallas
  // también en el registro de la Cloud Function. A quien sí tiene correo se le muestra a cuál se envió, oculto en parte.
  const mascaraCorreo = (c) => { const [u, dom] = String(c || '').split('@'); return dom ? `${u.slice(0, 3)}${'*'.repeat(Math.max(3, u.length - 3))}@${dom}` : null; };
  async function registrarEnvio(cedula, estado, extra = {}) {
    if (estado === 'fallido') console.error(`Correo de contraseña NO enviado (cédula ${cedula}, ${extra.correo || ''}): ${extra.error || ''}`);
    try { await col('envios_correo').add({ cedula, tipo: 'enlace_contrasena', estado, rol: null, correo: null, motivo: null, error: null, ...extra, creado_en: hoy() }); }
    catch (e) { console.error('No se pudo guardar el registro de envío:', e.message); }
  }
  async function solicitarEnlace(b) {
    const cedula = validarCedula(b.cedula);
    const sinCorreo = {
      ok: true, enviado: false,
      mensaje: 'Si esta cédula está registrada con un correo, te llegó un enlace para crear tu contraseña. Si no tienes correo registrado o no te llega, pídele un código a la Secretaría Técnica o a tu dinamizadora, o toca «¿No puedes entrar? Pide soporte».',
    };
    const previo = await datos(col('enlaces').doc(cedula));
    if (previo && ahora() - new Date(previo.enviado_en) < 2 * 60000) { // máximo uno cada 2 minutos
      await registrarEnvio(cedula, 'omitido', { motivo: 'Pidió otro antes de 2 minutos', correo: previo.correo || null });
      return { ok: true, enviado: false, reciente: true, correo: previo.correo || null, mensaje: `Ya te enviamos un enlace hace menos de 2 minutos${previo.correo ? ` a ${previo.correo}` : ''}. Revisa tu correo (también «Spam», «Correo no deseado» o «Promociones») antes de pedir otro: solo sirve el último.` };
    }
    const d = await destinatario(cedula);
    if (!d) { await registrarEnvio(cedula, 'omitido', { motivo: 'Cédula no registrada' }); return sinCorreo; }
    let p = d.perfil;
    if (!p) {
      if (!correoValido(d.correo)) { await registrarEnvio(cedula, 'omitido', { motivo: 'Sin correo en el directorio', rol: d.rol || null }); return sinCorreo; }
      p = await cuentaDesdeDirectorio(cedula, d.directorio, claveAlAzar());
    }
    if (esInterno(p.cuenta_email)) { await registrarEnvio(cedula, 'omitido', { motivo: 'La cuenta no tiene correo real', rol: p.rol }); return sinCorreo; }
    const correo = mascaraCorreo(p.cuenta_email);
    try {
      await cuentas.enviarEnlace(p.cuenta_email);
    } catch (e) {
      await registrarEnvio(cedula, 'fallido', { correo, rol: p.rol, error: String((e && e.message) || e).slice(0, 300) });
      return { ok: true, enviado: false, correo, mensaje: `No pudimos enviar el correo a ${correo} en este momento. Intenta de nuevo en unos minutos o pídele un código a la Secretaría Técnica.` };
    }
    await col('enlaces').doc(cedula).set({ enviado_en: hoy(), correo });
    await registrarEnvio(cedula, 'enviado', { correo, rol: p.rol });
    return {
      ok: true, enviado: true, correo,
      mensaje: `Te enviamos un enlace a ${correo}. Abre el correo «Restablece tu contraseña» y toca el enlace: no llega un código de números. Vence en 1 hora y solo sirve el último que pidas. Si no lo ves en unos minutos, revisa «Spam», «Correo no deseado» o «Promociones». ¿Ese no es tu correo? Pide soporte o un código a la Secretaría Técnica.`,
    };
  }
  // Administración: últimos envíos de correo
  async function verEnviosCorreo(token) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Este registro es para la administración.');
    const filas = (await lista(col('envios_correo'))).sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en))).slice(0, 300);
    const nombres = {};
    for (const x of await lista(col('perfiles'))) nombres[x.cedula] = x.nombre;
    for (const x of await lista(col('directorio'))) nombres[x._id] = nombres[x._id] || x.nombre;
    return { envios: filas.map((x) => ({ cedula: x.cedula, nombre: nombres[x.cedula] || null, estado: x.estado, motivo: x.motivo || null, error: x.error || null, correo: x.correo || null, rol: x.rol || null, creado_en: x.creado_en })) };
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

  // Administradora: rol aparte que solo gestiona el contenido (videos y material) desde admin/.
  const esAdmin = (p) => p.rol === 'administradora';
  const idYoutube = (u) => { const m = String(u || '').match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/); return m ? m[1] : null; };
  const idDrive = (u) => { const m = String(u || '').match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{20,})/); return m ? m[1] : null; };

  async function verVideos(token) {
    const p = await usuarioDelToken(token);
    const todos = await lista(col('videos'));
    const visibles = p.rol === 'emprendedora' ? todos.filter((v) => v.audiencia === 'emprendedoras' && (!v.satelite || v.satelite === p.satelite)) : todos;
    return { videos: visibles.map(({ _id, ...v }) => v).sort((a, b) => a.codigo.localeCompare(b.codigo)) };
  }
  const RE_VIDEO = /^(BIENVENIDA|GES-M[1-4]|STF-U[1-6]|HAC-S[1-6]|SER-T[1-4]|GRAB-SER[1-4]-[A-Z]{3,5}-[0-9]{8})$/;
  async function guardarVideo(token, b) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Solo la administración de la plataforma publica videos.');
    const v = b.video || {};
    const codigo = String(v.codigo || '');
    if (!RE_VIDEO.test(codigo)) throw new Falla(400, 'codigo', 'El código del video no es válido.');
    const youtube_id = /^[\w-]{11}$/.test(v.youtube_id || '') ? v.youtube_id : idYoutube(v.url);
    const drive_id = youtube_id ? null : (/^[\w-]{20,}$/.test(v.drive_id || '') ? v.drive_id : idDrive(v.url));
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
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Solo la administración de la plataforma quita videos.');
    await col('videos').doc(String(b.codigo || '')).delete();
    return { ok: true };
  }

  // Panel de administración: contenido de cada unidad (video y material), grabaciones y tamaño de los bancos
  async function adminContenido(token) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Esta sección es solo para la administración de la plataforma.');
    const [videos, material, preguntas] = await Promise.all([lista(col('videos')), lista(col('material')), lista(col('preguntas'))]);
    const porCodigo = Object.fromEntries(videos.map(({ _id, ...v }) => [v.codigo, v]));
    const mat = Object.fromEntries(material.filter((m) => { const [c, u] = m._id.split('_'); return enlacesVigentes(m, CURSOS[c] && u !== 'general' ? idsMaterial(c, Number(u)).some((k) => CATALOGO.archivos[k]) : false); }).map((m) => [m._id, m.archivos || []]));
    const bancos = {};
    for (const q of preguntas) { const k = `${q.curso}_${q.unidad}`; bancos[k] = (bancos[k] || 0) + 1; }
    const cursos = Object.fromEntries(Object.entries(CURSOS).map(([id, c]) => [id, {
      nombre: c.nombre, prefijo: c.prefijo, cuestionario: c.cuestionario,
      general: mat[`${id}_general`] || [],
      unidades: Array.from({ length: c.unidades }, (_, i) => ({
        unidad: i + 1, codigo: `${c.prefijo}${i + 1}`, video: porCodigo[`${c.prefijo}${i + 1}`] || null,
        material: mat[`${id}_${i + 1}`] || [], preguntas: bancos[`${id}_${i + 1}`] || 0,
        archivos: idsMaterial(id, i + 1).filter((k) => CATALOGO.archivos[k]).map((k) => CATALOGO.archivos[k].nombre),
      })),
    }]));
    const grabaciones = videos.filter((v) => v.audiencia === 'emprendedoras').map(({ _id, ...v }) => v).sort((a, b) => a.codigo.localeCompare(b.codigo));
    return { cursos, grabaciones, bienvenida: porCodigo.BIENVENIDA || null };
  }
  async function adminGuardarMaterial(token, b) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Solo la administración de la plataforma carga el material.');
    const curso = String(b.curso || '');
    if (!CURSOS[curso]) throw new Falla(400, 'curso', 'Ese curso no existe.');
    const unidad = b.unidad === 'general' ? 'general' : Number(b.unidad);
    if (unidad !== 'general' && (!Number.isInteger(unidad) || unidad < 1 || unidad > CURSOS[curso].unidades)) throw new Falla(400, 'curso', 'Esa unidad no existe.');
    const archivos = (Array.isArray(b.archivos) ? b.archivos : []).slice(0, 15).map((a) => ({ nombre: texto(a && a.nombre, 120) || 'Material', url: String((a && a.url) || '').trim() }));
    const malo = archivos.find((a) => !/^https:\/\/\S+$/.test(a.url));
    if (malo) throw new Falla(400, 'url', `El enlace de «${malo.nombre}» debe empezar por https:// (por ejemplo, un archivo de Google Drive).`);
    await col('material').doc(`${curso}_${unidad}`).set({ archivos, actualizado_por: p.id, actualizado_en: hoy() });
    return { ok: true, archivos };
  }

  // ================================================================ Foro de la comunidad
  // Solo para personas con cuenta (equipo y emprendedoras). La Secretaría y la administración moderan.
  const FORO_CATEGORIAS = { general: 'Conversación general', hacer: 'Ruta HACER', ser: 'Ruta SER', ventas: 'Mercados y ventas', finanzas: 'Ahorro y financiamiento', equipo: 'Equipo del CIC' };
  const autorDe = (p) => { const n = String(p.nombre || '').trim().split(/\s+/); return `${n[0] || 'Participante'}${n[1] ? ` ${n[1][0]}.` : ''}`; };
  const moderador = (p) => p.rol === 'secretaria' || esAdmin(p);
  async function foroTemas(token, b) {
    const p = await usuarioDelToken(token);
    let temas = (await lista(col('foro_temas'))).filter((t) => !t.borrado);
    if (b.categoria && FORO_CATEGORIAS[b.categoria]) temas = temas.filter((t) => t.categoria === b.categoria);
    if (p.rol === 'emprendedora') temas = temas.filter((t) => t.categoria !== 'equipo');
    temas.sort((a, b2) => (b2.fijado ? 1 : 0) - (a.fijado ? 1 : 0) || String(b2.ultima_actividad).localeCompare(String(a.ultima_actividad)));
    return {
      categorias: Object.fromEntries(Object.entries(FORO_CATEGORIAS).filter(([k]) => p.rol !== 'emprendedora' || k !== 'equipo')),
      puede_moderar: moderador(p),
      temas: temas.slice(0, 100).map((t) => ({ id: t._id, titulo: t.titulo, categoria: t.categoria, autor: t.autor, autor_rol: t.autor_rol, extracto: String(t.texto).slice(0, 180), respuestas: t.respuestas || 0, creado_en: t.creado_en, ultima_actividad: t.ultima_actividad, fijado: !!t.fijado })),
    };
  }
  async function foroTema(token, b) {
    const p = await usuarioDelToken(token);
    const t = await datos(col('foro_temas').doc(String(b.id || '-')));
    if (!t || t.borrado || (t.categoria === 'equipo' && p.rol === 'emprendedora')) throw new Falla(404, 'no_existe', 'Esta conversación ya no existe.');
    const resp = (await lista(col('foro_respuestas').where('tema', '==', String(b.id)))).filter((r) => !r.borrado).sort((a, b2) => a.creado_en.localeCompare(b2.creado_en));
    const propio = (x) => x.autor_id === p.id;
    return {
      puede_moderar: moderador(p),
      tema: { id: String(b.id), titulo: t.titulo, categoria: t.categoria, categoria_nombre: FORO_CATEGORIAS[t.categoria], texto: t.texto, autor: t.autor, autor_rol: t.autor_rol, creado_en: t.creado_en, fijado: !!t.fijado, mio: propio(t) },
      respuestas: resp.map((r) => ({ id: r._id, texto: r.texto, autor: r.autor, autor_rol: r.autor_rol, creado_en: r.creado_en, mio: propio(r) })),
    };
  }
  async function foroLimite(p) {
    const ultimo = await datos(col('foro_limites').doc(p.id));
    if (ultimo && ahora() - new Date(ultimo.en) < 20000) throw new Falla(429, 'despacio', 'Espera unos segundos antes de volver a publicar.');
    await col('foro_limites').doc(p.id).set({ en: hoy() });
  }
  async function foroPublicar(token, b) {
    const p = await usuarioDelToken(token);
    const categoria = String(b.categoria || '');
    const titulo = texto(b.titulo, 140);
    const cuerpo = String(b.texto ?? '').trim().slice(0, 5000);
    if (!FORO_CATEGORIAS[categoria] || (categoria === 'equipo' && p.rol === 'emprendedora')) throw new Falla(400, 'categoria', 'Elige un tema de la lista.');
    if (titulo.length < 8) throw new Falla(400, 'titulo', 'Escribe un título de al menos unas palabras.');
    if (cuerpo.length < 15) throw new Falla(400, 'texto', 'Cuéntanos un poco más (al menos una frase).');
    await foroLimite(p);
    const t = hoy();
    const ref = await col('foro_temas').add({ categoria, titulo, texto: cuerpo, autor_id: p.id, autor: autorDe(p), autor_rol: NOMBRE_ROL[p.rol] || 'Administración', creado_en: t, ultima_actividad: t, respuestas: 0, fijado: false, borrado: false });
    return { ok: true, id: ref.id };
  }
  async function foroResponder(token, b) {
    const p = await usuarioDelToken(token);
    const id = String(b.id || '-');
    const ref = col('foro_temas').doc(id);
    const t = await datos(ref);
    if (!t || t.borrado || (t.categoria === 'equipo' && p.rol === 'emprendedora')) throw new Falla(404, 'no_existe', 'Esta conversación ya no existe.');
    const cuerpo = String(b.texto ?? '').trim().slice(0, 3000);
    if (cuerpo.length < 2) throw new Falla(400, 'texto', 'Escribe tu respuesta.');
    await foroLimite(p);
    await col('foro_respuestas').add({ tema: id, texto: cuerpo, autor_id: p.id, autor: autorDe(p), autor_rol: NOMBRE_ROL[p.rol] || 'Administración', creado_en: hoy(), borrado: false });
    await ref.update({ respuestas: (t.respuestas || 0) + 1, ultima_actividad: hoy() });
    return foroTema(token, { id });
  }
  async function foroBorrar(token, b) {
    const p = await usuarioDelToken(token);
    const coleccion = b.tipo === 'respuesta' ? 'foro_respuestas' : 'foro_temas';
    const ref = col(coleccion).doc(String(b.id || '-'));
    const x = await datos(ref);
    if (!x || x.borrado) throw new Falla(404, 'no_existe', 'Ya no existe.');
    if (x.autor_id !== p.id && !moderador(p)) throw new Falla(403, 'permiso', 'Solo quien lo escribió o la Secretaría Técnica pueden quitarlo.');
    await ref.update({ borrado: true, borrado_por: p.id, borrado_en: hoy() });
    if (coleccion === 'foro_respuestas') { const t = await datos(col('foro_temas').doc(x.tema)); if (t) await col('foro_temas').doc(x.tema).update({ respuestas: Math.max(0, (t.respuestas || 1) - 1) }); }
    return { ok: true };
  }
  async function foroFijar(token, b) {
    const p = await usuarioDelToken(token);
    if (!moderador(p)) throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica fija conversaciones.');
    const ref = col('foro_temas').doc(String(b.id || '-'));
    if (!(await datos(ref))) throw new Falla(404, 'no_existe', 'Ya no existe.');
    await ref.update({ fijado: b.fijado === true });
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

  // ================================================================ Soporte técnico: tickets
  // Cualquier persona con cuenta (emprendedora, dinamizadora o secretaría) abre una solicitud; quien no puede entrar
  // la abre desde el ingreso con su cédula y un contacto. La atiende ÚNICAMENTE la administración
  // (2horas.online01@gmail.com): cada solicitud nueva y cada mensaje de la persona le llegan por correo
  // (el puente Apps Script de la cuenta del CIC solo puede escribir a esa dirección).
  // Vive aparte (colecciones «tickets» y «documentos»): no toca el avance de nadie.
  const CATEGORIAS_SOPORTE = {
    acceso: 'No puedo entrar / contraseña', videos: 'Videos', cursos: 'Cursos y evaluaciones',
    talleres: 'Talleres y guías', seguimiento: 'Seguimiento y documentos', otro: 'Otro',
  };
  const ESTADOS_TICKET = ['abierto', 'en_proceso', 'resuelto', 'cerrado'];
  const esSoporte = (p) => esAdmin(p);
  const PANEL_SOPORTE = 'https://cicredmujeresdelcaribe.org/admin/';
  async function avisarSoporte(t, tipo, texto) {
    if (!driveActivo()) return;
    const quien = `${t.nombre}${t.rol ? ` (${t.rol})` : ''} · CC ${t.cedula}`;
    const asunto = tipo === 'nuevo' ? `[Soporte CIC] Nueva solicitud ${t.numero}: ${t.asunto}` : `[Soporte CIC] ${t.numero}: nuevo mensaje de ${t.nombre}`;
    const cuerpo = [
      tipo === 'nuevo' ? 'Llegó una nueva solicitud de soporte.' : 'La persona escribió de nuevo en su solicitud.',
      '', `Solicitud: ${t.numero}`, `Tema: ${CATEGORIAS_SOPORTE[t.categoria] || t.categoria}`, `Asunto: ${t.asunto}`, `De: ${quien}`,
      t.contacto ? `Contacto: ${t.contacto}` : '', t.satelite ? `Satélite: ${nombreSatelite(t.satelite)}` : '', t.dispositivo ? `Desde: ${t.dispositivo}` : '',
      t.publico ? 'Enviada sin cuenta: respóndele por su contacto y luego márcala como resuelta.' : 'Tiene cuenta: respóndele en el panel y verá tu respuesta en su pestaña «Soporte».',
      '', 'Mensaje:', texto, '', `Atiéndela en ${PANEL_SOPORTE} (pestaña «Soporte técnico»).`,
    ].filter((x) => x !== '').join('\n');
    try { await drive({ accion: 'correo', asunto, texto: cuerpo }); }
    catch (err) { console.error(`No se pudo avisar por correo la solicitud ${t.numero}:`, err.message); }
  }
  const numeroTicket = () => `T-${hoy().slice(2, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const vistaTicket = (x, conMensajes) => ({
    id: x._id, numero: x.numero, categoria: x.categoria, categoria_nombre: CATEGORIAS_SOPORTE[x.categoria] || 'Otro', asunto: x.asunto,
    estado: x.estado, nombre: x.nombre, cedula: x.cedula, rol: x.rol || null, satelite: x.satelite || null, contacto: x.contacto || null,
    publico: !!x.publico, dispositivo: x.dispositivo || null, adjunto: x.adjunto ? { nombre: x.adjunto.nombre, mime: x.adjunto.mime, bytes: x.adjunto.bytes } : null,
    creado_en: x.creado_en, actualizado_en: x.actualizado_en, mensajes_total: (x.mensajes || []).length,
    ultimo_de: (x.mensajes || []).length ? x.mensajes[x.mensajes.length - 1].de : null,
    ...(conMensajes ? { mensajes: x.mensajes || [] } : {}),
  });
  async function guardarAdjuntoTicket(id, a) {
    if (!a || !a.base64) return null;
    const mime = String(a.mime || '');
    if (!TIPOS_ARCHIVO[mime]) throw new Falla(400, 'archivo', 'El adjunto debe ser una foto (JPG o PNG) o un PDF.');
    const base64 = String(a.base64);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Falla(400, 'archivo', 'No pudimos leer el adjunto.');
    const bytes = Buffer.from(base64, 'base64').length;
    if (bytes > 3 * 1024 * 1024) throw new Falla(400, 'archivo', 'El adjunto pesa más de 3 MB.');
    const partes = Math.ceil(base64.length / CARACTERES_POR_PARTE);
    for (let i = 0; i < partes; i++) await col('documentos').doc(`ticket_${id}_${i}`).set({ parte: base64.slice(i * CARACTERES_POR_PARTE, (i + 1) * CARACTERES_POR_PARTE) });
    return { nombre: (texto(a.nombre, 100) || 'adjunto').replace(/[\\/:*?"<>|]+/g, '_'), mime, bytes, partes };
  }
  async function crearTicket(token, b) {
    const p = await usuarioDelToken(token);
    const categoria = CATEGORIAS_SOPORTE[b.categoria] ? b.categoria : 'otro';
    const asunto = texto(b.asunto, 120);
    const descripcion = String(b.descripcion ?? '').trim().slice(0, 3000);
    if (asunto.length < 5) throw new Falla(400, 'asunto', 'Escribe un asunto corto (al menos 5 letras).');
    if (descripcion.length < 15) throw new Falla(400, 'descripcion', 'Cuéntanos qué pasa (al menos unas palabras).');
    const mios = await lista(col('tickets').where('persona', '==', p.id));
    if (mios.filter((x) => x.estado === 'abierto' || x.estado === 'en_proceso').length >= 5) throw new Falla(429, 'limite', 'Ya tienes 5 solicitudes abiertas. Espera la respuesta antes de abrir otra.');
    const ref = col('tickets').doc();
    const adjunto = await guardarAdjuntoTicket(ref.id, b.adjunto);
    const fila = {
      numero: numeroTicket(), persona: p.id, cedula: p.cedula, nombre: p.nombre, rol: p.rol, satelite: p.satelite || null,
      contacto: [p.celular, p.correo].filter(Boolean).join(' · ') || null, publico: false, categoria, asunto, adjunto,
      estado: 'abierto', mensajes: [{ de: 'usuario', nombre: p.nombre, texto: descripcion, en: hoy() }], creado_en: hoy(), actualizado_en: hoy(),
    };
    await ref.set(fila);
    await avisarSoporte(fila, 'nuevo', descripcion);
    return { ticket: vistaTicket({ _id: ref.id, ...fila }, true) };
  }
  // Sin sesión (botón flotante o «¿No puedes entrar?»): cédula, nombre, un contacto, el tema y la descripción.
  // Máximo 3 por cédula al día.
  async function crearTicketPublico(b) {
    const cedula = validarCedula(b.cedula);
    const nombre = texto(b.nombre, 90);
    const contacto = texto(b.contacto, 120);
    const descripcion = String(b.descripcion ?? '').trim().slice(0, 2000);
    if (b.sitio) return { ok: true }; // campo trampa para robots
    if (nombre.length < 5 || !nombre.includes(' ')) throw new Falla(400, 'nombre', 'Escribe tu nombre y apellido.');
    if (soloDigitos(contacto).length < 7 && !correoValido(contacto)) throw new Falla(400, 'contacto', 'Escribe tu celular o WhatsApp, o un correo, para poder responderte.');
    if (descripcion.length < 15) throw new Falla(400, 'descripcion', 'Cuéntanos qué pasa (al menos unas palabras).');
    const recientes = (await lista(col('tickets').where('cedula', '==', cedula))).filter((x) => x.publico && ahora() - new Date(x.creado_en) < 24 * 3600000);
    if (recientes.length >= 3) throw new Falla(429, 'limite', 'Ya recibimos tus solicitudes de hoy. La Secretaría Técnica te contactará pronto.');
    const p = await perfilPorCedula(cedula);
    const categoria = CATEGORIAS_SOPORTE[b.categoria] ? b.categoria : 'acceso';
    const ROL_DECLARADO = { emprendedora: 'emprendedora', dinamizadora: 'dinamizadora', secretaria: 'secretaria' };
    const ref = col('tickets').doc();
    const fila = {
      numero: numeroTicket(), persona: null, cedula, nombre, rol: p ? p.rol : (ROL_DECLARADO[b.rol] || null), satelite: p ? p.satelite || null : null,
      dispositivo: texto(b.dispositivo, 30) || null,
      contacto, publico: true, categoria, asunto: texto(b.asunto, 120) || (categoria === 'acceso' ? 'No puedo entrar a la plataforma' : CATEGORIAS_SOPORTE[categoria]), adjunto: null,
      estado: 'abierto', mensajes: [{ de: 'usuario', nombre, texto: descripcion, en: hoy() }], creado_en: hoy(), actualizado_en: hoy(),
    };
    await ref.set(fila);
    await avisarSoporte(fila, 'nuevo', descripcion);
    return { ok: true, numero: fila.numero };
  }
  async function misTickets(token) {
    const p = await usuarioDelToken(token);
    const filas = await lista(col('tickets').where('persona', '==', p.id));
    return { tickets: filas.sort((a, b) => String(b.actualizado_en).localeCompare(String(a.actualizado_en))).map((x) => vistaTicket(x, false)) };
  }
  async function bandejaTickets(token) {
    const p = await usuarioDelToken(token);
    if (!esSoporte(p)) throw new Falla(403, 'permiso', 'La bandeja de soporte es solo para la administración.');
    const filas = await lista(col('tickets'));
    return { tickets: filas.sort((a, b) => String(b.actualizado_en).localeCompare(String(a.actualizado_en))).map((x) => vistaTicket(x, false)) };
  }
  async function ticketPermitido(token, id) {
    const p = await usuarioDelToken(token);
    const x = id ? await datos(col('tickets').doc(String(id))) : null;
    if (!x || (!esSoporte(p) && x.persona !== p.id)) throw new Falla(404, 'no_existe', 'No encontramos esa solicitud.');
    return { p, x: { _id: String(id), ...x } };
  }
  async function verTicket(token, b) {
    const { x } = await ticketPermitido(token, b.id);
    return { ticket: vistaTicket(x, true) };
  }
  async function responderTicket(token, b) {
    const { p, x } = await ticketPermitido(token, b.id);
    const txt = String(b.texto ?? '').trim().slice(0, 3000);
    if (txt.length < 2) throw new Falla(400, 'texto', 'Escribe tu respuesta.');
    if (x.estado === 'cerrado') throw new Falla(400, 'cerrado', 'Esta solicitud está cerrada. Abre una nueva si lo necesitas.');
    const deSoporte = esSoporte(p) && x.persona !== p.id;
    const mensajes = [...(x.mensajes || []), { de: deSoporte ? 'soporte' : 'usuario', nombre: p.nombre, texto: txt, en: hoy() }];
    const estado = deSoporte ? (x.estado === 'abierto' ? 'en_proceso' : x.estado) : (x.estado === 'resuelto' ? 'abierto' : x.estado);
    const { _id, ...resto } = x;
    await col('tickets').doc(_id).set({ ...resto, mensajes, estado, actualizado_en: hoy(), ...(deSoporte ? { atendido_por: p.id } : {}) });
    if (!deSoporte) await avisarSoporte(x, 'mensaje', txt);
    return { ticket: vistaTicket({ ...x, mensajes, estado, actualizado_en: hoy() }, true) };
  }
  async function estadoTicket(token, b) {
    const { p, x } = await ticketPermitido(token, b.id);
    if (!ESTADOS_TICKET.includes(b.estado)) throw new Falla(400, 'estado', 'Ese estado no existe.');
    if (!esSoporte(p) && !(x.persona === p.id && (b.estado === 'cerrado' || b.estado === 'resuelto'))) throw new Falla(403, 'permiso', 'Solo el equipo de soporte cambia el estado de la solicitud.');
    const { _id, ...resto } = x;
    await col('tickets').doc(_id).set({ ...resto, estado: b.estado, actualizado_en: hoy() });
    return { ticket: vistaTicket({ ...x, estado: b.estado, actualizado_en: hoy() }, true) };
  }
  async function adjuntoTicket(token, b) {
    const { x } = await ticketPermitido(token, b.id);
    if (!x.adjunto) throw new Falla(404, 'no_existe', 'Esta solicitud no tiene adjunto.');
    let base64 = '';
    for (let i = 0; i < x.adjunto.partes; i++) { const parte = await datos(col('documentos').doc(`ticket_${x._id}_${i}`)); base64 += parte ? parte.parte : ''; }
    return { nombre: x.adjunto.nombre, mime: x.adjunto.mime, base64 };
  }

  // ================================================================ Emprendimientos: asignación y seguimiento
  // La Secretaría asigna cada emprendimiento a una dinamizadora de su mismo satélite. La dinamizadora chulea si cada
  // actividad (6 sesiones de la ruta HACER y 4 talleres de la ruta SER) se ejecutó; si se ejecutó, sube el acta de
  // la sesión y la herramienta diligenciada. Los archivos se guardan en Firestore por partes (colección «documentos»).
  const ACTIVIDADES = [
    ...[['A1', 'A2', 'A3'], ['A4', 'A5'], ['A6'], ['A7', 'A8', 'A9'], ['A10', 'A11'], ['A12', 'A13']].map((h, i) => ({ ruta: 'hacer', n: i + 1, nombre: `Ruta HACER · Semana ${i + 1}`, herramientas: h })),
    ...[['A14'], ['A15'], ['A16'], ['A17']].map((h, i) => ({ ruta: 'ser', n: i + 1, nombre: `Ruta SER · Taller ${i + 1}`, herramientas: h })),
  ];
  const TIPOS_DOCUMENTO = ['acta', 'herramienta'];
  const TIPOS_ARCHIVO = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const MAX_BYTES_DOCUMENTO = 5 * 1024 * 1024;
  const CARACTERES_POR_PARTE = 900000; // cada documento de Firestore admite hasta 1 MiB
  const actividadDe = (ruta, n) => ACTIVIDADES.find((a) => a.ruta === ruta && a.n === Number(n)) || null;
  const idSeguimiento = (emp, a) => `${emp}_${a.ruta}_${a.n}`;
  const requeridos = (a) => [
    { tipo: 'acta', nombre: 'Acta de la sesión', detalle: 'Firmada por la emprendedora y la dinamizadora (foto o PDF).' },
    { tipo: 'herramienta', nombre: `Herramienta${a.herramientas.length > 1 ? 's' : ''} ${a.herramientas.join(', ')} diligenciada${a.herramientas.length > 1 ? 's' : ''}`, detalle: 'Foto o PDF de la herramienta trabajada en la sesión.' },
  ];
  const metaDocumento = (m) => (m ? { nombre: m.nombre, mime: m.mime, bytes: m.bytes, subido_en: m.subido_en, drive_url: m.drive_url || null, drive_pendiente: !!m.drive_pendiente } : null);
  // Copia en Google Drive: «CIC · Documentos de seguimiento / Satélite / Emprendimiento · CC / HACER · Semana N»
  const driveActivo = () => !!(drive && (!drive.activo || drive.activo()));
  const nombreSatelite = (id) => (SATELITES[id] ? `${SATELITES[id].departamento} · ${SATELITES[id].municipios.join(' y ')}` : 'Sin satélite');
  const rutaDrive = (e, a) => [nombreSatelite(e.satelite), `${e.nombre} · CC ${e.cedula}`, a.ruta === 'hacer' ? `HACER · Semana ${a.n}` : `SER · Taller ${a.n}`];
  const nombreDrive = (a, tipo, mime, fecha) => `${tipo === 'acta' ? 'Acta de la sesión' : `Herramientas ${a.herramientas.join('-')}`}${fecha ? ` · ${fecha}` : ''}.${TIPOS_ARCHIVO[mime] || 'bin'}`;
  async function copiarEnDrive(e, a, tipo, mime, base64, fecha, anterior) {
    if (!driveActivo()) return {};
    try {
      const r = await drive({ accion: 'subir', ruta: rutaDrive(e, a), nombre: nombreDrive(a, tipo, mime, fecha), mime, base64, reemplazar: (anterior && anterior.drive_id) || null });
      return r && r.id ? { drive_id: r.id, drive_url: r.url || null, drive_pendiente: false } : { drive_pendiente: true };
    } catch (err) {
      console.error('No se pudo copiar en Drive:', err.message);
      return { drive_pendiente: true };
    }
  }
  function avanceDe(filas) {
    const ejecutadas = filas.filter((x) => x.ejecutada === true);
    return {
      total: ACTIVIDADES.length,
      ejecutadas: ejecutadas.length,
      no_ejecutadas: filas.filter((x) => x.ejecutada === false).length,
      con_documentos: ejecutadas.filter((x) => TIPOS_DOCUMENTO.every((t) => x.documentos && x.documentos[t])).length,
    };
  }
  async function avancePorEmprendedora() {
    const porPersona = {};
    for (const x of await lista(col('seguimiento'))) (porPersona[x.emprendedora] = porPersona[x.emprendedora] || []).push(x);
    return (id) => avanceDe(porPersona[id] || []);
  }
  async function dinamizadorasDirectorio() {
    return (await lista(col('directorio'))).filter((x) => x.rol === 'dinamizadora')
      .map((x) => ({ cedula: x._id, nombre: x.nombre, cargo: x.cargo || null, satelite: x.satelite || null }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  const filaEmprendimiento = (x, avance, nombres) => ({
    cedula: x.cedula, nombre: x.nombre, negocio: x.negocio || null, municipio: x.municipio || null, satelite: x.satelite || null,
    celular: x.celular || null, semana_actual: x.semana_actual || 1,
    dinamizadora: x.dinamizadora_cedula || null, dinamizadora_nombre: x.dinamizadora_cedula ? (nombres[x.dinamizadora_cedula] || null) : null,
    avance: avance(x._id),
  });

  // Secretaría: emprendimientos (con su dinamizadora y avance) y las dinamizadoras de cada satélite
  async function verEmprendimientos(token) {
    const p = await usuarioDelToken(token);
    if (p.rol !== 'secretaria') throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica asigna emprendimientos.');
    const [emp, dinamizadoras, avance] = await Promise.all([lista(col('perfiles').where('rol', '==', 'emprendedora')), dinamizadorasDirectorio(), avancePorEmprendedora()]);
    const nombres = Object.fromEntries(dinamizadoras.map((d) => [d.cedula, d.nombre]));
    return {
      dinamizadoras,
      emprendimientos: emp.map((x) => filaEmprendimiento(x, avance, nombres)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      drive: { activo: driveActivo(), pendientes: driveActivo() ? (await documentosSinDrive()).length : 0 },
    };
  }
  async function documentosSinDrive() {
    const faltan = [];
    for (const x of await lista(col('seguimiento'))) {
      for (const t of TIPOS_DOCUMENTO) { const m = x.documentos && x.documentos[t]; if (m && !m.drive_id) faltan.push([x, t]); }
    }
    return faltan;
  }
  // Envía a Drive los documentos que aún no tienen copia (los de antes del puente o los que fallaron). Por tandas.
  async function sincronizarDrive(token) {
    const p = await usuarioDelToken(token);
    if (p.rol !== 'secretaria' && !esAdmin(p)) throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica envía documentos a Drive.');
    if (!driveActivo()) throw new Falla(400, 'drive', 'La copia en Google Drive todavía no está configurada.');
    const faltan = await documentosSinDrive();
    let enviados = 0;
    for (const [x, t] of faltan.slice(0, 15)) {
      const e = await perfilPorId(x.emprendedora);
      const a = actividadDe(x.ruta, x.n);
      if (!e || !a) continue;
      const m = x.documentos[t];
      let base64 = '';
      for (let i = 0; i < m.partes; i++) { const parte = await datos(col('documentos').doc(`${idSeguimiento(x.emprendedora, a)}_${t}_${i}`)); base64 += parte ? parte.parte : ''; }
      const enDrive = await copiarEnDrive(e, a, t, m.mime, base64, x.fecha, null);
      if (!enDrive.drive_id) continue;
      const fila = await datos(col('seguimiento').doc(idSeguimiento(x.emprendedora, a)));
      await col('seguimiento').doc(idSeguimiento(x.emprendedora, a)).set({ ...fila, documentos: { ...fila.documentos, [t]: { ...fila.documentos[t], ...enDrive } } });
      enviados++;
    }
    return { enviados, pendientes: (await documentosSinDrive()).length };
  }
  async function asignar(token, b) {
    const p = await usuarioDelToken(token);
    if (p.rol !== 'secretaria') throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica asigna emprendimientos.');
    const cedulas = [...new Set((Array.isArray(b.cedulas) ? b.cedulas : []).map((c) => soloDigitos(c)))].filter(Boolean).slice(0, 200);
    if (!cedulas.length) throw new Falla(400, 'cedulas', 'Elige al menos un emprendimiento.');
    let din = null;
    if (b.dinamizadora) {
      const ced = soloDigitos(b.dinamizadora);
      const d = await datos(col('directorio').doc(ced));
      if (!d || d.rol !== 'dinamizadora') throw new Falla(404, 'dinamizadora', 'No encontramos a esa dinamizadora.');
      din = { cedula: ced, ...d };
    }
    const perfiles = [];
    for (const c of cedulas) {
      const e = await perfilPorCedula(c);
      if (!e || e.rol !== 'emprendedora') throw new Falla(404, 'no_existe', `No encontramos el emprendimiento con cédula ${c}.`);
      if (din && e.satelite !== din.satelite) throw new Falla(400, 'satelite', `${e.nombre} es de otro satélite: solo se puede asignar a una dinamizadora de su mismo satélite.`);
      perfiles.push(e);
    }
    for (const e of perfiles) {
      await col('perfiles').doc(e.id).update({ dinamizadora_cedula: din ? din.cedula : null, asignada_por: p.id, asignada_en: hoy() });
    }
    return { ok: true, asignados: perfiles.length, dinamizadora: din ? din.nombre : null };
  }

  // Dinamizadora: sus emprendimientos asignados
  async function misEmprendimientos(token) {
    const p = await usuarioDelToken(token);
    if (p.rol !== 'dinamizadora') throw new Falla(403, 'permiso', 'Esta lista es para las dinamizadoras.');
    const [emp, avance] = await Promise.all([lista(col('perfiles').where('dinamizadora_cedula', '==', p.cedula)), avancePorEmprendedora()]);
    return { emprendimientos: emp.filter((x) => x.rol === 'emprendedora').map((x) => filaEmprendimiento(x, avance, { [p.cedula]: p.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) };
  }

  // Un emprendimiento lo ven la Secretaría y la dinamizadora a quien se le asignó
  async function emprendimientoPermitido(token, cedula) {
    const p = await usuarioDelToken(token);
    if (p.rol !== 'secretaria' && p.rol !== 'dinamizadora') throw new Falla(403, 'permiso', 'El seguimiento es para el equipo del CIC.');
    const e = await perfilPorCedula(validarCedula(cedula));
    if (!e || e.rol !== 'emprendedora') throw new Falla(404, 'no_existe', 'No encontramos ese emprendimiento.');
    if (p.rol === 'dinamizadora' && e.dinamizadora_cedula !== p.cedula) throw new Falla(403, 'permiso', 'Este emprendimiento no está asignado a ti. Pídele a la Secretaría Técnica que te lo asigne.');
    return { p, e };
  }
  async function verSeguimiento(token, b) {
    const { e } = await emprendimientoPermitido(token, b.cedula);
    const filas = Object.fromEntries((await lista(col('seguimiento').where('emprendedora', '==', e.id))).map((x) => [`${x.ruta}_${x.n}`, x]));
    const din = e.dinamizadora_cedula ? await datos(col('directorio').doc(e.dinamizadora_cedula)) : null;
    return {
      emprendimiento: { cedula: e.cedula, nombre: e.nombre, negocio: e.negocio || null, municipio: e.municipio || null, satelite: e.satelite || null, celular: e.celular || null, dinamizadora_nombre: din ? din.nombre : null },
      actividades: ACTIVIDADES.map((a) => {
        const x = filas[`${a.ruta}_${a.n}`];
        return {
          ruta: a.ruta, n: a.n, nombre: a.nombre, herramientas: a.herramientas, requeridos: requeridos(a),
          ejecutada: x ? x.ejecutada : null, fecha: x ? x.fecha || null : null, motivo: x ? x.motivo || null : null,
          documentos: Object.fromEntries(TIPOS_DOCUMENTO.map((t) => [t, metaDocumento(x && x.documentos && x.documentos[t])])),
        };
      }),
      avance: avanceDe(Object.values(filas)),
    };
  }
  async function marcarActividad(token, b) {
    const { p, e } = await emprendimientoPermitido(token, b.cedula);
    const a = actividadDe(b.ruta, b.n);
    if (!a) throw new Falla(400, 'actividad', 'Esa actividad no existe.');
    if (typeof b.ejecutada !== 'boolean') throw new Falla(400, 'ejecutada', 'Indica si la actividad se ejecutó o no.');
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '') ? b.fecha : null;
    const id = idSeguimiento(e.id, a);
    const previa = await datos(col('seguimiento').doc(id));
    await col('seguimiento').doc(id).set({
      emprendedora: e.id, ruta: a.ruta, n: a.n, ejecutada: b.ejecutada,
      fecha: b.ejecutada ? fecha : null, motivo: b.ejecutada ? null : (texto(b.motivo, 300) || null),
      documentos: (previa && previa.documentos) || {}, marcado_por: p.id, marcado_en: hoy(),
    });
    return verSeguimiento(token, b);
  }
  async function borrarPartes(base, desde, hasta) {
    for (let i = desde; i < hasta; i++) await col('documentos').doc(`${base}_${i}`).delete();
  }
  async function subirDocumento(token, b) {
    const { p, e } = await emprendimientoPermitido(token, b.cedula);
    const a = actividadDe(b.ruta, b.n);
    if (!a) throw new Falla(400, 'actividad', 'Esa actividad no existe.');
    if (!TIPOS_DOCUMENTO.includes(b.tipo)) throw new Falla(400, 'tipo', 'Ese tipo de documento no existe.');
    const id = idSeguimiento(e.id, a);
    const fila = await datos(col('seguimiento').doc(id));
    if (!fila || fila.ejecutada !== true) throw new Falla(400, 'ejecutada', 'Primero marca que la actividad sí se ejecutó.');
    const mime = String(b.mime || '');
    if (!TIPOS_ARCHIVO[mime]) throw new Falla(400, 'archivo', 'Sube una foto (JPG o PNG) o un PDF.');
    const base64 = String(b.base64 || '');
    if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Falla(400, 'archivo', 'No pudimos leer el archivo. Intenta de nuevo.');
    const bytes = Buffer.from(base64, 'base64').length;
    if (bytes > MAX_BYTES_DOCUMENTO) throw new Falla(400, 'archivo', 'El archivo pesa más de 5 MB. Toma la foto con menos resolución o comprime el PDF.');
    const base = `${id}_${b.tipo}`;
    const partes = Math.ceil(base64.length / CARACTERES_POR_PARTE);
    for (let i = 0; i < partes; i++) await col('documentos').doc(`${base}_${i}`).set({ parte: base64.slice(i * CARACTERES_POR_PARTE, (i + 1) * CARACTERES_POR_PARTE) });
    const anterior = fila.documentos && fila.documentos[b.tipo];
    if (anterior && anterior.partes > partes) await borrarPartes(base, partes, anterior.partes);
    const nombre = (texto(b.nombre, 120) || b.tipo).replace(/[\\/:*?"<>|]+/g, '_');
    const enDrive = await copiarEnDrive(e, a, b.tipo, mime, base64, fila.fecha, anterior);
    await col('seguimiento').doc(id).set({ ...fila, documentos: { ...(fila.documentos || {}), [b.tipo]: { nombre, mime, bytes, partes, subido_por: p.id, subido_en: hoy(), ...enDrive } } });
    return verSeguimiento(token, b);
  }
  async function verDocumento(token, b) {
    const { e } = await emprendimientoPermitido(token, b.cedula);
    const a = actividadDe(b.ruta, b.n);
    const fila = a && TIPOS_DOCUMENTO.includes(b.tipo) ? await datos(col('seguimiento').doc(idSeguimiento(e.id, a))) : null;
    const m = fila && fila.documentos && fila.documentos[b.tipo];
    if (!m) throw new Falla(404, 'no_existe', 'Ese documento todavía no se ha subido.');
    let base64 = '';
    for (let i = 0; i < m.partes; i++) { const parte = await datos(col('documentos').doc(`${idSeguimiento(e.id, a)}_${b.tipo}_${i}`)); base64 += parte ? parte.parte : ''; }
    return { nombre: m.nombre, mime: m.mime, base64 };
  }
  async function quitarDocumento(token, b) {
    const { e } = await emprendimientoPermitido(token, b.cedula);
    const a = actividadDe(b.ruta, b.n);
    if (!a || !TIPOS_DOCUMENTO.includes(b.tipo)) throw new Falla(400, 'tipo', 'Ese documento no existe.');
    const id = idSeguimiento(e.id, a);
    const fila = await datos(col('seguimiento').doc(id));
    const m = fila && fila.documentos && fila.documentos[b.tipo];
    if (m) {
      if (m.drive_id && driveActivo()) await drive({ accion: 'quitar', id: m.drive_id }).catch((err) => console.error('Drive:', err.message));
      await borrarPartes(`${id}_${b.tipo}`, 0, m.partes);
      const documentos = { ...fila.documentos };
      delete documentos[b.tipo];
      await col('seguimiento').doc(id).set({ ...fila, documentos });
    }
    return verSeguimiento(token, b);
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
      videos: new Map(videos.map((v) => [v.codigo, v])),
    };
  }
  const filaDe = (ctx, curso, u) => ctx.progreso.find((p) => p.curso === curso && p.unidad === u);
  const evidenciaDe = (ctx, curso, u) => ctx.evidencias.find((e) => e.curso === curso && e.unidad === u && e.tipo === CURSOS[curso].evidencia);
  const tieneVideo = (ctx, curso, u) => ctx.videos.has(`${CURSOS[curso].prefijo}${u}`);
  const aprobada = (ctx, curso, u) => !!(filaDe(ctx, curso, u) || {}).aprobado_en;
  // El video cuenta como visto cuando pasó al menos el 90 % de su duración desde que se abrió en la lección.
  // Si la unidad entró en pausa, hay que volver a verlo: cuenta desde una apertura posterior a la pausa.
  const segundosVideo = (ctx, curso, u) => { const v = ctx.videos.get(`${CURSOS[curso].prefijo}${u}`); return v && v.duracion_min ? Math.round(v.duracion_min * 60 * 0.9) : 120; };
  const inicioValido = (f) => (f.video_inicio && (!f.bloqueado_en || f.video_inicio > f.bloqueado_en) ? f.video_inicio : null);
  const faltaVideo = (ctx, curso, u, f) => {
    const i = inicioValido(f);
    return i ? Math.max(0, segundosVideo(ctx, curso, u) - Math.floor((ahora() - new Date(i)) / 1000)) : segundosVideo(ctx, curso, u);
  };

  // Qué falta para abrir una unidad (null = abierta)
  function requisito(perfil, ctx, curso, u) {
    if (!CURSOS[curso].roles.includes(perfil.rol)) return 'Este curso es solo para la Secretaría Técnica.';
    if (u > 1) {
      if (!aprobada(ctx, curso, u - 1)) return `Se abre cuando apruebes el cuestionario de la unidad ${u - 1}.`;
      if (!evidenciaDe(ctx, curso, u - 1)) return `Se abre cuando envíes la ${CURSOS[curso].evidencia === 'actividad' ? 'actividad' : 'verificación de la sesión'} de la unidad ${u - 1}.`;
      return null;
    }
    if (curso === 'gestion') {
      const bv = estadoBienvenida(ctx);
      if (bv.requerida && !bv.hecha) return 'Se abre cuando veas el video de bienvenida.';
      return ctx.hitos.has('compromiso') ? null : 'Se abre cuando confirmes tu compromiso como parte del equipo.';
    }
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
      video_visto: !!f.video_en && (!f.bloqueado_en || f.video_en > f.bloqueado_en), material_visto: !!f.material_en,
      video_iniciado: !!inicioValido(f), video_segundos: segundosVideo(ctx, curso, u), video_faltan: video ? faltaVideo(ctx, curso, u, f) : 0,
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
    return { cursos, bienvenida: estadoBienvenida(ctx), hitos: ctx.hitosLista, constancias: ctx.constancias, reglas: { preguntas: PREGUNTAS_POR_INTENTO, nota_minima: NOTA_MINIMA, intentos: INTENTOS_POR_RONDA } };
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

  // La persona reprodujo el video en la lección: empieza a contar el tiempo mínimo.
  async function iniciarVideo(token, b) {
    const { perfil, ctx, curso, unidad } = await equipoAbierto(token, b);
    if (!tieneVideo(ctx, curso, unidad)) throw new Falla(400, 'sin_video', 'Esta unidad todavía no tiene video.');
    if (!inicioValido(filaDe(ctx, curso, unidad) || {})) await guardarProgreso(perfil.id, curso, unidad, { video_inicio: hoy() });
    return resumen(perfil, await contexto(perfil.id));
  }

  // Marca el video o el material como vistos. Si la unidad estaba en pausa y ya repasó ambos, se reabre.
  async function marcar(token, b) {
    const { perfil, ctx, curso, unidad } = await equipoAbierto(token, b);
    const que = String(b.que ?? '');
    if (que !== 'video' && que !== 'material') throw new Falla(400, 'que', 'Indica si viste el video o el material.');
    const f = filaDe(ctx, curso, unidad) || {};
    if (que === 'video') {
      if (!tieneVideo(ctx, curso, unidad)) throw new Falla(400, 'sin_video', 'Esta unidad todavía no tiene video.');
      if (!inicioValido(f)) throw new Falla(400, 'video_tiempo', 'Primero reproduce el video en la lección.');
      const falta = faltaVideo(ctx, curso, unidad, f);
      if (falta > 0) throw new Falla(400, 'video_tiempo', `Termina de ver el video: faltan ${Math.floor(falta / 60)} min ${String(falta % 60).padStart(2, '0')} s.`, { faltan: falta });
    }
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

  // Material de estudio de una unidad: los PDF del catálogo (los entrega esta función) y, si la administración
  // agregó alguno, enlaces de la colección «material» (documentos curso_unidad y curso_general).
  // Solo se entregan si la unidad está abierta.
  const idsMaterial = (curso, unidad) => [...((CATALOGO.material || {})[`${curso}_${unidad}`] || []), ...((CATALOGO.material || {})[`${curso}_general`] || [])];
  // Los enlaces de Drive que se cargaron al inicio (sin «actualizado_por») quedan reemplazados por los PDF del catálogo;
  // los que la administración guarde desde admin/ se muestran siempre como material adicional.
  const enlacesVigentes = (m, hayCatalogo) => !!m && (!hayCatalogo || !!m.actualizado_por);
  async function material(token, b) {
    const { perfil, curso, unidad } = await equipoAbierto(token, b);
    const archivos = idsMaterial(curso, unidad).filter((id) => CATALOGO.archivos[id]).map((id) => ({ id, nombre: CATALOGO.archivos[id].nombre, tipo: CATALOGO.archivos[id].tipo }));
    for (const id of [`${curso}_${unidad}`, `${curso}_general`]) {
      const m = await datos(col('material').doc(id));
      if (!enlacesVigentes(m, archivos.length)) continue;
      for (const a of (m && m.archivos) || []) if (a && /^https:\/\//.test(a.url || '')) archivos.push({ nombre: String(a.nombre || 'Material'), url: a.url });
    }
    if (archivos.length && b.marcar !== false) await guardarProgreso(perfil.id, curso, unidad, { material_en: hoy() });
    return { archivos };
  }
  const paquete = (id) => {
    const a = CATALOGO.archivos[id];
    const contenido = leerArchivo(a.archivo);
    if (!contenido) throw new Falla(503, 'sin_archivo', 'Este archivo todavía no está disponible. Avísale a la Secretaría Técnica.');
    const nombreArchivo = `CIC_${a.nombre.replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '')}.${a.tipo.toLowerCase()}`;
    return { nombre: a.nombre, archivo: nombreArchivo, tipo: a.tipo, base64: contenido.toString('base64') };
  };
  // Un archivo del material de la unidad (abrirlo cuenta como repasar el material)
  async function archivoMaterial(token, b) {
    const { perfil, curso, unidad } = await equipoAbierto(token, b);
    const id = String(b.id || '');
    if (!idsMaterial(curso, unidad).includes(id) || !CATALOGO.archivos[id]) throw new Falla(404, 'no_existe', 'Ese archivo no es de esta unidad.');
    const p = paquete(id);
    await guardarProgreso(perfil.id, curso, unidad, { material_en: hoy() });
    return p;
  }
  // Guías y plantillas de las emprendedoras: solo con cuenta (cualquier perfil)
  async function guia(token, b) {
    await usuarioDelToken(token);
    const a = CATALOGO.archivos[String(b.id || '')];
    if (!a || a.publico !== 'emprendedoras') throw new Falla(404, 'no_existe', 'No encontramos esa guía.');
    return paquete(String(b.id));
  }

  // ---------- Video de bienvenida: obligatorio antes del curso Gestión del CIC ----------
  const VIDEO_BIENVENIDA = 'BIENVENIDA';
  const estadoBienvenida = (ctx) => {
    const v = ctx.videos.get(VIDEO_BIENVENIDA);
    const f = filaDe(ctx, 'bienvenida', 1) || {};
    const segundos = v && v.duracion_min ? Math.round(v.duracion_min * 60 * 0.9) : 120;
    const faltan = f.video_inicio ? Math.max(0, segundos - Math.floor((ahora() - new Date(f.video_inicio)) / 1000)) : segundos;
    return { requerida: !!v, hecha: ctx.hitos.has('bienvenida'), iniciada: !!f.video_inicio, segundos, faltan };
  };
  async function bienvenida(token, b) {
    const perfil = await usuarioDelToken(token);
    if (perfil.rol === 'emprendedora') throw new Falla(403, 'permiso', 'Este paso es para el equipo del CIC.');
    const ctx = await contexto(perfil.id);
    const e = estadoBienvenida(ctx);
    if (!e.requerida) throw new Falla(400, 'sin_video', 'El video de bienvenida todavía no está publicado.');
    if (b.paso === 'iniciar') {
      if (!e.iniciada) await guardarProgreso(perfil.id, 'bienvenida', 1, { video_inicio: hoy() });
    } else if (!e.hecha) {
      if (!e.iniciada) throw new Falla(400, 'video_tiempo', 'Primero reproduce el video de bienvenida.');
      if (e.faltan > 0) throw new Falla(400, 'video_tiempo', `Termina de ver el video: faltan ${Math.floor(e.faltan / 60)} min ${String(e.faltan % 60).padStart(2, '0')} s.`, { faltan: e.faltan });
      await guardarProgreso(perfil.id, 'bienvenida', 1, { video_en: hoy() });
      await col('hitos').doc(`${perfil.id}_bienvenida`).set({ persona: perfil.id, hito: 'bienvenida', fecha: hoy(), marcado_por: perfil.id });
    }
    return resumen(perfil, await contexto(perfil.id));
  }

  // Abre un intento: las 10 preguntas del banco oficial, en orden aleatorio y con las opciones barajadas, sin la respuesta correcta.
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
    // Las opciones también cambian de orden en cada intento; se guarda el orden para calificar.
    const ordenes = elegidas.map((p) => barajar(p.opciones.map((_, i) => i)));
    const ref = await col('cuestionarios').add({ persona: perfil.id, curso, unidad, preguntas: elegidas.map((p) => p._id), ordenes: ordenes.map((o) => o.join(',')), creado_en: hoy(), respondido_en: null });
    return {
      id: ref.id, intento: est.intentos + 1, de: INTENTOS_POR_RONDA, nota_minima: NOTA_MINIMA, minutos: MINUTOS_CUESTIONARIO,
      preguntas: elegidas.map((p, i) => ({ id: p._id, enunciado: p.enunciado, opciones: ordenes[i].map((j) => p.opciones[j]) })),
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
      // La opción elegida se traduce al orden original del banco antes de comparar
      const orden = c.ordenes && c.ordenes[i] ? String(c.ordenes[i]).split(',').map(Number) : null;
      const elegida = orden ? orden[resp[i]] : resp[i];
      const bien = !!p && p.correcta === elegida;
      detalle.push({ id: c.preguntas[i], bien, justificacion: (p && p.retro) || null });
    }
    const nota = detalle.filter((d) => d.bien).length;
    // La justificación oficial solo se muestra al aprobar: si se mostrara al fallar, el segundo intento
    // tendría las respuestas a la vista. Al fallar solo se indica qué preguntas repasar.
    const aprobadoAhora = nota >= NOTA_MINIMA;
    detalle.forEach((d) => { d.retro = d.bien ? null : (aprobadoAhora ? d.justificacion : 'Repasa este tema en el video y en el material de estudio.'); delete d.justificacion; });
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
    if (quien.rol !== 'secretaria' && !esAdmin(quien)) throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica ve el avance del equipo.');
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
        // Emprendimientos: asignación y seguimiento de actividades
        case 'emprendimientos': r = await verEmprendimientos(token); break;
        case 'asignar': r = await asignar(token, b); break;
        case 'mis-emprendimientos': r = await misEmprendimientos(token); break;
        case 'seguimiento': r = await verSeguimiento(token, b); break;
        case 'marcar-actividad': r = await marcarActividad(token, b); break;
        case 'subir-documento': r = await subirDocumento(token, b); break;
        case 'ver-documento': r = await verDocumento(token, b); break;
        case 'quitar-documento': r = await quitarDocumento(token, b); break;
        case 'sincronizar-drive': r = await sincronizarDrive(token); break;
        // Soporte técnico (tickets) y registro de correos
        case 'ticket-crear': r = await crearTicket(token, b); break;
        case 'ticket-publico': r = await crearTicketPublico(b); break;
        case 'mis-tickets': r = await misTickets(token); break;
        case 'tickets': r = await bandejaTickets(token); break;
        case 'ticket': r = await verTicket(token, b); break;
        case 'ticket-responder': r = await responderTicket(token, b); break;
        case 'ticket-estado': r = await estadoTicket(token, b); break;
        case 'ticket-adjunto': r = await adjuntoTicket(token, b); break;
        case 'envios-correo': r = await verEnviosCorreo(token); break;
        // Cursos del equipo
        case 'mi-progreso': r = await miProgreso(token); break;
        case 'marcar': r = await marcar(token, b); break;
        case 'iniciar-video': r = await iniciarVideo(token, b); break;
        case 'bienvenida': r = await bienvenida(token, b); break;
        case 'archivo-material': r = await archivoMaterial(token, b); break;
        case 'guia': r = await guia(token, b); break;
        case 'admin-contenido': r = await adminContenido(token); break;
        case 'admin-guardar-material': r = await adminGuardarMaterial(token, b); break;
        // Foro
        case 'foro-temas': r = await foroTemas(token, b); break;
        case 'foro-tema': r = await foroTema(token, b); break;
        case 'foro-publicar': r = await foroPublicar(token, b); break;
        case 'foro-responder': r = await foroResponder(token, b); break;
        case 'foro-borrar': r = await foroBorrar(token, b); break;
        case 'foro-fijar': r = await foroFijar(token, b); break;
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
