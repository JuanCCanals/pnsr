// frontend/src/components/Configuracion/GeneralConfigTab.jsx
import React, { useState, useEffect } from 'react';
import { configuracionService } from '../../services/api';

const GeneralConfigTab = () => {
  const [footerText, setFooterText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    loadFooterText();
  }, []);

  const loadFooterText = async () => {
    try {
      setLoading(true);
      const response = await configuracionService.get('ticket_footer_text');
      if (response.success) {
        setFooterText(response.data.valor || '');
      }
    } catch (error) {
      console.error('Error cargando texto footer:', error);
      setMessage({ type: 'error', text: 'Error al cargar la configuración' });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setMessage({ type: '', text: '' });

      const response = await configuracionService.update('ticket_footer_text', footerText);
      
      if (response.success) {
        setMessage({ type: 'success', text: '✓ Configuración guardada exitosamente' });
        setTimeout(() => setMessage({ type: '', text: '' }), 3000);
      }
    } catch (error) {
      console.error('Error guardando configuración:', error);
      setMessage({ type: 'error', text: 'Error al guardar la configuración' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Título */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
          Texto Footer del Ticket
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Este texto aparecerá al pie de todos los tickets de cobro impresos.
        </p>
      </div>

      {/* Mensajes */}
      {message.text && (
        <div
          className={`rounded-md p-4 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-200'
              : 'bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Editor */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Texto del Footer
        </label>
        <textarea
          value={footerText}
          onChange={(e) => setFooterText(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
          placeholder="Ingrese el texto que aparecerá al pie del ticket..."
        />
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          Puede usar saltos de línea. El texto se mostrará centrado en el ticket.
        </p>
      </div>

      {/* Vista Previa */}
      <div className="border border-gray-200 dark:border-gray-600 rounded-md p-4 bg-gray-50 dark:bg-gray-800">
        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
          Vista previa:
        </p>
        <div className="bg-white dark:bg-gray-900 p-4 rounded border border-dashed border-gray-300 dark:border-gray-600">
          <p className="text-xs text-center text-gray-600 dark:text-gray-400 whitespace-pre-line">
            {footerText || 'El texto del footer aparecerá aquí...'}
          </p>
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-end gap-3">
        <button
          onClick={loadFooterText}
          disabled={saving}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          Restablecer
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? (
            <>
              <span className="animate-spin">⏳</span>
              Guardando...
            </>
          ) : (
            <>💾 Guardar Cambios</>
          )}
        </button>
      </div>
    </div>
  );
};

export default GeneralConfigTab;
