import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Lienzo de nodos y conexiones (entradas → salidas) con curvas, arrastre y conexión por puertos.
// Lo usan el editor de pesos del mapa y la inteligencia profunda.
// nodes: [{ id, kind: 'in' | 'out', x, y, title, sub, tone, body }]
// edges: [{ id, from, to, w (0..1), sign (1 | -1), dashed, label, flow }]
export const NODE_W = { in: 214, out: 232 };
const PORT_Y = 22;

const curva = (x1, y1, x2, y2) => {
  const dx = Math.max(60, Math.abs(x2 - x1) * 0.5);
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
};

export default function NodeCanvas({ nodes, edges, links = [], width = 1000, height = 520, onMove, onConnect, onEdgeClick, onDropItem, selected, minScale = 0.62, ariaLabel, empty }) {
  const wrap = useRef(null);
  const [scale, setScale] = useState(1);
  const [drag, setDrag] = useState(null); // { id, dx, dy } o { port: id, x, y }
  const [over, setOver] = useState(false);

  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return undefined;
    const fit = () => setScale(Math.max(minScale, Math.min(1, el.clientWidth / width)));
    fit();
    const ro = new ResizeObserver(fit); ro.observe(el);
    return () => ro.disconnect();
  }, [width, minScale]);

  const pos = (e) => {
    const r = wrap.current.querySelector('.nc-stage').getBoundingClientRect();
    return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
  };
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const anchor = (n, lado) => ({ x: lado === 'r' ? n.x + NODE_W[n.kind] : n.x, y: n.y + PORT_Y });

  useEffect(() => {
    if (!drag) return undefined;
    const mv = (e) => {
      const p = pos(e);
      if (drag.id) onMove?.(drag.id, Math.max(0, Math.min(width - NODE_W[byId[drag.id]?.kind || 'in'], p.x - drag.dx)), Math.max(0, Math.min(height - 48, p.y - drag.dy)));
      else setDrag((d) => ({ ...d, x: p.x, y: p.y }));
    };
    const up = (e) => {
      if (drag.port) {
        const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-nc-target]');
        if (t) onConnect?.(drag.port, t.getAttribute('data-nc-target'));
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up, { once: true });
    return () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
  }, [drag]);

  const startNode = (e, n) => {
    if (e.button !== 0 || e.target.closest('input,button,select,a,label')) return;
    const p = pos(e);
    setDrag({ id: n.id, dx: p.x - n.x, dy: p.y - n.y });
    e.preventDefault();
  };
  const startPort = (e, n) => { e.stopPropagation(); e.preventDefault(); const a = anchor(n, 'r'); setDrag({ port: n.id, x: a.x, y: a.y }); };
  const keyMove = (e, n) => {
    const d = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[e.key];
    if (!d || e.target !== e.currentTarget) return;
    e.preventDefault();
    onMove?.(n.id, Math.max(0, Math.min(width - NODE_W[n.kind], n.x + d[0])), Math.max(0, Math.min(height - 48, n.y + d[1])));
  };

  return (
    <div ref={wrap} className={`nc ${over ? 'drop' : ''}`} role="group" aria-label={ariaLabel}
      onDragOver={onDropItem ? (e) => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={() => setOver(false)}
      onDrop={onDropItem ? (e) => { e.preventDefault(); setOver(false); const k = e.dataTransfer.getData('text/nc-item'); if (k) { const p = pos(e); onDropItem(k, p.x, p.y); } } : undefined}>
      <div className="nc-sizer" style={{ width: width * scale, height: height * scale }}>
      <div className="nc-stage" style={{ width, height, transform: `scale(${scale})` }}>
        <svg className="nc-svg" width={width} height={height} aria-hidden="true">
          <defs>
            <linearGradient id="nc-pos" x1="0" x2="1"><stop offset="0" stopColor="#5D8BFF" /><stop offset="1" stopColor="#FF9A3D" /></linearGradient>
            <linearGradient id="nc-neg" x1="0" x2="1"><stop offset="0" stopColor="#5D8BFF" /><stop offset="1" stopColor="#7FD8FF" /></linearGradient>
            <filter id="nc-glow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="5" /></filter>
          </defs>
          {links.map((l) => {
            const a = byId[l.a], b = byId[l.b]; if (!a || !b) return null;
            const p1 = anchor(a, 'l'), p2 = anchor(b, 'l');
            const bend = Math.min(90, 30 + Math.abs(p2.y - p1.y) * 0.3);
            return <path key={l.a + l.b} d={`M${p1.x},${p1.y} C${p1.x - bend},${p1.y} ${p2.x - bend},${p2.y} ${p2.x},${p2.y}`} className="nc-link" style={{ opacity: 0.25 + Math.abs(l.r) * 0.5 }} />;
          })}
          {edges.map((ed) => {
            const a = byId[ed.from], b = byId[ed.to]; if (!a || !b) return null;
            const p1 = anchor(a, 'r'), p2 = anchor(b, 'l');
            const d = curva(p1.x, p1.y, p2.x, p2.y);
            const w = 1.4 + (ed.w || 0) * 9;
            const sel = selected === ed.id;
            const grad = ed.sign < 0 ? 'url(#nc-neg)' : 'url(#nc-pos)';
            return (
              <g key={ed.id} className={`nc-edge ${sel ? 'sel' : ''} ${ed.dashed ? 'weak' : ''}`}>
                {(ed.w || 0) > 0.35 && !ed.dashed && <path d={d} stroke={grad} strokeWidth={w + 6} className="nc-glow" filter="url(#nc-glow)" />}
                <path d={d} stroke={grad} strokeWidth={w} className="nc-line" strokeDasharray={ed.dashed ? '5 6' : undefined} />
                {ed.flow && !ed.dashed && <path d={d} className="nc-flow" strokeWidth={Math.max(1.5, w * 0.45)} style={{ animationDuration: `${2.6 - Math.min(1.8, (ed.w || 0) * 2)}s` }} />}
                <path d={d} className="nc-hit" strokeWidth={Math.max(14, w + 8)} onClick={() => onEdgeClick?.(ed)} />
                {ed.label && <text x={p1.x + (p2.x - p1.x) * 0.3} y={p1.y + (p2.y - p1.y) * 0.22 - 6} className="nc-elabel" textAnchor="middle">{ed.label}</text>}
              </g>
            );
          })}
          {drag?.port && byId[drag.port] && (() => { const a = anchor(byId[drag.port], 'r'); return <path d={curva(a.x, a.y, drag.x, drag.y)} className="nc-temp" />; })()}
        </svg>
        {nodes.map((n) => (
          <div key={n.id} className={`nc-node ${n.kind} ${n.tone || ''} ${drag?.id === n.id ? 'drag' : ''}`} style={{ left: n.x, top: n.y, width: NODE_W[n.kind] }}
            onPointerDown={(e) => startNode(e, n)} tabIndex={0} onKeyDown={(e) => keyMove(e, n)} aria-label={`${n.title}. Flechas para mover.`}
            {...(n.kind === 'out' ? { 'data-nc-target': n.id } : {})}>
            {n.kind === 'out' && <span className="nc-port in" aria-hidden="true" />}
            <div className="nc-head"><b>{n.title}</b>{n.sub && <span>{n.sub}</span>}</div>
            {n.body}
            {n.kind === 'in' && onConnect && <span className="nc-port out" onPointerDown={(e) => startPort(e, n)} title="Arrastra hasta la salida para conectar" aria-hidden="true" />}
            {n.kind === 'in' && !onConnect && <span className="nc-port out fixed" aria-hidden="true" />}
          </div>
        ))}
        {!nodes.length && empty && <div className="nc-empty">{empty}</div>}
      </div>
      </div>
    </div>
  );
}
