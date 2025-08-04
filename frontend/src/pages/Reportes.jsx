import React from 'react';

const Reportes = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-700 shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Reportes
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Gestión de reportes del sistema PNSR.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-700 shadow rounded-lg p-6">
        <div className="text-center py-12">
          <span className="text-6xl">🚧</span>
          <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
            Módulo en Desarrollo
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Esta funcionalidad estará disponible próximamente.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Reportes;
