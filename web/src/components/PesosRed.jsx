import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App.jsx';
import { readLocal, writeLocal } from '../local.js';
import NodeCanvas, { NODE_W } from './NodeCanvas.jsx';
import { Icon } from './Icon.jsx';

// Cómo se arma el puntaje, como una red: las entradas se arrastran al lienzo, se conectan a la salida
// con una curva y cada conexión tiene su peso. Al cambiar algo, el mapa y el ranking se recalculan.
const W = 880, H = 520, MAXW = 60;

function ubicar(ids, prev) {
  const out = {};
  let i = 0;
  for (const id of ids) {
    if (prev[id]) { out[id] = prev[id]; continue; }
    const col = Math.floor(i / 6), fila = i % 6;
    out[id] = { x: 18 + col * 232, y: 14 + fila * 84 };
    i++;
  }
  return out;
}

export default function PesosRed({ onClose, top = [] }) {
  const { prof, profile, weights, setWeights, paid } = useApp();
  const cat = prof.catalogo || Object.fromEntries(Object.entries(prof.factors).map(([k, l]) => [k, { label: l, grupo: 'Factores', propio: true }]));
  const keyPos = `rs_pesos_red_${profile}`;
  const guardado = readLocal(keyPos, null);
  // Nodos en el lienzo: los conectados (peso > 0) y los que el usuario dejó sueltos
  const [w, setW] = useState(() => ({ ...weights }));
  const [sueltos, setSueltos] = useState(() => (guardado?.sueltos || []).filter((k) => cat[k]));
  const [pos, setPos] = useState(() => guardado?.pos || {});
  const [sel, setSel] = useState(null);
  const [q, setQ] = useState('');
  const timer = useRef(null);

  useEffect(() => { setW({ ...weights }); }, [profile]);
  const enLienzo = useMemo(() => [...new Set([...Object.keys(w).filter((k) => cat[k] && +w[k] > 0), ...sueltos])], [w, sueltos]);
  const posiciones = useMemo(() => ubicar(enLienzo, pos), [enLienzo, pos]);
  useEffect(() => { writeLocal(keyPos, { pos: posiciones, sueltos }); }, [posiciones, sueltos]);

  // Los cambios se mandan al mapa con una pausa corta, para no recalcular en cada movimiento del control
  const commit = (nw) => {
    setW(nw);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setWeights(nw), 350);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const conectados = enLienzo.filter((k) => +w[k] > 0);
  const suma = conectados.reduce((a, k) => a + +w[k], 0) || 1;
  const maxW = Math.max(1, ...conectados.map((k) => +w[k]));
  const agregar = (k, x, y) => {
    if (!paid || !cat[k]) return;
    if (!enLienzo.includes(k)) setSueltos((s) => [...s, k]);
    if (x != null) setPos((p) => ({ ...p, [k]: { x: Math.max(0, Math.min(W - NODE_W.in - 260, x - 90)), y: Math.max(0, Math.min(H - 60, y - 20)) } }));
  };
  const conectar = (k) => { if (!paid) return; setSueltos((s) => (s.includes(k) ? s : [...s, k])); commit({ ...w, [k]: +w[k] > 0 ? w[k] : 15 }); };
  const desconectar = (k) => { setSueltos((s) => (s.includes(k) ? s : [...s, k])); commit({ ...w, [k]: 0 }); };
  const quitar = (k) => { setSueltos((s) => s.filter((x) => x !== k)); commit({ ...w, [k]: 0 }); if (sel === k) setSel(null); };
  const restablecer = () => { setSueltos([]); setPos({}); const base = Object.fromEntries(Object.keys(cat).map((k) => [k, 0])); commit({ ...base, ...prof.weights }); };

  const salida = { x: W - NODE_W.out - 20, y: H / 2 - 70 };
  const nodes = [
    ...enLienzo.map((k) => {
      const p = posiciones[k], on = +w[k] > 0;
      return {
        id: k, kind: 'in', x: p.x, y: p.y, title: cat[k].label, sub: on ? `${Math.round((w[k] / suma) * 100)} % del puntaje` : 'Sin conectar', tone: on ? '' : 'off',
        body: (
          <div className="nc-body">
            {on ? (
              <label className="nc-w"><span className="sr-only">Peso de {cat[k].label}</span>
                <input type="range" min="5" max={MAXW} step="5" value={w[k]} disabled={!paid} onChange={(e) => commit({ ...w, [k]: +e.target.value })} />
                <span className="mono">{w[k]}</span>
              </label>
            ) : (
              <button className="btn sm" onClick={() => conectar(k)} disabled={!paid}>Conectar a la salida</button>
            )}
            <div className="nc-acts">
              {on && <button className="link-btn small" onClick={() => desconectar(k)} disabled={!paid}>Desconectar</button>}
              <button className="link-btn small" onClick={() => quitar(k)} disabled={!paid} aria-label={`Quitar ${cat[k].label} del lienzo`}>Quitar</button>
            </div>
          </div>
        ),
      };
    }),
    {
      id: 'salida', kind: 'out', x: salida.x, y: salida.y, title: `Puntaje · ${prof.short}`, sub: `${conectados.length} entrada${conectados.length === 1 ? '' : 's'} conectada${conectados.length === 1 ? '' : 's'}`, tone: 'out',
      body: (
        <div className="nc-body">
          {top.length > 0 && <ol className="nc-top">{top.slice(0, 5).map((t) => <li key={t.code}><span>{t.name}</span><b>{t.score}</b></li>)}</ol>}
          <span className="small muted">Cada entrada se vuelve un percentil entre municipios y se suma con su peso.{prof.segments ? ' Después se ajusta por el volumen de obra nueva.' : ''}</span>
        </div>
      ),
    },
  ];
  const edges = conectados.map((k) => ({ id: k, from: k, to: 'salida', w: +w[k] / maxW, sign: 1, flow: true, label: `${Math.round((w[k] / suma) * 100)} %` }));

  const libres = Object.entries(cat).filter(([k]) => !enLienzo.includes(k) && (!q || cat[k].label.toLowerCase().includes(q.toLowerCase())));
  const grupos = libres.reduce((a, [k, f]) => { (a[f.grupo] ||= []).push([k, f]); return a; }, {});

  return (
    <section className="pesos-dock glass" aria-labelledby="pesos-t">
      <header className="pesos-head">
        <Icon name="sliders" size={18} />
        <div>
          <h2 id="pesos-t">Cómo se arma el puntaje</h2>
          <p className="small muted">Arrastra entradas al lienzo, únelas a la salida desde el punto de la derecha y ajusta cuánto pesa cada una. El mapa cambia al instante.</p>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          {paid && <button className="btn sm ghost" onClick={restablecer}>Pesos por defecto</button>}
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icon name="x" size={16} /></button>
        </div>
      </header>
      {!paid && <div className="alert small" style={{ margin: '0 14px' }}>En la prueba puedes ver cómo se arma el puntaje. Cambiar las conexiones y los pesos está en el plan completo.</div>}
      <div className="pesos-body">
        <aside className="pesos-lib" aria-label="Entradas disponibles">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar entrada" aria-label="Buscar entrada" />
          {Object.entries(grupos).map(([g, xs]) => (
            <div key={g} className="pesos-grp">
              <b className="small">{g}</b>
              {xs.map(([k, f]) => (
                <button key={k} className="pesos-chip" draggable={paid} onDragStart={(e) => { e.dataTransfer.setData('text/nc-item', k); e.dataTransfer.effectAllowed = 'copy'; }} onClick={() => agregar(k)} disabled={!paid} title="Arrástrala al lienzo o tócala para agregarla">
                  <span>{f.label}</span>{f.propio && <i className="small">del perfil</i>}<Icon name="plus" size={13} />
                </button>
              ))}
            </div>
          ))}
          {!libres.length && <span className="small muted">Todas las entradas están en el lienzo.</span>}
        </aside>
        <NodeCanvas nodes={nodes} edges={edges} width={W} height={H} selected={sel}
          onMove={(id, x, y) => { if (id !== 'salida') setPos((p) => ({ ...p, [id]: { x, y } })); }}
          onConnect={paid ? (from, to) => { if (to === 'salida') conectar(from); } : undefined}
          onEdgeClick={(e) => setSel(e.id)}
          onDropItem={paid ? agregar : undefined}
          ariaLabel="Lienzo del puntaje: entradas conectadas a la salida"
          empty="Arrastra aquí las entradas que quieres que cuenten en el puntaje." />
      </div>
      {sel && +w[sel] > 0 && (
        <div className="pesos-sel small">
          <b>{cat[sel].label}</b> aporta el {Math.round((w[sel] / suma) * 100)} % del puntaje.
          <button className="link-btn" onClick={() => { desconectar(sel); setSel(null); }} disabled={!paid}>Desconectar</button>
        </div>
      )}
    </section>
  );
}
