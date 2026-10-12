import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Clock, MapPin, Plus, Sparkles, Ticket, Armchair
} from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import FormVehiculo, { IconoTipo, SelectorTipoVehiculo, useTiposVehiculo } from '../components/FormVehiculo';
import { TipoServicio, Estacionamiento, Vehiculo, FranjaDisponibilidad, ServicioAdicional, Ciudad, Sector, DatosDomicilio, MiPlan } from '../types';
import FormDomicilio, { DOMICILIO_VACIO, domicilioCompleto } from '../components/FormDomicilio';
import { hoyISO, fechaLarga, proximosDias, partesDia } from '../utils/fechas';
import { tarifaPara, dinero, totales } from '../utils/catalogo';

/**
 * Reserva del cliente, pensada como la compra de una entrada de cine:
 *
 *   1 Vehículo    ≈ tipo de sala: define qué servicios hay y a qué precio
 *   2 Servicio    ≈ la película (cartelera filtrada por el tipo de vehículo)
 *   3 Adicionales ≈ la confitería (opcional, suma precio y minutos)
 *   4 Lugar       ≈ el cine: primero la ciudad, después el estacionamiento
 *                   (o el taller de esa ciudad, para limpieza profunda), o
 *                   A DOMICILIO: va un equipo móvil a la dirección del cliente
 *   5 Función     ≈ día y hora, con los cupos que quedan en cada franja
 *   6 Boleto      ≈ resumen con el total antes de confirmar
 *
 * El paso vive en la URL (?paso=3): así el botón "atrás" del navegador o del
 * celular vuelve al paso anterior en vez de sacar al usuario del flujo (antes
 * lo dejaba en la portada y parecía que había perdido la sesión).
 */

const PASOS = ['Vehículo', 'Servicio', 'Adicionales', 'Lugar', 'Función', 'Boleto'];

// La ciudad del cliente se recuerda en el teléfono: casi siempre lava en la misma
const LLAVE_CIUDAD = 'ciudad_cliente';
const ciudadGuardada = (): number | null => {
  try {
    const v = parseInt(localStorage.getItem(LLAVE_CIUDAD) || '');
    return v > 0 ? v : null;
  } catch {
    return null;
  }
};
// Días a la vista: los que se pueden reservar (14 por defecto; un VIP, los de su plan)
const DIAS_CARTELERA = 14;

const Reservar: React.FC = () => {
  const { isAuthenticated, usuario, login, logout } = useAuth();
  const location = useLocation() as any;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tipos = useTiposVehiculo();

  const [servicios, setServicios] = useState<TipoServicio[]>([]);
  const [adicionales, setAdicionales] = useState<ServicioAdicional[]>([]);
  const [ciudades, setCiudades] = useState<Ciudad[]>([]);
  const [ciudadId, setCiudadId] = useState<number | null>(ciudadGuardada);
  const [estacionamientos, setEstacionamientos] = useState<Estacionamiento[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);

  const [vehiculoId, setVehiculoId] = useState<number | null>(null);
  const [servicioId, setServicioId] = useState<number | null>(location.state?.servicioId || null);
  const [adicionalesSel, setAdicionalesSel] = useState<number[]>([]);
  const [estacionamientoId, setEstacionamientoId] = useState<number | null>(null);
  const [fecha, setFecha] = useState(hoyISO());
  const [franjas, setFranjas] = useState<FranjaDisponibilidad[]>([]);
  const [franjaSel, setFranjaSel] = useState<FranjaDisponibilidad | null>(null);

  const [mostrarFormVehiculo, setMostrarFormVehiculo] = useState(false);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [exito, setExito] = useState<any>(null);
  const [registro, setRegistro] = useState({ nombre: '', email: '', telefono: '', password: '' });
  const [registrando, setRegistrando] = useState(false);

  const esCliente = isAuthenticated && usuario?.rol === 'cliente';
  const vehiculo = useMemo(() => vehiculos.find((v) => v.id === vehiculoId) || null, [vehiculos, vehiculoId]);
  // Empresa (gestor de flota): sus precios pactados y sus parqueaderos propios
  const esEmpresa = esCliente && usuario?.cliente?.tipo === 'empresa';
  const [tarifasEmpresa, setTarifasEmpresa] = useState<{ id_tipo_servicio: number; id_tipo_vehiculo: number; precio: number }[]>([]);
  const [sitiosPropios, setSitiosPropios] = useState<Estacionamiento[]>([]);
  useEffect(() => {
    if (!esEmpresa) return;
    api.get('/mi-empresa/tarifas').then((r) => setTarifasEmpresa(r.data)).catch(() => {});
    api.get('/mi-empresa/sitios').then((r) => setSitiosPropios(r.data)).catch(() => {});
  }, [esEmpresa]);
  // El catálogo con el precio que esta cuenta va a pagar (el servidor cobra lo mismo)
  const catalogo = useMemo(() => tarifasEmpresa.length === 0 ? servicios : servicios.map((s) => ({
    ...s,
    precios: s.precios.map((p) => {
      const t = tarifasEmpresa.find((x) => x.id_tipo_servicio === s.id && x.id_tipo_vehiculo === p.id_tipo_vehiculo);
      return t ? { ...p, precio: t.precio } : p;
    })
  })), [servicios, tarifasEmpresa]);
  const servicio = useMemo(() => catalogo.find((s) => s.id === servicioId) || null, [catalogo, servicioId]);
  const tarifa = tarifaPara(servicio, vehiculo?.id_tipo_vehiculo);
  const extras = useMemo(() => adicionales.filter((a) => adicionalesSel.includes(a.id)), [adicionales, adicionalesSel]);
  const total = totales(tarifa, extras);
  const lugar = estacionamientos.find((e) => e.id === estacionamientoId) || null;

  // A domicilio (solo expreso): sectores de la ciudad con equipo móvil
  const [sectores, setSectores] = useState<Sector[]>([]);
  const [aDomicilio, setADomicilio] = useState(false);
  const [domicilio, setDomicilio] = useState<DatosDomicilio>(DOMICILIO_VACIO);
  const sectorElegido = sectores.find((x) => x.id === domicilio.id_sector) || null;
  const domicilioListo = aDomicilio && domicilioCompleto(domicilio);
  const lugarListo = aDomicilio ? domicilioListo : !!estacionamientoId;
  const recargo = aDomicilio ? sectorElegido?.recargo ?? 0 : 0;

  // Plan VIP: lavados incluidos, descuento y más días para reservar. Es un
  // estimado con el mes en curso; el precio final lo calcula el servidor.
  const [miPlan, setMiPlan] = useState<MiPlan | null>(null);
  useEffect(() => {
    if (!esCliente || esEmpresa) return;
    api.get('/mi-plan').then((r) => setMiPlan(r.data)).catch(() => {});
  }, [esCliente, esEmpresa]);
  const planVip = miPlan?.suscripcion?.vigente ? miPlan.suscripcion.plan || null : null;
  const descuento = (planVip?.descuento_pct ?? 0) / 100;
  const incluido = !!planVip && !!servicio && (planVip.modalidad === 'todas' || planVip.modalidad === servicio.modalidad) &&
    (miPlan?.restantes ?? 0) > 0;
  const precioServicioVip = !tarifa ? 0 : incluido ? 0 : Math.round(tarifa.precio * (1 - descuento) * 100) / 100;
  const precioExtrasVip = Math.round(extras.reduce((t, a) => t + a.precio, 0) * (1 - descuento) * 100) / 100;
  const diasCartelera = (miPlan?.dias_anticipacion ?? DIAS_CARTELERA - 1) + 1;
  const precioTotal = (planVip ? precioServicioVip + precioExtrasVip : total.precio) + recargo;

  // ---------- Paso en la URL ----------
  // Hasta qué paso se puede llegar con lo elegido (al recargar en ?paso=5 sin
  // datos, se vuelve al primero incompleto)
  const pasoMaximo =
    !esCliente || !vehiculo?.id_tipo_vehiculo ? 1
      : !tarifa ? 2
      : !lugarListo ? 4
      : !franjaSel ? 5
      : 6;
  const pasoURL = parseInt(params.get('paso') || '1') || 1;
  const paso = Math.min(Math.max(pasoURL, 1), pasoMaximo);
  const avancesPropios = useRef(0); // pasos que este flujo agregó al historial

  useEffect(() => {
    if (pasoURL !== paso) setParams(paso > 1 ? { paso: String(paso) } : {}, { replace: true });
  }, [pasoURL, paso, setParams]);

  const irA = (n: number) => {
    setError('');
    avancesPropios.current += 1;
    setParams(n > 1 ? { paso: String(n) } : {});
    window.scrollTo({ top: 0 });
  };
  const atras = () => {
    if (paso === 1) return navigate('/');
    // Si el paso anterior lo agregamos nosotros, "atrás" real del historial;
    // si se entró directo a ?paso=N, se retrocede sin salir del flujo.
    if (avancesPropios.current > 0) { avancesPropios.current -= 1; navigate(-1); }
    else setParams(paso - 1 > 1 ? { paso: String(paso - 1) } : {}, { replace: true });
  };

  // ---------- Carga de datos ----------
  useEffect(() => {
    api.get('/public/servicios').then((r) => setServicios(r.data)).catch(() => {});
    api.get('/public/adicionales').then((r) => setAdicionales(r.data)).catch(() => {});
    api.get('/public/ciudades').then((r) => setCiudades(r.data)).catch(() => {});
  }, []);

  // Las ciudades de los parqueaderos propios también se ofrecen, aunque no tengan sitios públicos
  useEffect(() => {
    const faltan = sitiosPropios
      .map((e) => e.ciudad)
      .filter((c): c is { id: number; nombre: string } => !!c && !ciudades.some((x) => x.id === c.id));
    if (faltan.length > 0) {
      const unicas = faltan.filter((c, i) => faltan.findIndex((x) => x.id === c.id) === i);
      setCiudades([...ciudades, ...unicas].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    }
  }, [sitiosPropios, ciudades]);

  // Ciudad: si hay una sola, no se pregunta; si la guardada ya no se ofrece, se olvida
  useEffect(() => {
    if (ciudades.length === 0) return;
    if (ciudades.length === 1) setCiudadId(ciudades[0].id);
    else if (ciudadId && !ciudades.some((c) => c.id === ciudadId)) setCiudadId(null);
  }, [ciudades, ciudadId]);

  const elegirCiudad = (id: number) => {
    setCiudadId(id);
    setEstacionamientoId(null);
    try { localStorage.setItem(LLAVE_CIUDAD, String(id)); } catch { /* sin almacenamiento: no se recuerda */ }
  };

  // Lugares de la ciudad: edificios para el expreso, el taller para la profunda
  const modalidad = servicio?.modalidad;
  useEffect(() => {
    if (!ciudadId || !modalidad) { setEstacionamientos([]); return; }
    api.get('/public/estacionamientos', {
      params: { id_ciudad: ciudadId, ...(modalidad === 'profunda' && { tipo: 'taller' }) }
    })
      .then((r) => {
        // Para el expreso, primero los parqueaderos propios de la empresa en esa ciudad
        const propios = modalidad === 'expreso' ? sitiosPropios.filter((e) => e.id_ciudad === ciudadId) : [];
        const lista: Estacionamiento[] = [...propios, ...r.data];
        setEstacionamientos(lista);
        // Lo elegido antes ya no sirve (cambió de ciudad o de modalidad); con un único taller, se elige solo
        setEstacionamientoId((actual) =>
          actual && lista.some((e) => e.id === actual) ? actual
            : modalidad === 'profunda' && lista.length === 1 ? lista[0].id
            : null);
      })
      .catch(() => setEstacionamientos([]));
  }, [ciudadId, modalidad, sitiosPropios]);

  useEffect(() => {
    if (!esCliente) return;
    api.get('/vehiculos').then((r) => {
      setVehiculos(r.data);
      setMostrarFormVehiculo(r.data.length === 0);
      if (r.data.length === 1 && r.data[0].id_tipo_vehiculo) setVehiculoId(r.data[0].id);
    }).catch(() => {});
  }, [esCliente]);

  // Disponibilidad de la función: depende de la duración total (servicio + adicionales)
  useEffect(() => {
    if (paso !== 5 || !servicio || !tarifa) return;
    setCargando(true);
    setError('');
    // A domicilio la capacidad es el equipo móvil del sector (con su traslado)
    const q: any = aDomicilio
      ? { fecha, modalidad: 'remoto', duracion_min: total.duracion, id_sector: domicilio.id_sector }
      : { fecha, modalidad: servicio.modalidad, duracion_min: total.duracion, id_estacionamiento: estacionamientoId };
    api.get('/agenda/disponibilidad', { params: q })
      .then((r) => setFranjas(r.data.franjas || []))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [paso, fecha, servicio, tarifa, total.duracion, estacionamientoId, aDomicilio, domicilio.id_sector]);

  useEffect(() => {
    if (!ciudadId || modalidad !== 'expreso') { setSectores([]); setADomicilio(false); return; }
    api.get('/public/sectores', { params: { id_ciudad: ciudadId } })
      .then((r) => setSectores(r.data))
      .catch(() => setSectores([]));
    setDomicilio((d) => ({ ...d, id_sector: '' }));
  }, [ciudadId, modalidad]);

  // Cambiar algo que afecta la duración o el lugar invalida la hora elegida
  useEffect(() => { setFranjaSel(null); }, [vehiculoId, servicioId, adicionalesSel, estacionamientoId, fecha, aDomicilio, domicilio.id_sector]);

  // ---------- Acciones ----------
  const registrarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registro.nombre.trim() || !registro.email.trim() || !registro.password) return;
    setRegistrando(true);
    setError('');
    try {
      const r = await api.post('/auth/registrar', registro);
      login(r.data.usuario, r.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRegistrando(false);
    }
  };

  // Vehículos anteriores al catálogo de tipos: el cliente completa el tipo aquí
  const asignarTipo = async (v: Vehiculo, idTipo: number) => {
    try {
      const r = await api.put(`/vehiculos/${v.id}`, { id_tipo_vehiculo: idTipo });
      setVehiculos((lista) => lista.map((x) => (x.id === v.id ? r.data : x)));
      setVehiculoId(v.id);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleAdicional = (id: number) =>
    setAdicionalesSel((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));

  const confirmar = async () => {
    if (!servicio || !vehiculoId || !franjaSel) return;
    setCargando(true);
    setError('');
    try {
      const body: any = {
        id_vehiculo: vehiculoId,
        id_tipo_servicio: servicio.id,
        fecha,
        hora_inicio: franjaSel.hora_inicio,
        adicionales: adicionalesSel,
        ...(aDomicilio ? { a_domicilio: domicilio } : { id_estacionamiento: estacionamientoId })
      };
      const r = await api.post('/reservas', body);
      setExito(r.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  // ---------- Boleto emitido ----------
  if (exito) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center px-4 py-10">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full overflow-hidden">
          <div className="p-6 text-center">
            <CheckCircle2 className="text-green-500 mx-auto mb-3" size={52} />
            <h1 className="text-xl font-bold text-slate-800">¡Reserva registrada!</h1>
            <p className="text-sm text-slate-500">Te avisaremos cuando quede confirmada.</p>
          </div>
          <div className="border-t-2 border-dashed border-slate-200 px-6 py-5 space-y-1 text-sm">
            <p className="text-center font-mono text-lg font-bold text-blue-700 mb-2">{exito.codigo}</p>
            <p>{fechaLarga(exito.fecha)} · <strong>{exito.hora_inicio}–{exito.hora_fin}</strong></p>
            <p>{exito.tipoServicio?.nombre} · {exito.vehiculo?.placa}</p>
            {exito.adicionales?.length > 0 && <p className="text-slate-500">+ {exito.adicionales.map((a: any) => a.nombre).join(', ')}</p>}
            <p className="text-slate-500">
              {exito.visita ? `A domicilio · ${exito.visita.direccion}` : exito.estacionamiento?.nombre || 'Bahía de lavado'}
            </p>
            {exito.visita && <p className="text-xs text-slate-400">El equipo sale a las {exito.visita.hora_salida}; te avisaremos cuando vaya en camino.</p>}
            <p className="text-right text-lg font-bold text-slate-800 pt-2">{dinero(exito.precio_final)}</p>
            {exito.forma_cobro === 'credito' && <p className="text-right text-xs text-indigo-700">a crédito · corte mensual</p>}
            {exito.forma_cobro !== 'credito' && exito.precio_final > 0 && (
              <p className="text-xs text-sky-800 bg-sky-50 rounded-lg px-3 py-2 mt-2">
                El lavado se paga antes de realizarlo: transfiere y sube el comprobante desde Mis reservas.
              </p>
            )}
          </div>
          <div className="p-6 pt-0">
            <Link to="/mis-reservas" replace className="block text-center bg-sky-600 text-white py-2.5 rounded-lg hover:bg-sky-700">Ver mis reservas</Link>
          </div>
        </div>
      </div>
    );
  }

  const puedeAvanzar =
    (paso === 1 && !!vehiculo?.id_tipo_vehiculo) ||
    (paso === 2 && !!tarifa) ||
    paso === 3 ||
    (paso === 4 && lugarListo) ||
    (paso === 5 && !!franjaSel);

  const tarjeta = (activo: boolean) =>
    `text-left bg-white rounded-xl p-5 border-2 transition ${activo ? 'border-sky-600 ring-2 ring-sky-100' : 'border-transparent hover:border-sky-200'}`;
  const input = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none';

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-3">
          <button onClick={atras} aria-label="Volver" className="text-slate-500 hover:text-sky-600">
            <ArrowLeft size={22} />
          </button>
          <Link to="/"><Logo tamano="sm" /></Link>
          <span className="ml-auto text-sm text-slate-500 truncate">
            {isAuthenticated
              ? usuario?.username
              : <Link to="/login" state={{ from: { pathname: '/reservar' } }} className="text-sky-600 font-medium">Ingresar</Link>}
          </span>
        </div>
      </header>

      {/* Indicador de pasos */}
      <div className="max-w-4xl mx-auto px-4 pt-5">
        <div className="flex items-center gap-1.5">
          {PASOS.map((label, i) => (
            <React.Fragment key={label}>
              <div className={`flex items-center gap-1.5 ${i + 1 <= paso ? 'text-sky-600' : 'text-slate-400'}`}>
                <div className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${i + 1 <= paso ? 'bg-sky-600 text-white' : 'bg-slate-200'}`}>
                  {i + 1}
                </div>
                <span className={`text-sm ${i + 1 === paso ? 'inline' : 'hidden md:inline'}`}>{label}</span>
              </div>
              {i < PASOS.length - 1 && <div className={`flex-1 h-0.5 min-w-[8px] ${i + 1 < paso ? 'bg-sky-600' : 'bg-slate-200'}`} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">{error}</div>
        )}

        {/* ---------- 1. Vehículo ---------- */}
        {paso === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">¿Qué vamos a lavar?</h2>
            {!isAuthenticated && (
              <div className="bg-white rounded-xl p-5 space-y-3">
                <p className="text-sm text-slate-600">
                  Crea tu cuenta para registrar tu vehículo y reservar. ¿Ya tienes cuenta?{' '}
                  <Link to="/login" state={{ from: { pathname: '/reservar' } }} className="text-sky-600 underline font-medium">Inicia sesión</Link>.
                </p>
                <form onSubmit={registrarCliente} className="space-y-3">
                  <input value={registro.nombre} onChange={(e) => setRegistro({ ...registro, nombre: e.target.value })}
                    placeholder="Nombre completo" required autoComplete="name" className={input} />
                  <input type="email" value={registro.email} onChange={(e) => setRegistro({ ...registro, email: e.target.value })}
                    placeholder="Correo electrónico" required autoComplete="email" className={input} />
                  <input type="tel" value={registro.telefono} onChange={(e) => setRegistro({ ...registro, telefono: e.target.value })}
                    placeholder="Teléfono (opcional)" autoComplete="tel" className={input} />
                  <input type="password" value={registro.password} onChange={(e) => setRegistro({ ...registro, password: e.target.value })}
                    placeholder="Contraseña" required autoComplete="new-password" className={input} />
                  <button type="submit" disabled={registrando}
                    className="w-full bg-sky-600 text-white py-2.5 rounded-lg hover:bg-sky-700 disabled:opacity-50">
                    {registrando ? 'Creando cuenta...' : 'Crear cuenta y continuar'}
                  </button>
                </form>
              </div>
            )}
            {isAuthenticated && !esCliente && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg p-3">
                La cuenta con la que iniciaste sesión ({usuario?.username}, rol {usuario?.rol}) no es de cliente y no puede tener vehículos ni reservar aquí.
                Usa <b>Reservas → Nueva reserva</b> en el panel para reservar a nombre de un cliente, o{' '}
                <button onClick={logout} className="underline font-medium">cierra sesión</button>.
              </div>
            )}
            {esCliente && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {vehiculos.map((v) => (
                    <div key={v.id} className={tarjeta(vehiculoId === v.id)}>
                      <button className="w-full text-left flex items-center gap-3" disabled={!v.id_tipo_vehiculo}
                        onClick={() => setVehiculoId(v.id)}>
                        <IconoTipo codigo={v.tipoVehiculo?.codigo} size={28} className="text-sky-600" />
                        <span className="flex-1">
                          <span className="block font-mono font-semibold text-slate-800">{v.placa}</span>
                          <span className="block text-sm text-slate-500">
                            {[v.tipoVehiculo?.nombre, v.marca, v.modelo].filter(Boolean).join(' · ') || 'Sin datos'}
                          </span>
                        </span>
                        {vehiculoId === v.id && <CheckCircle2 className="text-sky-600" size={20} />}
                      </button>
                      {!v.id_tipo_vehiculo && (
                        <div className="mt-3">
                          <p className="text-xs text-amber-700 mb-2">Indica qué tipo de vehículo es para ver sus servicios:</p>
                          <SelectorTipoVehiculo tipos={tipos} valor={null} onChange={(id) => asignarTipo(v, id)} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {mostrarFormVehiculo ? (
                  <div className="bg-white rounded-xl p-5">
                    <p className="font-medium text-slate-800 mb-3">Registrar vehículo</p>
                    <FormVehiculo
                      tipos={tipos}
                      onCreado={(v) => { setVehiculos((l) => [...l, v]); setVehiculoId(v.id); setMostrarFormVehiculo(false); }}
                      onCancelar={vehiculos.length > 0 ? () => setMostrarFormVehiculo(false) : undefined}
                    />
                  </div>
                ) : (
                  <button onClick={() => setMostrarFormVehiculo(true)} className="text-sm text-sky-600 hover:underline flex items-center gap-1">
                    <Plus size={16} /> Registrar otro vehículo
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ---------- 2. Servicio (cartelera) ---------- */}
        {paso === 2 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800">
              Servicios para tu {vehiculo?.tipoVehiculo?.nombre?.toLowerCase()}{' '}
              <span className="font-mono text-slate-500 text-base">{vehiculo?.placa}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {catalogo.map((s) => {
                const t = tarifaPara(s, vehiculo?.id_tipo_vehiculo);
                return (
                  <button key={s.id} disabled={!t} onClick={() => setServicioId(s.id)}
                    className={`${tarjeta(servicioId === s.id)} ${!t ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <span className={`text-xs font-semibold uppercase ${s.modalidad === 'profunda' ? 'text-purple-600' : 'text-sky-600'}`}>
                      {s.modalidad === 'profunda' ? 'En bahía' : 'Expreso · vamos al sitio'}
                    </span>
                    <h3 className="font-semibold text-slate-800">{s.nombre}</h3>
                    <p className="text-sm text-slate-500">{s.descripcion}</p>
                    {t ? (
                      <p className="mt-2 flex items-center justify-between">
                        <span className="font-bold text-slate-800 text-lg">{dinero(t.precio)}</span>
                        <span className="text-xs text-slate-400 flex items-center gap-1"><Clock size={14} /> {t.duracion_min} min</span>
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">No disponible para {vehiculo?.tipoVehiculo?.nombre?.toLowerCase()}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------- 3. Adicionales (confitería) ---------- */}
        {paso === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Sparkles size={20} className="text-sky-600" /> ¿Algo más?</h2>
              <p className="text-sm text-slate-500">Opcional. Cada extra suma su precio y el tiempo que toma.</p>
            </div>
            {adicionales.length === 0 ? (
              <p className="bg-white rounded-xl p-5 text-sm text-slate-500">Por ahora no hay servicios adicionales. Continúa al siguiente paso.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {adicionales.map((a) => {
                  const sel = adicionalesSel.includes(a.id);
                  return (
                    <button key={a.id} onClick={() => toggleAdicional(a.id)} aria-pressed={sel} className={tarjeta(sel)}>
                      <span className="flex items-start gap-3">
                        <span className={`mt-0.5 w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center ${sel ? 'bg-sky-600 border-sky-600 text-white' : 'border-slate-300'}`}>
                          {sel && <CheckCircle2 size={14} />}
                        </span>
                        <span className="flex-1">
                          <span className="block font-semibold text-slate-800">{a.nombre}</span>
                          {a.descripcion && <span className="block text-sm text-slate-500">{a.descripcion}</span>}
                          <span className="block mt-1 text-sm">
                            <strong>+{dinero(a.precio)}</strong>
                            {a.duracion_min > 0 && <span className="text-slate-400"> · +{a.duracion_min} min</span>}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---------- 4. Lugar ---------- */}
        {paso === 4 && (
          <div className="space-y-4">
            {ciudades.length > 1 && (
              <div>
                <h2 className="text-lg font-bold text-slate-800 mb-2">¿En qué ciudad?</h2>
                <div className="flex flex-wrap gap-2">
                  {ciudades.map((c) => (
                    <button key={c.id} onClick={() => elegirCiudad(c.id)} aria-pressed={ciudadId === c.id}
                      className={`px-4 py-2 rounded-full border text-sm transition ${ciudadId === c.id ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-slate-300 text-slate-700 hover:border-sky-400'}`}>
                      {c.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ciudadId && (
              servicio?.modalidad === 'profunda' ? (
                <div>
                  <h2 className="text-lg font-bold text-slate-800 mb-1">Llevas tu vehículo a nuestro taller</h2>
                  <p className="text-sm text-slate-500 mb-3">La limpieza profunda se hace en bahía; te asignamos la que esté libre en el horario elegido.</p>
                  {estacionamientos.length === 0 ? (
                    <p className="bg-white rounded-xl p-5 text-sm text-slate-500">Todavía no tenemos taller en esta ciudad.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {estacionamientos.map((e) => (
                        <button key={e.id} onClick={() => setEstacionamientoId(e.id)} className={tarjeta(estacionamientoId === e.id)}>
                          <h3 className="font-semibold text-slate-800 flex items-center gap-1.5"><MapPin size={16} className="text-purple-600" /> {e.nombre}</h3>
                          <p className="text-sm text-slate-500">{e.direccion}</p>
                          <p className="text-xs text-slate-400 mt-1">{e.horario_apertura} – {e.horario_cierre}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <h2 className="text-lg font-bold text-slate-800 mb-2">¿Dónde está tu vehículo?</h2>
                  {estacionamientos.length === 0 ? (
                    <p className="bg-white rounded-xl p-5 text-sm text-slate-500">Todavía no hay estacionamientos con este servicio en esta ciudad.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {estacionamientos.map((e) => (
                        <button key={e.id} onClick={() => { setEstacionamientoId(e.id); setADomicilio(false); }} className={tarjeta(estacionamientoId === e.id)}>
                          {e.tipo === 'privado' && <span className="text-xs font-medium text-indigo-600">Parqueadero de tu empresa</span>}
                          <h3 className="font-semibold text-slate-800">{e.nombre}</h3>
                          <p className="text-sm text-slate-500">{e.direccion}</p>
                          <p className="text-xs text-slate-400 mt-1">{e.horario_apertura} – {e.horario_cierre}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {sectores.length > 0 && (
                    <div className="mt-4">
                      <button onClick={() => { setADomicilio(true); setEstacionamientoId(null); }} className={tarjeta(aDomicilio)}>
                        <span className="text-xs font-medium text-emerald-600">Nuevo</span>
                        <h3 className="font-semibold text-slate-800">A domicilio</h3>
                        <p className="text-sm text-slate-500">Vamos con nuestro equipo a tu casa u oficina. Tiene un recargo según tu sector.</p>
                      </button>
                      {aDomicilio && (
                        <div className="bg-white rounded-xl p-4 mt-3">
                          <FormDomicilio sectores={sectores} valor={domicilio} onChange={setDomicilio} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        )}

        {/* ---------- 5. Función (día y hora) ---------- */}
        {paso === 5 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Elige día y hora</h2>
              <p className="text-sm text-slate-500">Tu servicio dura <strong>{total.duracion} min</strong>.</p>
            </div>
            {/* Cartelera de días */}
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
              {proximosDias(diasCartelera).map((d) => {
                const p = partesDia(d);
                const sel = d === fecha;
                return (
                  <button key={d} onClick={() => setFecha(d)} aria-pressed={sel}
                    className={`shrink-0 w-16 rounded-xl py-2 text-center border-2 transition ${sel ? 'bg-sky-600 border-sky-600 text-white' : 'bg-white border-transparent text-slate-600 hover:border-sky-200'}`}>
                    <span className="block text-[11px] uppercase">{d === hoyISO() ? 'hoy' : p.dow}</span>
                    <span className="block text-xl font-bold leading-tight">{p.dia}</span>
                    <span className="block text-[11px] uppercase">{p.mes}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-slate-600">{fechaLarga(fecha)}</p>
            {cargando ? (
              <p className="text-center text-slate-400 py-6">Cargando horarios...</p>
            ) : franjas.filter((f) => !f.pasada).length === 0 ? (
              <p className="bg-white rounded-xl p-5 text-sm text-slate-500 text-center">No quedan horarios este día. Prueba con otro.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {franjas.filter((f) => !f.pasada).map((f) => (
                  <button
                    key={f.hora_inicio}
                    disabled={!f.disponible}
                    onClick={() => setFranjaSel(f)}
                    className={`rounded-lg py-3 text-sm font-medium transition ${
                      !f.disponible
                        ? 'bg-slate-100 text-slate-300 line-through cursor-not-allowed'
                        : franjaSel?.hora_inicio === f.hora_inicio
                          ? 'bg-sky-600 text-white'
                          : 'bg-white border border-sky-200 text-sky-700 hover:bg-sky-50'
                    }`}
                  >
                    {f.hora_inicio}
                    <span className="flex items-center justify-center gap-0.5 text-[10px] font-normal opacity-75">
                      {f.disponible ? <><Armchair size={10} /> {f.cupos} {f.cupos === 1 ? 'cupo' : 'cupos'}</> : 'agotado'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ---------- 6. Boleto (resumen) ---------- */}
        {paso === 6 && servicio && tarifa && franjaSel && (
          <div className="max-w-md mx-auto bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-gradient-to-br from-sky-500 to-blue-700 text-white p-5 flex items-center gap-3">
              <Ticket size={28} />
              <div>
                <p className="text-xs uppercase tracking-wide opacity-80">Resumen de tu reserva</p>
                <p className="font-bold">{fechaLarga(fecha)} · {franjaSel.hora_inicio}–{franjaSel.hora_fin}</p>
              </div>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Vehículo</span>
                <span className="text-right">{vehiculo?.placa} · {vehiculo?.tipoVehiculo?.nombre}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Lugar</span>
                <span className="text-right">
                  {aDomicilio ? `A domicilio · ${domicilio.direccion}` : servicio.modalidad === 'profunda' ? `Bahía · ${lugar?.nombre}` : lugar?.nombre}
                  {aDomicilio && sectorElegido && <span className="block text-xs text-slate-400">{sectorElegido.nombre}</span>}
                  {!aDomicilio && lugar?.ciudad && <span className="block text-xs text-slate-400">{lugar.ciudad.nombre}</span>}
                </span>
              </div>
              <div className="border-t border-dashed border-slate-200 pt-3 flex justify-between gap-3">
                <span>{servicio.nombre} <span className="text-slate-400">({tarifa.duracion_min} min)</span></span>
                <span>
                  {planVip && precioServicioVip !== tarifa.precio && <span className="text-slate-400 line-through mr-1">{dinero(tarifa.precio)}</span>}
                  {dinero(planVip ? precioServicioVip : tarifa.precio)}
                </span>
              </div>
              {extras.map((a) => (
                <div key={a.id} className="flex justify-between gap-3 text-slate-600">
                  <span>+ {a.nombre}{a.duracion_min > 0 && <span className="text-slate-400"> ({a.duracion_min} min)</span>}</span>
                  <span>{dinero(a.precio)}</span>
                </div>
              ))}
              {planVip && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  {incluido
                    ? `Incluido en tu plan ${planVip.nombre} (te quedan ${miPlan?.restantes} este mes).`
                    : `Tu plan ${planVip.nombre} te da ${planVip.descuento_pct}% de descuento${extras.length ? ', también en los adicionales' : ''}.`}
                </p>
              )}
              {recargo > 0 && (
                <div className="flex justify-between gap-3 text-slate-600">
                  <span>+ Recargo a domicilio</span>
                  <span>{dinero(recargo)}</span>
                </div>
              )}
              <div className="border-t border-slate-200 pt-3 flex justify-between text-base font-bold text-slate-800">
                <span>Total</span>
                <span>{dinero(precioTotal)}</span>
              </div>
              {esEmpresa ? (
                <p className="text-xs text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2">
                  A crédito, con la tarifa de tu empresa: no pagas ahora. Se factura en el corte mensual.
                </p>
              ) : aDomicilio ? (
                <p className="text-xs text-slate-400">
                  El equipo sale a tu dirección antes de la hora elegida; te avisamos cuando vaya en camino.
                  Ten lista la toma de agua y de luz: si no podemos lavar, la visita se cobra.
                </p>
              ) : planVip ? null : (
                <p className="text-xs text-slate-400">
                  Si tu edificio tiene un plan contratado, el servicio principal puede salir sin costo; lo verás en el total al confirmar.
                </p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Barra inferior fija: total acumulado + avanzar (cómoda en el celular) */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 z-10" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0 text-sm">
            {tarifa ? (
              <>
                <span className="block font-bold text-slate-800">{dinero(precioTotal)}</span>
                <span className="block text-xs text-slate-500 truncate">
                  {servicio?.nombre}{extras.length > 0 && ` + ${extras.length} extra${extras.length > 1 ? 's' : ''}`} · {total.duracion} min
                </span>
              </>
            ) : (
              <span className="text-slate-400">Paso {paso} de {PASOS.length}</span>
            )}
          </div>
          {paso < 6 ? (
            <button disabled={!puedeAvanzar} onClick={() => irA(paso + 1)}
              className="flex items-center gap-2 bg-sky-600 text-white px-6 py-2.5 rounded-lg hover:bg-sky-700 disabled:opacity-40">
              {paso === 3 && extras.length === 0 ? 'Omitir' : 'Siguiente'} <ArrowRight size={18} />
            </button>
          ) : (
            <button disabled={!franjaSel || cargando || !esCliente} onClick={confirmar}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-40">
              <CheckCircle2 size={18} /> {cargando ? 'Confirmando...' : 'Confirmar reserva'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reservar;
