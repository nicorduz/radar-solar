import React, { useEffect, useRef, useState } from 'react';
import { api, fmt } from '../api.js';
import { useApp } from '../App.jsx';
import { Spinner, Modal } from '../components/ui.jsx';
import MfaPanel from '../components/Mfa.jsx';

const ROLES = { trial: 'Prueba', paid: 'Pago', admin: 'Administrador' };
const PERFILES = { todos: 'Todos los perfiles', instalador: 'Instalador solar', proveedor: 'Proveedor de equipos', desarrollador: 'Desarrollador o inversionista', servicios: 'Mantenimiento y servicios (O&M)', respaldo: 'Baterías y respaldo' };

export default function Admin() {
  const { user, refreshUser } = useApp();
  const [tab, setTab] = useState('usuarios');
  const tabs = { usuarios: 'Usuarios', privacidad: 'Privacidad y seguridad', datos: 'Datos y fuentes', documentos: 'Documentos e IA', proyectos: 'Proyectos', ajustes: 'Ajustes' };
  // La administración exige verificación en dos pasos en esta sesión
  if (user.mfa_needed) return <div className="page narrow"><header className="page-head"><h1>Verifica que eres tú</h1></header><MfaPanel user={user} onDone={refreshUser} /></div>;
  return (
    <div className="page">
      <header className="page-head"><h1>Administración</h1></header>
      <div className="tabs" role="tablist" aria-label="Secciones de administración">{Object.entries(tabs).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab ${tab === k ? 'on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'usuarios' && <Usuarios />}
      {tab === 'privacidad' && <Privacidad />}
      {tab === 'datos' && <Datos />}
      {tab === 'documentos' && <Documentos />}
      {tab === 'proyectos' && <Proyectos />}
      {tab === 'ajustes' && <Ajustes />}
    </div>
  );
}

function Usuarios() {
  const { user } = useApp();
  const [list, setList] = useState(null);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState(null);
  const [team, setTeam] = useState(null);
  const [teamOut, setTeamOut] = useState(null);
  const [temporal, setTemporal] = useState(null); // { username, clave }
  const load = () => api('/admin/users').then(setList);
  const darTemporal = async (u) => {
    if (!confirm(`¿Generar una contraseña temporal para ${u.username}? La actual deja de funcionar y se cierran sus sesiones.`)) return;
    try { const r = await api(`/admin/users/${u.id}/temporal`, { method: 'POST' }); setTemporal({ username: u.username, clave: r.temporal }); load(); }
    catch (e2) { setMsg({ ok: false, t: e2.message }); }
  };
  const saveTeam = async (e) => {
    e.preventDefault(); setMsg(null);
    try { const r = await api('/admin/users/team', { method: 'POST', body: team }); setTeamOut(r); setTeam(null); load(); }
    catch (e2) { setMsg({ ok: false, t: e2.message }); }
  };
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault(); setMsg(null);
    try {
      const b = { ...edit }; if (!b.password) delete b.password;
      if (edit.id) await api(`/admin/users/${edit.id}`, { method: 'PATCH', body: b });
      else await api('/admin/users', { method: 'POST', body: b });
      setEdit(null); load(); setMsg({ ok: true, t: 'Guardado' });
    } catch (e2) { setMsg({ ok: false, t: e2.message }); }
  };
  const del = async (u) => { if (!confirm(`¿Eliminar a ${u.username}? Se borran su cuenta, su marca, sus enlaces compartidos y su uso de IA. Esta acción no se puede deshacer.`)) return; await api(`/admin/users/${u.id}`, { method: 'DELETE' }).catch((e) => alert(e.message)); load(); };
  if (!list) return <Spinner />;
  return (
    <>
      <div className="row between">
        <span className="muted small">{list.length} usuarios · {list.filter((u) => u.role === 'paid').length} de pago</span>
        <span className="row" style={{ gap: 6 }}><button className="btn" onClick={() => setTeam({ company: '', n: 3, prefix: '', role: 'paid', profile: 'todos', paid_until: '' })}>Crear equipo</button>
        <button className="btn primary" onClick={() => setEdit({ username: '', password: '', role: 'trial', profile: 'todos', name: '', company: '', phone: '', paid_until: '', active: 1 })}>Crear usuario</button></span>
      </div>
      <Accesos users={list} onTemporal={(t) => { setTemporal(t); load(); }} />
      {temporal && (
        <Modal className="stack" label="Contraseña temporal" onClose={() => setTemporal(null)}>
          <h2>Contraseña temporal de {temporal.username}</h2>
          <p className="small">Entrégala por un canal distinto al que usó la persona para pedirla, por ejemplo una llamada si escribió por correo. No se vuelve a mostrar. Al ingresar, la plataforma le pedirá crear una nueva.</p>
          <p className="mono" style={{ fontSize: 22, letterSpacing: '0.04em' }}>{temporal.clave}</p>
          <div className="row end"><button className="btn" onClick={() => navigator.clipboard?.writeText(temporal.clave)}>Copiar</button><button className="btn primary" onClick={() => setTemporal(null)}>Listo</button></div>
        </Modal>
      )}
      {teamOut && (
        <div className="card stack" role="status">
          <b>Equipo creado. Copia estas claves ahora: no se vuelven a mostrar.</b>
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Usuario</th><th>Contraseña</th></tr></thead><tbody>{teamOut.users.map((u) => <tr key={u.username}><td className="mono">{u.username}</td><td className="mono">{u.password}</td></tr>)}</tbody></table></div>
          <span className="small muted">Si el servidor no tiene disco persistente, los usuarios creados aquí se borran al reiniciar. En ese caso agrega este texto al final de la variable SEED_USERS (separado con punto y coma) y bórralo de tu portapapeles después:</span>
          <textarea className="input mono small" rows={3} readOnly value={teamOut.seed} onFocus={(e) => e.target.select()} />
          <div className="row"><button className="btn sm" onClick={() => navigator.clipboard?.writeText(teamOut.seed)}>Copiar para SEED_USERS</button><button className="btn sm ghost" onClick={() => setTeamOut(null)}>Cerrar</button></div>
        </div>
      )}
      {team && (
        <Modal as="form" className="stack" label="Crear licencia de equipo" onClose={() => setTeam(null)} onSubmit={saveTeam}>
            <h2>Crear licencia de equipo</h2>
            <label className="f">Empresa<input className="input" required value={team.company} onChange={(e) => setTeam({ ...team, company: e.target.value })} /></label>
            <div className="grid g2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="f">Número de usuarios<input className="input" type="number" min="1" max="50" value={team.n} onChange={(e) => setTeam({ ...team, n: +e.target.value })} /></label>
              <label className="f">Prefijo de usuario (opcional)<input className="input" value={team.prefix} placeholder="ej. solaris" onChange={(e) => setTeam({ ...team, prefix: e.target.value })} /></label>
            </div>
            <label className="f">Tipo<select className="select" value={team.role} onChange={(e) => setTeam({ ...team, role: e.target.value })}><option value="paid">Pago: acceso completo</option><option value="trial">Prueba</option></select></label>
            <label className="f">Perfil<select className="select" value={team.profile} onChange={(e) => setTeam({ ...team, profile: e.target.value })}>{Object.entries(PERFILES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="f">Pago válido hasta (opcional)<input className="input" type="date" value={team.paid_until} onChange={(e) => setTeam({ ...team, paid_until: e.target.value })} /></label>
            <span className="small muted">Se crean usuarios como prefijo1, prefijo2… con contraseñas temporales aleatorias que deberán cambiar al ingresar. Todos quedan en la misma empresa y se ven como equipo.</span>
            {msg && !msg.ok && <div className="alert err">{msg.t}</div>}
            <div className="row end"><button type="button" className="btn ghost" onClick={() => setTeam(null)}>Cancelar</button><button className="btn primary">Crear usuarios</button></div>
        </Modal>
      )}
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.t}</div>}
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Usuario</th><th>Rol</th><th>Perfil</th><th>Empresa</th><th>Pago hasta</th><th>Último ingreso</th><th>Estado</th><th></th></tr></thead><tbody>
        {list.map((u) => (
          <tr key={u.id}>
            <td><span className="name">{u.username}</span><br /><span className="small muted">{u.name}</span></td>
            <td><span className={`chip ${u.role !== 'trial' ? 'on' : ''}`}>{ROLES[u.role]}</span></td>
            <td className="small">{PERFILES[u.profile || 'todos']}</td>
            <td className="small">{u.company || '—'}<br /><span className="muted">{u.phone}</span></td>
            <td className="small mono">{u.paid_until || '—'}</td>
            <td className="small mono">{u.last_login?.slice(0, 16) || 'nunca'}{u.must_change_pw ? <><br /><span className="tag warn">Clave temporal</span></> : null}{u.role === 'admin' ? <><br /><span className={`tag ${u.mfa_enabled ? 'ok' : 'warn'}`}>{u.mfa_enabled ? '2 pasos activo' : 'Sin 2 pasos'}</span></> : null}</td>
            <td className="small">{u.active ? 'Activo' : 'Inactivo'}</td>
            <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><button className="btn sm" onClick={() => setEdit({ ...u, password: '' })}>Editar</button>{u.id !== user.id && <button className="btn sm ghost" onClick={() => darTemporal(u)}>Contraseña temporal</button>}{u.id !== user.id && <button className="btn sm danger" onClick={() => del(u)}>Eliminar</button>}</div></td>
          </tr>))}
      </tbody></table></div>
      {edit && (
        <Modal as="form" className="stack" label={edit.id ? `Editar ${edit.username}` : 'Nuevo usuario'} onClose={() => setEdit(null)} onSubmit={save}>
            <h2>{edit.id ? `Editar ${edit.username}` : 'Nuevo usuario'}</h2>
            {!edit.id && <label className="f">Usuario (para iniciar sesión)<input className="input" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} required autoComplete="off" /></label>}
            <label className="f">{edit.id ? 'Contraseña temporal nueva (vacío para no cambiarla)' : 'Contraseña temporal'}<input className="input mono" type="text" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} required={!edit.id} minLength={15} maxLength={128} autoComplete="new-password" aria-describedby="pw-hint" /><span id="pw-hint" className="hint">Mínimo 15 caracteres. La persona deberá cambiarla al ingresar. Entrégala por un canal distinto al del usuario.</span></label>
            <label className="f">Tipo de usuario
              <select className="select" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
                <option value="trial">Prueba: ve la primera fila y datos básicos</option><option value="paid">Pago: acceso completo</option><option value="admin">Administrador</option>
              </select></label>
            <label className="f">Perfil (qué secciones y ranking ve)
              <select className="select" value={edit.profile || 'todos'} onChange={(e) => setEdit({ ...edit, profile: e.target.value })}>
                {Object.entries(PERFILES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></label>
            {edit.role === 'paid' && <label className="f">Pago válido hasta (opcional; al vencer vuelve a prueba)<input className="input" type="date" value={edit.paid_until || ''} onChange={(e) => setEdit({ ...edit, paid_until: e.target.value })} /></label>}
            <div className="grid g2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="f">Nombre<input className="input" value={edit.name || ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
              <label className="f">Empresa<input className="input" value={edit.company || ''} onChange={(e) => setEdit({ ...edit, company: e.target.value })} /></label>
            </div>
            <label className="f">Teléfono<input className="input" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
            {edit.role !== 'trial' && edit.role !== 'admin' && (
              <fieldset className="fs">
                <legend>Activación del plan (soporte para garantía y facturación)</legend>
                <div className="grid g3">
                  <label className="f">Fecha de activación<input className="input" type="date" value={edit.plan_activated_at || ''} onChange={(e) => setEdit({ ...edit, plan_activated_at: e.target.value })} /></label>
                  <label className="f">Valor pagado (COP)<input className="input" type="number" min="0" step="1000" value={edit.plan_amount || ''} onChange={(e) => setEdit({ ...edit, plan_amount: e.target.value })} /></label>
                  <label className="f">N.º factura electrónica<input className="input" maxLength={60} value={edit.plan_invoice || ''} onChange={(e) => setEdit({ ...edit, plan_invoice: e.target.value })} /></label>
                </div>
              </fieldset>
            )}
            {edit.id && <label className="check"><input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked ? 1 : 0 })} /> Cuenta activa</label>}
            {edit.id && edit.role === 'admin' && edit.mfa_enabled && edit.id !== user.id && <label className="check"><input type="checkbox" checked={!!edit.reset_mfa} onChange={(e) => setEdit({ ...edit, reset_mfa: e.target.checked })} /> Reiniciar verificación en dos pasos (perdió el teléfono y los códigos)</label>}
            {msg && !msg.ok && <div className="alert err">{msg.t}</div>}
            <div className="row end"><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancelar</button><button className="btn primary">Guardar</button></div>
        </Modal>
      )}
    </>
  );
}

function useJobs(active) {
  const [jobs, setJobs] = useState([]);
  useEffect(() => {
    let alive = true;
    const tick = () => api('/admin/jobs').then((j) => { if (alive) setJobs(j); });
    tick();
    const id = setInterval(tick, active ? 2500 : 10000);
    return () => { alive = false; clearInterval(id); };
  }, [active]);
  return jobs;
}

function Datos() {
  const [stats, setStats] = useState(null);
  const [msg, setMsg] = useState(null);
  const [type, setType] = useState('proyectos');
  const fileRef = useRef(null);
  const loadStats = () => api('/admin/stats').then(setStats);
  useEffect(() => { loadStats(); }, []);
  const jobs = useJobs(stats?.running);
  const running = jobs.some((j) => j.status === 'corriendo');
  useEffect(() => { if (!running) loadStats(); }, [running]);

  const refresh = async () => { setMsg(null); try { await api('/admin/refresh', { method: 'POST', body: {} }); setMsg({ ok: true, t: 'Actualización iniciada. Tarda de 2 a 5 minutos.' }); loadStats(); } catch (e) { setMsg({ ok: false, t: e.message }); } };
  const uploadData = async (e) => {
    e.preventDefault(); const file = fileRef.current.files[0]; if (!file) return;
    const form = new FormData(); form.append('file', file); form.append('type', type);
    setMsg({ ok: true, t: 'Subiendo…' });
    try { const r = await api('/admin/data/upload', { method: 'POST', form }); setMsg({ ok: true, t: r.mensaje }); fileRef.current.value = ''; loadStats(); }
    catch (e2) { setMsg({ ok: false, t: e2.message }); }
  };
  if (!stats) return <Spinner />;
  const m = stats.meta;
  return (
    <>
      <div className="grid g4">
        <div className="card"><div className="stat"><span className="l">Base generada</span><span className="v" style={{ fontSize: 16 }}>{m.generado?.slice(0, 16).replace('T', ' ')}</span></div></div>
        <div className="card"><div className="stat"><span className="l">Licencias DANE (corte)</span><span className="v">{m.elic_corte}</span></div></div>
        <div className="card"><div className="stat"><span className="l">Licitaciones SECOP</span><span className="v">{fmt(m.secop_n)}</span></div></div>
        <div className="card"><div className="stat"><span className="l">Empresas</span><span className="v">{fmt(m.empresas_n)}</span></div></div>
        <div className="card"><div className="stat"><span className="l">Tarifas SUI</span><span className="v" style={{ fontSize: 16 }}>{m.sui_periodo || 'sin cargar'}</span></div></div>
        <div className="card"><div className="stat"><span className="l">Autogeneradores XM</span><span className="v" style={{ fontSize: 16 }}>{m.agpe_xm_fecha || '—'}</span></div></div>
        <div className="card"><div className="stat"><span className="l">Cortes XM</span><span className="v" style={{ fontSize: 14 }}>{m.dna_periodo || '—'}</span></div></div>
        <div className="card"><div className="stat"><span className="l">Clientes turísticos</span><span className="v">{fmt(m.clientes_n)}</span></div></div>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.t}</div>}
      <div className="grid g2">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>Actualizar fuentes automáticas</h2>
          <p className="small muted" style={{ margin: 0 }}>Descarga de datos.gov.co, XM y SECOP: {Object.values(stats.sources).join(', ')}. Luego recalcula el índice. Recomendado una vez al mes (tarda 5 a 15 minutos).</p>
          <div className="row"><button className="btn primary" onClick={refresh} disabled={running}>{running ? 'Actualizando…' : 'Actualizar ahora'}</button>
            <button className="btn" disabled={running} onClick={() => api('/admin/rebuild', { method: 'POST' }).then(loadStats)}>Solo recalcular</button></div>
        </div>
        <form className="card" onSubmit={uploadData} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>Cargar archivo de datos</h2>
          <select className="select" value={type} onChange={(e) => setType(e.target.value)} aria-label="Tipo de archivo">
            <option value="proyectos">Proyectos o licencias (CSV/XLSX con plantilla)</option>
            <option value="sui_precios">SUI: reporte de precios por empresa y estrato (.xlsx)</option>
            <option value="upme">UPME: informe de registros activos de proyectos (.xlsx)</option>
            <option value="tarifas">Tarifas por operador (CSV/XLSX con plantilla)</option>
            <option value="elic">DANE ELIC: anex-ELIC-SerieTipoBaseMun-*.xlsx</option>
            <option value="poblacion">DANE proyecciones de población municipal (.xlsx)</option>
          </select>
          {['proyectos', 'tarifas'].includes(type) && <a className="small" href={`/api/admin/plantillas/${type}.csv`}>Descargar plantilla {type}.csv</a>}
          <input ref={fileRef} type="file" accept=".csv,.xlsx" className="input" aria-label="Archivo" />
          <button className="btn" disabled={running}>Subir</button>
        </form>
      </div>
      <div className="card">
        <h2>Últimas tareas</h2>
        {jobs.length ? jobs.map((j) => (
          <details key={j.id} style={{ borderBottom: '1px solid var(--line)', padding: '8px 0' }} open={j.status === 'corriendo'}>
            <summary className="small" style={{ cursor: 'pointer' }}>{j.started_at} · {j.kind} · <b>{j.status}</b></summary>
            <pre className="mono small" style={{ whiteSpace: 'pre-wrap', color: 'var(--ink-2)' }}>{j.log}</pre>
          </details>)) : <p className="muted small">Sin tareas todavía.</p>}
      </div>
      <div className="card small" style={{ color: 'var(--ink-2)', lineHeight: 1.6 }}>
        <h2 style={{ marginBottom: 8 }}>Archivos que se actualizan a mano</h2>
        <p style={{ margin: '0 0 6px' }}><b>DANE ELIC</b> (mensual): en dane.gov.co → Construcción → Licencias de construcción → descarga "Series históricas por municipios" (anex-ELIC-SerieTipoBaseMun-*.xlsx) y súbelo aquí.</p>
        <p style={{ margin: '0 0 6px' }}><b>Tarifas SUI</b> (cada 3 meses): en sui.superservicios.gov.co → Reportes → Energía → Comercial → "Consolidado de energía por empresa y departamento" (el mismo reporte de SUI_Precios.xlsx), año actual, exporta a Excel y súbelo como "SUI: reporte de precios". La app toma el valor facturado por kWh de estratos 4 a 6 y comercial de cada operador.</p>
        <p style={{ margin: '0 0 6px' }}><b>Registro de proyectos de la UPME</b> (mensual, automático): el botón "Actualizar ahora" lo descarga solo. Si falla, en upme.gov.co → SIMEC → Energía eléctrica → Registro de proyectos de generación descarga el Excel "Informe de registros activos" más reciente y súbelo como "UPME".</p>
        <p style={{ margin: '0 0 6px' }}><b>Tarifas de un operador puntual</b>: si un operador publica un costo unitario más reciente, súbelo con la plantilla de tarifas.</p>
        <p style={{ margin: 0 }}><b>Proyectos</b>: avisos de curadurías, planeación municipal, ferias inmobiliarias o visitas de campo, con la plantilla o como PDF en la pestaña Documentos para extraerlos con IA.</p>
      </div>
    </>
  );
}

function Documentos() {
  const { meta } = useApp();
  const [docs, setDocs] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ title: '', municipio: '' });
  const [munis, setMunis] = useState([]);
  const fileRef = useRef(null);
  const load = () => api('/admin/docs').then(setDocs);
  useEffect(() => { load(); api('/ranking?limit=1200').then((r) => setMunis(r.rows.map((x) => ({ code: x.code, label: `${x.name} (${x.dpto})` })).sort((a, b) => a.label.localeCompare(b.label)))); }, []);
  const up = async (e) => {
    e.preventDefault(); const file = fileRef.current.files[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file); fd.append('title', form.title); fd.append('municipio', form.municipio);
    setMsg({ ok: true, t: 'Procesando documento…' });
    try { const r = await api('/admin/docs', { method: 'POST', form: fd }); setMsg({ ok: true, t: `Listo: ${fmt(r.chars)} caracteres indexados para la IA.` }); fileRef.current.value = ''; setForm({ title: '', municipio: '' }); load(); }
    catch (e2) { setMsg({ ok: false, t: e2.message }); }
  };
  const extract = async (d) => {
    setBusy(d.id); setMsg(null);
    try { const r = await api(`/admin/docs/${d.id}/extract-projects`, { method: 'POST' }); setMsg({ ok: true, t: `La IA encontró ${r.extraidos} proyectos; se guardaron ${r.guardados}. Revísalos en la pestaña Proyectos.` }); load(); }
    catch (e) { setMsg({ ok: false, t: e.message }); } finally { setBusy(null); }
  };
  if (!docs) return <Spinner />;
  return (
    <>
      <form className="card" onSubmit={up} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h2>Subir documento</h2>
        <p className="small muted" style={{ margin: 0 }}>PDF, TXT, MD, CSV o XLSX. El asistente lo usará para responder. Si son avisos de curaduría, listados de licencias o informes inmobiliarios, después puedes extraer los proyectos con IA. Los PDF escaneados necesitan OCR antes.</p>
        <div className="grid g2">
          <label className="f">Título<input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ej. Avisos curaduría Ibagué septiembre" /></label>
          <label className="f">Municipio (opcional)<select className="select" value={form.municipio} onChange={(e) => setForm({ ...form, municipio: e.target.value })}><option value="">General / varios</option>{munis.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}</select></label>
        </div>
        <input ref={fileRef} type="file" className="input" accept=".pdf,.txt,.md,.csv,.xlsx" aria-label="Documento" />
        <button className="btn primary" style={{ alignSelf: 'flex-start' }}>Subir e indexar</button>
      </form>
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.t}</div>}
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Documento</th><th className="num">Fragmentos</th><th className="num">Proyectos</th><th>Fecha</th><th></th></tr></thead><tbody>
        {docs.map((d) => (
          <tr key={d.id}>
            <td><span className="name">{d.title}</span><br /><span className="small muted">{d.filename} · {meta && d.municipio ? d.municipio : 'general'}</span></td>
            <td className="num">{d.chunks}</td><td className="num">{d.projects}</td><td className="small mono">{d.created_at.slice(0, 10)}</td>
            <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><button className="btn sm" onClick={() => extract(d)} disabled={busy === d.id}>{busy === d.id ? 'Extrayendo…' : 'Extraer proyectos'}</button>
              <button className="btn sm danger" onClick={async () => { if (confirm('¿Eliminar documento?')) { await api(`/admin/docs/${d.id}`, { method: 'DELETE' }); load(); } }}>Eliminar</button></div></td>
          </tr>))}
        {!docs.length && <tr><td colSpan={5} className="empty">Aún no hay documentos.</td></tr>}
      </tbody></table></div>
    </>
  );
}

function Proyectos() {
  const [list, setList] = useState(null);
  const load = () => api('/admin/projects').then(setList);
  useEffect(() => { load(); }, []);
  if (!list) return <Spinner />;
  return (
    <>
      <p className="small muted" style={{ margin: 0 }}>Proyectos cargados por CSV o extraídos con IA ({list.length}). Los de datos abiertos municipales (Fusagasugá, Chía) se muestran directamente en cada ficha.</p>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Proyecto</th><th>Municipio</th><th>Uso</th><th className="num">Unidades</th><th>Fecha</th><th>Fuente</th><th></th></tr></thead><tbody>
        {list.map((p) => (
          <tr key={p.id}><td className="name">{p.nombre}<br /><span className="small muted">{p.direccion}</span></td><td className="small"><a href={`#/m/${p.municipio}`}>{p.municipio}</a></td><td className="small">{p.uso}</td><td className="num">{fmt(p.unidades)}</td><td className="small">{p.fecha}</td><td className="small muted">{p.fuente}</td>
            <td><button className="btn sm danger" onClick={async () => { await api(`/admin/projects/${p.id}`, { method: 'DELETE' }); load(); }}>Eliminar</button></td></tr>))}
        {!list.length && <tr><td colSpan={7} className="empty">Sin proyectos cargados.</td></tr>}
      </tbody></table></div>
    </>
  );
}

function Ajustes() {
  const { meta } = useApp();
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);
  const [ai, setAi] = useState(null);
  const [pf, setPf] = useState('instalador');
  useEffect(() => { api('/admin/settings').then(setS); api('/ai/status').then(setAi); }, []);
  if (!s) return <Spinner />;
  const save = async () => { try { await api('/admin/settings', { method: 'PUT', body: { weights: s.weights, capex_kwp: s.capex_kwp } }); setMsg({ ok: true, t: 'Guardado. Los usuarios verán los nuevos valores al recargar.' }); } catch (e) { setMsg({ ok: false, t: e.message }); } };
  return (
    <div className="grid g2">
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2>Pesos por defecto del índice</h2>
        <div className="seg">{Object.entries(s.profiles).map(([k, p]) => <button key={k} className={pf === k ? 'on' : ''} onClick={() => setPf(k)}>{p.label.split(' ')[0]}</button>)}</div>
        {Object.entries(s.profiles[pf].factors).map(([k, l]) => (
          <label key={k} className="f"><span className="row" style={{ justifyContent: 'space-between' }}><span>{l}</span><span className="mono">{s.weights[pf][k]}</span></span>
            <input type="range" min="0" max="60" step="5" value={s.weights[pf][k] ?? 0} onChange={(e) => setS({ ...s, weights: { ...s.weights, [pf]: { ...s.weights[pf], [k]: +e.target.value } } })} /></label>
        ))}
        <label className="f">Costo de instalación de referencia (COP por kWp)<input className="input" type="number" step="50000" value={s.capex_kwp} onChange={(e) => setS({ ...s, capex_kwp: +e.target.value })} /></label>
        {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.t}</div>}
        <button className="btn primary" onClick={save} style={{ alignSelf: 'flex-start' }}>Guardar</button>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h2>Inteligencia artificial</h2>
        {ai && <div className="kv"><span className="k">Proveedor</span><span className="v">{ai.provider}</span><span className="k">Modelo</span><span className="v">{ai.model || '—'}</span><span className="k">Configurada</span><span className="v">{ai.configured ? 'Sí' : 'No'}</span></div>}
        <p className="small muted" style={{ margin: 0 }}>La clave se define en el servidor (archivo .env o variables del hosting): GEMINI_API_KEY (gratis en aistudio.google.com) o GROQ_API_KEY (gratis en console.groq.com). Límite diario por usuario: AI_DAILY_TRIAL y AI_DAILY_PAID.</p>
      </div>
    </div>
  );
}

const ESTADOS = { recibida: 'Recibida', en_tramite: 'En trámite', incompleta: 'Incompleta (se pidió información)', resuelta: 'Resuelta', rechazada: 'Rechazada', desistida: 'Desistida' };
const fecha = (s) => (s ? String(s).slice(0, 16).replace('T', ' ') : '—');

// Panel de cumplimiento: avisos de configuración, solicitudes de titulares, contactos retirados, aceptaciones, auditoría y respaldos
function Privacidad() {
  const [stats, setStats] = useState(null);
  const [sec, setSec] = useState('solicitudes');
  useEffect(() => { api('/admin/stats').then(setStats).catch(() => {}); }, [sec]);
  const secs = { solicitudes: 'Solicitudes de titulares', retiros: 'Contactos retirados', aceptaciones: 'Aceptaciones', auditoria: 'Registro de actividad', respaldos: 'Copias de seguridad', documentos: 'Datos pendientes en políticas' };
  return (
    <div className="stack lg">
      {stats?.avisos?.length > 0 && (
        <div className="alert warn" role="status">
          <b>Configuración pendiente en el servidor</b>
          <ul className="tight">{stats.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
      {stats?.derechos && (
        <div className="grid g3">
          <div className="card stat"><span className="l">Solicitudes abiertas</span><span className="v">{stats.derechos.abiertas || 0}</span></div>
          <div className={`card stat ${stats.derechos.vencidas ? 'danger' : ''}`}><span className="l">Vencidas</span><span className="v">{stats.derechos.vencidas || 0}</span></div>
          <div className="card stat"><span className="l">Plazos legales</span><span className="v sm">Consulta 10 · Reclamo 15 días hábiles</span></div>
        </div>
      )}
      <div className="seg wrap" role="tablist" aria-label="Privacidad y seguridad">{Object.entries(secs).map(([k, l]) => <button key={k} role="tab" aria-selected={sec === k} className={sec === k ? 'on' : ''} onClick={() => setSec(k)}>{l}</button>)}</div>
      {sec === 'solicitudes' && <Solicitudes />}
      {sec === 'retiros' && <Retiros />}
      {sec === 'aceptaciones' && <Aceptaciones />}
      {sec === 'auditoria' && <Auditoria />}
      {sec === 'respaldos' && <Respaldos />}
      {sec === 'documentos' && <Pendientes />}
    </div>
  );
}

function Solicitudes() {
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => api('/admin/derechos').then(setList);
  useEffect(() => { load(); }, []);
  const save = async (e) => {
    e.preventDefault(); setMsg(null);
    try {
      const body = { status: open.status, response: open.response || '' };
      if (open._prorrogar) body.prorrogar = open._motivo || '';
      await api(`/admin/derechos/${open.id}`, { method: 'PATCH', body });
      if (open._retirar && open.referencia) await api('/admin/suppressions', { method: 'POST', body: { value: open._retirar, reason: `Solicitud ${open.radicado}`, request_id: open.id } });
      setOpen(null); load(); setMsg({ ok: true, t: 'Solicitud actualizada.' });
    } catch (e2) { setMsg({ ok: false, t: e2.message, modal: true }); }
  };
  if (!list) return <Spinner />;
  return (
    <>
      <p className="small muted measure">Cada solicitud llega con radicado y fecha límite en días hábiles de Colombia. La prórroga (5 días para consultas, 8 para reclamos) solo se puede usar una vez y antes del vencimiento, informando el motivo al titular. Responde siempre al correo que dejó la persona.</p>
      {msg && !msg.modal && <div className={`alert ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.t}</div>}
      <div className="tbl-wrap"><table className="tbl"><caption className="sr-only">Solicitudes de titulares de datos</caption>
        <thead><tr><th>Radicado</th><th>Tipo</th><th>Titular</th><th>Estado</th><th>Vence</th><th></th></tr></thead><tbody>
          {list.map((r) => (
            <tr key={r.id}>
              <td className="mono small">{r.radicado}<br /><span className="muted">{fecha(r.created_at)}</span></td>
              <td className="small">{r.tipo_label}<br /><span className="tag">{r.clase}</span></td>
              <td className="small">{r.nombre}<br /><span className="muted">{r.correo}</span></td>
              <td className="small">{ESTADOS[r.status] || r.status}</td>
              <td className="small mono">{r.due_at}{r.closed_at ? null : r.vencida ? <><br /><span className="tag danger">Vencida</span></> : <><br /><span className={`tag ${r.dias_restantes <= 2 ? 'warn' : ''}`}>{r.dias_restantes} días hábiles</span></>}{r.extended ? <><br /><span className="tag">Prorrogada</span></> : null}</td>
              <td><button className="btn sm" onClick={() => { setMsg(null); setOpen({ ...r, _retirar: r.tipo === 'retirar_contacto' ? (String(r.referencia || '').match(/\d{9,10}/)?.[0] || '') : '' }); }}>Gestionar</button></td>
            </tr>))}
          {!list.length && <tr><td colSpan={6} className="empty">No hay solicitudes.</td></tr>}
        </tbody></table></div>
      {open && (
        <Modal as="form" className="stack wide" label={`Solicitud ${open.radicado}`} onClose={() => setOpen(null)} onSubmit={save}>
          <h2>Solicitud {open.radicado}</h2>
          <dl className="kv">
            <dt>Tipo</dt><dd>{open.tipo_label} ({open.clase})</dd>
            <dt>Titular</dt><dd>{open.nombre} · {open.correo}{open.relacion ? ` · ${open.relacion}` : ''}</dd>
            {open.referencia && <><dt>Referencia</dt><dd>{open.referencia}</dd></>}
            <dt>Vence</dt><dd>{open.due_at}{open.extended ? ` (prorrogada: ${open.extension_reason})` : ''}</dd>
          </dl>
          <blockquote className="quote small">{open.detalle}</blockquote>
          <label className="f">Estado<select className="select" value={open.status} onChange={(e) => setOpen({ ...open, status: e.target.value })}>{Object.entries(ESTADOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="f">Respuesta enviada al titular (queda como evidencia)<textarea className="input" rows={5} maxLength={4000} value={open.response || ''} onChange={(e) => setOpen({ ...open, response: e.target.value })} /></label>
          {open.tipo === 'retirar_contacto' && (
            <label className="f">NIT o identificador a retirar de toda la plataforma (opcional)<input className="input mono" value={open._retirar} onChange={(e) => setOpen({ ...open, _retirar: e.target.value })} /><span className="hint">Al guardar, el teléfono, el correo y la web de ese registro dejan de mostrarse a todos los usuarios, también después de restaurar una copia.</span></label>
          )}
          {!open.extended && !open.closed_at && !open.vencida && (
            <>
              <label className="check"><input type="checkbox" checked={!!open._prorrogar} onChange={(e) => setOpen({ ...open, _prorrogar: e.target.checked })} /> Usar la prórroga legal</label>
              {open._prorrogar && <label className="f">Motivo que se informará al titular<textarea className="input" rows={2} minLength={10} maxLength={500} required value={open._motivo || ''} onChange={(e) => setOpen({ ...open, _motivo: e.target.value })} /></label>}
            </>
          )}
          {msg?.modal && <div className="alert err" role="alert">{msg.t}</div>}
          <div className="row end"><button type="button" className="btn ghost" onClick={() => setOpen(null)}>Cancelar</button><button className="btn primary">Guardar</button></div>
        </Modal>
      )}
    </>
  );
}

function Retiros() {
  const [list, setList] = useState(null);
  const [f, setF] = useState({ value: '', reason: '' });
  const [msg, setMsg] = useState(null);
  const load = () => api('/admin/suppressions').then(setList);
  useEffect(() => { load(); }, []);
  const add = async (e) => {
    e.preventDefault(); setMsg(null);
    try { await api('/admin/suppressions', { method: 'POST', body: f }); setF({ value: '', reason: '' }); load(); setMsg({ ok: true, t: 'Contacto retirado en toda la plataforma.' }); }
    catch (e2) { setMsg({ ok: false, t: e2.message }); }
  };
  if (!list) return <Spinner />;
  return (
    <>
      <form className="card stack" onSubmit={add}>
        <h2>Retirar los datos de contacto de un registro</h2>
        <p className="small muted measure">Úsalo cuando una empresa o persona pida no ser contactada. Se oculta su teléfono, correo y web en mapas, listas, exportaciones e IA. El retiro sobrevive a reinicios y restauraciones.</p>
        <div className="grid g2">
          <label className="f">NIT (sin dígito de verificación) o identificador<input className="input mono" required value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} /></label>
          <label className="f">Motivo o radicado<input className="input" maxLength={300} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
        </div>
        {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.t}</div>}
        <button className="btn primary start">Retirar contacto</button>
      </form>
      <div className="tbl-wrap"><table className="tbl"><caption className="sr-only">Contactos retirados</caption><thead><tr><th>Identificador</th><th>Motivo</th><th>Fecha</th></tr></thead><tbody>
        {list.map((s) => <tr key={s.id}><td className="mono">{s.value}</td><td className="small">{s.reason || '—'}</td><td className="small mono">{fecha(s.created_at)}</td></tr>)}
        {!list.length && <tr><td colSpan={3} className="empty">Ningún contacto retirado.</td></tr>}
      </tbody></table></div>
    </>
  );
}

function Aceptaciones() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/admin/consents').then(setList); }, []);
  if (!list) return <Spinner />;
  const si = (v) => (v ? <span className="tag ok">v{v}</span> : <span className="tag warn">Pendiente</span>);
  return (
    <>
      <p className="small muted measure">Evidencia de la aceptación de términos y de la autorización de datos de cada usuario. Cada registro guarda la versión y una huella (SHA-256) del texto aceptado. Quien tenga algo pendiente lo verá al ingresar y no podrá usar la plataforma hasta aceptarlo.</p>
      <div className="tbl-wrap"><table className="tbl"><caption className="sr-only">Aceptaciones por usuario</caption><thead><tr><th>Usuario</th><th>Empresa</th><th>Términos</th><th>Autorización de datos</th><th>Comunicaciones comerciales</th></tr></thead><tbody>
        {list.map((u) => <tr key={u.id}><td>{u.username}</td><td className="small">{u.company || '—'}</td><td>{si(u.terminos)}</td><td>{si(u.datos)}</td><td className="small">{u.publicidad == null ? 'Sin respuesta' : u.publicidad ? 'Autorizó' : 'No autorizó'}</td></tr>)}
      </tbody></table></div>
    </>
  );
}

function Auditoria() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { api('/admin/audit').then(setList); }, []);
  if (!list) return <Spinner />;
  const rows = q ? list.filter((a) => `${a.action} ${a.target} ${a.username}`.toLowerCase().includes(q.toLowerCase())) : list;
  return (
    <>
      <div className="row between">
        <p className="small muted measure">Últimos 300 eventos: ingresos, fallos, cambios de rol y contraseña, exportaciones, enlaces y acciones administrativas. La IP se guarda recortada y el registro se borra a los 12 meses.</p>
        <label className="f inline"><span className="sr-only">Filtrar</span><input className="input" type="search" placeholder="Filtrar" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      </div>
      <div className="tbl-wrap"><table className="tbl"><caption className="sr-only">Registro de actividad</caption><thead><tr><th>Fecha (UTC)</th><th>Usuario</th><th>Acción</th><th>Objeto</th><th>Red</th></tr></thead><tbody>
        {rows.map((a) => <tr key={a.id}><td className="small mono">{fecha(a.at)}</td><td className="small">{a.username || '—'}</td><td className="small"><span className="tag">{a.action}</span></td><td className="small mono break">{a.target || ''}{a.detail ? <><br /><span className="muted">{a.detail}</span></> : null}</td><td className="small mono">{a.ip || ''}</td></tr>)}
      </tbody></table></div>
    </>
  );
}

function Respaldos() {
  const [s, setS] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api('/admin/backups').then(setS);
  useEffect(() => { load(); }, []);
  const run = async () => { setBusy(true); setMsg(null); try { const r = await api('/admin/backups', { method: 'POST' }); setMsg({ ok: true, t: `Copia creada: ${r.archivo}${r.externo ? ' (también en el almacenamiento externo)' : ''}.` }); load(); } catch (e) { setMsg({ ok: false, t: e.message }); } finally { setBusy(false); } };
  if (!s) return <Spinner />;
  return (
    <div className="grid g2">
      <div className="card stack">
        <h2>Estado</h2>
        <dl className="kv">
          <dt>Copias cifradas</dt><dd>{s.activo ? 'Activas (AES-256-GCM)' : 'Inactivas: falta BACKUP_KEY'}</dd>
          <dt>Disco persistente</dt><dd>{s.persistente ? 'Sí' : 'No: la base se borra al reiniciar'}</dd>
          <dt>Copia fuera del hosting</dt><dd>{s.externo ? 'Configurada' : 'No configurada (BACKUP_S3_*)'}</dd>
        </dl>
        {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`} role="status">{msg.t}</div>}
        <button className="btn primary start" onClick={run} disabled={!s.activo || busy}>{busy ? 'Creando…' : 'Crear copia ahora'}</button>
        <p className="small muted">La restauración se hace desde la terminal del servidor, en una carpeta aparte: <code>node server/backup.js restaurar &lt;archivo&gt; &lt;carpeta&gt;</code>. Al restaurar se vuelven a aplicar las eliminaciones y retiros posteriores a la copia.</p>
      </div>
      <div className="card stack">
        <h2>Copias en el servidor</h2>
        {s.copias.length ? <ul className="list mono small">{s.copias.map((c) => <li key={c.archivo}><span>{c.archivo}</span><span className="muted">{(c.bytes / 1e6).toFixed(1)} MB</span></li>)}</ul> : <p className="muted small">Aún no hay copias.</p>}
      </div>
    </div>
  );
}

function Pendientes() {
  const [list, setList] = useState(null);
  useEffect(() => { api('/admin/legal-pendientes').then(setList); }, []);
  if (!list) return <Spinner />;
  if (!list.length) return <div className="alert ok">Todas las políticas tienen sus datos completos. Revisa el texto con tu abogado antes de cada cambio de versión.</div>;
  return (
    <>
      <p className="small muted measure">Estos datos se muestran como <mark className="pend">[PENDIENTE]</mark> en las políticas públicas. Se completan con variables de entorno del servidor (LEGAL_RAZON_SOCIAL, LEGAL_NIT, LEGAL_DOMICILIO, LEGAL_CORREO_DATOS, etc.), no desde aquí.</p>
      {list.map((d) => <div key={d.doc} className="card"><h3><a href={`#/legal/${d.doc}`}>{d.titulo}</a></h3><ul className="tight small">{[...new Set(d.pendientes)].map((p) => <li key={p}>{p}</li>)}</ul></div>)}
    </>
  );
}

// Solicitudes de "¿Olvidaste tu usuario o contraseña?" hechas desde la pantalla de ingreso
function Accesos({ users, onTemporal }) {
  const [list, setList] = useState(null);
  const [pick, setPick] = useState({});
  const [err, setErr] = useState('');
  const load = () => api('/admin/accesos').then(setList).catch(() => setList([]));
  useEffect(() => { load(); }, []);
  const pend = (list || []).filter((a) => a.status === 'pendiente');
  if (!pend.length) return null;
  const act = async (a, accion) => {
    setErr('');
    const user_id = +(pick[a.id] || a.user_id || 0);
    try {
      const r = await api(`/admin/accesos/${a.id}`, { method: 'POST', body: { accion, user_id } });
      if (r.temporal) onTemporal({ username: users.find((u) => u.id === user_id)?.username || a.cuenta, clave: r.temporal });
      load();
    } catch (e) { setErr(e.message); }
  };
  return (
    <section className="card stack accent" aria-labelledby="acc-t">
      <h2 id="acc-t">Solicitudes para recuperar el acceso ({pend.length})</h2>
      <p className="small muted">Antes de entregar una contraseña temporal, confirma que quien escribe es el dueño de la cuenta: comunícate por el teléfono o correo que tienes registrado, no solo por el que dejó en la solicitud.</p>
      {err && <div className="alert err" role="alert">{err}</div>}
      <div className="tbl-wrap"><table className="tbl"><caption className="sr-only">Solicitudes pendientes</caption>
        <thead><tr><th>Fecha (UTC)</th><th>Nombre</th><th>Contacto</th><th>Cuenta</th><th></th></tr></thead>
        <tbody>{pend.map((a) => (
          <tr key={a.id}>
            <td className="small mono">{a.created_at.slice(0, 16)}</td>
            <td className="small">{a.nombre}{a.usuario ? <><br /><span className="muted">escribió «{a.usuario}»</span></> : null}</td>
            <td className="small">{a.contacto}</td>
            <td><label className="sr-only" htmlFor={`acc-${a.id}`}>Cuenta</label>
              <select id={`acc-${a.id}`} className="select" value={pick[a.id] ?? a.user_id ?? ''} onChange={(e) => setPick({ ...pick, [a.id]: e.target.value })}>
                <option value="">Elige la cuenta</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.username}{u.company ? ` · ${u.company}` : ''}</option>)}
              </select></td>
            <td><div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
              <button className="btn sm primary" disabled={!(pick[a.id] || a.user_id)} onClick={() => act(a, 'restablecer')}>Dar contraseña temporal</button>
              <button className="btn sm ghost" onClick={() => act(a, 'descartar')}>Descartar</button></div></td>
          </tr>))}</tbody>
      </table></div>
    </section>
  );
}
