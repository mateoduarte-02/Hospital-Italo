// =========================================================================
// CONFIG.JS - Datos de conexión a tu proyecto de Supabase
// =========================================================================
// Este es el ÚNICO archivo que tenés que editar para conectar la app a tu
// propio proyecto de Supabase. No hace falta tocar ningún otro archivo.
//
// ¿DE DÓNDE SACO ESTOS DATOS?
// 1. Entrá a https://supabase.com y abrí tu proyecto.
// 2. En el menú lateral izquierdo, andá a "Project Settings" (el ícono de
//    engranaje, abajo de todo).
// 3. Hacé clic en "API" (a veces figura como "Data API").
// 4. Ahí vas a ver:
//      - "Project URL"          -> pegala en SUPABASE_URL
//      - "anon public" (dentro  -> pegala en SUPABASE_ANON_KEY
//         de "Project API keys")
//
// IMPORTANTE:
// - Usá SIEMPRE la clave "anon public", NUNCA la "service_role" (esa es
//   secreta, tiene acceso total y JAMÁS debe usarse en el frontend).
// - La clave "anon public" está pensada para ser pública en el frontend:
//   por eso existen las políticas de Row Level Security (RLS) del
//   schema.sql, que son las que realmente protegen los datos.
// =========================================================================

export const SUPABASE_URL = "https://ydsxbteoraiwowrrlzlz.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlkc3hidGVvcmFpd293cnJsemx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2ODAwODksImV4cCI6MjEwMDI1NjA4OX0.yXH1cSolLwtvDanoCUMybgkoQ3D_vACdCXruxM2fUsg";
