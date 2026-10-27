// Registro de proyectos de generación de la UPME: "Informe de registros activos" (Excel mensual en upme.gov.co → SIMEC).
// Columnas: Código Proyecto | Marco normativo | Fecha inscripción | Fecha límite de validez | Nombre | Fase | Tipo | Recurso |
// Tecnología | Capacidad [MW] | Departamento | Municipio | Fecha de inicio de construcción | Fecha de entrada en operación
import ExcelJS from 'exceljs';

const txt = (v) => String(v == null || v instanceof Date ? '' : typeof v === 'object' ? (v.richText ? v.richText.map((t) => t.text).join('') : v.text ?? v.result ?? '') : v).trim();
const day = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : /^\d{4}-\d{2}-\d{2}/.test(txt(v)) ? txt(v).slice(0, 10) : null);
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function parseUpme(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  let head = null, headRow = 0, corte = null;
  ws.eachRow((row, i) => {
    const vals = Array.from(row.values, (v) => strip(txt(v)));
    const t = vals.find((v) => v.includes('corte a'));
    if (t && !corte) corte = t.replace(/[\s\S]*corte a\s*/, '').trim();
    if (!head && vals.some((v) => v.startsWith('codigo proyecto')) && vals.some((v) => v.startsWith('capacidad'))) { head = vals; headRow = i; }
  });
  if (!head) throw new Error('No se encontró la fila de encabezados (Código Proyecto / Capacidad) del informe de la UPME');
  const col = (re) => head.findIndex((h) => re.test(h));
  const C = { cod: col(/^codigo proyecto/), insc: col(/inscripcion/), valid: col(/validez/), nom: col(/^nombre/), fase: col(/^fase/), tipo: col(/^tipo/),
    tec: col(/^tecnologia/), mw: col(/^capacidad/), dpto: col(/^departamento/), mun: col(/^municipio/), ini: col(/inicio de construccion/), op: col(/entrada en operacion/) };
  const out = [];
  ws.eachRow((row, i) => {
    if (i <= headRow) return;
    const v = row.values;
    const nombre = txt(v[C.nom]); if (!nombre) return;
    const mw = parseFloat(String(txt(v[C.mw])).replace(',', '.'));
    out.push({
      id: txt(v[C.cod]), n: nombre, fase: txt(v[C.fase]), tipo: txt(v[C.tipo]), tec: txt(v[C.tec]), mw: Number.isFinite(mw) ? mw : null,
      dpto: txt(v[C.dpto]), mun: txt(v[C.mun]), inscrito: day(v[C.insc]), vence: day(v[C.valid]), inicio: day(v[C.ini]), operacion: day(v[C.op]),
    });
  });
  return { corte, rows: out };
}
