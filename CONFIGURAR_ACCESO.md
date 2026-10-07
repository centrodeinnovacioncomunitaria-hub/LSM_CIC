# Activar el ingreso y los cursos del CIC

La página funciona en **modo demostración** mientras `config.js` esté vacío: se puede entrar con cualquier cédula para ver cómo se ve (en la activación, el código de prueba es `123456`), pero no se guarda nada ni se envían correos. Para que el equipo y las emprendedoras entren de verdad, siga estos pasos una sola vez (unos 30 minutos).

## Cómo funciona el acceso

| Perfil | Cómo entra la primera vez |
|---|---|
| **Secretaría Técnica** (5 personas del directorio) | Toca «Ingresar» → «Activar mi cuenta», escribe su cédula y pide el código: le llega al correo del directorio. Con el código crea su propia contraseña. |
| **Dinamizadora** (24 personas del directorio) | Igual. Si no tiene correo registrado, la Secretaría Técnica le genera el código desde *Seguimiento* y se lo envía por WhatsApp. |
| **Emprendedora** | Se inscribe en «Inscribirme» (nombre, cédula, celular, municipio y contraseña; correo opcional). Después entra con cédula y contraseña. |

- **La cédula ya no es contraseña.** Es un dato que mucha gente conoce, así que no protege la cuenta.
- **Códigos de 6 números:** se guardan cifrados, vencen (30 minutos si los pide la persona, 24 horas si los genera el equipo) y se anulan tras 5 intentos fallidos.
- **¿Olvidó la contraseña?** La persona pide un código al correo desde «¿Olvidaste tu contraseña?». Si no tiene correo, la Secretaría (a cualquiera) o su dinamizadora (a las emprendedoras de su departamento) le generan uno desde *Seguimiento* → «Código de acceso», con botón para enviarlo por WhatsApp.
- **Límite de intentos:** 5 contraseñas equivocadas en 15 minutos bloquean esa cédula durante 15 minutos.
- **Sin pistas para extraños:** la inscripción y la solicitud de código responden lo mismo exista o no la cédula, para que nadie pueda averiguar quién está registrado.
- Al crear o cambiar la contraseña llega un correo de confirmación desde centrodeinnovacioncomunitaria@gmail.com.
- La Secretaría ve a todas las personas; cada dinamizadora, las emprendedoras de su departamento; cada emprendedora, solo sus datos.

Los datos personales y las respuestas de los cuestionarios **no** están en este repositorio (es público). Viven en Supabase.

## Quién ve qué

| Perfil | Ve en la plataforma |
|---|---|
| **Emprendedora** | Solo **talleres**: «Mis talleres» con su próximo taller SER, la guía de cada taller para descargar, las grabaciones de los talleres virtuales, su satélite y su dinamizadora. No entra a los cursos. Las herramientas de la ruta HACER se las entrega su dinamizadora en cada visita. |
| **Dinamizadora** | Cursos **Gestión del CIC → Acompañar la ruta HACER → Facilitar la ruta SER**, y en *Seguimiento* las emprendedoras de su departamento. |
| **Secretaría Técnica** | Cursos **Gestión del CIC → Formación de la Secretaría Técnica → Acompañar HACER y Facilitar SER** (para supervisarlos), y en *Seguimiento* el avance de todo el equipo, la bandeja de evidencias, las transferencias y los videos. |

## Cómo funcionan los cursos del equipo (paso a paso)

Las reglas salen del documento técnico 6.4 y de los guiones del curso de Gestión. Las aplica el servidor (función `cic-acceso`), no la página: nadie puede saltarse un paso ni aprobarse a sí misma, **tampoco la Secretaría**. Hasta no cumplir cada paso, el siguiente curso no se abre.

1. **Activar la cuenta** con cédula, código de 6 números y contraseña propia. Si la contraseña todavía es la cédula (cuentas antiguas), los cursos quedan cerrados hasta cambiarla.
2. **Compromiso:** cada persona lo confirma en *Mis cursos*.
3. **Gestión del CIC** (5 módulos, en orden). Cada módulo tiene video, material de estudio, cuestionario y actividad:
   - el cuestionario se abre después de ver el video y repasar el material;
   - son 5 preguntas, se aprueba con **4 de 5** y hay **2 intentos**;
   - si pierde los dos, el módulo queda **en pausa** hasta que vuelva a ver el video y el material; entonces se reabre con 2 intentos nuevos;
   - el siguiente módulo se abre al **aprobar el cuestionario y enviar la actividad**.
4. **Constancia** de Gestión del CIC, con código verificable.
5. Según el perfil:
   - **Secretaría Técnica → Formación de la Secretaría Técnica** (6 unidades: Método Insight, Oportunidad significativa emergente, Canvas, MVP y Lean Startup, Gestión financiera y Guía del facilitador). Cada unidad se aprueba al repasar su guía y presentaciones y enviar la actividad; no tiene cuestionario porque el material no trae evaluación. Al terminarla recibe su constancia y se abren las rutas HACER y SER para supervisarlas.
   - **Dinamizadora → transferencia de la ruta:** la Secretaría la marca en *Seguimiento* después de la sesión de transferencia. Abre **Acompañar la ruta HACER** (6 semanas) y **Facilitar la ruta SER** (4 talleres).
6. En HACER y SER, cada semana o taller funciona igual que Gestión: 5 preguntas al azar del banco de 10 de esa evaluación, y la **verificación de la sesión** (Parte B) como evidencia.

## 1. Crear el proyecto en Supabase

1. Entrar a https://supabase.com con la cuenta centrodeinnovacioncomunitaria@gmail.com y crear un proyecto (plan gratuito, región *South America (São Paulo)*).
2. En **Authentication → Sign In / Providers → Email**:
   - desactivar **Confirm email** (las cuentas se crean ya confirmadas);
   - en **Password requirements**, poner la longitud mínima en **8**.
3. En **Authentication → Sign In / Providers**, desactivar **Allow new users to sign up**. Las cuentas solo se crean desde la función `cic-acceso`.

## 2. Crear las tablas

En **SQL Editor**, pegar y ejecutar, en este orden:

1. `supabase/migrations/20260928000000_cic_acceso.sql` (de este repositorio).
2. `directorio_equipo_cic.sql`, en la carpeta privada `privado_NO_SUBIR` (fuera del repositorio). Trae las 29 personas del Excel del equipo.
3. `supabase/migrations/20261006000000_cic_semana_videos.sql`: satélites, semana de cada emprendedora, dinamizadora asignada y videos.
4. `asignar_satelites.sql`, en `privado_NO_SUBIR`: le pone su satélite a cada dinamizadora. **Antes de ejecutarlo**, revisar las 6 líneas de Cesar y dejar en cada una `valledupar` o `pueblo-bello`.
5. `supabase/migrations/20261007000000_cic_seguridad_cursos.sql`: códigos de acceso, límite de intentos, avance de los cursos, cuestionarios, evidencias, transferencias, constancias y el espacio privado del material de estudio.
6. `banco_preguntas.sql`, en `privado_NO_SUBIR`: las 125 preguntas oficiales con su respuesta correcta (Gestión 5×5, HACER 6×10, SER 4×10). **Nunca se sube a GitHub.** Se vuelve a generar con `node herramientas/extraer_preguntas.js ../material_cursos/_texto ../privado_NO_SUBIR/banco_preguntas.sql` si cambian las evaluaciones.

Para sumar o corregir personas del equipo más adelante, se edita la tabla `directorio` en **Table Editor**.

## 3. Material de estudio privado

En **Storage → material-equipo** (lo crea la migración 5, es privado), subir los archivos del Drive con esta estructura de carpetas. La plataforma solo los entrega a quien tiene la unidad abierta, con enlaces que vencen en una hora.

| Carpeta | Qué va (del Drive «Productos Contrato») |
|---|---|
| `gestion/general/` | Guía de estudio del curso de Gestión (una sola: la copia «-1» está duplicada) |
| `formacion-secretaria/1/` | Guia_Estudio_Metodo_Insight_CIC.docx · The_Insight_Method_Blueprint.pptx |
| `formacion-secretaria/2/` | Guia_2_Oportunidad_Significativa_Emergente_CIC.docx · Mastering_Strategic_Evolution.pptx |
| `formacion-secretaria/3/` | Guia_Estudio_Modelo_Negocio_Canvas_CIC.docx · Business_Model_Blueprint.pptx · Estrategia_y_viabilidad_en_nueve_bloques.m4a |
| `formacion-secretaria/4/` | Guia_Estudio_MVP_LeanStartup_CIC.docx · Diseño_y_Validación_MVP.pptx |
| `formacion-secretaria/5/` | Guia_Estudio_GestionFinanciera_CIC.docx · Gestión_Financiera_Estratégica.pptx · Strategic_Financial_Autonomy.pptx |
| `formacion-secretaria/6/` | Guia_Metodologica_Facilitador_UFC · The_Supernova_Consultant.pptx |
| `acompanar-hacer/1/` … `/6/` | De cada semana: Material de estudio de las dinamizadoras, Herramientas (A1–A13), Guía de la emprendedora y las plantillas de Excel para entregarle |
| `facilitar-ser/1/` … `/4/` | De cada taller: Material de estudio (guía de facilitación), Herramientas (A14–A17) y las diapositivas del video |

La asignación de presentaciones a cada unidad de la Formación es una propuesta según sus títulos: la Secretaría puede moverlas de carpeta si corresponde otra. Las evaluaciones y las claves de respuesta **no** se suben aquí: el cuestionario las toma de la base de datos. Las guías de la emprendedora de los talleres SER están en el repositorio (`descargas/ser/`) porque son públicas.

## 4. Contraseña de aplicación de Gmail

Los correos (códigos y avisos) salen de centrodeinnovacioncomunitaria@gmail.com. Gmail pide una contraseña especial:

1. En la cuenta de Google, activar la **verificación en dos pasos**.
2. Ir a https://myaccount.google.com/apppasswords, crear una contraseña de aplicación llamada «CIC» y copiar las 16 letras.

## 5. Publicar la función `cic-acceso`

En **Edge Functions → Deploy a new function → Via editor**:

1. Nombre: `cic-acceso`.
2. Pegar el contenido de `supabase/functions/cic-acceso/index.ts` y desplegar. Si ya existía, reemplazar el contenido completo y volver a desplegar.
3. En la configuración de la función, **desactivar «Verify JWT»** (la función revisa la sesión por su cuenta).
4. En **Edge Functions → Secrets**, agregar:
   - `SMTP_USER` = `centrodeinnovacioncomunitaria@gmail.com`
   - `SMTP_PASS` = la contraseña de aplicación de 16 letras.

Con la CLI de Supabase es equivalente: `supabase functions deploy cic-acceso --no-verify-jwt` y `supabase secrets set SMTP_USER=... SMTP_PASS=...`.

Si la página se publica en otro dominio, agregar el secreto `CIC_ORIGENES` con las direcciones permitidas separadas por comas (por defecto: `https://centrodeinnovacioncomunitaria-hub.github.io`).

## 6. Conectar la página

En **Project Settings → API Keys**, copiar la **URL del proyecto** y la llave **anon / publishable**, y pegarlas en `config.js`:

```js
window.CIC_CONFIG = {
  supabaseUrl: 'https://xxxxxxxx.supabase.co',
  supabaseAnonKey: 'la-llave-anon-o-publishable',
  funcion: 'cic-acceso',
  whatsappCIC: '3001234567'   // opcional: el WhatsApp de atención del CIC
};
```

Esa llave es pública por diseño. **Nunca** poner en `config.js` la llave `service_role` / `secret`.

## 7. Probar

1. Como Secretaría Técnica: «Activar mi cuenta» con una cédula del directorio → pedir el código → revisar que llegue al correo → crear la contraseña.
2. En *Seguimiento*, generar un código para una dinamizadora y enviarlo por WhatsApp; ella activa su cuenta con él.
3. Como emprendedora: comprobar que solo ve «Mis talleres» (guías SER y grabaciones), sin cursos.
3b. Como dinamizadora: confirmar el compromiso, abrir el material del módulo 1, presentar el cuestionario, enviar la actividad y comprobar que se abre el módulo 2.
4. Como Secretaría: aprobar la actividad en la bandeja, marcar la transferencia HACER de una dinamizadora con Gestión aprobada y verificar que se le abre la semana 1.
5. Crear una emprendedora de prueba (con un municipio de la lista), verla en *Seguimiento* y cambiarle la semana.
6. Equivocarse 5 veces de contraseña con una cédula de prueba y comprobar que se bloquea 15 minutos.

## Cuentas creadas antes de esta versión

Si alguien del equipo ya había entrado con «cédula + cédula», su cuenta sigue funcionando, pero la página le muestra un aviso para cambiar la contraseña de inmediato. En *Seguimiento*, la tarjeta «cuentas con contraseña antigua (cédula)» muestra cuántas quedan.

## Revisión de los datos del equipo

Las observaciones sobre los datos del Excel (correos, cédulas y nombres por confirmar) están en `privado_NO_SUBIR/notas_directorio.md`, fuera del repositorio, porque contienen datos personales.
