import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { config, ROOT, STORAGE } from './config.js';
import { db, getSetting, setSetting } from './db.js';
import {
  parseCookies, loadUser, requireUser, requireAdmin, isPaid, loginThrottle, hashPassword, verifyPassword,
  createSession, destroySession, publicUser, validateUsername, validatePassword, ensureBootstrapAdmin,
} from './auth.js';
import { store, loadData, scored, parseQuery, rowView, payback, dptoScores, projectsFor, SEGMENTS, PROFILES, PROFILE_KEYS, defaultWeights, allowedProfiles, tier } from './data.js';
import { complete, aiInfo, parseJSONLoose } from './ai.js';
import { UPLOADS, fileToText, tableFromFile, saveDocText, searchChunks } from './docs.js';
import { RAW, ensureRaw, refreshSources, startJob, rebuild, SOURCES, EXTRA_SOURCES, isRunning } from './refresh.js';

ensureBootstrapAdmin();
loadData();
// Si el volumen tiene una base de una versión anterior de la app, se agregan las fuentes nuevas y se reconstruye
if ((store.meta.schema || 1) < 2) {
  ensureRaw();
  try { startJob('reconstruir', rebuild); console.log('Base de versión anterior: reconstruyendo con las fuentes nuevas…'); } catch (e) { console.error(e.message); }
}

const TERMS_VERSION = '2026-11';
const isAdmin = (req) => req.role === 'admin';
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use(parseCookies, loadUser);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Protección CSRF básica: las peticiones que cambian estado deben venir del mismo origen
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.path.startsWith('/api/')) {
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return res.status(403).json({ error: 'Origen no permitido' });
  }
  next();
});

const upload = multer({ dest: path.join(STORAGE, 'tmp'), limits: { fileSize: 40 * 1024 * 1024 } });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ---------------- Sesión ----------------
app.get('/api/config', (req, res) => res.json({ appName: config.appName, contact: config.contact, ai: aiInfo().configured }));

app.post('/api/login', loginThrottle, (req, res) => {
  const { username, password } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE username=?').get(String(username || '').trim());
  if (!u || !u.active || !verifyPassword(String(password || ''), u.pass_hash)) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  createSession(res, u.id);
  // El ingreso implica aceptar los términos de la licencia (se muestran en la pantalla de ingreso)
  db.prepare("UPDATE users SET terms_at=datetime('now'), terms_version=? WHERE id=?").run(TERMS_VERSION, u.id);
  res.json({ user: publicUser(u) });
});
app.post('/api/logout', (req, res) => { destroySession(req, res); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ user: req.user ? publicUser(req.user) : null }));
app.post('/api/me/password', requireUser, (req, res) => {
  const { current, next: nw } = req.body || {};
  if (!verifyPassword(String(current || ''), req.user.pass_hash)) return res.status(400).json({ error: 'La contraseña actual no coincide' });
  if (!validatePassword(nw)) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(hashPassword(nw), req.user.id);
  res.json({ ok: true });
});

// ---------------- Datos ----------------
app.get('/api/meta', requireUser, (req, res) => {
  const m = store.meta;
  res.json({
    role: req.role, paid: isPaid(req), admin: isAdmin(req), ci_anio: store.ciAnio,
    segments: Object.fromEntries(Object.entries(SEGMENTS).map(([k, v]) => [k, v.label])),
    profiles: Object.fromEntries(allowedProfiles(req.user).map((k) => { const P = PROFILES[k]; return [k, { label: P.label, short: P.short, desc: P.desc, segments: P.segments, metrics: P.metrics, weights: defaultWeights(k), factors: Object.fromEntries(Object.entries(P.factors).map(([f, v]) => [f, v.label])) }]; })),
    cortes: { upme: m.upme_corte, generado: m.generado, elic: m.elic_corte, snr: m.snr_corte, sui: m.sui_periodo, agpe_xm: m.agpe_xm_fecha, dna: m.dna_periodo },
    totals: { municipios: store.municipios.length, secop: m.secop_n, empresas: store.empresas.length, agpe: m.agpe_zonas ? Object.values(m.agpe_zonas).reduce((a, z) => a + z.n, 0) : m.agpe_n, clientes: store.clientes.length, ci: store.ci.length, plantas: m.red_n?.plantas, subs: m.red_n?.subs },
    tarifas: m.tarifas, capex_kwp: getSetting('capex_kwp', config.capexKwp),
    ors: [...new Set(store.municipios.map((x) => x.or_name))].sort(),
    dptos: [...new Set(store.municipios.map((x) => x.dpto))].sort(),
  });
});

app.get('/api/map', requireUser, (req, res) => {
  const { profile, weights, segment } = parseQuery(req.query, req.user, isPaid(req));
  const sc = scored(profile, weights, segment);
  if (!isPaid(req)) {
    const top = store.byCode.get(sc.rows[0].code);
    return res.json({ mode: 'dpto', items: dptoScores(sc), top: { ...rowView(top, sc.rows[0]) } });
  }
  res.json({
    mode: 'municipio',
    items: sc.rows.map((r) => { const v = rowView(store.byCode.get(r.code), r); delete v.comp; return v; }),
  });
});

app.get('/api/ranking', requireUser, (req, res) => {
  const paid = isPaid(req);
  const { profile, weights, segment } = parseQuery(req.query, req.user, paid);
  const sc = scored(profile, weights, segment);
  let rows = sc.rows.map((r) => rowView(store.byCode.get(r.code), r));
  if (paid) {
    const { dpto, or, q, minPop } = req.query;
    if (dpto) rows = rows.filter((r) => r.dpto === dpto);
    if (or) rows = rows.filter((r) => r.or === or);
    if (minPop) rows = rows.filter((r) => (r.pop || 0) >= +minPop);
    // Filtro de sitios para desarrolladores: distancia a subestación, radiación y tensión disponible
    if (req.query.maxSubKm) rows = rows.filter((r) => r.sub_km != null && r.sub_km <= +req.query.maxSubKm);
    if (req.query.minGhi) rows = rows.filter((r) => (r.ghi || 0) >= +req.query.minGhi);
    if (req.query.minKv) rows = rows.filter((r) => (store.byCode.get(r.code)?.kv30 || 0) >= +req.query.minKv);
    if (q) { const n = norm(q); rows = rows.filter((r) => norm(r.name).includes(n) || norm(r.dpto).includes(n)); }
    const limit = Math.min(+req.query.limit || 100, 1200);
    return res.json({ total: rows.length, rows: rows.slice(0, limit), locked: false });
  }
  res.json({ total: rows.length, rows: rows.slice(0, 1), locked: true, hidden: Math.min(rows.length - 1, 24) });
});

app.get('/api/municipio/:code', requireUser, (req, res) => {
  const m = store.byCode.get(req.params.code);
  if (!m) return res.status(404).json({ error: 'Municipio no encontrado' });
  const { profile, weights, segment } = parseQuery(req.query, req.user, isPaid(req));
  const sc = scored(profile, weights, segment);
  const r = sc.byCode.get(m.code) || { rank: null, score: null, comp: {} };
  if (!isPaid(req) && r.rank !== 1) {
    return res.status(402).json({ locked: true, basic: { code: m.code, name: m.name, dpto: m.dpto, or: m.or_name } });
  }
  const secopLocal = store.secop.filter((s) => s.code === m.code).slice(0, 30);
  const secopDpto = secopLocal.length ? [] : store.secop.filter((s) => norm(s.dpto) === norm(m.dpto)).slice(0, 15);
  const t = store.meta.tarifas?.[m.or_key] || {};
  res.json({
    ...m, rank: r.rank, score: r.score, comp: r.comp, tier: r.score != null ? tier(r.score) : null, total_rank: sc.rows.length,
    payback: payback(m), tarifa_info: t, proyectos: projectsFor(m.code).slice(0, 60).map((p) => (isAdmin(req) ? p : { ...p, fuente: undefined, origen: undefined })),
    ci: isPaid(req) ? store.ci.filter((e) => e.code === m.code).slice(0, 12) : [], ci_n: store.ci.filter((e) => e.code === m.code).length,
    secop: secopLocal, secop_dpto: secopDpto,
    docs: db.prepare("SELECT id,title,created_at FROM documents WHERE municipio=? AND purpose='ia'").all(m.code),
    clientes: store.clientes.filter((c) => c.code === m.code).slice(0, isPaid(req) ? 15 : 1).map((c) => (isPaid(req) ? c : { ...c, tel: null, mail: null, dir: null })),
    clientes_n: store.clientes.filter((c) => c.code === m.code).length,
    ...localInstallers(m, isPaid(req)),
    plantas: store.red.plantas.filter((p) => p.tipo === 'solar' && m.lat && kmBetween(m, p) <= 30).sort((a, b) => b.mw - a.mw).slice(0, 12),
    upme: (store.red.upme || []).filter((p) => p.code === m.code || (p.lat && m.lat && kmBetween(m, p) <= 30)).map((p) => ({ ...p, km: p.code === m.code ? 0 : Math.round(kmBetween(m, p)) })).sort((a, b) => a.km - b.km),
    dna_serie: store.meta.dna_subareas?.['SUBAREA ' + m.subarea]?.mes || null,
    agpe_zona: m.agpe_zone ? store.meta.agpe_zonas?.[m.agpe_zone] : null,
    profile,
  });
});

app.get('/api/licitaciones', requireUser, (req, res) => {
  let rows = store.secop;
  const { q, dpto, estado } = req.query;
  if (dpto) rows = rows.filter((s) => norm(s.dpto) === norm(dpto));
  if (estado === 'abiertos') rows = rows.filter((s) => /presentaci|abierto|publicad|borrador/i.test(s.estado || '') && !s.adjudicado);
  if (estado === 'adjudicados') rows = rows.filter((s) => s.adjudicado);
  if (q) { const n = norm(q); rows = rows.filter((s) => norm(`${s.nombre} ${s.entidad} ${s.ciudad} ${s.desc}`).includes(n)); }
  const page = Math.max(0, +req.query.page || 0);
  if (!isPaid(req)) return res.json({ total: rows.length, rows: rows.slice(0, 1), locked: true });
  res.json({ total: rows.length, rows: rows.slice(page * 50, page * 50 + 50), locked: false });
});

app.get('/api/empresas', requireUser, (req, res) => {
  let rows = store.empresas;
  const { q, cat, dpto, code, solar, contacto } = req.query;
  if (cat) rows = rows.filter((e) => e.cat === cat);
  if (code) rows = rows.filter((e) => e.code === code);
  else if (dpto) rows = rows.filter((e) => e.code && store.byCode.get(e.code)?.dpto === dpto);
  if (solar) rows = rows.filter((e) => e.sol_n);
  if (contacto) rows = rows.filter((e) => e.tel || e.mail);
  if (q) { const n = norm(q); rows = rows.filter((e) => norm(e.n).includes(n) || e.nit === q); }
  const cats = {};
  for (const e of rows) cats[e.cat] = (cats[e.cat] || 0) + 1;
  rows = [...rows].sort((a, b) => (b.sol_n || 0) - (a.sol_n || 0) || (b.tel || b.mail ? 1 : 0) - (a.tel || a.mail ? 1 : 0));
  const view = (e) => ({ ...e, ubic: e.code ? `${store.byCode.get(e.code)?.name}, ${store.byCode.get(e.code)?.dpto}` : e.cam });
  const page = Math.max(0, +req.query.page || 0);
  if (!isPaid(req)) return res.json({ total: rows.length, cats, rows: rows.slice(0, 1).map((e) => ({ ...view(e), tel: null, mail: null })), locked: true });
  res.json({ total: rows.length, cats, rows: rows.slice(page * 50, page * 50 + 50).map(view), locked: false });
});

// Clientes potenciales: alojamientos y parques del Registro Nacional de Turismo
app.get('/api/clientes', requireUser, (req, res) => {
  let rows = store.clientes;
  const { q, code, dpto, cat, minHab } = req.query;
  if (code) rows = rows.filter((c) => c.code === code);
  else if (dpto) rows = rows.filter((c) => store.byCode.get(c.code)?.dpto === dpto);
  if (cat) rows = rows.filter((c) => c.cat === cat);
  if (minHab) rows = rows.filter((c) => c.hab >= +minHab);
  if (q) { const n = norm(q); rows = rows.filter((c) => norm(c.n).includes(n) || norm(c.sub).includes(n)); }
  const view = (c) => { const m = store.byCode.get(c.code); return { ...c, mun: m?.name, dpto: m?.dpto, tarifa: m?.tarifa, ghi: m?.ghi }; };
  const page = Math.max(0, +req.query.page || 0);
  if (!isPaid(req)) return res.json({ total: rows.length, rows: rows.slice(0, 1).map((c) => ({ ...view(c), tel: null, mail: null, dir: null })), locked: true });
  res.json({ total: rows.length, rows: rows.slice(page * 50, page * 50 + 50).map(view), locked: false });
});

// Empresas grandes del país (clientes comerciales e industriales)
app.get('/api/ci', requireUser, (req, res) => {
  let rows = store.ci;
  const { q, code, dpto, sector, consumo, contacto, minIng } = req.query;
  if (code) rows = rows.filter((e) => e.code === code);
  else if (dpto) rows = rows.filter((e) => store.byCode.get(e.code)?.dpto === dpto);
  if (sector) rows = rows.filter((e) => e.sector === sector);
  if (consumo) rows = rows.filter((e) => e.consumo === consumo);
  if (contacto) rows = rows.filter((e) => e.tel || e.mail);
  if (minIng) rows = rows.filter((e) => (e.ing || 0) >= +minIng);
  if (q) { const n = norm(q); rows = rows.filter((e) => norm(e.n).includes(n) || e.nit === q); }
  const sectores = {};
  for (const e of store.ci) sectores[e.sector] = (sectores[e.sector] || 0) + 1;
  const view = (e) => { const m = store.byCode.get(e.code); return { ...e, mun: m?.name || e.ciudad, dpto: m?.dpto, tarifa_com: m?.tarifa_com ?? m?.tarifa, ghi: m?.ghi }; };
  const page = Math.max(0, +req.query.page || 0);
  if (!isPaid(req)) return res.json({ total: rows.length, sectores, anio: store.ciAnio, rows: rows.slice(0, 1).map((e) => ({ ...view(e), tel: null, mail: null, web: null })), locked: true });
  res.json({ total: rows.length, sectores, anio: store.ciAnio, rows: rows.slice(page * 50, page * 50 + 50).map(view), locked: false });
});

// Novedades de las zonas que el usuario sigue: licitaciones, licencias y proyectos de generación
app.post('/api/novedades', requireUser, (req, res) => {
  if (!isPaid(req)) return res.status(402).json({ error: 'Disponible en el plan completo', locked: true });
  const codes = (Array.isArray(req.body?.codes) ? req.body.codes : []).filter((c) => store.byCode.has(c)).slice(0, 60);
  const items = [];
  for (const code of codes) {
    const m = store.byCode.get(code);
    for (const s of store.secop.filter((x) => x.code === code).slice(0, 25)) {
      items.push({ tipo: 'licitacion', code, mun: m.name, fecha: s.fecha, titulo: s.nombre, detalle: `${s.entidad} · ${s.estado}`, valor: s.precio, abierto: /presentaci|abierto|publicad|borrador/i.test(s.estado || '') && !s.adjudicado, url: s.url, id: 's' + s.id });
    }
    for (const p of projectsFor(code).slice(0, 20)) {
      const f = /^\d{4}-\d{2}/.test(p.fecha || '') ? p.fecha.slice(0, 10) : null;
      items.push({ tipo: 'obra', code, mun: m.name, fecha: f, titulo: p.nombre, detalle: [p.uso, p.unidades ? `${p.unidades} unidades` : null, p.etapa].filter(Boolean).join(' · '), id: 'p' + code + (p.id || p.acto || p.nombre) });
    }
    for (const p of (store.red.upme || []).filter((x) => x.code === code || (x.lat && m.lat && kmBetween(m, x) <= 20))) {
      items.push({ tipo: 'proyecto', code, mun: m.name, fecha: p.inscrito, titulo: p.n, detalle: `${fmt(p.mw)} MW · ${p.tipo} · ${p.fase} · ${p.mun}`, id: 'u' + p.id });
    }
  }
  const seen = new Set();
  const out = items.filter((x) => (seen.has(x.id) ? false : seen.add(x.id))).sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  res.json({ items: out.slice(0, 400) });
});

// Enlaces de solo lectura para compartir la ficha de un municipio (válidos 30 días, sin datos de contacto)
const shareSign = (payload) => crypto.createHmac('sha256', config.secret).update(payload).digest('base64url').slice(0, 22);
app.post('/api/share/:code', requireUser, (req, res) => {
  if (!isPaid(req)) return res.status(402).json({ error: 'Disponible en el plan completo', locked: true });
  const m = store.byCode.get(req.params.code); if (!m) return res.status(404).json({ error: 'No encontrado' });
  const { profile } = parseQuery({ profile: req.body?.profile }, req.user, true);
  const exp = Math.floor(Date.now() / 1000) + 30 * 86400;
  const payload = Buffer.from(JSON.stringify({ c: m.code, p: profile, e: exp, by: (req.user.company || req.user.name || '').slice(0, 60) })).toString('base64url');
  res.json({ token: `${payload}.${shareSign(payload)}`, expira: new Date(exp * 1000).toISOString().slice(0, 10) });
});
app.get('/api/public/ficha/:token', (req, res) => {
  const [payload, sig] = String(req.params.token).split('.');
  if (!payload || !sig || sig.length !== 22 || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(shareSign(payload)))) return res.status(404).json({ error: 'Enlace no válido' });
  let d; try { d = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return res.status(404).json({ error: 'Enlace no válido' }); }
  if (d.e * 1000 < Date.now()) return res.status(410).json({ error: 'Este enlace ya venció. Pide uno nuevo a quien te lo compartió.' });
  const m = store.byCode.get(d.c); if (!m) return res.status(404).json({ error: 'No encontrado' });
  const profile = PROFILES[d.p] ? d.p : 'instalador';
  const sc = scored(profile, null, 'campestre');
  const r = sc.byCode.get(m.code) || {};
  res.json({
    by: d.by, expira: new Date(d.e * 1000).toISOString().slice(0, 10), perfil: PROFILES[profile].label,
    code: m.code, name: m.name, dpto: m.dpto, pop: m.pop, or: m.or_name, rank: r.rank, total: sc.rows.length, score: r.score, tier: r.score != null ? tier(r.score) : null,
    factors: Object.fromEntries(Object.entries(PROFILES[profile].factors).map(([k, v]) => [v.label, r.comp?.[k] ?? null])),
    tarifa: m.tarifa, tarifa_com: m.tarifa_com, ghi: m.ghi, temp: m.temp, dna_1k: m.dna_1k, dna_dias: m.dna_dias,
    viv12: m.viv12 || 0, viv12_alto: m.viv12_alto || 0, rnt_hab: m.rnt_hab || 0, agpe_est: m.agpe_est || 0, inst_n: m.inst_n || 0,
    sub_km: m.sub_km, sub_kv: m.sub_kv, solar30_mw: m.solar30_mw || 0, upme_mw: Math.round(m.upme_mw || 0), payback: payback(m),
  });
});

// Capas del mapa: red de transmisión y subestaciones (todos), plantas y ZNI (plan completo)
app.get('/api/red', requireUser, (req, res) => {
  const r = store.red;
  res.json({ lineas: r.lineas, subs: r.subs, plantas: isPaid(req) ? r.plantas : [], zni: isPaid(req) ? r.zni : [], upme: isPaid(req) ? (r.upme || []).filter((p) => p.lat) : [], locked: !isPaid(req) });
});
app.get('/api/red/mt', requireUser, (req, res) => {
  if (!isPaid(req)) return res.status(402).json({ locked: true });
  if (!store.redMtFile) return res.json([]);
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'private, max-age=86400');
  fs.createReadStream(store.redMtFile).pipe(res);
});

// Mercado: autogeneradores por mercado (XM), precio de bolsa, contingencias por subárea y plantas
app.get('/api/mercado', requireUser, (req, res) => {
  const m = store.meta;
  const plantas = store.red.plantas.filter((p) => p.tipo === 'solar');
  const base = {
    agpe_fecha: m.agpe_xm_fecha, dna_periodo: m.dna_periodo,
    agpe_zonas: Object.entries(m.agpe_zonas || {}).map(([zona, z]) => ({ zona, ...z })).sort((a, b) => b.n - a.n),
    bolsa: m.bolsa || [],
    dna: Object.entries(m.dna_subareas || {}).filter(([k]) => !/NO DEFINIDA|CERROMATOSO/.test(k)).map(([k, v]) => ({ subarea: k.replace('SUBAREA ', ''), kwh: v.kwh, dias: v.dias, kwh_1k: v.kwh_1k })).sort((a, b) => (b.kwh_1k || 0) - (a.kwh_1k || 0)),
    upme_corte: m.upme_corte, upme_n: m.upme_n || 0,
    upme_mw: Math.round((store.red.upme || []).reduce((a, p) => a + (p.mw || 0), 0)),
    upme_solar_mw: Math.round((store.red.upme || []).filter((p) => /SOLAR/i.test(p.tipo)).reduce((a, p) => a + (p.mw || 0), 0)),
    solar: { n: plantas.length, mw: Math.round(plantas.reduce((a, p) => a + p.mw, 0)), operacion: plantas.filter((p) => p.estado === 'Operación').length, pruebas: plantas.filter((p) => p.estado !== 'Operación').length },
  };
  const upme = [...(store.red.upme || [])].sort((a, b) => (b.inscrito || '').localeCompare(a.inscrito || ''));
  if (!isPaid(req)) return res.json({ ...base, agpe_zonas: base.agpe_zonas.slice(0, 1), dna: base.dna.slice(0, 1), plantas: [], upme: upme.slice(0, 1), locked: true });
  res.json({ ...base, plantas: plantas.sort((a, b) => b.mw - a.mw), upme, locked: false });
});

// ---------------- IA ----------------
function aiQuota(req) {
  const day = new Date().toISOString().slice(0, 10);
  const used = db.prepare('SELECT n FROM ai_usage WHERE user_id=? AND day=?').get(req.user.id, day)?.n || 0;
  const limit = isPaid(req) ? config.ai.dailyPaid : config.ai.dailyTrial;
  return { day, used, limit, left: Math.max(0, limit - used) };
}
const bumpQuota = (req, day) => db.prepare('INSERT INTO ai_usage(user_id,day,n) VALUES(?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET n=n+1').run(req.user.id, day);

app.get('/api/ai/status', requireUser, (req, res) => res.json({ ...aiInfo(), quota: aiQuota(req) }));

const fmt = (n) => (n == null ? 's/d' : Number(n).toLocaleString('es-CO', { maximumFractionDigits: 1 }));
const money = (n) => (n == null ? 's/d' : n >= 1e9 ? `$${(n / 1e9).toLocaleString('es-CO', { maximumFractionDigits: 1 })} mil millones` : n >= 1e6 ? `$${(n / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} millones` : `$${Math.round(n).toLocaleString('es-CO')}`);
function muniBrief(m, r, full) {
  const p = payback(m);
  const lines = [
    `${m.name} (${m.dpto}) — código DANE ${m.code}. Puesto ${r?.rank ?? 's/d'} con puntaje ${r?.score ?? 's/d'}/100.`,
    `Operador de red: ${m.or_name}. Tarifa residencial estratos 4-6: ${fmt(m.tarifa)} $/kWh (${m.tarifa_periodo || 's/d'}, SUI); tarifa comercial ${fmt(m.tarifa_com)} $/kWh. Consumo promedio de hogares estrato 5-6 del departamento: ${fmt(m.kwh_mes_alto)} kWh/mes.`,
    `Radiación ${fmt(m.ghi)} kWh/m²/día (NASA POWER, celda ~50 km). Altitud ${fmt(m.elev)} m, temperatura media estimada ${fmt(m.temp)} °C. Población 2026: ${fmt(m.pop)}.`,
  ];
  if (full) {
    lines.push(`Vivienda licenciada últimos 12 meses (DANE ELIC, corte ${store.meta.elic_corte}): ${fmt(m.viv12 || 0)} unidades; estratos 4-6: ${fmt(m.viv12_alto || 0)}; casas: ${fmt(m.viv12_casas || 0)}; en suelo suburbano/rural: ${fmt(m.viv12_rural || 0)}; No VIS: ${fmt(m.viv12_novis || 0)}. Variación vs. 12 meses previos: ${m.viv_crec ?? 's/d'}%. Área no residencial licenciada: ${fmt(Math.round(m.nores12_m2 || 0))} m².`);
    lines.push(`Autogeneradores: el mercado ${m.agpe_zone || 's/d'} tiene ${fmt(m.agpe_zone_n)} AGPE registrados en XM (${fmt(m.agpe_zone_mw)} MW, ${store.meta.agpe_xm_fecha}); estimado para el municipio ${fmt(m.agpe_est)} (${fmt(m.agpe_10k)} por 10.000 hab.). En el SUI 2021 había ${m.agpe_n || 0}.`);
    if (m.dna_1k != null) lines.push(`Contingencias: la subárea ${m.subarea} tuvo ${fmt(m.dna_mwh)} MWh de demanda no atendida en 12 meses (${fmt(m.dna_1k)} kWh por cada 1.000 habitantes; ${m.dna_dias} días con cortes), según XM.`);
    lines.push(`Turismo (RNT): ${fmt(m.rnt_aloj || 0)} alojamientos con ${fmt(m.rnt_hab || 0)} habitaciones y ${fmt(m.rnt_vivtur || 0)} viviendas turísticas.`);
    if (m.sub_km != null) lines.push(`Red: subestación más cercana ${m.sub_n} (${m.sub_kv}, ${m.sub_op}) a ${fmt(m.sub_km)} km; ${m.subs30} subestaciones a menos de 30 km; ${m.solar30} plantas solares (${fmt(m.solar30_mw)} MW) a menos de 30 km.`);
    lines.push(`Empresas locales: ${m.inst_n || 0} instaladores ubicados en el municipio (${m.inst_sol || 0} con contratos solares públicos), ${m.mayor_n || 0} mayoristas de equipos.`);
    if (m.upme_n) lines.push(`Proyectos de generación registrados en la UPME en el municipio: ${m.upme_n} (${fmt(m.upme_mw)} MW, ${fmt(m.upme_solar_mw)} MW solares).`);
    if (m.zni_n) lines.push(`Tiene ${m.zni_n} localidades no interconectadas con ${fmt(m.zni_horas)} horas de servicio diario en promedio (IPSE).`);
    if (m.snr6) lines.push(`Licencias urbanísticas en curadurías últimos 6 meses (SNR): ${m.snr6.total} actos; ${m.snr6.construccion} de construcción, ${m.snr6.urbanizacion} de urbanización, ${m.snr6.parcelacion} de parcelación. Curadurías: ${(m.curadurias || []).join(', ')}.`);
    if (p) lines.push(`Ejemplo sistema ${p.kwp} kWp: ${fmt(p.kwh_anual)} kWh/año, ahorro ${fmt(p.ahorro_anual)} COP/año, inversión ${fmt(p.capex)} COP, retorno simple ${p.anos} años (CAPEX supuesto ${fmt(p.capex_kwp)} COP/kWp).`);
    lines.push(`Procesos SECOP solares de entidades del municipio: ${m.secop_n || 0}.`);
    const pr = projectsFor(m.code).slice(0, 5);
    if (pr.length) lines.push('Proyectos/licencias detectados: ' + pr.map((x) => `${x.nombre} (${x.unidades || '?'} und., ${x.fecha || ''}, fuente ${x.fuente})`).join('; '));
  }
  return lines.join('\n');
}

function buildContext(req, question, code) {
  const paid = isPaid(req);
  const { profile, weights, segment } = parseQuery({ profile: req.body?.profile, segment: req.body?.segment }, req.user, paid);
  const sc = scored(profile, weights, segment);
  const parts = [`Perfil del usuario: ${PROFILES[profile].label}. ${PROFILES[profile].desc}`,
    `Cortes de datos: DANE ELIC ${store.meta.elic_corte}; SNR ${store.meta.snr_corte}; tarifas SUI ${store.meta.sui_periodo || '2023'}; autogeneradores XM ${store.meta.agpe_xm_fecha}; demanda no atendida XM ${store.meta.dna_periodo}; registro UPME ${store.meta.upme_corte || 's/d'}; SECOP II ${store.meta.generado?.slice(0, 10)}.`];
  parts.push(`Índice de oportunidad (${PROFILES[profile].label}${PROFILES[profile].segments ? ', segmento ' + SEGMENTS[segment].label : ''}). ${paid ? 'Top 10 nacional' : 'Solo el primer puesto (usuario de prueba)'}:`);
  for (const r of sc.rows.slice(0, paid ? 10 : 1)) { const m = store.byCode.get(r.code); parts.push(`#${r.rank} ${m.name} (${m.dpto}) puntaje ${r.score}; tarifa ${fmt(m.tarifa)} $/kWh; vivienda 12m ${fmt(m.viv12 || 0)}; radiación ${fmt(m.ghi)}; turismo ${fmt(m.turismo_idx)}; cortes ${fmt(m.dna_1k)} kWh/1000 hab; instaladores ${m.inst_n || 0}; subestación a ${fmt(m.sub_km)} km`); }
  if (!paid) { parts.push('Departamentos más atractivos: ' + dptoScores(sc).sort((a, b) => b.score - a.score).slice(0, 5).map((d) => `${d.dpto} (${d.score})`).join(', ')); return parts.join('\n'); }

  const q = norm(question);
  const has = (re) => re.test(q);
  // Municipios y departamentos mencionados en la pregunta
  const mentioned = store.municipios.filter((m) => m.name.length > 3 && new RegExp(`\\b${escapeRe(norm(m.name))}\\b`).test(q)).slice(0, 4);
  if (code && store.byCode.has(code) && !mentioned.some((m) => m.code === code)) mentioned.unshift(store.byCode.get(code));
  const dptos = [...new Set(store.municipios.map((m) => m.dpto))].filter((d) => new RegExp(`\\b${escapeRe(norm(d).replace(/ d\.?c\.?$/, ''))}\\b`).test(q)).slice(0, 2);
  for (const m of mentioned) parts.push('\nDATOS DE ' + muniBrief(m, sc.byCode.get(m.code), true));

  const inArea = (codeX) => {
    if (!codeX) return false;
    if (mentioned.length && mentioned.some((m) => m.code === codeX)) return true;
    const mm = store.byCode.get(codeX);
    return dptos.length ? dptos.includes(mm?.dpto) : !mentioned.length;
  };
  const areaTxt = mentioned.length ? mentioned.map((m) => m.name).join(', ') : dptos.length ? dptos.join(', ') : 'todo el país';

  for (const d of dptos) {
    const rows = sc.rows.filter((r) => store.byCode.get(r.code)?.dpto === d).slice(0, 10);
    parts.push(`\nMEJORES MUNICIPIOS DE ${d.toUpperCase()} (puesto nacional y puntaje):\n` + rows.map((r) => { const m = store.byCode.get(r.code); return `- ${m.name}: #${r.rank}, puntaje ${r.score}, tarifa ${fmt(m.tarifa)}, vivienda 12m ${fmt(m.viv12 || 0)}, instaladores ${m.inst_n || 0}, cortes ${fmt(m.dna_1k)}`; }).join('\n'));
  }
  // Empresas, instaladores y contratos solares
  if (has(/instalador|empresa|contratist|proveedor|competen|mayorist|distribu|contrato|gan/)) {
    const emp = store.empresas.filter((e) => inArea(e.code) && (e.sol_n || e.cat === 'Instaladores eléctricos' || e.cat === 'Contratistas solares (SECOP)' || e.cat === 'Proveedores mayoristas de equipo'))
      .sort((a, b) => (b.sol_n || 0) - (a.sol_n || 0) || (b.tel || b.mail ? 1 : 0) - (a.tel || a.mail ? 1 : 0)).slice(0, 15);
    parts.push(`\nEMPRESAS EN ${areaTxt.toUpperCase()} (Registro Mercantil + SECOP II; contratos solares = procesos SECOP con "solar" o "fotovoltaico" adjudicados). Total que cumplen el filtro: ${store.empresas.filter((e) => inArea(e.code) && e.sol_n).length} con contratos solares.\n` +
      (emp.length ? emp.map((e) => `- ${e.n} (NIT ${e.nit}), ${e.cat}, ${store.byCode.get(e.code)?.name || e.cam}; contratos solares: ${e.sol_n || 0}${e.sol_valor ? ` por ${money(e.sol_valor)}` : ''}${e.sol_ultimo ? `, último ${e.sol_ultimo}` : ''}${e.tel ? `; tel ${e.tel}` : ''}${e.mail ? `; ${e.mail}` : ''}`).join('\n') : '(sin empresas con ubicación en esa zona)'));
  }
  // Clientes comerciales e industriales (empresas grandes)
  if (has(/industri|fabrica|empresa grande|grandes empresas|c&i|comercial e industrial|supermercado|clinica|hospital|bodega|agroindustria|cliente/)) {
    const ci = store.ci.filter((e) => inArea(e.code)).slice(0, 12);
    if (ci.length) parts.push(`\nEMPRESAS GRANDES (CLIENTES COMERCIALES E INDUSTRIALES) EN ${areaTxt.toUpperCase()}, por ingresos (corte ${store.ciAnio}):\n` + ci.map((e) => `- ${e.n} (NIT ${e.nit}), ${e.sector}, ${store.byCode.get(e.code)?.name || e.ciudad}; ingresos ${fmt(e.ing)} mil millones; consumo típico del sector ${e.consumo}${e.tel ? `; tel ${e.tel}` : ''}${e.mail ? `; ${e.mail}` : ''}`).join('\n'));
  }
  // Licitaciones
  if (has(/licitac|secop|contrato|proceso|entidad|public/)) {
    const sec = store.secop.filter((x) => inArea(x.code) || (dptos.length && dptos.some((d) => norm(x.dpto) === norm(d)))).slice(0, 12);
    if (sec.length) parts.push(`\nLICITACIONES SOLARES SECOP II EN ${areaTxt.toUpperCase()} (más recientes):\n` + sec.map((x) => `- ${x.fecha}: ${x.nombre?.slice(0, 120)} · ${x.entidad} · ${money(x.precio)} · ${x.estado}${x.proveedor ? ` · adjudicado a ${x.proveedor}` : ''}`).join('\n'));
  }
  // Clientes turísticos
  if (has(/hotel|turis|alojamiento|cliente|vivienda turistica|parque/)) {
    const cl = store.clientes.filter((c) => inArea(c.code)).slice(0, 12);
    if (cl.length) parts.push(`\nHOTELES Y ALOJAMIENTOS EN ${areaTxt.toUpperCase()} (Registro Nacional de Turismo, mayor número de habitaciones):\n` + cl.map((c) => `- ${c.n}, ${store.byCode.get(c.code)?.name}: ${c.hab} habitaciones${c.tel ? `; tel ${c.tel}` : ''}${c.mail ? `; ${c.mail}` : ''}`).join('\n'));
  }
  // Proyectos UPME y plantas
  if (has(/upme|proyecto|planta|granja|parque solar|mw|desarroll|invers/)) {
    const up = (store.red.upme || []).filter((p) => inArea(p.code) || !mentioned.length && !dptos.length).slice(0, 12);
    if (up.length) parts.push(`\nPROYECTOS REGISTRADOS EN LA UPME (${areaTxt}):\n` + up.map((p) => `- ${p.n}: ${fmt(p.mw)} MW, ${p.tipo}, ${p.fase}, ${p.mun} (${p.dpto}), operación prevista ${p.operacion?.slice(0, 7) || 's/d'}`).join('\n'));
  }
  const chunks = searchChunks(question, { municipio: code });
  if (chunks.length) parts.push('\nFRAGMENTOS DE DOCUMENTOS CARGADOS:\n' + chunks.map((c) => `[${c.title}] ${c.text}`).join('\n---\n'));
  return parts.join('\n');
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const SYSTEM_BASE = `Eres el analista comercial de ${config.appName}, plataforma de inteligencia de mercado solar en Colombia para instaladores, proveedores de equipos y desarrolladores o inversionistas.
Respondes en español, claro y práctico, adaptado al perfil del usuario del CONTEXTO.

Reglas:
- Usa SOLO los datos del CONTEXTO para cifras, empresas, municipios y proyectos. Si algo no está en el CONTEXTO, dilo en una frase y sugiere la sección de la app donde buscarlo. No inventes cifras, nombres, filtros ni fuentes.
- Cuando el CONTEXTO trae una lista (empresas, licitaciones, hoteles, proyectos), úsala: resume y destaca los más relevantes.
- [FUENTES]Qué es cada fuente (no la describas de otra forma): DANE ELIC = licencias de construcción de vivienda y otros usos; SNR = actos de curadurías urbanas; SUI = tarifas y consumo de energía de Superservicios; XM = autogeneradores, cortes (demanda no atendida), precio de bolsa y mapa de red; UPME = registro de proyectos de generación; RNT = Registro Nacional de Turismo; SECOP II = licitaciones y contratos públicos; Registro Mercantil = empresas.
- Secciones de la app: Mapa (con herramientas para dibujar zonas y medir), Ranking, Ficha del municipio, Empresas e industrias (clientes C&I), Hoteles y turismo, Instaladores y empresas, Mercado y red, Licitaciones, Mis prospectos (zonas que sigue, novedades y prospectos), Calculadora financiera (retorno, financiación y beneficios tributarios), Propuestas en PDF.
- Puedes dar recomendaciones comerciales generales, aclarando que son sugerencias.

Formato (Markdown): empieza con la respuesta directa en 1 o 2 frases. Luego usa títulos cortos con ###, listas con viñetas y **negritas** para cifras clave. Usa una tabla solo para comparar 3 o más elementos con varias columnas. Termina, si aplica, con "Siguiente paso" en una línea. Máximo 250 palabras salvo que pidan más.`;
// Solo los administradores ven de dónde sale cada dato; a los demás usuarios no se les nombran las fuentes
const systemFor = (req) => (isAdmin(req)
  ? SYSTEM_BASE.replace('[FUENTES]', '')
  : SYSTEM_BASE.replace(/- \[FUENTES\][^\n]*\n/, '- Nunca nombres las fuentes ni las entidades de donde vienen los datos (por ejemplo DANE, SUI, Superservicios, XM, UPME, RNT, MinCIT, SECOP, Registro Mercantil, Confecámaras, Supersociedades, NASA, IPSE, datos.gov.co). Si preguntan de dónde salen los datos, responde que son datos de Radar Solar construidos a partir de información pública oficial.\n'));

app.post('/api/ai/chat', requireUser, wrap(async (req, res) => {
  const quota = aiQuota(req);
  if (!quota.left) return res.status(429).json({ error: isPaid(req) ? 'Llegaste al límite diario de consultas.' : 'En la versión de prueba tienes 3 consultas al día. Activa el plan completo para seguir.', quota });
  const msgs = (req.body?.messages || []).slice(-8).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return res.status(400).json({ error: 'Falta la pregunta' });
  const ctx = buildContext(req, msgs[msgs.length - 1].content, req.body?.code);
  const answer = await complete({ system: systemFor(req) + '\n\nCONTEXTO:\n' + ctx, messages: msgs });
  bumpQuota(req, quota.day);
  res.json({ answer, quota: aiQuota(req) });
}));

app.post('/api/ai/pitch/:code', requireUser, wrap(async (req, res) => {
  if (!isPaid(req)) return res.status(402).json({ error: 'Disponible en el plan completo', locked: true });
  const m = store.byCode.get(req.params.code); if (!m) return res.status(404).json({ error: 'No encontrado' });
  const quota = aiQuota(req); if (!quota.left) return res.status(429).json({ error: 'Límite diario alcanzado' });
  const { profile } = parseQuery({ profile: req.body?.profile }, req.user, true);
  const sc = scored(profile, null, 'campestre');
  const prompt = profile === 'servicios'
    ? `Redacta para una empresa de mantenimiento (O&M) y servicios solares: (1) diagnóstico de 3 frases de ${m.name} como mercado de mantenimiento (sistemas instalados, plantas cercanas, proyectos nuevos, cortes), (2) qué servicios ofrecer (limpieza, revisión, monitoreo, repotenciación), (3) a quién contactar primero, (4) un mensaje corto (máx. 60 palabras) para ofrecer mantenimiento.`
    : profile === 'respaldo'
      ? `Redacta para un vendedor de baterías y sistemas de respaldo: (1) diagnóstico de 3 frases de ${m.name} según cortes de energía, tarifa y tipo de clientes, (2) el cliente ideal (hogar, hotel, comercio, finca), (3) tres argumentos de venta con cifras del contexto, (4) un mensaje de WhatsApp corto (máx. 60 palabras).`
      : profile === 'proveedor'
    ? `Redacta para un proveedor de equipos solares: (1) diagnóstico de 3 frases de ${m.name} como plaza de distribución, (2) qué instaladores o contratistas priorizar y por qué, (3) tres argumentos comerciales con cifras del contexto, (4) un mensaje corto (máx. 60 palabras) para presentarse a un instalador de la zona.`
    : profile === 'desarrollador'
      ? `Redacta para un desarrollador o inversionista solar: (1) diagnóstico de 3 frases de ${m.name} para una planta o autogeneración remota (sol, red, tarifa, contingencias, competencia), (2) riesgos principales, (3) qué verificar en campo y con el operador de red, (4) un resumen ejecutivo de 60 palabras.`
      : `Redacta para un instalador solar: (1) un diagnóstico de 3 frases de por qué ${m.name} es o no buena zona de venta, (2) el perfil de cliente ideal allí, (3) tres argumentos de venta con cifras del contexto, (4) un mensaje de WhatsApp corto (máx. 60 palabras) para administradores de conjuntos o propietarios de casas campestres. Público objetivo: ${req.body?.segmento || 'residencial'}.`;
  const answer = await complete({ system: systemFor(req) + '\n\nCONTEXTO:\n' + muniBrief(m, sc.byCode.get(m.code), true), messages: [{ role: 'user', content: prompt }], temperature: 0.5 });
  bumpQuota(req, quota.day);
  res.json({ answer });
}));

// Texto de introducción para propuestas e informes en PDF
app.post('/api/ai/propuesta/:code', requireUser, wrap(async (req, res) => {
  if (!isPaid(req)) return res.status(402).json({ error: 'Disponible en el plan completo', locked: true });
  const m = store.byCode.get(req.params.code); if (!m) return res.status(404).json({ error: 'No encontrado' });
  const quota = aiQuota(req); if (!quota.left) return res.status(429).json({ error: 'Límite diario alcanzado' });
  const { profile } = parseQuery({ profile: req.body?.profile }, req.user, true);
  const sc = scored(profile, null, 'campestre');
  const cliente = String(req.body?.cliente || '').slice(0, 120);
  const tipo = req.body?.tipo;
  const kwp = Math.max(1, Math.min(5000, +req.body?.kwp || 6));
  const prompt = tipo === 'alcaldia'
    ? `Escribe la introducción (máx. 150 palabras, en párrafos, sin títulos ni listas) de un informe para la alcaldía de ${m.name} sobre el potencial de la energía solar en el municipio: radiación, tarifa, cortes y beneficios para hogares, edificios públicos y comercio. Tono institucional.`
    : tipo === 'zona'
      ? `Escribe un resumen ejecutivo (máx. 150 palabras, en párrafos, sin títulos ni listas) de ${m.name} como zona de oportunidad para un ${PROFILES[profile].label.toLowerCase()}, con las cifras clave del contexto.`
      : `Escribe la introducción (máx. 140 palabras, en párrafos, sin títulos ni listas) de una propuesta comercial de un sistema solar de ${kwp} kWp${cliente ? ` para ${cliente}` : ''} en ${m.name}. Explica por qué conviene allí (tarifa, radiación, cortes) con cifras del contexto. Tono cercano y profesional, en segunda persona dirigida al cliente. No prometas cifras distintas a las del contexto.`;
  const answer = await complete({ system: systemFor(req) + '\n\nCONTEXTO:\n' + muniBrief(m, sc.byCode.get(m.code), true), messages: [{ role: 'user', content: prompt }], temperature: 0.4, maxTokens: 600 });
  bumpQuota(req, quota.day);
  res.json({ answer });
}));

// Equipo: usuarios de la misma empresa
app.get('/api/team', requireUser, (req, res) => {
  if (!req.user.company) return res.json({ company: null, members: [] });
  res.json({ company: req.user.company, members: db.prepare('SELECT username, name, last_login FROM users WHERE company=? AND active=1 ORDER BY username').all(req.user.company) });
});

// ---------------- Administración ----------------
const admin = express.Router();
admin.use(requireUser, requireAdmin);

admin.get('/users', (req, res) => res.json(db.prepare('SELECT id,username,role,profile,terms_at,terms_version,name,company,phone,notes,paid_until,active,created_at,last_login FROM users ORDER BY id DESC').all()));
const PROF_OK = ['todos', ...PROFILE_KEYS];
admin.post('/users', (req, res) => {
  const { username, password, role = 'trial', name, company, phone, notes, paid_until, profile = 'todos' } = req.body || {};
  if (!PROF_OK.includes(profile)) return res.status(400).json({ error: 'Perfil inválido' });
  if (!validateUsername(username)) return res.status(400).json({ error: 'Usuario inválido (3-60 caracteres: letras, números, . _ - @)' });
  if (!validatePassword(password)) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  if (!['trial', 'paid', 'admin'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return res.status(409).json({ error: 'Ese usuario ya existe' });
  const r = db.prepare('INSERT INTO users(username,pass_hash,role,name,company,phone,notes,paid_until,profile) VALUES(?,?,?,?,?,?,?,?,?)').run(username.trim(), hashPassword(password), role, name || null, company || null, phone || null, notes || null, paid_until || null, profile);
  res.json({ id: r.lastInsertRowid });
});
// Crea varios usuarios de una misma empresa (licencia de equipo) con contraseñas generadas
admin.post('/users/team', (req, res) => {
  const { company, n = 3, prefix, role = 'paid', profile = 'todos', paid_until } = req.body || {};
  const count = Math.max(1, Math.min(50, +n || 0));
  if (!company || String(company).trim().length < 2) return res.status(400).json({ error: 'Escribe el nombre de la empresa' });
  if (!PROF_OK.includes(profile)) return res.status(400).json({ error: 'Perfil inválido' });
  if (!['trial', 'paid'].includes(role)) return res.status(400).json({ error: 'Rol inválido' });
  const base = String(prefix || company).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'equipo';
  const out = [];
  for (let i = 1; out.length < count && i < 500; i++) {
    const username = `${base}${i}`;
    if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) continue;
    const password = crypto.randomBytes(9).toString('base64url');
    db.prepare('INSERT INTO users(username,pass_hash,role,company,paid_until,profile,name) VALUES(?,?,?,?,?,?,?)').run(username, hashPassword(password), role, String(company).trim(), paid_until || null, profile, username);
    out.push({ username, password });
  }
  res.json({ users: out, seed: out.map((u) => `${u.username}:${u.password}:${role}:${profile}:${String(company).trim().replace(/[:;]/g, ' ')}`).join(';') });
});
admin.patch('/users/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(+req.params.id); if (!u) return res.status(404).json({ error: 'No existe' });
  const b = req.body || {};
  if (b.role && !['trial', 'paid', 'admin'].includes(b.role)) return res.status(400).json({ error: 'Rol inválido' });
  if (u.id === req.user.id && (b.role && b.role !== 'admin' || b.active === 0)) return res.status(400).json({ error: 'No puedes quitarte el rol de administrador ni desactivarte' });
  if (b.password != null && !validatePassword(b.password)) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  const f = { role: b.role ?? u.role, name: b.name ?? u.name, company: b.company ?? u.company, phone: b.phone ?? u.phone, notes: b.notes ?? u.notes, paid_until: b.paid_until !== undefined ? (b.paid_until || null) : u.paid_until, active: b.active ?? u.active };
  const prof = b.profile ?? u.profile ?? 'todos';
  if (!PROF_OK.includes(prof)) return res.status(400).json({ error: 'Perfil inválido' });
  db.prepare('UPDATE users SET role=?,name=?,company=?,phone=?,notes=?,paid_until=?,active=?,profile=? WHERE id=?').run(f.role, f.name, f.company, f.phone, f.notes, f.paid_until, f.active ? 1 : 0, prof, u.id);
  if (b.password) { db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(hashPassword(b.password), u.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id); }
  if (!f.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
  res.json({ ok: true });
});
admin.delete('/users/:id', (req, res) => {
  if (+req.params.id === req.user.id) return res.status(400).json({ error: 'No puedes borrarte a ti mismo' });
  db.prepare('DELETE FROM users WHERE id=?').run(+req.params.id); res.json({ ok: true });
});

admin.get('/stats', (req, res) => res.json({
  users: db.prepare("SELECT role, COUNT(*) n FROM users GROUP BY role").all(),
  docs: db.prepare('SELECT COUNT(*) n FROM documents').get().n,
  projects: db.prepare('SELECT COUNT(*) n FROM projects').get().n,
  ai_today: db.prepare('SELECT COALESCE(SUM(n),0) n FROM ai_usage WHERE day=?').get(new Date().toISOString().slice(0, 10)).n,
  ai: aiInfo(), meta: { ...store.meta, tarifas: undefined }, running: isRunning(),
  sources: Object.fromEntries(Object.entries(SOURCES).map(([k, v]) => [k, v.label])),
}));

admin.get('/settings', (req, res) => res.json({
  weights: Object.fromEntries(PROFILE_KEYS.map((p) => [p, defaultWeights(p)])),
  profiles: Object.fromEntries(PROFILE_KEYS.map((p) => [p, { label: PROFILES[p].label, factors: Object.fromEntries(Object.entries(PROFILES[p].factors).map(([f, v]) => [f, v.label])) }])),
  capex_kwp: getSetting('capex_kwp', config.capexKwp),
}));
admin.put('/settings', (req, res) => {
  const b = req.body || {};
  for (const p of PROFILE_KEYS) if (b.weights?.[p]) setSetting(`weights_${p}`, Object.fromEntries(Object.keys(PROFILES[p].factors).map((k) => [k, Math.max(0, Math.min(100, +b.weights[p][k] || 0))])));
  if (b.capex_kwp) setSetting('capex_kwp', Math.max(500000, Math.min(20000000, +b.capex_kwp)));
  res.json({ ok: true });
});

admin.get('/docs', (req, res) => res.json(db.prepare('SELECT d.*, (SELECT COUNT(*) FROM doc_chunks c WHERE c.doc_id=d.id) chunks, (SELECT COUNT(*) FROM projects p WHERE p.doc_id=d.id) projects FROM documents d ORDER BY id DESC').all()));
admin.post('/docs', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  const title = (req.body.title || req.file.originalname).slice(0, 200);
  const municipio = store.byCode.has(req.body.municipio) ? req.body.municipio : null;
  try {
    const text = await fileToText(req.file.path, req.file.originalname);
    if (!text || text.trim().length < 20) throw new Error('No se pudo extraer texto. Si es un PDF escaneado, pásalo primero por OCR.');
    const dest = path.join(UPLOADS, `${Date.now()}-${req.file.originalname.replace(/[^\w.\-]+/g, '_')}`);
    fs.renameSync(req.file.path, dest);
    const r = db.prepare("INSERT INTO documents(title,filename,kind,purpose,municipio,size,chars,status,uploaded_by) VALUES(?,?,?,'ia',?,?,?,'listo',?)")
      .run(title, path.basename(dest), path.extname(dest).slice(1), municipio, req.file.size, text.length, req.user.id);
    saveDocText(r.lastInsertRowid, text);
    res.json({ id: r.lastInsertRowid, chars: text.length });
  } finally { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); }
}));
admin.delete('/docs/:id', (req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id=?').get(+req.params.id);
  if (d?.filename) fs.rmSync(path.join(UPLOADS, d.filename), { force: true });
  db.prepare('DELETE FROM documents WHERE id=?').run(+req.params.id);
  res.json({ ok: true });
});

// Extrae proyectos inmobiliarios de un documento (avisos de curaduría, prensa, PDF de licencias) con IA
admin.post('/docs/:id/extract-projects', wrap(async (req, res) => {
  const d = db.prepare('SELECT * FROM documents WHERE id=?').get(+req.params.id); if (!d) return res.status(404).json({ error: 'No existe' });
  const text = db.prepare('SELECT text FROM doc_chunks WHERE doc_id=? ORDER BY idx').all(d.id).map((c) => c.text).join('\n').slice(0, 30000);
  const out = await complete({
    system: 'Extraes datos estructurados de documentos colombianos de licencias urbanísticas, curadurías y proyectos inmobiliarios. Devuelves solo JSON válido.',
    messages: [{ role: 'user', content: `Del siguiente texto, extrae cada proyecto de construcción (obra nueva, urbanización, parcelación o ampliación relevante). Devuelve {"proyectos":[{"nombre":"","municipio":"","departamento":"","direccion":"","uso":"vivienda|comercio|industria|mixto|otro","unidades":0,"estrato":"","fecha":"AAAA-MM-DD o texto","etapa":"licencia|preventa|construcción|otro","notas":""}]}. No inventes datos: deja vacío lo que no aparezca. Omite datos personales de personas naturales (nombres, cédulas).\n\nTEXTO:\n${text}` }],
    json: true, temperature: 0, maxTokens: 4000,
  });
  const parsed = parseJSONLoose(out);
  const list = Array.isArray(parsed) ? parsed : parsed.proyectos || [];
  const ins = db.prepare('INSERT INTO projects(municipio,nombre,uso,unidades,estrato,direccion,fecha,etapa,fuente,notas,doc_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  let n = 0;
  for (const p of list) {
    const code = d.municipio || findMuniCode(p.municipio, p.departamento);
    if (!code || !p.nombre) continue;
    ins.run(code, String(p.nombre).slice(0, 200), p.uso || null, parseInt(p.unidades, 10) || null, p.estrato || null, p.direccion || null, p.fecha || null, p.etapa || null, `Documento: ${d.title}`, p.notas || null, d.id);
    n++;
  }
  res.json({ extraidos: list.length, guardados: n });
}));

admin.get('/projects', (req, res) => res.json(db.prepare('SELECT * FROM projects ORDER BY id DESC LIMIT 500').all()));
admin.delete('/projects/:id', (req, res) => { db.prepare('DELETE FROM projects WHERE id=?').run(+req.params.id); res.json({ ok: true }); });

// Cargas de datos estructurados
admin.post('/data/upload', upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo' });
  const type = req.body.type;
  try {
    ensureRaw();
    if (type === 'proyectos') {
      const rows = await tableFromFile(req.file.path, req.file.originalname);
      const ins = db.prepare('INSERT INTO projects(municipio,nombre,uso,unidades,estrato,direccion,lat,lon,fecha,etapa,fuente,notas) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
      let n = 0, skipped = 0;
      for (const r of rows) {
        const code = store.byCode.has(String(r.codigo_dane || '').padStart(5, '0')) ? String(r.codigo_dane).padStart(5, '0') : findMuniCode(r.municipio, r.departamento);
        if (!code || !r.nombre) { skipped++; continue; }
        ins.run(code, String(r.nombre).slice(0, 200), r.uso || null, parseInt(r.unidades, 10) || null, r.estrato || null, r.direccion || null, parseFloat(r.lat) || null, parseFloat(r.lon) || null, r.fecha || null, r.etapa || null, r.fuente || 'Carga manual', r.notas || null);
        n++;
      }
      return res.json({ ok: true, mensaje: `${n} proyectos cargados${skipped ? `, ${skipped} filas omitidas (municipio o nombre faltante)` : ''}` });
    }
    if (type === 'tarifas') {
      const rows = await tableFromFile(req.file.path, req.file.originalname);
      const clean = rows.map((r) => ({ operador: r.operador || r.or || r.empresa, periodo: String(r.periodo || ''), cu: r.cu || r.tarifa || r.valor, fuente: r.fuente })).filter((r) => r.operador && r.cu);
      const f = path.join(RAW, 'tarifas_manual.json');
      const prev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : [];
      fs.writeFileSync(f, JSON.stringify([...prev, ...clean]));
      const id = startJob('reconstruir', rebuild);
      return res.json({ ok: true, job: id, mensaje: `${clean.length} tarifas recibidas. Reconstruyendo la base…` });
    }
    if (type === 'sui_precios') {
      if (!/\.xlsx$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Debe ser el .xlsx exportado del SUI' });
      try { const { parseSuiPrecios } = await import('./etl/sui_precios.js'); const rows = await parseSuiPrecios(req.file.path); if (rows.length < 50) throw new Error('muy pocas filas'); }
      catch (e) { return res.status(400).json({ error: 'El archivo no tiene el formato del reporte de precios del SUI: ' + e.message }); }
      for (const f of fs.readdirSync(RAW)) if (/^sui_precios.*\.xlsx$/i.test(f)) fs.rmSync(path.join(RAW, f));
      fs.copyFileSync(req.file.path, path.join(RAW, 'sui_precios.xlsx'));
      const id = startJob('reconstruir', rebuild);
      return res.json({ ok: true, job: id, mensaje: 'Tarifas del SUI recibidas. Reconstruyendo la base…' });
    }
    if (type === 'upme') {
      if (!/\.xlsx$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Debe ser el .xlsx "Informe de registros activos" de la UPME' });
      try { const { parseUpme } = await import('./etl/upme.js'); const r = await parseUpme(req.file.path); if (!r.rows.length) throw new Error('sin proyectos'); }
      catch (e) { return res.status(400).json({ error: 'El archivo no tiene el formato del informe de la UPME: ' + e.message }); }
      fs.copyFileSync(req.file.path, path.join(RAW, 'upme_registro.xlsx'));
      const id = startJob('reconstruir', rebuild);
      return res.json({ ok: true, job: id, mensaje: 'Registro de la UPME recibido. Reconstruyendo la base…' });
    }
    if (type === 'elic' || type === 'poblacion') {
      if (!/\.xlsx$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Debe ser el archivo .xlsx original del DANE' });
      if (type === 'elic') { for (const f of fs.readdirSync(RAW)) if (/SerieTipoBaseMun/i.test(f)) fs.rmSync(path.join(RAW, f)); fs.copyFileSync(req.file.path, path.join(RAW, 'anex-ELIC-SerieTipoBaseMun-carga.xlsx')); }
      else fs.copyFileSync(req.file.path, path.join(RAW, 'pob_mun.xlsx'));
      const id = startJob('reconstruir', rebuild);
      return res.json({ ok: true, job: id, mensaje: 'Archivo recibido. Reconstruyendo la base (puede tardar 1 minuto)…' });
    }
    res.status(400).json({ error: 'Tipo de carga desconocido' });
  } finally { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); }
}));

admin.post('/refresh', (req, res) => res.json({ job: refreshSources(req.body?.sources) }));
admin.post('/rebuild', (req, res) => res.json({ job: startJob('reconstruir', rebuild) }));
admin.get('/jobs', (req, res) => res.json(db.prepare('SELECT * FROM jobs ORDER BY id DESC LIMIT 10').all()));

admin.get('/plantillas/:name', (req, res) => {
  const t = {
    'proyectos.csv': 'nombre,codigo_dane,municipio,departamento,direccion,uso,unidades,estrato,fecha,etapa,lat,lon,fuente,notas\nCondominio Ejemplo,25035,Anapoima,Cundinamarca,Vereda X km 3,vivienda,48,5,2026-03-01,licencia,,,Curaduría / visita,\n',
    'tarifas.csv': 'operador,periodo,cu,fuente\nEnel Colombia,2026-09,812.5,SUI O3 estrato 4 nivel 1\n',
  }[req.params.name];
  if (!t) return res.status(404).end();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.name}"`);
  res.send('﻿' + t);
});
app.use('/api/admin', admin);

// ---------------- Utilidades ----------------
// Instaladores del municipio; si hay pocos, se completan con los del departamento (con contratos solares primero)
function localInstallers(m, paid) {
  const isInst = (e) => e.cat === 'Instaladores eléctricos' || e.cat === 'Contratistas solares (SECOP)' || e.sol_n;
  const rank = (a, b) => (b.sol_n || 0) - (a.sol_n || 0) || (b.tel || b.mail ? 1 : 0) - (a.tel || a.mail ? 1 : 0);
  const local = store.empresas.filter((e) => e.code === m.code && isInst(e)).sort(rank);
  const dpto = local.length >= 8 ? [] : store.empresas.filter((e) => e.code && e.code !== m.code && e.code.slice(0, 2) === m.code.slice(0, 2) && isInst(e) && (e.tel || e.mail || e.sol_n)).sort(rank);
  const view = (e, ambito) => ({ n: e.n, nit: e.nit, cat: e.cat, sol_n: e.sol_n || 0, sol_ultimo: e.sol_ultimo, ambito, mun: store.byCode.get(e.code)?.name, tel: paid ? e.tel : null, mail: paid ? e.mail : null, web: paid ? e.web : null });
  const rows = [...local.slice(0, 15).map((e) => view(e, 'municipio')), ...dpto.slice(0, 15 - Math.min(local.length, 15)).map((e) => view(e, 'departamento'))];
  return { instaladores: paid ? rows : rows.slice(0, 1), instaladores_n: { municipio: local.length, departamento: dpto.length } };
}
function kmBetween(a, b) {
  const R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function norm(s) { return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function findMuniCode(name, dpto) {
  if (!name) return null;
  const n = norm(name), d = norm(dpto);
  const c = store.municipios.filter((m) => norm(m.name) === n);
  if (c.length === 1) return c[0].code;
  return c.find((m) => d && norm(m.dpto).includes(d))?.code || c[0]?.code || null;
}

// ---------------- Front-end ----------------
const dist = path.join(ROOT, 'web', 'dist');
app.use(express.static(dist, { index: false, maxAge: '1h' }));
app.get(/^\/(?!api\/).*/, (req, res) => {
  const f = path.join(dist, 'index.html');
  if (fs.existsSync(f)) res.sendFile(f); else res.status(500).send('Falta compilar el front-end: npm run build');
});

app.use((err, req, res, _next) => {
  if (err.status !== 429 && err.status !== 503) console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

app.listen(config.port, () => console.log(`${config.appName} escuchando en http://localhost:${config.port}`));

// Un error inesperado no debe tumbar el servidor (en el hosting eso se ve como "Error 502")
process.on('unhandledRejection', (e) => console.error('Error no controlado:', e));
process.on('uncaughtException', (e) => console.error('Excepción no controlada:', e));
