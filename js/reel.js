// Modo Reel: render vertical 1080×1920 con textos y subtítulos quemados en el vídeo.
//
// Previsualizar:  index.html?reel=1&toma=vacia&t1=Gancho&t2=Pie&dur=15&hora=7
// Con voz:        index.html?reel=1&voz=dia1&tomas=vacia,bandera,playa,panoramica,playa,playa
//                 (lee reels/render/dia1/voz.json que genera tts/voz.py: un plano por frase, subtítulos sincronizados)
// Renderizar:     añade &captura=1  → renderiza a 30 fps exactos, fotograma a fotograma, y los envía al servidor local;
//                 después `node tools/render-reel.mjs dia1` une imágenes + voz en reels/render/dia1.mp4
import * as THREE from 'three';
import { renderSoundtrack } from './audio.js';

const W = 1080, H = 1920, FPS = 30;
const BUILDINGS = ['hospital', 'estadio', 'posada', 'plaza', 'faro', 'muelle', 'granja', 'ayuntamiento', 'alcaldia', 'mercado', 'taller', 'bomberos', 'comisaria', 'escuela', 'armeria', 'cafeteria'];
const SHOTS = ['vacia', 'panoramica', 'amanecer', 'llegada', 'bandera', 'playa', 'figura', 'pueblo', 'persona', 'casa', 'comercio', 'rival', 'edificio', ...BUILDINGS];

export async function startReel(world, state, params) {
  document.body.classList.add('reel');
  world.fixedSize = [W, H]; world.renderer.setPixelRatio(1); world.resize();
  world.manual = true; // el bucle de main.js deja de avanzar la escena: la controla el Reel

  const out = document.createElement('canvas'); out.id = 'reelCanvas'; out.width = W; out.height = H;
  document.querySelector('#stage').appendChild(out);
  const ctx = out.getContext('2d');
  await Promise.race([
    document.fonts.load("800 92px 'Baloo 2'"),
    new Promise((r) => setTimeout(r, 500)),
  ]).catch(() => {});

  const vote = state.openVotes[0];
  const vozName = params.get('voz');
  let voz = null;
  if (vozName) {
    try { voz = await (await fetch(`/__render/${encodeURIComponent(vozName)}/voz.json`, { cache: 'no-store' })).json(); }
    catch { console.warn('No se encontró la voz', vozName); }
  }
  const cfg = {
    toma: params.get('toma') || 'panoramica',
    // cada toma puede llevar su propio foco: «persona@usuario», «casa@usuario», «edificio@hospital», etc.
    tomas: (params.get('tomas') || '').split(',').map((t) => t.trim()).filter(Boolean),
    foco: params.get('foco') || (state.residents.at(-1)?.handle ?? ''),
    focoBase: params.get('foco') || (state.residents.at(-1)?.handle ?? ''),
    t1: params.get('t1') ?? (state.residents.length ? `DÍA ${state.day}` : `POBLACIÓN: 0`),
    // rótulos=uno por frase separados por | (vacío = se mantiene el gancho t1). Refuerzan lo que dice el narrador.
    rotulos: (params.get('rotulos') || '').split('|'),
    t2: params.get('t2') ?? (vote ? vote.question : 'Comenta y te doy casa'),
    dur: voz ? voz.duracion + 0.8 : Number(params.get('dur')) || 15,
    hora: params.get('hora') ? Number(params.get('hora')) : 7,
    horaFin: params.get('horafin') ? Number(params.get('horafin')) : null,
  };

  // Segmentos: con voz, un plano por frase garantizando coherencia 1:1; sin voz, una sola toma.
  const segs = voz
    ? voz.lineas.map((l, i) => {
        const raw = cfg.tomas[i] || cfg.toma;
        const tomaRaw = raw.split('@')[0];
        const foco = raw.split('@')[1] || null;
        return {
          start: i === 0 ? 0 : l.inicio,
          end: i === voz.lineas.length - 1 ? cfg.dur : voz.lineas[i + 1].inicio,
          toma: tomaRaw,
          foco,
          linea: l,
        };
      })
    : [{ start: 0, end: cfg.dur, toma: cfg.toma }];

  // ---------- planos de cámara (k = progreso 0..1 dentro del plano) ----------
  const R = () => world.R; const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const shots = {
    vacia: (k) => { const a = 0.6 + k * 0.6; const d = R() * 3.4 - k * R() * 1.1; return [V(Math.cos(a) * d, 6 + d * 0.32, Math.sin(a) * d), V(0, 1, 0)]; },
    panoramica: (k) => { const a = 0.4 + k * 1.4; const d = R() * 2.4 + 8; return [V(Math.cos(a) * d, d * 0.7 - k * d * 0.2, Math.sin(a) * d), V(0, 1.5, 0)]; },
    amanecer: (k) => { const a = -0.3 + k * 0.5; const d = R() * 2.2 + 8; return [V(Math.cos(a) * d, d * 0.3, Math.sin(a) * d), V(0, 3, 0)]; },
    llegada: (k) => {
      const h = world.houseIndex.get(cfg.foco.replace('@', '').toLowerCase()); const target = h ? h.pos : V(0, 0, 0);
      const e = THREE.MathUtils.smootherstep(Math.min(k / 0.6, 1), 0, 1); const d = THREE.MathUtils.lerp(R() * 2.6 + 16, 9, e); const a = 0.8 + k * 0.9;
      const tgt = V(0, 1.5, 0).lerp(target, e);
      return [tgt.clone().add(V(Math.cos(a) * d, d * 1.05, Math.sin(a) * d)), tgt];
    },
    bandera: (k) => { const f = world.flagPos || V(0, 0, 0); const a = 0.3 + k * 1.2; const d = 12 - k * 5; return [f.clone().add(V(Math.cos(a) * d, 3 + d * 0.35, Math.sin(a) * d)), f.clone().add(V(0, 3.4, 0))]; },
    figura: (k) => { // desde el lado del pueblo (de frente a la palma), el orbe a la vista
      const f = world.figurePos || V(0, 0, 0); const to = V(1.2 - f.x, 0, -f.z).normalize(); const side = V(-to.z, 0, to.x);
      const d = 15 - k * 4; const p = f.clone().addScaledVector(to, d).addScaledVector(side, (k - 0.5) * 6); p.y = 6.5 + k * 1.5;
      return [p, f.clone().add(V(0, 6.2, 0))]; },
    pueblo: (k) => { const a = -0.6 + k * 0.9; const d = 24 - k * 6; return [V(1.2 + Math.cos(a) * d, 10 + d * 0.25, Math.sin(a) * d), V(-2, 2, 0)]; },
    playa: (k) => { // desde el mar, por encima de las copas, mirando la orilla
      const a = Math.PI + 0.35 - k * 0.7; const d = R() * 1.45 + 6; // la playa está al oeste (lado contrario al bosque)
      return [V(Math.cos(a) * d, 5 + k * 1.5, Math.sin(a) * d), V(Math.cos(a - 0.4) * R() * 0.7, 0.8, Math.sin(a - 0.4) * R() * 0.7)];
    },
    urgencias: (k) => {
      const hosp = world.buildingByKind?.['hospital'] || V(0, 1.5, 0);
      const a = -0.4 + k * 0.8;
      return [V(hosp.x + 1.8 + Math.cos(a) * 5.2, hosp.y + 3.2, hosp.z + 3.4 + Math.sin(a) * 5.2), V(hosp.x + 1.8, hosp.y + 1.0, hosp.z + 3.4)];
    },
    ambulancia: (k) => {
      const amb = world.ambulanceObj;
      if (!amb) return shots.urgencias(k);
      const p = amb.position;
      const a = -0.6 + k * 1.1;
      return [V(p.x + Math.cos(a) * 5.5, p.y + 2.8, p.z + Math.sin(a) * 5.5), V(p.x, p.y + 0.7, p.z)];
    },
    tanque: (k) => {
      const p = world.tankPos || V(1.2 + 6.4, 2.0, 1.8);
      const a = -0.5 + k * 0.9;
      return [V(p.x + Math.cos(a) * 4.8, p.y + 2.6, p.z + Math.sin(a) * 4.8), V(p.x, p.y + 0.9, p.z)];
    },
    muralla: (k) => {
      const rad = world.R * 0.84;
      const a = 0.2 + k * 0.7;
      return [V(Math.cos(a) * (rad + 5.5), 6.5, Math.sin(a) * (rad + 5.5)), V(Math.cos(a + 0.25) * rad, 3.2, Math.sin(a + 0.25) * rad)];
    },
    ejercito: (k) => {
      const p = world.campPos || V(-9.5, 2.0, 11.5);
      const a = -0.5 + k * 0.8;
      return [V(p.x + Math.cos(a) * 6.2, p.y + 3.8, p.z + Math.sin(a) * 6.2), V(p.x, p.y + 1.2, p.z)];
    },
    teslas: (k) => {
      const p = world.dronesPos || V(11.5, 4.8, -10.5);
      const a = -0.6 + k * 0.9;
      return [V(p.x + Math.cos(a) * 4.6, p.y + 1.6, p.z + Math.sin(a) * 4.6), V(p.x, p.y, p.z)];
    },
    banderapirata: (k) => {
      const p = world.skullFlagPos || V(7.5, 4.0, -8.5);
      return [V(p.x + 1.6 + (k - 0.5) * 1.4, p.y + 5.7, p.z + 4.4), V(p.x + 1.6, p.y + 5.6, p.z)];
    },
  };
  // persona: sigue al personaje del @foco (gira despacio a su alrededor); si está dentro de casa, mira su casa
  // persona: sigue al @foco. Elige un ángulo con la vista despejada (sin árboles ni casas entre la cámara y el personaje),
  // prefiriendo mirar desde tierra hacia el mar; lo recalcula solo si el personaje se aleja mucho.
  let vista = null;
  const despejado = (p, a) => { for (let t = 0.2; t <= 1; t += 0.1) { const x = p.x + Math.cos(a) * 4.2 * t, z = p.z + Math.sin(a) * 4.2 * t; const o = world.hit?.(x, z, 0.8); if (o && o !== 'agua') return false; } return true; }; // 0,8: las copas son más anchas que el tronco
  shots.persona = (k) => {
    const w = world.walkers?.find((x) => x.handle === cfg.foco.replace('@', '').toLowerCase());
    const p = w ? (w.animal?.position || w.pos) : V(0, 0, 0);
    if (!vista || vista.foco !== cfg.foco || Math.hypot(p.x - vista.x, p.z - vista.z) > 4) {
      const base = Math.atan2(p.z, p.x) + Math.PI; let mejor = null;
      for (const d of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.1, -2.1, 2.6, -2.6, Math.PI]) if (despejado(p, base + d)) { mejor = base + d; break; }
      vista = { foco: cfg.foco, x: p.x, z: p.z, a: mejor ?? base, cenital: mejor === null }; // sin ángulo limpio (bosque cerrado): desde arriba
    }
    const a = vista.a + (k - 0.5) * 0.3;
    if (vista.cenital) return [V(p.x + Math.cos(a) * 1.4, p.y + 7.5, p.z + Math.sin(a) * 1.4), V(p.x, p.y - 0.6, p.z)];
    return [V(p.x + Math.cos(a) * 3.8, p.y + 3.4, p.z + Math.sin(a) * 3.8), V(p.x, p.y - 0.5, p.z)]; // el personaje queda arriba, libre de subtítulos
  };
  // casa: la fachada de la casa del @foco, desde su calle (acercándose despacio)
  shots.casa = (k) => {
    const targetHandle = cfg.foco.replace('@', '').toLowerCase();
    const w = world.walkers?.find((x) => x.handle === targetHandle);
    const hi = world.houseIndex?.get(targetHandle);
    const h = w?.home || hi?.pos;
    if (!h) return shots.panoramica(k);
    const fr = h.face ? V(h.face, 0, 0) : V(-h.x, 0, -h.z).normalize(); const lado = V(-fr.z, 0, fr.x);
    const d = 4.4 - k * 1.1; const p = h.clone().addScaledVector(fr, d).addScaledVector(lado, 1.1 - k * 0.6); p.y = h.y + 1.6;
    return [p, V(h.x, h.y + 0.9, h.z)];
  };
  // comercio: la Calle del Comercio con sus negocios (edificios, restaurantes, puestos)
  shots.comercio = (k) => {
    const ps = [...(world.negocioPos?.values() || [])]; if (!ps.length) return shots.pueblo(k);
    const c = ps.reduce((a, p) => a.add(p), V(0, 0, 0)).multiplyScalar(1 / ps.length); const a = -0.5 + k * 0.6;
    return [V(c.x + 5 + k * 2, c.y + 6.5, c.z + 9 - k * 2), V(c.x, c.y + 0.8, c.z)];
  };
  // rival: vuela cerca de la isla rival en el horizonte mostrando sus edificios, habitantes y avances
  shots.rival = (k) => {
    const v = (cfg.foco && world.vecinaPosMap?.[cfg.foco]) || world.vecinaPos; if (!v) return shots.panoramica(k);
    const a = -0.5 + k * 1.4;
    const d = 34 - k * 8; // se acerca y gira en semicírculo para verla de cerca
    const p = V(v.x + Math.cos(a) * d, 11 - k * 3, v.z + Math.sin(a) * d);
    return [p, V(v.x, 3.8, v.z)];
  };
  // edificio: vista cinematográfica de cualquier edificio o infraestructura
  shots.edificio = (k, targetKind) => {
    const kind = (targetKind || cfg.foco || '').toLowerCase();
    const p = world.buildingByKind?.[kind]
      || (kind === 'alcaldia' && world.buildingByKind?.['ayuntamiento'])
      || (kind === 'futbol' && world.buildingByKind?.['estadio'])
      || world.buildingAnchors?.[0]
      || V(0, 1.5, 0);
    const dist = (kind === 'estadio' ? 14 : kind === 'hospital' ? 10.5 : 8.5) - k * 1.5;
    const a = -0.5 + k * 1.1;
    const h = (kind === 'estadio' ? 7.2 : kind === 'posada' ? 6.2 : 5.0) - k * 0.8;
    return [V(p.x + Math.cos(a) * dist, p.y + h, p.z + Math.sin(a) * dist), V(p.x, p.y + 1.6, p.z)];
  };
  for (const b of BUILDINGS) {
    shots[b] = (k) => shots.edificio(k, b);
  }
  const segAt = (t) => segs.find((s) => t >= s.start && t < s.end) || segs[segs.length - 1];
  world.customCamera = () => {
    const sg = segAt(elapsed); const k = THREE.MathUtils.clamp((elapsed - sg.start) / Math.max(sg.end - sg.start, 0.01), 0, 1);
    cfg.foco = sg.foco || cfg.focoBase; // foco de esta toma (o el general)
    const [pos, tgt] = (shots[sg.toma] || shots.panoramica)(k); world.camera.position.copy(pos); world.camera.lookAt(tgt);
  };

  // ---------- reloj del Reel ----------
  let elapsed = 0;
  const setHour = () => {
    const h0 = cfg.hora, h1 = cfg.horaFin ?? cfg.hora + 1.2;
    world.time = (h0 + (h1 - h0) * Math.min(elapsed / cfg.dur, 1)) * 60;
    if (params.get('lluvia_en')) {
      const tRain = Number(params.get('lluvia_en'));
      if (elapsed >= tRain) world.setWeather('lluvia');
      else world.setWeather('despejado');
    } else if (params.get('clima')) {
      world.setWeather(params.get('clima'));
    }
  };
  // &previo=N: simula N segundos antes de empezar, para que cada vecino ya esté donde le toca a esa hora
  const previo = Number(params.get('previo')) || 0;
  if (previo) for (let i = 0; i < previo * 10; i++) { setHour(); world.update(0.1); } // la hora queda fija mientras se acomodan

  // ---------- composición ----------
  function subtitle(t) {
    if (!voz) return null; const sg = segAt(t); const l = sg.linea; if (!l || t > l.fin + 0.15) return null;
    // Trocea la frase en grupos de ~5 palabras repartidos según su duración
    const words = l.texto.split(/\s+/); const chunks = []; for (let i = 0; i < words.length; i += 5) chunks.push(words.slice(i, i + 5).join(' '));
    const f = THREE.MathUtils.clamp((t - l.inicio) / Math.max(l.fin - l.inicio, 0.1), 0, 0.999);
    return chunks[Math.floor(f * chunks.length)];
  }
  // @usuario sobre los habitantes visibles (máx. 14, los más cercanos), dibujados en el propio vídeo
  const tv = new THREE.Vector3();
  function nameTags() {
    if (params.get('nombres') === '0' || !world.walkers?.length) return;
    const cam = world.camera.position; const vis = [];
    for (const w of world.walkers) {
      if (w.hidden) continue;
      tv.set(w.pos.x, w.ground + (w.forma ? 0.95 : 1.75), w.pos.z).project(world.camera);
      if (tv.z >= 1 || Math.abs(tv.x) > 0.92 || Math.abs(tv.y) > 0.9) continue;
      const d = Math.hypot(w.pos.x - cam.x, w.ground - cam.y, w.pos.z - cam.z); if (d > 38) continue;
      vis.push({ x: (tv.x + 1) / 2 * W, y: (1 - tv.y) / 2 * H, d, h: w.handle });
    }
    vis.sort((a, b) => a.d - b.d).slice(0, 14).forEach(({ x, y, d, h }) => {
      const size = Math.round(Math.max(27, 44 - d * 0.55)); ctx.font = `800 ${size}px Nunito, sans-serif`;
      const txt = '@' + h; const tw = ctx.measureText(txt).width + size * 0.8;
      ctx.globalAlpha = Math.max(0.45, 1 - d / 45);
      ctx.fillStyle = 'rgba(29,43,54,.78)'; roundRect(ctx, x - tw / 2, y - size * 0.95, tw, size * 1.3, size * 0.65); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(txt, x, y);
      ctx.globalAlpha = 1;
    });
  }
  function draw(t) {
    ctx.drawImage(world.renderer.domElement, 0, 0, W, H);
    nameTags();
    const g = ctx.createLinearGradient(0, 0, 0, 460); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, 460);
    const g2 = ctx.createLinearGradient(0, H - 700, 0, H); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,.6)'); ctx.fillStyle = g2; ctx.fillRect(0, H - 700, W, 700);
    ctx.textAlign = 'center';
    // Gancho: grande al principio, luego se queda pequeño arriba
    const sgi = segs.indexOf(segAt(t)); const rot = sgi > 0 && cfg.rotulos[sgi] ? cfg.rotulos[sgi] : null;
    const since = rot ? t - segAt(t).start : t; // cada rótulo nuevo entra grande y luego se encoge
    const hookBig = Math.max(0, 1 - Math.max(0, since - 2.5) / 0.6) * Math.min(1, since / 0.25);
    ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = 18;
    wrap(ctx, (rot || cfg.t1).toUpperCase(), W / 2, 250, W - 140, 104 * (0.6 + 0.4 * hookBig), `800 ${Math.round(56 + 40 * hookBig)}px 'Baloo 2', sans-serif`);
    // Subtítulo sincronizado (o texto fijo si no hay voz)
    const sub = subtitle(t);
    if (sub) {
      ctx.font = "800 74px 'Baloo 2', sans-serif"; ctx.lineJoin = 'round'; ctx.lineWidth = 14; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.shadowBlur = 0;
      wrapStroke(ctx, sub, W / 2, H * 0.66, W - 140, 84);
    } else if (!voz) wrap(ctx, cfg.t2, W / 2, H - 420, W - 160, 70, "800 58px 'Baloo 2', sans-serif");
    ctx.shadowBlur = 0;
    // Contador (zona segura arriba-centro)
    const pob = Math.max(window.__vivo?.seguidores ?? 0, state.residents.length); // habitantes = seguidores
    const islaParam = params.get('isla');
    const nom = state.name || (islaParam === 'tiktok' ? 'Isla TikTok' : islaParam === 'youtube' ? 'Isla YouTube' : '');
    const label = `${nom ? nom + ' · ' : ''}${state.day ? `Día ${state.day} · ` : ''}${pob.toLocaleString('es')} habitantes`;
    ctx.font = '800 38px Nunito, sans-serif'; const w = ctx.measureText(label).width + 56;
    ctx.fillStyle = 'rgba(255,255,255,.92)'; roundRect(ctx, (W - w) / 2, 70, w, 64, 32); ctx.fill();
    ctx.fillStyle = '#1d2b36'; ctx.fillText(label, W / 2, 115);
    ctx.font = '700 34px Nunito, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText('@gambitoia', W / 2, H - 230);
    // Etiqueta de la casa enfocada
    const sg = segAt(t); const h = sg.toma === 'llegada' && world.houseIndex.get(cfg.foco.replace('@', '').toLowerCase());
    if (h && (t - sg.start) / (sg.end - sg.start) > 0.45) {
      const v = h.pos.clone().add(V(0, 3, 0)).project(world.camera); const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H; const txt = `🏠 @${h.resident.handle}`;
      ctx.font = '800 46px Nunito, sans-serif'; const tw = ctx.measureText(txt).width + 48;
      ctx.fillStyle = '#ff7a59'; roundRect(ctx, x - tw / 2, y - 60, tw, 72, 36); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(txt, x, y - 10);
    }
  }

  // ---------- panel ----------
  const ui = document.querySelector('#reelUI'); ui.classList.remove('hidden'); ui.classList.add('card');
  ui.innerHTML = `<b>🎬 Modo Reel</b>
    ${voz ? `<p class="hint">Voz «${vozName}»: ${voz.lineas.length} frases · ${voz.duracion.toFixed(1)} s</p>` : `<label>Toma</label><select id="rToma">${SHOTS.map((t) => `<option ${t === cfg.toma ? 'selected' : ''}>${t}</option>`).join('')}</select>`}
    <label>Foco (@usuario para la toma llegada)</label><input id="rFoco" value="${cfg.foco}">
    <label>Texto superior (gancho)</label><input id="rT1" value="${cfg.t1.replace(/"/g, '&quot;')}">
    ${voz ? '' : `<label>Texto inferior</label><input id="rT2" value="${cfg.t2.replace(/"/g, '&quot;')}">`}
    <button class="rec" id="rRestart" style="background:#2a9d8f">↺ Reiniciar</button>
    <div class="hint" id="rHint">Para el MP4 final abre esta misma URL con &amp;captura=1 y luego ejecuta <code>node tools/render-reel.mjs ${vozName || 'nombre'}</code>.</div>`;
  const bind = (id, k) => ui.querySelector(id)?.addEventListener('input', (e) => { cfg[k] = e.target.value; if (k === 'toma') { segs[0].toma = cfg.toma; elapsed = 0; } });
  bind('#rToma', 'toma'); bind('#rFoco', 'foco'); bind('#rT1', 't1'); bind('#rT2', 't2');
  ui.querySelector('#rRestart').onclick = () => { elapsed = 0; };

  // ---------- captura fotograma a fotograma ----------
  if (params.get('captura')) {
    const name = vozName || params.get('captura');
    const total = Math.ceil(cfg.dur * FPS); const hint = ui.querySelector('#rHint');
    await fetch(`/__frame?name=${encodeURIComponent(name)}&reset=1`, { method: 'POST' });
    for (let f = 0; f < total; f++) {
      elapsed = f / FPS; setHour(); world.update(1 / FPS); draw(elapsed);
      // conversión síncrona (toDataURL): no depende de turnos del navegador, así no se frena en segundo plano
      const b64 = atob(out.toDataURL('image/jpeg', 0.93).split(',')[1]); const blob = new Uint8Array(b64.length);
      for (let i = 0; i < b64.length; i++) blob[i] = b64.charCodeAt(i);
      await fetch(`/__frame?name=${encodeURIComponent(name)}&n=${f}`, { method: 'POST', body: blob });
      if (f % 15 === 0) hint.textContent = `Renderizando ${f + 1}/${total} fotogramas…`;
    }
    // Banda sonora (música chill + ambiente) del mismo largo, para mezclar bajo la voz
    hint.textContent = 'Generando música y sonidos…';
    const env = () => ({ hour: cfg.hora, weather: state.weather, sea: 0.75, river: 0.35, plaza: 0.2, figure: 0.4, social: 0.3 });
    const wav = await renderSoundtrack(cfg.dur, env, state.day * 101 + 7);
    await fetch(`/__frame?name=${encodeURIComponent(name)}&audio=1`, { method: 'POST', body: wav });
    await fetch(`/__frame?name=${encodeURIComponent(name)}&done=${total}&fps=${FPS}`, { method: 'POST' });
    hint.textContent = `✔ ${total} fotogramas listos. Ejecuta: node tools/render-reel.mjs ${name}`;
    document.title = 'RENDER_OK';
    return;
  }

  // ---------- previsualización en tiempo real ----------
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    elapsed += dt; if (elapsed > cfg.dur) elapsed = 0;
    setHour(); world.update(dt); draw(elapsed); requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function wrap(ctx, text, x, y, maxW, lh, font) {
  ctx.font = font; const words = String(text).split(' '); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
}
function wrapStroke(ctx, text, x, y, maxW, lh) {
  const words = String(text).split(' '); const lines = []; let line = '';
  for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
  if (line) lines.push(line);
  lines.forEach((l, i) => { ctx.strokeText(l, x, y + i * lh); ctx.fillStyle = '#fff'; ctx.fillText(l, x, y + i * lh); });
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
