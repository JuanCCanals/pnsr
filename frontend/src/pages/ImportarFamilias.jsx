// /frontend/src/pages/ImportarFamilias.jsx
import React, { useState, useEffect } from 'react';
import api, { zonasService } from '../services/api';

/**
 * ImportarFamilias.jsx
 * - PRE IMPORTACIÓN: valida el archivo en backend (/familias/import-excel/validate)
 *   y SOLO si todo está OK habilita el botón "IMPORTAR EXCEL".
 * - IMPORTAR EXCEL: llama al endpoint principal (/familias/import-excel).
 * - Incluye barra de progreso 0–100% durante la PRE IMPORTACIÓN.
 */
const ImportarFamilias = () => {
  const [file, setFile] = useState(null);
  const [zonas, setZonas] = useState([]);
  const [zonaId, setZonaId] = useState('');

  const [loadingImport, setLoadingImport] = useState(false);
  const [loadingPre, setLoadingPre] = useState(false);

  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const [canImport, setCanImport] = useState(false); // solo true si la PRE IMPORTACIÓN pasa
  const [preSummary, setPreSummary] = useState(null);

  const [preProgress, setPreProgress] = useState(0);

  const [showErrorsModal, setShowErrorsModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);

  // Cargar zonas
  useEffect(() => {
    (async () => {
      try {
        const z = await zonasService.getAll();
        if (z?.success) setZonas(z.data || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // Maneja selección de archivo
  const handleFileChange = (e) => {
    setError(null);
    setSuccessMsg(null);
    setPreSummary(null);
    setCanImport(false);
    setValidationErrors([]);
    setShowErrorsModal(false);
    setPreProgress(0);

    const selected = e.target.files[0];
    if (!selected) return;
    setFile(selected);
  };

  const handleZonaChange = (e) => {
    setZonaId(e.target.value);
    // Si cambia la zona, obligamos a hacer una nueva PRE IMPORTACIÓN
    setCanImport(false);
    setPreSummary(null);
    setError(null);
    setSuccessMsg(null);
    setValidationErrors([]);
    setShowErrorsModal(false);
    setPreProgress(0);
  };

  // PRE IMPORTACIÓN: valida en backend sin grabar nada
  const handlePreImport = async () => {
    if (!file) {
      setError('Por favor, seleccione un archivo .xlsx antes de validar.');
      return;
    }
    if (!zonaId) {
      setError('Selecciona una zona destino antes de validar.');
      return;
    }

    setLoadingPre(true);
    setError(null);
    setSuccessMsg(null);
    setPreSummary(null);
    setCanImport(false);
    setValidationErrors([]);
    setShowErrorsModal(false);
    setPreProgress(0);

    let intervalId = null;

    try {
      // Simulamos progreso mientras el backend procesa
      intervalId = setInterval(() => {
        setPreProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + 5;
        });
      }, 200);

      const formData = new FormData();
      formData.append('archivo', file);
      formData.append('zona_id', zonaId);

      const res = await api.post('/familias/import-excel/validate', formData);
      setPreProgress(100);

      setPreSummary(res.data?.resumen || null);
      setCanImport(true); // ✅ Importación habilitada
    } catch (err) {
      console.error(err);
      setPreProgress(100);

      const data = err.response?.data;
      setError(data?.message || 'Error validando archivo');

      if (data?.errores && Array.isArray(data.errores) && data.errores.length > 0) {
        setValidationErrors(data.errores);
        setShowErrorsModal(true);
      }
    } finally {
      if (intervalId) clearInterval(intervalId);
      setTimeout(() => setLoadingPre(false), 300);
    }
  };

  // IMPORTAR EXCEL (solo si PRE IMPORTACIÓN fue exitosa)
  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, seleccione un archivo .xlsx antes de importar.');
      return;
    }
    if (!zonaId) {
      setError('Selecciona una zona destino antes de importar.');
      return;
    }
    if (!canImport) {
      setError('Primero ejecuta la PRE IMPORTACIÓN y corrige cualquier error antes de importar.');
      return;
    }

    setLoadingImport(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append('archivo', file);
      formData.append('zona_id', zonaId);

      const res = await api.post('/familias/import-excel', formData);
      setSuccessMsg(res.data.message || 'Importación completada con éxito');

      // Después de una importación exitosa, reseteamos estados
      setFile(null);
      setZonaId('');
      setCanImport(false);
      setPreSummary(null);
      setPreProgress(0);
      setValidationErrors([]);
      setShowErrorsModal(false);

      // Limpiar input file visualmente
      const input = document.getElementById('input-excel-familias');
      if (input) input.value = '';
    } catch (err) {
      console.error(err);
      const data = err.response?.data;
      setError(data?.message || 'Error importando familias');

      if (data?.errores && Array.isArray(data.errores) && data.errores.length > 0) {
        setValidationErrors(data.errores);
        setShowErrorsModal(true);
      }
    } finally {
      setLoadingImport(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Importar Familias</h2>

      <div className="mb-4">
        <input
          id="input-excel-familias"
          type="file"
          accept=".xlsx"
          onChange={handleFileChange}
          className="mb-2"
        />
        {file && (
          <p className="text-sm">
            Archivo seleccionado: <strong>{file.name}</strong>
          </p>
        )}
      </div>

      <div className="mb-4">
        <label className="block mb-1 text-sm text-gray-600">Zona destino</label>
        <select
          value={zonaId}
          onChange={handleZonaChange}
          className="px-3 py-2 border rounded w-full"
        >
          <option value="">Selecciona una zona…</option>
          {zonas.map((z) => (
            <option key={z.id} value={z.id}>
              {z.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Mensajes */}
      {error && <p className="text-red-500 mb-2 text-sm">{error}</p>}
      {successMsg && <p className="text-green-600 mb-2 text-sm">{successMsg}</p>}

      {/* Barra de progreso de PRE IMPORTACIÓN */}
      {loadingPre && (
        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-1">
            Validando archivo... {preProgress}%
          </p>
          <div className="w-full bg-gray-200 rounded h-2">
            <div
              className="h-2 bg-blue-600 rounded"
              style={{ width: `${preProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Resumen de PRE IMPORTACIÓN */}
      {preSummary && (
        <div className="mb-4 text-sm border rounded p-3 bg-gray-50">
          <p className="font-semibold mb-1">Resumen de pre-importación:</p>
          <p>Familias detectadas: {preSummary.grupos}</p>
          <p>Integrantes detectados: {preSummary.integrantes}</p>
          <p>Fila de encabezados detectada: {preSummary.detected_header_row}</p>
        </div>
      )}

      {/* Botones */}
      <div className="flex flex-wrap gap-3 mt-2">
        <button
          onClick={handlePreImport}
          disabled={loadingPre || loadingImport || !file || !zonaId}
          className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 text-sm"
        >
          {loadingPre ? 'Validando...' : 'PRE IMPORTACIÓN'}
        </button>

        <button
          onClick={handleUpload}
          disabled={loadingImport || !canImport}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
        >
          {loadingImport ? 'Importando...' : 'IMPORTAR EXCEL'}
        </button>

        {!canImport && (
          <span className="text-xs text-gray-500 self-center">
            Ejecuta la PRE IMPORTACIÓN y corrige errores antes de importar.
          </span>
        )}
      </div>

      {/* Modal de errores de validación */}
      {showErrorsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded shadow-lg max-w-lg w-full p-4">
            <h3 className="text-lg font-semibold mb-2">Errores encontrados</h3>
            <p className="text-sm text-gray-700 mb-2">
              Corrige estos errores en el archivo Excel y vuelve a intentar la PRE IMPORTACIÓN.
            </p>

            <div className="max-h-64 overflow-y-auto mb-4">
              <ul className="list-disc list-inside text-sm text-gray-800">
                {validationErrors.map((err, idx) => {
                  if (err.type === 'SIN_DIRECCION') {
                    return (
                      <li key={idx}>
                        Familia <strong>{err.nro_familia || '(sin NRO_FAMILIA)'}</strong> sin
                        dirección
                        {err.row ? ` (fila Excel ${err.row})` : ''}
                      </li>
                    );
                  }
                  if (err.type === 'FALTA_COLUMNA') {
                    return (
                      <li key={idx}>
                        Falta la columna obligatoria{' '}
                        <strong>{err.columna}</strong>
                      </li>
                    );
                  }
                  return (
                    <li key={idx}>
                      {err.message || JSON.stringify(err)}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setShowErrorsModal(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportarFamilias;
