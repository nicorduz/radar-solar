import React, { useEffect, useMemo, useState } from 'react';
import { api, qs, fmt, money, cop } from '../api.js';
import { useApp } from '../App.jsx';
import { Spinner, ContactCTA } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import Markdown from '../components/Markdown.jsx';
import { readLocal, writeLocal } from '../local.js';
import { model } from './Calculadora.jsx';

const TIPOS = {
  comercial: ['Propuesta comercial para un cliente', 'Propuesta de energía solar'],
  zona: ['Informe de oportunidad de la zona', 'Informe de oportunidad solar'],
  alcaldia: ['Informe para alcaldía o gobernación', 'Potencial de la energía solar en el municipio'],
};
const HOGAR_PERSONAS = 3.1; // personas por hogar (supuesto de referencia)

// Propuestas e informes listos para descargar en PDF (desde el diálogo de impresión del navegador)
export default function Propuesta({ arg }) {
  const { user, paid, profile, prof, scoreParams, meta } = useApp();
  const zona = arg === 'zona';
  const [m, setM] = useState(null);
  const [err, setErr] = useState(null);
  const saved = readLocal('rs_propuesta_datos', {});
  const [f, setF] = useState({
    tipo: zona ? 'zona' : profile === 'instalador' || profile === 'respaldo' ? 'comercial' : 'zona',
    para: '', por: saved.por || user.company || user.name || '', contacto: saved.contacto || '', cliente: 'hogar', kwp: 6, intro: '', notas: '',
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const [busy, setBusy] = useState(false);
  const [aiErr, setAiErr] = useState(null);
  const z = zona ? readLocal('rs_zona_informe', null) : null;
  const code = zona ? z?.ref?.code : arg;

  useEffect(() => {
    if (!code || !paid) return;
    api(`/municipio/${code}` + qs(scoreParams)).then(setM).catch(setErr);
  }, [code, paid]);
  useEffect(() => { writeLocal('rs_propuesta_datos', { por: f.por, contacto: f.contacto }); }, [f.por, f.contacto]);

  const fin = useMemo(() => {
    if (!m) return null;
    const empresa = f.cliente === 'empresa';
    const tarifa = (empresa ? m.tarifa_com ?? m.tarifa : m.tarifa ?? m.tarifa_ult) || 800;
    return model({ tipo: f.cliente, kwp: +f.kwp || 1, capexKwp: meta.capex_kwp, tarifa, ghi: m.ghi || 4.5, pr: 78, autoconsumo: 100, exportPrecio: tarifa * 0.4, incr: 4, degr: 0.5, om: 1, vida: 25, financiado: 0, tasa: 18, plazo: 5, descuento: 12, renta: 35, deduccion: empresa, deducAnios: 5, rentaLiquida: 0, depAcelerada: empresa, ivaExcluido: false });
  }, [m, f.cliente, f.kwp]);

  if (!paid) return <div className="page" style={{ maxWidth: 900 }}><h1>Propuestas en PDF</h1><ContactCTA text="Genera propuestas comerciales e informes de zona con tu marca, listos para enviar a tus clientes." /></div>;
  if (zona && !z) return <div className="page"><div className="alert">Dibuja una zona en el mapa, selecciónala y toca "Informe PDF de esta zona".</div></div>;
  if (err) return <div className="page"><div className="alert err">{err.message}</div></div>;
  if (!m) return <Spinner />;

  const genIntro = async () => {
    setBusy(true); setAiErr(null);
    try { const r = await api(`/ai/propuesta/${m.code}`, { method: 'POST', body: { tipo: f.tipo, cliente: f.para, kwp: f.kwp, profile } }); set('intro', r.answer); }
    catch (e) { setAiErr(e.message); } finally { setBusy(false); }
  };
  const titulo = TIPOS[f.tipo][1];
  const hoy = new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  const hogares = m.pop ? Math.round(m.pop / HOGAR_PERSONAS) : null;
  const pot = hogares ? { n: Math.round(hogares * 0.05), kwp: Math.round(hogares * 0.05) * 3 } : null;
  if (pot) { pot.mwh = (pot.kwp * (m.ghi || 4.5) * 365 * 0.78) / 1000; pot.ahorro = pot.mwh * 1000 * (m.tarifa || 0); }

  return (
    <div className="page prop-page" style={{ maxWidth: 1000 }}>
      <div className="card no-print prop-controls">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>{zona ? 'Informe de la zona dibujada' : `Propuesta o informe · ${m.name}`}</h2>
          <button className="btn primary" onClick={() => window.print()}><Icon name="pdf" size={16} />Descargar PDF</button>
        </div>
        <div className="grid g3">
          {!zona && <label className="f">Tipo de documento<select className="select" value={f.tipo} onChange={(e) => set('tipo', e.target.value)}>{Object.entries(TIPOS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></label>}
          <label className="f">Preparado para<input className="input" value={f.para} placeholder={f.tipo === 'alcaldia' ? `Alcaldía de ${m.name}` : 'Nombre del cliente'} onChange={(e) => set('para', e.target.value)} /></label>
          <label className="f">Preparado por (tu empresa)<input className="input" value={f.por} onChange={(e) => set('por', e.target.value)} /></label>
          <label className="f">Tu contacto (teléfono o correo)<input className="input" value={f.contacto} onChange={(e) => set('contacto', e.target.value)} /></label>
          {f.tipo === 'comercial' && <>
            <label className="f">Tipo de cliente<select className="select" value={f.cliente} onChange={(e) => set('cliente', e.target.value)}><option value="hogar">Hogar</option><option value="empresa">Empresa o negocio</option></select></label>
            <label className="f">Tamaño del sistema (kWp)<input className="input mono" type="number" min="1" value={f.kwp} onChange={(e) => set('kwp', e.target.value)} /></label>
          </>}
        </div>
        <label className="f">Introducción (puedes escribirla o generarla con IA y editarla)
          <textarea className="input" rows={4} value={f.intro} onChange={(e) => set('intro', e.target.value)} placeholder="Texto de presentación del documento" />
        </label>
        <div className="row"><button className="btn sm" onClick={genIntro} disabled={busy}><Icon name="spark" size={14} />{busy ? 'Escribiendo…' : 'Escribir con IA'}</button><span className="small muted">Para guardarlo como PDF elige "Guardar como PDF" en la ventana de impresión.</span></div>
        {aiErr && <div className="alert err small">{aiErr}</div>}
        <label className="f">Notas o condiciones (opcional)<textarea className="input" rows={2} value={f.notas} onChange={(e) => set('notas', e.target.value)} placeholder="Garantías, tiempos de instalación, forma de pago…" /></label>
      </div>

      <article className="doc">
        <header className="doc-head">
          <img src="/radar-solar-logo.png" alt="Radar Solar · Powered by Talera" />
          <div className="doc-meta"><span>{hoy}</span>{f.por && <span>Preparado por <b>{f.por}</b></span>}{f.contacto && <span>{f.contacto}</span>}</div>
        </header>
        <div className="doc-title">
          <span className="doc-kicker">{zona ? 'Informe de zona' : TIPOS[f.tipo][0]}</span>
          <h1>{zona ? `Zona de estudio cerca de ${z.ref.name}` : f.tipo === 'comercial' ? `${titulo}${f.kwp ? ` de ${f.kwp} kWp` : ''}` : `${titulo}: ${m.name}`}</h1>
          <p>{m.name}, {m.dpto}{f.para ? ` · Para ${f.para}` : ''}</p>
        </div>
        {f.intro && <section className="doc-sec"><Markdown text={f.intro} /></section>}

        {f.tipo === 'comercial' && !zona && fin && (<>
          <section className="doc-sec">
            <h2>Tu sistema solar</h2>
            <div className="doc-kpis">
              <div><span>Potencia</span><b>{fmt(f.kwp)} kWp</b></div>
              <div><span>Energía al año</span><b>{fmt(fin.rows[1].gen)} kWh</b></div>
              <div><span>Ahorro el primer año</span><b>{money(fin.rows[1].ahorro)}</b></div>
              <div><span>Inversión estimada</span><b>{money(fin.capex)}</b></div>
              <div><span>Retorno de la inversión</span><b>{fin.payback != null ? `${fmt(fin.payback, 1)} años` : '—'}</b></div>
              <div><span>Ahorro en 25 años</span><b>{money(fin.ahorroTotal)}</b></div>
            </div>
          </section>
          <section className="doc-sec">
            <h2>Por qué conviene en {m.name}</h2>
            <ul>
              <li>La tarifa {f.cliente === 'empresa' ? 'comercial' : 'residencial'} de energía es de <b>{fmt(f.cliente === 'empresa' ? m.tarifa_com ?? m.tarifa : m.tarifa)} $/kWh</b>.</li>
              <li>La radiación solar promedio es de <b>{fmt(m.ghi, 2)} kWh/m² al día</b>.</li>
              {m.dna_dias > 0 && <li>La zona eléctrica registró cortes en <b>{fmt(m.dna_dias)} días</b> del último año: un sistema con baterías da respaldo.</li>}
              {m.agpe_est > 0 && <li>Se estiman <b>{fmt(m.agpe_est)} sistemas</b> de autogeneración ya conectados en el municipio.</li>}
            </ul>
          </section>
          {f.cliente === 'empresa' && <section className="doc-sec"><h2>Beneficios tributarios</h2><p>Las empresas pueden deducir de la renta hasta el 50 % de la inversión (en un plazo de hasta 15 años, sin superar el 50 % de la renta líquida), depreciar los equipos de forma acelerada y acceder a exclusión de IVA y exención de aranceles, con la certificación del proyecto (Ley 1715 de 2014 y Ley 2099 de 2021). La estimación incluye la deducción en 5 años y la depreciación acelerada; confirma tu caso con tu contador.</p></section>}
        </>)}

        {f.tipo === 'zona' && !zona && (<>
          <section className="doc-sec">
            <h2>Puntaje de oportunidad · {prof.label}</h2>
            <p className="doc-score"><b>{m.score}</b>/100 · puesto {m.rank} de {m.total_rank} municipios</p>
            {Object.entries(prof.factors).map(([k, l]) => <div key={k} className="doc-bar"><span>{l}</span><i><em style={{ width: `${m.comp?.[k] ?? 0}%` }} /></i><b>{m.comp?.[k] ?? '—'}</b></div>)}
          </section>
          <section className="doc-sec">
            <h2>Cifras clave</h2>
            <div className="doc-kpis">
              <div><span>Población</span><b>{fmt(m.pop)}</b></div>
              <div><span>Tarifa residencial</span><b>{fmt(m.tarifa)} $/kWh</b></div>
              <div><span>Tarifa comercial</span><b>{fmt(m.tarifa_com ?? m.tarifa)} $/kWh</b></div>
              <div><span>Radiación</span><b>{fmt(m.ghi, 2)} kWh/m²/día</b></div>
              <div><span>Vivienda nueva 12 meses</span><b>{fmt(m.viv12 || 0)}</b></div>
              <div><span>Días con cortes</span><b>{m.dna_dias != null ? fmt(m.dna_dias) : 's/d'}</b></div>
              <div><span>Instaladores</span><b>{fmt(m.inst_n || 0)}</b></div>
              <div><span>Autogeneradores estimados</span><b>{fmt(m.agpe_est || 0)}</b></div>
              <div><span>Subestación más cercana</span><b>{m.sub_km != null ? `${fmt(m.sub_km, 1)} km` : 's/d'}</b></div>
            </div>
          </section>
          {(m.upme?.length > 0 || m.plantas?.length > 0) && <section className="doc-sec"><h2>Proyectos y plantas cercanas</h2><ul>{m.upme.slice(0, 5).map((p) => <li key={p.id}>{p.n}: {fmt(p.mw, 1)} MW, {p.fase}{p.km ? `, a ${p.km} km` : ''}</li>)}{m.plantas.slice(0, 4).map((p) => <li key={p.n}>Planta {p.n}: {fmt(p.mw, 1)} MW ({p.estado})</li>)}</ul></section>}
        </>)}

        {f.tipo === 'alcaldia' && !zona && (<>
          <section className="doc-sec">
            <h2>El municipio en cifras</h2>
            <div className="doc-kpis">
              <div><span>Población</span><b>{fmt(m.pop)}</b></div>
              <div><span>Radiación solar</span><b>{fmt(m.ghi, 2)} kWh/m²/día</b></div>
              <div><span>Tarifa residencial</span><b>{fmt(m.tarifa)} $/kWh</b></div>
              <div><span>Días con cortes al año</span><b>{m.dna_dias != null ? fmt(m.dna_dias) : 's/d'}</b></div>
              <div><span>Sistemas solares estimados</span><b>{fmt(m.agpe_est || 0)}</b></div>
              <div><span>Contratos solares públicos</span><b>{fmt(m.secop_n || 0)}</b></div>
            </div>
          </section>
          {pot && <section className="doc-sec"><h2>Potencial para los hogares</h2><p>Si el 5 % de los cerca de {fmt(hogares)} hogares instalara un sistema de 3 kWp ({fmt(pot.n)} sistemas, {fmt(pot.kwp)} kWp en total), el municipio generaría unos <b>{fmt(pot.mwh)} MWh al año</b> y las familias ahorrarían cerca de <b>{money(pot.ahorro)} al año</b> en energía. Cálculo de referencia con {HOGAR_PERSONAS} personas por hogar y rendimiento de 78 %.</p></section>}
          <section className="doc-sec"><h2>Oportunidades para la administración</h2><ul><li>Sistemas solares en edificios públicos, colegios y puestos de salud para bajar la factura de energía.</li><li>Alumbrado público solar en zonas rurales.</li><li>Respaldo con baterías para servicios esenciales donde hay cortes.</li>{m.zni_n > 0 && <li>Soluciones solares para las {m.zni_n} localidades sin conexión a la red.</li>}<li>Incentivos tributarios de la Ley 1715 de 2014 para empresas que inviertan en el municipio.</li></ul></section>
          {m.secop?.length > 0 && <section className="doc-sec"><h2>Procesos solares recientes del municipio</h2><ul>{m.secop.slice(0, 5).map((s) => <li key={s.id}>{s.fecha}: {s.nombre} ({money(s.precio)})</li>)}</ul></section>}
        </>)}

        {zona && (<>
          <section className="doc-sec">
            <h2>La zona</h2>
            <div className="doc-kpis">
              <div><span>Tamaño</span><b>{z.medida || '—'}</b></div>
              {z.munis > 0 ? <>
                <div><span>Municipios dentro</span><b>{fmt(z.munis)}</b></div>
                <div><span>Habitantes</span><b>{fmt(z.pop)}</b></div>
              </> : <>
                <div><span>Municipio</span><b>{z.ref.name}</b></div>
                <div><span>Puntaje del municipio</span><b>{z.ref.score ?? '—'}/100</b></div>
              </>}
              <div><span>Plantas solares dentro</span><b>{fmt(z.solar)} ({fmt(z.solarMw)} MW)</b></div>
              <div><span>Subestaciones dentro</span><b>{fmt(z.subs)}</b></div>
              <div><span>Proyectos registrados</span><b>{fmt(z.upme)}</b></div>
            </div>
            {z.texto && <p>{z.texto}</p>}
          </section>
          {z.top?.length > 0 && <section className="doc-sec"><h2>Municipios con mejor puntaje en la zona</h2><table className="doc-tbl"><thead><tr><th>Municipio</th><th>Puntaje</th><th>Población</th><th>Tarifa $/kWh</th><th>Radiación</th></tr></thead><tbody>{z.top.map((d) => <tr key={d.code}><td>{d.name}, {d.dpto}</td><td>{d.score}</td><td>{fmt(d.pop)}</td><td>{fmt(d.tarifa)}</td><td>{fmt(d.ghi, 2)}</td></tr>)}</tbody></table></section>}
          <section className="doc-sec"><h2>Red eléctrica cercana al centro de la zona</h2><ul>{z.subsCerca.map((x) => <li key={x.n}>Subestación {x.n} ({x.kv}) a {fmt(x.km, 1)} km</li>)}{z.linea && <li>Línea de transmisión más cercana: {z.linea.kv} a {fmt(z.linea.km, 1)} km</li>}<li>{fmt(z.solar10)} plantas solares a menos de 10 km</li><li>Radiación de referencia ({z.ref.name}): {fmt(z.ref.ghi, 2)} kWh/m²/día · tarifa comercial {fmt(z.ref.tarifa_com ?? z.ref.tarifa)} $/kWh</li></ul><p className="doc-note">No incluye pendiente del terreno, uso del suelo, áreas protegidas ni capacidad disponible del transformador: se deben verificar con estudios y con el operador de red.</p></section>
        </>)}

        {f.notas && <section className="doc-sec"><h2>Condiciones</h2><p style={{ whiteSpace: 'pre-wrap' }}>{f.notas}</p></section>}
        <footer className="doc-foot">
          <span>Estimaciones de referencia basadas en información pública. No reemplazan un estudio técnico ni la factibilidad de conexión del operador de red.{f.tipo === 'comercial' && !zona ? ` Supuestos: costo de ${cop(meta.capex_kwp)} por kWp más IVA sobre equipos, rendimiento de 78 %, aumento de tarifa de 4 % anual.` : ''}</span>
          <span>Generado con Radar Solar · Powered by Talera · talera.co</span>
        </footer>
      </article>
    </div>
  );
}

