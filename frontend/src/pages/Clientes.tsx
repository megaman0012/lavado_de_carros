import React, { useCallback, useEffect, useState } from 'react';
import { Users, Pencil, X, Info, UserCheck, UserX, KeyRound, Copy, Check } from 'lucide-react';
import api from '../services/api';
import { Cliente } from '../types';

const FORM_VACIO = { nombre: '', cedula: '', telefono: '', email: '', crear_acceso: true };

// Aviso con la contraseña provisional: el backend la devuelve una sola vez
const AvisoCredenciales: React.FC<{ username: string; password: string; titulo: string; onClose: () => void }> =
  ({ username, password, titulo, onClose }) => {
    const [copiado, setCopiado] = useState(false);
    const copiar = () => {
      navigator.clipboard?.writeText(password).then(() => {
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
      }).catch(() => {});
    };
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-amber-800 font-medium">{titulo}</p>
            <p className="text-xs text-amber-700 mt-1">
              Entrégueselas al cliente ahora: la contraseña no se puede volver a consultar.
            </p>
          </div>
          <button onClick={onClose} className="text-amber-600 hover:text-amber-800"><X size={16} /></button>
        </div>
        <p className="text-xs text-amber-700 mt-3">Usuario: <b>{username}</b></p>
        <div className="flex items-center gap-2 mt-1">
          <code className="flex-1 bg-white border border-amber-200 rounded px-3 py-2 font-mono text-base tracking-wide">{password}</code>
          <button onClick={copiar} title="Copiar" className="p-2 text-amber-700 hover:bg-amber-100 rounded">
            {copiado ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
      </div>
    );
  };

const Clientes: React.FC = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState(FORM_VACIO);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [credenciales, setCredenciales] = useState<{ username: string; password: string; titulo: string } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/clientes', { params: busqueda ? { busqueda } : {} })
      .then((r) => setClientes(r.data))
      .catch(() => setClientes([]))
      .finally(() => setCargando(false));
  }, [busqueda]);

  useEffect(cargar, [cargar]);

  const empezarEdicion = (c: Cliente) => {
    setEditando(c);
    setError('');
    setCredenciales(null);
    setForm({
      nombre: c.nombre,
      cedula: c.cedula || '',
      telefono: c.telefono || '',
      email: c.email || '',
      crear_acceso: false
    });
  };

  const cancelarEdicion = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setError('');
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      if (editando) {
        const { crear_acceso, ...datos } = form;
        await api.put(`/clientes/${editando.id}`, datos);
        cancelarEdicion();
      } else {
        const r = await api.post('/clientes', form);
        if (r.data.password_temporal) {
          setCredenciales({
            username: r.data.email,
            password: r.data.password_temporal,
            titulo: 'Cliente registrado con acceso al sitio'
          });
        }
        setForm(FORM_VACIO);
      }
      cargar();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const toggleEstado = async (c: Cliente) => {
    const suspendiendo = (c.estado || 'activo') === 'activo';
    if (suspendiendo && !window.confirm(
      `¿Suspender a ${c.nombre}?\n\nNo podrá ingresar al sitio ni reservar. ` +
      'Sus reservas y su historial se conservan.'
    )) return;
    try {
      if (suspendiendo) {
        await api.delete(`/clientes/${c.id}`);
      } else {
        await api.put(`/clientes/${c.id}`, { estado: 'activo' });
      }
      cargar();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const gestionarAcceso = async (c: Cliente) => {
    if (!c.email) {
      alert('Este cliente necesita un email para poder ingresar. Edítelo y agréguele uno.');
      return;
    }
    const texto = c.usuario
      ? `¿Restablecer la contraseña de ${c.nombre}? La actual dejará de funcionar.`
      : `¿Crear el acceso al sitio para ${c.nombre}? Se generará una contraseña provisional.`;
    if (!window.confirm(texto)) return;
    try {
      const r = await api.post(`/clientes/${c.id}/acceso`);
      setCredenciales({
        username: r.data.username,
        password: r.data.password_temporal,
        titulo: c.usuario ? 'Contraseña restablecida' : 'Acceso creado'
      });
      cargar();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Users className="text-sky-600" /> Clientes
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario */}
        <form onSubmit={guardar} className={`bg-white rounded-xl shadow-sm p-5 space-y-3 h-fit ${editando ? 'ring-2 ring-sky-400' : ''}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">
              {editando ? 'Editar cliente' : 'Cliente atendido en sitio'}
            </h2>
            {editando && (
              <button type="button" onClick={cancelarEdicion} title="Cancelar edición"
                className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            )}
          </div>

          {!editando && (
            <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-100 rounded-lg p-3">
              <Info size={15} className="shrink-0 mt-0.5" />
              <span>
                Los clientes normalmente se registran solos desde el sitio. Use este formulario
                para quien llega al estacionamiento o llama por teléfono sin tener cuenta.
              </span>
            </div>
          )}

          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Nombre completo" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })}
            placeholder="Cédula" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            placeholder="Teléfono" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input type="email" required={form.crear_acceso} value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder={form.crear_acceso ? 'Email (será su usuario)' : 'Email'}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg" />

          {!editando && (
            <label className="flex items-start gap-2 text-sm text-slate-600 cursor-pointer">
              <input type="checkbox" checked={form.crear_acceso}
                onChange={(e) => setForm({ ...form, crear_acceso: e.target.checked })}
                className="mt-1 accent-sky-600" />
              <span>
                Crear su acceso al sitio
                <span className="block text-xs text-slate-400">
                  Se genera una contraseña provisional para que después consulte su historial y reserve solo.
                </span>
              </span>
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={guardando}
            className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700 disabled:opacity-50">
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar cliente'}
          </button>
        </form>

        {/* Listado */}
        <div className="lg:col-span-2">
          {credenciales && (
            <AvisoCredenciales {...credenciales} onClose={() => setCredenciales(null)} />
          )}
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, email o cédula..."
            className="w-full mb-4 px-3 py-2 border border-slate-300 rounded-lg" />
          {cargando ? (
            <p className="text-slate-400">Cargando...</p>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Nombre</th>
                    <th className="px-4 py-3 text-left">Contacto</th>
                    <th className="px-4 py-3 text-left">Acceso</th>
                    <th className="px-4 py-3 text-center">Vehículos</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {clientes.map((c) => {
                    const activo = (c.estado || 'activo') === 'activo';
                    return (
                      <tr key={c.id} className={`hover:bg-slate-50 ${editando?.id === c.id ? 'bg-sky-50' : ''} ${activo ? '' : 'opacity-60'}`}>
                        <td className="px-4 py-3">
                          <span className="font-medium">{c.nombre}</span>
                          <span className="block text-xs text-slate-400">{c.cedula || 'sin cédula'}</span>
                        </td>
                        <td className="px-4 py-3">
                          {c.email || '—'}
                          <span className="block text-xs text-slate-400">{c.telefono || 'sin teléfono'}</span>
                        </td>
                        <td className="px-4 py-3">
                          {c.usuario ? (
                            <span className="text-xs bg-sky-50 text-sky-700 px-2 py-1 rounded-full inline-flex items-center gap-1">
                              <UserCheck size={13} /> {c.usuario.username}
                            </span>
                          ) : (
                            <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full inline-flex items-center gap-1">
                              <UserX size={13} /> sin acceso
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">{c.vehiculos?.length ?? 0}</td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => toggleEstado(c)}
                            title={activo ? 'Clic para suspender' : 'Clic para reactivar'}
                            className={`text-xs px-2 py-1 rounded-full ${activo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>
                            {activo ? 'activo' : 'suspendido'}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => gestionarAcceso(c)}
                              title={c.usuario ? 'Restablecer contraseña' : 'Crear acceso al sitio'}
                              className="p-1.5 text-amber-600 hover:bg-amber-50 rounded">
                              <KeyRound size={16} />
                            </button>
                            <button onClick={() => empezarEdicion(c)} title="Editar cliente"
                              className="p-1.5 text-sky-600 hover:bg-sky-50 rounded">
                              <Pencil size={16} />
                            </button>
                          </div>
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

export default Clientes;
