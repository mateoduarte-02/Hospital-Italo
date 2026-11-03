// =========================================================================
// MAIN-HISTORIAL.JS - Punto de entrada de historial.html
// =========================================================================
import { iniciarShell } from './shell.js';
import { cargarHistorial } from './datos.js';

const perfil = await iniciarShell();
if (perfil) {
  await cargarHistorial();
}
