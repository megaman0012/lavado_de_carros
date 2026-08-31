import React, { useCallback, useEffect, useState } from 'react';
import { Droplets, Pencil, X, Info } from 'lucide-react';
import api from '../services/api';
import { TipoServicio } from '../types';

const FORM_VACIO = { nombre: '', descripcion: '', modalidad: 'expreso', duracion_min: 60, precio: 10, orden_display: 99 };

const Servicios: React.FC = () => {
  const [servicios, setServicios] = useState<TipoServicio[]>([]);
  const [form, setForm] = useState(FORM_VACIO);
  const [editando, setEditando] = useState<TipoServicio | null>(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/servicios')
      .then((r) => setServicios(r.data))
      .catch(() => setServicios([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(cargar, [cargar]);

  const empezarEdicion = (s: TipoServicio) => {
    setEditando(s);
    setError('');
    setForm({
      nombre: s.nombre,
      descripcion: s.descripcion || '',
      modalidad: s.modalidad,
      duracion_min: s.duracion_min,
      precio: s.precio,
      orden_display: s.orden_display ?? 99
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
        await api.put(`/servicios/${editando.id}`, form);
      } else {
        await api.post('/servicios', form);
      }
      cancelarEdicion();
      cargar();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const toggleActivo = async (s: TipoServicio) => {
    if (s.activo && !window.confirm(
      `¿Desactivar "${s.nombre}"?\n\nDejará de aparecer en el catálogo y no se podrán crear nuevas reservas con él. ` +
      'Las reservas ya hechas y los reportes se conservan intactos.'
    )) return;
    try {
      await api.put(`/servicios/${s.id}`, { activo: !s.activo });
      cargar();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Droplets className="text-sky-600" /> Servicios
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={guardar} className={`bg-white rounded-xl shadow-sm p-5 space-y-3 h-fit ${editando ? 'ring-2 ring-sky-400' : ''}`}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">{editando ? 'Editar servicio' : 'Nuevo servicio'}</h2>
            {editando && (
              <button type="button" onClick={cancelarEdicion} title="Cancelar edición"
                className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            )}
          </div>

          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Nombre" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            placeholder="Descripción" rows={2} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <select value={form.modalidad} onChange={(e) => setForm({ ...form, modalidad: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg">
            <option value="expreso">Expreso (en el sitio)</option>
            <option value="profunda">Profunda (en bahía)</option>
          </select>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-500">Duración (min)</label>
              <input type="number" min={15} step={5} value={form.duracion_min}
                onChange={(e) => setForm({ ...form, duracion_min: parseInt(e.target.value) || 60 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500">Precio</label>
              <input type="number" min={0} step={0.5} value={form.precio}
                onChange={(e) => setForm({ ...form, precio: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
            <div className="w-20">
              <label className="text-xs text-slate-500" title="Orden en el catálogo público">Orden</label>
              <input type="number" min={0} step={1} value={form.orden_display}
                onChange={(e) => setForm({ ...form, orden_display: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={guardando}
            className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700 disabled:opacity-50">
            {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar'}
          </button>
        </form>

        <div className="lg:col-span-2">
          <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-100 rounded-lg p-3 mb-4">
            <Info size={15} className="shrink-0 mt-0.5" />
            <span>
              Los servicios no se borran: se <b>desactivan</b>. Un servicio inactivo desaparece del catálogo y
              no admite nuevas reservas, pero el histórico y los reportes lo conservan.
            </span>
          </div>
          {cargando ? (
            <p className="text-slate-400">Cargando...</p>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 text-left">Servicio</th>
                    <th className="px-4 py-3 text-left">Modalidad</th>
                    <th className="px-4 py-3 text-center">Duración</th>
                    <th className="px-4 py-3 text-right">Precio</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                    <th className="px-4 py-3 text-right">Editar</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {servicios.map((s) => (
                    <tr key={s.id} className={`hover:bg-slate-50 ${editando?.id === s.id ? 'bg-sky-50' : ''} ${s.activo ? '' : 'opacity-60'}`}>
                      <td className="px-4 py-3">
                        <span className="font-medium">{s.nombre}</span>
                        <span className="block text-xs text-slate-400">{s.descripcion}</span>
                      </td>
                      <td className="px-4 py-3 capitalize">{s.modalidad}</td>
                      <td className="px-4 py-3 text-center">{s.duracion_min} min</td>
                      <td className="px-4 py-3 text-right font-semibold">${s.precio.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleActivo(s)}
                          title={s.activo ? 'Clic para desactivar' : 'Clic para reactivar'}
                          className={`text-xs px-2 py-1 rounded-full ${s.activo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>
                          {s.activo ? 'activo' : 'inactivo'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => empezarEdicion(s)} title="Editar servicio"
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
    </div>
  );
};

export default Servicios;
