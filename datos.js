// =========================================================================
// CARGA DE DATOS
// =========================================================================
// Cada página trae solo lo que necesita para lo suyo (ver las funciones
// cargarInventario/cargarHistorial/cargarAlertas al final), en vez de
// traer las 3 tablas siempre como hacía la versión de una sola página.
import { supabaseClient } from './supabase-client.js';
import { estado } from './estado.js';
import { mostrarToast } from './utils.js';
import { renderizarTablaMedicamentos, renderizarStatsInventario } from './inventario.js';
import { renderizarAlertas } from './alertas.js';
import { renderizarTablaMovimientos } from './historial.js';

export async function cargarPerfiles() {
  const { data, error } = await supabaseClient.from('profiles').select('id, nombre');
  if (error) {
    console.error('Error cargando perfiles:', error);
    return;
  }
  estado.perfiles = {};
  data.forEach((p) => { estado.perfiles[p.id] = p.nombre; });
}

export async function cargarMedicamentos() {
  const { data, error } = await supabaseClient
    .from('medicamentos')
    .select('*')
    .order('nombre_generico', { ascending: true });

  if (error) {
    console.error('Error cargando medicamentos:', error);
    mostrarToast('Error al cargar el inventario', 'error');
    return;
  }
  estado.medicamentos = data;
}

export async function cargarMovimientos() {
  // Traemos el nombre del medicamento "embebido" gracias a la relación
  // (foreign key) entre movimientos.medicamento_id y medicamentos.id.
  const { data, error } = await supabaseClient
    .from('movimientos')
    .select('*, medicamentos(nombre_generico, nombre_comercial)')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error cargando movimientos:', error);
    return;
  }
  estado.movimientos = data;
}

// --- Orquestación por página ---

// inventario.html: necesita medicamentos (la tabla en sí), perfiles y
// movimientos (para el modal "historial de este medicamento" que se abre
// desde cada fila).
export async function cargarInventario() {
  await Promise.all([cargarPerfiles(), cargarMedicamentos(), cargarMovimientos()]);
  renderizarTablaMedicamentos();
  renderizarStatsInventario();
}

// historial.html: la tabla general de auditoría.
export async function cargarHistorial() {
  await Promise.all([cargarPerfiles(), cargarMovimientos()]);
  renderizarTablaMovimientos();
}

// alertas.html: solo necesita medicamentos.
export async function cargarAlertas() {
  await cargarMedicamentos();
  renderizarAlertas();
}
