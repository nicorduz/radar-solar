import React, { useEffect, useState } from 'react';
import { api, fmt, money } from '../api.js';
import { TALERA_URL } from './Plan.jsx';

// Ficha de solo lectura que un usuario comparte por enlace (no requiere cuenta, sin datos de contacto)
export default function Compartido({ token }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api(`/public/ficha/${encodeURIComponent(token)}`).then(setD).catch((e) => setErr(e.message)); }, [token]);

  return (
    <div className="shared">
      <header className="shared-head">
        <img src="/radar-solar-logo.png" alt="Radar Solar · Powered by Talera" />
        <a className="btn sm" href="#/">Ingresar</a>
      </header>
      {err && <div className="card"><p style={{ margin: 0 }}>{err}</p></div>}
      {!d && !err && <div className="row" style={{ justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>}
      {d && (
        <>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="small muted">{d.by ? `Compartido por ${d.by} · ` : ''}Perfil {d.perfil} · enlace válido hasta {d.expira}</span>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h1>{d.name} <span className="muted" style={{ fontWeight: 400 }}>· {d.dpto}</span></h1>
              <span className="row"><span className="muted small">Puesto {d.rank} de {d.total}</span><span className={`score t-${d.tier}`}>{d.score}</span></span>
            </div>
            <span className="small muted">{d.or} · {fmt(d.pop)} habitantes</span>
          </div>
          <div className="grid g4">
            {[
              ['Tarifa residencial', `${fmt(d.tarifa)} $/kWh`], ['Tarifa comercial', `${fmt(d.tarifa_com ?? d.tarifa)} $/kWh`],
              ['Radiación', `${fmt(d.ghi, 2)} kWh/m²/día`], ['Días con cortes al año', d.dna_dias != null ? fmt(d.dna_dias) : 's/d'],
              ['Vivienda nueva 12 meses', fmt(d.viv12)], ['Habitaciones de hotel', fmt(d.rnt_hab)],
              ['Autogeneradores estimados', fmt(d.agpe_est)], ['Subestación más cercana', d.sub_km != null ? `${fmt(d.sub_km, 1)} km` : 's/d'],
            ].map(([l, v]) => <div key={l} className="card"><div className="stat"><span className="l">{l}</span><span className="v">{v}</span></div></div>)}
          </div>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2>Por qué tiene este puntaje</h2>
            {Object.entries(d.factors).map(([l, v]) => <div key={l} className="compbar"><span>{l}</span><div className="track"><div className="fill" style={{ width: `${v ?? 0}%` }} /></div><span className="mono small">{v ?? '—'}</span></div>)}
          </div>
          {d.payback && <div className="card"><p style={{ margin: 0 }}>Un sistema solar de <b>{d.payback.kwp} kWp</b> en {d.name} genera cerca de <b>{fmt(d.payback.kwh_anual)} kWh al año</b>, ahorra <b>{money(d.payback.ahorro_anual)} al año</b> y se paga en unos <b>{fmt(d.payback.anos, 1)} años</b> (estimación de referencia).</p></div>}
          <div className="card shared-cta">
            <h2>¿Quieres ver todos los municipios de Colombia?</h2>
            <p className="muted" style={{ margin: 0 }}>Radar Solar muestra dónde vender energía solar: mapa, ranking, clientes, licitaciones, red eléctrica y asistente con IA.</p>
            <div className="row" style={{ justifyContent: 'center' }}><a className="btn primary" href={TALERA_URL} target="_blank" rel="noreferrer">Conocer Radar Solar</a><a className="btn" href="#/">Ingresar</a></div>
          </div>
        </>
      )}
      <p className="small muted" style={{ textAlign: 'center' }}>© {new Date().getFullYear()} Talera Colombia Consulting S.A.S. · <a href={TALERA_URL} target="_blank" rel="noreferrer">talera.co</a></p>
    </div>
  );
}
