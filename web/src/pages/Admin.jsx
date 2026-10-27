import React, { useEffect, useRef, useState } from 'react';
import { api, fmt } from '../api.js';
import { useApp } from '../App.jsx';
import { Spinner } from '../components/ui.jsx';

const ROLES = { trial: 'Prueba', paid: 'Pago', admin: 'Administrador' };
const PERFILES = { todos: 'Todos los perfiles', instalador: 'Instalador solar', proveedor: 'Proveedor de equipos', desarrollador: 'Desarrollador o inversionista' };

export default function Admin() {
  const [tab, setTab] = useState('usuarios');
  const tabs = { usuarios: 'Usuarios', datos: 'Datos y fuentes', documentos: 'Documentos e IA', proyectos: 'Proyectos', ajustes: 'Ajustes' };
  return (
    <div className="page">
      <h1>Administración</h1>
      <div className="tabs">{Object.entries(tabs).map(([k, l]) => <button key={k} className={`btn sm ${tab === k ? 'primary' : 'ghost'}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'usuarios' && <Usuarios />}
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
  const load = () => api('/admin/users').then(setList);
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
  const del = async (u) => { if (!confirm(`¿Eliminar a ${u.username}? Esta acción no se puede deshacer.`)) return; await api(`/admin/users/${u.id}`, { method: 'DELETE' }).catch((e) => alert(e.message)); load(); };
  if (!list) return <Spinner />;
  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="muted small">{list.length} usuarios · {list.filter((u) => u.role === 'paid').length} de pago</span>
        <button className="btn primary" onClick={() => setEdit({ username: '', password: '', role: 'trial', profile: 'todos', name: '', company: '', phone: '', paid_until: '', active: 1 })}>Crear usuario</button>
      </div>
      {msg && <div className={`alert ${msg.ok ? 'ok' : 'err'}`}>{msg.t}</div>}
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Usuario</th><th>Rol</th><th>Perfil</th><th>Empresa</th><th>Pago hasta</th><th>Último ingreso</th><th>Estado</th><th></th></tr></thead><tbody>
        {list.map((u) => (
          <tr key={u.id}>
            <td><span className="name">{u.username}</span><br /><span className="small muted">{u.name}</span></td>
            <td><span className={`chip ${u.role !== 'trial' ? 'on' : ''}`}>{ROLES[u.role]}</span></td>
            <td className="small">{PERFILES[u.profile || 'todos']}</td>
            <td className="small">{u.company || '—'}<br /><span className="muted">{u.phone}</span></td>
            <td className="small mono">{u.paid_until || '—'}</td>
            <td className="small mono">{u.last_login?.slice(0, 16) || 'nunca'}{u.terms_at ? <><br /><span className="muted">términos v{u.terms_version} aceptados</span></> : null}</td>
            <td className="small">{u.active ? 'Activo' : 'Inactivo'}</td>
            <td><div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><button className="btn sm" onClick={() => setEdit({ ...u, password: '' })}>Editar</button>{u.id !== user.id && <button className="btn sm danger" onClick={() => del(u)}>Eliminar</button>}</div></td>
          </tr>))}
      </tbody></table></div>
      {edit && (
        <div className="modal-bg" onClick={() => setEdit(null)}>
          <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h2>{edit.id ? `Editar ${edit.username}` : 'Nuevo usuario'}</h2>
            {!edit.id && <label className="f">Usuario (para iniciar sesión)<input className="input" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} required autoComplete="off" /></label>}
            <label className="f">{edit.id ? 'Nueva contraseña (dejar vacío para no cambiarla)' : 'Contraseña (mínimo 8 caracteres)'}<input className="input" type="text" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} required={!edit.id} minLength={8} autoComplete="new-password" /></label>
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
            {edit.id && <label className="row small"><input type="checkbox" checked={!!edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked ? 1 : 0 })} /> Cuenta activa</label>}
            {msg && !msg.ok && <div className="alert err">{msg.t}</div>}
            <div className="row" style={{ justifyContent: 'flex-end' }}><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancelar</button><button className="btn primary">Guardar</button></div>
          </form>
        </div>
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
