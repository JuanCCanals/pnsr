// frontend/src/pages/Configuracion.jsx
import React, { useState } from 'react';
import RolesPermisosTab from '../components/Configuracion/RolesPermisosTab';
import GeneralConfigTab from '../components/Configuracion/GeneralConfigTab';

const Configuracion = () => {
  const [activeTab, setActiveTab] = useState('roles');

  const tabs = [
    { id: 'roles', name: 'Roles y Permisos', icon: '🔐' },
    { id: 'general', name: 'Configuración General', icon: '⚙️' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-700 shadow rounded-lg p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Configuración del Sistema
        </h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Gestión de roles, permisos y configuraciones generales del sistema PNSR.
        </p>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-700 shadow rounded-lg">
        <div className="border-b border-gray-200 dark:border-gray-600">
          <nav className="flex -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 py-4 px-6 border-b-2 font-medium text-sm transition-colors
                  ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }
                `}
              >
                <span className="text-xl">{tab.icon}</span>
                {tab.name}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'roles' && <RolesPermisosTab />}
          {activeTab === 'general' && <GeneralConfigTab />}
        </div>
      </div>
    </div>
  );
};

export default Configuracion;
