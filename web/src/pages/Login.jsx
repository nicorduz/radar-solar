import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { LegalLine } from './Legal.jsx';

export default function Login({ cfg, onLogin }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [code, setCode] = useState('');
  const [mfa, setMfa] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const codeRef = useRef(null);
  useEffect(() => { if (mfa) codeRef.current?.focus(); }, [mfa]);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try {
      if (mfa) { const r = await api('/login/mfa', { method: 'POST', body: { code } }); onLogin(r.user); return; }
      const r = await api('/login', { method: 'POST', body: { username: u, password: p } });
      if (r.mfa_required) { setMfa(true); setP(''); } else onLogin(r.user);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const contacto = cfg.contact?.whatsapp ? <a href={`https://wa.me/${cfg.contact.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">por WhatsApp</a> : cfg.contact?.email ? <a href={`mailto:${cfg.contact.email}`}>por correo</a> : null;
  return (
    <div className="login">
      <section className="login-art">
        <a href="https://www.talera.co/" target="_blank" rel="noreferrer" className="login-brand"><img src="/radar-solar-logo.png" alt="Radar Solar · Powered by Talera" /></a>
        <div className="login-art-inner" aria-hidden="true">
          <p className="eyebrow light">Inteligencia de mercado solar · Colombia</p>
          <p className="login-claim">Dónde vender energía solar, a quién y con qué argumentos.</p>
          <ul className="login-facts">
            <li><b>1.122</b><span>municipios con puntaje</span></li>
            <li><b>Tarifas</b><span>por operador y estrato</span></li>
            <li><b>Red</b><span>subestaciones y transformadores</span></li>
          </ul>
        </div>
      </section>
      <main id="main" className="login-panel">
        <form className="login-form stack" onSubmit={submit} aria-labelledby="login-t">
          <h1 id="login-t">{mfa ? 'Verificación en dos pasos' : 'Ingresar'}</h1>
          {!mfa ? (
            <>
              <label className="f" htmlFor="l-user">Usuario<input id="l-user" className="input lg" autoComplete="username" autoCapitalize="none" spellCheck="false" value={u} onChange={(e) => setU(e.target.value)} required /></label>
              <label className="f" htmlFor="l-pass">Contraseña<input id="l-pass" className="input lg" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required /></label>
            </>
          ) : (
            <>
              <p className="small">Escribe el código de 6 dígitos de tu aplicación de autenticación, o uno de tus códigos de recuperación.</p>
              <label className="f" htmlFor="l-code">Código de verificación<input id="l-code" ref={codeRef} className="input lg mono" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required /></label>
            </>
          )}
          {err && <div className="alert err" role="alert">{err}</div>}
          <button className="btn primary lg" disabled={busy}>{busy ? 'Verificando…' : mfa ? 'Verificar' : 'Ingresar'}</button>
          {mfa && <button type="button" className="btn ghost" onClick={() => { setMfa(false); setCode(''); setErr(''); }}>Volver</button>}
          <p className="small muted">Las cuentas las crea el administrador. {contacto ? <>Solicita la tuya {contacto}.</> : 'Pide la tuya al administrador.'}</p>
          <p className="small muted">Al ingresar por primera vez te pediremos aceptar los <a href="#/legal/terminos">términos de uso</a> y autorizar el tratamiento de los datos de tu cuenta según la <a href="#/legal/privacidad">política de privacidad</a>.</p>
        </form>
        <footer className="login-foot"><LegalLine titular={cfg.titular} /></footer>
      </main>
    </div>
  );
}
