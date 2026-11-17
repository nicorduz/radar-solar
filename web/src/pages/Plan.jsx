import React from 'react';
import { useApp } from '../App.jsx';
import { Icon } from '../components/Icon.jsx';
import { fmt } from '../api.js';
import { TESTIMONIOS } from '../testimonios.js';

// El precio y las condiciones vienen del servidor (PLAN_PRECIO_COP, PLAN_IMPUESTOS, LEGAL_VIGENCIA_PLAN)
export const PLAN_PRECIO = 750000; // respaldo si el servidor no responde
export const TALERA_URL = 'https://www.talera.co/';
const cop = (n) => '$' + Math.round(n).toLocaleString('es-CO');
export const usePlan = () => {
  const { cfg } = useApp();
  return { precio: cfg.plan?.precio || PLAN_PRECIO, impuestos: cfg.plan?.impuestos || null, vigencia: cfg.plan?.vigencia || null };
};

// "Powered by Talera" con enlace a la página de Talera
export function PoweredBy({ className = 'powered' }) {
  return (
    <a className={className} href={TALERA_URL} target="_blank" rel="noreferrer">
      <span>Powered by</span><img src="/talera-logo.png" alt="Talera" width="64" height="16" /><span className="sr-only">(abre talera.co en otra pestaña)</span>
    </a>
  );
}

function waLink(cfg, texto) {
  return cfg.contact?.whatsapp ? `https://wa.me/${cfg.contact.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}` : null;
}

export function ComprarBotones({ grande }) {
  const { cfg } = useApp();
  const { precio } = usePlan();
  const wa = waLink(cfg, `Hola, quiero una cotización del plan completo de ${cfg.appName} (${cop(precio)} COP, pago único).`);
  return (
    <div className="row center">
      {wa && <a className={`btn primary ${grande ? 'lg' : ''}`} href={wa} target="_blank" rel="noreferrer">Pedir cotización por WhatsApp</a>}
      {cfg.contact?.email && <a className={`btn ${wa ? '' : 'primary'} ${grande ? 'lg' : ''}`} href={`mailto:${cfg.contact.email}?subject=${encodeURIComponent('Plan completo ' + cfg.appName)}`}>Escribir por correo</a>}
      {!wa && !cfg.contact?.email && <a className="btn primary" href={TALERA_URL} target="_blank" rel="noreferrer">Contactar a Talera</a>}
    </div>
  );
}

// Resumen corto del precio (para la página Cuenta y los avisos de contenido bloqueado)
export function PrecioCorto() {
  const { precio, impuestos } = usePlan();
  return (
    <p className="precio-corto"><span className="num">{cop(precio)}</span> COP · pago único, sin cobros recurrentes{impuestos ? ` · ${impuestos}` : ''}</p>
  );
}

export default function Plan() {
  const { meta, paid, cfg } = useApp();
  const { precio, impuestos, vigencia } = usePlan();
  const t = meta.totals || {};
  const incluye = [
    ['map', 'Mapa y ranking de oportunidad', `${fmt(t.municipios || 1122)} municipios con puntaje para instaladores, proveedores, desarrolladores, mantenimiento y baterías. Busca lugares, dibuja zonas y mide distancias.`],
    ['bolt', 'Tarifas, cortes y sol de cada municipio', 'Tarifa por operador y estrato, cortes de energía de los últimos 12 meses, radiación y clima.'],
    ['factory', 'Empresas grandes e industrias', `Las ${fmt(t.ci || 10000)} empresas más grandes del país con sector, ingresos, sede y contacto comercial de la empresa.`],
    ['hotel', 'Hoteles y turismo', `${fmt(t.clientes)} prestadores turísticos con número de habitaciones; el contacto se muestra solo cuando el prestador es una empresa.`],
    ['school', 'Colegios, hospitales y centros de salud', `${fmt(t.colegios)} sedes educativas y ${fmt(t.salud)} sedes de salud con tamaño y ubicación; contacto solo de instituciones con NIT.`],
    ['building', 'Instaladores, mayoristas y competencia', `${fmt(t.empresas)} empresas del sector con municipio, datos de contacto empresariales y contratos solares ganados.`],
    ['doc', 'Licitaciones públicas solares', `${fmt(t.secop)} procesos de contratación pública: quién compra, por cuánto y quién ganó.`],
    ['star', 'Mis prospectos y novedades', 'Sigue tus zonas, mira las licitaciones, obras y proyectos nuevos y lleva el estado de cada cliente potencial.'],
    ['sun', 'Diseño solar sobre imagen satelital', 'Dibuja el techo, distribuye los paneles, compara con y sin baterías y entrega una propuesta en PDF con estimaciones de generación y retorno.'],
    ['pdf', 'Propuestas e informes en PDF', 'Propuestas comerciales, informes de zona y para alcaldías, con tu empresa como autora.'],
    ['calc', 'Calculadora financiera', 'Retorno, cuota del crédito, valor presente, TIR y beneficios tributarios de la Ley 1715.'],
    ['layers', 'Red eléctrica y proyectos', `Líneas de transmisión, ${fmt(t.subs)} subestaciones con su capacidad indicativa de conexión, ${fmt(t.plantas)} plantas de generación y proyectos registrados.`],
    ['clock', 'Calidad del servicio por operador', 'Horas sin luz y número de cortes al año de cada operador de red, frente a la meta que le fija el regulador.'],
    ['box', 'Importaciones de paneles y baterías', 'Cuántos paneles entran al país cada mes, a qué precio, de dónde vienen y a qué departamentos llegan.'],
    ['share', 'Enlaces de solo lectura', 'Envía la ficha de un municipio con un enlace que vence a los 30 días y que puedes revocar cuando quieras.'],
    ['spark', 'Asistente con inteligencia artificial', 'Borradores de argumentos de venta, estrategia por zona y mensajes. Son textos generados por IA: revísalos antes de enviarlos.'],
  ];
  const waEquipo = waLink(cfg, `Hola, quiero cotizar una licencia de ${cfg.appName} para mi equipo.`);

  return (
    <div className="page plan">
      <section className="plan-hero" aria-labelledby="plan-t">
        <p className="eyebrow">Plan completo</p>
        <h1 id="plan-t">Toda la inteligencia de mercado solar de Colombia, con un solo pago.</h1>
        <p className="lead">Sin suscripción ni cobros automáticos. Pagas una vez y recibes acceso completo con tu propio usuario.</p>
        <div className="plan-precio">
          <span className="num">{cop(precio)}</span>
          <span className="plan-precio-u">COP<br />pago único</span>
        </div>
        <dl className="plan-terms">
          <dt>Impuestos</dt><dd>{impuestos || 'El valor total con impuestos se indica en la cotización, antes de pagar.'}</dd>
          <dt>Vigencia del acceso</dt><dd>{vigencia || <>Según los <a href="#/legal/terminos">términos de uso</a> vigentes al momento de la compra.</>}</dd>
          <dt>Factura</dt><dd>Factura electrónica a nombre de quien compra.</dd>
          <dt>Retracto y reversión</dt><dd><a href="#/legal/cancelaciones">Cuándo aplican y cómo pedirlos</a></dd>
        </dl>
        {paid ? <div className="alert ok">Tu cuenta ya tiene el plan completo.</div> : <ComprarBotones grande />}
      </section>

      <section className="stack" aria-labelledby="inc-t">
        <h2 id="inc-t">Qué incluye</h2>
        <ul className="plan-items">
          {incluye.map(([ic, titulo, texto]) => (
            <li key={titulo} className="plan-item">
              <span className="ic" aria-hidden="true"><Icon name={ic} /></span>
              <span><b>{titulo}</b><span className="small muted">{texto}</span></span>
            </li>
          ))}
        </ul>
        <p className="small muted">Los datos vienen de fuentes públicas y se actualizan cuando cada entidad publica una nueva versión. Los puntajes, la generación y el retorno son estimaciones. <a href="#/legal/fuentes">Alcance de la información</a>.</p>
      </section>

      <section className="card plan-steps" aria-labelledby="como-t">
        <h2 id="como-t">Cómo es la compra</h2>
        <ol>
          <li><b>Pides la cotización</b><span className="small muted">por WhatsApp o correo, con el número de usuarios que necesitas.</span></li>
          <li><b>Recibes las condiciones por escrito</b><span className="small muted">valor total, impuestos, medio de pago y vigencia.</span></li>
          <li><b>Pagas y activamos tu cuenta</b><span className="small muted">te confirmamos la fecha de activación y enviamos la factura electrónica.</span></li>
        </ol>
      </section>

      <section className="card plan-team" aria-labelledby="eq-t">
        <span className="ic" aria-hidden="true"><Icon name="users" /></span>
        <span className="grow"><b id="eq-t">Licencia para equipos</b><span className="small muted">Un usuario para cada vendedor o ingeniero de tu empresa. Cada persona entra con su propia cuenta. Cotiza según el número de personas.</span></span>
        {waEquipo ? <a className="btn" href={waEquipo} target="_blank" rel="noreferrer">Cotizar para mi equipo</a> : cfg.contact?.email ? <a className="btn" href={`mailto:${cfg.contact.email}?subject=${encodeURIComponent('Licencia de equipo ' + cfg.appName)}`}>Cotizar para mi equipo</a> : <a className="btn" href={TALERA_URL} target="_blank" rel="noreferrer">Cotizar para mi equipo</a>}
      </section>

      {TESTIMONIOS.length > 0 && (
        <section className="stack" aria-labelledby="test-t">
          <h2 id="test-t">Lo que dicen nuestros clientes</h2>
          <div className="grid g2">
            {TESTIMONIOS.map((x, i) => (
              <figure key={i} className="testimonio">
                <blockquote>“{x.texto}”</blockquote>
                <figcaption><b>{x.nombre}</b>{x.cargo ? `, ${x.cargo}` : ''}<br /><span className="small muted">{[x.empresa, x.ciudad].filter(Boolean).join(' · ')}</span></figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="plan-close">
        <p className="small muted">Como referencia, un sistema residencial de 6 kWp cuesta cerca de {cop(3800000 * 6)} con el costo de referencia de la plataforma. El resultado comercial depende de tu gestión; la plataforma no garantiza ventas.</p>
        {!paid && <ComprarBotones />}
        <PoweredBy />
      </section>
    </div>
  );
}
