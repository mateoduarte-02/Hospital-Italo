// =========================================================================
// CARGA DE DATOS
// =========================================================================
import { supabaseClient } from './supabase-client.js';
import { estado } from './estado.js';
import { mostrarToast } from './utils.js';
import { renderizarTablaMedicamentos, renderizarStatsInventario } from './inventario.js';
import { renderizarAlertas } from './alertas.js';
import { renderizarTablaMovimientos } from './historial.js';
import { cargarUsuarios } from './usuarios.js';

// Trae de Supabase las tablas que necesitamos y vuelve a dibujar toda la
// pantalla. La llamamos al iniciar sesión y después de cada operación que
// modifique datos (alta, ingreso, retiro, ajuste, aprobar un usuario).
export async function cargarTodo() {
  await Promise.all([
    cargarPerfiles(),
    cargarMedicamentos(),
    cargarMovimientos(),
    cargarUsuarios(), // no hace nada si quien está logueado no es admin
  ]);

  renderizarTablaMedicamentos();
  renderizarStatsInventario();
  renderizarAlertas();
  renderizarTablaMovimientos();
}

async function cargarPerfiles() {
  const { data, error } = await supabaseClient.from('profiles').select('id, nombre');
  if (error) {
    console.error('Error cargando perfiles:', error);
    return;
  }
  estado.perfiles = {};
  data.forEach((p) => { estado.perfiles[p.id] = p.nombre; });
}

async function cargarMedicamentos() {
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

async function cargarMovimientos() {
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
