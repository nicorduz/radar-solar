import React, { useEffect, useState } from 'react';
import { api, qs, fmt, csvDownload } from '../api.js';
import { useApp } from '../App.jsx';
import { LockedRows, Spinner, Contact, PrivacyNote } from '../components/ui.jsx';

const CATS = { '': 'Todos', ALOJAMIENTO: 'Hoteles y alojamientos', 'VIVIENDAS TURÍSTICAS': 'Viviendas turísticas', 'PARQUES TEMÁTICOS': 'Parques temáticos', 'CONCESIONARIOS DE SERVICIOS TURÍSTICOS EN PARQUE': 'Concesiones en parques' };

// Hoteles, viviendas turísticas y parques del Registro Nacional de Turismo como clientes potenciales
export default function Clientes({ code }) {
  const { paid, meta } = useApp();
  const [f, setF] = useState({ q: '', dpto: '', cat: '', minHab: '', code: code || '' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  useEffect(() => { setF((x) => ({ ...x, code: code || '' })); }, [code]);
  useEffect(() => { setPage(0); }, [f]);
  useEffect(() => {
    setData(null);
    const t = setTimeout(() => api('/clientes' + qs({ ...f, page })).then(setData), 200);
    return () => clearTimeout(t);
  }, [f, page]);
  const csv = () => csvDownload('clientes-turismo.csv', ['establecimiento', 'categoria', 'tipo', 'municipio', 'departamento', 'habitaciones', 'camas', 'empleados', 'direccion', 'telefono', 'correo', 'tarifa_kwh'],
    data.rows.map((c) => [c.n, c.cat, c.sub, c.mun, c.dpto, c.hab, c.camas, c.emp, c.dir, c.tel, c.mail, c.tarifa]));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Hoteles, turismo y recreación</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Establecimientos activos del Registro Nacional de Turismo: consumen energía todo el día (aire acondicionado, piscinas, cocinas) y suelen estar en zonas cálidas con tarifa alta. Son clientes comerciales para sistemas de 10 a 500 kWp.</p></div>
      </div>
      <div className="row">
        {Object.entries(CATS).map(([k, l]) => <button key={k} className={`chip ${f.cat === k ? 'on' : ''}`} style={{ cursor: 'pointer', background: 'none' }} onClick={() => setF({ ...f, cat: k })}>{l}</button>)}
      </div>
      {paid && (
        <div className="row">
          <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar por nombre o tipo" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Buscar establecimiento" />
          <select className="select" style={{ maxWidth: 240 }} value={f.dpto} onChange={(e) => setF({ ...f, dpto: e.target.value, code: '' })} aria-label="Departamento"><option value="">Todos los departamentos</option>{meta.dptos.map((d) => <option key={d}>{d}</option>)}</select>
          <select className="select" style={{ maxWidth: 200 }} value={f.minHab} onChange={(e) => setF({ ...f, minHab: e.target.value })} aria-label="Tamaño mínimo"><option value="">Cualquier tamaño</option><option value="10">10 o más habitaciones</option><option value="30">30 o más</option><option value="80">80 o más</option></select>
          {f.code && <button className="chip on" style={{ cursor: 'pointer' }} onClick={() => setF({ ...f, code: '' })}>Municipio {f.code} ✕</button>}
          {data && <button className="btn sm" onClick={csv}>Descargar CSV</button>}
        </div>
      )}
      {!data ? <Spinner /> : (
        <>
          <div className="tbl-wrap">
            <table className="tbl"><thead><tr><th>Establecimiento</th><th>Municipio</th><th className="num">Habitaciones</th><th className="num hs">Tarifa $/kWh</th><th>Contacto</th></tr></thead>
              <tbody>{data.rows.map((c) => (
                <tr key={c.id}>
                  <td className="name">{c.n}<br /><span className="small muted">{c.sub}{c.dir ? ` · ${c.dir}` : ''}</span></td>
                  <td className="small"><a href={`#/m/${c.code}`}>{c.mun}</a><br /><span className="muted">{c.dpto}</span></td>
                  <td className="num">{fmt(c.hab)}{c.camas ? <><br /><span className="small muted">{fmt(c.camas)} camas</span></> : null}</td>
                  <td className="num hs">{fmt(c.tarifa)}</td>
                  <td className="small">{c.pj ? <Contact tel={c.tel} mail={c.mail} /> : <span className="muted">Persona natural: sin contacto</span>}</td>
                </tr>))}</tbody>
            </table>
            {data.locked && <LockedRows cols={5} n={8} text={`Hay ${fmt(data.total)} establecimientos con municipio, tamaño y contacto de empresa en el plan completo.`} />}
          </div>
          {paid && <div className="row"><button className="btn sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span className="small muted">{fmt(data.total)} establecimientos · página {page + 1}</span><button className="btn sm" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>Siguiente</button></div>}
          <p className="small muted">Fuente: MinCIT, Registro Nacional de Turismo (datos.gov.co thwd-ivmp), prestadores activos. Algunos registros traen habitaciones mal digitadas; se corrigen con el número de camas y de empleados.</p>
          <PrivacyNote />
        </>
      )}
    </div>
  );
}
