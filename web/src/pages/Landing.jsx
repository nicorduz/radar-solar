import { LEMA, Equipo, Cifras, Servicios } from '../components/Talera.jsx';
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { LegalLine } from './Legal.jsx';
import { RDDiagrama, RD_EJEMPLOS, RD_PASOS, RD_TALERA, RD_FAQ } from '../components/RespuestaDemanda.jsx';

// Páginas de inicio públicas. La raíz pregunta qué hace el visitante y lleva a la página de su perfil
// (#/para/<perfil>); "todo" es la página del acceso completo; "demanda" es un servicio de Talera.
// Las capturas son de la plataforma real (web/public/producto); los conteos vienen de /api/landing.

const ORDEN = ['instalador', 'proveedor', 'desarrollador', 'servicios', 'demanda', 'todo'];

const C = {
  todo: {
    nombre: 'Todo en uno', corto: 'Todo en uno', quien: 'empresas que hacen varias cosas en la cadena',
    h1: 'Inteligencia de mercado solar para Colombia',
    lead: 'Tarifas, sol, red eléctrica, empresas, trámites y proyectos de los {M} municipios, sobre un mapa 3D del país que se ajusta a tu negocio: instalación, venta de equipos, desarrollo de proyectos o mantenimiento.',
    hero: 'mapa-3d',
    pasos: [
      ['Elige qué vendes', 'El puntaje de cada municipio se calcula para tu negocio. Con el acceso completo cambias de perfil cuando quieras y ajustas el peso de cada factor.', 'ranking', 'Ranking de municipios con su tarifa, vivienda nueva, turismo, cortes, radiación y puntaje'],
      ['Mira el país en 3D', 'El relieve real de Colombia con las líneas de transmisión por tensión, las subestaciones y cada planta con el modelo de su tecnología: solar, hidráulica, gas, carbón, eólica y biomasa.', 'mapa-3d', 'Mapa 3D de la cordillera con líneas de transmisión por tensión, subestaciones y plantas de generación como modelos'],
      ['Encuentra a quién venderle', 'Hoteles, colegios, hospitales y empresas ordenados por oportunidad: cuándo se va la luz en su zona, el porqué, el sistema sugerido y cómo entrar a cada uno.', 'hoteles', 'Hoteles de Magdalena ordenados por oportunidad, con la gráfica de cortes por día de la semana y cómo abordarlos'],
      ['Planea el trámite', 'Para cada forma de conectarse, los documentos que te faltan, con quién hablar y el proceso con los plazos de la CREG, con el operador de red de la zona.', 'tramites', 'Panel de trámites con la lista de documentos, el operador de red y los plazos'],
      ['Sigue el mercado', 'Dónde crece la autogeneración, quién la está conectando, el precio de bolsa y los proyectos registrados.', 'tendencias', 'Sistemas nuevos de autogeneración por departamento, con su cambio y las empresas que los conectan'],
      ['Calcula y propone', 'Retorno, crédito y beneficios tributarios de la Ley 1715. Diseña el sistema sobre la imagen satelital y entrega la propuesta en PDF con tu marca.', 'calculadora', 'Calculadora financiera con inversión, retorno, ahorro y flujo de caja a 25 años'],
    ],
    nums: ['municipios', 'ci', 'empresas', 'clientes', 'colegios', 'salud', 'secop', 'subs'],
    incl: ['Todos los perfiles en una sola cuenta, con su puntaje, sus capas y su menú', 'Mapa 3D con relieve, satélite, líneas por tensión y plantas por tecnología', 'Ranking y ficha de los {M} municipios', 'Colegios, salud, hoteles y empresas ordenados por oportunidad, con cómo abordarlos', 'Trámites por forma de conexión: documentos, entidades y plazos', 'Diseño solar, calculadora y propuestas en PDF con tu marca', 'Mercado: dónde crece la autogeneración, precio de bolsa, proyectos e importaciones', 'Asistente con IA para argumentos y mensajes'],
  },
  instalador: {
    nombre: 'Instalador solar', corto: 'Instalador', quien: 'instaladores',
    h1: 'Encuentra dónde vender sistemas solares en Colombia',
    lead: 'Los municipios con tarifa alta, obra nueva, calor, turismo y cortes; los colegios, hospitales, hoteles y empresas ordenados por oportunidad; los trámites de conexión paso a paso, y la propuesta lista en PDF.',
    hero: 'mapa',
    pasos: [
      ['Mira dónde está la demanda', 'Un puntaje por municipio para hogares, conjuntos o comercio, según la tarifa, la vivienda nueva, el consumo, el clima y los cortes. Tú ajustas los pesos.', 'ranking', 'Ranking de municipios para instaladores con tarifa, vivienda nueva, turismo, cortes, radiación y puntaje'],
      ['Ubica las zonas en el mapa', 'Las mejores zonas cerca de ti y la autogeneración que ya está instalada en cada municipio. Dibuja tu zona de trabajo y guárdala.', 'mapa', 'Mapa de Colombia con el puntaje para instaladores y la autogeneración por municipio'],
      ['Entiende cada municipio', 'Tarifa por estrato, vivienda nueva de los últimos 12 meses, cortes, turismo y radiación, con el porqué del puntaje.', 'municipio', 'Ficha de Barranquilla con tarifa, vivienda nueva, cortes y turismo'],
      ['Elige a quién venderle', 'Colegios, hospitales, hoteles y empresas ordenados por oportunidad: por qué te conviene cada uno, el sistema que necesita, el ahorro y cómo entrar.', 'colegios', 'Colegios ordenados por oportunidad, con razones, sistema sugerido, ahorro y cómo abordarlos'],
      ['Vende al turismo', 'Hoteles y alojamientos ordenados por oportunidad, con el calor, el crecimiento de la zona y cuándo se va la luz: si los cortes caen en fines de semana y festivos, tienes el argumento para vender baterías.', 'hoteles', 'Hoteles de Magdalena ordenados por oportunidad, con la gráfica de cortes por día de la semana'],
      ['Tramita la conexión', 'Lo que te falta, con quién hablas y el proceso con los plazos de la CREG para un sistema de hasta 100 kW, de hasta 1 MW, colectivo o remoto.', 'tramites', 'Panel de trámites con la lista de documentos, el operador de red y los plazos'],
      ['Calcula y entrega la propuesta', 'Diseña sobre la imagen satelital, calcula el retorno y la cuota del crédito, y entrega la propuesta en PDF con tu marca.', 'calculadora', 'Calculadora financiera con inversión, retorno, ahorro y flujo de caja a 25 años'],
    ],
    nums: ['municipios', 'clientes', 'colegios', 'salud', 'ci', 'secop'],
    incl: ['Ranking por segmento: hogares, conjuntos y comercio', 'Ficha de cada municipio con tarifa, cortes, vivienda nueva y sol', 'Colegios, salud, hoteles y empresas ordenados por oportunidad, con cómo abordarlos', 'Trámites de conexión por forma de autogeneración, con documentos y plazos', 'Licitaciones públicas solares', 'Diseño sobre satélite, calculadora y propuesta en PDF con tu marca', 'Seguimiento de zonas y prospectos'],
  },
  proveedor: {
    nombre: 'Proveedor de equipos', corto: 'Proveedor', quien: 'proveedores y distribuidores de equipos',
    h1: 'Encuentra dónde están los instaladores que compran equipos',
    lead: 'Dónde crece y dónde cae la autogeneración, qué empresas la están conectando y dónde hay menos mayoristas compitiendo. Con las empresas del sector y las importaciones de paneles y baterías.',
    hero: 'mapa-proveedor',
    pasos: [
      ['Mira dónde está tu mercado', 'Un puntaje por municipio según instaladores en la zona, autogeneración conectada, contratistas con contratos solares, obra nueva y mayoristas por instalador.', 'ranking-proveedor', 'Ranking de municipios para proveedores con instaladores, autogeneración, vivienda nueva, tarifa y puntaje'],
      ['Ve la autogeneración en el mapa', 'Los sistemas de autogeneración reportados en cada municipio y las plantas solares, para saber dónde se está instalando.', 'mapa-proveedor', 'Mapa para proveedores con autogeneración por municipio y plantas solares'],
      ['Entiende cada zona', 'Instaladores, autogeneradores y vivienda nueva del municipio, y el porqué de su puntaje.', 'ficha-proveedor', 'Ficha de un municipio con instaladores, autogeneradores, vivienda nueva y los factores del puntaje para proveedores'],
      ['Mira dónde crece la demanda', 'Sistemas nuevos de autogeneración por departamento y municipio frente al año anterior, de qué tamaño y qué empresas los están conectando: tus compradores.', 'tendencias', 'Sistemas nuevos de autogeneración por departamento, con su cambio y las empresas que los conectan'],
      ['Encuentra a tus clientes', 'Las empresas del sector con su municipio y contacto empresarial, y quién gana las licitaciones públicas solares.', 'licitaciones', 'Lista de licitaciones públicas solares con entidad, fecha y estado'],
    ],
    nums: ['empresas', 'municipios', 'secop', 'ci'],
    incl: ['Ranking de zonas para distribución de equipos', 'Dónde crece la autogeneración y quién la conecta, mes a mes', 'Empresas del sector: instaladores y mayoristas, con contacto empresarial', 'Importaciones de paneles y baterías: volumen, precio, origen y destino', 'Licitaciones públicas y quién las gana', 'Asistente con IA para argumentos de venta'],
  },
  desarrollador: {
    nombre: 'Desarrollador (inversionista)', corto: 'Desarrollador (inversionista)', quien: 'desarrolladores, inversionistas y vehículos de propósito especial (SPV)',
    h1: 'Encuentra dónde desarrollar proyectos solares en Colombia',
    lead: 'Granjas solares y autogeneración remota: radiación, cercanía y tensión de subestaciones, capacidad indicativa de conexión, tarifa comercial, contingencias de red y saturación de plantas, municipio por municipio.',
    hero: 'mapa-3d',
    pasos: [
      ['Compara sitios', 'Un puntaje por municipio con radiación, cercanía a subestación, tensión disponible, tarifa comercial, contingencias y plantas cercanas. Filtra por distancia, radiación y tensión.', 'ranking-desarrollador', 'Ranking para desarrolladores con radiación, distancia a subestación, capacidad de conexión, MW cercanos y tarifa comercial'],
      ['Mira la red en 3D', 'El relieve del país con las líneas por tensión, las torres y los cables, las subestaciones y las plantas de cada tecnología, más la capacidad indicativa de conexión.', 'mapa-torres', 'Mapa 3D con torres y cables de transmisión sobre la cordillera'],
      ['Revisa cada municipio', 'Radiación, subestación más cercana, tensión, capacidad de conexión y tarifa comercial, con el porqué del puntaje.', 'ficha-desarrollador', 'Ficha de un municipio con radiación, subestación, capacidad de conexión y tarifa comercial'],
      ['Entiende la conexión', 'Capacidad de las barras cercanas, proyectos que compiten por la misma red, el régimen de asignación vigente, los ciclos, las garantías y los modelos que pide el CND.', 'tramites-proyecto', 'Panel de conexión para un proyecto de más de 1 MW con capacidad, subestaciones y proyectos cercanos'],
      ['Haz los números', 'Retorno, valor presente, TIR y beneficios tributarios de la Ley 1715 como primera estimación.', 'calculadora', 'Calculadora financiera con inversión, TIR, valor presente y flujo de caja'],
    ],
    nums: ['municipios', 'subs', 'secop'],
    incl: ['Ranking de sitios con filtros de distancia, radiación y tensión', 'Mapa 3D con relieve, líneas por tensión, subestaciones y plantas', 'Ruta de conexión: capacidad cercana, cola de proyectos, ciclos, garantías y modelos', 'Plantas en operación y proyectos de generación registrados', 'Precio de bolsa y mercado de autogeneración', 'Calculadora financiera con TIR y beneficios tributarios', 'Estimaciones claras: no reemplazan el concepto de conexión ni los estudios'],
  },
  servicios: {
    nombre: 'Mantenimiento y servicios (O&M)', corto: 'O&M', quien: 'empresas de mantenimiento y servicios',
    h1: 'Encuentra los sistemas solares que necesitan mantenimiento',
    lead: 'Dónde hay más sistemas y plantas solares que mantener, proyectos nuevos en camino y pocas empresas para atenderlos.',
    hero: 'mapa-servicios',
    pasos: [
      ['Mira dónde está el trabajo', 'Un puntaje por municipio según autogeneración instalada, plantas solares cercanas, proyectos en camino, empresas por sistema, fallas de red y clima.', 'ranking-servicios', 'Ranking para mantenimiento con autogeneración, MW solares cercanos, proyectos e instaladores'],
      ['Ubica plantas y sistemas', 'Las plantas en operación de cada tecnología, en 3D sobre el relieve, y la autogeneración de cada municipio.', 'mapa-3d', 'Mapa 3D con plantas de generación por tecnología, subestaciones y líneas'],
      ['Entiende cada zona', 'Autogeneradores, MW solares a 30 km, proyectos nuevos e instaladores del municipio, con el porqué del puntaje.', 'ficha-servicios', 'Ficha de un municipio con autogeneradores, MW solares cercanos y proyectos nuevos'],
      ['Sigue el mercado', 'Autogeneración por operador, plantas solares y proyectos registrados.', 'mercado', 'Panel de mercado con autogeneradores, plantas solares y proyectos'],
      ['Encuentra contratos', 'Licitaciones públicas de mantenimiento y operación de sistemas solares.', 'licitaciones', 'Lista de licitaciones públicas solares, incluidas de mantenimiento'],
    ],
    nums: ['municipios', 'secop', 'empresas'],
    incl: ['Ranking de zonas para mantenimiento y operación', 'Plantas solares en operación y autogeneración por municipio', 'Proyectos nuevos en camino', 'Licitaciones de mantenimiento', 'Empresas del sector con contacto empresarial', 'Seguimiento de zonas y prospectos'],
  },
  demanda: {
    servicio: true,
    nombre: 'Respuesta a la demanda', corto: 'Respuesta a la demanda', quien: 'industrias, cadenas comerciales y edificios',
    h1: 'Gana dinero por bajar tu consumo cuando la energía está cara',
    lead: 'Desde junio de 2026 la CREG tiene un programa permanente que le paga a las empresas por reducir su consumo en las horas en que la bolsa está alta. Talera modela tu operación y estructura tu participación, en bolsa o con demanda desconectable voluntaria.',
    pasos: [],
    nums: [],
    incl: [],
  },
};

const NUMS = { municipios: 'municipios con puntaje', ci: 'empresas grandes con sector e ingresos', empresas: 'empresas del sector solar', clientes: 'prestadores turísticos', colegios: 'sedes educativas', salud: 'sedes de salud', secop: 'licitaciones públicas solares', subs: 'subestaciones' };
const fmt = (n) => (n == null ? '—' : Math.round(n).toLocaleString('es-CO'));
const cop = (n) => '$' + Math.round(n).toLocaleString('es-CO');
const NUM_TXT = { 4: 'cuatro', 5: 'cinco', 6: 'seis', 7: 'siete' };
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
  const soy = perfil === 'todo' || K.servicio ? '' : ` Trabajo como ${K.nombre.toLowerCase()}.`;
  const hablarRD = contacto('Hola, quiero saber cuánto puede ganar mi empresa con respuesta a la demanda.', 'Respuesta a la demanda con Talera');
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
          {K.servicio ? <>
            <a href="#ganar" onClick={scrollTo('ganar')}>Cuánto se gana</a>
            <a href="#talera" onClick={scrollTo('talera')}>Qué hace Talera</a>
          </> : <>
            <a href="#perfiles" onClick={scrollTo('perfiles')}>Perfiles</a>
            <a href="#plan" onClick={scrollTo('plan')}>Plan</a>
            {raiz && <a href="#nosotros" onClick={scrollTo('nosotros')}>Quiénes somos</a>}
          </>}
          <a href="#preguntas" onClick={scrollTo('preguntas')}>Preguntas</a>
        </nav>
        <a className="btn sm lp-login" href="#/ingresar">Ingresar</a>
      </header>

      <main id="lp-main" tabIndex={-1}>
        <section className="lp-hero" aria-labelledby="lp-h1">
          <div className="lp-hero-map" aria-hidden="true"><img src="/isolineas.svg" alt="" /></div>
          <div className="lp-wrap lp-hero-copy">
            {!raiz && <p className="lp-for">{K.servicio ? 'Talera' : 'Radar Solar'} para {K.quien}</p>}
            <h1 id="lp-h1" className={raiz ? "" : "long"}>{raiz ? C.todo.h1 : K.h1}</h1>
            <p className="lp-lead">{fill(raiz ? C.todo.lead : K.lead)}</p>
            {raiz ? (
              <div className="lp-choose" aria-labelledby="lp-choose-t">
                <p id="lp-choose-t" className="lp-choose-t">¿Qué haces en el sector solar?</p>
                <ul>
                  {ORDEN.map((id) => (
                    <li key={id}><a href={`#/para/${id}`} className={id === 'todo' ? 'all' : C[id].servicio ? 'srv' : ''}><b>{C[id].nombre}</b><span>{id === 'todo' ? 'Todos los perfiles en una sola cuenta' : C[id].h1.replace(/ en Colombia$/, '')}</span>{C[id].servicio && <i>Servicio de Talera</i>}</a></li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <div className="lp-actions">
                  {K.servicio
                    ? <a className="btn primary lg" href={hablarRD} target="_blank" rel="noreferrer">Hablar con Talera</a>
                    : <a className="btn primary lg" href={prueba} target="_blank" rel="noreferrer">Pedir una cuenta de prueba</a>}
                  <a className="btn lg lp-ghost" href="#como" onClick={scrollTo('como')}>Ver cómo funciona</a>
                </div>
                <nav className="lp-switch" aria-label="Otros perfiles">
                  <span>Otros perfiles:</span>
                  {ORDEN.filter((id) => id !== perfil).map((id) => <a key={id} href={`#/para/${id}`}>{C[id].corto}</a>)}
                </nav>
              </>
            )}
            {!K.servicio && <p className="lp-fine">Plan completo: {cop(precio)} COP, pago único. Sin suscripción ni cobros automáticos.</p>}
          </div>
          {K.servicio ? (
            <div className="lp-wrap"><div className="lp-frame lp-hero-frame rd-hero"><RDDiagrama /></div></div>
          ) : <div className="lp-wrap">
            <figure className="lp-frame lp-hero-frame">
              <div className="lp-frame-bar" aria-hidden="true"><span>radar solar · mapa{perfil !== 'todo' ? ` · ${K.corto.toLowerCase()}` : ''}</span></div>
              <img src={`/producto/${K.hero}.webp`} alt={K.hero === 'mapa-3d' ? 'La plataforma: mapa 3D de Colombia con el relieve, las líneas de transmisión por tensión, las subestaciones y las plantas de generación' : `La plataforma: mapa de Colombia con el puntaje de oportunidad de cada municipio para ${K.quien} y la lista de las mejores zonas`} width="1600" height="1000" fetchpriority="high" />
            </figure>
          </div>}
        </section>

        {K.servicio && <>
          <section id="como" className="lp-sec" aria-labelledby="como-t">
            <div className="lp-wrap">
              <h2 id="como-t">Cómo funciona</h2>
              <p className="lp-sub">Te pagan por la energía que dejas de consumir frente a tu consumo típico, en las horas en que el sistema la necesita. No tienes que parar tu operación: basta con mover lo que se puede mover.</p>
              <ol className="rd-pasos">{RD_PASOS.map(([t, x]) => <li key={t}><b>{t}</b><span>{x}</span></li>)}</ol>
            </div>
          </section>
          <section id="ganar" className="lp-sec lp-dark rd-ganar" aria-labelledby="ganar-t">
            <div className="lp-wrap">
              <h2 id="ganar-t">Cuánto se puede ganar</h2>
              <p className="lp-sub">Ejemplos de lo que reciben empresas típicas al mes cuando la energía está cara. Entre mayo y octubre de 2026 el precio de bolsa promedió más de $500 por kWh.</p>
              <ul className="rd-ej">
                {RD_EJEMPLOS.map((e) => <li key={e.quien}><span className="rd-ej-q">{e.quien}</span><b>{e.rango}</b><span className="rd-ej-m">al mes</span><p>{e.que}</p><p className="rd-ej-s">{e.sup}</p></li>)}
              </ul>
              <p className="rd-nota">Antes de la comisión del representante. Tu cifra depende de tu curva de carga, de lo que puedes mover y de tu línea base: Talera la calcula con tus datos de medición.</p>
              <a className="btn primary lg" href={hablarRD} target="_blank" rel="noreferrer">Calcular cuánto puede ganar mi empresa</a>
            </div>
          </section>
          <section id="talera" className="lp-sec" aria-labelledby="talera-t">
            <div className="lp-wrap">
              <h2 id="talera-t">Lo que hace Talera</h2>
              <p className="lp-sub">Modelamos tu operación y estructuramos tu participación de principio a fin, para que ofertes lo que de verdad puedes cumplir.</p>
              <ul className="rd-srv">{RD_TALERA.map(([t, x]) => <li key={t}><b>{t}</b><span>{x}</span></li>)}</ul>
              <div className="rd-req">
                <h3>Qué necesitas</h3>
                <ul>
                  <li>Consumo que se pueda reducir de 1 MWh en una hora, solo o sumando varias sedes.</li>
                  <li>Un medidor que cumpla el Código de Medida, como una frontera comercial.</li>
                  <li>Un consumo estable: entre más predecible, más precisa tu línea base.</li>
                </ul>
              </div>
            </div>
          </section>
        </>}

        {!K.servicio && <>
        <section id="como" className="lp-sec" aria-labelledby="como-t">
          <div className="lp-wrap">
            <h2 id="como-t">Cómo funciona{perfil !== 'todo' ? ` para ${K.corto === 'O&M' ? 'mantenimiento' : K.quien.split(',')[0]}` : ''}, en {NUM_TXT[K.pasos.length] || K.pasos.length} pasos</h2>
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
            <h2 id="pq-t">{perfil === 'todo' ? 'Un mismo mapa para cada negocio' : 'Otros negocios, el mismo mapa'}</h2>
            <p className="lp-sub">Cada perfil calcula su propio puntaje, ordena el menú a su manera y abre primero las capas que necesita. Con el acceso completo los usas todos. Respuesta a la demanda es un servicio de Talera.</p>
            <ul className="lp-prof-list">
              {ORDEN.filter((id) => id !== 'todo').map((id) => (
                <li key={id} className={id === perfil ? 'on' : ''}>
                  <a href={`#/para/${id}`} aria-current={id === perfil ? 'page' : undefined}>
                    <b>{C[id].nombre}</b>
                    <span>{C[id].servicio ? 'Talera modela y estructura tu participación en respuesta a la demanda y demanda desconectable voluntaria.' : desc(id) || C[id].lead}</span>
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

        {raiz && (
          <section id="nosotros" className="lp-sec tl-sec" aria-labelledby="nosotros-t">
            <div className="lp-wrap">
              <p className="tl-lema">Talera · {LEMA}</p>
              <h2 id="nosotros-t">Quiénes somos</h2>
              <p className="lp-sub">Radar Solar es la herramienta que usamos y compartimos. Lo que hacemos en Talera es estructurar proyectos de energía: due diligence, finanzas, capital, respuesta a la demanda y análisis de mercado, para desarrolladores, inversionistas y empresas en Estados Unidos y Colombia.</p>
              <Equipo />
              <Cifras />
              <p className="tl-nota">Cifras de proyectos en los que ha trabajado el equipo de Talera. Los clientes son confidenciales.</p>
              <h3 className="tl-h3">Lo que hacemos</h3>
              <Servicios titulo="h4" />
              <div className="lp-actions">
                <a className="btn primary lg" href={contacto('Hola, quiero consultar a Talera sobre un proyecto de energía.', 'Consulta a Talera')} target="_blank" rel="noreferrer">Consultar a Talera</a>
                <a className="btn lg" href="https://www.talera.co/" target="_blank" rel="noreferrer">Conocer Talera</a>
              </div>
            </div>
          </section>
        )}

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

        </>}

        <section id="preguntas" className="lp-sec" aria-labelledby="faq-t">
          <div className="lp-wrap lp-faq-wrap">
            <h2 id="faq-t">Preguntas frecuentes</h2>
            {K.servicio ? <div className="lp-faq">{RD_FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div> : <div className="lp-faq">
              <details><summary>¿Necesito instalar algo?</summary><p>No. Funciona en el navegador del computador y del celular.</p></details>
              <details><summary>¿Puedo probarla antes de pagar?</summary><p>Sí. Con una cuenta de prueba ves el mapa, el ranking y una muestra de cada sección. Pídela por WhatsApp o correo y la creamos para ti.</p></details>
              <details><summary>¿Qué diferencia hay entre un perfil y el todo en uno?</summary><p>Con un perfil la plataforma calcula el puntaje y ordena todo para ese negocio. Con el todo en uno cambias entre todos los perfiles cuando quieras, por ejemplo si instalas y también vendes equipos.</p></details>
              <details><summary>¿Qué es la respuesta a la demanda?</summary><p>Un programa permanente de la CREG (Resolución 101 111 de 2026) que paga a las empresas por reducir su consumo en las horas en que la energía está cara. Talera modela tu operación y estructura tu participación. <a href="#/para/demanda">Ver cómo funciona</a>.</p></details>
              <details><summary>¿De dónde salen los datos?</summary><p>De registros públicos del Estado colombiano y de fuentes abiertas, con su fecha de corte. Los puntajes, la generación y el retorno son estimaciones de la plataforma; no reemplazan un estudio técnico ni la solicitud de conexión ante el operador de red. <a href="#/legal/fuentes">Más detalle</a>.</p></details>
              <details><summary>¿Cuánto dura el acceso?</summary><p>{cfg.plan?.vigencia ? `${cfg.plan.vigencia}.` : 'Según los términos de uso vigentes al momento de la compra.'} No hay renovación automática. <a href="#/legal/terminos">Términos de uso</a>.</p></details>
              <details><summary>¿Sirve para todo mi equipo?</summary><p>Sí. Cada vendedor o ingeniero entra con su propio usuario y su propia contraseña.</p></details>
              <details><summary>¿Qué hacen con mis datos?</summary><p>Solo los de tu cuenta, para prestarte el servicio. Tus prospectos y diseños se guardan en tu navegador. <a href="#/legal/privacidad">Política de tratamiento de datos</a>.</p></details>
            </div>}
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
          <p className="lp-credit">Capturas de la plataforma con datos públicos. Mapas base © OpenStreetMap y © CARTO; imágenes y base del relieve © Esri; relieve: Terrain Tiles (AWS).</p>
        </div>
      </footer>
    </div>
  );
}
