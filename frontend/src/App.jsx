// src/App.jsx
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
import Benefactores from './pages/Benefactores';
import Donaciones from './pages/Donaciones';
import Servicios from './pages/Servicios';
import Cobros from './pages/Cobros';
import Comprobantes from './pages/Comprobantes';
import Reportes from './pages/Reportes';
import Integracion from './pages/Integracion';
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

            {/* Rutas de prueba sin autenticación */}
            <Route path="/test" element={<TestPage />} />
            <Route path="/simple" element={<SimpleTest />} />

            {/* Shell autenticado */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <MainLayout />
                </ProtectedRoute>
              }
            >
              {/* Home → Dashboard */}
              <Route index element={<Navigate to="/dashboard" replace />} />

              {/* Dashboard: libre para todos los usuarios autenticados */}
              <Route path="dashboard" element={<Dashboard />} />

              {/* ===== TODOS los módulos protegidos por PERMISO (requiredPerm) ===== */}
              {/* El permSlug debe coincidir con el prefijo en tabla permisos */}
              {/* Ej: requiredPerm="zonas" matchea zonas_leer, zonas_crear, etc. */}

              <Route
                path="zonas"
                element={
                  <ProtectedRoute requiredPerm="zonas">
                    <Zonas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="familias"
                element={
                  <ProtectedRoute requiredPerm="familias">
                    <Familias />
                  </ProtectedRoute>
                }
              />
              <Route
                path="campanias"
                element={
                  <ProtectedRoute requiredPerm="campanias">
                    <Campanias />
                  </ProtectedRoute>
                }
              />
              <Route
                path="modalidades"
                element={
                  <ProtectedRoute requiredPerm="modalidades">
                    <Modalidades />
                  </ProtectedRoute>
                }
              />
              <Route
                path="puntosventa"
                element={
                  <ProtectedRoute requiredPerm="puntos_venta">
                    <PuntosVenta />
                  </ProtectedRoute>
                }
              />
              <Route
                path="gestion"
                element={
                  <ProtectedRoute requiredPerm="venta_cajas">
                    <Ventas />
                  </ProtectedRoute>
                }
              />
              <Route
                path="donaciones"
                element={
                  <ProtectedRoute requiredPerm="donaciones">
                    <Donaciones />
                  </ProtectedRoute>
                }
              />
              <Route
                path="servicios"
                element={
                  <ProtectedRoute requiredPerm="servicios">
                    <Servicios />
                  </ProtectedRoute>
                }
              />
              <Route
                path="registrar-servicios"
                element={
                  <ProtectedRoute requiredPerm="registrar_servicios">
                    <Cobros />
                  </ProtectedRoute>
                }
              />
              <Route
                path="comprobantes"
                element={
                  <ProtectedRoute requiredPerm="comprobantes">
                    <Comprobantes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="reportes"
                element={
                  <ProtectedRoute requiredPerm="reportes">
                    <Reportes />
                  </ProtectedRoute>
                }
              />
              <Route
                path="integracion"
                element={
                  <ProtectedRoute requiredPerm="integracion">
                    <Integracion />
                  </ProtectedRoute>
                }
              />

              {/* FIX: Usuarios y Configuración ahora usan requiredPerm en vez de requiredRole="admin" */}
              {/* Así un Supervisor con permiso 'usuarios_leer' puede ver la lista */}
              <Route
                path="usuarios"
                element={
                  <ProtectedRoute requiredPerm="usuarios">
                    <Usuarios />
                  </ProtectedRoute>
                }
              />
              <Route
                path="configuracion"
                element={
                  <ProtectedRoute requiredPerm="configuracion">
                    <Configuracion />
                  </ProtectedRoute>
                }
              />
            </Route>

            {/* 404 */}
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
