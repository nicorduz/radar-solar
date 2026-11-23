import React from 'react';
import { fmt } from '../api.js';

// Piezas compartidas de "oportunidad": colegios, salud y turismo
export const tier = (s) => (s >= 80 ? 'caliente' : s >= 65 ? 'tibio' : 'frio');
export const millones = (v) => (v == null ? null : `$${(v / 1e6).toLocaleString('es-CO', { maximumFractionDigits: v < 1e8 ? 1 : 0 })} M`);

// Por qué y cómo entrar, debajo del nombre de cada cliente
export function PorQue({ op, extra }) {
  if (!op) return null;
  return (
    <div className="op-why">
      <ul>{op.razones.map((r) => <li key={r}>{r}</li>)}</ul>
      <p><b>Cómo entrar:</b> {op.via}</p>
      {extra && <p className="muted">{extra}</p>}
    </div>
  );
}

// Segmentos para abordar el listado filtrado
export function Segmentos({ segmentos, titulo }) {
  if (!segmentos?.length) return null;
  return (
    <section className="op-segs" aria-labelledby="op-segs-t">
      <h2 id="op-segs-t">{titulo}</h2>
      <ul>
        {segmentos.map((g) => (
          <li key={g.id}>
            <b className="op-seg-n">{fmt(g.n)}</b>
            <span className="op-seg-t">{g.titulo}</span>
            <span className="small">{g.como}</span>
            {g.ejemplos.length > 0 && <span className="small muted">Por ejemplo: {g.ejemplos.join(', ')}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export const sistemaTxt = (op) => (op?.kwp ? `Sistema sugerido: unos ${fmt(op.kwp)} kWp${op.ahorro ? `, ahorro cercano a ${millones(op.ahorro)} al año` : ''}.` : null);
