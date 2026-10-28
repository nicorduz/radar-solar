import React from 'react';
import { fmt, money } from '../api.js';
import MapSnapshot from './MapSnapshot.jsx';
import { inkOn, readableOnWhite, SELLO } from '../branding.js';

// Reporte PDF del diseño solar con la marca de la empresa del usuario.
// Gráficas en SVG (se imprimen nítidas); cada sección es una página A4.

const MES = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const AZ = { 0: 'sur', '-45': 'sureste', 45: 'suroeste', '-90': 'este', 90: 'oeste', 180: 'norte' };
const FE_RED = 0.177; // tCO2e/MWh, factor de emisión de la red colombiana 2023 para huella de carbono
const PERFIL = {
  hogar: [0.6, 0.5, 0.5, 0.5, 0.5, 0.7, 1.0, 1.1, 0.9, 0.8, 0.8, 0.9, 1.0, 0.9, 0.8, 0.8, 0.9, 1.1, 1.5, 1.7, 1.6, 1.3, 1.0, 0.8],
  empresa: [0.4, 0.4, 0.4, 0.4, 0.4, 0.5, 0.8, 1.3, 1.6, 1.7, 1.7, 1.6, 1.5, 1.6, 1.7, 1.7, 1.6, 1.3, 0.9, 0.7, 0.6, 0.5, 0.4, 0.4],
};

// Un día típico: consumo por hora, generación solar y lo que cubre la batería en la noche
function diaTipico({ consumoDia, genDia, tipo, batUtil }) {
  const p = PERFIL[tipo] || PERFIL.hogar, sp = p.reduce((a, b) => a + b, 0);
  const load = p.map((v) => (v / sp) * consumoDia);
  const shape = Array.from({ length: 24 }, (_, h) => Math.max(0, Math.sin((Math.PI * (h + 0.5 - 6)) / 12)));
  const ss = shape.reduce((a, b) => a + b, 0) || 1;
  const gen = shape.map((v) => (v / ss) * genDia);
  const auto = load.map((l, h) => Math.min(l, gen[h]));
  let carga = Math.min(batUtil || 0, gen.reduce((a, g, h) => a + Math.max(0, g - load[h]), 0)) * 0.92;
  const bat = Array(24).fill(0);
  for (const h of [17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6]) { const falta = load[h] - auto[h]; const d = Math.min(falta, carga); bat[h] = d; carga -= d; }
  return { load, gen, auto, bat };
}

export default function ReporteSolar({ d, marca, paid, cfg, fc, n, panel, kwp, genAnual, compensa, gen, consumo, sinBat, conBat, bat, batKwh, respaldoH, inversor, costoPV, costoBat, solar, tarifa }) {
  const c1 = marca.color1 || '#231D5D', c2 = marca.color2 || '#FF7A00';
  const t1 = readableOnWhite(c1), t2 = readableOnWhite(c2);
  const conviene = conBat && conBat.r.neto >= sinBat.r.neto * 0.9; // la batería se recomienda si su valor neto es parecido o mayor
  const best = conviene ? conBat : sinBat;
  const r = best.r;
  const costo = costoPV + (conviene ? costoBat : 0);
  const hoy = new Date();
  const fecha = hoy.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const vence = new Date(hoy.getTime() + (marca.validez || 30) * 864e5).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const codigo = `RS-${hoy.toISOString().slice(2, 10).replace(/-/g, '')}-${String(Math.round(kwp * 100)).padStart(4, '0')}`;
  const co2 = r.serie.reduce((a, s, i) => a + genAnual * Math.pow(0.995, i), 0) / 1000 * FE_RED;
  const dia = diaTipico({ consumoDia: consumo[0] / 30.4, genDia: genAnual / 365, tipo: d.tipo, batUtil: bat ? batKwh * bat.dod : 0 });
  const paginas = ['portada', 'resumen', 'techo', 'energia', 'inversion', ...(conBat ? ['respaldo'] : []), 'cierre'];
  const num = (k) => paginas.indexOf(k) + 1;
  const style = { '--c1': c1, '--c2': c2, '--t1': t1, '--t2': t2, '--k1': inkOn(c1) };
  const Logo = ({ claro }) => (marca.logo ? <img className="r2-logo" src={marca.logo} alt={marca.empresa || 'Logo'} /> : <b className="r2-logo-txt" style={{ color: claro ? inkOn(c1) : t1 }}>{marca.empresa || 'Su instalador solar'}</b>);
  const Head = ({ k, titulo }) => (
    <header className="r2-head"><Logo /><span><b>{String(num(k) - 1).padStart(2, '0')}</b> · {titulo}</span></header>
  );
  const Foot = ({ k }) => (
    <footer className="r2-foot">
      <span>{[marca.empresa, marca.telefono, marca.web].filter(Boolean).join(' · ')}</span>
      <span className="r2-sello"><img src="/icon.svg" alt="" />{SELLO}</span>
      <span>{num(k)} / {paginas.length}</span>
      {!paid && <i className="r2-water" aria-hidden="true">VERSIÓN DE PRUEBA</i>}
    </footer>
  );

  return (
    <article className="r2" style={style}>
      {/* Portada */}
      <section className="r2-page r2-cover">
        <div className="r2-cover-top"><Logo /><span className="r2-code">Propuesta {codigo}</span></div>
        <div className="r2-cover-title">
          <span className="r2-kick">Propuesta de energía solar{bat ? ' con almacenamiento' : ''}</span>
          <h1>{d.cliente || 'Su proyecto solar'}</h1>
          <p>{[d.direccion, solar?.muni ? `${solar.muni.name}, ${solar.muni.dpto}` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="r2-cover-img">
          <MapSnapshot sat={cfg.sat} fc={fc} width={1100} height={700} className="r2-snap" alt="Techo con los paneles propuestos" />
          <div className="r2-chips"><span><b>{fmt(n)}</b> paneles</span><span><b>{fmt(kwp, 1)}</b> kWp</span><span><b>{fmt(compensa)} %</b> de su consumo</span></div>
        </div>
        <div className="r2-cover-band">
          <div><span>Ahorro el primer año</span><b>{money(r.ahorro1)}</b></div>
          <div><span>Retorno de la inversión</span><b>{r.payback != null ? `${fmt(r.payback, 1)} años` : '> 25 años'}</b></div>
          <div><span>Ahorro neto en 25 años</span><b>{money(r.neto)}</b></div>
        </div>
        <div className="r2-cover-by">
          <span>Preparado por <b>{marca.asesor || marca.empresa || '—'}</b>{marca.cargo ? `, ${marca.cargo}` : ''}{marca.asesor && marca.empresa ? ` · ${marca.empresa}` : ''}</span>
          <span>{fecha} · válida hasta el {vence}</span>
        </div>
        <Foot k="portada" />
      </section>

      {/* 01 Resumen */}
      <section className="r2-page">
        <Head k="resumen" titulo="En una mirada" />
        <h2 className="r2-h">Su techo puede producir el <em>{fmt(Math.min(compensa, 999))} %</em> de la energía que consume.</h2>
        <div className="r2-sum">
          <Donut pct={compensa} c={c2} />
          <div className="r2-tiles">
            <Tile l="Generación al año" v={`${fmt(genAnual)} kWh`} />
            <Tile l="Consumo al año" v={`${fmt(consumo.reduce((a, b) => a + b, 0))} kWh`} />
            <Tile l="Factura hoy" v={`${money(r.facturaAntes / 12)}/mes`} />
            <Tile l="Factura con el sistema" v={`${money(Math.max(0, r.facturaDespues / 12))}/mes`} />
            <Tile l="Inversión" v={money(costo)} />
            <Tile l="CO₂ evitado en 25 años" v={`${fmt(co2, 1)} t`} />
          </div>
        </div>
        <div className="r2-reco">
          <span className="r2-reco-tag">Nuestra recomendación</span>
          <b>{conviene ? `Paneles solares con batería de ${fmt(batKwh, 1)} kWh` : `Sistema solar de ${fmt(kwp, 1)} kWp${conBat ? ' sin batería por ahora' : ''}`}</b>
          <p>{conviene
            ? `La batería aprovecha la energía que sobra al mediodía para la noche y le da ${fmt(respaldoH, 1)} horas de respaldo cuando se va la luz, con un retorno parecido al del sistema solo con paneles.`
            : conBat
              ? `La batería le daría ${fmt(respaldoH, 1)} horas de respaldo, pero alarga el retorno a ${conBat.r.payback != null ? fmt(conBat.r.payback, 1) + ' años' : 'más de 25 años'}. Se puede agregar después.`
              : `El sistema se paga en ${r.payback != null ? fmt(r.payback, 1) + ' años' : 'más de 25 años'} y después la energía es prácticamente gratis por el resto de su vida útil.`}</p>
        </div>
        <div className="r2-nada"><span>Si no hace nada, en 25 años pagará en energía cerca de</span><b>{money(r.sinHacer)}</b><span>(con un aumento de tarifa de {d.incr} % al año)</span></div>
        <Foot k="resumen" />
      </section>

      {/* 02 El techo */}
      <section className="r2-page">
        <Head k="techo" titulo="Su techo y su sol" />
        <h2 className="r2-h">{fmt(n)} paneles en {fmt(n * (panel.largo * panel.ancho) / 1e6)} m² de su techo</h2>
        <div className="r2-two">
          <MapSnapshot sat={cfg.sat} fc={fc} width={800} height={800} className="r2-snap sq" alt="Detalle del techo" />
          <table className="r2-facts"><tbody>
            <tr><td>Potencia instalada</td><td>{fmt(kwp, 2)} kWp</td></tr>
            <tr><td>Paneles</td><td>{fmt(n)} × {panel.w} W</td></tr>
            <tr><td>Inclinación</td><td>{d.tilt}°</td></tr>
            <tr><td>Orientación</td><td>hacia el {AZ[d.azimuth] || 'sur'}</td></tr>
            <tr><td>Altura del techo</td><td>{fmt(+d.altura, 1)} m</td></tr>
            <tr><td>Producción por kWp</td><td>{fmt(solar?.anual)} kWh/año</td></tr>
            <tr><td>Tarifa de energía</td><td>{fmt(tarifa)} $/kWh</td></tr>
          </tbody></table>
        </div>
        <h3 className="r2-h3">Cuánta energía da cada kWp, mes a mes</h3>
        <LineMes data={solar?.mensual || []} c={c2} unit="kWh por kWp" />
        <p className="r2-note">Estimado con radiación satelital del sitio{solar?.metodo === 'pvgis' ? ' (modelo de producción fotovoltaica con 14 % de pérdidas)' : ''}.</p>
        <Foot k="techo" />
      </section>

      {/* 03 Energía */}
      <section className="r2-page">
        <Head k="energia" titulo="Su energía" />
        <h2 className="r2-h">De dónde vendrá su energía cada mes</h2>
        <Stacked m={best.m} c1={c1} c2={c2} />
        <h3 className="r2-h3">Un día típico en su {d.tipo === 'empresa' ? 'negocio' : 'casa'}</h3>
        <DiaChart dia={dia} c1={c1} c2={c2} conBat={!!(conviene && bat)} />
        <p className="r2-note">Perfil de consumo típico de {d.tipo === 'empresa' ? 'un negocio' : 'un hogar'} ({d.diaFrac} % de día). La curva real depende de sus hábitos.</p>
        <Foot k="energia" />
      </section>

      {/* 04 Inversión */}
      <section className="r2-page">
        <Head k="inversion" titulo="Su inversión" />
        <h2 className="r2-h">El sistema se paga en {r.payback != null ? <em>{fmt(r.payback, 1)} años</em> : 'más de 25 años'}</h2>
        <Cash a={sinBat.r} b={conBat?.r} c1={c1} c2={c2} />
        <div className="r2-two">
          <Bills antes={r.facturaAntes / 12} solo={Math.max(0, sinBat.r.facturaDespues / 12)} con={conBat ? Math.max(0, conBat.r.facturaDespues / 12) : null} c1={c1} c2={c2} />
          <table className="r2-tbl"><thead><tr><th>Año</th><th>Ahorro del año</th><th>Acumulado</th></tr></thead><tbody>
            {[1, 5, 10, 15, 20, 25].map((y) => { const s = r.serie[y - 1]; return <tr key={y}><td>{y}</td><td>{money(s.ahorro)}</td><td className={s.acum >= 0 ? 'pos' : 'neg'}>{money(s.acum)}</td></tr>; })}
          </tbody></table>
        </div>
        {d.tipo === 'empresa' && <p className="r2-note">Las empresas pueden acceder a beneficios tributarios por invertir en energía solar (Ley 1715 de 2014 y Ley 2099 de 2021): deducción en renta de hasta el 50 % de la inversión, depreciación acelerada y exclusión de IVA, con la certificación del proyecto. No están incluidos en estas cifras; confírmelos con su contador.</p>}
        <p className="r2-note">Supuestos: aumento de tarifa de {d.incr} % anual, pérdida de rendimiento de los paneles de 0,5 % anual y mantenimiento de 1 % de la inversión al año{conBat ? '; la batería se reemplaza en el año 12' : ''}.</p>
        <Foot k="inversion" />
      </section>

      {/* 05 Respaldo */}
      {conBat && (
        <section className="r2-page">
          <Head k="respaldo" titulo="Respaldo con batería" />
          <h2 className="r2-h">Con batería, {fmt(respaldoH, 1)} horas de energía cuando se va la luz</h2>
          <div className="r2-two">
            <Gauge horas={respaldoH} c={c2} carga={+d.cargaCritica} />
            <table className="r2-tbl wide"><thead><tr><th></th><th>Solo paneles</th><th>Con batería</th></tr></thead><tbody>
              <tr><td>Inversión</td><td>{money(costoPV)}</td><td>{money(costoPV + costoBat)}</td></tr>
              <tr><td>Energía solar usada en casa</td><td>{fmt(pctAuto(sinBat.m, genAnual))} %</td><td>{fmt(pctAuto(conBat.m, genAnual))} %</td></tr>
              <tr><td>Factura mensual</td><td>{money(Math.max(0, sinBat.r.facturaDespues / 12))}</td><td>{money(Math.max(0, conBat.r.facturaDespues / 12))}</td></tr>
              <tr><td>Retorno</td><td>{sinBat.r.payback != null ? `${fmt(sinBat.r.payback, 1)} años` : '> 25'}</td><td>{conBat.r.payback != null ? `${fmt(conBat.r.payback, 1)} años` : '> 25'}</td></tr>
              <tr><td>Ahorro neto 25 años</td><td>{money(sinBat.r.neto)}</td><td>{money(conBat.r.neto)}</td></tr>
            </tbody></table>
          </div>
          {solar?.muni?.dna_dias > 0 && <div className="r2-reco"><span className="r2-reco-tag">Contexto de su zona</span><p>La zona eléctrica de {solar.muni.name} registró cortes en <b>{fmt(solar.muni.dna_dias)} días</b> del último año.</p></div>}
          <Foot k="respaldo" />
        </section>
      )}

      {/* Cierre: equipos, pasos y contacto */}
      <section className="r2-page">
        <Head k="cierre" titulo="Equipos y próximos pasos" />
        <div className="r2-eqs">
          <div className="r2-eq"><Art t="panel" c1={c1} /><b>{fmt(n)} módulos solares</b><span>{conMarca(panel)}</span><span>{panel.w} W · {panel.largo}×{panel.ancho} mm{panel.garantia ? ` · ${panel.garantia} años de garantía` : ''}</span></div>
          <div className="r2-eq"><Art t="inv" c1={c1} c2={c2} /><b>Inversor de {fmt(inversor, 1)} kW</b><span>Convierte la energía solar para su uso</span><span>Con monitoreo de la producción</span></div>
          {bat && <div className="r2-eq"><Art t="bat" c1={c1} c2={c2} /><b>Batería de {fmt(batKwh, 1)} kWh</b><span>{d.batN > 1 ? `${d.batN} × ` : ''}{conMarca(bat)}</span><span>{conviene ? 'Recomendada' : 'Opcional'}</span></div>}
        </div>
        <h3 className="r2-h3">Próximos pasos</h3>
        <ol className="r2-steps">
          {[['Visita técnica', 'Revisamos el techo, la estructura y el tablero eléctrico.'], ['Propuesta final', 'Ajustamos el diseño y confirmamos precio y tiempos.'], ['Trámites', 'Solicitamos la conexión como autogenerador ante el operador de red.'], ['Instalación', `Montamos paneles, inversor${bat ? ', batería' : ''} y protecciones.`], ['Encendido', 'Medidor bidireccional y monitoreo de su producción.']].map(([t, x], i) => (
            <li key={t}><i>{i + 1}</i><b>{t}</b><span>{x}</span></li>
          ))}
        </ol>
        <div className="r2-contact">
          <div className="r2-contact-l"><Logo claro /></div>
          <div className="r2-contact-r">
            <b>{marca.asesor || marca.empresa || 'Su asesor'}</b>
            {marca.cargo && <span>{marca.cargo}</span>}
            {[marca.telefono && `Tel. ${marca.telefono}`, marca.whatsapp && `WhatsApp ${marca.whatsapp}`].filter(Boolean).map((x) => <span key={x}>{x}</span>)}
            {marca.correo && <span>{marca.correo}</span>}
            {marca.web && <span>{marca.web}</span>}
            {(marca.direccion || marca.ciudad) && <span>{[marca.direccion, marca.ciudad].filter(Boolean).join(', ')}</span>}
            {marca.nit && <span>NIT {marca.nit}</span>}
          </div>
        </div>
        <p className="r2-note">{marca.condiciones} Propuesta válida hasta el {vence}. Estimación basada en información pública y radiación satelital; no reemplaza la visita técnica ni la factibilidad de conexión del operador de red.</p>
        <Foot k="cierre" />
      </section>
    </article>
  );
}

// Nombre del equipo con su marca, sin repetirla si el modelo ya la incluye
const conMarca = (e) => (e.marca === 'Genérico' || e.nombre.toLowerCase().startsWith(e.marca.toLowerCase()) ? e.nombre : `${e.marca} ${e.nombre}`);
const pctAuto = (m, g) => (m.reduce((a, x) => a + x.auto, 0) / Math.max(1, g)) * 100;
const Tile = ({ l, v }) => <div className="r2-tile"><span>{l}</span><b>{v}</b></div>;

function Donut({ pct, c }) {
  const p = Math.max(0, Math.min(100, pct)), R = 70, L = 2 * Math.PI * R;
  return (
    <svg viewBox="0 0 180 180" className="r2-donut" role="img" aria-label={`Cubre ${Math.round(pct)} % del consumo`}>
      <circle cx="90" cy="90" r={R} fill="none" stroke="#E8ECF6" strokeWidth="22" />
      <circle cx="90" cy="90" r={R} fill="none" stroke={c} strokeWidth="22" strokeDasharray={`${(p / 100) * L} ${L}`} strokeLinecap="round" transform="rotate(-90 90 90)" />
      <text x="90" y="88" textAnchor="middle" fontSize="34" fontWeight="800" fill="#14122E">{fmt(pct)}%</text>
      <text x="90" y="112" textAnchor="middle" fontSize="12" fill="#5A5F7A">de su consumo</text>
    </svg>
  );
}

function LineMes({ data, c, unit }) {
  if (!data.length) return null;
  const W = 640, H = 170, max = Math.max(...data) * 1.15, min = Math.min(...data) * 0.85;
  const x = (i) => 40 + (i / 11) * (W - 60), y = (v) => H - 20 - ((v - min) / (max - min || 1)) * (H - 40);
  const pts = data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="r2-chart" role="img" aria-label={unit}>
      <polygon points={`${x(0)},${H - 20} ${pts} ${x(11)},${H - 20}`} fill={c} opacity="0.12" />
      <polyline points={pts} fill="none" stroke={c} strokeWidth="3" strokeLinejoin="round" />
      {data.map((v, i) => <g key={i}><circle cx={x(i)} cy={y(v)} r="4" fill="#fff" stroke={c} strokeWidth="2" /><text x={x(i)} y={y(v) - 10} textAnchor="middle" fontSize="10" fill="#5A5F7A">{fmt(v)}</text><text x={x(i)} y={H - 4} textAnchor="middle" fontSize="11" fill="#5A5F7A">{MES[i]}</text></g>)}
    </svg>
  );
}

function Stacked({ m, c1, c2 }) {
  const W = 640, H = 230, max = Math.max(...m.map((x) => Math.max(x.auto + x.exp + x.imp, x.consumo))) * 1.08;
  const y = (v) => (v / max) * (H - 40);
  const bw = 30;
  const cons = m.map((x, i) => `${50 + i * 49 + bw / 2},${H - 24 - y(x.consumo)}`).join(' ');
  return (
    <figure className="r2-fig">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="r2-chart" role="img" aria-label="Energía por mes según su origen">
        {[0.25, 0.5, 0.75, 1].map((t) => <line key={t} x1="40" x2={W} y1={H - 24 - t * (H - 40)} y2={H - 24 - t * (H - 40)} stroke="#E8ECF6" />)}
        {m.map((x, i) => { const bx = 50 + i * 49; let base = H - 24; const seg = [[x.auto, c1], [x.imp, '#C5CBDD'], [x.exp, c2]]; return (
          <g key={i}>{seg.map(([v, col], k) => { const h = y(v); base -= h; return <rect key={k} x={bx} y={base} width={bw} height={Math.max(0, h)} fill={col} rx={k === 2 ? 3 : 0}><title>{fmt(v)} kWh</title></rect>; })}
            <text x={bx + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#5A5F7A">{MES[i]}</text></g>); })}
        <polyline points={cons} fill="none" stroke="#14122E" strokeWidth="2" strokeDasharray="5 4" />
      </svg>
      <figcaption className="r2-leg"><span><i style={{ background: c1 }} />Solar que usa directamente</span><span><i style={{ background: '#C5CBDD' }} />De la red</span><span><i style={{ background: c2 }} />Excedentes a la red</span><span><i className="dash" />Su consumo</span></figcaption>
    </figure>
  );
}

function DiaChart({ dia, c1, c2, conBat }) {
  const W = 640, H = 200, max = Math.max(...dia.load, ...dia.gen) * 1.15 || 1;
  const x = (h) => 40 + (h / 23) * (W - 60), y = (v) => H - 24 - (v / max) * (H - 40);
  const path = (arr) => arr.map((v, h) => `${x(h)},${y(v)}`).join(' ');
  const area = (arr) => `${x(0)},${H - 24} ${path(arr)} ${x(23)},${H - 24}`;
  return (
    <figure className="r2-fig">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="r2-chart" role="img" aria-label="Perfil de un día típico">
        <polygon points={area(dia.gen)} fill={c2} opacity="0.25" />
        <polygon points={area(dia.auto)} fill={c1} opacity="0.55" />
        {conBat && <polygon points={area(dia.bat)} fill="#5FD3A0" opacity="0.8" />}
        <polyline points={path(dia.load)} fill="none" stroke="#14122E" strokeWidth="2.2" />
        <polyline points={path(dia.gen)} fill="none" stroke={c2} strokeWidth="2.2" />
        {[0, 6, 12, 18, 23].map((h) => <text key={h} x={x(h)} y={H - 6} textAnchor="middle" fontSize="11" fill="#5A5F7A">{h}:00</text>)}
      </svg>
      <figcaption className="r2-leg"><span><i style={{ background: c2, opacity: 0.6 }} />Generación solar</span><span><i style={{ background: c1 }} />Solar que usa</span>{conBat && <span><i style={{ background: '#5FD3A0' }} />Desde la batería</span>}<span><i style={{ background: '#14122E' }} />Su consumo</span></figcaption>
    </figure>
  );
}

function Cash({ a, b, c1, c2 }) {
  const W = 640, H = 230, all = [...a.serie, ...(b ? b.serie : [])].map((s) => s.acum).concat([-1]);
  const lo = Math.min(...all, -Math.abs(all[0])), hi = Math.max(...all);
  const x = (i) => 60 + (i / 25) * (W - 80), y = (v) => H - 26 - ((v - lo) / (hi - lo || 1)) * (H - 44);
  const line = (r) => [`${x(0)},${y(r.serie[0].acum - r.serie[0].flujo)}`, ...r.serie.map((s) => `${x(s.y)},${y(s.acum)}`)].join(' ');
  const pb = (r) => (r.payback != null ? <g><circle cx={x(r.payback)} cy={y(0)} r="6" fill="#fff" stroke="currentColor" strokeWidth="3" /></g> : null);
  const mm = (v) => `${fmt(v / 1e6)} M`;
  return (
    <figure className="r2-fig">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="r2-chart" role="img" aria-label="Flujo de caja acumulado">
        {[lo, 0, hi].map((v) => <g key={v}><line x1="60" x2={W - 10} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#8A93B8' : '#E8ECF6'} strokeWidth={v === 0 ? 1.5 : 1} /><text x="54" y={y(v) + 4} textAnchor="end" fontSize="10" fill="#5A5F7A">{mm(v)}</text></g>)}
        <g color={c1}><polyline points={line(a)} fill="none" stroke={c1} strokeWidth="3" />{pb(a)}</g>
        {b && <g color={c2}><polyline points={line(b)} fill="none" stroke={c2} strokeWidth="3" strokeDasharray="7 4" />{pb(b)}</g>}
        {[0, 5, 10, 15, 20, 25].map((t) => <text key={t} x={x(t)} y={H - 8} textAnchor="middle" fontSize="11" fill="#5A5F7A">Año {t}</text>)}
      </svg>
      <figcaption className="r2-leg"><span><i style={{ background: c1 }} />Solo paneles</span>{b && <span><i style={{ background: c2 }} />Con batería</span>}<span>○ punto en que el sistema ya se pagó</span></figcaption>
    </figure>
  );
}

function Bills({ antes, solo, con, c1, c2 }) {
  const rows = [['Hoy', antes, '#8A93B8'], ['Con paneles', solo, c1], ...(con != null ? [['Con batería', con, c2]] : [])];
  const max = Math.max(...rows.map((r) => r[1])) || 1;
  return (
    <div className="r2-bills">
      <b>Su factura mensual</b>
      {rows.map(([l, v, c]) => <div key={l} className="r2-bill"><span>{l}</span><i style={{ width: `${Math.max(2, (v / max) * 100)}%`, background: c }} /><b>{money(v)}</b></div>)}
    </div>
  );
}

function Gauge({ horas, c, carga }) {
  const p = Math.min(1, horas / 24), R = 80, L = Math.PI * R;
  return (
    <svg viewBox="0 0 200 130" className="r2-gauge" role="img" aria-label={`${horas} horas de respaldo`}>
      <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke="#E8ECF6" strokeWidth="20" strokeLinecap="round" />
      <path d="M20 110 A80 80 0 0 1 180 110" fill="none" stroke={c} strokeWidth="20" strokeLinecap="round" strokeDasharray={`${p * L} ${L}`} />
      <text x="100" y="92" textAnchor="middle" fontSize="30" fontWeight="800" fill="#14122E">{fmt(horas, 1)} h</text>
      <text x="100" y="112" textAnchor="middle" fontSize="10.5" fill="#5A5F7A">con {fmt(carga, 1)} kW de carga esencial</text>
    </svg>
  );
}

function Art({ t, c1, c2 }) {
  if (t === 'panel') return <svg viewBox="0 0 90 60" width="90" height="60" aria-hidden="true"><path d="M10 50 L25 8 H85 L70 50 Z" fill={c1} />{[1, 2, 3, 4].map((i) => <line key={i} x1={10 + i * 15} y1="50" x2={25 + i * 15} y2="8" stroke="#fff" strokeOpacity="0.5" />)}{[1, 2].map((i) => <line key={'h' + i} x1={10 + i * 5} y1={50 - i * 14} x2={70 + i * 5} y2={50 - i * 14} stroke="#fff" strokeOpacity="0.5" />)}</svg>;
  if (t === 'inv') return <svg viewBox="0 0 90 60" width="90" height="60" aria-hidden="true"><rect x="28" y="4" width="34" height="52" rx="6" fill="#F3F5FB" stroke={c1} strokeWidth="2" /><rect x="34" y="12" width="22" height="10" rx="2" fill={c1} /><path d="M38 38 q4 -8 8 0 t8 0" fill="none" stroke={c2} strokeWidth="3" /></svg>;
  return <svg viewBox="0 0 90 60" width="90" height="60" aria-hidden="true"><rect x="24" y="6" width="42" height="50" rx="7" fill="#F3F5FB" stroke={c1} strokeWidth="2" /><rect x="30" y="26" width="30" height="24" rx="3" fill={c2} /><rect x="38" y="2" width="14" height="6" rx="2" fill={c1} /></svg>;
}
