import React, { useEffect, useState } from 'react';
import { api, qs, fmt, money, cop } from '../api.js';
import { useApp } from '../App.jsx';
import { ScoreBadge, Stat, Bars, Spinner, ContactCTA, Spark, PrivacyNote, Contact, Section, Fuente, ProspectButton, FollowButton, waShare } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import Markdown from '../components/Markdown.jsx';

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
// Orden de las secciones según quién mira la ficha; las dos primeras se muestran abiertas
const ORDEN = {
  instalador: ['puntaje', 'retorno', 'clientes', 'energia', 'vivienda', 'ia', 'instaladores', 'mercado', 'red', 'proyectos', 'licitaciones'],
  proveedor: ['puntaje', 'instaladores', 'mercado', 'vivienda', 'ia', 'clientes', 'energia', 'red', 'proyectos', 'licitaciones'],
  desarrollador: ['puntaje', 'red', 'energia', 'retorno', 'ia', 'mercado', 'licitaciones', 'industrias', 'instaladores', 'vivienda', 'clientes', 'proyectos'],
  servicios: ['puntaje', 'mercado', 'red', 'instaladores', 'ia', 'energia', 'industrias', 'clientes', 'licitaciones', 'retorno', 'vivienda', 'proyectos'],
  respaldo: ['puntaje', 'energia', 'clientes', 'industrias', 'retorno', 'ia', 'vivienda', 'instaladores', 'mercado', 'red', 'proyectos', 'licitaciones'],
};
ORDEN.instalador.splice(3, 0, 'industrias');
ORDEN.proveedor.splice(5, 0, 'industrias');

export default function Municipio({ code }) {
  const { meta, paid, segment, weights, prof, profile, scoreParams, go } = useApp();
  const [m, setM] = useState(null);
  const [err, setErr] = useState(null);
  const [kwp, setKwp] = useState(6);
  const [pitch, setPitch] = useState(null);
  const [pitchBusy, setPitchBusy] = useState(false);
  const [share, setShare] = useState(null);

  useEffect(() => {
    setM(null); setErr(null); setPitch(null); setShare(null);
    api(`/municipio/${code}` + qs(scoreParams)).then(setM).catch((e) => setErr(e));
  }, [code, JSON.stringify(scoreParams)]);

  if (err?.status === 402) {
    return (
      <div className="page">
        <button className="btn sm ghost" onClick={() => history.back()} style={{ alignSelf: 'flex-start' }}><Icon name="back" size={16} />Volver</button>
        <h1>{err.data.basic.name} <span className="muted" style={{ fontWeight: 400 }}>· {err.data.basic.dpto}</span></h1>
        <div className="locked card" style={{ minHeight: 360 }}>
          <div className="blur grid g4">{['Puntaje', 'Tarifa', 'Vivienda 12m', 'Radiación', 'Proyectos', 'Licitaciones', 'Retorno', 'Competencia'].map((l) => <Stat key={l} label={l} value="000" />)}</div>
          <div className="lock-cta"><ContactCTA text="La ficha completa de cada municipio (tarifa, obra nueva, red eléctrica, clientes, instaladores y retorno de la inversión) está en el plan completo." /></div>
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
  const subTxt = m.sub_km != null ? (m.sub_km < 0.5 ? 'en el municipio' : `a ${fmt(m.sub_km, 1)} km`) : 's/d';

  const KPIS = {
    tarifa: ['Tarifa residencial estratos 4-6', `${fmt(m.tarifa)} $/kWh`, m.tarifa_periodo ? `periodo ${m.tarifa_periodo}` : null],
    tarifa_com: ['Tarifa comercial', `${fmt(m.tarifa_com ?? m.tarifa)} $/kWh`, m.tarifa_periodo ? `periodo ${m.tarifa_periodo}` : null],
    viv: ['Vivienda nueva 12 meses', fmt(m.viv12 || 0), `${fmt(m.viv12_alto || 0)} de estratos 4-6`],
    ghi: ['Radiación', `${fmt(m.ghi, 2)} kWh/m²`, `por día · ${fmt(m.temp, 1)} °C`],
    dna: ['Cortes de energía', m.dna_1k != null ? `${fmt(m.dna_1k)} kWh` : 's/d', 'no atendidos por 1.000 hab. al año'],
    turismo: ['Turismo', `${fmt(m.rnt_hab || 0)} hab.`, `${fmt(m.rnt_aloj || 0)} alojamientos`],
    inst: ['Instaladores', fmt(m.inst_n || 0), `${fmt(m.inst_sol || 0)} con contratos solares`],
    agpe: ['Autogeneradores', fmt(m.agpe_est || 0), 'estimados en el municipio'],
    sub: ['Subestación', m.sub_km != null ? (m.sub_km < 0.5 ? 'En el mpio.' : `${fmt(m.sub_km, 1)} km`) : 's/d', m.sub_kv || null],
    solar30: ['Solar a 30 km', `${fmt(m.solar30_mw || 0)} MW`, `${fmt(m.solar30 || 0)} plantas`],
    dias: ['Días con cortes', m.dna_dias != null ? fmt(m.dna_dias) : 's/d', 'en los últimos 12 meses'],
    upme: ['Proyectos nuevos', `${fmt(m.upme_mw || 0)} MW`, `${fmt(m.upme_n || 0)} registrados en la zona`],
  };
  const kpis = ({ instalador: ['tarifa', 'viv', 'dna', 'turismo'], proveedor: ['inst', 'agpe', 'viv', 'tarifa'], desarrollador: ['ghi', 'sub', 'solar30', 'tarifa_com'], servicios: ['agpe', 'solar30', 'upme', 'inst'], respaldo: ['dna', 'dias', 'tarifa', 'turismo'] }[profile] || ['tarifa', 'viv', 'ghi', 'dna']).map((k) => KPIS[k]);

  const getPitch = async () => {
    setPitchBusy(true);
    try { const r = await api(`/ai/pitch/${m.code}`, { method: 'POST', body: { segmento: meta.segments[segment], profile } }); setPitch(r.answer); }
    catch (e) { setPitch('⚠ ' + e.message); } finally { setPitchBusy(false); }
  };

  const S = {
    puntaje: { icon: 'chart', title: 'Por qué tiene este puntaje', hint: `Puesto ${m.rank} de ${m.total_rank} · perfil ${prof.short}`, body: (<>
      {Object.entries(prof.factors).map(([k, l]) => (
        <div key={k} className="compbar"><span>{l}</span><div className="track"><div className="fill" style={{ width: `${m.comp?.[k] ?? 0}%` }} /></div><span className="mono small">{m.comp?.[k] ?? '—'}</span></div>
      ))}
      {m.comp?.mercado != null && <div className="compbar"><span>Factor de mercado</span><div className="track"><div className="fill" style={{ width: `${m.comp.mercado}%`, background: 'var(--warm)' }} /></div><span className="mono small">{m.comp.mercado}</span></div>}
      <p className="small muted" style={{ margin: 0 }}>Cada barra compara al municipio con los demás (100 = el mejor). Pesos: {Object.entries(weights).map(([k, v]) => `${prof.factors[k]} ${v}`).join(' · ')}.</p>
    </>) },

    retorno: { icon: 'sun', title: 'Retorno de un sistema solar', hint: anos ? `${fmt(anos, 1)} años con ${kwp} kWp · ahorro ${money(ahorro)} al año` : 'Sin datos de tarifa', body: (<>
      <div className="seg" style={{ alignSelf: 'flex-start' }}>{[3, 6, 10, 20].map((k) => <button key={k} className={kwp === k ? 'on' : ''} onClick={() => setKwp(k)}>{k} kWp</button>)}</div>
      <div className="grid g4">
        <Stat label="Generación anual" value={`${fmt(kwhY)} kWh`} />
        <Stat label="Ahorro anual" value={money(ahorro)} />
        <Stat label="Inversión estimada" value={money(capex * kwp)} sub={`${cop(capex)} por kWp`} />
        <Stat label="Retorno simple" value={anos ? `${fmt(anos, 1)} años` : '—'} />
      </div>
      <p className="small muted" style={{ margin: 0 }}>Supuestos: rendimiento 78 % y toda la energía autoconsumida a {fmt(t)} $/kWh. El costo por kWp lo ajusta el administrador.</p>
    </>) },

    ia: { icon: 'spark', title: profile === 'proveedor' ? 'Estrategia comercial con IA' : profile === 'desarrollador' ? 'Resumen de inversión con IA' : 'Argumento de venta con IA', hint: profile === 'instalador' ? 'Diagnóstico, cliente ideal y mensaje de WhatsApp' : 'Diagnóstico y próximos pasos', body: (<>
      <div className="row"><button className="btn sm primary" onClick={getPitch} disabled={pitchBusy || !paid}>{pitchBusy ? 'Generando…' : 'Generar'}</button><button className="btn sm" onClick={() => go('asistente', m.code)}>Preguntar al asistente</button></div>
      {pitch && <div className="msg assistant" style={{ maxWidth: 'none' }}><Markdown text={pitch} /></div>}
    </>) },

    instaladores: { icon: 'building', title: 'Instaladores de la zona', hint: `${fmt(m.instaladores_n?.municipio || 0)} en el municipio · ${fmt(m.instaladores_n?.departamento || 0)} en ${m.dpto}`, body: (<>
      {m.instaladores?.length ? (
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Empresa</th><th className="num">Contratos solares</th><th>Contacto</th></tr></thead><tbody>
          {m.instaladores.map((e) => <tr key={e.nit + e.n}><td className="name">{e.n}<br /><span className="small muted">{e.mun || '—'}{e.ambito === 'departamento' ? ' · otro municipio' : ''}</span></td><td className="num">{e.sol_n || '—'}</td><td className="small"><Contact tel={e.tel} mail={e.mail} web={e.web} />{<ProspectButton p={{ tipo: 'empresa', nit: e.nit, nombre: e.n, code: m.code, mun: e.mun, tel: e.tel, mail: e.mail, detalle: e.cat }} />}</td></tr>)}
        </tbody></table></div>
      ) : <p className="muted small" style={{ margin: 0 }}>No hay instaladores ubicados en esta zona.</p>}
      {!paid && <ContactCTA text="La lista completa de instaladores con teléfono y correo está en el plan completo." />}
      <div className="row"><button className="btn sm" onClick={() => go('empresas')}>Ver directorio completo</button></div>
      <PrivacyNote />
    </>) },

    clientes: { icon: 'hotel', title: 'Hoteles y turismo', hint: `${fmt(m.clientes_n || 0)} establecimientos · ${fmt(m.rnt_hab || 0)} habitaciones`, body: (<>
      {m.clientes?.length ? (
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Establecimiento</th><th className="num">Habitaciones</th><th>Contacto</th></tr></thead><tbody>
          {m.clientes.map((c) => <tr key={c.id}><td className="name">{c.n}<br /><span className="small muted">{c.sub}</span></td><td className="num">{fmt(c.hab)}</td><td className="small"><Contact tel={c.tel} mail={c.mail} />{<ProspectButton p={{ tipo: 'hotel', ref: c.id, nombre: c.n, code: m.code, mun: m.name, tel: c.tel, mail: c.mail, detalle: `${c.sub} · ${c.hab} habitaciones` }} />}</td></tr>)}
        </tbody></table></div>
      ) : <p className="muted small" style={{ margin: 0 }}>No hay alojamientos turísticos activos registrados.</p>}
      {!paid && m.clientes_n > 1 && <ContactCTA text={`Hay ${fmt(m.clientes_n - 1)} establecimientos más con su contacto en el plan completo.`} />}
      {paid && m.clientes_n > m.clientes.length && <div className="row"><a className="btn sm" href={`#/clientes/${m.code}`}>Ver los {fmt(m.clientes_n)}</a></div>}
    </>) },

    energia: { icon: 'bolt', title: 'Tarifas y cortes de energía', hint: `${fmt(m.tarifa)} $/kWh · ${m.dna_1k != null ? fmt(m.dna_1k) + ' kWh sin servicio por 1.000 hab.' : 'cortes s/d'}`, body: (<>
      <div className="kv">
        <span className="k">Operador de red</span><span className="v">{m.or_name}</span>
        <span className="k">Tarifa residencial estratos 4-6 ({m.tarifa_periodo || 's/d'})</span><span className="v">{fmt(m.tarifa)} $/kWh</span>
        {m.tarifa_com && <><span className="k">Tarifa comercial</span><span className="v">{fmt(m.tarifa_com)} $/kWh</span></>}
        {m.kwh_mes_alto && <><span className="k">Consumo de hogares estratos 5-6</span><span className="v">{fmt(m.kwh_mes_alto)} kWh/mes</span></>}
        <span className="k">Subárea eléctrica</span><span className="v">{m.subarea || 's/d'}</span>
        <span className="k">Demanda no atendida (12 meses)</span><span className="v">{m.dna_mwh != null ? `${fmt(m.dna_mwh)} MWh · ${fmt(m.dna_dias)} días` : 's/d'}</span>
        {m.zni_n > 0 && <><span className="k">Localidades no interconectadas</span><span className="v">{m.zni_n} · {fmt(m.zni_horas, 1)} h/día</span></>}
      </div>
      {m.dna_serie?.length > 1 && <><h3>Cortes por mes en la subárea (kWh)</h3><Spark data={m.dna_serie} unit="kWh" title="Demanda no atendida mensual" /></>}
      <p className="small muted" style={{ margin: 0 }}>Más cortes, más interés en baterías y sistemas híbridos. Cortes de {meta.cortes.dna}.</p><Fuente>SUI y XM.</Fuente>
    </>) },

    red: { icon: 'layers', title: 'Red eléctrica, plantas y proyectos', hint: `Subestación ${subTxt} · ${fmt(m.solar30_mw || 0)} MW solares a 30 km · ${m.upme?.length || 0} proyectos registrados`, body: (<>
      <div className="kv">
        <span className="k">Subestación más cercana</span><span className="v">{m.sub_n ? `${m.sub_n} · ${m.sub_kv} · ${subTxt}` : 's/d'}</span>
        <span className="k">Subestaciones a menos de 30 km</span><span className="v">{fmt(m.subs30 || 0)} (máx. {fmt(m.kv30 || 0)} kV)</span>
        <span className="k">Plantas solares a menos de 30 km</span><span className="v">{fmt(m.solar30 || 0)} · {fmt(m.solar30_mw || 0)} MW</span>
      </div>
      {m.plantas?.length > 0 && (
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Planta solar</th><th className="num">MW</th><th>Estado</th></tr></thead><tbody>
          {m.plantas.map((p) => <tr key={p.n}><td className="name">{p.n}<br /><span className="small muted">{p.mun}</span></td><td className="num">{fmt(p.mw, 1)}</td><td className="small">{p.estado}</td></tr>)}
        </tbody></table></div>
      )}
      {m.upme?.length > 0 && (
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Proyecto de generación registrado</th><th className="num">MW</th><th>Operación prevista</th></tr></thead><tbody>
          {m.upme.map((p) => <tr key={p.id}><td className="name">{p.n}<br /><span className="small muted">{p.mun} · {p.fase}{p.km ? ` · ${p.km} km` : ''}</span></td><td className="num">{fmt(p.mw, 1)}</td><td className="small">{p.operacion?.slice(0, 7) || 's/d'}</td></tr>)}
        </tbody></table></div>
      )}
      <div className="row"><a className="btn sm" href={`https://www.google.com/search?q=${encodeURIComponent(`${m.or_name} "Resolución CREG 174 de 2021" disponibilidad de red`)}`} target="_blank" rel="noreferrer">Ver disponibilidad de red de {m.or_name}</a></div>
      <p className="small muted" style={{ margin: 0 }}>Cada operador publica gratis la capacidad disponible de sus transformadores (Resolución CREG 174 de 2021, art. 7).</p><Fuente>XM Paratec y UPME.</Fuente>
    </>) },

    vivienda: { icon: 'home', title: 'Vivienda y obra nueva', hint: `${fmt(m.viv12 || 0)} viviendas licenciadas en 12 meses · ${fmt(m.viv12_alto || 0)} de estratos 4-6`, body: (<>
      <Bars values={serie} title="Viviendas licenciadas por mes" labels={serie.map((_, i) => { const d = new Date(meta.cortes.elic + '-01'); d.setMonth(d.getMonth() - (serie.length - 1 - i)); return `${MESES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`; })} />
      <div className="kv">
        {estr.map((v, i) => <React.Fragment key={i}><span className="k">Estrato {i + 1}</span><span className="v">{fmt(v)}</span></React.Fragment>)}
        <span className="k">Casas (no apartamentos)</span><span className="v">{fmt(m.viv12_casas || 0)}</span>
        <span className="k">Área comercial y de alojamiento</span><span className="v">{fmt(m.comer12_m2 || 0)} m²</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Licencias de construcción, corte {meta.cortes.elic}.</p><Fuente>DANE ELIC.</Fuente>
    </>) },

    mercado: { icon: 'box', title: 'Mercado solar y competencia', hint: `${fmt(m.agpe_est || 0)} autogeneradores estimados · ${fmt(m.mayor_n || 0)} mayoristas`, body: (<>
      <div className="kv">
        {m.agpe_zona && <><span className="k">Autogeneradores en el mercado {m.agpe_zone}</span><span className="v">{fmt(m.agpe_zona.n)} · {fmt(m.agpe_zona.mw, 1)} MW</span></>}
        <span className="k">Estimado en el municipio</span><span className="v">{fmt(m.agpe_est || 0)}</span>
        <span className="k">Instaladores en el municipio</span><span className="v">{fmt(m.inst_n || 0)}</span>
        <span className="k">Mayoristas de equipo</span><span className="v">{fmt(m.mayor_n || 0)}</span>
        <span className="k">Licitaciones solares locales</span><span className="v">{fmt(m.secop_n || 0)}</span>
      </div>
      <p className="small muted" style={{ margin: 0 }}>Los autogeneradores se conocen por mercado; el valor del municipio es un estimado.</p>
    </>) },

    proyectos: { icon: 'doc', title: 'Proyectos y licencias detectados', hint: `${m.proyectos.length} registrados`, body: (
      m.proyectos.length ? (
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Proyecto</th><th className="num">Unidades</th><th>Fecha</th></tr></thead><tbody>
          {m.proyectos.slice(0, 40).map((p, i) => <tr key={i}><td className="name">{p.nombre}<br /><span className="small muted">{p.uso || ''}{p.direccion ? ` · ${p.direccion}` : ''}</span></td><td className="num">{fmt(p.unidades)}</td><td className="small">{p.fecha || '—'}</td></tr>)}
        </tbody></table></div>
      ) : <p className="muted small" style={{ margin: 0 }}>Aún no hay proyectos individuales. El administrador puede cargarlos o extraerlos con IA de los avisos de la curaduría.</p>
    ) },

    industrias: { icon: 'factory', title: 'Empresas grandes e industrias', hint: m.ci_n ? `${fmt(m.ci_n)} de las 10.000 empresas más grandes del país tienen sede aquí` : 'Ninguna de las empresas más grandes tiene sede aquí', body: (<>
      {m.ci?.length ? (
        <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Empresa</th><th className="num">Ingresos</th><th>Contacto</th></tr></thead><tbody>
          {m.ci.map((e) => <tr key={e.nit}><td className="name">{e.n}<br /><span className="small muted">{e.sector} · consumo {{ alta: 'alto', media: 'medio', baja: 'bajo' }[e.consumo]}</span></td><td className="num small">{fmt(e.ing)} mil M</td><td className="small"><Contact tel={e.tel} mail={e.mail} web={e.web} /><ProspectButton p={{ tipo: 'industria', nit: e.nit, nombre: e.n, code: m.code, mun: m.name, tel: e.tel, mail: e.mail, detalle: e.sector }} /></td></tr>)}
        </tbody></table></div>
      ) : <p className="muted small" style={{ margin: 0 }}>{paid ? 'Sin empresas grandes con sede en el municipio.' : ''}</p>}
      {!paid && m.ci_n > 0 && <ContactCTA text="La lista de empresas grandes con sector, ingresos y contacto está en el plan completo." />}
      <p className="small muted" style={{ margin: 0 }}>La sede es el domicilio principal; sus plantas o tiendas pueden estar en otros municipios. Consumo típico del sector como referencia.</p>
      {paid && <div className="row"><a className="btn sm" href={`#/industrias/${m.code}`}>Ver todas</a></div>}
    </>) },

    licitaciones: { icon: 'doc', title: 'Licitaciones públicas solares', hint: m.secop.length ? `${m.secop.length} en el municipio` : `${m.secop_dpto.length} en ${m.dpto}`, body: (<>
      {(m.secop.length ? m.secop : m.secop_dpto).slice(0, 10).map((s) => (
        <div key={s.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
          <span style={{ flex: '1 1 300px' }}><b>{s.nombre}</b><br /><span className="small muted">{s.entidad} · {s.fecha} · {s.estado}</span></span>
          <span className="mono small">{money(s.precio)}</span>
          {s.url && <a className="small" href={s.url} target="_blank" rel="noreferrer">Ver proceso</a>}
        </div>
      ))}
      {!m.secop.length && !m.secop_dpto.length && <p className="muted small" style={{ margin: 0 }}>Sin procesos registrados.</p>}
    </>) },
  };

  const orden = ORDEN[profile] || ORDEN.instalador;
  return (
    <div className="page" style={{ maxWidth: 1040 }}>
      <button className="btn sm ghost" onClick={() => history.back()} style={{ alignSelf: 'flex-start' }}><Icon name="back" size={16} />Volver</button>
      <div className="page-head">
        <div>
          <h1>{m.name} <span className="muted" style={{ fontWeight: 400 }}>· {m.dpto}</span></h1>
          <p className="muted small" style={{ margin: '4px 0 0' }}>{m.or_name} · {fmt(m.pop)} habitantes · código {m.code}</p>
        </div>
        <div className="row"><span className="muted small">Puesto {m.rank} de {m.total_rank}</span><ScoreBadge score={m.score} tier={m.tier} /></div>
      </div>
      {(
        <div className="row ficha-actions">
          <FollowButton m={m} />
          <button className="btn sm" onClick={() => go('propuesta', m.code)}><Icon name="pdf" size={15} />Propuesta o informe PDF</button>
          <button className="btn sm" onClick={() => go('calculadora', m.code)}><Icon name="calc" size={15} />Calculadora financiera</button>
          <button className="btn sm" onClick={() => go('diseno')}><Icon name="sun" size={15} />Diseñar un techo</button>
          {paid && <button className="btn sm" onClick={async () => { try { const r = await api(`/share/${m.code}`, { method: 'POST', body: { profile } }); setShare({ url: `${location.origin}/#/compartido/${r.token}`, expira: r.expira }); } catch (e) { setShare({ error: e.message }); } }}><Icon name="share" size={15} />Compartir ficha</button>}
        </div>
      )}
      {share && (
        <div className="card share-box">
          {share.error ? <span className="small">{share.error}</span> : (<>
            <span className="small">Enlace de solo lectura, sin datos de contacto. Vence el {share.expira}.</span>
            <input className="input mono small" readOnly value={share.url} onFocus={(e) => e.target.select()} aria-label="Enlace para compartir" />
            <div className="row" style={{ gap: 6 }}>
              <a className="btn sm primary" href={waShare(`Mira la oportunidad solar de ${m.name} (${m.dpto}) en Radar Solar: ${share.url}`)} target="_blank" rel="noreferrer"><Icon name="whatsapp" size={15} />Enviar por WhatsApp</a>
              <button className="btn sm" onClick={() => navigator.clipboard?.writeText(share.url)}>Copiar enlace</button>
              <button className="btn sm ghost" onClick={() => setShare(null)}>Cerrar</button>
            </div>
          </>)}
        </div>
      )}

      <div className="grid g4">
        {kpis.map(([l, v, sub]) => <div key={l} className="card"><Stat label={l} value={v} sub={sub} /></div>)}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {orden.map((k, i) => (
          <Section key={`${profile}-${k}`} icon={<Icon name={S[k].icon} />} title={S[k].title} hint={S[k].hint} open={i < 2}>{S[k].body}</Section>
        ))}
      </div>
    </div>
  );
}
