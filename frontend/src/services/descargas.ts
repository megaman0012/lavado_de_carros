import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import api from './api';
import { esAppNativa } from './config';

// Blob -> base64 (sin el prefijo "data:...;base64,"), que es lo que pide Filesystem
const aBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const lector = new FileReader();
  lector.onload = () => resolve(String(lector.result).split(',')[1] || '');
  lector.onerror = reject;
  lector.readAsDataURL(blob);
});

/**
 * Descarga un archivo generado por la API (Excel, PDF) respetando el header de
 * autorización: no se puede usar un <a href> directo porque el navegador no
 * manda el token en una navegación normal.
 */
export const descargarArchivo = async (ruta: string, nombreArchivo: string) => {
  const r = await api.get(ruta, { responseType: 'blob' });

  // En la APK el WebView de Android ignora <a download>: el archivo se guarda en
  // la caché de la app y se abre el menú de compartir (WhatsApp, Drive, visor PDF...)
  if (esAppNativa()) {
    const guardado = await Filesystem.writeFile({
      path: nombreArchivo,
      data: await aBase64(r.data as unknown as Blob),
      directory: Directory.Cache
    });
    await Share.share({ title: nombreArchivo, url: guardado.uri });
    return;
  }

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
