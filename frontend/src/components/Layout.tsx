import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, CalendarDays, CalendarCheck, Droplets, Car,
  Users, MapPin, Wrench, BarChart3, LogOut, Menu, X, Home, Building2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface MenuItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: string[];
}

const menuItems: MenuItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard size={20} />, roles: ['admin', 'operador'] },
  { to: '/agenda', label: 'Agenda', icon: <CalendarDays size={20} />, roles: ['admin', 'operador', 'lavador'] },
  { to: '/reservas', label: 'Reservas', icon: <CalendarCheck size={20} />, roles: ['admin', 'operador'] },
  { to: '/reservar', label: 'Nueva Reserva', icon: <Droplets size={20} />, roles: ['admin', 'operador', 'cliente'] },
  { to: '/mis-reservas', label: 'Mis Reservas', icon: <Car size={20} />, roles: ['cliente'] },
  { to: '/mis-trabajos', label: 'Mis Trabajos', icon: <Wrench size={20} />, roles: ['lavador'] },
  { to: '/clientes', label: 'Clientes', icon: <Users size={20} />, roles: ['admin', 'operador'] },
  { to: '/estacionamientos', label: 'Estacionamientos', icon: <MapPin size={20} />, roles: ['admin', 'operador'] },
  { to: '/servicios', label: 'Servicios', icon: <Droplets size={20} />, roles: ['admin', 'operador'] },
  { to: '/lavadores', label: 'Lavadores', icon: <Wrench size={20} />, roles: ['admin', 'operador'] },
  { to: '/reportes', label: 'Reportes', icon: <BarChart3 size={20} />, roles: ['admin', 'operador'] },
  { to: '/planes', label: 'Planes', icon: <Building2 size={20} />, roles: ['admin', 'operador'] }
];

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { usuario, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const itemsVisibles = menuItems.filter((m) => usuario && m.roles.includes(usuario.rol));
  const inicio = usuario?.rol === 'cliente' ? '/mis-reservas' : usuario?.rol === 'lavador' ? '/mis-trabajos' : '/dashboard';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Overlay móvil */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 text-white transform transition-transform duration-200 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
          <Link to={inicio} className="flex items-center gap-2">
            <Droplets className="text-sky-400" size={26} />
            <span className="font-bold text-lg">Lavado<span className="text-sky-400">Carros</span></span>
          </Link>
          <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X size={22} />
          </button>
        </div>

        <nav className="p-3 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
          {itemsVisibles.map((item) => {
            const activo = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  activo ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{usuario?.username}</p>
              <p className="text-xs text-slate-400 capitalize">{usuario?.rol}</p>
            </div>
            <button onClick={handleLogout} title="Cerrar sesión" className="text-slate-400 hover:text-red-400">
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </aside>

      {/* Contenido */}
      <div className="lg:pl-64">
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-4 sticky top-0 z-20">
          <button className="lg:hidden text-slate-600" onClick={() => setSidebarOpen(true)}>
            <Menu size={24} />
          </button>
          <div className="hidden lg:block" />
          <Link to="/" className="flex items-center gap-2 text-sm text-slate-500 hover:text-sky-600">
            <Home size={18} /> Sitio público
          </Link>
        </header>
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
