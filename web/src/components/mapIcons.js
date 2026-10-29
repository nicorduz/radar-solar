// Íconos del mapa (SVG) y contorno de Colombia.
// Los íconos "máscara" son blancos: el mapa los colorea según el valor (azul → naranja).
const svg = (body, w = 64, h = 64) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`)}`;
const W = 'fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';

const MASK = {
  // Tarifa: moneda con signo peso
  tarifa: svg(`<circle cx="32" cy="32" r="26" fill="none" stroke="#fff" stroke-width="5"/><text x="32" y="45" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="36" fill="#fff">$</text>`),
  // Radiación: sol
  ghi: svg(`<circle cx="32" cy="32" r="12" fill="#fff"/><g ${W}><path d="M32 4v9M32 51v9M4 32h9M51 32h9M12 12l6 6M46 46l6 6M52 12l-6 6M18 46l-6 6"/></g>`),
  // Temperatura: termómetro
  temp: svg(`<g ${W}><path d="M26 38V12a6 6 0 0 1 12 0v26"/></g><circle cx="32" cy="46" r="11" fill="#fff"/><path d="M32 46V20" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`),
  // Vivienda nueva: casa
  viv12: svg(`<path d="M8 30 32 10l24 20" ${W}/><path d="M14 28v26h36V28L32 13Z" fill="#fff"/><rect x="27" y="38" width="10" height="16" fill="#000" fill-opacity="0.6"/>`),
  // Turismo: palmera y sol
  turismo_idx: svg(`<circle cx="48" cy="14" r="7" fill="#fff"/><g ${W}><path d="M28 58c0-14 2-26 6-34"/><path d="M34 24c-6-6-16-6-22 0M34 24c4-8 12-10 20-6M34 24c-2-8-10-12-18-10M34 24c8-2 14 2 16 10"/><path d="M10 58h44"/></g>`),
  // Cortes de energía: rayo
  dna_1k: svg(`<path d="M36 4 12 36h16l-4 24 26-34H34l4-22Z" fill="#fff"/>`),
  // Instaladores: llave de herramienta
  inst_n: svg(`<g ${W}><path d="M40 8a14 14 0 0 0-14 18L8 44l12 12 18-18a14 14 0 0 0 18-14l-8 8-10-2-2-10 8-8"/></g>`),
  // Autogeneradores: techo con panel
  agpe_est: svg(`<path d="M6 34 32 12l26 22" ${W}/><path d="M18 40 34 26l16 10-16 14Z" fill="#fff"/><path d="M14 36v20h36V40" ${W}/>`),
  // Subestación: torre de transmisión
  sub_km: svg(`<g ${W}><path d="M32 4 20 60M32 4l12 56M14 18h36M10 32h44M24 40l16 12M40 40 24 52"/></g>`),
  // MW cercanos o registrados: panel solar
  panel: svg(`<path d="M8 40 30 18h26L34 40Z" fill="#fff"/><path d="M20 40l-6 14M28 40l6 14" ${W}/>`),
};
MASK.tarifa_com = MASK.tarifa;
MASK.solar30_mw = MASK.panel;
MASK.upme_mw = MASK.panel;
MASK.saidi = MASK.dna_1k;
MASK.cap_mw = MASK.sub_km;
export const METRIC_ICON = MASK;

// Planta solar en boceto 3D (isométrico, a color)
const panel3d = (fill, stroke, dash = '') => svg(`
<ellipse cx="33" cy="57" rx="21" ry="4" fill="#000" opacity="0.35"/>
<path d="M22 45v11M46 36v17" stroke="#C9D2EA" stroke-width="3" stroke-linecap="round"/>
<path d="M28 46 58 28v4L28 50Z" fill="${stroke}" opacity="0.55"/>
<path d="M6 34 36 18 58 28 28 46Z" fill="${fill}" stroke="${stroke}" stroke-width="2.4" stroke-linejoin="round" ${dash}/>
<g stroke="${stroke}" stroke-width="1.2" opacity="0.8">
<path d="M16 28.7 38 40M26 23.3 48 34M11.5 37 41.5 20.5M17 40 47 23M22.5 43 52.5 25.5"/></g>
<path d="M12 33 35 21" stroke="#fff" stroke-width="2" opacity="0.35" stroke-linecap="round"/>`);
export const ICON_SOLAR = panel3d('#2F6AE6', '#E8EEFF');
export const ICON_SOLAR_PRUEBAS = panel3d('#5A7FD6', '#C9D2EA');
export const ICON_UPME = panel3d('none', '#A8C5FF', 'stroke-dasharray="4 3"');

// Subestación (a color) y localidad no interconectada
export const ICON_SUB = svg(`<g fill="none" stroke="#E8EEFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M32 6 22 58M32 6l10 52M16 20h32M12 34h40M25 42l14 10M39 42 25 52"/></g>`);
export const ICON_ZNI = svg(`<circle cx="32" cy="32" r="26" fill="#3B1F4F" stroke="#E0A8F0" stroke-width="4"/><path d="M36 12 20 36h12l-3 16 16-24H33l3-16Z" fill="#E0A8F0"/><path d="M14 50 50 14" stroke="#E0A8F0" stroke-width="4" stroke-linecap="round"/>`);

// Contorno de Colombia (Natural Earth 1:50m, simplificado) y máscara para oscurecer los países vecinos
export const COLOMBIA = [[-71.32,11.86],[-71.96,11.67],[-72.25,11.2],[-72.45,11.11],[-72.69,10.84],[-72.87,10.49],[-73.01,9.79],[-73.37,9.19],[-73.06,9.26],[-72.96,9.14],[-72.8,9.11],[-72.67,8.63],[-72.39,8.29],[-72.36,8.09],[-72.45,7.97],[-72.47,7.52],[-72.39,7.42],[-72.21,7.37],[-72.01,7.03],[-71.13,6.99],[-70.74,7.09],[-70.13,6.95],[-69.43,6.12],[-68.94,6.2],[-68.47,6.16],[-67.86,6.29],[-67.48,6.18],[-67.47,5.93],[-67.82,5.27],[-67.86,4.51],[-67.66,3.86],[-67.31,3.42],[-67.86,2.79],[-67.62,2.79],[-67.21,2.39],[-66.88,1.22],[-67.08,1.19],[-67.12,1.7],[-67.4,2.12],[-67.56,2.07],[-67.94,1.75],[-68.19,1.99],[-68.26,1.85],[-68.18,1.72],[-69.54,1.77],[-69.85,1.71],[-69.85,1.06],[-69.31,1.05],[-69.16,0.86],[-69.15,0.66],[-69.28,0.63],[-69.47,0.73],[-70.05,0.58],[-70.07,-0.14],[-69.63,-0.51],[-69.61,-0.76],[-69.4,-1.19],[-69.97,-4.24],[-70.34,-3.81],[-70.53,-3.87],[-70.74,-3.78],[-70.06,-2.7],[-70.91,-2.22],[-71.11,-2.25],[-71.4,-2.33],[-71.75,-2.15],[-72.22,-2.4],[-72.94,-2.39],[-73.15,-2.28],[-73.2,-1.83],[-73.5,-1.69],[-73.52,-1.45],[-73.66,-1.25],[-74.25,-0.97],[-74.42,-0.58],[-74.8,-0.2],[-75.78,0.09],[-76.27,0.44],[-76.39,0.4],[-76.49,0.24],[-77.4,0.39],[-77.47,0.64],[-77.65,0.72],[-77.7,0.84],[-77.83,0.83],[-78.31,1.05],[-79.03,1.62],[-78.79,1.85],[-78.58,1.77],[-78.59,2.36],[-78.42,2.48],[-78.07,2.51],[-77.81,2.72],[-77.67,2.88],[-77.69,3.04],[-77.56,3.08],[-77.36,3.35],[-77.08,3.91],[-77.26,3.89],[-77.28,4.06],[-77.36,3.94],[-77.41,4.25],[-77.52,4.21],[-77.35,4.4],[-77.29,4.72],[-77.37,5.32],[-77.53,5.54],[-77.25,5.78],[-77.47,6.18],[-77.37,6.58],[-77.9,7.23],[-77.74,7.54],[-77.76,7.7],[-77.54,7.57],[-77.35,7.71],[-77.35,7.84],[-77.2,7.97],[-77.48,8.5],[-77.39,8.64],[-76.85,8.09],[-76.9,7.94],[-76.79,7.93],[-76.77,8.31],[-76.92,8.57],[-76.28,8.99],[-76.03,9.37],[-75.64,9.45],[-75.68,9.73],[-75.54,10.21],[-75.71,10.14],[-75.45,10.61],[-74.84,11.11],[-74.33,11.0],[-74.52,10.86],[-74.4,10.77],[-74.14,11.32],[-73.31,11.3],[-72.72,11.71],[-72.28,11.89],[-72.14,12.19],[-71.71,12.42],[-71.49,12.43],[-71.26,12.34],[-71.14,12.05],[-71.32,11.86]];
export const COLOMBIA_MASK = {
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [[[-100, -25], [-40, -25], [-40, 30], [-100, 30], [-100, -25]], [...COLOMBIA, COLOMBIA[0]]] },
};
