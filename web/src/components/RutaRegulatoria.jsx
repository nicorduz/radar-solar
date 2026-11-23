import React, { useEffect, useState } from 'react';
import { api, fmt } from '../api.js';
import { Icon } from './Icon.jsx';
import { FIGURAS, ENTIDADES, NORMAS, DOCS_174, MODELOS_NEGOCIO, REVISADO, figuraSugerida } from './tramites.js';

const ORDEN = ['agpe_peq', 'agpe_med', 'colectiva', 'remota', 'gd', 'proyecto'];
const CON_RED = new Set(['proyecto', 'remota', 'gd', 'agpe_med']);

// Una sección plegable del panel; solo una abierta a la vez
function Sec({ id, abierta, setAbierta, titulo, resumen, children }) {
  const on = abierta === id;
  return (
    <section className={`rr-sec ${on ? 'on' : ''}`}>
      <h3>
        <button aria-expanded={on} aria-controls={`rr-${id}`} onClick={() => setAbierta(on ? null : id)}>
          <span className="rr-sec-t">{titulo}</span>
          {resumen && <span className="rr-sec-r">{resumen}</span>}
          <span className="caret" aria-hidden="true">▾</span>
        </button>
      </h3>
      {on && <div id={`rr-${id}`} className="rr-sec-b">{children}</div>}
    </section>
  );
}

// Trámites en la columna derecha del diseño: figura, zona y secciones
export default function RutaRegulatoria({ d, set, kwAc, punto, paid }) {
  const sug = figuraSugerida(kwAc);
  const fig = d.figura || sug;
  const F = FIGURAS[fig];
  const exc = d.excedentes !== false;
  const [z, setZ] = useState(null);
  const [err, setErr] = useState(null);
  const [abierta, setAbierta] = useState('falta');
  const key = punto ? `${punto[0].toFixed(3)},${punto[1].toFixed(3)}` : '';
  useEffect(() => {
    if (!punto) return;
    setErr(null);
    api(`/tramite?lat=${punto[1].toFixed(5)}&lon=${punto[0].toFixed(5)}`).then(setZ).catch((e) => setErr(e.message));
  }, [key]);
  const check = d.check?.[fig] || {};
  const marcar = (item, v) => set('check', { ...(d.check || {}), [fig]: { ...check, [item]: v } });
  const docs = [...F.docs(exc).map((l) => `${l}. ${DOCS_174[l]}`), ...F.extra];
  const faltan = docs.filter((x) => !check[x]);
  const pasos = F.pasos(exc);
  const muni = z?.muni;
  const p = { abierta, setAbierta };

  return (
    <div className="card dz-sec rr">
      <label className="f">¿Cómo se va a conectar?
        <select className="select" value={fig} onChange={(e) => set('figura', e.target.value)}>
          {ORDEN.map((k) => <option key={k} value={k}>{FIGURAS[k].nombre}{k === sug && kwAc > 0 ? ' (sugerida)' : ''}</option>)}
        </select>
      </label>
      <p className="small muted rr-para">{F.para}</p>
      {(fig === 'agpe_peq' || fig === 'agpe_med') && (
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={exc} onChange={(e) => set('excedentes', e.target.checked)} />
          Va a entregar excedentes a la red
        </label>
      )}

      <div className="rr-zona">
        <span><Icon name="pin" size={14} />{muni ? `${muni.name}, ${muni.dpto}` : 'Ubica el proyecto en el mapa'}</span>
        {muni && <span>Operador de red: <b>{muni.or}</b></span>}
      </div>
      {err && <div className="alert err small">{err}</div>}
      {muni?.zni && <div className="alert small">Zona no interconectada: el trámite es con el prestador local y algunas reglas del SIN no aplican igual.</div>}

      <dl className="rr-resumen">
        <div><dt>Documentos</dt><dd>{docs.length - faltan.length} de {docs.length}</dd></div>
        <div><dt>Pasos</dt><dd>{pasos.length}</dd></div>
        <div><dt>Tiempo</dt><dd>{F.tiempo(exc)}</dd></div>
      </dl>

      <div className="rr-secs">
        <Sec id="falta" titulo="Lo que te falta" resumen={faltan.length ? `${faltan.length} pendientes` : 'Todo listo'} {...p}>
          <ul className="rr-check">
            {docs.map((x) => <li key={x}><label><input type="checkbox" checked={!!check[x]} onChange={(e) => marcar(x, e.target.checked)} /><span>{x}</span></label></li>)}
          </ul>
          <span className="small muted">Se guarda con este diseño.</span>
        </Sec>

        <Sec id="quien" titulo="Con quién hablas" resumen={`${F.entidades.length} entidades`} {...p}>
          <dl className="rr-ent">
            {F.entidades.map((k) => { const [t, x] = ENTIDADES[k](muni); return <div key={k}><dt>{t}</dt><dd>{x}</dd></div>; })}
          </dl>
          {z?.guia_or && <p className="small"><a href={z.guia_or} target="_blank" rel="noreferrer">Guía de conexión de {muni.or}</a></p>}
          {muni && !z?.guia_or && <p className="small muted">En el sitio de {muni.or}, sección de autogeneración: sistema en línea, mapa de disponibilidad y formulario.</p>}
        </Sec>

        <Sec id="proceso" titulo="Proceso completo" resumen={F.tiempo(exc)} {...p}>
          <ol className="rr-steps">
            {pasos.map(([t, quien, plazo, det], i) => (
              <li key={i}>
                <b>{t}</b>
                <span className="small muted">{quien}{plazo ? ` · ${plazo}` : ''}</span>
                {det && <p className="small">{det}</p>}
              </li>
            ))}
          </ol>
          <p className="rr-total">{F.total(exc)}</p>
        </Sec>

        <Sec id="reglas" titulo="Reglas y límites" {...p}>
          <ul className="rr-list">{F.limites.map((x) => <li key={x}>{x}</li>)}</ul>
        </Sec>

        <Sec id="pago" titulo="Cómo se paga la energía" {...p}>
          <ul className="rr-list">{F.valor.map((x) => <li key={x}>{x}</li>)}</ul>
        </Sec>

        {CON_RED.has(fig) && (
          <Sec id="red" titulo="Red cerca de este punto" resumen={z ? `${fmt(z.cola_n)} proyecto${z.cola_n === 1 ? '' : 's'} a 50 km` : null} {...p}>
            {!z ? <p className="small muted">Ubica el proyecto en el mapa.</p> : <>
              <h4>Capacidad para conectar generación</h4>
              {z.capacidad.length ? (
                <table className="tbl rr-tbl"><thead><tr><th>Barra</th><th className="num">km</th><th className="num">MW 2026</th></tr></thead><tbody>
                  {z.capacidad.map((b) => <tr key={b.n}><td>{b.n}</td><td className="num">{fmt(b.km, 1)}</td><td className="num"><b>{fmt(b.p95_2026, 1)}</b></td></tr>)}
                </tbody></table>
              ) : <p className="small muted">No hay barras evaluadas a menos de 80 km.</p>}
              <p className="small muted">Capacidad indicativa de la UPME ({z.capacidad_fecha || 's/d'}), 95 % de los escenarios. La capacidad se asigna con el concepto de conexión.</p>
              <h4>Subestaciones más cercanas</h4>
              <table className="tbl rr-tbl"><thead><tr><th>Subestación</th><th>Tensión</th><th className="num">km</th></tr></thead><tbody>
                {z.subs.map((s) => <tr key={s.n + s.km}><td>{s.n}{s.sistema ? <span className="small muted"> · {s.sistema}</span> : null}</td><td className="small">{s.kv}</td><td className="num">{fmt(s.km, 1)}</td></tr>)}
              </tbody></table>
              <h4>Proyectos registrados a menos de 50 km</h4>
              <p className="small"><b>{fmt(z.cola_n)}</b> proyecto{z.cola_n === 1 ? '' : 's'}, <b>{fmt(z.cola_mw)}</b> MW compitiendo por la misma red.</p>
              {z.cola.length > 0 && <ul className="rr-list small">{z.cola.map((u) => <li key={u.n + u.km}>{u.n}: {fmt(u.mw, 1)} MW, {u.fase?.toLowerCase()}, a {fmt(u.km, 1)} km</li>)}</ul>}
              {z.locked && <p className="small muted">Con el plan completo ves todas las barras, subestaciones y proyectos.</p>}
            </>}
          </Sec>
        )}

        {fig !== 'proyecto' && (
          <Sec id="modelos" titulo="Quién pone el sistema" {...p}>
            <dl className="rr-ent">{MODELOS_NEGOCIO.map(([t, x]) => <div key={t}><dt>{t}</dt><dd>{x}</dd></div>)}</dl>
          </Sec>
        )}

        <Sec id="normas" titulo="Normas" resumen={`${F.normas.length}`} {...p}>
          <ul className="rr-list small">{F.normas.map((k) => <li key={k}><a href={NORMAS[k].u} target="_blank" rel="noreferrer">{NORMAS[k].t}</a></li>)}</ul>
        </Sec>
      </div>
      <p className="small muted">Revisado el {REVISADO} con los textos de la CREG y la UPME. Confirma con el operador de red antes de radicar.{!paid ? ' Plan de prueba: datos de red parciales.' : ''}</p>
    </div>
  );
}
