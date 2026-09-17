// =========================================================================
// ALERTAS (vencimiento y stock bajo)
// =========================================================================
import { escapeHtml, formatearFecha } from './utils.js';
import { calcularAlertas } from './inventario.js';

export function renderizarAlertas() {
  const listaVencimiento = document.getElementById('lista-alertas-vencimiento');
  const listaStock = document.getElementById('lista-alertas-stock');
  listaVencimiento.innerHTML = '';
  listaStock.innerHTML = '';

  const { alertasVencimiento, alertasStock } = calcularAlertas();

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
        <div class="valor"><span class="stock-cantidad">${m.stock_actual}</span> <span class="stock-unidad">${escapeHtml(m.unidad || '')}</span></div>
      `;
      listaStock.appendChild(div);
    });
  }

  const total = alertasVencimiento.length + alertasStock.length;
  const badge = document.getElementById('badge-alertas');
  badge.textContent = total;
  badge.classList.toggle('oculto', total === 0);
}
