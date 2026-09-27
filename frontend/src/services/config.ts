// Dónde está el servidor - Total Clean Car
//
// En la web, frontend y API comparten origen (nginx hace de proxy de /api y
// /uploads), así que todo va con rutas relativas y REACT_APP_SERVIDOR queda vacío.
//
// En la APK (Capacitor) la app corre desde el propio teléfono (https://localhost):
// una ruta relativa como /uploads/... apuntaría al teléfono. Al compilar la APK se
// define REACT_APP_SERVIDOR=https://<dominio-del-servidor> y todo se resuelve contra él.
export const SERVIDOR = (process.env.REACT_APP_SERVIDOR || '').replace(/\/$/, '');

export const API_URL = process.env.REACT_APP_API_URL || `${SERVIDOR}/api`;

// URL de un archivo subido (evidencia, comprobante). La API las entrega firmadas
// y relativas: "/uploads/...?exp=...&firma=...".
export const urlArchivo = (ruta?: string | null): string =>
  !ruta ? '' : ruta.startsWith('/') ? `${SERVIDOR}${ruta}` : ruta;

// true dentro de la app Android/iOS empaquetada con Capacitor
export const esAppNativa = (): boolean => !!(window as any).Capacitor?.isNativePlatform?.();
