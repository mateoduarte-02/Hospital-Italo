// =========================================================================
// ESTADO GLOBAL
// =========================================================================
// Guardamos acá, en memoria, los datos que ya trajimos de la base de datos
// para no tener que pedirlos de nuevo cada vez que dibujamos la pantalla.
// Cada vez que se agrega/edita/borra algo, volvemos a pedir los datos a
// Supabase y actualizamos estas listas (ver datos.js).
export const estado = {
  usuario: null,               // usuario autenticado (objeto de supabase.auth)
  perfil: null,                 // fila de la tabla "profiles" del usuario actual
  medicamentos: [],             // cache de la tabla "medicamentos"
  movimientos: [],              // cache de la tabla "movimientos" (con el medicamento embebido)
  perfiles: {},                 // mapa { id_usuario: nombre } para mostrar nombres en la auditoría
  gruposExpandidos: new Set(),  // qué códigos de barras están "desplegados" mostrando sus lotes
};

export const DIAS_ALERTA_VENCIMIENTO = 15; // días de anticipación para avisar vencimientos
