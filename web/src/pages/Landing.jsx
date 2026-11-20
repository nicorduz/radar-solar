import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { LegalLine } from './Legal.jsx';

// Páginas de inicio públicas. La raíz pregunta qué hace el visitante y lleva a la página de su perfil
// (#/para/<perfil>); "todo" es la página del acceso completo con los cinco perfiles.
// Las capturas son de la plataforma real (web/public/producto); los conteos vienen de /api/landing.

const ORDEN = ['instalador', 'proveedor', 'desarrollador', 'servicios', 'respaldo', 'todo'];

const C = {
  todo: {
    nombre: 'Todo en uno', corto: 'Todo en uno', quien: 'empresas que hacen varias cosas en la cadena',
    h1: 'Inteligencia de mercado solar para Colombia',
    lead: 'Tarifas, sol, red eléctrica, empresas y proyectos de los {M} municipios, en un mapa que se ajusta a tu negocio: instalación, venta de equipos, desarrollo de proyectos, mantenimiento o baterías.',
    hero: 'mapa',
    pasos: [
      ['Elige qué vendes', 'El puntaje de cada municipio se calcula para tu negocio. Con el acceso completo cambias de perfil cuando quieras y ajustas el peso de cada factor.', 'ranking', 'Ranking de municipios con su tarifa, vivienda nueva, turismo, cortes, radiación y puntaje'],
      ['Encuentra las zonas en el mapa', 'Cada municipio con su puntaje, y encima las subestaciones, las líneas, las plantas solares, la autogeneración y los proyectos registrados. Dibuja zonas, mide y guarda tableros.', 'mapa', 'Mapa de Colombia con el puntaje por municipio, la autogeneración y la lista de mejores zonas'],
      ['Entiende cada municipio', 'Tarifa por estrato, cortes, vivienda nueva, turismo y radiación solar, con el porqué del puntaje en una sola ficha.', 'municipio', 'Ficha de Barranquilla con tarifa, vivienda nueva, cortes, turismo y los factores del puntaje'],
      ['Encuentra a quién venderle', 'Licitaciones públicas, empresas grandes, hoteles, colegios y centros de salud de cada zona. El contacto se muestra solo cuando es de una empresa.', 'licitaciones', 'Lista de licitaciones públicas solares con entidad, fecha, estado y precio'],
      ['Calcula y propone', 'Retorno, crédito y beneficios tributarios de la Ley 1715. Diseña el sistema sobre la imagen satelital y entrega la propuesta en PDF con tu marca.', 'calculadora', 'Calculadora financiera con inversión, retorno, ahorro y flujo de caja a 25 años'],
    ],
    nums: ['municipios', 'ci', 'empresas', 'clientes', 'colegios', 'salud', 'secop', 'subs'],
    incl: ['Los cinco perfiles en una sola cuenta, con su puntaje, sus capas y su menú', 'Mapa, ranking y ficha de los {M} municipios', 'Red eléctrica: subestaciones, líneas, capacidad de conexión y plantas', 'Empresas, hoteles, colegios, salud y licitaciones con contacto empresarial', 'Diseño solar, calculadora financiera y propuestas en PDF con tu marca', 'Mercado: autogeneración, precio de bolsa, proyectos e importaciones', 'Asistente con IA para argumentos y mensajes'],
  },
  instalador: {
    nombre: 'Instalador solar', corto: 'Instalador', quien: 'instaladores',
    h1: 'Encuentra dónde vender sistemas solares en Colombia',
    lead: 'Los municipios con tarifa alta, obra nueva de estrato alto, calor, turismo y cortes de energía, con los hogares, hoteles, colegios y empresas a quienes venderles, y la propuesta lista en PDF.',
    hero: 'mapa',
    pasos: [
      ['Mira dónde está la demanda', 'Un puntaje por municipio para hogares, conjuntos o comercio, según la tarifa, la vivienda nueva, el consumo, el clima y los cortes. Tú ajustas los pesos.', 'ranking', 'Ranking de municipios para instaladores con tarifa, vivienda nueva, turismo, cortes, radiación y puntaje'],
      ['Ubica las zonas en el mapa', 'Las mejores zonas cerca de ti y la autogeneración que ya está instalada en cada municipio. Dibuja tu zona de trabajo y guárdala.', 'mapa', 'Mapa de Colombia con el puntaje para instaladores y la autogeneración por municipio'],
      ['Entiende cada municipio', 'Tarifa por estrato, vivienda nueva de los últimos 12 meses, cortes, turismo y radiación, con el porqué del puntaje.', 'municipio', 'Ficha de Barranquilla con tarifa, vivienda nueva, cortes y turismo'],
      ['Encuentra clientes', 'Hoteles, colegios, centros de salud, empresas grandes y licitaciones públicas de cada zona, con su contacto empresarial.', 'licitaciones', 'Lista de licitaciones públicas solares con entidad, fecha, estado y precio'],
      ['Calcula y entrega la propuesta', 'Diseña sobre la imagen satelital, calcula el retorno y la cuota del crédito, y entrega la propuesta en PDF con tu marca.', 'calculadora', 'Calculadora financiera con inversión, retorno, ahorro y flujo de caja a 25 años'],
    ],
    nums: ['municipios', 'clientes', 'colegios', 'salud', 'ci', 'secop'],
    incl: ['Ranking por segmento: hogares, conjuntos y comercio', 'Ficha de cada municipio con tarifa, cortes, vivienda nueva y sol', 'Hoteles, colegios, salud y empresas grandes con contacto empresarial', 'Licitaciones públicas solares', 'Diseño sobre satélite, calculadora y propuesta en PDF con tu marca', 'Seguimiento de zonas y prospectos'],
  },
  proveedor: {
    nombre: 'Proveedor de equipos', corto: 'Proveedor', quien: 'proveedores y distribuidores de equipos',
    h1: 'Encuentra dónde están los instaladores que compran equipos',
    lead: 'Dónde hay más instaladores activos, más sistemas conectados y más obra nueva, y menos mayoristas compitiendo. Con las empresas del sector, la autogeneración por municipio y las importaciones de paneles y baterías.',
    hero: 'mapa-proveedor',
    pasos: [
      ['Mira dónde está tu mercado', 'Un puntaje por municipio según instaladores en la zona, autogeneración conectada, contratistas con contratos solares, obra nueva y mayoristas por instalador.', 'ranking-proveedor', 'Ranking de municipios para proveedores con instaladores, autogeneración, vivienda nueva, tarifa y puntaje'],
      ['Ve la autogeneración en el mapa', 'Los sistemas de autogeneración reportados en cada municipio y las plantas solares, para saber dónde se está instalando.', 'mapa-proveedor', 'Mapa para proveedores con autogeneración por municipio y plantas solares'],
      ['Entiende cada zona', 'Instaladores, autogeneradores y vivienda nueva del municipio, y el porqué de su puntaje.', 'ficha-proveedor', 'Ficha de un municipio con instaladores, autogeneradores, vivienda nueva y los factores del puntaje para proveedores'],
      ['Sigue el mercado', 'Autogeneración por operador, plantas solares, precio de bolsa e importaciones de paneles y baterías: cuántos entran, a qué precio y a qué departamentos.', 'mercado', 'Panel de mercado con autogeneradores, plantas solares, precio de bolsa y proyectos registrados'],
      ['Encuentra a tus clientes', 'Las empresas del sector con su municipio y contacto empresarial, y quién gana las licitaciones públicas solares.', 'licitaciones', 'Lista de licitaciones públicas solares con entidad, fecha y estado'],
    ],
    nums: ['empresas', 'municipios', 'secop', 'ci'],
    incl: ['Ranking de zonas para distribución de equipos', 'Empresas del sector: instaladores y mayoristas, con contacto empresarial', 'Autogeneración por municipio y por operador', 'Importaciones de paneles y baterías: volumen, precio, origen y destino', 'Licitaciones públicas y quién las gana', 'Asistente con IA para argumentos de venta'],
  },
  desarrollador: {
    nombre: 'Desarrollador o inversionista', corto: 'Desarrollador', quien: 'desarrolladores, inversionistas y vehículos de propósito especial (SPV)',
    h1: 'Encuentra dónde desarrollar proyectos solares en Colombia',
    lead: 'Granjas solares y autogeneración remota: radiación, cercanía y tensión de subestaciones, capacidad indicativa de conexión, tarifa comercial, contingencias de red y saturación de plantas, municipio por municipio.',
    hero: 'mapa-desarrollador',
    pasos: [
      ['Compara sitios', 'Un puntaje por municipio con radiación, cercanía a subestación, tensión disponible, tarifa comercial, contingencias y plantas cercanas. Filtra por distancia, radiación y tensión.', 'ranking-desarrollador', 'Ranking para desarrolladores con radiación, distancia a subestación, capacidad de conexión, MW cercanos y tarifa comercial'],
      ['Mira la red en el mapa', 'Líneas de transmisión, subestaciones con su capacidad indicativa de conexión, plantas en operación y proyectos registrados.', 'mapa-desarrollador', 'Mapa con líneas de transmisión, subestaciones con capacidad de conexión, plantas solares y proyectos'],
      ['Revisa cada municipio', 'Radiación, subestación más cercana, tensión, capacidad de conexión y tarifa comercial, con el porqué del puntaje.', 'ficha-desarrollador', 'Ficha de un municipio con radiación, subestación, capacidad de conexión y tarifa comercial'],
      ['Sigue el mercado', 'Precio de bolsa, plantas solares en operación, proyectos registrados y autogeneración por operador.', 'mercado', 'Panel de mercado con precio de bolsa, plantas solares y proyectos registrados'],
      ['Haz los números', 'Retorno, valor presente, TIR y beneficios tributarios de la Ley 1715 como primera estimación.', 'calculadora', 'Calculadora financiera con inversión, TIR, valor presente y flujo de caja'],
    ],
    nums: ['municipios', 'subs', 'secop'],
    incl: ['Ranking de sitios con filtros de distancia, radiación y tensión', 'Subestaciones con capacidad indicativa de conexión y líneas de transmisión', 'Plantas en operación y proyectos de generación registrados', 'Precio de bolsa y mercado de autogeneración', 'Calculadora financiera con TIR y beneficios tributarios', 'Estimaciones claras: no reemplazan el concepto de conexión ni los estudios'],
  },
  servicios: {
    nombre: 'Mantenimiento y servicios (O&M)', corto: 'O&M', quien: 'empresas de mantenimiento y servicios',
    h1: 'Encuentra los sistemas solares que necesitan mantenimiento',
    lead: 'Dónde hay más sistemas y plantas solares que mantener, proyectos nuevos en camino y pocas empresas para atenderlos.',
    hero: 'mapa-servicios',
    pasos: [
      ['Mira dónde está el trabajo', 'Un puntaje por municipio según autogeneración instalada, plantas solares cercanas, proyectos en camino, empresas por sistema, fallas de red y clima.', 'ranking-servicios', 'Ranking para mantenimiento con autogeneración, MW solares cercanos, proyectos e instaladores'],
      ['Ubica plantas y sistemas', 'Las plantas solares en operación y la autogeneración de cada municipio en el mapa.', 'mapa-servicios', 'Mapa con plantas solares y autogeneración por municipio'],
      ['Entiende cada zona', 'Autogeneradores, MW solares a 30 km, proyectos nuevos e instaladores del municipio, con el porqué del puntaje.', 'ficha-servicios', 'Ficha de un municipio con autogeneradores, MW solares cercanos y proyectos nuevos'],
      ['Sigue el mercado', 'Autogeneración por operador, plantas solares y proyectos registrados.', 'mercado', 'Panel de mercado con autogeneradores, plantas solares y proyectos'],
      ['Encuentra contratos', 'Licitaciones públicas de mantenimiento y operación de sistemas solares.', 'licitaciones', 'Lista de licitaciones públicas solares, incluidas de mantenimiento'],
    ],
    nums: ['municipios', 'secop', 'empresas'],
    incl: ['Ranking de zonas para mantenimiento y operación', 'Plantas solares en operación y autogeneración por municipio', 'Proyectos nuevos en camino', 'Licitaciones de mantenimiento', 'Empresas del sector con contacto empresarial', 'Seguimiento de zonas y prospectos'],
  },
  respaldo: {
    nombre: 'Baterías y respaldo', corto: 'Baterías', quien: 'empresas de baterías y sistemas híbridos',
    h1: 'Encuentra dónde se necesitan baterías y respaldo',
    lead: 'Dónde se va más la luz y la energía es cara: hogares, hoteles y comercios que necesitan baterías o sistemas híbridos, y las localidades sin red.',
    hero: 'mapa-respaldo',
    pasos: [
      ['Mira dónde se va la luz', 'Un puntaje por municipio según cortes de energía, horas sin luz al año, días con cortes, tarifa, hoteles y comercio.', 'ranking-respaldo', 'Ranking para baterías con cortes, horas sin luz, tarifa, turismo y puntaje'],
      ['Ubica las zonas sin red', 'Las localidades no interconectadas y los municipios con más cortes en el mapa.', 'mapa-respaldo', 'Mapa con el puntaje para baterías y las localidades no interconectadas'],
      ['Entiende cada municipio', 'Cortes, horas sin luz del operador, tarifa y turismo, con el porqué del puntaje.', 'ficha-respaldo', 'Ficha de un municipio con cortes de energía, horas sin luz, tarifa y turismo'],
      ['Encuentra clientes', 'Hoteles, comercios, colegios y centros de salud de las zonas con más cortes, con contacto empresarial.', 'municipio', 'Ficha de Barranquilla con cortes de energía y turismo'],
      ['Calcula y propone', 'Compara el sistema con y sin baterías, calcula el retorno y entrega la propuesta en PDF.', 'calculadora', 'Calculadora financiera con inversión, retorno y flujo de caja'],
    ],
    nums: ['municipios', 'clientes', 'salud', 'colegios'],
    incl: ['Ranking de zonas por cortes de energía y tarifa', 'Horas sin luz y número de cortes por operador', 'Localidades no interconectadas en el mapa', 'Hoteles, comercio, colegios y salud con contacto empresarial', 'Diseño con y sin baterías y propuesta en PDF', 'Seguimiento de zonas y prospectos'],
  },
};

const NUMS = { municipios: 'municipios con puntaje', ci: 'empresas grandes con sector e ingresos', empresas: 'empresas del sector solar', clientes: 'prestadores turísticos', colegios: 'sedes educativas', salud: 'sedes de salud', secop: 'licitaciones públicas solares', subs: 'subestaciones' };
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('es-CO'));
const cop = (n) => '$' + Math.round(n).toLocaleString('es-CO');
const scrollTo = (id) => (e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView(); };

function useContacto(cfg) {
  const wa = cfg.contact?.whatsapp ? cfg.contact.whatsapp.replace(/\D/g, '') : null;
  const mail = cfg.contact?.email || null;
  return (texto, asunto) => (wa ? `https://wa.me/${wa}?text=${encodeURIComponent(texto)}` : mail ? `mailto:${mail}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}` : 'https://www.talera.co/');
}

// Pestañas accesibles: flechas, Inicio y Fin mueven el foco y la selección
function useTabs(ids, initial) {
  const [cur, setCur] = useState(initial);
  const refs = useRef({});
  useEffect(() => { setCur(initial); }, [initial]);
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

export default function Landing({ cfg, perfil: perfilRuta }) {
  const raiz = !perfilRuta;
  const perfil = C[perfilRuta] ? perfilRuta : 'todo';
  const K = C[perfil];
  const [info, setInfo] = useState(null);
  useEffect(() => { api('/landing').then(setInfo).catch(() => setInfo({ totals: {}, perfiles: [] })); }, []);
  useEffect(() => {
    document.title = raiz ? `${cfg.appName || 'Radar Solar'}: inteligencia de mercado solar para Colombia` : `${cfg.appName || 'Radar Solar'} para ${K.quien}`;
    window.scrollTo(0, 0);
  }, [perfil, raiz, cfg.appName]);
  const t = info?.totals || {};
  const M = fmt(t.municipios || 1122);
  const fill = (s) => s.replace('{M}', M);
  const contacto = useContacto(cfg);
  const soy = perfil === 'todo' ? '' : ` Trabajo como ${K.nombre.toLowerCase()}.`;
  const prueba = contacto(`Hola, quiero una cuenta de prueba de Radar Solar.${soy}`, 'Cuenta de prueba de Radar Solar');
  const cotizar = contacto(`Hola, quiero cotizar el plan ${perfil === 'todo' ? 'completo (todo en uno)' : `para ${K.nombre.toLowerCase()}`} de Radar Solar.`, 'Plan de Radar Solar');
  const pasoIds = K.pasos.map((_, i) => `p${i}`);
  const [paso, pasoTab] = useTabs(pasoIds, 'p0');
  const P = K.pasos[pasoIds.indexOf(paso)] || K.pasos[0];
  const precio = cfg.plan?.precio || 750000;
  const desc = (id) => info?.perfiles?.find((p) => p.id === id)?.desc;

  return (
    <div className="lp">
      <a className="skip" href="#lp-main" onClick={(e) => { e.preventDefault(); document.getElementById('lp-main')?.focus(); }}>Saltar al contenido</a>
      <header className="lp-nav">
        <a href="#/" className="brand-mark" aria-label="Radar Solar, inicio"><img src="/icon.svg" alt="" width="28" height="28" /><span>Radar Solar</span></a>
        <nav aria-label="Secciones">
          <a href="#como" onClick={scrollTo('como')}>Cómo funciona</a>
          <a href="#perfiles" onClick={scrollTo('perfiles')}>Perfiles</a>
          <a href="#plan" onClick={scrollTo('plan')}>Plan</a>
          <a href="#preguntas" onClick={scrollTo('preguntas')}>Preguntas</a>
        </nav>
        <a className="btn sm lp-login" href="#/ingresar">Ingresar</a>
      </header>

      <main id="lp-main" tabIndex={-1}>
        <section className="lp-hero" aria-labelledby="lp-h1">
          <div className="lp-hero-map" aria-hidden="true"><img src="/isolineas.svg" alt="" /></div>
          <div className="lp-wrap lp-hero-copy">
            {!raiz && <p className="lp-for">Radar Solar para {K.quien}</p>}
            <h1 id="lp-h1" className={raiz ? "" : "long"}>{raiz ? C.todo.h1 : K.h1}</h1>
            <p className="lp-lead">{fill(raiz ? C.todo.lead : K.lead)}</p>
            {raiz ? (
              <div className="lp-choose" aria-labelledby="lp-choose-t">
                <p id="lp-choose-t" className="lp-choose-t">¿Qué haces en el sector solar?</p>
                <ul>
                  {ORDEN.map((id) => (
                    <li key={id}><a href={`#/para/${id}`} className={id === 'todo' ? 'all' : ''}><b>{C[id].nombre}</b><span>{id === 'todo' ? 'Los cinco perfiles en una sola cuenta' : C[id].h1.replace(/ en Colombia$/, '')}</span></a></li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <div className="lp-actions">
                  <a className="btn primary lg" href={prueba} target="_blank" rel="noreferrer">Pedir una cuenta de prueba</a>
                  <a className="btn lg lp-ghost" href="#como" onClick={scrollTo('como')}>Ver cómo funciona</a>
                </div>
                <nav className="lp-switch" aria-label="Otros perfiles">
                  <span>Otros perfiles:</span>
                  {ORDEN.filter((id) => id !== perfil).map((id) => <a key={id} href={`#/para/${id}`}>{C[id].corto}</a>)}
                </nav>
              </>
            )}
            <p className="lp-fine">Plan completo: {cop(precio)} COP, pago único. Sin suscripción ni cobros automáticos.</p>
          </div>
          <div className="lp-wrap">
            <figure className="lp-frame lp-hero-frame">
              <div className="lp-frame-bar" aria-hidden="true"><span>radar solar · mapa{perfil !== 'todo' ? ` · ${K.corto.toLowerCase()}` : ''}</span></div>
              <img src={`/producto/${K.hero}.webp`} alt={`La plataforma: mapa de Colombia con el puntaje de oportunidad de cada municipio para ${K.quien} y la lista de las mejores zonas`} width="1600" height="1000" fetchpriority="high" />
            </figure>
          </div>
        </section>

        <section id="como" className="lp-sec" aria-labelledby="como-t">
          <div className="lp-wrap">
            <h2 id="como-t">Cómo funciona{perfil !== 'todo' ? ` para ${K.corto === 'O&M' ? 'mantenimiento' : K.quien.split(',')[0]}` : ''}, en cinco pasos</h2>
            <div className="lp-steps">
              <div className="lp-step-list" role="tablist" aria-label="Pasos" aria-orientation="vertical">
                {K.pasos.map((p, i) => (
                  <button key={pasoIds[i]} className={`lp-step ${paso === pasoIds[i] ? 'on' : ''}`} {...pasoTab(pasoIds[i])}>
                    <span className="n" aria-hidden="true">{i + 1}</span>
                    <span className="tx"><b>{p[0]}</b><span>{p[1]}</span></span>
                  </button>
                ))}
              </div>
              <div className="lp-step-view" role="tabpanel" id={`panel-${paso}`} aria-labelledby={`tab-${paso}`}>
                <figure className="lp-frame" key={`${perfil}-${paso}`}>
                  <div className="lp-frame-bar" aria-hidden="true"><span>radar solar · {P[0].toLowerCase()}</span></div>
                  <img src={`/producto/${P[2]}.webp`} alt={P[3]} width="1600" height="1000" loading="lazy" />
                </figure>
              </div>
            </div>
          </div>
        </section>

        <section id="perfiles" className="lp-sec lp-dark" aria-labelledby="pq-t">
          <div className="lp-wrap">
            <h2 id="pq-t">{perfil === 'todo' ? 'Un mismo mapa, cinco negocios' : 'Otros negocios, el mismo mapa'}</h2>
            <p className="lp-sub">Cada perfil calcula su propio puntaje, ordena el menú a su manera y abre primero las capas que necesita. Con el acceso completo usas los cinco.</p>
            <ul className="lp-prof-list">
              {ORDEN.filter((id) => id !== 'todo').map((id) => (
                <li key={id} className={id === perfil ? 'on' : ''}>
                  <a href={`#/para/${id}`} aria-current={id === perfil ? 'page' : undefined}>
                    <b>{C[id].nombre}</b>
                    <span>{desc(id) || C[id].lead}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="lp-sec" aria-labelledby="datos-t">
          <div className="lp-wrap">
            <h2 id="datos-t">Lo que hay adentro</h2>
            <p className="lp-sub">Datos de registros públicos del Estado colombiano y fuentes abiertas, cada uno con su fecha de corte. Los puntajes y los cálculos de generación y retorno son estimaciones, y lo dicen. <a href="#/legal/fuentes">Alcance de la información</a>.</p>
            <dl className={`lp-nums n${K.nums.length}`}>
              {K.nums.map((k) => <div key={k}><dt>{NUMS[k]}</dt><dd>{fmt(t[k])}</dd></div>)}
            </dl>
          </div>
        </section>

        <section id="plan" className="lp-sec lp-plan" aria-labelledby="plan-t">
          <div className="lp-wrap lp-plan-grid">
            <div>
              <h2 id="plan-t">{perfil === 'todo' ? 'Un pago, acceso completo' : `Un pago, todo lo que necesitas como ${K.corto.toLowerCase()}`}</h2>
              <p className="lp-price"><span className="num">{cop(precio)}</span><span>COP<br />pago único</span></p>
              <p className="lp-fine dark">{cfg.plan?.impuestos || 'El valor total con impuestos se indica en la cotización, antes de pagar.'} {cfg.plan?.vigencia ? `Vigencia: ${cfg.plan.vigencia}.` : ''} Factura electrónica. <a href="#/legal/cancelaciones">Retracto y reversión</a>.</p>
              <div className="lp-actions">
                <a className="btn primary lg" href={cotizar} target="_blank" rel="noreferrer">{perfil === 'todo' ? 'Cotizar el todo en uno' : 'Cotizar el plan'}</a>
                <a className="btn lg" href={prueba} target="_blank" rel="noreferrer">Pedir una cuenta de prueba</a>
              </div>
            </div>
            <ul className="lp-incl">
              {K.incl.map((x) => <li key={x}>{fill(x)}</li>)}
              {perfil !== 'todo' && <li><a href="#/para/todo">¿Haces más de una cosa? Mira el todo en uno</a></li>}
            </ul>
          </div>
        </section>

        <section id="preguntas" className="lp-sec" aria-labelledby="faq-t">
          <div className="lp-wrap lp-faq-wrap">
            <h2 id="faq-t">Preguntas frecuentes</h2>
            <div className="lp-faq">
              <details><summary>¿Necesito instalar algo?</summary><p>No. Funciona en el navegador del computador y del celular.</p></details>
              <details><summary>¿Puedo probarla antes de pagar?</summary><p>Sí. Con una cuenta de prueba ves el mapa, el ranking y una muestra de cada sección. Pídela por WhatsApp o correo y la creamos para ti.</p></details>
              <details><summary>¿Qué diferencia hay entre un perfil y el todo en uno?</summary><p>Con un perfil la plataforma calcula el puntaje y ordena todo para ese negocio. Con el todo en uno cambias entre los cinco perfiles cuando quieras, por ejemplo si instalas y también vendes equipos.</p></details>
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
            <nav className="lp-foot-prof" aria-label="Radar Solar por perfil">
              {ORDEN.map((id) => <a key={id} href={`#/para/${id}`}>{C[id].nombre}</a>)}
            </nav>
            <a className="btn" href="#/ingresar">Ingresar a la plataforma</a>
          </div>
          <LegalLine titular={cfg.titular} />
          <p className="lp-credit">Capturas de la plataforma con datos públicos. Mapas base © OpenStreetMap y © CARTO.</p>
        </div>
      </footer>
    </div>
  );
}
