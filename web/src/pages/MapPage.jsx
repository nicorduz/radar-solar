import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { ColumnLayer, GeoJsonLayer, IconLayer, PathLayer, PolygonLayer, ScatterplotLayer, SolidPolygonLayer, TextLayer } from '@deck.gl/layers';
import { api, qs, fmt, METRICS } from '../api.js';
import { useApp } from '../App.jsx';
import { WeightsControl, ScoreBadge, ContactCTA } from '../components/ui.jsx';
import { writeLocal, useLocal } from '../local.js';
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
  solar: { label: 'Plantas solares', img: ICON_SOLAR, paid: true },
  upme: { label: 'Proyectos de generación registrados', img: ICON_UPME, paid: true },
  subs: { label: 'Subestaciones', img: ICON_SUB, paid: false },
  lineas: { label: 'Líneas de transmisión', swatch: 'linear-gradient(90deg,#78BEDC,#F2C38A,#E2675B)', paid: false },
  mt: { label: 'Red de media tensión estimada', swatch: '#4FB286', paid: true },
  zni: { label: 'Zonas no interconectadas', img: ICON_ZNI, paid: true },
  capacidad: { label: 'Capacidad de conexión por subestación (2026)', swatch: 'linear-gradient(90deg,#E2675B,#F2C38A,#4FB286)', paid: true },
  colegios: { label: 'Colegios', swatch: '#9B8CFF', paid: true },
  salud: { label: 'Hospitales y centros de salud (por municipio)', swatch: '#FF6B8A', paid: true },
  trafos: { label: 'Transformadores de distribución (demo)', swatch: 'linear-gradient(90deg,#4FB286,#F2C38A,#E2675B)', paid: true, demo: true },
};
const DEFAULT_LAYERS = { instalador: [], proveedor: [], desarrollador: ['lineas', 'solar', 'upme', 'capacidad'], servicios: ['solar'], respaldo: ['zni'] };
const ZOOM_COLEGIOS = 9;
// Color de la capacidad de conexión: rojo = casi nada, ámbar = poca, verde = 10 MW o más
const CAP_COLOR = (mw) => (mw == null || mw < 1 ? [226, 103, 91] : mw < 10 ? [242, 195, 138] : [79, 178, 134]);
// Transformadores (demo): semáforo de uso del límite del 50 % de la capacidad nominal (CREG 174)
const ZOOM_TRAFOS = 12;
const SEM_COLOR = { verde: [79, 178, 134], amarillo: [242, 195, 138], naranja: [255, 140, 60], rojo: [226, 103, 91], sd: [120, 170, 255] };
const SEM_TXT = { verde: 'Con espacio (usa menos de la mitad del límite)', amarillo: 'Espacio medio (50-80 % del límite)', naranja: 'Casi lleno (80-100 %)', rojo: 'Sin espacio', sd: 'El operador no publica la generación conectada' };
const TRAFO_W0 = { espacio: 45, tam: 25, sat: 20, us: 10 };
const TRAFO_F = { espacio: 'Espacio libre para autogeneración', tam: 'Tamaño del transformador', sat: 'Poca generación ya conectada', us: 'Usuarios conectados (solo EPM)' };
const L1 = (v, ref) => Math.min(1, Math.log1p(Math.max(0, v || 0)) / Math.log1p(ref));
function trafoScore(d, w) {
  const parts = { espacio: L1(d.libre, 50), tam: L1(d.kva, 500), sat: d.sem === 'sd' ? 0.6 : Math.max(0, 1 - (d.uso || 0)), us: d.us == null ? 0.5 : L1(d.us, 60) };
  const ws = Object.values(w).reduce((a, x) => a + (+x || 0), 0) || 1;
  return Object.keys(parts).reduce((a, k) => a + (w[k] || 0) * parts[k], 0) / ws;
}
const espacioColor = (p) => (p >= 0.7 ? [79, 178, 134] : p >= 0.4 ? [242, 195, 138] : [226, 103, 91]);
// Clave de un punto para poder ocultarlo en un tablero
const HKEY = {
  muni: (d) => d.code, solar: (d) => `${d.n}|${d.lat}`, upme: (d) => d.id, subs: (d) => d.n, zni: (d) => d.n, capacidad: (d) => d.n,
  colegios: (d) => d.id, salud: (d) => d.code, trafo: (d) => `${d.op}|${d.id}`, 'trafo-muni': (d) => d.code,
};
const layerKind = (id) => (id.startsWith('muni-') ? 'muni' : id);
const TABLEROS = 'rs_tableros';
// Distancia aproximada (km) de un punto a un segmento de línea, en coordenadas locales
function segDist(p, a, b) {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111.32, kl = 110.57;
  const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * kl, bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * kl;
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}
// Herramientas de dibujo del mapa
const TOOLS = [
  ['circle', 'circle', 'Círculo', 'Clic en el centro y otro clic en el borde.'],
  ['polygon', 'polygon', 'Polígono', 'Clic en cada vértice. Doble clic o "Terminar" para cerrar.'],
  ['rect', 'rect', 'Rectángulo', 'Clic en una esquina y otro clic en la esquina opuesta.'],
  ['point', 'pin', 'Punto', 'Clic donde quieras el punto.'],
  ['text', 'text', 'Texto', 'Escribe el texto y haz clic en el mapa.'],
  ['measure', 'ruler', 'Medir', 'Clic en cada punto del recorrido. Doble clic o "Terminar" para finalizar.'],
  ['hide', 'eyeoff', 'Ocultar puntos', 'Clic en un municipio, planta, subestación, colegio o transformador para quitarlo del mapa. Se guarda con el tablero.'],
];
const loadShapes = () => { try { return JSON.parse(localStorage.getItem('rs_shapes') || '[]'); } catch { return []; } };
const saveShapes = (s) => { try { localStorage.setItem('rs_shapes', JSON.stringify(s)); } catch { /* sin almacenamiento */ } };
const uid = () => Math.random().toString(36).slice(2, 9);
const TXT = { fontFamily: 'Inter, system-ui, sans-serif', characterSet: 'auto', sizeUnits: 'pixels', background: true, getBackgroundColor: [16, 14, 42, 225], backgroundPadding: [6, 3], getColor: [244, 246, 251, 255], parameters: { depthCompare: 'always', depthWriteEnabled: false } };

const icon = (url) => ({ url, width: 64, height: 64, anchorY: 32, mask: false });
const maskIcon = (url) => ({ url, width: 64, height: 64, anchorY: 32, mask: true });

export default function MapPage({ focus }) {
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
  const [zoom, setZoom] = useState(5.6);
  const [colegios, setColegios] = useState(null);
  const [salud, setSalud] = useState(null);
  const [soon, setSoon] = useState(false);
  // Transformadores (demo)
  const [trafoRes, setTrafoRes] = useState(null);
  const [trafoPts, setTrafoPts] = useState(null);
  const [trafoMode, setTrafoMode] = useState('sem');
  const [trafoW, setTrafoW] = useState(TRAFO_W0);
  // Límites y filtro por departamento
  const [limites, setLimites] = useState('ninguno'); // ninguno | dptos | munis | relleno
  const [dptoSel, setDptoSel] = useState('');
  const [geoD, setGeoD] = useState(null);
  const [geoM, setGeoM] = useState(null);
  // Tableros: puntos ocultos y vistas guardadas
  const [hidden, setHidden] = useState([]);
  const [tableros, setTableros] = useLocal(TABLEROS, []);
  const [actual, setActual] = useState(null);
  const [nombreT, setNombreT] = useState('');
  const st = useRef({});
  st.current = { tool, draft, textVal, hidden };
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
    const b = () => { const x = map.getBounds(); setBounds([x.getWest(), x.getSouth(), x.getEast(), x.getNorth()]); setZoom(map.getZoom()); };
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

  // Enlace desde la ficha (#/mapa/trafos-05001): activa la capa y se acerca al municipio
  useEffect(() => {
    const mm = String(focus || '').match(/^(trafos)-(\d{5})$/);
    if (!mm || !data?.items || !mapRef.current) return;
    const d = data.items.find((x) => x.code === mm[2]);
    if (!d) return;
    setOn((o) => new Set([...o, 'trafos']));
    mapRef.current.flyTo({ center: [d.lon, d.lat], zoom: ZOOM_TRAFOS + 2, pitch: 0, speed: 1.6 });
  }, [focus, data]);

  // Al cambiar de perfil: puntaje y capas recomendadas
  useEffect(() => { setShow('score'); setOn(new Set(DEFAULT_LAYERS[profile] || [])); }, [profile]);

  useEffect(() => {
    setData(null);
    api('/map' + qs(scoreParams)).then(setData).catch(() => setData({ items: [] }));
  }, [JSON.stringify(scoreParams)]);

  useEffect(() => { api('/red').then(setRed).catch(() => setRed({ lineas: [], subs: [], plantas: [], zni: [], upme: [] })); }, []);
  useEffect(() => { if (on.has('mt') && paid && !mt) api('/red/mt').then(setMt).catch(() => setMt([])); }, [on, paid, mt]);
  useEffect(() => { api('/geo/dptos').then(setGeoD).catch(() => setGeoD(null)); }, []);
  useEffect(() => { if ((limites === 'munis' || limites === 'relleno') && !geoM) api('/geo/municipios').then(setGeoM).catch(() => setGeoM(null)); }, [limites, geoM]);
  useEffect(() => { if (on.has('trafos') && paid && !trafoRes) api('/trafos/resumen').then(setTrafoRes).catch(() => setTrafoRes({ operadores: [], municipios: [] })); }, [on, paid, trafoRes]);
  useEffect(() => {
    if (!on.has('trafos') || !paid || !bounds || zoom < ZOOM_TRAFOS) return;
    const t = setTimeout(() => api('/trafos?bbox=' + bounds.map((v) => v.toFixed(4)).join(',')).then(setTrafoPts).catch(() => setTrafoPts(null)), 250);
    return () => clearTimeout(t);
  }, [on, paid, bounds, zoom]);
  useEffect(() => { if (on.has('salud') && paid && !salud) api('/capas/salud').then(setSalud).catch(() => setSalud([])); }, [on, paid, salud]);
  // Colegios: solo los que caben en la vista y con el mapa acercado (son más de 50.000)
  useEffect(() => {
    if (!on.has('colegios') || !paid || !bounds || zoom < ZOOM_COLEGIOS) return;
    const t = setTimeout(() => api('/capas/colegios?bbox=' + bounds.map((v) => v.toFixed(3)).join(',')).then(setColegios).catch(() => setColegios(null)), 250);
    return () => clearTimeout(t);
  }, [on, paid, bounds, zoom]);

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
    if (!t || t === 'hide') return;
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
    // Evaluación del sitio: red eléctrica más cercana al centro de la figura o al punto
    const c = selShape.type === 'circle' ? selShape.center : ring ? centroid(ring) : selShape.type === 'point' ? selShape.pts[0] : null;
    if (c && red && data?.mode === 'municipio') {
      info.centro = c;
      info.subsCerca = (red.subs || []).map((x) => ({ ...x, km: distance(c, [x.lon, x.lat]) / 1000 })).sort((a, b) => a.km - b.km).slice(0, 3);
      let bl = null;
      for (const l of red.lineas || []) for (let i = 1; i < (l.c?.length || 0); i++) { const d = segDist(c, l.c[i - 1], l.c[i]); if (!bl || d < bl.km) bl = { n: l.n, kv: l.kv, km: d }; }
      info.linea = bl;
      info.solar10 = (red.plantas || []).filter((p) => p.tipo === 'solar' && distance(c, [p.lon, p.lat]) <= 10000).length;
      if (!info.dentro && !info.munis) {
        let best = null, bd = Infinity;
        for (const d of data.items) { if (d.lat == null) continue; const dd = distance(c, [d.lon, d.lat]); if (dd < bd) { bd = dd; best = d; } }
        info.dentro = best;
      }
      info.ref = info.dentro || info.top?.[0] || null;
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
  const inDpto = (code) => !dptoSel || String(code || '').slice(0, 2) === dptoSel;
  const hid = useMemo(() => new Set(hidden), [hidden]);
  const vis = (kind, arr) => (hid.size ? arr.filter((d) => !hid.has(`${kind}:${HKEY[kind](d)}`)) : arr);
  const dptoNames = useMemo(() => { const o = {}; for (const d of data?.items || []) if (d.code) o[d.code.slice(0, 2)] = d.dpto; return Object.entries(o).sort((a, b) => a[1].localeCompare(b[1], 'es')); }, [data]);
  const dptoFeat = useMemo(() => (dptoSel && geoD ? geoD.features.find((f) => f.properties.d === dptoSel) : null), [dptoSel, geoD]);
  // Al elegir un departamento el mapa se acerca a él
  useEffect(() => {
    if (!dptoFeat || !mapRef.current) return;
    const polys = dptoFeat.geometry.type === 'Polygon' ? [dptoFeat.geometry.coordinates] : dptoFeat.geometry.coordinates;
    let w = 180, s2 = 90, e = -180, n = -90;
    for (const p of polys) for (const [x, y] of p[0]) { w = Math.min(w, x); e = Math.max(e, x); s2 = Math.min(s2, y); n = Math.max(n, y); }
    mapRef.current.fitBounds([[w, s2], [e, n]], { padding: { top: 90, bottom: 40, left: 70, right: window.innerWidth >= 860 ? 400 : 20 }, duration: 900 });
  }, [dptoFeat]);
  const trafoRows = useMemo(() => {
    if (!trafoPts?.rows) return [];
    const rows = trafoPts.rows.filter((d) => inDpto(d.code)).map((d) => ({ ...d, score: trafoScore(d, trafoW) }));
    // El color usa la posición de cada transformador frente a los demás de la vista (contraste aunque los puntajes se parezcan)
    const ord = rows.map((d, i) => [d.score, i]).sort((a, b) => a[0] - b[0]);
    ord.forEach(([, i], k) => { rows[i].t = ord.length > 1 ? k / (ord.length - 1) : 0.5; });
    return rows;
  }, [trafoPts, trafoW, dptoSel]);

  // ---- Tableros guardados ----
  const snapshot = (name) => {
    const map = mapRef.current; const c = map.getCenter();
    return { id: actual?.id && actual.name === name ? actual.id : uid(), name, fecha: new Date().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }), profile,
      view: { center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() },
      show, is3d, on: [...on], shapes, hidden, dpto: dptoSel, limites, trafoMode, trafoW };
  };
  const guardarTablero = (asNew) => {
    const name = (asNew ? nombreT : actual?.name || nombreT).trim() || `Tablero ${tableros.length + 1}`;
    const t = snapshot(name);
    if (asNew) t.id = uid();
    setTableros([t, ...tableros.filter((x) => x.id !== t.id)]); setActual(t); setNombreT('');
  };
  const abrirTablero = (t) => {
    setShow(t.show || 'score'); setIs3d(!!t.is3d); setOn(new Set(t.on || [])); setShapes(t.shapes || []); saveShapes(t.shapes || []);
    setHidden(t.hidden || []); setDptoSel(t.dpto || ''); setLimites(t.limites || 'ninguno'); setTrafoMode(t.trafoMode || 'sem'); setTrafoW(t.trafoW || TRAFO_W0);
    setSel(null); setActual(t); setMenu(null);
    if (t.view) setTimeout(() => mapRef.current?.jumpTo({ center: t.view.center, zoom: t.view.zoom, pitch: t.view.pitch, bearing: t.view.bearing }), t.dpto ? 950 : 0);
  };
  const borrarTablero = (id) => { setTableros(tableros.filter((x) => x.id !== id)); if (actual?.id === id) setActual(null); };
  const exportar = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(tableros, null, 1)], { type: 'application/json' })); a.download = 'tableros-radar-solar.json'; a.click(); };
  const importar = async (file) => {
    try {
      const list = JSON.parse(await file.text());
      const ok = (Array.isArray(list) ? list : [list]).filter((t) => t && t.name && t.view).map((t) => ({ ...t, id: uid() }));
      setTableros([...ok, ...tableros]);
    } catch { /* archivo inválido */ }
  };
  const toggleHidden = (layerId, object) => {
    const kind = layerKind(layerId);
    if (!HKEY[kind] || !object) return;
    const k = `${kind}:${HKEY[kind](object.properties?.item || object)}`;
    setHidden((h) => (h.includes(k) ? h.filter((x) => x !== k) : [...h, k]));
  };
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
    return vis('muni', rows.filter((d) => dpto || inDpto(d.code))).sort((a, b) => a.t - b.t);
  }, [data, showKey, dptoSel, hid]);

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
    // Municipios coloreados (mapa de calor por polígono) y límites
    const relleno = limites === 'relleno' && geoM && !dpto;
    if (relleno) {
      const byCode = new Map(scaled.map((d) => [d.code, d]));
      const feats = geoM.features.filter((f) => byCode.has(f.properties.code)).map((f) => ({ ...f, properties: { ...f.properties, item: byCode.get(f.properties.code) } }));
      layers.push(new GeoJsonLayer({
        id: 'muni-poly', data: { type: 'FeatureCollection', features: feats }, filled: true, stroked: true,
        getFillColor: (f) => [...colorAt(f.properties.item.t), 175], getLineColor: [16, 14, 42, 160], lineWidthUnits: 'pixels', getLineWidth: 0.6,
        pickable: true, updateTriggers: { getFillColor: trig }, onClick: ({ object }) => { if (object) onMuni({ object: object.properties.item }); },
      }));
    }
    if ((limites === 'munis' || relleno) && geoM && !relleno) {
      layers.push(new GeoJsonLayer({ id: 'lim-muni', data: dptoSel ? { ...geoM, features: geoM.features.filter((f) => f.properties.d === dptoSel) } : geoM, filled: false, stroked: true, getLineColor: [168, 197, 255, 110], lineWidthUnits: 'pixels', getLineWidth: 0.7 }));
    }
    if (limites !== 'ninguno' && geoD) {
      layers.push(new GeoJsonLayer({ id: 'lim-dpto', data: geoD, filled: false, stroked: true, getLineColor: [200, 215, 255, 200], lineWidthUnits: 'pixels', getLineWidth: 1.4 }));
    }
    // Con los transformadores a la vista, las columnas del municipio estorban
    const sinMuni = relleno || (on.has('trafos') && paid && zoom >= ZOOM_TRAFOS);
    if (sinMuni) { /* los municipios ya están coloreados o se ven los transformadores */ } else if (showKey === 'score' && is3d) {
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
      layers.push(new IconLayer({ id: 'subs', data: vis('subs', red.subs), getPosition: (d) => [d.lon, d.lat], getIcon: () => icon(ICON_SUB), sizeUnits: 'pixels', getSize: (d) => (d.kvmax >= 220 ? 20 : 14), parameters: ON_TOP, pickable: true }));
    }
    if (on.has('upme') && red?.upme?.length) {
      layers.push(new IconLayer({ id: 'upme', data: vis('upme', red.upme), getPosition: (d) => [d.lon + 0.03, d.lat + 0.03], getIcon: () => icon(ICON_UPME), sizeUnits: 'pixels', getSize: (d) => Math.min(56, 20 + Math.sqrt(d.mw || 1) * 2), parameters: ON_TOP, pickable: true }));
    }
    if (on.has('solar') && red?.plantas?.length) {
      layers.push(new IconLayer({
        id: 'solar', data: vis('solar', red.plantas.filter((p) => p.tipo === 'solar')), getPosition: (d) => [d.lon, d.lat],
        getIcon: (d) => icon(d.estado === 'Operación' ? ICON_SOLAR : ICON_SOLAR_PRUEBAS), sizeUnits: 'pixels', getSize: (d) => Math.min(60, 18 + Math.sqrt(d.mw || 1) * 2.4), parameters: ON_TOP, pickable: true,
      }));
    }
    if (on.has('salud') && salud?.length) {
      layers.push(new ScatterplotLayer({
        id: 'salud', data: vis('salud', salud.filter((d) => inDpto(d.code))), getPosition: (d) => [d.lon + 0.02, d.lat - 0.02], radiusUnits: 'pixels', getRadius: (d) => Math.min(16, 2 + Math.sqrt(d.n) * 0.8),
        getFillColor: [255, 107, 138, 120], stroked: true, getLineColor: [255, 255, 255, 200], lineWidthUnits: 'pixels', getLineWidth: 1, parameters: ON_TOP, pickable: true, onClick: ({ object }) => { if (object && !st.current.tool) go('instituciones', `salud-${object.code}`); },
      }));
    }
    if (on.has('colegios') && colegios?.rows?.length && zoom >= ZOOM_COLEGIOS) {
      layers.push(new ScatterplotLayer({
        id: 'colegios', data: vis('colegios', colegios.rows.filter((d) => inDpto(d.code))), getPosition: (d) => [d.lon, d.lat], radiusUnits: 'pixels', getRadius: (d) => Math.min(14, 3 + Math.sqrt(d.mat || 0) / 4),
        getFillColor: (d) => (d.sec === 'O' ? [155, 140, 255, 190] : [214, 200, 255, 220]), stroked: true, getLineColor: [16, 14, 42, 220], lineWidthUnits: 'pixels', getLineWidth: 1, parameters: ON_TOP, pickable: true,
      }));
    }
    if (on.has('capacidad') && red?.capacidad?.length) {
      layers.push(new ScatterplotLayer({
        id: 'capacidad', data: vis('capacidad', red.capacidad), getPosition: (d) => [d.lon - 0.015, d.lat + 0.015], radiusUnits: 'pixels', getRadius: (d) => Math.min(22, 5 + Math.sqrt(d.p95_2026 || 0) * 1.4),
        getFillColor: (d) => [...CAP_COLOR(d.p95_2026), 215], stroked: true, getLineColor: [16, 14, 42, 230], lineWidthUnits: 'pixels', getLineWidth: 1.2, parameters: ON_TOP, pickable: true,
      }));
    }
    if (on.has('zni') && red?.zni?.length) {
      layers.push(new IconLayer({ id: 'zni', data: vis('zni', red.zni), getPosition: (d) => [d.lon, d.lat], getIcon: () => icon(ICON_ZNI), sizeUnits: 'pixels', getSize: (d) => (d.horas < 12 ? 22 : 16), parameters: ON_TOP, pickable: true }));
    }
    if (on.has('trafos') && paid) {
      if (zoom < ZOOM_TRAFOS && trafoRes?.municipios?.length) {
        layers.push(new ScatterplotLayer({
          id: 'trafo-muni', data: vis('trafo-muni', trafoRes.municipios.filter((d) => inDpto(d.code))), getPosition: (d) => [d.lon, d.lat], radiusUnits: 'pixels',
          getRadius: (d) => Math.min(24, 3 + Math.sqrt(d.n) / 5), getFillColor: (d) => [...espacioColor(d.espacio), 170], stroked: true, getLineColor: [255, 255, 255, 220], lineWidthUnits: 'pixels', getLineWidth: 1,
          parameters: ON_TOP, pickable: true, onClick: ({ object }) => { if (object && !st.current.tool) mapRef.current?.flyTo({ center: [object.lon, object.lat], zoom: ZOOM_TRAFOS + 1, speed: 1.6 }); },
        }));
      } else if (zoom >= ZOOM_TRAFOS && trafoRows.length) {
        const tr = [trafoMode, JSON.stringify(trafoW)];
        layers.push(new ScatterplotLayer({
          id: 'trafo', data: vis('trafo', trafoRows), getPosition: (d) => [d.lon, d.lat], radiusUnits: 'pixels', getRadius: (d) => Math.min(11, 3 + Math.sqrt(d.kva) / 3),
          getFillColor: (d) => (trafoMode === 'sem' ? [...SEM_COLOR[d.sem], 230] : [...colorAt(d.t), 235]), stroked: true, getLineColor: [16, 14, 42, 230], lineWidthUnits: 'pixels', getLineWidth: 1,
          parameters: ON_TOP, pickable: true, updateTriggers: { getFillColor: tr },
        }));
      }
    }
    // Departamento elegido: el resto del país queda oscurecido
    if (dptoFeat) {
      const polys = dptoFeat.geometry.type === 'Polygon' ? [dptoFeat.geometry.coordinates] : dptoFeat.geometry.coordinates;
      layers.push(new SolidPolygonLayer({ id: 'mask-dpto', data: [{ p: [[[-100, -25], [-40, -25], [-40, 30], [-100, 30], [-100, -25]], ...polys.map((p) => p[0])] }], getPolygon: (d) => d.p, getFillColor: [10, 9, 30, 205], pickable: false, parameters: ON_TOP }));
      layers.push(new PathLayer({ id: 'borde-dpto', data: polys.map((p) => ({ path: p[0] })), getPath: (d) => d.path, getColor: [255, 160, 70, 230], widthUnits: 'pixels', getWidth: 2, parameters: ON_TOP }));
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
      onClick: (info) => { if (st.current.tool === 'hide' && info.object && info.layer) toggleHidden(info.layer.id, info.object); },
      getTooltip: ({ object: d, layer }) => {
        if (tool) return null;
        if (!d || !layer) return null;
        let html;
        if (layer.id === 'lineas') html = `<b>${d.n}</b><br/>${d.kv}<br/><span style="color:#B3BCDA">${d.op}</span>`;
        else if (layer.id === 'subs') html = `<b>Subestación ${d.n}</b><br/>${d.kv}${d.desde ? ' · desde ' + d.desde : ''}<br/><span style="color:#B3BCDA">${d.op}</span>`;
        else if (layer.id === 'solar') html = `<b>${d.n}</b><br/>${fmt(d.mw, 1)} MW · ${d.estado}${d.kv ? ' · ' + d.kv + ' kV' : ''}<br/><span style="color:#B3BCDA">${d.op || ''}<br/>${d.mun || ''}, ${d.dpto || ''}</span>`;
        else if (layer.id === 'upme') html = `<b>${d.n}</b><br/>${fmt(d.mw, 1)} MW · ${d.tipo} · ${d.fase}<br/>${d.mun}, ${d.dpto}<br/><span style="color:#B3BCDA">Operación prevista ${d.operacion?.slice(0, 7) || 's/d'}</span>`;
        else if (layer.id === 'trafo') html = `<b>Transformador ${d.id}</b> · ${d.op}<br/>${fmt(d.kva, 1)} kVA · límite para autogeneración ${fmt(d.lim, 1)} kW<br/>${d.gd != null ? `Generación conectada: ${fmt(d.gd, 1)} kW<br/>` : ''}${d.disp != null ? `Disponible según el operador: ${fmt(d.disp, 1)} kW<br/>` : ''}Espacio estimado: <b>${fmt(d.libre, 1)} kW</b>${d.sem === 'sd' ? ' (máximo)' : ''}<br/>${d.us != null ? `${fmt(d.us)} usuarios conectados<br/>` : ''}${d.circ ? `Circuito ${d.circ}<br/>` : ''}Puntaje ${Math.round(d.score * 100)}/100<br/><span style="color:#B3BCDA">${SEM_TXT[d.sem]}. Demo indicativo.</span>`;
        else if (layer.id === 'trafo-muni') html = `<b>${d.name}</b> · ${d.dpto}<br/>${fmt(d.n)} transformadores · ${fmt(d.kva)} kVA<br/>${fmt(d.espacio * 100)} % con espacio para 3 kW o más<br/><span style="color:#B3BCDA">Clic para acercarte y verlos uno por uno</span>`;
        else if (layer.id === 'muni-poly') { const x = d.properties.item; html = `<b>${x.name}</b> · ${x.dpto}<br/>${showKey === 'score' ? `#${x.rank} · puntaje ${x.score}` : `${M.label}: <b>${M.f(M.get(x))}</b>`}<br/><span style="color:#B3BCDA">Clic para ver la ficha</span>`; }
        else if (layer.id === 'capacidad') html = `<b>${d.n}</b> · ${d.kv} kV<br/>Para conectar generación en 2026: <b>${fmt(d.p95_2026, 1)} MW</b> (95% de los escenarios)<br/>Seguro en todos los escenarios: ${fmt(d.p100_2026, 1)} MW · 2027: ${fmt(d.p95_2027, 1)} MW<br/><span style="color:#B3BCDA">Indicativo. ${d.op || ''}</span>`;
        else if (layer.id === 'colegios') html = `<b>${d.est}</b><br/>Sede ${d.n}<br/>${fmt(d.mat)} estudiantes · ${d.sec === 'O' ? 'oficial' : 'privado'} · ${d.z === 'R' ? 'rural' : 'urbano'}<br/><span style="color:#B3BCDA">Ubicación aproximada (~1 km)</span>`;
        else if (layer.id === 'salud') html = `<b>${d.name}</b> · ${d.dpto}<br/>${fmt(d.n)} sedes de salud · ${fmt(d.hosp)} hospitales o clínicas · ${fmt(d.pub)} públicas<br/><span style="color:#B3BCDA">Clic para ver la lista</span>`;
        else if (layer.id === 'zni') html = `<b>${d.n}</b> (no interconectada)<br/>${d.mpio}, ${d.dpto}<br/>${fmt(d.horas, 1)} horas de servicio al día<br/><span style="color:#B3BCDA">Dato de ${d.ultimo}</span>`;
        else if (!layer.id.startsWith('muni-')) return null;
        else if (dpto) html = `<b>${d.dpto}</b><br/>Puntaje departamental ${d.score}<br/><span style="color:#B3BCDA">${d.municipios} municipios · detalle en plan completo</span>`;
        else html = `<b>${d.name}</b> · ${d.dpto}<br/>${showKey === 'score' ? `#${d.rank} · puntaje ${d.score}` : `${M.label}: <b>${M.f(M.get(d))}</b>`}<br/><span style="color:#B3BCDA">Clic para ver la ficha</span>`;
        return { html: `<div class="maptip">${html}</div>`, style: { background: 'none', padding: 0 } };
      },
    });
  }, [scaled, data, showKey, is3d, go, on, red, mt, shapes, preview, draft, sel, pin, tool, salud, colegios, zoom, trafoRes, trafoRows, trafoMode, trafoW, limites, geoM, geoD, dptoFeat, hid]);

  const visibles = useMemo(() => {
    if (data?.mode !== 'municipio') return [];
    const all = vis('muni', data.items.filter((d) => inDpto(d.code))).sort((a, b) => a.rank - b.rank);
    if (!onlyVisible || !bounds) return all;
    const [w, s, e, n] = bounds;
    return all.filter((d) => d.lon >= w && d.lon <= e && d.lat >= s && d.lat <= n);
  }, [data, bounds, onlyVisible, dptoSel, hid]);
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
              {!searching && results?.length > 0 && <span className="small muted" style={{ padding: '6px 10px' }}>Enter: buscar también direcciones y lugares</span>}
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
            <Icon name="layers" size={16} />Capas{on.size ? ` (${on.size})` : ''}<span className="caret">▾</span>
          </button>
          {menu === 'layers' && (
            <div className="glass dd-menu layers" role="menu">
              {Object.entries(LAYERS).map(([k, l]) => (
                <label key={k} className={l.paid && !paid ? 'dis' : ''}>
                  <input type="checkbox" checked={on.has(k)} onChange={() => toggle(k)} />
                  {l.img ? <img src={l.img} alt="" width="22" height="22" /> : <span className="sw" style={{ background: l.swatch }} />}
                  <span>{l.label}{l.paid && !paid ? ' 🔒' : ''}{l.demo && <span className="soon-tag">Demo</span>}</span>
                </label>
              ))}
              {on.has('colegios') && paid && zoom < ZOOM_COLEGIOS && <span className="small muted">Acércate al mapa para ver los colegios.</span>}
              {on.has('colegios') && paid && zoom >= ZOOM_COLEGIOS && colegios?.total > colegios?.rows?.length && <span className="small muted">Se muestran los {fmt(colegios.rows.length)} colegios más grandes de {fmt(colegios.total)} en la vista.</span>}
              {on.has('capacidad') && <span className="small muted">Capacidad indicativa para conectar generación; verde = 10 MW o más, rojo = casi nada.</span>}
              {on.has('mt') && <span className="small muted">Media tensión: modelo estimado. No es la red oficial del operador.</span>}
              {on.has('mt') && paid && !mt && <span className="small muted">Cargando red estimada…</span>}
            </div>
          )}
        </div>
        <div className="dd">
          <button className={`btn sm glass ${menu === 'lim' ? 'on' : ''}`} onClick={() => setMenu(menu === 'lim' ? null : 'lim')} aria-expanded={menu === 'lim'}>
            <Icon name="polygon" size={16} />{dptoSel ? (dptoNames.find(([c]) => c === dptoSel)?.[1] || 'Departamento') : 'Límites'}<span className="caret">▾</span>
          </button>
          {menu === 'lim' && (
            <div className="glass dd-menu layers" role="menu">
              <b className="small">Mostrar límites</b>
              {[['ninguno', 'Ninguno'], ['dptos', 'Departamentos'], ['munis', 'Departamentos y municipios'], ['relleno', 'Municipios coloreados por el valor elegido']].map(([k, l]) => (
                <label key={k}><input type="radio" name="lim" checked={limites === k} onChange={() => setLimites(k)} /><span>{l}</span></label>
              ))}
              {limites === 'relleno' && <span className="small muted">Cada municipio se pinta con el valor de "Mostrar" (azul bajo, naranja alto) en vez de columnas.</span>}
              <b className="small" style={{ marginTop: 6 }}>Ver solo un departamento</b>
              <select className="select" value={dptoSel} onChange={(e) => { setDptoSel(e.target.value); if (e.target.value && limites === 'ninguno') setLimites('munis'); }} aria-label="Departamento">
                <option value="">Todo el país</option>
                {dptoNames.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
              {dptoSel && <button className="btn sm" onClick={() => setDptoSel('')}>Quitar filtro</button>}
            </div>
          )}
        </div>
        <div className="dd">
          <button className={`btn sm glass ${menu === 'dash' ? 'on' : ''}`} onClick={() => setMenu(menu === 'dash' ? null : 'dash')} aria-expanded={menu === 'dash'}>
            <Icon name="star" size={16} />{actual ? actual.name : 'Tableros'}<span className="caret">▾</span>
          </button>
          {menu === 'dash' && (
            <div className="glass dd-menu layers dash-menu" role="menu">
              <span className="small muted">Guarda cómo dejaste el mapa: vista, capas, departamento, dibujos, puntos agregados y ocultos.</span>
              {actual && <button className="btn sm primary" onClick={() => guardarTablero(false)}><Icon name="check" size={14} />Guardar cambios en "{actual.name}"</button>}
              <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                <input className="input" value={nombreT} onChange={(e) => setNombreT(e.target.value)} placeholder="Nombre del tablero nuevo" aria-label="Nombre del tablero" style={{ minHeight: 34 }} onKeyDown={(e) => { if (e.key === 'Enter') guardarTablero(true); }} />
                <button className="btn sm" onClick={() => guardarTablero(true)}>Guardar</button>
              </div>
              {tableros.length > 0 && <b className="small" style={{ marginTop: 4 }}>Mis tableros</b>}
              {tableros.map((t) => (
                <div key={t.id} className={`dash-item ${actual?.id === t.id ? 'on' : ''}`}>
                  <button onClick={() => abrirTablero(t)}><b>{t.name}</b><br /><span className="small muted">{t.fecha} · {t.on?.length || 0} capas{t.hidden?.length ? ` · ${t.hidden.length} ocultos` : ''}{t.shapes?.length ? ` · ${t.shapes.length} dibujos` : ''}</span></button>
                  <button className="icon-btn" onClick={() => borrarTablero(t.id)} title="Eliminar tablero" aria-label={`Eliminar ${t.name}`}><Icon name="trash" size={15} /></button>
                </div>
              ))}
              <div className="row" style={{ gap: 6, marginTop: 4 }}>
                {tableros.length > 0 && <button className="btn sm ghost" onClick={exportar}>Exportar</button>}
                <label className="btn sm ghost" style={{ cursor: 'pointer' }}>Importar<input type="file" accept="application/json" hidden onChange={(e) => { if (e.target.files[0]) importar(e.target.files[0]); e.target.value = ''; }} /></label>
                {actual && <button className="btn sm ghost" onClick={() => setActual(null)}>Cerrar tablero</button>}
              </div>
              <span className="small muted">Se guardan en este navegador. Usa Exportar para pasarlos a otro equipo.</span>
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
        {hidden.length > 0 && <button onClick={() => setHidden([])} title={`Mostrar los ${hidden.length} puntos ocultos`} aria-label="Mostrar puntos ocultos" className="hid-count"><Icon name="eye" size={18} /><span>{hidden.length}</span></button>}
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
            <span className="small muted">{selInfo.solar} plantas solares ({fmt(selInfo.solarMw)} MW) · {selInfo.subs} subestaciones · {selInfo.upme} proyectos registrados</span>
            {selInfo.top.length > 0 && <div className="draw-top">{selInfo.top.map((d) => <button key={d.code} onClick={() => go('m', d.code)}><span>{d.name}</span><ScoreBadge score={d.score} tier={d.tier} /></button>)}</div>}
          </>)}
          {selInfo?.subsCerca?.length > 0 && (
            <div className="site-eval">
              <b className="small">Red eléctrica cercana</b>
              {selInfo.subsCerca.map((x) => <span key={x.n} className="small">{x.n} · {x.kv} · <span className="mono">{fmt(x.km, 1)} km</span></span>)}
              {selInfo.linea && <span className="small muted">Línea de transmisión más cercana: {selInfo.linea.kv} a <span className="mono">{fmt(selInfo.linea.km, 1)} km</span></span>}
              {selInfo.ref && <span className="small muted">Radiación {fmt(selInfo.ref.ghi, 2)} kWh/m²/día · tarifa comercial {fmt(selInfo.ref.tarifa_com ?? selInfo.ref.tarifa)} $/kWh · {selInfo.solar10} plantas solares a 10 km</span>}
              <span className="small muted">No incluye pendiente, uso del suelo, áreas protegidas ni capacidad del transformador: verifícalo antes de comprometerte.</span>
            </div>
          )}
          {selInfo?.ref && paid && (
            <div className="row" style={{ gap: 6 }}>
              <button className="btn sm primary" onClick={() => { writeLocal('rs_zona_informe', { tipo: selShape.type, ring: ringOf(selShape) || null, punto: selShape.type === 'point' ? selShape.pts[0] : null, medida: selInfo.medida, texto: selShape.text || '', munis: selInfo.munis || 0, pop: selInfo.pop || 0, top: (selInfo.top || []).map((d) => ({ code: d.code, name: d.name, dpto: d.dpto, score: d.score, tier: d.tier, pop: d.pop, tarifa: d.tarifa, ghi: d.ghi })), solar: selInfo.solar || 0, solarMw: selInfo.solarMw || 0, subs: selInfo.subs || 0, upme: selInfo.upme || 0, subsCerca: selInfo.subsCerca.map((x) => ({ n: x.n, kv: x.kv, op: x.op, km: x.km })), linea: selInfo.linea, solar10: selInfo.solar10, ref: { code: selInfo.ref.code, name: selInfo.ref.name, dpto: selInfo.ref.dpto, ghi: selInfo.ref.ghi, tarifa: selInfo.ref.tarifa, tarifa_com: selInfo.ref.tarifa_com, score: selInfo.ref.score, tier: selInfo.ref.tier }, centro: selInfo.centro, fecha: new Date().toISOString().slice(0, 10) }); go('propuesta', 'zona'); }}><Icon name="pdf" size={14} />Informe PDF de esta zona</button>
              <button className="btn sm" onClick={() => go('m', selInfo.ref.code)}>Ficha de {selInfo.ref.name}</button>
            </div>
          )}
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

      {on.has('trafos') && paid && (
        <div className="trafo-panel glass">
          <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
            <b className="small">Transformadores <span className="soon-tag">Demo</span></b>
            <button className="icon-btn" onClick={() => setSoon(true)} title="Qué es este demo" aria-label="Qué es este demo">?</button>
          </div>
          {zoom < ZOOM_TRAFOS
            ? <span className="small muted">{trafoRes ? `${fmt(trafoRes.total)} transformadores en ${fmt(trafoRes.municipios.length)} municipios (${trafoRes.operadores.map((o) => o.nombre).join(', ')}). Haz clic en un círculo o acércate para verlos uno por uno.` : 'Cargando…'}</span>
            : <span className="small muted">{trafoPts?.total != null ? `${fmt(trafoRows.length)} en la vista${trafoPts.total > trafoPts.rows.length ? ` (los ${fmt(trafoPts.rows.length)} más grandes de ${fmt(trafoPts.total)})` : ''}` : 'Cargando…'}{trafoPts?.total === 0 ? '. Aquí aún no hay datos del operador.' : ''}</span>}
          <div className="seg" role="group" aria-label="Color de los transformadores">
            <button className={trafoMode === 'sem' ? 'on' : ''} onClick={() => setTrafoMode('sem')}>Disponibilidad</button>
            <button className={trafoMode === 'score' ? 'on' : ''} onClick={() => setTrafoMode('score')}>Puntaje con pesos</button>
          </div>
          {trafoMode === 'sem' ? (
            <div className="sem-legend">{Object.keys(SEM_COLOR).map((k) => <span key={k} className="small"><span className="cap-dot" style={{ background: `rgb(${SEM_COLOR[k].join(',')})` }} />{SEM_TXT[k]}</span>)}</div>
          ) : (
            <div className="trafo-w">
              {Object.entries(TRAFO_F).map(([k, l]) => (
                <label key={k} className="small"><span>{l}</span><input type="range" min="0" max="100" step="5" value={trafoW[k]} onChange={(e) => setTrafoW({ ...trafoW, [k]: +e.target.value })} /><span className="mono">{trafoW[k]}</span></label>
              ))}
              <span className="small muted">Naranja = mejores de la vista para ofrecer un sistema solar; azul = los de menos oportunidad.</span>
              <button className="btn sm ghost" onClick={() => setTrafoW(TRAFO_W0)}>Pesos por defecto</button>
            </div>
          )}
        </div>
      )}
      {soon && (
        <div className="modal-bg" onClick={() => setSoon(false)}>
          <div className="card soon-card" onClick={(e) => e.stopPropagation()}>
            <span className="soon-tag">Demo</span>
            <h3>Transformadores de distribución</h3>
            <p className="small">Cada operador de red debe publicar sus transformadores con la capacidad disponible para autogeneración (Resolución CREG 174 de 2021). Por ahora tenemos la base de {(trafoRes?.operadores || []).map((o) => o.nombre).join(', ') || 'algunos operadores'}; el resto del país viene en camino.</p>
            <p className="small">El espacio para un sistema solar se estima con la regla del 50 %: un transformador admite autogeneración hasta la mitad de su capacidad nominal, menos lo que ya está conectado. Donde el operador publica su propio valor disponible, se usa ese.</p>
            <p className="small muted">Es una guía para priorizar visitas. La disponibilidad real la confirma el operador cuando se radica la solicitud.</p>
            <button className="btn sm" onClick={() => setSoon(false)}>Entendido</button>
          </div>
        </div>
      )}
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
