import { config } from './config.js';

export const aiInfo = () => {
  const p = config.ai.provider;
  const c = config.ai[p];
  return { provider: p, model: (p === 'gemini' && geminiModel) || c?.model || null, configured: p !== 'none' && !!c?.key };
};

// Llama al proveedor configurado. messages: [{role:'user'|'assistant', content}]
export async function complete({ system, messages, json = false, temperature = 0.3, maxTokens = 1500 }) {
  const p = config.ai.provider;
  if (p === 'gemini') return gemini({ system, messages, json, temperature, maxTokens });
  if (p === 'groq') return openaiLike({ base: 'https://api.groq.com/openai/v1', ...config.ai.groq, system, messages, json, temperature, maxTokens });
  if (p === 'openai') return openaiLike({ ...config.ai.openai, system, messages, json, temperature, maxTokens });
  throw Object.assign(new Error('La IA no está configurada. Agrega GEMINI_API_KEY (gratis en aistudio.google.com) o GROQ_API_KEY en el archivo .env.'), { status: 503 });
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

async function openaiLike({ base, key, model, system, messages, json, temperature, maxTokens }) {
  if (!key) throw Object.assign(new Error('Falta la clave de la API de IA'), { status: 503 });
  const r = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages], ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`IA: ${j.error?.message || r.status}`), { status: r.status === 429 ? 429 : 502 });
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
