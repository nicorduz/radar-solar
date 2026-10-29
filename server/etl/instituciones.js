// Construye los datos de colegios, sedes de salud, calidad del servicio por operador,
// capacidad de conexión por subestación (UPME) e importaciones de paneles y baterías.
//
// Uso (desde la raíz del proyecto):
//   node server/etl/instituciones.js <carpeta con los archivos fuente> data/built
//
// Archivos fuente esperados en la carpeta (se aceptan con prefijos o fechas en el nombre):
//   *MEN_SEDES_EDUCATIVAS*.csv                     Sedes educativas (MEN, datos.gov.co)
//   *Registro_Especial_de_Prestadores*.csv         Sedes de salud (REPS, MinSalud)
//   *Calidad_SAIDI_SAIFI*.xlsx                     SAIDI y SAIFI por operador (CREG, Circular 254 de 2026)
//   *UPME_capacidad_conexion*.xlsx                 Capacidad de conexión por barra (UPME, tablero 2026-2027)
//   *Importaciones_paneles*.xlsx                   Importaciones de paneles y baterías (DANE, IMPO)
// Genera: colegios.json, salud.json y energia.json en la carpeta de salida.
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';

const [, , SRC = 'data/raw', OUT = 'data/built'] = process.argv;
const find = (re) => { const f = fs.readdirSync(SRC).find((x) => re.test(x)); return f ? path.join(SRC, f) : null; };
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\(.*?\)/g, ' ').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const num = (s) => { const v = parseFloat(String(s ?? '').replace(/,/g, '')); return Number.isFinite(v) ? v : null; };
const code5 = (s) => String(s ?? '').replace(/\D/g, '').padStart(5, '0').slice(-5);
const NIT_EMPRESA = /^[89]\d{8}$/;
const write = (name, data) => { fs.writeFileSync(path.join(OUT, name), JSON.stringify(data)); console.log(`${name}: ${(fs.statSync(path.join(OUT, name)).size / 1e6).toFixed(1)} MB`); };
const readCsv = (f) => Papa.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data;
const cellVal = (c) => { const v = c?.value; if (v && typeof v === 'object') return v.result ?? v.text ?? (v.richText ? v.richText.map((r) => r.text).join('') : null); return v ?? null; };
async function sheetRows(file, sheetName, fromRow = 1) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(sheetName);
  const rows = [];
  ws.eachRow((row, i) => { if (i >= fromRow) rows.push(row.values.slice(1).map((_, k) => cellVal(row.getCell(k + 1)))); });
  return rows;
}

const municipios = JSON.parse(fs.readFileSync(path.join(OUT, 'municipios.json'), 'utf8'));
const muniCodes = new Set(municipios.map((m) => m.code));

// ---------------- Colegios (MEN) ----------------
const menFile = find(/MEN_SEDES_EDUCATIVAS.*\.csv$/i);
if (menFile) {
  const rows = readCsv(menFile);
  const anio = Math.max(...rows.map((r) => num(r['AÑO']) || 0));
  const col = [];
  for (const r of rows) {
    if (num(r['AÑO']) !== anio) continue;
    const code = code5(r.COD_DANE_MUNICIPIO);
    if (!muniCodes.has(code)) continue;
    let lat = num(r.COORDENADA_Y_SEDE), lon = num(r.COORDENADA_X_SEDE);
    // Coordenadas vacías, en cero o fuera de Colombia: se dejan sin ubicación
    if (!(lat > -5 && lat < 14 && lon > -82 && lon < -66)) { lat = null; lon = null; }
    col.push({
      id: String(r.SEDE_ID || '').replace(/\D/g, ''), code, n: (r.NOMBRE_SEDE || '').trim(), est: (r.NOMBRE_ESTABLECIMIENTO || '').trim(),
      sec: r.CTE_ID_SECTOR === 'OFICIAL' ? 'O' : 'P', z: r.ZONA === 'RURAL' ? 'R' : 'U', mat: num(r.TOTAL_MATRICULA) || 0,
      p: r.PRINCIPAL === 'S' ? 1 : 0, dir: (r.DIRECCION || '').trim() || null, lat, lon,
    });
  }
  write('colegios.json', { anio, rows: col });
}

// ---------------- Sedes de salud (REPS) ----------------
const repsFile = find(/Registro_Especial_de_Prestadores.*\.csv$/i);
if (repsFile) {
  const rows = readCsv(repsFile);
  // "Fecha corte REPS: Mar 12 2026  3:11PM" → "12 mar. 2026"
  const MES = { Jan: 'ene.', Feb: 'feb.', Mar: 'mar.', Apr: 'abr.', May: 'may.', Jun: 'jun.', Jul: 'jul.', Aug: 'ago.', Sep: 'sep.', Oct: 'oct.', Nov: 'nov.', Dec: 'dic.' };
  const fc = (rows[0]?.FechaCorte || '').match(/([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{4})/);
  const corte = fc ? `${fc[2]} ${MES[fc[1]] || fc[1]} ${fc[3]}` : null;
  const CLASE = { 'Instituciones Prestadoras de Servicios de Salud - IPS': 'IPS', 'Objeto Social Diferente a la Prestación de Servicios de Salud': 'Objeto social diferente' };
  const sal = [];
  for (const r of rows) {
    const clase = CLASE[r.ClasePrestadorDesc];
    if (!clase) continue; // se excluyen profesionales independientes y transporte de pacientes
    const code = code5(r.MunicipioSede);
    if (!muniCodes.has(code)) continue;
    const nit = r.TipoIdentificacion === 'NI' ? String(r.NumeroIdentificacion || '').replace(/\D/g, '') : null;
    const empresa = nit && NIT_EMPRESA.test(nit);
    const nombre = `${r.NombreSede} ${r.NombrePrestador}`;
    const tipo = /CENTRO DE SALUD|PUESTO DE SALUD/i.test(r.NombreSede) ? 'centro' : /ODONTO|DENTAL|ORAL|EST[EÉ]TIC|OPT[OÓ]M|OFTALM|VETERIN|LABORATORIO/i.test(r.NombreSede) ? 'ips' : /HOSPITAL|E\.?\s?S\.?\s?E\b|CLINICA|CLÍNICA/i.test(nombre) ? 'hospital' : 'ips';
    sal.push({
      id: r.CodigoHabilitacionSede, code, n: (r.NombreSede || '').trim(), pr: (r.NombrePrestador || '').trim(), nit: empresa ? nit : null,
      nat: r.NaturalezaJuridica, ese: r.ESE === 'SI' ? 1 : 0, clase, tipo, dir: (r.DireccionSede || '').trim() || null,
      tel: empresa ? (r.TelefonoSede || r.TelefonoPrestador || '').trim() || null : null,
      mail: empresa ? (r.EmailSede || r.EmailPrestador || '').trim().toLowerCase() || null : null,
    });
  }
  write('salud.json', { corte, rows: sal });
}

// ---------------- Energía: calidad, capacidad de conexión e importaciones ----------------
const energia = fs.existsSync(path.join(OUT, 'energia.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'energia.json'), 'utf8')) : {};
const YEARS = ['2019', '2020', '2021', '2022', '2023', '2024', '2025'];

const calFile = find(/Calidad_SAIDI_SAIFI.*\.xlsx$/i);
if (calFile) {
  const ors = {};
  for (const ind of ['SAIDI', 'SAIFI']) {
    for (const r of await sheetRows(calFile, ind, 5)) {
      const [or, tipo, ref, ...vals] = r;
      if (!or || !tipo) continue;
      const o = (ors[or] ||= { or });
      const k = `${ind.toLowerCase()}${tipo.startsWith('Meta') ? '_meta' : ''}`;
      o[k] = Object.fromEntries(YEARS.map((y, i) => [y, typeof vals[i] === 'number' ? +vals[i].toFixed(2) : null]));
      if (!tipo.startsWith('Meta') && typeof ref === 'number') o[`${ind.toLowerCase()}_ref`] = ref;
    }
  }
  energia.calidad = { anio: '2024', parcial: '2025 (a septiembre)', ors: Object.values(ors) };
}

const capFile = find(/UPME_capacidad_conexion.*\.xlsx$/i);
if (capFile) {
  const red = JSON.parse(fs.readFileSync(path.join(OUT, 'red.json'), 'utf8'));
  const subs = red.subs.map((s) => ({ ...s, k: norm(s.n) }));
  const byName = new Map();
  for (const s of subs) if (!byName.has(s.k)) byName.set(s.k, s);
  const ALIAS = { NV: 'NUEVA', NVA: 'NUEVA', BMANGA: 'BUCARAMANGA', BGRANDE: 'BARRANQUILLA', CUESTECITA: 'CUESTECITAS' };
  const ubicar = (nombre) => {
    let k = norm(nombre).replace(/\b\d+(\.\d+)?\s*KV\b/g, '').replace(/\b(I|II|III|1|2|3)\b$/, '').trim();
    k = k.split(' ').map((w) => ALIAS[w] || w).join(' ');
    if (byName.has(k)) return byName.get(k);
    const pref = subs.filter((s) => s.k.startsWith(k + ' ') || k.startsWith(s.k + ' '));
    return pref.length === 1 ? pref[0] : null;
  };
  const rows = await sheetRows(capFile, 'Capacidad por barra', 2);
  const by = {};
  for (const [barra, sub, kv, anio, p100, p95] of rows) {
    if (!barra) continue;
    const b = (by[barra] ||= { n: barra, sub, kv: num(kv) });
    b[`p100_${anio}`] = num(p100); b[`p95_${anio}`] = num(p95);
  }
  let ok = 0;
  const barras = Object.values(by).map((b) => {
    const s = ubicar(b.sub);
    if (s) ok++;
    return { ...b, lat: s?.lat ?? null, lon: s?.lon ?? null, op: s?.op ?? null, dpto: s?.dpto ?? null };
  });
  energia.capacidad = { fecha: '2026-10-13', barras };
  console.log(`Capacidad UPME: ${barras.length} barras, ${ok} ubicadas en el mapa`);
}

const impFile = find(/Importaciones_paneles.*\.xlsx$/i);
if (impFile) {
  const rows = await sheetRows(impFile, 'Datos', 2);
  // Columnas: Año, Mes, Nombre mes, Producto, Subpartida, País origen, País procedencia, Depto destino, Lugar ingreso, Unidad, Cantidad, Peso, FOB, CIF USD, CIF COP
  const mensual = {}, dptos = {}, paises = {};
  for (const r of rows) {
    const [anio, mes, , prod, , pais, , dpto, , , cant, , , cif] = r;
    if (!anio) continue;
    const p = `${anio}-${String(mes).padStart(2, '0')}`;
    const m = (mensual[p] ||= { p, pan_u: 0, pan_usd: 0, bat_usd: 0 });
    if (prod === 'Paneles solares') {
      m.pan_u += cant || 0; m.pan_usd += cif || 0;
      const d = (dptos[dpto] ||= { dpto, u: {}, usd: {} });
      d.u[anio] = (d.u[anio] || 0) + (cant || 0); d.usd[anio] = (d.usd[anio] || 0) + (cif || 0);
      const c = (paises[pais] ||= { pais, usd: 0 }); c.usd += cif || 0;
    } else m.bat_usd += cif || 0;
  }
  const r0 = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v)]));
  const meses = Object.values(mensual).sort((a, b) => a.p.localeCompare(b.p)).map((m) => ({ ...m, pan_u: Math.round(m.pan_u), pan_usd: Math.round(m.pan_usd), bat_usd: Math.round(m.bat_usd) }));
  energia.importaciones = {
    desde: meses[0]?.p, hasta: meses[meses.length - 1]?.p, w_panel: 580, mensual: meses,
    dptos: Object.values(dptos).map((d) => ({ dpto: d.dpto, u: r0(d.u), usd: r0(d.usd) })).sort((a, b) => (b.usd['2026'] || 0) - (a.usd['2026'] || 0)),
    paises: Object.values(paises).map((c) => ({ ...c, usd: Math.round(c.usd) })).sort((a, b) => b.usd - a.usd).slice(0, 10),
  };
}
write('energia.json', energia);
