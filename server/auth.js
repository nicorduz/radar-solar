import crypto from 'node:crypto';
import { db } from './db.js';
import { config } from './config.js';

const SESSION_DAYS = 30;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [, s, h] = String(stored).split('$');
  if (!s || !h) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(hash, Buffer.from(h, 'hex'));
}

export function validateUsername(u) { return /^[a-zA-Z0-9._@-]{3,60}$/.test(u || ''); }
export function validatePassword(p) { return typeof p === 'string' && p.length >= 8 && p.length <= 200; }

// Rol efectivo: un usuario pago con fecha vencida pasa a prueba.
export function effectiveRole(u) {
  if (u.role === 'paid' && u.paid_until && new Date(u.paid_until + 'T23:59:59') < new Date()) return 'trial';
  return u.role;
}
export const publicUser = (u) => ({ id: u.id, username: u.username, role: effectiveRole(u), stored_role: u.role, name: u.name, company: u.company, paid_until: u.paid_until, profile: u.profile || 'todos' });

export function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const exp = new Date(Date.now() + SESSION_DAYS * 864e5).toISOString();
  db.prepare('INSERT INTO sessions(token,user_id,expires_at) VALUES(?,?,?)').run(token, userId, exp);
  db.prepare("UPDATE users SET last_login=datetime('now') WHERE id=?").run(userId);
  res.cookie('rs_session', token, { httpOnly: true, sameSite: 'lax', secure: config.secureCookies, maxAge: SESSION_DAYS * 864e5, path: '/' });
}
export function destroySession(req, res) {
  const t = req.cookies?.rs_session;
  if (t) db.prepare('DELETE FROM sessions WHERE token=?').run(t);
  res.clearCookie('rs_session', { path: '/' });
}

export function parseCookies(req, _res, next) {
  req.cookies = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  next();
}

export function loadUser(req, _res, next) {
  const t = req.cookies.rs_session;
  if (t) {
    const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token=? AND s.expires_at > ? AND u.active=1`).get(t, new Date().toISOString());
    if (row) { req.user = row; req.role = effectiveRole(row); }
  }
  next();
}
export const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Inicia sesión' }));
export const requireAdmin = (req, res, next) => (req.user && req.role === 'admin' ? next() : res.status(403).json({ error: 'Solo administradores' }));
export const isPaid = (req) => req.role === 'paid' || req.role === 'admin';

// Límite simple de intentos de login por IP
const attempts = new Map();
export function loginThrottle(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60e3);
  if (a.length >= 10) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
  a.push(now); attempts.set(ip, a);
  next();
}

export function ensureBootstrapAdmin() {
  const n = db.prepare("SELECT COUNT(*) c FROM users WHERE role='admin'").get().c;
  const { user, password } = config.bootstrapAdmin;
  if (n === 0 && user && password) {
    db.prepare("INSERT INTO users(username,pass_hash,role,name) VALUES(?,?,'admin','Administrador')").run(user, hashPassword(password));
    console.log(`Administrador inicial creado: ${user}`);
  } else if (n === 0) {
    console.warn('No hay administradores. Define ADMIN_USER y ADMIN_PASSWORD o usa: npm run admin -- crear <usuario> <contraseña> admin');
  }
  // Usuarios de demostración desde la variable SEED_USERS (útil en hostings gratuitos sin disco persistente,
  // donde la base se borra al reiniciar). Formato: usuario:clave:rol:perfil;usuario2:clave2:rol:perfil
  // rol = trial | paid | admin ; perfil = todos | instalador | proveedor | desarrollador | servicios | respaldo ; empresa (opcional, agrupa equipos). Solo crea los que no existan.
  for (const item of String(process.env.SEED_USERS || '').split(';').map((x) => x.trim()).filter(Boolean)) {
    const [u, p, role = 'trial', profile = 'todos', company = ''] = item.split(':').map((x) => x.trim());
    if (!u || !p || p.length < 8 || !['trial', 'paid', 'admin'].includes(role) || !['todos', 'instalador', 'proveedor', 'desarrollador', 'servicios', 'respaldo'].includes(profile)) {
      console.warn(`SEED_USERS: se omite "${u || '?'}" (revisa usuario, clave de 8+ caracteres, rol y perfil)`); continue;
    }
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(u)) continue;
    db.prepare('INSERT INTO users(username,pass_hash,role,profile,name,company) VALUES(?,?,?,?,?,?)').run(u, hashPassword(p), role, profile, u, company || null);
    console.log(`Usuario de demostración creado: ${u} (${role}, ${profile})`);
  }
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
}
