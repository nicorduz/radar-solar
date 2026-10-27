import React, { useEffect, useState } from 'react';
import { api, qs, fmt, money, cop } from '../api.js';
import { useApp } from '../App.jsx';
import { ScoreBadge, Stat, Bars, Spinner, ContactCTA, Spark, PrivacyNote, Contact } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function Municipio({ code }) {
  const { meta, paid, segment, weights, prof, profile, scoreParams, go } = useApp();
  const [m, setM] = useState(null);
  const [err, setErr] = useState(null);
  const [kwp, setKwp] = useState(6);
  const [pitch, setPitch] = useState(null);
  const [pitchBusy, setPitchBusy] = useState(false);

  useEffect(() => {
    setM(null); setErr(null); setPitch(null);
    api(`/municipio/${code}` + qs(scoreParams)).then(setM).catch((e) => setErr(e));
  }, [code, JSON.stringify(scoreParams)]);

  if (err?.status === 402) {
    return (
      <div className="page">
        <button className="btn sm ghost" onClick={() => history.back()} style={{ alignSelf: 'flex-start' }}><Icon name="back" size={16} />Volver</button>
        <h1>{err.data.basic.name} <span className="muted" style={{ fontWeight: 400 }}>· {err.data.basic.dpto}</span></h1>
        <div className="locked card" style={{ minHeight: 360 }}>
          <div className="blur grid g4">{['Puntaje', 'Tarifa', 'Vivienda 12m', 'Radiación', 'Proyectos', 'Licitaciones', 'Retorno', 'Competencia'].map((l) => <Stat key={l} label={l} value="000" />)}</div>
          <div className="lock-cta"><ContactCTA text="La ficha completa de cada municipio (tarifa, obra nueva, proyectos detectados, retorno de la inversión y argumento de venta con IA) está en el plan completo." /></div>
        </div>
      </div>
    );
  }
  if (err) return <div className="page"><div className="alert err">{err.message}</div></div>;
  if (!m) return <Spinner />;

  const capex = m.payback?.capex_kwp || meta.capex_kwp;
  const t = (profile === 'desarrollador' ? m.tarifa_com : null) || m.tarifa || m.tarifa_ult;
  const kwhY = m.ghi ? m.ghi * 365 * kwp * 0.78 : null;
  const ahorro = kwhY && t ? kwhY * t : null;
  const anos = ahorro ? (capex * kwp) / ahorro : null;
  const estr = m.viv12_estr || [0, 0, 0, 0, 0, 0];
  const serie = m.viv_serie || [];
  const KPIS = {
    tarifa: ['Tarifa residencial estratos 4-6', `${fmt(m.tarifa)} $/kWh`, m.tarifa_periodo ? `SUI ${m.tarifa_periodo}${m.tarifa_com ? ` · comercial ${fmt(m.tarifa_com)}` : ''}` : null],
    tarifa_com: ['Tarifa comercial', `${fmt(m.tarifa_com ?? m.tarifa)} $/kWh`, m.tarifa_periodo ? `SUI ${m.tarifa_periodo}` : null],
    viv: ['Vivienda licenciada 12 meses', fmt(m.viv12 || 0), `${fmt(m.viv12_alto || 0)} estratos 4-6 · ${m.viv_crec != null ? (m.viv_crec > 0 ? '+' : '') + m.viv_crec + '% anual' : 's/d'}`],
    ghi: ['Radiación', `${fmt(m.ghi, 2)} kWh/m²`, `por día · ${fmt(m.temp, 1)} °C estimados`],
    dna: ['Cortes de energía (12 meses)', m.dna_1k != null ? `${fmt(m.dna_1k)} kWh` : 's/d', m.subarea ? `no atendidos por 1.000 hab. · subárea ${m.subarea}` : null],
    turismo: ['Turismo (RNT)', `${fmt(m.rnt_hab || 0)} hab.`, `${fmt(m.rnt_aloj || 0)} alojamientos · ${fmt(m.rnt_vivtur || 0)} viviendas turísticas`],
    inst: ['Instaladores en el municipio', fmt(m.inst_n || 0), `${fmt(m.inst_sol || 0)} con contratos solares · ${fmt(m.mayor_n || 0)} mayoristas`],
    agpe: ['Autogeneradores estimados', fmt(m.agpe_est || 0), m.agpe_zone ? `mercado ${m.agpe_zone}: ${fmt(m.agpe_zone_n)} (XM)` : null],
    sub: ['Subestación más cercana', m.sub_km != null ? (m.sub_km < 0.5 ? 'En el municipio' : `${fmt(m.sub_km, 1)} km`) : 's/d', m.sub_n ? `${m.sub_n} · ${m.sub_kv}` : null],
    solar30: ['Plantas solares a 30 km', `${fmt(m.solar30_mw || 0)} MW`, `${fmt(m.solar30 || 0)} plantas (XM Paratec)`],
  };
  const kpis = ({ instalador: ['tarifa', 'viv', 'dna', 'turismo'], proveedor: ['inst', 'agpe', 'viv', 'tarifa'], desarrollador: ['ghi', 'sub', 'solar30', 'tarifa_com'] }[profile] || ['tarifa', 'viv', 'ghi', 'dna']).map((k) => KPIS[k]);
  const instaladoresCard = (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10}}>
      <h3>Instaladores y contratistas de la zona</h3>
      <p className="small muted" style={{ margin: 0 }}>{fmt(m.instaladores_n?.municipio || 0)} en {m.name}{m.instaladores_n?.departamento ? ` y ${fmt(m.instaladores_n.departamento)} más en ${m.dpto} con contacto o contratos solares` : ''}. Ordenados por contratos solares públicos ganados.</p>
      {m.instaladores?.length ? (
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Empresa</th><th className="num">Contratos solares</th><th>Contacto</th></tr></thead><tbody>
          {m.instaladores.map((e) => <tr key={e.nit + e.n}><td className="name">{e.n}<br /><span className="small muted">{e.mun || '—'} · NIT {e.nit}{e.ambito === 'departamento' ? ' · otro municipio' : ''}</span></td><td className="num">{e.sol_n ? `${e.sol_n}${e.sol_ultimo ? ' · ' + e.sol_ultimo.slice(0, 7) : ''}` : '—'}</td><td className="small"><Contact tel={e.tel} mail={e.mail} web={e.web} /></td></tr>)}
        </tbody></table></div>
      ) : <p className="muted small" style={{ margin: 0 }}>No hay instaladores con ubicación en este municipio.</p>}
      {!paid && <ContactCTA text="La lista completa de instaladores con teléfono y correo está en el plan completo." />}
      <div className="row"><button className="btn sm" onClick={() => go('empresas')}>Ver directorio completo</button></div>
      <PrivacyNote />
    </div>
  );
  const clientesCard = (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h3>Hoteles, viviendas turísticas y parques ({fmt(m.clientes_n || 0)})</h3>
      {m.clientes?.length ? (
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Establecimiento</th><th className="num">Habitaciones</th><th>Contacto</th></tr></thead><tbody>
          {m.clientes.map((c) => <tr key={c.id}><td className="name">{c.n}<br /><span className="small muted">{c.sub}{c.dir ? ` · ${c.dir}` : ''}</span></td><td className="num">{fmt(c.hab)}</td><td className="small"><Contact tel={c.tel} mail={c.mail} /></td></tr>)}
        </tbody></table></div>
      ) : <p className="muted small" style={{ margin: 0 }}>No hay alojamientos activos en el Registro Nacional de Turismo para este municipio.</p>}
      {!paid && m.clientes_n > 1 && <ContactCTA text={`Hay ${fmt(m.clientes_n - 1)} establecimientos más con su contacto en el plan completo.`} />}
      {paid && m.clientes_n > m.clientes.length && <div className="row"><a className="btn sm" href={`#/clientes/${m.code}`}>Ver los {fmt(m.clientes_n)}</a></div>}
    </div>
  );
  const getPitch = async () => {
    setPitchBusy(true);
    try { const r = await api(`/ai/pitch/${m.code}`, { method: 'POST', body: { segmento: meta.segments[segment], profile } }); setPitch(r.answer); }
    catch (e) { setPitch('⚠ ' + e.message); } finally { setPitchBusy(false); }
  };

  return (
    <div className="page">
      <button className="btn sm ghost" onClick={() => history.back()} style={{ alignSelf: 'flex-start' }}><Icon name="back" size={16} />Volver</button>
      <div className="page-head">
        <div>
          <h1>{m.name} <span className="muted" style={{ fontWeight: 400 }}>· {m.dpto}</span></h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>Código DANE {m.code} · Operador de red {m.or_name} <span title={`Asignación: ${m.or_src}`}>({m.or_src})</span> · {fmt(m.pop)} habitantes (DANE 2026)</p>
        </div>
        <div className="row"><span className="muted small">Puesto {m.rank} de {m.total_rank}</span><ScoreBadge score={m.score} tier={m.tier} /></div>
      </div>

      <div className="grid g4">
        {kpis.map(([l, v, sub]) => <div key={l} className="card"><Stat label={l} value={v} sub={sub} /></div>)}
      </div>
      {profile === 'proveedor' && instaladoresCard}

      <div className="grid g2">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3>Por qué tiene este puntaje</h3>
          {Object.entries(prof.factors).map(([k, l]) => (
            <div key={k} className="compbar"><span>{l}</span><div className="track"><div className="fill" style={{ width: `${m.comp?.[k] ?? 0}%` }} /></div><span className="mono small">{m.comp?.[k] ?? '—'}</span></div>
          ))}
          {m.comp?.mercado != null && <div className="compbar"><span>Factor de mercado</span><div className="track"><div className="fill" style={{ width: `${m.comp.mercado}%`, background: 'var(--warm)' }} /></div><span className="mono small">{m.comp.mercado}</span></div>}
          <p className="small muted" style={{ margin: 0 }}>Perfil {prof.label}. Percentil frente a los demás municipios (100 = el mejor).{m.comp?.mercado != null ? ' El factor de mercado multiplica el resultado según el tamaño del mercado.' : ''} Pesos: {Object.entries(weights).map(([k, v]) => `${prof.factors[k]} ${v}`).join(' · ')}.</p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}><h3>Retorno de un sistema típico</h3>
            <div className="seg">{[3, 6, 10, 20].map((k) => <button key={k} className={kwp === k ? 'on' : ''} onClick={() => setKwp(k)}>{k} kWp</button>)}</div></div>
          <div className="grid g4" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
            <Stat label="Generación anual" value={`${fmt(kwhY)} kWh`} />
            <Stat label="Ahorro anual" value={money(ahorro)} />
            <Stat label="Inversión estimada" value={money(capex * kwp)} sub={`${cop(capex)} por kWp`} />
            <Stat label="Retorno simple" value={anos ? `${fmt(anos, 1)} años` : '—'} />
          </div>
          <p className="small muted" style={{ margin: 0 }}>Supuestos: rendimiento 78 %, toda la energía se autoconsume a la tarifa ({fmt(t)} $/kWh). El costo por kWp es un supuesto editable por el administrador; ajústalo a tus precios.</p>
        </div>
      </div>

      <div className="grid g2">
        <div className="card">
          <h3>Vivienda licenciada por mes (24 meses)</h3>
          <div style={{ marginTop: 12 }}><Bars values={serie} title="Unidades de vivienda licenciadas por mes" labels={serie.map((_, i) => { const d = new Date(meta.cortes.elic + '-01'); d.setMonth(d.getMonth() - (serie.length - 1 - i)); return `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; })} /></div>
          <div className="kv" style={{ marginTop: 14 }}>
            {estr.map((v, i) => <React.Fragment key={i}><span className="k">Estrato {i + 1}</span><span className="v">{fmt(v)}</span></React.Fragment>)}
            <span className="k">Casas (no apartamentos)</span><span className="v">{fmt(m.viv12_casas || 0)}</span>
            <span className="k">En suelo suburbano o rural</span><span className="v">{fmt(m.viv12_rural || 0)}</span>
            <span className="k">Área comercial y alojamiento</span><span className="v">{fmt(m.comer12_m2 || 0)} m²</span>
          </div>
          <p className="small muted">Fuente: DANE, Licencias de Construcción ELIC, corte {meta.cortes.elic}.</p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3>Mercado solar y competencia</h3>
          <div className="kv">
            {m.agpe_zona && <><span className="k">Autogeneradores en el mercado {m.agpe_zone} (XM, {meta.cortes.agpe_xm})</span><span className="v">{fmt(m.agpe_zona.n)} · {fmt(m.agpe_zona.mw, 1)} MW</span></>}
            <span className="k">Estimado en el municipio</span><span className="v">{fmt(m.agpe_est || 0)} ({fmt(m.agpe_10k, 1)} por 10.000 hab.)</span>
            <span className="k">Registrados en el SUI (2021-S2)</span><span className="v">{fmt(m.agpe_n || 0)}</span>
            <span className="k">Instaladores ubicados en el municipio</span><span className="v">{fmt(m.inst_n || 0)} ({fmt(m.inst_sol || 0)} con contratos solares)</span>
            <span className="k">Mayoristas de equipo en el municipio</span><span className="v">{fmt(m.mayor_n || 0)}</span>
            <span className="k">Licitaciones solares de entidades locales</span><span className="v">{fmt(m.secop_n || 0)}</span>
            {m.snr6 && <><span className="k">Actos de curaduría últimos 6 meses</span><span className="v">{fmt(m.snr6.total)}</span>
              <span className="k">· de urbanización / parcelación</span><span className="v">{fmt(m.snr6.urbanizacion)} / {fmt(m.snr6.parcelacion)}</span></>}
          </div>
          {m.empresas_cam && <><h3 style={{ marginTop: 6 }}>Empresas en la cámara de comercio local</h3>
            <div className="row">{Object.entries(m.empresas_cam).sort((a, b) => b[1] - a[1]).map(([k, v]) => <span key={k} className="chip">{k}: {fmt(v)}</span>)}</div></>}
          {m.curadurias && <p className="small muted" style={{ margin: 0 }}>Curadurías: {m.curadurias.join(', ')}</p>}
          <p className="small muted" style={{ margin: 0 }}>XM publica los autogeneradores por mercado de comercialización, no por municipio: el estimado reparte el total del mercado según los registros del SUI y la población.</p>
        </div>
      </div>

      <div className="grid g2">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3>Energía, tarifas y contingencias</h3>
          <div className="kv">
            <span className="k">Operador de red</span><span className="v">{m.or_name}</span>
            <span className="k">Tarifa residencial estratos 4-6 ({m.tarifa_periodo || 's/d'})</span><span className="v">{fmt(m.tarifa)} $/kWh</span>
            {m.tarifa_com && <><span className="k">Tarifa comercial</span><span className="v">{fmt(m.tarifa_com)} $/kWh</span></>}
            {m.kwh_mes_alto && <><span className="k">Consumo de hogares estratos 5-6 del departamento</span><span className="v">{fmt(m.kwh_mes_alto)} kWh/mes</span></>}
            {m.tarifa_ult && m.tarifa_ult !== m.tarifa && <><span className="k">Costo unitario publicado ({m.tarifa_ult_periodo})</span><span className="v">{fmt(m.tarifa_ult)} $/kWh</span></>}
            <span className="k">Subárea eléctrica (XM)</span><span className="v">{m.subarea || 's/d'}</span>
            <span className="k">Demanda no atendida 12 meses</span><span className="v">{m.dna_mwh != null ? `${fmt(m.dna_mwh)} MWh · ${fmt(m.dna_dias)} días` : 's/d'}</span>
            {m.itad > 0 && <><span className="k">Índice de interrupciones ITAD del OR ({m.itad_anio})</span><span className="v">{fmt(m.itad, 4)}</span></>}
            {m.zni_n > 0 && <><span className="k">Localidades no interconectadas (IPSE)</span><span className="v">{m.zni_n} · {fmt(m.zni_horas, 1)} h/día</span></>}
          </div>
          {m.tarifa_info?.serie?.length > 1 && <><h3 style={{ marginTop: 4 }}>Costo unitario {m.or_name} ($/kWh)</h3><Bars values={m.tarifa_info.serie.map((x) => x.v)} labels={m.tarifa_info.serie.map((x) => x.p)} height={60} title="Evolución de la tarifa" /></>}
          {m.dna_serie?.length > 1 && <><h3 style={{ marginTop: 4 }}>Demanda no atendida por mes · subárea {m.subarea} (kWh)</h3><Spark data={m.dna_serie} unit="kWh" title="Demanda no atendida mensual" /></>}
          <p className="small muted" style={{ margin: 0 }}>Más cortes = más interés en respaldo con baterías y sistemas híbridos. La demanda no atendida es de toda la subárea (XM, {meta.cortes.dna}), dividida por su población.</p>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3>Red eléctrica y plantas cercanas</h3>
          <div className="kv">
            <span className="k">Subestación más cercana</span><span className="v">{m.sub_n ? `${m.sub_n} · ${m.sub_kv} · ${m.sub_km < 0.5 ? 'en el municipio' : fmt(m.sub_km, 1) + ' km'}` : 's/d'}</span>
            {m.sub_op && <><span className="k">Operador de la subestación</span><span className="v small">{m.sub_op}</span></>}
            <span className="k">Subestaciones a menos de 30 km</span><span className="v">{fmt(m.subs30 || 0)} (máx. {fmt(m.kv30 || 0)} kV)</span>
            <span className="k">Plantas solares a menos de 30 km</span><span className="v">{fmt(m.solar30 || 0)} · {fmt(m.solar30_mw || 0)} MW</span>
          </div>
          {m.plantas?.length > 0 && (
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Planta solar</th><th className="num">MW</th><th>Estado</th></tr></thead><tbody>
              {m.plantas.map((p) => <tr key={p.n}><td className="name">{p.n}<br /><span className="small muted">{p.mun} · {p.op}</span></td><td className="num">{fmt(p.mw, 1)}</td><td className="small">{p.estado}{p.desde ? ` · ${p.desde.slice(0, 7)}` : ''}</td></tr>)}
            </tbody></table></div>
          )}
          {m.upme?.length > 0 && (<>
            <h3 style={{ marginTop: 4 }}>Proyectos registrados en la UPME (municipio y 30 km)</h3>
            <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Proyecto</th><th className="num">MW</th><th>Fase · operación prevista</th></tr></thead><tbody>
              {m.upme.map((p) => <tr key={p.id}><td className="name">{p.n}<br /><span className="small muted">{p.mun} · {p.tipo}{p.km ? ` · ${p.km} km` : ''}</span></td><td className="num">{fmt(p.mw, 1)}</td><td className="small">{p.fase} · {p.operacion?.slice(0, 7) || 's/d'}</td></tr>)}
            </tbody></table></div></>)}
          <div className="row"><a className="btn sm" href={`https://www.google.com/search?q=${encodeURIComponent(`${m.or_name} "Resolución CREG 174 de 2021" disponibilidad de red`)}`} target="_blank" rel="noreferrer">Consultar disponibilidad de red en el portal de {m.or_name}</a></div>
          <p className="small muted" style={{ margin: 0 }}>Cada operador de red debe publicar gratis, en un enlace de su página de inicio llamado "Usuarios Autogeneradores y Generadores Distribuidos - Resolución CREG 174 de 2021", la capacidad disponible de cada transformador (art. 7). Fuente: XM, mapa Paratec del STN/STR (algunas subestaciones aparecen ubicadas en el centro de su municipio; la distancia es aproximada). La red de media tensión de cada operador no es pública; en el mapa hay una estimación (gridfinder). Para conectar un sistema mayor a 100 kW hay que pedir la factibilidad al operador de red.</p>
        </div>
      </div>

      {profile !== 'proveedor' && instaladoresCard}
      {clientesCard}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Proyectos y licencias detectados ({m.proyectos.length})</h3>
        </div>
        {m.proyectos.length ? (
          <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Proyecto</th><th>Uso</th><th className="num">Unidades</th><th>Fecha</th><th>Fuente</th></tr></thead><tbody>
            {m.proyectos.slice(0, 40).map((p, i) => <tr key={i}><td className="name">{p.nombre}{p.direccion ? <><br /><span className="small muted">{p.direccion}</span></> : null}</td><td className="small">{p.uso || '—'}{p.estrato ? ` · ${p.estrato}` : ''}</td><td className="num">{fmt(p.unidades)}</td><td className="small">{p.fecha || '—'}</td><td className="small muted">{p.fuente}</td></tr>)}
          </tbody></table></div>
        ) : <p className="muted small" style={{ margin: 0 }}>Aún no hay proyectos individuales para este municipio. Las licencias detalladas solo están abiertas en algunos municipios; el administrador puede cargarlas (CSV) o extraerlas con IA de los avisos de la curaduría o planeación municipal.</p>}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <h3>Licitaciones públicas solares {m.secop.length ? 'en el municipio' : `en ${m.dpto}`}</h3>
        {(m.secop.length ? m.secop : m.secop_dpto).slice(0, 10).map((s) => (
          <div key={s.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
            <span style={{ flex: '1 1 300px' }}><b>{s.nombre}</b><br /><span className="small muted">{s.entidad} · {s.ciudad} · {s.fecha} · {s.estado}</span></span>
            <span className="mono small">{money(s.precio)}</span>
            {s.url && <a className="small" href={s.url} target="_blank" rel="noreferrer">SECOP</a>}
          </div>
        ))}
        {!m.secop.length && !m.secop_dpto.length && <p className="muted small" style={{ margin: 0 }}>Sin procesos registrados.</p>}
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>{profile === 'proveedor' ? 'Estrategia comercial con IA' : profile === 'desarrollador' ? 'Resumen de inversión con IA' : 'Argumento de venta con IA'}</h3>
          <div className="row"><button className="btn sm" onClick={() => go('asistente', m.code)}>Preguntar al asistente</button>
            <button className="btn sm primary" onClick={getPitch} disabled={pitchBusy || !paid}>{pitchBusy ? 'Generando…' : 'Generar'}</button></div>
        </div>
        {pitch && <div className="msg assistant" style={{ maxWidth: 'none' }}>{pitch}</div>}
        {!pitch && <p className="muted small" style={{ margin: 0 }}>{profile === 'proveedor' ? 'Diagnóstico de la plaza, instaladores a priorizar, argumentos con cifras y un mensaje para presentarte.' : profile === 'desarrollador' ? 'Diagnóstico del sitio, riesgos, qué verificar con el operador de red y un resumen ejecutivo.' : 'Diagnóstico de la zona, cliente ideal, argumentos con cifras y un mensaje de WhatsApp listo para enviar.'}</p>}
      </div>
    </div>
  );
}
