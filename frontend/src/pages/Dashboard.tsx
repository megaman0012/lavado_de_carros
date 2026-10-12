import React, { useEffect, useState } from 'react';
import { AlertCircle, BarChart3, Car, DollarSign, LayoutDashboard, Percent, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { fechaCorta, ultimosDias } from '../utils/fechas';
import { KPIs } from '../types';
import { BarrasMagnitud, DetalleDatos, Panel, SerieTemporal, TablaDatos, TarjetaKPI, moneda } from '../components/graficos';
import FiltroCiudad, { useFiltroCiudad } from '../components/FiltroCiudad';

/**
 * Dashboard — "¿cómo vamos ahora?"
 *
 * Antes era la pantalla de Reportes sin las gráficas, o sea un subconjunto de la
 * otra: dos entradas del menú para casi lo mismo. Ahora cada una responde una
 * pregunta distinta y ninguna sobra:
 *
 *   Dashboard  el presente: hoy, esta semana, este mes, y cómo venimos
 *              en los últimos 30 días. No se configura nada: se abre y se lee.
 *   Reportes   un mes a elegir, para revisar, comparar y exportar.
 *
 * Las dos gráficas miran la misma ventana de 30 días a propósito: así se leen
 * juntas —cuánto entró y de qué servicios vino— sin tener que recordar que cada
 * una cubre un período diferente.
 */
const DIAS = 30;

const Dashboard: React.FC = () => {
  const filtro = useFiltroCiudad();
  const idCiudad = filtro.idCiudad;
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [ingresos, setIngresos] = useState<{ fecha: string; total: number }[]>([]);
  const [porServicio, setPorServicio] = useState<{ servicio: string; cantidad: number }[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const ciudad = idCiudad ? { id_ciudad: idCiudad } : {};
    const rango = { ...ultimosDias(DIAS), ...ciudad };
    Promise.all([
      api.get('/reportes/kpis', { params: ciudad }).then((r) => setKpis(r.data)).catch(() => {}),
      api.get('/reportes/ingresos', { params: rango }).then((r) => setIngresos(r.data)).catch(() => {}),
      api.get('/reportes/por-servicio', { params: rango }).then((r) => setPorServicio(r.data)).catch(() => {})
    ]).finally(() => setCargando(false));
  }, [idCiudad]);

  const tarjetas = [
    { titulo: 'Lavados hoy', valor: kpis?.lavados_hoy ?? '—', icono: <Car className="text-sky-600" />, fondo: 'bg-sky-50' },
    { titulo: 'Lavados del mes', valor: kpis?.lavados_mes ?? '—', nota: kpis ? `${kpis.lavados_semana} esta semana` : undefined, icono: <BarChart3 className="text-indigo-600" />, fondo: 'bg-indigo-50' },
    { titulo: 'Cobrado este mes', valor: kpis ? moneda(kpis.ingresos_mes) : '—', nota: 'pagos aprobados', icono: <DollarSign className="text-green-600" />, fondo: 'bg-green-50' },
    { titulo: 'Ocupación de hoy', valor: kpis ? `${kpis.ocupacion_hoy_pct}%` : '—', icono: <Percent className="text-purple-600" />, fondo: 'bg-purple-50' },
    {
      titulo: 'Calificación',
      valor: kpis?.calificacion_promedio != null ? `${kpis.calificacion_promedio} ★` : 'Sin datos',
      nota: kpis?.calificaciones_total ? `${kpis.calificaciones_total} opiniones` : undefined,
      icono: <Star className="text-amber-500" />, fondo: 'bg-amber-50'
    }
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <LayoutDashboard className="text-sky-600" /> Dashboard
        </h1>
        <FiltroCiudad filtro={filtro} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        {tarjetas.map((t) => <TarjetaKPI key={t.titulo} {...t} />)}
      </div>

      {/* Lo único accionable de la pantalla va antes que las gráficas, y lleva al
          lugar donde se resuelve: un aviso que no se puede atender es ruido. */}
      {kpis && kpis.solicitudes_pendientes > 0 && (
        <Link to="/reservas?estado=solicitada"
          className="mb-6 flex items-center gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 hover:bg-amber-100 transition">
          <AlertCircle size={22} className="shrink-0" />
          <span>
            Hay <b>{kpis.solicitudes_pendientes}</b> {kpis.solicitudes_pendientes === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'} de confirmar.
            <span className="block text-xs text-amber-700">Clic para abrirlas en Reservas.</span>
          </span>
        </Link>
      )}

      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel titulo={`Ingresos de los últimos ${DIAS} días`} nota="Facturado por día, según la fecha del lavado">
            <SerieTemporal datos={ingresos} />
            <DetalleDatos
              resumenTexto="Ver los datos"
              columnas={['Día', 'Facturado']}
              filas={ingresos.map((i) => ({ etiqueta: fechaCorta(i.fecha), valor: moneda(i.total) }))}
            />
          </Panel>

          <Panel titulo={`Lavados por servicio`} nota={`Últimos ${DIAS} días`}>
            <BarrasMagnitud datos={porServicio.map((s) => ({ etiqueta: s.servicio, valor: s.cantidad }))} />
            <TablaDatos
              columnas={['Servicio', 'Lavados']}
              filas={porServicio.map((s) => ({ etiqueta: s.servicio, valor: s.cantidad }))}
            />
          </Panel>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
