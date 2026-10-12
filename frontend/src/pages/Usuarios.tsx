import React, { useCallback, useEffect, useState } from 'react';
import { UserCog, KeyRound, Copy, Check } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useCiudades } from '../components/FiltroCiudad';
import { UsuarioInterno } from '../types';

/**
 * Usuarios internos: administradores y operadores.
 *
 * Cada ciudad tiene su operador, que solo ve y gestiona lo de ella. Un operador
 * sin ciudad es nacional (ve todo, como el administrador, pero no administra
 * usuarios). Las cuentas de lavadores y clientes se manejan desde sus fichas.
 */

// Contraseña provisional: se muestra una sola vez, para anotarla o dictarla
const AvisoClave: React.FC<{ username: string; clave: string; onCerrar: () => void }> = ({ username, clave, onCerrar }) => {
  const [copiado, setCopiado] = useState(false);
  const copiar = () => {
    navigator.clipboard?.writeText(clave).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }).catch(() => {});
  };
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
      <p className="text-sm text-amber-800 font-medium">Contraseña provisional de <b>{username}</b></p>
      <p className="text-xs text-amber-700 mt-1">Anótela ahora: no se puede volver a consultar.</p>
      <div className="flex items-center gap-2 mt-3 max-w-sm">
        <code className="flex-1 bg-white border border-amber-200 rounded px-3 py-2 font-mono text-base tracking-wide">{clave}</code>
        <button onClick={copiar} title="Copiar" className="p-2 text-amber-700 hover:bg-amber-100 rounded">
          {copiado ? <Check size={18} /> : <Copy size={18} />}
        </button>
        <button onClick={onCerrar} className="text-xs text-amber-700 hover:underline">Listo</button>
      </div>
    </div>
  );
};

const Usuarios: React.FC = () => {
  const { usuario: yo } = useAuth();
  const ciudades = useCiudades();
  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([]);
  const [form, setForm] = useState({ username: '', id_ciudad: '' });
  const [clave, setClave] = useState<{ username: string; clave: string } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/usuarios')
      .then((r) => setUsuarios(r.data))
      .catch(() => setUsuarios([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(cargar, [cargar]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      const r = await api.post('/usuarios', { username: form.username, id_ciudad: form.id_ciudad || null });
      if (r.data.password_temporal) setClave({ username: r.data.username, clave: r.data.password_temporal });
      setForm({ username: '', id_ciudad: form.id_ciudad });
      cargar();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const cambiar = async (u: UsuarioInterno, datos: { id_ciudad?: number | null; estado?: string }) => {
    try {
      await api.put(`/usuarios/${u.id}`, datos);
      cargar();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const alternarEstado = (u: UsuarioInterno) => {
    const suspendiendo = u.estado === 'activo';
    if (suspendiendo && !window.confirm(`¿Suspender a ${u.username}? Pierde el acceso de inmediato.`)) return;
    cambiar(u, { estado: suspendiendo ? 'inactivo' : 'activo' });
  };

  const restablecer = async (u: UsuarioInterno) => {
    if (!window.confirm(`¿Generar una contraseña nueva para ${u.username}? La actual deja de funcionar.`)) return;
    try {
      const r = await api.post(`/usuarios/${u.id}/reset`);
      setClave({ username: r.data.username, clave: r.data.password_temporal });
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <UserCog className="text-sky-600" /> Usuarios internos
      </h1>

      {clave && <AvisoClave username={clave.username} clave={clave.clave} onCerrar={() => setClave(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={crear} className="bg-white rounded-xl shadow-sm p-5 space-y-3 h-fit">
          <h2 className="font-semibold text-slate-800">Nuevo operador</h2>
          <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="Usuario (ej. operador.cuenca)" autoComplete="off"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <div>
            <label className="text-xs text-slate-500">Ciudad que atiende</label>
            <select value={form.id_ciudad} onChange={(e) => setForm({ ...form, id_ciudad: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg">
              <option value="">Nacional (todas las ciudades)</option>
              {ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={guardando}
            className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700 disabled:opacity-50">
            {guardando ? 'Creando…' : 'Crear operador'}
          </button>
          <p className="text-xs text-slate-400">
            Se genera una contraseña provisional que se muestra una sola vez. El operador de una ciudad solo ve
            las reservas, la agenda, los sitios, los lavadores, los pagos y los reportes de ella.
          </p>
        </form>

        <div className="lg:col-span-2">
          {cargando ? (
            <p className="text-slate-400">Cargando...</p>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Usuario</th>
                    <th className="px-4 py-3 text-left">Rol</th>
                    <th className="px-4 py-3 text-left">Ciudad</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-right">Contraseña</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {usuarios.map((u) => {
                    const soyYo = u.id === yo?.id;
                    return (
                      <tr key={u.id} className={`hover:bg-slate-50 ${u.estado === 'activo' ? '' : 'opacity-60'}`}>
                        <td className="px-4 py-3 font-medium">{u.username}{soyYo && <span className="text-xs text-slate-400"> (usted)</span>}</td>
                        <td className="px-4 py-3 capitalize">{u.rol}</td>
                        <td className="px-4 py-3">
                          {u.rol === 'admin' ? (
                            <span className="text-slate-500">Nacional</span>
                          ) : (
                            <select value={u.id_ciudad ?? ''} aria-label={`Ciudad de ${u.username}`}
                              onChange={(e) => cambiar(u, { id_ciudad: e.target.value ? Number(e.target.value) : null })}
                              className="px-2 py-1 border border-slate-300 rounded-lg bg-white">
                              <option value="">Nacional</option>
                              {ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => alternarEstado(u)} disabled={soyYo}
                            title={soyYo ? 'No puede suspender su propia cuenta' : u.estado === 'activo' ? 'Clic para suspender' : 'Clic para reactivar'}
                            className={`text-xs px-2 py-1 rounded-full disabled:cursor-not-allowed ${u.estado === 'activo' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>
                            {u.estado}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {u.rol === 'operador' && (
                            <button onClick={() => restablecer(u)} title="Restablecer contraseña"
                              className="p-1.5 text-amber-700 hover:bg-amber-50 rounded">
                              <KeyRound size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Usuarios;
