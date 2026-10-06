# Herramientas del portal

El portal tiene dos espacios:

- **Talleres para emprendedoras** (`rutas/hacer/` y `rutas/ser/`): se inscriben solas. Cada sesión o taller tiene su guía pública (`rutas/hacer/semana-N/`, `rutas/ser/taller-N/`) y un espacio para su video.
- **Cursos del equipo** (`cursos/`): Gestión del CIC, Acompañar la ruta HACER y Facilitar la ruta SER, para dinamizadoras y Secretaría Técnica. Entran con su cédula si están en la base de datos. Las páginas públicas describen cada curso; el video, el material de estudio y el cuestionario de cada tema se abren al ingresar (área privada en Supabase).

## Scripts (se ejecutan desde la carpeta `LSM_CIC`)

| Script | Qué hace |
|---|---|
| `perl herramientas/generar_lecciones.pl ../material_cursos` | Genera las 10 guías de las emprendedoras desde las «Guías de la emprendedora» del Drive y copia sus descargas a `/descargas`. |
| `perl herramientas/generar_cursos.pl` | Genera `cursos/` y las páginas de los tres cursos del equipo. |
| `perl herramientas/aplicar_plantilla.pl` | Aplica el menú y el pie al inicio, la biblioteca y las páginas de las rutas. |

`Plantilla.pm` tiene el menú principal y el pie de todas las páginas: si cambia el menú, se edita ahí y se ejecutan los tres scripts.

`material_cursos` es la carpeta *Material Plataforma* del Drive descargada en `Desktop\2HO\CIC\material_cursos`, con `hacer/semana-1 … semana-6`, `ser/taller-1 … taller-4` y `gestion`.

## Qué se publica y qué no

- **Se publica:** las guías de la emprendedora (como página y en Word) y las plantillas de Excel A3, A8, A9, A11 y A12.
- **No se publica** (área privada del equipo): videos y guiones, material de estudio, guías de facilitación, evaluaciones y cuestionarios, documentos de herramientas con claves para la dinamizadora y la guía de estudio del curso de Gestión.

Las respuestas que las emprendedoras escriben en sus guías se guardan solo en su dispositivo.
