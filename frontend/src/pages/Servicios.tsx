import React, { useCallback, useEffect, useState } from 'react';
import { Droplets, Pencil, X, Info, Sparkles, Car } from 'lucide-react';
import api from '../services/api';
import { TipoServicio, TipoVehiculo, ServicioAdicional } from '../types';
import { IconoTipo } from '../components/FormVehiculo';
import { dinero } from '../utils/catalogo';

/**
 * Catálogo, organizado como la cartelera de un cine:
 * - Servicios: cada uno con su tabla de precios por tipo de vehículo (como una
 *   película con precio distinto por sala). Tipo sin precio = no se ofrece.
 * - Adicionales: extras que el cliente suma a la reserva (la confitería).
 * - Tipos de vehículo: moto, liviano, SUV... (las salas).
 * Nada se borra: se desactiva, así el histórico y los reportes quedan intactos.
 */

type Pestana = 'servicios' | 'adicionales' | 'tipos';

const input = 'w-full px-3 py-2 border border-slate-300 rounded-lg';

// ==================== SERVICIOS Y PRECIOS ====================

interface FilaPrecio { ofrece: boolean; precio: number; duracion_min: number }

const PanelServicios: React.FC<{ tipos: TipoVehiculo[] }> = ({ tipos }) => {
  const [servicios, setServicios] = useState<TipoServicio[]>([]);
  const [form, setForm] = useState({ nombre: '', descripcion: '', modalidad: 'expreso', orden_display: 99 });
  const [precios, setPrecios] = useState<Record<number, FilaPrecio>>({});
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

  const preciosVacios = useCallback(() => Object.fromEntries(
    tipos.map((t) => [t.id, { ofrece: false, precio: 0, duracion_min: 30 }])
  ) as Record<number, FilaPrecio>, [tipos]);

  useEffect(() => { if (!editando) setPrecios(preciosVacios()); }, [tipos, editando, preciosVacios]);

  const empezarEdicion = (s: TipoServicio) => {
    setEditando(s);
    setError('');
    setForm({ nombre: s.nombre, descripcion: s.descripcion || '', modalidad: s.modalidad, orden_display: s.orden_display ?? 99 });
    const filas = preciosVacios();
    s.precios.forEach((p) => {
      filas[p.id_tipo_vehiculo] = { ofrece: p.activo !== false, precio: p.precio, duracion_min: p.duracion_min };
    });
    setPrecios(filas);
  };

  const cancelarEdicion = () => {
    setEditando(null);
    setForm({ nombre: '', descripcion: '', modalidad: 'expreso', orden_display: 99 });
    setPrecios(preciosVacios());
    setError('');
  };

  const cambiarFila = (idTipo: number, cambios: Partial<FilaPrecio>) =>
    setPrecios((p) => ({ ...p, [idTipo]: { ...p[idTipo], ...cambios } }));

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    const filas = Object.entries(precios)
      .filter(([, f]) => f.ofrece)
      .map(([id, f]) => ({ id_tipo_vehiculo: Number(id), precio: f.precio, duracion_min: f.duracion_min }));
    if (filas.length === 0) { setError('Marque al menos un tipo de vehículo con su precio'); return; }
    setGuardando(true);
    setError('');
    try {
      const body = { ...form, precios: filas };
      if (editando) await api.put(`/servicios/${editando.id}`, body);
      else await api.post('/servicios', body);
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
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      <form onSubmit={guardar} className={`xl:col-span-2 bg-white rounded-xl shadow-sm p-5 space-y-3 h-fit ${editando ? 'ring-2 ring-sky-400' : ''}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">{editando ? 'Editar servicio' : 'Nuevo servicio'}</h2>
          {editando && (
            <button type="button" onClick={cancelarEdicion} title="Cancelar edición" className="text-slate-400 hover:text-slate-600">
              <X size={18} />
            </button>
          )}
        </div>

        <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
          placeholder="Nombre" className={input} />
        <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          placeholder="Descripción" rows={2} className={input} />
        <div className="flex gap-2">
          <select value={form.modalidad} onChange={(e) => setForm({ ...form, modalidad: e.target.value })} className={input}>
            <option value="expreso">Expreso (en el sitio)</option>
            <option value="profunda">Profunda (en bahía)</option>
          </select>
          <div className="w-24">
            <input type="number" min={0} step={1} value={form.orden_display} title="Orden en el catálogo público"
              onChange={(e) => setForm({ ...form, orden_display: parseInt(e.target.value) || 0 })} className={input} />
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700 mb-1">Precio y duración por tipo de vehículo</p>
          <p className="text-xs text-slate-500 mb-2">Desmarque los tipos a los que no se ofrece este servicio.</p>
          <div className="border border-slate-200 rounded-lg divide-y">
            {tipos.map((t) => {
              const f = precios[t.id] || { ofrece: false, precio: 0, duracion_min: 30 };
              return (
                <div key={t.id} className={`flex items-center gap-2 px-3 py-2 ${f.ofrece ? '' : 'bg-slate-50'}`}>
                  <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <input type="checkbox" checked={f.ofrece} onChange={(e) => cambiarFila(t.id, { ofrece: e.target.checked })} />
                    <IconoTipo codigo={t.codigo} size={18} className={f.ofrece ? 'text-sky-600' : 'text-slate-400'} />
                    <span className={`text-sm truncate ${f.ofrece ? 'text-slate-800' : 'text-slate-400'}`}>
                      {t.nombre}{!t.activo && ' (inactivo)'}
                    </span>
                  </label>
                  <div className="relative w-24">
                    <span className="absolute left-2 top-1.5 text-sm text-slate-400">$</span>
                    <input type="number" min={0} step={0.5} disabled={!f.ofrece} value={f.precio} aria-label={`Precio ${t.nombre}`}
                      onChange={(e) => cambiarFila(t.id, { precio: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-5 pr-1 py-1 border border-slate-300 rounded text-sm disabled:opacity-40" />
                  </div>
                  <div className="relative w-24">
                    <input type="number" min={5} step={5} disabled={!f.ofrece} value={f.duracion_min} aria-label={`Duración ${t.nombre}`}
                      onChange={(e) => cambiarFila(t.id, { duracion_min: parseInt(e.target.value) || 0 })}
                      className="w-full pl-2 pr-9 py-1 border border-slate-300 rounded text-sm disabled:opacity-40" />
                    <span className="absolute right-2 top-1.5 text-xs text-slate-400">min</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={guardando} className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700 disabled:opacity-50">
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar'}
        </button>
      </form>

      <div className="xl:col-span-3">
        {cargando ? (
          <p className="text-slate-400">Cargando...</p>
        ) : (
          <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                <tr>
                  <th className="px-4 py-3 text-left">Servicio</th>
                  {tipos.map((t) => (
                    <th key={t.id} className="px-3 py-3 text-center whitespace-nowrap">{t.nombre}</th>
                  ))}
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Editar</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {servicios.map((s) => (
                  <tr key={s.id} className={`hover:bg-slate-50 ${editando?.id === s.id ? 'bg-sky-50' : ''} ${s.activo ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{s.nombre}</span>
                      <span className={`block text-xs ${s.modalidad === 'profunda' ? 'text-purple-600' : 'text-sky-600'}`}>{s.modalidad}</span>
                    </td>
                    {tipos.map((t) => {
                      const p = s.precios.find((x) => x.id_tipo_vehiculo === t.id && x.activo !== false);
                      return (
                        <td key={t.id} className="px-3 py-3 text-center whitespace-nowrap">
                          {p ? (<><span className="font-semibold">{dinero(p.precio)}</span><span className="block text-xs text-slate-400">{p.duracion_min} min</span></>)
                            : <span className="text-slate-300">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => toggleActivo(s)} title={s.activo ? 'Clic para desactivar' : 'Clic para reactivar'}
                        className={`text-xs px-2 py-1 rounded-full ${s.activo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-200 text-slate-500 hover:bg-slate-300'}`}>
                        {s.activo ? 'activo' : 'inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => empezarEdicion(s)} title="Editar servicio" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded">
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
  );
};

// ==================== ADICIONALES ====================

const ADICIONAL_VACIO = { nombre: '', descripcion: '', precio: 0, duracion_min: 0, orden_display: 99 };

const PanelAdicionales: React.FC = () => {
  const [lista, setLista] = useState<ServicioAdicional[]>([]);
  const [form, setForm] = useState(ADICIONAL_VACIO);
  const [editando, setEditando] = useState<ServicioAdicional | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(() => {
    api.get('/adicionales').then((r) => setLista(r.data)).catch(() => setLista([]));
  }, []);
  useEffect(cargar, [cargar]);

  const cancelar = () => { setEditando(null); setForm(ADICIONAL_VACIO); setError(''); };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      if (editando) await api.put(`/adicionales/${editando.id}`, form);
      else await api.post('/adicionales', form);
      cancelar();
      cargar();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const toggle = async (a: ServicioAdicional) => {
    try { await api.put(`/adicionales/${a.id}`, { activo: !a.activo }); cargar(); } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={guardar} className={`bg-white rounded-xl shadow-sm p-5 space-y-3 h-fit ${editando ? 'ring-2 ring-sky-400' : ''}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">{editando ? 'Editar adicional' : 'Nuevo adicional'}</h2>
          {editando && <button type="button" onClick={cancelar} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>}
        </div>
        <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre (ej. Encerado express)" className={input} />
        <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripción" rows={2} className={input} />
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-xs text-slate-500">Precio</label>
            <input type="number" min={0} step={0.5} value={form.precio} onChange={(e) => setForm({ ...form, precio: parseFloat(e.target.value) || 0 })} className={input} />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500" title="Minutos que se suman a la franja reservada">Minutos extra</label>
            <input type="number" min={0} step={5} value={form.duracion_min} onChange={(e) => setForm({ ...form, duracion_min: parseInt(e.target.value) || 0 })} className={input} />
          </div>
          <div className="w-20">
            <label className="text-xs text-slate-500">Orden</label>
            <input type="number" min={0} value={form.orden_display} onChange={(e) => setForm({ ...form, orden_display: parseInt(e.target.value) || 0 })} className={input} />
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={guardando} className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700 disabled:opacity-50">
          {guardando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Guardar'}
        </button>
      </form>
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-x-auto h-fit">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Adicional</th>
              <th className="px-4 py-3 text-right">Precio</th>
              <th className="px-4 py-3 text-center">Minutos</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3 text-right">Editar</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lista.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Aún no hay adicionales. Cree el primero con el formulario.</td></tr>
            )}
            {lista.map((a) => (
              <tr key={a.id} className={a.activo ? '' : 'opacity-60'}>
                <td className="px-4 py-3"><span className="font-medium">{a.nombre}</span><span className="block text-xs text-slate-400">{a.descripcion}</span></td>
                <td className="px-4 py-3 text-right font-semibold">{dinero(a.precio)}</td>
                <td className="px-4 py-3 text-center">{a.duracion_min > 0 ? `+${a.duracion_min}` : '—'}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggle(a)} className={`text-xs px-2 py-1 rounded-full ${a.activo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                    {a.activo ? 'activo' : 'inactivo'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => { setEditando(a); setForm({ nombre: a.nombre, descripcion: a.descripcion || '', precio: a.precio, duracion_min: a.duracion_min, orden_display: a.orden_display ?? 99 }); }}
                    className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"><Pencil size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== TIPOS DE VEHÍCULO ====================

const PanelTipos: React.FC<{ tipos: TipoVehiculo[]; recargar: () => void }> = ({ tipos, recargar }) => {
  const [form, setForm] = useState({ nombre: '', descripcion: '', orden_display: 99 });
  const [editando, setEditando] = useState<TipoVehiculo | null>(null);
  const [error, setError] = useState('');

  const cancelar = () => { setEditando(null); setForm({ nombre: '', descripcion: '', orden_display: 99 }); setError(''); };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editando) await api.put(`/tipos-vehiculo/${editando.id}`, form);
      else await api.post('/tipos-vehiculo', form);
      cancelar();
      recargar();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const toggle = async (t: TipoVehiculo) => {
    if (t.activo && !window.confirm(`¿Desactivar "${t.nombre}"?\n\nNo se podrán registrar vehículos nuevos de este tipo ni reservar con los existentes.`)) return;
    try { await api.put(`/tipos-vehiculo/${t.id}`, { activo: !t.activo }); recargar(); } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={guardar} className={`bg-white rounded-xl shadow-sm p-5 space-y-3 h-fit ${editando ? 'ring-2 ring-sky-400' : ''}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">{editando ? 'Editar tipo' : 'Nuevo tipo de vehículo'}</h2>
          {editando && <button type="button" onClick={cancelar} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>}
        </div>
        <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre (ej. Van)" className={input} />
        <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripción (ej. Furgonetas de hasta 12 pasajeros)" className={input} />
        <div>
          <label className="text-xs text-slate-500">Orden</label>
          <input type="number" min={0} value={form.orden_display} onChange={(e) => setForm({ ...form, orden_display: parseInt(e.target.value) || 0 })} className={input} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700">{editando ? 'Guardar cambios' : 'Guardar'}</button>
        <p className="text-xs text-slate-500">Después de crear un tipo, asígnele precios en la pestaña <b>Servicios y precios</b>.</p>
      </form>
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-x-auto h-fit">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Tipo</th>
              <th className="px-4 py-3 text-center">Vehículos</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3 text-right">Editar</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tipos.map((t) => (
              <tr key={t.id} className={t.activo ? '' : 'opacity-60'}>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2 font-medium"><IconoTipo codigo={t.codigo} size={18} className="text-sky-600" /> {t.nombre}</span>
                  <span className="block text-xs text-slate-400">{t.descripcion}</span>
                </td>
                <td className="px-4 py-3 text-center">{t._count?.vehiculos ?? 0}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggle(t)} className={`text-xs px-2 py-1 rounded-full ${t.activo ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                    {t.activo ? 'activo' : 'inactivo'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => { setEditando(t); setForm({ nombre: t.nombre, descripcion: t.descripcion || '', orden_display: t.orden_display ?? 99 }); }}
                    className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"><Pencil size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== PÁGINA ====================

const Servicios: React.FC = () => {
  const [pestana, setPestana] = useState<Pestana>('servicios');
  const [tipos, setTipos] = useState<TipoVehiculo[]>([]);

  const cargarTipos = useCallback(() => {
    api.get('/tipos-vehiculo').then((r) => setTipos(r.data)).catch(() => setTipos([]));
  }, []);
  useEffect(cargarTipos, [cargarTipos]);

  const PESTANAS: { id: Pestana; label: string; icon: React.ReactNode }[] = [
    { id: 'servicios', label: 'Servicios y precios', icon: <Droplets size={16} /> },
    { id: 'adicionales', label: 'Adicionales', icon: <Sparkles size={16} /> },
    { id: 'tipos', label: 'Tipos de vehículo', icon: <Car size={16} /> }
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Droplets className="text-sky-600" /> Servicios
      </h1>

      <div className="flex gap-1 border-b border-slate-200 mb-5 overflow-x-auto">
        {PESTANAS.map((p) => (
          <button key={p.id} onClick={() => setPestana(p.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition ${
              pestana === p.id ? 'border-sky-600 text-sky-700 font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-100 rounded-lg p-3 mb-4">
        <Info size={15} className="shrink-0 mt-0.5" />
        <span>
          {pestana === 'servicios' && <>El precio y la duración dependen del <b>tipo de vehículo</b>. Un servicio sin precio para un tipo no se le ofrece a ese tipo (por ejemplo, limpieza profunda para motos). Los servicios no se borran: se <b>desactivan</b>.</>}
          {pestana === 'adicionales' && <>Extras que el cliente puede sumar al reservar. Suman su precio al total y sus minutos a la franja. Los planes de edificio no cubren adicionales.</>}
          {pestana === 'tipos' && <>El tipo es obligatorio al registrar un vehículo. Los vehículos anteriores a este cambio sin tipo se completan al reservar.</>}
        </span>
      </div>

      {pestana === 'servicios' && <PanelServicios tipos={tipos} />}
      {pestana === 'adicionales' && <PanelAdicionales />}
      {pestana === 'tipos' && <PanelTipos tipos={tipos} recargar={cargarTipos} />}
    </div>
  );
};

export default Servicios;
