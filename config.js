// Conexión de la página con Firebase (ver CONFIGURAR_FIREBASE.md).
// Mientras estos campos estén vacíos, el ingreso funciona en modo demostración, sin datos reales.
// Estos datos son públicos por diseño: la seguridad la ponen la Cloud Function y las reglas de Firestore.
// NUNCA pongas aquí la llave de la cuenta de servicio (el archivo .json de «Generar nueva clave privada»).
window.CIC_CONFIG = {
  firebase: {
    apiKey: 'AIzaSyCdU_Ytlt9bQbCBaFEmBLvBBd8Mzby3GHk',            // Configuración del proyecto → General → Tus apps → apiKey
    authDomain: 'cic-caribe.firebaseapp.com',        // ej.: 'cic-caribe.firebaseapp.com'
    projectId: 'cic-caribe',         // ej.: 'cic-caribe'
    appId: '1:945531375490:web:d9dafd51202867bf64099b'
  },
  // Dirección de la Cloud Function. Vacía = https://us-central1-<projectId>.cloudfunctions.net/cicAcceso
  funcionUrl: '',
  whatsappCIC: ''          // WhatsApp de atención del CIC (solo números, ej.: '3001234567'); vacío = no se muestra el botón
};
