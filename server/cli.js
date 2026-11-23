// Gestión de usuarios desde la terminal del servidor (requiere acceso al servidor, no a la web).
// npm run admin -- crear <usuario> <contraseña> [trial|paid|admin] [perfil]
// npm run admin -- perfil <usuario> <todos|instalador|proveedor|desarrollador|servicios|demanda>
// npm run admin -- clave <usuario> <nueva_contraseña>
// npm run admin -- rol <usuario> <trial|paid|admin>
// npm run admin -- reiniciar-mfa <usuario>      (si un administrador perdió su teléfono y sus códigos de recuperación)
// npm run admin -- listar
import { db } from './db.js';
import { hashPassword, passwordProblem, validateUsername } from './auth.js';
const [cmd, a, b, c, d] = process.argv.slice(2);
const PERFILES = ['todos', 'instalador', 'proveedor', 'desarrollador', 'servicios', 'demanda'];
const fail = (m) => { console.error(m); process.exit(1); };
if (cmd === 'crear') {
  if (!validateUsername(a)) fail('Usuario inválido (3-60 caracteres: letras, números, . _ - @).');
  const prob = passwordProblem(b, a); if (prob) fail(prob);
  if (c && !['trial', 'paid', 'admin'].includes(c)) fail('Rol inválido: trial, paid o admin');
  if (d && !PERFILES.includes(d)) fail('Perfil inválido: ' + PERFILES.join(', '));
  db.prepare('INSERT INTO users(username,pass_hash,role,profile) VALUES(?,?,?,?)').run(a, await hashPassword(b), c || 'trial', d || 'todos');
  console.log(`Usuario ${a} creado con rol ${c || 'trial'} y perfil ${d || 'todos'}`);
} else if (cmd === 'clave') {
  const prob = passwordProblem(b, a); if (prob) fail(prob);
  const r = db.prepare('UPDATE users SET pass_hash=?, must_change_pw=0 WHERE username=?').run(await hashPassword(b), a);
  if (r.changes) db.prepare('DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username=?)').run(a);
  console.log(r.changes ? 'Contraseña cambiada y sesiones cerradas' : 'No existe');
} else if (cmd === 'rol') {
  if (!['trial', 'paid', 'admin'].includes(b)) fail('Rol inválido: trial, paid o admin');
  const r = db.prepare('UPDATE users SET role=? WHERE username=?').run(b, a);
  if (r.changes) db.prepare('DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username=?)').run(a);
  console.log(r.changes ? 'Rol actualizado' : 'No existe');
} else if (cmd === 'perfil') {
  if (!PERFILES.includes(b)) fail('Perfil inválido: ' + PERFILES.join(', '));
  const r = db.prepare('UPDATE users SET profile=? WHERE username=?').run(b, a); console.log(r.changes ? 'Perfil actualizado' : 'No existe');
} else if (cmd === 'reiniciar-mfa') {
  const r = db.prepare('UPDATE users SET mfa_enabled=0, mfa_secret=NULL, mfa_recovery=NULL WHERE username=?').run(a);
  if (r.changes) db.prepare('DELETE FROM sessions WHERE user_id=(SELECT id FROM users WHERE username=?)').run(a);
  console.log(r.changes ? 'Verificación en dos pasos reiniciada: deberá activarla de nuevo al ingresar' : 'No existe');
} else if (cmd === 'listar') {
  console.table(db.prepare('SELECT id, username, role, profile, paid_until, active, mfa_enabled, last_login FROM users').all());
} else console.log('Comandos: crear | clave | rol | perfil | reiniciar-mfa | listar');
