import React, { useState } from 'react';
import api from '../services/api';

/**
 * ImportarFamilias.jsx
 * Componente simplificado para subir archivo Excel de familias al backend.
 * - No parsea en cliente, solo sube al endpoint /api/familias/import-excel
 * - Estilo: TailwindCSS
 */
const ImportarFamilias = () => {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Maneja selección de archivo
  const handleFileChange = (e) => {
    setError(null);
    setSuccessMsg(null);
    const selected = e.target.files[0];
    if (!selected) return;
    setFile(selected);
  };

  // Envía archivo al backend
  const handleUpload = async () => {
    if (!file) {
      setError('Por favor, selecciona un archivo .xlsx antes de subir.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/api/familias/import-excel', formData);
      setSuccessMsg(res.data.message || 'Importación completada con éxito');
      setFile(null);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error importando familias');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-semibold mb-4">Importar Familias</h2>

      <input
        type="file"
        accept=".xlsx"
        onChange={handleFileChange}
        className="mb-4"
      />

      {file && (
        <p className="mb-2">Archivo seleccionado: <strong>{file.name}</strong></p>
      )}

      {error && <p className="text-red-500 mb-2">{error}</p>}
      {successMsg && <p className="text-green-600 mb-2">{successMsg}</p>}

      <button
        onClick={handleUpload}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? 'Subiendo...' : 'Subir Familias'}
      </button>
    </div>
  );
};

export default ImportarFamilias;
