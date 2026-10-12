import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Plus, Ban, Star, Crown, Receipt, BadgeCheck } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plan, Suscripcion, Estacionamiento, Cliente } from '../types';
import { dinero } from '../utils/catalogo';
import { mesActual, nombreMes } from '../utils/fechas';

/**
 * Planes — dos clases:
 *   Edificios  el plan lo contrata un sitio aliado: N lavados al mes
 *              compartidos entre quienes reservan ahí.
 *   VIP        el plan lo contrata una persona y lo paga cada mes: lavados
 *              incluidos, % de descuento y prioridad de horario. Solo rige en
 *              los meses pagados; el cobro se genera acá y el comprobante del
 *              cliente se aprueba en "Pagos por verificar".
 */

const MODALIDADES: Record<Plan['modalidad'], string> = { expreso: 'Expreso', profunda: 'Profunda', todas: 'Todos los servicios' };

const BarraUso: React.FC<{ usados: number; total: number }> = ({ usados, total }) => (
  <div className="mt-3">
    <div className="flex justify-between text-xs text-slate-500 mb-1">
      <span>Uso del mes</span>
      <span>{usados} / {total}</span>
    </div>
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className="h-2 bg-sky-500 rounded-full" style={{ width: `${Math.min(100, (usados / (total || 1)) * 100)}%` }} />
    </div>
  </div>
);

// ==================== PRIORIDAD VIP (parámetros) ====================
const PARAMS = [
  ['reservas.pago_anticipado', 'Exigir el pago antes del lavado (1 = sí, 0 = no; las empresas nunca)', 1],
  ['reservas.dias_anticipacion', 'Días que cualquier cliente puede reservar adelante', 14],
  ['vip.cupos_reservados', 'Cupos de cada franja apartados para VIP (0 = ninguno)', 0],
  ['vip.horas_liberacion', 'Horas antes de la franja en que lo apartado se libera para todos', 24]
] as const;

const Prioridad: React.FC = () => {
  const { usuario } = useAuth();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState('');
  useEffect(() => {
    api.get('/parametros').then((r) => {
      const v: Record<string, string> = {};
      PARAMS.forEach(([clave, , def]) => {
        v[clave] = (r.data as { clave: string; valor: string }[]).find((p) => p.clave === clave)?.valor ?? String(def);
      });
      setValores(v);
    }).catch(() => {});
  }, []);
  const guardar = async () => {
    setMensaje('');
    try {
      for (const [clave] of PARAMS) await api.put(`/parametros/${clave}`, { valor: valores[clave] });
      setMensaje('Guardado.');
    } catch (e: any) {
      setMensaje(e.message);
    }
  };
  const admin = usuario?.rol === 'admin';
  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <h2 className="font-semibold text-slate-800">Reglas de reserva y prioridad</h2>
      {PARAMS.map(([clave, etiqueta]) => (
        <label key={clave} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-slate-600">{etiqueta}</span>
          <input type="number" min={0} value={valores[clave] ?? ''} disabled={!admin}
            onChange={(e) => setValores({ ...valores, [clave]: e.target.value })}
            className="w-20 px-2 py-1 border border-slate-300 rounded-lg text-right" />
        </label>
      ))}
      <p className="text-xs text-slate-400">
        Un VIP reserva con los días de su plan y puede usar los cupos apartados. El último cupo de un sitio nunca se aparta.
      </p>
      {admin && <button onClick={guardar} className="bg-sky-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-sky-700">Guardar</button>}
      {mensaje && <p className="text-xs text-slate-600">{mensaje}</p>}
    </div>
  );
};

// ==================== FORMULARIO DE PLAN ====================
const FormPlan: React.FC<{ tipo: 'sitio' | 'personal'; onCreado: () => void }> = ({ tipo, onCreado }) => {
  const vacio = {
    nombre: '', descripcion: '', precio_mensual: 0, lavados_incluidos: tipo === 'personal' ? 2 : 10,
    modalidad: 'expreso' as Plan['modalidad'], descuento_pct: tipo === 'personal' ? 10 : 0,
    dias_anticipacion: (tipo === 'personal' ? 30 : '') as number | ''
  };
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState('');
  const campo = 'w-full px-3 py-2 border border-slate-300 rounded-lg';
  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/planes', { ...form, tipo, ...(tipo === 'sitio' && { descuento_pct: 0, dias_anticipacion: null }) });
      setForm(vacio);
      onCreado();
    } catch (err: any) {
      setError(err.message);
    }
  };
  return (
    <form onSubmit={crear} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
      <h2 className="font-semibold text-slate-800">{tipo === 'personal' ? 'Nuevo plan VIP' : 'Nuevo plan de edificio'}</h2>
      <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
        placeholder={tipo === 'personal' ? 'Nombre (ej. VIP Oro)' : 'Nombre (ej. Plan Edificio Básico)'} className={campo} />
      <input value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} placeholder="Descripción (opcional)" className={campo} />
      <div className="grid grid-cols-2 gap-2">
        <div><label className="text-xs text-slate-500">Precio mensual ($)</label>
          <input type="number" min={0} step="0.01" required value={form.precio_mensual}
            onChange={(e) => setForm({ ...form, precio_mensual: parseFloat(e.target.value) || 0 })} className={campo} /></div>
        <div><label className="text-xs text-slate-500">Lavados incluidos/mes</label>
          <input type="number" min={tipo === 'personal' ? 0 : 1} required value={form.lavados_incluidos}
            onChange={(e) => setForm({ ...form, lavados_incluidos: parseInt(e.target.value) || 0 })} className={campo} /></div>
      </div>
      <div><label className="text-xs text-slate-500">Servicios que incluye</label>
        <select value={form.modalidad} onChange={(e) => setForm({ ...form, modalidad: e.target.value as Plan['modalidad'] })} className={campo}>
          {Object.entries(MODALIDADES).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select></div>
      {tipo === 'personal' && (
        <div className="grid grid-cols-2 gap-2">
          <div><label className="text-xs text-slate-500">Descuento en lo demás (%)</label>
            <input type="number" min={0} max={100} value={form.descuento_pct}
              onChange={(e) => setForm({ ...form, descuento_pct: parseFloat(e.target.value) || 0 })} className={campo} /></div>
          <div><label className="text-xs text-slate-500">Reserva hasta (días)</label>
            <input type="number" min={1} max={365} value={form.dias_anticipacion}
              onChange={(e) => setForm({ ...form, dias_anticipacion: e.target.value === '' ? '' : parseInt(e.target.value) || 1 })} className={campo} /></div>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="w-full bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700">Crear plan</button>
    </form>
  );
};

const TablaPlanes: React.FC<{ planes: Plan[]; onCambio: () => void }> = ({ planes, onCambio }) => {
  const alternar = async (plan: Plan) => {
    try {
      await api.put(`/planes/${plan.id}`, { estado: plan.estado === 'activo' ? 'inactivo' : 'activo' });
      onCambio();
    } catch (err: any) {
      alert(err.message);
    }
  };
  const vip = planes.some((p) => p.tipo === 'personal');
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
          <tr>
            <th className="px-4 py-3 text-left">Plan</th>
            <th className="px-4 py-3 text-left">Incluye</th>
            <th className="px-4 py-3 text-right">Precio/mes</th>
            <th className="px-4 py-3 text-right">Lavados</th>
            {vip && <th className="px-4 py-3 text-right">Desc.</th>}
            {vip && <th className="px-4 py-3 text-right">Días</th>}
            <th className="px-4 py-3 text-right">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {planes.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-3 font-medium">{p.nombre}</td>
              <td className="px-4 py-3">{MODALIDADES[p.modalidad]}</td>
              <td className="px-4 py-3 text-right tabular-nums">{dinero(p.precio_mensual)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{p.lavados_incluidos}</td>
              {vip && <td className="px-4 py-3 text-right tabular-nums">{p.descuento_pct ? `${p.descuento_pct}%` : '—'}</td>}
              {vip && <td className="px-4 py-3 text-right tabular-nums">{p.dias_anticipacion ?? '—'}</td>}
              <td className="px-4 py-3 text-right">
                <button onClick={() => alternar(p)} title="Clic para cambiar"
                  className={`text-xs px-2 py-1 rounded-full ${p.estado === 'activo' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                  {p.estado}
                </button>
              </td>
            </tr>
          ))}
          {planes.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Aún no hay planes.</td></tr>}
        </tbody>
      </table>
    </div>
  );
};

// ==================== EDIFICIOS ====================
const PlanesSitio: React.FC<{ planes: Plan[]; suscripciones: Suscripcion[]; onCambio: () => void }> = ({ planes, suscripciones, onCambio }) => {
  const [sitios, setSitios] = useState<Estacionamiento[]>([]);
  const [asignar, setAsignar] = useState<{ id_estacionamiento: number | ''; id_plan: number | '' }>({ id_estacionamiento: '', id_plan: '' });
  const [error, setError] = useState('');
  useEffect(() => { api.get('/estacionamientos').then((r) => setSitios(r.data)).catch(() => {}); }, []);

  const deSitio = suscripciones.filter((s) => s.id_estacionamiento);
  // Los planes de edificio son para sitios aliados, nunca un taller o un parqueadero privado
  const libres = sitios.filter((s) => (s.tipo || 'aliado') === 'aliado' && !deSitio.some((x) => x.id_estacionamiento === s.id));

  const crear = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/planes/suscripciones', asignar);
      setAsignar({ id_estacionamiento: '', id_plan: '' });
      onCambio();
    } catch (err: any) {
      setError(err.message);
    }
  };
  const cancelar = async (id: number) => {
    if (!window.confirm('¿Cancelar esta suscripción? El sitio dejará de tener lavados incluidos.')) return;
    try { await api.put(`/planes/suscripciones/${id}/cancelar`); onCambio(); } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 max-w-2xl">
        Un plan de edificio cubre una cantidad de lavados al mes compartidos entre todos los residentes que reservan
        en ese sitio. Al agotarse el cupo del mes, las siguientes reservas se cobran normalmente.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <FormPlan tipo="sitio" onCreado={onCambio} />
        <form onSubmit={crear} className="bg-white rounded-xl shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-slate-800">Asignar plan a un sitio</h2>
          <select required value={asignar.id_estacionamiento} onChange={(e) => setAsignar({ ...asignar, id_estacionamiento: e.target.value ? Number(e.target.value) : '' })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg">
            <option value="">Seleccione un estacionamiento…</option>
            {libres.map((s) => <option key={s.id} value={s.id}>{s.nombre}{s.ciudad ? ` · ${s.ciudad.nombre}` : ''}</option>)}
          </select>
          <select required value={asignar.id_plan} onChange={(e) => setAsignar({ ...asignar, id_plan: e.target.value ? Number(e.target.value) : '' })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg">
            <option value="">Seleccione un plan…</option>
            {planes.filter((p) => p.estado === 'activo').map((p) => (
              <option key={p.id} value={p.id}>{p.nombre} — {dinero(p.precio_mensual)}/mes ({p.lavados_incluidos} lavados)</option>
            ))}
          </select>
          <button type="submit" disabled={libres.length === 0}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            <Plus size={16} /> Asignar suscripción
          </button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </div>
      <TablaPlanes planes={planes} onCambio={onCambio} />
      <div>
        <h2 className="font-semibold text-slate-800 mb-3">Sitios con plan</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {deSitio.map((s) => (
            <div key={s.id} className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-slate-800">
                    {s.estacionamiento?.nombre}
                    {s.estacionamiento?.ciudad && <span className="text-xs font-normal text-slate-400"> · {s.estacionamiento.ciudad.nombre}</span>}
                  </p>
                  <p className="text-sm text-slate-500">{s.plan?.nombre} · {dinero(s.plan?.precio_mensual)}/mes</p>
                </div>
                <button onClick={() => cancelar(s.id)} title="Cancelar suscripción" className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Ban size={18} /></button>
              </div>
              <BarraUso usados={s.uso_mes_actual ?? 0} total={s.plan?.lavados_incluidos || 0} />
            </div>
          ))}
          {deSitio.length === 0 && <p className="text-slate-400 text-sm">Ningún sitio tiene un plan activo todavía.</p>}
        </div>
        {deSitio.length > 0 && <p className="text-xs text-slate-400 mt-4 flex items-center gap-1"><Star size={12} /> El cupo se reinicia el día 1 de cada mes.</p>}
      </div>
    </div>
  );
};

// ==================== VIP ====================
const etiquetaPago: Record<string, [string, string]> = {
  aprobado: ['pagado', 'bg-green-100 text-green-700'],
  en_verificacion: ['comprobante por verificar', 'bg-amber-100 text-amber-700'],
  pendiente: ['sin pagar', 'bg-red-100 text-red-600'],
  rechazado: ['comprobante rechazado', 'bg-red-100 text-red-600']
};

const PlanesVip: React.FC<{ planes: Plan[]; suscripciones: Suscripcion[]; onCambio: () => void }> = ({ planes, suscripciones, onCambio }) => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [busqueda, setBusqueda] = useState('');
  const [nueva, setNueva] = useState<{ id_cliente: number | ''; id_plan: number | '' }>({ id_cliente: '', id_plan: '' });
  const [mensaje, setMensaje] = useState('');
  const vips = suscripciones.filter((s) => s.id_cliente);

  useEffect(() => {
    if (busqueda.trim().length < 2) { setClientes([]); return; }
    const t = setTimeout(() => {
      api.get('/clientes', { params: { busqueda, tipo: 'persona', estado: 'activo' } }).then((r) => setClientes(r.data)).catch(() => setClientes([]));
    }, 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const ejecutar = async (fn: () => Promise<unknown>, ok: string) => {
    setMensaje('');
    try {
      await fn();
      setMensaje(ok);
      onCambio();
    } catch (err: any) {
      setMensaje(err.message);
    }
  };
  const suscribir = (e: React.FormEvent) => {
    e.preventDefault();
    ejecutar(async () => {
      await api.post('/planes/suscripciones', nueva);
      setNueva({ id_cliente: '', id_plan: '' });
      setBusqueda('');
    }, 'Suscripción creada: queda el cobro del mes por pagar.');
  };
  const registrarPago = (s: Suscripcion) => {
    const efectivo = window.confirm(
      `Registrar el pago de ${nombreMes(mesActual()).toLowerCase()} de ${s.cliente?.nombre} por ${dinero(s.plan?.precio_mensual)}.\n\nAceptar = efectivo · Cancelar = transferencia`
    );
    const referencia = efectivo ? '' : window.prompt('Número de la transferencia (opcional):');
    if (referencia === null) return;
    ejecutar(() => api.post(`/planes/suscripciones/${s.id}/pagos`, { metodo: efectivo ? 'efectivo' : 'transferencia', referencia }),
      'Pago registrado: el plan rige este mes.');
  };
  const cancelar = (s: Suscripcion) => {
    if (!window.confirm(`¿Cancelar el plan VIP de ${s.cliente?.nombre}? Lo ya pagado del mes se respeta.`)) return;
    ejecutar(() => api.put(`/planes/suscripciones/${s.id}/cancelar`), 'Plan cancelado.');
  };
  const generarCobros = async () => {
    setMensaje('');
    try {
      const r = await api.post('/planes/cobros', {});
      setMensaje(`${r.data.generados} cobro(s) generado(s) para ${nombreMes(r.data.periodo).toLowerCase()}.`);
      onCambio();
    } catch (err: any) {
      setMensaje(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-slate-500 max-w-2xl">
        El plan VIP es de una persona y se paga cada mes. Da lavados incluidos, descuento en lo demás y prioridad de horario,
        <b> solo en los meses pagados</b>. El cliente puede suscribirse solo desde "Mi plan VIP" y subir su comprobante, que se aprueba en
        <b> Pagos por verificar</b>.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <FormPlan tipo="personal" onCreado={onCambio} />
        <form onSubmit={suscribir} className="bg-white rounded-xl shadow-sm p-5 space-y-3 h-fit">
          <h2 className="font-semibold text-slate-800">Suscribir a un cliente</h2>
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente (nombre, email, cédula)"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
          {clientes.length > 0 && (
            <select required value={nueva.id_cliente} onChange={(e) => setNueva({ ...nueva, id_cliente: e.target.value ? Number(e.target.value) : '' })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg">
              <option value="">Elija el cliente…</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.email ? ` · ${c.email}` : ''}</option>)}
            </select>
          )}
          <select required value={nueva.id_plan} onChange={(e) => setNueva({ ...nueva, id_plan: e.target.value ? Number(e.target.value) : '' })}
            className="w-full px-3 py-2 border border-slate-300 rounded-lg">
            <option value="">Plan VIP…</option>
            {planes.filter((p) => p.estado === 'activo').map((p) => <option key={p.id} value={p.id}>{p.nombre} — {dinero(p.precio_mensual)}/mes</option>)}
          </select>
          <button type="submit" disabled={!nueva.id_cliente || !nueva.id_plan}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
            <Crown size={16} /> Suscribir
          </button>
        </form>
        <Prioridad />
      </div>
      <TablaPlanes planes={planes} onCambio={onCambio} />
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-semibold text-slate-800">Clientes VIP · {nombreMes(mesActual())}</h2>
          <button onClick={generarCobros} className="flex items-center gap-1 text-sm border border-slate-300 rounded-lg px-3 py-1.5 hover:bg-slate-50">
            <Receipt size={15} /> Generar cobros del mes
          </button>
        </div>
        {mensaje && <p className="text-sm text-slate-600 mb-3">{mensaje}</p>}
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Cliente</th>
                <th className="px-4 py-3 text-left">Plan</th>
                <th className="px-4 py-3 text-left">Mes en curso</th>
                <th className="px-4 py-3 text-right">Lavados</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vips.map((s) => {
                const pago = s.pago_mes_actual;
                const [texto, color] = etiquetaPago[pago?.estado || 'pendiente'];
                return (
                  <tr key={s.id}>
                    <td className="px-4 py-3">{s.cliente?.nombre}<span className="block text-xs text-slate-400">{s.cliente?.email}</span></td>
                    <td className="px-4 py-3">{s.plan?.nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${color}`}>{pago ? texto : 'sin cobro generado'}</span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.uso_mes_actual ?? 0} / {s.plan?.lavados_incluidos}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {!s.vigente && (
                        <button onClick={() => registrarPago(s)} title="Registrar el pago del mes" className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded"><BadgeCheck size={17} /></button>
                      )}
                      <button onClick={() => cancelar(s)} title="Cancelar el plan" className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Ban size={17} /></button>
                    </td>
                  </tr>
                );
              })}
              {vips.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Todavía no hay clientes VIP.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ==================== PÁGINA ====================
const Planes: React.FC = () => {
  const { usuario } = useAuth();
  // Los VIP son de todo el país: el operador de una ciudad maneja solo los de edificio
  const nacional = usuario?.rol === 'admin' || !usuario?.ciudad;
  const [pestana, setPestana] = useState<'sitio' | 'personal'>(nacional ? 'personal' : 'sitio');
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [suscripciones, setSuscripciones] = useState<Suscripcion[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    Promise.all([api.get('/planes'), api.get('/planes/suscripciones')])
      .then(([p, s]) => { setPlanes(p.data); setSuscripciones(s.data); })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);
  useEffect(cargar, [cargar]);

  if (cargando) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600" /></div>;
  }

  const pestanas = [
    { id: 'personal' as const, label: 'VIP (personas)', icono: <Crown size={16} /> },
    { id: 'sitio' as const, label: 'Edificios', icono: <Building2 size={16} /> }
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-4 flex items-center gap-2">
        <Building2 className="text-sky-600" /> Planes
      </h1>
      {nacional && (
        <div className="flex gap-1 border-b mb-6">
          {pestanas.map((p) => (
            <button key={p.id} onClick={() => setPestana(p.id)} aria-pressed={pestana === p.id}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 -mb-px ${pestana === p.id ? 'border-sky-600 text-sky-700 font-medium' : 'border-transparent text-slate-500'}`}>
              {p.icono} {p.label}
            </button>
          ))}
        </div>
      )}
      {pestana === 'personal' && nacional
        ? <PlanesVip planes={planes.filter((p) => p.tipo === 'personal')} suscripciones={suscripciones} onCambio={cargar} />
        : <PlanesSitio planes={planes.filter((p) => (p.tipo || 'sitio') === 'sitio')} suscripciones={suscripciones} onCambio={cargar} />}
    </div>
  );
};

export default Planes;
