import React, { useEffect, useState } from 'react';
import { api, qs, fmt, csvDownload } from '../api.js';
import { useApp } from '../App.jsx';
import { LockedRows, Spinner, Contact, PrivacyNote, Fuente, ProspectButton } from '../components/ui.jsx';

const CONSUMO = { '': 'Cualquier consumo', alta: 'Consumo alto', media: 'Consumo medio', baja: 'Consumo bajo' };

// Clientes comerciales e industriales (C&I): las empresas más grandes del país por ingresos
export default function Industrias({ code }) {
  const { paid, meta } = useApp();
  const [f, setF] = useState({ q: '', dpto: '', sector: '', consumo: '', contacto: '', minIng: '', code: code || '' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  useEffect(() => { setF((x) => ({ ...x, code: code || '' })); }, [code]);
  useEffect(() => { setPage(0); }, [f]);
  useEffect(() => {
    setData(null);
    const t = setTimeout(() => api('/ci' + qs({ ...f, page })).then(setData), 200);
    return () => clearTimeout(t);
  }, [f, page]);
  const csv = () => csvDownload('empresas-ci.csv', ['puesto', 'empresa', 'nit', 'sector', 'ciiu', 'consumo_tipico', 'ingresos_miles_millones', 'municipio', 'departamento', 'tarifa_comercial_kwh', 'telefono', 'correo', 'web'],
    data.rows.map((e) => [e.rank, e.n, e.nit, e.sector, e.ciiu, e.consumo, e.ing, e.mun, e.dpto, e.tarifa_com, e.tel, e.mail, e.web]));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Empresas e industrias</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Las {fmt(meta.totals.ci || 10000)} empresas más grandes del país por ingresos{data?.anio ? ` (cierre ${data.anio})` : ''}: fábricas, supermercados, clínicas, bodegas, agroindustria y más. Son los clientes comerciales e industriales con mayor consumo y capacidad de inversión, ideales para sistemas de 50 kWp a varios MW, contratos de energía (PPA) y baterías.</p></div>
      </div>
      {data && (
        <div className="row">
          <button className={`chip ${!f.sector ? 'on' : ''}`} style={{ cursor: 'pointer', background: 'none' }} onClick={() => setF({ ...f, sector: '' })}>Todos</button>
          {Object.entries(data.sectores).sort((a, b) => b[1] - a[1]).map(([k, v]) => <button key={k} className={`chip ${f.sector === k ? 'on' : ''}`} style={{ cursor: 'pointer', background: 'none' }} onClick={() => setF({ ...f, sector: f.sector === k ? '' : k })}>{k} · {fmt(v)}</button>)}
        </div>
      )}
      {paid && (
        <div className="row">
          <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar por nombre o NIT" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Buscar empresa" />
          <select className="select" style={{ maxWidth: 230 }} value={f.dpto} onChange={(e) => setF({ ...f, dpto: e.target.value, code: '' })} aria-label="Departamento"><option value="">Todos los departamentos</option>{meta.dptos.map((d) => <option key={d}>{d}</option>)}</select>
          <select className="select" style={{ maxWidth: 190 }} value={f.consumo} onChange={(e) => setF({ ...f, consumo: e.target.value })} aria-label="Consumo típico del sector">{Object.entries(CONSUMO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select className="select" style={{ maxWidth: 210 }} value={f.minIng} onChange={(e) => setF({ ...f, minIng: e.target.value })} aria-label="Ingresos mínimos"><option value="">Cualquier tamaño</option><option value="50">Ingresos de 50 mil M o más</option><option value="200">200 mil M o más</option><option value="1000">1 billón o más</option></select>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.checked ? '1' : '' })} />Con teléfono o correo</label>
          {f.code && <button className="chip on" style={{ cursor: 'pointer' }} onClick={() => setF({ ...f, code: '' })}>Municipio {f.code} ✕</button>}
          {data && <button className="btn sm" onClick={csv}>Descargar CSV</button>}
        </div>
      )}
      {!data ? <Spinner /> : (
        <>
          <div className="tbl-wrap">
            <table className="tbl"><thead><tr><th>#</th><th>Empresa</th><th className="hs">Sector</th><th>Sede</th><th className="num">Ingresos</th><th>Contacto</th><th></th></tr></thead>
              <tbody>{data.rows.map((e) => (
                <tr key={e.nit + e.n}>
                  <td className="mono muted">{e.rank}</td>
                  <td className="name">{e.n}<br /><span className="small muted">NIT {e.nit}</span></td>
                  <td className="small hs">{e.sector}<br /><span className={`tag ${e.consumo === 'alta' ? 'hot' : ''}`}>consumo {{ alta: 'alto', media: 'medio', baja: 'bajo' }[e.consumo]}</span></td>
                  <td className="small">{e.code ? <a href={`#/m/${e.code}`}>{e.mun}</a> : e.mun}<br /><span className="muted">{e.dpto}{e.tarifa_com ? ` · ${fmt(e.tarifa_com)} $/kWh` : ''}</span></td>
                  <td className="num small">{fmt(e.ing)} mil M</td>
                  <td className="small"><Contact tel={e.tel} mail={e.mail} web={e.web} /></td>
                  <td><ProspectButton p={{ tipo: 'industria', nit: e.nit, nombre: e.n, code: e.code, mun: e.mun, tel: e.tel, mail: e.mail, detalle: e.sector }} /></td>
                </tr>))}</tbody>
            </table>
            {data.locked && <LockedRows cols={6} n={8} text={`${fmt(data.total)} empresas grandes con sector, ingresos, municipio y contacto en el plan completo.`} />}
          </div>
          {paid && <div className="row"><button className="btn sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span className="small muted">{fmt(data.total)} empresas · página {page + 1}</span><button className="btn sm" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>Siguiente</button></div>}
          <p className="small muted">La sede es el domicilio principal: sus plantas, tiendas o bodegas pueden estar en otros municipios. El consumo es el típico del sector (referencia), no el de cada empresa. Ingresos en miles de millones de pesos.</p>
          <Fuente>Supersociedades, 10.000 empresas más grandes (datos.gov.co 6cat-2gcs); contacto de SECOP II proveedores (qmzu-gj57).</Fuente>
          <PrivacyNote />
        </>
      )}
    </div>
  );
}
