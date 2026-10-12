import React, { useState } from 'react';
import { LocateFixed, Droplets, Plug } from 'lucide-react';
import { DatosDomicilio, Sector } from '../types';
import { dinero } from '../utils/catalogo';

/**
 * Datos de un lavado a domicilio: sector (de él salen el recargo y el tiempo
 * de traslado del equipo), dirección, contacto en el lugar y la confirmación de
 * que hay toma de agua y de luz, que a domicilio pone el cliente.
 * Lo usan la reserva del cliente y el alta de reservas del panel.
 */

export const DOMICILIO_VACIO: DatosDomicilio = {
  id_sector: '', direccion: '', referencia: '', contacto_nombre: '', contacto_telefono: '',
  tiene_agua: false, tiene_luz: false, latitud: null, longitud: null
};

// Completo para pedir: lo que el servidor exige
export const domicilioCompleto = (d: DatosDomicilio) =>
  !!d.id_sector && d.direccion.trim().length > 0 && d.contacto_telefono.trim().length > 0 && d.tiene_agua && d.tiene_luz;

interface Props {
  sectores: Sector[];
  valor: DatosDomicilio;
  onChange: (d: DatosDomicilio) => void;
}

const FormDomicilio: React.FC<Props> = ({ sectores, valor, onChange }) => {
  const [ubicando, setUbicando] = useState(false);
  const [avisoGps, setAvisoGps] = useState('');
  const set = (cambios: Partial<DatosDomicilio>) => onChange({ ...valor, ...cambios });

  // La ubicación exacta ayuda al equipo a llegar; es opcional
  const usarUbicacion = () => {
    if (!navigator.geolocation) { setAvisoGps('Este dispositivo no comparte su ubicación.'); return; }
    setUbicando(true);
    setAvisoGps('');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        set({ latitud: Math.round(p.coords.latitude * 1e6) / 1e6, longitud: Math.round(p.coords.longitude * 1e6) / 1e6 });
        setAvisoGps('Ubicación guardada.');
        setUbicando(false);
      },
      () => {
        // Sin HTTPS el navegador no entrega la ubicación (en la APK sí): la dirección alcanza
        setAvisoGps('No se pudo obtener la ubicación. Basta con la dirección.');
        setUbicando(false);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const campo = 'w-full px-3 py-2 border border-slate-300 rounded-lg bg-white';
  const sector = sectores.find((s) => s.id === valor.id_sector);

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-slate-500">Sector</label>
        <select value={valor.id_sector} onChange={(e) => set({ id_sector: e.target.value ? Number(e.target.value) : '' })} className={campo}>
          <option value="">Elija su sector…</option>
          {sectores.map((s) => (
            <option key={s.id} value={s.id}>{s.nombre}{s.recargo > 0 ? ` (+${dinero(s.recargo)} a domicilio)` : ''}</option>
          ))}
        </select>
        {sector && sector.recargo > 0 && (
          <p className="text-xs text-slate-500 mt-1">Recargo por ir a domicilio: <b>{dinero(sector.recargo)}</b> por visita.</p>
        )}
      </div>
      <input value={valor.direccion} onChange={(e) => set({ direccion: e.target.value })}
        placeholder="Dirección (calle, número, conjunto)" className={campo} />
      <input value={valor.referencia} onChange={(e) => set({ referencia: e.target.value })}
        placeholder="Referencia (ej. portón negro, junto a la farmacia)" className={campo} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input value={valor.contacto_nombre} onChange={(e) => set({ contacto_nombre: e.target.value })}
          placeholder="Quién recibe al equipo" className={campo} />
        <input value={valor.contacto_telefono} onChange={(e) => set({ contacto_telefono: e.target.value })}
          placeholder="Teléfono de contacto" inputMode="tel" className={campo} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={usarUbicacion} disabled={ubicando}
          className="flex items-center gap-1 text-sm text-sky-700 border border-sky-200 rounded-lg px-3 py-1.5 hover:bg-sky-50 disabled:opacity-50">
          <LocateFixed size={15} /> {ubicando ? 'Ubicando…' : valor.latitud != null ? 'Actualizar mi ubicación' : 'Usar mi ubicación (opcional)'}
        </button>
        {avisoGps && <span className="text-xs text-slate-500">{avisoGps}</span>}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
        <p className="text-xs text-amber-800">A domicilio, el agua y la luz las pone usted. Sin ellas no podremos lavar y la visita se cobra igual.</p>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={valor.tiene_agua} onChange={(e) => set({ tiene_agua: e.target.checked })} className="accent-sky-600" />
          <Droplets size={15} className="text-sky-600" /> Hay una toma de agua cerca del vehículo
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={valor.tiene_luz} onChange={(e) => set({ tiene_luz: e.target.checked })} className="accent-sky-600" />
          <Plug size={15} className="text-amber-600" /> Hay un tomacorriente cerca del vehículo
        </label>
      </div>
    </div>
  );
};

export default FormDomicilio;
