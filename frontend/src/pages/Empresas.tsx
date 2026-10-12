import React, { useCallback, useEffect, useState } from 'react';
import { Briefcase, ChevronLeft, FileSpreadsheet, Receipt, BadgeCheck, Ban, Save } from 'lucide-react';
import api from '../services/api';
import { descargarArchivo } from '../services/descargas';
import { desplazarMes, fechaCorta, mesActual, nombreMes } from '../utils/fechas';
import { dinero } from '../utils/catalogo';
import { CorteEmpresa, EmpresaResumen, EstadoCorte, PreviaCorte, TarifaFila } from '../types';

/**
 * Empresas — tarifas pactadas y cortes mensuales.
 *
 * Una empresa no paga lavado por lavado: sus lavados completados se juntan en
 * un corte mensual. El ciclo de un corte es
 *   cerrar (congela lavados y total) → facturar (número del sistema contable)
 *   → pagar (registra el cobro de cada lavado).
 * Un corte cerrado o facturado se puede anular; sus lavados vuelven a quedar
 * pendientes y entran en el siguiente. La factura electrónica NO sale de acá:
 * se emite en el sistema contable con el Excel del corte.
 */

const coloresCorte: Record<EstadoCorte, string> = {
  cerrado: 'bg-amber-50 text-amber-700',
  facturado: 'bg-sky-50 text-sky-700',
  pagado: 'bg-green-50 text-green-700',
  anulado: 'bg-slate-100 text-slate-500 line-through'
};

const Etiqueta: React.FC<{ estado: EstadoCorte }> = ({ estado }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full ${coloresCorte[estado]}`}>{estado}</span>
);

const clave = (f: Pick<TarifaFila, 'id_tipo_servicio' | 'id_tipo_vehiculo'>) => `${f.id_tipo_servicio}-${f.id_tipo_vehiculo}`;

// ==================== TARIFAS ====================
const Tarifas: React.FC<{ empresa: EmpresaResumen; onCambio: () => void }> = ({ empresa, onCambio }) => {
  const [filas, setFilas] = useState<TarifaFila[]>([]);
  // Lo escrito en cada casilla: '' = sin tarifa pactada (paga la de lista)
  const [valores, setValores] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');

  const aplicar = useCallback((lista: TarifaFila[]) => {
    setFilas(lista);
    setValores(Object.fromEntries(lista.map((f) => [clave(f), f.precio_empresa != null ? String(f.precio_empresa) : ''])));
  }, []);

  useEffect(() => {
    api.get(`/empresas/${empresa.id}/tarifas`).then((r) => aplicar(r.data)).catch(() => aplicar([]));
  }, [empresa.id, aplicar]);

  const cambiadas = filas.filter((f) => (valores[clave(f)] ?? '') !== (f.precio_empresa != null ? String(f.precio_empresa) : ''));

  const guardar = async () => {
    setGuardando(true);
    setMensaje('');
    try {
      const r = await api.put(`/empresas/${empresa.id}/tarifas`, {
        tarifas: cambiadas.map((f) => ({
          id_tipo_servicio: f.id_tipo_servicio,
          id_tipo_vehiculo: f.id_tipo_vehiculo,
          precio: valores[clave(f)] === '' ? null : Number(valores[clave(f)])
        }))
      });
      aplicar(r.data);
      setMensaje('Tarifas guardadas. Valen para las reservas nuevas.');
      onCambio();
    } catch (e: any) {
      setMensaje(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h3 className="font-semibold text-slate-800">Tarifas pactadas</h3>
          <p className="text-xs text-slate-500">Vacío = paga el precio de lista. Los adicionales van siempre a precio de lista.</p>
        </div>
        <button onClick={guardar} disabled={guardando || cambiadas.length === 0}
          className="flex items-center gap-1 bg-sky-600 text-white px-3 py-2 rounded-lg text-sm hover:bg-sky-700 disabled:opacity-40">
          <Save size={16} /> {guardando ? 'Guardando…' : `Guardar${cambiadas.length ? ` (${cambiadas.length})` : ''}`}
        </button>
      </div>
      {mensaje && <p className="text-sm text-slate-600 mb-2">{mensaje}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase text-slate-500 border-b">
            <tr>
              <th className="text-left py-2 pr-3">Servicio</th>
              <th className="text-left py-2 px-3">Vehículo</th>
              <th className="text-right py-2 px-3">Lista</th>
              <th className="text-right py-2 pl-3">Empresa</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filas.map((f) => {
              const v = valores[clave(f)] ?? '';
              const descuento = v !== '' && Number(v) < f.precio_lista
                ? Math.round((1 - Number(v) / f.precio_lista) * 100) : null;
              return (
                <tr key={clave(f)}>
                  <td className="py-2 pr-3">{f.servicio}</td>
                  <td className="py-2 px-3 text-slate-500">{f.tipo_vehiculo}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-slate-500">{dinero(f.precio_lista)}</td>
                  <td className="py-2 pl-3 text-right">
                    <span className="inline-flex items-center gap-2">
                      {descuento != null && descuento > 0 && <span className="text-xs text-green-600">-{descuento}%</span>}
                      <input type="number" min={0} step="0.01" value={v} placeholder="lista"
                        aria-label={`Precio para la empresa: ${f.servicio}, ${f.tipo_vehiculo}`}
                        onChange={(e) => setValores({ ...valores, [clave(f)]: e.target.value })}
                        className="w-24 px-2 py-1 border border-slate-300 rounded text-right tabular-nums" />
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ==================== CORTES ====================
const Cortes: React.FC<{ empresa: EmpresaResumen; onCambio: () => void }> = ({ empresa, onCambio }) => {
  const [periodo, setPeriodo] = useState(desplazarMes(mesActual(), -1)); // lo normal: cortar el mes que terminó
  const [previa, setPrevia] = useState<PreviaCorte | null>(null);
  const [cortes, setCortes] = useState<CorteEmpresa[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(() => {
    setError('');
    api.get(`/empresas/${empresa.id}/corte-previo`, { params: { periodo } })
      .then((r) => setPrevia(r.data)).catch((e) => { setPrevia(null); setError(e.message); });
    api.get(`/empresas/${empresa.id}/cortes`).then((r) => setCortes(r.data)).catch(() => setCortes([]));
  }, [empresa.id, periodo]);

  useEffect(cargar, [cargar]);

  const accion = async (fn: () => Promise<unknown>) => {
    setTrabajando(true);
    setError('');
    try {
      await fn();
      cargar();
      onCambio();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTrabajando(false);
    }
  };

  const cerrar = () => {
    if (!previa) return;
    if (!window.confirm(`¿Cerrar el corte de ${nombreMes(periodo).toLowerCase()}?\n\n${previa.cantidad} lavados por ${dinero(previa.total)}. Después se factura con el Excel del corte.`)) return;
    accion(() => api.post(`/empresas/${empresa.id}/cortes`, { periodo }));
  };
  const facturar = (c: CorteEmpresa) => {
    const numero = window.prompt(`Número de la factura de ${c.codigo} (del sistema contable):`);
    if (numero?.trim()) accion(() => api.put(`/cortes/${c.id}/facturar`, { numero_factura: numero }));
  };
  const pagar = (c: CorteEmpresa) => {
    const referencia = window.prompt(`Pago de ${c.codigo} por ${dinero(c.total)}.\nReferencia (número de transferencia), opcional:`);
    if (referencia !== null) accion(() => api.put(`/cortes/${c.id}/pagar`, { referencia }));
  };
  const anular = (c: CorteEmpresa) => {
    const motivo = window.prompt(`¿Anular ${c.codigo}? Sus lavados vuelven a quedar pendientes.\nMotivo:`);
    if (motivo?.trim()) accion(() => api.put(`/cortes/${c.id}/anular`, { motivo }));
  };
  const excel = (c: CorteEmpresa) =>
    descargarArchivo(`/cortes/${c.id}/excel`, `${c.codigo}.xlsx`).catch((e) => setError(e.message));

  const boton = 'p-1.5 rounded hover:bg-slate-100 disabled:opacity-40';

  return (
    <div className="bg-white rounded-xl shadow-sm p-5 space-y-5">
      <div>
        <h3 className="font-semibold text-slate-800 mb-2">Cortar un mes</h3>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <input type="month" value={periodo} max={mesActual()} onChange={(e) => e.target.value && setPeriodo(e.target.value)}
            aria-label="Período del corte" className="px-3 py-2 border border-slate-300 rounded-lg text-sm" />
          {previa && !previa.corte_existente && previa.cantidad > 0 && (
            <button onClick={cerrar} disabled={trabajando}
              className="bg-sky-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-sky-700 disabled:opacity-50">
              Cerrar corte · {previa.cantidad} lavados · {dinero(previa.total)}
            </button>
          )}
        </div>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        {previa && (
          previa.corte_existente ? (
            <p className="text-sm text-slate-600">
              {nombreMes(periodo)} ya tiene el corte <b>{previa.corte_existente.codigo}</b> ({previa.corte_existente.estado}).
              {previa.cantidad > 0 && ` Hay ${previa.cantidad} lavado(s) completados después: entrarán en el próximo corte.`}
            </p>
          ) : previa.cantidad === 0 ? (
            <p className="text-sm text-slate-500">No hay lavados completados a crédito pendientes hasta el {fechaCorta(previa.hasta)}.</p>
          ) : (
            <>
              {(previa.de_periodos_anteriores > 0 || previa.sin_completar > 0) && (
                <p className="text-xs text-slate-500 mb-2">
                  {previa.de_periodos_anteriores > 0 && `Incluye ${previa.de_periodos_anteriores} lavado(s) de meses anteriores que no habían entrado en ningún corte. `}
                  {previa.sin_completar > 0 && `${previa.sin_completar} lavado(s) del mes todavía no se completan: entrarán en el corte siguiente.`}
                </p>
              )}
              <div className="overflow-x-auto max-h-72 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-slate-500 bg-slate-50 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-3">Fecha</th>
                      <th className="text-left py-2 px-3">Placa</th>
                      <th className="text-left py-2 px-3">Servicio</th>
                      <th className="text-left py-2 px-3">Sitio</th>
                      <th className="text-right py-2 px-3">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {previa.filas.map((f) => (
                      <tr key={f.id}>
                        <td className="py-1.5 px-3 tabular-nums">{fechaCorta(f.fecha)}</td>
                        <td className="py-1.5 px-3 font-mono">{f.placa}</td>
                        <td className="py-1.5 px-3">{f.servicio}{f.adicionales && <span className="text-xs text-slate-400"> + {f.adicionales}</span>}</td>
                        <td className="py-1.5 px-3 text-slate-500">{f.sitio} · {f.ciudad}</td>
                        <td className="py-1.5 px-3 text-right tabular-nums">{dinero(f.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </div>

      <div>
        <h3 className="font-semibold text-slate-800 mb-2">Cortes</h3>
        {cortes.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no hay cortes.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-slate-500 border-b">
                <tr>
                  <th className="text-left py-2 pr-3">Corte</th>
                  <th className="text-right py-2 px-3">Lavados</th>
                  <th className="text-right py-2 px-3">Total</th>
                  <th className="text-left py-2 px-3">Estado</th>
                  <th className="text-left py-2 px-3">Factura</th>
                  <th className="text-right py-2 pl-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cortes.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2 pr-3">
                      <span className="font-mono text-xs whitespace-nowrap">{c.codigo}</span>
                      <span className="block text-xs text-slate-400">{nombreMes(c.periodo)}</span>
                    </td>
                    <td className="py-2 px-3 text-right tabular-nums">{c.cantidad}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{dinero(c.total)}</td>
                    <td className="py-2 px-3"><Etiqueta estado={c.estado} /></td>
                    <td className="py-2 px-3 text-xs">
                      {c.numero_factura || '—'}
                      {c.fecha_pago && <span className="block text-slate-400">pagado {fechaCorta(c.fecha_pago)}</span>}
                    </td>
                    <td className="py-2 pl-3 text-right whitespace-nowrap">
                      <button onClick={() => excel(c)} title="Descargar Excel" className={`${boton} text-green-700`}><FileSpreadsheet size={16} /></button>
                      {c.estado === 'cerrado' && (
                        <button onClick={() => facturar(c)} disabled={trabajando} title="Registrar la factura" className={`${boton} text-sky-700`}><Receipt size={16} /></button>
                      )}
                      {c.estado === 'facturado' && (
                        <button onClick={() => pagar(c)} disabled={trabajando} title="Registrar el pago" className={`${boton} text-emerald-700`}><BadgeCheck size={16} /></button>
                      )}
                      {['cerrado', 'facturado'].includes(c.estado) && (
                        <button onClick={() => anular(c)} disabled={trabajando} title="Anular el corte" className={`${boton} text-red-500`}><Ban size={16} /></button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== PÁGINA ====================
const Empresas: React.FC = () => {
  const [empresas, setEmpresas] = useState<EmpresaResumen[]>([]);
  const [elegida, setElegida] = useState<number | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(() => {
    api.get('/empresas')
      .then((r) => setEmpresas(r.data))
      .catch(() => setEmpresas([]))
      .finally(() => setCargando(false));
  }, []);

  useEffect(cargar, [cargar]);
  const empresa = empresas.find((e) => e.id === elegida) || null;

  if (empresa) {
    return (
      <div>
        <button onClick={() => setElegida(null)} className="flex items-center gap-1 text-sm text-sky-600 hover:underline mb-3">
          <ChevronLeft size={16} /> Todas las empresas
        </button>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Briefcase className="text-sky-600" /> {empresa.nombre}
          </h1>
          <p className="text-sm text-slate-500">
            {empresa.razon_social || empresa.nombre} · RUC {empresa.ruc}
            {empresa.usuario ? ` · gestor: ${empresa.usuario.username}` : ' · sin usuario de gestor (créelo en Clientes)'}
          </p>
          {empresa.sitiosPrivados.length > 0 && (
            <p className="text-xs text-slate-400 mt-1">
              Parqueaderos propios: {empresa.sitiosPrivados.map((s) => `${s.nombre}${s.ciudad ? ` (${s.ciudad.nombre})` : ''}`).join(', ')}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Cortes empresa={empresa} onCambio={cargar} />
          <Tarifas empresa={empresa} onCambio={cargar} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1 flex items-center gap-2">
        <Briefcase className="text-sky-600" /> Empresas
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        Clientes con flota: reservan con su gestor, pagan su tarifa pactada y se les factura con un corte mensual.
        Una empresa nueva se da de alta en <b>Clientes</b> (tipo empresa).
      </p>
      {cargando ? (
        <p className="text-slate-400">Cargando…</p>
      ) : empresas.length === 0 ? (
        <p className="text-slate-500">Todavía no hay empresas. Créelas en Clientes eligiendo “Empresa con flota”.</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Empresa</th>
                <th className="px-4 py-3 text-right">Vehículos</th>
                <th className="px-4 py-3 text-right">Tarifas</th>
                <th className="px-4 py-3 text-right">Sin cortar</th>
                <th className="px-4 py-3 text-left">Último corte</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {empresas.map((e) => (
                <tr key={e.id} onClick={() => setElegida(e.id)} className="cursor-pointer hover:bg-sky-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-sky-700">{e.nombre}</span>
                    <span className="block text-xs text-slate-400">RUC {e.ruc}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{e._count.vehiculos}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{e._count.tarifas || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {e.pendiente.cantidad > 0 ? <>{e.pendiente.cantidad} · <b>{dinero(e.pendiente.total)}</b></> : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {e.ultimo_corte ? (
                      <span className="flex items-center gap-2">
                        {nombreMes(e.ultimo_corte.periodo)} <Etiqueta estado={e.ultimo_corte.estado} />
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Empresas;
