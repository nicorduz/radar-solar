// Descarga la altitud de cada cabecera municipal (Open-Meteo, gratuito) para estimar temperatura.
import fs from 'node:fs';
const divi = JSON.parse(fs.readFileSync(process.argv[2] || 'data/raw/divipola.json'));
const out = {};
for (let i = 0; i < divi.length; i += 50) {
  const b = divi.slice(i, i + 50);
  const lat = b.map((d) => d.latitud.replace(',', '.')).join(',');
  const lon = b.map((d) => d.longitud.replace(',', '.')).join(',');
  let j;
  for (let a = 0; a < 5; a++) {
    const r = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
    j = await r.json();
    if (j.elevation) break;
    console.log('reintento', i, JSON.stringify(j).slice(0, 120));
    await new Promise((res) => setTimeout(res, 3000 * (a + 1)));
  }
  if (!j.elevation) continue;
  b.forEach((d, k) => { out[d.cod_mpio] = j.elevation[k]; });
}
fs.writeFileSync(process.argv[3] || 'data/raw/elevacion.json', JSON.stringify(out));
console.log('ok', Object.keys(out).length);
