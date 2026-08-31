import React, { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Check, X, Paperclip, FileText, Inbox } from 'lucide-react';
import api from '../services/api';
import { Pago } from '../types';

/**
 * Bandeja de comprobantes de transferencia que subieron los clientes.
 * Mientras están aquí NO cuentan como ingreso ni saldan la reserva: recién al
 * aprobarlos pasan a 'aprobado'. Un cliente no puede aprobar el suyo.
 */
const PagosPorVerificar: React.FC = () => {
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [cargando, setCargando] = useState(true);
  const [procesando, setProcesando] = useState<number | null>(null);
  const [rechazando, setRechazando] = useState<Pago | null>(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setCargando(true);
    api.get('/pagos/pendientes')
      .then((r) => setPagos(r.data))
      .catch(() => setPagos([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(cargar, [cargar]);

  const verificar = async (pago: Pago, aprobar: boolean, motivoRechazo?: string) => {
    setProcesando(pago.id);
    setError('');
    try {
      await api.put(`/reservas/${pago.id_reserva}/pagos/${pago.id}/verificar`, {
        aprobar,
        motivo: motivoRechazo
      });
      setRechazando(null);
      setMotivo('');
      cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setProcesando(null);
    }
  };

  const esPdf = (url?: string | null) => !!url && url.split('?')[0].toLowerCase().endsWith('.pdf');

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-2 flex items-center gap-2">
        <BadgeCheck className="text-sky-600" /> Pagos por verificar
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        Comprobantes de transferencia enviados por los clientes. No cuentan como ingreso hasta que los apruebe.
      </p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {cargando ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky-600" /></div>
      ) : pagos.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <Inbox className="mx-auto text-slate-300 mb-3" size={44} />
          <p className="text-slate-500">No hay comprobantes esperando validación.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {pagos.map((p) => (
            <div key={p.id} className="bg-white rounded-xl shadow-sm p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-mono font-semibold text-slate-800">{p.reserva?.codigo}</p>
                  <p className="text-sm text-slate-600">{p.reserva?.cliente?.nombre}</p>
                  <p className="text-xs text-slate-400">
                    {p.reserva?.vehiculo?.placa} · {p.reserva?.tipoServicio?.nombre}
                  </p>
                </div>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full whitespace-nowrap">
                  en verificación
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-sm bg-slate-50 rounded-lg p-3 mb-3">
                <span>Servicio<br /><strong>${(p.reserva?.precio_final ?? 0).toFixed(2)}</strong></span>
                <span>Saldo<br /><strong className="text-red-600">${(p.reserva?.saldo ?? 0).toFixed(2)}</strong></span>
                <span>Declarado<br /><strong className="text-sky-700">${p.monto.toFixed(2)}</strong></span>
              </div>

              {p.referencia && (
                <p className="text-xs text-slate-500 mb-2">Referencia: <span className="font-mono">{p.referencia}</span></p>
              )}
              <p className="text-xs text-slate-400 mb-3">
                Enviado el {p.createdAt && new Date(p.createdAt).toLocaleString()}
              </p>

              {p.comprobante_url && (
                esPdf(p.comprobante_url) ? (
                  <a href={p.comprobante_url} target="_blank" rel="noreferrer"
                    className="flex items-center justify-center gap-2 border border-slate-200 rounded-lg py-6 text-sm text-sky-600 hover:bg-slate-50 mb-3">
                    <FileText size={20} /> Abrir comprobante (PDF)
                  </a>
                ) : (
                  <a href={p.comprobante_url} target="_blank" rel="noreferrer"
                    className="block rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-sky-400 mb-3">
                    <img src={p.comprobante_url} alt="Comprobante" className="w-full max-h-64 object-contain bg-slate-50" />
                  </a>
                )
              )}

              {rechazando?.id === p.id ? (
                <div className="space-y-2 border-t pt-3">
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} autoFocus
                    placeholder="Motivo del rechazo (lo verá el cliente)"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setRechazando(null); setMotivo(''); }}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Cancelar</button>
                    <button onClick={() => verificar(p, false, motivo)}
                      disabled={!motivo.trim() || procesando === p.id}
                      className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                      Confirmar rechazo
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 border-t pt-3">
                  <button onClick={() => setRechazando(p)} disabled={procesando === p.id}
                    className="flex-1 flex items-center justify-center gap-1 border border-red-200 text-red-600 py-2 rounded-lg text-sm hover:bg-red-50 disabled:opacity-50">
                    <X size={16} /> Rechazar
                  </button>
                  <button onClick={() => verificar(p, true)} disabled={procesando === p.id}
                    className="flex-1 flex items-center justify-center gap-1 bg-green-600 text-white py-2 rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                    <Check size={16} /> {procesando === p.id ? 'Aprobando…' : 'Aprobar pago'}
                  </button>
                </div>
              )}

              {p.monto !== (p.reserva?.saldo ?? 0) && (
                <p className="text-xs text-amber-600 mt-2 flex items-start gap-1">
                  <Paperclip size={12} className="mt-0.5 shrink-0" />
                  El monto declarado no coincide con el saldo pendiente: verifíquelo contra el comprobante.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default PagosPorVerificar;
