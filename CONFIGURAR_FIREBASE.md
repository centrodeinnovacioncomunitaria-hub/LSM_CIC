# Activar el ingreso y los cursos del CIC con Firebase

Mientras `config.js` esté vacío, la página funciona en **modo demostración**: se puede entrar con cualquier cédula para ver cómo se ve, pero no se guarda nada. Para que el equipo y las emprendedoras entren de verdad, siga estos pasos una sola vez (alrededor de 45 minutos).

## Cómo funciona el acceso

| Perfil | Cómo entra la primera vez |
|---|---|
| **Secretaría Técnica** (5 personas del directorio) | Toca «Ingresar» → «Activar mi cuenta», escribe su cédula y toca «Enviarme el enlace a mi correo». Le llega un correo de Firebase con un enlace: lo abre, crea su contraseña y vuelve a la página a ingresar con cédula y contraseña. |
| **Dinamizadora** (24 personas del directorio) | Igual. Si no tiene correo registrado, la Secretaría Técnica le genera un **código de 6 números** desde *Seguimiento* y se lo envía por WhatsApp. Con ese código crea su contraseña. |
| **Emprendedora** | Se inscribe en «Inscribirme» (nombre, cédula, celular, municipio y contraseña; correo opcional). Después entra con cédula y contraseña. |

- **¿Olvidó la contraseña?** «¿Olvidaste tu contraseña?» → escribe su cédula → le llega el enlace al correo. Si no tiene correo, la Secretaría (a cualquiera) o su dinamizadora (a las emprendedoras de su departamento) le generan un código desde *Seguimiento* → «Código de acceso».
- **Cambiar la contraseña:** cada persona lo hace en *Mi cuenta* (pide la contraseña actual).
- **Agregar correo después:** si una persona registra su correo en *Mi cuenta*, desde ese momento puede recuperar la contraseña con el enlace.
- **Límite de intentos:** 5 contraseñas equivocadas en 15 minutos bloquean esa cédula durante 15 minutos.
- **Sin pistas para extraños:** la inscripción y la solicitud del enlace responden lo mismo exista o no la cédula.
- **La cédula nunca es la contraseña.**

### Quién ve qué

| Perfil | Ve en la plataforma |
|---|---|
| **Emprendedora** | Solo **talleres**: su próximo taller SER, las guías, las grabaciones de su satélite, su satélite y su dinamizadora. No ve cursos. |
| **Dinamizadora** | Cursos **Gestión del CIC → Acompañar la ruta HACER → Facilitar la ruta SER**, y en *Seguimiento* las emprendedoras de su departamento. |
| **Secretaría Técnica** | Cursos **Gestión del CIC → Formación de la Secretaría Técnica → HACER y SER**, y en *Seguimiento* el avance de todo el equipo, las evidencias, las transferencias y los videos. |

### Reglas de los cursos (las aplica el servidor, nadie se las puede saltar, tampoco la Secretaría)

1. Activar la cuenta con contraseña propia.
2. Confirmar el **compromiso** en *Mis cursos*.
3. **Gestión del CIC**, 5 módulos en orden: video → material → cuestionario de **5 preguntas**, se aprueba con **4 de 5**, **2 intentos**; si pierde los dos, el módulo queda en pausa hasta volver a ver el video y el material. El siguiente módulo se abre al aprobar y enviar la actividad.
4. **Constancia** con código verificable (cualquiera la puede verificar; solo se muestran las iniciales).
5. Secretaría → **Formación de la Secretaría Técnica** (6 unidades, sin cuestionario: se aprueba con el material y la actividad) → HACER y SER. Dinamizadora → la Secretaría registra su **transferencia** → HACER (6 semanas) y SER (4 talleres), con 5 preguntas al azar de un banco de 10 y la verificación de la sesión como evidencia.

## Qué hay dónde

| Dónde | Qué | ¿Público? |
|---|---|---|
| Este repositorio (GitHub) | La página, la Cloud Function (`functions/`), las reglas de Firestore y esta guía | Sí, sin datos personales |
| Firebase → Authentication | Las cuentas (correo y contraseña cifrada) | Privado |
| Firebase → Firestore | Directorio, perfiles, avance, cuestionarios, evidencias, constancias, videos y material | Privado: la página no puede leerlo; todo pasa por la función |
| `privado_NO_SUBIR` (solo en el computador) | `directorio.json`, `banco_preguntas.json` (con respuestas), `material.json` y la llave de Firebase | **Nunca subir a GitHub** |

---

## 1. Crear el proyecto en Firebase

1. Entrar a https://console.firebase.google.com con la cuenta **centrodeinnovacioncomunitaria@gmail.com** → **Crear un proyecto** → nombre: `cic-caribe` (o el que prefieran). Google Analytics: no es necesario.
2. **Plan Blaze:** en la parte inferior izquierda, «Actualizar» → plan **Blaze (pago por uso)**. Pide una tarjeta, pero el uso del CIC (unas 250 personas) cabe en la **cuota gratuita** de Cloud Functions y Firestore, así que el costo esperado es **$0**. Es obligatorio para publicar la función.
   - Recomendado: en Google Cloud → Facturación → **Presupuestos y alertas**, crear un presupuesto de US$ 5 con aviso al correo.
3. **Firestore:** menú *Compilación → Firestore Database* → **Crear base de datos** → modo **producción** → ubicación **nam5 (us-central)**.
4. **Authentication:** *Compilación → Authentication* → **Comenzar** → *Método de acceso* → habilitar **Correo electrónico/contraseña** (solo la primera opción; *no* el «vínculo por correo»).
   - *Configuración → Dominios autorizados* → **Agregar dominio** → `centrodeinnovacioncomunitaria-hub.github.io`.
   - *Plantillas* → **Restablecimiento de contraseña** → idioma **Español**. Puede cambiar el nombre del remitente a «Centro de Innovación Comunitaria».
   - *Configuración → Acciones del usuario*: dejar **desactivado** «Permitir la creación de cuentas» si aparece (las cuentas solo las crea la función). Si su consola no muestra esta opción, no pasa nada.

## 2. Conectar la página

1. En Firebase → ⚙️ **Configuración del proyecto** → *General* → *Tus apps* → ícono **</>** (Web) → nombre `pagina` → **Registrar app** (sin Hosting).
2. Copiar los valores `apiKey`, `authDomain`, `projectId` y `appId` en `config.js`:

   ```js
   window.CIC_CONFIG = {
     firebase: { apiKey: 'AIza…', authDomain: 'cic-caribe.firebaseapp.com', projectId: 'cic-caribe', appId: '1:…' },
     funcionUrl: '',
     whatsappCIC: ''
   };
   ```

   Estos datos son públicos por diseño. **Nunca** ponga en `config.js` la llave de la cuenta de servicio.
3. En `.firebaserc`, reemplazar `PON-AQUI-EL-ID-DE-TU-PROYECTO` por el `projectId`.
4. Copiar `functions/.env.ejemplo` como `functions/.env` y pegar la misma `apiKey` en `CIC_API_KEY=`. (`functions/.env` no se sube a GitHub.)

## 3. Publicar la función y las reglas

En el computador (necesita Node.js 20 o más nuevo, https://nodejs.org):

```bash
npm install -g firebase-tools
```

```bash
firebase login
```

Desde la carpeta `LSM_CIC`:

```bash
cd functions && npm install && node prueba.js && cd ..
```

(`node prueba.js` revisa todas las reglas de acceso y de los cursos; debe terminar en «Todo bien».)

```bash
firebase deploy --only functions,firestore
```

Al terminar muestra la dirección de la función, del estilo `https://us-central1-cic-caribe.cloudfunctions.net/cicAcceso`. Si es distinta a esa forma, péguela en `funcionUrl` de `config.js`.

## 4. Cargar los datos privados

1. **Llave de servicio:** Firebase → ⚙️ Configuración del proyecto → **Cuentas de servicio** → **Generar nueva clave privada**. Guarde el archivo en `privado_NO_SUBIR` con el nombre `llave-firebase.json`. Es como la llave maestra de la base de datos: no la envíe por correo ni la suba a ningún lado.
2. **Directorio del equipo** (desde `LSM_CIC`):

   ```bash
   node herramientas/firebase/directorio_desde_excel.js "../DIRECTORIO EQUIPO RMC Proyecto CIC sep.xlsx" ../privado_NO_SUBIR/directorio.json
   ```

   Lea los avisos que muestra. Antes de cargar, abra `privado_NO_SUBIR/directorio.json` y, en las dinamizadoras de **Cesar**, deje `"satelite": "valledupar"` o `"pueblo-bello"` según corresponda (por defecto quedan en Valledupar).
3. **Cargar directorio, preguntas y material** (desde `LSM_CIC/functions`):

   ```bash
   node cargar.js --llave ../../privado_NO_SUBIR/llave-firebase.json --directorio ../../privado_NO_SUBIR/directorio.json --preguntas ../../privado_NO_SUBIR/banco_preguntas.json --material ../../privado_NO_SUBIR/material.json
   ```

   - `banco_preguntas.json`: las 125 preguntas oficiales (Gestión 5×5, HACER 6×10, SER 4×10) con su respuesta. Si cambian las evaluaciones: `node herramientas/extraer_preguntas.js ../material_cursos/_texto ../privado_NO_SUBIR/banco_preguntas.json`.
   - `material.json`: los enlaces de Google Drive del material de cada unidad (ver el paso 5). Puede cargarlo después; mientras tanto, cada persona marca «Ya repasé el material».
   - Para sumar o corregir personas del equipo: edite el Excel, vuelva a generar `directorio.json` y cárguelo de nuevo. No borra cuentas ni avances.

## 5. Material de estudio

Firebase Storage exige configuración adicional, así que el material se entrega con **enlaces de Google Drive**: la plataforma muestra cada enlace solo a quien tiene la unidad abierta.

1. En Drive, en cada archivo: **Compartir → Acceso general → «Cualquier persona con el enlace» → Lector**. (Quien reciba el enlace podría reenviarlo; no ponga ahí datos personales ni las claves de respuesta.)
2. Pegue los enlaces en `privado_NO_SUBIR/material.json`: ya trae las 17 unidades con el nombre de cada archivo; solo falta llenar `"url"`.
3. Cárguelo: `node cargar.js --llave ../../privado_NO_SUBIR/llave-firebase.json --material ../../privado_NO_SUBIR/material.json`.

| Unidad (clave en material.json) | Qué va (del Drive «Productos Contrato») |
|---|---|
| `gestion_general` | Guía de estudio del curso de Gestión |
| `formacion-secretaria_1` … `_6` | Guías de estudio y presentaciones de la transferencia (Insight, Oportunidad emergente, Canvas, MVP, Gestión financiera, Guía del facilitador) |
| `acompanar-hacer_1` … `_6` | De cada semana: material de estudio de las dinamizadoras, herramientas y guía de la emprendedora |
| `facilitar-ser_1` … `_4` | De cada taller: guía de facilitación, herramientas y diapositivas |

## 6. Videos

La Secretaría los publica desde la plataforma (*Videos*): pega el enlace de YouTube («No listado») o de Google Drive («Cualquier persona con el enlace»). Ver `GUIA_VIDEOS.md`.

## 7. Invitar al equipo

Cuando todo esté cargado, puede enviar a las 29 personas el correo para crear su contraseña sin que lo pidan (desde `LSM_CIC/functions`):

```bash
node cargar.js --llave ../../privado_NO_SUBIR/llave-firebase.json --invitar
```

Para una sola persona: `--invitar 12345678`. Quien no tenga correo aparece en la lista: genérele un código desde *Seguimiento*.

## 8. Probar

1. Suba los cambios de `config.js` y `.firebaserc` a GitHub (la página se actualiza en 1–2 minutos).
2. Con una cédula de la Secretaría: «Ingresar» → «Soy secretaria» → «Activar mi cuenta» → enlace al correo → crear contraseña → ingresar.
3. Revisar *Mis cursos* (debe pedir el compromiso), *Seguimiento* y *Mi cuenta* → cambiar contraseña.
4. Inscribir una emprendedora de prueba y comprobar que solo ve sus talleres. Luego bórrela en Firebase → Authentication y Firestore → `perfiles`.

## Revisión de los datos del equipo

`directorio_desde_excel.js` avisa en pantalla de lo que debe revisarse a mano: correos que parecen mal escritos, cédulas o correos tomados de la hoja del departamento, personas cuyo cargo nombra otro departamento y las dinamizadoras de Cesar (Valledupar o Pueblo Bello). Los detalles del Excel de septiembre están en `privado_NO_SUBIR/notas_directorio.md` (este repositorio es público: aquí no van nombres ni correos).
