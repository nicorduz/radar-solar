import React, { useEffect, useState } from 'react';
import { api, qs, fmt, money } from '../api.js';
import { useApp } from '../App.jsx';
import { LockedRows, Spinner, Contact, PrivacyNote, Fuente, ProspectButton } from '../components/ui.jsx';

const CIIU = { 4321: 'Instalaciones eléctricas', 4322: 'Fontanería y climatización', 4330: 'Terminación de edificaciones', 3511: 'Generación de energía', 3514: 'Comercialización de energía', 4659: 'Comercio mayorista de maquinaria y equipo', 4669: 'Comercio mayorista especializado', 2790: 'Fabricación de otros equipos eléctricos', 2710: 'Fabricación de motores y transformadores', 7112: 'Ingeniería', 4290: 'Otras obras civiles' };

export default function Empresas() {
  const { paid, meta, profile } = useApp();
  const [f, setF] = useState({ q: '', cat: '', dpto: '', solar: profile === 'proveedor' ? '1' : '', contacto: '' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  useEffect(() => { setPage(0); }, [f]);
  useEffect(() => {
    setData(null);
    const t = setTimeout(() => api('/empresas' + qs({ ...f, page })).then(setData), 200);
    return () => clearTimeout(t);
  }, [f, page]);

  return (
    <div className="page">
      <div className="page-head"><div><h1>{profile === 'proveedor' ? 'Instaladores para venderles' : 'Instaladores, proveedores y competencia'}</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Empresas activas con actividad eléctrica, de energía o de equipos: dónde están, cómo contactarlas y cuántos contratos solares públicos han ganado.</p></div></div>
      {data && (
        <div className="row">
          {Object.entries(data.cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <button key={k} className={`chip ${f.cat === k ? 'on' : ''}`} onClick={() => setF({ ...f, cat: f.cat === k ? '' : k })} style={{ cursor: 'pointer', background: 'none' }}>{k} · {fmt(v)}</button>
          ))}
        </div>
      )}
      {paid && data && (
        <div className="row">
          <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar por nombre o NIT" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Buscar empresa" />
          <select className="select" style={{ maxWidth: 240 }} value={f.dpto} onChange={(e) => setF({ ...f, dpto: e.target.value })} aria-label="Departamento"><option value="">Todos los departamentos</option>{meta.dptos.map((d) => <option key={d}>{d}</option>)}</select>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!f.solar} onChange={(e) => setF({ ...f, solar: e.target.checked ? '1' : '' })} />Con contratos solares</label>
          <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={!!f.contacto} onChange={(e) => setF({ ...f, contacto: e.target.checked ? '1' : '' })} />Con teléfono o correo</label>
        </div>
      )}
      {!data ? <Spinner /> : (
        <>
          <div className="tbl-wrap">
            <table className="tbl"><thead><tr><th>Empresa</th><th className="hs">Actividad</th><th>Ubicación</th><th className="num">Contratos solares</th><th>Contacto</th><th></th></tr></thead>
              <tbody>{data.rows.map((e) => (
                <tr key={e.nit + e.n}>
                  <td className="name">{e.n}<br /><span className="small muted">NIT {e.nit} · {e.cat}{e.pyme ? ' · pyme' : ''}</span></td>
                  <td className="small hs">{e.ciiu ? `${e.ciiu} ${CIIU[e.ciiu] || ''}` : 'Contratista público'}{e.mat ? <><br /><span className="muted">matrícula {e.mat.slice(0, 4)}{e.ren ? ` · renovó ${e.ren}` : ''}</span></> : null}</td>
                  <td className="small">{e.code ? <a href={`#/m/${e.code}`}>{e.ubic}</a> : <span className="muted">Cámara de {e.cam}</span>}</td>
                  <td className="num small">{e.sol_n ? <>{e.sol_n}<br /><span className="muted">{money(e.sol_valor)} · {e.sol_ultimo?.slice(0, 7)}</span></> : '—'}</td>
                  <td className="small"><Contact tel={e.tel} mail={e.mail} web={e.web} /></td>
                  <td><ProspectButton p={{ tipo: 'empresa', nit: e.nit, nombre: e.n, code: e.code, mun: e.ubic, tel: e.tel, mail: e.mail, detalle: e.cat }} /></td>
                </tr>))}</tbody>
            </table>
            {data.locked && <LockedRows cols={6} n={8} text={`Directorio de ${fmt(data.total)} empresas con municipio, teléfono, correo y contratos solares ganados.`} />}
          </div>
          {paid && <div className="row"><button className="btn sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span className="small muted">{fmt(data.total)} empresas · página {page + 1}</span><button className="btn sm" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>Siguiente</button></div>}
          <Fuente>Confecámaras, Registro Mercantil (c82u-588k); SECOP II, proveedores registrados (qmzu-gj57) para teléfono, correo y municipio; SECOP II, procesos con "solar" o "fotovoltaico" adjudicados. Cuando la empresa no tiene registro en SECOP, solo se conoce la cámara de comercio donde está matriculada.</Fuente>
          <PrivacyNote />
        </>
      )}
    </div>
  );
}
