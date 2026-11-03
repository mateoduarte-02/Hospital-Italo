// =========================================================================
// MODO CLARO / OSCURO
// =========================================================================
// Script común (no módulo) que se carga en el <head> de cada página, ANTES
// de que se dibuje nada: así la página aparece directamente en el tema
// correcto, sin un "flash" blanco al entrar en modo oscuro.
//   - Si la persona ya eligió un tema en esta computadora, se respeta.
//   - Si no, se usa el que tenga configurado el sistema operativo.
// La elección se guarda en el navegador (localStorage). Si el navegador
// no deja guardar (modo incógnito, etc.), igual funciona: sólo no se
// recuerda para la próxima vez.
(function () {
  var CLAVE = 'tema';

  function temaGuardado() {
    try {
      var t = localStorage.getItem(CLAVE);
      return t === 'claro' || t === 'oscuro' ? t : null;
    } catch (e) {
      return null;
    }
  }

  function temaDelSistema() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro';
  }

  function aplicar(tema) {
    document.documentElement.setAttribute('data-tema', tema);
  }

  aplicar(temaGuardado() || temaDelSistema());

  // Cualquier botón con el atributo data-alternar-tema cambia el tema (los
  // del menú los arma js/shell.js después, por eso escuchamos en todo el
  // documento en vez de buscar los botones ahora).
  document.addEventListener('click', function (e) {
    var boton = e.target.closest && e.target.closest('[data-alternar-tema]');
    if (!boton) return;
    var nuevo = document.documentElement.getAttribute('data-tema') === 'oscuro' ? 'claro' : 'oscuro';
    aplicar(nuevo);
    try {
      localStorage.setItem(CLAVE, nuevo);
    } catch (err) {
      /* no se pudo guardar: el cambio vale sólo para esta visita */
    }
  });

  // Si nunca eligió un tema a mano, seguimos al sistema operativo cuando
  // este cambia (ej. modo oscuro automático a la noche).
  if (window.matchMedia) {
    var consulta = window.matchMedia('(prefers-color-scheme: dark)');
    var alCambiar = function () {
      if (!temaGuardado()) aplicar(temaDelSistema());
    };
    if (consulta.addEventListener) consulta.addEventListener('change', alCambiar);
    else if (consulta.addListener) consulta.addListener(alCambiar);
  }
})();
