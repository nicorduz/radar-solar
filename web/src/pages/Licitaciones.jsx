import React, { useEffect, useState } from 'react';
import { api, qs, fmt, money } from '../api.js';
import { useApp } from '../App.jsx';
import { LockedRows, Spinner, Fuente, ProspectButton } from '../components/ui.jsx';

export default function Licitaciones() {
  const { meta, paid } = useApp();
  const [f, setF] = useState({ q: '', dpto: '', estado: '' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  useEffect(() => { setPage(0); }, [f]);
  useEffect(() => {
    setData(null);
    const t = setTimeout(() => api('/licitaciones' + qs({ ...f, page })).then(setData), 200);
    return () => clearTimeout(t);
  }, [f, page]);

  return (
    <div className="page">
      <div className="page-head"><div><h1>Licitaciones públicas solares</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Procesos de contratación pública que mencionan energía solar o fotovoltaica. Actualizado {meta.cortes.generado?.slice(0, 10)}.</p></div></div>
      {paid && (
        <div className="row">
          <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar entidad, ciudad o tema" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Buscar" />
          <select className="select" style={{ maxWidth: 220 }} value={f.dpto} onChange={(e) => setF({ ...f, dpto: e.target.value })} aria-label="Departamento"><option value="">Todos los departamentos</option>{meta.dptos.map((d) => <option key={d}>{d}</option>)}</select>
          <div className="seg">{[['', 'Todos'], ['abiertos', 'Abiertos'], ['adjudicados', 'Adjudicados']].map(([k, l]) => <button key={k} className={f.estado === k ? 'on' : ''} onClick={() => setF({ ...f, estado: k })}>{l}</button>)}</div>
        </div>
      )}
      {!data ? <Spinner /> : (
        <>
          <span className="small muted">{fmt(data.total)} procesos</span>
          <div className="tbl-wrap">
            <table className="tbl"><thead><tr><th>Proceso</th><th>Entidad</th><th>Fecha</th><th>Estado</th><th className="num">Precio base</th><th className="num">Adjudicado a</th><th></th></tr></thead>
              <tbody>{data.rows.map((s) => (
                <tr key={s.id}>
                  <td style={{ maxWidth: 360 }}><span className="name">{s.nombre}</span><br /><span className="small muted">{s.desc?.slice(0, 140)}</span></td>
                  <td className="small">{s.entidad}<br /><span className="muted">{s.ciudad}, {s.dpto}</span></td>
                  <td className="small mono">{s.fecha}</td>
                  <td className="small">{s.estado}</td>
                  <td className="num">{money(s.precio)}</td>
                  <td className="num small">{s.adjudicado ? <>{s.proveedor}<br />{money(s.valor_adj)}</> : '—'}</td>
                  <td><span style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>{s.url && <a href={s.url} target="_blank" rel="noreferrer" className="small">Ver proceso</a>}{paid && <ProspectButton p={{ tipo: 'licitacion', ref: s.id, nombre: s.nombre, code: s.code, mun: `${s.ciudad}, ${s.dpto}`, valor: s.precio, url: s.url, detalle: `${s.entidad} · ${s.estado} · ${s.fecha}` }} />}</span></td>
                </tr>))}</tbody>
            </table>
            {data.locked && <LockedRows cols={7} n={8} text={`${fmt(data.total - 1)} procesos más, con filtros por departamento, estado y quién ganó cada contrato.`} />}
          </div>
          {paid && <div className="row"><button className="btn sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span className="small muted">Página {page + 1} de {Math.max(1, Math.ceil(data.total / 50))}</span><button className="btn sm" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>Siguiente</button></div>}
          <p className="small muted">Los precios de adjudicación sirven como referencia de costos de mercado.</p>
          <Fuente>SECOP II · Procesos de Contratación (datos.gov.co, p6dx-8zbt).</Fuente>
        </>
      )}
    </div>
  );
}
