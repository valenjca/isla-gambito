// Vida automática de cada habitante: oficio, pasatiempo, personalidad y rutina diaria.
// Determinista por @ (siempre igual) y sin dependencias: lo usan la web y tools/ciclo.mjs.
// Profesión elegida: si alguien comenta «quiero ser X», un evento "rol" lo convierte en X (con sus propias palabras).

// lugar: dónde se trabaja. requiere: edificio que debe existir; si no existe, el habitante usa su oficio de respaldo.
export const OFICIOS = {
  pescador:   { nombre: 'Pescador/a',      lugar: 'playa',   verbo: 'pescando', sueldo: 8, anim: 'pescar' },
  lenador:    { nombre: 'Leñador/a',       lugar: 'bosque',  verbo: 'cortando leña', sueldo: 8, anim: 'talar' },
  recolector: { nombre: 'Recolector/a',    lugar: 'bosque',  verbo: 'recolectando cocos', sueldo: 6, anim: 'recoger' },
  aguador:    { nombre: 'Aguador/a',       lugar: 'rio',     verbo: 'trayendo agua del río', sueldo: 6, anim: 'agua' },
  vigia:      { nombre: 'Vigía de la mano', lugar: 'mano',   verbo: 'vigilando la mano de piedra', sueldo: 7, anim: 'vigilar' },
  constructor:{ nombre: 'Constructor/a',   lugar: 'pueblo',  verbo: 'construyendo cosas', sueldo: 10, anim: 'martillar' },
  comerciante:{ nombre: 'Comerciante',     lugar: 'mercado', verbo: 'vendiendo en el mercado', requiere: 'mercado', sueldo: 16, anim: 'vender' },
  maestro:    { nombre: 'Maestro/a',       lugar: 'escuela', verbo: 'dando clase', requiere: 'escuela', sueldo: 18, anim: 'discurso' },
  farero:     { nombre: 'Farero/a',        lugar: 'faro',    verbo: 'cuidando el faro', requiere: 'faro', sueldo: 14, anim: 'vigilar' },
  marinero:   { nombre: 'Marinero/a',      lugar: 'muelle',  verbo: 'arreglando barcas', requiere: 'muelle', sueldo: 13, anim: 'martillar' },
  granjero:   { nombre: 'Granjero/a',      lugar: 'granja',  verbo: 'cuidando la granja', requiere: 'granja', sueldo: 12, anim: 'recoger' },
  alcalde:    { nombre: 'Funcionario/a',   lugar: 'ayuntamiento', verbo: 'sellando papeles', requiere: 'ayuntamiento', sueldo: 26, anim: 'escribir' },
  cocinero:   { nombre: 'Cocinero/a',      lugar: 'fogata',  verbo: 'cocinando en la fogata', requiere: 'fogata', sueldo: 12, anim: 'cocinar' },
  medico:     { nombre: 'Médico/a',        lugar: 'hospital', verbo: 'atendiendo pacientes', requiere: 'hospital', sueldo: 30, anim: 'curar' },
  deportista: { nombre: 'Deportista',      lugar: 'estadio', verbo: 'jugando fútbol', requiere: 'estadio', sueldo: 15, anim: 'futbol' },
  // --- solo por elección en comentarios (nunca se asignan automáticamente) ---
  ingeniero:  { nombre: 'Ingeniero/a',     lugar: 'taller', requiere: 'taller',  verbo: 'diseñando puentes y planos', sueldo: 20, anim: 'escribir' },
  policia:    { nombre: 'Policía',         lugar: 'comisaria', requiere: 'comisaria',   verbo: 'patrullando', sueldo: 14, anim: 'vigilar' },
  bombero:    { nombre: 'Bombero/a',       lugar: 'bomberos', requiere: 'bomberos',  verbo: 'vigilando que nada arda', sueldo: 14, anim: 'agua' },
  cientifico: { nombre: 'Científico/a',    lugar: 'mano',    verbo: 'estudiando la mano de piedra', sueldo: 22, anim: 'escribir' },
  artista:    { nombre: 'Artista',         lugar: 'playa',   verbo: 'pintando el paisaje', sueldo: 9, anim: 'pintar' },
  musico:     { nombre: 'Músico/a',        lugar: 'plaza',   verbo: 'tocando para los vecinos', sueldo: 9, anim: 'musica' },
  villano:    { nombre: 'Villano/a',       lugar: 'bosque',  verbo: 'tramando con la mafia', sueldo: 11, anim: 'tramar' },
  guardia:    { nombre: 'Guardia',         lugar: 'puente',  verbo: 'custodiando el puente', sueldo: 13, anim: 'vigilar' },
  vagabundo:  { nombre: 'Vagabundo/a',     lugar: 'playa',   verbo: 'vagando sin rumbo', sueldo: 2, anim: 'sentarse' },
  gobernante: { nombre: 'Gobernante',      lugar: 'ayuntamiento', requiere: 'ayuntamiento',   verbo: 'dando discursos', sueldo: 24, anim: 'discurso' },
  animal:     { nombre: 'Animal',          lugar: 'pueblo',  verbo: 'paseando por el pueblo', sueldo: 1, anim: null },
  mago:       { nombre: 'Mago/a',          lugar: 'bosque',  verbo: 'lanzando hechizos y magia', sueldo: 16, anim: 'magia' },
  repostero:  { nombre: 'Repostero/a',     lugar: 'fogata',  verbo: 'horneando postres y dulces', sueldo: 14, anim: 'cocinar' },
  armero:     { nombre: 'Armero/a',        lugar: 'taller',  verbo: 'forjando armas y escudos', sueldo: 18, anim: 'martillar' },
  barista:    { nombre: 'Barista',         lugar: 'mercado', verbo: 'preparando café caliente', sueldo: 14, anim: 'cocinar' },
  libre:      { nombre: 'Oficio propio',   lugar: 'pueblo',  verbo: 'trabajando en lo suyo', sueldo: 8, anim: 'martillar' },
};
const RESPALDO = ['pescador', 'lenador', 'recolector', 'aguador', 'constructor', 'vigia'];
// Lista CONGELADA para la asignación automática: añadir oficios nuevos no cambia el de quien ya vive en la isla.
const VOCACIONES = ['pescador', 'lenador', 'recolector', 'aguador', 'vigia', 'constructor', 'comerciante', 'maestro',
  'farero', 'marinero', 'granjero', 'alcalde', 'cocinero', 'medico', 'deportista'];

// ---------- Precio de cada profesión (en monedas 🪙 ahorradas) ----------
// Los roles potentes o malvados cuestan caro: hay que participar a diario para ahorrar (el sueldo sube con el rango).
export const COSTO_ROL = {
  vagabundo: 0, animal: 0, artista: 0, musico: 0, pescador: 0, recolector: 0, aguador: 0, lenador: 0, vigia: 0, libre: 0,
  policia: 15, guardia: 15, bombero: 15, constructor: 15, comerciante: 15, maestro: 15, cocinero: 15, granjero: 15, marinero: 15, farero: 15, deportista: 15,
  medico: 40, ingeniero: 40, cientifico: 40, alcalde: 40,
  villano: 100, gobernante: 100, // precios rebajados el día 2 (antes 30/80/200)
};

// ---------- Profesión elegida en comentarios ----------
const SINONIMOS = [
  [/medic|doctor|enfermer|cirujan/, 'medico'], [/pescad/, 'pescador'], [/profe|maestr|docente/, 'maestro'],
  [/polic|detective|sheriff/, 'policia'], [/bomber/, 'bombero'], [/cientif|investigad|inventor|quimic/, 'cientifico'],
  [/artist|pintor|escultor|fotograf/, 'artista'], [/music|cantant|guitarr|rapero|dj\b/, 'musico'],
  [/villan|malvad|maleante|ladron|pirata|mafios/, 'villano'], [/vagabund|mendig|nomada|errante|indigente|pordiosero/, 'vagabundo'], [/custodi|guardia\b|guardian|portero|centinela/, 'guardia'],
  [/gobern|alcald|president|\brey\b|\breina\b|lider|dictador|emperad|ministr/, 'gobernante'],
  [/ingenier/, 'ingeniero'], [/constru|albanil|arquitect|carpinter/, 'constructor'], [/chef|cociner|panader/, 'cocinero'],
  [/agricult|granjer|campesin|jardiner/, 'granjero'], [/comerci|vended|tender|empresari|banquer/, 'comerciante'],
  [/marin|capitan|navegant/, 'marinero'], [/farer/, 'farero'], [/deport|futbol|atlet|boxead|nadador|jugador|voley|volei|basquet|tenis|surf/, 'deportista'],
  [/lenad/, 'lenador'], [/recolect/, 'recolector'], [/vigia|vigilant/, 'vigia'],
];
const sinAcentos = (t) => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Cosas: quien pide ser una cosa (edificio, vehículo, objeto…) también lo es: camina con patitas y ojos (tipo «cosa»).
const NO_VIVOS = new Set(('edificio casa castillo torre puente muro faro tanque avion avioneta helicoptero barco submarino yate coche carro auto ' +
  'automovil camion tren moto motocicleta bicicleta bus autobus bomba misil arma pistola rifle metralleta canon espada cuchillo nave cohete robot ' +
  'computadora ordenador celular telefono planeta sol luna estrella montana volcan isla piedra roca arbol mueble silla mesa dinero billete ' +
  'mansion hotel estadio escuela hospital iglesia templo tractor excavadora grua dron').split(' '));
// Formas con modelo propio en la isla (characters.js → crearAnimal). Se pide cualquier cosa y se hace, sin excepción:
// animales, seres fantásticos y hasta objetos (caminan con patitas y ojos saltones).
const ANIMALES = [
  [/^(gato|gata|gatito|gatita|michi|minino)$/, 'gato'], [/^(perro|perra|perrito|perrita|cachorro|cachorra|lomito)$/, 'perro'],
  [/^(mono|mona|monito|monita|chimpance|gorila|orangutan|simio|macaco)$/, 'mono'],
  [/^(conejo|coneja|conejito|conejita|liebre)$/, 'conejo'], [/^(oso|osa|osito|osita|panda)$/, 'oso'],
  [/^(caballo|yegua|burro|burra|poni|pony|unicornio|llama|alpaca|vaca|toro|cabra|oveja|ciervo|venado|jirafa|camello)$/, 'caballo'],
  [/^(pajaro|pajarito|loro|perico|pato|pata|patito|gallina|gallo|pollo|pollito|buho|lechuza|aguila|halcon|paloma|gaviota|pinguino|flamenco|cuervo|colibri|tucan|avestruz)$/, 'ave'],
  [/^(cocodrilo|caiman|lagarto|lagartija|iguana|dinosaurio|dino|tiranosaurio|dragon|dragona|serpiente|culebra|tortuga|camaleon|rana|sapo)$/, 'reptil'],
  [/^(pez|pescado|pececito|tiburon|ballena|delfin|pulpo|calamar|cangrejo|foca|nutria|ajolote)$/, 'pez'],
  [/^(fantasma|espiritu|espectro)$/, 'fantasma'], [/^(robot|androide|cyborg|ciborg|maquina)$/, 'robot'],
  [/^(zorro|zorra|lobo|loba|leon|leona|tigre|tigresa|cerdo|cerda|chancho|cerdito|mapache|ardilla|raton|rata|hamster|capibara|elefante|rinoceronte|hipopotamo|koala|canguro|perezoso|nutria|huron|erizo|jaguar|puma|pantera|guepardo|hiena|bisonte)$/, 'animal'],
];
const DEF_COLOR = { gato: '#d9a066', perro: '#b5835a', mono: '#7a4e2d', conejo: '#d9d9d9', oso: '#7a4e2d', caballo: '#8b5a2b', ave: '#e0c060',
  reptil: '#5aa05a', pez: '#e8893a', fantasma: '#f4f4f0', robot: '#9aa0a6', animal: '#a08060', cosa: '#c0392b' };
const COLOR_ESPECIE = { panda: '#f2f2ee', unicornio: '#f5f0ff', vaca: '#f2f2ee', toro: '#3a2a20', oveja: '#f2f2ee', pinguino: '#1f1f24', pato: '#f2f2ee',
  loro: '#3fa34d', flamenco: '#f2a5c0', gallina: '#f2f2ee', paloma: '#9aa0a6', gaviota: '#f2f2ee', cuervo: '#1f1f24', zorro: '#e8893a', leon: '#d9b44a',
  tigre: '#e8893a', cerdo: '#f2a5c0', chancho: '#f2a5c0', lobo: '#9aa0a6', raton: '#9aa0a6', rata: '#9aa0a6', tortuga: '#5a7a3a', dragon: '#2f8f5a',
  tiburon: '#7d8ea0', ballena: '#4a6a90', delfin: '#7d9ec0', pulpo: '#c0587a', cangrejo: '#c0392b', jirafa: '#d9b44a', elefante: '#9aa0a6',
  gorila: '#2f2f33', capibara: '#9a6b3f', burro: '#8a8580', jaguar: '#d9a040', ajolote: '#f2a5c0' };
// Qué accesorio lleva un objeto que camina
const COSAS = [[/tanque|canon/, 'canon', '#5a6b3a'], [/avion|avioneta|nave|cohete|dron|helicoptero/, 'alas', '#d9d9d9'],
  [/coche|carro|auto|automovil|camion|bus|autobus|tren|tractor|moto|motocicleta|bicicleta|excavadora|grua/, 'ruedas', '#c0392b'],
  [/casa|edificio|castillo|hotel|mansion|escuela|hospital|iglesia|templo|torre|faro|estadio/, 'techo', '#e8dcc4'],
  [/arbol|palmera|planta|flor/, 'copa', '#3d8b3d'], [/sol|luna|planeta|estrella|piedra|roca|pelota|bola/, 'esfera', '#e8c040']];
const COLORES = [[/negr/, '#1f1f24'], [/blanc/, '#f2f2ee'], [/naranj|anaranj|pelirroj/, '#e8893a'], [/gris|plateado/, '#9aa0a6'],
  [/cafe|marron|chocolate/, '#7a4e2d'], [/dorad|amarill|rubi/, '#d9b44a'], [/rosa/, '#f2a5c0'], [/azul/, '#4a78c2'], [/verde/, '#5aa05a'], [/roj/, '#c0392b']];
// «Gato negro» → { tipo: 'gato', color: '#1f1f24', especie: 'gato' }; null si no es un animal
export function formaDe(titulo) {
  if (!titulo) return null;
  const ws = sinAcentos(titulo).split(/\s+/); const w0 = ws[0]; const sing = w0.replace(/(es|s)$/, '');
  const c = COLORES.find(([re]) => ws.slice(1).some((w) => re.test(w)));
  const a = ANIMALES.find(([re]) => re.test(w0) || re.test(sing));
  if (a) return { tipo: a[1], especie: w0, color: c ? c[1] : COLOR_ESPECIE[w0] || COLOR_ESPECIE[sing] || DEF_COLOR[a[1]] };
  if (NO_VIVOS.has(w0) || NO_VIVOS.has(sing)) { const k = COSAS.find(([re]) => re.test(w0)) || [null, 'caja', DEF_COLOR.cosa];
    return { tipo: 'cosa', especie: w0, cosa: k[1], color: c ? c[1] : k[2] }; }
  return null;
}
// Un edificio es un negocio: «quiero un edificio», «quiero abrir un restaurante», «mi propia tienda», «…con un edificio»
// → { rubro, nombre|null } (lo abre el ciclo en la Calle del Comercio si le alcanza; si no, queda ahorrando)
const LOCALES = 'edificio|restaurante|restaurant|tienda|hotel|bar|cafe|cafeteria|negocio|torre|local|panaderia|empresa|banco|pizzeria|heladeria|mansion|castillo|oficina|pasteleria|libreria|farmacia|gimnasio|discoteca|taller|kiosco|almacen|supermercado|carniceria|floreria|peluqueria|casino|cine';
export function detectarNegocio(texto) {
  const t = sinAcentos(String(texto)).replace(/[^a-z0-9ñ\s"“”«».,]/g, ' ').replace(/\s+/g, ' ');
  const m = t.match(new RegExp(`(?:quiero|quisiera|me gustaria|voy a|deseo|exijo)\\s+(?:abrir|tener|montar|poner|construir|comprar)?\\s*(?:un|una|mi propio|mi propia|mi)\\s+(${LOCALES})\\b`))
    || t.match(new RegExp(`(?:abrir|montar|tener)\\s+(?:un|una|mi)\\s+(${LOCALES})\\b`)) || t.match(/\bcon (?:un|su|mi) (edificio)\b/);
  if (!m) return null;
  const nom = String(texto).match(/(?:llamad[oa]|que se llame|se llamara|de nombre)\s+["“«]?([^"”»,.!?]{2,28})/i);
  return { rubro: m[1], nombre: nom ? nom[1].trim() : null };
}
// Devuelve { oficio, titulo } o null. «Quiero ser el villano de toda la isla» → { villano, "Villano de toda la isla" }
export function detectarRol(texto) {
  const t = String(texto).replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, ' ').replace(/\s+/g, ' ').trim();
  const m = sinAcentos(t).match(/(?:quiero ser|exijo ser|tengo (?:que )?ser|pido ser|yo soy|seré|sere|me pido|mi profesion(?: es)?|mi rol(?: es)?|quiero el rol de|voy a ser)\s*:?\s*(.+)/)
    || sinAcentos(t).match(/(?:^|\s)soy\s+((?:un|una|el|la)\s+.+)/)
    || sinAcentos(t).match(/^\s*(?:un|una)\s+(.+)$/);
  if (!m) return null;
  // la frase del rol: hasta una coma/punto, máx. 5 palabras y 32 caracteres, sin artículo inicial
  const ini = sinAcentos(t).indexOf(m[1]);
  let frase = t.slice(ini, ini + m[1].length).split(/[,.;!?¿¡()]/)[0].trim().replace(/^(el|la|los|las|un|una)\s+(?!que\s)/i, '') // «la que cobra» conserva el artículo
    .split(/\s+(?:o|u|con|porque|pero|plis+|pls+)\b/i)[0]                     // «gato negro o naranja» → «gato negro»
    .replace(/\s+(?:(?:[jh][aeiou]){2,}\w*|mue\w*|xd+|lol)$/i, '').trim();      // sin risas al final («muejeje», «jajaja»)
  frase = frase.split(/\s+/).slice(0, 5).reduce((acc, w) => (acc.length + w.length + 1 > 34 ? acc : (acc ? acc + ' ' : '') + w), '').trim() // palabras enteras, máx. ~34
    .replace(/(\s+(y|e|o|de|del|la|el|los|las|en|con|a|al|que|para|por))+$/i, ''); // sin conectores colgando
  frase = frase.replace(/([a-zñáéíóú])\1{2,}/gi, '$1'); // «Futbolistaaaa» → «Futbolista»
  if (!/^(el|la|los|las)\s+que\b/i.test(frase)) frase = frase.replace(/\s+que(?:\s+\S+)?$/i, ''); // «vagabundo que vive» → «vagabundo»
  if (frase.length < 3) return null;
  const f = sinAcentos(frase);
  const w0 = f.split(/\s+/)[0]; const sing = w0.replace(/(es|s)$/, '');
  if (formaDe(frase)) return { oficio: 'animal', titulo: frase.charAt(0).toUpperCase() + frase.slice(1) };
  const oficio = (SINONIMOS.find(([re]) => re.test(f)) || [null, 'libre'])[1];
  return { oficio, titulo: frase.charAt(0).toUpperCase() + frase.slice(1) };
}

export const PASATIEMPOS = [
  { id: 'nadar', texto: 'nadar en el mar', lugar: 'playa', anim: 'nadar' },
  { id: 'conchas', texto: 'coleccionar conchas', lugar: 'playa', anim: 'recoger' },
  { id: 'leer', texto: 'leer bajo un árbol', lugar: 'bosque', anim: 'leer' },
  { id: 'explorar', texto: 'explorar el bosque', lugar: 'bosque' },
  { id: 'mano', texto: 'mirar la mano de piedra', lugar: 'mano', anim: 'mirar' },
  { id: 'piedras', texto: 'tirar piedras al río', lugar: 'rio', anim: 'lanzar' },
  { id: 'chisme', texto: 'chismear en la plaza', lugar: 'plaza', anim: 'charlar' },
  { id: 'guitarra', texto: 'tocar la guitarra', lugar: 'plaza', anim: 'musica' },
  { id: 'atardecer', texto: 'ver el atardecer desde la colina', lugar: 'colina', anim: 'mirar' },
  { id: 'correr', texto: 'correr por la playa', lugar: 'playa' },
  { id: 'jardin', texto: 'cuidar su jardín', lugar: 'casa', anim: 'recoger' },
  { id: 'siesta', texto: 'dormir la siesta en el portal', lugar: 'casa', anim: 'sentarse' },
];

// Personalidad: horario, ganas de socializar y de trabajar, ritmo al caminar y cómo habla (charla 💭 Isla)
export const RASGOS = [
  { id: 'madrugador', texto: 'madrugador/a', despierta: 5.5, duerme: 21, paso: 1.1, frases: ['llevo despierto desde las 5. sí, por gusto', 'el amanecer aquí es gratis, aprovéchenlo'] },
  { id: 'dormilon', texto: 'dormilón/a', despierta: 9, duerme: 23.5, paso: 0.85, frases: ['¿ya es de día? no me consultaron', 'cinco minutitos más'] },
  { id: 'chismoso', texto: 'chismoso/a', despierta: 7, duerme: 22, social: 1.6, frases: ['no es por chismear pero…', '¿supieron lo de la casa de la esquina?'] },
  { id: 'timido', texto: 'tímido/a', despierta: 7, duerme: 21.5, social: 0.4, paso: 0.9, frases: ['hola… (perdón)', 'yo solo miraba'] },
  { id: 'aventurero', texto: 'aventurero/a', despierta: 6.5, duerme: 22.5, paso: 1.2, frases: ['hoy cruzo el río otra vez, por deporte', 'algún día subo a esa mano de piedra'] },
  { id: 'trabajador', texto: 'trabajador/a', despierta: 6, duerme: 22, trabajo: 1.3, frases: ['el trabajo no se hace solo', 'pausa de 3 minutos y sigo'] },
  { id: 'vago', texto: 'vago/a', despierta: 8.5, duerme: 22, trabajo: 0.6, paso: 0.8, frases: ['trabajar cansa, lo he leído', 'hoy rindo al 40 %, como siempre'] },
  { id: 'curioso', texto: 'curioso/a', despierta: 7, duerme: 22.5, frases: ['¿y si el orbe es un router?', 'tengo tres teorías nuevas'] },
  { id: 'bromista', texto: 'bromista', despierta: 7.5, duerme: 23, social: 1.3, frases: ['le cambié el cartel al puente, nadie se dio cuenta', 'jajaja perdón, me acordé de algo'] },
  { id: 'grunon', texto: 'gruñón/a', despierta: 6.5, duerme: 21, social: 0.6, frases: ['demasiada gente en esta isla', 'en mis tiempos esto era solo arena'] },
  { id: 'romantico', texto: 'romántico/a', despierta: 8, duerme: 23.5, social: 1.2, frases: ['qué atardecer… si alguien quiere mirarlo conmigo', 'escribí un poema al río'] },
  { id: 'dramatico', texto: 'dramático/a', despierta: 8, duerme: 23, social: 1.4, frases: ['ESTO ES LO PEOR QUE ME HA PASADO (perdí una chancla)', 'nadie entiende mi dolor'] },
  { id: 'filosofo', texto: 'filósofo/a', despierta: 7, duerme: 23.5, social: 0.8, paso: 0.85, frases: ['¿somos habitantes o seguidores?', 'si nadie vota, ¿la isla existe?'] },
  { id: 'fiestero', texto: 'fiestero/a', despierta: 10, duerme: 23.9, social: 1.8, paso: 1.1, frases: ['¿hay fiesta en la plaza o la armo yo?', 'mañana descanso (mentira)'] },
  { id: 'competitivo', texto: 'competitivo/a', despierta: 6, duerme: 22, trabajo: 1.2, paso: 1.25, frases: ['llegué primero a la plaza, gané', 'mi casa crece antes que la tuya'] },
  { id: 'conspiranoico', texto: 'conspiranoico/a', despierta: 7, duerme: 23.5, social: 0.9, frases: ['la mano de piedra nos escucha', 'Gambito sabe más de lo que dice'] },
  { id: 'optimista', texto: 'optimista', despierta: 6.5, duerme: 22, social: 1.2, frases: ['hoy va a ser un gran día en la isla', 'pronto seremos mil, lo presiento'] },
  { id: 'tacano', texto: 'tacaño/a', despierta: 6.5, duerme: 21.5, trabajo: 1.1, frases: ['ahorrando cada moneda 🪙', '¿gratis? entonces voy'] },
];

function h32(s, salt = 0) { let h = 2166136261 ^ salt; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// Edificios existentes → oficios disponibles
// ---------- Lo que hace cada uno según lo que pidió ser (chistoso, pero coherente con la isla) ----------
// [patrón sobre el título que eligió, { lugar, anim, textos }]: en horario de trabajo hace esto en vez del oficio genérico.
// Los textos rotan por hora, así la charla 💭 y la ficha del habitante no repiten siempre lo mismo.
const GRACIAS = [
  [/gamer|streamer|youtuber|tiktoker/, { lugar: 'plaza', anim: 'sentarse', textos: ['buscando wifi en una isla sin wifi', 'haciendo un stream para las gaviotas', 'jugando a piedra, papel o tijera contra sí mismo'] }],
  [/herrer|soldador|forjador/, { lugar: 'pueblo', anim: 'martillar', textos: ['soldando cosas con mucha ilusión y poco metal', 'buscando hierro entre los cocos', 'forjando la primera herradura de una isla sin caballos'] }],
  [/urbanista/, { lugar: 'plaza', anim: 'escribir', textos: ['planificando calles para un pueblo de árboles', 'midiendo la plaza a pasos', 'dibujando una rotonda que nadie pidió'] }],
  [/director|directora|gerente|jef/, { lugar: 'plaza', anim: 'discurso', textos: ['dirigiendo un hospital que todavía no existe', 'haciendo reuniones de personal con nadie', 'firmando nombramientos en hojas de palmera'] }],
  [/mafia|mafios|capo|padrino/, { lugar: 'plaza', anim: 'tramar', textos: ['cobrando «protección» a puestos que todavía no existen', 'haciendo una oferta que nadie puede rechazar (un coco)', 'susurrándole cosas a una gaviota'] }],
  [/que cobra|cobrador|recaudador|banquer|presta/, { lugar: 'plaza', anim: 'escribir', textos: ['persiguiendo vecinos con una libreta de deudas', 'cobrando intereses por haber dado los buenos días', 'anotando quién le debe un coco'] }],
  [/puente/, { lugar: 'puente', anim: 'vigilar', textos: ['cobrando un peaje imaginario en el puente', 'pidiendo contraseña para cruzar el puente', 'discutiendo con el río por invadir su puente'] }],
  [/loco|lunatic|chiflad/, { lugar: 'colina', anim: 'discurso', textos: ['dando un discurso a los árboles', 'explicándole su plan a una piedra', 'jurando que la mano de piedra le guiñó un ojo'] }],
  [/modelo|influencer|famos|estrella/, { lugar: 'playa', anim: 'mirar', textos: ['posando para cámaras que no existen', 'buscando su mejor ángulo con el atardecer', 'pidiendo otra foto, que en esa salió con los ojos cerrados'] }],
  [/abogad|juez|fiscal|notari/, { lugar: 'plaza', anim: 'discurso', textos: ['demandando a la mano de piedra por ocupar el río', 'defendiendo a un coco acusado de caerse', 'cobrando por consultas que nadie hizo'] }],
  [/mecanic|tecnic|electric|fontaner|plomer/, { lugar: 'pueblo', anim: 'martillar', textos: ['arreglando cosas que nadie le pidió', 'desarmando el puente «para ver cómo funciona»', 'buscando un motor en una isla sin motores'] }],
  [/paloma/, { lugar: 'plaza', anim: 'recoger', textos: ['dando de comer a sus palomas (muy amables, como él)', 'presentándole sus palomas a los vecinos, una por una', 'entrenando palomas mensajeras para repartir chismes'] }],
  [/unico|elegid|especial/, { lugar: 'pueblo', anim: 'vigilar', textos: ['vigilando que nadie construya otro edificio', 'recordándole a todos que es único', 'midiendo las casas ajenas por si acaso'] }],
  [/villan|malvad|maleante|ladron|pirata/, { lugar: 'bosque', anim: 'tramar', textos: ['planeando conquistar la isla con lo que tiene ahorrado', 'riéndose malvadamente a solas en el bosque', 'tramando algo que todavía no sabe qué es'] }],
  [/gobern|alcald|president|\brey\b|reina|dictador|emperad/, { lugar: 'plaza', anim: 'discurso', textos: ['dando un discurso a nadie', 'prometiendo cosas que no puede cumplir (todavía)', 'firmando decretos en hojas de palmera'] }],
  [/payaso|comic|bufon|humorist/, { lugar: 'plaza', anim: 'lanzar', textos: ['haciendo malabares con cocos', 'contando chistes que solo entiende él', 'tropezando a propósito (dice)'] }],
  [/cientific|investigad|inventor|genio/, { lugar: 'mano', anim: 'escribir', textos: ['midiendo la mano de piedra con un palo', 'anotando teorías sobre el orbe que brilla', 'haciendo experimentos con agua de río'] }],
  [/chef|cociner|panader|reposter/, { lugar: 'plaza', anim: 'cocinar', textos: ['cocinando un banquete con un coco y mucha fe', 'probando la sopa de alguien sin permiso', 'inventando la receta del «coco al coco»'] }],
  [/futbol|voley|volei|basquet|tenis|deport|atlet|boxe/, { lugar: 'playa', anim: 'entrenar', textos: ['entrenando para un estadio que no existe', 'jugando un partido contra sí mismo (va perdiendo)', 'calentando desde hace tres horas'] }],
  [/ingenier|arquitect/, { lugar: 'puente', anim: 'escribir', textos: ['diseñando un puente para el puente', 'calculando cuántos cocos aguanta el puente', 'haciendo planos de un taller que no le dejan construir'] }],
  [/indigente|vagabund|mendig|pordiosero/, { lugar: 'playa', anim: 'sentarse', textos: ['«trabajando»: mirando el mar con mucha concentración', 'contando sus monedas por quinta vez', 'durmiendo una siesta laboral'] }],
  [/custodi|guardia|guardian|portero/, { lugar: 'puente', anim: 'vigilar', textos: ['custodiando el puente con mucha seriedad', 'pidiéndoles identificación a las gaviotas'] }],
  [/medic|doctor|enfermer/, { lugar: 'plaza', anim: 'escribir', textos: ['pasando consulta bajo una palmera', 'recetando agua de coco para todo'] }],
  [/granjer|campesin|agricult/, { lugar: 'bosque', anim: 'recoger', textos: ['cultivando una sola zanahoria con mucho cariño', 'hablándoles a sus plantas'] }],
];
// Bichos y cosas: lo que hace cada forma (la forma viene de formaDe)
const GRACIAS_FORMA = {
  mono: { lugar: 'bosque', textos: ['robándoles cocos a los recolectores', 'colgándose de los árboles del bosque', 'imitando a los vecinos (muy bien)'] },
  gato: { lugar: 'plaza', textos: ['tomando el sol en la plaza como si fuera suya', 'tirando cosas de las mesas ajenas', 'ignorando a todos con elegancia'] },
  perro: { lugar: 'playa', textos: ['persiguiendo gaviotas (cero atrapadas)', 'enterrando un hueso en la playa', 'saludando a todo el que pasa'] },
  ave: { lugar: 'playa', textos: ['robándoles comida a los pescadores', 'dando vueltas sobre la playa', 'chismeando desde arriba'] },
  reptil: { lugar: 'playa', textos: ['tomando el sol en la arena sin moverse', 'mirando fijamente a los vecinos', 'asustando a los pescadores'] },
  pez: { lugar: 'playa', textos: ['buscando el mar desde la orilla', 'explicando que tiene patas por un trámite', 'nadando en seco'] },
  fantasma: { lugar: 'mano', textos: ['asustando a los vigías de la mano', 'atravesando paredes ajenas', 'haciendo «buuu» sin mucho éxito'] },
  robot: { lugar: 'pueblo', textos: ['calculando cuántos cocos hay en la isla', 'actualizando su sistema (lleva 3 horas)', 'intentando entender el sarcasmo'] },
  cosa: { lugar: 'pueblo', textos: ['intentando pasar desapercibido', 'paseando con sus patitas nuevas', 'confundiendo a los vecinos'] },
  conejo: { lugar: 'bosque', textos: ['saltando por el bosque sin motivo', 'buscando zanahorias que no existen'] },
  oso: { lugar: 'bosque', textos: ['buscando miel en una isla sin abejas', 'abrazando árboles'] },
  caballo: { lugar: 'playa', textos: ['galopando por la playa a cámara lenta', 'relinchándoles a las olas'] },
  animal: { lugar: 'pueblo', textos: ['paseando por el pueblo', 'olfateándolo todo'] },
};
export function graciaDe(titulo, forma) {
  if (forma) return GRACIAS_FORMA[forma.tipo] || GRACIAS_FORMA.animal;
  const t = sinAcentos(titulo || ''); const g = GRACIAS.find(([re]) => re.test(t)); return g ? g[1] : null;
}

export function vidaDe(resident, state) {
  const existe = new Set((state.buildings || []).map((b) => b.kind));
  const base = { pasatiempo: PASATIEMPOS[h32(resident.handle, 37) % PASATIEMPOS.length], rasgo: RASGOS[h32(resident.handle, 53) % RASGOS.length] };
  if (resident.rol && OFICIOS[resident.rol]) { // lo eligió en los comentarios: es exactamente eso
    const forma = formaDe(resident.rolTexto);
    if (forma) return { vocacion: 'animal', oficio: 'animal', enEspera: false, elegido: true, titulo: resident.rolTexto, forma, lugarTrabajo: 'pueblo', gracia: graciaDe(null, forma), ...base };
    const o = OFICIOS[resident.rol]; const sinEdificio = o.requiere && !existe.has(o.requiere);
    // La profesión solo funciona si existe su lugar de trabajo: mientras tanto conserva su título, pero trabaja en otra cosa
    if (sinEdificio) { const resp = RESPALDO[h32(resident.handle, 23) % RESPALDO.length];
      return { vocacion: resident.rol, oficio: resp, enEspera: true, elegido: true, titulo: resident.rolTexto || o.nombre, sinEdificio: o.requiere, gracia: graciaDe(resident.rolTexto || o.nombre), ...base }; }
    return { vocacion: resident.rol, oficio: resident.rol, enEspera: false, elegido: true, titulo: resident.rolTexto || o.nombre, lugarTrabajo: o.lugar, gracia: graciaDe(resident.rolTexto), ...base };
  }
  const vocacion = VOCACIONES[h32(resident.handle, 11) % VOCACIONES.length];
  const req = OFICIOS[vocacion].requiere;
  const oficio = !req || existe.has(req) ? vocacion : RESPALDO[h32(resident.handle, 23) % RESPALDO.length];
  return {
    vocacion, oficio, enEspera: oficio !== vocacion,
    pasatiempo: PASATIEMPOS[h32(resident.handle, 37) % PASATIEMPOS.length],
    rasgo: RASGOS[h32(resident.handle, 53) % RASGOS.length],
  };
}

// Qué hace a una hora de la isla (0–24). Devuelve { accion, lugar, texto }.
export function actividad(vida, hora, handle = '') {
  const r = vida.rasgo; const o = OFICIOS[vida.oficio];
  const jitter = (h32(handle, 71) % 60) / 60; // cada uno con su ritmo (±1 h)
  const desp = r.despierta + jitter * 0.8, dorm = r.duerme + jitter * 0.6;
  const finTrabajo = 13 + (r.trabajo || 1) * 2 + jitter;
  if (hora < desp || hora >= dorm) {
    // trasnochadores (~3 de cada 10): la isla nunca se queda vacía de noche
    if (h32(handle, 61) % 100 < 30) {
      const NOCHE = [['playa', 'mirando las estrellas en la playa', 'mirar'], ['plaza', 'chismeando a la luz de la luna', 'charlar'], ['mano', 'de guardia nocturna junto al orbe', 'vigilar'],
        ['playa', 'pescando de noche (dice que pican más)', 'pescar'], ['colina', 'contándole secretos a la luna', 'mirar'], ['plaza', 'tocando serenatas a quien no duerme', 'musica']];
      const [lugar, texto, anim] = NOCHE[(h32(handle, 67) + Math.floor(hora / 3)) % NOCHE.length];
      return { accion: 'noche', lugar, texto, anim };
    }
    return { accion: 'dormir', lugar: 'casa', texto: 'durmiendo' };
  }
  if (hora < desp + 0.8) return { accion: 'casa', lugar: 'casa', texto: 'desayunando en el portal', anim: 'sentarse' };
  if (hora < finTrabajo) {
    // lo que pidió ser, a su manera (con gracia: 2 de cada 3 horas de trabajo; los bichos y las cosas, siempre)
    const g = vida.gracia; const hh = Math.floor(hora);
    if (g && (vida.forma || (hh + h32(handle, 13)) % 3 !== 0)) return { accion: 'trabajar', lugar: g.lugar, texto: g.textos[(hh + h32(handle, 17)) % g.textos.length], anim: g.anim };
    return { accion: 'trabajar', lugar: vida.lugarTrabajo || o.lugar, texto: o.verbo, anim: o.anim };
  }
  const socialFin = 20 + (r.social || 1) * 0.6;
  if (hora < 18) return { accion: 'pasatiempo', lugar: vida.pasatiempo.lugar, texto: vida.pasatiempo.texto, anim: vida.pasatiempo.anim };
  if (hora < socialFin) {
    // Al atardecer no va todo el mundo a la plaza: cada uno tiene su costumbre.
    const dado = h32(handle, 91) % 100; const plaza = 28 * (r.social || 1);
    if (dado < plaza) return { accion: 'social', lugar: 'plaza', texto: 'charlando en la plaza', anim: 'charlar' };
    if (dado < plaza + 30) return { accion: 'social', lugar: 'vecino', texto: 'de visita en casa de un vecino', anim: 'charlar' };
    if (dado < plaza + 45) return { accion: 'pasatiempo', lugar: 'playa', texto: 'paseando por la playa al atardecer' };
  }
  // en casa pero a la vista: en la puerta, cada uno a su manera (solo se entra a dormir)
  const PORTAL = [['tomando el fresco en la puerta de su casa', 'sentarse'], ['charlando con quien pasa por su puerta', 'charlar'], ['leyendo en el portal', 'leer'], ['tocando algo en la puerta de casa', 'musica']];
  const BICHO = [['echado en la puerta de su casa', 'sentarse'], ['mirando pasar a los vecinos desde su portal', 'mirar'], ['vigilando su casa como si alguien la quisiera', 'vigilar']];
  const [texto, anim] = (vida.forma ? BICHO : PORTAL)[h32(handle, 29) % (vida.forma ? BICHO : PORTAL).length];
  return { accion: 'casa', lugar: 'casa', texto, anim };
}

// Estadísticas para el narrador (resumen del ciclo)
export function censo(state) {
  const oficios = Object.create(null); let espera = 0; const vocEspera = Object.create(null); // sin prototipo: 'constructor' es un oficio
  for (const r of state.residents) {
    const v = vidaDe(r, state); oficios[v.oficio] = (oficios[v.oficio] || 0) + 1;
    if (v.enEspera) { espera++; vocEspera[v.vocacion] = (vocEspera[v.vocacion] || 0) + 1; }
  }
  return { oficios, espera, vocEspera };
}

// ---------------- Economía y clases sociales ----------------
// Puntos de actividad (comentar, likes recibidos) → rango → multiplica el sueldo del oficio.
// En cada edificio, el habitante más activo de ese oficio es Jefe/a (cobra el doble).
export const RANGOS = [
  { id: 'aprendiz', nombre: 'Aprendiz', min: 0, mult: 1 },
  { id: 'oficial', nombre: 'Oficial', min: 5, mult: 1.4 },
  { id: 'experto', nombre: 'Experto/a', min: 20, mult: 1.9 },
  { id: 'maestro', nombre: 'Maestro/a de su oficio', min: 60, mult: 2.6 },
];
export const CLASES = [
  { id: 'baja', nombre: 'Clase baja', min: 0, escala: 0.85 },
  { id: 'trabajadora', nombre: 'Clase trabajadora', min: 11, escala: 1 },
  { id: 'media', nombre: 'Clase media', min: 20, escala: 1.12 },
  { id: 'alta', nombre: 'Clase alta', min: 35, escala: 1.25 },
  { id: 'elite', nombre: 'Élite', min: 60, escala: 1.4 },
];
export const rangoDe = (pts) => [...RANGOS].reverse().find((r) => pts >= r.min);
export const claseDe = (ingreso) => [...CLASES].reverse().find((c) => ingreso >= c.min);

// Calcula la economía de toda la isla (determinista). Devuelve Map handle → { oficio, rango, jefe, ingreso, clase }.
export function economia(state) {
  const out = new Map(); const porOficio = Object.create(null); // sin prototipo: 'constructor' es un oficio
  for (const r of state.residents) {
    const v = vidaDe(r, state); const pts = r.actividad || 0;
    out.set(r.handle, { vida: v, puntos: pts, rango: rangoDe(pts), jefe: false });
    (porOficio[v.oficio] = porOficio[v.oficio] || []).push(r.handle);
  }
  // Jefes: solo en oficios con edificio, el más activo (desempate: quien llegó antes)
  for (const [of, hs] of Object.entries(porOficio)) {
    if (!OFICIOS[of].requiere || hs.length < 2) continue;
    const best = hs.map((h) => [h, out.get(h).puntos, state.byHandle.get(h).index]).sort((a, b) => b[1] - a[1] || a[2] - b[2])[0];
    if (best[1] > 0) out.get(best[0]).jefe = true;
  }
  for (const [h, e] of out) {
    e.ingreso = Math.round(OFICIOS[e.vida.oficio].sueldo * e.rango.mult * (e.jefe ? 2 : 1));
    e.clase = claseDe(e.ingreso);
  }
  return out;
}
export function resumenClases(eco) {
  const c = Object.fromEntries(CLASES.map((k) => [k.id, 0])); for (const e of eco.values()) c[e.clase.id]++; return c;
}
