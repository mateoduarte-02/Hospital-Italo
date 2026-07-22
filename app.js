// =========================================================================
// APP.JS - Lógica de la aplicación de gestión de stock de medicamentos
// =========================================================================
// Este archivo está dividido en secciones bien marcadas para que sea fácil
// de leer y explicar:
//   1. Conexión a Supabase
//   2. Estado global de la app (variables en memoria)
//   3. Autenticación (login, logout, sesión)
//   4. Carga de datos (medicamentos, movimientos, perfiles)
//   5. Renderizado de la tabla de inventario
//   6. Alta y edición de medicamentos
//   7. Ingreso / retiro de stock (con registro de auditoría)
//   8. Historial de un medicamento
//   9. Alertas (vencimiento y stock bajo)
//  10. Lector de código de barras
//  11. Utilidades (fechas, toasts, tabs, modales)
// =========================================================================


// =========================================================================
// 1. CONEXIÓN A SUPABASE
// =========================================================================
// SUPABASE_URL y SUPABASE_ANON_KEY vienen del archivo config.js, que se
// carga ANTES que este archivo en index.html.
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


// =========================================================================
// 2. ESTADO GLOBAL
// =========================================================================
// Guardamos acá, en memoria, los datos que ya trajimos de la base de datos
// para no tener que pedirlos de nuevo cada vez que dibujamos la pantalla.
// Cada vez que se agrega/edita/borra algo, volvemos a pedir los datos a
// Supabase y actualizamos estas listas.
const estado = {
  usuario: null,        // usuario autenticado (objeto de supabase.auth)
  perfil: null,          // fila de la tabla "profiles" del usuario actual
  medicamentos: [],      // cache de la tabla "medicamentos"
  movimientos: [],       // cache de la tabla "movimientos" (con el medicamento embebido)
  perfiles: {},          // mapa { id_usuario: nombre } para mostrar nombres en la auditoría
};

const DIAS_ALERTA_VENCIMIENTO = 15; // días de anticipación para avisar vencimientos


// =========================================================================
// 3. AUTENTICACIÓN
// =========================================================================

// Al cargar la página, nos fijamos si ya existe una sesión guardada
// (Supabase la guarda sola en el navegador). Si existe, entramos directo
// a la app sin pedir login de nuevo.
async function iniciarApp() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session) {
    await manejarSesionIniciada(session.user);
  } else {
    mostrarPantallaLogin();
  }

  // Nos suscribimos a los cambios de sesión (login / logout) para que la
  // pantalla reaccione automáticamente.
  supabaseClient.auth.onAuthStateChange((evento, session) => {
    if (evento === 'SIGNED_OUT') {
      mostrarPantallaLogin();
    }
  });
}

// Formulario de login
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('oculto');

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    errorEl.textContent = 'No se pudo iniciar sesión: revisá el email y la contraseña.';
    errorEl.classList.remove('oculto');
    return;
  }

  await manejarSesionIniciada(data.user);
});

// Botón de cerrar sesión
document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
});

// Se ejecuta cada vez que confirmamos que hay un usuario logueado.
// Busca (o crea) el perfil del usuario, muestra la app y carga los datos.
async function manejarSesionIniciada(usuario) {
  estado.usuario = usuario;
  estado.perfil = await obtenerOCrearPerfil(usuario);

  document.getElementById('nombre-usuario-actual').textContent = estado.perfil.nombre;
  document.getElementById('saludo-nombre').textContent = `Hola, ${estado.perfil.nombre} 👋`;

  mostrarPantallaApp();
  await cargarTodo();
}

// Busca el perfil del usuario en la tabla "profiles". Si por algún motivo
// no existe (por ejemplo, un usuario nuevo que el admin todavía no cargó
// en la tabla), se crea automáticamente uno básico usando la parte del
// email antes de la @, para que la app nunca se quede sin un nombre para
// mostrar. Lo ideal sigue siendo cargarlo a mano como se explica en el
// README (así se puede poner el nombre real, ej. "Juan").
async function obtenerOCrearPerfil(usuario) {
  const { data: perfilExistente } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', usuario.id)
    .maybeSingle();

  if (perfilExistente) {
    return perfilExistente;
  }

  const nombrePorDefecto = usuario.email.split('@')[0];
  const { data: perfilNuevo } = await supabaseClient
    .from('profiles')
    .insert({ id: usuario.id, nombre: nombrePorDefecto, email: usuario.email })
    .select()
    .single();

  return perfilNuevo || { nombre: nombrePorDefecto };
}

function mostrarPantallaLogin() {
  document.getElementById('pantalla-login').classList.remove('oculto');
  document.getElementById('pantalla-app').classList.add('oculto');
  document.getElementById('form-login').reset();
}

function mostrarPantallaApp() {
  document.getElementById('pantalla-login').classList.add('oculto');
  document.getElementById('pantalla-app').classList.remove('oculto');
}


// =========================================================================
// 4. CARGA DE DATOS
// =========================================================================

// Trae de Supabase las 3 tablas que necesitamos y vuelve a dibujar toda
// la pantalla. La llamamos al iniciar sesión y después de cada operación
// que modifique datos (alta, ingreso, retiro, ajuste).
async function cargarTodo() {
  await Promise.all([
    cargarPerfiles(),
    cargarMedicamentos(),
    cargarMovimientos(),
  ]);

  renderizarTablaMedicamentos();
  renderizarAlertas();
  renderizarTablaMovimientos();
  renderizarInicio();
}

async function cargarPerfiles() {
  const { data, error } = await supabaseClient.from('profiles').select('id, nombre');
  if (error) {
    console.error('Error cargando perfiles:', error);
    return;
  }
  estado.perfiles = {};
  data.forEach((p) => { estado.perfiles[p.id] = p.nombre; });
}

async function cargarMedicamentos() {
  const { data, error } = await supabaseClient
    .from('medicamentos')
    .select('*')
    .order('nombre_generico', { ascending: true });

  if (error) {
    console.error('Error cargando medicamentos:', error);
    mostrarToast('Error al cargar el inventario', 'error');
    return;
  }
  estado.medicamentos = data;
}

async function cargarMovimientos() {
  // Traemos el nombre del medicamento "embebido" gracias a la relación
  // (foreign key) entre movimientos.medicamento_id y medicamentos.id.
  const { data, error } = await supabaseClient
    .from('movimientos')
    .select('*, medicamentos(nombre_generico, nombre_comercial)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando movimientos:', error);
    return;
  }
  estado.movimientos = data;
}


// =========================================================================
// 5. RENDERIZADO DE LA TABLA DE INVENTARIO
// =========================================================================

function renderizarTablaMedicamentos() {
  const filtro = document.getElementById('buscador-inventario').value.trim().toLowerCase();
  const cuerpo = document.getElementById('cuerpo-tabla-medicamentos');
  cuerpo.innerHTML = '';

  const lista = estado.medicamentos.filter((m) => {
    if (!filtro) return true;
    const texto = `${m.nombre_generico} ${m.nombre_comercial || ''} ${m.lote || ''} ${m.codigo_barras || ''}`.toLowerCase();
    return texto.includes(filtro);
  });

  document.getElementById('inventario-vacio').classList.toggle('oculto', lista.length > 0);

  lista.forEach((m) => {
    const tr = document.createElement('tr');
    tr.dataset.id = m.id;

    const infoVenc = calcularEstadoVencimiento(m);
    const stockBajo = Number(m.stock_actual) <= Number(m.stock_minimo);

    tr.innerHTML = `
      <td>${chipEstado(m.estado)}</td>
      <td>${escapeHtml(m.nombre_generico)}</td>
      <td>${escapeHtml(m.nombre_comercial || '-')}</td>
      <td>${escapeHtml(m.lote || '-')}</td>
      <td>${escapeHtml(m.categoria || '-')}</td>
      <td>
        ${m.stock_actual} ${escapeHtml(m.unidad || '')}
        ${stockBajo ? '<br><span class="chip chip-stock-bajo">Stock bajo</span>' : ''}
      </td>
      <td>
        ${m.fecha_vencimiento ? formatearFecha(m.fecha_vencimiento) : '-'}
        ${infoVenc ? `<br><span class="chip ${infoVenc.clase}">${infoVenc.texto}</span>` : ''}
      </td>
      <td>${etiquetaCondicion(m.condicion_almacenamiento)}</td>
      <td>${escapeHtml(m.ubicacion || '-')}</td>
      <td>
        <div class="acciones-fila">
          <button class="btn btn-ingreso btn-chico" data-accion="ingreso">+ Ingreso</button>
          <button class="btn btn-retiro btn-chico" data-accion="retiro">- Retiro</button>
          <button class="btn btn-secundario btn-chico" data-accion="historial">Historial</button>
          <button class="btn btn-secundario btn-chico" data-accion="editar">Editar</button>
        </div>
      </td>
    `;

    // Conectamos los botones de la fila con sus acciones.
    tr.querySelector('[data-accion="ingreso"]').addEventListener('click', () => abrirModalMovimiento(m, 'ingreso'));
    tr.querySelector('[data-accion="retiro"]').addEventListener('click', () => abrirModalMovimiento(m, 'retiro'));
    tr.querySelector('[data-accion="historial"]').addEventListener('click', () => abrirModalHistorial(m));
    tr.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirModalMedicamento(m));

    cuerpo.appendChild(tr);
  });
}

document.getElementById('buscador-inventario').addEventListener('input', renderizarTablaMedicamentos);

function chipEstado(estadoMed) {
  const textos = { activo: 'Activo', vencido: 'Vencido', dado_de_baja: 'Dado de baja' };
  return `<span class="chip chip-${estadoMed}">${textos[estadoMed] || estadoMed}</span>`;
}

function etiquetaCondicion(condicion) {
  const textos = { ambiente: 'Ambiente', refrigerado: 'Refrigerado', cadena_frio: 'Cadena de frío' };
  return textos[condicion] || condicion;
}

// Calcula si un medicamento está vencido o próximo a vencer, para mostrar
// el chip correspondiente en la tabla y para armar la lista de alertas.
function calcularEstadoVencimiento(m) {
  if (!m.fecha_vencimiento || m.estado === 'dado_de_baja') return null;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vencimiento = new Date(m.fecha_vencimiento + 'T00:00:00');
  const diffDias = Math.round((vencimiento - hoy) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    return { clase: 'chip-vencido', texto: `Vencido hace ${Math.abs(diffDias)} días`, diffDias, critico: true };
  }
  if (diffDias <= DIAS_ALERTA_VENCIMIENTO) {
    return { clase: 'chip-vence-pronto', texto: `Vence en ${diffDias} días`, diffDias, critico: false };
  }
  return null;
}


// =========================================================================
// 6. ALTA Y EDICIÓN DE MEDICAMENTOS
// =========================================================================

document.getElementById('btn-abrir-alta').addEventListener('click', () => abrirModalMedicamento(null));

// Abre el modal de medicamento. Si se pasa un medicamento existente, lo
// abre en modo "edición" con los campos ya completados; si se pasa null,
// lo abre vacío en modo "alta".
function abrirModalMedicamento(medicamento, codigoPrecargado) {
  const form = document.getElementById('form-medicamento');
  form.reset();
  document.getElementById('medicamento-error').classList.add('oculto');

  document.getElementById('titulo-modal-medicamento').textContent =
    medicamento ? 'Editar medicamento' : 'Agregar medicamento';

  document.getElementById('med-id').value = medicamento ? medicamento.id : '';
  document.getElementById('med-codigo-barras').value = medicamento ? (medicamento.codigo_barras || '') : (codigoPrecargado || '');
  document.getElementById('med-nombre-generico').value = medicamento ? medicamento.nombre_generico : '';
  document.getElementById('med-nombre-comercial').value = medicamento ? (medicamento.nombre_comercial || '') : '';
  document.getElementById('med-lote').value = medicamento ? (medicamento.lote || '') : '';
  document.getElementById('med-categoria').value = medicamento ? (medicamento.categoria || '') : '';
  document.getElementById('med-unidad').value = medicamento ? (medicamento.unidad || '') : '';
  document.getElementById('med-stock-actual').value = medicamento ? medicamento.stock_actual : 0;
  document.getElementById('med-stock-minimo').value = medicamento ? medicamento.stock_minimo : 0;
  document.getElementById('med-fecha-ingreso').value = medicamento ? (medicamento.fecha_ingreso || '') : '';
  document.getElementById('med-fecha-vencimiento').value = medicamento ? (medicamento.fecha_vencimiento || '') : '';
  document.getElementById('med-condicion').value = medicamento ? medicamento.condicion_almacenamiento : 'ambiente';
  document.getElementById('med-ubicacion').value = medicamento ? (medicamento.ubicacion || '') : '';
  document.getElementById('med-proveedor').value = medicamento ? (medicamento.proveedor || '') : '';
  document.getElementById('med-estado').value = medicamento ? medicamento.estado : 'activo';

  abrirModal('modal-medicamento');
}

document.getElementById('form-medicamento').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('medicamento-error');
  errorEl.classList.add('oculto');

  const id = document.getElementById('med-id').value;
  const esNuevo = !id;

  const datos = {
    codigo_barras: valorOnull('med-codigo-barras'),
    nombre_generico: document.getElementById('med-nombre-generico').value.trim(),
    nombre_comercial: valorOnull('med-nombre-comercial'),
    lote: valorOnull('med-lote'),
    categoria: valorOnull('med-categoria'),
    unidad: valorOnull('med-unidad'),
    stock_actual: Number(document.getElementById('med-stock-actual').value),
    stock_minimo: Number(document.getElementById('med-stock-minimo').value),
    fecha_ingreso: valorOnull('med-fecha-ingreso'),
    fecha_vencimiento: valorOnull('med-fecha-vencimiento'),
    condicion_almacenamiento: document.getElementById('med-condicion').value,
    ubicacion: valorOnull('med-ubicacion'),
    proveedor: valorOnull('med-proveedor'),
    estado: document.getElementById('med-estado').value,
  };

  try {
    if (esNuevo) {
      datos.creado_por = estado.usuario.id;
      const { data: nuevo, error } = await supabaseClient
        .from('medicamentos')
        .insert(datos)
        .select()
        .single();
      if (error) throw error;

      // Registramos el alta en la auditoría, con el stock inicial cargado.
      await registrarMovimiento(nuevo.id, 'alta', datos.stock_actual, datos.stock_actual, 'Alta inicial del medicamento');
    } else {
      // Buscamos el stock que tenía ANTES de editar, para saber si hay
      // que dejar constancia de un ajuste manual de stock en la auditoría.
      const anterior = estado.medicamentos.find((m) => m.id === id);
      const { error } = await supabaseClient.from('medicamentos').update(datos).eq('id', id);
      if (error) throw error;

      if (anterior && Number(anterior.stock_actual) !== Number(datos.stock_actual)) {
        const diferencia = Number(datos.stock_actual) - Number(anterior.stock_actual);
        await registrarMovimiento(
          id,
          'ajuste',
          Math.abs(diferencia),
          datos.stock_actual,
          `Ajuste manual de stock (${diferencia > 0 ? '+' : ''}${diferencia}) editado desde el formulario`
        );
      }
    }

    cerrarModal('modal-medicamento');
    mostrarToast(esNuevo ? 'Medicamento agregado' : 'Medicamento actualizado');
    await cargarTodo();
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Ocurrió un error al guardar. Revisá que el código de barras no esté repetido.';
    errorEl.classList.remove('oculto');
  }
});

// Devuelve null si el campo está vacío (útil para fechas y textos
// opcionales, para no guardar strings vacíos en la base de datos).
function valorOnull(idCampo) {
  const v = document.getElementById(idCampo).value.trim();
  return v === '' ? null : v;
}


// =========================================================================
// 7. INGRESO / RETIRO DE STOCK
// =========================================================================

let medicamentoEnEdicionMovimiento = null;

function abrirModalMovimiento(medicamento, tipo) {
  medicamentoEnEdicionMovimiento = medicamento;

  document.getElementById('form-movimiento').reset();
  document.getElementById('movimiento-error').classList.add('oculto');

  document.getElementById('mov-medicamento-id').value = medicamento.id;
  document.getElementById('mov-tipo').value = tipo;
  document.getElementById('mov-nombre-medicamento').textContent =
    `${medicamento.nombre_generico}${medicamento.nombre_comercial ? ' (' + medicamento.nombre_comercial + ')' : ''}`;
  document.getElementById('mov-stock-actual-texto').textContent = `${medicamento.stock_actual} ${medicamento.unidad || ''}`;

  document.getElementById('titulo-modal-movimiento').textContent =
    tipo === 'ingreso' ? 'Ingreso de stock' : 'Retiro de stock';
  document.getElementById('btn-confirmar-movimiento').className =
    'btn btn-chico ' + (tipo === 'ingreso' ? 'btn-ingreso' : 'btn-retiro');
  document.getElementById('btn-confirmar-movimiento').textContent =
    tipo === 'ingreso' ? 'Confirmar ingreso' : 'Confirmar retiro';

  document.getElementById('mov-preview').classList.add('oculto');

  abrirModal('modal-movimiento');
  document.getElementById('mov-cantidad').focus();
}

// Actualiza en vivo, mientras se escribe la cantidad, cuál va a quedar el
// stock después del movimiento. Esta retroalimentación inmediata es la
// que ayuda a evitar errores: si alguien se equivoca de cero (ej. pone
// "50" en vez de "5"), lo nota ANTES de confirmar, no después.
document.getElementById('mov-cantidad').addEventListener('input', () => {
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
});

document.getElementById('form-movimiento').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('movimiento-error');
  errorEl.classList.add('oculto');

  const medicamentoId = document.getElementById('mov-medicamento-id').value;
  const tipo = document.getElementById('mov-tipo').value;
  const cantidad = Number(document.getElementById('mov-cantidad').value);
  const observaciones = document.getElementById('mov-observaciones').value.trim() || null;

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
async function registrarMovimiento(medicamentoId, tipo, cantidad, stockResultante, observaciones) {
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


// =========================================================================
// 8. HISTORIAL DE UN MEDICAMENTO
// =========================================================================

function abrirModalHistorial(medicamento) {
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
        <td>${etiquetaTipoMovimiento(mv.tipo)}</td>
        <td>${mv.cantidad ?? '-'}</td>
        <td>${mv.stock_resultante ?? '-'}</td>
        <td>${escapeHtml(mv.observaciones || '-')}</td>
      `;
      cuerpo.appendChild(tr);
    });
  }

  abrirModal('modal-historial');
}

function etiquetaTipoMovimiento(tipo) {
  const textos = {
    alta: '🆕 Alta',
    ingreso: '⬆️ Ingreso',
    retiro: '⬇️ Retiro',
    ajuste: '✏️ Ajuste',
    baja: '🚫 Baja',
  };
  return textos[tipo] || tipo;
}


// =========================================================================
// 9. ALERTAS (vencimiento y stock bajo)
// =========================================================================

function renderizarAlertas() {
  const listaVencimiento = document.getElementById('lista-alertas-vencimiento');
  const listaStock = document.getElementById('lista-alertas-stock');
  listaVencimiento.innerHTML = '';
  listaStock.innerHTML = '';

  const activos = estado.medicamentos.filter((m) => m.estado !== 'dado_de_baja');

  // --- Vencimientos ---
  const alertasVencimiento = activos
    .map((m) => ({ m, info: calcularEstadoVencimiento(m) }))
    .filter((x) => x.info !== null)
    .sort((a, b) => a.info.diffDias - b.info.diffDias);

  if (alertasVencimiento.length === 0) {
    listaVencimiento.innerHTML = '<p class="subtexto">No hay medicamentos vencidos ni próximos a vencer. 👍</p>';
  } else {
    alertasVencimiento.forEach(({ m, info }) => {
      const div = document.createElement('div');
      div.className = 'item-alerta' + (info.critico ? ' critico' : '');
      div.innerHTML = `
        <div class="info">
          <strong>${escapeHtml(m.nombre_generico)}</strong>
          <span>Lote ${escapeHtml(m.lote || '-')} · Vence ${formatearFecha(m.fecha_vencimiento)}</span>
        </div>
        <div class="valor">${info.texto}</div>
      `;
      listaVencimiento.appendChild(div);
    });
  }

  // --- Stock bajo ---
  const alertasStock = activos
    .filter((m) => Number(m.stock_actual) <= Number(m.stock_minimo))
    .sort((a, b) => Number(a.stock_actual) - Number(b.stock_actual));

  if (alertasStock.length === 0) {
    listaStock.innerHTML = '<p class="subtexto">Todo el stock está por encima del mínimo. 👍</p>';
  } else {
    alertasStock.forEach((m) => {
      const div = document.createElement('div');
      div.className = 'item-alerta' + (Number(m.stock_actual) === 0 ? ' critico' : '');
      div.innerHTML = `
        <div class="info">
          <strong>${escapeHtml(m.nombre_generico)}</strong>
          <span>Mínimo: ${m.stock_minimo} ${escapeHtml(m.unidad || '')}</span>
        </div>
        <div class="valor">${m.stock_actual} ${escapeHtml(m.unidad || '')}</div>
      `;
      listaStock.appendChild(div);
    });
  }

  const total = alertasVencimiento.length + alertasStock.length;
  const badge = document.getElementById('badge-alertas');
  badge.textContent = total;
  badge.classList.toggle('oculto', total === 0);

  // El contador de la pantalla de Inicio usa el mismo total que el badge
  // de la pestaña de Alertas, para que ambos siempre coincidan.
  document.getElementById('contador-alertas-inicio').textContent = total;
}


// =========================================================================
// 9.5. PANTALLA DE INICIO (accesos rápidos para agilizar el turno)
// =========================================================================
// Esta pantalla es la primera que ve la enfermera al iniciar sesión.
// Muestra 4 accesos directos a las acciones más frecuentes y un repaso
// de los últimos movimientos, para poder confirmar de un vistazo que el
// último ingreso/retiro quedó bien registrado.

function renderizarInicio() {
  const cuerpo = document.getElementById('lista-recientes');
  cuerpo.innerHTML = '';

  const ultimos = estado.movimientos.slice(0, 5);

  if (ultimos.length === 0) {
    cuerpo.innerHTML = '<p class="subtexto">Todavía no se registró ningún movimiento.</p>';
    return;
  }

  ultimos.forEach((mv) => {
    const div = document.createElement('div');
    div.className = 'item-reciente';
    const nombreMed = mv.medicamentos ? mv.medicamentos.nombre_generico : '(medicamento eliminado)';
    div.innerHTML = `
      <div class="info-izq">
        <strong>${etiquetaTipoMovimiento(mv.tipo)} — ${escapeHtml(nombreMed)}</strong>
        <span>${escapeHtml(estado.perfiles[mv.usuario_id] || 'Usuario desconocido')} · ${mv.cantidad ?? '-'} unidades · quedó en ${mv.stock_resultante ?? '-'}</span>
      </div>
      <div class="info-der">${formatearFechaHora(mv.created_at)}</div>
    `;
    cuerpo.appendChild(div);
  });
}

// Accesos rápidos: cada tarjeta lleva directo a la acción que representa.
document.getElementById('acceso-ingreso-retiro').addEventListener('click', () => {
  cambiarTab('tab-inventario');
  document.getElementById('input-scanner').focus();
});
document.getElementById('acceso-alertas').addEventListener('click', () => cambiarTab('tab-alertas'));
document.getElementById('acceso-agregar').addEventListener('click', () => abrirModalMedicamento(null));
document.getElementById('acceso-movimientos').addEventListener('click', () => cambiarTab('tab-movimientos'));


// =========================================================================
// 10. LECTOR DE CÓDIGO DE BARRAS
// =========================================================================
// Los lectores USB tipo "pistola" se comportan como un teclado: al
// escanear una etiqueta, escriben el código a gran velocidad y al final
// mandan un Enter automáticamente. Por eso alcanza con escuchar el evento
// "keydown" de este input y reaccionar cuando la tecla es "Enter".
const inputScanner = document.getElementById('input-scanner');
inputScanner.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();

  const codigo = inputScanner.value.trim();
  inputScanner.value = '';
  if (!codigo) return;

  buscarPorCodigoBarras(codigo);
});

// Mantenemos el foco en el campo de escaneo la mayor parte del tiempo,
// para que el/la usuario/a pueda escanear sin tener que hacer clic antes.
// Si se abre un modal, dejamos de forzar el foco (para no interrumpir al
// que esté escribiendo en un formulario).
document.addEventListener('click', () => {
  const hayModalAbierto = document.querySelector('.modal-fondo:not(.oculto)');
  if (!hayModalAbierto) inputScanner.focus();
});

function buscarPorCodigoBarras(codigo) {
  const mensajeEl = document.getElementById('scanner-mensaje');
  const encontrado = estado.medicamentos.find((m) => m.codigo_barras === codigo);

  if (encontrado) {
    mensajeEl.textContent = `✔ Encontrado: ${encontrado.nombre_generico}`;
    mensajeEl.className = 'scanner-mensaje ok';

    // Nos aseguramos de estar parados en la pestaña de inventario, y
    // filtramos/resaltamos la fila del medicamento encontrado.
    cambiarTab('tab-inventario');
    document.getElementById('buscador-inventario').value = encontrado.nombre_generico;
    renderizarTablaMedicamentos();

    const fila = document.querySelector(`#cuerpo-tabla-medicamentos tr[data-id="${encontrado.id}"]`);
    if (fila) {
      fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
      fila.classList.add('fila-destacada');
      setTimeout(() => fila.classList.remove('fila-destacada'), 2500);
    }
  } else {
    mensajeEl.textContent = `✘ No existe ningún medicamento con el código "${codigo}". Se abrió el formulario para cargarlo como nuevo.`;
    mensajeEl.className = 'scanner-mensaje error';
    abrirModalMedicamento(null, codigo);
  }
}


// =========================================================================
// 11. UTILIDADES: tabs, modales, toasts, fechas, texto
// =========================================================================

// --- Tabs ---
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => cambiarTab(btn.dataset.tab));
});

function cambiarTab(idTab) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('activa', b.dataset.tab === idTab));
  document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('activa', p.id === idTab));
}

// --- Modales ---
function abrirModal(id) {
  document.getElementById(id).classList.remove('oculto');
}
function cerrarModal(id) {
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
function mostrarToast(texto, tipo = 'exito') {
  const toast = document.getElementById('toast');
  toast.textContent = (tipo === 'exito' ? '✔ ' : '✘ ') + texto;
  toast.className = 'toast ' + tipo;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('oculto'), 2800);
}

// --- Movimientos (tabla de auditoría general) ---
function renderizarTablaMovimientos() {
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
      <td>${etiquetaTipoMovimiento(mv.tipo)}</td>
      <td>${mv.cantidad ?? '-'}</td>
      <td>${mv.stock_resultante ?? '-'}</td>
      <td>${escapeHtml(mv.observaciones || '-')}</td>
    `;
    cuerpo.appendChild(tr);
  });
}
document.getElementById('buscador-movimientos').addEventListener('input', renderizarTablaMovimientos);

// --- Fechas ---
function formatearFecha(fechaIso) {
  if (!fechaIso) return '-';
  const [anio, mes, dia] = fechaIso.split('-');
  return `${dia}/${mes}/${anio}`;
}

function formatearFechaHora(fechaIso) {
  if (!fechaIso) return '-';
  const d = new Date(fechaIso);
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// --- Texto seguro (evita que datos cargados por el usuario rompan el HTML) ---
function escapeHtml(texto) {
  if (texto === null || texto === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(texto);
  return div.innerHTML;
}


// =========================================================================
// PUNTO DE ENTRADA
// =========================================================================
iniciarApp();
