import React from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts';

/**
 * Piezas compartidas por el Dashboard y por Reportes.
 *
 * Las dos pantallas mostraban lo mismo y por eso se parecían demasiado. Ahora
 * cada una tiene su pregunta —el Dashboard, "¿cómo vamos ahora?"; Reportes,
 * "¿cómo nos fue en este mes?"— y lo que comparten es la forma de dibujar, que
 * vive acá para que no se separen con el tiempo.
 *
 * DECISIONES DE COLOR
 * Todas las gráficas son de UNA sola serie: comparan magnitudes (cuántos lavados
 * por servicio) o muestran una evolución (ingresos por día). Ese trabajo se
 * resuelve con un solo tono, no con una paleta categórica: los colores distintos
 * son para distinguir series entre sí, y acá no hay series que distinguir.
 *
 * El tono es el azul de la marca (#2E96D4, el del logo). Verificado contra fondo
 * blanco: contraste ≥ 3:1, luminosidad y croma dentro de banda. Si algún día
 * hiciera falta una segunda serie, el naranja #eb6834 forma con él un par que
 * también pasa (ΔE 30 normal, 22 con daltonismo protán).
 *
 * Al no haber más de una serie, ninguna gráfica lleva caja de leyenda: el título
 * del panel ya dice qué se está mirando, y un recuadro con un solo color repite
 * el título y ocupa lugar.
 */

// Tono de la serie: azul del logo de Total Clean Car
export const SERIE = '#2E96D4';
// Gris de rejilla y ejes: un paso por encima del fondo, para que no compitan con los datos
const REJILLA = '#e2e8f0';   // slate-200
const TINTA_EJE = '#94a3b8'; // slate-400
const SUPERFICIE = '#ffffff';

export const moneda = (n: number) =>
  n.toLocaleString('es-EC', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

// "2026-09-27" -> "27 sep"
const diaCorto = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(a, m - 1, d).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' }).replace('.', '');
};

/** Caja blanca con título; el envoltorio de toda gráfica y de la tabla. */
export const Panel: React.FC<{ titulo: string; nota?: string; children: React.ReactNode; className?: string }> =
  ({ titulo, nota, children, className = '' }) => (
    <div className={`bg-white rounded-xl shadow-sm p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="font-semibold text-slate-800">{titulo}</h2>
        {nota && <p className="text-xs text-slate-400 mt-0.5">{nota}</p>}
      </div>
      {children}
    </div>
  );

const SinDatos: React.FC<{ alto: number; mensaje?: string }> = ({ alto, mensaje }) => (
  <div className="flex items-center justify-center text-sm text-slate-400" style={{ height: alto }}>
    {mensaje || 'Sin datos en este período.'}
  </div>
);

// Globo de ayuda: una fila por valor, con la etiqueta en tinta de texto y el
// color solo en el punto que acompaña. El número nunca se pinta del color de la
// serie — eso lo volvería más difícil de leer sin agregar información.
const Globo: React.FC<any> = ({ active, payload, label, formato }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm">
      <p className="text-slate-500 text-xs mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-800 font-medium">
          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: SERIE }} />
          {formato ? formato(p.value) : p.value}
        </p>
      ))}
    </div>
  );
};

/**
 * Barras para comparar magnitudes entre categorías (servicios, estacionamientos).
 * Horizontales: los nombres de los servicios son largos y en vertical había que
 * inclinarlos a -20°, que obliga a torcer la cabeza para leer la pantalla.
 */
export const BarrasMagnitud: React.FC<{
  datos: { etiqueta: string; valor: number }[];
  formato?: (n: number) => string;
  alto?: number;
}> = ({ datos, formato, alto = 280 }) => {
  if (datos.length === 0) return <SinDatos alto={alto} />;
  // Un nombre largo ("Lavado profundo con encerado") no cabe en el eje y recharts
  // lo deja salirse del área. Se acorta con puntos suspensivos y el nombre
  // completo queda en la tabla de abajo, que es la que vale para leer el dato.
  const acortar = (t: string) => (t.length > 20 ? `${t.slice(0, 19)}…` : t);
  return (
    <ResponsiveContainer width="100%" height={Math.max(alto, datos.length * 44)}>
      <BarChart data={datos} layout="vertical" margin={{ left: 8, right: 36, top: 4, bottom: 4 }}>
        {/* Rejilla fina y continua, solo en el eje de la magnitud */}
        <CartesianGrid horizontal={false} stroke={REJILLA} />
        <XAxis type="number" tick={{ fontSize: 11, fill: TINTA_EJE }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis
          type="category" dataKey="etiqueta" width={150}
          tick={{ fontSize: 12, fill: TINTA_EJE }} axisLine={false} tickLine={false}
          tickFormatter={acortar}
        />
        <Tooltip cursor={{ fill: 'rgba(46,150,212,0.06)' }} content={<Globo formato={formato} />} />
        {/* maxBarSize deja aire en la banda: una barra que llena su espacio se
            lee como un bloque sólido y pierde la forma. */}
        <Bar dataKey="valor" fill={SERIE} radius={[0, 4, 4, 0]} maxBarSize={24} />
      </BarChart>
    </ResponsiveContainer>
  );
};

/**
 * Evolución en el tiempo: línea de 2px con un lavado del mismo tono por debajo.
 * El área es un matiz al 10%, no un bloque: acompaña a la línea sin taparla.
 */
export const SerieTemporal: React.FC<{
  datos: { fecha: string; total: number }[];
  alto?: number;
}> = ({ datos, alto = 280 }) => {
  if (datos.length === 0) return <SinDatos alto={alto} />;
  const puntos = datos.map((d) => ({ ...d, etiqueta: diaCorto(d.fecha) }));
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <AreaChart data={puntos} margin={{ left: 0, right: 12, top: 8, bottom: 4 }}>
        <defs>
          <linearGradient id="lavadoSerie" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SERIE} stopOpacity={0.18} />
            <stop offset="100%" stopColor={SERIE} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={REJILLA} />
        <XAxis
          dataKey="etiqueta" tick={{ fontSize: 11, fill: TINTA_EJE }}
          axisLine={false} tickLine={false} minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11, fill: TINTA_EJE }} axisLine={false} tickLine={false}
          width={56} tickFormatter={(v) => `$${v}`}
        />
        <Tooltip content={<Globo formato={moneda} />} />
        <Area
          type="monotone" dataKey="total"
          stroke={SERIE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          fill="url(#lavadoSerie)"
          // El punto solo aparece al pasar por encima: uno por día en 30 días
          // sería una fila de lunares. El anillo blanco lo despega de la línea.
          dot={false}
          activeDot={{ r: 5, fill: SERIE, stroke: SUPERFICIE, strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};

/**
 * Los mismos datos en texto, plegados. Una gráfica de 30 días no puede ser el
 * único camino al número: el globo de ayuda exige apuntar con el mouse y no
 * existe para quien usa lector de pantalla o mira desde el celular.
 */
export const DetalleDatos: React.FC<{
  resumenTexto: string;
  columnas: [string, string];
  filas: { etiqueta: string; valor: React.ReactNode }[];
}> = ({ resumenTexto, columnas, filas }) => {
  if (filas.length === 0) return null;
  return (
    <details className="mt-3 group">
      <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700 list-none inline-flex items-center gap-1">
        <span className="transition group-open:rotate-90">▸</span> {resumenTexto}
      </summary>
      <div className="max-h-64 overflow-y-auto">
        <TablaDatos columnas={columnas} filas={filas} />
      </div>
    </details>
  );
};

/**
 * Tarjeta de un indicador. Es la forma correcta para un número suelto: una
 * gráfica de una sola barra diría lo mismo ocupando diez veces más.
 */
export const TarjetaKPI: React.FC<{
  titulo: string;
  valor: React.ReactNode;
  nota?: string;
  icono: React.ReactNode;
  fondo: string;
}> = ({ titulo, valor, nota, icono, fondo }) => (
  <div className="bg-white rounded-xl shadow-sm p-5 flex items-center justify-between gap-3">
    <div className="min-w-0">
      <p className="text-sm text-slate-500">{titulo}</p>
      <p className="text-2xl font-bold text-slate-800 mt-1 truncate">{valor}</p>
      {nota && <p className="text-xs text-slate-400 mt-0.5">{nota}</p>}
    </div>
    <div className={`rounded-full p-3 shrink-0 ${fondo}`}>{icono}</div>
  </div>
);

/**
 * La misma información de una gráfica, en texto. No es un extra: es el camino de
 * lectura para quien usa lector de pantalla y para quien necesita el número
 * exacto en vez de la posición de una barra.
 */
export const TablaDatos: React.FC<{
  columnas: [string, string];
  filas: { etiqueta: string; valor: React.ReactNode }[];
}> = ({ columnas, filas }) => {
  if (filas.length === 0) return null;
  return (
    <table className="w-full text-sm mt-4">
      <thead className="text-slate-400 text-xs uppercase">
        <tr>
          <th className="text-left font-medium pb-2">{columnas[0]}</th>
          <th className="text-right font-medium pb-2">{columnas[1]}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {filas.map((f) => (
          <tr key={f.etiqueta}>
            <td className="py-1.5 text-slate-600">{f.etiqueta}</td>
            <td className="py-1.5 text-right text-slate-800 tabular-nums">{f.valor}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
