// Capas adicionales: tarifas SUI 2026, autogeneradores XM vigentes, demanda no atendida (contingencias),
// turismo (RNT), red de transmisión y plantas (XM Paratec), zonas no interconectadas (IPSE) y contactos de empresas (SECOP).
import { ORS, matchOrKey } from './catalogs.js';

export const norm = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export function km(lat1, lon1, lat2, lon2) {
  const R = 6371, r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Departamento (nombre normalizado) → código DANE
export function dptoIndex(munis) {
  const idx = {};
  for (const m of munis.values()) idx[norm(m.dpto)] = m.dpto_code;
  Object.assign(idx, { 'BOGOTA D C': '11', BOGOTA: '11', 'SAN ANDRES': '88', 'NARINO': '52', 'ARCHIPIELAGO DE SAN ANDRES PROVIDENCIA Y SANTA CATALINA': '88', 'VALLE': '76' });
  return (name) => idx[norm(name)] ?? idx[norm(name).replace(/ D C$/, '')] ?? null;
}

// ---------------- Tarifas SUI (reporte de facturación cargado por el administrador) ----------------
export function applySuiPrecios(munis, rows, tarifas, log, dptoCode) {
  if (!rows?.length) return null;
  const years = [...new Set(rows.map((r) => r.anio).filter(Boolean))].sort();
  const year = years[years.length - 1];
  const ok = (v) => v && v > 400 && v < 1600; // descarta celdas dañadas o tarifas de mercado no regulado
  const res = {}; // or|dpto -> {res:[], com:[]}
  const consumo = {}; // dpto -> {kwh, sus} estratos altos (todas las empresas reguladas)
  let periodos = 0;
  for (const r of rows) {
    if (r.anio !== year || r.tipo !== 'Regulado') continue;
    const dc = dptoCode(r.dpto); if (!dc) continue;
    periodos = Math.max(periodos, r.periodos || 0);
    if (/Residencial (Alto|Medio-Alto)/.test(r.estrato) && r.consumo_kwh && r.suscriptores) {
      const c = (consumo[dc] ||= { kwh: 0, sus: 0, sus_alto: 0 });
      c.kwh += r.consumo_kwh / (r.periodos || 1); c.sus += r.suscriptores;
      c.sus_alto += r.suscriptores;
    }
    const k = matchOrKey(String(r.empresa).replace(/^\d+\s*-\s*/, '')); if (!k) continue;
    const key = `${k === 'CELSIA' ? (dc === '73' ? 'CELSIA_TOL' : 'CELSIA_VAL') : k}|${dc}`;
    const e = (res[key] ||= { res: [], com: [], sus: 0 });
    if (/^Residencial/.test(r.estrato) && ok(r.cop_kwh)) { e.res.push(r.cop_kwh); e.sus += r.suscriptores || 0; }
    if (r.estrato === 'Comercial' && ok(r.cop_kwh)) e.com.push(r.cop_kwh);
  }
  // Por operador: el departamento con más suscriptores es su referencia
  const byOr = {};
  for (const [key, e] of Object.entries(res)) {
    const [k] = key.split('|');
    if (e.res.length && (!byOr[k] || e.sus > byOr[k].sus)) byOr[k] = { res: median(e.res), com: e.com.length ? median(e.com) : null, sus: e.sus };
  }
  const periodo = `${year} (${periodos} meses)`;
  for (const [k, v] of Object.entries(byOr)) {
    Object.assign((tarifas[k] ||= {}), { base: Math.round(v.res), base_periodo: periodo, base_fuente: 'SUI · facturación a usuarios regulados, estratos 4 a 6 (archivo cargado)', comercial: v.com ? Math.round(v.com) : null });
  }
  let n = 0;
  for (const m of munis.values()) {
    if (!m.or_key) continue;
    const e = res[`${m.or_key}|${m.dpto_code}`];
    const t = e?.res.length ? median(e.res) : byOr[m.or_key]?.res;
    const tc = e?.com.length ? median(e.com) : byOr[m.or_key]?.com;
    if (t) { m.tarifa = Math.round(t); m.tarifa_periodo = periodo; n++; }
    if (tc) m.tarifa_com = Math.round(tc);
    const c = consumo[m.dpto_code];
    if (c?.sus) { m.kwh_mes_alto = Math.round(c.kwh / c.sus); m.sus_alto_dpto = Math.round(c.sus_alto); }
  }
  log.push(`tarifas SUI ${periodo}: ${Object.keys(byOr).length} operadores, ${n} municipios`);
  return periodo;
}

// ---------------- Autogeneradores vigentes (XM, listado AGPE por mercado de comercialización) ----------------
const ZONE_OR = {
  ANTIOQUIA: 'EPM', 'CARIBE SOL': 'AIRE', 'CARIBE MAR': 'AFINIA', 'NORTE DE SANTANDER': 'CENS', 'BOGOTA - CUNDINAMARCA': 'ENEL',
  SANTANDER: 'ESSA', CALDAS: 'CHEC', 'VALLE DEL CAUCA': 'CELSIA_VAL', HUILA: 'ELECTROHUILA', PEREIRA: 'EEP', CESAR: 'AFINIA',
  QUINDIO: 'EDEQ', TOLIMA: 'CELSIA_TOL', META: 'EMSA', BOYACA: 'EBSA', RUITOQUE: 'RUITOQUE', 'CALI - YUMBO - PUERTO TEJADA': 'EMCALI',
  CARTAGO: 'EMCARTAGO', CASANARE: 'ENERCA', CAUCA: 'CEO', TULUA: 'CETSA', CHOCO: 'DISPAC', 'NARIÑO': 'CEDENAR', NARINO: 'CEDENAR',
  ARAUCA: 'ENELAR', 'BAJO PUTUMAYO': 'PUTUMAYO', CAQUETA: 'ELECTROCAQUETA',
};
export function zoneOf(m) {
  if (!m.or_key) return null;
  if (m.or_key === 'AFINIA') return m.dpto_code === '20' ? 'CESAR' : 'CARIBE MAR';
  return Object.keys(ZONE_OR).find((z) => ZONE_OR[z] === m.or_key && z !== 'NARINO') || null;
}
export function applyAgpeXm(munis, xm, log) {
  if (!xm?.items?.length) return null;
  const zones = {};
  for (const a of xm.items) {
    const z = (zones[a.zone] ||= { n: 0, kw: 0, solar: 0, nt1: 0 });
    z.n++; z.kw += a.kw || 0; if (/SOLAR/.test(a.src)) z.solar++; if (a.vl === 1) z.nt1++;
  }
  // Reparto del total de cada mercado entre sus municipios: proporcional a los autogeneradores del SUI (2021) y a la población
  const byZone = {};
  for (const m of munis.values()) { const z = zoneOf(m); if (z) (byZone[z] ||= []).push(m); }
  for (const [z, ms] of Object.entries(byZone)) {
    const tot = zones[z]; if (!tot) continue;
    const w = ms.map((m) => (m.agpe_n || 0) * 3 + (m.pop || 0) / 10000);
    const sw = w.reduce((a, b) => a + b, 0) || 1;
    const zpop = ms.reduce((a, m) => a + (m.pop || 0), 0) || 1;
    ms.forEach((m, i) => {
      m.agpe_zone = z; m.agpe_zone_n = tot.n; m.agpe_zone_mw = +(tot.kw / 1000).toFixed(1);
      m.agpe_zone_10k = +(tot.n / zpop * 10000).toFixed(1);
      m.agpe_est = Math.round(tot.n * w[i] / sw);
      m.agpe_est_kw = Math.round(tot.kw * w[i] / sw);
      m.agpe_10k = m.pop ? +(m.agpe_est / m.pop * 10000).toFixed(1) : null;
    });
  }
  log.push(`autogeneradores XM ${xm.fecha}: ${xm.items.length} en ${Object.keys(zones).length} mercados`);
  return Object.fromEntries(Object.entries(zones).map(([k, v]) => [k, { ...v, mw: +(v.kw / 1000).toFixed(1), or: ZONE_OR[k] ? ORS[ZONE_OR[k]].name : null }]));
}

// ---------------- Demanda no atendida por subárea (XM): contingencias, cortes y racionamientos ----------------
export const SUBAREA_DPTOS = {
  'SUBAREA VALLE': ['76'], 'SUBAREA GCM': ['44', '20', '47'], 'SUBAREA BOLIVAR': ['13'], 'SUBAREA ANTIOQUIA': ['05', '27'],
  'SUBAREA ATLANTICO': ['08'], 'SUBAREA CQR': ['17', '63', '66'], 'SUBAREA CORDOBA_SUCRE': ['23', '70'], 'SUBAREA META': ['50', '95'],
  'SUBAREA BOYACA-CASANARE': ['15', '85'], 'SUBAREA SANTANDER': ['68'], 'SUBAREA CAUCA-NARINO': ['19', '52'],
  'SUBAREA NORTE DE SANTANDER': ['54'], 'SUBAREA BOGOTA': ['11', '25'], 'SUBAREA ARAUCA': ['81'], 'SUBAREA PUTUMAYO': ['86'],
  'SUBAREA HUILA-TOLIMA': ['41', '73'], 'SUBAREA CAQUETA': ['18'],
};
export function applyDna(munis, op, log) {
  if (!op?.DemaNoAtenNoProg) return null;
  const sub = {};
  const add = (r, k) => {
    const s = (sub[r.subarea] ||= { prog: 0, noprog: 0, dias: new Set(), mes: {} });
    s[k] += r.kwh;
    if (r.kwh > 0) s.dias.add(r.fecha);
    const mm = r.fecha.slice(0, 7); s.mes[mm] = (s.mes[mm] || 0) + r.kwh;
  };
  for (const r of op.DemaNoAtenNoProg) add(r, 'noprog');
  for (const r of op.DemaNoAtenProg || []) add(r, 'prog');
  const dptoSub = {};
  for (const [s, ds] of Object.entries(SUBAREA_DPTOS)) for (const d of ds) dptoSub[d] = s;
  const popSub = {};
  for (const m of munis.values()) { const s = dptoSub[m.dpto_code]; if (s) popSub[s] = (popSub[s] || 0) + (m.pop || 0); }
  const fechas = op.DemaNoAtenNoProg.map((r) => r.fecha).sort();
  const periodo = `${fechas[0]} a ${fechas[fechas.length - 1]}`;
  const summary = {};
  for (const [s, v] of Object.entries(sub)) {
    const pop = popSub[s];
    summary[s] = { kwh: Math.round(v.prog + v.noprog), noprog: Math.round(v.noprog), prog: Math.round(v.prog), dias: v.dias.size, kwh_1k: pop ? +((v.prog + v.noprog) / pop * 1000).toFixed(1) : null, mes: Object.entries(v.mes).sort().map(([p, k]) => ({ p, v: Math.round(k) })) };
  }
  for (const m of munis.values()) {
    const s = dptoSub[m.dpto_code]; if (!s || !summary[s]) continue;
    m.subarea = s.replace('SUBAREA ', '');
    m.dna_1k = summary[s].kwh_1k; m.dna_dias = summary[s].dias; m.dna_mwh = Math.round(summary[s].kwh / 1000);
  }
  log.push(`demanda no atendida XM: ${Object.keys(sub).length} subáreas, ${periodo}`);
  return { periodo, subareas: summary };
}

// ---------------- Precio de bolsa (XM) ----------------
export function precioBolsa(op) {
  const pb = op?.precio_bolsa || [];
  const mes = {};
  for (const r of pb) { const k = r.fecha.slice(0, 7); (mes[k] ||= []).push(r.v); }
  return Object.entries(mes).sort().map(([p, v]) => ({ p, v: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }));
}

// ---------------- Turismo (Registro Nacional de Turismo, MinCIT) ----------------
// Los conteos salen del agregado del RNT; las habitaciones, de la lista depurada de alojamientos (clientes).
export function applyTurismo(munis, agg, clientes, log) {
  if (!agg?.length) return;
  const useList = clientes?.length > 1000;
  for (const r of agg) {
    const m = munis.get(String(r.cod_mun).padStart(5, '0')); if (!m) continue;
    const n = +r.n || 0, hab = useList ? 0 : +r.hab || 0;
    m.rnt_total = (m.rnt_total || 0) + n;
    if (/ALOJAMIENTO/.test(r.categoria)) { m.rnt_aloj = (m.rnt_aloj || 0) + n; m.rnt_hab = (m.rnt_hab || 0) + hab; }
    if (/VIVIENDAS TUR/.test(r.categoria)) { m.rnt_vivtur = (m.rnt_vivtur || 0) + n; m.rnt_vivtur_hab = (m.rnt_vivtur_hab || 0) + hab; }
    if (/PARQUES/.test(r.categoria)) m.rnt_parques = (m.rnt_parques || 0) + n;
  }
  if (useList) for (const c of clientes) {
    const m = munis.get(c.code); if (!m) continue;
    if (/ALOJAMIENTO/.test(c.cat)) m.rnt_hab = (m.rnt_hab || 0) + c.hab;
    else if (/VIVIENDAS TUR/.test(c.cat)) m.rnt_vivtur_hab = (m.rnt_vivtur_hab || 0) + c.hab;
  }
  for (const m of munis.values()) {
    const intens = (m.rnt_hab || 0) + (m.rnt_vivtur_hab || 0) + (m.rnt_vivtur || 0);
    m.turismo_idx = intens ? +(intens / Math.sqrt(Math.max(m.pop || 1000, 1000)) * 10).toFixed(1) : 0;
  }
  log.push(`turismo RNT: ${agg.length} grupos municipio-categoría`);
}

export function clientesTuristicos(rows, munis) {
  const companyNit = (nit) => /^[89]\d{8}$/.test(String(nit || '').replace(/\D/g, ''));
  return rows.map((r) => {
    const code = String(r.cod_mun).padStart(5, '0');
    if (!munis.has(code)) return null;
    const pj = companyNit(r.nit);
    const tel = [r.num_celular, r.n_m_tel_fono].find((t) => t && !/sin dato/i.test(t)) || null;
    return {
      id: r.codigo_rnt, code, n: r.razon_social_establecimiento, cat: r.categoria.replace('ESTABLECIMIENTOS DE ', '').replace(' TURÍSTICO', ''), sub: r.sub_categoria,
      // Algunos registros traen habitaciones mayores que camas (error de digitación): se corrige
      // con un tope según el número de empleados reportado (p. ej. "1.111 habitaciones" con 1 empleado).
      ...(() => {
        const h0 = +r.habitaciones || 0, c = +r.camas || 0, e = +r.num_emp1 || 0;
        let h = c > 0 && h0 > c ? Math.ceil(c / 2) : h0;
        h = Math.min(h, Math.max(30, e * 25), 1200);
        return { hab: h, hab_reportadas: h !== h0 ? h0 : undefined };
      })(), camas: +r.camas || 0, emp: +r.num_emp1 || 0, dir: r.direcci_n_comercial_establecimiento || null,
      pj, tel: pj ? tel : null, mail: pj && r.correo_establecimiento && !/sin dato/i.test(r.correo_establecimiento) ? r.correo_establecimiento : null,
    };
  }).filter(Boolean).sort((a, b) => b.hab - a.hab);
}

// ---------------- Red de transmisión, subestaciones y plantas (XM Paratec) ----------------
export function applyRed(munis, subsRaw, plantsRaw, linesRaw, findMuni, log) {
  const subs = (subsRaw?.data || []).filter((s) => s.latitude && s.longitude).map((s) => ({
    n: s.elementName, lat: s.latitude, lon: s.longitude, kv: s.voltages, op: s.operatorCompanyName, sub: s.subArea, dpto: s.department,
    kvmax: Math.max(...String(s.voltages).match(/\d+(\.\d+)?/g).map(Number)), desde: (s.fpoDate || '').slice(0, 4),
  }));
  const plantas = (plantsRaw?.data || []).filter((p) => p.lat && p.lng).map((p) => ({
    n: p.elementName, tipo: p.type, lat: p.lat, lon: p.lng, mw: p.netEffectiveCapacity || p.ratedPower || 0, estado: p.elementStateName,
    op: p.operatorCompanyName, kv: p.connectionVoltage, dpto: p.department, mun: p.municipality, desde: (p.fpoDate || '').slice(0, 10) || null,
    code: findMuni(p.department, p.municipality),
  }));
  const lineas = (linesRaw?.data || []).map((l) => ({ n: l.properties.nameLine, kv: l.properties.energy, op: l.properties.operator, c: l.geometry.coordinates }));
  for (const m of munis.values()) {
    if (m.lat == null) continue;
    let best = null, n30 = 0, kv30 = 0;
    for (const s of subs) {
      const d = km(m.lat, m.lon, s.lat, s.lon);
      if (!best || d < best.d) best = { d, s };
      if (d <= 30) { n30++; kv30 = Math.max(kv30, s.kvmax); }
    }
    if (best) { m.sub_km = +best.d.toFixed(1); m.sub_n = best.s.n; m.sub_kv = best.s.kv; m.sub_op = best.s.op; m.subs30 = n30; m.kv30 = kv30 || null; }
    let solar30 = 0, solar30mw = 0;
    for (const p of plantas) if (p.tipo === 'solar' && km(m.lat, m.lon, p.lat, p.lon) <= 30) { solar30++; solar30mw += p.mw; }
    m.solar30 = solar30; m.solar30_mw = Math.round(solar30mw);
  }
  for (const p of plantas) if (p.code && munis.has(p.code) && p.tipo === 'solar') { const m = munis.get(p.code); m.solar_n = (m.solar_n || 0) + 1; m.solar_mw = +((m.solar_mw || 0) + p.mw).toFixed(1); }
  log.push(`red XM Paratec: ${lineas.length} líneas, ${subs.length} subestaciones, ${plantas.length} plantas`);
  return { subs, plantas, lineas };
}

// ---------------- Zonas no interconectadas (IPSE) ----------------
export function applyZni(munis, zni, cps, log) {
  if (!zni?.length) return [];
  const cp = {};
  for (const c of cps || []) cp[c.codigo_centro_poblado] = { lat: num(c.latitud), lon: num(c.longitud) };
  const last = {};
  for (const r of zni) { const k = r.id_localidad; const t = +r.anio * 100 + +r.mes; if (!last[k] || t > last[k].t) last[k] = { t, r, horas: [], kwh: [] }; }
  for (const r of zni) { const L = last[r.id_localidad]; if (+r.anio * 100 + +r.mes > L.t - 100) { L.horas.push(+r.prom_diario_horas || 0); L.kwh.push(+r.energia_activa || 0); } }
  const puntos = [];
  for (const { r, horas, kwh } of Object.values(last)) {
    const code = String(r.id_mpio).padStart(5, '0');
    const m = munis.get(code);
    const pos = cp[r.id_localidad] || (m ? { lat: m.lat, lon: m.lon } : null);
    if (!pos?.lat) continue;
    const h = +(horas.reduce((a, b) => a + b, 0) / horas.length).toFixed(1);
    puntos.push({ n: r.localidad.replace(/\s*\(.*$/, ''), code, dpto: r.dpto, mpio: r.mpio, lat: pos.lat, lon: pos.lon, horas: h, kwh_mes: Math.round(kwh.reduce((a, b) => a + b, 0) / kwh.length), ultimo: `${r.anio}-${String(r.mes).padStart(2, '0')}` });
    if (m) { m.zni_n = (m.zni_n || 0) + 1; m.zni_horas = h; }
  }
  log.push(`zonas no interconectadas IPSE: ${puntos.length} localidades`);
  return puntos;
}
