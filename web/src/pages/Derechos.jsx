import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// Canal de atención de titulares (Ley 1581 de 2012): consultas y reclamos con radicado y plazo
export default function Derechos({ user }) {
  const [tipos, setTipos] = useState(null);
  const [f, setF] = useState({ tipo: '', nombre: user?.name || '', correo: '', relacion: user ? 'usuario' : '', referencia: '', detalle: '' });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState({ radicado: '', correo: '' });
  const [estado, setEstado] = useState(null);
  const [qErr, setQErr] = useState('');
  const okRef = useRef(null);
  useEffect(() => { api('/derechos/tipos').then(setTipos).catch(() => setTipos({})); }, []);
  useEffect(() => { if (ok) okRef.current?.focus(); }, [ok]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const send = async (e) => {
    e.preventDefault(); setErr(''); setErrs({}); setBusy(true);
    try { setOk(await api('/derechos', { method: 'POST', body: f })); }
    catch (e2) {
      setErr(e2.message); setErrs(e2.data?.errores || {});
      const first = Object.keys(e2.data?.errores || {})[0];
      if (first) document.getElementById(`d-${first}`)?.focus();
    } finally { setBusy(false); }
  };
  const check = async (e) => { e.preventDefault(); setQErr(''); setEstado(null); try { setEstado(await api('/derechos/estado', { method: 'POST', body: q })); } catch (e2) { setQErr(e2.message); } };
  const field = (k, label, input, hint) => (
    <div className="f">
      <label htmlFor={`d-${k}`}>{label}</label>
      {React.cloneElement(input, { id: `d-${k}`, 'aria-invalid': !!errs[k], 'aria-describedby': [hint && `d-${k}-h`, errs[k] && `d-${k}-e`].filter(Boolean).join(' ') || undefined })}
      {hint && <span id={`d-${k}-h`} className="hint">{hint}</span>}
      {errs[k] && <span id={`d-${k}-e`} className="field-err">{errs[k]}</span>}
    </div>
  );
  const clase = tipos?.[f.tipo]?.clase;

  return (
    <div className="page narrow stack lg">
      <header className="page-head">
        <p className="eyebrow">Protección de datos personales</p>
        <h1>Ejercer tus derechos</h1>
        <p className="lead">Puedes conocer, actualizar, rectificar o suprimir tus datos, revocar la autorización, pedir prueba de ella o pedir que retiremos los datos de contacto de una empresa o persona que aparezcan en la plataforma. No tiene costo.</p>
      </header>

      {ok ? (
        <section className="card stack" role="status" tabIndex={-1} ref={okRef} aria-labelledby="ok-t">
          <h2 id="ok-t">Solicitud recibida</h2>
          <p>Tu número de radicado es <b className="mono">{ok.radicado}</b>. Guárdalo para consultar el estado.</p>
          <p className="small muted">Es una {ok.clase}. Responderemos a más tardar el <b>{ok.vence}</b>. Si necesitamos más tiempo te lo diremos antes de esa fecha, con el motivo.</p>
          <button className="btn start" onClick={() => { setOk(null); setF({ ...f, tipo: '', referencia: '', detalle: '' }); }}>Enviar otra solicitud</button>
        </section>
      ) : (
        <form className="card stack" onSubmit={send} noValidate aria-labelledby="form-t">
          <h2 id="form-t">Nueva solicitud</h2>
          {field('tipo', 'Qué necesitas', (
            <select className="select" value={f.tipo} onChange={set('tipo')} required>
              <option value="">Elige una opción</option>
              {tipos && Object.entries(tipos).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
            </select>
          ), clase ? `Es una ${clase}: plazo de ${clase === 'consulta' ? '10' : '15'} días hábiles, prorrogable una vez por ${clase === 'consulta' ? '5' : '8'} días hábiles con aviso.` : null)}
          <div className="grid g2">
            {field('nombre', 'Nombre o razón social', <input className="input" autoComplete="name" maxLength={120} value={f.nombre} onChange={set('nombre')} required />)}
            {field('correo', 'Correo para la respuesta', <input className="input" type="email" autoComplete="email" maxLength={190} value={f.correo} onChange={set('correo')} required />)}
          </div>
          {field('relacion', 'Tu relación con los datos', (
            <select className="select" value={f.relacion} onChange={set('relacion')}>
              <option value="">Prefiero no decirlo</option>
              <option value="usuario">Soy usuario de la plataforma</option>
              <option value="empresa">Represento a una empresa que aparece en la plataforma</option>
              <option value="persona">Soy una persona cuyos datos aparecen en la plataforma</option>
              <option value="apoderado">Actúo en nombre de otra persona</option>
            </select>
          ))}
          {(f.tipo === 'retirar_contacto' || f.relacion === 'empresa' || f.relacion === 'persona') && field('referencia', 'NIT, nombre de la empresa o del registro', <input className="input" maxLength={200} value={f.referencia} onChange={set('referencia')} />, 'Nos ayuda a encontrar el registro exacto.')}
          {field('detalle', 'Describe tu solicitud', <textarea className="input" rows={5} maxLength={4000} value={f.detalle} onChange={set('detalle')} required />, 'No incluyas números de documento, datos de salud ni información financiera. Si necesitamos verificar tu identidad, te escribiremos.')}
          {err && <div className="alert err" role="alert">{err}</div>}
          <p className="small muted">Usaremos estos datos solo para tramitar y responder tu solicitud, y conservaremos el registro como evidencia del trámite. Lee la <a href="#/legal/privacidad">política de tratamiento</a>.</p>
          <button className="btn primary start" disabled={busy}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
        </form>
      )}

      <form className="card stack" onSubmit={check} aria-labelledby="estado-t">
        <h2 id="estado-t">Consultar el estado</h2>
        <div className="grid g2">
          <label className="f" htmlFor="q-rad">Radicado<input id="q-rad" className="input mono" placeholder="RS-AAAAMMDD-XXXXXX" value={q.radicado} onChange={(e) => setQ({ ...q, radicado: e.target.value })} required /></label>
          <label className="f" htmlFor="q-mail">Correo de la solicitud<input id="q-mail" className="input" type="email" autoComplete="email" value={q.correo} onChange={(e) => setQ({ ...q, correo: e.target.value })} required /></label>
        </div>
        {qErr && <div className="alert err" role="alert">{qErr}</div>}
        {estado && (
          <dl className="kv" role="status">
            <dt>Estado</dt><dd>{estado.status.replace('_', ' ')}</dd>
            <dt>Fecha límite</dt><dd>{estado.due_at}{estado.extended ? ' (con prórroga)' : ''}</dd>
            {estado.response && <><dt>Respuesta</dt><dd className="pre">{estado.response}</dd></>}
          </dl>
        )}
        <button className="btn start">Consultar</button>
      </form>

      <p className="small muted">Si no quedas conforme con la respuesta, puedes acudir a la Superintendencia de Industria y Comercio después de agotar este trámite (artículo 16 de la Ley 1581 de 2012).</p>
    </div>
  );
}
