// Convierte el documento «Banco de evaluaciones y claves de respuesta» (Google Docs exportado como .txt)
// en el banco PRIVADO que carga functions/cargar.js (--preguntas).
// Uso: node herramientas/extraer_preguntas_doc.js <documento.txt> ../privado_NO_SUBIR/banco_preguntas.json
// Parte I: las 14 evaluaciones (10 preguntas, opciones A–D). Parte II: la clave con su justificación.
// El resultado tiene las respuestas correctas: NUNCA se sube a GitHub.
'use strict';
const fs = require('fs');
const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) { console.error('Uso: node extraer_preguntas_doc.js <documento.txt> <salida.json>'); process.exit(1); }

const texto = fs.readFileSync(entrada, 'utf8').replace(/^﻿/, '').replace(/\r/g, '').normalize('NFC');
const iParte2 = texto.indexOf('PARTE II · CLAVE DE RESPUESTAS');
const iParte1 = texto.indexOf('PARTE I · EVALUACIONES');
if (iParte1 < 0 || iParte2 < 0) { console.error('No encontré las partes I y II del documento.'); process.exit(1); }
const parte1 = texto.slice(iParte1, iParte2).split('\n');
const parte2 = texto.slice(iParte2).split('\n');
const limpiar = (s) => s.replace(/\s+/g, ' ').trim();

// Encabezado de cada evaluación → curso y unidad de la plataforma
function unidadDe(linea) {
  let m = linea.match(/^Módulo (\d) · /); if (m) return { curso: 'gestion', unidad: +m[1] };
  m = linea.match(/^Semana (\d) · /); if (m) return { curso: 'acompanar-hacer', unidad: +m[1] };
  m = linea.match(/^Taller SER (\d) · /); if (m) return { curso: 'facilitar-ser', unidad: +m[1] };
  return null;
}

// ---------- Parte I: preguntas y opciones ----------
const evaluaciones = new Map(); // "curso-unidad" → { tema, preguntas: [...] }
let actual = null, pregunta = null;
for (const l of parte1) {
  const u = unidadDe(l.trim());
  if (u) { actual = { ...u, tema: limpiar(l.split(' · ').slice(1).join(' · ')), preguntas: [] }; evaluaciones.set(`${u.curso}-${u.unidad}`, actual); pregunta = null; continue; }
  if (!actual) continue;
  const p = l.match(/^(\d{1,2})\.\s*(.+)$/);
  const o = l.match(/^([A-D])\.\s*(.+)$/);
  if (p) { pregunta = { n: +p[1], enunciado: limpiar(p[2]), opciones: [] }; actual.preguntas.push(pregunta); }
  else if (o && pregunta) pregunta.opciones.push(limpiar(o[2]));
}

// ---------- Parte II: letra correcta y justificación ----------
// Cada fila de la tabla viene en líneas separadas por tabuladores: N.º, letra, respuesta, por qué.
const claves = new Map();
let clave = null;
const celdas = [];
const vaciar = () => {
  if (!clave) return;
  for (let i = 0; i + 3 < celdas.length; i++) {
    if (/^\d{1,2}$/.test(celdas[i]) && /^[A-D]$/.test(celdas[i + 1])) {
      clave.set(+celdas[i], { letra: celdas[i + 1], respuesta: celdas[i + 2], por_que: celdas[i + 3] });
      i += 3;
    }
  }
  celdas.length = 0;
};
for (const l of parte2) {
  const u = unidadDe(l.trim());
  if (u) { vaciar(); clave = new Map(); claves.set(`${u.curso}-${u.unidad}`, clave); continue; }
  if (!clave) continue;
  const c = limpiar(l);
  if (c && !/^(N\.º|Letra|Respuesta correcta|Por qué es correcta|_+|CLAVE · .*)$/.test(c)) celdas.push(c);
}
vaciar();

// ---------- Unir y validar ----------
const banco = [];
const errores = [];
for (const [k, ev] of evaluaciones) {
  const cl = claves.get(k);
  if (!cl) { errores.push(`${k}: sin clave`); continue; }
  if (ev.preguntas.length !== 10) errores.push(`${k}: ${ev.preguntas.length} preguntas (se esperaban 10)`);
  for (const q of ev.preguntas) {
    const c = cl.get(q.n);
    if (q.opciones.length !== 4) errores.push(`${k} P${q.n}: ${q.opciones.length} opciones`);
    if (!c) { errores.push(`${k} P${q.n}: sin clave`); continue; }
    const correcta = 'ABCD'.indexOf(c.letra);
    if (limpiar(q.opciones[correcta] || '') !== limpiar(c.respuesta)) errores.push(`${k} P${q.n}: la letra ${c.letra} no coincide con el texto de la respuesta`);
    banco.push({ curso: ev.curso, unidad: ev.unidad, n: q.n, enunciado: q.enunciado, opciones: q.opciones, correcta, retro: c.por_que });
  }
}
const conteo = banco.reduce((a, q) => { const k = `${q.curso}-${q.unidad}`; a[k] = (a[k] || 0) + 1; return a; }, {});
console.log('Preguntas por evaluación:', conteo);
console.log('Total:', banco.length, '· errores:', errores.length);
if (errores.length) { console.error(errores.join('\n')); process.exit(1); }
fs.writeFileSync(salida, JSON.stringify(banco, null, 1));
console.log('Escrito:', salida);
