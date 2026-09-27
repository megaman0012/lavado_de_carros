// Registro del service worker (public/service-worker.js). Solo en producción.
export function register() {
  if (process.env.NODE_ENV !== 'production') return;
  if (!('serviceWorker' in navigator)) return;
  // Dentro de la APK los archivos ya vienen en el paquete: no hace falta caché propia
  if ((window as any).Capacitor?.isNativePlatform?.()) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${process.env.PUBLIC_URL}/service-worker.js`)
      .catch((error) => console.error('Error registrando el service worker:', error));
  });
}
