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
const { htmlFinalizacion, textoFinalizacion } = require('./plantillas/finalizacion');

const ROLES = ['secretaria', 'dinamizadora', 'emprendedora'];
const NOMBRE_ROL = { secretaria: 'Secretaría Técnica', dinamizadora: 'Dinamizadora (o dinamizador)', emprendedora: 'Emprendedora' };
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
// evidencia 'foro': la actividad de cada módulo es participar en la conversación de ese módulo en el foro del equipo.
// sin_actividad: módulos que se aprueban solo con la evaluación (el 4 de Gestión, acordado con Emprende Ahora).
const CURSOS = {
  gestion: { unidades: 4, prefijo: 'GES-M', nombre: 'Gestión del CIC', unidad: 'Módulo', evidencia: 'foro', sin_actividad: [4], cuestionario: true, roles: ['secretaria', 'dinamizadora'] },
  'acompanar-hacer': { unidades: 6, prefijo: 'HAC-S', nombre: 'Acompañar la ruta HACER', unidad: 'Semana', evidencia: 'foro', cuestionario: true, roles: ['secretaria', 'dinamizadora'] },
  'facilitar-ser': { unidades: 4, prefijo: 'SER-T', nombre: 'Facilitar la ruta SER', unidad: 'Taller', evidencia: 'foro', cuestionario: true, roles: ['secretaria', 'dinamizadora'] },
};
// La Formación de la Secretaría Técnica dejó de ser un curso: su material está en «Material de transferencia»
// (catálogo formacion-secretaria_N y videos STF-UN). Sus constancias ya emitidas se siguen verificando con este nombre.
const NOMBRE_CURSO_RETIRADO = { 'formacion-secretaria': 'Formación de la Secretaría Técnica' };
// En admin/ el material de transferencia se carga como un curso más (videos STF-UN y enlaces adicionales)
const CURSOS_ADMIN = { ...CURSOS, 'formacion-secretaria': { unidades: 6, prefijo: 'STF-U', nombre: 'Material de transferencia · Secretaría Técnica', cuestionario: false } };
const TRANSFERENCIA = ['Método Insight', 'Oportunidad significativa emergente', 'Modelo de negocio Canvas', 'Producto mínimo viable y Lean Startup', 'Gestión financiera estratégica', 'Guía metodológica del facilitador'];
const SEGUNDOS_SIN_DURACION = 600; // si un video no tiene duración en admin/, se exigen 10 minutos
const PULSO_MAX_SEG = 40; // el navegador manda un pulso cada 15 s mientras el video está en pantalla
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

// Una persona del equipo puede tener un segundo perfil («otros_roles» en el directorio), p. ej. Secretaría y Dinamizadora.
// Datos propios de cada perfil: lo demás (nombre, correo, contraseña, avance en los cursos) es el mismo.
const CAMPOS_ROL = ['cargo', 'subtitulo', 'departamento', 'satelite'];
const datosRol = (p) => Object.fromEntries(CAMPOS_ROL.map((k) => [k, p[k] || null]));
// La ficha del directorio vista como dinamizadora (la principal o la del segundo perfil), o null si no lo es.
const comoDinamizadora = (d) => {
  if (!d) return null;
  if (d.rol === 'dinamizadora') return d;
  const o = d.otros_roles && d.otros_roles.dinamizadora;
  return o ? { ...d, ...datosRol(o), rol: 'dinamizadora' } : null;
};

// ---------- Avisos a secretarias: reglas comunes ----------
// El perfil activo cambia según con qué rol entró la persona (Secretaría o Dinamizadora): para saber si alguien
// ES secretaria se miran los dos perfiles, nunca solo el activo.
const tieneRol = (x, rol) => !!x && (x.rol === rol || !!(x.otros_roles && x.otros_roles[rol]));
// Cuentas de prueba: se reconocen por la marca «prueba» (campo prueba: true, o «prueba» en el nombre o en algún cargo).
// Un aviso que tenga que ver con una cuenta de prueba nunca le llega a una persona real: va solo a soporte.
const esCuentaPrueba = (x) => !!x && (x.prueba === true || /prueba/i.test([x.nombre, x.cargo, ...Object.values(x.otros_roles || {}).map((o) => o && o.cargo)].filter(Boolean).join(' ')));
// Cargo con el que trabaja como secretaria (el principal o el del segundo perfil)
const cargoSecretaria = (x) => (x.rol === 'secretaria' ? x.cargo : (x.otros_roles && x.otros_roles.secretaria && x.otros_roles.secretaria.cargo)) || '';

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
    return fallos;
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
      departamento: d.departamento || null, satelite: d.satelite || null, otros_roles: d.otros_roles || null,
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
  // ---------- Registro del equipo (solo administración) ----------
  // Secretarías y dinamizadoras viven en «directorio»; con eso ya pueden «Activar mi cuenta» desde la página.
  async function adminEquipo(token) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'El registro del equipo es para la administración.');
    const cuentasEquipo = {};
    for (const x of await lista(col('perfiles'))) if (x.rol !== 'emprendedora') cuentasEquipo[x.cedula] = x;
    const personas = (await lista(col('directorio'))).map((d) => {
      const c = cuentasEquipo[d._id];
      return {
        cedula: d._id, nombre: d.nombre, rol: d.rol, cargo: d.cargo || null, subtitulo: d.subtitulo || null, correo: d.correo || null,
        celular: d.celular || null, satelite: d.satelite || null, departamento: d.departamento || null, otros_roles: d.otros_roles || null,
        activada: !!c, en_uso: c ? c.rol : null,
      };
    }).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return { personas, satelites: Object.entries(SATELITES).map(([id, x]) => ({ id, departamento: x.departamento, municipios: x.municipios })) };
  }
  const ROLES_EQUIPO = ['secretaria', 'dinamizadora'];
  // El puente de correo solo les escribe a las secretarias de su lista. Cada vez que cambia el equipo se le manda
  // la lista completa (secretarias principales y quienes tienen la Secretaría como segundo perfil).
  async function sincronizarSecretarias() {
    if (!driveActivo()) return null;
    const correos = [...new Set((await lista(col('directorio')))
      .filter((x) => x.rol === 'secretaria' || (x.otros_roles && x.otros_roles.secretaria))
      .map((x) => String(x.correo || '').trim().toLowerCase()).filter(correoValido))].sort();
    try { await drive({ accion: 'secretarias', correos }); return { ok: true, secretarias: correos.length }; }
    catch (err) { console.error('No se pudo actualizar la lista de secretarias del puente:', err.message); return { ok: false }; }
  }
  async function adminGuardarPersona(token, b) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'El registro del equipo es para la administración.');
    const cedula = validarCedula(b.cedula);
    const nombre = texto(b.nombre, 90);
    const correo = texto(b.correo, 120).toLowerCase();
    const celular = soloDigitos(b.celular).slice(0, 12);
    if (nombre.length < 5 || !nombre.includes(' ')) throw new Falla(400, 'nombre', 'Escribe nombre y apellido.');
    if (!correoValido(correo)) throw new Falla(400, 'correo', 'Escribe un correo válido: ahí le llega el enlace para crear su contraseña.');
    const perfilRol = (rol, satelite, cargo, subtitulo, campo) => {
      if (!ROLES_EQUIPO.includes(rol)) throw new Falla(400, campo, 'Elige Secretaría Técnica o Dinamizadora.');
      const sat = satelite ? String(satelite) : null;
      if (sat && !SATELITES[sat]) throw new Falla(400, campo, 'Elige un satélite de la lista.');
      if (rol === 'dinamizadora' && !sat) throw new Falla(400, campo, 'A la dinamizadora hay que asignarle su satélite.');
      return { cargo: texto(cargo, 90) || null, subtitulo: texto(subtitulo, 90) || null, departamento: sat ? SATELITES[sat].departamento : null, satelite: sat };
    };
    const rol = String(b.rol || '');
    const principal = perfilRol(rol, b.satelite, b.cargo, b.subtitulo, 'rol');
    let otros = null;
    if (b.otro_rol) {
      const otro = String(b.otro_rol);
      if (otro === rol) throw new Falla(400, 'otro_rol', 'El segundo perfil debe ser distinto del principal.');
      otros = { [otro]: perfilRol(otro, b.otro_satelite, b.otro_cargo, null, 'otro_rol') };
    }
    const existente = await perfilPorCedula(cedula);
    // Nunca se convierte la cuenta de una emprendedora: perdería su ruta y su avance.
    if (existente && existente.rol === 'emprendedora') throw new Falla(409, 'emprendedora', 'Esa cédula ya está inscrita como emprendedora. No se puede pasar al equipo desde aquí para no afectar su avance.');
    // Dos personas con el mismo nombre se confunden al asignar emprendimientos: se avisa antes de guardar.
    const llaveNombre = (n) => String(n || '').replace(/\(.*?\)/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const gemela = (await lista(col('directorio'))).find((x) => x._id !== cedula && llaveNombre(x.nombre) === llaveNombre(nombre));
    if (gemela) throw new Falla(409, 'nombre', `Ya hay otra persona del equipo con ese nombre (CC ${gemela._id}). Si es la misma persona, edítala a ella; si es otra, agrega su segundo apellido para distinguirlas.`);
    const anterior = await datos(col('directorio').doc(cedula));
    const ficha = { nombre, rol, ...principal, correo, celular: celular || null, otros_roles: otros };
    await col('directorio').doc(cedula).set({ ...(anterior || {}), ...ficha, actualizado_en: hoy(), actualizado_por: p.id });
    if (existente) {
      const cambios = { nombre, rol, ...principal, correo, celular: celular || null, otros_roles: otros };
      if (correo !== existente.cuenta_email) {
        try { await cuentas.cambiarCorreo(existente.id, correo); cambios.cuenta_email = correo; } catch (e) { /* ese correo ya lo usa otra cuenta: queda solo como contacto */ }
      }
      await col('perfiles').doc(existente.id).update(cambios);
    }
    const puente = await sincronizarSecretarias();
    return { ok: true, nuevo: !anterior, activada: !!existente, puente };
  }

  // Todos los avisos a secretarias pasan por aquí. Solo se le escribe a una persona si de verdad es secretaria
  // (en cualquiera de sus dos perfiles), tiene correo válido, no es cuenta de prueba cuando el aviso es de una persona
  // real, y un aviso de una cuenta de prueba solo le llega a otra cuenta de prueba. En cualquier otro caso va solo a soporte.
  // Cada aviso queda en «envios_correo» (pestaña «Correos enviados» de admin/) con a quién se envió y por qué.
  async function enviarAvisoSecretaria({ tipo, cedula, secretaria, involucradas = [], asunto, texto, razon }) {
    let para = null, motivo = razon;
    const hayPrueba = involucradas.some(esCuentaPrueba);
    if (!secretaria) motivo = `${razon} · sin secretaria responsable: solo a soporte`;
    else if (!tieneRol(secretaria, 'secretaria')) motivo = `${razon} · ${secretaria.nombre} ya no es secretaria: solo a soporte`;
    else if (!correoValido(secretaria.correo)) motivo = `${razon} · ${secretaria.nombre} no tiene correo válido: solo a soporte`;
    // Prueba solo con prueba: una cuenta de prueba nunca le escribe a una persona real, ni al revés
    else if (hayPrueba && !esCuentaPrueba(secretaria)) motivo = `${razon} · es de una cuenta de prueba y la secretaria es real: solo a soporte`;
    else if (!hayPrueba && esCuentaPrueba(secretaria)) motivo = `${razon} · la secretaria es cuenta de prueba y el aviso es de una persona real: solo a soporte`;
    else para = String(secretaria.correo).trim().toLowerCase();
    const cuerpo = para ? texto : `[Aviso que no se envió a ninguna secretaria — ${motivo}]\n\n${texto}`;
    let estado = 'enviado', error = null, destino = para || CORREO_SOPORTE;
    try {
      const r = await drive({ accion: 'correo', ...(para ? { para } : {}), asunto, texto: cuerpo });
      if (r && r.para) destino = r.para;
      if (para && r && r.para && r.para !== para) motivo = `${motivo} · el puente no tenía su correo en la lista: llegó solo a soporte`;
    } catch (err) { estado = 'fallido'; error = String(err.message || err).slice(0, 300); console.error(`Aviso «${tipo}» no enviado:`, error); }
    try { await col('envios_correo').add({ cedula: cedula || null, tipo, estado, correo: mascaraCorreo(destino), motivo: `Aviso: ${motivo}`, error, rol: 'secretaria', creado_en: hoy() }); }
    catch (err) { console.error('No se pudo guardar el registro del aviso:', err.message); }
    return { estado, a: destino === CORREO_SOPORTE ? 'soporte' : secretaria.nombre };
  }

  // ---------- Avisos por correo a cada persona (emprendedora, dinamizadora o secretaria) ----------
  // Cada cambio que le importa a alguien le llega por correo (cuestionario habilitado, sesión aprobada o devuelta,
  // asignación, comentario, cambio de semana, respuesta de soporte). Solo a correos reales; una cuenta de prueba
  // nunca le escribe a una persona real ni al revés. Todo queda en «envios_correo» (admin/ → «Correos enviados»).
  const SITIO_CIC = 'https://cicredmujeresdelcaribe.org/';
  const FIRMA = ['', '— Centro de Innovación Comunitaria para la Autonomía Económica de la Mujer',
    'Este es un aviso automático de la plataforma: no respondas a este correo. Si necesitas ayuda, toca «Soporte» en la plataforma.'];
  const correoDe = (x) => [x && x.correo, x && x.cuenta_email].map((v) => String(v || '').trim().toLowerCase()).find((v) => correoValido(v) && !esInterno(v)) || null;
  const primerNombre = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  async function registrarAviso(cedula, tipo, estado, correo, motivo, rol, error = null) {
    try { await col('envios_correo').add({ cedula: cedula || null, tipo, estado, correo: correo ? mascaraCorreo(correo) : null, motivo: `Aviso: ${motivo}`, error, rol: rol || null, creado_en: hoy() }); }
    catch (err) { console.error('No se pudo guardar el registro del aviso:', err.message); }
  }
  async function avisarPersona({ persona, cedula, tipo, asunto, lineas, de = null }) {
    if (!driveActivo() || !persona) return null;
    const ced = cedula || persona.cedula || persona._id || null;
    const para = correoDe(persona);
    if (!para) { await registrarAviso(ced, tipo, 'omitido', null, `${asunto} · no tiene correo registrado`, persona.rol); return null; }
    if (de && esCuentaPrueba(de) !== esCuentaPrueba(persona)) { await registrarAviso(ced, tipo, 'omitido', para, `${asunto} · cuenta de prueba y persona real: no se envía`, persona.rol); return null; }
    const texto = [`Hola${primerNombre(persona.nombre) ? `, ${primerNombre(persona.nombre)}` : ''}:`, '', ...lineas.filter((l) => l !== null && l !== undefined), '', `Entra a ${SITIO_CIC} para verlo.`, ...FIRMA].join('\n');
    try {
      const r = await drive({ accion: 'correo', persona: true, para, asunto: `[CIC] ${asunto}`, texto });
      const llego = r && r.para ? String(r.para).toLowerCase() : para;
      await registrarAviso(ced, tipo, llego === para ? 'enviado' : 'omitido', llego, llego === para ? asunto : `${asunto} · el puente de correo todavía no permite escribirle: llegó solo a soporte`, persona.rol);
      return llego === para;
    } catch (err) {
      await registrarAviso(ced, tipo, 'fallido', para, asunto, persona.rol, String(err.message || err).slice(0, 300));
      console.error(`Aviso «${tipo}» no enviado:`, err.message);
      return false;
    }
  }
  // La dinamizadora asignada a un emprendimiento, con su correo del directorio
  async function dinamizadoraDe(e) {
    if (!e || !e.dinamizadora_cedula) return null;
    const d = comoDinamizadora(await datos(col('directorio').doc(e.dinamizadora_cedula)));
    return d ? { ...d, cedula: e.dinamizadora_cedula, rol: 'dinamizadora' } : null;
  }

  // ---------- Novedades de la plataforma: la administración escribe qué cambió y se le envía a todo el mundo ----------
  // Se envía por tandas (el correo de Google tiene un límite diario); «Enviar a las que faltan» continúa donde quedó.
  const TANDA_NOVEDADES = 40;
  async function destinatariosTodos() {
    const porCorreo = new Map();
    for (const x of await lista(col('perfiles'))) { const c = correoDe(x); if (c && x.rol !== 'administradora' && !esCuentaPrueba(x)) porCorreo.set(c, { nombre: x.nombre, rol: x.rol, cedula: x.cedula }); }
    for (const x of await lista(col('directorio'))) { const c = correoDe(x); if (c && !porCorreo.has(c) && !esCuentaPrueba(x)) porCorreo.set(c, { nombre: x.nombre, rol: x.rol, cedula: x._id }); }
    return porCorreo;
  }
  const vistaNovedad = (x) => ({ id: x._id, titulo: x.titulo, texto: x.texto, creado_en: x.creado_en, enviados: (x.enviados || []).length, fallidos: (x.fallidos || []).length });
  async function adminNovedades(token) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Esta sección es solo para la administración.');
    const todas = (await lista(col('novedades'))).sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en))).slice(0, 20);
    return { novedades: todas.map(vistaNovedad), destinatarios: (await destinatariosTodos()).size, tanda: TANDA_NOVEDADES };
  }
  async function adminCrearNovedad(token, b) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Esta sección es solo para la administración.');
    const titulo = texto(b.titulo, 120);
    const cuerpo = String(b.texto ?? '').trim().slice(0, 4000);
    if (titulo.length < 5) throw new Falla(400, 'titulo', 'Escribe un título corto (por ejemplo: «Mejoras en Seguimiento»).');
    if (cuerpo.length < 20) throw new Falla(400, 'texto', 'Cuenta qué cambió (al menos una frase).');
    const ref = await col('novedades').add({ titulo, texto: cuerpo, creado_en: hoy(), creado_por: p.id, enviados: [], fallidos: [] });
    return { ok: true, id: ref.id };
  }
  async function adminEnviarNovedad(token, b) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Esta sección es solo para la administración.');
    if (!driveActivo()) throw new Falla(400, 'correo', 'El envío de correos no está configurado.');
    const ref = col('novedades').doc(String(b.id || '-'));
    const n = await datos(ref);
    if (!n) throw new Falla(404, 'no_existe', 'No encontramos esa novedad.');
    const todos = await destinatariosTodos();
    const ya = new Set([...(n.enviados || []), ...(n.fallidos || [])]);
    const faltan = [...todos.entries()].filter(([c]) => !ya.has(c));
    const enviados = [...(n.enviados || [])], fallidos = [...(n.fallidos || [])];
    let error = null;
    for (const [correo, x] of faltan.slice(0, TANDA_NOVEDADES)) {
      const ok = await avisarPersona({ persona: { ...x, correo }, tipo: 'novedades', asunto: `Novedades de la plataforma: ${n.titulo}`, lineas: ['Hicimos cambios en la plataforma del CIC:', '', n.texto] });
      if (ok) enviados.push(correo);
      else { fallidos.push(correo); if (ok === false && fallidos.length >= 3 && !enviados.length) { error = 'El correo de Google no está enviando (puede ser el límite diario). Intenta mañana.'; break; } }
    }
    await ref.update({ enviados, fallidos });
    return { ok: true, enviados: enviados.length, fallidos: fallidos.length, faltan: Math.max(0, todos.size - enviados.length - fallidos.length), total: todos.size, error };
  }
  // La novedad más reciente se muestra también dentro de la plataforma (a quien tenga sesión)
  async function ultimaNovedad(token) {
    await usuarioDelToken(token);
    const [n] = (await lista(col('novedades'))).sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
    return { novedad: n ? { id: n._id, titulo: n.titulo, texto: n.texto, creado_en: n.creado_en } : null };
  }

  async function verEnviosCorreo(token) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Este registro es para la administración.');
    const filas = (await lista(col('envios_correo'))).sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en))).slice(0, 300);
    const nombres = {};
    for (const x of await lista(col('perfiles'))) nombres[x.cedula] = x.nombre;
    for (const x of await lista(col('directorio'))) nombres[x._id] = nombres[x._id] || x.nombre;
    return { envios: filas.map((x) => ({ cedula: x.cedula, nombre: nombres[x.cedula] || null, estado: x.estado, motivo: x.motivo || null, error: x.error || null, correo: x.correo || null, rol: x.rol || null, creado_en: x.creado_en })) };
  }

  // ---------- Cuentas de administración (solo administración) ----------
  // Agrega un correo como administración: crea la cuenta (sin contraseña conocida) y le envía el enlace para crearla.
  // Nunca convierte la cuenta de una persona del equipo o de una emprendedora.
  async function adminAdministradoras(token) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Esta sección es solo para la administración.');
    const admins = await lista(col('perfiles').where('rol', '==', 'administradora'));
    return { administradoras: admins.map((x) => ({ correo: x.cuenta_email || x.correo, creado_en: x.creado_en || null, yo: x._id === p.id })).sort((a, b) => String(a.correo).localeCompare(String(b.correo))) };
  }
  async function adminAgregarAdministradora(token, b) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Esta sección es solo para la administración.');
    const correo = texto(b.correo, 120).toLowerCase();
    if (!correoValido(correo) || esInterno(correo)) throw new Falla(400, 'correo', 'Escribe un correo válido.');
    let uid = cuentas.uidPorCorreo ? await cuentas.uidPorCorreo(correo) : null;
    if (uid) {
      const ex = await perfilPorId(uid);
      if (ex && ex.rol !== 'administradora') throw new Falla(409, 'en_uso', `Ese correo ya es la cuenta de ${ex.nombre} (${NOMBRE_ROL[ex.rol] || ex.rol}). Para la administración usa otro correo.`);
    } else uid = await cuentas.crear({ email: correo, clave: claveAlAzar(), nombre: 'Administración CIC' });
    await col('perfiles').doc(uid).set({ cedula: `admin-${uid.slice(0, 6)}`, nombre: 'Administración CIC', rol: 'administradora', correo, cuenta_email: correo, creado_en: hoy(), agregada_por: p.id }, { merge: true });
    let enviado = true;
    try { await cuentas.enviarEnlace(correo, 'admin/'); } catch (e) { enviado = false; console.error(`Enlace de administración NO enviado a ${enmascarar(correo)}:`, e.message); }
    return { ok: true, enviado, correo: enmascarar(correo) };
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
      // Mensajes distintos para cada caso (antes todos decían «no coinciden» y la persona no sabía qué hacer)
      const fallos = await registrarFallo(cedula, bloqueo);
      const quedan = FALLOS_MAX - fallos;
      const aviso = quedan > 0
        ? ` Te ${quedan === 1 ? 'queda 1 intento' : `quedan ${quedan} intentos`} antes de una pausa de ${BLOQUEO_MIN} minutos.`
        : ` Por seguridad, espera ${BLOQUEO_MIN} minutos antes de volver a intentarlo.`;
      let motivo;
      if (p) motivo = 'La contraseña no es correcta. Si la cambiaste hace poco, escribe la nueva. Si no la recuerdas, toca «¿Olvidaste tu contraseña?».';
      else if (rol === 'emprendedora') motivo = 'No encontramos una cuenta con esta cédula. Revisa el número o, si aún no te has inscrito, toca «Inscribirme».';
      else if (await datos(col('directorio').doc(cedula))) motivo = 'Esta cédula todavía no tiene la cuenta activada. Toca «Activar mi cuenta»: te llega un enlace al correo para crear tu contraseña.';
      else motivo = 'Esta cédula no está registrada en el equipo del CIC. Revisa el número o toca «¿No puedes entrar? Pide soporte».';
      throw new Falla(401, 'credenciales', motivo + aviso, { quedan: Math.max(0, quedan), sin_cuenta: !p });
    }
    await col('bloqueos').doc(cedula).delete();
    // La contraseña ya se verificó: aquí sí podemos decirle cuál es su perfil.
    if (p.rol !== rol) {
      const otro = p.otros_roles && p.otros_roles[rol];
      if (!otro) throw new Falla(403, 'rol', `Tu cuenta está registrada como ${NOMBRE_ROL[p.rol]}. Elige ese perfil para entrar.`, { rol: p.rol });
      // Tiene los dos perfiles: entra con el que eligió y el otro queda guardado para la próxima vez.
      const otros = { ...p.otros_roles, [p.rol]: datosRol(p) };
      delete otros[rol];
      const cambio = { rol, ...datosRol(otro), otros_roles: otros };
      await col('perfiles').doc(p.id).update(cambio);
      return respuestaSesion({ ...p, ...cambio });
    }
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
    if (!codigo.startsWith('GRAB-') && !(Number(v.duracion_min) > 0)) throw new Falla(400, 'duracion', 'Escribe la duración exacta del video (minutos y segundos): la persona debe verlo completo para seguir.');
    const fila = {
      codigo, titulo: texto(v.titulo, 140) || codigo, youtube_id, drive_id,
      duracion_min: Number(v.duracion_min) > 0 ? Math.min(300, Math.round(Number(v.duracion_min) * 100) / 100) : null,
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
    const mat = Object.fromEntries(material.filter((m) => { const [c, u] = m._id.split('_'); return enlacesVigentes(m, CURSOS_ADMIN[c] && u !== 'general' ? idsMaterial(c, Number(u)).some((k) => CATALOGO.archivos[k]) : false); }).map((m) => [m._id, m.archivos || []]));
    const bancos = {};
    for (const q of preguntas) { const k = `${q.curso}_${q.unidad}`; bancos[k] = (bancos[k] || 0) + 1; }
    const cursos = Object.fromEntries(Object.entries(CURSOS_ADMIN).map(([id, c]) => [id, {
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
    if (!CURSOS_ADMIN[curso]) throw new Falla(400, 'curso', 'Ese curso no existe.');
    const unidad = b.unidad === 'general' ? 'general' : Number(b.unidad);
    if (unidad !== 'general' && (!Number.isInteger(unidad) || unidad < 1 || unidad > CURSOS_ADMIN[curso].unidades)) throw new Falla(400, 'curso', 'Esa unidad no existe.');
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
    const r = await col('foro_respuestas').add({ tema: id, texto: cuerpo, autor_id: p.id, autor: autorDe(p), autor_rol: NOMBRE_ROL[p.rol] || 'Administración', creado_en: hoy(), borrado: false });
    await ref.update({ respuestas: (t.respuestas || 0) + 1, ultima_actividad: hoy() });
    // Responder en la conversación de un módulo cuenta como la actividad de ese módulo
    if (t.modulo && p.rol !== 'emprendedora') await aporteDesdeForo(p, t.modulo, cuerpo, id, r.id).catch((e) => console.error('Aporte del módulo:', e.message));
    return foroTema(token, { id });
  }

  // ---------- Conversación de cada módulo: la actividad obligatoria de los cursos del equipo ----------
  const idTemaModulo = (curso, u) => `modulo_${curso}_${u}`;
  async function temaModulo(curso, u) {
    const id = idTemaModulo(curso, u);
    const ref = col('foro_temas').doc(id);
    let t = await datos(ref);
    if (!t) {
      const ts = hoy();
      t = {
        categoria: 'equipo', titulo: `${CURSOS[curso].nombre} · ${CURSOS[curso].unidad} ${u}: conversación del equipo`,
        texto: `Actividad obligatoria del ${CURSOS[curso].unidad.toLowerCase()} ${u}: cuenta con tus palabras qué aprendiste y cómo lo vas a aplicar en tu satélite. Lee los aportes de tus compañeras y compañeros: aquí aprendemos juntos.`,
        autor_id: null, autor: 'Secretaría Técnica', autor_rol: 'Secretaría Técnica', creado_en: ts, ultima_actividad: ts,
        respuestas: 0, fijado: false, borrado: false, modulo: { curso, unidad: u },
      };
      await ref.set(t);
    } else if (t.borrado) await ref.update({ borrado: false });
    return { id, ref, t };
  }
  const idEvidenciaForo = (persona, curso, u) => `${persona}_${curso}_${u}_foro`;
  async function guardarAporte(perfil, curso, u, txt, tema, respuesta) {
    await col('evidencias').doc(idEvidenciaForo(perfil.id, curso, u)).set({
      persona: perfil.id, curso, unidad: u, tipo: 'foro', texto: txt, enlace: null, foro_tema: tema, foro_respuesta: respuesta,
      estado: 'enviada', comentario: null, revisado_por: null, revisado_en: null, creado_en: hoy(),
    });
  }
  // ¿Puede esta persona registrar ya el aporte del módulo? (módulo abierto, con actividad y evaluación aprobada)
  function aporteHabilitado(perfil, ctx, curso, u) {
    const falta = requisito(perfil, ctx, curso, u);
    if (falta) return falta;
    if (!actividadRequerida(curso, u)) return 'Este módulo no tiene actividad: se aprueba con la evaluación.';
    if (CURSOS[curso].cuestionario && !aprobada(ctx, curso, u)) return 'Primero aprueba la evaluación del módulo; luego participa en el foro.';
    return null;
  }
  async function aporteDesdeForo(p, modulo, txt, tema, respuesta) {
    const { curso, unidad } = modulo;
    if (!CURSOS[curso] || txt.length < 20) return;
    const ctx = await contexto(p.id);
    if (aporteHabilitado(p, ctx, curso, unidad)) return;
    const previa = evidenciaDe(ctx, curso, unidad);
    if (previa && previa.estado !== 'devuelta') return;
    await guardarAporte(p, curso, unidad, txt, tema, respuesta);
    await emitirSiCompleto(p, curso);
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
    let d = p.dinamizadora_cedula ? comoDinamizadora(await datos(col('directorio').doc(p.dinamizadora_cedula))) : null;
    if (!d && p.satelite) {
      const del = (await lista(col('directorio'))).map(comoDinamizadora)
        .filter((x) => x && x.satelite === p.satelite).sort((a, b) => a._id.localeCompare(b._id));
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
    if (Number(e.semana_actual || 1) !== semana) await avisarPersona({ persona: e, tipo: 'aviso_semana', de: p, asunto: `Ya estás en la semana ${semana}`, lineas: [`Tu dinamizadora registró que ya vas en la semana ${semana} de tu proceso.`, 'En «Mi semana» encuentras lo que te toca y las guías para descargar.'] });
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
  const CORREO_SOPORTE = '2horas.online01@gmail.com';
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
  // Cuando una dinamizadora no puede entrar, se avisa también a su secretaria encargada para que le genere
  // el código de acceso: la secretaría del mismo pilar (acompañamiento, mercados o financiamiento); si no se
  // reconoce el pilar, la Dirección Técnica. Los datos salen del directorio (Firestore), nunca del código.
  const PILARES_SECRETARIA = [
    { area: 'Acompañamiento', clave: /acompa/i },
    { area: 'Acceso a Mercados', clave: /mercad/i },
    { area: 'Acceso a Financiamiento', clave: /financ|capitaliz/i },
  ];
  async function secretariaEncargada(cargoDinamizadora) {
    const secretarias = (await lista(col('directorio'))).filter((s) => tieneRol(s, 'secretaria') && correoValido(s.correo) && !esCuentaPrueba(s));
    const pilar = PILARES_SECRETARIA.find((x) => x.clave.test(String(cargoDinamizadora || '')));
    return (pilar && secretarias.find((s) => pilar.clave.test(cargoSecretaria(s))))
      || secretarias.find((s) => /direcci[oó]n t[eé]cnica/i.test(cargoSecretaria(s)))
      || null;
  }
  async function avisarSecretaria(t, texto) {
    if (t.categoria !== 'acceso' || !driveActivo()) return null;
    const d = comoDinamizadora(await datos(col('directorio').doc(t.cedula)));
    if (!d) return null;
    if (esCuentaPrueba(d)) return null; // cuenta de prueba: la solicitud ya le llega a soporte, a nadie más
    const s = await secretariaEncargada(d.cargo);
    if (!s) { console.warn(`Solicitud ${t.numero}: no se encontró secretaria encargada con correo.`); return null; }
    const asunto = `[CIC] ${d.nombre} necesita un código de acceso (${t.numero})`;
    const cuerpo = [
      `Hola, ${String(s.nombre).split(' ')[0]}:`, '',
      `La dinamizadora ${d.nombre} no puede entrar a la plataforma y pidió ayuda. Como secretaria encargada de su pilar, por favor genérale un código de acceso:`, '',
      `1. Entra a ${PANEL_SOPORTE.replace(/admin\/$/, '')} con tu cédula y elige «Secretaria».`,
      `2. Ve a «Seguimiento» → «Código de acceso» y escribe la cédula ${t.cedula}.`,
      '3. Envíale el código de 6 números por WhatsApp. Vence en 24 horas.', '',
      'Ella debe tocar «Ingresar» → «Dinamizadora» → «Activar mi cuenta» y escribir su cédula, el código y una contraseña nueva (mínimo 8 letras o números, que no sea su cédula).', '',
      `Dinamizadora: ${d.nombre} · CC ${t.cedula} · ${d.cargo || 'Dinamizadora'}${d.departamento ? ` · ${d.departamento}` : ''}`,
      `Contacto que dejó en la solicitud: ${t.contacto || 'no indicó'}${d.celular && !String(t.contacto || '').includes(d.celular) ? ` (en el directorio: ${d.celular})` : ''}`,
      `Lo que escribió: ${texto}`, '',
      `Solicitud ${t.numero}. Si ya la ayudaste, no tienes que hacer nada más: la administración la cierra.`,
    ].join('\n');
    const r = await enviarAvisoSecretaria({ tipo: 'aviso_codigo_acceso', cedula: t.cedula, secretaria: s, involucradas: [d], asunto, texto: cuerpo, razon: `código de acceso para ${d.nombre}, a la secretaria de su pilar (${s.nombre})` });
    return r.estado === 'enviado' && r.a !== 'soporte' ? { nombre: s.nombre, cargo: cargoSecretaria(s) || null, avisada_en: hoy() } : null;
  }
  const numeroTicket = () => `T-${hoy().slice(2, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const vistaTicket = (x, conMensajes) => ({
    id: x._id, numero: x.numero, categoria: x.categoria, categoria_nombre: CATEGORIAS_SOPORTE[x.categoria] || 'Otro', asunto: x.asunto,
    estado: x.estado, nombre: x.nombre, cedula: x.cedula, rol: x.rol || null, satelite: x.satelite || null, contacto: x.contacto || null,
    publico: !!x.publico, dispositivo: x.dispositivo || null, secretaria_avisada: x.secretaria_avisada || null, adjunto: x.adjunto ? { nombre: x.adjunto.nombre, mime: x.adjunto.mime, bytes: x.adjunto.bytes } : null,
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
    const secretaria = await avisarSecretaria(fila, descripcion);
    if (secretaria) await ref.update({ secretaria_avisada: secretaria });
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
    const secretaria = await avisarSecretaria(fila, descripcion);
    if (secretaria) await ref.update({ secretaria_avisada: secretaria });
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
    else if (x.persona) await avisarPersona({ persona: await perfilPorId(x.persona), tipo: 'aviso_soporte', asunto: `Respondieron tu solicitud ${x.numero}`, lineas: [`Soporte respondió tu solicitud «${x.asunto}»:`, `«${txt}»`, '', 'La ves completa en la pestaña «Soporte» de la plataforma.'] });
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
  // Títulos de las sesiones: los mismos de las páginas de las rutas (herramientas/Datos.pm)
  const TITULOS_HACER = ['Cuéntame tu negocio', 'Mi negocio puede ganar de otra forma', 'Mirar más allá de mi cuadra', 'El bolsillo separado', 'Cómo vender más', 'Crecer con orden'];
  const TITULOS_SER = ['De la subsistencia a la gerencia', 'De la visión de túnel a la visión panorámica', 'Mi liderazgo, mis derechos, mi protección', 'La confianza que sostiene'];
  const ACTIVIDADES = [
    ...[['A1', 'A2', 'A3'], ['A4', 'A5'], ['A6'], ['A7', 'A8', 'A9'], ['A10', 'A11'], ['A12', 'A13']].map((h, i) => ({ ruta: 'hacer', n: i + 1, nombre: `Ruta HACER · Semana ${i + 1}`, titulo: TITULOS_HACER[i], herramientas: h })),
    ...[['A14'], ['A15'], ['A16'], ['A17']].map((h, i) => ({ ruta: 'ser', n: i + 1, nombre: `Ruta SER · Taller ${i + 1}`, titulo: TITULOS_SER[i], herramientas: h })),
  ];
  const TIPOS_DOCUMENTO = ['acta', 'herramienta'];
  // Cada sesión admite varios archivos por tipo, subidos uno por uno. Claves: 'acta', 'acta_2'… y 'herramienta', 'herramienta_2'…
  const MAX_POR_TIPO = 12;
  const tipoDeClave = (k) => String(k).split('_')[0];
  const numeroDeClave = (k) => Number(String(k).split('_')[1] || 1);
  const claveValida = (k) => /^(acta|herramienta)(_([2-9]|1[0-2]))?$/.test(String(k || ''));
  const clavesDe = (docs, tipo) => Object.keys(docs || {}).filter((k) => claveValida(k) && tipoDeClave(k) === tipo && docs[k]).sort((a, b) => numeroDeClave(a) - numeroDeClave(b));
  const tieneTipo = (docs, tipo) => clavesDe(docs, tipo).length > 0;
  const documentosCompletos = (docs) => TIPOS_DOCUMENTO.every((t) => tieneTipo(docs, t));
  const TIPOS_ARCHIVO = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  const MAX_BYTES_DOCUMENTO = 5 * 1024 * 1024;
  const CARACTERES_POR_PARTE = 900000; // cada documento de Firestore admite hasta 1 MiB
  const actividadDe = (ruta, n) => ACTIVIDADES.find((a) => a.ruta === ruta && a.n === Number(n)) || null;
  const idSeguimiento = (emp, a) => `${emp}_${a.ruta}_${a.n}`;
  const requeridos = (a) => [
    { tipo: 'acta', nombre: 'Documentos de la sesión', detalle: 'Acta firmada, informe de la sesión, registro fotográfico, lista de asistencia, evaluación de comprensión temática… Súbelos uno por uno (foto o PDF).' },
    { tipo: 'herramienta', nombre: `Herramienta${a.herramientas.length > 1 ? 's' : ''} ${a.herramientas.join(', ')} diligenciada${a.herramientas.length > 1 ? 's' : ''}`, detalle: 'Foto o PDF de la herramienta trabajada en la sesión. Si son varias hojas, súbelas una por una.' },
  ];
  const metaDocumento = (m) => (m ? { nombre: m.nombre, mime: m.mime, bytes: m.bytes, subido_en: m.subido_en, drive_url: m.drive_url || null, drive_pendiente: !!m.drive_pendiente } : null);
  // Copia en Google Drive: «CIC · Documentos de seguimiento / Satélite / Emprendimiento · CC / HACER · Semana N»
  const driveActivo = () => !!(drive && (!drive.activo || drive.activo()));
  const nombreSatelite = (id) => (SATELITES[id] ? `${SATELITES[id].departamento} · ${SATELITES[id].municipios.join(' y ')}` : 'Sin satélite');
  const rutaDrive = (e, a) => [nombreSatelite(e.satelite), `${e.nombre} · CC ${e.cedula}`, a.ruta === 'hacer' ? `HACER · Semana ${a.n}` : `SER · Taller ${a.n}`];
  const nombreDrive = (a, clave, mime, fecha) => {
    const n = numeroDeClave(clave);
    const base = tipoDeClave(clave) === 'acta' ? 'Documento de la sesión' : `Herramientas ${a.herramientas.join('-')}`;
    return `${base}${n > 1 ? ` (${n})` : ''}${fecha ? ` · ${fecha}` : ''}.${TIPOS_ARCHIVO[mime] || 'bin'}`;
  };
  async function copiarEnDrive(e, a, clave, mime, base64, fecha, anterior) {
    if (!driveActivo()) return {};
    try {
      const r = await drive({ accion: 'subir', ruta: rutaDrive(e, a), nombre: nombreDrive(a, clave, mime, fecha), mime, base64, reemplazar: (anterior && anterior.drive_id) || null });
      return r && r.id ? { drive_id: r.id, drive_url: r.url || null, drive_pendiente: false } : { drive_pendiente: true };
    } catch (err) {
      console.error('No se pudo copiar en Drive:', err.message);
      return { drive_pendiente: true };
    }
  }
  // Revisión de cada actividad: la dinamizadora la envía a la Secretaría Técnica, que la aprueba o la devuelve con comentario.
  const estadoRevision = (x) => (x && x.revision && x.revision.estado) || null; // null | enviada | aprobada | devuelta
  function avanceDe(filas) {
    const ejecutadas = filas.filter((x) => x.ejecutada === true);
    return {
      total: ACTIVIDADES.length,
      ejecutadas: ejecutadas.length,
      no_ejecutadas: filas.filter((x) => x.ejecutada === false).length,
      con_documentos: ejecutadas.filter((x) => documentosCompletos(x.documentos)).length,
      por_revisar: filas.filter((x) => estadoRevision(x) === 'enviada').length,
      aprobadas: filas.filter((x) => estadoRevision(x) === 'aprobada').length,
      devueltas: filas.filter((x) => estadoRevision(x) === 'devuelta').length,
    };
  }
  // Mientras la Secretaría la revisa (o ya la aprobó), la dinamizadora no puede cambiar la actividad.
  function exigirEditable(p, fila) {
    const r = estadoRevision(fila);
    if (p.rol === 'dinamizadora' && (r === 'enviada' || r === 'aprobada')) {
      throw new Falla(409, 'en_revision', r === 'aprobada' ? 'Esta actividad ya fue aprobada por la Secretaría Técnica: no se puede cambiar.' : 'Esta actividad está en revisión de la Secretaría Técnica. Si necesitas corregir algo, escríbele en los comentarios.');
    }
  }
  const vistaRevision = (x) => (x && x.revision ? { estado: x.revision.estado, enviada_en: x.revision.enviada_en || null, revisada_en: x.revision.revisada_en || null, revisada_por: x.revision.revisada_por_nombre || null } : null);
  const vistaComentarios = (x) => ((x && x.comentarios) || []).map((c) => ({ autor: c.autor, rol: c.rol, texto: c.texto, estado: c.estado || null, en: c.en }));
  // Avance de cada emprendedora, con el estado de cada actividad (celdas de la tabla de seguimiento) y del cuestionario semanal
  async function avancePorEmprendedora() {
    const porPersona = {};
    for (const x of await lista(col('seguimiento'))) (porPersona[x.emprendedora] = porPersona[x.emprendedora] || []).push(x);
    const cuestionarios = {};
    for (const x of await lista(col('aprendizajes'))) (cuestionarios[x.emprendedora] = cuestionarios[x.emprendedora] || []).push(x);
    const avance = (id) => avanceDe(porPersona[id] || []);
    avance.celdas = (id) => Object.fromEntries((porPersona[id] || []).map((x) => [`${x.ruta}_${x.n}`, {
      e: typeof x.ejecutada === 'boolean' ? x.ejecutada : null,
      d: documentosCompletos(x.documentos),
      r: estadoRevision(x), f: x.fecha || null, c: (x.comentarios || []).length,
    }]));
    avance.aprendizaje = (id) => {
      const filas = cuestionarios[id] || [];
      return { habilitadas: filas.filter((x) => x.habilitada).map((x) => x.semana).sort(), respondidas: filas.filter((x) => x.respondida_en).map((x) => x.semana).sort() };
    };
    return avance;
  }
  async function dinamizadorasDirectorio() {
    return (await lista(col('directorio'))).map(comoDinamizadora).filter(Boolean)
      .map((x) => ({ cedula: x._id, nombre: x.nombre, cargo: x.cargo || null, satelite: x.satelite || null }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }
  const filaEmprendimiento = (x, avance, nombres) => ({
    cedula: x.cedula, nombre: x.nombre, negocio: x.negocio || null, municipio: x.municipio || null, satelite: x.satelite || null,
    celular: x.celular || null, semana_actual: x.semana_actual || 1,
    dinamizadora: x.dinamizadora_cedula || null, dinamizadora_nombre: x.dinamizadora_cedula ? (nombres[x.dinamizadora_cedula] || null) : null,
    avance: avance(x._id),
    celdas: avance.celdas ? avance.celdas(x._id) : {},
    aprendizaje: avance.aprendizaje ? avance.aprendizaje(x._id) : { habilitadas: [], respondidas: [] },
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
      for (const k of Object.keys(x.documentos || {}).filter(claveValida)) { const m = x.documentos[k]; if (m && !m.drive_id) faltan.push([x, k]); }
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
      const d = comoDinamizadora(await datos(col('directorio').doc(ced)));
      if (!d) throw new Falla(404, 'dinamizadora', 'No encontramos a esa dinamizadora.');
      din = { cedula: ced, ...d };
    }
    const perfiles = [];
    for (const c of cedulas) {
      const e = await perfilPorCedula(c);
      if (!e || e.rol !== 'emprendedora') throw new Falla(404, 'no_existe', `No encontramos el emprendimiento con cédula ${c}.`);
      if (din && e.satelite !== din.satelite) throw new Falla(400, 'satelite', `${e.nombre} es de otro satélite: solo se puede asignar a una dinamizadora de su mismo satélite.`);
      perfiles.push(e);
    }
    const nuevas = perfiles.filter((e) => din && e.dinamizadora_cedula !== din.cedula);
    for (const e of perfiles) {
      await col('perfiles').doc(e.id).update({ dinamizadora_cedula: din ? din.cedula : null, asignada_por: p.id, asignada_en: hoy() });
    }
    if (din && nuevas.length) {
      await avisarPersona({ persona: { ...din, rol: 'dinamizadora' }, cedula: din.cedula, tipo: 'aviso_asignacion', de: p,
        asunto: nuevas.length === 1 ? `Te asignaron a ${nuevas[0].nombre}` : `Te asignaron ${nuevas.length} emprendedoras`,
        lineas: [`La Secretaría Técnica te asignó ${nuevas.length === 1 ? 'esta emprendedora' : 'estas emprendedoras'} para acompañar:`, '', ...nuevas.map((e) => `• ${e.nombre}${e.negocio ? ` (${e.negocio})` : ''}${e.municipio ? ` · ${e.municipio}` : ''}${e.celular ? ` · ${e.celular}` : ''}`), '', 'Las encuentras en «Seguimiento» → «Mis emprendedoras».'] });
      for (const e of nuevas) await avisarPersona({ persona: e, tipo: 'aviso_asignacion', de: p, asunto: 'Ya tienes dinamizadora',
        lineas: [`Tu dinamizadora es ${din.nombre}.${din.celular ? ` Su celular es ${din.celular}.` : ''}`, 'Ella te acompañará en las sesiones de tu negocio y en los talleres.'] });
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
      emprendimiento: { cedula: e.cedula, nombre: e.nombre, negocio: e.negocio || null, municipio: e.municipio || null, satelite: e.satelite || null, celular: e.celular || null, dinamizadora: e.dinamizadora_cedula || null, dinamizadora_nombre: din ? din.nombre : null },
      actividades: ACTIVIDADES.map((a) => {
        const x = filas[`${a.ruta}_${a.n}`];
        return {
          ruta: a.ruta, n: a.n, nombre: a.nombre, titulo: a.titulo, herramientas: a.herramientas, requeridos: requeridos(a),
          ejecutada: x ? x.ejecutada : null, fecha: x ? x.fecha || null : null, motivo: x ? x.motivo || null : null,
          // Por tipo, la lista de archivos subidos (cada uno con su clave para verlo, reemplazarlo o quitarlo)
          documentos: Object.fromEntries(TIPOS_DOCUMENTO.map((t) => [t, clavesDe(x && x.documentos, t).map((k) => ({ clave: k, ...metaDocumento(x.documentos[k]) }))])),
          revision: vistaRevision(x), comentarios: vistaComentarios(x),
        };
      }),
      avance: avanceDe(Object.values(filas)),
      aprendizaje: await semanasAprendizaje(e.id, true),
      preguntas_aprendizaje: PREGUNTAS_APRENDIZAJE,
    };
  }

  // ---------- Cuestionario de aprendizaje semanal (emprendedoras) ----------
  // La Secretaría o la dinamizadora asignada habilitan cada semana a cada emprendedora; ella lo diligencia
  // en «Mi semana» y las respuestas quedan en «aprendizajes» (una por emprendedora y semana).
  const SEMANAS_APRENDIZAJE = 6;
  const PREGUNTAS_APRENDIZAJE = [
    { id: 'aprendi', tipo: 'texto', texto: '¿Qué fue lo más importante que aprendiste esta semana?', obligatoria: true },
    { id: 'aplicare', tipo: 'texto', texto: '¿Qué vas a aplicar en tu negocio a partir de esta semana?', obligatoria: true },
    { id: 'dificultad', tipo: 'texto', texto: '¿Qué se te dificultó o qué te gustaría reforzar?', obligatoria: false },
    { id: 'utilidad', tipo: 'escala', texto: '¿Qué tan útil fue esta semana para tu negocio?', obligatoria: true },
    { id: 'confianza', tipo: 'escala', texto: '¿Qué tan segura te sientes para aplicar lo aprendido?', obligatoria: true },
  ];
  const idAprendizaje = (emp, semana) => `${emp}_${semana}`;
  async function semanasAprendizaje(empId, conRespuestas) {
    const filas = Object.fromEntries((await lista(col('aprendizajes').where('emprendedora', '==', empId))).map((x) => [x.semana, x]));
    return Array.from({ length: SEMANAS_APRENDIZAJE }, (_, i) => {
      const x = filas[i + 1];
      return {
        semana: i + 1, habilitada: !!(x && x.habilitada), habilitada_en: (x && x.habilitada_en) || null,
        respondida_en: (x && x.respondida_en) || null,
        ...(conRespuestas && x && x.respondida_en ? { respuestas: x.respuestas } : {}),
      };
    });
  }
  const validarSemana = (s) => { const n = Number(s); if (!Number.isInteger(n) || n < 1 || n > SEMANAS_APRENDIZAJE) throw new Falla(400, 'semana', `La semana debe estar entre 1 y ${SEMANAS_APRENDIZAJE}.`); return n; };
  async function habilitarAprendizaje(token, b) {
    const { p, e } = await emprendimientoPermitido(token, b.cedula);
    const semana = validarSemana(b.semana);
    const ref = col('aprendizajes').doc(idAprendizaje(e.id, semana));
    const x = await datos(ref);
    if (x && x.respondida_en) throw new Falla(409, 'respondida', 'Esa semana ya fue respondida: no se puede cambiar.');
    const habilitada = b.habilitada !== false;
    await ref.set({ ...(x || {}), emprendedora: e.id, semana, habilitada, habilitada_por: p.id, habilitada_en: habilitada ? hoy() : null, respondida_en: null, respuestas: null });
    if (habilitada && !(x && x.habilitada)) await avisarPersona({ persona: e, tipo: 'aviso_cuestionario', de: p, asunto: `Tu cuestionario de la semana ${semana} está listo`,
      lineas: [`Ya puedes responder el cuestionario de aprendizaje de la semana ${semana}.`, 'Entra a la plataforma: está en «Mi semana», en «Tu cuestionario de aprendizaje». Son 5 preguntas cortas.'] });
    return verSeguimiento(token, b);
  }
  async function miAprendizaje(token) {
    const p = await usuarioDelToken(token);
    if (p.rol !== 'emprendedora') throw new Falla(403, 'permiso', 'Este cuestionario es para las emprendedoras.');
    return { preguntas: PREGUNTAS_APRENDIZAJE, semanas: await semanasAprendizaje(p.id, true) };
  }
  async function responderAprendizaje(token, b) {
    const p = await usuarioDelToken(token);
    if (p.rol !== 'emprendedora') throw new Falla(403, 'permiso', 'Este cuestionario es para las emprendedoras.');
    const semana = validarSemana(b.semana);
    const ref = col('aprendizajes').doc(idAprendizaje(p.id, semana));
    const x = await datos(ref);
    if (!x || !x.habilitada) throw new Falla(403, 'no_habilitada', 'Este cuestionario todavía no está habilitado. Tu dinamizadora lo habilita al terminar la semana.');
    if (x.respondida_en) throw new Falla(409, 'respondida', 'Ya respondiste el cuestionario de esta semana. ¡Gracias!');
    const r = b.respuestas || {};
    const respuestas = {};
    for (const q of PREGUNTAS_APRENDIZAJE) {
      if (q.tipo === 'escala') {
        const v = Number(r[q.id]);
        if (!Number.isInteger(v) || v < 1 || v > 5) { if (q.obligatoria) throw new Falla(400, q.id, `Elige un número del 1 al 5 en: «${q.texto}»`); continue; }
        respuestas[q.id] = v;
      } else {
        const v = String(r[q.id] ?? '').trim().slice(0, 1500);
        if (q.obligatoria && v.length < 3) throw new Falla(400, q.id, `Responde: «${q.texto}»`);
        respuestas[q.id] = v || null;
      }
    }
    await ref.set({ ...x, respuestas, respondida_en: hoy() });
    return miAprendizaje(token);
  }
  async function marcarActividad(token, b) {
    const { p, e } = await emprendimientoPermitido(token, b.cedula);
    const a = actividadDe(b.ruta, b.n);
    if (!a) throw new Falla(400, 'actividad', 'Esa actividad no existe.');
    if (typeof b.ejecutada !== 'boolean') throw new Falla(400, 'ejecutada', 'Indica si la actividad se ejecutó o no.');
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(b.fecha || '') ? b.fecha : null;
    const id = idSeguimiento(e.id, a);
    const previa = await datos(col('seguimiento').doc(id));
    exigirEditable(p, previa);
    await col('seguimiento').doc(id).set({
      emprendedora: e.id, ruta: a.ruta, n: a.n, ejecutada: b.ejecutada,
      fecha: b.ejecutada ? fecha : null, motivo: b.ejecutada ? null : (texto(b.motivo, 300) || null),
      documentos: (previa && previa.documentos) || {}, marcado_por: p.id, marcado_en: hoy(),
      revision: (previa && previa.revision) || null, comentarios: (previa && previa.comentarios) || [],
    });
    return verSeguimiento(token, b);
  }
  const comentario = (p, txt, estado = null) => ({ autor: p.nombre, autor_id: p.id, rol: NOMBRE_ROL[p.rol] || 'Equipo', texto: txt, estado, en: hoy() });
  // Dinamizadora: «Enviar a la Secretaría Técnica» cuando la actividad está completa (o explicó por qué no se hizo).
  async function enviarActividad(token, b) {
    const { p, e } = await emprendimientoPermitido(token, b.cedula);
    if (p.rol !== 'dinamizadora') throw new Falla(403, 'permiso', 'La dinamizadora asignada envía la actividad a la Secretaría Técnica.');
    const a = actividadDe(b.ruta, b.n);
    if (!a) throw new Falla(400, 'actividad', 'Esa actividad no existe.');
    const id = idSeguimiento(e.id, a);
    const fila = await datos(col('seguimiento').doc(id));
    if (!fila || typeof fila.ejecutada !== 'boolean') throw new Falla(400, 'ejecutada', 'Primero marca si la actividad se ejecutó.');
    exigirEditable(p, fila);
    if (fila.ejecutada && !documentosCompletos(fila.documentos)) throw new Falla(400, 'documentos', 'Antes de enviarla, sube al menos un documento de la sesión y la herramienta diligenciada.');
    if (!fila.ejecutada && !fila.motivo) throw new Falla(400, 'motivo', 'Antes de enviarla, escribe y guarda por qué no se ejecutó.');
    const nota = texto(b.nota, 1000);
    const comentarios = [...(fila.comentarios || []), ...(nota ? [comentario(p, nota, 'enviada')] : [])];
    await col('seguimiento').doc(id).set({ ...fila, comentarios, revision: { estado: 'enviada', enviada_en: hoy(), enviada_por: p.id } });
    await avisarEnvioActividad(p, e, a, fila, nota);
    return verSeguimiento(token, b);
  }
  // Correo a la Secretaría: «tal dinamizadora envió documentos para su aprobación». Le llega SOLO a la secretaria que
  // asignó ese emprendimiento (aunque ella haya entrado con su otro perfil). Si no hay una secretaria responsable, el
  // aviso va solo a soporte: nunca se adivina a otra persona. Si falla el correo, el envío igual queda hecho.
  async function avisarEnvioActividad(p, e, a, fila, nota) {
    if (!driveActivo()) return;
    const asignadora = e.asignada_por ? await perfilPorId(e.asignada_por) : null;
    const actividad = `${a.ruta === 'hacer' ? `Semana ${a.n}` : `Taller ${a.n}`} · ${a.titulo}`;
    const texto = [
      `Hola${asignadora ? `, ${String(asignadora.nombre).split(' ')[0]}` : ''}:`, '',
      `La dinamizadora ${p.nombre} envió documentos para tu aprobación.`, '',
      `Emprendimiento: ${e.nombre}${e.negocio ? ` (${e.negocio})` : ''}`,
      `Actividad: ${actividad}`,
      fila.ejecutada ? `Sesión del ${fila.fecha || 'día sin indicar'} · ${clavesDe(fila.documentos, 'acta').length} documento(s) de la sesión y ${clavesDe(fila.documentos, 'herramienta').length} archivo(s) de herramientas en la plataforma.` : `No se ejecutó. Motivo: ${fila.motivo}`,
      nota ? `\nMensaje de la dinamizadora: «${nota}»` : '', '',
      `Para revisarla: entra a ${PANEL_SOPORTE.replace(/admin\/$/, '')} con tu cédula, elige «Secretaria», abre «Seguimiento» y toca «Abrir tarjetas» en ese emprendimiento.`,
      'Ahí respondes «¿Se aprueban los documentos?» con Sí o No y le dejas tus comentarios.',
    ].join('\n');
    await enviarAvisoSecretaria({
      tipo: 'aviso_envio_documentos', cedula: p.cedula, secretaria: asignadora, involucradas: [p, e],
      asunto: `[CIC] ${p.nombre} envió documentos para aprobar · ${e.nombre}`, texto,
      razon: `documentos de ${e.nombre} (${actividad}) enviados por ${p.nombre}${asignadora ? `, a la secretaria que asignó (${asignadora.nombre})` : ''}`,
    });
  }
  // Secretaría: aprueba o devuelve (con comentario obligatorio) una actividad enviada.
  async function revisarActividad(token, b) {
    const { p, e } = await emprendimientoPermitido(token, b.cedula);
    if (p.rol !== 'secretaria') throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica aprueba o devuelve actividades.');
    const a = actividadDe(b.ruta, b.n);
    if (!a) throw new Falla(400, 'actividad', 'Esa actividad no existe.');
    const estado = String(b.estado || '');
    if (estado !== 'aprobada' && estado !== 'devuelta') throw new Falla(400, 'estado', 'Elige aprobar o devolver.');
    const txt = texto(b.comentario, 1000);
    if (estado === 'devuelta' && txt.length < 5) throw new Falla(400, 'comentario', 'Cuando devuelves una actividad, escribe qué debe corregir la dinamizadora.');
    const id = idSeguimiento(e.id, a);
    const fila = await datos(col('seguimiento').doc(id));
    if (!fila || typeof fila.ejecutada !== 'boolean') throw new Falla(400, 'ejecutada', 'Esta actividad todavía no tiene registro de la dinamizadora.');
    const comentarios = [...(fila.comentarios || []), comentario(p, txt || (estado === 'aprobada' ? 'Actividad aprobada.' : ''), estado)];
    await col('seguimiento').doc(id).set({ ...fila, comentarios, revision: { ...(fila.revision || {}), estado, revisada_en: hoy(), revisada_por: p.id, revisada_por_nombre: p.nombre } });
    const nombreSesion = `${a.ruta === 'hacer' ? `Semana ${a.n}` : `Taller ${a.n}`}${a.titulo ? ` · ${a.titulo}` : ''}`;
    await avisarPersona({ persona: await dinamizadoraDe(e), tipo: 'aviso_revision', de: p,
      asunto: estado === 'aprobada' ? `Aprobaron la ${nombreSesion.split(' · ')[0]} de ${e.nombre}` : `Hay que corregir la ${nombreSesion.split(' · ')[0]} de ${e.nombre}`,
      lineas: [estado === 'aprobada' ? `${p.nombre} (Secretaría Técnica) aprobó los documentos de ${nombreSesion} de ${e.nombre}.` : `${p.nombre} (Secretaría Técnica) te pidió corregir ${nombreSesion} de ${e.nombre}.`,
        txt ? `\nComentario: «${txt}»` : null,
        estado === 'devuelta' ? '\nEntra a «Seguimiento»: verás un aviso rojo con el botón «Corregir». Haz el ajuste y vuelve a enviarla.' : null] });
    return verSeguimiento(token, b);
  }
  // Comentarios de la actividad: la Secretaría deja anotaciones y la dinamizadora puede responder.
  async function comentarActividad(token, b) {
    const { p, e } = await emprendimientoPermitido(token, b.cedula);
    const a = actividadDe(b.ruta, b.n);
    if (!a) throw new Falla(400, 'actividad', 'Esa actividad no existe.');
    const txt = texto(b.texto, 1000);
    if (txt.length < 2) throw new Falla(400, 'texto', 'Escribe el comentario.');
    const id = idSeguimiento(e.id, a);
    const fila = (await datos(col('seguimiento').doc(id))) || { emprendedora: e.id, ruta: a.ruta, n: a.n, ejecutada: null, fecha: null, motivo: null, documentos: {}, revision: null };
    await col('seguimiento').doc(id).set({ ...fila, comentarios: [...(fila.comentarios || []), comentario(p, txt)].slice(-50) });
    const sesion = `${a.ruta === 'hacer' ? `Semana ${a.n}` : `Taller ${a.n}`} de ${e.nombre}`;
    if (p.rol === 'secretaria') await avisarPersona({ persona: await dinamizadoraDe(e), tipo: 'aviso_comentario', de: p, asunto: `Nueva nota de la Secretaría · ${sesion}`, lineas: [`${p.nombre} dejó una nota en la ${sesion}:`, `«${txt}»`] });
    else if (e.asignada_por) {
      const sec = await perfilPorId(e.asignada_por);
      await enviarAvisoSecretaria({ tipo: 'aviso_comentario', cedula: p.cedula, secretaria: sec, involucradas: [p, e], asunto: `[CIC] Nota de ${p.nombre} · ${sesion}`,
        texto: [`Hola${sec ? `, ${primerNombre(sec.nombre)}` : ''}:`, '', `${p.nombre} dejó una nota en la ${sesion}:`, `«${txt}»`, '', `Entra a ${SITIO_CIC} → «Seguimiento» para verla.`, ...FIRMA].join('\n'),
        razon: `nota de ${p.nombre} en ${sesion}` });
    }
    return verSeguimiento(token, b);
  }
  // Emprendedora: el estado de sus actividades (si ya fueron aprobadas por la Secretaría Técnica).
  async function miAvance(token) {
    const p = await usuarioDelToken(token);
    if (p.rol !== 'emprendedora') throw new Falla(403, 'permiso', 'Este avance es de cada emprendedora.');
    const filas = Object.fromEntries((await lista(col('seguimiento').where('emprendedora', '==', p.id))).map((x) => [`${x.ruta}_${x.n}`, x]));
    const actividades = ACTIVIDADES.map((a) => {
      const x = filas[`${a.ruta}_${a.n}`];
      const r = estadoRevision(x);
      const estado = r === 'aprobada' ? 'aprobada' : r === 'enviada' || r === 'devuelta' ? 'en_revision' : x && x.ejecutada === true ? 'realizada' : x && x.ejecutada === false ? 'no_realizada' : 'pendiente';
      return { ruta: a.ruta, n: a.n, nombre: a.nombre, estado, fecha: (x && x.fecha) || null, aprobada_en: r === 'aprobada' ? x.revision.revisada_en || null : null };
    });
    return { actividades, aprobadas: actividades.filter((x) => x.estado === 'aprobada').length, total: actividades.length };
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
    exigirEditable(p, fila);
    const mime = String(b.mime || '');
    if (!TIPOS_ARCHIVO[mime]) throw new Falla(400, 'archivo', 'Sube una foto (JPG o PNG) o un PDF.');
    const base64 = String(b.base64 || '');
    if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw new Falla(400, 'archivo', 'No pudimos leer el archivo. Intenta de nuevo.');
    const bytes = Buffer.from(base64, 'base64').length;
    if (bytes > MAX_BYTES_DOCUMENTO) throw new Falla(400, 'archivo', 'El archivo pesa más de 5 MB. Toma la foto con menos resolución o comprime el PDF.');
    const docs = fila.documentos || {};
    let clave;
    if (b.clave) {
      if (!claveValida(b.clave) || tipoDeClave(b.clave) !== b.tipo || !docs[b.clave]) throw new Falla(404, 'no_existe', 'Ese documento ya no existe. Vuelve a abrir la sesión.');
      clave = b.clave;
    } else {
      const usadas = clavesDe(docs, b.tipo);
      if (usadas.length >= MAX_POR_TIPO) throw new Falla(400, 'limite', `Ya hay ${MAX_POR_TIPO} archivos en esta parte. Quita alguno o júntalos en un PDF.`);
      const libre = Array.from({ length: MAX_POR_TIPO }, (_, i) => (i ? `${b.tipo}_${i + 1}` : b.tipo)).find((k) => !docs[k]);
      clave = libre;
    }
    const base = `${id}_${clave}`;
    const partes = Math.ceil(base64.length / CARACTERES_POR_PARTE);
    for (let i = 0; i < partes; i++) await col('documentos').doc(`${base}_${i}`).set({ parte: base64.slice(i * CARACTERES_POR_PARTE, (i + 1) * CARACTERES_POR_PARTE) });
    const anterior = docs[clave];
    if (anterior && anterior.partes > partes) await borrarPartes(base, partes, anterior.partes);
    const nombre = (texto(b.nombre, 120) || b.tipo).replace(/[\\/:*?"<>|]+/g, '_');
    const enDrive = await copiarEnDrive(e, a, clave, mime, base64, fila.fecha, anterior);
    await col('seguimiento').doc(id).set({ ...fila, documentos: { ...docs, [clave]: { nombre, mime, bytes, partes, subido_por: p.id, subido_en: hoy(), ...enDrive } } });
    return verSeguimiento(token, b);
  }
  async function verDocumento(token, b) {
    const { e } = await emprendimientoPermitido(token, b.cedula);
    const a = actividadDe(b.ruta, b.n);
    const clave = b.clave || b.tipo;
    const fila = a && claveValida(clave) ? await datos(col('seguimiento').doc(idSeguimiento(e.id, a))) : null;
    const m = fila && fila.documentos && fila.documentos[clave];
    if (!m) throw new Falla(404, 'no_existe', 'Ese documento todavía no se ha subido.');
    let base64 = '';
    for (let i = 0; i < m.partes; i++) { const parte = await datos(col('documentos').doc(`${idSeguimiento(e.id, a)}_${clave}_${i}`)); base64 += parte ? parte.parte : ''; }
    return { nombre: m.nombre, mime: m.mime, base64 };
  }
  async function quitarDocumento(token, b) {
    const { p, e } = await emprendimientoPermitido(token, b.cedula);
    const a = actividadDe(b.ruta, b.n);
    const clave = b.clave || b.tipo;
    if (!a || !claveValida(clave)) throw new Falla(400, 'tipo', 'Ese documento no existe.');
    const id = idSeguimiento(e.id, a);
    const fila = await datos(col('seguimiento').doc(id));
    exigirEditable(p, fila);
    const m = fila && fila.documentos && fila.documentos[clave];
    if (m) {
      if (m.drive_id && driveActivo()) await drive({ accion: 'quitar', id: m.drive_id }).catch((err) => console.error('Drive:', err.message));
      await borrarPartes(`${id}_${clave}`, 0, m.partes);
      const documentos = { ...fila.documentos };
      delete documentos[clave];
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
  // La evidencia más reciente del módulo: el aporte en el foro, o la actividad o verificación que se enviaba antes
  // (las ya enviadas siguen contando, para que nadie pierda su avance).
  const evidenciaDe = (ctx, curso, u) => ctx.evidencias.filter((e) => e.curso === curso && e.unidad === u)
    .sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)))[0];
  const actividadRequerida = (curso, u) => !(CURSOS[curso].sin_actividad || []).includes(u);
  const actividadHecha = (ctx, curso, u) => !actividadRequerida(curso, u) || !!evidenciaDe(ctx, curso, u);
  const tieneVideo = (ctx, curso, u) => ctx.videos.has(`${CURSOS[curso].prefijo}${u}`);
  const aprobada = (ctx, curso, u) => !!(filaDe(ctx, curso, u) || {}).aprobado_en;
  // El video cuenta como visto cuando pasó al menos el 90 % de su duración desde que se abrió en la lección.
  // Si la unidad entró en pausa, hay que volver a verlo: cuenta desde una apertura posterior a la pausa.
  // El video se debe ver completo: su duración entera (la que se escribe en admin/), no una parte.
  const segundosDe = (v) => (v && v.duracion_min ? Math.ceil(v.duracion_min * 60) : SEGUNDOS_SIN_DURACION);
  const segundosVideo = (ctx, curso, u) => segundosDe(ctx.videos.get(`${CURSOS[curso].prefijo}${u}`));
  const inicioValido = (f) => (f.video_inicio && (!f.bloqueado_en || f.video_inicio > f.bloqueado_en) ? f.video_inicio : null);
  // Solo suma el tiempo que el navegador reporta con pulsos: la página abierta y el video en pantalla.
  const vistoSeg = (f) => (inicioValido(f) ? f.video_seg || 0 : 0);
  const faltaVideo = (ctx, curso, u, f) => Math.max(0, segundosVideo(ctx, curso, u) - vistoSeg(f));
  // Cada pulso suma lo transcurrido desde el anterior, con tope: si la persona se fue y vuelve, no se le cuenta el tiempo fuera.
  function pulsoVideo(f, reanudar) {
    const t = ahora();
    if (!inicioValido(f)) return { video_inicio: t.toISOString(), video_seg: 0, video_pulso: t.toISOString() };
    const previo = f.video_pulso ? new Date(f.video_pulso) : null;
    const delta = previo && !reanudar ? Math.max(0, Math.min(PULSO_MAX_SEG, Math.floor((t - previo) / 1000))) : 0;
    return { video_seg: (f.video_seg || 0) + delta, video_pulso: t.toISOString() };
  }

  // Qué falta para abrir una unidad (null = abierta)
  function requisito(perfil, ctx, curso, u) {
    if (!CURSOS[curso].roles.includes(perfil.rol)) return 'Este curso no está habilitado para tu perfil.';
    if (u > 1) {
      const nombre = `${CURSOS[curso].unidad.toLowerCase()} ${u - 1}`;
      if (!aprobada(ctx, curso, u - 1)) return `Se abre cuando apruebes la evaluación del ${nombre}.`;
      if (!actividadHecha(ctx, curso, u - 1)) return `Se abre cuando participes en el foro del ${nombre}.`;
      return null;
    }
    if (curso === 'gestion') {
      const bv = estadoBienvenida(ctx);
      if (bv.requerida && !bv.hecha) return 'Se abre cuando veas el video de bienvenida.';
      return ctx.hitos.has('compromiso') ? null : 'Se abre cuando confirmes tu compromiso como parte del equipo.';
    }
    if (!ctx.constancias.some((c) => c.curso === 'gestion')) return 'Se abre cuando apruebes el curso Gestión del CIC.';
    // Al aprobar Gestión se abren solas las dos rutas (secretarías y dinamizadoras): nadie tiene que habilitarlas.
    return null;
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
      tiene_video: video, sin_cuestionario: !conCuestionario, sin_actividad: !actividadRequerida(curso, u), foro_tema: idTemaModulo(curso, u),
      video_visto: !!f.video_en && (!f.bloqueado_en || f.video_en > f.bloqueado_en), material_visto: !!f.material_en,
      video_iniciado: !!inicioValido(f), video_segundos: segundosVideo(ctx, curso, u), video_faltan: video ? faltaVideo(ctx, curso, u, f) : 0,
      intentos: f.intentos || 0, intentos_max: INTENTOS_POR_RONDA, ronda: f.ronda || 1,
      mejor_nota: f.mejor_nota ?? null, aprobado_en: f.aprobado_en || null,
      puede_cuestionario: conCuestionario && !falta && !f.aprobado_en && !f.bloqueado_en && (f.intentos || 0) < INTENTOS_POR_RONDA && listo,
      evidencia: ev ? { tipo: ev.tipo, estado: ev.estado, comentario: ev.comentario || null, texto: ev.texto || null, creado_en: ev.creado_en || null } : null,
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
    let ctx = await contexto(p.id);
    // Si ya completó un curso pero su certificado no se emitió (por ejemplo, una regla cambió mientras avanzaba),
    // se emite ahora: sin él no se abrirían los cursos siguientes.
    let emitio = false;
    for (const c of Object.keys(CURSOS).filter((k) => CURSOS[k].roles.includes(p.rol))) {
      if (ctx.constancias.some((x) => x.curso === c)) continue;
      let completo = true;
      for (let u = 1; u <= CURSOS[c].unidades && completo; u++) completo = aprobada(ctx, c, u) && actividadHecha(ctx, c, u);
      if (completo && await emitirSiCompleto(p, c)) emitio = true;
    }
    if (emitio) ctx = await contexto(p.id);
    return resumen(p, ctx);
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

  // La persona reprodujo el video en la lección: empieza a contar. Luego, un pulso cada 15 s mientras lo tiene en pantalla.
  async function iniciarVideo(token, b) {
    const { perfil, ctx, curso, unidad } = await equipoAbierto(token, b);
    if (!tieneVideo(ctx, curso, unidad)) throw new Falla(400, 'sin_video', 'Esta unidad todavía no tiene video.');
    await guardarProgreso(perfil.id, curso, unidad, pulsoVideo(filaDe(ctx, curso, unidad) || {}, true));
    return resumen(perfil, await contexto(perfil.id));
  }
  async function pulsoVideoUnidad(token, b) {
    const { perfil, ctx, curso, unidad } = await equipoAbierto(token, b);
    if (!tieneVideo(ctx, curso, unidad)) throw new Falla(400, 'sin_video', 'Esta unidad todavía no tiene video.');
    const f = filaDe(ctx, curso, unidad) || {};
    const cambios = pulsoVideo(f, b.reanudar === true);
    await guardarProgreso(perfil.id, curso, unidad, cambios);
    const total = segundosVideo(ctx, curso, unidad);
    return { faltan: Math.max(0, total - vistoSeg({ ...f, ...cambios })), total };
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

  // Material de transferencia (antes «Formación de la Secretaría Técnica»): guías, presentaciones y videos de las
  // 6 metodologías, para la Secretaría Técnica, sin curso ni evaluaciones.
  const idsTransferencia = (n) => ((CATALOGO.material || {})[`formacion-secretaria_${n}`] || []).filter((id) => CATALOGO.archivos[id]);
  const puedeTransferencia = (p) => p.rol === 'secretaria' || esAdmin(p);
  async function materialTransferencia(token) {
    const p = await usuarioDelToken(token);
    if (!puedeTransferencia(p)) throw new Falla(403, 'permiso', 'El material de transferencia es para la Secretaría Técnica.');
    const videos = new Map((await lista(col('videos'))).map((v) => [v.codigo, v]));
    const enlaces = Object.fromEntries((await lista(col('material'))).filter((m) => m._id.startsWith('formacion-secretaria_') && m.actualizado_por).map((m) => [m._id, m.archivos || []]));
    return {
      unidades: TRANSFERENCIA.map((titulo, i) => {
        const v = videos.get(`STF-U${i + 1}`);
        return {
          n: i + 1, titulo,
          archivos: [
            ...idsTransferencia(i + 1).map((id) => ({ id, nombre: CATALOGO.archivos[id].nombre, tipo: CATALOGO.archivos[id].tipo })),
            ...(enlaces[`formacion-secretaria_${i + 1}`] || []).filter((a) => /^https:\/\//.test(a.url || '')).map((a) => ({ nombre: a.nombre, url: a.url })),
          ],
          video: v ? { codigo: v.codigo, titulo: v.titulo, youtube_id: v.youtube_id || null, drive_id: v.drive_id || null, duracion_min: v.duracion_min || null } : null,
        };
      }),
    };
  }
  async function archivoTransferencia(token, b) {
    const p = await usuarioDelToken(token);
    if (!puedeTransferencia(p)) throw new Falla(403, 'permiso', 'El material de transferencia es para la Secretaría Técnica.');
    const id = String(b.id || '');
    if (!TRANSFERENCIA.some((_, i) => idsTransferencia(i + 1).includes(id))) throw new Falla(404, 'no_existe', 'No encontramos ese archivo.');
    return paquete(id);
  }
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
    const segundos = segundosDe(v);
    const faltan = Math.max(0, segundos - vistoSeg(f));
    return { requerida: !!v, hecha: ctx.hitos.has('bienvenida'), iniciada: !!f.video_inicio, segundos, faltan };
  };
  async function bienvenida(token, b) {
    const perfil = await usuarioDelToken(token);
    if (perfil.rol === 'emprendedora') throw new Falla(403, 'permiso', 'Este paso es para el equipo del CIC.');
    const ctx = await contexto(perfil.id);
    const e = estadoBienvenida(ctx);
    if (!e.requerida) throw new Falla(400, 'sin_video', 'El video de bienvenida todavía no está publicado.');
    if (b.paso === 'iniciar' || b.paso === 'pulso') {
      const f = filaDe(ctx, 'bienvenida', 1) || {};
      const cambios = pulsoVideo(f, b.paso === 'iniciar' || b.reanudar === true);
      await guardarProgreso(perfil.id, 'bienvenida', 1, cambios);
      if (b.paso === 'pulso') return { faltan: Math.max(0, e.segundos - vistoSeg({ ...f, ...cambios })), total: e.segundos };
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

  // Sus respuestas en las evaluaciones de una unidad: cada intento, cada pregunta, lo que eligió y si acertó, para que
  // analice en qué se equivocó. La respuesta correcta y la justificación oficial aparecen cuando ya aprobó la unidad:
  // antes, verlas le daría las respuestas del siguiente intento (el banco tiene 10 preguntas por unidad).
  async function misResultados(token, b) {
    const { perfil, ctx, curso, unidad } = await equipoAbierto(token, b);
    const yaAprobada = aprobada(ctx, curso, unidad);
    const hechos = (await lista(col('cuestionarios').where('persona', '==', perfil.id)))
      .filter((c) => c.curso === curso && c.unidad === unidad && c.respondido_en && Array.isArray(c.respuestas))
      .sort((x, y) => String(x.respondido_en).localeCompare(String(y.respondido_en)));
    const banco = {};
    const pregunta = async (id) => { if (!(id in banco)) banco[id] = await datos(col('preguntas').doc(String(id))); return banco[id]; };
    const intentos = [];
    for (const [n, c] of hechos.entries()) {
      const preguntas = [];
      for (let i = 0; i < c.preguntas.length; i++) {
        const p = await pregunta(c.preguntas[i]);
        if (!p) continue;
        const orden = c.ordenes && c.ordenes[i] ? String(c.ordenes[i]).split(',').map(Number) : null;
        const elegida = orden ? orden[c.respuestas[i]] : c.respuestas[i];
        const bien = p.correcta === elegida;
        preguntas.push({
          enunciado: p.enunciado, respuesta: p.opciones[elegida] ?? null, bien,
          correcta: yaAprobada ? p.opciones[p.correcta] : null, justificacion: yaAprobada ? p.retro || null : null,
        });
      }
      intentos.push({ intento: n + 1, nota: c.nota, de: c.preguntas.length, aprobado: c.nota >= NOTA_MINIMA, fecha: c.respondido_en, preguntas });
    }
    return { aprobada: yaAprobada, nota_minima: NOTA_MINIMA, intentos: intentos.reverse() };
  }

  // Actividad del módulo: un aporte en la conversación del módulo en el foro del equipo (ya no se piden enlaces de Drive).
  // Queda publicado en el foro, con su nombre, y llega a la Secretaría Técnica para revisarlo.
  async function entregar(token, b) {
    const { perfil, ctx, curso, unidad } = await equipoAbierto(token, b);
    const falta = aporteHabilitado(perfil, ctx, curso, unidad);
    if (falta) throw new Falla(400, 'foro', falta);
    const txt = String(b.texto ?? '').trim().slice(0, 3000);
    if (txt.length < 20) throw new Falla(400, 'evidencia', 'Escribe tu aporte para el foro (al menos unas líneas).');
    const { id, ref, t } = await temaModulo(curso, unidad);
    const r = await col('foro_respuestas').add({ tema: id, texto: txt, autor_id: perfil.id, autor: autorDe(perfil), autor_rol: NOMBRE_ROL[perfil.rol] || 'Equipo', creado_en: hoy(), borrado: false });
    await ref.update({ respuestas: (t.respuestas || 0) + 1, ultima_actividad: hoy() });
    await guardarAporte(perfil, curso, unidad, txt, id, r.id);
    const constancia = await emitirSiCompleto(perfil, curso);
    return { ok: true, foro_tema: id, constancia, progreso: resumen(perfil, await contexto(perfil.id)) };
  }
  // Los aportes de las demás personas en la conversación del módulo (se muestran en la lección)
  async function foroModulo(token, b) {
    const { curso, unidad } = await equipoAbierto(token, b);
    const { id } = await temaModulo(curso, unidad);
    return foroTema(token, { id });
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
    const ev = await datos(ref);
    if (!ev) throw new Falla(404, 'no_existe', 'No encontramos esa evidencia.');
    await ref.update({ estado, comentario: comentario || null, revisado_por: quien.id, revisado_en: hoy() });
    const modulo = CURSOS[ev.curso] ? `${CURSOS[ev.curso].nombre} · ${CURSOS[ev.curso].unidad} ${ev.unidad}` : 'un módulo';
    await avisarPersona({ persona: await perfilPorId(ev.persona), tipo: 'aviso_aporte', de: quien,
      asunto: estado === 'aprobada' ? `Aprobaron tu aporte del foro (${modulo})` : `Revisa tu aporte del foro (${modulo})`,
      lineas: [estado === 'aprobada' ? `La Secretaría Técnica aprobó tu aporte en el foro de ${modulo}.` : `La Secretaría Técnica te pidió ajustar tu aporte en el foro de ${modulo}.`,
        comentario ? `\nComentario: «${comentario}»` : null,
        estado === 'devuelta' ? '\nEntra a «Mis cursos», abre ese módulo y escribe un nuevo aporte.' : null] });
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
    const pendientes = evid.filter((e) => e.estado === 'enviada' && CURSOS[e.curso])
      .map(({ _id, persona, ...e }) => ({ id: _id, ...e, nombre: nombrePorId.get(persona) || '' }))
      .sort((a, b) => a.creado_en.localeCompare(b.creado_en));
    return { personas, pendientes, unidades: Object.fromEntries(Object.entries(CURSOS).map(([k, v]) => [k, v.unidades])) };
  }

  // Reporte por correo del avance de cada secretaria y dinamizadora en sus cursos. Solo la administración lo pide y
  // solo llega a soporte (2horas.online01@gmail.com): no se le escribe a nadie más. Queda en «Correos enviados».
  async function reporteAvance(token) {
    const quien = await usuarioDelToken(token);
    if (!esAdmin(quien)) throw new Falla(403, 'permiso', 'El reporte de avance es para la administración.');
    if (!driveActivo()) throw new Falla(503, 'sin_correo', 'El envío de correos no está configurado.');
    const [dir, perf, prog, cons] = await Promise.all(['directorio', 'perfiles', 'progreso', 'constancias'].map((n) => lista(col(n))));
    const cuentaDe = new Map(perf.filter((p) => p.rol !== 'emprendedora').map((p) => [p.cedula, p]));
    const fecha = (f) => (f ? new Date(f).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'America/Bogota' }) : 'sin actividad');
    const filas = dir.filter((d) => !esCuentaPrueba(d)).map((d) => {
      const c = cuentaDe.get(d._id);
      const id = c ? c._id : null;
      const hechas = (curso) => prog.filter((p) => p.persona === id && p.curso === curso && p.aprobado_en).length;
      const certificado = (curso) => cons.some((x) => x.persona === id && x.curso === curso);
      const estado = (curso) => (certificado(curso) ? 'completo ✓' : `${hechas(curso)} de ${CURSOS[curso].unidades}`);
      const gestion = certificado('gestion');
      return {
        nombre: d.nombre, rol: tieneRol(d, 'secretaria') && tieneRol(d, 'dinamizadora') ? 'Secretaría y dinamizadora' : d.rol === 'secretaria' ? 'Secretaría Técnica' : 'Dinamizadora',
        cargo: d.cargo || '', activa: !!id,
        texto: !id ? 'Cuenta sin activar'
          : `Gestión del CIC: ${estado('gestion')} · HACER: ${gestion ? estado('acompanar-hacer') : 'se abre al aprobar Gestión'} · SER: ${gestion ? estado('facilitar-ser') : 'se abre al aprobar Gestión'} · última actividad: ${fecha(prog.filter((p) => p.persona === id).map((p) => p.actualizado_en).sort().pop())}`,
        orden: !id ? 0 : gestion ? 2 + hechas('acompanar-hacer') + hechas('facilitar-ser') : 1,
      };
    }).sort((a, b) => a.rol.localeCompare(b.rol) || a.nombre.localeCompare(b.nombre, 'es'));
    const grupo = (titulo, xs) => xs.length ? [`${titulo} (${xs.length})`, ...xs.map((x) => `• ${x.nombre}${x.cargo ? ` — ${x.cargo}` : ''}\n  ${x.texto}`), ''] : [];
    const secretarias = filas.filter((x) => x.rol !== 'Dinamizadora');
    const dinamizadoras = filas.filter((x) => x.rol === 'Dinamizadora');
    const conGestion = (xs) => xs.filter((x) => /Gestión del CIC: completo/.test(x.texto)).length;
    const texto = [
      `Avance del equipo en los cursos · ${new Date(ahora()).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Bogota' })}`, '',
      `Resumen: ${filas.filter((x) => x.activa).length} de ${filas.length} cuentas activadas · Gestión aprobada: ${conGestion(secretarias)} de ${secretarias.length} secretarias y ${conGestion(dinamizadoras)} de ${dinamizadoras.length} dinamizadoras.`, '',
      ...grupo('SECRETARÍA TÉCNICA', secretarias),
      ...grupo('DINAMIZADORAS', dinamizadoras),
      'HACER tiene 6 semanas y SER 4 talleres; las dos rutas se abren solas al aprobar Gestión del CIC.',
      `Detalle en la plataforma: ${PANEL_SOPORTE.replace(/admin\/$/, '')} → Seguimiento → Avance del equipo en los cursos.`,
    ].join('\n');
    let estado = 'enviado', error = null;
    try { await drive({ accion: 'correo', asunto: `[CIC] Avance del equipo en los cursos · ${filas.length} personas`, texto }); }
    catch (err) { estado = 'fallido'; error = String(err.message || err).slice(0, 300); }
    try { await col('envios_correo').add({ cedula: null, tipo: 'reporte_avance', estado, correo: mascaraCorreo(CORREO_SOPORTE), motivo: `Reporte de avance de ${filas.length} personas, pedido por la administración`, error, rol: null, creado_en: hoy() }); }
    catch (err) { console.error('No se pudo guardar el registro del reporte:', err.message); }
    if (estado !== 'enviado') throw new Falla(502, 'correo', 'No se pudo enviar el reporte. Intenta de nuevo en unos minutos.');
    return { ok: true, personas: filas.length, correo: mascaraCorreo(CORREO_SOPORTE) };
  }

  // Constancia: al aprobar todas las unidades y enviar todas las evidencias del curso.
  async function emitirSiCompleto(perfil, curso) {
    const ctx = await contexto(perfil.id);
    if (ctx.constancias.some((c) => c.curso === curso)) return null;
    for (let u = 1; u <= CURSOS[curso].unidades; u++) if (!aprobada(ctx, curso, u) || !actividadHecha(ctx, curso, u)) return null;
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const codigo = `CIC-${CURSOS[curso].prefijo.replace('-', '')}-${Array.from({ length: 6 }, () => alfabeto[crypto.randomInt(alfabeto.length)]).join('')}`;
    await col('constancias').doc(codigo).set({ persona: perfil.id, curso, nombre: perfil.nombre, emitida_en: hoy() });
    // Si con esta constancia ya terminó los tres cursos, le llega el correo de finalización (pase al evento)
    await enviarFinalizacion(perfil).catch((err) => console.error('Correo de finalización:', err.message));
    return { codigo, curso, nombre_curso: CURSOS[curso].nombre };
  }

  // ---------- Correo de finalización: a quien terminó y aprobó los tres cursos (una sola vez por persona) ----------
  // Todo es automático: la «fecha del evento» es el día en que la persona terminó los tres cursos y el «lugar» es su
  // satélite (municipios y departamento). Sale solo al emitirse la tercera constancia; a quienes ya habían terminado
  // antes se les envía desde admin/ → «Finalización» → «Enviar a quienes ya terminaron».
  const fechaLarga = (iso) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Bogota' });
  const lugarDe = (p) => {
    const s = SATELITES[p.satelite];
    if (s) return `Satélite ${s.municipios.join(' y ')} · ${s.departamento}`;
    return p.departamento ? `${p.departamento}` : 'Te lo confirma la Secretaría Técnica';
  };
  const datosCorreoFin = (p, termino) => ({ nombrePila: primerNombre(p.nombre), nombreCompleto: p.nombre, fechaFin: fechaLarga(termino), fechaEvento: fechaLarga(termino), lugarEvento: lugarDe(p) });
  // Fecha en que terminó los tres cursos (la de su última constancia), o null si aún le falta alguno
  async function terminoLosTres(personaId) {
    const cs = await lista(col('constancias').where('persona', '==', personaId));
    if (!Object.keys(CURSOS).every((c) => cs.some((x) => x.curso === c))) return null;
    return cs.filter((x) => CURSOS[x.curso]).map((x) => x.emitida_en).sort().pop();
  }
  async function enviarFinalizacion(perfil) {
    if (!perfil || perfil.rol === 'emprendedora' || esAdmin(perfil)) return null;
    const ref = col('finalizaciones').doc(perfil.id);
    const previa = await datos(ref);
    if (previa && previa.enviado_en) return 'ya';
    const termino = await terminoLosTres(perfil.id);
    if (!termino) return null;
    if (!driveActivo()) { await ref.set({ persona: perfil.id, nombre: perfil.nombre, termino_en: termino, pendiente: true, enviado_en: null }); return 'pendiente'; }
    const para = correoDe(perfil);
    if (!para) { await ref.set({ persona: perfil.id, nombre: perfil.nombre, termino_en: termino, pendiente: true, enviado_en: null, motivo: 'sin correo' }); await registrarAviso(perfil.cedula, 'finalizacion', 'omitido', null, 'Correo de finalización · no tiene correo registrado', perfil.rol); return 'sin_correo'; }
    const d = datosCorreoFin(perfil, termino);
    try {
      const r = await drive({ accion: 'correo', persona: true, para, asunto: '¡Lo lograste! Tu constancia de finalización · CIC', texto: textoFinalizacion(d), html: htmlFinalizacion(d) });
      const llego = r && r.para ? String(r.para).toLowerCase() === para : true;
      await registrarAviso(perfil.cedula, 'finalizacion', llego ? 'enviado' : 'omitido', llego ? para : CORREO_SOPORTE, llego ? 'Correo de finalización (pase al evento)' : 'Correo de finalización · el puente no permite escribirle: llegó solo a soporte', perfil.rol);
      if (!llego) { await ref.set({ persona: perfil.id, nombre: perfil.nombre, termino_en: termino, pendiente: true, enviado_en: null }); return 'fallido'; }
      await ref.set({ persona: perfil.id, nombre: perfil.nombre, termino_en: termino, pendiente: false, enviado_en: hoy(), correo: mascaraCorreo(para) });
      return 'enviado';
    } catch (err) {
      await registrarAviso(perfil.cedula, 'finalizacion', 'fallido', para, 'Correo de finalización', perfil.rol, String(err.message || err).slice(0, 300));
      await ref.set({ persona: perfil.id, nombre: perfil.nombre, termino_en: termino, pendiente: true, enviado_en: null });
      return 'fallido';
    }
  }
  // Administración: quiénes terminaron los tres cursos, con la fecha y el lugar que lleva su correo, y si ya les llegó
  async function adminFinalizacion(token) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Esta sección es solo para la administración.');
    const env = Object.fromEntries((await lista(col('finalizaciones'))).map((x) => [x._id, x]));
    const personas = [];
    for (const x of (await lista(col('perfiles'))).filter((y) => y.rol !== 'emprendedora' && y.rol !== 'administradora')) {
      const termino = await terminoLosTres(x._id);
      if (termino) personas.push({ id: x._id, nombre: x.nombre, rol: x.rol, termino_en: termino, lugar: lugarDe(x), correo: correoDe(x) ? mascaraCorreo(correoDe(x)) : null, enviado_en: (env[x._id] && env[x._id].enviado_en) || null });
    }
    personas.sort((a, b) => String(a.termino_en).localeCompare(String(b.termino_en)));
    return { personas, pendientes: personas.filter((x) => !x.enviado_en).length };
  }
  // Vista previa del correo tal como le llegará a una persona (con su nombre, fecha y satélite si se indica)
  async function adminVistaFinalizacion(token, b) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Esta sección es solo para la administración.');
    const x = b.id ? await perfilPorId(String(b.id)) : null;
    const termino = (x && await terminoLosTres(x.id)) || hoy();
    const ejemplo = { nombre: 'Nombre Apellido de Ejemplo', satelite: 'magdalena' };
    return { html: htmlFinalizacion(datosCorreoFin(x || ejemplo, termino)) };
  }
  // Envía el correo a quienes ya terminaron y aún no lo tienen (por tandas, por el límite diario de Gmail)
  async function adminEnviarFinalizaciones(token, b) {
    const p = await usuarioDelToken(token);
    if (!esAdmin(p)) throw new Falla(403, 'permiso', 'Esta sección es solo para la administración.');
    if (!driveActivo()) throw new Falla(400, 'correo', 'El envío de correos no está configurado.');
    const r = await adminFinalizacion(token);
    const faltan = r.personas.filter((x) => !x.enviado_en && (!b.id || x.id === b.id));
    let enviados = 0, fallidos = 0;
    for (const x of faltan.slice(0, TANDA_NOVEDADES)) {
      const res = await enviarFinalizacion(await perfilPorId(x.id));
      if (res === 'enviado') enviados++; else fallidos++;
      if (fallidos >= 3 && !enviados) break; // probablemente se agotó el límite diario
    }
    return { ok: true, enviados, fallidos, faltan: Math.max(0, faltan.length - enviados) };
  }

  // Verificación pública de una constancia: solo iniciales, por privacidad.
  async function verificar(b) {
    const codigo = texto(b.codigo, 30).toUpperCase();
    if (!/^CIC-[A-Z]{3}[A-Z]-[A-Z0-9]{6}$/.test(codigo)) throw new Falla(400, 'codigo', 'Revisa el código: tiene la forma CIC-GESM-ABC123.');
    const c = await datos(col('constancias').doc(codigo));
    if (!c) return { valida: false };
    return { valida: true, iniciales: iniciales(c.nombre), curso: (CURSOS[c.curso] || {}).nombre || NOMBRE_CURSO_RETIRADO[c.curso] || c.curso, emitida_en: c.emitida_en };
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
        case 'enviar-actividad': r = await enviarActividad(token, b); break;
        case 'revisar-actividad': r = await revisarActividad(token, b); break;
        case 'comentar-actividad': r = await comentarActividad(token, b); break;
        case 'mi-avance': r = await miAvance(token); break;
        case 'admin-novedades': r = await adminNovedades(token); break;
        case 'admin-finalizacion': r = await adminFinalizacion(token); break;
        case 'admin-enviar-finalizaciones': r = await adminEnviarFinalizaciones(token, b); break;
        case 'admin-vista-finalizacion': r = await adminVistaFinalizacion(token, b); break;
        case 'admin-crear-novedad': r = await adminCrearNovedad(token, b); break;
        case 'admin-enviar-novedad': r = await adminEnviarNovedad(token, b); break;
        case 'novedad': r = await ultimaNovedad(token); break;
        case 'habilitar-aprendizaje': r = await habilitarAprendizaje(token, b); break;
        case 'mi-aprendizaje': r = await miAprendizaje(token); break;
        case 'responder-aprendizaje': r = await responderAprendizaje(token, b); break;
        case 'material-transferencia': r = await materialTransferencia(token); break;
        case 'archivo-transferencia': r = await archivoTransferencia(token, b); break;
        case 'foro-modulo': r = await foroModulo(token, b); break;
        case 'admin-administradoras': r = await adminAdministradoras(token); break;
        case 'admin-agregar-administradora': r = await adminAgregarAdministradora(token, b); break;
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
        case 'admin-equipo': r = await adminEquipo(token); break;
        case 'admin-guardar-persona': r = await adminGuardarPersona(token, b); break;
        // Cursos del equipo
        case 'mi-progreso': r = await miProgreso(token); break;
        case 'marcar': r = await marcar(token, b); break;
        case 'iniciar-video': r = await iniciarVideo(token, b); break;
        case 'pulso-video': r = await pulsoVideoUnidad(token, b); break;
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
        case 'mis-resultados': r = await misResultados(token, b); break;
        case 'entregar': r = await entregar(token, b); break;
        case 'hito': r = await hito(token, b); break;
        case 'revisar': r = await revisar(token, b); break;
        case 'equipo': r = await equipo(token); break;
        case 'reporte-avance': r = await reporteAvance(token); break;
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
