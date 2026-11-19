import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import Markdown from '../components/Markdown.jsx';
import { Spinner } from '../components/ui.jsx';

// Documentos legales servidos por el servidor (versionados). Se pueden leer sin iniciar sesión.
export const LEGAL_DOCS = [
  ['terminos', 'Términos de uso'],
  ['privacidad', 'Política de tratamiento de datos'],
  ['aviso', 'Aviso de privacidad'],
  ['autorizacion', 'Autorización de datos'],
  ['cookies', 'Cookies y almacenamiento'],
  ['cancelaciones', 'Pagos, retracto y reversión'],
  ['fuentes', 'Alcance de la información'],
  ['publicidad', 'Comunicaciones comerciales'],
];

export function LegalDoc({ doc, compact = false }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { setD(null); setErr(null); api(`/legal/${doc}`).then(setD).catch((e) => setErr(e.message)); }, [doc]);
  if (err) return <div className="alert err" role="alert">{err}</div>;
  if (!d) return <Spinner />;
  return (
    <article className="legal" aria-labelledby={`doc-${doc}`}>
      {!compact && <header className="legal-head"><p className="eyebrow">Versión {d.version}</p><h1 id={`doc-${doc}`}>{d.titulo}</h1></header>}
      {compact && <h2 id={`doc-${doc}`} className="sr-only">{d.titulo}</h2>}
      <Markdown text={d.texto} doc />
    </article>
  );
}

export default function Legal({ doc }) {
  const cur = LEGAL_DOCS.some(([k]) => k === doc) ? doc : 'terminos';
  return (
    <div className="page legal-page">
      <nav className="legal-nav" aria-label="Documentos legales">
        <p className="eyebrow">Legal</p>
        <ul>{LEGAL_DOCS.map(([k, l]) => <li key={k}><a href={`#/legal/${k}`} aria-current={k === cur ? 'page' : undefined}>{l}</a></li>)}<li><a href="#/derechos">Ejercer mis derechos</a></li></ul>
      </nav>
      <LegalDoc doc={cur} />
    </div>
  );
}

// Envoltorio para ver documentos y el formulario de derechos sin sesión
export function PublicShell({ children }) {
  return (
    <div className="public">
      <header className="public-bar">
        <a href="#/" className="brand-mark"><img src="/icon.svg" alt="" width="28" height="28" /><span>Radar Solar</span></a>
        <a href="#/" className="btn ghost sm">Ingresar</a>
      </header>
      <main id="main" className="public-main" tabIndex={-1}>{children}</main>
      <footer className="public-foot"><LegalLine /></footer>
    </div>
  );
}

// Pie con propiedad, enlaces legales y canal de derechos
export function LegalLine({ titular }) {
  return (
    <span className="legal-line">
      <span>© {new Date().getFullYear()} {(titular || 'Radar Solar').replace(/\.$/, '')}. La licencia permite el acceso; no autoriza copiar ni reproducir la plataforma.</span>
      <span className="links"><a href="#/legal/terminos">Términos</a><a href="#/legal/privacidad">Privacidad</a><a href="#/legal/cookies">Cookies</a><a href="#/derechos">Mis derechos</a></span>
    </span>
  );
}
