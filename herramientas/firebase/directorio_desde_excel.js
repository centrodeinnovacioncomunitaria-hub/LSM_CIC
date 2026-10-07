// Convierte el Excel del directorio del equipo («DIRECTORIO EQUIPO RMC Proyecto CIC») en el archivo
// PRIVADO que carga herramientas/firebase/cargar.js. No necesita instalar nada.
// Uso (desde LSM_CIC):
//   node herramientas/firebase/directorio_desde_excel.js "../DIRECTORIO EQUIPO RMC Proyecto CIC sep.xlsx" ../privado_NO_SUBIR/directorio.json
// El resultado tiene datos personales: va en privado_NO_SUBIR y NUNCA se sube a GitHub.
//
// Reglas:
// - La hoja «Secretaria Técnica» define quién es Secretaría; el resto del equipo es Dinamizadora.
// - Si en «TODO EL EQUIPO» falta la cédula o el correo, se toma de la hoja de su departamento.
// - Satélite: el de su departamento. Cesar tiene dos (Valledupar y Pueblo Bello): por defecto queda
//   Valledupar; corrígelo en el JSON (campo "satelite": "pueblo-bello") antes de cargar.
// - Si junto a la salida existe personas_extra.json (lista con el mismo formato), se agrega: sirve para cuentas de prueba.
'use strict';
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) { console.error('Uso: node directorio_desde_excel.js <directorio.xlsx> <salida.json>'); process.exit(1); }

// ---------- Lector mínimo de .xlsx (un .zip con XML) ----------
function leerZip(archivo) {
  const b = fs.readFileSync(archivo);
  let fin = b.length - 22;
  while (fin >= 0 && b.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error('El archivo no parece un Excel (.xlsx).');
  const total = b.readUInt16LE(fin + 10);
  let p = b.readUInt32LE(fin + 16);
  const archivos = {};
  for (let i = 0; i < total; i++) {
    const metodo = b.readUInt16LE(p + 10), comprimido = b.readUInt32LE(p + 20);
    const largoNombre = b.readUInt16LE(p + 28), largoExtra = b.readUInt16LE(p + 30), largoComent = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const nombre = b.toString('utf8', p + 46, p + 46 + largoNombre);
    const ini = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
    const crudo = b.subarray(ini, ini + comprimido);
    archivos[nombre] = () => (metodo === 8 ? zlib.inflateRawSync(crudo) : crudo).toString('utf8');
    p += 46 + largoNombre + largoExtra + largoComent;
  }
  return archivos;
}
const desescapar = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
function leerExcel(archivo) {
  const z = leerZip(archivo);
  const comunes = z['xl/sharedStrings.xml'] ? [...z['xl/sharedStrings.xml']().matchAll(/<si>([\s\S]*?)<\/si>/g)]
    .map((m) => desescapar([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''))) : [];
  const rels = z['xl/_rels/workbook.xml.rels']();
  const hojas = {};
  for (const m of z['xl/workbook.xml']().matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) {
    const destino = rels.match(new RegExp(`Id="${m[2]}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${m[2]}"`));
    const ruta = 'xl/' + destino[1].replace(/^\/?xl\//, '');
    hojas[desescapar(m[1])] = [...z[ruta]().matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
      const fila = {};
      for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const v = (c[3] || '').match(/<v>([\s\S]*?)<\/v>/) || (c[3] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/);
        if (v) fila[c[1]] = /t="s"/.test(c[2]) ? comunes[+v[1]] : desescapar(v[1]);
      }
      return fila;
    }).filter((f) => Object.keys(f).length);
  }
  return hojas;
}

// ---------- Normalización ----------
const soloDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const nombrePropio = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase()
  .replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()).replace(/\s(De|Del|La|Las|Los|Y)\s/g, (m) => m.toLowerCase());
const DEPARTAMENTOS = { atlantico: 'Atlántico', bolivar: 'Bolívar', cesar: 'Cesar', cordoba: 'Córdoba', 'la guajira': 'La Guajira', guajira: 'La Guajira', magdalena: 'Magdalena', sucre: 'Sucre' };
const SATELITE = { 'La Guajira': 'la-guajira', Magdalena: 'magdalena', Cesar: 'valledupar', 'Atlántico': 'atlantico', 'Bolívar': 'bolivar', Sucre: 'sucre', 'Córdoba': 'cordoba' };
const correoOk = (c) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c);

// Convierte una hoja en objetos usando su fila de encabezados
function tabla(filas) {
  const i = filas.findIndex((f) => Object.values(f).some((v) => /c[eé]dula/i.test(v)));
  if (i < 0) return [];
  const cab = Object.fromEntries(Object.entries(filas[i]).map(([col, t]) => [col, sinTildes(t)]));
  const colDe = (re) => Object.keys(cab).find((c) => re.test(cab[c]));
  const k = { nombre: Object.keys(cab).find((c) => /nombre/.test(cab[c]) && !/cargo/.test(cab[c])), cedula: colDe(/cedula/), celular: colDe(/celular|whatsapp|telefono/), correo: colDe(/correo|e-?mail/), cargo: colDe(/cargo/), depto: colDe(/departamento/) };
  return filas.slice(i + 1).map((f) => ({
    nombre: nombrePropio(f[k.nombre]), cedula: soloDigitos(f[k.cedula]), celular: soloDigitos(f[k.celular]),
    correo: String(f[k.correo] || '').trim().toLowerCase(), cargo: String(f[k.cargo] || '').trim().replace(/\s+/g, ' '),
    departamento: DEPARTAMENTOS[sinTildes(f[k.depto])] || null,
  })).filter((p) => p.nombre);
}

const hojas = leerExcel(entrada);
const nombresHoja = Object.keys(hojas);
const general = nombresHoja.find((n) => /todo/i.test(n));
const secretaria = nombresHoja.find((n) => /secretar/i.test(n));
if (!general) { console.error('No encontré la hoja «TODO EL EQUIPO». Hojas:', nombresHoja.join(', ')); process.exit(1); }
const clave = (n) => sinTildes(n).split(/\s+/).slice(0, 2).join(' '); // nombre y primer apellido
const deSecretaria = new Set(tabla(hojas[secretaria] || []).flatMap((p) => [p.cedula, clave(p.nombre)]).filter(Boolean));
const porDepartamento = nombresHoja.filter((n) => n !== general && n !== secretaria)
  .flatMap((n) => tabla(hojas[n]).map((p) => ({ ...p, departamento: p.departamento || DEPARTAMENTOS[sinTildes(n)] || null })));

const avisos = [];
const personas = tabla(hojas[general]).map((p) => {
  const otra = porDepartamento.find((x) => (p.cedula && x.cedula === p.cedula) || clave(x.nombre) === clave(p.nombre));
  if (!p.cedula && otra && otra.cedula) { p.cedula = otra.cedula; avisos.push(`${p.nombre}: la cédula se tomó de la hoja de su departamento.`); }
  if (!p.correo && otra && otra.correo) { p.correo = otra.correo; avisos.push(`${p.nombre}: el correo se tomó de la hoja de su departamento.`); }
  if (!p.departamento && otra) p.departamento = otra.departamento;
  // Si el cargo nombra un departamento (p. ej. «… - La Guajira»), ese manda
  const enCargo = Object.keys(DEPARTAMENTOS).sort((a, b) => b.length - a.length).find((d) => sinTildes(p.cargo).includes(d));
  if (enCargo && DEPARTAMENTOS[enCargo] !== p.departamento) { avisos.push(`${p.nombre}: el cargo dice ${DEPARTAMENTOS[enCargo]} (la hoja decía ${p.departamento || 'nada'}); se usa ${DEPARTAMENTOS[enCargo]}.`); p.departamento = DEPARTAMENTOS[enCargo]; }
  const rol = deSecretaria.has(p.cedula) || deSecretaria.has(clave(p.nombre)) ? 'secretaria' : 'dinamizadora';
  if (p.correo && !correoOk(p.correo)) { avisos.push(`${p.nombre}: el correo «${p.correo}» no es válido; queda sin correo.`); p.correo = ''; }
  if (/gmaill\.|hotmial\.|gmal\./.test(p.correo)) avisos.push(`${p.nombre}: revisa el correo «${p.correo}» (parece mal escrito).`);
  if (!p.correo) avisos.push(`${p.nombre}: sin correo. Activará su cuenta con un código que le genere la Secretaría.`);
  if (rol === 'dinamizadora' && p.departamento === 'Cesar') avisos.push(`${p.nombre}: Cesar → satélite Valledupar por defecto. Cámbialo a "pueblo-bello" si corresponde.`);
  return {
    cedula: p.cedula, nombre: p.nombre, rol, cargo: p.cargo || null, correo: p.correo || null, celular: p.celular || null,
    departamento: p.departamento, satelite: rol === 'dinamizadora' ? SATELITE[p.departamento] || null : null,
  };
});

const sinCedula = personas.filter((p) => p.cedula.length < 5);
sinCedula.forEach((p) => avisos.push(`${p.nombre}: SIN CÉDULA, no se puede cargar.`));
const repetidas = personas.filter((p, i) => personas.findIndex((x) => x.cedula === p.cedula) !== i);
repetidas.forEach((p) => avisos.push(`${p.nombre}: cédula repetida (${p.cedula}).`));
const validas = personas.filter((p) => p.cedula.length >= 5 && !repetidas.includes(p));

// Personas adicionales (por ejemplo, cuentas de prueba): personas_extra.json en la misma carpeta de la salida
const extra = path.join(path.dirname(salida), 'personas_extra.json');
if (fs.existsSync(extra)) {
  for (const p of JSON.parse(fs.readFileSync(extra, 'utf8'))) {
    if (validas.some((x) => x.cedula === p.cedula)) { avisos.push(`personas_extra.json: la cédula ${p.cedula} ya está en el Excel; se deja la del Excel.`); continue; }
    validas.push(p);
  }
  avisos.push(`Se agregaron las personas de personas_extra.json.`);
}
fs.mkdirSync(path.dirname(salida), { recursive: true });
fs.writeFileSync(salida, JSON.stringify(validas, null, 2));
console.log(`Listo: ${validas.length} personas (${validas.filter((p) => p.rol === 'secretaria').length} de la Secretaría, ${validas.filter((p) => p.rol === 'dinamizadora').length} dinamizadoras) → ${salida}`);
if (avisos.length) console.log('\nRevisa:\n- ' + avisos.join('\n- '));
