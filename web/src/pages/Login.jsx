import React, { useState } from 'react';
import { api } from '../api.js';

export default function Login({ cfg, onLogin }) {
  const [u, setU] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api('/login', { method: 'POST', body: { username: u, password: p } }); onLogin(r.user); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <form className="card" onSubmit={submit} style={{ position: 'relative', overflow: 'hidden' }}>
        <div className="diag" aria-hidden="true" />
        <img src="/talera-logo.png" alt="Talera" style={{ height: 30, width: 'auto', alignSelf: 'flex-start' }} />
        <div className="brand" style={{ padding: 0 }}><img src="/icon.svg" alt="" width="34" height="34" />{cfg.appName}</div>
        <p className="muted" style={{ margin: 0 }}>Inteligencia de mercado solar en Colombia para instaladores, proveedores de equipos y desarrolladores: tarifas, obra nueva, red eléctrica, proyectos y clientes en un solo mapa.</p>
        <label className="f">Usuario<input className="input" autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} required /></label>
        <label className="f">Contraseña<input className="input" type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required /></label>
        {err && <div className="alert err">{err}</div>}
        <button className="btn primary" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
        <span className="small muted">Al ingresar aceptas los <a href="#/terminos">términos de la licencia de uso</a>. La plataforma es propiedad de Talera Colombia Consulting S.A.S.; la licencia permite solo el acceso, no su copia ni reproducción.</span>
        <span className="small muted">¿No tienes cuenta? {cfg.contact?.whatsapp ? <a href={`https://wa.me/${cfg.contact.whatsapp.replace(/\D/g, '')}`}>Solicítala por WhatsApp</a> : cfg.contact?.email ? <a href={`mailto:${cfg.contact.email}`}>Solicítala por correo</a> : 'Pídela al administrador.'}</span>
      </form>
    </div>
  );
}
