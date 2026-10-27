// Construye la base consolidada por municipio a partir de los archivos crudos.
// Uso: node server/etl/build.js [carpetaRaw] [carpetaSalida]
// Lo usa también el panel de administración cuando se suben archivos nuevos.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { ORS, DEPT_DEFAULT_OR, MUNI_OR_OVERRIDE, CIIU_CATS, matchOrKey } from './catalogs.js';
import { parseUpme } from './upme.js';
import { parseSuiPrecios } from './sui_precios.js';
import { dptoIndex, applySuiPrecios, applyAgpeXm, applyDna, precioBolsa, applyTurismo, clientesTuristicos, applyRed, applyZni } from './extra.js';

const norm = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; };
const readJSON = (dir, f) => { const p = path.join(dir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : []; };
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

async function readSheetRows(file, sheetName, onRow) {
  const wb = new ExcelJS.stream.xlsx.WorkbookReader(file, { sharedStrings: 'cache', worksheets: 'emit' });
  for await (const ws of wb) {
    if (ws.name !== sheetName) { for await (const _ of ws) { /* skip */ } continue; }
    for await (const row of ws) onRow(row.values.slice(1));
  }
}

export async function build(rawDir, outDir) {
  const log = [];
  const t0 = Date.now();
  // ---------- Municipios (DIVIPOLA) ----------
  const divi = readJSON(rawDir, 'divipola.json');
  const munis = new Map();
  for (const d of divi) {
    munis.set(d.cod_mpio, {
      code: d.cod_mpio, dpto_code: d.cod_dpto, name: titleCase(d.nom_mpio), dpto: titleCase(d.dpto),
      lat: num(d.latitud), lon: num(d.longitud), tipo: d.tipo_municipio,
    });
    if (d.cod_mpio === '11001') Object.assign(munis.get('11001'), { name: 'Bogotá D.C.', dpto: 'Bogotá D.C.' });
  }
  const byName = new Map();
  for (const m of munis.values()) byName.set(norm(m.dpto) + '|' + norm(m.name), m.code);
  const findMemo = new Map();
  const findMuni = (dpto, name) => {
    const mk = dpto + '|' + name;
    if (!findMemo.has(mk)) findMemo.set(mk, findMuniRaw(dpto, name));
    return findMemo.get(mk);
  };
  const findMuniRaw = (dpto, name) => {
    if (/BOGOTA/.test(norm(dpto)) || /^BOGOTA/.test(norm(name))) return '11001';
    const k = norm(dpto) + '|' + norm(name);
    if (byName.has(k)) return byName.get(k);
    const nn = norm(name);
    for (const [key, code] of byName) if (key.startsWith(norm(dpto)) && (key.endsWith('|' + nn) || key.split('|')[1].startsWith(nn))) return code;
    return null;
  };
  log.push(`municipios: ${munis.size}`);

  // ---------- Población DANE 2026 ----------
  const pobFile = path.join(rawDir, 'pob_mun.xlsx');
  const pobCache = path.join(rawDir, 'pob_cache.json');
  if (fs.existsSync(pobFile) || fs.existsSync(pobCache)) {
    const year = new Date().getFullYear();
    const cacheFile = pobCache;
    const key = fs.existsSync(pobFile) ? `${fs.statSync(pobFile).size}:${year}` : null;
    let pop = null;
    if (fs.existsSync(cacheFile)) { const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (!key || c.key === key) pop = c.pop; }
    if (!pop) {
      pop = {};
      await readSheetRows(pobFile, 'PobMunicipalxÁrea', (r) => { if (r[4] === year && r[5] === 'Total') pop[String(r[2])] = r[6]; });
      fs.writeFileSync(cacheFile, JSON.stringify({ key, pop }));
    }
    for (const [c, v] of Object.entries(pop)) if (munis.has(c)) munis.get(c).pop = v;
    log.push(`población ${year}: ok`);
  }

  // ---------- Radiación NASA POWER ----------
  const power = fs.existsSync(path.join(rawDir, 'power.json')) ? JSON.parse(fs.readFileSync(path.join(rawDir, 'power.json'))) : {};
  for (const [c, v] of Object.entries(power)) if (munis.has(c)) Object.assign(munis.get(c), { ghi: v.ghi, ghi_m: v.ghi_m, t2m: v.t2m });
  log.push(`radiación: ${Object.keys(power).length}`);
  const elev = fs.existsSync(path.join(rawDir, 'elevacion.json')) ? JSON.parse(fs.readFileSync(path.join(rawDir, 'elevacion.json'))) : {};
  for (const [c, e] of Object.entries(elev)) if (munis.has(c) && e != null) { const m = munis.get(c); m.elev = Math.round(e); m.temp = +(28.4 - 0.0058 * e).toFixed(1); }

  // ---------- Autogeneradores (SUI caracterización) ----------
  const agpe = readJSON(rawDir, 'agpe_rows.json');
  const orVotes = new Map();
  for (const a of agpe) {
    const code = String(a.car_t1732_dane_niu || '').padStart(8, '0').slice(0, 5);
    const m = munis.get(code); if (!m) continue;
    m.agpe_n = (m.agpe_n || 0) + 1;
    m.agpe_kw = (m.agpe_kw || 0) + (num(a.replace_car_t1732_capacidad) || 0);
    if (a.tipo_generacion === 'SOLAR') m.agpe_solar = (m.agpe_solar || 0) + 1;
    const ok = matchOrKey(a.are_esp_nombre);
    if (ok) { const v = orVotes.get(code) || {}; v[ok] = (v[ok] || 0) + 1; orVotes.set(code, v); }
  }
  log.push(`autogeneradores SUI: ${agpe.length}`);

  // ---------- Operador de red por municipio ----------
  for (const m of munis.values()) {
    let key = MUNI_OR_OVERRIDE[m.code];
    let src = 'catálogo';
    if (!key && orVotes.has(m.code)) {
      key = Object.entries(orVotes.get(m.code)).sort((a, b) => b[1] - a[1])[0][0]; src = 'SUI (usuarios AGPE)';
    }
    if (!key) { key = DEPT_DEFAULT_OR[m.dpto_code] || null; src = 'departamento'; }
    if (key === 'CELSIA') key = m.dpto_code === '73' ? 'CELSIA_TOL' : 'CELSIA_VAL';
    m.or_key = key; m.or_src = src; m.or_name = key ? ORS[key].name : 'Zona no interconectada';
  }

  // ---------- Tarifas ----------
  const tarifas = {};
  const pub = readJSON(rawDir, 'tarifas_publicadas.json');
  const acc = {};
  for (const t of pub) {
    if (t.estrato_sector !== '4' || t.cargo_horario !== '4') continue;
    const v = num(t.tarifa_nivel1_100_or); if (!v || v < 300) continue;
    const k = matchOrKey(t.empresa); if (!k) continue;
    (acc[k] ||= []).push({ v, p: `${t.car_carg_ano}-${String(t.car_carg_periodo).padStart(2, '0')}` });
  }
  for (const [k, arr] of Object.entries(acc)) {
    const per = arr.map((a) => a.p).sort();
    tarifas[k] = { base: Math.round(median(arr.map((a) => a.v))), base_periodo: `${per[0]} a ${per[per.length - 1]}`, base_fuente: 'SUI · Tarifas publicadas (datos.gov.co 4is2-3nif), estrato 4, nivel 1' };
  }
  // Últimos CU publicados (ENEL, CELSIA, EMCALI)
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const cu = readJSON(rawDir, 'tarifas_cu.json');
  const lastCu = {};
  for (const r of cu) {
    if (!/nivel 1 *\( *propiedad or *\)/i.test(r.nivel)) continue;
    const k = matchOrKey(r.operador_de_red); if (!k) continue;
    const per = `${r.a_o}-${String(meses.indexOf(String(r.periodo).toLowerCase()) + 1).padStart(2, '0')}`;
    (lastCu[k] ||= []).push({ per, v: num(r.cu_total) });
  }
  for (const [k, arr] of Object.entries(lastCu)) {
    arr.sort((a, b) => a.per.localeCompare(b.per));
    const l = arr[arr.length - 1];
    (tarifas[k] ||= {}).ultimo = Math.round(l.v); tarifas[k].ultimo_periodo = l.per; tarifas[k].ultimo_fuente = 'Tarifas y costos mercado regulado (datos.gov.co ytme-6qnu)';
    tarifas[k].serie = arr.slice(-18).map((a) => ({ p: a.per, v: Math.round(a.v) }));
  }
  const chec = readJSON(rawDir, 'tarifas_chec.json').filter((r) => r.nivel_tension_codigo === '1' && /100/.test(r.modalidadcobro_propiedad || '') && r.claseservicio_estrato === '4');
  if (chec.length) {
    chec.sort((a, b) => (a.costounitariotarifa_ano + String(a.costounitariotarifa_mes).padStart(2, '0')).localeCompare(b.costounitariotarifa_ano + String(b.costounitariotarifa_mes).padStart(2, '0')));
    const l = chec[chec.length - 1];
    tarifas.CHEC = { ...(tarifas.CHEC || {}), ultimo: Math.round(num(l.costounitariotarifa_cu)), ultimo_periodo: `${l.costounitariotarifa_ano}-${String(l.costounitariotarifa_mes).padStart(2, '0')}`, ultimo_fuente: 'CHEC costo unitario (datos.gov.co c698-wqig)' };
  }
  // Cargas manuales del administrador (CSV con columnas or_key/operador, periodo, cu)
  const manual = readJSON(rawDir, 'tarifas_manual.json');
  for (const r of manual) {
    const k = ORS[r.or_key] ? r.or_key : matchOrKey(r.operador || r.or_key); if (!k || !num(r.cu)) continue;
    const t = (tarifas[k] ||= {});
    if (!t.ultimo_periodo || String(r.periodo) >= t.ultimo_periodo) { t.ultimo = Math.round(num(r.cu)); t.ultimo_periodo = String(r.periodo); t.ultimo_fuente = r.fuente || 'Carga manual (SUI O3)'; }
  }
  // Si una carga manual cubre al menos 15 operadores en un mismo periodo, esa serie pasa a ser la base comparable del ranking
  const porPeriodo = {};
  for (const r of manual) { const k = ORS[r.or_key] ? r.or_key : matchOrKey(r.operador || r.or_key); if (k && num(r.cu)) (porPeriodo[r.periodo] ||= {})[k] = num(r.cu); }
  const periodoBase = Object.keys(porPeriodo).filter((p) => Object.keys(porPeriodo[p]).length >= 15).sort().pop();
  if (periodoBase) {
    for (const [k, v] of Object.entries(porPeriodo[periodoBase])) Object.assign((tarifas[k] ||= {}), { base: Math.round(v), base_periodo: periodoBase, base_fuente: 'Carga manual SUI (periodo comparable)' });
    log.push(`tarifas base del ranking: carga manual ${periodoBase}`);
  }
  if (tarifas.CELSIA) for (const k of ['CELSIA_TOL', 'CELSIA_VAL']) tarifas[k] = { ...tarifas.CELSIA, ...(tarifas[k] || {}) };
  delete tarifas.CELSIA;
  for (const m of munis.values()) {
    const t = tarifas[m.or_key];
    if (t) { m.tarifa = t.base ?? null; m.tarifa_periodo = t.base_periodo; m.tarifa_ult = t.ultimo ?? t.base ?? null; m.tarifa_ult_periodo = t.ultimo_periodo || t.base_periodo || null; }
  }
  log.push(`tarifas: ${Object.keys(tarifas).length} operadores`);

  // ---------- Tarifas y consumo SUI (reporte de facturación exportado del SUI) ----------
  const dptoCode = dptoIndex(munis);
  let suiPeriodo = null;
  const suiFile = fs.readdirSync(rawDir).find((f) => /^sui_precios.*\.xlsx$/i.test(f));
  if (suiFile) {
    const cacheFile = path.join(rawDir, 'sui_precios_cache.json');
    const key = `${suiFile}:${fs.statSync(path.join(rawDir, suiFile)).size}`;
    let rows = null;
    if (fs.existsSync(cacheFile)) { const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (c.key === key) rows = c.rows; }
    if (!rows) { rows = await parseSuiPrecios(path.join(rawDir, suiFile)); fs.writeFileSync(cacheFile, JSON.stringify({ key, rows })); }
    suiPeriodo = applySuiPrecios(munis, rows, tarifas, log, dptoCode);
    if (suiPeriodo) for (const m of munis.values()) if (m.tarifa && m.tarifa_ult_periodo && m.tarifa_ult_periodo < suiPeriodo.slice(0, 4)) { m.tarifa_ult = m.tarifa; m.tarifa_ult_periodo = m.tarifa_periodo; }
  }

  // ---------- Licencias de construcción DANE ELIC ----------
  const elicFile = fs.readdirSync(rawDir).find((f) => /SerieTipoBaseMun.*\.xlsx$/i.test(f));
  const elicCacheFile = path.join(rawDir, 'elic_cache.json');
  let elicCorte = null;
  if (elicFile || fs.existsSync(elicCacheFile)) {
    // Caché: el Excel del DANE pesa ~20 MB; solo se vuelve a leer si cambia el tamaño del archivo
    const cacheFile = elicCacheFile;
    const key = elicFile ? `${fs.statSync(path.join(rawDir, elicFile)).size}` : null;
    let rows = null;
    if (fs.existsSync(cacheFile)) { const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (!key || c.key === key) rows = c.rows; }
    if (!rows) {
      const all = [];
      await readSheetRows(path.join(rawDir, elicFile), 'elic', (r) => { if (typeof r[0] === 'number') all.push(r.slice(0, 13)); });
      let mx = 0;
      for (const r of all) { const ym = r[0] * 100 + parseInt(r[1], 10); if (ym > mx) mx = ym; }
      const minY = Math.floor(mx / 100) - 2;
      rows = all.filter((r) => r[0] >= minY);
      fs.writeFileSync(cacheFile, JSON.stringify({ key, rows }));
    }
    let maxYm = 0;
    for (const r of rows) { const ym = r[0] * 100 + parseInt(r[1], 10); if (ym > maxYm) maxYm = ym; }
    elicCorte = `${Math.floor(maxYm / 100)}-${String(maxYm % 100).padStart(2, '0')}`;
    const ymIndex = (ym) => (Math.floor(maxYm / 100) - Math.floor(ym / 100)) * 12 + (maxYm % 100 - ym % 100); // 0 = último mes
    for (const r of rows) {
      const [y, mo, dp, mu, , clase, , destino, tipoVivi, vis, estrato, area, unidades] = r;
      const code = String(dp).padStart(2, '0') + String(mu).padStart(3, '0');
      const m = munis.get(code); if (!m) continue;
      const idx = ymIndex(y * 100 + parseInt(mo, 10));
      if (idx < 0 || idx > 23) continue;
      m.viv_serie ||= Array(24).fill(0);
      if (destino === 1) m.viv_serie[23 - idx] += unidades || 0;
      if (idx > 11) { if (destino === 1) m.viv_prev12 = (m.viv_prev12 || 0) + (unidades || 0); continue; }
      if (destino === 1) {
        m.viv12 = (m.viv12 || 0) + (unidades || 0);
        if (estrato >= 4) m.viv12_alto = (m.viv12_alto || 0) + (unidades || 0);
        if (vis === 2) m.viv12_novis = (m.viv12_novis || 0) + (unidades || 0);
        if (tipoVivi === 1) m.viv12_casas = (m.viv12_casas || 0) + (unidades || 0);
        if (tipoVivi === 1 && estrato >= 4) m.viv12_casas_alto = (m.viv12_casas_alto || 0) + (unidades || 0);
        if ((clase === 2 || clase === 3) && estrato >= 4) m.viv12_rural_alto = (m.viv12_rural_alto || 0) + (unidades || 0);
        if (clase === 2 || clase === 3) m.viv12_rural = (m.viv12_rural || 0) + (unidades || 0);
        m.viv12_estr ||= [0, 0, 0, 0, 0, 0];
        if (estrato >= 1 && estrato <= 6) m.viv12_estr[estrato - 1] += unidades || 0;
      } else if ([2, 4, 5, 6, 7, 8, 11].includes(destino)) {
        m.nores12_m2 = (m.nores12_m2 || 0) + (area || 0);
        if (destino === 5 || destino === 6) m.comer12_m2 = (m.comer12_m2 || 0) + (area || 0);
      }
    }
    log.push(`ELIC: ${rows.length} registros recientes, corte ${elicCorte}`);
  }

  // ---------- Licencias urbanísticas SNR (curadurías) ----------
  const snr = readJSON(rawDir, 'snr_licencias.json');
  let snrCorte = '';
  for (const s of snr) if (s.a_o > snrCorte) snrCorte = s.a_o;
  const lim = new Date(snrCorte || Date.now()); lim.setMonth(lim.getMonth() - 5);
  for (const s of snr) {
    const m = munis.get(String(s.cod_municipio).padStart(5, '0')); if (!m) continue;
    const curad = (m.curadurias ||= {});
    curad[s.curaduria] = true;
    if (new Date(s.a_o) >= lim) {
      m.snr6 ||= { construccion: 0, urbanizacion: 0, parcelacion: 0, total: 0 };
      m.snr6.construccion += +s.construcci_n || 0; m.snr6.urbanizacion += +s.urbanizaci_n || 0;
      m.snr6.parcelacion += +s.parcelaci_n || 0; m.snr6.total += +s.actos_admin_expedidos || 0;
    }
  }
  for (const m of munis.values()) if (m.curadurias) m.curadurias = Object.keys(m.curadurias);

  // ---------- SECOP II ----------
  const secopRaw = readJSON(rawDir, 'secop_solar.json');
  const secop = [];
  for (const s of secopRaw) {
    const code = findMuni(s.departamento_entidad, s.ciudad_entidad);
    secop.push({
      id: s.id_del_proceso, entidad: s.entidad, dpto: s.departamento_entidad, ciudad: s.ciudad_entidad, code,
      nombre: s.nombre_del_procedimiento, desc: (s.descripci_n_del_procedimiento || '').slice(0, 400),
      fecha: (s.fecha_de_publicacion_del || '').slice(0, 10), precio: num(s.precio_base) || 0,
      estado: s.estado_resumen || s.estado_del_procedimiento, modalidad: s.modalidad_de_contratacion,
      adjudicado: s.adjudicado === 'Si', proveedor: s.nombre_del_proveedor !== 'No Definido' ? s.nombre_del_proveedor : null,
      valor_adj: num(s.valor_total_adjudicacion) || 0, url: s.urlproceso?.url || null,
    });
    if (code && munis.has(code)) { const m = munis.get(code); m.secop_n = (m.secop_n || 0) + 1; }
  }
  secop.sort((a, b) => b.fecha.localeCompare(a.fecha));

  // ---------- Empresas (RUES) ----------
  const rues = readJSON(rawDir, 'rues_energia.json');
  // Sede de cada cámara de comercio cuyo nombre no coincide con el del municipio (ubicación aproximada)
  const CAM_SEDE = { CALI: '76001', CARTAGENA: '13001', CUCUTA: '54001', 'SANTA MARTA PARA EL MAGDALENA': '47001', 'ABURRA SUR': '05360', HUILA: '41001', CASANARE: '85001', 'ORIENTE ANTIOQUENO': '05615', CAUCA: '19001', 'LA GUAJIRA': '44001', PUTUMAYO: '86001', URABA: '05045', CHOCO: '27001', TUMACO: '52835', 'MAGDALENA MEDIO': '68081', BUGA: '76111', 'SUR Y ORIENTE DEL TOLIMA': '73268', 'PIEDEMONTE ARAUCANO': '81736', AMAZONAS: '91001', 'SANTA ROSA DE CABAL': '66682' };
  const camaraCity = (c) => {
    if (/BOGOTA/.test(norm(c))) return '11001';
    if (CAM_SEDE[norm(c)]) return CAM_SEDE[norm(c)];
    const n = norm(c).replace(/ PARA ANTIOQUIA| DEL| DE LA| DE /g, ' ').trim();
    const first = n.split(' ')[0];
    for (const m of munis.values()) if (norm(m.name) === n || norm(m.name) === first) return m.code;
    return null;
  };
  const camCache = {};
  const empresas = rues.map((r) => {
    const cat = CIIU_CATS[r.cod_ciiu_act_econ_pri] || (['3511', '4321'].includes(r.cod_ciiu_act_econ_sec) ? 'Otras con actividad energética' : 'Otros');
    if (!(r.camara_comercio in camCache)) camCache[r.camara_comercio] = camaraCity(r.camara_comercio);
    const code = camCache[r.camara_comercio];
    return { n: r.razon_social, nit: r.nit, cam: titleCase(r.camara_comercio), code, ciiu: r.cod_ciiu_act_econ_pri, ciiu2: r.cod_ciiu_act_econ_sec || null, cat, mat: r.fecha_matricula, ren: r.ultimo_ano_renovado };
  });
  const empByCam = {};
  for (const e of empresas) if (e.code) { const c = (empByCam[e.code] ||= {}); c[e.cat] = (c[e.cat] || 0) + 1; }
  for (const [code, c] of Object.entries(empByCam)) if (munis.has(code)) munis.get(code).empresas_cam = c;

  // ---------- Proyectos (licencias con detalle municipales) ----------
  const proyectos = [];
  const fusa = readJSON(rawDir, 'lic_fusa.json');
  for (const f of fusa) {
    const u = parseInt(f.univivienda, 10) || 0;
    const uso = (f.uso || '').toLowerCase();
    if (!(u >= 3 || /comercial|multifamiliar|industrial|institucional/.test(uso))) continue;
    proyectos.push({ code: '25290', fuente: 'Alcaldía de Fusagasugá (datos.gov.co 7fsy-xzzb)', nombre: `${f.uso || 'Licencia'} — ${titleCase(f.barrio_urb || '')}`.trim(), uso: f.uso, unidades: u, estrato: (f.estrato || '').replace(/VIVIENDA /i, ''), area_m2: num(f.aconstruir), pisos: parseInt(f.nopisos, 10) || null, fecha: f.fresuelto, acto: f.noacto, tipo: f.tipo, aprox: true });
  }
  const chia = readJSON(rawDir, 'lic_chia.json');
  for (const c of chia) {
    const u = Math.round(num(c.unidades_aprobadas) || 0);
    if (!/OBRA NUEVA|AMPLIA/.test(c.tipo_de_licencia || '') && u < 3) continue;
    proyectos.push({ code: '25175', fuente: 'Alcaldía de Chía (datos.gov.co n686-d6yb)', nombre: `${titleCase(c.tipo_de_licencia || '')} — ${(c.zona_pot || '').slice(0, 60)}`, uso: c.zona_pot, unidades: u, area_m2: num(c.area_del_terreno_m2), fecha: String(parseInt(c.a_o, 10) || ''), acto: c.numero_de_licencia, tipo: c.tipo_de_licencia, aprox: true });
  }

  // ---------- Calidad ITAD por empresa ----------
  const itad = readJSON(rawDir, 'calidad_itad.json');
  const itadBy = {};
  for (const r of itad) { let k = matchOrKey(r.empresa); if (k === 'CELSIA') k = 'CELSIA_VAL'; if (!k) continue; const y = +r.anio * 10 + +r.periodo; if (!itadBy[k] || y > itadBy[k].y) itadBy[k] = { y, v: num(r.nivel_1), anio: r.anio }; }
  for (const m of munis.values()) if (itadBy[m.or_key]) { m.itad = itadBy[m.or_key].v; m.itad_anio = itadBy[m.or_key].anio; }

  // ---------- Autogeneradores vigentes, contingencias, turismo, red y ZNI ----------
  const agpeZonas = applyAgpeXm(munis, readJSON(rawDir, 'xm_agpe.json'), log);
  const xmOp = readJSON(rawDir, 'xm_operacion.json');
  const dna = applyDna(munis, xmOp, log);
  const bolsa = precioBolsa(xmOp);
  const clientes = clientesTuristicos(readJSON(rawDir, 'rnt_alojamientos.json') || [], munis);
  applyTurismo(munis, readJSON(rawDir, 'rnt_agg.json'), clientes, log);
  const red = applyRed(munis, readJSON(rawDir, 'paratec_subestaciones.json'), readJSON(rawDir, 'paratec_plantas.json'), readJSON(rawDir, 'paratec_lineas.json'), findMuni, log);
  const zni = applyZni(munis, readJSON(rawDir, 'zni.json'), readJSON(rawDir, 'centros_poblados.json'), log);

  // ---------- Registro de proyectos de generación (UPME) ----------
  let upme = [], upmeCorte = null;
  const upmeFile = fs.readdirSync(rawDir).filter((f) => /^upme_registro.*\.xlsx$/i.test(f)).sort().pop();
  if (upmeFile) {
    try {
      const r = await parseUpme(path.join(rawDir, upmeFile));
      upmeCorte = r.corte;
      upme = r.rows.map((p) => { const code = findMuni(p.dpto, p.mun); const m = code && munis.get(code); return { ...p, code, lat: m?.lat ?? null, lon: m?.lon ?? null }; });
      for (const m of munis.values()) { m.upme_n = 0; m.upme_mw = 0; m.upme_solar_mw = 0; }
      for (const p of upme) { const m = p.code && munis.get(p.code); if (!m) continue; m.upme_n++; m.upme_mw += p.mw || 0; if (/SOLAR/i.test(p.tipo)) m.upme_solar_mw += p.mw || 0; }
      log.push(`registro UPME (${upmeCorte}): ${upme.length} proyectos, ${upme.filter((p) => p.code).length} ubicados`);
    } catch (e) { log.push('registro UPME: ' + e.message); }
  }

  // ---------- Contactos y trazabilidad de empresas (SECOP II) ----------
  const prov = readJSON(rawDir, 'secop_proveedores.json');
  const contacto = {};
  for (const p of prov) {
    const nit = String(p.nit || '').replace(/\D/g, '');
    // Solo personas jurídicas (NIT 8xx/9xx de 9 dígitos): no se publican datos de contacto de personas naturales (Ley 1581 de 2012)
    if (!/^[89]\d{8}$/.test(nit) || /Persona Natural/i.test(p.tipo_empresa || '')) continue;
    const clean = (v) => (v && !/no provisto|no definido/i.test(v) ? v : null);
    contacto[nit] = { tel: clean(p.telefono), mail: clean(p.correo), web: clean(p.sitio_web), dir: clean(p.direccion), dpto: clean(p.departamento), mun: clean(p.municipio), pyme: p.espyme === 'SI', secop_cat: clean(p.descripcion_categoria_principal), nombre: p.nombre };
  }
  const wins = {};
  for (const s of secopRaw) {
    const nit = String(s.nit_del_proveedor_adjudicado || '').replace(/\D/g, '');
    if (!nit || nit === '0' || s.adjudicado !== 'Si') continue;
    const w = (wins[nit] ||= { n: 0, valor: 0, ultimo: '', entidades: new Set() });
    w.n++; w.valor += num(s.valor_total_adjudicacion) || 0; w.entidades.add(s.entidad);
    const f = (s.fecha_de_publicacion_del || '').slice(0, 10); if (f > w.ultimo) w.ultimo = f;
  }
  const seen = new Set();
  for (const e of empresas) {
    const nit = String(e.nit || '').replace(/\D/g, ''); seen.add(nit);
    const c = contacto[nit];
    if (c) { Object.assign(e, { tel: c.tel, mail: c.mail, web: c.web, dir: c.dir, pyme: c.pyme, mun: c.mun }); const code = c.mun ? findMuni(c.dpto, c.mun) : null; if (code) e.code = code; }
    const w = wins[nit];
    if (w) Object.assign(e, { sol_n: w.n, sol_valor: Math.round(w.valor), sol_ultimo: w.ultimo, sol_ent: w.entidades.size });
  }
  for (const [nit, w] of Object.entries(wins)) {
    if (seen.has(nit) || !contacto[nit]) continue;
    const c = contacto[nit];
    const code = c.mun ? findMuni(c.dpto, c.mun) : null;
    empresas.push({ n: c.nombre, nit, cam: c.mun || '', code, ciiu: null, cat: 'Contratistas solares (SECOP)', tel: c.tel, mail: c.mail, web: c.web, dir: c.dir, pyme: c.pyme, mun: c.mun, sol_n: w.n, sol_valor: Math.round(w.valor), sol_ultimo: w.ultimo, sol_ent: w.entidades.size });
  }
  for (const m of munis.values()) { m.inst_n = 0; m.inst_sol = 0; m.mayor_n = 0; }
  for (const e of empresas) {
    const m = e.code && munis.get(e.code); if (!m) continue;
    if (e.cat === 'Instaladores eléctricos' || e.cat === 'Contratistas solares (SECOP)') m.inst_n++;
    if (e.sol_n) m.inst_sol++;
    if (e.cat === 'Proveedores mayoristas de equipo') m.mayor_n++;
  }
  log.push(`empresas: ${empresas.length} (con contacto SECOP ${empresas.filter((e) => e.tel || e.mail).length}, con contratos solares ${empresas.filter((e) => e.sol_n).length})`);

  // ---------- Derivados ----------
  for (const m of munis.values()) {
    if (m.agpe_est == null) m.agpe_10k = m.pop ? +((m.agpe_n || 0) / m.pop * 10000).toFixed(2) : null;
    m.viv_crec = m.viv_prev12 ? +(((m.viv12 || 0) - m.viv_prev12) / m.viv_prev12 * 100).toFixed(0) : null;
  }

  const meta = {
    schema: 2, generado: new Date().toISOString(), elic_corte: elicCorte, snr_corte: snrCorte.slice(0, 7),
    secop_n: secop.length, empresas_n: empresas.length, agpe_n: agpe.length, proyectos_n: proyectos.length,
    tarifas, log, segundos: Math.round((Date.now() - t0) / 1000),
    sui_periodo: suiPeriodo, agpe_zonas: agpeZonas, agpe_xm_fecha: readJSON(rawDir, 'xm_agpe.json')?.fecha || null,
    dna_periodo: dna?.periodo || null, dna_subareas: dna?.subareas || null, bolsa,
    red_n: { lineas: red.lineas.length, subs: red.subs.length, plantas: red.plantas.length }, zni_n: zni.length, clientes_n: clientes.length, upme_corte: upmeCorte, upme_n: upme.length,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'municipios.json'), JSON.stringify([...munis.values()]));
  fs.writeFileSync(path.join(outDir, 'secop.json'), JSON.stringify(secop));
  fs.writeFileSync(path.join(outDir, 'empresas.json'), JSON.stringify(empresas));
  fs.writeFileSync(path.join(outDir, 'proyectos_base.json'), JSON.stringify(proyectos));
  fs.writeFileSync(path.join(outDir, 'clientes.json'), JSON.stringify(clientes));
  fs.writeFileSync(path.join(outDir, 'red.json'), JSON.stringify({ ...red, zni, upme }));
  if (fs.existsSync(path.join(rawDir, 'red_mt_gridfinder.json'))) fs.copyFileSync(path.join(rawDir, 'red_mt_gridfinder.json'), path.join(outDir, 'red_mt.json'));
  fs.writeFileSync(path.join(outDir, 'meta.json'), JSON.stringify(meta, null, 1));
  return meta;
}

function titleCase(s = '') {
  const small = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'el', 'en']);
  return String(s).toLowerCase().split(/\s+/).map((w, i) => (i && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = process.argv[2] || 'data/raw';
  const out = process.argv[3] || 'data/built';
  build(raw, out).then((m) => console.log(JSON.stringify({ ...m, tarifas: Object.keys(m.tarifas) }, null, 1))).catch((e) => { console.error(e); process.exit(1); });
}
