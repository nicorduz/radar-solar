import { config } from './config.js';

// Proveedores de IA soportados. La app usa el primero que tenga clave y, si falla por cupo, créditos o
// modelo no disponible, pasa automáticamente al siguiente que tenga clave. Orden: el elegido en
// AI_PROVIDER (o el detectado) y luego Groq, Gemini, Grok y OpenAI-compatible.
const ORDEN = ['groq', 'gemini', 'xai', 'openai'];
const enUso = { proveedor: null, modelo: {} };

export const aiInfo = () => {
  const p = enUso.proveedor || config.ai.provider;
  const c = config.ai[p];
  const disponibles = ORDEN.filter((k) => config.ai[k]?.key);
  return { provider: p, model: enUso.modelo[p] || c?.model || null, configured: disponibles.length > 0, disponibles };
};

// Llama a la IA. messages: [{role:'user'|'assistant', content}]
export async function complete({ system, messages, json = false, temperature = 0.3, maxTokens = 1500 }) {
  const args = { system, messages, json, temperature, maxTokens };
  const cadena = [...new Set([config.ai.provider, ...ORDEN])].filter((k) => config.ai[k]?.key);
  if (!cadena.length) throw Object.assign(new Error('La IA no está configurada. Agrega GROQ_API_KEY (gratis en console.groq.com) en las variables del servidor.'), { status: 503 });
  const errores = [];
  for (const p of cadena) {
    try {
      const out = await RUN[p](args);
      if (enUso.proveedor !== p) console.log('IA en uso:', p, enUso.modelo[p] || '');
      enUso.proveedor = p;
      return out;
    } catch (e) {
      errores.push(`${NOMBRE[p]}: ${e.message}`);
      console.warn(`IA ${p} falló:`, e.message);
    }
  }
  const ultimo = errores[errores.length - 1] || 'sin detalle';
  throw Object.assign(new Error(cadena.length > 1 ? `Ninguna IA respondió. ${errores.join(' | ')}` : ultimo), { status: 502 });
}

const NOMBRE = { groq: 'Groq', gemini: 'Gemini', xai: 'Grok', openai: 'IA' };
const esErrorDeModelo = (e) => e.status === 404 || /model|not found|does not exist|decommission|not supported|no access/i.test(e.message || '');
const esCupoCero = (e) => /limit: 0|free_tier|quota/i.test(e.message || '');

// Cliente compatible con OpenAI (Groq, xAI, OpenRouter, OpenAI)
async function openaiLike({ base, key, model, system, messages, json, temperature, maxTokens }) {
  const r = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages], ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = typeof j.error === 'string' ? j.error : j.error?.message || j.message || `HTTP ${r.status}`;
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return j.choices?.[0]?.message?.content || '';
}
async function listarModelos(base, key) {
  try {
    const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return [];
    return (j.data || j.models || []).flatMap((m) => [m.id, ...(m.aliases || [])]).filter(Boolean);
  } catch { return []; }
}
// Prueba el modelo configurado; si no existe, consulta la lista de la cuenta y prueba los preferidos
async function conModelos(p, base, key, preferidos, filtro, args) {
  const intentar = async (model) => { const out = await openaiLike({ base, key, model, ...args }); enUso.modelo[p] = model; return out; };
  const primero = enUso.modelo[p] || config.ai[p].model || preferidos[0];
  try { return await intentar(primero); } catch (e) { if (!esErrorDeModelo(e)) throw e; }
  const lista = await listarModelos(base, key);
  const candidatos = [...new Set([...preferidos.filter((m) => !lista.length || lista.includes(m)), ...lista.filter(filtro)])].filter((m) => m !== primero);
  let ultimo = null;
  for (const m of candidatos.slice(0, 6)) {
    try { return await intentar(m); } catch (e) { ultimo = e; if (!esErrorDeModelo(e)) throw e; }
  }
  throw ultimo || new Error('no hay modelos disponibles');
}

// Groq: gratis sin tarjeta (console.groq.com)
const GROQ_PREF = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'meta-llama/llama-4-scout-17b-16e-instruct', 'qwen/qwen3-32b', 'llama-3.1-8b-instant'];
const groq = (args) => conModelos('groq', 'https://api.groq.com/openai/v1', config.ai.groq.key, GROQ_PREF,
  (id) => !/(whisper|tts|guard|orpheus|compound)/i.test(id), args);

// Grok (xAI): requiere créditos en console.x.ai
const XAI_PREF = ['grok-4.1-fast', 'grok-4-fast-non-reasoning', 'grok-4.3', 'grok-latest'];
const xai = (args) => conModelos('xai', 'https://api.x.ai/v1', config.ai.xai.key, XAI_PREF,
  (id) => /grok/i.test(id) && !/(image|imagine|vision|video|audio|code)/i.test(id), args);

// OpenAI o cualquier servicio compatible (por ejemplo OpenRouter con OPENAI_BASE_URL)
const openai = (args) => openaiLike({ ...config.ai.openai, ...args }).then((out) => { enUso.modelo.openai = config.ai.openai.model; return out; });

// Gemini: si el modelo no existe o no tiene cupo gratis ("limit: 0"), prueba otros modelos Flash de la cuenta
async function listarGemini(key) {
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
    const j = await r.json().catch(() => ({}));
    const ok = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => m.name.replace('models/', ''))
      .filter((n) => /flash|gemma/.test(n) && !/(image|tts|audio|live|exp|thinking|embedding|omni)/.test(n));
    ok.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    return ok;
  } catch { return []; }
}
async function geminiUna(model, { system, messages, json, temperature, maxTokens }) {
  const key = config.ai.gemini.key;
  const gemma = /gemma/.test(model); // Gemma no acepta instrucción de sistema aparte
  const contents = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  if (gemma && contents.length) contents[0] = { ...contents[0], parts: [{ text: `${system}\n\n${contents[0].parts[0].text}` }] };
  const body = {
    ...(gemma ? {} : { systemInstruction: { parts: [{ text: system }] } }),
    contents,
    generationConfig: { temperature, maxOutputTokens: maxTokens, ...(json && !gemma ? { responseMimeType: 'application/json' } : {}) },
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error?.message || `HTTP ${r.status}`), { status: r.status });
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw Object.assign(new Error('no devolvió texto (posible bloqueo de contenido)'), { status: 502 });
  return text;
}
async function gemini(args) {
  const primero = enUso.modelo.gemini || config.ai.gemini.model;
  const intentar = async (m) => { const out = await geminiUna(m, args); enUso.modelo.gemini = m; return out; };
  try { return await intentar(primero); } catch (e) { if (!(esErrorDeModelo(e) || (e.status === 429 && esCupoCero(e)))) throw e; }
  let ultimo = null;
  for (const m of (await listarGemini(config.ai.gemini.key)).filter((n) => n !== primero).slice(0, 6)) {
    try { return await intentar(m); } catch (e) { ultimo = e; if (!(esErrorDeModelo(e) || e.status === 429)) throw e; }
  }
  throw ultimo || new Error('ningún modelo de la cuenta tiene cupo gratis');
}

const RUN = { groq, gemini, xai, openai };

export function parseJSONLoose(text) {
  const t = String(text).replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch { /* sigue */ }
  const a = t.indexOf('['), o = t.indexOf('{');
  const start = a >= 0 && (o < 0 || a < o) ? a : o;
  const end = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
  throw new Error('Respuesta de IA no es JSON');
}
