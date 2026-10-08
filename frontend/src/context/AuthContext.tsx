import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Usuario } from '../types';
import { esAppNativa } from '../services/config';
import api, { guardarSesion, limpiarSesion, tokenRefresco, Sesion } from '../services/api';

interface AuthContextType {
  usuario: Usuario | null;
  isAuthenticated: boolean;
  login: (usuario: Usuario, sesion: Sesion) => void;
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
        limpiarSesion();
      }
    }
    setLoading(false);
  }, []);

  const login = (usuarioData: Usuario, sesion: Sesion) => {
    guardarSesion(sesion);
    localStorage.setItem('usuario', JSON.stringify(usuarioData));
    setUsuario(usuarioData);
  };

  const logout = () => {
    // Avisarle al servidor revoca la sesión de verdad, no solo en este navegador:
    // sin esto el token de refresco seguiría sirviendo hasta vencer. Se hace sin
    // esperar la respuesta — cerrar sesión no puede quedar colgado de la red.
    const refresco = tokenRefresco();
    if (refresco) api.post('/auth/logout', { refresh_token: refresco }).catch(() => {});
    limpiarSesion();
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
