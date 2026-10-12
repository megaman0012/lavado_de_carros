import React, { useCallback, useEffect, useState } from 'react';
import { Map, Pencil, X } from 'lucide-react';
import api from '../services/api';
import { Ciudad } from '../types';

/**
 * Ciudades donde opera el servicio.
 *
 * Todo lo demás (sitios, talleres, lavadores, operadores) cuelga de una ciudad,
 * así que esta es la primera pantalla al abrir una ciudad nueva. Una ciudad no
 * se borra: se desactiva, y deja de ofrecerse a los clientes y en los formularios.
 */

const FORM_VACIO = { nombre: '', provincia: '' };

const Ciudades: React.FC = () => {
  const [ciudades, setCiudades] = useState<Ciudad[]>([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [editando, setEditando] = useState<Ciudad | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/ciudades')
      .then((r) => setCiudades(r.data))
      .catch(() => setCiudades([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(cargar, [cargar]);

  const cancelar = () => {
    setEditando(null);
    setForm(FORM_VACIO);
    setError('');
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      if (editando) await api.put(`/ciudades/${editando.id}`, form);
      else await api.post('/ciudades', form);
      cancelar();
      cargar();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const alternar = async (c: Ciudad) => {
    const desactivando = c.activa !== false;
    if (desactivando && !window.confirm(
      `¿Desactivar ${c.nombre}?\n\nLos clientes dejarán de verla al reservar y no se podrá elegir en los formularios. ` +
      'Las reservas ya hechas no se tocan.'
    )) return;
    try {
      await api.put(`/ciudades/${c.id}`, { activa: !desactivando });
      cargar();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Map className="text-sky-600" /> Ciudades
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={guardar} className={`bg-white rounded-xl shadow-sm p-5 space-y-3 h-fit ${editando ? 'ring-2 ring-sky-400' : ''}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">{editando ? `Editar ${editando.nombre}` : 'Nueva ciudad'}</h2>
            {editando && (
              <button type="button" onClick={cancelar} title="Cancelar edición" className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            )}
          </div>
          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Nombre (ej. Cuenca)" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={form.provincia} onChange={(e) => setForm({ ...form, provincia: e.target.value })}
            placeholder="Provincia" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={guardando}
            className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700 disabled:opacity-50">
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Agregar'}
          </button>
          {!editando && (
            <p className="text-xs text-slate-400">
              Después de crearla: agregue sus sitios y su taller en <b>Estacionamientos</b>, sus lavadores en
              <b> Lavadores</b> y su operador en <b>Usuarios</b>. Los clientes la ven cuando tiene al menos un sitio activo.
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
                    <th className="px-4 py-3 text-left">Ciudad</th>
                    <th className="px-4 py-3 text-left">Provincia</th>
                    <th className="px-4 py-3 text-right">Sitios</th>
                    <th className="px-4 py-3 text-right">Lavadores</th>
                    <th className="px-4 py-3 text-right">Operadores</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-right">Editar</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ciudades.map((c) => (
                    <tr key={c.id} className={`hover:bg-slate-50 ${c.activa === false ? 'opacity-60' : ''} ${editando?.id === c.id ? 'bg-sky-50' : ''}`}>
                      <td className="px-4 py-3 font-medium">{c.nombre}</td>
                      <td className="px-4 py-3">{c.provincia || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c._count?.estacionamientos ?? 0}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c._count?.lavadores ?? 0}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{c._count?.usuarios ?? 0}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => alternar(c)} title={c.activa !== false ? 'Clic para desactivar' : 'Clic para activar'}
                          className={`text-xs px-2 py-1 rounded-full ${c.activa !== false ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>
                          {c.activa !== false ? 'activa' : 'inactiva'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setEditando(c); setForm({ nombre: c.nombre, provincia: c.provincia || '' }); setError(''); }}
                          title="Editar" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded">
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
    </div>
  );
};

export default Ciudades;
