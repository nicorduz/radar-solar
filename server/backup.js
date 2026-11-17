// Copias de seguridad cifradas (AES-256-GCM) de la base, los documentos cargados y el diario de eliminaciones.
// Se guardan en DATA_DIR/backups y, si se configura, en un almacenamiento S3 compatible (R2, B2, S3) separado del hosting.
//
// Restaurar (en un entorno aislado o con el servidor detenido):
//   BACKUP_KEY=… node server/backup.js restaurar <archivo.rsbk> <carpeta destino>
// Probar que una copia se puede abrir sin restaurarla:
//   BACKUP_KEY=… node server/backup.js verificar <archivo.rsbk>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config, STORAGE } from './config.js';

const DIR = path.join(STORAGE, 'backups');
const MAGIC = Buffer.from('RSBK1');

function keyBytes() {
  const k = config.backup.key.trim();
  if (/^[0-9a-f]{64}$/i.test(k)) return Buffer.from(k, 'hex');
  const b = Buffer.from(k, 'base64');
  if (b.length === 32) return b;
  // Una frase larga también sirve: se deriva una clave de 32 bytes con scrypt
  if (k.length >= 24) return crypto.scryptSync(k, 'radar-solar-respaldo', 32);
  throw new Error('BACKUP_KEY debe ser 32 bytes en hex o base64, o una frase de al menos 24 caracteres.');
}
// Empaquetado simple: [longitud del índice][índice JSON][contenido de cada archivo]
function pack(files) {
  const index = files.map((f) => ({ name: f.name, size: f.data.length }));
  const head = Buffer.from(JSON.stringify(index));
  const len = Buffer.alloc(4); len.writeUInt32BE(head.length);
  return Buffer.concat([len, head, ...files.map((f) => f.data)]);
}
function unpack(buf) {
  const n = buf.readUInt32BE(0);
  const index = JSON.parse(buf.subarray(4, 4 + n).toString());
  let off = 4 + n;
  return index.map((f) => { const data = buf.subarray(off, off + f.size); off += f.size; return { name: f.name, data }; });
}
export function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', keyBytes(), iv);
  const body = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}
export function decrypt(buf) {
  if (!buf.subarray(0, 5).equals(MAGIC)) throw new Error('No es un respaldo de Radar Solar.');
  const iv = buf.subarray(5, 17), tag = buf.subarray(17, 33);
  const d = crypto.createDecipheriv('aes-256-gcm', keyBytes(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(33)), d.final()]);
}

export function listBackups() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.rsbk')).sort().reverse().map((f) => ({ archivo: f, bytes: fs.statSync(path.join(DIR, f)).size }));
}

export async function createBackup(reason = 'programado') {
  if (!config.backup.key) throw Object.assign(new Error('Las copias de seguridad no están activas: falta BACKUP_KEY.'), { status: 400 });
  fs.mkdirSync(DIR, { recursive: true });
  // Copia consistente de SQLite aunque haya escrituras en curso
  const tmp = path.join(DIR, `.tmp-${Date.now()}.db`);
  const src = new DatabaseSync(path.join(STORAGE, 'app.db'));
  src.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  src.close();
  const files = [{ name: 'app.db', data: fs.readFileSync(tmp) }];
  fs.rmSync(tmp, { force: true });
  const up = path.join(STORAGE, 'uploads');
  if (fs.existsSync(up)) for (const f of fs.readdirSync(up)) files.push({ name: `uploads/${f}`, data: fs.readFileSync(path.join(up, f)) });
  const j = path.join(STORAGE, 'eliminaciones.jsonl');
  if (fs.existsSync(j)) files.push({ name: 'eliminaciones.jsonl', data: fs.readFileSync(j) });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
  const name = `rs-${stamp}-${reason}.rsbk`;
  const out = encrypt(pack(files));
  fs.writeFileSync(path.join(DIR, name), out, { mode: 0o600 });
  // Rotación local
  for (const old of listBackups().slice(config.backup.keep)) fs.rmSync(path.join(DIR, old.archivo), { force: true });
  let externo = null;
  if (config.backup.s3.endpoint && config.backup.s3.bucket) externo = await uploadS3(name, out);
  console.log(`Respaldo creado: ${name} (${(out.length / 1e6).toFixed(1)} MB)${externo ? ', copiado al almacenamiento externo' : ''}`);
  return { archivo: name, bytes: out.length, externo };
}

async function uploadS3(name, body) {
  const { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
  const s = config.backup.s3;
  const client = new S3Client({ region: s.region, endpoint: s.endpoint, credentials: { accessKeyId: s.key, secretAccessKey: s.secret }, forcePathStyle: true });
  await client.send(new PutObjectCommand({ Bucket: s.bucket, Key: s.prefix + name, Body: body, ContentType: 'application/octet-stream' }));
  // Conserva las últimas BACKUP_KEEP copias también en el almacenamiento externo
  const list = await client.send(new ListObjectsV2Command({ Bucket: s.bucket, Prefix: s.prefix }));
  const old = (list.Contents || []).map((o) => o.Key).filter((k) => k.endsWith('.rsbk')).sort().reverse().slice(config.backup.keep);
  if (old.length) await client.send(new DeleteObjectsCommand({ Bucket: s.bucket, Delete: { Objects: old.map((Key) => ({ Key })) } }));
  return s.prefix + name;
}

export function startBackups() {
  if (!config.backup.key) { console.warn('Copias de seguridad desactivadas: define BACKUP_KEY para activarlas.'); return; }
  try { keyBytes(); } catch (e) { console.error(e.message); return; }
  const run = () => createBackup('programado').catch((e) => console.error('Respaldo fallido:', e.message));
  setTimeout(run, 60e3).unref();
  setInterval(run, config.backup.hours * 3600e3).unref();
}

// Restauración: escribe la base, los documentos y el diario en la carpeta destino y vuelve a aplicar las eliminaciones
export async function restore(file, dest) {
  const files = unpack(decrypt(fs.readFileSync(file)));
  fs.mkdirSync(path.join(dest, 'uploads'), { recursive: true });
  const journalDest = path.join(dest, 'eliminaciones.jsonl');
  for (const f of files) {
    if (f.name.includes('..')) throw new Error('Respaldo con rutas no válidas.');
    if (f.name === 'eliminaciones.jsonl') {
      // Se unen las eliminaciones del respaldo con las que ya existan en el destino (nunca se pierden supresiones posteriores)
      const prev = fs.existsSync(journalDest) ? fs.readFileSync(journalDest, 'utf8') : '';
      const lines = new Set([...prev.split('\n'), ...f.data.toString().split('\n')].filter(Boolean));
      fs.writeFileSync(journalDest, [...lines].join('\n') + '\n');
    } else fs.writeFileSync(path.join(dest, f.name), f.data);
  }
  const db = new DatabaseSync(path.join(dest, 'app.db'));
  let n = 0;
  if (fs.existsSync(journalDest)) {
    for (const line of fs.readFileSync(journalDest, 'utf8').split('\n').filter(Boolean)) {
      const j = JSON.parse(line);
      if (j.tipo === 'usuario') { db.prepare('DELETE FROM users WHERE id=? AND username=?').run(j.id, j.username); db.prepare('DELETE FROM branding WHERE user_id=?').run(j.id); n++; }
      if (j.tipo === 'retiro_contacto') { db.prepare('INSERT OR IGNORE INTO suppressions(value,reason) VALUES(?,?)').run(j.value, 'reaplicado al restaurar'); n++; }
    }
  }
  // Las sesiones de la copia no se reutilizan: todos vuelven a ingresar
  db.exec('DELETE FROM sessions');
  db.close();
  return { archivos: files.length, eliminaciones_reaplicadas: n };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const [, , cmd, file, dest] = process.argv;
  if (cmd === 'restaurar' && file && dest) restore(file, dest).then((r) => console.log('Restaurado:', r)).catch((e) => { console.error(e.message); process.exit(1); });
  else if (cmd === 'verificar' && file) {
    try { const f = unpack(decrypt(fs.readFileSync(file))); console.log('Respaldo válido:', f.map((x) => `${x.name} (${x.data.length} B)`).join(', ')); }
    catch { console.error('No se pudo abrir el respaldo: la clave BACKUP_KEY no corresponde o el archivo está dañado.'); process.exit(1); }
  }
  else if (cmd === 'crear') createBackup('manual').then((r) => console.log(r)).catch((e) => { console.error(e.message); process.exit(1); });
  else console.log('Uso: node server/backup.js crear | verificar <archivo> | restaurar <archivo> <carpeta destino>');
}
