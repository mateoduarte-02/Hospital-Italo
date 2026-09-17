// =========================================================================
// AUTENTICACIÓN (login, logout, sesión)
// =========================================================================
import { supabaseClient } from './supabase-client.js';
import { estado } from './estado.js';
import { cargarTodo } from './datos.js';

// Al cargar la página, nos fijamos si ya existe una sesión guardada
// (Supabase la guarda sola en el navegador). Si existe, entramos directo
// a la app sin pedir login de nuevo.
export async function iniciarApp() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session) {
    await manejarSesionIniciada(session.user);
  } else {
    mostrarPantallaLogin();
  }

  // Nos suscribimos a los cambios de sesión (login / logout) para que la
  // pantalla reaccione automáticamente.
  supabaseClient.auth.onAuthStateChange((evento, session) => {
    if (evento === 'SIGNED_OUT') {
      mostrarPantallaLogin();
    }
  });
}

// Formulario de login
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  errorEl.classList.add('oculto');

  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    errorEl.textContent = 'No se pudo iniciar sesión: revisá el email y la contraseña.';
    errorEl.classList.remove('oculto');
    return;
  }

  await manejarSesionIniciada(data.user);
});

// Botón de cerrar sesión
document.getElementById('btn-logout').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
});

// Se ejecuta cada vez que confirmamos que hay un usuario logueado.
// Busca (o crea) el perfil del usuario, muestra la app y carga los datos.
async function manejarSesionIniciada(usuario) {
  estado.usuario = usuario;
  estado.perfil = await obtenerOCrearPerfil(usuario);

  document.getElementById('nombre-usuario-actual').textContent = estado.perfil.nombre;

  mostrarPantallaApp();
  await cargarTodo();
}

// Busca el perfil del usuario en la tabla "profiles". Si por algún motivo
// no existe (por ejemplo, un usuario nuevo que el admin todavía no cargó
// en la tabla), se crea automáticamente uno básico usando la parte del
// email antes de la @, para que la app nunca se quede sin un nombre para
// mostrar. Lo ideal sigue siendo cargarlo a mano como se explica en el
// README (así se puede poner el nombre real, ej. "Juan").
async function obtenerOCrearPerfil(usuario) {
  const { data: perfilExistente } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', usuario.id)
    .maybeSingle();

  if (perfilExistente) {
    return perfilExistente;
  }

  const nombrePorDefecto = usuario.email.split('@')[0];
  const { data: perfilNuevo } = await supabaseClient
    .from('profiles')
    .insert({ id: usuario.id, nombre: nombrePorDefecto, email: usuario.email })
    .select()
    .single();

  return perfilNuevo || { nombre: nombrePorDefecto };
}

function mostrarPantallaLogin() {
  document.getElementById('pantalla-login').classList.remove('oculto');
  document.getElementById('pantalla-app').classList.add('oculto');
  document.getElementById('form-login').reset();
}

function mostrarPantallaApp() {
  document.getElementById('pantalla-login').classList.add('oculto');
  document.getElementById('pantalla-app').classList.remove('oculto');
}
