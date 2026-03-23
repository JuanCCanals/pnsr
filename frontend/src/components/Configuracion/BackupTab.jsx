// frontend/src/components/Configuracion/BackupTab.jsx
import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-PE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) + ' ' + d.toLocaleTimeString('es-PE', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

const BackupTab = () => {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [restoring, setRestoring] = useState(null); // nombre del backup restaurándose
  const [message, setMessage] = useState(null);

  // Purgar tablas
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeGroups, setPurgeGroups] = useState([]);
  const [selectedPurgeGroups, setSelectedPurgeGroups] = useState([]);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState(null);

  const token = localStorage.getItem('token');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // ---- Cargar lista ----
  const fetchBackups = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/backup/list`, { headers });
      const data = await res.json();
      if (data.success) {
        setBackups(data.data);
      } else {
        showMessage('error', data.error || 'Error al cargar backups');
      }
    } catch (err) {
      showMessage('error', 'No se pudo conectar con el servidor');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchBackups(); }, [fetchBackups]);

  // ---- Crear backup ----
  const handleCreate = async () => {
    if (creating) return;
    setCreating(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/backup/create`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        showMessage('success', `Backup "${data.data.nombre}" creado exitosamente`);
        fetchBackups();
      } else {
        showMessage('error', data.error || 'Error al crear backup');
      }
    } catch (err) {
      showMessage('error', 'Error de conexión al crear backup');
    } finally {
      setCreating(false);
    }
  };

  // ---- Descargar ----
  const handleDownload = async (nombre) => {
    try {
      const res = await fetch(`${API_BASE}/backup/download/${nombre}`, { headers });
      if (!res.ok) throw new Error('Error al descargar');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showMessage('error', 'Error al descargar el backup');
    }
  };

  // ---- Eliminar ----
  const handleDelete = async (nombre) => {
    if (!window.confirm(`¿Está seguro de eliminar el backup "${nombre}"?\nEsta acción no se puede deshacer.`)) return;
    setDeleting(nombre);
    try {
      const res = await fetch(`${API_BASE}/backup/${nombre}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        showMessage('success', 'Backup eliminado');
        fetchBackups();
      } else {
        showMessage('error', data.error || 'Error al eliminar');
      }
    } catch (err) {
      showMessage('error', 'Error de conexión al eliminar');
    } finally {
      setDeleting(null);
    }
  };

  // ---- Restaurar (doble confirmación) ----
  const handleRestore = async (nombre) => {
    // Primera confirmación
    if (!window.confirm(
      `⚠️ RESTAURAR BASE DE DATOS\n\n` +
      `Esto reemplazará TODOS los datos actuales con el backup:\n"${nombre}"\n\n` +
      `Se creará un backup de seguridad automático antes de restaurar.\n\n` +
      `¿Desea continuar?`
    )) return;

    // Segunda confirmación
    if (!window.confirm(
      `🔴 CONFIRMACIÓN FINAL\n\n` +
      `¿Está COMPLETAMENTE SEGURO?\n` +
      `Esta acción sobreescribirá toda la base de datos.\n\n` +
      `Por favor CONFIRME nuevamente`
    )) return;

    setRestoring(nombre);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/backup/restore/${nombre}`, {
        method: 'POST',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        showMessage('success',
          `Base de datos restaurada exitosamente. ` +
          `Backup de seguridad creado: "${data.data.backup_seguridad}"`
        );
        fetchBackups();
      } else {
        showMessage('error', data.error || 'Error al restaurar');
      }
    } catch (err) {
      showMessage('error', 'Error de conexión al restaurar');
    } finally {
      setRestoring(null);
    }
  };

  // ---- Mensaje temporal ----
  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 8000);
  };

  // ---- Purgar: abrir modal y cargar grupos ----
  const openPurgeModal = async () => {
    setPurgeResult(null);
    setSelectedPurgeGroups([]);
    try {
      const res = await fetch(`${API_BASE}/backup/purge-groups`, { headers });
      const data = await res.json();
      if (data.success) {
        setPurgeGroups(data.data || []);
        setShowPurgeModal(true);
      } else {
        showMessage('error', data.error || 'Error al cargar grupos');
      }
    } catch (err) {
      showMessage('error', 'Error de conexión');
    }
  };

  const togglePurgeGroup = (id) => {
    setSelectedPurgeGroups(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const handlePurge = async () => {
    if (selectedPurgeGroups.length === 0) return;

    // Triple confirmación para acción destructiva
    if (!window.confirm(
      `⚠️ PURGAR TABLAS\n\n` +
      `Va a eliminar TODOS los datos de ${selectedPurgeGroups.length} grupo(s) seleccionado(s).\n\n` +
      `Se creará un backup automático antes de purgar.\n\n` +
      `¿Desea continuar?`
    )) return;

    if (!window.confirm(
      `🔴 CONFIRMACIÓN FINAL\n\n` +
      `Esta acción ELIMINARÁ PERMANENTEMENTE los datos seleccionados.\n` +
      `El backup de seguridad permitirá restaurar si es necesario.\n\n` +
      `¿Está COMPLETAMENTE SEGURO?`
    )) return;

    setPurging(true);
    setPurgeResult(null);
    try {
      const res = await fetch(`${API_BASE}/backup/purge`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ groups: selectedPurgeGroups }),
      });
      const data = await res.json();
      if (data.success) {
        setPurgeResult(data.data);
        showMessage('success', data.message);
        fetchBackups(); // refrescar lista de backups (se creó uno de seguridad)
      } else {
        showMessage('error', data.error || 'Error al purgar');
      }
    } catch (err) {
      showMessage('error', 'Error de conexión al purgar');
    } finally {
      setPurging(false);
    }
  };

  // ---- Tamaño total ----
  const totalSize = backups.reduce((sum, b) => sum + b.tamano, 0);

  return (
    <div className="space-y-6">
      {/* Header + Botón Crear */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Backup de Base de Datos
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Genera y administra copias de seguridad de la base de datos del sistema.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={openPurgeModal}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors shadow-sm"
          >
            <span className="text-lg">🧹</span>
            Purgar Tablas
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors shadow-sm disabled:cursor-not-allowed"
          >
            {creating ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creando backup...
              </>
            ) : (
              <>
                <span className="text-lg">💾</span>
                Crear Backup Ahora
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mensaje */}
      {message && (
        <div className={`p-4 rounded-lg text-sm font-medium ${
          message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700'
            : 'bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700'
        }`}>
          {message.type === 'success' ? '✅' : '❌'} {message.text}
        </div>
      )}

      {/* Resumen rápido */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-100 dark:border-blue-800">
          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Total Backups</p>
          <p className="text-2xl font-bold text-blue-900 dark:text-blue-200 mt-1">{backups.length}</p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-100 dark:border-purple-800">
          <p className="text-xs text-purple-600 dark:text-purple-400 font-medium uppercase tracking-wide">Espacio Usado</p>
          <p className="text-2xl font-bold text-purple-900 dark:text-purple-200 mt-1">{formatFileSize(totalSize)}</p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-100 dark:border-amber-800">
          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium uppercase tracking-wide">Último Backup</p>
          <p className="text-lg font-bold text-amber-900 dark:text-amber-200 mt-1">
            {backups.length > 0 ? formatDate(backups[0].fecha) : '—'}
          </p>
        </div>
      </div>

      {/* Tabla de backups */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-750">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Archivo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tamaño</th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    <svg className="animate-spin h-6 w-6 mx-auto mb-2 text-blue-500" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Cargando backups...
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    <span className="text-4xl block mb-2">📁</span>
                    No hay backups disponibles. Cree uno con el botón de arriba.
                  </td>
                </tr>
              ) : (
                backups.map((backup, idx) => (
                  <tr key={backup.nombre} className={idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🗄️</span>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{backup.nombre}</span>
                        {idx === 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                            Más reciente
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {formatDate(backup.fecha)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                      {formatFileSize(backup.tamano)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleDownload(backup.nombre)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors dark:text-blue-300 dark:bg-blue-900/30 dark:hover:bg-blue-900/50"
                          title="Descargar"
                        >
                          ⬇️ Descargar
                        </button>
                        <button
                          onClick={() => handleRestore(backup.nombre)}
                          disabled={restoring === backup.nombre}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md transition-colors disabled:opacity-50 dark:text-amber-300 dark:bg-amber-900/30 dark:hover:bg-amber-900/50"
                          title="Restaurar base de datos desde este backup"
                        >
                          {restoring === backup.nombre ? '⏳ Restaurando...' : '🔄 Restaurar'}
                        </button>
                        <button
                          onClick={() => handleDelete(backup.nombre)}
                          disabled={deleting === backup.nombre}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-md transition-colors disabled:opacity-50 dark:text-red-300 dark:bg-red-900/30 dark:hover:bg-red-900/50"
                          title="Eliminar"
                        >
                          {deleting === backup.nombre ? '⏳' : '🗑️'} Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info de retención */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h4 className="font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
          💡 Información sobre backups
        </h4>
        <ul className="mt-2 text-sm text-amber-700 dark:text-amber-400 space-y-1 list-disc list-inside">
          <li><strong>Retención automática:</strong> Se mantienen los últimos 10 backups. Los más antiguos se eliminan al crear uno nuevo.</li>
          <li><strong>Contenido:</strong> Cada backup incluye toda la estructura y datos de la base de datos (tablas, registros, triggers y rutinas).</li>
          <li><strong>Restaurar:</strong> Al restaurar, se crea automáticamente un backup de seguridad del estado actual antes de sobreescribir la base de datos.</li>
          <li><strong>Purgar:</strong> Permite limpiar datos transaccionales por grupo (cajas, servicios, familias, etc.) para iniciar un nuevo período.</li>
          <li><strong>Recomendación:</strong> Descargue el backup más reciente periódicamente y guárdelo en un lugar seguro fuera del servidor.</li>
        </ul>
      </div>

      {/* ===== MODAL PURGAR TABLAS ===== */}
      {showPurgeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header modal */}
            <div className="p-5 border-b border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    🧹 Purgar Tablas
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Seleccione los grupos de datos a limpiar para iniciar un nuevo período.
                  </p>
                </div>
                <button
                  onClick={() => { setShowPurgeModal(false); setPurgeResult(null); }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Advertencia */}
            <div className="mx-5 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300 font-medium">
                ⚠️ Esta acción eliminará permanentemente los datos seleccionados. Se creará un backup automático antes de purgar.
              </p>
            </div>

            {/* Lista de grupos */}
            <div className="p-5 space-y-3">
              {purgeGroups.map(group => (
                <label
                  key={group.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedPurgeGroups.includes(group.id)
                      ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-600'
                      : 'border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPurgeGroups.includes(group.id)}
                    onChange={() => togglePurgeGroup(group.id)}
                    className="mt-0.5 h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{group.label}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{group.description}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Resultado de purga */}
            {purgeResult && (
              <div className="mx-5 mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                <p className="text-sm font-medium text-green-700 dark:text-green-300 mb-2">
                  ✅ Purga completada — Backup de seguridad: {purgeResult.backup_seguridad}
                </p>
                <ul className="text-xs text-green-600 dark:text-green-400 space-y-0.5">
                  {purgeResult.details?.map((d, i) => (
                    <li key={i}>• {d}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Footer modal */}
            <div className="p-5 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
              <button
                onClick={() => { setShowPurgeModal(false); setPurgeResult(null); }}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
              >
                {purgeResult ? 'Cerrar' : 'Cancelar'}
              </button>
              {!purgeResult && (
                <button
                  onClick={handlePurge}
                  disabled={purging || selectedPurgeGroups.length === 0}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                >
                  {purging ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Purgando...
                    </>
                  ) : (
                    `Purgar ${selectedPurgeGroups.length} grupo(s)`
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BackupTab;
