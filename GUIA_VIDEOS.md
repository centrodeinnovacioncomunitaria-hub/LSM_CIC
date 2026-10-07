# Guía de videos del CIC

Esta guía explica cómo funcionan los videos en la plataforma, cómo se publican y qué nombres llevan. La usa la Secretaría Técnica, que es quien publica.

## 1. Qué videos hay

| Para quién | Qué son | Cuántos | Dónde se ven |
|---|---|---|---|
| Dinamizadoras y Secretaría Técnica | Un video por módulo de cada curso del equipo | 15: Gestión del CIC (5), Acompañar HACER (6), Facilitar SER (4) | *Mis cursos*, dentro de cada módulo |
| Emprendedoras | Grabaciones de los talleres virtuales (SER 2 y SER 4) | Una por taller y por satélite | *Mi semana*, en «Grabaciones de los talleres virtuales» |

Las emprendedoras **no** necesitan videos de las guías: sus guías y plantillas se descargan en Word y Excel desde *Mi semana* y desde las páginas de las rutas.

## 2. Cómo se ve un módulo

Cada módulo de un curso del equipo se abre en *Mis cursos* (solo cuando el anterior está aprobado) y muestra cuatro pasos:

1. **Video** (8 a 15 minutos). Primero aparece solo la imagen; el video se carga cuando la persona toca ▶, así no gasta datos quien no lo va a ver. Debajo, el botón «Ya vi el video».
2. **Material de estudio**: se abre con los enlaces de Google Drive de cada unidad (ver CONFIGURAR_FIREBASE.md, paso 5) y «Ver el tema» abre la página pública del módulo.
3. **Cuestionario**: 5 preguntas, se aprueba con 4 de 5 y hay 2 intentos. Se activa cuando la persona vio el video y repasó el material. Lo califica el servidor.
4. **Actividad** (Gestión) o **verificación de la sesión** (HACER y SER): texto o enlace a la evidencia, que revisa la Secretaría Técnica.

Si un módulo todavía no tiene video, dice «El video de este módulo todavía no está publicado» y el cuestionario se abre solo con el material. **Al publicar el video, se vuelve obligatorio verlo** antes del cuestionario para quien aún no lo ha presentado.

## 3. Dónde se alojan los videos

En **YouTube**, en el canal de centrodeinnovacioncomunitaria@gmail.com, con visibilidad **«No listado»**:

- No aparecen en búsquedas ni en el canal; solo los ve quien tiene el enlace.
- La plataforma muestra el enlace únicamente a quien inició sesión y le corresponde (equipo, o emprendedoras de ese satélite).
- YouTube adapta la calidad a la señal del celular, es gratis y no tiene límite de espacio.

Importante: «No listado» no es privado del todo. Si alguien copia el enlace y lo comparte, otra persona podría verlo. Por eso **en los videos no se muestran cédulas, teléfonos ni datos personales**. Si en el futuro se necesita privacidad total, se puede pasar a un servicio con enlaces firmados (por ejemplo, Vimeo) sin cambiar la plataforma.

## 4. Convención de nombres

Cada video tiene un **código** único. La plataforma lo arma sola al publicar, y es el mismo en el archivo, en YouTube y en la base de datos.

| Tipo | Código | Ejemplo |
|---|---|---|
| Curso Gestión del CIC, módulo N (1 a 5) | `GES-MN` | `GES-M3` |
| Curso Acompañar la ruta HACER, semana N (1 a 6) | `HAC-SN` | `HAC-S4` |
| Curso Facilitar la ruta SER, taller N (1 a 4) | `SER-TN` | `SER-T2` |
| Grabación de un taller SER para emprendedoras | `GRAB-SERN-SAT-AAAAMMDD` | `GRAB-SER2-BOL-20261020` |

Códigos de satélite: `GUA` La Guajira · `MAG` Magdalena · `VAL` Valledupar · `PBE` Pueblo Bello · `ATL` Atlántico · `BOL` Bolívar · `SUC` Sucre · `COR` Córdoba · `TODOS` para una grabación que sirve a todos los satélites.

**Nombre del archivo** (en el computador o en Drive): `CIC_<código>_<tema-corto>_v<versión>.mp4`
Ejemplos: `CIC_GES-M1_introduccion_v1.mp4`, `CIC_GRAB-SER2-BOL-20261020_decisiones_v1.mp4`

**Título en YouTube**: `CIC · <curso o taller> · <módulo> · <título>`
Ejemplo: `CIC · Gestión del CIC · Módulo 1 · Introducción a la gestión de centros de innovación`

**Descripción en YouTube**: el código en la primera línea, luego una frase de lo que se aprende y «Centro de Innovación Comunitaria · Red de Mujeres del Caribe».

**Listas de reproducción** (no listadas): una por curso (`CIC · Gestión del CIC`, `CIC · Acompañar HACER`, `CIC · Facilitar SER`) y una por satélite para las grabaciones (`CIC · Grabaciones · Bolívar`).

## 5. Cómo publicar un video, paso a paso

1. **Grabar** en horizontal, 720p o más, con buen audio. Duración: 8 a 10 minutos para los módulos; los talleres completos pueden durar más.
2. **Nombrar el archivo** con la convención de arriba.
3. **Subir a YouTube** con la cuenta del CIC: visibilidad «No listado», título y descripción con la convención, y «No es contenido para niños». Revisar los subtítulos automáticos en español.
4. **Copiar el enlace** del video (Compartir → Copiar).
5. En la plataforma, **ingresar como Secretaría Técnica → pestaña *Videos***:
   - «Para quién es»: *Curso del equipo* o *Grabación de un taller*.
   - Elegir el curso y el módulo, o el taller, el satélite y la fecha.
   - Pegar el enlace y escribir la duración en minutos.
   - Revisar el código que aparece y tocar **Publicar video**.
6. **Comprobar**: el video aparece en «Publicados» y, para quien le corresponde, en *Mis cursos* o en *Mi semana*.

Para **reemplazar** un video, se publica otro con el mismo módulo: el código es el mismo y el anterior se sustituye. Para **retirarlo**, «Quitar» en la lista (en YouTube sigue existiendo).

## 6. Grabaciones de talleres con emprendedoras

- Antes de grabar, avisar al grupo y pedir su **autorización** (Ley 1581 de 2012). Quien no quiera salir puede apagar su cámara.
- Las grabaciones solo las ven las emprendedoras de ese satélite (o de todos, si se publica con `TODOS`).
- Publicarlas dentro de los 3 días siguientes al taller.

## 7. Dónde vive cada cosa (para el equipo técnico)

- Colección `videos` en Firestore (Firebase): código, título, ID de YouTube o de Google Drive, duración, audiencia, curso, unidad, satélite y fecha. La Cloud Function `cicAcceso` (`functions/logica.js`) rechaza códigos que no sigan la convención.
- También se aceptan videos de Google Drive compartidos como «Cualquier persona con el enlace»: se pega su enlace igual que uno de YouTube.
- Permisos: el equipo ve los videos de sus cursos; cada emprendedora ve las grabaciones de su satélite y las generales; solo la Secretaría Técnica publica, cambia o quita.
- El reproductor está en `index.html` (funciones `reproductor`, `traerVideos` y `pintarVideos`). Usa `youtube-nocookie.com` para no dejar cookies de seguimiento antes de reproducir.
