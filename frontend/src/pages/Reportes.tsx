import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3, ChevronLeft, ChevronRight, DollarSign, FileSpreadsheet, FileText,
  Receipt, Star, TrendingUp, XCircle
} from 'lucide-react';
import api from '../services/api';
import { descargarArchivo } from '../services/descargas';
import { desplazarMes, fechaCorta, mesActual, nombreMes, rangoMes } from '../utils/fechas';
import { ResumenPeriodo } from '../types';
import { BarrasMagnitud, DetalleDatos, Panel, SerieTemporal, TablaDatos, TarjetaKPI, moneda } from '../components/graficos';

/**
 * Reportes — "¿cómo nos fue en este mes?"
 *
 * El complemento del Dashboard, que mira el presente y no se configura. Acá se
 * elige un mes y todo lo de la pantalla —tarjetas, gráficas y lo que se
 * exporta— se recalcula para ese mes. Antes no había forma de mirar atrás: los
 * reportes mostraban el acumulado histórico y no se podía responder "cuánto
 * facturamos en septiembre".
 */

type PorServicio = { servicio: string; modalidad?: string; cantidad: number; ingresos: number };
type PorSitio = { estacionamiento: string; cantidad: number; ingresos: number };

const Reportes: React.FC = () => {
  const [mes, setMes] = useState<string>(mesActual());
  const [resumen, setResumen] = useState<ResumenPeriodo | null>(null);
  const [porServicio, setPorServicio] = useState<PorServicio[]>([]);
  const [porSitio, setPorSitio] = useState<PorSitio[]>([]);
  const [ingresos, setIngresos] = useState<{ fecha: string; total: number }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null);
  const [error, setError] = useState('');

  const esMesActual = mes === mesActual();

  const cargar = useCallback(() => {
    setCargando(true);
    setError('');
    const params = rangoMes(mes);
    Promise.all([
      api.get('/reportes/resumen', { params }).then((r) => setResumen(r.data)),
      api.get('/reportes/por-servicio', { params }).then((r) => setPorServicio(r.data)),
      api.get('/reportes/por-estacionamiento', { params }).then((r) => setPorSitio(r.data)),
      api.get('/reportes/ingresos', { params }).then((r) => setIngresos(r.data))
    ])
      .catch((e: any) => setError(e.message || 'No se pudieron cargar los reportes'))
      .finally(() => setCargando(false));
  }, [mes]);

  useEffect(cargar, [cargar]);

  // Lo que se exporta es el mes que está en pantalla, no el histórico completo:
  // de otro modo el archivo no coincidiría con lo que la persona está mirando.
  const exportar = async (formato: 'excel' | 'pdf') => {
    setExportando(formato);
    try {
      await descargarArchivo(
        `/reportes/exportar/${formato}`,
        `total-clean-car-${mes}.${formato === 'excel' ? 'xlsx' : 'pdf'}`,
        rangoMes(mes)
      );
    } catch (e: any) {
      alert(e.message || 'Error al exportar el reporte');
    } finally {
      setExportando(null);
    }
  };

  const tarjetas = resumen ? [
    { titulo: 'Lavados', valor: resumen.lavados, nota: 'sin contar cancelados', icono: <BarChart3 className="text-sky-600" />, fondo: 'bg-sky-50' },
    { titulo: 'Facturado', valor: moneda(resumen.facturado), nota: 'suma de los lavados del mes', icono: <Receipt className="text-indigo-600" />, fondo: 'bg-indigo-50' },
    { titulo: 'Cobrado', valor: moneda(resumen.cobrado), nota: 'pagos aprobados en el mes', icono: <DollarSign className="text-green-600" />, fondo: 'bg-green-50' },
    { titulo: 'Ticket promedio', valor: resumen.ticket_promedio != null ? moneda(resumen.ticket_promedio) : '—', icono: <TrendingUp className="text-purple-600" />, fondo: 'bg-purple-50' },
    {
      titulo: 'Cancelados', valor: resumen.canceladas,
      nota: resumen.no_asistio > 0 ? `${resumen.no_asistio} no se presentaron` : undefined,
      icono: <XCircle className="text-rose-500" />, fondo: 'bg-rose-50'
    },
    {
      titulo: 'Calificación',
      valor: resumen.calificacion_promedio != null ? `${resumen.calificacion_promedio} ★` : 'Sin datos',
      nota: resumen.calificaciones_total ? `${resumen.calificaciones_total} opiniones` : undefined,
      icono: <Star className="text-amber-500" />, fondo: 'bg-amber-50'
    }
  ] : [];

  const botonMes = 'p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <BarChart3 className="text-sky-600" /> Reportes
        </h1>
        <div className="flex gap-2">
          <button onClick={() => exportar('excel')} disabled={exportando !== null || cargando}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <FileSpreadsheet size={16} className="text-green-600" /> {exportando === 'excel' ? 'Generando…' : 'Excel'}
          </button>
          <button onClick={() => exportar('pdf')} disabled={exportando !== null || cargando}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <FileText size={16} className="text-red-500" /> {exportando === 'pdf' ? 'Generando…' : 'PDF'}
          </button>
        </div>
      </div>

      {/* Selector de mes: una fila propia por encima de todo lo que filtra. Las
          flechas son para moverse de a un mes —que es el 90% del uso— y el campo
          de mes, para saltar a uno lejano. */}
      <div className="bg-white rounded-xl shadow-sm p-4 mb-6 flex flex-wrap items-center gap-3">
        <button onClick={() => setMes(desplazarMes(mes, -1))} title="Mes anterior" aria-label="Mes anterior" className={botonMes}>
          <ChevronLeft size={18} />
        </button>
        <div className="min-w-0">
          <p className="text-xs text-slate-400">Período</p>
          <p className="font-semibold text-slate-800">{nombreMes(mes)}</p>
        </div>
        <button onClick={() => setMes(desplazarMes(mes, 1))} disabled={esMesActual}
          title={esMesActual ? 'No hay meses futuros' : 'Mes siguiente'} aria-label="Mes siguiente" className={botonMes}>
          <ChevronRight size={18} />
        </button>

        <input type="month" value={mes} max={mesActual()} onChange={(e) => e.target.value && setMes(e.target.value)}
          aria-label="Elegir mes"
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm text-slate-600" />

        {!esMesActual && (
          <button onClick={() => setMes(mesActual())} className="text-sm text-sky-600 hover:underline">
            Volver al mes actual
          </button>
        )}
        {esMesActual && <span className="text-xs text-slate-400">El mes en curso va hasta hoy.</span>}
      </div>

      {error && <p className="mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
        {cargando && !resumen
          ? <p className="text-slate-400">Cargando…</p>
          : tarjetas.map((t) => <TarjetaKPI key={t.titulo} {...t} />)}
      </div>

      {/* Facturado y cobrado casi nunca coinciden y la diferencia confunde si no
          se explica: un lavado de fin de mes cobrado en el siguiente cae en meses
          distintos. Se aclara donde aparece, no en un manual aparte. */}
      {resumen && Math.abs(resumen.facturado - resumen.cobrado) > 0.01 && (
        <p className="text-xs text-slate-500 -mt-2 mb-6">
          <b>Facturado</b> es lo que suman los lavados de {nombreMes(mes).toLowerCase()}; <b>cobrado</b>, los pagos aprobados
          dentro del mes. No coinciden cuando un lavado se paga en un mes distinto al que se hizo, o cuando queda pendiente de cobro.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6">
        <Panel titulo="Ingresos por día" nota={`Facturado en ${nombreMes(mes).toLowerCase()}`}>
          <SerieTemporal datos={ingresos} alto={300} />
          <DetalleDatos
            resumenTexto="Ver el detalle por día"
            columnas={['Día', 'Facturado']}
            filas={ingresos.map((i) => ({ etiqueta: fechaCorta(i.fecha), valor: moneda(i.total) }))}
          />
        </Panel>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel titulo="Lavados por servicio">
            <BarrasMagnitud datos={porServicio.map((s) => ({ etiqueta: s.servicio, valor: s.cantidad }))} />
            <TablaDatos
              columnas={['Servicio', 'Lavados · facturado']}
              filas={porServicio.map((s) => ({ etiqueta: s.servicio, valor: `${s.cantidad} · ${moneda(s.ingresos)}` }))}
            />
          </Panel>

          <Panel titulo="Lavados por estacionamiento">
            <BarrasMagnitud datos={porSitio.map((s) => ({ etiqueta: s.estacionamiento, valor: s.cantidad }))} />
            <TablaDatos
              columnas={['Estacionamiento', 'Lavados · facturado']}
              filas={porSitio.map((s) => ({ etiqueta: s.estacionamiento, valor: `${s.cantidad} · ${moneda(s.ingresos)}` }))}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
};

export default Reportes;
