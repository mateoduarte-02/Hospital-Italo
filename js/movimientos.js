// =========================================================================
// INGRESO / RETIRO DE STOCK (con registro de auditoría)
// =========================================================================
import { supabaseClient } from './supabase-client.js';
import { estado } from './estado.js';
import { abrirModal, cerrarModal, mostrarToast } from './utils.js';
import { cargarTodo } from './datos.js';

export function abrirModalMovimiento(medicamento, tipo) {
  document.getElementById('form-movimiento').reset();
  document.getElementById('movimiento-error').classList.add('oculto');

  document.getElementById('mov-medicamento-id').value = medicamento.id;
  document.getElementById('mov-nombre-medicamento').textContent =
    `${medicamento.nombre_generico}${medicamento.nombre_comercial ? ' (' + medicamento.nombre_comercial + ')' : ''}`;
  document.getElementById('mov-stock-actual-texto').textContent = `${medicamento.stock_actual} ${medicamento.unidad || ''}`;

  // El tipo con el que se abre es solo el punto de partida: viene
  // predefinido cuando se entra desde los botones +/− de la tabla, o es
  // una suposición (retiro) cuando entra desde el escáner. En cualquier
  // caso, el toggle de abajo deja cambiarlo antes de confirmar.
  aplicarTipoMovimiento(tipo);
  aplicarPR('no');

  document.getElementById('mov-preview').classList.add('oculto');

  abrirModal('modal-movimiento');
  document.getElementById('mov-cantidad').focus();
}

// Aplica el tipo de movimiento elegido (ingreso/retiro) a todo lo que
// depende de él: el campo oculto que se manda al guardar, el estado
// visual del toggle, el título del modal y el color/texto del botón de
// confirmar. Se usa tanto al abrir el modal como al tocar el toggle.
function aplicarTipoMovimiento(tipo) {
  document.getElementById('mov-tipo').value = tipo;

  document.querySelectorAll('.mov-tipo-boton').forEach((btn) => {
    btn.classList.toggle('activo', btn.dataset.tipo === tipo);
  });

  document.getElementById('titulo-modal-movimiento').textContent =
    tipo === 'ingreso' ? 'Ingreso de stock' : 'Retiro de stock';
  document.getElementById('btn-confirmar-movimiento').className =
    'btn btn-chico ' + (tipo === 'ingreso' ? 'btn-ingreso' : 'btn-retiro');
  document.getElementById('btn-confirmar-movimiento').textContent =
    tipo === 'ingreso' ? 'Confirmar ingreso' : 'Confirmar retiro';

  // La receta (PR) solo tiene sentido al retirar stock (se entrega un
  // medicamento a un paciente): en un ingreso no hay nada que prescribir,
  // así que directamente escondemos toda esa sección.
  document.getElementById('mov-pr-seccion').classList.toggle('oculto', tipo !== 'retiro');

  actualizarPreviewMovimiento();
}

document.querySelectorAll('.mov-tipo-boton').forEach((btn) => {
  btn.addEventListener('click', () => aplicarTipoMovimiento(btn.dataset.tipo));
});

// Aplica si el retiro es con receta (PR) o sin ella: guarda el valor,
// marca el botón activo y muestra/oculta los campos de paciente y médico
// (que solo son obligatorios cuando hay receta).
function aplicarPR(esConPR) {
  document.getElementById('mov-pr').value = esConPR;

  document.querySelectorAll('.mov-pr-boton').forEach((btn) => {
    btn.classList.toggle('activo', btn.dataset.pr === esConPR);
  });

  document.getElementById('mov-pr-campos').classList.toggle('oculto', esConPR !== 'si');
  if (esConPR === 'si') {
    document.getElementById('mov-pr-paciente').focus();
  }
}

document.querySelectorAll('.mov-pr-boton').forEach((btn) => {
  btn.addEventListener('click', () => aplicarPR(btn.dataset.pr));
});

// Actualiza en vivo, mientras se escribe la cantidad (o se cambia el tipo
// con el toggle), cuál va a quedar el stock después del movimiento. Esta
// retroalimentación inmediata es la que ayuda a evitar errores: si
// alguien se equivoca de cero (ej. pone "50" en vez de "5"), lo nota
// ANTES de confirmar, no después.
function actualizarPreviewMovimiento() {
  const preview = document.getElementById('mov-preview');
  const medicamentoId = document.getElementById('mov-medicamento-id').value;
  const tipo = document.getElementById('mov-tipo').value;
  const cantidad = Number(document.getElementById('mov-cantidad').value);
  const medicamento = estado.medicamentos.find((m) => m.id === medicamentoId);

  if (!medicamento || !cantidad || cantidad <= 0) {
    preview.classList.add('oculto');
    return;
  }

  const nuevoStock = tipo === 'ingreso'
    ? Number(medicamento.stock_actual) + cantidad
    : Number(medicamento.stock_actual) - cantidad;

  preview.classList.remove('oculto');

  if (tipo === 'retiro' && nuevoStock < 0) {
    preview.className = 'preview-resultado error';
    preview.textContent = `⚠ No hay stock suficiente (solo hay ${medicamento.stock_actual}).`;
  } else if (nuevoStock <= Number(medicamento.stock_minimo)) {
    preview.className = 'preview-resultado advertencia';
    preview.textContent = `Va a quedar en ${nuevoStock} ${medicamento.unidad || ''} — por debajo o igual al mínimo (${medicamento.stock_minimo}).`;
  } else {
    preview.className = 'preview-resultado bien';
    preview.textContent = `Va a quedar en ${nuevoStock} ${medicamento.unidad || ''}.`;
  }
}

document.getElementById('mov-cantidad').addEventListener('input', actualizarPreviewMovimiento);

document.getElementById('form-movimiento').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('movimiento-error');
  errorEl.classList.add('oculto');

  const medicamentoId = document.getElementById('mov-medicamento-id').value;
  const tipo = document.getElementById('mov-tipo').value;
  const cantidad = Number(document.getElementById('mov-cantidad').value);
  const observacionesTexto = document.getElementById('mov-observaciones').value.trim();

  const medicamento = estado.medicamentos.find((m) => m.id === medicamentoId);
  if (!medicamento) return;

  if (!cantidad || cantidad <= 0) {
    errorEl.textContent = 'Ingresá una cantidad válida, mayor a 0.';
    errorEl.classList.remove('oculto');
    return;
  }

  if (tipo === 'retiro' && cantidad > Number(medicamento.stock_actual)) {
    errorEl.textContent = `No hay stock suficiente. Stock actual: ${medicamento.stock_actual}.`;
    errorEl.classList.remove('oculto');
    return;
  }

  // Si el retiro es "con receta", el paciente y el médico son obligatorios:
  // son justamente el dato que justifica la entrega. En un ingreso, o en
  // un retiro "sin receta", esto ni se pide.
  const esConPR = tipo === 'retiro' && document.getElementById('mov-pr').value === 'si';
  const paciente = document.getElementById('mov-pr-paciente').value.trim();
  const medico = document.getElementById('mov-pr-medico').value.trim();

  if (esConPR && (!paciente || !medico)) {
    errorEl.textContent = 'Con receta (PR) hay que cargar el nombre del paciente y del médico.';
    errorEl.classList.remove('oculto');
    return;
  }

  // Además de exigir paciente/médico cuando hay receta, dejamos marcado
  // "[Con PR]" / "[Sin PR]" en TODO retiro (no solo cuando hay receta),
  // para que en el historial quede explícito uno u otro caso y no default
  // a "no dice nada" cuando es sin receta (ver historial.js).
  const observaciones = tipo === 'retiro'
    ? (esConPR
        ? `[Con PR] Paciente: ${paciente} — Médico: ${medico}` + (observacionesTexto ? ` — ${observacionesTexto}` : '')
        : `[Sin PR]` + (observacionesTexto ? ` ${observacionesTexto}` : ''))
    : (observacionesTexto || null);

  const nuevoStock = tipo === 'ingreso'
    ? Number(medicamento.stock_actual) + cantidad
    : Number(medicamento.stock_actual) - cantidad;

  try {
    const { error: errorUpdate } = await supabaseClient
      .from('medicamentos')
      .update({ stock_actual: nuevoStock })
      .eq('id', medicamentoId);
    if (errorUpdate) throw errorUpdate;

    await registrarMovimiento(medicamentoId, tipo, cantidad, nuevoStock, observaciones);

    cerrarModal('modal-movimiento');
    mostrarToast(tipo === 'ingreso' ? 'Ingreso registrado' : 'Retiro registrado');
    await cargarTodo();
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Ocurrió un error al registrar el movimiento.';
    errorEl.classList.remove('oculto');
  }
});

// Inserta una fila en la tabla "movimientos". Esta es la función clave de
// la AUDITORÍA: guarda qué medicamento, qué usuario, qué tipo de
// movimiento, cuánta cantidad, cuál quedó el stock resultante y con qué
// observaciones. El usuario_id sale de la sesión activa de Supabase Auth,
// nunca se pide a mano, así no se puede "falsificar" quién hizo el cambio.
export async function registrarMovimiento(medicamentoId, tipo, cantidad, stockResultante, observaciones) {
  const { error } = await supabaseClient.from('movimientos').insert({
    medicamento_id: medicamentoId,
    usuario_id: estado.usuario.id,
    tipo,
    cantidad,
    stock_resultante: stockResultante,
    observaciones,
  });
  if (error) console.error('Error registrando movimiento de auditoría:', error);
}
