// Demo de transformadores de distribución (Resolución CREG 174 de 2021, art. 7) y límites de municipios y departamentos.
//
// Uso (desde la raíz del proyecto):
//   node server/etl/trafos.js <carpeta con los archivos fuente> data/built
//
// Archivos fuente esperados en la carpeta (cada operador entrega un formato distinto):
//   EPM_transformadores.csv                    Capa "Transformador" del visor de redes de EPM (ArcGIS público)
//   Afinia_Base_Transformadores.xlsx           Base de transformadores de Afinia (Caribemar)
//   Transformadores-de-distribucion-CELSIA.xlsx Hojas "Transformadores Valle" y "Transformadores Tolima"
//   CEO_DISPONIBILIDAD_CREG_174.xlsm           Hoja "BD" de CEO
//   DISPAC_transformadores.xlsx                Hoja "Transformadores" extraída del visor de DISPAC
//   muni.json                                  Límites municipales (MGN DANE, simplificado) con propiedades code y d
// Genera: trafos_demo.json, geo_municipios.json y geo_dptos.json en la carpeta de salida.
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';

const [, , SRC = 'data/raw/trafos', OUT = 'data/built'] = process.argv;
const has = (f) => fs.existsSync(path.join(SRC, f));
const num = (v) => { if (v == null || v === '') return null; const x = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);
const cellVal = (c) => { const v = c?.value; if (v && typeof v === 'object') return v.result ?? v.text ?? (v.richText ? v.richText.map((r) => r.text).join('') : null); return v ?? null; };
async function sheet(file, name) {
  try { return await sheetFull(file, name); } catch {
    // Algunos archivos traen tablas que el lector completo no soporta: se leen en modo flujo
    const rows = [];
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(file, { worksheets: 'emit', sharedStrings: 'cache', hyperlinks: 'ignore', styles: 'ignore' });
    for await (const ws of reader) {
      // En modo flujo las hojas se llaman Sheet1, Sheet2…: se usa la primera
      for await (const row of ws) { const v = row.values; const out = []; for (let k = 1; k <= Math.min(30, v.length - 1); k++) out.push(cellVal({ value: v[k] })); rows.push(out); }
      break;
    }
    return rows;
  }
}
async function sheetFull(file, name) {
  const wb = new ExcelJS.Workbook();
  if (/\.xlsm$/i.test(file)) { const buf = fs.readFileSync(file); await wb.xlsx.load(buf); } else await wb.xlsx.readFile(file);
  const ws = name ? wb.getWorksheet(name) : wb.worksheets[0];
  const rows = [];
  // row.values es disperso y empieza en 1; se toman solo las primeras 30 columnas
  ws.eachRow((row) => { const v = row.values; const out = []; for (let k = 1; k <= Math.min(30, v.length - 1); k++) out.push(cellVal({ value: v[k] })); rows.push(out); });
  return rows;
}

// ---------------- Municipios: polígonos para ubicar cada transformador ----------------
const geo = JSON.parse(fs.readFileSync(path.join(SRC, 'muni.json'), 'utf8'));
const polys = geo.features.map((f) => {
  const rings = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of rings) for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return { code: f.properties.code, rings, bb: [w, s, e, n] };
});
const inRing = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (x, y, rings) => rings.some((p) => inRing(x, y, p[0]) && !p.slice(1).some((h) => inRing(x, y, h)));
// Índice en cuadrícula de 0,1° para no recorrer los 1.122 polígonos por cada punto
const GRID = new Map();
const cell = (x, y) => `${Math.floor(x * 10)}|${Math.floor(y * 10)}`;
for (const p of polys) for (let gx = Math.floor(p.bb[0] * 10); gx <= Math.floor(p.bb[2] * 10); gx++) for (let gy = Math.floor(p.bb[1] * 10); gy <= Math.floor(p.bb[3] * 10); gy++) { const k = `${gx}|${gy}`; if (!GRID.has(k)) GRID.set(k, []); GRID.get(k).push(p); }
let lastHit = null;
function muniOf(x, y) {
  if (lastHit && inPoly(x, y, lastHit.rings)) return lastHit.code;
  for (const p of GRID.get(cell(x, y)) || []) {
    if (x < p.bb[0] || x > p.bb[2] || y < p.bb[1] || y > p.bb[3]) continue;
    if (inPoly(x, y, p.rings)) { lastHit = p; return p.code; }
  }
  return null;
}
const enColombia = (lon, lat) => lat > -4.3 && lat < 13.5 && lon > -82 && lon < -66.8;

// ---------------- Operadores ----------------
const OPS = [];
const rows = [];
function add(op, id, lon, lat, kva, gd, disp, users = null, circ = null) {
  if (!enColombia(lon, lat) || !(kva > 0)) return false;
  const code = muniOf(lon, lat);
  if (!code) return false;
  rows.push([String(id ?? ''), r5(lon), r5(lat), kva, r1(gd), r1(disp), op, code, users, circ]);
  return true;
}
function operador(info, fn) {
  const before = rows.length;
  const idx = OPS.length;
  OPS.push(info);
  fn(idx);
  info.n = rows.length - before;
  console.log(`${info.nombre}: ${info.n} transformadores ubicados`);
}

if (has('EPM_transformadores.csv')) {
  const data = Papa.parse(fs.readFileSync(path.join(SRC, 'EPM_transformadores.csv'), 'utf8'), { header: true, skipEmptyLines: true }).data;
  operador({ op: 'EPM', nombre: 'EPM', zona: 'Antioquia', fecha: '2026-10-29', gd: false, disp: false, usuarios: true }, (i) => {
    for (const r of data) if (r.ESTADO === 'OPERACION') add(i, r.NRO_TRANSFORMADOR, num(r.lon), num(r.lat), num(r.CAPACIDAD_NOMINAL), null, null, num(r.USUARIOS_CON_CONT), r.CIRCUITO_CONN || null);
  });
}
if (has('Afinia_Base_Transformadores.xlsx')) {
  const data = await sheet(path.join(SRC, 'Afinia_Base_Transformadores.xlsx'));
  const h = data.findIndex((r) => r[0] === 'CODIGO TRANSFORMADOR');
  operador({ op: 'Afinia', nombre: 'Afinia (Caribemar)', zona: 'Bolívar, Córdoba, Sucre, Cesar y sur del Magdalena', fecha: '2026-10', gd: false, disp: false }, (i) => {
    for (const r of data.slice(h + 1)) add(i, r[1] || r[0], num(r[4]), num(r[5]), num(r[7]), null, null);
  });
}
if (has('Transformadores-de-distribucion-CELSIA.xlsx')) {
  for (const [hoja, zona, nombre] of [['Transformadores Valle', 'Valle del Cauca', 'Celsia Valle'], ['Transformadores Tolima', 'Tolima', 'Celsia Tolima']]) {
    const data = await sheet(path.join(SRC, 'Transformadores-de-distribucion-CELSIA.xlsx'), hoja);
    operador({ op: nombre, nombre, zona, fecha: '2026-10', gd: true, disp: false }, (i) => {
      for (const r of data.slice(1)) add(i, r[2] ?? r[0], num(r[6]), num(r[7]), num(r[3]), num(r[8]) ?? 0, null);
    });
  }
}
if (has('CEO_DISPONIBILIDAD_CREG_174.xlsm')) {
  const data = await sheet(path.join(SRC, 'CEO_DISPONIBILIDAD_CREG_174.xlsm'), 'BD');
  operador({ op: 'CEO', nombre: 'CEO', zona: 'Cauca', fecha: '2026-10', gd: true, disp: true }, (i) => {
    // Columnas: código GIS, código SSPD, código, kVA, tensión primaria, secundaria, longitud, latitud, 50 % kVA, CD kW, ..., SPMAXD kW
    for (const r of data.slice(2)) if (r[2] && !/BORRAR/i.test(r[2])) add(i, r[2], num(r[6]), num(r[7]), num(r[3]), num(r[12]) ?? 0, num(r[9]));
  });
}
if (has('DISPAC_transformadores.xlsx')) {
  const data = await sheet(path.join(SRC, 'DISPAC_transformadores.xlsx'), 'Transformadores');
  operador({ op: 'DISPAC', nombre: 'DISPAC', zona: 'Chocó', fecha: '2026-10-29', gd: false, disp: true }, (i) => {
    // Columnas: registro, nombre, ubicación, vía, latitud, longitud, …, capacidad kVA (11), disponible kVA (13)
    for (const r of data.slice(1)) add(i, r[7], num(r[5]), num(r[4]), num(r[11]), null, num(r[13]));
  });
}

const munis = {};
for (const r of rows) munis[r[7]] = (munis[r[7]] || 0) + 1;
// Se guarda por columnas: el servidor lo lee rápido y ocupa poca memoria
const col = (k) => rows.map((r) => r[k]);
fs.writeFileSync(path.join(OUT, 'trafos_demo.json'), JSON.stringify({
  nota: 'Demo con los datos de transformadores que publican algunos operadores de red (Resolución CREG 174 de 2021, art. 7).',
  formato: 'columnas', operadores: OPS, municipios: munis,
  id: col(0), lon: col(1), lat: col(2), kva: col(3), gd: col(4), disp: col(5), op: col(6), code: col(7), us: col(8), circ: col(9),
}));
console.log(`trafos_demo.json: ${rows.length} transformadores en ${Object.keys(munis).length} municipios, ${(fs.statSync(path.join(OUT, 'trafos_demo.json')).size / 1e6).toFixed(1)} MB`);

// ---------------- Límites para el mapa ----------------
fs.copyFileSync(path.join(SRC, 'muni.json'), path.join(OUT, 'geo_municipios.json'));
if (has('dpto.json')) fs.copyFileSync(path.join(SRC, 'dpto.json'), path.join(OUT, 'geo_dptos.json'));
