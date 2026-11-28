// Inteligencia profunda: interdependencias entre variables públicas.
// Tres niveles: municipios (1.122), departamentos (33) y meses del país.
// Correlación de Spearman (por rangos, resiste valores extremos) y un modelo lineal con regularización
// sobre rangos estandarizados para repartir el "peso" de varias entradas sobre una salida.
// Es estadística descriptiva: muestra asociaciones, no causas.
import { store, scored, PROFILES } from './data.js';

const L = (v) => (v == null || !Number.isFinite(+v) ? null : Math.log1p(Math.max(0, +v)));
const num = (v) => (v == null || !Number.isFinite(+v) ? null : +v);
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

// Variables por municipio. agg: cómo se suma al departamento ('sum' o promedio ponderado por población 'mean')
const VM = [
  ['tarifa', 'Tarifa residencial', 'Energía', '$/kWh', (m) => num(m.tarifa), 'mean'],
  ['tarifa_com', 'Tarifa comercial', 'Energía', '$/kWh', (m) => num(m.tarifa_com ?? m.tarifa), 'mean'],
  ['consumo_alto', 'Consumo de hogares estrato alto', 'Energía', 'kWh/mes', (m) => num(m.kwh_mes_alto), 'mean'],
  ['cortes', 'Energía no atendida por cortes', 'Energía', 'MWh por 1.000 hab.', (m) => num(m.dna_1k), 'mean'],
  ['dias_cortes', 'Días con cortes', 'Energía', 'días', (m) => num(m.dna_dias), 'mean'],
  ['saidi', 'Horas sin luz al año (operador)', 'Energía', 'horas', (m) => num(m.saidi), 'mean'],
  ['ghi', 'Radiación solar', 'Clima', 'kWh/m²/día', (m) => num(m.ghi), 'mean'],
  ['temp', 'Temperatura media', 'Clima', '°C', (m) => num(m.temp), 'mean'],
  ['elev', 'Altura sobre el mar', 'Clima', 'm', (m) => num(m.elev), 'mean'],
  ['sub_km', 'Distancia a subestación', 'Red', 'km', (m) => num(m.sub_km), 'mean'],
  ['kv30', 'Tensión máxima a 30 km', 'Red', 'kV', (m) => num(m.kv30), 'mean'],
  ['cap_mw', 'Capacidad para conectar generación', 'Red', 'MW', (m) => num(m.cap_mw), 'mean'],
  ['gen30_mw', 'Generación instalada a 30 km', 'Red', 'MW', (m) => num(m.gen30_mw), 'mean'],
  ['solar30_mw', 'Plantas solares a 30 km', 'Red', 'MW', (m) => num(m.solar30_mw), 'mean'],
  ['upme_mw', 'Proyectos registrados en la UPME', 'Red', 'MW', (m) => num(m.upme_mw), 'sum'],
  ['agpe_est', 'Autogeneradores conectados', 'Mercado solar', 'sistemas', (m) => num(m.agpe_est), 'sum'],
  ['agpe_10k', 'Autogeneradores por 10.000 hab.', 'Mercado solar', 'sistemas', (m) => num(m.agpe_10k), 'mean'],
  ['agpe_kw', 'Potencia de autogeneración', 'Mercado solar', 'kW', (m) => num(m.agpe_est_kw ?? m.agpe_kw), 'sum'],
  ['inst_n', 'Instaladores y contratistas', 'Mercado solar', 'empresas', (m) => num(m.inst_n), 'sum'],
  ['mayor_n', 'Mayoristas de equipos', 'Mercado solar', 'empresas', (m) => num(m.mayor_n), 'sum'],
  ['secop_n', 'Contratos públicos solares', 'Mercado solar', 'contratos', (m) => num(m.secop_n), 'sum'],
  ['pop', 'Población', 'Población', 'habitantes', (m) => num(m.pop), 'sum'],
  ['viv12', 'Vivienda nueva (12 meses)', 'Construcción', 'unidades', (m) => num(m.viv12), 'sum'],
  ['viv_crec', 'Crecimiento de la vivienda nueva', 'Construcción', '%', (m) => num(m.viv_crec), 'mean'],
  ['nores12_m2', 'Obra no residencial (12 meses)', 'Construcción', 'm²', (m) => num(m.nores12_m2), 'sum'],
  ['turismo', 'Actividad turística', 'Turismo', 'índice', (m) => num(m.turismo_idx), 'mean'],
  ['rnt_hab', 'Habitaciones turísticas', 'Turismo', 'habitaciones', (m) => num(m.rnt_hab), 'sum'],
  ['colegios', 'Colegios', 'Instituciones', 'sedes', (m) => num(m.col_n), 'sum'],
  ['matricula', 'Estudiantes matriculados', 'Instituciones', 'estudiantes', (m) => num(m.col_mat), 'sum'],
  ['colegios_rurales', 'Colegios rurales', 'Instituciones', 'sedes', (m) => num(m.col_rur), 'sum'],
  ['salud', 'Sedes de salud', 'Instituciones', 'sedes', (m) => num(m.ips_n), 'sum'],
  ['hospitales', 'Hospitales y clínicas', 'Instituciones', 'sedes', (m) => num(m.hosp_n), 'sum'],
  ['ci_alta', 'Empresas grandes de consumo alto', 'Empresas', 'empresas', (m) => num(m.ci_alta), 'sum'],
  ['ci_flex', 'Empresas con carga flexible', 'Empresas', 'índice', (m) => num(m.ci_flex), 'sum'],
];

// Variables que solo existen por departamento: importaciones de paneles y baterías (DIAN)
function importaciones() {
  const imp = store.energia.importaciones;
  if (!imp?.dptos) return {};
  const out = {};
  for (const d of imp.dptos) out[norm(d.dpto)] = { u25: d.u?.['2025'] ?? null, usd25: d.usd?.['2025'] ?? null, usd26: d.usd?.['2026'] ?? null };
  return out;
}
const chinaPct = () => {
  const p = store.energia.importaciones?.paises || [];
  const tot = p.reduce((a, x) => a + (x.usd || 0), 0);
  const c = p.find((x) => norm(x.pais) === 'china');
  return tot && c ? Math.round((c.usd / tot) * 100) : null;
};

let cache = null;
function base() {
  const key = `${store.meta.generado}|${store.municipios.length}`;
  if (cache?.key === key) return cache;
  const ms = store.municipios.filter((m) => m.lat != null);
  // Puntaje de cada perfil con sus pesos por defecto
  const sc = {};
  for (const p of Object.keys(PROFILES)) { const r = scored(p); sc[p] = r.byCode; }
  const vars = {};
  for (const [k, label, grupo, unidad, get, agg] of VM) vars[k] = { k, label, grupo, unidad, agg, v: ms.map(get) };
  for (const p of Object.keys(PROFILES)) vars[`score_${p}`] = { k: `score_${p}`, label: `Puntaje ${PROFILES[p].short}`, grupo: 'Puntajes de Radar Solar', unidad: '0 a 100', agg: 'mean', v: ms.map((m) => sc[p].get(m.code)?.score ?? null) };
  const muni = { n: ms.length, ids: ms.map((m) => `${m.name}, ${m.dpto}`), vars };

  // Departamentos
  const dps = [...new Set(ms.map((m) => m.dpto))].sort();
  const idx = Object.fromEntries(dps.map((d, i) => [d, i]));
  const dvars = {};
  for (const [k, V] of Object.entries(vars)) {
    const s = Array(dps.length).fill(0), w = Array(dps.length).fill(0), c = Array(dps.length).fill(0);
    ms.forEach((m, i) => { const x = V.v[i]; if (x == null) return; const j = idx[m.dpto]; const pw = V.agg === 'sum' ? 1 : Math.max(1, m.pop || 1); s[j] += V.agg === 'sum' ? x : x * pw; w[j] += pw; c[j]++; });
    dvars[k] = { ...V, v: s.map((x, j) => (c[j] ? (V.agg === 'sum' ? x : x / w[j]) : null)) };
  }
  const imp = importaciones(), cp = chinaPct();
  const nota = cp ? `El ${cp} % de lo importado viene de China.` : '';
  const impVar = (k, label, get) => { dvars[k] = { k, label, grupo: 'Comercio exterior', unidad: 'USD', agg: 'sum', nota, v: dps.map((d) => get(imp[norm(d)] || {}) ?? 0) }; }; // sin registro de la DIAN = no importó
  impVar('imp_usd_2025', 'Importaciones de paneles 2025', (x) => x.usd25 ?? null);
  impVar('imp_usd_2026', 'Importaciones de paneles 2026 (parcial)', (x) => x.usd26 ?? null);
  impVar('imp_u_2025', 'Paneles importados 2025 (unidades)', (x) => x.u25 ?? null);
  const dpto = { n: dps.length, ids: dps, vars: dvars };

  // Meses del país
  const im = store.energia.importaciones?.mensual || [];
  const meses = [...new Set(im.map((x) => x.p))].sort();
  const mi = Object.fromEntries(meses.map((p, i) => [p, i]));
  const serie = () => Array(meses.length).fill(null);
  const mv = {};
  const addM = (k, label, grupo, unidad, arr, nota) => { mv[k] = { k, label, grupo, unidad, agg: 'sum', v: arr, nota }; };
  const pan = serie(), panU = serie(), bat = serie();
  for (const x of im) { pan[mi[x.p]] = x.pan_usd ?? null; panU[mi[x.p]] = x.pan_u ?? null; bat[mi[x.p]] = x.bat_usd ?? null; }
  addM('imp_pan_usd', 'Importaciones de paneles', 'Comercio exterior', 'USD', pan, cp ? `El ${cp} % viene de China.` : '');
  addM('imp_pan_u', 'Paneles importados (unidades)', 'Comercio exterior', 'paneles', panU);
  addM('imp_bat_usd', 'Importaciones de baterías', 'Comercio exterior', 'USD', bat);
  const an = serie(), ak = serie(), as = serie();
  for (const a of store.red?.agpe_lista || []) { const j = mi[String(a.desde || '').slice(0, 7)]; if (j == null) continue; an[j] = (an[j] || 0) + 1; ak[j] = (ak[j] || 0) + (a.mw || 0) * 1000; if (/solar/i.test(a.tipo || '')) as[j] = (as[j] || 0) + 1; }
  const fill0 = (a) => a.map((x, i) => (x == null && i < a.length - 2 ? 0 : x)); // los dos últimos meses pueden tener rezago de registro
  addM('agpe_altas', 'Autogeneradores nuevos', 'Mercado solar', 'sistemas', fill0(an), 'Por fecha de entrada en operación (PARATEC); los últimos meses pueden tener rezago.');
  addM('agpe_kw', 'Potencia de autogeneración nueva', 'Mercado solar', 'kW', fill0(ak));
  addM('agpe_solar', 'Autogeneradores solares nuevos', 'Mercado solar', 'sistemas', fill0(as));
  const sec = serie();
  for (const s of store.secop || []) { const j = mi[String(s.fecha || '').slice(0, 7)]; if (j != null) sec[j] = (sec[j] || 0) + 1; }
  addM('secop', 'Contratos públicos solares', 'Mercado solar', 'contratos', sec.map((x) => x ?? 0));
  const mes = { n: meses.length, ids: meses, vars: mv, temporal: true };

  cache = { key, muni, dpto, mes };
  return cache;
}

// Versión por cada 10.000 habitantes de las variables que son conteos (para que el tamaño no lo explique todo)
const pcCache = new Map();
function nivelDe(b, nivel, pc) {
  const lv = b[nivel];
  if (!lv || !pc || lv.temporal) return lv;
  const k = `${b.key}|${nivel}`;
  if (pcCache.has(k)) return pcCache.get(k);
  const pop = lv.vars.pop.v, vars = {};
  for (const [key, V] of Object.entries(lv.vars)) vars[key] = V.agg === 'sum' && key !== 'pop' && !key.startsWith('score_') ? { ...V, label: `${V.label} por 10.000 hab.`, v: V.v.map((x, i) => (x == null || !pop[i] ? null : (x / pop[i]) * 1e4)) } : V;
  const out = { ...lv, vars };
  pcCache.set(k, out);
  return out;
}

const NIVELES = { muni: 'Municipios', dpto: 'Departamentos', mes: 'Meses (todo el país)' };
export function variables() {
  const b = base();
  const lista = (lv) => Object.values(b[lv].vars).map((V) => ({ k: V.k, label: V.label, grupo: V.grupo, unidad: V.unidad, nota: V.nota || null, conteo: V.agg === 'sum' && V.k !== 'pop', n: V.v.filter((x) => x != null).length }));
  return { niveles: Object.fromEntries(Object.entries(NIVELES).map(([k, l]) => [k, { label: l, n: b[k].n, desde: b[k].temporal ? b[k].ids[0] : null, hasta: b[k].temporal ? b[k].ids.at(-1) : null, vars: lista(k) }])) };
}

// ---------------- Estadística ----------------
function rank(a) {
  const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
  const r = Array(a.length);
  let i = 0;
  while (i < idx.length) { let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++; const v = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = v; i = j + 1; }
  return r;
}
function pearson(x, y) {
  const n = x.length; if (n < 3) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sx += dx * dx; sy += dy * dy; }
  return sx && sy ? sxy / Math.sqrt(sx * sy) : null;
}
// Pares completos, opcionalmente con rezago (x adelantada k pasos sobre y)
function pares(xv, yv, lag = 0) {
  const x = [], y = [];
  for (let i = lag; i < yv.length; i++) { const a = xv[i - lag], b = yv[i]; if (a != null && b != null) { x.push(a); y.push(b); } }
  return [x, y];
}
const spearman = (x, y) => pearson(rank(x), rank(y));
const phi = (z) => { const t = 1 / (1 + 0.2316419 * Math.abs(z)); const d = 0.3989423 * Math.exp(-z * z / 2); const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; };
const pval = (r, n) => (r == null || n < 4 ? null : 2 * (1 - phi(Math.abs(Math.atanh(Math.max(-0.9999, Math.min(0.9999, r)))) * Math.sqrt(n - 3))));
function fuerza(r, p) {
  const a = Math.abs(r ?? 0);
  if (p == null || p > 0.05) return 'sin evidencia';
  return a >= 0.6 ? 'fuerte' : a >= 0.35 ? 'moderada' : a >= 0.15 ? 'débil' : 'muy débil';
}
// En meses se comparan los cambios de un mes a otro: dos series que solo crecen con el tiempo no quedan "relacionadas" por eso
const dif = (a) => a.map((v, i) => (i && v != null && a[i - 1] != null ? v - a[i - 1] : null));
const serieDe = (lv, k) => (lv.temporal ? dif(lv.vars[k].v) : lv.vars[k].v);
function corr(lv, xk, yk, maxLag = 0) {
  const X = serieDe(lv, xk), Y = serieDe(lv, yk);
  let best = null;
  for (let lag = 0; lag <= maxLag; lag++) {
    const [x, y] = pares(X, Y, lag);
    const r = spearman(x, y), n = x.length;
    if (r == null) continue;
    if (!best || Math.abs(r) > Math.abs(best.r)) best = { r, n, lag, p: pval(r, n) };
  }
  if (!best) return { r: null, n: 0, p: null, lag: 0, fuerza: 'sin datos' };
  return { ...best, r: Math.round(best.r * 1000) / 1000, p: best.p != null ? Math.round(best.p * 10000) / 10000 : null, fuerza: fuerza(best.r, best.p) };
}
// Resuelve A·x = b (Gauss con pivoteo)
function solve(A, b) {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}
// Modelo lineal con regularización suave sobre rangos estandarizados: cuánto pesa cada entrada cuando se miran juntas
function modelo(lv, entradas, salida, lags = {}) {
  const maxL = Math.max(0, ...entradas.map((k) => lags[k] || 0));
  const filas = [];
  const Y = serieDe(lv, salida), XS = Object.fromEntries(entradas.map((k) => [k, serieDe(lv, k)]));
  for (let i = maxL; i < Y.length; i++) {
    if (Y[i] == null) continue;
    const xs = entradas.map((k) => XS[k][i - (lags[k] || 0)]);
    if (xs.some((x) => x == null)) continue;
    filas.push([...xs, Y[i]]);
  }
  const n = filas.length, p = entradas.length;
  if (n < p + 5) return { n, r2: null, beta: {} };
  const cols = Array.from({ length: p + 1 }, (_, j) => rank(filas.map((f) => f[j])));
  const z = cols.map((c) => { const m = c.reduce((a, b) => a + b, 0) / n; const s = Math.sqrt(c.reduce((a, b) => a + (b - m) ** 2, 0) / n) || 1; return c.map((v) => (v - m) / s); });
  const X = z.slice(0, p), y = z[p];
  const lambda = 0.05 * n;
  const A = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => X[a].reduce((s, v, i) => s + v * X[b][i], 0) + (a === b ? lambda : 0)));
  const bv = Array.from({ length: p }, (_, a) => X[a].reduce((s, v, i) => s + v * y[i], 0));
  const beta = solve(A, bv);
  if (!beta) return { n, r2: null, beta: {} };
  let sse = 0, sst = 0;
  for (let i = 0; i < n; i++) { const yh = beta.reduce((s, b, j) => s + b * X[j][i], 0); sse += (y[i] - yh) ** 2; sst += y[i] ** 2; }
  return { n, r2: Math.round(Math.max(0, 1 - sse / sst) * 1000) / 1000, beta: Object.fromEntries(entradas.map((k, j) => [k, Math.round(beta[j] * 1000) / 1000])) };
}

export function analizar({ nivel = 'muni', entradas = [], salidas = [], pc = false }) {
  const b = base(), lv = nivelDe(b, nivel, pc);
  if (!lv) throw Object.assign(new Error('Nivel no válido'), { status: 400 });
  const ok = (k) => typeof k === 'string' && lv.vars[k];
  entradas = [...new Set(entradas.filter(ok))].slice(0, 12);
  salidas = [...new Set(salidas.filter(ok))].filter((k) => !entradas.includes(k)).slice(0, 4);
  const maxLag = lv.temporal ? 3 : 0;
  const enlaces = [];
  const lags = {};
  for (const y of salidas) {
    lags[y] = {};
    for (const x of entradas) { const c = corr(lv, x, y, maxLag); lags[y][x] = c.lag; enlaces.push({ de: x, a: y, ...c }); }
  }
  const modelos = Object.fromEntries(salidas.map((y) => [y, entradas.length ? modelo(lv, entradas, y, lags[y]) : { n: 0, r2: null, beta: {} }]));
  // Relaciones entre las mismas entradas (para ver cuáles dicen casi lo mismo)
  const entre = [];
  for (let i = 0; i < entradas.length; i++) for (let j = i + 1; j < entradas.length; j++) { const c = corr(lv, entradas[i], entradas[j]); if (c.r != null && Math.abs(c.r) >= 0.5 && c.p != null && c.p <= 0.05) entre.push({ a: entradas[i], b: entradas[j], r: c.r }); }
  return { nivel, pc: !!pc && !lv.temporal, n: lv.n, temporal: !!lv.temporal, entradas, salidas, enlaces, modelos, entre, nombres: Object.fromEntries([...entradas, ...salidas].map((k) => [k, lv.vars[k].label])) };
}

// Busca entre todas las variables las que más se relacionan con una salida
export function descubrir({ nivel = 'muni', salida, excluir = [], pc = false }) {
  const b = base(), lv = nivelDe(b, nivel, pc);
  if (!lv?.vars[salida]) throw Object.assign(new Error('Variable no válida'), { status: 400 });
  const maxLag = lv.temporal ? 3 : 0;
  const fuera = new Set([salida, ...excluir]);
  // Variantes de la misma medida (por ejemplo importaciones de otro año o en unidades) no cuentan como hallazgo
  const familia = (k) => (k.startsWith('imp_') ? 'imp' : k.startsWith('agpe_') ? 'agpe' : k.startsWith('tarifa') ? 'tarifa' : k.startsWith('colegios') || k === 'matricula' ? 'col' : k === 'salud' || k === 'hospitales' ? 'salud' : k);
  for (const k of Object.keys(lv.vars)) if (familia(k) === familia(salida)) fuera.add(k);
  // Los puntajes ya combinan otras variables: se dejan fuera para no encontrar relaciones obvias
  const res = Object.keys(lv.vars).filter((k) => !fuera.has(k) && !k.startsWith('score_')).map((k) => ({ k, ...corr(lv, k, salida, maxLag) }))
    .filter((c) => c.r != null && c.p != null && c.p <= 0.05 && c.n >= 8).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  return { nivel, salida, top: res.slice(0, 8).map((c) => ({ ...c, label: lv.vars[c.k].label })) };
}

// Puntos para la gráfica de dispersión de un par
export function dispersion({ nivel = 'muni', x, y, lag = 0, pc = false }) {
  const b = base(), lv = nivelDe(b, nivel, pc);
  if (!lv?.vars[x] || !lv?.vars[y]) throw Object.assign(new Error('Variable no válida'), { status: 400 });
  const X = lv.vars[x].v, Y = lv.vars[y].v, pts = [];
  lag = Math.max(0, Math.min(3, +lag || 0));
  for (let i = lag; i < Y.length; i++) if (X[i - lag] != null && Y[i] != null) pts.push({ x: X[i - lag], y: Y[i], id: lv.ids[i] });
  // En municipios se envía una muestra que conserva los extremos
  let out = pts;
  if (pts.length > 400) { const s = [...pts].sort((a, b) => a.x - b.x); const paso = s.length / 380; out = [...Array.from({ length: 380 }, (_, i) => s[Math.floor(i * paso)]), ...[...pts].sort((a, b) => b.y - a.y).slice(0, 20)]; }
  return { nivel, x, y, lag, n: pts.length, pts: out };
}
