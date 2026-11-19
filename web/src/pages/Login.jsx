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
  const [rec, setRec] = useState(null); // recuperación: null | { nombre, usuario, contacto } | 'enviada'
  const [recErr, setRecErr] = useState({});
  const codeRef = useRef(null);
  const recRef = useRef(null);
  useEffect(() => { if (mfa) codeRef.current?.focus(); }, [mfa]);
  useEffect(() => { if (rec) recRef.current?.focus(); }, [rec === null, rec === 'enviada']);
  const pedir = async (e) => {
    e.preventDefault(); setErr(''); setRecErr({}); setBusy(true);
    try { await api('/recuperar-acceso', { method: 'POST', body: rec }); setRec('enviada'); }
    catch (e2) { setErr(e2.message); setRecErr(e2.data?.errores || {}); } finally { setBusy(false); }
  };
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
        {rec === 'enviada' ? (
          <section className="login-form stack" aria-labelledby="rec-t">
            <h1 id="rec-t" tabIndex={-1} ref={recRef}>Solicitud recibida</h1>
            <p>El administrador revisará que la cuenta sea tuya y te enviará una contraseña temporal al correo o WhatsApp que dejaste. Al ingresar con ella, la plataforma te pedirá crear una nueva.</p>
            {contacto && <p className="small muted">Si es urgente, escríbenos {contacto}.</p>}
            <button type="button" className="btn primary lg" onClick={() => { setRec(null); setErr(''); }}>Volver a ingresar</button>
          </section>
        ) : rec ? (
          <form className="login-form stack" onSubmit={pedir} noValidate aria-labelledby="rec-t">
            <h1 id="rec-t" tabIndex={-1} ref={recRef}>Recuperar el acceso</h1>
            <p className="small muted">Por seguridad, las contraseñas no se envían de forma automática. El administrador verifica que la cuenta sea tuya y te entrega una contraseña temporal.</p>
            <label className="f" htmlFor="r-nombre">Tu nombre<input id="r-nombre" className="input lg" autoComplete="name" maxLength={120} value={rec.nombre} onChange={(e) => setRec({ ...rec, nombre: e.target.value })} required aria-invalid={!!recErr.nombre} aria-describedby={recErr.nombre ? 'r-nombre-e' : undefined} />{recErr.nombre && <span id="r-nombre-e" className="field-err">{recErr.nombre}</span>}</label>
            <label className="f" htmlFor="r-usuario">Usuario, si lo recuerdas<input id="r-usuario" className="input lg" autoComplete="username" autoCapitalize="none" spellCheck="false" maxLength={60} value={rec.usuario} onChange={(e) => setRec({ ...rec, usuario: e.target.value })} /></label>
            <label className="f" htmlFor="r-contacto">Correo o WhatsApp para responderte<input id="r-contacto" className="input lg" autoComplete="email" maxLength={190} value={rec.contacto} onChange={(e) => setRec({ ...rec, contacto: e.target.value })} required aria-invalid={!!recErr.contacto} aria-describedby={recErr.contacto ? 'r-contacto-e' : 'r-contacto-h'} /><span id="r-contacto-h" className="hint">Usa el mismo que registraste con nosotros, así es más fácil verificarte.</span>{recErr.contacto && <span id="r-contacto-e" className="field-err">{recErr.contacto}</span>}</label>
            {err && <div className="alert err" role="alert">{err}</div>}
            <button className="btn primary lg" disabled={busy}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
            <button type="button" className="btn ghost" onClick={() => { setRec(null); setErr(''); setRecErr({}); }}>Volver</button>
            <p className="small muted">Usaremos estos datos solo para devolverte el acceso y los borraremos 180 días después. <a href="#/legal/privacidad">Política de privacidad</a>.</p>
          </form>
        ) : (
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
          {mfa && <p className="small muted">¿Perdiste el teléfono y los códigos de recuperación? Quien administra el servidor puede reiniciar la verificación en dos pasos.</p>}
          {!mfa && <button type="button" className="link start small" onClick={() => { setErr(''); setRec({ nombre: '', usuario: u, contacto: '' }); }}>¿Olvidaste tu usuario o contraseña?</button>}
          <p className="small muted">Las cuentas las crea el administrador. {contacto ? <>Solicita la tuya {contacto}.</> : 'Pide la tuya al administrador.'}</p>
          <p className="small muted">Al ingresar por primera vez te pediremos aceptar los <a href="#/legal/terminos">términos de uso</a> y autorizar el tratamiento de los datos de tu cuenta según la <a href="#/legal/privacidad">política de privacidad</a>.</p>
        </form>
        )}
        <footer className="login-foot"><LegalLine titular={cfg.titular} /></footer>
      </main>
    </div>
  );
}
