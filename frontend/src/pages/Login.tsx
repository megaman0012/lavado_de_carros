import React, { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import api from '../services/api';
import { useAuth, rutaInicio } from '../context/AuthContext';
import Logo from '../components/Logo';

const Login: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const { login, isAuthenticated, usuario, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as any;

  // Con sesión abierta no se muestra el formulario. Antes, volver atrás desde el
  // panel caía aquí y parecía que la sesión se había perdido (seguía abierta).
  if (!loading && isAuthenticated && usuario) {
    return <Navigate to={location.state?.from?.pathname || rutaInicio(usuario.rol)} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setCargando(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      login(res.data.usuario, res.data.token);
      // replace: el login no queda en el historial, así "atrás" no vuelve a él
      navigate(location.state?.from?.pathname || rutaInicio(res.data.usuario.rol), { replace: true });
    } catch (err: any) {
      setError(err.message || 'Credenciales inválidas');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-500 to-blue-700 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <Link to="/" className="mb-3"><Logo tamano="lg" /></Link>
          <p className="text-sm text-slate-500">Inicia sesión para reservar o gestionar</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Usuario o email</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
              placeholder="admin@correo.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={cargando}
            className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white py-2.5 rounded-lg font-medium hover:bg-sky-700 disabled:opacity-50"
          >
            <LogIn size={18} />
            {cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          ¿No tienes cuenta?{' '}
          <Link to="/reservar" className="text-sky-600 hover:underline">Regístrate al reservar</Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
