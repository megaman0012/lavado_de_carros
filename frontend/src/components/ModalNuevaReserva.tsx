import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Car, CalendarPlus, CheckCircle2, UserPlus } from 'lucide-react';
import api from '../services/api';
import { Cliente, Vehiculo, TipoServicio, Estacionamiento, FranjaDisponibilidad, ServicioAdicional } from '../types';
import FormVehiculo, { SelectorTipoVehiculo, useTiposVehiculo } from './FormVehiculo';
import { hoyISO, fechaCorta } from '../utils/fechas';
import { tarifaPara, dinero, totales } from '../utils/catalogo';

/**
 * Alta de reserva desde el panel, a nombre de un cliente (walk-in o telefónico).
 * El backend ya aceptaba id_cliente para admin/operador; lo que faltaba era esta
 * pantalla: hasta ahora la única forma de crear una reserva era que el propio
 * cliente la hiciera desde el sitio.
 */
const ModalNuevaReserva: React.FC<{ onClose: () => void; onCreada: () => void }> = ({ onClose, onCreada }) => {
  // Paso 1: cliente
  const [busqueda, setBusqueda] = useState('');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState<Cliente | null>(null);

  // Paso 2: vehículo
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [vehiculoId, setVehiculoId] = useState<number | ''>('');
  const [mostrarNuevoVehiculo, setMostrarNuevoVehiculo] = useState(false);
  const tipos = useTiposVehiculo();

  // Paso 3: servicio y horario
  const [servicios, setServicios] = useState<TipoServicio[]>([]);
  const [estacionamientos, setEstacionamientos] = useState<Estacionamiento[]>([]);
  const [servicioId, setServicioId] = useState<number | ''>('');
  const [adicionales, setAdicionales] = useState<ServicioAdicional[]>([]);
  const [adicionalesSel, setAdicionalesSel] = useState<number[]>([]);
  const [estacionamientoId, setEstacionamientoId] = useState<number | ''>('');
  const [fecha, setFecha] = useState(hoyISO());
  const [franjas, setFranjas] = useState<FranjaDisponibilidad[]>([]);
  const [franjaSel, setFranjaSel] = useState<FranjaDisponibilidad | null>(null);

  const [cargandoFranjas, setCargandoFranjas] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState<any>(null);

  const servicio = useMemo(() => servicios.find((s) => s.id === servicioId) || null, [servicios, servicioId]);
  const vehiculo = vehiculos.find((v) => v.id === vehiculoId) || null;
  // El precio y la duración dependen del tipo del vehículo elegido
  const tarifa = tarifaPara(servicio, vehiculo?.id_tipo_vehiculo);
  const extras = adicionales.filter((a) => adicionalesSel.includes(a.id));
  const total = totales(tarifa, extras);

  useEffect(() => {
    api.get('/servicios', { params: { activo: true } }).then((r) => setServicios(r.data)).catch(() => {});
    api.get('/public/adicionales').then((r) => setAdicionales(r.data)).catch(() => {});
    api.get('/estacionamientos').then((r) => setEstacionamientos(r.data)).catch(() => {});
  }, []);

  // Búsqueda de clientes (con pequeño retardo para no pegarle a la API en cada tecla)
  useEffect(() => {
    if (cliente) return;
    const t = setTimeout(() => {
      api.get('/clientes', { params: busqueda ? { busqueda } : {} })
        .then((r) => setClientes(r.data.slice(0, 8)))
        .catch(() => setClientes([]));
    }, 250);
    return () => clearTimeout(t);
  }, [busqueda, cliente]);

  // Vehículos del cliente elegido
  useEffect(() => {
    if (!cliente) return;
    api.get('/vehiculos', { params: { id_cliente: cliente.id } })
      .then((r) => {
        setVehiculos(r.data);
        setMostrarNuevoVehiculo(r.data.length === 0);
      })
      .catch(() => setVehiculos([]));
  }, [cliente]);

  // Un servicio que no se ofrece al tipo del vehículo nuevo deja de estar elegido
  useEffect(() => {
    if (servicio && !tarifa) setServicioId('');
  }, [servicio, tarifa]);

  // Disponibilidad (con la duración total: servicio para ese tipo + adicionales)
  useEffect(() => {
    if (!servicio || !tarifa) { setFranjas([]); return; }
    if (servicio.modalidad === 'expreso' && !estacionamientoId) { setFranjas([]); return; }
    setCargandoFranjas(true);
    setFranjaSel(null);
    const params: any = { fecha, modalidad: servicio.modalidad, duracion_min: total.duracion };
    if (servicio.modalidad === 'expreso') params.id_estacionamiento = estacionamientoId;
    api.get('/agenda/disponibilidad', { params })
      .then((r) => setFranjas(r.data.franjas || []))
      .catch((e) => setError(e.message))
      .finally(() => setCargandoFranjas(false));
  }, [fecha, servicio, tarifa, total.duracion, estacionamientoId]);

  // Vehículo registrado antes del catálogo de tipos: se completa aquí mismo
  const asignarTipo = async (idTipo: number) => {
    if (!vehiculo) return;
    try {
      const r = await api.put(`/vehiculos/${vehiculo.id}`, { id_tipo_vehiculo: idTipo });
      setVehiculos((lista) => lista.map((v) => (v.id === vehiculo.id ? r.data : v)));
    } catch (e: any) {
      setError(e.message);
    }
  };

  const confirmar = async () => {
    if (!cliente || !servicio || !vehiculoId || !franjaSel) return;
    setGuardando(true);
    setError('');
    try {
      const body: any = {
        id_cliente: cliente.id,
        id_vehiculo: vehiculoId,
        id_tipo_servicio: servicio.id,
        fecha,
        hora_inicio: franjaSel.hora_inicio,
        adicionales: adicionalesSel
      };
      if (servicio.modalidad === 'expreso') body.id_estacionamiento = estacionamientoId;
      const r = await api.post('/reservas', body);
      setExito(r.data);
      onCreada();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const listo = cliente && servicio && tarifa && vehiculoId && franjaSel;

  if (exito) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-8 text-center" onClick={(e) => e.stopPropagation()}>
          <CheckCircle2 className="text-green-500 mx-auto mb-4" size={52} />
          <h2 className="text-lg font-bold text-slate-800 mb-1">Reserva registrada</h2>
          <p className="text-sm text-slate-500">Código: <span className="font-mono font-semibold">{exito.codigo}</span></p>
          <p className="text-sm text-slate-500 mb-6">
            {cliente?.nombre} · {fechaCorta(fecha)} {exito.hora_inicio}–{exito.hora_fin}
          </p>
          <p className="text-sm font-semibold text-slate-700 mb-6 -mt-4">Total: {dinero(exito.precio_final)}</p>
          <button onClick={onClose} className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700">Cerrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CalendarPlus className="text-sky-600" size={20} /> Nueva reserva
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {/* ---------- 1. CLIENTE ---------- */}
        <section className="mb-5">
          <p className="text-xs font-semibold uppercase text-slate-400 tracking-wide mb-2">1 · Cliente</p>
          {cliente ? (
            <div className="flex items-center justify-between bg-sky-50 border border-sky-200 rounded-lg px-4 py-3">
              <div>
                <p className="font-medium text-slate-800">{cliente.nombre}</p>
                <p className="text-xs text-slate-500">{cliente.email || 'sin email'} · {cliente.telefono || 'sin teléfono'}</p>
              </div>
              <button onClick={() => { setCliente(null); setVehiculoId(''); setVehiculos([]); }}
                className="text-sm text-sky-700 underline">Cambiar</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por nombre, email o cédula…"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg" />
              </div>
              <div className="border border-slate-200 rounded-lg mt-2 divide-y max-h-52 overflow-y-auto">
                {clientes.length === 0 ? (
                  <p className="text-sm text-slate-400 px-4 py-3">
                    Sin resultados. Registre al cliente desde la pestaña <b>Clientes</b> y vuelva aquí.
                  </p>
                ) : clientes.map((c) => {
                  const activo = (c.estado || 'activo') === 'activo';
                  return (
                    <button key={c.id} disabled={!activo} onClick={() => setCliente(c)}
                      className={`w-full text-left px-4 py-2.5 flex items-center justify-between ${activo ? 'hover:bg-slate-50' : 'opacity-50 cursor-not-allowed'}`}>
                      <span>
                        <span className="font-medium text-slate-700">{c.nombre}</span>
                        <span className="block text-xs text-slate-400">{c.email || c.telefono || 'sin contacto'}</span>
                      </span>
                      {!activo && <span className="text-xs text-red-500">suspendido</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {/* ---------- 2. VEHÍCULO ---------- */}
        {cliente && (
          <section className="mb-5">
            <p className="text-xs font-semibold uppercase text-slate-400 tracking-wide mb-2">2 · Vehículo</p>
            {vehiculos.length > 0 && (
              <select value={vehiculoId} onChange={(e) => setVehiculoId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-2">
                <option value="">Seleccione el vehículo…</option>
                {vehiculos.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.placa} — {v.tipoVehiculo?.nombre || 'SIN TIPO'} · {[v.marca, v.modelo, v.color].filter(Boolean).join(' ') || 'sin datos'}
                  </option>
                ))}
              </select>
            )}

            {vehiculo && !vehiculo.id_tipo_vehiculo && (
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mb-2">
                <p className="text-xs text-amber-700 mb-2">Este vehículo no tiene tipo registrado. Indíquelo para ver servicios y precios:</p>
                <SelectorTipoVehiculo tipos={tipos} valor={null} onChange={asignarTipo} />
              </div>
            )}

            {mostrarNuevoVehiculo ? (
              <div className="border border-slate-200 rounded-lg p-3 space-y-2">
                <p className="text-xs text-slate-500 flex items-center gap-1"><Car size={14} /> Registrar un vehículo</p>
                <FormVehiculo
                  tipos={tipos}
                  idCliente={cliente.id}
                  onCreado={(v) => { setVehiculos([...vehiculos, v]); setVehiculoId(v.id); setMostrarNuevoVehiculo(false); }}
                  onCancelar={vehiculos.length > 0 ? () => setMostrarNuevoVehiculo(false) : undefined}
                />
              </div>
            ) : (
              <button onClick={() => setMostrarNuevoVehiculo(true)}
                className="text-sm text-sky-600 hover:underline flex items-center gap-1">
                <UserPlus size={14} /> Registrar otro vehículo
              </button>
            )}
          </section>
        )}

        {/* ---------- 3. SERVICIO Y HORARIO ---------- */}
        {cliente && vehiculo?.id_tipo_vehiculo && (
          <section className="mb-5">
            <p className="text-xs font-semibold uppercase text-slate-400 tracking-wide mb-2">3 · Servicio y horario</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              <select value={servicioId} onChange={(e) => setServicioId(e.target.value ? Number(e.target.value) : '')}
                className="px-3 py-2 border border-slate-300 rounded-lg">
                <option value="">Seleccione el servicio…</option>
                {servicios.filter((s) => s.activo !== false).map((s) => {
                  const t = tarifaPara(s, vehiculo.id_tipo_vehiculo);
                  return (
                    <option key={s.id} value={s.id} disabled={!t}>
                      {s.nombre} — {t ? `${dinero(t.precio)} (${t.duracion_min} min)` : `no disponible para ${vehiculo.tipoVehiculo?.nombre}`}
                    </option>
                  );
                })}
              </select>

              {servicio?.modalidad === 'expreso' ? (
                <select value={estacionamientoId} onChange={(e) => setEstacionamientoId(e.target.value ? Number(e.target.value) : '')}
                  className="px-3 py-2 border border-slate-300 rounded-lg">
                  <option value="">Seleccione el estacionamiento…</option>
                  {estacionamientos.filter((e) => e.admite_expreso !== false).map((e) => (
                    <option key={e.id} value={e.id}>{e.nombre}</option>
                  ))}
                </select>
              ) : servicio ? (
                <div className="px-3 py-2 bg-purple-50 text-purple-700 rounded-lg text-sm flex items-center">
                  Limpieza profunda — se atiende en la bahía
                </div>
              ) : <span />}

              <input type="date" value={fecha} min={hoyISO()} onChange={(e) => setFecha(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-lg" />
            </div>

            {servicio && adicionales.length > 0 && (
              <div className="mb-3">
                <p className="text-xs text-slate-500 mb-1">Adicionales</p>
                <div className="flex flex-wrap gap-2">
                  {adicionales.map((a) => {
                    const sel = adicionalesSel.includes(a.id);
                    return (
                      <button key={a.id} type="button" aria-pressed={sel}
                        onClick={() => setAdicionalesSel(sel ? adicionalesSel.filter((x) => x !== a.id) : [...adicionalesSel, a.id])}
                        className={`text-xs px-3 py-1.5 rounded-full border transition ${sel ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-300 text-slate-600 hover:border-sky-400'}`}>
                        {a.nombre} +{dinero(a.precio)}{a.duracion_min > 0 && ` · ${a.duracion_min} min`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {tarifa && (
              <p className="text-sm text-slate-600 mb-2">
                Total <strong>{dinero(total.precio)}</strong> · duración {total.duracion} min
              </p>
            )}

            {servicio && (
              cargandoFranjas ? (
                <p className="text-sm text-slate-400">Consultando disponibilidad…</p>
              ) : franjas.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {servicio.modalidad === 'expreso' && !estacionamientoId
                    ? 'Elija un estacionamiento para ver los horarios.'
                    : 'No hay horarios para ese día.'}
                </p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {franjas.filter((f) => !f.pasada).map((f) => (
                    <button key={f.hora_inicio} disabled={!f.disponible} onClick={() => setFranjaSel(f)}
                      title={f.disponible ? `${f.cupos} cupo(s)` : 'Sin cupos'}
                      className={`py-2 rounded-lg text-sm border transition
                        ${franjaSel?.hora_inicio === f.hora_inicio
                          ? 'bg-sky-600 text-white border-sky-600'
                          : f.disponible
                            ? 'border-slate-300 text-slate-700 hover:border-sky-400 hover:text-sky-600'
                            : 'border-slate-200 text-slate-300 line-through cursor-not-allowed'}`}>
                      {f.hora_inicio}
                    </button>
                  ))}
                </div>
              )
            )}
          </section>
        )}

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2 border-t pt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cancelar</button>
          <button onClick={confirmar} disabled={!listo || guardando}
            className="bg-sky-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-sky-700 disabled:opacity-50">
            {guardando ? 'Registrando…' : 'Registrar reserva'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalNuevaReserva;
