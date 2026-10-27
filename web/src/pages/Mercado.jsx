import React, { useEffect, useState } from 'react';
import { api, fmt, csvDownload } from '../api.js';
import { useApp } from '../App.jsx';
import { Spinner, Stat, Spark, LockedRows } from '../components/ui.jsx';

function HBars({ rows, value, label, unit, max }) {
  const top = max ?? Math.max(1, ...rows.map(value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} className="hbar"><span>{label(r)}</span><div><div className="b" style={{ width: `${(value(r) / top) * 100}%` }} /></div><span className="mono small">{fmt(value(r))}{unit}</span></div>
      ))}
    </div>
  );
}

// Mercado eléctrico y solar: autogeneradores por mercado, precio de bolsa, cortes por subárea y plantas solares
export default function Mercado() {
  const { paid, meta } = useApp();
  const [d, setD] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api('/mercado').then(setD).catch(() => setD(null)); }, []);
  if (!d) return <Spinner />;
  const lastBolsa = d.bolsa[d.bolsa.length - 1];
  const plantas = d.plantas.filter((p) => !q || `${p.n} ${p.mun} ${p.dpto} ${p.op}`.toLowerCase().includes(q.toLowerCase()));
  const totalAgpe = d.agpe_zonas.reduce((a, z) => a + z.n, 0);

  return (
    <div className="page">
      <div className="page-head"><div><h1>Mercado y red</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Autogeneración conectada, precio de la energía en bolsa, cortes del sistema y plantas solares en operación o en pruebas.</p></div></div>
      <div className="kpis">
        <div className="card"><Stat label="Autogeneradores AGPE (XM)" value={fmt(meta.totals.agpe)} sub={`corte ${d.agpe_fecha}`} /></div>
        <div className="card"><Stat label="Plantas solares del SIN" value={fmt(d.solar.n)} sub={`${fmt(d.solar.mw)} MW · ${d.solar.operacion} en operación, ${d.solar.pruebas} en pruebas`} /></div>
        <div className="card"><Stat label="Precio de bolsa último mes" value={lastBolsa ? `${fmt(lastBolsa.v)} $/kWh` : 's/d'} sub={lastBolsa?.p} /></div>
        <div className="card"><Stat label="Proyectos registrados en la UPME" value={fmt(d.upme_n)} sub={`${fmt(d.upme_mw)} MW (${fmt(d.upme_solar_mw)} solares)`} /></div>
      </div>

      <div className="grid2">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3>Autogeneradores por mercado de comercialización</h3>
          <HBars rows={d.agpe_zonas} value={(z) => z.n} label={(z) => z.zona} unit="" />
          {d.locked && <LockedRows cols={3} n={5} text="Detalle de todos los mercados con número de sistemas y capacidad instalada." />}
          <p className="small muted" style={{ margin: 0 }}>Fuente: XM, listado de autogeneradores a pequeña escala ({d.agpe_fecha}). {paid ? `${fmt(totalAgpe)} sistemas en total.` : ''} Casi todos son solares.</p>
        </div>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3>Precio de bolsa nacional ($/kWh, promedio mensual)</h3>
          <Spark data={d.bolsa} unit="$/kWh" height={110} title="Precio de bolsa mensual" />
          <p className="small muted" style={{ margin: 0 }}>Fuente: XM, precio de bolsa nacional ponderado. Es el precio al que se venden los excedentes de un autogenerador mayor a 100 kW y una referencia para contratos de energía (PPA).</p>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3>Cortes de energía por subárea (kWh no atendidos por cada 1.000 habitantes, 12 meses)</h3>
        <HBars rows={d.dna.filter((x) => x.kwh_1k != null)} value={(x) => x.kwh_1k} label={(x) => x.subarea} unit="" />
        {d.locked && <LockedRows cols={3} n={6} text="El listado completo de subáreas con días de corte está en el plan completo." />}
        <p className="small muted" style={{ margin: 0 }}>Fuente: XM, demanda no atendida programada y no programada por subárea ({d.dna_periodo}). Las zonas con más cortes son las de mayor interés para respaldo con baterías.</p>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Proyectos de generación registrados en la UPME</h3>
          {paid && d.upme?.length > 0 && <button className="btn sm" onClick={() => csvDownload('proyectos-upme.csv', ['codigo', 'proyecto', 'tipo', 'tecnologia', 'mw', 'fase', 'departamento', 'municipio', 'inscrito', 'vence', 'inicio_construccion', 'entrada_operacion'], d.upme.map((p) => [p.id, p.n, p.tipo, p.tec, p.mw, p.fase, p.dpto, p.mun, p.inscrito, p.vence, p.inicio, p.operacion]))}>CSV</button>}
        </div>
        {d.upme?.length ? (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Proyecto</th><th className="num">MW</th><th>Fase</th><th>Ubicación</th><th className="hs">Operación prevista</th></tr></thead><tbody>
            {d.upme.map((p) => <tr key={p.id}><td className="name">{p.n}<br /><span className="small muted">{p.tipo} · inscrito {p.inscrito}</span></td><td className="num">{fmt(p.mw, 1)}</td><td className="small">{p.fase}</td><td className="small">{p.code ? <a href={`#/m/${p.code}`}>{p.mun}</a> : p.mun}<br /><span className="muted">{p.dpto}</span></td><td className="small hs">{p.operacion?.slice(0, 7) || 's/d'}</td></tr>)}
          </tbody></table></div>
        ) : <p className="small muted" style={{ margin: 0 }}>Sin datos cargados.</p>}
        {d.locked && <LockedRows cols={5} n={5} text={`Lista de los ${fmt(d.upme_n)} proyectos registrados con capacidad, fase, municipio y fechas.`} />}
        <p className="small muted" style={{ margin: 0 }}>Fuente: UPME, informe de registros activos de proyectos de generación (corte {d.upme_corte || 's/d'}), Resolución UPME 749 de 2025. Son proyectos en planeación, no plantas construidas.</p>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Plantas solares del sistema interconectado</h3>
          {paid && <div className="row"><input className="input" style={{ maxWidth: 240 }} placeholder="Buscar planta, municipio u operador" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar planta" />
            <button className="btn sm" onClick={() => csvDownload('plantas-solares.csv', ['planta', 'mw', 'estado', 'desde', 'kv', 'operador', 'municipio', 'departamento', 'lat', 'lon'], plantas.map((p) => [p.n, p.mw, p.estado, p.desde, p.kv, p.op, p.mun, p.dpto, p.lat, p.lon]))}>CSV</button></div>}
        </div>
        {paid ? (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Planta</th><th className="num">MW</th><th>Estado</th><th className="hs">Operador</th><th>Ubicación</th></tr></thead><tbody>
            {plantas.slice(0, 200).map((p) => <tr key={p.n + p.lat}><td className="name">{p.n}{p.kv ? <><br /><span className="small muted">{p.kv} kV</span></> : null}</td><td className="num">{fmt(p.mw, 1)}</td><td className="small">{p.estado}{p.desde ? <><br /><span className="muted">{p.desde.slice(0, 7)}</span></> : null}</td><td className="small hs">{p.op}</td><td className="small">{p.code ? <a href={`#/m/${p.code}`}>{p.mun}</a> : p.mun}<br /><span className="muted">{p.dpto}</span></td></tr>)}
          </tbody></table></div>
        ) : <LockedRows cols={5} n={6} text={`Lista de las ${d.solar.n} plantas solares con capacidad, estado, operador y ubicación.`} />}
        <p className="small muted" style={{ margin: 0 }}>Fuente: XM, mapa Paratec de generación. Incluye plantas despachadas centralmente y menores registradas ante XM; no incluye los autogeneradores pequeños.</p>
      </div>
    </div>
  );
}
