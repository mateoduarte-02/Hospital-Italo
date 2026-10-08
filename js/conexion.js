// =========================================================================
// ERRORES DE CONEXIÓN CON LA BASE DE DATOS
// Sirve para distinguir "no hay conexión con Supabase" (proyecto pausado,
// caído, sin internet) de un error normal como contraseña incorrecta, y
// mostrar un mensaje que no confunda al usuario.
// =========================================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const MENSAJE_SIN_CONEXION =
  'No se pudo conectar con la base de datos. Por favor, comuníquese con el desarrollador.';

// Un proyecto pausado no responde (o responde sin CORS), así que el fetch
// del navegador falla antes de llegar a una respuesta con detalle.
export function esErrorDeConexion(error) {
  if (!error) return false;
  const mensaje = String(error.message || '').toLowerCase();
  return (
    error.name === 'AuthRetryableFetchError' ||
    error.status === 0 ||
    (typeof error.status === 'number' && error.status >= 500) ||
    ['PGRST000', 'PGRST001', 'PGRST002'].includes(error.code) ||
    mensaje.includes('failed to fetch') ||
    mensaje.includes('networkerror') ||
    mensaje.includes('load failed')
  );
}

// Chequeo liviano al abrir el login: pregunta por el estado del servicio de
// autenticación de Supabase. Si el proyecto está pausado el fetch falla (o
// responde 5xx); si tarda demasiado también lo damos por caído.
export async function hayConexionConLaBase(tiempoMaximoMs = 8000) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), tiempoMaximoMs);
  try {
    const respuesta = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: controlador.signal,
    });
    return respuesta.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(temporizador);
  }
}

// Para las páginas internas: reemplaza todo el contenido por un aviso con
// botón de reintentar (no sirve redirigir al login, el problema no es la
// sesión).
export function mostrarPantallaSinConexion() {
  document.body.innerHTML = `
    <div class="aviso-conexion" role="alert">
      <span class="aviso-conexion-icono" aria-hidden="true">🔌</span>
      <h1>Sin conexión con la base de datos</h1>
      <p>${MENSAJE_SIN_CONEXION}</p>
      <button type="button" class="btn btn-primario" onclick="window.location.reload()">Reintentar</button>
    </div>
  `;
}
