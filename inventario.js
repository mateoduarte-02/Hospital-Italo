// =========================================================================
// RENDERIZADO DE LA TABLA DE INVENTARIO
// =========================================================================
import { estado, DIAS_ALERTA_VENCIMIENTO } from './estado.js';
import { escapeHtml, formatearFecha, claveProducto } from './utils.js';
import { abrirModalMedicamento, abrirModalLoteNuevo } from './medicamentos.js';
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
  const filtroSinTildes = claveProducto(filtro);
  const cuerpo = document.getElementById('cuerpo-tabla-medicamentos');
  cuerpo.innerHTML = '';

  const coincideFiltro = (m) => {
    if (!filtro) return true;
    const texto = `${m.nombre_generico} ${m.nombre_comercial || ''} ${m.lote || ''} ${m.codigo_barras || ''}`;
    return texto.toLowerCase().includes(filtro) || claveProducto(texto).includes(filtroSinTildes);
  };

  const medicamentosVisibles = mostrarDadosDeBaja
    ? estado.medicamentos
    : estado.medicamentos.filter((m) => m.estado !== 'dado_de_baja');

  // Agrupamos por MEDICAMENTO (nombre genérico): todas las marcas,
  // laboratorios y lotes de "Amoxicilina" se muestran juntos bajo un solo
  // encabezado (con el stock total y el vencimiento más próximo), aunque
  // cada caja tenga su propio código de barras.
  const grupos = new Map(); // clave del nombre -> [lotes de ese medicamento]
  medicamentosVisibles.forEach((m) => {
    const clave = claveProducto(m.nombre_generico);
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(m);
  });

  const listado = [...grupos.entries()]
    .map(([clave, lotes]) => ({ clave, lotes, coincidentes: lotes.filter(coincideFiltro) }))
    .filter((g) => g.coincidentes.length > 0)
    .sort(compararGrupos(ordenActual));

  listado.forEach(({ clave, lotes, coincidentes }) => {
    if (lotes.length === 1) {
      // Un solo lote: no aporta nada agruparlo, va como fila normal.
      cuerpo.appendChild(crearFilaLote(lotes[0], false));
      return;
    }

    // Mientras se está buscando algo, conviene mostrar el grupo ya
    // desplegado (para no obligar a un clic extra sobre lo que se
    // busca); si no hay búsqueda, respeta lo que el usuario haya
    // desplegado manualmente antes.
    const expandido = estado.gruposExpandidos.has(clave) || !!filtro;
    cuerpo.appendChild(crearFilaProducto(clave, lotes, expandido));

    if (expandido) {
      // Dentro de la bandeja, los lotes van ordenados por vencimiento (el
      // que vence antes, primero) y se marca cuál conviene usar primero.
      const loteFefo = elegirLoteQueSeUsaPrimero(lotes);
      const ordenados = [...coincidentes].sort(compararPorVencimiento);
      ordenados.forEach((m, i) => {
        cuerpo.appendChild(crearFilaLote(m, true, {
          esUltimo: i === ordenados.length - 1,
          seUsaPrimero: loteFefo && m.id === loteFefo.id,
        }));
      });
    }
  });

  document.getElementById('inventario-vacio').classList.toggle('oculto', listado.length > 0);
}

// --- Orden de la lista ---
// "Más recientes" / "Más antiguos" miran cuándo se CARGÓ cada lote en la
// app (no el vencimiento): un medicamento con varios lotes se ubica según
// su lote más nuevo (o más viejo). La elección se recuerda en este
// navegador para la próxima vez.
const ORDENES = ['az', 'za', 'recientes', 'antiguos'];
let ordenActual = 'az';
try {
  const guardado = localStorage.getItem('orden-inventario');
  if (ORDENES.includes(guardado)) ordenActual = guardado;
} catch { /* sin localStorage: queda A-Z */ }

function compararGrupos(orden) {
  const nombre = (g) => g.clave;
  const fechas = (g) => g.lotes.map((m) => m.created_at || '').sort();
  const masNueva = (g) => fechas(g).at(-1);
  const masVieja = (g) => fechas(g)[0];
  const porNombre = (a, b) => nombre(a).localeCompare(nombre(b), 'es');

  switch (orden) {
    case 'za': return (a, b) => -porNombre(a, b);
    case 'recientes': return (a, b) => masNueva(b).localeCompare(masNueva(a)) || porNombre(a, b);
    case 'antiguos': return (a, b) => masVieja(a).localeCompare(masVieja(b)) || porNombre(a, b);
    default: return porNombre;
  }
}

// Menú "Ordenar": un botón que abre una lista con las cuatro opciones,
// agrupadas en "Por nombre" y "Por fecha de carga". Se maneja con el
// mouse, con el dedo o con el teclado (flechas, Enter, Escape), igual
// que un <select>.
const OPCIONES_ORDEN = [
  { grupo: 'Por nombre' },
  { valor: 'az', texto: 'A → Z', corto: 'A → Z' },
  { valor: 'za', texto: 'Z → A', corto: 'Z → A' },
  { grupo: 'Por fecha de carga' },
  { valor: 'recientes', texto: 'Más recientes primero', corto: 'Más recientes' },
  { valor: 'antiguos', texto: 'Más antiguos primero', corto: 'Más antiguos' },
];

function iniciarMenuOrden() {
  const cont = document.getElementById('menu-orden');
  if (!cont) return;

  cont.innerHTML = `
    <button type="button" class="menu-orden-boton" id="btn-orden" aria-haspopup="listbox" aria-expanded="false" aria-controls="lista-orden">
      ${icono('ordenar', 16)}
      <span class="menu-orden-etiqueta">Ordenar:</span>
      <span class="menu-orden-valor" id="orden-actual"></span>
      <span class="menu-orden-flecha">${icono('chevron', 14)}</span>
    </button>
    <div class="menu-orden-lista oculto" id="lista-orden" role="listbox" aria-label="Ordenar la lista" tabindex="-1">
      ${OPCIONES_ORDEN.map((o) => o.grupo
        ? `<div class="menu-orden-grupo" role="presentation">${o.grupo}</div>`
        : `<div class="menu-orden-opcion" role="option" id="orden-${o.valor}" data-valor="${o.valor}" aria-selected="false">
             <span>${o.texto}</span><span class="menu-orden-check">${icono('check', 16)}</span>
           </div>`).join('')}
    </div>
  `;

  const boton = cont.querySelector('#btn-orden');
  const lista = cont.querySelector('#lista-orden');
  const opciones = [...lista.querySelectorAll('.menu-orden-opcion')];
  let resaltada = 0;

  const pintarSeleccion = () => {
    const actual = OPCIONES_ORDEN.find((o) => o.valor === ordenActual);
    cont.querySelector('#orden-actual').textContent = actual.corto;
    opciones.forEach((op) => op.setAttribute('aria-selected', String(op.dataset.valor === ordenActual)));
  };
  const resaltar = (i) => {
    resaltada = (i + opciones.length) % opciones.length;
    opciones.forEach((op, j) => op.classList.toggle('resaltada', j === resaltada));
    lista.setAttribute('aria-activedescendant', opciones[resaltada].id);
  };
  const abrir = () => {
    lista.classList.remove('oculto');
    cont.classList.add('abierto');
    boton.setAttribute('aria-expanded', 'true');
    resaltar(opciones.findIndex((op) => op.dataset.valor === ordenActual));
    lista.focus();
  };
  const cerrar = (devolverFoco) => {
    if (lista.classList.contains('oculto')) return;
    lista.classList.add('oculto');
    cont.classList.remove('abierto');
    boton.setAttribute('aria-expanded', 'false');
    if (devolverFoco) boton.focus();
  };
  const elegir = (valor) => {
    ordenActual = ORDENES.includes(valor) ? valor : 'az';
    try { localStorage.setItem('orden-inventario', ordenActual); } catch { /* no pasa nada */ }
    pintarSeleccion();
    cerrar(true);
    renderizarTablaMedicamentos();
  };

  boton.addEventListener('click', () => (lista.classList.contains('oculto') ? abrir() : cerrar(false)));
  boton.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); abrir(); }
  });
  opciones.forEach((op, i) => {
    op.addEventListener('click', () => elegir(op.dataset.valor));
    op.addEventListener('mousemove', () => { if (resaltada !== i) resaltar(i); });
  });
  lista.addEventListener('keydown', (e) => {
    const teclas = {
      ArrowDown: () => resaltar(resaltada + 1),
      ArrowUp: () => resaltar(resaltada - 1),
      Home: () => resaltar(0),
      End: () => resaltar(opciones.length - 1),
      Enter: () => elegir(opciones[resaltada].dataset.valor),
      ' ': () => elegir(opciones[resaltada].dataset.valor),
      Escape: () => cerrar(true),
      Tab: () => cerrar(false),
    };
    if (!teclas[e.key]) return;
    if (e.key !== 'Tab') e.preventDefault();
    teclas[e.key]();
  });
  document.addEventListener('click', (e) => { if (!cont.contains(e.target)) cerrar(false); });

  pintarSeleccion();
}
iniciarMenuOrden();

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

// Fila "producto": encabezado de un medicamento con 2 o más lotes (de una
// o varias marcas). Muestra el nombre una sola vez, el stock TOTAL
// sumado, y el vencimiento más urgente entre todos los lotes (el que
// primero necesita atención). Se despliega/repliega haciendo clic en
// cualquier parte de la fila.
function crearFilaProducto(clave, lotes, expandido) {
  const activos = lotes.filter((m) => m.estado !== 'dado_de_baja');
  // Los datos generales (categoría, unidad...) se toman del lote cargado
  // más recientemente; el nombre, de la forma en que más se escribió (así
  // un lote cargado como "apixabán" no le cambia el nombre a "Apixaban").
  const primero = { ...loteMasReciente(lotes), nombre_generico: nombreMasUsado(lotes) };
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

  // Marcas y códigos distintos dentro del grupo.
  const marcas = distintos(lotes.map((m) => m.nombre_comercial));
  const codigos = distintos(lotes.map((m) => m.codigo_barras));
  const textoMarcas = marcas.length === 1 ? marcas[0] : marcas.length > 1 ? `${marcas.length} marcas` : '';
  const codigoInvalido = codigos.find(esCodigoLink);
  const celdaCodigos = codigos.length === 1 ? celdaCodigo(codigos[0])
    : codigoInvalido ? celdaCodigo(codigoInvalido)
    : codigos.length > 1 ? `<span class="contador-codigos" title="${escapeHtml(codigos.join(' · '))}">${codigos.length} códigos</span>`
    : '<span class="texto-tenue">—</span>';

  const tr = document.createElement('tr');
  tr.className = 'fila-producto' + (expandido ? ' expandida' : '');
  tr.dataset.clave = clave;

  tr.innerHTML = `
    <td class="nombre-medicamento c-nombre">
      <div class="celda-producto">
      <button class="btn-expandir" type="button" aria-expanded="${expandido}" aria-label="${expandido ? 'Ocultar' : 'Ver'} los lotes de ${escapeHtml(primero.nombre_generico)}">${icono('chevron', 14)}</button>
      <div>
        <strong>${escapeHtml(primero.nombre_generico)}</strong>
        <span>${escapeHtml(textoMarcas)}</span>
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
    <td class="c-codigo">${celdaCodigos}</td>
    <td class="c-acciones">
      <div class="acciones-fila">
        <button class="btn btn-secundario btn-chico" data-accion="agregar-lote" aria-label="Agregar un lote nuevo de ${escapeHtml(primero.nombre_generico)}">${icono('mas', 15)} Lote</button>
      </div>
    </td>
  `;

  tr.addEventListener('click', () => toggleGrupo(clave));
  tr.querySelector('[data-accion="agregar-lote"]').addEventListener('click', (e) => {
    e.stopPropagation();
    abrirModalLoteNuevo(primero);
  });

  return tr;
}

function nombreMasUsado(lotes) {
  const cuenta = new Map();
  lotes.forEach((m) => {
    const nombre = m.nombre_generico.trim();
    cuenta.set(nombre, (cuenta.get(nombre) || 0) + 1);
  });
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function distintos(valores) {
  return [...new Set(valores.map((v) => (v || '').trim()).filter(Boolean))];
}

export function loteMasReciente(lotes) {
  return [...lotes].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0];
}

// Regla FEFO (primero vence, primero sale): entre los lotes con stock de
// este medicamento (de cualquier marca), el que vence antes se marca en
// la bandeja como el que conviene usar primero.
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
function esCodigoLink(codigo) {
  return /^https?(:|Ñ)/i.test(codigo || '');
}

function celdaCodigo(codigo) {
  if (!codigo) return '<span class="texto-tenue">—</span>';
  if (esCodigoLink(codigo)) {
    return `<span class="codigo-invalido" title="Se guardó el QR del laboratorio (${escapeHtml(codigo)}). Editá el lote y escaneá el código de barras de la caja.">${icono('alertas', 14)} Volver a escanear</span>`;
  }
  return `<span class="codigo-truncado" title="${escapeHtml(codigo)}">${escapeHtml(codigo)}</span>`;
}

// Despliega/repliega el listado de lotes de un medicamento agrupado.
function toggleGrupo(clave) {
  if (estado.gruposExpandidos.has(clave)) {
    estado.gruposExpandidos.delete(clave);
  } else {
    estado.gruposExpandidos.add(clave);
  }
  renderizarTablaMedicamentos();
}

// Fila "lote": un medicamento puntual (una caja/lote específico). Si
// "esHijo" es true, se está mostrando adentro de un grupo desplegado: no
// repite el nombre genérico ni la categoría (ya están en el encabezado),
// pero sí la marca y el código, que pueden cambiar de un lote a otro.
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
        ? `<span class="lote-indent">${m.nombre_comercial ? `<span class="marca-lote">${escapeHtml(m.nombre_comercial)}</span>` : ''}${seUsaPrimero ? '<span class="etiqueta-fefo" title="Es el lote con stock que vence antes: conviene usarlo primero">Se usa primero</span>' : ''}</span>`
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
    <td class="c-codigo">${celdaCodigo(m.codigo_barras)}</td>
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
