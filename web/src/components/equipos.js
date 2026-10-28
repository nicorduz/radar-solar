// Catálogo base de paneles y baterías para el módulo de diseño.
// Valores de referencia típicos del mercado: confirma siempre con la ficha técnica del fabricante.
// El usuario puede crear sus propios equipos (se guardan en su navegador).

export const PANELES = [
  { id: 'gen-410', nombre: 'Monocristalino 410 W', marca: 'Genérico', w: 410, largo: 1722, ancho: 1134, garantia: 25 },
  { id: 'gen-450', nombre: 'Monocristalino 450 W', marca: 'Genérico', w: 450, largo: 1903, ancho: 1134, garantia: 25 },
  { id: 'gen-550', nombre: 'Monocristalino 550 W', marca: 'Genérico', w: 550, largo: 2279, ancho: 1134, garantia: 25 },
  { id: 'gen-580', nombre: 'Tipo N 580 W', marca: 'Genérico', w: 580, largo: 2278, ancho: 1134, garantia: 30 },
  { id: 'gen-610', nombre: 'Bifacial 610 W', marca: 'Genérico', w: 610, largo: 2382, ancho: 1134, garantia: 30 },
  { id: 'gen-700', nombre: 'Tipo N 700 W (utility)', marca: 'Genérico', w: 700, largo: 2384, ancho: 1303, garantia: 30 },
];

// kWh = capacidad nominal, dod = profundidad de descarga útil
export const BATERIAS = [
  { id: 'gen-5', nombre: 'Litio LFP 5 kWh', marca: 'Genérico', kwh: 5, dod: 0.9, kw: 2.5 },
  { id: 'gen-10', nombre: 'Litio LFP 10 kWh', marca: 'Genérico', kwh: 10, dod: 0.9, kw: 5 },
  { id: 'gen-15', nombre: 'Litio LFP 15 kWh', marca: 'Genérico', kwh: 15, dod: 0.9, kw: 7.5 },
  { id: 'gen-30', nombre: 'Litio LFP 30 kWh (comercial)', marca: 'Genérico', kwh: 30, dod: 0.9, kw: 15 },
  { id: 'tesla-pw3', nombre: 'Powerwall 3', marca: 'Tesla', kwh: 13.5, dod: 1, kw: 11.5 },
  { id: 'byd-hvs-51', nombre: 'Battery-Box Premium HVS 5.1', marca: 'BYD', kwh: 5.1, dod: 1, kw: 5.1 },
  { id: 'byd-hvs-102', nombre: 'Battery-Box Premium HVS 10.2', marca: 'BYD', kwh: 10.2, dod: 1, kw: 10.2 },
  { id: 'huawei-luna-5', nombre: 'LUNA2000 5 kWh', marca: 'Huawei', kwh: 5, dod: 1, kw: 2.5 },
  { id: 'huawei-luna-10', nombre: 'LUNA2000 10 kWh', marca: 'Huawei', kwh: 10, dod: 1, kw: 5 },
  { id: 'huawei-luna-15', nombre: 'LUNA2000 15 kWh', marca: 'Huawei', kwh: 15, dod: 1, kw: 5 },
  { id: 'pylon-us5000', nombre: 'US5000 4,8 kWh', marca: 'Pylontech', kwh: 4.8, dod: 0.95, kw: 2.4 },
];
