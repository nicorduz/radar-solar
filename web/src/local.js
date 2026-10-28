import { useEffect, useState } from 'react';

// Datos personales del usuario guardados en este navegador (zonas que sigue, prospectos, novedades vistas).
// localStorage puede fallar (modo privado o bloqueado): todo va con try/catch y la app funciona sin él.
const EV = 'rs-local';
export const readLocal = (k, def) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; } };
export const writeLocal = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new CustomEvent(EV, { detail: k }));
};
export function useLocal(k, def) {
  const [v, setV] = useState(() => readLocal(k, def));
  useEffect(() => {
    const on = (e) => { if (!e.detail || e.detail === k) setV(readLocal(k, def)); };
    const onStorage = (e) => { if (e.key === k) setV(readLocal(k, def)); };
    window.addEventListener(EV, on); window.addEventListener('storage', onStorage);
    return () => { window.removeEventListener(EV, on); window.removeEventListener('storage', onStorage); };
  }, [k]);
  return [v, (nv) => writeLocal(k, typeof nv === 'function' ? nv(readLocal(k, def)) : nv)];
}

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
export const TIPOS = { empresa: 'Empresa del sector', industria: 'Empresa C&I', hotel: 'Hotel o turismo', licitacion: 'Licitación', municipio: 'Zona', otro: 'Otro' };
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
