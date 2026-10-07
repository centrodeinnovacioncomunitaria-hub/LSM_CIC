# Herramientas del portal

El portal tiene tres espacios:

- **El CIC** (`index.html` y `el-cic/`): qué es el centro, cómo funciona desde la Secretaría Técnica hasta los 8 satélites (con mapa) y sus pilares. Poco texto, a propósito.
- **Talleres para emprendedoras** (`rutas/hacer/` y `rutas/ser/`): cada semana o taller con su resumen y sus descargas (Word y Excel). Al ingresar, cada emprendedora ve **«Mi semana»**: su semana actual, su satélite, su dinamizadora, sus descargas y las grabaciones de los talleres virtuales.
- **Cursos del equipo** (`cursos/`): Gestión del CIC, Acompañar la ruta HACER y Facilitar la ruta SER, para dinamizadoras y Secretaría Técnica. Al ingresar, cada módulo muestra su video (ver `../GUIA_VIDEOS.md`).

## Una sola fuente de datos

`Datos.pm` tiene los 8 satélites (con sus municipios), las 6 semanas de HACER, los 4 talleres de SER con sus descargas, y los pilares. De ahí salen el mapa, las páginas de las rutas y `assets/datos-cic.js`, que lee la plataforma. Si cambia una semana, una descarga o un satélite, se edita solo ahí.

`Plantilla.pm` tiene las piezas comunes de todas las páginas: símbolos, menú, pie, cabeza HTML (`cabeza`), apertura del cuerpo (`cuerpo_inicio`) y cierre (`final_pagina`).

## Scripts (se ejecutan desde la carpeta `LSM_CIC`, en este orden)

| Script | Qué hace |
|---|---|
| `perl herramientas/generar_rutas.pl` | Genera `rutas/hacer/`, `rutas/ser/`, las redirecciones de las guías anteriores y `assets/datos-cic.js`. Avisa si falta alguna descarga. |
| `perl herramientas/generar_el_cic.pl` | Genera `el-cic/` y las redirecciones de sus subpáginas anteriores. |
| `perl herramientas/generar_cursos.pl` | Genera `cursos/` y las páginas de los tres cursos del equipo. |
| `perl herramientas/aplicar_plantilla.pl` | Aplica menú y pie al inicio y a la biblioteca, y llena en el inicio los bloques del mapa y los pilares. |

## Acceso y cursos (Firebase)

- `functions/logica.js`: todas las reglas (ingreso con cédula, inscripción, enlace al correo y códigos, cursos, cuestionarios, evidencias, constancias). `functions/prueba.js` la prueba sin conexión: `cd functions && npm install && node prueba.js`.
- `functions/index.js`: la Cloud Function `cicAcceso`; `functions/cuentas.js`: Firebase Authentication.
- `functions/cargar.js`: carga el directorio, el banco de preguntas y el material (archivos privados), e invita al equipo por correo.
- `herramientas/firebase/directorio_desde_excel.js`: convierte el Excel del equipo en `privado_NO_SUBIR/directorio.json`.
- `firestore.rules`: la página no lee Firestore directamente; todo pasa por la función.
- Pasos para activarlo: `../CONFIGURAR_FIREBASE.md`. Los datos personales y el banco de preguntas están en `privado_NO_SUBIR`, fuera del repositorio.

## Qué se publica y qué no

- **Se publica:** las guías de la emprendedora en Word, las plantillas de Excel A3, A8, A9, A11 y A12, y la descripción de cada curso del equipo.
- **No se publica** (solo al ingresar): los videos de los cursos, las grabaciones de los talleres, el material de estudio y los cuestionarios del equipo.

Los documentos oficiales del modelo (6.5 y 6.4) son iterativos: cuando la Secretaría publique una versión nueva, se revisan las cifras de `generar_el_cic.pl`, del inicio y de `llms.txt`.
