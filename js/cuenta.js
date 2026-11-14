// Cuenta de habitante: @usuario + PIN propio (solo seguidores). Habla con las funciones de supabase/cuentas.sql.
// Ver la isla no necesita cuenta: solo se pide en la pestaña Perfil, para gastar monedas o votar en Democracia/juntas.
// El PIN se guarda solo en esta pestaña del navegador (sessionStorage) y se borra al salir.
const cfg = window.ISLA_CONFIG || {};
export const cuentasActivas = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);

async function rpc(fn, body = {}) {
  if (!cuentasActivas) throw new Error('Las cuentas aún no están activas en esta isla.');
  let r;
  try {
    r = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${fn}`, { method: 'POST',
      headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${cfg.supabaseAnonKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch { throw new Error('Sin conexión con el servidor de la isla.'); }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message?.replace(/^.*?: /, '') || 'El servidor no respondió.');
  if (j && j.error) throw new Error(j.error);
  return j;
}

const KEY = 'isla.sesion';
const leer = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch { return null; } };
const guardar = (v) => { try { v ? sessionStorage.setItem(KEY, JSON.stringify(v)) : sessionStorage.removeItem(KEY); } catch {} };

let sesion = leer(); // { handle, pin, perfil }
const oyentes = new Set();
const avisar = () => oyentes.forEach((f) => { try { f(sesion); } catch {} });
export const onCuenta = (f) => { oyentes.add(f); return () => oyentes.delete(f); };
export const cuenta = () => sesion;

const limpio = (h) => String(h || '').trim().replace(/^@/, '').toLowerCase();

export async function entrar(handle, pin) {
  const h = limpio(handle); const perfil = await rpc('isla_perfil', { p_handle: h, p_pin: String(pin) });
  sesion = { handle: h, pin: String(pin), perfil }; guardar(sesion); avisar(); return perfil;
}
export async function crearCuenta(handle, pin) {
  const h = limpio(handle); await rpc('isla_reclamar', { p_handle: h, p_pin: String(pin) });
  return entrar(h, pin);
}
export async function refrescar() { if (!sesion) return null; return entrar(sesion.handle, sesion.pin); }
export function salir() { sesion = null; guardar(null); avisar(); }

export async function solicitar(tipo, datos) {
  if (!sesion) throw new Error('Entra con tu @ y PIN en la pestaña Perfil.');
  const r = await rpc('isla_solicitar', { p_handle: sesion.handle, p_pin: sesion.pin, p_tipo: tipo, p_datos: datos });
  await refrescar(); return r;
}
export async function votar(votacion, opcion) {
  if (!sesion) throw new Error('Entra con tu @ y PIN en la pestaña Perfil para votar.');
  const r = await rpc('isla_votar', { p_handle: sesion.handle, p_pin: sesion.pin, p_votacion: votacion, p_opcion: opcion });
  await refrescar(); return r;
}
export const votacionesWeb = () => rpc('isla_votaciones');
