import { config } from './config.js';

export const aiInfo = () => {
  const p = config.ai.provider;
  const c = config.ai[p];
  return { provider: p, model: (p === 'gemini' && geminiModel) || (p === 'xai' && xaiModel) || c?.model || null, configured: p !== 'none' && !!c?.key };
};

// Llama al proveedor configurado. messages: [{role:'user'|'assistant', content}]
export async function complete({ system, messages, json = false, temperature = 0.3, maxTokens = 1500 }) {
  const p = config.ai.provider;
  if (p === 'gemini') return gemini({ system, messages, json, temperature, maxTokens });
  if (p === 'xai') {
    // Si Grok falla (sin créditos, clave inválida) y hay clave de Gemini, se responde con Gemini
    try { return await grok({ system, messages, json, temperature, maxTokens }); }
    catch (e) { if (config.ai.gemini.key && e.status !== 429) { console.warn(e.message, '→ se usa Gemini'); return gemini({ system, messages, json, temperature, maxTokens }); } throw e; }
  }
  if (p === 'groq') return openaiLike({ base: 'https://api.groq.com/openai/v1', ...config.ai.groq, system, messages, json, temperature, maxTokens });
  if (p === 'openai') return openaiLike({ ...config.ai.openai, system, messages, json, temperature, maxTokens });
  throw Object.assign(new Error('La IA no está configurada. Agrega XAI_API_KEY (Grok), GEMINI_API_KEY o GROQ_API_KEY en las variables del servidor.'), { status: 503 });
}

let geminiModel = null;
async function pickGeminiModel(key) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
  const j = await r.json().catch(() => ({}));
  const ok = (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => m.name.replace('models/', ''))
    .filter((n) => /flash/.test(n) && !/(image|tts|audio|live|exp|preview|thinking|embedding)/.test(n));
  ok.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  return ok.find((n) => !/lite/.test(n)) || ok[0] || null;
}

async function gemini(args, retried = false) {
  const { system, messages, json, temperature, maxTokens } = args;
  const key = config.ai.gemini.key;
  const model = geminiModel || config.ai.gemini.model;
  if (!key) throw Object.assign(new Error('Falta GEMINI_API_KEY'), { status: 503 });
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    generationConfig: { temperature, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok && !retried && (r.status === 404 || /not found|not supported/i.test(j.error?.message || ''))) {
    // El modelo configurado ya no existe: elegir automáticamente el Flash vigente
    geminiModel = await pickGeminiModel(key);
    if (geminiModel) { console.log('Modelo Gemini seleccionado automáticamente:', geminiModel); return gemini(args, true); }
  }
  if (!r.ok) throw Object.assign(new Error(`Gemini: ${j.error?.message || r.status}`), { status: r.status === 429 ? 429 : 502 });
  const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw Object.assign(new Error('Gemini no devolvió texto (posible bloqueo de contenido).'), { status: 502 });
  return text;
}

// Grok (xAI). La API es compatible con OpenAI. Si no se define XAI_MODEL, se consulta la lista de modelos
// de la cuenta y se elige uno rápido y económico; si la lista no responde, se prueban nombres conocidos.
// Los errores de la cuenta (clave inválida, sin créditos, región) se muestran tal como los devuelve xAI.
const XAI_PREFERIDOS = ['grok-4.1-fast', 'grok-4-1-fast', 'grok-4-fast-non-reasoning', 'grok-4.3', 'grok-latest', 'grok-4'];
let xaiModel = null;
async function listXai(key) {
  try {
    const r = await fetch('https://api.x.ai/v1/models', { headers: { Authorization: `Bearer ${key}` } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: typeof j.error === 'string' ? j.error : j.error?.message || j.message || `HTTP ${r.status}`, status: r.status };
    const ids = [];
    for (const m of j.data || j.models || []) { ids.push(m.id, ...(m.aliases || [])); }
    return { ids: ids.filter(Boolean) };
  } catch (e) { return { error: e.message }; }
}
function pickXai(ids) {
  for (const p of XAI_PREFERIDOS) if (ids.includes(p)) return p;
  const text = ids.filter((id) => !/(image|imagine|vision|video|audio|tts|embed|code)/i.test(id));
  return text.find((id) => /fast/i.test(id) && !/(?<!non-)reasoning/i.test(id)) || text.find((id) => /fast|mini/i.test(id)) || text[0] || null;
}
const isModelError = (e) => /model|not found|does not exist|no access/i.test(e.message || '') && e.status !== 429;
async function grok(args) {
  const key = config.ai.xai.key;
  if (!key) throw Object.assign(new Error('Falta XAI_API_KEY'), { status: 503 });
  const tryModel = (model) => openaiLike({ base: 'https://api.x.ai/v1', key, model, ...args, label: 'Grok' });
  if (xaiModel) {
    try { return await tryModel(xaiModel); } catch (e) { if (!isModelError(e)) throw e; xaiModel = null; }
  }
  const list = await listXai(key);
  if (list.status === 401 || list.status === 403) throw Object.assign(new Error(`Grok: ${list.error}. Revisa la clave XAI_API_KEY y que la cuenta tenga créditos en console.x.ai.`), { status: 502 });
  const candidatos = [...new Set([config.ai.xai.model, list.ids && pickXai(list.ids), ...XAI_PREFERIDOS].filter(Boolean))];
  let ultimo = null;
  for (const m of candidatos) {
    try { const out = await tryModel(m); xaiModel = m; console.log('Modelo Grok en uso:', m); return out; }
    catch (e) { ultimo = e; if (!isModelError(e)) throw e; }
  }
  throw Object.assign(new Error(`Grok: ningún modelo respondió (${ultimo?.message || list.error || 'sin detalle'}).`), { status: 502 });
}

async function openaiLike({ base, key, model, system, messages, json, temperature, maxTokens, label = 'IA' }) {
  if (!key) throw Object.assign(new Error('Falta la clave de la API de IA'), { status: 503 });
  const r = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages], ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`${label}: ${typeof j.error === 'string' ? j.error : j.error?.message || j.message || r.status}`), { status: r.status === 429 ? 429 : r.status === 404 ? 404 : 502 });
  return j.choices?.[0]?.message?.content || '';
}

export function parseJSONLoose(text) {
  const t = String(text).replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch { /* sigue */ }
  const a = t.indexOf('['), o = t.indexOf('{');
  const start = a >= 0 && (o < 0 || a < o) ? a : o;
  const end = Math.max(t.lastIndexOf(']'), t.lastIndexOf('}'));
  if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
  throw new Error('Respuesta de IA no es JSON');
}
