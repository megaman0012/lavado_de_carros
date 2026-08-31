import React, { useCallback, useEffect, useState } from 'react';
import { CalendarCheck, CheckCircle2, PlayCircle, Flag, XCircle, UserPlus, Camera, Trash2, Wallet, FileText, Plus, Paperclip, Check, Clock3 } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { descargarActa } from '../services/descargas';
import ModalNuevaReserva from '../components/ModalNuevaReserva';
import { Reserva, Lavador } from '../types';

const coloresEstado: Record<string, string> = {
  solicitada: 'bg-amber-100 text-amber-700',
  confirmada: 'bg-sky-100 text-sky-700',
  en_proceso: 'bg-indigo-100 text-indigo-700',
  completada: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-600',
  no_asistio: 'bg-slate-200 text-slate-600'
};

const hoyISO = () => new Date().toISOString().slice(0, 10);

const parseFotos = (json?: string | null): string[] => {
  try { return json ? JSON.parse(json) : []; } catch { return []; }
};

// ==================== MODAL: ASIGNAR LAVADOR ====================
const ModalAsignar: React.FC<{ reserva: Reserva; onClose: () => void; onDone: () => void }> = ({ reserva, onClose, onDone }) => {
  const [lavadores, setLavadores] = useState<Lavador[]>([]);
  const [seleccion, setSeleccion] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const asignadoActual = reserva.asignaciones?.find((a) => a.lavador)?.lavador?.id;

  useEffect(() => {
    api.get('/lavadores', { params: { estado: 'activo' } })
      .then((r) => setLavadores(r.data))
      .catch(() => setLavadores([]));
  }, []);

  const guardar = async (id_lavador: number | null) => {
    setGuardando(true);
    setError('');
    try {
      await api.put(`/reservas/${reserva.id}/asignar-lavador`, { id_lavador });
      onDone();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-800 mb-1">Asignar lavador</h2>
        <p className="text-sm text-slate-500 mb-4">
          {reserva.codigo} · {reserva.hora_inicio}–{reserva.hora_fin} · {reserva.vehiculo?.placa}
        </p>
        <select value={seleccion} onChange={(e) => setSeleccion(e.target.value ? Number(e.target.value) : '')}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg mb-4">
          <option value="">Seleccione un lavador…</option>
          {lavadores.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
        </select>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <div className="flex justify-between gap-2">
          {asignadoActual ? (
            <button disabled={guardando} onClick={() => guardar(null)}
              className="text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg text-sm flex items-center gap-1">
              <Trash2 size={16} /> Quitar asignación
            </button>
          ) : <span />}
          <div className="flex gap-2 ml-auto">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cancelar</button>
            <button disabled={!seleccion || guardando} onClick={() => guardar(seleccion as number)}
              className="bg-sky-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-sky-700 disabled:opacity-50">
              {guardando ? 'Asignando…' : 'Asignar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==================== MODAL: EVIDENCIA FOTOGRÁFICA ====================
const ModalEvidencia: React.FC<{ reserva: Reserva; onClose: () => void; onDone: () => void }> = ({ reserva, onClose, onDone }) => {
  const [registro, setRegistro] = useState(reserva.registro || null);
  const [tipo, setTipo] = useState<'antes' | 'despues'>('antes');
  const [observaciones, setObservaciones] = useState(reserva.registro?.observaciones || '');
  const [subiendo, setSubiendo] = useState(false);
  const [guardandoNota, setGuardandoNota] = useState(false);
  const [notaGuardada, setNotaGuardada] = useState(false);
  const [error, setError] = useState('');

  const subir = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setSubiendo(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('tipo', tipo);
      Array.from(files).forEach((f) => fd.append('fotos', f));
      // La descripción viaja con las fotos: es un solo guardado para el operador
      if (observaciones.trim()) fd.append('observaciones', observaciones.trim());
      const r = await api.post(`/reservas/${reserva.id}/evidencia`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setRegistro(r.data);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const guardarNota = async () => {
    if (!observaciones.trim()) return;
    setGuardandoNota(true);
    setError('');
    setNotaGuardada(false);
    try {
      const fd = new FormData();
      fd.append('observaciones', observaciones.trim());
      const r = await api.post(`/reservas/${reserva.id}/evidencia`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setRegistro(r.data);
      setNotaGuardada(true);
      setTimeout(() => setNotaGuardada(false), 2500);
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardandoNota(false);
    }
  };

  const Galeria: React.FC<{ fotos: string[]; vacio: string }> = ({ fotos, vacio }) => (
    fotos.length === 0 ? (
      <p className="text-xs text-slate-400 italic">{vacio}</p>
    ) : (
      <div className="grid grid-cols-3 gap-2 mt-2">
        {fotos.map((f) => (
          <a key={f} href={f} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-sky-400">
            <img src={f} alt="evidencia" className="w-full h-full object-cover" />
          </a>
        ))}
      </div>
    )
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-800 mb-1">Evidencia fotográfica</h2>
        <p className="text-sm text-slate-500 mb-4">{reserva.codigo} · {reserva.tipoServicio?.nombre}</p>

        <div className="flex gap-2 mb-3">
          {(['antes', 'despues'] as const).map((t) => (
            <button key={t} onClick={() => setTipo(t)}
              className={`px-4 py-1.5 rounded-full text-sm capitalize ${tipo === t ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              {t}
            </button>
          ))}
        </div>

        <label className={`block border-2 border-dashed rounded-lg p-4 text-center text-sm cursor-pointer transition
          ${subiendo ? 'border-sky-300 bg-sky-50 text-sky-600' : 'border-slate-300 text-slate-500 hover:border-sky-400 hover:text-sky-600'}`}>
          <Camera size={20} className="inline mr-2 -mt-1" />
          {subiendo ? 'Subiendo…' : `Clic para subir fotos (${tipo}) — máx. 6 imágenes de 5 MB`}
          <input type="file" accept="image/*" multiple hidden disabled={subiendo} onChange={(e) => { subir(e.target.files); e.target.value = ''; }} />
        </label>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

        <div className="mt-4">
          <label className="text-xs font-semibold uppercase text-slate-400 tracking-wide">
            Descripción del trabajo
          </label>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3}
            placeholder="Qué se hizo, estado en que se recibió el vehículo, novedades…"
            className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <div className="flex items-center gap-2 mt-1">
            <button onClick={guardarNota} disabled={guardandoNota || !observaciones.trim()}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {guardandoNota ? 'Guardando…' : 'Guardar descripción'}
            </button>
            {notaGuardada && <span className="text-xs text-green-600">Guardada</span>}
            <span className="text-xs text-slate-400 ml-auto">Sale en el acta de servicio</span>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400 tracking-wide">Antes</p>
            <Galeria fotos={parseFotos(registro?.fotos_antes)} vacio="Sin fotos de antes." />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-slate-400 tracking-wide">Después</p>
            <Galeria fotos={parseFotos(registro?.fotos_despues)} vacio="Sin fotos de después." />
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

// ==================== MODAL: PAGOS ====================
const ModalPago: React.FC<{ reserva: Reserva; onClose: () => void; onDone: () => void }> = ({ reserva, onClose, onDone }) => {
  const { usuario } = useAuth();
  const [detalle, setDetalle] = useState(reserva);
  const [monto, setMonto] = useState('');
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia'>('efectivo');
  const [referencia, setReferencia] = useState('');
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const recargar = () => {
    api.get(`/reservas/${reserva.id}`).then((r) => setDetalle(r.data)).catch(() => {});
  };

  const pagosAprobados = (detalle.pagos || []).filter((p) => p.estado === 'aprobado');
  // Comprobantes que envió el cliente y todavía no cuentan como ingreso
  const enVerificacion = (detalle.pagos || []).filter((p) => p.estado === 'en_verificacion');
  const totalPagado = pagosAprobados.reduce((s, p) => s + p.monto, 0);
  const saldo = Math.max((detalle.precio_final || 0) - totalPagado, 0);

  const verificar = async (pagoId: number, aprobar: boolean) => {
    const motivo = aprobar ? undefined : window.prompt('Motivo del rechazo (lo verá el cliente):') || '';
    if (!aprobar && !motivo?.trim()) return;
    try {
      await api.put(`/reservas/${reserva.id}/pagos/${pagoId}/verificar`, { aprobar, motivo });
      recargar();
      onDone();
    } catch (err: any) {
      alert(err.message);
    }
  };

  useEffect(() => {
    if (saldo > 0) setMonto(saldo.toFixed(2));
  }, [detalle.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const registrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setError('');
    try {
      // multipart siempre: el comprobante es opcional pero el endpoint es el mismo
      const fd = new FormData();
      fd.append('monto', monto);
      fd.append('metodo', metodo);
      if (referencia) fd.append('referencia', referencia);
      if (comprobante) fd.append('comprobante', comprobante);
      await api.post(`/reservas/${reserva.id}/pagos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setReferencia('');
      setComprobante(null);
      recargar();
      onDone();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const anular = async (pagoId: number) => {
    if (!window.confirm('¿Anular este pago?')) return;
    try {
      await api.delete(`/reservas/${reserva.id}/pagos/${pagoId}`);
      recargar();
      onDone();
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-800 mb-1">Pagos</h2>
        <p className="text-sm text-slate-500 mb-4">{reserva.codigo} · {reserva.tipoServicio?.nombre}</p>

        <div className="flex justify-between text-sm bg-slate-50 rounded-lg p-3 mb-4">
          <span>Total: <strong>${(detalle.precio_final ?? 0).toFixed(2)}</strong></span>
          <span>Pagado: <strong className="text-green-600">${totalPagado.toFixed(2)}</strong></span>
          <span>Saldo: <strong className={saldo > 0 ? 'text-red-600' : 'text-slate-400'}>${saldo.toFixed(2)}</strong></span>
        </div>

        {enVerificacion.length > 0 && (
          <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mb-4">
            <p className="text-xs font-semibold uppercase text-amber-700 tracking-wide flex items-center gap-1 mb-2">
              <Clock3 size={14} /> Comprobante enviado por el cliente
            </p>
            {enVerificacion.map((p) => (
              <div key={p.id} className="text-sm">
                <span className="font-medium">${p.monto.toFixed(2)}</span>
                <span className="text-slate-500"> · {p.metodo}</span>
                {p.referencia && <span className="text-slate-500"> · {p.referencia}</span>}
                {p.comprobante_url && (
                  <a href={p.comprobante_url} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline ml-2">
                    <Paperclip size={12} /> Ver
                  </a>
                )}
                <div className="flex gap-2 mt-2">
                  <button onClick={() => verificar(p.id, false)}
                    className="flex-1 border border-red-200 text-red-600 py-1.5 rounded-lg text-xs hover:bg-red-50">
                    Rechazar
                  </button>
                  <button onClick={() => verificar(p.id, true)}
                    className="flex-1 bg-green-600 text-white py-1.5 rounded-lg text-xs hover:bg-green-700 flex items-center justify-center gap-1">
                    <Check size={13} /> Aprobar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {pagosAprobados.length === 0 ? (
          <p className="text-xs text-slate-400 italic mb-4">Sin pagos registrados.</p>
        ) : (
          <ul className="divide-y border rounded-lg mb-4">
            {pagosAprobados.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <div>
                  <span className="font-medium">${p.monto.toFixed(2)}</span>
                  <span className="text-slate-400"> · {p.metodo}</span>
                  {p.referencia && <span className="text-slate-400"> · {p.referencia}</span>}
                  <span className="block text-xs text-slate-400">{p.fecha_pago && new Date(p.fecha_pago).toLocaleString()}</span>
                  {p.comprobante_url && (
                    <a href={p.comprobante_url} target="_blank" rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-sky-600 hover:underline mt-0.5">
                      <Paperclip size={12} /> Ver comprobante
                    </a>
                  )}
                </div>
                {usuario?.rol === 'admin' && (
                  <button onClick={() => anular(p.id)} title="Anular pago" className="text-red-500 hover:text-red-700">
                    <Trash2 size={16} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {saldo > 0 ? (
          <form onSubmit={registrar} className="space-y-3 border-t pt-4">
            <p className="text-xs font-semibold uppercase text-slate-400 tracking-wide">Registrar pago</p>
            <div className="flex gap-2">
              <input type="number" step="0.01" min="0.01" required value={monto} onChange={(e) => setMonto(e.target.value)}
                placeholder="Monto" className="flex-1 px-3 py-2 border border-slate-300 rounded-lg" />
              <select value={metodo} onChange={(e) => setMetodo(e.target.value as 'efectivo' | 'transferencia')}
                className="px-3 py-2 border border-slate-300 rounded-lg">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
              </select>
            </div>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)}
              placeholder={metodo === 'transferencia' ? 'N.° de transferencia (opcional)' : 'Referencia (opcional)'}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg" />

            <label className="block border-2 border-dashed border-slate-300 rounded-lg p-3 text-center text-sm cursor-pointer text-slate-500 hover:border-sky-400 hover:text-sky-600">
              <Paperclip size={16} className="inline mr-1 -mt-0.5" />
              {comprobante ? comprobante.name : 'Adjuntar comprobante (imagen o PDF, opcional)'}
              <input type="file" accept="image/*,application/pdf" hidden
                onChange={(e) => setComprobante(e.target.files?.[0] || null)} />
            </label>
            {comprobante && (
              <button type="button" onClick={() => setComprobante(null)}
                className="text-xs text-slate-400 hover:text-red-500 -mt-1">Quitar archivo</button>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={guardando}
              className="w-full bg-sky-600 text-white py-2 rounded-lg text-sm hover:bg-sky-700 disabled:opacity-50">
              {guardando ? 'Guardando…' : 'Registrar pago'}
            </button>
            <p className="text-xs text-slate-400 text-center pt-1">
              Pago con tarjeta: pasarela (Stripe/MercadoPago) todavía no conectada.
            </p>
          </form>
        ) : (
          <p className="text-sm text-green-600 font-medium border-t pt-4">✓ Reserva pagada por completo.</p>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

// ==================== PÁGINA RESERVAS ====================
const Reservas: React.FC = () => {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [filtros, setFiltros] = useState({ fecha: hoyISO(), estado: '', modalidad: '' });
  const [cargando, setCargando] = useState(true);
  const [modalAsignar, setModalAsignar] = useState<Reserva | null>(null);
  const [modalEvidencia, setModalEvidencia] = useState<Reserva | null>(null);
  const [modalPago, setModalPago] = useState<Reserva | null>(null);
  const [modalNueva, setModalNueva] = useState(false);
  const [descargando, setDescargando] = useState<number | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    const params: any = {};
    if (filtros.fecha) params.fecha = filtros.fecha;
    if (filtros.estado) params.estado = filtros.estado;
    if (filtros.modalidad) params.modalidad = filtros.modalidad;
    api.get('/reservas', { params })
      .then((r) => setReservas(r.data))
      .catch(() => setReservas([]))
      .finally(() => setCargando(false));
  }, [filtros]);

  useEffect(cargar, [cargar]);

  const bajarActa = async (r: Reserva) => {
    setDescargando(r.id);
    try {
      await descargarActa(r.id, r.codigo);
    } catch (e: any) {
      alert(e.message || 'No se pudo generar el acta');
    } finally {
      setDescargando(null);
    }
  };

  const cambiar = async (id: number, accion: string) => {
    try {
      await api.put(`/reservas/${id}/${accion}`);
      cargar();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <CalendarCheck className="text-sky-600" /> Reservas
        </h1>
        <button onClick={() => setModalNueva(true)}
          className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-sky-700">
          <Plus size={17} /> Nueva reserva
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap gap-3">
        <input type="date" value={filtros.fecha} onChange={(e) => setFiltros({ ...filtros, fecha: e.target.value })}
          className="px-3 py-2 border border-slate-300 rounded-lg" />
        <select value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}
          className="px-3 py-2 border border-slate-300 rounded-lg">
          <option value="">Todos los estados</option>
          {Object.keys(coloresEstado).map((e) => <option key={e} value={e}>{e.replace('_', ' ')}</option>)}
        </select>
        <select value={filtros.modalidad} onChange={(e) => setFiltros({ ...filtros, modalidad: e.target.value })}
          className="px-3 py-2 border border-slate-300 rounded-lg">
          <option value="">Ambas modalidades</option>
          <option value="expreso">Expreso</option>
          <option value="profunda">Profunda</option>
        </select>
      </div>

      {cargando ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600" /></div>
      ) : reservas.length === 0 ? (
        <p className="text-slate-500">No hay reservas con esos filtros.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Código</th>
                <th className="px-4 py-3 text-left">Servicio</th>
                <th className="px-4 py-3 text-left">Cliente / Vehículo</th>
                <th className="px-4 py-3 text-left">Fecha y hora</th>
                <th className="px-4 py-3 text-left">Lavador</th>
                <th className="px-4 py-3 text-left">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {reservas.map((r) => {
                const lavadoresAsignados = (r.asignaciones || []).filter((a) => a.lavador).map((a) => a.lavador!.nombre);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono font-semibold">{r.codigo}</td>
                    <td className="px-4 py-3">
                      {r.tipoServicio?.nombre}
                      <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${r.modalidad === 'profunda' ? 'bg-purple-100 text-purple-600' : 'bg-sky-100 text-sky-600'}`}>
                        {r.modalidad}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.cliente?.nombre}
                      <span className="block text-xs text-slate-400 font-mono">{r.vehiculo?.placa}</span>
                    </td>
                    <td className="px-4 py-3">
                      {new Date(r.fecha).toLocaleDateString()}
                      <span className="block text-xs text-slate-400">{r.hora_inicio}–{r.hora_fin}</span>
                    </td>
                    <td className="px-4 py-3">
                      {lavadoresAsignados.length > 0 ? (
                        <span className="text-xs bg-sky-50 text-sky-700 px-2 py-1 rounded-full">{lavadoresAsignados.join(', ')}</span>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full capitalize ${coloresEstado[r.estado]}`}>{r.estado.replace('_', ' ')}</span>
                      {(() => {
                        const pagado = (r.pagos || []).filter((p) => p.estado === 'aprobado').reduce((s, p) => s + p.monto, 0);
                        const completo = pagado >= (r.precio_final ?? 0) && (r.precio_final ?? 0) > 0;
                        return (
                          <span className={`block mt-1 text-xs ${completo ? 'text-green-600' : pagado > 0 ? 'text-amber-600' : 'text-slate-300'}`}>
                            {completo ? '✓ pagado' : pagado > 0 ? `pagado $${pagado.toFixed(2)}` : 'sin pagar'}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => bajarActa(r)} disabled={descargando === r.id}
                          title="Acta de servicio (PDF con fotos)"
                          className="p-1.5 text-slate-500 hover:bg-slate-100 rounded disabled:opacity-40">
                          <FileText size={18} />
                        </button>
                        {!['cancelada', 'no_asistio'].includes(r.estado) && (
                          <button onClick={() => setModalPago(r)} title="Pagos" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded">
                            <Wallet size={18} />
                          </button>
                        )}
                        {['solicitada', 'confirmada', 'en_proceso'].includes(r.estado) && (
                          <button onClick={() => setModalAsignar(r)} title="Asignar lavador" className="p-1.5 text-cyan-600 hover:bg-cyan-50 rounded">
                            <UserPlus size={18} />
                          </button>
                        )}
                        {['en_proceso', 'completada'].includes(r.estado) && (
                          <button onClick={() => setModalEvidencia(r)} title="Evidencia fotográfica" className="p-1.5 text-purple-600 hover:bg-purple-50 rounded">
                            <Camera size={18} />
                          </button>
                        )}
                        {r.estado === 'solicitada' && (
                          <button onClick={() => cambiar(r.id, 'confirmar')} title="Confirmar" className="p-1.5 text-sky-600 hover:bg-sky-50 rounded">
                            <CheckCircle2 size={18} />
                          </button>
                        )}
                        {r.estado === 'confirmada' && (
                          <button onClick={() => cambiar(r.id, 'iniciar')} title="Iniciar" className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded">
                            <PlayCircle size={18} />
                          </button>
                        )}
                        {r.estado === 'en_proceso' && (
                          <button onClick={() => cambiar(r.id, 'completar')} title="Completar" className="p-1.5 text-green-600 hover:bg-green-50 rounded">
                            <Flag size={18} />
                          </button>
                        )}
                        {['solicitada', 'confirmada'].includes(r.estado) && (
                          <button onClick={() => cambiar(r.id, 'cancelar')} title="Cancelar" className="p-1.5 text-red-500 hover:bg-red-50 rounded">
                            <XCircle size={18} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalAsignar && <ModalAsignar reserva={modalAsignar} onClose={() => setModalAsignar(null)} onDone={cargar} />}
      {modalEvidencia && <ModalEvidencia reserva={modalEvidencia} onClose={() => setModalEvidencia(null)} onDone={cargar} />}
      {modalPago && <ModalPago reserva={modalPago} onClose={() => setModalPago(null)} onDone={cargar} />}
      {modalNueva && <ModalNuevaReserva onClose={() => setModalNueva(false)} onCreada={cargar} />}
    </div>
  );
};

export default Reservas;
