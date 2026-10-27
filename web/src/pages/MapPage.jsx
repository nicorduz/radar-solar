import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ColumnLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { api, qs, fmt, METRICS } from '../api.js';
import { useApp } from '../App.jsx';
import { WeightsControl, ScoreBadge, ContactCTA } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
// Rampa azul Talera → naranja Talera (bajo → alto)
const RAMP = [[52, 72, 159], [52, 120, 246], [190, 205, 235], [255, 160, 70], [255, 122, 0]];
function colorAt(t) {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i;
  return RAMP[i].map((c, k) => Math.round(c + (RAMP[i + 1][k] - c) * f));
}
const kvOf = (s) => Math.max(0, ...(String(s || '').match(/\d+(\.\d+)?/g) || ['0']).map(Number));
// Colores de la red por tensión (líneas) y por tipo de elemento
const KV_COLOR = (kv) => (kv >= 500 ? [226, 103, 91] : kv >= 220 ? [242, 195, 138] : [120, 190, 220]);
const LAYERS = {
  lineas: { label: 'Líneas de transmisión (STN/STR)', swatch: 'linear-gradient(90deg,#78BEDC,#F2C38A,#E2675B)', paid: false },
  subs: { label: 'Subestaciones', dot: '#B8C5C4', paid: false },
  solar: { label: 'Plantas solares (XM)', dot: '#F7D154', paid: true },
  mt: { label: 'Red de media tensión estimada', swatch: '#4FB286', paid: true },
  upme: { label: 'Proyectos registrados en la UPME', dot: '#A8C5FF', paid: true },
  zni: { label: 'Zonas no interconectadas (IPSE)', dot: '#C77DDB', paid: true },
};
const DEFAULT_LAYERS = { instalador: ['lineas'], proveedor: [], desarrollador: ['lineas', 'subs', 'solar', 'upme'] };

export default function MapPage() {
  const { paid, profile, prof, scoreParams, go } = useApp();
  const el = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const [data, setData] = useState(null);
  const [metric, setMetric] = useState('score');
  const [collapsed, setCollapsed] = useState(true);
  const [lockMsg, setLockMsg] = useState(null);
  const [red, setRed] = useState(null);
  const [mt, setMt] = useState(null);
  const [on, setOn] = useState(() => new Set(DEFAULT_LAYERS[profile] || []));
  const [showLayers, setShowLayers] = useState(false);

  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current, style: STYLE, center: window.innerWidth < 860 ? [-74.2, 4.6] : [-73.9, 5.3], zoom: window.innerWidth < 860 ? 4.6 : 5.6,
      pitch: 52, bearing: -12, maxPitch: 70, attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('load', () => {
      for (const l of map.getStyle().layers) {
        if (l.type === 'symbol' && map.getLayoutProperty(l.id, 'text-field')) {
          try { map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:es'], ['get', 'name_es'], ['get', 'name']]); } catch { /* capa sin nombre */ }
        }
      }
    });
    if (window.innerWidth >= 860) map.setPadding({ right: 380, top: 40, left: 0, bottom: 0 });
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay);
    mapRef.current = map; overlayRef.current = overlay;
    return () => map.remove();
  }, []);

  // Al cambiar de perfil: métrica y capas recomendadas
  useEffect(() => { setMetric('score'); setOn(new Set(DEFAULT_LAYERS[profile] || [])); }, [profile]);

  useEffect(() => {
    setData(null);
    api('/map' + qs(scoreParams)).then(setData).catch(() => setData({ items: [] }));
  }, [JSON.stringify(scoreParams)]);

  useEffect(() => { api('/red').then(setRed).catch(() => setRed({ lineas: [], subs: [], plantas: [], zni: [] })); }, []);
  useEffect(() => { if (on.has('mt') && paid && !mt) api('/red/mt').then(setMt).catch(() => setMt([])); }, [on, paid, mt]);

  const toggle = (k) => {
    if (LAYERS[k].paid && !paid) { setLockMsg({ layer: LAYERS[k].label }); return; }
    const n = new Set(on); n.has(k) ? n.delete(k) : n.add(k); setOn(n);
  };

  const metricKeys = prof.metrics.filter((k) => METRICS[k]);
  const M = data?.mode === 'dpto' ? METRICS.score : METRICS[metric] || METRICS.score;

  const scaled = useMemo(() => {
    if (!data) return [];
    const tr = (v) => (M.log ? Math.log1p(Math.max(0, v)) : v);
    const vals = data.items.map((d) => M.get(d)).filter((v) => v != null).map(tr);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    return data.items.map((d) => {
      const v = M.get(d);
      let t = v == null ? 0 : (tr(v) - lo) / (hi - lo || 1);
      if (M.invert && v != null) t = 1 - t;
      return { ...d, t };
    });
  }, [data, metric]);

  useEffect(() => {
    if (!overlayRef.current || !data) return;
    const dpto = data.mode === 'dpto';
    const trig = [metric, JSON.stringify(scoreParams)];
    const layers = [];
    if (on.has('mt') && mt?.length) {
      layers.push(new PathLayer({
        id: 'mt', data: mt, getPath: (d) => d.c, getColor: (d) => (d.s === 'o' ? [79, 178, 134, 170] : [79, 178, 134, 90]),
        widthUnits: 'pixels', getWidth: 1, pickable: false,
      }));
    }
    if (on.has('lineas') && red?.lineas?.length) {
      layers.push(new PathLayer({
        id: 'lineas', data: red.lineas, getPath: (d) => d.c, getColor: (d) => [...KV_COLOR(kvOf(d.kv)), 200],
        widthUnits: 'pixels', getWidth: (d) => (kvOf(d.kv) >= 500 ? 2.6 : kvOf(d.kv) >= 220 ? 2 : 1.3), pickable: true,
      }));
    }
    layers.push(new ColumnLayer({
      id: 'cols', data: scaled, diskResolution: dpto ? 24 : 12, radius: dpto ? 16000 : 4200, extruded: true, pickable: true,
      elevationScale: dpto ? 1400 : 600, getPosition: (d) => [d.lon, d.lat],
      getElevation: (d) => (dpto ? 15 + Math.pow(d.t, 1.3) * 120 : 3 + Math.pow(d.t, 2.2) * 220),
      getFillColor: (d) => [...colorAt(d.t), on.size ? 200 : 235], material: { ambient: 0.5, diffuse: 0.6, shininess: 24 },
      updateTriggers: { getElevation: trig, getFillColor: [...trig, on.size] },
      onClick: ({ object }) => { if (!object) return; if (dpto) setLockMsg(object); else go('m', object.code); },
    }));
    if (on.has('subs') && red?.subs?.length) {
      layers.push(new ScatterplotLayer({
        id: 'subs', data: red.subs, getPosition: (d) => [d.lon, d.lat], radiusUnits: 'pixels', getRadius: (d) => (d.kvmax >= 220 ? 4.5 : 3),
        getFillColor: [230, 236, 236, 230], getLineColor: [14, 21, 23], stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1, pickable: true,
      }));
    }
    if (on.has('solar') && red?.plantas?.length) {
      layers.push(new ScatterplotLayer({
        id: 'solar', data: red.plantas.filter((p) => p.tipo === 'solar'), getPosition: (d) => [d.lon, d.lat], radiusUnits: 'pixels',
        getRadius: (d) => 3 + Math.sqrt(d.mw || 1) * 0.9, getFillColor: (d) => (d.estado === 'Operación' ? [247, 209, 84, 220] : [247, 209, 84, 110]),
        getLineColor: [60, 40, 0], stroked: true, lineWidthUnits: 'pixels', getLineWidth: 1, pickable: true,
      }));
    }
    if (on.has('upme') && red?.upme?.length) {
      layers.push(new ScatterplotLayer({
        id: 'upme', data: red.upme, getPosition: (d) => [d.lon + 0.02, d.lat + 0.02], radiusUnits: 'pixels',
        getRadius: (d) => 4 + Math.sqrt(d.mw || 1) * 0.8, filled: false, stroked: true, lineWidthUnits: 'pixels', getLineWidth: 2.2,
        getLineColor: (d) => (/SOLAR/i.test(d.tipo) ? [168, 197, 255, 255] : [168, 197, 255, 150]), pickable: true,
      }));
    }
    if (on.has('zni') && red?.zni?.length) {
      layers.push(new ScatterplotLayer({
        id: 'zni', data: red.zni, getPosition: (d) => [d.lon, d.lat], radiusUnits: 'pixels', getRadius: (d) => (d.horas < 12 ? 6 : 4),
        getFillColor: (d) => (d.horas < 12 ? [199, 125, 219, 235] : [199, 125, 219, 140]), pickable: true,
      }));
    }
    overlayRef.current.setProps({
      layers,
      getTooltip: ({ object: d, layer }) => {
        if (!d || !layer) return null;
        let html;
        if (layer.id === 'lineas') html = `<b>${d.n}</b><br/>${d.kv}<br/><span style="color:#B3BCDA">${d.op}</span>`;
        else if (layer.id === 'subs') html = `<b>Subestación ${d.n}</b><br/>${d.kv}${d.desde ? ' · desde ' + d.desde : ''}<br/><span style="color:#B3BCDA">${d.op}</span>`;
        else if (layer.id === 'solar') html = `<b>${d.n}</b><br/>${fmt(d.mw, 1)} MW · ${d.estado}${d.kv ? ' · ' + d.kv + ' kV' : ''}<br/><span style="color:#B3BCDA">${d.op || ''}<br/>${d.mun || ''}, ${d.dpto || ''}</span>`;
        else if (layer.id === 'upme') html = `<b>${d.n}</b><br/>${fmt(d.mw, 1)} MW · ${d.tipo} · ${d.fase}<br/>${d.mun}, ${d.dpto}<br/><span style="color:#B7C0D8">Inscrito ${d.inscrito || 's/d'} · operación prevista ${d.operacion?.slice(0, 7) || 's/d'}<br/>UPME, registro de proyectos (ubicación = municipio)</span>`;
        else if (layer.id === 'zni') html = `<b>${d.n}</b> (no interconectada)<br/>${d.mpio}, ${d.dpto}<br/>${fmt(d.horas, 1)} horas de servicio al día · ${fmt(d.kwh_mes)} kWh/mes<br/><span style="color:#B3BCDA">IPSE, ${d.ultimo}</span>`;
        else if (data.mode === 'dpto') html = `<b>${d.dpto}</b><br/>Puntaje departamental ${d.score}<br/><span style="color:#B3BCDA">${d.municipios} municipios · detalle en plan completo</span>`;
        else html = `<b>${d.name}</b> · ${d.dpto}<br/>#${d.rank} · puntaje ${d.score}<br/>${metricKeys.filter((k) => k !== 'score').slice(0, 4).map((k) => `${METRICS[k].short}: ${METRICS[k].f(METRICS[k].get(d))}`).join('<br/>')}`;
        return { html: `<div class="maptip">${html}</div>`, style: { background: 'none', padding: 0 } };
      },
    });
  }, [scaled, data, metric, go, on, red, mt]);

  const top = useMemo(() => (data?.mode === 'municipio' ? data.items.slice(0, 25) : []), [data]);
  const fly = (d) => mapRef.current?.flyTo({ center: [d.lon, d.lat], zoom: 9, pitch: 58, speed: 1.4 });
  const sub = (d) => metricKeys.filter((k) => k !== 'score').slice(0, 2).map((k) => `${METRICS[k].short} ${METRICS[k].f(METRICS[k].get(d))}`).join(' · ');

  return (
    <div className="mapwrap">
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      <div className="map-top">
        <div className="glass" style={{ padding: 8 }}><WeightsControl compact /></div>
        <div style={{ position: 'relative' }}>
          <button className={`btn sm glass ${showLayers ? 'on' : ''}`} onClick={() => setShowLayers(!showLayers)} aria-expanded={showLayers}><Icon name="layers" size={16} />Capas{on.size ? ` (${on.size})` : ''}</button>
        {showLayers && (
          <div className="glass layers" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, width: 290, zIndex: 6 }}>
            {Object.entries(LAYERS).map(([k, l]) => (
              <label key={k} className={l.paid && !paid ? 'dis' : ''}>
                <input type="checkbox" checked={on.has(k)} onChange={() => toggle(k)} />
                {l.dot ? <span className="dot" style={{ background: l.dot }} /> : <span className="sw" style={{ background: l.swatch }} />}
                <span>{l.label}{l.paid && !paid ? ' 🔒' : ''}</span>
              </label>
            ))}
            {on.has('mt') && <span className="small muted">Media tensión: modelo gridfinder (2020) con datos de OpenStreetMap. Es una estimación, no la red oficial del operador.</span>}
            {on.has('mt') && paid && !mt && <span className="small muted">Cargando red estimada…</span>}
          </div>
        )}
        </div>
        {paid && (
          <div className="glass seg" role="group" aria-label="Métrica del mapa">
            {metricKeys.map((k) => <button key={k} className={metric === k ? 'on' : ''} onClick={() => setMetric(k)}>{METRICS[k].short}</button>)}
          </div>
        )}
      </div>

      <div className="legend glass">
        <span>{M.label}: {M.invert ? 'lejos → cerca' : 'bajo → alto'}</span>
        <div className="ramp" />
        <span className="muted">Columnas = {data?.mode === 'dpto' ? 'puntaje por departamento' : M.short.toLowerCase()} · {prof.short}</span>
      </div>

      <div className={`map-panel glass ${collapsed ? 'collapsed' : ''}`}>
        <button className="row" onClick={() => setCollapsed(!collapsed)} style={{ padding: '14px 16px', border: 0, background: 'none', justifyContent: 'space-between', cursor: 'pointer', width: '100%' }} aria-expanded={!collapsed}>
          <h2>{paid ? `Mejores zonas · ${prof.short}` : 'Vista previa'}</h2>
          <span className="small muted">{data ? (paid ? `${data.items.length} municipios` : 'plan de prueba') : 'cargando…'}</span>
        </button>
        <div className="list">
          {data?.mode === 'municipio' && top.map((d) => (
            <button key={d.code} className="map-item" onClick={() => { fly(d); }} onDoubleClick={() => go('m', d.code)}>
              <span className="mono muted">{d.rank}</span>
              <span><b>{d.name}</b><br /><span className="small muted">{d.dpto} · {sub(d)}</span></span>
              <span className="row" style={{ gap: 6 }}><ScoreBadge score={d.score} tier={d.tier} /><a className="small" href={`#/m/${d.code}`} onClick={(e) => e.stopPropagation()}>Ver</a></span>
            </button>
          ))}
          {data?.mode === 'dpto' && (
            <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card" style={{ background: 'var(--panel-2)' }}>
                <h3>Municipio #1 del país · {prof.short}</h3>
                <div className="row" style={{ justifyContent: 'space-between', marginTop: 6 }}>
                  <span><b style={{ fontSize: 17 }}>{data.top.name}</b><br /><span className="small muted">{data.top.dpto} · {data.top.or}</span></span>
                  <ScoreBadge score={data.top.score} tier={data.top.tier} />
                </div>
                <button className="btn sm" style={{ marginTop: 10 }} onClick={() => go('m', data.top.code)}>Ver ficha completa</button>
              </div>
              <div className="locked" style={{ minHeight: 230 }}>
                <div className="blur">{[...Array(6)].map((_, i) => <div key={i} className="map-item"><span>{i + 2}</span><span>Municipio oculto<br />Departamento</span><span className="score t-tibio">7{i}</span></div>)}</div>
                <div className="lock-cta"><ContactCTA text="El mapa por municipio, el ranking completo, las capas de red y los clientes potenciales están en el plan completo." /></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {lockMsg && (
        <div className="modal-bg" onClick={() => setLockMsg(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <ContactCTA text={lockMsg.layer ? `La capa "${lockMsg.layer}" está en el plan completo.` : `${lockMsg.dpto} tiene ${lockMsg.municipios} municipios evaluados. Desbloquea el detalle por municipio, tarifas y proyectos.`} />
          </div>
        </div>
      )}
    </div>
  );
}
