# Herramientas del portal

Las lecciones de las rutas HACER (`rutas/hacer/semana-N/`) y SER (`rutas/ser/taller-N/`) se generan a partir de las **Guías de la emprendedora** que están en el Drive del CIC (carpeta *Productos Contrato › Material Plataforma*).

## Regenerar las lecciones

1. Descarga la carpeta *Material Plataforma* en `Desktop\2HO\CIC\material_cursos`, con esta estructura:
   `hacer/semana-1 … semana-6` y `ser/taller-1 … taller-4` (cada una con su `CIC_…_Guia_Emprendedora.docx` y, en HACER, sus plantillas `.xlsx`).
2. Desde la carpeta `LSM_CIC`, ejecuta:

   ```
   perl herramientas/generar_lecciones.pl ../material_cursos
   ```

3. Revisa las páginas y súbelas a GitHub.

## Qué se publica y qué no

- **Se publica:** la guía de la emprendedora (como lección y en Word) y las plantillas de Excel A3, A8, A9, A11 y A12.
- **No se publica** (espera el área privada con ingreso): evaluaciones, material de estudio de las dinamizadoras, guiones de video, diapositivas, documentos de herramientas con claves para la dinamizadora y los materiales del curso de Gestión del CIC.

Las respuestas que las emprendedoras escriben en las lecciones se guardan solo en su dispositivo.
