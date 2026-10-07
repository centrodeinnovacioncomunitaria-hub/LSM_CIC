// Catálogo de archivos privados de la plataforma (guías en PDF, plantillas y material de estudio).
// Los archivos NO se publican en la página: viven en functions/archivos/ (fuera de GitHub) y los entrega
// la Cloud Function solo a quien tiene sesión (guías de emprendedoras) o la unidad abierta (material del equipo).
// Uso:  node herramientas/archivos/catalogo.js   → escribe functions/archivos_catalogo.json y herramientas/archivos/convertir.json
'use strict';
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..', '..');            // LSM_CIC
const FUENTE = path.resolve(RAIZ, '..', 'material_cursos');   // documentos originales (Word, PowerPoint, Excel)

const PLANTILLAS = { 1: [['A3_Registro_Diario', 'Plantilla A3 · Registro diario']], 4: [['A8_Costos_Precio_PE', 'Plantilla A8 · Costos, precio y punto de equilibrio'], ['A9_Flujo_PyG_Bolsillos', 'Plantilla A9 · Flujo de caja, PyG y bolsillos']], 5: [['A11_Mi_CRM', 'Plantilla A11 · Mi CRM']], 6: [['A12_Plan_Inversion', 'Plantilla A12 · Plan de inversión']] };
const archivos = {};   // id → { archivo, nombre, tipo, publico: 'emprendedoras' | 'equipo' }
const convertir = [];  // { origen, destino } para convertir a PDF (o copiar)
function agregar(id, origen, destino, nombre, publico) {
  const tipo = path.extname(destino).slice(1).toUpperCase();
  archivos[id] = { archivo: destino, nombre, tipo, publico };
  convertir.push({ origen: path.join(FUENTE, origen), destino: path.join(RAIZ, 'functions', 'archivos', destino) });
}

// Guías de las emprendedoras (se descargan al tener cuenta)
for (let s = 1; s <= 6; s++) {
  agregar(`hacer-${s}-guia`, `hacer/semana-${s}/CIC_S${s}_Guia_Emprendedora.docx`, `guias/hacer-${s}-guia.pdf`, `Guía de la semana ${s}`, 'emprendedoras');
  for (const [k, n] of PLANTILLAS[s] || []) agregar(`hacer-${s}-${k.split('_')[0].toLowerCase()}`, `hacer/semana-${s}/CIC_S${s}_${k}.xlsx`, `guias/hacer-${s}-${k.split('_')[0].toLowerCase()}.xlsx`, n, 'emprendedoras');
}
for (let t = 1; t <= 4; t++) agregar(`ser-${t}-guia`, `ser/taller-${t}/CIC_SER${t}_Guia_Emprendedora.docx`, `guias/ser-${t}-guia.pdf`, `Guía del taller ${t}`, 'emprendedoras');

// Material de estudio del equipo (se abre con la unidad del curso)
agregar('gestion-guia', 'gestion/CIC_Guia_Estudio_Curso_Gestion_CIC.docx', 'material/gestion-guia-estudio.pdf', 'Guía de estudio del curso Gestión del CIC', 'equipo');
for (let s = 1; s <= 6; s++) {
  agregar(`hacer-${s}-estudio`, `hacer/semana-${s}/CIC_S${s}_Material_Estudio_Dinamizadoras.docx`, `material/hacer-${s}-estudio.pdf`, `Material de estudio para dinamizadoras · semana ${s}`, 'equipo');
  const h = fs.readdirSync(path.join(FUENTE, `hacer/semana-${s}`)).find((f) => /_Herramientas_.*\.docx$/.test(f));
  agregar(`hacer-${s}-herramientas`, `hacer/semana-${s}/${h}`, `material/hacer-${s}-herramientas.pdf`, `Herramientas de la semana ${s}`, 'equipo');
}
for (let t = 1; t <= 4; t++) {
  agregar(`ser-${t}-estudio`, `ser/taller-${t}/CIC_SER${t}_Material_Estudio_Dinamizadoras.docx`, `material/ser-${t}-estudio.pdf`, `Material de estudio (guía de facilitación) · taller ${t}`, 'equipo');
  const h = fs.readdirSync(path.join(FUENTE, `ser/taller-${t}`)).find((f) => /_Herramientas_.*\.docx$/.test(f));
  agregar(`ser-${t}-herramientas`, `ser/taller-${t}/${h}`, `material/ser-${t}-herramientas.pdf`, `Herramientas del taller ${t}`, 'equipo');
  agregar(`ser-${t}-diapositivas`, `ser/diapositivas/CIC_SER${t}_Diapositivas_Video.pptx`, `material/ser-${t}-diapositivas.pdf`, `Diapositivas del taller ${t}`, 'equipo');
}
const FORMACION = [
  [['Guia_Estudio_Metodo_Insight_CIC.docx', 'Guía de estudio · Método Insight'], ['The_Insight_Method_Blueprint.pptx', 'Presentación · The Insight Method Blueprint']],
  [['Guia_2_Oportunidad_Significativa_Emergente_CIC.docx', 'Guía de estudio · Oportunidad significativa emergente'], ['Mastering_Strategic_Evolution.pptx', 'Presentación · Mastering Strategic Evolution']],
  [['Guia_Estudio_Modelo_Negocio_Canvas_CIC.docx', 'Guía de estudio · Modelo de negocio Canvas'], ['Business_Model_Blueprint.pptx', 'Presentación · Business Model Blueprint']],
  [['Guia_Estudio_MVP_LeanStartup_CIC.docx', 'Guía de estudio · MVP y Lean Startup'], ['Diseño_y_Validación_MVP.pptx', 'Presentación · Diseño y validación del MVP']],
  [['Guia_Estudio_GestionFinanciera_CIC.docx', 'Guía de estudio · Gestión financiera'], ['Gestión_Financiera_Estratégica.pptx', 'Presentación · Gestión financiera estratégica'], ['Strategic_Financial_Autonomy_(2).pptx', 'Presentación · Strategic Financial Autonomy']],
  [['Guia_Metodologica_Facilitador_UFC.pdf', 'Guía metodológica del facilitador'], ['The_Supernova_Consultant.pptx', 'Presentación · The Supernova Consultant']],
];
FORMACION.forEach((lista, i) => lista.forEach(([f, n], j) => agregar(`formacion-${i + 1}-${j + 1}`, `formacion/${f}`, `material/formacion-${i + 1}-${j + 1}.pdf`, n, 'equipo')));

// Material de cada unidad (lo que muestra la lección); el audio de la unidad 3 sigue en Drive
const ids = (re) => Object.keys(archivos).filter((k) => re.test(k));
const material = { gestion_general: ['gestion-guia'] };
for (let s = 1; s <= 6; s++) material[`acompanar-hacer_${s}`] = [`hacer-${s}-estudio`, `hacer-${s}-herramientas`, `hacer-${s}-guia`, ...ids(new RegExp(`^hacer-${s}-a\\d+$`))];
for (let t = 1; t <= 4; t++) material[`facilitar-ser_${t}`] = [`ser-${t}-estudio`, `ser-${t}-herramientas`, `ser-${t}-guia`, `ser-${t}-diapositivas`];
FORMACION.forEach((lista, i) => { material[`formacion-secretaria_${i + 1}`] = lista.map((_, j) => `formacion-${i + 1}-${j + 1}`); });

fs.writeFileSync(path.join(RAIZ, 'functions', 'archivos_catalogo.json'), JSON.stringify({ archivos, material }, null, 1));
fs.writeFileSync(path.join(__dirname, 'convertir.json'), JSON.stringify(convertir, null, 1));
const faltan = convertir.filter((c) => !fs.existsSync(c.origen));
console.log(Object.keys(archivos).length, 'archivos ·', Object.keys(material).length, 'unidades');
if (faltan.length) { console.error('Faltan originales:\n' + faltan.map((f) => f.origen).join('\n')); process.exit(1); }
