// Personajes low-poly. Cada habitante tiene un aspecto determinista según su @ (siempre el mismo),
// que se puede personalizar con un evento "aspecto" registrado en la historia.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

import { SKIN, HAIR, CLOTH, PANTS } from './looks.js';
export * from './looks.js';

function pieza(g, color, x = 0, y = 0, z = 0, { rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv');
  g.scale(sx, sy, sz); g.rotateZ(rz); g.rotateX(rx); g.rotateY(ry); g.translate(x, y, z);
  const c = new THREE.Color(color); const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
const unir = (...ps) => mergeGeometries(ps.flat());

function mulberry(seed) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];

export function appearanceFor(resident, vida = null) {
  const r = mulberry(resident.color ^ 0x9e3779b9);
  const base = {
    skin: pick(r, SKIN),
    hair: pick(r, HAIR.slice(0, 7)), // colores naturales por defecto; los llamativos se piden
    hairStyle: pick(r, ['corto', 'corto', 'largo', 'largo', 'moño', 'calvo']),
    shirt: pick(r, CLOTH),
    pants: pick(r, PANTS),
    hat: r() < 0.22 ? pick(r, ['gorra', 'sombrero', 'gorro']) : null,
    hatColor: pick(r, CLOTH),
    height: 0.9 + r() * 0.2,
    hasUmbrella: r() < 0.62, // ~62% de los vecinos llevan paraguas cuando llueve
    umbrellaColor: pick(r, ['#e63946', '#ffd166', '#3a86ff', '#06d6a0', '#ff70a6', '#9d4edd', '#ff9e00', '#2ec4b6', '#2b2d42', '#f4f1de', '#118ab2', '#e76f51']),
  };

  const handle = (resident.handle || '').toLowerCase();
  const oficio = vida?.oficio || resident.oficio || '';
  const rolTexto = (resident.rolTexto || '').toLowerCase();

  // 1) Médicos y doctores: bata blanca impoluta, pantalón celeste de quirófano y cofia
  if (oficio === 'medico' || handle === 'nezkuik_rj' || handle === 'afraylin_' || rolTexto.includes('doctor') || rolTexto.includes('medic')) {
    base.shirt = '#f8f9fa';
    base.pants = '#0284c7';
    base.hat = 'gorro';
    base.hatColor = '#38bdf8';
  }

  // 2) La Mafia: traje negro formal, pantalón negro de vestir y sombrero fedora oscuro
  if (oficio === 'villano' || rolTexto.includes('mafia') || handle === 'no_soy_zaac' || handle === 'shn.ww_7') {
    base.shirt = '#111111';
    base.pants = '#1a1a1a';
    base.hat = 'sombrero';
    base.hatColor = '#1a1a1a';
  }

  // 3) Magos: túnica mística morada y gorro místico
  if (oficio === 'mago' || handle === 'adr.iwaos' || rolTexto.includes('mago') || rolTexto.includes('hechiz')) {
    base.shirt = '#581c87';
    base.pants = '#2e1065';
    base.hat = 'gorro';
    base.hatColor = '#9333ea';
  }

  // 4) Futbolistas / deportistas: camiseta deportiva y short blanco
  if (oficio === 'deportista' || handle === 'valen.englad' || rolTexto.includes('futbol')) {
    base.shirt = '#dc2626';
    base.pants = '#ffffff';
    base.hat = null;
  }

  return { ...base, ...(resident.look || {}) };
}

// Geometrías compartidas
const G = {
  leg: new THREE.BoxGeometry(0.17, 0.45, 0.19).translate(0, -0.225, 0),
  arm: new THREE.BoxGeometry(0.13, 0.42, 0.14).translate(0, -0.21, 0),
  torso: new THREE.CylinderGeometry(0.24, 0.3, 0.56, 7),
  head: new THREE.IcosahedronGeometry(0.27, 1),
  eye: new THREE.BoxGeometry(0.06, 0.08, 0.03),
  hairCap: new THREE.SphereGeometry(0.29, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hairLong: new THREE.BoxGeometry(0.5, 0.5, 0.16),
  bun: new THREE.IcosahedronGeometry(0.13, 0),
  punk: new THREE.BoxGeometry(0.09, 0.22, 0.42),
  hatTop: new THREE.CylinderGeometry(0.22, 0.26, 0.24, 10),
  brim: new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14),
  visor: new THREE.BoxGeometry(0.3, 0.04, 0.22),
  cone: new THREE.ConeGeometry(0.27, 0.42, 8),
  crown: new THREE.CylinderGeometry(0.24, 0.2, 0.18, 6, 1, true),
  // herramientas y accesorios bien modelados (origen en la mano o torso)
  palo: new THREE.BoxGeometry(0.05, 1, 0.05).translate(0, 0.5, 0),
  hoja: unir(
    pieza(new THREE.BoxGeometry(0.05, 0.14, 0.22), '#7d8590', 0, 0, 0.04),
    pieza(new THREE.BoxGeometry(0.025, 0.18, 0.08), '#dce1e5', 0, 0, 0.16),
  ),
  sedal: new THREE.BoxGeometry(0.012, 1, 0.012).translate(0, -0.5, 0),
  balde: unir(
    pieza(new THREE.CylinderGeometry(0.14, 0.105, 0.24, 8), '#6b8ba4', 0, -0.14, 0),
    pieza(new THREE.CylinderGeometry(0.146, 0.146, 0.035, 8), '#3d4852', 0, -0.03, 0),
    pieza(new THREE.CylinderGeometry(0.125, 0.125, 0.015, 8), '#48cae4', 0, -0.045, 0),
    pieza(new THREE.BoxGeometry(0.28, 0.022, 0.022), '#4a5568', 0, 0.01, 0),
  ),
  libro: unir(
    pieza(new THREE.BoxGeometry(0.15, 0.025, 0.21), '#9e2a38', -0.072, 0, 0, { rz: -0.25 }),
    pieza(new THREE.BoxGeometry(0.15, 0.025, 0.21), '#9e2a38', 0.072, 0, 0, { rz: 0.25 }),
    pieza(new THREE.BoxGeometry(0.135, 0.028, 0.19), '#f4efe6', -0.068, 0.018, 0, { rz: -0.25 }),
    pieza(new THREE.BoxGeometry(0.135, 0.028, 0.19), '#f4efe6', 0.068, 0.018, 0, { rz: 0.25 }),
  ),
  guitarra: unir(
    // caja acústica (dos lóbulos) + boca + puente
    pieza(new THREE.CylinderGeometry(0.15, 0.15, 0.085, 10), '#c8803c', 0, -0.16, 0, { rx: Math.PI / 2 }),
    pieza(new THREE.CylinderGeometry(0.115, 0.115, 0.085, 10), '#d48d46', 0, -0.02, 0, { rx: Math.PI / 2 }),
    pieza(new THREE.CylinderGeometry(0.048, 0.048, 0.09, 10), '#2b190c', 0, -0.06, 0, { rx: Math.PI / 2 }),
    pieza(new THREE.BoxGeometry(0.1, 0.022, 0.092), '#2b190c', 0, -0.19, 0.005),
    // mástil, diapasón y clavijero
    pieza(new THREE.BoxGeometry(0.052, 0.38, 0.036), '#6b4220', 0, 0.22, -0.01),
    pieza(new THREE.BoxGeometry(0.044, 0.34, 0.04), '#2b190c', 0, 0.2, 0.002),
    pieza(new THREE.BoxGeometry(0.075, 0.095, 0.036), '#523015', 0, 0.44, -0.01),
    pieza(new THREE.BoxGeometry(0.11, 0.02, 0.02), '#d9d9d9', 0, 0.45, -0.01),
  ),
  nota: unir(
    pieza(new THREE.SphereGeometry(0.065, 7, 5), '#ffd166', 0, 0, 0, { sx: 1.25, sy: 0.85, sz: 0.65, rz: 0.35 }),
    pieza(new THREE.BoxGeometry(0.025, 0.2, 0.025), '#ffd166', 0.055, 0.1, 0),
    pieza(new THREE.BoxGeometry(0.09, 0.04, 0.025), '#ffd166', 0.095, 0.18, 0, { rz: -0.45 }),
  ),
  pincel: unir(
    pieza(new THREE.BoxGeometry(0.032, 0.28, 0.032), '#8c5a32', 0, 0.14, 0),
    pieza(new THREE.BoxGeometry(0.038, 0.06, 0.038), '#adb5bd', 0, 0.3, 0),
    pieza(new THREE.ConeGeometry(0.03, 0.09, 6), '#e63946', 0, 0.37, 0),
  ),
  sarten: unir(
    pieza(new THREE.CylinderGeometry(0.16, 0.13, 0.045, 10), '#2b2d42', 0, 0, 0.18),
    pieza(new THREE.BoxGeometry(0.04, 0.025, 0.2), '#4a4e69', 0, 0.01, 0.02),
    pieza(new THREE.SphereGeometry(0.055, 6, 4), '#f4a261', -0.04, 0.02, 0.18),
    pieza(new THREE.SphereGeometry(0.045, 6, 4), '#e76f51', 0.05, 0.02, 0.2),
  ),
  paraguas: new THREE.ConeGeometry(0.58, 0.26, 8, 1, true),
  paraguasPalo: unir(
    pieza(new THREE.CylinderGeometry(0.016, 0.016, 0.78, 6), '#2b2d42', 0, 0.39, 0),
    pieza(new THREE.CylinderGeometry(0.02, 0.025, 0.12, 6), '#e9c46a', 0, 0.84, 0),
    pieza(new THREE.CylinderGeometry(0.024, 0.024, 0.14, 6), '#5c3a21', 0, -0.05, 0),
    pieza(new THREE.BoxGeometry(0.09, 0.024, 0.024), '#5c3a21', 0.035, -0.12, 0),
    pieza(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6), '#5c3a21', 0.07, -0.08, 0),
  ),
};

const PARTS = [
  // nombre, geometría, color(look), material extra
  ['legL', 'leg', 'pants'], ['legR', 'leg', 'pants'],
  ['armL', 'arm', 'shirt'], ['armR', 'arm', 'shirt'],
  ['torso', 'torso', 'shirt'], ['head', 'head', 'skin'],
  ['eyeL', 'eye', '#1d1d1d'], ['eyeR', 'eye', '#1d1d1d'],
  ['hairCap', 'hairCap', 'hair'], ['hairLong', 'hairLong', 'hair'], ['bun', 'bun', 'hair'], ['punk', 'punk', 'hair'],
  ['hatTop', 'hatTop', 'hatColor'], ['brim', 'brim', 'hatColor'], ['visor', 'visor', 'hatColor'], ['cone', 'cone', 'hatColor'], ['crown', 'crown', '#f2c14e'],
  ['palo', 'palo', '#7a5230'], ['hoja', 'hoja', 'vc'], ['sedal', 'sedal', '#f1f1f1'], ['balde', 'balde', 'vc'], ['libro', 'libro', 'vc'], ['guitarra', 'guitarra', 'vc'],
  ['nota1', 'nota', 'vc'], ['nota2', 'nota', 'vc'], ['pincel', 'pincel', 'vc'], ['sarten', 'sarten', 'vc'],
  ['paraguas', 'paraguas', 'umbrellaColor'], ['paraguasPalo', 'paraguasPalo', '#2b2d42'],
];
const TOOLS = ['palo', 'hoja', 'sedal', 'balde', 'libro', 'guitarra'];

export class Crowd {
  constructor(parent, walkers) {
    this.walkers = walkers; const n = walkers.length;
    this.meshes = {}; const c = new THREE.Color();
    for (const [name, geo, colorKey] of PARTS) {
      const mat = new THREE.MeshStandardMaterial({ flatShading: true, roughness: 0.85, side: (name === 'crown' || name === 'paraguas') ? THREE.DoubleSide : THREE.FrontSide, vertexColors: colorKey === 'vc' });
      if (name === 'crown') { mat.metalness = 0.6; mat.roughness = 0.3; }
      if (name.startsWith('nota')) { mat.emissive = new THREE.Color('#ffd166'); mat.emissiveIntensity = 0.45; }
      const m = new THREE.InstancedMesh(G[geo], mat, n); m.castShadow = !name.startsWith('eye') && !name.startsWith('nota'); m.frustumCulled = false;
      if (colorKey !== 'vc') walkers.forEach((w, i) => m.setColorAt(i, c.set(colorKey.startsWith('#') ? colorKey : w.look[colorKey])));
      parent.add(m); this.meshes[name] = m;
    }
    this._m = new THREE.Matrix4(); this._b = new THREE.Matrix4(); this._l = new THREE.Matrix4(); this._zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._e = new THREE.Euler();
    this._q = new THREE.Quaternion(); this._up = new THREE.Vector3(0, 1, 0); this._sc = new THREE.Vector3();
  }

  // Coloca una pieza: base (posición/rotación del personaje) × local
  #set(name, i, x, y, z, rx = 0, sx = 1, sy = 1, sz = 1, ry = 0, rz = 0) {
    this._e.set(rx, ry, rz);
    const l = this._l.makeRotationFromEuler(this._e); l.scale(this._s.set(sx, sy, sz)); l.setPosition(x, y, z);
    this.meshes[name].setMatrixAt(i, this._m.multiplyMatrices(this._b, l));
  }
  #hide(name, i) { this.meshes[name].setMatrixAt(i, this._zero); }

  update(t, weather = 'sol') {
    const isRaining = weather === 'lluvia' || weather === 'tormenta';
    const q = this._q; const up = this._up;
    this.walkers.forEach((w, i) => {
      if (w.hidden || w.forma) { for (const m of Object.values(this.meshes)) m.setMatrixAt(i, this._zero); return; } // los animales usan su propio modelo
      const L = w.look; const h = L.height;
      const swing = w.moving ? Math.sin(t * 9 + w.phase) * 0.6 : 0;
      let bob = w.moving ? Math.abs(Math.sin(t * 9 + w.phase)) * 0.06 : Math.sin(t * 1.5 + w.phase) * 0.01;
      // Pose según lo que está haciendo (solo cuando está quieto en su sitio)
      const an = w.moving ? null : w.anim; const k = t + w.phase; const up1 = Math.max(0, Math.sin(k * 4));
      let aL = -swing * 0.8, aR = swing * 0.8, lL = swing, lR = -swing, giro = 0, lean = 0; const tool = {};
      switch (an) {
        case 'pescar': aL = aR = -1.15; tool.palo = { arm: 'c', rx: 0.95 + Math.sin(k * 1.3) * 0.05, len: 1.7 }; tool.sedal = true; break;
        case 'talar': case 'martillar': aR = -2.5 + up1 * 1.9; aL = -0.2; tool.palo = { arm: 'R', rx: aR + Math.PI, len: an === 'talar' ? 0.75 : 0.45 }; tool.hoja = true; break;
        case 'recoger': aL = aR = -0.7 + Math.sin(k * 3) * 0.25; lean = 0.35; bob = -0.06 - Math.abs(Math.sin(k * 1.5)) * 0.05; break;
        case 'agua': aR = -0.15 + Math.sin(k * 2) * 0.1; aL = 0.1; tool.balde = true; break;
        case 'vigilar': case 'mirar': aL = aR = 0.35; giro = Math.sin(k * 0.45) * 0.9; break;
        case 'vender': aR = -2.6 + Math.sin(k * 6) * 0.35; aL = -0.4; break;
        case 'discurso': aL = -2.2 + Math.sin(k * 2) * 0.6; aR = -2.2 - Math.sin(k * 2) * 0.6; break;
        case 'escribir': case 'leer': aL = -1.1; aR = an === 'leer' ? -1.1 : -1.0 + Math.sin(k * 8) * 0.12; tool.libro = true; break;
        case 'cocinar': aR = -1.0 + Math.sin(k * 5) * 0.3; aL = -0.6; lean = 0.15; tool.sarten = true; break;
        case 'entrenar': case 'futbol':
          lL = Math.sin(k * 7) * 0.75;
          lR = -Math.sin(k * 7) * 0.75;
          aL = -lL * 0.9;
          aR = -lR * 0.9;
          bob = Math.abs(Math.sin(k * 7)) * 0.12;
          lean = 0.2;
          break;
        case 'curar':
          aL = -1.15;
          aR = -1.35 + Math.sin(k * 6) * 0.15;
          lean = 0.22;
          tool.libro = true; // tablilla médica
          break;
        case 'magia':
          aL = -2.25 + Math.sin(k * 4) * 0.45;
          aR = -2.25 - Math.sin(k * 4) * 0.45;
          lean = -0.12 + Math.sin(k * 2) * 0.08;
          bob = Math.sin(k * 3) * 0.05 + 0.04;
          giro = Math.sin(k * 1.2) * 0.35;
          break;
        case 'pintar': aR = -1.4 + Math.sin(k * 3) * 0.3; aL = -0.3; tool.pincel = aR + Math.PI; break;
        case 'musica': aR = -0.75 + Math.sin(k * 10) * 0.18; aL = -1.25; tool.guitarra = true; break;
        case 'tramar':
          aL = -1.55 + Math.sin(k * 3) * 0.08;
          aR = -1.55 - Math.sin(k * 3) * 0.08;
          lean = 0.18 + Math.sin(k * 2) * 0.04;
          giro = Math.sin(k * 0.7) * 0.65;
          break;
        case 'sentarse': aL = aR = -0.35; lL = lR = -Math.PI / 2; bob = -0.36; break;
        case 'charlar': aR = -0.5 - 0.6 * Math.max(0, Math.sin(k * 2)); aL = -0.2 * Math.max(0, Math.sin(k * 1.3 + 1)); break;
        case 'lanzar': aR = -2.8 + 2.6 * Math.max(0, Math.sin(k * 2.5)); break;
        case 'nadar': aL = k * 4 % (Math.PI * 2) - Math.PI; aR = aL + Math.PI; break;
      }
      if (isRaining) {
        if (L.hasUmbrella) {
          aR = -2.0; // Levanta el brazo derecho para sostener el paraguas
          delete tool.palo; delete tool.hoja; delete tool.sedal; delete tool.balde;
          delete tool.pincel; delete tool.sarten;
        } else if (!w.forma) {
          aL = -2.45; // Se protege la cabeza con la mano izquierda
          lean = 0.22; // Inclinado contra la lluvia
          delete tool.libro;
        }
      }
      q.setFromAxisAngle(up, (w.dir || 0) + giro);
      this._b.compose(this._p.set(w.pos.x, w.ground + bob, w.pos.z), q, this._sc.set(h, h, h));
      const hip = 0.47, sh = 0.98, hy = 1.33; // alturas locales
      this.#set('legL', i, -0.1, hip, 0, lL); this.#set('legR', i, 0.1, hip, 0, lR);
      this.#set('armL', i, -0.33, sh, 0, aL, 1, 1, 1); this.#set('armR', i, 0.33, sh, 0, aR);
      // herramientas en la mano: mano = hombro + 0.42 · (0, −cos θ, −sin θ)
      const mano = (x, a) => [x, sh - 0.42 * Math.cos(a), -0.42 * Math.sin(a)];
      if (tool.palo) {
        const [x, y, z] = tool.palo.arm === 'c' ? [0, ...mano(0, aR).slice(1)] : mano(0.33, aR);
        this.#set('palo', i, x, y, z, tool.palo.rx, 1, tool.palo.len, 1);
        const tip = [x, y + Math.cos(tool.palo.rx) * tool.palo.len, z + Math.sin(tool.palo.rx) * tool.palo.len];
        if (tool.hoja) this.#set('hoja', i, tip[0], tip[1], tip[2], tool.palo.rx); else this.#hide('hoja', i);
        if (tool.sedal) this.#set('sedal', i, tip[0], tip[1], tip[2], 0, 1, tip[1] + 0.2, 1); else this.#hide('sedal', i);
      } else { this.#hide('palo', i); this.#hide('hoja', i); this.#hide('sedal', i); }
      if (tool.balde) { const [x, y, z] = mano(0.33, aR); this.#set('balde', i, x, y, z); } else this.#hide('balde', i);
      if (tool.libro) { const [, y, z] = mano(-0.33, aL); this.#set('libro', i, -0.1, y + 0.05, z + 0.02, -0.5); } else this.#hide('libro', i);
      if (tool.pincel !== undefined) { const [x, y, z] = mano(0.33, aR); this.#set('pincel', i, x, y, z, tool.pincel); } else this.#hide('pincel', i);
      if (tool.sarten) { const [x, y, z] = mano(0.33, aR); this.#set('sarten', i, x, y, z, 0.15); } else this.#hide('sarten', i);
      if (tool.guitarra) {
        this.#set('guitarra', i, 0.04, 0.78, 0.31, -0.08, 1, 1, 1, 0, 0.85);
        const n1 = (t * 0.7 + w.phase) % 1, n2 = (t * 0.7 + w.phase + 0.5) % 1;
        const s1 = 0.85 - n1 * 0.3, s2 = 0.8 - n2 * 0.3;
        this.#set('nota1', i, 0.18 + Math.sin(t * 3 + w.phase) * 0.08, 1.05 + n1 * 0.85, 0.32, 0, s1, s1, s1, Math.sin(t * 2) * 0.25);
        this.#set('nota2', i, -0.14 + Math.cos(t * 2.7 + w.phase) * 0.08, 1.1 + n2 * 0.85, 0.3, 0, s2, s2, s2, -Math.sin(t * 2) * 0.25);
      } else { this.#hide('guitarra', i); this.#hide('nota1', i); this.#hide('nota2', i); }
      if (isRaining && L.hasUmbrella) {
        const uSwayX = -0.42 + Math.sin(t * 2.5 + w.phase) * 0.05;
        const uSwayZ = 0.38 + Math.cos(t * 2.2 + w.phase) * 0.05;
        const [ux, uy, uz] = mano(0.33, aR);
        const cx = ux - 0.68 * Math.sin(uSwayZ);
        const cy = uy + 0.68 * Math.cos(uSwayZ) * Math.cos(uSwayX);
        const cz = uz + 0.68 * Math.sin(uSwayX);
        this.#set('paraguas', i, cx, cy, cz, uSwayX, 1, 1, 1, 0, uSwayZ);
        this.#set('paraguasPalo', i, ux, uy, uz, uSwayX, 1, 1, 1, 0, uSwayZ);
      } else {
        this.#hide('paraguas', i);
        this.#hide('paraguasPalo', i);
      }
      this.#set('torso', i, 0, 0.74, 0, lean);
      this.#set('head', i, 0, hy, 0);
      this.#set('eyeL', i, -0.09, hy + 0.03, 0.245); this.#set('eyeR', i, 0.09, hy + 0.03, 0.245);
      const st = L.hairStyle;
      if (st === 'calvo' || (L.hat && st !== 'largo')) this.#hide('hairCap', i); else this.#set('hairCap', i, 0, hy + 0.02, -0.01, -0.15);
      if (st === 'largo') this.#set('hairLong', i, 0, hy - 0.12, -0.17); else this.#hide('hairLong', i);
      if (st === 'moño' && !L.hat) this.#set('bun', i, 0, hy + 0.3, -0.1); else this.#hide('bun', i);
      if (st === 'punk' && !L.hat) this.#set('punk', i, 0, hy + 0.26, 0); else this.#hide('punk', i);
      const hat = L.hat;
      if (hat === 'gorra') { this.#set('hatTop', i, 0, hy + 0.2, 0, 0, 1.1, 0.7, 1.1); this.#set('visor', i, 0, hy + 0.12, 0.27); } else { this.#hide('visor', i); }
      if (hat === 'sombrero') { this.#set('hatTop', i, 0, hy + 0.3, 0); this.#set('brim', i, 0, hy + 0.17, 0); } else this.#hide('brim', i);
      if (hat === 'gorro') this.#set('cone', i, 0, hy + 0.36, 0); else this.#hide('cone', i);
      if (hat === 'corona') this.#set('crown', i, 0, hy + 0.3, 0); else this.#hide('crown', i);
      if (hat !== 'gorra' && hat !== 'sombrero') this.#hide('hatTop', i);
    });
    for (const m of Object.values(this.meshes)) m.instanceMatrix.needsUpdate = true;
  }
}

// ---------- Criaturas: quien pidió ser un animal, un ser fantástico o una cosa camina por la isla con esa forma ----------
// Cada «tipo» tiene su silueta propia (vida.js → formaDe decide el tipo y el color). Nada se rechaza: si es una cosa,
// la cosa camina con patitas y ojos saltones.
export function crearAnimal(forma) {
  const g = new THREE.Group(); const col = new THREE.Color(forma.color || '#a08060'); const e = forma.especie || '';
  const M = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9, ...extra });
  const piel = M(col), oscuro = M(col.clone().multiplyScalar(0.65)), claro = M(col.clone().lerp(new THREE.Color('#ffffff'), 0.55));
  const negro = M('#1d1d1d'), blanco = M('#f4f4f0'), naranja = M('#f0a030'), oro = M('#e8c040', { metalness: 0.4 });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, padre = g) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; padre.add(o); return o; };
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const patas = [], alas = [], segs = []; let cola = null, cab = null, flota = false, salta = false;
  const pata = (x, z, alto, grosor = 0.07, mat = oscuro, y = alto) => { const p = new THREE.Group(); p.position.set(x, y, z);
    const m = new THREE.Mesh(B(grosor, alto, grosor), mat); m.position.y = -alto / 2; m.castShadow = true; p.add(m); g.add(p); patas.push(p); return p; };
  const ojos = (x, y, z, sep, tam = 0.05, mat = negro) => { for (const s of [-1, 1]) add(B(tam, tam, 0.02), mat, x + s * sep, y, z); };
  const saltones = (y, z, sep, r = 0.07) => { for (const s of [-1, 1]) { add(new THREE.SphereGeometry(r, 8, 6), blanco, s * sep, y, z); add(new THREE.SphereGeometry(r * 0.45, 6, 4), negro, s * sep, y, z + r * 0.8); } };
  const colaCil = (y, z, largo, rx, mat = oscuro, r0 = 0.025, r1 = 0.035) => { cola = new THREE.Group(); cola.position.set(0, y, z);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, largo, 5), mat); m.position.y = largo / 2; m.castShadow = true; cola.add(m); cola.rotation.x = rx; g.add(cola); };
  // cuadrúpedo parametrizable (gato, perro, oso, caballo, conejo, genérico…)
  const cuadrupedo = (T) => {
    const y = T.pata + T.H / 2; add(B(T.W, T.H, T.L), piel, 0, y, 0);
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) pata(sx * (T.W / 2 - 0.05), sz * (T.L / 2 - 0.08), T.pata, T.grosor || 0.07, T.patasMat || oscuro);
    const cy = y + T.H * 0.45 + (T.cuello || 0), cz = T.L / 2 + T.cab * 0.3;
    if (T.cuello) add(B(T.W * 0.55, T.cuello + T.H * 0.4, T.W * 0.55), piel, 0, y + T.cuello / 2 + T.H * 0.2, T.L / 2 - 0.04, -0.35);
    cab = add(B(T.cab, T.cab, T.cab * (T.hocicoLargo || 1)), piel, 0, cy, cz);
    ojos(0, cy + T.cab * 0.08, cz + T.cab * (T.hocicoLargo || 1) / 2 + 0.01, T.cab * 0.22, 0.05, M(forma.tipo === 'gato' ? '#7cd67c' : '#1d1d1d'));
    return { y, cy, cz };
  };
  switch (forma.tipo) {
    case 'gato': { const { y, cy, cz } = cuadrupedo({ L: 0.55, H: 0.24, W: 0.24, pata: 0.2, cab: 0.24 });
      for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.06, 0.13, 4), piel, s * 0.07, cy + 0.15, cz, 0, Math.PI / 4);
      colaCil(y + 0.07, -0.27, 0.38, -0.5, piel); break; }
    case 'perro': { const { y, cy, cz } = cuadrupedo({ L: 0.72, H: 0.32, W: 0.3, pata: 0.26, cab: 0.3 });
      add(B(0.17, 0.13, 0.14), oscuro, 0, cy - 0.05, cz + 0.2);
      for (const s of [-1, 1]) add(B(0.07, 0.17, 0.12), oscuro, s * 0.18, cy - 0.02, cz - 0.03);
      colaCil(y + 0.1, -0.36, 0.24, -1.1); break; }
    case 'oso': { const panda = /panda/.test(e); const T = { L: 0.78, H: 0.44, W: 0.44, pata: 0.22, cab: 0.36, grosor: 0.13, patasMat: panda ? negro : oscuro };
      const { cy, cz } = cuadrupedo(T);
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.07, 6, 4), panda ? negro : oscuro, s * 0.14, cy + 0.2, cz - 0.04);
      add(B(0.16, 0.11, 0.1), panda ? blanco : claro, 0, cy - 0.06, cz + 0.2);
      if (panda) for (const s of [-1, 1]) add(B(0.09, 0.08, 0.02), negro, s * 0.08, cy + 0.03, cz + 0.18); break; }
    case 'caballo': { const jirafa = /jirafa/.test(e), vaca = /vaca|toro/.test(e);
      const T = { L: 0.82, H: 0.34, W: 0.28, pata: jirafa ? 0.55 : 0.46, cab: 0.2, hocicoLargo: 1.7, cuello: jirafa ? 0.7 : vaca ? 0.05 : 0.28 };
      const { y, cy, cz } = cuadrupedo(T);
      if (!vaca && !jirafa) add(B(0.05, 0.3, 0.22), oscuro, 0, cy - 0.12, cz - 0.22, -0.35); // crin
      if (/unicornio/.test(e)) add(new THREE.ConeGeometry(0.035, 0.24, 6), oro, 0, cy + 0.2, cz + 0.12, 0.5);
      if (vaca) { for (const s of [-1, 1]) add(new THREE.ConeGeometry(0.03, 0.12, 5), blanco, s * 0.1, cy + 0.14, cz, 0, 0, -s * 0.6); add(B(0.2, 0.14, 0.2), negro, 0.1, y + 0.1, 0.1); }
      if (/cabra|oveja/.test(e)) add(new THREE.SphereGeometry(0.2, 7, 5), claro, 0, y + 0.05, 0);
      colaCil(y + 0.08, -0.41, 0.3, -2.6, oscuro, 0.03, 0.05); break; }
    case 'conejo': { salta = true; const { y, cy, cz } = cuadrupedo({ L: 0.42, H: 0.26, W: 0.24, pata: 0.12, cab: 0.22 });
      for (const s of [-1, 1]) add(B(0.06, 0.26, 0.04), piel, s * 0.06, cy + 0.22, cz - 0.02, -0.15);
      add(new THREE.SphereGeometry(0.07, 6, 5), blanco, 0, y + 0.06, -0.24); break; }
    case 'mono': { // bípedo, brazos largos y cola enroscada
      const cara = M('#e8c4a0');
      pata(-0.08, 0, 0.24, 0.08); pata(0.08, 0, 0.24, 0.08);
      add(B(0.3, 0.34, 0.2), piel, 0, 0.24 + 0.17, 0);
      cab = add(B(0.26, 0.24, 0.24), piel, 0, 0.24 + 0.34 + 0.12, 0);
      add(B(0.18, 0.15, 0.03), cara, 0, 0.68, 0.13); ojos(0, 0.72, 0.15, 0.045, 0.04);
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.06, 6, 4), cara, s * 0.15, 0.72, 0);
      pata(-0.19, 0, 0.36, 0.07, piel, 0.56); pata(0.19, 0, 0.36, 0.07, piel, 0.56); // brazos (se balancean)
      colaCil(0.3, -0.1, 0.42, -2.2, piel, 0.02, 0.03); break; }
    case 'ave': { const ping = /pinguino/.test(e), flam = /flamenco|avestruz/.test(e);
      const lp = flam ? 0.42 : 0.14; pata(-0.06, 0, lp, 0.03, naranja); pata(0.06, 0, lp, 0.03, naranja);
      const bh = ping ? 0.46 : 0.28, by = lp + bh / 2;
      add(B(ping ? 0.3 : 0.26, bh, ping ? 0.26 : 0.36), piel, 0, by, 0);
      if (ping) add(B(0.22, bh * 0.8, 0.02), blanco, 0, by - 0.02, 0.14);
      const hy = by + bh / 2 + 0.07; cab = add(B(0.18, 0.17, 0.18), piel, 0, hy, ping ? 0.02 : 0.14);
      add(new THREE.ConeGeometry(0.04, 0.13, 4), naranja, 0, hy - 0.02, (ping ? 0.02 : 0.14) + 0.14, Math.PI / 2);
      ojos(0, hy + 0.03, (ping ? 0.02 : 0.14) + 0.095, 0.05, 0.035);
      for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * (ping ? 0.15 : 0.13), by + 0.04, 0); add(B(0.03, bh * 0.75, ping ? 0.16 : 0.26), oscuro, 0, -bh * 0.3, 0, 0, 0, 0, a); g.add(a); alas.push(a); }
      add(B(0.14, 0.04, 0.12), oscuro, 0, by + 0.05, -0.22, 0.4); break; }
    case 'reptil': { // cocodrilo, dinosaurio, dragón, lagarto, tortuga, rana, serpiente
      if (/serpiente|culebra/.test(e)) { // sin patas: segmentos que serpentean
        for (let i = 0; i < 7; i++) segs.push(add(B(0.13 - i * 0.008, 0.11, 0.16), i % 2 ? oscuro : piel, 0, 0.06, 0.4 - i * 0.15));
        cab = add(B(0.17, 0.12, 0.2), piel, 0, 0.08, 0.55); ojos(0, 0.13, 0.62, 0.05, 0.035);
        add(B(0.02, 0.01, 0.1), M('#c0392b'), 0, 0.06, 0.7); break; }
      if (/rana|sapo/.test(e)) { salta = true; add(B(0.34, 0.2, 0.3), piel, 0, 0.16, 0); cab = add(B(0.3, 0.12, 0.16), piel, 0, 0.26, 0.1);
        saltones(0.33, 0.12, 0.09, 0.06); pata(-0.14, 0.08, 0.08, 0.06); pata(0.14, 0.08, 0.08, 0.06); pata(-0.16, -0.1, 0.1, 0.08); pata(0.16, -0.1, 0.1, 0.08); break; }
      if (/tortuga/.test(e)) { add(new THREE.SphereGeometry(0.28, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), M('#6b4f2a'), 0, 0.12, 0);
        cab = add(B(0.13, 0.12, 0.16), piel, 0, 0.14, 0.3); ojos(0, 0.17, 0.385, 0.04, 0.03);
        for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) pata(sx * 0.18, sz * 0.15, 0.12, 0.08, piel); break; }
      const dino = /dino|tiranosaurio|rex/.test(e), dragon = /dragon/.test(e);
      const T = dino ? { L: 0.6, H: 0.36, W: 0.32, pata: 0.3, cab: 0.28, hocicoLargo: 1.4 } : { L: 0.85, H: 0.2, W: 0.3, pata: dragon ? 0.2 : 0.1, cab: 0.2, hocicoLargo: 1.8, grosor: 0.09 };
      const { y } = cuadrupedo(T);
      for (let i = 0; i < 4; i++) add(new THREE.ConeGeometry(0.04, 0.1, 4), oscuro, 0, y + T.H / 2 + 0.04, T.L / 2 - 0.12 - i * 0.16);
      colaCil(y, -T.L / 2, dino ? 0.5 : 0.55, -1.75, piel, 0.02, 0.09);
      if (dragon) for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 0.15, y + 0.12, 0.05);
        add(B(0.5, 0.02, 0.32), oscuro, s * 0.25, 0, 0, 0, 0, s * 0.25, a); g.add(a); alas.push(a); }
      break; }
    case 'pez': { // pez (o tiburón, ballena…) con patitas: así sí puede pasear por la isla
      add(new THREE.SphereGeometry(0.22, 10, 7), piel, 0, 0.3, 0).scale.set(0.75, 0.9, 1.5);
      cab = g.children.at(-1); ojos(0, 0.36, 0.26, 0.1, 0.05);
      colaCil(0.3, -0.3, 0.2, -1.57, oscuro, 0.01, 0.12); cola.children[0].scale.set(0.25, 1, 1.8);
      if (/tiburon/.test(e)) add(new THREE.ConeGeometry(0.07, 0.2, 4), piel, 0, 0.56, -0.02);
      pata(-0.07, 0.02, 0.12, 0.04, naranja); pata(0.07, 0.02, 0.12, 0.04, naranja); break; }
    case 'fantasma': { flota = true; const t = M('#f4f4f0', { transparent: true, opacity: 0.85 });
      add(new THREE.CylinderGeometry(0.2, 0.28, 0.5, 10), t, 0, 0.45, 0); cab = add(new THREE.SphereGeometry(0.2, 10, 8), t, 0, 0.72, 0);
      for (const s of [-1, 1]) add(B(0.06, 0.09, 0.02), negro, s * 0.07, 0.76, 0.18); add(B(0.08, 0.05, 0.02), negro, 0, 0.66, 0.19); break; }
    case 'robot': { const met = M('#9aa0a6', { metalness: 0.6, roughness: 0.4 }), luz = M('#4cc9f0', { emissive: '#4cc9f0', emissiveIntensity: 1.2 });
      pata(-0.08, 0, 0.26, 0.09, met); pata(0.08, 0, 0.26, 0.09, met);
      add(B(0.32, 0.32, 0.22), col.getHex() === new THREE.Color('#a08060').getHex() ? met : piel, 0, 0.42, 0);
      cab = add(B(0.24, 0.2, 0.2), met, 0, 0.7, 0); for (const s of [-1, 1]) add(B(0.06, 0.04, 0.02), luz, s * 0.06, 0.72, 0.105);
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 4), met, 0, 0.86, 0); add(new THREE.SphereGeometry(0.03, 6, 4), M('#e63946', { emissive: '#e63946' }), 0, 0.93, 0);
      pata(-0.21, 0, 0.3, 0.07, met, 0.56); pata(0.21, 0, 0.3, 0.07, met, 0.56); break; }
    case 'cosa': { // un objeto con patitas y ojos saltones (tanque, coche, árbol, casa, sol…)
      const k = forma.cosa || 'caja';
      if (k === 'esfera') add(new THREE.SphereGeometry(0.27, 10, 8), piel, 0, 0.42, 0);
      else if (k === 'copa') { add(new THREE.CylinderGeometry(0.06, 0.08, 0.25, 6), M('#6b4f2a'), 0, 0.3, 0); add(new THREE.ConeGeometry(0.3, 0.55, 7), M('#3d8b3d'), 0, 0.7, 0); }
      else add(B(0.48, 0.32, 0.6), piel, 0, 0.36, 0);
      if (k === 'techo') add(new THREE.ConeGeometry(0.42, 0.28, 4), M('#b5523b'), 0, 0.66, 0, 0, Math.PI / 4);
      if (k === 'canon') { add(B(0.32, 0.14, 0.3), oscuro, 0, 0.59, -0.04); add(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 6), oscuro, 0, 0.6, 0.3, Math.PI / 2); }
      if (k === 'alas') for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 0.24, 0.4, 0); add(B(0.4, 0.03, 0.2), claro, s * 0.2, 0, 0, 0, 0, 0, a); g.add(a); alas.push(a); }
      if (k === 'ruedas') for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) add(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), negro, sx * 0.26, 0.2, sz * 0.2, 0, 0, Math.PI / 2);
      saltones(k === 'copa' ? 0.72 : 0.45, k === 'esfera' ? 0.24 : k === 'copa' ? 0.22 : 0.31, 0.1, 0.075); cab = g.children.at(-1);
      pata(-0.12, 0, 0.2, 0.06, negro); pata(0.12, 0, 0.2, 0.06, negro); break; }
    default: { const { y, cy, cz } = cuadrupedo({ L: 0.66, H: 0.32, W: 0.32, pata: 0.24, cab: 0.3 }); // cuatro patas genérico
      for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.07, 6, 4), oscuro, s * 0.11, cy + 0.17, cz - 0.02);
      if (/leon/.test(e)) add(B(0.42, 0.42, 0.12), M('#a0662a'), 0, cy, cz - 0.12);
      if (/elefante/.test(e)) add(new THREE.CylinderGeometry(0.04, 0.06, 0.3, 6), piel, 0, cy - 0.15, cz + 0.2, 0.3);
      colaCil(y + 0.1, -0.33, 0.24, -1.1); }
  }
  g.userData = { patas, alas, segs, cola, cab, base: cola ? cola.rotation.x : 0, flota, salta, tipo: forma.tipo };
  return g;
}
export function animarAnimal(g, w, t) {
  const { patas, alas, segs, cola, base, flota, salta } = g.userData; const f = t * 12 + w.phase; const s = w.moving ? Math.sin(f) * 0.6 : 0;
  patas.forEach((p, i) => { p.rotation.x = (i === 0 || i === 3 ? s : -s); });
  alas.forEach((a, i) => { a.rotation.z = (i ? -1 : 1) * (w.moving ? Math.sin(t * 16 + w.phase) * 0.5 : Math.sin(t * 2 + w.phase) * 0.08); });
  segs.forEach((sg, i) => { sg.position.x = Math.sin(t * 6 + w.phase - i * 0.9) * (w.moving ? 0.07 : 0.025); });
  if (cola) { cola.rotation.z = Math.sin(t * (w.moving ? 8 : 3) + w.phase) * 0.35; cola.rotation.x = base; }
  const brinco = salta ? (w.moving ? Math.abs(Math.sin(f * 0.6)) * 0.14 : 0) : flota ? 0.12 + Math.sin(t * 2 + w.phase) * 0.06 : w.moving ? Math.abs(Math.sin(f)) * 0.03 : 0;
  g.position.set(w.pos.x, w.ground + brinco, w.pos.z);
  g.rotation.y = w.dir || 0; g.visible = !w.hidden;
}
