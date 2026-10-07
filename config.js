// Conexión de la página con Firebase (ver CONFIGURAR_FIREBASE.md).
// Mientras estos campos estén vacíos, el ingreso funciona en modo demostración, sin datos reales.
// Estos datos son públicos por diseño: la seguridad la ponen la Cloud Function y las reglas de Firestore.
// NUNCA pongas aquí la llave de la cuenta de servicio (el archivo .json de «Generar nueva clave privada»).
window.CIC_CONFIG = {
  firebase: {
    apiKey: '',            // Configuración del proyecto → General → Tus apps → apiKey
    authDomain: '',        // ej.: 'cic-caribe.firebaseapp.com'
    projectId: '',         // ej.: 'cic-caribe'
    appId: ''
  },
  // Dirección de la Cloud Function. Vacía = https://us-central1-<projectId>.cloudfunctions.net/cicAcceso
  funcionUrl: '',
  whatsappCIC: ''          // WhatsApp de atención del CIC (solo números, ej.: '3001234567'); vacío = no se muestra el botón
};
