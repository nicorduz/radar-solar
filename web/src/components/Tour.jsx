import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon.jsx';
import { readLocal, writeLocal } from '../local.js';

const KEY = 'rs_tour_v1';
export const openTour = () => window.dispatchEvent(new Event('rs-tour'));

// Recorrido guiado: se muestra la primera vez que alguien entra y se puede repetir desde Cuenta
export default function Tour({ paid, go }) {
  const [open, setOpen] = useState(() => !readLocal(KEY, false));
  const [i, setI] = useState(0);
  useEffect(() => { const on = () => { setI(0); setOpen(true); }; window.addEventListener('rs-tour', on); return () => window.removeEventListener('rs-tour', on); }, []);
  const steps = [
    ['sun', 'Bienvenido a Radar Solar', 'Te mostramos dónde vender energía solar en Colombia, a quién y con qué argumentos. Este recorrido toma un minuto.', 'mapa'],
    ['map', 'El mapa', 'El color y la altura de cada municipio muestran su puntaje de oportunidad para tu perfil. Busca una dirección o coordenada, dibuja zonas, mide distancias y mira las mejores zonas de lo que tienes en pantalla.', 'mapa'],
    ['list', 'La ficha de cada municipio', 'Toca un municipio para ver por qué tiene ese puntaje, sus tarifas, cortes, clientes, red eléctrica y el retorno de un sistema solar. Desde ahí generas una propuesta en PDF o la compartes por WhatsApp.', 'ranking'],
    ['factory', 'Clientes y competencia', 'Hoteles, empresas grandes e industrias, instaladores y licitaciones públicas, con contacto de empresa. Toca "+ Prospecto" para guardar los que te interesan.', paid ? 'industrias' : 'clientes'],
    ['star', 'Mis prospectos', 'Sigue tus zonas para ver las novedades (licitaciones, obras y proyectos) y lleva el estado de cada cliente potencial hasta cerrar la venta.', 'prospectos'],
    ['calc', 'Calculadora y asistente', 'Calcula retorno, cuota del crédito y beneficios tributarios, y pregúntale al asistente con IA por cualquier zona.', 'calculadora'],
  ];
  if (!open) return null;
  const close = () => { writeLocal(KEY, true); setOpen(false); };
  const [ic, t, txt, page] = steps[i];
  return createPortal(
    <div className="modal-bg" onClick={close}>
      <div className="card modal tour" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Recorrido guiado">
        <span className="tour-ic"><Icon name={ic} size={26} /></span>
        <span className="small muted">Paso {i + 1} de {steps.length}</span>
        <h2>{t}</h2>
        <p style={{ margin: 0 }}>{txt}</p>
        <div className="tour-dots">{steps.map((_, k) => <i key={k} className={k === i ? 'on' : ''} />)}</div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn sm ghost" onClick={close}>Saltar</button>
          <span className="row" style={{ gap: 6 }}>
            {i > 0 && <button className="btn sm" onClick={() => setI(i - 1)}>Atrás</button>}
            {i < steps.length - 1
              ? <button className="btn sm primary" onClick={() => { setI(i + 1); go(steps[i + 1][3]); }}>Siguiente</button>
              : <button className="btn sm primary" onClick={() => { close(); go('mapa'); }}>Empezar</button>}
          </span>
        </div>
      </div>
    </div>, document.body);
}
