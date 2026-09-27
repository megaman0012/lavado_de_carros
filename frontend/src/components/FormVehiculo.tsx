import React, { useEffect, useState } from 'react';
import { Bike, Car, CarFront, Truck } from 'lucide-react';
import api from '../services/api';
import { TipoVehiculo, Vehiculo } from '../types';

// Ícono por código de tipo; un tipo nuevo creado por el admin usa el auto genérico
export const IconoTipo: React.FC<{ codigo?: string | null; size?: number; className?: string }> = ({ codigo, size = 20, className }) => {
  const Icono = codigo === 'moto' ? Bike : codigo === 'suv' ? CarFront : codigo === 'camioneta' ? Truck : Car;
  return <Icono size={size} className={className} />;
};

// Catálogo de tipos (público: lo usan cliente y panel). Se pide una vez por pantalla.
export const useTiposVehiculo = () => {
  const [tipos, setTipos] = useState<TipoVehiculo[]>([]);
  useEffect(() => {
    api.get('/public/tipos-vehiculo').then((r) => setTipos(r.data)).catch(() => setTipos([]));
  }, []);
  return tipos;
};

// Botones grandes para elegir el tipo: moto, liviano, SUV, camioneta...
export const SelectorTipoVehiculo: React.FC<{
  tipos: TipoVehiculo[];
  valor: number | null;
  onChange: (id: number) => void;
}> = ({ tipos, valor, onChange }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
    {tipos.map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => onChange(t.id)}
        aria-pressed={valor === t.id}
        className={`flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-3 text-sm transition ${
          valor === t.id ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600 hover:border-sky-300'
        }`}
      >
        <IconoTipo codigo={t.codigo} size={26} />
        <span className="font-medium">{t.nombre}</span>
        {t.descripcion && <span className="text-[11px] leading-tight text-slate-400 text-center">{t.descripcion}</span>}
      </button>
    ))}
  </div>
);

/**
 * Registro de vehículo. El tipo es obligatorio: de él depende qué servicios
 * se pueden contratar y a qué precio. `idCliente` solo lo manda el panel
 * interno; para el cliente el backend usa el de su sesión.
 */
const FormVehiculo: React.FC<{
  tipos: TipoVehiculo[];
  idCliente?: number;
  onCreado: (v: Vehiculo) => void;
  onCancelar?: () => void;
}> = ({ tipos, idCliente, onCreado, onCancelar }) => {
  const [form, setForm] = useState({ placa: '', marca: '', modelo: '', color: '' });
  const [tipo, setTipo] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.placa.trim() || !tipo) return;
    setGuardando(true);
    setError('');
    try {
      const r = await api.post('/vehiculos', { ...form, id_tipo_vehiculo: tipo, ...(idCliente && { id_cliente: idCliente }) });
      onCreado(r.data);
      setForm({ placa: '', marca: '', modelo: '', color: '' });
      setTipo(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const input = 'w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-sky-500 outline-none';
  return (
    <form onSubmit={guardar} className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-700 mb-2">Tipo de vehículo *</p>
        <SelectorTipoVehiculo tipos={tipos} valor={tipo} onChange={setTipo} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input value={form.placa} onChange={(e) => setForm({ ...form, placa: e.target.value.toUpperCase() })}
          placeholder="Placa * (ej. ABC-1234)" required className={`${input} col-span-2 uppercase`} />
        <input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} placeholder="Marca" className={input} />
        <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} placeholder="Modelo" className={input} />
        <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Color" className={`${input} col-span-2`} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={guardando || !form.placa.trim() || !tipo}
          className="flex-1 bg-sky-600 text-white py-2 rounded-lg hover:bg-sky-700 disabled:opacity-40">
          {guardando ? 'Guardando…' : 'Guardar vehículo'}
        </button>
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="px-4 py-2 rounded-lg border border-slate-300 text-sm">Cancelar</button>
        )}
      </div>
    </form>
  );
};

export default FormVehiculo;
