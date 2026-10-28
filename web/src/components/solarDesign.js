// Cálculos del módulo de diseño solar: llenado automático de paneles en un techo,
// generación, balance con y sin baterías, y retorno de la inversión. Son estimaciones generales.

const M_LAT = 110540;
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
const toXY = (o) => ([lon, lat]) => [(lon - o[0]) * mLon(o[1]), (lat - o[1]) * M_LAT];
const toLL = (o) => ([x, y]) => [o[0] + x / mLon(o[1]), o[1] + y / M_LAT];
const rot = (a) => ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

function inPoly([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
const edgeDist = (p, poly) => Math.min(...poly.map((a, i) => segDist(p, a, poly[(i + 1) % poly.length])));

export function polyArea(pts) {
  if (pts.length < 3) return 0;
  const o = pts[0], xy = pts.map(toXY(o));
  let s = 0;
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; s += x1 * y2 - x2 * y1; }
  return Math.abs(s) / 2;
}

// Ángulo (grados) del lado más largo del polígono: las filas de paneles se alinean con él
export function autoAngle(pts) {
  const o = pts[0], xy = pts.map(toXY(o));
  let best = 0, bl = 0;
  xy.forEach((a, i) => { const b = xy[(i + 1) % xy.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; best = Math.atan2(b[1] - a[1], b[0] - a[0]); } });
  return (best * 180) / Math.PI;
}

// Llena el polígono con paneles (rectángulos) respetando un retroceso desde el borde
export function fillPanels(pts, { largo, ancho, orient = 'vertical', setback = 0.6, gap = 0.02, rowGap = 0.3, angle = 0, max = 4000 }) {
  if (pts.length < 3) return [];
  const o = pts[0];
  const a = (angle * Math.PI) / 180;
  const poly = pts.map(toXY(o)).map(rot(-a));
  const w = (orient === 'vertical' ? ancho : largo) / 1000, h = (orient === 'vertical' ? largo : ancho) / 1000;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out = [];
  const ok = (p) => inPoly(p, poly) && edgeDist(p, poly) >= setback - 1e-6;
  for (let y = minY + setback; y + h <= maxY - setback + 1e-6 && out.length < max; y += h + rowGap) {
    for (let x = minX + setback; x + w <= maxX - setback + 1e-6 && out.length < max; x += w + gap) {
      const c = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      if (c.every(ok) && ok([x + w / 2, y + h / 2])) out.push({ cx: x + w / 2, cy: y + h / 2, r: [...c, c[0]].map(rot(a)).map(toLL(o)) });
    }
  }
  // Ordena del centro hacia afuera: si se usan menos paneles, quedan agrupados en el medio del techo
  const mx = out.reduce((s, p) => s + p.cx, 0) / (out.length || 1), my = out.reduce((s, p) => s + p.cy, 0) / (out.length || 1);
  return out.sort((p, q) => Math.hypot(p.cx - mx, (p.cy - my) * 1.6) - Math.hypot(q.cx - mx, (q.cy - my) * 1.6)).map((p) => p.r);
}

// Balance energético mensual con y sin batería (perfil diario simplificado)
export function balance({ consumo, gen, diaFrac, bat }) {
  const dias = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const usable = bat ? bat.kwh * bat.dod * (bat.n || 1) : 0;
  return consumo.map((c, i) => {
    const d = dias[i], L = c / d, G = gen[i] / d;
    const dia = Math.min(G, L * diaFrac);
    let exp = G - dia, imp = L - dia, desc = 0;
    if (usable) { const carga = Math.min(exp, usable); desc = Math.min(carga * 0.92, L * (1 - diaFrac)); exp -= carga; imp -= desc; }
    return { mes: i, consumo: c, gen: gen[i], auto: (dia + desc) * d, exp: Math.max(0, exp) * d, imp: Math.max(0, imp) * d };
  });
}

// Flujo de 25 años: ahorro escalado por tarifa, degradación de paneles, mantenimiento y reemplazo de batería.
// Cada mes se paga la energía importada y se reconoce la exportada al precio de excedentes.
export function roi({ costo, mensual, tarifa, precioExc, incr = 4, degr = 0.5, om = 1, vida = 25, reemplazo = 0, anioReemplazo = 12 }) {
  const facturaAntes = mensual.reduce((a, m) => a + m.consumo, 0) * tarifa;
  const netoMes = mensual.map((m) => m.imp * tarifa - m.exp * precioExc);
  const facturaDespues = netoMes.reduce((a, b) => a + b, 0);
  const ahorroBase = facturaAntes - facturaDespues;
  let acum = -costo, payback = null, sinHacer = 0;
  const serie = [];
  for (let y = 1; y <= vida; y++) {
    const esc = Math.pow(1 + incr / 100, y - 1), dg = Math.pow(1 - degr / 100, y - 1);
    const ahorro = ahorroBase * esc * dg;
    const flujo = ahorro - costo * (om / 100) * esc - (y === anioReemplazo ? reemplazo : 0);
    const prev = acum; acum += flujo;
    if (payback == null && acum >= 0 && flujo > 0) payback = y - 1 + -prev / flujo;
    sinHacer += facturaAntes * esc;
    serie.push({ y, ahorro, flujo, acum, sinHacer, facturaSin: facturaAntes * esc });
  }
  return { facturaAntes, facturaDespues, netoMes, ahorro1: ahorroBase, payback, neto: acum, sinHacer, serie };
}
