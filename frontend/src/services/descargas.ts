import api from './api';

/**
 * Descarga un archivo generado por la API (Excel, PDF) respetando el header de
 * autorización: no se puede usar un <a href> directo porque el navegador no
 * manda el token en una navegación normal.
 */
export const descargarArchivo = async (ruta: string, nombreArchivo: string) => {
  const r = await api.get(ruta, { responseType: 'blob' });
  const url = window.URL.createObjectURL(r.data as unknown as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};

/** Acta de servicio en PDF de una reserva (datos, fotos, pagos, calificación). */
export const descargarActa = (idReserva: number, codigo: string) =>
  descargarArchivo(`/reportes/reserva/${idReserva}/acta.pdf`, `acta-${codigo}.pdf`);
