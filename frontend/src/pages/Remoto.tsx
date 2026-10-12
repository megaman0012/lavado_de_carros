import React, { useCallback, useEffect, useState } from 'react';
import { Truck, Route, Users, MapPinned, BarChart3, Pencil, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import FiltroCiudad, { useCiudades, useFiltroCiudad } from '../components/FiltroCiudad';
import AccionesVisita from '../components/AccionesVisita';
import { hoyISO, rangoMes, mesActual, nombreMes, desplazarMes } from '../utils/fechas';
import { dinero } from '../utils/catalogo';
import { Lavador, Sector, UnidadMovil, Visita, EstadoVisita } from '../types';

/**
 * Lavado remoto — la operación a domicilio.
 *
 *   Hoja de ruta   las visitas del día, en el orden en que sale el equipo
 *   Equipos        unidades móviles: horario, lavadores, si llevan agua/energía
 *   Sectores       zonas de la ciudad con su traslado y su recargo
 *   Productividad  visitas, traslado vs trabajo, fallidas y sus causas
 *
 * El equipo queda ocupado de la salida al regreso: traslado + lavado + traslado.
 */

const coloresVisita: Record<EstadoVisita, string> = {
  programada: 'bg-amber-100 text-amber-700',
  en_camino: 'bg-sky-100 text-sky-700',
  en_sitio: 'bg-indigo-100 text-indigo-700',
  completada: 'bg-green-100 text-green-700',
  fallida: 'bg-orange-100 text-orange-700',
  cancelada: 'bg-slate-200 text-slate-500'
};

type Filtro = ReturnType<typeof useFiltroCiudad>;

// ==================== HOJA DE RUTA ====================
const HojaDeRuta: React.FC<{ filtro: Filtro }> = ({ filtro }) => {
  const [fecha, setFecha] = useState(hoyISO());
  const [visitas, setVisitas] = useState<Visita[]>([]);
  const [cargando, setCargando] = useState(true);
  const { idCiudad } = filtro;

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/visitas', { params: { fecha, ...(idCiudad && { id_ciudad: idCiudad }) } })
      .then((r) => setVisitas(r.data))
      .catch(() => setVisitas([]))
      .finally(() => setCargando(false));
  }, [fecha, idCiudad]);
  useEffect(cargar, [cargar]);

  return (
    <div>
      <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} aria-label="Día"
        className="px-3 py-2 border border-slate-300 rounded-lg mb-4" />
      {cargando ? <p className="text-slate-400">Cargando…</p> : visitas.length === 0 ? (
        <p className="text-slate-500">No hay visitas a domicilio para este día.</p>
      ) : (
        <div className="space-y-3">
          {visitas.map((v) => (
            <div key={v.id} className="bg-white rounded-xl shadow-sm p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">
                    {v.hora_salida} → {v.hora_inicio}–{v.hora_fin} → {v.hora_regreso}
                    <span className="ml-2 font-mono text-xs text-slate-400">{v.codigo}</span>
                  </p>
                  <p className="text-sm text-slate-600">🏠 {v.direccion}{v.referencia && <span className="text-slate-400"> · {v.referencia}</span>}</p>
                  <p className="text-xs text-slate-500">
                    {v.sector?.nombre} · {v.traslado_min} min de traslado · {v.unidad?.nombre} · {v.cliente?.nombre}
                    {v.contacto_telefono && ` · 📞 ${v.contacto_telefono}`}
                    {v.recargo > 0 && ` · recargo ${dinero(v.recargo)}`}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {(v.reservas || []).map((r) => `${r.vehiculo?.placa} (${r.tipoServicio?.nombre}, ${r.estado.replace('_', ' ')})`).join(' · ')}
                  </p>
                  {v.motivo_falla && <p className="text-xs text-orange-700 mt-1">Fallida: {v.motivo_falla}</p>}
                  {v.llegada_en && (
                    <p className="text-xs text-emerald-700 mt-1">
                      Llegó {new Date(v.llegada_en).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}
                      {v.llegada_latitud == null && ' (sin GPS)'}
                    </p>
                  )}
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${coloresVisita[v.estado]}`}>{v.estado.replace('_', ' ')}</span>
              </div>
              <div className="mt-3"><AccionesVisita visita={v} onDone={cargar} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ==================== EQUIPOS ====================
const EQUIPO_VACIO = {
  nombre: '', id_ciudad: 0, capacidad: 1, horario_inicio: '07:00', horario_fin: '18:00',
  lleva_agua: false, lleva_energia: false, estado: 'activo' as UnidadMovil['estado'], lavadores: [] as number[]
};

const Equipos: React.FC<{ filtro: Filtro }> = ({ filtro }) => {
  const ciudades = useCiudades();
  const [equipos, setEquipos] = useState<UnidadMovil[]>([]);
  const [lavadores, setLavadores] = useState<Lavador[]>([]);
  const [form, setForm] = useState(EQUIPO_VACIO);
  const [editando, setEditando] = useState<number | null>(null);
  const [error, setError] = useState('');
  const { idCiudad } = filtro;
  const ciudadForm = form.id_ciudad || idCiudad || 0;

  const cargar = useCallback(() => {
    api.get('/unidades', { params: idCiudad ? { id_ciudad: idCiudad } : {} }).then((r) => setEquipos(r.data)).catch(() => setEquipos([]));
  }, [idCiudad]);
  useEffect(cargar, [cargar]);
  useEffect(() => {
    if (!ciudadForm) { setLavadores([]); return; }
    api.get('/lavadores', { params: { id_ciudad: ciudadForm, estado: 'activo' } }).then((r) => setLavadores(r.data)).catch(() => setLavadores([]));
  }, [ciudadForm]);

  const editar = (u: UnidadMovil) => {
    setEditando(u.id);
    setError('');
    setForm({
      nombre: u.nombre, id_ciudad: u.id_ciudad, capacidad: u.capacidad, horario_inicio: u.horario_inicio, horario_fin: u.horario_fin,
      lleva_agua: u.lleva_agua, lleva_energia: u.lleva_energia, estado: u.estado, lavadores: (u.lavadores || []).map((l) => l.id)
    });
  };
  const cancelar = () => { setEditando(null); setForm(EQUIPO_VACIO); setError(''); };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const datos = { ...form, id_ciudad: ciudadForm };
      if (editando) await api.put(`/unidades/${editando}`, datos);
      else await api.post('/unidades', datos);
      cancelar();
      cargar();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const alternarLavador = (id: number) => setForm({
    ...form, lavadores: form.lavadores.includes(id) ? form.lavadores.filter((x) => x !== id) : [...form.lavadores, id]
  });
  const campo = 'w-full px-3 py-2 border border-slate-300 rounded-lg';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <form onSubmit={guardar} className={`bg-white rounded-xl shadow-sm p-5 space-y-3 h-fit ${editando ? 'ring-2 ring-sky-400' : ''}`}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">{editando ? 'Editar equipo' : 'Nuevo equipo móvil'}</h2>
          {editando && <button type="button" onClick={cancelar} className="text-slate-400"><X size={18} /></button>}
        </div>
        <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre (ej. Equipo GYE 1)" className={campo} />
        {!filtro.fija && (
          <select required value={ciudadForm || ''} onChange={(e) => setForm({ ...form, id_ciudad: Number(e.target.value), lavadores: [] })} className={campo}>
            <option value="" disabled>Ciudad…</option>
            {ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        )}
        <div className="grid grid-cols-3 gap-2">
          <div><label className="text-xs text-slate-500">Desde</label>
            <input type="time" value={form.horario_inicio} onChange={(e) => setForm({ ...form, horario_inicio: e.target.value })} className={campo} /></div>
          <div><label className="text-xs text-slate-500">Hasta</label>
            <input type="time" value={form.horario_fin} onChange={(e) => setForm({ ...form, horario_fin: e.target.value })} className={campo} /></div>
          <div><label className="text-xs text-slate-500">Carros a la vez</label>
            <input type="number" min={1} max={10} value={form.capacidad} onChange={(e) => setForm({ ...form, capacidad: parseInt(e.target.value) || 1 })} className={campo} /></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.lleva_agua} onChange={(e) => setForm({ ...form, lleva_agua: e.target.checked })} /> Lleva agua propia</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.lleva_energia} onChange={(e) => setForm({ ...form, lleva_energia: e.target.checked })} /> Lleva energía (generador)</label>
        <p className="text-xs text-slate-400 -mt-2">Si los lleva, el cliente no necesita confirmar toma de agua o de luz.</p>
        {editando && (
          <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as UnidadMovil['estado'] })} className={campo}>
            <option value="activo">Activo</option><option value="mantenimiento">En mantenimiento</option><option value="inactivo">Inactivo</option>
          </select>
        )}
        <div>
          <p className="text-xs text-slate-500 mb-1">Lavadores del equipo (dejan de sumar al expreso de la ciudad)</p>
          {lavadores.length === 0 ? <p className="text-xs text-slate-400">Elija la ciudad para ver sus lavadores.</p> : (
            <div className="flex flex-wrap gap-2">
              {lavadores.map((l) => (
                <button type="button" key={l.id} onClick={() => alternarLavador(l.id)} aria-pressed={form.lavadores.includes(l.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border ${form.lavadores.includes(l.id) ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-300 text-slate-600'}`}>
                  {l.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700">{editando ? 'Guardar cambios' : 'Crear equipo'}</button>
      </form>
      <div className="lg:col-span-2 space-y-3">
        {equipos.length === 0 ? <p className="text-slate-500">Todavía no hay equipos móviles.</p> : equipos.map((u) => (
          <div key={u.id} className={`bg-white rounded-xl shadow-sm p-4 ${u.estado !== 'activo' ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-800">{u.nombre} <span className="text-xs font-normal text-slate-400">{u.ciudad?.nombre}</span></p>
                <p className="text-sm text-slate-500">
                  {u.horario_inicio}–{u.horario_fin} · {u.capacidad} carro(s) a la vez
                  {u.lleva_agua && ' · lleva agua'}{u.lleva_energia && ' · lleva energía'}
                  {u.estado !== 'activo' && ` · ${u.estado}`}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {(u.lavadores || []).length ? (u.lavadores || []).map((l) => l.nombre).join(', ') : 'Sin lavadores asignados'}
                </p>
              </div>
              <button onClick={() => editar(u)} title="Editar" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"><Pencil size={16} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==================== SECTORES ====================
const Sectores: React.FC<{ filtro: Filtro }> = ({ filtro }) => {
  const { usuario } = useAuth();
  const ciudades = useCiudades();
  const [sectores, setSectores] = useState<Sector[]>([]);
  const [form, setForm] = useState({ nombre: '', id_ciudad: 0, traslado_min: 30, recargo: 0 });
  const [editando, setEditando] = useState<number | null>(null);
  const [pct, setPct] = useState('');
  const [error, setError] = useState('');
  const { idCiudad } = filtro;
  const ciudadForm = form.id_ciudad || idCiudad || 0;

  const cargar = useCallback(() => {
    api.get('/sectores', { params: idCiudad ? { id_ciudad: idCiudad } : {} }).then((r) => setSectores(r.data)).catch(() => setSectores([]));
  }, [idCiudad]);
  useEffect(cargar, [cargar]);
  useEffect(() => {
    api.get('/parametros').then((r) => {
      const p = (r.data as { clave: string; valor: string }[]).find((x) => x.clave === 'remoto.cargo_visita_fallida_pct');
      setPct(p?.valor ?? '100');
    }).catch(() => {});
  }, []);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (editando) await api.put(`/sectores/${editando}`, form);
      else await api.post('/sectores', { ...form, id_ciudad: ciudadForm });
      setEditando(null);
      setForm({ nombre: '', id_ciudad: form.id_ciudad, traslado_min: 30, recargo: 0 });
      cargar();
    } catch (err: any) {
      setError(err.message);
    }
  };
  const alternar = async (s: Sector) => {
    try { await api.put(`/sectores/${s.id}`, { activo: s.activo === false }); cargar(); } catch (err: any) { alert(err.message); }
  };
  const guardarPct = async () => {
    try {
      await api.put('/parametros/remoto.cargo_visita_fallida_pct', { valor: pct });
      alert('Cargo por visita fallida guardado.');
    } catch (err: any) {
      alert(err.message);
    }
  };
  const campo = 'w-full px-3 py-2 border border-slate-300 rounded-lg';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-6">
        <form onSubmit={guardar} className={`bg-white rounded-xl shadow-sm p-5 space-y-3 ${editando ? 'ring-2 ring-sky-400' : ''}`}>
          <h2 className="font-semibold text-slate-800">{editando ? 'Editar sector' : 'Nuevo sector'}</h2>
          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre (ej. Samborondón)" className={campo} />
          {!filtro.fija && !editando && (
            <select required value={ciudadForm || ''} onChange={(e) => setForm({ ...form, id_ciudad: Number(e.target.value) })} className={campo}>
              <option value="" disabled>Ciudad…</option>
              {ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs text-slate-500">Traslado (min, ida)</label>
              <input type="number" min={0} max={240} value={form.traslado_min} onChange={(e) => setForm({ ...form, traslado_min: parseInt(e.target.value) || 0 })} className={campo} /></div>
            <div><label className="text-xs text-slate-500">Recargo ($ por visita)</label>
              <input type="number" min={0} step="0.01" value={form.recargo} onChange={(e) => setForm({ ...form, recargo: Number(e.target.value) || 0 })} className={campo} /></div>
          </div>
          <p className="text-xs text-slate-400">El traslado bloquea al equipo antes y después de cada visita (ida y vuelta).</p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2">
            {editando && <button type="button" onClick={() => { setEditando(null); setForm({ nombre: '', id_ciudad: 0, traslado_min: 30, recargo: 0 }); }} className="flex-1 border rounded-lg py-2 text-sm">Cancelar</button>}
            <button type="submit" className="flex-1 bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700">{editando ? 'Guardar' : 'Agregar'}</button>
          </div>
        </form>
        <div className="bg-white rounded-xl shadow-sm p-5 space-y-2">
          <h2 className="font-semibold text-slate-800">Cargo por visita fallida</h2>
          <p className="text-xs text-slate-500">Porcentaje del precio que se cobra si el equipo llega y no puede lavar.</p>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={100} value={pct} onChange={(e) => setPct(e.target.value)} disabled={usuario?.rol !== 'admin'}
              className="w-24 px-3 py-2 border border-slate-300 rounded-lg" aria-label="Porcentaje" /> %
            {usuario?.rol === 'admin' && <button onClick={guardarPct} className="text-sm bg-sky-600 text-white px-3 py-2 rounded-lg">Guardar</button>}
          </div>
        </div>
      </div>
      <div className="lg:col-span-2 bg-white rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
            <tr>
              <th className="px-4 py-3 text-left">Sector</th>
              <th className="px-4 py-3 text-right">Traslado</th>
              <th className="px-4 py-3 text-right">Recargo</th>
              <th className="px-4 py-3 text-center">Estado</th>
              <th className="px-4 py-3 text-right">Editar</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sectores.map((s) => (
              <tr key={s.id} className={s.activo === false ? 'opacity-60' : ''}>
                <td className="px-4 py-3">{s.nombre} <span className="text-xs text-slate-400">{s.ciudad?.nombre}</span></td>
                <td className="px-4 py-3 text-right tabular-nums">{s.traslado_min} min</td>
                <td className="px-4 py-3 text-right tabular-nums">{dinero(s.recargo)}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => alternar(s)} className={`text-xs px-2 py-1 rounded-full ${s.activo !== false ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                    {s.activo !== false ? 'activo' : 'inactivo'}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => { setEditando(s.id); setForm({ nombre: s.nombre, id_ciudad: s.id_ciudad, traslado_min: s.traslado_min, recargo: s.recargo }); }}
                    className="p-1.5 text-sky-600 hover:bg-sky-50 rounded" title="Editar"><Pencil size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sectores.length === 0 && <p className="p-4 text-sm text-slate-500">Todavía no hay sectores.</p>}
      </div>
    </div>
  );
};

// ==================== PRODUCTIVIDAD ====================
type FilaProd = { nombre: string; visitas: number; completadas: number; fallidas: number; carros: number; min_traslado: number; min_trabajo: number; recargos: number; ingresos: number };

const Productividad: React.FC<{ filtro: Filtro }> = ({ filtro }) => {
  const [mes, setMes] = useState(mesActual());
  const [datos, setDatos] = useState<{ por_equipo: FilaProd[]; por_sector: FilaProd[]; causas_fallidas: { motivo: string; cantidad: number }[] } | null>(null);
  const { idCiudad } = filtro;
  useEffect(() => {
    api.get('/visitas/reporte', { params: { ...rangoMes(mes), ...(idCiudad && { id_ciudad: idCiudad }) } })
      .then((r) => setDatos(r.data)).catch(() => setDatos(null));
  }, [mes, idCiudad]);

  const tabla = (titulo: string, filas: FilaProd[]) => (
    <div className="bg-white rounded-xl shadow-sm p-5 overflow-x-auto">
      <h3 className="font-semibold text-slate-800 mb-2">{titulo}</h3>
      {filas.length === 0 ? <p className="text-sm text-slate-500">Sin visitas en el mes.</p> : (
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500 border-b">
            <tr>
              <th className="text-left py-2 pr-3">Nombre</th>
              <th className="text-right py-2 px-2">Visitas</th>
              <th className="text-right py-2 px-2">Fallidas</th>
              <th className="text-right py-2 px-2">Carros</th>
              <th className="text-right py-2 px-2" title="Minutos de traslado sobre el total del equipo fuera">Traslado</th>
              <th className="text-right py-2 px-2">Recargos</th>
              <th className="text-right py-2 pl-2">Ingresos</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filas.map((f) => {
              const total = f.min_traslado + f.min_trabajo;
              return (
                <tr key={f.nombre}>
                  <td className="py-2 pr-3">{f.nombre}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{f.visitas}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{f.fallidas}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{f.carros}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{total ? `${Math.round((f.min_traslado / total) * 100)}%` : '—'}</td>
                  <td className="py-2 px-2 text-right tabular-nums">{dinero(f.recargos)}</td>
                  <td className="py-2 pl-2 text-right tabular-nums">{dinero(f.ingresos)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <button onClick={() => setMes(desplazarMes(mes, -1))} className="px-3 py-1.5 border rounded-lg text-sm">‹</button>
        <span className="text-sm font-medium text-slate-700 min-w-[9rem] text-center">{nombreMes(mes)}</span>
        <button onClick={() => setMes(desplazarMes(mes, 1))} disabled={mes === mesActual()} className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40">›</button>
      </div>
      {datos && (
        <>
          {tabla('Por equipo', datos.por_equipo)}
          {tabla('Por sector', datos.por_sector)}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-2">Causas de visitas fallidas</h3>
            {datos.causas_fallidas.length === 0 ? <p className="text-sm text-slate-500">Ninguna en el mes.</p> : (
              <ul className="text-sm space-y-1">
                {datos.causas_fallidas.map((c) => <li key={c.motivo} className="flex justify-between"><span>{c.motivo}</span><b>{c.cantidad}</b></li>)}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ==================== PÁGINA ====================
const PESTANAS = [
  { id: 'ruta', label: 'Hoja de ruta', icono: <Route size={16} /> },
  { id: 'equipos', label: 'Equipos', icono: <Users size={16} /> },
  { id: 'sectores', label: 'Sectores', icono: <MapPinned size={16} /> },
  { id: 'productividad', label: 'Productividad', icono: <BarChart3 size={16} /> }
] as const;

const Remoto: React.FC = () => {
  const filtro = useFiltroCiudad();
  const [pestana, setPestana] = useState<typeof PESTANAS[number]['id']>('ruta');
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Truck className="text-sky-600" /> Lavado remoto
        </h1>
        <FiltroCiudad filtro={filtro} />
      </div>
      <div className="flex gap-1 border-b mb-6 overflow-x-auto">
        {PESTANAS.map((p) => (
          <button key={p.id} onClick={() => setPestana(p.id)} aria-pressed={pestana === p.id}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${pestana === p.id ? 'border-sky-600 text-sky-700 font-medium' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            {p.icono} {p.label}
          </button>
        ))}
      </div>
      {pestana === 'ruta' && <HojaDeRuta filtro={filtro} />}
      {pestana === 'equipos' && <Equipos filtro={filtro} />}
      {pestana === 'sectores' && <Sectores filtro={filtro} />}
      {pestana === 'productividad' && <Productividad filtro={filtro} />}
    </div>
  );
};

export default Remoto;
