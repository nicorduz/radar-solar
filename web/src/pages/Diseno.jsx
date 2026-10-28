import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { api, fmt, money, cop } from '../api.js';
import { useApp } from '../App.jsx';
import { Icon } from '../components/Icon.jsx';
import { Stat } from '../components/ui.jsx';
import MapSnapshot, { satStyle, addShapes } from '../components/MapSnapshot.jsx';
import { PANELES, BATERIAS, MARCAS_PANEL, MARCAS_BATERIA, POTENCIAS_PANEL, medidaTipica, CAPACIDADES_BAT } from '../components/equipos.js';
import ReporteSolar from '../components/ReporteSolar.jsx';
import { useBranding } from '../branding.js';
import { fillPanels, autoAngle, polyArea, balance, roi } from '../components/solarDesign.js';
import { parseCoords, geocode } from '../components/mapTools.js';
import { useLocal, readLocal, writeLocal, addProspect } from '../local.js';

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const AZ = [[0, 'Sur'], [-45, 'Sureste'], [45, 'Suroeste'], [-90, 'Este'], [90, 'Oeste'], [180, 'Norte']];
const NUEVO = (capex) => ({
  id: null, cliente: '', direccion: '', tipo: 'hogar', pts: [], cerrado: false, altura: 6, setback: 0.6, orient: 'vertical', angleAuto: true, angle: 0, rowGap: 0.3,
  panelId: 'gen-550', tilt: 10, azimuth: 0, ajustar: true, cobertura: 100, consumoModo: 'kwh', consumoMes: 600, factura: '', tarifa: '', precioExc: '',
  diaFrac: 35, batId: '', batN: 1, cargaCritica: 1.5, costoWp: Math.round((capex || 3800000) / 1000), costoBatKwh: 2500000, incr: 4,
});

// Pestaña Diseño: techo en imagen satelital, llenado de paneles, generación, baterías, retorno y reporte en PDF
export default function Diseno() {
  const { cfg, meta, paid, user, go } = useApp();
  const marca = useBranding(user);
  const [d, setD] = useState(() => ({ ...NUEVO(meta.capex_kwp), ...readLocal('rs_diseno_actual', {}) }));
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const [misPaneles, setMisPaneles] = useLocal('rs_paneles', []);
  const [misBaterias, setMisBaterias] = useLocal('rs_baterias', []);
  const [disenos, setDisenos] = useLocal('rs_disenos', []);
  const [draw, setDraw] = useState(false);
  const [is3d, setIs3d] = useState(false);
  const [solar, setSolar] = useState(null);
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [nuevoPanel, setNuevoPanel] = useState(null);
  const [nuevaBat, setNuevaBat] = useState(null);
  const [reporte, setReporte] = useState(false);
  const [msg, setMsg] = useState(null);
  const el = useRef(null), mapRef = useRef(null), st = useRef({});
  st.current = { draw, d };

  useEffect(() => { writeLocal('rs_diseno_actual', d); }, [d]);
  const paneles = [...PANELES, ...misPaneles];
  const baterias = [...BATERIAS, ...misBaterias];
  const panel = paneles.find((p) => p.id === d.panelId) || PANELES[2];
  const bat = baterias.find((b) => b.id === d.batId);

  // ---- Mapa satelital ----
  useEffect(() => {
    const c = d.pts.length ? d.pts[0] : [-74.08, 4.65];
    const map = new maplibregl.Map({ container: el.current, style: satStyle(cfg.sat), center: c, zoom: d.pts.length ? 19 : 12, maxZoom: 20.5, maxPitch: 70 });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('load', () => {
      map.addSource('techo', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('paneles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addSource('borrador', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'techo-3d', type: 'fill-extrusion', source: 'techo', paint: { 'fill-extrusion-color': '#C9CED9', 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.35 } });
      map.addLayer({ id: 'techo-line', type: 'line', source: 'techo', paint: { 'line-color': '#FFB266', 'line-width': 2.5 } });
      map.addLayer({ id: 'paneles-3d', type: 'fill-extrusion', source: 'paneles', paint: { 'fill-extrusion-color': '#0B2A6B', 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.95 } });
      map.addLayer({ id: 'paneles-line', type: 'line', source: 'paneles', paint: { 'line-color': '#A8C5FF', 'line-width': 0.7 } });
      map.addLayer({ id: 'borrador-line', type: 'line', source: 'borrador', paint: { 'line-color': '#FF7A00', 'line-width': 2, 'line-dasharray': [2, 1] } });
      map.addLayer({ id: 'borrador-pt', type: 'circle', source: 'borrador', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#FFFFFF', 'circle-stroke-color': '#FF7A00', 'circle-stroke-width': 2 } });
      map.fire('rs-ready');
      setRes((r) => (r ? { ...r } : r));
    });
    map.on('click', (e) => {
      if (!st.current.draw) return;
      setD((x) => ({ ...x, pts: [...(x.cerrado ? [] : x.pts), [e.lngLat.lng, e.lngLat.lat]], cerrado: false }));
    });
    map.on('dblclick', (e) => { if (st.current.draw) { e.preventDefault(); cerrar(); } });
    return () => map.remove();
  }, []);
  useEffect(() => { const m = mapRef.current; if (!m) return; if (draw) { m.doubleClickZoom.disable(); m.getCanvas().style.cursor = 'crosshair'; } else { m.doubleClickZoom.enable(); m.getCanvas().style.cursor = ''; } }, [draw]);
  const cerrar = () => { setDraw(false); setD((x) => (x.pts.length >= 3 ? { ...x, cerrado: true } : x)); };

  // ---- Paneles ----
  const angle = d.angleAuto && d.pts.length >= 3 ? autoAngle(d.pts) : +d.angle || 0;
  const encajan = useMemo(() => (d.cerrado ? fillPanels(d.pts, { largo: panel.largo, ancho: panel.ancho, orient: d.orient, setback: +d.setback || 0, rowGap: +d.rowGap || 0, angle }) : []), [d.cerrado, d.pts, panel.id, d.orient, d.setback, d.rowGap, angle]);
  const area = d.pts.length >= 3 ? polyArea(d.pts) : 0;

  // ---- Recurso solar del sitio ----
  const centro = d.pts.length ? [d.pts.reduce((a, p) => a + p[0], 0) / d.pts.length, d.pts.reduce((a, p) => a + p[1], 0) / d.pts.length] : null;
  useEffect(() => {
    if (!d.cerrado || !centro) return;
    setSolar(null);
    api(`/solar?lat=${centro[1].toFixed(5)}&lon=${centro[0].toFixed(5)}&angle=${d.tilt}&aspect=${d.azimuth}`).then((s) => {
      setSolar(s);
      setD((x) => ({ ...x, tarifa: x.tarifa || Math.round((x.tipo === 'empresa' ? s.muni?.tarifa_com : s.muni?.tarifa) || 800), precioExc: x.precioExc || Math.round(((x.tipo === 'empresa' ? s.muni?.tarifa_com : s.muni?.tarifa) || 800) * 0.4) }));
    }).catch((e) => setMsg(e.message));
  }, [d.cerrado, centro?.[0].toFixed(4), centro?.[1].toFixed(4), d.tilt, d.azimuth]);

  // ---- Cálculos ----
  const tarifa = +d.tarifa || 800;
  const consumoMes = d.consumoModo === 'factura' ? (+d.factura || 0) / tarifa : +d.consumoMes || 0;
  const consumo = Array(12).fill(consumoMes);
  const kwhKwp = solar?.anual || 0;
  const necesarios = kwhKwp ? Math.ceil(((consumoMes * 12 * (d.cobertura / 100)) / kwhKwp) / (panel.w / 1000)) : encajan.length;
  const n = d.ajustar ? Math.min(encajan.length, necesarios) : encajan.length;
  const usados = encajan.slice(0, n);
  const kwp = (n * panel.w) / 1000;
  const gen = (solar?.mensual || Array(12).fill(0)).map((x) => x * kwp);
  const genAnual = gen.reduce((a, b) => a + b, 0);
  const costoPV = kwp * 1000 * (+d.costoWp || 0);
  const batKwh = bat ? bat.kwh * (+d.batN || 1) : 0;
  const costoBat = batKwh * (+d.costoBatKwh || 0);
  const precioExc = +d.precioExc || tarifa * 0.4;
  const diaFrac = (+d.diaFrac || 35) / 100;
  const sinBat = useMemo(() => { const m = balance({ consumo, gen, diaFrac }); return { m, r: roi({ costo: costoPV, mensual: m, tarifa, precioExc, incr: +d.incr }) }; }, [JSON.stringify(gen), consumoMes, diaFrac, tarifa, precioExc, costoPV, d.incr]);
  const conBat = useMemo(() => { if (!bat) return null; const m = balance({ consumo, gen, diaFrac, bat: { ...bat, n: +d.batN || 1 } }); return { m, r: roi({ costo: costoPV + costoBat, mensual: m, tarifa, precioExc, incr: +d.incr, reemplazo: costoBat * 0.6, anioReemplazo: 12 }) }; }, [JSON.stringify(gen), consumoMes, diaFrac, tarifa, precioExc, costoPV, costoBat, bat?.id, d.batN, d.incr]);
  const respaldoH = bat ? (batKwh * bat.dod) / (+d.cargaCritica || 1) : 0;
  const inversor = kwp ? Math.max(1, Math.round((kwp / 1.15) * 10) / 10) : 0;
  const compensa = consumoMes ? (genAnual / (consumoMes * 12)) * 100 : 0;

  // ---- Dibujo en el mapa ----
  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    const upd = () => {
      if (!m.getSource('techo')) return;
      const h = +d.altura || 0;
      m.getSource('techo').setData({ type: 'FeatureCollection', features: d.cerrado ? [{ type: 'Feature', properties: { h }, geometry: { type: 'Polygon', coordinates: [[...d.pts, d.pts[0]]] } }] : [] });
      m.getSource('paneles').setData({ type: 'FeatureCollection', features: usados.map((r) => ({ type: 'Feature', properties: { b: h + 0.05, h: h + 0.25 }, geometry: { type: 'Polygon', coordinates: [r] } })) });
      m.getSource('borrador').setData({ type: 'FeatureCollection', features: d.cerrado ? [] : [...d.pts.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } })), ...(d.pts.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: d.pts } }] : [])] });
    };
    if (m.isStyleLoaded() && m.getSource('techo')) upd(); else m.once('rs-ready', upd);
  }, [d.pts, d.cerrado, d.altura, usados.length, encajan]);
  const set3d = (v) => { setIs3d(v); mapRef.current?.easeTo({ pitch: v ? 55 : 0, bearing: v ? -20 : 0, duration: 700 }); };

  const buscar = async (e) => {
    e.preventDefault();
    const c = parseCoords(q);
    if (c) { mapRef.current.flyTo({ center: c, zoom: 19 }); return; }
    const r = await geocode(q).catch(() => []);
    if (r[0]) { mapRef.current.flyTo({ center: r[0].pos, zoom: Math.max(18, r[0].zoom) }); if (!d.direccion) set('direccion', r[0].label); }
    else setMsg('No se encontró esa dirección. Prueba con coordenadas (lat, lon).');
  };
  const guardar = () => {
    const id = d.id || Math.random().toString(36).slice(2, 9);
    const item = { ...d, id, fecha: new Date().toISOString().slice(0, 10), kwp, n };
    setD(item);
    setDisenos((l) => [item, ...l.filter((x) => x.id !== id)].slice(0, 50));
    setMsg('Diseño guardado en este navegador.');
  };
  const nuevo = () => { setD(NUEVO(meta.capex_kwp)); setSolar(null); setReporte(false); };

  const fcReporte = { type: 'FeatureCollection', features: d.cerrado ? [{ type: 'Feature', properties: { k: 'zona' }, geometry: { type: 'Polygon', coordinates: [[...d.pts, d.pts[0]]] } }, ...usados.map((r) => ({ type: 'Feature', properties: { k: 'panel' }, geometry: { type: 'Polygon', coordinates: [r] } }))] : [] };
  const listo = d.cerrado && solar && n > 0 && consumoMes > 0;

  return (
    <div className="page diseno-page" style={{ maxWidth: 1400 }}>
      <div className="page-head no-print">
        <div><h1>Diseño solar</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Dibuja el techo sobre la imagen satelital, llena los paneles, compara con y sin baterías y genera la propuesta en PDF para tu cliente.</p></div>
        <div className="row" style={{ gap: 6 }}>
          {disenos.length > 0 && <select className="select" style={{ maxWidth: 240 }} value="" onChange={(e) => { const x = disenos.find((y) => y.id === e.target.value); if (x) { setD({ ...NUEVO(meta.capex_kwp), ...x }); setReporte(false); if (x.pts[0]) mapRef.current?.flyTo({ center: x.pts[0], zoom: 19 }); } }} aria-label="Abrir diseño guardado"><option value="">Abrir diseño guardado…</option>{disenos.map((x) => <option key={x.id} value={x.id}>{x.cliente || 'Sin nombre'} · {fmt(x.kwp, 1)} kWp · {x.fecha}</option>)}</select>}
          <button className="btn sm" onClick={nuevo}><Icon name="plus" size={14} />Nuevo</button>
          <button className="btn sm" onClick={guardar}><Icon name="check" size={14} />Guardar</button>
          <button className="btn sm primary" disabled={!listo} onClick={() => setReporte(true)}><Icon name="pdf" size={14} />Reporte PDF</button>
        </div>
      </div>
      {msg && <div className="alert no-print" onClick={() => setMsg(null)}>{msg}</div>}
      {!paid && <div className="alert no-print small">Versión de prueba: puedes diseñar y descargar el reporte con marca de agua. El plan completo lo quita.</div>}

      {!reporte && (
        <div className="dz">
          <div className="dz-map card">
            <form className="dz-search" onSubmit={buscar}><Icon name="search" size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Dirección del cliente o coordenadas (lat, lon)" aria-label="Buscar dirección" /><button className="btn sm">Ir</button></form>
            <div className="dz-tools">
              <button className={`btn sm ${draw ? 'primary' : ''}`} onClick={() => { if (draw) cerrar(); else { setDraw(true); if (d.cerrado) setD((x) => ({ ...x, pts: [], cerrado: false })); } }}><Icon name="polygon" size={15} />{draw ? 'Cerrar techo' : d.cerrado ? 'Dibujar de nuevo' : 'Dibujar techo'}</button>
              {draw && d.pts.length > 0 && <button className="btn sm" onClick={() => set('pts', d.pts.slice(0, -1))}>Deshacer punto</button>}
              <div className="seg"><button className={!is3d ? 'on' : ''} onClick={() => set3d(false)}>2D</button><button className={is3d ? 'on' : ''} onClick={() => set3d(true)}>3D</button></div>
            </div>
            {draw && <div className="dz-hint small">Haz clic en cada esquina del techo. Doble clic o "Cerrar techo" para terminar.</div>}
            <div ref={el} className="dz-canvas" />
          </div>

          <div className="dz-side">
            <div className="card dz-sec">
              <h3>1 · Cliente y techo</h3>
              <div className="grid dz-g">
                <label className="f">Cliente<input className="input" value={d.cliente} onChange={(e) => set('cliente', e.target.value)} placeholder="Nombre o empresa" /></label>
                <label className="f">Tipo<select className="select" value={d.tipo} onChange={(e) => setD((x) => ({ ...x, tipo: e.target.value, diaFrac: e.target.value === 'empresa' ? 65 : 35, tarifa: '', precioExc: '' }))}><option value="hogar">Hogar</option><option value="empresa">Empresa o negocio</option></select></label>
              </div>
              <label className="f">Dirección<input className="input" value={d.direccion} onChange={(e) => set('direccion', e.target.value)} /></label>
              <div className="grid dz-g">
                <label className="f">Altura del techo (m)<input className="input mono" type="number" min="0" max="200" value={d.altura} onChange={(e) => set('altura', e.target.value)} /></label>
                <label className="f">Retiro del borde (m)<input className="input mono" type="number" min="0" max="5" step="0.1" value={d.setback} onChange={(e) => set('setback', e.target.value)} /></label>
              </div>
              <span className="small muted">{d.cerrado ? `Área del techo ${fmt(area)} m² · caben ${fmt(encajan.length)} paneles` : 'Dibuja el techo en el mapa para empezar.'}</span>
            </div>

            <div className="card dz-sec">
              <h3>2 · Paneles</h3>
              <label className="f">Panel<select className="select" value={d.panelId} onChange={(e) => set('panelId', e.target.value)}>{[...new Set(paneles.map((p) => p.marca))].map((mk) => <optgroup key={mk} label={mk === 'Genérico' ? 'Genéricos' : mk}>{paneles.filter((p) => p.marca === mk).map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.largo}×{p.ancho} mm</option>)}</optgroup>)}</select></label>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn sm ghost" onClick={() => setNuevoPanel({ nombre: '', marca: 'Genérico', otra: '', w: 550, largo: 2279, ancho: 1134, garantia: 25 })}><Icon name="plus" size={14} />Crear panel</button>
                {misPaneles.some((p) => p.id === d.panelId) && <button className="btn sm ghost" onClick={() => { setMisPaneles(misPaneles.filter((p) => p.id !== d.panelId)); set('panelId', 'gen-550'); }}><Icon name="trash" size={14} />Borrar este panel</button>}
              </div>
              {nuevoPanel && (
                <form className="dz-new" onSubmit={(e) => { e.preventDefault(); const id = 'mio-' + Date.now().toString(36); const marca = nuevoPanel.marca === 'Otra' ? (nuevoPanel.otra.trim() || 'Otra marca') : nuevoPanel.marca; setMisPaneles([...misPaneles, { id, marca, nombre: nuevoPanel.nombre.trim() || `${marca === 'Genérico' ? 'Panel' : marca} ${nuevoPanel.w} W`, w: +nuevoPanel.w, largo: +nuevoPanel.largo, ancho: +nuevoPanel.ancho, garantia: +nuevoPanel.garantia }]); set('panelId', id); setNuevoPanel(null); }}>
                  <div className="grid dz-g">
                    <label className="f">Marca<select className="select" value={nuevoPanel.marca} onChange={(e) => setNuevoPanel({ ...nuevoPanel, marca: e.target.value })}>{[...MARCAS_PANEL, 'Otra'].map((m) => <option key={m}>{m}</option>)}</select></label>
                    {nuevoPanel.marca === 'Otra' && <label className="f">¿Cuál marca?<input className="input" required value={nuevoPanel.otra} onChange={(e) => setNuevoPanel({ ...nuevoPanel, otra: e.target.value })} /></label>}
                    <label className="f">Potencia (W)<select className="select" value={POTENCIAS_PANEL.includes(+nuevoPanel.w) ? nuevoPanel.w : 'otra'} onChange={(e) => { const w = e.target.value === 'otra' ? nuevoPanel.w : +e.target.value; const [largo, ancho] = medidaTipica(w); setNuevoPanel({ ...nuevoPanel, w, largo, ancho }); }}>{POTENCIAS_PANEL.map((w) => <option key={w} value={w}>{w} W</option>)}<option value="otra">Otra…</option></select></label>
                    {!POTENCIAS_PANEL.includes(+nuevoPanel.w) && <label className="f">Potencia exacta (W)<input className="input mono" type="number" min="50" required value={nuevoPanel.w} onChange={(e) => setNuevoPanel({ ...nuevoPanel, w: e.target.value })} /></label>}
                    <label className="f">Modelo (opcional)<input className="input" value={nuevoPanel.nombre} placeholder={`${nuevoPanel.marca === 'Otra' ? nuevoPanel.otra || 'Marca' : nuevoPanel.marca === 'Genérico' ? 'Panel' : nuevoPanel.marca} ${nuevoPanel.w} W`} onChange={(e) => setNuevoPanel({ ...nuevoPanel, nombre: e.target.value })} /></label>
                    <label className="f">Garantía (años)<input className="input mono" type="number" min="1" value={nuevoPanel.garantia} onChange={(e) => setNuevoPanel({ ...nuevoPanel, garantia: e.target.value })} /></label>
                    <label className="f">Largo (mm)<input className="input mono" type="number" min="300" required value={nuevoPanel.largo} onChange={(e) => setNuevoPanel({ ...nuevoPanel, largo: e.target.value })} /></label>
                    <label className="f">Ancho (mm)<input className="input mono" type="number" min="300" required value={nuevoPanel.ancho} onChange={(e) => setNuevoPanel({ ...nuevoPanel, ancho: e.target.value })} /></label>
                  </div>
                  <div className="row"><button className="btn sm primary">Guardar panel</button><button type="button" className="btn sm ghost" onClick={() => setNuevoPanel(null)}>Cancelar</button></div>
                </form>
              )}
              <div className="grid dz-g">
                <label className="f">Posición<select className="select" value={d.orient} onChange={(e) => set('orient', e.target.value)}><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></select></label>
                <label className="f">Separación entre filas (m)<input className="input mono" type="number" min="0" max="5" step="0.1" value={d.rowGap} onChange={(e) => set('rowGap', e.target.value)} /></label>
                <label className="f">Inclinación (°)<input className="input mono" type="number" min="0" max="60" value={d.tilt} onChange={(e) => set('tilt', +e.target.value)} /></label>
                <label className="f">Orientación<select className="select" value={d.azimuth} onChange={(e) => set('azimuth', +e.target.value)}>{AZ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              </div>
              <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={d.angleAuto} onChange={(e) => set('angleAuto', e.target.checked)} />Alinear filas con el lado más largo del techo</label>
              {!d.angleAuto && <label className="f">Giro de las filas (°)<input type="range" min="-90" max="90" value={d.angle} onChange={(e) => set('angle', +e.target.value)} /></label>}
              <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={d.ajustar} onChange={(e) => set('ajustar', e.target.checked)} />Ajustar al consumo del cliente</label>
              {d.ajustar && <label className="f">Cubrir el {d.cobertura} % del consumo<input type="range" min="30" max="150" step="5" value={d.cobertura} onChange={(e) => set('cobertura', +e.target.value)} /></label>}
            </div>

            <div className="card dz-sec">
              <h3>3 · Consumo y tarifa</h3>
              <div className="seg">{[['kwh', 'kWh al mes'], ['factura', 'Factura mensual']].map(([k, l]) => <button key={k} className={d.consumoModo === k ? 'on' : ''} onClick={() => set('consumoModo', k)}>{l}</button>)}</div>
              <div className="grid dz-g">
                {d.consumoModo === 'kwh'
                  ? <label className="f">Consumo (kWh/mes)<input className="input mono" type="number" min="0" value={d.consumoMes} onChange={(e) => set('consumoMes', e.target.value)} /></label>
                  : <label className="f">Factura (COP/mes)<input className="input mono" type="number" min="0" value={d.factura} onChange={(e) => set('factura', e.target.value)} /></label>}
                <label className="f">Tarifa ($/kWh)<input className="input mono" type="number" min="0" value={d.tarifa} onChange={(e) => set('tarifa', e.target.value)} /></label>
                <label className="f">Excedentes ($/kWh)<input className="input mono" type="number" min="0" value={d.precioExc} onChange={(e) => set('precioExc', e.target.value)} /></label>
                <label className="f">Consumo de día (%)<input className="input mono" type="number" min="0" max="100" value={d.diaFrac} onChange={(e) => set('diaFrac', e.target.value)} /></label>
              </div>
              {solar?.muni && <span className="small muted">Tarifa de referencia de {solar.muni.name} ({solar.muni.or}): residencial {fmt(solar.muni.tarifa)} · comercial {fmt(solar.muni.tarifa_com)} $/kWh.</span>}
            </div>

            <div className="card dz-sec">
              <h3>4 · Baterías (opcional)</h3>
              <label className="f">Batería<select className="select" value={d.batId} onChange={(e) => set('batId', e.target.value)}><option value="">Sin batería</option>{[...new Set(baterias.map((b) => b.marca))].map((mk) => <optgroup key={mk} label={mk === 'Genérico' ? 'Genéricas' : mk}>{baterias.filter((b) => b.marca === mk).map((b) => <option key={b.id} value={b.id}>{b.nombre} · {fmt(b.kwh, 1)} kWh</option>)}</optgroup>)}</select></label>
              <div className="row" style={{ gap: 6 }}>{misBaterias.some((b) => b.id === d.batId) && <button className="btn sm ghost" onClick={() => { setMisBaterias(misBaterias.filter((b) => b.id !== d.batId)); set('batId', ''); }}><Icon name="trash" size={14} />Borrar esta batería</button>}<button className="btn sm ghost" onClick={() => setNuevaBat({ marca: 'Genérico', otra: '', nombre: '', kwh: 10, dod: 90, kw: 5 })}><Icon name="plus" size={14} />Crear batería</button></div>
              {nuevaBat && (
                <form className="dz-new" onSubmit={(e) => { e.preventDefault(); const id = 'mia-' + Date.now().toString(36); const marca = nuevaBat.marca === 'Otra' ? (nuevaBat.otra.trim() || 'Otra marca') : nuevaBat.marca; setMisBaterias([...misBaterias, { id, marca, nombre: nuevaBat.nombre.trim() || `${marca === 'Genérico' ? 'Litio' : marca} ${nuevaBat.kwh} kWh`, kwh: +nuevaBat.kwh, dod: +nuevaBat.dod / 100, kw: +nuevaBat.kwh / 2 }]); set('batId', id); setNuevaBat(null); }}>
                  <div className="grid dz-g">
                    <label className="f">Marca<select className="select" value={nuevaBat.marca} onChange={(e) => setNuevaBat({ ...nuevaBat, marca: e.target.value })}>{[...MARCAS_BATERIA, 'Otra'].map((m) => <option key={m}>{m}</option>)}</select></label>
                    {nuevaBat.marca === 'Otra' && <label className="f">¿Cuál marca?<input className="input" required value={nuevaBat.otra} onChange={(e) => setNuevaBat({ ...nuevaBat, otra: e.target.value })} /></label>}
                    <label className="f">Capacidad<select className="select" value={CAPACIDADES_BAT.includes(+nuevaBat.kwh) ? nuevaBat.kwh : 'otra'} onChange={(e) => setNuevaBat({ ...nuevaBat, kwh: e.target.value === 'otra' ? '' : +e.target.value })}>{CAPACIDADES_BAT.map((k) => <option key={k} value={k}>{fmt(k, 2)} kWh</option>)}<option value="otra">Otra…</option></select></label>
                    {!CAPACIDADES_BAT.includes(+nuevaBat.kwh) && <label className="f">Capacidad exacta (kWh)<input className="input mono" type="number" min="0.5" step="0.1" required value={nuevaBat.kwh} onChange={(e) => setNuevaBat({ ...nuevaBat, kwh: e.target.value })} /></label>}
                    <label className="f">Modelo (opcional)<input className="input" value={nuevaBat.nombre} placeholder={`${nuevaBat.marca === 'Otra' ? nuevaBat.otra || 'Marca' : nuevaBat.marca === 'Genérico' ? 'Litio' : nuevaBat.marca} ${nuevaBat.kwh || ''} kWh`} onChange={(e) => setNuevaBat({ ...nuevaBat, nombre: e.target.value })} /></label>
                    <label className="f">Descarga útil (%)<input className="input mono" type="number" min="50" max="100" value={nuevaBat.dod} onChange={(e) => setNuevaBat({ ...nuevaBat, dod: e.target.value })} /></label>
                  </div>
                  <div className="row"><button className="btn sm primary">Guardar batería</button><button type="button" className="btn sm ghost" onClick={() => setNuevaBat(null)}>Cancelar</button></div>
                </form>
              )}
              {bat && <div className="grid dz-g">
                <label className="f">Cantidad<input className="input mono" type="number" min="1" max="50" value={d.batN} onChange={(e) => set('batN', e.target.value)} /></label>
                <label className="f">Carga crítica (kW)<input className="input mono" type="number" min="0.1" step="0.1" value={d.cargaCritica} onChange={(e) => set('cargaCritica', e.target.value)} /></label>
              </div>}
            </div>

            <div className="card dz-sec">
              <h3>5 · Costos</h3>
              <div className="grid dz-g">
                <label className="f">Sistema instalado (COP/Wp)<input className="input mono" type="number" min="0" value={d.costoWp} onChange={(e) => set('costoWp', e.target.value)} /></label>
                <label className="f">Batería (COP/kWh)<input className="input mono" type="number" min="0" value={d.costoBatKwh} onChange={(e) => set('costoBatKwh', e.target.value)} /></label>
                <label className="f">Aumento anual de tarifa (%)<input className="input mono" type="number" min="0" max="20" step="0.5" value={d.incr} onChange={(e) => set('incr', e.target.value)} /></label>
              </div>
              <span className="small muted">Costos de referencia: ajústalos con tus precios reales.</span>
            </div>
          </div>
        </div>
      )}

      {!reporte && (
        <Resultados {...{ listo, n, panel, kwp, genAnual, compensa, gen, consumo, sinBat, conBat, bat, batKwh, respaldoH, inversor, costoPV, costoBat, solar, d }} onProspecto={() => { addProspect({ tipo: 'otro', ref: 'dis-' + (d.id || Date.now()), nombre: d.cliente || 'Cliente de diseño', mun: solar?.muni?.name, valor: Math.round(costoPV + (conBat ? costoBat : 0)), detalle: `Diseño ${fmt(kwp, 1)} kWp${bat ? ` + ${fmt(batKwh, 1)} kWh` : ''}` }); setMsg('Agregado a Mis prospectos.'); }} />
      )}

      {reporte && listo && (
        <>
          <div className="card no-print prop-controls">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn sm ghost" onClick={() => setReporte(false)}><Icon name="back" size={14} />Volver al diseño</button>
              <span className="small">{marca.empresa ? <>Con la marca de <b>{marca.empresa}</b></> : 'Aún no has configurado tu marca.'} <button className="link-btn" style={{ color: 'var(--sky)', textDecoration: 'underline' }} onClick={() => go('marca')}>Editar mi marca</button></span>
              <button className="btn primary" onClick={() => window.print()}><Icon name="pdf" size={16} />Descargar PDF</button>
            </div>
            <span className="small muted">En la ventana de impresión elige "Guardar como PDF" y activa "Gráficos de fondo".</span>
          </div>
          <ReporteSolar {...{ d, marca, paid, cfg, fc: fcReporte, n, panel, kwp, genAnual, compensa, gen, consumo, sinBat, conBat, bat, batKwh, respaldoH, inversor, costoPV, costoBat, solar, tarifa }} />
        </>
      )}
    </div>
  );
}

function Resultados({ listo, n, panel, kwp, genAnual, compensa, gen, consumo, sinBat, conBat, bat, batKwh, respaldoH, inversor, costoPV, costoBat, solar, d, onProspecto }) {
  if (!listo) return <div className="card small muted">{!d.cerrado ? 'Dibuja el techo para ver los resultados.' : !solar ? 'Calculando la radiación del sitio…' : 'Escribe el consumo del cliente para ver el análisis.'}</div>;
  const r = sinBat.r;
  return (
    <div className="card dz-res">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>Resultados</h2><button className="btn sm" onClick={onProspecto}><Icon name="star" size={14} />Agregar a prospectos</button></div>
      <div className="grid g4">
        <Stat label="Paneles" value={fmt(n)} sub={`${panel.nombre}`} />
        <Stat label="Potencia" value={`${fmt(kwp, 2)} kWp`} sub={`inversor sugerido ${fmt(inversor, 1)} kW`} />
        <Stat label="Generación anual" value={`${fmt(genAnual)} kWh`} sub={`${fmt(compensa)} % del consumo`} />
        <Stat label="Inversión" value={money(costoPV)} sub={`retorno ${r.payback != null ? fmt(r.payback, 1) + ' años' : '> 25 años'}`} />
      </div>
      <BarsMes consumo={consumo} gen={gen} />
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th></th><th className="num">Solo paneles</th>{conBat && <th className="num">Con batería ({fmt(batKwh, 1)} kWh)</th>}</tr></thead><tbody>
        <tr><td>Inversión</td><td className="num">{money(costoPV)}</td>{conBat && <td className="num">{money(costoPV + costoBat)}</td>}</tr>
        <tr><td>Autoconsumo de la energía solar</td><td className="num">{fmt((sinBat.m.reduce((a, m) => a + m.auto, 0) / Math.max(1, genAnual)) * 100)} %</td>{conBat && <td className="num">{fmt((conBat.m.reduce((a, m) => a + m.auto, 0) / Math.max(1, genAnual)) * 100)} %</td>}</tr>
        <tr><td>Factura mensual (antes {money(r.facturaAntes / 12)})</td><td className="num">{money(Math.max(0, r.facturaDespues / 12))}</td>{conBat && <td className="num">{money(Math.max(0, conBat.r.facturaDespues / 12))}</td>}</tr>
        <tr><td>Ahorro el primer año</td><td className="num">{money(r.ahorro1)}</td>{conBat && <td className="num">{money(conBat.r.ahorro1)}</td>}</tr>
        <tr><td>Retorno de la inversión</td><td className="num">{r.payback != null ? `${fmt(r.payback, 1)} años` : '> 25 años'}</td>{conBat && <td className="num">{conBat.r.payback != null ? `${fmt(conBat.r.payback, 1)} años` : '> 25 años'}</td>}</tr>
        <tr><td>Ahorro neto en 25 años</td><td className="num">{money(r.neto)}</td>{conBat && <td className="num">{money(conBat.r.neto)}</td>}</tr>
        {conBat && <tr><td>Respaldo en un corte</td><td className="num">—</td><td className="num">{fmt(respaldoH, 1)} horas</td></tr>}
      </tbody></table></div>
      <p className="small muted" style={{ margin: 0 }}>Generación estimada con {solar.metodo === 'pvgis' ? 'datos satelitales de radiación (modelo PVGIS, 14 % de pérdidas)' : solar.metodo === 'nasa' ? 'radiación satelital promedio (rendimiento 78 %)' : 'la radiación del municipio'}, {d.tilt}° de inclinación. Batería: eficiencia 92 % y reemplazo en el año 12 al 60 % de su costo. Mantenimiento 1 % anual. Estimación de referencia, no reemplaza un estudio técnico.</p>
    </div>
  );
}

// Consumo vs generación por mes
function BarsMes({ consumo, gen, print }) {
  const max = Math.max(1, ...consumo, ...gen);
  const W = 600, H = 190, bw = 16;
  return (
    <figure className={`chart ${print ? 'chart-print' : ''}`}>
      <svg viewBox={`0 0 ${W} ${H + 24}`} width="100%" role="img" aria-label="Consumo y generación solar por mes">
        {[0.25, 0.5, 0.75, 1].map((t) => <line key={t} x1="30" x2={W} y1={H - t * (H - 10)} y2={H - t * (H - 10)} stroke="currentColor" opacity="0.12" />)}
        {consumo.map((c, i) => { const x = 40 + i * 47; const hc = (c / max) * (H - 10), hg = (gen[i] / max) * (H - 10); return (
          <g key={i}><rect x={x} y={H - hc} width={bw} height={hc} rx="2" fill="#8A93B8"><title>{`Consumo ${MES[i]}: ${fmt(c)} kWh`}</title></rect>
            <rect x={x + bw + 3} y={H - hg} width={bw} height={hg} rx="2" fill="#FF7A00"><title>{`Generación ${MES[i]}: ${fmt(gen[i])} kWh`}</title></rect>
            <text x={x + bw} y={H + 16} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.7">{MES[i]}</text></g>); })}
      </svg>
      <figcaption className="chart-leg"><span><i style={{ background: '#8A93B8' }} />Consumo</span><span><i style={{ background: '#FF7A00' }} />Generación solar</span><span className="muted">kWh por mes</span></figcaption>
    </figure>
  );
}
