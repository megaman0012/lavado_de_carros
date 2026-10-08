import axios, { AxiosError, AxiosRequestConfig } from 'axios';
import { API_URL } from './config';

/**
 * Cliente HTTP y manejo de la sesión.
 *
 * La sesión son dos piezas (ver backend/src/services/sesion.service.js):
 *   - token de acceso: dura 15 minutos y viaja en cada petición;
 *   - token de refresco: dura 7 días y sirve para pedir uno de acceso nuevo.
 *
 * Cuando el acceso vence, el servidor responde 401. En vez de mandar al usuario
 * al login —que es lo que pasaba antes— se renueva por detrás y se repite la
 * petición: para quien está usando el panel, no ocurrió nada.
 */

const LLAVE_TOKEN = 'token';
const LLAVE_REFRESH = 'refresh_token';
const LLAVE_USUARIO = 'usuario';

export interface Sesion {
  token: string;
  refresh_token?: string;
}

export const guardarSesion = (sesion: Sesion) => {
  localStorage.setItem(LLAVE_TOKEN, sesion.token);
  // El refresco se reemplaza en cada renovación: guardar el nuevo es obligatorio,
  // el anterior queda quemado en el servidor.
  if (sesion.refresh_token) localStorage.setItem(LLAVE_REFRESH, sesion.refresh_token);
};

export const tokenRefresco = () => localStorage.getItem(LLAVE_REFRESH);

export const limpiarSesion = () => {
  localStorage.removeItem(LLAVE_TOKEN);
  localStorage.removeItem(LLAVE_REFRESH);
  localStorage.removeItem(LLAVE_USUARIO);
};

const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000
});

// Interceptor: agrega el token a cada request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(LLAVE_TOKEN);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

/**
 * Renovación en vuelo. El panel dispara varias llamadas por pantalla y todas
 * pueden recibir 401 a la vez; si cada una pidiera su propio refresco, la
 * primera rotaría el token y las demás llegarían con uno ya quemado, que el
 * servidor interpreta —con razón— como el reuso de una copia robada y cierra la
 * sesión. Por eso hay una sola renovación a la vez y las demás la esperan.
 */
let renovacionEnCurso: Promise<string> | null = null;

const renovarSesion = (): Promise<string> => {
  if (renovacionEnCurso) return renovacionEnCurso;

  const refresco = tokenRefresco();
  if (!refresco) return Promise.reject(new Error('sin token de refresco'));

  // Va con axios "pelado" a propósito: si usara `api`, un 401 del propio
  // refresco volvería a entrar a este interceptor y se llamaría a sí mismo.
  renovacionEnCurso = axios
    .post(`${API_URL}/auth/refresh`, { refresh_token: refresco })
    .then((r) => {
      const datos = r.data?.data;
      guardarSesion(datos);
      if (datos.usuario) localStorage.setItem(LLAVE_USUARIO, JSON.stringify(datos.usuario));
      return datos.token as string;
    })
    .finally(() => { renovacionEnCurso = null; });

  return renovacionEnCurso;
};

const alLogin = () => {
  limpiarSesion();
  if (!window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
};

// Peticiones de la sesión misma: un 401 acá es la respuesta, no algo que
// reintentar (login con credenciales malas, refresco vencido o revocado).
const esRutaDeSesion = (url?: string) =>
  !!url && /\/auth\/(login|refresh|logout|registrar)$/.test(url);

// Interceptor: extrae data del formato { success, data } y maneja errores
api.interceptors.response.use(
  (response) => {
    const data = response.data;
    if (data && typeof data === 'object' && 'success' in data && data.success === true && 'data' in data) {
      response.data = data.data;
    }
    return response;
  },
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _reintentada?: boolean }) | undefined;

    if (error.response?.status === 401 && original && !original._reintentada && !esRutaDeSesion(original.url)) {
      // Una sola repetición: si el token recién renovado también da 401, el
      // problema no es que haya vencido (cuenta suspendida, por ejemplo).
      original._reintentada = true;
      try {
        const nuevo = await renovarSesion();
        original.headers = { ...original.headers, Authorization: `Bearer ${nuevo}` };
        return api(original);
      } catch (e) {
        alLogin();
      }
    } else if (error.response?.status === 401) {
      alLogin();
    }

    const data = error.response?.data as any;
    return Promise.reject(new Error(data?.message || 'Error de conexión con el servidor'));
  }
);

export default api;
