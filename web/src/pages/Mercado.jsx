import React, { useEffect, useState } from 'react';
import { api, fmt, csvDownload } from '../api.js';
import { useApp } from '../App.jsx';
import { Spinner, Stat, Spark, LockedRows, Section, Fuente } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

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
  const peorCorte = d.dna.find((x) => x.kwh_1k != null);

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <div className="page-head"><div><h1>Mercado y red</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Autogeneración, precio de la energía, cortes y plantas solares del país. Toca cada sección para ver el detalle.</p></div></div>
      <div className="kpis">
        <div className="card"><Stat label="Autogeneradores" value={fmt(meta.totals.agpe)} sub={`corte ${d.agpe_fecha}`} /></div>
        <div className="card"><Stat label="Plantas solares" value={fmt(d.solar.n)} sub={`${fmt(d.solar.mw)} MW`} /></div>
        <div className="card"><Stat label="Precio de bolsa" value={lastBolsa ? `${fmt(lastBolsa.v)} $/kWh` : 's/d'} sub={lastBolsa?.p} /></div>
        <div className="card"><Stat label="Proyectos registrados" value={fmt(d.upme_n)} sub={`${fmt(d.upme_mw)} MW registrados`} /></div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Section icon={<Icon name="sun" />} title="Autogeneradores por mercado" hint={`${d.agpe_zonas[0]?.zona || ''} lidera con ${fmt(d.agpe_zonas[0]?.n)} sistemas`} open>
          <HBars rows={d.agpe_zonas} value={(z) => z.n} label={(z) => z.zona} unit="" />
          {d.locked && <LockedRows cols={3} n={5} text="Detalle de todos los mercados con número de sistemas y capacidad instalada." />}
          <p className="small muted" style={{ margin: 0 }}>Corte {d.agpe_fecha}. Casi todos son solares.</p><Fuente>XM, autogeneradores a pequeña escala.</Fuente>
        </Section>

        <Section icon={<Icon name="chart" />} title="Precio de bolsa" hint={lastBolsa ? `${fmt(lastBolsa.v)} $/kWh en ${lastBolsa.p}` : 's/d'}>
          <Spark data={d.bolsa} unit="$/kWh" height={110} title="Precio de bolsa mensual" />
          <p className="small muted" style={{ margin: 0 }}>Referencia para vender excedentes y para contratos de energía (PPA).</p><Fuente>XM.</Fuente>
        </Section>

        <Section icon={<Icon name="bolt" />} title="Cortes de energía por zona" hint={peorCorte ? `Más cortes: ${peorCorte.subarea} (${fmt(peorCorte.kwh_1k)} kWh por 1.000 hab.)` : ''}>
          <HBars rows={d.dna.filter((x) => x.kwh_1k != null)} value={(x) => x.kwh_1k} label={(x) => x.subarea} unit="" />
          {d.locked && <LockedRows cols={3} n={6} text="El listado completo de subáreas está en el plan completo." />}
          <p className="small muted" style={{ margin: 0 }}>Demanda no atendida por subárea eléctrica ({d.dna_periodo}).</p><Fuente>XM.</Fuente>
        </Section>

        <Section icon={<Icon name="doc" />} title="Proyectos de generación registrados" hint={`${fmt(d.upme_n)} proyectos · ${fmt(d.upme_solar_mw)} MW solares · corte ${d.upme_corte || 's/d'}`}>
          {paid && d.upme?.length > 0 && <div className="row"><button className="btn sm" onClick={() => csvDownload('proyectos-upme.csv', ['codigo', 'proyecto', 'tipo', 'tecnologia', 'mw', 'fase', 'departamento', 'municipio', 'inscrito', 'vence', 'inicio_construccion', 'entrada_operacion'], d.upme.map((p) => [p.id, p.n, p.tipo, p.tec, p.mw, p.fase, p.dpto, p.mun, p.inscrito, p.vence, p.inicio, p.operacion]))}>Descargar CSV</button></div>}
          {d.upme?.length ? (
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Proyecto</th><th className="num">MW</th><th>Ubicación</th><th className="hs">Operación prevista</th></tr></thead><tbody>
              {d.upme.map((p) => <tr key={p.id}><td className="name">{p.n}<br /><span className="small muted">{p.tipo} · {p.fase}</span></td><td className="num">{fmt(p.mw, 1)}</td><td className="small">{p.code ? <a href={`#/m/${p.code}`}>{p.mun}</a> : p.mun}<br /><span className="muted">{p.dpto}</span></td><td className="small hs">{p.operacion?.slice(0, 7) || 's/d'}</td></tr>)}
            </tbody></table></div>
          ) : <p className="small muted" style={{ margin: 0 }}>Sin datos cargados.</p>}
          {d.locked && <LockedRows cols={4} n={5} text={`Lista de los ${fmt(d.upme_n)} proyectos con capacidad, municipio y fechas.`} />}
          <p className="small muted" style={{ margin: 0 }}>Son proyectos en planeación, no plantas construidas.</p><Fuente>UPME.</Fuente>
        </Section>

        <Section icon={<Icon name="layers" />} title="Plantas solares en operación y pruebas" hint={`${d.solar.operacion} en operación · ${d.solar.pruebas} en pruebas`}>
          {paid && <div className="row"><input className="input" style={{ maxWidth: 260 }} placeholder="Buscar planta, municipio u operador" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar planta" />
            <button className="btn sm" onClick={() => csvDownload('plantas-solares.csv', ['planta', 'mw', 'estado', 'desde', 'kv', 'operador', 'municipio', 'departamento', 'lat', 'lon'], plantas.map((p) => [p.n, p.mw, p.estado, p.desde, p.kv, p.op, p.mun, p.dpto, p.lat, p.lon]))}>Descargar CSV</button></div>}
          {paid ? (
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Planta</th><th className="num">MW</th><th>Estado</th><th>Ubicación</th></tr></thead><tbody>
              {plantas.slice(0, 200).map((p) => <tr key={p.n + p.lat}><td className="name">{p.n}<br /><span className="small muted">{p.op}</span></td><td className="num">{fmt(p.mw, 1)}</td><td className="small">{p.estado}</td><td className="small">{p.code ? <a href={`#/m/${p.code}`}>{p.mun}</a> : p.mun}<br /><span className="muted">{p.dpto}</span></td></tr>)}
            </tbody></table></div>
          ) : <LockedRows cols={4} n={6} text={`Lista de las ${d.solar.n} plantas solares con capacidad, estado, operador y ubicación.`} />}
          <Fuente>XM, mapa Paratec.</Fuente>
        </Section>
      </div>
    </div>
  );
}
