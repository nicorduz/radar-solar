import React, { useState } from 'react';
import { api } from '../api.js';

// Verificación en dos pasos de administradores: activación (QR + códigos de recuperación) o verificación de la sesión
export default function MfaPanel({ user, onDone }) {
  const [step, setStep] = useState(user.mfa_enabled ? 'verificar' : 'inicio');
  const [pw, setPw] = useState('');
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setErr(''); setBusy(true); try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };

  if (codes) return (
    <section className="card stack mfa" aria-labelledby="mfa-t">
      <h2 id="mfa-t">Guarda tus códigos de recuperación</h2>
      <p className="small">Cada código sirve una sola vez si pierdes el teléfono. Guárdalos en tu gestor de contraseñas. No los volverás a ver.</p>
      <ol className="codes mono">{codes.map((c) => <li key={c}>{c}</li>)}</ol>
      <div className="row"><button className="btn" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>Copiar códigos</button><button className="btn primary" onClick={onDone}>Ya los guardé</button></div>
    </section>
  );
  return (
    <section className="card stack mfa" aria-labelledby="mfa-t">
      <h2 id="mfa-t">{step === 'verificar' ? 'Verifica que eres tú' : 'Activa la verificación en dos pasos'}</h2>
      {step === 'verificar' && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { await api('/mfa/verify', { method: 'POST', body: { code } }); onDone(); }); }}>
          <p className="small muted">Para entrar a la administración escribe el código de 6 dígitos de tu aplicación de autenticación, o uno de tus códigos de recuperación.</p>
          <label className="f" htmlFor="mfa-code">Código<input id="mfa-code" className="input mono" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required aria-describedby={err ? 'mfa-err' : undefined} aria-invalid={!!err} /></label>
          {err && <p id="mfa-err" className="field-err" role="alert">{err}</p>}
          <button className="btn primary" disabled={busy}>{busy ? 'Verificando…' : 'Verificar'}</button>
        </form>
      )}
      {step === 'inicio' && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { setSetup(await api('/mfa/setup', { method: 'POST', body: { password: pw } })); setStep('qr'); }); }}>
          <p className="small muted">La administración da acceso a todos los usuarios y datos, por eso exige un segundo factor. Necesitas una aplicación de autenticación (Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden u otra compatible con TOTP).</p>
          <label className="f" htmlFor="mfa-pw">Confirma tu contraseña<input id="mfa-pw" className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required aria-invalid={!!err} aria-describedby={err ? 'mfa-err' : undefined} /></label>
          {err && <p id="mfa-err" className="field-err" role="alert">{err}</p>}
          <button className="btn primary" disabled={busy}>{busy ? 'Generando…' : 'Continuar'}</button>
        </form>
      )}
      {step === 'qr' && setup && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); run(async () => { const r = await api('/mfa/enable', { method: 'POST', body: { code } }); setCodes(r.recovery); }); }}>
          <p className="small">1. Escanea este código con tu aplicación de autenticación.</p>
          {/* El SVG lo genera el servidor con la librería qrcode a partir de la URI otpauth */}
          <div className="qr" role="img" aria-label="Código QR para la aplicación de autenticación" dangerouslySetInnerHTML={{ __html: setup.qr }} />
          <details><summary className="small">¿No puedes escanear? Escribe la clave a mano</summary><p className="mono small break">{setup.secret}</p></details>
          <label className="f" htmlFor="mfa-code2">2. Escribe el código de 6 dígitos que muestra la aplicación<input id="mfa-code2" className="input mono" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} required aria-invalid={!!err} aria-describedby={err ? 'mfa-err' : undefined} /></label>
          {err && <p id="mfa-err" className="field-err" role="alert">{err}</p>}
          <button className="btn primary" disabled={busy}>{busy ? 'Activando…' : 'Activar'}</button>
        </form>
      )}
    </section>
  );
}
