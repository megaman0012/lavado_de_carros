import React, { useCallback, useEffect, useState } from 'react';
import { Wrench, Pencil, X, KeyRound, UserCheck, UserX, Info, Copy, Check } from 'lucide-react';
import api from '../services/api';
import { Lavador } from '../types';

const FORM_VACIO = { nombre: '', cedula: '', telefono: '' };

// ==================== MODAL: CUENTA DE ACCESO ====================
// Hasta ahora no había forma de darle credenciales a un lavador: los únicos
// usuarios lavador eran los del seed, así que quien se creaba desde el panel
// no podía entrar a ver "Mis trabajos".
const ModalCuenta: React.FC<{ lavador: Lavador; onClose: () => void; onDone: () => void }> = ({ lavador, onClose, onDone }) => {
  const [username, setUsername] = useState(lavador.usuario?.username || '');
  const [password, setPassword] = useState('');
  const [temporal, setTemporal] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    setMensaje('');
    try {
      const r = await api.put(`/lavadores/${lavador.id}/usuario`, {
        username,
        password: password || undefined
      });
      setTemporal(r.data.password_temporal || null);
      setMensaje(r.data.password_temporal ? 'Cuenta creada' : 'Cuenta guardada');
      setPassword('');
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const restablecer = async () => {
    if (!window.confirm('¿Generar una contraseña nueva? La actual dejará de funcionar.')) return;
    setGuardando(true);
    setError('');
    setMensaje('');
    try {
      const r = await api.post(`/lavadores/${lavador.id}/usuario/reset`);
      setTemporal(r.data.password_temporal);
      setMensaje('Contraseña restablecida');
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const copiar = () => {
    if (!temporal) return;
    navigator.clipboard?.writeText(temporal).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-800 mb-1">Cuenta de acceso</h2>
        <p className="text-sm text-slate-500 mb-4">{lavador.nombre}</p>

        {temporal ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
            <p className="text-sm text-amber-800 font-medium">{mensaje}</p>
            <p className="text-xs text-amber-700 mt-1">
              Anote esta contraseña ahora: no se puede volver a consultar.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <code className="flex-1 bg-white border border-amber-200 rounded px-3 py-2 font-mono text-base tracking-wide">{temporal}</code>
              <button onClick={copiar} title="Copiar" className="p-2 text-amber-700 hover:bg-amber-100 rounded">
                {copiado ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>
            <p className="text-xs text-amber-700 mt-2">Usuario: <b>{username}</b></p>
          </div>
        ) : (
          <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-100 rounded-lg p-3 mb-4">
            <Info size={15} className="shrink-0 mt-0.5" />
            <span>
              Con esta cuenta el lavador entra al sistema y ve la pantalla <b>Mis trabajos</b>, donde
              consulta sus asignaciones y sube la evidencia fotográfica.
            </span>
          </div>
        )}

        <form onSubmit={guardar} className="space-y-3">
          <div>
            <label className="text-xs text-slate-500">Usuario</label>
            <input required value={username} onChange={(e) => setUsername(e.target.value)}
              placeholder="ej. carlos.perez" autoComplete="off"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div>
            <label className="text-xs text-slate-500">
              Contraseña {lavador.usuario ? '(dejar vacío para no cambiarla)' : '(vacío = se genera una temporal)'}
            </label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres" autoComplete="new-password"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {mensaje && !temporal && <p className="text-sm text-green-600">{mensaje}</p>}

          <div className="flex justify-between gap-2 pt-1">
            {lavador.usuario ? (
              <button type="button" onClick={restablecer} disabled={guardando}
                className="text-sm text-amber-700 hover:bg-amber-50 px-3 py-2 rounded-lg flex items-center gap-1 disabled:opacity-50">
                <KeyRound size={16} /> Restablecer contraseña
              </button>
            ) : <span />}
            <div className="flex gap-2 ml-auto">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cerrar</button>
              <button type="submit" disabled={guardando}
                className="bg-sky-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-sky-700 disabled:opacity-50">
                {guardando ? 'Guardando…' : lavador.usuario ? 'Guardar' : 'Crear cuenta'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

// ==================== PÁGINA LAVADORES ====================
const Lavadores: React.FC = () => {
  const [lavadores, setLavadores] = useState<Lavador[]>([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [editando, setEditando] = useState<Lavador | null>(null);
  const [modalCuenta, setModalCuenta] = useState<Lavador | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/lavadores')
      .then((r) => setLavadores(r.data))
      .catch(() => setLavadores([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(cargar, [cargar]);

  const empezarEdicion = (l: Lavador) => {
    setEditando(l);
    setError('');
    setForm({ nombre: l.nombre, cedula: l.cedula || '', telefono: l.telefono || '' });
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
        await api.put(`/lavadores/${editando.id}`, form);
      } else {
        await api.post('/lavadores', form);
      }
      cancelarEdicion();
      cargar();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const toggleEstado = async (l: Lavador) => {
    const suspendiendo = l.estado === 'activo';
    if (suspendiendo && !window.confirm(
      `¿Suspender a ${l.nombre}?\n\nDos efectos:\n` +
      '• Baja la capacidad de lavados simultáneos del día (la agenda ofrecerá menos cupos).\n' +
      (l.usuario ? '• Pierde el acceso al sistema hasta que se lo reactive.\n' : '') +
      '\nSus trabajos ya registrados no se tocan.'
    )) return;
    try {
      await api.put(`/lavadores/${l.id}`, { estado: suspendiendo ? 'inactivo' : 'activo' });
      cargar();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Wrench className="text-sky-600" /> Lavadores
        <span className="text-sm font-normal text-slate-400">(definen la capacidad expresa diaria)</span>
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={guardar} className={`bg-white rounded-xl shadow-sm p-5 space-y-3 h-fit ${editando ? 'ring-2 ring-sky-400' : ''}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">{editando ? 'Editar lavador' : 'Nuevo lavador'}</h2>
            {editando && (
              <button type="button" onClick={cancelarEdicion} title="Cancelar edición"
                className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            )}
          </div>
          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Nombre completo" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })}
            placeholder="Cédula" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            placeholder="Teléfono" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={guardando}
            className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700 disabled:opacity-50">
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar'}
          </button>
          {!editando && (
            <p className="text-xs text-slate-400">
              Tras crearlo, use <b>Acceso</b> en la tabla para darle usuario y contraseña.
            </p>
          )}
        </form>

        <div className="lg:col-span-2">
          {cargando ? (
            <p className="text-slate-400">Cargando...</p>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Nombre</th>
                    <th className="px-4 py-3 text-left">Cédula</th>
                    <th className="px-4 py-3 text-left">Teléfono</th>
                    <th className="px-4 py-3 text-left">Acceso</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-right">Editar</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lavadores.map((l) => (
                    <tr key={l.id} className={`hover:bg-slate-50 ${editando?.id === l.id ? 'bg-sky-50' : ''} ${l.estado === 'activo' ? '' : 'opacity-60'}`}>
                      <td className="px-4 py-3 font-medium">{l.nombre}</td>
                      <td className="px-4 py-3">{l.cedula || '—'}</td>
                      <td className="px-4 py-3">{l.telefono || '—'}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setModalCuenta(l)}
                          title={l.usuario ? 'Gestionar la cuenta de acceso' : 'Crear la cuenta de acceso'}
                          className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${l.usuario ? 'bg-sky-50 text-sky-700 hover:bg-sky-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                          {l.usuario ? <><UserCheck size={13} /> {l.usuario.username}</> : <><UserX size={13} /> sin acceso</>}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleEstado(l)}
                          title={l.estado === 'activo' ? 'Clic para suspender' : 'Clic para reactivar'}
                          className={`text-xs px-2 py-1 rounded-full ${l.estado === 'activo' ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>
                          {l.estado}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => empezarEdicion(l)} title="Editar ficha"
                          className="p-1.5 text-sky-600 hover:bg-sky-50 rounded">
                          <Pencil size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modalCuenta && (
        <ModalCuenta
          lavador={modalCuenta}
          onClose={() => setModalCuenta(null)}
          onDone={cargar}
        />
      )}
    </div>
  );
};

export default Lavadores;
