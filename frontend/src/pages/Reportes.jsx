// frontend/src/pages/Reportes.jsx
import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` });
const get = async (url) => { const r = await fetch(`${API}${url}`, { headers: hdr() }); return r.json(); };
const toYMD = (v) => { if (!v) return ''; const d = new Date(v); if (isNaN(d)) return ''; return d.toISOString().slice(0, 10); };
const fmtDate = (v) => { const s = toYMD(v); if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const fmtMoney = (v) => `S/ ${Number(v || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;

const exportXlsx = (rows, name) => {
  if (!rows?.length) return;
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, `${name}_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

// ════════════════════════ Shared UI ════════════════════════
const Card = ({ label, value, sub, color = 'blue' }) => {
  const c = { blue:'bg-blue-50 border-blue-200 text-blue-800', green:'bg-green-50 border-green-200 text-green-800',
    yellow:'bg-yellow-50 border-yellow-200 text-yellow-800', purple:'bg-purple-50 border-purple-200 text-purple-800',
    gray:'bg-gray-50 border-gray-200 text-gray-800' };
  return (
    <div className={`rounded-lg border p-4 ${c[color] || c.blue}`}>
      <div className="text-xs font-medium uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {sub && <div className="text-sm mt-1 opacity-80">{sub}</div>}
    </div>
  );
};

const ExportBtn = ({ onClick, disabled }) => (
  <button onClick={onClick} disabled={disabled}
    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 text-sm flex items-center gap-1">
    📥 Exportar Excel
  </button>
);

const SubTabs = ({ tabs, active, onChange }) => (
  <div className="flex gap-1 mb-4 border-b border-gray-200 dark:border-gray-700">
    {tabs.map(t => (
      <button key={t.id} onClick={() => onChange(t.id)}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          active === t.id ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
        {t.label}
      </button>
    ))}
  </div>
);

// ═══════════════════ 1. SEGUIMIENTO DE CAJAS ═══════════════════
const SeguimientoCajas = () => {
  const [rows, setRows] = useState([]);
  const [zonas, setZonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fCodigo, setFCodigo] = useState('');
  const [fZona, setFZona] = useState('');
  const [fEstado, setFEstado] = useState('');

  const ESTADOS = [
    { value: 'disponible', label: 'Disponible' }, { value: 'asignada', label: 'Asignada' },
    { value: 'entregada', label: 'Entregada a Benefactor' }, { value: 'devuelta', label: 'Devuelta por Benefactor' },
    { value: 'entregada_familia', label: 'Entregada a Familia' },
  ];

  const fetchData = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (fCodigo) p.set('codigo', fCodigo);
    if (fZona) p.set('zona_id', fZona);
    if (fEstado) p.set('estado', fEstado);
    const r = await get(`/reportes/seguimiento-cajas?${p}`);
    if (r.success) { setRows(r.data); if (r.zonas) setZonas(r.zonas); }
    setLoading(false);
  }, [fCodigo, fZona, fEstado]);

  useEffect(() => { fetchData(); }, []);

  const handleExport = () => exportXlsx(rows.map(r => ({
    'Código Caja': r.codigo_caja, 'Familia': r.familia || '', 'Estado': r.estado_texto,
    'Zona': r.zona || '', 'Fecha Devolución': fmtDate(r.fecha_devolucion),
    'Benefactor': r.benefactor_nombre || '', 'Teléfono': r.benefactor_telefono || '', 'Email': r.benefactor_email || '',
  })), 'Seguimiento_Cajas');

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Código caja/familia</label>
          <input value={fCodigo} onChange={e => setFCodigo(e.target.value)} placeholder="Ej: AQP001"
            className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white w-40" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Zona</label>
          <select value={fZona} onChange={e => setFZona(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white">
            <option value="">Todas</option>
            {zonas.map(z => <option key={z.id} value={z.id}>{z.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Estado</label>
          <select value={fEstado} onChange={e => setFEstado(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white">
            <option value="">Todos</option>
            {ESTADOS.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
        <button onClick={fetchData} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">Filtrar</button>
        <button onClick={() => { setFCodigo(''); setFZona(''); setFEstado(''); setTimeout(fetchData, 50); }}
          className="px-4 py-2 border rounded-lg text-sm">Limpiar</button>
        <div className="flex-1" />
        <ExportBtn onClick={handleExport} disabled={!rows.length} />
      </div>
      <div className="text-xs text-gray-500 mb-2">{rows.length} registro(s)</div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>
              {['Código Caja','Familia','Estado','Zona','Fec. Devolución','Benefactor','Teléfono','Email'].map(h =>
                <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-600">
            {loading && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">Cargando…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">Sin datos</td></tr>}
            {!loading && rows.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-3 py-2 font-medium dark:text-white">{r.codigo_caja}</td>
                <td className="px-3 py-2 dark:text-white">{r.familia || '—'}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${
                  r.estado==='entregada'?'bg-orange-100 text-orange-800':
                  r.estado==='devuelta'?'bg-green-100 text-green-800':
                  r.estado==='entregada_familia'?'bg-blue-100 text-blue-800':
                  r.estado==='asignada'?'bg-yellow-100 text-yellow-800':'bg-gray-100 text-gray-700'}`}>{r.estado_texto}</span></td>
                <td className="px-3 py-2 dark:text-white">{r.zona || '—'}</td>
                <td className="px-3 py-2 dark:text-white">{fmtDate(r.fecha_devolucion)}</td>
                <td className="px-3 py-2 dark:text-white">{r.benefactor_nombre || '—'}</td>
                <td className="px-3 py-2 dark:text-white">{r.benefactor_telefono || '—'}</td>
                <td className="px-3 py-2 dark:text-white">{r.benefactor_email || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═══════════════════ 2. BENEFICIADOS ═══════════════════
const Beneficiados = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('familias');

  useEffect(() => { (async () => { setLoading(true); const r = await get('/reportes/beneficiados'); if (r.success) setData(r.data); setLoading(false); })(); }, []);

  if (loading) return <div className="py-8 text-center text-gray-500">Cargando…</div>;
  if (!data) return <div className="py-8 text-center text-red-500">Error al cargar</div>;

  const { cards, ninos, ninas, familias_rows, ninos_detalle } = data;

  const RangoTable = ({ title, rows }) => (
    <div className="mb-4">
      <h4 className="text-sm font-semibold mb-2 dark:text-gray-300">{title}</h4>
      <table className="w-full text-sm border rounded">
        <thead className="bg-gray-50 dark:bg-gray-700">
          <tr>{['Rango','Total','Asignados','Disponibles'].map(h => <th key={h} className="px-3 py-2 text-right first:text-left dark:text-gray-300">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y dark:divide-gray-600">
          {rows.map((r, i) => <tr key={i}><td className="px-3 py-2 dark:text-white">{r.rango}</td><td className="px-3 py-2 text-right font-medium dark:text-white">{r.total}</td><td className="px-3 py-2 text-right text-green-700">{r.asignados}</td><td className="px-3 py-2 text-right text-orange-700">{r.disponibles}</td></tr>)}
          <tr className="bg-gray-50 dark:bg-gray-700 font-semibold"><td className="px-3 py-2 dark:text-white">TOTAL</td><td className="px-3 py-2 text-right dark:text-white">{rows.reduce((s,r)=>s+r.total,0)}</td><td className="px-3 py-2 text-right text-green-700">{rows.reduce((s,r)=>s+r.asignados,0)}</td><td className="px-3 py-2 text-right text-orange-700">{rows.reduce((s,r)=>s+r.disponibles,0)}</td></tr>
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <Card label="Familias 5+ miembros" value={cards.cinco_o_mas.total} sub={`${cards.cinco_o_mas.asignadas} asignadas`} color="blue" />
        <Card label="Familias menos de 5" value={cards.menos_de_cinco.total} sub={`${cards.menos_de_cinco.asignadas} asignadas`} color="purple" />
        <Card label="Sin dependientes (1m–13a)" value={cards.sin_dependientes_1m_13a} sub="No tienen niños en rango" color="yellow" />
      </div>

      <SubTabs tabs={[{id:'familias',label:'Tabla Familias'},{id:'ninos',label:'Niños/Niñas por Rango'},{id:'detalle',label:'Detalle Niños'}]}
        active={subTab} onChange={setSubTab} />

      {subTab === 'familias' && (
        <>
          <div className="flex justify-end mb-2"><ExportBtn onClick={() => exportXlsx(familias_rows, 'Beneficiados_Familias')} disabled={!familias_rows.length} /></div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>{['Código','Titular','Zona','Integrantes','Grupo','Asignada'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-600">
                {familias_rows.map((r, i) => <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-3 py-2 font-medium dark:text-white">{r.codigo}</td>
                  <td className="px-3 py-2 dark:text-white">{r.titular}</td>
                  <td className="px-3 py-2 dark:text-white">{r.zona}</td>
                  <td className="px-3 py-2 text-center dark:text-white">{r.integrantes}</td>
                  <td className="px-3 py-2 dark:text-white">{r.grupo}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${r.asignada==='Sí'?'bg-green-100 text-green-800':'bg-gray-100 text-gray-700'}`}>{r.asignada}</span></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-gray-500 mt-2">{familias_rows.length} familia(s)</div>
        </>
      )}

      {subTab === 'ninos' && (
        <>
          <div className="flex justify-end mb-2"><ExportBtn onClick={() => {
            const all = [...ninos.map(r => ({ ...r, sexo: 'Masculino' })), ...ninas.map(r => ({ ...r, sexo: 'Femenino' }))];
            exportXlsx(all, 'Beneficiados_Rangos');
          }} disabled={false} /></div>
          <RangoTable title="Niños (M)" rows={ninos} />
          <RangoTable title="Niñas (F)" rows={ninas} />
        </>
      )}

      {subTab === 'detalle' && (
        <>
          <div className="flex justify-end mb-2"><ExportBtn onClick={() => exportXlsx(ninos_detalle, 'Beneficiados_Detalle_Ninos')} disabled={!ninos_detalle.length} /></div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>{['Nombre','Sexo','Edad','Rango','Familia','Zona','Estado'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-600">
                {ninos_detalle.map((r, i) => <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  <td className="px-3 py-2 dark:text-white">{r.nombre}</td>
                  <td className="px-3 py-2 dark:text-white">{r.sexo}</td>
                  <td className="px-3 py-2 dark:text-white">{r.edad}</td>
                  <td className="px-3 py-2 dark:text-white">{r.rango}</td>
                  <td className="px-3 py-2 dark:text-white">{r.familia}</td>
                  <td className="px-3 py-2 dark:text-white">{r.zona}</td>
                  <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${r.estado==='Asignado'?'bg-green-100 text-green-800':'bg-orange-100 text-orange-800'}`}>{r.estado}</span></td>
                </tr>)}
                {!ninos_detalle.length && <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">Sin datos</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-gray-500 mt-2">{ninos_detalle.length} niño(s)</div>
        </>
      )}
    </div>
  );
};

// ═══════════════════ 3. REPORTE GENERAL ═══════════════════
const ReporteGeneral = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { (async () => { setLoading(true); const r = await get('/reportes/general'); if (r.success) setData(r.data); setLoading(false); })(); }, []);

  if (loading) return <div className="py-8 text-center text-gray-500">Cargando…</div>;
  if (!data) return <div className="py-8 text-center text-red-500">Error</div>;

  const { cards: c, familias } = data;

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        <Card label="Familias beneficiadas" value={c.total_familias} sub={`${c.total_personas} personas`} color="blue" />
        <Card label="Familias asignadas" value={c.familias_asignadas} sub={`de ${c.total_familias}`} color="green" />
        <Card label="Cajas vendidas" value={c.cajas_vendidas} sub={`${c.pct_vendidas}% de ${c.total_cajas}`} color="purple" />
        <Card label="Cajas devueltas" value={c.cajas_devueltas} sub={`${c.pct_devueltas}% de vendidas`} color="yellow" />
        <Card label="Dinero ingresado" value={fmtMoney(c.dinero_ingresado)} color="green" />
      </div>

      {/* Barras */}
      <div className="mb-6 space-y-3">
        {[{label:'Avance ventas',pct:c.pct_vendidas,clr:'bg-purple-600'},{label:'Devoluciones',pct:c.pct_devueltas,clr:'bg-yellow-500'}].map(b => (
          <div key={b.label}>
            <div className="flex justify-between text-sm mb-1"><span className="text-gray-600 dark:text-gray-400">{b.label}</span><span className="font-medium dark:text-white">{b.pct}%</span></div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3"><div className={`${b.clr} h-3 rounded-full`} style={{width:`${Math.min(b.pct,100)}%`}} /></div>
          </div>
        ))}
      </div>

      {/* Tabla familias */}
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold dark:text-white">Detalle por familia</h3>
        <ExportBtn onClick={() => exportXlsx(familias.map(r => ({
          Código: r.codigo, Titular: r.titular, Zona: r.zona, Integrantes: r.integrantes,
          'Estado Caja': r.estado_texto, Benefactor: r.benefactor || '',
        })), 'Reporte_General_Familias')} disabled={!familias.length} />
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>{['Código','Titular','Zona','Integrantes','Estado Caja','Benefactor'].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-600">
            {familias.map((r, i) => <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700">
              <td className="px-3 py-2 font-medium dark:text-white">{r.codigo}</td>
              <td className="px-3 py-2 dark:text-white">{r.titular || '—'}</td>
              <td className="px-3 py-2 dark:text-white">{r.zona || '—'}</td>
              <td className="px-3 py-2 text-center dark:text-white">{r.integrantes}</td>
              <td className="px-3 py-2 dark:text-white">{r.estado_texto}</td>
              <td className="px-3 py-2 dark:text-white">{r.benefactor || '—'}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-gray-500 mt-2">{familias.length} familia(s)</div>
    </div>
  );
};

// ═══════════════════ 4. SERVICIOS PARROQUIALES ═══════════════════
const ServiciosReporte = () => {
  const [rows, setRows] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fTipo, setFTipo] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (fTipo) p.set('tipo_servicio_id', fTipo);
    if (fEstado) p.set('estado', fEstado);
    if (fDesde) p.set('desde', fDesde);
    if (fHasta) p.set('hasta', fHasta);
    const r = await get(`/reportes/servicios?${p}`);
    if (r.success) { setRows(r.data); if (r.tipos) setTipos(r.tipos); }
    setLoading(false);
  }, [fTipo, fEstado, fDesde, fHasta]);

  useEffect(() => { fetchData(); }, []);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div><label className="block text-xs text-gray-500 mb-1">Tipo servicio</label>
          <select value={fTipo} onChange={e => setFTipo(e.target.value)} className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white">
            <option value="">Todos</option>{tipos.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
          </select>
        </div>
        <div><label className="block text-xs text-gray-500 mb-1">Estado</label>
          <select value={fEstado} onChange={e => setFEstado(e.target.value)} className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white">
            <option value="">Todos</option><option value="programado">Programado</option><option value="realizado">Realizado</option><option value="cancelado">Cancelado</option>
          </select>
        </div>
        <div><label className="block text-xs text-gray-500 mb-1">Desde</label><input type="date" value={fDesde} onChange={e => setFDesde(e.target.value)} className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white" /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Hasta</label><input type="date" value={fHasta} onChange={e => setFHasta(e.target.value)} className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white" /></div>
        <button onClick={fetchData} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Filtrar</button>
        <button onClick={() => { setFTipo(''); setFEstado(''); setFDesde(''); setFHasta(''); setTimeout(fetchData, 50); }} className="px-4 py-2 border rounded-lg text-sm">Limpiar</button>
        <div className="flex-1" />
        <ExportBtn onClick={() => exportXlsx(rows.map(r => ({
          ID: r.id, 'Tipo Servicio': r.tipo_servicio || '', Fecha: fmtDate(r.fecha_servicio), Hora: r.hora_servicio || '',
          Descripción: r.descripcion || '', Precio: r.precio, Estado: r.estado,
          Cliente: r.cliente_nombre || '', Teléfono: r.cliente_telefono || '', Observaciones: r.observaciones || '',
        })), 'Servicios_Parroquiales')} disabled={!rows.length} />
      </div>
      <div className="text-xs text-gray-500 mb-2">{rows.length} servicio(s) | Total: {fmtMoney(rows.reduce((s, r) => s + Number(r.precio || 0), 0))}</div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>{['#','Tipo Servicio','Fecha','Hora','Descripción','Precio','Estado','Cliente','Teléfono','Observaciones'].map(h =>
              <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-600">
            {loading && <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-500">Cargando…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-500">Sin datos</td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-3 py-2 dark:text-white">{r.id}</td>
                <td className="px-3 py-2 dark:text-white">{r.tipo_servicio || '—'}</td>
                <td className="px-3 py-2 dark:text-white whitespace-nowrap">{fmtDate(r.fecha_servicio)}</td>
                <td className="px-3 py-2 dark:text-white">{r.hora_servicio || '—'}</td>
                <td className="px-3 py-2 dark:text-white max-w-xs truncate">{r.descripcion || '—'}</td>
                <td className="px-3 py-2 dark:text-white whitespace-nowrap">{fmtMoney(r.precio)}</td>
                <td className="px-3 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${
                  r.estado==='realizado'?'bg-green-100 text-green-800':r.estado==='cancelado'?'bg-red-100 text-red-800':'bg-yellow-100 text-yellow-800'}`}>{r.estado}</span></td>
                <td className="px-3 py-2 dark:text-white">{r.cliente_nombre || '—'}</td>
                <td className="px-3 py-2 dark:text-white">{r.cliente_telefono || '—'}</td>
                <td className="px-3 py-2 dark:text-white max-w-xs truncate">{r.observaciones || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═══════════════════ 5. COBROS / INGRESOS ═══════════════════
const CobrosReporte = () => {
  const [rows, setRows] = useState([]);
  const [metodos, setMetodos] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fDesde, setFDesde] = useState('');
  const [fHasta, setFHasta] = useState('');
  const [fMetodo, setFMetodo] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (fDesde) p.set('desde', fDesde);
    if (fHasta) p.set('hasta', fHasta);
    if (fMetodo) p.set('metodo_pago_id', fMetodo);
    const r = await get(`/reportes/cobros?${p}`);
    if (r.success) { setRows(r.data); setTotal(r.total || 0); if (r.metodos) setMetodos(r.metodos); }
    setLoading(false);
  }, [fDesde, fHasta, fMetodo]);

  useEffect(() => { fetchData(); }, []);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div><label className="block text-xs text-gray-500 mb-1">Desde</label><input type="date" value={fDesde} onChange={e => setFDesde(e.target.value)} className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white" /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Hasta</label><input type="date" value={fHasta} onChange={e => setFHasta(e.target.value)} className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white" /></div>
        <div><label className="block text-xs text-gray-500 mb-1">Método pago</label>
          <select value={fMetodo} onChange={e => setFMetodo(e.target.value)} className="px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:text-white">
            <option value="">Todos</option>{metodos.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
          </select>
        </div>
        <button onClick={fetchData} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Filtrar</button>
        <button onClick={() => { setFDesde(''); setFHasta(''); setFMetodo(''); setTimeout(fetchData, 50); }} className="px-4 py-2 border rounded-lg text-sm">Limpiar</button>
        <div className="flex-1" />
        <ExportBtn onClick={() => exportXlsx(rows.map(r => ({
          ID: r.id, Concepto: r.concepto || r.servicio_nombre_temp || '', Monto: r.monto,
          'Fecha Cobro': fmtDate(r.fecha_cobro), 'Nro. Comprobante': r.numero_comprobante || '',
          'Método Pago': r.metodo_pago || '', 'Tipo Servicio': r.tipo_servicio || '',
          'Fecha Servicio': fmtDate(r.fecha_servicio), 'Hora Servicio': r.hora_servicio || '',
          'Desc. Servicio': r.descripcion_servicio || '', Cliente: r.cliente_nombre || '',
          Teléfono: r.cliente_telefono || '', Observaciones: r.observaciones || '',
        })), 'Ingresos_Cobros')} disabled={!rows.length} />
      </div>
      <div className="text-xs text-gray-500 mb-2">{rows.length} cobro(s) | Total: <span className="font-semibold text-green-700">{fmtMoney(total)}</span></div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700">
            <tr>{['#','Concepto','Monto','Fecha','Comprobante','Método Pago','Tipo Servicio','Fec. Servicio','Hora','Cliente','Teléfono','Observaciones'].map(h =>
              <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-600">
            {loading && <tr><td colSpan={12} className="px-3 py-6 text-center text-gray-500">Cargando…</td></tr>}
            {!loading && !rows.length && <tr><td colSpan={12} className="px-3 py-6 text-center text-gray-500">Sin datos</td></tr>}
            {!loading && rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                <td className="px-3 py-2 dark:text-white">{r.id}</td>
                <td className="px-3 py-2 dark:text-white">{r.concepto || r.servicio_nombre_temp || '—'}</td>
                <td className="px-3 py-2 dark:text-white font-medium whitespace-nowrap">{fmtMoney(r.monto)}</td>
                <td className="px-3 py-2 dark:text-white whitespace-nowrap">{fmtDate(r.fecha_cobro)}</td>
                <td className="px-3 py-2 dark:text-white">{r.numero_comprobante || '—'}</td>
                <td className="px-3 py-2 dark:text-white">{r.metodo_pago || '—'}</td>
                <td className="px-3 py-2 dark:text-white">{r.tipo_servicio || '—'}</td>
                <td className="px-3 py-2 dark:text-white whitespace-nowrap">{fmtDate(r.fecha_servicio)}</td>
                <td className="px-3 py-2 dark:text-white">{r.hora_servicio || '—'}</td>
                <td className="px-3 py-2 dark:text-white">{r.cliente_nombre || '—'}</td>
                <td className="px-3 py-2 dark:text-white">{r.cliente_telefono || '—'}</td>
                <td className="px-3 py-2 dark:text-white max-w-xs truncate">{r.observaciones || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ═══════════════════ MAIN COMPONENT ═══════════════════
export default function Reportes() {
  const [mainTab, setMainTab] = useState('cajas');
  const [cajasTab, setCajasTab] = useState('seguimiento');
  const [serviciosTab, setServiciosTab] = useState('servicios');

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reportes</h1>
        <p className="text-gray-600 dark:text-gray-400">Reportes y estadísticas del sistema.</p>
      </div>

      {/* Main tabs */}
      <div className="flex border-b border-gray-300 dark:border-gray-600 mb-5">
        {[{ id: 'cajas', label: '📦 Cajas del Amor' }, { id: 'servicios', label: '⛪ Servicios Parroquiales' }].map(t => (
          <button key={t.id} onClick={() => setMainTab(t.id)}
            className={`px-6 py-3 text-sm font-semibold border-b-3 transition-colors ${
              mainTab === t.id ? 'border-b-2 border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ CAJAS DEL AMOR ═══ */}
      {mainTab === 'cajas' && (
        <div>
          <SubTabs
            tabs={[{ id: 'seguimiento', label: 'Seguimiento de Cajas' }, { id: 'beneficiados', label: 'Info. Beneficiados' }, { id: 'general', label: 'Reporte General' }]}
            active={cajasTab} onChange={setCajasTab} />
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
            {cajasTab === 'seguimiento' && <SeguimientoCajas />}
            {cajasTab === 'beneficiados' && <Beneficiados />}
            {cajasTab === 'general' && <ReporteGeneral />}
          </div>
        </div>
      )}

      {/* ═══ SERVICIOS PARROQUIALES ═══ */}
      {mainTab === 'servicios' && (
        <div>
          <SubTabs
            tabs={[{ id: 'servicios', label: 'Servicios Comprometidos' }, { id: 'cobros', label: 'Ingresos / Cobros' }]}
            active={serviciosTab} onChange={setServiciosTab} />
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-5">
            {serviciosTab === 'servicios' && <ServiciosReporte />}
            {serviciosTab === 'cobros' && <CobrosReporte />}
          </div>
        </div>
      )}
    </div>
  );
}
