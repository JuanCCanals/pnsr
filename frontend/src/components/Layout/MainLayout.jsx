// frontend/src/components/Layout/MainLayout.jsx
import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../../Sidebar';

/**
 * Layout principal de la aplicación
 * Incluye el sidebar responsive y el área de contenido adaptable
 * 
 * Cambios en Fase 1:
 * - Sidebar ahora es responsive (menú hamburguesa en móvil)
 * - El contenido se adapta correctamente a diferentes tamaños de pantalla
 * - Se corrigió el bug del background del sidebar en scroll
 */
const MainLayout = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sidebar - se oculta en móvil (manejado dentro de Sidebar.jsx) */}
      {!isMobile && <Sidebar />}
      {isMobile && <Sidebar />}
      
      {/* Área de contenido principal */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* En móvil, el header está en el Sidebar, así que agregamos padding */}
        <main className={`flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900 ${isMobile ? 'p-4' : 'p-6'}`}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
