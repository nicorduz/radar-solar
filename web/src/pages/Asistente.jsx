import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useApp } from '../App.jsx';
import { Icon } from '../components/Icon.jsx';

const SUGS = {
  instalador: ['¿Dónde conviene vender sistemas con baterías por los cortes de energía?', '¿Qué municipios con hoteles y tarifa alta debería visitar primero?', 'Compara Anapoima, Melgar y Girardot para vender casas campestres', 'Dame un guion de llamada para un hotel de 40 habitaciones'],
  proveedor: ['¿En qué ciudades hay más instaladores para abrir distribución?', '¿Qué zonas tienen muchos autogeneradores y pocos mayoristas?', '¿Qué instaladores de Cundinamarca han ganado contratos solares?', 'Escribe un mensaje para presentarme a instaladores del Valle'],
  desarrollador: ['¿Qué municipios tienen buen sol y subestación de 115 kV cerca?', '¿Dónde hay saturación de plantas solares?', 'Resume el precio de bolsa del último año y qué implica para un PPA', '¿Qué verificar con el operador de red antes de una granja de 1 MW?'],
};

export default function Asistente({ code }) {
  const { paid, profile, segment, prof } = useApp();
  const [msgs, setMsgs] = useState(() => { try { return JSON.parse(sessionStorage.getItem('rs_chat') || '[]'); } catch { return []; } });
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const end = useRef(null);

  useEffect(() => { api('/ai/status').then(setStatus).catch(() => {}); }, []);
  useEffect(() => { sessionStorage.setItem('rs_chat', JSON.stringify(msgs.slice(-20))); end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async (q) => {
    const question = (q ?? txt).trim(); if (!question || busy) return;
    const next = [...msgs, { role: 'user', content: question }];
    setMsgs(next); setTxt(''); setBusy(true);
    try {
      const r = await api('/ai/chat', { method: 'POST', body: { messages: next, code, profile, segment } });
      setMsgs([...next, { role: 'assistant', content: r.answer }]); setStatus((s) => s && { ...s, quota: r.quota });
    } catch (e) { setMsgs([...next, { role: 'assistant', content: '⚠ ' + e.message }]); }
    finally { setBusy(false); }
  };

  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head">
        <div><h1>Asistente comercial</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Responde con los datos de la plataforma y los documentos cargados. {paid ? '' : 'En prueba solo ve el puesto #1 y los departamentos.'}</p></div>
        <div className="row">
          {status?.quota && <span className="chip">{status.quota.left} consultas hoy</span>}
          {msgs.length > 0 && <button className="btn sm ghost" onClick={() => setMsgs([])}>Nueva conversación</button>}
        </div>
      </div>
      {status && !status.configured && <div className="alert">La IA aún no está configurada en el servidor. El administrador debe agregar una clave gratuita (GEMINI_API_KEY o GROQ_API_KEY).</div>}
      <div className="chat">
        {!msgs.length && <div className="grid g2">{(SUGS[profile] || SUGS.instalador).map((s) => <button key={s} className="card" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => send(s)}>{s}</button>)}</div>}
        {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.content}</div>)}
        {busy && <div className="msg assistant"><div className="spinner" /></div>}
        <div ref={end} />
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); send(); }} style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '10px 0', flexWrap: 'nowrap' }}>
        <textarea className="input" rows={2} placeholder="Pregunta sobre zonas, tarifas, proyectos o cómo vender…" value={txt} onChange={(e) => setTxt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} aria-label="Pregunta" style={{ resize: 'none' }} />
        <button className="btn primary" disabled={busy || !txt.trim()} aria-label="Enviar"><Icon name="send" size={18} /></button>
      </form>
    </div>
  );
}
