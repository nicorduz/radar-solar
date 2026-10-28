import React from 'react';

// Muestra texto Markdown (respuestas de la IA) con títulos, listas, tablas, negritas y enlaces.
// Se convierte a elementos de React, sin HTML crudo, así que no hay riesgo de inyectar código.

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:|#)[^)\s]+\)|https?:\/\/[^\s)]+|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;

function inline(text, keyBase = 'i') {
  const out = [];
  let last = 0, m, k = 0;
  const re = new RegExp(INLINE.source, 'g'); // propia por llamada: las negritas se procesan de forma anidada
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const key = `${keyBase}-${k++}`;
    if (t.startsWith('**') || t.startsWith('__')) out.push(<strong key={key}>{inline(t.slice(2, -2), key)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={key}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const mm = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const ext = /^https?:/.test(mm[2]);
      out.push(<a key={key} href={mm[2]} target={ext ? '_blank' : undefined} rel={ext ? 'noreferrer' : undefined}>{mm[1]}</a>);
    } else if (/^https?:\/\//.test(t)) out.push(<a key={key} href={t} target="_blank" rel="noreferrer">{t.replace(/^https?:\/\//, '').slice(0, 60)}</a>);
    else out.push(<em key={key}>{inline(t.slice(1, -1), key)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l);
const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

export default function Markdown({ text }) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    // Bloque de código
    if (/^\s*```/.test(l)) {
      const buf = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++; blocks.push(<pre key={k++}><code>{buf.join('\n')}</code></pre>); continue;
    }
    // Títulos
    const h = l.match(/^\s*(#{1,6})\s+(.*)$/);
    if (h) { const lvl = Math.min(4, Math.max(3, h[1].length + 1)); blocks.push(React.createElement(`h${lvl}`, { key: k++, className: 'md-h' }, inline(h[2].replace(/#+\s*$/, ''), `h${k}`))); i++; continue; }
    // Línea horizontal
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(l)) { blocks.push(<hr key={k++} />); i++; continue; }
    // Tabla
    if (l.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = cells(l); i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={k++} className="md-table"><table>
          <thead><tr>{head.map((c, j) => <th key={j}>{inline(c, `th${k}${j}`)}</th>)}</tr></thead>
          <tbody>{rows.map((r, ri) => <tr key={ri}>{head.map((_, j) => <td key={j}>{inline(r[j] || '', `td${k}${ri}${j}`)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    // Cita
    if (/^\s*>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(<blockquote key={k++}>{inline(buf.join(' '), `q${k}`)}</blockquote>); continue;
    }
    // Listas (con y sin número)
    const li = l.match(/^(\s*)([-*+•]|\d+[.)])\s+(.*)$/);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+•]|\d+[.)])\s+(.*)$/);
        if (m && /\d/.test(m[2]) === ordered && m[1].length < 2) { items.push({ text: m[3], sub: [] }); i++; continue; }
        if (m && items.length) { items[items.length - 1].sub.push(m[3]); i++; continue; }
        if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; continue; }
        break;
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(<Tag key={k++}>{items.map((it, j) => <li key={j}>{inline(it.text, `l${k}${j}`)}{it.sub.length > 0 && <ul>{it.sub.map((s, si) => <li key={si}>{inline(s, `s${k}${j}${si}`)}</li>)}</ul>}</li>)}</Tag>);
      continue;
    }
    // Párrafo
    const buf = [l.trim()]; i++;
    while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|```|>|[-*+•]\s|\d+[.)]\s)/.test(lines[i]) && !(lines[i].includes('|') && isTableSep(lines[i + 1] || ''))) buf.push(lines[i++].trim());
    blocks.push(<p key={k++}>{inline(buf.join(' '), `p${k}`)}</p>);
  }
  return <div className="md">{blocks}</div>;
}
