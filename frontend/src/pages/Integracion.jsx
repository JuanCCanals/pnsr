// frontend/src/pages/Integracion.jsx
/**
 * Página de integración entre Servicios Parroquiales y Venta de Cajas
 * Permite registrar servicios con venta de cajas en una sola operación
 * 
 * Fase 5: Integración Registrar Servicio con Venta de Cajas
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export default function Integracion() {
  const [activeTab, setActiveTab] = useState('nueva-venta');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Datos para selects
  const [tiposServicio, setTiposServicio] = useState([]);
  const [benefactores, setBenefactores] = useState([]);
  const [puntosVenta, setPuntosVenta] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [resumenIntegracion, setResumenIntegracion] = useState(null);

  // Formulario - Nueva venta con servicio
  const [formVenta, setFormVenta] = useState({
    tipo_servicio_id: '',
    fecha_servicio: new Date().toISOString().split('T')[0],
    descripcion_servicio: '',
    estado_servicio: 'realizado',
    benefactor_id: '',
    punto_venta_id: '',
    cajas_seleccionadas: [],
    monto_total: 0,
    forma_pago: 'efectivo',
    numero_comprobante: '',
    cobro_monto: 0,
    cobro_forma_pago: 'efectivo',
    cobro_referencia: ''
  });

  // Formulario - Donación con servicio
  const [formDonacion, setFormDonacion] = useState({
    tipo_servicio_id: '',
    fecha_servicio: new Date().toISOString().split('T')[0],
    estado_servicio: 'realizado',
    cajas_donadas: [],
    donante: '',
    observaciones: ''
  });

  // Listado de servicios con ventas
  const [serviciosConVentas, setServiciosConVentas] = useState([]);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [tiposRes, benefRes, pvRes, cajasRes, resumenRes, serviciosRes] = await Promise.all([
        axios.get(`${API_URL}/tipos-servicio`, { headers }).catch(() => ({ data: { data: [] } })),
        axios.get(`${API_URL}/benefactores`, { headers }).catch(() => ({ data: { data: [] } })),
        axios.get(`${API_URL}/puntos-venta`, { headers }).catch(() => ({ data: { data: [] } })),
        axios.get(`${API_URL}/cajas?estado=disponible`, { headers }).catch(() => ({ data: { data: [] } })),
        axios.get(`${API_URL}/integracion/resumen-integracion`, { headers }).catch(() => ({ data: { data: {} } })),
        axios.get(`${API_URL}/integracion/servicios-con-ventas`, { headers }).catch(() => ({ data: { data: [] } }))
      ]);

      setTiposServicio(tiposRes.data.data || []);
      setBenefactores(benefRes.data.data || []);
      setPuntosVenta(pvRes.data.data || []);
      setCajas(cajasRes.data.data || []);
      setResumenIntegracion(resumenRes.data.data || {});
      setServiciosConVentas(serviciosRes.data.data || []);
    } catch (err) {
      console.error('Error cargando datos:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAgregarCaja = (cajaId) => {
    const caja = cajas.find(c => c.id === parseInt(cajaId));
    if (caja && !formVenta.cajas_seleccionadas.find(c => c.id === caja.id)) {
      const nuevasCajas = [...formVenta.cajas_seleccionadas, caja];
      const nuevoMonto = nuevasCajas.reduce((sum, c) => sum + (c.monto || 0), 0);
      setFormVenta(prev => ({
        ...prev,
        cajas_seleccionadas: nuevasCajas,
        monto_total: nuevoMonto
      }));
    }
  };

  const handleQuitarCaja = (cajaId) => {
    const nuevasCajas = formVenta.cajas_seleccionadas.filter(c => c.id !== cajaId);
    const nuevoMonto = nuevasCajas.reduce((sum, c) => sum + (c.monto || 0), 0);
    setFormVenta(prev => ({
      ...prev,
      cajas_seleccionadas: nuevasCajas,
      monto_total: nuevoMonto
    }));
  };

  const handleAgregarCajaDonacion = (cajaId) => {
    const caja = cajas.find(c => c.id === parseInt(cajaId));
    if (caja && !formDonacion.cajas_donadas.find(c => c.id === caja.id)) {
      setFormDonacion(prev => ({
        ...prev,
        cajas_donadas: [...prev.cajas_donadas, caja]
      }));
    }
  };

  const handleQuitarCajaDonacion = (cajaId) => {
    setFormDonacion(prev => ({
      ...prev,
      cajas_donadas: prev.cajas_donadas.filter(c => c.id !== cajaId)
    }));
  };

  const handleSubmitVenta = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const payload = {
        servicio: {
          tipo_servicio_id: formVenta.tipo_servicio_id,
          fecha_servicio: formVenta.fecha_servicio,
          descripcion: formVenta.descripcion_servicio,
          estado: formVenta.estado_servicio
        },
        venta: {
          benefactor_id: formVenta.benefactor_id,
          punto_venta_id: formVenta.punto_venta_id,
          cajas: formVenta.cajas_seleccionadas.map(c => ({
            caja_id: c.id,
            monto: c.monto
          })),
          monto_total: formVenta.monto_total,
          forma_pago: formVenta.forma_pago,
          numero_comprobante: formVenta.numero_comprobante
        },
        cobro: {
          monto: formVenta.cobro_monto || formVenta.monto_total,
          forma_pago: formVenta.cobro_forma_pago,
          referencia: formVenta.cobro_referencia
        }
      };

      await axios.post(`${API_URL}/integracion/servicio-con-venta`, payload, { headers });

      setSuccess('Servicio y venta registrados exitosamente');
      setFormVenta({
        tipo_servicio_id: '',
        fecha_servicio: new Date().toISOString().split('T')[0],
        descripcion_servicio: '',
        estado_servicio: 'realizado',
        benefactor_id: '',
        punto_venta_id: '',
        cajas_seleccionadas: [],
        monto_total: 0,
        forma_pago: 'efectivo',
        numero_comprobante: '',
        cobro_monto: 0,
        cobro_forma_pago: 'efectivo',
        cobro_referencia: ''
      });
      await cargarDatos();
    } catch (err) {
      setError('Error al registrar: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitDonacion = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const payload = {
        servicio: {
          tipo_servicio_id: formDonacion.tipo_servicio_id,
          fecha_servicio: formDonacion.fecha_servicio,
          estado: formDonacion.estado_servicio
        },
        cajas: formDonacion.cajas_donadas.map(c => ({
          caja_id: c.id,
          monto: c.monto
        })),
        donante: formDonacion.donante,
        observaciones: formDonacion.observaciones
      };

      await axios.post(`${API_URL}/integracion/servicio-con-donacion`, payload, { headers });

      setSuccess('Servicio y donación registrados exitosamente');
      setFormDonacion({
        tipo_servicio_id: '',
        fecha_servicio: new Date().toISOString().split('T')[0],
        estado_servicio: 'realizado',
        cajas_donadas: [],
        donante: '',
        observaciones: ''
      });
      await cargarDatos();
    } catch (err) {
      setError('Error al registrar: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Integración Servicios - Ventas de Cajas
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Registra servicios parroquiales con venta o donación de cajas
          </p>
        </div>

        {/* Mensajes */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">
            {success}
          </div>
        )}

        {/* Resumen */}
        {resumenIntegracion && (
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Servicios con Ventas</p>
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {resumenIntegracion.servicios_con_ventas || 0}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Monto Total Vendido</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                S/ {(resumenIntegracion.monto_total_vendido || 0).toLocaleString('es-PE')}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Cajas Vendidas</p>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {resumenIntegracion.cajas_vendidas || 0}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Promedio Cajas/Servicio</p>
              <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {resumenIntegracion.promedio_cajas_por_servicio || 0}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('nueva-venta')}
            className={`px-4 py-2 font-medium transition-colors duration-200 ${
              activeTab === 'nueva-venta'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
            }`}
          >
            📦 Nueva Venta con Servicio
          </button>
          <button
            onClick={() => setActiveTab('donacion')}
            className={`px-4 py-2 font-medium transition-colors duration-200 ${
              activeTab === 'donacion'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
            }`}
          >
            🎁 Donación con Servicio
          </button>
          <button
            onClick={() => setActiveTab('historial')}
            className={`px-4 py-2 font-medium transition-colors duration-200 ${
              activeTab === 'historial'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
            }`}
          >
            📋 Historial
          </button>
        </div>

        {/* Nueva Venta con Servicio */}
        {activeTab === 'nueva-venta' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              Registrar Venta de Cajas con Servicio
            </h2>

            <form onSubmit={handleSubmitVenta} className="space-y-6">
              {/* Sección Servicio */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Información del Servicio
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tipo de Servicio *
                    </label>
                    <select
                      required
                      value={formVenta.tipo_servicio_id}
                      onChange={(e) => setFormVenta({ ...formVenta, tipo_servicio_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar tipo de servicio</option>
                      {tiposServicio.map(tipo => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Fecha del Servicio *
                    </label>
                    <input
                      type="date"
                      required
                      value={formVenta.fecha_servicio}
                      onChange={(e) => setFormVenta({ ...formVenta, fecha_servicio: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Descripción
                    </label>
                    <textarea
                      value={formVenta.descripcion_servicio}
                      onChange={(e) => setFormVenta({ ...formVenta, descripcion_servicio: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows="3"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Estado del Servicio
                    </label>
                    <select
                      value={formVenta.estado_servicio}
                      onChange={(e) => setFormVenta({ ...formVenta, estado_servicio: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="programado">Programado</option>
                      <option value="realizado">Realizado</option>
                      <option value="cancelado">Cancelado</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Sección Venta */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Información de la Venta
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Benefactor *
                    </label>
                    <select
                      required
                      value={formVenta.benefactor_id}
                      onChange={(e) => setFormVenta({ ...formVenta, benefactor_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar benefactor</option>
                      {benefactores.map(benef => (
                        <option key={benef.id} value={benef.id}>{benef.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Punto de Venta *
                    </label>
                    <select
                      required
                      value={formVenta.punto_venta_id}
                      onChange={(e) => setFormVenta({ ...formVenta, punto_venta_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar punto de venta</option>
                      {puntosVenta.map(pv => (
                        <option key={pv.id} value={pv.id}>{pv.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Forma de Pago
                    </label>
                    <select
                      value={formVenta.forma_pago}
                      onChange={(e) => setFormVenta({ ...formVenta, forma_pago: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="transferencia">Transferencia</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Número de Comprobante
                    </label>
                    <input
                      type="text"
                      value={formVenta.numero_comprobante}
                      onChange={(e) => setFormVenta({ ...formVenta, numero_comprobante: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Selección de cajas */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Seleccionar Cajas *
                  </label>
                  <div className="flex gap-2 mb-3">
                    <select
                      id="caja-select"
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar caja</option>
                      {cajas.map(caja => (
                        <option key={caja.id} value={caja.id}>
                          {caja.codigo} - S/ {caja.monto}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const select = document.getElementById('caja-select');
                        if (select.value) {
                          handleAgregarCaja(select.value);
                          select.value = '';
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                    >
                      Agregar
                    </button>
                  </div>

                  {/* Cajas seleccionadas */}
                  {formVenta.cajas_seleccionadas.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 max-h-48 overflow-y-auto">
                      {formVenta.cajas_seleccionadas.map(caja => (
                        <div key={caja.id} className="flex justify-between items-center p-2 bg-white dark:bg-gray-600 rounded mb-2">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {caja.codigo} - S/ {caja.monto}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuitarCaja(caja.id)}
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium text-sm"
                          >
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Monto total */}
                <div className="bg-blue-50 dark:bg-blue-900 p-4 rounded-lg mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300">Monto Total</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    S/ {formVenta.monto_total.toLocaleString('es-PE')}
                  </p>
                </div>
              </div>

              {/* Sección Cobro */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Información del Cobro
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Monto Cobrado
                    </label>
                    <input
                      type="number"
                      value={formVenta.cobro_monto || formVenta.monto_total}
                      onChange={(e) => setFormVenta({ ...formVenta, cobro_monto: parseFloat(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Forma de Pago Cobro
                    </label>
                    <select
                      value={formVenta.cobro_forma_pago}
                      onChange={(e) => setFormVenta({ ...formVenta, cobro_forma_pago: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="transferencia">Transferencia</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Referencia (opcional)
                    </label>
                    <input
                      type="text"
                      value={formVenta.cobro_referencia}
                      onChange={(e) => setFormVenta({ ...formVenta, cobro_referencia: e.target.value })}
                      placeholder="Ej: Número de transferencia, referencia de tarjeta"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  disabled={loading || formVenta.cajas_seleccionadas.length === 0}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-6 rounded-lg transition-colors duration-200"
                >
                  {loading ? 'Registrando...' : 'Registrar Venta y Servicio'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Donación con Servicio */}
        {activeTab === 'donacion' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              Registrar Donación de Cajas con Servicio
            </h2>

            <form onSubmit={handleSubmitDonacion} className="space-y-6">
              {/* Sección Servicio */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Información del Servicio
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Tipo de Servicio *
                    </label>
                    <select
                      required
                      value={formDonacion.tipo_servicio_id}
                      onChange={(e) => setFormDonacion({ ...formDonacion, tipo_servicio_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar tipo de servicio</option>
                      {tiposServicio.map(tipo => (
                        <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Fecha del Servicio *
                    </label>
                    <input
                      type="date"
                      required
                      value={formDonacion.fecha_servicio}
                      onChange={(e) => setFormDonacion({ ...formDonacion, fecha_servicio: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Donante
                    </label>
                    <input
                      type="text"
                      value={formDonacion.donante}
                      onChange={(e) => setFormDonacion({ ...formDonacion, donante: e.target.value })}
                      placeholder="Nombre del donante"
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Observaciones
                    </label>
                    <textarea
                      value={formDonacion.observaciones}
                      onChange={(e) => setFormDonacion({ ...formDonacion, observaciones: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows="3"
                    />
                  </div>
                </div>
              </div>

              {/* Selección de cajas */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Cajas a Donar
                </h3>

                <div className="mb-4">
                  <div className="flex gap-2 mb-3">
                    <select
                      id="caja-donacion-select"
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Seleccionar caja</option>
                      {cajas.map(caja => (
                        <option key={caja.id} value={caja.id}>
                          {caja.codigo} - S/ {caja.monto}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const select = document.getElementById('caja-donacion-select');
                        if (select.value) {
                          handleAgregarCajaDonacion(select.value);
                          select.value = '';
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                    >
                      Agregar
                    </button>
                  </div>

                  {/* Cajas seleccionadas */}
                  {formDonacion.cajas_donadas.length > 0 && (
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 max-h-48 overflow-y-auto">
                      {formDonacion.cajas_donadas.map(caja => (
                        <div key={caja.id} className="flex justify-between items-center p-2 bg-white dark:bg-gray-600 rounded mb-2">
                          <span className="text-sm text-gray-900 dark:text-white">
                            {caja.codigo} - S/ {caja.monto}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuitarCajaDonacion(caja.id)}
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-medium text-sm"
                          >
                            Quitar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Botones */}
              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  disabled={loading || formDonacion.cajas_donadas.length === 0}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-6 rounded-lg transition-colors duration-200"
                >
                  {loading ? 'Registrando...' : 'Registrar Donación y Servicio'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Historial */}
        {activeTab === 'historial' && (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
              Historial de Servicios con Ventas
            </h2>

            {serviciosConVentas.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Fecha</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Tipo Servicio</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Estado</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Ventas</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Monto</th>
                      <th className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">Benefactores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {serviciosConVentas.map((servicio, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-4 py-2 text-gray-900 dark:text-white">
                          {new Date(servicio.fecha_servicio).toLocaleDateString('es-PE')}
                        </td>
                        <td className="px-4 py-2 text-gray-900 dark:text-white">{servicio.tipo_servicio}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            servicio.estado_servicio === 'realizado'
                              ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                              : servicio.estado_servicio === 'programado'
                              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          }`}>
                            {servicio.estado_servicio}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-gray-900 dark:text-white">{servicio.cantidad_ventas}</td>
                        <td className="px-4 py-2 text-gray-900 dark:text-white">
                          S/ {(servicio.monto_total_venta || 0).toLocaleString('es-PE')}
                        </td>
                        <td className="px-4 py-2 text-gray-900 dark:text-white text-xs">
                          {servicio.benefactores || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-center py-8 text-gray-600 dark:text-gray-400">
                No hay servicios con ventas registrados
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
