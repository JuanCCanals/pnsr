import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import ExcelJS from 'exceljs';

const Zonas = () => {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('zonas', 'crear');
  const canUpdate = hasPermission('zonas', 'actualizar');
  const canDelete = hasPermission('zonas', 'eliminar');

  const [zonas, setZonas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingZona, setEditingZona] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef(null);
  const [formData, setFormData] = useState({
    nombre: '',
    abreviatura: '',
    descripcion: '',
    numero_familias: 0,
    activo: true
  });

  useEffect(() => {
    fetchZonas();
    fetchStats();
  }, []);

  const fetchZonas = async () => {
    try {
      setLoading(true);
      const response = await api.get('/zonas?includeStats=true');
      setZonas(response.data.data || []);
    } catch (err) {
      setError('Error al cargar las zonas');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/zonas/stats');
      setStats(response.data.data);
    } catch (err) {
      console.error('Error al cargar estadísticas:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError(null);
      
      const dataToSend = {
        ...formData,
        numero_familias: parseInt(formData.numero_familias) || 0
      };

      if (editingZona) {
        await api.put(`/zonas/${editingZona.id}`, dataToSend);
        setSuccess('Zona actualizada exitosamente');
      } else {
        await api.post('/zonas', dataToSend);
        setSuccess('Zona creada exitosamente');
      }
      
      setShowModal(false);
      setEditingZona(null);
      resetForm();
      fetchZonas();
      fetchStats();
      
      // Limpiar mensaje de éxito después de 3 segundos
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Error al guardar la zona';
      setError(errorMessage);
      console.error('Error:', err);
    }
  };

  const handleEdit = (zona) => {
    setEditingZona(zona);
    setFormData({
      nombre: zona.nombre || '',
      abreviatura: zona.abreviatura || '',
      descripcion: zona.descripcion || '',
      numero_familias: zona.numero_familias || 0,
      activo: zona.activo !== undefined ? zona.activo : true
    });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('¿Está seguro de eliminar esta zona? Esta acción no se puede deshacer.')) {
      try {
        await api.delete(`/zonas/${id}`);
        setSuccess('Zona eliminada exitosamente');
        fetchZonas();
        fetchStats();
        setTimeout(() => setSuccess(null), 3000);
      } catch (err) {
        const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Error al eliminar la zona';
        setError(errorMessage);
        console.error('Error:', err);
      }
    }
  };

  const handleToggleStatus = async (zona) => {
    try {
      await api.patch(`/zonas/${zona.id}/toggle-status`);
      setSuccess(`Zona ${zona.activo ? 'desactivada' : 'activada'} exitosamente`);
      fetchZonas();
      fetchStats();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const errorMessage = err.response?.data?.message || err.response?.data?.error || 'Error al cambiar estado';
      setError(errorMessage);
      console.error('Error:', err);
    }
  };

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      fetchZonas();
      return;
    }

    try {
      setLoading(true);
      const response = await api.get(`/zonas/search?q=${encodeURIComponent(searchTerm)}`);
      setZonas(response.data.data || []);
    } catch (err) {
      setError('Error al buscar zonas');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ========== EXPORTAR EXCEL ==========
  const handleExportExcel = async () => {
    try {
      setExporting(true);
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Zonas');

      // Headers
      const headers = ['ID', 'Nombre', 'Abreviatura', 'Descripción', 'Número Familias', 'Activo'];
      const headerRow = ws.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = {
          top: { style: 'thin' }, bottom: { style: 'thin' },
          left: { style: 'thin' }, right: { style: 'thin' },
        };
      });

      // Data
      const dataSource = filteredZonas.length > 0 ? filteredZonas : zonas;
      dataSource.forEach((z) => {
        ws.addRow([
          z.id,
          z.nombre || '',
          z.abreviatura || '',
          z.descripcion || '',
          z.numero_familias || 0,
          z.activo ? 'Sí' : 'No',
        ]);
      });

      // Auto-width
      ws.columns.forEach((col) => {
        let maxLen = 12;
        col.eachCell({ includeEmpty: true }, (cell) => {
          const len = cell.value ? String(cell.value).length + 2 : 0;
          if (len > maxLen) maxLen = len;
        });
        col.width = Math.min(maxLen, 40);
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zonas_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess('Excel exportado exitosamente');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Error exportando:', err);
      setError('Error al exportar a Excel');
    } finally {
      setExporting(false);
    }
  };

  // ========== IMPORTAR EXCEL — Preview ==========
  const handleImportFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImportFile(file);
    setImportPreview(null);
    setError(null);

    try {
      const wb = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];
      if (!ws) { setError('El archivo no tiene hojas'); return; }

      const rows = [];
      const headerRow = ws.getRow(1);
      const headers = [];
      headerRow.eachCell((cell, colNumber) => {
        headers[colNumber] = String(cell.value || '').trim().toLowerCase();
      });

      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        const obj = {};
        row.eachCell((cell, colNumber) => {
          const key = headers[colNumber];
          if (key) obj[key] = cell.value;
        });
        // Solo agregar si tiene al menos nombre
        if (obj.nombre || obj['nombre']) {
          rows.push({
            nombre: String(obj.nombre || obj['nombre'] || '').trim(),
            abreviatura: String(obj.abreviatura || obj['abreviatura'] || '').trim(),
            descripcion: String(obj.descripcion || obj['descripción'] || obj['descripcion'] || '').trim(),
            numero_familias: parseInt(obj.numero_familias || obj['numero_familias'] || obj['número familias'] || obj['numero familias'] || 0) || 0,
            activo: obj.activo === undefined ? true : (String(obj.activo).toLowerCase() === 'sí' || String(obj.activo) === '1' || String(obj.activo).toLowerCase() === 'true' || String(obj.activo).toLowerCase() === 'si'),
          });
        }
      });

      if (rows.length === 0) {
        setError('No se encontraron zonas válidas en el archivo. Asegúrese de que tenga la columna "Nombre".');
        return;
      }

      setImportPreview(rows);
    } catch (err) {
      console.error('Error leyendo Excel:', err);
      setError('Error al leer el archivo Excel');
    }
  };

  // ========== IMPORTAR EXCEL — Confirmar ==========
  const handleImportConfirm = async () => {
    if (!importPreview || importPreview.length === 0) return;
    setImporting(true);
    setError(null);

    try {
      const res = await api.post('/zonas/import-excel', { zonas: importPreview });
      if (res.data.success) {
        const msg = res.data.message || `Importación completada: ${res.data.created || 0} creadas, ${res.data.updated || 0} actualizadas`;
        setSuccess(msg);
        setTimeout(() => setSuccess(null), 5000);
        setShowImportModal(false);
        setImportFile(null);
        setImportPreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchZonas();
        fetchStats();
      } else {
        setError(res.data.error || 'Error en la importación');
      }
    } catch (err) {
      console.error('Error importando:', err);
      setError(err.response?.data?.error || 'Error al importar zonas');
    } finally {
      setImporting(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportFile(null);
    setImportPreview(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetForm = () => {
    setFormData({
      nombre: '',
      abreviatura: '',
      descripcion: '',
      numero_familias: 0,
      activo: true
    });
  };

  const openCreateModal = () => {
    setEditingZona(null);
    resetForm();
    setShowModal(true);
  };

  const filteredZonas = zonas.filter(zona =>
    zona.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (zona.abreviatura && zona.abreviatura.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-700 shadow rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Gestión de Zonas
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Administra las zonas geográficas del sistema PNSR.
            </p>
          </div>
          <div className="flex space-x-3">
            {canCreate && (
              <button
                onClick={() => setShowImportModal(true)}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg transition-colors text-sm"
              >
                Importar Excel
              </button>
            )}
            <button
              onClick={handleExportExcel}
              disabled={exporting}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white px-4 py-2 rounded-lg transition-colors text-sm"
            >
              {exporting ? 'Exportando...' : 'Exportar Excel'}
            </button>
            {canCreate && (
            <button
              onClick={openCreateModal}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
            >
              + Nueva Zona
            </button>
            )}
          </div>
        </div>

        {/* Estadísticas */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="text-blue-600 dark:text-blue-400 text-sm font-medium">Total Zonas</div>
              <div className="text-2xl font-bold text-blue-800 dark:text-blue-300">{stats.totalZonas}</div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-lg">
              <div className="text-yellow-600 dark:text-yellow-400 text-sm font-medium">Total Familias</div>
              <div className="text-2xl font-bold text-yellow-800 dark:text-yellow-300">{stats.totalFamiliasRegistradas}</div>
            </div>
          </div>
        )}

        {/* Búsqueda */}
        <div className="flex space-x-3 mt-4">
          <input
            type="text"
            placeholder="Buscar por nombre o abreviatura..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          />
          <button
            onClick={handleSearch}
            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Buscar
          </button>
          <button
            onClick={() => {
              setSearchTerm('');
              fetchZonas();
            }}
            className="bg-gray-400 hover:bg-gray-500 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Limpiar
          </button>
        </div>
      </div>

      {/* Mensajes */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      {/* Tabla de Zonas */}
      <div className="bg-white dark:bg-gray-700 shadow rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Zona
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Abreviatura
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Familias
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Estadísticas
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-700 divide-y divide-gray-200 dark:divide-gray-600">
              {filteredZonas.map((zona) => (
                <tr key={zona.id} className="hover:bg-gray-50 dark:hover:bg-gray-600">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {zona.nombre}
                      </div>
                      {zona.descripcion && (
                        <div className="text-sm text-gray-500 dark:text-gray-300">
                          {zona.descripcion}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      {zona.abreviatura || 'N/A'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      <div>Registradas: <span className="font-medium">{zona.numero_familias || 0}</span></div>
                      <div>Reales: <span className="font-medium">{zona.total_familias_reales || 0}</span></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900 dark:text-white">
                      <div>Activas: <span className="text-green-600 font-medium">{zona.familias_activas || 0}</span></div>
                      <div>Cajas: <span className="text-blue-600 font-medium">{zona.total_cajas || 0}</span></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      zona.activo 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}>
                      {zona.activo ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex space-x-2">
                      {canUpdate && (
                      <button
                        onClick={() => handleEdit(zona)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Editar
                      </button>
                      )}
                      {canUpdate && (
                      <button
                        onClick={() => handleToggleStatus(zona)}
                        className="text-yellow-600 hover:text-yellow-900 dark:text-yellow-400 dark:hover:text-yellow-300"
                      >
                        {zona.activo ? 'Desactivar' : 'Activar'}
                      </button>
                      )}

                      {canDelete && (
                      <button
                        onClick={() => handleDelete(zona.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Eliminar
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredZonas.length === 0 && (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            {searchTerm ? 'No se encontraron zonas que coincidan con la búsqueda.' : 'No hay zonas registradas.'}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              {editingZona ? 'Editar Zona' : 'Nueva Zona'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Nombre *
                </label>
                <input
                  type="text"
                  required
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Ej: Zona Centro"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Abreviatura *
                </label>
                <input
                  type="text"
                  required
                  maxLength="10"
                  value={formData.abreviatura}
                  onChange={(e) => setFormData({ ...formData, abreviatura: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Ej: ZC1"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Máximo 10 caracteres, solo letras y números
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Número de Familias
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.numero_familias}
                  onChange={(e) => setFormData({ ...formData, numero_familias: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="0"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Número estimado de familias en la zona
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Descripción
                </label>
                <textarea
                  value={formData.descripcion}
                  onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="Descripción opcional de la zona"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="activo"
                  checked={formData.activo}
                  onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="activo" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Zona activa
                </label>
              </div>
              
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  {editingZona ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Importar Excel */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Importar Zonas desde Excel
              </h2>
              <button onClick={closeImportModal} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>

            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
              <p className="font-medium mb-1">Formato requerido del archivo Excel:</p>
              <p>Columnas: <strong>Nombre</strong> (obligatorio), <strong>Abreviatura</strong>, <strong>Descripción</strong>, <strong>Numero_Familias</strong>, <strong>Activo</strong> (Sí/No)</p>
              <p className="mt-1">Si la abreviatura coincide con una zona existente, se actualizará. Si no existe, se creará una nueva.</p>
            </div>

            <div className="mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleImportFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg text-sm text-red-700 dark:text-red-300">
                ❌ {error}
              </div>
            )}

            {/* Preview */}
            {importPreview && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Vista previa: {importPreview.length} zona(s) detectada(s)
                </h3>
                <div className="max-h-64 overflow-y-auto border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Abreviatura</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Familias</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Activo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {importPreview.map((z, i) => (
                        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-600">
                          <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{z.nombre}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{z.abreviatura || '—'}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-300 max-w-[200px] truncate">{z.descripcion || '—'}</td>
                          <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{z.numero_familias}</td>
                          <td className="px-3 py-2">{z.activo ? '✅' : '❌'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={closeImportModal}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleImportConfirm}
                disabled={importing || !importPreview || importPreview.length === 0}
                className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-5 py-2 rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {importing ? 'Importando...' : `Importar ${importPreview?.length || 0} zona(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Zonas;
