import React, { useEffect, useState } from 'react';
import { api, qs, fmt, csvDownload } from '../api.js';
import { useApp } from '../App.jsx';
import { LockedRows, Spinner, Contact, PrivacyNote, Fuente, ProspectButton, ScoreBadge } from '../components/ui.jsx';
import { tier, PorQue, Segmentos, sistemaTxt } from '../components/Oportunidad.jsx';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DIAS_L = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const pc = (x) => `${Math.round((x || 0) * 100)} %`;

// Cuándo se va la luz en la zona del listado: reparto por día de la semana y peso de fines de semana, festivos y temporada alta
function CuandoSeVa({ zona, lugar }) {
  if (!zona?.sub) return null;
  const { sub, esperado } = zona;
  const orden = [1, 2, 3, 4, 5, 6, 0];
  const max = Math.max(...sub.sem, 0.01);
  const pico = sub.sem.indexOf(Math.max(...sub.sem));
  const masFds = sub.fds > esperado.fds * 1.1;
  return (
    <section className="cs card" aria-labelledby="cs-t">
      <div className="cs-txt">
        <h2 id="cs-t">Cuándo se va la luz en {sub.nombre}</h2>
        <p>{masFds
          ? <>El <b>{pc(sub.fds)}</b> de la energía que no llegó por cortes cayó en <b>fines de semana y festivos</b>, que son solo el {pc(esperado.fds)} de los días. Los cortes llegan cuando los alojamientos están más llenos: es el argumento para vender solar con baterías.</>
          : <>El {pc(sub.fds)} de la energía que no llegó por cortes cayó en fines de semana y festivos, que son el {pc(esperado.fds)} de los días.</>}
        </p>
        <p className="small muted">Temporada alta (diciembre, enero, junio, julio y Semana Santa): {pc(sub.alta)} de esa energía, frente a {pc(esperado.alta)} de los días. El día con más energía no entregada fue el <b>{DIAS_L[pico]}</b>. Periodo {zona.periodo}.</p>
        {lugar === 'pais' && zona.ranking?.length > 0 && <p className="small">Donde más se concentran en fines de semana y festivos: {zona.ranking.map((r) => `${r.subarea} (${pc(r.fds)})`).join(', ')}.</p>}
      </div>
      <figure className="cs-fig" aria-label={`Energía no entregada por día de la semana en ${sub.nombre}`}>
        <div className="cs-bars">
          {orden.map((d) => (
            <div key={d} className={`cs-bar ${d === 0 || d === 6 ? 'fds' : ''}`}>
              <span className="cs-v">{pc(sub.sem[d])}</span>
              <span className="cs-b" style={{ height: `${(sub.sem[d] / max) * 100}%` }} />
              <span className="cs-d">{DIAS[d]}</span>
            </div>
          ))}
        </div>
        <figcaption className="small muted">Energía no entregada por cortes según el día de la semana (XM, demanda no atendida).</figcaption>
      </figure>
    </section>
  );
}

const CATS = { '': 'Todos', ALOJAMIENTO: 'Hoteles y alojamientos', 'VIVIENDAS TURÍSTICAS': 'Viviendas turísticas', 'PARQUES TEMÁTICOS': 'Parques temáticos', 'CONCESIONARIOS DE SERVICIOS TURÍSTICOS EN PARQUE': 'Concesiones en parques' };

// Hoteles, viviendas turísticas y parques como clientes potenciales
export default function Clientes({ code }) {
  const { paid, meta } = useApp();
  const [f, setF] = useState({ q: '', dpto: '', cat: '', minHab: '', code: code || '', orden: 'op' });
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [intento, setIntento] = useState(0);
  useEffect(() => { setF((x) => ({ ...x, code: code || '' })); }, [code]);
  useEffect(() => { setPage(0); }, [f]);
  useEffect(() => {
    setData(null);
    setErr(null);
    const t = setTimeout(() => api('/clientes' + qs({ ...f, page })).then(setData).catch((e) => setErr(e.message || 'No se pudo cargar')), 200);
    return () => clearTimeout(t);
  }, [f, page, intento]);
  const csv = () => csvDownload('clientes-turismo.csv', ['establecimiento', 'categoria', 'tipo', 'municipio', 'departamento', 'habitaciones', 'camas', 'empleados', 'direccion', 'telefono', 'correo', 'tarifa_kwh'],
    data.rows.map((c) => [c.n, c.cat, c.sub, c.mun, c.dpto, c.hab, c.camas, c.emp, c.dir, c.tel, c.mail, c.tarifa]));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Hoteles, turismo y recreación</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Establecimientos turísticos activos: consumen energía todo el día (aire acondicionado, piscinas, cocinas) y suelen estar en zonas cálidas con tarifa alta. Son clientes comerciales para sistemas de 10 a 500 kWp.</p></div>
      </div>
      <div className="row">
        {Object.entries(CATS).map(([k, l]) => <button key={k} className={`chip ${f.cat === k ? 'on' : ''}`} style={{ cursor: 'pointer', background: 'none' }} onClick={() => setF({ ...f, cat: k })}>{l}</button>)}
      </div>
      {paid && (
        <div className="row">
          <input className="input" style={{ maxWidth: 260 }} placeholder="Buscar por nombre o tipo" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Buscar establecimiento" />
          <select className="select" style={{ maxWidth: 240 }} value={f.dpto} onChange={(e) => setF({ ...f, dpto: e.target.value, code: '' })} aria-label="Departamento"><option value="">Todos los departamentos</option>{meta.dptos.map((d) => <option key={d}>{d}</option>)}</select>
          <select className="select" style={{ maxWidth: 200 }} value={f.minHab} onChange={(e) => setF({ ...f, minHab: e.target.value })} aria-label="Tamaño mínimo"><option value="">Cualquier tamaño</option><option value="10">10 o más habitaciones</option><option value="30">30 o más</option><option value="80">80 o más</option></select>
          <select className="select" style={{ maxWidth: 260 }} value={f.orden} onChange={(e) => setF({ ...f, orden: e.target.value })} aria-label="Ordenar"><option value="op">Mejor oportunidad primero</option><option value="tam">Más habitaciones primero</option></select>
          {f.code && <button className="chip on" style={{ cursor: 'pointer' }} onClick={() => setF({ ...f, code: '' })}>Municipio {f.code} ✕</button>}
          {data && <button className="btn sm" onClick={csv}>Descargar CSV</button>}
        </div>
      )}
      {data && <CuandoSeVa zona={data.zona} lugar={f.code || f.dpto ? 'zona' : 'pais'} />}
      <Segmentos segmentos={data?.segmentos} titulo={`Cómo abordar ${f.code ? 'este municipio' : f.dpto ? f.dpto : 'el turismo del país'}`} />
      {err ? <div className="alert err" role="alert">{err}. <button className="btn sm" onClick={() => setIntento((x) => x + 1)}>Reintentar</button></div> : !data ? <Spinner /> : (
        <>
          <div className="tbl-wrap">
            <table className="tbl op-tbl"><thead><tr><th className="num">Oportunidad</th><th>Establecimiento</th><th>Municipio</th><th className="num">Habitaciones</th><th className="num hs">Tarifa $/kWh</th><th>Contacto</th><th></th></tr></thead>
              <tbody>{data.rows.map((c) => (
                <tr key={c.id}>
                  <td className="num"><ScoreBadge score={c.op?.score} tier={tier(c.op?.score)} /></td>
                  <td className="name">{c.n}<br /><span className="small muted">{c.sub}{c.dir ? ` · ${c.dir}` : ''}</span><PorQue op={c.op} extra={sistemaTxt(c.op)} /></td>
                  <td className="small"><a href={`#/m/${c.code}`}>{c.mun}</a><br /><span className="muted">{c.dpto}</span></td>
                  <td className="num">{fmt(c.hab)}{c.camas ? <><br /><span className="small muted">{fmt(c.camas)} camas</span></> : null}</td>
                  <td className="num hs">{fmt(c.tarifa)}</td>
                  <td className="small">{c.pj ? <Contact tel={c.tel} mail={c.mail} /> : <span className="muted">Persona natural: sin contacto</span>}</td>
                  <td><ProspectButton p={{ tipo: 'hotel', ref: c.id, nombre: c.n, code: c.code, mun: c.mun, tel: c.pj ? c.tel : null, mail: c.pj ? c.mail : null, detalle: `${c.sub} · ${c.hab} habitaciones` }} /></td>
                </tr>))}</tbody>
            </table>
            {data.locked && <LockedRows cols={6} n={8} text={`Hay ${fmt(data.total)} establecimientos con municipio, tamaño y contacto de empresa en el plan completo.`} />}
          </div>
          {paid && <div className="row"><button className="btn sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</button><span className="small muted">{fmt(data.total)} establecimientos · página {page + 1}</span><button className="btn sm" disabled={(page + 1) * 50 >= data.total} onClick={() => setPage(page + 1)}>Siguiente</button></div>}
          <p className="small muted" style={{ margin: 0, maxWidth: '86ch' }}>La oportunidad combina el tamaño, el calor, la tarifa, los cortes de la zona y si caen en fines de semana y festivos, el crecimiento de la zona (vivienda nueva y viviendas turísticas), el sol y si es empresa. El consumo se estima con 180 kWh por habitación al mes en clima frío, 250 en templado y 350 en cálido, y el sistema sugerido cubre lo que se consume de día (cerca del 45 %): ajústalo con la factura en Diseño solar.</p>
          <Fuente>MinCIT, Registro Nacional de Turismo (datos.gov.co thwd-ivmp), prestadores activos. Algunos registros traen habitaciones mal digitadas; se corrigen con el número de camas y de empleados.</Fuente>
          <PrivacyNote />
        </>
      )}
    </div>
  );
}
