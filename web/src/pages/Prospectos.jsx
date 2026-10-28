import React, { useEffect, useMemo, useState } from 'react';
import { api, fmt, money, csvDownload } from '../api.js';
import { useApp } from '../App.jsx';
import { Spinner, Contact, ContactCTA, ProspectButton, waShare } from '../components/ui.jsx';
import { Icon } from '../components/Icon.jsx';
import { useLocal, FOLLOWS, PROSPECTS, SEEN, ESTADOS, TIPOS, toggleFollow, addProspect, writeLocal } from '../local.js';

const TIPO_NOV = { licitacion: ['doc', 'Licitación'], obra: ['home', 'Obra o licencia'], proyecto: ['bolt', 'Proyecto de generación'] };

// Mis prospectos: zonas que sigo con sus novedades y un tablero sencillo de seguimiento comercial
export default function Prospectos() {
  const { paid, go } = useApp();
  const [tab, setTab] = useState('novedades');
  if (!paid) {
    return (
      <div className="page" style={{ maxWidth: 900 }}>
        <h1>Mis prospectos</h1>
        <ContactCTA text="Sigue municipios, recibe las novedades de licitaciones, obras y proyectos en tus zonas y lleva el seguimiento de tus clientes potenciales." />
      </div>
    );
  }
  return (
    <div className="page" style={{ maxWidth: 1100 }}>
      <div className="page-head">
        <div><h1>Mis prospectos</h1><p className="muted small" style={{ margin: '4px 0 0' }}>Tus zonas, sus novedades y el seguimiento de cada cliente potencial. Se guarda en este navegador: usa "Copia de seguridad" para pasarlo a otro equipo.</p></div>
        <div className="seg" role="tablist">
          <button className={tab === 'novedades' ? 'on' : ''} onClick={() => setTab('novedades')}>Novedades de mis zonas</button>
          <button className={tab === 'prospectos' ? 'on' : ''} onClick={() => setTab('prospectos')}>Prospectos</button>
        </div>
      </div>
      {tab === 'novedades' ? <Novedades go={go} /> : <Tablero />}
    </div>
  );
}

function Novedades({ go }) {
  const [follows] = useLocal(FOLLOWS, []);
  const [seen] = useLocal(SEEN, []);
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [tipo, setTipo] = useState('');
  const [solo, setSolo] = useState('');
  const [munis, setMunis] = useState([]);
  const [add, setAdd] = useState('');
  const codes = follows.map((f) => f.code).join(',');

  useEffect(() => { api('/ranking?limit=1200').then((r) => setMunis(r.rows.map((x) => ({ code: x.code, name: x.name, dpto: x.dpto })))).catch(() => {}); }, []);
  useEffect(() => {
    if (!follows.length) { setItems([]); return; }
    setItems(null); setErr(null);
    api('/novedades', { method: 'POST', body: { codes: follows.map((f) => f.code) } }).then((r) => setItems(r.items)).catch((e) => setErr(e.message));
  }, [codes]);

  const seenSet = useMemo(() => new Set(seen), [seen]);
  const list = (items || []).filter((x) => (!tipo || x.tipo === tipo) && (!solo || x.code === solo));
  const nuevos = (items || []).filter((x) => !seenSet.has(x.id)).length;
  const markAll = () => writeLocal(SEEN, [...new Set([...seen, ...(items || []).map((x) => x.id)])].slice(-5000));
  const addZone = () => {
    const m = munis.find((x) => `${x.name} · ${x.dpto}` === add);
    if (m && !follows.some((f) => f.code === m.code)) toggleFollow(m);
    setAdd('');
  };

  return (
    <>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3>Zonas que sigo ({follows.length})</h3>
          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <input className="input" list="rs-munis" style={{ maxWidth: 260 }} placeholder="Agregar municipio" value={add} onChange={(e) => setAdd(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addZone()} aria-label="Agregar municipio a seguir" />
            <datalist id="rs-munis">{munis.map((m) => <option key={m.code} value={`${m.name} · ${m.dpto}`} />)}</datalist>
            <button className="btn sm" onClick={addZone} disabled={!add}><Icon name="plus" size={14} />Seguir</button>
          </div>
        </div>
        {follows.length ? (
          <div className="row" style={{ gap: 6 }}>
            {follows.map((f) => (
              <span key={f.code} className={`chip ${solo === f.code ? 'on' : ''}`}>
                <button className="link-btn" onClick={() => setSolo(solo === f.code ? '' : f.code)}>{f.name}</button>
                <button className="link-btn" onClick={() => go('m', f.code)} title="Abrir ficha"><Icon name="ext" size={12} /></button>
                <button className="link-btn" onClick={() => toggleFollow(f)} title="Dejar de seguir" aria-label={`Dejar de seguir ${f.name}`}><Icon name="x" size={12} /></button>
              </span>
            ))}
          </div>
        ) : <p className="small muted" style={{ margin: 0 }}>Aún no sigues ninguna zona. Agrega un municipio aquí o toca "Seguir zona" en la ficha de cualquier municipio.</p>}
      </div>

      {err && <div className="alert err">{err}</div>}
      {follows.length > 0 && !items && !err && <Spinner />}
      {items && items.length > 0 && (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="seg">
              {[['', 'Todo'], ['licitacion', 'Licitaciones'], ['obra', 'Obras y licencias'], ['proyecto', 'Proyectos de generación']].map(([k, l]) => <button key={k} className={tipo === k ? 'on' : ''} onClick={() => setTipo(k)}>{l}</button>)}
            </div>
            <span className="row" style={{ gap: 8 }}>
              <span className="small">{nuevos ? <b>{fmt(nuevos)} sin ver</b> : 'Todo visto'} · {fmt(items.length)} novedades</span>
              {nuevos > 0 && <button className="btn sm" onClick={markAll}><Icon name="check" size={14} />Marcar como vistas</button>}
            </span>
          </div>
          <div className="nov-list">
            {list.slice(0, 200).map((x) => {
              const nuevo = !seenSet.has(x.id);
              return (
                <div key={x.id} className={`card nov ${nuevo ? 'is-new' : ''}`}>
                  <span className="sec-ic"><Icon name={TIPO_NOV[x.tipo][0]} /></span>
                  <div className="nov-body">
                    <span className="small muted">{TIPO_NOV[x.tipo][1]} · {x.mun} · {x.fecha || 'sin fecha'}{x.abierto ? ' · ' : ''}{x.abierto && <b className="ok-txt">abierta</b>}{nuevo && <span className="tag hot" style={{ marginLeft: 6 }}>nuevo</span>}</span>
                    <b>{x.titulo}</b>
                    <span className="small muted">{x.detalle}{x.valor ? ` · ${money(x.valor)}` : ''}</span>
                  </div>
                  <div className="nov-actions">
                    {x.url && <a className="btn sm" href={x.url} target="_blank" rel="noreferrer">Ver proceso</a>}
                    {x.tipo === 'licitacion' && <ProspectButton p={{ tipo: 'licitacion', ref: x.id.slice(1), nombre: x.titulo, code: x.code, mun: x.mun, valor: x.valor, url: x.url, detalle: x.detalle }} />}
                    <a className="btn sm ghost" href={waShare(`${TIPO_NOV[x.tipo][1]} en ${x.mun}: ${x.titulo}${x.valor ? ` (${money(x.valor)})` : ''}${x.url ? ` ${x.url}` : ''}`)} target="_blank" rel="noreferrer" title="Compartir por WhatsApp"><Icon name="whatsapp" size={15} /></a>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {items && !items.length && follows.length > 0 && <p className="small muted">No hay novedades registradas en tus zonas por ahora.</p>}
      <p className="small muted">Las novedades se actualizan cada vez que se actualizan los datos de la plataforma. Revisa esta sección con frecuencia.</p>
    </>
  );
}

function Tablero() {
  const [list, setList] = useLocal(PROSPECTS, []);
  const [estado, setEstado] = useState('');
  const [q, setQ] = useState('');
  const [nuevo, setNuevo] = useState(null);
  const [msg, setMsg] = useState(null);
  const upd = (id, ch) => setList((l) => l.map((p) => (p.id === id ? { ...p, ...ch, actualizado: new Date().toISOString().slice(0, 10) } : p)));
  const del = (id) => setList((l) => l.filter((p) => p.id !== id));
  const counts = Object.fromEntries(ESTADOS.map(([k]) => [k, list.filter((p) => p.estado === k).length]));
  const rows = list.filter((p) => (!estado || p.estado === estado) && (!q || `${p.nombre} ${p.mun} ${p.nota}`.toLowerCase().includes(q.toLowerCase())));
  const valorAbierto = list.filter((p) => !['ganado', 'perdido'].includes(p.estado)).reduce((a, p) => a + (+p.valor || 0), 0);

  const exportCsv = () => csvDownload('prospectos.csv', ['nombre', 'tipo', 'estado', 'municipio', 'telefono', 'correo', 'valor', 'detalle', 'nota', 'creado', 'actualizado'],
    list.map((p) => [p.nombre, TIPOS[p.tipo] || p.tipo, ESTADOS.find((e) => e[0] === p.estado)?.[1], p.mun, p.tel, p.mail, p.valor, p.detalle, p.nota, p.creado, p.actualizado]));
  const backup = () => {
    const blob = new Blob([JSON.stringify({ version: 1, prospectos: list, zonas: JSON.parse(localStorage.getItem(FOLLOWS) || '[]') })], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `radar-solar-prospectos-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  const restore = async (file) => {
    try {
      const d = JSON.parse(await file.text());
      const ids = new Set(list.map((p) => p.id));
      setList([...list, ...(d.prospectos || []).filter((p) => p.id && !ids.has(p.id))]);
      if (Array.isArray(d.zonas)) { const cur = JSON.parse(localStorage.getItem(FOLLOWS) || '[]'); const have = new Set(cur.map((z) => z.code)); writeLocal(FOLLOWS, [...cur, ...d.zonas.filter((z) => z.code && !have.has(z.code))]); }
      setMsg('Copia de seguridad cargada.');
    } catch { setMsg('El archivo no es una copia de seguridad válida.'); }
  };
  const saveNuevo = (e) => {
    e.preventDefault();
    if (!nuevo?.nombre?.trim()) return;
    addProspect({ tipo: 'otro', ref: Date.now().toString(36), ...nuevo, nombre: nuevo.nombre.trim() });
    setNuevo(null);
  };

  return (
    <>
      <div className="pipeline">
        <button className={`card pipe ${!estado ? 'on' : ''}`} onClick={() => setEstado('')}><span className="small muted">Todos</span><b className="mono">{list.length}</b></button>
        {ESTADOS.map(([k, l]) => <button key={k} className={`card pipe pipe-${k} ${estado === k ? 'on' : ''}`} onClick={() => setEstado(estado === k ? '' : k)}><span className="small muted">{l}</span><b className="mono">{counts[k]}</b></button>)}
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          <input className="input" style={{ maxWidth: 240 }} placeholder="Buscar prospecto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar prospecto" />
          <button className="btn sm primary" onClick={() => setNuevo({ nombre: '', mun: '', tel: '', mail: '', valor: '', nota: '' })}><Icon name="plus" size={14} />Nuevo prospecto</button>
          {valorAbierto > 0 && <span className="small muted">Valor en curso: <b className="mono">{money(valorAbierto)}</b></span>}
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={exportCsv} disabled={!list.length}>Descargar CSV</button>
          <button className="btn sm" onClick={backup} disabled={!list.length}>Copia de seguridad</button>
          <label className="btn sm">Cargar copia<input type="file" accept="application/json" hidden onChange={(e) => e.target.files[0] && restore(e.target.files[0])} /></label>
        </div>
      </div>
      {msg && <div className="alert">{msg}</div>}
      {nuevo && (
        <form className="card grid g3" onSubmit={saveNuevo} style={{ gap: 10 }}>
          <label className="f">Nombre o empresa<input className="input" required value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} /></label>
          <label className="f">Municipio<input className="input" value={nuevo.mun} onChange={(e) => setNuevo({ ...nuevo, mun: e.target.value })} /></label>
          <label className="f">Valor estimado (COP)<input className="input" type="number" min="0" value={nuevo.valor} onChange={(e) => setNuevo({ ...nuevo, valor: e.target.value })} /></label>
          <label className="f">Teléfono<input className="input" value={nuevo.tel} onChange={(e) => setNuevo({ ...nuevo, tel: e.target.value })} /></label>
          <label className="f">Correo<input className="input" type="email" value={nuevo.mail} onChange={(e) => setNuevo({ ...nuevo, mail: e.target.value })} /></label>
          <label className="f">Nota<input className="input" value={nuevo.nota} onChange={(e) => setNuevo({ ...nuevo, nota: e.target.value })} /></label>
          <div className="row"><button className="btn primary sm">Guardar</button><button type="button" className="btn sm ghost" onClick={() => setNuevo(null)}>Cancelar</button></div>
        </form>
      )}
      {!list.length ? (
        <div className="card"><p className="small muted" style={{ margin: 0 }}>Todavía no tienes prospectos. Toca <b>+ Prospecto</b> en hoteles, empresas, industrias, licitaciones o en la ficha de un municipio, o crea uno a mano.</p></div>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl prospect-tbl"><thead><tr><th>Prospecto</th><th>Estado</th><th>Contacto</th><th className="num">Valor</th><th>Nota</th><th></th></tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id}>
                <td className="name">{p.nombre}<br /><span className="small muted">{TIPOS[p.tipo] || p.tipo}{p.mun ? ` · ${p.code ? '' : ''}${p.mun}` : ''}{p.detalle ? ` · ${p.detalle}` : ''}</span><br /><span className="small muted">Creado {p.creado} · actualizado {p.actualizado}</span></td>
                <td><select className={`select est-${p.estado}`} style={{ minWidth: 168 }} value={p.estado} onChange={(e) => upd(p.id, { estado: e.target.value })} aria-label="Estado">{ESTADOS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td className="small">{(p.tel || p.mail) ? <Contact tel={p.tel} mail={p.mail} /> : !p.url && <span className="muted">—</span>}{p.url && <a href={p.url} target="_blank" rel="noreferrer">Ver proceso</a>}</td>
                <td className="num"><input className="input mono" type="number" min="0" style={{ width: 130 }} value={p.valor || ''} placeholder="0" onChange={(e) => upd(p.id, { valor: e.target.value })} aria-label="Valor estimado" /></td>
                <td><textarea className="input" rows={2} style={{ minWidth: 200 }} value={p.nota || ''} placeholder="Próximo paso, acuerdos…" onChange={(e) => upd(p.id, { nota: e.target.value })} aria-label="Nota" /></td>
                <td><span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>{p.code && <a className="btn sm ghost" href={`#/m/${p.code}`} title="Ficha del municipio"><Icon name="map" size={14} /></a>}<button className="btn sm ghost" onClick={() => del(p.id)} title="Eliminar" aria-label={`Eliminar ${p.nombre}`}><Icon name="trash" size={14} /></button></span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
