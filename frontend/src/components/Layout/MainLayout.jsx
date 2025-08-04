import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../../Sidebar';

/**
 * Layout principal de la aplicación
 * Incluye el sidebar y el área de contenido
 */
const MainLayout = () => {
  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Área de contenido principal */}
      <div className="flex-1 overflow-hidden">
        <main className="h-full overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;

