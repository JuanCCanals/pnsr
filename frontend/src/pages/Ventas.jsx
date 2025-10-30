// /frontend/src/pages/Ventas.jsx
import React, { useEffect, useState, useMemo } from 'react';

const authFetch = async (url, opts={}) => {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {})
    }
  });
  return res.json();
};

export default function Ventas() {
  const [show, setShow] = useState(true);
  const [recibo, setRecibo] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0,10));
  const [puntoVenta, setPuntoVenta] = useState('');
  const [formaPago, setFormaPago] = useState('Efectivo');
  const [estado, setEstado] = useState('Entregada a Benefactor');
  const [monto, setMonto] = useState('40.00');

  const [codigo, setCodigo] = useState('');
  const [items, setItems] = useState([]); // {codigo, ok, error, detalle?}

  const [bf, setBf] = useState({ nombres: '', apellidos: '', telefono: '', correo: '' });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const total = useMemo(() => Number(monto || 0), [monto]);

  const [modalidades, setModalidades] = useState([]);      // [{id,nombre,costo}]
  const [puntos, setPuntos] = useState([]);                // [{id,nombre}]
  const [modalidadId, setModalidadId] = useState(null);
  const [puntoVentaId, setPuntoVentaId] = useState(null);

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem('token');
      const [mRes, pRes] = await Promise.all([
        fetch('/api/catalogos/modalidades', { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.json()),
        fetch('/api/catalogos/puntos-venta', { headers: { Authorization: `Bearer ${token}` } }).then(r=>r.json())
      ]);
      if (mRes?.success) {
        setModalidades(mRes.data || []);
        if (mRes.data?.length) {
          setModalidadId(mRes.data[0].id);
          setMonto(String(Number(mRes.data[0].costo || 0).toFixed(2))); // ← setea monto
        }
      }
      if (pRes?.success) {
        setPuntos(pRes.data || []);
        if (pRes.data?.length) setPuntoVentaId(pRes.data[0].id);
      }
    })();
  }, []);

  // cuando cambia modalidad, actualizar monto
  useEffect(() => {
    const mod = modalidades.find(m => m.id === modalidadId);
    if (mod) setMonto(String(Number(mod.costo || 0).toFixed(2)));
  }, [modalidadId, modalidades]);

  const addCodigo = async () => {
    const cod = (codigo || '').trim();
    if (!cod) return;
    setCodigo('');
    // valida contra API
    const resp = await authFetch(`/api/ventas/box/${encodeURIComponent(cod)}`);
    if (resp?.success) {
      setItems(prev => [...prev, { codigo: cod, ok: true }]);
    } else {
      setItems(prev => [...prev, { codigo: cod, ok: false, error: resp?.error || 'No válida' }]);
    }
  };

  const removeItem = (idx) => setItems(prev => prev.filter((_,i) => i!==idx));

  const handleGrabar = async () => {
    setMsg({ type:'', text:'' });
    if (!recibo.trim()) return setMsg({ type:'error', text:'Coloca el No. de recibo' });
    const codigos = items.filter(i => i.ok).map(i => i.codigo);
    if (codigos.length === 0) return setMsg({ type:'error', text:'Agrega al menos una caja válida' });
    if (!bf.nombres.trim()) return setMsg({ type:'error', text:'Ingresa el nombre del benefactor' });

    const payload = {
      recibo: recibo.trim(),
      fecha,
      modalidad_id: modalidadId,
      punto_venta_id: puntoVentaId,
      forma_pago: formaPago || null,
      estado,
      monto: Number(monto || 0),
      moneda: 'PEN',
      benefactor: bf,
      codigos
    };

    const resp = await authFetch('/api/ventas', { method:'POST', body: JSON.stringify(payload) });
    if (resp?.success) {
      setMsg({ type:'success', text:'Registro guardado' });
      setItems([]);
      setRecibo(''); setBf({nombres:'',apellidos:'',telefono:'',correo:''});
    } else {
      setMsg({ type:'error', text: resp?.error || 'No se pudo guardar' });
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-[980px] rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-bold mb-4">Registro de Benefactor / Asignación de Cajas</h2>

        {msg.text && (
          <div className={`mb-3 px-3 py-2 rounded ${msg.type==='success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {msg.text}
          </div>
        )}

        {/* Cabecera */}
        <div className="grid grid-cols-2 gap-6">
          <div className="grid grid-cols-3 gap-3 items-end">
            <label className="col-span-1 text-sm">No. Recibo</label>
            <input className="col-span-2 border rounded px-2 py-1" value={recibo} onChange={e=>setRecibo(e.target.value)} />

            {/* Modalidad */}
            <label className="col-span-1 text-sm">Modalidad</label>
            <select className="col-span-2 border rounded px-2 py-1" value={modalidadId || ''} onChange={e=>setModalidadId(Number(e.target.value))}>
              {modalidades.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>

            <label className="col-span-1 text-sm">Monto</label>
            <input className="col-span-2 border rounded px-2 py-1 bg-gray-100" value={monto} readOnly />

            {/* Punto de Venta */}
            <label className="col-span-1 text-sm">Pto. Venta</label>
            <select className="col-span-2 border rounded px-2 py-1" value={puntoVentaId || ''} onChange={e=>setPuntoVentaId(Number(e.target.value))}>
              {puntos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>

            <label className="col-span-1 text-sm">Forma pago</label>
            <select className="col-span-2 border rounded px-2 py-1" value={formaPago} onChange={e=>setFormaPago(e.target.value)}>
              <option>Efectivo</option><option>Yape</option><option>Plin</option><option>Transferencia</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3 items-end">
            <label className="col-span-1 text-sm">Fecha</label>
            <input type="date" className="col-span-2 border rounded px-2 py-1" value={fecha} onChange={e=>setFecha(e.target.value)} />

            <label className="col-span-1 text-sm">Alfanumérico</label>
            <div className="col-span-2 flex gap-2">
              <input className="flex-1 border rounded px-2 py-1" value={codigo} onChange={e=>setCodigo(e.target.value)} />
              <button onClick={addCodigo} className="px-3 py-1 rounded bg-blue-600 text-white">Agregar</button>
            </div>

            <label className="col-span-1 text-sm">Estado</label>
            <select className="col-span-2 border rounded px-2 py-1" value={estado} onChange={e=>setEstado(e.target.value)}>
              <option>Entregada a Benefactor</option>
              <option>Reservada</option>
            </select>
          </div>
        </div>

        {/* Benefactor */}
        <div className="mt-5">
          <h3 className="font-semibold mb-2">Benefactor</h3>
          <div className="grid grid-cols-2 gap-6">
            <div className="grid grid-cols-3 gap-3 items-end">
              <label className="text-sm">Nombre</label>
              <input className="col-span-2 border rounded px-2 py-1" value={bf.nombres} onChange={e=>setBf({...bf, nombres:e.target.value})} />
              <label className="text-sm">Apellido</label>
              <input className="col-span-2 border rounded px-2 py-1" value={bf.apellidos} onChange={e=>setBf({...bf, apellidos:e.target.value})} />
            </div>
            <div className="grid grid-cols-3 gap-3 items-end">
              <label className="text-sm">Teléfono</label>
              <input className="col-span-2 border rounded px-2 py-1" value={bf.telefono} onChange={e=>setBf({...bf, telefono:e.target.value})} />
              <label className="text-sm">Correo</label>
              <input className="col-span-2 border rounded px-2 py-1" value={bf.correo} onChange={e=>setBf({...bf, correo:e.target.value})} />
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="mt-6">
          <table className="w-full border border-gray-300 text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1 text-left">Alfanumérico</th>
                <th className="border px-2 py-1 text-left">Estado</th>
                <th className="border px-2 py-1 text-left">Acción</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, idx) => (
                <tr key={idx}>
                  <td className="border px-2 py-1">{it.codigo}</td>
                  <td className={`border px-2 py-1 ${it.ok ? 'text-green-700' : 'text-red-700'}`}>{it.ok ? 'OK' : it.error || 'Error'}</td>
                  <td className="border px-2 py-1">
                    <button onClick={()=>removeItem(idx)} className="px-2 py-1 bg-black text-white rounded">Eliminar</button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td className="border px-2 py-2 text-center text-gray-500" colSpan="3">Sin cajas añadidas</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-between">
          <div className="text-sm font-semibold">Total: S/ {total.toFixed(2)}</div>
          <div className="space-x-2">
            <button className="px-3 py-2 rounded bg-gray-200" onClick={()=>setShow(false)}>Salir</button>
            <button className="px-3 py-2 rounded bg-green-600 text-white" onClick={handleGrabar}>Grabar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
