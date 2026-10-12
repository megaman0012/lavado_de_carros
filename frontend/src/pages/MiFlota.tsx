import React, { useCallback, useEffect, useState } from 'react';
import { Truck, ChevronLeft, ChevronRight, FileSpreadsheet } from 'lucide-react';
import api from '../services/api';
import { descargarArchivo } from '../services/descargas';
import { desplazarMes, fechaCorta, mesActual, nombreMes, rangoMes } from '../utils/fechas';
import { dinero } from '../utils/catalogo';
import { CorteEmpresa } from '../types';

/**
 * Mi flota — el portal del gestor de una empresa.
 *
 * Responde lo que pregunta quien administra la flota: cuánto gastamos este mes
 * y en qué vehículo, cuánto hay pendiente de facturar, y el detalle de cada
 * corte para cuadrar la factura que le llega.
 */

interface Resumen {
  desde: string;
  hasta: string;
  lavados: number;
  gasto: number;
  por_vehiculo: { id_vehiculo: number; placa: string; vehiculo: string; lavados: number; completados: number; gasto: number }[];
  pendiente_de_corte: { cantidad: number; total: number };
}

const estadoCorte: Record<string, string> = {
  cerrado: 'en preparación de factura',
  facturado: 'facturado, pendiente de pago',
  pagado: 'pagado'
};

const MiFlota: React.FC = () => {
  const [mes, setMes] = useState(mesActual());
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cortes, setCortes] = useState<CorteEmpresa[]>([]);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setError('');
    api.get('/mi-empresa/resumen', { params: rangoMes(mes) })
      .then((r) => setResumen(r.data)).catch((e) => setError(e.message));
  }, [mes]);
  useEffect(cargar, [cargar]);
  useEffect(() => {
    api.get('/mi-empresa/cortes').then((r) => setCortes(r.data)).catch(() => setCortes([]));
  }, []);

  const excel = (c: CorteEmpresa) =>
    descargarArchivo(`/mi-empresa/cortes/${c.id}/excel`, `${c.codigo}.xlsx`).catch((e) => setError(e.message));

  const esMesActual = mes === mesActual();
  const botonMes = 'p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40';

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <Truck className="text-sky-600" /> Mi flota
      </h1>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm text-slate-500">Lavados de {nombreMes(mes).toLowerCase()}</p>
          <p className="text-2xl font-bold text-slate-800">{resumen?.lavados ?? '—'}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm text-slate-500">Gasto del mes</p>
          <p className="text-2xl font-bold text-slate-800">{resumen ? dinero(resumen.gasto) : '—'}</p>
          <p className="text-xs text-slate-400">lavados completados, a su tarifa</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-5">
          <p className="text-sm text-slate-500">Pendiente de facturar</p>
          <p className="text-2xl font-bold text-indigo-700">{resumen ? dinero(resumen.pendiente_de_corte.total) : '—'}</p>
          <p className="text-xs text-slate-400">{resumen?.pendiente_de_corte.cantidad ?? 0} lavados que entran en el próximo corte</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="font-semibold text-slate-800">Por vehículo</h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setMes(desplazarMes(mes, -1))} aria-label="Mes anterior" className={botonMes}><ChevronLeft size={16} /></button>
              <span className="text-sm text-slate-600 min-w-[8rem] text-center">{nombreMes(mes)}</span>
              <button onClick={() => setMes(desplazarMes(mes, 1))} disabled={esMesActual} aria-label="Mes siguiente" className={botonMes}><ChevronRight size={16} /></button>
            </div>
          </div>
          {!resumen || resumen.por_vehiculo.length === 0 ? (
            <p className="text-sm text-slate-500">Sin lavados en este mes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 border-b">
                <tr>
                  <th className="text-left py-2 pr-3">Vehículo</th>
                  <th className="text-right py-2 px-3">Lavados</th>
                  <th className="text-right py-2 pl-3">Gasto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {resumen.por_vehiculo.map((v) => (
                  <tr key={v.id_vehiculo}>
                    <td className="py-2 pr-3"><span className="font-mono">{v.placa}</span> <span className="text-slate-400 text-xs">{v.vehiculo}</span></td>
                    <td className="py-2 px-3 text-right tabular-nums">
                      {v.completados}{v.lavados > v.completados && <span className="text-xs text-slate-400"> (+{v.lavados - v.completados} agendados)</span>}
                    </td>
                    <td className="py-2 pl-3 text-right tabular-nums">{dinero(v.gasto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-slate-800 mb-1">Cortes mensuales</h2>
          <p className="text-xs text-slate-500 mb-3">El detalle de cada factura, lavado por lavado.</p>
          {cortes.length === 0 ? (
            <p className="text-sm text-slate-500">Todavía no hay cortes.</p>
          ) : (
            <ul className="divide-y">
              {cortes.map((c) => (
                <li key={c.id} className="py-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{nombreMes(c.periodo)} · {dinero(c.total)}</p>
                    <p className="text-xs text-slate-500">
                      {c.cantidad} lavados · {estadoCorte[c.estado] || c.estado}
                      {c.numero_factura && ` · factura ${c.numero_factura}`}
                      {c.fecha_pago && ` · ${fechaCorta(c.fecha_pago)}`}
                    </p>
                  </div>
                  <button onClick={() => excel(c)} className="flex items-center gap-1 text-sm text-green-700 hover:underline">
                    <FileSpreadsheet size={16} /> Excel
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default MiFlota;
