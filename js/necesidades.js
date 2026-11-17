// Necesidades de la isla: reglas deterministas a partir del estado real (población, clima, oficios, clases).
// Gambito las usa para sugerir cosas coherentes ("hace falta un hospital") y proponer la votación.
// Sin dependencias: lo usan la web y tools/ciclo.mjs.
import { censo, economia, resumenClases } from './vida.js';

// Cada regla: cuando(c) → true si hace falta; motivo(c) explica por qué con datos; frase: cómo lo diría Gambito.
const REGLAS = [
  { id: 'plaza', kind: 'plaza', titulo: 'Una plaza', prioridad: 9,
    cuando: (c) => c.pob >= 3, motivo: (c) => `${c.pob} habitantes y ningún sitio donde quedar`,
    frase: 'Somos {pob} y nos saludamos en medio del barro. Propongo una plaza. Revolucionario, lo sé.' },
  { id: 'mercado', kind: 'mercado', titulo: 'Un mercado', prioridad: 6,
    cuando: (c) => c.pob >= 15 || c.espera.comerciante >= 3, motivo: (c) => `${c.espera.comerciante || 0} quieren ser comerciantes y no hay dónde vender`,
    frase: 'Tenemos {esp_comerciante} comerciantes vendiendo cocos a gritos. Un mercado, por favor, por la salud de mis oídos.' },
  { id: 'escuela', kind: 'escuela', titulo: 'Una escuela', prioridad: 7,
    cuando: (c) => c.pob >= 20, motivo: (c) => `${c.pob} habitantes y nadie enseña nada (${c.espera.maestro || 0} maestros sin aula)`,
    frase: 'Hay {esp_maestro} maestros dando clase a las gaviotas. Una escuela no estaría mal.' },
  { id: 'hospital', kind: 'hospital', titulo: 'Un hospital', prioridad: 10,
    cuando: (c) => c.pob >= 30 || (c.tormentas >= 2 && c.pob >= 10), motivo: (c) => `${c.pob} habitantes, ${c.tormentas} tormentas y ni una tirita`,
    frase: '{pob} habitantes, {tormentas} tormentas y ni una tirita. Si alguien se tuerce un tobillo, lo curamos con un coco. Hace falta un hospital.' },
  { id: 'muelle', kind: 'muelle', titulo: 'Un muelle', prioridad: 5,
    cuando: (c) => (c.oficios.pescador || 0) >= 5, motivo: (c) => `${c.oficios.pescador} pescadores pescando desde la arena`,
    frase: '{pescadores} pescadores lanzando la caña desde la arena como si fuera 1400. ¿Un muelle?' },
  { id: 'faro', kind: 'faro', titulo: 'Un faro', prioridad: 4,
    cuando: (c) => c.existe.muelle && (c.tormentas >= 1 || c.pob >= 40), motivo: () => 'hay muelle pero de noche no se ve la costa',
    frase: 'Tenemos muelle pero de noche los barcos se orientan por intuición. Un faro sería un detalle.' },
  { id: 'granja', kind: 'granja', titulo: 'Una granja', prioridad: 5,
    cuando: (c) => (c.oficios.recolector || 0) >= 6, motivo: (c) => `${c.oficios.recolector} recolectores viviendo solo de cocos`,
    frase: '{recolectores} personas comiendo solo cocos. Mi médico imaginario dice que necesitamos una granja.' },
  { id: 'fogata', kind: 'fogata', titulo: 'Una fogata comunal', prioridad: 3,
    cuando: (c) => c.pob >= 8, motivo: () => 'las noches son frías y no hay dónde cocinar',
    frase: 'Por las noches cenamos fruta fría mirando la mano gigante. Una fogata, aunque sea por ambiente.' },
  { id: 'ayuntamiento', kind: 'ayuntamiento', titulo: 'Un ayuntamiento', prioridad: 6,
    cuando: (c) => (c.pob >= 50 && c.nombre) || (c.espera.gobernante || 0) >= 1 || (c.espera.alcalde || 0) >= 1, motivo: (c) => `ya somos ${c.pob} y tenemos nombre, pero nadie firma nada`,
    frase: 'Ya tenemos nombre y {pob} habitantes. Lo siguiente en toda civilización: papeleo. Un ayuntamiento.' },
  // Profesiones elegidas que no pueden ejercer: cada una pide su edificio
  { id: 'taller', kind: 'taller', titulo: 'Un taller', prioridad: 7,
    cuando: (c) => (c.espera.ingeniero || 0) >= 1, motivo: (c) => `${c.espera.ingeniero} ingenieros sin taller (trabajan de otra cosa)`,
    frase: 'Tenemos ingenieros diseñando puentes en la arena con un palito. Un taller, por la dignidad de la ingeniería.' },
  { id: 'comisaria', kind: 'comisaria', titulo: 'Una comisaría', prioridad: 6,
    cuando: (c) => (c.espera.policia || 0) >= 1 || c.pob >= 120, motivo: (c) => `${c.espera.policia || 0} policías sin comisaría`,
    frase: 'Hay policías patrullando sin comisaría. Si detienen a alguien, ¿dónde lo meten? ¿En una palmera?' },
  { id: 'bomberos', kind: 'bomberos', titulo: 'Un cuartel de bomberos', prioridad: 5,
    cuando: (c) => (c.espera.bombero || 0) >= 1 || c.pob >= 150, motivo: (c) => `${c.espera.bombero || 0} bomberos sin cuartel`,
    frase: 'Bomberos sin cuartel. Si algo arde, gritaremos muy fuerte. Ese es el plan.' },
  { id: 'estadio', kind: 'estadio', titulo: 'Un estadio', prioridad: 2,
    cuando: (c) => c.pob >= 200 || (c.espera.deportista || 0) >= 2, motivo: (c) => `${c.pob} habitantes y ningún sitio para gritar a un árbitro`,
    frase: '{pob} habitantes y ningún sitio donde insultar a un árbitro. Eso no es una sociedad, es una biblioteca.' },
];

// Desigualdad: no es un edificio, es un tema para la sátira (y para una votación de impuestos, más adelante).
function social(c) {
  const out = [];
  const total = c.pob || 1;
  if (c.pob >= 10 && c.clases.elite >= 1 && c.clases.baja / total > 0.4)
    out.push({ id: 'desigualdad', tipo: 'social', titulo: 'Desigualdad', motivo: `${c.clases.elite} en la élite y ${c.clases.baja} en clase baja`,
      frase: `Ya tenemos élite: ${c.clases.elite}. Y ${c.clases.baja} en clase baja. Qué rápido aprendimos a ser una sociedad de verdad.` });
  const paro = Object.values(c.espera).reduce((a, n) => a + n, 0);
  if (paro >= 5) out.push({ id: 'vocaciones', tipo: 'social', titulo: 'Vocaciones frustradas', motivo: `${paro} trabajan en algo que no es lo suyo`,
    frase: `${paro} vecinos trabajan de lo que no les gusta porque falta su edificio. Bienvenidos al mundo real.` });
  return out;
}

const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

export function necesidades(state, eco = economia(state)) {
  const k = censo(state); const existe = Object.fromEntries((state.buildings || []).map((b) => [b.kind, true]));
  const c = {
    pob: state.residents.length, nombre: !!state.name, existe,
    oficios: k.oficios, espera: k.vocEspera, clases: resumenClases(eco),
    tormentas: state.diary.filter((d) => d.type === 'clima' && /tormenta/i.test(d.title)).length,
  };
  const fill = (t) => t.replaceAll('{pob}', c.pob).replaceAll('{tormentas}', c.tormentas)
    .replaceAll('{esp_comerciante}', c.espera.comerciante || 0).replaceAll('{esp_maestro}', c.espera.maestro || 0)
    .replaceAll('{pescadores}', c.oficios.pescador || 0).replaceAll('{recolectores}', c.oficios.recolector || 0);
  const edificios = REGLAS.filter((r) => !existe[r.kind] && r.cuando(c))
    .sort((a, b) => b.prioridad - a.prioridad)
    .map((r) => ({ id: r.id, tipo: 'edificio', kind: r.kind, titulo: r.titulo, motivo: r.motivo(c), frase: fill(r.frase),
      votacion: `node tools/mundo.mjs votacion ${r.id} "¿Construimos ${r.titulo.toLowerCase()}?" "verde:🟢 Sí, ${r.titulo.toLowerCase()}" "rojo:🔴 No, que siga el caos" --efectos "verde=construir:${r.kind}:${cap(r.titulo.replace(/^Una? /, ''))}"` }));
  return [...edificios, ...social(c)];
}
