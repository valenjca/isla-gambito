// Escena 3D de la isla. Todo lo que se dibuja sale del estado reproducido (state.js).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ZONES } from './state.js';
import { Crowd, appearanceFor, crearAnimal, animarAnimal } from './characters.js';
import { vidaDe, actividad, economia, formaDe } from './vida.js';

// ---------- piezas low-poly con color propio, fusionadas en una sola geometría (1 InstancedMesh por tipo) ----------
// orden: escala → inclinación (z, x) → giro (y) → posición
function pieza(g, color, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv');
  g.scale(sx, sy, sz); g.rotateZ(rz); g.rotateX(rx); g.rotateY(ry); g.translate(x, y, z);
  const c = new THREE.Color(color); const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
// Une piezas en una sola geometría. Normaliza cada pieza (sin índice, solo posición/normal/color) para que nunca falle;
// si aun así falla, devuelve una geometría válida: una malla sin geometría rompe el render de TODA la isla.
const normalizar = (g) => {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  g.morphAttributes = {}; return g;
};
const unir = (...ps) => { const piezas = ps.flat().filter(Boolean).map(normalizar); return mergeGeometries(piezas) || piezas[0] || new THREE.BoxGeometry(0.01, 0.01, 0.01); };
const matVC = (extra = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, ...extra });

// ---------- utilidades deterministas ----------
function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const PERM = (() => { const r = mulberry(1337); const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return [...p, ...p]; })();
function vnoise(x, y) {
  const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255; const xf = x - Math.floor(x), yf = y - Math.floor(y);
  const s = (t) => t * t * (3 - 2 * t); const h = (i, j) => PERM[PERM[xi + i] + yi + j] / 255;
  const a = h(0, 0), b = h(1, 0), c = h(0, 1), d = h(1, 1); const u = s(xf), v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
// Color de tejado de cada sector (barrio): así se reconoce de lejos dónde empieza y termina cada zona
const SECTOR_TECHO = { norte: '#b23a3a', noreste: '#2f6690', sureste: '#2a9d8f', sur: '#d99a2b', suroeste: '#6d597a', noroeste: '#3f8a4f' };
const PALETTE = ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#8ab17d', '#e5989b', '#b5838d', '#6d597a', '#ffb4a2', '#90be6d', '#f9844a', '#4d908e', '#577590', '#f6bd60'];

// Radio de la isla según población: empieza como islote y se expande.
export const islandRadius = (pop) => 17 + Math.sqrt(pop) * 1.35;

// ---------- Geografía fija (coordenadas absolutas: no se mueve cuando la isla crece) ----------
export const TOWN = { x: 1.2, z: 0, flat: 9.5, h: 2.0 };             // claro llano donde va la plaza
export const riverX = (z) => -7.2 + 1.6 * Math.sin(z * 0.11) + 0.5 * Math.sin(z * 0.29 + 1.3); // río de norte a sur
export const RIVER = { half: 1.8, bank: 1.6 };
export const FLAG = { x: 7.5, z: -8.5 };                               // colina del mástil
export const FIGURE_Z = 12;                                            // la mano de piedra, en el río al norte del pueblo
const BRIDGE_Z = 0;
// Ganó ROJO («en el bosque»): los barrios están en el bosque, al este del río, en manzanas alrededor del pueblo.
// La playa (pequeña) está en el lado contrario, al oeste; la zona comercial entre el puente y la playa.
export const BEACH = { ang: Math.PI, half: 0.5 };                         // arco de costa con arena (oeste)
const enPlaya = (x, z) => { let d = Math.atan2(z, x) - BEACH.ang; d = Math.atan2(Math.sin(d), Math.cos(d)); return Math.abs(d) < BEACH.half; };
// Manzanas: 2×2 casas espalda con espalda (cada casa mira a su calle), calles entre manzanas.
const CASA = 2.7, CALLE = 2.6, PASO = CASA * 2 + CALLE;
// Sectores de los barrios alrededor del pueblo (grados desde el este, solo hacia el bosque)
const ZONA_SECTOR = ['noroeste', 'norte', 'noreste', 'sureste', 'sur', 'suroeste'];
// Distritos de obras especiales [ángulo°, fracción del radio] (-90 = norte, 0 = este, 90 = sur, 180 = oeste/playa).
// Barrios al este del río; industria y ejército al norte/noroeste; ocio al suroeste; deportes y defensa en el borde este.
const DISTRITOS = { // [ángulo inicial°, fracción del radio, sentido en que se añaden las obras siguientes]
  industria: [-148, 0.66, 1], militar: [-104, 0.68, 1], ocio: [132, 0.64, -1], motor: [108, 0.72, -1],
  deporte: [-36, 0.68, 1], costaEste: [6, 0.74, 1], sur: [62, 0.66, -1], aereo: [148, 0.46, 1],
};
const SECTOR_MIN = -90, SECTOR_MAX = 90; // abanico compacto al este del río (antes ±125 → franjas largas junto al río)
// Calle del Comercio: emprendimientos de los habitantes, al oeste del puente camino a la playa
export const COMERCIO = { z: BRIDGE_Z, x0: riverX(BRIDGE_Z) - (RIVER.half + RIVER.bank) - 3.2, paso: 3.4, fondo: 3.1 };
// Escala de objetos (casas, personas, árboles, edificios): más pequeña = cabe más en la isla.
const S = 0.7;
const WALKER_R = 0.22; // radio de colisión de un habitante
// Móvil y Gama Baja: detección inteligente de hardware + escalado dinámico de FPS manteniendo el arte 3D Low-Poly vibrante.
const _qs = typeof window !== 'undefined' ? new URLSearchParams(location.search) : null;
export const MOVIL = typeof window !== 'undefined' && !_qs.has('reel')
  && (matchMedia('(pointer: coarse)').matches || innerWidth < 760 || _qs.has('ligero') || _qs.has('gama'));
export const GAMA_BAJA = typeof window !== 'undefined' && !_qs.has('reel') && (
  _qs.has('gama') || _qs.has('ligero') ||
  (MOVIL && ((navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)))
);
const UP = new THREE.Vector3(0, 1, 0);
const ALT_TEXTO = { vecino: 'de visita en casa de un vecino (la plaza estaba llena)', colina: 'mirando el atardecer desde la colina', playa: 'paseando por la playa', casa: 'en casa, que la plaza estaba a reventar' };

export class World3D {
  constructor(container) {
    this.container = container;
    this.gamaBaja = GAMA_BAJA;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !MOVIL,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
      precision: GAMA_BAJA ? 'mediump' : 'highp',
    });
    // Detectar GPU móvil de entrada (Mali/Adreno/PowerVR económicos) para activar perfil gamaBaja automáticamente
    try {
      const gl = this.renderer.getContext();
      const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
      if (MOVIL && /Mali-[4TG]|Mali-G[35]|Adreno \(TM\) [345]|Adreno \(TM\) 61|PowerVR|Vivante/i.test(gpu)) {
        this.gamaBaja = true;
      }
    } catch (_) {}
    const maxPR = this.gamaBaja ? 0.9 : (MOVIL ? 1.2 : 2);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxPR));
    this.renderer.shadowMap.enabled = !this.gamaBaja;
    this.renderer.shadowMap.type = MOVIL ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels-layer';
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#5cc8ff', 210, 620);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1500);
    this.camera.position.set(60, 55, 70);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = MOVIL ? 0.08 : 0.05;
    this.controls.rotateSpeed = MOVIL ? 0.75 : 1;
    this.controls.zoomSpeed = MOVIL ? 0.9 : 1;
    this.controls.panSpeed = MOVIL ? 0.8 : 1;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 8; this.controls.maxDistance = 320;
    this.controls.target.set(0, 2, 0);
    this.controls.addEventListener('start', () => { this.cameraTween = null; });

    this.time = 9 * 60;           // minutos del día en la isla
    this.speed = 60;              // minutos de isla por segundo real... /60 => x60
    this.autoWeather = true;
    this.weather = 'sol';
    this.clock = new THREE.Clock();
    this.walkers = [];
    this.houseIndex = new Map();   // handle -> {pos, i}
    this.onPick = null;
    this.cameraTween = null;
    this.customCamera = null;      // usado por el modo Reel

    this.#lights();
    this.#sky();
    this.#ocean();
    this.#rain();
    this.#clouds();
    this.#birds();
    this.root = new THREE.Group(); this.scene.add(this.root);

    this.raycaster = new THREE.Raycaster();
    this._ptrs = new Set(); this._multi = false;
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      this._ptrs.add(e.pointerId);
      if (this._ptrs.size > 1) this._multi = true;
      else { this._multi = false; this._down = [e.clientX, e.clientY]; }
    });
    dom.addEventListener('pointerup', (e) => {
      this._ptrs.delete(e.pointerId);
      if (!this._multi) this.#pick(e);
      if (this._ptrs.size === 0) this._multi = false;
    });
    dom.addEventListener('pointercancel', (e) => {
      this._ptrs.delete(e.pointerId);
      if (this._ptrs.size === 0) this._multi = false;
    });
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  resize(w = this.container.clientWidth, h = this.container.clientHeight) {
    if (this.fixedSize) [w, h] = this.fixedSize;
    if (!w || !h) return;
    this.renderer.setSize(w, h, !this.fixedSize);
    this.labels.setSize(this.container.clientWidth, this.container.clientHeight);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ---------- entorno ----------
  #lights() {
    this.hemi = new THREE.HemisphereLight('#e0f4ff', '#4b8b3b', 1.05); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff5e0', 2.45);
    this.sun.castShadow = !this.gamaBaja;
    const mapSz = this.gamaBaja ? 512 : (MOVIL ? 1024 : 2048);
    this.sun.shadow.mapSize.set(mapSz, mapSz);
    const c = this.sun.shadow.camera; c.left = c.bottom = -78; c.right = c.top = 78; c.near = 20; c.far = 420;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    // Luz indirecta cálida de rebote (estilo diorama low-poly vibrante): ilumina caras en sombra sin costo de GPU
    this.bounce = new THREE.DirectionalLight('#ffd6a5', 0.48);
    this.bounce.position.set(-120, 68, -90);
    this.scene.add(this.bounce);
  }
  #sky() {
    const g = new THREE.BufferGeometry(); const n = this.gamaBaja ? 450 : 900; const p = new Float32Array(n * 3); const r = mulberry(9);
    for (let i = 0; i < n; i++) { const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.9 + 0.1); p.set([Math.sin(ph) * Math.cos(th) * 700, Math.cos(ph) * 700, Math.sin(ph) * Math.sin(th) * 700], i * 3); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    this.scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.IcosahedronGeometry(12, 1), new THREE.MeshBasicMaterial({ color: '#f5f1dc', fog: false }));
    this.scene.add(this.moon);
  }
  #ocean() {
    const segs = this.gamaBaja ? 32 : (MOVIL ? 46 : 76);
    const g = new THREE.PlaneGeometry(840, 840, segs, segs); g.rotateX(-Math.PI / 2);
    // Mapa de profundidad del terreno (96x96, ~9 KB): permite agua turquesa vibrante en orillas/río y espuma low-poly en GPU
    const ds = 96;
    const data = new Uint8Array(ds * ds * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255; }
    this.depthTex = new THREE.DataTexture(data, ds, ds, THREE.RGBAFormat);
    this.depthTex.magFilter = THREE.LinearFilter;
    this.depthTex.minFilter = THREE.LinearFilter;
    this.depthTex.needsUpdate = true;
    this.depthTexSize = ds;
    this.depthSpan = { value: 120 };

    const mat = this.gamaBaja
      ? new THREE.MeshLambertMaterial({ color: '#0ea5e9', flatShading: true })
      : new THREE.MeshStandardMaterial({ color: '#0ea5e9', roughness: 0.22, metalness: 0.06, flatShading: true, transparent: true, opacity: 0.95 });
    this.oceanT = { value: 0 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uOlas = this.oceanT;
      sh.uniforms.uDepthTex = { value: this.depthTex };
      sh.uniforms.uDepthSpan = this.depthSpan;
      sh.vertexShader = 'uniform float uOlas;\nvarying vec3 vWorldPos;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed.y += sin(position.x * 0.052 + uOlas * 0.85) * 0.16 + cos(position.z * 0.065 + uOlas * 0.65) * 0.14 + sin((position.x + position.z) * 0.095 - uOlas * 0.5) * 0.06;\n  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uOlas;\nuniform sampler2D uDepthTex;\nuniform float uDepthSpan;\nvarying vec3 vWorldPos;\n' + sh.fragmentShader.replace('#include <color_fragment>',
        `#include <color_fragment>
        vec2 dUv = vWorldPos.xz / (uDepthSpan * 2.0) + 0.5;
        vec3 deepCol = vec3(0.05, 0.55, 0.82);
        vec3 shallowCol = vec3(0.18, 0.90, 0.84);
        float inBox = step(0.001, dUv.x) * step(dUv.x, 0.999) * step(0.001, dUv.y) * step(dUv.y, 0.999);
        float edgeMask = smoothstep(0.0, 0.08, min(min(dUv.x, 1.0 - dUv.x), min(dUv.y, 1.0 - dUv.y))) * inBox;
        float hNorm = texture2D(uDepthTex, clamp(dUv, 0.0, 1.0)).r;
        float hWorld = mix(-6.0, hNorm * 10.0 - 6.0, edgeMask);
        float shallow = smoothstep(-3.8, -0.1, hWorld);
        vec3 waterCol = mix(deepCol, mix(diffuseColor.rgb, shallowCol, shallow), smoothstep(-5.5, -0.8, hWorld));
        float wave = sin(hWorld * 19.0 - uOlas * 2.8 + vWorldPos.x * 0.30 + vWorldPos.z * 0.26) * 0.5 + 0.5;
        float foamBand = smoothstep(-0.62, -0.04, hWorld) * (1.0 - smoothstep(0.03, 0.36, hWorld));
        float foamRipple = smoothstep(-1.05, -0.22, hWorld) * (1.0 - smoothstep(-0.22, 0.06, hWorld)) * smoothstep(0.50, 0.82, wave);
        float foam = clamp(foamBand * 0.92 + foamRipple * 0.55, 0.0, 0.96) * edgeMask;
        diffuseColor.rgb = mix(waterCol, vec3(0.97, 0.99, 1.0), foam);`);
    };
    this.ocean = new THREE.Mesh(g, mat);
    this.ocean.receiveShadow = !this.gamaBaja; this.scene.add(this.ocean);
    if (!this.gamaBaja) {
      const floor = new THREE.Mesh(new THREE.CircleGeometry(430, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#095c7a' }));
      floor.position.y = -6; this.scene.add(floor);
    }
  }
  #rain() {
    const n = this.gamaBaja ? 1500 : 4000; const p = new Float32Array(n * 3); const r = mulberry(3);
    for (let i = 0; i < n; i++) p.set([(r() - 0.5) * 300, r() * 120, (r() - 0.5) * 300], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.rain = new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfe8ff', size: 0.35, transparent: true, opacity: 0.7 }));
    this.rain.visible = false; this.scene.add(this.rain);
  }
  #clouds() {
    this.cloudGroup = new THREE.Group(); const r = mulberry(21);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.88, flatShading: true });
    this.cloudMat = mat;
    const cloudCount = this.gamaBaja ? 12 : 20;
    for (let i = 0; i < cloudCount; i++) {
      const c = new THREE.Group();
      const puffs = 4 + Math.floor(r() * 3);
      for (let k = 0; k < puffs; k++) {
        const rad = (k === 1 || k === 2) ? 4.8 + r() * 3.2 : 3.2 + r() * 2.6;
        const s = new THREE.Mesh(new THREE.IcosahedronGeometry(rad, 0), mat);
        s.scale.set(1.15, 0.78 + r() * 0.25, 0.95);
        s.position.set((k - puffs * 0.5) * 4.2, r() * 1.8, (r() - 0.5) * 3.2);
        s.rotation.set(r() * 0.5, r() * 3.14, r() * 0.4);
        c.add(s);
      }
      const ang = (i / cloudCount) * Math.PI * 2 + r() * 0.3;
      const dist = 95 + r() * 145;
      c.position.set(Math.cos(ang) * dist, 82 + r() * 28, Math.sin(ang) * dist); c.userData.v = 0.5 + r();
      this.cloudGroup.add(c);
    }
    this.scene.add(this.cloudGroup);
  }

  // ---------- terreno ----------
  height(x, z) {
    const ang = Math.atan2(z, x);
    const R = this.esYoutube ? this.R * (1 + 0.19 * Math.cos(3 * ang)) : this.R;
    const rawD = Math.hypot(x, z) / R;
    // Variación orgánica sutil en la línea de costa (sin mover el interior ni las manzanas)
    const coastNoise = (fbm(Math.cos(ang) * 2.1 + 4.2, Math.sin(ang) * 2.1 + 7.4) - 0.5) * 0.12;
    const d = rawD + coastNoise * THREE.MathUtils.smoothstep(rawD, 0.72, 0.95);
    const edge = 1 - THREE.MathUtils.smoothstep(d, 0.72, 1.08);          // meseta que cae al mar
    const n = fbm(x * 0.045 + 10, z * 0.045 + 3);
    const hill = Math.exp(-((x - FLAG.x) ** 2 + (z - FLAG.z) ** 2) / 22) * 2.6;   // colina del mástil
    let y = edge * (1.6 + n * 2.2 + hill) - (1 - edge) * 3.2;
    if (edge > 0.3) {
      const L = THREE.MathUtils.smoothstep(edge, 0.3, 0.6);
      // claro llano del pueblo
      const dt = Math.hypot(x - TOWN.x, z - TOWN.z);
      y = THREE.MathUtils.lerp(y, TOWN.h, (1 - THREE.MathUtils.smoothstep(dt, TOWN.flat, TOWN.flat + 2.5)) * L);
      // terrazas suaves para las manzanas habitadas y sus calles (evita que lomas atraviesen calles o casas)
      if (this.manzanaCoords?.length) {
        let flatW = 0;
        for (let mi = 0; mi < this.manzanaCoords.length; mi++) {
          const m = this.manzanaCoords[mi];
          const md = Math.max(Math.abs(x - m.cx), Math.abs(z - m.cz));
          if (md < 5.8) {
            const w = 1 - THREE.MathUtils.smoothstep(md, 4.2, 5.8);
            if (w > flatW) flatW = w;
            if (flatW >= 0.999) break;
          }
        }
        if (flatW > 0) y = THREE.MathUtils.lerp(y, TOWN.h, flatW * L);
      }
      // camino llano del pueblo al puente
      const rx = riverX(BRIDGE_Z);
      if (x > rx - 7 && x < TOWN.x) y = THREE.MathUtils.lerp(y, TOWN.h, (1 - THREE.MathUtils.smoothstep(Math.abs(z - BRIDGE_Z), 1.6, 3.2)) * L);
      // Calle del Comercio: llana desde el puente hacia la playa (oeste)
      if (x < COMERCIO.x0 + 3) y = THREE.MathUtils.lerp(y, TOWN.h * 0.85, (1 - THREE.MathUtils.smoothstep(Math.abs(z - COMERCIO.z), COMERCIO.fondo + 1.2, COMERCIO.fondo + 3)) * L * (1 - THREE.MathUtils.smoothstep(d, 0.62, 0.74)));
    }
    // la playa: pendiente suave de arena hacia el mar
    if (enPlaya(x, z)) { const b = THREE.MathUtils.smoothstep(d, 0.5, 0.8); y = THREE.MathUtils.lerp(y, Math.min(y, 1.25 - (d - 0.6) * 4), b); }
    // cauce del río (atraviesa toda la isla; el agua es el propio mar asomando)
    const dr = Math.abs(x - riverX(z));
    if (y > -0.9) y = THREE.MathUtils.lerp(-0.9, y, THREE.MathUtils.smoothstep(dr, RIVER.half, RIVER.half + RIVER.bank));
    return d > 1.1 ? THREE.MathUtils.lerp(y, -6, THREE.MathUtils.smoothstep(d, 1.1, 1.25)) : y;
  }
  inRiver(x, z, margin = 0) { return Math.abs(x - riverX(z)) < RIVER.half + RIVER.bank + margin; }
  #buildTerrain() {
    const R = this.R; const size = R * 2.6;
    const seg = this.gamaBaja ? Math.min(88, Math.floor(R * 1.45)) : (MOVIL ? Math.min(130, Math.floor(R * 2.1)) : Math.min(220, Math.floor(R * 3.2)));
    const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color(), tmp = new THREE.Color();
    const cDeepSea = new THREE.Color('#0b6b94');
    const cWetSand = new THREE.Color('#e0c37e');
    const cBeachSand = new THREE.Color('#fde69e');
    const cShoreRock = new THREE.Color('#8c969e');
    const cBankMud = new THREE.Color('#b89f72');
    const cRiverMoss = new THREE.Color('#57b847');
    const cGrassLight = new THREE.Color('#76d64c');
    const cGrassDeep = new THREE.Color('#3da336');
    const cHighRock = new THREE.Color('#949ba1');

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i); const y = this.height(x, z); pos.setY(i, y);
      let angD = Math.atan2(z, x) - BEACH.ang;
      angD = Math.atan2(Math.sin(angD), Math.cos(angD));
      const beachMix = 1 - THREE.MathUtils.smoothstep(Math.abs(angD), BEACH.half * 0.78, BEACH.half * 1.18);
      const dr = Math.abs(x - riverX(z));
      const bankMix = 1 - THREE.MathUtils.smoothstep(dr, RIVER.half * 0.85, RIVER.half + RIVER.bank * 1.35);
      const noiseVal = fbm(x * 0.16 + 2.3, z * 0.16 + 5.1);

      if (y < -0.25) {
        const t = THREE.MathUtils.clamp((y + 6) / 5.75, 0, 1) ** 2.6;
        c.copy(cDeepSea).lerp(cWetSand, t);
      } else {
        // Base verde con variación orgánica
        c.copy(cGrassLight).lerp(cGrassDeep, THREE.MathUtils.clamp(noiseVal * 1.15, 0, 1));
        // Transición suave de orilla/costa (roca húmeda fuera de la playa, arena dorada en la playa)
        const shoreT = 1 - THREE.MathUtils.smoothstep(y, 0.15, 1.35);
        if (shoreT > 0) {
          tmp.copy(cShoreRock).lerp(cWetSand, beachMix);
          const dryBeach = THREE.MathUtils.smoothstep(y, 0.18, 0.75) * beachMix;
          tmp.lerp(cBeachSand, dryBeach);
          c.lerp(tmp, shoreT * (0.65 + 0.35 * beachMix));
        }
        // Ribera natural del río (canto rodado húmedo + musgo fluvial)
        if (bankMix > 0.01 && y < 2.15) {
          tmp.copy(cBankMud).lerp(cRiverMoss, THREE.MathUtils.smoothstep(y, 0.3, 1.45));
          c.lerp(tmp, bankMix * (1 - THREE.MathUtils.smoothstep(y, 1.3, 2.2)));
        }
        // Colinas altas / cimas rocosas
        if (y > 4.2) {
          c.lerp(cHighRock, THREE.MathUtils.smoothstep(y, 4.2, 6.2) * 0.85);
        }
      }
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();

    // Actualizar mapa de profundidad del océano para alinear la espuma y el turquesa con el relieve real
    if (this.depthTex) {
      const ds = this.depthTexSize;
      const span = size * 0.5;
      this.depthSpan.value = span;
      const data = this.depthTex.image.data;
      for (let py = 0; py < ds; py++) {
        const wz = ((py + 0.5) / ds - 0.5) * size;
        for (let px = 0; px < ds; px++) {
          const wx = ((px + 0.5) / ds - 0.5) * size;
          const hy = this.height(wx, wz);
          const v = Math.round(THREE.MathUtils.clamp((hy + 6) / 10, 0, 1) * 255);
          const idx = (py * ds + px) * 4;
          data[idx] = v; data[idx + 1] = v; data[idx + 2] = v; data[idx + 3] = 255;
        }
      }
      this.depthTex.needsUpdate = true;
    }

    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }));
    m.receiveShadow = true; m.castShadow = !MOVIL; return m; // en el móvil el terreno no proyecta sombra (es la malla más grande)
  }

  // Manzanas del bosque (lista fija, no depende del tamaño de la isla → una casa nunca se mueve al crecer).
  // Por barrio: manzanas ordenadas de la más cercana al pueblo a la más lejana; 4 casas por manzana.
  static manzanas() {
    if (World3D._mz) return World3D._mz;
    const porZona = Object.fromEntries(ZONES.map((z) => [z.id, []]));
    const OFF = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (let gx = -14; gx <= 14; gx++) for (let gz = -14; gz <= 14; gz++) {
      const cx = TOWN.x + gx * PASO, cz = TOWN.z + gz * PASO;
      const casas = OFF.map(([ox, oz]) => ({ x: cx + ox * CASA / 2, z: cz + oz * CASA / 2, face: ox }));
      const ok = casas.every((h) => h.x > riverX(h.z) + RIVER.half + RIVER.bank + 1.6     // solo en la orilla este (el bosque)
        && Math.hypot(h.x - TOWN.x, h.z - TOWN.z) > 12.5                                  // fuera del anillo de edificios del pueblo
        && Math.hypot(h.x - FLAG.x, h.z - FLAG.z) > 4.2                                   // la colina del mástil queda libre
        && !(Math.abs(h.z - BRIDGE_Z) < 2.6 && h.x < TOWN.x));                            // camino al puente
      if (!ok) continue;
      const ang = THREE.MathUtils.radToDeg(Math.atan2(cz - TOWN.z, cx - TOWN.x));
      const sec = THREE.MathUtils.clamp(Math.floor((ang - SECTOR_MIN) / ((SECTOR_MAX - SECTOR_MIN) / 6)), 0, 5);
      porZona[ZONA_SECTOR[sec]].push({ cx, cz, d: Math.hypot(cx - TOWN.x, cz - TOWN.z), ang, casas, key: gx * 1000 + gz });
    }
    for (const l of Object.values(porZona)) l.sort((a, b) => a.d - b.d || a.ang - b.ang);
    return (World3D._mz = porZona);
  }
  plotPosition(zoneId, slot) {
    const l = World3D.manzanas()[zoneId] || World3D.manzanas().norte;
    const m = l[Math.floor(slot / 4) % l.length]; const h = m.casas[slot % 4];
    const p = new THREE.Vector3(h.x, 0, h.z); p.face = h.face; p.manzana = m.key; return p;
  }

  // ---------- construir el mundo a partir del estado ----------
  build(state) {
    this.state = state; this.eco = economia(state);
    this.root.clear();
    this.labels.domElement.querySelectorAll('.lbl').forEach((n) => n.remove());
    this.R = islandRadius(state.residents.length); // radio provisional para medir alturas al colocar casas
    // Seguidores que aún no tienen @ en la lista (se sabe cuántos, no quiénes): sus casas ya se están construyendo
    this.obras = [];
    const pendientes = Math.max(0, Math.min(300, (this.seguidores ?? 0) - state.residents.length));
    { const cuenta = { ...state.zoneCounts };
      for (let i = 0; i < pendientes; i++) { const z = ZONES.reduce((a, b) => ((cuenta[b.id] || 0) < (cuenta[a.id] || 0) ? b : a)); this.obras.push(this.plotPosition(z.id, cuenta[z.id] || 0)); cuenta[z.id] = (cuenta[z.id] || 0) + 1; } }
    let maxR = 0; const plots = state.residents.map((r) => { const p = this.plotPosition(r.zone, r.slot); maxR = Math.max(maxR, p.length()); return p; });
    for (const p of this.obras) maxR = Math.max(maxR, p.length());
    this.manzanasUsadas = new Set([...plots, ...this.obras].map((p) => p.manzana));
    this.manzanaCoords = [...this.manzanasUsadas].map((key) => {
      const gx = Math.round(key / 1000), gz = key - gx * 1000;
      return { gx, gz, cx: TOWN.x + gx * PASO, cz: TOWN.z + gz * PASO };
    });
    // la isla crece con la población, las construcciones y los negocios (y siempre cabe la playa al oeste)
    const negocios = (state.negocios || []).length;
    const oeste = Math.abs(COMERCIO.x0) + Math.ceil(negocios / 2) * COMERCIO.paso + 12;
    this.R = Math.max(islandRadius(state.residents.length) + state.buildings.length * 0.6, maxR / 0.72 + 2, oeste / 0.68);
    this.root.add(this.#buildTerrain());
    this.pickables = []; this.selected = null; this.animProps = [];
    this.obstacles = new Map(); // rejilla espacial de círculos que los habitantes no pueden atravesar
    this.platforms = [];        // superficies elevadas pisables (plaza)
    plots.forEach((p) => { p.y = this.height(p.x, p.z); });
    this.#houses(state, plots);
    this.#obras();
    this.#buildings(state, plots);
    this.#aceras(state, plots);
    this.#negocios(state);
    const esTiktok = state?.isla === 'tiktok' || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('isla') === 'tiktok');
    this.sinArboles = []; this.#carreteraCosta(plots);
    if (this.esYoutube) {
      this.#youtubePerimeterWall();
      this.#youtubeExaggeratedBuilds(plots, state);
    } else if (!esTiktok) {
      this.#instagramFeatures(state, plots);
    } else {
      this.#tiktokFeatures(state, plots);
    }
    this.#pedidos17(this.esYoutube ? 'youtube' : esTiktok ? 'tiktok' : 'ig', plots); // pedidos de los seguidores del 17/11
    this.#trees(plots);
    this.#playaDecor();
    this.#walkers(state, plots);
    this.#flag(state);
    this.#landmarks();
    this.#zoneLabels(state);
    this.#vecina();
    // Precalentar: simula ~105 segundos de la isla al construirla, para que los habitantes lleguen a sus puestos y estén animando su oficio
    for (let i = 0; i < 700; i++) this.#walk(0.15, (this.simT || 0) + i * 0.15);
    if (!this._framed) { this.frame(); this._framed = true; }
  }

  #houses(state, plots) {
    const n = state.residents.length; this.houseIndex.clear();
    if (!n) return;
    this.windowMat = new THREE.MeshStandardMaterial({ color: '#33415c', emissive: '#ffcf6b', emissiveIntensity: 0, roughness: 0.18, metalness: 0.28 });
    const sharedWallMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.88, metalness: 0.02 });
    const sharedRoofMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 0.72, metalness: 0.05 });
    const sharedFachMat = matVC({ roughness: 0.86 });
    const wallMat = () => sharedWallMat;
    const roofMat = () => sharedRoofMat;

    // Estilos arquitectónicos variados según clase social (+ sub-estilos para evitar clones en la misma manzana)
    const TIERS = {
      baja: {
        bodyY: 0.65, roofY: 1.56, roofRot: Math.PI / 4,
        walls: ['#e6ccb2', '#ddb892', '#ede0d4', '#d5bdaf'],
        roofs: ['#8d5524', '#6c757d', '#a47148', '#7f4f24'],
        bodyGeo: unir(
          pieza(new THREE.BoxGeometry(1.78, 1.3, 1.68), '#ffffff', 0, 0, 0),
          pieza(new THREE.BoxGeometry(0.9, 0.08, 0.55), '#d4a373', -0.25, -0.58, 1.05)),
        roofGeo: unir(
          pieza(new THREE.ConeGeometry(1.52, 0.95, 4), '#ffffff', 0, 0, 0),
          pieza(new THREE.BoxGeometry(0.95, 0.1, 0.6), '#ffffff', -0.25, -0.78, 1.05, { ry: -Math.PI / 4 })),
        winGeo: unir(
          pieza(new THREE.BoxGeometry(0.38, 0.38, 0.05), '#ffffff', 0.44, 0.08, 0.85),
          pieza(new THREE.BoxGeometry(0.05, 0.34, 0.34), '#ffffff', 0.9, 0.08, 0)),
        fachGeo: unir(
          pieza(new THREE.BoxGeometry(0.42, 0.82, 0.06), '#6b3a1f', -0.28, -0.24, 0.85),
          pieza(new THREE.BoxGeometry(0.06, 0.72, 0.06), '#7f4f24', -0.66, -0.25, 1.25),
          pieza(new THREE.BoxGeometry(0.06, 0.72, 0.06), '#7f4f24', 0.14, -0.25, 1.25),
          pieza(new THREE.BoxGeometry(1.86, 0.16, 1.76), '#8b8378', 0, -0.57, 0),
          pieza(new THREE.BoxGeometry(0.48, 0.48, 0.04), '#ede0d4', 0.44, 0.08, 0.845),
          pieza(new THREE.BoxGeometry(0.46, 0.1, 0.14), '#8d5a2b', 0.44, -0.16, 0.91),
          pieza(new THREE.IcosahedronGeometry(0.065, 0), '#e76f51', 0.35, -0.09, 0.92),
          pieza(new THREE.IcosahedronGeometry(0.065, 0), '#ffd166', 0.52, -0.09, 0.92),
          pieza(new THREE.CylinderGeometry(0.08, 0.1, 0.95, 6), '#5c646b', 0.55, 1.15, -0.45)),
      },
      baja_teja: {
        bodyY: 0.65, roofY: 1.44, roofRot: 0,
        walls: ['#f4ede2', '#e9d8c4', '#f2e4d0', '#e2d4c0'],
        roofs: ['#bc4749', '#b56576', '#c85a32', '#6d597a'],
        bodyGeo: unir(
          pieza(new THREE.BoxGeometry(1.85, 1.3, 1.62), '#ffffff', 0, 0, 0),
          pieza(new THREE.BoxGeometry(0.65, 0.95, 0.9), '#ffffff', 1.12, -0.16, -0.15)),
        roofGeo: unir(
          pieza(new THREE.BoxGeometry(2.08, 0.22, 1.88), '#ffffff', 0, 0, 0),
          pieza(new THREE.BoxGeometry(0.8, 0.16, 1.05), '#ffffff', 1.12, -0.42, -0.15)),
        winGeo: unir(
          pieza(new THREE.BoxGeometry(0.36, 0.38, 0.05), '#ffffff', -0.45, 0.1, 0.82),
          pieza(new THREE.BoxGeometry(0.36, 0.38, 0.05), '#ffffff', 0.48, 0.1, 0.82)),
        fachGeo: unir(
          pieza(new THREE.BoxGeometry(0.42, 0.82, 0.06), '#5c3a21', 0.02, -0.24, 0.82),
          pieza(new THREE.BoxGeometry(1.94, 0.16, 1.72), '#9c9488', 0, -0.57, 0),
          pieza(new THREE.BoxGeometry(0.92, 0.07, 0.45), '#7f5539', 0.02, 0.32, 1.04), // pérgola frontal
          pieza(new THREE.BoxGeometry(0.06, 0.95, 0.06), '#7f5539', -0.38, -0.16, 1.22),
          pieza(new THREE.BoxGeometry(0.06, 0.95, 0.06), '#7f5539', 0.42, -0.16, 1.22),
          pieza(new THREE.BoxGeometry(0.24, 0.8, 0.24), '#a0522d', -0.62, 1.0, -0.4)),
      },
      trabajadora: {
        bodyY: 0.8, roofY: 2.25, roofRot: Math.PI / 4,
        walls: ['#fff7ea', '#f8edeb', '#e8f1f2', '#fefae0'],
        roofs: PALETTE,
        bodyGeo: new THREE.BoxGeometry(2, 1.6, 2),
        roofGeo: unir(
          pieza(new THREE.ConeGeometry(1.78, 1.32, 4), '#ffffff', 0, 0, 0),
          pieza(new THREE.BoxGeometry(0.48, 0.42, 0.52), '#ffffff', 0, -0.18, 0.65, { ry: -Math.PI / 4 })),
        winGeo: unir(...[-0.55, 0.55].map((x) => pieza(new THREE.BoxGeometry(0.38, 0.4, 0.05), '#ffffff', x, 0.18, 1.01)),
          ...[-1, 1].map((sx) => pieza(new THREE.BoxGeometry(0.05, 0.38, 0.38), '#ffffff', sx * 1.01, 0.18, 0))),
        fachGeo: unir(
          pieza(new THREE.BoxGeometry(0.46, 0.9, 0.07), '#7a4a22', 0, -0.35, 1.02),
          pieza(new THREE.BoxGeometry(0.05, 0.05, 0.03), '#e9c46a', 0.14, -0.35, 1.07),
          pieza(new THREE.BoxGeometry(0.68, 0.08, 0.36), '#8d5a2b', 0, 0.16, 1.15),
          pieza(new THREE.BoxGeometry(0.74, 0.1, 0.34), '#a8a29a', 0, -0.76, 1.13),
          pieza(new THREE.BoxGeometry(2.12, 0.2, 2.12), '#9c9488', 0, -0.72, 0),
          ...[-0.55, 0.55].flatMap((x) => [
            pieza(new THREE.BoxGeometry(0.5, 0.52, 0.04), '#f4efe6', x, 0.18, 1.005),
            pieza(new THREE.BoxGeometry(0.12, 0.44, 0.04), '#457b9d', x - 0.26, 0.18, 1.01),
            pieza(new THREE.BoxGeometry(0.12, 0.44, 0.04), '#457b9d', x + 0.26, 0.18, 1.01),
            pieza(new THREE.BoxGeometry(0.52, 0.12, 0.16), '#8d5a2b', x, -0.12, 1.09),
            pieza(new THREE.IcosahedronGeometry(0.07, 0), '#e76f51', x - 0.12, -0.03, 1.1),
            pieza(new THREE.IcosahedronGeometry(0.07, 0), '#e9c46a', x + 0.12, -0.03, 1.1)]),
          pieza(new THREE.BoxGeometry(0.26, 1.05, 0.26), '#a0522d', 0.48, 1.45, -0.4),
          pieza(new THREE.BoxGeometry(0.32, 0.07, 0.32), '#6b3a1f', 0.48, 1.98, -0.4)),
      },
      trabajadora_dosaguas: {
        bodyY: 0.85, roofY: 2.05, roofRot: 0,
        walls: ['#fdf6ec', '#eef2f3', '#f7ede2', '#e9f5db'],
        roofs: ['#355070', '#6d597a', '#b56576', '#2a9d8f', '#d65a31'],
        bodyGeo: unir(
          pieza(new THREE.BoxGeometry(2.05, 1.7, 1.95), '#ffffff', 0, 0, 0),
          pieza(new THREE.BoxGeometry(1.4, 0.65, 1.8), '#ffffff', 0, 1.05, 0, { sx: 0.72, sy: 0.75 })),
        roofGeo: unir(
          pieza(new THREE.BoxGeometry(1.55, 0.14, 2.24), '#ffffff', -0.62, 0.18, 0, { rz: 0.62 }),
          pieza(new THREE.BoxGeometry(1.55, 0.14, 2.24), '#ffffff', 0.62, 0.18, 0, { rz: -0.62 }),
          pieza(new THREE.BoxGeometry(0.18, 0.18, 2.28), '#ffffff', 0, 0.64, 0)),
        winGeo: unir(
          pieza(new THREE.BoxGeometry(0.4, 0.42, 0.05), '#ffffff', -0.52, 0.12, 0.99),
          pieza(new THREE.BoxGeometry(0.4, 0.42, 0.05), '#ffffff', 0.52, 0.12, 0.99),
          pieza(new THREE.BoxGeometry(0.34, 0.34, 0.05), '#ffffff', 0, 0.98, 0.92)),
        fachGeo: unir(
          pieza(new THREE.BoxGeometry(0.48, 0.92, 0.07), '#6b3a1f', 0, -0.38, 0.99),
          pieza(new THREE.BoxGeometry(2.18, 0.2, 2.08), '#8d99ae', 0, -0.76, 0),
          pieza(new THREE.BoxGeometry(1.9, 0.08, 0.55), '#b08968', 0, -0.76, 1.24),
          pieza(new THREE.BoxGeometry(0.08, 0.95, 0.08), '#7f5539', -0.78, -0.3, 1.44),
          pieza(new THREE.BoxGeometry(0.08, 0.95, 0.08), '#7f5539', 0.78, -0.3, 1.44),
          pieza(new THREE.BoxGeometry(1.8, 0.1, 0.55), '#7f5539', 0, 0.2, 1.24),
          pieza(new THREE.BoxGeometry(0.26, 0.9, 0.26), '#9b2226', -0.55, 1.35, -0.35)),
      },
      media: {
        bodyY: 1.15, roofY: 2.95, roofRot: Math.PI / 4,
        walls: ['#fff8ee', '#f4f1de', '#edf2f4', '#fdf0d5'],
        roofs: ['#d65a31', '#2a9d8f', '#457b9d', '#b56576', '#e76f51'],
        bodyGeo: unir(
          pieza(new THREE.BoxGeometry(2.1, 2.3, 2.0), '#ffffff', 0, 0, 0),
          pieza(new THREE.BoxGeometry(0.85, 1.25, 1.45), '#ffffff', 1.32, -0.52, -0.1)),
        roofGeo: unir(
          pieza(new THREE.ConeGeometry(1.85, 1.3, 4), '#ffffff', 0, 0, 0),
          pieza(new THREE.BoxGeometry(0.95, 0.22, 1.55), '#ffffff', 1.32, -1.6, -0.1)),
        winGeo: unir(
          ...[-0.58, 0.58].flatMap((x) => [
            pieza(new THREE.BoxGeometry(0.4, 0.44, 0.05), '#ffffff', x, -0.35, 1.01),
            pieza(new THREE.BoxGeometry(0.4, 0.44, 0.05), '#ffffff', x, 0.58, 1.01)]),
          ...[-1, 1].map((sx) => pieza(new THREE.BoxGeometry(0.05, 0.42, 0.42), '#ffffff', sx * 1.06, 0.55, 0))),
        fachGeo: unir(
          pieza(new THREE.BoxGeometry(0.5, 0.95, 0.07), '#5c3a21', 0, -0.68, 1.02),
          pieza(new THREE.BoxGeometry(1.5, 0.08, 0.45), '#d4a373', 0, -0.08, 1.22),
          pieza(new THREE.BoxGeometry(1.5, 0.22, 0.06), '#f4efe6', 0, 0.06, 1.42),
          ...[-0.65, 0.65].map((x) => pieza(new THREE.CylinderGeometry(0.06, 0.07, 1.05, 6), '#f4efe6', x, -0.62, 1.35)),
          pieza(new THREE.BoxGeometry(2.25, 0.24, 2.15), '#8d99ae', 0, -1.03, 0),
          pieza(new THREE.BoxGeometry(0.28, 1.15, 0.28), '#9b2226', -0.55, 1.75, -0.45)),
      },
      media_torre: {
        bodyY: 1.15, roofY: 3.05, roofRot: Math.PI / 4,
        walls: ['#fefae0', '#f8f9fa', '#f4ede2', '#edf6f9'],
        roofs: ['#264653', '#9b2226', '#457b9d', '#bc4749'],
        bodyGeo: unir(
          pieza(new THREE.BoxGeometry(2.1, 2.1, 1.95), '#ffffff', -0.15, -0.1, 0),
          pieza(new THREE.CylinderGeometry(0.68, 0.72, 2.85, 8), '#ffffff', 1.05, 0.28, 0.45)),
        roofGeo: unir(
          pieza(new THREE.ConeGeometry(1.82, 1.25, 4), '#ffffff', -0.15, -0.15, 0),
          pieza(new THREE.ConeGeometry(0.86, 1.15, 8), '#ffffff', 1.05, 0.25, 0.45)),
        winGeo: unir(
          pieza(new THREE.BoxGeometry(0.42, 0.46, 0.05), '#ffffff', -0.6, 0.45, 0.99),
          pieza(new THREE.BoxGeometry(0.42, 0.46, 0.05), '#ffffff', -0.6, -0.45, 0.99),
          pieza(new THREE.BoxGeometry(0.32, 0.42, 0.05), '#ffffff', 1.05, 0.92, 1.14)),
        fachGeo: unir(
          pieza(new THREE.BoxGeometry(0.5, 0.95, 0.07), '#4a2c16', -0.1, -0.68, 0.99),
          pieza(new THREE.BoxGeometry(2.3, 0.24, 2.1), '#6c757d', -0.15, -1.03, 0),
          pieza(new THREE.BoxGeometry(0.82, 0.14, 0.48), '#adb5bd', -0.1, -1.08, 1.18),
          pieza(new THREE.BoxGeometry(0.28, 1.05, 0.28), '#a0522d', -0.72, 1.65, -0.42)),
      },
      alta: {
        bodyY: 1.35, roofY: 3.42, roofRot: Math.PI / 4,
        walls: ['#fffdf7', '#f8f9fa', '#fefae0', '#f5ebe0'],
        roofs: ['#e9b949', '#9b2226', '#2b2d42', '#386641'],
        bodyGeo: unir(
          pieza(new THREE.BoxGeometry(2.45, 2.7, 2.2), '#ffffff', 0, 0, 0),
          pieza(new THREE.BoxGeometry(1.0, 1.85, 1.6), '#ffffff', -1.5, -0.42, 0),
          pieza(new THREE.BoxGeometry(1.0, 1.85, 1.6), '#ffffff', 1.5, -0.42, 0)),
        roofGeo: unir(
          pieza(new THREE.ConeGeometry(2.1, 1.45, 4), '#ffffff', 0, 0, 0),
          pieza(new THREE.ConeGeometry(0.85, 0.85, 4), '#ffffff', -1.5, -0.7, 0),
          pieza(new THREE.ConeGeometry(0.85, 0.85, 4), '#ffffff', 1.5, -0.7, 0)),
        winGeo: unir(
          ...[-0.72, 0, 0.72].map((x) => pieza(new THREE.BoxGeometry(0.4, 0.48, 0.05), '#ffffff', x, 0.68, 1.11)),
          ...[-0.75, 0.75].map((x) => pieza(new THREE.BoxGeometry(0.42, 0.48, 0.05), '#ffffff', x, -0.42, 1.11)),
          ...[-1.5, 1.5].map((x) => pieza(new THREE.BoxGeometry(0.42, 0.44, 0.05), '#ffffff', x, -0.25, 0.81))),
        fachGeo: unir(
          pieza(new THREE.BoxGeometry(0.62, 1.08, 0.08), '#4a2c16', 0, -0.81, 1.12),
          pieza(new THREE.BoxGeometry(1.25, 0.14, 0.68), '#e5e5e5', 0, -1.28, 1.42),
          pieza(new THREE.BoxGeometry(1.3, 0.14, 0.65), '#f8f9fa', 0, -0.15, 1.42),
          ...[-0.55, 0.55].map((x) => pieza(new THREE.CylinderGeometry(0.08, 0.1, 1.15, 8), '#ffffff', x, -0.72, 1.58)),
          pieza(new THREE.BoxGeometry(2.6, 0.28, 2.35), '#6c757d', 0, -1.21, 0),
          pieza(new THREE.BoxGeometry(0.32, 1.25, 0.32), '#adb5bd', 0.7, 1.95, -0.45)),
      },
      tres_pisos: {
        bodyY: 1.95, roofY: 4.05, roofRot: 0,
        walls: ['#fff3e0', '#f8f9fa', '#edf2f4', '#fefae0'],
        roofs: ['#ff9f1c', '#2b2d42', '#e76f51', '#457b9d'],
        bodyGeo: new THREE.BoxGeometry(2.2, 3.9, 2.1),
        roofGeo: unir(
          pieza(new THREE.BoxGeometry(2.38, 0.22, 2.28), '#ffffff', 0, 0, 0),
          pieza(new THREE.BoxGeometry(1.15, 0.55, 1.15), '#ffffff', 0, 0.35, -0.15)),
        winGeo: unir(
          ...[-0.58, 0.58].flatMap((x) => [
            pieza(new THREE.BoxGeometry(0.4, 0.45, 0.05), '#ffffff', x, -1.15, 1.06),
            pieza(new THREE.BoxGeometry(0.4, 0.45, 0.05), '#ffffff', x, 0.05, 1.06),
            pieza(new THREE.BoxGeometry(0.4, 0.45, 0.05), '#ffffff', x, 1.25, 1.06)]),
          ...[-1, 1].flatMap((sx) => [
            pieza(new THREE.BoxGeometry(0.05, 0.44, 0.44), '#ffffff', sx * 1.11, 0.05, 0),
            pieza(new THREE.BoxGeometry(0.05, 0.44, 0.44), '#ffffff', sx * 1.11, 1.25, 0)])),
        fachGeo: unir(
          pieza(new THREE.BoxGeometry(0.56, 1.02, 0.08), '#4a2c16', 0, -1.44, 1.07),
          pieza(new THREE.BoxGeometry(1.65, 0.08, 0.42), '#d4a373', 0, -0.45, 1.24),
          pieza(new THREE.BoxGeometry(1.65, 0.22, 0.06), '#f4efe6', 0, -0.32, 1.42),
          pieza(new THREE.BoxGeometry(1.65, 0.08, 0.42), '#d4a373', 0, 0.75, 1.24),
          pieza(new THREE.BoxGeometry(1.65, 0.22, 0.06), '#f4efe6', 0, 0.88, 1.42),
          pieza(new THREE.BoxGeometry(2.34, 0.26, 2.24), '#6c757d', 0, -1.82, 0)),
      },
      triangular: {
        bodyY: 0.95, roofY: 0.95, roofRot: 0,
        walls: ['#b08968', '#7f5539', '#ddb892'],
        roofs: ['#ffb703', '#fb8500', '#d62828', '#264653'],
        bodyGeo: unir(
          pieza(new THREE.BoxGeometry(1.9, 0.22, 2.3), '#ffffff', 0, -0.85, 0),
          pieza(new THREE.BoxGeometry(1.5, 0.9, 2.0), '#ffffff', 0, -0.35, 0),
          pieza(new THREE.BoxGeometry(0.9, 0.7, 2.0), '#ffffff', 0, 0.35, 0),
          pieza(new THREE.BoxGeometry(0.4, 0.45, 2.0), '#ffffff', 0, 0.82, 0)),
        roofGeo: unir(
          pieza(new THREE.BoxGeometry(0.14, 2.7, 2.4), '#ffffff', -0.78, 0.1, 0, { rz: -0.55 }),
          pieza(new THREE.BoxGeometry(0.14, 2.7, 2.4), '#ffffff', 0.78, 0.1, 0, { rz: 0.55 }),
          pieza(new THREE.BoxGeometry(0.22, 0.22, 2.45), '#ffffff', 0, 1.22, 0)),
        winGeo: unir(
          pieza(new THREE.BoxGeometry(0.48, 0.48, 0.05), '#ffffff', 0, 0.45, 1.05),
          pieza(new THREE.BoxGeometry(0.32, 0.38, 0.05), '#ffffff', -0.42, -0.25, 1.05),
          pieza(new THREE.BoxGeometry(0.32, 0.38, 0.05), '#ffffff', 0.42, -0.25, 1.05)),
        fachGeo: unir(
          pieza(new THREE.BoxGeometry(0.46, 0.82, 0.08), '#4a2c16', 0, -0.48, 1.06),
          pieza(new THREE.BoxGeometry(0.06, 0.06, 0.04), '#e9c46a', 0.14, -0.48, 1.11),
          pieza(new THREE.BoxGeometry(0.85, 0.1, 0.45), '#a8a29a', 0, -0.9, 1.25),
          pieza(new THREE.BoxGeometry(0.28, 2.2, 0.28), '#6c757d', 0.78, 0.35, -0.25),
          pieza(new THREE.BoxGeometry(0.34, 0.08, 0.34), '#343a40', 0.78, 1.48, -0.25)),
      },
    };

    const ALT_SUB = { baja: 'baja_teja', trabajadora: 'trabajadora_dosaguas', media: 'media_torre' };
    const CUSTOM_TIER = { 'andrxx_07_': 'tres_pisos', 'martinretamal-ik8lf': 'tres_pisos', 'levantandounlapiz': 'triangular', 'isabel.angel30': 'alta', 'jake.apaza': 'media', 'thiagosantibaez8': 'alta', 'micaiashuenchumil': 'alta', 'julioricardoaguirre3449': 'alta' };
    const groups = { baja: [], baja_teja: [], trabajadora: [], trabajadora_dosaguas: [], media: [], media_torre: [], alta: [], tres_pisos: [], triangular: [] };
    state.residents.forEach((r, i) => {
      const clase = this.eco.get(r.handle)?.clase;
      let tid = CUSTOM_TIER[r.handle] || (groups[clase?.id] ? clase.id : 'trabajadora');
      if (!CUSTOM_TIER[r.handle] && ALT_SUB[tid] && ((r.color ^ i) & 1)) tid = ALT_SUB[tid];
      groups[tid].push({ r, p: plots[i], i, clase });
    });

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
    const c = new THREE.Color();
    this.houseMeshes = []; this.houseList = state.residents;

    Object.entries(groups).forEach(([tid, list]) => {
      if (!list.length) return;
      const M = (col, ex = {}) => new THREE.MeshStandardMaterial({ color: col, flatShading: true, ...ex });
      const cfg = TIERS[tid];
      const body = new THREE.InstancedMesh(cfg.bodyGeo, wallMat(), list.length);
      const roof = new THREE.InstancedMesh(cfg.roofGeo, roofMat(), list.length);
      const win = new THREE.InstancedMesh(cfg.winGeo, this.windowMat, list.length);
      const fachada = new THREE.InstancedMesh(cfg.fachGeo, sharedFachMat, list.length);
      body.castShadow = roof.castShadow = fachada.castShadow = !MOVIL; body.receiveShadow = true;
      const tierRes = list.map((x) => x.r);
      body.userData.residents = tierRes; roof.userData.residents = tierRes;
      this.houseMeshes.push(body, roof);

      list.forEach(({ r, p, i, clase }, idx) => {
        const rot = p.face ? p.face * Math.PI / 2 : Math.atan2(-p.x, -p.z);
        const sc = (0.97 + ((r.color >>> 8) % 7) / 100) * S * (clase?.escala || 1);
        s.set(sc, sc, sc);
        q.setFromEuler(e.set(0, rot, 0));
        m.compose(new THREE.Vector3(p.x, p.y + cfg.bodyY * sc, p.z), q, s);
        body.setMatrixAt(idx, m); win.setMatrixAt(idx, m); fachada.setMatrixAt(idx, m);
        body.setColorAt(idx, c.set(cfg.walls[r.color % cfg.walls.length]));
        q.setFromEuler(e.set(0, rot + cfg.roofRot, 0));
        m.compose(new THREE.Vector3(p.x, p.y + cfg.roofY * sc, p.z), q, s);
        roof.setMatrixAt(idx, m);
        roof.setColorAt(idx, SECTOR_TECHO[r.zone] ? c.set(SECTOR_TECHO[r.zone]).offsetHSL(0, 0, (((r.color >>> 5) % 9) - 4) / 70) : c.set(cfg.roofs[(r.color >>> 3) % cfg.roofs.length]));
        this.houseIndex.set(r.handle, { pos: p.clone(), i, resident: r });
        this.addObstacle(p.x, p.z, (tid === 'alta' ? 1.35 : tid === 'media' ? 1.15 : 1.05) * sc);
        if (r.handle === 'valenjca') {
          const moto = new THREE.Group();
          const M = (col, ex = {}) => new THREE.MeshStandardMaterial({ color: col, flatShading: true, ...ex });
          const addM = (geo, col, x, y2, z, rx = 0, ry = 0, rz = 0, ex = {}) => {
            const o = new THREE.Mesh(geo, M(col, ex)); o.position.set(x, y2, z); o.rotation.set(rx, ry, rz); o.castShadow = !MOVIL; moto.add(o); return o;
          };
          addM(new THREE.CylinderGeometry(0.18, 0.18, 0.09, 10), '#1b1b1e', 0, 0.18, 0.34, 0, 0, Math.PI / 2);
          addM(new THREE.CylinderGeometry(0.18, 0.18, 0.09, 10), '#1b1b1e', 0, 0.18, -0.34, 0, 0, Math.PI / 2);
          addM(new THREE.BoxGeometry(0.14, 0.16, 0.68), '#d62828', 0, 0.32, 0);
          addM(new THREE.BoxGeometry(0.18, 0.08, 0.34), '#2b2d42', 0, 0.43, -0.02);
          addM(new THREE.CylinderGeometry(0.025, 0.025, 0.32, 6), '#adb5bd', 0, 0.46, 0.25, -0.35, 0, 0);
          addM(new THREE.BoxGeometry(0.42, 0.04, 0.04), '#adb5bd', 0, 0.6, 0.2);
          addM(new THREE.SphereGeometry(0.06, 6, 5), '#ffe599', 0, 0.44, 0.36, 0, 0, 0, { emissive: '#ffd166', emissiveIntensity: 0.7 });
          addM(new THREE.BoxGeometry(0.32, 0.28, 0.3), '#ff441f', 0, 0.59, -0.32);
          addM(new THREE.BoxGeometry(0.33, 0.06, 0.04), '#ffffff', 0, 0.62, -0.47);
          const mx = p.x + (p.face || 1) * (1.25 * sc + 0.55), mz = p.z + 0.55;
          moto.position.set(mx, this.height(mx, mz), mz);
          moto.rotation.y = 0.28;
          this.root.add(moto);
          this.addObstacle(mx, mz, 0.45);

          // Bolsito naranja de Rappi en la espalda de @valenjca
          const bag = new THREE.Group();
          const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.32, 0.2), M('#ff441f')); b1.castShadow = !MOVIL; bag.add(b1);
          const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.21), M('#ffffff')); b2.position.y = 0.03; bag.add(b2);
          this.root.add(bag);
          this.animProps.push(() => {
            const w = this.walkers?.find((x) => x.handle === 'valenjca');
            bag.visible = !!(w && !w.hidden);
            if (!bag.visible) return;
            bag.position.set(w.pos.x - Math.sin(w.dir) * 0.19, w.ground + 0.62, w.pos.z - Math.cos(w.dir) * 0.19);
            bag.rotation.y = w.dir;
          });
        }
        if (r.handle === 'therapremo5') {
          const tree = new THREE.Group();
          const M = (col, ex = {}) => new THREE.MeshStandardMaterial({ color: col, flatShading: true, ...ex });
          const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 0.9, 6), M('#6b4423'));
          tr.position.y = 0.45; tree.add(tr);
          const top = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), M('#cfd8dc', { metalness: 0.65, roughness: 0.25 }));
          top.position.y = 1.05; tree.add(top);
          [[-0.22, 0.95, 0.22], [0.24, 1.15, 0.16], [0, 1.25, -0.22]].forEach(([cx, cy, cz]) => {
            const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 8), M('#ffd166', { emissive: '#f4a261', emissiveIntensity: 0.4 }));
            coin.position.set(cx, cy, cz); coin.rotation.x = Math.PI / 2; tree.add(coin);
          });
          const tx = p.x + (p.face || 1) * (1.15 * sc + 0.45), tz = p.z - 0.55;
          tree.position.set(tx, this.height(tx, tz), tz);
          this.root.add(tree);
        }
        if (r.handle === 'el_caballo_pro') {
          const stat = new THREE.Group();
          const M = (col) => new THREE.MeshStandardMaterial({ color: col, flatShading: true });
          const addS = (geo, col, x, y2, z, rx = 0, ry = 0, rz = 0) => {
            const o = new THREE.Mesh(geo, M(col)); o.position.set(x, y2, z); o.rotation.set(rx, ry, rz); o.castShadow = !MOVIL; stat.add(o);
          };
          addS(new THREE.BoxGeometry(0.9, 0.45, 0.9), '#8d99ae', 0, 0.22, 0); // pedestal
          addS(new THREE.CylinderGeometry(0.24, 0.3, 0.65, 8), '#e9c46a', 0, 0.77, 0); // cuerpo gato
          addS(new THREE.SphereGeometry(0.24, 8, 6), '#e9c46a', 0, 1.22, 0.05); // cabeza
          addS(new THREE.ConeGeometry(0.08, 0.22, 4), '#e9c46a', -0.14, 1.46, 0.05, 0, 0, 0.25); // oreja izq
          addS(new THREE.ConeGeometry(0.08, 0.22, 4), '#e9c46a', 0.14, 1.46, 0.05, 0, 0, -0.25); // oreja der
          addS(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 6), '#f4a261', 0, 0.75, -0.32, 0.6, 0, 0); // cola
          const sx = p.x + (p.face || 1) * (1.15 * sc + 0.5), sz = p.z - 0.45;
          stat.position.set(sx, this.height(sx, sz), sz);
          this.root.add(stat);
          this.addObstacle(sx, sz, 0.5);
        }
        if (r.handle === 'levantandounlapiz') {
          const M = (col) => new THREE.MeshStandardMaterial({ color: col, flatShading: true });
          // La casa triangular A-Frame ahora es su modelo oficial (CUSTOM_TIER 'triangular') sin superposiciones
          for (let ti = 0; ti < 3; ti++) {
            const turt = new THREE.Group();
            const shell = new THREE.Mesh(new THREE.SphereGeometry(0.24, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), M('#2d6a4f'));
            turt.add(shell);
            const hd = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), M('#74c69d'));
            hd.position.set(0, 0.08, 0.26); turt.add(hd);
            const ang = (ti / 3) * Math.PI * 2;
            const tx = p.x + Math.cos(ang) * (1.25 * sc + 0.55), tz = p.z + Math.sin(ang) * (1.25 * sc + 0.55);
            turt.position.set(tx, this.height(tx, tz) + 0.04, tz);
            turt.rotation.y = ang + 1.2;
            this.root.add(turt);
          }
        }
        if (r.handle === 'santiagovideosepicosxdd-h3h') {
          const tesla = new THREE.Group();
          const M = (col, ex = {}) => new THREE.MeshStandardMaterial({ color: col, flatShading: true, ...ex });
          const addT = (geo, col, x, y2, z, ex = {}) => {
            const o = new THREE.Mesh(geo, M(col, ex)); o.position.set(x, y2, z); tesla.add(o);
          };
          addT(new THREE.BoxGeometry(0.75, 0.24, 1.5), '#f8f9fa', 0, 0, 0); // chasis Tesla
          addT(new THREE.BoxGeometry(0.65, 0.22, 0.78), '#1d3557', 0, 0.2, -0.05); // cabina vidrio
          addT(new THREE.BoxGeometry(0.55, 0.08, 0.14), '#ef233c', 0, 0.02, -0.76, { emissive: '#ef233c', emissiveIntensity: 0.8 }); // luz trasera
          addT(new THREE.BoxGeometry(0.55, 0.08, 0.14), '#7dd3fc', 0, 0.02, 0.76, { emissive: '#38bdf8', emissiveIntensity: 0.9 }); // luz delantera
          this.root.add(tesla);
          this.animProps.push((t) => {
            const a = t * 0.45;
            const rT = 13;
            const tx = TOWN.x + Math.cos(a) * rT, tz = TOWN.z + Math.sin(a) * rT;
            tesla.position.set(tx, 9.5 + Math.sin(t * 2.2) * 0.6, tz);
            tesla.rotation.y = -a;
          });
          // Among Us tripulante rojo ("El Pepe Pro") pedido por él en YouTube
          const amg = new THREE.Group();
          const aBody = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.52, 8), M('#e63946'));
          aBody.position.y = 0.36; amg.add(aBody);
          const aCap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M('#e63946'));
          aCap.position.y = 0.62; amg.add(aCap);
          const pack = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.22), M('#c1121f'));
          pack.position.set(-0.16, 0.36, 0); amg.add(pack);
          const visor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.24), M('#a8dadc'));
          visor.position.set(0.16, 0.44, 0); amg.add(visor);
          [-0.08, 0.08].forEach((pz) => {
            const pLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 6), M('#9b2226'));
            pLeg.position.set(0, 0.1, pz); amg.add(pLeg);
          });
          const ax = p.x - 1.1, az = p.z + 0.9;
          amg.position.set(ax, this.height(ax, az), az);
          this.root.add(amg);
          this.animProps.push((t) => {
            amg.position.y = this.height(ax, az) + Math.abs(Math.sin(t * 4)) * 0.07;
            amg.rotation.y = Math.sin(t * 1.5) * 0.4 + 1.2;
          });
        }
        if (r.handle === 'jopejope8284') {
          // Bandera chilena pedida por @jopejope8284 en TikTok
          const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 6), M('#ced4da'));
          mastil.position.set(p.x + 1.2 * sc, p.y + 1.4, p.z + 1.0 * sc); mastil.castShadow = !MOVIL; this.root.add(mastil);
          const flagCh = new THREE.Group();
          const blueBox = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.28, 0.03), M('#0039a6'));
          blueBox.position.set(0.175, 0.14, 0); flagCh.add(blueBox);
          const star = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.04), M('#ffffff'));
          star.position.set(0.175, 0.14, 0); star.rotation.z = Math.PI / 4; flagCh.add(star);
          const whiteBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.03), M('#ffffff'));
          whiteBox.position.set(0.625, 0.14, 0); flagCh.add(whiteBox);
          const redBox = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.03), M('#d52b1e'));
          redBox.position.set(0.45, -0.14, 0); flagCh.add(redBox);
          flagCh.position.set(p.x + 1.2 * sc, p.y + 2.5, p.z + 1.0 * sc);
          this.root.add(flagCh);
          this.animProps.push((t) => { flagCh.rotation.y = Math.sin(t * 3.5) * 0.25; });
        }
        if (r.handle === 'adr.iwaos') {
          // Efectos de magia para @adr.iwaos (Mago de Vaeloria)
          const magicGroup = new THREE.Group();
          // Caldero de hierro fundido con poción luminosa
          const caldero = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), M('#1f2421'));
          caldero.scale.set(1, 0.75, 1); caldero.position.set(0, 0.32, 0); magicGroup.add(caldero);
          const pocion = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10), M('#06d6a0', { emissive: '#06d6a0', emissiveIntensity: 1.6 }));
          pocion.position.set(0, 0.5, 0); magicGroup.add(pocion);
          // Báculo mágico con cristal rúnico
          const baculo = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.6, 6), M('#5c3a21'));
          baculo.position.set(0.65, 0.8, 0); magicGroup.add(baculo);
          const gema = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), M('#a855f7', { emissive: '#c084fc', emissiveIntensity: 2.2 }));
          gema.position.set(0.65, 1.65, 0); magicGroup.add(gema);
          // Orbes mágicos brillantes que flotan y orbitan en espiral
          const orbs = [];
          const orbCols = ['#38bdf8', '#a855f7', '#ec4899', '#06d6a0'];
          for (let oi = 0; oi < 4; oi++) {
            const orb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), M(orbCols[oi], { emissive: orbCols[oi], emissiveIntensity: 2.5 }));
            magicGroup.add(orb); orbs.push(orb);
          }
          const mx = p.x + 1.35 * sc, mz = p.z + 0.85 * sc;
          magicGroup.position.set(mx, this.height(mx, mz), mz);
          this.root.add(magicGroup);
          this.animProps.push((t) => {
            gema.rotation.y = t * 2.5;
            gema.position.y = 1.65 + Math.sin(t * 3.5) * 0.06;
            orbs.forEach((ob, oi) => {
              const ang = t * 2.8 + (oi * Math.PI) / 2;
              const rad = 0.55 + Math.sin(t * 2 + oi) * 0.15;
              ob.position.set(Math.cos(ang) * rad, 1.0 + Math.sin(t * 3.2 + oi * 1.5) * 0.45, Math.sin(ang) * rad);
            });
          });
        }
        if (r.handle === 'no_soy_zaac' || r.handle === 'shn.ww_7') {
          // Accesorios de la Mafia: maletín de negocios ilícitos y fajos de dinero
          const mafGroup = new THREE.Group();
          const maletin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.14), M('#111111'));
          maletin.position.set(0, 0.14, 0); mafGroup.add(maletin);
          const broche = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.15), M('#ced4da'));
          broche.position.set(0, 0.22, 0); mafGroup.add(broche);
          const fajo = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.12), M('#38b000'));
          fajo.position.set(0.32, 0.04, 0.08); mafGroup.add(fajo);
          const fx = p.x + 1.1 * sc, fz = p.z + 0.9 * sc;
          mafGroup.position.set(fx, this.height(fx, fz), fz);
          this.root.add(mafGroup);
        }
      });
      this.root.add(body, roof, win, fachada);
    });
  }

  // Aceras y calles adaptadas al relieve en todas las islas:
  // Cada tramo de calzada, acera y bordillo adapta sus vértices a `this.height(x, z)`
  // para seguir el terreno sin hundirse ni atravesar lomas, y respeta plaza, río y edificios.
  #aceras(state, plots = []) {
    const rxAt = (z) => riverX(z);
    const bridgeHalf = RIVER.half + RIVER.bank;
    const roadMat = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.78, flatShading: true });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: '#d3cfc6', roughness: 0.8, flatShading: true });   // hormigón
    const curbMat = new THREE.MeshStandardMaterial({ color: '#8a9096', roughness: 0.85, flatShading: true });        // bordillo
    const lineaMat = new THREE.MeshStandardMaterial({ color: '#f5f3ea', roughness: 0.6 });                           // líneas viales
    const lineas = []; // [x, y, z, girado] de cada trazo discontinuo del centro de la calzada
    const crosswalkMat = new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.65, flatShading: true });
    const lampPoleMat = new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.6, flatShading: true });
    const lampBulbMat = new THREE.MeshStandardMaterial({ color: '#ffe599', emissive: '#ffb703', emissiveIntensity: 1.2 });
    // Asfalto (salto en el tiempo: el pueblo se urbaniza): grises oscuros con leves parches para que no parezca plástico
    const cobblePalette = ['#3b3f45', '#41454c', '#383c41', '#44484f', '#3e4248'].map((c) => new THREE.Color(c));

    const roadGroup = new THREE.Group();
    const sidewalkGroup = new THREE.Group();
    const lampGroup = new THREE.Group();

    // Crea un bloque que se amolda exactamente al relieve height(x, z) en toda su longitud y pinta adoquines poligonales low-poly
    const conformMesh = (w, h, d, cx, cz, segX, segZ, yOff, mat) => {
      const geo = new THREE.BoxGeometry(w, h, d, segX, 1, segZ);
      const pos = geo.attributes.position;
      const isCobble = mat === roadMat;
      const colors = isCobble ? new Float32Array(pos.count * 3) : null;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
        const wx = cx + vx, wz = cz + vz;
        pos.setY(i, this.height(wx, wz) + vy + yOff);
        if (isCobble) {
          const cellHash = Math.abs(Math.floor(wx * 0.45) * 73856093 ^ Math.floor(wz * 0.45) * 19349663); // parches grandes, no mosaico
          const col = cobblePalette[cellHash % cobblePalette.length];
          colors[i * 3] = col.r;
          colors[i * 3 + 1] = col.g;
          colors[i * 3 + 2] = col.b;
        }
      }
      if (isCobble) geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, 0, cz);
      mesh.receiveShadow = !this.gamaBaja;
      return mesh;
    };

    // Verifica que un punto/tramo no invada el río, la plaza, la colina o edificios especiales
    const isBlocked = (x, z, pad = 0) => {
      if (Math.abs(x - rxAt(z)) < bridgeHalf + 0.5 + pad) return true;
      if (Math.hypot(x - TOWN.x, z - TOWN.z) < 6.2 + pad) return true;
      if (Math.hypot(x - FLAG.x, z - FLAG.z) < 3.4 + pad) return true;
      if (this.height(x, z) < 0.3) return true;
      for (const b of (this.buildingAnchors || [])) {
        if (Math.hypot(x - b.x, z - b.z) < 3.2 + pad) return true;
      }
      return false;
    };

    const seenH = new Map(); // key -> { cx, rz }
    const seenV = new Map(); // key -> { rx, cz }
    const cornerCount = new Map(); // key -> { ix, iz, count }
    const lamps = [];

    const addCorner = (gxEdge, gzEdge, ix, iz) => {
      const k = `${gxEdge}_${gzEdge}`;
      const c = cornerCount.get(k) || { ix, iz, count: 0 };
      c.count++;
      cornerCount.set(k, c);
    };

    // 1) Aceras y red vial alrededor de cada manzana habitada y cada parcela cívica
    const allUrbanBlocks = new Set([...(this.manzanasUsadas || []), ...(this.civicBlocks || [])]);
    for (const key of allUrbanBlocks) {
      const gx = Math.round(key / 1000);
      const gz = key - gx * 1000;
      const cx = TOWN.x + gx * PASO;
      const cz = TOWN.z + gz * PASO;
      if (this.height(cx, cz) < 0.28) continue;

      const swThickness = 0.08;
      const swWidth = 0.82;
      const blockSpan = 5.5;

      // Aceras N/S y E/O pegadas al bloque, conformadas al terreno
      [-2.6, 2.6].forEach((oz) => {
        if (!isBlocked(cx, cz + oz, -1.0)) {
          sidewalkGroup.add(conformMesh(blockSpan + swWidth * 2, swThickness, swWidth, cx, cz + oz, 6, 1, swThickness * 0.5 + 0.02, sidewalkMat));
          sidewalkGroup.add(conformMesh(blockSpan + swWidth * 2, swThickness + 0.03, 0.08, cx, cz + oz + Math.sign(oz) * (swWidth * 0.5), 6, 1, (swThickness + 0.03) * 0.5 + 0.01, curbMat));
        }
      });
      [-2.6, 2.6].forEach((ox) => {
        if (!isBlocked(cx + ox, cz, -1.0)) {
          sidewalkGroup.add(conformMesh(swWidth, swThickness, blockSpan, cx + ox, cz, 1, 6, swThickness * 0.5 + 0.02, sidewalkMat));
          sidewalkGroup.add(conformMesh(0.08, swThickness + 0.03, blockSpan, cx + ox + Math.sign(ox) * (swWidth * 0.5), cz, 1, 6, (swThickness + 0.03) * 0.5 + 0.01, curbMat));
        }
      });

      // Registrar los 4 bordes de calle de esta manzana (deduplicados entre manzanas vecinas)
      for (const dzEdge of [-0.5, 0.5]) {
        const rz = cz + dzEdge * PASO;
        const k = `H_${gx}_${gz + dzEdge}`;
        if (!seenH.has(k) && !isBlocked(cx, rz, 0)) {
          seenH.set(k, { cx, rz, gx, gzEdge: gz + dzEdge });
          addCorner(gx - 0.5, gz + dzEdge, cx - 4.0, rz);
          addCorner(gx + 0.5, gz + dzEdge, cx + 4.0, rz);
        }
      }
      for (const dxEdge of [-0.5, 0.5]) {
        const rx = cx + dxEdge * PASO;
        const k = `V_${gx + dxEdge}_${gz}`;
        if (!seenV.has(k) && !isBlocked(rx, cz, 0)) {
          seenV.set(k, { rx, cz, gxEdge: gx + dxEdge, gz });
          addCorner(gx + dxEdge, gz - 0.5, rx, cz - 4.0);
          addCorner(gx + dxEdge, gz + 0.5, rx, cz + 4.0);
        }
      }

      // Farola en esquina
      const lx = cx - Math.sign(cx - TOWN.x || 1) * 3.05;
      const lz = cz - Math.sign(cz - TOWN.z || 1) * 3.05;
      if ((Math.abs(gx) + Math.abs(gz)) % 2 === 1 && !isBlocked(lx, lz, -1.2)) lamps.push({ x: lx, z: lz });
    }

    // Construir calzadas H y V conformadas al relieve (ancho 2.0m exacto entre aceras)
    const roadSegLen = PASO - 2.0; // 6.0m entre intersecciones
    for (const { cx, rz } of seenH.values()) {
      roadGroup.add(conformMesh(roadSegLen, 0.04, 2.0, cx, rz, 6, 2, 0.02, roadMat));
      for (let d = -roadSegLen / 2 + 0.7; d < roadSegLen / 2 - 0.4; d += 1.25) lineas.push([cx + d, this.height(cx + d, rz) + 0.065, rz, 0]);
    }
    for (const { rx, cz } of seenV.values()) {
      roadGroup.add(conformMesh(2.0, 0.04, roadSegLen, rx, cz, 2, 6, 0.02, roadMat));
      for (let d = -roadSegLen / 2 + 0.7; d < roadSegLen / 2 - 0.4; d += 1.25) lineas.push([rx, this.height(rx, cz + d) + 0.065, cz + d, 1]);
    }
    if (lineas.length) { // un solo InstancedMesh para todas las líneas (barato también en móvil)
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.012, 0.09), lineaMat, lineas.length);
      const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), giro = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), uno = new THREE.Vector3(1, 1, 1);
      lineas.forEach(([x, y, z, g], i) => { mm.compose(new THREE.Vector3(x, y, z), g ? giro : qq, uno); im.setMatrixAt(i, mm); });
      roadGroup.add(im);
    }

    // Intersecciones cuadradas 2.0×2.0m en las esquinas donde se unen calles
    for (const { ix, iz, count } of cornerCount.values()) {
      if (count < 1 || isBlocked(ix, iz, 0)) continue;
      roadGroup.add(conformMesh(2.1, 0.04, 2.1, ix, iz, 2, 2, 0.02, roadMat));
      if (count >= 3) {
        // Paso de cebra limpio solo en cruces principales
        const iy = this.height(ix, iz);
        for (let s = -0.6; s <= 0.6; s += 0.4) {
          const st = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.015, 0.7), crosswalkMat);
          st.position.set(ix + s, iy + 0.045, iz + 1.35); roadGroup.add(st);
        }
      }
    }

    // 2) Bulevar principal del Puente a la Plaza (solo si hay espacio entre el estribo del puente y el borde de la plaza)
    const rx = rxAt(BRIDGE_Z);
    const bridgeEastEdge = rx + bridgeHalf - 0.2;
    const plazaWestEdge = TOWN.x - 4.2;
    const bridgeBoulevardLen = plazaWestEdge - bridgeEastEdge;
    const bridgeMidX = (bridgeEastEdge + plazaWestEdge) * 0.5;
    if (bridgeBoulevardLen > 0.6) {
      roadGroup.add(conformMesh(bridgeBoulevardLen, 0.05, 2.6, bridgeMidX, BRIDGE_Z, 6, 2, 0.025, roadMat));
      [-1.7, 1.7].forEach((az) => {
        sidewalkGroup.add(conformMesh(bridgeBoulevardLen, 0.08, 0.75, bridgeMidX, BRIDGE_Z + az, 6, 1, 0.045, sidewalkMat));
        sidewalkGroup.add(conformMesh(bridgeBoulevardLen, 0.1, 0.08, bridgeMidX, BRIDGE_Z + az - Math.sign(az) * 0.38, 6, 1, 0.05, curbMat));
      });
    }

    // 3) Rambla Comercial (lado oeste hacia la playa, cubriendo edificios comerciales y negocios)
    const commBuildings = (state.buildings || []).filter((b) => b.kind === 'mercado' || b.kind === 'taller').length;
    const nNeg = (state.negocios || []).length;
    const totalCommCols = Math.max(2, Math.ceil(commBuildings / 2) + Math.ceil(nNeg / 2));
    const westStart = rx - bridgeHalf;
    const westEnd = COMERCIO.x0 - 2.0 - totalCommCols * 6.4 - 2.5;
    const commLen = Math.abs(westStart - westEnd);
    const commMidX = (westStart + westEnd) * 0.5;
    roadGroup.add(conformMesh(commLen, 0.05, 2.6, commMidX, COMERCIO.z, 10, 2, 0.025, roadMat));
    [-1.7, 1.7].forEach((az) => {
      sidewalkGroup.add(conformMesh(commLen, 0.08, 0.75, commMidX, COMERCIO.z + az, 10, 1, 0.045, sidewalkMat));
      sidewalkGroup.add(conformMesh(commLen, 0.1, 0.08, commMidX, COMERCIO.z + az - Math.sign(az) * 0.38, 10, 1, 0.05, curbMat));
    });
    for (let x = westStart - 2.0; x >= westEnd + 2.0; x -= 5.5) {
      lamps.push({ x, z: COMERCIO.z - 2.2 }, { x, z: COMERCIO.z + 2.2 });
    }

    // 4) Caminos peatonales bien hechos conectando edificios sin camino (cancha en la playa, hospital, muelle, faro, etc.)
    const pathMat = new THREE.MeshStandardMaterial({ color: '#d8ceb8', roughness: 0.88, flatShading: true });
    const addPathSegment = (x1, z1, x2, z2, width = 1.2) => {
      const dx = x2 - x1, dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      if (len < 0.8) return;
      const segs = Math.max(2, Math.ceil(len / 1.4));
      const ang = Math.atan2(dz, dx);
      const geo = new THREE.BoxGeometry(len, 0.05, width, segs, 1, 1);
      const pos = geo.attributes.position;
      const midX = (x1 + x2) * 0.5, midZ = (z1 + z2) * 0.5;
      const cos = Math.cos(-ang), sin = Math.sin(-ang);
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i), ly = pos.getY(i), lz = pos.getZ(i);
        const wx = midX + lx * cos + lz * sin;
        const wz = midZ - lx * sin + lz * cos;
        pos.setY(i, Math.max(0.25, this.height(wx, wz)) + ly + 0.03);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, pathMat);
      mesh.position.set(midX, 0, midZ);
      mesh.rotation.y = -ang;
      mesh.receiveShadow = true;
      sidewalkGroup.add(mesh);
    };

    for (const b of (this.buildingAnchors || [])) {
      const bRx = rxAt(b.z);
      if (b.x < bRx) {
        // Lado oeste (cancha de fútbol en la playa, muelle, faro, mercado, taller): conectar a la Rambla Comercial
        const targetX = THREE.MathUtils.clamp(b.x, westEnd + 1.2, westStart - 1.2);
        const dirZ = Math.sign(COMERCIO.z - b.z) || 1;
        const startZ = b.z + dirZ * 1.8;
        if (Math.abs(b.x - targetX) > 1.5) {
          addPathSegment(b.x, b.z, b.x, COMERCIO.z, 1.3);
          addPathSegment(b.x, COMERCIO.z, targetX, COMERCIO.z, 1.3);
        } else {
          addPathSegment(b.x, startZ, targetX, COMERCIO.z, 1.3);
        }
      } else {
        // Lado este (hospital, alcaldía, escuela, comisaría, posada): conectar al Bulevar / Anillo de Plaza o calle más cercana
        let bestX = TOWN.x, bestZ = BRIDGE_Z, bestD = Infinity;
        for (const h of seenH.values()) {
          const d = Math.hypot(b.x - h.cx, b.z - h.rz);
          if (d < bestD) { bestD = d; bestX = b.x; bestZ = h.rz; }
        }
        for (const v of seenV.values()) {
          const d = Math.hypot(b.x - v.rx, b.z - v.cz);
          if (d < bestD) { bestD = d; bestX = v.rx; bestZ = b.z; }
        }
        if (bestD > 12) {
          // Conectar hacia el borde de la plaza
          const ang = Math.atan2(TOWN.z - b.z, TOWN.x - b.x);
          addPathSegment(b.x + Math.cos(ang) * 2.0, b.z + Math.sin(ang) * 2.0, TOWN.x - Math.cos(ang) * 5.0, TOWN.z - Math.sin(ang) * 5.0, 1.25);
        } else {
          addPathSegment(b.x, b.z, bestX, bestZ, 1.25);
        }
      }
    }

    // 5) Avenida Central Este-Oeste continuando el Puente Vial hacia las calles de la retícula urbana
    const hubStartX = rxAt(BRIDGE_Z) + bridgeHalf + 0.6;
    const hubRightX = TOWN.x + PASO * 0.5;
    const ringTopZ = -PASO * 0.5;
    const ringBotZ = PASO * 0.5;
    const hubSpanX = Math.max(2.0, hubRightX - hubStartX);
    roadGroup.add(conformMesh(hubSpanX + 1.2, 0.04, 2.4, (hubStartX + hubRightX) * 0.5, BRIDGE_Z, 6, 2, 0.02, roadMat));
    roadGroup.add(conformMesh(2.4, 0.04, PASO + 2.0, hubRightX, BRIDGE_Z, 2, 6, 0.02, roadMat));

    // Ruta de circulación vial completa (Avenida Comercial -> Puente Vial Asfaltado -> Avenida Central -> Avenidas del pueblo -> regreso)
    const loopPts = [
      { x: westEnd + 2.5, z: COMERCIO.z + 0.55 },
      { x: hubRightX, z: BRIDGE_Z + 0.55 },
      { x: hubRightX, z: ringBotZ },
    ];
    if (seenV.size > 0) {
      const eastV = [...seenV.values()].sort((a, b) => Math.hypot(a.rx - hubRightX, a.cz) - Math.hypot(b.rx - hubRightX, b.cz))[0];
      if (eastV && eastV.rx > hubRightX + 1.5 && Math.abs(eastV.rx - rxAt(0)) > bridgeHalf + 1.0) {
        roadGroup.add(conformMesh(eastV.rx - hubRightX, 0.04, 2.2, (hubRightX + eastV.rx) * 0.5, ringBotZ, 4, 2, 0.02, roadMat));
        roadGroup.add(conformMesh(eastV.rx - hubRightX, 0.04, 2.2, (hubRightX + eastV.rx) * 0.5, ringTopZ, 4, 2, 0.02, roadMat));
        roadGroup.add(conformMesh(2.2, 0.04, ringBotZ - ringTopZ + 2.2, eastV.rx, 0, 2, 6, 0.02, roadMat));
        loopPts.push({ x: eastV.rx, z: ringBotZ });
        loopPts.push({ x: eastV.rx, z: ringTopZ });
      }
    }
    loopPts.push(
      { x: hubRightX, z: ringTopZ },
      { x: hubRightX, z: BRIDGE_Z - 0.55 },
      { x: westEnd + 2.5, z: COMERCIO.z - 0.55 }
    );
    this.ambulanceLoop = loopPts;

    // Auto de Policía patrullando la ciudad (si hay comisaría o al menos 15 habitantes)
    if (this.buildingByKind?.comisaria || (state.residents || []).length >= 15) {
      const Mp = (c, ex = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...ex });
      const cop = new THREE.Group();
      const bodyW = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.58, 1.38), Mp('#0f172a'));
      bodyW.position.y = 0.52; cop.add(bodyW);
      const doors = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.59, 1.4), Mp('#f8fafc'));
      doors.position.y = 0.52; cop.add(doors);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.46, 1.2), Mp('#f8fafc'));
      cabin.position.set(-0.08, 1.0, 0); cop.add(cabin);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.34, 1.08), Mp('#1e293b', { roughness: 0.2, metalness: 0.5 }));
      glass.position.set(-0.08, 0.99, 0); cop.add(glass);
      [[-0.85, -0.66], [-0.85, 0.66], [0.85, -0.66], [0.85, 0.66]].forEach(([wx, wz]) => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.15, 10), Mp('#1b1b1e'));
        wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, 0.22, wz); cop.add(wheel);
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.17, 8), Mp('#cbd5e1'));
        rim.rotation.x = Math.PI / 2; rim.position.set(wx, 0.22, wz); cop.add(rim);
      });
      const barBase = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.68), Mp('#334155'));
      barBase.position.set(-0.05, 1.26, 0); cop.add(barBase);
      const copRed = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.26), Mp('#ef233c', { emissive: '#ef233c', emissiveIntensity: 1.5 }));
      copRed.position.set(-0.05, 1.34, -0.18); cop.add(copRed);
      const copBlue = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.26), Mp('#2563eb', { emissive: '#38bdf8', emissiveIntensity: 1.5 }));
      copBlue.position.set(-0.05, 1.34, 0.18); cop.add(copBlue);
      [-0.4, 0.4].forEach((hz) => {
        const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.13, 0.22), Mp('#fff3b0', { emissive: '#ffe082', emissiveIntensity: 1.6 }));
        hl.position.set(1.52, 0.5, hz); cop.add(hl);
      });
      cop.scale.setScalar(S * 0.86);
      cop.traverse((o) => { o.castShadow = !MOVIL; o.receiveShadow = true; });
      this.root.add(cop);
      this.policeCarObj = cop;

      this.animProps.push((t) => {
        const blink = Math.sin(t * 16) > 0;
        copRed.material.emissiveIntensity = blink ? 2.6 : 0.2;
        copBlue.material.emissiveIntensity = blink ? 0.2 : 2.6;
        const pts = this.ambulanceLoop;
        if (!pts?.length) return;
        const segLens = []; let totalLen = 0;
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i], b = pts[(i + 1) % pts.length];
          const len = Math.hypot(b.x - a.x, b.z - a.z);
          segLens.push(len); totalLen += len;
        }
        const speed = 4.6;
        let d = (t * speed + totalLen * 0.5) % Math.max(1, totalLen);
        let px = pts[0].x, pz = pts[0].z, yaw = 0;
        for (let i = 0; i < pts.length; i++) {
          if (d <= segLens[i] || i === pts.length - 1) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            const f = segLens[i] > 0.001 ? d / segLens[i] : 0;
            px = a.x + (b.x - a.x) * f; pz = a.z + (b.z - a.z) * f;
            yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
            break;
          }
          d -= segLens[i];
        }
        const brX = riverX(BRIDGE_Z);
        const onBr = Math.abs(pz - BRIDGE_Z) < 1.8 && Math.abs(px - brX) < (RIVER.half + RIVER.bank + 0.9);
        const py = onBr ? TOWN.h + 0.1 : Math.max(0.28, this.height(px, pz)) + 0.03;
        cop.position.set(px, py, pz);
        cop.rotation.y = yaw;
      });
    }

    // Guardar puntos de ruta vial para circulación de vehículos (ambulancia)
    this.roadAvenueRange = {
      westX: westEnd + 1.5,
      eastX: TOWN.x - 4.2,
      z: BRIDGE_Z,
      boulevardMidX: bridgeMidX,
    };

    this.root.add(roadGroup, sidewalkGroup);

    // Farolas clásicas con iluminación cálida
    if (lamps.length) {
      const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.045, 0.07, 1.85, 6), lampPoleMat, lamps.length);
      const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 6, 5), lampBulbMat, lamps.length);
      const dummy = new THREE.Object3D();
      lamps.forEach((l, i) => {
        const y = Math.max(0.3, this.height(l.x, l.z));
        dummy.position.set(l.x, y + 0.92, l.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        poles.setMatrixAt(i, dummy.matrix);
        dummy.position.set(l.x, y + 1.9, l.z); dummy.updateMatrix();
        bulbs.setMatrixAt(i, dummy.matrix);
      });
      lampGroup.add(poles, bulbs);
      this.root.add(lampGroup);
    }

    // 4) Pequeño jardín animado junto a cada casa (arbustitos + flores que se mecen con la brisa)
    if (plots.length) {
      const nG = plots.length;
      const soilMat = new THREE.MeshStandardMaterial({ color: '#5c4033', flatShading: true });
      const leafMat = new THREE.MeshStandardMaterial({ color: '#4d9043', flatShading: true });
      const flwMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true });
      const soil = new THREE.InstancedMesh(new THREE.BoxGeometry(0.68, 0.08, 0.44), soilMat, nG);
      const leaves = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.18, 0), leafMat, nG * 2);
      const flowers = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.09, 0), flwMat, nG * 3);
      const flwGroup = new THREE.Group();
      flwGroup.add(leaves, flowers);
      const FCOL = [new THREE.Color('#ff6b6b'), new THREE.Color('#ffd166'), new THREE.Color('#f78fb3'), new THREE.Color('#a29bfe')];
      const dummy = new THREE.Object3D();
      plots.forEach((p, i) => {
        const face = p.face || 1;
        const gx = p.x + face * 0.96, gz = p.z + (i % 2 ? 0.56 : -0.56);
        const gy = this.height(gx, gz);
        dummy.position.set(gx, gy + 0.03, gz); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        soil.setMatrixAt(i, dummy.matrix);
        for (let b = 0; b < 2; b++) {
          dummy.position.set(gx + (b ? 0.16 : -0.16), gy + 0.14, gz);
          dummy.scale.setScalar(b ? 0.85 : 1.0); dummy.updateMatrix();
          leaves.setMatrixAt(i * 2 + b, dummy.matrix);
        }
        for (let f = 0; f < 3; f++) {
          dummy.position.set(gx + (f - 1) * 0.18, gy + 0.25 + (f % 2) * 0.05, gz + (f === 1 ? 0.08 : -0.06));
          dummy.scale.setScalar(1); dummy.updateMatrix();
          flowers.setMatrixAt(i * 3 + f, dummy.matrix);
          flowers.setColorAt(i * 3 + f, FCOL[(i + f) % FCOL.length]);
        }
      });
      if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
      soil.receiveShadow = true;
      this.root.add(soil, flwGroup);
      this.animProps.push((t) => {
        flwGroup.position.x = Math.sin(t * 1.9) * 0.035;
        flwGroup.position.z = Math.cos(t * 1.5) * 0.025;
      });
    }

    // Placa municipal de la Recaudadora junto al camino del puente
    const px = TOWN.x - 3.6, pz = BRIDGE_Z + 1.55, py = this.height(px, pz);
    const placa = new THREE.Group();
    const M = (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true });
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 6), M('#5c4033')); poste.position.y = 0.45; placa.add(poste);
    const cartel = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.45, 0.08), M('#f4a261')); cartel.position.y = 0.95; placa.add(cartel);
    placa.position.set(px, py, pz);
    this.root.add(placa);
  }

  // Casas en construcción: seguidores nuevos cuyo @ todavía no está en la lista (andamio + cartel)
  #obras() {
    const n = this.obras.length; if (!n) return;
    const base = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 0.25, 2), new THREE.MeshStandardMaterial({ color: '#b08968', flatShading: true }), n);
    const palos = new THREE.InstancedMesh(new THREE.BoxGeometry(2.1, 1.7, 2.1), new THREE.MeshStandardMaterial({ color: '#e9c46a', wireframe: true }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(S, S, S);
    this.obras.forEach((p, i) => { p.y = this.height(p.x, p.z);
      m.compose(new THREE.Vector3(p.x, p.y + 0.12 * S, p.z), q, sc); base.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, p.y + 0.95 * S, p.z), q, sc); palos.setMatrixAt(i, m);
      this.addObstacle(p.x, p.z, 1.0 * S); });
    base.userData.pick = { type: 'obra', n }; palos.userData.pick = { type: 'obra', n }; this.pickables.push(base);
    this.root.add(base, palos);
    const c = this.obras[0]; this.#label(`🏗️ ${n} casa${n > 1 ? 's' : ''} en obras`, new THREE.Vector3(c.x, c.y + 2.6, c.z), 'lbl lbl-building');
  }

  // Calle del Comercio: cada emprendimiento es un puesto con el nombre y color que eligió su dueño; crece con el nivel
  #negocios(state) {
    this.negocioPos = new Map();
    const commBuildings = (state.buildings || []).filter((b) => b.kind === 'mercado' || b.kind === 'taller').length;
    const commCols = Math.ceil(commBuildings / 2);
    (state.negocios || []).forEach((n, i) => {
      const colIdx = Math.floor(i / 2) % 5; const fila = Math.floor(i / 10);
      const lado = i % 2 ? 1 : -1;
      const x = COMERCIO.x0 - 2.0 - (commCols + colIdx) * 6.4;
      const z = COMERCIO.z + lado * (COMERCIO.fondo + 2.1 + fila * 5.2);
      const y = this.height(x, z);
      const g = new THREE.Group(); const M = (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true });
      // Un edificio es un negocio: según el rubro tiene identidad visual propia (edificio, cafetería, restaurante, taller o tienda)
      const rubro = `${n.rubro || ''} ${n.nombre || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const tipo = /edificio|torre|hotel|rascacielos|oficina|banco|apartament|departament|empresa|condominio|castillo|mansion/.test(rubro) ? 'edificio'
        : /cafe|panader|pastel|helad|postre|dulce/.test(rubro) ? 'cafeteria'
        : /restauran|bar\b|comida|cocina|pizz|hambur|sushi|taco|fonda|parrilla/.test(rubro) ? 'restaurante'
        : /taller|herrer|mecanic|tech|invent|repara|forja|arte|dise/.test(rubro) ? 'taller'
        : 'puesto';
      n.tipo = tipo; const col = n.color || '#e76f51'; const frente = -lado;
      const caja = (w, h, d, c, x, y2, z2, mat) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || M(c)); o.position.set(x, y2, z2); g.add(o); return o; };
      let alto;
      if (tipo === 'edificio') {
        const pisos = 2 + Math.min(6, n.nivel); const hp = 0.95; alto = pisos * hp + 0.3;
        caja(2.44, 0.28, 2.06, '#6c757d', 0, 0.14, 0); // zócalo de piedra
        caja(2.4, alto, 2.0, '#e9e4dc', 0, alto / 2, 0);
        for (let p = 0; p < pisos; p++) {
          caja(2.48, 0.09, 2.08, col, 0, 0.3 + (p + 1) * hp - 0.04, 0);
          if (p) for (const wx of [-0.65, 0, 0.65]) {
            caja(0.48, 0.54, 0.04, '#2b2d42', wx, 0.3 + p * hp + 0.45, frente * 1.0, null);
            caja(0.38, 0.44, 0.05, '', wx, 0.3 + p * hp + 0.45, frente * 1.01, this.windowMat);
          }
        }
        caja(2.54, 0.22, 2.14, col, 0, alto + 0.11, 0); caja(0.5, 0.6, 0.5, '#9aa0a6', 0.6, alto + 0.5, 0.3);
        caja(0.05, 0.95, 0.05, '#495057', -0.65, alto + 0.68, -0.35);
        const luz = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 5), new THREE.MeshStandardMaterial({ color: '#ff4d6d', emissive: '#ff4d6d', emissiveIntensity: 0.9 }));
        luz.position.set(-0.65, alto + 1.2, -0.35); g.add(luz);
        this.animProps.push((t) => { luz.material.emissiveIntensity = 0.35 + 0.65 * Math.abs(Math.sin(t * 2.4 + i)); });
        caja(0.92, 1.12, 0.05, '#2b2d42', 0, 0.56, frente * 1.0);
        caja(0.76, 1.0, 0.06, '#334155', 0, 0.5, frente * 1.02);
        caja(1.55, 0.12, 0.62, col, 0, 1.16, frente * 1.22);
        caja(1.36, 0.26, 0.1, '#1d2b36', 0, 1.48, frente * 1.04);
      } else {
        alto = 1.45 + Math.min(4, n.nivel - 1) * 0.42;
        caja(2.54, 0.18, 2.16, '#8d99ae', 0, 0.09, 0);
        caja(2.5, alto, 2.1, tipo === 'taller' ? '#d8cfc4' : '#f4e8d1', 0, alto / 2, 0);
        if (tipo === 'taller') {
          // Techo industrial en diente de sierra + portón amplio
          caja(2.64, 0.2, 2.24, '#495057', 0, alto + 0.1, 0);
          caja(1.3, 0.55, 2.16, col, -0.5, alto + 0.42, 0).rotation.z = -0.25;
          caja(1.3, 0.55, 2.16, '#6c757d', 0.5, alto + 0.42, 0).rotation.z = -0.25;
          caja(1.45, 1.15, 0.08, '#343a40', 0, 0.58, frente * 1.06);
          caja(0.28, 0.85, 0.28, '#495057', 0.8, alto + 0.6, -0.5);
        } else {
          caja(2.68, 0.24, 2.28, col, 0, alto + 0.12, 0);
          // Toldo rayado bicolor
          caja(2.74, 0.15, 1.15, col, 0, alto * 0.74, frente * 1.42).rotation.x = -frente * 0.35;
          caja(0.54, 0.17, 1.16, '#ffffff', -0.68, alto * 0.74, frente * 1.42).rotation.x = -frente * 0.35;
          caja(0.54, 0.17, 1.16, '#ffffff', 0.68, alto * 0.74, frente * 1.42).rotation.x = -frente * 0.35;
        }
        caja(1.56, 0.3, 0.12, '#1d2b36', 0, alto + 0.08, frente * 1.16);
        if (tipo !== 'taller') {
          caja(0.84, 1.06, 0.05, '#3d2817', 0, 0.53, frente * 1.05);
          caja(0.7, 0.98, 0.06, '#6f4518', 0, 0.5, frente * 1.07);
          for (const wx of [-0.78, 0.78]) {
            caja(0.58, 0.52, 0.04, '#3d2817', wx, alto * 0.46, frente * 1.05);
            caja(0.46, 0.42, 0.05, '', wx, alto * 0.46, frente * 1.06, this.windowMat);
          }
        }
        const farol = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb703', emissiveIntensity: 0.75 }));
        farol.position.set(0.95, alto * 0.62, frente * 1.65); g.add(farol);
        this.animProps.push((t) => { farol.position.x = 0.95 + Math.sin(t * 2.1 + i) * 0.07; });
        if (tipo === 'cafeteria') {
          // Taza gigante emblemática en el techo + mesitas de café
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.42, 10), M('#ffffff'));
          cup.position.set(0, alto + 0.45, 0); g.add(cup);
          const asa = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 10), M('#ffffff'));
          asa.position.set(0.32, alto + 0.45, 0); g.add(asa);
          for (const tx of [-0.7, 0.7]) {
            const mz = frente * 1.75; caja(0.05, 0.52, 0.05, '#5c4033', tx, 0.26, mz); caja(0.5, 0.05, 0.5, '#fff', tx, 0.54, mz);
            const som = new THREE.Mesh(new THREE.ConeGeometry(0.52, 0.28, 8), M(col)); som.position.set(tx, 1.28, mz); g.add(som);
            caja(0.03, 0.75, 0.03, '#5c4033', tx, 0.92, mz);
          }
          const vapor = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), M('#ffffff'));
          vapor.position.set(0, alto + 0.85, 0); g.add(vapor);
          this.animProps.push((t) => { const k = (t * 0.6 + i * 0.3) % 1; vapor.position.y = alto + 0.8 + k * 0.75; vapor.scale.setScalar(0.55 + k * 0.6); });
        } else if (tipo === 'restaurante') {
          for (const tx of [-0.72, 0.78]) {
            const mz = frente * 1.8; caja(0.06, 0.55, 0.06, '#5c4033', tx, 0.28, mz); caja(0.58, 0.06, 0.58, '#fff', tx, 0.56, mz);
            const som = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.32, 8), M(col)); som.position.set(tx, 1.32, mz); g.add(som); caja(0.03, 0.8, 0.03, '#5c4033', tx, 0.95, mz);
          }
          caja(0.28, 0.65, 0.28, '#9b2226', -0.45, alto + 0.42, -0.35);
          const vapor = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), M('#ffffff'));
          vapor.position.set(-0.45, alto + 0.85, -0.35); g.add(vapor);
          this.animProps.push((t) => { const k = (t * 0.55 + i * 0.3) % 1; vapor.position.y = alto + 0.8 + k * 0.85; vapor.scale.setScalar(0.6 + k * 0.6); });
        } else if (tipo === 'puesto') {
          // Cajas de exhibición/productos frente a la tienda
          caja(0.46, 0.3, 0.36, '#bc6c25', -0.78, 0.24, frente * 1.42);
          caja(0.42, 0.26, 0.34, '#e9c46a', -0.78, 0.45, frente * 1.42);
          caja(0.48, 0.3, 0.36, '#bc6c25', 0.78, 0.24, frente * 1.42);
          caja(0.36, 0.18, 0.28, '#e63946', 0.78, 0.44, frente * 1.42);
        }
      }
      g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
      g.position.set(x, y, z); g.scale.setScalar(S); this.root.add(g);
      g.userData.pick = { type: 'negocio', negocio: n, pos: g.position.clone() }; this.pickables.push(g);
      this.addObstacle(x, z, 1.3 * S); this.negocioPos.set(n.id, new THREE.Vector3(x, y, z - lado * 1.5));
      this.#label(`${{ edificio: '🏢', restaurante: '🍽️' }[n.tipo] || '🏪'} ${n.nombre} · nv ${n.nivel}`, new THREE.Vector3(x, y + alto * S + 1.2, z), 'lbl lbl-shop');
    });
  }

  buildingMesh(kind, label = '') {
    const g = new THREE.Group(); const M = (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true });
    const add = (geo, c, y = 0, x = 0, z = 0) => { const o = new THREE.Mesh(geo, M(c)); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
    switch (kind) {
      case 'faro': {
        // Base octogonal de piedra + torre con franjas + galería de observación + casita del farero
        add(new THREE.CylinderGeometry(2.2, 2.5, 1.2, 8), '#8d99ae', 0.6);
        add(new THREE.CylinderGeometry(1.25, 1.85, 10.2, 10), '#f4f1ea', 5.4);
        add(new THREE.CylinderGeometry(1.62, 1.72, 1.35, 10), '#d64545', 3.0);
        add(new THREE.CylinderGeometry(1.42, 1.52, 1.35, 10), '#d64545', 6.4);
        add(new THREE.CylinderGeometry(1.68, 1.45, 0.45, 10), '#3d405b', 10.35);
        this.beacon = add(new THREE.CylinderGeometry(0.95, 0.95, 1.4, 10), '#ffe08a', 11.25);
        this.beacon.material.emissive = new THREE.Color('#ffcc55');
        add(new THREE.ConeGeometry(1.45, 1.5, 10), '#3d405b', 12.65);
        add(new THREE.BoxGeometry(2.1, 1.4, 1.8), '#ede0d4', 0.9, 2.3, 0.4);
        add(new THREE.ConeGeometry(1.75, 0.9, 4), '#bc4749', 2.05, 2.3, 0.4).rotation.y = Math.PI / 4;
        break;
      }
      case 'plaza': {
        // Plaza escalonada compacta que encaja íntegra dentro de una manzana urbana (sin invadir calles)
        add(new THREE.CylinderGeometry(3.5, 3.65, 0.24, 24), '#d8cfb8', 0.12);
        add(new THREE.CylinderGeometry(3.15, 3.25, 0.12, 24), '#ece2cc', 0.28);
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          const bx = Math.cos(a) * 2.35, bz = Math.sin(a) * 2.35;
          const bench = add(new THREE.BoxGeometry(1.15, 0.2, 0.45), '#8d5a2b', 0.44, bx, bz); bench.rotation.y = -a + Math.PI / 2;
          const post = add(new THREE.CylinderGeometry(0.06, 0.08, 1.85, 6), '#2b303a', 1.2, Math.cos(a + 0.35) * 2.9, Math.sin(a + 0.35) * 2.9);
          const fBulb = add(new THREE.OctahedronGeometry(0.16, 0), '#ffe5a3', 2.18, Math.cos(a + 0.35) * 2.9, Math.sin(a + 0.35) * 2.9);
          fBulb.material.emissive = new THREE.Color('#ffaa33'); fBulb.material.emissiveIntensity = 0.85;
        }
        add(new THREE.CylinderGeometry(1.25, 1.4, 0.44, 16), '#a5a58d', 0.52);
        add(new THREE.CylinderGeometry(1.05, 1.05, 0.14, 16), '#4cc9f0', 0.76);
        add(new THREE.CylinderGeometry(0.42, 0.55, 0.78, 12), '#8d99ae', 1.02);
        add(new THREE.CylinderGeometry(0.75, 0.48, 0.18, 12), '#b8b8a4', 1.38);
        const chorro = add(new THREE.CylinderGeometry(0.12, 0.24, 0.75, 8), '#90e0ef', 1.75);
        this.animProps.push((t) => { chorro.scale.y = 0.75 + Math.sin(t * 4.5) * 0.28; chorro.position.y = 1.6 + chorro.scale.y * 0.25; });
        break;
      }
      case 'muelle': {
        // Muelle entablado con pilotes reforzados, bolardos de amarre, caseta de pesca y faroles portuarios
        add(new THREE.BoxGeometry(2.6, 0.18, 14.2), '#6f4518', 0.35, 0, 6);
        for (let i = 0; i < 16; i++) {
          add(new THREE.BoxGeometry(2.72, 0.08, 0.72), i % 2 ? '#9c6644' : '#8a5838', 0.48, 0, -0.4 + i * 0.88);
        }
        for (let i = 0; i < 6; i++) {
          const sx = i % 2 ? 1.15 : -1.15, sz = 1.2 + Math.floor(i / 2) * 5.2;
          add(new THREE.CylinderGeometry(0.2, 0.24, 3.2, 7), '#5c3a21', -0.9, sx, sz);
          add(new THREE.CylinderGeometry(0.14, 0.16, 0.42, 7), '#3d405b', 0.72, sx * 0.92, sz);
        }
        // Cobertizo de madera en la entrada y faroles al final del muelle
        add(new THREE.BoxGeometry(1.1, 0.9, 1.1), '#bc6c25', 0.95, -0.7, 1.8);
        add(new THREE.BoxGeometry(0.65, 0.45, 0.65), '#dda15e', 0.75, 0.7, 2.2);
        for (const sx of [-1.05, 1.05]) {
          add(new THREE.CylinderGeometry(0.05, 0.07, 1.6, 6), '#2b303a', 1.3, sx, 12.6);
          const ml = add(new THREE.OctahedronGeometry(0.16, 0), '#ffe5a3', 2.15, sx, 12.6);
          ml.material.emissive = new THREE.Color('#ffaa33'); ml.material.emissiveIntensity = 0.9;
        }
        // Barquito pesquero amarrado al costado del muelle
        const boat = new THREE.Group();
        const bMat = (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true });
        const hull = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.52, 3.2), bMat('#8d5524'));
        hull.position.y = 0.16; boat.add(hull);
        const bow = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.05, 4), bMat('#a4632a'));
        bow.rotation.x = Math.PI / 2; bow.rotation.y = Math.PI / 4; bow.position.set(0, 0.2, 2.05); boat.add(bow);
        const deck = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.08, 2.9), bMat('#ddb892'));
        deck.position.y = 0.42; boat.add(deck);
        const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.72, 1.1), bMat('#f8fafc'));
        cabin.position.set(0, 0.78, -0.35); boat.add(cabin);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.1, 1.24), bMat('#2563eb'));
        roof.position.set(0, 1.18, -0.35); boat.add(roof);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 6), bMat('#475569'));
        mast.position.set(0, 1.45, 0.55); boat.add(mast);
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.9, 5), bMat('#e2e8f0'));
        rod.rotation.x = 0.65; rod.position.set(0.55, 1.05, 1.35); boat.add(rod);
        boat.position.set(2.45, 0.08, 10.6);
        boat.rotation.y = 0.14;
        g.add(boat);
        this.animProps.push((t) => {
          boat.position.y = 0.08 + Math.sin(t * 2.1) * 0.09;
          boat.rotation.z = Math.sin(t * 1.7) * 0.045;
          boat.rotation.x = Math.cos(t * 1.4) * 0.03;
        });
        break;
      }
      case 'mercado': {
        for (let i = 0; i < 3; i++) {
          add(new THREE.BoxGeometry(2.2, 1.25, 1.45), '#ddb892', 0.62, i * 3 - 3);
          add(new THREE.BoxGeometry(2.6, 0.24, 1.85), ['#e63946', '#2a9d8f', '#f4a261'][i], 1.92, i * 3 - 3);
          add(new THREE.BoxGeometry(0.7, 0.35, 0.5), ['#ff9f1c', '#80ed99', '#ffd166'][i], 0.3, i * 3 - 3, 0.95);
        }
        const farol = new THREE.Mesh(new THREE.SphereGeometry(0.22, 6, 5), new THREE.MeshStandardMaterial({ color: '#ffd166', emissive: '#ffb703', emissiveIntensity: 0.75 }));
        farol.position.set(0, 2.25, 0.85); g.add(farol);
        this.animProps.push((t) => { farol.position.x = Math.sin(t * 2.2) * 0.14; });
        break;
      }
      case 'escuela': {
        add(new THREE.BoxGeometry(6, 2.6, 3.5), '#f2cc8f', 1.3);
        add(new THREE.ConeGeometry(4.2, 1.6, 4), '#bc4749', 3.4).rotation.y = Math.PI / 4;
        add(new THREE.BoxGeometry(1.1, 1.4, 0.1), '#5c4033', 0.7, 0, 1.78);
        add(new THREE.CylinderGeometry(0.45, 0.45, 0.12, 12), '#ffffff', 2.2, 0, 1.78).rotation.x = Math.PI / 2;
        const campana = add(new THREE.ConeGeometry(0.32, 0.45, 8), '#ffd166', 4.35);
        this.animProps.push((t) => { campana.rotation.z = Math.sin(t * 2.8) * 0.22; });
        break;
      }
      case 'fogata': add(new THREE.ConeGeometry(0.9, 1.6, 6), '#ff7b00', 0.8).material.emissive = new THREE.Color('#ff5400'); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(new THREE.BoxGeometry(1.6, 0.4, 0.5), '#6f4518', 0.25, Math.cos(a) * 2.6, Math.sin(a) * 2.6).rotation.y = -a; } break;
      case 'ayuntamiento': {
        // Palacio Municipal / Alcaldía estilo Neoclásico representativo
        // Escalinata ceremonial de piedra
        add(new THREE.BoxGeometry(8.6, 0.22, 6.6), '#ced4da', 0.11);
        add(new THREE.BoxGeometry(7.8, 0.22, 6.0), '#dee2e6', 0.33);
        add(new THREE.BoxGeometry(7.2, 0.22, 5.6), '#e9ecef', 0.55);
        // Cuerpo principal del palacio
        add(new THREE.BoxGeometry(7.0, 3.6, 5.0), '#f8f9fa', 2.45);
        // Cornisa decorativa y entablamento
        add(new THREE.BoxGeometry(7.4, 0.32, 5.4), '#ced4da', 4.41);
        // Pórtico clásico con 6 columnas frontales estriadas
        for (let col = 0; col < 6; col++) {
          const cx = -2.8 + col * 1.12;
          add(new THREE.CylinderGeometry(0.2, 0.24, 3.6, 10), '#ffffff', 2.45, cx, 2.7);
          add(new THREE.BoxGeometry(0.52, 0.15, 0.52), '#e9ecef', 0.72, cx, 2.7);
          add(new THREE.BoxGeometry(0.52, 0.15, 0.52), '#e9ecef', 4.32, cx, 2.7);
        }
        // Frontón triangular (tímpano clásico) con escudo dorado
        const fronton = add(new THREE.ConeGeometry(4.4, 1.5, 4), '#f1faee', 5.3, 0, 1.4);
        fronton.rotation.y = Math.PI / 4; fronton.scale.set(1.0, 1.0, 0.5);
        const escudo = add(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 12), '#ffb703', 4.95, 0, 2.65);
        escudo.rotation.x = Math.PI / 2;
        // Gran puerta doble de caoba con arco
        add(new THREE.BoxGeometry(1.4, 2.2, 0.12), '#4a2c16', 1.75, 0, 2.55);
        add(new THREE.CylinderGeometry(0.7, 0.7, 0.12, 16, 1, false, 0, Math.PI), '#4a2c16', 2.85, 0, 2.55).rotation.z = Math.PI / 2;
        [-0.22, 0.22].forEach((hx) => add(new THREE.SphereGeometry(0.06, 6, 5), '#ffd166', 1.75, hx, 2.63));
        // Balcón municipal para discursos en el segundo piso
        add(new THREE.BoxGeometry(2.6, 0.12, 0.7), '#e9ecef', 3.05, 0, 2.75);
        add(new THREE.BoxGeometry(2.6, 0.45, 0.08), '#ffffff', 3.32, 0, 3.05);
        [-1.25, 1.25].forEach((bx) => add(new THREE.BoxGeometry(0.08, 0.45, 0.7), '#ffffff', 3.32, bx, 2.75));
        // Ventanales señoriales a los lados
        [-2.0, 2.0].forEach((wx) => {
          add(new THREE.BoxGeometry(0.85, 1.4, 0.08), '#d8f3dc', 2.0, wx, 2.55);
          add(new THREE.BoxGeometry(0.85, 1.4, 0.08), '#d8f3dc', 3.6, wx, 2.55);
        });
        // Placa grabada "ALCALDÍA"
        add(new THREE.BoxGeometry(2.2, 0.35, 0.1), '#1b263b', 4.0, 0, 2.72);
        // Torre cívica del reloj en el techo
        add(new THREE.BoxGeometry(2.4, 2.6, 2.4), '#e9ecef', 5.85, 0, 0);
        add(new THREE.BoxGeometry(2.6, 0.22, 2.6), '#ced4da', 7.25, 0, 0);
        // Esfera del reloj en las 4 caras
        [[0, 1.22, Math.PI / 2], [0, -1.22, -Math.PI / 2], [1.22, 0, 0], [-1.22, 0, Math.PI]].forEach(([rx, rz, ry]) => {
          const reloj = add(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 16), '#ffffff', 5.95, rx, rz);
          reloj.rotation.x = Math.PI / 2; reloj.rotation.z = ry;
          reloj.material.emissive = new THREE.Color('#fffbe6'); reloj.material.emissiveIntensity = 0.5;
          add(new THREE.BoxGeometry(0.05, 0.32, 0.1), '#212529', 6.05, rx, rz + (rz !== 0 ? (rz > 0 ? 0.02 : -0.02) : 0));
        });
        // Cúpula de cobre patinado y campana cívica
        add(new THREE.ConeGeometry(1.6, 1.8, 8), '#2a9d8f', 8.25, 0, 0);
        // Mástil y bandera de la alcaldía
        add(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), '#ffffff', 9.8, 0, 0);
        const flagAlcaldia = add(new THREE.BoxGeometry(0.9, 0.55, 0.04), '#e63946', 10.4, 0.45, 0);
        this.animProps.push((t) => { flagAlcaldia.rotation.y = Math.sin(t * 3.0) * 0.2; });
        break;
      }
      case 'hallazgo': { // algo que trajo el mar: caja de madera medio enterrada en la arena + botella
        const box = add(new THREE.BoxGeometry(1.6, 1.1, 1.2), '#a47148', 0.35); box.rotation.set(0.15, 0.5, 0.08);
        add(new THREE.BoxGeometry(1.7, 0.12, 0.16), '#6f4518', 0.75, 0, 0.45).rotation.y = 0.5;
        const bottle = add(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 8), '#7ec4cf', 0.15, 1.4, 0.6); bottle.rotation.z = Math.PI / 2.3;
        bottle.material.transparent = true; bottle.material.opacity = 0.75; break;
      }
      case 'hospital': {
        add(new THREE.BoxGeometry(6, 2.8, 4), '#f8f9fa', 1.4); add(new THREE.BoxGeometry(6.3, 0.3, 4.3), '#adb5bd', 2.95);
        add(new THREE.BoxGeometry(1.6, 0.45, 0.1), '#e63946', 2.0, 0, 2.06); add(new THREE.BoxGeometry(0.45, 1.6, 0.1), '#e63946', 2.0, 0, 2.06); // cruz roja
        add(new THREE.BoxGeometry(1.2, 1.6, 0.1), '#90e0ef', 0.8, -2, 2.03); add(new THREE.BoxGeometry(1.2, 1.6, 0.1), '#90e0ef', 0.8, 2, 2.03);

        // Ambulancia de emergencias circulando por la calle con sirenas encendidas
        const amb = new THREE.Group();
        const ambBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.25, 1.3), M('#ffffff')); ambBody.position.y = 0.8; amb.add(ambBody);
        const ambCab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.78, 1.26), M('#ffffff')); ambCab.position.set(1.4, 0.72, 0); amb.add(ambCab);
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 1.28), M('#38bdf8', { transparent: true, opacity: 0.8 })); glass.position.set(1.32, 0.86, 0); amb.add(glass);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.58, 0.16, 1.34), M('#d90429')); stripe.position.y = 0.78; amb.add(stripe);
        [-0.68, 0.68].forEach((sideZ) => {
          const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.04), M('#d90429')); crossH.position.set(-0.25, 0.9, sideZ); amb.add(crossH);
          const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.04), M('#d90429')); crossV.position.set(-0.25, 0.9, sideZ); amb.add(crossV);
        });
        const ambWheels = [];
        [[-0.8, -0.68], [-0.8, 0.68], [1.0, -0.68], [1.0, 0.68]].forEach(([wx, wz]) => {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.16, 10), M('#1b1b1e')); wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, 0.24, wz); amb.add(wheel);
          const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.18, 8), M('#ced4da')); rim.rotation.x = Math.PI / 2; rim.position.set(wx, 0.24, wz); amb.add(rim);
          ambWheels.push(wheel);
        });
        const sirenBase = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 0.22), M('#2b2d42')); sirenBase.position.set(0.55, 1.5, 0); amb.add(sirenBase);
        const sirenRed = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.18), M('#ef233c', { emissive: '#ef233c', emissiveIntensity: 1.4 })); sirenRed.position.set(0.42, 1.62, 0); amb.add(sirenRed);
        const sirenBlue = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.18), M('#0284c7', { emissive: '#38bdf8', emissiveIntensity: 1.4 })); sirenBlue.position.set(0.68, 1.62, 0); amb.add(sirenBlue);
        // Faros delanteros
        [-0.4, 0.4].forEach((hz) => {
          const hl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.22), M('#fff3b0', { emissive: '#ffe082', emissiveIntensity: 1.8 }));
          hl.position.set(1.82, 0.55, hz); amb.add(hl);
        });
        amb.scale.setScalar(S * 0.88);
        this.root.add(amb);
        this.ambulanceObj = amb;

        this.animProps.push((t) => {
          const blink = Math.sin(t * 14) > 0;
          sirenRed.material.emissiveIntensity = blink ? 2.8 : 0.2;
          sirenBlue.material.emissiveIntensity = blink ? 0.2 : 2.8;
          // Circulación continua por toda la red de calles (Rambla, Puente, Anillo de Plaza y Avenidas del pueblo)
          const pts = this.ambulanceLoop || [
            { x: -20, z: BRIDGE_Z + 0.5 },
            { x: TOWN.x - 5.5, z: BRIDGE_Z + 0.5 },
            { x: TOWN.x - 5.5, z: 5.5 },
            { x: TOWN.x + 5.0, z: 5.5 },
            { x: TOWN.x + 5.0, z: -5.5 },
            { x: TOWN.x - 5.5, z: -5.5 },
            { x: TOWN.x - 5.5, z: BRIDGE_Z - 0.5 },
            { x: -20, z: BRIDGE_Z - 0.5 },
          ];
          const segLens = [];
          let totalLen = 0;
          for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            const len = Math.hypot(b.x - a.x, b.z - a.z);
            segLens.push(len); totalLen += len;
          }
          const speed = 4.2;
          let d = (t * speed) % Math.max(1, totalLen);
          let ax = pts[0].x, az = pts[0].z, yaw = 0;
          for (let i = 0; i < pts.length; i++) {
            if (d <= segLens[i] || i === pts.length - 1) {
              const a = pts[i], b = pts[(i + 1) % pts.length];
              const f = segLens[i] > 0.001 ? d / segLens[i] : 0;
              ax = a.x + (b.x - a.x) * f;
              az = a.z + (b.z - a.z) * f;
              yaw = Math.atan2(-(b.z - a.z), b.x - a.x);
              break;
            }
            d -= segLens[i];
          }
          const brX = riverX(BRIDGE_Z);
          const onBridge = Math.abs(az - BRIDGE_Z) < 1.8 && Math.abs(ax - brX) < RIVER.half + RIVER.bank;
          const ay = onBridge ? 2.28 : Math.max(1.2, this.height(ax, az)) + 0.05;
          amb.position.set(ax, ay, az);
          amb.rotation.y = yaw;
          ambWheels.forEach((w) => { w.rotation.z = -t * 9; });
        });
        break;
      }
      case 'granja': {
        // Granero rústico tradicional (Granja Comunal)
        // Terreno de cultivo y corral
        add(new THREE.BoxGeometry(10.0, 0.15, 8.5), '#606c38', 0.08, 0, 0);
        // Valla de madera perimetral (split-rail fence)
        for (let fi = 0; fi < 5; fi++) {
          add(new THREE.CylinderGeometry(0.06, 0.07, 1.1, 6), '#7f5539', 0.6, 4.6, -3.5 + fi * 1.7);
          if (fi < 4) {
            add(new THREE.BoxGeometry(0.06, 0.1, 1.7), '#9c6644', 0.5, 4.6, -2.65 + fi * 1.7);
            add(new THREE.BoxGeometry(0.06, 0.1, 1.7), '#9c6644', 0.85, 4.6, -2.65 + fi * 1.7);
          }
        }
        // Cuerpo principal del granero rojo
        add(new THREE.BoxGeometry(5.2, 3.4, 4.6), '#9b2226', 1.85, -1.0, 0);
        // Zócalo de piedra del granero
        add(new THREE.BoxGeometry(5.4, 0.35, 4.8), '#6c757d', 0.3, -1.0, 0);
        // Techo estilo granero americano (gambrel roof)
        const techo = add(new THREE.ConeGeometry(3.6, 1.9, 4), '#ba181b', 4.35, -1.0, 0);
        techo.rotation.y = Math.PI / 4; techo.scale.set(1.15, 1.0, 1.0);
        // Gran puerta corredera con aspa en 'X' blanca
        add(new THREE.BoxGeometry(1.9, 2.2, 0.12), '#ffffff', 1.25, -1.0, 2.36);
        add(new THREE.BoxGeometry(1.7, 2.0, 0.14), '#780001', 1.25, -1.0, 2.37);
        const bar1 = add(new THREE.BoxGeometry(0.12, 2.4, 0.16), '#ffffff', 1.25, -1.0, 2.38); bar1.rotation.z = Math.PI / 4;
        const bar2 = add(new THREE.BoxGeometry(0.12, 2.4, 0.16), '#ffffff', 1.25, -1.0, 2.38); bar2.rotation.z = -Math.PI / 4;
        // Ventana del desván de heno en el piso superior
        add(new THREE.BoxGeometry(1.1, 1.1, 0.12), '#ffffff', 3.0, -1.0, 2.36);
        add(new THREE.BoxGeometry(0.9, 0.9, 0.14), '#2b2d42', 3.0, -1.0, 2.37);
        // Viga saliente de polea para subir heno
        add(new THREE.BoxGeometry(0.14, 0.14, 1.1), '#5c4033', 3.85, -1.0, 2.65);
        add(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4), '#adb5bd', 3.45, -1.0, 3.1);
        // Silo de granos cilíndrico metálico adosado al granero
        add(new THREE.CylinderGeometry(1.15, 1.2, 5.2, 16), '#ced4da', 2.7, 2.5, -0.6);
        add(new THREE.ConeGeometry(1.3, 1.4, 16), '#6c757d', 6.0, 2.5, -0.6);
        add(new THREE.CylinderGeometry(0.04, 0.04, 5.0, 4), '#495057', 2.7, 2.5, 0.65);
        // Fardos de heno dorados apilados en el corral
        [[2.8, 1.5], [2.8, 2.3], [3.6, 1.9], [3.2, 1.9]].forEach(([hx, hz], hi) => {
          const hy = hi === 3 ? 0.72 : 0.36;
          add(new THREE.BoxGeometry(0.85, 0.45, 0.6), '#e9c46a', hy, hx, hz);
          add(new THREE.BoxGeometry(0.87, 0.04, 0.62), '#ee9b00', hy, hx, hz);
        });
        // Cupulilla con veleta de gallo en el techo del granero
        add(new THREE.BoxGeometry(0.7, 0.7, 0.7), '#ffffff', 5.3, -1.0, 0);
        add(new THREE.ConeGeometry(0.55, 0.6, 4), '#ba181b', 5.95, -1.0, 0).rotation.y = Math.PI / 4;
        const veleta = add(new THREE.BoxGeometry(0.5, 0.35, 0.04), '#ffb703', 6.4, -1.0, 0);
        this.animProps.push((t) => { veleta.rotation.y = Math.sin(t * 0.8) * 0.45; });
        break;
      }
      case 'estadio': {
        // Cancha de fútbol reglamentaria y detallada
        const L = 13.0, W = 8.0;
        // Zócalo nivelado del campo
        add(new THREE.BoxGeometry(L + 1.8, 0.4, W + 1.8), '#ced4da', 0.2);
        // Franjas de césped cortado alternadas (5 franjas estilo profesional)
        const stripeW = L / 5;
        for (let si = 0; si < 5; si++) {
          const col = si % 2 === 0 ? '#38b000' : '#2d6a4f';
          add(new THREE.BoxGeometry(stripeW, 0.12, W), col, 0.44, -L / 2 + stripeW * (si + 0.5), 0);
        }
        // Líneas de cal blanca (perímetro, mediocampo, círculo central, áreas)
        const LW = 0.12;
        add(new THREE.BoxGeometry(L, 0.04, LW), '#ffffff', 0.51, 0, -W / 2 + LW / 2);
        add(new THREE.BoxGeometry(L, 0.04, LW), '#ffffff', 0.51, 0, W / 2 - LW / 2);
        add(new THREE.BoxGeometry(LW, 0.04, W), '#ffffff', 0.51, -L / 2 + LW / 2, 0);
        add(new THREE.BoxGeometry(LW, 0.04, W), '#ffffff', 0.51, L / 2 - LW / 2, 0);
        add(new THREE.BoxGeometry(LW, 0.04, W), '#ffffff', 0.51, 0, 0);
        add(new THREE.CylinderGeometry(1.5, 1.5, 0.04, 20, 1, true), '#ffffff', 0.51).material.side = THREE.DoubleSide;
        [-4.2, 0, 4.2].forEach((px) => add(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 8), '#ffffff', 0.51, px, 0));
        [-1, 1].forEach((dir) => {
          const ax = dir * (L / 2 - 1.4);
          add(new THREE.BoxGeometry(2.8, 0.04, LW), '#ffffff', 0.51, ax, -2.2);
          add(new THREE.BoxGeometry(2.8, 0.04, LW), '#ffffff', 0.51, ax, 2.2);
          add(new THREE.BoxGeometry(LW, 0.04, 4.4), '#ffffff', 0.51, dir * (L / 2 - 2.8), 0);
        });

        // Dos porterías (arcos de fútbol) reglamentarias con redes
        [-1, 1].forEach((dir) => {
          const gx = dir * (L / 2 - 0.1);
          const goal = new THREE.Group();
          const pMat = M('#f8f9fa');
          const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.45, 6), pMat); p1.position.set(0, 0.72, -1.15); goal.add(p1);
          const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.45, 6), pMat); p2.position.set(0, 0.72, 1.15); goal.add(p2);
          const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.36, 6), pMat); bar.position.set(0, 1.45, 0); bar.rotation.x = Math.PI / 2; goal.add(bar);
          const net = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.4, 2.25), new THREE.MeshStandardMaterial({ color: '#f8f9fa', wireframe: true }));
          net.position.set(-dir * 0.38, 0.7, 0); goal.add(net);
          goal.position.set(gx, 0.44, 0);
          g.add(goal);
        });

        // Balón de fútbol animado rebotando y cruzando la cancha
        const ball = new THREE.Group();
        const ballSphere = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), M('#f8f9fa'));
        ballSphere.castShadow = true; ball.add(ballSphere);
        [-0.09, 0.09].forEach((bx) => {
          const dot = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), M('#1b1b1e'));
          dot.position.set(bx, 0.04, 0.13); ball.add(dot);
        });
        g.add(ball);
        this.animProps.push((t) => {
          const bx = Math.sin(t * 2.3) * 4.3;
          const bz = Math.cos(t * 1.7) * 2.2;
          const by = 0.65 + Math.abs(Math.sin(t * 7.2)) * 0.45;
          ball.position.set(bx, by, bz);
          ball.rotation.x = t * 5.5; ball.rotation.z = t * 3.8;
        });

        // 4 Jugadores de fútbol jugando el partido (2 Rojos vs 2 Azules)
        const players = [
          { col: '#ef233c', ox: -2.8, oz: -1.2, spd: 1.8 },
          { col: '#ef233c', ox: 0.6, oz: 1.5, spd: 2.1 },
          { col: '#2563eb', ox: 2.6, oz: 0.8, spd: 1.9 },
          { col: '#2563eb', ox: -0.9, oz: -1.7, spd: 2.2 },
        ];
        players.forEach((pl, pi) => {
          const pj = new THREE.Group();
          const tor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.48, 0.22), M(pl.col)); tor.position.y = 0.52; pj.add(tor);
          const hd = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), M('#f6d5bd')); hd.position.y = 0.88; pj.add(hd);
          const hr = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.26), M('#1f1a17')); hr.position.y = 1.01; pj.add(hr);
          const sh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.21), M('#ffffff')); sh.position.y = 0.28; pj.add(sh);
          const legL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.12), M('#f6d5bd')); legL.position.set(-0.1, 0.13, 0); pj.add(legL);
          const legR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.26, 0.12), M('#f6d5bd')); legR.position.set(0.1, 0.13, 0); pj.add(legR);
          g.add(pj);
          this.animProps.push((t) => {
            const k = t * 6.5 + pi * 1.5;
            const px = pl.ox + Math.sin(t * pl.spd + pi) * 1.6;
            const pz = pl.oz + Math.cos(t * (pl.spd * 0.9) + pi) * 1.2;
            pj.position.set(px, 0.44 + Math.abs(Math.sin(k)) * 0.08, pz);
            // Orientarse hacia la pelota
            pj.rotation.y = Math.atan2(ball.position.x - px, ball.position.z - pz);
            legL.rotation.x = Math.sin(k) * 0.65;
            legR.rotation.x = -Math.sin(k) * 0.65;
          });
        });

        // Banderines de córner
        [[-L / 2 + 0.2, -W / 2 + 0.2], [-L / 2 + 0.2, W / 2 - 0.2], [L / 2 - 0.2, -W / 2 + 0.2], [L / 2 - 0.2, W / 2 - 0.2]].forEach(([cx, cz]) => {
          add(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 6), '#f8f9fa', 0.95, cx, cz);
          add(new THREE.BoxGeometry(0.26, 0.18, 0.02), '#e63946', 1.38, cx + 0.13, cz);
        });

        // Tribuna de madera con asientos de colores
        const tribuna = new THREE.Group();
        for (let step = 0; step < 3; step++) {
          const tStep = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.35, 0.7), M('#d4a373'));
          tStep.position.set(0, 0.5 + step * 0.35, -W / 2 - 0.6 - step * 0.65);
          tribuna.add(tStep);
          for (let sIdx = 0; sIdx < 6; sIdx++) {
            const seat = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.16, 0.4), M(sIdx % 2 === 0 ? '#1d3557' : '#e63946'));
            seat.position.set(-2.7 + sIdx * 1.08, 0.72 + step * 0.35, -W / 2 - 0.6 - step * 0.65);
            tribuna.add(seat);
          }
        }
        g.add(tribuna);

        // Banco de suplentes techado
        const bench = new THREE.Group();
        bench.add(new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 0.75), M('#457b9d')));
        const benchRoof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 1.05), M('#1d3557'));
        benchRoof.position.set(0, 1.3, 0); bench.add(benchRoof);
        [-1.45, 1.45].forEach((px) => {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), M('#adb5bd'));
          p.position.set(px, 0.65, 0); bench.add(p);
        });
        bench.position.set(0, 0.58, W / 2 + 0.7);
        g.add(bench);

        // 4 Torres de luz de estadio en las esquinas
        [[-L / 2 - 0.6, -W / 2 - 0.6], [L / 2 + 0.6, -W / 2 - 0.6], [-L / 2 - 0.6, W / 2 + 0.6], [L / 2 + 0.6, W / 2 + 0.6]].forEach(([lx, lz]) => {
          add(new THREE.CylinderGeometry(0.08, 0.12, 4.6, 6), '#495057', 2.3, lx, lz);
          add(new THREE.BoxGeometry(0.85, 0.5, 0.22), '#212529', 4.7, lx, lz);
          const light = add(new THREE.BoxGeometry(0.75, 0.4, 0.08), '#ffe599', 4.7, lx, lz + (lz > 0 ? -0.1 : 0.1));
          light.material.emissive = new THREE.Color('#ffb703'); light.material.emissiveIntensity = 0.8;
        });

        // Accesorios de playa junto a la cancha (hielera, sombrilla, tabla de surf, pelota de playa)
        const beachAcc = new THREE.Group();
        const cooler = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.42, 0.4), M('#e63946')); cooler.position.set(L / 2 + 0.85, 0.52, W / 2 - 0.4); beachAcc.add(cooler);
        const coolerTop = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.07, 0.42), M('#ffffff')); coolerTop.position.set(L / 2 + 0.85, 0.75, W / 2 - 0.4); beachAcc.add(coolerTop);
        const bBall = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), M('#ffd166'));
        bBall.position.set(L / 2 + 1.15, 0.52, W / 2 + 0.65); beachAcc.add(bBall);
        const surf = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.75, 0.08), M('#06d6a0'));
        surf.position.set(L / 2 + 0.65, 0.9, -W / 2 - 0.35); surf.rotation.set(0.2, 0.3, -0.2); beachAcc.add(surf);
        g.add(beachAcc);
        break;
      }
      case 'taller': {
        // Taller de inventos con anexo lateral, techo industrial en diente de sierra, gran portón y turbina eólica
        add(new THREE.BoxGeometry(5.3, 0.24, 3.8), '#6c757d', 0.12);
        add(new THREE.BoxGeometry(5.0, 2.5, 3.5), '#b08968', 1.35);
        add(new THREE.BoxGeometry(1.8, 1.7, 2.6), '#9c7858', 0.95, 3.3, -0.2);
        add(new THREE.BoxGeometry(2.0, 0.2, 2.8), '#5c4033', 1.85, 3.3, -0.2);
        add(new THREE.BoxGeometry(5.4, 0.26, 3.9), '#7f5539', 2.65);
        add(new THREE.BoxGeometry(2.5, 0.75, 3.6), '#495057', 3.05, -1.1, 0).rotation.z = -0.26;
        add(new THREE.BoxGeometry(2.5, 0.75, 3.6), '#6c757d', 3.05, 1.1, 0).rotation.z = -0.26;
        add(new THREE.BoxGeometry(1.8, 1.5, 0.12), '#343a40', 0.85, 0, 1.78);
        add(new THREE.BoxGeometry(1.1, 0.7, 0.08), '#a8dadc', 1.65, -1.5, 1.78);
        add(new THREE.CylinderGeometry(0.26, 0.3, 1.6, 6), '#495057', 3.5, 1.8, -0.9);
        const aspas = new THREE.Group();
        aspas.add(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.3), M('#ffd166')));
        aspas.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 2.0), M('#ffd166')));
        aspas.position.set(-1.3, 3.55, 0); g.add(aspas);
        const humo = add(new THREE.SphereGeometry(0.26, 6, 5), '#e9ecef', 4.4, 1.8, -0.9);
        this.animProps.push((t, dt) => {
          aspas.rotation.y += dt * 1.9;
          const k = (t * 0.5) % 1; humo.position.y = 4.4 + k * 1.4; humo.scale.setScalar(0.7 + k * 0.8);
        });
        break;
      }
      case 'comisaria': {
        add(new THREE.BoxGeometry(5, 2.6, 3.6), '#dee2e6', 1.3);
        add(new THREE.BoxGeometry(5.3, 0.35, 3.9), '#1d3557', 2.75);
        add(new THREE.BoxGeometry(1.1, 1.4, 0.1), '#2b2d42', 0.7, 0, 1.82);
        add(new THREE.BoxGeometry(1.4, 0.5, 0.1), '#1d3557', 2.1, 0, 1.85);
        const bRoja = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: '#e63946', emissive: '#e63946', emissiveIntensity: 0.9 }));
        const bAzul = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshStandardMaterial({ color: '#3a86ff', emissive: '#3a86ff', emissiveIntensity: 0.1 }));
        bRoja.position.set(-0.35, 3.12, 0); bAzul.position.set(0.35, 3.12, 0); g.add(bRoja, bAzul);
        this.animProps.push((t) => {
          const on = Math.floor(t * 4) % 2 === 0;
          bRoja.material.emissiveIntensity = on ? 1.0 : 0.12;
          bAzul.material.emissiveIntensity = on ? 0.12 : 1.0;
        });
        break;
      }
      case 'bomberos': {
        add(new THREE.BoxGeometry(5.2, 3, 3.8), '#d62828', 1.5);
        add(new THREE.BoxGeometry(5.4, 0.25, 4.0), '#ffd166', 0.35);
        add(new THREE.BoxGeometry(2.3, 2.0, 0.12), '#f1faee', 1.05, 0, 1.92);
        add(new THREE.BoxGeometry(1.1, 4.4, 1.1), '#9d0208', 2.2, 2.2, -1.2);
        const sirena = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), new THREE.MeshStandardMaterial({ color: '#ffbe0b', emissive: '#ff5400', emissiveIntensity: 0.8 }));
        sirena.position.set(2.2, 4.65, -1.2); g.add(sirena);
        this.animProps.push((t) => { sirena.material.emissiveIntensity = 0.25 + 0.75 * Math.abs(Math.sin(t * 5)); });
        break;
      }
      case 'torre': {
        if (/tit[aá]n/i.test(label)) {
          const limb = (w, h, d, col, px, py, pz) => {
            const pv = new THREE.Group(); pv.position.set(px, py, pz);
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(col));
            m.position.y = -h / 2; m.castShadow = m.receiveShadow = true; pv.add(m); g.add(pv); return pv;
          };
          const legL = limb(0.95, 2.5, 1.0, '#6c757d', -0.68, 2.5, 0);
          const legR = limb(0.95, 2.5, 1.0, '#6c757d', 0.68, 2.5, 0);
          add(new THREE.BoxGeometry(2.55, 2.6, 1.45), '#7f878e', 3.8); // torso
          add(new THREE.BoxGeometry(1.1, 0.55, 1.2), '#4f772d', 5.05, -1.35, 0); // hombrera musgo izq
          add(new THREE.BoxGeometry(1.1, 0.55, 1.2), '#4f772d', 5.05, 1.35, 0); // hombrera musgo der
          const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: '#38bdf8', emissive: '#0ea5e9', emissiveIntensity: 1.4, roughness: 0.25 }));
          core.position.set(0, 3.9, 0.72); g.add(core);
          const armL = limb(0.8, 2.35, 0.85, '#8d99ae', -1.75, 4.85, 0);
          const armR = limb(0.8, 2.35, 0.85, '#8d99ae', 1.75, 4.85, 0);
          add(new THREE.BoxGeometry(1.3, 1.25, 1.2), '#8d99ae', 5.75); // cabeza
          add(new THREE.BoxGeometry(1.42, 0.3, 1.28), '#5c646b', 6.3, 0, 0.04); // ceja de piedra
          const eyeMat = new THREE.MeshStandardMaterial({ color: '#7dd3fc', emissive: '#38bdf8', emissiveIntensity: 1.8 });
          [-0.28, 0.28].forEach((ex) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.12), eyeMat); e.position.set(ex, 5.8, 0.6); g.add(e); });
          g.userData.titanParts = { legL, legR, armL, armR, core };
        } else if (/defensa|militar|armas|aviaci[oó]n|seguridad/i.test(label)) {
          // Complejo de Industria de Defensa y Aeroespacial
          // Plataforma reforzada de hormigón
          add(new THREE.BoxGeometry(8.0, 0.4, 7.0), '#343a40', 0.2);
          // Búnker táctico blindado con muros reforzados
          add(new THREE.BoxGeometry(6.4, 3.0, 5.4), '#4a5759', 1.8);
          add(new THREE.BoxGeometry(6.7, 0.35, 5.7), '#2b2d42', 3.4);
          // Portón blindado de hangar con franjas diagonales de advertencia (amarillo y negro)
          add(new THREE.BoxGeometry(2.8, 2.2, 0.15), '#212529', 1.3, 0, 2.75);
          for (let si = 0; si < 5; si++) {
            const stripe = add(new THREE.BoxGeometry(0.22, 1.8, 0.18), '#ffd166', 1.3, -1.0 + si * 0.5, 2.76);
            stripe.rotation.z = Math.PI / 4;
          }
          // Cartel táctico militar
          add(new THREE.BoxGeometry(2.4, 0.4, 0.1), '#1b263b', 2.75, 0, 2.78);
          // Helipuerto en el techo con círculo y "H" blanca
          add(new THREE.CylinderGeometry(1.6, 1.6, 0.08, 18), '#212529', 3.65, -1.4, -0.6);
          add(new THREE.CylinderGeometry(1.4, 1.4, 0.09, 18, 1, true), '#ffffff', 3.66, -1.4, -0.6);
          add(new THREE.BoxGeometry(0.18, 0.1, 1.2), '#ffffff', 3.68, -1.9, -0.6);
          add(new THREE.BoxGeometry(0.18, 0.1, 1.2), '#ffffff', 3.68, -0.9, -0.6);
          add(new THREE.BoxGeometry(0.9, 0.1, 0.2), '#ffffff', 3.68, -1.4, -0.6);
          // Torre de control de comunicaciones y radar
          add(new THREE.BoxGeometry(2.0, 3.2, 2.0), '#3d5a80', 5.0, 1.8, -0.8);
          add(new THREE.BoxGeometry(2.4, 0.3, 2.4), '#293241', 6.7, 1.8, -0.8);
          // Antena de radar parabólica rotatoria militar
          const radarGroup = new THREE.Group();
          radarGroup.position.set(1.8, 7.3, -0.8);
          radarGroup.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 6), M('#495057')));
          const plato = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.2, 0.25, 12, 1, true), M('#ced4da'));
          plato.position.set(0, 0.5, 0); plato.rotation.x = Math.PI / 3;
          radarGroup.add(plato);
          const feed = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 6), M('#e63946'));
          feed.position.set(0, 0.65, 0.2); feed.rotation.x = Math.PI / 3;
          radarGroup.add(feed);
          g.add(radarGroup);
          // Mástil con baliza roja parpadeante de aviación
          add(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), '#adb5bd', 7.7, 1.8, 0.4);
          const beaconMilitar = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshStandardMaterial({ color: '#ef233c', emissive: '#d90429', emissiveIntensity: 1.5 }));
          beaconMilitar.position.set(1.8, 8.7, 0.4); g.add(beaconMilitar);
          // Torreta antiaérea doble defensiva (doble cañón antiaéreo)
          const turret = new THREE.Group();
          turret.position.set(-1.4, 3.8, 1.6);
          turret.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, 0.4, 8), M('#2b2d42')));
          const gunBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.6), M('#1b1b1e'));
          gunBox.position.set(0, 0.35, 0); turret.add(gunBox);
          [-0.15, 0.15].forEach((gx) => {
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 6), M('#343a40'));
            barrel.position.set(gx, 0.55, 0.45); barrel.rotation.x = -Math.PI / 5; turret.add(barrel);
          });
          g.add(turret);
          // Animación del radar continuo y baliza parpadeante
          this.animProps.push((t, dt) => {
            radarGroup.rotation.y += (dt || 0.016) * 2.2;
            turret.rotation.y = Math.sin(t * 0.4) * 0.6;
            beaconMilitar.material.emissiveIntensity = 0.3 + 1.2 * Math.abs(Math.sin(t * 4.0));
          });
        } else {
          // Torre clásica de vigilancia de piedra con almenas
          add(new THREE.CylinderGeometry(1.6, 2.0, 8.5, 10), '#8d99ae', 4.25);
          add(new THREE.CylinderGeometry(2.1, 1.7, 1.2, 10), '#6c757d', 8.9);
          for (let a = 0; a < 6; a++) {
            const ang = (a / 6) * Math.PI * 2;
            add(new THREE.BoxGeometry(0.45, 0.5, 0.35), '#495057', 9.75, Math.cos(ang) * 1.85, Math.sin(ang) * 1.85);
          }
          add(new THREE.ConeGeometry(2.3, 2.6, 8), '#2b2d42', 10.6);
        }
        break;
      }
      case 'posada': {
        // Albergue comunitario de dos plantas para nuevos vecinos (Posada Vaeloria)
        add(new THREE.BoxGeometry(6.6, 2.2, 5.2), '#8d99ae', 1.1);
        add(new THREE.BoxGeometry(6.9, 0.25, 5.5), '#6c757d', 2.22);
        add(new THREE.BoxGeometry(6.4, 2.0, 5.0), '#ddb892', 3.35);
        [-3.1, -1.0, 1.0, 3.1].forEach((vx) => { add(new THREE.BoxGeometry(0.12, 2.0, 0.08), '#5c4033', 3.35, vx, 2.52); });
        const techoP = add(new THREE.ConeGeometry(4.6, 1.8, 4), '#9c6644', 5.15);
        techoP.rotation.y = Math.PI / 4; techoP.scale.set(1.05, 1.0, 0.85);
        add(new THREE.BoxGeometry(2.8, 0.15, 1.6), '#a8a29a', 0.1, 0, 3.0);
        [-1.2, 1.2].forEach((px) => { add(new THREE.CylinderGeometry(0.08, 0.08, 2.1, 6), '#5c4033', 1.15, px, 3.6); });
        const porchRoof = add(new THREE.BoxGeometry(3.0, 0.15, 1.8), '#7f5539', 2.25, 0, 3.1);
        porchRoof.rotation.x = 0.12;
        add(new THREE.BoxGeometry(1.2, 1.7, 0.1), '#4a2c16', 0.95, 0, 2.62);
        add(new THREE.BoxGeometry(3.2, 0.1, 0.9), '#a8a29a', 2.3, 0, 2.85);
        add(new THREE.BoxGeometry(3.2, 0.42, 0.06), '#5c4033', 2.55, 0, 3.28);
        [-2.0, 2.0].forEach((wx) => {
          const w1 = add(new THREE.BoxGeometry(0.75, 0.9, 0.08), '#ffe599', 1.2, wx, 2.62);
          w1.material.emissive = new THREE.Color('#ffb703'); w1.material.emissiveIntensity = 0.6;
          const w2 = add(new THREE.BoxGeometry(0.75, 0.8, 0.08), '#ffe599', 3.4, wx, 2.52);
          w2.material.emissive = new THREE.Color('#ffb703'); w2.material.emissiveIntensity = 0.6;
        });
        add(new THREE.BoxGeometry(0.85, 4.8, 0.85), '#5c646b', 2.4, 2.4, -1.2);
        const humoP = add(new THREE.SphereGeometry(0.24, 6, 5), '#f8f9fa', 5.0, 2.4, -1.2);
        this.animProps.push((t) => {
          const k = (t * 0.5) % 1; humoP.position.y = 5.0 + k * 1.5; humoP.scale.setScalar(0.7 + k * 0.8);
        });
        const farolP = add(new THREE.SphereGeometry(0.16, 6, 5), '#ffd166', 2.0, 0, 3.3);
        farolP.material.emissive = new THREE.Color('#ffb703'); farolP.material.emissiveIntensity = 0.9;
        add(new THREE.BoxGeometry(1.6, 0.35, 0.06), '#5c4033', 2.6, 0, 2.65);
        break;
      }
      case 'armeria': {
        // Armería y forja de guerra
        add(new THREE.BoxGeometry(5.8, 2.8, 4.4), '#495057', 1.4);
        add(new THREE.BoxGeometry(6.2, 0.35, 4.8), '#212529', 2.9);
        const techoArm = add(new THREE.ConeGeometry(4.0, 1.4, 4), '#343a40', 3.7);
        techoArm.rotation.y = Math.PI / 4; techoArm.scale.set(1.05, 1.0, 0.8);
        add(new THREE.BoxGeometry(1.3, 1.9, 0.12), '#1b1b1e', 1.0, 0, 2.22);
        const escArm = add(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 8), '#e63946', 2.35, 0, 2.25); escArm.rotation.x = Math.PI / 2;
        const sp1 = add(new THREE.BoxGeometry(0.08, 0.9, 0.04), '#ced4da', 2.35, 0, 2.28); sp1.rotation.z = Math.PI / 4;
        const sp2 = add(new THREE.BoxGeometry(0.08, 0.9, 0.04), '#ced4da', 2.35, 0, 2.28); sp2.rotation.z = -Math.PI / 4;
        add(new THREE.BoxGeometry(0.7, 0.6, 0.6), '#212529', 0.3, 2.2, 1.4);
        add(new THREE.BoxGeometry(0.5, 0.35, 0.35), '#ced4da', 0.75, 2.2, 1.4);
        add(new THREE.CylinderGeometry(0.4, 0.25, 0.7, 8), '#1b1b1e', 0.35, -2.2, 1.4);
        const fuego = add(new THREE.SphereGeometry(0.25, 8, 6), '#ff5400', 0.8, -2.2, 1.4);
        fuego.material.emissive = new THREE.Color('#ff7b00'); fuego.material.emissiveIntensity = 1.2;
        this.animProps.push((t) => { fuego.material.emissiveIntensity = 0.9 + Math.sin(t * 8) * 0.4; });
        add(new THREE.BoxGeometry(1.6, 1.2, 0.3), '#5c4033', 0.6, -1.8, 2.25);
        [-0.45, 0, 0.45].forEach((sx) => { add(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), '#ced4da', 0.8, -1.8 + sx, 2.28); });
        break;
      }
      case 'cafeteria': {
        // Cafetería con terraza y sombrillas
        add(new THREE.BoxGeometry(5.4, 2.6, 4.0), '#fdf0d5', 1.3);
        add(new THREE.BoxGeometry(5.8, 0.25, 4.4), '#669bbc', 2.7);
        const toldo = add(new THREE.BoxGeometry(4.6, 0.15, 1.4), '#c1121f', 2.3, 0, 2.4); toldo.rotation.x = 0.2;
        add(new THREE.BoxGeometry(2.0, 1.3, 0.08), '#d8f3dc', 1.3, -1.2, 2.02);
        add(new THREE.BoxGeometry(1.0, 1.8, 0.08), '#780001', 0.9, 1.4, 2.02);
        [-1.4, 1.4].forEach((tx, ti) => {
          add(new THREE.CylinderGeometry(0.42, 0.42, 0.06, 10), '#ffffff', 0.6, tx, 3.3);
          add(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), '#495057', 0.3, tx, 3.3);
          add(new THREE.CylinderGeometry(0.03, 0.03, 1.8, 6), '#ced4da', 0.9, tx, 3.3);
          add(new THREE.ConeGeometry(0.75, 0.35, 8), ti === 0 ? '#e63946' : '#f4a261', 1.85, tx, 3.3);
          add(new THREE.CylinderGeometry(0.06, 0.05, 0.1, 8), '#ffffff', 0.68, tx + 0.1, 3.3);
          const vCafe = add(new THREE.SphereGeometry(0.05, 6, 4), '#f8f9fa', 0.8, tx + 0.1, 3.3);
          this.animProps.push((t) => {
            const k = (t * 0.8 + ti * 0.4) % 1; vCafe.position.y = 0.75 + k * 0.35; vCafe.scale.setScalar(0.6 + k * 0.6);
          });
        });
        add(new THREE.CylinderGeometry(0.45, 0.35, 0.55, 12), '#ffffff', 3.2, 0, 0);
        add(new THREE.TorusGeometry(0.18, 0.05, 6, 12), '#ffffff', 3.2, 0.48, 0).rotation.y = Math.PI / 2;
        break;
      }
      default: add(new THREE.BoxGeometry(3, 3, 3), '#ccc', 1.5);
    }
    return g;
  }

  #buildings(state, plots = []) {
    this.buildingAnchors = []; this.buildingByKind = {}; let comm = 0; this._plazaDone = false;
    this.civicBlocks = new Set();

    // Planificador urbano: genera parcelas cívicas libres en la retícula (gx, gz) sin pisar casas, plaza, río ni colina
    const civicLots = [];
    for (let gx = -6; gx <= 6; gx++) {
      for (let gz = -6; gz <= 6; gz++) {
        if (gx === 0 && gz === 0) continue; // reservado para la Plaza Central
        if (gz === 0 && gx < 0) continue;   // reservado para el Bulevar del Puente
        const key = gx * 1000 + gz;
        if (this.manzanasUsadas?.has(key)) continue;
        const cx = TOWN.x + gx * PASO, cz = TOWN.z + gz * PASO;
        if (cx - 3.6 <= riverX(cz) + RIVER.half + RIVER.bank + 1.0) continue;
        if (Math.hypot(cx - FLAG.x, cz - FLAG.z) <= 4.6) continue;
        if (this.height(cx, cz) < 0.45) continue;
        civicLots.push({
          gx, gz, key, cx, cz,
          d: Math.hypot(cx - TOWN.x, cz - TOWN.z),
          ang: Math.atan2(cz - TOWN.z, cx - TOWN.x),
        });
      }
    }
    // Ordenar del anillo interior al exterior y alternar cuadrantes para crecimiento equilibrado
    civicLots.sort((a, b) => Math.abs(a.d - b.d) > 2.5 ? a.d - b.d : a.ang - b.ang);
    const usedLotKeys = new Set();
    const allocCivicLot = (preferIdx = 0) => {
      // Buscar el lote libre más cercano manteniendo variedad angular
      const avail = civicLots.filter((l) => !usedLotKeys.has(l.key));
      if (!avail.length) return null;
      const pickLot = avail[preferIdx % Math.min(avail.length, 4)] || avail[0];
      usedLotKeys.add(pickLot.key);
      this.civicBlocks.add(pickLot.key);
      return pickLot;
    };

    let civic = 0;
    state.buildings.forEach((b, i) => {
      const mesh = this.buildingMesh(b.kind, b.label);
      let p;
      if (b.kind === 'faro' || b.kind === 'muelle' || b.kind === 'hallazgo') {
        const a = b.kind === 'faro' ? -Math.PI / 2 - 0.4 : BEACH.ang + (b.kind === 'muelle' ? -0.25 : 0.2) + (i % 3) * 0.08; let r = this.R * 0.6; while (this.height(Math.cos(a) * r, Math.sin(a) * r) > 0.4 && r < this.R * 1.3) r += 0.5;
        p = new THREE.Vector3(Math.cos(a) * (r - (b.kind === 'faro' ? 2 : b.kind === 'hallazgo' ? 0.2 : 1)), 0, Math.sin(a) * (r - 1)); mesh.rotation.y = -a + Math.PI / 2 * (b.kind === 'muelle' ? 1 : 0);
        if (b.kind === 'muelle') {
          mesh.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
          this.muellePos = p.clone().add(new THREE.Vector3(Math.sin(mesh.rotation.y) * 9, 0.8, Math.cos(mesh.rotation.y) * 9));
        }
      } else if (b.kind === 'mercado' || b.kind === 'taller') {
        // Edificios comerciales/productivos alineados a ambos lados de la Avenida Comercial (lado oeste)
        const ci = comm++; const lado = ci % 2 ? 1 : -1;
        const bx = COMERCIO.x0 - 2.0 - Math.floor(ci / 2) * 7.0;
        const bz = COMERCIO.z + lado * (COMERCIO.fondo + 2.4);
        p = new THREE.Vector3(bx, 0, bz);
        mesh.rotation.y = lado > 0 ? Math.PI : 0; // mirando hacia la Avenida Comercial
      } else if (b.kind === 'estadio') {
        // Cancha de fútbol junto a la playa oeste
        const a = BEACH.ang - 0.22;
        let r = this.R * 0.62;
        while (this.height(Math.cos(a) * r, Math.sin(a) * r) > 0.85 && r < this.R * 0.92) r += 0.5;
        p = new THREE.Vector3(Math.cos(a) * (r - 4.2), 0, Math.sin(a) * (r - 4.2));
        mesh.rotation.y = -a + Math.PI / 2;
      } else {
        // Asignación automática de parcela urbana alineada a la retícula de calles (incluye plazas)
        const lot = allocCivicLot(civic++);
        if (lot) {
          p = new THREE.Vector3(lot.cx, 0, lot.cz);
          const rawAng = Math.atan2(TOWN.x - lot.cx, TOWN.z - lot.cz);
          mesh.rotation.y = Math.round(rawAng / (Math.PI / 2)) * (Math.PI / 2);
        } else {
          const ang = (civic * 2.39996);
          p = new THREE.Vector3(TOWN.x + Math.cos(ang) * 18, 0, TOWN.z + Math.sin(ang) * 18);
          mesh.rotation.y = Math.atan2(TOWN.x - p.x, TOWN.z - p.z);
        }
      }
      p.y = Math.max(0.2, this.height(p.x, p.z)); mesh.position.copy(p); mesh.scale.setScalar(S); this.root.add(mesh);
      mesh.userData.pick = { type: 'edificio', building: b, pos: p.clone() }; this.pickables.push(mesh);
      this.buildingAnchors.push(p); this.buildingByKind[b.kind] = this.buildingByKind[b.kind] || p;
      const FOOT = { taller: 3.1, comisaria: 3.1, bomberos: 3.2, hospital: 3.7, plaza: 1.7, faro: 1.9, muelle: 0, mercado: 4.6, escuela: 3.6, fogata: 1.1, ayuntamiento: 4.4, granja: 2.9, estadio: 0, torre: 2.1, hallazgo: 1.3, posada: 3.5, armeria: 3.2, cafeteria: 3.2 };
      const fr = (FOOT[b.kind] ?? 2) * S; if (fr && !mesh.userData.titanParts) this.addObstacle(p.x, p.z, fr);
      // Plataformas pisables: los habitantes caminan ENCIMA, no a través
      if (b.kind === 'plaza') this.platforms.push({ x: p.x, z: p.z, r: 6 * S, top: p.y + 0.3 * S });
      if (b.kind === 'estadio') this.platforms.push({ x: p.x, z: p.z, r: 7.2 * S, top: p.y + 0.44 * S });
      const LBL_Y = { hallazgo: 2.2, mercado: 2.3, taller: 2.8, plaza: 2.8, estadio: 2.6, muelle: 2.5, granja: 3.0, cafeteria: 2.8, armeria: 3.0, escuela: 3.6, bomberos: 3.8, comisaria: 3.8, posada: 4.5, hospital: 4.5, ayuntamiento: 5.0, faro: 5.8, torre: 5.5 };
      const lblY = mesh.userData.titanParts ? 7.4 * S : (LBL_Y[b.kind] ?? 4.2);
      const lbl = this.#label(b.kind === 'hallazgo' ? `🌊 ${b.label}` : b.label, p.clone().add(new THREE.Vector3(0, lblY, 0)), 'lbl lbl-building');
      if (mesh.userData.titanParts) {
        const { legL, legR, armL, armR, core } = mesh.userData.titanParts;
        const rnd = mulberry(4049);
        const pickTarget = () => {
          for (let k = 0; k < 50; k++) {
            const a = rnd() * Math.PI * 2;
            const d = 9 + rnd() * Math.max(11, this.R * 0.55);
            const tx = TOWN.x + Math.cos(a) * d, tz = TOWN.z + Math.sin(a) * d;
            if (tx > riverX(tz) + RIVER.half + 2.5 && !this.hit(tx, tz, 0.75)) return { x: tx, z: tz };
          }
          return { x: TOWN.x + 8, z: TOWN.z };
        };
        let cx = p.x, cz = p.z, yaw = mesh.rotation.y, tgt = null, stuck = 0, progT = 0, progX = p.x, progZ = p.z, init = false;
        const DIRS = [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2, 2.8, -2.8, Math.PI];
        this.animProps.push((t, dt) => {
          if (!init) {
            init = true;
            if (this.hit(cx, cz, 0.7)) { const s0 = pickTarget(); cx = s0.x; cz = s0.z; }
            tgt = pickTarget(); progX = cx; progZ = cz;
          }
          const stepDt = Math.min(dt || 0.016, 0.05);
          progT += stepDt;
          if (progT > 1.0) {
            if (Math.hypot(cx - progX, cz - progZ) < 0.6) stuck += 1.0; else stuck = 0;
            progT = 0; progX = cx; progZ = cz;
          }
          if (Math.hypot(tgt.x - cx, tgt.z - cz) < 2.0 || stuck > 0.9) { tgt = pickTarget(); stuck = 0; }
          const baseAng = Math.atan2(tgt.x - cx, tgt.z - cz);
          let chosen = null;
          for (const da of DIRS) {
            const a = baseAng + da;
            const lx = cx + Math.sin(a) * 1.15, lz = cz + Math.cos(a) * 1.15;
            if (lx > riverX(lz) + RIVER.half + 1.5 && !this.hit(lx, lz, 0.65)) { chosen = a; break; }
          }
          if (chosen !== null) {
            const spd = 2.6 * stepDt;
            cx += Math.sin(chosen) * spd; cz += Math.cos(chosen) * spd;
            const diff = Math.atan2(Math.sin(chosen - yaw), Math.cos(chosen - yaw));
            yaw += diff * Math.min(1, stepDt * 6);
          } else {
            stuck += stepDt;
            tgt = pickTarget();
          }
          const cy = Math.max(0.2, this.groundAt(cx, cz));
          const step = Math.sin(t * 3.2);
          mesh.position.set(cx, cy + Math.abs(step) * 0.14, cz);
          mesh.rotation.y = yaw;
          legL.rotation.x = step * 0.45;
          legR.rotation.x = -step * 0.45;
          armL.rotation.x = -step * 0.38;
          armR.rotation.x = step * 0.38;
          core.rotation.y = t * 1.6;
          p.set(cx, cy, cz);
          mesh.userData.pick.pos.set(cx, cy, cz);
          lbl.position.set(cx, cy + 7.4 * S, cz);
        });
      }
    });
  }

  #playaDecor() {
    const M = (col) => new THREE.MeshStandardMaterial({ color: col, flatShading: true });
    const g = new THREE.Group();
    const cols = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2'];
    // Sombrillas + toallas en la arena de la playa
    [-0.24, -0.08, 0.09, 0.25].forEach((da, i) => {
      const a = BEACH.ang + da;
      let r = this.R * 0.72;
      while (r < this.R * 1.15 && this.height(Math.cos(a) * r, Math.sin(a) * r) > 0.75) r += 0.5;
      const x = Math.cos(a) * (r + 0.4), z = Math.sin(a) * (r + 0.4);
      const y = this.height(x, z);
      if (y < 0.25 || y > 1.35) return;
      const umb = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.45, 6), M('#f4efe6'));
      pole.position.y = 0.72; umb.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.42, 7), M(cols[i % cols.length]));
      top.position.y = 1.45; top.castShadow = !MOVIL; umb.add(top);
      const towel = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.04, 1.15), M(cols[(i + 1) % cols.length]));
      towel.position.set(0.45, 0.03, 0.2); towel.rotation.y = 0.2; umb.add(towel);
      umb.position.set(x, y, z); umb.rotation.y = -a;
      g.add(umb);
    });
    // Palmeras costeras inclinadas
    [-0.34, 0.0, 0.34].forEach((da, i) => {
      const a = BEACH.ang + da;
      const r = this.R * 0.76;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = this.height(x, z);
      if (y < 0.4) return;
      const palm = new THREE.Group();
      for (let s = 0; s < 5; s++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.11 - s * 0.012, 0.14 - s * 0.012, 0.65, 6), M('#8d5a2b'));
        seg.position.set(s * 0.14, 0.32 + s * 0.58, 0); seg.rotation.z = -0.14; seg.castShadow = !MOVIL; palm.add(seg);
      }
      for (let f = 0; f < 5; f++) {
        const fa = (f / 5) * Math.PI * 2;
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.45, 4), M('#40916c'));
        leaf.position.set(0.65 + Math.cos(fa) * 0.55, 3.05, Math.sin(fa) * 0.55);
        leaf.rotation.set(Math.sin(fa) * 0.85, 0, -Math.cos(fa) * 0.85 - 0.3);
        palm.add(leaf);
      }
      palm.position.set(x, y, z); palm.rotation.y = a + i * 0.6;
      g.add(palm);
    });
    this.root.add(g);
  }

  #trees(plots) {
    const r = mulberry(77); const n = Math.floor(this.R * this.R * (MOVIL ? 0.075 : 0.13));
    const tronco = '#734b2a';
    const troncoOsc = '#5c3b20';
    // 1) Pino alto esbelto (4 niveles asimétricos + raíces)
    const pinoAltoGeo = unir(
      pieza(new THREE.CylinderGeometry(0.08, 0.16, 1.15, 6), tronco, 0, 0.55, 0),
      pieza(new THREE.ConeGeometry(0.22, 0.28, 5), troncoOsc, 0.08, 0.14, 0.05, { rz: -0.4 }),
      pieza(new THREE.ConeGeometry(0.98, 1.0, 7), '#275b30', 0.02, 1.38, -0.02),
      pieza(new THREE.ConeGeometry(0.8, 0.92, 7), '#326f39', -0.03, 1.92, 0.03),
      pieza(new THREE.ConeGeometry(0.58, 0.84, 7), '#3e8443', 0.02, 2.42, 0),
      pieza(new THREE.ConeGeometry(0.35, 0.68, 6), '#4d984e', 0, 2.9, 0.02),
    );
    // 2) Pino ancho alpino (más bajo y frondoso)
    const pinoAnchoGeo = unir(
      pieza(new THREE.CylinderGeometry(0.1, 0.17, 0.9, 6), troncoOsc, 0, 0.45, 0),
      pieza(new THREE.ConeGeometry(1.12, 0.95, 8), '#2d6636', 0, 1.18, 0),
      pieza(new THREE.ConeGeometry(0.86, 0.85, 7), '#3a7c40', 0.05, 1.72, -0.04),
      pieza(new THREE.ConeGeometry(0.54, 0.72, 7), '#49914b', -0.02, 2.22, 0.03),
    );
    // 3) Roble frondoso con tronco bifurcado y copa orgánica
    const robleGeo = unir(
      pieza(new THREE.CylinderGeometry(0.11, 0.19, 1.25, 6), tronco, 0, 0.62, 0),
      pieza(new THREE.CylinderGeometry(0.055, 0.085, 0.72, 5), troncoOsc, 0.25, 1.28, 0.08, { rz: -0.68, ry: 0.3 }),
      pieza(new THREE.CylinderGeometry(0.05, 0.075, 0.62, 5), troncoOsc, -0.22, 1.22, -0.1, { rz: 0.62, ry: -0.4 }),
      pieza(new THREE.IcosahedronGeometry(0.76, 0), '#478637', 0, 1.92, 0),
      pieza(new THREE.IcosahedronGeometry(0.58, 0), '#589c42', 0.52, 1.72, 0.22),
      pieza(new THREE.IcosahedronGeometry(0.54, 0), '#3d7730', -0.48, 1.74, -0.24),
      pieza(new THREE.IcosahedronGeometry(0.48, 0), '#64ab4b', 0.14, 2.38, -0.14),
      pieza(new THREE.IcosahedronGeometry(0.42, 0), '#52933e', -0.2, 2.26, 0.32),
    );
    // 4) Árbol ornamental (cerezo/otoñal) para dar acentos de color naturales
    const cerezoGeo = unir(
      pieza(new THREE.CylinderGeometry(0.08, 0.14, 1.2, 6), '#6b4735', 0, 0.6, 0, { rz: 0.06 }),
      pieza(new THREE.CylinderGeometry(0.045, 0.065, 0.6, 5), '#6b4735', -0.2, 1.2, 0.12, { rz: 0.65 }),
      pieza(new THREE.IcosahedronGeometry(0.64, 0), '#e58aa9', 0.05, 1.85, 0),
      pieza(new THREE.IcosahedronGeometry(0.5, 0), '#f2a2be', 0.45, 1.65, 0.18),
      pieza(new THREE.IcosahedronGeometry(0.48, 0), '#d47495', -0.4, 1.72, -0.16),
      pieza(new THREE.IcosahedronGeometry(0.4, 0), '#f7bad0', 0.02, 2.24, -0.06),
    );
    // 5) Ciprés estilizado de colina/pueblo
    const cipresGeo = unir(
      pieza(new THREE.CylinderGeometry(0.07, 0.11, 0.75, 5), troncoOsc, 0, 0.37, 0),
      pieza(new THREE.ConeGeometry(0.46, 2.4, 7), '#2d6238', 0, 1.75, 0),
      pieza(new THREE.IcosahedronGeometry(0.38, 0), '#387542', 0, 1.35, 0),
    );
    // 6) Palmera tropical curva (5 segmentos + 9 frondas en 2 alturas + cocos)
    const hojas = [];
    for (let k = 0; k < 6; k++) {
      const h1 = new THREE.BoxGeometry(0.95, 0.03, 0.22); h1.translate(0.47, 0, 0);
      hojas.push(pieza(h1, k % 2 ? '#3e9948' : '#4eb255', 0.28, 2.02, 0, { rz: -0.48, ry: k * Math.PI * 2 / 6 }));
    }
    for (let k = 0; k < 4; k++) {
      const h2 = new THREE.BoxGeometry(0.7, 0.025, 0.18); h2.translate(0.35, 0, 0);
      hojas.push(pieza(h2, '#5ec262', 0.28, 2.1, 0, { rz: -0.15, ry: k * Math.PI / 2 + 0.4 }));
    }
    const palmeraGeo = unir(
      pieza(new THREE.CylinderGeometry(0.09, 0.115, 0.55, 6), '#9b7046', 0, 0.27, 0),
      pieza(new THREE.CylinderGeometry(0.08, 0.092, 0.55, 6), '#8a6239', 0.05, 0.78, 0, { rz: -0.1 }),
      pieza(new THREE.CylinderGeometry(0.07, 0.082, 0.52, 6), '#9b7046', 0.13, 1.26, 0, { rz: -0.18 }),
      pieza(new THREE.CylinderGeometry(0.06, 0.072, 0.48, 6), '#8a6239', 0.22, 1.72, 0, { rz: -0.25 }),
      ...hojas,
      pieza(new THREE.IcosahedronGeometry(0.075, 0), '#5e3a1c', 0.34, 1.92, 0.08),
      pieza(new THREE.IcosahedronGeometry(0.075, 0), '#6b4423', 0.22, 1.9, -0.08),
      pieza(new THREE.IcosahedronGeometry(0.07, 0), '#5e3a1c', 0.29, 1.88, -0.02),
    );

    const mk = (geo, cap) => { const im = new THREE.InstancedMesh(geo, matVC(), cap); im.castShadow = !MOVIL; return im; };
    const tipos = {
      pinoAlto: mk(pinoAltoGeo, n),
      pinoAncho: mk(pinoAnchoGeo, n),
      roble: mk(robleGeo, n),
      cerezo: mk(cerezoGeo, Math.ceil(n * 0.25)),
      cipres: mk(cipresGeo, Math.ceil(n * 0.35)),
      palmera: mk(palmeraGeo, Math.ceil(n * 0.5)),
    };
    const cnt = { pinoAlto: 0, pinoAncho: 0, roble: 0, cerezo: 0, cipres: 0, palmera: 0 };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    const busy = [...plots, ...(this.buildingAnchors || [])];
    for (let i = 0, total = 0; i < n * 4 && total < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * this.R * 1.04; const x = Math.cos(a) * d, z = Math.sin(a) * d; const y = this.height(x, z);
      if (y < 0.5 || y > 6.5) continue;
      // Agrupaciones naturales (bosquecillos y claros orgánicos)
      const grove = fbm(x * 0.075 + 1.7, z * 0.075 - 2.3);
      if (y > 1.5 && grove < 0.36 && r() < 0.72) continue;
      if (busy.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 6.8)) continue;
      if (this.hit(x, z, 0.85)) continue;
      if (this.sinArboles?.some((o) => (x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r)) continue; // carretera de la costa
      { const gx = Math.round((x - TOWN.x) / PASO), gz = Math.round((z - TOWN.z) / PASO); if (this.manzanasUsadas?.has(gx * 1000 + gz) || this.civicBlocks?.has(gx * 1000 + gz)) continue; }
      if (Math.hypot(x - FLAG.x, z - FLAG.z) < 4.5) continue;
      if (enPlaya(x, z) && y < 2.2) continue;
      if (x < COMERCIO.x0 + 2 && Math.abs(z - COMERCIO.z) < COMERCIO.fondo + 2.2) continue;
      if (x < riverX(z) && r() < 0.58) continue;
      if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.flat + 1 || this.inRiver(x, z, 0.35)) continue;
      if (Math.abs(z - BRIDGE_Z) < 2.5 && x < TOWN.x && x > riverX(BRIDGE_Z) - 8) continue;

      const sc = (0.76 + r() * 0.68) * S; s.set(sc, Math.max(sc * (0.94 + r() * 0.22), 0.92), sc);
      let tipo;
      if (y < 1.45) tipo = 'palmera';
      else if (grove > 0.62) tipo = r() < 0.55 ? 'pinoAlto' : 'pinoAncho';
      else {
        const roll = r();
        tipo = roll < 0.28 ? 'pinoAlto' : roll < 0.5 ? 'pinoAncho' : roll < 0.8 ? 'roble' : roll < 0.91 ? 'cipres' : 'cerezo';
      }
      if (cnt[tipo] >= tipos[tipo].count) tipo = 'roble';
      if (cnt[tipo] >= tipos[tipo].count) continue;

      e.set((r() - 0.5) * 0.1, r() * Math.PI * 2, (r() - 0.5) * 0.1);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y - 0.06, z), q, s);
      const im = tipos[tipo]; im.setMatrixAt(cnt[tipo], m);
      const v = tipo === 'cerezo' ? (0.92 + r() * 0.16) : (0.84 + r() * 0.28);
      im.setColorAt(cnt[tipo], c.setRGB(v * (0.96 + r() * 0.08), v, v * (0.92 + r() * 0.08)));
      cnt[tipo]++; total++;
      this.addObstacle(x, z, 0.2 * sc + 0.14);
    }
    for (const [k, im] of Object.entries(tipos)) { im.count = cnt[k]; if (im.instanceColor) im.instanceColor.needsUpdate = true; this.root.add(im); }
    this.#rocks(plots);
    this.#pasto(plots);
    this.#bushes(plots);
  }

  // Rocas estilizadas en costas, riberas del río y laderas altas (2 InstancedMesh)
  #rocks(plots) {
    const r = mulberry(149);
    const nMax = Math.floor(this.R * (MOVIL ? 1.1 : 2.1));
    const rocaCostaGeo = unir(
      pieza(new THREE.DodecahedronGeometry(0.55, 0), '#7d8076', 0, 0.22, 0, { sx: 1.25, sy: 0.72, sz: 1.05 }),
      pieza(new THREE.DodecahedronGeometry(0.36, 0), '#939589', 0.42, 0.14, 0.18, { ry: 0.7, sy: 0.65 }),
      pieza(new THREE.DodecahedronGeometry(0.28, 0), '#6d7067', -0.36, 0.12, -0.22, { rz: 0.3, sy: 0.6 }),
    );
    const rocaMusgoGeo = unir(
      pieza(new THREE.DodecahedronGeometry(0.5, 0), '#828478', 0, 0.2, 0, { sx: 1.15, sy: 0.75, sz: 1.0 }),
      pieza(new THREE.DodecahedronGeometry(0.34, 0), '#5f8f45', 0.05, 0.38, 0.04, { sx: 0.9, sy: 0.35, sz: 0.85 }),
      pieza(new THREE.DodecahedronGeometry(0.26, 0), '#95978a', -0.35, 0.12, 0.2, { sy: 0.65 }),
    );
    const mk = (geo) => { const im = new THREE.InstancedMesh(geo, matVC({ roughness: 0.96 }), nMax); im.receiveShadow = !MOVIL; im.castShadow = !MOVIL; return im; };
    const costaIm = mk(rocaCostaGeo), musgoIm = mk(rocaMusgoGeo);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
    const busy = [...plots, ...(this.buildingAnchors || [])];
    let kc = 0, km = 0;

    for (let i = 0; i < nMax * 6 && (kc + km) < nMax; i++) {
      const a = r() * Math.PI * 2;
      const onRiver = r() < 0.38;
      let x, z;
      if (onRiver) {
        z = (r() - 0.5) * this.R * 1.45;
        if (Math.abs(z - BRIDGE_Z) < 2.6 || Math.abs(z - FIGURE_Z) < 3.0) continue;
        const side = r() < 0.5 ? -1 : 1;
        x = riverX(z) + side * (RIVER.half + 0.35 + r() * 0.95);
      } else {
        const d = (r() < 0.65 ? (0.76 + r() * 0.24) : (0.35 + r() * 0.42)) * this.R;
        x = Math.cos(a) * d; z = Math.sin(a) * d;
      }
      const y = this.height(x, z);
      if (y < -0.15 || y > 6.6) continue;
      if (enPlaya(x, z) && y < 1.35) continue;
      if (!onRiver && y > 1.2 && y < 3.2) continue; // tierra interior solo en laderas/cimas o riberas
      if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.flat + 1.2) continue;
      if (x < COMERCIO.x0 + 2 && Math.abs(z - COMERCIO.z) < COMERCIO.fondo + 2) continue;
      if (busy.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 4.8)) continue;

      const sc = (0.55 + r() * 0.75) * S;
      e.set((r() - 0.5) * 0.22, r() * Math.PI * 2, (r() - 0.5) * 0.22);
      q.setFromEuler(e);
      s.set(sc * (0.9 + r() * 0.3), sc * (0.75 + r() * 0.4), sc * (0.9 + r() * 0.3));
      m.compose(new THREE.Vector3(x, y - 0.08, z), q, s);
      const v = 0.86 + r() * 0.22; c.setRGB(v, v, v);
      if ((onRiver || y > 2.8) && km < nMax) {
        musgoIm.setMatrixAt(km, m); musgoIm.setColorAt(km, c); km++;
      } else if (kc < nMax) {
        costaIm.setMatrixAt(kc, m); costaIm.setColorAt(kc, c); kc++;
      }
      if (sc > 0.55) this.addObstacle(x, z, 0.35 * sc);
    }
    costaIm.count = kc; musgoIm.count = km;
    if (costaIm.instanceColor) costaIm.instanceColor.needsUpdate = true;
    if (musgoIm.instanceColor) musgoIm.instanceColor.needsUpdate = true;
    this.root.add(costaIm, musgoIm);
  }

  // Arbustos y helechos agrupados naturalmente (2 InstancedMesh)
  #bushes(plots) {
    const r = mulberry(113); const n = Math.floor(this.R * this.R * (MOVIL ? 0.09 : 0.16));
    const bushGeo = unir(
      pieza(new THREE.IcosahedronGeometry(0.42, 0), '#3b7a38', 0, 0.24, 0),
      pieza(new THREE.IcosahedronGeometry(0.32, 0), '#4b9142', 0.26, 0.18, 0.1),
      pieza(new THREE.IcosahedronGeometry(0.3, 0), '#5aa64e', -0.24, 0.2, -0.12),
      pieza(new THREE.IcosahedronGeometry(0.24, 0), '#478b3f', 0.05, 0.38, -0.06),
      pieza(new THREE.IcosahedronGeometry(0.06, 0), '#f4a261', 0.16, 0.34, 0.22),
      pieza(new THREE.IcosahedronGeometry(0.055, 0), '#ffd166', -0.18, 0.3, 0.16),
    );
    const frondas = [];
    for (let j = 0; j < 7; j++) {
      const f = new THREE.BoxGeometry(0.55, 0.025, 0.13); f.translate(0.26, 0, 0);
      frondas.push(pieza(f, j % 2 ? '#459448' : '#57aa53', 0, 0.16, 0, { rz: 0.42, ry: j * Math.PI * 2 / 7 }));
    }
    const fernGeo = unir(...frondas, pieza(new THREE.IcosahedronGeometry(0.14, 0), '#387d3a', 0, 0.12, 0));

    const imBush = new THREE.InstancedMesh(bushGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), n);
    const imFern = new THREE.InstancedMesh(fernGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), Math.ceil(n * 0.6));
    imBush.receiveShadow = !MOVIL; imFern.receiveShadow = !MOVIL;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    const busy = [...plots, ...(this.buildingAnchors || [])];
    let kb = 0, kf = 0;
    for (let i = 0; i < n * 3 && (kb + kf) < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * this.R * 0.98; const x = Math.cos(a) * d, z = Math.sin(a) * d; const y = this.height(x, z);
      if (y < 0.85 || y > 5.8 || enPlaya(x, z) || this.inRiver(x, z, 0.55)) continue;
      if (busy.some((pt) => (pt.x - x) ** 2 + (pt.z - z) ** 2 < 4.2)) continue;
      if (this.hit(x, z, 0.65)) continue;
      { const gx = Math.round((x - TOWN.x) / PASO), gz = Math.round((z - TOWN.z) / PASO); if (this.manzanasUsadas?.has(gx * 1000 + gz) || this.civicBlocks?.has(gx * 1000 + gz)) continue; }
      if (Math.abs(z - BRIDGE_Z) < 2.6 && x < TOWN.x && x > riverX(BRIDGE_Z) - 8) continue;
      if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.flat + 0.5) continue;
      if (x < COMERCIO.x0 + 2 && Math.abs(z - COMERCIO.z) < COMERCIO.fondo + 1.5) continue;
      q.setFromAxisAngle(up, r() * Math.PI * 2); const sc = (0.7 + r() * 0.65) * S; s.set(sc, sc * (0.75 + r() * 0.35), sc);
      m.compose(p.set(x, y - 0.04, z), q, s);
      const v = 0.86 + r() * 0.26; c.setRGB(v, v, v);
      const nearWater = y < 1.65 || Math.abs(x - riverX(z)) < RIVER.half + RIVER.bank + 2.5;
      if (nearWater && kf < imFern.count) { imFern.setMatrixAt(kf, m); imFern.setColorAt(kf, c); kf++; }
      else if (kb < imBush.count) { imBush.setMatrixAt(kb, m); imBush.setColorAt(kb, c); kb++; }
    }
    imBush.count = kb; imFern.count = kf;
    if (imBush.instanceColor) imBush.instanceColor.needsUpdate = true;
    if (imFern.instanceColor) imFern.instanceColor.needsUpdate = true;
    this.root.add(imBush, imFern);
  }

  // Aves pequeñas sobrevolando la isla (1 sola InstancedMesh, sin sombras)
  #birds() {
    const birdGeo = unir(
      pieza(new THREE.BoxGeometry(0.14, 0.1, 0.32), '#f8f9fa', 0, 0, 0),
      pieza(new THREE.ConeGeometry(0.04, 0.1, 4), '#f4a261', 0, 0, 0.2, { rx: Math.PI / 2 }),
      pieza(new THREE.BoxGeometry(0.45, 0.025, 0.14), '#e9ecef', 0.24, 0.04, -0.02, { rz: 0.25 }),
      pieza(new THREE.BoxGeometry(0.45, 0.025, 0.14), '#e9ecef', -0.24, 0.04, -0.02, { rz: -0.25 }),
    );
    const n = MOVIL ? 8 : 14;
    const im = new THREE.InstancedMesh(birdGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), n);
    im.frustumCulled = false;
    const r = mulberry(211);
    this.birds = {
      im, m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3(), e: new THREE.Euler(),
      list: Array.from({ length: n }, (_, i) => ({
        r: 10 + r() * 28, y: 9 + r() * 11, spd: (0.14 + r() * 0.18) * (i % 2 ? 1 : -1), ph: r() * Math.PI * 2, sc: 0.85 + r() * 0.45,
      })),
    };
    this.scene.add(im);
  }
  #updateBirds(t) {
    if (!this.birds) return;
    const { im, list, m, q, s, p, e } = this.birds;
    for (let i = 0; i < list.length; i++) {
      const b = list[i], ang = b.ph + t * b.spd;
      const x = Math.cos(ang) * b.r, z = Math.sin(ang) * b.r, y = b.y + Math.sin(t * 1.8 + b.ph) * 0.7;
      const yaw = b.spd > 0 ? -ang : -ang + Math.PI;
      e.set(Math.sin(t * 3 + b.ph) * 0.08, yaw, b.spd > 0 ? 0.18 : -0.18);
      q.setFromEuler(e); m.compose(p.set(x, y, z), q, s.setScalar(b.sc));
      im.setMatrixAt(i, m);
    }
    im.instanceMatrix.needsUpdate = true;
  }

  // Pastito y flores silvestres en parches naturales (InstancedMesh ligero, también en móvil con menor densidad)
  #pasto(plots) {
    const r = mulberry(91); const n = Math.floor(this.R * this.R * (MOVIL ? 0.35 : 1.7));
    const brizna = (ang, inc, col) => pieza(new THREE.ConeGeometry(0.03, 0.17, 3, 1, true), col, Math.cos(ang) * 0.05, 0.08, Math.sin(ang) * 0.05, { rz: inc * Math.cos(ang), rx: -inc * Math.sin(ang) });
    const mataGeo = unir(brizna(0, 0.45, '#8bc96a'), brizna(2.1, 0.4, '#9bd47a'), brizna(4.2, 0.5, '#7fbf5e'), brizna(1.0, 0.1, '#95cf72'));
    const petalos = [0, 1, 2, 3].map((k) => pieza(new THREE.BoxGeometry(0.055, 0.015, 0.035), '#ffffff', Math.cos(k * Math.PI / 2) * 0.042, 0.23, Math.sin(k * Math.PI / 2) * 0.042, { ry: k * Math.PI / 2 }));
    const florGeo = unir(
      pieza(new THREE.CylinderGeometry(0.011, 0.014, 0.22, 3), '#4e8f3a', 0, 0.11, 0),
      pieza(new THREE.BoxGeometry(0.06, 0.012, 0.03), '#5ea345', 0.03, 0.09, 0, { rz: 0.45 }),
      pieza(new THREE.IcosahedronGeometry(0.026, 0), '#ffd166', 0, 0.235, 0),
      ...petalos,
    );
    const matas = new THREE.InstancedMesh(mataGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), n);
    const flores = new THREE.InstancedMesh(florGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), Math.ceil(n * (MOVIL ? 0.25 : 0.16)));
    const FLOR = ['#ffffff', '#ffd166', '#ef476f', '#c77dff', '#f4a261', '#90e0ef'];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    let km = 0, kf = 0;
    for (let i = 0; i < n * 2.5 && km < n; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * this.R; const x = Math.cos(a) * d, z = Math.sin(a) * d; const y = this.height(x, z);
      if (y < 1.2 || y > 5.5 || enPlaya(x, z) || this.inRiver(x, z, 0.55)) continue;
      if (this.hit(x, z, 0.45)) continue;
      { const gx = Math.round((x - TOWN.x) / PASO), gz = Math.round((z - TOWN.z) / PASO); if (this.manzanasUsadas?.has(gx * 1000 + gz) || this.civicBlocks?.has(gx * 1000 + gz)) continue; }
      if (Math.abs(z - BRIDGE_Z) < 2.6 && x < TOWN.x && x > riverX(BRIDGE_Z) - 8) continue;
      if (Math.hypot(x - TOWN.x, z - TOWN.z) < TOWN.flat - 0.5) continue;
      if (x < COMERCIO.x0 + 2 && Math.abs(z - COMERCIO.z) < COMERCIO.fondo + 1) continue;
      const patch = fbm(x * 0.18 + 6.2, z * 0.18 - 4.1);
      if (patch < 0.35 && r() < 0.7) continue;
      q.setFromAxisAngle(up, r() * Math.PI * 2); const sc = 0.7 + r() * 0.85; s.set(sc, sc * (0.8 + r() * 0.5), sc);
      m.compose(new THREE.Vector3(x, y - 0.02, z), q, s);
      const isFlower = (patch > 0.54 ? r() < 0.26 : r() < 0.08) && kf < flores.count;
      if (isFlower) { flores.setMatrixAt(kf, m); flores.setColorAt(kf, c.set(FLOR[Math.floor(r() * FLOR.length)])); kf++; }
      else { matas.setMatrixAt(km, m); const v = 0.85 + r() * 0.3; matas.setColorAt(km, c.setRGB(v, v, v)); km++; }
    }
    matas.count = km; flores.count = kf; matas.receiveShadow = !MOVIL;
    if (flores.instanceColor) flores.instanceColor.needsUpdate = true; if (matas.instanceColor) matas.instanceColor.needsUpdate = true;
    this.root.add(matas, flores);
  }

  // Las islas vecinas en el horizonte (Instagram ↔ TikTok ↔ YouTube): crecen con sus habitantes; al tocarlas se puede cruzar
  #vecina() {
    const list = this.vecinas?.length ? this.vecinas : (this.vecina ? [this.vecina] : []);
    if (!list.length) return;
    this.vecinaPosMap = {};
    list.forEach((v, idx) => {
      const r = mulberry(v.id === 'tiktok' ? 11 : v.id === 'youtube' ? 33 : 22);
      const n = Math.min(60, v.habitantes || 0);
      const rad = 16 + Math.min(26, Math.sqrt(n) * 3.2);
      const g = new THREE.Group();
      const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...extra });
      const cylSeg = v.id === 'youtube' ? 3 : 18;
      const arena = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.15, 3, cylSeg), M('#e9d8a6'));
      arena.position.y = -0.6; g.add(arena);
      const verde = new THREE.Mesh(
        new THREE.CylinderGeometry(rad * 0.82, rad * 0.95, 2, cylSeg),
        M(v.id === 'tiktok' ? '#4f8f6a' : v.id === 'youtube' ? '#589c4f' : '#5a9a45')
      );
      verde.position.y = 1.2; g.add(verde);
      const colina = new THREE.Mesh(new THREE.ConeGeometry(rad * 0.45, 7, 9), M('#6a9a4a'));
      colina.position.set(rad * 0.15, 4.5, -rad * 0.2); g.add(colina);
      for (let i = 0; i < 26; i++) {
        const a = r() * Math.PI * 2, d = rad * (0.28 + r() * 0.46);
        const t = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.2, 6), M('#2f6b35'));
        t.position.set(Math.cos(a) * d, 3.6, Math.sin(a) * d); g.add(t);
      }
      const COL = v.id === 'tiktok'
        ? ['#25f4ee', '#fe2c55', '#ffffff', '#111111']
        : v.id === 'youtube'
          ? ['#ff0033', '#ffffff', '#282828', '#ff4e45']
          : ['#e76f51', '#f4a261', '#2a9d8f', '#e9c46a'];
      for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = rad * (0.15 + r() * 0.55);
        const c = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 1.4), M('#f4efe6'));
        c.position.set(Math.cos(a) * d, 2.8, Math.sin(a) * d); g.add(c);
        const t = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.9, 4), M(COL[i % COL.length]));
        t.position.set(c.position.x, 3.85, c.position.z); t.rotation.y = Math.PI / 4; g.add(t);
      }
      if (!n) {
        const cartel = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 0.2), M(v.id === 'youtube' ? '#ff0033' : '#fe2c55'));
        cartel.position.set(0, 3.4, rad * 0.5); g.add(cartel);
      }
      if (v.id === 'youtube') {
        // Muralla perimetral de Oriente
        for (let wi = 0; wi < 18; wi++) {
          const wa = (wi / 18) * Math.PI * 2;
          const wx = Math.cos(wa) * (rad * 0.86), wz = Math.sin(wa) * (rad * 0.86);
          const wMesh = new THREE.Mesh(new THREE.BoxGeometry(rad * 0.3, 1.4, 0.5), M('#7f5539'));
          wMesh.position.set(wx, 2.5, wz); wMesh.rotation.y = -wa + Math.PI / 2; g.add(wMesh);
        }
        // Titán de Piedra gigante
        const titan = new THREE.Group();
        const tBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.2, 1.4), M('#6c757d')); tBody.position.y = 3.6; titan.add(tBody);
        const tHead = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 1.2), M('#8d99ae')); tHead.position.y = 5.6; titan.add(tHead);
        const tCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), M('#38bdf8', { emissive: '#0ea5e9', emissiveIntensity: 1.6 }));
        tCore.position.set(0, 3.8, 0.75); titan.add(tCore);
        titan.position.set(rad * 0.35, 1.8, rad * 0.1);
        g.add(titan);
        // Tesla volador sobre la isla de YouTube
        const tesla = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 2.2), M('#ffffff', { emissive: '#38bdf8', emissiveIntensity: 0.6 }));
        tesla.position.set(0, 9, 0); g.add(tesla);
        this.animProps.push((t) => {
          tesla.position.set(Math.cos(t * 1.5) * (rad * 0.65), 8.5 + Math.sin(t * 3) * 0.8, Math.sin(t * 1.5) * (rad * 0.65));
          tesla.rotation.y = -t * 1.5;
        });
      }
      const x = list.length > 1
        ? (idx === 0 ? -1 : 1) * (this.R * 1.45 + rad * 0.4)
        : this.R * 0.55;
      const z = list.length > 1
        ? -(this.R * 2.2 + rad + 26)
        : -(this.R * 2.3 + rad + 30);
      g.position.set(x, 0, z);
      g.traverse((o) => { o.castShadow = false; o.receiveShadow = true; });
      g.userData.pick = { type: 'vecina', vecina: v };
      this.pickables.push(g); this.root.add(g);
      this.#label(`${v.emoji} ${v.nombre} · ${v.habitantes} habitante${v.habitantes === 1 ? '' : 's'}`, new THREE.Vector3(g.position.x, 13, g.position.z), 'lbl lbl-building lbl-vecina');
      this.vecinaPosMap[v.id] = g.position.clone();
      if (idx === 0) this.vecinaPos = g.position.clone();
    });
  }

  // ---------- Muralla perimetral defensiva de Isla YouTube (Oriente) ----------
  // Se adapta exactamente a las dimensiones y curvatura trilobular de la isla: R(a) = R * (1 + 0.19 * cos(3a))
  #youtubePerimeterWall() {
    const wallMat = new THREE.MeshStandardMaterial({ color: '#5a6270', roughness: 0.9, flatShading: true });
    const wallCapMat = new THREE.MeshStandardMaterial({ color: '#727d91', roughness: 0.85, flatShading: true });
    const woodMat = new THREE.MeshStandardMaterial({ color: '#7f5539', roughness: 0.9, flatShading: true });
    const ytRedMat = new THREE.MeshStandardMaterial({ color: '#ff0033', roughness: 0.7, flatShading: true });
    const torchMat = new THREE.MeshStandardMaterial({ color: '#ffb703', emissive: '#ffb703', emissiveIntensity: 1.5 });

    const N_SEGS = 48;
    const g = new THREE.Group();

    for (let i = 0; i < N_SEGS; i++) {
      const a = (i / N_SEGS) * Math.PI * 2;
      const nextA = ((i + 1) / N_SEGS) * Math.PI * 2;
      const R_a = this.R * (1 + 0.19 * Math.cos(3 * a));
      const r_wall = R_a * 0.84;
      const x = Math.cos(a) * r_wall;
      const z = Math.sin(a) * r_wall;

      const nextR = this.R * (1 + 0.19 * Math.cos(3 * nextA)) * 0.84;
      const nx = Math.cos(nextA) * nextR;
      const nz = Math.sin(nextA) * nextR;
      const segLen = Math.hypot(nx - x, nz - z) + 0.35;
      const segAngle = Math.atan2(nz - z, nx - x);

      // Paso del río: dos torreones de compuerta fluvial con rastrillo de hierro
      const riverDist = Math.abs(x - riverX(z));
      if (riverDist < RIVER.half + 1.2) {
        if (i % 2 === 0) {
          const gw = new THREE.Group();
          const pTower = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 4.8, 8), wallMat);
          const py = Math.max(0.4, this.height(x, z));
          pTower.position.y = 2.4; gw.add(pTower);
          const grate = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.5, 2.2), woodMat);
          grate.position.set(0, 1.25, 0); gw.add(grate);
          gw.position.set(x, py, z); g.add(gw);
          this.addObstacle(x, z, 1.3);
        }
        continue;
      }

      const y = this.height(x, z);
      if (y < 0.35) continue; // no meter dentro del agua profunda

      // Muro de piedra continuo con camino de ronda
      const seg = new THREE.Group();
      const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(segLen, 2.1, 0.75), wallMat);
      wallMesh.position.set(0, 1.05, 0); wallMesh.receiveShadow = true; seg.add(wallMesh);

      // Pasarela de madera detrás del muro (para guardia/patrulla)
      const walkMesh = new THREE.Mesh(new THREE.BoxGeometry(segLen, 0.12, 0.65), woodMat);
      walkMesh.position.set(0, 1.25, -0.45); seg.add(walkMesh);

      // Almenas (merlones defensivos) en lo alto del muro
      for (let m = -0.4; m <= 0.4; m += 0.4) {
        const almena = new THREE.Mesh(new THREE.BoxGeometry(segLen * 0.22, 0.55, 0.78), wallCapMat);
        almena.position.set(segLen * m, 2.35, 0); seg.add(almena);
      }

      seg.position.set((x + nx) * 0.5, y, (z + nz) * 0.5);
      seg.rotation.y = -segAngle;
      g.add(seg);
      this.addObstacle(x, z, 0.65);

      // Torreón bastión cada 4 segmentos
      if (i % 4 === 0) {
        const tower = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.6, 4.6, 8), wallMat);
        base.position.y = 2.3; tower.add(base);

        // Almenas del torreón
        const roofCap = new THREE.Mesh(new THREE.CylinderGeometry(1.48, 1.48, 0.35, 8), wallCapMat);
        roofCap.position.y = 4.75; tower.add(roofCap);

        // Tejado cónico rojo estilo YouTube
        const roofCone = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.5, 8), ytRedMat);
        roofCone.position.y = 5.65; tower.add(roofCone);

        // Mástil y bandera de YouTube en la cúspide
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), woodMat);
        mast.position.y = 7.1; tower.add(mast);
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.04), ytRedMat);
        flag.position.set(0.48, 7.4, 0); tower.add(flag);

        // Antorcha cálida en la entrada del torreón
        const torch = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), torchMat);
        torch.position.set(0, 3.2, 1.7); tower.add(torch);

        tower.position.set(x, y, z);
        g.add(tower);
        this.addObstacle(x, z, 1.5);
      }
    }

    this.root.add(g);
  }

  // ---------- Buscador de terreno libre (evita casas, calles, plaza, río, edificios y muralla) ----------
  // ---------- Ruta de la costa (solo trazado para el metro elevado en Oriente; sin carretera de asfalto) ----------
  #carreteraCosta(plots = []) {
    const forma = (a) => this.R * (this.esYoutube ? (1 + 0.19 * Math.cos(3 * a)) : 1);
    const polar = (q) => ({ a: Math.atan2(q.z, q.x), d: Math.hypot(q.x, q.z) });
    const dentro = [...plots, ...(this.obras || [])].map(polar);           // la ciudad queda por dentro del anillo
    const edificios = (this.buildingAnchors || []).map(polar);              // edificios sueltos: el trazado los esquiva por dentro o por fuera
    const cerca = (q, a, w) => { let da = Math.abs(q.a - a); da = Math.min(da, Math.PI * 2 - da); return da < w; };
    const radio = (a) => { const tope = forma(a) * (this.esYoutube ? 0.74 : 0.84); let r = forma(a) * (this.esYoutube ? 0.64 : 0.66);
      for (const q of dentro) if (cerca(q, a, 0.26)) r = Math.max(r, q.d + 6.5);
      return Math.min(r, tope); };
    const esquivar = (a, r) => { const tope = forma(a) * (this.esYoutube ? 0.74 : 0.84);
      for (const q of edificios) if (cerca(q, a, 0.2) && Math.abs(q.d - r) < 6) r = q.d > r ? q.d - 6.5 : Math.min(tope, q.d + 6.5);
      return r; };
    const N = 96; const base = []; let hMax = 0;
    // radios suavizados (máximo local y luego media) para que la curva sea redonda y no en dientes de sierra
    let rs = Array.from({ length: N }, (_, i) => radio((i / N) * Math.PI * 2));
    rs = rs.map((_, i) => Math.max(...[-3, -2, -1, 0, 1, 2, 3].map((k) => rs[(i + k + N) % N])));
    for (let pasada = 0; pasada < 2; pasada++) rs = rs.map((_, i) => [-3, -2, -1, 0, 1, 2, 3].reduce((acc, k) => acc + rs[(i + k + N) % N], 0) / 7);
    rs = rs.map((r, i) => esquivar((i / N) * Math.PI * 2, r));
    rs = rs.map((_, i) => Math.min(rs[i], [-2, -1, 0, 1, 2].reduce((acc, k) => acc + rs[(i + k + N) % N], 0) / 5 + 0.0) * 0.5 + rs[i] * 0.5);
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2, r = rs[i]; const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = Math.max(this.height(x, z), 1.25); hMax = Math.max(hMax, h); base.push([x, z, h]);
      if (this.esYoutube) this.sinArboles.push({ x, z, r: 1.6 }); }
    this.costaBase = base; this.costaAltoMax = hMax;
    this.costaCurva = new THREE.CatmullRomCurve3(base.map(([x, z, h]) => new THREE.Vector3(x, h, z)), true);
  }

  // Distritos de la isla: cada uno es un sector (ángulo en grados, -90 = norte) a una fracción del radio.
  // Como dependen de this.R, al crecer la isla los distritos se alejan del centro hacia el borde y dejan sitio a los barrios.
  // Cada obra de un distrito ocupa su «slot» (separados ~14° por el arco) para que no se amontonen.
  #distrito(id, slot = 0) {
    const D = DISTRITOS[id] || DISTRITOS.militar; const out = [];
    for (const df of [0, -0.06, 0.05, -0.12]) for (const k of [0, 1, -1, 2, -2]) {
      const a = THREE.MathUtils.degToRad(D[0] + (D[2] || 1) * slot * 14 + k * 7), r = this.R * (D[1] + df);
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
  }

  #findClearSpot(candidates, radius, plots = [], minHeight = 1.05) {
    const isFree = (x, z) => {
      const R = this.esYoutube ? this.R * (1 + 0.19 * Math.cos(3 * Math.atan2(z, x))) : this.R;
      const d = Math.hypot(x, z) / R;
      if (d > (this.esYoutube ? 0.72 : 0.78)) return false; // dentro de la isla y lejos de la muralla/borde
      if (this.height(x, z) < minHeight) return false;
      if (!this.esYoutube && enPlaya(x, z) && d > 0.45) return false; // la playa queda libre
      if (this.inRiver(x, z, radius + 0.8)) return false;
      if (Math.hypot(x - TOWN.x, z - TOWN.z) < 6.8 + radius) return false;
      if (Math.hypot(x - FLAG.x, z - FLAG.z) < 4.0 + radius) return false;
      if (Math.abs(z - BRIDGE_Z) < 4.2 + radius && x < TOWN.x) return false;
      for (const m of (this.manzanaCoords || [])) {
        if (Math.max(Math.abs(x - m.cx), Math.abs(z - m.cz)) < 5.6 + radius) return false;
      }
      for (const key of (this.civicBlocks || [])) {
        const gx = Math.round(key / 1000), gz = key - gx * 1000;
        if (Math.max(Math.abs(x - (TOWN.x + gx * PASO)), Math.abs(z - (TOWN.z + gz * PASO))) < 5.6 + radius) return false;
      }
      for (const a of (this.buildingAnchors || [])) {
        if (Math.hypot(x - a.x, z - a.z) < 4.5 + radius) return false;
      }
      for (const n of (this.negocioPos?.values() || [])) {
        if (Math.hypot(x - n.x, z - n.z) < 3.0 + radius) return false;
      }
      for (const p of plots) {
        if (Math.hypot(x - p.x, z - p.z) < 2.6 + radius) return false;
      }
      for (const b of (this.buildingAnchors || [])) {
        if (Math.hypot(x - b.x, z - b.z) < 4.4 + radius) return false;
      }
      if (this.hit(x, z, radius + 0.8)) return false;
      return true;
    };

    for (const [cx, cz] of candidates) {
      if (isFree(cx, cz)) return { x: cx, z: cz, y: this.height(cx, cz) };
      // Búsqueda en espiral alrededor del candidato preferido
      for (let rad = 2; rad <= 14; rad += 2) {
        for (let a = 0; a < 12; a++) {
          const ang = (a / 12) * Math.PI * 2;
          const nx = cx + Math.cos(ang) * rad, nz = cz + Math.sin(ang) * rad;
          if (isFree(nx, nz)) return { x: nx, z: nz, y: this.height(nx, nz) };
        }
      }
    }
    const [fx, fz] = candidates[0];
    return { x: fx, z: fz, y: this.height(fx, fz) };
  }

  // ---------- Peticiones exageradas y cómicas en Isla YouTube ----------
  #youtubeExaggeratedBuilds(plots = [], state = null) {
    const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...extra });
    const g = new THREE.Group();

    // 1. «400.000 millones de soldados» (@marisolpintosillcahue) -> Banda de mercenarios en claro Suroeste / cerca de la playa
    const campSpot = this.#findClearSpot([[-15, 11], [-18, 14], [-13, 15], [-20, 8]], 4.2, plots, 1.0);
    const bx = campSpot.x, bz = campSpot.z, by = campSpot.y;
    const camp = new THREE.Group();
    const campFloor = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.8, 0.08, 12), M('#7f7158'));
    campFloor.position.y = 0.04; camp.add(campFloor);

    // Carpa militar de lona
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.85, 4), M('#6b705c'));
    tent.rotation.y = Math.PI / 4; tent.position.set(-1.5, 0.95, -1.3); camp.add(tent);

    // Fogata central del campamento
    const fireGlow = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 6), M('#ff6b00', { emissive: '#ff5400', emissiveIntensity: 2.0 }));
    fireGlow.position.set(0, 0.35, 0.2); camp.add(fireGlow);
    for (let li = 0; li < 4; li++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.7, 5), M('#582f0e'));
      log.rotation.z = Math.PI / 2; log.rotation.y = (li * Math.PI) / 4; log.position.set(0, 0.1, 0.2); camp.add(log);
    }

    // Banda de 5 mercenarios rudos (chaleco oscuro, pañuelo rojo, lanza y escudo)
    const mercColors = ['#2b2d42', '#3d405b', '#4a4e69', '#22223b', '#333533'];
    for (let mi = 0; mi < 5; mi++) {
      const ang = -0.8 + mi * 0.48;
      const mx = Math.sin(ang) * 2.0, mz = Math.cos(ang) * 2.0;
      const merc = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.65, 0.28), M(mercColors[mi])); body.position.y = 0.58; merc.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), M('#e0a96d')); head.position.y = 1.05; merc.add(head);
      const bandana = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 6), M('#d90429')); bandana.position.y = 1.14; merc.add(bandana);
      const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 6), M('#8d99ae'));
      shield.rotation.x = Math.PI / 2; shield.position.set(-0.26, 0.65, 0.15); merc.add(shield);
      const spear = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 4), M('#adb5bd'));
      spear.position.set(0.28, 0.85, 0.1); merc.add(spear);
      merc.position.set(mx, 0.08, mz);
      merc.rotation.y = Math.atan2(-mx, -mz);
      camp.add(merc);
    }
    camp.position.set(bx, by, bz);
    g.add(camp);
    this.addObstacle(bx, bz, 4.0);
    this.campPos = new THREE.Vector3(bx, by, bz);
    this.#label('⚔️ BANDA DE MERCENARIOS (PARA LO QUE ALCANZÓ)', new THREE.Vector3(bx, by + 3.0, bz), 'lbl lbl-building');

    // 2. «120 Teslas voladores con láser» (@SantiagovideosépicosXDD-h3h) -> Mini drones Tesla en claro Noroeste / playa norte
    const droneSpot = this.#findClearSpot([[-15, -11], [-18, -14], [-13, -15], [-20, -8]], 3.2, plots, 1.0);
    const tx = droneSpot.x, tz = droneSpot.z, ty = droneSpot.y;
    const helipad = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.16, 12), M('#343a40'));
    helipad.position.set(tx, ty + 0.08, tz); g.add(helipad);
    this.addObstacle(tx, tz, 2.8);

    const drones = [];
    const rotors = [];
    const droneOffsets = [[-1.1, -0.7], [1.1, -0.7], [-1.1, 0.9], [1.1, 0.9]];
    droneOffsets.forEach(([dx, dz], di) => {
      const drone = new THREE.Group();
      // Mini carrocería angular estilo Cybertruck
      const dBody = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.18, 0.9), M('#d8dee9'));
      dBody.position.y = 0.09; drone.add(dBody);
      const dRoof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.2, 4), M('#2e3440'));
      dRoof.rotation.y = Math.PI / 4; dRoof.position.set(0, 0.26, -0.05); drone.add(dRoof);
      // 4 rotores de dron
      [[-0.32, -0.38], [0.32, -0.38], [-0.32, 0.38], [0.32, 0.38]].forEach(([rx, rz]) => {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 0.04), M('#4c566a'));
        arm.position.set(rx * 0.65, 0.15, rz * 0.65); drone.add(arm);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.015, 0.05), M('#111111'));
        blade.position.set(rx, 0.18, rz); drone.add(blade);
        rotors.push(blade);
      });
      // Puntero láser azul mini
      const miniLaser = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.2, 5), M('#00f0ff', { emissive: '#00f0ff', emissiveIntensity: 2.2 }));
      miniLaser.rotation.x = Math.PI / 2; miniLaser.position.set(0, 0.08, 1.5); drone.add(miniLaser);

      drone.position.set(tx + dx, ty + 2.8 + (di % 2) * 0.4, tz + dz);
      g.add(drone);
      drones.push({ drone, baseX: tx + dx, baseY: ty + 2.8 + (di % 2) * 0.4, baseZ: tz + dz, phase: di * 1.4 });
    });
    this.dronesPos = new THREE.Vector3(tx, ty + 2.8, tz);
    this.#label('🛸 DRONES TESLA (NO ALCANZÓ EL PRESUPUESTO)', new THREE.Vector3(tx, ty + 4.4, tz), 'lbl lbl-building');

    this.animProps.push((t) => {
      fireGlow.scale.y = 0.85 + Math.sin(t * 11) * 0.2;
      rotors.forEach((b, idx) => { b.rotation.y = t * (idx % 2 ? 22 : -22); });
      drones.forEach((d) => {
        d.drone.position.y = d.baseY + Math.sin(t * 3 + d.phase) * 0.25;
        d.drone.rotation.y = Math.sin(t * 1.1 + d.phase) * 0.35;
      });
    });

    // 3. Bandera pirata con calavera en llamas y dos katanas cruzadas (@SantiagovideosépicosXDD-h3h)
    const flagPos = new THREE.Vector3(FLAG.x, this.height(FLAG.x, FLAG.z), FLAG.z);
    const skullFlag = new THREE.Group();
    const sMast = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 6.8, 8), M('#1b1b1e'));
    sMast.position.set(0, 3.4, 0); skullFlag.add(sMast);

    // Textura Canvas pintada de bandera pirata con calavera, katanas cruzadas y fuego
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 320;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#0d0d10'; ctx.fillRect(0, 0, 512, 320);
    // Borde de llamas en la bandera
    const grad = ctx.createLinearGradient(0, 320, 0, 40);
    grad.addColorStop(0, '#ff4500'); grad.addColorStop(0.5, '#ff8c00'); grad.addColorStop(1, 'rgba(255,215,0,0)');
    ctx.fillStyle = grad;
    for (let fx = 10; fx < 512; fx += 28) {
      ctx.beginPath(); ctx.moveTo(fx - 18, 320); ctx.lineTo(fx, 180 + (fx % 3) * 25); ctx.lineTo(fx + 18, 320); ctx.fill();
    }
    // Dos katanas cruzadas detrás de la calavera
    ctx.save(); ctx.translate(256, 145);
    [-0.65, 0.65].forEach((ang) => {
      ctx.save(); ctx.rotate(ang);
      ctx.fillStyle = '#e2e8f0'; ctx.fillRect(-135, -6, 270, 12); // hoja
      ctx.fillStyle = '#ffd166'; ctx.fillRect(-75, -18, 12, 36);   // tsuba (guarda)
      ctx.fillStyle = '#9b2226'; ctx.fillRect(-130, -8, 55, 16);   // empuñadura
      ctx.restore();
    });
    ctx.restore();
    // Llamas envolviendo la calavera
    ctx.fillStyle = '#ff5400';
    ctx.beginPath(); ctx.arc(256, 130, 74, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb703';
    ctx.beginPath(); ctx.arc(256, 135, 62, 0, Math.PI * 2); ctx.fill();
    // Calavera pirata blanca
    ctx.fillStyle = '#f8f9fa';
    ctx.beginPath(); ctx.arc(256, 132, 46, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(230, 162, 52, 26);
    ctx.fillStyle = '#0d0d10';
    ctx.beginPath(); ctx.arc(238, 132, 11, 0, Math.PI * 2); ctx.arc(274, 132, 11, 0, Math.PI * 2); ctx.fill(); // ojos
    ctx.beginPath(); ctx.moveTo(256, 146); ctx.lineTo(249, 158); ctx.lineTo(263, 158); ctx.fill(); // nariz
    for (let tx2 = 236; tx2 <= 272; tx2 += 12) ctx.fillRect(tx2, 170, 4, 16); // dientes
    // Texto inferior
    ctx.fillStyle = '#ffd166'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('SOMOS LOS MEJORES', 256, 292);

    const pirateTex = new THREE.CanvasTexture(cv);
    const pirateMat = new THREE.MeshStandardMaterial({ map: pirateTex, side: THREE.DoubleSide, roughness: 0.7 });
    const sCloth = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.0, 10, 4), pirateMat);
    sCloth.position.set(1.65, 5.6, 0); skullFlag.add(sCloth);

    // Lenguas de fuego animadas sobre la bandera
    const flagFlames = [];
    for (let fi = 0; fi < 5; fi++) {
      const fl = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.65, 5), M(fi % 2 ? '#ff4800' : '#ffb703', { emissive: '#ff4800', emissiveIntensity: 2.2 }));
      fl.position.set(0.4 + fi * 0.6, 6.65, 0); skullFlag.add(fl);
      flagFlames.push(fl);
    }

    this.animProps.push((t) => {
      flagFlames.forEach((fl, fi) => {
        fl.scale.y = 0.8 + Math.sin(t * 10 + fi * 1.3) * 0.35;
        fl.position.y = 6.6 + Math.sin(t * 8 + fi) * 0.08;
      });
    });

    skullFlag.position.copy(flagPos);
    g.add(skullFlag);
    this.skullFlagPos = flagPos.clone();
    this.#label('🏴‍☠️🔥 ¡SOMOS LOS MEJORES!', new THREE.Vector3(flagPos.x + 1.6, flagPos.y + 7.2, flagPos.z), 'lbl lbl-building');

    // 4. Portaaviones / Barco con Helicópteros y Aviones (@tortia_desde_cero)
    const cAng = -Math.PI * 0.64;
    const cRad = this.R + 11.5;
    const cx = Math.cos(cAng) * cRad;
    const cz = Math.sin(cAng) * cRad;
    const carrier = new THREE.Group();
    const hullC = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.4, 13.5), M('#334155'));
    hullC.position.y = 0.4; carrier.add(hullC);
    const deckC = new THREE.Mesh(new THREE.BoxGeometry(5.1, 0.28, 14.4), M('#475569'));
    deckC.position.y = 1.2; carrier.add(deckC);
    // Líneas amarillas de pista
    for (let li = -5; li <= 5; li += 2.0) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 1.1), M('#facc15'));
      dash.position.set(-0.5, 1.36, li); carrier.add(dash);
    }
    // Torre de control naval
    const islandT = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.2, 2.8), M('#64748b'));
    islandT.position.set(1.75, 2.4, -0.8); carrier.add(islandT);
    const radarTop = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.16, 0.24), M('#e2e8f0'));
    radarTop.position.set(1.75, 3.7, -0.8); carrier.add(radarTop);
    // 2 Helicópteros en cubierta con rotores giratorios
    const heliRotors = [];
    for (const hz of [-3.6, 0.8]) {
      const heli = new THREE.Group();
      const hBody = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.62, 1.65), M('#1e293b'));
      hBody.position.y = 0.45; heli.add(hBody);
      const hTail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 1.15), M('#334155'));
      hTail.position.set(0, 0.52, -1.2); heli.add(hTail);
      const rotor = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.04, 0.14), M('#facc15'));
      rotor.position.set(0, 0.86, 0); heli.add(rotor);
      heliRotors.push(rotor);
      heli.position.set(-0.55, 1.35, hz);
      carrier.add(heli);
    }
    // 2 Aviones caza en cubierta
    for (const jz of [3.8, 5.6]) {
      const jet = new THREE.Group();
      const jFuse = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.9, 6), M('#cbd5e1'));
      jFuse.rotation.x = Math.PI / 2; jFuse.position.y = 0.28; jet.add(jFuse);
      const jWing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.65), M('#94a3b8'));
      jWing.position.set(0, 0.28, -0.15); jet.add(jWing);
      jet.position.set(-0.65, 1.36, jz);
      carrier.add(jet);
    }
    carrier.position.set(cx, 0.05, cz);
    carrier.rotation.y = Math.PI * 0.25;
    carrier.traverse((o) => { o.castShadow = !MOVIL; o.receiveShadow = true; });
    g.add(carrier);
    this.carrierPos = new THREE.Vector3(cx, 1.4, cz);
    this.#label('🚢 PORTAAVIONES DE @tortia_desde_cero', new THREE.Vector3(cx, 5.2, cz), 'lbl lbl-building');
    this.animProps.push((t) => {
      carrier.position.y = 0.05 + Math.sin(t * 1.4) * 0.12;
      carrier.rotation.z = Math.sin(t * 1.1) * 0.02;
      radarTop.rotation.y = t * 2.4;
      heliRotors.forEach((r, idx) => { r.rotation.y = t * (idx % 2 ? 18 : -18); });
    });

    // 7. Rascacielos Naranja Low-Poly Vivo con 22 Ojos Enojados (@lauraalejandragonzalez3924) — diseño exacto de referencia
    const angrySpot = this.#findClearSpot([[14.0, -14.0], [18.0, 12.0], [-14.0, 18.0]], 3.2, plots, 1.0);
    const angryB = new THREE.Group();
    const mOrange = M('#f97316'), mOrangeDark = M('#ea580c'), mBrick = M('#c2410c'), mTrim = M('#ffedd5');
    // Base planta baja + torre naranja de varios pisos con cornisas arquitectónicas
    const abBase = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.35, 2.7), mBrick);
    abBase.position.y = 0.675; angryB.add(abBase);
    const abTower = new THREE.Mesh(new THREE.BoxGeometry(3.1, 6.2, 2.5), mOrange);
    abTower.position.y = 4.45; angryB.add(abTower);
    // Cornisas horizontales entre pisos y remate de azotea
    for (const ly of [1.35, 2.55, 5.85, 7.55]) {
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(3.36, 0.18, 2.74), ly === 7.55 ? mBrick : mOrangeDark);
      ledge.position.y = ly; angryB.add(ledge);
    }
    // Puerta y ventanas de planta baja + toldo a rayas + aire acondicionado
    const abDoor = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.95, 0.12), M('#431407'));
    abDoor.position.set(0, 0.48, 1.36); angryB.add(abDoor);
    [-0.95, 0.95].forEach((wx) => {
      const wFrame = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.62, 0.1), mTrim);
      wFrame.position.set(wx, 0.72, 1.35); angryB.add(wFrame);
      const wGlass = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.50, 0.12), M('#38bdf8', { roughness: 0.25 }));
      wGlass.position.set(wx, 0.72, 1.36); angryB.add(wGlass);
    });
    // Balcones del 2º piso con barandillas y macetas verdes low-poly
    [-0.95, 0.95].forEach((bxOff) => {
      const balc = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.12, 0.48), mOrangeDark);
      balc.position.set(bxOff, 1.48, 1.46); angryB.add(balc);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.34, 0.06), M('#1e293b'));
      rail.position.set(bxOff, 1.71, 1.66); angryB.add(rail);
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.08, 0.16, 6), M('#b45309'));
      pot.position.set(bxOff + 0.18, 1.62, 1.54); angryB.add(pot);
      const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), M('#22c55e'));
      plant.position.set(bxOff + 0.18, 1.78, 1.54); angryB.add(plant);
    });
    // Unidad de aire acondicionado lateral + toldo rojo/blanco
    const acBox = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.42, 0.52), M('#e2e8f0'));
    acBox.position.set(-1.62, 2.05, 0.65); angryB.add(acBox);
    const awning = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 1.15), M('#ef4444'));
    awning.position.set(1.68, 1.32, 0.45); awning.rotation.z = -0.35; angryB.add(awning);
    // Antenas y parabólica low-poly en la azotea
    const roofBox = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.95), mOrangeDark);
    roofBox.position.set(-0.55, 7.88, -0.2); angryB.add(roofBox);
    const dishMast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.95, 6), M('#64748b'));
    dishMast.position.set(0.75, 8.05, 0.2); angryB.add(dishMast);
    const dishCone = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.22, 7), M('#cbd5e1'));
    dishCone.rotation.x = Math.PI * 0.35; dishCone.position.set(0.75, 8.45, 0.32); angryB.add(dishCone);

    // 22 Ojos 3D Expresivos Enojados (esclerótica blanca, iris azul/verde/miel, pupila negra y cejas gruesas fruncidas)
    const irisMats = [M('#0284c7'), M('#16a34a'), M('#b45309')];
    const scleraMat = M('#ffffff'), pupilMat = M('#0f172a'), browMat = M('#3b1d0e');
    const eyeRows = [
      { y: 6.85, xs: [-1.08, -0.36, 0.36, 1.08] },
      { y: 5.95, xs: [-1.16, -0.58, 0.0, 0.58, 1.16] },
      { y: 5.02, xs: [-1.08, -0.36, 0.36, 1.08] },
      { y: 4.10, xs: [-1.16, -0.58, 0.0, 0.58, 1.16] },
      { y: 3.18, xs: [-1.08, -0.36, 0.36, 1.08] },
    ]; // 4 + 5 + 4 + 5 + 4 = 22 ojos exactos
    let eyeIdx = 0;
    for (const rInfo of eyeRows) {
      for (const ex of rInfo.xs) {
        const ey = rInfo.y;
        const eGroup = new THREE.Group();
        eGroup.position.set(ex, ey, 1.26);
        const sclera = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), scleraMat);
        sclera.scale.set(1.05, 0.92, 0.55); eGroup.add(sclera);
        const iris = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.06, 7), irisMats[eyeIdx % irisMats.length]);
        iris.rotation.x = Math.PI * 0.5; iris.position.set(0, -0.01, 0.10); eGroup.add(iris);
        const pupil = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.07, 6), pupilMat);
        pupil.rotation.x = Math.PI * 0.5; pupil.position.set(0, -0.01, 0.115); eGroup.add(pupil);
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.16), browMat);
        const tilt = ex < -0.05 ? -0.28 : (ex > 0.05 ? 0.28 : (eyeIdx % 2 === 0 ? -0.22 : 0.22));
        brow.position.set(0, 0.16, 0.08); brow.rotation.z = tilt; eGroup.add(brow);
        angryB.add(eGroup);
        eyeIdx++;
      }
    }
    // Brazos laterales y espada de fuego para mantener la acción épica del edificio
    const abArmL = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.1, 0.32), mOrangeDark);
    abArmL.position.set(-1.78, 3.8, 0.2); abArmL.rotation.z = 0.38; angryB.add(abArmL);
    const abArmR = new THREE.Group();
    abArmR.position.set(1.78, 4.0, 0.2);
    const abArmRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.1, 0.32), mOrangeDark);
    abArmRMesh.position.y = -0.75; abArmR.add(abArmRMesh);
    const fireSword = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 0.38), M('#f97316', { emissive: '#ef4444', emissiveIntensity: 2.2 }));
    fireSword.position.set(0, -1.7, 0.95); fireSword.rotation.x = Math.PI / 2; abArmR.add(fireSword);
    angryB.add(abArmR);

    angryB.position.set(angrySpot.x, angrySpot.y, angrySpot.z);
    angryB.traverse((o) => { o.castShadow = !this.gamaBaja; o.receiveShadow = !this.gamaBaja; });
    g.add(angryB);
    this.angryBuildingPos = new THREE.Vector3(angrySpot.x, angrySpot.y, angrySpot.z);
    this.addObstacle(angrySpot.x, angrySpot.z, 2.5);
    this.#label('😡🏢 EDIFICIO 22 OJOS (@lauraalejandragonzalez3924)', new THREE.Vector3(angrySpot.x, angrySpot.y + 8.6, angrySpot.z), 'lbl lbl-building');

    // 8. Duelo callejero frente al edificio naranja: Filósofo Griego (@SantiagovideosépicosXDD-h3h) discutiendo con Soldado AK-47 (@OlgaLuisaCaamaño)
    const duelZ = angrySpot.z + 3.4;
    const greekSpot = { x: angrySpot.x - 1.15, z: duelZ, y: Math.max(0.2, this.height(angrySpot.x - 1.15, duelZ)) };
    const solSpot = { x: angrySpot.x + 1.15, z: duelZ, y: Math.max(0.2, this.height(angrySpot.x + 1.15, duelZ)) };

    // Filósofo Griego Low-Poly con toga blanca y borde dorado, corona de laurel, barba esculpida y gesto de discusión
    const greek = new THREE.Group();
    [-0.14, 0.14].forEach((lx) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.42, 0.22), M('#78350f'));
      leg.position.set(lx, 0.21, 0); greek.add(leg);
    });
    const gToga = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 1.12, 7), M('#f8fafc'));
    gToga.position.y = 0.72; greek.add(gToga);
    const gGoldHem = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.43, 0.12, 7), M('#f59e0b'));
    gGoldHem.position.y = 0.24; greek.add(gGoldHem);
    const gSash = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.48), M('#f59e0b'));
    gSash.position.set(0, 0.98, 0); gSash.rotation.z = 0.35; greek.add(gSash);
    const gHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 1), M('#eab688'));
    gHead.position.y = 1.48; greek.add(gHead);
    // Barba blanca/gris low-poly esculpida + boca abierta gritando + ojos y cejas fruncidas
    const gBeard = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.42, 6), M('#e2e8f0'));
    gBeard.rotation.x = Math.PI; gBeard.position.set(0, 1.26, 0.14); greek.add(gBeard);
    const gHair = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), M('#cbd5e1'));
    gHair.position.set(0, 1.54, -0.05); greek.add(gHair);
    const gWreath = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.045, 5, 10), M('#16a34a'));
    gWreath.rotation.x = Math.PI * 0.45; gWreath.position.set(0, 1.62, 0.02); greek.add(gWreath);
    const gMouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.06), M('#450a0a'));
    gMouth.position.set(0, 1.38, 0.24); greek.add(gMouth);
    [-0.09, 0.09].forEach((ex) => {
      const eyeW = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.03), scleraMat);
      eyeW.position.set(ex, 1.50, 0.23); greek.add(eyeW);
      const eyeP = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.04), pupilMat);
      eyeP.position.set(ex, 1.50, 0.24); greek.add(eyeP);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.04), M('#64748b'));
      brow.position.set(ex, 1.56, 0.24); brow.rotation.z = ex < 0 ? -0.25 : 0.25; greek.add(brow);
    });
    const gArmR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.52, 0.15), M('#eab688'));
    gArmR.position.set(0.36, 1.12, 0.18); gArmR.rotation.x = -1.05; gArmR.rotation.z = -0.25; greek.add(gArmR);
    const gArmL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.48, 0.16), M('#f8fafc'));
    gArmL.position.set(-0.36, 1.02, 0.08); gArmL.rotation.x = -0.55; greek.add(gArmL);
    greek.scale.setScalar(1.38);
    greek.position.set(greekSpot.x, greekSpot.y, greekSpot.z);
    greek.rotation.y = Math.PI * 0.42; // mirando cara a cara al soldado
    g.add(greek);
    this.greekPos = new THREE.Vector3(greekSpot.x, greekSpot.y, greekSpot.z);
    this.#label('🏛️ GRIEGO FILOSÓFICO (@SantiagovideosépicosXDD-h3h)', new THREE.Vector3(greekSpot.x, greekSpot.y + 2.8, greekSpot.z), 'lbl lbl-building');

    // Soldado Low-Poly con armadura verde oliva, casco con cresta, fusil AK-47 y brazos gesticulando en la discusión
    const sol = new THREE.Group();
    [-0.14, 0.14].forEach((lx) => {
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.52, 0.22), M('#3f2305'));
      boot.position.set(lx, 0.26, 0); sol.add(boot);
    });
    const sBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.78, 7), M('#4d7c0f'));
    sBody.position.y = 0.86; sol.add(sBody);
    const sVest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.50, 0.44), M('#365314'));
    sVest.position.y = 0.94; sol.add(sVest);
    const sBelt = new THREE.Mesh(new THREE.BoxGeometry(0.60, 0.10, 0.46), M('#451a03'));
    sBelt.position.y = 0.66; sol.add(sBelt);
    const sHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 1), M('#eab688'));
    sHead.position.y = 1.48; sol.add(sHead);
    const sMouth = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.06), M('#450a0a'));
    sMouth.position.set(0, 1.38, 0.23); sol.add(sMouth);
    [-0.085, 0.085].forEach((ex) => {
      const eyeW = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 0.03), scleraMat);
      eyeW.position.set(ex, 1.49, 0.22); sol.add(eyeW);
      const eyeP = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.04), pupilMat);
      eyeP.position.set(ex, 1.49, 0.23); sol.add(eyeP);
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 0.04), browMat);
      brow.position.set(ex, 1.55, 0.23); brow.rotation.z = ex < 0 ? -0.25 : 0.25; sol.add(brow);
    });
    const sHelmet = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), M('#3f6212'));
    sHelmet.scale.set(1.05, 0.72, 1.08); sHelmet.position.set(0, 1.62, -0.02); sol.add(sHelmet);
    const sCrest = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.18, 0.42), M('#b91c1c'));
    sCrest.position.set(0, 1.80, -0.02); sol.add(sCrest);
    const sArmL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.48, 0.15), M('#4d7c0f'));
    sArmL.position.set(-0.36, 1.08, 0.16); sArmL.rotation.x = -0.95; sArmL.rotation.z = 0.25; sol.add(sArmL);
    const sArmR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.48, 0.15), M('#4d7c0f'));
    sArmR.position.set(0.36, 1.05, 0.14); sArmR.rotation.x = -0.75; sol.add(sArmR);
    // AK-47 de hierro detallada
    const akRec = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.72), M('#475569', { metalness: 0.7 })); akRec.position.set(0.30, 0.96, 0.22); akRec.rotation.x = -0.35; sol.add(akRec);
    const akBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 6), M('#334155', { metalness: 0.8 })); akBarrel.rotation.x = Math.PI / 2 - 0.35; akBarrel.position.set(0.30, 1.12, 0.68); sol.add(akBarrel);
    const akStock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.35), M('#78350f')); akStock.position.set(0.30, 0.82, -0.18); akStock.rotation.x = -0.35; sol.add(akStock);
    const akMag = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.12), M('#1e293b')); akMag.position.set(0.30, 0.80, 0.32); akMag.rotation.x = 0.15; sol.add(akMag);
    sol.scale.setScalar(1.38);
    sol.position.set(solSpot.x, solSpot.y, solSpot.z);
    sol.rotation.y = -Math.PI * 0.42; // mirando cara a cara al filósofo griego
    g.add(sol);
    this.soldierPos = new THREE.Vector3(solSpot.x, solSpot.y, solSpot.z);
    this.#label('🪖 SOLDADO AK-47 (@OlgaLuisaCaamaño)', new THREE.Vector3(solSpot.x, solSpot.y + 2.8, solSpot.z), 'lbl lbl-building');

    this.animProps.push((t) => {
      abArmR.rotation.x = -0.3 + Math.sin(t * 4.5) * 0.45;
      abArmL.rotation.x = Math.cos(t * 4.5) * 0.35;
      gArmR.rotation.x = -1.05 + Math.sin(t * 6.0) * 0.28;
      sArmL.rotation.x = -0.95 + Math.cos(t * 6.0) * 0.28;
    });


    // ---- Pedidos del 15/11 (comentarios de YouTube) ----
    // 9. Dragón del tamaño del edificio, 90 cuernos y 2 ojos (@rogerrojas991): se enfrenta al rascacielos de 22 ojos
    {
    const dsp = this.#findClearSpot([[angrySpot.x + 9, angrySpot.z + 2], [angrySpot.x - 9, angrySpot.z], [-14, 18], [16, 16]], 3.4, plots, 1.0);
    const dragon = new THREE.Group();
    const esc = M('#15803d', { roughness: 0.6 }); const panza = M('#bef264'); const cuerno = M('#fef3c7');
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.6, 3.6), esc); cuerpo.position.y = 2.6; dragon.add(cuerpo);
    const vientre = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 0.1), panza); vientre.position.set(0, 2.4, 1.82); dragon.add(vientre);
    const cuello = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.4, 1.2), esc); cuello.position.set(0, 4.6, 1.2); cuello.rotation.x = 0.35; dragon.add(cuello);
    const cabeza = new THREE.Group(); cabeza.position.set(0, 6.0, 1.9); dragon.add(cabeza);
    const craneo = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 2.0), esc); cabeza.add(craneo);
    const hocico = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 1.0), esc); hocico.position.set(0, -0.25, 1.35); cabeza.add(hocico);
    [-0.45, 0.45].forEach((ox) => { const ojo = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.1), M('#fde047', { emissive: '#facc15', emissiveIntensity: 1.6 })); ojo.position.set(ox, 0.25, 1.02); cabeza.add(ojo);
      const pupila = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.26, 0.05), M('#111827')); pupila.position.set(ox, 0.25, 1.08); cabeza.add(pupila); });
    // 90 cuernos contados: 30 en la cabeza, 60 por el lomo y la cola
    const cg = new THREE.ConeGeometry(0.09, 0.42, 4);
    for (let i = 0; i < 30; i++) { const c = new THREE.Mesh(cg, cuerno); const a = (i / 30) * Math.PI * 2;
      c.position.set(Math.cos(a) * 0.78, 0.55 + Math.sin(a * 3) * 0.15, Math.sin(a) * 0.9); c.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); cabeza.add(c); }
    for (let i = 0; i < 60; i++) { const c = new THREE.Mesh(cg, cuerno); const fila = i % 3, k = Math.floor(i / 3) / 19;
      c.position.set((fila - 1) * 0.45, 3.95 - k * 1.6, 1.6 - k * 5.4); c.rotation.z = (fila - 1) * 0.5; dragon.add(c); }
    const cola = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3.2, 6), esc); cola.rotation.x = -Math.PI / 2 - 0.35; cola.position.set(0, 1.6, -3.3); dragon.add(cola);
    const alas = [];
    [-1, 1].forEach((sx) => { const ala = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.08, 1.8), M('#166534')); ala.geometry.translate(sx * 1.5, 0, 0); ala.position.set(sx * 1.0, 3.6, -0.2); dragon.add(ala); alas.push(ala); });
    [-0.7, 0.7].forEach((lx) => [1.0, -1.1].forEach((lz) => { const pata = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.7), esc); pata.position.set(lx, 0.7, lz); dragon.add(pata); }));
    dragon.position.set(dsp.x, dsp.y, dsp.z);
    dragon.lookAt(angrySpot.x, dsp.y, angrySpot.z);
    g.add(dragon);
    this.animProps.push((t) => { alas[0].rotation.z = 0.25 + Math.sin(t * 1.4) * 0.25; alas[1].rotation.z = -0.25 - Math.sin(t * 1.4) * 0.25; cabeza.rotation.y = Math.sin(t * 0.5) * 0.25; cabeza.rotation.x = Math.sin(t * 0.8) * 0.06; });
    this.addObstacle(dsp.x, dsp.z, 3.2);
    this.dragonPos = new THREE.Vector3(dsp.x, dsp.y, dsp.z);
    this.#label('🐉 DRAGÓN DE 90 CUERNOS (@rogerrojas991)', new THREE.Vector3(dsp.x, dsp.y + 8.2, dsp.z), 'lbl lbl-building');
    }

    // 10. Metro elevado por el borde de la isla (@SantiagoEspejo-w8y): rodea Oriente siguiendo la costa, por dentro de la muralla
    {
    const base = this.costaBase, N = base.length; const hM = this.costaAltoMax + 2.6;
    const curva = new THREE.CatmullRomCurve3(base.map(([x, z]) => new THREE.Vector3(x, hM, z)), true);
    const via = new THREE.Mesh(new THREE.TubeGeometry(curva, 240, 0.16, 4, true), M('#64748b')); g.add(via);
    base.forEach(([x, z, h], i) => { if (i % 5) return; const alto = hM - h + 0.2; [-0.95, 0.95].forEach((lado) => { const pilar = new THREE.Mesh(new THREE.BoxGeometry(0.2, alto, 0.2), M('#94a3b8')); pilar.position.set(x * (1 + lado * 0.012), h - 0.2 + alto / 2, z * (1 + lado * 0.012)); g.add(pilar); }); });
    const vagones = [];
    for (let i = 0; i < 4; i++) { const v = new THREE.Group();
      const caja = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 1.9), M(i === 0 ? '#dc2626' : '#f8fafc')); caja.position.y = 0.45; v.add(caja);
      const ventana = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.25, 1.5), M('#38bdf8', { emissive: '#7dd3fc', emissiveIntensity: 0.5 })); ventana.position.y = 0.58; v.add(ventana);
      g.add(v); vagones.push(v); }
    this.metroTren = vagones[0];
    const largo = curva.getLength();
    this.animProps.push((t) => { vagones.forEach((v, i) => { const u = (((t * 1.6 - i * 2.05) / largo) % 1 + 1) % 1; const p0 = curva.getPointAt(u); v.position.copy(p0); v.lookAt(curva.getPointAt((u + 0.002) % 1)); }); });
    this.metroPos = new THREE.Vector3(0, hM, 0);
    const pl = curva.getPointAt(0.08);
    this.#label('🚇 METRO DE ORIENTE (@SantiagoEspejo-w8y)', new THREE.Vector3(pl.x, hM + 1.6, pl.z), 'lbl lbl-building');
    }

    // 11. Máquina de hacer plata (@SantiagovideosépicosXDD-h3h, «así tenemos presupuesto»)
    {
    const ms = this.#findClearSpot([[24, -10], [20, 14], [-24, -8], [8, -26]], 1.8, plots, 1.0);
    const maq = new THREE.Group();
    const caja = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 1.2), M('#a3e635', { metalness: 0.3 })); caja.position.y = 1.0; maq.add(caja);
    const ranura = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.1), M('#111827')); ranura.position.set(0, 0.7, 0.62); maq.add(ranura);
    const pantalla = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.5, 0.06), M('#22c55e', { emissive: '#16a34a', emissiveIntensity: 1.2 })); pantalla.position.set(0, 1.5, 0.62); maq.add(pantalla);
    const chimenea = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 6), M('#475569')); chimenea.position.set(0.5, 2.35, 0); maq.add(chimenea);
    const billetes = [];
    for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.02, 0.16), M('#4ade80')); maq.add(b); billetes.push(b); }
    const monton = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 0.7), M('#4ade80')); monton.position.set(0, 0.12, 1.2); maq.add(monton);
    maq.position.set(ms.x, ms.y, ms.z);
    g.add(maq);
    this.animProps.push((t) => { billetes.forEach((b, i) => { const c = ((t * 0.6 + i / 8) % 1); b.position.set(Math.sin(i * 2.1) * 0.35 * c, 0.75 - c * 0.5, 0.65 + c * 0.6); b.rotation.y = c * 4 + i; }); pantalla.material.emissiveIntensity = 0.8 + Math.sin(t * 6) * 0.4; });
    this.addObstacle(ms.x, ms.z, 1.4);
    this.plataPos = new THREE.Vector3(ms.x, ms.y, ms.z);
    this.#label('💵 MÁQUINA DE HACER PLATA (@SantiagovideosépicosXDD-h3h)', new THREE.Vector3(ms.x, ms.y + 3.0, ms.z), 'lbl lbl-building');
    }

    // 12. Auto que brilla (@pabloaguirre3983) flotando con neón bajo el metro
    {
    const auto = new THREE.Group();
    const neon = M('#e879f9', { emissive: '#d946ef', emissiveIntensity: 1.5, metalness: 0.4 });
    const chasis = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 1.6), neon); chasis.position.y = 0.3; auto.add(chasis);
    const techo = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.8), M('#38bdf8', { emissive: '#0ea5e9', emissiveIntensity: 0.8 })); techo.position.set(0, 0.58, -0.1); auto.add(techo);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.78, 12), M('#22d3ee', { emissive: '#06b6d4', emissiveIntensity: 1.4, side: THREE.DoubleSide }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.08; auto.add(halo);
    [[-0.42, 0.5], [0.42, 0.5], [-0.42, -0.5], [0.42, -0.5]].forEach(([wx, wz]) => { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 8), M('#111827')); r.rotation.z = Math.PI / 2; r.position.set(wx, 0.16, wz); auto.add(r); });
    g.add(auto);
    this.autoBrilla = auto;
    const costa = this.costaCurva, largoC = costa ? costa.getLength() : 1;
    this.animProps.push((t) => { if (!costa) return; const u = ((-t * 2.4 / largoC) % 1 + 1) % 1; const p0 = costa.getPointAt(u), p1 = costa.getPointAt(((u - 0.003) % 1 + 1) % 1);
      const lado = new THREE.Vector3(p1.z - p0.z, 0, p0.x - p1.x).normalize().multiplyScalar(0.42);
      auto.position.set(p0.x + lado.x, Math.max(this.height(p0.x, p0.z), p0.y) + 0.22 + Math.sin(t * 4) * 0.06, p0.z + lado.z); auto.lookAt(p1.x + lado.x, auto.position.y, p1.z + lado.z); neon.emissiveIntensity = 1.2 + Math.sin(t * 5) * 0.5; });
    }

    // 13. León salvaje de @julioricardoaguirre3449 («hiper fuerte, mansión y un león de mascota»)
    {
    const iJ = state ? state.residents.findIndex((r) => r.handle === 'julioricardoaguirre3449') : -1;
    const pJ = iJ >= 0 ? plots[iJ] : null;
    if (pJ) {
      const leon = new THREE.Group(); const pel = M('#d97706'); const mel = M('#78350f');
      const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.38, 0.9), pel); cuerpo.position.y = 0.42; leon.add(cuerpo);
      const melena = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.6, 0.3), mel); melena.position.set(0, 0.62, 0.48); leon.add(melena);
      const cara = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.2), pel); cara.position.set(0, 0.6, 0.66); leon.add(cara);
      [-0.15, 0.15].forEach((lx) => [0.3, -0.3].forEach((lz) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), pel); p.position.set(lx, 0.12, lz); leon.add(p); }));
      const lx = pJ.x + (pJ.face || 1) * 1.5, lz = pJ.z + 1.0;
      leon.position.set(lx, this.groundAt(lx, lz), lz);
      g.add(leon);
      this.animProps.push((t) => { leon.rotation.y = Math.sin(t * 0.35) * 1.1; });
      this.leonPos = leon.position.clone();
      this.#label('🦁 LEÓN (@julioricardoaguirre3449)', new THREE.Vector3(lx, leon.position.y + 1.8, lz), 'lbl lbl-building');
    }
    }

    // 14. Tornado de fuego (@nessilarps) girando en las afueras de Oriente
    {
    const ts = this.#findClearSpot([[-22, 18], [22, -20], [-20, -22], [18, 22]], 2.6, plots, 1.0);
    const torn = new THREE.Group();
    const anillos = [];
    for (let i = 0; i < 8; i++) {
      const k = i / 7;
      const r = 0.28 + k * 1.45;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.14 + k * 0.06, 5, 10),
        M(i % 2 === 0 ? '#f97316' : '#ef4444', { emissive: i % 2 === 0 ? '#ea580c' : '#dc2626', emissiveIntensity: 1.3 })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.4 + k * 5.2;
      torn.add(ring);
      anillos.push(ring);
    }
    const core = new THREE.Mesh(new THREE.ConeGeometry(0.95, 5.6, 8), M('#facc15', { emissive: '#f59e0b', emissiveIntensity: 0.9, transparent: true, opacity: 0.7 }));
    core.rotation.x = Math.PI; core.position.y = 3.0; torn.add(core);
    torn.position.set(ts.x, ts.y, ts.z);
    g.add(torn);
    this.animProps.push((t) => { anillos.forEach((r, i) => { r.rotation.z = t * (3.2 - i * 0.18); r.position.x = Math.sin(t * 2 + i * 0.8) * 0.22; }); core.rotation.y = -t * 2.5; });
    this.addObstacle(ts.x, ts.z, 2.2);
    this.tornadoPos = new THREE.Vector3(ts.x, ts.y, ts.z);
    this.#label('🌪️🔥 TORNADO DE FUEGO (@nessilarps)', new THREE.Vector3(ts.x, ts.y + 6.4, ts.z), 'lbl lbl-building');
    }

    // 15. Búnker grande de emergencia (@team_editorespro)
    {
    const bs = this.#findClearSpot([[22, 18], [-24, -10], [18, 22], [-18, -22]], 2.8, plots, 1.0);
    const bunker = new THREE.Group();
    const hormigon = M('#64748b', { roughness: 0.9 }); const acero = M('#1e293b', { metalness: 0.5, roughness: 0.4 });
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.5, 3.2), hormigon); cuerpo.position.y = 0.75; bunker.add(cuerpo);
    const domo = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.5, 2.4), M('#475569')); domo.position.y = 1.7; bunker.add(domo);
    const compuerta = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.15), acero); compuerta.position.set(0, 0.55, 1.62); bunker.add(compuerta);
    const luz = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), M('#ef4444', { emissive: '#dc2626', emissiveIntensity: 1.5 })); luz.position.set(0, 1.35, 1.65); bunker.add(luz);
    bunker.position.set(bs.x, bs.y, bs.z);
    g.add(bunker);
    this.animProps.push((t) => { luz.visible = Math.sin(t * 4) > 0; });
    this.addObstacle(bs.x, bs.z, 2.8);
    this.bunkerPos = new THREE.Vector3(bs.x, bs.y, bs.z);
    this.#label('🛡️ BÚNKER DE EMERGENCIA (@team_editorespro)', new THREE.Vector3(bs.x, bs.y + 2.6, bs.z), 'lbl lbl-building');
    }

    // 16. Chancla humanoide rápida (@SantiagovideosépicosXDD-h3h)
    {
    const cs = this.#findClearSpot([[-14, -18], [16, -8], [-18, 12]], 1.4, plots, 1.0);
    const chancla = new THREE.Group();
    const suela = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 1.15), M('#2563eb')); suela.position.y = 0.62; chancla.add(suela);
    const tira = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 5, 8, Math.PI), M('#facc15')); tira.rotation.y = Math.PI / 2; tira.position.set(0, 0.72, 0.18); chancla.add(tira);
    [-0.14, 0.14].forEach((ox) => {
      const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.07, 5, 4), M('#ffffff')); ojo.position.set(ox, 0.78, 0.42); chancla.add(ojo);
      const pup = new THREE.Mesh(new THREE.SphereGeometry(0.035, 4, 4), M('#0f172a')); pup.position.set(ox, 0.78, 0.48); chancla.add(pup);
    });
    const pies = [-0.15, 0.15].map((px) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.48, 0.16), M('#1e293b')); p.position.set(px, 0.25, 0); chancla.add(p); return p; });
    g.add(chancla);
    this.animProps.push((t) => {
      const a = t * 1.4;
      const cx = cs.x + Math.cos(a) * 3.2, cz = cs.z + Math.sin(a) * 3.2;
      chancla.position.set(cx, this.groundAt(cx, cz), cz);
      chancla.rotation.y = -a;
      pies[0].rotation.x = Math.sin(t * 10) * 0.55;
      pies[1].rotation.x = -Math.sin(t * 10) * 0.55;
    });
    this.chanclaPos = new THREE.Vector3(cs.x, cs.y, cs.z);
    this.#label('🩴 CHANCLA RÁPIDA (@SantiagovideosépicosXDD-h3h)', new THREE.Vector3(cs.x, cs.y + 1.8, cs.z), 'lbl lbl-building');
    }

    // 17. Robot AMP de guardia que patrulla la costa protegiendo la isla (pedido por @AugustoMAguirre)
    {
    const rs = this.#findClearSpot([[30, 4], [28, -10], [32, 14], [-30, 6]], 2.4, plots, 1.0);
    const amp = new THREE.Group();
    const casco = M('#57534e', { metalness: 0.45, roughness: 0.5 }); const oscuro = M('#1c1917', { metalness: 0.5, roughness: 0.4 });
    const cabina = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.1, 1.1), casco); cabina.position.y = 2.9; amp.add(cabina);
    const vidrio = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.55, 0.06), M('#7dd3fc', { emissive: '#0ea5e9', emissiveIntensity: 0.5, transparent: true, opacity: 0.8 })); vidrio.position.set(0, 3.05, 0.57); amp.add(vidrio);
    const cadera = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.35, 0.7), oscuro); cadera.position.y = 2.2; amp.add(cadera);
    const piernas = [-0.4, 0.4].map((lx) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.9, 0.45), casco); p.geometry.translate(0, -0.95, 0); p.position.set(lx, 2.15, 0); amp.add(p); return p; });
    const brazos = [-0.85, 0.85].map((lx) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.2, 0.32), oscuro); b.geometry.translate(0, -0.5, 0); b.position.set(lx, 3.2, 0.1); amp.add(b); return b; });
    const cuchillo = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.24), M('#d4d4d8', { metalness: 0.8, roughness: 0.2 })); cuchillo.position.set(0, -1.2, 0.15); brazos[1].add(cuchillo);
    amp.position.set(rs.x, rs.y, rs.z);
    g.add(amp);
    this.animProps.push((t) => {
      amp.rotation.y = Math.sin(t * 0.3) * 1.2;                 // vigila la costa de lado a lado
      piernas[0].rotation.x = Math.sin(t * 1.6) * 0.18; piernas[1].rotation.x = -Math.sin(t * 1.6) * 0.18;
      brazos[1].rotation.x = -0.4 + Math.sin(t * 0.8) * 0.15;
    });
    this.addObstacle(rs.x, rs.z, 1.6);
    this.ampPos = new THREE.Vector3(rs.x, rs.y, rs.z);
    this.#label('🤖 ROBOT AMP DE GUARDIA (@AugustoMAguirre)', new THREE.Vector3(rs.x, rs.y + 4.4, rs.z), 'lbl lbl-building');
    }

    // 18. Tanque Panzer IV de la defensa de Oriente (pedido por @MirianPolanco-cv1zb)
    {
    const ps = this.#findClearSpot([[-26, 14], [-22, -16], [-30, 0], [24, -18]], 2.2, plots, 1.0);
    const tq = new THREE.Group();
    const gris = M('#4b5320', { roughness: 0.7 }); const oruga = M('#27272a');
    const chasis = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.8), gris); chasis.position.y = 0.55; tq.add(chasis);
    [-0.85, 0.85].forEach((ox) => { const o = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 3.0), oruga); o.position.set(ox, 0.3, 0); tq.add(o); });
    const torreta = new THREE.Group();
    const cupula = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 1.2), gris); torreta.add(cupula);
    const canon = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.8, 6), oruga); canon.rotation.x = Math.PI / 2; canon.position.set(0, 0.05, 1.4); torreta.add(canon);
    const cruz = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.28, 0.28), M('#f8fafc')); cruz.position.set(0.56, 0, 0); torreta.add(cruz);
    torreta.position.y = 1.08; tq.add(torreta);
    tq.position.set(ps.x, ps.y, ps.z);
    g.add(tq);
    this.animProps.push((t) => { torreta.rotation.y = Math.sin(t * 0.4) * 0.9; });
    this.addObstacle(ps.x, ps.z, 1.9);
    this.panzerPos = new THREE.Vector3(ps.x, ps.y, ps.z);
    this.#label('🪖 TANQUE PANZER IV (@MirianPolanco-cv1zb)', new THREE.Vector3(ps.x, ps.y + 2.2, ps.z), 'lbl lbl-building');
    }

    this.root.add(g);
  }

  // ---------- Características exclusivas de Isla Instagram (Vaeloria - 104 Habitantes) ----------
  // ---------- Pedidos de la comunidad de TikTok (Theraisla) ----------
  #tiktokFeatures(state, plots = []) {
    const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...extra });
    const g = new THREE.Group();
    const casaDe = (h) => { const i = state.residents.findIndex((r) => r.handle === h); return i >= 0 ? plots[i] : null; };

    // 1. Base Militar (@agus20131320) con el primer caza furtivo salido de la fábrica de @fan_de_la_aviacion_2001
    {
    const bs = this.#findClearSpot(this.#distrito('militar', 0), 3.6, plots, 1.1);
    const base = new THREE.Group();
    const losa = new THREE.Mesh(new THREE.BoxGeometry(7, 0.1, 5.4), M('#6b7280')); losa.position.y = 0.05; base.add(losa);
    const bunker = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 1.8), M('#4d5d3a')); bunker.position.set(-2.0, 0.65, -1.4); base.add(bunker);
    const puerta = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.05), M('#1f2937')); puerta.position.set(-2.0, 0.45, -0.48); base.add(puerta);
    for (let i = 0; i < 9; i++) { const saco = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.35), M('#a8a29e')); saco.position.set(-3.2 + i * 0.8, 0.14 + (i % 2) * 0.02, 2.4); base.add(saco); }
    const torre = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.6, 0.9), M('#57534e')); torre.position.set(3.0, 1.3, -2.0); base.add(torre);
    const foco = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 5), M('#fef08a', { emissive: '#facc15', emissiveIntensity: 1.6 })); foco.position.set(3.0, 2.75, -2.0); base.add(foco);
    // Caza furtivo (diseño propio, ala en flecha)
    const caza = new THREE.Group(); const cm = M('#1f2937', { roughness: 0.5, metalness: 0.4 });
    const cuerpo = new THREE.Mesh(new THREE.ConeGeometry(0.35, 2.6, 4), cm); cuerpo.rotation.x = Math.PI / 2; caza.add(cuerpo);
    [-1, 1].forEach((sx) => { const ala = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 1.0), cm); ala.position.set(sx * 0.75, 0, -0.35); ala.rotation.y = sx * 0.5; caza.add(ala); });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.5), M('#f59e0b', { emissive: '#b45309', emissiveIntensity: 0.4 })); cab.position.set(0, 0.16, 0.4); caza.add(cab);
    caza.position.set(1.2, 0.45, 0.4); caza.rotation.y = -0.6; base.add(caza);
    base.position.set(bs.x, bs.y, bs.z);
    g.add(base);
    this.animProps.push((t) => { foco.visible = Math.sin(t * 2.2) > -0.3; });
    this.addObstacle(bs.x, bs.z, 4.2);
    this.militarPos = new THREE.Vector3(bs.x, bs.y, bs.z);
    this.#label('🪖✈️ BASE MILITAR (@agus20131320) · CAZA FURTIVO (@fan_de_la_aviacion_2001)', new THREE.Vector3(bs.x, bs.y + 3.4, bs.z), 'lbl lbl-building');
    }

    // 2. Mansiones (@micaiashuenchumil y @thiagosantibaez8): dos mansiones vecinas, cada una con su piscina
    {
    const ms = this.#findClearSpot(this.#distrito('sur', 0), 5.4, plots, 1.1);
    const duenos = [['micaiashuenchumil', '#f5f5f4', '#1d4ed8'], ['thiagosantibaez8', '#fde68a', '#7c2d12']];
    duenos.forEach(([h, pared, techo], i) => {
      const m = new THREE.Group();
      const planta = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.3, 2.0), M(pared)); planta.position.y = 0.65; m.add(planta);
      const alta = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 1.6), M(pared)); alta.position.set(-0.3, 1.85, -0.1); m.add(alta);
      const tejado = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.18, 1.9), M(techo)); tejado.position.set(-0.3, 2.5, -0.1); m.add(tejado);
      [-0.9, 0.3].forEach((cx) => { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.3, 6), M('#ffffff')); col.position.set(cx, 0.65, 1.15); m.add(col); });
      const vid = M('#7dd3fc', { emissive: '#fde68a', emissiveIntensity: 0.3 });
      [-0.8, 0.8].forEach((wx) => { const v = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.05), vid); v.position.set(wx, 0.8, 1.02); m.add(v); });
      const piscina = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.0), M('#38bdf8', { emissive: '#0ea5e9', emissiveIntensity: 0.3 })); piscina.position.set(0.2, 0.06, 2.0); m.add(piscina);
      m.scale.setScalar(1.5); m.position.set(ms.x + (i ? 3.0 : -3.0), this.height(ms.x + (i ? 3.0 : -3.0), ms.z), ms.z);
      g.add(m);
      this.#label(`🏰 MANSIÓN (@${h})`, new THREE.Vector3(m.position.x, m.position.y + 4.6 + i * 0.5, ms.z), 'lbl lbl-building');
    });
    this.addObstacle(ms.x - 3, ms.z, 3.4); this.addObstacle(ms.x + 3, ms.z, 3.4);
    this.mansionesPos = new THREE.Vector3(ms.x, this.height(ms.x, ms.z), ms.z);
    }

    // 3. Gato en la casa de @jake.apaza (pidió «una casa de dos pisos con un gato»)
    const pj = casaDe('jake.apaza');
    if (pj) {
      const gato = new THREE.Group(); const pel = M('#f97316');
      const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.38), pel); cuerpo.position.y = 0.14; gato.add(cuerpo);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.16), pel); cab.position.set(0, 0.26, 0.22); gato.add(cab);
      [-0.05, 0.05].forEach((ox) => { const oreja = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 4), pel); oreja.position.set(ox, 0.37, 0.22); gato.add(oreja); });
      const cola = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 4), pel); cola.position.set(0, 0.26, -0.24); cola.rotation.x = -0.6; gato.add(cola);
      const gx = pj.x + (pj.face || 1) * 1.4, gz = pj.z + 0.9;
      gato.position.set(gx, this.groundAt(gx, gz), gz);
      g.add(gato);
      this.animProps.push((t) => { cola.rotation.z = Math.sin(t * 3) * 0.4; gato.rotation.y = Math.sin(t * 0.4) * 0.9; });
      this.gatoPos = gato.position.clone();
    }

    // 4. Bandera chilena en la casa de @jopejope8284
    const pc = casaDe('jopejope8284');
    if (pc) {
      const bx = pc.x - (pc.face || 1) * 1.4, bz = pc.z - 0.8, by = this.groundAt(bx, bz);
      const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.2, 6), M('#d1d5db')); mastil.position.set(bx, by + 1.1, bz); g.add(mastil);
      const tela = new THREE.Group(); tela.position.set(bx, by + 1.85, bz);
      const blanco = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.02), M('#ffffff')); blanco.position.set(0.45, 0.125, 0); tela.add(blanco);
      const rojo = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.02), M('#d52b1e')); rojo.position.set(0.45, -0.125, 0); tela.add(rojo);
      const azul = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.025), M('#0039a6')); azul.position.set(0.15, 0.125, 0); tela.add(azul);
      const estrella = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), M('#ffffff')); estrella.position.set(0.15, 0.125, 0.02); tela.add(estrella);
      g.add(tela);
      this.animProps.push((t) => { tela.rotation.y = Math.sin(t * 2.4) * 0.25; });
      this.banderaChilePos = new THREE.Vector3(bx, by + 1.5, bz);
    }

    // 5. Barco de pesca en el muelle (@grift831)
    {
    const mp = this.buildingByKind?.['muelle'] || this.muellePos || { x: -this.R * 0.72, y: 0.9, z: 3 };
    const bx = mp.x - 2.6, bz = mp.z + 1.8;
    const barco = new THREE.Group();
    const casco = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.55, 3.2), M('#9a3412')); casco.position.y = 0.28; barco.add(casco);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 1.1), M('#f8fafc')); cab.position.set(0, 0.9, -0.4); barco.add(cab);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6), M('#78350f')); mast.position.set(0, 1.5, 0.55); barco.add(mast);
    const red = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 0.9), M('#38bdf8')); red.position.set(0, 0.65, 1.2); barco.add(red);
    barco.position.set(bx, 0.95, bz);
    g.add(barco);
    this.animProps.push((t) => { barco.position.y = 0.95 + Math.sin(t * 2.1) * 0.09; barco.rotation.z = Math.sin(t * 1.6) * 0.06; });
    this.pesqueroPos = new THREE.Vector3(bx, 1.1, bz);
    this.#label('⛵ BARCO DE PESCA (@grift831)', new THREE.Vector3(bx, 2.9, bz), 'lbl lbl-building');
    }

    // 6. Tres ovejas en la casa de @yessxk (vecina de @jake.apaza en noreste)
    const py = casaDe('yessxk');
    if (py) {
      const ox0 = py.x + (py.face || 1) * 1.6, oz0 = py.z + 1.0, oy0 = this.groundAt(ox0, oz0);
      [[-0.7, 0], [0.2, 0.75], [0.9, -0.45]].forEach(([dx, dz], idx) => {
        const oveja = new THREE.Group();
        const lana = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 1), M('#f8fafc')); lana.scale.set(1.0, 0.9, 1.25); lana.position.y = 0.3; oveja.add(lana);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.22), M('#1f2937')); cab.position.set(0, 0.34, 0.28); oveja.add(cab);
        [-0.08, 0.08].forEach((lx) => [0.12, -0.12].forEach((lz) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.06), M('#1f2937')); p.position.set(lx, 0.1, lz); oveja.add(p); }));
        oveja.position.set(ox0 + dx, oy0, oz0 + dz); oveja.rotation.y = idx * 1.1;
        g.add(oveja);
        this.animProps.push((t) => { oveja.rotation.y = idx * 1.1 + Math.sin(t * 0.8 + idx) * 0.45; });
      });
      this.ovejasPos = new THREE.Vector3(ox0, oy0, oz0);
      this.#label('🐑🐑🐑 OVEJAS (@yessxk)', new THREE.Vector3(ox0, oy0 + 1.6, oz0), 'lbl lbl-building');
    }

    // 7. Pista aérea + bandera de Chile gigante (@agil2v7e5)
    {
    const ps = this.#findClearSpot(this.#distrito('aereo', 0), 3.6, plots, 1.0);
    const pista = new THREE.Group();
    const asfalto = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.1, 2.6), M('#1f2937')); asfalto.position.y = 0.05; pista.add(asfalto);
    for (let i = -3; i <= 3; i += 2) { const ray = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.16), M('#f8fafc')); ray.position.set(i, 0.11, 0); pista.add(ray); }
    const mastilG = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.2, 6), M('#e2e8f0')); mastilG.position.set(-3.6, 2.1, -1.6); pista.add(mastilG);
    const telaG = new THREE.Group(); telaG.position.set(-3.55, 3.55, -1.6);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.04), M('#ffffff')); bl.position.set(0.75, 0.225, 0); telaG.add(bl);
    const rj = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 0.04), M('#d52b1e')); rj.position.set(0.75, -0.225, 0); telaG.add(rj);
    const az = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.05), M('#0039a6')); az.position.set(0.275, 0.225, 0); telaG.add(az);
    pista.add(telaG);
    pista.position.set(ps.x, ps.y, ps.z);
    g.add(pista);
    this.animProps.push((t) => { telaG.rotation.y = Math.sin(t * 2.1) * 0.25; });
    this.addObstacle(ps.x, ps.z, 4.2);
    this.pistaPos = new THREE.Vector3(ps.x, ps.y, ps.z);
    this.#label('🛬🇨🇱 PISTA AÉREA Y BANDERA (@agil2v7e5)', new THREE.Vector3(ps.x, ps.y + 4.4, ps.z), 'lbl lbl-building');
    }

    this.root.add(g);
  }

  #instagramFeatures(state, plots = []) {
    const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...extra });
    const g = new THREE.Group();

    // 1. Hospital: Camilla con el explorador que volvió herido de la otra isla + médicos
    const hosp = this.buildingByKind?.['hospital'];
    if (hosp) {
      const hx = hosp.x + 1.8, hz = hosp.z + 3.4, hy = this.height(hx, hz);
      const stretcher = new THREE.Group();

      // Camilla con ruedas
      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.15, 1.05), M('#ced4da'));
      frame.position.y = 0.65; stretcher.add(frame);
      const mattr = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.95), M('#ffffff'));
      mattr.position.y = 0.8; stretcher.add(mattr);
      [-0.8, 0.8].forEach((wx) => {
        [-0.45, 0.45].forEach((wz) => {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), M('#6c757d'));
          leg.position.set(wx, 0.32, wz); stretcher.add(leg);
        });
      });

      // Paciente vendado (el explorador herido de la otra isla)
      const patient = new THREE.Group();
      const pBody = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 0.65), M('#90e0ef'));
      pBody.position.set(0, 1.05, 0); patient.add(pBody);
      const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 6, 5), M('#f8f9fa')); // vendaje blanco en la cabeza
      pHead.position.set(0.9, 1.1, 0); patient.add(pHead);
      const pBand = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 6, 12), M('#d90429')); // cinta médica roja
      pBand.rotation.x = Math.PI / 2; pBand.position.set(0.9, 1.12, 0); patient.add(pBand);
      stretcher.add(patient);

      // Gotero intravenoso (IV stand)
      const ivPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 6), M('#adb5bd'));
      ivPole.position.set(-1.1, 0.9, -0.45); stretcher.add(ivPole);
      const ivBag = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 0.1), M('#caf0f8', { transparent: true, opacity: 0.8 }));
      ivBag.position.set(-1.1, 1.6, -0.45); stretcher.add(ivBag);

      // Dos médicos con bata turquesa atendiendo
      const docMat = M('#0d9488');
      const docSkin = M('#f4a261');
      [[-0.4, 0.8], [0.5, 0.8]].forEach(([dx, dz]) => {
        const doc = new THREE.Group();
        const dBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.75, 0.32), docMat); dBody.position.y = 0.65; doc.add(dBody);
        const dHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), docSkin); dHead.position.y = 1.18; doc.add(dHead);
        doc.position.set(dx, 0, dz); doc.rotation.y = Math.PI; stretcher.add(doc);
      });

      stretcher.position.set(hx, hy, hz);
      g.add(stretcher);
      this.addObstacle(hx, hz, 1.8);
      this.#label('🚑 URGENCIAS: EXPLORADOR HERIDO (MENOS MAL HAY HOSPITAL)', new THREE.Vector3(hx, hy + 2.5, hz), 'lbl lbl-building');
    }

    // 2. Tanque casero para @thomasjaime25 en pradera noroeste (zona norte libre)
    const tankSpot = this.#findClearSpot(this.#distrito('militar', 0), 2.4, plots, 1.1);
    const tx = tankSpot.x, tz = tankSpot.z, ty = tankSpot.y;
    const tank = new THREE.Group();
    const tankGreen = M('#4b5320');
    const treadMat = M('#2b2b2b');
    const tankPad = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.12, 2.8), M('#64748b'));
    tankPad.position.y = 0.04; tank.add(tankPad);

    [-0.7, 0.7].forEach((sideZ) => {
      const tread = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.45, 0.38), treadMat);
      tread.position.set(0, 0.25, sideZ); tank.add(tread);
    });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.55, 1.25), tankGreen);
    hull.position.y = 0.55; tank.add(hull);
    const tankTurret = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 0.95), tankGreen);
    tankTurret.position.set(-0.1, 0.95, 0); tank.add(tankTurret);
    const tankBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.4, 6), tankGreen);
    tankBarrel.rotation.z = Math.PI / 2; tankBarrel.position.set(0.9, 0.95, 0); tank.add(tankBarrel);

    // Dos gatos sentados arriba de la torreta del tanque (@thomasjaime25)
    const tankCats = [];
    [[-0.3, -0.2, '#f97316'], [0.15, 0.22, '#1f2937']].forEach(([cx, cz, col], idx) => {
      const cat = new THREE.Group(); const cm = M(col);
      const cb = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.34), cm); cb.position.y = 0.09; cat.add(cb);
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.18), cm); ch.position.set(0, 0.22, 0.18); cat.add(ch);
      [-0.06, 0.06].forEach((ox) => { const ear = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.09, 4), cm); ear.position.set(ox, 0.34, 0.18); cat.add(ear); });
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 4), cm); tail.position.set(0, 0.2, -0.2); tail.rotation.x = -0.6; cat.add(tail);
      cat.position.set(cx, 1.18, cz); cat.rotation.y = idx ? 0.5 : -0.3;
      tank.add(cat); tankCats.push(tail);
    });
    this.animProps.push((t) => { tankCats.forEach((tail, i) => { tail.rotation.z = Math.sin(t * 3.2 + i) * 0.45; }); });

    tank.position.set(tx, ty, tz);
    tank.rotation.y = 0.35;
    g.add(tank);
    this.addObstacle(tx, tz, 1.4);
    this.tankPos = new THREE.Vector3(tx, ty, tz);
    this.#label('🛡️🐱 TANQUE + 2 GATOS (@thomasjaime25)', new THREE.Vector3(tx, ty + 2.2, tz), 'lbl lbl-building');

    // 4. Bombardero Furtivo B-2 patrullando el cielo de Vaeloria (pedido por @fvndo_gnzlz)
    const bomber = new THREE.Group();
    const bMat = M('#23272f', { roughness: 0.48, metalness: 0.42 });
    const bGlass = M('#0f172a', { emissive: '#38bdf8', emissiveIntensity: 0.35, roughness: 0.2 });
    const bNose = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.26, 2.0), bMat);
    bomber.add(bNose);
    const bCockpit = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.72), bGlass);
    bCockpit.position.set(0, 0.15, 0.35);
    bomber.add(bCockpit);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.11, 0.95), bMat);
      wing.position.set(side * 1.15, 0.02, -0.22);
      wing.rotation.y = side * 0.52;
      bomber.add(wing);
      const navLight = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 6, 5),
        M(side > 0 ? '#22c55e' : '#ef4444', { emissive: side > 0 ? '#22c55e' : '#ef4444', emissiveIntensity: 1.1 })
      );
      navLight.position.set(side * 2.15, 0.04, -0.78);
      bomber.add(navLight);
    }
    const jetGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.12, 0.16),
      M('#fb923c', { emissive: '#f97316', emissiveIntensity: 1.2 })
    );
    jetGlow.position.set(0, 0.02, -1.04);
    bomber.add(jetGlow);
    bomber.traverse((o) => { o.castShadow = !MOVIL; o.receiveShadow = false; });
    this.root.add(bomber);
    this.bomberObj = bomber;
    this.animProps.push((t) => {
      const a = t * 0.42;
      const rB = 14.5;
      bomber.position.set(TOWN.x + Math.cos(a) * rB, 10.6 + Math.sin(t * 1.8) * 0.45, TOWN.z + Math.sin(a) * rB);
      bomber.rotation.y = -a;
      bomber.rotation.z = 0.16;
    });

    // 5. Jaeger / Mecha protector de Vaeloria (pedido por @maioneisio) en pradera noreste libre
    const jSpot = this.#findClearSpot(this.#distrito('costaEste', 0), 2.8, plots, 1.0); // vigila el borde este
    const jx = jSpot.x, jz = jSpot.z, jy = jSpot.y;
    const jaeger = new THREE.Group();
    const jArmor = M('#334155', { roughness: 0.45, metalness: 0.45 });
    const jDark = M('#1e293b', { roughness: 0.55, metalness: 0.35 });
    const jAccent = M('#f59e0b', { roughness: 0.4, metalness: 0.3 });
    const jCoreMat = M('#38bdf8', { emissive: '#38bdf8', emissiveIntensity: 1.4, roughness: 0.2 });
    const jBladeMat = M('#7dd3fc', { emissive: '#0ea5e9', emissiveIntensity: 1.1, roughness: 0.15 });

    // Base rocosa / plataforma de anclaje
    const jPad = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.0, 0.22, 8), jDark);
    jPad.position.y = 0.11;
    jaeger.add(jPad);

    // Piernas acorazadas
    [-0.62, 0.62].forEach((lx) => {
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.32, 1.25), jDark);
      foot.position.set(lx, 0.32, 0.12);
      jaeger.add(foot);
      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.58, 1.55, 0.68), jArmor);
      shin.position.set(lx, 1.2, 0);
      jaeger.add(shin);
      const knee = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.34, 0.34), jAccent);
      knee.position.set(lx, 1.98, 0.28);
      jaeger.add(knee);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.05, 0.7), jDark);
      thigh.position.set(lx, 2.45, 0);
      jaeger.add(thigh);
    });

    // Pelvis y torso superior articulado
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.9), jDark);
    pelvis.position.set(0, 3.05, 0);
    jaeger.add(pelvis);

    const jUpper = new THREE.Group();
    jUpper.position.set(0, 3.35, 0);
    jaeger.add(jUpper);

    const chest = new THREE.Mesh(new THREE.BoxGeometry(2.25, 1.55, 1.25), jArmor);
    chest.position.set(0, 0.85, 0);
    jUpper.add(chest);
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.9, 0.25), jAccent);
    chestPlate.position.set(0, 1.0, 0.62);
    jUpper.add(chestPlate);
    const reactor = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12), jCoreMat);
    reactor.rotation.x = Math.PI / 2;
    reactor.position.set(0, 0.95, 0.72);
    jUpper.add(reactor);

    // Hombreras masivas
    [-1.45, 1.45].forEach((sx) => {
      const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.75, 1.3), jArmor);
      pauldron.position.set(sx, 1.48, 0);
      pauldron.rotation.z = sx > 0 ? -0.18 : 0.18;
      jUpper.add(pauldron);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.16, 1.32), jAccent);
      stripe.position.set(sx, 1.62, 0);
      stripe.rotation.z = sx > 0 ? -0.18 : 0.18;
      jUpper.add(stripe);
    });

    // Cabeza con visor brillante
    const jHead = new THREE.Group();
    jHead.position.set(0, 1.92, 0.05);
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.68, 0.88), jArmor);
    jHead.add(helmet);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.2, 0.14), jCoreMat);
    visor.position.set(0, 0.05, 0.42);
    jHead.add(visor);
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.35, 0.75), jAccent);
    crest.position.set(0, 0.42, -0.05);
    jHead.add(crest);
    jUpper.add(jHead);

    // Brazo izquierdo (puño hidráulico) y brazo derecho (espada de plasma)
    const armL = new THREE.Group();
    armL.position.set(-1.5, 1.15, 0);
    const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.75, 0.62), jDark);
    armLMesh.position.set(0, -0.75, 0.15);
    armL.add(armLMesh);
    const fistL = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.58, 0.72), jAccent);
    fistL.position.set(0, -1.7, 0.25);
    armL.add(fistL);
    jUpper.add(armL);

    const armR = new THREE.Group();
    armR.position.set(1.5, 1.15, 0);
    const armRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1.75, 0.62), jDark);
    armRMesh.position.set(0, -0.75, 0.15);
    armR.add(armRMesh);
    const sword = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 2.3), jBladeMat);
    sword.position.set(0, -1.55, 1.2);
    armR.add(sword);
    jUpper.add(armR);

    jaeger.position.set(jx, jy, jz);
    jaeger.rotation.y = Math.atan2(-jx, -jz - 20); // mirando hacia el horizonte norte / islas rivales
    jaeger.traverse((o) => { o.castShadow = !MOVIL; o.receiveShadow = true; });
    g.add(jaeger);
    this.addObstacle(jx, jz, 2.2);
    this.jaegerPos = new THREE.Vector3(jx, jy, jz);
    this.#label('🤖 JAEGER DE @maioneisio Y @dannysaloj_', new THREE.Vector3(jx, jy + 6.4, jz), 'lbl lbl-building');

    this.animProps.push((t) => {
      jUpper.position.y = 3.35 + Math.sin(t * 1.9) * 0.08;
      jUpper.rotation.y = Math.sin(t * 0.65) * 0.22;
      jHead.rotation.y = Math.sin(t * 1.1) * 0.28;
      armR.rotation.x = -0.35 + Math.sin(t * 1.9) * 0.14;
      armL.rotation.x = -0.15 - Math.sin(t * 1.9) * 0.1;
      jCoreMat.emissiveIntensity = 1.1 + Math.sin(t * 3.5) * 0.4;
    });

    // 6. Represa Hidroeléctrica / Compañía Eléctrica en el río (pedido por @menor_brooklyn.v_)
    const damZ = -12.5;
    const damX = riverX(damZ);
    const dam = new THREE.Group();
    const damMat = M('#94a3b8');
    const damDark = M('#334155');
    // Muro principal de concreto cruzando el río
    const damWall = new THREE.Mesh(new THREE.BoxGeometry(RIVER.half * 2 + 3.2, 2.8, 1.9), damMat);
    damWall.position.set(0, 1.1, 0); dam.add(damWall);
    const damRoad = new THREE.Mesh(new THREE.BoxGeometry(RIVER.half * 2 + 3.4, 0.18, 2.2), damDark);
    damRoad.position.set(0, 2.55, 0); dam.add(damRoad);
    // 3 Contrafuertes + compuertas + cascadas animadas
    const cascades = [];
    for (const gx of [-1.9, 0, 1.9]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.65, 3.0, 2.5), M('#64748b'));
      pier.position.set(gx, 1.15, 0.25); dam.add(pier);
      const chute = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.1, 0.6), new THREE.MeshStandardMaterial({ color: '#7dd3fc', emissive: '#38bdf8', emissiveIntensity: 0.45, transparent: true, opacity: 0.85 }));
      chute.position.set(gx, 1.0, 1.15); chute.rotation.x = -0.35; dam.add(chute);
      cascades.push(chute);
    }
    // Casa de máquinas eléctrica + transformador + torre de alta tensión en la orilla este
    const powerHouse = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.8), M('#facc15'));
    powerHouse.position.set(RIVER.half + 2.4, 1.4, -0.2); dam.add(powerHouse);
    const phRoof = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.28, 3.0), damDark);
    phRoof.position.set(RIVER.half + 2.4, 2.6, -0.2); dam.add(phRoof);
    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.36, 4.2, 4), M('#475569'));
    pylon.position.set(RIVER.half + 2.5, 4.2, -0.2); dam.add(pylon);
    const crossArm = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 0.18), M('#cbd5e1'));
    crossArm.position.set(RIVER.half + 2.5, 5.7, -0.2); dam.add(crossArm);
    for (const ix of [-0.9, 0.9]) {
      const ins = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), M('#fde047', { emissive: '#facc15', emissiveIntensity: 1.6 }));
      ins.position.set(RIVER.half + 2.5 + ix, 5.7, -0.2); dam.add(ins);
    }
    dam.position.set(damX, 0, damZ);
    dam.traverse((o) => { o.castShadow = !MOVIL; o.receiveShadow = true; });
    g.add(dam);
    this.addObstacle(damX + RIVER.half + 2.4, damZ, 2.2);
    this.damPos = new THREE.Vector3(damX, 2.0, damZ);
    this.#label('⚡ REPRESA ELÉCTRICA · @menor_brooklyn.v_', new THREE.Vector3(damX + 1.2, 6.9, damZ), 'lbl lbl-building');
    // 7. Base Aérea con Pista Completa, Hangar, Torre y Cazas F-35 & F-22 (distrito aéreo, al oeste-suroeste)
    const aS = this.#findClearSpot(this.#distrito('aereo', 0), 8.5, plots, 1.1); // distrito aéreo (oeste-suroeste), escala con la isla
    const ax = aS.x, az = aS.z;
    const ay = Math.max(1.15, this.height(ax, az));
    const airBase = new THREE.Group();
    // Terraplén y pista de aterrizaje asfaltada (18m x 5.6m)
    const runway = new THREE.Mesh(new THREE.BoxGeometry(18.0, 0.14, 5.6), M('#1e293b', { roughness: 0.9 }));
    runway.position.y = 0.07; airBase.add(runway);
    // Bordes amarillos laterales
    for (const bz of [-2.65, 2.65]) {
      const edge = new THREE.Mesh(new THREE.BoxGeometry(17.6, 0.02, 0.12), M('#facc15'));
      edge.position.set(0, 0.15, bz); airBase.add(edge);
    }
    // Línea central discontinua
    for (let rx = -6.8; rx <= 6.8; rx += 2.2) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.02, 0.2), M('#f8fafc'));
      stripe.position.set(rx, 0.15, 0); airBase.add(stripe);
    }
    // Marcas de umbral (piano) en ambos extremos de la pista
    for (const endX of [-8.2, 8.2]) {
      for (let pz = -1.8; pz <= 1.8; pz += 0.9) {
        const piano = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.02, 0.35), M('#f8fafc'));
        piano.position.set(endX, 0.15, pz); airBase.add(piano);
      }
    }
    // Luces de aproximación de pista
    for (let lx = -8.5; lx <= 8.5; lx += 4.25) {
      [-2.85, 2.85].forEach((sz) => {
        const lgt = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 4), M('#22c55e', { emissive: '#22c55e', emissiveIntensity: 1.6 }));
        lgt.position.set(lx, 0.22, sz); airBase.add(lgt);
      });
    }
    // Plataforma lateral (Apron) + Hangar metálico
    const apron = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.12, 4.2), M('#334155', { roughness: 0.85 }));
    apron.position.set(-4.5, 0.06, -4.8); airBase.add(apron);
    const hangarBody = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.1, 3.4), M('#64748b'));
    hangarBody.position.set(-5.0, 1.1, -5.2); airBase.add(hangarBody);
    const hangarRoof = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 4.25, 10, 1, false, 0, Math.PI), M('#475569'));
    hangarRoof.rotation.z = Math.PI / 2; hangarRoof.position.set(-5.0, 2.15, -5.2); airBase.add(hangarRoof);
    const hangarDoor = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.1), M('#0f172a'));
    hangarDoor.position.set(-5.0, 0.85, -3.48); airBase.add(hangarDoor);

    // Torre de control con radar militar
    const aPylon = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 4.2, 6), M('#475569'));
    aPylon.position.set(5.5, 2.1, -4.2); airBase.add(aPylon);
    const aCabin = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.75, 0.9, 6), M('#0284c7', { emissive: '#38bdf8', emissiveIntensity: 0.4 }));
    aCabin.position.set(5.5, 4.4, -4.2); airBase.add(aCabin);
    const aDome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), M('#f8fafc'));
    aDome.position.set(5.5, 5.1, -4.2); airBase.add(aDome);
    const aRadarBar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.16, 0.22), M('#38bdf8', { emissive: '#0284c7', emissiveIntensity: 0.9 }));
    aRadarBar.position.set(5.5, 5.75, -4.2); airBase.add(aRadarBar);

    // Caza F-35 de @i.sebastiian
    const f35 = new THREE.Group();
    const f35Mat = M('#334155', { roughness: 0.45, metalness: 0.4 });
    const f35Nose = new THREE.Mesh(new THREE.ConeGeometry(0.38, 2.8, 5), f35Mat);
    f35Nose.rotation.x = Math.PI / 2; f35Nose.position.set(0, 0.38, 0.9); f35.add(f35Nose);
    const f35Wing = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.08, 1.4), f35Mat);
    f35Wing.position.set(0, 0.38, -0.2); f35.add(f35Wing);
    const f35Canopy = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.95), M('#0284c7', { emissive: '#38bdf8', emissiveIntensity: 0.6 }));
    f35Canopy.position.set(0, 0.58, 0.4); f35.add(f35Canopy);
    [-0.45, 0.45].forEach((vx) => {
      const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.72, 0.65), f35Mat);
      vTail.position.set(vx, 0.72, -0.9); vTail.rotation.z = -Math.sign(vx) * 0.35; f35.add(vTail);
    });
    const f35Glow = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.35, 8), M('#38bdf8', { emissive: '#38bdf8', emissiveIntensity: 2.2 }));
    f35Glow.rotation.x = Math.PI / 2; f35Glow.position.set(0, 0.38, -1.25); f35.add(f35Glow);
    airBase.add(f35);

    // Caza F-22 Raptor de @alejandro557477
    const f22 = new THREE.Group();
    const f22Mat = M('#475569', { roughness: 0.42, metalness: 0.45 });
    const f22Nose = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.2, 5), f22Mat);
    f22Nose.rotation.x = Math.PI / 2; f22Nose.position.set(0, 0.38, 1.05); f22.add(f22Nose);
    const f22Wing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.08, 1.6), f22Mat);
    f22Wing.position.set(0, 0.38, -0.25); f22.add(f22Wing);
    const f22Canopy = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 1.05), M('#f59e0b', { emissive: '#d97706', emissiveIntensity: 0.55 }));
    f22Canopy.position.set(0, 0.6, 0.45); f22.add(f22Canopy);
    [-0.52, 0.52].forEach((vx) => {
      const vTail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.82, 0.75), f22Mat);
      vTail.position.set(vx, 0.76, -1.05); vTail.rotation.z = -Math.sign(vx) * 0.38; f22.add(vTail);
    });
    const f22Glows = [];
    [-0.22, 0.22].forEach((tx) => {
      const f22Glow = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.32, 8), M('#f97316', { emissive: '#ea580c', emissiveIntensity: 2.2 }));
      f22Glow.rotation.x = Math.PI / 2; f22Glow.position.set(tx, 0.38, -1.45); f22.add(f22Glow);
      f22Glows.push(f22Glow);
    });
    airBase.add(f22);

    airBase.position.set(ax, ay, az);
    airBase.traverse((o) => { o.castShadow = !MOVIL; o.receiveShadow = true; });
    g.add(airBase);
    // Registrar obstáculos a lo largo de toda la pista y hangar para que no nazcan árboles ni arbustos encima
    for (let ox = -8; ox <= 8; ox += 3.2) {
      this.addObstacle(ax + ox, az, 3.6);
      this.addObstacle(ax + ox, az - 4.2, 2.8);
    }
    this.airBasePos = new THREE.Vector3(ax, ay + 0.8, az);
    this.airJets = [f35, f22];
    this.#label('🛩️ BASE AÉREA F-35 & F-22 (@i.sebastiian & @alejandro557477)', new THREE.Vector3(ax, ay + 6.4, az - 2.0), 'lbl lbl-building');

    // 8. Superhéroe Volador (@jorgx_sxb) con ciclo vuelo -> descenso -> aterrizaje en suelo -> despegue
    const hero = new THREE.Group();
    const hSuit = M('#1d4ed8');
    const hCape = M('#dc2626');
    const hBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.95), hSuit);
    hero.add(hBody);
    const hHead = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), M('#f4a261'));
    hHead.position.set(0, 0.08, 0.62); hero.add(hHead);
    const cape = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 1.15), hCape);
    cape.position.set(0, 0.16, -0.38); cape.rotation.x = -0.15; hero.add(cape);
    const hFistR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.45), hSuit);
    hFistR.position.set(0.28, 0, 0.85); hero.add(hFistR);
    const hFistL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.45), hSuit);
    hFistL.position.set(-0.28, 0, 0.85); hero.add(hFistL);
    const heroTrail = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.8, 6), M('#38bdf8', { emissive: '#0284c7', emissiveIntensity: 2.5, transparent: true, opacity: 0.8 }));
    heroTrail.rotation.x = -Math.PI / 2; heroTrail.position.set(0, 0, -1.35); hero.add(heroTrail);
    hero.traverse((o) => { o.castShadow = !MOVIL; o.receiveShadow = false; });
    this.root.add(hero);
    this.heroObj = hero;
    this.#label('🦸‍♂️ SUPERHÉROE (@jorgx_sxb)', hero.position, 'lbl lbl-building');

    // Función auxiliar de vuelo realista con orientación por vector velocidad (sin girar sobre su eje)
    const getJetPos = (cycle, laneZ, altMax, rx, rz) => {
      if (cycle < 0.16) {
        const k = cycle / 0.16;
        return new THREE.Vector3(-7.5 + k * 1.2, 0.14, laneZ);
      } else if (cycle < 0.32) {
        const k = (cycle - 0.16) / 0.16;
        const x = -6.3 + k * k * 15.0;
        const y = 0.14 + (k > 0.45 ? Math.pow((k - 0.45) / 0.55, 1.5) * altMax : 0);
        return new THREE.Vector3(x, y, laneZ);
      } else if (cycle < 0.78) {
        const k = (cycle - 0.32) / 0.46;
        const ang = k * Math.PI * 2;
        return new THREE.Vector3(8.7 + Math.sin(ang) * rx, altMax + Math.sin(ang * 2) * 1.2, laneZ - (1 - Math.cos(ang)) * rz);
      } else {
        const k = (cycle - 0.78) / 0.22;
        return new THREE.Vector3(-15.5 + k * 8.0, altMax * Math.pow(1 - Math.min(k / 0.75, 1), 1.4) + 0.14, laneZ);
      }
    };
    const updateJetFlight = (jet, period, tOffset, laneZ, altMax, rx, rz, t) => {
      const c0 = ((t + tOffset) % period) / period;
      const c1 = ((t + tOffset + 0.08) % period) / period;
      const p0 = getJetPos(c0, laneZ, altMax, rx, rz);
      const p1 = getJetPos(c1, laneZ, altMax, rx, rz);
      jet.position.copy(p0);
      if (p0.distanceToSquared(p1) > 0.0001) {
        jet.lookAt(airBase.localToWorld(p1.clone()));
      } else {
        jet.rotation.set(0, Math.PI / 2, 0);
      }
    };

    const getHeroPos = (t) => {
      const hCycle = (t % 21) / 21;
      if (hCycle < 0.55) {
        const hAng = t * 0.48;
        const hRad = 11.0 + Math.sin(t * 0.7) * 4.0;
        return {
          pos: new THREE.Vector3(TOWN.x + Math.cos(hAng) * hRad, 7.2 + Math.sin(t * 1.3) * 1.4, TOWN.z + Math.sin(hAng) * hRad),
          flying: true,
        };
      } else if (hCycle < 0.70) {
        const k = (hCycle - 0.55) / 0.15;
        const ease = k * k * (3 - 2 * k);
        const sAng = (t - (hCycle - 0.55) * 21) * 0.48;
        const sx = TOWN.x + Math.cos(sAng) * 11.5, sz = TOWN.z + Math.sin(sAng) * 11.5;
        return {
          pos: new THREE.Vector3(THREE.MathUtils.lerp(sx, heroLandSpot.x, ease), THREE.MathUtils.lerp(7.2, heroLandSpot.y, ease), THREE.MathUtils.lerp(sz, heroLandSpot.z, ease)),
          flying: true,
        };
      } else if (hCycle < 0.86) {
        return { pos: new THREE.Vector3(heroLandSpot.x, heroLandSpot.y, heroLandSpot.z), flying: false, k: (hCycle - 0.70) / 0.16 };
      } else {
        const k = (hCycle - 0.86) / 0.14;
        const ease = k * k;
        return {
          pos: new THREE.Vector3(heroLandSpot.x + ease * 4.5, THREE.MathUtils.lerp(heroLandSpot.y, 7.2, ease), heroLandSpot.z + ease * 4.5),
          flying: true,
        };
      }
    };

    const heroLandSpot = { x: TOWN.x + 2.5, z: TOWN.z + 2.5, y: this.groundAt(TOWN.x + 2.5, TOWN.z + 2.5) + 0.55 };
    this.animProps.push((t) => {
      aRadarBar.rotation.y = t * 2.8;
      f35Glow.scale.setScalar(0.9 + Math.sin(t * 12) * 0.18);
      f22Glows.forEach((gl) => gl.scale.setScalar(0.9 + Math.cos(t * 12) * 0.18));

      // Movimientos independientes de F-35 (26s) y F-22 (31s)
      updateJetFlight(f35, 26, 0, 1.15, 8.2, 16.0, 14.0, t);
      updateJetFlight(f22, 31, 13, -1.15, 9.6, 19.0, 16.0, t);

      // Movimiento independiente del Superhéroe mirando hacia donde vuela
      const h0 = getHeroPos(t);
      const h1 = getHeroPos(t + 0.08);
      hero.position.copy(h0.pos);
      if (h0.flying) {
        if (h0.pos.distanceToSquared(h1.pos) > 0.0001) hero.lookAt(h1.pos);
        heroTrail.visible = true;
      } else {
        hero.rotation.set(-Math.PI / 2, 0, Math.sin(h0.k * Math.PI * 2) * 0.4);
        heroTrail.visible = false;
      }
      cape.rotation.x = -0.15 + Math.sin(t * 14) * 0.12;
    });

    // 9. Portaaviones de @nedi_montoya en el mar oeste (mar abierto, fuera de la orilla)
    {
    const ncx = -(this.R + 14), ncz = -12;
    const nCarrier = new THREE.Group();
    const ncHull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.1, 9.6), M('#334155'));
    ncHull.position.y = 0.55; nCarrier.add(ncHull);
    const ncDeck = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.16, 10.0), M('#1e293b'));
    ncDeck.position.y = 1.15; nCarrier.add(ncDeck);
    const ncTower = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.6, 2.0), M('#475569'));
    ncTower.position.set(1.2, 1.95, -0.8); nCarrier.add(ncTower);
    nCarrier.position.set(ncx, 0.05, ncz); nCarrier.rotation.y = Math.PI * 0.18;
    g.add(nCarrier);
    // Aviones en cubierta pedidos por @gus67.0 («construyan unos buenos aviones para el portaviones»)
    [-3.2, -0.6, 2.0].forEach((dz, i) => {
      const av = new THREE.Group(); const am = M(i === 1 ? '#64748b' : '#94a3b8', { roughness: 0.5, metalness: 0.35 });
      const cuerpo = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.5, 5), am); cuerpo.rotation.x = Math.PI / 2; av.add(cuerpo);
      const ala = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.05, 0.55), am); ala.position.z = -0.15; av.add(ala);
      const cola = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.4, 0.35), am); cola.position.set(0, 0.2, -0.6); av.add(cola);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.4), M('#38bdf8', { emissive: '#0ea5e9', emissiveIntensity: 0.5 })); cab.position.set(0, 0.12, 0.25); av.add(cab);
      av.position.set(-0.7, 1.42, dz); av.rotation.y = 0.25; nCarrier.add(av);
    });
    this.carrierPos = new THREE.Vector3(ncx, 1.4, ncz);
    this.#label('🚢 PORTAAVIONES (@nedi_montoya)', new THREE.Vector3(ncx, 4.2, ncz), 'lbl lbl-building');
    }

    // 10. Base Militar Eléctrica (@menor_brooklyn.v_) en pradera noreste (lejos de casas y puente)
    {
    const eSpot = this.#findClearSpot(this.#distrito('industria', 0), 2.4, plots, 1.1); // distrito industrial (noroeste)
    const eBaseX = eSpot.x, eBaseZ = eSpot.z;
    const eBaseY = Math.max(1.2, eSpot.y);
    const eBase = new THREE.Group();
    const ebBunker = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.3, 2.4), M('#334155'));
    ebBunker.position.y = 0.65; eBase.add(ebBunker);
    [-0.9, 0.9].forEach((cx) => {
      const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 1.8, 8), M('#38bdf8', { emissive: '#0284c7', emissiveIntensity: 1.8 }));
      coil.position.set(cx, 1.5, 0); eBase.add(coil);
    });
    eBase.position.set(eBaseX, eBaseY, eBaseZ);
    g.add(eBase);
    this.addObstacle(eBaseX, eBaseZ, 2.6);
    this.#label('⚡🪖 BASE MILITAR ELÉCTRICA (@menor_brooklyn.v_)', new THREE.Vector3(eBaseX, eBaseY + 3.2, eBaseZ), 'lbl lbl-building');
    }

    // 11. Restaurante (@ab1sssm): en un claro libre (el pueblo creció y la vieja posición cayó en una calle)
    {
    const rSpot = this.#findClearSpot(this.#distrito('ocio', 0), 3.4, plots, 1.1); // distrito de ocio (suroeste)
    const rx = rSpot.x, rz = rSpot.z, ry = rSpot.y;
    const rest = new THREE.Group();
    const rBody = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.0, 2.8), M('#fef3c7'));
    rBody.position.y = 1.0; rest.add(rBody);
    const rRoof = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.35, 3.2), M('#dc2626'));
    rRoof.position.y = 2.15; rest.add(rRoof);
    const rDoor = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.25, 0.06), M('#7c2d12'));
    rDoor.position.set(0, 0.63, 1.42); rest.add(rDoor);
    const vidrio = M('#7dd3fc', { emissive: '#fde68a', emissiveIntensity: 0.35 });
    [-1.15, 1.15].forEach((wx) => { const w = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.06), vidrio); w.position.set(wx, 1.15, 1.42); rest.add(w); });
    // Toldo a rayas rojo/blanco sobre la fachada
    for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.7), M(i % 2 ? '#ffffff' : '#ef4444'));
      t.position.set(-1.5 + i * 0.6, 1.7, 1.75); t.rotation.x = 0.35; rest.add(t); }
    const rSign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 0.08), M('#facc15', { emissive: '#f59e0b', emissiveIntensity: 0.5 }));
    rSign.position.set(0, 2.62, 1.3); rest.add(rSign);
    // Terraza: mesas con mantel y sillas
    [-1.2, 1.2].forEach((mx) => {
      const mesa = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 10), M('#ffffff')); mesa.position.set(mx, 0.62, 2.7); rest.add(mesa);
      const pata = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), M('#475569')); pata.position.set(mx, 0.31, 2.7); rest.add(pata);
      [-0.55, 0.55].forEach((sx) => { const silla = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), M('#b45309')); silla.position.set(mx + sx, 0.2, 2.7); rest.add(silla); });
    });
    rest.position.set(rx, ry, rz);
    g.add(rest);
    this.addObstacle(rx, rz, 3.2); this.addObstacle(rx, rz + 2.8, 2.2);
    this.restaurantePos = new THREE.Vector3(rx, ry, rz);
    this.#label('🍽️ RESTAURANTE (@ab1sssm)', new THREE.Vector3(rx, ry + 3.4, rz), 'lbl lbl-building');
    }

    // 12. Dirigible (@p1_nx_h3_ira) patrullando el cielo norte
    {
    const blimp = new THREE.Group();
    const bHull = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 8), M('#e2e8f0'));
    bHull.scale.set(1.0, 0.85, 2.4); blimp.add(bHull);
    const bCab = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 1.5), M('#1e293b'));
    bCab.position.y = -1.2; blimp.add(bCab);
    this.root.add(blimp);
    this.animProps.push((t) => {
      const a = t * 0.25;
      blimp.position.set(Math.cos(a) * 20, 14.5 + Math.sin(t * 1.1) * 0.4, -30 + Math.sin(a) * 10);
      blimp.rotation.y = -a;
    });
    }

    // 13 & 14. La Bombonera Partida a la Mitad (@tuano608) + OVNI Interestelar con Pollo Gigante (@edgarjesus4904) — diseño exacto de referencia
    {
    const bSpot = this.#findClearSpot(this.#distrito('deporte', 0), 5.0, plots, 1.1); // estadio en el borde este
    const bx = bSpot.x, bz = bSpot.z, by = Math.max(1.2, bSpot.y);
    const bombo = new THREE.Group();
    const mBlue = M('#1d4ed8'), mBlueDark = M('#1e3a8a'), mYellow = M('#facc15'), mPitch = M('#22c55e'), mLine = M('#ffffff');
    const mCrack = M('#1c1917'), mCrackEdge = M('#44403c');

    // Grieta sísmica oscura y dentada que parte el terreno y el estadio en dos mitades exactas
    const fissure = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.24, 7.8), mCrack);
    fissure.position.set(0, 0.04, 0); bombo.add(fissure);
    for (let kz = -3.4; kz <= 3.4; kz += 0.68) {
      const jagL = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.35, 4), mCrackEdge);
      jagL.position.set(-0.55 + (Math.sin(kz * 3.1) * 0.14), 0.14, kz);
      jagL.rotation.y = kz; bombo.add(jagL);
      const jagR = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.35, 4), mCrackEdge);
      jagR.position.set(0.55 + (Math.cos(kz * 2.7) * 0.14), 0.14, kz);
      jagR.rotation.y = -kz; bombo.add(jagR);
    }

    // Construye cada mitad de La Bombonera (izquierda s = -1, derecha s = +1) separadas por la grieta
    const crowdColors = [M('#facc15'), M('#ffffff'), M('#38bdf8'), M('#ef4444')];
    for (const s of [-1, 1]) {
      const half = new THREE.Group();
      half.position.x = s * 0.62; // separación de la fractura central
      half.rotation.z = s * -0.025; // leve inclinación dramática de ruptura

      // Media cancha de césped verde vibrante + líneas blancas + área + arco
      const pitchHalf = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.18, 4.2), mPitch);
      pitchHalf.position.set(s * 1.38, 0.12, 0); half.add(pitchHalf);
      const touchN = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.03, 0.08), mLine);
      touchN.position.set(s * 1.38, 0.22, -1.92); half.add(touchN);
      const touchS = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.03, 0.08), mLine);
      touchS.position.set(s * 1.38, 0.22, 1.92); half.add(touchS);
      const goalLine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.03, 3.9), mLine);
      goalLine.position.set(s * 2.64, 0.22, 0); half.add(goalLine);
      const penBox = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.03, 2.1), mLine);
      penBox.position.set(s * 2.22, 0.215, 0); half.add(penBox);
      const penInner = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.032, 1.94), mPitch);
      penInner.position.set(s * 2.26, 0.218, 0); half.add(penInner);
      // Arco (portería blanca)
      const goalTop = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.95), mLine);
      goalTop.position.set(s * 2.64, 0.56, 0); half.add(goalTop);
      [-0.45, 0.45].forEach((gz) => {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.36, 0.08), mLine);
        post.position.set(s * 2.64, 0.38, gz); half.add(post);
      });

      // 3 Bandejas Azul - Amarillo - Azul en los 3 bordes de cada mitad (Norte, Sur y Cabecera exterior)
      [0, 1, 2].forEach((tier) => {
        const tMat = tier === 1 ? mYellow : mBlue;
        const ty = 0.42 + tier * 0.58;
        const tzOff = 2.25 + tier * 0.34;
        const txLen = 2.95 + tier * 0.32;
        // Tribunas laterales Norte y Sur
        for (const sz of [-1, 1]) {
          const stSide = new THREE.Mesh(new THREE.BoxGeometry(txLen, 0.56, 0.62), tMat);
          stSide.position.set(s * (1.48 + tier * 0.14), ty, sz * tzOff);
          half.add(stSide);
        }
        // Tribuna de cabecera exterior
        const stEnd = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.56, 4.4 + tier * 0.65), tMat);
        stEnd.position.set(s * (2.98 + tier * 0.34), ty, 0);
        half.add(stEnd);
      });

      // Techos azules inclinados sobre las tribunas laterales (como en la imagen de referencia)
      for (const sz of [-1, 1]) {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 1.05), mBlueDark);
        roof.position.set(s * 1.65, 2.08, sz * 2.68);
        roof.rotation.x = sz * 0.22;
        half.add(roof);
      }

      // Hinchas low-poly (puntos de color en las gradas)
      if (!this.gamaBaja) {
        for (let cIdx = 0; cIdx < 18; cIdx++) {
          const fan = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), crowdColors[cIdx % crowdColors.length]);
          const side = cIdx % 3;
          const tier = cIdx % 3;
          if (side === 0) fan.position.set(s * (0.6 + (cIdx % 5) * 0.45), 0.75 + tier * 0.58, -2.18 - tier * 0.32);
          else if (side === 1) fan.position.set(s * (0.6 + (cIdx % 5) * 0.45), 0.75 + tier * 0.58, 2.18 + tier * 0.32);
          else fan.position.set(s * (2.88 + tier * 0.32), 0.75 + tier * 0.58, -1.5 + (cIdx % 6) * 0.6);
          half.add(fan);
        }
      }

      // Torres de iluminación en las esquinas exteriores de cada mitad
      for (const sz of [-1, 1]) {
        const lx = s * 3.55, lz = sz * 2.95;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 3.8, 6), M('#94a3b8'));
        pole.position.set(lx, 1.9, lz); half.add(pole);
        const lampBank = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.32, 0.22), M('#fef08a', { emissive: '#fde047', emissiveIntensity: 1.6 }));
        lampBank.position.set(lx, 3.85, lz);
        lampBank.lookAt(0, 0.5, 0);
        half.add(lampBank);
      }

      bombo.add(half);
    }

    bombo.position.set(bx, by, bz);
    bombo.traverse((o) => { o.castShadow = !this.gamaBaja; o.receiveShadow = !this.gamaBaja; });
    g.add(bombo);
    this.addObstacle(bx, bz, 5.6);
    this.bomboneraPos = new THREE.Vector3(bx, by, bz);
    this.#label('🏟️ LA BOMBONERA A LA MITAD (@tuano608)', new THREE.Vector3(bx, by + 4.2, bz), 'lbl lbl-building');

    // 13. Nave Interestelar OVNI con Pollo Gigante Expresivo arriba (@edgarjesus4904) sobrevolando La Bombonera
    const ufo = new THREE.Group();
    const mHull = M('#94a3b8', { metalness: 0.55, roughness: 0.35 });
    const mHullDark = M('#334155', { metalness: 0.6, roughness: 0.4 });
    const mCyanGlow = M('#38bdf8', { emissive: '#06b6d4', emissiveIntensity: 1.35 });
    // Platillo metálico facetado en capas
    const uDiscMain = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.75, 0.44, 12), mHull);
    ufo.add(uDiscMain);
    const uDiscUnder = new THREE.Mesh(new THREE.CylinderGeometry(2.65, 1.35, 0.36, 12), mHullDark);
    uDiscUnder.position.y = -0.34; ufo.add(uDiscUnder);
    const uCollar = new THREE.Mesh(new THREE.CylinderGeometry(1.42, 1.68, 0.24, 12), mHullDark);
    uCollar.position.y = 0.28; ufo.add(uCollar);
    // Luces perimetrales del platillo
    for (let li = 0; li < 12; li++) {
      const ang = (li / 12) * Math.PI * 2;
      const rimLight = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.14, 0.18),
        li % 2 === 0 ? mCyanGlow : M('#facc15', { emissive: '#eab308', emissiveIntensity: 1.4 })
      );
      rimLight.position.set(Math.cos(ang) * 2.52, -0.02, Math.sin(ang) * 2.52);
      rimLight.rotation.y = -ang;
      ufo.add(rimLight);
    }
    // Cúpula turquesa brillante donde se posa el pollo gigante
    const uDome = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.18, 1),
      M('#38bdf8', { emissive: '#0284c7', emissiveIntensity: 0.95, roughness: 0.2 })
    );
    uDome.scale.set(1, 0.68, 1);
    uDome.position.y = 0.38;
    ufo.add(uDome);

    // Pollo Gigante Low-Poly Expresivo arriba de la cúpula (garras naranjas, alas abiertas, cola en abanico, ojos grandes, pico abierto, cresta y barbilla roja)
    const chicken = new THREE.Group();
    const mWhite = M('#ffffff'), mFeather = M('#f1f5f9'), mOrange = M('#f97316'), mRed = M('#ef4444'), mDarkRed = M('#991b1b');
    // Patas y garras naranjas agarrando la cúpula
    for (const lx of [-0.42, 0.42]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.42, 6), mOrange);
      leg.position.set(lx, 1.08, 0.08); chicken.add(leg);
      for (const tAng of [-0.35, 0, 0.35]) {
        const toe = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.08, 0.34), mOrange);
        toe.position.set(lx + Math.sin(tAng) * 0.12, 0.90, 0.22);
        toe.rotation.y = tAng;
        chicken.add(toe);
      }
    }
    // Cuerpo y pecho plumoso low-poly
    const cBody = new THREE.Mesh(new THREE.IcosahedronGeometry(0.88, 1), mWhite);
    cBody.scale.set(1.05, 0.96, 1.22); cBody.position.set(0, 1.78, 0); chicken.add(cBody);
    const cBreast = new THREE.Mesh(new THREE.IcosahedronGeometry(0.68, 1), mFeather);
    cBreast.scale.set(0.95, 0.85, 0.85); cBreast.position.set(0, 1.68, 0.48); chicken.add(cBreast);
    // Cabeza expresiva
    const cHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.56, 1), mWhite);
    cHead.position.set(0, 2.58, 0.42); chicken.add(cHead);
    // Cresta roja de 3 lóbulos arriba de la cabeza
    [
      { z: 0.22, h: 0.36, r: -0.15 },
      { z: 0.44, h: 0.46, r: 0.05 },
      { z: 0.64, h: 0.34, r: 0.25 },
    ].forEach((cb) => {
      const lobe = new THREE.Mesh(new THREE.ConeGeometry(0.16, cb.h, 5), mRed);
      lobe.position.set(0, 3.12, cb.z); lobe.rotation.x = cb.r; chicken.add(lobe);
    });
    // Pico naranja abierto gritando + interior de boca + barbilla roja colgante (wattle)
    const beakUp = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.48, 4), mOrange);
    beakUp.rotation.x = Math.PI * 0.44; beakUp.position.set(0, 2.58, 1.02); chicken.add(beakUp);
    const beakLow = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.40, 4), mOrange);
    beakLow.rotation.x = Math.PI * 0.64; beakLow.position.set(0, 2.38, 0.96); chicken.add(beakLow);
    const mouthIn = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.14, 0.22), mDarkRed);
    mouthIn.position.set(0, 2.48, 0.86); chicken.add(mouthIn);
    for (const wx of [-0.09, 0.09]) {
      const wattle = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), mRed);
      wattle.scale.set(0.8, 1.45, 0.9); wattle.position.set(wx, 2.16, 0.84); chicken.add(wattle);
    }
    // Ojos grandes expresivos con aro rojo, esclerótica blanca y pupila negra
    for (const ex of [-0.26, 0.26]) {
      const eyeRing = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.06, 8), mRed);
      eyeRing.rotation.x = Math.PI * 0.5; eyeRing.rotation.z = ex < 0 ? 0.35 : -0.35;
      eyeRing.position.set(ex, 2.66, 0.84); chicken.add(eyeRing);
      const sclera = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 8), mWhite);
      sclera.rotation.x = Math.PI * 0.5; sclera.rotation.z = ex < 0 ? 0.35 : -0.35;
      sclera.position.set(ex, 2.66, 0.86); chicken.add(sclera);
      const pupil = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.10, 7), M('#0f172a'));
      pupil.rotation.x = Math.PI * 0.5; pupil.rotation.z = ex < 0 ? 0.35 : -0.35;
      pupil.position.set(ex, 2.66, 0.88); chicken.add(pupil);
    }
    // Alas laterales low-poly desplegadas con plumas escalonadas
    const wingL = new THREE.Group(), wingR = new THREE.Group();
    wingL.position.set(-0.88, 1.92, 0.05); wingR.position.set(0.88, 1.92, 0.05);
    for (let f = 0; f < 3; f++) {
      const featherL = new THREE.Mesh(new THREE.BoxGeometry(0.65 - f * 0.12, 0.22, 0.72 - f * 0.12), f % 2 === 0 ? mWhite : mFeather);
      featherL.position.set(-0.28 - f * 0.14, -f * 0.12, -f * 0.08); featherL.rotation.z = 0.35 + f * 0.12;
      wingL.add(featherL);
      const featherR = new THREE.Mesh(new THREE.BoxGeometry(0.65 - f * 0.12, 0.22, 0.72 - f * 0.12), f % 2 === 0 ? mWhite : mFeather);
      featherR.position.set(0.28 + f * 0.14, -f * 0.12, -f * 0.08); featherR.rotation.z = -0.35 - f * 0.12;
      wingR.add(featherR);
    }
    chicken.add(wingL, wingR);
    // Cola en abanico de plumas blancas detrás
    for (let ti = -2; ti <= 2; ti++) {
      const tailF = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.75, 4), mWhite);
      tailF.position.set(ti * 0.18, 2.15 + (2 - Math.abs(ti)) * 0.06, -0.98);
      tailF.rotation.x = -0.55; tailF.rotation.z = -ti * 0.22;
      chicken.add(tailF);
    }

    ufo.add(chicken);
    ufo.scale.setScalar(1.18);
    ufo.position.set(bx, by + 6.8, bz - 1.2);
    this.root.add(ufo);
    this.ufoObj = ufo;
    this.#label('🐔🛸 OVNI DE POLLOS (@edgarjesus4904)', new THREE.Vector3(bx, by + 10.8, bz - 1.2), 'lbl lbl-building');
    this.animProps.push((t) => {
      ufo.position.set(bx + Math.sin(t * 0.65) * 2.2, by + 6.8 + Math.cos(t * 1.8) * 0.42, bz - 1.2 + Math.cos(t * 0.65) * 1.8);
      uDiscMain.rotation.y = t * 1.8;
      wingL.rotation.z = Math.sin(t * 5.5) * 0.22;
      wingR.rotation.z = -Math.sin(t * 5.5) * 0.22;
    });
    }

    // 15. Taller Hot Wheels (@elcrack_6435) en el distrito del motor (junto al concesionario)
    {
    const hwS = this.#findClearSpot(this.#distrito('motor', 1), 4.8, plots, 1.1);
    const hwx = hwS.x, hwz = hwS.z, hwy = Math.max(1.2, this.height(hwx, hwz));
    const hw = new THREE.Group();
    const hwGarage = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.4), M('#1e293b'));
    hwGarage.position.y = 0.9; hw.add(hwGarage);
    const hwLoop = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.14, 6, 16), M('#f97316'));
    hwLoop.position.set(2.0, 1.3, 0); hw.add(hwLoop);
    hw.position.set(hwx, hwy, hwz);
    g.add(hw);
    this.addObstacle(hwx, hwz, 4.8);
    this.hotwheelsPos = new THREE.Vector3(hwx, hwy, hwz);
    this.#label('🏎️ TALLER HOT WHEELS (@elcrack_6435)', new THREE.Vector3(hwx, hwy + 2.8, hwz), 'lbl lbl-building');
    }

    // 11. Zapato Monstruo chiquito con rama de árbol (@lauyateloavise)
    {
    // Fuera del centro (allí la gente se le paraba encima): distrito de ocio, al sur.
    const shoeSpot = this.#findClearSpot(this.#distrito('ocio', 1), 0.8, plots, 1.0);
    const shoeM = new THREE.Group();
    const sSole = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.85), M('#ffffff'));
    sSole.position.y = 0.06; shoeM.add(sSole);
    const sUpper = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.72), M('#e11d48'));
    sUpper.position.set(0, 0.24, -0.04); shoeM.add(sUpper);
    [-0.12, 0.12].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 5, 4), M('#fef08a', { emissive: '#facc15', emissiveIntensity: 1.2 }));
      eye.position.set(ex, 0.36, 0.32); shoeM.add(eye);
    });
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.75, 5), M('#78350f'));
    branch.position.set(0.28, 0.42, 0.1); branch.rotation.z = -0.35; shoeM.add(branch);
    shoeM.position.set(shoeSpot.x, shoeSpot.y, shoeSpot.z);
    g.add(shoeM);
    this.animProps.push((t) => {
      shoeM.rotation.y = Math.sin(t * 3) * 0.35;
      branch.rotation.z = -0.35 + Math.sin(t * 6) * 0.25;
    });
    this.shoePos = new THREE.Vector3(shoeSpot.x, shoeSpot.y, shoeSpot.z);
    this.#label('👟🌿 ZAPATO MONSTRUO (@lauyateloavise)', new THREE.Vector3(shoeSpot.x, shoeSpot.y + 1.1, shoeSpot.z), 'lbl lbl-building');
    }

    // 16. Estación Espacial (@megacaribean) orbitando muy alto sobre la isla
    {
    const est = new THREE.Group();
    const metal = M('#e2e8f0', { roughness: 0.4, metalness: 0.5 });
    const panel = M('#1d4ed8', { emissive: '#1e3a8a', emissiveIntensity: 0.4, metalness: 0.3 });
    const nucleo = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 4.2, 10), metal); nucleo.rotation.z = Math.PI / 2; est.add(nucleo);
    const anillo = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.22, 6, 20), metal); anillo.rotation.y = Math.PI / 2; est.add(anillo);
    [-3.6, 3.6].forEach((px) => { const pa = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 1.4), panel); pa.position.set(px, 0, 0); est.add(pa); });
    const luz = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), M('#f87171', { emissive: '#ef4444', emissiveIntensity: 2.0 })); luz.position.set(0, 0.85, 0); est.add(luz);
    g.add(est);
    this.spaceStation = est;
    this.animProps.push((t) => {
      const a = t * 0.035; est.position.set(Math.cos(a) * 26, 34 + Math.sin(t * 0.3) * 0.6, Math.sin(a) * 26);
      est.rotation.y = -a; anillo.rotation.x = t * 0.25; luz.visible = Math.sin(t * 3) > 0;
    });
    this.spacePos = new THREE.Vector3(26, 34, 0);
    }

    // 17. Avión de carga gigante de 6 motores (@nedi_montoya y @fvndo_gnzlz) trayendo suministros en vuelo lento
    {
    const carga = new THREE.Group();
    const cm = M('#cbd5e1', { roughness: 0.5, metalness: 0.3 });
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 7.5, 10), cm); fus.rotation.x = Math.PI / 2; carga.add(fus);
    const morro = new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 6), cm); morro.scale.set(1, 1, 0.8); morro.position.z = 3.75; carga.add(morro);
    const alas = new THREE.Mesh(new THREE.BoxGeometry(11, 0.14, 1.6), cm); alas.position.set(0, 0.35, 0.3); carga.add(alas);
    [-4.2, -2.9, -1.6, 1.6, 2.9, 4.2].forEach((mx) => { const mo = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 8), M('#475569')); mo.rotation.x = Math.PI / 2; mo.position.set(mx, 0.05, 0.6); carga.add(mo); });
    const colaV = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 1.3), cm); colaV.position.set(0, 1.0, -3.4); carga.add(colaV);
    const colaH = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 0.9), cm); colaH.position.set(0, 1.7, -3.5); carga.add(colaH);
    const franja = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.18, 6.0), M('#2563eb')); franja.position.set(0, 0.1, 0); carga.add(franja);
    g.add(carga);
    this.cargoPlane = carga;
    const cargaPos = (t) => { const a = t * 0.06; return new THREE.Vector3(Math.cos(a) * 34, 17 + Math.sin(t * 0.4) * 0.5, Math.sin(a) * 30); };
    this.animProps.push((t) => { carga.position.copy(cargaPos(t)); carga.lookAt(cargaPos(t + 0.3)); });
    this.cargoPos = new THREE.Vector3(34, 17, 0);
    }

    // 18. Campo de Entrenamiento Militar (@drip.sami_ozi: «obvio que el indigente, o sea yo, va a dar las lecciones»)
    {
    const cs = this.#findClearSpot(this.#distrito('militar', 1), 3.6, plots, 1.1);
    const campo = new THREE.Group();
    const tierra = new THREE.Mesh(new THREE.BoxGeometry(7, 0.08, 5.6), M('#a16207', { roughness: 1 })); tierra.position.y = 0.04; campo.add(tierra);
    const madera = M('#78350f');
    for (let i = 0; i < 7; i++) { const k = i / 6;
      [[-3.5 + k * 7, -2.8], [-3.5 + k * 7, 2.8]].forEach(([px, pz]) => { const poste = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.1), madera); poste.position.set(px, 0.35, pz); campo.add(poste); }); }
    [-2.0, 0.2].forEach((wx) => { const muro = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.0, 1.8), madera); muro.position.set(wx, 0.5, -0.6); campo.add(muro); });
    for (let i = 0; i < 6; i++) { const llanta = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.1, 5, 10), M('#111827')); llanta.rotation.x = Math.PI / 2;
      llanta.position.set(1.4 + (i % 2) * 0.65, 0.12, -1.6 + Math.floor(i / 2) * 0.75); campo.add(llanta); }
    const marco = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), madera); marco.position.set(-1.0, 1.9, 1.6); campo.add(marco);
    [-2.1, 0.1].forEach((px) => { const pt = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.9, 0.12), madera); pt.position.set(px, 0.95, 1.6); campo.add(pt); });
    for (let i = 0; i < 4; i++) { const cuerda = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 4), M('#d6d3d1')); cuerda.position.set(-1.8 + i * 0.5, 1.15, 1.6); campo.add(cuerda); }
    const mastil = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), M('#9ca3af')); mastil.position.set(3.1, 1.5, 2.3); campo.add(mastil);
    const banderin = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.03), M('#4d7c0f')); banderin.geometry.translate(0.45, 0, 0); banderin.position.set(3.15, 2.7, 2.3); campo.add(banderin);
    const pizarra = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.06), M('#14532d')); pizarra.position.set(2.6, 0.9, -2.3); campo.add(pizarra);
    campo.position.set(cs.x, cs.y, cs.z);
    g.add(campo);
    this.animProps.push((t) => { banderin.rotation.y = Math.sin(t * 2.8) * 0.3; });
    this.addObstacle(cs.x, cs.z, 4.4);
    this.trainingPos = new THREE.Vector3(cs.x, cs.y, cs.z);
    this.#label('🪖 CAMPO DE ENTRENAMIENTO (@drip.sami_ozi)', new THREE.Vector3(cs.x, cs.y + 3.4, cs.z), 'lbl lbl-building');
    }

    // 19. Parque de Paneles Solares (@menor_brooklyn.v_: «una planta electrónica y paneles solares»)
    {
    const ps = this.#findClearSpot(this.#distrito('industria', 1), 3.2, plots, 1.1); // distrito industrial (noroeste)
    const parque = new THREE.Group();
    const placa = M('#1e3a8a', { emissive: '#1d4ed8', emissiveIntensity: 0.25, metalness: 0.5, roughness: 0.3 });
    for (let fila = 0; fila < 3; fila++) for (let col = 0; col < 4; col++) {
      const pnl = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.8), placa); pnl.position.set(-2.1 + col * 1.4, 0.75, -1.4 + fila * 1.4); pnl.rotation.x = -0.5; parque.add(pnl);
      const pie = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), M('#9ca3af')); pie.position.set(-2.1 + col * 1.4, 0.35, -1.4 + fila * 1.4); parque.add(pie);
    }
    const caseta = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.9), M('#e5e7eb')); caseta.position.set(3.4, 0.5, 0); parque.add(caseta);
    const rayo = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.04), M('#facc15', { emissive: '#f59e0b', emissiveIntensity: 1.0 })); rayo.position.set(3.4, 0.6, 0.47); parque.add(rayo);
    parque.position.set(ps.x, ps.y, ps.z);
    g.add(parque);
    this.addObstacle(ps.x, ps.z, 4.4);
    this.solarPos = new THREE.Vector3(ps.x, ps.y, ps.z);
    this.#label('☀️ PANELES SOLARES (@menor_brooklyn.v_)', new THREE.Vector3(ps.x, ps.y + 2.6, ps.z), 'lbl lbl-building');
    }

    // 20. Dinosaurio Robot (@kevinxdd152) paseando por la pradera, diseño propio de la isla
    {
    const ds = this.#findClearSpot(this.#distrito('militar', 2), 2.6, plots, 1.1);
    const dino = new THREE.Group();
    const acero = M('#57534e', { roughness: 0.5, metalness: 0.5 }); const cobre = M('#c2410c', { roughness: 0.45, metalness: 0.4 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.0, 2.2), acero); torso.position.y = 1.7; dino.add(torso);
    const cuello = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.9), acero); cuello.position.set(0, 2.1, 1.35); cuello.rotation.x = -0.4; dino.add(cuello);
    const cabeza = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.6, 1.1), cobre); cabeza.position.set(0, 2.4, 2.0); dino.add(cabeza);
    const mandibula = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.9), acero); mandibula.position.set(0, 2.05, 2.05); dino.add(mandibula);
    [-0.25, 0.25].forEach((ox) => { const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), M('#22d3ee', { emissive: '#06b6d4', emissiveIntensity: 2.0 })); ojo.position.set(ox, 2.55, 2.5); dino.add(ojo); });
    const cola = new THREE.Mesh(new THREE.ConeGeometry(0.4, 2.4, 6), acero); cola.rotation.x = -Math.PI / 2 - 0.15; cola.position.set(0, 1.75, -2.2); dino.add(cola);
    for (let i = 0; i < 4; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.35), cobre); pl.position.set(0, 2.35, 0.8 - i * 0.55); dino.add(pl); }
    const patas = [];
    [-0.45, 0.45].forEach((lx) => { const pata = new THREE.Mesh(new THREE.BoxGeometry(0.32, 1.3, 0.45), cobre); pata.geometry.translate(0, -0.65, 0); pata.position.set(lx, 1.3, 0.1); dino.add(pata); patas.push(pata); });
    dino.position.set(ds.x, ds.y, ds.z);
    g.add(dino);
    this.animProps.push((t) => { dino.rotation.y = Math.sin(t * 0.25) * 0.8; patas[0].rotation.x = Math.sin(t * 2) * 0.25; patas[1].rotation.x = -Math.sin(t * 2) * 0.25; cabeza.rotation.x = Math.sin(t * 0.9) * 0.08; });
    this.addObstacle(ds.x, ds.z, 3.2);
    this.dinoPos = new THREE.Vector3(ds.x, ds.y, ds.z);
    this.#label('🦖🤖 DINOSAURIO ROBOT (@kevinxdd152)', new THREE.Vector3(ds.x, ds.y + 3.6, ds.z), 'lbl lbl-building');
    }

    // 21. Concesionario de Coches y Motos (@daniel.l83o)
    {
    const cs = this.#findClearSpot(this.#distrito('motor', 0), 3.2, plots, 1.1);
    const conc = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.1, 4.2), M('#475569')); base.position.y = 0.05; conc.add(base);
    const local = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.2), M('#f8fafc')); local.position.set(-0.9, 0.9, -0.8); conc.add(local);
    const vitrina = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 0.08), M('#38bdf8', { emissive: '#0284c7', emissiveIntensity: 0.45 })); vitrina.position.set(-0.9, 0.85, 0.32); conc.add(vitrina);
    const letrero = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.45, 0.14), M('#ef4444', { emissive: '#dc2626', emissiveIntensity: 0.5 })); letrero.position.set(-0.9, 2.05, 0.25); conc.add(letrero);
    // Dos coches + 1 moto en exhibición
    [[-1.6, 1.2, '#ef4444'], [0.4, 1.2, '#facc15']].forEach(([cx, cz, col]) => {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.38, 0.68), M(col)); body.position.y = 0.26; car.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.28, 0.6), M('#cbd5e1')); cab.position.set(-0.05, 0.55, 0); car.add(cab);
      car.position.set(cx, 0.1, cz); car.rotation.y = 0.2; conc.add(car);
    });
    const moto = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.32, 0.22), M('#2563eb')); moto.position.set(1.85, 0.26, 0.9); moto.rotation.y = -0.35; conc.add(moto);
    conc.position.set(cs.x, cs.y, cs.z);
    g.add(conc);
    this.addObstacle(cs.x, cs.z, 3.2);
    this.concesionarioPos = new THREE.Vector3(cs.x, cs.y, cs.z);
    this.#label('🚗🏍️ CONCESIONARIO (@daniel.l83o)', new THREE.Vector3(cs.x, cs.y + 3.0, cs.z), 'lbl lbl-building');
    }

    // 22. Casa / campamento bajo el puente (@acostaajmaximo.__) junto a la ribera este del puente
    {
    const bx = riverX(BRIDGE_Z) + RIVER.half + 2.3, bz = BRIDGE_Z - 1.9;
    const by = Math.max(this.groundAt(bx, bz), 1.05);
    const camp = new THREE.Group();
    const carpa = new THREE.Mesh(new THREE.ConeGeometry(0.95, 1.15, 4), M('#f59e0b'));
    carpa.rotation.y = Math.PI / 4; carpa.position.y = 0.58; camp.add(carpa);
    const fog = new THREE.Mesh(new THREE.SphereGeometry(0.18, 5, 4), M('#ef4444', { emissive: '#f97316', emissiveIntensity: 1.4 }));
    fog.position.set(0.95, 0.2, 0.65); camp.add(fog);
    camp.position.set(bx, by, bz);
    g.add(camp);
    this.animProps.push((t) => { fog.scale.setScalar(0.85 + Math.sin(t * 7) * 0.18); });
    this.addObstacle(bx, bz, 1.1);
    this.bajosPuentePos = new THREE.Vector3(bx, by, bz);
    this.#label('⛺ BAJO EL PUENTE (@acostaajmaximo.__)', new THREE.Vector3(bx, by + 1.8, bz), 'lbl lbl-building');
    }

    // 23. Base Nuclear de defensa (pedida por @menor_brooklyn.v_: «una base nuclear»), distrito industrial/militar al oeste
    {
    const bs = this.#findClearSpot(this.#distrito('industria', 2), 3.6, plots, 1.1);
    const base = new THREE.Group();
    const losa = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.12, 6.0), M('#4b5563')); losa.position.y = 0.06; base.add(losa);
    // Franjas de peligro amarillas/negras en el borde
    for (let i = 0; i < 9; i++) {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.03, 0.3), M(i % 2 ? '#111827' : '#facc15'));
      fr.position.set(-3.2 + i * 0.8, 0.14, 2.85); base.add(fr);
    }
    // Cúpula del reactor
    const muro = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.4, MOVIL ? 10 : 18), M('#e5e7eb')); muro.position.set(-1.6, 0.8, -0.8); base.add(muro);
    const cupula = new THREE.Mesh(new THREE.SphereGeometry(1.5, MOVIL ? 10 : 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#f3f4f6')); cupula.position.set(-1.6, 1.5, -0.8); base.add(cupula);
    const signo = new THREE.Mesh(new THREE.CircleGeometry(0.42, 3), M('#facc15', { emissive: '#f59e0b', emissiveIntensity: 0.6 })); signo.position.set(-1.6, 0.9, 0.72); base.add(signo);
    // Torre de refrigeración con vapor
    const torre = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.05, 2.6, MOVIL ? 8 : 14, 1, true), M('#d1d5db', { side: THREE.DoubleSide })); torre.position.set(1.9, 1.3, -1.1); base.add(torre);
    const vapor = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), M('#ffffff', { transparent: true, opacity: 0.55 })); vapor.position.set(1.9, 3.0, -1.1); base.add(vapor);
    // Silo de defensa con la puerta abierta y el cohete asomando
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.3, 12), M('#374151')); silo.position.set(1.9, 0.2, 1.6); base.add(silo);
    const cohete = new THREE.Group();
    const cuerpo = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 10), M('#f8fafc')); cuerpo.position.y = 0.8; cohete.add(cuerpo);
    const punta = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 10), M('#dc2626')); punta.position.y = 1.9; cohete.add(punta);
    cohete.position.set(1.9, -0.4, 1.6); base.add(cohete);
    const luz = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), M('#ef4444', { emissive: '#ef4444', emissiveIntensity: 2.0 })); luz.position.set(3.2, 0.35, 2.4); base.add(luz);
    base.position.set(bs.x, bs.y, bs.z);
    g.add(base);
    this.animProps.push((t) => {
      vapor.position.y = 3.0 + (t * 0.6 % 1.2); vapor.material.opacity = 0.55 * (1 - (t * 0.6 % 1.2) / 1.2);
      cohete.position.y = -0.4 + (Math.sin(t * 0.5) * 0.5 + 0.5) * 0.5; // asoma y se esconde, «por si acaso»
      luz.material.emissiveIntensity = (Math.sin(t * 5) > 0) ? 2.2 : 0.2;
    });
    this.addObstacle(bs.x, bs.z, 4.6);
    this.nuclearPos = new THREE.Vector3(bs.x, bs.y, bs.z);
    this.#label('☢️ BASE NUCLEAR DE DEFENSA (@menor_brooklyn.v_)', new THREE.Vector3(bs.x, bs.y + 4.2, bs.z), 'lbl lbl-building');
    }

    this.root.add(g);
  }

  // ---------- Pedidos de los seguidores del 17/11 (se construye tal cual lo pidieron) ----------
  // Cada obra queda en this.obrasPedidas[clave] = { pos, d, h } → toma del modo Reel «obra@clave».
  #pedidos17(isla, plots = []) {
    const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...extra });
    const g = new THREE.Group(); this.obrasPedidas = {};
    const box = (par, w, h, d, c, x, y, z, ex) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c, ex)); m.position.set(x, y, z); m.castShadow = !MOVIL; par.add(m); return m; };
    const cyl = (par, rt, rb, h, c, x, y, z, seg = 10, ex) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), M(c, ex)); m.position.set(x, y, z); m.castShadow = !MOVIL; par.add(m); return m; };
    const sph = (par, r, c, x, y, z, ex) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), M(c, ex)); m.position.set(x, y, z); par.add(m); return m; };
    const cone = (par, r, h, c, x, y, z, seg = 8, ex) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), M(c, ex)); m.position.set(x, y, z); par.add(m); return m; };
    // Coloca un grupo en un hueco libre, con obstáculo, etiqueta y toma
    const poner = (clave, grupo, spot, radio, texto, d = 9, h = 4, rotY = null) => {
      grupo.position.set(spot.x, spot.y, spot.z);
      grupo.rotation.y = rotY ?? Math.atan2(spot.x, spot.z) + Math.PI; // de frente al centro de la isla
      g.add(grupo); this.addObstacle(spot.x, spot.z, radio);
      const pos = new THREE.Vector3(spot.x, spot.y, spot.z);
      this.obrasPedidas[clave] = { pos, d, h };
      if (texto) this.#label(texto, new THREE.Vector3(spot.x, spot.y + h + 0.6, spot.z), 'lbl lbl-building');
      return pos;
    };
    const libre = (distrito, slot, radio) => this.#findClearSpot(this.#distrito(distrito, slot), radio, plots, 1.05);
    const cerca = (p, radio, dist = 6) => this.#findClearSpot([0, 1, 2, 3, 4, 5, 6, 7].map((i) => [p.x + Math.cos(i * 0.785) * dist, p.z + Math.sin(i * 0.785) * dist]), radio, plots, 1.0);
    // Personaje sencillo (cuerpo, cabeza, brazos)
    const persona = (par, ropa, piel, x, z, rot = 0, pantalon = '#1f2937') => {
      const p = new THREE.Group();
      box(p, 0.22, 0.5, 0.2, pantalon, -0.08, 0.25, 0); box(p, 0.22, 0.5, 0.2, pantalon, 0.08, 0.25, 0); // piernas
      box(p, 0.46, 0.6, 0.3, ropa, 0, 0.8, 0); sph(p, 0.2, piel, 0, 1.3, 0);
      box(p, 0.14, 0.5, 0.14, ropa, -0.31, 0.82, 0); box(p, 0.14, 0.5, 0.14, ropa, 0.31, 0.82, 0);
      p.position.set(x, 0, z); p.rotation.y = rot; par.add(p); return p;
    };
    // Caza genérico (fuselaje, alas, cola, cabina)
    const caza = (col, cabina = '#0f172a', escala = 1) => {
      const j = new THREE.Group();
      const f = cyl(j, 0.32, 0.42, 4.2, col, 0, 0, 0, 8); f.rotation.x = Math.PI / 2;
      const n = cone(j, 0.32, 1.1, col, 0, 0, 2.6, 8); n.rotation.x = Math.PI / 2;
      box(j, 4.2, 0.08, 1.3, col, 0, -0.05, -0.2); box(j, 1.8, 0.07, 0.6, col, 0, 0, -1.9); box(j, 0.08, 1.0, 0.8, col, 0, 0.5, -1.8);
      sph(j, 0.3, cabina, 0, 0.3, 1.0, { roughness: 0.2 }).scale.set(1, 0.8, 1.8);
      j.scale.setScalar(escala); return j;
    };

    if (isla === 'ig') {
      // 1. Pizzería (@b_arry_allen: «Quiero tener una pizzeria»)
      { const p = new THREE.Group();
        box(p, 3.4, 2.0, 2.8, '#fef3c7', 0, 1.0, 0); box(p, 3.6, 0.3, 3.0, '#b91c1c', 0, 2.15, 0);
        for (let i = 0; i < 5; i++) box(p, 0.7, 0.12, 0.5, i % 2 ? '#ffffff' : '#dc2626', -1.4 + i * 0.7, 1.75, 1.6); // toldo a rayas
        box(p, 0.8, 1.2, 0.08, '#78350f', 0, 0.6, 1.42); // puerta
        const pz = cyl(p, 1.1, 1.1, 0.18, '#fbbf24', 0, 2.75, 0, 16); pz.rotation.x = 0.35; // la pizza gigante del techo
        for (let i = 0; i < 6; i++) { const a = i * 1.05; const pe = cyl(pz, 0.16, 0.16, 0.06, '#b91c1c', Math.cos(a) * 0.6, 0.12, Math.sin(a) * 0.6, 8); pe.rotation.x = 0; }
        cyl(p, 0.35, 0.4, 0.9, '#7f1d1d', 1.3, 2.6, -0.9); // horno de leña con chimenea
        box(p, 1.2, 0.08, 0.8, '#78350f', -2.6, 0.75, 1.2); cyl(p, 0.06, 0.06, 0.7, '#78350f', -2.6, 0.38, 1.2); // mesita de terraza
        persona(p, '#ffffff', '#c68642', 1.0, 1.9, 0, '#111827');
        poner('pizzeria', p, libre('ocio', 2, 2.6), 2.6, '🍕 PIZZERÍA DE @b_arry_allen', 8, 3.2); }

      // 2. F-16 con un perrito de piloto (@alobandio330_) — da vueltas sobre la isla
      { const j = caza('#94a3b8', '#0f172a', 1.1);
        const perro = new THREE.Group(); sph(perro, 0.24, '#b45309', 0, 0, 0); sph(perro, 0.12, '#78350f', 0, -0.04, 0.2);
        box(perro, 0.08, 0.2, 0.06, '#78350f', -0.18, 0.14, 0); box(perro, 0.08, 0.2, 0.06, '#78350f', 0.18, 0.14, 0);
        perro.position.set(0, 0.62, 1.0); j.add(perro);
        g.add(j); const pos = new THREE.Vector3(); this.obrasPedidas.f16 = { pos, d: 7, h: 1, vuela: true };
        const lbl = this.#label('✈️🐶 F-16 CON PERRITO PILOTO (@alobandio330_)', new THREE.Vector3(), 'lbl lbl-building');
        const Rv = this.R * 0.55;
        this.animProps.push((t) => { const a = t * 0.18; j.position.set(Math.cos(a) * Rv, 16 + Math.sin(t * 0.7) * 1.2, Math.sin(a) * Rv);
          j.rotation.set(0, Math.atan2(-Math.sin(a), Math.cos(a)), 0); pos.copy(j.position); lbl.position.set(pos.x, pos.y + 1.6, pos.z); }); }

      // 3. F-160 Raiju (@sth_hxto3) — caza futurista estacionado en su plataforma
      { const p = new THREE.Group(); box(p, 6.2, 0.12, 5.0, '#334155', 0, 0.06, 0);
        for (let i = 0; i < 4; i++) box(p, 0.5, 0.03, 0.2, '#facc15', -1.8 + i * 1.2, 0.14, 2.2);
        const j = caza('#1e1b4b', '#38bdf8', 1.15); j.position.set(0, 0.75, 0); p.add(j);
        box(j, 0.9, 0.1, 0.5, '#38bdf8', 0, 0, -2.25, { emissive: '#0ea5e9', emissiveIntensity: 1.4 }); // motores azules
        box(j, 3.4, 0.05, 0.12, '#38bdf8', 0, 0.05, 0.3, { emissive: '#0ea5e9', emissiveIntensity: 1.0 }); // filo de las alas
        poner('raiju', p, libre('aereo', 1, 3.2), 3.2, '⚡ F-160 RAIJU (@sth_hxto3)', 8, 2.2); }

      // 4. Puerto de buques de guerra (@kel______f0) — en la costa sureste, con dos buques
      { const a = THREE.MathUtils.degToRad(40); let r = this.R * 0.82;
        while (r < this.R * 1.1 && this.height(Math.cos(a) * r, Math.sin(a) * r) > 0.4) r += 0.5; // hasta la orilla
        const ox = Math.cos(a) * r, oz = Math.sin(a) * r;
        const p = new THREE.Group();
        box(p, 2.0, 0.3, 9, '#78716c', 0, 0.15, 3.5); // muelle de hormigón hacia el mar
        box(p, 1.2, 1.6, 1.2, '#57534e', 0, 1.0, -0.4); // garita del puerto
        const buque = (zz, xx) => { const b = new THREE.Group();
          box(b, 1.6, 0.8, 6.2, '#6b7280', 0, 0.4, 0); cone(b, 0.8, 1.4, '#6b7280', 0, 0.4, 3.8, 4).rotation.x = Math.PI / 2;
          box(b, 1.0, 0.9, 1.6, '#9ca3af', 0, 1.2, -0.8); box(b, 0.5, 0.9, 0.5, '#9ca3af', 0, 2.0, -0.8);
          const c1 = cyl(b, 0.12, 0.12, 1.4, '#374151', 0, 1.0, 1.6, 6); c1.rotation.x = Math.PI / 2; cyl(b, 0.35, 0.35, 0.3, '#4b5563', 0, 0.95, 1.2, 8);
          b.position.set(xx, 0.25, zz); p.add(b); return b; };
        const b1 = buque(4.5, -2.4), b2 = buque(4.0, 2.4);
        this.animProps.push((t) => { b1.position.y = 0.25 + Math.sin(t * 1.1) * 0.08; b2.position.y = 0.25 + Math.sin(t * 1.1 + 1) * 0.08; });
        poner('puertoguerra', p, { x: ox, y: Math.max(0.3, this.height(ox, oz)), z: oz }, 3.0, '⚓ PUERTO DE BUQUES DE GUERRA (@kel______f0)', 13, 3, Math.atan2(Math.cos(a), Math.sin(a))); }

      // 5. Base militar (@javiercordoba01)
      { const p = new THREE.Group(); box(p, 7, 0.1, 6, '#a8a29e', 0, 0.05, 0);
        for (let i = 0; i < 8; i++) { cyl(p, 0.05, 0.05, 1.0, '#57534e', -3.4 + i * 0.97, 0.5, -2.9, 5); cyl(p, 0.05, 0.05, 1.0, '#57534e', -3.4 + i * 0.97, 0.5, 2.9, 5); }
        box(p, 3.2, 1.2, 1.6, '#4d5d33', -1.4, 0.6, -1.2); const tech = cyl(p, 0.8, 0.8, 3.2, '#3f4b2a', -1.4, 1.2, -1.2, 10); tech.rotation.z = Math.PI / 2; // barracón
        box(p, 0.9, 3.2, 0.9, '#57534e', 2.4, 1.6, -1.8); box(p, 1.3, 0.8, 1.3, '#4d5d33', 2.4, 3.5, -1.8); // torre de vigía
        cyl(p, 0.05, 0.05, 3.4, '#d1d5db', 2.6, 1.7, 1.8, 5); box(p, 1.0, 0.6, 0.04, '#166534', 3.1, 3.1, 1.8);
        persona(p, '#4d5d33', '#8d5524', 0.4, 1.4, 0.6); persona(p, '#4d5d33', '#f1c27d', -0.6, 1.8, -0.4);
        poner('basejavier', p, libre('militar', 3, 3.8), 3.8, '🪖 BASE MILITAR DE @javiercordoba01', 10, 4); }

      // 6. El pterodáctilo de Ciudad Juárez (@net0n_4) — sobrevuela la isla aleteando
      { const pt = new THREE.Group(); const col = '#7c5c3b';
        const cu = box(pt, 0.5, 0.4, 1.6, col, 0, 0, 0); cu.castShadow = true;
        box(pt, 0.35, 0.3, 0.7, col, 0, 0.2, 1.0); cone(pt, 0.12, 0.9, '#d6b48a', 0, 0.2, 1.75, 4).rotation.x = Math.PI / 2; cone(pt, 0.1, 0.7, col, 0, 0.55, 0.85, 4).rotation.x = -0.6; // pico y cresta
        const alaI = new THREE.Group(), alaD = new THREE.Group(); box(alaI, 3.2, 0.06, 1.1, '#8b6b47', -1.6, 0, 0); box(alaD, 3.2, 0.06, 1.1, '#8b6b47', 1.6, 0, 0);
        pt.add(alaI, alaD); pt.scale.setScalar(1.4); g.add(pt);
        const pos = new THREE.Vector3(); this.obrasPedidas.pterodactilo = { pos, d: 8, h: 1, vuela: true };
        const lbl = this.#label('🦖 PTERODÁCTILO DE CIUDAD JUÁREZ (@net0n_4)', new THREE.Vector3(), 'lbl lbl-building');
        const Rv = this.R * 0.35;
        this.animProps.push((t) => { const a = -t * 0.12 + 2; pt.position.set(Math.cos(a) * Rv, 13 + Math.sin(t) * 0.8, Math.sin(a) * Rv);
          pt.rotation.y = Math.atan2(Math.sin(a), -Math.cos(a)); const f = Math.sin(t * 4) * 0.5; alaI.rotation.z = f; alaD.rotation.z = -f;
          pos.copy(pt.position); lbl.position.set(pos.x, pos.y + 1.8, pos.z); }); }

      // 7. Torretas antiaéreas + gato negro de pecho blanco muy gordo (@thomasjaime25), junto a su tanque
      { const p = new THREE.Group();
        const torreta = (x, z) => { const t = new THREE.Group(); cyl(t, 0.7, 0.9, 0.5, '#57534e', 0, 0.25, 0, 8); box(t, 0.9, 0.5, 0.9, '#4d5d33', 0, 0.75, 0);
          for (const s of [-0.18, 0.18]) { const c = cyl(t, 0.07, 0.07, 1.6, '#1f2937', s, 1.25, 0.4, 6); c.rotation.x = 1.0; }
          t.position.set(x, 0, z); p.add(t); return t; };
        const ts = [torreta(-2.4, 0), torreta(0, -1.6), torreta(2.4, 0)];
        const gato = new THREE.Group(); const gm = '#111111';
        sph(gato, 0.55, gm, 0, 0.55, 0).scale.set(1.15, 0.95, 1.2); sph(gato, 0.32, '#f8fafc', 0, 0.55, 0.42).scale.set(1, 1.2, 0.6); // panza y pecho blanco
        sph(gato, 0.32, gm, 0, 1.15, 0.35); cone(gato, 0.09, 0.2, gm, -0.16, 1.45, 0.35, 4); cone(gato, 0.09, 0.2, gm, 0.16, 1.45, 0.35, 4);
        sph(gato, 0.05, '#facc15', -0.1, 1.2, 0.64); sph(gato, 0.05, '#facc15', 0.1, 1.2, 0.64);
        gato.position.set(0, 1.0, -1.6); p.add(gato);
        this.animProps.push((t) => { ts.forEach((tt, i) => { tt.rotation.y = Math.sin(t * 0.4 + i * 2) * 0.9; }); gato.scale.y = 1 + Math.sin(t * 1.5) * 0.04; });
        const base = this.tankPos || new THREE.Vector3(-20, 1.5, -30);
        poner('torretas', p, cerca(base, 3.4, 7), 3.4, '🎯🐈‍⬛ TORRETAS ANTIAÉREAS + GATO GORDO (@thomasjaime25)', 8, 2.6); }

      // 8. Muro de contención en la orilla + búnkeres soviéticos (@nedi_montoya), por la costa norte
      { const p = new THREE.Group(); let primero = null;
        for (let deg = -140; deg <= -60; deg += 2.2) {
          const a = THREE.MathUtils.degToRad(deg); let r = this.R * 0.7;
          while (r < this.R * 1.05 && this.height(Math.cos(a) * r, Math.sin(a) * r) > 1.0) r += 0.4;
          r -= 1.2; const x = Math.cos(a) * r, z = Math.sin(a) * r, y = this.height(x, z);
          if (y < 0.5 || this.inRiver(x, z, 1.5)) continue;
          const seg = box(p, 1.9, 2.4, 0.6, '#9ca3af', x, y + 1.1, z); seg.rotation.y = -a + Math.PI / 2;
          box(p, 1.9, 0.25, 0.8, '#6b7280', x, y + 2.4, z).rotation.y = -a + Math.PI / 2;
          if (!primero) primero = { x, y, z };
          if (Math.round(deg) % 20 === 0) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M('#78716c'));
            const bx = Math.cos(a) * (r - 2.2), bz = Math.sin(a) * (r - 2.2); b.position.set(bx, this.height(bx, bz), bz); p.add(b);
            box(p, 0.7, 0.18, 0.1, '#111827', bx + Math.cos(a) * 0.85, this.height(bx, bz) + 0.4, bz + Math.sin(a) * 0.85).rotation.y = -a + Math.PI / 2; }
        }
        g.add(p);
        const a = THREE.MathUtils.degToRad(-100); const mx = Math.cos(a) * this.R * 0.82, mz = Math.sin(a) * this.R * 0.82;
        const pos = new THREE.Vector3(mx, Math.max(1, this.height(mx, mz)), mz); this.obrasPedidas.muro = { pos, d: 11, h: 4 };
        this.#label('🧱 MURO DE CONTENCIÓN + BÚNKERES (@nedi_montoya)', new THREE.Vector3(mx, pos.y + 4, mz), 'lbl lbl-building'); }

      // 9. Cuartel de las Fuerzas Especiales (@el_papu.21: «yo quiero ser el que guía a las fuerzas especiales»)
      { const p = new THREE.Group(); box(p, 6, 0.1, 5, '#57534e', 0, 0.05, 0);
        box(p, 3.6, 2.0, 2.4, '#1f2937', 0, 1.0, -1.0); box(p, 3.8, 0.2, 2.6, '#111827', 0, 2.1, -1.0);
        box(p, 1.0, 0.5, 0.05, '#facc15', 0, 1.7, 0.22); // insignia
        for (let i = 0; i < 3; i++) persona(p, '#111827', ['#8d5524', '#f1c27d', '#c68642'][i], -1.2 + i * 1.2, 1.2, 0, '#1f2937');
        persona(p, '#14532d', '#c68642', 0, 2.3, Math.PI, '#14532d'); // el guía, mirando a su escuadrón
        poner('fuerzasespeciales', p, libre('militar', 4, 3.2), 3.2, '🎖️ FUERZAS ESPECIALES · GUÍA @el_papu.21', 8, 2.8); }

      // 10. Guarida de la red criminal (@menor_brooklyn.v_: «una red criminal»)
      { const p = new THREE.Group(); box(p, 3.0, 1.8, 2.6, '#3f3f46', 0, 0.9, 0); box(p, 3.2, 0.15, 2.8, '#27272a', 0, 1.85, 0);
        box(p, 0.8, 1.2, 0.06, '#18181b', 0.6, 0.6, 1.32); sph(p, 0.14, '#ef4444', -0.6, 1.4, 1.35, { emissive: '#ef4444', emissiveIntensity: 2 }); // foco rojo
        box(p, 2.4, 1.1, 1.2, '#09090b', -0.2, 0.75, 2.6); for (const [x, z] of [[-1, 2.0], [0.6, 2.0], [-1, 3.2], [0.6, 3.2]]) cyl(p, 0.25, 0.25, 0.2, '#111', x, 0.25, z, 8).rotation.x = Math.PI / 2; // furgoneta negra
        persona(p, '#18181b', '#f1c27d', 1.8, 1.6, -0.5, '#09090b');
        poner('redcriminal', p, libre('sur', 0, 2.8), 2.8, '🕶️ RED CRIMINAL DE @menor_brooklyn.v_', 8, 2.4); }
    }

    if (isla === 'tiktok') {
      // 1. Panadería (@pan_de_leche777: «yo quiero estar con una panadería»)
      { const p = new THREE.Group(); box(p, 3.0, 1.9, 2.4, '#fde68a', 0, 0.95, 0); const t = cone(p, 2.2, 1.0, '#92400e', 0, 2.4, 0, 4); t.rotation.y = Math.PI / 4;
        const pan = cyl(p, 0.35, 0.35, 2.6, '#d97706', 0, 3.2, 0, 8); pan.rotation.z = Math.PI / 2; sph(p, 0.35, '#d97706', -1.3, 3.2, 0); sph(p, 0.35, '#d97706', 1.3, 3.2, 0); // barra de pan gigante
        box(p, 0.8, 1.1, 0.06, '#78350f', 0, 0.55, 1.22); box(p, 2.4, 0.5, 0.6, '#fef3c7', 0, 0.5, 1.6); // mostrador con panes
        for (let i = 0; i < 4; i++) sph(p, 0.14, '#b45309', -0.9 + i * 0.6, 0.85, 1.6);
        poner('panaderia', p, libre('ocio', 0, 2.4), 2.4, '🥖 PANADERÍA DE @pan_de_leche777', 7, 3.6); }

      // 2. Mansión y auto de lujo (@nico_gamers: «yo quiero ser rico con una mansión y auto de lujo»)
      { const p = new THREE.Group(); box(p, 5, 2.2, 3.4, '#f8fafc', 0, 1.1, 0); box(p, 3.6, 1.6, 2.6, '#f1f5f9', 0, 3.0, -0.2);
        box(p, 5.2, 0.2, 3.6, '#334155', 0, 2.25, 0); box(p, 3.8, 0.2, 2.8, '#334155', 0, 3.9, -0.2);
        for (const x of [-1.6, 1.6]) cyl(p, 0.15, 0.15, 2.2, '#e2e8f0', x, 1.1, 1.85, 8);
        const auto = new THREE.Group(); box(auto, 1.0, 0.35, 2.0, '#eab308', 0, 0.35, 0, { metalness: 0.6, roughness: 0.3 }); box(auto, 0.8, 0.3, 0.9, '#1e293b', 0, 0.65, -0.1);
        for (const [x, z] of [[-0.5, 0.65], [0.5, 0.65], [-0.5, -0.65], [0.5, -0.65]]) cyl(auto, 0.2, 0.2, 0.15, '#111', x, 0.2, z, 8).rotation.z = Math.PI / 2;
        auto.position.set(2.0, 0, 3.2); auto.rotation.y = 0.4; p.add(auto);
        poner('mansionnico', p, libre('sur', 1, 3.6), 3.6, '💰 MANSIÓN + AUTO DE LUJO (@nico_gamers)', 10, 4.2); }

      // 3. Auto de lujo en la puerta de la casa de @mrbomstudios
      { const h = this.houseIndex.get('mrbomstudios');
        if (h) { const auto = new THREE.Group(); box(auto, 1.0, 0.32, 2.0, '#dc2626', 0, 0.35, 0, { metalness: 0.6, roughness: 0.3 }); box(auto, 0.8, 0.28, 0.9, '#111827', 0, 0.63, -0.1);
          for (const [x, z] of [[-0.5, 0.65], [0.5, 0.65], [-0.5, -0.65], [0.5, -0.65]]) cyl(auto, 0.2, 0.2, 0.15, '#111', x, 0.2, z, 8).rotation.z = Math.PI / 2;
          const sp = cerca(h.pos, 1.0, 2.6); poner('automrbom', auto, sp, 1.0, '🏎️ AUTO DE LUJO DE @mrbomstudios', 5, 1.2); } }

      // 4. Casa de dos pisos con piscina y golden retriever (@mateooo.ce)
      { const p = new THREE.Group(); box(p, 3.0, 1.6, 2.6, '#bae6fd', 0, 0.8, 0); box(p, 3.0, 1.4, 2.6, '#e0f2fe', 0, 2.3, 0);
        const t = cone(p, 2.3, 1.1, '#1d4ed8', 0, 3.55, 0, 4); t.rotation.y = Math.PI / 4;
        box(p, 2.6, 0.1, 1.6, '#e5e7eb', 0, 0.05, 2.4); box(p, 2.2, 0.06, 1.2, '#38bdf8', 0, 0.12, 2.4, { emissive: '#0ea5e9', emissiveIntensity: 0.25 }); // piscina
        const perro = new THREE.Group(); const dc = '#e0a84a';
        box(perro, 0.35, 0.3, 0.7, dc, 0, 0.35, 0); sph(perro, 0.18, dc, 0, 0.6, 0.4); box(perro, 0.1, 0.22, 0.1, dc, 0, 0.45, -0.42).rotation.x = -0.7;
        for (const [x, z] of [[-0.12, 0.25], [0.12, 0.25], [-0.12, -0.25], [0.12, -0.25]]) box(perro, 0.08, 0.25, 0.08, dc, x, 0.12, z);
        perro.position.set(1.8, 0, 1.6); p.add(perro);
        this.animProps.push((t) => { perro.rotation.y = Math.sin(t * 0.8) * 0.8; perro.position.y = Math.abs(Math.sin(t * 3)) * 0.08; });
        poner('casamateo', p, libre('sur', 2, 3.0), 3.0, '🏊🐕 CASA DE 2 PISOS + GOLDEN (@mateooo.ce)', 8, 4.0); }

      // 5. Lancha (@thomasscholtbach6) frente a la playa
      { const a = Math.PI; let r = this.R * 0.85; while (r < this.R * 1.2 && this.height(Math.cos(a) * r, Math.sin(a) * r) > 0.2) r += 0.5;
        const x = Math.cos(a) * (r + 3), z = Math.sin(a) * (r + 3) + 4;
        const l = new THREE.Group(); box(l, 1.2, 0.5, 3.2, '#f8fafc', 0, 0.25, 0); cone(l, 0.6, 1.0, '#f8fafc', 0, 0.25, 2.1, 4).rotation.x = Math.PI / 2;
        box(l, 1.25, 0.12, 3.25, '#ef4444', 0, 0.35, 0); box(l, 0.9, 0.5, 0.06, '#7dd3fc', 0, 0.7, 0.5); box(l, 0.4, 0.5, 0.4, '#111827', 0, 0.3, -1.8);
        const pos = poner('lancha', l, { x, y: 0.15, z }, 1.5, '🚤 LANCHA DE @thomasscholtbach6', 6, 1.2, 0.3);
        this.animProps.push((t) => { l.position.y = 0.15 + Math.sin(t * 1.6) * 0.1; l.rotation.z = Math.sin(t * 1.3) * 0.06; pos.y = l.position.y; }); }

      // 6. Saitama (@el.pichula9324: «quiero a saitama») — calvo, traje amarillo, guantes rojos y capa blanca
      { const p = new THREE.Group(); box(p, 1.6, 0.6, 1.6, '#78716c', 0, 0.3, 0);
        const s = new THREE.Group(); box(s, 0.24, 0.6, 0.22, '#facc15', -0.1, 0.3, 0); box(s, 0.24, 0.6, 0.22, '#facc15', 0.1, 0.3, 0);
        box(s, 0.5, 0.7, 0.32, '#facc15', 0, 0.95, 0); sph(s, 0.25, '#fcd9b6', 0, 1.55, 0); box(s, 0.52, 0.1, 0.34, '#111827', 0, 0.62, 0);
        box(s, 0.14, 0.5, 0.14, '#facc15', -0.32, 0.98, 0); const puño = box(s, 0.14, 0.5, 0.14, '#facc15', 0.32, 1.3, 0); puño.rotation.z = 2.6;
        box(s, 0.18, 0.18, 0.18, '#dc2626', -0.32, 0.68, 0); box(s, 0.18, 0.18, 0.18, '#dc2626', 0.45, 1.6, 0);
        const capa = box(s, 0.6, 1.0, 0.04, '#f8fafc', 0, 0.85, -0.2); capa.rotation.x = 0.2;
        s.position.y = 0.6; s.scale.setScalar(1.6); p.add(s);
        this.animProps.push((t) => { capa.rotation.x = 0.25 + Math.sin(t * 3) * 0.12; });
        poner('saitama', p, libre('ocio', 1, 1.4), 1.4, '👊 SAITAMA (@el.pichula9324)', 5, 3.6); }

      // 7. Vaca gigante que escupe fuego (@xxbluecopxx1)
      { const p = new THREE.Group(); const v = new THREE.Group();
        box(v, 1.4, 1.1, 2.4, '#f8fafc', 0, 1.5, 0); for (const [x, y, z] of [[0.71, 1.6, 0.3], [-0.71, 1.4, -0.5], [0.3, 2.06, -0.6]]) box(v, 0.05, 0.5, 0.6, '#111827', x, y, z);
        for (const [x, z] of [[-0.45, 0.8], [0.45, 0.8], [-0.45, -0.8], [0.45, -0.8]]) box(v, 0.3, 1.0, 0.3, '#f8fafc', x, 0.5, z);
        box(v, 0.9, 0.8, 0.8, '#f8fafc', 0, 1.9, 1.5); box(v, 0.7, 0.4, 0.3, '#fda4af', 0, 1.7, 1.95);
        cone(v, 0.08, 0.35, '#e5e7eb', -0.35, 2.4, 1.5, 6); cone(v, 0.08, 0.35, '#e5e7eb', 0.35, 2.4, 1.5, 6);
        const fuego = new THREE.Group(); const f1 = cone(fuego, 0.45, 2.2, '#f97316', 0, 0, 1.1, 8, { emissive: '#f97316', emissiveIntensity: 1.6, transparent: true, opacity: 0.85 }); f1.rotation.x = -Math.PI / 2;
        const f2 = cone(fuego, 0.25, 1.5, '#fde047', 0, 0, 0.8, 8, { emissive: '#facc15', emissiveIntensity: 2, transparent: true, opacity: 0.9 }); f2.rotation.x = -Math.PI / 2;
        fuego.position.set(0, 1.7, 2.1); v.add(fuego); v.scale.setScalar(2.2); p.add(v);
        this.animProps.push((t) => { const k = 0.8 + Math.abs(Math.sin(t * 6)) * 0.4; fuego.scale.set(k, k, 0.7 + Math.abs(Math.sin(t * 2.3)) * 0.6); });
        poner('vacafuego', p, libre('industria', 0, 3.4), 3.4, '🐄🔥 VACA GIGANTE QUE ESCUPE FUEGO (@xxbluecopxx1)', 12, 6); }

      // 8. Cueva subterránea (@.2.0.1.5.2)
      { const p = new THREE.Group(); const roca = new THREE.Mesh(new THREE.DodecahedronGeometry(2.6, 0), M('#78716c')); roca.scale.set(1.3, 0.75, 1.1); roca.position.y = 0.8; p.add(roca);
        box(p, 1.4, 1.4, 0.4, '#0c0a09', 0, 0.7, 2.6); for (let i = 0; i < 3; i++) box(p, 1.2, 0.12, 0.4, '#a8a29e', 0, 0.1 + i * 0.25, 3.4 - i * 0.35); // entrada y escalones
        cyl(p, 0.05, 0.05, 1.0, '#78350f', 1.0, 0.5, 3.0, 5); const llama = sph(p, 0.15, '#f97316', 1.0, 1.1, 3.0, { emissive: '#f97316', emissiveIntensity: 2 });
        this.animProps.push((t) => { llama.scale.setScalar(0.8 + Math.abs(Math.sin(t * 7)) * 0.4); });
        poner('cueva', p, libre('motor', 0, 3.0), 3.0, '🕳️ CUEVA SUBTERRÁNEA (@.2.0.1.5.2)', 8, 2.4); }

      // 9. Tanque (@jorge.monrdez: «un tanque»)
      { const p = new THREE.Group(); const v = '#4b5320';
        for (const s of [-0.75, 0.75]) box(p, 2.6, 0.5, 0.42, '#262626', 0, 0.25, s); box(p, 2.3, 0.6, 1.4, v, 0, 0.62, 0); box(p, 1.2, 0.5, 1.0, v, -0.1, 1.15, 0);
        const c = cyl(p, 0.08, 0.08, 1.6, v, 0.95, 1.15, 0, 6); c.rotation.z = Math.PI / 2;
        poner('tanquejorge', p, libre('militar', 1, 1.8), 1.8, '🪖 TANQUE DE @jorge.monrdez', 6, 1.6); }

      // 10. Mina de uranio para la fábrica (@fan_de_la_aviacion_2001: «pongan minas de uranio»)
      { const p = new THREE.Group(); const cerro = new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.2, 7), M('#6b7280')); cerro.position.y = 1.1; p.add(cerro);
        box(p, 1.2, 1.2, 0.3, '#111827', 0, 0.6, 2.0); box(p, 1.5, 0.15, 0.4, '#78350f', 0, 1.25, 2.05);
        box(p, 0.3, 0.05, 4, '#57534e', -0.35, 0.05, 3.8); box(p, 0.3, 0.05, 4, '#57534e', 0.35, 0.05, 3.8); // rieles
        const carro = new THREE.Group(); box(carro, 0.9, 0.5, 1.1, '#475569', 0, 0.35, 0);
        for (let i = 0; i < 4; i++) sph(carro, 0.18, '#4ade80', -0.2 + (i % 2) * 0.4, 0.68, -0.25 + Math.floor(i / 2) * 0.5, { emissive: '#22c55e', emissiveIntensity: 1.5 });
        p.add(carro); this.animProps.push((t) => { carro.position.z = 2.6 + (Math.sin(t * 0.6) * 0.5 + 0.5) * 2.6; });
        box(p, 0.6, 0.6, 0.05, '#facc15', 1.6, 0.9, 2.4); // cartel de peligro
        poner('uranio', p, libre('industria', 1, 3.0), 3.0, '☢️ MINA DE URANIO (@fan_de_la_aviacion_2001)', 9, 3); }

      // 11. Heladería cerca de la playa (@agustn.2.00)
      { const sp = this.#findClearSpot([140, 150, 130, 160, 125].flatMap((d) => [0.5, 0.42, 0.58].map((f) => [Math.cos(d * Math.PI / 180) * this.R * f, Math.sin(d * Math.PI / 180) * this.R * f])), 1.8, plots, 1.0);
        const p = new THREE.Group(); box(p, 2.2, 1.6, 1.8, '#fbcfe8', 0, 0.8, 0); box(p, 2.4, 0.15, 2.0, '#f472b6', 0, 1.65, 0);
        const cono = cone(p, 0.35, 1.0, '#d97706', 0, 2.2, 0, 8); cono.rotation.x = Math.PI; sph(p, 0.38, '#fde68a', 0, 2.75, 0); sph(p, 0.3, '#f9a8d4', 0, 3.15, 0); // helado gigante
        box(p, 1.8, 0.6, 0.4, '#ffffff', 0, 0.4, 1.0);
        poner('heladeria', p, sp, 1.8, '🍦 HELADERÍA DE @agustn.2.00', 6, 3.4); }
    }

    if (isla === 'youtube') {
      // 1. Armamento militar para las defensas (@team_editorespro), junto a su búnker
      { const p = new THREE.Group(); box(p, 7, 0.1, 3.4, '#78716c', 0, 0.05, 0);
        const cañones = [];
        for (let i = 0; i < 3; i++) { const c = new THREE.Group(); box(c, 1.2, 0.5, 1.4, '#4b5320', 0, 0.35, 0); for (const s of [-0.55, 0.55]) cyl(c, 0.32, 0.32, 0.18, '#262626', s, 0.3, -0.1, 10).rotation.z = Math.PI / 2;
          const tubo = cyl(c, 0.12, 0.16, 2.0, '#3f4b2a', 0, 0.85, 0.9, 8); tubo.rotation.x = 1.1; c.position.set(-2.4 + i * 2.4, 0, 0); p.add(c); cañones.push(c); }
        for (let i = 0; i < 6; i++) cyl(p, 0.12, 0.12, 0.5, '#b45309', -2.8 + i * 0.3, 0.3, -1.4, 6); // obuses
        this.animProps.push((t) => { cañones.forEach((c, i) => { c.rotation.y = Math.sin(t * 0.5 + i) * 0.4; }); });
        poner('armamento', p, cerca(this.bunkerPos || new THREE.Vector3(20, 1, 15), 3.8, 8), 3.8, '💥 ARMAMENTO DE DEFENSA (@team_editorespro)', 9, 2.4); }

      // 2. El trío de GTA 5 vigilando cada punta de la isla, cada uno con su metralleta (@AugustoMAguirre)
      { const trio = [['#16a34a', '#1f2937', '#5c3a21'], ['#f8fafc', '#1e3a8a', '#f1c27d'], ['#e5e7eb', '#78350f', '#e0ac69']];
        [0, 120, 240].forEach((deg, i) => {
          const a = THREE.MathUtils.degToRad(deg), dirs = [0.62, 0.56, 0.68, 0.5].map((f) => [Math.cos(a) * this.R * 1.19 * f, Math.sin(a) * this.R * 1.19 * f]);
          const sp = this.#findClearSpot(dirs, 1.2, plots, 1.0);
          const p = new THREE.Group(); box(p, 1.4, 0.3, 1.4, '#57534e', 0, 0.15, 0);
          const tipo = persona(p, trio[i][0], trio[i][2], 0, 0, 0, trio[i][1]); tipo.position.y = 0.3; tipo.scale.setScalar(1.5);
          const arma = box(tipo, 0.1, 0.12, 0.7, '#111827', 0.3, 0.75, 0.35); arma.rotation.x = 0.1;
          this.animProps.push((t) => { tipo.rotation.y = Math.sin(t * 0.6 + i * 2) * 1.2; });
          poner(`trio${i + 1}`, p, sp, 1.2, i === 0 ? '🔫 TRÍO DE GTA 5 EN CADA PUNTA (@AugustoMAguirre)' : null, 5, 2.6, a + Math.PI / 2);
        }); }

      // 3. Cartel gigante de «GTA VI» (@DylanFernandez-z1g: «Pon el GTA VI»)
      { const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const cx = cv.getContext('2d');
        const gr = cx.createLinearGradient(0, 0, 256, 128); gr.addColorStop(0, '#f472b6'); gr.addColorStop(0.5, '#fb923c'); gr.addColorStop(1, '#7c3aed');
        cx.fillStyle = gr; cx.fillRect(0, 0, 256, 128); cx.fillStyle = '#fff'; cx.font = 'bold 64px sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText('GTA VI', 128, 58);
        cx.font = 'bold 20px sans-serif'; cx.fillText('PRÓXIMAMENTE EN ORIENTE', 128, 106);
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        const p = new THREE.Group(); for (const x of [-1.6, 1.6]) cyl(p, 0.1, 0.1, 3.0, '#475569', x, 1.5, 0, 6);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })); panel.position.set(0, 3.6, 0); p.add(panel);
        const h = this.houseIndex.get('dylanfernandez-z1g'); const base = h?.pos || new THREE.Vector3(10, 1, 10);
        poner('gtavi', p, cerca(base, 2.4, 6), 2.4, '🎮 CARTEL GTA VI (@DylanFernandez-z1g)', 7, 4.6); }
    }
    this.root.add(g);
  }

  addObstacle(x, z, r) {
    const C = 3; const o = { x, z, r };
    for (let i = Math.floor((x - r) / C); i <= Math.floor((x + r) / C); i++)
      for (let j = Math.floor((z - r) / C); j <= Math.floor((z + r) / C); j++) {
        const k = i * 100003 + j; if (!this.obstacles.has(k)) this.obstacles.set(k, []); this.obstacles.get(k).push(o);
      }
  }
  // ¿Se puede estar en (x,z)? Devuelve el obstáculo con el que choca, 'agua', o null.
  hit(x, z, rad = WALKER_R) {
    if (this.groundAt(x, z) < 0.85) return 'agua'; // por encima del pico de las olas: nadie queda "dentro" del mar
    const list = this.obstacles.get(Math.floor(x / 3) * 100003 + Math.floor(z / 3)); if (!list) return null;
    for (const o of list) { const dx = x - o.x, dz = z - o.z; if (dx * dx + dz * dz < (o.r + rad) ** 2) return o; }
    return null;
  }
  // Altura donde pisa un habitante: terreno o plataforma (con un bordillo suave)
  groundAt(x, z) {
    let y = this.height(x, z);
    for (const p of this.platforms) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 0.15) y = Math.max(y, d < p.r ? p.top : THREE.MathUtils.lerp(p.top, y, (d - p.r) / 0.15)); }
    return y;
  }
  // Punto delante de la puerta (cada casa mira a su calle)
  door(home) {
    const d = home.face ? new THREE.Vector3(home.face, 0, 0) : new THREE.Vector3(-home.x, 0, -home.z); if (d.lengthSq() < 0.01) d.set(0, 0, 1);
    return home.clone().add(d.normalize().multiplyScalar(1.15 * S + 0.5));
  }
  #freeSpot(base, spread, w) {
    let fallback = null;
    for (let k = 0; k < 10; k++) {
      const p = base.clone().add(new THREE.Vector3((w.rnd() - 0.5) * spread, 0, (w.rnd() - 0.5) * spread));
      if (this.hit(p.x, p.z, WALKER_R + 0.12)) continue;
      fallback ||= p;
      const crowded = this.walkers.some((o) => o !== w && !o.hidden && (o.pos.x - p.x) ** 2 + (o.pos.z - p.z) ** 2 < 0.72);
      if (!crowded) return p;
    }
    return fallback;
  }

  // Punto base de un lugar de la isla para un habitante (cacheado por habitante y lugar).
  spot(lugar, w) {
    w.spots = w.spots || {};
    if (w.spots[lugar]) return w.spots[lugar];
    const V = (x, z) => new THREE.Vector3(x, 0, z); const h = w.home; let p;
    const a0 = Math.atan2(h.z, h.x) + (w.rnd() - 0.5) * 0.6;
    switch (lugar) {
      case 'casa': p = this.door(h); break;
      case 'playa': {
        if (w.vida?.rol === 'pescador' || w.act?.anim === 'pescar') {
          const muelle = this.buildingByKind?.['muelle'];
          if (muelle && w.phase % 2 < 1) {
            w.fishingSpot = 'muelle';
            const ang = Math.atan2(muelle.z, muelle.x);
            const r = Math.hypot(muelle.x, muelle.z) + 1.5 + w.rnd() * 5.0;
            p = V(Math.cos(ang) * r + (w.rnd() - 0.5) * 0.8, Math.sin(ang) * r + (w.rnd() - 0.5) * 0.8);
          } else {
            w.fishingSpot = 'rio';
            let z = THREE.MathUtils.clamp((w.rnd() - 0.5) * this.R * 0.9, -this.R * 0.5, this.R * 0.5);
            if (Math.abs(z - BRIDGE_Z) < 3.2) z = z >= BRIDGE_Z ? BRIDGE_Z + 3.5 : BRIDGE_Z - 3.5;
            const side = h.x > riverX(z) ? 1 : -1;
            p = V(riverX(z) + side * (RIVER.half + RIVER.bank * 0.72), z);
          }
          break;
        }
        const a = BEACH.ang + (w.rnd() - 0.5) * BEACH.half * 1.6; let r = this.R * 0.5; while (this.height(Math.cos(a) * r, Math.sin(a) * r) > 1.3 && r < this.R * 1.3) r += 0.3; p = V(Math.cos(a) * (r - 1.2), Math.sin(a) * (r - 1.2)); break;
      }
      case 'comercio': { const n = this.negocioPos?.get(w.negocio); p = n ? V(n.x + (w.rnd() - 0.5) * 3.5, n.z + (w.rnd() - 0.5) * 3.5) : V(COMERCIO.x0 - 2 - w.rnd() * 12, COMERCIO.z + (w.rnd() - 0.5) * 5); break; }
      case 'bosque': { const r = h.length() + 3 + w.rnd() * 5; p = V(Math.cos(a0) * r, Math.sin(a0) * r); break; }
      case 'rio': { const z = THREE.MathUtils.clamp(h.z + (w.rnd() - 0.5) * 8, -this.R * 0.65, this.R * 0.65); const side = h.x > riverX(z) ? 1 : -1; p = V(riverX(z) + side * (RIVER.half + RIVER.bank + 0.6 + w.rnd() * 1.8), z); break; }
      case 'mano': { const side = h.x > riverX(FIGURE_Z) ? 1 : -1; p = V(riverX(FIGURE_Z) + side * (RIVER.half + RIVER.bank + 1.6 + w.rnd() * 2.4), FIGURE_Z + (w.rnd() - 0.5) * 9); break; }
      case 'plaza': { const a = w.rnd() * Math.PI * 2, r = 2 + Math.sqrt(w.rnd()) * 9; p = V(TOWN.x + Math.cos(a) * r, TOWN.z + Math.sin(a) * r); break; }
      case 'pueblo': { const a = (w.rnd() - 0.5) * 4.2, r = 5.5 + w.rnd() * 5; p = V(TOWN.x + Math.cos(a) * r, TOWN.z + Math.sin(a) * r); break; }
      case 'vecino': { // la puerta de otro habitante cercano
        let best = null, bd = Infinity; for (let k = 0; k < 12; k++) { const o = this.walkers[Math.floor(w.rnd() * this.walkers.length)]; if (o === w) continue; const d = o.home.distanceTo(h); if (d < bd) { bd = d; best = o; } }
        p = best ? this.door(best.home) : this.door(h); break; }
      case 'puente': { const rx = riverX(BRIDGE_Z); const side = h.x > rx ? 1 : -1; p = V(rx + side * (RIVER.half + RIVER.bank + 1.4 + w.rnd() * 2), BRIDGE_Z + (w.rnd() - 0.5) * 7); break; }
      case 'colina': p = V(FLAG.x + (w.rnd() - 0.5) * 8, FLAG.z + (w.rnd() - 0.5) * 6); break;
      default: { const b = this.buildingByKind?.[lugar]; p = b ? V(b.x + (w.rnd() - 0.5) * 5, b.z + (w.rnd() - 0.5) * 5) : this.door(h); }
    }
    return (w.spots[lugar] = p);
  }
  #go(w, dest) { w.dest = dest; w.route = this.#route(w, dest); w.target = w.route.shift(); w.stuck = 0; w.mejor = undefined; w.last.copy(w.pos); }
  #enCamara(p) {
    this._frustum ||= new THREE.Frustum(); this._pm ||= new THREE.Matrix4();
    this._pm.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse); this._frustum.setFromProjectionMatrix(this._pm);
    return this._frustum.containsPoint(p);
  }
  // Un punto de desvío a un lado (alterna lados) desde el que el camino recto está despejado
  #rodeo(w) {
    const dir = new THREE.Vector3().subVectors(w.target, w.pos).setY(0).normalize(); const lado = new THREE.Vector3(-dir.z, 0, dir.x);
    const libre = (a, b) => { for (let t = 0.15; t <= 1; t += 0.15) { const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t; if (this.hit(x, z)) return false; } return true; };
    for (const dist of [1.6, 2.6, 3.8, 5]) for (const sg of [w.side || 1, -(w.side || 1)]) {
      const p = w.pos.clone().addScaledVector(lado, sg * dist).addScaledVector(dir, dist * 0.35);
      if (!this.hit(p.x, p.z, WALKER_R + 0.1) && libre(w.pos, p)) { w.side = sg; return p; }
    }
    return null;
  }
  // Ruta: si el destino está al otro lado del río, pasa por el puente con carril por sentido (evita atascos).
  #route(w, dest) {
    const rx = riverX(BRIDGE_Z); const half = RIVER.half + RIVER.bank + 1.2;
    const sideOf = (p) => Math.sign(p.x - riverX(p.z)) || 1;
    const onBridge = Math.abs(w.pos.z - BRIDGE_Z) < 1.6 && Math.abs(w.pos.x - rx) < half;
    const sd = sideOf(dest);
    const laneZ = BRIDGE_Z + sd * 0.48;
    if (onBridge) return [new THREE.Vector3(rx + sd * half, 0, laneZ), dest];        // ya en el puente: sale hacia su lado
    if (sideOf(w.pos) === sd) return [dest];
    return [new THREE.Vector3(rx - sd * half, 0, laneZ), new THREE.Vector3(rx + sd * half, 0, laneZ), dest];
  }

  #walkers(state, plots) {
    // Muestra hasta 250 habitantes caminando (siempre incluye a los 20 más recientes).
    const total = state.residents.length; this.walkers = []; this.crowd = null; this._plaza = 0;
    if (!total) return;
    const max = MOVIL ? 75 : 250; const chosen = new Set();
    for (let i = Math.max(0, total - 20); i < total; i++) chosen.add(i);
    const step = total / max; for (let i = 0; chosen.size < Math.min(max, total); i++) chosen.add(Math.floor(i * step) % total);
    for (const idx of chosen) {
      const r = state.residents[idx]; const home = plots[idx]; const rnd = mulberry(r.color);
      const pos = this.door(home);
      const v = vidaDe(r, state);
      const app = appearanceFor(r, v);
      this.walkers.push({ home, pos, target: null, route: [], wait: rnd() * 3, rnd, handle: r.handle, phase: rnd() * 6, vida: v, act: null,
        anim: v.anim,
        look: { ...app, height: app.height * 0.72 }, ground: this.groundAt(pos.x, pos.z), moving: false, hidden: false, stuck: 0, last: pos.clone() });
    }
    // quien eligió ser un animal camina como ese animal
    for (const w of this.walkers) { const r = state.byHandle.get(w.handle); w.forma = r?.rol ? formaDe(r.rolTexto) : null; if (w.forma) { w.animal = crearAnimal(w.forma); w.animal.userData.pick = { type: 'habitante', handle: w.handle, walker: w }; this.root.add(w.animal); this.pickables.push(w.animal); } }
    this.crowd = new Crowd(this.root, this.walkers);
    // Placas con el @usuario: un grupo fijo de etiquetas que se reparte entre los personajes más cercanos a la cámara
    this.nameTags = Array.from({ length: MOVIL ? 14 : 40 }, () => { const t = this.#label('', new THREE.Vector3(), 'lbl lbl-name'); t.visible = false; t.userData.w = null; return t; });
  }

  #landmarks() {
    const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, ...o });
    // ---- Puente vial asfaltado de hormigón y acero sobre el río (2 carriles + aceras peatonales)
    const rx = riverX(BRIDGE_Z); const len = (RIVER.half + RIVER.bank) * 2 + 1.5; const top = TOWN.h + 0.05;
    const bridge = new THREE.Group();
    const bridgeConcrete = M('#94a3b8', { roughness: 0.9 });
    const bridgeStoneCap = M('#cbd5e1', { roughness: 0.85 });
    const bridgeRoad = M('#383d47', { roughness: 0.85 });
    const bridgeSidewalk = M('#dfd8cb', { roughness: 0.82 });
    const bridgeCurb = M('#888275', { roughness: 0.88 });
    const bridgeLine = M('#facc15', { roughness: 0.6 });
    const bridgeMetal = M('#334155', { roughness: 0.5, metalness: 0.45 });
    const lanternGlow = new THREE.MeshStandardMaterial({ color: '#ffe5a3', emissive: '#ffaa33', emissiveIntensity: 1.2, roughness: 0.3 });

    // Tablero estructural de hormigón + calzada asfaltada de 2 carriles
    const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.28, 4.15), bridgeConcrete);
    deck.position.y = top - 0.14; bridge.add(deck);
    const roadSurface = new THREE.Mesh(new THREE.BoxGeometry(len + 0.15, 0.06, 2.6), bridgeRoad);
    roadSurface.position.y = top + 0.025; bridge.add(roadSurface);
    // Línea amarilla central discontinua
    for (let i = -3; i <= 3; i++) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.015, 0.1), bridgeLine);
      dash.position.set(i * (len / 7.5), top + 0.06, 0);
      bridge.add(dash);
    }
    // Aceras elevadas + bordillos + barandillas metálicas urbanas
    for (const sz of [-1, 1]) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.1, 0.72), bridgeSidewalk);
      sw.position.set(0, top + 0.05, sz * 1.66); bridge.add(sw);
      const curb = new THREE.Mesh(new THREE.BoxGeometry(len + 0.1, 0.12, 0.08), bridgeCurb);
      curb.position.set(0, top + 0.06, sz * 1.32); bridge.add(curb);
      const topRail = new THREE.Mesh(new THREE.BoxGeometry(len - 0.2, 0.08, 0.08), bridgeMetal);
      topRail.position.set(0, top + 0.78, sz * 1.98); bridge.add(topRail);
      const midRail = new THREE.Mesh(new THREE.BoxGeometry(len - 0.2, 0.05, 0.06), bridgeMetal);
      midRail.position.set(0, top + 0.42, sz * 1.98); bridge.add(midRail);
      for (let i = 1; i < 6; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), bridgeMetal);
        post.position.set(-len / 2 + (i * len) / 6, top + 0.38, sz * 1.98); bridge.add(post);
      }
      // Vigas arco de hormigón bajo el tablero
      for (let i = 0; i < 5; i++) {
        const t = (i - 2) / 2.2;
        const archSeg = new THREE.Mesh(new THREE.BoxGeometry(len / 5.1, 0.24, 0.28), bridgeConcrete);
        archSeg.position.set((i - 2) * (len / 5.4), top - 0.55 - t * t * 0.65, sz * 1.75);
        archSeg.rotation.z = -t * 0.24;
        bridge.add(archSeg);
      }
    }
    // Estribos y pilares modernos con luminarias viales en cada extremo
    for (const sx of [-1, 1]) {
      const abut = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.3, 4.2), bridgeConcrete);
      abut.position.set(sx * (len / 2 - 0.25), top - 1.15, 0); bridge.add(abut);
      for (const sz of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.46, 1.15, 0.46), bridgeConcrete);
        pillar.position.set(sx * (len / 2 - 0.15), top + 0.45, sz * 1.98); bridge.add(pillar);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.12, 0.56), bridgeStoneCap);
        cap.position.set(sx * (len / 2 - 0.15), top + 1.05, sz * 1.98); bridge.add(cap);
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.55, 6), bridgeMetal);
        post.position.set(sx * (len / 2 - 0.15), top + 1.38, sz * 1.98); bridge.add(post);
        const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), lanternGlow);
        lamp.position.set(sx * (len / 2 - 0.15), top + 1.7, sz * 1.98); bridge.add(lamp);
      }
    }
    // Pilotes de hormigón armado en el cauce
    for (const sx of [-0.5, 0.5]) {
      const px = sx * RIVER.half * 1.55;
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 3.6, 8), bridgeConcrete);
      pile.position.set(px, top - 1.9, 0); bridge.add(pile);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 1.2, 8), bridgeStoneCap);
      base.position.set(px, -0.7, 0); bridge.add(base);
    }
    bridge.position.set(rx, 0, BRIDGE_Z); bridge.traverse((o) => { o.castShadow = !MOVIL; o.receiveShadow = true; }); this.root.add(bridge);
    bridge.userData.pick = { type: 'lugar', id: 'puente', pos: bridge.position.clone() }; this.pickables.push(bridge);
    for (let x = -len / 2; x <= len / 2; x += 0.7) this.platforms.push({ x: rx + x, z: BRIDGE_Z, r: 1.55, top: top + 0.05, bridge: true });
    for (const sz of [-1, 1]) for (let x = -len / 2; x <= len / 2; x += 0.6) this.addObstacle(rx + x, BRIDGE_Z + sz * 2.05, 0.15); // barandillas

    // ---- Barandines bien hechos a lo largo de ambas orillas del río (madera noble + pilares de piedra)
    const railGroup = new THREE.Group();
    const postWood = M('#6f4518');
    const railWood = M('#9c6644');
    const capStone = M('#8d99ae');
    const zMax = this.R * 0.72;
    const STEP_Z = 2.1;
    for (const side of [-1, 1]) {
      let prev = null;
      for (let z = -zMax; z <= zMax; z += STEP_Z) {
        if (Math.abs(z - BRIDGE_Z) < 2.1) { prev = null; continue; } // deja abierto el acceso al puente
        const bx = riverX(z) + side * (RIVER.half + RIVER.bank * 0.52);
        const by = this.height(bx, z);
        if (by < 0.75) { prev = null; continue; }
        // Poste vertical de madera con remate de piedra
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, 0.16), postWood);
        post.position.set(bx, by + 0.42, z); post.castShadow = !MOVIL; railGroup.add(post);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.22), capStone);
        cap.position.set(bx, by + 0.87, z); railGroup.add(cap);
        this.addObstacle(bx, z, 0.18);

        if (prev) {
          const dx = bx - prev.x, dy = by - prev.y, dz = z - prev.z;
          const segLen = Math.hypot(dx, dy, dz);
          const yaw = Math.atan2(dx, dz);
          const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
          [0.36, 0.7].forEach((hOff) => {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, segLen), railWood);
            bar.position.set((bx + prev.x) * 0.5, (by + prev.y) * 0.5 + hOff, (z + prev.z) * 0.5);
            bar.rotation.order = 'YXZ';
            bar.rotation.y = yaw;
            bar.rotation.x = pitch;
            bar.castShadow = !MOVIL;
            railGroup.add(bar);
          });
        }
        prev = { x: bx, y: by, z };
      }
    }
    this.root.add(railGroup);

    // ---- La mano de piedra: surge del río sosteniendo un orbe que brilla. Nadie sabe quién la hizo.
    // Palma abierta hacia arriba mirando al pueblo (+z); los dedos se curvan por DETRÁS del orbe, que queda a la vista.
    const hand = new THREE.Group(); const stone = M('#aaa596', { roughness: 1 }); const moss = M('#5f7f45', { roughness: 1 });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; hand.add(o); return o; };
    add(new THREE.CylinderGeometry(0.85, 1.15, 4.2, 8), stone, 0, 1.0, 0, -0.08);         // antebrazo
    add(new THREE.CylinderGeometry(1.2, 1.2, 0.5, 8), moss, 0, -0.4, 0);                   // musgo en la línea de agua
    add(new THREE.BoxGeometry(2.4, 0.7, 2.2), stone, 0, 3.35, 0.1, -0.1);                   // palma, ligeramente inclinada hacia el pueblo
    for (let i = 0; i < 4; i++) {
      const fx = -0.84 + i * 0.56; const h = i === 1 || i === 2 ? 1.15 : 0.95;
      add(new THREE.BoxGeometry(0.44, h, 0.46), stone, fx, 3.7 + h / 2, -0.9, 0.22);          // falange 1 (atrás)
      add(new THREE.BoxGeometry(0.4, h * 0.7, 0.42), stone, fx, 3.85 + h + 0.15, -0.55, 0.85); // falange 2, curvada sobre el orbe
    }
    add(new THREE.BoxGeometry(0.5, 1.05, 0.52), stone, -1.4, 3.85, 0.35, 0, 0, -0.55);         // pulgar al costado
    const orb = add(new THREE.IcosahedronGeometry(1.0, 2), new THREE.MeshStandardMaterial({ color: '#7ef9ff', emissive: '#29d8ff', emissiveIntensity: 1.3, roughness: 0.2, transparent: true, opacity: 0.93 }), 0, 4.6, 0.35);
    orb.castShadow = false; this.orb = orb;
    this.orbLight = new THREE.PointLight("#5fe6ff", 2.5, 30, 1.4); this.orbLight.position.set(0, 4.7, 0.3); hand.add(this.orbLight);
    const fz = FIGURE_Z, fx = riverX(fz);
    hand.position.set(fx, -0.35, fz); hand.rotation.y = Math.atan2(TOWN.x - fx, TOWN.z - fz); hand.scale.setScalar(1.25);
    this.root.add(hand); this.figurePos = new THREE.Vector3(fx, 0, fz);
    this.addObstacle(fx, fz, 2.2);
    hand.userData.pick = { type: 'lugar', id: 'mano', pos: this.figurePos.clone() }; this.pickables.push(hand);
  }

  #flag(state) {
    // Mástil vacío hasta que los seguidores elijan bandera.
    const g = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.5, 8), new THREE.MeshStandardMaterial({ color: '#d9d9d9' }));
    pole.position.y = 2.75; g.add(pole);
    if (state.flag && state.flag.colors.length) {
      const cv = document.createElement('canvas'); cv.width = 240; cv.height = 160; const x = cv.getContext('2d');
      const cols = state.flag.colors; cols.forEach((col, i) => { x.fillStyle = col; x.fillRect(0, (i * 160) / cols.length, 240, 160 / cols.length + 1); });
      if (state.flag.symbol) { x.font = '90px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(state.flag.symbol, 120, 84); }
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      this.flagCloth = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.8, 12, 4), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
      this.flagCloth.position.set(1.4, 4.5, 0); this.flagBase = this.flagCloth.geometry.attributes.position.array.slice(); g.add(this.flagCloth);
    } else this.flagCloth = null;
    g.position.set(FLAG.x, this.height(FLAG.x, FLAG.z), FLAG.z); this.root.add(g);
    pole.scale.set(2.2, 1, 2.2); pole.material.transparent = false; // un poco más gordo para poder pulsarlo
    g.userData.pick = { type: 'lugar', id: 'mastil', pos: g.position.clone() }; this.pickables.push(g);
    this.flagPos = g.position.clone();
    this.addObstacle(g.position.x, g.position.z, 0.2);
  }

  #zoneLabels(state) {
    if (!state.residents.length) return;
    ZONES.forEach((z, i) => {
      const count = state.residents.filter((r) => r.zone === z.id).length; if (!count) return;
      const casas = state.residents.filter((r) => r.zone === z.id).map((r) => this.houseIndex.get(r.handle)?.pos).filter(Boolean);
      const p = casas.reduce((a, c) => a.add(c), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, casas.length)); p.y = this.height(p.x, p.z) + 5;
      this.#label(`${state.zoneNames[z.id] || z.name} · ${count}`, p, 'lbl lbl-zone');
    });
  }

  #label(text, pos, cls) {
    const el = document.createElement('div'); el.className = cls; el.textContent = text;
    const o = new CSS2DObject(el); o.position.copy(pos); this.root.add(o); return o;
  }

  // ---------- interacción ----------
  #pick(e) {
    const tol = e.pointerType === 'touch' ? 14 : 5;
    if (!this._down || Math.hypot(e.clientX - this._down[0], e.clientY - this._down[1]) > tol) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), this.camera);
    const crowdMeshes = this.crowd ? ['torso', 'head', 'legL', 'legR', 'hairCap', 'hatTop', 'paraguas'].map((k) => this.crowd.meshes[k]) : [];
    const hits = this.raycaster.intersectObjects([...crowdMeshes, ...(this.houseMeshes || []), ...this.pickables], true);
    for (const h of hits) {
      if (crowdMeshes.includes(h.object)) { const w = this.walkers[h.instanceId]; if (!w || w.hidden) continue; this.select({ type: 'habitante', handle: w.handle, walker: w }); return; }
      if (this.houseMeshes?.includes(h.object)) { const list = h.object.userData.residents || this.houseList; this.select({ type: 'casa', handle: list[h.instanceId].handle }); return; }
      let o = h.object; while (o && !o.userData.pick) o = o.parent;
      if (o) { this.select(o.userData.pick); return; }
    }
  }
  // Muestra el @usuario de los personajes cercanos (cada 8 fotogramas elige quiénes; cada fotograma los sigue)
  #updateNameTags() {
    if (!this.nameTags || !this.walkers.length) return;
    const cam = this.camera.position; const MAX = 30;
    if ((this._tagTick = (this._tagTick || 0) + 1) % (MOVIL ? 12 : 8) === 0) {
      const v = this._tagV || (this._tagV = new THREE.Vector3());
      const enPantalla = (w) => { v.set(w.pos.x, w.ground + 1.6, w.pos.z).project(this.camera); return v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.92; };
      const cerca = this.walkers.filter((w) => !w.hidden && enPantalla(w))
        .map((w) => [w, (w.pos.x - cam.x) ** 2 + (w.ground + 1 - cam.y) ** 2 + (w.pos.z - cam.z) ** 2])
        .filter(([, d]) => d < MAX * MAX).sort((a, b) => a[1] - b[1]).slice(0, this.nameTags.length);
      this.nameTags.forEach((t, i) => {
        const e = cerca[i];
        if (!e) { t.visible = false; t.userData.w = null; return; }
        const [w, d] = e;
        if (t.userData.w !== w) { t.element.textContent = '@' + w.handle; t.userData.w = w; }
        t.element.style.opacity = String(Math.max(0.25, 1 - Math.sqrt(d) / MAX));
        t.visible = true;
      });
    }
    for (const t of this.nameTags) {
      const w = t.userData.w; if (!w) continue;
      if (w.hidden || this.bubbles?.some((b) => b.w === w) || this.selected?.walker === w) { t.visible = false; continue; } // no tapar bocadillos ni la etiqueta de selección
      t.visible = true; t.position.set(w.pos.x, w.ground + (w.forma ? 0.95 : 1.75), w.pos.z);
    }
  }

  // Etiquetas sin amontonarse: cada ¼ s se ocultan las que se pisan con otra más importante y, con la cámara lejos,
  // los rótulos de obras solo salen cerca del centro de la pantalla. Prioridad: tu casa > chat > islas vecinas >
  // zonas > obras y negocios > @nombres.
  #ordenarEtiquetas() {
    const capa = this.labels.domElement; const ancho = capa.clientWidth || innerWidth, alto = capa.clientHeight || innerHeight;
    const prio = (el) => (el.classList.contains('lbl-me') ? 100 : el.classList.contains('lbl-bubble') ? 90 : el.classList.contains('lbl-vecina') ? 70
      : el.classList.contains('lbl-zone') ? 50 : el.classList.contains('lbl-shop') ? 35 : el.classList.contains('lbl-building') ? 40 : 10);
    const lejos = this.camera.position.distanceTo(this.controls.target) > 75; // vista general de toda la isla
    const cx = ancho / 2, cy = alto / 2, radioCentro = Math.min(ancho, alto) * 0.28;
    const els = [...capa.querySelectorAll('.lbl')].filter((el) => el.style.display !== 'none');
    const cajas = els.map((el) => { const r = el.getBoundingClientRect(); return { el, r, p: prio(el) }; })
      .filter((c) => c.r.width > 0)
      .sort((a, b) => b.p - a.p || Math.hypot((a.r.left + a.r.right) / 2 - cx, (a.r.top + a.r.bottom) / 2 - cy) - Math.hypot((b.r.left + b.r.right) / 2 - cx, (b.r.top + b.r.bottom) / 2 - cy));
    const puestas = []; const MAX_OBRAS = MOVIL ? 4 : 8; let obras = 0;
    for (const c of cajas) {
      let ver = true;
      const esObra = c.p === 40 || c.p === 35;
      if (esObra) {
        const dc = Math.hypot((c.r.left + c.r.right) / 2 - cx, (c.r.top + c.r.bottom) / 2 - cy);
        if ((lejos && dc > radioCentro) || obras >= MAX_OBRAS) ver = false;
      }
      if (ver && c.p < 100) ver = !puestas.some((o) => c.r.left < o.right + 4 && c.r.right > o.left - 4 && c.r.top < o.bottom + 2 && c.r.bottom > o.top - 2);
      c.el.classList.toggle('lbl-tapada', !ver);
      if (ver) { puestas.push(c.r); if (esObra) obras++; }
    }
  }

  // Un habitante "dice" algo (mensaje del chat): bocadillo sobre su personaje si está a la vista.
  say(handle, text) {
    const w = this.walkers?.find((x) => x.handle === handle); if (!w || w.hidden) return false;
    // Solo si está a la vista y cerca: un bocadillo lejano es un globo blanco que tapa la isla sin poder leerse
    const v = (this._sayV || (this._sayV = new THREE.Vector3())).set(w.pos.x, w.ground + 2, w.pos.z);
    if (v.distanceTo(this.camera.position) > 60) return false;
    v.project(this.camera); if (v.z > 1 || Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.85) return false;
    this.bubbles = (this.bubbles || []).filter((b) => { if (b.w === w) { this.root.remove(b.label); return false; } return true; });
    const MAXB = MOVIL ? 1 : 2; // pocos a la vez: el resto de la charla sigue en el panel 💭
    while (this.bubbles.length >= MAXB) this.root.remove(this.bubbles.shift().label);
    const t = text.length > 60 ? text.slice(0, 58) + '…' : text;
    this.bubbles.push({ w, until: performance.now() + 5000, label: this.#label(`💬 ${t}`, w.pos.clone(), 'lbl lbl-bubble') });
    return true;
  }
  // Selecciona algo y avisa a la interfaz. A un personaje le sigue una etiqueta con su @.
  select(sel) {
    this.selected = sel;
    if (this.selLabel) { this.root.remove(this.selLabel); this.selLabel = null; }
    if (sel.type === 'habitante') { this.selLabel = this.#label(`👤 @${sel.handle}`, sel.walker.pos.clone(), 'lbl lbl-me'); }
    if (this.onPick) this.onPick(sel);
  }

  highlight(handle) {
    if (this.marker) { this.root.remove(this.marker); this.marker = null; }
    const h = this.houseIndex.get(handle); if (!h) return false;
    this.marker = this.#label(`🏠 @${handle}`, h.pos.clone().add(new THREE.Vector3(0, 3.4, 0)), 'lbl lbl-me');
    this.flyTo(h.pos, 13);
    return true;
  }

  flyTo(target, dist = 30, dur = 1.8) {
    // Llega desde el interior de la isla (hacia el centro no hay bosque denso) y desde arriba.
    const dir = new THREE.Vector3(-target.x, 0, -target.z);
    if (dir.lengthSq() < 1) dir.subVectors(this.camera.position, this.controls.target).setY(0);
    dir.normalize();
    const endPos = target.clone().add(dir.multiplyScalar(dist * 0.75)).add(new THREE.Vector3(0, dist * 0.85, 0));
    this.cameraTween = { t: 0, dur, p0: this.camera.position.clone(), p1: endPos, t0: this.controls.target.clone(), t1: target.clone() };
  }

  frame() {
    // Encadre cinematográfico inicial: muestra la isla completa en 3/4 resaltando río, puente, playa y barrios.
    const vf = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * this.camera.aspect);
    const effFov = this.camera.aspect < 1 ? Math.max(hf * 1.18, vf * 0.52) : Math.min(vf, hf);
    const d = (this.R * 1.06) / Math.sin(effFov);
    const dir = new THREE.Vector3(0.24, 0.62, 0.75).normalize();
    this.camera.position.copy(dir.multiplyScalar(d)); this.controls.target.set(0, 0.5, this.R * 0.04);
  }

  // ---------- ciclo día/noche y clima ----------
  #sky_update(dt) {
    const h = (this.time / 60) % 24; const sunAng = ((h - 6) / 12) * Math.PI; // 6h amanecer, 18h atardecer
    const day = Math.max(0, Math.sin(sunAng)); const night = 1 - THREE.MathUtils.smoothstep(day, 0, 0.25);
    const golden = THREE.MathUtils.smoothstep(day, 0.02, 0.22) * (1 - THREE.MathUtils.smoothstep(day, 0.22, 0.58));
    this.sun.position.set(Math.cos(sunAng) * 200, Math.sin(sunAng) * 220 + 10, 80); this.sun.intensity = 0.22 + day * 2.45;
    this.sun.color.set('#fff6e5').lerp(new THREE.Color('#ff9d5c'), golden * 0.85);
    if (this.bounce) {
      this.bounce.intensity = 0.16 + day * 0.44 + golden * 0.20;
      this.bounce.color.set('#ffd6a5').lerp(new THREE.Color('#ff8e6e'), golden * 0.6);
    }
    this.moon.position.set(-Math.cos(sunAng) * 600, -Math.sin(sunAng) * 500 + 60, -200);
    const sky = new THREE.Color('#0c1736').lerp(new THREE.Color('#ff9e78'), golden)
      .lerp(new THREE.Color('#38b6ff'), THREE.MathUtils.smoothstep(day, 0.2, 0.62));
    const grey = this.weather === 'lluvia' || this.weather === 'tormenta' ? 0.55 : this.weather === 'nublado' ? 0.3 : 0;
    sky.lerp(new THREE.Color('#7d8a95').multiplyScalar(0.3 + day * 0.7), grey);
    this.scene.background = sky; this.scene.fog.color.copy(sky);
    this.hemi.intensity = 0.34 + day * 0.82; this.sun.intensity *= 1 - grey * 0.6;
    this.stars.material.opacity = night * (1 - grey);
    if (this.windowMat) this.windowMat.emissiveIntensity = night * 1.6;
    if (this.beacon) this.beacon.material.emissiveIntensity = 0.4 + night * 2;
    this.cloudMat.color.set(grey ? '#9aa3ab' : '#ffffff').lerp(new THREE.Color('#ffd3b6'), golden * 0.45);
    this.isNight = night > 0.5;
  }

  setWeather(w) { this.weather = w; this.rain.visible = w === 'lluvia' || w === 'tormenta'; }

  // dtFijo: para renderizar fotograma a fotograma (Reels) con tiempo exacto
  update(dtFijo) {
    const dt = dtFijo ?? Math.min(this.clock.getDelta(), 0.1);
    // Gobernador adaptativo de FPS (Móvil / Gama Baja / Escritorio): mantiene fluidez sin perder estética Low-Poly
    if (!dtFijo && !this.manual && (this._perfTier || 0) < 3) {
      this._perfT = (this._perfT || 0) + dt; this._perfN = (this._perfN || 0) + 1;
      if (this._perfN >= 40) {
        const avg = this._perfT / this._perfN; this._perfT = 0; this._perfN = 0;
        if (!this._perfTier && avg > 0.038) {
          this._perfTier = 1;
          this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.gamaBaja ? 0.8 : 1.0));
        } else if (this._perfTier === 1 && avg > 0.048) {
          this._perfTier = 2;
          this.renderer.shadowMap.enabled = false;
          this.sun.castShadow = false;
        } else if (this._perfTier === 2 && avg > 0.058) {
          this._perfTier = 3;
          this.gamaBaja = true;
          this.renderer.setPixelRatio(0.75);
        }
      }
    }
    this.simT = (this.simT || 0) + dt; const t = this.simT;
    this.time = (this.time + dt * this.speed / 60 * 60) % 1440; // speed x minutos/seg
    this.#sky_update(dt);
    // olas
    this.oceanT.value = t; // las olas se mueven en la GPU
    // lluvia
    if (this.rain.visible) { const r = this.rain.geometry.attributes.position; for (let i = 0; i < r.count; i++) { let y = r.getY(i) - dt * 60; if (y < 0) y += 120; r.setY(i, y); } r.needsUpdate = true; }
    this.cloudGroup.children.forEach((c) => { c.position.x += c.userData.v * dt * (this.weather === 'tormenta' ? 6 : 2); if (c.position.x > 220) c.position.x = -220; });
    this.#updateBirds(t);
    if (this.animProps?.length) for (const fn of this.animProps) fn(t, dt);
    if (this.orb) { const pu = 1 + Math.sin(t * 1.7) * 0.06; this.orb.scale.setScalar(pu); this.orb.rotation.y += dt * 0.4; this.orbLight.intensity = (this.isNight ? 5 : 1.8) * (0.85 + Math.sin(t * 1.7) * 0.15); }
    // bandera ondeando
    if (this.flagCloth) { const fp = this.flagCloth.geometry.attributes.position; for (let i = 0; i < fp.count; i++) { const x = this.flagBase[i * 3]; fp.setZ(i, Math.sin(x * 2.6 + t * 4) * 0.14 * (x + 1.35)); } fp.needsUpdate = true; }
    this.#walk(dt, t);
    // cámara
    if (this.cameraTween) {
      const c = this.cameraTween; c.t += dt / c.dur; const k = THREE.MathUtils.smootherstep(Math.min(c.t, 1), 0, 1);
      this.camera.position.lerpVectors(c.p0, c.p1, k); this.controls.target.lerpVectors(c.t0, c.t1, k);
      if (c.t >= 1) this.cameraTween = null;
    }
    const lblMod = this.gamaBaja ? 5 : (MOVIL ? 3 : 1);
    if ((this._lblTick = ((this._lblTick || 0) + 1) % lblMod) === 0) {
      this.#updateNameTags();
      this.labels.render(this.scene, this.camera);
      const ahora = performance.now();
      if (ahora - (this._declT || 0) > 250) { this._declT = ahora; this.#ordenarEtiquetas(); }
    }
    // bocadillos del chat: siguen al personaje y desaparecen a los 7 s
    if (this.bubbles?.length) {
      const now = performance.now();
      this.bubbles = this.bubbles.filter((b) => { if (now > b.until) { this.root.remove(b.label); return false; } b.label.position.set(b.w.pos.x, b.w.ground + 2.7, b.w.pos.z); b.label.visible = !b.w.hidden; return true; });
    }
    if (this.selLabel && this.selected?.walker) { const w = this.selected.walker; this.selLabel.position.set(w.pos.x, w.ground + 2.1, w.pos.z); this.selLabel.visible = !w.hidden; }
    if (this.customCamera) this.customCamera(dt, t); else {
      this.controls.update();
      // la cámara nunca entra en el terreno ni bajo el agua (y el punto de mira tampoco)
      const cp = this.camera.position, tg = this.controls.target;
      const suelo = Math.max(this.R ? this.groundAt(cp.x, cp.z) : 0, 0.6) + 1.4;
      if (cp.y < suelo) cp.y = suelo;
      const sueloT = this.R ? Math.max(this.height(tg.x, tg.z), 0) : 0; if (tg.y < sueloT) tg.y = sueloT;
      if (tg.length() > (this.R || 60) * 1.6) tg.multiplyScalar(((this.R || 60) * 1.6) / tg.length());
    }
    this.renderer.render(this.scene, this.camera);
  }

  #walk(dt, t) {
    if (!this.crowd) return;
    const hora = (this.time / 60) % 24;
    const dir = new THREE.Vector3(); const tryDir = new THREE.Vector3();
    const rxBridge = riverX(BRIDGE_Z), halfBridge = RIVER.half + RIVER.bank + 2.2;
    const enPuente = (p) => Math.abs(p.z - BRIDGE_Z) < 2.2 && Math.abs(p.x - rxBridge) < halfBridge;
    let bridgeLoad = 0;
    for (const w of this.walkers) if (!w.hidden && (enPuente(w.pos) || w.route.length > 1)) bridgeLoad++;
    for (const w of this.walkers) {
      // ¿Qué toca hacer ahora? (rutina según la hora de la isla)
      let act = actividad(w.vida, hora, w.handle);
      // Aforo de la plaza: si está llena, se va a otro sitio (y mantiene esa decisión mientras dure la actividad)
      if (act.lugar === 'plaza') {
        if (w.plazaSlot === undefined) {
          const cap = Math.max(12, Math.round(this.walkers.length * 0.12));
          w.plazaSlot = (this._plaza || 0) < cap; if (w.plazaSlot) this._plaza = (this._plaza || 0) + 1;
          w.altLugar = ['vecino', 'vecino', 'colina', 'playa', 'casa'][Math.floor(w.rnd() * 5)];
        }
        if (!w.plazaSlot) act = { accion: act.accion, lugar: w.altLugar, texto: ALT_TEXTO[w.altLugar] };
      } else if (w.plazaSlot !== undefined) { if (w.plazaSlot) this._plaza--; w.plazaSlot = undefined; }
      if (!w.act || w.act.accion !== act.accion || w.act.lugar !== act.lugar) {
        w.act = act; w.hidden = false; w.wait = Math.min(w.wait, w.rnd() * 2); w.rendido = 0;
        const base = this.spot(act.lugar, w);
        const dest = act.accion === 'dormir' ? base : act.lugar === 'casa' ? (this.#freeSpot(base, 1.2, w) || base) : (this.#freeSpot(base, 3, w) || base);
        this.#go(w, dest); w.tries = 0;
      }
      if (w.wait > 0) w.wait -= dt;
      else if (!w.target) {
        // Ya llegó: solo entra en casa (se oculta) para dormir; si no, se mueve con frecuencia por su zona o pasea a otro lugar.
        if (act.accion === 'dormir') { w.hidden = true; w.wait = 3; }
        else if (w.rendido > 0) { w.rendido--; const d = this.#freeSpot(w.pos, 4, w); if (d) this.#go(w, d); else w.wait = 0.8; }
        else {
          const pool = bridgeLoad >= 6 ? ['plaza', 'pueblo', 'vecino', 'casa'] : ['plaza', 'playa', 'pueblo', 'vecino', 'puente', 'comercio'];
          const roam = act.accion !== 'trabajar' && w.rnd() < 0.2 ? pool[Math.floor(w.rnd() * pool.length)] : act.lugar;
          const spread = roam !== act.lugar ? 7 : act.accion === 'trabajar' ? 1.8 : (act.anim && act.accion !== 'social' ? 3.0 : act.accion === 'social' ? 6 : 5);
          const d = this.#freeSpot(this.spot(roam, w), spread, w);
          const cruza = d && (Math.sign(d.x - riverX(d.z)) || 1) !== (Math.sign(w.pos.x - riverX(w.pos.z)) || 1);
          if (d && (!cruza || bridgeLoad < 8)) { this.#go(w, d); if (cruza) bridgeLoad++; }
          else w.wait = 0.8;
        }
        w.stuck = 0; w.last.copy(w.pos);
      } else {
        dir.subVectors(w.target, w.pos).setY(0); const len = dir.length();
        if (len < 0.3) {
          w.mejor = undefined; w.tries = 0;
          if (w.route.length) w.target = w.route.shift();
          else {
            w.target = null; w.wait = act.accion === 'trabajar' ? 14 + w.rnd() * 14 : act.anim ? 8 + w.rnd() * 8 : 2.0 + w.rnd() * 3.0;
            // mira hacia lo que hace: el pescador al río o al mar, el aguador al río, el resto hacia su lugar
            const base = this.spot(act.lugar, w);
            if (act.anim === 'pescar') {
              if (w.fishingSpot === 'rio' || Math.abs(w.pos.x - riverX(w.pos.z)) < RIVER.half + RIVER.bank + 2.5) {
                w.dir = Math.atan2(riverX(w.pos.z) - w.pos.x, 0);
              } else {
                w.dir = Math.atan2(w.pos.x, w.pos.z);
              }
            } else if (act.anim === 'nadar') w.dir = Math.atan2(w.pos.x, w.pos.z);
            else if (act.anim === 'agua' || act.lugar === 'rio') w.dir = Math.atan2(riverX(w.pos.z) - w.pos.x, 0);
            else if (act.lugar === 'casa') w.dir = Math.atan2(w.pos.x - w.home.x, w.pos.z - w.home.z); // en su portal, mirando a la calle
            else if (act.lugar === 'mano') w.dir = Math.atan2(this.figurePos.x - w.pos.x, this.figurePos.z - w.pos.z);
            else if (base.distanceTo(w.pos) > 0.6) w.dir = Math.atan2(base.x - w.pos.x, base.z - w.pos.z);
          }
        } else {
          dir.normalize(); const step = Math.min(len, dt * 1.6 * (w.vida.rasgo?.paso || 1));
          let moved = false;
          for (const ang of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.1, -2.1]) {
            tryDir.copy(dir).applyAxisAngle(UP, ang * (w.side || 1));
            const nx = w.pos.x + tryDir.x * step, nz = w.pos.z + tryDir.z * step;
            if (!this.hit(nx, nz)) { w.pos.x = nx; w.pos.z = nz; w.dir = Math.atan2(tryDir.x, tryDir.z); moved = true; break; }
          }
          if (!moved) w.side = -(w.side || 1);
          w.stuck += dt;
          if (w.stuck > 1.5) { // ¿se acercó al menos 0,3 a su objetivo en el último segundo y medio?
            const dd = w.pos.distanceTo(w.target);
            if (w.mejor === undefined || dd < w.mejor - 0.3) w.mejor = dd;
            else { // atascado (entre árboles, rebotando): primero rodea, y si no hay manera, aparece libre un poco más allá
              w.tries = (w.tries || 0) + 1; w.mejor = undefined;
              const rodeo = w.tries <= 4 ? this.#rodeo(w) : null;
              if (rodeo) { w.route.unshift(w.target); w.target = rodeo; }
              else if (this.#enCamara(w.pos)) { w.target = null; w.route = []; w.dest = null; w.wait = 0.5; w.tries = 0; w.rendido = 3; } // a la vista: mejor elige otro sitio
              else { const p = this.#freeSpot(w.target, 2, w) || this.#freeSpot(w.pos, 5, w); if (p) { w.pos.x = p.x; w.pos.z = p.z; } w.tries = 0; } // fuera de cámara: aparece libre
            }
            w.stuck = 0; w.last.copy(w.pos);
          }
        }
      }
      const o = this.hit(w.pos.x, w.pos.z);
      if (o && o !== 'agua') {
        const dx = w.pos.x - o.x, dz = w.pos.z - o.z, d = Math.hypot(dx, dz) || 1; const px = w.pos.x, pz = w.pos.z;
        w.pos.x = o.x + (dx / d) * (o.r + WALKER_R + 0.01); w.pos.z = o.z + (dz / d) * (o.r + WALKER_R + 0.01);
        if (this.hit(w.pos.x, w.pos.z) === 'agua') { w.pos.x = px; w.pos.z = pz; } // nunca empujar al agua
      }
      w.moving = !!w.target && w.wait <= 0;
      w.anim = !w.target && act.lugar !== 'casa' ? act.anim || null : null;
      w.ground = this.groundAt(w.pos.x, w.pos.z);
    }
    // Separación entre habitantes (rejilla espacial O(N)) para que no se atraviesen ni queden encimados
    const CELL = 1.1;
    const grid = new Map();
    for (const w of this.walkers) {
      if (w.hidden) continue;
      const cx = Math.floor(w.pos.x / CELL), cz = Math.floor(w.pos.z / CELL);
      const k = cx * 73856093 ^ cz * 19349663;
      let b = grid.get(k); if (!b) { b = []; grid.set(k, b); } b.push(w);
    }
    for (const w of this.walkers) {
      if (w.hidden) continue;
      const onBrW = enPuente(w.pos);
      const cx = Math.floor(w.pos.x / CELL), cz = Math.floor(w.pos.z / CELL);
      for (let ix = -1; ix <= 1; ix++) for (let iz = -1; iz <= 1; iz++) {
        const list = grid.get((cx + ix) * 73856093 ^ (cz + iz) * 19349663);
        if (!list) continue;
        for (const o of list) {
          if (o === w || o.handle <= w.handle) continue;
          const minD = (onBrW || enPuente(o.pos)) ? 0.38 : 0.72;
          const dx = o.pos.x - w.pos.x, dz = o.pos.z - w.pos.z, d2 = dx * dx + dz * dz;
          if (d2 >= minD * minD) continue;
          const d = Math.sqrt(d2) || 0.001, push = (minD - d) * 0.45;
          const nx = d2 < 0.0001 ? Math.cos(w.phase) : dx / d, nz = d2 < 0.0001 ? Math.sin(w.phase) : dz / d;
          const wx = w.pos.x - nx * push, wz = w.pos.z - nz * push;
          const ox = o.pos.x + nx * push, oz = o.pos.z + nz * push;
          if (!this.hit(wx, wz)) { w.pos.x = wx; w.pos.z = wz; }
          if (!this.hit(ox, oz)) { o.pos.x = ox; o.pos.z = oz; }
        }
      }
    }
    this.crowd.update(t, this.weather);
    for (const w of this.walkers) if (w.animal) animarAnimal(w.animal, w, t);
  }

  // Qué está haciendo ahora un habitante visible (para la ficha)
  activityOf(handle) { const w = this.walkers.find((x) => x.handle === handle); return w?.act || null; }

  // ---------- Motor de Peticiones en Vivo (Reutilizable para proyectos de interacción social) ----------
  // Inserta una construcción/prop 3D Low-Poly en caliente sin reconstruir la isla completa.
  applyLivePetition(pet = {}) {
    if (!this.root) return null;
    this.livePetitions = this.livePetitions || new Map();
    const id = String(pet.id || `${pet.autor || 'anon'}:${pet.titulo || pet.texto || 'item'}`);
    if (this.livePetitions.has(id)) return this.livePetitions.get(id);

    const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.78, flatShading: true, ...extra });
    const texto = String(pet.texto || pet.titulo || '').toLowerCase();
    const tipo = pet.tipo || (
      /ovni|nave|cohete|espacial/.test(texto) ? 'nave' :
      /estadio|bombonera|cancha|futbol|fútbol/.test(texto) ? 'estadio' :
      /rascacielos|torre|edificio/.test(texto) ? 'edificio' :
      /estatua|monumento|guerrero|soldado|griego/.test(texto) ? 'estatua' :
      /auto|carro|coche|taller|hot wheels/.test(texto) ? 'vehiculo' : 'tienda'
    );
    const colMain = pet.color || '#f97316';
    const autorClean = String(pet.autor || 'comunidad').replace(/^@/, '');

    // Buscar posición libre en la isla si no viene coordenada fija
    let px = Number.isFinite(pet.x) ? pet.x : null;
    let pz = Number.isFinite(pet.z) ? pet.z : null;
    if (px === null || pz === null) {
      const idx = this.livePetitions.size;
      const candidates = [];
      for (let k = 0; k < 18; k++) {
        const ang = (idx * 1.15 + k * 0.55) % (Math.PI * 2);
        const rad = 12 + (k % 5) * 4.8;
        candidates.push([Math.cos(ang) * rad, Math.sin(ang) * rad]);
      }
      const spot = this.#findClearSpot(candidates, 2.2, [], 0.8);
      px = spot.x; pz = spot.z;
    }
    const py = Math.max(0.25, this.height(px, pz));

    const grp = new THREE.Group();
    let labelH = 3.2;

    if (tipo === 'edificio') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 2.0), M('#c2410c'));
      base.position.y = 0.55; grp.add(base);
      const tower = new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.8, 1.8), M(colMain));
      tower.position.y = 3.0; grp.add(tower);
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.18, 2.05), M('#ffedd5'));
      ledge.position.y = 4.95; grp.add(ledge);
      for (const ex of [-0.45, 0.45]) {
        const sclera = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), M('#ffffff'));
        sclera.scale.set(1, 0.9, 0.5); sclera.position.set(ex, 3.6, 0.92); grp.add(sclera);
        const pupil = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.06, 6), M('#0f172a'));
        pupil.rotation.x = Math.PI * 0.5; pupil.position.set(ex, 3.6, 0.98); grp.add(pupil);
      }
      labelH = 5.6;
    } else if (tipo === 'nave') {
      const saucer = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.85, 0.36, 10), M('#94a3b8', { metalness: 0.5 }));
      saucer.position.y = 3.2; grp.add(saucer);
      const dome = new THREE.Mesh(new THREE.IcosahedronGeometry(0.82, 1), M('#38bdf8', { emissive: '#0284c7', emissiveIntensity: 0.9 }));
      dome.scale.set(1, 0.65, 1); dome.position.y = 3.5; grp.add(dome);
      labelH = 4.8;
    } else if (tipo === 'estadio') {
      const pitch = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 2.4), M('#22c55e'));
      pitch.position.y = 0.08; grp.add(pitch);
      [0, 1, 2].forEach((t) => {
        const st = new THREE.Mesh(new THREE.BoxGeometry(3.4 + t * 0.25, 0.45, 0.48), M(t === 1 ? '#facc15' : '#1d4ed8'));
        st.position.set(0, 0.32 + t * 0.44, -1.35 - t * 0.24); grp.add(st);
      });
      labelH = 2.8;
    } else if (tipo === 'estatua') {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.8, 0.7, 7), M('#cbd5e1'));
      ped.position.y = 0.35; grp.add(ped);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 1.15, 7), M(colMain));
      body.position.y = 1.25; grp.add(body);
      const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), M('#eab688'));
      head.position.y = 2.02; grp.add(head);
      labelH = 2.9;
    } else {
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.45, 1.7), M(colMain));
      body.position.y = 0.725; grp.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(1.55, 0.85, 4), M('#ea580c'));
      roof.position.y = 1.85; roof.rotation.y = Math.PI * 0.25; grp.add(roof);
      const awning = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.14, 0.55), M('#ef4444'));
      awning.position.set(0, 1.05, 1.02); awning.rotation.x = 0.3; grp.add(awning);
      labelH = 2.8;
    }

    grp.position.set(px, py, pz);
    grp.scale.setScalar(0.01);
    grp.traverse((o) => { o.castShadow = !this.gamaBaja; o.receiveShadow = !this.gamaBaja; });
    this.root.add(grp);
    this.addObstacle(px, pz, 2.0);

    const icono = pet.icono || (tipo === 'edificio' ? '🏢' : tipo === 'nave' ? '🛸' : tipo === 'estadio' ? '🏟️' : tipo === 'estatua' ? '🗿' : '✨');
    const titulo = pet.titulo || (pet.texto ? String(pet.texto).slice(0, 28) : 'PETICIÓN EN VIVO');
    const lbl = this.#label(`${icono} ${titulo.toUpperCase()} (@${autorClean})`, new THREE.Vector3(px, py + labelH, pz), 'lbl lbl-building');

    // Animación elástica de aparición (pop-in 3D Low-Poly)
    let animT = 0;
    this.animProps.push((t, dt = 0.016) => {
      if (animT < 1) {
        animT = Math.min(1, animT + dt * 2.4);
        const s = animT < 0.7 ? (animT / 0.7) * 1.14 : 1.14 - ((animT - 0.7) / 0.3) * 0.14;
        grp.scale.setScalar(Math.max(0.01, s));
      } else if (tipo === 'nave') {
        grp.position.y = py + Math.sin(t * 2.2) * 0.28;
        grp.rotation.y = t * 1.1;
      }
    });

    if (pet.volarCamara) {
      this.cameraTween = {
        p0: this.camera.position.clone(),
        t0: this.controls.target.clone(),
        p1: new THREE.Vector3(px + 9, py + 7.5, pz + 11),
        t1: new THREE.Vector3(px, py + 1.8, pz),
        t: 0,
        dur: 1.35,
      };
    }

    const entry = { id, group: grp, label: lbl, pos: new THREE.Vector3(px, py, pz), pet };
    this.livePetitions.set(id, entry);
    return entry;
  }
}
