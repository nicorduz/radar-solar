import fs from 'node:fs';
import path from 'node:path';
import { ROOT, STORAGE, config } from './config.js';
import { db, getSetting } from './db.js';

export const store = { municipios: [], byCode: new Map(), secop: [], empresas: [], proyectosBase: [], clientes: [], ci: [], ciAnio: null, red: null, meta: {} };

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
  store.dpto = aggregateDptos();
  cache.clear();
  console.log(`Datos cargados desde ${dir}: ${store.municipios.length} municipios`);
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
    metrics: ['score', 'ghi', 'sub_km', 'solar30_mw', 'upme_mw', 'tarifa_com'],
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
      dias: { label: 'Días con cortes al año', get: (m) => m.dna_dias },
      tarifa: { label: 'Tarifa de energía', get: (m) => m.tarifa },
      turismo: { label: 'Hoteles y turismo', get: (m) => m.turismo_idx },
      comercio: { label: 'Comercio y obra no residencial', get: (m) => L(m.nores12_m2) },
      aislado: { label: 'Localidades sin red', get: (m) => m.zni_n || 0 },
    },
    weights: { contingencias: 35, dias: 15, tarifa: 15, turismo: 15, comercio: 10, aislado: 10 },
    metrics: ['score', 'dna_1k', 'tarifa', 'turismo_idx', 'ghi'],
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
