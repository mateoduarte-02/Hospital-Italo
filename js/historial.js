// =========================================================================
// HISTORIAL DE UN MEDICAMENTO Y TABLA DE AUDITORÍA GENERAL
// =========================================================================
import { estado } from './estado.js';
import { escapeHtml, formatearFechaHora, abrirModal } from './utils.js';

export function abrirModalHistorial(medicamento) {
  document.getElementById('titulo-modal-historial').textContent =
    `Historial - ${medicamento.nombre_generico}`;

  const cuerpo = document.getElementById('cuerpo-tabla-historial');
  cuerpo.innerHTML = '';

  const movimientos = estado.movimientos.filter((mv) => mv.medicamento_id === medicamento.id);

  if (movimientos.length === 0) {
    cuerpo.innerHTML = '<tr><td colspan="6" class="texto-vacio">Este medicamento todavía no tiene movimientos.</td></tr>';
  } else {
    movimientos.forEach((mv) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${formatearFechaHora(mv.created_at)}</td>
        <td>${escapeHtml(estado.perfiles[mv.usuario_id] || 'Usuario desconocido')}</td>
        <td>${celdaTipoMovimiento(mv)}</td>
        <td>${mv.cantidad ?? '-'}</td>
        <td>${mv.stock_resultante ?? '-'}</td>
        <td>${celdaObservaciones(mv)}</td>
      `;
      cuerpo.appendChild(tr);
    });
  }

  abrirModal('modal-historial');
}

export function etiquetaTipoMovimiento(tipo) {
  const textos = {
    alta: '🆕 Alta',
    ingreso: '⬆️ Ingreso',
    retiro: '⬇️ Retiro',
    ajuste: '✏️ Ajuste',
    baja: '🚫 Baja',
  };
  return textos[tipo] || tipo;
}

// Todo retiro registrado desde que existe la receta (PR) guarda al
// principio de "observaciones" la marca "[Con PR] ..." o "[Sin PR] ...".
// Esta función la interpreta para poder mostrarla como un chip aparte en
// vez de como texto plano, y separa el resto de las observaciones "de
// verdad" (lo que la persona haya escrito además del paciente/médico).
function parsearInfoPR(observaciones) {
  if (!observaciones) return null;
  if (observaciones.startsWith('[Con PR]')) {
    return { conPR: true, resto: observaciones.replace('[Con PR]', '').trim() };
  }
  if (observaciones.startsWith('[Sin PR]')) {
    return { conPR: false, resto: observaciones.replace('[Sin PR]', '').trim() };
  }
  return null; // movimiento anterior a esta funcionalidad, o no es un retiro
}

// Tipo de movimiento + (si es un retiro con la marca de receta) un chip
// bien visible de "Con PR" / "Sin PR", en vez de dejarlo escondido dentro
// del texto de observaciones.
function celdaTipoMovimiento(mv) {
  const base = etiquetaTipoMovimiento(mv.tipo);
  if (mv.tipo !== 'retiro') return base;

  const infoPR = parsearInfoPR(mv.observaciones);
  if (!infoPR) return base; // retiro viejo, de antes de que existiera esta marca

  const chip = infoPR.conPR
    ? '<span class="chip chip-pr-si">Con PR</span>'
    : '<span class="chip chip-pr-no">Sin PR</span>';
  return `${base} ${chip}`;
}

// Columna "Observaciones": si el movimiento tiene la marca de receta, se
// muestra solo lo que sigue (paciente/médico, o el resto del texto), sin
// repetir "[Con PR]"/"[Sin PR]" que ya se ve como chip en la columna Tipo.
function celdaObservaciones(mv) {
  const infoPR = parsearInfoPR(mv.observaciones);
  if (infoPR) return escapeHtml(infoPR.resto || '-');
  return escapeHtml(mv.observaciones || '-');
}

// --- Movimientos (tabla de auditoría general, vista "Historial") ---
export function renderizarTablaMovimientos() {
  const filtro = document.getElementById('buscador-movimientos').value.trim().toLowerCase();
  const cuerpo = document.getElementById('cuerpo-tabla-movimientos');
  cuerpo.innerHTML = '';

  const lista = estado.movimientos.filter((mv) => {
    if (!filtro) return true;
    const nombreMed = mv.medicamentos ? mv.medicamentos.nombre_generico : '';
    const nombreUsuario = estado.perfiles[mv.usuario_id] || '';
    return `${nombreMed} ${nombreUsuario}`.toLowerCase().includes(filtro);
  });

  document.getElementById('movimientos-vacio').classList.toggle('oculto', lista.length > 0);

  lista.forEach((mv) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${formatearFechaHora(mv.created_at)}</td>
      <td>${escapeHtml(estado.perfiles[mv.usuario_id] || 'Usuario desconocido')}</td>
      <td>${escapeHtml(mv.medicamentos ? mv.medicamentos.nombre_generico : '(medicamento eliminado)')}</td>
      <td>${celdaTipoMovimiento(mv)}</td>
      <td>${mv.cantidad ?? '-'}</td>
      <td>${mv.stock_resultante ?? '-'}</td>
      <td>${celdaObservaciones(mv)}</td>
    `;
    cuerpo.appendChild(tr);
  });
}
document.getElementById('buscador-movimientos').addEventListener('input', renderizarTablaMovimientos);
