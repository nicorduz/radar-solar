import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { Icon } from './Icon.jsx';
import Markdown from './Markdown.jsx';
import { chatKey } from '../local.js';

const SUGS = {
  instalador: ['Explícame lo que estoy viendo y qué haría primero', '¿Qué municipios con hoteles y tarifa alta debería visitar primero?', 'Dame un guion de llamada para un hotel de 40 habitaciones'],
  proveedor: ['Resume lo que hay en esta pantalla', '¿Qué zonas tienen muchos autogeneradores y pocos mayoristas?', 'Escribe un mensaje para presentarme a instaladores del Valle'],
  desarrollador: ['¿Qué riesgos de inversión ves en esta pantalla?', '¿Qué municipios tienen buen sol, capacidad de red y poca competencia?', '¿Qué verificar con el operador de red antes de una granja de 1 MW?'],
  servicios: ['Resume lo que hay en esta pantalla', '¿Dónde hay más sistemas instalados que necesiten mantenimiento?', 'Escribe una oferta de mantenimiento para un hotel'],
  demanda: ['¿Cuáles de estas empresas propondrías primero y por qué?', '¿Cómo le explico la respuesta a la demanda a un gerente de planta?', '¿Qué datos de medición necesito pedirle a un cliente?'],
};

// Lo que el usuario tiene en pantalla, sin correos, teléfonos ni números de identificación
function pantalla(view) {
  const main = document.getElementById('main');
  if (!main) return null;
  const txt = (main.innerText || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[correo]')
    .replace(/\+?\d[\d\s().-]{8,}\d/g, '[número]')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 6000);
  const titulo = main.querySelector('h1')?.innerText || '';
  return { ruta: view, titulo: titulo.slice(0, 120), texto: txt };
}

// Botón fijo abajo a la derecha que abre el chat de Radar Solar IA desde cualquier sección
export default function AsistenteFlotante({ view, arg, abrir }) {
  const { paid, profile, segment } = useApp();
  const [open, setOpen] = useState(!!abrir);
  const [msgs, setMsgs] = useState(() => { try { return JSON.parse(sessionStorage.getItem(chatKey()) || '[]'); } catch { return []; } });
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [verPantalla, setVerPantalla] = useState(true);
  const [status, setStatus] = useState(null);
  const end = useRef(null);
  const input = useRef(null);
  const btn = useRef(null);

  useEffect(() => { if (abrir) setOpen(true); }, [abrir]);
  useEffect(() => { const on = () => setOpen(true); window.addEventListener('rs-chat', on); return () => window.removeEventListener('rs-chat', on); }, []);
  useEffect(() => { if (open && !status) api('/ai/status').then(setStatus).catch(() => {}); if (open) setTimeout(() => input.current?.focus(), 30); }, [open]);
  useEffect(() => { try { sessionStorage.setItem(chatKey(), JSON.stringify(msgs.slice(-20))); } catch { /* sin almacenamiento */ } end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    const k = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [open]);

  const code = view === 'm' || view === 'calculadora' || view === 'clientes' || view === 'industrias' || view === 'mapa' ? (/^\d{5}$/.test(arg || '') ? arg : null) : null;
  const send = async (q) => {
    const question = (q ?? txt).trim(); if (!question || busy) return;
    const next = [...msgs, { role: 'user', content: question }];
    setMsgs(next); setTxt(''); setBusy(true);
    try {
      const r = await api('/ai/chat', { method: 'POST', body: { messages: next, code, profile, segment, pantalla: verPantalla ? pantalla(view) : null } });
      setMsgs([...next, { role: 'assistant', content: r.answer }]); setStatus((s) => s && { ...s, quota: r.quota });
    } catch (e) { setMsgs([...next, { role: 'assistant', content: 'No se pudo responder: ' + e.message }]); }
    finally { setBusy(false); }
  };

  return (
    <>
      {!open && (
        <button ref={btn} className="ai-fab" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={false}>
          <Icon name="spark" size={18} /><span>Radar Solar IA</span>
        </button>
      )}
      {open && (
        <section className="ai-panel" role="dialog" aria-modal="false" aria-labelledby="ai-panel-t">
          <header className="ai-head">
            <Icon name="spark" size={18} />
            <h2 id="ai-panel-t">Radar Solar IA</h2>
            {status?.quota && <span className="chip small">{status.quota.left} hoy</span>}
            {msgs.length > 0 && <button className="btn sm ghost" onClick={() => setMsgs([])}>Nueva</button>}
            <button className="btn sm ghost ai-x" onClick={() => { setOpen(false); setTimeout(() => btn.current?.focus(), 0); }} aria-label="Cerrar asistente"><Icon name="x" size={16} /></button>
          </header>
          {status && !status.configured && <div className="alert small">La IA aún no está configurada en el servidor.</div>}
          <div className="ai-body" aria-live="polite">
            {!msgs.length && (
              <div className="ai-sugs">
                <p className="small muted">Pregunta sobre zonas, tarifas, red, clientes o lo que estás viendo. {paid ? '' : 'En prueba ve solo una parte de los datos.'}</p>
                {(SUGS[profile] || SUGS.instalador).map((s) => <button key={s} className="ai-sug" onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (m.role === 'assistant'
              ? <div key={i} className="msg assistant"><Markdown text={m.content} /><button className="btn sm ghost copy" onClick={() => navigator.clipboard?.writeText(m.content)}>Copiar</button></div>
              : <div key={i} className="msg user">{m.content}</div>))}
            {busy && <div className="msg assistant" role="status" aria-label="Pensando"><div className="spinner" /></div>}
            <div ref={end} />
          </div>
          <form className="ai-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <label className="ai-ver small"><input type="checkbox" checked={verPantalla} onChange={(e) => setVerPantalla(e.target.checked)} />Ver lo que tengo en pantalla</label>
            <div className="ai-in">
              <textarea ref={input} className="input" rows={2} placeholder="Escribe tu pregunta" value={txt} onChange={(e) => setTxt(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label="Pregunta para Radar Solar IA" />
              <button className="btn primary" disabled={busy || !txt.trim()} aria-label="Enviar"><Icon name="send" size={18} /></button>
            </div>
          </form>
        </section>
      )}
    </>
  );
}
