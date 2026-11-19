// Privacidad y documentos legales: textos versionados, aceptaciones con evidencia, solicitudes de titulares,
// retiro de contactos, enlaces compartidos revocables y diario de eliminaciones.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { db } from './db.js';
import { config, ROOT, STORAGE } from './config.js';
import { audit, ipShort, uaShort, hit, ipOf, sumarHabiles, habilesEntre, hoyBogota, reloadSuppressions } from './security.js';

// ---------------- Documentos legales ----------------
const DOCS = ['terminos', 'privacidad', 'aviso', 'cookies', 'cancelaciones', 'fuentes', 'autorizacion', 'publicidad'];
const e = process.env;
const fmtCop = (n) => '$' + Math.round(n).toLocaleString('es-CO');
// Cada marcador se llena con una variable de entorno; si falta, queda visible como [PENDIENTE] para no inventar datos
const FIELDS = () => ({
  APP: [config.appName],
  RAZON_SOCIAL: [config.legal.razonSocial, 'razón social del prestador (LEGAL_RAZON_SOCIAL)'],
  NIT: [config.legal.nit, 'NIT (LEGAL_NIT)'],
  MATRICULA: [config.legal.matricula, 'matrícula mercantil (LEGAL_MATRICULA)'],
  DOMICILIO: [config.legal.domicilio, 'ciudad de domicilio (LEGAL_DOMICILIO)'],
  DIRECCION: [config.legal.direccion, 'dirección física (LEGAL_DIRECCION)'],
  CORREO_DATOS: [config.legal.correoDatos, 'correo para datos personales y atención (LEGAL_CORREO_DATOS)'],
  TELEFONO: [config.legal.telefono, 'teléfono o WhatsApp de atención (LEGAL_TELEFONO)'],
  WEB: [config.legal.web, 'sitio web del prestador (LEGAL_WEB)'],
  PRECIO: [config.planPrecio ? fmtCop(config.planPrecio) : '', 'precio del plan (PLAN_PRECIO_COP)'],
  IMPUESTOS: [config.planImpuestos, 'si el precio incluye IVA u otros impuestos (PLAN_IMPUESTOS)'],
  VIGENCIA: [e.LEGAL_VIGENCIA_PLAN, 'vigencia del acceso del plan completo: indefinida mientras el servicio opere o por un plazo (LEGAL_VIGENCIA_PLAN)'],
  DESCONTINUACION: [e.LEGAL_DESCONTINUACION, 'qué se reconoce si el servicio se descontinúa: aviso previo y devolución proporcional u otra regla (LEGAL_DESCONTINUACION)'],
  RETENCION_CONSENTIMIENTOS: [e.LEGAL_RETENCION_CONSENTIMIENTOS, 'plazo de conservación de la evidencia de aceptación tras cerrar la cuenta (LEGAL_RETENCION_CONSENTIMIENTOS)'],
  RETENCION_SOLICITUDES: [e.LEGAL_RETENCION_SOLICITUDES, 'plazo de conservación de las solicitudes de titulares (LEGAL_RETENCION_SOLICITUDES)'],
  RETENCION_RESPALDOS: [config.backup.key ? `${config.backup.keep} copias, una cada ${config.backup.hours} horas; las más antiguas se borran automáticamente.` : '', 'activar copias de seguridad cifradas (BACKUP_KEY)'],
  PROVEEDOR_RESPALDO: [e.LEGAL_PROVEEDOR_RESPALDO || (config.backup.s3.endpoint ? '' : 'Mismo proveedor de hosting'), 'proveedor de almacenamiento de respaldos (LEGAL_PROVEEDOR_RESPALDO)'],
  PAIS_RESPALDO: [e.LEGAL_PAIS_RESPALDO || (config.backup.s3.endpoint ? '' : 'Estados Unidos'), 'país del almacenamiento de respaldos (LEGAL_PAIS_RESPALDO)'],
  ESTADO_CONTRATOS: [e.LEGAL_ESTADO_CONTRATOS, 'confirmar que se revisaron los términos de tratamiento de datos de cada proveedor (LEGAL_ESTADO_CONTRATOS)'],
});
function loadDoc(name) {
  const raw = fs.readFileSync(path.join(ROOT, 'server', 'legal', `${name}.md`), 'utf8');
  const [head, ...rest] = raw.split(/\n---\n/);
  const meta = Object.fromEntries(head.split('\n').map((l) => l.split(/:\s*/)).filter((x) => x.length > 1).map(([k, ...v]) => [k.trim(), v.join(': ').trim()]));
  const F = FIELDS();
  const pendientes = new Set();
  const texto = rest.join('\n---\n').replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    const [v, label] = F[k] || ['', k];
    if (v) return v;
    pendientes.add(label);
    return `[PENDIENTE: ${label}]`;
  });
  const hash = crypto.createHash('sha256').update(meta.version + '\n' + texto).digest('hex');
  return { doc: name, version: meta.version, titulo: meta.titulo, texto, hash, pendientes: [...pendientes] };
}
export const legalDoc = (n) => (DOCS.includes(n) ? loadDoc(n) : null);
export const versionOf = (n) => loadDoc(n).version;

// ---------------- Aceptaciones ----------------
const REQUIRED = ['terminos', 'autorizacion'];
const KIND = { terminos: 'terminos', autorizacion: 'datos', publicidad: 'publicidad' };
const okCache = new Map();
export function consentState(userId) {
  const last = (kind) => db.prepare('SELECT version, granted, created_at FROM consents WHERE user_id=? AND kind=? ORDER BY id DESC LIMIT 1').get(userId, kind);
  const out = {};
  for (const d of [...REQUIRED, 'publicidad']) {
    const cur = versionOf(d);
    const l = last(KIND[d]);
    out[d] = { version: cur, aceptada: !!(l && l.granted && l.version === cur), ultima: l || null };
  }
  out.pendiente = REQUIRED.some((d) => !out[d].aceptada);
  return out;
}
export function needsConsent(userId) {
  const key = `${userId}:${REQUIRED.map(versionOf).join('|')}`;
  if (okCache.get(userId) === key) return false;
  const pend = consentState(userId).pendiente;
  if (!pend) okCache.set(userId, key);
  return pend;
}

// ---------------- Diario de eliminaciones ----------------
// Fuera de la base: si se restaura una copia antigua, estas eliminaciones se vuelven a aplicar
export const JOURNAL = path.join(STORAGE, 'eliminaciones.jsonl');
export function journal(entry) { fs.appendFileSync(JOURNAL, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n'); }
export function replayJournal(dbx = db) {
  if (!fs.existsSync(JOURNAL)) return 0;
  let n = 0;
  for (const line of fs.readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean)) {
    try {
      const j = JSON.parse(line);
      if (j.tipo === 'usuario') { dbx.prepare('DELETE FROM users WHERE id=? AND username=?').run(j.id, j.username); dbx.prepare('DELETE FROM branding WHERE user_id=?').run(j.id); n++; }
      if (j.tipo === 'retiro_contacto') { dbx.prepare('INSERT OR IGNORE INTO suppressions(value,reason) VALUES(?,?)').run(j.value, 'reaplicado'); n++; }
    } catch { /* línea dañada */ }
  }
  return n;
}
export function deleteUser(req, id) {
  const u = db.prepare('SELECT id, username FROM users WHERE id=?').get(id);
  if (!u) return false;
  db.prepare('DELETE FROM branding WHERE user_id=?').run(id);
  db.prepare('DELETE FROM ai_usage WHERE user_id=?').run(id);
  db.prepare('DELETE FROM shares WHERE user_id=?').run(id);
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  journal({ tipo: 'usuario', id: u.id, username: u.username });
  audit(req, 'usuario_eliminado', `user:${id}`);
  return true;
}

// ---------------- Rutas ----------------
const TIPOS = {
  conocer: ['consulta', 'Conocer qué datos tienen sobre mí'],
  uso: ['consulta', 'Saber cómo se han usado mis datos'],
  prueba: ['consulta', 'Pedir prueba de la autorización'],
  actualizar: ['reclamo', 'Actualizar o rectificar mis datos'],
  suprimir: ['reclamo', 'Suprimir mis datos'],
  revocar: ['reclamo', 'Revocar la autorización'],
  retirar_contacto: ['reclamo', 'Retirar los datos de contacto de una empresa o persona que aparecen en la plataforma'],
  cerrar_cuenta: ['reclamo', 'Cerrar mi cuenta'],
  incumplimiento: ['reclamo', 'Reportar un posible incumplimiento'],
};
export const TIPOS_DERECHOS = Object.fromEntries(Object.entries(TIPOS).map(([k, v]) => [k, { clase: v[0], label: v[1] }]));
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const emailOk = (m) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(m);
const radicado = () => `RS-${hoyBogota().replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const requestView = (r) => {
  const hoy = hoyBogota();
  return { ...r, tipo_label: TIPOS[r.tipo]?.[1] || r.tipo, dias_restantes: r.closed_at ? null : habilesEntre(hoy, r.due_at), vencida: !r.closed_at && r.due_at < hoy };
};

export function privacyRoutes({ requireUser, requireAdmin, isPaid }) {
  const r = express.Router();

  // Documentos (públicos, sin sesión)
  r.get('/legal', (req, res) => res.json(DOCS.map((d) => { const x = loadDoc(d); return { doc: d, titulo: x.titulo, version: x.version, pendientes: x.pendientes.length }; })));
  r.get('/legal/:doc', (req, res) => { const d = legalDoc(req.params.doc); return d ? res.json(d) : res.status(404).json({ error: 'No encontrado' }); });

  // Estado y registro de aceptaciones del usuario
  r.get('/consents', requireUser, (req, res) => res.json(consentState(req.user.id)));
  r.post('/consents', requireUser, (req, res) => {
    const b = req.body || {};
    const ins = db.prepare('INSERT INTO consents(user_id,kind,version,granted,text_hash,ip,ua) VALUES(?,?,?,?,?,?,?)');
    const cur = consentState(req.user.id);
    for (const d of ['terminos', 'autorizacion', 'publicidad']) {
      if (b[d] === undefined) continue;
      const doc = loadDoc(d);
      if (b.versions?.[d] && b.versions[d] !== doc.version) return res.status(409).json({ error: 'El texto cambió mientras lo leías. Recarga para ver la versión vigente.' });
      const granted = b[d] === true;
      if (REQUIRED.includes(d) && !granted) return res.status(400).json({ error: 'Para usar la plataforma necesitas aceptar los términos y autorizar el tratamiento de los datos de tu cuenta.' });
      // Solo se registra un cambio real (o la primera respuesta) para no llenar la tabla
      if (cur[d].ultima && cur[d].ultima.version === doc.version && !!cur[d].ultima.granted === granted) continue;
      ins.run(req.user.id, KIND[d], doc.version, granted ? 1 : 0, doc.hash, ipShort(req), uaShort(req));
      audit(req, granted ? 'aceptacion' : 'rechazo_o_retiro', d, { version: doc.version });
    }
    okCache.delete(req.user.id);
    res.json(consentState(req.user.id));
  });
  // Prueba de la autorización: historial completo de aceptaciones del usuario
  r.get('/me/consents', requireUser, (req, res) => res.json(db.prepare('SELECT kind, version, granted, text_hash, created_at FROM consents WHERE user_id=? ORDER BY id DESC').all(req.user.id)));

  // Solicitudes de titulares: abiertas sin sesión, con límite por IP
  r.get('/derechos/tipos', (req, res) => res.json(TIPOS_DERECHOS));
  r.post('/derechos', (req, res) => {
    const h = hit(`derechos:${ipOf(req)}`, 5, 3600);
    if (!h.ok) return res.status(429).json({ error: 'Recibimos varias solicitudes desde esta conexión. Intenta de nuevo en una hora o escríbenos al correo de atención.' });
    const b = req.body || {};
    const tipo = TIPOS[b.tipo] ? b.tipo : null;
    const nombre = str(b.nombre || req.user?.name || req.user?.username, 120);
    const correo = str(b.correo, 190).toLowerCase();
    const detalle = str(b.detalle, 4000);
    const errores = {};
    if (!tipo) errores.tipo = 'Elige el tipo de solicitud.';
    if (nombre.length < 3) errores.nombre = 'Escribe tu nombre o el de la empresa.';
    if (!emailOk(correo)) errores.correo = 'Escribe un correo válido para enviarte la respuesta.';
    if (detalle.length < 10) errores.detalle = 'Cuéntanos qué necesitas (al menos 10 caracteres).';
    if (tipo === 'retirar_contacto' && str(b.referencia, 200).length < 3) errores.referencia = 'Indica el NIT o el nombre de la empresa o registro.';
    if (Object.keys(errores).length) return res.status(400).json({ error: 'Revisa los campos marcados.', errores });
    const clase = TIPOS[tipo][0];
    const hoy = hoyBogota();
    const due = sumarHabiles(hoy, clase === 'consulta' ? 10 : 15);
    const rad = radicado();
    db.prepare('INSERT INTO rights_requests(radicado,clase,tipo,nombre,correo,relacion,referencia,detalle,user_id,due_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(rad, clase, tipo, nombre, correo, str(b.relacion, 60) || null, str(b.referencia, 200) || null, detalle, req.user?.id || null, due);
    audit(req, 'solicitud_titular', rad, { tipo });
    res.json({ radicado: rad, clase, vence: due, mensaje: `Recibimos tu solicitud. Tu número de radicado es ${rad}. La respuesta llegará a ${correo} a más tardar el ${due}.` });
  });
  r.post('/derechos/estado', (req, res) => {
    const h = hit(`derechos_estado:${ipOf(req)}`, 20, 3600);
    if (!h.ok) return res.status(429).json({ error: 'Demasiadas consultas. Intenta más tarde.' });
    const row = db.prepare('SELECT radicado, clase, tipo, status, due_at, extended, created_at, closed_at, response FROM rights_requests WHERE radicado=? AND correo=?')
      .get(str(req.body?.radicado, 40).toUpperCase(), str(req.body?.correo, 190).toLowerCase());
    if (!row) return res.status(404).json({ error: 'No encontramos una solicitud con ese radicado y ese correo.' });
    res.json(requestView(row));
  });

  // Sesiones del usuario
  // (se registran en index.js porque dependen de auth.js)

  // Enlaces compartidos: el usuario ve los suyos y puede revocarlos
  r.get('/shares', requireUser, (req, res) => res.json(db.prepare('SELECT id, code, profile, created_at, expires_at, revoked_at FROM shares WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(req.user.id)));
  r.delete('/shares/:id', requireUser, (req, res) => {
    const x = db.prepare('UPDATE shares SET revoked_at=datetime(\'now\') WHERE id=? AND user_id=? AND revoked_at IS NULL').run(String(req.params.id).slice(0, 40), req.user.id);
    if (!x.changes) return res.status(404).json({ error: 'No encontrado' });
    audit(req, 'enlace_revocado', req.params.id);
    res.json({ ok: true });
  });

  // ---------------- Administración ----------------
  const a = express.Router();
  a.use(requireUser, requireAdmin);
  a.get('/derechos', (req, res) => res.json(db.prepare('SELECT * FROM rights_requests ORDER BY (closed_at IS NOT NULL), due_at LIMIT 500').all().map(requestView)));
  a.patch('/derechos/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM rights_requests WHERE id=?').get(+req.params.id);
    if (!row) return res.status(404).json({ error: 'No existe' });
    const b = req.body || {};
    const STATUS = ['recibida', 'en_tramite', 'incompleta', 'resuelta', 'rechazada', 'desistida'];
    let due = row.due_at, extended = row.extended, reason = row.extension_reason;
    if (b.prorrogar) {
      if (row.extended) return res.status(400).json({ error: 'La solicitud ya tuvo prórroga.' });
      if (row.due_at < hoyBogota()) return res.status(400).json({ error: 'La prórroga debe informarse antes del vencimiento.' });
      if (str(b.prorrogar, 500).length < 10) return res.status(400).json({ error: 'Escribe el motivo de la prórroga que se le informará al titular.' });
      due = sumarHabiles(row.due_at, row.clase === 'consulta' ? 5 : 8); extended = 1; reason = str(b.prorrogar, 500);
    }
    const status = STATUS.includes(b.status) ? b.status : row.status;
    const closed = ['resuelta', 'rechazada', 'desistida'].includes(status);
    if (closed && !str(b.response ?? row.response, 4000)) return res.status(400).json({ error: 'Escribe la respuesta antes de cerrar la solicitud.' });
    db.prepare('UPDATE rights_requests SET status=?, response=?, due_at=?, extended=?, extension_reason=?, assigned_to=?, updated_at=datetime(\'now\'), closed_at=? WHERE id=?')
      .run(status, b.response !== undefined ? str(b.response, 4000) : row.response, due, extended, reason, req.user.id, closed ? (row.closed_at || new Date().toISOString()) : null, row.id);
    audit(req, 'solicitud_actualizada', row.radicado, { status, prorroga: !!b.prorrogar });
    res.json(requestView(db.prepare('SELECT * FROM rights_requests WHERE id=?').get(row.id)));
  });
  a.get('/suppressions', (req, res) => res.json(db.prepare('SELECT * FROM suppressions ORDER BY id DESC').all()));
  a.post('/suppressions', (req, res) => {
    const value = str(req.body?.value, 60).replace(/\s/g, '');
    if (!/^[0-9A-Za-z._-]{3,60}$/.test(value)) return res.status(400).json({ error: 'Escribe el NIT (solo números) o el identificador del registro.' });
    db.prepare('INSERT OR IGNORE INTO suppressions(value,reason,request_id) VALUES(?,?,?)').run(value, str(req.body?.reason, 300) || null, +req.body?.request_id || null);
    journal({ tipo: 'retiro_contacto', value });
    reloadSuppressions();
    audit(req, 'contacto_retirado', value);
    res.json({ ok: true });
  });
  a.get('/audit', (req, res) => res.json(db.prepare('SELECT a.*, u.username FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 300').all()));
  a.get('/legal-pendientes', (req, res) => res.json(DOCS.map((d) => { const x = loadDoc(d); return { doc: d, titulo: x.titulo, pendientes: x.pendientes }; }).filter((x) => x.pendientes.length)));
  a.get('/consents', (req, res) => res.json(db.prepare(`SELECT u.id, u.username, u.company,
      (SELECT version FROM consents c WHERE c.user_id=u.id AND c.kind='terminos' AND c.granted=1 ORDER BY id DESC LIMIT 1) terminos,
      (SELECT version FROM consents c WHERE c.user_id=u.id AND c.kind='datos' AND c.granted=1 ORDER BY id DESC LIMIT 1) datos,
      (SELECT granted FROM consents c WHERE c.user_id=u.id AND c.kind='publicidad' ORDER BY id DESC LIMIT 1) publicidad
    FROM users u ORDER BY u.id DESC`).all()));
  r.use('/admin', a);
  return r;
}
