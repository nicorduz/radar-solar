import fs from 'node:fs';
import path from 'node:path';
import { ROOT, STORAGE, config } from './config.js';
import { db, getSetting } from './db.js';

export const store = { municipios: [], byCode: new Map(), secop: [], empresas: [], proyectosBase: [], clientes: [], ci: [], ciAnio: null, red: null, meta: {}, colegios: [], colegiosAnio: null, salud: [], saludCorte: null, energia: {} };

export function builtDir() {
  const s = path.join(STORAGE, 'built');
  return fs.existsSync(path.join(s, 'municipios.json')) ? s : path.join(ROOT, 'data', 'built');
}
export function loadData() {
  const dir = builtDir();
  const r = (f, def = []) => (fs.existsSync(path.join(dir, f)) ? JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) : def);
  store.municipios = r('municipios.json');
  store.byCode = new Map(store.municipios.map((m) => [m.code, m]));
  store.secop = r('secop.json');
  store.empresas = r('empresas.json');
  store.proyectosBase = r('proyectos_base.json');
  store.clientes = r('clientes.json');
  const ci = r('ci.json', { anio: null, empresas: [] });
  store.ci = ci.empresas || []; store.ciAnio = ci.anio;
  store.red = r('red.json', { subs: [], plantas: [], lineas: [], zni: [] });
  store.redMtFile = fs.existsSync(path.join(dir, 'red_mt.json')) ? path.join(dir, 'red_mt.json') : null;
  store.meta = r('meta.json', {});
  // Colegios, salud y datos de energía: si una reconstrucción dejó la base en el volumen sin estos archivos, se leen de los del repositorio
  const r2 = (f, def) => { const own = path.join(dir, f), repo = path.join(ROOT, 'data', 'built', f); const p = fs.existsSync(own) ? own : fs.existsSync(repo) ? repo : null; return p ? JSON.parse(fs.readFileSync(p, 'utf8')) : def; };
  const col = r2('colegios.json', { anio: null, rows: [] });
  store.colegios = col.rows || []; store.colegiosAnio = col.anio;
  const sal = r2('salud.json', { corte: null, rows: [] });
  store.salud = sal.rows || []; store.saludCorte = sal.corte;
  store.energia = r2('energia.json', {});
  enrichMunicipios();
  store.dpto = aggregateDptos();
  cache.clear();
  console.log(`Datos cargados desde ${dir}: ${store.municipios.length} municipios`);
}

// Nombre del operador de red en la app → nombre en las tablas de calidad de la CREG
export const OR_CREG = {
  EPM: 'EPM', 'Afinia (Caribemar)': 'CARIBEMAR', EBSA: 'EBSA', 'Enel Colombia': 'ENEL', ESSA: 'ESSA', 'Air-e': 'AIR-E', Cedenar: 'CEDENAR',
  'Celsia Tolima': 'CELSIA - MC TOLIMA', CEO: 'CEO', CENS: 'CENS', CHEC: 'CHEC', Electrohuila: 'ELECTROHUILA', 'Celsia Valle': 'CELSIA - MC VALLE',
  Dispac: 'DISPAC', EMSA: 'EMSA', Enerca: 'ENERCA', 'Electrocaquetá': 'ELECTROCAQUETA', 'Energía del Putumayo': 'EE PUTUMAYO', EDEQ: 'EDEQ',
  Enelar: 'ENELAR', 'Energía del Guaviare': 'ENERGUAVIARE', Emcali: 'EMCALI', 'Energía de Pereira': 'EEP - MC PEREIRA', 'Cetsa (Tuluá)': 'CETSA', Emcartago: 'EEP - MER CARTAGO',
};
export const calidadOR = (orName) => (store.energia.calidad?.ors || []).find((o) => o.or === OR_CREG[orName]) || null;
const kmLL = (a, b) => { const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180; const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
// Capacidad de conexión UPME cerca de un punto (barras ubicadas a menos de km kilómetros)
export function capacidadCerca(p, km = 40) {
  if (!p?.lat) return [];
  return (store.energia.capacidad?.barras || []).filter((b) => b.lat != null).map((b) => ({ ...b, km: Math.round(kmLL(p, b) * 10) / 10 })).filter((b) => b.km <= km).sort((a, b) => a.km - b.km);
}
// Agrega a cada municipio los conteos de colegios y salud, la calidad del servicio de su operador y la capacidad de conexión cercana
function enrichMunicipios() {
  const col = {}, sal = {};
  for (const c of store.colegios) { const a = (col[c.code] ||= { n: 0, ofi: 0, priv: 0, mat: 0, rur: 0 }); a.n++; a.mat += c.mat || 0; c.sec === 'O' ? a.ofi++ : a.priv++; if (c.z === 'R') a.rur++; }
  for (const s of store.salud) { const a = (sal[s.code] ||= { n: 0, pub: 0, hosp: 0 }); a.n++; if (s.nat === 'Pública') a.pub++; if (s.tipo === 'hospital') a.hosp++; }
  for (const m of store.municipios) {
    const c = col[m.code] || {}, s = sal[m.code] || {};
    m.col_n = c.n || 0; m.col_ofi = c.ofi || 0; m.col_priv = c.priv || 0; m.col_mat = c.mat || 0; m.col_rur = c.rur || 0;
    m.ips_n = s.n || 0; m.ips_pub = s.pub || 0; m.hosp_n = s.hosp || 0;
    const q = calidadOR(m.or_name);
    m.saidi = q?.saidi?.['2024'] ?? null; m.saifi = q?.saifi?.['2024'] ?? null;
    const cap = capacidadCerca(m, 30);
    m.cap_mw = cap.length ? Math.max(...cap.map((b) => b.p95_2026 ?? 0)) : null;
  }
}

// ---------------- Perfiles y factores del índice ----------------
const L = (v) => (v == null ? null : Math.log1p(Math.max(0, v)));
export const SEGMENTS = {
  campestre: { label: 'Residencial campestre', viv: (m) => (m.viv12_casas_alto || 0) * 2 + (m.viv12_rural_alto || 0) * 2 + (m.viv12_alto || 0) * 0.5 + (m.viv12_casas || 0) * 0.1 },
  urbano: { label: 'Conjuntos urbanos', viv: (m) => (m.viv12_alto || 0) * 1.5 + (m.viv12_novis || 0) },
  comercial: { label: 'Comercial y hotelero', viv: (m) => (m.comer12_m2 || 0) / 80 + (m.nores12_m2 || 0) / 200 + (m.rnt_hab || 0) / 20 },
};

export const PROFILES = {
  instalador: {
    label: 'Instalador solar', short: 'Instalador', segments: true, gate: (m, seg) => SEGMENTS[seg].viv(m),
    desc: 'Dónde hay hogares y negocios con tarifa alta, obra nueva de estrato alto, calor, turismo y cortes de energía.',
    factors: {
      tarifa: { label: 'Tarifa de energía', get: (m) => m.tarifa },
      vivienda: { label: 'Obra nueva del segmento', get: (m, seg) => L(SEGMENTS[seg].viv(m)) },
      consumo: { label: 'Consumo de hogares estrato alto', get: (m) => m.kwh_mes_alto },
      radiacion: { label: 'Radiación solar', get: (m) => m.ghi },
      calor: { label: 'Clima cálido', get: (m) => m.temp },
      contingencias: { label: 'Cortes y contingencias de red', get: (m) => m.dna_1k },
      turismo: { label: 'Actividad turística', get: (m) => m.turismo_idx },
      penetracion: { label: 'Poca competencia solar', get: (m) => (m.agpe_10k == null ? null : -m.agpe_10k) },
    },
    weights: { tarifa: 20, vivienda: 20, consumo: 10, radiacion: 10, calor: 10, contingencias: 10, turismo: 10, penetracion: 10 },
    metrics: ['score', 'tarifa', 'viv12', 'turismo_idx', 'dna_1k', 'ghi', 'temp'],
  },
  proveedor: {
    label: 'Proveedor de equipos', short: 'Proveedor', segments: false, gate: (m) => (m.inst_n || 0) * 10 + (m.agpe_est || 0),
    desc: 'Dónde hay más instaladores activos, más sistemas conectados y más obra nueva, y menos mayoristas compitiendo.',
    factors: {
      instaladores: { label: 'Instaladores en la zona', get: (m) => L(m.inst_n) },
      mercado: { label: 'Autogeneradores conectados', get: (m) => L(m.agpe_est) },
      contratos: { label: 'Contratistas con contratos solares', get: (m) => m.inst_sol },
      obra: { label: 'Obra nueva', get: (m) => L(m.viv12) },
      tarifa: { label: 'Tarifa de energía', get: (m) => m.tarifa },
      competencia: { label: 'Pocos mayoristas por instalador', get: (m) => (m.inst_n ? -(m.mayor_n || 0) / m.inst_n : null) },
    },
    weights: { instaladores: 30, mercado: 25, contratos: 10, obra: 15, tarifa: 10, competencia: 10 },
    metrics: ['score', 'inst_n', 'agpe_est', 'viv12', 'tarifa'],
  },
  desarrollador: {
    label: 'Desarrollador o inversionista', short: 'Desarrollo', segments: false, gate: null,
    desc: 'Granjas y autogeneración remota: sol, cercanía a subestaciones, tarifa comercial, contingencias y saturación de plantas.',
    factors: {
      radiacion: { label: 'Radiación solar', get: (m) => m.ghi },
      red: { label: 'Cercanía a subestación', get: (m) => (m.sub_km == null ? null : -m.sub_km) },
      tension: { label: 'Tensión disponible a 30 km', get: (m) => m.kv30 },
      tarifa_ci: { label: 'Tarifa comercial', get: (m) => m.tarifa_com ?? m.tarifa },
      contingencias: { label: 'Contingencias de red', get: (m) => m.dna_1k },
      saturacion: { label: 'Pocas plantas solares cerca', get: (m) => -(m.solar30_mw || 0) },
    },
    weights: { radiacion: 30, red: 20, tension: 10, tarifa_ci: 15, contingencias: 10, saturacion: 15 },
    metrics: ['score', 'ghi', 'sub_km', 'cap_mw', 'solar30_mw', 'upme_mw', 'tarifa_com'],
  },
  servicios: {
    label: 'Mantenimiento y servicios (O&M)', short: 'O&M', segments: false, gate: (m) => (m.agpe_est || 0) + (m.solar30_mw || 0) * 5,
    desc: 'Dónde hay más sistemas y plantas solares que mantener, proyectos nuevos en camino y pocas empresas para atenderlos.',
    factors: {
      sistemas: { label: 'Autogeneradores instalados', get: (m) => L(m.agpe_est) },
      plantas: { label: 'Plantas solares cerca (MW)', get: (m) => L(m.solar30_mw) },
      proyectos: { label: 'Proyectos nuevos en camino (MW)', get: (m) => L(m.upme_mw) },
      atencion: { label: 'Pocas empresas por sistema', get: (m) => (m.agpe_est ? -((m.inst_n || 0) / m.agpe_est) : null) },
      contingencias: { label: 'Cortes de red (más fallas)', get: (m) => m.dna_1k },
      calor: { label: 'Clima cálido (más desgaste)', get: (m) => m.temp },
    },
    weights: { sistemas: 30, plantas: 25, proyectos: 15, atencion: 10, contingencias: 10, calor: 10 },
    metrics: ['score', 'agpe_est', 'solar30_mw', 'upme_mw', 'inst_n'],
  },
  respaldo: {
    label: 'Baterías y respaldo', short: 'Baterías', segments: false, gate: (m) => (m.pop || 0) / 100 + (m.rnt_hab || 0) + (m.comer12_m2 || 0) / 50,
    desc: 'Dónde se va más la luz y la energía es cara: hogares, hoteles y comercios que necesitan baterías o sistemas híbridos.',
    factors: {
      contingencias: { label: 'Cortes de energía', get: (m) => m.dna_1k },
      saidi: { label: 'Horas sin luz al año (operador)', get: (m) => m.saidi },
      dias: { label: 'Días con cortes al año', get: (m) => m.dna_dias },
      tarifa: { label: 'Tarifa de energía', get: (m) => m.tarifa },
      turismo: { label: 'Hoteles y turismo', get: (m) => m.turismo_idx },
      comercio: { label: 'Comercio y obra no residencial', get: (m) => L(m.nores12_m2) },
      aislado: { label: 'Localidades sin red', get: (m) => m.zni_n || 0 },
    },
    weights: { contingencias: 30, saidi: 15, dias: 10, tarifa: 15, turismo: 15, comercio: 10, aislado: 5 },
    metrics: ['score', 'dna_1k', 'saidi', 'tarifa', 'turismo_idx', 'ghi'],
  },
};
export const PROFILE_KEYS = Object.keys(PROFILES);
export const defaultWeights = (p) => ({ ...PROFILES[p].weights, ...(getSetting(`weights_${p}`, null) || {}) });

function pctRank(values) {
  const valid = values.map((v, i) => [v, i]).filter(([v]) => v != null && Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
  const out = Array(values.length).fill(null);
  const n = valid.length;
  let i = 0;
  while (i < n) {
    let j = i; while (j + 1 < n && valid[j + 1][0] === valid[i][0]) j++;
    const p = n > 1 ? ((i + j) / 2) / (n - 1) : 0.5;
    for (let k = i; k <= j; k++) out[valid[k][1]] = p;
    i = j + 1;
  }
  return out;
}

const cache = new Map();
export function scored(profile = 'instalador', weights, segment = 'campestre') {
  const P = PROFILES[profile];
  const w = weights || defaultWeights(profile);
  const key = JSON.stringify([profile, w, segment, store.meta.generado]);
  if (cache.has(key)) return cache.get(key);
  const ms = store.municipios.filter((m) => m.tarifa != null); // zonas no interconectadas quedan fuera del ranking
  const fk = Object.keys(P.factors);
  const parts = {};
  for (const f of fk) parts[f] = pctRank(ms.map((m) => P.factors[f].get(m, segment) ?? null));
  const wsum = fk.reduce((a, f) => a + (+w[f] || 0), 0) || 1;
  // Factor de mercado (0,5 a 1): sin volumen de mercado no se puede quedar arriba
  const vol = P.gate ? ms.map((m) => P.gate(m, segment)) : null;
  const ref = vol ? [...vol].sort((a, b) => a - b)[Math.floor(vol.length * 0.97)] || 1 : 1;
  const raw = ms.map((m, i) => {
    let s = 0;
    const comp = {};
    for (const f of fk) { const p = parts[f][i] ?? 0.3; comp[f] = Math.round(p * 100); s += (w[f] || 0) * p; }
    let gate = 1;
    if (vol) { gate = 0.5 + 0.5 * Math.min(1, Math.log1p(vol[i]) / Math.log1p(ref)); comp.mercado = Math.round(gate * 100); }
    return { code: m.code, s: (s / wsum) * gate, comp };
  });
  const max = Math.max(...raw.map((r) => r.s)) || 1;
  const rows = raw.map((r) => ({ code: r.code, score: Math.round((r.s / max) * 95), comp: r.comp })).sort((a, b) => b.score - a.score);
  rows.forEach((r, i) => { r.rank = i + 1; });
  const res = { rows, byCode: new Map(rows.map((r) => [r.code, r])) };
  cache.set(key, res);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  return res;
}

export function allowedProfiles(user) {
  if (!user) return [];
  if (user.role === 'admin' || !user.profile || user.profile === 'todos') return PROFILE_KEYS;
  return PROFILE_KEYS.includes(user.profile) ? [user.profile] : ['instalador'];
}

// Lee perfil, pesos y segmento de la petición respetando lo que el usuario tiene permitido
export function parseQuery(q, user, paid) {
  const allowed = allowedProfiles(user);
  const profile = allowed.includes(q.profile) ? q.profile : allowed[0];
  const w = defaultWeights(profile);
  if (paid) for (const k of Object.keys(w)) if (q[`w_${k}`] != null) w[k] = Math.max(0, Math.min(100, +q[`w_${k}`] || 0));
  const segment = PROFILES[profile].segments && SEGMENTS[q.segment] ? q.segment : 'campestre';
  return { profile, weights: w, segment };
}

// ---------------- Vistas ----------------
export const tier = (s) => (s >= 80 ? 'caliente' : s >= 65 ? 'tibio' : 'frio');

export function rowView(m, r) {
  return {
    code: m.code, name: m.name, dpto: m.dpto, lat: m.lat, lon: m.lon, rank: r.rank, score: r.score, tier: tier(r.score), comp: r.comp,
    or: m.or_name, tarifa: m.tarifa, tarifa_com: m.tarifa_com, ghi: m.ghi, temp: m.temp, pop: m.pop,
    viv12: m.viv12 || 0, viv12_alto: m.viv12_alto || 0, nores12_m2: Math.round(m.nores12_m2 || 0),
    agpe_est: m.agpe_est ?? m.agpe_n ?? 0, agpe_10k: m.agpe_10k, secop_n: m.secop_n || 0,
    turismo_idx: m.turismo_idx || 0, rnt_hab: m.rnt_hab || 0, rnt_vivtur: m.rnt_vivtur || 0, dna_1k: m.dna_1k, dna_dias: m.dna_dias, zni_n: m.zni_n || 0, kv30: m.kv30, subarea: m.subarea,
    inst_n: m.inst_n || 0, inst_sol: m.inst_sol || 0, mayor_n: m.mayor_n || 0,
    sub_km: m.sub_km, sub_n: m.sub_n, sub_kv: m.sub_kv, solar30_mw: m.solar30_mw || 0, solar30: m.solar30 || 0, kwh_mes_alto: m.kwh_mes_alto,
    upme_n: m.upme_n || 0, upme_mw: Math.round(m.upme_mw || 0),
    saidi: m.saidi, saifi: m.saifi, col_n: m.col_n || 0, ips_n: m.ips_n || 0, cap_mw: m.cap_mw,
  };
}

export function payback(m, kwp = 6) {
  const t = m.tarifa_ult || m.tarifa;
  if (!t || !m.ghi) return null;
  const capex = getSetting('capex_kwp', config.capexKwp);
  const kwhYear = m.ghi * 365 * kwp * 0.78; // PR 0.78
  const ahorro = kwhYear * t;
  return { kwp, kwh_anual: Math.round(kwhYear), ahorro_anual: Math.round(ahorro), capex: Math.round(capex * kwp), anos: +(capex * kwp / ahorro).toFixed(1), capex_kwp: capex, tarifa: t };
}

function aggregateDptos() {
  const by = {};
  for (const m of store.municipios) {
    const d = (by[m.dpto_code] ||= { dpto_code: m.dpto_code, dpto: m.dpto, lat: 0, lon: 0, n: 0, pop: 0 });
    const w = m.pop || 1;
    d.lat += m.lat * w; d.lon += m.lon * w; d.pop += w; d.n++;
  }
  return Object.values(by).map((d) => ({ ...d, lat: d.lat / d.pop, lon: d.lon / d.pop }));
}

export function dptoScores(sc) {
  const acc = {};
  for (const r of sc.rows) {
    const m = store.byCode.get(r.code);
    const a = (acc[m.dpto_code] ||= { s: 0, n: 0, best: 0 });
    a.s += r.score; a.n++; a.best = Math.max(a.best, r.score);
  }
  return store.dpto.filter((d) => acc[d.dpto_code]).map((d) => {
    const a = acc[d.dpto_code];
    const score = Math.round(a.best * 0.6 + (a.s / a.n) * 0.4);
    return { dpto_code: d.dpto_code, dpto: d.dpto, lat: d.lat, lon: d.lon, score, tier: tier(score), municipios: a.n };
  });
}

export function projectsFor(code) {
  const base = store.proyectosBase.filter((p) => p.code === code).map((p) => ({ ...p, municipio: p.code, origen: 'datos abiertos' }));
  const own = db.prepare('SELECT * FROM projects WHERE municipio=? ORDER BY id DESC').all(code).map((p) => ({ ...p, origen: 'cargado' }));
  return [...own, ...base.sort((a, b) => (b.unidades || 0) - (a.unidades || 0))];
}

// ---------------- Demo de transformadores de distribución (CREG 174) ----------------
// Se carga la primera vez que se pide (son ~300.000 transformadores) y se indexa en una cuadrícula de 0,05°.
const TR = { loaded: false, ops: [], n: 0, grid: new Map(), munis: new Map() };
const tKey = (x, y) => `${Math.floor(x * 20)}|${Math.floor(y * 20)}`;
// Espacio para autogeneración según la regla del 50 % de la capacidad nominal (CREG 174, art. 6).
// Si el operador publica el disponible se usa; si publica la generación conectada se descuenta; si no, el límite es un máximo.
export function trafoCalc(r) {
  const [, , , kva, gd, disp] = r;
  const lim = kva * 0.5;
  const libre = disp != null ? Math.max(0, disp) : gd != null ? Math.max(0, lim - gd) : lim;
  const uso = lim > 0 ? Math.min(1.5, 1 - libre / lim) : null;
  const sd = disp == null && gd == null; // sin dato de generación conectada
  const sem = sd ? 'sd' : uso < 0.5 ? 'verde' : uso < 0.8 ? 'amarillo' : uso < 1 ? 'naranja' : 'rojo';
  return { lim, libre, uso, sem, sd };
}
// Se guarda en columnas (arreglos tipados) para ocupar poca memoria en el servidor
const nn = (v) => (Number.isNaN(v) ? null : v);
const r5 = (x) => Math.round(x * 1e5) / 1e5;
const trafoRow = (i) => [TR.id[i], r5(TR.lon[i]), r5(TR.lat[i]), TR.kva[i], nn(TR.gd[i]), nn(TR.disp[i]), TR.op[i], TR.codes[TR.code[i]], TR.us[i] < 0 ? null : TR.us[i], TR.circ[i] || null];
export function trafos() {
  if (TR.loaded) return TR;
  TR.loaded = true;
  const own = path.join(builtDir(), 'trafos_demo.json'), repo = path.join(ROOT, 'data', 'built', 'trafos_demo.json');
  const f = fs.existsSync(own) ? own : fs.existsSync(repo) ? repo : null;
  if (!f) return TR;
  let d = JSON.parse(fs.readFileSync(f, 'utf8'));
  const n = d.id.length;
  TR.ops = d.operadores || []; TR.n = n;
  TR.id = d.id; TR.circ = d.circ;
  TR.lon = Float32Array.from(d.lon); TR.lat = Float32Array.from(d.lat); TR.kva = Float32Array.from(d.kva);
  TR.gd = Float32Array.from(d.gd, (v) => v ?? NaN); TR.disp = Float32Array.from(d.disp, (v) => v ?? NaN);
  TR.op = Uint8Array.from(d.op); TR.us = Int16Array.from(d.us, (v) => (v == null ? -1 : Math.min(32000, v)));
  TR.codes = [...new Set(d.code)]; const ci = new Map(TR.codes.map((c, i) => [c, i]));
  TR.code = Uint16Array.from(d.code, (c) => ci.get(c));
  const cells = new Map();
  for (let i = 0; i < n; i++) {
    const r = trafoRow(i);
    const k = tKey(d.lon[i], d.lat[i]);
    if (!cells.has(k)) cells.set(k, []);
    cells.get(k).push(i);
    const c = trafoCalc(r);
    const a = TR.munis.get(r[7]) || { n: 0, kva: 0, libre: 0, espacio: 0, gd: 0, gd_n: 0, sd: 0, ops: new Set() };
    a.n++; a.kva += r[3]; a.libre += c.libre; if (c.libre >= 3) a.espacio++; if (r[4]) { a.gd += r[4]; a.gd_n++; } if (c.sd) a.sd++; a.ops.add(r[6]);
    TR.munis.set(r[7], a);
  }
  for (const [k, v] of cells) TR.grid.set(k, Int32Array.from(v));
  d = null;
  console.log(`Demo de transformadores: ${n} en ${TR.munis.size} municipios`);
  return TR;
}
export function trafosBbox([w, s, e, n], limit = 8000) {
  const T = trafos();
  const out = [];
  for (let gx = Math.floor(w * 20); gx <= Math.floor(e * 20); gx++) for (let gy = Math.floor(s * 20); gy <= Math.floor(n * 20); gy++) {
    for (const i of T.grid.get(`${gx}|${gy}`) || []) if (T.lon[i] >= w && T.lon[i] <= e && T.lat[i] >= s && T.lat[i] <= n) out.push(i);
  }
  const total = out.length;
  const idx = total > limit ? out.sort((a, b) => T.kva[b] - T.kva[a]).slice(0, limit) : out;
  return { total, rows: idx.map(trafoRow) };
}
export function trafosMuni(code) {
  const T = trafos();
  const a = T.munis.get(code);
  if (!a) return null;
  // Distribución por tamaño y por semáforo (se recorre la base: es rápido)
  const tam = { '≤ 15 kVA': 0, '15-50 kVA': 0, '50-150 kVA': 0, '> 150 kVA': 0 }, sem = { verde: 0, amarillo: 0, naranja: 0, rojo: 0, sd: 0 };
  const ci = T.codes.indexOf(code);
  for (let i = 0; i < T.n; i++) {
    if (T.code[i] !== ci) continue;
    const r = trafoRow(i);
    tam[r[3] <= 15 ? '≤ 15 kVA' : r[3] <= 50 ? '15-50 kVA' : r[3] <= 150 ? '50-150 kVA' : '> 150 kVA']++;
    sem[trafoCalc(r).sem]++;
  }
  return { n: a.n, kva: Math.round(a.kva), libre_kw: Math.round(a.libre), espacio: a.espacio, gd_kw: Math.round(a.gd), gd_n: a.gd_n, sin_gd: a.sd, ops: [...a.ops].map((i) => T.ops[i]?.nombre), tam, sem };
}
