// Gestión de usuarios desde la terminal.
// npm run admin -- crear <usuario> <contraseña> [trial|paid|admin] [todos|instalador|proveedor|desarrollador]
// npm run admin -- perfil <usuario> <todos|instalador|proveedor|desarrollador>
// npm run admin -- clave <usuario> <nueva_contraseña>
// npm run admin -- rol <usuario> <trial|paid|admin>
// npm run admin -- listar
import { db } from './db.js';
import { hashPassword, validatePassword, validateUsername } from './auth.js';
const [cmd, a, b, c, d] = process.argv.slice(2);
const PERFILES = ['todos', 'instalador', 'proveedor', 'desarrollador'];
if (cmd === 'crear') {
  if (!validateUsername(a) || !validatePassword(b)) { console.error('Usuario o contraseña inválidos (mínimo 8 caracteres).'); process.exit(1); }
  if (d && !PERFILES.includes(d)) { console.error('Perfil inválido: ' + PERFILES.join(', ')); process.exit(1); }
  db.prepare('INSERT INTO users(username,pass_hash,role,profile) VALUES(?,?,?,?)').run(a, hashPassword(b), c || 'trial', d || 'todos');
  console.log(`Usuario ${a} creado con rol ${c || 'trial'} y perfil ${d || 'todos'}`);
} else if (cmd === 'clave') {
  if (!validatePassword(b)) { console.error('Mínimo 8 caracteres'); process.exit(1); }
  const r = db.prepare('UPDATE users SET pass_hash=? WHERE username=?').run(hashPassword(b), a); console.log(r.changes ? 'Contraseña cambiada' : 'No existe');
} else if (cmd === 'rol') {
  const r = db.prepare('UPDATE users SET role=? WHERE username=?').run(b, a); console.log(r.changes ? 'Rol actualizado' : 'No existe');
} else if (cmd === 'perfil') {
  if (!PERFILES.includes(b)) { console.error('Perfil inválido: ' + PERFILES.join(', ')); process.exit(1); }
  const r = db.prepare('UPDATE users SET profile=? WHERE username=?').run(b, a); console.log(r.changes ? 'Perfil actualizado' : 'No existe');
} else if (cmd === 'listar') {
  console.table(db.prepare('SELECT id, username, role, profile, paid_until, active, last_login FROM users').all());
} else console.log('Comandos: crear | clave | rol | perfil | listar');
