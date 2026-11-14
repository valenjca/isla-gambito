// Moderación del chat, palabra por palabra (para no bloquear "computadora", "cálculo" o "conchas").
// La misma regla está en supabase/schema.sql (servidor) y en tools/serve.mjs (modo local): el navegador solo avisa antes.
export const EXACTAS = ['puta', 'putas', 'puto', 'putos', 'pene', 'penes', 'culo', 'culos', 'pito', 'pitos', 'polla', 'coño',
  'joto', 'jotos', 'zorra', 'zorras', 'sexo', 'pinche', 'mierda', 'mierdas'];
export const RAICES = ['verg', 'maric', 'chinga', 'cabron', 'huevon', 'weon', 'porn', 'hitler', 'nazi', 'esvastic', 'svastic', 'swastik', 'holocaust', 'mierd', 'putit', 'hijueput', 'hdp'];

const norm = (w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[0@4]/g, (c) => ({ 0: 'o', '@': 'a', 4: 'a' }[c])).replace(/[1!]/g, 'i').replace(/3/g, 'e').replace(/5/g, 's');

export function moderarMensaje(texto) {
  const t = String(texto || '').trim();
  if (!t) return { ok: false, motivo: 'vacío' };
  if (t.length > 280) return { ok: false, motivo: 'máximo 280 caracteres' };
  if (/(https?:\/\/|www\.|\.com\b|\.net\b)/i.test(t)) return { ok: false, motivo: 'sin enlaces' };
  const palabras = t.toLowerCase().split(/[^\p{L}\p{N}@!]+/u).filter(Boolean).map(norm);
  const juntas = palabras.join('');
  // letras sueltas seguidas ("p u t a") se juntan y se revisan como una palabra
  const sueltas = []; let run = '';
  for (const w of [...palabras, '--']) { if (w.length === 1) run += w; else { if (run.length >= 3) sueltas.push(run); run = ''; } }
  const esMala = (w) => EXACTAS.includes(w) || RAICES.some((r) => w.startsWith(r));
  const mala = palabras.find(esMala) || sueltas.find(esMala) || RAICES.find((r) => r.length >= 5 && juntas.includes(r));
  return mala ? { ok: false, motivo: 'Gambito no deja pasar ese lenguaje' } : { ok: true };
}

// Nombres que nadie puede usar en el chat (suplantar a la cuenta o al equipo)
export const RESERVADOS = ['gambito', 'gambitoia', 'admin', 'administrador', 'moderador', 'moderadora', 'instagram', 'soporte'];
export function moderarNombre(nombre) {
  const n = String(nombre || '').trim().replace(/^@/, '');
  if (RESERVADOS.some((r) => n.toLowerCase().replace(/[._]/g, '') === r.replace(/[._]/g, '') || n.toLowerCase().startsWith('gambito'))) return { ok: false, motivo: 'ese nombre está reservado' };
  if (!/^[\p{L}\p{N}._]{2,24}$/u.test(n)) return { ok: false, motivo: 'de 2 a 24 letras, números, punto o guion bajo' };
  const r = moderarMensaje(n.replace(/[._]/g, ' '));
  return r.ok ? { ok: true, nombre: n } : { ok: false, motivo: 'ese nombre no está permitido' };
}
