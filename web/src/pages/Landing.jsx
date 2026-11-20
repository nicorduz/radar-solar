import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { LegalLine } from './Legal.jsx';

// Página de inicio pública: qué es Radar Solar, para quién sirve y cómo se usa, paso a paso, antes de comprar.
// Las capturas son de la plataforma real (web/public/producto); los números vienen del servidor (/api/landing).

const PERFILES = {
  instalador: '¿Dónde están los hogares y negocios que más pagan por la luz?',
  proveedor: '¿Dónde están los instaladores que van a comprar equipos?',
  desarrollador: '¿Dónde conviene una granja solar o un proyecto de autogeneración remota?',
  servicios: '¿Dónde hay plantas y sistemas que necesitan mantenimiento?',
  respaldo: '¿Dónde se va la luz y la energía es cara?',
};

const PASOS = [
  { id: 'perfil', t: 'Elige qué vendes', d: 'El puntaje de cada municipio se calcula para tu negocio: instalación, equipos, proyectos, mantenimiento o baterías. Tú ajustas el peso de cada factor.', img: 'ranking', alt: 'Ranking de municipios con su tarifa, vivienda nueva, turismo, cortes, radiación y puntaje' },
  { id: 'mapa', t: 'Encuentra las zonas en el mapa', d: 'Cada municipio con su puntaje, y encima las subestaciones, las líneas de transmisión, las plantas solares, la autogeneración y los proyectos registrados. Dibuja una zona, mide distancias y guarda tableros.', img: 'mapa', alt: 'Mapa de Colombia con el puntaje por municipio, la autogeneración y la lista de mejores zonas' },
  { id: 'municipio', t: 'Entiende cada municipio', d: 'Tarifa por estrato, cortes de energía, vivienda nueva, turismo y radiación solar, con el porqué del puntaje en una sola ficha.', img: 'municipio', alt: 'Ficha de Barranquilla con tarifa, vivienda nueva, cortes, turismo y los factores del puntaje' },
  { id: 'clientes', t: 'Encuentra a quién venderle', d: 'Licitaciones públicas, empresas grandes, hoteles, colegios y centros de salud de cada zona. El contacto se muestra solo cuando es de una empresa.', img: 'licitaciones', alt: 'Lista de licitaciones públicas solares con entidad, fecha, estado y precio' },
  { id: 'propuesta', t: 'Calcula y propone', d: 'Retorno, crédito y beneficios tributarios de la Ley 1715. Diseña el sistema sobre la imagen satelital y entrega la propuesta en PDF con tu marca.', img: 'calculadora', alt: 'Calculadora financiera con inversión, retorno, ahorro y flujo de caja a 25 años' },
];

const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('es-CO'));
const cop = (n) => '$' + Math.round(n).toLocaleString('es-CO');

function useContacto(cfg) {
  const wa = cfg.contact?.whatsapp ? cfg.contact.whatsapp.replace(/\D/g, '') : null;
  const mail = cfg.contact?.email || null;
  return (texto, asunto) => (wa ? `https://wa.me/${wa}?text=${encodeURIComponent(texto)}` : mail ? `mailto:${mail}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}` : 'https://www.talera.co/');
}

// Pestañas accesibles: flechas, Inicio y Fin mueven el foco y la selección
function useTabs(ids, initial) {
  const [cur, setCur] = useState(initial);
  const refs = useRef({});
  const onKey = (e) => {
    const i = ids.indexOf(cur);
    const next = { ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 }[e.key];
    if (next == null) return;
    e.preventDefault();
    const id = ids[(next + ids.length) % ids.length];
    setCur(id); refs.current[id]?.focus();
  };
  const tab = (id) => ({ role: 'tab', id: `tab-${id}`, 'aria-selected': cur === id, 'aria-controls': `panel-${id}`, tabIndex: cur === id ? 0 : -1, ref: (el) => { refs.current[id] = el; }, onClick: () => setCur(id), onKeyDown: onKey });
  return [cur, tab];
}

export default function Landing({ cfg }) {
  const [info, setInfo] = useState(null);
  useEffect(() => { api('/landing').then(setInfo).catch(() => setInfo({ totals: {}, perfiles: [] })); }, []);
  useEffect(() => { document.title = `${cfg.appName || 'Radar Solar'}: inteligencia de mercado solar para Colombia`; }, [cfg.appName]);
  const contacto = useContacto(cfg);
  const prueba = contacto('Hola, quiero una cuenta de prueba de Radar Solar.', 'Cuenta de prueba de Radar Solar');
  const cotizar = contacto('Hola, quiero cotizar el plan completo de Radar Solar.', 'Plan completo de Radar Solar');
  const t = info?.totals || {};
  const perfiles = (info?.perfiles || []).filter((p) => PERFILES[p.id]);
  const [perfil, perfilTab] = useTabs(Object.keys(PERFILES), 'instalador');
  const [paso, pasoTab] = useTabs(PASOS.map((p) => p.id), 'perfil');
  const P = PASOS.find((p) => p.id === paso);
  const precio = cfg.plan?.precio || 750000;

  return (
    <div className="lp">
      <a className="skip" href="#lp-main" onClick={(e) => { e.preventDefault(); document.getElementById('lp-main')?.focus(); }}>Saltar al contenido</a>
      <header className="lp-nav">
        <a href="#/" className="brand-mark" aria-label="Radar Solar, inicio"><img src="/icon.svg" alt="" width="28" height="28" /><span>Radar Solar</span></a>
        <nav aria-label="Secciones">
          <a href="#como" onClick={(e) => { e.preventDefault(); document.getElementById('como')?.scrollIntoView(); }}>Cómo funciona</a>
          <a href="#para-quien" onClick={(e) => { e.preventDefault(); document.getElementById('para-quien')?.scrollIntoView(); }}>Para quién</a>
          <a href="#plan" onClick={(e) => { e.preventDefault(); document.getElementById('plan')?.scrollIntoView(); }}>Plan</a>
          <a href="#preguntas" onClick={(e) => { e.preventDefault(); document.getElementById('preguntas')?.scrollIntoView(); }}>Preguntas</a>
        </nav>
        <a className="btn sm lp-login" href="#/ingresar">Ingresar</a>
      </header>

      <main id="lp-main" tabIndex={-1}>
        <section className="lp-hero" aria-labelledby="lp-h1">
          <div className="lp-hero-map" aria-hidden="true"><img src="/isolineas.svg" alt="" /></div>
          <div className="lp-wrap lp-hero-copy">
            <h1 id="lp-h1">Inteligencia de mercado solar para Colombia</h1>
            <p className="lp-lead">Tarifas, sol, red eléctrica, empresas y proyectos de los {fmt(t.municipios || 1122)} municipios, en un mapa que se ajusta a tu negocio: instalación, venta de equipos, desarrollo de proyectos, mantenimiento o baterías.</p>
            <div className="lp-actions">
              <a className="btn primary lg" href={prueba} target="_blank" rel="noreferrer">Pedir una cuenta de prueba</a>
              <a className="btn lg lp-ghost" href="#como" onClick={(e) => { e.preventDefault(); document.getElementById('como')?.scrollIntoView(); }}>Ver cómo funciona</a>
            </div>
            <p className="lp-fine">Plan completo: {cop(precio)} COP, pago único. Sin suscripción ni cobros automáticos.</p>
          </div>
          <div className="lp-wrap">
            <figure className="lp-frame lp-hero-frame">
              <div className="lp-frame-bar" aria-hidden="true"><span>radar solar · mapa</span></div>
              <img src="/producto/mapa.webp" alt="La plataforma: mapa de Colombia con el puntaje de oportunidad de cada municipio, la autogeneración instalada y la lista de las mejores zonas" width="1600" height="1000" fetchpriority="high" />
            </figure>
          </div>
        </section>

        <section id="como" className="lp-sec" aria-labelledby="como-t">
          <div className="lp-wrap">
            <h2 id="como-t">Cómo funciona, en cinco pasos</h2>
            <div className="lp-steps">
              <div className="lp-step-list" role="tablist" aria-label="Pasos" aria-orientation="vertical">
                {PASOS.map((p, i) => (
                  <button key={p.id} className={`lp-step ${paso === p.id ? 'on' : ''}`} {...pasoTab(p.id)}>
                    <span className="n" aria-hidden="true">{i + 1}</span>
                    <span className="tx"><b>{p.t}</b><span>{p.d}</span></span>
                  </button>
                ))}
              </div>
              <div className="lp-step-view" role="tabpanel" id={`panel-${P.id}`} aria-labelledby={`tab-${P.id}`}>
                <figure className="lp-frame" key={P.id}>
                  <div className="lp-frame-bar" aria-hidden="true"><span>radar solar · {P.t.toLowerCase()}</span></div>
                  <img src={`/producto/${P.img}.webp`} alt={P.alt} width="1600" height="1000" loading="lazy" />
                </figure>
              </div>
            </div>
          </div>
        </section>

        <section id="para-quien" className="lp-sec lp-dark" aria-labelledby="pq-t">
          <div className="lp-wrap">
            <h2 id="pq-t">Un mismo mapa, cinco negocios</h2>
            <p className="lp-sub">Al entrar eliges tu perfil. Cambian el puntaje, el orden del menú y las capas que se abren primero.</p>
            <div className="lp-perfiles">
              <div className="lp-perfil-tabs" role="tablist" aria-label="Perfiles">
                {Object.keys(PERFILES).map((id) => <button key={id} className={perfil === id ? 'on' : ''} {...perfilTab(id)}>{perfiles.find((p) => p.id === id)?.label || id}</button>)}
              </div>
              <div className="lp-perfil" role="tabpanel" id={`panel-${perfil}`} aria-labelledby={`tab-${perfil}`}>
                <p className="q">{PERFILES[perfil]}</p>
                <p className="a">{perfiles.find((p) => p.id === perfil)?.desc}</p>
              </div>
            </div>
          </div>
        </section>

        <section className="lp-sec" aria-labelledby="datos-t">
          <div className="lp-wrap">
            <h2 id="datos-t">Lo que hay adentro</h2>
            <p className="lp-sub">Datos de registros públicos del Estado colombiano y fuentes abiertas, cada uno con su fecha de corte. Los puntajes y los cálculos de generación y retorno son estimaciones, y lo dicen. <a href="#/legal/fuentes">Alcance de la información</a>.</p>
            <dl className="lp-nums">
              <div><dt>municipios con puntaje</dt><dd>{fmt(t.municipios)}</dd></div>
              <div><dt>empresas grandes con sector e ingresos</dt><dd>{fmt(t.ci)}</dd></div>
              <div><dt>empresas del sector solar</dt><dd>{fmt(t.empresas)}</dd></div>
              <div><dt>prestadores turísticos</dt><dd>{fmt(t.clientes)}</dd></div>
              <div><dt>sedes educativas</dt><dd>{fmt(t.colegios)}</dd></div>
              <div><dt>sedes de salud</dt><dd>{fmt(t.salud)}</dd></div>
              <div><dt>licitaciones públicas solares</dt><dd>{fmt(t.secop)}</dd></div>
              <div><dt>subestaciones</dt><dd>{fmt(t.subs)}</dd></div>
            </dl>
          </div>
        </section>

        <section id="plan" className="lp-sec lp-plan" aria-labelledby="plan-t">
          <div className="lp-wrap lp-plan-grid">
            <div>
              <h2 id="plan-t">Un pago, acceso completo</h2>
              <p className="lp-price"><span className="num">{cop(precio)}</span><span>COP<br />pago único</span></p>
              <p className="lp-fine dark">{cfg.plan?.impuestos || 'El valor total con impuestos se indica en la cotización, antes de pagar.'} {cfg.plan?.vigencia ? `Vigencia: ${cfg.plan.vigencia}.` : ''} Factura electrónica. <a href="#/legal/cancelaciones">Retracto y reversión</a>.</p>
              <div className="lp-actions">
                <a className="btn primary lg" href={cotizar} target="_blank" rel="noreferrer">Cotizar el plan completo</a>
                <a className="btn lg" href={prueba} target="_blank" rel="noreferrer">Pedir una cuenta de prueba</a>
              </div>
            </div>
            <ul className="lp-incl">
              <li>Mapa, ranking y ficha de los {fmt(t.municipios || 1122)} municipios, para los cinco perfiles</li>
              <li>Red eléctrica: subestaciones, líneas, capacidad de conexión y plantas</li>
              <li>Empresas, hoteles, colegios, salud y licitaciones con contacto empresarial</li>
              <li>Diseño solar sobre satélite, calculadora financiera y propuestas en PDF con tu marca</li>
              <li>Seguimiento de zonas, prospectos y novedades</li>
              <li>Asistente con IA para argumentos y mensajes</li>
              <li>Licencias para equipos: un usuario por persona</li>
            </ul>
          </div>
        </section>

        <section id="preguntas" className="lp-sec" aria-labelledby="faq-t">
          <div className="lp-wrap lp-faq-wrap">
            <h2 id="faq-t">Preguntas frecuentes</h2>
            <div className="lp-faq">
              <details><summary>¿Necesito instalar algo?</summary><p>No. Funciona en el navegador del computador y del celular.</p></details>
              <details><summary>¿Puedo probarla antes de pagar?</summary><p>Sí. Con una cuenta de prueba ves el mapa, el ranking y una muestra de cada sección. Pídela por WhatsApp o correo y la creamos para ti.</p></details>
              <details><summary>¿De dónde salen los datos?</summary><p>De registros públicos del Estado colombiano y de fuentes abiertas, con su fecha de corte. Los puntajes, la generación y el retorno son estimaciones de la plataforma; no reemplazan un estudio técnico ni la solicitud de conexión ante el operador de red. <a href="#/legal/fuentes">Más detalle</a>.</p></details>
              <details><summary>¿Cuánto dura el acceso?</summary><p>{cfg.plan?.vigencia ? `${cfg.plan.vigencia}.` : 'Según los términos de uso vigentes al momento de la compra.'} No hay renovación automática. <a href="#/legal/terminos">Términos de uso</a>.</p></details>
              <details><summary>¿Sirve para todo mi equipo?</summary><p>Sí. Cada vendedor o ingeniero entra con su propio usuario y su propia contraseña.</p></details>
              <details><summary>¿Qué hacen con mis datos?</summary><p>Solo los de tu cuenta, para prestarte el servicio. Tus prospectos y diseños se guardan en tu navegador. <a href="#/legal/privacidad">Política de tratamiento de datos</a>.</p></details>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-wrap">
          <div className="lp-foot-top">
            <a href="https://www.talera.co/" target="_blank" rel="noreferrer" className="lp-foot-brand"><img src="/radar-solar-logo.png" alt="Radar Solar · Powered by Talera" /></a>
            <a className="btn" href="#/ingresar">Ingresar a la plataforma</a>
          </div>
          <LegalLine titular={cfg.titular} />
          <p className="lp-credit">Capturas de la plataforma con datos públicos. Mapas base © OpenStreetMap y © CARTO.</p>
        </div>
      </footer>
    </div>
  );
}
