import React, { useState } from 'react';
import { useApp } from '../App.jsx';
import { LEMA, TALERA_MAIL, SERVICIOS, Equipo, Cifras, Servicios } from '../components/Talera.jsx';

// Consultar a Talera desde la plataforma: qué hacemos, quiénes somos y un mensaje listo para enviar
export default function Talera() {
  const { cfg, user } = useApp();
  const [sel, setSel] = useState([]);
  const [proyecto, setProyecto] = useState('');
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const elegidos = SERVICIOS.filter((s) => sel.includes(s.id)).map((s) => s.t.toLowerCase());
  const texto = `Hola, soy ${user?.name || user?.username || 'usuario de Radar Solar'}. Quiero consultar a Talera${elegidos.length ? ` sobre ${elegidos.join(', ')}` : ''}.${proyecto.trim() ? `\n\nEl proyecto: ${proyecto.trim()}` : ''}`;
  const asunto = 'Consulta a Talera desde Radar Solar';
  const wa = cfg.contact?.whatsapp ? `https://wa.me/${cfg.contact.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(texto)}` : null;
  const mail = `mailto:${cfg.contact?.email || TALERA_MAIL}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto)}`;

  return (
    <div className="page tl-page">
      <div className="page-head">
        <div>
          <p className="tl-lema">{LEMA}</p>
          <h1>Consultar a Talera</h1>
          <p className="muted small" style={{ margin: '4px 0 0', maxWidth: '78ch' }}>Radar Solar es la herramienta. Talera estructura los proyectos: due diligence, finanzas, capital, respuesta a la demanda y análisis de mercado, con el mismo equipo que trabaja para inversionistas en Estados Unidos.</p>
        </div>
      </div>

      <section className="card tl-form" aria-labelledby="tl-form-t">
        <h2 id="tl-form-t">¿En qué te ayudamos?</h2>
        <div className="tl-opts" role="group" aria-label="Servicios">
          {SERVICIOS.map((s) => (
            <label key={s.id} className={`tl-opt ${sel.includes(s.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={sel.includes(s.id)} onChange={() => toggle(s.id)} />
              <span>{s.t}</span>
            </label>
          ))}
        </div>
        <label className="f">Cuéntanos del proyecto (opcional)
          <textarea className="input" rows={3} maxLength={800} value={proyecto} onChange={(e) => setProyecto(e.target.value)} placeholder="Tamaño, ubicación, etapa y qué necesitas decidir" />
        </label>
        <div className="row">
          {wa && <a className="btn primary" href={wa} target="_blank" rel="noreferrer">Enviar por WhatsApp</a>}
          <a className={`btn ${wa ? '' : 'primary'}`} href={mail}>Enviar por correo</a>
          <span className="small muted">Se abre con el mensaje listo; tú decides si lo envías.</span>
        </div>
      </section>

      <section aria-labelledby="tl-serv-t" className="stack">
        <h2 id="tl-serv-t" className="tl-h2">Lo que hacemos</h2>
        <Servicios />
      </section>

      <section aria-labelledby="tl-hecho-t" className="stack">
        <h2 id="tl-hecho-t" className="tl-h2">Lo que hemos hecho</h2>
        <Cifras />
        <p className="small muted" style={{ margin: 0 }}>Proyectos en los que ha trabajado el equipo de Talera, sobre todo en Estados Unidos. Los clientes son confidenciales.</p>
      </section>

      <section aria-labelledby="tl-eq-t" className="stack">
        <h2 id="tl-eq-t" className="tl-h2">Quiénes somos</h2>
        <Equipo />
        <p className="small"><a href="https://www.talera.co/" target="_blank" rel="noreferrer">talera.co</a></p>
      </section>
    </div>
  );
}
