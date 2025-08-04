// src/pages/Ventas.jsx
import React, { useState } from 'react';
import { ventasService } from '../services/api';

const Ventas = () => {
  const [codigo, setCodigo] = useState('');
  const [caja, setCaja] = useState(null);
  const [form, setForm] = useState({ nombre: '', telefono: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const buscarCaja = async () => {
    setError('');
    setCaja(null);
    setSuccess('');
    try {
      const data = await ventasService.buscarCaja(codigo);
      if (!data.data) {
        throw new Error(data.message || 'Caja no encontrada');
      }
      setCaja(data.data);
    } catch (err) {
      setError(err.message || 'No se encontró la caja');
    }
  };

  const handleVenta = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await ventasService.registrar({
        caja_id: caja.id,
        nombre_benefactor: form.nombre,
        telefono_benefactor: form.telefono,
      });
      setSuccess('Venta registrada con éxito');
      setCaja(null);
      setCodigo('');
      setForm({ nombre: '', telefono: '' });
    } catch (err) {
      setError(err.message || 'Error al registrar venta');
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-semibold mb-4">Registro de Venta</h2>

      <div className="mb-6">
        <label className="block mb-1">Código de Caja</label>
        <div className="flex gap-2">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="flex-1 px-3 py-2 border rounded"
            placeholder="Ej: ZN1001"
          />
          <button
            onClick={buscarCaja}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Buscar
          </button>
        </div>
      </div>

      {error && <p className="mb-4 text-red-500">{error}</p>}
      {success && <p className="mb-4 text-green-600">{success}</p>}

      {caja && (
        <form onSubmit={handleVenta} className="space-y-4">
          <div>
            <p>
              <strong>Caja:</strong> {caja.codigo}
            </p>
            <p>
              <strong>Zona:</strong> {caja.zona_nombre}
            </p>
          </div>

          <div>
            <label className="block mb-1">Nombre del Benefactor</label>
            <input
              name="nombre"
              value={form.nombre}
              onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>

          <div>
            <label className="block mb-1">Teléfono</label>
            <input
              name="telefono"
              value={form.telefono}
              onChange={(e) => setForm((prev) => ({ ...prev, telefono: e.target.value }))}
              className="w-full px-3 py-2 border rounded"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Confirmar Venta
          </button>
        </form>
      )}
    </div>
  );
};

export default Ventas;
