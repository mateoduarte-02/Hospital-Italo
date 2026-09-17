// =========================================================================
// LECTOR DE CÓDIGO DE BARRAS
// =========================================================================
// Los lectores USB tipo "pistola" se comportan como un teclado: al
// escanear una etiqueta, escriben el código a gran velocidad y al final
// mandan un Enter automáticamente. Por eso alcanza con escuchar el evento
// "keydown" de este input y reaccionar cuando la tecla es "Enter".
import { estado } from './estado.js';
import { cambiarVista } from './utils.js';
import { renderizarTablaMedicamentos } from './inventario.js';
import { abrirModalMovimiento } from './movimientos.js';
import { abrirModalMedicamento } from './medicamentos.js';

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
document.addEventListener('click', (e) => {
  const hayModalAbierto = document.querySelector('.modal-fondo:not(.oculto)');
  if (hayModalAbierto) return;

  // Si el clic fue sobre otro campo editable (un buscador, un input de
  // un formulario, etc.), respetamos esa elección: la persona quiere
  // escribir ahí, no en el escáner. Sólo devolvemos el foco al escáner
  // cuando se hizo clic en una parte "neutra" de la página (el fondo,
  // una fila de la tabla, un botón que no sea de texto, etc.).
  const elementoClickeado = e.target;
  const esCampoEditable = elementoClickeado.closest('input, textarea, select');
  if (esCampoEditable) return;

  inputScanner.focus();
});

// -------------------------------------------------------------------------
// Parser de códigos GS1 (sistema de trazabilidad de medicamentos ANMAT,
// conocido como "Trazamed").
// -------------------------------------------------------------------------
// Muchos medicamentos en Argentina llevan, además del código de barras
// simple, un código 2D (DataMatrix/QR) que sigue el estándar GS1: adentro
// del mismo código vienen comprimidos varios datos, identificados con un
// "AI" (Application Identifier) de 2 dígitos:
//   01 / 02  -> GTIN: el código que identifica el PRODUCTO
//   17       -> fecha de vencimiento, en formato AAMMDD
//   10       -> número de lote
//   90       -> código interno adicional (en Trazamed, un número de serie)
//
// Según cómo esté configurado el lector, estos datos pueden venir en
// distintos "formatos de texto". Contemplamos tres variantes, de la más
// a la menos confiable:
//   1) Formato estándar con paréntesis reales: "(01)valor(17)valor..."
//   2) Una variante con separadores: ")NN=valor)NN=valor..."
//   3) Todo pegado, sin ningún separador visible: "...17260630..."
// Si el texto escaneado no tiene ninguna de estas estructuras (por
// ejemplo, un código de barras común de 13 dígitos), se lo devuelve tal
// cual, sin tocar nada.
export function parsearEscaneo(texto) {
  const resultado = { codigoBarras: texto, lote: null, fechaVencimiento: null, esGS1: false };
  const ais = {};

  // Caso 1: formato estándar GS1, con paréntesis reales delimitando cada
  // AI: "(02)07792366314459(17)290607(10)20240607". Es el más confiable,
  // porque el paréntesis marca sin ambigüedad dónde termina cada valor.
  const paresConParentesis = [...texto.matchAll(/\((\d{2,4})\)([^(]*)/g)];

  // Caso 2: variante con separadores tipo ")NN=valor)NN=valor..."
  const paresConSeparador = [...texto.matchAll(/\)?(\d{2})=([^)]*)/g)];

  if (paresConParentesis.length > 0) {
    paresConParentesis.forEach(([, ai, valor]) => { ais[ai] = valor.trim(); });
    resultado.esGS1 = true;
  } else if (paresConSeparador.length > 0) {
    paresConSeparador.forEach(([, ai, valor]) => { ais[ai] = valor; });
    resultado.esGS1 = true;
  } else if (/^(01|02)\d{14}/.test(texto)) {
    // Caso 3: cadena GS1 "cruda", sin separadores visibles entre campos.
    // El GTIN (AI 01/02) siempre mide 14 dígitos fijos, así que ese primer
    // tramo es seguro. Lo que viene después (lote + vencimiento + serie)
    // NO tiene un separador visible, así que sólo lo interpretamos cuando
    // encontramos con certeza el AI 17 (fecha), que es de largo fijo (6
    // dígitos) y nos sirve de "ancla" para no adivinar a ciegas.
    ais['01'] = texto.slice(2, 16);
    const resto = texto.slice(16);
    const coincidenciaResto = resto.match(/^10(.*?)17(\d{6})(?:90(.*))?$/);
    if (coincidenciaResto) {
      ais['10'] = coincidenciaResto[1];
      ais['17'] = coincidenciaResto[2];
      if (coincidenciaResto[3]) ais['90'] = coincidenciaResto[3];
    }
    resultado.esGS1 = true;
  } else {
    return resultado; // No es un código GS1 reconocible: se devuelve tal cual.
  }

  // El GTIN de un código GS1 mide 14 dígitos, pero el mismo producto,
  // escaneado desde su código de barras simple, tiene 13 (EAN-13). Le
  // sacamos el dígito indicador inicial para que ambos escaneos del
  // mismo producto siempre coincidan en el inventario y el catálogo.
  const gtin = ais['01'] || ais['02'] || null;
  if (gtin) {
    resultado.codigoBarras = (gtin.length === 14 && gtin.startsWith('0')) ? gtin.slice(1) : gtin;
  }

  if (ais['10']) resultado.lote = ais['10'];

  if (ais['17'] && /^\d{6}$/.test(ais['17'])) {
    resultado.fechaVencimiento = convertirFechaGS1(ais['17']);
  }

  return resultado;
}

// Convierte una fecha GS1 en formato AAMMDD a una fecha ISO (AAAA-MM-DD).
// GS1 usa "00" en el día cuando el vencimiento sólo se define por mes: en
// ese caso, tomamos el último día de ese mes (así es como se interpreta
// habitualmente un vencimiento "válido hasta fin de mes").
function convertirFechaGS1(aammdd) {
  const anio = 2000 + Number(aammdd.slice(0, 2));
  const mes = Number(aammdd.slice(2, 4));
  let dia = Number(aammdd.slice(4, 6));
  if (dia === 0) {
    dia = new Date(anio, mes, 0).getDate(); // día 0 del mes siguiente = último día de este mes
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${anio}-${pad(mes)}-${pad(dia)}`;
}

// Cuando el mismo código de barras tiene varios lotes en stock, elegimos
// automáticamente de cuál descontar aplicando la regla estándar de
// farmacia "FEFO" (First Expired, First Out: primero vence, primero
// sale): se prioriza el lote activo, con stock disponible, cuyo
// vencimiento sea el más próximo. Si ninguno tiene fecha de vencimiento
// cargada, se usa el primero con stock disponible.
function elegirLoteParaRetiro(lotes) {
  const disponibles = lotes.filter((m) => m.estado !== 'dado_de_baja' && Number(m.stock_actual) > 0);
  const candidatos = disponibles.length > 0 ? disponibles : lotes;

  return [...candidatos].sort((a, b) => {
    if (!a.fecha_vencimiento && !b.fecha_vencimiento) return 0;
    if (!a.fecha_vencimiento) return 1;
    if (!b.fecha_vencimiento) return -1;
    return a.fecha_vencimiento.localeCompare(b.fecha_vencimiento);
  })[0];
}

function buscarPorCodigoBarras(textoEscaneado) {
  const mensajeEl = document.getElementById('scanner-mensaje');
  const analisis = parsearEscaneo(textoEscaneado);
  const codigo = analisis.codigoBarras;

  // Como un mismo código de barras identifica un PRODUCTO, puede haber
  // varios lotes en stock con ese mismo código (distinto lote/vencimiento
  // cada uno). Por eso buscamos TODAS las coincidencias, no solo la
  // primera.
  const coincidencias = estado.medicamentos.filter((m) => m.codigo_barras === codigo);

  if (coincidencias.length > 0) {
    const nombreProducto = coincidencias[0].nombre_generico;

    // Nos aseguramos de estar parados en la vista de inventario, dejamos
    // el grupo de este producto desplegado, y filtramos/resaltamos TODAS
    // las filas encontradas (para que quede visible de qué lote se va a
    // descontar el retiro que se abre a continuación).
    if (coincidencias.length > 1) estado.gruposExpandidos.add(codigo);
    cambiarVista('vista-inventario');
    document.getElementById('buscador-inventario').value = nombreProducto;
    renderizarTablaMedicamentos();

    coincidencias.forEach((m) => {
      const fila = document.querySelector(`#cuerpo-tabla-medicamentos tr[data-id="${m.id}"]`);
      if (fila) {
        fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
        fila.classList.add('fila-destacada');
        setTimeout(() => fila.classList.remove('fila-destacada'), 2500);
      }
    });

    // El producto ya existe en el inventario: escanear no sirve para darlo
    // de alta de nuevo, sino para registrar un movimiento de stock. El
    // caso más común es un retiro (se usó/entregó una unidad), así que el
    // modal arranca ahí, pero el toggle de Ingreso/Retiro dentro del modal
    // permite cambiarlo con un clic si en realidad llegó mercadería nueva.
    const loteElegido = elegirLoteParaRetiro(coincidencias);
    mensajeEl.textContent = coincidencias.length === 1
      ? `✔ Encontrado: ${nombreProducto} (1 lote en stock). Se abrió el movimiento de stock.`
      : `✔ Encontrado: ${nombreProducto} (${coincidencias.length} lotes en stock). Se abrió el movimiento sobre el lote "${loteElegido.lote || 's/n'}" (el de vencimiento más próximo).`;
    mensajeEl.className = 'scanner-mensaje ok';

    abrirModalMovimiento(loteElegido, 'retiro');
  } else {
    mensajeEl.textContent = analisis.esGS1
      ? `✘ No hay stock con el código "${codigo}". Se abrió el formulario con los datos leídos del código 2D.`
      : `✘ No hay stock con el código "${codigo}". Se abrió el formulario para cargar un lote nuevo.`;
    mensajeEl.className = 'scanner-mensaje error';
    abrirModalMedicamento(null, codigo, analisis);
  }
}
