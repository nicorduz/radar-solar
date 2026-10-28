import React, { useEffect, useMemo, useState } from 'react';
import { api, fmt, money, cop, csvDownload } from '../api.js';
import { useApp } from '../App.jsx';
import { Stat, ContactCTA } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

// Calculadora financiera de un sistema solar: retorno, financiación y beneficios tributarios
// (Ley 1715 de 2014 modificada por la Ley 2099 de 2021, reglamentada por el Decreto 895 de 2022).
const IVA_EQUIPOS = 0.19 * 0.7; // IVA de 19 % sobre la parte de equipos, supuesta en 70 % del costo

export function model(p) {
  const empresa = p.tipo === 'empresa';
  const t = empresa ? p.renta / 100 : 0;
  const capex = p.kwp * p.capexKwp * (p.ivaExcluido ? 1 : 1 + IVA_EQUIPOS);
  const loan = capex * (p.financiado / 100);
  const n = Math.max(1, Math.round(p.plazo));
  const rm = Math.pow(1 + p.tasa / 100, 1 / 12) - 1;
  const cuotaMes = loan ? (rm ? (loan * rm) / (1 - Math.pow(1 + rm, -12 * n)) : loan / (12 * n)) : 0;
  const deducTotal = empresa && p.deduccion ? capex * 0.5 : 0;
  const deducAnios = Math.max(1, Math.min(15, Math.round(p.deducAnios)));
  const topeDeduc = empresa && p.rentaLiquida ? p.rentaLiquida * 0.5 : Infinity; // no puede superar 50 % de la renta líquida
  const depAnios = p.depAcelerada ? 3 : 10;
  let saldo = loan, deducPend = deducTotal, acum = -(capex - loan);
  const rows = [{ y: 0, gen: 0, ahorro: 0, om: 0, deuda: 0, impuestos: 0, flujo: acum, acum }];
  for (let y = 1; y <= p.vida; y++) {
    const gen = p.ghi * 365 * p.kwp * (p.pr / 100) * Math.pow(1 - p.degr / 100, y - 1);
    const tar = p.tarifa * Math.pow(1 + p.incr / 100, y - 1);
    const ahorro = gen * (p.autoconsumo / 100) * tar + gen * (1 - p.autoconsumo / 100) * p.exportPrecio * Math.pow(1 + p.incr / 100, y - 1);
    const om = capex * (p.om / 100) * Math.pow(1 + p.incr / 100, y - 1);
    let deuda = 0, interes = 0;
    if (y <= n && loan) {
      for (let k = 0; k < 12; k++) { const i = saldo * rm; interes += i; saldo -= cuotaMes - i; }
      deuda = cuotaMes * 12;
    }
    let imp = 0;
    if (empresa) {
      const dep = y <= depAnios ? capex / depAnios : 0;
      const deduc = deducPend > 1 && y <= 15 ? Math.min(deducPend, deducTotal / deducAnios, topeDeduc) : 0; // lo que no cabe por el tope pasa al año siguiente
      deducPend -= deduc;
      // El ahorro sube la utilidad (paga renta); depreciación, intereses y la deducción especial la bajan
      imp = -(ahorro - om) * t + (dep + interes + deduc) * t;
    }
    const flujo = ahorro - om - deuda + imp;
    acum += flujo;
    rows.push({ y, gen, tar, ahorro, om, deuda, impuestos: imp, flujo, acum });
  }
  const flows = rows.map((r) => r.flujo);
  const vpn = flows.reduce((a, f, i) => a + f / Math.pow(1 + p.descuento / 100, i), 0);
  const npv = (r) => flows.reduce((a, f, i) => a + f / Math.pow(1 + r, i), 0);
  let tir = null;
  if (flows[0] < 0 && npv(0) > 0) { let lo = 0, hi = 5; for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; } tir = lo * 100; }
  let payback = null;
  for (let i = 1; i < rows.length; i++) if (rows[i].acum >= 0 && rows[i - 1].acum < 0) { payback = i - 1 + (-rows[i - 1].acum / rows[i].flujo); break; }
  const beneficios = rows.reduce((a, r) => a + Math.max(0, r.impuestos + (r.ahorro - r.om) * t), 0);
  return { capex, loan, cuotaMes, rows, vpn, tir, payback, beneficios, deducTotal, ahorroMes1: rows[1] ? rows[1].ahorro / 12 : 0, ahorroTotal: rows.reduce((a, r) => a + r.ahorro, 0) };
}

export default function Calculadora({ code }) {
  const { meta, paid, profile } = useApp();
  const [munis, setMunis] = useState([]);
  const [m, setM] = useState(null);
  const [sel, setSel] = useState('');
  const [p, setP] = useState({
    tipo: profile === 'desarrollador' || profile === 'proveedor' ? 'empresa' : 'hogar', kwp: 6, capexKwp: meta.capex_kwp || 3800000, tarifa: 900, ghi: 4.5, pr: 78,
    autoconsumo: 100, exportPrecio: 300, incr: 4, degr: 0.5, om: 1, vida: 25, financiado: 0, tasa: 18, plazo: 5, descuento: 12,
    renta: 35, deduccion: true, deducAnios: 5, rentaLiquida: '', depAcelerada: true, ivaExcluido: false,
  });
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  const [tabla, setTabla] = useState(false);

  useEffect(() => { if (paid) api('/ranking?limit=1200').then((r) => setMunis(r.rows.map((x) => ({ code: x.code, name: x.name, dpto: x.dpto })))).catch(() => {}); }, [paid]);
  const load = (c) => api(`/municipio/${c}`).then((x) => {
    setM(x);
    setP((o) => ({ ...o, ghi: +(x.ghi || o.ghi).toFixed(2), tarifa: Math.round((o.tipo === 'empresa' ? x.tarifa_com ?? x.tarifa : x.tarifa ?? x.tarifa_ult) || o.tarifa), exportPrecio: Math.round(((o.tipo === 'empresa' ? x.tarifa_com ?? x.tarifa : x.tarifa) || o.tarifa) * 0.4) }));
  }).catch(() => {});
  useEffect(() => { if (code && paid) load(code); }, [code, paid]);
  const setTipo = (tipo) => setP((o) => ({ ...o, tipo, ivaExcluido: tipo === 'empresa', ...(m ? { tarifa: Math.round((tipo === 'empresa' ? m.tarifa_com ?? m.tarifa : m.tarifa ?? m.tarifa_ult) || o.tarifa) } : {}) }));

  const r = useMemo(() => model({ ...p, rentaLiquida: +p.rentaLiquida || 0 }), [p]);
  if (!paid) return <div className="page" style={{ maxWidth: 900 }}><h1>Calculadora financiera</h1><ContactCTA text="Calcula retorno, cuota del crédito, valor presente, TIR y beneficios tributarios de cualquier sistema solar, con la tarifa y el sol de cada municipio." /></div>;

  const N = (k, label, props = {}) => (
    <label className="f">{label}<input className="input mono" type="number" value={p[k]} onChange={(e) => set(k, e.target.value === '' ? '' : +e.target.value)} {...props} /></label>
  );
  const maxAbs = Math.max(1, ...r.rows.map((x) => Math.abs(x.acum)));
  const csv = () => csvDownload('flujo-de-caja.csv', ['anio', 'generacion_kwh', 'ahorro', 'operacion_mantenimiento', 'pago_credito', 'efecto_impuestos', 'flujo', 'acumulado'], r.rows.map((x) => [x.y, Math.round(x.gen), Math.round(x.ahorro), Math.round(x.om), Math.round(x.deuda), Math.round(x.impuestos), Math.round(x.flujo), Math.round(x.acum)]));

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div><h1>Calculadora financiera</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Retorno, financiación y beneficios tributarios de un sistema solar. Elige un municipio para usar su tarifa y su radiación.</p></div>
        <div className="row" style={{ gap: 6 }}>
          <input className="input" list="calc-munis" style={{ maxWidth: 260 }} placeholder={m ? `${m.name} · ${m.dpto}` : 'Municipio'} value={sel} onChange={(e) => { setSel(e.target.value); const x = munis.find((y) => `${y.name} · ${y.dpto}` === e.target.value); if (x) { load(x.code); setSel(''); } }} aria-label="Municipio" />
          <datalist id="calc-munis">{munis.map((x) => <option key={x.code} value={`${x.name} · ${x.dpto}`} />)}</datalist>
          {m && <a className="btn sm" href={`#/propuesta/${m.code}`}><Icon name="pdf" size={14} />Propuesta PDF</a>}
        </div>
      </div>

      <div className="calc">
        <div className="card calc-in">
          <div className="seg">{[['hogar', 'Hogar'], ['empresa', 'Empresa o negocio']].map(([k, l]) => <button key={k} className={p.tipo === k ? 'on' : ''} onClick={() => setTipo(k)}>{l}</button>)}</div>
          <h3>Sistema</h3>
          <div className="grid g2">
            {N('kwp', 'Potencia (kWp)', { min: 1, step: 1 })}
            {N('capexKwp', 'Costo por kWp (COP)', { min: 0, step: 100000 })}
            {N('tarifa', 'Tarifa ($/kWh)', { min: 0 })}
            {N('ghi', 'Radiación (kWh/m²/día)', { min: 0, step: 0.1 })}
            {N('autoconsumo', 'Autoconsumo (%)', { min: 0, max: 100 })}
            {N('exportPrecio', 'Valor de excedentes ($/kWh)', { min: 0 })}
          </div>
          <details><summary className="small">Supuestos técnicos</summary>
            <div className="grid g2" style={{ marginTop: 8 }}>
              {N('pr', 'Rendimiento del sistema (%)', { min: 50, max: 95 })}
              {N('degr', 'Pérdida anual de paneles (%)', { min: 0, max: 2, step: 0.1 })}
              {N('incr', 'Aumento anual de tarifa (%)', { min: 0, max: 20, step: 0.5 })}
              {N('om', 'Mantenimiento anual (% del costo)', { min: 0, max: 5, step: 0.1 })}
              {N('vida', 'Vida útil (años)', { min: 10, max: 30 })}
              {N('descuento', 'Tasa de descuento (%)', { min: 0, max: 40 })}
            </div>
          </details>
          <h3>Financiación</h3>
          <div className="grid g3">
            {N('financiado', 'Financiado (%)', { min: 0, max: 100, step: 5 })}
            {N('tasa', 'Tasa efectiva anual (%)', { min: 0, max: 60, step: 0.5 })}
            {N('plazo', 'Plazo (años)', { min: 1, max: 15 })}
          </div>
          {p.tipo === 'empresa' && (<>
            <h3>Beneficios tributarios</h3>
            <div className="grid g2">
              {N('renta', 'Tarifa de renta (%)', { min: 0, max: 50 })}
              <label className="f">Renta líquida anual (opcional, COP)<input className="input mono" type="number" min="0" value={p.rentaLiquida} placeholder="Sin tope" onChange={(e) => set('rentaLiquida', e.target.value)} /></label>
            </div>
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={p.deduccion} onChange={(e) => set('deduccion', e.target.checked)} />Deducir de la renta el 50 % de la inversión en</label>
            {p.deduccion && <div className="row" style={{ gap: 6 }}><input className="input mono" type="number" min="1" max="15" style={{ width: 80 }} value={p.deducAnios} onChange={(e) => set('deducAnios', +e.target.value)} aria-label="Años para deducir" /><span className="small muted">años (máximo 15)</span></div>}
            <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={p.depAcelerada} onChange={(e) => set('depAcelerada', e.target.checked)} />Depreciación acelerada (33,33 % anual, en 3 años)</label>
          </>)}
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={p.ivaExcluido} onChange={(e) => set('ivaExcluido', e.target.checked)} />Equipos excluidos de IVA (requiere certificación)</label>
        </div>

        <div className="calc-out">
          <div className="grid g2">
            <div className="card"><Stat label="Inversión" value={money(r.capex)} sub={r.loan ? `${money(r.capex - r.loan)} de cuota inicial` : `${cop(p.kwp ? r.capex / p.kwp : 0)} por kWp`} /></div>
            <div className="card"><Stat label="Retorno de la inversión" value={r.payback != null ? `${fmt(r.payback, 1)} años` : 'Más de la vida útil'} sub={r.tir != null ? `TIR ${fmt(r.tir, 1)} %` : 'TIR no calculable'} /></div>
            <div className="card"><Stat label="Ahorro el primer año" value={money(r.rows[1]?.ahorro)} sub={`${money(r.ahorroMes1)} al mes · ${fmt(r.rows[1]?.gen)} kWh`} /></div>
            <div className="card"><Stat label={`Valor presente neto (${p.descuento} %)`} value={money(r.vpn)} sub={`Ahorro total ${p.vida} años: ${money(r.ahorroTotal)}`} /></div>
            {r.loan > 0 && <div className="card"><Stat label="Cuota mensual del crédito" value={money(r.cuotaMes)} sub={r.cuotaMes <= r.ahorroMes1 ? `Menor que el ahorro mensual: el sistema se paga solo` : `${money(r.cuotaMes - r.ahorroMes1)} más que el ahorro mensual`} /></div>}
            {p.tipo === 'empresa' && <div className="card"><Stat label="Beneficios tributarios" value={money(r.beneficios)} sub={r.deducTotal ? `Incluye deducción de ${money(r.deducTotal)}` : 'Depreciación e intereses'} /></div>}
          </div>
          <div className="card">
            <div className="row" style={{ justifyContent: 'space-between' }}><h3>Flujo de caja acumulado</h3><span className="row" style={{ gap: 6 }}><button className="btn sm ghost" onClick={() => setTabla(!tabla)}>{tabla ? 'Ocultar tabla' : 'Ver tabla'}</button><button className="btn sm" onClick={csv}>CSV</button></span></div>
            <svg viewBox={`0 0 ${r.rows.length * 20} 160`} width="100%" height="170" role="img" aria-label="Flujo de caja acumulado por año" preserveAspectRatio="none">
              <line x1="0" x2={r.rows.length * 20} y1="80" y2="80" stroke="var(--line)" />
              {r.rows.map((x, i) => { const h = (Math.abs(x.acum) / maxAbs) * 76; return <rect key={i} x={i * 20 + 3} width="14" y={x.acum >= 0 ? 80 - h : 80} height={Math.max(1, h)} rx="2" fill={x.acum >= 0 ? 'var(--ok)' : 'var(--hot)'}><title>{`Año ${x.y}: ${money(x.acum)}`}</title></rect>; })}
            </svg>
            <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>Año 0</span><span>Año {p.vida}</span></div>
            {tabla && (
              <div className="tbl-wrap" style={{ marginTop: 8 }}><table className="tbl"><thead><tr><th>Año</th><th className="num">kWh</th><th className="num">Ahorro</th><th className="num">Mant.</th><th className="num">Crédito</th>{p.tipo === 'empresa' && <th className="num">Impuestos</th>}<th className="num">Flujo</th><th className="num">Acumulado</th></tr></thead>
                <tbody>{r.rows.map((x) => <tr key={x.y}><td className="mono">{x.y}</td><td className="num">{fmt(x.gen)}</td><td className="num">{money(x.ahorro)}</td><td className="num">{money(x.om)}</td><td className="num">{money(x.deuda)}</td>{p.tipo === 'empresa' && <td className="num">{money(x.impuestos)}</td>}<td className="num">{money(x.flujo)}</td><td className="num">{money(x.acum)}</td></tr>)}</tbody></table></div>
            )}
          </div>
          <p className="small muted" style={{ margin: 0 }}>Beneficios de la Ley 1715 de 2014, modificada por la Ley 2099 de 2021 y reglamentada por el Decreto 895 de 2022: deducción en renta de hasta el 50 % de la inversión, en un plazo máximo de 15 años y sin superar el 50 % de la renta líquida del año; depreciación acelerada de hasta 33,33 % anual; exclusión de IVA y exención de aranceles para equipos certificados. Requieren la certificación del proyecto. Las personas naturales tienen límites adicionales. Verifica tu caso con tu contador antes de ofrecerlos.</p>
          <p className="small muted" style={{ margin: 0 }}>Es una estimación de referencia. El valor real de los excedentes depende del contrato con el comercializador. Sin IVA excluido se suma 19 % sobre la parte de equipos (supuesta en 70 % del costo). Sin depreciación acelerada se deprecia en 10 años.</p>
        </div>
      </div>
    </div>
  );
}
