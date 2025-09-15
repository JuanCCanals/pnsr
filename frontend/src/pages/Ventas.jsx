// src/pages/Ventas.js
// /src/pages/Ventas.jsx
import React, { useEffect, useState } from 'react';

/* ================== Helpers HTTP (fetch + JWT) ================== */
async function httpGet(url) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.json();
}

async function httpJSON(url, method, body) {
  const token = localStorage.getItem('token');
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  return res.json();
}

/* =============== Endpoints usados por esta vista =============== */
// Busca caja por código (ya existente en tu backend)
async function buscarCajaPorCodigo(codigo) {
  return httpGet(`/api/ventas/box/${encodeURIComponent(codigo)}`);
}

// Lista modalidades y puntos de venta (ya existen)
async function listarModalidades() {
  return httpGet('/api/modalidades');
}
async function listarPuntosVenta() {
  return httpGet('/api/puntos-venta');
}

// Registrar venta de caja (endpoint que agregamos en backend)
async function registrarVentaCaja({ caja_id, benefactor_id, modalidad_id, punto_venta_id, monto, moneda='PEN' }) {
  return httpJSON('/api/ventas', 'POST', {
    caja_id,
    benefactor_id: benefactor_id || null,
    modalidad_id,
    punto_venta_id,
    monto,
    moneda
  });
}

/* ========================== Componente ========================== */
export default function Ventas() {
  const [codigo, setCodigo] = useState('');
  const [caja, setCaja] = useState(null);
  const [modalidades, setModalidades] = useState([]);
  const [puntosVenta, setPuntosVenta] = useState([]);
  const [form, setForm] = useState({
    modalidad_id: '',
    punto_venta_id: '',
    monto: '',
    benefactor_id: '' // opcional
  });
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ type: '', text: '' });

  // Cargar combos al abrir
  useEffect(() => {
    (async () => {
      try {
        const [mods, pv] = await Promise.all([listarModalidades(), listarPuntosVenta()]);
        if (mods?.success) setModalidades(mods.data || []);
        if (pv?.success) setPuntosVenta(pv.data || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const handleBuscar = async () => {
    setMsg({ type: '', text: '' });
    setCaja(null);
    if (!codigo.trim()) {
      setMsg({ type: 'error', text: 'Ingresa el código de la caja.' });
      return;
    }
    try {
      setLoading(true);
      const resp = await buscarCajaPorCodigo(codigo.trim());
      if (!resp?.success) {
        setMsg({ type: 'error', text: resp?.error || 'No se encontró la caja.' });
        return;
      }
      setCaja(resp.data);
      // Pre-set benefactor si viene en la caja
      setForm(prev => ({
        ...prev,
        benefactor_id: resp.data?.benefactor_id || ''
      }));
    } catch (e) {
      console.error('Error buscando caja:', e);
      setMsg({ type: 'error', text: 'Error de conexión al buscar la caja.' });
    } finally {
      setLoading(false);
    }
  };

  const handleRegistrar = async () => {
    setMsg({ type: '', text: '' });
    if (!caja?.id) {
      setMsg({ type: 'error', text: 'Primero busca y selecciona una caja válida.' });
      return;
    }
    if (!form.modalidad_id || !form.punto_venta_id || !form.monto) {
      setMsg({ type: 'error', text: 'Completa modalidad, punto de venta y monto.' });
      return;
    }

    try {
      setLoading(true);
      const payload = {
        caja_id: Number(caja.id),
        benefactor_id: form.benefactor_id ? Number(form.benefactor_id) : null,
        modalidad_id: Number(form.modalidad_id),
        punto_venta_id: Number(form.punto_venta_id),
        monto: Number(form.monto),
        moneda: 'PEN'
      };
      const resp = await registrarVentaCaja(payload);
      if (resp?.success) {
        setMsg({ type: 'success', text: 'Venta registrada correctamente.' });
        // Limpia form y caja
        setForm({ modalidad_id: '', punto_venta_id: '', monto: '', benefactor_id: '' });
        setCaja(null);
        setCodigo('');
      } else {
        setMsg({ type: 'error', text: resp?.error || 'No se pudo registrar la venta.' });
      }
    } catch (e) {
      console.error('Error registrando venta:', e);
      setMsg({ type: 'error', text: 'Error de conexión al registrar la venta.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ventas de Cajas</h1>
        <p className="text-gray-600 dark:text-gray-400">Busca la caja por código, completa los datos y registra la venta.</p>
      </div>

      {/* Mensajes */}
      {msg.text && (
        <div className={`mb-4 p-4 rounded border ${msg.type === 'success'
          ? 'bg-green-100 border-green-300 text-green-800'
          : 'bg-red-100 border-red-300 text-red-800'}`}>
          {msg.text}
        </div>
      )}

      {/* Buscar caja */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Código de caja</label>
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ej: A001-023"
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>
          <button
            onClick={handleBuscar}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {/* Datos de la caja encontrada */}
        {caja && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded border bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
              <div className="text-xs text-gray-500">Código</div>
              <div className="font-semibold text-gray-900 dark:text-white">{caja.codigo}</div>
            </div>
            <div className="p-3 rounded border bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
              <div className="text-xs text-gray-500">Zona</div>
              <div className="font-semibold text-gray-900 dark:text-white">{caja.zona_nombre || '-'}</div>
            </div>
            <div className="p-3 rounded border bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
              <div className="text-xs text-gray-500">Estado</div>
              <div className="font-semibold text-gray-900 dark:text-white capitalize">{caja.estado || '-'}</div>
            </div>
            <div className="p-3 rounded border bg-gray-50 dark:bg-gray-700 dark:border-gray-600 col-span-1 md:col-span-3">
              <div className="text-xs text-gray-500">Familia / Benefactor</div>
              <div className="font-medium text-gray-900 dark:text-white">
                {caja.familia_nombre || caja.benefactor_nombre || '—'}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Form de registro */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Modalidad */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Modalidad *</label>
            <select
              value={form.modalidad_id}
              onChange={(e) => setForm(prev => ({ ...prev, modalidad_id: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="">Selecciona</option>
              {modalidades.map(m => (
                <option key={m.id || m.value} value={m.id || m.value}>
                  {m.nombre || m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Punto de venta */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Punto de Venta *</label>
            <select
              value={form.punto_venta_id}
              onChange={(e) => setForm(prev => ({ ...prev, punto_venta_id: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="">Selecciona</option>
              {puntosVenta.map(p => (
                <option key={p.id || p.value} value={p.id || p.value}>
                  {p.nombre || p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Monto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Monto (S/.) *</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.monto}
              onChange={(e) => setForm(prev => ({ ...prev, monto: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="0.00"
            />
          </div>

          {/* Benefactor ID (opcional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Benefactor ID (opcional)</label>
            <input
              type="number"
              min="1"
              value={form.benefactor_id}
              onChange={(e) => setForm(prev => ({ ...prev, benefactor_id: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="Si lo conoces, colócalo"
            />
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={handleRegistrar}
            disabled={loading || !caja}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Registrar venta'}
          </button>
        </div>
      </div>
    </div>
  );
}
