import React, { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { api, fmt, money, cop } from '../api.js';
import { useApp } from '../App.jsx';
import { Icon } from '../components/Icon.jsx';
import { Stat } from '../components/ui.jsx';
import { satStyle } from '../components/MapSnapshot.jsx';
import { PANELES, BATERIAS, MARCAS_PANEL, MARCAS_BATERIA, POTENCIAS_PANEL, medidaTipica, CAPACIDADES_BAT } from '../components/equipos.js';
import ReporteSolar from '../components/ReporteSolar.jsx';
import { useBranding } from '../branding.js';
import { acomodar, aspectAlineado, polyArea, centro, simular, facturar, capex, finanzas, PERFILES_SEMANA, PERFILES_HORA, COSTOS_BASE } from '../components/solarDesign.js';
import { parseCoords, geocode } from '../components/mapTools.js';
import { useLocal, readLocal, writeLocal, addProspect } from '../local.js';

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const AZ = [[0, 'Sur'], [-45, 'Sureste'], [45, 'Suroeste'], [-90, 'Este'], [90, 'Oeste'], [-135, 'Noreste'], [135, 'Noroeste'], [180, 'Norte']];
const azNombre = (a) => (AZ.find((x) => x[0] === Math.round(a / 45) * 45 || (Math.abs(a) >= 157 && x[0] === 180)) || [0, `${Math.round(a)}°`])[1];
const uid = () => Math.random().toString(36).slice(2, 9);
const nuevoTecho = (n) => ({ id: uid(), nombre: `Techo ${n}`, pts: [], tipo: 'plano', pend: 15, aspect: 0, altura: 6, setback: 0.6, tiltPlano: 10, dirPlano: 'alineado', pasillo: '' });
const FIN = { incr: 4, degr: 0.5, om: 1, invAnio: 12, invPct: 100, batAnio: 12, batPct: 60, descuento: 12, vida: 25, financiado: 0, tasa: 18, plazo: 5, renta: 35, deduccion: true, deducAnios: 5, depAcelerada: true };
const NUEVO = () => ({
  id: null, cliente: '', direccion: '', tipo: 'hogar', techos: [nuevoTecho(1)], activo: null, obst: [],
  panelId: 'gen-550', orient: 'auto', limite: 'consumo', cobertura: 100, kwpObjetivo: 10,
  consumoModo: 'kwh', consumoMes: 600, factura: '', porMes: false, meses: Array(12).fill(600), perfilSemana: 'hogar', semana: PERFILES_SEMANA.hogar[1], perfilHora: 'hogar',
  tarifa: '', contribucion: false, cvPct: 10, gPct: 40, bolsa: '',
  batId: '', batN: 1, cargaCritica: 1.5, c: { ...COSTOS_BASE }, f: { ...FIN },
});
// Diseños guardados con la versión anterior (un solo techo) se convierten al formato nuevo
const migrar = (x) => {
  if (!x || x.techos) return x;
  const t = { ...nuevoTecho(1), pts: x.pts || [], altura: x.altura ?? 6, setback: x.setback ?? 0.6, tiltPlano: x.tilt ?? 10, dirPlano: 'alineado' };
  return { ...x, techos: [t], activo: t.id, obst: [], c: { ...COSTOS_BASE, modulo: COSTOS_BASE.modulo }, f: { ...FIN, incr: x.incr ?? 4 } };
};

// Pestaña Diseño: edificio en imagen satelital, paneles, consumo, batería, costos, finanzas y reporte en PDF
export default function Diseno() {
  const { cfg, paid, user, go } = useApp();
  const marca = useBranding(user);
  const [d, setD] = useState(() => { const x = { ...NUEVO(), ...migrar(readLocal('rs_diseno_actual', null) || {}) }; return { ...x, activo: x.activo || x.techos[0].id, c: { ...COSTOS_BASE, ...x.c }, f: { ...FIN, ...x.f } }; });
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const setC = (k, v) => setD((x) => ({ ...x, c: { ...x.c, [k]: v } }));
  const setF = (k, v) => setD((x) => ({ ...x, f: { ...x.f, [k]: v } }));
  const setT = (id, k, v) => setD((x) => ({ ...x, techos: x.techos.map((t) => (t.id === id ? { ...t, [k]: v } : t)) }));
  const [misPaneles, setMisPaneles] = useLocal('rs_paneles', []);
  const [misBaterias, setMisBaterias] = useLocal('rs_baterias', []);
  const [disenos, setDisenos] = useLocal('rs_disenos', []);
  const [modo, setModo] = useState(null); // 'techo' | 'obst' mientras se dibuja
  const [borrador, setBorrador] = useState([]);
  const [is3d, setIs3d] = useState(false);
  const [sitio, setSitio] = useState(null);
  const [horas, setHoras] = useState({});
  const [tab, setTab] = useState('edificio');
  const [q, setQ] = useState('');
  const [nuevoPanel, setNuevoPanel] = useState(null);
  const [nuevaBat, setNuevaBat] = useState(null);
  const [reporte, setReporte] = useState(false);
  const [msg, setMsg] = useState(null);
  const el = useRef(null), mapRef = useRef(null), st = useRef({});
  st.current = { modo, borrador };

  useEffect(() => { writeLocal('rs_diseno_actual', d); }, [d]);
  const paneles = [...PANELES, ...misPaneles];
  const baterias = [...BATERIAS, ...misBaterias];
  const panel = paneles.find((p) => p.id === d.panelId) || PANELES[2];
  const bat = baterias.find((b) => b.id === d.batId);
  const techos = d.techos.filter((t) => t.pts.length >= 3);
  const todos = techos.flatMap((t) => t.pts);
  const c0 = todos.length ? centro(todos) : null;
  const lat = c0?.[1] ?? 5;

  // ---- Mapa satelital ----
  useEffect(() => {
    const ini = d.techos.find((t) => t.pts.length)?.pts[0];
    const map = new maplibregl.Map({ container: el.current, style: satStyle(cfg.sat), center: ini || [-74.08, 4.65], zoom: ini ? 19 : 12, maxZoom: 20.5, maxPitch: 70 });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.on('load', () => {
      for (const s of ['techos', 'obst', 'paneles', 'borrador']) map.addSource(s, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'techos-3d', type: 'fill-extrusion', source: 'techos', paint: { 'fill-extrusion-color': ['case', ['get', 'on'], '#E4E8F2', '#B9C0D3'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.35 } });
      map.addLayer({ id: 'techos-line', type: 'line', source: 'techos', paint: { 'line-color': ['case', ['get', 'on'], '#FF7A00', '#FFD3A6'], 'line-width': ['case', ['get', 'on'], 3, 1.5] } });
      map.addLayer({ id: 'obst-fill', type: 'fill', source: 'obst', paint: { 'fill-color': '#FF5A4F', 'fill-opacity': 0.35 } });
      map.addLayer({ id: 'obst-line', type: 'line', source: 'obst', paint: { 'line-color': '#FF5A4F', 'line-width': 2 } });
      map.addLayer({ id: 'paneles-3d', type: 'fill-extrusion', source: 'paneles', paint: { 'fill-extrusion-color': '#0B2A6B', 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-opacity': 0.95 } });
      map.addLayer({ id: 'paneles-line', type: 'line', source: 'paneles', paint: { 'line-color': '#A8C5FF', 'line-width': 0.7 } });
      map.addLayer({ id: 'borrador-line', type: 'line', source: 'borrador', paint: { 'line-color': '#FFFFFF', 'line-width': 2, 'line-dasharray': [2, 1] } });
      map.addLayer({ id: 'borrador-pt', type: 'circle', source: 'borrador', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#FFFFFF', 'circle-stroke-color': '#FF7A00', 'circle-stroke-width': 2 } });
      map.fire('rs-ready');
    });
    map.on('click', (e) => { if (st.current.modo) setBorrador((b) => [...b, [e.lngLat.lng, e.lngLat.lat]]); });
    map.on('dblclick', (e) => { if (st.current.modo) { e.preventDefault(); terminar(); } });
    return () => map.remove();
  }, []);
  useEffect(() => { const m = mapRef.current; if (!m) return; if (modo) { m.doubleClickZoom.disable(); m.getCanvas().style.cursor = 'crosshair'; } else { m.doubleClickZoom.enable(); m.getCanvas().style.cursor = ''; } }, [modo]);
  const terminar = () => {
    const { modo: md, borrador: b } = st.current;
    setModo(null); setBorrador([]);
    if (b.length < 3) return;
    if (md === 'obst') setD((x) => ({ ...x, obst: [...x.obst, { id: uid(), pts: b, margen: 0.3 }] }));
    else setD((x) => ({ ...x, techos: x.techos.map((t) => (t.id === x.activo ? { ...t, pts: b } : t)) }));
  };
  const dibujar = (md, techoId) => { if (techoId) set('activo', techoId); setBorrador([]); setModo(md); };

  // ---- Acomodo de paneles por techo ----
  const caras = useMemo(() => techos.map((t) => {
    const aspectPlano = t.dirPlano === 'alineado' ? aspectAlineado(t.pts) : +t.dirPlano || 0;
    const r = acomodar({ ...t, aspectPlano }, panel, { obstaculos: d.obst, orient: d.orient, lat });
    return { techo: t, ...r, tilt: r.info?.tilt ?? 0, aspect: r.info?.aspect ?? 0 };
  }), [JSON.stringify(techos), JSON.stringify(d.obst), panel.id, panel.largo, panel.ancho, d.orient, lat]);

  // ---- Recurso solar: datos del sitio y generación hora a hora de cada cara ----
  useEffect(() => {
    if (!c0) return;
    api(`/solar?lat=${c0[1].toFixed(5)}&lon=${c0[0].toFixed(5)}`).then((s) => {
      setSitio(s);
      setD((x) => {
        const t = (x.tipo === 'empresa' ? s.muni?.tarifa_com : s.muni?.tarifa) || 800;
        return { ...x, tarifa: x.tarifa || Math.round(t), bolsa: x.bolsa || s.bolsa || 300 };
      });
    }).catch((e) => setMsg(e.message));
  }, [c0?.[0].toFixed(3), c0?.[1].toFixed(3)]);
  const claves = caras.map((c) => `${Math.round(c.tilt)}|${Math.round(c.aspect)}`);
  useEffect(() => {
    if (!c0) return;
    for (const k of new Set(claves)) {
      if (horas[k]) continue;
      const [a, asp] = k.split('|');
      setHoras((h) => ({ ...h, [k]: 'cargando' }));
      api(`/solar/horario?lat=${c0[1].toFixed(3)}&lon=${c0[0].toFixed(3)}&angle=${a}&aspect=${asp}`).then((r) => setHoras((h) => ({ ...h, [k]: r }))).catch(() => setHoras((h) => { const n = { ...h }; delete n[k]; return n; }));
    }
  }, [claves.join(','), c0?.[0].toFixed(3)]);

  // ---- Cálculos ----
  const tarifa = +d.tarifa || 800;
  const consumoMes = d.porMes ? d.meses.map((v) => +v || 0) : Array(12).fill(d.consumoModo === 'factura' ? (+d.factura || 0) / (tarifa * (d.contribucion ? 1.2 : 1)) : +d.consumoMes || 0);
  const consumoAnual = consumoMes.reduce((a, b) => a + b, 0);
  const listasHoras = caras.every((c, i) => horas[claves[i]] && horas[claves[i]] !== 'cargando');
  // Paneles a usar: primero en las caras que más producen, hasta cubrir el objetivo
  const seleccion = useMemo(() => {
    const orden = caras.map((c, i) => ({ c, i, y: horas[claves[i]]?.anual || 0 })).sort((a, b) => b.y - a.y);
    const yieldProm = orden.length ? orden.reduce((s, o) => s + o.y, 0) / orden.length : 0;
    const pw = panel.w / 1000;
    let meta = Infinity;
    if (d.limite === 'consumo' && yieldProm) meta = Math.ceil(((consumoAnual * d.cobertura) / 100) / (orden[0]?.y || yieldProm) / pw);
    if (d.limite === 'kwp') meta = Math.round((+d.kwpObjetivo || 0) / pw);
    const out = caras.map(() => 0);
    for (const o of orden) { const k = Math.max(0, Math.min(o.c.paneles.length, meta)); out[o.i] = k; meta -= k; }
    return out;
  }, [caras, listasHoras, d.limite, d.cobertura, d.kwpObjetivo, consumoAnual, panel.w]);
  const n = seleccion.reduce((a, b) => a + b, 0);
  const kwp = (n * panel.w) / 1000;
  const kwAc = kwp ? Math.max(1, Math.round((kwp / 1.15) * 10) / 10) : 0;
  const gen = useMemo(() => {
    const g = new Float64Array(8760);
    caras.forEach((c, i) => { const h = horas[claves[i]]; const k = (seleccion[i] * panel.w) / 1000; if (h?.h && k) for (let j = 0; j < 8760; j++) g[j] += (h.h[j] * k) / 1000; });
    return g;
  }, [seleccion, listasHoras, panel.w]);
  const genAnual = gen.reduce((a, b) => a + b, 0);
  const batKwh = bat ? bat.kwh * (+d.batN || 1) : 0;
  const reglas = { tarifa, contribucion: d.contribucion, cvPct: +d.cvPct, gPct: +d.gPct, bolsa: +d.bolsa || 300, kwAc };
  const escenario = (conBateria) => {
    const sim = simular({ consumoMes, semana: d.semana, hora: PERFILES_HORA[d.perfilHora][1], gen, bat: conBateria ? { util: batKwh * bat.dod, kw: (bat.kw || bat.kwh / 2) * (+d.batN || 1) } : null });
    const fact = facturar(sim.mes, reglas);
    const cap = capex(d.c, { kwp, kwAc, batKwh: conBateria ? batKwh : 0, hibrido: conBateria });
    const ahorro1 = fact.reduce((a, m) => a + m.ahorro, 0);
    const costoInv = kwAc * 1000 * (conBateria ? d.c.hibrido : d.c.inversor);
    const fin = finanzas({ inversion: cap.total, ahorro1, gen1: genAnual, costoInv, costoBat: conBateria ? batKwh * d.c.batKwh : 0, f: d.f, empresa: d.tipo === 'empresa' });
    const sinHacer = fact.reduce((a, m) => a + m.sin, 0);
    let acumSin = 0; const serieSin = Array.from({ length: d.f.vida }, (_, y) => (acumSin += sinHacer * Math.pow(1 + d.f.incr / 100, y)));
    return { sim, fact, cap, fin, ahorro1, facturaAntes: sinHacer, facturaDespues: fact.reduce((a, m) => a + m.con, 0), sinHacer: acumSin, serieSin };
  };
  const listo = techos.length > 0 && n > 0 && consumoAnual > 0 && listasHoras && sitio;
  const sinBat = useMemo(() => (listo ? escenario(false) : null), [listo, gen, JSON.stringify([consumoMes, d.semana, d.perfilHora, reglas, d.c, d.f, d.tipo])]);
  const conBat = useMemo(() => (listo && bat ? escenario(true) : null), [listo, gen, bat?.id, d.batN, JSON.stringify([consumoMes, d.semana, d.perfilHora, reglas, d.c, d.f, d.tipo])]);
  const respaldoH = bat ? (batKwh * bat.dod) / (+d.cargaCritica || 1) : 0;

  // ---- Dibujo en el mapa ----
  useEffect(() => {
    const m = mapRef.current; if (!m) return;
    const fc = (features) => ({ type: 'FeatureCollection', features });
    const poly = (pts, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] } });
    const upd = () => {
      if (!m.getSource('techos')) return;
      m.getSource('techos').setData(fc(techos.map((t) => poly(t.pts, { h: +t.altura || 0, on: t.id === d.activo }))));
      m.getSource('obst').setData(fc(d.obst.map((o) => poly(o.pts, {}))));
      m.getSource('paneles').setData(fc(caras.flatMap((c, i) => c.paneles.slice(0, seleccion[i]).map((r) => ({ type: 'Feature', properties: { b: (+c.techo.altura || 0) + 0.05, h: (+c.techo.altura || 0) + 0.25 }, geometry: { type: 'Polygon', coordinates: [r] } })))));
      m.getSource('borrador').setData(fc([...borrador.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } })), ...(borrador.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: borrador } }] : [])]));
    };
    if (m.getSource('techos')) upd(); else m.once('rs-ready', upd);
  }, [caras, seleccion, borrador, d.activo, JSON.stringify(d.obst)]);
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
    const id = d.id || uid();
    const item = { ...d, id, fecha: new Date().toISOString().slice(0, 10), kwp, n };
    setD(item);
    setDisenos((l) => [item, ...l.filter((x) => x.id !== id)].slice(0, 50));
    setMsg('Diseño guardado en este navegador.');
  };
  const nuevo = () => { const x = NUEVO(); setD({ ...x, activo: x.techos[0].id }); setSitio(null); setReporte(false); };
  const fcReporte = { type: 'FeatureCollection', features: [...techos.map((t) => ({ type: 'Feature', properties: { k: 'zona' }, geometry: { type: 'Polygon', coordinates: [[...t.pts, t.pts[0]]] } })), ...caras.flatMap((c, i) => c.paneles.slice(0, seleccion[i]).map((r) => ({ type: 'Feature', properties: { k: 'panel' }, geometry: { type: 'Polygon', coordinates: [r] } })))] };
  const N = (obj, setter, k, label, props = {}) => <label className="f">{label}<input className="input mono" type="number" value={obj[k]} onChange={(e) => setter(k, e.target.value === '' ? '' : +e.target.value)} {...props} /></label>;
  const resumenCaras = caras.map((c, i) => ({ nombre: c.techo.nombre, tipo: c.techo.tipo, info: c.info, usados: seleccion[i], yield: horas[claves[i]]?.anual }));

  return (
    <div className="page diseno-page" style={{ maxWidth: 1440 }}>
      <div className="page-head no-print">
        <div><h1>Diseño solar</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Dibuja los techos y obstáculos sobre la imagen satelital, acomoda los paneles, simula el consumo hora a hora, compara con y sin baterías y genera la propuesta.</p></div>
        <div className="row" style={{ gap: 6 }}>
          {disenos.length > 0 && <select className="select" style={{ maxWidth: 240 }} value="" onChange={(e) => { const x = migrar(disenos.find((y) => y.id === e.target.value)); if (x) { setD({ ...NUEVO(), ...x, c: { ...COSTOS_BASE, ...x.c }, f: { ...FIN, ...x.f }, activo: x.activo || x.techos[0].id }); setReporte(false); const p = x.techos.find((t) => t.pts.length)?.pts[0]; if (p) mapRef.current?.flyTo({ center: p, zoom: 19 }); } }} aria-label="Abrir diseño guardado"><option value="">Abrir diseño guardado…</option>{disenos.map((x) => <option key={x.id} value={x.id}>{x.cliente || 'Sin nombre'} · {fmt(x.kwp, 1)} kWp · {x.fecha}</option>)}</select>}
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
              {modo ? <>
                <button className="btn sm primary" onClick={terminar}><Icon name="check" size={15} />Terminar {modo === 'obst' ? 'obstáculo' : 'techo'}</button>
                {borrador.length > 0 && <button className="btn sm" onClick={() => setBorrador(borrador.slice(0, -1))}>Deshacer punto</button>}
                <button className="btn sm" onClick={() => { setModo(null); setBorrador([]); }}>Cancelar</button>
              </> : <>
                <button className="btn sm" onClick={() => dibujar('techo')}><Icon name="polygon" size={15} />{d.techos.find((t) => t.id === d.activo)?.pts.length ? 'Redibujar techo' : 'Dibujar techo'}</button>
                <button className="btn sm" onClick={() => dibujar('obst')}><Icon name="rect" size={15} />Obstáculo</button>
              </>}
              <div className="seg"><button className={!is3d ? 'on' : ''} onClick={() => set3d(false)}>2D</button><button className={is3d ? 'on' : ''} onClick={() => set3d(true)}>3D</button></div>
            </div>
            {modo && <div className="dz-hint small">{modo === 'obst' ? 'Marca el contorno del tanque, claraboya, ducto o zona con sombra.' : `Marca las esquinas de "${d.techos.find((t) => t.id === d.activo)?.nombre}".`} Doble clic o "Terminar" para cerrar. Acerca bien el mapa: la precisión depende del zoom.</div>}
            <div ref={el} className="dz-canvas" />
          </div>

          <div className="dz-side">
            <div className="dz-tabs" role="tablist">
              {[['edificio', 'Edificio'], ['paneles', 'Paneles'], ['consumo', 'Consumo'], ['bateria', 'Batería'], ['costos', 'Costos'], ['finanzas', 'Finanzas']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
            </div>

            {tab === 'edificio' && (
              <div className="card dz-sec">
                <div className="grid dz-g">
                  <label className="f">Cliente<input className="input" value={d.cliente} onChange={(e) => set('cliente', e.target.value)} placeholder="Nombre o empresa" /></label>
                  <label className="f">Tipo de cliente<select className="select" value={d.tipo} onChange={(e) => setD((x) => ({ ...x, tipo: e.target.value, tarifa: '' }))}><option value="hogar">Hogar</option><option value="empresa">Empresa o negocio</option></select></label>
                </div>
                <label className="f">Dirección<input className="input" value={d.direccion} onChange={(e) => set('direccion', e.target.value)} /></label>
                <h3>Techos</h3>
                {d.techos.map((t) => (
                  <div key={t.id} className={`dz-techo ${t.id === d.activo ? 'on' : ''}`} onClick={() => set('activo', t.id)}>
                    <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
                      <input className="input dz-nombre" value={t.nombre} onChange={(e) => setT(t.id, 'nombre', e.target.value)} aria-label="Nombre del techo" />
                      <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <button className="btn sm" onClick={(e) => { e.stopPropagation(); dibujar('techo', t.id); }}><Icon name="polygon" size={14} />{t.pts.length ? 'Redibujar' : 'Dibujar'}</button>
                        {d.techos.length > 1 && <button className="btn sm ghost" onClick={(e) => { e.stopPropagation(); setD((x) => { const ts = x.techos.filter((y) => y.id !== t.id); return { ...x, techos: ts, activo: ts[0].id }; }); }} aria-label="Eliminar techo"><Icon name="trash" size={14} /></button>}
                      </span>
                    </div>
                    <div className="grid dz-g3">
                      <label className="f">Tipo<select className="select" value={t.tipo} onChange={(e) => setT(t.id, 'tipo', e.target.value)}><option value="plano">Plano (losa)</option><option value="inclinado">Inclinado (teja)</option></select></label>
                      <label className="f">Altura (m)<input className="input mono" type="number" min="0" max="200" value={t.altura} onChange={(e) => setT(t.id, 'altura', e.target.value)} /></label>
                      <label className="f">Retiro del borde (m)<input className="input mono" type="number" min="0" max="5" step="0.1" value={t.setback} onChange={(e) => setT(t.id, 'setback', e.target.value)} /></label>
                      {t.tipo === 'inclinado' ? <>
                        <label className="f">Pendiente (°)<input className="input mono" type="number" min="0" max="60" value={t.pend} onChange={(e) => setT(t.id, 'pend', e.target.value)} /></label>
                        <label className="f">Hacia dónde cae<select className="select" value={t.aspect} onChange={(e) => setT(t.id, 'aspect', +e.target.value)}>{AZ.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                      </> : <>
                        <label className="f">Inclinación de la estructura (°)<input className="input mono" type="number" min="0" max="35" value={t.tiltPlano} onChange={(e) => setT(t.id, 'tiltPlano', e.target.value)} /></label>
                        <label className="f">Paneles mirando<select className="select" value={t.dirPlano} onChange={(e) => setT(t.id, 'dirPlano', e.target.value)}><option value="alineado">Alineados al edificio</option>{AZ.map(([v, l]) => <option key={v} value={v}>Al {l.toLowerCase()}</option>)}</select></label>
                      </>}
                    </div>
                    {t.pts.length >= 3 && <span className="small muted">{fmt(polyArea(t.pts))} m² en planta{t.tipo === 'inclinado' ? ` · ${fmt(polyArea(t.pts) / Math.cos((t.pend * Math.PI) / 180))} m² reales` : ''}</span>}
                  </div>
                ))}
                <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => { const t = nuevoTecho(d.techos.length + 1); setD((x) => ({ ...x, techos: [...x.techos, t], activo: t.id })); dibujar('techo', t.id); }}><Icon name="plus" size={14} />Agregar otra cara o techo</button>
                <span className="small muted">Un techo a dos aguas son dos caras: dibújalas por separado, cada una con su orientación.</span>
                <h3>Obstáculos</h3>
                {d.obst.length ? d.obst.map((o, i) => (
                  <div key={o.id} className="row" style={{ gap: 8 }}><span className="small">Obstáculo {i + 1} · {fmt(polyArea(o.pts), 1)} m²</span>
                    <label className="row small" style={{ gap: 4 }}>margen <input className="input mono" style={{ width: 70, minHeight: 32 }} type="number" min="0" max="5" step="0.1" value={o.margen} onChange={(e) => set('obst', d.obst.map((y) => (y.id === o.id ? { ...y, margen: e.target.value } : y)))} /> m</label>
                    <button className="btn sm ghost" onClick={() => set('obst', d.obst.filter((y) => y.id !== o.id))} aria-label="Eliminar obstáculo"><Icon name="trash" size={14} /></button></div>
                )) : <span className="small muted">Tanques, claraboyas, ductos, antenas o zonas con sombra de árboles o edificios vecinos.</span>}
              </div>
            )}

            {tab === 'paneles' && (
              <div className="card dz-sec">
                <label className="f">Panel<select className="select" value={d.panelId} onChange={(e) => set('panelId', e.target.value)}>{[...new Set(paneles.map((p) => p.marca))].map((mk) => <optgroup key={mk} label={mk === 'Genérico' ? 'Genéricos' : mk}>{paneles.filter((p) => p.marca === mk).map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.largo}×{p.ancho} mm</option>)}</optgroup>)}</select></label>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn sm ghost" onClick={() => setNuevoPanel({ nombre: '', marca: 'Genérico', otra: '', w: 550, largo: 2279, ancho: 1134, garantia: 25 })}><Icon name="plus" size={14} />Crear panel</button>
                  {misPaneles.some((p) => p.id === d.panelId) && <button className="btn sm ghost" onClick={() => { setMisPaneles(misPaneles.filter((p) => p.id !== d.panelId)); set('panelId', 'gen-550'); }}><Icon name="trash" size={14} />Borrar este panel</button>}
                </div>
                {nuevoPanel && <NuevoPanel v={nuevoPanel} setV={setNuevoPanel} onSave={(p) => { setMisPaneles([...misPaneles, p]); set('panelId', p.id); setNuevoPanel(null); }} />}
                <label className="f">Posición de los módulos<select className="select" value={d.orient} onChange={(e) => set('orient', e.target.value)}><option value="auto">La que más paneles acomode</option><option value="vertical">Vertical</option><option value="horizontal">Horizontal</option></select></label>
                <label className="f">Cuántos paneles<select className="select" value={d.limite} onChange={(e) => set('limite', e.target.value)}><option value="consumo">Según el consumo del cliente</option><option value="maximo">Todos los que caben</option><option value="kwp">Una potencia objetivo</option></select></label>
                {d.limite === 'consumo' && <label className="f">Cubrir el {d.cobertura} % del consumo anual<input type="range" min="30" max="150" step="5" value={d.cobertura} onChange={(e) => set('cobertura', +e.target.value)} /></label>}
                {d.limite === 'kwp' && N(d, set, 'kwpObjetivo', 'Potencia objetivo (kWp)', { min: 1 })}
                <h3>Resultado del acomodo</h3>
                <div className="tbl-wrap"><table className="tbl dz-mini"><thead><tr><th>Cara</th><th className="num">Caben</th><th className="num">Usados</th><th className="num">kWh/kWp</th></tr></thead><tbody>
                  {resumenCaras.map((c, i) => <tr key={i}><td className="small">{c.nombre}<br /><span className="muted">{c.info ? `${c.tipo === 'plano' ? `estructura ${c.info.tilt}°` : `pendiente ${c.info.tilt}°`} al ${azNombre(c.info.aspect).toLowerCase()} · ${c.info.orient}${c.tipo === 'plano' && c.info.tilt ? ` · pasillo ${fmt(c.info.pasillo, 2)} m` : ''}` : 'sin dibujar'}</span></td><td className="num">{fmt(c.info?.n || 0)}</td><td className="num">{fmt(c.usados)}</td><td className="num">{c.yield ? fmt(c.yield) : '…'}</td></tr>)}
                </tbody></table></div>
                {caras.some((c) => c.info) && (() => { const ap = caras.reduce((s, c) => s + (c.info?.areaReal || 0), 0), apa = (n * panel.largo * panel.ancho) / 1e6; return <span className="small muted">{fmt(n)} paneles · {fmt(kwp, 2)} kWp · ocupan {fmt(apa)} m² de {fmt(ap)} m² de techo ({fmt((apa / Math.max(1, ap)) * 100)} %) · {fmt(kwp / Math.max(1, ap) * 1000)} W/m²</span>; })()}
                <span className="small muted">En techos planos el pasillo entre filas se calcula para que no haya sombra entre 9:00 y 15:00 en todo el año. Puedes fijarlo a mano:</span>
                {d.techos.filter((t) => t.tipo === 'plano' && t.pts.length).map((t) => <label key={t.id} className="row small" style={{ gap: 6 }}>{t.nombre}: pasillo <input className="input mono" style={{ width: 90, minHeight: 32 }} type="number" min="0" step="0.05" placeholder="auto" value={t.pasillo} onChange={(e) => setT(t.id, 'pasillo', e.target.value)} /> m</label>)}
              </div>
            )}

            {tab === 'consumo' && (
              <div className="card dz-sec">
                <div className="seg">{[['kwh', 'kWh al mes'], ['factura', 'Valor de la factura']].map(([k, l]) => <button key={k} className={d.consumoModo === k && !d.porMes ? 'on' : ''} onClick={() => setD((x) => ({ ...x, consumoModo: k, porMes: false }))}>{l}</button>)}<button className={d.porMes ? 'on' : ''} onClick={() => setD((x) => ({ ...x, porMes: true, meses: x.porMes ? x.meses : Array(12).fill(consumoMes[0] || 0) }))}>Mes a mes</button></div>
                {d.porMes
                  ? <div className="dz-meses">{d.meses.map((v, i) => <label key={i} className="f"><span className="small">{MES[i]}</span><input className="input mono" type="number" min="0" value={v} onChange={(e) => set('meses', d.meses.map((y, j) => (j === i ? e.target.value : y)))} /></label>)}</div>
                  : d.consumoModo === 'kwh' ? N(d, set, 'consumoMes', 'Consumo (kWh al mes)', { min: 0 }) : N(d, set, 'factura', 'Factura (COP al mes)', { min: 0 })}
                <h3>Cómo se reparte en la semana</h3>
                <select className="select" value={d.perfilSemana} onChange={(e) => setD((x) => ({ ...x, perfilSemana: e.target.value, semana: e.target.value === 'personalizado' ? x.semana : PERFILES_SEMANA[e.target.value][1] }))}>{Object.entries(PERFILES_SEMANA).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}<option value="personalizado">Personalizado</option></select>
                <div className="dz-semana">
                  {DIA.map((nm, i) => { const tot = d.semana.reduce((a, b) => a + b, 0) || 1; return (
                    <label key={nm}><span className="mono small">{fmt((d.semana[i] / tot) * 100)}%</span>
                      <input type="range" min="0" max="3" step="0.05" value={d.semana[i]} aria-label={`Peso del ${nm}`} onChange={(e) => setD((x) => ({ ...x, perfilSemana: 'personalizado', semana: x.semana.map((y, j) => (j === i ? +e.target.value : y)) }))} />
                      <span className="small">{nm}</span></label>); })}
                </div>
                <label className="f">Horario de uso<select className="select" value={d.perfilHora} onChange={(e) => set('perfilHora', e.target.value)}>{Object.entries(PERFILES_HORA).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <MiniHoras perfil={PERFILES_HORA[d.perfilHora][1]} />
                <h3>Tarifa y reglas de la red</h3>
                <div className="grid dz-g">
                  {N(d, set, 'tarifa', 'Tarifa (costo unitario $/kWh)', { min: 0 })}
                  {N(d, set, 'bolsa', 'Precio de bolsa ($/kWh)', { min: 0 })}
                  {N(d, set, 'cvPct', 'Comercialización (% de la tarifa)', { min: 0, max: 40, step: 1 })}
                  {kwAc > 100 && N(d, set, 'gPct', 'Generación (% de la tarifa)', { min: 0, max: 100, step: 1 })}
                </div>
                <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={d.contribucion} onChange={(e) => set('contribucion', e.target.checked)} />Paga contribución del 20 % (estratos 5 y 6, comercio e industria)</label>
                {sitio?.muni && <span className="small muted">Referencia de {sitio.muni.name} ({sitio.muni.or}): residencial {fmt(sitio.muni.tarifa)} · comercial {fmt(sitio.muni.tarifa_com)} $/kWh{sitio.bolsa ? ` · bolsa promedio 12 meses ${fmt(sitio.bolsa)} $/kWh` : ''}.</span>}
                <div className="dz-regla small">
                  <b>Así se liquida la energía (CREG 174 de 2021)</b>
                  <span>Cada mes se suma lo que el sistema exportó y lo que se importó de la red.</span>
                  <span>• Lo exportado hasta lo importado se <b>permuta</b>: {kwAc <= 100 ? `se descuenta a la tarifa menos la comercialización (${d.cvPct} %)` : `se reconoce solo el componente de generación (${d.gPct} % de la tarifa)`}.</span>
                  <span>• Lo exportado por encima de lo importado se paga a <b>precio de bolsa</b>.</span>
                  <span>• Lo importado se paga completo{d.contribucion ? ', con la contribución' : ''}.</span>
                  {kwAc > 1000 && <span className="err-txt">Más de 1 MW ya no es autogeneración a pequeña escala: revisa las reglas de gran escala.</span>}
                </div>
              </div>
            )}

            {tab === 'bateria' && (
              <div className="card dz-sec">
                <label className="f">Batería<select className="select" value={d.batId} onChange={(e) => set('batId', e.target.value)}><option value="">Sin batería</option>{[...new Set(baterias.map((b) => b.marca))].map((mk) => <optgroup key={mk} label={mk === 'Genérico' ? 'Genéricas' : mk}>{baterias.filter((b) => b.marca === mk).map((b) => <option key={b.id} value={b.id}>{b.nombre} · {fmt(b.kwh, 1)} kWh</option>)}</optgroup>)}</select></label>
                <div className="row" style={{ gap: 6 }}>{misBaterias.some((b) => b.id === d.batId) && <button className="btn sm ghost" onClick={() => { setMisBaterias(misBaterias.filter((b) => b.id !== d.batId)); set('batId', ''); }}><Icon name="trash" size={14} />Borrar esta batería</button>}<button className="btn sm ghost" onClick={() => setNuevaBat({ marca: 'Genérico', otra: '', nombre: '', kwh: 10, dod: 90 })}><Icon name="plus" size={14} />Crear batería</button></div>
                {nuevaBat && <NuevaBat v={nuevaBat} setV={setNuevaBat} onSave={(b) => { setMisBaterias([...misBaterias, b]); set('batId', b.id); setNuevaBat(null); }} />}
                {bat && <div className="grid dz-g">
                  {N(d, set, 'batN', 'Cantidad', { min: 1, max: 50 })}
                  {N(d, set, 'cargaCritica', 'Carga esencial en un corte (kW)', { min: 0.1, step: 0.1 })}
                </div>}
                {bat && <span className="small muted">{fmt(batKwh, 1)} kWh en total, {fmt(batKwh * bat.dod, 1)} kWh útiles, {fmt((bat.kw || bat.kwh / 2) * (+d.batN || 1), 1)} kW de potencia. Se carga con la energía solar que sobra y se descarga cuando falta, hora a hora (eficiencia 95 % al cargar y al descargar).</span>}
              </div>
            )}

            {tab === 'costos' && (
              <div className="card dz-sec">
                <span className="small muted">Valores de referencia: ajústalos con tus precios. El total es lo que paga el cliente.</span>
                <div className="grid dz-g">
                  {N(d.c, setC, 'modulo', 'Módulos (COP/Wp)', { min: 0 })}
                  {N(d.c, setC, conBat ? 'hibrido' : 'inversor', conBat ? 'Inversor híbrido (COP/W)' : 'Inversor (COP/W)', { min: 0 })}
                  {N(d.c, setC, 'estructura', 'Estructura (COP/Wp)', { min: 0 })}
                  {N(d.c, setC, 'electrico', 'Material eléctrico (COP/Wp)', { min: 0 })}
                  {N(d.c, setC, 'mano', 'Mano de obra (COP/Wp)', { min: 0 })}
                  {N(d.c, setC, 'ingenieria', 'Ingeniería y trámites (COP)', { min: 0, step: 100000 })}
                  {N(d.c, setC, 'transporte', 'Transporte y otros (%)', { min: 0, max: 30 })}
                  {N(d.c, setC, 'margen', 'Utilidad (%)', { min: 0, max: 80 })}
                  {N(d.c, setC, 'batKwh', 'Batería (COP/kWh)', { min: 0, step: 50000 })}
                  {N(d.c, setC, 'iva', 'IVA (%)', { min: 0, max: 19 })}
                </div>
                <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={d.c.ivaExcluido} onChange={(e) => setC('ivaExcluido', e.target.checked)} />Proyecto excluido de IVA (Ley 1715, con certificación)</label>
                {listo && <CostTable cap={(conBat || sinBat).cap} kwp={kwp} />}
              </div>
            )}

            {tab === 'finanzas' && (
              <div className="card dz-sec">
                <div className="grid dz-g">
                  {N(d.f, setF, 'incr', 'Aumento anual de tarifa (%)', { min: 0, max: 20, step: 0.5 })}
                  {N(d.f, setF, 'degr', 'Pérdida anual de los paneles (%)', { min: 0, max: 2, step: 0.1 })}
                  {N(d.f, setF, 'om', 'Mantenimiento anual (% inversión)', { min: 0, max: 5, step: 0.1 })}
                  {N(d.f, setF, 'descuento', 'Tasa de descuento (%)', { min: 0, max: 40 })}
                  {N(d.f, setF, 'invAnio', 'Cambio de inversor (año)', { min: 5, max: 25 })}
                  {N(d.f, setF, 'invPct', 'Costo del cambio (% del inversor)', { min: 0, max: 150 })}
                  {N(d.f, setF, 'batAnio', 'Cambio de batería (año)', { min: 5, max: 25 })}
                  {N(d.f, setF, 'batPct', 'Costo del cambio (% de la batería)', { min: 0, max: 150 })}
                </div>
                <h3>Financiación</h3>
                <div className="grid dz-g3">
                  {N(d.f, setF, 'financiado', 'Financiado (%)', { min: 0, max: 100, step: 5 })}
                  {N(d.f, setF, 'tasa', 'Tasa E.A. (%)', { min: 0, max: 60, step: 0.5 })}
                  {N(d.f, setF, 'plazo', 'Plazo (años)', { min: 1, max: 15 })}
                </div>
                {d.tipo === 'empresa' && <>
                  <h3>Beneficios tributarios</h3>
                  <div className="grid dz-g">{N(d.f, setF, 'renta', 'Tarifa de renta (%)', { min: 0, max: 50 })}{N(d.f, setF, 'deducAnios', 'Deducir el 50 % en (años)', { min: 1, max: 15 })}</div>
                  <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={d.f.deduccion} onChange={(e) => setF('deduccion', e.target.checked)} />Deducción especial en renta (Ley 1715)</label>
                  <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={d.f.depAcelerada} onChange={(e) => setF('depAcelerada', e.target.checked)} />Depreciación acelerada (3 años)</label>
                </>}
              </div>
            )}
          </div>
        </div>
      )}

      {!reporte && <Resultados {...{ listo, techos, n, panel, kwp, kwAc, genAnual, consumoAnual, sinBat, conBat, batKwh, respaldoH, d, sitio, cargando: techos.length && !listasHoras }} onProspecto={() => { const e = conBat && conBat.fin.neto > sinBat.fin.neto ? conBat : sinBat; addProspect({ tipo: 'otro', ref: 'dis-' + (d.id || Date.now()), nombre: d.cliente || 'Cliente de diseño', mun: sitio?.muni?.name, valor: Math.round(e.cap.total), detalle: `Diseño ${fmt(kwp, 1)} kWp${conBat ? ` + ${fmt(batKwh, 1)} kWh` : ''}` }); setMsg('Agregado a Mis prospectos.'); }} />}

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
          <ReporteSolar {...{ d, marca, paid, cfg, fc: fcReporte, n, panel, kwp, kwAc, genAnual, consumoAnual, sinBat, conBat, bat, batKwh, respaldoH, sitio, tarifa, caras: resumenCaras }} />
        </>
      )}
    </div>
  );
}

function NuevoPanel({ v, setV, onSave }) {
  const marca = v.marca === 'Otra' ? v.otra || 'Marca' : v.marca;
  return (
    <form className="dz-new" onSubmit={(e) => { e.preventDefault(); const mk = v.marca === 'Otra' ? (v.otra.trim() || 'Otra marca') : v.marca; onSave({ id: 'mio-' + Date.now().toString(36), marca: mk, nombre: v.nombre.trim() || `${mk === 'Genérico' ? 'Panel' : mk} ${v.w} W`, w: +v.w, largo: +v.largo, ancho: +v.ancho, garantia: +v.garantia }); }}>
      <div className="grid dz-g">
        <label className="f">Marca<select className="select" value={v.marca} onChange={(e) => setV({ ...v, marca: e.target.value })}>{[...MARCAS_PANEL, 'Otra'].map((m) => <option key={m}>{m}</option>)}</select></label>
        {v.marca === 'Otra' && <label className="f">¿Cuál marca?<input className="input" required value={v.otra} onChange={(e) => setV({ ...v, otra: e.target.value })} /></label>}
        <label className="f">Potencia<select className="select" value={POTENCIAS_PANEL.includes(+v.w) ? v.w : 'otra'} onChange={(e) => { const w = e.target.value === 'otra' ? v.w : +e.target.value; const [largo, ancho] = medidaTipica(w); setV({ ...v, w, largo, ancho }); }}>{POTENCIAS_PANEL.map((w) => <option key={w} value={w}>{w} W</option>)}<option value="otra">Otra…</option></select></label>
        {!POTENCIAS_PANEL.includes(+v.w) && <label className="f">Potencia exacta (W)<input className="input mono" type="number" min="50" required value={v.w} onChange={(e) => setV({ ...v, w: e.target.value })} /></label>}
        <label className="f">Modelo (opcional)<input className="input" value={v.nombre} placeholder={`${v.marca === 'Genérico' ? 'Panel' : marca} ${v.w} W`} onChange={(e) => setV({ ...v, nombre: e.target.value })} /></label>
        <label className="f">Garantía (años)<input className="input mono" type="number" min="1" value={v.garantia} onChange={(e) => setV({ ...v, garantia: e.target.value })} /></label>
        <label className="f">Largo (mm)<input className="input mono" type="number" min="300" required value={v.largo} onChange={(e) => setV({ ...v, largo: e.target.value })} /></label>
        <label className="f">Ancho (mm)<input className="input mono" type="number" min="300" required value={v.ancho} onChange={(e) => setV({ ...v, ancho: e.target.value })} /></label>
      </div>
      <div className="row"><button className="btn sm primary">Guardar panel</button><button type="button" className="btn sm ghost" onClick={() => setV(null)}>Cancelar</button></div>
    </form>
  );
}

function NuevaBat({ v, setV, onSave }) {
  const marca = v.marca === 'Otra' ? v.otra || 'Marca' : v.marca;
  return (
    <form className="dz-new" onSubmit={(e) => { e.preventDefault(); const mk = v.marca === 'Otra' ? (v.otra.trim() || 'Otra marca') : v.marca; onSave({ id: 'mia-' + Date.now().toString(36), marca: mk, nombre: v.nombre.trim() || `${mk === 'Genérico' ? 'Litio' : mk} ${v.kwh} kWh`, kwh: +v.kwh, dod: +v.dod / 100, kw: +v.kwh / 2 }); }}>
      <div className="grid dz-g">
        <label className="f">Marca<select className="select" value={v.marca} onChange={(e) => setV({ ...v, marca: e.target.value })}>{[...MARCAS_BATERIA, 'Otra'].map((m) => <option key={m}>{m}</option>)}</select></label>
        {v.marca === 'Otra' && <label className="f">¿Cuál marca?<input className="input" required value={v.otra} onChange={(e) => setV({ ...v, otra: e.target.value })} /></label>}
        <label className="f">Capacidad<select className="select" value={CAPACIDADES_BAT.includes(+v.kwh) ? v.kwh : 'otra'} onChange={(e) => setV({ ...v, kwh: e.target.value === 'otra' ? '' : +e.target.value })}>{CAPACIDADES_BAT.map((k) => <option key={k} value={k}>{fmt(k, 2)} kWh</option>)}<option value="otra">Otra…</option></select></label>
        {!CAPACIDADES_BAT.includes(+v.kwh) && <label className="f">Capacidad exacta (kWh)<input className="input mono" type="number" min="0.5" step="0.1" required value={v.kwh} onChange={(e) => setV({ ...v, kwh: e.target.value })} /></label>}
        <label className="f">Modelo (opcional)<input className="input" value={v.nombre} placeholder={`${v.marca === 'Genérico' ? 'Litio' : marca} ${v.kwh || ''} kWh`} onChange={(e) => setV({ ...v, nombre: e.target.value })} /></label>
        <label className="f">Descarga útil (%)<input className="input mono" type="number" min="50" max="100" value={v.dod} onChange={(e) => setV({ ...v, dod: e.target.value })} /></label>
      </div>
      <div className="row"><button className="btn sm primary">Guardar batería</button><button type="button" className="btn sm ghost" onClick={() => setV(null)}>Cancelar</button></div>
    </form>
  );
}

function MiniHoras({ perfil }) {
  const max = Math.max(...perfil);
  return <div className="dz-horas" aria-label="Perfil de consumo por hora">{perfil.map((v, h) => <i key={h} style={{ height: `${(v / max) * 100}%` }} title={`${h}:00 · ${fmt(v * 100, 1)} %`} />)}</div>;
}

export function CostTable({ cap, kwp }) {
  return (
    <div className="tbl-wrap"><table className="tbl dz-mini"><tbody>
      {cap.items.map(([n, v]) => <tr key={n}><td className="small">{n}</td><td className="num">{money(v)}</td></tr>)}
      <tr><td className="small"><b>Subtotal</b></td><td className="num"><b>{money(cap.subtotal)}</b></td></tr>
      <tr><td className="small">IVA</td><td className="num">{money(cap.iva)}</td></tr>
      <tr><td className="small"><b>Total</b> · {cop(cap.porWp)} por Wp</td><td className="num"><b>{money(cap.total)}</b></td></tr>
    </tbody></table></div>
  );
}

function Resultados({ listo, techos, n, panel, kwp, kwAc, genAnual, consumoAnual, sinBat, conBat, batKwh, respaldoH, d, sitio, cargando, onProspecto }) {
  if (!listo) return <div className="card small muted">{!techos.length ? 'Dibuja al menos un techo para ver los resultados.' : cargando ? 'Calculando la generación hora a hora del sitio (puede tardar unos segundos)…' : !n ? 'No caben paneles: revisa el retiro, los obstáculos o dibuja un techo más grande.' : 'Escribe el consumo del cliente para ver el análisis.'}</div>;
  const E = [['Solo paneles', sinBat], ...(conBat ? [[`Con batería (${fmt(batKwh, 1)} kWh)`, conBat]] : [])];
  const auto = (e) => (e.sim.mes.reduce((a, m) => a + m.auto, 0) / Math.max(1, genAnual)) * 100;
  const cubre = (e) => (e.sim.mes.reduce((a, m) => a + m.auto, 0) / Math.max(1, consumoAnual)) * 100;
  const sum = (e, k) => e.fact.reduce((a, m) => a + m[k], 0);
  return (
    <div className="card dz-res">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2>Resultados</h2><button className="btn sm" onClick={onProspecto}><Icon name="star" size={14} />Agregar a prospectos</button></div>
      <div className="grid g4">
        <Stat label="Sistema" value={`${fmt(kwp, 2)} kWp`} sub={`${fmt(n)} × ${panel.w} W · inversor ${fmt(kwAc, 1)} kW`} />
        <Stat label="Generación anual" value={`${fmt(genAnual)} kWh`} sub={`${fmt((genAnual / Math.max(1, consumoAnual)) * 100)} % del consumo anual`} />
        <Stat label="Inversión" value={money(sinBat.cap.total)} sub={`${cop(sinBat.cap.porWp)} por Wp`} />
        <Stat label="Retorno" value={sinBat.fin.payback != null ? `${fmt(sinBat.fin.payback, 1)} años` : '> 25 años'} sub={sinBat.fin.tir != null ? `TIR ${fmt(sinBat.fin.tir, 1)} % · VPN ${money(sinBat.fin.vpn)}` : ''} />
      </div>
      <div className="dz-charts">
        <div><b className="small">Semana típica (kWh por día)</b><SemanaChart s={(conBat || sinBat).sim.semana} /></div>
        <div><b className="small">Día laboral y fin de semana (kW por hora)</b><DiaChart dia={(conBat || sinBat).sim.dia} /></div>
      </div>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th></th>{E.map(([l]) => <th key={l} className="num">{l}</th>)}</tr></thead><tbody>
        <tr><td>Inversión total</td>{E.map(([l, e]) => <td key={l} className="num">{money(e.cap.total)}</td>)}</tr>
        <tr><td>Energía solar usada en el sitio</td>{E.map(([l, e]) => <td key={l} className="num">{fmt(auto(e))} %</td>)}</tr>
        <tr><td>Consumo cubierto con energía propia</td>{E.map(([l, e]) => <td key={l} className="num">{fmt(cubre(e))} %</td>)}</tr>
        <tr><td>Energía comprada a la red (año)</td>{E.map(([l, e]) => <td key={l} className="num">{fmt(sum(e, 'imp'))} kWh</td>)}</tr>
        <tr><td>Excedentes permutados (año)</td>{E.map(([l, e]) => <td key={l} className="num">{fmt(sum(e, 'permuta'))} kWh</td>)}</tr>
        <tr><td>Excedentes vendidos a bolsa (año)</td>{E.map(([l, e]) => <td key={l} className="num">{fmt(sum(e, 'exceso'))} kWh</td>)}</tr>
        <tr><td>Factura mensual promedio (hoy {money(sinBat.facturaAntes / 12)})</td>{E.map(([l, e]) => <td key={l} className="num">{saldo(e.facturaDespues / 12)}</td>)}</tr>
        <tr><td>Ahorro el primer año</td>{E.map(([l, e]) => <td key={l} className="num">{money(e.ahorro1)}</td>)}</tr>
        <tr><td>Retorno</td>{E.map(([l, e]) => <td key={l} className="num">{e.fin.payback != null ? `${fmt(e.fin.payback, 1)} años` : '> 25'}</td>)}</tr>
        <tr><td>TIR · VPN ({d.f.descuento} %)</td>{E.map(([l, e]) => <td key={l} className="num">{e.fin.tir != null ? `${fmt(e.fin.tir, 1)} %` : '—'} · {money(e.fin.vpn)}</td>)}</tr>
        <tr><td>Costo nivelado de la energía</td>{E.map(([l, e]) => <td key={l} className="num">{e.fin.lcoe ? `${fmt(e.fin.lcoe)} $/kWh` : '—'}</td>)}</tr>
        <tr><td>Ahorro neto en {d.f.vida} años</td>{E.map(([l, e]) => <td key={l} className="num">{money(e.fin.neto)}</td>)}</tr>
        {d.f.financiado > 0 && <tr><td>Cuota mensual del crédito</td>{E.map(([l, e]) => <td key={l} className="num">{money(e.fin.cuota)}</td>)}</tr>}
        {conBat && <tr><td>Respaldo en un corte</td><td className="num">—</td><td className="num">{fmt(respaldoH, 1)} h</td></tr>}
      </tbody></table></div>
      <details><summary className="small">Factura mes a mes (solo paneles)</summary>
        <div className="tbl-wrap"><table className="tbl dz-mini"><thead><tr><th>Mes</th><th className="num">Consumo</th><th className="num">Solar</th><th className="num">Importa</th><th className="num">Exporta</th><th className="num">Factura hoy</th><th className="num">Con solar</th></tr></thead><tbody>
          {sinBat.fact.map((m) => <tr key={m.mes}><td>{MES[m.mes]}</td><td className="num">{fmt(m.consumo)}</td><td className="num">{fmt(m.gen)}</td><td className="num">{fmt(m.imp)}</td><td className="num">{fmt(m.exp)}</td><td className="num">{money(m.sin)}</td><td className="num">{saldo(m.con)}</td></tr>)}
        </tbody></table></div>
      </details>
      <p className="small muted" style={{ margin: 0 }}>Simulación hora a hora de un año con la producción estimada con radiación satelital del sitio (14 % de pérdidas del sistema) y el perfil de consumo elegido. La degradación y los aumentos de tarifa de los años siguientes se aplican sobre el ahorro del primer año. Estimación de referencia: no reemplaza el diseño de detalle.</p>
    </div>
  );
}

// Una factura negativa es saldo a favor del cliente (excedentes vendidos a la red)
export const saldo = (v) => (v < 0 ? `${money(-v)} a favor` : money(v));

export function SemanaChart({ s, light }) {
  const W = 420, H = 150, max = Math.max(...s.map((x) => Math.max(x.consumo, x.gen))) * 1.1 || 1, bw = 18;
  const y = (v) => (v / max) * (H - 30);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className={light ? 'r2-chart' : 'chart-dark'} role="img" aria-label="Energía por día de la semana">
      {s.map((x, i) => { const bx = 20 + i * 57; return (
        <g key={i}>
          <rect x={bx} y={H - 20 - y(x.consumo)} width={bw} height={y(x.consumo)} rx="2" fill="#8A93B8"><title>{`Consumo: ${fmt(x.consumo)} kWh`}</title></rect>
          <rect x={bx + bw + 3} y={H - 20 - y(x.gen)} width={bw} height={y(x.gen)} rx="2" fill="#FF7A00" opacity="0.35"><title>{`Generación: ${fmt(x.gen)} kWh`}</title></rect>
          <rect x={bx + bw + 3} y={H - 20 - y(x.auto)} width={bw} height={y(x.auto)} rx="2" fill="#FF7A00"><title>{`Usada en el sitio: ${fmt(x.auto)} kWh`}</title></rect>
          <text x={bx + bw} y={H - 5} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.75">{DIA[i]}</text>
        </g>); })}
    </svg>
  );
}

export function DiaChart({ dia, light }) {
  const W = 420, H = 150;
  const max = Math.max(...dia.lab.load, ...dia.lab.gen, ...dia.fin.load, ...dia.fin.gen) * 1.1 || 1;
  const x = (h) => 20 + (h / 23) * (W - 30), y = (v) => H - 20 - (v / max) * (H - 30);
  const line = (a) => a.map((v, h) => `${x(h)},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className={light ? 'r2-chart' : 'chart-dark'} role="img" aria-label="Perfil horario de un día laboral y de fin de semana">
      <polygon points={`${x(0)},${H - 20} ${line(dia.lab.gen)} ${x(23)},${H - 20}`} fill="#FF7A00" opacity="0.18" />
      <polyline points={line(dia.lab.gen)} fill="none" stroke="#FF7A00" strokeWidth="2" />
      <polyline points={line(dia.lab.load)} fill="none" stroke="currentColor" strokeWidth="2" opacity="0.85" />
      <polyline points={line(dia.fin.load)} fill="none" stroke="#5FD3A0" strokeWidth="2" strokeDasharray="5 3" />
      {[0, 6, 12, 18, 23].map((h) => <text key={h} x={x(h)} y={H - 5} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.7">{h}h</text>)}
      <text x={W - 6} y={12} textAnchor="end" fontSize="10" fill="currentColor" opacity="0.75">— consumo laboral  - - fin de semana  ▬ solar</text>
    </svg>
  );
}
