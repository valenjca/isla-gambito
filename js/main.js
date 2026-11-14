import { replay, verifyChain, ZONES, zoneName, normalizeHandle, produccionNegocio } from './state.js';
import { World3D } from './world3d.js';
import { startReel } from './reel.js';
import { vidaDe, actividad, OFICIOS, economia, resumenClases, CLASES, RANGOS, COSTO_ROL } from './vida.js';
import { crearCharla } from './charla.js';
import { necesidades } from './necesidades.js';
import { startLiveSound } from './audio.js';
import { riverX, TOWN, MOVIL } from './world3d.js';
import { setupLiveChat } from './chat.js';
import { crearPaneles } from './paneles.js';

let WORLD = null; // escena actual (para saber la hora y qué hace cada habitante)

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const MILESTONES = [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 1000000];

// Archipiélago: Vaeloria (Instagram), Isla TikTok y Isla YouTube, vecinas en el mismo mar. Cada una con su historia.
const qIsla = new URLSearchParams(location.search).get('isla');
export const ISLA = qIsla === 'tiktok' ? 'tiktok' : qIsla === 'youtube' ? 'youtube' : 'ig';
const ISLAS = {
  ig: { id: 'ig', data: 'data/', nombre: 'Vaeloria', plataforma: 'Instagram', emoji: '📸', url: './' },
  tiktok: { id: 'tiktok', data: 'data/tiktok/', nombre: 'Isla TikTok', plataforma: 'TikTok', emoji: '🎵', url: '?isla=tiktok' },
  youtube: { id: 'youtube', data: 'data/youtube/', nombre: 'Isla YouTube', plataforma: 'YouTube', emoji: '▶️', url: '?isla=youtube' },
};
const PROPIA = ISLAS[ISLA];
const DATA = PROPIA.data;
const OTRAS = Object.values(ISLAS).filter((x) => x.id !== ISLA);
async function loadOtras() { // las islas vecinas: cuántos habitantes tienen y cómo se llaman (para el marcador y el horizonte)
  const bust = `?t=${Date.now()}`;
  return Promise.all(OTRAS.map(async (otra) => {
    try {
      const [w, v] = await Promise.all([
        fetch(otra.data + 'world.json' + bust, { cache: 'no-store' }).then((r) => r.json()),
        fetch(otra.data + 'vivo.json' + bust, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      const s = replay(w.events || []); return { ...otra, nombre: s.name || otra.nombre, habitantes: Math.max(v?.seguidores ?? 0, s.residents.length) };
    } catch { return { ...otra, habitantes: 0 }; }
  }));
}

async function loadVivo() {
  try { const r = await fetch(DATA + 'vivo.json?t=' + Date.now(), { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}

async function loadEvents() {
  const res = await fetch(DATA + 'world.json?t=' + Date.now(), { cache: 'no-store' });
  const { events } = await res.json();
  return events;
}

// Población simulada SOLO para previsualizar (no toca el registro real).
function demoEvents(events, n) {
  const syl = ['lu', 'ma', 'ri', 'to', 'ka', 'ne', 'so', 'vi', 'da', 'pe', 'xo', 'ga', 'mi', 'ra', 'zu', 'el'];
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const handles = Array.from({ length: n }, (_, i) => syl[Math.floor(r() * 16)] + syl[Math.floor(r() * 16)] + '_' + (i + 1));
  const last = events[events.length - 1];
  return [...events,
    { seq: events.length, day: last.day + 1, type: 'llegada', title: `Llegan ${n} habitantes (demo)`, text: '', data: { handles } },
    { seq: events.length, day: last.day + 1, type: 'aspecto', title: 'Skin (demo)', text: '', data: { handle: handles[n - 1], look: { hat: 'corona', hair: '#f28fb0', hairStyle: 'largo', shirt: '#8e44ad' } } },
    { seq: events.length + 1, day: last.day + 1, type: 'construccion', title: 'Plaza (demo)', text: '', data: { id: 'd1', kind: 'plaza', label: 'Plaza (demo)' } },
    { seq: events.length + 2, day: last.day + 1, type: 'construccion', title: 'Faro (demo)', text: '', data: { id: 'd2', kind: 'faro', label: 'Faro (demo)' } },
    { seq: events.length + 3, day: last.day + 1, type: 'construccion', title: 'Muelle (demo)', text: '', data: { id: 'd3', kind: 'muelle', label: 'Muelle (demo)' } },
    { seq: events.length + 4, day: last.day + 1, type: 'construccion', title: 'Mercado (demo)', text: '', data: { id: 'd4', kind: 'mercado', label: 'Mercado (demo)' } },
    { seq: events.length + 6, day: last.day + 1, type: 'construccion', title: 'Hospital (demo)', text: '', data: { id: 'd6', kind: 'hospital', label: 'Hospital (demo)' } },
    { seq: events.length + 7, day: last.day + 1, type: 'actividad', title: 'Actividad (demo)', text: '', data: { puntos: Object.fromEntries(handles.map((h) => [h, Math.floor(r() ** 3 * 120)])) } },
    { seq: events.length + 5, day: last.day + 1, type: 'construccion', title: 'Hallazgo (demo)', text: '', data: { id: 'd5', kind: 'hallazgo', label: 'Un cofre lleno de mapas (demo)' } },
    // negocios de prueba: un edificio, un restaurante y un puesto (cobran lo que comparten en dos días)
    ...[1, 2, 3, 4, 5, 6].map((k) => ({ seq: 0, day: last.day + k, type: 'compartido', title: 'Compartieron (demo)', text: '', data: { handles: handles.slice(0, 3) } })),
    { seq: 0, day: last.day + 6, type: 'negocio', title: 'Edificio (demo)', text: '', data: { id: 'n1', handle: handles[0], nombre: 'Torre Demo', rubro: 'edificio', color: '#457b9d' } },
    { seq: 0, day: last.day + 6, type: 'negocio', title: 'Edificio nv2 (demo)', text: '', data: { id: 'n1', handle: handles[0] } },
    { seq: 0, day: last.day + 6, type: 'negocio', title: 'Restaurante (demo)', text: '', data: { id: 'n2', handle: handles[1], nombre: 'Coco Loco', rubro: 'restaurante', color: '#e63946' } },
    { seq: 0, day: last.day + 6, type: 'negocio', title: 'Puesto (demo)', text: '', data: { id: 'n3', handle: handles[2], nombre: 'Conchas Ana', rubro: 'tienda', color: '#2a9d8f' } },
  ];
}

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3200); }

async function boot() {
  const [realEvents, vivo, otras] = await Promise.all([loadEvents(), loadVivo(), loadOtras()]);
  window.__otras = otras;
  window.__vivo = vivo;
  const demo = Number(params.get('demo')) || 0;
  const events = demo ? demoEvents(realEvents, demo) : realEvents;
  const state = replay(events);
  const chain = await verifyChain(realEvents);

  const world = new World3D($('#stage'));
  if (/localhost|127.0.0.1/.test(location.hostname)) window.__world = world; // solo en desarrollo, para pruebas
  world.seguidores = vivo?.seguidores ?? null; // seguidores sin @ conocido → casas en obras
  world.vecinas = otras; world.vecina = otras[0]; world.plataforma = PROPIA; // las islas rivales se ven en el horizonte
  world.esYoutube = ISLA === 'youtube';
  world.build(state);
  window.__isla = world; // depuración desde la consola
  world.setWeather(state.weather);

  const loop = () => { if (!world.manual) world.update(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  setTimeout(() => $('#loading').classList.add('done'), 300);
  setTimeout(() => $('#loading').remove(), 1100);

  if (params.has('reel')) { await startReel(world, state, params); return; }
  if (ISLA !== 'ig') document.querySelectorAll('[data-tab="perfil"],[data-tab="negocios"]').forEach((b) => b.remove()); // cuentas y negocios: por ahora solo en Vaeloria
  if (demo) $('#demoBadge').classList.remove('hidden');

  renderHeader(state, vivo);
  setupClock(world, state);
  setupSearch(world, state);
  setupTabs(world, state, chain, events, vivo);
  const ambient = ambientChat(state, world);
  setupLiveChat({ state, world, ambient }).catch((e) => console.warn('chat', e));
  setupSound(world);
  WORLD = world;
  world.onPick = (sel) => showLive(() => pickCard(state, world, sel));
  const me = params.get('casa') || params.get('yo'); if (me) setTimeout(() => findHouse(world, state, me), 600);
  if (!demo) seguirEnVivo(world, state, realEvents.length, vivo);
}

// Llegadas en vivo: cada 15 s mira si cambió esta isla o las vecinas (nuevos seguidores/casas) y redibuja sin recargar.
function seguirEnVivo(world, state, nEventos, vivo) {
  let ultimo = vivo?.actualizado;
  let ultimoSeg = vivo?.seguidores ?? null;
  let otrasKey = JSON.stringify((window.__otras || []).map((o) => [o.id, o.habitantes, o.nombre]));
  setInterval(async () => {
    const [ev, vv, oo] = await Promise.all([
      loadEvents().catch(() => null),
      loadVivo(),
      loadOtras().catch(() => null),
    ]);
    if (!ev) return;
    const cambioEventos = ev.length !== nEventos;
    const cambioVivo = vv && (vv.actualizado !== ultimo || (vv.seguidores ?? null) !== ultimoSeg);
    const nuevaOtrasKey = oo ? JSON.stringify(oo.map((o) => [o.id, o.habitantes, o.nombre])) : otrasKey;
    const cambioOtras = !!oo && nuevaOtrasKey !== otrasKey;
    if (!cambioEventos && !cambioVivo && !cambioOtras) return;
    const antes = new Set(state.residents.map((r) => r.handle));
    if (cambioEventos) { Object.assign(state, replay(ev)); nEventos = ev.length; }
    if (vv) { window.__vivo = vv; ultimo = vv.actualizado; ultimoSeg = vv.seguidores ?? null; world.seguidores = vv.seguidores ?? null; }
    if (cambioOtras) { window.__otras = oo; otrasKey = nuevaOtrasKey; world.vecinas = oo; world.vecina = oo[0] || null; }
    const cam = world.camera.position.clone(), tg = world.controls.target.clone();
    world.build(state); world.setWeather(state.weather); world.camera.position.copy(cam); world.controls.target.copy(tg);
    renderHeader(state, window.__vivo);
    const nuevos = state.residents.filter((r) => !antes.has(r.handle));
    const buscado = (params.get('casa') || params.get('yo') || cuenta()?.handle || '').replace(/^@/, '').toLowerCase();
    if (nuevos.length) {
      toast(nuevos.length === 1 ? `🏠 @${nuevos[0].handle} acaba de recibir su casa en ${zoneName(state, nuevos[0].zone)}` : `🏠 ${nuevos.length} vecinos nuevos acaban de recibir casa`);
      if (buscado && nuevos.some((r) => r.handle === buscado)) setTimeout(() => findHouse(world, state, buscado), 350);
    } else if (cambioVivo && vv?.seguidores != null) {
      toast(`👥 Contador actualizado: ${vv.seguidores} seguidores`);
    } else if (cambioOtras) {
      toast('🏝️ Se actualizó una isla vecina');
    }
  }, 15000);
}

function renderHeader(s, vivo) {
  $('#worldName').textContent = s.name || (ISLA === 'ig' ? 'Isla sin nombre' : PROPIA.nombre);
  document.title = `${s.name || (ISLA === 'ig' ? 'La Isla' : PROPIA.nombre)} · @gambitoia`;
  // Marcador de la rivalidad: ¿qué isla será la mejor? (enlaces para cruzar a las otras islas)
  const otras = window.__otras; const mia = Math.max(vivo?.seguidores ?? 0, s.residents.length);
  if (otras?.length) {
    let r = $('#rival'); if (!r) { r = document.createElement('div'); r.id = 'rival'; r.className = 'card rival'; $('.counter')?.after(r); }
    const yo = `<span>${PROPIA.emoji} ${esc(s.name || PROPIA.nombre)} <b>${mia}</b></span>`;
    const links = otras.map((o) => `<a href="${o.url}" title="Cruzar a ${esc(o.nombre)}" style="color:inherit;text-decoration:none;font-weight:700">${o.emoji} ${esc(o.nombre)} <b>${o.habitantes}</b></a>`).join(' <i>·</i> ');
    r.innerHTML = `<span class="vs">¿Qué isla será la mejor?</span>${yo} <i>vs</i> ${links}`;
  }
  $('#worldSub').textContent = `Día ${s.day} · ` + (s.name ? 'nombre elegido por sus habitantes' : 'nombre y bandera los decides tú');
  const f = $('#flag');
  if (s.flag) { f.classList.add('set'); f.style.background = `linear-gradient(${s.flag.colors.map((c, i, a) => `${c} ${(i / a.length) * 100}% ${((i + 1) / a.length) * 100}%`).join(',')})`; f.textContent = s.flag.symbol || ''; }
  // Habitantes = seguidores de la cuenta (dato del último ciclo); si no hay dato, las casas de la isla
  const pop = Math.max(vivo?.seguidores ?? 0, s.residents.length); $('#pop').textContent = pop.toLocaleString('es');
  const goal = MILESTONES.find((m) => m > pop) || pop + 1; const prev = [...MILESTONES].reverse().find((m) => m <= pop) || 0;
  $('#goalBar').style.width = `${((pop - prev) / (goal - prev)) * 100}%`;
  $('#goalText').textContent = `Meta: ${goal.toLocaleString('es')} · faltan ${(goal - pop).toLocaleString('es')}`;
}

export const DAY_MS = 6 * 3600 * 1000;
const ANCHOR = Date.UTC(2026, 10, 11, 3, 0); // 00:00 en Chile (UTC-3) → 06:00 en la isla
export function islandMinutes(now) {
  const f = ((((now - ANCHOR) % DAY_MS) + DAY_MS) % DAY_MS) / DAY_MS;
  return (360 + f * 1440) % 1440;
}

function setupClock(world, s) {
  // Hora de la isla EN VIVO: un día completo dura 6 h reales, igual para todos los visitantes.
  // Amanece (06:00 de la isla) a las 00:00, 06:00, 12:00 y 18:00 de Chile, justo cuando corre la actualización.
  const modes = ['vivo', 60, 600, 0]; let si = 0; let auto = true;
  const live = () => { world.time = islandMinutes(Date.now()); };
  world.speed = 0; live();
  setInterval(() => { if (modes[si] === 'vivo') live(); }, 1000);
  const weathers = ['sol', 'nublado', 'lluvia', 'tormenta']; const icons = { sol: '☀️', nublado: '☁️', lluvia: '🌧️', tormenta: '⛈️' };
  const label = () => { const m = modes[si]; $('#speedBtn').textContent = m === 'vivo' ? 'En vivo' : m ? `×${m}` : '⏸'; };
  $('#speedBtn').onclick = () => { si = (si + 1) % modes.length; const m = modes[si]; if (m === 'vivo') { world.speed = 0; live(); } else world.speed = m; label(); };
  label();
  $('#weatherBtn').onclick = () => {
    if (auto) { auto = false; world.setWeather('sol'); } else { const i = weathers.indexOf(world.weather); if (i === weathers.length - 1) { auto = true; world.setWeather(s.weather); } else world.setWeather(weathers[i + 1]); }
    $('#weatherBtn').textContent = `${icons[world.weather]} ${auto ? 'Auto' : ''}`.trim();
  };
  $('#weatherBtn').textContent = `${icons[s.weather]} Auto`;
  setInterval(() => {
    const h = Math.floor(world.time / 60), m = Math.floor(world.time % 60);
    $('#clock').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    $('#timeIcon').textContent = h >= 7 && h < 19 ? '☀️' : h >= 19 && h < 21 ? '🌇' : '🌙';
  }, 250);
}

// Sonido: arranca con el primer gesto del usuario (requisito de los navegadores). Preferencias por visitante.
function setupSound(world) {
  const pref = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v === '1'; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, v ? '1' : '0'); } catch {} };
  let music = pref('isla.music', true), sfx = pref('isla.sfx', true), snd = null;
  const paint = () => { $('#musicBtn').classList.toggle('off', !music); $('#sfxBtn').classList.toggle('off', !sfx); };
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const env = () => {
    const c = world.camera.position, t = world.controls.target; const camDist = c.distanceTo(t);
    const zoom = clamp(1 - camDist / 70);
    const social = world.walkers.length ? world.walkers.filter((w) => w.act?.accion === 'social').length / world.walkers.length : 0;
    return {
      hour: (world.time / 60) % 24, weather: world.weather,
      sea: clamp(0.35 + (Math.hypot(t.x, t.z) / (world.R || 20)) * 0.5 + (1 - zoom) * 0.3),
      river: zoom * clamp(1 - Math.abs(t.x - riverX(t.z)) / 12),
      plaza: zoom * clamp(1 - Math.hypot(t.x - TOWN.x, t.z - TOWN.z) / 14),
      figure: world.figurePos ? zoom * clamp(1 - Math.hypot(t.x - world.figurePos.x, t.z - world.figurePos.z) / 16) : 0,
      social,
    };
  };
  const ensure = () => {
    if (!music && !sfx) { snd?.suspend(); return; }
    if (!snd) {
      snd = startLiveSound(env, { mobile: MOVIL });
      if (snd) { snd.setMusic(music); snd.setSfx(sfx); }
    } else {
      snd.resume();
    }
  };
  const unlock = () => {
    if (!music && !sfx) return;
    ensure();
    if (snd?.ctx?.state === 'running') {
      removeEventListener('touchend', unlock, true);
      removeEventListener('click', unlock, true);
      removeEventListener('keydown', unlock, true);
    }
  };
  addEventListener('touchend', unlock, { capture: true, passive: true });
  addEventListener('click', unlock, { capture: true, passive: true });
  addEventListener('keydown', unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!snd) return;
    if (document.hidden) snd.suspend();
    else if (music || sfx) snd.resume();
  });
  $('#musicBtn').onclick = () => { music = !music; save('isla.music', music); ensure(); snd?.setMusic(music); paint(); };
  $('#sfxBtn').onclick = () => { sfx = !sfx; save('isla.sfx', sfx); ensure(); snd?.setSfx(sfx); paint(); };
  paint();
}

function findHouse(world, s, q) {
  const h = normalizeHandle(q);
  if (!h) return;
  if (world.highlight(h)) { showLive(() => residentCard(s, s.byHandle.get(h))); return; }
  const near = s.residents.filter((r) => r.handle.includes(h)).slice(0, 6);
  if (near.length === 1) return findHouse(world, s, near[0].handle);
  toast(near.length ? `¿Quisiste decir ${near.map((r) => '@' + r.handle).join(', ')}?` : `@${h} aún no vive en la isla. Sigue a @gambitoia y comenta en el último Reel para recibir tu casa.`);
}

function setupSearch(world, s) {
  $('#search').addEventListener('keydown', (e) => { if (e.key === 'Enter') findHouse(world, s, e.target.value); });
}

function ecoHtml(s, r) {
  const e = (WORLD?.eco || economia(s)).get(r.handle); if (!e) return '';
  const sig = RANGOS[RANGOS.indexOf(e.rango) + 1];
  return `<h3>Posición en la sociedad</h3>
    <p>🏅 ${esc(e.rango.nombre)}${e.jefe ? ' · <b>Jefe/a</b>' : ''} · ${e.puntos} puntos de actividad</p>
    <p>🪙 Ingresos: <b>${e.ingreso}</b> por día · ${esc(e.clase.nombre)}</p>
    <p>💰 Ahorros: <b>${r.ahorros || 0} 🪙</b></p>
    ${r.rolPendiente ? `<p>⏳ Aspira a ser <b>${esc(r.rolPendiente.titulo)}</b>: le faltan <b>${Math.max(0, r.rolPendiente.costo - (r.ahorros || 0))} 🪙</b>. Lo será sola/o en cuanto los junte.</p>` : ''}
    <p class="mono">${sig ? `Le faltan ${sig.min - e.puntos} puntos para ${sig.nombre.toLowerCase()}. Se ganan comentando en los Reels (y con likes a sus comentarios).` : 'Rango máximo.'}</p>`;
}

function lifeHtml(s, r) {
  const v = vidaDe(r, s); const o = OFICIOS[v.oficio];
  const hora = WORLD ? (WORLD.time / 60) % 24 : 12;
  const now = WORLD?.activityOf(r.handle) || actividad(v, hora, r.handle);
  // lo que hace de verdad su personaje ahora (si va de camino, se dice)
  const pj = WORLD?.walkers?.find((x) => x.handle === r.handle);
  const LUGAR = { playa: 'la playa', bosque: 'el bosque', plaza: 'la plaza', rio: 'el río', mano: 'la mano de piedra', colina: 'la colina', puente: 'el puente', pueblo: 'el pueblo', casa: 'su casa', vecino: 'casa de un vecino', comercio: 'la Calle del Comercio' };
  const estado = pj?.hidden ? 'durmiendo en su casa' : pj?.target && pj.pos.distanceTo(pj.target) > 2 ? `camino a ${LUGAR[now.lugar] || now.lugar} (${now.texto})` : now.texto;
  return `<h3>Vida en la isla</h3>
    <p>💼 <b>${esc(v.titulo || o.nombre)}</b>${v.elegido ? ' <span class="mono">(lo eligió en los comentarios)</span>' : ''}</p>
    ${v.enEspera ? `<p class="mono">⏳ Aún no hay ${esc(v.sinEdificio || OFICIOS[v.vocacion].requiere)}: mientras se construye trabaja de ${esc(o.nombre.toLowerCase())}.</p>` : ''}
    <p>🎯 Pasatiempo: ${esc(v.pasatiempo.texto)}</p>
    <p>🧠 Personalidad: ${esc(v.rasgo.texto)}</p>
    <p>📍 Ahora mismo: <b>${esc(estado)}</b></p>
    ${ecoHtml(s, r)}`;
}

function residentCard(s, r) {
  const w = WORLD?.walkers?.find((x) => x.handle === r.handle);
  const forma = w?.forma ? ` (es ${esc((r.rolTexto || 'un animal').toLowerCase())})` : '';
  const verPj = !w ? '' : w.hidden ? `<p class="mono">👤 Su personaje${forma} está durmiendo en su casa.</p>`
    : `<p><button class="btn sec" data-personaje="${esc(r.handle)}">👤 Ver su personaje${forma}</button></p>`;
  return `<h2>🏠 @${esc(r.handle)}</h2>${verPj}
    <p>Habitante nº <b>${r.index + 1}</b> · llegó el <b>día ${r.joinedDay}</b></p>
    <p>Vive en <b>${esc(zoneName(s, r.zone))}</b>, parcela ${r.slot + 1}.</p>
    ${lifeHtml(s, r)}
    ${r.history ? `<h3>Mudanzas</h3>${r.history.map((m) => `<p>Día ${m.day}: ${esc(zoneName(s, m.from))} → ${esc(zoneName(s, m.to))}</p>`).join('')}` : ''}
    <p class="mono">Registrado en el evento #${r.joinedSeq} de la historia.</p>`;
}

function openPanel(html) { live = null; $('#panelBody').innerHTML = html; $('#panel').classList.remove('hidden'); if (innerWidth <= 720) $('#chat')?.classList.add('min'); }
// Ficha que se refresca sola cada segundo mientras está abierta (datos en vivo)
let live = null;
function showLive(render) { openPanel(render()); live = render; }
setInterval(() => { if (live && !$('#panel').classList.contains('hidden')) { const sc = $('#panel').scrollTop; $('#panelBody').innerHTML = live(); $('#panel').scrollTop = sc; } }, 1000);

const LUGAR_DE = { taller: 'taller', comisaria: 'comisaria', bomberos: 'bomberos', escuela: 'escuela', mercado: 'mercado', faro: 'faro', muelle: 'muelle', granja: 'granja', ayuntamiento: 'ayuntamiento', fogata: 'fogata', estadio: 'estadio', hospital: 'hospital', plaza: 'plaza' };
function pickCard(s, world, sel) {
  if (sel.type === 'habitante' || sel.type === 'casa') return residentCard(s, s.byHandle.get(sel.handle));
  if (sel.type === 'vecina') { const v = sel.vecina; const mia = Math.max(window.__vivo?.seguidores ?? 0, s.residents.length);
    const va = v.habitantes > mia ? `va ganando por ${v.habitantes - mia}` : v.habitantes < mia ? `va perdiendo por ${mia - v.habitantes}` : 'van empatadas';
    return `<h2>${v.emoji} ${esc(v.nombre)}</h2><p>La isla de los seguidores de <b>${v.plataforma}</b>. Tiene <b>${v.habitantes}</b> habitantes y ${va}.</p>
      <p>Cada isla es de su red: aquí no se mezclan las casas, solo la rivalidad. ¿Qué isla será la mejor?</p>
      <p><a class="btn" href="${v.url}">⛵ Cruzar a ${esc(v.nombre)}</a></p>`; }
  const eco = world.eco; const hora = (world.time / 60) % 24;
  const aqui = (lugar) => world.walkers.filter((w) => !w.hidden && w.act?.lugar === lugar && w.target === null).length;
  const yendo = (lugar) => world.walkers.filter((w) => w.act?.lugar === lugar && w.target).length;
  const reloj = `<p class="mono">Actualizado en vivo · ${String(Math.floor(hora)).padStart(2, '0')}:${String(Math.floor((hora % 1) * 60)).padStart(2, '0')} en la isla</p>`;
  if (sel.type === 'edificio') {
    const b = sel.building; const lugar = LUGAR_DE[b.kind] || b.kind;
    const plantilla = [...eco].filter(([, e]) => OFICIOS[e.vida.oficio].lugar === lugar);
    const jefe = plantilla.find(([, e]) => e.jefe);
    const ev = s.diary.find((d) => d.seq === b.seq);
    const espera = [...eco].filter(([, e]) => e.vida.enEspera && OFICIOS[e.vida.vocacion].requiere === b.kind).length;
    return `<h2>${b.kind === 'hallazgo' ? '🌊' : '🏛️'} ${esc(b.label)}</h2>
      <p>Construido el <b>día ${b.day}</b>${ev ? ` · ${esc(ev.title)}` : ''}.</p>
      ${plantilla.length ? `<h3>Trabajan aquí (${plantilla.length})</h3>
        ${jefe ? `<p>👑 Jefe/a: <b>@${esc(jefe[0])}</b> · ${jefe[1].ingreso} 🪙/día</p>` : ''}
        ${plantilla.slice(0, 8).map(([h, e]) => `<div class="res" data-h="${esc(h)}"><span>@${esc(h)}</span><span class="mono">${esc(e.rango.nombre)} · ${e.ingreso} 🪙</span></div>`).join('')}` : '<p>Aún no trabaja nadie aquí.</p>'}
      <h3>Ahora mismo</h3><p>🧍 ${aqui(lugar)} personas aquí · 🚶 ${yendo(lugar)} de camino</p>
      ${espera ? `<p class="mono">${espera} vecinos llegarán a trabajar aquí cuando abra.</p>` : ''}${reloj}`;
  }
  if (sel.type === 'negocio') { const n = sel.negocio;
    return `<h2>🏪 ${esc(n.nombre)}</h2><p>De <b>@${esc(n.handle)}</b>${n.rubro ? ` · ${esc(n.rubro)}` : ''}</p>
      <p>Nivel <b>${n.nivel}</b> · produce <b>${produccionNegocio(n.nivel)} 🪙/día</b> · abrió el día ${n.desde}</p>
      <p class="mono">¿Quieres el tuyo? Pestaña 🏪 Negocios.</p>${reloj}`; }
  if (sel.type === 'obra') return `<h2>🏗️ Casas en obras</h2><p><b>${sel.n}</b> seguidores nuevos aún no tienen su @ en la lista de la isla: sus casas ya se están levantando y se terminan en la próxima actualización (cada 6 h).</p>`;
  // lugares fijos de la isla
  if (sel.id === 'mano') {
    const vigias = [...eco].filter(([, e]) => e.vida.oficio === 'vigia').length;
    return `<h2>🔮 La mano de piedra</h2><p>Surge del río sosteniendo un orbe que brilla, más fuerte de noche. Nadie sabe quién la hizo ni qué quiere.</p>
      <p>Gambito tampoco. O eso dice.</p>
      <h3>Ahora mismo</h3><p>👀 ${aqui('mano')} curiosos mirándola · ${vigias} vigías asignados</p>
      <p class="mono">¿Teorías? Déjalas en los comentarios del último Reel.</p>${reloj}`;
  }
  if (sel.id === 'puente') {
    const cruzando = world.walkers.filter((w) => Math.abs(w.pos.z) < 1.3 && Math.abs(w.pos.x - sel.pos.x) < 4).length;
    return `<h2>🌉 Puente del río</h2><p>Único paso entre las dos orillas. De madera, sin barandilla de repuesto y sin seguro.</p>
      <h3>Ahora mismo</h3><p>🚶 ${cruzando} personas cruzando</p>${reloj}`;
  }
  if (sel.id === 'mastil') {
    return `<h2>🏳️ El mástil</h2>${s.flag ? `<p>Ondea la bandera elegida por la comunidad${s.flag.author ? `, propuesta por <b>@${esc(s.flag.author)}</b>` : ''}.</p>` : '<p>Vacío. La bandera la deciden los seguidores: propón colores y símbolo en los comentarios; gana la más likeada.</p>'}
      <h3>Ahora mismo</h3><p>🌅 ${aqui('colina')} personas en la colina</p>${reloj}`;
  }
  return '';
}

function closePanel() { live = null; $('#panel').classList.add('hidden'); document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === 'mapa')); }

function setupTabs(world, s, chain, events, vivo) {
  $('#panelClose').onclick = closePanel;
  // abre (o vuelve a pintar) una pestaña desde código
  const reabrir = (tab) => { const b = document.querySelector(`.tabs button[data-tab="${tab}"]`); if (b) b.click(); else abrirVista(tab); };
  const pan = crearPaneles({ state: s, world, toast, reabrir, findHouse: (h) => findHouse(world, s, h) });
  const despues = { votacion: pan.pintarVotos };
  const views = {
    mapa: () => { closePanel(); world.frame(); return null; },
    habitantes: () => {
      const recent = [...s.residents].reverse().slice(0, 60);
      return `<h2>⭐ Habitantes (${s.residents.length.toLocaleString('es')})</h2>
        ${ZONES.map((z) => `<span class="pill">${esc(zoneName(s, z.id))}: ${s.residents.filter((r) => r.zone === z.id).length}</span>`).join('')}
        <h3>Últimos en llegar</h3>
        ${recent.length ? recent.map((r) => `<div class="res" data-h="${esc(r.handle)}"><span>@${esc(r.handle)}</span><span class="mono">día ${r.joinedDay}</span></div>`).join('') : '<p>Nadie todavía. El primer seguidor de @gambitoia será el habitante nº 1 y quedará en la historia para siempre.</p>'}`;
    },
    perfil: pan.perfil,
    negocios: pan.negocios,
    diario: () => `<h2>📰 Diario de la isla</h2><p><button class="btn sec" data-ir="historia">🔗 Comprobar que la historia no se ha tocado</button></p>${[...s.diary].reverse().map((d) => `<div class="entry"><div class="meta">Día ${d.day} · #${d.seq}</div><b>${esc(d.title)}</b>${d.text ? `<p>${esc(d.text)}</p>` : ''}</div>`).join('')}`,
    votacion: () => {
      const all = Object.values(s.votes).reverse();
      if (!all.length) return '<h2>🗳️ Votación</h2><p>No hay votaciones todavía.</p>' + pan.democracia();
      const when = vivo ? `<p class="mono">Conteo en vivo actualizado: ${new Date(vivo.actualizado).toLocaleString('es')} (cada 6 h)</p>` : '';
      return `<h2>🗳️ Votación</h2>${when}${all.filter((v) => v.mode !== 'sino' || !v.open).slice(0, 12).map((v) => {
        if (v.mode === 'propuestas') {
          const top = (vivo?.propuestas?.[v.id]) || [];
          return `<div class="entry"><div class="meta">Día ${v.day} · ${v.open ? '<span class="ok">ABIERTA · gana el comentario con más likes</span>' : 'cerrada día ' + v.closedDay}</div><b>${esc(v.question)}</b>
            ${v.open ? (top.length ? top.map((p, i) => `<div class="opt">${['🥇', '🥈', '🥉'][i]} «${esc(p.texto)}» <span class="mono">@${esc(p.autor)} · ${p.likes} ❤</span></div>`).join('') : '<p>Aún no hay propuestas. ¡Sé el primero en comentar!</p>')
              : `<div class="opt">🏆 «${esc(v.winner)}»${v.author ? ` <span class="mono">@${esc(v.author)}</span>` : ''}</div>`}</div>`;
        }
        const live = v.open && vivo?.votos?.[v.id];
        const counts = live ? live.counts : Object.fromEntries(v.options.map((o) => [o.id, o.votes]));
        const total = Object.values(counts).reduce((a, n) => a + n, 0) || 1;
        return `<div class="entry"><div class="meta">Día ${v.day} · ${v.open ? '<span class="ok">ABIERTA</span>' : 'cerrada día ' + v.closedDay}</div><b>${esc(v.question)}</b>
          ${v.options.map((o) => `<div class="opt">${esc(o.label)} ${v.winner === o.id ? '🏆' : ''}${(live || !v.open) ? `<div class="bar"><i style="width:${((counts[o.id] || 0) / total) * 100}%"></i></div><span class="mono">${counts[o.id] || 0} votos</span>` : ''}</div>`).join('')}
          ${v.open ? '<p>👇 Vota comentando el color en el último Reel de <b>@gambitoia</b>. Un voto por persona: cuenta el último.</p>' : ''}</div>`;
      }).join('')}${pan.democracia()}`;
    },
    sociedad: () => {
      const eco = WORLD?.eco || economia(s); const k = resumenClases(eco); const tot = s.residents.length || 1;
      const jefes = [...eco].filter(([, e]) => e.jefe);
      const ricos = [...eco].sort((a, b) => b[1].ingreso - a[1].ingreso).slice(0, 5);
      const nec = necesidades(s, eco);
      return `<h2>🏛️ Sociedad</h2>
        <p>Cada habitante tiene un oficio. Su <b>actividad en la cuenta</b> (comentar, likes a sus comentarios) le sube de rango, y el rango sube su sueldo. El sueldo decide su clase… y el tamaño de su casa.</p>
        <h3>Clases sociales</h3>
        ${CLASES.map((c) => `<div class="opt">${esc(c.nombre)} <span class="mono">${k[c.id]}</span><div class="bar"><i style="width:${(k[c.id] / tot) * 100}%"></i></div></div>`).join('')}
        ${jefes.length ? `<h3>Jefes</h3>${jefes.map(([h, e]) => `<div class="res" data-h="${esc(h)}"><span>@${esc(h)}</span><span class="mono">${esc(OFICIOS[e.vida.oficio].nombre)}</span></div>`).join('')}` : ''}
        ${ricos.length ? `<h3>Ingresos más altos</h3>${ricos.map(([h, e]) => `<div class="res" data-h="${esc(h)}"><span>@${esc(h)}</span><span class="mono">${e.ingreso} 🪙 · ${esc(e.clase.nombre)}</span></div>`).join('')}` : ''}
        <h3>Profesiones elegidas</h3>
        ${(() => { const el = s.residents.filter((x) => x.rol); const asp = s.residents.filter((x) => x.rolPendiente);
          return (el.length ? el.map((x) => `<div class="res" data-h="${esc(x.handle)}"><span>@${esc(x.handle)}</span><span class="mono">${esc(x.rolTexto)}</span></div>`).join('') : '<p class="mono">Nadie todavía.</p>')
            + (asp.length ? `<h3>Aspirantes (ahorrando)</h3>${asp.map((x) => `<div class="res" data-h="${esc(x.handle)}"><span>@${esc(x.handle)} → ${esc(x.rolPendiente.titulo)}</span><span class="mono">${x.ahorros || 0}/${x.rolPendiente.costo} 🪙</span></div>`).join('')}` : ''); })()}
        <p class="mono">Comenta «quiero ser …» en el Reel del día. Precios: gratis (vagabundo, artista, músico, oficios sencillos) · ${COSTO_ROL.policia} 🪙 (policía, maestro…) · ${COSTO_ROL.medico} 🪙 (médico, ingeniero, científico) · ${COSTO_ROL.villano} 🪙 (villano, gobernante). Cada día cobras tu sueldo y +10 🪙 si comentaste el día anterior. Comparte el Reel en tu historia mencionando a @gambitoia: +15 🪙 (1 vez al día).</p>
        <h3>Lo que le falta a la isla</h3>
        ${nec.length ? nec.slice(0, 5).map((n) => `<div class="entry"><b>${esc(n.titulo)}</b><p>${esc(n.motivo)}.</p><p class="mono">Gambito: «${esc(n.frase)}»</p></div>`).join('') : '<p>De momento nada. Disfruten la calma, no durará.</p>'}`;
    },
    historia: () => `<h2>🔗 Historia verificable</h2>
      <p>Esta isla nunca se reinicia. Cada acontecimiento queda sellado con una huella SHA-256 que incluye la huella del anterior: cambiar el pasado rompería toda la cadena.</p>
      <p>${chain.ok ? `<span class="ok">✔ Cadena íntegra</span> · ${chain.count} eventos` : `<span class="bad">✖ Cadena rota en el evento ${chain.index}</span>: ${esc(chain.reason)}`}</p>
      <h3>Huella actual</h3><p class="mono">${esc(chain.head || '')}</p>
      <h3>Eslabones</h3>${events.filter((e) => e.hash).slice(-30).reverse().map((e) => `<div class="entry"><div class="meta">#${e.seq} · día ${e.day} · ${e.type}</div><b>${esc(e.title)}</b><div class="mono">prev ${e.prev.slice(0, 16)}… → ${e.hash.slice(0, 16)}…</div></div>`).join('')}
      <p><a href="${DATA}world.json" target="_blank" rel="noopener">Descargar el registro completo</a></p>`,
  };
  function abrirVista(tab) { const html = views[tab]?.(); if (html) { openPanel(html); despues[tab]?.(); } }
  document.querySelectorAll('.tabs button').forEach((b) => {
    b.onclick = () => { document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b)); abrirVista(b.dataset.tab); };
  });
  $('#panelBody').addEventListener('click', (e) => {
    const ir = e.target.closest('[data-ir]'); if (ir) { abrirVista(ir.dataset.ir); return; }
    const pj = e.target.closest('[data-personaje]'); if (pj) { const w = world.walkers.find((x) => x.handle === pj.dataset.personaje); if (w) { world.flyTo(w.pos, 7); world.select({ type: 'habitante', handle: w.handle, walker: w }); } return; }
    const r = e.target.closest('.res[data-h]'); if (r) findHouse(world, s, r.dataset.h);
  });
  addEventListener('isla:junta', () => reabrir('votacion'));
}

// Pestaña 💭 Isla: diálogos registrados (canon) + charla automática generada a partir del estado.
// Siempre corre; solo se pinta cuando la pestaña está abierta (show/hide).
function ambientChat(s, world) {
  const buf = []; let log = null;
  const add = (who, text, sys) => {
    const html = `<div class="m${sys ? ' sys' : ''}">${sys ? esc(text) : `<b>@${esc(who)}</b> ${esc(text)}`}</div>`;
    buf.push(html); if (buf.length > 40) buf.shift();
    if (log) { log.insertAdjacentHTML('beforeend', html); while (log.children.length > 40) log.firstChild.remove(); log.scrollTop = log.scrollHeight; }
  };
  const api = { show(el) { log = el; el.innerHTML = buf.join(''); el.scrollTop = el.scrollHeight; }, hide() { log = null; } };
  const vote = s.openVotes.find((v) => v.mode !== 'propuestas' && v.options?.length);
  const prop = s.openVotes.find((v) => v.mode === 'propuestas');
  const canon = s.dialogues.flatMap((d) => d.lines);
  canon.slice(-8).forEach((l) => add(l.who, l.text));
  if (!s.residents.length) {
    const lines = ['La isla está en silencio. Solo se oyen las olas.', 'Una gaviota sobrevuela la playa vacía.', 'Nadie ha llegado todavía… ¿serás tú el primero?',
      vote ? `Hay una votación pendiente: ${vote.question}` : 'El viento mueve las palmeras.', 'Un mástil sin bandera espera en la colina.'];
    let i = 0; add('', lines[i++], true); setInterval(() => add('', lines[i++ % lines.length], true), 6000); return api;
  }
  const pick = () => s.residents[Math.floor(Math.random() * s.residents.length)].handle;
  const b = s.buildings[s.buildings.length - 1];
  const tpl = [
    () => `¿alguien más acaba de llegar? somos ${s.residents.length} ya`,
    () => (vote ? `yo voto ${vote.options[Math.floor(Math.random() * vote.options.length)].label.split('·')[0].trim()} en "${vote.question}"`
      : prop ? (() => { const top = window.__vivo?.propuestas?.[prop.id]?.[0]; return top ? `va ganando «${top.texto}» en "${prop.question}"… ¿en serio?` : `nadie ha propuesto nada para "${prop.question}" todavía`; })()
      : 'qué tranquilo está todo hoy'),
    () => (s.name ? `me encanta vivir en ${s.name}` : 'todavía no tenemos nombre… propongan en los comentarios'),
    () => (s.flag ? 'la bandera se ve increíble desde mi casa' : 'esa colina necesita una bandera'),
    () => (b ? `nos vemos en ${b.label}` : 'deberíamos construir algo en el centro'),
    () => ({ sol: 'qué sol hace hoy ☀️', nublado: 'parece que va a llover', lluvia: 'me mojé entero 🌧️', tormenta: '¡todos a casa, tormenta!' }[s.weather]),
    () => `hola vecin@ de ${zoneName(s, s.byHandle.get(pick()).zone)} 👋`,
  ];
  // Frases según lo que cada uno está haciendo ahora (oficio, pasatiempo, rasgo)
  const life = (h) => {
    const r = s.byHandle.get(h); const v = vidaDe(r, s); const a = actividad(v, (world.time / 60) % 24, h);
    const o = OFICIOS[v.oficio];
    const opts = {
      trabajar: [`otro día ${o.verbo}… alguien tiene que hacerlo`, `${o.verbo} desde temprano. ¿y el sueldo? buena pregunta`, v.enEspera ? `sigo esperando que construyan ${OFICIOS[v.vocacion].requiere}. mientras tanto, ${o.verbo}` : `soy ${o.nombre.toLowerCase()} y no me arrepiento (casi nunca)`],
      pasatiempo: [`ahora toca ${v.pasatiempo.texto} 😌`, `${v.pasatiempo.texto}: lo único que no se vota en esta isla`],
      social: ['¿alguien en la plaza? traigo cocos', v.rasgo.id === 'chismoso' ? `no le digan a nadie, pero @${pick()} anda raro` : 'qué buena noche para charlar'],
      casa: ['en casa, que afuera hay mucha democracia', 'cenando. no molestar'],
      dormir: ['zzz', 'zzz… (soñando con wifi)'],
    }[a.accion] || ['…'];
    return opts[Math.floor(Math.random() * opts.length)];
  };
  const propia = (h) => { const f = vidaDe(s.byHandle.get(h), s).rasgo.frases || []; return f[Math.floor(Math.random() * f.length)] || life(h); }; // cada personalidad habla a su manera
  // Más variedad (charla.js): frases por rol, por lo que hace ahora, ocurrencias de la isla y diálogos entre vecinos
  const charla = crearCharla(s, world); let ocupado = false;
  const decir = (h, t) => { add(h, t); world.say?.(h, t); }; // también como bocadillo sobre su personaje
  const tick = () => {
    if (ocupado) return; const d = Math.random();
    if (d < 0.35) { // diálogo: las líneas van saliendo de a una
      ocupado = true; const lines = charla.dialogo();
      lines.forEach(([h, t], i) => setTimeout(() => { decir(h, t); if (i === lines.length - 1) ocupado = false; }, i * 2600));
      return;
    }
    const h = pick(); decir(h, d < 0.55 ? charla.monologo(h) : d < 0.7 ? propia(h) : d < 0.85 ? life(h) : tpl[Math.floor(Math.random() * tpl.length)]());
  };
  tick(); setInterval(tick, 4800);
  return api;
}

boot().catch((e) => { console.error(e); $('#loading').innerHTML = `<p>No se pudo cargar la isla: ${esc(e.message)}</p>`; });
