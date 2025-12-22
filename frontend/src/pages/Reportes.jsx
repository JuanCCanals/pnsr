// frontend/src/pages/Reportes.jsx
/**
 * Página de reportes con exportación a Excel
 * Incluye reportes de Cajas del Amor y Servicios Parroquiales
 * 
 * Fase 4: Reportes Completos con Exportación a Excel
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Función para exportar a Excel
const exportToExcel = (data, filename, sheetName = 'Reporte') => {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filename}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

// Componente de tabla con filtros genéricos (lo usamos solo donde conviene)
const ReportTable = ({ title, data, columns, onExport, filters, onFilterChange, loading }) => {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{title}</h2>

        {/* Filtros genéricos */}
        {filters && Object.keys(filters).length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {Object.entries(filters).map(([key, value]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {key.charAt(0).toUpperCase() + key.slice(1)}
                </label>
                <input
                  type={key.includes('fecha') || key.includes('desde') || key.includes('hasta') ? 'date' : 'text'}
                  value={value}
                  onChange={(e) => onFilterChange(key, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
        )}

        {/* Botón exportar */}
        <button
          onClick={onExport}
          disabled={!data || data.length === 0 || loading}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
        >
          📥 Exportar a Excel
        </button>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-gray-600 dark:text-gray-400">Cargando datos...</p>
        </div>
      ) : data && data.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 dark:bg-gray-700">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="px-4 py-2 text-left font-semibold text-gray-900 dark:text-white">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {data.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                  {columns.map((col) => (
                    <td key={col} className="px-4 py-2 text-gray-900 dark:text-white">
                      {typeof row[col] === 'number' ? row[col].toLocaleString('es-PE') : row[col] || '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
            Total de registros: {data.length}
          </p>
        </div>
      ) : (
        <p className="text-center py-8 text-gray-600 dark:text-gray-400">
          No hay datos disponibles
        </p>
      )}
    </div>
  );
};

export default function Reportes() {
  const [activeTab, setActiveTab] = useState('cajas');
  const [loading, setLoading] = useState(false);

  const FAMILIAS_MAX_MOSTRAR = 20;
  const CAJAS_MAX_MOSTRAR = 20;
  const VENTAS_MAX_MOSTRAR = 20;

  // Estado para reportes de cajas
  const [familias, setFamilias] = useState([]);
  const [zonasData, setZonasData] = useState([]);
  const [ubicacionCajas, setUbicacionCajas] = useState([]);
  const [ventasCajas, setVentasCajas] = useState([]);
  const [recaudacionPV, setRecaudacionPV] = useState([]);
  const [recaudacionForma, setRecaudacionForma] = useState([]);
  const [detalleYape, setDetalleYape] = useState([]);
  const [detallePlin, setDetallePlin] = useState([]);
  const [detalleTransferencia, setDetalleTransferencia] = useState([]);
  const [detalleInterbancario, setDetalleInterbancario] = useState([]);
  const [estadoCajas, setEstadoCajas] = useState([]);
  const [campaniaResumen, setCampaniaResumen] = useState(null);
  const [segmentacionEdades, setSegmentacionEdades] = useState(null);
  const [tamanioFamilias, setTamanioFamilias] = useState(null);

  const ESTADOS_CAJA = [
    { value: '', label: 'Todos' },
    { value: 'disponible', label: 'Disponible' },
    { value: 'vendida', label: 'Vendida' },
    { value: 'devuelta_llena', label: 'Devuelta llena' }
  ];

  const FORMAS_PAGO = [
    { value: '', label: 'Todas' },
    { value: 'EFECTIVO', label: 'Efectivo' },
    { value: 'YAPE', label: 'Yape' },
    { value: 'PLIN', label: 'Plin' },
    { value: 'TRANSFERENCIA', label: 'Transferencia' },
    { value: 'INTERBANCARIO', label: 'Transferencia interbancaria' }
  ];

  // Opciones para filtros de ubicación / ventas (punto de venta)
  const [opcionesZonas, setOpcionesZonas] = useState([]);
  const [opcionesPuntosVenta, setOpcionesPuntosVenta] = useState([]);

  // Para evitar mostrar miles de registros en pantalla
  const familiasParaTabla = familias.slice(0, FAMILIAS_MAX_MOSTRAR);
  const ventasParaTabla = ventasCajas.slice(0, VENTAS_MAX_MOSTRAR);

  // Estado para reportes de servicios
  const [serviciosPorTipo, setServiciosPorTipo] = useState([]);
  const [ingresosPorServicio, setIngresosPorServicio] = useState([]);
  const [estadoServicios, setEstadoServicios] = useState([]);

  // Filtros
  const [filtros, setFiltros] = useState({
    cajas: { zona_id: '', estado_caja: '' },
    ubicacion: { estado: '', punto_venta_id: '', zona_id: '' },
    ventas: { desde: '', hasta: '', punto_venta_id: '', forma_pago: '' },
    servicios: { desde: '', hasta: '' }
  });

  const handleFilterChange = (reportType, key, value) => {
    setFiltros(prev => ({
      ...prev,
      [reportType]: { ...prev[reportType], [key]: value }
    }));
  };

  // Cargar reportes de cajas
  const loadReporteCajas = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [familRes, zonRes, ubicRes, ventRes, recRes, estRes, campRes, segRes, tamRes] = await Promise.all([
        axios.get(`${API_URL}/reportes/cajas/familias`, { headers, params: filtros.cajas }),
        axios.get(`${API_URL}/reportes/cajas/zonas`, { headers }),
        axios.get(`${API_URL}/reportes/cajas/ubicacion`, { headers, params: filtros.ubicacion }),
        axios.get(`${API_URL}/reportes/cajas/ventas`, { headers, params: filtros.ventas }),
        axios.get(`${API_URL}/reportes/cajas/recaudacion`, { headers, params: filtros.ventas }),
        axios.get(`${API_URL}/reportes/cajas/estado`, { headers }),
        axios.get(`${API_URL}/reportes/cajas/campania-resumen`, { headers }),
        axios.get(`${API_URL}/reportes/cajas/segmentacion-edades`, { headers })
        // axios.get(`${API_URL}/reportes/cajas/tamaño-familias`, { headers })
      ]);

      setFamilias(familRes.data.data || []);
      setZonasData(zonRes.data.data || []);
      setUbicacionCajas(ubicRes.data.data || []);
      setVentasCajas(ventRes.data.data || []);

      const recData = recRes.data.data || {};
      setRecaudacionPV(recData.por_punto_venta || []);
      setRecaudacionForma(recData.por_forma_pago || []);
      setDetalleYape(recData.detalle_yape || []);
      setDetallePlin(recData.detalle_plin || []);
      setDetalleTransferencia(recData.detalle_transferencia || []);
      setDetalleInterbancario(recData.detalle_interbancario || []);

      setEstadoCajas(estRes.data.data || []);
      setCampaniaResumen(campRes.data.data || null);
      setSegmentacionEdades(segRes.data.data || null);
      setTamanioFamilias(tamRes.data.data || null);
    } catch (error) {
      console.error('Error cargando reportes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Cargar reportes de servicios
  const loadReporteServicios = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };

      const [tipoRes, ingRes, estRes] = await Promise.all([
        axios.get(`${API_URL}/reportes/servicios/por-tipo`, { headers, params: filtros.servicios }),
        axios.get(`${API_URL}/reportes/servicios/ingresos`, { headers, params: filtros.servicios }),
        axios.get(`${API_URL}/reportes/servicios/estado`, { headers })
      ]);

      setServiciosPorTipo(tipoRes.data.data || []);
      setIngresosPorServicio(ingRes.data.data || []);
      setEstadoServicios(estRes.data.data || []);
    } catch (error) {
      console.error('Error cargando reportes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'cajas') {
      loadReporteCajas();
    } else {
      loadReporteServicios();
    }
  }, [activeTab]);

  // Construir opciones de zonas a partir del reporte de zonas
  useEffect(() => {
    if (zonasData && zonasData.length > 0) {
      const opciones = zonasData
        .filter(z => z.id != null)
        .map(z => ({
          value: String(z.id),
          label: z.nombre || `Zona ${z.id}`
        }));
      setOpcionesZonas(opciones);
    } else {
      setOpcionesZonas([]);
    }
  }, [zonasData]);

  // Construir opciones de puntos de venta a partir de ubicación de cajas
  useEffect(() => {
    if (ubicacionCajas && ubicacionCajas.length > 0) {
      const mapa = new Map();
      ubicacionCajas.forEach(caja => {
        if (caja.punto_venta_id && caja.punto_venta) {
          mapa.set(String(caja.punto_venta_id), caja.punto_venta);
        }
      });

      const opciones = Array.from(mapa.entries()).map(([value, label]) => ({
        value,
        label
      }));

      setOpcionesPuntosVenta(opciones);
    } else {
      setOpcionesPuntosVenta([]);
    }
  }, [ubicacionCajas]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Reportes</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Consulta y exporta reportes del sistema
          </p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('cajas')}
            className={`px-4 py-2 font-medium transition-colors duration-200 ${
              activeTab === 'cajas'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
            }`}
          >
            📦 Cajas del Amor
          </button>
          <button
            onClick={() => setActiveTab('servicios')}
            className={`px-4 py-2 font-medium transition-colors duration-200 ${
              activeTab === 'servicios'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'
            }`}
          >
            ⛪ Servicios Parroquiales
          </button>
        </div>

        {activeTab === 'cajas' && (
          <div className="space-y-6">

            {/* Filtros específicos para "Listado de Familias Beneficiadas" */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Filtros - Familias Beneficiadas
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Filtro por Zona */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Zona
                  </label>
                  <select
                    value={filtros.cajas.zona_id}
                    onChange={(e) => handleFilterChange('cajas', 'zona_id', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todas las zonas</option>
                    {zonasData.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Filtro por Estado de caja */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Estado de caja
                  </label>
                  <select
                    value={filtros.cajas.estado_caja}
                    onChange={(e) => handleFilterChange('cajas', 'estado_caja', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todos los estados</option>
                    <option value="disponible">Disponible</option>
                    <option value="asignada">Asignada</option>
                    <option value="entregada">Entregada</option>
                    <option value="devuelta">Devuelta</option>
                  </select>
                </div>

                {/* Botón aplicar filtros */}
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={loadReporteCajas}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                  >
                    Aplicar filtros
                  </button>
                </div>
              </div>

              <p className="text-sm text-gray-600 dark:text-gray-400">
                Mostrando <span className="font-semibold">{familiasParaTabla.length}</span> de{' '}
                <span className="font-semibold">{familias.length}</span> familias.  
                Para ver el listado completo utiliza la exportación a Excel.
              </p>
            </div>

            {/* Tabla de familias usando sólo las primeras N filas */}
            <ReportTable
              title="Listado de Familias Beneficiadas"
              data={familiasParaTabla}
              columns={['codigo', 'nombre_responsable', 'direccion', 'zona', 'integrantes', 'caja_monto']}
              onExport={() => exportToExcel(familias, 'familias-beneficiadas', 'Familias')}
              loading={loading}
            />

            <ReportTable
              title="Zonas Beneficiadas"
              data={zonasData}
              columns={['nombre', 'familias', 'cajas', 'cajas_vendidas', 'cajas_disponibles']}
              onExport={() => exportToExcel(zonasData, 'zonas-beneficiadas', 'Zonas')}
              loading={loading}
            />

            {/* Filtros específicos para Ubicación de Cajas */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Filtros - Ubicación de Cajas
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Estado de caja */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Estado de caja
                  </label>
                  <select
                    value={filtros.ubicacion.estado}
                    onChange={(e) =>
                      handleFilterChange('ubicacion', 'estado', e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ESTADOS_CAJA.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Punto de venta */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Punto de venta
                  </label>
                  <select
                    value={filtros.ubicacion.punto_venta_id}
                    onChange={(e) =>
                      handleFilterChange('ubicacion', 'punto_venta_id', e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todos</option>
                    {opcionesPuntosVenta.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Zona */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Zona
                  </label>
                  <select
                    value={filtros.ubicacion.zona_id}
                    onChange={(e) =>
                      handleFilterChange('ubicacion', 'zona_id', e.target.value)
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todas</option>
                    {opcionesZonas.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={loadReporteCajas}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors duración-200"
                >
                  {loading ? 'Cargando...' : 'Aplicar filtros'}
                </button>
              </div>
            </div>

            {/* Tabla Ubicación de Cajas limitada */}
            <ReportTable
              title="Ubicación de Cajas"
              data={ubicacionCajas.slice(0, CAJAS_MAX_MOSTRAR)}
              columns={['codigo', 'monto', 'estado', 'punto_venta', 'nombre_responsable', 'zona']}
              onExport={() => exportToExcel(ubicacionCajas, 'ubicacion-cajas', 'Ubicación')}
              loading={loading}
            />

            {/* Filtros específicos para Venta de Cajas */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-4 mb-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Filtros - Venta de Cajas
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                {/* Desde */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Desde
                  </label>
                  <input
                    type="date"
                    value={filtros.ventas.desde}
                    onChange={(e) => handleFilterChange('ventas', 'desde', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Hasta */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Hasta
                  </label>
                  <input
                    type="date"
                    value={filtros.ventas.hasta}
                    onChange={(e) => handleFilterChange('ventas', 'hasta', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Punto de venta */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Punto de venta
                  </label>
                  <select
                    value={filtros.ventas.punto_venta_id}
                    onChange={(e) => handleFilterChange('ventas', 'punto_venta_id', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Todos</option>
                    {opcionesPuntosVenta.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Forma de pago */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Forma de pago
                  </label>
                  <select
                    value={filtros.ventas.forma_pago}
                    onChange={(e) => handleFilterChange('ventas', 'forma_pago', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {FORMAS_PAGO.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={loadReporteCajas}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition-colors duration-200"
                >
                  {loading ? 'Cargando...' : 'Aplicar filtros'}
                </button>
              </div>

              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Mostrando <span className="font-semibold">{ventasParaTabla.length}</span> de{' '}
                <span className="font-semibold">{ventasCajas.length}</span> ventas.  
                Para ver el listado completo utiliza la exportación a Excel.
              </p>
            </div>

            {/* Tabla Venta de Cajas limitada */}
            <ReportTable
              title="Venta de Cajas"
              data={ventasParaTabla}
              columns={['numero_comprobante', 'fecha_venta', 'punto_venta', 'benefactor', 'cantidad_cajas', 'cajas_40', 'cajas_160', 'monto_total', 'forma_pago']}
              onExport={() => exportToExcel(ventasCajas, 'ventas-cajas', 'Ventas')}
              loading={loading}
            />

            {/* Recaudación por Punto de Venta */}
            <ReportTable
              title="Recaudación por Punto de Venta"
              data={recaudacionPV}
              columns={['nombre', 'cantidad_ventas', 'total_recaudado']}
              onExport={() => exportToExcel(recaudacionPV, 'recaudacion-pv', 'Recaudación PV')}
              loading={loading}
            />

            {/* Recaudación por Forma de Pago */}
            <ReportTable
              title="Recaudación por Forma de Pago"
              data={recaudacionForma}
              columns={['forma_pago', 'cantidad_ventas', 'monto']}
              onExport={() => exportToExcel(recaudacionForma, 'recaudacion-forma-pago', 'Formas de Pago')}
              loading={loading}
            />

            {/* Detalle de Operaciones por Forma de Pago */}
            <ReportTable
              title="Detalle Yape"
              data={detalleYape}
              columns={['punto_venta', 'fecha_operacion', 'hora_operacion', 'numero_operacion', 'monto']}
              onExport={() => exportToExcel(detalleYape, 'detalle-yape', 'Yape')}
              loading={loading}
            />

            <ReportTable
              title="Detalle Plin"
              data={detallePlin}
              columns={['punto_venta', 'fecha_operacion', 'hora_operacion', 'numero_operacion', 'monto']}
              onExport={() => exportToExcel(detallePlin, 'detalle-plin', 'Plin')}
              loading={loading}
            />

            <ReportTable
              title="Detalle Transferencia"
              data={detalleTransferencia}
              columns={['punto_venta', 'fecha_operacion', 'hora_operacion', 'numero_operacion', 'monto']}
              onExport={() => exportToExcel(detalleTransferencia, 'detalle-transferencia', 'Transferencia')}
              loading={loading}
            />

            <ReportTable
              title="Detalle Transferencia Interbancaria"
              data={detalleInterbancario}
              columns={['punto_venta', 'fecha_operacion', 'hora_operacion', 'numero_operacion', 'monto']}
              onExport={() => exportToExcel(detalleInterbancario, 'detalle-interbancaria', 'Interbancario')}
              loading={loading}
            />

            <ReportTable
              title="Estado de Cajas"
              data={estadoCajas}
              columns={['estado', 'cantidad', 'cajas_40', 'cajas_160', 'monto_total']}
              onExport={() => exportToExcel(estadoCajas, 'estado-cajas', 'Estado')}
              loading={loading}
            />

            {campaniaResumen && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Información de Campaña
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Recaudado</p>
                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      S/ {campaniaResumen.total_recaudado.toLocaleString('es-PE')}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Cajas Vendidas</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {campaniaResumen.cajas_vendidas}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Porcentaje Avance</p>
                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {campaniaResumen.porcentaje_avance}%
                    </p>
                  </div>
                </div>
              </div>
            )}

            {segmentacionEdades && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Segmentación por Edades (Total / Vendidas / No vendidas)
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Niños 0-4 */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                      Niños 0-4
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Total
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {segmentacionEdades.ninos_0_4_total || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Vendidas: {segmentacionEdades.ninos_0_4_vendidas || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No vendidas: {segmentacionEdades.ninos_0_4_no_vendidas || 0}
                    </p>
                  </div>

                  {/* Niñas 0-4 */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                      Niñas 0-4
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Total
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {segmentacionEdades.ninas_0_4_total || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Vendidas: {segmentacionEdades.ninas_0_4_vendidas || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No vendidas: {segmentacionEdades.ninas_0_4_no_vendidas || 0}
                    </p>
                  </div>

                  {/* Niños 5-10 */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                      Niños 5-10
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Total
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {segmentacionEdades.ninos_5_10_total || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Vendidas: {segmentacionEdades.ninos_5_10_vendidas || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No vendidas: {segmentacionEdades.ninos_5_10_no_vendidas || 0}
                    </p>
                  </div>

                  {/* Niñas 5-10 */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                      Niñas 5-10
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Total
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {segmentacionEdades.ninas_5_10_total || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Vendidas: {segmentacionEdades.ninas_5_10_vendidas || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No vendidas: {segmentacionEdades.ninas_5_10_no_vendidas || 0}
                    </p>
                  </div>

                  {/* Niños 11-13 */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                      Niños 11-13
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Total
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {segmentacionEdades.ninos_11_13_total || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Vendidas: {segmentacionEdades.ninos_11_13_vendidas || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No vendidas: {segmentacionEdades.ninos_11_13_no_vendidas || 0}
                    </p>
                  </div>

                  {/* Niñas 11-13 */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                      Niñas 11-13
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Total
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {segmentacionEdades.ninas_11_13_total || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Vendidas: {segmentacionEdades.ninas_11_13_vendidas || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      No vendidas: {segmentacionEdades.ninas_11_13_no_vendidas || 0}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {tamanioFamilias && (
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                  Tamaño de Familias
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Hasta 5 - Vendidas</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {tamanioFamilias.hasta_5_vendidas || 0}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Hasta 5 - No vendidas</p>
                    <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                      {tamanioFamilias.hasta_5_no_vendidas || 0}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Más de 5 - Vendidas</p>
                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {tamanioFamilias.mas_5_vendidas || 0}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Más de 5 - No vendidas</p>
                    <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                      {tamanioFamilias.mas_5_no_vendidas || 0}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reportes Servicios */}
        {activeTab === 'servicios' && (
          <div className="space-y-6">
            <ReportTable
              title="Servicios por Tipo"
              data={serviciosPorTipo}
              columns={['nombre', 'cantidad', 'monto_recaudado']}
              onExport={() => exportToExcel(serviciosPorTipo, 'servicios-por-tipo', 'Servicios')}
              filters={filtros.servicios}
              onFilterChange={(key, value) => handleFilterChange('servicios', key, value)}
              loading={loading}
            />

            <ReportTable
              title="Ingresos por Servicio"
              data={ingresosPorServicio}
              columns={['nombre', 'cantidad_servicios', 'total_ingresos', 'promedio_ingreso']}
              onExport={() => exportToExcel(ingresosPorServicio, 'ingresos-servicios', 'Ingresos')}
              loading={loading}
            />

            <ReportTable
              title="Estado de Servicios"
              data={estadoServicios}
              columns={['estado', 'cantidad']}
              onExport={() => exportToExcel(estadoServicios, 'estado-servicios', 'Estado')}
              loading={loading}
            />
          </div>
        )}
      </div>
    </div>
  );
}
