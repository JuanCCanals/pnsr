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

// Etiquetas de roles para mostrar al usuario
const ROLE_LABELS = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  operador: 'Operador campañas (Cajas)',
  consulta: 'Operador servicios (Sacramentos)',
};

// Permisos por rol (a nivel de frontend / menú)
const ROLE_PERMISSIONS = {
  admin: ['*'],
  supervisor: ['zonas', 'familias', 'venta_cajas', 'servicios', 'ingresos', 'reportes', 'usuarios', 'configuracion'],
  operador: ['zonas', 'familias', 'venta_cajas', 'ingresos', 'reportes'],
  consulta: ['servicios', 'ingresos', 'reportes'],
};

// Menú items con roles y permisos asociados
const Menus = [
  { title: 'Dashboard', src: Chart, path: '/dashboard', roles: ['admin', 'supervisor', 'operador', 'consulta'] },

  // Cajas del Amor (operador campañas)
  { title: 'Zonas', src: Folder, path: '/zonas', roles: ['admin', 'supervisor', 'operador'], perm: 'zonas' },
  { title: 'Familias', src: Folder, path: '/familias', roles: ['admin', 'supervisor', 'operador'], perm: 'familias' },
  { title: 'Campañas', src: Folder, path: '/campanias', roles: ['admin', 'supervisor', 'operador'] },
  { title: 'Modalidades', src: Folder, path: '/modalidades', roles: ['admin', 'supervisor', 'operador'] },
  { title: 'PuntosVenta', src: Folder, path: '/puntosventa', roles: ['admin', 'supervisor', 'operador'] },
  { title: 'Gestión', src: Folder, path: '/gestion', roles: ['admin', 'supervisor', 'operador'], perm: 'venta_cajas' },
  { title: 'Donaciones', src: Folder, path: '/donaciones', roles: ['admin', 'supervisor', 'operador'], perm: 'ingresos' },

  // Servicios parroquiales (operador servicios)
  { title: 'Servicios', src: Folder, path: '/servicios', roles: ['admin', 'consulta'], perm: 'servicios' },
  {
    title: 'Registrar Servicios',
    src: Calendar,
    path: '/registrar-servicios',
    roles: ['admin', 'consulta'],
    perm: 'ingresos',
  },

  // Otros
  { title: 'Comprobantes', src: Folder, path: '/comprobantes', roles: ['admin'] },
  { title: 'Reportes', src: Chart, path: '/reportes', roles: ['admin', 'supervisor'], perm: 'reportes' },

  // Solo administración
  { title: 'Usuarios', src: User, path: '/usuarios', roles: ['admin'], perm: 'usuarios' },
  { title: 'Configuración', src: Setting, path: '/configuracion', roles: ['admin'], perm: 'configuracion' },
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
  const { user, logout, hasRole } = useAuth();

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

  // Chequeo de permisos por rol (NO usamos user.permisos aquí)
  const can = (slug) => {
    if (!slug) return true;
    if (!user) return false;

    const role = user.rol;
    const perms = ROLE_PERMISSIONS[role] || [];
    if (perms.includes('*')) return true;
    return perms.includes(slug);
  };

  const handleMenuClick = (menu) => {
    if (hasRole(menu.roles) && can(menu.perm)) {
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

  const filteredMenus = Menus.filter((menu) => hasRole(menu.roles) && can(menu.perm));

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
                  <p className="text-xs text-gray-300 capitalize">
                    {ROLE_LABELS[user.rol] || user.rol}
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
              <p className="text-xs text-gray-300 capitalize">
                {ROLE_LABELS[user.rol] || user.rol}
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
