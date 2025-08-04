import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute, { PublicRoute } from './components/ProtectedRoute';
import MainLayout from './components/Layout/MainLayout';

// Páginas
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Zonas from './pages/Zonas';
import Familias from './pages/Familias';
import Campanias from './pages/Campanias';
import Modalidades from './pages/Modalidades';
import PuntosVenta from './pages/PuntosVenta';
import Ventas from './pages/Ventas';
// import ImportarFamilias from './pages/ImportarFamilias';
import Benefactores from './pages/Benefactores';
import Donaciones from './pages/Donaciones';
import Servicios from './pages/Servicios';
import Cobros from './pages/Cobros';
import Comprobantes from './pages/Comprobantes';
import Reportes from './pages/Reportes';
import Usuarios from './pages/Usuarios';
import Configuracion from './pages/Configuracion';
import TestPage from './pages/TestPage';
import SimpleTest from './pages/SimpleTest';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            {/* Rutas públicas */}
            <Route 
              path="/login" 
              element={
                <PublicRoute>
                  <Login />
                </PublicRoute>
              } 
            />
            
            {/* Ruta de prueba sin autenticación */}
            <Route path="/test" element={<TestPage />} />
            <Route path="/simple" element={<SimpleTest />} />

            {/* Rutas protegidas */}
            <Route 
              path="/" 
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              {/* Ruta por defecto */}
              <Route index element={<Navigate to="/dashboard" replace />} />
              
              {/* Dashboard - Accesible para todos los roles */}
              <Route path="dashboard" element={<Dashboard />} />
              
              {/* Módulos de consulta - Accesibles para todos los roles */}
              <Route path="zonas" element={<Zonas />} />
              <Route path="familias" element={<Familias />} />
              <Route path="campanias" element={<Campanias />} />
              <Route path="modalidades" element={<Modalidades />} />
              <Route path="puntosventa" element={<PuntosVenta />} />
              <Route path="ventas" element={<Ventas />} />
              {/* <Route path="importar-familias" element={<ImportarFamilias />} /> */}
              <Route path="benefactores" element={<Benefactores />} />
              <Route path="comprobantes" element={<Comprobantes />} />
              <Route path="reportes" element={<Reportes />} />
              
              {/* Módulos operativos - Solo admin y operador */}
              <Route 
                path="donaciones" 
                element={
                  <ProtectedRoute requiredRole={['admin', 'operador']}>
                    <Donaciones />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="cobros" 
                element={
                  <ProtectedRoute requiredRole={['admin', 'operador']}>
                    <Servicios />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="usuarios" 
                element={
                  <ProtectedRoute requiredRole="admin">
                    <Usuarios />
                  </ProtectedRoute>
                }
              />

              {/* Configuración - Solo admin */}
              <Route 
                path="configuracion" 
                element={
                  <ProtectedRoute requiredRole="admin">
                    <Configuracion />
                  </ProtectedRoute>
                } 
              />
            </Route>

            {/* Ruta 404 */}
            <Route 
              path="*" 
              element={
                <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-800">
                  <div className="text-center">
                    <h1 className="text-6xl font-bold text-gray-400">404</h1>
                    <p className="text-xl text-gray-600 dark:text-gray-300 mt-4">
                      Página no encontrada
                    </p>
                    <button 
                      onClick={() => window.history.back()}
                      className="mt-6 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200"
                    >
                      Volver
                    </button>
                  </div>
                </div>
              } 
            />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;