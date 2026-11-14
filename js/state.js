// Estado del mundo = reproducción de un registro de eventos encadenado por hashes.
// Este módulo funciona igual en el navegador y en Node (usa globalThis.crypto.subtle).
// Nada se reinicia: el mundo de hoy es exactamente lo que resulta de todos los eventos desde el día 1.

import { economia, COSTO_ROL } from './vida.js';

export const GENESIS = '0'.repeat(64);
export const PAGA_PARTICIPAR = 10; // 🪙 extra por haber comentado el día anterior
export const PAGA_COMPARTIR = 15; // 🪙 por compartir el Reel en su historia mencionando a la cuenta (1 vez al día)
// Precios de la vida pública (monedas 🪙 ahorradas). La Junta vecinal cuesta 3 veces menos que la Democracia.
export const COSTO_DEMOCRACIA = 60, COSTO_JUNTA = 20;
// Emprendimientos: abrir = 60, cada nivel siguiente cuesta el doble; producen (1 + nivel) 🪙 al día (2, 3, 4…)
export const costoNegocio = (nivel) => 30 * 2 ** (nivel - 1);
export const produccionNegocio = (nivel) => 1 + nivel;
// Personalizar el avatar con monedas
export const TIENDA = {
  hat: { gorra: 4, sombrero: 6, gorro: 4, corona: 50, null: 0 },
  hairStyle: { corto: 2, largo: 2, 'moño': 2, calvo: 2, punk: 10 },
  color: 3, // cambiar color de pelo, camiseta o pantalón
};

// Las zonas solo tienen punto cardinal: su nombre lo ponen los seguidores (efecto nameZone de una votación).
export const ZONES = [
  { id: 'norte', name: 'Zona Norte' },
  { id: 'noreste', name: 'Zona Noreste' },
  { id: 'sureste', name: 'Zona Sureste' },
  { id: 'sur', name: 'Zona Sur' },
  { id: 'suroeste', name: 'Zona Suroeste' },
  { id: 'noroeste', name: 'Zona Noroeste' },
];

export const EVENT_TYPES = [
  'fundacion', 'llegada', 'suceso', 'construccion', 'votacion_abierta',
  'votacion_cerrada', 'mudanza', 'clima', 'dialogo', 'aspecto', 'actividad', 'rol', 'negocio', 'gasto', 'compartido',
];

// JSON con claves ordenadas: la misma entrada produce siempre el mismo texto y el mismo hash.
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort()
      .filter((k) => v[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

export async function sha256(text) {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashEvent(event) {
  const { hash, ...body } = event; // eslint-disable-line no-unused-vars
  return sha256(canonical(body));
}

export async function verifyChain(events) {
  let prev = GENESIS;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.seq !== i) return { ok: false, index: i, reason: `secuencia rota (esperado ${i}, hay ${e.seq})` };
    if (e.prev !== prev) return { ok: false, index: i, reason: 'el enlace con el evento anterior no coincide' };
    const h = await hashEvent(e);
    if (h !== e.hash) return { ok: false, index: i, reason: 'el contenido del evento fue alterado' };
    if (i > 0 && e.day < events[i - 1].day) return { ok: false, index: i, reason: 'el día retrocede' };
    prev = h;
  }
  return { ok: true, head: prev, count: events.length };
}

export function normalizeHandle(h) {
  return String(h).trim().replace(/^@/, '').toLowerCase();
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Reproduce todos los eventos y devuelve el estado actual del mundo.
export function replay(events) {
  const s = {
    name: null,        // lo deciden los seguidores
    flag: null,        // { colors: [...], symbol, author } — la deciden los seguidores
    zoneNames: {},     // nombres de zona elegidos por los seguidores
    account: '',
    day: 0,
    residents: [],
    byHandle: new Map(),
    buildings: [],
    votes: {},
    openVotes: [],
    weather: 'sol',
    diary: [],
    dialogues: [],
    zoneCounts: Object.fromEntries(ZONES.map((z) => [z.id, 0])),
    ascensos: [],   // aspirantes que juntaron el dinero y ya son lo que pidieron
    negocios: [],   // emprendimientos de los habitantes (Calle del Comercio)
    gastos: [],     // monedas gastadas (negocios, Democracia, juntas, aspecto) — todo queda en la historia
  };
  // Cobra monedas a un habitante; si no le alcanzan, la operación no ocurre (devuelve false)
  const cobrar = (handle, costo, motivo, e) => {
    const r = s.byHandle.get(normalizeHandle(handle || '')); costo = Math.max(0, Math.round(Number(costo || 0)));
    if (!r || (r.ahorros || 0) < costo) return false;
    r.ahorros = (r.ahorros || 0) - costo; if (costo) s.gastos.push({ day: e.day, seq: e.seq, handle: r.handle, costo, motivo }); return r;
  };

  const addBuilding = (b, e) => {
    if (s.buildings.some((x) => x.id === b.id)) return;
    s.buildings.push({ id: b.id, kind: b.kind, label: b.label || b.kind, day: e.day, seq: e.seq });
  };

  const pagarDia = (dia) => {
    if (!s.residents.length) return;
    const eco = economia(s);
    for (const r of s.residents) {
      // sueldo del día + paga por participar (+10 🪙 si comentó el día anterior): engancha a volver cada día
      r.ahorros = (r.ahorros || 0) + (eco.get(r.handle)?.ingreso || 0) + (r.ultimoDiaActivo === dia - 1 ? PAGA_PARTICIPAR : 0);
      for (const n of s.negocios) if (n.handle === r.handle) { r.ahorros += produccionNegocio(n.nivel); n.producido = (n.producido || 0) + produccionNegocio(n.nivel); } // lo que produce su negocio
      const p = r.rolPendiente;
      if (p) p.costo = Math.min(p.costo, COSTO_ROL[p.oficio] ?? p.costo); // si bajan los precios, el aspirante paga el vigente
      if (p && r.ahorros >= p.costo) { r.ahorros -= p.costo; r.rol = p.oficio; r.rolTexto = p.titulo; r.rolDia = dia; delete r.rolPendiente; s.ascensos.push({ day: dia, handle: r.handle, titulo: p.titulo }); }
    }
  };
  for (const e of events) {
    if (s.day && e.day > s.day) for (let d = s.day + 1; d <= e.day; d++) pagarDia(d); // cobran el sueldo de cada día que pasa
    s.day = Math.max(s.day, e.day);
    const d = e.data || {};
    switch (e.type) {
      case 'fundacion':
        if (d.account) s.account = d.account;
        break;
      case 'llegada':
        for (const raw of d.handles || []) {
          const handle = normalizeHandle(raw);
          if (!handle || s.byHandle.has(handle)) continue;
          // Zona inicial determinista: repartida para que la isla crezca pareja.
          const zone = d.zone || ZONES[s.residents.length % ZONES.length].id;
          const r = {
            handle, joinedDay: e.day, joinedSeq: e.seq, zone,
            slot: s.zoneCounts[zone]++,
            color: hashStr(handle),
            index: s.residents.length,
          };
          s.residents.push(r);
          s.byHandle.set(handle, r);
        }
        break;
      case 'mudanza': {
        const r = s.byHandle.get(normalizeHandle(d.handle));
        if (r && ZONES.some((z) => z.id === d.to) && r.zone !== d.to) {
          r.history = [...(r.history || []), { from: r.zone, to: d.to, day: e.day }];
          r.zone = d.to;
          r.slot = s.zoneCounts[d.to]++; // su parcela anterior queda libre (no se reasigna: la historia queda visible)
        }
        break;
      }
      case 'rol': { // profesión elegida en comentarios («quiero ser…»): si le alcanzan los ahorros, lo es; si no, aspira
        const r = s.byHandle.get(normalizeHandle(d.handle));
        if (r) {
          const costo = Math.min(Number(d.costo || 0), COSTO_ROL[d.oficio] ?? Infinity); // precio vigente si bajó
          if ((r.ahorros || 0) >= costo) { r.ahorros = (r.ahorros || 0) - costo; r.rol = d.oficio; r.rolTexto = d.titulo; r.rolDia = e.day; delete r.rolPendiente; }
          else r.rolPendiente = { oficio: d.oficio, titulo: d.titulo, costo, desde: e.day };
        }
        break;
      }
      case 'actividad': { // puntos por participar en la cuenta (comentarios, likes recibidos)
        for (const [h, n] of Object.entries(d.puntos || {})) { const r = s.byHandle.get(normalizeHandle(h)); if (r) { r.actividad = (r.actividad || 0) + Number(n || 0); r.ultimoDiaActivo = e.day; } }
        break;
      }
      case 'compartido': { // compartió el Reel en su historia (con mención): +15 🪙 y +3 de actividad, una vez por día
        for (const raw of d.handles || []) {
          const r = s.byHandle.get(normalizeHandle(raw)); if (!r || r.ultimoCompartido === e.day) continue;
          r.ahorros = (r.ahorros || 0) + PAGA_COMPARTIR; r.actividad = (r.actividad || 0) + 3; r.ultimoDiaActivo = e.day;
          r.ultimoCompartido = e.day; r.compartidos = (r.compartidos || 0) + 1;
        }
        break;
      }
      case 'aspecto': { // personalizar el avatar (si tiene costo, se paga con ahorros)
        const r = d.costo ? cobrar(d.handle, d.costo, 'aspecto', e) : s.byHandle.get(normalizeHandle(d.handle));
        if (r) r.look = { ...(r.look || {}), ...(d.look || {}) };
        break;
      }
      case 'negocio': { // abrir (nivel 1) o subir de nivel un emprendimiento; cada nivel cuesta más
        const h = normalizeHandle(d.handle || ''); const n = s.negocios.find((x) => x.id === d.id);
        const nivel = n ? n.nivel + 1 : 1; const costo = costoNegocio(nivel);
        if (n && n.handle !== h) break;
        if (!cobrar(h, costo, n ? `negocio «${n.nombre}» nivel ${nivel}` : `abre «${d.nombre}»`, e)) break;
        if (n) { n.nivel = nivel; if (d.nombre) n.nombre = d.nombre; if (d.color) n.color = d.color; }
        else s.negocios.push({ id: d.id, handle: h, nombre: d.nombre || 'Negocio', color: d.color || '#e76f51', rubro: d.rubro || '', nivel: 1, desde: e.day });
        break;
      }
      case 'gasto': cobrar(d.handle, d.costo, d.motivo || 'gasto', e); break;
      case 'construccion':
        addBuilding(d, e);
        break;
      case 'votacion_abierta':
        // Democracia (global) y Junta vecinal (su zona): las abre un habitante pagando monedas
        if (d.autor && d.costo && !cobrar(d.autor, d.costo, d.ambito?.startsWith('zona:') ? 'junta vecinal' : 'Democracia', e)) break;
        s.votes[d.id] = { autor: d.autor ? normalizeHandle(d.autor) : null, ambito: d.ambito || 'global', propuesta: d.propuesta || null,
          id: d.id, question: d.question, day: e.day, open: true, mode: d.mode || 'opciones', effect: d.effect, optionEffects: d.optionEffects || {},
          options: (d.options || []).map((o) => ({ ...o, votes: 0 })),
        };
        break;
      case 'votacion_cerrada': {
        const v = s.votes[d.id];
        if (!v) break;
        v.open = false;
        v.closedDay = e.day;
        v.winner = d.winner;
        v.author = d.author;
        for (const o of v.options) o.votes = (d.counts || {})[o.id] || 0;
        const fx = d.effect || {};
        if (fx.rename) s.name = fx.rename;
        if (fx.flag) s.flag = fx.flag;
        if (fx.nameZone) s.zoneNames[fx.nameZone.id] = fx.nameZone.name;
        if (fx.build) addBuilding(fx.build, e);
        if (fx.weather) s.weather = fx.weather;
        break;
      }
      case 'clima':
        s.weather = d.weather || s.weather;
        break;
      case 'dialogo':
        s.dialogues.push({ day: e.day, lines: d.lines || [] });
        break;
      default:
        break;
    }
    s.diary.push({ seq: e.seq, day: e.day, type: e.type, title: e.title, text: e.text, hash: e.hash });
  }
  s.openVotes = Object.values(s.votes).filter((v) => v.open);
  return s;
}

export function zoneName(state, id) {
  return state.zoneNames[id] || ZONES.find((z) => z.id === id)?.name || id;
}

export async function makeEvent(events, { day, type, title, text, data }) {
  if (!EVENT_TYPES.includes(type)) throw new Error(`Tipo de evento desconocido: ${type}`);
  const last = events[events.length - 1];
  const dayNum = day ?? (last ? last.day : 1);
  if (last && dayNum < last.day) throw new Error(`El día ${dayNum} es anterior al último evento (día ${last.day}). La historia no retrocede.`);
  const body = {
    seq: events.length,
    day: dayNum,
    type,
    title: title || '',
    text: text || '',
    data: data || {},
    at: new Date().toISOString(),
    prev: last ? last.hash : GENESIS,
  };
  return { ...body, hash: await sha256(canonical(body)) };
}
