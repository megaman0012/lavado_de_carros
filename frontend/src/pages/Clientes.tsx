import React, { useCallback, useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import api from '../services/api';
import { Cliente } from '../types';

const Clientes: React.FC = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [form, setForm] = useState({ nombre: '', cedula: '', telefono: '', email: '' });
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/clientes', { params: busqueda ? { busqueda } : {} })
      .then((r) => setClientes(r.data))
      .catch(() => setClientes([]))
      .finally(() => setCargando(false));
  }, [busqueda]);

  useEffect(cargar, [cargar]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/clientes', form);
      setForm({ nombre: '', cedula: '', telefono: '', email: '' });
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
        <form onSubmit={crear} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Nuevo cliente</h2>
          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder="Nombre completo" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={form.cedula} onChange={(e) => setForm({ ...form, cedula: e.target.value })}
            placeholder="Cédula" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })}
            placeholder="Teléfono" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Email" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <button type="submit" className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700">Guardar</button>
        </form>

        {/* Listado */}
        <div className="lg:col-span-2">
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
                    <th className="px-4 py-3 text-left">Cédula</th>
                    <th className="px-4 py-3 text-left">Teléfono</th>
                    <th className="px-4 py-3 text-left">Email</th>
                    <th className="px-4 py-3 text-center">Vehículos</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {clientes.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{c.nombre}</td>
                      <td className="px-4 py-3">{c.cedula || '—'}</td>
                      <td className="px-4 py-3">{c.telefono || '—'}</td>
                      <td className="px-4 py-3">{c.email || '—'}</td>
                      <td className="px-4 py-3 text-center">{c.vehiculos?.length ?? 0}</td>
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

export default Clientes;
