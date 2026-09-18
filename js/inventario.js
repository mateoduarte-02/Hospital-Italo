// =========================================================================
// RENDERIZADO DE LA TABLA DE INVENTARIO
// =========================================================================
import { estado, DIAS_ALERTA_VENCIMIENTO } from './estado.js';
import { escapeHtml, formatearFecha } from './utils.js';
import { abrirModalMedicamento } from './medicamentos.js';
import { abrirModalMovimiento } from './movimientos.js';
import { abrirModalHistorial } from './historial.js';

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
      lotesQueCoinciden.forEach((m) => cuerpo.appendChild(crearFilaLote(m, true)));
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

  const hayStockBajo = activos.some((m) => Number(m.stock_actual) <= Number(m.stock_minimo));
  const hayVencido = infoVencimientos.some((info) => info.critico);

  const tr = document.createElement('tr');
  tr.className = 'fila-producto';
  tr.dataset.codigo = codigo;

  tr.innerHTML = `
    <td class="nombre-medicamento">
      <button class="btn-expandir" type="button" aria-label="Desplegar lotes">${expandido ? '▾' : '▸'}</button>
      <strong>${escapeHtml(primero.nombre_generico)}</strong>
      <span>${escapeHtml(primero.nombre_comercial || '')} · ${lotes.length} lotes</span>
    </td>
    <td>—</td>
    <td>${escapeHtml(primero.categoria || '-')}</td>
    <td>
      <span class="chip ${hayStockBajo ? 'chip-stock-bajo' : 'chip-stock-ok'}">
        <span class="stock-cantidad">${stockTotal}</span> <span class="stock-unidad">${escapeHtml(primero.unidad || '')}</span>
      </span>
    </td>
    <td>${infoMasUrgente ? `<span class="chip ${infoMasUrgente.clase}">${infoMasUrgente.texto}</span>` : '—'}</td>
    <td>${chipEstado(hayVencido ? 'vencido' : 'activo')}</td>
    <td><span class="codigo-truncado" title="${escapeHtml(codigo)}">${escapeHtml(codigo)}</span></td>
    <td>
      <div class="acciones-fila">
        <button class="btn btn-secundario btn-chico" data-accion="agregar-lote">+ Lote</button>
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
function crearFilaLote(m, esHijo) {
  const tr = document.createElement('tr');
  tr.dataset.id = m.id;
  if (esHijo) tr.className = 'fila-lote-hija';

  const infoVenc = calcularEstadoVencimiento(m);
  const stockBajo = Number(m.stock_actual) <= Number(m.stock_minimo);

  tr.innerHTML = `
    <td class="nombre-medicamento">
      ${esHijo
        ? `<span class="lote-indent">↳ lote</span>`
        : `<strong>${escapeHtml(m.nombre_generico)}</strong><span>${escapeHtml(m.nombre_comercial || '')}</span>`}
    </td>
    <td>${escapeHtml(m.lote || '-')}</td>
    <td>${esHijo ? '' : escapeHtml(m.categoria || '-')}</td>
    <td>
      <span class="chip ${stockBajo ? 'chip-stock-bajo' : 'chip-stock-ok'}">
        <span class="stock-cantidad">${m.stock_actual}</span> <span class="stock-unidad">${escapeHtml(m.unidad || '')}</span>
      </span>
    </td>
    <td>
      ${m.fecha_vencimiento ? formatearFecha(m.fecha_vencimiento) : '-'}
      ${infoVenc ? `<br><span class="chip ${infoVenc.clase}">${infoVenc.texto}</span>` : ''}
    </td>
    <td>${chipEstado(m.estado)}</td>
    <td>${esHijo ? '' : `<span class="codigo-truncado" title="${escapeHtml(m.codigo_barras || '')}">${escapeHtml(m.codigo_barras || '-')}</span>`}</td>
    <td>
      <div class="acciones-fila">
        <button class="btn-circular retiro" data-accion="retiro" title="Retirar stock">−</button>
        <button class="btn-circular ingreso" data-accion="ingreso" title="Ingresar stock">+</button>
        <button class="btn-circular neutro" data-accion="historial" title="Ver historial">🕓</button>
        <button class="btn-circular neutro" data-accion="editar" title="Editar medicamento">✎</button>
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
    return { clase: 'chip-vencido', texto: `Vencido hace ${Math.abs(diffDias)} días`, diffDias, critico: true };
  }
  if (diffDias <= DIAS_ALERTA_VENCIMIENTO) {
    return { clase: 'chip-vence-pronto', texto: `Vence en ${diffDias} días`, diffDias, critico: false };
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
}
