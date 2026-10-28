// =========================================================================
// ESCANEAR CON LA CÁMARA (pensado para el celular)
// =========================================================================
// En el celular no hay lector USB, así que se usa la cámara trasera para
// leer el código de barras (rayitas) o el código cuadrado de la caja.
//
// Cómo lee el código:
//   1) Si el navegador trae un lector propio (BarcodeDetector: Chrome en
//      Android), se usa ese, que es el más rápido.
//   2) Si no (iPhone, computadoras), se carga la librería ZXing desde
//      internet la primera vez que se toca el botón. No se carga antes
//      para no hacer más lenta la página a quien no usa la cámara.
//
// La cámara sólo funciona en páginas seguras (https), como GitHub Pages.
// El navegador le pide permiso a la persona la primera vez.
import { icono } from './iconos.js';

const URL_ZXING = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';

const FORMATOS_DETECTOR = ['ean_13', 'ean_8', 'upc_a', 'code_128', 'data_matrix', 'qr_code', 'itf'];

export function hayCamara() {
  return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

let promesaZxing = null;
function cargarZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  if (!promesaZxing) {
    promesaZxing = new Promise((resolver, rechazar) => {
      const script = document.createElement('script');
      script.src = URL_ZXING;
      script.onload = () => (window.ZXing ? resolver(window.ZXing) : rechazar(new Error('ZXing no disponible')));
      script.onerror = () => {
        promesaZxing = null; // permitir reintentar
        rechazar(new Error('No se pudo cargar el lector de códigos'));
      };
      document.head.appendChild(script);
    });
  }
  return promesaZxing;
}

async function crearDetectorNativo() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const soportados = await window.BarcodeDetector.getSupportedFormats();
    const formatos = FORMATOS_DETECTOR.filter((f) => soportados.includes(f));
    // Sin código cuadrado no nos sirve: hace falta para lote y vencimiento.
    if (!formatos.includes('data_matrix')) return null;
    return new window.BarcodeDetector({ formats: formatos });
  } catch {
    return null;
  }
}

// Abre la cámara a pantalla completa y devuelve (como promesa) el texto
// leído, o null si la persona canceló.
export function escanearConCamara() {
  return new Promise((resolver) => {
    const capa = document.createElement('div');
    capa.className = 'camara-capa';
    capa.setAttribute('role', 'dialog');
    capa.setAttribute('aria-modal', 'true');
    capa.setAttribute('aria-label', 'Escanear con la cámara');
    capa.innerHTML = `
      <video class="camara-video" playsinline muted></video>
      <div class="camara-marco" aria-hidden="true"></div>
      <div class="camara-arriba">
        <p class="camara-texto">Apuntá al código de barras o al código cuadrado de la caja</p>
      </div>
      <div class="camara-abajo">
        <p class="camara-estado" aria-live="polite">Abriendo la cámara…</p>
        <button type="button" class="btn btn-secundario camara-cancelar">${icono('cerrar', 18)} Cancelar</button>
      </div>
    `;
    document.body.appendChild(capa);
    document.body.classList.add('camara-abierta');

    const video = capa.querySelector('video');
    const estadoEl = capa.querySelector('.camara-estado');
    let terminado = false;
    let stream = null;
    let intervalo = null;

    function terminar(texto) {
      if (terminado) return;
      terminado = true;
      clearInterval(intervalo);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      capa.remove();
      document.body.classList.remove('camara-abierta');
      document.removeEventListener('keydown', alTeclado);
      if (texto && navigator.vibrate) navigator.vibrate(80);
      resolver(texto || null);
    }

    function alTeclado(e) {
      if (e.key === 'Escape') terminar(null);
    }
    document.addEventListener('keydown', alTeclado);
    capa.querySelector('.camara-cancelar').addEventListener('click', () => terminar(null));

    function mostrarError(mensaje) {
      estadoEl.textContent = mensaje;
      capa.classList.add('camara-error');
    }

    const restricciones = {
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    };

    (async () => {
      // 1) Abrimos la cámara trasera.
      try {
        stream = await navigator.mediaDevices.getUserMedia(restricciones);
      } catch (err) {
        mostrarError(mensajeDeError(err));
        return;
      }
      if (terminado) { stream.getTracks().forEach((t) => t.stop()); return; }
      video.srcObject = stream;
      await video.play().catch(() => {});

      // 2) Elegimos con qué leer: el lector del navegador si existe, si no ZXing.
      let leerCuadro;
      const detector = await crearDetectorNativo();
      if (detector) {
        leerCuadro = async () => {
          const codigos = await detector.detect(video);
          return codigos.length > 0 ? codigos[0].rawValue : null;
        };
      } else {
        let ZXing;
        try {
          estadoEl.textContent = 'Preparando el lector…';
          ZXing = await cargarZxing();
        } catch {
          mostrarError('No se pudo cargar el lector de códigos. Revisá la conexión a internet e intentá de nuevo.');
          return;
        }
        const pistas = new Map();
        pistas.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A,
          ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.DATA_MATRIX, ZXing.BarcodeFormat.QR_CODE,
          ZXing.BarcodeFormat.ITF,
        ]);
        pistas.set(ZXing.DecodeHintType.TRY_HARDER, true);
        const lector = new ZXing.MultiFormatReader();
        lector.setHints(pistas);
        const lienzo = document.createElement('canvas');
        const ctx = lienzo.getContext('2d', { willReadFrequently: true });

        leerCuadro = async () => {
          // Copiamos el cuadro actual del video (achicado si es muy grande,
          // para que el celular no se trabe) y lo pasamos al lector.
          const escala = Math.min(1, 1280 / video.videoWidth);
          lienzo.width = Math.round(video.videoWidth * escala);
          lienzo.height = Math.round(video.videoHeight * escala);
          ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
          try {
            const fuente = new ZXing.HTMLCanvasElementLuminanceSource(lienzo);
            const imagen = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(fuente));
            return lector.decodeWithState(imagen).getText();
          } catch {
            return null; // en este cuadro no se encontró ningún código
          }
        };
      }
      if (terminado) return;

      // 3) Revisamos un cuadro cada 200 ms hasta encontrar un código.
      estadoEl.textContent = 'Buscando un código…';
      let ocupado = false;
      intervalo = setInterval(async () => {
        if (ocupado || terminado || video.readyState < 2 || !video.videoWidth) return;
        ocupado = true;
        try {
          const texto = await leerCuadro();
          if (texto) terminar(texto);
        } catch { /* seguimos intentando */ }
        ocupado = false;
      }, 200);
    })();
  });
}

function mensajeDeError(err) {
  const nombre = err && err.name;
  if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
    return 'El navegador no tiene permiso para usar la cámara. Habilitalo en la configuración del sitio y volvé a intentar.';
  }
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') {
    return 'No se encontró una cámara en este dispositivo.';
  }
  if (nombre === 'NotReadableError') {
    return 'La cámara está siendo usada por otra aplicación. Cerrala y volvé a intentar.';
  }
  return 'No se pudo abrir la cámara.';
}
