// Clientes comerciales e industriales (C&I): las empresas más grandes del país por ingresos,
// con su sector, municipio de domicilio y, cuando existe, el contacto registrado como proveedor del Estado.
import fs from 'node:fs';
import path from 'node:path';

const norm = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const cleanNit = (n) => String(n || '').replace(/\.0+$/, '').replace(/\D/g, '');
const num = (v) => { const n = parseFloat(String(v ?? '').replace(/[$\s]/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

// Sector por división CIIU (dos primeros dígitos) y consumo de energía típico del sector (referencia general)
const SECTORES = [
  [[1, 3], 'Agro y pesca', 'media'], [[5, 9], 'Minería', 'alta'],
  [[10, 12], 'Alimentos y bebidas', 'alta'], [[13, 15], 'Textil y confección', 'alta'], [[16, 18], 'Madera, papel e impresión', 'alta'],
  [[19, 21], 'Refinación, químicos y farmacéuticos', 'alta'], [[22, 22], 'Plásticos y caucho', 'alta'], [[23, 23], 'Cemento, vidrio y cerámica', 'alta'],
  [[24, 25], 'Metalurgia y productos metálicos', 'alta'], [[26, 28], 'Equipos eléctricos y maquinaria', 'alta'], [[29, 30], 'Vehículos y autopartes', 'alta'],
  [[31, 33], 'Otras manufacturas', 'alta'], [[35, 35], 'Energía y gas', 'media'], [[36, 39], 'Agua y residuos', 'alta'],
  [[41, 43], 'Construcción', 'media'], [[45, 46], 'Comercio mayorista y vehículos', 'media'], [[47, 47], 'Comercio minorista y supermercados', 'media'],
  [[49, 51], 'Transporte', 'media'], [[52, 53], 'Bodegas y logística', 'alta'], [[55, 56], 'Hoteles y restaurantes', 'media'],
  [[58, 63], 'Comunicaciones y tecnología', 'media'], [[64, 66], 'Financiero y seguros', 'baja'], [[68, 68], 'Inmobiliario', 'baja'],
  [[69, 75], 'Servicios profesionales', 'baja'], [[77, 82], 'Servicios administrativos', 'baja'], [[84, 84], 'Sector público', 'media'],
  [[85, 85], 'Educación', 'media'], [[86, 88], 'Salud', 'alta'], [[90, 93], 'Entretenimiento y deporte', 'media'], [[94, 99], 'Otros servicios', 'baja'],
];
export function sectorOf(ciiu) {
  const d = Math.floor((parseInt(ciiu, 10) || 0) / 100);
  const s = SECTORES.find(([[a, b]]) => d >= a && d <= b);
  return s ? { sector: s[1], consumo: s[2] } : { sector: 'Otros', consumo: 'baja' };
}

// Descarga (se usa desde la actualización de fuentes del administrador)
export async function fetchGrandesEmpresas(socrata) {
  const anios = await socrata('6cat-2gcs', { $select: 'a_o_de_corte', $group: 'a_o_de_corte', $order: 'a_o_de_corte DESC', $limit: 10 });
  const anio = anios?.[0]?.a_o_de_corte;
  if (!anio) throw new Error('sin años de corte');
  const rows = await socrata('6cat-2gcs', { $where: `a_o_de_corte='${anio}'`, $limit: 20000 });
  if (!rows?.length || rows.length < 1000) throw new Error('respuesta incompleta');
  const nits = [...new Set(rows.map((r) => cleanNit(r.nit)).filter((n) => /^[89]\d{8}$/.test(n)))];
  const contactos = [];
  const sel = 'nit,telefono,correo,sitio_web,municipio,departamento';
  for (let i = 0; i < nits.length; i += 200) {
    const where = `nit in(${nits.slice(i, i + 200).map((n) => `'${n}'`).join(',')})`;
    try { contactos.push(...await socrata('qmzu-gj57', { $select: sel, $where: where, $limit: 5000 })); } catch { /* lote fallido: se sigue */ }
  }
  return { anio: String(Math.round(+anio)), rows, contactos };
}

// Construcción: devuelve la lista de empresas C&I con municipio
export function buildCI(rawDir, munis) {
  const f = path.join(rawDir, 'grandes_empresas.json');
  if (!fs.existsSync(f)) return { anio: null, empresas: [] };
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  const byName = new Map();
  for (const m of munis) {
    const k = norm(m.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(m);
  }
  const ALIAS = {
    'BOGOTA D C': '11001', BOGOTA: '11001', CARTAGENA: '13001', CUCUTA: '54001', 'SANTA MARTA': '47001', 'SAN JOSE DE CUCUTA': '54001',
    CALI: '76001', BUGA: '76111', UBATE: '25843', 'CARMEN DE VIBORAL': '05148', 'EL ESPINAL': '73268', TUMACO: '52835',
    GIRALDOTA: '05308', GIRARDOTA: '05308', 'MITU VAUPES': '97001', MITU: '97001', TOLUVIEJO: '70823', ITSMINA: '27361', ISTMINA: '27361',
  };
  const findCode = (city, dpto) => {
    const c = norm(city).replace(/ D C$/, '').trim();
    if (ALIAS[c] || ALIAS[norm(city)]) return ALIAS[c] || ALIAS[norm(city)];
    const list = byName.get(c) || byName.get(c.split(' (')[0]) || [];
    if (list.length === 1) return list[0].code;
    const d = norm(dpto);
    return (list.find((m) => d && (norm(m.dpto).includes(d) || d.includes(norm(m.dpto)))) || list[0])?.code || null;
  };
  const contact = new Map();
  for (const c of raw.contactos || []) {
    const n = cleanNit(c.nit);
    if (!n || contact.has(n)) continue;
    const ok = (v) => (v && !/no provisto|no definido/i.test(v) ? v : null);
    contact.set(n, { tel: ok(c.telefono), mail: ok(c.correo)?.toLowerCase(), web: ok(c.sitio_web) });
  }
  const empresas = [];
  for (const r of raw.rows) {
    const nit = cleanNit(r.nit);
    const ciiu = String(parseInt(r.ciiu, 10) || '').padStart(4, '0');
    const { sector, consumo } = sectorOf(ciiu);
    const ing = num(r.ingresos_operacionales); // billones de pesos
    const ct = /^[89]\d{8}$/.test(nit) ? contact.get(nit) : null; // contacto solo para personas jurídicas
    empresas.push({
      n: String(r.raz_n_social || '').trim(), nit, ciiu, sector, consumo, macro: r.macrosector,
      code: findCode(r.ciudad_domicilio, r.departamento_domicilio), ciudad: r.ciudad_domicilio,
      ing: ing != null ? Math.round(ing * 1000) : null, // miles de millones de pesos
      act: num(r.total_activos) != null ? Math.round(num(r.total_activos) * 1000) : null,
      tel: ct?.tel || null, mail: ct?.mail || null, web: ct?.web || null,
    });
  }
  empresas.sort((a, b) => (b.ing || 0) - (a.ing || 0));
  empresas.forEach((e, i) => { e.rank = i + 1; });
  return { anio: raw.anio, empresas };
}
