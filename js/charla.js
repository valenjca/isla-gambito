// 💭 Charla de la isla: lo que dicen los vecinos solos y entre ellos, según lo que son, lo que hacen y lo que pasa en la isla.
// Sin IA: plantillas con datos reales (nombre, votaciones, oficios, recién llegados…). Los diálogos salen también como
// bocadillos sobre los personajes en 3D (world.say).
import { vidaDe, actividad, OFICIOS } from './vida.js';
import { zoneName } from './state.js';

const azar = (a) => a[Math.floor(Math.random() * a.length)];
const sinAc = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Frases propias de cada rol (se busca por el título que eligió)
const POR_ROL = [
  [/mafia|mafios|capo/, ['esta isla necesita protección. y yo la vendo', 'no vi nada. no sé nada. no estuve ahí', 'tengo una oferta que no puedes rechazar: un coco', 'la familia es lo primero. y la familia soy yo, por ahora']],
  [/cobra|cobrador|banquer/, ['me debes los buenos días de ayer', 'aquí se paga todo. hasta mirar', 'anotado en la libreta. con intereses']],
  [/puente/, ['por mi puente no pasa nadie sin decir la contraseña', 'la contraseña cambió. no, no te la digo', 'el río y yo tenemos un acuerdo']],
  [/loco/, ['la mano de piedra me guiñó un ojo otra vez', 'tengo un plan. no lo entiendo ni yo, pero es bueno', 'hablé con un árbol. me dio la razón']],
  [/modelo|influencer/, ['no me miren que no estoy maquillada… bueno, miren', 'esta luz del atardecer es mi mejor amiga', 'subí una foto con el filtro "isla". 3 likes, todos de gaviotas']],
  [/abogad|juez/, ['eso que dijiste es demandable', 'objeción. no sé a qué, pero objeción', 'cobro por consulta. esta frase ya te costó dos monedas']],
  [/mecanic|tecnic/, ['si algo no está roto, lo arreglo igual', 'ese puente hace un ruidito raro. déjenmelo a mí', 'busco motores. aquí solo hay cocos']],
  [/paloma/, ['mis palomas te mandan saludos', 'cada paloma tiene nombre. esta es Mari', 'las palomas saben todos los chismes. yo solo los traduzco']],
  [/unico/, ['soy único. lo dice mi título', 'si alguien construye otro edificio me ofendo', 'ser único es agotador']],
  [/villan|malvad/, ['muajaja. perdón, se me escapó', 'mi plan malvado va al 2%', 'cuando tenga cien monedas, tiemblen']],
  [/gobern|rey|reina|presiden/, ['prometo un coco por familia', 'mi primer decreto: más siestas', 'vótenme. no hay elecciones, pero vótenme']],
  [/payaso/, ['¿por qué el coco cruzó el río? porque había puente', 'malabares gratis en la plaza. aplausos opcionales']],
  [/cientific|inventor/, ['mi hipótesis: la mano saluda a los barcos', 'el orbe brilla más los martes. necesito más datos', 'experimento 47: el agua del río moja']],
  [/chef|cocin/, ['hoy cocino coco al coco', 'sin fogata cocino con fe', 'probé tu sopa. le falta sal. y sopa']],
  [/futbol|voley|deport|atlet/, ['entreno sin estadio. si me ven corriendo sola, es eso', '¡hagan un estadio! lo pido con respeto y con sudor', 'voy ganando 0 a 0 contra mí']],
  [/ingenier|arquitect|urbanista/, ['tengo planos para el hospital. solo falta el hospital', 'este puente lo diseñé yo. mentalmente', 'si me dan monedas construyo lo que sea']],
  [/vagabund|indigente/, ['mi oficina es la playa. mi horario, cuando quiera', 'tengo monedas ahorradas. no le digan a nadie', 'la arena es gratis. por eso me gusta']],
  [/herrer/, ['busco hierro. aquí solo hay madera y cocos', 'el primer herrero de la isla. sin martillo, pero con ganas']],
  [/medic|doctor/, ['¿te duele algo? toma agua de coco', 'pasando consulta bajo una palmera, pidan número']],
  [/mono/, ['uh uh ah ah (traducción: ¿alguien vio mis cocos?)', 'me colgué de un árbol y no sé bajar']],
  [/gato/, ['miau. (traducción: esta plaza es mía)', 'tiré algo de una mesa. no me arrepiento']],
];
// Lo que se dice según lo que está haciendo ahora mismo (a.texto viene en gerundio: «cobrando…», «pescando»)
const AHORA = [(t) => `aquí, ${t}`, (t) => `${t}. no pregunten`, (t) => `estoy ${t} y nadie me ayuda`, (t) => `${t} desde hace rato. ¿y ustedes?`,
  (t) => `si me buscan, estoy ${t}`, (t) => `${t}. es mi pasión (más o menos)`];
// Diálogos: A dice, B responde (C a veces remata). ${a} ${b} = @ de cada uno.
const DIALOGOS = [
  (c) => [['a', '¿alguien vio a la gaviota de ayer?'], ['b', 'cuál, si hay mil'], ['a', 'la que me miraba raro'], ['b', 'todas te miran raro']],
  (c) => [['a', `@${c.b}, ¿me prestas un coco?`], ['b', 'te presto medio'], ['a', '¿y cómo se presta medio coco?'], ['b', 'con confianza']],
  (c) => [['a', 'dicen que la mano de piedra se movió anoche'], ['b', 'eso dicen todas las noches'], ['c', 'yo la vi saludar 👋']],
  (c) => c.voto && [['a', `¿qué votaste en «${c.voto.question}»?`], ['b', c.votoB], ['a', c.votoA === c.votoB ? 'pensamos igual. qué miedo' : 'entonces ya no somos vecinos'], ['b', 'éramos vecinos?']],
  (c) => c.nuevo && [['a', `bienvenid@ @${c.nuevo} 🏠`], ['b', `ojo @${c.nuevo}, aquí nada se borra`], ['c', 'ni siquiera las vergüenzas']],
  (c) => c.nombre && [['a', `todavía no me acostumbro a vivir en ${c.nombre}`], ['b', 'yo lo digo despacio para que suene elegante'], ['a', `${c.nombre.split('').join('… ')}`]],
  (c) => [['a', '¿cuánto cuesta ser policía?'], ['b', 'quince monedas y una comisaría'], ['a', 'tengo tres monedas'], ['b', 'entonces eres vigilante de tu casa']],
  (c) => c.mafia && [['m', `@${c.b}, bonito jardín… sería una pena que le pasara algo`], ['b', 'no tengo jardín'], ['m', 'por eso, protección preventiva'], ['b', '¿cuánto?'], ['m', 'un coco a la semana']],
  (c) => c.puente && [['p', `@${c.b}, contraseña para cruzar`], ['b', '¿"por favor"?'], ['p', 'incorrecto. era "coco"'], ['b', 'ya la dijiste'], ['p', 'ahora es otra']],
  (c) => c.mono && [['b', `@${c.mono} devuélveme el coco`], ['mono', 'uh uh ah ah'], ['b', 'eso no es una respuesta'], ['mono', 'ah ah']],
  (c) => c.gato && [['b', 'ese gato se sentó en mi silla'], ['gato', 'miau'], ['c', 'ahora es su silla. así funciona']],
  (c) => [['a', 'hace calor hoy'], ['b', 'es una isla, siempre hace calor'], ['a', 'por eso lo digo siempre']],
  (c) => c.clima === 'nublado' && [['a', 'se viene lluvia'], ['b', 'mi casa no tiene techo'], ['a', 'todas tienen techo'], ['b', 'el mío tiene huecos de diseño']],
  (c) => c.clima === 'lluvia' && [['a', '¡menos mal que saqué el paraguas! ☂️'], ['b', 'yo me mojé entero por dejarlo en casa 🌧️'], ['a', 'siempre hay que mirar el clima'], ['b', 'tienes toda la razón']],
  (c) => c.falta && [['a', `necesitamos ${c.falta}`], ['b', 'propónlo en la Democracia'], ['a', 'cuesta 60 monedas'], ['b', 'entonces sigue necesitándolo']],
  (c) => [['a', '¿alguien sabe qué hace Gambito todo el día?'], ['b', 'nos mira y habla de nosotros'], ['a', 'como un chismoso'], ['b', 'como un narrador. es distinto, dice él']],
  (c) => [['a', `@${c.b}, ¿subiste el Reel a tu historia?`], ['b', '¿para qué?'], ['a', 'te dan 15 monedas'], ['b', 'ya lo estoy subiendo']],
  (c) => c.rico && [['a', `dicen que @${c.rico} es el más rico de la isla`], ['b', '¿cuánto tiene?'], ['a', `${c.ricoM} monedas`], ['b', 'ah, millonario']],
  (c) => c.espera && [['a', `quiero ser ${c.espera.nombre.toLowerCase()} pero no hay ${c.espera.requiere}`], ['b', 'practica en la playa'], ['a', 'ya practico en la playa'], ['b', 'entonces ya eres un poco']],
  (c) => [['a', 'propongo hacer una fiesta en la plaza'], ['b', '¿con qué?'], ['a', 'con cocos'], ['c', 'otra vez cocos'], ['a', 'es lo que hay']],
  (c) => [['a', '¿qué trajo el mar a la orilla?'], ['b', 'nadie lo sabe, nadie se acercó'], ['a', '¿y si es un tesoro?'], ['b', '¿y si es un cangrejo enojado?']],
];
// Ocurrencias sueltas de la isla (cualquiera las puede decir)
const SUELTAS = (c) => [
  `somos ${c.n} ya. a este paso habrá cola para la plaza`, 'las gaviotas aquí tienen más seguidores que yo', '¿alguien más escucha el orbe zumbar de noche?',
  'hoy no pasó nada. que conste en la historia', 'me pidieron que no hablara de la mano. no hablo de la mano', 'aprendí a abrir cocos con los pies. pregúntenme cómo',
  'si gana el rojo me mudo. a otra casa de la isla, pero me mudo', 'la casa de al lado tiene flores en la ventana y yo no. investigando',
  'el bosque de noche da un poco de miedo. un poquito. bastante', 'el río está frío. lo sé por experiencia y por error',
  c.voto ? `ojo que la votación «${c.voto.question}» se cierra con el próximo vídeo` : 'no hay votaciones abiertas. raro, para esta isla',
  c.nombre ? `${c.nombre} suena a reino de fantasía. y vivimos de cocos` : 'necesitamos nombre ya. estoy cansado de decir "la isla"',
  'ayer vi a alguien hablándole a un árbol. el árbol no contestó, por suerte', 'me compraría un sombrero, pero prefiero ahorrar para ser villano',
  'en esta isla todo se vota. hasta el almuerzo, casi', `${c.n} vecinos y ni una pizzería. inaceptable`,
];

export function crearCharla(s, world) {
  const hora = () => ((world.time ?? 600) / 60) % 24;
  const vecinos = s.residents;
  const quien = (re) => vecinos.find((r) => re.test(sinAc(r.rolTexto)))?.handle;
  const contexto = () => {
    const azarH = () => azar(vecinos).handle; let a = azarH(), b = azarH(), c3 = azarH(); for (let i = 0; i < 5 && b === a; i++) b = azarH();
    const voto = s.openVotes.find((v) => v.mode !== 'propuestas' && v.mode !== 'sino' && v.options?.length);
    const op = () => voto ? azar(voto.options).label.replace(/^[^\p{L}\d]+/u, '').split('·')[0].trim() : '';
    const votoA = op(), votoB = op();
    const ricos = [...vecinos].sort((x, y) => (y.ahorros || 0) - (x.ahorros || 0));
    const espera = (() => { const r = azar(vecinos); const v = vidaDe(r, s); return v.enEspera && OFICIOS[v.vocacion]?.requiere ? OFICIOS[v.vocacion] : null; })();
    return { a, b, c: c3, voto, votoA, votoB, nombre: s.name, clima: s.weather, n: vecinos.length,
      nuevo: vecinos.at(-1)?.handle, mafia: quien(/mafia|mafios/), puente: quien(/puente/), mono: quien(/^mono/), gato: quien(/^gat/),
      rico: ricos[0]?.handle, ricoM: ricos[0]?.ahorros || 0, espera,
      falta: azar(['un hospital', 'un estadio', 'una escuela', 'un mercado', 'una pizzería', 'un faro']) };
  };
  // Monólogo: lo que dice un vecino ahora
  const monologo = (h) => {
    const r = s.byHandle.get(h); const v = vidaDe(r, s); const a = actividad(v, hora(), h);
    const rol = POR_ROL.find(([re]) => re.test(sinAc(r.rolTexto || v.titulo || '')));
    const dado = Math.random();
    if (a.accion === 'dormir') return azar(['zzz', 'zzz… (soñando con wifi)', 'zzz… no, mamá, cinco minutos más', 'zzz… ¡ese coco es mío!']);
    if (rol && dado < 0.45) return azar(rol[1]);
    if (a.texto && dado < 0.75 && !/(s[ií] mism|\bsus?\b|\bél\b|\bella\b)/.test(a.texto)) return azar(AHORA)(a.texto); // «contra sí mismo», «sus palomas» no van en primera persona
    if (dado < 0.88 && v.rasgo?.frases?.length) return azar(v.rasgo.frases);
    return azar(SUELTAS(contexto()));
  };
  // Diálogo: devuelve [[handle, texto], …] entre 2–3 vecinos
  const dialogo = () => {
    const c = contexto(); const opciones = DIALOGOS.map((f) => f(c)).filter(Boolean);
    const lines = azar(opciones);
    const rolDe = { a: c.a, b: c.b, c: c.c, m: c.mafia, p: c.puente, mono: c.mono, gato: c.gato };
    return lines.map(([k, t]) => [rolDe[k] || c.a, t]);
  };
  return { monologo, dialogo, vecinoAzar: () => azar(vecinos).handle };
}
