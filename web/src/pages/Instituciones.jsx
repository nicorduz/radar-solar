import React, { useEffect, useState } from 'react';
import { api, qs, fmt, csvDownload } from '../api.js';
import { useApp } from '../App.jsx';
import { LockedRows, Spinner, Contact, PrivacyNote, Fuente, ProspectButton } from '../components/ui.jsx';

const SALUD_TIPO = { hospital: 'Hospital o clínica', centro: 'Centro o puesto de salud', ips: 'IPS' };
// El argumento de la ruta puede traer el tipo y el municipio: "salud-05001" o "colegios-05001"
const parseArg = (arg) => {
  const m = String(arg || '').match(/^(colegios|salud)(?:-(\d{5}))?$/);
  return m ? { tipo: m[1], code: m[2] || '' } : { tipo: 'colegios', code: /^\d{5}$/.test(arg || '') ? arg : '' };
};

// Colegios y sedes de salud como clientes institucionales (techos grandes y consumo de día)
export default function Instituciones({ arg }) {
  const { paid, meta } = useApp();
  const init = parseArg(arg);
  const [tipo, setTipo] = useState(init.tipo);
  const [f, setF] = useState({ q: '', dpto: '', sector: '', zona: '', clase: '', minMat: '', code: init.code });
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  useEffect(() => { const a = parseArg(arg); setTipo(a.tipo); setF((x) => ({ ...x, code: a.code })); }, [arg]);
  useEffect(() => { setPage(0); }, [f, tipo]);
  useEffect(() => {
    setData(null);
    const t = setTimeout(() => api('/instituciones' + qs({ tipo, ...f, page })).then(setData).catch(() => setData({ rows: [], total: 0 })), 200);
    return () => clearTimeout(t);
  }, [f, page, tipo]);
  const salud = tipo === 'salud';
  const csv = () => (salud
    ? csvDownload('sedes-salud.csv', ['sede', 'prestador', 'nit', 'tipo', 'naturaleza', 'municipio', 'departamento', 'direccion', 'telefono', 'correo'], data.rows.map((x) => [x.n, x.pr, x.nit, SALUD_TIPO[x.tipo], x.nat, x.mun, x.dpto, x.dir, x.tel, x.mail]))
    : csvDownload('colegios.csv', ['colegio', 'sede', 'sector', 'zona', 'estudiantes', 'municipio', 'departamento', 'direccion', 'lat', 'lon'], data.rows.map((c) => [c.est, c.n, c.sec === 'O' ? 'oficial' : 'privado', c.z === 'R' ? 'rural' : 'urbana', c.mat, c.mun, c.dpto, c.dir, c.lat, c.lon])));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Colegios y salud</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Hospitales, clínicas, centros de salud y colegios: consumen energía de día, tienen techos grandes y muchos necesitan respaldo ante cortes. Los públicos compran por licitación; los privados, directamente.</p></div>
      </div>
      <div className="seg" role="group" aria-label="Tipo de institución" style={{ alignSelf: 'flex-start' }}>
        <button className={!salud ? 'on' : ''} onClick={() => { setTipo('colegios'); setF({ ...f, sector: '', clase: '' }); }}>Colegios ({fmt(meta.totals.colegios || 0)})</button>
        <button className={salud ? 'on' : ''} onClick={() => { setTipo('salud'); setF({ ...f, sector: '', zona: '', minMat: '' }); }}>Salud ({fmt(meta.totals.salud || 0)})</button>
      </div>
      {paid && (
        <div className="row">
          <input className="input" style={{ maxWidth: 260 }} placeholder={salud ? 'Buscar sede, prestador o NIT' : 'Buscar colegio o sede'} value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Buscar" />
          <select className="select" style={{ maxWidth: 240 }} value={f.dpto} onChange={(e) => setF({ ...f, dpto: e.target.value, code: '' })} aria-label="Departamento"><option value="">Todos los departamentos</option>{meta.dptos.map((d) => <option key={d}>{d}</option>)}</select>
          <select className="select" style={{ maxWidth: 200 }} value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} aria-label="Sector"><option value="">Públicos y privados</option><option value="O">{salud ? 'Públicos' : 'Oficiales'}</option><option value="P">Privados</option></select>
          {salud
            ? <select className="select" style={{ maxWidth: 210 }} value={f.clase} onChange={(e) => setF({ ...f, clase: e.target.value })} aria-label="Tipo de sede"><option value="">Todos los tipos</option><option value="hospital">Hospitales y clínicas</option><option value="centro">Centros y puestos de salud</option><option value="ips">Otras IPS</option></select>
            : <>
              <select className="select" style={{ maxWidth: 150 }} value={f.zona} onChange={(e) => setF({ ...f, zona: e.target.value })} aria-label="Zona"><option value="">Urbana y rural</option><option value="U">Urbana</option><option value="R">Rural</option></select>
              <select className="select" style={{ maxWidth: 200 }} value={f.minMat} onChange={(e) => setF({ ...f, minMat: e.target.value })} aria-label="Tamaño"><option value="">Cualquier tamaño</option><option value="300">300 o más estudiantes</option><option value="1000">1.000 o más</option><option value="2000">2.000 o más</option></select>
            </>}
          {f.code && <button className="chip on" style={{ cursor: 'pointer' }} onClick={() => setF({ ...f, code: '' })}>Municipio {f.code} ✕</button>}
          {data?.rows?.length > 0 && <button className="btn sm" onClick={csv}>Descargar CSV</button>}
        </div>
      )}
      {!data ? <Spinner /> : (
        <>
          <div className="tbl-wrap">
            {salud ? (
              <table className="tbl"><thead><tr><th>Sede de salud</th><th>Municipio</th><th>Tipo</th><th>Contacto</th><th></th></tr></thead>
                <tbody>{data.rows.map((x) => (
                  <tr key={x.id}>
                    <td className="name">{x.n}<br /><span className="small muted">{x.pr !== x.n ? `${x.pr} · ` : ''}{x.nat}{x.ese ? ' · ESE' : ''}{x.dir ? ` · ${x.dir}` : ''}</span></td>
                    <td className="small"><a href={`#/m/${x.code}`}>{x.mun}</a><br /><span className="muted">{x.dpto}</span></td>
                    <td className="small">{SALUD_TIPO[x.tipo]}</td>
                    <td className="small">{x.nit ? <Contact tel={x.tel} mail={x.mail} /> : <span className="muted">Sin NIT de empresa: sin contacto</span>}</td>
                    <td><ProspectButton p={{ tipo: 'salud', ref: x.id, nit: x.nit, nombre: x.n, code: x.code, mun: x.mun, tel: x.tel, mail: x.mail, detalle: SALUD_TIPO[x.tipo] }} /></td>
                  </tr>))}</tbody>
              </table>
            ) : (
              <table className="tbl"><thead><tr><th>Colegio y sede</th><th>Municipio</th><th className="num">Estudiantes</th><th className="hs">Sector</th><th></th></tr></thead>
                <tbody>{data.rows.map((c) => (
                  <tr key={c.id}>
                    <td className="name">{c.est}<br /><span className="small muted">Sede {c.n}{c.p ? ' (principal)' : ''}{c.dir ? ` · ${c.dir}` : ''}</span></td>
                    <td className="small"><a href={`#/m/${c.code}`}>{c.mun}</a><br /><span className="muted">{c.dpto}</span></td>
                    <td className="num">{fmt(c.mat)}</td>
                    <td className="small hs">{c.sec === 'O' ? 'Oficial' : 'Privado'} · {c.z === 'R' ? 'rural' : 'urbana'}</td>
                    <td><ProspectButton p={{ tipo: 'colegio', ref: c.id, nombre: c.est, code: c.code, mun: c.mun, detalle: `Sede ${c.n} · ${fmt(c.mat)} estudiantes` }} /></td>
                  </tr>))}</tbody>
              </table>
            )}
            {data.locked && <LockedRows cols={5} n={8} text={`Hay ${fmt(data.total)} ${salud ? 'sedes de salud' : 'sedes educativas'} con municipio, tamaño y contacto en el plan completo.`} />}
          </div>
          {paid && <div className="row"><button className="btn sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span className="small muted">{fmt(data.total)} {salud ? 'sedes de salud' : 'sedes educativas'} · página {page + 1}</span><button className="btn sm" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>Siguiente</button></div>}
          {!salud && <p className="small muted" style={{ margin: 0 }}>Matrícula del año {data.anio || meta.cortes.colegios}. La dirección y el teléfono del colegio se confirman con la secretaría de educación del municipio.</p>}
          <Fuente>{salud ? `MinSalud, Registro Especial de Prestadores de Servicios de Salud (REPS), corte ${data.anio || meta.cortes.salud}. Se excluyen profesionales independientes y transporte de pacientes; el tipo (hospital, centro de salud, IPS) se deduce del nombre.` : `MEN, sedes educativas de preescolar, básica y media (datos.gov.co), año ${data.anio || meta.cortes.colegios}. Coordenadas con precisión aproximada de 1 km.`}</Fuente>
          <PrivacyNote />
        </>
      )}
    </div>
  );
}
