// Modelos 3D del mapa, construidos con cajas y cilindros (sin archivos externos).
// Unidades en metros a escala 1; el mapa los agranda según el zoom para que se lean.
// Eje x = este, y = norte, z = arriba. Colores por vértice; el sombreado lo hace deck.gl (caras planas).

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

function Builder() {
  const pos = [], col = [];
  const tri = (a, b, c, k) => { pos.push(...a, ...b, ...c); col.push(...k, ...k, ...k); };
  const quad = (a, b, c, d, k) => { tri(a, b, c, k); tri(a, c, d, k); };
  // Transformación: giro en x (inclinación), giro en z, luego traslado
  const tf = (p, o = {}) => {
    let [x, y, z] = p;
    if (o.rx) { const c = Math.cos(o.rx), s = Math.sin(o.rx); [y, z] = [y * c - z * s, y * s + z * c]; }
    if (o.ry) { const c = Math.cos(o.ry), s = Math.sin(o.ry); [x, z] = [x * c + z * s, -x * s + z * c]; }
    if (o.rz) { const c = Math.cos(o.rz), s = Math.sin(o.rz); [x, y] = [x * c - y * s, x * s + y * c]; }
    return [x + (o.x || 0), y + (o.y || 0), z + (o.z || 0)];
  };
  const api = {
    // Caja con centro en (x, y) y base en z
    box(x, y, z, w, d, h, color, o = {}) {
      const k = hex(color), W = w / 2, D = d / 2;
      const v = [[-W, -D, 0], [W, -D, 0], [W, D, 0], [-W, D, 0], [-W, -D, h], [W, -D, h], [W, D, h], [-W, D, h]].map((p) => tf(p, { ...o, x: x + (o.x || 0), y: y + (o.y || 0), z: z + (o.z || 0) }));
      const f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
      for (const [a, b, c, d2] of f) quad(v[a], v[b], v[c], v[d2], k);
      return api;
    },
    // Viga de sección cuadrada entre dos puntos
    beam(p0, p1, t, color) {
      const k = hex(color), d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const L = Math.hypot(...d) || 1, u = d.map((x) => x / L);
      const ref = Math.abs(u[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      const cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      let a = cr(u, ref); const la = Math.hypot(...a); a = a.map((x) => (x / la) * t / 2);
      const b = cr(u, a);
      const ring = (p) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => [0, 1, 2].map((q) => p[q] + a[q] * i + b[q] * j));
      const r0 = ring(p0), r1 = ring(p1);
      for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; quad(r0[i], r0[j], r1[j], r1[i], k); }
      quad(r0[3], r0[2], r0[1], r0[0], k); quad(r1[0], r1[1], r1[2], r1[3], k);
      return api;
    },
    // Cilindro (o cono si rTop = 0) con tapas
    cyl(x, y, z, r, h, color, rTop = r, seg = 14, o = {}) {
      const k = hex(color), c = [];
      for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; c.push([Math.cos(a), Math.sin(a)]); }
      const P = (cs, rr, zz) => tf([cs[0] * rr, cs[1] * rr, zz], { ...o, x: x + (o.x || 0), y: y + (o.y || 0), z: z + (o.z || 0) });
      const top = tf([0, 0, h], { ...o, x: x + (o.x || 0), y: y + (o.y || 0), z: z + (o.z || 0) }), bot = tf([0, 0, 0], { ...o, x: x + (o.x || 0), y: y + (o.y || 0), z: z + (o.z || 0) });
      for (let i = 0; i < seg; i++) {
        const a0 = P(c[i], r, 0), a1 = P(c[i + 1], r, 0), b0 = P(c[i], rTop, h), b1 = P(c[i + 1], rTop, h);
        quad(a0, a1, b1, b0, k);
        if (rTop > 0) tri(top, b0, b1, k);
        tri(bot, a1, a0, k);
      }
      return api;
    },
    // Lámina plana horizontal (polígono convexo) a la altura z
    plate(pts, z, color) {
      const k = hex(color);
      for (let i = 1; i < pts.length - 1; i++) tri([...pts[0], z], [...pts[i], z], [...pts[i + 1], z], k);
      return api;
    },
    mesh() {
      return { attributes: { positions: { value: new Float32Array(pos), size: 3 }, colors: { value: new Float32Array(col), size: 3 } } };
    },
  };
  return api;
}

// Disco del color de la tecnología bajo cada planta, para que el modelo case con la leyenda
const disco = (B, color, r = 58) => B.cyl(0, 0, 0, r, 1.2, color, r, 28);

const CONCRETO = '#C9CDD3', ACERO = '#B9C3CE', BLANCO = '#EEF1F4', GRIS = '#6B7280', OSCURO = '#3A3F4B';

function solar() {
  const B = Builder(); disco(B, '#F6B40E');
  // Tres filas de mesas inclinadas hacia el norte-sur, con postes
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
    const x = -33 + c * 22, y = -24 + r * 24;
    B.box(x, y - 4, 1.2, 1.2, 1.2, 5, ACERO).box(x, y + 4, 1.2, 1.2, 1.2, 8, ACERO);
    B.box(x, y, 5.6, 20, 12, 0.8, '#1F3B8C', { rx: 0.32 });
    B.box(x, y, 6.5, 20.4, 0.5, 0.25, '#9DB4E8', { rx: 0.32 });
  }
  B.box(44, -38, 1.2, 8, 5, 5, BLANCO); // inversor
  return B.mesh();
}

function hidro() {
  const B = Builder(); disco(B, '#2F8CF0');
  // Embalse detrás de la presa
  const arc = (r, a) => [Math.cos(a) * r, Math.sin(a) * r - 22];
  for (let i = 0; i < 16; i++) {
    const a0 = Math.PI * (0.18 + (i / 16) * 0.64), a1 = Math.PI * (0.18 + ((i + 1) / 16) * 0.64);
    B.plate([arc(37, a0), arc(37, a1), arc(58, a1), arc(58, a0)], 30, '#2F8CF0');
  }
  // Presa en arco: tramos de concreto
  const n = 10;
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (0.18 + ((i + 0.5) / n) * 0.64), x = Math.cos(a) * 34, y = Math.sin(a) * 34 - 22;
    B.box(x, y, 1.2, 8.4, 9, 36, CONCRETO, { rz: a - Math.PI / 2 });
  }
  B.box(0, -30, 1.2, 26, 12, 12, BLANCO).box(0, -30, 13.2, 26, 12, 1.4, GRIS); // casa de máquinas
  B.beam([-6, -6, 30], [-6, -24, 12], 2.6, '#8C96A3').beam([6, -6, 30], [6, -24, 12], 2.6, '#8C96A3'); // tuberías
  B.plate([[-10, -36], [10, -36], [14, -52], [-14, -52]], 1.6, '#4AA3F5'); // descarga
  return B.mesh();
}

function eolica() {
  const B = Builder(); disco(B, '#2FB8A6', 40);
  const H = 78;
  B.cyl(0, 0, 1.2, 2.6, H, BLANCO, 1.4, 12);
  B.box(0, 1.5, H, 3.6, 10, 3.6, BLANCO);
  B.cyl(0, -4, H + 1.8, 1.6, 2.4, BLANCO, 0.4, 10, { rx: Math.PI / 2 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    B.beam([0, -4.4, H + 1.8], [Math.cos(a) * 36, -4.4, H + 1.8 + Math.sin(a) * 36], 1.8, '#F7F9FB');
  }
  return B.mesh();
}

function termica(tipo) {
  const color = { gas: '#FF6A2B', carbon: '#4A4F5C', liquidos: '#9C6B3F', biomasa: '#4FB286' }[tipo];
  const B = Builder(); disco(B, color);
  B.box(-8, 8, 1.2, 40, 24, 18, '#D6DAE0').box(-8, 8, 19.2, 40, 24, 1.2, GRIS);
  if (tipo === 'carbon') {
    B.cyl(22, 18, 1.2, 5, 70, '#D9DDE2', 3.6, 12).cyl(22, 18, 54, 4.3, 6, '#D64545', 4, 12).cyl(22, 18, 64, 4, 6, '#D64545', 3.7, 12);
    B.cyl(-26, -26, 1.2, 15, 30, BLANCO, 10, 18); // torre de enfriamiento
    B.cyl(18, -28, 1.2, 18, 9, '#1D1F24', 0, 14); // montón de carbón
  } else if (tipo === 'gas') {
    B.cyl(18, 22, 1.2, 3.6, 46, '#E3E6EA', 3, 12).cyl(28, 12, 1.2, 3.6, 40, '#E3E6EA', 3, 12);
    B.box(23, -6, 1.2, 14, 26, 22, '#AEB6C1'); // caldera de recuperación
    B.cyl(-26, -28, 1.2, 9, 7, BLANCO, 9, 16).cyl(-6, -30, 1.2, 9, 7, BLANCO, 9, 16);
    B.cyl(18, 22, 47.2, 2.4, 3, '#FF6A2B', 1.6, 10);
  } else if (tipo === 'liquidos') {
    B.cyl(20, 20, 1.2, 3, 34, '#E3E6EA', 2.6, 12);
    for (const [x, y] of [[-30, -24], [-8, -28], [14, -26]]) B.cyl(x, y, 1.2, 9, 13, BLANCO, 9, 16).cyl(x, y, 14.2, 9, 1.4, '#9C6B3F', 9, 16);
  } else {
    B.cyl(22, 18, 1.2, 3, 36, '#E3E6EA', 2.6, 12);
    for (const [x, y] of [[-28, -26], [-12, -28]]) B.cyl(x, y, 1.2, 7, 24, '#7BC9A3', 7, 14).cyl(x, y, 25.2, 7, 5, '#4FB286', 0, 14);
    B.cyl(18, -26, 1.2, 14, 6, '#C9B26A', 0, 14); // bagazo
  }
  return B.mesh();
}

function subestacion() {
  const B = Builder();
  B.box(0, 0, 0, 120, 84, 1.6, '#8F98A3');
  B.box(0, 0, 1.6, 118, 82, 0.4, '#A8B0BA');
  // Pórticos y barras
  for (const x of [-48, -16, 16, 48]) {
    for (const y of [-30, 30]) B.box(x, y, 2, 2, 2, 28, '#DDE2E8');
    B.box(x, 0, 28, 2.2, 62, 2.2, '#DDE2E8');
  }
  for (const y of [-12, 0, 12]) B.box(0, y, 22, 100, 0.8, 0.8, '#E8C66A');
  // Transformadores con radiadores y bornes
  for (const x of [-30, 2]) {
    B.box(x, -18, 2, 14, 10, 11, OSCURO).box(x - 9, -18, 2, 3, 8, 9, '#555B66').box(x + 9, -18, 2, 3, 8, 9, '#555B66');
    for (const dx of [-4, 0, 4]) B.cyl(x + dx, -18, 13, 0.9, 6, '#C08A4A', 0.6, 8);
  }
  // Interruptores
  for (const x of [-48, -16, 16, 48]) for (const y of [8, 18]) B.cyl(x, y, 2, 1.4, 9, '#C7CED6', 1.2, 8);
  B.box(40, -26, 2, 24, 14, 8, BLANCO).box(40, -26, 10, 25, 15, 1, GRIS); // casa de control
  return B.mesh();
}

// Torre de transmisión. Brazos sobre el eje x (atravesada a la línea); la línea corre por el eje y.
export const TORRE_BRAZOS = [[-22, 62], [22, 62], [-16, 74], [16, 74], [0, 90]];
function torre() {
  const B = Builder(), c = ACERO, t = 1.3;
  const pie = (sx, sy, z) => { const w = 12 - (9 * Math.min(z, 80)) / 80; return [sx * w, sy * w, z]; };
  const P = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sy] of P) B.beam(pie(sx, sy, 0), pie(sx, sy, 80), t + 0.6, c);
  // Diagonales en las cuatro caras
  const niveles = [0, 16, 32, 48, 62, 74, 80];
  for (let i = 0; i < niveles.length - 1; i++) {
    for (let f = 0; f < 4; f++) {
      const [ax, ay] = P[f], [bx, by] = P[(f + 1) % 4];
      B.beam(pie(ax, ay, niveles[i]), pie(bx, by, niveles[i + 1]), t, c).beam(pie(bx, by, niveles[i]), pie(ax, ay, niveles[i + 1]), t, c);
      B.beam(pie(ax, ay, niveles[i + 1]), pie(bx, by, niveles[i + 1]), t, c);
    }
  }
  // Crucetas y cúpula del cable de guarda
  for (const [w, z] of [[22, 62], [16, 74]]) { B.beam([-w, 0, z], [w, 0, z], 2, c).beam([-w, 0, z], [-3, 0, z + 6], t, c).beam([w, 0, z], [3, 0, z + 6], t, c); }
  B.beam(pie(-1, 0, 80), [0, 0, 90], t, c).beam(pie(1, 0, 80), [0, 0, 90], t, c);
  // Aisladores
  for (const [x, z] of TORRE_BRAZOS.slice(0, 4)) B.cyl(x, 0, z - 6, 0.9, 6, '#7FA7C9', 0.9, 8);
  return B.mesh();
}

// Tamaño de referencia de cada modelo (metros a escala 1): sirve para calcular la escala por zoom
export const MODELOS = {
  solar: { mesh: solar(), size: 120 }, hidro: { mesh: hidro(), size: 120 }, eolica: { mesh: eolica(), size: 100 },
  gas: { mesh: termica('gas'), size: 120 }, carbon: { mesh: termica('carbon'), size: 120 }, liquidos: { mesh: termica('liquidos'), size: 120 },
  biomasa: { mesh: termica('biomasa'), size: 120 }, otra: { mesh: termica('gas'), size: 120 },
  subestacion: { mesh: subestacion(), size: 120 }, torre: { mesh: torre(), size: 90 },
};
