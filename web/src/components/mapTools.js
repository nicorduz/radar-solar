// Herramientas de dibujo y medición del mapa: geometría simple sobre la esfera (sin librerías externas).
const R = 6371008.8; // radio medio de la Tierra en metros
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

export function distance([lon1, lat1], [lon2, lat2]) {
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function destination([lon, lat], dist, bearingDeg) {
  const d = dist / R, b = rad(bearingDeg), p1 = rad(lat), l1 = rad(lon);
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
  const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [deg(l2), deg(p2)];
}
export const circleRing = (center, r, n = 72) => Array.from({ length: n + 1 }, (_, i) => destination(center, r, (i * 360) / n));
export const rectRing = ([a, b]) => [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]], [a[0], a[1]]];
export function pathLength(path) { let s = 0; for (let i = 1; i < path.length; i++) s += distance(path[i - 1], path[i]); return s; }
// Área de un polígono en m² (fórmula esférica de Chamberlain y Duquette)
export function area(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [l1, p1] = ring[i], [l2, p2] = ring[i + 1];
    s += rad(l2 - l1) * (2 + Math.sin(rad(p1)) + Math.sin(rad(p2)));
  }
  return Math.abs((s * R * R) / 2);
}
export function centroid(ring) {
  const pts = ring.slice(0, -1).length ? ring.slice(0, -1) : ring;
  return [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
}
export function inside([x, y], ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toLocaleString('es-CO', { maximumFractionDigits: m >= 100000 ? 0 : 1 })} km` : `${Math.round(m)} m`);
export const fmtArea = (m2) => (m2 >= 1e6 ? `${(m2 / 1e6).toLocaleString('es-CO', { maximumFractionDigits: m2 >= 1e8 ? 0 : 1 })} km²` : m2 >= 1e4 ? `${(m2 / 1e4).toLocaleString('es-CO', { maximumFractionDigits: 1 })} ha` : `${Math.round(m2).toLocaleString('es-CO')} m²`);

// Anillo (polígono cerrado) de una figura; null si no tiene área
export function ringOf(s) {
  if (s.type === 'circle') return circleRing(s.center, s.r);
  if (s.type === 'rect') return rectRing(s.pts);
  if (s.type === 'polygon') return [...s.pts, s.pts[0]];
  return null;
}
// Texto con las medidas de una figura
export function measureOf(s) {
  if (s.type === 'circle') return `Radio ${fmtDist(s.r)} · ${fmtArea(Math.PI * s.r * s.r)}`;
  if (s.type === 'rect' || s.type === 'polygon') { const ring = ringOf(s); return `${fmtArea(area(ring))} · perímetro ${fmtDist(pathLength(ring))}`; }
  if (s.type === 'measure') return `Distancia ${fmtDist(pathLength(s.pts))}`;
  if (s.type === 'point') return `${s.pts[0][1].toFixed(5)}, ${s.pts[0][0].toFixed(5)}`;
  return '';
}

// Interpreta "4.6097, -74.0817" o "4,6097 -74,0817" como coordenadas (lat, lon)
export function parseCoords(q) {
  const m = String(q).trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return [lon, lat];
}
export const normTxt = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Búsqueda de direcciones y lugares con OpenStreetMap (Nominatim), limitada a Colombia
export async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=co&accept-language=es&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) return [];
  const j = await r.json();
  return j.map((x) => ({ label: x.display_name.split(',').slice(0, 3).join(','), sub: x.display_name.split(',').slice(3, 5).join(',').trim(), pos: [+x.lon, +x.lat], zoom: x.type === 'administrative' || x.addresstype === 'city' || x.addresstype === 'town' ? 11 : 16 }));
}
