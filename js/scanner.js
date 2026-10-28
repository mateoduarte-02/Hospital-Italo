// =========================================================================
// LECTOR DE CÓDIGO DE BARRAS
// =========================================================================
// Los lectores USB tipo "pistola" se comportan como un teclado: al
// escanear una etiqueta, escriben el código a gran velocidad y al final
// mandan un Enter automáticamente. Por eso alcanza con escuchar el evento
// "keydown" de este input y reaccionar cuando la tecla es "Enter".
import { estado } from './estado.js';
import { renderizarTablaMedicamentos } from './inventario.js';
import { abrirModalMovimiento } from './movimientos.js';
import { abrirModalMedicamento } from './medicamentos.js';
import { escanearConCamara, hayCamara } from './camara.js';

// Se llama desde main-inventario.js, después de que js/shell.js terminó
// de armar el header (que es donde vive el input de escaneo) — si
// tratáramos de engancharnos antes, el elemento todavía no existiría en
// el DOM.
export function iniciarScanner() {
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
  // para que el/la usuario/a pueda escanear sin tener que hacer clic
  // antes. Si se abre un modal, dejamos de forzar el foco (para no
  // interrumpir al que esté escribiendo en un formulario).
  // En celulares y tablets NO: ahí no hay lector USB, y enfocar el campo
  // abriría el teclado en pantalla cada vez que se toca algo.
  const esPantallaTactil = window.matchMedia && window.matchMedia('(hover: none)').matches;

  document.addEventListener('click', (e) => {
    if (esPantallaTactil) return;
    const hayModalAbierto = document.querySelector('.modal-fondo:not(.oculto)');
    if (hayModalAbierto) return;
    if (e.target.closest('.check-con-ayuda, .camara-capa')) return;

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

  // Botón "Cámara" (se ve en el celular): lee el código con la cámara y
  // lo procesa exactamente igual que si viniera del lector USB.
  const botonCamara = document.getElementById('btn-camara');
  if (botonCamara) {
    if (!hayCamara()) botonCamara.classList.add('oculto');
    botonCamara.addEventListener('click', async () => {
      const texto = await escanearConCamara();
      if (texto) buscarPorCodigoBarras(texto);
    });
  }

  procesarCodigoDesdeURL();
}

// Si llegamos acá con "?codigo=..." en la URL (porque alguien escaneó
// desde otra página, ver wirearEscanerGlobal en shell.js), procesamos ese
// código como si se hubiera escaneado directamente acá, y limpiamos el
// parámetro de la URL para que no se vuelva a disparar si se recarga la
// página.
function procesarCodigoDesdeURL() {
  const params = new URLSearchParams(window.location.search);
  const codigo = params.get('codigo');
  if (!codigo) return;

  window.history.replaceState({}, '', window.location.pathname);
  buscarPorCodigoBarras(codigo);
}

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
// -------------------------------------------------------------------------
// Lector configurado con teclado en inglés (US) en una PC con teclado en
// español latinoamericano: el lector "aprieta" las teclas pensando en el
// teclado inglés, y algunos símbolos salen cambiados. Ej.: el QR
// "https://www.elea.com/qr/dacten-d" llega como
// "httpsÑ--www.elea.com-qr-dacten'd". (Por lo mismo, los códigos GS1
// "(01)...(10)..." llegan como ")01=...)10=...", ver el caso 2 de abajo.)
// Esta tabla deshace el cambio: carácter que aparece -> el que era.
const TECLADO_US_EN_LATAM = {
  'Ñ': ':', 'ñ': ';', '-': '/', '_': '?', "'": '-', '¿': '=', '?': '_',
  '/': '&', '(': '*', ')': '(', '=': ')', '&': '^', '"': '@', '¡': '+',
  '+': ']', '}': '\\', '{': "'", '[': '"',
};

function corregirTecladoUS(texto) {
  return [...texto].map((c) => TECLADO_US_EN_LATAM[c] ?? c).join('');
}

// Muchas cajas traen, además del código de barras y del código cuadrado
// de trazabilidad, un QR del laboratorio que es sólo un LINK a una página
// web (ej. https://www.elea.com/qr/dacten-d). Ese link NO identifica el
// producto de forma confiable, así que no sirve como código de barras.
// Excepción: los QR "GS1 Digital Link" (https://.../01/<GTIN>/10/<lote>...)
// sí traen el código del producto adentro, y de esos lo sacamos.
// Devuelve null si el texto no es un link.
function analizarURL(texto) {
  let url = texto.trim();
  if (/^https?Ñ/i.test(url)) url = corregirTecladoUS(url);
  if (!/^https?:\/\//i.test(url)) return null;

  const gtin = url.match(/\/0[12]\/(\d{13,14})(?=[/?#]|$)/);
  if (!gtin) return { esURL: true, url };

  const lote = url.match(/\/10\/([^/?#]+)/);
  const vencimiento = url.match(/\/17\/(\d{6})(?=[/?#]|$)/);
  return {
    esURL: false,
    ais: {
      '01': gtin[1],
      ...(lote ? { '10': decodeURIComponent(lote[1]) } : {}),
      ...(vencimiento ? { '17': vencimiento[1] } : {}),
    },
  };
}

// -------------------------------------------------------------------------
// GS1 "crudo" con separador GS (carácter invisible n.º 29)
// -------------------------------------------------------------------------
// Así llega el código cuadrado cuando se lee con la CÁMARA del celular (y
// con algunos lectores): sin paréntesis, con los campos pegados y un
// carácter separador invisible después de cada campo de largo variable
// (lote, serie). Ej.: "0107798369790702" + "1005271" + GS + "17280731" ...
// Algunos lectores agregan además un prefijo de 3 caracteres que indica
// el tipo de código ("]d2" DataMatrix, "]C1" Code128, "]Q3" QR).
const GS = String.fromCharCode(29);
const AI_LARGO_FIJO = { '00': 18, '01': 14, '02': 14, '11': 6, '12': 6, '13': 6, '15': 6, '16': 6, '17': 6, '20': 2 };

function sacarPrefijoSimbologia(texto) {
  return texto.replace(/^\][A-Za-z]\d/, '');
}

function parsearGS1ConSeparador(texto) {
  let s = sacarPrefijoSimbologia(texto);
  if (s.startsWith(GS)) s = s.slice(1);
  const ais = {};
  let i = 0;
  while (i < s.length) {
    const ai = s.slice(i, i + 2);
    if (!/^\d\d$/.test(ai)) return null;
    i += 2;
    if (AI_LARGO_FIJO[ai]) {
      ais[ai] = s.slice(i, i + AI_LARGO_FIJO[ai]);
      i += AI_LARGO_FIJO[ai];
      if (s[i] === GS) i += 1;
    } else {
      let fin = s.indexOf(GS, i);
      if (fin === -1) fin = s.length;
      ais[ai] = s.slice(i, fin);
      i = fin + 1;
    }
  }
  const gtin = ais['01'] || ais['02'];
  return gtin && /^\d{14}$/.test(gtin) ? ais : null;
}

export function parsearEscaneo(texto) {
  const resultado = { codigoBarras: texto, lote: null, fechaVencimiento: null, esGS1: false, esURL: false };
  let ais = {};

  // Caso 0: es un link (QR del laboratorio).
  // Caso 0b: GS1 crudo con separador GS (lectura con la cámara).
  if (texto.includes(GS) || /^\][A-Za-z]\d/.test(texto)) {
    const conSeparador = parsearGS1ConSeparador(texto);
    if (conSeparador) return completarResultadoGS1(resultado, conSeparador);
    texto = sacarPrefijoSimbologia(texto).split(GS).join('');
    resultado.codigoBarras = texto;
  }

  const comoURL = analizarURL(texto);
  if (comoURL && comoURL.esURL) {
    resultado.esURL = true;
    resultado.url = comoURL.url;
    return resultado;
  }

  // Caso 1: formato estándar GS1, con paréntesis reales delimitando cada
  // AI: "(02)07792366314459(17)290607(10)20240607". Es el más confiable,
  // porque el paréntesis marca sin ambigüedad dónde termina cada valor.
  const paresConParentesis = [...texto.matchAll(/\((\d{2,4})\)([^(]*)/g)];

  // Caso 2: variante con separadores tipo ")NN=valor)NN=valor..."
  const paresConSeparador = [...texto.matchAll(/\)?(\d{2})=([^)]*)/g)];

  if (comoURL) {
    // QR "GS1 Digital Link": ya trae los datos separados (ver analizarURL).
    ais = comoURL.ais;
    resultado.esGS1 = true;
  } else if (paresConParentesis.length > 0) {
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

  return completarResultadoGS1(resultado, ais);
}

// Pasa los datos GS1 ya separados (código de producto, lote, vencimiento)
// al resultado que usa el resto de la app.
function completarResultadoGS1(resultado, ais) {
  resultado.esGS1 = true;
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

export const MENSAJE_QR_LINK =
  'Ese es el código QR del laboratorio (un link a su página web) y no sirve para identificar el medicamento. ' +
  'Escaneá el código de barras (las rayitas) o el código cuadrado chiquito de trazabilidad.';

function buscarPorCodigoBarras(textoEscaneado) {
  const mensajeEl = document.getElementById('scanner-mensaje');
  const analisis = parsearEscaneo(textoEscaneado);
  const codigo = analisis.codigoBarras;

  if (analisis.esURL) {
    mensajeEl.textContent = MENSAJE_QR_LINK;
    mensajeEl.className = 'scanner-mensaje error';
    return;
  }

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
      ? `Encontrado: ${nombreProducto} (1 lote en stock). Se abrió el movimiento de stock.`
      : `Encontrado: ${nombreProducto} (${coincidencias.length} lotes en stock). Se abrió el movimiento sobre el lote "${loteElegido.lote || 's/n'}" (el de vencimiento más próximo).`;
    mensajeEl.className = 'scanner-mensaje ok';

    abrirModalMovimiento(loteElegido, 'retiro');
  } else {
    mensajeEl.textContent = analisis.esGS1
      ? `No hay stock con el código "${codigo}". Se abrió el formulario con los datos leídos del código 2D.`
      : `No hay stock con el código "${codigo}". Se abrió el formulario para cargar un lote nuevo.`;
    mensajeEl.className = 'scanner-mensaje error';
    abrirModalMedicamento(null, codigo, analisis);
  }
}
