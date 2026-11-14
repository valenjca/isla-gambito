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
const unir = (...ps) => mergeGeometries(ps.flat());
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
const SECTOR_MIN = -125, SECTOR_MAX = 125;
// Calle del Comercio: emprendimientos de los habitantes, al oeste del puente camino a la playa
export const COMERCIO = { z: BRIDGE_Z, x0: riverX(BRIDGE_Z) - (RIVER.half + RIVER.bank) - 3.2, paso: 3.4, fondo: 3.1 };
// Escala de objetos (casas, personas, árboles, edificios): más pequeña = cabe más en la isla.
const S = 0.7;
const WALKER_R = 0.22; // radio de colisión de un habitante
// Móvil: menos píxeles, sin antialias, sombras simples (sin las de los árboles), menos pasto y menos placas de @.
export const MOVIL = typeof window !== 'undefined' && !new URLSearchParams(location.search).has('reel')
  && (matchMedia('(pointer: coarse)').matches || innerWidth < 760 || new URLSearchParams(location.search).has('ligero'));
const UP = new THREE.Vector3(0, 1, 0);
const ALT_TEXTO = { vecino: 'de visita en casa de un vecino (la plaza estaba llena)', colina: 'mirando el atardecer desde la colina', playa: 'paseando por la playa', casa: 'en casa, que la plaza estaba a reventar' };

export class World3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: !MOVIL, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, MOVIL ? 1 : 2));
    this.renderer.shadowMap.enabled = !MOVIL;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels-layer';
    container.appendChild(this.labels.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#b5e2f5', 180, 560);
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
    this.hemi = new THREE.HemisphereLight('#dff4ff', '#4b6b40', 0.95); this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff2da', 2.25);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(MOVIL ? 1024 : 2048, MOVIL ? 1024 : 2048);
    const c = this.sun.shadow.camera; c.left = c.bottom = -78; c.right = c.top = 78; c.near = 20; c.far = 420;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);
    // Luz indirecta de rebote (sin sombras, costo mínimo): suaviza las caras en sombra
    this.bounce = new THREE.DirectionalLight('#ffd9b8', 0.36);
    this.bounce.position.set(-120, 60, -90);
    this.scene.add(this.bounce);
  }
  #sky() {
    const g = new THREE.BufferGeometry(); const n = 900; const p = new Float32Array(n * 3); const r = mulberry(9);
    for (let i = 0; i < n; i++) { const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.9 + 0.1); p.set([Math.sin(ph) * Math.cos(th) * 700, Math.cos(ph) * 700, Math.sin(ph) * Math.sin(th) * 700], i * 3); }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false }));
    this.scene.add(this.stars);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 16), new THREE.MeshBasicMaterial({ color: '#f5f1dc', fog: false }));
    this.scene.add(this.moon);
  }
  #ocean() {
    const segs = MOVIL ? 42 : 72;
    const g = new THREE.PlaneGeometry(840, 840, segs, segs); g.rotateX(-Math.PI / 2);
    // Mapa de profundidad del terreno (96x96, ~9 KB): permite agua turquesa en orillas/río y espuma costera en GPU sin costo CPU
    const ds = 96;
    const data = new Uint8Array(ds * ds * 4);
    for (let i = 0; i < data.length; i += 4) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255; }
    this.depthTex = new THREE.DataTexture(data, ds, ds, THREE.RGBAFormat);
    this.depthTex.magFilter = THREE.LinearFilter;
    this.depthTex.minFilter = THREE.LinearFilter;
    this.depthTex.needsUpdate = true;
    this.depthTexSize = ds;
    this.depthSpan = { value: 120 };

    const mat = MOVIL
      ? new THREE.MeshLambertMaterial({ color: '#1b85a6', flatShading: true })
      : new THREE.MeshStandardMaterial({ color: '#1b85a6', roughness: 0.24, metalness: 0.08, flatShading: true, transparent: true, opacity: 0.94 });
    this.oceanT = { value: 0 }; // tiempo de las olas (flatShading calcula la normal en el sombreador: no hace falta recalcularla)
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uOlas = this.oceanT;
      sh.uniforms.uDepthTex = { value: this.depthTex };
      sh.uniforms.uDepthSpan = this.depthSpan;
      sh.vertexShader = 'uniform float uOlas;\nvarying vec3 vWorldPos;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed.y += sin(position.x * 0.048 + uOlas * 0.72) * 0.14 + cos(position.z * 0.062 + uOlas * 0.55) * 0.12 + sin((position.x + position.z) * 0.09 - uOlas * 0.45) * 0.05;\n  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'uniform float uOlas;\nuniform sampler2D uDepthTex;\nuniform float uDepthSpan;\nvarying vec3 vWorldPos;\n' + sh.fragmentShader.replace('#include <color_fragment>',
        `#include <color_fragment>
        vec2 dUv = vWorldPos.xz / (uDepthSpan * 2.0) + 0.5;
        vec3 deepCol = vec3(0.08, 0.42, 0.58);
        vec3 shallowCol = vec3(0.24, 0.80, 0.84);
        float inBox = step(0.001, dUv.x) * step(dUv.x, 0.999) * step(0.001, dUv.y) * step(dUv.y, 0.999);
        float edgeMask = smoothstep(0.0, 0.08, min(min(dUv.x, 1.0 - dUv.x), min(dUv.y, 1.0 - dUv.y))) * inBox;
        float hNorm = texture2D(uDepthTex, clamp(dUv, 0.0, 1.0)).r;
        float hWorld = mix(-6.0, hNorm * 10.0 - 6.0, edgeMask);
        float shallow = smoothstep(-3.6, -0.15, hWorld);
        vec3 waterCol = mix(deepCol, mix(diffuseColor.rgb, shallowCol, shallow), smoothstep(-5.4, -1.0, hWorld));
        float wave = sin(hWorld * 18.0 - uOlas * 2.6 + vWorldPos.x * 0.28 + vWorldPos.z * 0.24) * 0.5 + 0.5;
        float foamBand = smoothstep(-0.55, -0.05, hWorld) * (1.0 - smoothstep(0.02, 0.35, hWorld));
        float foamRipple = smoothstep(-0.9, -0.25, hWorld) * (1.0 - smoothstep(-0.25, 0.05, hWorld)) * smoothstep(0.55, 0.88, wave);
        float foam = clamp(foamBand * 0.82 + foamRipple * 0.45, 0.0, 0.92) * edgeMask;
        diffuseColor.rgb = mix(waterCol, vec3(0.93, 0.98, 1.0), foam);`);
    };
    this.ocean = new THREE.Mesh(g, mat);
    this.ocean.receiveShadow = !MOVIL; this.scene.add(this.ocean);
    if (!MOVIL) {
      // fondo marino para dar color de agua poco profunda
      const floor = new THREE.Mesh(new THREE.CircleGeometry(430, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#0d4e66' }));
      floor.position.y = -6; this.scene.add(floor);
    }
  }
  #rain() {
    const n = 4000; const p = new Float32Array(n * 3); const r = mulberry(3);
    for (let i = 0; i < n; i++) p.set([(r() - 0.5) * 300, r() * 120, (r() - 0.5) * 300], i * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.rain = new THREE.Points(g, new THREE.PointsMaterial({ color: '#cfe8ff', size: 0.35, transparent: true, opacity: 0.7 }));
    this.rain.visible = false; this.scene.add(this.rain);
  }
  #clouds() {
    this.cloudGroup = new THREE.Group(); const r = mulberry(21);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, transparent: true, opacity: 0.95 });
    this.cloudMat = mat;
    for (let i = 0; i < 16; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + r() * 4, 0), mat); s.position.set(k * 4 - 8, r() * 2, r() * 4 - 2); c.add(s); }
      const ang = (i / 16) * Math.PI * 2 + r() * 0.3;
      const dist = 105 + r() * 140;
      c.position.set(Math.cos(ang) * dist, 92 + r() * 26, Math.sin(ang) * dist); c.userData.v = 0.5 + r();
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
    const R = this.R; const size = R * 2.6; const seg = MOVIL ? Math.min(130, Math.floor(R * 2.1)) : Math.min(220, Math.floor(R * 3.2));
    const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position; const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color(), tmp = new THREE.Color();
    const cDeepSea = new THREE.Color('#0d526b');
    const cWetSand = new THREE.Color('#c2ad7c');
    const cBeachSand = new THREE.Color('#f4e2b0');
    const cShoreRock = new THREE.Color('#7f8272');
    const cBankMud = new THREE.Color('#9e8f6b');
    const cRiverMoss = new THREE.Color('#5a9444');
    const cGrassLight = new THREE.Color('#86c45c');
    const cGrassDeep = new THREE.Color('#4f8f42');
    const cHighRock = new THREE.Color('#979483');

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
    if (this.esYoutube) {
      this.#youtubePerimeterWall();
      this.#youtubeExaggeratedBuilds(plots);
    } else {
      this.#instagramFeatures(state, plots);
    }
    this.#trees(plots);
    this.#playaDecor();
    this.#walkers(state, plots);
    this.#flag(state);
    this.#landmarks();
    this.#zoneLabels(state);
    this.#vecina();
    // Precalentar: simula un minuto de la isla al construirla, para que nadie aparezca «en su casa» al abrir la página
    // (el pescador ya está en la playa, la mafia en la plaza…). Se repite en cada reconstrucción en vivo.
    for (let i = 0; i < 450; i++) this.#walk(0.15, (this.simT || 0) + i * 0.15);
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
    const CUSTOM_TIER = { 'andrxx_07_': 'tres_pisos', 'martinretamal-ik8lf': 'tres_pisos', 'levantandounlapiz': 'triangular', 'isabel.angel30': 'alta', 'jake.apaza': 'media', 'thiagosantibaez8': 'alta', 'micaiashuenchumil': 'alta' };
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
        const sc = (0.92 + ((r.color >>> 8) % 24) / 100) * S * (clase?.escala || 1);
        s.set(sc, sc, sc);
        q.setFromEuler(e.set(0, rot, 0));
        m.compose(new THREE.Vector3(p.x, p.y + cfg.bodyY * sc, p.z), q, s);
        body.setMatrixAt(idx, m); win.setMatrixAt(idx, m); fachada.setMatrixAt(idx, m);
        body.setColorAt(idx, c.set(cfg.walls[r.color % cfg.walls.length]));
        q.setFromEuler(e.set(0, rot + cfg.roofRot, 0));
        m.compose(new THREE.Vector3(p.x, p.y + cfg.roofY * sc, p.z), q, s);
        roof.setMatrixAt(idx, m);
        roof.setColorAt(idx, c.set(cfg.roofs[(r.color >>> 3) % cfg.roofs.length]));
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
    const roadMat = new THREE.MeshStandardMaterial({ color: '#383d47', roughness: 0.85, flatShading: true });
    const sidewalkMat = new THREE.MeshStandardMaterial({ color: '#dfd8cb', roughness: 0.8, flatShading: true });
    const curbMat = new THREE.MeshStandardMaterial({ color: '#888275', roughness: 0.9, flatShading: true });
    const crosswalkMat = new THREE.MeshStandardMaterial({ color: '#f1f5f9', roughness: 0.7, flatShading: true });
    const lampPoleMat = new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.6, flatShading: true });
    const lampBulbMat = new THREE.MeshStandardMaterial({ color: '#ffe599', emissive: '#ffb703', emissiveIntensity: 1.2 });

    const roadGroup = new THREE.Group();
    const sidewalkGroup = new THREE.Group();
    const lampGroup = new THREE.Group();

    // Crea un bloque que se amolda exactamente al relieve height(x, z) en toda su longitud
    const conformMesh = (w, h, d, cx, cz, segX, segZ, yOff, mat) => {
      const geo = new THREE.BoxGeometry(w, h, d, segX, 1, segZ);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i);
        pos.setY(i, this.height(cx + vx, cz + vz) + vy + yOff);
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(cx, 0, cz);
      mesh.receiveShadow = true;
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

    // 1) Aceras y red vial alrededor de cada manzana habitada
    for (const key of (this.manzanasUsadas || [])) {
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
    }
    for (const { rx, cz } of seenV.values()) {
      roadGroup.add(conformMesh(2.0, 0.04, roadSegLen, rx, cz, 2, 6, 0.02, roadMat));
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

    // 3) Rambla Comercial (lado oeste hacia la playa)
    const nNeg = (state.negocios || []).length;
    const commCols = Math.max(3, Math.min(5, Math.ceil(nNeg / 2) + 1));
    const westStart = rx - bridgeHalf;
    const westEnd = westStart - (commCols * (COMERCIO.paso + 0.6) + 5.5);
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

    // 5) Anillo vial al este de la Plaza para conectar con las calles residenciales (sin invadir la ribera del río ni edificios)
    const ringStartX = Math.max(TOWN.x + 0.6, rxAt(0) + bridgeHalf + 2.2);
    const ringRightX = TOWN.x + 5.4;
    const ringTopZ = -5.6;
    const ringBotZ = 5.6;
    const ringSpanX = Math.max(2.0, ringRightX - ringStartX);
    const ringMidX = (ringStartX + ringRightX) * 0.5;
    const clearOfBuildings = (x, z) => (this.buildingAnchors || []).every((b) => Math.hypot(x - b.x, z - b.z) > 3.8);
    if (clearOfBuildings(ringMidX, ringTopZ) && ringStartX > rxAt(ringTopZ) + bridgeHalf + 0.8) {
      roadGroup.add(conformMesh(ringSpanX + 1.0, 0.04, 2.0, ringMidX, ringTopZ, 5, 2, 0.02, roadMat));
    }
    if (clearOfBuildings(ringMidX, ringBotZ) && ringStartX > rxAt(ringBotZ) + bridgeHalf + 0.8) {
      roadGroup.add(conformMesh(ringSpanX + 1.0, 0.04, 2.0, ringMidX, ringBotZ, 5, 2, 0.02, roadMat));
    }
    if (clearOfBuildings(ringRightX, 0)) {
      roadGroup.add(conformMesh(2.0, 0.04, ringBotZ - ringTopZ + 2.0, ringRightX, 0, 2, 6, 0.02, roadMat));
    }

    // Ruta de circulación para la ambulancia por las calles asfaltadas del pueblo (al este del río, sin cruzar el puente peatonal)
    const loopPts = [
      { x: ringStartX, z: ringBotZ },
      { x: ringRightX, z: ringBotZ },
    ];
    if (seenV.size > 0) {
      const eastV = [...seenV.values()].sort((a, b) => Math.hypot(a.rx - ringRightX, a.cz) - Math.hypot(b.rx - ringRightX, b.cz))[0];
      if (eastV && eastV.rx > ringRightX + 1.5 && Math.abs(eastV.rx - rxAt(0)) > bridgeHalf + 1.0) {
        roadGroup.add(conformMesh(eastV.rx - ringRightX, 0.04, 2.0, (ringRightX + eastV.rx) * 0.5, ringBotZ, 4, 2, 0.02, roadMat));
        roadGroup.add(conformMesh(eastV.rx - ringRightX, 0.04, 2.0, (ringRightX + eastV.rx) * 0.5, ringTopZ, 4, 2, 0.02, roadMat));
        roadGroup.add(conformMesh(2.0, 0.04, ringBotZ - ringTopZ + 2.0, eastV.rx, 0, 2, 6, 0.02, roadMat));
        loopPts.push({ x: eastV.rx, z: ringBotZ });
        loopPts.push({ x: eastV.rx, z: ringTopZ });
      }
    }
    loopPts.push(
      { x: ringRightX, z: ringTopZ },
      { x: ringStartX, z: ringTopZ },
      { x: ringRightX, z: ringTopZ },
      { x: ringRightX, z: ringBotZ }
    );
    this.ambulanceLoop = loopPts;

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
    (state.negocios || []).forEach((n, i) => {
      const colIdx = Math.floor(i / 2) % 5; const fila = Math.floor(i / 10);
      const lado = i % 2 ? 1 : -1;
      const x = COMERCIO.x0 - colIdx * (COMERCIO.paso + 0.6) - 1.4;
      const z = COMERCIO.z + lado * (COMERCIO.fondo + 1.0 + fila * 5.2);
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
        // Plaza escalonada de piedra con radios, 4 bancas, 4 faroles y fuente ornamental de 2 niveles
        add(new THREE.CylinderGeometry(6.2, 6.4, 0.28, 24), '#d8cfb8', 0.14);
        add(new THREE.CylinderGeometry(5.6, 5.7, 0.12, 24), '#ece2cc', 0.32);
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4;
          const bx = Math.cos(a) * 4.3, bz = Math.sin(a) * 4.3;
          const bench = add(new THREE.BoxGeometry(1.5, 0.22, 0.55), '#8d5a2b', 0.5, bx, bz); bench.rotation.y = -a + Math.PI / 2;
          const post = add(new THREE.CylinderGeometry(0.07, 0.1, 2.1, 6), '#2b303a', 1.35, Math.cos(a + 0.35) * 5.1, Math.sin(a + 0.35) * 5.1);
          const fBulb = add(new THREE.OctahedronGeometry(0.2, 0), '#ffe5a3', 2.48, Math.cos(a + 0.35) * 5.1, Math.sin(a + 0.35) * 5.1);
          fBulb.material.emissive = new THREE.Color('#ffaa33'); fBulb.material.emissiveIntensity = 0.85;
        }
        add(new THREE.CylinderGeometry(1.85, 2.05, 0.5, 16), '#a5a58d', 0.58);
        add(new THREE.CylinderGeometry(1.55, 1.55, 0.16, 16), '#4cc9f0', 0.86);
        add(new THREE.CylinderGeometry(0.55, 0.72, 0.9, 12), '#8d99ae', 1.15);
        add(new THREE.CylinderGeometry(0.95, 0.6, 0.22, 12), '#b8b8a4', 1.55);
        const chorro = add(new THREE.CylinderGeometry(0.16, 0.32, 0.95, 8), '#90e0ef', 2.0);
        this.animProps.push((t) => { chorro.scale.y = 0.75 + Math.sin(t * 4.5) * 0.28; chorro.position.y = 1.8 + chorro.scale.y * 0.3; });
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
    const civicOrder = [...ZONES.keys()].sort(() => mulberry(901)() - 0.5);
    const rng = mulberry(901);
    for (let i = civicOrder.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [civicOrder[i], civicOrder[j]] = [civicOrder[j], civicOrder[i]]; }
    let civic = 0;
    const usedCenters = [...(this.manzanasUsadas || [])].map((key) => {
      const gx = Math.round(key / 1000); const gz = key - gx * 1000;
      return { x: TOWN.x + gx * PASO, z: TOWN.z + gz * PASO };
    });
    const libreEdif = (x, z) => x > riverX(z) + RIVER.half + RIVER.bank + 4.0
      && Math.hypot(x - FLAG.x, z - FLAG.z) > 5.5
      && Math.hypot(x - TOWN.x, z - TOWN.z) > 10.5
      && !(Math.abs(z - BRIDGE_Z) < 4.0 && x < TOWN.x + 2)
      && usedCenters.every((c) => Math.hypot(c.x - x, c.z - z) > 6.8)
      && plots.every((h) => Math.hypot(h.x - x, h.z - z) > 5.2)
      && this.buildingAnchors.every((a) => Math.hypot(a.x - x, a.z - z) > 7.0);
    state.buildings.forEach((b, i) => {
      const mesh = this.buildingMesh(b.kind, b.label);
      let p;
      if (b.kind === 'faro' || b.kind === 'muelle' || b.kind === 'hallazgo') {
        const a = b.kind === 'faro' ? -Math.PI / 2 - 0.4 : BEACH.ang + (b.kind === 'muelle' ? -0.25 : 0.2) + (i % 3) * 0.08; let r = this.R * 0.6; while (this.height(Math.cos(a) * r, Math.sin(a) * r) > 0.4 && r < this.R * 1.3) r += 0.5;
        p = new THREE.Vector3(Math.cos(a) * (r - (b.kind === 'faro' ? 2 : b.kind === 'hallazgo' ? 0.2 : 1)), 0, Math.sin(a) * (r - 1)); mesh.rotation.y = -a + Math.PI / 2 * (b.kind === 'muelle' ? 1 : 0);
        if (b.kind === 'muelle') mesh.rotation.y = Math.atan2(Math.cos(a), Math.sin(a));
      } else if (b.kind === 'mercado' || b.kind === 'taller') {
        // Edificios comerciales/productivos pegados a la Rambla Comercial (lado oeste / playa)
        const ci = comm++; const lado = ci % 2 ? 1 : -1;
        const bx = COMERCIO.x0 - 2.0 - Math.floor(ci / 2) * 7.0;
        const bz = COMERCIO.z + lado * (COMERCIO.fondo + 2.4);
        p = new THREE.Vector3(bx, 0, bz);
        mesh.rotation.y = lado > 0 ? Math.PI : 0; // mirando hacia la Rambla Comercial
      } else if (b.kind === 'plaza' && !this._plazaDone) {
        p = new THREE.Vector3(TOWN.x, 0, TOWN.z); this._plazaDone = true;
      } else if (b.kind === 'estadio') {
        // Cancha de fútbol junto a la playa oeste
        const a = BEACH.ang - 0.22;
        let r = this.R * 0.62;
        while (this.height(Math.cos(a) * r, Math.sin(a) * r) > 0.85 && r < this.R * 0.92) r += 0.5;
        p = new THREE.Vector3(Math.cos(a) * (r - 4.2), 0, Math.sin(a) * (r - 4.2));
        mesh.rotation.y = -a + Math.PI / 2;
      } else {
        // Edificios cívicos repartidos por zonas aleatorias (norte, noreste, sureste, sur, suroeste, noroeste) sin pisar casas
        const sec = civicOrder[civic++ % civicOrder.length];
        const pasoDeg = (SECTOR_MAX - SECTOR_MIN) / 6;
        const baseDeg = SECTOR_MIN + (sec + 0.5) * pasoDeg;
        const rB = mulberry(b.kind.length * 131 + civic * 37);
        for (let dist = 13.5; dist <= Math.max(24, this.R * 0.8); dist += 2.2) {
          for (const dAng of [0, 8, -8, 15, -15]) {
            const ang = THREE.MathUtils.degToRad(baseDeg + dAng + (rB() - 0.5) * 6);
            const tx = TOWN.x + Math.cos(ang) * dist, tz = TOWN.z + Math.sin(ang) * dist;
            if (libreEdif(tx, tz)) { p = new THREE.Vector3(tx, 0, tz); break; }
          }
          if (p) break;
        }
        if (!p) { const ang = THREE.MathUtils.degToRad(baseDeg); p = new THREE.Vector3(TOWN.x + Math.cos(ang) * 9.5, 0, TOWN.z + Math.sin(ang) * 9.5); }
        mesh.rotation.y = Math.atan2(TOWN.x - p.x, TOWN.z - p.z);
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
      { const gx = Math.round((x - TOWN.x) / PASO), gz = Math.round((z - TOWN.z) / PASO); if (this.manzanasUsadas?.has(gx * 1000 + gz)) continue; }
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
  #findClearSpot(candidates, radius, plots = [], minHeight = 1.05) {
    const isFree = (x, z) => {
      const R = this.esYoutube ? this.R * (1 + 0.19 * Math.cos(3 * Math.atan2(z, x))) : this.R;
      const d = Math.hypot(x, z) / R;
      if (d > (this.esYoutube ? 0.72 : 0.78)) return false; // dentro de la isla y lejos de la muralla/borde
      if (this.height(x, z) < minHeight) return false;
      if (this.inRiver(x, z, radius + 0.8)) return false;
      if (Math.hypot(x - TOWN.x, z - TOWN.z) < 6.8 + radius) return false;
      if (Math.hypot(x - FLAG.x, z - FLAG.z) < 4.0 + radius) return false;
      if (Math.abs(z - BRIDGE_Z) < 4.2 + radius && x < TOWN.x) return false;
      for (const m of (this.manzanaCoords || [])) {
        if (Math.max(Math.abs(x - m.cx), Math.abs(z - m.cz)) < 5.6 + radius) return false;
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
  #youtubeExaggeratedBuilds(plots = []) {
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

    this.root.add(g);
  }

  // ---------- Características exclusivas de Isla Instagram (Vaeloria - 104 Habitantes) ----------
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

    // 2. Tanque casero para @thomasjaime25 en terreno despejado (claro oeste/suroeste lejos de casas y río)
    const tankSpot = this.#findClearSpot([[-15, 11], [-15, -11], [-18, 14], [TOWN.x + 8, TOWN.z + 2]], 2.2, plots, 1.1);
    const tx = tankSpot.x, tz = tankSpot.z, ty = tankSpot.y;
    const tank = new THREE.Group();
    const tankGreen = M('#4b5320');
    const treadMat = M('#2b2b2b');

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

    tank.position.set(tx, ty, tz);
    tank.rotation.y = 0.35;
    g.add(tank);
    this.addObstacle(tx, tz, 1.4);
    this.tankPos = new THREE.Vector3(tx, ty, tz);
    this.#label('🛡️ TANQUE DE @thomasjaime25', new THREE.Vector3(tx, ty + 2.0, tz), 'lbl lbl-building');

    // 3. Mascota guerrera: Zapato con pies, un ojo y rama que busca pelea (@lauyateloavise)
    const shoe = new THREE.Group();
    const shoeMat = M('#7f5539');
    const sx = TOWN.x + 2.2, sz = TOWN.z + 3.1, sy = this.height(sx, sz);

    // Cuerpo en forma de zapato
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.16, 0.38), M('#1b1b1e')); sole.position.y = 0.18; shoe.add(sole);
    const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.34), shoeMat); sBody.position.set(0.05, 0.36, 0); shoe.add(sBody);
    // Un solo ojo grande
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), M('#ffffff')); eyeWhite.position.set(0.28, 0.46, 0); shoe.add(eyeWhite);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), M('#000000')); pupil.position.set(0.38, 0.46, 0); shoe.add(pupil);
    // Patitas
    [-0.1, 0.1].forEach((pz) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.18, 5), M('#f4a261'));
      leg.position.set(0, 0.09, pz); shoe.add(leg);
    });
    // Rama de árbol que busca pelea
    const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 4), M('#582f0e'));
    branch.rotation.z = Math.PI / 3; branch.position.set(0.18, 0.45, 0.25); shoe.add(branch);

    shoe.position.set(sx, sy, sz);
    g.add(shoe);
    this.#label('👞 ZAPATO GUERRERO (@lauyateloavise)', new THREE.Vector3(sx, sy + 1.2, sz), 'lbl lbl-building');

    this.animProps.push((t) => {
      shoe.rotation.y = Math.sin(t * 3) * 0.35;
      branch.rotation.z = Math.PI / 3 + Math.sin(t * 6) * 0.2;
    });

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
    // ---- Puente estilizado de piedra y madera sobre el río, alineado con el camino del pueblo
    const rx = riverX(BRIDGE_Z); const len = (RIVER.half + RIVER.bank) * 2 + 1.5; const top = TOWN.h + 0.25;
    const bridge = new THREE.Group();
    const bridgeStone = M('#8e8b82', { roughness: 0.92 });
    const bridgeStoneCap = M('#aba79c', { roughness: 0.85 });
    const bridgeTimber = M('#9c6644', { roughness: 0.85 });
    const bridgeTimberAlt = M('#875638', { roughness: 0.88 });
    const bridgeDarkWood = M('#654226', { roughness: 0.88 });
    const bridgeIron = M('#2b303a', { roughness: 0.5, metalness: 0.4 });
    const lanternGlow = new THREE.MeshStandardMaterial({ color: '#ffe5a3', emissive: '#ffaa33', emissiveIntensity: 1.2, roughness: 0.3 });

    // Estructura portante inferior + tablones individuales para dar textura artesanal
    const subDeck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.18, 2.7), bridgeDarkWood);
    subDeck.position.y = top - 0.17; bridge.add(subDeck);
    const plankCount = 16;
    const plankW = (len - 0.3) / plankCount;
    for (let i = 0; i < plankCount; i++) {
      const px = -len / 2 + 0.15 + (i + 0.5) * plankW;
      const plank = new THREE.Mesh(new THREE.BoxGeometry(plankW * 0.86, 0.08, 2.84), i % 2 ? bridgeTimber : bridgeTimberAlt);
      plank.position.set(px, top - 0.04, 0);
      bridge.add(plank);
    }
    // Estribos de piedra en ambos extremos del puente
    for (const sx of [-1, 1]) {
      const abut = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.4, 3.35), bridgeStone);
      abut.position.set(sx * (len / 2 - 0.25), top - 1.15, 0); bridge.add(abut);
      for (const sz of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.48, 1.35, 0.48), bridgeStone);
        pillar.position.set(sx * (len / 2 - 0.15), top + 0.45, sz * 1.42); bridge.add(pillar);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.14, 0.58), bridgeStoneCap);
        cap.position.set(sx * (len / 2 - 0.15), top + 1.15, sz * 1.42); bridge.add(cap);
        // Farol de hierro y luz cálida en cada entrada
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.42, 6), bridgeIron);
        post.position.set(sx * (len / 2 - 0.15), top + 1.42, sz * 1.42); bridge.add(post);
        const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), lanternGlow);
        lamp.position.set(sx * (len / 2 - 0.15), top + 1.68, sz * 1.42); bridge.add(lamp);
      }
    }
    // Vigas laterales arqueadas y barandillas de madera noble
    for (const sz of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len - 0.4, 0.12, 0.14), bridgeDarkWood);
      rail.position.set(0, top + 0.78, sz * 1.36); bridge.add(rail);
      const midRail = new THREE.Mesh(new THREE.BoxGeometry(len - 0.4, 0.07, 0.09), bridgeTimber);
      midRail.position.set(0, top + 0.42, sz * 1.36); bridge.add(midRail);
      for (let i = 1; i < 6; i++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.9, 0.14), bridgeDarkWood);
        post.position.set(-len / 2 + (i * len) / 6, top + 0.34, sz * 1.36); bridge.add(post);
      }
      // Segmentos de arco bajo el tablero
      for (let i = 0; i < 5; i++) {
        const t = (i - 2) / 2.2;
        const archSeg = new THREE.Mesh(new THREE.BoxGeometry(len / 5.1, 0.22, 0.22), bridgeStone);
        archSeg.position.set((i - 2) * (len / 5.4), top - 0.55 - t * t * 0.65, sz * 1.28);
        archSeg.rotation.z = -t * 0.24;
        bridge.add(archSeg);
      }
    }
    // Pilares con base de piedra en el cauce
    for (const sx of [-0.5, 0.5]) {
      const px = sx * RIVER.half * 1.55;
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 3.8, 7), bridgeDarkWood);
      pile.position.set(px, top - 2.0, 0); bridge.add(pile);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.52, 1.3, 7), bridgeStone);
      base.position.set(px, -0.7, 0); bridge.add(base);
    }
    bridge.position.set(rx, 0, BRIDGE_Z); bridge.traverse((o) => { o.castShadow = !MOVIL; o.receiveShadow = true; }); this.root.add(bridge);
    bridge.userData.pick = { type: 'lugar', id: 'puente', pos: bridge.position.clone() }; this.pickables.push(bridge);
    for (let x = -len / 2; x <= len / 2; x += 0.7) this.platforms.push({ x: rx + x, z: BRIDGE_Z, r: 1.05, top, bridge: true });
    for (const sz of [-1, 1]) for (let x = -len / 2; x <= len / 2; x += 0.6) this.addObstacle(rx + x, BRIDGE_Z + sz * 1.6, 0.15); // barandillas

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

  // Un habitante "dice" algo (mensaje del chat): bocadillo sobre su personaje si está a la vista.
  say(handle, text) {
    const w = this.walkers?.find((x) => x.handle === handle); if (!w) return false;
    this.bubbles = (this.bubbles || []).filter((b) => { if (b.w === w) { this.root.remove(b.label); return false; } return true; });
    const t = text.length > 90 ? text.slice(0, 88) + '…' : text;
    this.bubbles.push({ w, until: performance.now() + 7000, label: this.#label(`💬 ${t}`, w.pos.clone(), 'lbl lbl-bubble') });
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
    this.sun.position.set(Math.cos(sunAng) * 200, Math.sin(sunAng) * 220 + 10, 80); this.sun.intensity = 0.16 + day * 2.25;
    this.sun.color.set('#fff3de').lerp(new THREE.Color('#ff9d5c'), golden * 0.85);
    if (this.bounce) {
      this.bounce.intensity = 0.12 + day * 0.34 + golden * 0.18;
      this.bounce.color.set('#ffd9b8').lerp(new THREE.Color('#ff8e6e'), golden * 0.6);
    }
    this.moon.position.set(-Math.cos(sunAng) * 600, -Math.sin(sunAng) * 500 + 60, -200);
    const sky = new THREE.Color('#0c1736').lerp(new THREE.Color('#ff9e78'), golden)
      .lerp(new THREE.Color('#9ad7f2'), THREE.MathUtils.smoothstep(day, 0.2, 0.62));
    const grey = this.weather === 'lluvia' || this.weather === 'tormenta' ? 0.55 : this.weather === 'nublado' ? 0.3 : 0;
    sky.lerp(new THREE.Color('#7d8a95').multiplyScalar(0.3 + day * 0.7), grey);
    this.scene.background = sky; this.scene.fog.color.copy(sky);
    this.hemi.intensity = 0.26 + day * 0.74; this.sun.intensity *= 1 - grey * 0.6;
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
    if (MOVIL && !dtFijo && !this.manual && (this._perfTier || 0) < 2) {
      this._perfT = (this._perfT || 0) + dt; this._perfN = (this._perfN || 0) + 1;
      if (this._perfN >= 45) {
        const avg = this._perfT / this._perfN; this._perfT = 0; this._perfN = 0;
        if (!this._perfTier && avg > 0.045) { this._perfTier = 1; this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1)); }
        else if (this._perfTier === 1 && avg > 0.06) { this._perfTier = 2; this.renderer.shadowMap.enabled = false; }
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
    if (!MOVIL || (this._lblTick = ((this._lblTick || 0) + 1) % 3) === 0) {
      this.#updateNameTags();
      this.labels.render(this.scene, this.camera);
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
    if (!MOVIL) this.labels.render(this.scene, this.camera);
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
          const roam = act.accion !== 'trabajar' && w.rnd() < 0.24 ? pool[Math.floor(w.rnd() * pool.length)] : act.lugar;
          const spread = roam !== act.lugar ? 7 : (act.anim && act.accion !== 'social' ? 3.5 : act.accion === 'social' ? 8 : 6);
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
            w.target = null; w.wait = act.anim ? 4 + w.rnd() * 6 : act.accion === 'trabajar' ? 2.5 + w.rnd() * 4 : 1.5 + w.rnd() * 3;
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
}
