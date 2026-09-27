import React, { useEffect, useState } from 'react';
import { BarChart3, Car, DollarSign, Percent, AlertCircle, FileSpreadsheet, FileText, Star } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../services/api';
import { descargarArchivo } from '../services/descargas';
import { hoyISO } from '../utils/fechas';
import { KPIs } from '../types';

const descargar = (formato: 'excel' | 'pdf') => descargarArchivo(
  `/reportes/exportar/${formato}`,
  `reporte-total-clean-car-${hoyISO()}.${formato === 'excel' ? 'xlsx' : 'pdf'}`
);

const Reportes: React.FC<{ resumen?: boolean }> = ({ resumen }) => {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [porServicio, setPorServicio] = useState<any[]>([]);
  const [ingresos, setIngresos] = useState<any[]>([]);
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null);

  useEffect(() => {
    api.get('/reportes/kpis').then((r) => setKpis(r.data)).catch(() => {});
    if (!resumen) {
      api.get('/reportes/por-servicio').then((r) => setPorServicio(r.data)).catch(() => {});
      api.get('/reportes/ingresos').then((r) => setIngresos(r.data)).catch(() => {});
    }
  }, [resumen]);

  const exportar = async (formato: 'excel' | 'pdf') => {
    setExportando(formato);
    try {
      await descargar(formato);
    } catch (e: any) {
      alert(e.message || 'Error al exportar el reporte');
    } finally {
      setExportando(null);
    }
  };

  const tarjetas = [
    { titulo: 'Lavados hoy', valor: kpis?.lavados_hoy ?? '—', icono: <Car className="text-sky-600" />, color: 'bg-sky-50' },
    { titulo: 'Lavados del mes', valor: kpis?.lavados_mes ?? '—', icono: <BarChart3 className="text-indigo-600" />, color: 'bg-indigo-50' },
    { titulo: 'Ingresos del mes', valor: kpis ? `$${kpis.ingresos_mes.toFixed(2)}` : '—', icono: <DollarSign className="text-green-600" />, color: 'bg-green-50' },
    { titulo: 'Ocupación de hoy', valor: kpis ? `${kpis.ocupacion_hoy_pct}%` : '—', icono: <Percent className="text-purple-600" />, color: 'bg-purple-50' },
    { titulo: 'Calificación promedio', valor: kpis?.calificacion_promedio != null ? `${kpis.calificacion_promedio} ★ (${kpis.calificaciones_total})` : 'Sin datos', icono: <Star className="text-amber-500" />, color: 'bg-amber-50' }
  ];

  return (
    <div>
      {!resumen && (
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="text-sky-600" /> Reportes
          </h1>
          <div className="flex gap-2">
            <button onClick={() => exportar('excel')} disabled={exportando !== null}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <FileSpreadsheet size={16} className="text-green-600" /> {exportando === 'excel' ? 'Generando…' : 'Excel'}
            </button>
            <button onClick={() => exportar('pdf')} disabled={exportando !== null}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              <FileText size={16} className="text-red-500" /> {exportando === 'pdf' ? 'Generando…' : 'PDF'}
            </button>
          </div>
        </div>
      )}

      {/* Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-8">
        {tarjetas.map((t, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">{t.titulo}</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">{t.valor}</p>
            </div>
            <div className={`rounded-full p-3 ${t.color}`}>{t.icono}</div>
          </div>
        ))}
      </div>

      {kpis && kpis.solicitudes_pendientes > 0 && (
        <div className="mb-8 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl p-4">
          <AlertCircle size={22} />
          <span>Tienes <b>{kpis.solicitudes_pendientes}</b> solicitudes pendientes de confirmar.</span>
        </div>
      )}

      {!resumen && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Lavados por servicio */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Lavados por servicio</h2>
            {porServicio.length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos aún.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={porServicio}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="servicio" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="cantidad" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Ingresos por día */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-slate-800 mb-4">Ingresos (últimos 30 días)</h2>
            {ingresos.length === 0 ? (
              <p className="text-sm text-slate-400">Sin datos aún.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={ingresos}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="fecha" tick={{ fontSize: 9 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="total" fill="#22c55e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reportes;
