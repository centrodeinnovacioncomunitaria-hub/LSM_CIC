// Genera herramientas/MapaCaribe.pm con los contornos reales (simplificados) de los 7 departamentos del Caribe
// colombiano, proyectados al mismo sistema de coordenadas que usan los satélites del mapa.
// Uso: node herramientas/generar_mapa.js <Colombia.geo.json>
// Fuente de los contornos: GeoJSON de departamentos de Colombia (DANE, publicado por John Guerra).
const fs = require('fs');
const path = require('path');
const archivo = process.argv[2];
if (!archivo) { console.error('Uso: node generar_mapa.js <Colombia.geo.json>'); process.exit(1); }
const geo = JSON.parse(fs.readFileSync(archivo, 'utf8'));

// Proyección: la misma de Datos.pm → x = (lon + 77) * 100 + 20 ; y = (12.75 - lat) * 100
const xy = ([lon, lat]) => [(lon + 77) * 100 + 20, (12.75 - lat) * 100];
const CARIBE = { 'LA GUAJIRA': 'La Guajira', MAGDALENA: 'Magdalena', CESAR: 'Cesar', ATLANTICO: 'Atlántico', BOLIVAR: 'Bolívar', SUCRE: 'Sucre', CORDOBA: 'Córdoba' };
// Vecinos en gris claro, solo para dar contexto
const VECINOS = ['ANTIOQUIA', 'NORTE DE SANTANDER', 'SANTANDER', 'CHOCO'];

// Douglas-Peucker para aligerar los contornos
function simplificar(pts, tol) {
  if (pts.length < 3) return pts;
  const d2 = (p, a, b) => {
    const [x, y] = p, [x1, y1] = a, [x2, y2] = b;
    const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy;
    let t = l ? ((x - x1) * dx + (y - y1) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
    const px = x1 + t * dx - x, py = y1 + t * dy - y; return px * px + py * py;
  };
  let max = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = d2(pts[i], pts[0], pts[pts.length - 1]); if (d > max) { max = d; idx = i; } }
  if (max <= tol * tol) return [pts[0], pts[pts.length - 1]];
  return [...simplificar(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplificar(pts.slice(idx), tol)];
}
const anillos = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((pol) => pol[0]);
const areaPx = (r) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
function trazo(feature, tol, minArea) {
  return anillos(feature.geometry)
    .map((r) => simplificar(r.map(xy), tol))
    .filter((r) => r.length > 3 && areaPx(r) >= minArea)
    .map((r) => 'M' + r.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L') + 'Z')
    .join('');
}
// Centro aproximado (del anillo más grande) para la etiqueta del departamento
function centro(feature) {
  const r = anillos(feature.geometry).map((a) => a.map(xy)).sort((a, b) => areaPx(b) - areaPx(a))[0];
  let A = 0, cx = 0, cy = 0;
  r.forEach((p, i) => { const q = r[(i + 1) % r.length]; const f = p[0] * q[1] - q[0] * p[1]; A += f; cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f; });
  return [cx / (3 * A), cy / (3 * A)];
}

const deptos = {}, vecinos = [];
for (const f of geo.features) {
  const n = f.properties.NOMBRE_DPT;
  if (CARIBE[n]) deptos[CARIBE[n]] = { d: trazo(f, 1.2, 2), c: centro(f).map((v) => +v.toFixed(0)) };
  else if (VECINOS.includes(n)) vecinos.push(trazo(f, 2.5, 20));
}
const faltan = Object.values(CARIBE).filter((n) => !deptos[n]);
if (faltan.length) { console.error('Faltan:', faltan); process.exit(1); }

const q = (s) => `'${s.replace(/'/g, "\\'")}'`;
const pm = `# Generado por herramientas/generar_mapa.js a partir del GeoJSON de departamentos de Colombia. No editar a mano.
# Contornos reales simplificados, en el sistema de coordenadas de Datos.pm: x = (lon + 77) * 100 + 20, y = (12.75 - lat) * 100.
package MapaCaribe;
use strict;
use warnings;
use utf8;
use Exporter 'import';
our @EXPORT_OK = qw(%CONTORNOS @VECINOS);
our %CONTORNOS = (
${Object.entries(deptos).map(([n, v]) => `    ${q(n)} => { d => ${q(v.d)}, centro => [${v.c.join(', ')}] },`).join('\n')}
);
our @VECINOS = (
${vecinos.map((d) => `    ${q(d)},`).join('\n')}
);
1;
`;
const salida = path.join(__dirname, 'MapaCaribe.pm');
fs.writeFileSync(salida, pm);
console.log('Escrito', salida, (pm.length / 1024).toFixed(1) + ' KB');
Object.entries(deptos).forEach(([n, v]) => console.log(n, v.c, v.d.length + ' caracteres'));
