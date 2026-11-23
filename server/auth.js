import crypto from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';
import * as OTPAuth from 'otpauth';
import { db } from './db.js';
import { config } from './config.js';
import { hit, peek, clearHits, ipOf, uaShort, audit } from './security.js';
import { needsConsent } from './privacy.js';

// Duración de las sesiones: 14 días como máximo y 7 días sin uso; administradores, 12 horas
const SESSION_DAYS = 14, IDLE_DAYS = 7, ADMIN_HOURS = 12;
// Cookie con prefijo __Host- en producción: solo HTTPS, sin dominio y en la raíz
const COOKIE = config.secureCookies ? '__Host-rs' : 'rs_session';
const MFA_COOKIE = config.secureCookies ? '__Host-rs_mfa' : 'rs_mfa';

// ---------------- Contraseñas ----------------
// Argon2id (parámetros por defecto de la librería: 19 MiB, 2 iteraciones, 1 hilo, los mínimos que recomienda OWASP).
// Las contraseñas anteriores en scrypt se siguen aceptando y se convierten a Argon2id al ingresar.
export const hashPassword = (pw) => argonHash(pw);
export async function verifyPassword(pw, stored) {
  const s = String(stored || '');
  if (s.startsWith('$argon2')) { try { return await argonVerify(s, pw); } catch { return false; } }
  const [kind, salt, h] = s.split('$');
  if (kind !== 'scrypt' || !salt || !h) return false;
  const calc = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(calc, Buffer.from(h, 'hex'));
}
// Hash de relleno para que un usuario inexistente tarde lo mismo que uno real
let DUMMY = null;
const dummy = async () => DUMMY || (DUMMY = await argonHash(crypto.randomBytes(16).toString('hex')));

export function validateUsername(u) { return /^[a-zA-Z0-9._@-]{3,60}$/.test(u || ''); }
// Política: mínimo 15 caracteres, hasta 128, cualquier carácter (se permiten frases, espacios y gestores de contraseñas)
export const PW_MIN = 15, PW_MAX = 128;
export function passwordProblem(p, username) {
  if (typeof p !== 'string' || p.length < PW_MIN) return `La contraseña debe tener al menos ${PW_MIN} caracteres. Puedes usar una frase.`;
  if (p.length > PW_MAX) return `La contraseña puede tener hasta ${PW_MAX} caracteres.`;
  if (username && p.toLowerCase().includes(String(username).toLowerCase())) return 'La contraseña no puede contener el nombre de usuario.';
  if (/^(.)\1+$/.test(p) || /^(0123456789|1234567890|abcdefghij)/i.test(p)) return 'Elige una contraseña menos predecible.';
  return null;
}
export const validatePassword = (p, u) => !passwordProblem(p, u);

// Rol efectivo: un usuario pago con fecha vencida pasa a prueba.
export function effectiveRole(u) {
  if (u.role === 'paid' && u.paid_until && new Date(u.paid_until + 'T23:59:59') < new Date()) return 'trial';
  return u.role;
}
export const publicUser = (u, s = {}) => ({
  id: u.id, username: u.username, role: s.role || effectiveRole(u), stored_role: u.role, name: u.name, company: u.company, paid_until: u.paid_until,
  profile: u.profile || 'todos', must_change_pw: !!u.must_change_pw, mfa_enabled: !!u.mfa_enabled, mfa_needed: u.role === 'admin' && !s.mfa,
  plan: { activado: u.plan_activated_at, valor: u.plan_amount, factura: u.plan_invoice },
});

// ---------------- Sesiones ----------------
export function createSession(req, res, userId, { mfa = 0, admin = false } = {}) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ms = admin ? ADMIN_HOURS * 3600e3 : SESSION_DAYS * 864e5;
  const now = new Date().toISOString();
  db.prepare('INSERT INTO sessions(token,user_id,expires_at,created_at,last_seen,mfa,ua) VALUES(?,?,?,?,?,?,?)')
    .run(sha(token), userId, new Date(Date.now() + ms).toISOString(), now, now, mfa ? 1 : 0, uaShort(req));
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(userId);
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: config.secureCookies, maxAge: ms, path: '/' });
}
// En la base solo se guarda el hash del token: una copia de la base no permite suplantar sesiones
const sha = (t) => crypto.createHash('sha256').update(t).digest('base64url');
export function destroySession(req, res) {
  const t = req.cookies?.[COOKIE];
  if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(sha(t));
  res.clearCookie(COOKIE, { path: '/', sameSite: 'strict', secure: config.secureCookies, httpOnly: true });
}
export const destroyOtherSessions = (req, userId) => db.prepare('DELETE FROM sessions WHERE user_id=? AND token<>?').run(userId, sha(req.cookies?.[COOKIE] || ''));
export const listSessions = (req, userId) => db.prepare('SELECT token, created_at, last_seen, ua, mfa FROM sessions WHERE user_id=? AND expires_at > ? ORDER BY last_seen DESC')
  .all(userId, new Date().toISOString()).map((s) => ({ id: s.token.slice(0, 10), actual: s.token === sha(req.cookies?.[COOKIE] || ''), desde: s.created_at, uso: s.last_seen, dispositivo: s.ua }));
export const revokeSession = (userId, id) => db.prepare('DELETE FROM sessions WHERE user_id=? AND substr(token,1,10)=?').run(userId, String(id).slice(0, 10));

export function parseCookies(req, _res, next) {
  req.cookies = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) { try { req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* cookie malformada */ } }
  }
  next();
}

export function loadUser(req, _res, next) {
  const t = req.cookies[COOKIE];
  if (t) {
    const nowIso = new Date().toISOString();
    const row = db.prepare(`SELECT u.*, s.token s_token, s.last_seen s_last, s.mfa s_mfa FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token=? AND s.expires_at > ? AND u.active=1`).get(sha(t), nowIso);
    if (row && (!row.s_last || Date.now() - new Date(row.s_last).getTime() < IDLE_DAYS * 864e5)) {
      req.user = row;
      req.session = { mfa: !!row.s_mfa };
      // Un administrador sin segundo factor en esta sesión navega como usuario de pago hasta completarlo
      const r = effectiveRole(row);
      req.role = r === 'admin' && !row.s_mfa ? 'paid' : r;
      req.session.role = req.role;
      if (!row.s_last || Date.now() - new Date(row.s_last).getTime() > 5 * 60e3) db.prepare('UPDATE sessions SET last_seen=? WHERE token=?').run(nowIso, row.s_token);
    } else if (row) db.prepare('DELETE FROM sessions WHERE token=?').run(row.s_token);
  }
  next();
}
// Rutas que un usuario con cambio de contraseña pendiente o MFA pendiente todavía puede usar
const OPEN = /^\/api\/(me(\/(password|sessions(\/.*)?|consents|plan))?|logout|mfa\/[a-z-]+|legal(\/[a-z]+)?|consents|derechos(\/[a-z]+)?|config|recuperar-acceso)$/;
export const requireUser = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'Inicia sesión' });
  const open = OPEN.test(req.originalUrl.split('?')[0]);
  if (req.user.must_change_pw && !open) return res.status(403).json({ error: 'Debes cambiar tu contraseña antes de continuar.', code: 'must_change_pw' });
  // Sin la aceptación vigente de términos y autorización de datos no se entregan datos de la plataforma
  if (!open && needsConsent(req.user.id)) return res.status(428).json({ error: 'Acepta los términos vigentes para continuar.', code: 'consent_required' });
  next();
};
export const requireAdmin = (req, res, next) => {
  if (req.user && effectiveRole(req.user) === 'admin' && !req.session?.mfa) return res.status(403).json({ error: 'Activa la verificación en dos pasos para entrar a la administración.', code: 'mfa_required' });
  return req.user && req.role === 'admin' ? next() : res.status(403).json({ error: 'Solo administradores' });
};
export const isPaid = (req) => req.role === 'paid' || req.role === 'admin';

// ---------------- Ingreso con límites por IP y por cuenta ----------------
// Respuesta genérica (no revela si el usuario existe) y demoras crecientes sin bloqueo permanente
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function login(req, res) {
  const username = String(req.body?.username || '').trim().slice(0, 60);
  const password = String(req.body?.password || '').slice(0, PW_MAX + 1);
  const ipKey = `login_ip:${ipOf(req)}`, accKey = `login_acc:${username.toLowerCase()}`;
  const ipHit = hit(ipKey, 30, 15 * 60);
  if (!ipHit.ok) { res.setHeader('Retry-After', String(ipHit.retry)); return res.status(429).json({ error: 'Demasiados intentos desde esta conexión. Espera unos minutos.' }); }
  const fails = peek(accKey, 30 * 60);
  if (fails >= 5) await sleep(Math.min(8000, 500 * 2 ** (fails - 5)));
  if (fails >= 10) return res.status(429).json({ error: 'Demasiados intentos para este usuario. Espera 30 minutos o pide ayuda al administrador.' });
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(username);
  const ok = u && u.active ? await verifyPassword(password, u.pass_hash) : (await argonVerify(await dummy(), password).catch(() => false), false);
  if (!ok) {
    hit(accKey, 1000, 30 * 60);
    audit(req, 'login_fallido', u ? `user:${u.id}` : 'usuario_desconocido');
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  clearHits(accKey);
  // Migración transparente del hash y aviso de contraseña corta
  if (!u.pass_hash.startsWith('$argon2')) db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(await hashPassword(password), u.id);
  if (password.length < PW_MIN && !u.must_change_pw) { db.prepare('UPDATE users SET must_change_pw=1 WHERE id=?').run(u.id); u.must_change_pw = 1; }
  // Administradores con segundo factor: se pide el código antes de crear la sesión
  if (u.role === 'admin' && u.mfa_enabled) {
    const pend = crypto.randomBytes(24).toString('base64url');
    db.prepare('INSERT INTO rate_limits(key,window_start,count) VALUES(?,?,0)').run(`mfa_pend:${sha(pend)}|${u.id}`, Math.floor(Date.now() / 1000));
    res.cookie(MFA_COOKIE, pend, { httpOnly: true, sameSite: 'strict', secure: config.secureCookies, maxAge: 5 * 60e3, path: '/api/' });
    audit(req, 'login_paso1', `user:${u.id}`, null, u.id);
    return res.json({ mfa_required: true });
  }
  createSession(req, res, u.id, { admin: u.role === 'admin' });
  audit(req, 'login', `user:${u.id}`, null, u.id);
  res.json({ user: publicUser(u, { role: u.role === 'admin' ? 'paid' : undefined, mfa: false }) });
}

// ---------------- Segundo factor (TOTP, RFC 6238) para administradores ----------------
const totpFor = (u, secret) => new OTPAuth.TOTP({ issuer: config.appName, label: u.username, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
const checkTotp = (u, secret, code) => /^\d{6}$/.test(code) && totpFor(u, secret).validate({ token: code, window: 1 }) !== null;
async function useRecovery(u, code) {
  const list = JSON.parse(u.mfa_recovery || '[]');
  const clean = String(code).replace(/[^a-z0-9]/gi, '').toLowerCase();
  if (clean.length !== 12) return false;
  for (let i = 0; i < list.length; i++) {
    if (await argonVerify(list[i], clean).catch(() => false)) {
      list.splice(i, 1);
      db.prepare('UPDATE users SET mfa_recovery=? WHERE id=?').run(JSON.stringify(list), u.id);
      return true;
    }
  }
  return false;
}
export async function loginMfa(req, res) {
  const pend = req.cookies[MFA_COOKIE];
  const pref = pend ? `mfa_pend:${sha(pend)}|` : null;
  const row = pref && db.prepare('SELECT key, window_start, count FROM rate_limits WHERE substr(key,1,?)=?').get(pref.length, pref);
  if (!row || Date.now() / 1000 - row.window_start > 300) return res.status(401).json({ error: 'La verificación venció. Ingresa de nuevo con tu usuario y contraseña.' });
  if (row.count >= 5) { db.prepare('DELETE FROM rate_limits WHERE key=?').run(row.key); return res.status(429).json({ error: 'Demasiados códigos incorrectos. Ingresa de nuevo.' }); }
  const u = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(+row.key.split('|').pop());
  if (!u || !u.mfa_enabled) return res.status(401).json({ error: 'Ingresa de nuevo.' });
  const code = String(req.body?.code || '').trim();
  const ok = checkTotp(u, u.mfa_secret, code.replace(/\s/g, '')) || (await useRecovery(u, code));
  if (!ok) {
    db.prepare('UPDATE rate_limits SET count=count+1 WHERE key=?').run(row.key);
    audit(req, 'mfa_fallido', `user:${u.id}`, null, u.id);
    return res.status(401).json({ error: 'Código incorrecto.' });
  }
  db.prepare('DELETE FROM rate_limits WHERE key=?').run(row.key);
  res.clearCookie(MFA_COOKIE, { path: '/api/' });
  createSession(req, res, u.id, { mfa: 1, admin: true });
  audit(req, 'login', `user:${u.id}`, { mfa: true }, u.id);
  res.json({ user: publicUser(u, { mfa: true }) });
}
// Activación: la contraseña se confirma de nuevo y el secreto queda pendiente hasta validar un código
export async function mfaSetup(req, res) {
  const u = req.user;
  if (u.role !== 'admin') return res.status(403).json({ error: 'Solo administradores' });
  if (u.mfa_enabled) return res.status(400).json({ error: 'La verificación en dos pasos ya está activa.' });
  if (!(await verifyPassword(String(req.body?.password || ''), u.pass_hash))) return res.status(400).json({ error: 'La contraseña no coincide.' });
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  db.prepare('UPDATE users SET mfa_secret=? WHERE id=?').run(secret, u.id);
  const uri = totpFor(u, secret).toString();
  const { default: QR } = await import('qrcode');
  res.json({ uri, secret, qr: await QR.toString(uri, { type: 'svg', margin: 1 }) });
}
export async function mfaEnable(req, res) {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (u.role !== 'admin' || u.mfa_enabled || !u.mfa_secret) return res.status(400).json({ error: 'Primero genera el código QR.' });
  const h = hit(`mfa_setup:${u.id}`, 8, 15 * 60);
  if (!h.ok) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  if (!checkTotp(u, u.mfa_secret, String(req.body?.code || '').replace(/\s/g, ''))) return res.status(400).json({ error: 'El código no coincide. Revisa la hora de tu teléfono y escribe el código actual.' });
  // Códigos de recuperación de un solo uso: se muestran una vez y se guardan con Argon2id
  const codes = Array.from({ length: 10 }, () => crypto.randomBytes(9).toString('base64url').replace(/[^a-z0-9]/gi, '').toLowerCase().padEnd(12, '7').slice(0, 12));
  const hashes = await Promise.all(codes.map((c) => argonHash(c)));
  db.prepare('UPDATE users SET mfa_enabled=1, mfa_recovery=? WHERE id=?').run(JSON.stringify(hashes), u.id);
  // La sesión actual queda verificada; las demás sesiones del administrador se cierran
  db.prepare('UPDATE sessions SET mfa=1 WHERE token=?').run(sha(req.cookies[COOKIE]));
  destroyOtherSessions(req, u.id);
  audit(req, 'mfa_activado', `user:${u.id}`);
  res.json({ ok: true, recovery: codes.map((c) => c.replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3')) });
}
// Para un administrador que ya tiene MFA pero cuya sesión no está verificada (por ejemplo, tras un reinicio)
export async function mfaVerifySession(req, res) {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (u.role !== 'admin' || !u.mfa_enabled) return res.status(400).json({ error: 'No aplica.' });
  const h = hit(`mfa_sess:${u.id}`, 5, 15 * 60);
  if (!h.ok) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  const code = String(req.body?.code || '').trim();
  if (!(checkTotp(u, u.mfa_secret, code.replace(/\s/g, '')) || (await useRecovery(u, code)))) { audit(req, 'mfa_fallido', `user:${u.id}`); return res.status(401).json({ error: 'Código incorrecto.' }); }
  db.prepare('UPDATE sessions SET mfa=1 WHERE token=?').run(sha(req.cookies[COOKIE]));
  audit(req, 'mfa_sesion', `user:${u.id}`);
  res.json({ ok: true });
}

export async function ensureBootstrapAdmin() {
  const n = db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c;
  const { user, password } = config.bootstrapAdmin;
  if (n === 0 && user && password) {
    db.prepare("INSERT INTO users(username,pass_hash,role,name,must_change_pw) VALUES(?,?,'admin','Administrador',?)").run(user, await hashPassword(password), password.length < PW_MIN ? 1 : 0);
    console.log(`Administrador inicial creado: ${user}`);
  } else if (n === 0) {
    console.warn('No hay administradores. Define ADMIN_USER y ADMIN_PASSWORD o usa: npm run admin -- crear <usuario> <contraseña> admin');
  }
  // Reinicio de emergencia: con ADMIN_RESET=1 el usuario ADMIN_USER vuelve a entrar con ADMIN_PASSWORD.
  // Se desbloquea, se cierra toda sesión abierta, se reinicia la verificación en dos pasos y se pide
  // cambiar la contraseña al ingresar. Quien controla las variables del servidor ya controla todo el sistema.
  if (process.env.ADMIN_RESET === '1' && user && password) {
    const ex = db.prepare('SELECT id FROM users WHERE username=?').get(user);
    const h = await hashPassword(password);
    if (ex) db.prepare("UPDATE users SET pass_hash=?, role='admin', active=1, must_change_pw=1, mfa_enabled=0, mfa_secret=NULL, mfa_recovery=NULL WHERE id=?").run(h, ex.id);
    else db.prepare("INSERT INTO users(username,pass_hash,role,name,must_change_pw) VALUES(?,?,'admin','Administrador',1)").run(user, h);
    db.prepare('DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username=?)').run(user);
    db.prepare('DELETE FROM rate_limits WHERE key=?').run(`login_acc:${user.toLowerCase()}`);
    console.warn(`ADMIN_RESET: el administrador "${user}" puede ingresar con ADMIN_PASSWORD y deberá cambiarla. Quita ADMIN_RESET de las variables apenas ingreses.`);
  }
  // Usuarios de demostración desde la variable SEED_USERS (útil en hostings sin disco persistente,
  // donde la base se borra al reiniciar). Formato: usuario:clave:rol:perfil:empresa;usuario2:...
  for (const item of String(process.env.SEED_USERS || '').split(';').map((x) => x.trim()).filter(Boolean)) {
    const [u, p, role = 'trial', profile = 'todos', company = ''] = item.split(':').map((x) => x.trim());
    if (!u || !p || p.length < 8 || !['trial', 'paid', 'admin'].includes(role) || !['todos', 'instalador', 'proveedor', 'desarrollador', 'servicios', 'demanda'].includes(profile)) {
      console.warn(`SEED_USERS: se omite "${u || '?'}" (revisa usuario, clave, rol y perfil)`); continue;
    }
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(u)) continue;
    if (p.length < PW_MIN) console.warn(`SEED_USERS: la clave de "${u}" tiene menos de ${PW_MIN} caracteres; se le pedirá cambiarla al ingresar.`);
    db.prepare('INSERT INTO users(username,pass_hash,role,profile,name,company,must_change_pw) VALUES(?,?,?,?,?,?,?)').run(u, await hashPassword(p), role, profile, u, company || null, p.length < PW_MIN ? 1 : 0);
    console.log(`Usuario de demostración creado: ${u} (${role}, ${profile})`);
  }
  // Segundo factor de administradores en hostings sin disco: ADMIN_MFA_SECRETS=usuario:SECRETOBASE32;...
  for (const item of String(process.env.ADMIN_MFA_SECRETS || '').split(';').map((x) => x.trim()).filter(Boolean)) {
    const [u, secret] = item.split(':').map((x) => x.trim());
    if (u && /^[A-Z2-7]{16,}$/.test(secret || '')) db.prepare("UPDATE users SET mfa_secret=?, mfa_enabled=1 WHERE username=? AND role='admin' AND mfa_enabled=0").run(secret, u);
  }
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}

// Contraseña temporal para devolver el acceso (la entrega el administrador por un canal distinto)
export async function resetToTemporary(userId) {
  const b = crypto.randomBytes(12).toString('base64url').replace(/[-_]/g, 'x').toLowerCase().slice(0, 16);
  const temp = b.match(/.{4}/g).join('-');
  const u = db.prepare('SELECT username FROM users WHERE id=?').get(userId);
  if (!u) return null;
  db.prepare('UPDATE users SET pass_hash=?, must_change_pw=1, active=1 WHERE id=?').run(await hashPassword(temp), userId);
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
  db.prepare('DELETE FROM rate_limits WHERE key=?').run(`login_acc:${u.username.toLowerCase()}`);
  return temp;
}
