import React, { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { Icon } from '../components/Icon.jsx';
import { useBranding, saveBranding, logoToDataUrl, inkOn, readableOnWhite, SELLO } from '../branding.js';

// Configuración > Mi marca: datos de la empresa que aparecen en propuestas y reportes PDF
export default function Marca() {
  const { user } = useApp();
  const marca = useBranding(user);
  const [f, setF] = useState(marca);
  const [msg, setMsg] = useState(null);
  useEffect(() => { setF(marca); }, [marca.updated_at]);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const onLogo = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) { setMsg({ err: true, t: 'Usa una imagen PNG, JPG, WEBP o SVG.' }); return; }
    try { const url = await logoToDataUrl(file); if (url.length > 440000) { setMsg({ err: true, t: 'El logo es muy pesado. Usa una imagen más liviana.' }); return; } set('logo', url); }
    catch { setMsg({ err: true, t: 'No se pudo leer la imagen.' }); }
  };
  const guardar = async (e) => {
    e.preventDefault();
    const ok = await saveBranding(f);
    setMsg(ok ? { t: 'Marca guardada. Ya aparece en tus propuestas y reportes.' } : { t: 'Guardada en este navegador. No se pudo guardar en el servidor; se volverá a intentar.' });
  };
  const T = (k, label, props = {}) => <label className="f">{label}<input className="input" value={f[k] || ''} onChange={(e) => set(k, e.target.value)} {...props} /></label>;

  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head"><div><h1>Mi marca</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Los datos de tu empresa se usan automáticamente en las propuestas, informes y reportes PDF que generes.</p></div></div>
      <div className="marca">
        <form className="card marca-form" onSubmit={guardar}>
          <h3>Logo y colores</h3>
          <div className="marca-logo">
            <div className="marca-logo-box">{f.logo ? <img src={f.logo} alt="Logo de la empresa" /> : <span className="small muted">Sin logo</span>}</div>
            <div className="row" style={{ gap: 6 }}>
              <label className="btn sm"><Icon name="upload" size={14} />Subir logo<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(e) => onLogo(e.target.files[0])} /></label>
              {f.logo && <button type="button" className="btn sm ghost" onClick={() => set('logo', '')}><Icon name="trash" size={14} />Quitar</button>}
            </div>
            <span className="small muted">PNG con fondo transparente, horizontal, idealmente.</span>
          </div>
          <div className="grid g2c">
            <label className="f">Color principal<span className="row" style={{ gap: 8 }}><input type="color" value={f.color1} onChange={(e) => set('color1', e.target.value)} aria-label="Color principal" /><input className="input mono" value={f.color1} onChange={(e) => set('color1', e.target.value)} /></span></label>
            <label className="f">Color de acento<span className="row" style={{ gap: 8 }}><input type="color" value={f.color2} onChange={(e) => set('color2', e.target.value)} aria-label="Color de acento" /><input className="input mono" value={f.color2} onChange={(e) => set('color2', e.target.value)} /></span></label>
          </div>
          <h3>Empresa</h3>
          <div className="grid g2c">
            {T('empresa', 'Nombre de la empresa', { required: true })}
            {T('nit', 'NIT')}
            {T('direccion', 'Dirección')}
            {T('ciudad', 'Ciudad')}
            {T('web', 'Sitio web')}
          </div>
          <h3>Contacto del asesor</h3>
          <div className="grid g2c">
            {T('asesor', 'Nombre')}
            {T('cargo', 'Cargo')}
            {T('telefono', 'Teléfono')}
            {T('whatsapp', 'WhatsApp')}
            {T('correo', 'Correo', { type: 'email' })}
            <label className="f">Validez de las propuestas (días)<input className="input mono" type="number" min="1" max="365" value={f.validez} onChange={(e) => set('validez', e.target.value)} /></label>
          </div>
          <label className="f">Condiciones comerciales (aparecen al final de cada propuesta)<textarea className="input" rows={3} value={f.condiciones} onChange={(e) => set('condiciones', e.target.value)} /></label>
          {msg && <div className={`alert ${msg.err ? 'err' : 'ok'}`}>{msg.t}</div>}
          <div className="row"><button className="btn primary"><Icon name="check" size={16} />Guardar marca</button></div>
        </form>

        <div className="marca-prev">
          <span className="small muted">Así se verá en tus documentos</span>
          <div className="mp" style={{ '--b1': f.color1, '--b2': f.color2, '--b1t': readableOnWhite(f.color1) }}>
            <div className="mp-top" style={{ background: f.color1, color: inkOn(f.color1) }}>
              {f.logo ? <img src={f.logo} alt="" /> : <b>{f.empresa || 'Tu empresa'}</b>}
              <span>Propuesta de energía solar</span>
            </div>
            <div className="mp-body">
              <span className="mp-kick" style={{ color: readableOnWhite(f.color2) }}>01 · En una mirada</span>
              <h4 style={{ color: readableOnWhite(f.color1) }}>Su techo puede generar el 98 % de la energía que consume</h4>
              <div className="mp-cards"><div><span>Ahorro anual</span><b>$16,9 M</b></div><div><span>Retorno</span><b>5,2 años</b></div></div>
              <div className="mp-contact"><b>{f.asesor || 'Nombre del asesor'}</b><span>{[f.cargo, f.empresa].filter(Boolean).join(' · ') || 'Cargo · Empresa'}</span><span>{[f.telefono, f.correo].filter(Boolean).join(' · ') || 'Teléfono · correo'}</span></div>
            </div>
            <div className="mp-foot"><span>{f.empresa || 'Tu empresa'}{f.web ? ` · ${f.web}` : ''}</span><span className="sello"><img src="/icon.svg" alt="" />{SELLO}</span></div>
          </div>
          <span className="small muted">El sello "{SELLO}" aparece siempre en los documentos.</span>
        </div>
      </div>
    </div>
  );
}
