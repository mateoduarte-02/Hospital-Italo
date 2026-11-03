// =========================================================================
// MAIN-USUARIOS.JS - Punto de entrada de usuarios.html
// =========================================================================
import { iniciarShell } from './shell.js';
import { cargarUsuarios } from './usuarios.js';

const perfil = await iniciarShell();
if (perfil) {
  if (perfil.rol !== 'admin') {
    // Alguien no-admin entró a esta URL directo (no por el menú, que ya
    // le esconde el link). No tiene nada que hacer acá.
    window.location.href = 'inventario.html';
  } else {
    await cargarUsuarios();
  }
}
