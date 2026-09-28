import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { App as AppNativa } from '@capacitor/app';
import { esAppNativa } from './services/config';

// Botón "atrás" de Android en la APK: retrocede en el historial (cada paso de la
// reserva está en la URL); en la primera pantalla minimiza en vez de cerrar.
if (esAppNativa()) {
  AppNativa.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back();
    else AppNativa.minimizeApp();
  });
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals();
serviceWorkerRegistration.register();
