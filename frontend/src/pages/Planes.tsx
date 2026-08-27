import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, Ban, Star } from 'lucide-react';
import api from '../services/api';
import { Plan, Suscripcion, Estacionamiento } from '../types';

const Planes: React.FC = () => {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [sitios, setSitios] = useState<Estacionamiento[]>([]);
  const [cargando, setCargando] = useState(true);

  const [formPlan, setFormPlan] = useState({ nombre: '', descripcion: '', precio_mensual: 0, lavados_incluidos: 10, modalidad: 'expreso' as 'expreso' | 'profunda' });
  const [asignar, setAsignar] = useState<{ id_estacionamiento: number | ''; id_plan: number | '' }>({ id_estacionamiento: '', id_plan: '' });
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    Promise.all([
      api.get('/planes'),
      api.get('/planes/suscripciones'),
      api.get('/estacionamientos')
    ])
      .then(([p, s, e]) => { setPlanes(p.data); setSuscripciones(s.data); setSitios(e.data); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  useEffect(cargar, [cargar]);

  const crearPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/planes', formPlan);
      setFormPlan({ ...formPlan, nombre: '', descripcion: '' });
      cargar();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const alternarPlan = async (plan: Plan) => {
    try {
      await api.put(`/planes/${plan.id}`, { estado: plan.estado === 'activo' ? 'inactivo' : 'activo' });
      cargar();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const asignarSuscripcion = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!asignar.id_estacionamiento || !asignar.id_plan) return;
    try {
      await api.post('/planes/suscripciones', asignar);
      setAsignar({ id_estacionamiento: '', id_plan: '' });
      cargar();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const cancelarSuscripcion = async (id: number) => {
    if (!window.confirm('¿Cancelar esta suscripción? El sitio dejará de tener lavados incluidos.')) return;
    try {
      await api.put(`/planes/suscripciones/${id}/cancelar`);
      cargar();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const sitiosSinSuscripcion = sitios.filter((s) => !suscripciones.some((sub) => sub.id_estacionamiento === s.id));

  if (cargando) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Building2 className="text-sky-600" /> Planes para edificios/condominios
      </h1>
      <p className="text-sm text-slate-500 mb-6 max-w-2xl">
        Un plan se contrata para un estacionamiento (edificio/condominio): cubre una cantidad de lavados
        expreso al mes compartidos entre todos los residentes que reservan ahí. Al agotarse el cupo del mes,
        las siguientes reservas se cobran normalmente.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <form onSubmit={crearPlan} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Nuevo plan</h2>
          <input required value={formPlan.nombre} onChange={(e) => setFormPlan({ ...formPlan, nombre: e.target.value })}
            placeholder="Nombre (ej. Plan Edificio Básico)" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={formPlan.descripcion} onChange={(e) => setFormPlan({ ...formPlan, descripcion: e.target.value })}
            placeholder="Descripción (opcional)" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-500">Precio mensual ($)</label>
              <input type="number" min={0} step="0.01" required value={formPlan.precio_mensual}
                onChange={(e) => setFormPlan({ ...formPlan, precio_mensual: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500">Lavados incluidos/mes</label>
              <input type="number" min={1} required value={formPlan.lavados_incluidos}
                onChange={(e) => setFormPlan({ ...formPlan, lavados_incluidos: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500">Modalidad</label>
            <select value={formPlan.modalidad} onChange={(e) => setFormPlan({ ...formPlan, modalidad: e.target.value as 'expreso' | 'profunda' })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg">
              <option value="expreso">Expreso</option>
              <option value="profunda">Profunda</option>
            </select>
          </div>
          <button type="submit" className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700">Crear plan</button>
        </form>

        <form onSubmit={asignarSuscripcion} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Asignar plan a un sitio</h2>
          <select required value={asignar.id_estacionamiento}
            onChange={(e) => setAsignar({ ...asignar, id_estacionamiento: e.target.value ? Number(e.target.value) : '' })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg">
            <option value="">Seleccione un estacionamiento…</option>
            {sitiosSinSuscripcion.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
          <select required value={asignar.id_plan}
            onChange={(e) => setAsignar({ ...asignar, id_plan: e.target.value ? Number(e.target.value) : '' })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg">
            <option value="">Seleccione un plan…</option>
            {planes.filter((p) => p.estado === 'activo').map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} — ${p.precio_mensual}/mes ({p.lavados_incluidos} lavados)</option>
            ))}
          </select>
          <button type="submit" disabled={sitiosSinSuscripcion.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            <Plus size={16} /> Asignar suscripción
          </button>
          {sitiosSinSuscripcion.length === 0 && (
            <p className="text-xs text-slate-400">Todos los estacionamientos ya tienen una suscripción activa.</p>
          )}
        </form>
      </div>
      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="bg-white rounded-xl shadow-sm overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Plan</th>
              <th className="px-4 py-3 text-left">Modalidad</th>
              <th className="px-4 py-3 text-left">Precio/mes</th>
              <th className="px-4 py-3 text-left">Lavados incluidos</th>
              <th className="px-4 py-3 text-left">Estado</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {planes.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">{p.nombre}</td>
                <td className="px-4 py-3 capitalize">{p.modalidad}</td>
                <td className="px-4 py-3">${p.precio_mensual.toFixed(2)}</td>
                <td className="px-4 py-3">{p.lavados_incluidos}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${p.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.estado}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => alternarPlan(p)} className="text-xs text-sky-600 hover:underline">
                    {p.estado === 'activo' ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
            {planes.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Aún no hay planes creados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="font-semibold text-slate-800 mb-3">Suscripciones activas</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {suscripciones.map((s) => (
          <div key={s.id} className="bg-white rounded-xl shadow-sm p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-800">{s.estacionamiento?.nombre}</p>
                <p className="text-sm text-slate-500">{s.plan?.nombre} · ${s.plan?.precio_mensual}/mes</p>
              </div>
              <button onClick={() => cancelarSuscripcion(s.id)} title="Cancelar suscripción" className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                <Ban size={18} />
              </button>
            </div>
            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>Uso del mes</span>
                <span>{s.uso_mes_actual ?? 0} / {s.plan?.lavados_incluidos}</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-2 bg-sky-500 rounded-full"
                  style={{ width: `${Math.min(100, ((s.uso_mes_actual ?? 0) / (s.plan?.lavados_incluidos || 1)) * 100)}%` }} />
              </div>
            </div>
          </div>
        ))}
        {suscripciones.length === 0 && <p className="text-slate-400 text-sm">Ningún sitio tiene un plan activo todavía.</p>}
      </div>

      {suscripciones.length > 0 && (
        <p className="text-xs text-slate-400 mt-4 flex items-center gap-1"><Star size={12} /> El cupo se reinicia el día 1 de cada mes.</p>
      )}
    </div>
  );
};

export default Planes;
