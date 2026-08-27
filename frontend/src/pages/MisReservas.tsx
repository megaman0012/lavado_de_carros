import React, { useEffect, useState } from 'react';
import { CalendarCheck, XCircle, Camera, Info, Wrench, Wallet, Star } from 'lucide-react';
import api from '../services/api';
import { Reserva } from '../types';

const coloresEstado: Record<string, string> = {
  solicitada: 'bg-amber-100 text-amber-700',
  confirmada: 'bg-sky-100 text-sky-700',
  en_proceso: 'bg-indigo-100 text-indigo-700',
  completada: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-600',
  no_asistio: 'bg-slate-200 text-slate-600'
};

const etiquetasAccion: Record<string, string> = {
  creacion: 'Reserva creada',
  confirmar: 'Confirmada por el estacionamiento',
  iniciar: 'Lavado iniciado',
  completar: 'Lavado completado',
  cancelar: 'Cancelada',
  no_asistio: 'Marcada como no asistió',
  asignar_lavador: 'Lavador asignado',
  quitar_lavador: 'Lavador desasignado',
  registrar_pago: 'Pago registrado',
  anular_pago: 'Pago anulado'
};

const parseFotos = (json?: string | null): string[] => {
  try { return json ? JSON.parse(json) : []; } catch { return []; }
};

// ==================== MODAL: EVIDENCIA (solo lectura) ====================
const ModalEvidenciaCliente: React.FC<{ reserva: Reserva; onClose: () => void }> = ({ reserva, onClose }) => {
  const fotosAntes = parseFotos(reserva.registro?.fotos_antes);
  const fotosDespues = parseFotos(reserva.registro?.fotos_despues);

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

        {fotosAntes.length === 0 && fotosDespues.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay fotos de este lavado.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400 tracking-wide">Antes</p>
              <Galeria fotos={fotosAntes} vacio="Sin fotos de antes." />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-slate-400 tracking-wide">Después</p>
              <Galeria fotos={fotosDespues} vacio="Sin fotos de después." />
            </div>
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

// ==================== MODAL: CALIFICAR ====================
const ModalCalificar: React.FC<{ reserva: Reserva; onClose: () => void; onDone: () => void }> = ({ reserva, onClose, onDone }) => {
  const [puntuacion, setPuntuacion] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!puntuacion) return;
    setGuardando(true);
    setError('');
    try {
      await api.post(`/reservas/${reserva.id}/calificacion`, { puntuacion, comentario });
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
      <form onSubmit={enviar} className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-800 mb-1">¿Cómo estuvo tu lavado?</h2>
        <p className="text-sm text-slate-500 mb-4">{reserva.codigo} · {reserva.tipoServicio?.nombre}</p>

        <div className="flex justify-center gap-1 mb-4">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setPuntuacion(n)}
              onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}>
              <Star size={32} className={(hover || puntuacion) >= n ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
            </button>
          ))}
        </div>

        <textarea value={comentario} onChange={(e) => setComentario(e.target.value)}
          placeholder="Cuéntanos algo más (opcional)" rows={3}
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm mb-3" />

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Ahora no</button>
          <button type="submit" disabled={!puntuacion || guardando}
            className="bg-sky-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-sky-700 disabled:opacity-50">
            {guardando ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </form>
    </div>
  );
};

// ==================== MODAL: DETALLE DE RESERVA ====================
const ModalDetalle: React.FC<{ id: number; onClose: () => void }> = ({ id, onClose }) => {
  const [reserva, setReserva] = useState<Reserva | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api.get(`/reservas/${id}`)
      .then((r) => setReserva(r.data))
      .catch(() => setReserva(null))
      .finally(() => setCargando(false));
  }, [id]);

  const lavadores = (reserva?.asignaciones || []).filter((a) => a.lavador).map((a) => a.lavador!.nombre);
  const historial = [...(reserva?.historial || [])].sort(
    (a, b) => new Date(a.fecha_cambio).getTime() - new Date(b.fecha_cambio).getTime()
  );
  const totalPagado = (reserva?.pagos || []).filter((p) => p.estado === 'aprobado').reduce((s, p) => s + p.monto, 0);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {cargando ? (
          <div className="flex justify-center py-10"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600" /></div>
        ) : !reserva ? (
          <p className="text-sm text-red-600">No se pudo cargar el detalle de la reserva.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold text-slate-800">{reserva.codigo}</h2>
              <span className={`text-xs px-2 py-1 rounded-full capitalize ${coloresEstado[reserva.estado] || 'bg-slate-100'}`}>
                {reserva.estado.replace('_', ' ')}
              </span>
            </div>
            <p className="text-sm text-slate-500 mb-4">
              {reserva.tipoServicio?.nombre} · {new Date(reserva.fecha).toLocaleDateString()} · {reserva.hora_inicio}–{reserva.hora_fin}
            </p>

            <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
              <Wrench size={16} className="text-slate-400" />
              {lavadores.length > 0 ? `Lavador asignado: ${lavadores.join(', ')}` : 'Aún sin lavador asignado'}
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-600 mb-4">
              <Wallet size={16} className="text-slate-400" />
              {totalPagado >= (reserva.precio_final ?? 0) && (reserva.precio_final ?? 0) > 0
                ? 'Pagado en su totalidad'
                : `Pagado $${totalPagado.toFixed(2)} de $${(reserva.precio_final ?? 0).toFixed(2)}`}
            </div>

            <p className="text-xs font-semibold uppercase text-slate-400 tracking-wide mb-2">Historial</p>
            {historial.length === 0 ? (
              <p className="text-sm text-slate-500 italic">Sin cambios registrados todavía.</p>
            ) : (
              <ol className="relative border-l border-slate-200 ml-2 space-y-4">
                {historial.map((h) => (
                  <li key={h.id} className="ml-4">
                    <span className="absolute -left-[5px] w-2.5 h-2.5 bg-sky-500 rounded-full mt-1.5" />
                    <p className="text-sm font-medium text-slate-700">{etiquetasAccion[h.accion] || h.accion}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(h.fecha_cambio).toLocaleString()}
                    </p>
                    {h.motivo && <p className="text-xs text-slate-500 mt-0.5">{h.motivo}</p>}
                  </li>
                ))}
              </ol>
            )}
          </>
        )}

        <div className="flex justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

const MisReservas: React.FC = () => {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalEvidencia, setModalEvidencia] = useState<Reserva | null>(null);
  const [modalDetalle, setModalDetalle] = useState<number | null>(null);
  const [modalCalificar, setModalCalificar] = useState<Reserva | null>(null);

  const cargar = () => {
    setCargando(true);
    api.get('/mis-reservas')
      .then((r) => setReservas(r.data))
      .catch(() => setReservas([]))
      .finally(() => setCargando(false));
  };

  useEffect(cargar, []);

  const cancelar = async (id: number) => {
    if (!window.confirm('¿Cancelar esta reserva?')) return;
    try {
      await api.put(`/reservas/${id}/cancelar`);
      cargar();
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (cargando) {
    return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600" /></div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <CalendarCheck className="text-sky-600" /> Mis Reservas
      </h1>

      {reservas.length === 0 ? (
        <p className="text-slate-500">Aún no tienes reservas.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {reservas.map((r) => (
            <div key={r.id} className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-sm font-semibold text-slate-700">{r.codigo}</span>
                <span className={`text-xs px-2 py-1 rounded-full capitalize ${coloresEstado[r.estado] || 'bg-slate-100'}`}>
                  {r.estado.replace('_', ' ')}
                </span>
              </div>
              <p className="font-semibold text-slate-800">{r.tipoServicio?.nombre}</p>
              <p className="text-sm text-slate-500">
                {r.vehiculo?.placa} · {[r.vehiculo?.marca, r.vehiculo?.modelo].filter(Boolean).join(' ')}
              </p>
              <p className="text-sm text-slate-500 mt-2">
                📅 {new Date(r.fecha).toLocaleDateString()} · {r.hora_inicio}–{r.hora_fin}
              </p>
              {r.estacionamiento && <p className="text-sm text-slate-500">📍 {r.estacionamiento.nombre}</p>}
              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <span className="font-bold text-slate-800">${(r.precio_final ?? 0).toFixed(2)}</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setModalDetalle(r.id)}
                    className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
                  >
                    <Info size={16} /> Detalle
                  </button>
                  {['en_proceso', 'completada'].includes(r.estado) && (
                    <button
                      onClick={() => setModalEvidencia(r)}
                      className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800"
                    >
                      <Camera size={16} /> Evidencia
                    </button>
                  )}
                  {['solicitada', 'confirmada'].includes(r.estado) && (
                    <button
                      onClick={() => cancelar(r.id)}
                      className="flex items-center gap-1 text-sm text-red-500 hover:text-red-700"
                    >
                      <XCircle size={16} /> Cancelar
                    </button>
                  )}
                  {r.estado === 'completada' && (
                    r.calificacion ? (
                      <span className="flex items-center text-amber-400" title={r.calificacion.comentario || undefined}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} size={14} className={r.calificacion!.puntuacion >= n ? 'fill-amber-400' : 'text-slate-200'} />
                        ))}
                      </span>
                    ) : (
                      <button
                        onClick={() => setModalCalificar(r)}
                        className="flex items-center gap-1 text-sm text-amber-500 hover:text-amber-600"
                      >
                        <Star size={16} /> Calificar
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalEvidencia && <ModalEvidenciaCliente reserva={modalEvidencia} onClose={() => setModalEvidencia(null)} />}
      {modalDetalle !== null && <ModalDetalle id={modalDetalle} onClose={() => setModalDetalle(null)} />}
      {modalCalificar && <ModalCalificar reserva={modalCalificar} onClose={() => setModalCalificar(null)} onDone={cargar} />}
    </div>
  );
};

export default MisReservas;
