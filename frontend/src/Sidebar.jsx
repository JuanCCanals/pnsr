import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Logo from './assets/logo.png';
import User from './assets/User.png';
import Chart from './assets/Chart_fill.png';
import Folder from './assets/Folder.png';
import Chat from './assets/Chat.png';
import Calendar from './assets/Calendar.png';
import Search from './assets/Search.png';
import Setting from './assets/Setting.png';
import Control from './assets/control.png';

const Menus = [
  { title: 'Dashboard', src: Chart, path: '/dashboard', roles: ['admin', 'operador', 'consulta'] },
  { title: 'Zonas', src: Folder, path: '/zonas', roles: ['admin', 'operador', 'consulta'] },
  { title: 'Familias', src: Folder, path: '/familias', roles: ['admin', 'operador', 'consulta'] },
  { title: 'Campañas', src: Folder, path: '/campanias', roles: ['admin', 'operador', 'consulta'] },
  { title: 'Modalidades', src: Folder, path: '/modalidades', roles: ['admin', 'operador', 'consulta'] },
  { title: 'PuntosVenta', src: Folder, path: '/puntosventa', roles: ['admin', 'operador', 'consulta'] },
  { title: 'Ventas', src: Folder, path: '/ventas', roles: ['admin', 'operador', 'consulta'] },
  // { title: 'Importar Familias', src: Folder, path: '/importar-familias', roles: ['admin', 'operador', 'consulta'] },
  { title: 'Benefactores', src: User, path: '/benefactores', roles: ['admin', 'operador', 'consulta'] },
  { title: 'Registrar Donaciones', src: Folder, path: '/donaciones', roles: ['admin', 'operador'] },
  { title: 'Cobros', src: Calendar, path: '/cobros', roles: ['admin', 'operador'] },
  { title: 'Comprobantes', src: Folder, path: '/comprobantes', roles: ['admin', 'operador', 'consulta'] },
  { title: 'Reportes', src: Chart, path: '/reportes', roles: ['admin', 'operador', 'consulta'] },
  { title: 'Usuarios', src: User, path: '/usuarios', roles: ['admin'] },
  { title: 'Configuración', src: Setting, path: '/configuracion', roles: ['admin'] }
];

export default function Sidebar() {
  const [open, setOpen] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('theme');
    return stored ? stored === 'dark' : false;
  });

  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, hasRole } = useAuth();

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const toggleTheme = () => {
    const newTheme = !darkMode;
    setDarkMode(newTheme);
    localStorage.setItem('theme', newTheme ? 'dark' : 'light');
  };

  const handleMenuClick = (menu) => {
    if (hasRole(menu.roles)) {
      navigate(menu.path);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  // Filtrar menús según el rol del usuario
  const filteredMenus = Menus.filter(menu => hasRole(menu.roles));

  return (
    <div className={`bg-gray-800 dark:bg-gray-900 text-white p-5 pt-8 relative duration-300 ${open ? 'w-64' : 'w-20'} h-screen`}>
      <img
        src={Control}
        className={`absolute cursor-pointer -right-3 top-9 w-7 border-2 border-gray-700 rounded-full transition-transform duration-500 ${!open && 'rotate-180'}`}
        onClick={() => setOpen(!open)}
      />
      
      <div className="flex gap-x-4 items-center justify-between">
        <img
          src={Logo}
          className={`cursor-pointer duration-500 ${open ? 'w-10' : 'w-8'} ${!open && 'mx-auto'}`}
          onClick={() => navigate('/dashboard')}
        />
        {open && (
          <>
            <h1 className="text-white origin-left font-medium text-xl duration-200">PNSR</h1>
            <button onClick={toggleTheme} className="text-xl">
              {darkMode ? '🌙' : '☀️'}
            </button>
          </>
        )}
      </div>

      {!open && (
        <div className="flex justify-center mt-4">
          <button onClick={toggleTheme} className="text-xl">
            {darkMode ? '🌙' : '☀️'}
          </button>
        </div>
      )}

      {/* Información del usuario */}
      {open && user && (
        <div className="mt-6 p-3 bg-gray-700 dark:bg-gray-800 rounded-lg">
          <div className="flex items-center gap-3">
            <img src={User} className="w-8 h-8" alt="Usuario" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user.nombre}
              </p>
              <p className="text-xs text-gray-300 capitalize">
                {user.rol}
              </p>
            </div>
          </div>
        </div>
      )}

      <ul className="pt-6">
        {filteredMenus.map((menu, index) => {
          const isActive = location.pathname === menu.path;
          return (
            <li 
              key={index} 
              className={`flex items-center gap-x-4 cursor-pointer p-2 rounded-md mt-2 transition-colors duration-200 ${
                isActive 
                  ? 'bg-blue-600 text-white' 
                  : 'hover:bg-gray-700 text-gray-300 hover:text-white'
              }`}
              onClick={() => handleMenuClick(menu)}
            >
              <img src={menu.src} className="w-6 h-6" alt={menu.title} />
              <span className={`${!open && 'hidden'} origin-left duration-200`}>
                {menu.title}
              </span>
            </li>
          );
        })}
        
        {/* Separador */}
        <li className="border-t border-gray-600 mt-4 pt-4">
          <div 
            className="flex items-center gap-x-4 cursor-pointer p-2 hover:bg-gray-700 rounded-md mt-2 text-gray-300 hover:text-white transition-colors duration-200"
            onClick={handleLogout}
          >
            <span className="text-xl">🚪</span>
            <span className={`${!open && 'hidden'} origin-left duration-200`}>
              Cerrar Sesión
            </span>
          </div>
        </li>
      </ul>
    </div>
  );
}
