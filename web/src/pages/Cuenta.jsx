import React, { useEffect, useState } from 'react';
import { openTour } from '../components/Tour.jsx';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { ContactCTA, ProfileSwitch } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { LegalLine } from './Terminos.jsx';
import { PrecioCorto, PoweredBy } from './Plan.jsx';

export default function Cuenta() {
  const { user, paid, logout, go, meta } = useApp();
  const [f, setF] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState(null);
  const [team, setTeam] = useState(null);
  useEffect(() => { api('/team').then(setTeam).catch(() => {}); }, []);
  const change = async (e) => {
    e.preventDefault();
    try { await api('/me/password', { method: 'POST', body: f }); setMsg({ ok: true, t: 'Contraseña actualizada' }); setF({ current: '', next: '' }); }
    catch (e2) { setMsg({ ok: false, t: e2.message }); }
  };
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <img className="mobile-only" src="/radar-solar-logo.png" alt="Radar Solar · Powered by Talera" style={{ width: '78%', maxWidth: 320, height: 'auto', margin: '4px 0 2px' }} />
      <h1>Cuenta</h1>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span><b>{user.name || user.username}</b><br /><span className="small muted">{user.username}{user.company ? ` · ${user.company}` : ''}</span></span>
          <span className={`chip ${paid ? 'on' : ''}`}>{user.role === 'admin' ? 'Administrador' : paid ? `Plan completo${user.paid_until ? ' hasta ' + user.paid_until : ''}` : 'Prueba'}</span>
        </div>
      </div>
      {Object.keys(meta.profiles).length > 1 && <div className="card mobile-only"><h3 style={{ marginBottom: 8 }}>Ver la app como</h3><ProfileSwitch /></div>}
      <div className="row" style={{ gap: 8 }}>
        {!paid && <button className="btn primary" onClick={() => go('plan')}><Icon name="spark" size={16} />Plan completo</button>}
        <button className="btn" onClick={() => go('marca')}><Icon name="palette" size={16} />Mi marca</button>
        <button className="btn" onClick={() => go('prospectos')}><Icon name="star" size={16} />Mis prospectos</button>
        <button className="btn" onClick={() => go('industrias')}><Icon name="factory" size={16} />Empresas e industrias</button>
        <button className="btn" onClick={() => go('clientes')}><Icon name="hotel" size={16} />Hoteles y turismo</button>
        <button className="btn" onClick={() => go('calculadora')}><Icon name="calc" size={16} />Calculadora</button>
        <button className="btn" onClick={() => go('empresas')}><Icon name="building" size={16} />Instaladores y empresas</button>
        <button className="btn" onClick={() => go('mercado')}><Icon name="chart" size={16} />Mercado y red</button>
        <button className="btn" onClick={() => go('licitaciones')}><Icon name="doc" size={16} />Licitaciones</button>
        {user.role === 'admin' && <button className="btn" onClick={() => go('admin')}><Icon name="gear" size={16} />Administración</button>}
        <button className="btn ghost" onClick={openTour}><Icon name="spark" size={16} />Ver recorrido guiado</button>
      </div>
      {team?.members?.length > 1 && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h3>Tu equipo · {team.company}</h3>
          <div className="row" style={{ gap: 6 }}>{team.members.map((u) => <span key={u.username} className={`chip ${u.username === user.username ? 'on' : ''}`}><Icon name="user" size={13} />{u.name || u.username}</span>)}</div>
          <span className="small muted">Cada persona entra con su propio usuario. Para agregar o quitar personas, escríbenos.</span>
        </div>
      )}
      {!paid && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start', borderColor: 'var(--blue)' }}>
          <span className="tag hot">Plan completo</span>
          <h2>Paga una vez. Úsala siempre.</h2>
          <PrecioCorto />
          <p className="small muted" style={{ margin: 0 }}>Mapa y ranking completos, tarifas y cortes de cada municipio, {meta.totals.clientes?.toLocaleString('es-CO')} hoteles y {meta.totals.empresas.toLocaleString('es-CO')} empresas con contacto, licitaciones, red eléctrica y asistente con IA.</p>
          <div className="row"><button className="btn primary" onClick={() => go('plan')}>Ver todo lo que incluye</button></div>
        </div>
      )}
      <form className="card" onSubmit={change} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2>Cambiar contraseña</h2>
        <label className="f">Contraseña actual<input className="input" type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required /></label>
        <label className="f">Nueva contraseña (mínimo 8 caracteres)<input className="input" type="password" autoComplete="new-password" minLength={8} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required /></label>
        {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.t}</div>}
        <button className="btn" style={{ alignSelf: 'flex-start' }}>Guardar</button>
      </form>
      <button className="btn danger" style={{ alignSelf: 'flex-start' }} onClick={logout}>Cerrar sesión</button>
      <PoweredBy />
      <p className="small muted"><LegalLine go={go} /></p>
      {meta.admin && <p className="small muted"><span className="tag">Solo admin</span> Datos: DANE (ELIC corte {meta.cortes.elic}, proyecciones de población), Superservicios SUI (tarifas {meta.cortes.sui}), XM (autogeneradores {meta.cortes.agpe_xm}, demanda no atendida {meta.cortes.dna}, mapa Paratec), IPSE, MinCIT (Registro Nacional de Turismo), SNR (licencias, corte {meta.cortes.snr}), SECOP II, Registro Mercantil, gridfinder, NASA POWER y Open-Meteo.</p>}
    </div>
  );
}
