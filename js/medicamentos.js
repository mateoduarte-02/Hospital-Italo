// =========================================================================
// ALTA Y EDICIÓN DE MEDICAMENTOS
// =========================================================================
import { supabaseClient } from './supabase-client.js';
import { estado } from './estado.js';
import { abrirModal, cerrarModal, mostrarToast, fechaDeHoyISO } from './utils.js';
import { cargarInventario } from './datos.js';
import { registrarMovimiento } from './movimientos.js';
import { actualizarBadgesSidebar } from './shell.js';
import { parsearEscaneo, MENSAJE_QR_LINK } from './scanner.js';
import { escanearConCamara } from './camara.js';

// Este módulo se importa (indirectamente, vía datos.js -> inventario.js)
// desde todas las páginas de la app, aunque solo se usa de verdad en
// inventario.html — por eso los guards: en cualquier otra página, este
// botón y este formulario no existen en el DOM.
document.getElementById('btn-abrir-alta')?.addEventListener('click', () => abrirModalMedicamento(null));

// Si se escanea DIRECTO en el campo "Código de barras" del formulario (en
// vez del campo de escaneo de arriba), el lector escribe el código 2D
// completo, ej. ")01=07798369790702)10=05271)17=280731)90=RAHEA001".
// Ese texto incluye el número de serie, que es distinto en CADA caja: si
// se guardara así, cada caja quedaría como un producto distinto y después
// el escáner nunca lo encontraría. Por eso acá también lo interpretamos:
// dejamos sólo el código del producto y completamos lote y vencimiento.
const inputCodigoFormulario = document.getElementById('med-codigo-barras');
inputCodigoFormulario?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault(); // el lector manda un Enter al final: que no envíe el formulario
  normalizarCodigoDelFormulario({ vaciarSiEsLink: true });
});
inputCodigoFormulario?.addEventListener('change', () => normalizarCodigoDelFormulario());

// Botón de cámara al lado del campo (se ve en el celular): lee el código,
// lo interpreta igual que el lector USB y, si es un producto nuevo que ya
// está en el catálogo, completa sus datos.
document.getElementById('btn-camara-formulario')?.addEventListener('click', async () => {
  const texto = await escanearConCamara();
  if (!texto) return;
  const campo = document.getElementById('med-codigo-barras');
  campo.value = texto;
  document.getElementById('medicamento-error').classList.add('oculto');
  if (normalizarCodigoDelFormulario({ vaciarSiEsLink: true })) return;

  const esAlta = !document.getElementById('med-id').value;
  const sinNombre = !document.getElementById('med-nombre-generico').value.trim();
  if (esAlta && sinNombre && campo.value && await completarDesdeCatalogo(campo.value)) {
    mostrarToast('Producto encontrado en el catálogo: datos completados. Revisalos antes de guardar.');
  }
});

// Devuelve true si el campo tiene un QR-link (y entonces no hay que guardar).
// Sólo se vacía el campo cuando el link entró por el lector (Enter), así
// el próximo escaneo no se pega al final del link; si se vaciara también
// al tocar "Guardar", se terminaría guardando el medicamento sin código.
function normalizarCodigoDelFormulario({ vaciarSiEsLink = false } = {}) {
  const campo = document.getElementById('med-codigo-barras');
  const analisis = parsearEscaneo(campo.value.trim());

  // QR del laboratorio (un link): no sirve como código, se borra y se avisa.
  if (analisis.esURL) {
    if (vaciarSiEsLink) campo.value = '';
    const errorEl = document.getElementById('medicamento-error');
    errorEl.textContent = MENSAJE_QR_LINK;
    errorEl.classList.remove('oculto');
    return true;
  }

  if (!analisis.esGS1) return false;

  campo.value = analisis.codigoBarras;
  const campoLote = document.getElementById('med-lote');
  const campoVencimiento = document.getElementById('med-fecha-vencimiento');
  if (analisis.lote && !campoLote.value) campoLote.value = analisis.lote;
  if (analisis.fechaVencimiento && !campoVencimiento.value) campoVencimiento.value = analisis.fechaVencimiento;
  mostrarToast('Código 2D leído: se completaron código, lote y vencimiento. Revisalos antes de guardar.');
  return false;
}

// Abre el modal de medicamento. Si se pasa un medicamento existente, lo
// abre en modo "edición" con los campos ya completados; si se pasa null,
// lo abre vacío en modo "alta" (y si venimos de un escaneo, con el código
// ya cargado y, si existe en el catálogo, el resto de los datos del
// producto autocompletados). "datosGS1" son los datos ya extraídos de un
// código 2D de trazabilidad (lote y vencimiento), si el escaneo los traía.
export async function abrirModalMedicamento(medicamento, codigoPrecargado, datosGS1) {
  const form = document.getElementById('form-medicamento');
  form.reset();
  document.getElementById('medicamento-error').classList.add('oculto');
  advertenciaYaMostrada = null;

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
  document.getElementById('med-fecha-ingreso').value = medicamento ? (medicamento.fecha_ingreso || '') : fechaDeHoyISO();
  document.getElementById('med-fecha-vencimiento').value = medicamento ? (medicamento.fecha_vencimiento || '') : '';
  document.getElementById('med-condicion').value = medicamento ? medicamento.condicion_almacenamiento : 'ambiente';
  document.getElementById('med-ubicacion').value = medicamento ? (medicamento.ubicacion || '') : '';
  document.getElementById('med-proveedor').value = medicamento ? (medicamento.proveedor || '') : '';
  document.getElementById('med-estado').value = medicamento ? medicamento.estado : 'activo';

  // --- Autocompletado desde un código 2D de trazabilidad (Trazamed) ---
  // Si el código escaneado traía lote y/o vencimiento codificados, los
  // completamos ya mismo. SIEMPRE quedan en un campo editable común: la
  // idea es ahorrar la carga manual, no reemplazar la revisión humana de
  // un dato tan importante como el vencimiento.
  let avisoLoteVencimiento = false;
  if (!medicamento && datosGS1) {
    if (datosGS1.lote) {
      document.getElementById('med-lote').value = datosGS1.lote;
      avisoLoteVencimiento = true;
    }
    if (datosGS1.fechaVencimiento) {
      document.getElementById('med-fecha-vencimiento').value = datosGS1.fechaVencimiento;
      avisoLoteVencimiento = true;
    }
  }

  abrirModal('modal-medicamento');

  // --- Autocompletado por catálogo ---
  // Si estamos dando de alta un lote nuevo a partir de un código
  // escaneado, buscamos si ya conocemos ese producto (porque alguna vez
  // se cargó antes) y, de ser así, autocompletamos sus datos fijos.
  // El stock queda en blanco a propósito: es propio de CADA lote/caja,
  // no del producto en general.
  let avisoCatalogo = false;
  if (!medicamento && codigoPrecargado) {
    avisoCatalogo = await completarDesdeCatalogo(codigoPrecargado);
  }

  // Un solo mensaje, resumiendo qué se autocompletó y pidiendo revisarlo
  // antes de guardar (especialmente el vencimiento y el lote).
  if (avisoCatalogo && avisoLoteVencimiento) {
    mostrarToast('Datos del producto, lote y vencimiento autocompletados. Revisalos antes de guardar.');
  } else if (avisoCatalogo) {
    mostrarToast('Datos del producto autocompletados. Revisá lote, vencimiento y cantidad.');
  } else if (avisoLoteVencimiento) {
    mostrarToast('Lote y vencimiento leídos del código 2D. Revisalos antes de guardar.');
  }
}

// Busca el producto en el catálogo por su código y, si existe, completa
// sus datos fijos (nombre, categoría, unidad...). Devuelve true si lo
// encontró.
async function completarDesdeCatalogo(codigo) {
  const { data: catalogado } = await supabaseClient
    .from('catalogo_medicamentos')
    .select('*')
    .eq('codigo_barras', codigo)
    .maybeSingle();
  if (!catalogado) return false;

  document.getElementById('med-nombre-generico').value = catalogado.nombre_generico || '';
  document.getElementById('med-nombre-comercial').value = catalogado.nombre_comercial || '';
  document.getElementById('med-categoria').value = catalogado.categoria || '';
  document.getElementById('med-unidad').value = catalogado.unidad || '';
  document.getElementById('med-condicion').value = catalogado.condicion_almacenamiento || 'ambiente';
  document.getElementById('med-proveedor').value = catalogado.proveedor || '';
  return true;
}

// Evita el error más común al cargar medicamentos "a mano": que un mismo
// producto (ej. "Polivitaminico") termine repartido en dos registros
// distintos con nombres o códigos de barras que no coinciden entre sí.
// El código de barras es lo que identifica al PRODUCTO para agrupar sus
// lotes (ver inventario.js), así que:
//   - si el código de barras ya está usado por otro nombre, es un
//     conflicto (¿es el mismo producto con el nombre mal tipeado, o un
//     código repetido por error?).
//   - si el nombre genérico ya existe pero con otro código de barras,
//     NO se bloquea: es normal tener la misma droga en distintas marcas
//     o presentaciones (ej. amoxicilina de distintos laboratorios, que
//     llegan por donaciones), y cada una tiene su propio código. Sólo se
//     muestra una ADVERTENCIA la primera vez, por si en realidad es el
//     mismo producto cargado de nuevo sin usar su código; tocando
//     "Guardar" otra vez se confirma y se guarda igual.
// El primer caso sí bloquea el guardado con un mensaje explicando qué
// registro ya existe, en vez de dejar crear el duplicado silenciosamente.
// Esto es una validación de la app, no un constraint de la base de datos:
// no reemplaza agregar una restricción real en schema.sql si se quiere
// una garantía más fuerte.
// Guarda la advertencia que ya se le mostró al usuario para estos mismos
// datos, así el segundo clic en "Guardar" cuenta como confirmación.
let advertenciaYaMostrada = null;

function buscarConflictoDeProducto(datos, idActual) {
  const nombreNuevo = datos.nombre_generico.trim().toLowerCase();
  const otros = estado.medicamentos.filter((m) => m.id !== idActual);

  if (datos.codigo_barras) {
    const mismoCodigo = otros.find((m) => m.codigo_barras === datos.codigo_barras);
    if (mismoCodigo && mismoCodigo.nombre_generico.trim().toLowerCase() !== nombreNuevo) {
      return `Ese código de barras ya está cargado como "${mismoCodigo.nombre_generico}". Usá exactamente ese mismo nombre para que los lotes se agrupen bien (o cambiá el código si en realidad es un producto distinto).`;
    }
  }

  const mismoNombreOtroCodigo = otros.find((m) =>
    m.nombre_generico.trim().toLowerCase() === nombreNuevo &&
    (m.codigo_barras || null) !== (datos.codigo_barras || null)
  );
  if (mismoNombreOtroCodigo) {
    const clave = `${nombreNuevo}|${datos.codigo_barras || ''}|${(datos.nombre_comercial || '').toLowerCase()}`;
    if (advertenciaYaMostrada === clave) return null; // segundo clic: confirmado
    advertenciaYaMostrada = clave;
    const marcaExistente = mismoNombreOtroCodigo.nombre_comercial ? ` (${mismoNombreOtroCodigo.nombre_comercial})` : '';
    return `Atención: ya existe "${mismoNombreOtroCodigo.nombre_generico}"${marcaExistente} con el código "${mismoNombreOtroCodigo.codigo_barras || 'sin código'}". Si es otra marca o presentación, completá el nombre comercial y tocá "Guardar" de nuevo para confirmar. Si es el mismo producto, usá ese mismo código para que quede como un lote más.`;
  }

  return null;
}

document.getElementById('form-medicamento')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('medicamento-error');
  errorEl.classList.add('oculto');

  // Por las dudas, si quedó un código 2D completo en el campo, se
  // interpreta antes de guardar (ver normalizarCodigoDelFormulario).
  if (normalizarCodigoDelFormulario()) return; // era un QR-link: no se guarda

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

  // Un lote en 0 no sirve de nada mantenerlo "activo": se marca "dado de
  // baja" automáticamente (no se borra — el historial de auditoría queda
  // intacto), igual que hace un retiro que deja el stock en 0 (ver
  // movimientos.js). Así queda oculto de la tabla por defecto.
  if (datos.stock_actual === 0) {
    datos.estado = 'dado_de_baja';
  }

  const conflicto = buscarConflictoDeProducto(datos, id || null);
  if (conflicto) {
    errorEl.textContent = conflicto;
    errorEl.classList.remove('oculto');
    return;
  }

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
    await actualizarCatalogo(datos);
    await cargarInventario();
    await actualizarBadgesSidebar();
  } catch (err) {
    console.error(err);
    errorEl.textContent = 'Ocurrió un error al guardar. Revisá los datos e intentá de nuevo.';
    errorEl.classList.remove('oculto');
  }
});

// Devuelve null si el campo está vacío (útil para fechas y textos
// opcionales, para no guardar strings vacíos en la base de datos).
function valorOnull(idCampo) {
  const v = document.getElementById(idCampo).value.trim();
  return v === '' ? null : v;
}

// Guarda (o actualiza) en "catalogo_medicamentos" los datos fijos del
// producto, usando el código de barras como clave. Se llama después de
// cada alta o edición de un medicamento. Así, la próxima vez que llegue
// un lote nuevo del mismo producto y se escanee su código, la app ya
// puede autocompletar estos campos (ver abrirModalMedicamento).
// Si el medicamento no tiene código de barras cargado, no hay con qué
// identificar el producto más adelante, así que no se guarda nada.
async function actualizarCatalogo(datos) {
  if (!datos.codigo_barras) return;

  const { error } = await supabaseClient.from('catalogo_medicamentos').upsert({
    codigo_barras: datos.codigo_barras,
    nombre_generico: datos.nombre_generico,
    nombre_comercial: datos.nombre_comercial,
    categoria: datos.categoria,
    unidad: datos.unidad,
    condicion_almacenamiento: datos.condicion_almacenamiento,
    proveedor: datos.proveedor,
    actualizado_por: estado.usuario.id,
  });

  if (error) console.error('Error actualizando el catálogo de productos:', error);
}
