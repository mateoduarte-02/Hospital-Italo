// =========================================================================
// MAIN.JS - Punto de entrada de la app
// =========================================================================
// La lógica está dividida en un módulo por tema (todos acá, en js/):
//   supabase-client  -> conexión al backend
//   estado           -> datos en memoria compartidos entre módulos
//   utils            -> navegación, modales, toasts, fechas, texto seguro
//   auth             -> login, logout, sesión
//   datos            -> trae medicamentos/movimientos/perfiles de Supabase
//   inventario       -> tabla de inventario (agrupada por producto/lote)
//   alertas          -> vencimientos y stock bajo
//   historial        -> historial por medicamento y auditoría general
//   medicamentos     -> alta y edición de medicamentos
//   movimientos      -> ingreso / retiro de stock
//   scanner          -> lector de código de barras / QR
//   usuarios         -> aprobar/rechazar cuentas y asignar admins
//
// La mayoría de estos módulos conectan sus propios botones y formularios
// apenas se importan (por eso hay que importarlos todos acá, aunque no
// se use directamente nada de lo que exportan), tal como antes hacía el
// app.js único. iniciarApp() es lo único que se llama explícitamente.
import { iniciarApp } from './auth.js';
import './inventario.js';
import './alertas.js';
import './historial.js';
import './medicamentos.js';
import './movimientos.js';
import './scanner.js';
import './usuarios.js';

iniciarApp();
