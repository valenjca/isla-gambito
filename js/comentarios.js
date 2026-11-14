// Clasificador de comentarios (sin IA, determinista). Lo usa el ciclo (tools/ciclo.mjs) y la web para mostrar
// qué dijo la isla. Cada comentario cae en UNA categoría, en este orden de prioridad:
//   ruido · mudanza · rol · voto · voto_tarde · propuesta (con la votación a la que va) · respuesta · pregunta · saludo · opinion
import { detectarRol, detectarNegocio } from './vida.js';

const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export const sinEco = (t) => norm(t).replace(/([a-zñ])\1{2,}/g, '$1'); // «Verdeeeee» → «verde»
const limpio = (t) => sinEco(String(t).replace(/[\p{Extended_Pictographic}‍️]/gu, ' ')).replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
export const EMOJI = { verde: ['🟢', '💚', '🟩'], rojo: ['🔴', '❤️', '🟥'], azul: ['🔵', '💙'], amarillo: ['🟡', '💛'], si: ['👍', '✅'], no: ['👎', '❌'] };

export const CATEGORIAS = {
  negocio: '🏢 Piden edificio o negocio', rol: '🧑‍🔧 Piden profesión', voto: '🗳️ Votos', voto_tarde: '⌛ Votos tardíos', propuesta: '💡 Propuestas', mudanza: '🏠 Mudanzas',
  respuesta: '↩️ Respuestas', pregunta: '❓ Preguntas', saludo: '👋 Saludos', opinion: '💬 Opiniones', ruido: '· Ruido',
};

const COLOR = /\b(roj|verde|azul|amarill|blanc|negr|naranj|morad|violet|rosad|rosa\b|celeste|dorad|plat|gris|turques|cafe|marron|fucsia|lila)/;
const SIMBOLO = /\b(estrella|sol|luna|franja|franjas|raya|rayas|escudo|corazon|calavera|ancla|palmera|ola|olas|pez|corona|triangulo|circulo|cruz|aguila|llama|rayo|diamante|mano|orbe)\b/;
const A_BANDERA = /\b(bandera|colores?|simbolo)\b/;
const A_NOMBRE = /\b(nombre|llamar|llame|llamemos|bautiz|se llama|llamarse|isla de|isla del)\b/;
const A_MAR = /\b(mar|trajo|orilla|playa|cofre|botella|naufrag|barco|tesoro|sirena|caja|mensaje|ballena|resto|restos)\b/;
const SALUDO = /^(hola|holi|buenas|buenos|saludos|hey|que tal|primer|primero|primera|ya te segui|te sigo|seguido|jaj|jsj|xd|lol|wow|genial|increible|me encanta|que bonito|bonito|lindo|hermoso|crack|bien|top|god|uff)/;
// frases cortas que NO son un nombre propuesto («ok aki toy», «yo tengo ser mafia», «el payaso…»)
const NO_NOMBRE = /\b(yo|tu|tengo|toy|estoy|aqui|aki|ok|okey|ser|soy|es|me|te|mi|comenta|wee?|pido|quiero|puede|gracias|si|no|hola|pls|plis+|porfa|xfa|xfavor)\b|^el\s/;
const MUDANZA = /\bme mudo (?:a|al|a la)\s+(.+)/;

// Tiene una sola opción de esta votación (dos opciones a la vez = voto nulo)
export function opcionDe(texto, voto) {
  const t = sinEco(texto);
  const hits = (voto.options || []).filter((o) => new RegExp(`\\b${norm(o.id)}\\b`).test(t) || (EMOJI[o.id] || []).some((e) => texto.includes(e)));
  return hits.length === 1 ? hits[0].id : null;
}

// abiertas: votaciones abiertas (state.openVotes); cerradas: votaciones ya cerradas; zonas: [{id,name}]
// c: { text, respuesta? } — respuesta = es contestación a otro comentario
export function clasificar(c, { abiertas = [], cerradas = [], zonas = [] } = {}) {
  const texto = String(c.text ?? c ?? ''); const t = limpio(texto); const palabras = t ? t.split(' ') : [];
  if (t.replace(/\s/g, '').length < 3 && !Object.values(EMOJI).flat().some((e) => texto.includes(e))) return { tipo: 'ruido' };
  const mud = t.match(MUDANZA);
  if (mud) { const z = zonas.find((z) => mud[1].includes(z.id) || mud[1].includes(norm(z.name).replace('zona ', ''))); if (z) return { tipo: 'mudanza', zona: z.id }; }
  const neg = detectarNegocio(texto); if (neg) return { tipo: 'negocio', negocio: neg };
  const rol = detectarRol(texto);
  const esOpcion = (s) => [...abiertas, ...cerradas].some((v) => (v.options || []).some((o) => norm(o.id) === sinEco(s)));
  // «un cofre lleno de memes» con la votación del mar abierta es una propuesta, no un rol (solo cuenta si lo pide)
  const pide = /\b(quiero|exijo|soy|sere|me pido|mi rol|mi profesion|voy a ser)\b/.test(t);
  const alMar = A_MAR.test(t) || /^(un|una)\s/.test(t) && abiertas.some((v) => v.mode === 'propuestas' && (v.effect === 'hallazgo' || v.id === 'mar')) && rol?.oficio === 'libre';
  if (rol && !esOpcion(rol.titulo) && (pide || !alMar)) return { tipo: 'rol', rol };
  // votación con opciones abierta (VERDE/ROJO, SÍ/NO…)
  // Democracia y juntas (modo sino) se votan en la web, no en comentarios
  for (const v of abiertas) if (v.mode !== 'propuestas' && v.mode !== 'sino') { const o = opcionDe(texto, v); if (o) return { tipo: 'voto', voto: v.id, opcion: o }; }
  // opción de una votación ya cerrada, en un comentario corto → voto que llegó tarde (no es nombre ni bandera)
  if (palabras.length <= 4 && cerradas.some((v) => v.mode !== 'sino' && opcionDe(texto, v))) return { tipo: 'voto_tarde' };
  if (c.respuesta) return { tipo: 'respuesta' };
  // propuesta: ¿a qué votación de propuestas va?
  const props = abiertas.filter((v) => v.mode === 'propuestas');
  if (props.length && !texto.includes('?')) {
    const por = (fx) => props.find((v) => v.effect === fx || v.id === fx);
    const destino = (A_BANDERA.test(t) && por('bandera')) || (A_NOMBRE.test(t) && por('nombre'))
      || ((A_MAR.test(t) || alMar) && (por('hallazgo') || por('mar')))
      || ((COLOR.test(t) || SIMBOLO.test(t)) && por('bandera'))
      || (palabras.length <= 3 && !SALUDO.test(t) && !NO_NOMBRE.test(t) && por('nombre'))
      || (props.length === 1 && !SALUDO.test(t) && palabras.length <= 12 ? props[0] : null);
    if (destino) return { tipo: 'propuesta', voto: destino.id };
  }
  if (texto.includes('?')) return { tipo: 'pregunta' };
  if (SALUDO.test(t)) return { tipo: 'saludo' };
  return { tipo: 'opinion' };
}
