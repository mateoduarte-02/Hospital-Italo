// =========================================================================
// MAIN-INVENTARIO.JS - Punto de entrada de inventario.html
// =========================================================================
import { iniciarShell } from './shell.js';
import { cargarInventario } from './datos.js';
import { iniciarScanner } from './scanner.js';
import { toggleDadosDeBaja } from './inventario.js';
import './medicamentos.js'; // conecta el formulario de alta/edición
import './movimientos.js'; // conecta el modal de ingreso/retiro

const perfil = await iniciarShell();
if (perfil) {
  await cargarInventario();
  iniciarScanner(); // acá también procesa "?codigo=" si llegamos desde otra página

  document.getElementById('check-dados-baja').addEventListener('change', (e) => {
    toggleDadosDeBaja(e.target.checked);
  });
}
