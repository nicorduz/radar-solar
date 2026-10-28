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
