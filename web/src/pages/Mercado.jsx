import React, { useEffect, useState } from 'react';
import { api, fmt, csvDownload } from '../api.js';
import { useApp } from '../App.jsx';
import { Spinner, Stat, Spark, Bars, LockedRows, Section, Fuente } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

function HBars({ rows, value, label, unit, max }) {
  const top = max ?? Math.max(1, ...rows.map(value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r, i) => (
        <div key={i} className="hbar"><span>{label(r)}</span><div><div className="b" style={{ width: `${(value(r) / top) * 100}%` }} /></div><span className="mono small">{fmt(value(r))}{unit}</span></div>
      ))}
    </div>
  );
}

const MESC = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const ym = (p) => (p ? `${MESC[+p.slice(5, 7) - 1]} ${p.slice(0, 4)}` : '');
// Cambio contra los 12 meses anteriores, en texto (no solo color)
function Cambio({ n, n0 }) {
  if (!n0) return <span className="small muted">{n ? 'nuevo' : ''}</span>;
  // Con menos de 5 sistemas el porcentaje engaña: se muestra la diferencia
  if (n0 < 5) return <span className={`td-cambio ${n > n0 ? 'up' : n < n0 ? 'down' : ''}`}>{n > n0 ? '▲ +' : n < n0 ? '▼ ' : '= '}{n - n0 || ''} {Math.abs(n - n0) === 1 ? 'sistema' : n === n0 ? '' : 'sistemas'}</span>;
  const c = Math.round(((n - n0) / n0) * 100);
  return <span className={`td-cambio ${c > 0 ? 'up' : c < 0 ? 'down' : ''}`}>{c > 0 ? '▲' : c < 0 ? '▼' : '='} {c > 0 ? '+' : ''}{c} %</span>;
}

// Demanda de autogeneración por zona: altas registradas en PARATEC en los últimos 12 meses contra los 12 anteriores
function Tendencias({ open }) {
  const [t, setT] = useState(null);
  const [orden, setOrden] = useState('n');
  useEffect(() => { api('/tendencias').then(setT).catch(() => setT(null)); }, []);
  if (!t) return null;
  const P = t.pais;
  const sube = t.munis.filter((m) => m.n > m.n0).slice(0, 8);
  const baja = [...t.munis].filter((m) => m.n < m.n0).sort((a, b) => (a.n - a.n0) - (b.n - b.n0)).slice(0, 6);
  const dptos = [...t.dptos].sort((a, b) => (orden === 'cambio' ? (b.n - b.n0) - (a.n - a.n0) : b.n - a.n));
  const crece = t.dptos.filter((x) => x.n0 >= 5).sort((a, b) => (b.cambio ?? 0) - (a.cambio ?? 0))[0];
  return (
    <Section icon={<Icon name="chart" />} title="Dónde crece la autogeneración" hint={`${fmt(P.n)} sistemas nuevos en 12 meses (${P.cambio > 0 ? '+' : ''}${P.cambio ?? 0} %)${crece ? ` · más crecimiento: ${crece.name}` : ''}`} open={open}>
      <p className="small" style={{ margin: 0, maxWidth: '72ch' }}>Autogeneradores que entraron en operación entre {ym(t.desde)} y {ym(t.hasta)}, comparados con los 12 meses anteriores. Sirve para ver en qué zonas se está vendiendo más, de qué tamaño y quién lo está haciendo.</p>
      <div className="kpis td-kpis">
        <div className="card"><Stat label="Sistemas nuevos en 12 meses" value={fmt(P.n)} sub={<Cambio n={P.n} n0={P.n0} />} /></div>
        <div className="card"><Stat label="Potencia nueva" value={`${fmt(P.kw / 1000, 1)} MW`} sub={`antes ${fmt(P.kw0 / 1000, 1)} MW`} /></div>
        <div className="card"><Stat label="Menos de 100 kW" value={fmt(P.tam.p)} sub="hogares y comercios" /></div>
        <div className="card"><Stat label="De 100 kW a 1 MW" value={fmt(P.tam.m)} sub="empresas e industria" /></div>
      </div>
      <Spark data={P.serie.map((v, i) => ({ v, p: t.meses[i] }))} unit=" sistemas" title="Sistemas nuevos por mes, últimos 24 meses" />
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--t-md)' }}>Por departamento</h3>
        <label className="small row" style={{ gap: 6 }}>Ordenar por<select className="select" value={orden} onChange={(e) => setOrden(e.target.value)} style={{ minHeight: 32 }}><option value="n">Sistemas nuevos</option><option value="cambio">Cuánto cambió</option></select></label>
      </div>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Departamento</th><th className="num">Nuevos</th><th className="num">Año anterior</th><th>Cambio</th><th className="num">kW nuevos</th><th>Quién los representa</th></tr></thead><tbody>
        {dptos.map((x) => <tr key={x.code}><td className="name">{x.name}</td><td className="num"><b>{fmt(x.n)}</b></td><td className="num">{fmt(x.n0)}</td><td><Cambio n={x.n} n0={x.n0} /></td><td className="num">{fmt(x.kw)}</td><td className="small">{x.reps.map((r) => `${corto(r.op)} (${r.n})`).join(', ')}</td></tr>)}
      </tbody></table></div>
      {t.locked && <LockedRows cols={5} n={6} text="Todos los departamentos, municipios y empresas con el plan completo." />}
      {!t.locked && <div className="td-g">
        <div><h3>Municipios que más suben</h3><ul className="td-list">{sube.map((m) => <li key={m.code}><span>{m.name}<span className="small muted">, {m.dpto}</span></span><span className="mono small">{fmt(m.n0)} → <b>{fmt(m.n)}</b></span></li>)}</ul></div>
        <div><h3>Municipios que más bajan</h3><ul className="td-list">{baja.map((m) => <li key={m.code}><span>{m.name}<span className="small muted">, {m.dpto}</span></span><span className="mono small">{fmt(m.n0)} → <b>{fmt(m.n)}</b></span></li>)}</ul></div>
      </div>}
      {!t.locked && <>
        <h3 style={{ margin: 0, fontSize: 'var(--t-md)' }}>Quién está conectando sistemas</h3>
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Empresa</th><th className="num">Nuevos</th><th className="num">Año anterior</th><th>Cambio</th><th className="num">kW nuevos</th><th>Dónde</th></tr></thead><tbody>
          {t.reps.slice(0, 15).map((r) => <tr key={r.op}><td className="name">{r.op}</td><td className="num"><b>{fmt(r.n)}</b></td><td className="num">{fmt(r.n0)}</td><td><Cambio n={r.n} n0={r.n0} /></td><td className="num">{fmt(r.kw)}</td><td className="small">{r.dptos.map((x) => `${x.name} (${x.n})`).join(', ')}</td></tr>)}
        </tbody></table></div>
      </>}
      <p className="small muted" style={{ margin: 0, maxWidth: '80ch' }}>Incluye los autogeneradores registrados con nombre en PARATEC (corte {t.corte}), que son los que tienen representante en el mercado; no todos los sistemas pequeños aparecen ahí. La empresa es la que los representa ante el mercado, que suele ser quien los desarrolló o les vende la energía. Los últimos dos meses pueden subir cuando se registren los sistemas pendientes.</p>
      <Fuente>XM, PARATEC: detalle de autogeneradores a pequeña escala (fecha de puesta en operación).</Fuente>
    </Section>
  );
}
const corto = (s) => String(s || '').replace(/\s+(S\.?\s?A\.?\s?S?\.?|E\.?\s?S\.?\s?P\.?)(?=\s|,|$)/gi, '').replace(/\s+(S\.?\s?A\.?\s?S?\.?|E\.?\s?S\.?\s?P\.?)(?=\s|,|$)/gi, '').replace(/[\s,]+$/, '').trim();

// Mercado eléctrico y solar: autogeneradores por mercado, precio de bolsa, cortes por subárea y plantas solares
export default function Mercado() {
  const { paid, meta, profile } = useApp();
  const [d, setD] = useState(null);
  const [q, setQ] = useState('');
  const [qc, setQc] = useState('');
  useEffect(() => { api('/mercado').then(setD).catch(() => setD(null)); }, []);
  if (!d) return <Spinner />;
  const lastBolsa = d.bolsa[d.bolsa.length - 1];
  const plantas = d.plantas.filter((p) => !q || `${p.n} ${p.mun} ${p.dpto} ${p.op}`.toLowerCase().includes(q.toLowerCase()));
  const peorCorte = d.dna.find((x) => x.kwh_1k != null);
  // Importaciones: últimos 12 meses frente a los 12 anteriores (si hay datos)
  const imp = d.importaciones;
  const ult12 = imp ? imp.mensual.slice(-12) : [];
  const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0);
  const panU = sum(ult12, 'pan_u'), panUsd = sum(ult12, 'pan_usd'), batUsd = sum(ult12, 'bat_usd');
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const mesTxt = (p) => (p ? `${MES[+p.slice(5, 7) - 1]} ${p.slice(2, 4)}` : '');
  const anioImp = imp?.hasta?.slice(0, 4);
  const cap = (d.capacidad || []).filter((b) => !qc || `${b.n} ${b.op || ''} ${b.dpto || ''}`.toLowerCase().includes(qc.toLowerCase()));
  const peorOR = d.calidad?.[0];

  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <div className="page-head"><div><h1>Mercado y red</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Autogeneración, precio de la energía, cortes y plantas solares del país. Toca cada sección para ver el detalle.</p></div></div>
      <div className="kpis">
        <div className="card"><Stat label="Autogeneradores" value={fmt(meta.totals.agpe)} sub={`corte ${d.agpe_fecha}`} /></div>
        <div className="card"><Stat label="Plantas solares" value={fmt(d.solar.n)} sub={`${fmt(d.solar.mw)} MW`} /></div>
        <div className="card"><Stat label="Precio de bolsa" value={lastBolsa ? `${fmt(lastBolsa.v)} $/kWh` : 's/d'} sub={lastBolsa?.p} /></div>
        <div className="card"><Stat label="Proyectos registrados" value={fmt(d.upme_n)} sub={`${fmt(d.upme_mw)} MW registrados`} /></div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Tendencias open={profile === 'proveedor' || profile === 'todos'} />
        <Section icon={<Icon name="sun" />} title="Autogeneradores por mercado" hint={`${d.agpe_zonas[0]?.zona || ''} lidera con ${fmt(d.agpe_zonas[0]?.n)} sistemas`} open>
          <HBars rows={d.agpe_zonas} value={(z) => z.n} label={(z) => z.zona} unit="" />
          {d.locked && <LockedRows cols={3} n={5} text="Detalle de todos los mercados con número de sistemas y capacidad instalada." />}
          <p className="small muted" style={{ margin: 0 }}>Corte {d.agpe_fecha}. Casi todos son solares.</p><Fuente>XM, autogeneradores a pequeña escala.</Fuente>
        </Section>

        <Section icon={<Icon name="chart" />} title="Precio de bolsa" hint={lastBolsa ? `${fmt(lastBolsa.v)} $/kWh en ${lastBolsa.p}` : 's/d'}>
          <Spark data={d.bolsa} unit="$/kWh" height={110} title="Precio de bolsa mensual" />
          <p className="small muted" style={{ margin: 0 }}>Referencia para vender excedentes y para contratos de energía (PPA).</p><Fuente>XM.</Fuente>
        </Section>

        <Section icon={<Icon name="bolt" />} title="Cortes de energía por zona" hint={peorCorte ? `Más cortes: ${peorCorte.subarea} (${fmt(peorCorte.kwh_1k)} kWh por 1.000 hab.)` : ''}>
          <HBars rows={d.dna.filter((x) => x.kwh_1k != null)} value={(x) => x.kwh_1k} label={(x) => x.subarea} unit="" />
          {d.locked && <LockedRows cols={3} n={6} text="El listado completo de subáreas está en el plan completo." />}
          <p className="small muted" style={{ margin: 0 }}>Demanda no atendida por subárea eléctrica ({d.dna_periodo}).</p><Fuente>XM.</Fuente>
        </Section>

        {imp && (
          <Section icon={<Icon name="box" />} title="Importaciones de paneles solares y baterías" hint={`${fmt(panU)} paneles en los últimos 12 meses · ${fmt(panU * imp.w_panel / 1e6)} MW estimados · hasta ${mesTxt(imp.hasta)}`}>
            <div className="grid g4">
              <Stat label="Paneles importados (12 meses)" value={fmt(panU)} sub={`${mesTxt(ult12[0]?.p)} a ${mesTxt(imp.hasta)}`} />
              <Stat label="Valor CIF de los paneles" value={`USD ${fmt(panUsd / 1e6, 1)} M`} sub={panU ? `USD ${fmt(panUsd / panU, 1)} por panel` : null} />
              <Stat label="Potencia estimada" value={`${fmt(panU * imp.w_panel / 1e6)} MW`} sub={`suponiendo ${imp.w_panel} W por panel`} />
              <Stat label="Baterías de litio (12 meses)" value={`USD ${fmt(batUsd / 1e6, 1)} M`} sub="incluye usos distintos al solar" />
            </div>
            <h3>Paneles importados por mes</h3>
            <Bars values={imp.mensual.map((m) => m.pan_u)} labels={imp.mensual.map((m) => mesTxt(m.p))} title="Paneles importados por mes" />
            <h3>Precio promedio por panel (USD CIF)</h3>
            <Spark data={imp.mensual.filter((m) => m.pan_u).map((m) => ({ p: mesTxt(m.p), v: Math.round((m.pan_usd / m.pan_u) * 10) / 10 }))} unit="USD" title="Precio CIF promedio por panel" />
            <div className="grid g2">
              <div><h3>Departamento de destino ({anioImp})</h3><HBars rows={imp.dptos.filter((x) => x.u[anioImp]).slice(0, 10)} value={(x) => x.u[anioImp] || 0} label={(x) => x.dpto} unit="" /></div>
              <div><h3>País de origen (todo el periodo, USD M)</h3><HBars rows={imp.paises.slice(0, 6)} value={(x) => Math.round(x.usd / 1e6)} label={(x) => x.pais} unit="" /></div>
            </div>
            {d.locked && <LockedRows cols={3} n={4} text="El detalle por departamento y país de origen está en el plan completo." />}
            <p className="small muted" style={{ margin: 0 }}>El departamento es el destino que declara el importador: casi siempre la sede del mayorista, no donde se instala el panel. Los MW son un estimado.</p>
            <Fuente>DANE, Estadísticas de Importaciones (IMPO, microdatos catálogo 856) con base en declaraciones de la DIAN. Subpartidas 8541.43.00.00 (módulos fotovoltaicos) y 8507.60 (baterías de litio).</Fuente>
          </Section>
        )}

        {d.calidad?.length > 0 && (
          <Section icon={<Icon name="clock" />} title="Calidad del servicio por operador de red" hint={peorOR ? `Más horas sin luz en ${d.calidad_anio}: ${peorOR.nombre} (${fmt(peorOR.saidi?.[d.calidad_anio], 1)} h por usuario)` : ''}>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Operador</th><th className="num">Horas sin luz {d.calidad_anio}</th><th className="num hs">Meta</th><th className="num">Cortes {d.calidad_anio}</th><th className="num hs">Meta</th><th className="num hs">Horas 2025 (a sep.)</th><th>Cumple</th></tr></thead><tbody>
              {d.calidad.map((o) => { const y = d.calidad_anio, ok = o.saidi?.[y] != null && o.saidi?.[y] <= o.saidi_meta?.[y] && o.saifi?.[y] <= o.saifi_meta?.[y]; return (
                <tr key={o.or}><td className="name">{o.nombre}</td><td className="num">{fmt(o.saidi?.[y], 1)}</td><td className="num hs">{fmt(o.saidi_meta?.[y], 1)}</td><td className="num">{fmt(o.saifi?.[y], 1)}</td><td className="num hs">{fmt(o.saifi_meta?.[y], 1)}</td><td className="num hs">{fmt(o.saidi?.['2025'], 1)}</td><td>{o.saidi?.[y] == null ? '—' : ok ? <span className="tag ok">Sí</span> : <span className="tag hot">No</span>}</td></tr>); })}
            </tbody></table></div>
            {d.locked && <LockedRows cols={6} n={6} text="La tabla de todos los operadores con horas sin luz, cortes al año y metas está en el plan completo." />}
            <p className="small muted" style={{ margin: 0 }}>Horas sin luz = SAIDI (horas promedio sin servicio por usuario al año). Cortes = SAIFI (interrupciones promedio por usuario al año). Donde son altos, las baterías y los sistemas híbridos se venden solos.</p>
            <Fuente>CREG, Circular 254 de 2026, Anexo 2, Tablas 3 y 5 (construcción CREG con datos certificados al SUI por los operadores).</Fuente>
          </Section>
        )}

        {d.capacidad_n > 0 && (
          <Section icon={<Icon name="bolt" />} title="Capacidad para conectar generación por subestación" hint={`${fmt(d.capacidad_n)} barras evaluadas · indicativa 2026-2027`}>
            {paid && <div className="row"><input className="input" style={{ maxWidth: 260 }} placeholder="Buscar subestación, operador o departamento" value={qc} onChange={(e) => setQc(e.target.value)} aria-label="Buscar subestación" />
              <button className="btn sm" onClick={() => csvDownload('capacidad-conexion.csv', ['barra', 'subestacion', 'kv', 'mw_2026_95', 'mw_2026_100', 'mw_2027_95', 'mw_2027_100', 'operador', 'departamento', 'lat', 'lon'], cap.map((b) => [b.n, b.sub, b.kv, b.p95_2026, b.p100_2026, b.p95_2027, b.p100_2027, b.op, b.dpto, b.lat, b.lon]))}>Descargar CSV</button></div>}
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Barra</th><th className="num">MW 2026</th><th className="num hs">Seguro 2026</th><th className="num">MW 2027</th><th className="hs">Ubicación</th></tr></thead><tbody>
              {cap.slice(0, paid ? 300 : 1).map((b) => <tr key={b.n}><td className="name"><span className="cap-dot" style={{ background: b.p95_2026 >= 10 ? 'var(--ok)' : b.p95_2026 >= 1 ? '#F2C38A' : '#E2675B' }} />{b.n}<br /><span className="small muted">{b.kv} kV</span></td><td className="num">{fmt(b.p95_2026, 1)}</td><td className="num hs">{fmt(b.p100_2026, 1)}</td><td className="num">{fmt(b.p95_2027, 1)}</td><td className="small hs">{b.dpto || 'sin ubicar'}<br /><span className="muted">{b.op || ''}</span></td></tr>)}
            </tbody></table></div>
            {d.locked && <LockedRows cols={5} n={6} text={`Las ${fmt(d.capacidad_n)} barras con su capacidad disponible para 2026 y 2027 están en el plan completo.`} />}
            <p className="small muted" style={{ margin: 0 }}>MW que cada barra puede recibir de nueva generación en el 95 % de los escenarios ("seguro" = en todos). Es una señal indicativa para granjas y autogeneración grande; la asignación formal la hace la UPME. En el mapa, activa la capa "Capacidad de conexión".</p>
            <Fuente>UPME, tablero "Evolución de la capacidad para conexión de generación por subestación del SIN (indicativa)", publicado el {d.capacidad_fecha}. Ubicación tomada de las subestaciones de XM Paratec (algunas barras quedan sin ubicar).</Fuente>
          </Section>
        )}

        <Section icon={<Icon name="doc" />} title="Proyectos de generación registrados" hint={`${fmt(d.upme_n)} proyectos · ${fmt(d.upme_solar_mw)} MW solares · corte ${d.upme_corte || 's/d'}`}>
          {paid && d.upme?.length > 0 && <div className="row"><button className="btn sm" onClick={() => csvDownload('proyectos-upme.csv', ['codigo', 'proyecto', 'tipo', 'tecnologia', 'mw', 'fase', 'departamento', 'municipio', 'inscrito', 'vence', 'inicio_construccion', 'entrada_operacion'], d.upme.map((p) => [p.id, p.n, p.tipo, p.tec, p.mw, p.fase, p.dpto, p.mun, p.inscrito, p.vence, p.inicio, p.operacion]))}>Descargar CSV</button></div>}
          {d.upme?.length ? (
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Proyecto</th><th className="num">MW</th><th>Ubicación</th><th className="hs">Operación prevista</th></tr></thead><tbody>
              {d.upme.map((p) => <tr key={p.id}><td className="name">{p.n}<br /><span className="small muted">{p.tipo} · {p.fase}</span></td><td className="num">{fmt(p.mw, 1)}</td><td className="small">{p.code ? <a href={`#/m/${p.code}`}>{p.mun}</a> : p.mun}<br /><span className="muted">{p.dpto}</span></td><td className="small hs">{p.operacion?.slice(0, 7) || 's/d'}</td></tr>)}
            </tbody></table></div>
          ) : <p className="small muted" style={{ margin: 0 }}>Sin datos cargados.</p>}
          {d.locked && <LockedRows cols={4} n={5} text={`Lista de los ${fmt(d.upme_n)} proyectos con capacidad, municipio y fechas.`} />}
          <p className="small muted" style={{ margin: 0 }}>Son proyectos en planeación, no plantas construidas.</p><Fuente>UPME.</Fuente>
        </Section>

        <Section icon={<Icon name="layers" />} title="Plantas solares en operación y pruebas" hint={`${d.solar.operacion} en operación · ${d.solar.pruebas} en pruebas`}>
          {paid && <div className="row"><input className="input" style={{ maxWidth: 260 }} placeholder="Buscar planta, municipio u operador" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar planta" />
            <button className="btn sm" onClick={() => csvDownload('plantas-solares.csv', ['planta', 'mw', 'estado', 'desde', 'kv', 'operador', 'municipio', 'departamento', 'lat', 'lon'], plantas.map((p) => [p.n, p.mw, p.estado, p.desde, p.kv, p.op, p.mun, p.dpto, p.lat, p.lon]))}>Descargar CSV</button></div>}
          {paid ? (
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Planta</th><th className="num">MW</th><th>Estado</th><th>Ubicación</th></tr></thead><tbody>
              {plantas.slice(0, 200).map((p) => <tr key={p.n + p.lat}><td className="name">{p.n}<br /><span className="small muted">{p.op}</span></td><td className="num">{fmt(p.mw, 1)}</td><td className="small">{p.estado}</td><td className="small">{p.code ? <a href={`#/m/${p.code}`}>{p.mun}</a> : p.mun}<br /><span className="muted">{p.dpto}</span></td></tr>)}
            </tbody></table></div>
          ) : <LockedRows cols={4} n={6} text={`Lista de las ${d.solar.n} plantas solares con capacidad, estado, operador y ubicación.`} />}
          <Fuente>XM, mapa Paratec.</Fuente>
        </Section>
      </div>
    </div>
  );
}
