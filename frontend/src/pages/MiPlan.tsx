import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Crown, Check, Upload, CalendarClock, Percent, Sparkles } from 'lucide-react';
import api from '../services/api';
import { MiPlan as DatosMiPlan, PagoSuscripcion, Plan } from '../types';
import { dinero } from '../utils/catalogo';
import { nombreMes } from '../utils/fechas';

/**
 * Mi plan VIP — el cliente elige un plan, paga cada mes por transferencia
 * (sube el comprobante) y ve cuántos lavados le quedan. Los beneficios rigen
 * cuando el pago del mes está aprobado.
 */

const MODALIDAD: Record<Plan['modalidad'], string> = { expreso: 'lavados expreso', profunda: 'limpiezas profundas', todas: 'lavados' };

const estadoCobro: Record<string, [string, string]> = {
  pendiente: ['Pendiente de pago', 'bg-red-50 text-red-700 border-red-200'],
  en_verificacion: ['Comprobante en verificación', 'bg-amber-50 text-amber-700 border-amber-200'],
  aprobado: ['Pagado', 'bg-green-50 text-green-700 border-green-200'],
  rechazado: ['Comprobante rechazado', 'bg-red-50 text-red-700 border-red-200']
};

const Beneficios: React.FC<{ plan: Plan }> = ({ plan }) => (
  <ul className="space-y-1.5 text-sm text-slate-600">
    {plan.lavados_incluidos > 0 && (
      <li className="flex gap-2"><Sparkles size={16} className="text-sky-600 shrink-0" /> {plan.lavados_incluidos} {MODALIDAD[plan.modalidad]} incluidos al mes</li>
    )}
    {(plan.descuento_pct ?? 0) > 0 && (
      <li className="flex gap-2"><Percent size={16} className="text-sky-600 shrink-0" /> {plan.descuento_pct}% de descuento en el resto y en los adicionales</li>
    )}
    {plan.dias_anticipacion && (
      <li className="flex gap-2"><CalendarClock size={16} className="text-sky-600 shrink-0" /> Reservas hasta {plan.dias_anticipacion} días adelante, con horarios preferentes</li>
    )}
  </ul>
);

// Subir el comprobante de un cobro del mes
const SubirComprobante: React.FC<{ cobro: PagoSuscripcion; onDone: () => void }> = ({ cobro, onDone }) => {
  const archivo = useRef<HTMLInputElement>(null);
  const [referencia, setReferencia] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const enviar = async (f?: File) => {
    if (!f) return;
    setEnviando(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('comprobante', f);
      if (referencia.trim()) fd.append('referencia', referencia.trim());
      await api.post(`/mi-plan/pagos/${cobro.id}/comprobante`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <div className="space-y-2 mt-3">
      <input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="Número de transferencia (opcional)"
        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" />
      <input ref={archivo} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => enviar(e.target.files?.[0])} />
      <button onClick={() => archivo.current?.click()} disabled={enviando}
        className="w-full flex items-center justify-center gap-2 bg-sky-600 text-white py-2 rounded-lg text-sm hover:bg-sky-700 disabled:opacity-50">
        <Upload size={16} /> {enviando ? 'Enviando…' : `Subir comprobante de ${dinero(cobro.monto)}`}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
};

const MiPlan: React.FC = () => {
  const [datos, setDatos] = useState<DatosMiPlan | null>(null);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    api.get('/mi-plan').then((r) => setDatos(r.data)).catch((e) => setError(e.message));
  }, []);
  useEffect(cargar, [cargar]);

  const suscribirme = async (plan: Plan) => {
    if (!window.confirm(`¿Suscribirse a ${plan.nombre} por ${dinero(plan.precio_mensual)} al mes?\n\nLos beneficios empiezan cuando confirmemos el pago del mes.`)) return;
    setError('');
    try {
      await api.post('/mi-plan', { id_plan: plan.id });
      setMensaje('¡Listo! Transfiera el valor del mes y suba el comprobante aquí abajo.');
      cargar();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const cancelar = async () => {
    if (!window.confirm('¿Cancelar su plan VIP? Lo ya pagado de este mes se respeta; desde el mes que viene deja de cobrarse.')) return;
    try {
      await api.put('/mi-plan/cancelar');
      setMensaje('Plan cancelado.');
      cargar();
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!datos) return <p className="text-slate-400">{error || 'Cargando…'}</p>;
  const s = datos.suscripcion;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Crown className="text-amber-500" /> Mi plan VIP
      </h1>
      {mensaje && <p className="mb-4 text-sm bg-green-50 text-green-700 border border-green-200 rounded-lg p-3">{mensaje}</p>}
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {datos.es_empresa ? (
        <p className="text-slate-600">Su cuenta es de empresa: tiene tarifas pactadas y se le factura con el corte mensual (ver "Mi flota").</p>
      ) : s && s.plan ? (
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-2xl p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-amber-700">Su plan</p>
                <h2 className="text-xl font-bold text-slate-800">{s.plan.nombre}</h2>
                <p className="text-sm text-slate-500">{dinero(s.plan.precio_mensual)} al mes</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${s.vigente ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                {s.vigente ? 'activo este mes' : 'sin pagar este mes'}
              </span>
            </div>
            <div className="mt-4"><Beneficios plan={s.plan} /></div>
            {s.plan.lavados_incluidos > 0 && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-slate-600 mb-1">
                  <span>Lavados incluidos este mes</span>
                  <span><b>{datos.restantes}</b> de {s.plan.lavados_incluidos} disponibles</span>
                </div>
                <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
                  <div className="h-2 bg-amber-500 rounded-full" style={{ width: `${Math.min(100, ((s.uso_mes_actual ?? 0) / s.plan.lavados_incluidos) * 100)}%` }} />
                </div>
              </div>
            )}
            {!s.vigente && <p className="text-xs text-red-600 mt-3">Los beneficios se activan cuando confirmemos el pago del mes.</p>}
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5">
            <h3 className="font-semibold text-slate-800 mb-3">Mensualidades</h3>
            <ul className="divide-y">
              {(s.pagos || []).map((p) => {
                const [texto, color] = estadoCobro[p.estado];
                return (
                  <li key={p.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-slate-700">{nombreMes(p.periodo)} · {dinero(p.monto)}</span>
                      <span className={`text-xs px-2 py-1 rounded-full border ${color}`}>{texto}</span>
                    </div>
                    {p.estado === 'rechazado' && p.motivo_rechazo && <p className="text-xs text-red-600 mt-1">{p.motivo_rechazo}</p>}
                    {['pendiente', 'rechazado'].includes(p.estado) && <SubirComprobante cobro={p} onDone={() => { setMensaje('Comprobante recibido: lo verificamos y le avisamos.'); cargar(); }} />}
                  </li>
                );
              })}
            </ul>
          </div>

          <button onClick={cancelar} className="text-sm text-red-600 hover:underline">Cancelar mi plan</button>
        </div>
      ) : (
        <div>
          <p className="text-slate-600 mb-6">
            Con un plan VIP tiene lavados incluidos cada mes, descuento en todo lo demás y prioridad para reservar los mejores horarios.
          </p>
          {datos.planes.length === 0 ? (
            <p className="text-slate-500">Por ahora no hay planes VIP disponibles.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {datos.planes.map((p) => (
                <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 flex flex-col">
                  <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><Crown size={18} className="text-amber-500" /> {p.nombre}</h2>
                  <p className="text-2xl font-bold text-slate-800 my-2">{dinero(p.precio_mensual)}<span className="text-sm font-normal text-slate-500"> /mes</span></p>
                  {p.descripcion && <p className="text-sm text-slate-500 mb-3">{p.descripcion}</p>}
                  <Beneficios plan={p} />
                  <button onClick={() => suscribirme(p)}
                    className="mt-5 w-full flex items-center justify-center gap-2 bg-amber-500 text-white py-2 rounded-lg hover:bg-amber-600">
                    <Check size={16} /> Quiero este plan
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MiPlan;
