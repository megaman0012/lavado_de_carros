import React, { useCallback, useEffect, useState } from 'react';
import { Droplets } from 'lucide-react';
import api from '../services/api';
import { TipoServicio } from '../types';

const Servicios: React.FC = () => {
  const [servicios, setServicios] = useState<TipoServicio[]>([]);
  const [form, setForm] = useState({ nombre: '', descripcion: '', modalidad: 'expreso', duracion_min: 60, precio: 10 });
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/servicios')
      .then((r) => setServicios(r.data))
      .catch(() => setServicios([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(cargar, [cargar]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/servicios', form);
      setForm({ ...form, nombre: '', descripcion: '' });
      cargar();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleActivo = async (s: TipoServicio) => {
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
        <form onSubmit={crear} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Nuevo servicio</h2>
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
          </div>
          <button type="submit" className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700">Guardar</button>
        </form>

        <div className="lg:col-span-2">
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
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {servicios.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="font-medium">{s.nombre}</span>
                        <span className="block text-xs text-slate-400">{s.descripcion}</span>
                      </td>
                      <td className="px-4 py-3 capitalize">{s.modalidad}</td>
                      <td className="px-4 py-3 text-center">{s.duracion_min} min</td>
                      <td className="px-4 py-3 text-right font-semibold">${s.precio.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleActivo(s)}
                          className={`text-xs px-2 py-1 rounded-full ${s.activo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                          {s.activo ? 'activo' : 'inactivo'}
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
