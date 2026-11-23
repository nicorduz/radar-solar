import React, { useEffect, useState } from 'react';
import { api, fmt } from '../api.js';
import { Icon } from './Icon.jsx';
import { FIGURAS, ENTIDADES, NORMAS, DOCS_174, MODELOS_NEGOCIO, REVISADO, figuraSugerida } from './tramites.js';

const ORDEN = ['agpe_peq', 'agpe_med', 'colectiva', 'remota', 'gd', 'proyecto'];
const CON_RED = new Set(['proyecto', 'remota', 'gd', 'agpe_med']);
const Verif = () => <span className="rr-verif" title="Tomado de una fuente secundaria: confírmalo en el texto oficial">por confirmar</span>;

// Selector de figura: va en la columna lateral del diseño
export function FiguraPicker({ d, set, kwAc }) {
  const sug = figuraSugerida(kwAc);
  const fig = d.figura || sug;
  return (
    <div className="card dz-sec rr-pick">
      <h3>¿Cómo se va a conectar?</h3>
      <div role="radiogroup" aria-label="Figura regulatoria" className="rr-figs">
        {ORDEN.map((k) => (
          <button key={k} role="radio" aria-checked={fig === k} className={fig === k ? 'on' : ''} onClick={() => set('figura', k)}>
            <b>{FIGURAS[k].nombre}</b>
            <span className="small muted">{FIGURAS[k].para}</span>
            {k === sug && kwAc > 0 && <span className="rr-sug">Sugerida para {fmt(kwAc, 1)} kW</span>}
          </button>
        ))}
      </div>
      {(fig === 'agpe_peq' || fig === 'agpe_med') && (
        <label className="row small" style={{ gap: 8 }}>
          <input type="checkbox" checked={d.excedentes !== false} onChange={(e) => set('excedentes', e.target.checked)} />
          Va a entregar excedentes a la red
        </label>
      )}
      <span className="small muted">El detalle, los pasos y la lista de documentos están abajo.</span>
    </div>
  );
}

// Detalle de la figura elegida, con el contexto de la zona
export default function RutaRegulatoria({ d, set, kwAc, punto, paid }) {
  const fig = d.figura || figuraSugerida(kwAc);
  const F = FIGURAS[fig];
  const exc = d.excedentes !== false;
  const [z, setZ] = useState(null);
  const [err, setErr] = useState(null);
  const key = punto ? `${punto[0].toFixed(3)},${punto[1].toFixed(3)}` : '';
  useEffect(() => {
    if (!punto) return;
    setErr(null);
    api(`/tramite?lat=${punto[1].toFixed(5)}&lon=${punto[0].toFixed(5)}`).then(setZ).catch((e) => setErr(e.message));
  }, [key]);
  const check = d.check?.[fig] || {};
  const marcar = (item, v) => set('check', { ...(d.check || {}), [fig]: { ...check, [item]: v } });
  const docs = [...F.docs(exc).map((l) => `${l}. ${DOCS_174[l]}`), ...F.extra];
  const hechos = docs.filter((x) => check[x]).length;
  const pasos = F.pasos(exc);
  const muni = z?.muni;

  return (
    <section className="card rr" aria-labelledby="rr-t">
      <header className="rr-head">
        <div>
          <h2 id="rr-t">Trámites: {F.nombre[0].toLowerCase() + F.nombre.slice(1)}</h2>
          <p className="small muted">{muni ? <>{muni.name}, {muni.dpto} · operador de red <b>{muni.or}</b></> : 'Dibuja el techo o ubica el proyecto en el mapa para ver la red y el operador de esa zona.'}</p>
        </div>
        <p className="small muted rr-rev">Revisado el {REVISADO} contra los textos de la CREG y la UPME. No es asesoría legal: confirma con el operador de red antes de radicar.</p>
      </header>

      {err && <div className="alert err">{err}</div>}
      {muni?.zni && <div className="alert small">Este municipio está en una zona no interconectada: el trámite es con el prestador local y algunas reglas del SIN no aplican igual.</div>}

      <div className="rr-grid">
        <div className="rr-col">
          <h3>Lo esencial</h3>
          <ul className="rr-list">{F.limites.map((x) => <li key={x}>{x}</li>)}</ul>
          <h3>Cómo se paga la energía</h3>
          <ul className="rr-list">{F.valor.map((x) => <li key={x}>{x}</li>)}</ul>
          <h3>Con quién hablas</h3>
          <dl className="rr-ent">
            {F.entidades.map((k) => { const [t, x] = ENTIDADES[k](muni); return <div key={k}><dt>{t}</dt><dd>{x}</dd></div>; })}
          </dl>
          {z?.guia_or && <p className="small"><a href={z.guia_or} target="_blank" rel="noreferrer">Guía de conexión de {muni.or}</a> (documento del operador).</p>}
          {muni && !z?.guia_or && <p className="small muted">Busca en el sitio de {muni.or} la sección de autogeneración: ahí están el sistema en línea, el mapa de disponibilidad y el formulario.</p>}
        </div>

        <div className="rr-col">
          <h3>Pasos y tiempos</h3>
          <ol className="rr-steps">
            {pasos.map(([t, quien, plazo, det, verif], i) => (
              <li key={i}>
                <div className="rr-step-h"><b>{t}</b>{plazo && <span className="rr-plazo">{plazo}</span>}</div>
                <span className="small muted">{quien}</span>
                {det && <p className="small">{det} {verif && <Verif />}</p>}
              </li>
            ))}
          </ol>
          <p className="rr-total"><Icon name="clock" size={16} />{F.total(exc)}</p>
        </div>
      </div>

      {CON_RED.has(fig) && z && (
        <div className="rr-red">
          <h3>Red cerca de este punto</h3>
          {z.locked && <p className="small muted">Plan de prueba: se muestra un elemento de cada lista.</p>}
          <div className="rr-red-g">
            <div>
              <h4>Capacidad para conectar generación</h4>
              {z.capacidad.length ? (
                <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Barra</th><th className="num">km</th><th className="num">MW 2026</th><th className="num">MW 2027</th></tr></thead><tbody>
                  {z.capacidad.map((b) => <tr key={b.n}><td className="name">{b.n}<br /><span className="small muted">{b.op}</span></td><td className="num">{fmt(b.km, 1)}</td><td className="num"><b>{fmt(b.p95_2026, 1)}</b></td><td className="num">{fmt(b.p95_2027, 1)}</td></tr>)}
                </tbody></table></div>
              ) : <p className="small muted">No hay barras evaluadas a menos de 80 km.</p>}
              <p className="small muted">Capacidad indicativa de la UPME ({z.capacidad_fecha || 's/d'}) en el 95 % de los escenarios. No es una asignación: la capacidad se asigna con el concepto de conexión.</p>
            </div>
            <div>
              <h4>Subestaciones más cercanas</h4>
              <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Subestación</th><th>Tensión</th><th className="num">km</th></tr></thead><tbody>
                {z.subs.map((s) => <tr key={s.n + s.km}><td className="name">{s.n}<br /><span className="small muted">{s.sistema === 'STN' ? 'Transmisión nacional' : s.sistema === 'STR' ? 'Transmisión regional' : ''}{s.op ? ` · ${s.op}` : ''}</span></td><td className="small">{s.kv}</td><td className="num">{fmt(s.km, 1)}</td></tr>)}
              </tbody></table></div>
            </div>
            <div>
              <h4>Proyectos registrados a menos de 50 km</h4>
              <p className="rr-cola"><b>{fmt(z.cola_n)}</b> proyectos · <b>{fmt(z.cola_mw)}</b> MW compitiendo por la misma red</p>
              {z.cola.length > 0 && <ul className="rr-list small">{z.cola.map((u) => <li key={u.n + u.km}>{u.n} · {fmt(u.mw, 1)} MW {u.tipo?.toLowerCase()} · {u.fase?.toLowerCase()} · {fmt(u.km, 1)} km{u.operacion ? ` · operación prevista ${u.operacion.slice(0, 7)}` : ''}</li>)}</ul>}
              <p className="small muted">Registro de proyectos de la UPME, corte {z.upme_corte || 's/d'}.</p>
            </div>
          </div>
        </div>
      )}

      <div className="rr-docs">
        <div className="rr-docs-h"><h3>Documentos y diseños</h3><span className="small muted">{hechos} de {docs.length} listos</span></div>
        <ul>
          {docs.map((x) => <li key={x}><label><input type="checkbox" checked={!!check[x]} onChange={(e) => marcar(x, e.target.checked)} /><span>{x}</span></label></li>)}
        </ul>
        <span className="small muted">Se guarda con este diseño.</span>
      </div>

      {fig !== 'proyecto' && (
        <div className="rr-modelos">
          <h3>Quién pone el sistema</h3>
          <dl className="rr-ent">{MODELOS_NEGOCIO.map(([t, x, v]) => <div key={t}><dt>{t}</dt><dd>{x} {v && <Verif />}</dd></div>)}</dl>
        </div>
      )}

      <footer className="rr-normas small">
        <b>Normas</b>
        {F.normas.map((k) => <a key={k} href={NORMAS[k].u} target="_blank" rel="noreferrer">{NORMAS[k].t}</a>)}
      </footer>
      {!paid && <p className="small muted">Con el plan completo ves todas las subestaciones, barras y proyectos cercanos.</p>}
    </section>
  );
}
