// =========================================================================
// AUTENTICACIÓN — solo para index.html (login, registro, pantalla de
// espera). El resto de las páginas de la app verifican la sesión con
// js/shell.js y redirigen para acá si hace falta.
// =========================================================================
import { supabaseClient } from './supabase-client.js';

// Al cargar la página, nos fijamos si ya existe una sesión guardada
// (Supabase la guarda sola en el navegador). Si existe y está aprobada,
// vamos directo al inventario, sin pedir login de nuevo.
export async function iniciarApp() {
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session) {
    await manejarSesionIniciada(session.user);
  } else {
    mostrarPantallaLogin();
  }

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

// --- Alternar entre "Iniciar sesión" y "Crear cuenta" ---
document.getElementById('btn-ir-a-registro').addEventListener('click', () => {
  document.getElementById('form-login').classList.add('oculto');
  document.getElementById('ir-a-registro-wrap').classList.add('oculto');
  document.getElementById('form-registro').classList.remove('oculto');
  document.getElementById('volver-a-login-wrap').classList.remove('oculto');
});
document.getElementById('btn-ir-a-login').addEventListener('click', () => {
  document.getElementById('form-registro').classList.add('oculto');
  document.getElementById('volver-a-login-wrap').classList.add('oculto');
  document.getElementById('form-login').classList.remove('oculto');
  document.getElementById('ir-a-registro-wrap').classList.remove('oculto');
});

// Se usa para que el perfil que se crea justo después de un registro use
// el nombre que la persona eligió, en vez del que se deriva del email
// (ver obtenerOCrearPerfil). Se limpia apenas se usa una vez.
let nombrePendienteRegistro = null;

// Formulario de alta de cuenta nueva. Crea el login en Supabase Auth,
// pero NO deja usar la app todavía: el perfil se crea con
// estado_cuenta = 'pendiente' (columna con ese default en la base) hasta
// que un administrador la apruebe desde la vista "Usuarios".
document.getElementById('form-registro').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = document.getElementById('registro-nombre').value.trim();
  const email = document.getElementById('registro-email').value.trim();
  const password = document.getElementById('registro-password').value;
  const errorEl = document.getElementById('registro-error');
  const exitoEl = document.getElementById('registro-exito');
  errorEl.classList.add('oculto');
  exitoEl.classList.add('oculto');

  const { data, error } = await supabaseClient.auth.signUp({ email, password });

  if (error) {
    errorEl.textContent = error.message.toLowerCase().includes('already registered')
      ? 'Ese email ya tiene una cuenta creada.'
      : 'No se pudo crear la cuenta. Revisá los datos e intentá de nuevo.';
    errorEl.classList.remove('oculto');
    return;
  }

  nombrePendienteRegistro = nombre;

  if (data.session) {
    // El proyecto tiene la confirmación por email desactivada: ya queda
    // una sesión activa. Entramos directo (va a mostrar la pantalla de
    // "pendiente de aprobación", no la app).
    await manejarSesionIniciada(data.user);
  } else {
    // El proyecto pide confirmar el email antes de poder iniciar sesión.
    exitoEl.textContent = 'Cuenta creada. Revisá tu email para confirmarla y después iniciá sesión (va a quedar pendiente de aprobación de un administrador).';
    exitoEl.classList.remove('oculto');
    document.getElementById('form-registro').reset();
  }
});

// Botón de cerrar sesión desde la pantalla de "pendiente"
document.getElementById('btn-logout-pendiente').addEventListener('click', async () => {
  await supabaseClient.auth.signOut();
});

// Se ejecuta cada vez que confirmamos que hay un usuario logueado (login
// normal, registro con sesión inmediata, o sesión ya guardada al abrir la
// página). Busca (o crea) el perfil y, según si está aprobado o no, va al
// inventario o muestra la pantalla de espera.
async function manejarSesionIniciada(usuario) {
  const perfil = await obtenerOCrearPerfil(usuario);

  if (perfil.estado_cuenta !== 'aprobado') {
    mostrarPantallaPendiente(perfil.estado_cuenta);
    return;
  }

  window.location.href = 'inventario.html';
}

// Busca el perfil del usuario en la tabla "profiles". Si por algún motivo
// no existe (usuario recién registrado, o uno viejo que el admin todavía
// no cargó a mano), se crea automáticamente. Toda cuenta nueva arranca
// con rol 'usuario' y estado_cuenta 'pendiente' (son los valores por
// default de esas columnas en la base), así que hace falta que un admin
// la apruebe antes de poder usar el sistema.
async function obtenerOCrearPerfil(usuario) {
  const { data: perfilExistente } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', usuario.id)
    .maybeSingle();

  if (perfilExistente) {
    return perfilExistente;
  }

  const nombrePorDefecto = nombrePendienteRegistro || usuario.email.split('@')[0];
  nombrePendienteRegistro = null;

  const { data: perfilNuevo } = await supabaseClient
    .from('profiles')
    .insert({ id: usuario.id, nombre: nombrePorDefecto, email: usuario.email })
    .select()
    .single();

  return perfilNuevo || { nombre: nombrePorDefecto, rol: 'usuario', estado_cuenta: 'pendiente' };
}

function mostrarPantallaLogin() {
  document.getElementById('pantalla-login').classList.remove('oculto');
  document.getElementById('pantalla-pendiente').classList.add('oculto');
  document.getElementById('form-login').reset();
  document.getElementById('form-registro').reset();
  document.getElementById('btn-ir-a-login').click();
}

// Cuenta logueada pero todavía no habilitada (o rechazada): no muestra la
// app, solo un mensaje y el botón para cerrar sesión.
function mostrarPantallaPendiente(estadoCuenta) {
  document.getElementById('pantalla-login').classList.add('oculto');
  document.getElementById('pantalla-pendiente').classList.remove('oculto');

  const icono = document.getElementById('pendiente-icono');
  const titulo = document.getElementById('pendiente-titulo');
  const texto = document.getElementById('pendiente-texto');

  if (estadoCuenta === 'rechazado') {
    icono.textContent = '🚫';
    titulo.textContent = 'Cuenta rechazada';
    texto.textContent = 'Un administrador rechazó el acceso de esta cuenta. Si pensás que es un error, hablalo con quien administra el sistema.';
  } else {
    icono.textContent = '⏳';
    titulo.textContent = 'Cuenta pendiente de aprobación';
    texto.textContent = 'Tu cuenta ya se creó, pero todavía no fue habilitada por un administrador. Pedile a alguien con acceso de administrador que te apruebe desde "Usuarios", y volvé a entrar.';
  }
}
