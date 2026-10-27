import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { Icon } from './Icon.jsx';
import { fmt, PROFILE_ICONS } from '../api.js';

export function Spinner() { return <div className="row" style={{ justifyContent: 'center', padding: 30 }}><div className="spinner" /></div>; }

export function ContactCTA({ text = 'Activa el plan completo para ver todos los datos.' }) {
  const { cfg } = useApp();
  const wa = cfg.contact?.whatsapp ? `https://wa.me/${cfg.contact.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, quiero activar el plan completo de ' + cfg.appName)}` : null;
  return (
    <div className="lock-box">
      <Icon name="lock" size={22} />
      <strong>Contenido del plan completo</strong>
      <span className="muted small">{text}</span>
      <div className="row" style={{ justifyContent: 'center' }}>
        {wa && <a className="btn primary" href={wa} target="_blank" rel="noreferrer">Escribir por WhatsApp</a>}
        {cfg.contact?.email && <a className="btn" href={`mailto:${cfg.contact.email}?subject=Plan completo ${cfg.appName}`}>Correo</a>}
        {!wa && !cfg.contact?.email && <span className="small">Pide al administrador que active tu plan.</span>}
      </div>
    </div>
  );
}

// Filas de relleno borrosas. Se generan en el navegador: el servidor no envía datos ocultos.
export function LockedRows({ cols, n = 10, text }) {
  const fake = Array.from({ length: n }, (_, i) => i);
  return (
    <div className="locked">
      <table className="tbl blur" aria-hidden="true">
        <tbody>
          {fake.map((i) => (
            <tr key={i}>{Array.from({ length: cols }, (_, c) => <td key={c} className={c > 1 ? 'num' : ''}>{c === 0 ? i + 2 : c === 1 ? 'Municipio ejemplo' : (((i + 3) * (c + 7) * 37) % 900 + 100)}</td>)}</tr>
          ))}
        </tbody>
      </table>
      <div className="lock-cta"><ContactCTA text={text} /></div>
    </div>
  );
}

export function ScoreBadge({ score, tier }) { return <span className={`score t-${tier}`}>{score ?? '—'}</span>; }

export function Stat({ label, value, sub }) {
  return <div className="stat"><span className="l">{label}</span><span className="v">{value}</span>{sub && <span className="s">{sub}</span>}</div>;
}

export function ProfileSwitch() {
  const { meta, profile, setProfile } = useApp();
  const keys = Object.keys(meta.profiles);
  if (keys.length < 2) return <div className="profile-one small muted"><Icon name={PROFILE_ICONS[profile]} size={15} />{meta.profiles[profile].label}</div>;
  return (
    <div className="profile-switch" role="group" aria-label="Ver la app como">
      {keys.map((k) => (
        <button key={k} className={profile === k ? 'on' : ''} onClick={() => setProfile(k)} title={meta.profiles[k].desc}>
          <Icon name={PROFILE_ICONS[k]} size={15} /><span>{meta.profiles[k].short}</span>
        </button>
      ))}
    </div>
  );
}

export function WeightsControl({ compact }) {
  const { meta, prof, paid, segment, setSegment, weights, setWeights } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <div className="row" style={{ gap: 8, flexWrap: compact ? 'nowrap' : 'wrap' }}>
      {prof.segments && (
        <div className="seg" role="group" aria-label="Segmento">
          {Object.entries(meta.segments).map(([k, l]) => (
            <button key={k} className={segment === k ? 'on' : ''} onClick={() => setSegment(k)}>{compact ? l.split(' ')[0] : l}</button>
          ))}
        </div>
      )}
      <button className="btn sm" onClick={() => setOpen(!open)} aria-expanded={open}><Icon name="sliders" size={16} />Pesos</button>
      {open && (
        <div className="modal-bg" onClick={() => setOpen(false)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><h2>Puntaje · {prof.label}</h2><button className="btn sm ghost" onClick={() => setOpen(false)}>Cerrar</button></div>
            <p className="muted small" style={{ margin: 0 }}>{prof.desc} Cada factor se convierte en un percentil entre los municipios (0 a 100) y se combina con estos pesos.{prof.segments ? ' Después se aplica un factor de mercado (0,5 a 1) según el volumen de obra nueva del segmento: un municipio sin construcción nueva no puede quedar arriba.' : ''} Cambiar los pesos reordena el ranking y el mapa.</p>
            {Object.entries(prof.factors).map(([k, l]) => (
              <label key={k} className="f">
                <span className="row" style={{ justifyContent: 'space-between' }}><span>{l}</span><span className="mono">{weights[k]}</span></span>
                <input type="range" min="0" max="60" step="5" value={weights[k] ?? 0} disabled={!paid} onChange={(e) => setWeights({ ...weights, [k]: +e.target.value })} />
              </label>
            ))}
            {!paid && <div className="alert small">Ajustar los pesos está disponible en el plan completo.</div>}
            {paid && <button className="btn" onClick={() => setWeights(prof.weights)}>Restablecer pesos por defecto</button>}
          </div>
        </div>
      )}
    </div>
  );
}

export function Bars({ values, labels, height = 90, title }) {
  const max = Math.max(1, ...values);
  return (
    <div>
      <div className="bars" style={{ height }} role="img" aria-label={title}>
        {values.map((v, i) => <div key={i} title={`${labels?.[i] ?? i}: ${fmt(v, 2)}`} style={{ height: `${(v / max) * 100}%`, opacity: 0.55 + 0.45 * (v / max) }} />)}
      </div>
      {labels && <div className="row small muted" style={{ justifyContent: 'space-between', marginTop: 4 }}><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div>}
    </div>
  );
}

// Línea de serie mensual sencilla (SVG) con etiquetas de inicio y fin
export function Spark({ data, height = 70, unit = '', title }) {
  if (!data?.length) return null;
  const w = 320, h = height, max = Math.max(...data.map((d) => d.v)) || 1, min = Math.min(0, ...data.map((d) => d.v));
  const x = (i) => (i / Math.max(1, data.length - 1)) * (w - 8) + 4;
  const y = (v) => h - 6 - ((v - min) / (max - min || 1)) * (h - 14);
  const pts = data.map((d, i) => `${x(i)},${y(d.v)}`).join(' ');
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img" aria-label={title} preserveAspectRatio="none">
        <polygon points={`${x(0)},${h - 6} ${pts} ${x(data.length - 1)},${h - 6}`} fill="var(--hot)" opacity="0.12" />
        <polyline points={pts} fill="none" stroke="var(--hot)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.v)} r="2.2" fill="var(--hot)"><title>{`${d.p}: ${fmt(d.v)} ${unit}`}</title></circle>)}
      </svg>
      <div className="row small muted" style={{ justifyContent: 'space-between' }}><span>{data[0].p}</span><span>máx. {fmt(max)} {unit}</span><span>{data[data.length - 1].p}</span></div>
    </figure>
  );
}

export function PrivacyNote() {
  return <p className="small muted" style={{ margin: 0 }}>Solo se muestran datos de contacto de personas jurídicas (NIT de empresa), tal como aparecen en registros públicos (SECOP II, Registro Nacional de Turismo). Úsalos para contacto comercial respetuoso; las personas pueden pedir no ser contactadas (Ley 1581 de 2012).</p>;
}

// Teléfono (con WhatsApp si es celular), correo y web
export function Contact({ tel, mail, web }) {
  if (!tel && !mail && !web) return <span className="muted">—</span>;
  const digits = String(tel || '').replace(/\D/g, '').replace(/^57(?=3\d{9}$)/, '');
  const cel = /^3\d{9}$/.test(digits);
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {tel && <span><a href={`tel:${digits || tel}`}>{tel}</a>{cel && <> · <a href={`https://wa.me/57${digits}`} target="_blank" rel="noreferrer">WhatsApp</a></>}</span>}
      {mail && <a href={`mailto:${mail}`} style={{ wordBreak: 'break-all' }}>{mail}</a>}
      {web && <a href={/^https?:/.test(web) ? web : `https://${web}`} target="_blank" rel="noreferrer">{web.replace(/^https?:\/\//, '').slice(0, 40)}</a>}
    </span>
  );
}

// Sección desplegable: título con ícono y un resumen de una línea; el detalle se abre al tocarla
export function Section({ icon, title, hint, open = false, children }) {
  return (
    <details className="sec" open={open}>
      <summary>
        <span className="sec-ic">{icon}</span>
        <span className="sec-t"><b>{title}</b>{hint && <span className="small muted">{hint}</span>}</span>
        <span className="caret" aria-hidden="true">▾</span>
      </summary>
      <div className="sec-body">{children}</div>
    </details>
  );
}
