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
import Terminos, { LegalLine, TerminosTexto } from './pages/Terminos.jsx';
import Plan, { PoweredBy } from './pages/Plan.jsx';
import Industrias from './pages/Industrias.jsx';
import Prospectos from './pages/Prospectos.jsx';
import Calculadora from './pages/Calculadora.jsx';
import Propuesta from './pages/Propuesta.jsx';
import Compartido from './pages/Compartido.jsx';
import Tour from './components/Tour.jsx';
import { useLocal, FOLLOWS, SEEN } from './local.js';

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
  prospectos: { label: 'Mis prospectos', icon: 'star' },
  calculadora: { label: 'Calculadora financiera', icon: 'calc' },
  empresas: { label: 'Instaladores y empresas', icon: 'building' },
  mercado: { label: 'Mercado y red', icon: 'chart' },
  licitaciones: { label: 'Licitaciones', icon: 'doc' },
  asistente: { label: 'Asistente IA', icon: 'spark' },
};
const ORDER = {
  instalador: ['mapa', 'ranking', 'clientes', 'prospectos', 'industrias', 'licitaciones', 'calculadora', 'mercado', 'empresas', 'asistente'],
  proveedor: ['mapa', 'ranking', 'empresas', 'prospectos', 'mercado', 'licitaciones', 'industrias', 'clientes', 'calculadora', 'asistente'],
  desarrollador: ['mapa', 'ranking', 'mercado', 'prospectos', 'industrias', 'licitaciones', 'calculadora', 'empresas', 'clientes', 'asistente'],
  servicios: ['mapa', 'ranking', 'mercado', 'prospectos', 'industrias', 'empresas', 'licitaciones', 'clientes', 'calculadora', 'asistente'],
  respaldo: ['mapa', 'ranking', 'clientes', 'prospectos', 'industrias', 'mercado', 'licitaciones', 'calculadora', 'empresas', 'asistente'],
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

  useEffect(() => {
    api('/config').then(setCfg).catch(() => {});
    api('/me').then((r) => setUser(r.user)).catch(() => setUser(null));
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    if (!user) return;
    api('/meta').then((m) => {
      setMeta(m);
      const keys = Object.keys(m.profiles);
      setProfile((p) => (keys.includes(p) ? p : keys[0]));
    }).catch((e) => { if (e.status === 401) setUser(null); });
  }, [user]);

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
  const logout = async () => { await api('/logout', { method: 'POST' }).catch(() => {}); setUser(null); setMeta(null); };

  // Ficha compartida por enlace: se ve sin iniciar sesión
  if (route.view === 'compartido' && route.arg) return <Compartido token={route.arg} />;
  if (user === undefined) return <div className="login"><div className="spinner" /></div>;
  if (!user) {
    if (route.view === 'terminos') return <div className="login" style={{ alignItems: 'flex-start' }}><div className="card" style={{ maxWidth: 860, display: 'flex', flexDirection: 'column', gap: 14 }}><a href="#/" className="small">← Volver al ingreso</a><h1>Términos de la licencia de uso</h1><TerminosTexto appName={cfg.appName} /></div></div>;
    return <Login cfg={cfg} onLogin={setUser} />;
  }
  if (!meta || !weights || !profile || !meta.profiles[profile]) return <div className="login"><div className="spinner" /></div>;

  const paid = meta.paid;
  const NAV = navFor(profile);
  const nav = [...NAV, ...(user.role === 'admin' ? [{ id: 'admin', label: 'Administración', icon: 'gear' }] : [])];
  const prof = meta.profiles[profile];
  // Parámetros que todas las consultas de puntaje envían al servidor
  const scoreParams = { profile, ...(prof.segments ? { segment } : {}), ...Object.fromEntries(Object.entries(weights).map(([k, v]) => [`w_${k}`, v])) };
  const ctx = { user, cfg, meta, paid, profile, prof, setProfile: updateProfile, segment, setSegment: updateSegment, weights, setWeights: updateWeights, scoreParams, go, logout };
  const { view, arg } = route;

  let page;
  if (view === 'ranking') page = <Ranking />;
  else if (view === 'm' && arg) page = <Municipio code={arg} />;
  else if (view === 'licitaciones') page = <Licitaciones />;
  else if (view === 'empresas') page = <Empresas />;
  else if (view === 'clientes') page = <Clientes code={arg} />;
  else if (view === 'mercado') page = <Mercado />;
  else if (view === 'asistente') page = <Asistente code={arg} />;
  else if (view === 'admin' && user.role === 'admin') page = <Admin />;
  else if (view === 'cuenta') page = <Cuenta />;
  else if (view === 'terminos') page = <Terminos appName={cfg.appName} />;
  else if (view === 'plan') page = <Plan />;
  else if (view === 'industrias') page = <Industrias code={arg} />;
  else if (view === 'prospectos') page = <Prospectos />;
  else if (view === 'calculadora') page = <Calculadora code={arg} />;
  else if (view === 'propuesta' && arg) page = <Propuesta key={arg} arg={arg} />;
  else page = <MapPage />;

  const active = view === 'm' || view === 'propuesta' ? 'ranking' : view;
  return (
    <Ctx.Provider value={ctx}>
      <div className="shell">
        <aside className="side">
          <div className="brand"><img src="/icon.svg" alt="" /><span>{cfg.appName}</span></div>
          <PoweredBy />
          <ProfileSwitch />
          {nav.map((n) => (
            <button key={n.id} className={`navbtn ${active === n.id ? 'on' : ''}`} onClick={() => go(n.id)}>
              <Icon name={n.icon} />{n.label}{n.id === 'prospectos' && sinVer > 0 && <span className="badge" aria-label={`${sinVer} novedades sin ver`}>{sinVer > 99 ? '99+' : sinVer}</span>}
            </button>
          ))}
          <div className="spacer" />
          {!paid && <button className="btn primary sm" style={{ margin: '0 4px 8px' }} onClick={() => go('plan')}>Plan completo · pago único</button>}
          <button className={`navbtn ${active === 'cuenta' ? 'on' : ''}`} onClick={() => go('cuenta')}><Icon name="user" />{user.name || user.username}</button>
          <div className="legal-foot"><LegalLine go={go} /></div>
        </aside>
        <main className="main">{page}</main>
        <Tour paid={paid} go={go} />
        <nav className="bottomnav">
          {[...NAV.slice(0, 3), PAGES.asistente && { id: 'asistente', ...PAGES.asistente }, { id: 'cuenta', label: 'Más', icon: 'menu' }].map((n) => (
            <button key={n.id} className={active === n.id || (n.id === 'cuenta' && !['mapa', 'ranking', 'asistente', NAV[2].id].includes(active)) ? 'on' : ''} onClick={() => go(n.id)}>
              <Icon name={n.icon} />{n.label}
            </button>
          ))}
        </nav>
      </div>
    </Ctx.Provider>
  );
}
