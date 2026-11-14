// Configuración pública de la isla en línea.
// Pega aquí los datos de tu proyecto de Supabase (Project Settings → API): la URL y la clave publicable (sb_publishable_…) o "anon public".
// La clave anon ES pública por diseño: la seguridad la ponen las reglas de supabase/schema.sql.
// Si se dejan vacías, el chat usa el servidor local (npm run dev) para pruebas.
window.ISLA_CONFIG = {
  supabaseUrl: 'https://lbcfmixflnakidsizxnr.supabase.co',
  supabaseAnonKey: 'sb_publishable_ncmkLtroLtx1B8jSwXVJag_risjBttP', // clave publicable (pública por diseño)
};
