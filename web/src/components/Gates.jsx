import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { LegalDoc } from '../pages/Legal.jsx';
import { Spinner } from './ui.jsx';

// Pantalla de aceptación: cada autorización es una casilla separada, ninguna viene marcada,
// y las comunicaciones comerciales son opcionales y no condicionan el acceso.
export function ConsentScreen({ onDone, onLogout }) {
  const [st, setSt] = useState(null);
  const [f, setF] = useState({ terminos: false, autorizacion: false, publicidad: false });
  const [ver, setVer] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api('/consents').then((s) => { setSt(s); setF({ terminos: s.terminos.aceptada, autorizacion: s.autorizacion.aceptada, publicidad: !!s.publicidad.ultima?.granted }); }).catch((e) => setErr(e.message)); }, []);
  if (!st) return <div className="gate"><Spinner /></div>;
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!f.terminos || !f.autorizacion) { setErr('Para continuar marca las dos primeras casillas. La tercera es opcional.'); return; }
    setBusy(true);
    try {
      await api('/consents', { method: 'POST', body: { ...f, versions: { terminos: st.terminos.version, autorizacion: st.autorizacion.version, publicidad: st.publicidad.version } } });
      onDone();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const nuevo = st.terminos.ultima || st.autorizacion.ultima;
  return (
    <div className="gate">
      <form className="gate-card stack" onSubmit={submit} aria-labelledby="gate-t">
        <img src="/icon.svg" alt="" width="40" height="40" />
        <h1 id="gate-t">{nuevo ? 'Actualizamos nuestros documentos' : 'Antes de empezar'}</h1>
        <p className="lead">{nuevo ? 'Cambió la versión de un documento que aceptaste. Revísalo y confirma para seguir usando la plataforma.' : 'Lee y confirma estos documentos. Tus respuestas quedan registradas con fecha y versión, y puedes consultarlas en tu cuenta.'}</p>
        <fieldset className="consents">
          <legend className="sr-only">Autorizaciones</legend>
          <label className="consent">
            <input type="checkbox" checked={f.terminos} onChange={(e) => setF({ ...f, terminos: e.target.checked })} aria-describedby="c1" />
            <span><b>Acepto los términos de uso</b> (versión {st.terminos.version}). <span id="c1" className="muted">Obligatorio. <button type="button" className="link" onClick={() => setVer(ver === 'terminos' ? null : 'terminos')} aria-expanded={ver === 'terminos'}>{ver === 'terminos' ? 'Ocultar' : 'Leer aquí'}</button> · <a href="#/legal/terminos" target="_blank" rel="noreferrer">Abrir en otra pestaña</a></span></span>
          </label>
          {ver === 'terminos' && <div className="doc-scroll" tabIndex={0} aria-label="Términos de uso"><LegalDoc doc="terminos" compact /></div>}
          <label className="consent">
            <input type="checkbox" checked={f.autorizacion} onChange={(e) => setF({ ...f, autorizacion: e.target.checked })} aria-describedby="c2" />
            <span><b>Autorizo el tratamiento de los datos de mi cuenta</b> para prestar el servicio, según la política de tratamiento (versión {st.autorizacion.version}). <span id="c2" className="muted">Obligatorio para crear y mantener tu cuenta. <button type="button" className="link" onClick={() => setVer(ver === 'autorizacion' ? null : 'autorizacion')} aria-expanded={ver === 'autorizacion'}>{ver === 'autorizacion' ? 'Ocultar' : 'Leer aquí'}</button> · <a href="#/legal/privacidad" target="_blank" rel="noreferrer">Política completa</a></span></span>
          </label>
          {ver === 'autorizacion' && <div className="doc-scroll" tabIndex={0} aria-label="Autorización de tratamiento de datos"><LegalDoc doc="autorizacion" compact /></div>}
          <label className="consent optional">
            <input type="checkbox" checked={f.publicidad} onChange={(e) => setF({ ...f, publicidad: e.target.checked })} aria-describedby="c3" />
            <span><b>Quiero recibir novedades y ofertas</b> por correo o WhatsApp. <span id="c3" className="muted">Opcional. No cambia lo que puedes usar y lo puedes retirar cuando quieras desde tu cuenta. <a href="#/legal/publicidad" target="_blank" rel="noreferrer">Detalle</a></span></span>
          </label>
        </fieldset>
        {err && <div className="alert err" role="alert">{err}</div>}
        <div className="row between">
          <button type="button" className="btn ghost" onClick={onLogout}>Salir sin aceptar</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Confirmar y continuar'}</button>
        </div>
        <p className="small muted">Si no aceptas, no podremos darte acceso. Para cerrar tu cuenta o pedir la supresión de tus datos usa <a href="#/derechos">este formulario</a>.</p>
      </form>
    </div>
  );
}

// Cambio obligatorio de una contraseña temporal o que no cumple la política vigente
export function ForcePassword({ user, onDone, onLogout }) {
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (f.next !== f.confirm) { setErr('Las dos contraseñas nuevas no coinciden.'); return; }
    setBusy(true);
    try { await api('/me/password', { method: 'POST', body: { current: f.current, next: f.next } }); onDone(); }
    catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="gate">
      <form className="gate-card stack" onSubmit={submit} aria-labelledby="pw-t">
        <img src="/icon.svg" alt="" width="40" height="40" />
        <h1 id="pw-t">Crea tu contraseña</h1>
        <p className="lead">Hola {user.name || user.username}. Tu contraseña actual es temporal o no cumple la política de seguridad. Elige una nueva para continuar.</p>
        <PasswordFields f={f} setF={setF} username={user.username} />
        {err && <div className="alert err" role="alert">{err}</div>}
        <div className="row between"><button type="button" className="btn ghost" onClick={onLogout}>Salir</button><button className="btn primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar y continuar'}</button></div>
      </form>
    </div>
  );
}

// Campos de contraseña con la política explicada (mínimo 15, sin reglas de composición: se recomiendan frases)
export function PasswordFields({ f, setF, username }) {
  const n = f.next.length;
  const same = username && f.next.toLowerCase().includes(String(username).toLowerCase());
  return (
    <>
      <label className="f" htmlFor="pw-cur">Contraseña actual<input id="pw-cur" className="input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></label>
      <label className="f" htmlFor="pw-new">Nueva contraseña
        <input id="pw-new" className="input" type="password" autoComplete="new-password" minLength={15} maxLength={128} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required aria-describedby="pw-rule" />
        <span id="pw-rule" className={`hint ${n && n < 15 ? 'warn' : ''}`} aria-live="polite">{n < 15 ? `Mínimo 15 caracteres (llevas ${n}). Una frase de varias palabras es fácil de recordar y difícil de adivinar.` : same ? 'No incluyas tu usuario en la contraseña.' : 'Longitud adecuada.'}</span>
      </label>
      {'confirm' in f && <label className="f" htmlFor="pw-conf">Repite la nueva contraseña<input id="pw-conf" className="input" type="password" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required /></label>}
    </>
  );
}
