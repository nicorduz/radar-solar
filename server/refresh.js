import fs from 'node:fs';
import path from 'node:path';
import { ROOT, STORAGE } from './config.js';
import { db } from './db.js';
import { build } from './etl/build.js';
import { loadData } from './data.js';
import { fetchGrandesEmpresas } from './etl/ci.js';

export const RAW = path.join(STORAGE, 'raw');

// Copia los archivos base incluidos en la app que todavía no existan en el volumen
// (así una actualización de la app agrega fuentes nuevas sin borrar lo que ya descargó el admin).
export function ensureRaw() {
  fs.mkdirSync(RAW, { recursive: true });
  for (const f of fs.readdirSync(path.join(ROOT, 'data', 'raw'))) {
    const dst = path.join(RAW, f);
    if (!fs.existsSync(dst)) fs.copyFileSync(path.join(ROOT, 'data', 'raw', f), dst);
  }
}

// Fuentes Socrata (datos.gov.co) que se pueden refrescar sin intervención
export const SOURCES = {
  secop_solar: { label: 'SECOP II · procesos solares', id: 'p6dx-8zbt', params: { $where: "upper(descripci_n_del_procedimiento) like '%SOLAR%' OR upper(descripci_n_del_procedimiento) like '%FOTOVOLTAIC%'", $order: 'fecha_de_publicacion_del DESC', $limit: 20000 } },
  snr_licencias: { label: 'Licencias urbanísticas por curaduría (SNR)', id: 'psyr-i7bp', params: { $limit: 50000, $where: "a_o >= '2024-01-01'" } },
  tarifas_cu: { label: 'Tarifas y costos mercado regulado', id: 'ytme-6qnu', params: { $limit: 20000 } },
  tarifas_chec: { label: 'Costo unitario CHEC', id: 'c698-wqig', params: { $limit: 50000, $where: "costounitariotarifa_ano >= '2025'" } },
  tarifas_publicadas: { label: 'Tarifas publicadas SUI', id: '4is2-3nif', params: { $limit: 50000 } },
  rues_energia: { label: 'Empresas del sector (RUES)', id: 'c82u-588k', params: { $select: 'camara_comercio, razon_social, sigla, nit, cod_ciiu_act_econ_pri, cod_ciiu_act_econ_sec, fecha_matricula, ultimo_ano_renovado, organizacion_juridica', $where: "estado_matricula='ACTIVA' AND organizacion_juridica!='PERSONA NATURAL' AND (cod_ciiu_act_econ_pri in('4321','3511','4659','2790','2710','4669','3514') OR cod_ciiu_act_econ_sec in ('3511','4321'))", $limit: 200000 } },
  lic_fusa: { label: 'Licencias Fusagasugá', id: '7fsy-xzzb', params: { $limit: 20000 } },
  lic_chia: { label: 'Licencias Chía', id: 'n686-d6yb', params: { $limit: 20000 } },
  rnt_agg: { label: 'Registro Nacional de Turismo · totales por municipio', id: 'thwd-ivmp', params: { $select: 'cod_mun, categoria, count(*) as n, sum(habitaciones) as hab, sum(camas) as camas', $where: "estado_rnt='ACTIVO'", $group: 'cod_mun, categoria', $limit: 50000 } },
  rnt_alojamientos: { label: 'Registro Nacional de Turismo · alojamientos y parques', id: 'thwd-ivmp', params: { $select: 'codigo_rnt, cod_mun, municipio, departamento, categoria, sub_categoria, razon_social_establecimiento, nit, direcci_n_comercial_establecimiento, n_m_tel_fono, num_celular, correo_establecimiento, habitaciones, camas, num_emp1', $where: "estado_rnt='ACTIVO' AND categoria in('ESTABLECIMIENTOS DE ALOJAMIENTO TURÍSTICO','VIVIENDAS TURÍSTICAS','PARQUES TEMÁTICOS','CONCESIONARIOS DE SERVICIOS TURÍSTICOS EN PARQUE')", $limit: 100000 } },
  zni: { label: 'IPSE · zonas no interconectadas (telemetría)', id: '3ebi-d83g', params: { $select: 'id_mpio, mpio, dpto, id_localidad, localidad, anio, mes, prom_diario_horas, energia_activa, potencia_maxima', $where: `anio >= '${new Date().getFullYear() - 1}'`, $limit: 50000 } },
};

// Fuentes que no son Socrata: XM (API pública y mapa Paratec) y el directorio de proveedores de SECOP II
export const EXTRA_SOURCES = {
  xm_agpe: 'XM · autogeneradores a pequeña escala (AGPE)',
  xm_operacion: 'XM · demanda no atendida por subárea y precio de bolsa',
  paratec: 'XM Paratec · líneas, subestaciones y plantas',
  secop_proveedores: 'SECOP II · contactos de proveedores',
  upme_registro: 'UPME · registro de proyectos de generación',
  grandes_empresas: 'Supersociedades · empresas más grandes del país (clientes C&I)',
};

async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(180e3) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
async function getJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(180e3) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
const isoDay = (d) => d.toISOString().slice(0, 10);

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const FETCHERS = {
  // El informe mensual se publica con unas semanas de retraso: se prueba desde el mes actual hacia atrás
  async upme_registro() {
    const base = 'https://docs.upme.gov.co/SIMEC/Energia%20Electrica/Informes_Registro_Proyectos_Generacion/';
    const d = new Date();
    for (let i = 0; i < 8; i++) {
      const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const url = `${base}Informe_registros_activos_de_proyectos_generacion_electrica_${MESES[m.getMonth()]}_${m.getFullYear()}.xlsx`;
      const r = await fetch(url, { signal: AbortSignal.timeout(120e3) }).catch(() => null);
      if (!r?.ok) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length < 5000 || buf[0] !== 0x50) continue; // no es un .xlsx
      return [['upme_registro.xlsx', buf], `informe de ${MESES[m.getMonth()]} ${m.getFullYear()}`];
    }
    throw new Error('no se encontró el informe de los últimos 8 meses');
  },
  async xm_agpe() {
    const d = await postJSON('https://servapibi.xm.com.co/lists', { MetricId: 'ListadoAGPE', Entity: 'Agente' });
    const items = [];
    for (const it of d.Items || []) for (const e of it.ListEntities || []) {
      const v = e.Values || {};
      items.push({ id: v.AgpeID, zone: v.ComZone, comp: v.CompanyCode, vl: v.VoltageLevel, src: v.EnerSource, kw: +v.InstalledCapacity || 0 });
    }
    if (items.length < 1000) throw new Error('respuesta incompleta');
    return [['xm_agpe.json', { fecha: isoDay(new Date()), items }], items.length];
  },
  async xm_operacion() {
    const end = new Date(Date.now() - 2 * 864e5); const out = {};
    const series = async (metric, entity, start, map) => {
      const rows = []; let s = new Date(start);
      while (s < end) {
        const e = new Date(Math.min(s.getTime() + 30 * 864e5, end.getTime()));
        const d = await postJSON('https://servapibi.xm.com.co/daily', { MetricId: metric, StartDate: isoDay(s), EndDate: isoDay(e), Entity: entity });
        for (const it of d.Items || []) for (const ent of it.DailyEntities || []) rows.push(map(it.Date, ent));
        s = new Date(e.getTime() + 864e5);
      }
      return rows;
    };
    const start = new Date(end.getTime() - 365 * 864e5);
    for (const m of ['DemaNoAtenProg', 'DemaNoAtenNoProg']) out[m] = await series(m, 'Subarea', start, (f, e) => ({ fecha: f, subarea: e.Name || e.Id, kwh: +e.Value || 0 }));
    out.precio_bolsa = await series('PPPrecBolsNaci', 'Sistema', new Date(end.getTime() - 730 * 864e5), (f, e) => ({ fecha: f, v: +e.Value || 0 }));
    return [['xm_operacion.json', out], out.DemaNoAtenNoProg.length + out.DemaNoAtenProg.length];
  },
  async paratec() {
    const B = 'https://paratecbackend.xm.com.co/mapas/api';
    const lineas = await getJSON(`${B}/TransmissionMap/getLines`);
    const subs = await getJSON(`${B}/TransmissionMap/getMarkers`);
    const plantas = await getJSON(`${B}/GenerationMap/GenerationMapInfo`);
    if (!lineas?.data?.length || !subs?.data?.length) throw new Error('respuesta vacía');
    return [['paratec_lineas.json', lineas], ['paratec_subestaciones.json', subs], ['paratec_plantas.json', plantas], `${lineas.data.length} líneas, ${subs.data.length} subestaciones`];
  },
  async grandes_empresas() {
    const d = await fetchGrandesEmpresas(socrata);
    return [['grandes_empresas.json', d], `${d.rows.length} empresas (corte ${d.anio}), ${d.contactos.length} con contacto`];
  },
  async secop_proveedores() {
    const nits = new Set();
    const rues = JSON.parse(fs.readFileSync(path.join(RAW, 'rues_energia.json')));
    const sec = JSON.parse(fs.readFileSync(path.join(RAW, 'secop_solar.json')));
    for (const r of rues) { const n = String(r.nit || '').replace(/\D/g, ''); if (n) nits.add(n); }
    for (const r of sec) { const n = String(r.nit_del_proveedor_adjudicado || '').replace(/\D/g, ''); if (n && n !== '0') nits.add(n); }
    const list = [...nits]; const out = [];
    const sel = 'nombre,nit,es_entidad,esta_activa,codigo_categoria_principal,descripcion_categoria_principal,telefono,correo,direccion,departamento,municipio,sitio_web,tipo_empresa,espyme,tama_o_entidad,fecha_creacion';
    for (let i = 0; i < list.length; i += 200) {
      const where = `nit in(${list.slice(i, i + 200).map((n) => `'${n}'`).join(',')})`;
      try { out.push(...await socrata('qmzu-gj57', { $select: sel, $where: where, $limit: 5000 })); } catch { /* lote fallido: se sigue */ }
    }
    if (out.length < 1000) throw new Error('respuesta incompleta');
    return [['secop_proveedores.json', out], out.length];
  },
};

async function socrata(id, params) {
  const url = `https://www.datos.gov.co/resource/${id}.json?` + new URLSearchParams(params);
  const r = await fetch(url, { signal: AbortSignal.timeout(15 * 60e3) });
  if (!r.ok) throw new Error(`${id}: HTTP ${r.status}`);
  return r.json();
}

let running = null;
export const isRunning = () => !!running;

export function startJob(kind, fn) {
  if (running) throw Object.assign(new Error('Ya hay una actualización en curso'), { status: 409 });
  const id = db.prepare("INSERT INTO jobs(kind,status,log) VALUES(?, 'corriendo', '')").run(kind).lastInsertRowid;
  const log = (s) => { console.log(`[job ${id}] ${s}`); db.prepare("UPDATE jobs SET log = log || ? WHERE id=?").run(`${new Date().toISOString().slice(11, 19)} ${s}\n`, id); };
  running = (async () => {
    try { await fn(log); db.prepare("UPDATE jobs SET status='ok', finished_at=datetime('now') WHERE id=?").run(id); }
    catch (e) { log('ERROR: ' + e.message); db.prepare("UPDATE jobs SET status='error', finished_at=datetime('now') WHERE id=?").run(id); }
    finally { running = null; }
  })();
  return id;
}

export async function rebuild(log) {
  ensureRaw();
  log('Reconstruyendo base consolidada…');
  const meta = await build(RAW, path.join(STORAGE, 'built'));
  meta.log.forEach((l) => log('  ' + l));
  loadData();
  log(`Listo en ${meta.segundos}s`);
}

export function refreshSources(keys) {
  return startJob('actualizar_fuentes', async (log) => {
    ensureRaw();
    const all = keys?.length ? keys : [...Object.keys(SOURCES), ...Object.keys(EXTRA_SOURCES)];
    for (const k of all) {
      if (FETCHERS[k]) {
        log(`Descargando ${EXTRA_SOURCES[k]}…`);
        try {
          const res = await FETCHERS[k]();
          const summary = res.pop();
          for (const [file, data] of res) fs.writeFileSync(path.join(RAW, file), Buffer.isBuffer(data) ? data : JSON.stringify(data));
          log(`  ${summary}`);
        } catch (e) { log(`  falló (${e.message}); se conserva la versión anterior`); }
        continue;
      }
      const s = SOURCES[k]; if (!s) continue;
      log(`Descargando ${s.label}…`);
      try {
        const data = await socrata(s.id, s.params);
        if (!Array.isArray(data) || !data.length) { log(`  sin filas, se conserva la versión anterior`); continue; }
        fs.writeFileSync(path.join(RAW, `${k}.json`), JSON.stringify(data));
        log(`  ${data.length} filas`);
      } catch (e) { log(`  falló (${e.message}); se conserva la versión anterior`); }
    }
    await rebuild(log);
  });
}
