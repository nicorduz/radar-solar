export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, credentials: 'same-origin', headers: {} };
  if (form) opts.body = form;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(`/api${path}`, opts);
  let data = null;
  try { data = await r.json(); } catch { /* vacío */ }
  if (!r.ok) {
    const err = new Error(data?.error || `Error ${r.status}`);
    err.status = r.status; err.data = data;
    throw err;
  }
  return data;
}

export const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const weightParams = (weights, segment) => ({ segment, ...Object.fromEntries(Object.entries(weights || {}).map(([k, v]) => [`w_${k}`, v])) });

export const fmt = (n, d = 0) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('es-CO', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
export const cop = (n) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('es-CO'));
export const money = (n) => {
  if (n == null) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toLocaleString('es-CO', { maximumFractionDigits: 1 })} mil M`;
  if (n >= 1e6) return `$${(n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`;
  return cop(n);
};

// Métricas que se pueden mostrar en el mapa y como columnas del ranking, según el perfil
export const METRICS = {
  score: { label: 'Puntaje', short: 'Puntaje', get: (d) => d.score, f: (v) => fmt(v), unit: '/100' },
  tarifa: { label: 'Tarifa residencial $/kWh', short: 'Tarifa', get: (d) => d.tarifa, f: (v) => fmt(v), unit: '$/kWh' },
  tarifa_com: { label: 'Tarifa comercial $/kWh', short: 'Tarifa com.', get: (d) => d.tarifa_com ?? d.tarifa, f: (v) => fmt(v), unit: '$/kWh' },
  viv12: { label: 'Vivienda nueva 12 meses', short: 'Viv. 12m', get: (d) => d.viv12, f: (v) => fmt(v), unit: 'und.', log: true },
  turismo_idx: { label: 'Índice turístico', short: 'Turismo', get: (d) => d.turismo_idx, f: (v) => fmt(v, 0), unit: '', log: true },
  dna_1k: { label: 'Cortes de energía (kWh no atendidos / 1.000 hab.)', short: 'Cortes', get: (d) => d.dna_1k, f: (v) => fmt(v, 0), unit: 'kWh/1.000 hab.', log: true },
  ghi: { label: 'Radiación kWh/m²/día', short: 'Radiación', get: (d) => d.ghi, f: (v) => fmt(v, 2), unit: 'kWh/m²/día' },
  temp: { label: 'Temperatura °C', short: '°C', get: (d) => d.temp, f: (v) => fmt(v, 1), unit: '°C' },
  inst_n: { label: 'Instaladores registrados', short: 'Instaladores', get: (d) => d.inst_n, f: (v) => fmt(v), unit: 'empresas', log: true },
  agpe_est: { label: 'Autogeneradores estimados', short: 'AGPE est.', get: (d) => d.agpe_est, f: (v) => fmt(v), unit: 'sistemas', log: true },
  sub_km: { label: 'Distancia a subestación (km)', short: 'Subest. km', get: (d) => d.sub_km, f: (v) => (v != null && v < 0.5 ? 'en el mpio.' : fmt(v, 1)), unit: 'km', invert: true },
  upme_mw: { label: 'MW registrados en la UPME', short: 'MW UPME', get: (d) => d.upme_mw, f: (v) => fmt(v), unit: 'MW', log: true },
  solar30_mw: { label: 'MW solares a 30 km', short: 'MW solar 30 km', get: (d) => d.solar30_mw, f: (v) => fmt(v), unit: 'MW', log: true },
};

export const PROFILE_ICONS = { instalador: 'home', proveedor: 'box', desarrollador: 'bolt' };

export const csvDownload = (name, head, rows) => {
  const blob = new Blob(['﻿' + [head, ...rows].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
};
