import React, { useEffect, useState } from 'react';
import { api, qs, fmt } from '../api.js';
import { useApp } from '../App.jsx';
import { LockedRows, Spinner, ProspectButton, ScoreBadge, Fuente } from '../components/ui.jsx';
import { tier } from '../components/Oportunidad.jsx';
import { RDDiagrama, RD_EJEMPLOS, RD_PASOS } from '../components/RespuestaDemanda.jsx';

// Respuesta a la demanda dentro de la plataforma: cómo funciona, cuánto se gana y qué empresas tienen más potencial
export default function Demanda({ code }) {
  const { paid, meta, cfg } = useApp();
  const [f, setF] = useState({ q: '', dpto: '', sector: '', code: code || '' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [intento, setIntento] = useState(0);
  useEffect(() => { setPage(0); }, [f]);
  useEffect(() => {
    setData(null); setErr(null);
    const t = setTimeout(() => api('/demanda' + qs({ ...f, page })).then(setData).catch((e) => setErr(e.message || 'No se pudo cargar')), 200);
    return () => clearTimeout(t);
  }, [f, page, intento]);
  const wa = cfg.contact?.whatsapp ? `https://wa.me/${cfg.contact.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, quiero que Talera evalúe la respuesta a la demanda para un cliente.')}` : cfg.contact?.email ? `mailto:${cfg.contact.email}?subject=${encodeURIComponent('Respuesta a la demanda con Talera')}` : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Respuesta a la demanda</h1>
          <p className="muted small" style={{ margin: '4px 0 0', maxWidth: '80ch' }}>Desde junio de 2026 la CREG paga a las empresas por bajar su consumo en las horas en que la energía está cara (Resolución 101 111 de 2026). Talera modela la operación del cliente y estructura su participación, en bolsa o con demanda desconectable voluntaria.</p>
        </div>
        {wa && <a className="btn primary" href={wa} target="_blank" rel="noreferrer">Hablar con Talera</a>}
      </div>

      <section className="card dm-como" aria-labelledby="dm-como-t">
        <h2 id="dm-como-t">Cómo funciona</h2>
        <div className="dm-grid">
          <div className="dm-fig"><RDDiagrama /></div>
          <ol className="dm-pasos">{RD_PASOS.map(([t, x]) => <li key={t}><b>{t}</b><span className="small">{x}</span></li>)}</ol>
        </div>
      </section>

      <section aria-labelledby="dm-gana-t" className="dm-gana">
        <h2 id="dm-gana-t">Cuánto puede ganar un cliente</h2>
        <ul>{RD_EJEMPLOS.map((e) => <li key={e.quien} className="card"><span className="small muted">{e.quien}</span><b>{e.rango}</b><span className="small">al mes en meses de precios altos</span><p className="small">{e.que}</p><p className="small muted">{e.sup}</p></li>)}</ul>
        <p className="small muted" style={{ margin: 0 }}>Antes de la comisión del representante. La cifra real depende de la curva de carga y de la línea base de cada cliente: Talera la calcula con sus datos de medición.</p>
      </section>

      <section aria-labelledby="dm-cand-t" className="stack">
        <h2 id="dm-cand-t" style={{ margin: 0 }}>Empresas con más potencial</h2>
        <p className="small muted" style={{ margin: 0, maxWidth: '86ch' }}>Empresas grandes de consumo alto o medio, ordenadas por qué tan flexible suele ser la carga de su sector (frío, hornos, bombeo, aire), su consumo y su tamaño.</p>
        {data?.sectores?.length > 0 && (
          <div className="row" role="group" aria-label="Filtrar por sector">
            <button className={`chip ${!f.sector ? 'on' : ''}`} style={{ cursor: 'pointer', background: 'none' }} onClick={() => setF({ ...f, sector: '' })}>Todos</button>
            {data.sectores.map((s) => <button key={s.sector} className={`chip ${f.sector === s.sector ? 'on' : ''}`} style={{ cursor: 'pointer', background: 'none' }} onClick={() => setF({ ...f, sector: s.sector })}>{s.sector} · {fmt(s.n)}</button>)}
          </div>
        )}
        {paid && (
          <div className="row">
            <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar empresa" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Buscar empresa" />
            <select className="select" style={{ maxWidth: 240 }} value={f.dpto} onChange={(e) => setF({ ...f, dpto: e.target.value, code: '' })} aria-label="Departamento"><option value="">Todos los departamentos</option>{meta.dptos.map((d) => <option key={d}>{d}</option>)}</select>
            {f.code && <button className="chip on" style={{ cursor: 'pointer' }} onClick={() => setF({ ...f, code: '' })}>Municipio {f.code} ✕</button>}
          </div>
        )}
        {err ? <div className="alert err" role="alert">{err}. <button className="btn sm" onClick={() => setIntento((x) => x + 1)}>Reintentar</button></div> : !data ? <Spinner /> : (
          <>
            <div className="tbl-wrap">
              <table className="tbl op-tbl"><thead><tr><th className="num">Potencial</th><th>Empresa</th><th>Sector</th><th>Municipio</th><th></th></tr></thead>
                <tbody>{data.rows.map((e) => (
                  <tr key={e.nit || e.n}>
                    <td className="num"><ScoreBadge score={e.pot} tier={tier(e.pot)} /></td>
                    <td className="name">{e.n}<div className="op-why"><ul>{e.razones.map((r) => <li key={r}>{r}</li>)}</ul><p><b>Cómo entrar:</b> {e.via}</p></div></td>
                    <td className="small">{e.sector}<br /><span className="muted">Consumo {e.consumo}</span></td>
                    <td className="small"><a href={`#/m/${e.code}`}>{e.mun}</a><br /><span className="muted">{e.dpto}</span></td>
                    <td><ProspectButton p={{ tipo: 'industria', nit: e.nit, nombre: e.n, code: e.code, mun: e.mun, detalle: `Respuesta a la demanda · ${e.sector}` }} /></td>
                  </tr>))}</tbody>
              </table>
              {data.locked && <LockedRows cols={5} n={8} text={`Hay ${fmt(data.total)} empresas candidatas en el plan completo.`} />}
            </div>
            {paid && <div className="row"><button className="btn sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span className="small muted">{fmt(data.total)} empresas · página {page + 1}</span><button className="btn sm" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>Siguiente</button></div>}
            <Fuente>Supersociedades, 10.000 empresas más grandes ({data.anio}); consumo estimado por actividad. CREG 101 111 de 2026.</Fuente>
          </>
        )}
      </section>
    </div>
  );
}
