// Lee el reporte de precios/facturación exportado del SUI (Superservicios).
// Formato esperado (exportación de "Reportes del sector → Energía → Comercial"): columnas
// Año | Departamento | Empresa | Tipo de usuario | Estrato | Facturación por consumo | Consumo total (kWh) |
// Número de suscriptores | Contribuciones | ... | Promedio de consumo (kWh/suscriptor) | Valor facturado por kWh | Número de periodos ...
// Las celdas vacías heredan el valor de la fila anterior (tabla dinámica).
import ExcelJS from 'exceljs';

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
// Algunas exportaciones del SUI traen números con formato de fecha: se recupera el valor original.
const asNum = (v) => {
  if (v == null) return null;
  if (v instanceof Date) return (v.getTime() - EXCEL_EPOCH) / 864e5;
  if (typeof v === 'object') { if ('result' in v) return asNum(v.result); if ('error' in v) return null; }
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};
const asText = (v) => (v == null ? null : typeof v === 'object' ? (v.richText ? v.richText.map((t) => t.text).join('') : v.text ?? null) : String(v).trim());

export async function parseSuiPrecios(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  // Ubicar la fila de encabezados (la que contiene "Empresa" y "Estrato")
  let headerRow = null;
  ws.eachRow((row, i) => {
    if (headerRow) return;
    const vals = row.values.map((v) => (asText(v) || '').toLowerCase());
    if (vals.some((v) => v === 'empresa') && vals.some((v) => v.startsWith('estrato')) && vals.some((v) => v.startsWith('consumo total'))) headerRow = i;
  });
  if (!headerRow) throw new Error('No se encontró la fila de encabezados (Empresa / Estrato) en el archivo del SUI');
  const head = ws.getRow(headerRow).values.map((v) => (asText(v) || '').toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const C = {
    anio: col(/^a[ñn]o/), dpto: col(/^departamento/), empresa: col(/^empresa/), tipo: col(/tipo de usuario/), estrato: col(/^estrato/),
    fact: col(/^facturaci[oó]n por consumo/), kwh: col(/^consumo total/), sus: col(/suscriptores/), contrib: col(/^contribuciones/),
    kwhSus: col(/promedio de consumo/), copKwh: col(/valor facturado por kw/), periodos: col(/n[uú]mero de periodos/),
  };
  if (C.empresa < 0 || C.estrato < 0) throw new Error('El archivo del SUI no tiene las columnas esperadas');
  const out = [];
  const cur = {};
  ws.eachRow((row, i) => {
    if (i <= headerRow) return;
    const v = row.values;
    const first = asText(v[1]);
    if (first === 'Total' || asText(v[2]) === 'Suma') return;
    for (const k of ['anio', 'dpto', 'empresa', 'tipo']) { const t = asText(v[C[k]]); if (C[k] > 0 && t) cur[k] = t; }
    const estrato = asText(v[C.estrato]);
    if (!estrato) return;
    const kwh = asNum(v[C.kwh]);
    const fact = asNum(v[C.fact]);
    const sus = asNum(v[C.sus]);
    let cop = asNum(v[C.copKwh]);
    if ((!cop || cop > 5000) && fact && kwh) cop = fact / kwh; // recalcular si la celda viene dañada
    out.push({
      anio: cur.anio, dpto: cur.dpto, empresa: cur.empresa, tipo: cur.tipo, estrato,
      fact_consumo: fact, consumo_kwh: kwh, suscriptores: sus, contribuciones: asNum(v[C.contrib]),
      prom_kwh_sus: asNum(v[C.kwhSus]) ?? (kwh && sus ? kwh / sus : null), cop_kwh: cop, periodos: asNum(v[C.periodos]),
    });
  });
  return out;
}
