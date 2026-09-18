// =========================================================================
// USUARIOS (solo para administradores): aprobar/rechazar cuentas nuevas y
// asignar el rol de administrador.
// =========================================================================
import { supabaseClient } from './supabase-client.js';
import { estado } from './estado.js';
import { escapeHtml, mostrarToast } from './utils.js';
import { actualizarBadgesSidebar } from './shell.js';

// usuarios.html redirige a quien no sea admin antes de llamar a esto (ver
// main-usuarios.js), pero igual chequeamos acá por las dudas — la
// política RLS de "profiles" tampoco dejaría ver perfiles ajenos si no
// lo fuera (ver migración de gestión de usuarios).
export async function cargarUsuarios() {
  if (!estado.perfil || estado.perfil.rol !== 'admin') return;

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, nombre, email, rol, estado_cuenta')
    .order('nombre');

  if (error) {
    console.error('Error cargando usuarios:', error);
    return;
  }

  renderizarTablaUsuarios(data);
}

function chipEstadoCuenta(estadoCuenta) {
  const textos = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado' };
  return `<span class="chip chip-${estadoCuenta}">${textos[estadoCuenta] || estadoCuenta}</span>`;
}

// Arma la tabla de usuarios. No dejamos que un admin se
// apruebe/rechace/desadministre a sí mismo desde acá (fila sin botones)
// para que no se pueda quedar sin ningún admin por accidente.
function renderizarTablaUsuarios(usuarios) {
  const cuerpo = document.getElementById('cuerpo-tabla-usuarios');
  cuerpo.innerHTML = '';

  usuarios.forEach((u) => {
    const esUnoMismo = u.id === estado.usuario.id;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(u.nombre)}${esUnoMismo ? ' <span class="subtexto">(vos)</span>' : ''}</td>
      <td>${escapeHtml(u.email || '-')}</td>
      <td>${u.rol === 'admin' ? '<span class="chip chip-pr-si">Admin</span>' : '<span class="chip chip-pr-no">Usuario</span>'}</td>
      <td>${chipEstadoCuenta(u.estado_cuenta)}</td>
      <td class="acciones-fila"></td>
    `;

    if (!esUnoMismo) {
      const acciones = tr.querySelector('.acciones-fila');

      if (u.estado_cuenta !== 'aprobado') {
        acciones.appendChild(crearBotonAccion('Aprobar', 'btn-ingreso', () => cambiarEstadoCuenta(u.id, 'aprobado')));
      }
      if (u.estado_cuenta !== 'rechazado') {
        acciones.appendChild(crearBotonAccion('Rechazar', 'btn-retiro', () => cambiarEstadoCuenta(u.id, 'rechazado')));
      }
      acciones.appendChild(crearBotonAccion(
        u.rol === 'admin' ? 'Quitar admin' : 'Hacer admin',
        'btn-secundario',
        () => cambiarRol(u.id, u.rol === 'admin' ? 'usuario' : 'admin')
      ));
    }

    cuerpo.appendChild(tr);
  });
}

function crearBotonAccion(texto, clase, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn btn-chico ${clase}`;
  btn.textContent = texto;
  btn.addEventListener('click', onClick);
  return btn;
}

async function cambiarEstadoCuenta(idUsuario, nuevoEstado) {
  const { error } = await supabaseClient.from('profiles').update({ estado_cuenta: nuevoEstado }).eq('id', idUsuario);
  if (error) {
    console.error('Error actualizando estado de cuenta:', error);
    mostrarToast('No se pudo actualizar el estado de la cuenta', 'error');
    return;
  }
  mostrarToast(nuevoEstado === 'aprobado' ? 'Usuario aprobado' : 'Usuario rechazado');
  await cargarUsuarios();
  await actualizarBadgesSidebar();
}

async function cambiarRol(idUsuario, nuevoRol) {
  const { error } = await supabaseClient.from('profiles').update({ rol: nuevoRol }).eq('id', idUsuario);
  if (error) {
    console.error('Error actualizando rol:', error);
    mostrarToast('No se pudo actualizar el rol', 'error');
    return;
  }
  mostrarToast(nuevoRol === 'admin' ? 'Ahora es administrador' : 'Ya no es administrador');
  await cargarUsuarios();
}
