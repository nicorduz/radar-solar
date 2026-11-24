import React, { useEffect, useState } from 'react';
import { openTour } from '../components/Tour.jsx';
import { api, announce } from '../api.js';
import { useApp } from '../App.jsx';
import { ProfileSwitch } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { PasswordFields } from '../components/Gates.jsx';
import { PrecioCorto, PoweredBy } from './Plan.jsx';
import { legacyLocal, importLegacy, deleteLegacy, wipeMyLocal } from '../local.js';

export default function Cuenta() {
  const { user, paid, logout, go, meta, isAdmin } = useApp();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [msg, setMsg] = useState(null);
  const [team, setTeam] = useState(null);
  useEffect(() => { api('/team').then(setTeam).catch(() => {}); }, []);
  const change = async (e) => {
    e.preventDefault();
    if (f.next !== f.confirm) { setMsg({ ok: false, t: 'Las dos contraseñas nuevas no coinciden.' }); return; }
    try { await api('/me/password', { method: 'POST', body: { current: f.current, next: f.next } }); setMsg({ ok: true, t: 'Contraseña actualizada. Cerramos tus otras sesiones.' }); setF({ current: '', next: '', confirm: '' }); }
    catch (e2) { setMsg({ ok: false, t: e2.message }); }
  };
  return (
    <div className="page narrow stack lg">
      <img className="mobile-only mobile-logo" src="/radar-solar-logo.png" alt="Radar Solar · Powered by Talera" />
      <header className="page-head"><h1>{user.name || user.username}</h1>
        <p className="lead small">{user.username}{user.company ? ` · ${user.company}` : ''} · <span className={`chip ${paid ? 'on' : ''}`}>{isAdmin ? 'Administrador' : paid ? `Plan completo${user.paid_until ? ' hasta ' + user.paid_until : ''}` : 'Prueba'}</span></p>
      </header>
      {user.plan?.activado && <dl className="kv card"><dt>Plan activado</dt><dd>{user.plan.activado}</dd>{user.plan.factura && <><dt>Factura</dt><dd className="mono">{user.plan.factura}</dd></>}<dt>Retracto y reversión</dt><dd><a href="#/legal/cancelaciones">Condiciones</a></dd></dl>}
      {Object.keys(meta.profiles).length > 1 && <div className="card mobile-only"><h2 className="h3">Ver la app como</h2><ProfileSwitch /></div>}
      <nav className="quick" aria-label="Accesos rápidos">
        <button className="btn" onClick={() => go('talera')}><Icon name="users" size={16} />Consultar a Talera</button>
        {!paid && <button className="btn primary" onClick={() => go('plan')}><Icon name="spark" size={16} />Plan completo</button>}
        <button className="btn" onClick={() => go('marca')}><Icon name="palette" size={16} />Mi marca</button>
        <button className="btn" onClick={() => go('prospectos')}><Icon name="star" size={16} />Mis prospectos</button>
        <button className="btn" onClick={() => go('industrias')}><Icon name="factory" size={16} />Empresas e industrias</button>
        <button className="btn" onClick={() => go('clientes')}><Icon name="hotel" size={16} />Hoteles y turismo</button>
        <button className="btn" onClick={() => go('instituciones')}><Icon name="school" size={16} />Colegios y salud</button>
        <button className="btn" onClick={() => go('calculadora')}><Icon name="calc" size={16} />Calculadora</button>
        <button className="btn" onClick={() => go('empresas')}><Icon name="building" size={16} />Instaladores y empresas</button>
        <button className="btn" onClick={() => go('mercado')}><Icon name="chart" size={16} />Mercado y red</button>
        <button className="btn" onClick={() => go('licitaciones')}><Icon name="doc" size={16} />Licitaciones</button>
        {isAdmin && <button className="btn" onClick={() => go('admin')}><Icon name="gear" size={16} />Administración</button>}
        <button className="btn ghost" onClick={openTour}><Icon name="spark" size={16} />Ver recorrido guiado</button>
      </nav>
      {team?.members?.length > 1 && (
        <div className="card stack">
          <h2 className="h3">Tu equipo · {team.company}</h2>
          <div className="row" style={{ gap: 6 }}>{team.members.map((u) => <span key={u.username} className={`chip ${u.username === user.username ? 'on' : ''}`}><Icon name="user" size={13} />{u.name || u.username}</span>)}</div>
          <span className="small muted">Cada persona entra con su propio usuario. Para agregar o quitar personas, escríbenos.</span>
        </div>
      )}
      {!paid && (
        <div className="card stack accent">
          <h2>Acceso completo con un solo pago</h2>
          <PrecioCorto />
          <p className="small muted">Mapa y ranking completos, tarifas y cortes de cada municipio, prestadores turísticos y empresas del sector con contacto empresarial, licitaciones, red eléctrica y asistente con IA.</p>
          <div className="row"><button className="btn primary" onClick={() => go('plan')}>Ver todo lo que incluye</button></div>
        </div>
      )}
      <h2 className="section-t">Seguridad</h2>
      <form className="card stack" onSubmit={change} aria-labelledby="pw-h">
        <h3 id="pw-h">Cambiar contraseña</h3>
        <PasswordFields f={f} setF={setF} username={user.username} />
        {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`} role={msg.ok ? 'status' : 'alert'}>{msg.t}</div>}
        <button className="btn start">Guardar</button>
      </form>
      <Sesiones />
      <h2 className="section-t">Privacidad</h2>
      <Autorizaciones />
      <Enlaces />
      <DatosNavegador logout={logout} />
      <div className="row between">
        <button className="btn danger" onClick={logout}>Cerrar sesión</button>
        <PoweredBy />
      </div>
      {meta.admin && <p className="small muted"><span className="tag">Solo admin</span> Datos: DANE (ELIC corte {meta.cortes.elic}, proyecciones de población), Superservicios SUI (tarifas {meta.cortes.sui}), XM (autogeneradores {meta.cortes.agpe_xm}, demanda no atendida {meta.cortes.dna}, mapa Paratec), IPSE, MinCIT (Registro Nacional de Turismo), SNR (licencias, corte {meta.cortes.snr}), SECOP II, Registro Mercantil, gridfinder, NASA POWER y Open-Meteo.</p>}
    </div>
  );
}

function Sesiones() {
  const [list, setList] = useState(null);
  const load = () => api('/me/sessions').then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  if (!list) return null;
  const otras = list.filter((s) => !s.actual).length;
  return (
    <section className="card stack" aria-labelledby="ses-h">
      <div className="row between"><h3 id="ses-h">Sesiones abiertas</h3>{otras > 0 && <button className="btn sm" onClick={async () => { await api('/me/sessions/cerrar-otras', { method: 'POST' }); announce('Se cerraron las otras sesiones'); load(); }}>Cerrar las demás ({otras})</button>}</div>
      <ul className="list">
        {list.map((s) => (
          <li key={s.id}>
            <span><b>{s.actual ? 'Este dispositivo' : (s.dispositivo || 'Dispositivo desconocido')}</b><span className="small muted">Desde {s.desde?.slice(0, 16).replace('T', ' ')} · último uso {s.uso?.slice(0, 16).replace('T', ' ')}</span></span>
            {!s.actual && <button className="btn sm ghost" onClick={async () => { await api(`/me/sessions/${s.id}`, { method: 'DELETE' }); announce('Sesión cerrada'); load(); }}>Cerrar<span className="sr-only"> la sesión de {s.dispositivo}</span></button>}
          </li>))}
      </ul>
    </section>
  );
}

function Autorizaciones() {
  const [st, setSt] = useState(null);
  const [hist, setHist] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => { api('/consents').then(setSt); api('/me/consents').then(setHist); };
  useEffect(() => { load(); }, []);
  if (!st) return null;
  const pub = !!st.publicidad.ultima?.granted;
  const toggle = async () => {
    try { await api('/consents', { method: 'POST', body: { publicidad: !pub, versions: { publicidad: st.publicidad.version } } }); setMsg(!pub ? 'Autorizaste recibir comunicaciones comerciales.' : 'Retiraste la autorización de comunicaciones comerciales.'); load(); }
    catch (e) { setMsg(e.message); }
  };
  const NOM = { terminos: 'Términos de uso', datos: 'Autorización de datos', publicidad: 'Comunicaciones comerciales' };
  return (
    <section className="card stack" aria-labelledby="aut-h">
      <h3 id="aut-h">Autorizaciones</h3>
      <div className="row between">
        <span><b>Novedades y ofertas por correo o WhatsApp</b><span className="small muted block">Opcional. Puedes cambiarlo cuando quieras.</span></span>
        <button className="switch" role="switch" aria-checked={pub} onClick={toggle}><span className="sr-only">Comunicaciones comerciales</span></button>
      </div>
      {msg && <p className="small" role="status">{msg}</p>}
      {hist?.length > 0 && (
        <details>
          <summary className="small">Ver el registro de mis aceptaciones ({hist.length})</summary>
          <div className="tbl-wrap"><table className="tbl compact"><caption className="sr-only">Historial de aceptaciones</caption><thead><tr><th>Fecha (UTC)</th><th>Documento</th><th>Versión</th><th>Respuesta</th></tr></thead><tbody>
            {hist.map((h, i) => <tr key={i}><td className="mono small">{h.created_at?.slice(0, 16)}</td><td className="small">{NOM[h.kind] || h.kind}</td><td className="mono small">{h.version}</td><td className="small">{h.granted ? 'Aceptó' : 'No aceptó / retiró'}</td></tr>)}
          </tbody></table></div>
        </details>
      )}
      <p className="small muted">Para conocer, corregir o suprimir tus datos, o cerrar tu cuenta, usa el <a href="#/derechos">formulario de derechos</a>. Lee la <a href="#/legal/privacidad">política de tratamiento</a>.</p>
    </section>
  );
}

function Enlaces() {
  const [list, setList] = useState(null);
  const load = () => api('/shares').then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  if (!list?.length) return null;
  const now = new Date().toISOString();
  return (
    <section className="card stack" aria-labelledby="enl-h">
      <h3 id="enl-h">Enlaces compartidos</h3>
      <p className="small muted">Fichas de solo lectura que enviaste. Vencen solas a los 30 días; revócalas si las enviaste a quien no debías.</p>
      <ul className="list">
        {list.map((s) => {
          const estado = s.revoked_at ? 'Revocado' : s.expires_at < now ? 'Vencido' : `Activo hasta ${s.expires_at.slice(0, 10)}`;
          return (
            <li key={s.id}>
              <span><b>Municipio {s.code}</b><span className="small muted">Creado {s.created_at.slice(0, 10)} · {estado}</span></span>
              {!s.revoked_at && s.expires_at >= now && <button className="btn sm ghost" onClick={async () => { await api(`/shares/${s.id}`, { method: 'DELETE' }); announce('Enlace revocado'); load(); }}>Revocar<span className="sr-only"> enlace del municipio {s.code}</span></button>}
            </li>);
        })}
      </ul>
    </section>
  );
}

function DatosNavegador({ logout }) {
  const [legacy, setLegacy] = useState(() => legacyLocal());
  const n = Object.keys(legacy).length;
  return (
    <section className="card stack" aria-labelledby="loc-h">
      <h3 id="loc-h">Datos guardados en este navegador</h3>
      <p className="small muted">Tus prospectos, zonas que sigues, tableros y diseños se guardan solo en este navegador, separados por usuario. No se envían al servidor salvo cuando generas una propuesta o un enlace. <a href="#/legal/cookies">Detalle</a>.</p>
      {n > 0 && (
        <div className="alert warn stack">
          <span>Encontramos datos guardados antes de separar las cuentas ({n} {n === 1 ? 'grupo' : 'grupos'}). Si son tuyos, pásalos a tu cuenta; si no, bórralos.</span>
          <div className="row"><button className="btn sm" onClick={() => { importLegacy(); setLegacy({}); announce('Datos pasados a tu cuenta'); }}>Son míos</button><button className="btn sm ghost" onClick={() => { deleteLegacy(); setLegacy({}); announce('Datos anteriores borrados'); }}>Borrarlos</button></div>
        </div>
      )}
      <button className="btn ghost start" onClick={() => { if (confirm('Se borrarán tus prospectos, zonas seguidas, tableros y diseños de este navegador. No se puede deshacer. ¿Continuar?')) { wipeMyLocal(); announce('Datos de este navegador borrados'); } }}>Borrar mis datos de este navegador</button>
      <p className="small muted">En un computador compartido, borra tus datos y <button type="button" className="link" onClick={logout}>cierra la sesión</button> al terminar.</p>
    </section>
  );
}
