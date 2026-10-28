import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ColumnLayer, IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import { api, qs, fmt, METRICS } from '../api.js';
import { useApp } from '../App.jsx';
import { WeightsControl, ScoreBadge, ContactCTA } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { ringOf, measureOf, circleRing, rectRing, distance, pathLength, fmtDist, centroid, inside, parseCoords, normTxt, geocode } from '../components/mapTools.js';
import { METRIC_ICON, ICON_SOLAR, ICON_SOLAR_PRUEBAS, ICON_UPME, ICON_SUB, ICON_ZNI, COLOMBIA, COLOMBIA_MASK } from '../components/mapIcons.js';

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
// Rampa azul Talera → naranja Talera (bajo → alto)
const RAMP = [[52, 72, 159], [52, 120, 246], [190, 205, 235], [255, 160, 70], [255, 122, 0]];
function colorAt(t) {
  const x = Math.max(0, Math.min(1, t)) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x)), f = x - i;
  return RAMP[i].map((c, k) => Math.round(c + (RAMP[i + 1][k] - c) * f));
}
const kvOf = (s) => Math.max(0, ...(String(s || '').match(/\d+(\.\d+)?/g) || ['0']).map(Number));
const KV_COLOR = (kv) => (kv >= 500 ? [226, 103, 91] : kv >= 220 ? [242, 195, 138] : [120, 190, 220]);
// Altura en metros de la columna (3D) según el valor normalizado t (0 a 1)
const elevOf = (t) => 2500 + Math.pow(t, 1.4) * 70000;
// Los íconos se dibujan siempre encima (sin recortarse contra el plano del mapa en 3D)
const ON_TOP = { depthCompare: 'always', depthWriteEnabled: false };

const LAYERS = {
  solar: { label: 'Plantas solares (XM)', img: ICON_SOLAR, paid: true },
  upme: { label: 'Proyectos registrados en la UPME', img: ICON_UPME, paid: true },
  subs: { label: 'Subestaciones', img: ICON_SUB, paid: false },
  lineas: { label: 'Líneas de transmisión', swatch: 'linear-gradient(90deg,#78BEDC,#F2C38A,#E2675B)', paid: false },
  mt: { label: 'Red de media tensión estimada', swatch: '#4FB286', paid: true },
  zni: { label: 'Zonas no interconectadas (IPSE)', img: ICON_ZNI, paid: true },
};
const DEFAULT_LAYERS = { instalador: [], proveedor: [], desarrollador: ['lineas', 'solar', 'upme'] };
// Herramientas de dibujo del mapa
const TOOLS = [
  ['circle', 'circle', 'Círculo', 'Clic en el centro y otro clic en el borde.'],
  ['polygon', 'polygon', 'Polígono', 'Clic en cada vértice. Doble clic o "Terminar" para cerrar.'],
  ['rect', 'rect', 'Rectángulo', 'Clic en una esquina y otro clic en la esquina opuesta.'],
  ['point', 'pin', 'Punto', 'Clic donde quieras el punto.'],
  ['text', 'text', 'Texto', 'Escribe el texto y haz clic en el mapa.'],
  ['measure', 'ruler', 'Medir', 'Clic en cada punto del recorrido. Doble clic o "Terminar" para finalizar.'],
];
const loadShapes = () => { try { return JSON.parse(localStorage.getItem('rs_shapes') || '[]'); } catch { return []; } };
const saveShapes = (s) => { try { localStorage.setItem('rs_shapes', JSON.stringify(s)); } catch { /* sin almacenamiento */ } };
const uid = () => Math.random().toString(36).slice(2, 9);
const TXT = { fontFamily: 'Inter, system-ui, sans-serif', characterSet: 'auto', sizeUnits: 'pixels', background: true, getBackgroundColor: [16, 14, 42, 225], backgroundPadding: [6, 3], getColor: [244, 246, 251, 255], parameters: { depthCompare: 'always', depthWriteEnabled: false } };

const icon = (url) => ({ url, width: 64, height: 64, anchorY: 32, mask: false });
const maskIcon = (url) => ({ url, width: 64, height: 64, anchorY: 32, mask: true });

export default function MapPage() {
  const { paid, profile, prof, scoreParams, go } = useApp();
  const el = useRef(null);
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const [data, setData] = useState(null);
  const [show, setShow] = useState('score'); // 'nada' | 'score' | métrica
  const [is3d, setIs3d] = useState(true);
  const [menu, setMenu] = useState(null); // 'show' | 'layers' | null
  const [collapsed, setCollapsed] = useState(true);
  const [lockMsg, setLockMsg] = useState(null);
  const [red, setRed] = useState(null);
  const [mt, setMt] = useState(null);
  const [on, setOn] = useState(() => new Set(DEFAULT_LAYERS[profile] || []));
  // Dibujo y medición
  const [tool, setTool] = useState(null);
  const [draft, setDraft] = useState(null);
  const [cursor, setCursor] = useState(null);
  const [shapes, setShapes] = useState(loadShapes);
  const [sel, setSel] = useState(null);
  const [textVal, setTextVal] = useState('');
  // Búsqueda y lista acotada a la vista
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [pin, setPin] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [onlyVisible, setOnlyVisible] = useState(true);
  const st = useRef({});
  st.current = { tool, draft, textVal };
  const handler = useRef(() => {});

  useEffect(() => {
    const map = new maplibregl.Map({
      container: el.current, style: STYLE, center: window.innerWidth < 860 ? [-74.2, 4.6] : [-73.9, 5.3], zoom: window.innerWidth < 860 ? 4.6 : 5.6,
      pitch: 45, bearing: -10, maxPitch: 70, attributionControl: { compact: true }, maxBounds: [[-92, -14], [-52, 18]],
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
    const b = () => { const x = map.getBounds(); setBounds([x.getWest(), x.getSouth(), x.getEast(), x.getNorth()]); };
    map.on('load', b); map.on('moveend', b);
    let raf = 0;
    map.on('click', (e) => handler.current('click', [e.lngLat.lng, e.lngLat.lat]));
    map.on('dblclick', (e) => handler.current('dblclick', [e.lngLat.lng, e.lngLat.lat], e));
    map.on('mousemove', (e) => { if (!st.current.draft) return; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setCursor([e.lngLat.lng, e.lngLat.lat])); });
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay);
    mapRef.current = map; overlayRef.current = overlay;
    return () => map.remove();
  }, []);

  // Al cambiar de perfil: puntaje y capas recomendadas
  useEffect(() => { setShow('score'); setOn(new Set(DEFAULT_LAYERS[profile] || [])); }, [profile]);

  useEffect(() => {
    setData(null);
    api('/map' + qs(scoreParams)).then(setData).catch(() => setData({ items: [] }));
  }, [JSON.stringify(scoreParams)]);

  useEffect(() => { api('/red').then(setRed).catch(() => setRed({ lineas: [], subs: [], plantas: [], zni: [], upme: [] })); }, []);
  useEffect(() => { if (on.has('mt') && paid && !mt) api('/red/mt').then(setMt).catch(() => setMt([])); }, [on, paid, mt]);

  // ---- Dibujo: clics sobre el mapa ----
  const addShape = (shape) => { const n = [...shapes, { id: uid(), ...shape }]; setShapes(n); saveShapes(n); setSel(n[n.length - 1].id); };
  const finish = () => {
    if (!draft) { setTool(null); return; }
    const pts = draft.pts.filter((p, i, a) => i === 0 || distance(p, a[i - 1]) > 1);
    if (draft.type === 'polygon' && pts.length >= 3) addShape({ type: 'polygon', pts });
    if (draft.type === 'measure' && pts.length >= 2) addShape({ type: 'measure', pts });
    setDraft(null); setCursor(null); setTool(null);
  };
  const cancel = () => { setDraft(null); setCursor(null); setTool(null); };
  handler.current = (ev, p, e) => {
    const { tool: t, draft: d } = st.current;
    if (!t) return;
    if (ev === 'dblclick') { e?.preventDefault?.(); if (t === 'polygon' || t === 'measure') finish(); return; }
    if (t === 'point') { addShape({ type: 'point', pts: [p], text: st.current.textVal.trim() }); setTool(null); return; }
    if (t === 'text') { if (!st.current.textVal.trim()) return; addShape({ type: 'text', pts: [p], text: st.current.textVal.trim() }); setTool(null); return; }
    if (t === 'circle') { if (!d) { setDraft({ type: 'circle', center: p }); setCursor(p); } else { addShape({ type: 'circle', center: d.center, r: Math.max(10, distance(d.center, p)) }); setDraft(null); setTool(null); } return; }
    if (t === 'rect') { if (!d) { setDraft({ type: 'rect', pts: [p] }); setCursor(p); } else { addShape({ type: 'rect', pts: [d.pts[0], p] }); setDraft(null); setTool(null); } return; }
    if (t === 'polygon' || t === 'measure') { setDraft(d ? { ...d, pts: [...d.pts, p] } : { type: t, pts: [p] }); setCursor(p); }
  };
  const pickTool = (t) => {
    if (tool === t) { cancel(); return; }
    setDraft(null); setCursor(null); setTool(t); setSel(null);
  };
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (tool) { map.doubleClickZoom.disable(); map.getCanvas().style.cursor = 'crosshair'; }
    else { map.doubleClickZoom.enable(); map.getCanvas().style.cursor = ''; }
  }, [tool]);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') cancel(); if (e.key === 'Enter' && st.current.draft) finish(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  const removeShape = (id) => { const n = shapes.filter((x) => x.id !== id); setShapes(n); saveShapes(n); setSel(null); };
  const clearShapes = () => { setShapes([]); saveShapes([]); setSel(null); cancel(); };

  // Vista previa de lo que se está dibujando
  const preview = useMemo(() => {
    if (!draft || !cursor) return null;
    if (draft.type === 'circle') { const r = distance(draft.center, cursor); return { ring: circleRing(draft.center, r), label: `Radio ${fmtDist(r)}`, at: cursor }; }
    if (draft.type === 'rect') return { ring: rectRing([draft.pts[0], cursor]), label: measureOf({ type: 'rect', pts: [draft.pts[0], cursor] }), at: cursor };
    if (draft.type === 'polygon') { const pts = [...draft.pts, cursor]; return pts.length >= 3 ? { ring: [...pts, pts[0]], label: measureOf({ type: 'polygon', pts }), at: cursor } : { path: pts, label: '', at: cursor }; }
    if (draft.type === 'measure') { const pts = [...draft.pts, cursor]; return { path: pts, label: fmtDist(pathLength(pts)), at: cursor }; }
    return null;
  }, [draft, cursor]);

  // ---- Búsqueda: municipio, dirección o coordenadas ----
  const flyToPos = (pos, zoom, label) => { mapRef.current?.flyTo({ center: pos, zoom, pitch: is3d ? 45 : 0, speed: 1.6 }); setPin({ pos, label }); setResults(null); };
  const localMatches = (txt) => {
    if (!data || data.mode !== 'municipio' || txt.length < 2) return [];
    const n = normTxt(txt);
    return data.items.filter((d) => normTxt(d.name).includes(n)).sort((a, b) => normTxt(a.name).indexOf(n) - normTxt(b.name).indexOf(n)).slice(0, 5)
      .map((d) => ({ label: d.name, sub: `${d.dpto} · municipio`, pos: [d.lon, d.lat], zoom: 11, code: d.code }));
  };
  const runSearch = async (e) => {
    e?.preventDefault();
    const txt = q.trim(); if (!txt) return;
    const c = parseCoords(txt);
    if (c) { flyToPos(c, 15, `${c[1].toFixed(5)}, ${c[0].toFixed(5)}`); return; }
    const local = localMatches(txt);
    setResults(local); setSearching(true);
    try { const geo = await geocode(txt); setResults([...local, ...geo]); }
    catch { setResults(local); }
    finally { setSearching(false); }
  };

  // Figura seleccionada: qué hay adentro
  const selShape = shapes.find((x) => x.id === sel);
  const selInfo = useMemo(() => {
    if (!selShape) return null;
    const ring = ringOf(selShape);
    const info = { medida: measureOf(selShape) };
    if (ring && data?.mode === 'municipio') {
      const ms = data.items.filter((d) => d.lat != null && inside([d.lon, d.lat], ring));
      info.munis = ms.length; info.pop = ms.reduce((a, d) => a + (d.pop || 0), 0);
      info.top = [...ms].sort((a, b) => a.rank - b.rank).slice(0, 5);
      if (!ms.length) {
        // Zona pequeña: indica en qué municipio queda (el más cercano a su centro)
        const c = selShape.type === 'circle' ? selShape.center : centroid(ring);
        let best = null, bd = Infinity;
        for (const d of data.items) { if (d.lat == null) continue; const dd = distance(c, [d.lon, d.lat]); if (dd < bd) { bd = dd; best = d; } }
        info.dentro = best;
      }
      const pl = (red?.plantas || []).filter((p) => p.tipo === 'solar' && inside([p.lon, p.lat], ring));
      info.solar = pl.length; info.solarMw = pl.reduce((a, p) => a + (p.mw || 0), 0);
      info.subs = (red?.subs || []).filter((p) => inside([p.lon, p.lat], ring)).length;
      info.upme = (red?.upme || []).filter((p) => p.lat && inside([p.lon, p.lat], ring)).length;
    }
    return info;
  }, [selShape, data, red]);

  // Vista plana o 3D
  const set3d = (v) => { setIs3d(v); mapRef.current?.easeTo({ pitch: v ? 45 : 0, bearing: v ? -10 : 0, duration: 700 }); };
  const choose = (k) => { setShow(k); setMenu(null); if (k === 'nada') set3d(false); };
  const toggle = (k) => {
    if (LAYERS[k].paid && !paid) { setLockMsg({ layer: LAYERS[k].label }); return; }
    const n = new Set(on); n.has(k) ? n.delete(k) : n.add(k); setOn(n);
  };

  const dpto = data?.mode === 'dpto';
  const metricKeys = prof.metrics.filter((k) => METRICS[k]);
  const showKey = dpto && show !== 'nada' ? 'score' : show;
  const M = METRICS[showKey] || METRICS.score;
  const iconMode = showKey !== 'score' && showKey !== 'nada' && METRIC_ICON[showKey];

  const scaled = useMemo(() => {
    if (!data || showKey === 'nada') return [];
    const tr = (v) => (M.log ? Math.log1p(Math.max(0, v)) : v);
    const vals = data.items.map((d) => M.get(d)).filter((v) => v != null).map(tr);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const rows = data.items.map((d) => {
      const v = M.get(d);
      let t = v == null ? null : (tr(v) - lo) / (hi - lo || 1);
      if (M.invert && t != null) t = 1 - t;
      return { ...d, t };
    }).filter((d) => d.t != null);
    // Todos los municipios; los de menor valor se dibujan primero para que los altos queden encima
    return rows.sort((a, b) => a.t - b.t);
  }, [data, showKey]);

  useEffect(() => {
    if (!overlayRef.current || !data) return;
    const trig = [showKey, JSON.stringify(scoreParams)];
    const layers = [
      // Colombia resaltada: los países vecinos quedan oscurecidos
      new SolidPolygonLayer({ id: 'mask', data: [COLOMBIA_MASK], getPolygon: (d) => d.geometry.coordinates, getFillColor: [16, 14, 42, 150], pickable: false }),
      new SolidPolygonLayer({ id: 'colombia', data: [{ p: COLOMBIA }], getPolygon: (d) => d.p, getFillColor: [52, 120, 246, 18], pickable: false }),
      new PathLayer({ id: 'contorno', data: [{ path: [...COLOMBIA, COLOMBIA[0]] }], getPath: (d) => d.path, getColor: [168, 197, 255, 200], widthUnits: 'pixels', getWidth: 1.6 }),
    ];
    if (on.has('mt') && mt?.length) {
      layers.push(new PathLayer({ id: 'mt', data: mt, getPath: (d) => d.c, getColor: (d) => (d.s === 'o' ? [79, 178, 134, 170] : [79, 178, 134, 90]), widthUnits: 'pixels', getWidth: 1 }));
    }
    if (on.has('lineas') && red?.lineas?.length) {
      layers.push(new PathLayer({
        id: 'lineas', data: red.lineas, getPath: (d) => d.c, getColor: (d) => [...KV_COLOR(kvOf(d.kv)), 190],
        widthUnits: 'pixels', getWidth: (d) => (kvOf(d.kv) >= 500 ? 2.4 : kvOf(d.kv) >= 220 ? 1.8 : 1.2), pickable: true,
      }));
    }
    const onMuni = ({ object }) => { if (!object || st.current.tool) return; if (dpto) setLockMsg(object); else go('m', object.code); };
    if (showKey === 'score' && is3d) {
      layers.push(new ColumnLayer({
        id: 'muni-3d', data: scaled, diskResolution: dpto ? 24 : 12, radius: dpto ? 14000 : 3500, extruded: true, pickable: true,
        elevationScale: dpto ? 700 : 220, getPosition: (d) => [d.lon, d.lat],
        getElevation: (d) => (dpto ? 15 + Math.pow(d.t, 1.3) * 120 : 2 + Math.pow(d.t, 2.4) * 200),
        getFillColor: (d) => [...colorAt(d.t), 225], material: { ambient: 0.55, diffuse: 0.6, shininess: 24 },
        updateTriggers: { getElevation: trig, getFillColor: trig }, onClick: onMuni,
      }));
    } else if (showKey === 'score') {
      layers.push(new ScatterplotLayer({
        id: 'muni-2d', data: scaled, getPosition: (d) => [d.lon, d.lat], radiusUnits: 'pixels', getRadius: (d) => (dpto ? 10 + d.t * 16 : 2 + d.t * 7),
        getFillColor: (d) => [...colorAt(d.t), 210], stroked: true, getLineColor: [16, 14, 42], lineWidthUnits: 'pixels', getLineWidth: 0.5,
        pickable: true, updateTriggers: { getRadius: trig, getFillColor: trig }, onClick: onMuni,
      }));
    } else if (iconMode) {
      // 3D: columna delgada con la altura del valor y el ícono en la punta. Plano: solo el ícono.
      if (is3d) {
        layers.push(new ColumnLayer({
          id: `muni-col-${showKey}`, data: scaled, diskResolution: 8, radius: 1600, extruded: true, pickable: true,
          getPosition: (d) => [d.lon, d.lat], getElevation: (d) => elevOf(d.t), elevationScale: 1,
          getFillColor: (d) => [...colorAt(d.t), 200], material: { ambient: 0.6, diffuse: 0.5 },
          updateTriggers: { getElevation: trig, getFillColor: trig }, onClick: onMuni,
        }));
      }
      layers.push(new IconLayer({
        id: `muni-ic-${showKey}-${is3d ? '3d' : '2d'}`, data: scaled, getPosition: (d) => [d.lon, d.lat, is3d ? elevOf(d.t) : 0],
        getIcon: () => maskIcon(METRIC_ICON[showKey]), sizeUnits: 'pixels', getSize: (d) => (is3d ? 10 + d.t * 14 : 7 + d.t * 14),
        getColor: (d) => [...colorAt(d.t), 245], parameters: ON_TOP,
        pickable: true, updateTriggers: { getSize: trig, getColor: trig, getIcon: trig, getPosition: trig }, onClick: onMuni,
      }));
    }
    if (on.has('subs') && red?.subs?.length) {
      layers.push(new IconLayer({ id: 'subs', data: red.subs, getPosition: (d) => [d.lon, d.lat], getIcon: () => icon(ICON_SUB), sizeUnits: 'pixels', getSize: (d) => (d.kvmax >= 220 ? 20 : 14), parameters: ON_TOP, pickable: true }));
    }
    if (on.has('upme') && red?.upme?.length) {
      layers.push(new IconLayer({ id: 'upme', data: red.upme, getPosition: (d) => [d.lon + 0.03, d.lat + 0.03], getIcon: () => icon(ICON_UPME), sizeUnits: 'pixels', getSize: (d) => Math.min(56, 20 + Math.sqrt(d.mw || 1) * 2), parameters: ON_TOP, pickable: true }));
    }
    if (on.has('solar') && red?.plantas?.length) {
      layers.push(new IconLayer({
        id: 'solar', data: red.plantas.filter((p) => p.tipo === 'solar'), getPosition: (d) => [d.lon, d.lat],
        getIcon: (d) => icon(d.estado === 'Operación' ? ICON_SOLAR : ICON_SOLAR_PRUEBAS), sizeUnits: 'pixels', getSize: (d) => Math.min(60, 18 + Math.sqrt(d.mw || 1) * 2.4), parameters: ON_TOP, pickable: true,
      }));
    }
    if (on.has('zni') && red?.zni?.length) {
      layers.push(new IconLayer({ id: 'zni', data: red.zni, getPosition: (d) => [d.lon, d.lat], getIcon: () => icon(ICON_ZNI), sizeUnits: 'pixels', getSize: (d) => (d.horas < 12 ? 22 : 16), parameters: ON_TOP, pickable: true }));
    }
    // Dibujos del usuario, vista previa y resultado de búsqueda
    const polys = shapes.filter((x) => ringOf(x)).map((x) => ({ ...x, ring: ringOf(x) }));
    if (preview?.ring) polys.push({ id: 'preview', ring: preview.ring, preview: true });
    if (polys.length) {
      layers.push(new PolygonLayer({
        id: 'draw-poly', data: polys, getPolygon: (d) => d.ring, filled: true, stroked: true,
        getFillColor: (d) => (d.preview ? [52, 120, 246, 30] : d.id === sel ? [255, 122, 0, 45] : [52, 120, 246, 45]),
        getLineColor: (d) => (d.id === sel ? [255, 160, 70, 255] : [168, 197, 255, 235]), lineWidthUnits: 'pixels', getLineWidth: (d) => (d.id === sel ? 3 : 2),
        pickable: !tool, parameters: ON_TOP, onClick: ({ object }) => { if (object && !object.preview) setSel(object.id); }, updateTriggers: { getFillColor: [sel], getLineColor: [sel], getLineWidth: [sel] },
      }));
    }
    const paths = shapes.filter((x) => x.type === 'measure').map((x) => ({ ...x, path: x.pts }));
    if (preview?.path) paths.push({ id: 'preview', path: preview.path, preview: true });
    if (paths.length) {
      layers.push(new PathLayer({ id: 'draw-path', data: paths, getPath: (d) => d.path, getColor: (d) => (d.id === sel ? [255, 160, 70, 255] : [255, 122, 0, 235]), widthUnits: 'pixels', getWidth: 3, pickable: !tool, onClick: ({ object }) => { if (object && !object.preview) setSel(object.id); }, parameters: ON_TOP, updateTriggers: { getColor: [sel] } }));
    }
    const verts = [...paths.flatMap((d) => d.path), ...(draft?.pts || []), ...(draft?.center ? [draft.center] : [])];
    const points = shapes.filter((x) => x.type === 'point');
    if (verts.length || points.length || pin) {
      layers.push(new ScatterplotLayer({ id: 'draw-verts', data: verts, getPosition: (d) => d, radiusUnits: 'pixels', getRadius: 3.5, getFillColor: [255, 255, 255, 255], parameters: ON_TOP }));
      layers.push(new ScatterplotLayer({
        id: 'draw-points', data: [...points, ...(pin ? [{ id: 'pin', pts: [pin.pos], pin: true }] : [])], getPosition: (d) => d.pts[0], radiusUnits: 'pixels',
        getRadius: (d) => (d.pin ? 9 : 7), getFillColor: (d) => (d.pin ? [52, 120, 246, 255] : [255, 122, 0, 255]), stroked: true, getLineColor: [255, 255, 255, 255], lineWidthUnits: 'pixels', getLineWidth: 2,
        pickable: !tool, onClick: ({ object }) => { if (object && !object.pin) setSel(object.id); }, parameters: ON_TOP,
      }));
    }
    const labels = [
      ...shapes.filter((x) => x.type === 'text').map((x) => ({ pos: x.pts[0], text: x.text, size: 15 })),
      ...points.filter((x) => x.text).map((x) => ({ pos: x.pts[0], text: x.text, size: 12, dy: -16 })),
      ...shapes.filter((x) => x.type !== 'text' && x.type !== 'point').map((x) => ({ pos: x.type === 'measure' ? x.pts[x.pts.length - 1] : x.type === 'circle' ? x.center : centroid(ringOf(x)), text: measureOf(x), size: 12, dy: x.type === 'measure' ? -16 : 0 })),
      ...(preview?.label ? [{ pos: preview.at, text: preview.label, size: 12, dy: -18 }] : []),
      ...(pin?.label ? [{ pos: pin.pos, text: pin.label, size: 12, dy: -20 }] : []),
    ];
    if (labels.length) layers.push(new TextLayer({ id: 'draw-text', data: labels, getPosition: (d) => d.pos, getText: (d) => d.text, getSize: (d) => d.size, getPixelOffset: (d) => [0, d.dy || 0], ...TXT }));

    overlayRef.current.setProps({
      layers,
      getTooltip: ({ object: d, layer }) => {
        if (tool) return null;
        if (!d || !layer) return null;
        let html;
        if (layer.id === 'lineas') html = `<b>${d.n}</b><br/>${d.kv}<br/><span style="color:#B3BCDA">${d.op}</span>`;
        else if (layer.id === 'subs') html = `<b>Subestación ${d.n}</b><br/>${d.kv}${d.desde ? ' · desde ' + d.desde : ''}<br/><span style="color:#B3BCDA">${d.op}</span>`;
        else if (layer.id === 'solar') html = `<b>${d.n}</b><br/>${fmt(d.mw, 1)} MW · ${d.estado}${d.kv ? ' · ' + d.kv + ' kV' : ''}<br/><span style="color:#B3BCDA">${d.op || ''}<br/>${d.mun || ''}, ${d.dpto || ''}</span>`;
        else if (layer.id === 'upme') html = `<b>${d.n}</b><br/>${fmt(d.mw, 1)} MW · ${d.tipo} · ${d.fase}<br/>${d.mun}, ${d.dpto}<br/><span style="color:#B3BCDA">Operación prevista ${d.operacion?.slice(0, 7) || 's/d'} · UPME</span>`;
        else if (layer.id === 'zni') html = `<b>${d.n}</b> (no interconectada)<br/>${d.mpio}, ${d.dpto}<br/>${fmt(d.horas, 1)} horas de servicio al día<br/><span style="color:#B3BCDA">IPSE, ${d.ultimo}</span>`;
        else if (!layer.id.startsWith('muni-')) return null;
        else if (dpto) html = `<b>${d.dpto}</b><br/>Puntaje departamental ${d.score}<br/><span style="color:#B3BCDA">${d.municipios} municipios · detalle en plan completo</span>`;
        else html = `<b>${d.name}</b> · ${d.dpto}<br/>${showKey === 'score' ? `#${d.rank} · puntaje ${d.score}` : `${M.label}: <b>${M.f(M.get(d))}</b>`}<br/><span style="color:#B3BCDA">Clic para ver la ficha</span>`;
        return { html: `<div class="maptip">${html}</div>`, style: { background: 'none', padding: 0 } };
      },
    });
  }, [scaled, data, showKey, is3d, go, on, red, mt, shapes, preview, draft, sel, pin, tool]);

  const visibles = useMemo(() => {
    if (data?.mode !== 'municipio') return [];
    const all = [...data.items].sort((a, b) => a.rank - b.rank);
    if (!onlyVisible || !bounds) return all;
    const [w, s, e, n] = bounds;
    return all.filter((d) => d.lon >= w && d.lon <= e && d.lat >= s && d.lat <= n);
  }, [data, bounds, onlyVisible]);
  const top = visibles.slice(0, 30);
  const fly = (d) => mapRef.current?.flyTo({ center: [d.lon, d.lat], zoom: 9, pitch: is3d ? 50 : 0, speed: 1.4 });
  const sub = (d) => metricKeys.filter((k) => k !== 'score').slice(0, 2).map((k) => `${METRICS[k].short} ${METRICS[k].f(METRICS[k].get(d))}`).join(' · ');
  const showLabel = show === 'nada' ? 'Nada' : (METRICS[show]?.short || 'Puntaje');
  const MenuIcon = ({ k }) => (k === 'nada' ? <Icon name="map" size={18} /> : k === 'score' ? <Icon name="chart" size={18} /> : <img src={METRIC_ICON[k]} alt="" width="18" height="18" />);

  return (
    <div className="mapwrap" onClick={(e) => { if (menu && !e.target.closest('.dd')) setMenu(null); }}>
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      <div className="map-top">
        <form className="dd map-search glass" onSubmit={runSearch}>
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => { setQ(e.target.value); setResults(e.target.value.trim().length >= 2 ? localMatches(e.target.value.trim()) : null); }} placeholder="Dirección, lugar, municipio o lat, lon" aria-label="Buscar en el mapa" />
          {q && <button type="button" className="icon-btn" onClick={() => { setQ(''); setResults(null); setPin(null); }} aria-label="Limpiar búsqueda"><Icon name="x" size={14} /></button>}
          {(results || searching) && (
            <div className="glass dd-menu" role="listbox">
              {results?.map((r, i) => (
                <button key={i} type="button" onClick={() => { flyToPos(r.pos, r.zoom, r.label); }}><Icon name={r.code ? 'map' : 'pin'} size={16} /><span><b>{r.label}</b><br /><span className="small muted">{r.sub}</span></span></button>
              ))}
              {searching && <span className="small muted" style={{ padding: '8px 10px' }}>Buscando direcciones…</span>}
              {!searching && results && !results.length && <span className="small muted" style={{ padding: '8px 10px' }}>Sin resultados. Pulsa Enter para buscar direcciones.</span>}
              {!searching && results?.length > 0 && <span className="small muted" style={{ padding: '6px 10px' }}>Enter: buscar también direcciones (OpenStreetMap)</span>}
            </div>
          )}
        </form>
        <div className="dd">
          <button className={`btn sm glass ${menu === 'show' ? 'on' : ''}`} onClick={() => setMenu(menu === 'show' ? null : 'show')} aria-expanded={menu === 'show'}>
            <MenuIcon k={show} />Mostrar: <b>{showLabel}</b><span className="caret">▾</span>
          </button>
          {menu === 'show' && (
            <div className="glass dd-menu" role="menu">
              <button className={show === 'nada' ? 'on' : ''} onClick={() => choose('nada')}><MenuIcon k="nada" /><span><b>Nada</b><br /><span className="small muted">Solo el mapa de Colombia</span></span></button>
              <button className={show === 'score' ? 'on' : ''} onClick={() => choose('score')}><MenuIcon k="score" /><span><b>Puntaje de oportunidad</b><br /><span className="small muted">Columnas en 3D o puntos en plano</span></span></button>
              {paid && metricKeys.filter((k) => k !== 'score').map((k) => (
                <button key={k} className={show === k ? 'on' : ''} onClick={() => choose(k)}><MenuIcon k={k} /><span><b>{METRICS[k].label}</b><br /><span className="small muted">{is3d ? 'Ícono y columna por municipio' : 'Ícono por municipio'}</span></span></button>
              ))}
              {!paid && <span className="small muted" style={{ padding: '6px 10px' }}>Tarifas, radiación, cortes y más en el plan completo.</span>}
            </div>
          )}
        </div>
        <div className="dd">
          <button className={`btn sm glass ${menu === 'layers' ? 'on' : ''}`} onClick={() => setMenu(menu === 'layers' ? null : 'layers')} aria-expanded={menu === 'layers'}>
            <Icon name="layers" size={16} />Red y plantas{on.size ? ` (${on.size})` : ''}<span className="caret">▾</span>
          </button>
          {menu === 'layers' && (
            <div className="glass dd-menu layers" role="menu">
              {Object.entries(LAYERS).map(([k, l]) => (
                <label key={k} className={l.paid && !paid ? 'dis' : ''}>
                  <input type="checkbox" checked={on.has(k)} onChange={() => toggle(k)} />
                  {l.img ? <img src={l.img} alt="" width="22" height="22" /> : <span className="sw" style={{ background: l.swatch }} />}
                  <span>{l.label}{l.paid && !paid ? ' 🔒' : ''}</span>
                </label>
              ))}
              {on.has('mt') && <span className="small muted">Media tensión: modelo gridfinder (2020). Es una estimación, no la red oficial.</span>}
              {on.has('mt') && paid && !mt && <span className="small muted">Cargando red estimada…</span>}
            </div>
          )}
        </div>
        <div className="glass seg" role="group" aria-label="Vista">
          <button className={!is3d ? 'on' : ''} onClick={() => set3d(false)}>Plano</button>
          <button className={is3d ? 'on' : ''} onClick={() => set3d(true)}>3D</button>
        </div>
        <div className="glass" style={{ padding: 6 }}><WeightsControl compact /></div>
      </div>

      <div className="draw-bar glass" role="toolbar" aria-label="Dibujar y medir">
        {TOOLS.map(([k, ic, label]) => (
          <button key={k} className={tool === k ? 'on' : ''} onClick={() => pickTool(k)} title={label} aria-label={label} aria-pressed={tool === k}><Icon name={ic} size={18} /></button>
        ))}
        {shapes.length > 0 && <button onClick={clearShapes} title="Borrar todos los dibujos" aria-label="Borrar todos los dibujos"><Icon name="trash" size={18} /></button>}
      </div>
      {tool && (
        <div className="draw-hint glass">
          <b>{TOOLS.find((t) => t[0] === tool)[2]}</b>
          <span className="small muted">{TOOLS.find((t) => t[0] === tool)[3]}</span>
          {(tool === 'text' || tool === 'point') && <input className="input" value={textVal} onChange={(e) => setTextVal(e.target.value)} placeholder={tool === 'text' ? 'Escribe el texto' : 'Etiqueta (opcional)'} autoFocus style={{ minHeight: 34 }} />}
          <div className="row" style={{ gap: 6 }}>
            {(tool === 'polygon' || tool === 'measure') && <button className="btn sm primary" onClick={finish} disabled={!draft || draft.pts.length < (tool === 'polygon' ? 3 : 2)}><Icon name="check" size={14} />Terminar</button>}
            <button className="btn sm" onClick={cancel}>Cancelar</button>
          </div>
        </div>
      )}
      {selShape && !tool && (
        <div className="draw-info glass">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <b>{{ circle: 'Círculo', polygon: 'Polígono', rect: 'Rectángulo', point: 'Punto', text: 'Texto', measure: 'Medición' }[selShape.type]}</b>
            <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
              <button className="icon-btn" onClick={() => removeShape(selShape.id)} title="Eliminar"><Icon name="trash" size={15} /></button>
              <button className="icon-btn" onClick={() => setSel(null)} title="Cerrar"><Icon name="x" size={15} /></button>
            </span>
          </div>
          {selShape.text && <span className="small">{selShape.text}</span>}
          {selInfo?.medida && <span className="small mono">{selInfo.medida}</span>}
          {selInfo?.munis != null && (<>
            {selInfo.dentro
              ? <button className="draw-top-one" onClick={() => go('m', selInfo.dentro.code)}><span className="small">Queda en <b>{selInfo.dentro.name}</b> ({selInfo.dentro.dpto})</span><ScoreBadge score={selInfo.dentro.score} tier={selInfo.dentro.tier} /></button>
              : <span className="small">{fmt(selInfo.munis)} municipios · {fmt(selInfo.pop)} habitantes</span>}
            <span className="small muted">{selInfo.solar} plantas solares ({fmt(selInfo.solarMw)} MW) · {selInfo.subs} subestaciones · {selInfo.upme} proyectos UPME</span>
            {selInfo.top.length > 0 && <div className="draw-top">{selInfo.top.map((d) => <button key={d.code} onClick={() => go('m', d.code)}><span>{d.name}</span><ScoreBadge score={d.score} tier={d.tier} /></button>)}</div>}
          </>)}
        </div>
      )}

      {showKey !== 'nada' && (
        <div className="legend glass">
          <span className="row" style={{ gap: 6 }}>{iconMode && <img src={METRIC_ICON[showKey]} alt="" width="16" height="16" />}{M.label}: {M.invert ? 'lejos → cerca' : 'bajo → alto'}</span>
          <div className="ramp" />
          <span className="muted">{dpto ? 'Puntaje por departamento' : iconMode ? `${is3d ? 'Altura, tamaño' : 'Tamaño'} y color = valor · todos los municipios` : `${is3d ? 'Altura' : 'Tamaño'} y color = puntaje · ${prof.short}`}</span>
        </div>
      )}

      <div className={`map-panel glass ${collapsed ? 'collapsed' : ''}`}>
        <button className="row" onClick={() => setCollapsed(!collapsed)} style={{ padding: '14px 16px', border: 0, background: 'none', justifyContent: 'space-between', cursor: 'pointer', width: '100%' }} aria-expanded={!collapsed}>
          <h2>{paid ? `Mejores zonas · ${prof.short}` : 'Vista previa'}</h2>
          <span className="small muted">{data ? (paid ? `${fmt(visibles.length)} ${onlyVisible ? 'en la vista' : 'municipios'}` : 'plan de prueba') : 'cargando…'}</span>
        </button>
        {data?.mode === 'municipio' && (
          <div className="seg panel-scope" role="group" aria-label="Qué municipios mostrar">
            <button className={onlyVisible ? 'on' : ''} onClick={() => setOnlyVisible(true)}>Lo que ves en el mapa</button>
            <button className={!onlyVisible ? 'on' : ''} onClick={() => setOnlyVisible(false)}>Todo el país</button>
          </div>
        )}
        <div className="list">
          {data?.mode === 'municipio' && !top.length && <p className="small muted" style={{ padding: '4px 16px' }}>No hay municipios en esta parte del mapa. Aléjate o elige "Todo el país".</p>}
          {data?.mode === 'municipio' && top.map((d) => (
            <button key={d.code} className="map-item" onClick={() => { fly(d); }} onDoubleClick={() => go('m', d.code)}>
              <span className="mono muted">{d.rank}</span>
              <span><b>{d.name}</b><br /><span className="small muted">{d.dpto} · {sub(d)}</span></span>
              <span className="row" style={{ gap: 6 }}><ScoreBadge score={d.score} tier={d.tier} /><a className="small" href={`#/m/${d.code}`} onClick={(e) => e.stopPropagation()}>Ver</a></span>
            </button>
          ))}
          {dpto && (
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
