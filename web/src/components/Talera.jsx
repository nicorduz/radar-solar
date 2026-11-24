import React from 'react';

// Quiénes somos: Talera, sus fundadores y lo que hace en energía. Cifras tomadas de talera.co (casos publicados)
// y de las hojas de vida de los fundadores; los clientes son confidenciales y no se nombran.
export const LEMA = 'Agencia de inteligencia para Energy as a Service';
export const TALERA_MAIL = 'workwithus@talera.co';

export const EQUIPO = [
  {
    id: 'ana', nombre: 'Ana Sofía Romero', rol: 'Cofundadora · Estrategia e inteligencia', lugar: 'Nueva York', foto: '/equipo/ana-sofia-romero.webp',
    bio: 'Dirige la estrategia, el desarrollo de negocio y la relación con los clientes de Talera. Antes, en Oracle, diseñó el programa de entrada de nuevos equipos para Latinoamérica y un asistente interno con inteligencia artificial.',
    temas: ['Estrategia', 'Inteligencia de mercado', 'Desarrollo de negocio'],
    linkedin: 'https://www.linkedin.com/in/ana-sofia-romero/',
  },
  {
    id: 'nicolas', nombre: 'Nicolás Orduz Álvarez', rol: 'Cofundador · Ingeniería y energía inteligente', lugar: 'Japón', foto: '/equipo/nicolas-orduz.webp',
    bio: 'Ingeniero electricista. Investiga plantas virtuales de energía y respuesta a la demanda en la Universidad Nacional de Yokohama. Como owner’s engineer ha evaluado más de 3,7 GW en compras y financiación de plantas solares y baterías en Estados Unidos; antes hizo diez due diligence técnicas de plantas solares en Colombia y gestión de la demanda en Enel.',
    temas: ['Plantas virtuales', 'Respuesta a la demanda', 'PPA y precio de captura', 'Interconexión', 'Due diligence técnica'],
    linkedin: 'https://www.linkedin.com/in/nicol%C3%A1s-orduz-alvarez/',
  },
  {
    id: 'daniel', nombre: 'Daniel Villate Cárdenas', rol: 'Cofundador · Finanzas de proyectos', lugar: 'Bogotá', foto: '/equipo/daniel-villate.webp',
    bio: 'Economista de la Universidad de los Andes. Hace project finance y M&A de plantas solares y baterías a escala utility para inversionistas en Estados Unidos: modelos de deuda, valoración de portafolios y materiales para levantar capital. Antes trabajó en banca de inversión en Bonus y Revaliu.',
    temas: ['Project finance', 'M&A', 'Modelos financieros', 'Levantamiento de capital'],
    linkedin: 'https://www.linkedin.com/in/daniel-villate-c%C3%A1rdenas-788751155/',
  },
];

export const CIFRAS = [
  ['+40', 'activos solares y de baterías estructurados'],
  ['+US$3.000 M', 'en transacciones apoyadas'],
  ['875 MW', 'con due diligence de owner’s engineer'],
  ['15', 'portafolios estructurados'],
];

export const SERVICIOS = [
  { id: 'dd', t: 'Due diligence técnica y de M&A', x: 'Revisamos como owner’s engineer lo que compras o financias: producción P50/P90, interconexión, contratos EPC y bancabilidad de equipos.' },
  { id: 'fin', t: 'Estructuración financiera', x: 'Modelos de project finance, deuda y valoración que resisten la revisión de un banco o un comité de inversión.' },
  { id: 'capital', t: 'Levantamiento de capital y SPV', x: 'Armamos el vehículo del proyecto, el memorando de inversión y la ruta para hablar con inversionistas y financiadores.' },
  { id: 'rd', t: 'Respuesta a la demanda', x: 'Modelamos las cargas y la línea base de tu operación y estructuramos tu participación en el programa de la CREG.' },
  { id: 'mercado', t: 'Análisis de mercado y regulatorio', x: 'Precios, red, competencia, tarifas y trámites para decidir dónde y cómo entrar. Radar Solar es parte de ese trabajo.' },
  { id: 'equipo', t: 'Analistas e ingenieros en tu equipo', x: 'Profesionales bilingües en finanzas e ingeniería que trabajan dentro de tu operación, con nuestro estándar.' },
];

export function Equipo({ titulo = 'h3' }) {
  const H = titulo;
  return (
    <ul className="tl-equipo">
      {EQUIPO.map((p) => (
        <li key={p.id}>
          <img src={p.foto} alt={p.nombre} width="320" height="320" loading="lazy" />
          <div className="tl-p">
            <H>{p.nombre}</H>
            <p className="tl-rol">{p.rol} · {p.lugar}</p>
            <p className="tl-bio">{p.bio}</p>
            <ul className="tl-temas" aria-label="Temas">{p.temas.map((t) => <li key={t}>{t}</li>)}</ul>
            <a className="tl-in" href={p.linkedin} target="_blank" rel="noreferrer">LinkedIn<span className="sr-only"> de {p.nombre}</span></a>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Cifras() {
  return (
    <dl className="tl-cifras">
      {CIFRAS.map(([n, t]) => <div key={t}><dt>{t}</dt><dd>{n}</dd></div>)}
    </dl>
  );
}

export function Servicios({ titulo = 'h3' }) {
  const H = titulo;
  return <ul className="tl-serv">{SERVICIOS.map((s) => <li key={s.id}><H>{s.t}</H><p>{s.x}</p></li>)}</ul>;
}
