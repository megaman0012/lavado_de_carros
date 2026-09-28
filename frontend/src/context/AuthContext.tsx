import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Usuario } from '../types';
import { esAppNativa } from '../services/config';

interface AuthContextType {
  usuario: Usuario | null;
  isAuthenticated: boolean;
  login: (usuario: Usuario, token: string) => void;
  logout: () => void;
  hasRole: (roles: string[]) => boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Pantalla de inicio de cada rol (a donde lleva el login o el logo).
// Admin y operador usan el panel completo en la APK y en el celular, pero ahí
// arrancan en la Agenda, lo que se consulta en la calle; el Dashboard, con
// gráficos y KPIs, queda como inicio en la computadora.
export const rutaInicio = (rol?: string) => {
  if (rol === 'cliente') return '/mis-reservas';
  if (rol === 'lavador') return '/mis-trabajos';
  const celular = esAppNativa() || window.matchMedia('(max-width: 767px)').matches;
  return celular ? '/agenda' : '/dashboard';
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const usuarioData = localStorage.getItem('usuario');

    if (token && usuarioData) {
      try {
        setUsuario(JSON.parse(usuarioData));
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
      }
    }
    setLoading(false);
  }, []);

  const login = (usuarioData: Usuario, token: string) => {
    localStorage.setItem('token', token);
    localStorage.setItem('usuario', JSON.stringify(usuarioData));
    setUsuario(usuarioData);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    setUsuario(null);
  };

  const hasRole = (roles: string[]) => {
    if (!usuario) return false;
    return roles.includes(usuario.rol);
  };

  return (
    <AuthContext.Provider value={{
      usuario,
      isAuthenticated: !!usuario,
      login,
      logout,
      hasRole,
      loading
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de AuthProvider');
  }
  return context;
};
