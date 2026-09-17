// =========================================================================
// simular-escaneo.js
// =========================================================================
// Script de testeo por línea de comandos: reproduce, hablando directo con
// la API de Supabase (la misma que usa app.js en el navegador), lo que
// hace la app cuando se escanea un código con la pistola. Sirve para
// probar el flujo completo (login, búsqueda por código de barras, lógica
// FEFO de elección de lote, retiro de stock) sin necesitar el lector
// físico ni abrir el navegador.
//
// Uso:
//   npm install
//   npm run escaneo -- 7793001234561
//   npm run escaneo -- 7793001234561 --retirar 2
//
// Credenciales: se leen de un archivo .env (nunca se suben a git) con:
//   TEST_EMAIL=...
//   TEST_PASSWORD=...
// =========================================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// --- Leemos SUPABASE_URL y SUPABASE_ANON_KEY del config.js del proyecto,
// para no duplicar esos valores a mano en dos lugares distintos. ---
function leerConfigFrontend() {
  const contenido = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
  const url = contenido.match(/SUPABASE_URL\s*=\s*"([^"]+)"/);
  const key = contenido.match(/SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/);
  if (!url || !key) {
    throw new Error('No se pudo leer SUPABASE_URL / SUPABASE_ANON_KEY desde config.js');
  }
  return { url: url[1], key: key[1] };
}

// -------------------------------------------------------------------------
// Mismo parser GS1/Trazamed que usa app.js (copiado tal cual, es lógica
// pura sin nada del navegador, así que se puede reutilizar acá sin
// arrastrar el resto de app.js, que sí depende del DOM).
// -------------------------------------------------------------------------
function parsearEscaneo(texto) {
  const resultado = { codigoBarras: texto, lote: null, fechaVencimiento: null, esGS1: false };
  const ais = {};

  const paresConParentesis = [...texto.matchAll(/\((\d{2,4})\)([^(]*)/g)];
  const paresConSeparador = [...texto.matchAll(/\)?(\d{2})=([^)]*)/g)];

  if (paresConParentesis.length > 0) {
    paresConParentesis.forEach(([, ai, valor]) => { ais[ai] = valor.trim(); });
    resultado.esGS1 = true;
  } else if (paresConSeparador.length > 0) {
    paresConSeparador.forEach(([, ai, valor]) => { ais[ai] = valor; });
    resultado.esGS1 = true;
  } else if (/^(01|02)\d{14}/.test(texto)) {
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
    return resultado;
  }

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

function convertirFechaGS1(aammdd) {
  const anio = 2000 + Number(aammdd.slice(0, 2));
  const mes = Number(aammdd.slice(2, 4));
  let dia = Number(aammdd.slice(4, 6));
  if (dia === 0) {
    dia = new Date(anio, mes, 0).getDate();
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${anio}-${pad(mes)}-${pad(dia)}`;
}

// Misma regla FEFO que usa app.js para elegir de qué lote descontar
// cuando hay varios con el mismo código de barras.
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

async function main() {
  const [codigoCrudo, flagRetirar, valorRetirar] = process.argv.slice(2);

  if (!codigoCrudo) {
    console.error('Uso: npm run escaneo -- <codigo> [--retirar <cantidad>]');
    process.exit(1);
  }

  const cantidadRetiro = flagRetirar === '--retirar' ? Number(valorRetirar) : null;
  if (flagRetirar === '--retirar' && (!cantidadRetiro || cantidadRetiro <= 0)) {
    console.error('La cantidad para --retirar tiene que ser un número mayor a 0.');
    process.exit(1);
  }

  const { TEST_EMAIL, TEST_PASSWORD } = process.env;
  if (!TEST_EMAIL || !TEST_PASSWORD) {
    console.error('Faltan TEST_EMAIL / TEST_PASSWORD en el archivo .env');
    process.exit(1);
  }

  const { url, key } = leerConfigFrontend();
  const supabase = createClient(url, key);

  console.log(`→ Iniciando sesión como ${TEST_EMAIL}...`);
  const { data: sesion, error: errorLogin } = await supabase.auth.signInWithPassword({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  if (errorLogin) {
    console.error('✘ No se pudo iniciar sesión:', errorLogin.message);
    process.exit(1);
  }
  console.log(`✔ Sesión iniciada (usuario_id: ${sesion.user.id})`);

  const analisis = parsearEscaneo(codigoCrudo);
  console.log('\n--- Análisis del código escaneado ---');
  console.log(analisis);

  const { data: coincidencias, error: errorBusqueda } = await supabase
    .from('medicamentos')
    .select('*')
    .eq('codigo_barras', analisis.codigoBarras);

  if (errorBusqueda) {
    console.error('✘ Error consultando medicamentos:', errorBusqueda.message);
    process.exit(1);
  }

  if (!coincidencias || coincidencias.length === 0) {
    console.log(`\n✘ No hay stock con el código "${analisis.codigoBarras}".`);
    console.log('  La app abriría el formulario de "Agregar medicamento" con estos datos precargados:');
    console.log({
      codigo_barras: analisis.codigoBarras,
      lote: analisis.lote,
      fecha_vencimiento: analisis.fechaVencimiento,
    });
    return;
  }

  console.log(`\n✔ Encontrado: ${coincidencias[0].nombre_generico} (${coincidencias.length} lote(s) en stock)`);
  const loteElegido = elegirLoteParaRetiro(coincidencias);
  console.log('  La app abriría el RETIRO de stock sobre este lote (elegido por FEFO):');
  console.log({
    id: loteElegido.id,
    lote: loteElegido.lote,
    stock_actual: loteElegido.stock_actual,
    fecha_vencimiento: loteElegido.fecha_vencimiento,
  });

  if (cantidadRetiro === null) {
    console.log('\n(Tip: agregá "--retirar <cantidad>" para ejecutar el retiro de verdad contra la base.)');
    return;
  }

  if (cantidadRetiro > Number(loteElegido.stock_actual)) {
    console.error(`✘ No hay stock suficiente para retirar ${cantidadRetiro} (stock actual: ${loteElegido.stock_actual}).`);
    process.exit(1);
  }

  const nuevoStock = Number(loteElegido.stock_actual) - cantidadRetiro;

  console.log(`\n→ Ejecutando retiro real de ${cantidadRetiro} unidades...`);
  const { error: errorUpdate } = await supabase
    .from('medicamentos')
    .update({ stock_actual: nuevoStock })
    .eq('id', loteElegido.id);
  if (errorUpdate) {
    console.error('✘ Error actualizando stock:', errorUpdate.message);
    process.exit(1);
  }

  const { error: errorMovimiento } = await supabase.from('movimientos').insert({
    medicamento_id: loteElegido.id,
    usuario_id: sesion.user.id,
    tipo: 'retiro',
    cantidad: cantidadRetiro,
    stock_resultante: nuevoStock,
    observaciones: 'Retiro de prueba vía script (simular-escaneo.js)',
  });
  if (errorMovimiento) {
    console.error('✘ Error registrando el movimiento de auditoría:', errorMovimiento.message);
    process.exit(1);
  }

  console.log(`✔ Retiro registrado. Stock nuevo: ${nuevoStock}`);
}

main().finally(() => process.exit());
