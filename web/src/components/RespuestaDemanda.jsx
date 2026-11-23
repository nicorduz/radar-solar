import React from 'react';

// Página de respuesta a la demanda en el inicio: cómo funciona, cuánto se puede ganar y qué hace Talera.
// Reglas: programa permanente de la CREG 101 111 de 2026 (ofertas de 1 MWh o más por hora, pago = reducción
// verificada contra la línea base × precio ofertado). Ejemplos ilustrativos con supuestos visibles.

// Curva de un día de una empresa: línea base (promedio de 60 días) y consumo real con una reducción de 14 a 18 h
const H = Array.from({ length: 25 }, (_, h) => h);
const BASE = [38, 36, 35, 35, 36, 40, 52, 68, 82, 90, 94, 97, 98, 99, 100, 99, 96, 90, 80, 70, 60, 52, 46, 42, 38];
const EV = [14, 18];
const REAL = BASE.map((v, h) => (h > EV[0] && h < EV[1] ? v - 34 : h === EV[0] || h === EV[1] ? v - 17 : v));
const X = (h) => 70 + (h / 24) * 880;
const Y = (v) => 330 - (v / 110) * 270;
const linea = (arr) => arr.map((v, h) => `${h ? 'L' : 'M'}${X(h).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');

export function RDDiagrama() {
  const area = `${linea(REAL)} L${X(24)},330 L${X(0)},330 Z`;
  const brecha = [...H.filter((h) => h >= EV[0] && h <= EV[1]).map((h) => `${X(h)},${Y(BASE[h])}`), ...H.filter((h) => h >= EV[0] && h <= EV[1]).reverse().map((h) => `${X(h)},${Y(REAL[h])}`)].join(' ');
  return (
    <figure className="rd-fig">
      <svg viewBox="0 0 1000 380" role="img" aria-labelledby="rd-fig-t rd-fig-d">
        <title id="rd-fig-t">Cómo se mide lo que te pagan</title>
        <desc id="rd-fig-d">Consumo de una empresa durante un día. La línea punteada es su línea base, el consumo típico de cada hora. Entre las 2 y las 6 de la tarde, cuando la energía está cara, la empresa baja su consumo; la diferencia entre la línea base y el consumo real es la energía que le pagan.</desc>
        <defs>
          <linearGradient id="rd-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3478F6" stopOpacity="0.55" /><stop offset="1" stopColor="#3478F6" stopOpacity="0.06" /></linearGradient>
        </defs>
        <rect x={X(EV[0])} y="40" width={X(EV[1]) - X(EV[0])} height="290" rx="6" className="rd-ev" />
        <text x={(X(EV[0]) + X(EV[1])) / 2} y="30" textAnchor="middle" className="rd-t rd-t-ev">Precio de bolsa alto</text>
        {[0, 6, 12, 18, 24].map((h) => <g key={h}><line x1={X(h)} x2={X(h)} y1="330" y2="336" className="rd-axis" /><text x={X(h)} y="356" textAnchor="middle" className="rd-t">{h === 24 ? '24 h' : `${h} h`}</text></g>)}
        <line x1="70" x2="950" y1="330" y2="330" className="rd-axis" />
        <path d={area} fill="url(#rd-g)" />
        <path d={linea(REAL)} className="rd-real" />
        <polygon points={brecha} className="rd-gap" />
        <path d={linea(BASE)} className="rd-base" />
        <g className="rd-lbl">
          <line x1={X(16)} x2={X(19.6)} y1={Y(84)} y2={Y(84)} className="rd-lead" />
          <text x={X(19.8)} y={Y(84) - 6} className="rd-t rd-strong">Lo que te pagan</text>
          <text x={X(19.8)} y={Y(84) + 14} className="rd-t">reducción verificada × tu precio</text>
          <text x={X(0.4)} y={Y(70)} className="rd-t">Línea base (punteada): tu consumo típico</text>
          <text x={X(0.4)} y={Y(70) + 18} className="rd-t">de esa hora en los últimos 60 días</text>
          <text x={X(8.6)} y={Y(36)} className="rd-t rd-on-area">Consumo real</text>
        </g>
      </svg>
      <figcaption className="rd-leyenda">
        <span><i className="rd-k-base" aria-hidden="true" />Línea base: tu consumo típico de esa hora</span>
        <span><i className="rd-k-real" aria-hidden="true" />Consumo real</span>
        <span><i className="rd-k-gap" aria-hidden="true" />Lo que te pagan: reducción verificada × tu precio</span>
      </figcaption>
    </figure>
  );
}

// Ejemplos ilustrativos: rango mensual en meses de precios altos
export const RD_EJEMPLOS = [
  { quien: 'Planta industrial', que: '2 MW de procesos que se pueden mover unas horas: hornos, bombeo, molienda, compresores.', rango: '$12 a $54 millones', sup: '20 a 60 horas activadas al mes, ofertas de $300 a $450 por kWh.' },
  { quien: 'Cadena comercial', que: '15 sedes agregadas: aire acondicionado y refrigeración que se ajustan sin que el cliente lo note.', rango: '$6 a $27 millones', sup: 'Cerca de 1 MW agregado, 20 a 60 horas al mes, ofertas de $300 a $450 por kWh.' },
  { quien: 'Edificio o bodega con baterías', que: 'Una batería de 1 MWh que cubre el consumo en las horas caras.', rango: '$6 a $18 millones', sup: '20 a 40 activaciones al mes, ofertas de $300 a $450 por kWh.' },
];

export const RD_PASOS = [
  ['Ofertas un día antes', 'Para cada hora del día siguiente dices cuánto puedes bajar y a qué precio. Mínimo 1 MWh por hora, solo o agregado con otros.'],
  ['El sistema te elige cuando la energía está cara', 'El Centro Nacional de Despacho acepta las ofertas más baratas cuando reducir sale mejor que generar.'],
  ['Bajas el consumo en esas horas', 'Mueves procesos, usas tus baterías o ajustas aire y frío, sin parar la operación.'],
  ['Te pagan lo verificado', 'El administrador del mercado compara tu consumo con tu línea base y te paga la reducción al precio que ofertaste.'],
];

export const RD_FAQ = [
  ['¿Tengo que parar mi operación?', 'No. Se ofertan solo las horas y la energía que puedes mover: procesos diferibles, aire y frío, bombeo o baterías.'],
  ['¿Qué pasa si no cumplo lo que oferté?', 'Si la diferencia entre lo ofertado y lo verificado se sale del rango permitido, se cobra el 30 % del precio ofertado por la energía que faltó. En los primeros seis meses del programa ese cobro no aplica.'],
  ['¿Puedo participar si tengo paneles solares?', 'Sí. Los autogeneradores pueden participar; la línea base se calcula en la frontera de consumo.'],
  ['¿Puedo estar en bolsa y en demanda desconectable a la vez?', 'No el mismo día. Un usuario con contrato de demanda desconectable voluntaria no puede ofertar en el programa de bolsa; Talera evalúa cuál te conviene más.'],
  ['¿Quién me representa?', 'Un representante de respuesta a la demanda, que puede ser tu comercializador. Los costos de la representación se acuerdan libremente.'],
];

export const RD_TALERA = [
  ['Diagnóstico de cargas flexibles', 'Qué puedes mover, cuánto y a qué costo para tu operación.'],
  ['Modelo de tu línea base', 'Con tus datos de medición calculamos tu línea base y su error, que define cuánto vale tu oferta.'],
  ['Estructuración del programa', 'Agregación de sedes para llegar a 1 MWh por hora, horas y estrategia de precio.'],
  ['Demanda desconectable voluntaria', 'Evaluamos si te conviene más un contrato con un generador que respalda su energía firme, en lugar de ofertar en bolsa.'],
  ['Registro y representante', 'Registro de la frontera, acuerdo con el representante y medición que cumpla el Código de Medida.'],
  ['Operación y seguimiento', 'Ofertas diarias, verificación mensual y ajustes para no pagar desviaciones.'],
];
