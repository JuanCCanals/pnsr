// frontend/src/Sidebar.jsx
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Logo from './assets/logo.png';
import User from './assets/User.png';
import Chart from './assets/Chart_fill.png';
import Folder from './assets/Folder.png';
import Calendar from './assets/Calendar.png';
import Setting from './assets/Setting.png';
import Control from './assets/control.png';

// Menú items con permisos asociados
// IMPORTANTE: permSlug debe coincidir con el prefijo de los slugs en tabla permisos
// Ejemplo: permSlug 'zonas' matchea 'zonas_crear', 'zonas_leer', etc.
const Menus = [
  { title: 'Dashboard', src: Chart, path: '/dashboard' },

  // Cajas del Amor
  { title: 'Zonas', src: Folder, path: '/zonas', permSlug: 'zonas' },
  { title: 'Familias', src: Folder, path: '/familias', permSlug: 'familias' },
  { title: 'Campañas', src: Folder, path: '/campanias', permSlug: 'campanias' },
  { title: 'Modalidades', src: Folder, path: '/modalidades', permSlug: 'modalidades' },
  { title: 'Puntos Venta', src: Folder, path: '/puntosventa', permSlug: 'puntos_venta' },
  { title: 'Gestión', src: Folder, path: '/gestion', permSlug: 'venta_cajas' },        // FIX: era 'gestion_ventas'
  { title: 'Donaciones', src: Folder, path: '/donaciones', permSlug: 'donaciones' },

  // Servicios parroquiales
  { title: 'Servicios', src: Folder, path: '/servicios', permSlug: 'servicios' },
  { title: 'Registrar Servicios', src: Calendar, path: '/registrar-servicios', permSlug: 'registrar_servicios' },

  // Reportes
  { title: 'Comprobantes', src: Folder, path: '/comprobantes', permSlug: 'comprobantes' },
  { title: 'Reportes', src: Chart, path: '/reportes', permSlug: 'reportes' },

  // Administración
  { title: 'Usuarios', src: User, path: '/usuarios', permSlug: 'usuarios' },
  { title: 'Configuración', src: Setting, path: '/configuracion', permSlug: 'configuracion' },
];

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('theme');
    return stored ? stored === 'dark' : false;
  });

  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setOpen(false);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const toggleTheme = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  // Obtener nombre del rol para mostrar
  const getRolNombre = () => {
    if (!user) return '';
    if (typeof user.rol === 'object' && user.rol !== null) {
      return user.rol.nombre || user.rol.slug || '';
    }
    return user.rol || '';
  };

  // ✅ FIX: Verificar si el usuario tiene permiso para un módulo
  const hasPermission = (permSlug) => {
    if (!permSlug) return true; // Dashboard u otros sin permiso requerido
    if (!user) return false;

    // Si es admin, tiene acceso a todo
    if (typeof user.rol === 'object' && user.rol?.es_admin) return true;
    if (user.rol === 'admin') return true;

    // Wildcard
    if (user.permisos?.includes('*')) return true;

    // ✅ FIX CRÍTICO: Buscar con GUIÓN BAJO (formato de la BD: zonas_leer, familias_crear)
    // También buscar con PUNTO por compatibilidad
    return user.permisos?.some(p => 
      p.startsWith(`${permSlug}_`) || p.startsWith(`${permSlug}.`)
    ) || false;
  };

  const handleMenuClick = (menu) => {
    if (hasPermission(menu.permSlug)) {
      navigate(menu.path);
      if (isMobile) {
        setMobileMenuOpen(false);
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Filtrar menús según permisos
  const filteredMenus = Menus.filter((menu) => hasPermission(menu.permSlug));

  // ===== Vista móvil =====
  if (isMobile) {
    return (
      <>
        {/* Header móvil */}
        <div className="fixed top-0 left-0 right-0 bg-gray-800 dark:bg-gray-900 text-white p-4 flex items-center justify-between z-50 h-16">
          <img src={Logo} className="w-8 h-8" alt="logo" />
          <h1 className="text-white font-medium text-lg flex-1 ml-4">PNSR</h1>
          <button onClick={toggleTheme} className="text-xl mr-4">
            {darkMode ? '🌙' : '☀️'}
          </button>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-2xl focus:outline-none">
            ☰
          </button>
        </div>

        {/* Overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Menú lateral móvil */}
        <div
          className={`fixed top-16 left-0 bottom-0 w-64 bg-gray-800 dark:bg-gray-900 text-white overflow-y-auto transition-transform duration-300 z-40 ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {/* Info usuario */}
          {user && (
            <div className="p-4 bg-gray-700 dark:bg-gray-800 m-4 rounded-lg">
              <div className="flex items-center gap-3">
                <img src={User} className="w-8 h-8" alt="Usuario" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{user.nombre}</p>
                  <p className="text-xs text-gray-300">
                    {getRolNombre()}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Menú items */}
          <ul className="p-4 space-y-2">
            {filteredMenus.map((menu, index) => {
              const isActive = location.pathname === menu.path;
              return (
                <li
                  key={index}
                  className={`flex items-center gap-x-4 cursor-pointer p-3 rounded-md transition-colors duration-200 ${
                    isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-300 hover:text-white'
                  }`}
                  onClick={() => handleMenuClick(menu)}
                  title={menu.title}
                >
                  <img src={menu.src} className="w-5 h-5" alt={menu.title} />
                  <span className="text-sm">{menu.title}</span>
                </li>
              );
            })}

            {/* Logout */}
            <li className="border-t border-gray-600 mt-4 pt-4">
              <div
                className="flex items-center gap-x-4 cursor-pointer p-3 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors duration-200"
                onClick={handleLogout}
              >
                <span className="text-xl">🚪</span>
                <span className="text-sm">Cerrar Sesión</span>
              </div>
            </li>
          </ul>
        </div>

        <div className="pt-16" />
      </>
    );
  }

  // ===== Vista escritorio =====
  return (
    <div
      className={`bg-gray-800 dark:bg-gray-900 text-white p-5 pt-8 relative duration-300 ${
        open ? 'w-64' : 'w-20'
      } h-screen overflow-y-auto flex flex-col`}
    >
      {/* Botón toggle */}
      <img
        src={Control}
        className={`absolute cursor-pointer -right-3 top-9 w-7 border-2 border-gray-700 rounded-full transition-transform duration-500 ${
          !open && 'rotate-180'
        }`}
        onClick={() => setOpen(!open)}
        alt="toggle"
      />

      {/* Header */}
      <div className="flex gap-x-4 items-center justify-between flex-shrink-0">
        <img
          src={Logo}
          className={`cursor-pointer duration-500 ${open ? 'w-10' : 'w-8'} ${!open && 'mx-auto'}`}
          onClick={() => navigate('/dashboard')}
          alt="logo"
        />
        {open && (
          <>
            <h1 className="text-white origin-left font-medium text-xl duration-200">PNSR</h1>
            <button onClick={toggleTheme} className="text-xl flex-shrink-0">
              {darkMode ? '🌙' : '☀️'}
            </button>
          </>
        )}
      </div>

      {!open && (
        <div className="flex justify-center mt-4 flex-shrink-0">
          <button onClick={toggleTheme} className="text-xl">
            {darkMode ? '🌙' : '☀️'}
          </button>
        </div>
      )}

      {/* Info usuario */}
      {open && user && (
        <div className="mt-6 p-3 bg-gray-700 dark:bg-gray-800 rounded-lg flex-shrink-0">
          <div className="flex items-center gap-3">
            <img src={User} className="w-8 h-8 flex-shrink-0" alt="Usuario" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user.nombre}</p>
              <p className="text-xs text-gray-300">
                {getRolNombre()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Menú items */}
      <ul className="pt-6 flex-1 overflow-y-auto">
        {filteredMenus.map((menu, index) => {
          const isActive = location.pathname === menu.path;
          return (
            <li
              key={index}
              className={`flex items-center gap-x-4 cursor-pointer p-2 rounded-md mt-2 transition-colors duration-200 ${
                isActive ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-300 hover:text-white'
              }`}
              onClick={() => handleMenuClick(menu)}
              title={menu.title}
            >
              <img src={menu.src} className="w-6 h-6 flex-shrink-0" alt={menu.title} />
              <span className={`${!open && 'hidden'} origin-left duration-200 whitespace-nowrap`}>
                {menu.title}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Logout */}
      <div className="border-t border-gray-600 mt-4 pt-4 flex-shrink-0">
        <div
          className="flex items-center gap-x-4 cursor-pointer p-2 hover:bg-gray-700 rounded-md text-gray-300 hover:text-white transition-colors duration-200"
          onClick={handleLogout}
        >
          <span className="text-xl flex-shrink-0">🚪</span>
          <span className={`${!open && 'hidden'} origin-left duration-200 whitespace-nowrap`}>
            Cerrar Sesión
          </span>
        </div>
      </div>
    </div>
  );
}
