import React, { useCallback, useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import api from '../services/api';
import { Lavador } from '../types';

const Lavadores: React.FC = () => {
  const [lavadores, setLavadores] = useState<Lavador[]>([]);
  const [form, setForm] = useState({ nombre: '', cedula: '', telefono: '' });
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/lavadores')
      .then((r) => setLavadores(r.data))
      .catch(() => setLavadores([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(cargar, [cargar]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/lavadores', form);
      setForm({ nombre: '', cedula: '', telefono: '' });
      cargar();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const toggleEstado = async (l: Lavador) => {
    try {
      await api.put(`/lavadores/${l.id}`, { estado: l.estado === 'activo' ? 'inactivo' : 'activo' });
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
        <form onSubmit={crear} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Nuevo lavador</h2>
          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Nombre completo" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })}
            placeholder="Cédula" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            placeholder="Teléfono" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
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
                    <th className="px-4 py-3 text-left">Nombre</th>
                    <th className="px-4 py-3 text-left">Cédula</th>
                    <th className="px-4 py-3 text-left">Teléfono</th>
                    <th className="px-4 py-3 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lavadores.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{l.nombre}</td>
                      <td className="px-4 py-3">{l.cedula || '—'}</td>
                      <td className="px-4 py-3">{l.telefono || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <button onClick={() => toggleEstado(l)}
                          className={`text-xs px-2 py-1 rounded-full ${l.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                          {l.estado}
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

export default Lavadores;
