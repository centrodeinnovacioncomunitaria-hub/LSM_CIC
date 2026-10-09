// Firebase Authentication para la lógica: crear cuentas, cambiar contraseñas y enviar el enlace al correo.
// La usan la Cloud Function (index.js) y el programa de carga (herramientas/firebase/cargar.js).
'use strict';

// claveWeb() y sitio() devuelven la clave web del proyecto y la dirección pública de la página.
function crearCuentas(auth, claveWeb, sitio) {
  // API REST de Authentication: comprobar una contraseña y enviar el enlace para crearla o cambiarla.
  async function identidad(metodo, cuerpo) {
    // Con el emulador de Authentication (pruebas locales) las llamadas van a él
    const base = process.env.FIREBASE_AUTH_EMULATOR_HOST ? `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com` : 'https://identitytoolkit.googleapis.com';
    const r = await fetch(`${base}/v1/accounts:${metodo}?key=${claveWeb()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Firebase-Locale': 'es' },
      body: JSON.stringify(cuerpo),
    });
    // Si Firebase rechaza la solicitud, queda en los registros (Firebase → Functions → Registros)
    if (!r.ok) console.error(`Authentication ${metodo} falló (${r.status}):`, (await r.text().catch(() => '')).slice(0, 300));
    return r.ok;
  }
  return {
    crear: async ({ email, clave, nombre }) => (await auth.createUser({ email, password: clave, displayName: nombre })).uid,
    borrar: (uid) => auth.deleteUser(uid),
    cambiarClave: (uid, clave) => auth.updateUser(uid, { password: clave }),
    cambiarCorreo: (uid, email) => auth.updateUser(uid, { email }),
    verificarToken: async (token) => (await auth.verifyIdToken(token)).uid,
    verificarClave: (email, clave) => identidad('signInWithPassword', { email, password: clave, returnSecureToken: false }),
    enviarEnlace: (email) => identidad('sendOobCode', { requestType: 'PASSWORD_RESET', email, continueUrl: `${sitio()}#ingresar` }),
  };
}

module.exports = { crearCuentas };
