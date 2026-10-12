// Mapas - Total Clean Car
import { Visita } from '../types';

// Link a Google Maps de una visita: por coordenadas si hay, si no por dirección.
// Abre la app de mapas en el celular del lavador, con la que se navega.
export const mapaDe = (v: Pick<Visita, 'latitud' | 'longitud' | 'direccion'>) =>
  v.latitud != null && v.longitud != null
    ? `https://www.google.com/maps/search/?api=1&query=${v.latitud},${v.longitud}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.direccion)}`;
