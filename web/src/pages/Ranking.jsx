import React, { useEffect, useState } from 'react';
import { api, qs, fmt, METRICS, csvDownload } from '../api.js';
import { useApp } from '../App.jsx';
import { WeightsControl, ScoreBadge, LockedRows, Spinner } from '../components/ui.jsx';

export default function Ranking() {
  const { meta, paid, prof, profile, scoreParams, go } = useApp();
  const cols = prof.metrics.filter((k) => k !== 'score' && METRICS[k]);
  const [f, setF] = useState({ q: '', dpto: '', or: '', minPop: '' });
  const [data, setData] = useState(null);
  const [limit, setLimit] = useState(100);

  useEffect(() => {
    setData(null);
    const t = setTimeout(() => api('/ranking' + qs({ ...scoreParams, ...f, limit })).then(setData), 200);
    return () => clearTimeout(t);
  }, [JSON.stringify(scoreParams), f, limit]);

  const csv = () => {
    const keys = ['tarifa', 'tarifa_com', 'kwh_mes_alto', 'viv12', 'viv12_alto', 'ghi', 'temp', 'dna_1k', 'subarea', 'turismo_idx', 'rnt_hab', 'rnt_vivtur', 'agpe_est', 'agpe_10k', 'inst_n', 'inst_sol', 'mayor_n', 'sub_n', 'sub_kv', 'sub_km', 'solar30', 'solar30_mw', 'secop_n', 'pop'];
    csvDownload(`ranking-${profile}.csv`, ['puesto', 'codigo_dane', 'municipio', 'departamento', 'operador', 'puntaje', ...keys], data.rows.map((r) => [r.rank, r.code, r.name, r.dpto, r.or, r.score, ...keys.map((k) => r[k])]));
  };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Ranking · {prof.label}</h1><p className="muted small" style={{ margin: '4px 0 0' }}>{prof.desc}</p></div>
        <WeightsControl />
      </div>
      {paid && (
        <div className="row">
          <input className="input" style={{ maxWidth: 240 }} placeholder="Buscar municipio" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} aria-label="Buscar municipio" />
          <select className="select" style={{ maxWidth: 220 }} value={f.dpto} onChange={(e) => setF({ ...f, dpto: e.target.value })} aria-label="Departamento">
            <option value="">Todos los departamentos</option>{meta.dptos.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 220 }} value={f.or} onChange={(e) => setF({ ...f, or: e.target.value })} aria-label="Operador de red">
            <option value="">Todos los operadores</option>{meta.ors.map((d) => <option key={d}>{d}</option>)}
          </select>
          <select className="select" style={{ maxWidth: 200 }} value={f.minPop} onChange={(e) => setF({ ...f, minPop: e.target.value })} aria-label="Población mínima">
            <option value="">Cualquier población</option><option value="10000">Más de 10.000 hab.</option><option value="50000">Más de 50.000 hab.</option><option value="200000">Más de 200.000 hab.</option>
          </select>
          {data && <button className="btn sm" onClick={csv}>Descargar CSV</button>}
        </div>
      )}
      {!data ? <Spinner /> : (
        <>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>#</th><th>Municipio</th><th className="hs">Operador</th>
                {cols.map((k, i) => <th key={k} className={`num ${i > 2 ? 'hs' : ''}`}>{METRICS[k].short}</th>)}
                <th className="num">Puntaje</th>
              </tr></thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.code} className="click" onClick={() => go('m', r.code)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && go('m', r.code)}>
                    <td className="mono muted">{r.rank}</td>
                    <td><span className="name">{r.name}</span><br /><span className="small muted">{r.dpto} · {fmt(r.pop)} hab.</span></td>
                    <td className="small hs">{r.or}</td>
                    {cols.map((k, i) => <td key={k} className={`num ${i > 2 ? 'hs' : ''}`}>{METRICS[k].f(METRICS[k].get(r))}</td>)}
                    <td className="num"><ScoreBadge score={r.score} tier={r.tier} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.locked && <LockedRows cols={6} n={10} text={`Hay ${fmt(data.total - 1)} municipios más en el ranking. Actívalo para verlos, filtrarlos y descargarlos.`} />}
          </div>
          {paid && data.total > data.rows.length && <button className="btn" onClick={() => setLimit(limit + 200)}>Mostrar más ({fmt(data.total - data.rows.length)} restantes)</button>}
          <p className="small muted">Tarifa: valor facturado por kWh a usuarios residenciales estratos 4 a 6 del mercado regulado (SUI, {meta.cortes.sui}); comercial, igual para usuarios comerciales. Vivienda: licencias DANE ELIC (corte {meta.cortes.elic}). Cortes: demanda no atendida de la subárea eléctrica en 12 meses (XM, {meta.cortes.dna}) por cada 1.000 habitantes. Turismo: habitaciones y viviendas turísticas del RNT por tamaño del municipio. AGPE est.: autogeneradores de XM ({meta.cortes.agpe_xm}) repartidos por municipio dentro de su mercado. Instaladores: empresas con CIIU de instalación o contratos solares en SECOP ubicadas en el municipio. Radiación NASA POWER.</p>
        </>
      )}
    </div>
  );
}
