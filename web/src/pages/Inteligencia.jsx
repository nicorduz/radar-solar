import React, { useEffect, useMemo, useState } from 'react';
import { api, fmt } from '../api.js';
import { useApp } from '../App.jsx';
import { readLocal, writeLocal } from '../local.js';
import NodeCanvas, { NODE_W } from '../components/NodeCanvas.jsx';
import { Icon } from '../components/Icon.jsx';
import { Spinner } from '../components/ui.jsx';

// Inteligencia profunda: el usuario arma salidas y entradas, y la red muestra qué se relaciona con qué y cuánto.
const W = 1000, H0 = 540, PASO = 86;
const EJEMPLOS = [
  { t: '¿Qué va con las importaciones de paneles?', nivel: 'dpto', pc: true, salidas: ['imp_usd_2025'], descubrir: true },
  { t: '¿Dónde hay más colegios por habitante?', nivel: 'muni', pc: true, salidas: ['colegios'], descubrir: true },
  { t: '¿Qué acompaña a una tarifa alta?', nivel: 'muni', pc: false, salidas: ['tarifa'], descubrir: true },
  { t: 'Autogeneradores nuevos e importaciones, mes a mes', nivel: 'mes', pc: false, salidas: ['imp_pan_usd'], entradas: ['agpe_altas', 'agpe_kw', 'secop', 'imp_bat_usd'] },
];
const FUERZA_TXT = { fuerte: 'Relación fuerte', moderada: 'Relación moderada', 'débil': 'Relación débil', 'muy débil': 'Relación muy débil', 'sin evidencia': 'Sin evidencia de relación', 'sin datos': 'Sin datos suficientes' };
const r2 = (x) => (x == null ? '—' : fmt(x, 2));

function lado(ids, kind, prev, H) {
  const out = {};
  const x = kind === 'in' ? 24 : W - NODE_W.out - 24;
  const paso = kind === 'in' ? PASO : 130;
  const y0 = Math.max(14, (H - paso * ids.length) / 2);
  ids.forEach((k, i) => { out[k] = prev[k] || { x, y: y0 + i * paso }; });
  return out;
}

export default function Inteligencia() {
  const { paid } = useApp();
  const guardado = readLocal('rs_intel', null);
  const [vars, setVars] = useState(null);
  const [nivel, setNivel] = useState(guardado?.nivel || 'muni');
  const [pc, setPc] = useState(guardado?.pc ?? true);
  const [entradas, setEntradas] = useState(guardado?.entradas || ['tarifa', 'turismo', 'ghi', 'agpe_est', 'pop']);
  const [salidas, setSalidas] = useState(guardado?.salidas || ['colegios']);
  const [pos, setPos] = useState({});
  const [res, setRes] = useState(null);
  const [err, setErr] = useState(null);
  const [sel, setSel] = useState(null);
  const [disp, setDisp] = useState(null);
  const [q, setQ] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [hallazgos, setHallazgos] = useState(null);

  useEffect(() => { api('/intel/vars').then(setVars).catch((e) => setErr(e.message)); }, []);
  const lv = vars?.niveles?.[nivel];
  const info = useMemo(() => Object.fromEntries((lv?.vars || []).map((v) => [v.k, v])), [lv]);
  const temporal = nivel === 'mes';
  const porHab = pc && !temporal;
  const nombre = (k) => res?.nombres?.[k] || (porHab && info[k]?.conteo ? `${info[k]?.label} por 10.000 hab.` : info[k]?.label) || k;

  // Al cambiar de nivel se quitan las variables que no existen en él
  useEffect(() => {
    if (!lv) return;
    setEntradas((xs) => xs.filter((k) => info[k]));
    setSalidas((xs) => xs.filter((k) => info[k]));
    setPos({});
  }, [nivel, lv]);
  useEffect(() => { writeLocal('rs_intel', { nivel, pc, entradas, salidas }); }, [nivel, pc, entradas, salidas]);

  useEffect(() => {
    if (!lv) return;
    if (!salidas.length || !entradas.length) { setRes(null); return; }
    setErr(null);
    const t = setTimeout(() => api('/intel/analizar', { method: 'POST', body: { nivel, pc: porHab, entradas, salidas } }).then((r) => {
      setRes(r);
      const best = [...r.enlaces].filter((e) => e.r != null).sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
      setSel((s) => (s && r.enlaces.some((e) => `${e.de}>${e.a}` === s) ? s : best ? `${best.de}>${best.a}` : null));
    }).catch((e) => setErr(e.message)), 180);
    return () => clearTimeout(t);
  }, [nivel, porHab, entradas.join(), salidas.join(), lv]);

  const enlace = res?.enlaces.find((e) => `${e.de}>${e.a}` === sel);
  useEffect(() => {
    if (!enlace) { setDisp(null); return; }
    api(`/intel/dispersion?nivel=${nivel}&x=${enlace.de}&y=${enlace.a}&lag=${enlace.lag || 0}&pc=${porHab ? 1 : 0}`).then(setDisp).catch(() => setDisp(null));
  }, [sel, res]);

  const maxEnt = paid ? 12 : 3, maxSal = paid ? 4 : 1;
  const poner = (k, rol, x, y) => {
    if (!info[k]) return;
    if (rol === 'salida') {
      setEntradas((xs) => xs.filter((z) => z !== k));
      setSalidas((xs) => (xs.includes(k) ? xs : [...xs, k].slice(-maxSal)));
    } else {
      setSalidas((xs) => xs.filter((z) => z !== k));
      setEntradas((xs) => (xs.includes(k) ? xs : [...xs, k].slice(-maxEnt)));
    }
    if (x != null) setPos((p) => ({ ...p, [k]: { x: Math.max(0, Math.min(W - 240, x - 100)), y: Math.max(0, y - 20) } }));
  };
  const quitar = (k) => { setEntradas((xs) => xs.filter((z) => z !== k)); setSalidas((xs) => xs.filter((z) => z !== k)); };

  const descubrir = async (salida) => {
    setBuscando(true); setHallazgos(null);
    try {
      const r = await api('/intel/descubrir', { method: 'POST', body: { nivel, pc: porHab, salida, excluir: [...salidas] } });
      setHallazgos({ salida, top: r.top, locked: r.locked });
      const nuevos = r.top.map((t) => t.k);
      setEntradas((xs) => [...new Set([...nuevos, ...xs])].slice(0, maxEnt));
      setPos({});
    } catch (e) { setErr(e.message); } finally { setBuscando(false); }
  };
  const ejemplo = (e) => {
    if (!paid && e.nivel !== 'muni') return;
    setNivel(e.nivel); setPc(e.pc); setSalidas(e.salidas); setPos({}); setHallazgos(null);
    if (e.entradas) setEntradas(e.entradas);
    if (e.descubrir) setTimeout(() => descubrirCon(e), 0);
  };
  const descubrirCon = async (e) => {
    setBuscando(true);
    try { const r = await api('/intel/descubrir', { method: 'POST', body: { nivel: e.nivel, pc: e.pc, salida: e.salidas[0], excluir: e.salidas } }); setEntradas(r.top.map((t) => t.k).slice(0, maxEnt)); setHallazgos({ salida: e.salidas[0], top: r.top, locked: r.locked }); }
    catch (x) { setErr(x.message); } finally { setBuscando(false); }
  };

  if (err && !vars) return <div className="page"><div className="alert err">{err}</div></div>;
  if (!vars) return <Spinner />;

  const H = Math.max(H0, entradas.length * PASO + 30, salidas.length * 130 + 30);
  const pin = lado(entradas, 'in', pos, H), pout = lado(salidas, 'out', pos, H);
  const beta = (x, y) => res?.modelos?.[y]?.beta?.[x];
  const nodes = [
    ...entradas.map((k) => {
      const mejores = (res?.enlaces || []).filter((e) => e.de === k && e.r != null);
      const fuerte = mejores.sort((a, b) => Math.abs(b.r) - Math.abs(a.r))[0];
      return {
        id: k, kind: 'in', ...pin[k], title: nombre(k), sub: info[k]?.unidad, tone: fuerte && fuerte.fuerza !== 'sin evidencia' ? '' : 'off',
        body: <div className="nc-body"><div className="nc-acts"><button className="link-btn small" onClick={() => poner(k, 'salida')}>Usar como salida</button><button className="link-btn small" onClick={() => quitar(k)}>Quitar</button></div></div>,
      };
    }),
    ...salidas.map((k) => {
      const m = res?.modelos?.[k];
      return {
        id: k, kind: 'out', ...pout[k], title: nombre(k), sub: info[k]?.unidad, tone: 'out',
        body: (
          <div className="nc-body">
            {m?.r2 != null && <div className="nc-r2"><b>{fmt(m.r2 * 100)} %</b><span className="small">del orden de esta salida lo explican las entradas juntas</span></div>}
            <div className="nc-acts"><button className="link-btn small" onClick={() => descubrir(k)} disabled={buscando}>{buscando ? 'Buscando…' : 'Buscar qué la influye'}</button><button className="link-btn small" onClick={() => quitar(k)}>Quitar</button></div>
          </div>
        ),
      };
    }),
  ];
  const edges = (res?.enlaces || []).filter((e) => e.r != null && pin[e.de] && pout[e.a]).map((e) => ({
    id: `${e.de}>${e.a}`, from: e.de, to: e.a, w: Math.abs(e.r), sign: e.r < 0 ? -1 : 1, dashed: e.fuerza === 'sin evidencia', flow: Math.abs(e.r) >= 0.35,
    label: `${e.r > 0 ? '+' : '−'}${fmt(Math.abs(e.r), 2)}${e.lag ? ` · ${e.lag} m` : ''}`,
  }));
  const links = (res?.entre || []).map((l) => ({ a: l.a, b: l.b, r: l.r }));

  const libres = (lv?.vars || []).filter((v) => !entradas.includes(v.k) && !salidas.includes(v.k) && (!q || v.label.toLowerCase().includes(q.toLowerCase())));
  const grupos = libres.reduce((a, v) => { (a[v.grupo] ||= []).push(v); return a; }, {});
  const orden = [...(res?.enlaces || [])].filter((e) => e.r != null).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  return (
    <div className="page intel-page">
      <div className="page-head">
        <div>
          <h1>Inteligencia profunda</h1>
          <p className="muted small" style={{ margin: '4px 0 0', maxWidth: '82ch' }}>Pon a la derecha lo que quieres entender (las salidas) y a la izquierda lo que podría estar influyendo (las entradas). Cada curva muestra qué tan juntas se mueven: más gruesa es más fuerte, naranja cuando suben juntas y azul cuando una sube y la otra baja.</p>
        </div>
      </div>

      <div className="intel-bar">
        <div className="seg" role="group" aria-label="Qué se compara">
          {Object.entries(vars.niveles).map(([k, l]) => <button key={k} className={nivel === k ? 'on' : ''} disabled={!paid && k !== 'muni'} onClick={() => { setNivel(k); setHallazgos(null); }}>{l.label}<span className="muted"> · {fmt(l.n)}</span></button>)}
        </div>
        {!temporal && <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={pc} onChange={(e) => setPc(e.target.checked)} />Contar por cada 10.000 habitantes</label>}
        {temporal && <span className="small muted">{lv.desde} a {lv.hasta}. Se comparan los cambios de un mes a otro y se prueba si una entrada se adelanta hasta 3 meses.</span>}
      </div>
      <div className="intel-ej" role="group" aria-label="Ejemplos">
        {EJEMPLOS.map((e) => <button key={e.t} className="chip" disabled={!paid && e.nivel !== 'muni'} onClick={() => ejemplo(e)}>{e.t}</button>)}
      </div>
      {!paid && <div className="alert small">En la prueba puedes comparar municipios con hasta 3 entradas y 1 salida. Departamentos, meses y redes más grandes están en el plan completo.</div>}
      {err && <div className="alert err small">{err}</div>}

      <div className="intel-main">
        <aside className="pesos-lib intel-lib" aria-label="Variables">
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar variable" aria-label="Buscar variable" />
          <span className="small muted">Arrastra al lado izquierdo (entrada) o derecho (salida) del lienzo, o usa los botones.</span>
          {Object.entries(grupos).map(([g, xs]) => (
            <div key={g} className="pesos-grp">
              <b className="small">{g}</b>
              {xs.map((v) => (
                <div key={v.k} className="intel-var" draggable onDragStart={(e) => { e.dataTransfer.setData('text/nc-item', v.k); e.dataTransfer.effectAllowed = 'copy'; }}>
                  <span title={v.nota || undefined}>{porHab && v.conteo ? `${v.label} por 10.000 hab.` : v.label}</span>
                  <span className="intel-var-b">
                    <button className="btn xs" onClick={() => poner(v.k, 'entrada')} aria-label={`${v.label} como entrada`}>Entrada</button>
                    <button className="btn xs" onClick={() => poner(v.k, 'salida')} aria-label={`${v.label} como salida`}>Salida</button>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </aside>

        <div className="intel-canvas">
          <div className="intel-cols small muted" aria-hidden="true"><span>Entradas</span><span>Salidas</span></div>
          <NodeCanvas nodes={nodes} edges={edges} links={links} width={W} height={H} selected={sel}
            onMove={(id, x, y) => setPos((p) => ({ ...p, [id]: { x, y } }))}
            onEdgeClick={(e) => setSel(e.id)}
            onDropItem={(k, x, y) => poner(k, x > W / 2 ? 'salida' : 'entrada', x, y)}
            ariaLabel="Red de interdependencias entre entradas y salidas"
            empty="Arrastra variables aquí: a la izquierda las entradas y a la derecha lo que quieres entender." />
          {links.length > 0 && <p className="small muted intel-nota">Las curvas grises a la izquierda unen entradas que se parecen mucho entre sí: miden casi lo mismo.</p>}
        </div>
      </div>

      {hallazgos && (
        <section className="card intel-hall" aria-live="polite">
          <h2 className="h3">Lo que más se relaciona con {nombre(hallazgos.salida).toLowerCase()}</h2>
          {hallazgos.top.length ? <ol>{hallazgos.top.map((t) => <li key={t.k}><span>{t.label}</span><b className={t.r < 0 ? 'neg' : 'pos'}>{t.r > 0 ? '+' : '−'}{fmt(Math.abs(t.r), 2)}</b><span className="muted small">{FUERZA_TXT[t.fuerza]}{t.lag ? `, ${t.lag} mes${t.lag > 1 ? 'es' : ''} antes` : ''}</span></li>)}</ol> : <p className="small muted">No apareció ninguna relación clara.</p>}
          {hallazgos.locked && <p className="small muted">Con el plan completo ves las ocho más fuertes.</p>}
        </section>
      )}

      {enlace && (
        <section className="card intel-det" aria-labelledby="intel-det-t">
          <div>
            <h2 id="intel-det-t" className="h3">{nombre(enlace.de)} → {nombre(enlace.a)}</h2>
            <p className="intel-big"><b className={enlace.r < 0 ? 'neg' : 'pos'}>{enlace.r > 0 ? '+' : '−'}{fmt(Math.abs(enlace.r), 2)}</b><span>{FUERZA_TXT[enlace.fuerza]}</span></p>
            <p className="small">{explicar(enlace, nombre, nivel, temporal)}</p>
            <dl className="kv small">
              <dt>Casos comparados</dt><dd>{fmt(enlace.n)} {nivel === 'muni' ? 'municipios' : nivel === 'dpto' ? 'departamentos' : 'meses'}</dd>
              <dt>Probabilidad de que sea azar</dt><dd>{enlace.p == null ? '—' : enlace.p < 0.001 ? 'menos de 0,1 %' : `${fmt(enlace.p * 100, 1)} %`}</dd>
              {beta(enlace.de, enlace.a) != null && entradas.length > 1 && <><dt>Peso junto a las demás entradas</dt><dd>{r2(beta(enlace.de, enlace.a))}</dd></>}
              {temporal && <><dt>Adelanto</dt><dd>{enlace.lag ? `${enlace.lag} mes${enlace.lag > 1 ? 'es' : ''}` : 'Mismo mes'}</dd></>}
            </dl>
          </div>
          <Dispersion d={disp} nx={nombre(enlace.de)} ny={nombre(enlace.a)} temporal={temporal} />
        </section>
      )}

      {orden.length > 0 && (
        <section className="stack">
          <h2 className="h3" style={{ margin: 0 }}>Todas las relaciones, de la más fuerte a la más débil</h2>
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Entrada</th><th>Salida</th><th className="num">Correlación</th><th>Fuerza</th>{entradas.length > 1 && <th className="num">Peso en el modelo</th>}<th className="num">Casos</th></tr></thead>
            <tbody>{orden.map((e) => (
              <tr key={e.de + e.a} className={sel === `${e.de}>${e.a}` ? 'on' : ''}>
                <td><button className="link-btn" onClick={() => setSel(`${e.de}>${e.a}`)}>{nombre(e.de)}</button></td><td>{nombre(e.a)}</td>
                <td className="num mono">{e.r > 0 ? '+' : '−'}{fmt(Math.abs(e.r), 2)}{e.lag ? ` (${e.lag} m)` : ''}</td><td className="small">{FUERZA_TXT[e.fuerza]}</td>
                {entradas.length > 1 && <td className="num mono">{r2(beta(e.de, e.a))}</td>}<td className="num">{fmt(e.n)}</td>
              </tr>))}</tbody>
          </table></div>
          <p className="small muted" style={{ margin: 0 }}>Correlación por rangos (Spearman): va de −1 a +1 y resiste valores extremos. El peso en el modelo reparte la influencia cuando las entradas se miran juntas. Una relación fuerte no prueba que una cosa cause la otra.</p>
        </section>
      )}
    </div>
  );
}

function explicar(e, nombre, nivel, temporal) {
  const x = nombre(e.de).toLowerCase(), y = nombre(e.a).toLowerCase().replace(/\.$/, '');
  const donde = nivel === 'muni' ? 'los municipios' : nivel === 'dpto' ? 'los departamentos' : 'los meses';
  if (e.fuerza === 'sin evidencia' || e.fuerza === 'sin datos') return `Con estos datos no se ve una relación clara entre ${x} y ${y}.`;
  if (temporal) return `Cuando ${x} sube de un mes a otro, ${y} tiende a ${e.r > 0 ? 'subir' : 'bajar'}${e.lag ? ` ${e.lag} mes${e.lag > 1 ? 'es' : ''} después` : ' ese mismo mes'}.`;
  return `En ${donde} con más ${x} tiende a haber ${e.r > 0 ? 'más' : 'menos'} ${y}.`;
}

// Dispersión de un par, con escala logarítmica cuando los valores varían mucho
function Dispersion({ d, nx, ny, temporal }) {
  const [hov, setHov] = useState(null);
  if (!d) return <div className="intel-disp"><Spinner /></div>;
  const pts = d.pts;
  if (!pts.length) return <div className="intel-disp small muted">Sin datos para graficar.</div>;
  const Wd = 440, Hd = 300, m = { l: 48, r: 12, t: 12, b: 36 };
  const esc = (vals) => {
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const log = mn >= 0 && mx > 50 && mx / Math.max(1e-9, [...vals].sort((a, b) => a - b)[Math.floor(vals.length / 2)] || 1) > 20;
    const f = log ? (v) => Math.log10(1 + v) : (v) => v;
    const a = f(mn), b = f(mx);
    return { f: (v) => (b === a ? 0.5 : (f(v) - a) / (b - a)), log, mn, mx };
  };
  const ex = esc(pts.map((p) => p.x)), ey = esc(pts.map((p) => p.y));
  const X = (v) => m.l + ex.f(v) * (Wd - m.l - m.r), Y = (v) => Hd - m.b - ey.f(v) * (Hd - m.t - m.b);
  const corto = (t) => (t.length > 34 ? t.slice(0, 33) + '…' : t);
  return (
    <figure className="intel-disp">
      <svg viewBox={`0 0 ${Wd} ${Hd}`} width="100%" role="img" aria-label={`Dispersión de ${nx} contra ${ny}`}>
        <line x1={m.l} x2={Wd - m.r} y1={Hd - m.b} y2={Hd - m.b} className="ax" />
        <line x1={m.l} x2={m.l} y1={m.t} y2={Hd - m.b} className="ax" />
        {pts.map((p, i) => <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={hov === i ? 5 : 3} className={hov === i ? 'pt on' : 'pt'} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} />)}
        <text x={m.l} y={Hd - 8} className="lb">{corto(nx)}{ex.log ? ' (escala log)' : ''}</text>
        <text x={12} y={m.t + 30} className="lb" transform={`rotate(-90 12 ${m.t + 30})`} textAnchor="end">{corto(ny)}</text>
        <text x={Wd - m.r} y={Hd - 8} className="lb" textAnchor="end">{fmt(ex.mx)}</text>
        <text x={m.l - 4} y={m.t + 8} className="lb" textAnchor="end">{fmt(ey.mx)}</text>
      </svg>
      <figcaption className="small muted">{hov != null ? <><b>{pts[hov].id}</b>: {fmt(pts[hov].x, 1)} y {fmt(pts[hov].y, 1)}</> : `${fmt(d.n)} ${temporal ? 'meses' : 'puntos'}${d.n > pts.length ? `, se muestran ${fmt(pts.length)}` : ''}. Pasa el cursor por un punto para ver cuál es.`}</figcaption>
    </figure>
  );
}
