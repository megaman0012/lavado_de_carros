import React, { useCallback, useEffect, useState } from 'react';
import { Wrench, PlayCircle, Flag, Camera } from 'lucide-react';
import api from '../services/api';
import { Reserva } from '../types';
import { hoyISO, fechaCorta } from '../utils/fechas';
import { urlArchivo } from '../services/config';

const coloresEstado: Record<string, string> = {
  solicitada: 'bg-amber-100 text-amber-700',
  confirmada: 'bg-sky-100 text-sky-700',
  en_proceso: 'bg-indigo-100 text-indigo-700',
  completada: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-600',
  no_asistio: 'bg-slate-200 text-slate-600'
};


const parseFotos = (json?: string | null): string[] => {
  try { return json ? JSON.parse(json) : []; } catch { return []; }
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
      // La descripción va junto con las fotos: un solo guardado para el lavador
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
          <a key={f} href={urlArchivo(f)} target="_blank" rel="noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-sky-400">
            <img src={urlArchivo(f)} alt="evidencia" className="w-full h-full object-cover" />
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
            ¿Qué se hizo?
          </label>
          <textarea value={observaciones} onChange={(e) => setObservaciones(e.target.value)} rows={3}
            placeholder="Estado en que recibió el vehículo, trabajo realizado, novedades…"
            className="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          <div className="flex items-center gap-2 mt-1">
            <button onClick={guardarNota} disabled={guardandoNota || !observaciones.trim()}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {guardandoNota ? 'Guardando…' : 'Guardar descripción'}
            </button>
            {notaGuardada && <span className="text-xs text-green-600">Guardada</span>}
            <span className="text-xs text-slate-400 ml-auto">El cliente la ve en el acta</span>
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

// ==================== PÁGINA MIS TRABAJOS ====================
const MisTrabajos: React.FC = () => {
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [fecha, setFecha] = useState(hoyISO());
  const [cargando, setCargando] = useState(true);
  const [modalEvidencia, setModalEvidencia] = useState<Reserva | null>(null);

  const cargar = useCallback(() => {
    setCargando(true);
    const params: any = {};
    if (fecha) params.fecha = fecha;
    api.get('/reservas/mis-trabajos', { params })
      .then((r) => setReservas(r.data))
      .catch(() => setReservas([]))
      .finally(() => setCargando(false));
  }, [fecha]);

  useEffect(cargar, [cargar]);

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
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Wrench className="text-sky-600" /> Mis Trabajos
      </h1>

      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap items-center gap-3">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)}
          className="px-3 py-2 border border-slate-300 rounded-lg" />
        {fecha && (
          <button onClick={() => setFecha('')} className="text-sm text-sky-600 hover:underline">
            Ver todos
          </button>
        )}
      </div>

      {cargando ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600" /></div>
      ) : reservas.length === 0 ? (
        <p className="text-slate-500">No tienes trabajos asignados{fecha ? ' para esta fecha' : ''}.</p>
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
              <p className="font-semibold text-slate-800">
                {r.tipoServicio?.nombre}
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${r.modalidad === 'profunda' ? 'bg-purple-100 text-purple-600' : 'bg-sky-100 text-sky-600'}`}>
                  {r.modalidad}
                </span>
              </p>
              {(r.adicionales?.length ?? 0) > 0 && (
                <p className="text-sm font-medium text-sky-700">+ {r.adicionales!.map((a) => a.nombre).join(', ')}</p>
              )}
              <p className="text-sm text-slate-500">
                {r.vehiculo?.placa} · {[r.vehiculo?.tipoVehiculo?.nombre, r.vehiculo?.marca, r.vehiculo?.modelo].filter(Boolean).join(' ')}
              </p>
              <p className="text-sm text-slate-500 mt-2">
                📅 {fechaCorta(r.fecha)} · {r.hora_inicio}–{r.hora_fin}
              </p>
              {r.estacionamiento && <p className="text-sm text-slate-500">📍 {r.estacionamiento.nombre}</p>}
              {r.cliente && <p className="text-sm text-slate-500">👤 {r.cliente.nombre}{r.cliente.telefono ? ` · ${r.cliente.telefono}` : ''}</p>}

              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <button onClick={() => setModalEvidencia(r)}
                  className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800">
                  <Camera size={16} /> Evidencia
                </button>
                <div className="flex gap-2">
                  {r.estado === 'confirmada' && (
                    <button onClick={() => cambiar(r.id, 'iniciar')}
                      className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800">
                      <PlayCircle size={16} /> Iniciar
                    </button>
                  )}
                  {r.estado === 'en_proceso' && (
                    <button onClick={() => cambiar(r.id, 'completar')}
                      className="flex items-center gap-1 text-sm text-green-600 hover:text-green-800">
                      <Flag size={16} /> Completar
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalEvidencia && <ModalEvidencia reserva={modalEvidencia} onClose={() => setModalEvidencia(null)} onDone={cargar} />}
    </div>
  );
};

export default MisTrabajos;
