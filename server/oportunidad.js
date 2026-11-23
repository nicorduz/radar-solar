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

const fmt = (n, d = 0) => (n == null ? 's/d' : Number(n).toLocaleString('es-CO', { maximumFractionDigits: d, minimumFractionDigits: d }));

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
