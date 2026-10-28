import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';

// Estilo satelital gratuito con nombres de lugares encima
export function satStyle(sat) {
  return {
    version: 8,
    sources: {
      // maxzoom 18: más allá se amplía la última imagen disponible (evita el aviso "Map data not yet available")
      sat: { type: 'raster', tiles: [sat?.tiles || 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18, attribution: sat?.attribution || 'Imágenes © Esri' },
      labels: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18 },
    },
    layers: [{ id: 'sat', type: 'raster', source: 'sat' }, { id: 'labels', type: 'raster', source: 'labels', maxzoom: 17 }],
  };
}

// Dibuja figuras de la zona sobre la imagen satelital
export function addShapes(map, fc) {
  map.addSource('zona', { type: 'geojson', data: fc });
  map.addLayer({ id: 'zona-fill', type: 'fill', source: 'zona', filter: ['==', ['get', 'k'], 'zona'], paint: { 'fill-color': '#3478F6', 'fill-opacity': 0.18 } });
  map.addLayer({ id: 'zona-line', type: 'line', source: 'zona', filter: ['==', ['get', 'k'], 'zona'], paint: { 'line-color': '#FFB266', 'line-width': 3 } });
  map.addLayer({ id: 'panel-fill', type: 'fill', source: 'zona', filter: ['==', ['get', 'k'], 'panel'], paint: { 'fill-color': '#0B2A6B', 'fill-opacity': 0.95 } });
  map.addLayer({ id: 'panel-line', type: 'line', source: 'zona', filter: ['==', ['get', 'k'], 'panel'], paint: { 'line-color': '#A8C5FF', 'line-width': 0.8 } });
  map.addLayer({ id: 'punto', type: 'circle', source: 'zona', filter: ['==', ['get', 'k'], 'punto'], paint: { 'circle-radius': 9, 'circle-color': '#FF7A00', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 3 } });
}

const bboxOf = (fc) => {
  let b = [180, 90, -180, -90];
  const walk = (c) => (typeof c[0] === 'number' ? (b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]) : c.forEach(walk));
  fc.features.forEach((f) => walk(f.geometry.coordinates));
  return b;
};

// Toma una foto satelital de la zona y la devuelve como imagen (para los informes en PDF)
export default function MapSnapshot({ sat, fc, zoom = 16, width = 1000, height = 520, alt = 'Imagen satelital de la zona', className = 'doc-img' }) {
  const el = useRef(null);
  const [img, setImg] = useState(null);
  const [err, setErr] = useState(false);
  const key = JSON.stringify(fc);
  useEffect(() => {
    if (!el.current || !fc?.features?.length) return;
    setImg(null); setErr(false);
    const b = bboxOf(fc);
    const single = b[0] === b[2] && b[1] === b[3];
    let done = false;
    const map = new maplibregl.Map({
      container: el.current, style: satStyle(sat), interactive: false, attributionControl: false, fadeDuration: 0,
      canvasContextAttributes: { preserveDrawingBuffer: true }, preserveDrawingBuffer: true,
      ...(single ? { center: [b[0], b[1]], zoom } : { bounds: [[b[0], b[1]], [b[2], b[3]]], fitBoundsOptions: { padding: 50, maxZoom: 19 } }),
    });
    const shot = () => { if (done) return; done = true; try { setImg(map.getCanvas().toDataURL('image/jpeg', 0.88)); } catch { setErr(true); } setTimeout(() => map.remove(), 50); };
    map.on('load', () => { addShapes(map, fc); map.once('idle', shot); });
    const t = setTimeout(shot, 15000);
    map.on('error', () => {});
    return () => { clearTimeout(t); if (!done) { done = true; map.remove(); } };
  }, [key]);
  return (
    <figure className={className}>
      {!img && <div ref={el} className="snap-host" style={{ width, height }} aria-hidden="true" />}
      {img ? <img src={img} alt={alt} /> : <div className="snap-wait">{err ? 'No se pudo generar la imagen' : 'Generando imagen satelital…'}</div>}
      <figcaption>{sat?.attribution || 'Imágenes © Esri'}</figcaption>
    </figure>
  );
}
