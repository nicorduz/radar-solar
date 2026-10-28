// Motor del módulo de diseño solar:
//  1) acomodo de paneles en techos planos e inclinados, con retiros, obstáculos y separación anti-sombra
//  2) simulación hora a hora (8.760 h) de consumo, generación, batería, autoconsumo, excedentes e importación
//  3) facturación según la regla colombiana de autogeneradores (CREG 174 de 2021): permuta mensual y excedentes a bolsa
//  4) costos detallados y flujo financiero a 25 años
// Son estimaciones de ingeniería básica: no reemplazan el diseño de detalle.

const M_LAT = 110540;
const mLon = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
const toXY = (o) => ([lon, lat]) => [(lon - o[0]) * mLon(o[1]), (lat - o[1]) * M_LAT];
const toLL = (o) => ([x, y]) => [o[0] + x / mLon(o[1]), o[1] + y / M_LAT];
const rot = (a) => ([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
const R = Math.PI / 180;

// ---------- Geometría ----------
function inPoly([x, y], poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function ptSeg([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
function segsCross(a, b, c, d) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}
const segSeg = (a, b, c, d) => (segsCross(a, b, c, d) ? 0 : Math.min(ptSeg(a, c, d), ptSeg(b, c, d), ptSeg(c, a, b), ptSeg(d, a, b)));
// Distancia mínima entre el borde de un rectángulo y el borde de un polígono (0 si se cruzan)
function rectPolyDist(rect, poly) {
  let m = Infinity;
  for (let i = 0; i < 4; i++) for (let j = 0; j < poly.length; j++) {
    m = Math.min(m, segSeg(rect[i], rect[(i + 1) % 4], poly[j], poly[(j + 1) % poly.length]));
    if (m === 0) return 0;
  }
  return m;
}

export function polyArea(pts) {
  if (pts.length < 3) return 0;
  const o = pts[0], xy = pts.map(toXY(o));
  let s = 0;
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; s += x1 * y2 - x2 * y1; }
  return Math.abs(s) / 2;
}
export const centro = (pts) => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];

// Orientación del lado más largo (grados matemáticos, desde el este, antihorario)
export function edgeAngle(pts) {
  const o = pts[0], xy = pts.map(toXY(o));
  let best = 0, bl = 0;
  xy.forEach((a, i) => { const b = xy[(i + 1) % xy.length]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; best = Math.atan2(b[1] - a[1], b[0] - a[0]); } });
  return best / R;
}
// Azimut PVGIS (0 = sur, -90 = este, 90 = oeste, 180 = norte) a dirección en el plano (grados matemáticos)
const aspectToMath = (asp) => -90 - asp;
// Para techo plano "alineado con el edificio": de las 4 caras perpendiculares al lado largo, la que más mira al sur
export function aspectAlineado(pts) {
  const e = edgeAngle(pts);
  const opts = [0, 90, 180, 270].map((k) => e + k);
  const toAsp = (m) => { let a = -90 - m; a = ((a + 180) % 360 + 360) % 360 - 180; return a; };
  return opts.map(toAsp).sort((a, b) => Math.abs(a) - Math.abs(b))[0];
}

// Separación entre filas para que una fila no sombree a la siguiente entre 9:00 y 15:00 el día más desfavorable del año
export function pasilloSombra({ lat, largo, tilt, aspect }) {
  if (!tilt) return 0.02;
  let peor = 0;
  for (const decl of [-23.44, 23.44]) for (const w of [-45, -30, -15, 0, 15, 30, 45]) {
    const sinA = Math.sin(lat * R) * Math.sin(decl * R) + Math.cos(lat * R) * Math.cos(decl * R) * Math.cos(w * R);
    const alt = Math.asin(sinA); if (alt <= 5 * R) continue;
    // azimut solar desde el sur, positivo hacia el oeste
    const az = Math.atan2(Math.sin(w * R), Math.cos(w * R) * Math.sin(lat * R) - Math.tan(decl * R) * Math.cos(lat * R));
    const proy = Math.cos(az - aspect * R); // componente de la sombra hacia atrás de la fila
    if (proy <= 0) continue;
    peor = Math.max(peor, ((largo * Math.sin(tilt * R)) * proy) / Math.tan(alt));
  }
  return Math.max(0.02, +peor.toFixed(2));
}

/**
 * Acomoda paneles en una cara de techo.
 * techo: { pts, tipo: 'plano'|'inclinado', pend, aspect, setback, tiltPlano, aspectPlano, pasillo }
 * Devuelve { paneles: [anillos lon/lat], info }
 */
export function acomodar(techo, panel, { obstaculos = [], orient = 'auto', gap = 0.02, lat = 5 } = {}) {
  const pts = techo.pts;
  if (!pts || pts.length < 3) return { paneles: [], info: null };
  const o = pts[0];
  const inclinado = techo.tipo === 'inclinado';
  const tilt = inclinado ? +techo.pend || 0 : +techo.tiltPlano || 0;
  const aspect = inclinado ? +techo.aspect || 0 : +techo.aspectPlano || 0;
  // Se gira el plano para que el frente de los paneles (o la caída del techo) quede hacia -y
  const a = (aspectToMath(aspect) + 90) * R;
  const poly = pts.map(toXY(o)).map(rot(-a));
  const obs = obstaculos.map((ob) => ({ poly: ob.pts.map(toXY(o)).map(rot(-a)), m: +ob.margen || 0.3 }));
  const sb = +techo.setback || 0;
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const L = panel.largo / 1000, W = panel.ancho / 1000;
  const intentos = orient === 'auto' ? ['vertical', 'horizontal'] : [orient];
  let mejor = { lista: [], orient: intentos[0], pasillo: 0 };
  for (const ori of intentos) {
    const lado = ori === 'vertical' ? L : W; // dimensión en el sentido de la pendiente o de la inclinación
    const ancho = ori === 'vertical' ? W : L;
    const fondo = lado * Math.cos(tilt * R); // proyección en planta
    const pasillo = inclinado ? gap : (techo.pasillo === '' || techo.pasillo == null ? pasilloSombra({ lat, largo: lado, tilt, aspect }) : +techo.pasillo);
    const px = ancho + gap, py = fondo + pasillo;
    // Prueba varios desplazamientos de la grilla y se queda con el que más paneles acomoda
    for (let ox = 0; ox < 4; ox++) for (let oy = 0; oy < 4; oy++) {
      const lista = [];
      for (let y = minY + sb + (oy * py) / 4; y + fondo <= maxY - sb + 1e-6; y += py) {
        for (let x = minX + sb + (ox * px) / 4; x + ancho <= maxX - sb + 1e-6; x += px) {
          const r = [[x, y], [x + ancho, y], [x + ancho, y + fondo], [x, y + fondo]];
          if (!r.every((p) => inPoly(p, poly))) continue;
          if (rectPolyDist(r, poly) < sb - 1e-6) continue;
          if (obs.some((ob) => ob.poly.some((p) => inPoly(p, r)) || r.some((p) => inPoly(p, ob.poly)) || rectPolyDist(r, ob.poly) < ob.m)) continue;
          lista.push({ r, cx: x + ancho / 2, cy: y + fondo / 2 });
        }
      }
      if (lista.length > mejor.lista.length) mejor = { lista, orient: ori, pasillo, fondo, ancho };
    }
  }
  // Orden: del centro hacia afuera (si se usan menos paneles quedan agrupados)
  const n = mejor.lista.length || 1;
  const mx = mejor.lista.reduce((s, p) => s + p.cx, 0) / n, my = mejor.lista.reduce((s, p) => s + p.cy, 0) / n;
  mejor.lista.sort((p, q) => Math.hypot(p.cx - mx, (p.cy - my) * 1.5) - Math.hypot(q.cx - mx, (q.cy - my) * 1.5));
  const areaPlano = polyArea(pts);
  const areaObs = obstaculos.reduce((s, ob) => s + polyArea(ob.pts), 0);
  return {
    paneles: mejor.lista.map((p) => [...p.r, p.r[0]].map(rot(a)).map(toLL(o))),
    info: {
      orient: mejor.orient, pasillo: mejor.pasillo, tilt, aspect, n: mejor.lista.length,
      areaPlano, areaReal: inclinado ? areaPlano / Math.cos(tilt * R) : areaPlano, areaObs,
      areaPaneles: mejor.lista.length * L * W,
    },
  };
}

// ---------- Consumo ----------
export const PERFILES_SEMANA = {
  uniforme: ['Igual todos los días', [1, 1, 1, 1, 1, 1, 1]],
  hogar: ['Hogar (más los fines de semana)', [0.95, 0.95, 0.95, 0.95, 1, 1.1, 1.1]],
  oficina: ['Oficina (lunes a viernes)', [1.25, 1.25, 1.25, 1.25, 1.2, 0.5, 0.3]],
  comercio: ['Comercio (lunes a sábado)', [1, 1, 1, 1, 1.1, 1.25, 0.65]],
  recreativo: ['Recreativo (fines de semana)', [0.35, 0.35, 0.35, 0.4, 0.75, 2.4, 2.4]],
  hotel: ['Hotel turístico', [0.8, 0.8, 0.8, 0.85, 1.15, 1.35, 1.25]],
  industria: ['Industria (6 días)', [1.1, 1.1, 1.1, 1.1, 1.1, 1, 0.5]],
};
const P = (arr) => { const s = arr.reduce((a, b) => a + b, 0); return arr.map((v) => v / s); };
export const PERFILES_HORA = {
  hogar: ['Hogar (picos mañana y noche)', P([0.6, 0.5, 0.5, 0.5, 0.5, 0.7, 1.0, 1.1, 0.9, 0.8, 0.8, 0.9, 1.0, 0.9, 0.8, 0.8, 0.9, 1.1, 1.5, 1.7, 1.6, 1.3, 1.0, 0.8])],
  oficina: ['Oficina (8 a 18 h)', P([0.3, 0.3, 0.3, 0.3, 0.3, 0.4, 0.7, 1.3, 1.8, 1.9, 1.9, 1.8, 1.6, 1.8, 1.9, 1.9, 1.7, 1.2, 0.7, 0.5, 0.4, 0.3, 0.3, 0.3])],
  comercio: ['Comercio (9 a 20 h)', P([0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.5, 0.8, 1.3, 1.6, 1.7, 1.8, 1.8, 1.8, 1.8, 1.8, 1.8, 1.7, 1.6, 1.4, 1.0, 0.6, 0.4, 0.3])],
  hotel: ['Hotel (aire acondicionado y noche)', P([1.0, 0.9, 0.9, 0.9, 0.9, 1.0, 1.1, 1.2, 1.1, 1.0, 1.0, 1.1, 1.2, 1.3, 1.3, 1.2, 1.1, 1.1, 1.2, 1.3, 1.3, 1.2, 1.1, 1.0])],
  recreativo: ['Recreativo diurno (piscinas, bombas)', P([0.2, 0.2, 0.2, 0.2, 0.2, 0.3, 0.6, 1.2, 1.7, 2.0, 2.1, 2.1, 2.1, 2.1, 2.1, 2.0, 1.8, 1.3, 0.8, 0.5, 0.4, 0.3, 0.2, 0.2])],
  industria: ['Industria 24 horas', P([1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.05, 1.05, 1.05, 1.05, 1.05, 1.0, 1.05, 1.05, 1.05, 1.05, 1.0, 1.0, 0.95, 0.95, 0.95, 0.95, 0.95])],
  bombeo: ['Bombeo y riego (horas de sol)', P([0, 0, 0, 0, 0, 0, 0.2, 0.8, 1.5, 2.0, 2.2, 2.3, 2.3, 2.3, 2.2, 2.0, 1.5, 0.8, 0.2, 0, 0, 0, 0, 0])],
};
const DIAS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const PRIMER_DIA = 3; // 1 de enero de 2026 es jueves (0 = lunes)

/**
 * Simulación horaria de un año.
 * consumoMes: 12 valores en kWh; semana: 7 pesos (lunes a domingo); hora: 24 pesos; gen: 8.760 kWh
 * bat: { util (kWh), kw } o null
 */
export function simular({ consumoMes, semana, hora, gen, bat }) {
  const usable = bat?.util || 0, pmax = bat?.kw || 0, ec = 0.95, ed = 0.95;
  let soc = usable * 0.5;
  const mes = Array.from({ length: 12 }, () => ({ consumo: 0, gen: 0, directo: 0, bateria: 0, exp: 0, imp: 0 }));
  const sem = Array.from({ length: 7 }, () => ({ consumo: 0, gen: 0, auto: 0, exp: 0, imp: 0, n: 0 }));
  const dia = { lab: { load: Array(24).fill(0), gen: Array(24).fill(0), auto: Array(24).fill(0), bat: Array(24).fill(0), n: 0 }, fin: { load: Array(24).fill(0), gen: Array(24).fill(0), auto: Array(24).fill(0), bat: Array(24).fill(0), n: 0 } };
  let d = 0, i = 0;
  for (let m = 0; m < 12; m++) {
    let pesoMes = 0;
    for (let k = 0; k < DIAS[m]; k++) pesoMes += semana[(PRIMER_DIA + d + k) % 7];
    for (let k = 0; k < DIAS[m]; k++, d++) {
      const dow = (PRIMER_DIA + d) % 7;
      const kwhDia = (consumoMes[m] * semana[dow]) / (pesoMes || 1);
      const tipoDia = dow >= 5 ? dia.fin : dia.lab; tipoDia.n++;
      const s = sem[dow]; s.n++;
      for (let h = 0; h < 24; h++, i++) {
        const L = kwhDia * hora[h], G = gen[i] || 0;
        const directo = Math.min(L, G);
        let sobra = G - directo, falta = L - directo, carga = 0, desc = 0;
        if (usable) {
          carga = Math.min(sobra, pmax, (usable - soc) / ec); soc += carga * ec; sobra -= carga;
          desc = Math.min(falta, pmax, soc * ed); soc -= desc / ed; falta -= desc;
        }
        const M = mes[m]; M.consumo += L; M.gen += G; M.directo += directo; M.bateria += desc; M.exp += sobra; M.imp += falta;
        s.consumo += L; s.gen += G; s.auto += directo + desc; s.exp += sobra; s.imp += falta;
        tipoDia.load[h] += L; tipoDia.gen[h] += G; tipoDia.auto[h] += directo; tipoDia.bat[h] += desc;
      }
    }
  }
  for (const t of [dia.lab, dia.fin]) for (const k of ['load', 'gen', 'auto', 'bat']) t[k] = t[k].map((v) => v / (t.n || 1));
  return {
    mes: mes.map((x, k) => ({ ...x, mes: k, auto: x.directo + x.bateria })),
    semana: sem.map((x) => ({ consumo: x.consumo / (x.n || 1), gen: x.gen / (x.n || 1), auto: x.auto / (x.n || 1), exp: x.exp / (x.n || 1), imp: x.imp / (x.n || 1) })),
    dia,
  };
}

/**
 * Factura mensual con la regla de autogeneradores a pequeña escala (CREG 174 de 2021):
 *  - Energía importada de la red: se paga a la tarifa (más contribución si aplica).
 *  - Excedentes hasta lo importado en el mes: se "permutan". Hasta 100 kW se descuentan al costo unitario
 *    menos el componente de comercialización; entre 100 kW y 1 MW se reconoce solo el componente de generación.
 *  - Excedentes por encima de lo importado: se pagan a precio de bolsa.
 */
export function facturar(mes, { tarifa, contribucion, cvPct, gPct, bolsa, kwAc }) {
  const costoKwh = tarifa * (1 + (contribucion ? 0.2 : 0));
  const credito = kwAc <= 100 ? tarifa * (1 - cvPct / 100) : tarifa * (gPct / 100);
  return mes.map((m) => {
    const permuta = Math.min(m.exp, m.imp), exceso = Math.max(0, m.exp - m.imp);
    const sin = m.consumo * costoKwh;
    const pagaRed = m.imp * costoKwh, descuento = permuta * credito, venta = exceso * bolsa;
    const con = pagaRed - descuento - venta;
    return { ...m, permuta, exceso, sin, pagaRed, descuento, venta, con, ahorro: sin - con };
  });
}

// ---------- Costos ----------
export const COSTOS_BASE = {
  modulo: 800, inversor: 450, hibrido: 750, estructura: 300, electrico: 300, mano: 400, ingenieria: 2000000, transporte: 3, margen: 18, batKwh: 2500000, iva: 19, ivaExcluido: false,
};
export function capex(c, { kwp, kwAc, batKwh, hibrido }) {
  const wp = kwp * 1000;
  const items = [
    ['Módulos solares', wp * c.modulo, true],
    [hibrido ? 'Inversor híbrido' : 'Inversor', kwAc * 1000 * (hibrido ? c.hibrido : c.inversor), true],
    ['Estructura de montaje', wp * c.estructura, true],
    ['Material eléctrico y protecciones', wp * c.electrico, true],
    ...(batKwh ? [['Baterías', batKwh * c.batKwh, true]] : []),
    ['Mano de obra de instalación', wp * c.mano, false],
    ['Ingeniería, trámites y certificación', +c.ingenieria || 0, false],
  ];
  const directo = items.reduce((a, x) => a + x[1], 0);
  const transporte = directo * (c.transporte / 100);
  const margen = (directo + transporte) * (c.margen / 100);
  const base = directo + transporte + margen;
  const iva = c.ivaExcluido ? 0 : base * (c.iva / 100);
  return { items: [...items.map(([n, v]) => [n, v]), ['Transporte y otros', transporte], ['Utilidad del instalador', margen]], subtotal: base, iva, total: base + iva, porWp: wp ? (base + iva) / wp : 0 };
}

// ---------- Finanzas a 25 años ----------
export function finanzas({ inversion, ahorro1, gen1, costoInv, costoBat, f, empresa }) {
  const t = empresa ? f.renta / 100 : 0;
  const loan = inversion * (f.financiado / 100);
  const n = Math.max(1, Math.round(f.plazo));
  const rm = Math.pow(1 + f.tasa / 100, 1 / 12) - 1;
  const cuota = loan ? (rm ? (loan * rm) / (1 - Math.pow(1 + rm, -12 * n)) : loan / (12 * n)) : 0;
  let saldo = loan, acum = -(inversion - loan), deducPend = empresa && f.deduccion ? inversion * 0.5 : 0;
  const deducAnual = deducPend / Math.max(1, Math.min(15, f.deducAnios));
  const depAnios = f.depAcelerada ? 3 : 10;
  const serie = [];
  let payback = null, vpCost = inversion, vpGen = 0, sinHacer = 0;
  const flujos = [-(inversion - loan)];
  for (let y = 1; y <= f.vida; y++) {
    const esc = Math.pow(1 + f.incr / 100, y - 1), dg = Math.pow(1 - f.degr / 100, y - 1), disc = Math.pow(1 + f.descuento / 100, y);
    const ahorro = ahorro1 * esc * dg;
    const om = inversion * (f.om / 100) * esc;
    const reemp = (y === +f.invAnio ? costoInv * (f.invPct / 100) : 0) + (costoBat && y === +f.batAnio ? costoBat * (f.batPct / 100) : 0);
    let deuda = 0, interes = 0;
    if (y <= n && loan) { for (let k = 0; k < 12; k++) { const i = saldo * rm; interes += i; saldo -= cuota - i; } deuda = cuota * 12; }
    let imp = 0;
    if (empresa) {
      const dep = y <= depAnios ? inversion / depAnios : 0;
      const ded = Math.min(deducPend, deducAnual); deducPend -= ded;
      imp = -(ahorro - om) * t + (dep + interes + ded) * t;
    }
    const flujo = ahorro - om - reemp - deuda + imp;
    const prev = acum; acum += flujo;
    if (payback == null && acum >= 0 && flujo > 0) payback = y - 1 + -prev / flujo;
    vpCost += (om + reemp) / disc; vpGen += (gen1 * dg) / disc;
    sinHacer += 0; // se calcula afuera con la factura sin sistema
    flujos.push(flujo);
    serie.push({ y, ahorro, om, reemp, deuda, impuestos: imp, flujo, acum });
  }
  const npv = (r) => flujos.reduce((a, v, i) => a + v / Math.pow(1 + r, i), 0);
  let tir = null;
  if (flujos[0] < 0 && npv(0) > 0) { let lo = 0, hi = 3; for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; } tir = lo * 100; }
  return { serie, payback, neto: acum, vpn: npv(f.descuento / 100), tir, lcoe: vpGen ? vpCost / vpGen : null, cuota, loan };
}
