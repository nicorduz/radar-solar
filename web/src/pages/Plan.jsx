import React from 'react';
import { useApp } from '../App.jsx';
import { Icon } from '../components/Icon.jsx';
import { fmt } from '../api.js';

export const PLAN_PRECIO = 750000; // COP, pago único
export const TALERA_URL = 'https://www.talera.co/';
const cop = (n) => '$' + Math.round(n).toLocaleString('es-CO');

// "Powered by Talera" con enlace a la página de Talera
export function PoweredBy({ className = 'powered' }) {
  return (
    <a className={className} href={TALERA_URL} target="_blank" rel="noreferrer" title="Ir a talera.co">
      <span>Powered by</span><img src="/talera-logo.png" alt="Talera" />
    </a>
  );
}

function waLink(cfg, texto) {
  return cfg.contact?.whatsapp ? `https://wa.me/${cfg.contact.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}` : null;
}

export function ComprarBotones({ grande }) {
  const { cfg } = useApp();
  const wa = waLink(cfg, `Hola, quiero comprar el plan completo de ${cfg.appName} (pago único de ${cop(PLAN_PRECIO)} COP).`);
  return (
    <div className="row" style={{ justifyContent: 'center' }}>
      {wa && <a className={`btn primary ${grande ? 'lg' : ''}`} href={wa} target="_blank" rel="noreferrer">Quiero el plan completo</a>}
      {cfg.contact?.email && <a className="btn" href={`mailto:${cfg.contact.email}?subject=${encodeURIComponent('Plan completo ' + cfg.appName)}`}>Escribir por correo</a>}
      {!wa && !cfg.contact?.email && <a className="btn primary" href={TALERA_URL} target="_blank" rel="noreferrer">Contactar a Talera</a>}
    </div>
  );
}

// Resumen corto del precio (para la página Cuenta y los avisos de contenido bloqueado)
export function PrecioCorto() {
  return (
    <div className="precio-corto">
      <span className="mono">{cop(PLAN_PRECIO)}</span><span> COP · pago único, sin mensualidades</span>
    </div>
  );
}

export default function Plan() {
  const { meta, paid, cfg } = useApp();
  const t = meta.totals || {};
  const mensualAnio = PLAN_PRECIO / 12;
  const incluye = [
    ['map', 'Mapa 3D y ranking de oportunidad', 'Más de 1.000 municipios con puntaje para instaladores, proveedores y desarrolladores. Filtros y descarga en CSV.'],
    ['bolt', 'Tarifas, cortes y sol de cada municipio', `Tarifa 2026 por operador y estrato (SUI), cortes de energía de los últimos 12 meses (XM), radiación y clima.`],
    ['hotel', 'Clientes listos para contactar', `${fmt(t.clientes)} hoteles, viviendas turísticas y parques con número de habitaciones y contacto de la empresa.`],
    ['building', 'Instaladores, mayoristas y competencia', `${fmt(t.empresas)} empresas del sector con municipio, teléfono, correo y contratos solares ganados.`],
    ['doc', 'Licitaciones públicas solares', `${fmt(t.secop)} procesos de SECOP II: quién compra, por cuánto y quién ganó.`],
    ['layers', 'Red eléctrica y proyectos', `Líneas de transmisión, ${fmt(t.subs)} subestaciones, ${fmt(t.plantas)} plantas de generación y proyectos registrados en la UPME.`],
    ['sun', 'Ficha completa por municipio', 'Retorno de la inversión de un sistema solar, obra nueva por estrato y todo lo anterior en una sola vista.'],
    ['spark', 'Asistente con inteligencia artificial', 'Argumentos de venta, estrategia por zona y mensajes de WhatsApp listos para enviar.'],
  ];

  return (
    <div className="page" style={{ maxWidth: 1000 }}>
      <section className="plan-hero card">
        <div className="diag" aria-hidden="true" />
        <span className="tag hot">Plan completo</span>
        <h1>Paga una vez. Úsala siempre.</h1>
        <p className="muted" style={{ margin: 0, maxWidth: 620 }}>Toda la inteligencia de mercado solar de Colombia en una sola plataforma, sin suscripciones que te cobran cada mes.</p>
        <div className="plan-precio">
          <span className="mono">{cop(PLAN_PRECIO)}</span>
          <span>COP<br /><b>pago único</b></span>
        </div>
        <p className="small muted" style={{ margin: 0 }}>Equivale a {cop(mensualAnio)} al mes durante el primer año. Desde el mes 13 no vuelves a pagar.</p>
        {paid ? <div className="alert ok">Tu cuenta ya tiene el plan completo.</div> : <ComprarBotones grande />}
      </section>

      <div className="grid g2">
        <div className="card plan-vs off">
          <h3>Una suscripción mensual</h3>
          <ul>
            <li>Te cobra cada mes, la uses o no.</li>
            <li>El costo crece mientras más tiempo la necesitas.</li>
            <li>Si dejas de pagar, pierdes el acceso.</li>
          </ul>
        </div>
        <div className="card plan-vs on">
          <h3>Radar Solar · pago único</h3>
          <ul>
            <li>Pagas una sola vez: {cop(PLAN_PRECIO)} COP.</li>
            <li>Entras cuando la necesites, sin renovaciones ni cobros automáticos.</li>
            <li>Los datos se actualizan con las fuentes oficiales.</li>
          </ul>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2>Todo lo que incluye</h2>
        <div className="plan-items">
          {incluye.map(([ic, titulo, texto]) => (
            <div key={titulo} className="plan-item">
              <span className="sec-ic"><Icon name={ic} /></span>
              <span><b>{titulo}</b><br /><span className="small muted">{texto}</span></span>
            </div>
          ))}
        </div>
      </div>

      <div className="card plan-roi">
        <Icon name="sun" size={22} />
        <span>Un sistema residencial de 6 kWp cuesta cerca de {cop(3800000 * 6)} según el costo de referencia de la plataforma. <b>Con cerrar una sola venta, la licencia queda pagada.</b></span>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center', textAlign: 'center' }}>
        <h2>¿Listo para vender más?</h2>
        <p className="muted" style={{ margin: 0 }}>Escríbenos y activamos tu plan el mismo día.</p>
        {!paid && <ComprarBotones grande />}
        <PoweredBy />
        <span className="small muted">{cfg.appName} es una plataforma de Talera Colombia Consulting S.A.S. · <a href={TALERA_URL} target="_blank" rel="noreferrer">talera.co</a></span>
      </div>
    </div>
  );
}
