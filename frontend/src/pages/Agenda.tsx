import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Lock, Unlock } from 'lucide-react';
import api from '../services/api';
import { AsignacionAgenda } from '../types';

const hoyISO = () => new Date().toISOString().slice(0, 10);

const Agenda: React.FC = () => {
  const [fecha, setFecha] = useState(hoyISO());
  const [asignaciones, setAsignaciones] = useState<AsignacionAgenda[]>([]);
  const [capacidades, setCapacidades] = useState<{ expreso: number; profunda: number }>({ expreso: 0, profunda: 0 });
  const [cargando, setCargando] = useState(true);
  const [bloqueoHora, setBloqueoHora] = useState({ inicio: '', fin: '', nota: '' });

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/agenda', { params: { fecha } })
      .then((r) => {
        setAsignaciones(r.data.asignaciones);
        setCapacidades(r.data.capacidades);
      })
      .catch(() => setAsignaciones([]))
      .finally(() => setCargando(false));
  }, [fecha]);

  useEffect(cargar, [cargar]);

  const crearBloqueo = async () => {
    if (!bloqueoHora.inicio || !bloqueoHora.fin) {
      alert('Indica hora de inicio y fin del bloqueo');
      return;
    }
    try {
      await api.post('/agenda/bloqueos', { fecha, hora_inicio: bloqueoHora.inicio, hora_fin: bloqueoHora.fin, nota: bloqueoHora.nota });
      setBloqueoHora({ inicio: '', fin: '', nota: '' });
      cargar();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const liberarBloqueo = async (id: number) => {
    if (!window.confirm('¿Liberar este bloqueo?')) return;
    try {
      await api.delete(`/agenda/bloqueos/${id}`);
      cargar();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <CalendarDays className="text-sky-600" /> Agenda
        </h1>
        <div className="flex items-center gap-3">
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none"
          />
          <span className="text-sm text-slate-500">
            Capacidad: <b>{capacidades.expreso}</b> expreso · <b>{capacidades.profunda}</b> profunda
          </span>
        </div>
      </div>

      {/* Bloqueo manual */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
        <p className="text-sm font-medium text-slate-700 mb-3">Bloquear franja manualmente (mantenimiento, imprevistos)</p>
        <div className="flex flex-wrap gap-2">
          <input type="time" value={bloqueoHora.inicio} onChange={(e) => setBloqueoHora({ ...bloqueoHora, inicio: e.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg" />
          <input type="time" value={bloqueoHora.fin} onChange={(e) => setBloqueoHora({ ...bloqueoHora, fin: e.target.value })}
            className="px-3 py-2 border border-slate-300 rounded-lg" />
          <input value={bloqueoHora.nota} onChange={(e) => setBloqueoHora({ ...bloqueoHora, nota: e.target.value })} placeholder="Motivo (opcional)"
            className="flex-1 min-w-[160px] px-3 py-2 border border-slate-300 rounded-lg" />
          <button onClick={crearBloqueo} className="flex items-center gap-1 bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 text-sm">
            <Lock size={16} /> Bloquear
          </button>
        </div>
      </div>

      {/* Listado del día */}
      {cargando ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600" /></div>
      ) : asignaciones.length === 0 ? (
        <p className="text-slate-500">No hay ocupaciones para esta fecha.</p>
      ) : (
        <div className="space-y-3">
          {asignaciones.map((a) => (
            <div key={a.id} className={`bg-white rounded-xl shadow-sm p-4 border-l-4 ${a.id_reserva === null ? 'border-red-400' : 'border-sky-500'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-800">
                    {a.hora_inicio} – {a.hora_fin}
                    {a.reserva && <span className="ml-2 font-mono text-xs text-slate-400">{a.reserva.codigo}</span>}
                  </p>
                  {a.reserva ? (
                    <p className="text-sm text-slate-500">
                      {a.reserva.tipoServicio?.nombre} · {a.reserva.vehiculo?.placa} · {a.reserva.cliente?.nombre}
                      {a.reserva.estacionamiento && ` · 📍 ${a.reserva.estacionamiento.nombre}`}
                    </p>
                  ) : (
                    <p className="text-sm text-red-500">{a.nota || 'Bloqueo manual'}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {a.lavador && <span className="text-xs bg-sky-50 text-sky-700 px-2 py-1 rounded-full">{a.lavador.nombre}</span>}
                  <span className={`text-xs px-2 py-1 rounded-full capitalize ${a.estado === 'cancelado' ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'}`}>
                    {a.estado.replace('_', ' ')}
                  </span>
                  {a.id_reserva === null && a.estado !== 'cancelado' && (
                    <button onClick={() => liberarBloqueo(a.id)} title="Liberar bloqueo" className="text-slate-400 hover:text-green-600">
                      <Unlock size={18} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Agenda;
