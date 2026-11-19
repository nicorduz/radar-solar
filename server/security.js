// Controles transversales de seguridad: cabeceras, HTTPS, CSRF, límites de consumo, auditoría y errores discretos.
import crypto from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';

// ---------------- Cabeceras y HTTPS ----------------
const origin = (u) => { try { return new URL(u.replace(/\{[a-z]\}/g, '0')).origin; } catch { return null; } };
export function securityHeaders(req, res, next) {
  // Detrás del proxy del hosting: redirige HTTP a HTTPS en producción
  if (config.forceHttps && req.headers['x-forwarded-proto'] === 'http') return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  // Orígenes externos que la app usa de verdad: mapa base (CARTO), imágenes satelitales (Esri u otro configurado)
  const sat = origin(config.satTiles);
  const tiles = ['https://*.basemaps.cartocdn.com', 'https://basemaps.cartocdn.com', 'https://server.arcgisonline.com', 'https://services.arcgisonline.com', sat].filter(Boolean);
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    // React aplica estilos en línea (atributo style); no se permiten <script> en línea
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${[...new Set(tiles)].join(' ')}`,
    `connect-src 'self' ${[...new Set(tiles)].join(' ')}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "child-src blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(config.forceHttps ? ['upgrade-insecure-requests'] : []),
  ].join('; ');
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()');
  // HSTS solo cuando el dominio está listo (variable HSTS=1); sin includeSubDomains para no romper subdominios
  if (config.hsts) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
}

// ---------------- CSRF ----------------
// La cookie de sesión es SameSite=Strict; además, toda petición que cambia datos debe venir del mismo origen
export function csrfGuard(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || !req.path.startsWith('/api/')) return next();
  const host = req.headers.host;
  const src = req.headers.origin || req.headers.referer;
  if (src) { try { if (new URL(src).host !== host) return res.status(403).json({ error: 'Origen no permitido' }); } catch { return res.status(403).json({ error: 'Origen no permitido' }); } }
  if (req.headers['sec-fetch-site'] && !['same-origin', 'none'].includes(req.headers['sec-fetch-site'])) return res.status(403).json({ error: 'Origen no permitido' });
  next();
}

// ---------------- Límites de intentos y de consumo ----------------
// Ventana fija guardada en SQLite (sobrevive reinicios y la comparten procesos que usan el mismo disco)
export function hit(key, limit, windowSec) {
  const now = Math.floor(Date.now() / 1000);
  const r = db.prepare('SELECT window_start, count FROM rate_limits WHERE key=?').get(key);
  if (!r || now - r.window_start >= windowSec) { db.prepare('INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start, count=1').run(key, now); return { ok: true, left: limit - 1, retry: 0 }; }
  if (r.count >= limit) return { ok: false, left: 0, retry: windowSec - (now - r.window_start) };
  db.prepare('UPDATE rate_limits SET count=count+1 WHERE key=?').run(key);
  return { ok: true, left: limit - r.count - 1, retry: 0 };
}
export const peek = (key, windowSec) => { const r = db.prepare('SELECT window_start, count FROM rate_limits WHERE key=?').get(key); const now = Math.floor(Date.now() / 1000); return r && now - r.window_start < windowSec ? r.count : 0; };
export const clearHits = (key) => db.prepare('DELETE FROM rate_limits WHERE key=?').run(key);
export const limiter = (name, limit, windowSec, keyFn = (req) => req.user?.id || ipOf(req)) => (req, res, next) => {
  const h = hit(`${name}:${keyFn(req)}`, limit, windowSec);
  if (!h.ok) { res.setHeader('Retry-After', String(h.retry)); return res.status(429).json({ error: 'Demasiadas solicitudes seguidas. Intenta de nuevo en unos minutos.' }); }
  next();
};

// ---------------- Datos mínimos de red ----------------
// IP truncada (IPv4 /24, IPv6 /48): sirve para seguridad sin guardar la dirección completa
export const ipOf = (req) => String(req.ip || '').replace(/^::ffff:/, '');
export function ipShort(req) {
  const ip = ipOf(req);
  if (ip.includes('.')) return ip.split('.').slice(0, 3).join('.') + '.0';
  return ip.split(':').slice(0, 3).join(':') + '::';
}
export const uaShort = (req) => String(req.headers['user-agent'] || '').replace(/\s+/g, ' ').slice(0, 120);

// ---------------- Auditoría ----------------
export function audit(req, action, target = null, detail = null, actorId = undefined) {
  try {
    db.prepare('INSERT INTO audit_log(actor_id,action,target,detail,ip) VALUES(?,?,?,?,?)')
      .run(actorId !== undefined ? actorId : req?.user?.id ?? null, action, target == null ? null : String(target).slice(0, 120), detail == null ? null : JSON.stringify(detail).slice(0, 800), req ? ipShort(req) : null);
  } catch (e) { console.error('No se pudo registrar auditoría:', e.message); }
}
// Conservación: auditoría 1 año, límites vencidos y sesiones vencidas se purgan a diario
export function purgeOld() {
  db.prepare("DELETE FROM audit_log WHERE at < datetime('now','-365 days')").run();
  db.prepare('DELETE FROM rate_limits WHERE window_start < ?').run(Math.floor(Date.now() / 1000) - 86400);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  db.prepare("DELETE FROM access_requests WHERE (status <> 'pendiente' AND resolved_at < datetime('now','-180 days')) OR created_at < datetime('now','-365 days')").run();
}

// ---------------- Errores discretos ----------------
export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || (err.type === 'entity.parse.failed' ? 400 : err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  if (status < 500) {
    const msg = err.type === 'entity.parse.failed' ? 'La solicitud no tiene un formato válido.' : err.code === 'LIMIT_FILE_SIZE' ? 'El archivo supera el tamaño permitido.' : err.expose !== false && err.message ? err.message : 'Solicitud no válida.';
    return res.status(status).json({ error: msg });
  }
  // 429/503 de los proveedores de IA traen un mensaje pensado para el usuario
  if (status === 429 || status === 503) return res.status(status).json({ error: err.message || 'Servicio ocupado. Intenta más tarde.' });
  const incidente = crypto.randomBytes(4).toString('hex').toUpperCase();
  console.error(`[incidente ${incidente}] ${req.method} ${req.path}`, err);
  audit(req, 'error_servidor', req.path, { incidente });
  res.status(status).json({ error: `Ocurrió un error interno. Si se repite, escríbenos con el código ${incidente}.`, incidente });
}

// ---------------- Días hábiles en Colombia ----------------
// Festivos: fijos, trasladables al lunes (Ley 51 de 1983) y los que dependen de la Semana Santa
const ymd = (d) => d.toISOString().slice(0, 10);
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const nextMonday = (d) => { const w = d.getUTCDay(); return w === 1 ? d : addDays(d, (8 - w) % 7); };
const HOL = new Map();
export function festivos(y) {
  if (HOL.has(y)) return HOL.get(y);
  const D = (m, d) => new Date(Date.UTC(y, m - 1, d));
  const e = easter(y);
  const list = [D(1, 1), D(5, 1), D(7, 20), D(8, 7), D(12, 8), D(12, 25), addDays(e, -3), addDays(e, -2),
    ...[D(1, 6), D(3, 19), D(6, 29), D(8, 15), D(10, 12), D(11, 1), D(11, 11)].map(nextMonday),
    addDays(e, 43), addDays(e, 64), addDays(e, 71)];
  const s = new Set(list.map(ymd));
  HOL.set(y, s);
  return s;
}
export const esHabil = (d) => { const w = d.getUTCDay(); return w !== 0 && w !== 6 && !festivos(d.getUTCFullYear()).has(ymd(d)); };
// Suma n días hábiles a partir del día siguiente a la fecha dada (fecha de Bogotá)
export function sumarHabiles(fecha, n) {
  let d = new Date(Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10)));
  let k = 0;
  while (k < n) { d = addDays(d, 1); if (esHabil(d)) k++; }
  return ymd(d);
}
export function habilesEntre(desde, hasta) {
  let d = new Date(desde + 'T00:00:00Z'), k = 0;
  const end = new Date(hasta + 'T00:00:00Z');
  const sign = end >= d ? 1 : -1;
  while ((sign > 0 && d < end) || (sign < 0 && d > end)) { d = addDays(d, sign); if (esHabil(d)) k += sign; }
  return k;
}
export const hoyBogota = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);

// ---------------- Contactos: minimización ----------------
// Correos de servicios gratuitos suelen ser de una persona y no de la empresa: no se muestran
const WEBMAIL = /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|ymail|icloud|me|aol|protonmail|proton|gmx|zoho|mail)\.[a-z.]+$/i;
export const correoCorporativo = (m) => (m && !WEBMAIL.test(String(m).trim()) ? m : null);
let SUPP = null;
export const suppressed = () => SUPP || (SUPP = new Set(db.prepare('SELECT value FROM suppressions').all().map((r) => r.value)));
export const reloadSuppressions = () => { SUPP = null; };
// Quita los datos de contacto de un registro retirado (por NIT o por id) y los correos no corporativos
export function contacto(rec) {
  if (!rec) return rec;
  const s = suppressed();
  if ((rec.nit && s.has(String(rec.nit))) || (rec.id && s.has(String(rec.id)))) return { ...rec, tel: null, mail: null, web: null, retirado: true };
  return rec.mail ? { ...rec, mail: correoCorporativo(rec.mail) } : rec;
}
