// =========================================================================
// MAIN-ALERTAS.JS - Punto de entrada de alertas.html
// =========================================================================
import { iniciarShell } from './shell.js';
import { cargarAlertas } from './datos.js';

const perfil = await iniciarShell();
if (perfil) {
  await cargarAlertas();
}
