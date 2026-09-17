// =========================================================================
// UTILIDADES: navegación (sidebar), modales, toasts, fechas, texto seguro
// =========================================================================
// Funciones chicas y sin estado propio, usadas desde varios módulos.

// --- Navegación por vistas (barra lateral) ---
const TITULOS_VISTA = {
  'vista-inventario': 'Control de Inventario y Medicamentos',
  'vista-historial': 'Historial de Movimientos (Auditoría)',
  'vista-alertas': 'Alertas de Stock y Vencimiento',
};

export function cambiarVista(idVista) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('activa', b.dataset.vista === idVista));
  document.querySelectorAll('.vista').forEach((v) => v.classList.toggle('activa', v.id === idVista));
  document.getElementById('titulo-vista').textContent = TITULOS_VISTA[idVista] || '';
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => cambiarVista(btn.dataset.vista));
});

// --- Modales ---
export function abrirModal(id) {
  document.getElementById(id).classList.remove('oculto');
}
export function cerrarModal(id) {
  document.getElementById(id).classList.add('oculto');
}
document.querySelectorAll('[data-cerrar-modal]').forEach((btn) => {
  btn.addEventListener('click', () => cerrarModal(btn.dataset.cerrarModal));
});
// Cerrar el modal si se hace clic afuera de la tarjeta
document.querySelectorAll('.modal-fondo').forEach((fondo) => {
  fondo.addEventListener('click', (e) => {
    if (e.target === fondo) fondo.classList.add('oculto');
  });
});

// --- Toast ---
// tipo puede ser 'exito' (verde, por defecto) o 'error' (rojo). El color
// refuerza de un vistazo si la acción salió bien o mal, sin tener que
// leer el texto completo — importante cuando se trabaja rápido.
let toastTimeout = null;
export function mostrarToast(texto, tipo = 'exito') {
  const toast = document.getElementById('toast');
  toast.textContent = (tipo === 'exito' ? '✔ ' : '✘ ') + texto;
  toast.className = 'toast ' + tipo;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('oculto'), 2800);
}

// --- Fechas ---

// Devuelve la fecha de HOY según el reloj de la computadora, en el
// formato que espera un <input type="date"> (AAAA-MM-DD). Se usa para
// completar sola la "fecha de ingreso" al dar de alta un medicamento
// nuevo. Ojo: se arma a mano con año/mes/día locales (en vez de usar
// toISOString(), que trabaja en UTC) para que no se corra un día en
// husos horarios donde eso podría pasar.
export function fechaDeHoyISO() {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

export function formatearFecha(fechaIso) {
  if (!fechaIso) return '-';
  const [anio, mes, dia] = fechaIso.split('-');
  return `${dia}/${mes}/${anio}`;
}

export function formatearFechaHora(fechaIso) {
  if (!fechaIso) return '-';
  const d = new Date(fechaIso);
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// --- Texto seguro (evita que datos cargados por el usuario rompan el HTML) ---
export function escapeHtml(texto) {
  if (texto === null || texto === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}
