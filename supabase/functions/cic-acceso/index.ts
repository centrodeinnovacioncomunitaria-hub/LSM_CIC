// Supabase Edge Function · cic-acceso
// Acceso: ingreso con cédula y perfil, inscripción de emprendedoras, activación y recuperación con código
// de 6 números, cambio de contraseña y límite de intentos fallidos.
// Cursos del equipo: avance por módulo, material privado, cuestionarios calificados en el servidor,
// evidencias, revisión de la Secretaría Técnica, transferencias y constancias verificables.
//
// Secretos (Supabase → Edge Functions → Secrets):
//   SMTP_USER  centrodeinnovacioncomunitaria@gmail.com
//   SMTP_PASS  contraseña de aplicación de Gmail (16 letras, no la contraseña normal)
// Opcionales: SMTP_HOST (smtp.gmail.com), SMTP_PORT (465), CIC_ORIGENES, CIC_DOMINIO_CUENTAS.
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? SERVICE_KEY;
// Supabase Auth trabaja con correos. Cada cuenta usa uno interno hecho con la cédula
// (nunca recibe mensajes); el correo real de la persona queda en su perfil.
const DOMINIO = Deno.env.get('CIC_DOMINIO_CUENTAS') ?? 'cuentas.cic.invalid';
const ORIGENES = (Deno.env.get('CIC_ORIGENES') ??
  'https://centrodeinnovacioncomunitaria-hub.github.io,http://localhost:8080,http://127.0.0.1:8080')
  .split(',').map((s) => s.trim()).filter(Boolean);

const ROLES = ['secretaria', 'dinamizadora', 'emprendedora'];
const NOMBRE_ROL: Record<string, string> = {
  secretaria: 'Secretaría Técnica',
  dinamizadora: 'Dinamizadora',
  emprendedora: 'Emprendedora',
};
// Municipios de cada satélite (los mismos de herramientas/Datos.pm y de la tabla satelites)
const SATELITES: Record<string, { departamento: string; municipios: string[] }> = {
  'la-guajira': { departamento: 'La Guajira', municipios: ['Riohacha', 'Albania'] },
  magdalena: { departamento: 'Magdalena', municipios: ['Santa Marta'] },
  valledupar: { departamento: 'Cesar', municipios: ['Valledupar'] },
  'pueblo-bello': { departamento: 'Cesar', municipios: ['Pueblo Bello'] },
  atlantico: { departamento: 'Atlántico', municipios: ['Baranoa', 'Campo de la Cruz'] },
  bolivar: { departamento: 'Bolívar', municipios: ['Cartagena', 'María la Baja'] },
  sucre: { departamento: 'Sucre', municipios: ['Sincelejo', 'Tolú'] },
  cordoba: { departamento: 'Córdoba', municipios: ['Montería', 'Tierralta'] },
};
const sateliteDe = (municipio: string) =>
  Object.entries(SATELITES).find(([, s]) => s.municipios.includes(municipio))?.[0] ?? null;
const CAMPOS_PERFIL =
  'id, cedula, nombre, rol, cargo, correo, celular, departamento, municipio, negocio, satelite, semana_actual, debe_cambiar_clave';

// Reglas de los cursos del equipo (documento técnico 6.4 y guiones del curso de Gestión)
const CURSOS: Record<string, { unidades: number; prefijo: string; nombre: string; evidencia: 'actividad' | 'verificacion' }> = {
  gestion: { unidades: 5, prefijo: 'GES-M', nombre: 'Gestión del CIC', evidencia: 'actividad' },
  'acompanar-hacer': { unidades: 6, prefijo: 'HAC-S', nombre: 'Acompañar la ruta HACER', evidencia: 'verificacion' },
  'facilitar-ser': { unidades: 4, prefijo: 'SER-T', nombre: 'Facilitar la ruta SER', evidencia: 'verificacion' },
};
const PREGUNTAS_POR_INTENTO = 5;
const NOTA_MINIMA = 4;           // 4 de 5
const INTENTOS_POR_RONDA = 2;    // si pierde los dos, repasa video y material para volver a intentar
const MINUTOS_CUESTIONARIO = 60; // un intento abierto vence en una hora
const CODIGO_MINUTOS = 30;       // código pedido por la persona
const CODIGO_HORAS_EQUIPO = 24;  // código generado por la Secretaría o la dinamizadora
const FALLOS_MAX = 5;
const BLOQUEO_MIN = 15;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

class Falla extends Error {
  constructor(public estado: number, public codigo: string, mensaje: string, public extra: Record<string, unknown> = {}) {
    super(mensaje);
  }
}

const soloDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const texto = (v: unknown, max = 120) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
const correoCuenta = (cedula: string) => `${cedula}@${DOMINIO}`;
const correoValido = (c: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);
const enmascarar = (c: string) => c.replace(/^(.)[^@]*(@.*)$/, '$1***$2');
const ahora = () => new Date();
const enMinutos = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

function validarCedula(v: unknown) {
  const c = soloDigitos(v);
  if (c.length < 5 || c.length > 12) throw new Falla(400, 'cedula', 'Escribe tu número de cédula, solo números.');
  return c;
}
function validarClaveNueva(clave: string, cedula: string) {
  if (clave.length < 8) throw new Falla(400, 'clave', 'La contraseña debe tener al menos 8 letras o números.');
  if (clave === cedula) throw new Falla(400, 'clave', 'La contraseña no puede ser tu número de cédula.');
}
function validarCurso(curso: unknown, unidad: unknown) {
  const c = String(curso ?? '');
  const u = Number(unidad);
  if (!CURSOS[c] || !Number.isInteger(u) || u < 1 || u > CURSOS[c].unidades) throw new Falla(400, 'curso', 'Ese módulo no existe.');
  return { curso: c, unidad: u };
}

// ---------- Contraseñas y sesiones ----------
async function iniciarSesion(cedula: string, clave: string) {
  const cliente = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await cliente.auth.signInWithPassword({ email: correoCuenta(cedula), password: clave });
  if (error || !data.session) return null;
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}

async function perfilPorCedula(cedula: string) {
  const { data, error } = await admin.from('perfiles').select(CAMPOS_PERFIL).eq('cedula', cedula).maybeSingle();
  if (error) throw error;
  return data;
}

async function crearCuenta(cedula: string, clave: string, perfil: Record<string, unknown>) {
  const { data, error } = await admin.auth.admin.createUser({
    email: correoCuenta(cedula),
    password: clave,
    email_confirm: true,
    app_metadata: { rol: perfil.rol },
  });
  if (error || !data.user) {
    console.error('createUser', error);
    throw new Falla(500, 'cuenta', 'No pudimos crear la cuenta. Escríbenos para revisarlo.');
  }
  const { data: fila, error: e2 } = await admin.from('perfiles')
    .insert({ id: data.user.id, cedula, ...perfil }).select(CAMPOS_PERFIL).single();
  if (e2) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw e2;
  }
  return fila;
}

// ---------- Límite de intentos fallidos ----------
async function revisarBloqueo(cedula: string) {
  const { data } = await admin.from('bloqueos_ingreso').select('*').eq('cedula', cedula).maybeSingle();
  if (data?.bloqueado_hasta && new Date(data.bloqueado_hasta) > ahora()) {
    const min = Math.ceil((new Date(data.bloqueado_hasta).getTime() - Date.now()) / 60_000);
    throw new Falla(429, 'bloqueado', `Hubo demasiados intentos con esta cédula. Por seguridad, espera ${min} minuto${min === 1 ? '' : 's'} e intenta de nuevo.`);
  }
  return data;
}
async function registrarFallo(cedula: string, previo: { fallos: number; ventana_desde: string } | null) {
  const nueva = !previo || Date.now() - new Date(previo.ventana_desde).getTime() > BLOQUEO_MIN * 60_000;
  const fallos = nueva ? 1 : previo!.fallos + 1;
  await admin.from('bloqueos_ingreso').upsert({
    cedula, fallos,
    ventana_desde: nueva ? ahora().toISOString() : previo!.ventana_desde,
    bloqueado_hasta: fallos >= FALLOS_MAX ? enMinutos(BLOQUEO_MIN) : null,
  });
}

// ---------- Códigos de activación y recuperación ----------
async function hashCodigo(cedula: string, codigo: string) {
  const datos = new TextEncoder().encode(`${cedula}:${codigo}:${SERVICE_KEY}`);
  const h = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function nuevoCodigo() {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return String(n[0] % 1_000_000).padStart(6, '0');
}
// ¿A quién le corresponde un código? Persona con cuenta (recuperación) o del directorio sin cuenta (activación).
async function destinatario(cedula: string) {
  const perfil = await perfilPorCedula(cedula);
  if (perfil) return { motivo: 'recuperacion' as const, nombre: perfil.nombre, correo: perfil.correo, rol: perfil.rol, departamento: perfil.departamento };
  const { data: d } = await admin.from('directorio').select('nombre, correo, rol, departamento').eq('cedula', cedula).maybeSingle();
  if (d) return { motivo: 'activacion' as const, nombre: d.nombre, correo: d.correo, rol: d.rol, departamento: d.departamento };
  return null;
}
async function guardarCodigo(cedula: string, motivo: string, minutos: number, creadoPor: string | null) {
  const codigo = nuevoCodigo();
  await admin.from('codigos_acceso').upsert({
    cedula, motivo, hash: await hashCodigo(cedula, codigo), expira: enMinutos(minutos), intentos: 0,
    creado_por: creadoPor, creado_en: ahora().toISOString(),
  });
  return codigo;
}

// La persona pide su código. La respuesta es siempre la misma, para no revelar qué cédulas existen.
async function solicitarCodigo(b: Record<string, unknown>) {
  const cedula = validarCedula(b.cedula);
  const generico = {
    ok: true,
    mensaje: `Si esta cédula está registrada con un correo, te llegó un código de 6 números. Vence en ${CODIGO_MINUTOS} minutos. Si no tienes correo registrado, pídele el código a la Secretaría Técnica o a tu dinamizadora.`,
  };
  const previo = await admin.from('codigos_acceso').select('creado_en').eq('cedula', cedula).maybeSingle();
  if (previo.data && Date.now() - new Date(previo.data.creado_en).getTime() < 2 * 60_000) return generico; // máximo uno cada 2 minutos
  const d = await destinatario(cedula);
  if (!d || !d.correo) return generico;
  const codigo = await guardarCodigo(cedula, d.motivo, CODIGO_MINUTOS, null);
  await enviarCorreo(d.correo, d.nombre, cedula, 'codigo', { codigo, vence: `${CODIGO_MINUTOS} minutos` });
  return generico;
}

// La Secretaría (a cualquiera) o la dinamizadora (a las emprendedoras de su departamento) generan un código
// para entregarlo por WhatsApp o en persona. Reemplaza al antiguo "restablecer a la cédula".
async function generarCodigo(req: Request, b: Record<string, unknown>) {
  const quien = await usuarioDelToken(req);
  const cedula = validarCedula(b.cedula);
  const d = await destinatario(cedula);
  if (!d) throw new Falla(404, 'no_existe', 'No encontramos esa cédula en el directorio ni en las inscripciones.');
  const permitido = quien.rol === 'secretaria' ||
    (quien.rol === 'dinamizadora' && d.rol === 'emprendedora' && d.departamento === quien.departamento);
  if (!permitido) throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica, o la dinamizadora del departamento de la emprendedora, puede generar este código.');
  if (cedula === quien.cedula) throw new Falla(400, 'propio', 'Para tu propia cuenta usa «¿Olvidaste tu contraseña?».');
  const codigo = await guardarCodigo(cedula, d.motivo, CODIGO_HORAS_EQUIPO * 60, quien.id);
  const correoEnviado = d.correo ? await enviarCorreo(d.correo, d.nombre, cedula, 'codigo', { codigo, vence: `${CODIGO_HORAS_EQUIPO} horas` }) : false;
  return { ok: true, codigo, nombre: d.nombre, motivo: d.motivo, vence_horas: CODIGO_HORAS_EQUIPO, correoEnviado, correo: d.correo ? enmascarar(d.correo) : null };
}

// Con el código, la persona crea su contraseña: activa su cuenta del equipo o recupera la suya.
async function activar(b: Record<string, unknown>) {
  const cedula = validarCedula(b.cedula);
  const codigo = soloDigitos(b.codigo);
  const clave = String(b.clave ?? '');
  validarClaveNueva(clave, cedula);
  const invalido = new Falla(400, 'codigo', 'El código no es válido o ya venció. Pide uno nuevo.');
  const { data: c } = await admin.from('codigos_acceso').select('*').eq('cedula', cedula).maybeSingle();
  if (!c || new Date(c.expira) < ahora() || c.intentos >= 5 || codigo.length !== 6) throw invalido;
  if (c.hash !== await hashCodigo(cedula, codigo)) {
    await admin.from('codigos_acceso').update({ intentos: c.intentos + 1 }).eq('cedula', cedula);
    throw invalido;
  }
  await admin.from('codigos_acceso').delete().eq('cedula', cedula);

  let perfil = await perfilPorCedula(cedula);
  if (perfil) {
    const { error } = await admin.auth.admin.updateUserById(perfil.id, { password: clave });
    if (error) throw new Falla(500, 'clave', 'No pudimos guardar la contraseña. Intenta de nuevo.');
    await admin.from('perfiles').update({ debe_cambiar_clave: false, clave_cambiada_en: ahora().toISOString() }).eq('id', perfil.id);
    perfil = { ...perfil, debe_cambiar_clave: false };
  } else {
    const { data: d } = await admin.from('directorio').select('*').eq('cedula', cedula).maybeSingle();
    if (!d) throw invalido;
    perfil = await crearCuenta(cedula, clave, {
      nombre: d.nombre, rol: d.rol, cargo: d.cargo, correo: d.correo, celular: d.celular,
      departamento: d.departamento, satelite: d.satelite ?? null, debe_cambiar_clave: false,
      clave_cambiada_en: ahora().toISOString(),
    });
  }
  await admin.from('bloqueos_ingreso').delete().eq('cedula', cedula);
  if (perfil.correo) await enviarCorreo(perfil.correo, perfil.nombre, cedula, 'cambio');
  const sesion = await iniciarSesion(cedula, clave);
  return { sesion, perfil };
}

// ---------- Ingreso e inscripción ----------
async function ingresar(b: Record<string, unknown>) {
  const cedula = validarCedula(b.cedula);
  const clave = String(b.clave ?? '');
  const rol = String(b.rol ?? '');
  if (!ROLES.includes(rol)) throw new Falla(400, 'rol', 'Elige tu perfil: Emprendedora, Dinamizadora o Secretaría Técnica.');
  if (!clave) throw new Falla(400, 'clave', 'Escribe tu contraseña.');
  const bloqueo = await revisarBloqueo(cedula);

  const perfil = await perfilPorCedula(cedula);
  const sesion = perfil ? await iniciarSesion(cedula, clave) : null;
  if (!perfil || !sesion) {
    await registrarFallo(cedula, bloqueo);
    throw new Falla(401, 'credenciales', rol === 'emprendedora'
      ? 'La cédula o la contraseña no coinciden. Si aún no tienes cuenta, toca «Inscribirme».'
      : 'La cédula o la contraseña no coinciden. Si es tu primera vez, toca «Activar mi cuenta» y usa el código que te llegó.');
  }
  await admin.from('bloqueos_ingreso').delete().eq('cedula', cedula);
  // La contraseña ya se verificó: aquí sí podemos decirle cuál es su perfil.
  if (perfil.rol !== rol) {
    throw new Falla(403, 'rol', `Tu cuenta está registrada como ${NOMBRE_ROL[perfil.rol]}. Elige ese perfil para entrar.`, { rol: perfil.rol });
  }
  return { sesion, perfil };
}

async function registrar(b: Record<string, unknown>) {
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
  const { data: delEquipo } = await admin.from('directorio').select('cedula').eq('cedula', cedula).maybeSingle();
  if (delEquipo || await perfilPorCedula(cedula)) {
    throw new Falla(409, 'existe', 'No podemos inscribir esta cédula porque ya está registrada. Si es tuya, toca «Ingresar» o «¿Olvidaste tu contraseña?».');
  }

  const perfil = await crearCuenta(cedula, clave, {
    nombre, rol: 'emprendedora', correo: correo || null, celular, departamento: SATELITES[satelite].departamento,
    municipio, satelite, negocio: negocio || null, acepto_datos_en: ahora().toISOString(),
  });
  const sesion = await iniciarSesion(cedula, clave);
  return { sesion, perfil };
}

async function usuarioDelToken(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = token ? await admin.auth.getUser(token) : { data: { user: null }, error: true };
  if (error || !data.user) throw new Falla(401, 'sesion', 'Tu sesión terminó. Vuelve a ingresar.');
  const { data: perfil, error: e2 } = await admin.from('perfiles').select(CAMPOS_PERFIL).eq('id', data.user.id).single();
  if (e2 || !perfil) throw new Falla(401, 'sesion', 'Tu sesión terminó. Vuelve a ingresar.');
  return perfil;
}

async function cambiarClave(req: Request, b: Record<string, unknown>) {
  const perfil = await usuarioDelToken(req);
  const actual = String(b.clave_actual ?? '');
  const nueva = String(b.clave_nueva ?? '');
  validarClaveNueva(nueva, perfil.cedula);
  if (nueva === actual) throw new Falla(400, 'clave', 'La nueva contraseña debe ser distinta de la actual.');
  if (!(await iniciarSesion(perfil.cedula, actual))) throw new Falla(401, 'clave_actual', 'La contraseña actual no es correcta.');

  const { error } = await admin.auth.admin.updateUserById(perfil.id, { password: nueva });
  if (error) {
    console.error('updateUserById', error);
    throw new Falla(500, 'clave', 'No pudimos cambiar la contraseña. Intenta de nuevo.');
  }
  await admin.from('perfiles').update({ debe_cambiar_clave: false, clave_cambiada_en: ahora().toISOString() }).eq('id', perfil.id);
  const correoEnviado = perfil.correo ? await enviarCorreo(perfil.correo, perfil.nombre, perfil.cedula, 'cambio') : false;
  return { ok: true, correoEnviado, correo: perfil.correo ? enmascarar(perfil.correo) : null };
}

// ================================================================ Cursos del equipo
type Fila = Record<string, any>;
async function contexto(persona: string) {
  const [prog, evid, hit, cons, vids] = await Promise.all([
    admin.from('progreso').select('*').eq('persona', persona),
    admin.from('evidencias').select('id, curso, unidad, tipo, texto, enlace, estado, comentario, creado_en, revisado_en').eq('persona', persona),
    admin.from('hitos').select('hito, fecha').eq('persona', persona),
    admin.from('constancias').select('codigo, curso, emitida_en').eq('persona', persona),
    admin.from('videos').select('codigo').eq('audiencia', 'equipo'),
  ]);
  return {
    progreso: (prog.data ?? []) as Fila[],
    evidencias: (evid.data ?? []) as Fila[],
    hitos: new Set((hit.data ?? []).map((h: Fila) => h.hito)),
    hitosLista: (hit.data ?? []) as Fila[],
    constancias: (cons.data ?? []) as Fila[],
    videos: new Set((vids.data ?? []).map((v: Fila) => v.codigo)),
  };
}
type Ctx = Awaited<ReturnType<typeof contexto>>;
const filaDe = (ctx: Ctx, curso: string, u: number) => ctx.progreso.find((p) => p.curso === curso && p.unidad === u);
const evidenciaDe = (ctx: Ctx, curso: string, u: number) => ctx.evidencias.find((e) => e.curso === curso && e.unidad === u && e.tipo === CURSOS[curso].evidencia);
const tieneVideo = (ctx: Ctx, curso: string, u: number) => ctx.videos.has(`${CURSOS[curso].prefijo}${u}`);
const aprobada = (ctx: Ctx, curso: string, u: number) => !!filaDe(ctx, curso, u)?.aprobado_en;

// Qué falta para abrir un módulo (null = abierto)
function requisito(perfil: Fila, ctx: Ctx, curso: string, u: number): string | null {
  if (perfil.rol === 'secretaria' && curso !== 'gestion') return null; // la Secretaría supervisa: ve todo
  if (u > 1) {
    if (!aprobada(ctx, curso, u - 1)) return `Se abre cuando apruebes el cuestionario de la unidad ${u - 1}.`;
    if (!evidenciaDe(ctx, curso, u - 1)) return `Se abre cuando envíes la ${CURSOS[curso].evidencia === 'actividad' ? 'actividad' : 'verificación de la sesión'} de la unidad ${u - 1}.`;
    return null;
  }
  if (curso === 'gestion') return ctx.hitos.has('compromiso') ? null : 'Se abre cuando confirmes tu compromiso como parte del equipo.';
  if (!ctx.constancias.some((c) => c.curso === 'gestion')) return 'Se abre cuando apruebes el curso Gestión del CIC.';
  const t = curso === 'acompanar-hacer' ? 'transferencia-hacer' : 'transferencia-ser';
  return ctx.hitos.has(t) ? null : 'Se abre cuando la Secretaría Técnica registre tu transferencia de la ruta.';
}

function estadoUnidad(perfil: Fila, ctx: Ctx, curso: string, u: number) {
  const f = filaDe(ctx, curso, u);
  const ev = evidenciaDe(ctx, curso, u);
  const falta = requisito(perfil, ctx, curso, u);
  const video = tieneVideo(ctx, curso, u);
  let estado = 'disponible';
  if (falta) estado = 'bloqueada';
  else if (f?.aprobado_en) estado = 'aprobada';
  else if (f?.bloqueado_en) estado = 'pausada';
  else if (f?.video_en || f?.material_en || f?.intentos) estado = 'en-curso';
  const listoParaCuestionario = !!f?.material_en && (!video || !!f?.video_en);
  return {
    unidad: u, estado, motivo: falta,
    tiene_video: video,
    video_visto: !!f?.video_en, material_visto: !!f?.material_en,
    intentos: f?.intentos ?? 0, intentos_max: INTENTOS_POR_RONDA, ronda: f?.ronda ?? 1,
    mejor_nota: f?.mejor_nota ?? null, aprobado_en: f?.aprobado_en ?? null,
    puede_cuestionario: !falta && !f?.aprobado_en && !f?.bloqueado_en && (f?.intentos ?? 0) < INTENTOS_POR_RONDA && listoParaCuestionario,
    evidencia: ev ? { estado: ev.estado, comentario: ev.comentario, texto: ev.texto, enlace: ev.enlace } : null,
  };
}

function resumen(perfil: Fila, ctx: Ctx) {
  const cursos: Record<string, unknown[]> = {};
  for (const c of Object.keys(CURSOS)) cursos[c] = Array.from({ length: CURSOS[c].unidades }, (_, i) => estadoUnidad(perfil, ctx, c, i + 1));
  return { cursos, hitos: ctx.hitosLista, constancias: ctx.constancias, reglas: { preguntas: PREGUNTAS_POR_INTENTO, nota_minima: NOTA_MINIMA, intentos: INTENTOS_POR_RONDA } };
}

async function miProgreso(req: Request) {
  const perfil = await usuarioDelToken(req);
  if (perfil.rol === 'emprendedora') throw new Falla(403, 'permiso', 'Los cursos son para el equipo del CIC.');
  return resumen(perfil, await contexto(perfil.id));
}

async function equipoAbierto(req: Request, b: Record<string, unknown>) {
  const perfil = await usuarioDelToken(req);
  if (perfil.rol === 'emprendedora') throw new Falla(403, 'permiso', 'Los cursos son para el equipo del CIC.');
  const { curso, unidad } = validarCurso(b.curso, b.unidad);
  const ctx = await contexto(perfil.id);
  const falta = requisito(perfil, ctx, curso, unidad);
  if (falta) throw new Falla(403, 'bloqueada', falta);
  return { perfil, ctx, curso, unidad };
}

async function guardarProgreso(persona: string, curso: string, unidad: number, cambios: Fila) {
  const { error } = await admin.from('progreso').upsert({ persona, curso, unidad, ...cambios, actualizado_en: ahora().toISOString() });
  if (error) throw error;
}

// Marca el video o el material como vistos. Si el módulo estaba en pausa y ya repasó ambos, se reabre.
async function marcar(req: Request, b: Record<string, unknown>) {
  const { perfil, ctx, curso, unidad } = await equipoAbierto(req, b);
  const que = String(b.que ?? '');
  if (que !== 'video' && que !== 'material') throw new Falla(400, 'que', 'Indica si viste el video o el material.');
  const f = filaDe(ctx, curso, unidad) ?? {};
  const t = ahora().toISOString();
  const cambios: Fila = que === 'video' ? { video_en: t } : { material_en: t };
  if (f.bloqueado_en) {
    const video = que === 'video' ? t : f.video_en;
    const material = que === 'material' ? t : f.material_en;
    const repasoVideo = !tieneVideo(ctx, curso, unidad) || (video && video > f.bloqueado_en);
    if (repasoVideo && material && material > f.bloqueado_en) Object.assign(cambios, { bloqueado_en: null, intentos: 0, ronda: (f.ronda ?? 1) + 1 });
  }
  await guardarProgreso(perfil.id, curso, unidad, cambios);
  return resumen(perfil, await contexto(perfil.id));
}

// Material de estudio privado: enlaces temporales (1 hora) solo si el módulo está abierto.
async function material(req: Request, b: Record<string, unknown>) {
  const { perfil, curso, unidad } = await equipoAbierto(req, b);
  const archivos: { nombre: string; url: string }[] = [];
  for (const carpeta of [`${curso}/${unidad}`, `${curso}/general`]) {
    const { data } = await admin.storage.from('material-equipo').list(carpeta, { limit: 20 });
    const nombres = (data ?? []).filter((o) => o.name && !o.name.startsWith('.')).map((o) => `${carpeta}/${o.name}`);
    if (!nombres.length) continue;
    const { data: firmados } = await admin.storage.from('material-equipo').createSignedUrls(nombres, 3600, { download: true });
    (firmados ?? []).forEach((s, i) => { if (s.signedUrl) archivos.push({ nombre: nombres[i].split('/').pop()!, url: s.signedUrl }); });
  }
  if (archivos.length) await guardarProgreso(perfil.id, curso, unidad, { material_en: ahora().toISOString() });
  return { archivos };
}

const barajar = <T,>(a: T[]) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

// Abre un intento: 5 preguntas al azar del banco, sin la respuesta correcta.
async function cuestionario(req: Request, b: Record<string, unknown>) {
  const { perfil, ctx, curso, unidad } = await equipoAbierto(req, b);
  const est = estadoUnidad(perfil, ctx, curso, unidad);
  if (!est.puede_cuestionario) {
    throw new Falla(403, 'no_disponible', est.aprobado_en ? 'Ya aprobaste este cuestionario.'
      : est.estado === 'pausada' ? 'Perdiste los dos intentos. Repasa el video y el material para volver a intentarlo.'
      : 'Primero mira el video y repasa el material de estudio.');
  }
  const { data: banco, error } = await admin.from('preguntas').select('id, enunciado, opciones').eq('curso', curso).eq('unidad', unidad);
  if (error || !banco?.length) throw new Falla(503, 'sin_banco', 'El cuestionario de este módulo todavía no está cargado. Avísale a la Secretaría Técnica.');
  const elegidas = barajar(banco).slice(0, PREGUNTAS_POR_INTENTO);
  const { data: intento, error: e2 } = await admin.from('cuestionarios')
    .insert({ persona: perfil.id, curso, unidad, preguntas: elegidas.map((p) => p.id) }).select('id').single();
  if (e2) throw e2;
  return {
    id: intento.id, intento: est.intentos + 1, de: INTENTOS_POR_RONDA, nota_minima: NOTA_MINIMA, minutos: MINUTOS_CUESTIONARIO,
    preguntas: elegidas.map((p) => ({ id: p.id, enunciado: p.enunciado, opciones: p.opciones })),
  };
}

// Califica en el servidor. Muestra cuáles fallaron y su retroalimentación, sin revelar la opción correcta.
async function responder(req: Request, b: Record<string, unknown>) {
  const perfil = await usuarioDelToken(req);
  const { data: c } = await admin.from('cuestionarios').select('*').eq('id', String(b.id ?? '')).maybeSingle();
  if (!c || c.persona !== perfil.id) throw new Falla(404, 'intento', 'No encontramos este intento. Vuelve a abrir el cuestionario.');
  if (c.respondido_en) throw new Falla(409, 'respondido', 'Este intento ya se calificó.');
  if (Date.now() - new Date(c.creado_en).getTime() > MINUTOS_CUESTIONARIO * 60_000) throw new Falla(410, 'vencido', 'El intento venció. Abre el cuestionario de nuevo.');
  const resp = Array.isArray(b.respuestas) ? (b.respuestas as unknown[]).map((x) => Number(x)) : [];
  if (resp.length !== c.preguntas.length || resp.some((x) => !Number.isInteger(x) || x < 0)) throw new Falla(400, 'respuestas', 'Responde todas las preguntas.');

  const { data: banco } = await admin.from('preguntas').select('id, correcta, retro').in('id', c.preguntas);
  const porId = new Map((banco ?? []).map((p: Fila) => [p.id, p]));
  const detalle = c.preguntas.map((id: number, i: number) => {
    const p = porId.get(id);
    const bien = !!p && p.correcta === resp[i];
    return { id, bien, retro: bien ? null : (p?.retro ?? 'Repasa este tema en el video y en el material de estudio.') };
  });
  const nota = detalle.filter((d: Fila) => d.bien).length;
  await admin.from('cuestionarios').update({ respuestas: resp, nota, respondido_en: ahora().toISOString() }).eq('id', c.id);

  const ctx = await contexto(perfil.id);
  const f = filaDe(ctx, c.curso, c.unidad) ?? {};
  const intentos = (f.intentos ?? 0) + 1;
  const aprobado = nota >= NOTA_MINIMA;
  await guardarProgreso(perfil.id, c.curso, c.unidad, {
    intentos, mejor_nota: Math.max(f.mejor_nota ?? 0, nota),
    ...(aprobado ? { aprobado_en: ahora().toISOString() } : intentos >= INTENTOS_POR_RONDA ? { bloqueado_en: ahora().toISOString() } : {}),
  });
  const constancia = aprobado ? await emitirSiCompleto(perfil, c.curso) : null;
  return { nota, de: c.preguntas.length, aprobado, pausado: !aprobado && intentos >= INTENTOS_POR_RONDA, intentos, detalle, constancia, progreso: resumen(perfil, await contexto(perfil.id)) };
}

// Actividad (Gestión) o verificación de la sesión (HACER y SER): texto y/o enlace a la evidencia.
async function entregar(req: Request, b: Record<string, unknown>) {
  const { perfil, curso, unidad } = await equipoAbierto(req, b);
  const txt = String(b.texto ?? '').trim().slice(0, 4000);
  const enlace = String(b.enlace ?? '').trim().slice(0, 500);
  if (txt.length < 20 && !enlace) throw new Falla(400, 'evidencia', 'Escribe tu respuesta (al menos unas líneas) o pega el enlace a tu evidencia.');
  if (enlace && !/^https:\/\/\S+$/.test(enlace)) throw new Falla(400, 'enlace', 'El enlace debe empezar por https:// (por ejemplo, un archivo de Google Drive).');
  const { error } = await admin.from('evidencias').upsert({
    persona: perfil.id, curso, unidad, tipo: CURSOS[curso].evidencia, texto: txt || null, enlace: enlace || null,
    estado: 'enviada', comentario: null, revisado_por: null, revisado_en: null, creado_en: ahora().toISOString(),
  }, { onConflict: 'persona,curso,unidad,tipo' });
  if (error) throw error;
  const constancia = await emitirSiCompleto(perfil, curso);
  return { ok: true, constancia, progreso: resumen(perfil, await contexto(perfil.id)) };
}

// El compromiso lo confirma cada persona; las transferencias, solo la Secretaría Técnica.
async function hito(req: Request, b: Record<string, unknown>) {
  const quien = await usuarioDelToken(req);
  const h = String(b.hito ?? '');
  if (h === 'compromiso') {
    if (quien.rol === 'emprendedora') throw new Falla(403, 'permiso', 'Este paso es para el equipo del CIC.');
    await admin.from('hitos').upsert({ persona: quien.id, hito: h, marcado_por: quien.id });
    return resumen(quien, await contexto(quien.id));
  }
  if (h !== 'transferencia-hacer' && h !== 'transferencia-ser') throw new Falla(400, 'hito', 'Hito desconocido.');
  if (quien.rol !== 'secretaria') throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica registra las transferencias.');
  const persona = await perfilPorCedula(validarCedula(b.cedula));
  if (!persona || persona.rol === 'emprendedora') throw new Falla(404, 'no_existe', 'Esa persona del equipo aún no ha activado su cuenta.');
  if (b.quitar === true) await admin.from('hitos').delete().eq('persona', persona.id).eq('hito', h);
  else await admin.from('hitos').upsert({ persona: persona.id, hito: h, marcado_por: quien.id });
  return { ok: true };
}

// La Secretaría Técnica aprueba o devuelve (con comentario) una evidencia.
async function revisar(req: Request, b: Record<string, unknown>) {
  const quien = await usuarioDelToken(req);
  if (quien.rol !== 'secretaria') throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica revisa evidencias.');
  const estado = String(b.estado ?? '');
  if (estado !== 'aprobada' && estado !== 'devuelta') throw new Falla(400, 'estado', 'Elige aprobar o devolver.');
  const comentario = texto(b.comentario, 1000);
  if (estado === 'devuelta' && comentario.length < 5) throw new Falla(400, 'comentario', 'Cuando devuelves una evidencia, escribe qué debe ajustar.');
  const { error } = await admin.from('evidencias').update({ estado, comentario: comentario || null, revisado_por: quien.id, revisado_en: ahora().toISOString() }).eq('id', Number(b.id));
  if (error) throw error;
  return { ok: true };
}

// Panel de la Secretaría: avance de todo el equipo y evidencias por revisar.
async function equipo(req: Request) {
  const quien = await usuarioDelToken(req);
  if (quien.rol !== 'secretaria') throw new Falla(403, 'permiso', 'Solo la Secretaría Técnica ve el avance del equipo.');
  const [dir, perf, prog, evid, hit, cons] = await Promise.all([
    admin.from('directorio').select('cedula, nombre, rol, cargo, departamento, satelite, celular'),
    admin.from('perfiles').select('id, cedula, nombre, rol').neq('rol', 'emprendedora'),
    admin.from('progreso').select('persona, curso, unidad, aprobado_en, bloqueado_en, intentos, mejor_nota, actualizado_en'),
    admin.from('evidencias').select('id, persona, curso, unidad, tipo, texto, enlace, estado, comentario, creado_en'),
    admin.from('hitos').select('persona, hito, fecha'),
    admin.from('constancias').select('persona, curso, codigo, emitida_en'),
  ]);
  const cuentas = new Map((perf.data ?? []).map((p: Fila) => [p.cedula, p]));
  const personas = (dir.data ?? []).map((d: Fila) => {
    const cuenta = cuentas.get(d.cedula);
    const id = cuenta?.id;
    const avance: Record<string, number> = {};
    for (const c of Object.keys(CURSOS)) avance[c] = (prog.data ?? []).filter((p: Fila) => p.persona === id && p.curso === c && p.aprobado_en).length;
    const ultima = (prog.data ?? []).filter((p: Fila) => p.persona === id).map((p: Fila) => p.actualizado_en).sort().pop() ?? null;
    return {
      cedula: d.cedula, nombre: d.nombre, rol: d.rol, cargo: d.cargo, departamento: d.departamento, satelite: d.satelite, celular: d.celular,
      activa: !!cuenta, avance, ultima_actividad: ultima,
      pausas: (prog.data ?? []).filter((p: Fila) => p.persona === id && p.bloqueado_en).length,
      hitos: (hit.data ?? []).filter((h: Fila) => h.persona === id).map((h: Fila) => h.hito),
      constancias: (cons.data ?? []).filter((x: Fila) => x.persona === id).map((x: Fila) => ({ curso: x.curso, codigo: x.codigo })),
    };
  });
  const nombrePorId = new Map((perf.data ?? []).map((p: Fila) => [p.id, p.nombre]));
  const pendientes = (evid.data ?? []).filter((e: Fila) => e.estado === 'enviada')
    .map((e: Fila) => ({ ...e, nombre: nombrePorId.get(e.persona) ?? '', persona: undefined }))
    .sort((a: Fila, b: Fila) => a.creado_en.localeCompare(b.creado_en));
  return { personas, pendientes, unidades: Object.fromEntries(Object.entries(CURSOS).map(([k, v]) => [k, v.unidades])) };
}

// Constancia: al aprobar todas las unidades y enviar todas las evidencias del curso.
async function emitirSiCompleto(perfil: Fila, curso: string) {
  const ctx = await contexto(perfil.id);
  const existente = ctx.constancias.find((c) => c.curso === curso);
  if (existente) return null;
  for (let u = 1; u <= CURSOS[curso].unidades; u++) if (!aprobada(ctx, curso, u) || !evidenciaDe(ctx, curso, u)) return null;
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = new Uint8Array(6); crypto.getRandomValues(r);
  const codigo = `CIC-${CURSOS[curso].prefijo.replace('-', '')}-${[...r].map((x) => alfabeto[x % alfabeto.length]).join('')}`;
  const { error } = await admin.from('constancias').insert({ codigo, persona: perfil.id, curso, nombre: perfil.nombre });
  if (error) { console.error('constancia', error); return null; }
  return { codigo, curso, nombre_curso: CURSOS[curso].nombre };
}

// Verificación pública de una constancia: solo iniciales, por privacidad.
async function verificar(b: Record<string, unknown>) {
  const codigo = texto(b.codigo, 30).toUpperCase();
  if (!/^CIC-[A-Z]{3}[A-Z]-[A-Z0-9]{6}$/.test(codigo)) throw new Falla(400, 'codigo', 'Revisa el código: tiene la forma CIC-GESM-ABC123.');
  const { data } = await admin.from('constancias').select('nombre, curso, emitida_en').eq('codigo', codigo).maybeSingle();
  if (!data) return { valida: false };
  const iniciales = data.nombre.split(/\s+/).filter(Boolean).slice(0, 3).map((p: string) => p[0].toUpperCase() + '.').join(' ');
  return { valida: true, iniciales, curso: CURSOS[data.curso]?.nombre ?? data.curso, emitida_en: data.emitida_en };
}

// ---------- Correos ----------
async function enviarCorreo(correo: string, nombreCompleto: string, cedula: string, motivo: 'cambio' | 'codigo', extra: Record<string, string> = {}) {
  const usuario = Deno.env.get('SMTP_USER');
  const clave = Deno.env.get('SMTP_PASS');
  if (!correo || !usuario || !clave) return false;

  const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long', timeStyle: 'short' });
  const nombre = nombreCompleto.split(' ')[0];
  const cola = cedula.slice(-4);
  const asunto = motivo === 'cambio' ? 'Tu contraseña del CIC fue cambiada' : `Tu código del CIC: ${extra.codigo}`;
  const detalle = motivo === 'cambio'
    ? `La contraseña de tu cuenta del Centro de Innovación Comunitaria (cédula terminada en ${cola}) se creó o se cambió el ${fecha}.`
    : `Tu código para activar o recuperar tu cuenta del Centro de Innovación Comunitaria (cédula terminada en ${cola}) es ${extra.codigo}. Vence en ${extra.vence}. En la página, toca «Activar mi cuenta» o «¿Olvidaste tu contraseña?», escribe tu cédula, este código y tu nueva contraseña.`;
  const cierre = motivo === 'cambio'
    ? 'Si fuiste tú, no tienes que hacer nada. Si no reconoces este cambio, responde este correo o avísale a la Secretaría Técnica para proteger tu cuenta.'
    : 'Nadie del CIC te pedirá este código por teléfono. Si no lo pediste, ignora este correo.';

  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#FFF6EE;font-family:'Nunito Sans',Arial,sans-serif;color:#2E4A3E">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6EE;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;overflow:hidden">
<tr><td style="background:#2E4A3E;padding:22px 28px;color:#ffffff;font-family:Quicksand,Arial,sans-serif;font-size:22px;font-weight:700">cic <span style="font-size:13px;font-weight:600;opacity:.85">Centro de Innovación Comunitaria</span></td></tr>
<tr><td style="padding:28px">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#B04A36;font-weight:700">${motivo === 'cambio' ? 'Aviso de seguridad' : 'Código de acceso'}</p>
<h1 style="margin:0 0 16px;font-family:Quicksand,Arial,sans-serif;font-size:22px">Hola, ${escapar(nombre)}</h1>
${motivo === 'codigo' ? `<p style="margin:0 0 18px;font-family:Quicksand,Arial,sans-serif;font-size:34px;font-weight:700;letter-spacing:.3em;color:#2E4A3E">${escapar(extra.codigo)}</p>` : ''}
<p style="margin:0 0 14px;font-size:15px;line-height:1.6">${escapar(detalle)}</p>
<p style="margin:0 0 22px;font-size:15px;line-height:1.6">${escapar(cierre)}</p>
<p style="margin:0;font-size:13px;color:#4F6B5E">Este correo se envía automáticamente desde la plataforma del CIC.</p>
</td></tr></table>
<p style="font-size:12px;color:#4F6B5E;margin:18px 0 0">Centro de Innovación Comunitaria · Red de Mujeres del Caribe</p>
</td></tr></table></body></html>`;

  try {
    const puerto = Number(Deno.env.get('SMTP_PORT') ?? 465);
    const transporte = nodemailer.createTransport({
      host: Deno.env.get('SMTP_HOST') ?? 'smtp.gmail.com',
      port: puerto,
      secure: puerto === 465,
      auth: { user: usuario, pass: clave },
    });
    await transporte.sendMail({
      from: `"Centro de Innovación Comunitaria" <${usuario}>`,
      to: correo,
      subject: asunto,
      text: `Hola, ${nombre}.\n\n${detalle}\n\n${cierre}\n\nCentro de Innovación Comunitaria`,
      html,
    });
    return true;
  } catch (e) {
    console.error('correo', e);
    return false;
  }
}

function escapar(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// ---------- Servidor ----------
function cabeceras(origen: string | null) {
  const permitido = origen && (ORIGENES.includes('*') || ORIGENES.includes(origen)) ? origen : ORIGENES[0];
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
}

Deno.serve(async (req) => {
  const h = cabeceras(req.headers.get('Origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return new Response(JSON.stringify({ mensaje: 'Método no permitido' }), { status: 405, headers: h });

  try {
    const b = await req.json().catch(() => ({}));
    let r;
    switch (b.accion) {
      // Acceso
      case 'ingresar': r = await ingresar(b); break;
      case 'registro': r = await registrar(b); break;
      case 'solicitar-codigo': r = await solicitarCodigo(b); break;
      case 'activar': r = await activar(b); break;
      case 'generar-codigo': case 'restablecer': r = await generarCodigo(req, b); break;
      case 'cambiar-clave': r = await cambiarClave(req, b); break;
      // Cursos del equipo
      case 'mi-progreso': r = await miProgreso(req); break;
      case 'marcar': r = await marcar(req, b); break;
      case 'material': r = await material(req, b); break;
      case 'cuestionario': r = await cuestionario(req, b); break;
      case 'responder': r = await responder(req, b); break;
      case 'entregar': r = await entregar(req, b); break;
      case 'hito': r = await hito(req, b); break;
      case 'revisar': r = await revisar(req, b); break;
      case 'equipo': r = await equipo(req); break;
      case 'verificar': r = await verificar(b); break;
      default: throw new Falla(400, 'accion', 'Acción desconocida.');
    }
    return new Response(JSON.stringify(r), { headers: h });
  } catch (e) {
    if (e instanceof Falla) {
      return new Response(JSON.stringify({ codigo: e.codigo, mensaje: e.message, ...e.extra }), { status: e.estado, headers: h });
    }
    console.error(e);
    return new Response(JSON.stringify({ codigo: 'error', mensaje: 'Algo salió mal. Intenta de nuevo en un momento.' }), { status: 500, headers: h });
  }
});
