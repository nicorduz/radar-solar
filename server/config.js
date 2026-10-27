import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Carga .env si existe (sin dependencias)
const envFile = path.resolve('.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const e = process.env;
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const STORAGE = path.resolve(e.DATA_DIR || path.join(ROOT, 'storage'));
fs.mkdirSync(STORAGE, { recursive: true });

function secret() {
  if (e.SESSION_SECRET) return e.SESSION_SECRET;
  const f = path.join(STORAGE, '.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'));
  return fs.readFileSync(f, 'utf8');
}

export const config = {
  port: +(e.PORT || 3000),
  secret: secret(),
  appName: e.APP_NAME || 'Radar Solar',
  contact: { whatsapp: e.CONTACT_WHATSAPP || '', email: e.CONTACT_EMAIL || '' },
  bootstrapAdmin: { user: e.ADMIN_USER || '', password: e.ADMIN_PASSWORD || '' },
  ai: {
    provider: (e.AI_PROVIDER || (e.XAI_API_KEY ? 'xai' : e.GEMINI_API_KEY ? 'gemini' : e.GROQ_API_KEY ? 'groq' : e.OPENAI_API_KEY ? 'openai' : 'none')).toLowerCase(),
    gemini: { key: e.GEMINI_API_KEY, model: e.GEMINI_MODEL || 'gemini-2.5-flash' },
    xai: { key: e.XAI_API_KEY, model: e.XAI_MODEL || '' },
    groq: { key: e.GROQ_API_KEY, model: e.GROQ_MODEL || 'llama-3.3-70b-versatile' },
    openai: { key: e.OPENAI_API_KEY, model: e.OPENAI_MODEL || 'gpt-4o-mini', base: e.OPENAI_BASE_URL || 'https://api.openai.com/v1' },
    dailyTrial: +(e.AI_DAILY_TRIAL || 3),
    dailyPaid: +(e.AI_DAILY_PAID || 150),
  },
  capexKwp: +(e.CAPEX_COP_KWP || 3800000),
  secureCookies: e.SECURE_COOKIES ? e.SECURE_COOKIES === '1' : e.NODE_ENV === 'production',
};
