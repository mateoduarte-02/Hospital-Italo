// =========================================================================
// RENDERIZADO DE LA TABLA DE INVENTARIO
// =========================================================================
import { estado, DIAS_ALERTA_VENCIMIENTO } from './estado.js';
import { escapeHtml, formatearFecha } from './utils.js';
import { abrirModalMedicamento } from './medicamentos.js';
import { abrirModalMovimiento } from './movimientos.js';
import { abrirModalHistorial } from './historial.js';
import { icono } from './iconos.js';

// Un lote con stock 0 se marca "dado de baja" automáticamente (ver
// medicamentos.js / movimientos.js) y por defecto no sirve de nada verlo
// en la tabla — se oculta, aunque sigue existiendo (con su historial
// intacto) por si hace falta consultarlo. El check "Mostrar dados de
// baja" del inventario cambia esto en memoria, sin recargar nada.
let mostrarDadosDeBaja = false;

export function toggleDadosDeBaja(mostrar) {
  mostrarDadosDeBaja = mostrar;
  renderizarTablaMedicamentos();
}

export function renderizarTablaMedicamentos() {
  const filtro = document.getElementById('buscador-inventario').value.trim().toLowerCase();
  const cuerpo = document.getElementById('cuerpo-tabla-medicamentos');
  cuerpo.innerHTML = '';

  const coincideFiltro = (m) => {
    if (!filtro) return true;
    const texto = `${m.nombre_generico} ${m.nombre_comercial || ''} ${m.lote || ''} ${m.codigo_barras || ''}`.toLowerCase();
    return texto.includes(filtro);
  };

  const medicamentosVisibles = mostrarDadosDeBaja
    ? estado.medicamentos
    : estado.medicamentos.filter((m) => m.estado !== 'dado_de_baja');

  // Agrupamos por código de barras: varias cajas/lotes del mismo PRODUCTO
  // comparten el mismo código, así que se muestran juntas bajo un solo
  // encabezado (con el stock total y el vencimiento más urgente), en vez
  // de repetir el nombre del producto una vez por cada lote. Los que no
  // tienen código cargado no se pueden agrupar, y se muestran sueltos.
  const grupos = new Map(); // codigo_barras -> [medicamentos de ese producto]
  const sueltos = [];

  medicamentosVisibles.forEach((m) => {
    if (!m.codigo_barras) {
      sueltos.push(m);
      return;
    }
    if (!grupos.has(m.codigo_barras)) grupos.set(m.codigo_barras, []);
    grupos.get(m.codigo_barras).push(m);
  });

  let huboResultados = false;

  grupos.forEach((lotes, codigo) => {
    const lotesQueCoinciden = lotes.filter(coincideFiltro);
    if (lotesQueCoinciden.length === 0) return;
    huboResultados = true;

    if (lotes.length === 1) {
      // Un solo lote con ese código: no aporta nada agruparlo, se
      // muestra como una fila normal y corriente.
      cuerpo.appendChild(crearFilaLote(lotes[0], false));
      return;
    }

    // Mientras se está buscando algo, conviene mostrar el grupo ya
    // desplegado (para no obligar a un clic extra sobre lo que se
    // busca); si no hay búsqueda, respeta lo que el usuario haya
    // desplegado manualmente antes.
    const expandido = estado.gruposExpandidos.has(codigo) || !!filtro;
    cuerpo.appendChild(crearFilaProducto(codigo, lotes, expandido));

    if (expandido) {
      // Dentro de la bandeja, los lotes van ordenados por vencimiento (el
      // que vence antes, primero) y se marca cuál se usa primero.
      const loteFefo = elegirLoteQueSeUsaPrimero(lotes);
      const ordenados = [...lotesQueCoinciden].sort(compararPorVencimiento);
      ordenados.forEach((m, i) => {
        cuerpo.appendChild(crearFilaLote(m, true, {
          esUltimo: i === ordenados.length - 1,
          seUsaPrimero: loteFefo && m.id === loteFefo.id,
        }));
      });
    }
  });

  sueltos.filter(coincideFiltro).forEach((m) => {
    huboResultados = true;
    cuerpo.appendChild(crearFilaLote(m, false));
  });

  document.getElementById('inventario-vacio').classList.toggle('oculto', huboResultados);
}

// Este módulo se importa (indirectamente, vía datos.js) desde todas las
// páginas de la app, aunque sus funciones de render solo se llaman
// realmente en inventario.html — por eso el guard: en cualquier otra
// página, el buscador de inventario no existe en el DOM.
const buscadorInventario = document.getElementById('buscador-inventario');
if (buscadorInventario) {
  buscadorInventario.addEventListener('input', renderizarTablaMedicamentos);
}

// Globo de ayuda de "Mostrar dados de baja": con el mouse aparece solo
// (CSS); en el celular se abre y cierra tocando la (i), y se cierra al
// tocar cualquier otro lado.
const botonAyuda = document.querySelector('.btn-ayuda');
if (botonAyuda) {
  const contenedorAyuda = botonAyuda.closest('.check-con-ayuda');
  botonAyuda.addEventListener('click', (e) => {
    e.stopPropagation();
    const abierto = contenedorAyuda.classList.toggle('abierto');
    botonAyuda.setAttribute('aria-expanded', String(abierto));
  });
  document.addEventListener('click', (e) => {
    if (!contenedorAyuda.contains(e.target)) {
      contenedorAyuda.classList.remove('abierto');
      botonAyuda.setAttribute('aria-expanded', 'false');
    }
  });
}

// Fila "producto": encabezado de un grupo de 2 o más lotes que
// comparten el mismo código de barras. Muestra el nombre una sola vez,
// el stock TOTAL sumado, y el vencimiento más urgente entre todos los
// lotes (el que primero necesita atención). Se despliega/repliega
// haciendo clic en cualquier parte de la fila.
function crearFilaProducto(codigo, lotes, expandido) {
  const activos = lotes.filter((m) => m.estado !== 'dado_de_baja');
  const primero = lotes[0];
  const stockTotal = activos.reduce((acc, m) => acc + Number(m.stock_actual), 0);

  const infoVencimientos = activos
    .map((m) => calcularEstadoVencimiento(m))
    .filter((info) => info !== null)
    .sort((a, b) => a.diffDias - b.diffDias);
  const infoMasUrgente = infoVencimientos[0] || null;

  // Vencimiento más próximo entre los lotes activos, aunque no sea urgente:
  // es el dato que más sirve ver sin desplegar el producto.
  const proximoVencimiento = activos
    .map((m) => m.fecha_vencimiento)
    .filter(Boolean)
    .sort()[0] || null;

  const hayStockBajo = activos.some((m) => Number(m.stock_actual) <= Number(m.stock_minimo));
  const hayVencido = infoVencimientos.some((info) => info.critico);

  const tr = document.createElement('tr');
  tr.className = 'fila-producto' + (expandido ? ' expandida' : '');
  tr.dataset.codigo = codigo;

  tr.innerHTML = `
    <td class="nombre-medicamento c-nombre">
      <div class="celda-producto">
      <button class="btn-expandir" type="button" aria-expanded="${expandido}" aria-label="${expandido ? 'Ocultar' : 'Ver'} los lotes de ${escapeHtml(primero.nombre_generico)}">${icono('chevron', 14)}</button>
      <div>
        <strong>${escapeHtml(primero.nombre_generico)}</strong>
        <span>${escapeHtml(primero.nombre_comercial || '')}</span>
      </div>
      </div>
    </td>
    <td class="c-lote"><span class="contador-lotes">${lotes.length} lotes</span></td>
    <td class="c-cat">${escapeHtml(primero.categoria || '-')}</td>
    <td class="c-stock">${celdaStock(stockTotal, primero.unidad, hayStockBajo)}</td>
    <td class="c-venc">
      ${proximoVencimiento ? `<span class="fecha-venc" title="Vencimiento más próximo entre sus lotes"><span class="texto-tenue">Próx.<span class="solo-movil"> venc.</span></span> ${formatearFecha(proximoVencimiento)}</span>` : '<span class="texto-tenue">—</span>'}
      ${infoMasUrgente ? `<span class="chip chip-venc ${infoMasUrgente.clase}">${infoMasUrgente.texto}</span>` : ''}
    </td>
    <td class="c-estado">${chipEstado(hayVencido ? 'vencido' : 'activo')}</td>
    <td class="c-codigo">${celdaCodigo(codigo)}</td>
    <td class="c-acciones">
      <div class="acciones-fila">
        <button class="btn btn-secundario btn-chico" data-accion="agregar-lote" aria-label="Agregar un lote de ${escapeHtml(primero.nombre_generico)}">${icono('mas', 15)} Lote</button>
      </div>
    </td>
  `;

  tr.addEventListener('click', () => toggleGrupo(codigo));
  tr.querySelector('[data-accion="agregar-lote"]').addEventListener('click', (e) => {
    e.stopPropagation();
    abrirModalMedicamento(null, codigo);
  });

  return tr;
}

// Mismo criterio que usa el escáner para elegir de qué lote retirar
// (FEFO: primero vence, primero sale), para marcarlo en la bandeja.
function elegirLoteQueSeUsaPrimero(lotes) {
  const disponibles = lotes.filter((m) => m.estado !== 'dado_de_baja' && Number(m.stock_actual) > 0);
  if (disponibles.length < 2) return null; // con un solo lote no hace falta marcarlo
  return [...disponibles].sort(compararPorVencimiento)[0];
}

function compararPorVencimiento(a, b) {
  if (!a.fecha_vencimiento && !b.fecha_vencimiento) return 0;
  if (!a.fecha_vencimiento) return 1;
  if (!b.fecha_vencimiento) return -1;
  return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento);
}

function celdaStock(cantidad, unidad, esBajo) {
  return `<span class="chip ${esBajo ? 'chip-stock-bajo' : 'chip-stock-ok'}"${esBajo ? ' title="En o por debajo del stock mínimo"' : ''}>
    <span class="stock-cantidad">${cantidad}</span> <span class="stock-unidad">${escapeHtml(unidad || '')}</span>
  </span>`;
}

// Un código guardado desde el QR del laboratorio (un link) no sirve para
// encontrar el producto al escanear: se marca para que lo corrijan.
function celdaCodigo(codigo) {
  if (!codigo) return '<span class="texto-tenue">—</span>';
  if (/^https?(:|Ñ)/i.test(codigo)) {
    return `<span class="codigo-invalido" title="Se guardó el QR del laboratorio (${escapeHtml(codigo)}). Editá el lote y escaneá el código de barras de la caja.">${icono('alertas', 14)} Volver a escanear</span>`;
  }
  return `<span class="codigo-truncado" title="${escapeHtml(codigo)}">${escapeHtml(codigo)}</span>`;
}

// Despliega/repliega el listado de lotes de un producto agrupado.
function toggleGrupo(codigo) {
  if (estado.gruposExpandidos.has(codigo)) {
    estado.gruposExpandidos.delete(codigo);
  } else {
    estado.gruposExpandidos.add(codigo);
  }
  renderizarTablaMedicamentos();
}

// Fila "lote": un medicamento puntual (una caja/lote específico). Si
// "esHijo" es true, se está mostrando adentro de un grupo desplegado, y
// no repite el nombre/categoría/código (ya están en el encabezado del
// grupo, justo arriba).
function crearFilaLote(m, esHijo, { esUltimo = false, seUsaPrimero = false } = {}) {
  const tr = document.createElement('tr');
  tr.dataset.id = m.id;
  if (esHijo) tr.className = 'fila-lote-hija' + (esUltimo ? ' ultimo-lote' : '');

  const infoVenc = calcularEstadoVencimiento(m);
  const stockBajo = Number(m.stock_actual) <= Number(m.stock_minimo);
  // Si la fecha ya pasó, se muestra "Vencido" aunque en la base siga
  // figurando como activo (el estado guardado no se toca).
  const estadoVisible = m.estado === 'activo' && infoVenc && infoVenc.critico ? 'vencido' : m.estado;

  tr.innerHTML = `
    <td class="nombre-medicamento c-nombre">
      ${esHijo
        ? `<span class="lote-indent">${seUsaPrimero ? '<span class="etiqueta-fefo" title="Es el que vence antes: el escáner retira de este lote">Se usa primero</span>' : ''}</span>`
        : `<strong>${escapeHtml(m.nombre_generico)}</strong><span>${escapeHtml(m.nombre_comercial || '')}</span>`}
    </td>
    <td class="c-lote"><span class="solo-movil texto-tenue">Lote </span><span class="numero-lote">${escapeHtml(m.lote || '-')}</span></td>
    <td class="c-cat">${esHijo ? '' : escapeHtml(m.categoria || '-')}</td>
    <td class="c-stock">${celdaStock(m.stock_actual, m.unidad, stockBajo)}</td>
    <td class="c-venc">
      <span class="fecha-venc"><span class="solo-movil texto-tenue">Vence </span>${m.fecha_vencimiento ? formatearFecha(m.fecha_vencimiento) : '<span class="texto-tenue">—</span>'}</span>
      ${infoVenc ? `<span class="chip chip-venc ${infoVenc.clase}">${infoVenc.texto}</span>` : ''}
    </td>
    <td class="c-estado">${chipEstado(estadoVisible)}</td>
    <td class="c-codigo">${esHijo ? '' : celdaCodigo(m.codigo_barras)}</td>
    <td class="c-acciones">
      <div class="acciones-fila">
        <button class="btn-circular retiro" data-accion="retiro" title="Retirar stock" aria-label="Retirar stock">${icono('menos', 16)}<span class="solo-movil">Retirar</span></button>
        <button class="btn-circular ingreso" data-accion="ingreso" title="Ingresar stock" aria-label="Ingresar stock">${icono('mas', 16)}<span class="solo-movil">Ingresar</span></button>
        <button class="btn-circular" data-accion="historial" title="Ver historial" aria-label="Ver historial">${icono('reloj', 16)}</button>
        <button class="btn-circular" data-accion="editar" title="Editar" aria-label="Editar">${icono('editar', 15)}</button>
      </div>
    </td>
  `;

  // Conectamos los botones de la fila con sus acciones.
  tr.querySelector('[data-accion="ingreso"]').addEventListener('click', () => abrirModalMovimiento(m, 'ingreso'));
  tr.querySelector('[data-accion="retiro"]').addEventListener('click', () => abrirModalMovimiento(m, 'retiro'));
  tr.querySelector('[data-accion="historial"]').addEventListener('click', () => abrirModalHistorial(m));
  tr.querySelector('[data-accion="editar"]').addEventListener('click', () => abrirModalMedicamento(m));

  return tr;
}

function chipEstado(estadoMed) {
  const textos = { activo: 'Activo', vencido: 'Vencido', dado_de_baja: 'Dado de baja' };
  return `<span class="chip chip-${estadoMed}">${textos[estadoMed] || estadoMed}</span>`;
}

// Calcula si un medicamento está vencido o próximo a vencer, para mostrar
// el chip correspondiente en la tabla y para armar la lista de alertas.
export function calcularEstadoVencimiento(m) {
  if (!m.fecha_vencimiento || m.estado === 'dado_de_baja') return null;

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vencimiento = new Date(m.fecha_vencimiento + 'T00:00:00');
  const diffDias = Math.round((vencimiento - hoy) / (1000 * 60 * 60 * 24));

  if (diffDias < 0) {
    const dias = Math.abs(diffDias);
    return { clase: 'chip-vencido', texto: dias === 1 ? 'Venció ayer' : `Vencido hace ${dias} días`, diffDias, critico: true };
  }
  if (diffDias <= DIAS_ALERTA_VENCIMIENTO) {
    const texto = diffDias === 0 ? 'Vence hoy' : diffDias === 1 ? 'Vence mañana' : `Vence en ${diffDias} días`;
    return { clase: 'chip-vence-pronto', texto, diffDias, critico: false };
  }
  return null;
}

// Reúne, en un solo lugar, la lógica de qué medicamentos disparan alertas
// (de vencimiento y de stock bajo). La usan tanto la vista "Alertas Stock"
// (ver alertas.js) como las tarjetas resumen de la vista "Inventario", para
// no calcular lo mismo dos veces de formas distintas.
export function calcularAlertas() {
  const activos = estado.medicamentos.filter((m) => m.estado !== 'dado_de_baja');

  const alertasVencimiento = activos
    .map((m) => ({ m, info: calcularEstadoVencimiento(m) }))
    .filter((x) => x.info !== null)
    .sort((a, b) => a.info.diffDias - b.info.diffDias);

  const alertasStock = activos
    .filter((m) => Number(m.stock_actual) <= Number(m.stock_minimo))
    .sort((a, b) => Number(a.stock_actual) - Number(b.stock_actual));

  return { alertasVencimiento, alertasStock };
}

// Actualiza las tarjetas resumen de la parte superior de "Inventario".
export function renderizarStatsInventario() {
  const { alertasVencimiento, alertasStock } = calcularAlertas();
  const activos = estado.medicamentos.filter((m) => m.estado !== 'dado_de_baja');
  document.getElementById('resumen-total').textContent = activos.length;
  document.getElementById('resumen-stock-bajo').textContent = alertasStock.length;
  document.getElementById('resumen-vencimiento').textContent = alertasVencimiento.length;

  // Los números de alerta sólo toman color cuando hay algo que mirar.
  document.getElementById('resumen-stock-bajo').closest('.tarjeta-resumen').classList.toggle('hay-alerta', alertasStock.length > 0);
  document.getElementById('resumen-vencimiento').closest('.tarjeta-resumen').classList.toggle('hay-alerta', alertasVencimiento.length > 0);
}
