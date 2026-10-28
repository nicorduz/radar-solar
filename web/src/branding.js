import { useEffect, useState } from 'react';
import { api } from './api.js';
import { readLocal, writeLocal, useLocal } from './local.js';

// Marca de la empresa del usuario: se guarda en el servidor y en el navegador
// (en el hosting gratis el servidor puede reiniciarse; el navegador conserva la copia).
const KEY = 'rs_branding';
export const MARCA_VACIA = {
  empresa: '', nit: '', logo: '', color1: '#231D5D', color2: '#FF7A00', asesor: '', cargo: '', telefono: '', whatsapp: '', correo: '', web: '', direccion: '', ciudad: '',
  condiciones: 'Precios en pesos colombianos, IVA incluido cuando aplique. La propuesta final se confirma después de la visita técnica.', validez: 30,
};

let pedido = null;
export function useBranding(user) {
  const [b] = useLocal(KEY, null);
  useEffect(() => {
    if (pedido) return;
    pedido = api('/branding').then((srv) => {
      const local = readLocal(KEY, null);
      // Gana la versión más reciente; si el servidor se reinició y perdió la marca, se vuelve a subir la del navegador
      if (srv && (!local?.updated_at || srv.updated_at >= local.updated_at)) writeLocal(KEY, srv);
      else if (!srv && local) api('/branding', { method: 'PUT', body: local }).catch(() => {});
    }).catch(() => {});
  }, []);
  return { ...MARCA_VACIA, empresa: user?.company || '', ...(b || {}) };
}

export async function saveBranding(data) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  writeLocal(KEY, { ...data, updated_at: now });
  try { const srv = await api('/branding', { method: 'PUT', body: data }); writeLocal(KEY, { ...srv, updated_at: now }); return true; }
  catch { return false; }
}

// Color de texto legible sobre un fondo (blanco o casi negro según la luminancia)
export function inkOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#FFFFFF';
  const n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  const L = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return L > 0.4 ? '#14122E' : '#FFFFFF';
}
// Un color de marca muy claro no se lee como texto sobre blanco: se oscurece
export function readableOnWhite(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#231D5D';
  let n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  for (let i = 0; i < 8 && inkOn(`#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`) !== '#FFFFFF'; i++) { r = Math.round(r * 0.8); g = Math.round(g * 0.8); b = Math.round(b * 0.8); }
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// Reduce el logo a un tamaño razonable antes de guardarlo
export function logoToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); return; }
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 640 / img.width, 320 / img.height);
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Sello que siempre aparece en los documentos generados
export const SELLO = 'Hecho con Radar Solar by Talera';
