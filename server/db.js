import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { STORAGE } from './config.js';

export const db = new DatabaseSync(path.join(STORAGE, 'app.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'trial' CHECK (role IN ('trial','paid','admin')),
  name TEXT, company TEXT, phone TEXT, notes TEXT,
  paid_until TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, filename TEXT, kind TEXT, purpose TEXT NOT NULL DEFAULT 'ia',
  municipio TEXT, size INTEGER, chars INTEGER, status TEXT, uploaded_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS doc_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  idx INTEGER, text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  municipio TEXT NOT NULL, nombre TEXT NOT NULL, uso TEXT, unidades INTEGER, estrato TEXT,
  direccion TEXT, lat REAL, lon REAL, fecha TEXT, etapa TEXT, fuente TEXT, notas TEXT, doc_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS ai_usage (user_id INTEGER, day TEXT, n INTEGER, PRIMARY KEY (user_id, day));
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, status TEXT, log TEXT,
  started_at TEXT DEFAULT (datetime('now')), finished_at TEXT
);
`);

// Migración v2: perfil del usuario (instalador, proveedor, desarrollador o todos)
try { db.exec("ALTER TABLE users ADD COLUMN profile TEXT DEFAULT 'todos'"); } catch { /* ya existe */ }
// Registro de aceptación de los términos de la licencia de uso (fecha y versión del último ingreso)
try { db.exec('ALTER TABLE users ADD COLUMN terms_at TEXT'); } catch { /* ya existe */ }
try { db.exec('ALTER TABLE users ADD COLUMN terms_version TEXT'); } catch { /* ya existe */ }

// Marca de cada usuario (logo, colores y datos de contacto para sus propuestas)
db.exec('CREATE TABLE IF NOT EXISTS branding (user_id INTEGER PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT DEFAULT (datetime(\'now\')))');

export const getSetting = (k, def) => {
  const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k);
  return r ? JSON.parse(r.value) : def;
};
export const setSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, JSON.stringify(v));

// ---------------- Seguridad y privacidad (migración v3) ----------------
// Columnas nuevas: se agregan sin tocar los datos existentes
for (const sql of [
  'ALTER TABLE users ADD COLUMN mfa_secret TEXT',
  'ALTER TABLE users ADD COLUMN mfa_enabled INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN mfa_recovery TEXT',
  'ALTER TABLE users ADD COLUMN must_change_pw INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN pw_changed_at TEXT',
  'ALTER TABLE users ADD COLUMN plan_activated_at TEXT',
  'ALTER TABLE users ADD COLUMN plan_amount INTEGER',
  'ALTER TABLE users ADD COLUMN plan_invoice TEXT',
  'ALTER TABLE sessions ADD COLUMN created_at TEXT',
  'ALTER TABLE sessions ADD COLUMN last_seen TEXT',
  'ALTER TABLE sessions ADD COLUMN mfa INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE sessions ADD COLUMN ua TEXT',
]) { try { db.exec(sql); } catch { /* ya existe */ } }

db.exec(`
-- Evidencia de aceptación de términos y autorizaciones (una fila por acción del usuario)
CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('terminos','datos','publicidad')),
  version TEXT NOT NULL,
  granted INTEGER NOT NULL,
  text_hash TEXT,
  ip TEXT, ua TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS consents_user ON consents(user_id, kind, id);
-- Solicitudes de titulares (consultas y reclamos de la Ley 1581 de 2012)
CREATE TABLE IF NOT EXISTS rights_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  radicado TEXT UNIQUE NOT NULL,
  clase TEXT NOT NULL CHECK (clase IN ('consulta','reclamo')),
  tipo TEXT NOT NULL,
  nombre TEXT NOT NULL, correo TEXT NOT NULL, relacion TEXT, referencia TEXT, detalle TEXT NOT NULL,
  user_id INTEGER,
  status TEXT NOT NULL DEFAULT 'recibida',
  due_at TEXT NOT NULL, extended INTEGER NOT NULL DEFAULT 0, extension_reason TEXT,
  response TEXT, assigned_to INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT, closed_at TEXT
);
-- Registro de auditoría: accesos, cambios de permisos, exportaciones y eventos de seguridad (sin contraseñas ni tokens)
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  actor_id INTEGER, action TEXT NOT NULL, target TEXT, detail TEXT, ip TEXT
);
CREATE INDEX IF NOT EXISTS audit_at ON audit_log(at);
-- Enlaces de solo lectura: revocables y con vencimiento
CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, code TEXT NOT NULL, profile TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL, revoked_at TEXT
);
-- Contactos retirados por solicitud del titular o de la empresa (se ocultan en toda la plataforma)
CREATE TABLE IF NOT EXISTS suppressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, value TEXT UNIQUE NOT NULL, reason TEXT, request_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Límites de intentos y de consumo (persisten aunque el servidor se reinicie)
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
`);
