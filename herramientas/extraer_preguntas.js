// Extrae el banco de preguntas oficial de los cursos del equipo desde los textos de material_cursos/_texto
// y escribe un archivo PRIVADO (con las respuestas correctas) para cargar en Firebase.
// Uso: node herramientas/extraer_preguntas.js ../material_cursos/_texto ../privado_NO_SUBIR/banco_preguntas.json
// (con extensión .json lo carga herramientas/firebase/cargar.js; con .sql, el formato anterior de Supabase)
// El archivo resultante NUNCA se sube a GitHub: contiene la clave de respuestas.
const fs = require('fs');
const path = require('path');
const [dir, salida] = process.argv.slice(2);
if (!dir || !salida) { console.error('Uso: node extraer_preguntas.js <carpeta _texto> <salida.json>'); process.exit(1); }

// Une las celdas de las tablas exportadas ("\n | ") en filas separadas por "|"
const filas = (t) => t.replace(/\r/g, '').replace(/\n \| /g, '|').split('\n');
const limpiar = (s) => s.replace(/\s+/g, ' ').trim();

// ---------- Evaluaciones de HACER y SER (banco de 10 + clave) ----------
function evaluacion(archivo, curso, unidad) {
  const t = fs.readFileSync(path.join(dir, archivo), 'utf8').replace(/\r/g, '');
  const parteA = t.slice(t.indexOf('# Parte A'), t.indexOf('# Parte B'));
  const preguntas = [];
  let actual = null;
  for (const linea of parteA.split('\n')) {
    const p = linea.match(/^Pregunta (\d+)\.\s*(.+)$/);
    const o = linea.match(/^([a-d])\)\s*(.+)$/);
    if (p) { actual = { n: +p[1], enunciado: limpiar(p[2]), opciones: [] }; preguntas.push(actual); }
    else if (o && actual) actual.opciones.push(limpiar(o[2]));
  }
  const clave = {};
  for (const f of filas(t.slice(t.indexOf('# Clave de respuestas')))) {
    const m = f.match(/^(\d+)\|([a-d])\)\|(.*?)\|?$/);
    if (m) clave[+m[1]] = { correcta: 'abcd'.indexOf(m[2]), retro: limpiar(m[3]) };
  }
  return preguntas.map((q) => ({ curso, unidad, ...q, ...clave[q.n] }));
}

// ---------- Curso de Gestión (5 preguntas por módulo, en los guiones) ----------
function gestion(archivo) {
  const t = fs.readFileSync(path.join(dir, archivo), 'utf8');
  const bloques = t.split('Cuestionario (aprobación: 4 de 5)').slice(1);
  return bloques.flatMap((b, i) => {
    const out = [];
    // Las opciones vienen en varias líneas dentro de una celda: se unen antes de separar filas
    const texto = b.replace(/\r/g, '').replace(/\n(?=[b-d]\) )/g, '¶');
    for (const f of filas(texto)) {
      const m = f.match(/^(\d)\|(.+?)\|(a\) .+?)\|([a-d])\)\|?$/);
      if (!m) continue;
      out.push({
        curso: 'gestion', unidad: i + 1, n: +m[1], enunciado: limpiar(m[2]),
        opciones: m[3].split('¶').map((o) => limpiar(o.replace(/^[a-d]\)\s*/, ''))),
        correcta: 'abcd'.indexOf(m[4]), retro: null
      });
      if (out.length === 5) break;
    }
    return out;
  });
}

const banco = [
  ...gestion('gestion_CIC_Guiones_Curso_Gestion_CIC.txt'),
  ...[1, 2, 3, 4, 5, 6].flatMap((s) => evaluacion(`hacer_semana-${s}_CIC_S${s}_Evaluacion.txt`, 'acompanar-hacer', s)),
  ...[1, 2, 3, 4].flatMap((n) => evaluacion(`ser_taller-${n}_CIC_SER${n}_Evaluacion.txt`, 'facilitar-ser', n))
];

// Validación: cada pregunta con 3 opciones y una respuesta correcta
const errores = banco.filter((q) => q.opciones.length < 2 || !(q.correcta >= 0 && q.correcta < q.opciones.length));
const conteo = banco.reduce((a, q) => { const k = `${q.curso}-${q.unidad}`; a[k] = (a[k] || 0) + 1; return a; }, {});
console.log('Preguntas por unidad:', conteo);
console.log('Total:', banco.length, '· con errores:', errores.length);
if (errores.length) { console.error(errores.slice(0, 5)); process.exit(1); }

const q = (s) => s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`;
const sql = `-- BANCO DE PREGUNTAS DE LOS CURSOS DEL EQUIPO · CONTIENE LAS RESPUESTAS CORRECTAS
-- PRIVADO: NO SUBIR A GITHUB. Generado por herramientas/extraer_preguntas.js desde el material oficial.
-- Pegar en Supabase → SQL Editor → Run, DESPUÉS de la migración 20261007000000_cic_seguridad_cursos.sql.
-- Se puede ejecutar de nuevo: reemplaza el banco completo.
begin;
delete from public.preguntas;
insert into public.preguntas (curso, unidad, n, enunciado, opciones, correcta, retro) values
${banco.map((p) => `  (${q(p.curso)}, ${p.unidad}, ${p.n}, ${q(p.enunciado)}, ${q(JSON.stringify(p.opciones))}::jsonb, ${p.correcta}, ${q(p.retro)})`).join(',\n')};
commit;
`;
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, salida.endsWith('.json') ? JSON.stringify(banco, null, 1) : sql);
console.log('Escrito:', salida);
