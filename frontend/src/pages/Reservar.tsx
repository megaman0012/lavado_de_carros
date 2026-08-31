import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCircle2, Droplets } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { TipoServicio, Estacionamiento, Vehiculo, FranjaDisponibilidad } from '../types';

const hoyISO = () => new Date().toISOString().slice(0, 10);

const Reservar: React.FC = () => {
  const { isAuthenticated, usuario, login, logout } = useAuth();
  const location = useLocation() as any;
  const navigate = useNavigate();

  const [paso, setPaso] = useState(1);
  const [servicios, setServicios] = useState<TipoServicio[]>([]);
  const [estacionamientos, setEstacionamientos] = useState<Estacionamiento[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);

  const [servicioId, setServicioId] = useState<number | null>(location.state?.servicioId || null);
  const [estacionamientoId, setEstacionamientoId] = useState<number | null>(null);
  const [vehiculoId, setVehiculoId] = useState<number | null>(null);
  const [nuevaPlaca, setNuevaPlaca] = useState('');
  const [fecha, setFecha] = useState(hoyISO());
  const [franjas, setFranjas] = useState<FranjaDisponibilidad[]>([]);
  const [franjaSel, setFranjaSel] = useState<FranjaDisponibilidad | null>(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [exito, setExito] = useState<any>(null);
  const [registro, setRegistro] = useState({ nombre: '', email: '', telefono: '', password: '' });
  const [registrando, setRegistrando] = useState(false);

  const servicio = useMemo(() => servicios.find((s) => s.id === servicioId) || null, [servicios, servicioId]);

  useEffect(() => {
    api.get('/public/servicios').then((r) => setServicios(r.data)).catch(() => {});
    api.get('/public/estacionamientos').then((r) => setEstacionamientos(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (isAuthenticated && usuario?.rol === 'cliente') {
      api.get('/vehiculos').then((r) => setVehiculos(r.data)).catch(() => {});
    }
  }, [isAuthenticated, usuario]);

  // Cargar disponibilidad al llegar al paso de fecha
  useEffect(() => {
    if (paso !== 4 || !servicio) return;
    setCargando(true);
    setError('');
    const params: any = { fecha, modalidad: servicio.modalidad, duracion_min: servicio.duracion_min };
    if (servicio.modalidad === 'expreso' && estacionamientoId) params.id_estacionamiento = estacionamientoId;
    api.get('/agenda/disponibilidad', { params })
      .then((r) => setFranjas(r.data.franjas || []))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [paso, fecha, servicio, estacionamientoId]);

  const registrarVehiculo = async () => {
    if (!nuevaPlaca.trim()) return;
    try {
      const r = await api.post('/vehiculos', { placa: nuevaPlaca });
      setVehiculos([...vehiculos, r.data]);
      setVehiculoId(r.data.id);
      setNuevaPlaca('');
    } catch (e: any) {
      setError(e.message);
    }
  };

  const registrarCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registro.nombre.trim() || !registro.email.trim() || !registro.password) return;
    setRegistrando(true);
    setError('');
    try {
      const r = await api.post('/auth/registrar', registro);
      login(r.data.usuario, r.data.token);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRegistrando(false);
    }
  };

  const confirmar = async () => {
    if (!servicio || !vehiculoId || !franjaSel) return;
    setCargando(true);
    setError('');
    try {
      const body: any = {
        id_vehiculo: vehiculoId,
        id_tipo_servicio: servicio.id,
        fecha,
        hora_inicio: franjaSel.hora_inicio
      };
      if (servicio.modalidad === 'expreso') body.id_estacionamiento = estacionamientoId;
      const r = await api.post('/reservas', body);
      setExito(r.data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  };

  // Confirmación exitosa
  if (exito) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle2 className="text-green-500 mx-auto mb-4" size={56} />
          <h1 className="text-xl font-bold text-slate-800 mb-2">¡Reserva registrada!</h1>
          <p className="text-slate-500 text-sm mb-1">Código: <span className="font-mono font-semibold">{exito.codigo}</span></p>
          <p className="text-slate-500 text-sm mb-6">
            {new Date(exito.fecha).toLocaleDateString()} · {exito.hora_inicio}–{exito.hora_fin}
          </p>
          {isAuthenticated ? (
            <Link to="/mis-reservas" className="block bg-sky-600 text-white py-2.5 rounded-lg hover:bg-sky-700">Ver mis reservas</Link>
          ) : (
            <Link to="/login" className="block bg-sky-600 text-white py-2.5 rounded-lg hover:bg-sky-700">Inicia sesión para seguirla</Link>
          )}
        </div>
      </div>
    );
  }

  const puedeAvanzar =
    (paso === 1 && !!servicio) ||
    (paso === 2 && (servicio?.modalidad === 'profunda' || !!estacionamientoId)) ||
    (paso === 3 && (!!vehiculoId || !!nuevaPlaca.trim())) ||
    paso === 4;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-3">
          <button onClick={() => (paso > 1 ? setPaso(paso - 1) : navigate('/'))} className="text-slate-500 hover:text-sky-600">
            <ArrowLeft size={22} />
          </button>
          <Droplets className="text-sky-600" size={24} />
          <h1 className="font-bold text-slate-800">Reservar lavado</h1>
        </div>
      </header>

      {/* Indicador de pasos */}
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-2">
          {['Servicio', 'Lugar', 'Vehículo', 'Fecha y hora'].map((label, i) => (
            <React.Fragment key={label}>
              <div className={`flex items-center gap-2 ${i + 1 <= paso ? 'text-sky-600' : 'text-slate-400'}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i + 1 <= paso ? 'bg-sky-600 text-white' : 'bg-slate-200'}`}>
                  {i + 1}
                </div>
                <span className="text-sm hidden sm:inline">{label}</span>
              </div>
              {i < 3 && <div className={`flex-1 h-0.5 ${i + 1 < paso ? 'bg-sky-600' : 'bg-slate-200'}`} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg">{error}</div>
        )}

        {/* Paso 1: Servicio */}
        {paso === 1 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {servicios.map((s) => (
              <button
                key={s.id}
                onClick={() => { setServicioId(s.id); setFranjaSel(null); }}
                className={`text-left bg-white rounded-xl p-5 border-2 transition ${
                  servicioId === s.id ? 'border-sky-600 ring-2 ring-sky-100' : 'border-transparent hover:border-sky-200'
                }`}
              >
                <span className={`text-xs font-semibold uppercase ${s.modalidad === 'profunda' ? 'text-purple-600' : 'text-sky-600'}`}>
                  {s.modalidad === 'profunda' ? 'En bahía' : 'Expreso'}
                </span>
                <h3 className="font-semibold text-slate-800">{s.nombre}</h3>
                <p className="text-sm text-slate-500">{s.descripcion}</p>
                <p className="mt-2 font-bold text-slate-800">${s.precio.toFixed(2)} · {s.duracion_min} min</p>
              </button>
            ))}
          </div>
        )}

        {/* Paso 2: Lugar */}
        {paso === 2 && (
          servicio?.modalidad === 'profunda' ? (
            <div className="bg-white rounded-xl p-6 text-center">
              <p className="text-slate-700">La limpieza profunda se realiza en nuestras bahías.</p>
              <p className="text-sm text-slate-500 mt-1">Al confirmar te asignaremos la bahía disponible en el horario elegido.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {estacionamientos.map((e) => (
                <button
                  key={e.id}
                  onClick={() => setEstacionamientoId(e.id)}
                  className={`text-left bg-white rounded-xl p-5 border-2 transition ${
                    estacionamientoId === e.id ? 'border-sky-600 ring-2 ring-sky-100' : 'border-transparent hover:border-sky-200'
                  }`}
                >
                  <h3 className="font-semibold text-slate-800">{e.nombre}</h3>
                  <p className="text-sm text-slate-500">{e.direccion}</p>
                  <p className="text-xs text-slate-400 mt-1">{e.horario_apertura} – {e.horario_cierre}</p>
                </button>
              ))}
            </div>
          )
        )}

        {/* Paso 3: Vehículo */}
        {paso === 3 && (
          <div className="space-y-4">
            {!isAuthenticated && (
              <div className="bg-white rounded-xl p-5 space-y-3">
                <p className="text-sm text-slate-600">
                  Crea tu cuenta para registrar tu vehículo y reservar. ¿Ya tienes cuenta?{' '}
                  <Link to="/login" className="text-sky-600 underline font-medium">Inicia sesión</Link>.
                </p>
                <form onSubmit={registrarCliente} className="space-y-3">
                  <input
                    value={registro.nombre}
                    onChange={(e) => setRegistro({ ...registro, nombre: e.target.value })}
                    placeholder="Nombre completo"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                  <input
                    type="email"
                    value={registro.email}
                    onChange={(e) => setRegistro({ ...registro, email: e.target.value })}
                    placeholder="Correo electrónico"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                  <input
                    value={registro.telefono}
                    onChange={(e) => setRegistro({ ...registro, telefono: e.target.value })}
                    placeholder="Teléfono (opcional)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                  <input
                    type="password"
                    value={registro.password}
                    onChange={(e) => setRegistro({ ...registro, password: e.target.value })}
                    placeholder="Contraseña"
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                  <button
                    type="submit"
                    disabled={registrando}
                    className="w-full bg-sky-600 text-white py-2.5 rounded-lg hover:bg-sky-700 disabled:opacity-50"
                  >
                    {registrando ? 'Creando cuenta...' : 'Crear cuenta y continuar'}
                  </button>
                </form>
              </div>
            )}
            {isAuthenticated && usuario?.rol !== 'cliente' && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-sm rounded-lg p-3">
                La cuenta con la que iniciaste sesión ({usuario?.username}, rol {usuario?.rol}) no es de cliente y no puede tener vehículos ni reservar.{' '}
                <button onClick={logout} className="underline font-medium">Cierra sesión</button> y crea una cuenta de cliente para continuar.
              </div>
            )}
            {isAuthenticated && usuario?.rol === 'cliente' && (
              <>
                <div className="bg-white rounded-xl divide-y">
                  {vehiculos.length === 0 && <p className="p-4 text-sm text-slate-500">No tienes vehículos registrados. Agrega uno abajo.</p>}
                  {vehiculos.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setVehiculoId(v.id)}
                      className={`w-full text-left p-4 flex items-center justify-between transition ${
                        vehiculoId === v.id ? 'bg-sky-50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <span className="font-mono font-semibold text-slate-800">{v.placa}</span>
                        <span className="text-sm text-slate-500 ml-2">{[v.marca, v.modelo].filter(Boolean).join(' ')}</span>
                      </div>
                      {vehiculoId === v.id && <CheckCircle2 className="text-sky-600" size={20} />}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={nuevaPlaca}
                    onChange={(e) => setNuevaPlaca(e.target.value.toUpperCase())}
                    placeholder="Placa del vehículo (ej. ABC-123)"
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
                  />
                  <button onClick={registrarVehiculo} className="bg-slate-800 text-white px-4 rounded-lg hover:bg-slate-900 text-sm">
                    Agregar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Paso 4: Fecha y hora */}
        {paso === 4 && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4">
              <label className="block text-sm font-medium text-slate-700 mb-2">Fecha</label>
              <input
                type="date"
                min={hoyISO()}
                value={fecha}
                onChange={(e) => { setFecha(e.target.value); setFranjaSel(null); }}
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
              />
            </div>
            {cargando ? (
              <p className="text-center text-slate-400 py-6">Cargando disponibilidad...</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                {franjas.map((f) => (
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
                    <span className="block text-[10px] font-normal opacity-75">
                      {f.disponible ? `${f.cupos} cupos` : 'ocupado'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Navegación */}
        <div className="mt-6 flex justify-end">
          {paso < 4 ? (
            <button
              disabled={!puedeAvanzar}
              onClick={() => setPaso(paso + 1)}
              className="flex items-center gap-2 bg-sky-600 text-white px-6 py-2.5 rounded-lg hover:bg-sky-700 disabled:opacity-40"
            >
              Siguiente <ArrowRight size={18} />
            </button>
          ) : (
            <button
              disabled={!franjaSel || cargando || !isAuthenticated}
              onClick={confirmar}
              className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded-lg hover:bg-green-700 disabled:opacity-40"
            >
              <CheckCircle2 size={18} /> {cargando ? 'Confirmando...' : 'Confirmar reserva'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
};

export default Reservar;
