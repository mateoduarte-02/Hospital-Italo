// =========================================================================
// ALERTAS (vencimiento y stock bajo)
// =========================================================================
// Igual que en el inventario, un mismo PRODUCTO puede tener varios lotes
// en alerta (por ejemplo, 3 lotes de Polivitaminico todos por vencer). En
// vez de repetir el nombre del producto una vez por lote, los agrupamos
// bajo un solo renglón (con el dato más urgente de todos), que se puede
// desplegar para ver el detalle de cada lote.
import { escapeHtml, formatearFecha } from './utils.js';
import { calcularAlertas } from './inventario.js';

// Qué grupos están desplegados ahora mismo (se pierde al recargar la
// página, que es lo esperable para un estado puramente visual).
const gruposVencimientoExpandidos = new Set();
const gruposStockExpandidos = new Set();

export function renderizarAlertas() {
  const { alertasVencimiento, alertasStock } = calcularAlertas();

  renderizarListaVencimiento(alertasVencimiento);
  renderizarListaStock(alertasStock);

  const total = alertasVencimiento.length + alertasStock.length;
  const badge = document.getElementById('badge-alertas');
  badge.textContent = total;
  badge.classList.toggle('oculto', total === 0);
}

// Agrupa por código de barras (el mismo criterio que usa el inventario
// para agrupar lotes de un mismo producto). Los que no tienen código
// quedan cada uno en su propio grupo de 1 (no hay con qué agruparlos con
// certeza), usando su id para que nunca se mezclen entre sí.
function agruparPorProducto(lista, obtenerMedicamento) {
  const grupos = new Map();
  lista.forEach((item) => {
    const m = obtenerMedicamento(item);
    const clave = m.codigo_barras || `id:${m.id}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(item);
  });
  return [...grupos.entries()];
}

function toggleGrupo(set, clave) {
  if (set.has(clave)) set.delete(clave);
  else set.add(clave);
  renderizarAlertas();
}

// --- Próximos a vencer / vencidos ---

function renderizarListaVencimiento(alertasVencimiento) {
  const cont = document.getElementById('lista-alertas-vencimiento');
  cont.innerHTML = '';

  if (alertasVencimiento.length === 0) {
    cont.innerHTML = '<p class="subtexto">No hay medicamentos vencidos ni próximos a vencer. 👍</p>';
    return;
  }

  agruparPorProducto(alertasVencimiento, (item) => item.m).forEach(([clave, grupo]) => {
    if (grupo.length === 1) {
      cont.appendChild(crearItemVencimiento(grupo[0], false));
      return;
    }

    // Los items ya vienen ordenados de más a menos urgente (ver
    // calcularAlertas en inventario.js), así que el primero del grupo es
    // siempre el más urgente de sus lotes.
    const expandido = gruposVencimientoExpandidos.has(clave);
    cont.appendChild(crearGrupoVencimiento(grupo, clave, expandido));
    if (expandido) {
      grupo.forEach((item) => cont.appendChild(crearItemVencimiento(item, true)));
    }
  });
}

function crearItemVencimiento({ m, info }, esLote) {
  const div = document.createElement('div');
  div.className = 'item-alerta' + (info.critico ? ' critico' : '') + (esLote ? ' item-alerta-hija' : '');
  div.innerHTML = esLote
    ? `
      <div class="info">
        <strong>↳ Lote ${escapeHtml(m.lote || 's/n')}</strong>
        <span>Vence ${formatearFecha(m.fecha_vencimiento)}</span>
      </div>
      <div class="valor">${info.texto}</div>
    `
    : `
      <div class="info">
        <strong>${escapeHtml(m.nombre_generico)}</strong>
        <span>Lote ${escapeHtml(m.lote || '-')} · Vence ${formatearFecha(m.fecha_vencimiento)}</span>
      </div>
      <div class="valor">${info.texto}</div>
    `;
  return div;
}

function crearGrupoVencimiento(grupo, clave, expandido) {
  const masUrgente = grupo[0];
  const div = document.createElement('div');
  div.className = 'item-alerta item-alerta-grupo' + (masUrgente.info.critico ? ' critico' : '');
  div.innerHTML = `
    <div class="info">
      <strong>${expandido ? '▾' : '▸'} ${escapeHtml(masUrgente.m.nombre_generico)}</strong>
      <span>${grupo.length} lotes · el más próximo vence ${formatearFecha(masUrgente.m.fecha_vencimiento)}</span>
    </div>
    <div class="valor">${masUrgente.info.texto}</div>
  `;
  div.addEventListener('click', () => toggleGrupo(gruposVencimientoExpandidos, clave));
  return div;
}

// --- Stock por debajo del mínimo ---

function renderizarListaStock(alertasStock) {
  const cont = document.getElementById('lista-alertas-stock');
  cont.innerHTML = '';

  if (alertasStock.length === 0) {
    cont.innerHTML = '<p class="subtexto">Todo el stock está por encima del mínimo. 👍</p>';
    return;
  }

  agruparPorProducto(alertasStock, (m) => m).forEach(([clave, grupo]) => {
    if (grupo.length === 1) {
      cont.appendChild(crearItemStock(grupo[0], false));
      return;
    }

    const expandido = gruposStockExpandidos.has(clave);
    cont.appendChild(crearGrupoStock(grupo, clave, expandido));
    if (expandido) {
      grupo.forEach((m) => cont.appendChild(crearItemStock(m, true)));
    }
  });
}

function crearItemStock(m, esLote) {
  const div = document.createElement('div');
  div.className = 'item-alerta' + (Number(m.stock_actual) === 0 ? ' critico' : '') + (esLote ? ' item-alerta-hija' : '');
  div.innerHTML = `
    <div class="info">
      <strong>${esLote ? '↳ Lote ' + escapeHtml(m.lote || 's/n') : escapeHtml(m.nombre_generico)}</strong>
      <span>Mínimo: ${m.stock_minimo} ${escapeHtml(m.unidad || '')}</span>
    </div>
    <div class="valor"><span class="stock-cantidad">${m.stock_actual}</span> <span class="stock-unidad">${escapeHtml(m.unidad || '')}</span></div>
  `;
  return div;
}

function crearGrupoStock(grupo, clave, expandido) {
  const masCritico = grupo[0];
  const div = document.createElement('div');
  div.className = 'item-alerta item-alerta-grupo' + (Number(masCritico.stock_actual) === 0 ? ' critico' : '');
  div.innerHTML = `
    <div class="info">
      <strong>${expandido ? '▾' : '▸'} ${escapeHtml(masCritico.nombre_generico)}</strong>
      <span>${grupo.length} lotes por debajo del mínimo</span>
    </div>
    <div class="valor"><span class="stock-cantidad">${masCritico.stock_actual}</span> <span class="stock-unidad">${escapeHtml(masCritico.unidad || '')}</span></div>
  `;
  div.addEventListener('click', () => toggleGrupo(gruposStockExpandidos, clave));
  return div;
}
