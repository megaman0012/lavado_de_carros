import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, Settings, LayoutGrid, Plus, Warehouse } from 'lucide-react';
import api from '../services/api';
import { Cliente, Estacionamiento, Plaza } from '../types';
import FiltroCiudad, { useCiudades, useFiltroCiudad } from '../components/FiltroCiudad';

const GRANULARIDADES = [15, 30, 60, 90, 120];

const coloresPlaza: Record<Plaza['estado'], string> = {
  disponible: 'bg-green-50 text-green-700 border-green-300 hover:bg-green-100',
  ocupada: 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100',
  mantenimiento: 'bg-slate-100 text-slate-500 border-slate-300 hover:bg-slate-200'
};

const siguienteEstado: Record<Plaza['estado'], Plaza['estado']> = {
  disponible: 'ocupada',
  ocupada: 'mantenimiento',
  mantenimiento: 'disponible'
};

// ==================== MODAL: MAPA DE PLAZAS ====================
const ModalPlazas: React.FC<{ sitio: Estacionamiento; onClose: () => void; onDone: () => void }> = ({ sitio, onClose, onDone }) => {
  const [plazas, setPlazas] = useState<Plaza[]>([]);
  const [cargando, setCargando] = useState(true);
  const [nuevo, setNuevo] = useState<{ codigo: string; tipo: Plaza['tipo'] }>({ codigo: '', tipo: 'estacionamiento' });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    api.get(`/estacionamientos/${sitio.id}/plazas`)
      .then((r) => setPlazas(r.data))
      .catch(() => setPlazas([]))
      .finally(() => setCargando(false));
  }, [sitio.id]);

  useEffect(cargar, [cargar]);

  const cambiarEstado = async (plaza: Plaza) => {
    try {
      await api.put(`/estacionamientos/plazas/${plaza.id}`, { estado: siguienteEstado[plaza.estado] });
      cargar();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await api.post('/estacionamientos/plazas', { id_estacionamiento: sitio.id, codigo: nuevo.codigo, tipo: nuevo.tipo });
      setNuevo({ ...nuevo, codigo: '' });
      cargar();
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const Grilla: React.FC<{ titulo: string; items: Plaza[] }> = ({ titulo, items }) => (
    <div className="mb-4">
      <p className="text-xs font-semibold uppercase text-slate-400 tracking-wide mb-2">{titulo} ({items.length})</p>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 italic">Sin plazas registradas.</p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {items.map((p) => (
            <button key={p.id} onClick={() => cambiarEstado(p)} title={`${p.codigo} · ${p.estado} · clic para cambiar`}
              className={`text-xs font-medium rounded-lg border py-2 text-center transition-colors ${coloresPlaza[p.estado]}`}>
              {p.codigo}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-800 mb-1">Mapa de plazas</h2>
        <p className="text-sm text-slate-500 mb-4">{sitio.nombre} · clic en una plaza para cambiar su estado</p>

        <div className="flex items-center gap-4 text-xs text-slate-500 mb-4">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 border border-green-300 inline-block" /> Disponible</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" /> Ocupada</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-slate-100 border border-slate-300 inline-block" /> Mantenimiento</span>
        </div>

        {cargando ? (
          <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" /></div>
        ) : (
          <>
            <Grilla titulo="Plazas de estacionamiento" items={plazas.filter((p) => p.tipo === 'estacionamiento')} />
            <Grilla titulo="Bahías de lavado" items={plazas.filter((p) => p.tipo === 'bahia_lavado')} />
          </>
        )}

        <form onSubmit={agregar} className="flex gap-2 border-t pt-4">
          <input required value={nuevo.codigo} onChange={(e) => setNuevo({ ...nuevo, codigo: e.target.value })}
            placeholder="Código (ej. P-11)" className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <select value={nuevo.tipo} onChange={(e) => setNuevo({ ...nuevo, tipo: e.target.value as Plaza['tipo'] })}
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm">
            <option value="estacionamiento">Estacionamiento</option>
            <option value="bahia_lavado">Bahía de lavado</option>
          </select>
          <button type="submit" disabled={guardando}
            className="flex items-center gap-1 bg-sky-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-sky-700 disabled:opacity-50">
            <Plus size={16} /> Agregar
          </button>
        </form>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

// ==================== MODAL: CONFIGURAR AGENDA DEL SITIO ====================
const ModalConfigurar: React.FC<{ sitio: Estacionamiento; onClose: () => void; onDone: () => void }> = ({ sitio, onClose, onDone }) => {
  const ciudades = useCiudades();
  const { fija } = useFiltroCiudad();
  const esTaller = sitio.tipo === 'taller';
  const [form, setForm] = useState({
    id_ciudad: sitio.id_ciudad,
    horario_apertura: sitio.horario_apertura || '07:00',
    horario_cierre: sitio.horario_cierre || '18:00',
    admite_expreso: sitio.admite_expreso !== false,
    capacidad_expreso: sitio.capacidad_expreso ?? 0,
    duracion_franja_min: sitio.duracion_franja_min || 60,
    estado: sitio.estado || 'activo'
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      await api.put(`/estacionamientos/${sitio.id}`, form);
      onDone();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <form onSubmit={guardar} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-800 mb-1">Configurar agenda</h2>
        <p className="text-sm text-slate-500 mb-4">{sitio.nombre}{esTaller && ' · taller'}</p>

        {/* Solo lo nacional mueve un sitio de ciudad; el operador de ciudad la ve fija */}
        {!fija && (
          <div className="mb-3">
            <label className="text-xs text-slate-500">Ciudad</label>
            <select value={form.id_ciudad} onChange={(e) => setForm({ ...form, id_ciudad: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg">
              {ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <div className="flex-1">
            <label className="text-xs text-slate-500">Apertura</label>
            <input type="time" value={form.horario_apertura} onChange={(e) => setForm({ ...form, horario_apertura: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-slate-500">Cierre</label>
            <input type="time" value={form.horario_cierre} onChange={(e) => setForm({ ...form, horario_cierre: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
        </div>

        <div className="mb-3">
          <label className="text-xs text-slate-500">Granularidad de la grilla de horarios</label>
          <select value={form.duracion_franja_min} onChange={(e) => setForm({ ...form, duracion_franja_min: Number(e.target.value) })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg">
            {GRANULARIDADES.map((g) => <option key={g} value={g}>Cada {g} min</option>)}
          </select>
        </div>

        {esTaller ? (
          <p className="text-xs text-slate-500 bg-slate-100 rounded-lg p-3 mb-3">
            En un taller la capacidad de la limpieza profunda son sus bahías de lavado disponibles
            (se administran en el mapa de plazas). No admite servicios expreso.
          </p>
        ) : (
          <>
            <div className="mb-3">
              <label className="text-xs text-slate-500">Capacidad simultánea para servicios expreso</label>
              <input type="number" min={0} value={form.capacidad_expreso}
                onChange={(e) => setForm({ ...form, capacidad_expreso: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              <p className="text-xs text-slate-400 mt-1">0 = usar la cantidad de lavadores activos de la ciudad como capacidad.</p>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700 mb-3">
              <input type="checkbox" checked={form.admite_expreso} onChange={(e) => setForm({ ...form, admite_expreso: e.target.checked })} />
              Admite servicios expreso en este sitio
            </label>
          </>
        )}

        <div className="mb-4">
          <label className="text-xs text-slate-500">Estado</label>
          <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg">
            <option value="activo">Activo</option>
            <option value="inactivo">Inactivo</option>
          </select>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cancelar</button>
          <button type="submit" disabled={guardando}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-sky-700 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
};

const Estacionamientos: React.FC = () => {
  const filtro = useFiltroCiudad();
  const ciudades = useCiudades();
  const [sitios, setSitios] = useState<Estacionamiento[]>([]);
  const [form, setForm] = useState({
    nombre: '', direccion: '', id_ciudad: 0, tipo: 'aliado' as 'aliado' | 'taller' | 'privado', id_cliente: 0,
    horario_apertura: '07:00', horario_cierre: '18:00',
    cantidad_plazas: 10, capacidad_expreso: 0, duracion_franja_min: 60
  });
  // Ciudad del sitio nuevo: la elegida en el filtro (o la del operador) si no se cambió
  const ciudadForm = form.id_ciudad || filtro.idCiudad || 0;
  const esTaller = form.tipo === 'taller';
  // Empresas, para el parqueadero privado (se cargan al elegir ese tipo)
  const [empresas, setEmpresas] = useState<Cliente[]>([]);
  useEffect(() => {
    if (form.tipo !== 'privado' || empresas.length > 0) return;
    api.get('/clientes', { params: { tipo: 'empresa', estado: 'activo' } })
      .then((r) => setEmpresas(r.data))
      .catch(() => setEmpresas([]));
  }, [form.tipo, empresas.length]);
  const [cargando, setCargando] = useState(true);
  const [modalConfigurar, setModalConfigurar] = useState<Estacionamiento | null>(null);
  const [modalPlazas, setModalPlazas] = useState<Estacionamiento | null>(null);

  const idCiudad = filtro.idCiudad;
  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/estacionamientos', { params: idCiudad ? { id_ciudad: idCiudad } : {} })
      .then((r) => setSitios(r.data))
      .catch(() => setSitios([]))
      .finally(() => setCargando(false));
  }, [idCiudad]);

  useEffect(cargar, [cargar]);

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/estacionamientos', {
        ...form, id_ciudad: ciudadForm, id_cliente: form.tipo === 'privado' ? form.id_cliente : undefined
      });
      setForm({ ...form, nombre: '', direccion: '' });
      cargar();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <MapPin className="text-sky-600" /> Estacionamientos
        </h1>
        <FiltroCiudad filtro={filtro} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form onSubmit={crear} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Nuevo sitio</h2>
          <div className="grid grid-cols-3 gap-2">
            {([
              ['aliado', 'Sitio aliado', 'Edificio, condominio u oficina: expreso'],
              ['taller', 'Taller', 'Bahías de limpieza profunda'],
              ['privado', 'Privado', 'Parqueadero propio de una empresa']
            ] as const).map(([valor, titulo, ayuda]) => (
              <button type="button" key={valor} onClick={() => setForm({ ...form, tipo: valor, cantidad_plazas: valor === 'taller' ? 2 : 10 })}
                className={`text-left rounded-lg border p-2 ${form.tipo === valor ? 'border-sky-500 bg-sky-50' : 'border-slate-200'}`}>
                <span className="block text-sm font-medium text-slate-800">{titulo}</span>
                <span className="block text-xs text-slate-500">{ayuda}</span>
              </button>
            ))}
          </div>
          {form.tipo === 'privado' && (
            <div>
              <select required value={form.id_cliente || ''} onChange={(e) => setForm({ ...form, id_cliente: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg">
                <option value="" disabled>Empresa dueña…</option>
                {empresas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">Solo esa empresa lo ve y reserva ahí; no aparece al público.</p>
            </div>
          )}
          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder={esTaller ? 'Nombre (ej. Taller Norte)' : form.tipo === 'privado' ? 'Nombre (ej. Patio de la empresa)' : 'Nombre (edificio/condominio)'}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })}
            placeholder="Dirección" className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          {filtro.fija ? (
            <p className="text-xs text-slate-500">Ciudad: <b>{filtro.fija.nombre}</b></p>
          ) : (
            <select required value={ciudadForm || ''} onChange={(e) => setForm({ ...form, id_ciudad: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg">
              <option value="" disabled>Ciudad…</option>
              {ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          )}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-500">Apertura</label>
              <input type="time" value={form.horario_apertura} onChange={(e) => setForm({ ...form, horario_apertura: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-slate-500">Cierre</label>
              <input type="time" value={form.horario_cierre} onChange={(e) => setForm({ ...form, horario_cierre: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-500">Granularidad</label>
              <select value={form.duracion_franja_min} onChange={(e) => setForm({ ...form, duracion_franja_min: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg">
                {GRANULARIDADES.map((g) => <option key={g} value={g}>Cada {g} min</option>)}
              </select>
            </div>
            {!esTaller && (
              <div className="flex-1">
                <label className="text-xs text-slate-500">Cap. expreso (0=lavadores)</label>
                <input type="number" min={0} value={form.capacidad_expreso}
                  onChange={(e) => setForm({ ...form, capacidad_expreso: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-slate-500">{esTaller ? 'Cantidad de bahías de lavado' : 'Cantidad de plazas'}</label>
            <input type="number" min={0} max={100} value={form.cantidad_plazas}
              onChange={(e) => setForm({ ...form, cantidad_plazas: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          </div>
          <button type="submit" className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700">Guardar</button>
        </form>

        <div className="lg:col-span-2">
          {cargando ? (
            <p className="text-slate-400">Cargando...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {sitios.map((s) => (
                <div key={s.id} className="bg-white rounded-xl shadow-sm p-5">
                  <div className="flex items-start justify-between">
                    <h3 className="font-semibold text-slate-800 flex items-center gap-1.5">
                      {s.tipo === 'taller' && <Warehouse size={16} className="text-purple-600" />}
                      {s.nombre}
                    </h3>
                    <div className="flex gap-1">
                      <button onClick={() => setModalPlazas(s)} title="Mapa de plazas"
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded">
                        <LayoutGrid size={18} />
                      </button>
                      <button onClick={() => setModalConfigurar(s)} title="Configurar agenda"
                        className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded">
                        <Settings size={18} />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500">{s.direccion}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {s.ciudad?.nombre} · {s.horario_apertura}–{s.horario_cierre}
                    {s.tipo !== 'taller' && !s.admite_expreso && ' · sin expreso'}
                  </p>
                  <p className="text-xs text-slate-400">
                    Franjas cada {s.duracion_franja_min || 60} min ·{' '}
                    {s.tipo === 'taller'
                      ? `${s.plazas?.filter((p) => p.tipo === 'bahia_lavado' && p.estado === 'disponible').length ?? 0} bahías disponibles`
                      : `capacidad expreso ${s.capacidad_expreso ? s.capacidad_expreso : 'lavadores de la ciudad'}`}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {s.tipo === 'taller' ? (
                      <span className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full">taller</span>
                    ) : s.tipo === 'privado' ? (
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full">privado · {s.empresa?.nombre}</span>
                    ) : (
                      <span className="text-xs bg-sky-50 text-sky-700 px-2 py-1 rounded-full">
                        {s.plazas?.length ?? 0} plazas
                      </span>
                    )}
                    {s.estado === 'inactivo' && (
                      <span className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">inactivo</span>
                    )}
                    {s.suscripciones && s.suscripciones.length > 0 && (
                      <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">
                        {s.suscripciones[0].plan?.nombre}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {modalConfigurar && (
        <ModalConfigurar sitio={modalConfigurar} onClose={() => setModalConfigurar(null)} onDone={cargar} />
      )}
      {modalPlazas && (
        <ModalPlazas sitio={modalPlazas} onClose={() => setModalPlazas(null)} onDone={cargar} />
      )}
    </div>
  );
};

export default Estacionamientos;
