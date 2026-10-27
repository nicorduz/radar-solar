import React, { useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { ContactCTA, ProfileSwitch } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { LegalLine } from './Terminos.jsx';

export default function Cuenta() {
  const { user, paid, logout, go, meta } = useApp();
  const [f, setF] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState(null);
  const change = async (e) => {
    e.preventDefault();
    try { await api('/me/password', { method: 'POST', body: f }); setMsg({ ok: true, t: 'Contraseña actualizada' }); setF({ current: '', next: '' }); }
    catch (e2) { setMsg({ ok: false, t: e2.message }); }
  };
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <h1>Cuenta</h1>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span><b>{user.name || user.username}</b><br /><span className="small muted">{user.username}{user.company ? ` · ${user.company}` : ''}</span></span>
          <span className={`chip ${paid ? 'on' : ''}`}>{user.role === 'admin' ? 'Administrador' : paid ? `Plan completo${user.paid_until ? ' hasta ' + user.paid_until : ''}` : 'Prueba'}</span>
        </div>
      </div>
      {Object.keys(meta.profiles).length > 1 && <div className="card mobile-only"><h3 style={{ marginBottom: 8 }}>Ver la app como</h3><ProfileSwitch /></div>}
      <div className="row" style={{ gap: 8 }}>
        <button className="btn" onClick={() => go('clientes')}><Icon name="hotel" size={16} />Hoteles y turismo</button>
        <button className="btn" onClick={() => go('empresas')}><Icon name="building" size={16} />Instaladores y empresas</button>
        <button className="btn" onClick={() => go('mercado')}><Icon name="chart" size={16} />Mercado y red</button>
        <button className="btn" onClick={() => go('licitaciones')}><Icon name="doc" size={16} />Licitaciones</button>
        {user.role === 'admin' && <button className="btn" onClick={() => go('admin')}><Icon name="gear" size={16} />Administración</button>}
      </div>
      {!paid && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <h2>Qué incluye el plan completo</h2>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, color: 'var(--ink-2)', alignSelf: 'stretch' }}>
            <li>Mapa 3D por municipio y ranking completo de {meta.totals.municipios.toLocaleString('es-CO')} municipios para instaladores, proveedores y desarrolladores, con filtros y descarga.</li>
            <li>Ficha por municipio: tarifa 2026, obra nueva por estrato, cortes de energía, turismo, subestaciones cercanas, instaladores de la zona y retorno de la inversión.</li>
            <li>{meta.totals.clientes?.toLocaleString('es-CO')} hoteles, viviendas turísticas y parques como clientes potenciales.</li>
            <li>Mapa de la red de transmisión, plantas solares, red de media tensión estimada y zonas no interconectadas.</li>
            <li>{meta.totals.secop.toLocaleString('es-CO')} licitaciones públicas solares y directorio de {meta.totals.empresas.toLocaleString('es-CO')} empresas con contacto y contratos solares.</li>
            <li>Asistente con IA y argumentos de venta listos para WhatsApp.</li>
          </ul>
          <ContactCTA text="Escríbenos para activar tu plan." />
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
      <p className="small muted"><LegalLine go={go} /></p>
      <p className="small muted">Datos: DANE (ELIC corte {meta.cortes.elic}, proyecciones de población), Superservicios SUI (tarifas {meta.cortes.sui}), XM (autogeneradores {meta.cortes.agpe_xm}, demanda no atendida {meta.cortes.dna}, mapa Paratec), IPSE, MinCIT (Registro Nacional de Turismo), SNR (licencias, corte {meta.cortes.snr}), SECOP II, Registro Mercantil, gridfinder, NASA POWER y Open-Meteo.</p>
    </div>
  );
}
