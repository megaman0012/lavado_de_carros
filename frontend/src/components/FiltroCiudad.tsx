import React, { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Ciudad } from '../types';

/**
 * Ciudad de trabajo del panel.
 *
 * La operación es nacional y cada ciudad tiene su operador. Quien tiene una
 * ciudad fija (operador de ciudad, lavador) ve siempre la suya, y el servidor
 * se lo impone igual aunque el panel pidiera otra. Quien es nacional (admin,
 * operador sin ciudad) elige una ciudad o "Todo el país". La elección se
 * recuerda en este navegador y vale para todas las pantallas.
 */

const LLAVE = 'filtro_ciudad';

const leerGuardada = (): number | null => {
  try {
    const v = parseInt(localStorage.getItem(LLAVE) || '');
    return v > 0 ? v : null;
  } catch {
    return null;
  }
};

// Catálogo de ciudades para formularios y filtros internos
export const useCiudades = (soloActivas = true) => {
  const [ciudades, setCiudades] = useState<Ciudad[]>([]);
  useEffect(() => {
    api.get('/ciudades')
      .then((r) => setCiudades((r.data as Ciudad[]).filter((c) => !soloActivas || c.activa !== false)))
      .catch(() => setCiudades([]));
  }, [soloActivas]);
  return ciudades;
};

export const useFiltroCiudad = () => {
  const { usuario } = useAuth();
  const fija = usuario?.rol === 'admin' ? null : usuario?.ciudad || null;
  const [elegida, setElegida] = useState<number | null>(leerGuardada);

  const idCiudad = fija ? fija.id : elegida;
  const cambiar = (id: number | null) => {
    setElegida(id);
    try {
      if (id) localStorage.setItem(LLAVE, String(id));
      else localStorage.removeItem(LLAVE);
    } catch {
      // Sin almacenamiento (modo privado): el filtro vale solo mientras dure la página
    }
  };

  return {
    idCiudad,
    fija,
    cambiar,
    // Para mandar con api.get(url, { params })
    params: idCiudad ? { id_ciudad: idCiudad } : {}
  };
};

interface Props {
  filtro: ReturnType<typeof useFiltroCiudad>;
  className?: string;
}

const FiltroCiudad: React.FC<Props> = ({ filtro, className = '' }) => {
  const ciudades = useCiudades();

  if (filtro.fija) {
    return (
      <span className={`inline-flex items-center gap-1 text-sm bg-sky-50 text-sky-700 px-3 py-1.5 rounded-lg ${className}`}>
        <MapPin size={15} /> {filtro.fija.nombre}
      </span>
    );
  }

  return (
    <label className={`inline-flex items-center gap-1 text-sm ${className}`}>
      <MapPin size={15} className="text-sky-600" />
      <select
        value={filtro.idCiudad ?? ''}
        onChange={(e) => filtro.cambiar(e.target.value ? Number(e.target.value) : null)}
        className="px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
        aria-label="Ciudad"
      >
        <option value="">Todo el país</option>
        {ciudades.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
    </label>
  );
};

export default FiltroCiudad;
