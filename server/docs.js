import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { extractText, getDocumentProxy } from 'unpdf';
import { db } from './db.js';
import { STORAGE } from './config.js';

export const UPLOADS = path.join(STORAGE, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

export async function fileToText(file, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  const buf = fs.readFileSync(file);
  if (ext === '.pdf') {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  if (['.txt', '.md', '.csv', '.json', '.html'].includes(ext)) return buf.toString('utf8');
  if (ext === '.xlsx') {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf);
    const out = [];
    wb.eachSheet((ws) => { out.push(`# ${ws.name}`); ws.eachRow((r) => out.push(r.values.slice(1).map((v) => (v?.text ?? v?.result ?? v ?? '')).join(' | '))); });
    return out.join('\n');
  }
  throw new Error(`Formato no soportado: ${ext}. Usa PDF, TXT, MD, CSV o XLSX.`);
}

export async function tableFromFile(file, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === '.csv') {
    const r = Papa.parse(fs.readFileSync(file, 'utf8'), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    return r.data;
  }
  if (ext === '.xlsx') {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    const head = ws.getRow(1).values.slice(1).map((h) => String(h ?? '').trim().toLowerCase());
    const rows = [];
    ws.eachRow((r, i) => { if (i === 1) return; const o = {}; r.values.slice(1).forEach((v, k) => { o[head[k]] = v?.text ?? v?.result ?? v; }); rows.push(o); });
    return rows;
  }
  throw new Error('Usa CSV o XLSX para cargas de datos.');
}

export function chunk(text, size = 1200, overlap = 150) {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const out = [];
  for (let i = 0; i < clean.length; i += size - overlap) out.push(clean.slice(i, i + size));
  return out;
}

export function saveDocText(docId, text) {
  const ins = db.prepare('INSERT INTO doc_chunks(doc_id,idx,text) VALUES(?,?,?)');
  chunk(text).forEach((c, i) => ins.run(docId, i, c));
}

const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const STOP = new Set('para como cual cuales donde esta este esto estos estas tiene tienen entre sobre desde hasta porque cuando muy mas menos pero ellos ellas solar energia'.split(' '));
export function searchChunks(query, { municipio, limit = 6 } = {}) {
  const terms = [...new Set(norm(query).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
  if (!terms.length) return [];
  const rows = db.prepare(`SELECT c.id, c.text, d.title, d.municipio FROM doc_chunks c JOIN documents d ON d.id=c.doc_id WHERE d.purpose='ia'`).all();
  const N = rows.length || 1;
  const df = Object.fromEntries(terms.map((t) => [t, rows.filter((r) => norm(r.text).includes(t)).length]));
  return rows.map((r) => {
    const t = norm(r.text);
    let s = 0;
    for (const term of terms) { const c = t.split(term).length - 1; if (c) s += (1 + Math.log(c)) * Math.log(1 + N / (1 + df[term])); }
    if (municipio && r.municipio === municipio) s *= 1.5;
    return { ...r, s };
  }).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).slice(0, limit);
}
