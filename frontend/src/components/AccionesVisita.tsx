import React, { useState } from 'react';
import { Navigation, MapPinCheck, XCircle, Map } from 'lucide-react';
import api from '../services/api';
import { Visita } from '../types';
import { mapaDe } from '../utils/mapas';

/**
 * Botones de una visita a domicilio, en el orden en que pasan las cosas:
 *   Salí (en camino: se avisa al cliente) → Llegué (con el GPS del celular,
 *   como prueba de presencia) → o "No se pudo lavar" (se cobra el cargo).
 * Lo usan el lavador (Mis trabajos) y el operador (hoja de ruta).
 */

// Motivos frecuentes: escribirlos igual permite contarlos en el reporte
const MOTIVOS = [
  'No había acceso al lugar',
  'No había toma de agua o de luz',
  'El vehículo no estaba',
  'El cliente canceló en el sitio',
  'Lluvia'
];

const pedirGps = () => new Promise<GeolocationPosition | null>((resolve) => {
  if (!navigator.geolocation) return resolve(null);
  navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true, timeout: 15000 });
});

interface Props {
  visita: Pick<Visita, 'id' | 'codigo' | 'estado' | 'direccion' | 'latitud' | 'longitud'>;
  onDone: () => void;
}

const AccionesVisita: React.FC<Props> = ({ visita, onDone }) => {
  const [trabajando, setTrabajando] = useState(false);
  const [aviso, setAviso] = useState('');

  const ejecutar = async (fn: () => Promise<string>) => {
    setTrabajando(true);
    setAviso('');
    try {
      setAviso(await fn());
      onDone();
    } catch (e: any) {
      setAviso(e.message);
    } finally {
      setTrabajando(false);
    }
  };

  const enCamino = () => ejecutar(async () => {
    await api.put(`/visitas/${visita.id}/en-camino`);
    return 'Listo: le avisamos al cliente que van en camino.';
  });

  const llegue = () => ejecutar(async () => {
    const p = await pedirGps();
    const r = await api.put(`/visitas/${visita.id}/llegada`, p
      ? { latitud: p.coords.latitude, longitud: p.coords.longitude, precision: p.coords.accuracy }
      : {});
    if (!p) return 'Llegada registrada sin GPS (el celular no dio la ubicación).';
    const d = r.data.distancia_m;
    return d == null ? 'Llegada registrada.' : d > 300
      ? `Llegada registrada, pero la marca quedó a ${d} m de la dirección.`
      : 'Llegada registrada en la dirección.';
  });

  const fallida = () => {
    const opciones = MOTIVOS.map((m, i) => `${i + 1}. ${m}`).join('\n');
    const resp = window.prompt(`¿Por qué no se pudo lavar? Escriba el número o el motivo:\n${opciones}`);
    if (!resp?.trim()) return;
    const motivo = MOTIVOS[parseInt(resp) - 1] || resp.trim();
    if (!window.confirm(`Marcar ${visita.codigo} como fallida: "${motivo}".\nSe cobra el cargo de visita. ¿Continuar?`)) return;
    ejecutar(async () => {
      const r = await api.put(`/visitas/${visita.id}/fallida`, { motivo });
      return r.data?.estado === 'fallida' ? 'Visita marcada como fallida.' : 'Listo.';
    });
  };

  const abierta = ['programada', 'en_camino', 'en_sitio'].includes(visita.estado);
  const boton = 'flex items-center gap-1 text-sm px-2.5 py-1.5 rounded-lg border disabled:opacity-50';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a href={mapaDe(visita)} target="_blank" rel="noreferrer" className={`${boton} border-slate-200 text-slate-600 hover:bg-slate-50`}>
          <Map size={15} /> Mapa
        </a>
        {visita.estado === 'programada' && (
          <button onClick={enCamino} disabled={trabajando} className={`${boton} border-sky-200 text-sky-700 hover:bg-sky-50`}>
            <Navigation size={15} /> Salí
          </button>
        )}
        {['programada', 'en_camino'].includes(visita.estado) && (
          <button onClick={llegue} disabled={trabajando} className={`${boton} border-emerald-200 text-emerald-700 hover:bg-emerald-50`}>
            <MapPinCheck size={15} /> Llegué
          </button>
        )}
        {abierta && (
          <button onClick={fallida} disabled={trabajando} className={`${boton} border-orange-200 text-orange-700 hover:bg-orange-50`}>
            <XCircle size={15} /> No se pudo lavar
          </button>
        )}
      </div>
      {aviso && <p className="text-xs text-slate-600">{aviso}</p>}
    </div>
  );
};

export default AccionesVisita;
