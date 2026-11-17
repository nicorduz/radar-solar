import { useEffect, useState } from 'react';

// Datos personales del usuario guardados en este navegador (zonas que sigue, prospectos, tableros, diseños).
// Se separan por usuario: si otra persona entra con su cuenta en el mismo navegador, no los ve ni los hereda.
// localStorage puede fallar (modo privado o bloqueado): todo va con try/catch y la app funciona sin él.
const EV = 'rs-local';
const PRIVATE = ['rs_prospectos', 'rs_follows', 'rs_seen', 'rs_tableros', 'rs_shapes', 'rs_disenos', 'rs_diseno_actual', 'rs_paneles', 'rs_baterias', 'rs_branding', 'rs_zona_informe'];
let UID = null;
const nk = (k) => (PRIVATE.includes(k) ? `${k}@${UID || 'anon'}` : k);
export function setLocalUser(id) {
  const next = id ? String(id) : null;
  if (next === UID) return;
  UID = next;
  window.dispatchEvent(new CustomEvent(EV, { detail: null }));
}
const ls = () => { try { return window.localStorage; } catch { return null; } };
export const readLocal = (k, def) => { try { const v = ls()?.getItem(nk(k)); return v ? JSON.parse(v) : def; } catch { return def; } };
export const writeLocal = (k, v) => {
  try { ls()?.setItem(nk(k), JSON.stringify(v)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new CustomEvent(EV, { detail: k }));
};
export function useLocal(k, def) {
  const [v, setV] = useState(() => readLocal(k, def));
  useEffect(() => {
    const on = (e) => { if (!e.detail || e.detail === k) setV(readLocal(k, def)); };
    const onStorage = (e) => { if (e.key === nk(k)) setV(readLocal(k, def)); };
    window.addEventListener(EV, on); window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(EV, on); window.removeEventListener('storage', onStorage); };
  }, [k]);
  return [v, (nv) => writeLocal(k, typeof nv === 'function' ? nv(readLocal(k, def)) : nv)];
}
// Datos guardados antes de separar por usuario: no se asignan solos a nadie; el usuario decide si son suyos
export function legacyLocal() {
  const out = {};
  for (const k of PRIVATE) { try { const v = ls()?.getItem(k); if (v) out[k] = Array.isArray(JSON.parse(v)) ? JSON.parse(v).length : 1; } catch { /* ignorar */ } }
  return out;
}
export function importLegacy() {
  for (const k of PRIVATE) {
    try {
      const v = ls()?.getItem(k); if (!v) continue;
      const cur = readLocal(k, null);
      const old = JSON.parse(v);
      writeLocal(k, Array.isArray(cur) && Array.isArray(old) ? [...cur, ...old] : cur ?? old);
      ls().removeItem(k);
    } catch { /* ignorar */ }
  }
}
export const deleteLegacy = () => { for (const k of PRIVATE) { try { ls()?.removeItem(k); } catch { /* ignorar */ } } window.dispatchEvent(new CustomEvent(EV, { detail: null })); };
// Borra todos los datos de este usuario en este navegador
export function wipeMyLocal() {
  for (const k of PRIVATE) { try { ls()?.removeItem(nk(k)); } catch { /* ignorar */ } }
  try { for (const k of Object.keys(window.sessionStorage)) if (k.startsWith('rs_chat')) window.sessionStorage.removeItem(k); } catch { /* ignorar */ }
  window.dispatchEvent(new CustomEvent(EV, { detail: null }));
}
export const chatKey = () => `rs_chat@${UID || 'anon'}`;

// Zonas (municipios) que el usuario sigue
export const FOLLOWS = 'rs_follows';
export const isFollowing = (list, code) => list.some((f) => f.code === code);
export const toggleFollow = (m) => {
  const list = readLocal(FOLLOWS, []);
  writeLocal(FOLLOWS, isFollowing(list, m.code) ? list.filter((f) => f.code !== m.code) : [...list, { code: m.code, name: m.name, dpto: m.dpto, desde: new Date().toISOString().slice(0, 10) }]);
};

// Prospectos (mini CRM)
export const PROSPECTS = 'rs_prospectos';
export const ESTADOS = [
  ['nuevo', 'Por contactar'], ['contactado', 'Contactado'], ['propuesta', 'Propuesta enviada'], ['negociacion', 'En negociación'], ['ganado', 'Ganado'], ['perdido', 'Perdido'],
];
export const TIPOS = { empresa: 'Empresa del sector', industria: 'Empresa C&I', hotel: 'Hotel o turismo', colegio: 'Colegio', salud: 'Hospital o centro de salud', licitacion: 'Licitación', municipio: 'Zona', otro: 'Otro' };
export const prospectKey = (p) => `${p.tipo}|${p.nit || p.ref || p.nombre}`;
export function addProspect(p) {
  const list = readLocal(PROSPECTS, []);
  const k = prospectKey(p);
  if (list.some((x) => prospectKey(x) === k)) return false;
  const now = new Date().toISOString().slice(0, 10);
  writeLocal(PROSPECTS, [{ id: Math.random().toString(36).slice(2, 10), estado: 'nuevo', nota: '', creado: now, actualizado: now, ...p }, ...list]);
  return true;
}
export const hasProspect = (list, p) => list.some((x) => prospectKey(x) === prospectKey(p));

// Novedades ya vistas
export const SEEN = 'rs_seen';
