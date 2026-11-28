import React from 'react';
import { fmt } from '../api.js';
import { FIGURAS, ENTIDADES, NORMAS, DOCS_174, MODELOS_NEGOCIO, REVISADO, CON_RED } from './tramites.js';

// Ruta de conexión para los PDF: pasos como línea de tiempo, documentos con su estado, entidades, reglas,
// cómo se paga la energía y la red cercana al punto. Se imprime en blanco con los colores de la marca.
export function rutaDatos({ fig, exc = true, check = {} }) {
  const F = FIGURAS[fig] || FIGURAS.agpe_peq;
  const docs = [...F.docs(exc).map((l) => `${l}. ${DOCS_174[l]}`), ...F.extra];
  const listos = docs.filter((x) => check[x]).length;
  return { F, docs, listos, pasos: F.pasos(exc) };
}

// Página 1: la línea de tiempo de pasos
export function RutaPasos({ fig, exc, check, z, compacto }) {
  const { F, docs, listos, pasos } = rutaDatos({ fig, exc, check });
  const muni = z?.muni;
  return (
    <div className={`rp ${compacto ? 'compacto' : ''}`}>
      <div className="rp-fig">
        <span className="rp-tag">Figura de conexión</span>
        <b>{F.nombre}</b>
        <span>{F.para}</span>
      </div>
      <div className="rp-kpis">
        <div><span>Pasos</span><b>{pasos.length}</b></div>
        {compacto ? <div><span>Documentos que pide</span><b>{docs.length}</b></div> : <div><span>Documentos listos</span><b>{listos} de {docs.length}</b></div>}
        <div><span>Tiempo estimado</span><b>{F.tiempo(exc)}</b></div>
        {muni && <div><span>Operador de red</span><b>{muni.or || '—'}</b></div>}
      </div>
      <ol className={`rp-line ${pasos.length > 6 ? 'dos' : ''} ${pasos.reduce((a, x) => a + x[0].length + (x[1] || '').length + (x[2] || '').length, 0) > 700 ? 'muchos' : ''}`} style={{ '--filas': Math.ceil(pasos.length / 2) }}>
        {pasos.map(([t, quien, plazo, det], i) => (
          <li key={i} className={pasos.length > 6 && i === Math.ceil(pasos.length / 2) - 1 ? 'fin' : ''}>
            <i aria-hidden="true">{i + 1}</i>
            <div>
              <b>{t}</b>
              <span className="rp-chips"><em>{quien}</em>{plazo && <em className="plazo">{plazo}</em>}</span>
              {det && !compacto && <p>{det}</p>}
            </div>
          </li>
        ))}
      </ol>
      <p className="rp-total">{F.total(exc)}</p>
    </div>
  );
}

// Página 2: documentos, entidades, reglas, pago, red y normas
export function RutaDetalle({ fig, exc, check, z, parte = 0 }) {
  const { F, docs } = rutaDatos({ fig, exc, check });
  const muni = z?.muni;
  return (
    <div className="rp">
      {parte !== 2 && <div className="rp-two">
        <div>
          <h3 className="r2-h3">Documentos</h3>
          <ul className="rp-docs">{docs.map((x) => <li key={x} className={check?.[x] ? 'ok' : ''}><i aria-hidden="true">{check?.[x] ? '✓' : ''}</i><span>{x}</span></li>)}</ul>
        </div>
        <div>
          <h3 className="r2-h3">Con quién se tramita</h3>
          <dl className="rp-ent">{F.entidades.map((k) => { const [t, x] = ENTIDADES[k](muni); return <div key={k}><dt>{t}</dt><dd>{x}</dd></div>; })}</dl>
        </div>
      </div>}
      {parte !== 1 && <div className="rp-two">
        <div><h3 className="r2-h3">Reglas y límites</h3><ul className="rp-list">{F.limites.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div>
          <h3 className="r2-h3">Cómo se paga la energía</h3><ul className="rp-list">{F.valor.map((x) => <li key={x}>{x}</li>)}</ul>
          {fig !== 'proyecto' && <><h3 className="r2-h3">Quién puede ser dueño del sistema</h3><dl className="rp-ent">{MODELOS_NEGOCIO.map(([t, x]) => <div key={t}><dt>{t}</dt><dd>{x}</dd></div>)}</dl></>}
        </div>
      </div>}
      {parte !== 2 && CON_RED.has(fig) && z && (
        <div>
          <h3 className="r2-h3">Red cerca del punto{muni ? ` · ${muni.name}, ${muni.dpto}` : ''}</h3>
          <div className="rp-two">
            <table className="r2-tbl"><thead><tr><th>Barra (UPME)</th><th>km</th><th>MW libres 2026</th></tr></thead><tbody>
              {(z.capacidad || []).slice(0, 5).map((b) => <tr key={b.n}><td>{b.n}</td><td>{fmt(b.km, 1)}</td><td>{fmt(b.p95_2026, 1)}</td></tr>)}
              {!z.capacidad?.length && <tr><td colSpan="3">Sin barras evaluadas a menos de 80 km.</td></tr>}
            </tbody></table>
            <table className="r2-tbl"><thead><tr><th>Subestación</th><th>Tensión</th><th>km</th></tr></thead><tbody>
              {(z.subs || []).slice(0, 5).map((s) => <tr key={s.n + s.km}><td>{s.n}</td><td>{s.kv}</td><td>{fmt(s.km, 1)}</td></tr>)}
            </tbody></table>
          </div>
          <p className="r2-note">{fmt(z.cola_n)} proyecto{z.cola_n === 1 ? '' : 's'} registrado{z.cola_n === 1 ? '' : 's'} a menos de 50 km ({fmt(z.cola_mw)} MW) compiten por la misma red. Capacidad indicativa de la UPME{z.capacidad_fecha ? ` (${z.capacidad_fecha})` : ''}; la asigna el concepto de conexión.</p>
        </div>
      )}
      {parte !== 1 && <p className="r2-note"><b>Normas:</b> {F.normas.map((k) => NORMAS[k].t).join(' · ')}. Ruta revisada el {REVISADO} con los textos de la CREG y la UPME. No es asesoría legal: confirme con el operador de red antes de radicar.</p>}
    </div>
  );
}
