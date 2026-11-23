// Oportunidad solar de cada colegio y sede de salud: puntaje de 0 a 100, razones y cómo abordarla.
// Combina el tamaño de la institución con el contexto de su municipio (tarifa, sol, cortes, operador de red).
// Supuestos de la plataforma (se muestran en la página):
//   - Un colegio consume unos 3 kWh por estudiante al mes (urbano) y 2 (rural); se ajusta con la factura.
//   - El sistema sugerido cubre el 70 % del consumo con un rendimiento de 0,78 sobre la radiación del sitio.
import { store, calidadOR } from './data.js';

const clamp = (x) => Math.max(0, Math.min(1, x));
const KWH_EST = { U: 3, R: 2 };
let ctxCache = null;

// Percentil de cortes (energía no suministrada por 1.000 habitantes) entre municipios
function contexto() {
  if (ctxCache?.n === store.municipios.length) return ctxCache;
  const dna = store.municipios.map((m) => m.dna_1k).filter((v) => v != null).sort((a, b) => a - b);
  const pct = (v) => { if (v == null || !dna.length) return 0.5; let lo = 0, hi = dna.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (dna[mid] < v) lo = mid + 1; else hi = mid; } return lo / dna.length; };
  const mun = new Map();
  for (const m of store.municipios) {
    const q = calidadOR(m.or_name);
    const anio = store.energia.calidad?.anio;
    mun.set(m.code, {
      name: m.name, dpto: m.dpto, or: m.or_name, subarea: m.subarea,
      tarifa: m.tarifa_com ?? m.tarifa ?? null, ghi: m.ghi ?? null,
      cortes: pct(m.dna_1k), saidi: q?.saidi?.[anio] ?? null, saidiAnio: anio,
    });
  }
  ctxCache = { n: store.municipios.length, mun };
  return ctxCache;
}

// Formateadores reutilizados: crear uno por llamada (toLocaleString) era lo que volvía lenta la página
const NF = [0, 1, 2].map((d) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: d, minimumFractionDigits: d }));
const fmt = (n, d = 0) => (n == null ? 's/d' : NF[d].format(Number(n)));

export function oportunidadColegio(c) {
  const z = contexto().mun.get(c.code) || {};
  const kwhMes = Math.round((c.mat || 0) * (KWH_EST[c.z] || 3));
  const ghi = z.ghi || 4.5;
  const kwp = Math.max(1, Math.round(((kwhMes * 0.7) / (ghi * 30 * 0.78)) * 10) / 10);
  const ahorro = z.tarifa ? Math.round(kwp * ghi * 0.78 * 365 * z.tarifa) : null;
  const f = {
    tam: clamp(Math.log10(Math.max(1, c.mat) / 50) / Math.log10(3000 / 50)),
    tarifa: z.tarifa ? clamp((z.tarifa - 750) / 200) : 0.5,
    sol: clamp((ghi - 3.8) / 1.8),
    cortes: z.cortes ?? 0.5,
    red: kwp <= 100 ? 1 : 0.6,
    decide: c.sec === 'O' ? 0.55 : 1,
  };
  const score = Math.round(100 * (0.3 * f.tam + 0.2 * f.tarifa + 0.15 * f.sol + 0.15 * f.cortes + 0.1 * f.red + 0.1 * f.decide));
  const r = [];
  if (f.tam >= 0.5) r.push([f.tam, `${fmt(c.mat)} estudiantes: unos ${fmt(kwhMes)} kWh al mes`]);
  if (f.tarifa >= 0.6) r.push([f.tarifa, `Tarifa alta en ${z.name}: $${fmt(z.tarifa)} por kWh`]);
  if (f.cortes >= 0.66) r.push([f.cortes, `Zona con muchos cortes${z.saidi != null ? `: ${z.or} promedió ${fmt(z.saidi, 0)} horas sin luz por usuario en ${z.saidiAnio}` : ''}`]);
  if (f.sol >= 0.65) r.push([f.sol, `Buen sol: ${fmt(ghi, 1)} kWh/m² al día`]);
  if (c.sec !== 'O') r.push([0.7, 'Privado: decide la rectoría o la junta, sin licitación']);
  if (kwp <= 100) r.push([0.5, `Sistema de unos ${fmt(kwp, 0)} kWp: conexión sin estudio`]);
  else r.push([0.4, `Sistema de unos ${fmt(kwp, 0)} kWp: necesita estudio de conexión`]);
  let via;
  if (c.sec !== 'O') via = f.cortes >= 0.66 ? 'Rectoría o administración. Ofrece solar con baterías y pago con el ahorro (renting o PPA) para que no ponga la inversión.' : 'Rectoría o administración. Ofrece pago con el ahorro (renting o PPA) para que no ponga la inversión.';
  else if (c.z === 'R' && f.cortes >= 0.5) via = 'Secretaría de Educación o alcaldía. Solar con baterías para no perder clases por cortes; suele financiarse con regalías o recursos del FENOGE.';
  else via = 'Secretaría de Educación del municipio o departamento. Agrupa las sedes de la misma institución en una sola propuesta y sigue sus licitaciones en SECOP.';
  return { score, kwh_mes: kwhMes, kwp, ahorro, razones: r.sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]), via, f };
}

const TAM_SALUD = { hospital: 1, centro: 0.55, ips: 0.35 };
export function oportunidadSalud(s) {
  const z = contexto().mun.get(s.code) || {};
  const ghi = z.ghi || 4.5;
  const pub = s.nat === 'Pública';
  const f = {
    tam: TAM_SALUD[s.tipo] ?? 0.35,
    cortes: z.cortes ?? 0.5,
    tarifa: z.tarifa ? clamp((z.tarifa - 750) / 200) : 0.5,
    sol: clamp((ghi - 3.8) / 1.8),
    decide: pub ? 0.7 : 1,
    contacto: s.nit ? 1 : 0.4,
  };
  const score = Math.round(100 * (0.3 * f.tam + 0.2 * f.cortes + 0.2 * f.tarifa + 0.1 * f.sol + 0.1 * f.decide + 0.1 * f.contacto));
  const r = [];
  if (s.tipo === 'hospital') r.push([1, 'Hospital o clínica: consumo las 24 horas y equipos que no pueden apagarse']);
  if (f.cortes >= 0.66) r.push([f.cortes, `Zona con muchos cortes${z.saidi != null ? `: ${z.or} promedió ${fmt(z.saidi, 0)} horas sin luz por usuario en ${z.saidiAnio}` : ''}`]);
  if (f.tarifa >= 0.6) r.push([f.tarifa, `Tarifa alta en ${z.name}: $${fmt(z.tarifa)} por kWh`]);
  if (f.sol >= 0.65) r.push([f.sol, `Buen sol: ${fmt(ghi, 1)} kWh/m² al día`]);
  if (!pub) r.push([0.6, 'Privada: decide la gerencia, sin licitación']);
  if (s.ese) r.push([0.5, 'ESE: contrata con su propio manual de contratación']);
  let via;
  if (!pub) via = 'Gerencia o administración. Propón solar con respaldo para los equipos críticos y pago con el ahorro.';
  else if (s.tipo === 'hospital') via = 'Gerencia de la ESE. Propón solar con respaldo para urgencias, quirófanos y cadena de frío; contrata con su manual propio.';
  else via = 'La ESE de la que depende o la alcaldía. Paquete pequeño de solar con baterías para vacunas y atención sin cortes.';
  return { score, razones: r.sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]), via, f };
}

// Segmentos para abordar el listado filtrado, con cuántas instituciones y los mejores ejemplos
export function segmentos(tipo, rows) {
  const usados = new Set();
  const mk = (id, titulo, como, filtro) => {
    const xs = rows.filter(filtro).sort((a, b) => b.op.score - a.op.score);
    const ej = [];
    for (const x of xs.slice(0, 40)) { const n = x.est || x.n; if (!usados.has(n) && !ej.includes(n)) ej.push(n); if (ej.length === 3) break; }
    ej.forEach((n) => usados.add(n));
    return { id, titulo, como, n: xs.length, ejemplos: ej };
  };
  if (tipo === 'colegios') {
    return [
      mk('priv', 'Colegios privados de 500 estudiantes o más', 'Venta directa a la rectoría con pago desde el ahorro. Ciclo de venta corto.', (c) => c.sec !== 'O' && c.mat >= 500),
      mk('cortes', 'Colegios oficiales en zonas con muchos cortes', 'Solar con baterías por la Secretaría de Educación o la alcaldía.', (c) => c.sec === 'O' && c.op.f.cortes >= 0.66),
      mk('grandes', 'Colegios oficiales urbanos de 800 estudiantes o más', 'Proyecto que agrupa sedes, por licitación pública.', (c) => c.sec === 'O' && c.z !== 'R' && c.mat >= 800),
    ];
  }
  return [
    mk('priv', 'Clínicas y hospitales privados', 'Gerencia: solar con respaldo para equipos críticos.', (s) => s.nat !== 'Pública' && s.tipo === 'hospital'),
    mk('ese', 'Hospitales públicos (ESE) en zonas con cortes', 'Gerencia de la ESE, con su manual de contratación.', (s) => s.nat === 'Pública' && s.tipo === 'hospital' && s.op.f.cortes >= 0.66),
    mk('centros', 'Centros y puestos de salud', 'Paquetes pequeños de solar con baterías, por la ESE o la alcaldía.', (s) => s.tipo === 'centro'),
  ];
}

// ---------------- Hoteles y turismo ----------------
// Supuestos de la plataforma (se muestran en la página):
//   - Un alojamiento consume unos 180 kWh por habitación al mes en clima frío, 250 en templado y 350 en cálido (24 °C o más).
//   - De día se consume cerca del 45 % de esa energía: el sistema sugerido cubre esa parte.
let turCache = null;
function turismoCtx() {
  if (turCache?.n === store.municipios.length) return turCache;
  const sorted = (k) => store.municipios.map((m) => m[k]).filter((v) => v != null).sort((a, b) => a - b);
  const pctOf = (arr) => (v) => { if (v == null || !arr.length) return 0; let lo = 0, hi = arr.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < v) lo = mid + 1; else hi = mid; } return lo / arr.length; };
  const pViv = pctOf(sorted('viv12')), pTur = pctOf(sorted('rnt_vivtur'));
  const subs = store.meta?.dna_subareas || {}, esp = store.meta?.dna_esperado || { fds: 0.34, alta: 0.36 };
  const mun = new Map();
  for (const m of store.municipios) {
    const s = m.subarea ? subs['SUBAREA ' + m.subarea] : null;
    mun.set(m.code, { temp: m.temp ?? null, viv12: m.viv12 ?? null, vivtur: m.rnt_vivtur ?? null, crece: Math.max(pViv(m.viv12), pTur(m.rnt_vivtur)), subarea: m.subarea, fds: s?.fds ?? null, alta: s?.alta ?? null, sem: s?.sem || null });
  }
  turCache = { n: store.municipios.length, mun, esp };
  return turCache;
}
const SUBAREA_TXT = { GCM: 'Guajira, Cesar y Magdalena', CQR: 'Caldas, Quindío y Risaralda', CORDOBA_SUCRE: 'Córdoba y Sucre', 'BOYACA-CASANARE': 'Boyacá y Casanare', 'CAUCA-NARINO': 'Cauca y Nariño', 'HUILA-TOLIMA': 'Huila y Tolima', BOLIVAR: 'Bolívar', ATLANTICO: 'Atlántico', BOGOTA: 'Bogotá y Cundinamarca', CAQUETA: 'Caquetá', VALLE: 'Valle del Cauca', 'NORTE DE SANTANDER': 'Norte de Santander', CERROMATOSO: 'Cerromatoso' };
export const subareaTxt = (s) => SUBAREA_TXT[s] || String(s || '').toLowerCase().replace(/(^|[\s_-])(\p{L})/gu, (x, a, b) => (a === '_' || a === '-' ? ' ' : a) + b.toUpperCase());
const RURAL = /FINCA|GLAMPING|CAMPAMENTO|REFUGIO|ECOTURISMO|AGROTURISMO|ALBERGUE/;
const PARQUE = /PARQUE|CONCESIONARIO/;

export function oportunidadHotel(c) {
  const z = contexto().mun.get(c.code) || {};
  const t = turismoCtx(), tz = t.mun.get(c.code) || {};
  const temp = tz.temp ?? 22, ghi = z.ghi || 4.5;
  const parque = PARQUE.test(c.sub || ''), rural = RURAL.test(c.sub || '');
  const porHab = temp >= 24 ? 350 : temp >= 18 ? 250 : 180;
  const kwhMes = parque ? null : Math.round((c.hab || 0) * porHab);
  const kwp = kwhMes ? Math.max(1, Math.round(((kwhMes * 0.45) / (ghi * 30 * 0.78)) * 10) / 10) : null;
  const ahorro = kwp && z.tarifa ? Math.round(kwp * ghi * 0.78 * 365 * z.tarifa) : null;
  const fdsRatio = tz.fds != null && t.esp.fds ? tz.fds / t.esp.fds : null;
  const f = {
    tam: parque ? clamp(Math.log10(Math.max(1, c.emp || 1) / 3) / Math.log10(200 / 3)) : clamp(Math.log10(Math.max(1, c.hab || 1) / 4) / Math.log10(300 / 4)),
    calor: clamp((temp - 20) / 8),
    tarifa: z.tarifa ? clamp((z.tarifa - 750) / 200) : 0.5,
    cortes: z.cortes ?? 0.5,
    fds: fdsRatio != null ? clamp((fdsRatio - 1) / 0.6) : 0,
    crece: tz.crece ?? 0.5,
    sol: clamp((ghi - 3.8) / 1.8),
    decide: c.pj ? 1 : 0.5,
  };
  const score = Math.round(100 * (0.25 * f.tam + 0.15 * f.calor + 0.15 * f.tarifa + 0.1 * f.cortes + 0.1 * f.fds + 0.1 * f.crece + 0.05 * f.sol + 0.1 * f.decide));
  const pc = (x) => `${Math.round(x * 100)} %`;
  const r = [];
  if (!parque && f.tam >= 0.45) r.push([f.tam, `${fmt(c.hab)} habitaciones: unos ${fmt(kwhMes)} kWh al mes`]);
  if (parque) r.push([0.8, 'Parque: consume de día y en fines de semana, justo cuando produce el sol']);
  if (f.fds >= 0.3) r.push([0.6 + f.fds, `En ${subareaTxt(tz.subarea)} el ${pc(tz.fds)} de la energía que no llegó por cortes cayó en fines de semana y festivos, que son el ${pc(t.esp.fds)} de los días: los cortes llegan cuando el alojamiento está lleno`]);
  else if (tz.alta != null && tz.alta / t.esp.alta >= 1.08) r.push([0.6, `En ${subareaTxt(tz.subarea)} el ${pc(tz.alta)} de la energía que no llegó por cortes cayó en temporada alta`]);
  if (f.calor >= 0.5) r.push([f.calor, `Clima cálido: ${fmt(temp, 1)} °C de promedio; el aire acondicionado pesa en la factura`]);
  if (f.crece >= 0.8) r.push([f.crece, `Zona turística que crece: ${fmt(tz.viv12)} viviendas nuevas en 12 meses y ${fmt(tz.vivtur)} viviendas turísticas registradas`]);
  if (f.tarifa >= 0.6) r.push([f.tarifa, `Tarifa alta en ${z.name}: $${fmt(z.tarifa)} por kWh`]);
  if (f.cortes >= 0.66 && f.fds < 0.3) r.push([f.cortes, `Zona con muchos cortes${z.saidi != null ? `: ${z.or} promedió ${fmt(z.saidi, 0)} horas sin luz por usuario en ${z.saidiAnio}` : ''}`]);
  let via;
  if (parque) via = 'Gerencia. Solar para el consumo de día en temporada y fines de semana; pago con el ahorro.';
  else if ((c.hab || 0) >= 40 && c.pj) via = `Gerencia o dueño. Solar${f.fds >= 0.3 || f.cortes >= 0.66 ? ' con baterías para que los cortes de puente festivo no lleguen a los huéspedes' : ''} y pago con el ahorro (renting o PPA), sin inversión.`;
  else if (rural) via = 'El dueño decide directo. Solar con baterías: en zonas rurales los cortes son más largos y el huésped lo nota.';
  else via = 'El dueño decide directo. Paquete pequeño de solar con baterías; el argumento es ocupación y reseñas sin cortes.';
  return { score, kwh_mes: kwhMes, kwp, ahorro, razones: r.sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]), via, f };
}

// Cuándo se va la luz en la zona del listado: subárea más común, con su reparto por día de la semana
export function zonaTurismo(rows) {
  const t = turismoCtx();
  const cuenta = {};
  for (const c of rows) { const s = t.mun.get(c.code)?.subarea; if (s) cuenta[s] = (cuenta[s] || 0) + 1; }
  const top = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]?.[0];
  const subs = store.meta?.dna_subareas || {};
  const ranking = Object.entries(subs).filter(([k, v]) => v.fds != null && v.kwh > 500000 && !/NO DEFINIDA/.test(k))
    .map(([k, v]) => ({ subarea: subareaTxt(k.replace('SUBAREA ', '')), fds: v.fds, alta: v.alta })).sort((a, b) => b.fds - a.fds).slice(0, 4);
  const s = top ? subs['SUBAREA ' + top] : null;
  return {
    esperado: t.esp, periodo: store.meta?.dna_periodo || null, ranking,
    sub: s ? { nombre: subareaTxt(top), fds: s.fds, alta: s.alta, sem: s.sem, kwh: s.kwh } : null,
  };
}

export function segmentosHotel(rows) {
  const t = turismoCtx();
  const usados = new Set();
  const mk = (id, titulo, como, filtro) => {
    const xs = rows.filter(filtro).sort((a, b) => b.op.score - a.op.score);
    const ej = [];
    for (const x of xs.slice(0, 40)) { if (!usados.has(x.n) && !ej.includes(x.n)) ej.push(x.n); if (ej.length === 3) break; }
    ej.forEach((n) => usados.add(n));
    return { id, titulo, como, n: xs.length, ejemplos: ej };
  };
  return [
    mk('calor', 'Hoteles de 40 habitaciones o más en clima cálido', 'Gerencia: solar con pago desde el ahorro; el aire acondicionado justifica el sistema.', (c) => !PARQUE.test(c.sub || '') && (c.hab || 0) >= 40 && (t.mun.get(c.code)?.temp ?? 0) >= 24),
    mk('fds', 'Alojamientos donde los cortes caen en fines de semana y festivos', 'Solar con baterías: el argumento es no perder huéspedes en los puentes.', (c) => c.op.f.fds >= 0.3),
    mk('parques', 'Parques temáticos, de ecoturismo y agroturismo', 'Consumo de día y en fines de semana, justo cuando produce el sol.', (c) => PARQUE.test(c.sub || '')),
  ];
}

// Caché del cálculo por registro: se calcula una vez y se reutiliza en cada consulta
const CACHE = new WeakMap();
const FN = { colegios: oportunidadColegio, salud: oportunidadSalud, hotel: oportunidadHotel };
export function op(tipo, c) {
  let v = CACHE.get(c);
  if (!v) { v = FN[tipo](c); CACHE.set(c, v); }
  return v;
}
// Calienta la caché al arrancar, por lotes para no bloquear las consultas mientras tanto
export function precalentar(log = () => {}) {
  const t0 = Date.now();
  const colas = [['colegios', store.colegios || []], ['salud', store.salud || []], ['hotel', store.clientes || []]];
  let i = 0, j = 0;
  const paso = () => {
    const fin = Date.now() + 40;
    while (i < colas.length && Date.now() < fin) {
      const [tipo, rows] = colas[i];
      if (j < rows.length) { op(tipo, rows[j++]); } else { i++; j = 0; }
    }
    if (i < colas.length) setImmediate(paso); else log(`oportunidad precalculada en ${Date.now() - t0} ms`);
  };
  setImmediate(paso);
}
