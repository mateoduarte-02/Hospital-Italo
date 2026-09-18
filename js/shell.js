// =========================================================================
// SHELL: menú lateral + encabezado, compartidos por todas las páginas de
// la app (no la de login). Cada página (inventario.html, historial.html,
// alertas.html, usuarios.html) solo trae SU contenido propio; este
// archivo arma alrededor la parte común, para no tener que copiar y
// pegar el sidebar/header en cada .html.
// =========================================================================
import { supabaseClient } from './supabase-client.js';
import { estado } from './estado.js';

const NAV = [
  { pagina: 'inventario', archivo: 'inventario.html', icono: '📦', texto: 'Inventario' },
  { pagina: 'historial', archivo: 'historial.html', icono: '🕓', texto: 'Historial' },
  { pagina: 'alertas', archivo: 'alertas.html', icono: '⚠️', texto: 'Alertas Stock', badgeId: 'badge-alertas' },
  { pagina: 'usuarios', archivo: 'usuarios.html', icono: '👥', texto: 'Usuarios', badgeId: 'badge-usuarios-pendientes', soloAdmin: true },
];

// Se llama al principio de cada página de la app. Verifica que haya
// sesión y que la cuenta esté aprobada (si no, redirige a index.html),
// arma el sidebar y el header a partir de <body data-pagina="..."
// data-titulo="...">, y deja el estado global (estado.usuario,
// estado.perfil) listo para que el resto de los módulos de esa página lo
// usen. Devuelve el perfil, o null si redirigió.
export async function iniciarShell() {
  const paginaActual = document.body.dataset.pagina;
  const tituloVista = document.body.dataset.titulo || '';

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }

  const { data: perfil, error } = await supabaseClient
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle();

  if (error || !perfil || perfil.estado_cuenta !== 'aprobado') {
    window.location.href = 'index.html';
    return null;
  }

  estado.usuario = session.user;
  estado.perfil = perfil;

  document.getElementById('shell-sidebar').innerHTML = `
    <div class="sidebar-marca">
      <span class="marca-icono" aria-hidden="true">💊</span>
      <span class="marca-texto">FarmaHospital</span>
    </div>
    <nav class="sidebar-nav">
      ${NAV.filter((item) => !item.soloAdmin || perfil.rol === 'admin').map((item) => `
        <a class="nav-item ${item.pagina === paginaActual ? 'activa' : ''}" href="${item.archivo}">
          <span class="nav-icono">${item.icono}</span> ${item.texto}
          ${item.badgeId ? `<span id="${item.badgeId}" class="badge oculto">0</span>` : ''}
        </a>
      `).join('')}
    </nav>
    <div class="sidebar-usuario">
      <span class="usuario-avatar" aria-hidden="true">👤</span>
      <div class="usuario-texto">
        <strong>${escapeHtmlLocal(perfil.nombre)}</strong>
        <span>Sesión activa</span>
      </div>
      <button id="btn-logout" class="btn-salir" title="Cerrar sesión">⏻</button>
    </div>
  `;

  // El buscador de escaneo solo tiene sentido en Inventario, que es la
  // única vista donde escanear hace algo (busca/da de alta un
  // medicamento y descuenta stock). En el resto, el encabezado queda
  // solo con el título.
  const mostrarEscaner = paginaActual === 'inventario';

  document.getElementById('shell-header').innerHTML = `
    <h1>${escapeHtmlLocal(tituloVista)}</h1>
    ${mostrarEscaner ? `
      <div class="scanner-pill">
        <span aria-hidden="true">🔎</span>
        <input type="text" id="input-scanner" placeholder="Escanear código de barras / QR..." autocomplete="off" />
      </div>
    ` : ''}
  `;

  document.getElementById('btn-logout').addEventListener('click', () => supabaseClient.auth.signOut());

  supabaseClient.auth.onAuthStateChange((evento) => {
    if (evento === 'SIGNED_OUT') window.location.href = 'index.html';
  });

  actualizarBadgesSidebar();
  wirearEscanerGlobal(paginaActual);

  return perfil;
}

function escapeHtmlLocal(texto) {
  const div = document.createElement('div');
  div.textContent = String(texto ?? '');
  return div.innerHTML;
}

// Los números de "Alertas" y "Usuarios pendientes" del menú tienen que
// verse en TODAS las páginas, no solo en la suya, así que el shell trae
// sus propios datos livianos para calcularlos (no depende de lo que haya
// cargado la página actual). Se exporta para poder llamarla de nuevo
// después de una acción que puede cambiar esos números (aprobar un
// usuario, editar un medicamento, hacer un movimiento de stock).
export async function actualizarBadgesSidebar() {
  const badgeAlertas = document.getElementById('badge-alertas');
  if (badgeAlertas) {
    const limite = new Date();
    limite.setDate(limite.getDate() + 15);
    const limiteIso = limite.toISOString().slice(0, 10);

    const { data: medicamentos } = await supabaseClient
      .from('medicamentos')
      .select('stock_actual, stock_minimo, fecha_vencimiento')
      .neq('estado', 'dado_de_baja');

    const total = (medicamentos || []).filter((m) =>
      Number(m.stock_actual) <= Number(m.stock_minimo) ||
      (m.fecha_vencimiento && m.fecha_vencimiento <= limiteIso)
    ).length;
    badgeAlertas.textContent = total;
    badgeAlertas.classList.toggle('oculto', total === 0);
  }

  const badgeUsuarios = document.getElementById('badge-usuarios-pendientes');
  if (badgeUsuarios) {
    const { count } = await supabaseClient
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('estado_cuenta', 'pendiente');
    badgeUsuarios.textContent = count || 0;
    badgeUsuarios.classList.toggle('oculto', !count);
  }
}

// El campo de escaneo aparece en Inventario y en Historial (un lector
// USB puede "dispararse" en cualquier momento del turno), pero no en
// Usuarios ni Alertas (ahí directamente no existe, ver iniciarShell). La
// lógica de qué hacer con el código leído vive en scanner.js, que solo
// está cargado en inventario.html. Desde Historial, mandamos el código
// como parámetro de URL y dejamos que inventario.html lo procese apenas
// carga (ver procesarCodigoDesdeURL en scanner.js).
function wirearEscanerGlobal(paginaActual) {
  if (paginaActual === 'inventario') return; // ahí scanner.js maneja el input directamente

  const input = document.getElementById('input-scanner');
  if (!input) return; // usuarios.html / alertas.html no tienen este campo

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const codigo = input.value.trim();
    input.value = '';
    if (!codigo) return;
    window.location.href = `inventario.html?codigo=${encodeURIComponent(codigo)}`;
  });
}
