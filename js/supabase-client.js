// =========================================================================
// CONEXIÓN A SUPABASE
// =========================================================================
// SUPABASE_URL y SUPABASE_ANON_KEY vienen de config.js, el único archivo
// que hay que editar para conectar la app a un proyecto de Supabase
// distinto (ver README).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
