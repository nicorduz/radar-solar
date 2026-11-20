import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';
import { Icon } from './components/Icon.jsx';
import Login from './pages/Login.jsx';
import MapPage from './pages/MapPage.jsx';
import Ranking from './pages/Ranking.jsx';
import Municipio from './pages/Municipio.jsx';
import Licitaciones from './pages/Licitaciones.jsx';
import Empresas from './pages/Empresas.jsx';
import Asistente from './pages/Asistente.jsx';
import Admin from './pages/Admin.jsx';
import Cuenta from './pages/Cuenta.jsx';
import Clientes from './pages/Clientes.jsx';
import Mercado from './pages/Mercado.jsx';
import { ProfileSwitch } from './components/ui.jsx';
import Legal, { LegalLine, PublicShell } from './pages/Legal.jsx';
import Derechos from './pages/Derechos.jsx';
import Landing from './pages/Landing.jsx';
import { ConsentScreen, ForcePassword } from './components/Gates.jsx';
import Plan, { PoweredBy } from './pages/Plan.jsx';
import Industrias from './pages/Industrias.jsx';
import Instituciones from './pages/Instituciones.jsx';
import Prospectos from './pages/Prospectos.jsx';
import Calculadora from './pages/Calculadora.jsx';
import Propuesta from './pages/Propuesta.jsx';
import Compartido from './pages/Compartido.jsx';
import Diseno from './pages/Diseno.jsx';
import Marca from './pages/Marca.jsx';
import Tour from './components/Tour.jsx';
import { useLocal, FOLLOWS, SEEN, setLocalUser } from './local.js';

export const Ctx = createContext(null);
// localStorage puede fallar (modo privado): se usa con try/catch
const store = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};
export const useApp = () => useContext(Ctx);

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [view, arg] = h.split('/');
  return { view: view || 'mapa', arg: arg ? decodeURIComponent(arg) : null };
}

// El orden del menú cambia según el perfil: cada uno ve primero lo que más le sirve
const PAGES = {
  mapa: { label: 'Mapa', icon: 'map' },
  ranking: { label: 'Ranking', icon: 'list' },
  clientes: { label: 'Hoteles y turismo', icon: 'hotel' },
  industrias: { label: 'Empresas e industrias', icon: 'factory' },
  instituciones: { label: 'Colegios y salud', icon: 'school' },
  prospectos: { label: 'Mis prospectos', icon: 'star' },
  diseno: { label: 'Diseño solar', icon: 'sun' },
  calculadora: { label: 'Calculadora financiera', icon: 'calc' },
  empresas: { label: 'Instaladores y empresas', icon: 'building' },
  mercado: { label: 'Mercado y red', icon: 'chart' },
  licitaciones: { label: 'Licitaciones', icon: 'doc' },
  asistente: { label: 'Asistente IA', icon: 'spark' },
};
const ORDER = {
  instalador: ['mapa', 'diseno', 'ranking', 'clientes', 'prospectos', 'industrias', 'instituciones', 'licitaciones', 'calculadora', 'mercado', 'empresas', 'asistente'],
  proveedor: ['mapa', 'ranking', 'empresas', 'prospectos', 'mercado', 'licitaciones', 'industrias', 'clientes', 'instituciones', 'diseno', 'calculadora', 'asistente'],
  desarrollador: ['mapa', 'ranking', 'diseno', 'mercado', 'prospectos', 'industrias', 'licitaciones', 'calculadora', 'empresas', 'clientes', 'instituciones', 'asistente'],
  servicios: ['mapa', 'ranking', 'mercado', 'prospectos', 'industrias', 'empresas', 'licitaciones', 'clientes', 'instituciones', 'diseno', 'calculadora', 'asistente'],
  respaldo: ['mapa', 'diseno', 'ranking', 'clientes', 'instituciones', 'prospectos', 'industrias', 'mercado', 'licitaciones', 'calculadora', 'empresas', 'asistente'],
};
const navFor = (profile) => (ORDER[profile] || ORDER.instalador).map((id) => ({ id, ...PAGES[id] }));

export default function App() {
  const [user, setUser] = useState(undefined);
  const [cfg, setCfg] = useState({ appName: 'Radar Solar', contact: {} });
  const [meta, setMeta] = useState(null);
  const [route, setRoute] = useState(parseHash());
  const [segment, setSegment] = useState(() => store.get('rs_segment') || 'campestre');
  const [profile, setProfile] = useState(() => store.get('rs_profile'));
  const [weights, setWeights] = useState(null);
  const [follows] = useLocal(FOLLOWS, []);
  const [seen] = useLocal(SEEN, []);
  const [nov, setNov] = useState(null);
  const [gate, setGate] = useState(null); // 'consent_required' | 'must_change_pw'
  const [live, setLive] = useState('');

  const refreshUser = useCallback(() => api('/me').then((r) => { setUser(r.user); setGate(null); }).catch(() => setUser(null)), []);
  useEffect(() => {
    api('/config').then(setCfg).catch(() => {});
    refreshUser();
    const on = () => { setRoute(parseHash()); document.getElementById('main')?.focus({ preventScroll: true }); };
    const onGate = (e) => setGate(e.detail);
    let t; const onAnn = (e) => { setLive(''); clearTimeout(t); t = setTimeout(() => setLive(e.detail), 60); };
    window.addEventListener('hashchange', on); window.addEventListener('rs-gate', onGate); window.addEventListener('rs-announce', onAnn);
    return () => { window.removeEventListener('hashchange', on); window.removeEventListener('rs-gate', onGate); window.removeEventListener('rs-announce', onAnn); };
  }, []);
  // Los datos guardados en el navegador se separan por usuario
  useEffect(() => { setLocalUser(user?.id || null); if (user?.must_change_pw) setGate('must_change_pw'); }, [user?.id, user?.must_change_pw]);

  useEffect(() => {
    if (!user) return;
    if (gate) return;
    api('/meta').then((m) => {
      setMeta(m);
      const keys = Object.keys(m.profiles);
      setProfile((p) => (keys.includes(p) ? p : keys[0]));
    }).catch((e) => { if (e.status === 401) setUser(null); });
  }, [user, gate]);

  // Pesos guardados por perfil en este navegador (solo plan completo)
  useEffect(() => {
    if (!meta || !profile || !meta.profiles[profile]) return;
    let w = meta.profiles[profile].weights;
    try { const saved = JSON.parse(store.get('rs_weights_' + profile) || 'null'); if (saved && meta.paid) w = { ...w, ...saved }; } catch { /* ignore */ }
    setWeights(w);
  }, [meta, profile]);

  // Cuántas novedades sin ver hay en las zonas que sigue (se consulta al entrar y cuando cambia la lista)
  useEffect(() => {
    if (!meta?.paid || !follows.length) { setNov(null); return; }
    api('/novedades', { method: 'POST', body: { codes: follows.map((f) => f.code) } }).then((r) => setNov(r.items.map((x) => x.id))).catch(() => setNov(null));
  }, [meta?.paid, follows.map((f) => f.code).join(',')]);
  const sinVer = nov ? nov.filter((id) => !seen.includes(id)).length : 0;

  const go = useCallback((view, arg) => { window.location.hash = `/${view}${arg ? '/' + encodeURIComponent(arg) : ''}`; }, []);
  const updateWeights = (w) => { setWeights(w); store.set('rs_weights_' + profile, JSON.stringify(w)); };
  const updateSegment = (s) => { setSegment(s); store.set('rs_segment', s); };
  const updateProfile = (p) => { setWeights(null); setProfile(p); store.set('rs_profile', p); };
  const logout = async () => {
    await api('/logout', { method: 'POST' }).catch(() => {});
    // El chat del asistente vive solo en la pestaña: se borra al salir
    try { for (const k of Object.keys(sessionStorage)) if (k.startsWith('rs_chat')) sessionStorage.removeItem(k); } catch { /* sin almacenamiento */ }
    setLocalUser(null); setUser(null); setMeta(null); setGate(null);
  };
  const liveRegion = <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{live}</div>;

  // Ficha compartida por enlace, documentos legales y canal de derechos: se ven sin iniciar sesión
  if (route.view === 'compartido' && route.arg) return <Compartido token={route.arg} />;
  if (!user && (route.view === 'legal' || route.view === 'terminos')) return <PublicShell><Legal doc={route.arg || 'terminos'} /></PublicShell>;
  if (!user && route.view === 'derechos') return <PublicShell><Derechos /></PublicShell>;
  if (user === undefined) return <div className="boot" role="status" aria-label="Cargando"><div className="spinner" /></div>;
  // Sin sesión: la raíz muestra la página de inicio; cualquier otra sección pide ingresar
  if (!user) {
    const raw = window.location.hash.replace(/^#\/?/, '');
    if (!raw || raw === 'inicio') return <Landing cfg={cfg} />;
    if (route.view === 'para') return <Landing cfg={cfg} perfil={route.arg} />;
    return <Login cfg={cfg} onLogin={(u) => { setUser(u); setGate(null); if (route.view === 'ingresar') window.location.hash = '#/mapa'; }} />;
  }
  // Bloqueos que exige el servidor antes de usar la plataforma
  if (gate === 'must_change_pw') return <>{liveRegion}<ForcePassword user={user} onDone={refreshUser} onLogout={logout} /></>;
  if (gate === 'consent_required' && !['legal', 'derechos'].includes(route.view)) return <>{liveRegion}<ConsentScreen onDone={() => { setGate(null); refreshUser(); }} onLogout={logout} /></>;
  if (gate === 'consent_required') return <PublicShell>{route.view === 'derechos' ? <Derechos user={user} /> : <Legal doc={route.arg} />}</PublicShell>;
  if (!meta || !weights || !profile || !meta.profiles[profile]) return <div className="boot" role="status" aria-label="Cargando"><div className="spinner" /></div>;

  const paid = meta.paid;
  const NAV = navFor(profile);
  const isAdmin = user.stored_role === 'admin';
  const nav = [...NAV, ...(isAdmin ? [{ id: 'admin', label: 'Administración', icon: 'gear' }] : [])];
  const prof = meta.profiles[profile];
  // Parámetros que todas las consultas de puntaje envían al servidor
  const scoreParams = { profile, ...(prof.segments ? { segment } : {}), ...Object.fromEntries(Object.entries(weights).map(([k, v]) => [`w_${k}`, v])) };
  const ctx = { user, cfg, meta, paid, profile, prof, setProfile: updateProfile, segment, setSegment: updateSegment, weights, setWeights: updateWeights, scoreParams, go, logout, refreshUser, isAdmin };
  const { view, arg } = route;

  let page;
  if (view === 'ranking') page = <Ranking />;
  else if (view === 'm' && arg) page = <Municipio code={arg} />;
  else if (view === 'licitaciones') page = <Licitaciones />;
  else if (view === 'empresas') page = <Empresas />;
  else if (view === 'clientes') page = <Clientes code={arg} />;
  else if (view === 'mercado') page = <Mercado />;
  else if (view === 'asistente') page = <Asistente code={arg} />;
  else if (view === 'admin' && isAdmin) page = <Admin />;
  else if (view === 'cuenta') page = <Cuenta />;
  else if (view === 'terminos' || view === 'legal') page = <Legal doc={arg || 'terminos'} />;
  else if (view === 'derechos') page = <Derechos user={user} />;
  else if (view === 'plan') page = <Plan />;
  else if (view === 'industrias') page = <Industrias code={arg} />;
  else if (view === 'instituciones') page = <Instituciones arg={arg} />;
  else if (view === 'prospectos') page = <Prospectos />;
  else if (view === 'calculadora') page = <Calculadora code={arg} />;
  else if (view === 'diseno') page = <Diseno />;
  else if (view === 'marca') page = <Marca />;
  else if (view === 'propuesta' && arg) page = <Propuesta key={arg} arg={arg} />;
  else page = <MapPage focus={view === 'mapa' ? arg : null} />;

  const active = view === 'm' || view === 'propuesta' ? 'ranking' : view;
  return (
    <Ctx.Provider value={ctx}>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Saltar al contenido</a>
      {liveRegion}
      <div className="shell">
        <aside className="side" aria-label="Navegación principal">
          <div className="brand"><img src="/icon.svg" alt="" width="28" height="28" /><span>{cfg.appName}</span></div>
          <ProfileSwitch />
          <nav className="side-nav">
            {nav.map((n) => (
              <a key={n.id} href={`#/${n.id}`} className={`navbtn ${active === n.id ? 'on' : ''}`} aria-current={active === n.id ? 'page' : undefined}>
                <Icon name={n.icon} />{n.label}{n.id === 'prospectos' && sinVer > 0 && <span className="badge"><span aria-hidden="true">{sinVer > 99 ? '99+' : sinVer}</span><span className="sr-only">{sinVer} novedades sin ver</span></span>}
              </a>
            ))}
          </nav>
          <div className="spacer" />
          <a href="#/marca" className={`navbtn ${active === 'marca' ? 'on' : ''}`} aria-current={active === 'marca' ? 'page' : undefined}><Icon name="palette" />Mi marca</a>
          {!paid && <a href="#/plan" className="btn primary sm side-cta">Plan completo</a>}
          <a href="#/cuenta" className={`navbtn ${active === 'cuenta' ? 'on' : ''}`} aria-current={active === 'cuenta' ? 'page' : undefined}><Icon name="user" /><span className="trunc">{user.name || user.username}</span></a>
          <PoweredBy />
        </aside>
        <main id="main" className="main" tabIndex={-1}>{page}<footer className="app-foot"><LegalLine titular={cfg.titular} /></footer></main>
        <Tour paid={paid} go={go} />
        <nav className="bottomnav" aria-label="Navegación principal">
          {[...NAV.slice(0, 3), PAGES.asistente && { id: 'asistente', ...PAGES.asistente }, { id: 'cuenta', label: 'Más', icon: 'menu' }].map((n) => {
            const on = active === n.id || (n.id === 'cuenta' && !['mapa', 'ranking', 'asistente', NAV[2].id].includes(active));
            return <a key={n.id} href={`#/${n.id}`} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}><Icon name={n.icon} />{n.label}</a>;
          })}
        </nav>
      </div>
    </Ctx.Provider>
  );
}
