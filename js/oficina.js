// Estudio LEGO 3D — Oficina de los 9 especialistas de Instagram + Claude Code & Gemini.
// Fase 1: diorama LEGO compacto, 9 puestos identificables, sala de reuniones, pantalla gigante y cámara isométrica.
// Datos reales desde /api/oficina (tools/serve.mjs → oficina/eventos.jsonl). ?demo=1 reproduce un ejemplo etiquetado como Demo.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { clasificaActividadGemini, ETAPAS_GEMINI } from './actividad-gemini.js';

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo') && params.get('demo') !== '0';
const MOVIL = matchMedia('(max-width: 760px)').matches;

// ---------------- 9 Especialistas + Motores IA (Claude & Gemini) ----------------
const AGENTES = {
  // Fila 1 (Herramientas reales de operación, investigación, AV y audio)
  browser:       { num: 1, nombre: '1·Browser',       rol: 'Web y redes sociales',        color: '#0284c7', pelo: '#eab308', micro: true, prop: 'chat', x: -12.6, z: -5.4 },
  investigador:  { num: 2, nombre: '2·Investigación', rol: 'Búsqueda documental',         color: '#d97706', gorra: '#92400e', prop: 'radar', x: -8.2, z: -5.4 },
  'director-av': { num: 3, nombre: '3·Audiovisual',   rol: 'Captura y render 3D',         color: '#2563eb', gorra: '#1e3a8a', auriculares: true, prop: 'claqueta', x: -3.8, z: -5.4 },
  audio:         { num: 4, nombre: '4·Audio',         rol: 'Voz local y mezcla',          color: '#db2777', pelo: '#1e293b', auriculares: true, prop: 'audio', x: 0.6, z: -5.4 },
  // Fila 2 (Generación visual, memoria SQLite, QA y Codex)
  imagen:        { num: 5, nombre: '5·Gen. Visual',   rol: 'Creación de imágenes',        color: '#ca8a04', boina: '#1e293b', prop: 'paleta', x: -12.6, z: -0.8 },
  memoria:       { num: 6, nombre: '6·Memoria',       rol: 'SQLite y conocimiento',       color: '#7c3aed', pelo: '#475569', gafas: true, prop: 'memoria', x: -8.2, z: -0.8 },
  qa:            { num: 7, nombre: '7·QA Calidad',    rol: 'Pruebas y verificación',      color: '#16a34a', casco: '#ffd43b', prop: 'lupa', x: -3.8, z: -0.8 },
  codex:         { num: 8, nombre: '8·Codex',         rol: 'Ejecución técnica (permiso)', color: '#0f766e', visor: '#2dd4bf', prop: 'codex', x: 0.6, z: -0.8 },
  // Ala Direcciones IA (Claude pasivo + Gemini coordinador/ejecutor principal)
  claude:        { nombre: 'Claude Code',             rol: 'Observación pasiva (sin uso)', color: '#d97757', pelo: '#3b2a20', x: 6.4, z: -5.4 },
  gemini:        { nombre: 'Gemini',                  rol: 'Coordinación y ejecución',    color: '#4285f4', visor: '#38bdf8', x: 10.6, z: -5.4 },
};

// Sillas de la sala pequeña de reuniones (también acogen temporalmente subagentes observados sin puesto fijo)
const SALA_CENTRO = { x: 8.6, z: 2.2 };
const SALA_SILLAS = [
  { x: 6.55, z: 2.2, rotY: Math.PI / 2 },
  { x: 10.65, z: 2.2, rotY: -Math.PI / 2 },
  { x: 8.6, z: 0.15, rotY: 0 },
  { x: 8.6, z: 4.25, rotY: Math.PI },
];

const ALIAS_ROL = {
  'project-manager': 'gemini',
  coordinador: 'gemini',
  estratega: 'gemini',
  guionista: 'gemini',
  analista: 'investigador',
  resumidor: 'memoria',
  'agente-resumidor': 'memoria',
  'instagram-manager': 'browser',
  'community-manager': 'browser',
  'simulation-events': 'gemini',
  '3d-world-builder': 'imagen',
  'director-creativo': 'imagen',
  'image-generator': 'imagen',
  'world-state': 'qa',
  'agente-memoria': 'memoria',
  'codex-cli': 'codex',
  'agente-audio': 'audio',
  ayudante: 'gemini',
};

const USUARIO = { x: 10.0, z: 8.4, entrega: { x: 8.8, z: 7.75 } };
const COLOR_ESTADO = {
  desconocido: '#94a3b8',
  libre: '#64748b',
  pensando: '#eab308',
  investigando: '#f59e0b',
  trabajando: '#2563eb',
  caminando: '#0284c7',
  conversando: '#0ea5e9',
  entregando: '#16a34a',
  revisando: '#8b5cf6',
  bloqueado: '#f97316',
  error: '#dc2626',
  finalizado: '#10b981',
  desconectado: '#475569',
};
const NOMBRE_ESTADO = {
  desconocido: 'sin eventos',
  libre: 'inactivo (real)',
  pensando: 'pensando…',
  investigando: 'investigando',
  trabajando: 'trabajando',
  caminando: 'caminando',
  conversando: 'conversando',
  entregando: 'entregando',
  revisando: 'revisando',
  bloqueado: 'bloqueado / pausa',
  error: '¡error!',
  finalizado: 'finalizado',
  desconectado: 'desconectado',
};
const ACCION_LABEL = {
  sesion_inicio: 'Inicio sesión',
  planificacion: 'Planificación',
  investigacion: 'Investigación',
  herramienta: 'Herramienta',
  lectura: 'Lectura',
  escritura: 'Escritura',
  subtarea_inicio: 'Inicia subtarea',
  subtarea_fin: 'Fin subtarea',
  comunicacion: 'Comunicación',
  entrega: 'Entrega',
  revision: 'Revisión',
  bloqueo_permiso: 'Bloq. permiso',
  error: 'Error',
  cancelacion: 'Cancelación',
  finalizacion: 'Finalización',
  reunion_inicio: 'Reunión',
  reunion_fin: 'Fin reunión',
  inactivo: 'Inactivo',
};
const ORIGEN_LABEL = {
  real: 'Real',
  declarado: 'Declarado',
  inferido: 'Inferido',
  externo_no_observado: 'Externo',
  demo: 'Demo',
};
const ESPECIALISTAS_IDS = new Set([
  'browser', 'investigador', 'director-av', 'audio',
  'imagen', 'memoria', 'qa', 'codex',
]);
const PIEL = '#ffd23f';
const CARRILES = [-10.4, -6.0, -1.6, 2.8, 13.8];
const pasillo = (z) => z + 2.15;

function mapearDestino(id, ev = null) {
  if (!id) return null;
  const raw = String(id).trim();
  const low = raw.toLowerCase();
  if (low === 'usuario' || low === 'claude' || low === 'gemini') return low;
  // Subagentes reales (p. ej. gemini/instagram-live-data-reader) mantienen identidad propia; nunca se colapsan en 8·Community Mgr
  if (low.startsWith('gemini/') || low.startsWith('claude/')) return low;
  const alias = ALIAS_ROL[low];
  const cand = ESPECIALISTAS_IDS.has(low) ? low : (alias && ESPECIALISTAS_IDS.has(alias) ? alias : null);
  if (cand) {
    if (ev && ev.fuente !== 'demo' && !DEMO) {
      const verificado = ev.especialista_verificado === true && ev.origen !== 'declarado';
      if (!verificado) return (ev.modelo === 'claude' || ev.modelo === 'gemini') ? ev.modelo : null;
    }
    return cand;
  }
  return agentes[low] ? low : null;
}

// ---------------- Escena e Iluminación LEGO ----------------
const stage = document.getElementById('stage');
const dprBase = Math.min(devicePixelRatio || 1, 2);
let dprActual = dprBase;
let pausadoPorContexto = false;
const parlantesAudio = [];
const renderer = new THREE.WebGLRenderer({ antialias: (devicePixelRatio || 1) <= 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(dprActual);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); pausadoPorContexto = true; }, false);
renderer.domElement.addEventListener('webglcontextrestored', () => {
  pausadoPorContexto = false;
  renderer.setPixelRatio(dprActual);
  renderer.setSize(innerWidth, innerHeight);
}, false);

const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none' });
stage.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#dce6f1');
scene.fog = new THREE.Fog('#dce6f1', 92, 165);

// Cámara con FOV estrecho (32°) para look diorama isométrico LEGO
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 240);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.32;
controls.minPolarAngle = 0.35;
controls.minDistance = 14;
controls.maxDistance = 105;

function encuadre(targetOverride) {
  const panel = innerWidth > 760;
  const libreW = panel ? innerWidth - 350 : innerWidth;
  const libreH = panel ? innerHeight : innerHeight * 0.65;
  const aspect = libreW / Math.max(1, libreH);
  const d = Math.min(3.1, Math.max(1.18, (panel ? 2.02 : 2.85) / aspect));
  camera.position.set(19.5 * d, 18.2 * d, 23.5 * d);
  controls.target.copy(targetOverride || new THREE.Vector3(panel ? 0.0 : 0.2, 1.0, panel ? 0.2 : 0.0));
  if (panel) camera.setViewOffset(innerWidth, innerHeight, 175, 0, innerWidth, innerHeight);
  else camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.09, innerWidth, innerHeight);
  controls.update();
}
encuadre();
document.getElementById('vistaReset')?.addEventListener('click', () => encuadre());

// Luces agradables de estudio diurno (plástico LEGO satinado)
scene.add(new THREE.HemisphereLight('#ffffff', '#8fa3b8', 1.48));
const sol = new THREE.DirectionalLight('#fff8eb', 2.05);
sol.position.set(14, 24, 15);
sol.castShadow = true;
sol.shadow.mapSize.set(MOVIL ? 1024 : 2048, MOVIL ? 1024 : 2048);
Object.assign(sol.shadow.camera, { left: -21, right: 21, top: 16, bottom: -16, near: 1, far: 65 });
sol.shadow.bias = -0.0005;
scene.add(sol);
const relleno = new THREE.DirectionalLight('#dbeafe', 0.55);
relleno.position.set(-14, 10, -8);
scene.add(relleno);

const mats = new Map();
const mat = (c, extra = {}) => {
  const k = c + JSON.stringify(extra);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.32, metalness: 0.04, ...extra }));
  return mats.get(k);
};
const caja = (w, h, d, c, x = 0, y = 0, z = 0, shadow = true) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === 'string' ? mat(c) : c);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = shadow; return m;
};
const cil = (r, h, c, x = 0, y = 0, z = 0, seg = 16, shadow = true) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), typeof c === 'string' ? mat(c) : c);
  m.position.set(x, y, z); m.castShadow = m.receiveShadow = shadow; return m;
};

// Botones LEGO con InstancedMesh (1 draw call por color)
const studGeo = new THREE.CylinderGeometry(0.125, 0.125, 0.08, 12);
function studs(lista, color, padre = scene, cast = false) {
  const im = new THREE.InstancedMesh(studGeo, mat(color), lista.length);
  const m4 = new THREE.Matrix4();
  lista.forEach(([x, y, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, y, z)));
  im.castShadow = cast; im.receiveShadow = true; padre.add(im); return im;
}

// ---------------- Diorama Modular Moderno LEGO (34 × 22) ----------------
const W = 34, D = 22;
// Placa base principal LEGO + zócalo exterior perimetral
scene.add(caja(W + 1.2, 0.16, D + 1.2, '#334155', 0, -0.32, 0));
scene.add(caja(W, 0.28, D, '#b9c6d4', 0, -0.14, 0));
{
  const s = [];
  for (let x = -W / 2 + 0.5; x < W / 2; x += 1) {
    for (let z = -D / 2 + 0.5; z < D / 2; z += 1) s.push([x, 0.04, z]);
  }
  studs(s, '#b9c6d4');
}

// Zonas de suelo en placas lisas LEGO (tiles) diferenciadas por área
// Zona principal de producción (12 especialistas en 4 columnas × 3 filas)
scene.add(caja(17.8, 0.04, 13.8, '#cedae6', -6.0, 0.02, -0.6, false));
for (const z of [pasillo(-5.4), pasillo(-0.8), pasillo(3.8)]) {
  scene.add(caja(18.0, 0.05, 1.0, '#9fb6cc', -6.0, 0.025, z, false));
}
// Subzonas discretas para Memoria (10), Codex (11) y Audio (12)
scene.add(caja(3.6, 0.045, 3.2, '#ede9fe', 0.6, 0.024, -5.4, false));
scene.add(caja(3.6, 0.045, 3.2, '#ccfbf1', 0.6, 0.024, -0.8, false));
scene.add(caja(3.6, 0.045, 3.2, '#fce7f3', 0.6, 0.024, 3.8, false));
// Zona Direcciones IA (Claude Code + Gemini)
scene.add(caja(8.8, 0.04, 3.8, '#dbeafe', 8.5, 0.02, -5.4, false));
// Zona Sala de Reuniones (madera clara / beige LEGO)
scene.add(caja(7.2, 0.05, 6.0, '#e8d5b7', SALA_CENTRO.x, 0.025, SALA_CENTRO.z, false));
scene.add(caja(7.4, 0.03, 6.2, '#d4a373', SALA_CENTRO.x, 0.015, SALA_CENTRO.z, false));
// Tira LED arquitectónica sutil separando ala especialistas / ala IA-reuniones
scene.add(caja(0.08, 0.03, 18.0, new THREE.MeshBasicMaterial({ color: '#38bdf8' }), 3.95, 0.04, -0.6, false));

// Paredes de ladrillos LEGO + esquinas, ventanales, fachada cutaway y puerta
function paredLadrillos(x, z, largo, rotY, hueco = null, filas = 9) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
  const colores = ['#f6f0e4', '#ece4d3'];
  const topeStuds = [];
  for (let fila = 0; fila < filas; fila++) {
    const off = fila % 2 ? 1 : 0;
    const y = 0.3 + fila * 0.6;
    for (let i = -largo / 2 - off; i < largo / 2; i += 2) {
      const a = Math.max(i, -largo / 2), b = Math.min(i + 2, largo / 2);
      if (b - a < 0.25) continue;
      if (hueco && fila >= hueco.f0 && fila <= hueco.f1 && (a + b) / 2 > hueco.a && (a + b) / 2 < hueco.b) continue;
      g.add(caja(b - a - 0.04, 0.58, 0.5, colores[(fila + Math.round(i)) & 1], (a + b) / 2, y, 0));
    }
  }
  const topY = filas * 0.6;
  for (let i = -largo / 2 + 0.5; i < largo / 2; i += 1) topeStuds.push([i, topY + 0.04, 0]);
  studs(topeStuds, '#ece4d3', g, false);
  g.add(caja(largo, 0.22, 0.54, '#2563eb', 0, 0.11, 0));
  scene.add(g); return g;
}
function pilarEsquina(x, z, alto) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  g.add(caja(0.62, 0.24, 0.62, '#1d4ed8', 0, 0.12, 0));
  const filas = Math.max(1, Math.round((alto - 0.24) / 0.6));
  for (let f = 0; f < filas; f++) {
    g.add(caja(0.58, 0.58, 0.58, f % 2 ? '#e2e8f0' : '#f8fafc', 0, 0.52 + f * 0.6, 0));
  }
  const top = 0.22 + filas * 0.6;
  g.add(caja(0.64, 0.16, 0.64, '#2563eb', 0, top + 0.08, 0));
  studs([[-0.15, top + 0.2, -0.15], [0.15, top + 0.2, -0.15], [-0.15, top + 0.2, 0.15], [0.15, top + 0.2, 0.15]], '#2563eb', g, false);
  scene.add(g);
}

// Pared fondo con claraboya sobre la estantería derecha
paredLadrillos(0, -D / 2 - 0.25, W, 0, { f0: 5, f1: 7, a: 5.5, b: 11.5 });
{
  const cg = new THREE.Group(); cg.position.set(8.5, 0, -D / 2 - 0.25);
  cg.add(caja(6.0, 0.16, 0.62, '#dc2626', 0, 2.95, 0));
  cg.add(caja(6.0, 0.16, 0.62, '#dc2626', 0, 4.82, 0));
  cg.add(caja(0.16, 1.72, 0.58, '#dc2626', -2.92, 3.88, 0));
  cg.add(caja(0.16, 1.72, 0.58, '#dc2626', 2.92, 3.88, 0));
  cg.add(caja(0.14, 1.72, 0.24, '#ffffff', 0, 3.88, 0));
  cg.add(caja(5.68, 1.72, 0.08, mat('#bae6fd', { transparent: true, opacity: 0.45 }), 0, 3.88, 0, false));
  scene.add(cg);
}
// Tira LED arquitectónica superior en pared trasera (look tech moderno)
scene.add(caja(W - 1.2, 0.07, 0.08, new THREE.MeshBasicMaterial({ color: '#38bdf8' }), 0, 5.15, -D / 2 + 0.05, false));
// Reloj LEGO en pared trasera izquierda
{
  const rel = cil(0.55, 0.12, '#ffffff', -14.2, 3.7, -D / 2 + 0.06, 20);
  rel.rotation.x = Math.PI / 2; scene.add(rel);
  const aro = cil(0.62, 0.08, '#1e293b', -14.2, 3.7, -D / 2 + 0.02, 20);
  aro.rotation.x = Math.PI / 2; scene.add(aro);
  scene.add(caja(0.06, 0.34, 0.04, '#dc2626', -14.2, 3.84, -D / 2 + 0.14, false));
  scene.add(caja(0.24, 0.05, 0.04, '#0f172a', -14.08, 3.7, -D / 2 + 0.14, false));
}

// Pared izquierda con gran ventanal LEGO y jambas cerradas
paredLadrillos(-W / 2 - 0.25, 0, D, Math.PI / 2, { f0: 2, f1: 6, a: -2.2, b: 2.2 });
{
  const vg = new THREE.Group(); vg.position.set(-W / 2 - 0.25, 0, 0); vg.rotation.y = Math.PI / 2;
  vg.add(caja(4.4, 0.18, 0.68, '#dc2626', 0, 1.15, 0)); // alféizar rojo LEGO
  vg.add(caja(4.4, 0.18, 0.68, '#dc2626', 0, 4.25, 0));
  vg.add(caja(0.18, 2.94, 0.62, '#dc2626', -2.11, 2.7, 0)); // jamba izq
  vg.add(caja(0.18, 2.94, 0.62, '#dc2626', 2.11, 2.7, 0));  // jamba der
  vg.add(caja(4.1, 2.9, 0.08, mat('#bae6fd', { transparent: true, opacity: 0.45 }), 0, 2.7, 0, false));
  vg.add(caja(0.14, 2.9, 0.22, '#ffffff', 0, 2.7, 0)); // parteluz central LEGO
  // Flores LEGO en el alféizar exterior
  for (const fx of [-1.2, -0.4, 0.6, 1.3]) {
    vg.add(cil(0.08, 0.22, '#16a34a', fx, 1.35, -0.22, 8));
    vg.add(cil(0.14, 0.12, fx > 0 ? '#f43f5e' : '#eab308', fx, 1.5, -0.22, 8));
  }
  scene.add(vg);
}

// Pared derecha completa (9 filas = 5.4u) con ventanal panorámico integrado
paredLadrillos(W / 2 + 0.25, 0, D, Math.PI / 2, { f0: 2, f1: 6, a: -4.0, b: 4.0 });
{
  const vder = new THREE.Group(); vder.position.set(W / 2 + 0.25, 0, 0); vder.rotation.y = Math.PI / 2;
  vder.add(caja(8.0, 0.16, 0.62, '#1e293b', 0, 1.15, 0));
  vder.add(caja(8.0, 0.16, 0.62, '#1e293b', 0, 4.25, 0));
  vder.add(caja(0.16, 2.94, 0.58, '#1e293b', -3.92, 2.7, 0));
  vder.add(caja(0.16, 2.94, 0.58, '#1e293b', 3.92, 2.7, 0));
  vder.add(caja(7.7, 2.9, 0.08, mat('#bae6fd', { transparent: true, opacity: 0.35 }), 0, 2.7, 0, false));
  scene.add(vder);
}

// Fachada frontal completa (9 filas) con ventanal panorámico y vano de puerta (x=12.6..15.8)
{
  // Tramo izquierdo y central hasta el vano de la puerta (x = -17 .. 12.6, ancho 29.6, centro -2.2)
  paredLadrillos(-2.2, D / 2 + 0.25, 29.6, 0, { f0: 2, f1: 6, a: -11.0, b: 3.0 });
  const vfr = new THREE.Group(); vfr.position.set(-6.2, 0, D / 2 + 0.25);
  vfr.add(caja(14.0, 0.16, 0.62, '#2563eb', 0, 1.15, 0));
  vfr.add(caja(14.0, 0.16, 0.62, '#2563eb', 0, 4.25, 0));
  vfr.add(caja(0.16, 2.94, 0.58, '#2563eb', -6.92, 2.7, 0));
  vfr.add(caja(0.16, 2.94, 0.58, '#2563eb', 6.92, 2.7, 0));
  vfr.add(caja(13.7, 2.9, 0.08, mat('#bae6fd', { transparent: true, opacity: 0.34 }), 0, 2.7, 0, false));
  scene.add(vfr);
  // Dintel superior sobre la puerta (x = 12.6 .. 17.0, ancho 4.4, centro 14.8)
  for (let fila = 5; fila < 9; fila++) {
    scene.add(caja(4.36, 0.58, 0.5, fila % 2 ? '#ece4d3' : '#f6f0e4', 14.8, 0.3 + fila * 0.6, D / 2 + 0.25));
  }
  // Tramo derecho junto a puerta (x = 15.8 .. 17.0, ancho 1.2, centro 16.4)
  for (let fila = 0; fila < 5; fila++) {
    scene.add(caja(1.16, 0.58, 0.5, fila % 2 ? '#ece4d3' : '#f6f0e4', 16.4, 0.3 + fila * 0.6, D / 2 + 0.25));
  }
}
{
  const px = 14.2, pz = D / 2 + 0.25;
  // Marco puerta LEGO proporcionado (2.8m altura libre) + dintel azul con studs
  scene.add(caja(0.28, 2.75, 0.56, '#1e293b', px - 1.46, 1.38, pz));
  scene.add(caja(0.28, 2.75, 0.56, '#1e293b', px + 1.46, 1.38, pz));
  scene.add(caja(3.2, 0.42, 0.58, '#2563eb', px, 2.96, pz));
  studs([[-1.0, 3.21, 0], [0, 3.21, 0], [1.0, 3.21, 0]].map(([dx, y, dz]) => [px + dx, y, pz + dz]), '#2563eb');
  // Hoja de puerta LEGO acristalada entreabierta hacia afuera
  const hoja = new THREE.Group(); hoja.position.set(px - 1.32, 0, pz); hoja.rotation.y = -0.68;
  hoja.add(caja(1.75, 2.65, 0.14, '#1d4ed8', 0.875, 1.35, 0));
  hoja.add(caja(1.25, 1.65, 0.06, mat('#bae6fd', { transparent: true, opacity: 0.52 }), 0.875, 1.58, 0, false));
  hoja.add(cil(0.07, 0.14, '#ffd43b', 1.58, 1.25, 0.1, 10));
  scene.add(hoja);
  // Escalón y felpudo exterior de entrada
  scene.add(caja(2.8, 0.16, 0.95, '#64748b', px, -0.06, pz + 0.65));
  scene.add(caja(2.1, 0.04, 0.62, '#dc2626', px, 0.04, pz + 0.65, false));
}

// 4 Pilares de esquina LEGO completos cerrando las cuatro esquinas (altura 5.5)
pilarEsquina(-W / 2 - 0.25, -D / 2 - 0.25, 5.5);
pilarEsquina(W / 2 + 0.25, -D / 2 - 0.25, 5.5);
pilarEsquina(-W / 2 - 0.25, D / 2 + 0.25, 5.5);
pilarEsquina(W / 2 + 0.25, D / 2 + 0.25, 5.5);

// ---------------- Sistema de Techo Inteligente (Visible / Oculto / Translúcido) ----------------
const techoGrupo = new THREE.Group();
const techoMatSolido = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.35, metalness: 0.08 });
const techoMatBorde = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4, metalness: 0.15 });
const techoMatCristal = new THREE.MeshStandardMaterial({ color: '#bae6fd', roughness: 0.2, transparent: true, opacity: 0.45 });
{
  // Losa perimetral y central del techo (W+1 x D+1 a y=5.55)
  const placa = new THREE.Mesh(new THREE.BoxGeometry(W + 1.0, 0.22, D + 1.0), techoMatSolido);
  placa.position.set(0, 5.55, 0); placa.receiveShadow = true; techoGrupo.add(placa);
  const marcoN = new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, 0.28, 0.45), techoMatBorde);
  marcoN.position.set(0, 5.6, -D / 2 - 0.3); techoGrupo.add(marcoN);
  const marcoS = new THREE.Mesh(new THREE.BoxGeometry(W + 1.2, 0.28, 0.45), techoMatBorde);
  marcoS.position.set(0, 5.6, D / 2 + 0.3); techoGrupo.add(marcoS);
  const claraboyaTecho = new THREE.Mesh(new THREE.BoxGeometry(14.0, 0.12, 7.0), techoMatCristal);
  claraboyaTecho.position.set(-2.0, 5.68, -0.5); techoGrupo.add(claraboyaTecho);
  // Tiras LED interiores del techo
  for (const lz of [-5.2, 0.0, 5.2]) {
    techoGrupo.add(caja(26.0, 0.06, 0.18, new THREE.MeshBasicMaterial({ color: '#e0f2fe' }), -1.0, 5.4, lz, false));
  }
}
scene.add(techoGrupo);

let techoModo = 'translucido';
function setTechoModo(modo) {
  techoModo = ['visible', 'oculto', 'translucido'].includes(modo) ? modo : 'translucido';
  if (techoModo === 'oculto') {
    techoGrupo.visible = false;
  } else if (techoModo === 'visible') {
    techoGrupo.visible = true;
    techoMatSolido.transparent = false; techoMatSolido.opacity = 1; techoMatSolido.depthWrite = true;
    techoMatBorde.transparent = false; techoMatBorde.opacity = 1; techoMatBorde.depthWrite = true;
    techoMatCristal.opacity = 0.45;
  } else {
    techoGrupo.visible = true;
    techoMatSolido.transparent = true; techoMatSolido.opacity = 0.22; techoMatSolido.depthWrite = false;
    techoMatBorde.transparent = true; techoMatBorde.opacity = 0.35; techoMatBorde.depthWrite = false;
    techoMatCristal.opacity = 0.14;
  }
  const lbl = techoModo === 'visible' ? 'Visible' : techoModo === 'oculto' ? 'Oculto' : 'Translúcido';
  const b1 = document.getElementById('btnTecho'); if (b1) b1.textContent = `🏠 Techo: ${lbl}`;
  const b2 = document.getElementById('camTechoBtn'); if (b2) b2.textContent = `🏠 ${lbl}`;
  return techoModo;
}
setTechoModo('translucido');

// Letrero amarillo LEGO en la pared izquierda
{
  const c = document.createElement('canvas'); c.width = 960; c.height = 160; const g = c.getContext('2d');
  const pinta = () => {
    g.fillStyle = '#ffd43b'; g.fillRect(0, 0, 960, 160);
    g.fillStyle = '#1e293b'; g.font = '800 76px "Baloo 2", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('ESTUDIO  @gambitoia', 480, 84);
  };
  pinta();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(5.2, 0.9, 0.16),
    [mat('#eab308'), mat('#eab308'), mat('#eab308'), mat('#eab308'), new THREE.MeshStandardMaterial({ map: t, roughness: 0.45 }), mat('#eab308')]
  );
  m.position.set(-W / 2 + 0.08, 4.35, -5.3); m.rotation.y = Math.PI / 2; scene.add(m);
  document.fonts?.ready.then(() => { pinta(); t.needsUpdate = true; });
}

// ---------------- Pantalla Gigante de Pared ----------------
const pantallaCanvas = document.createElement('canvas');
pantallaCanvas.width = 1408; pantallaCanvas.height = 584;
const pantallaTex = new THREE.CanvasTexture(pantallaCanvas);
pantallaTex.colorSpace = THREE.SRGBColorSpace; pantallaTex.anisotropy = 8;
let pantallaMalla;
{
  const px = -6.0, py = 3.05, pz = -D / 2 + 0.14;
  scene.add(caja(10.8, 4.7, 0.24, '#1e293b', px, py, pz));
  scene.add(caja(11.0, 0.22, 0.28, '#2563eb', px, py + 2.42, pz));
  pantallaMalla = new THREE.Mesh(
    new THREE.PlaneGeometry(10.2, 4.2),
    new THREE.MeshBasicMaterial({ map: pantallaTex, toneMapped: false })
  );
  pantallaMalla.userData.pantallaMetricas = true;
  pantallaMalla.position.set(px, py, pz + 0.13); scene.add(pantallaMalla);
  const s = []; for (let x = px - 5; x <= px + 5; x += 1) s.push([x, py + 2.57, pz]); studs(s, '#2563eb');
}

let metricasReales = null;
let metricasError = '';
const EST_ESTADO_MET = {
  verificado_local: 'Verificado local',
  verificado_api: 'API en vivo',
  parcial: 'Parcial (sin API)',
  no_disponible: 'No disponible',
};
const fmtHoraCorta = (iso) => {
  if (!iso) return 'sin fecha';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const plan = { pasos: [], paso: 0, hechos: null, de: '', t: null };
function dibujaPantallaPared() {
  const g = pantallaCanvas.getContext('2d');
  const Wc = pantallaCanvas.width, Hc = pantallaCanvas.height;
  g.fillStyle = '#0f172a'; g.fillRect(0, 0, Wc, Hc);
  // Cabecera
  g.fillStyle = '#1e293b'; g.fillRect(0, 0, Wc, 86);
  g.fillStyle = '#ffd43b'; g.fillRect(0, 82, Wc, 4);
  g.fillStyle = '#f8fafc'; g.font = '800 44px "Baloo 2", sans-serif'; g.textBaseline = 'middle';
  const quien = plan.de ? (agentes[plan.de]?.cfg.nombre || plan.de) : 'Estudio LEGO';
  g.fillText(`📺 PANTALLA CENTRAL · ${quien}`, 34, 44);
  if (plan.t) {
    g.font = '800 26px Nunito, sans-serif'; g.fillStyle = '#94a3b8'; g.textAlign = 'right';
    g.fillText(new Date(plan.t).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }), Wc - 34, 44);
    g.textAlign = 'left';
  }

  // Mitad izquierda: Plan actual
  g.textBaseline = 'top';
  g.fillStyle = '#38bdf8'; g.font = '800 28px "Baloo 2", sans-serif';
  g.fillText('PLAN DE TRABAJO ACTUAL', 34, 108);
  if (!plan.pasos.length) {
    g.fillStyle = '#94a3b8'; g.font = '700 30px Nunito, sans-serif';
    g.fillText('Sin plan activo observado.', 34, 165);
    g.fillStyle = '#64748b'; g.font = '700 24px Nunito, sans-serif';
    g.fillText('Cuando Claude o Gemini reciban una tarea,', 34, 215);
    g.fillText('su plan aparecerá aquí en tiempo real.', 34, 248);
  } else {
    const n = plan.pasos.length; const alto = Math.min(62, (Hc - 165) / n); const fs = Math.min(30, alto * 0.56);
    plan.pasos.forEach((txt, i) => {
      const num = i + 1; const y = 152 + i * alto;
      const hecho = plan.hechos ? plan.hechos.includes(num) : num < plan.paso;
      const activo = num === plan.paso;
      if (activo) { g.fillStyle = 'rgba(250, 204, 21, 0.16)'; g.fillRect(28, y, 780, alto - 4); g.fillStyle = '#facc15'; g.fillRect(28, y, 8, alto - 4); }
      g.font = `800 ${fs}px Nunito, sans-serif`;
      g.fillStyle = hecho ? '#22c55e' : activo ? '#facc15' : '#64748b';
      g.fillText(hecho ? '✔' : activo ? '▶' : '○', 46, y + (alto - fs) / 2);
      g.fillStyle = hecho ? '#64748b' : '#f1f5f9';
      let t = `${num}. ${txt}`;
      while (g.measureText(t).width > 700 && t.length > 4) t = t.slice(0, -2) + '…';
      g.fillText(t, 92, y + (alto - fs) / 2);
    });
  }

  // Mitad derecha: Métricas reales locales IG / TikTok / YouTube (Fase 3)
  g.fillStyle = '#334155'; g.fillRect(838, 104, 2, Hc - 128);
  g.fillStyle = '#fb923c'; g.font = '800 26px "Baloo 2", sans-serif';
  g.fillText('📊 REDES SOCIALES (DATO REAL)', 862, 108);
  const INACTIVOS = new Set(['libre', 'desconocido', 'desconectado', 'finalizado']);
  const activos = Object.values(agentes).filter((a) => !INACTIVOS.has(a.estado)).length;
  g.fillStyle = '#cbd5e1'; g.font = '700 20px Nunito, sans-serif';
  g.fillText(`Equipo activo: ${activos}/${Object.keys(agentes).length} · ${DEMO ? 'Animación Demo' : 'En vivo'}`, 862, 146);

  if (!metricasReales?.redes) {
    g.fillStyle = '#94a3b8'; g.font = '700 22px Nunito, sans-serif';
    g.fillText(metricasError ? 'Sin conexión a /api/metricas' : 'Cargando métricas reales…', 862, 200);
    g.fillStyle = '#fde047'; g.font = '700 20px Nunito, sans-serif';
    g.fillText('No se muestran cifras inventadas.', 862, 238);
  } else {
    const redes = metricasReales.redes;
    const filas = [
      { r: redes.ig, corto: 'IG · Vaeloria', col: '#f472b6' },
      { r: redes.tiktok, corto: 'TT · Theraisla', col: '#38bdf8' },
      { r: redes.youtube, corto: 'YT · Oriente', col: '#f87171' },
    ];
    filas.forEach(({ r, corto, col }, idx) => {
      const y = 186 + idx * 108;
      g.fillStyle = 'rgba(30, 41, 59, 0.85)';
      g.fillRect(858, y, 522, 96);
      g.fillStyle = col; g.fillRect(858, y, 6, 96);
      g.font = '800 23px "Baloo 2", sans-serif'; g.fillStyle = '#f8fafc';
      g.fillText(`${r.icono} ${corto}: ${r.seguidores.valor} seg.`, 876, y + 8);
      g.font = '700 18px Nunito, sans-serif'; g.fillStyle = '#fde047';
      let l2 = `${r.variacion.valor} · ${r.publicaciones.valor}`;
      while (g.measureText(l2).width > 488 && l2.length > 8) l2 = l2.slice(0, -2) + '…';
      g.fillText(l2, 876, y + 40);
      g.font = '700 16px Nunito, sans-serif'; g.fillStyle = '#94a3b8';
      const fTxt = `Fuente: ${r.seguidores.fuente.split('+')[0].trim()} (${fmtHoraCorta(r.seguidores.fecha)}) · API: ${r.apiConfigurada ? 'ON' : 'OFF'}`;
      g.fillText(fTxt.slice(0, 56), 876, y + 66);
    });
    g.fillStyle = '#cbd5e1'; g.font = '700 17px Nunito, sans-serif';
    g.fillText('Rendimiento/alcance: APIs IG/TT/YT no config.', 862, 518);
    g.fillStyle = '#38bdf8'; g.font = '800 17px Nunito, sans-serif';
    g.fillText('Clic en pantalla o «📊 Métricas» para detalle', 862, 544);
  }

  pantallaTex.needsUpdate = true;
}

const reunionActiva = { participantes: new Map(), motivo: '', origen: 'real', desde: 0 };
const reunionDiv = document.createElement('div');
reunionDiv.className = 'reunionBanner oculta';

// ---------------- Sala Pequeña de Reuniones y Decoración LEGO ----------------
{
  const sx = SALA_CENTRO.x, sz = SALA_CENTRO.z;
  // Murete bajo con bloques de cristal translúcido separando la sala de reuniones
  scene.add(caja(0.35, 0.75, 5.2, '#e2e8f0', sx - 3.35, 0.375, sz));
  scene.add(caja(0.22, 0.85, 4.8, mat('#93c5fd', { transparent: true, opacity: 0.42 }), sx - 3.35, 1.15, sz, false));
  studs(Array.from({ length: 5 }, (_, i) => [sx - 3.35, 1.62, sz - 2.0 + i]), '#93c5fd');

  // Mesa redonda/modular LEGO de reuniones
  scene.add(cil(1.38, 0.14, '#f8fafc', sx, 0.9, sz, 24));
  scene.add(cil(1.42, 0.06, '#d97706', sx, 0.86, sz, 24));
  scene.add(cil(0.32, 0.84, '#475569', sx, 0.42, sz, 16));
  scene.add(cil(0.75, 0.08, '#475569', sx, 0.04, sz, 16));
  // Tazas y bloc sobre la mesa de reuniones
  scene.add(cil(0.08, 0.16, '#ef4444', sx - 0.55, 1.05, sz - 0.35, 10));
  scene.add(cil(0.08, 0.16, '#3b82f6', sx + 0.5, 1.05, sz + 0.4, 10));
  scene.add(caja(0.55, 0.03, 0.42, '#fef08a', sx, 0.99, sz));
  const oReunion = new CSS2DObject(reunionDiv); oReunion.position.set(sx, 2.85, sz); scene.add(oReunion);
  // 4 sillas giratorias LEGO alrededor
  for (const s of SALA_SILLAS) {
    const sg = new THREE.Group(); sg.position.set(s.x, 0, s.z); sg.rotation.y = s.rotY;
    sg.add(caja(0.72, 0.1, 0.68, '#334155', 0, 0.52, 0));
    sg.add(caja(0.72, 0.65, 0.1, '#334155', 0, 0.88, -0.34));
    sg.add(cil(0.06, 0.46, '#94a3b8', 0, 0.24, 0, 8));
    sg.add(caja(0.55, 0.05, 0.55, '#94a3b8', 0, 0.03, 0));
    scene.add(sg);
  }
}

// Decoración LEGO: estantería trasera, cámara de vídeo, cafetera, fuente, plantas
function plantaLego(x, z) {
  scene.add(caja(0.76, 0.56, 0.76, '#b45309', x, 0.28, z));
  for (let i = 0; i < 4; i++) {
    const m = caja(0.68 - i * 0.12, 0.44, 0.68 - i * 0.12, i % 2 ? '#22c55e' : '#16a34a', x, 0.78 + i * 0.44, z);
    m.rotation.y = i * 0.42; scene.add(m);
  }
}
plantaLego(-15.6, -9.6); plantaLego(-15.6, 9.4); plantaLego(15.6, -1.0); plantaLego(4.3, -9.6);

// Estantería con bloques de colores tras Claude & Gemini
{
  const bx = 8.5, bz = -10.55;
  scene.add(caja(5.4, 2.4, 0.65, '#475569', bx, 1.2, bz));
  const ladrillos = ['#ef4444', '#facc15', '#3b82f6', '#22c55e', '#a855f7', '#f97316'];
  for (let i = 0; i < 6; i++) scene.add(caja(0.65, 0.42, 0.48, ladrillos[i], bx - 2.0 + i * 0.8, 2.6, bz));
}
// Dispensador agua + cafetera LEGO pegados a la pared derecha (libres del carril 13.8)
scene.add(caja(0.8, 1.45, 0.8, '#f1f5f9', 15.9, 0.72, -9.2));
scene.add(cil(0.3, 0.65, mat('#60a5fa', { transparent: true, opacity: 0.75 }), 15.9, 1.78, -9.2));
scene.add(caja(1.1, 0.95, 0.78, '#475569', 15.8, 0.48, -7.2));
scene.add(caja(0.68, 0.65, 0.52, '#1e293b', 15.8, 1.28, -7.2));
scene.add(cil(0.1, 0.18, '#ffffff', 15.6, 1.05, -6.88, 10));

// Cámara de estudio sobre trípode + claqueta junto a 7·Dir. Audiovisual
{
  const cx = -15.3, cz = 4.2;
  scene.add(cil(0.05, 1.35, '#334155', cx, 0.68, cz, 8));
  scene.add(caja(0.45, 0.08, 0.45, '#334155', cx, 0.04, cz));
  scene.add(caja(0.55, 0.36, 0.34, '#0f172a', cx, 1.5, cz));
  const lente = cil(0.14, 0.24, '#475569', cx + 0.36, 1.5, cz, 12);
  lente.rotation.z = Math.PI / 2; scene.add(lente);
}

// ---------------- Constructor de Minifigura LEGO Identificable ----------------
function torsoGeo() {
  const g = new THREE.BoxGeometry(0.6, 0.48, 0.3); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setX(i, p.getX(i) * 0.72);
  g.computeVertexNormals(); return g;
}
const TORSO = torsoGeo();

function minifig(cfg) {
  const root = new THREE.Group();
  const cuerpo = new THREE.Group(); root.add(cuerpo);
  const ropa = cfg.color, pantalon = cfg.pantalon || '#27364f';
  const piernas = [-0.14, 0.14].map((x) => {
    const p = new THREE.Group(); p.position.set(x, 0.6, 0);
    p.add(caja(0.26, 0.58, 0.28, pantalon, 0, -0.29, 0.02));
    cuerpo.add(p); return p;
  });
  cuerpo.add(caja(0.56, 0.12, 0.28, pantalon, 0, 0.66, 0));
  const torso = new THREE.Mesh(TORSO, mat(ropa)); torso.position.y = 0.96; torso.castShadow = true; cuerpo.add(torso);
  cuerpo.add(caja(0.13, 0.22, 0.02, cfg.visor ? '#38bdf8' : '#ffffff', 0, 0.99, 0.155));

  const brazos = [-1, 1].map((s) => {
    const b = new THREE.Group(); b.position.set(s * 0.32, 1.14, 0);
    const a = caja(0.14, 0.38, 0.16, ropa, s * 0.04, -0.16, 0); a.rotation.z = s * 0.12; b.add(a);
    b.add(cil(0.07, 0.11, PIEL, s * 0.06, -0.38, 0.04, 10));
    cuerpo.add(b); return b;
  });

  const cabeza = new THREE.Group(); cabeza.position.y = 1.23; cuerpo.add(cabeza);
  cabeza.add(cil(0.09, 0.06, PIEL, 0, 0.01, 0, 10));
  cabeza.add(cil(0.195, 0.31, PIEL, 0, 0.19, 0, 20));
  cabeza.add(cil(0.09, 0.08, PIEL, 0, 0.38, 0, 12));

  const ojo = new THREE.SphereGeometry(0.028, 8, 6);
  for (const x of [-0.068, 0.068]) { const o = new THREE.Mesh(ojo, mat('#111')); o.position.set(x, 0.24, 0.18); cabeza.add(o); }
  if (cfg.gafas) {
    for (const x of [-0.068, 0.068]) {
      const aro = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.01, 6, 12), mat('#0f172a'));
      aro.position.set(x, 0.24, 0.195); cabeza.add(aro);
    }
    cabeza.add(caja(0.04, 0.015, 0.015, '#0f172a', 0, 0.24, 0.195, false));
  }
  const boca = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.013, 6, 12, Math.PI), mat('#111'));
  boca.position.set(0, 0.15, 0.185); boca.rotation.z = Math.PI; cabeza.add(boca);

  if (cfg.pelo) { cabeza.add(cil(0.21, 0.12, cfg.pelo, 0, 0.35, -0.01, 20)); cabeza.add(caja(0.4, 0.2, 0.11, cfg.pelo, 0, 0.26, -0.14)); }
  if (cfg.casco) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(cfg.casco)); c.position.y = 0.31; cabeza.add(c); cabeza.add(cil(0.28, 0.03, cfg.casco, 0, 0.32, 0, 20)); }
  if (cfg.gorra) { cabeza.add(cil(0.21, 0.12, cfg.gorra, 0, 0.36, 0, 20)); cabeza.add(caja(0.29, 0.03, 0.19, cfg.gorra, 0, 0.31, 0.22)); }
  if (cfg.gorro) { const go = new THREE.Mesh(new THREE.SphereGeometry(0.215, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), mat(cfg.gorro)); go.position.set(0, 0.30, 0); cabeza.add(go); }
  if (cfg.boina) { const b = cil(0.25, 0.09, cfg.boina, 0.04, 0.38, -0.02, 18); b.rotation.z = -0.18; cabeza.add(b); }
  if (cfg.auriculares || cfg.micro) {
    const diad = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.02, 6, 16, Math.PI), mat('#1e293b'));
    diad.position.y = 0.26; cabeza.add(diad);
    for (const sx of [-0.21, 0.21]) {
      const copa = cil(0.06, 0.04, cfg.micro ? '#0ea5e9' : '#ef4444', sx, 0.21, 0, 10);
      copa.rotation.z = Math.PI / 2; cabeza.add(copa);
    }
    if (cfg.micro) {
      const varilla = cil(0.012, 0.16, '#1e293b', 0.14, 0.16, 0.14, 6);
      varilla.rotation.z = Math.PI / 3; varilla.rotation.y = 0.4; cabeza.add(varilla);
    }
  }
  if (cfg.visor) {
    cabeza.add(cil(0.205, 0.11, '#0f172a', 0, 0.34, -0.01, 20));
    cabeza.add(caja(0.36, 0.08, 0.07, cfg.visor, 0, 0.24, 0.17, false));
  }

  const papel = caja(0.26, 0.02, 0.34, '#ffffff', 0.06, -0.45, 0.15);
  papel.visible = false; brazos[1].add(papel);
  const auricular = caja(0.08, 0.18, 0.08, '#0f172a', -0.05, -0.34, 0.12);
  auricular.visible = false; brazos[0].add(auricular);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { root, cuerpo, piernas, brazos, cabeza, papel, auricular };
}

// ---------------- Escritorio Individual LEGO + Props por Rol ----------------
function crearMonitorCanvas() { const c = document.createElement('canvas'); c.width = 256; c.height = 160; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { c, t }; }
function puesto(cfg) {
  const g = new THREE.Group(); g.position.set(cfg.x, 0, cfg.z); scene.add(g);
  g.add(caja(2.35, 0.12, 1.12, '#f8fafc', 0, 0.9, 0));
  g.add(caja(2.35, 0.06, 0.08, cfg.color, 0, 0.93, 0.56));
  for (const [lx, lz] of [[-1.08, -0.46], [1.08, -0.46], [-1.08, 0.46], [1.08, 0.46]]) g.add(caja(0.12, 0.84, 0.12, '#94a3b8', lx, 0.42, lz));
  studs([[-1.0, 0.99, -0.44], [-0.75, 0.99, -0.44], [0.75, 0.99, -0.44], [1.0, 0.99, -0.44]], '#f8fafc', g, false);

  // Monitor y periféricos
  g.add(caja(0.12, 0.24, 0.12, '#334155', 0, 1.08, -0.3));
  g.add(caja(0.46, 0.04, 0.28, '#334155', 0, 0.98, -0.3));
  g.add(caja(1.22, 0.8, 0.08, '#1e293b', 0, 1.56, -0.34));
  const pc = crearMonitorCanvas();
  const pantalla = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.7), new THREE.MeshBasicMaterial({ map: pc.t, toneMapped: false }));
  pantalla.position.set(0, 1.56, -0.295); g.add(pantalla);
  g.add(caja(0.84, 0.04, 0.28, '#cbd5e1', 0, 0.98, 0.22));
  g.add(caja(0.14, 0.04, 0.2, '#cbd5e1', 0.58, 0.98, 0.22));

  // Lámpara LEGO de estado
  g.add(cil(0.06, 0.22, '#475569', -0.96, 1.07, -0.38, 8));
  const luz = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 12, 10),
    new THREE.MeshStandardMaterial({ color: COLOR_ESTADO.libre, emissive: COLOR_ESTADO.libre, emissiveIntensity: 0.45 })
  );
  luz.position.set(-0.96, 1.25, -0.38); g.add(luz);

  // Taza + teléfono de escritorio + accesorio distintivo por especialista
  g.add(cil(0.075, 0.14, cfg.color, -0.65, 1.03, 0.18, 10));
  g.add(caja(0.18, 0.06, 0.22, '#334155', -0.92, 0.99, 0.14));
  g.add(caja(0.07, 0.04, 0.2, '#0f172a', -0.92, 1.04, 0.14));
  if (cfg.prop === 'claqueta') { g.add(caja(0.28, 0.22, 0.05, '#0f172a', 0.84, 1.07, -0.25)); g.add(caja(0.28, 0.05, 0.05, '#ffffff', 0.84, 1.2, -0.25)); }
  else if (cfg.prop === 'paleta') { g.add(cil(0.16, 0.03, '#fef3c7', 0.84, 0.98, -0.18, 10)); g.add(cil(0.04, 0.04, '#ef4444', 0.8, 1.0, -0.22, 6)); g.add(cil(0.04, 0.04, '#3b82f6', 0.88, 1.0, -0.14, 6)); }
  else if (cfg.prop === 'radar') { g.add(cil(0.03, 0.35, '#64748b', 0.9, 1.13, -0.35, 8)); const plato = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.1, 10), mat('#f59e0b')); plato.position.set(0.9, 1.32, -0.35); g.add(plato); }
  else if (cfg.prop === 'libreta') { g.add(caja(0.32, 0.04, 0.4, '#fef08a', -0.78, 0.98, -0.05)); }
  else if (cfg.prop === 'lupa') { g.add(caja(0.26, 0.05, 0.26, '#dcfce7', 0.84, 0.99, -0.2)); }
  else if (cfg.prop === 'clipboard') { g.add(caja(0.28, 0.03, 0.36, '#94a3b8', 0.84, 0.98, -0.22)); g.add(caja(0.22, 0.02, 0.28, '#f8fafc', 0.84, 1.0, -0.21)); }
  else if (cfg.prop === 'grafica') { g.add(caja(0.06, 0.14, 0.06, '#0d9488', 0.78, 1.03, -0.24)); g.add(caja(0.06, 0.22, 0.06, '#22c55e', 0.86, 1.07, -0.24)); g.add(caja(0.06, 0.1, 0.06, '#eab308', 0.94, 1.01, -0.24)); }
  else if (cfg.prop === 'tablero') { g.add(caja(0.32, 0.03, 0.26, '#e0e7ff', 0.84, 0.98, -0.22)); g.add(caja(0.08, 0.03, 0.08, '#4f46e5', 0.78, 1.01, -0.22)); g.add(caja(0.08, 0.03, 0.08, '#f59e0b', 0.9, 1.01, -0.22)); }
  else if (cfg.prop === 'chat') { g.add(caja(0.28, 0.18, 0.05, '#c026d3', 0.84, 1.05, -0.24)); g.add(caja(0.22, 0.08, 0.06, '#fae8ff', 0.84, 1.06, -0.24)); }
  else if (cfg.prop === 'memoria') {
    // Estantería compacta LEGO con libros/carpetas + panel de nodos de conocimiento
    g.add(caja(0.46, 0.85, 0.34, '#334155', 0.92, 1.38, -0.34));
    g.add(caja(0.42, 0.04, 0.3, '#64748b', 0.92, 1.36, -0.34));
    ['#a855f7', '#38bdf8', '#facc15', '#22c55e'].forEach((col, i) => {
      g.add(caja(0.08, 0.28, 0.22, col, 0.77 + i * 0.1, 1.54, -0.34));
    });
    g.add(caja(0.24, 0.04, 0.28, '#ddd6fe', -0.86, 0.98, -0.18));
    g.add(caja(0.22, 0.04, 0.26, '#c4b5fd', -0.84, 1.02, -0.16));
  }
  else if (cfg.prop === 'codex') {
    // Doble monitor lateral adicional + torre técnica compacta + teclado extendido
    const monIzq = caja(0.58, 0.44, 0.06, '#0f172a', -0.68, 1.3, -0.28);
    monIzq.rotation.y = 0.36; g.add(monIzq);
    const scrIzq = caja(0.52, 0.36, 0.02, new THREE.MeshBasicMaterial({ color: '#0d9488' }), -0.66, 1.3, -0.245);
    scrIzq.rotation.y = 0.36; g.add(scrIzq);
    const monDer = caja(0.58, 0.44, 0.06, '#0f172a', 0.68, 1.3, -0.28);
    monDer.rotation.y = -0.36; g.add(monDer);
    const scrDer = caja(0.52, 0.36, 0.02, new THREE.MeshBasicMaterial({ color: '#14b8a6' }), 0.66, 1.3, -0.245);
    scrDer.rotation.y = -0.36; g.add(scrDer);
    g.add(caja(0.24, 0.42, 0.36, '#1e293b', 0.98, 1.16, -0.3));
    g.add(caja(0.06, 0.06, 0.02, new THREE.MeshBasicMaterial({ color: '#2dd4bf' }), 0.98, 1.28, -0.11, false));
  }
  else if (cfg.prop === 'audio') {
    // Estudio: monitores de audio L/R, mesa de mezclas con faders, micrófono y paneles acústicos
    for (const sx of [-0.88, 0.88]) {
      g.add(caja(0.26, 0.38, 0.24, '#1e293b', sx, 1.15, -0.34));
      const cono = cil(0.08, 0.04, '#ec4899', sx, 1.12, -0.21, 12);
      cono.rotation.x = Math.PI / 2; g.add(cono);
      parlantesAudio.push(cono);
    }
    // Panel acústico discreto detrás del monitor
    g.add(caja(1.36, 0.48, 0.06, '#334155', 0, 1.62, -0.52));
    for (let i = -2; i <= 2; i++) g.add(caja(0.18, 0.36, 0.04, '#be185d', i * 0.26, 1.62, -0.48));
    // Mesa de mezclas con faders y micrófono de brazo
    g.add(caja(0.68, 0.07, 0.34, '#0f172a', 0, 0.99, 0.16));
    for (let i = -2; i <= 2; i++) g.add(caja(0.04, 0.05, 0.14, i % 2 ? '#f472b6' : '#38bdf8', i * 0.11, 1.03, 0.16));
    g.add(cil(0.02, 0.34, '#64748b', -0.52, 1.12, -0.12, 8));
    g.add(cil(0.055, 0.09, '#1e293b', -0.44, 1.28, -0.02, 10));
  }
  else if (cfg.prop === 'resumidor') {
    // Bandejas clasificadoras de contexto (Nivel 1/2/3) + pantalla compacta
    g.add(caja(0.34, 0.04, 0.28, '#38bdf8', -0.84, 0.99, -0.2));
    g.add(caja(0.28, 0.04, 0.24, '#bae6fd', -0.84, 1.04, -0.2));
    g.add(caja(0.22, 0.04, 0.2, '#e0f2fe', -0.84, 1.09, -0.2));
    g.add(caja(0.3, 0.38, 0.06, '#0f172a', 0.84, 1.16, -0.28));
    g.add(caja(0.24, 0.3, 0.02, new THREE.MeshBasicMaterial({ color: '#38bdf8' }), 0.84, 1.16, -0.24, false));
  }

  // Silla
  const silla = new THREE.Group(); silla.position.set(0, 0, 0.88); g.add(silla);
  silla.add(caja(0.7, 0.1, 0.65, '#334155', 0, 0.5, 0));
  silla.add(caja(0.7, 0.7, 0.1, '#334155', 0, 0.9, 0.34));
  silla.add(cil(0.06, 0.44, '#94a3b8', 0, 0.22, 0, 8));
  silla.add(caja(0.55, 0.05, 0.55, '#94a3b8', 0, 0.03, 0));

  const monton = new THREE.Group(); monton.position.set(0.86, 0.97, 0.14); g.add(monton);
  return { g, pantalla: pc, luz, monton, silla };
}

const PAPEL_PILA_GEO = new THREE.BoxGeometry(0.36, 0.025, 0.48);
const VUELO_GEO = new THREE.BoxGeometry(0.38, 0.04, 0.28);
const VUELO_SELLO_GEO = new THREE.BoxGeometry(0.18, 0.05, 0.04);

function apilaPapel(monton) {
  if (monton.children.length >= 6) {
    monton.children[0].removeFromParent();
    monton.children.forEach((m, i) => (m.position.y = i * 0.03));
  }
  const p = new THREE.Mesh(PAPEL_PILA_GEO, mat('#ffffff'));
  p.castShadow = p.receiveShadow = true;
  p.position.set((Math.random() - 0.5) * 0.05, monton.children.length * 0.03, (Math.random() - 0.5) * 0.05);
  p.rotation.y = (Math.random() - 0.5) * 0.35; monton.add(p);
}

function etiqueta(cfg) {
  const anc = document.createElement('div'); anc.className = 'anc';
  anc.innerHTML = `<div class="pila"><div class="burbuja oculta"></div><div class="lbl"><span class="n" style="background:${cfg.color}">${cfg.nombre}</span><span class="e">${NOMBRE_ESTADO.desconocido}</span></div></div>`;
  return { div: anc, bur: anc.querySelector('.burbuja'), est: anc.querySelector('.e') };
}

// ---------------- Personajes y Animaciones Reales ----------------
const damp = THREE.MathUtils.damp;
const ESTADOS_ACTIVOS = new Set(['pensando', 'investigando', 'trabajando', 'caminando', 'conversando', 'entregando', 'revisando']);
const ESTADOS_ANIM_PANTALLA = new Set(['trabajando', 'investigando', 'error', 'bloqueado']);

// Catálogo multi-animación idle (6 comportamientos por especialista, con pesos, duración y pausas naturales)
const IDLE_CATALOGO = {
  coordinador: [
    { id: 'revisar_tablero', peso: 3, dur: [3.2, 4.8] },
    { id: 'consultar_reloj', peso: 2, dur: [2.4, 3.4] },
    { id: 'mirar_equipo', peso: 2.5, dur: [3.4, 5.2] },
    { id: 'ordenar_docs', peso: 2, dur: [2.8, 4.2] },
    { id: 'senalar_tablero', peso: 2, dur: [2.6, 3.8] },
    { id: 'cruzar_brazos_pensar', peso: 1.5, dur: [3.0, 4.6] },
  ],
  analista: [
    { id: 'observar_grafica', peso: 3, dur: [3.2, 4.6] },
    { id: 'tomar_notas', peso: 2.5, dur: [3.0, 4.4] },
    { id: 'comparar_pantallas', peso: 2.5, dur: [3.2, 4.8] },
    { id: 'senalar_crecimiento', peso: 2, dur: [2.6, 3.6] },
    { id: 'revisar_estadistica', peso: 2, dur: [3.0, 4.4] },
    { id: 'celebrar_resultado', peso: 1.2, dur: [2.4, 3.2] },
  ],
  investigador: [
    { id: 'consultar_docs', peso: 2.5, dur: [3.0, 4.5] },
    { id: 'examinar_lupa', peso: 2.5, dur: [2.8, 4.2] },
    { id: 'comparar_refs', peso: 2.5, dur: [3.2, 4.8] },
    { id: 'buscar_pantalla', peso: 2.5, dur: [3.0, 4.4] },
    { id: 'pasar_paginas', peso: 2, dur: [2.8, 4.0] },
    { id: 'pensar_con_doc', peso: 1.5, dur: [3.2, 4.6] },
  ],
  estratega: [
    { id: 'mover_fichas', peso: 2.8, dur: [3.0, 4.4] },
    { id: 'cambiar_idea', peso: 2.2, dur: [2.8, 4.0] },
    { id: 'observar_mapa', peso: 2.5, dur: [3.2, 4.8] },
    { id: 'escribir_nota', peso: 2.2, dur: [2.8, 4.0] },
    { id: 'comparar_propuestas', peso: 2.2, dur: [3.2, 4.6] },
    { id: 'celebrar_idea', peso: 1.2, dur: [2.3, 3.2] },
  ],
  guionista: [
    { id: 'teclear_copy', peso: 3, dur: [3.0, 4.4] },
    { id: 'pensar_arriba', peso: 2.2, dur: [2.8, 4.2] },
    { id: 'borrar_reescribir', peso: 2.2, dur: [3.0, 4.4] },
    { id: 'leer_guion', peso: 2.4, dur: [3.2, 4.8] },
    { id: 'pausa_reflexiva', peso: 1.8, dur: [2.8, 4.0] },
    { id: 'satisfecho_frase', peso: 1.2, dur: [2.4, 3.2] },
  ],
  'director-creativo': [
    { id: 'dibujar_tableta', peso: 3, dur: [3.2, 4.8] },
    { id: 'cambiar_colores', peso: 2.2, dur: [2.6, 3.8] },
    { id: 'observar_composicion', peso: 2.4, dur: [3.2, 4.6] },
    { id: 'girar_maqueta', peso: 2.0, dur: [2.8, 4.2] },
    { id: 'comparar_disenos', peso: 2.2, dur: [3.2, 4.6] },
    { id: 'gesto_inspiracion', peso: 1.3, dur: [2.4, 3.4] },
  ],
  'director-av': [
    { id: 'revisar_timeline', peso: 2.8, dur: [3.2, 4.6] },
    { id: 'controles_edicion', peso: 2.5, dur: [2.8, 4.2] },
    { id: 'observar_pantalla', peso: 2.4, dur: [3.0, 4.4] },
    { id: 'revisar_camara', peso: 2.0, dur: [3.0, 4.4] },
    { id: 'ajustar_claqueta', peso: 1.8, dur: [2.6, 3.8] },
    { id: 'aprobar_toma', peso: 1.3, dur: [2.4, 3.2] },
  ],
  'community-manager': [
    { id: 'consultar_movil', peso: 2.8, dur: [2.8, 4.2] },
    { id: 'escribir_respuesta', peso: 2.5, dur: [3.0, 4.4] },
    { id: 'revisar_comentarios', peso: 2.5, dur: [3.0, 4.6] },
    { id: 'ver_notificaciones', peso: 2.0, dur: [2.6, 3.8] },
    { id: 'reaccion_divertida', peso: 1.4, dur: [2.4, 3.4] },
    { id: 'volver_pantalla', peso: 2.2, dur: [2.8, 4.0] },
  ],
  qa: [
    { id: 'examinar_lupa', peso: 2.8, dur: [3.0, 4.4] },
    { id: 'revisar_checklist', peso: 2.6, dur: [3.2, 4.6] },
    { id: 'comparar_resultados', peso: 2.4, dur: [3.2, 4.8] },
    { id: 'senalar_error', peso: 1.6, dur: [2.6, 3.8] },
    { id: 'marcar_casilla', peso: 2.2, dur: [2.6, 3.8] },
    { id: 'asentir_revision', peso: 1.5, dur: [2.4, 3.4] },
  ],
  memoria: [
    { id: 'ordenar_libros', peso: 2.6, dur: [3.0, 4.6] },
    { id: 'clasificar_carpetas', peso: 2.6, dur: [3.0, 4.4] },
    { id: 'consultar_doc', peso: 2.4, dur: [3.2, 4.6] },
    { id: 'buscar_referencia', peso: 2.4, dur: [3.0, 4.4] },
    { id: 'guardar_archivo', peso: 2.0, dur: [2.8, 4.0] },
    { id: 'observar_nodos', peso: 1.8, dur: [3.2, 4.8] },
  ],
  codex: [
    { id: 'teclear_codigo', peso: 2.8, dur: [3.0, 4.4] },
    { id: 'alternar_monitores', peso: 2.6, dur: [3.2, 4.8] },
    { id: 'revisar_terminal', peso: 2.4, dur: [3.0, 4.4] },
    { id: 'examinar_bloque', peso: 2.2, dur: [3.0, 4.4] },
    { id: 'consultar_tests', peso: 2.0, dur: [2.8, 4.0] },
    { id: 'pensar_pantalla', peso: 1.6, dur: [3.0, 4.6] },
  ],
  audio: [
    { id: 'ajustar_perilla', peso: 2.6, dur: [2.8, 4.2] },
    { id: 'revisar_onda', peso: 2.6, dur: [3.2, 4.6] },
    { id: 'colocar_auriculares', peso: 2.0, dur: [2.8, 4.0] },
    { id: 'inspeccionar_canal', peso: 2.4, dur: [3.0, 4.4] },
    { id: 'ajustar_fader', peso: 2.4, dur: [2.8, 4.2] },
    { id: 'revisar_niveles', peso: 2.0, dur: [3.0, 4.4] },
  ],
  resumidor: [
    { id: 'clasificar_carpetas', peso: 2.6, dur: [3.0, 4.4] },
    { id: 'leer_guion', peso: 2.4, dur: [3.0, 4.4] },
    { id: 'comparar_resultados', peso: 2.4, dur: [3.0, 4.4] },
    { id: 'teclear_copy', peso: 2.4, dur: [2.8, 4.2] },
    { id: 'guardar_archivo', peso: 2.0, dur: [2.8, 4.0] },
    { id: 'asentir_revision', peso: 1.5, dur: [2.4, 3.4] },
  ],
  _especial_comun: [
    { id: 'estirarse', peso: 0.7, dur: [2.6, 3.5] },
    { id: 'frotar_cabeza', peso: 0.7, dur: [2.6, 3.6] },
    { id: 'ordenar_escritorio', peso: 0.7, dur: [2.8, 3.8] },
  ],
  _default: [
    { id: 'pensar_arriba', peso: 2, dur: [3.0, 4.4] },
    { id: 'estirarse', peso: 1.5, dur: [2.6, 3.6] },
    { id: 'ordenar_escritorio', peso: 1.5, dur: [2.8, 4.0] },
    { id: 'revisar_pantalla', peso: 2, dur: [3.0, 4.4] },
  ],
};

function evaluaPoseIdle(accion, lt, tt, sentado) {
  let cy = sentado ? -0.04 : 0, cx = 0, hx = -0.02, hy = 0, hz = 0;
  let bix = -0.25, biy = 0, biz = 0.1, bdx = -0.25, bdy = 0, bdz = -0.1;
  let verPapel = false;

  switch (accion) {
    case 'revisar_tablero': case 'observar_mapa': case 'observar_nodos':
      hy = Math.sin(lt * 1.1) * 0.34; hx = -0.08; bix = -0.45; bdx = -0.85; bdz = -0.15; break;
    case 'consultar_reloj':
      bix = -1.35; biy = -0.65; biz = 0.25; hx = 0.22; hy = 0.35; break;
    case 'mirar_equipo': case 'comparar_pantallas': case 'alternar_monitores':
      hy = Math.sin(lt * 1.45) * 0.55; hx = 0.02; bix = -0.35; bdx = -0.35; break;
    case 'ordenar_docs': case 'ordenar_escritorio': case 'clasificar_carpetas':
      verPapel = true; bix = -0.82 + Math.sin(lt * 3.5) * 0.14; bdx = -0.82 - Math.sin(lt * 3.5) * 0.14; hx = 0.16; hy = Math.sin(lt * 1.2) * 0.18; break;
    case 'senalar_tablero': case 'senalar_crecimiento': case 'senalar_error':
      bdx = -1.65; bdz = -0.22; hx = -0.08; hy = -0.2 + Math.sin(lt * 2.5) * 0.08; bix = -0.35; break;
    case 'cruzar_brazos_pensar':
      bix = -0.85; biy = -0.55; biz = 0.35; bdx = -0.85; bdy = 0.55; bdz = -0.35; hx = -0.1; hz = 0.12; hy = Math.sin(lt * 0.7) * 0.2; break;
    case 'observar_grafica': case 'revisar_estadistica': case 'revisar_timeline': case 'revisar_onda': case 'revisar_niveles':
      hx = 0.06 + Math.sin(lt * 1.6) * 0.05; hy = Math.sin(lt * 0.9) * 0.24; bix = -0.55; bdx = -0.75; break;
    case 'tomar_notas': case 'escribir_nota': case 'borrar_reescribir': case 'dibujar_tableta':
      verPapel = accion !== 'dibujar_tableta'; bix = -0.75; bdx = -0.95 + Math.sin(lt * 7.5) * 0.1; bdz = -0.12; hx = 0.2; hy = -0.1; break;
    case 'celebrar_resultado': case 'celebrar_idea': case 'satisfecho_frase': case 'aprobar_toma': case 'gesto_inspiracion':
      cy = (sentado ? -0.02 : 0.02) + Math.abs(Math.sin(lt * 4.5)) * 0.05;
      bix = -1.65 + Math.sin(lt * 4.5) * 0.15; biz = 0.22; bdx = -1.85; bdz = -0.22; hx = -0.12; hy = Math.sin(lt * 2.2) * 0.15; break;
    case 'consultar_docs': case 'leer_guion': case 'revisar_checklist': case 'consultar_doc': case 'pasar_paginas':
      verPapel = true; bix = -0.88; bdx = -0.95 + Math.sin(lt * 3.0) * 0.08; hx = 0.2; hy = Math.sin(lt * 1.3) * 0.16; break;
    case 'examinar_lupa': case 'examinar_bloque': case 'girar_maqueta':
      bix = -1.05; bdx = -1.25 + Math.sin(lt * 2.4) * 0.12; bdz = -0.25; hx = 0.14; hy = -0.15 + Math.sin(lt * 1.5) * 0.15; break;
    case 'comparar_refs': case 'comparar_propuestas': case 'comparar_disenos': case 'comparar_resultados': case 'observar_composicion':
      hy = Math.sin(lt * 1.2) * 0.42; hz = Math.sin(lt * 0.8) * 0.08; bix = -0.6; bdx = -0.85; break;
    case 'buscar_pantalla': case 'revisar_terminal': case 'consultar_tests': case 'volver_pantalla': case 'revisar_pantalla':
      hx = 0.06; hy = Math.sin(lt * 0.8) * 0.15; bix = -0.92; bdx = -0.88 + Math.sin(lt * 6) * 0.05; break;
    case 'pensar_con_doc': case 'pensar_arriba': case 'pausa_reflexiva': case 'pensar_pantalla':
      verPapel = accion === 'pensar_con_doc'; bix = -0.5; bdx = -2.05; bdy = 0.3; bdz = -0.45; hx = -0.18; hz = 0.14; hy = Math.sin(lt * 0.8) * 0.28; break;
    case 'mover_fichas': case 'cambiar_idea': case 'marcar_casilla': case 'cambiar_colores':
      bdx = -1.05 + Math.sin(lt * 4.2) * 0.16; bdz = -0.28 + Math.cos(lt * 3.0) * 0.12; bix = -0.55; hx = 0.15; hy = -0.15; break;
    case 'teclear_copy': case 'teclear_codigo': case 'escribir_respuesta':
      bix = -1.02 + Math.sin(lt * 13) * 0.07; biz = 0.1; bdx = -1.02 + Math.sin(lt * 13 + 1.8) * 0.07; bdz = -0.1; hx = 0.09; break;
    case 'controles_edicion': case 'ajustar_perilla': case 'ajustar_fader': case 'inspeccionar_canal':
      bdx = -0.98 + Math.sin(lt * 4.8) * 0.12; bdz = -0.18 + Math.sin(lt * 2.2) * 0.1; bix = -0.68; hx = 0.12; hy = Math.sin(lt * 1.4) * 0.16; break;
    case 'revisar_camara': case 'ajustar_claqueta': case 'ordenar_libros': case 'buscar_referencia': case 'guardar_archivo':
      hy = -0.38 + Math.sin(lt * 1.3) * 0.14; bdx = -1.25 + Math.sin(lt * 2.6) * 0.1; bdz = -0.32; bix = -0.42; hx = -0.02; break;
    case 'consultar_movil': case 'revisar_comentarios': case 'ver_notificaciones':
      bix = -1.15; biz = 0.18; bdx = -1.2 + Math.sin(lt * 5.2) * 0.06; bdz = -0.15; hx = 0.22; hy = 0.08; break;
    case 'reaccion_divertida':
      cy = (sentado ? -0.03 : 0.01) + Math.abs(Math.sin(lt * 6)) * 0.04;
      bix = -1.45; biz = 0.28; bdx = -1.45; bdz = -0.28; hx = -0.14; hz = Math.sin(lt * 5) * 0.12; break;
    case 'asentir_revision':
      hx = Math.sin(lt * 4.5) * 0.18; bix = -0.5; bdx = -0.8; verPapel = true; break;
    case 'colocar_auriculares':
      bix = -2.05; biz = 0.34; bdx = -2.05; bdz = -0.34; hz = Math.sin(lt * 1.8) * 0.1; hy = Math.sin(lt * 1.5) * 0.14; break;
    case 'estirarse':
      bix = -2.45; biz = 0.32; bdx = -2.45; bdz = -0.32; hx = -0.22; cy = (sentado ? -0.01 : 0.04); break;
    case 'frotar_cabeza':
      bdx = -2.42; bdy = 0.28; bdz = -0.38; hx = 0.08 + Math.sin(lt * 3.5) * 0.06; hz = 0.12; break;
    default:
      bix = -0.25 + Math.sin(tt * 0.6) * 0.04; hy = Math.sin(tt * 0.4) * 0.25; break;
  }
  if (!sentado) { cy = Math.max(0, cy); }
  else {
    cy = Math.max(-0.045, cy);
    if (bix < -0.32 && bix > -1.06) bix = -1.06;
    if (bdx < -0.32 && bdx > -1.06) bdx = -1.06;
  }
  bix = Math.max(-2.55, Math.min(0.25, bix));
  bdx = Math.max(-2.55, Math.min(0.25, bdx));
  return { cy, cx, hx, hy, hz, bix, biy, biz, bdx, bdy, bdz, verPapel };
}

// Animaciones especializadas multi-articulación por especialidad y etapa (Fase 13)
function poseEspecialidad(id, etapa, tt, sentado) {
  let cy = sentado ? -0.04 : 0, cx = 0, hx = 0.08, hy = 0, hz = 0;
  let bix = -1.08, biy = 0, biz = 0.12, bdx = -1.08, bdy = 0, bdz = -0.12;
  let verPapel = false;
  const sub = Math.floor(tt / 2.6) % 3;

  if (id === 'browser') {
    if (sub === 0) {
      bix = -1.05 + Math.sin(tt * 15) * 0.08; bdx = -1.02 + Math.cos(tt * 9) * 0.12; bdz = -0.24;
      hy = Math.sin(tt * 1.9) * 0.24; hx = 0.06;
    } else if (sub === 1) {
      bix = -1.16 + Math.sin(tt * 18) * 0.1; bdx = -1.16 + Math.cos(tt * 18) * 0.1;
      hy = Math.sin(tt * 2.4) * 0.12; hz = Math.sin(tt * 1.4) * 0.06;
    } else {
      bix = -0.85; bdx = -1.35 + Math.sin(tt * 6) * 0.08; bdz = -0.18;
      hx = -0.04 + Math.sin(tt * 3) * 0.05; hy = Math.sin(tt * 1.5) * 0.28;
    }
  } else if (id === 'investigador') {
    verPapel = sub !== 1;
    if (sub === 0) {
      bix = -0.92; bdx = -1.32 + Math.sin(tt * 3.8) * 0.14; bdz = -0.26;
      hx = 0.16; hy = Math.sin(tt * 1.8) * 0.42;
    } else if (sub === 1) {
      bix = -1.1 + Math.sin(tt * 14) * 0.1; bdx = -1.1 + Math.cos(tt * 14) * 0.1;
      hy = Math.sin(tt * 2.2) * 0.35; hx = -0.05;
    } else {
      bix = -0.55; bdx = -1.25; bdz = -0.18;
      hx = 0.2 + Math.sin(tt * 2.2) * 0.06; hy = Math.sin(tt * 1.1) * 0.22; hz = 0.07;
    }
  } else if (id === 'director-av') {
    if (sub === 0) {
      const clap = Math.abs(Math.sin(tt * 5.2));
      bix = -1.28 - clap * 0.24; biz = 0.22; bdx = -1.28 + clap * 0.12; bdz = -0.22;
      hx = -0.04; hy = Math.sin(tt * 1.7) * 0.22;
    } else if (sub === 1) {
      bix = -1.15 + Math.sin(tt * 16) * 0.1; bdx = -1.1 + Math.cos(tt * 8) * 0.14;
      hy = Math.sin(tt * 2.1) * 0.26; hz = Math.sin(tt * 1.3) * 0.07;
    } else {
      bix = -1.42; biz = 0.34; bdx = -1.42; bdz = -0.34;
      hx = -0.06; hy = Math.sin(tt * 1.4) * 0.18;
    }
  } else if (id === 'audio') {
    if (sub === 0) {
      bix = -1.04 + Math.sin(tt * 6.5) * 0.18; biz = 0.16;
      bdx = -1.04 + Math.cos(tt * 5.2) * 0.18; bdz = -0.16;
      hz = Math.sin(tt * 3.8) * 0.12; hx = 0.08 + Math.sin(tt * 7.6) * 0.04;
    } else if (sub === 1) {
      bix = -1.75; biz = 0.36; bdx = -1.08 + Math.sin(tt * 8) * 0.14; bdz = -0.14;
      hy = Math.sin(tt * 2.5) * 0.22; hz = 0.11;
    } else {
      bix = -1.12 + Math.sin(tt * 12) * 0.1; bdx = -1.12 - Math.sin(tt * 12) * 0.1;
      hx = 0.06 + Math.sin(tt * 6.2) * 0.05; hy = Math.sin(tt * 1.6) * 0.15;
    }
  } else if (id === 'imagen') {
    if (sub === 0) {
      bix = -0.95; biz = 0.18; bdx = -1.12 + Math.sin(tt * 9) * 0.16; bdz = -0.22 + Math.cos(tt * 7) * 0.14;
      hx = 0.16; hy = -0.12 + Math.sin(tt * 1.5) * 0.14;
    } else if (sub === 1) {
      bix = -1.25; bdx = -1.25; hy = Math.sin(tt * 1.2) * 0.26; hx = -0.08; hz = 0.08;
    } else {
      bix = -1.08 + Math.sin(tt * 11) * 0.1; bdx = -1.08 + Math.cos(tt * 11) * 0.12;
      hx = 0.08; hy = Math.sin(tt * 2.1) * 0.2;
    }
  } else if (id === 'memoria') {
    verPapel = sub !== 2;
    if (sub === 0) {
      bix = -0.95; bdx = -1.2 + Math.sin(tt * 4.5) * 0.12; bdz = -0.16;
      hx = 0.15; hy = Math.sin(tt * 2.3) * 0.34;
    } else if (sub === 1) {
      bix = -1.15 + Math.sin(tt * 16) * 0.1; bdx = -1.15 + Math.cos(tt * 16) * 0.1;
      hy = Math.sin(tt * 1.8) * 0.16; hx = 0.08;
    } else {
      bix = -0.78; bdx = -1.26; bdz = -0.28;
      hx = 0.04; hy = -0.32 + Math.sin(tt * 1.5) * 0.12;
    }
  } else if (id === 'qa') {
    verPapel = sub !== 1;
    if (sub === 0) {
      bix = -0.65; bdx = -1.22; bdz = -0.2;
      hx = 0.18 + Math.sin(tt * 3.2) * 0.05; hy = Math.sin(tt * 1.4) * 0.24;
    } else if (sub === 1) {
      bix = -1.1 + Math.sin(tt * 15) * 0.1; bdx = -1.1 + Math.cos(tt * 15) * 0.1;
      hy = Math.sin(tt * 2.8) * 0.18; hx = 0.08;
    } else {
      bix = -0.88; bdx = -1.32 + Math.sin(tt * 4) * 0.1; bdz = -0.22;
      hx = 0.12; hy = Math.sin(tt * 1.9) * 0.3;
    }
  } else {
    // Gemini / desarrollo / redacción / planificación
    if (etapa === 'planificacion') {
      verPapel = sub === 2;
      bix = -0.4; bdx = -2.15; bdy = 0.3; bdz = -0.5;
      hx = -0.12; hy = Math.sin(tt * 0.9) * 0.32; hz = 0.1;
    } else if (etapa === 'redaccion') {
      verPapel = sub === 1;
      bix = -1.12 + Math.sin(tt * 17) * 0.12; bdx = -1.12 + Math.cos(tt * 17) * 0.12;
      hx = 0.1; hy = Math.sin(tt * 1.6) * 0.14;
    } else {
      bix = -1.14 + Math.sin(tt * 20) * 0.13; biz = 0.12;
      bdx = -1.14 + Math.sin(tt * 20 + 2.1) * 0.13; bdz = -0.12;
      hx = 0.09 + Math.sin(tt * 2.2) * 0.04; hy = Math.sin(tt * 1.5) * 0.18;
      if (sub === 2) { verPapel = true; bdx = -1.05; hy = 0.22; }
    }
  }
  if (sentado) {
    cy = Math.max(-0.045, cy);
    if (bix < -0.32 && bix > -1.06) bix = -1.06;
    if (bdx < -0.32 && bdx > -1.06) bdx = -1.06;
  }
  return { cy, cx, hx, hy, hz, bix, biy, biz, bdx, bdy, bdz, verPapel };
}

function construyeRuta(ini, zIni, fin, zFin) {
  const aS = zIni === 2.2 ? (ini.z < 1.2 ? -1.1 : 5.95) : pasillo(zIni);
  const aT = zFin === 2.2 ? (fin.z < 1.2 ? -1.1 : 5.95) : pasillo(zFin);
  const midX = (ini.x + fin.x) / 2;
  const L = CARRILES.reduce((b, l) => (Math.abs(l - midX) < Math.abs(b - midX) ? l : b), CARRILES[0]);
  const pts = [ini.clone(), new THREE.Vector3(ini.x, 0, aS)];
  if (Math.abs(aS - aT) > 0.05) pts.push(new THREE.Vector3(L, 0, aS), new THREE.Vector3(L, 0, aT));
  pts.push(new THREE.Vector3(fin.x, 0, aT), fin.clone());
  return pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 0.02);
}

class Agente {
  constructor(id, cfg, opts = {}) {
    this.id = id; this.cfg = cfg; this.esSubagente = Boolean(opts.esSubagente);
    this.estado = 'desconocido'; this.accion = 'inactivo'; this.origen = 'inferido';
    this.texto = ''; this.tarea = ''; this.archivo = ''; this.comando = ''; this.resultado = '';
    this.ultimo = 0; this.ultimaFirma = '';
    this.idleActual = null; this.idleAnterior = null;
    this.idleInicio = 0; this.idleFin = 0;
    this.idlePausaHasta = ((cfg.num || 3) * 0.37) % 1.9;
    this.idleHistorial = [];
    this.fig = minifig(cfg);
    if (this.esSubagente) {
      const dg = new THREE.Group(); dg.position.set(cfg.x, 0, cfg.z); scene.add(dg);
      const pc = crearMonitorCanvas();
      const luz = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.18), new THREE.MeshStandardMaterial({ color: '#94a3b8', emissive: '#94a3b8', emissiveIntensity: 0.4 }));
      const monton = new THREE.Group();
      this.desk = { g: dg, pantalla: pc, luz, monton };
      this.asiento = new THREE.Vector3(cfg.x, 0, cfg.z);
      this.rotBase = cfg.rotY ?? Math.PI;
      this.sentado = cfg.sentado !== false;
    } else {
      this.desk = puesto(cfg);
      this.asiento = new THREE.Vector3(cfg.x, 0, cfg.z + 0.88);
      this.rotBase = Math.PI;
      this.sentado = true;
    }
    this.destinoBase = this.asiento.clone();
    this.enReunion = false;
    this.sillaReunionIdx = -1;
    this.fig.root.position.copy(this.asiento); this.fig.root.rotation.y = this.rotBase;
    scene.add(this.fig.root);
    this.fig.root.userData.agenteId = id;
    this.desk.g.userData.agenteId = id;
    const e = etiqueta(cfg); this.lbl = e;
    const o1 = new CSS2DObject(e.div); o1.position.set(0, 1.9, 0); this.fig.root.add(o1);
    this.ruta = null; this.pendientes = []; this.fase = Math.random() * 10; this.lineas = []; this.tPantalla = 0;
    this.etapaActual = null;
    this.celebraT = 0; this.recibeT = 0; this.llamadaT = 0; this.llamadaMira = 0;
    this.dibujaPantalla(true);
  }
  aplica(ev, animar) {
    const firma = `${ev.t || ''}|${ev.estado}|${ev.accion}|${ev.texto || ''}|${ev.a || ''}`;
    if (firma === this.ultimaFirma) return;
    this.ultimaFirma = firma;

    if (this.ruta) {
      if (this.pendientes.length < 3) this.pendientes.push({ ev, animar });
      return;
    }
    const prevEstado = this.estado;
    this.estado = ev.estado || 'trabajando';
    this.accion = ev.accion || this.accion;
    this.origen = ev.origen || (ev.fuente === 'demo' ? 'demo' : 'real');
    this.texto = ev.texto || '';
    this.tarea = ev.tarea || '';
    this.archivo = ev.archivo || '';
    this.comando = ev.comando || '';
    this.resultado = ev.resultado || '';
    this.ultimo = Date.parse(ev.t) || Date.now();

    if (animar && this.estado === 'finalizado' && prevEstado !== 'finalizado') {
      this.celebraT = 2.4;
    }
    if (animar && this.estado === 'entregando' && ev.a) {
      this.entrega(mapearDestino(ev.a), true);
    } else if (animar && ev.a && this.estado === 'conversando' && !this.enReunion) {
      const destId = mapearDestino(ev.a);
      if (destId && agentes[destId] && destId !== this.id) this.entrega(destId, false);
    }
    if (this.estado === 'finalizado' && ev.a && animar && !this.ruta) {
      const destId = mapearDestino(ev.a);
      if (destId) this.entrega(destId, true);
    }
    this.refresca();
  }
  recibeDe(desdeId) {
    this.recibeT = 1.1;
    apilaPapel(this.desk.monton);
    if (!this.ruta && this.estado === 'desconocido') {
      this.estado = 'revisando'; this.accion = 'revision'; this.origen = 'inferido';
      this.texto = `Recibe entrega de ${agentes[desdeId]?.cfg.nombre || desdeId}`;
      this.ultimo = Date.now();
      this.refresca();
    }
  }
  irAReunion(slotIdx, animar, motivo = '') {
    const estabaEnReunion = this.enReunion;
    this.enReunion = true; this.sillaReunionIdx = slotIdx;
    const chair = SALA_SILLAS[slotIdx % SALA_SILLAS.length];
    const dest = slotIdx < SALA_SILLAS.length
      ? new THREE.Vector3(chair.x, 0, chair.z)
      : new THREE.Vector3(SALA_CENTRO.x + (slotIdx % 2 ? 2.1 : -2.1), 0, SALA_CENTRO.z + 1.8);
    const mira = Math.atan2(SALA_CENTRO.x - dest.x, SALA_CENTRO.z - dest.z);
    this.destinoBase = dest; this.rotBase = mira; this.sentado = slotIdx < SALA_SILLAS.length;
    this.estado = 'conversando'; this.accion = 'reunion_inicio';
    if (motivo) this.tarea = motivo;
    this.refresca();
    if (!animar) {
      this.ruta = null; this.fig.root.position.copy(dest); this.fig.root.rotation.y = mira;
      return;
    }
    const ini = this.fig.root.position.clone();
    if (ini.distanceTo(dest) < 0.25) return;
    const ida = construyeRuta(ini, estabaEnReunion ? 2.2 : this.cfg.z, dest, 2.2);
    this.ruta = { puntos: ida, i: 1, volverLuego: false, fase: 'ida', espera: 0, rotFinal: mira };
  }
  salirDeReunion(animar) {
    if (!this.enReunion) return;
    this.enReunion = false; this.sillaReunionIdx = -1;
    this.destinoBase = this.asiento.clone(); this.rotBase = Math.PI; this.sentado = true;
    if (this.estado === 'conversando') { this.estado = 'libre'; this.accion = 'reunion_fin'; this.refresca(); }
    if (!animar) {
      this.ruta = null; this.fig.root.position.copy(this.asiento); this.fig.root.rotation.y = Math.PI;
      return;
    }
    const ini = this.fig.root.position.clone();
    if (ini.distanceTo(this.asiento) < 0.25) return;
    const ida = construyeRuta(ini, 2.2, this.asiento, this.cfg.z);
    this.ruta = { puntos: ida, i: 1, volverLuego: false, fase: 'ida', espera: 0, rotFinal: Math.PI };
  }
  entrega(destino, llevaPapel = true) {
    // Animación breve de llamada/transferencia en el propio puesto (sin caminatas largas)
    const ini = this.fig.root.position.clone();
    let targetPos = null, dejar = null;
    if (destino === 'usuario') {
      targetPos = new THREE.Vector3(USUARIO.entrega.x, 0, USUARIO.entrega.z);
      dejar = () => { apilaPapel(bandeja); celebra(); };
    } else if (agentes[destino] && destino !== this.id) {
      targetPos = agentes[destino].desk.g.position.clone();
      dejar = () => agentes[destino].recibeDe(this.id);
    } else return;

    this.llamadaT = 1.65;
    this.llamadaMira = Math.atan2(targetPos.x - ini.x, targetPos.z - ini.z) - this.rotBase;
    dejar?.();

    if (llevaPapel) {
      const m = new THREE.Mesh(VUELO_GEO, mat('#ffffff'));
      const sello = new THREE.Mesh(VUELO_SELLO_GEO, mat(this.cfg.color));
      sello.position.y = 0.03; m.add(sello);
      m.position.set(ini.x, 1.35, ini.z);
      scene.add(m);
      vuelos.push({ m, a: new THREE.Vector3(ini.x, 1.35, ini.z), b: new THREE.Vector3(targetPos.x, 1.35, targetPos.z), t: 0, hasta: destino });
    }
  }
  refresca() {
    const c = COLOR_ESTADO[this.estado] || COLOR_ESTADO.desconocido;
    const lblEstado = this.ruta ? 'caminando' : (NOMBRE_ESTADO[this.estado] || this.estado);
    this.lbl.est.textContent = lblEstado;
    this.lbl.est.style.color = this.ruta ? COLOR_ESTADO.caminando : c;
    this.desk.luz.material.color.set(c); this.desk.luz.material.emissive.set(c);
    const txt = this.texto || (this.estado === 'pensando' ? '…' : '');
    const corto = MOVIL ? 42 : 76;
    const pref = this.estado === 'error' ? '⚠️ ' : this.estado === 'bloqueado' ? '⏸ ' : this.estado === 'pensando' ? '💭 ' : this.estado === 'investigando' ? '🔍 ' : this.estado === 'revisando' ? '🧐 ' : this.estado === 'conversando' ? '💬 ' : this.estado === 'finalizado' ? '✅ ' : this.estado === 'entregando' ? '📄 ' : '';
    this.lbl.bur.textContent = pref + (txt.length > corto ? txt.slice(0, corto - 1) + '…' : txt);
    this.lbl.bur.classList.toggle('oculta', this.estado === 'libre' || this.estado === 'desconocido' || this.estado === 'desconectado' || !txt);
    this.lbl.bur.classList.toggle('error', this.estado === 'error');
    this.lineas = []; this.dibujaPantalla(true);
    if (seleccionado === this.id) renderInspector();
  }
  update(dt, t) {
    const f = this.fig, tt = t + this.fase;
    // Regla honesta: no marcar como libre tras silencio; distinguir inactivo de desconocido (inferido)
    if (!DEMO && !this.ruta && !this.enReunion && ESTADOS_ACTIVOS.has(this.estado) && this.ultimo && Date.now() - this.ultimo > 150e3) {
      this.estado = 'desconocido'; this.origen = 'inferido'; this.accion = 'inactivo';
      this.texto = 'Sin señal reciente (sesión inactiva o pausada)';
      this.refresca();
    }
    if (this.ruta) { this.anda(dt, tt); return; }

    // Ahorro CPU/GPU: agentes desconocidos o desconectados sin animación activa se asientan quietos tras converger
    const k = 12;
    f.root.position.lerp(this.destinoBase, Math.min(1, dt * 8));
    let dy = this.rotBase - f.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    f.root.rotation.y += dy * Math.min(1, dt * 10);

    const [pi, pd] = f.piernas; const [bi, bd] = f.brazos;
    const legTarget = this.sentado ? -Math.PI / 2 : 0;
    pi.rotation.x = damp(pi.rotation.x, legTarget, k, dt);
    pd.rotation.x = damp(pd.rotation.x, legTarget, k, dt);

    let cy = this.sentado ? -0.04 : 0, cx = 0, hx = 0, hy = 0, hz = 0;
    let bix = -0.25, biy = 0, biz = 0.1, bdx = -0.25, bdy = 0, bdz = -0.1;
    let verPapel = false;

    // Prioridades estrictas Fase 5: 1) Error/Bloqueado -> 2) Trabajo real -> 3) Caminando/Conversando -> 4) Idle multi-animación -> 5) Desconocido/Desconectado
    if (this.estado !== 'libre' && this.estado !== 'finalizado') {
      this.idleActual = null;
    }

    if (this.estado === 'error') {
      const s = Math.sin(tt * 14);
      bix = -2.85; biz = 0.3 + s * 0.15; bdx = -2.85; bdz = -0.3 - s * 0.15;
      hy = Math.sin(tt * 9) * 0.45; cx = Math.sin(tt * 30) * 0.02;
      this.desk.luz.material.emissiveIntensity = 0.4 + (Math.sin(tt * 10) > 0 ? 1.4 : 0);
    } else if (this.estado === 'bloqueado') {
      bix = -0.75; biz = 0.42; bdx = -0.75; bdz = -0.42;
      hy = Math.sin(tt * 3) * 0.18; hx = 0.15;
    } else if (this.llamadaT > 0) {
      this.llamadaT -= dt;
      bix = -2.15; biz = 0.24; bdx = -0.75; bdz = -0.15;
      hy = Math.max(-0.55, Math.min(0.55, this.llamadaMira || 0.2)) + Math.sin(tt * 4.5) * 0.08;
      hx = -0.06;
    } else if (this.celebraT > 0) {
      this.celebraT -= dt;
      const s = Math.sin(tt * 13);
      bix = -2.75 + s * 0.25; biz = 0.28; bdx = -2.75 - s * 0.25; bdz = -0.28;
      cy = (this.sentado ? -0.02 : 0.04) + Math.abs(s) * 0.09;
      hx = -0.12;
    } else if (this.recibeT > 0) {
      this.recibeT -= dt;
      bdx = -1.35; bdz = -0.15; hx = Math.sin(tt * 8) * 0.12;
    } else if (this.estado === 'trabajando' || this.estado === 'investigando' || this.estado === 'revisando' || (this.estado === 'pensando' && this.etapaActual)) {
      const esp = poseEspecialidad(this.id, this.etapaActual || this.estado, tt, this.sentado);
      ({ cy, cx, hx, hy, hz, bix, biy, biz, bdx, bdy, bdz, verPapel } = esp);
    } else if (this.estado === 'pensando') {
      bix = -0.35; bdx = -2.3; bdy = 0.35; bdz = -0.55;
      hx = -0.14; hy = Math.sin(tt * 0.8) * 0.35; hz = 0.12;
    } else if (this.estado === 'conversando') {
      const g = Math.sin(tt * 4.2);
      bix = -0.85 + g * 0.35; biz = 0.22;
      bdx = -0.85 - g * 0.35; bdz = -0.22;
      hy = Math.sin(tt * 1.8) * 0.38; hx = -0.05 + Math.sin(tt * 3.1) * 0.06;
    } else if (this.estado === 'libre' || this.estado === 'finalizado') {
      if (!this.idleActual && t >= this.idlePausaHasta) {
        const base = IDLE_CATALOGO[this.id] || IDLE_CATALOGO._default;
        const pool = [...base, ...(IDLE_CATALOGO[this.id] ? IDLE_CATALOGO._especial_comun : [])]
          .filter((x) => x.id !== this.idleAnterior);
        const totalPeso = pool.reduce((s, x) => s + x.peso, 0);
        let r = Math.random() * totalPeso;
        let elegido = pool[0];
        for (const item of pool) { r -= item.peso; if (r <= 0) { elegido = item; break; } }
        this.idleActual = elegido.id;
        this.idleInicio = t;
        const dur = elegido.dur[0] + Math.random() * (elegido.dur[1] - elegido.dur[0]);
        this.idleFin = t + dur;
        this.idleHistorial.push(elegido.id);
        if (this.idleHistorial.length > 24) this.idleHistorial.shift();
      } else if (this.idleActual && t >= this.idleFin) {
        this.idleAnterior = this.idleActual;
        this.idleActual = null;
        this.idlePausaHasta = t + 0.55 + Math.random() * 1.15;
      }
      if (this.idleActual) {
        const pose = evaluaPoseIdle(this.idleActual, t - this.idleInicio, tt, this.sentado);
        ({ cy, cx, hx, hy, hz, bix, biy, biz, bdx, bdy, bdz, verPapel } = pose);
      } else {
        // Pausa natural respirando tranquilo
        bix = -0.25 + Math.sin(tt * 0.7) * 0.03;
        bdx = -0.25 - Math.sin(tt * 0.7) * 0.03;
        hy = Math.sin(tt * 0.45) * 0.12;
        hx = -0.02;
      }
    }
    f.papel.visible = verPapel;
    if (f.auricular) f.auricular.visible = this.llamadaT > 0;
    if (this.estado !== 'error') {
      this.desk.luz.material.emissiveIntensity = (this.estado === 'libre' || this.estado === 'desconocido' || this.estado === 'desconectado')
        ? 0.3 : 0.9 + Math.sin(tt * 4) * 0.22;
    }

    f.cuerpo.position.y = damp(f.cuerpo.position.y, cy, k, dt);
    f.cuerpo.position.x = damp(f.cuerpo.position.x, cx, 18, dt);
    const torsoX = this.estado === 'trabajando' ? 0.11 : this.estado === 'pensando' ? -0.08 : (hy * 0.0 + (hx > 0.12 ? 0.09 : hx < -0.12 ? -0.07 : 0));
    const torsoY = Math.max(-0.22, Math.min(0.22, hy * 0.36));
    f.cuerpo.rotation.x = damp(f.cuerpo.rotation.x, Math.max(-0.18, Math.min(0.2, torsoX)), k, dt);
    f.cuerpo.rotation.y = damp(f.cuerpo.rotation.y, torsoY, k, dt);
    if (this.desk?.silla) {
      this.desk.silla.rotation.y = damp(this.desk.silla.rotation.y, this.sentado ? torsoY * 0.65 : 0, k * 0.7, dt);
    }
    bi.rotation.x = damp(bi.rotation.x, bix, k + 3, dt); bi.rotation.y = damp(bi.rotation.y, biy, k, dt); bi.rotation.z = damp(bi.rotation.z, biz, k, dt);
    bd.rotation.x = damp(bd.rotation.x, bdx, k + 3, dt); bd.rotation.y = damp(bd.rotation.y, bdy, k, dt); bd.rotation.z = damp(bd.rotation.z, bdz, k, dt);
    f.cabeza.rotation.x = damp(f.cabeza.rotation.x, hx, k, dt); f.cabeza.rotation.y = damp(f.cabeza.rotation.y, hy, k, dt); f.cabeza.rotation.z = damp(f.cabeza.rotation.z, hz, k, dt);

    if (ESTADOS_ANIM_PANTALLA.has(this.estado)) {
      this.tPantalla += dt;
      if (this.tPantalla > (this.estado === 'trabajando' ? 0.16 : 0.45)) { this.tPantalla = 0; this.dibujaPantalla(); }
    }
  }
  anda(dt, tt) {
    const f = this.fig, r = this.ruta, k = 14;
    if (r.espera > 0) {
      r.espera -= dt;
      f.piernas.forEach((p) => (p.rotation.x = damp(p.rotation.x, 0, k, dt)));
      f.brazos[1].rotation.x = damp(f.brazos[1].rotation.x, -1.3, k, dt);
      f.brazos[0].rotation.x = damp(f.brazos[0].rotation.x, -0.2, k, dt);
      if (r.mira) {
        const d = r.mira.clone().sub(f.root.position);
        f.root.rotation.y = Math.atan2(d.x, d.z);
      }
      if (r.espera <= 0) { r.fase = 'vuelta'; r.puntos = r.vuelta; r.i = 1; }
      return;
    }
    const obj = r.puntos[r.i];
    const d = obj.clone().sub(f.root.position); d.y = 0; const dist = d.length(); const v = 4.6 * dt;
    if (dist <= v) {
      f.root.position.copy(obj); r.i++;
      if (r.i >= r.puntos.length) {
        if (r.fase === 'ida' && r.volverLuego) {
          r.espera = 0.75; r.dejar?.(); f.papel.visible = false;
        } else {
          if (r.rotFinal !== undefined) f.root.rotation.y = r.rotFinal;
          this.ruta = null; f.papel.visible = false;
          if (r.volverLuego && this.estado === 'entregando') {
            this.estado = this.enReunion ? 'conversando' : 'libre';
          }
          this.refresca();
          const sig = this.pendientes.shift();
          if (sig) this.aplica(sig.ev, sig.animar && (Date.now() - Date.parse(sig.ev.t) < 35e3 || DEMO));
        }
      }
    } else {
      f.root.position.addScaledVector(d.normalize(), v);
      const objetivo = Math.atan2(d.x, d.z); let delta = objetivo - f.root.rotation.y; delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      f.root.rotation.y += delta * Math.min(1, dt * 12);
    }
    const s = Math.sin(tt * 11);
    f.cuerpo.rotation.x = damp(f.cuerpo.rotation.x, 0.06, k, dt);
    f.cuerpo.rotation.y = damp(f.cuerpo.rotation.y, 0, k, dt);
    f.piernas[0].rotation.x = damp(f.piernas[0].rotation.x, s * 0.55, k, dt);
    f.piernas[1].rotation.x = damp(f.piernas[1].rotation.x, -s * 0.55, k, dt);
    f.brazos[1].rotation.x = damp(f.brazos[1].rotation.x, f.papel.visible ? -1.0 : s * 0.5, k, dt);
    f.brazos[0].rotation.x = damp(f.brazos[0].rotation.x, -s * 0.5, k, dt);
    f.cuerpo.position.y = damp(f.cuerpo.position.y, Math.abs(Math.cos(tt * 11)) * 0.05, k, dt);
  }
  dibujaPantalla() {
    const { c, t } = this.desk.pantalla; const g = c.getContext('2d'); const e = this.estado;
    if (e === 'libre' || e === 'desconocido' || e === 'desconectado' || e === 'entregando' || e === 'conversando') {
      g.fillStyle = '#16202e'; g.fillRect(0, 0, 256, 160);
      g.fillStyle = this.cfg.color;
      g.beginPath(); g.arc(128, 72, 18, 0, 7); g.fill();
      g.fillStyle = '#ffffffaa'; g.font = '800 15px Nunito'; g.textAlign = 'center';
      g.fillText(this.cfg.nombre, 128, 122);
      g.fillStyle = '#94a3b8'; g.font = '700 12px Nunito';
      g.fillText(NOMBRE_ESTADO[e] || e, 128, 144);
      g.textAlign = 'left';
    } else if (e === 'error' || e === 'bloqueado') {
      const rojo = e === 'error';
      g.fillStyle = rojo ? ((performance.now() / 300) % 2 < 1 ? '#dc2626' : '#7f1d1d') : '#9a3412';
      g.fillRect(0, 0, 256, 160);
      g.fillStyle = '#fff'; g.font = '800 32px "Baloo 2", sans-serif'; g.textAlign = 'center';
      g.fillText(rojo ? '⚠ ERROR' : '⏸ PAUSA', 128, 90); g.textAlign = 'left';
    } else if (e === 'finalizado') {
      g.fillStyle = '#064e3b'; g.fillRect(0, 0, 256, 160);
      g.fillStyle = '#6ee7b7'; g.font = '800 30px "Baloo 2", sans-serif'; g.textAlign = 'center';
      g.fillText('✔ COMPLETADO', 128, 86); g.textAlign = 'left';
    } else {
      g.fillStyle = e === 'pensando' || e === 'revisando' ? '#1c2a3d' : '#0f172a'; g.fillRect(0, 0, 256, 160);
      g.fillStyle = this.cfg.color; g.fillRect(0, 0, 256, 26);
      g.fillStyle = '#fff'; g.font = '800 14px ui-monospace, Consolas, monospace';
      const cab = this.archivo ? this.archivo.split('/').pop() : this.comando ? '$ ' + this.comando : (NOMBRE_ESTADO[e] || e);
      g.fillText((cab || '').slice(0, 25), 8, 18);
      if (e === 'trabajando' || e === 'investigando') {
        if (!this.lineas.length) this.lineas = Array.from({ length: 8 }, () => [Math.floor(Math.random() * 4) * 14, 24 + Math.random() * 90, e === 'investigando' ? '#fcd34d' : '#7dd3fc']);
        this.lineas.shift();
        const pal = e === 'investigando' ? ['#fcd34d', '#fdba74', '#fef08a'] : ['#7dd3fc', '#fde047', '#86efac', '#fda4af'];
        this.lineas.push([Math.floor(Math.random() * 4) * 14, 20 + Math.random() * 110, pal[Math.floor(Math.random() * pal.length)]]);
        this.lineas.forEach(([x, w, col], i) => { g.fillStyle = col; g.fillRect(8 + x, 38 + i * 14, w, 7); });
      } else {
        g.fillStyle = '#ffffffbb'; g.font = '700 14px Nunito'; const txt = this.texto || '';
        for (let i = 0; i < 4; i++) g.fillText(txt.slice(i * 26, i * 26 + 26), 8, 52 + i * 20);
      }
    }
    t.needsUpdate = true;
  }
}

const agentes = Object.fromEntries(Object.entries(AGENTES).map(([id, c]) => [id, new Agente(id, c)]));
dibujaPantallaPared(); document.fonts?.ready.then(dibujaPantallaPared);

// ---------------- Selección e Inspector de Personaje ----------------
let seleccionado = null;
const historialAgente = new Map();
const inspectorEl = document.getElementById('inspector');

function renderInspector() {
  if (!seleccionado || !agentes[seleccionado]) {
    inspectorEl.classList.remove('on'); inspectorEl.innerHTML = ''; return;
  }
  const ag = agentes[seleccionado];
  const color = ag.cfg.color;
  const estColor = COLOR_ESTADO[ag.estado] || '#64748b';
  const orig = ORIGEN_LABEL[ag.origen] || 'Observado';
  const origCls = ['real', 'inferido', 'demo'].includes(ag.origen) ? ag.origen : '';
  const hist = (historialAgente.get(seleccionado) || []).slice(0, 6);
  const cap = capacidadesReales?.[seleccionado];
  const ultTarea = (tareasReales?.tareas || []).filter((t) => t.specialist === seleccionado || t.agent_id === seleccionado).at(-1);
  inspectorEl.classList.add('on');
  inspectorEl.innerHTML =
    `<div class="cab"><div><span class="chip" style="background:${color}">${esc(ag.cfg.nombre)}</span> <span class="rol">${esc(ag.cfg.rol)}</span></div><button id="cerrarInsp" class="cerrar" type="button">✕ Ver todos</button></div>` +
    `<div>Estado: <b style="color:${estColor}">${esc(NOMBRE_ESTADO[ag.estado] || ag.estado)}</b><span class="orig ${origCls}">${esc(orig)}</span></div>` +
    (cap ? `<div class="rol">Capacidad: <b>${esc(cap.clasificacion)}</b> · ${esc((cap.herramientas || []).slice(0, 2).join(', '))}</div>` : '') +
    (ultTarea ? `<div class="tarea">📋 <b>${esc(ultTarea.status)}</b>: ${esc(ultTarea.description)}${ultTarea.evidence?.length ? `<br><small>Evidencia: ${esc(ultTarea.evidence.slice(0, 2).join(' · '))}</small>` : ''}</div>` : '') +
    (ag.tarea || ag.texto ? `<div class="tarea">${esc(ag.tarea || ag.texto)}</div>` : '') +
    (ag.archivo ? `<div class="f">📄 ${esc(ag.archivo)}</div>` : '') +
    (ag.comando ? `<div class="c">⌨️ ${esc(ag.comando)}</div>` : '') +
    (hist.length ? `<ul class="hist">${hist.map((h) => `<li><b>${h.hora}</b> · ${esc(h.accion)}${h.texto ? ': ' + esc(h.texto) : ''}${h.resultado ? ` (${esc(h.resultado)})` : ''}</li>`).join('')}</ul>` : '<div class="rol">Sin eventos recientes registrados.</div>');
  inspectorEl.querySelector('#cerrarInsp').onclick = () => seleccionaAgente(null);
}

function seleccionaAgente(id) {
  seleccionado = id && agentes[id] ? id : null;
  renderInspector();
  if (seleccionado) {
    const ag = agentes[seleccionado];
    const p = ag.enReunion ? ag.destinoBase : ag.desk.g.position;
    controls.target.copy(p).setY(1.1); controls.update();
    if (logEl.classList.contains('min')) { logEl.classList.remove('min'); document.getElementById('plegar').textContent = '—'; }
  }
}

const raycaster = new THREE.Raycaster(), puntero = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', (e) => (downXY = [e.clientX, e.clientY]));
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downXY || Math.hypot(e.clientX - downXY[0], e.clientY - downXY[1]) > 6) return;
  const r = renderer.domElement.getBoundingClientRect();
  puntero.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(puntero, camera);
  const hits = raycaster.intersectObjects([pantallaMalla, ...Object.values(agentes).flatMap((a) => [a.fig.root, a.desk.g])], true);
  if (hits.length) {
    let o = hits[0].object;
    if (o?.userData?.pantallaMetricas) { abreMetricas(true); return; }
    while (o && !o.userData.agenteId) o = o.parent;
    if (o?.userData?.agenteId) seleccionaAgente(o.userData.agenteId);
  }
});

// ---------------- Propietario («Tú») y Sobres Voladores ----------------
const usuario = minifig({ color: '#ffffff', pelo: '#6b4226', pantalon: '#2563eb' });
usuario.root.position.set(USUARIO.x, 0, USUARIO.z); usuario.root.rotation.y = -Math.PI * 0.65; scene.add(usuario.root);
{
  const d = document.createElement('div'); d.className = 'anc';
  d.innerHTML = '<div class="pila"><div class="lbl"><span class="n" style="background:#0f172a">Tú · entregas</span></div></div>';
  const o = new CSS2DObject(d); o.position.set(0, 1.9, 0); usuario.root.add(o);
}
scene.add(caja(1.15, 0.85, 0.8, '#ffd43b', 7.4, 0.425, 7.2));
const bandeja = new THREE.Group(); bandeja.position.set(7.4, 0.87, 7.2); scene.add(bandeja);
scene.add(caja(2.9, 0.04, 1.5, '#dc2626', 8.3, 0.025, 7.1, false));
let celebrando = 0;
function celebra() {
  celebrando = 2.4;
  const d = document.createElement('div'); d.className = 'pop'; d.textContent = '✅ ¡Entregado!';
  const o = new CSS2DObject(d); o.position.set(0, 2.75, 0); usuario.root.add(o); setTimeout(() => usuario.root.remove(o), 2300);
}

const vuelos = [];
function vuela(desde, hasta) {
  if (vuelos.length >= 12) return;
  const a = desde === 'usuario' ? new THREE.Vector3(USUARIO.x, 1.5, USUARIO.z) : agentes[desde]?.fig.root.position.clone().setY(1.5);
  const b = agentes[hasta]?.desk.g.position.clone().add(new THREE.Vector3(0.86, 1.05, 0.14));
  if (!a || !b) return;
  const m = new THREE.Mesh(VUELO_GEO, mat('#fef3c7'));
  const s = new THREE.Mesh(VUELO_SELLO_GEO, mat('#dc2626')); s.position.set(0, 0.025, 0); m.add(s);
  scene.add(m);
  vuelos.push({ m, a, b, t: 0, hasta });
}

// ---------------- Registro en vivo + Reuniones Verificables ----------------
const lista = document.getElementById('lista');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function actualizaBannerReunion() {
  const n = reunionActiva.participantes.size;
  if (!n) { reunionDiv.classList.add('oculta'); return; }
  const nombres = [...reunionActiva.participantes.keys()].map((id) => agentes[id]?.cfg.nombre || id).join(', ');
  reunionDiv.innerHTML = `<b>💬 Reunión (${esc(ORIGEN_LABEL[reunionActiva.origen] || reunionActiva.origen)})</b><div>${esc(reunionActiva.motivo || 'Coordinación')}</div><div style="color:#93c5fd;margin-top:2px">${esc(nombres)}</div>`;
  reunionDiv.classList.remove('oculta');
}

function gestionaReunion(ev, targetId, animar) {
  if (ev.accion === 'reunion_inicio' || (ev.reunion && ev.accion !== 'reunion_fin')) {
    const listaPart = Array.isArray(ev.reunion?.participantes) && ev.reunion.participantes.length
      ? ev.reunion.participantes.map((p) => mapearDestino(p)).filter((p) => p && agentes[p])
      : [targetId];
    reunionActiva.motivo = ev.reunion?.motivo || ev.texto || 'Coordinación de equipo';
    reunionActiva.origen = ev.origen || (ev.fuente === 'demo' ? 'demo' : 'real');
    reunionActiva.desde = Date.parse(ev.t) || Date.now();
    let idx = reunionActiva.participantes.size;
    for (const id of listaPart) {
      if (!reunionActiva.participantes.has(id)) {
        reunionActiva.participantes.set(id, idx);
        agentes[id].irAReunion(idx, animar, reunionActiva.motivo);
        idx++;
      }
    }
    actualizaBannerReunion();
    return true;
  }
  if (ev.accion === 'reunion_fin') {
    const listaPart = Array.isArray(ev.reunion?.participantes) && ev.reunion.participantes.length
      ? ev.reunion.participantes.map((p) => mapearDestino(p)).filter(Boolean)
      : [...reunionActiva.participantes.keys()];
    for (const id of listaPart) {
      reunionActiva.participantes.delete(id);
      agentes[id]?.salirDeReunion(animar);
    }
    actualizaBannerReunion();
    return true;
  }
  return false;
}

function anota(ev, agId) {
  lista.querySelector('.vacio')?.remove();
  const ag = agentes[agId];
  const nombre = ev.nombre || ag?.cfg?.nombre || ev.agente;
  const color = ag?.cfg?.color || '#64748b';
  const destId = ev.a ? mapearDestino(ev.a) : null;
  const destNom = destId === 'usuario' ? 'Tú' : (agentes[destId]?.cfg.nombre || ev.aNombre || ev.a);
  const hora = new Date(ev.t || Date.now()).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const origen = ev.origen || (ev.fuente === 'demo' ? 'demo' : 'declarado');
  const origCls = ['real', 'declarado', 'inferido', 'externo_no_observado', 'demo'].includes(origen) ? origen : '';
  const accNom = ACCION_LABEL[ev.accion] || NOMBRE_ESTADO[ev.estado] || ev.estado;
  const avisoNoVerif = (ESPECIALISTAS_IDS.has(ev.agente) && ev.especialista_verificado === false && origen !== 'demo')
    ? ' (declarado sin subagente real)' : '';

  const hArr = historialAgente.get(agId) || [];
  hArr.unshift({ hora, accion: accNom, texto: (ev.texto || ev.tarea || '') + avisoNoVerif, resultado: ev.resultado || '' });
  if (hArr.length > 12) hArr.pop();
  historialAgente.set(agId, hArr);

  const li = document.createElement('li');
  li.onclick = () => { if (agentes[agId]) seleccionaAgente(agId); };
  li.innerHTML = `<span class="h">${hora}</span><span class="q"><span class="chip" style="background:${color}">${esc(nombre)}</span> <span style="color:${COLOR_ESTADO[ev.estado] || '#555'}">${esc(accNom)}</span>${ev.a ? ` → <b>${esc(destNom)}</b>` : ''}<span class="orig ${origCls}">${esc(ORIGEN_LABEL[origen] || origen)}</span></span>` +
    (avisoNoVerif ? `<span class="meta">⚠️ Declarado manualmente sin subagente verificado (atribuido a modelo real)</span>` : '') +
    (ev.tarea ? `<span class="meta">🎯 ${esc(ev.tarea)}</span>` : '') +
    (ev.texto ? `<span class="tx">${esc(ev.texto)}</span>` : '') +
    (ev.archivo ? `<span class="f">📄 ${esc(ev.archivo)}</span>` : '') +
    (ev.comando ? `<span class="c">⌨️ ${esc(ev.comando)}</span>` : '') +
    (ev.resultado ? `<span class="meta">↳ Resultado: <b>${esc(ev.resultado)}</b></span>` : '') +
    (ev.plan ? `<span class="tx" style="color:#64748b">📌 plan: ${ev.plan.length} pasos${ev.paso ? ` · paso ${Math.min(ev.paso, ev.plan.length)}` : ''}</span>` : '');
  lista.prepend(li);
  while (lista.children.length > 200) lista.lastChild.remove();
}

const logEl = document.getElementById('log');
document.getElementById('plegar').onclick = () => {
  logEl.classList.toggle('min');
  document.getElementById('plegar').textContent = logEl.classList.contains('min') ? '+' : '—';
};

// ---------------- Subagentes dinámicos observados (no colapsan en especialistas) ----------------
const SUBAGENT_SLOTS = [
  ...SALA_SILLAS.map((s) => ({ x: s.x, z: s.z, rotY: s.rotY, sentado: true })),
  { x: 6.4, z: 6.4, rotY: Math.PI, sentado: false },
  { x: 10.6, z: 6.4, rotY: Math.PI, sentado: false },
];
let subSlotPtr = 0;
function asegurarSubagente(ev) {
  const id = String(ev?.agente || '').toLowerCase().trim();
  if (!id.startsWith('gemini/') && !id.startsWith('claude/')) return null;
  if (agentes[id]) {
    if (ev.nombre && agentes[id].cfg.nombre !== ev.nombre) {
      agentes[id].cfg.nombre = ev.nombre;
      const nEl = agentes[id].lbl.div.querySelector('.n');
      if (nEl) nEl.textContent = ev.nombre;
    }
    return agentes[id];
  }
  const slot = SUBAGENT_SLOTS[subSlotPtr % SUBAGENT_SLOTS.length];
  subSlotPtr++;
  const esClaude = id.startsWith('claude/');
  const cfg = {
    nombre: ev.nombre || id.replace(/^(gemini|claude)\//, ''),
    rol: `Subagente real (${ev.tipo_subagente || (esClaude ? 'claude' : 'gemini')})`,
    color: esClaude ? '#ea580c' : '#0891b2',
    visor: esClaude ? undefined : '#38bdf8',
    pelo: esClaude ? '#3b2a20' : undefined,
    x: slot.x, z: slot.z, rotY: slot.rotY, sentado: slot.sentado,
  };
  agentes[id] = new Agente(id, cfg, { esSubagente: true });
  return agentes[id];
}

// ---------------- Monitor visual del trabajo de Gemini (Fase 13) ----------------
const geminiMonitor = {
  tarea: 'Sin tarea activa',
  etapa: 'desconocida',
  etapaLabel: 'Sin señal',
  representante: 'gemini',
  evidenciaTipo: 'desconocida',
  motivo: 'Sin actividad observada todavía',
  herramienta: '',
  archivo: '',
  resultado: '',
  etapaInicioAt: Date.now(),
  ultimoError: false,
  llamadasVisuales: 0,
  historial: [], // { etapa, etiqueta, estado: 'completada'|'trabajando'|'pendiente'|'error'|'desconocida', evidenciaTipo }
};

function renderPanelGemini() {
  const elT = document.getElementById('gemTarea');
  const elE = document.getElementById('gemEtapa');
  const elR = document.getElementById('gemRep');
  const elH = document.getElementById('gemTool');
  const elF = document.getElementById('gemFile');
  const elTi = document.getElementById('gemTiempo');
  const elRes = document.getElementById('gemRes');
  const elHist = document.getElementById('geminiHist');
  if (!elT) return;

  elT.textContent = geminiMonitor.tarea || 'Sin tarea activa';
  const badgeCls = ['observada', 'inferida', 'pendiente', 'finalizada', 'desconocida'].includes(geminiMonitor.evidenciaTipo)
    ? geminiMonitor.evidenciaTipo
    : 'desconocida';
  elE.innerHTML = `${esc(geminiMonitor.etapaLabel)} <span class="gemBadge ${badgeCls}">${esc(geminiMonitor.evidenciaTipo)}</span>`;
  const repNom = agentes[geminiMonitor.representante]?.cfg?.nombre || geminiMonitor.representante || '—';
  elR.textContent = `${repNom} (visual)`;
  elH.textContent = geminiMonitor.herramienta || '—';
  elF.textContent = geminiMonitor.archivo || '—';
  const seg = Math.max(0, Math.round((Date.now() - (geminiMonitor.etapaInicioAt || Date.now())) / 1000));
  elTi.textContent = `${seg} s`;
  elRes.textContent = geminiMonitor.resultado || '—';

  if (elHist) {
    if (!geminiMonitor.historial.length) {
      elHist.innerHTML = '<li><span>Esperando eventos de Gemini…</span><span class="gemBadge desconocida">desconocida</span></li>';
    } else {
      elHist.innerHTML = geminiMonitor.historial.slice(-7).map((h, i) => {
        const cls = h.estado === 'completada' ? 'finalizada' : h.estado === 'trabajando' ? 'observada' : h.estado === 'pendiente' ? 'pendiente' : 'desconocida';
        return `<li><span>${i + 1}. ${esc(h.etiqueta)}</span><span class="gemBadge ${cls}">${esc(h.estado)}</span></li>`;
      }).join('');
    }
  }
}

setInterval(() => {
  const elTi = document.getElementById('gemTiempo');
  if (elTi && geminiMonitor.etapa !== 'desconocida') {
    const seg = Math.max(0, Math.round((Date.now() - geminiMonitor.etapaInicioAt) / 1000));
    elTi.textContent = `${seg} s`;
  }
}, 1000);

document.getElementById('btnGeminiPanel')?.addEventListener('click', () => {
  document.getElementById('geminiPanel')?.classList.toggle('oculta');
});
document.getElementById('plegarGemini')?.addEventListener('click', () => {
  const p = document.getElementById('geminiPanel');
  const b = document.getElementById('plegarGemini');
  if (!p || !b) return;
  p.classList.toggle('min');
  b.textContent = p.classList.contains('min') ? '+' : '—';
});

function activaLlamadaVisual(desdeId, haciaId) {
  const a = agentes[desdeId], b = agentes[haciaId];
  if (!a || !b || desdeId === haciaId) return;
  const pA = a.desk?.g?.position || a.fig.root.position;
  const pB = b.desk?.g?.position || b.fig.root.position;
  a.llamadaT = 1.35;
  a.llamadaMira = Math.atan2(pB.x - pA.x, pB.z - pA.z) - a.rotBase;
  b.llamadaT = 1.35;
  b.llamadaMira = Math.atan2(pA.x - pB.x, pA.z - pB.z) - b.rotBase;
  geminiMonitor.llamadasVisuales++;
}

function actualizaMonitorGemini(ev, animar) {
  if (!ev || (ev.agente !== 'gemini' && !String(ev.agente || '').startsWith('gemini/'))) return;
  const cls = clasificaActividadGemini(ev, { ultimoError: geminiMonitor.ultimoError });
  const prevRep = geminiMonitor.representante;
  const prevEtapa = geminiMonitor.etapa;

  if (ev.tarea) geminiMonitor.tarea = ev.tarea;
  else if (ev.accion === 'planificacion' && ev.desde === 'usuario' && ev.texto) {
    geminiMonitor.tarea = ev.texto.replace(/^Entra petici[oó]n:\s*/i, '');
  }

  geminiMonitor.ultimoError = ev.estado === 'error' || ev.resultado === 'error';
  if (ev.herramienta) geminiMonitor.herramienta = ev.herramienta;
  if (ev.archivo) geminiMonitor.archivo = ev.archivo;
  if (ev.resultado) geminiMonitor.resultado = ev.resultado;

  // Historial honesto: solo marca completada una etapa previa cuando hay evidencia de cierre o avance real
  if (cls.etapa !== prevEtapa && prevEtapa !== 'desconocida') {
    const ult = geminiMonitor.historial[geminiMonitor.historial.length - 1];
    if (ult && ult.estado === 'trabajando') {
      ult.estado = geminiMonitor.ultimoError ? 'error' : (cls.evidenciaTipo === 'observada' || ev.resultado ? 'completada' : 'finalizada');
    }
  }
  if (cls.etapa !== 'desconocida' && (cls.etapa !== prevEtapa || !geminiMonitor.historial.length)) {
    const estadoHist = cls.etapa === 'entrega' && ev.estado === 'finalizado' ? 'completada' : (ev.estado === 'error' ? 'error' : 'trabajando');
    geminiMonitor.historial.push({ etapa: cls.etapa, etiqueta: cls.etiqueta, estado: estadoHist, evidenciaTipo: cls.evidenciaTipo });
    if (geminiMonitor.historial.length > 14) geminiMonitor.historial.shift();
    geminiMonitor.etapaInicioAt = Date.parse(ev.t) || Date.now();
  } else if (cls.etapa === 'entrega' && ev.estado === 'finalizado') {
    const ult = geminiMonitor.historial[geminiMonitor.historial.length - 1];
    if (ult) ult.estado = 'completada';
  }

  // Sincronizar pasos pendientes si viene un plan explícito de Gemini
  if (Array.isArray(ev.plan) && ev.plan.length) {
    const pasoActual = Number(ev.paso) || 1;
    geminiMonitor.historial = ev.plan.map((txt, idx) => ({
      etapa: `paso-${idx + 1}`,
      etiqueta: txt,
      estado: idx + 1 < pasoActual ? 'completada' : idx + 1 === pasoActual ? 'trabajando' : 'pendiente',
      evidenciaTipo: idx + 1 <= pasoActual ? cls.evidenciaTipo : 'pendiente',
    }));
  }

  geminiMonitor.etapa = cls.etapa;
  geminiMonitor.etapaLabel = cls.etiqueta;
  geminiMonitor.representante = cls.representante;
  geminiMonitor.evidenciaTipo = cls.evidenciaTipo;
  geminiMonitor.motivo = cls.motivo;

  // Transición visual entre puestos (SIN caminatas; llamada telefónica breve en escritorio)
  const repAg = agentes[cls.representante];
  const prevAg = agentes[prevRep];
  if (prevRep && prevRep !== cls.representante && prevAg) {
    if (prevRep !== 'gemini') {
      prevAg.estado = 'libre';
      prevAg.etapaActual = null;
      prevAg.texto = '';
      prevAg.refresca();
    }
    if (animar && repAg && cls.etapa !== 'desconocida') {
      activaLlamadaVisual(prevRep, cls.representante);
    }
  }
  if (repAg && cls.representante !== 'gemini') {
    repAg.etapaActual = cls.etapa;
    repAg.aplica({
      ...ev,
      agente: cls.representante,
      estado: cls.estadoVisual,
      origen: cls.evidenciaTipo === 'observada' ? 'real' : 'inferido',
      texto: `[Gemini · ${cls.etiqueta}] ${ev.texto || cls.motivo}`,
      a: undefined,
    }, animar);
    repAg.ruta = null; // Nunca caminar entre puestos
  } else if (agentes.gemini) {
    agentes.gemini.etapaActual = cls.etapa;
  }

  renderPanelGemini();
}

// ---------------- Procesar eventos observados ----------------
const eventosVistos = new Set();
function procesa(ev, animar = true) {
  if (!ev || !ev.agente) return;
  const firmaGlobal = ev.evento_id
    ? `id:${ev.evento_id}`
    : `${ev.t || ''}|${ev.fuente || ''}|${ev.agente}|${ev.estado}|${ev.accion || ''}|${ev.texto || ''}|${ev.a || ''}`;
  if (eventosVistos.has(firmaGlobal)) return;
  eventosVistos.add(firmaGlobal);
  if (eventosVistos.size > 600) eventosVistos.delete(eventosVistos.values().next().value);

  asegurarSubagente(ev);
  const targetId = mapearDestino(ev.agente, ev);
  anota(ev, targetId || ev.agente);
  if (Array.isArray(ev.plan)) {
    if (JSON.stringify(ev.plan) !== JSON.stringify(plan.pasos)) plan.de = targetId || ev.agente;
    plan.pasos = ev.plan; plan.paso = Number(ev.paso) || 0; plan.hechos = Array.isArray(ev.hechos) ? ev.hechos : null; plan.t = ev.t;
  } else if (ev.paso !== undefined && plan.pasos.length) {
    plan.paso = Number(ev.paso); plan.hechos = Array.isArray(ev.hechos) ? ev.hechos : null; plan.t = ev.t;
  }
  const esReunion = targetId ? gestionaReunion(ev, targetId, animar) : false;
  const desdeId = ev.desde ? (ev.desde === 'usuario' ? 'usuario' : mapearDestino(ev.desde)) : null;
  if (animar && desdeId && targetId && agentes[targetId]) vuela(desdeId, targetId);
  if (!esReunion && targetId && agentes[targetId]) {
    if (reunionActiva.participantes.has(targetId) && ev.estado !== 'conversando') {
      reunionActiva.participantes.delete(targetId);
      agentes[targetId]?.salirDeReunion(animar);
      actualizaBannerReunion();
    }
    agentes[targetId]?.aplica(ev, animar);
  }
  actualizaMonitorGemini(ev, animar);
  dibujaPantallaPared();
}

const conn = document.getElementById('conn'), connTxt = document.getElementById('connTxt'), modo = document.getElementById('modo');
let desde = -1, primera = true, ultimoEventoAt = 0, reintentosConn = 0;
async function sondea() {
  let proxMs = 1500;
  try {
    const r = await fetch(`/api/oficina?desde=${desde}&_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const d = await r.json();
    if (d.desde < desde) primera = true;
    const ahora = Date.now();
    for (const ev of d.eventos) {
      const tMs = Date.parse(ev.t);
      if (Number.isFinite(tMs) && tMs > ultimoEventoAt) ultimoEventoAt = tMs;
      const edad = ahora - tMs;
      procesa(ev, !primera && edad < 30e3 ? true : edad < 8e3);
    }
    desde = d.total; primera = false; reintentosConn = 0;
    const horaTxt = ultimoEventoAt ? new Date(ultimoEventoAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'sin eventos';
    conn.className = 'vivo';
    connTxt.textContent = `En vivo · ${horaTxt}`;
  } catch (err) {
    reintentosConn++;
    proxMs = Math.min(5000, 1500 + reintentosConn * 700);
    conn.className = 'mal';
    connTxt.textContent = reintentosConn > 1 ? `Reconectando (#${reintentosConn})…` : 'Sin conexión (reintentando…)';
    if (lista.querySelector('.vacio')) lista.querySelector('.vacio').innerHTML = `Error de conexión (${esc(err?.message || 'servidor apagado')}). Abre <b>npm run dev</b> o prueba <a href="?demo=1">modo demo</a>.`;
  }
  setTimeout(sondea, proxMs);
}

// Demo integral Fase 2 (claramente etiquetada como Demo cuando ?demo=1 está activo)
const PLAN_DEMO = [
  '1. Analista recopila datos y entrega al Coordinador',
  '2. Reunión breve de Estratega, Guionista y Coordinador',
  '3. Dirección Creativa y Audiovisual producen piezas',
  '4. QA revisa y aprueba antes de entrega final',
  '5. Claude Code y Gemini ejecutan cambios en código',
];
const P = (paso) => ({ plan: PLAN_DEMO, paso });
const GUION = [
  [0,    { agente: 'claude', estado: 'pensando', accion: 'planificacion', texto: 'Recibe petición del usuario', desde: 'usuario', ...P(1) }],
  [1.8,  { agente: 'analista', estado: 'investigando', accion: 'investigacion', texto: 'Analiza métricas IG/TikTok/YT en ciclo.mjs', archivo: 'tools/ciclo.mjs', ...P(1) }],
  [4.8,  { agente: 'analista', estado: 'entregando', accion: 'entrega', a: 'coordinador', texto: 'Entrega informe de métricas al Coordinador', resultado: 'informe listo', ...P(1) }],
  [8.0,  { agente: 'coordinador', estado: 'conversando', accion: 'reunion_inicio', reunion: { participantes: ['coordinador', 'estratega', 'guionista'], motivo: 'Definir enfoque y guion del episodio' }, texto: 'Convoca reunión editorial en sala LEGO', ...P(2) }],
  [14.5, { agente: 'coordinador', estado: 'libre', accion: 'reunion_fin', reunion: { participantes: ['coordinador', 'estratega', 'guionista'] }, texto: 'Cierra reunión: cada especialista a su puesto', ...P(3) }],
  [16.0, { agente: 'guionista', estado: 'entregando', accion: 'entrega', a: 'director-av', texto: 'Entrega guion aprobado a Dir. Audiovisual', archivo: 'reels/guiones.md', ...P(3) }],
  [17.2, { agente: 'director-creativo', estado: 'trabajando', accion: 'escritura', texto: 'Ajusta identidad visual LEGO y rótulos', archivo: 'web/js/oficina.js', ...P(3) }],
  [19.0, { agente: 'director-av', estado: 'entregando', accion: 'entrega', a: 'qa', texto: 'Envía render 9:16 a QA Calidad', ...P(4) }],
  [22.0, { agente: 'qa', estado: 'revisando', accion: 'revision', texto: 'Revisa FPS, encuadre y 0 errores', ...P(4) }],
  [24.5, { agente: 'community-manager', estado: 'pensando', accion: 'lectura', texto: 'Prepara respuestas (sin publicar en redes)', ...P(4) }],
  [26.0, { agente: 'qa', estado: 'finalizado', accion: 'finalizacion', a: 'coordinador', resultado: 'aprobado', texto: 'QA aprueba piezas y entrega al Coordinador', ...P(4) }],
  [29.5, { agente: 'gemini', estado: 'trabajando', accion: 'escritura', texto: 'Actualiza animación y registro real', archivo: 'web/js/oficina.js', ...P(5) }],
  [32.0, { agente: 'coordinador', estado: 'finalizado', accion: 'finalizacion', a: 'usuario', resultado: 'completado', texto: 'Entrega episodio validado al usuario', ...P(6) }],
];
let demoTimers = [];
function demo() {
  conn.className = 'demo'; connTxt.textContent = 'Demo'; modo.textContent = '● Ver en vivo'; modo.href = location.pathname;
  const ciclo = () => {
    demoTimers.forEach(clearTimeout); demoTimers = [];
    plan.pasos = []; plan.de = ''; dibujaPantallaPared();
    for (const [s, ev] of GUION) {
      demoTimers.push(setTimeout(() => procesa({ t: new Date().toISOString(), fuente: 'demo', origen: 'demo', ...ev }), s * 1000));
    }
    demoTimers.push(setTimeout(ciclo, 39e3));
  };
  ciclo();
}
const metricasBack = document.getElementById('metricasBack');
const metricasGrid = document.getElementById('metricasGrid');
const metricasApiBanner = document.getElementById('metricasApiBanner');
const metricasSub = document.getElementById('metricasSub');

function renderMetricasModal() {
  if (!metricasGrid) return;
  if (!metricasReales?.redes) {
    metricasSub.textContent = metricasError ? 'Error cargando /api/metricas' : 'Sin datos disponibles';
    metricasApiBanner.textContent = metricasError
      ? `No se pudo conectar con /api/metricas (${metricasError}). Abre la oficina desde tools/serve.mjs.`
      : 'Esperando lectura real de métricas locales…';
    metricasGrid.innerHTML = '';
    return;
  }
  const apis = metricasReales.apisConfiguradas || {};
  metricasSub.textContent = `Actualizado: ${fmtHoraCorta(metricasReales.generadoEn)} · Fuente: ${metricasReales.fuenteGeneral}`;
  metricasApiBanner.innerHTML =
    `<b>Estado de APIs en vivo:</b> Instagram <b>${apis.instagram ? 'Conectada' : 'No configurada'}</b> · TikTok <b>${apis.tiktok ? 'Conectada' : 'No configurada'}</b> · YouTube <b>${apis.youtube ? 'Conectada' : 'No configurada'}</b>. ` +
    `Los campos sin API muestran «No disponible» (nunca cifras inventadas).` +
    (DEMO ? ' <i>(Modo Demo activo: sólo las animaciones del estudio son simuladas; estas cifras son reales del proyecto.)</i>' : '');

  const CAMPOS = [
    ['seguidores', '👥 Seguidores'],
    ['variacion', '📈 Variación'],
    ['comentarios', '💬 Comentarios'],
    ['interacciones', '❤️ Interacciones'],
    ['publicaciones', '🎬 Publicaciones'],
    ['rendimiento', '📊 Rendimiento'],
    ['tendencias', '🔥 Tendencias'],
    ['objetivos', '🎯 Objetivos'],
  ];
  metricasGrid.innerHTML = ['ig', 'tiktok', 'youtube'].map((k) => {
    const r = metricasReales.redes[k];
    if (!r) return '';
    const rows = CAMPOS.map(([ck, label]) => {
      const m = r[ck] || { valor: 'No disponible', detalle: '', fuente: '-', fecha: null, estado: 'no_disponible' };
      const stTxt = EST_ESTADO_MET[m.estado] || m.estado;
      return `<div class="mRow">` +
        `<div class="mTop"><span>${label}</span><span class="mbadge ${esc(m.estado)}">${esc(stTxt)}</span></div>` +
        `<div class="mVal">${esc(m.valor)}</div>` +
        (m.detalle ? `<div class="mDet">${esc(m.detalle)}</div>` : '') +
        `<div class="mMeta">Fuente: ${esc(m.fuente)} · Fecha: ${esc(fmtHoraCorta(m.fecha))}</div>` +
        `</div>`;
    }).join('');
    return `<section class="mCol"><h3><span>${esc(r.icono)} ${esc(r.titulo)}</span><span class="mbadge ${r.apiConfigurada ? 'verificado_api' : 'no_disponible'}">${r.apiConfigurada ? 'API ON' : 'Solo local'}</span></h3>${rows}</section>`;
  }).join('');
}

function abreMetricas(abierto) {
  if (!metricasBack) return;
  metricasBack.classList.toggle('on', abierto);
  metricasBack.setAttribute('aria-hidden', String(!abierto));
  if (abierto) renderMetricasModal();
}

document.getElementById('btnMetricas')?.addEventListener('click', () => abreMetricas(true));
document.getElementById('cerrarMetricas')?.addEventListener('click', () => abreMetricas(false));
metricasBack?.addEventListener('click', (e) => { if (e.target === metricasBack) abreMetricas(false); });

async function cargarMetricas() {
  try {
    const r = await fetch('/api/metricas', { cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    metricasReales = await r.json();
    metricasError = '';
  } catch (err) {
    metricasError = err?.message || 'sin conexión';
  }
  dibujaPantallaPared();
  if (metricasBack?.classList.contains('on')) renderMetricasModal();
}

const auditBack = document.getElementById('auditBack');
const auditBody = document.getElementById('auditBody');
const auditSub = document.getElementById('auditSub');

async function cargarAuditoriaModal() {
  if (!auditBody) return;
  auditSub.textContent = 'Consultando /api/autorizaciones y /api/recursos…';
  try {
    const [rAut, rRec] = await Promise.all([
      fetch('/api/autorizaciones', { cache: 'no-store' }),
      fetch('/api/recursos', { cache: 'no-store' }),
    ]);
    if (!rAut.ok || !rRec.ok) throw new Error('Error consultando endpoints locales');
    const aut = await rAut.json();
    const rec = await rRec.json();
    auditSub.textContent = `Política: local=${aut.politica?.local} · delegación=${aut.politica?.delegacion_modelo} · pago=${aut.politica?.servicio_pago}`;

    const pendHtml = (aut.pendientes || []).length
      ? aut.pendientes.map((p) => `<div class="aCard pendiente"><div><b>${esc(p.solicitante)} → ${esc(p.modelo_o_servicio)}</b> <span class="aBadge pendiente">${esc(p.estado)}</span></div><div>🎯 ${esc(p.tarea)}</div><div>⚠️ ${esc(p.motivo)}</div><div class="mMeta">Coste: ${esc(p.coste_estimado)} · Presupuesto: ${esc(p.presupuesto_afectado)} · ${esc(fmtHoraCorta(p.t))}</div></div>`).join('')
      : '<div class="aCard">Sin bloqueos pendientes recientes. Delegaciones entre modelos y APIs de pago permanecen bloqueadas por defecto.</div>';

    const recHtml = (rec.recursos || []).map((r) => `<div class="aCard"><div><b>${esc(r.nombre)}</b> <span class="aBadge ${esc(r.estado_integracion)}">${esc(r.estado_integracion)}</span> <span class="aBadge ${esc(r.disponibilidad)}">${esc(r.disponibilidad)}</span></div><div>${esc(r.funciones)}</div><div class="mMeta">Propietario: ${esc(r.propietario)} · Coste: ${esc(r.coste)} · Evidencia: ${esc(r.evidencia)}</div></div>`).join('');

    auditBody.innerHTML = `<section class="aSec"><h3>⛔ Control Central de Permisos y Bloqueos (${(aut.pendientes || []).length} pendientes · ${(aut.autorizacionesActivas || []).length} concesiones activas)</h3><div class="aGrid">${pendHtml}</div></section>` +
      `<section class="aSec"><h3>🧩 Inventario Real de Recursos (${rec.resumen?.total || 0} verificados)</h3><div class="aGrid">${recHtml}</div></section>`;
  } catch (err) {
    auditSub.textContent = 'No disponible sin servidor local (tools/serve.mjs)';
    auditBody.innerHTML = `<div class="aCard">${esc(err?.message || 'Error')}</div>`;
  }
}

function abreAuditoria(abierto) {
  if (!auditBack) return;
  auditBack.classList.toggle('on', abierto);
  auditBack.setAttribute('aria-hidden', String(!abierto));
  if (abierto) cargarAuditoriaModal();
}

document.getElementById('btnAudit')?.addEventListener('click', () => abreAuditoria(true));
document.getElementById('cerrarAudit')?.addEventListener('click', () => abreAuditoria(false));
auditBack?.addEventListener('click', (e) => { if (e.target === auditBack) abreAuditoria(false); });

// ---------------- Decoración Permanente Moderna y Temas Contextuales (Fase 5) ----------------
{
  // Lámparas de diseño moderno LEGO en esquinas izquierda y área creativa
  for (const lz of [-8.0, 7.6]) {
    const lx = -15.6;
    scene.add(cil(0.28, 0.08, '#1e293b', lx, 0.04, lz, 14));
    scene.add(cil(0.045, 2.05, '#475569', lx, 1.05, lz, 10));
    scene.add(cil(0.32, 0.28, '#fde68a', lx, 2.15, lz, 14));
    scene.add(cil(0.18, 0.08, new THREE.MeshBasicMaterial({ color: '#fef08a' }), lx, 1.98, lz, 12, false));
  }
}

const decoracionContextual = new THREE.Group();
scene.add(decoracionContextual);
let temaActivoId = 'isla-gambito';
let proyectoInfoReal = null;
const decorTexturas = [];
const decorAnimables = [];

const TEMAS_PROYECTO = {
  'isla-gambito': {
    id: 'isla-gambito',
    nombre: 'Isla Gambito (@gambitoia)',
    acento: '#0ea5e9',
    secundario: '#22c55e',
    construir(g, info) {
      // 1. Maqueta 3D del Archipiélago (Vaeloria, Theraisla, Oriente) en zona lateral derecha (libre de carriles)
      const mx = 15.1, mz = 2.2;
      g.add(caja(2.0, 0.85, 3.2, '#334155', mx, 0.425, mz));
      g.add(caja(1.88, 0.08, 3.06, '#0284c7', mx, 0.89, mz)); // mar LEGO
      // Isla Vaeloria (IG)
      g.add(caja(0.85, 0.14, 0.82, '#22c55e', mx - 0.25, 0.99, mz - 0.85));
      g.add(caja(0.22, 0.22, 0.22, '#f8fafc', mx - 0.35, 1.15, mz - 0.95));
      g.add(caja(0.24, 0.12, 0.24, '#ef4444', mx - 0.35, 1.32, mz - 0.95));
      g.add(cil(0.05, 0.36, '#cbd5e1', mx - 0.02, 1.22, mz - 0.72, 8)); // torre radar mini
      // Isla Theraisla (TikTok)
      g.add(caja(0.76, 0.14, 0.76, '#14b8a6', mx + 0.3, 0.99, mz + 0.05));
      g.add(caja(0.24, 0.18, 0.24, '#38bdf8', mx + 0.28, 1.14, mz + 0.02));
      g.add(caja(0.32, 0.06, 0.14, '#d97706', mx - 0.12, 0.96, mz + 0.12)); // muelle mini
      // Isla Oriente (YouTube)
      g.add(caja(0.8, 0.14, 0.78, '#84cc16', mx - 0.2, 0.99, mz + 0.95));
      g.add(caja(0.24, 0.2, 0.24, '#f87171', mx - 0.25, 1.15, mz + 0.95));
      const faro = cil(0.08, 0.38, '#facc15', mx + 0.15, 1.24, mz + 1.02, 10);
      g.add(faro);
      const luzFaro = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color: '#fef08a' }));
      luzFaro.position.set(mx + 0.15, 1.48, mz + 1.02);
      g.add(luzFaro);
      decorAnimables.push((t, ligero) => {
        if (!ligero) luzFaro.scale.setScalar(0.85 + Math.sin(t * 3.5) * 0.22);
      });

      // 2. Panel Mural del Archipiélago + Planificador de Publicaciones en pared trasera (x=2.2, libre entre pantalla y claraboya)
      const c = document.createElement('canvas'); c.width = 512; c.height = 320;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 512, 320);
      ctx.fillStyle = '#0284c7'; ctx.fillRect(14, 14, 484, 52);
      ctx.fillStyle = '#ffffff'; ctx.font = '800 26px sans-serif';
      ctx.fillText('ARCHIPIÉLAGO @gambitoia', 28, 48);
      const igD = info?.islas?.ig;
      const ttD = info?.islas?.tiktok;
      const ytD = info?.islas?.youtube;
      const filas = [
        { n: '📷 Vaeloria (IG)', txt: igD ? `Día ${igD.dia} · ${igD.habitantes} hab.` : 'Proyecto activo', col: '#ec4899' },
        { n: '🎵 Theraisla (TT)', txt: ttD ? `Día ${ttD.dia} · ${ttD.habitantes} hab.` : 'Isla TikTok', col: '#06b6d4' },
        { n: '▶️ Oriente (YT)', txt: ytD ? `Día ${ytD.dia} · ${ytD.habitantes} hab.` : 'Isla YouTube', col: '#ef4444' },
      ];
      filas.forEach((f, i) => {
        const y = 84 + i * 68;
        ctx.fillStyle = '#1e293b'; ctx.fillRect(18, y, 476, 56);
        ctx.fillStyle = f.col; ctx.fillRect(18, y, 8, 56);
        ctx.fillStyle = '#f8fafc'; ctx.font = '700 20px sans-serif'; ctx.fillText(f.n, 38, y + 25);
        ctx.fillStyle = '#cbd5e1'; ctx.font = '600 17px sans-serif'; ctx.fillText(f.txt, 38, y + 47);
      });
      ctx.fillStyle = '#38bdf8'; ctx.font = '700 16px sans-serif';
      ctx.fillText('Tema contextual real · Planificador activo', 20, 304);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      decorTexturas.push(tex);
      g.add(caja(3.8, 2.35, 0.16, '#1e293b', 2.2, 3.05, -D / 2 + 0.12));
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.52, 2.1), new THREE.MeshBasicMaterial({ map: tex }));
      panel.position.set(2.2, 3.05, -D / 2 + 0.21); g.add(panel);

      // 3. Totem de identidad de redes (IG / TikTok / YouTube) en esquina derecha libre (x=15.2, z=6.2)
      const tx = 15.2, tz = 6.2;
      g.add(caja(1.15, 0.18, 0.9, '#334155', tx, 0.09, tz));
      g.add(caja(0.95, 1.35, 0.28, '#1e293b', tx, 0.85, tz));
      g.add(caja(0.76, 0.3, 0.32, '#e11d48', tx, 1.24, tz)); // IG
      g.add(caja(0.76, 0.3, 0.32, '#06b6d4', tx, 0.86, tz)); // TikTok
      g.add(caja(0.76, 0.3, 0.32, '#dc2626', tx, 0.48, tz)); // YouTube
    },
  },
  'estudio-base': {
    id: 'estudio-base',
    nombre: 'Estudio LEGO Base',
    acento: '#64748b',
    secundario: '#38bdf8',
    construir(g) {
      // Escultura geométrica minimalista y panel neutro en pared trasera
      const mx = 15.1, mz = 2.2;
      g.add(caja(1.6, 0.85, 2.0, '#475569', mx, 0.425, mz));
      g.add(caja(0.65, 0.55, 0.65, '#38bdf8', mx, 1.12, mz));
      g.add(caja(0.35, 0.35, 0.35, '#e2e8f0', mx, 1.56, mz));
      const c = document.createElement('canvas'); c.width = 512; c.height = 320;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, 512, 320);
      ctx.fillStyle = '#334155'; ctx.fillRect(14, 14, 484, 52);
      ctx.fillStyle = '#f8fafc'; ctx.font = '800 26px sans-serif';
      ctx.fillText('ESTUDIO LEGO · MODO BASE', 28, 48);
      ctx.fillStyle = '#94a3b8'; ctx.font = '600 19px sans-serif';
      ctx.fillText('Sin tema específico aplicado.', 28, 130);
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      decorTexturas.push(tex);
      g.add(caja(3.8, 2.35, 0.16, '#1e293b', 2.2, 3.05, -D / 2 + 0.12));
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.52, 2.1), new THREE.MeshBasicMaterial({ map: tex }));
      panel.position.set(2.2, 3.05, -D / 2 + 0.21); g.add(panel);
    },
  },
};

function aplicarTema(temaId, infoProyecto = proyectoInfoReal) {
  const clave = TEMAS_PROYECTO[temaId] ? temaId : 'estudio-base';
  temaActivoId = clave;
  while (decoracionContextual.children.length > 0) {
    decoracionContextual.remove(decoracionContextual.children[0]);
  }
  while (decorTexturas.length > 0) {
    try { decorTexturas.pop().dispose(); } catch {}
  }
  decorAnimables.length = 0;
  TEMAS_PROYECTO[clave].construir(decoracionContextual, infoProyecto);
  const tag = document.getElementById('proyectoTag');
  if (tag) tag.textContent = `🎨 ${TEMAS_PROYECTO[clave].nombre}`;
  return { tema: clave, objetos: decoracionContextual.children.length };
}

async function cargarProyectoActivo() {
  try {
    const res = await fetch('/api/proyecto');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    proyectoInfoReal = await res.json();
    aplicarTema(proyectoInfoReal.temaId || 'isla-gambito', proyectoInfoReal);
  } catch {
    aplicarTema('isla-gambito', null);
  }
}

let tareasReales = null;
let capacidadesReales = null;
const tareasBack = document.getElementById('tareasBack');
const tareasSub = document.getElementById('tareasSub');
const tareasBody = document.getElementById('tareasBody');

async function cargarTareas() {
  try {
    const r = await fetch(`/api/tareas?_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    tareasReales = d;
    capacidadesReales = d.capacidades || null;
    if (tareasBack && tareasBack.style.display === 'flex') renderTareasModal();
    if (seleccionado) renderInspector();
  } catch {}
}

function renderTareasModal() {
  if (!tareasBody) return;
  const todas = tareasReales?.tareas || [];
  const principales = todas.filter((t) => !t.parent_task_id).slice(-5).reverse();
  tareasSub.textContent = principales.length
    ? `${principales.length} tarea(s) principal(es) · Actualizado ${fmtHoraCorta(tareasReales?.actualizadoEn)}`
    : 'Sin tareas orquestadas registradas aún (oficina/tareas.json)';
  if (!principales.length) {
    tareasBody.innerHTML = '<div class="aCard">Sin tareas en cola. Ejecuta una tarea orquestada para ver subtareas, dependencias y evidencias reales.</div>';
    return;
  }
  tareasBody.innerHTML = principales.map((p) => {
    const subs = todas.filter((s) => s.parent_task_id === p.task_id);
    const comp = subs.filter((s) => s.status === 'completada').length;
    const activa = ['pendiente', 'asignada', 'trabajando', 'esperando_dependencia', 'revisando'].includes(p.status);
    const reintentable = ['error', 'cancelada'].includes(p.status);
    const subsHtml = subs.map((s) => {
      const files = (s.result?.archivos || []).filter((f) => f.startsWith('oficina/') || f.startsWith('reels/render/'));
      const links = files.map((f) => `<a href="/api/entregable?ruta=${encodeURIComponent(f)}" target="_blank" style="color:#2563eb;font-weight:700;margin-right:6px;">⬇ ${esc(f.split('/').pop())}</a>`).join('');
      return `<div class="aCard"><div><b>${esc(s.specialist)}</b> <span class="aBadge">${esc(s.lifecycle || s.status)}</span></div><div>${esc(s.description)}</div><div class="mMeta">${s.assigned_by ? `Asigna: ${esc(s.assigned_by)} · ` : ''}${s.executor_used ? `Ejecutor: ${esc(s.executor_used)} · ` : ''}${s.duration_ms != null ? `${s.duration_ms} ms · ` : ''}${s.accepted === true ? '✔ Validado' : s.accepted === false ? '✖ No aceptado' : ''}</div><div class="mMeta">${s.evidence?.length ? `Evidencia: ${esc(s.evidence.slice(0, 2).join(', '))}` : (s.error ? `Nota: ${esc(s.error)}` : 'En cola')}</div>${links ? `<div class="mMeta">${links}</div>` : ''}</div>`;
    }).join('');
    const btns = `${activa ? `<button data-cancel="${esc(p.task_id)}" type="button" style="padding:3px 9px;border-radius:7px;border:1px solid #fca5a5;background:#fef2f2;color:#b91c1c;font:700 11px Nunito,sans-serif;cursor:pointer;">✕ Cancelar</button>` : ''}${reintentable ? `<button data-retry="${esc(p.task_id)}" type="button" style="padding:3px 9px;border-radius:7px;border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;font:700 11px Nunito,sans-serif;cursor:pointer;">↻ Reintentar</button>` : ''}`;
    return `<section class="aSec"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;"><h3 style="margin:0;">🎯 ${esc(p.description)} (${comp}/${subs.length} · ${esc(p.status)})</h3><div>${btns}</div></div><div class="aGrid">${subsHtml || '<div class="aCard">Sin subtareas</div>'}</div></section>`;
  }).join('');
  tareasBody.querySelectorAll('[data-cancel]').forEach((b) => { b.onclick = async () => { await fetch('/api/tareas/cancelar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: b.dataset.cancel }) }); cargarTareas(); }; });
  tareasBody.querySelectorAll('[data-retry]').forEach((b) => { b.onclick = async () => { await fetch('/api/tareas/reintentar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: b.dataset.retry }) }); cargarTareas(); }; });
}

document.getElementById('formNuevaTarea')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btnEnviarTarea');
  const tipo = document.getElementById('tareaTipo')?.value || 'auditoria';
  const inp = document.getElementById('tareaTitulo');
  const titulo = inp?.value.trim() || '';
  if (btn.disabled) return;
  btn.disabled = true;
  const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await fetch('/api/tareas/crear', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo, titulo, requestId }) });
    if (inp) inp.value = '';
    setTimeout(cargarTareas, 350);
  } finally { setTimeout(() => { btn.disabled = false; }, 1000); }
});

const movilBack = document.getElementById('movilBack');
async function abreMovil(abierto) {
  if (!movilBack) return;
  movilBack.style.display = abierto ? 'flex' : 'none';
  movilBack.setAttribute('aria-hidden', String(!abierto));
  if (abierto) {
    try {
      const r = await fetch('/api/red', { cache: 'no-store' });
      const d = await r.json();
      document.getElementById('movilQr').innerHTML = d.qrSvg || '';
      document.getElementById('movilUrl').textContent = d.urlMovil || location.href;
    } catch {}
  }
}
document.getElementById('btnMovil')?.addEventListener('click', () => abreMovil(true));
document.getElementById('cerrarMovil')?.addEventListener('click', () => abreMovil(false));
movilBack?.addEventListener('click', (e) => { if (e.target === movilBack) abreMovil(false); });

function abreTareas(abierto) {
  if (!tareasBack) return;
  tareasBack.style.display = abierto ? 'flex' : 'none';
  tareasBack.setAttribute('aria-hidden', String(!abierto));
  if (abierto) { cargarTareas(); renderTareasModal(); }
}

document.getElementById('btnTareas')?.addEventListener('click', () => abreTareas(true));
document.getElementById('cerrarTareas')?.addEventListener('click', () => abreTareas(false));
tareasBack?.addEventListener('click', (e) => { if (e.target === tareasBack) abreTareas(false); });

// Panel Fase 7: Memoria SQLite, Codex y Resumidor de contexto
let fase7Data = null;
const fase7Back = document.getElementById('fase7Back');
const fase7Sub = document.getElementById('fase7Sub');
const fase7Body = document.getElementById('fase7Body');

async function cargarFase7() {
  try {
    const r = await fetch(`/api/fase7?_=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    fase7Data = await r.json();
    if (fase7Back && fase7Back.style.display === 'flex') renderFase7Modal();
  } catch {}
}

function renderFase7Modal() {
  if (!fase7Body || !fase7Data) return;
  const { memoria, codex, resumidor } = fase7Data;
  fase7Sub.textContent = `Datos reales verificados · ${fmtHoraCorta(new Date().toISOString())}`;
  fase7Body.innerHTML =
    `<div class="aCard"><div><b>📚 10·MEMORIA (SQLite)</b> <span class="aBadge">${memoria?.dbExiste ? 'activo' : 'pendiente'}</span></div>` +
    `<div>Motor: <b>${esc(memoria?.motor || 'node:sqlite')}</b></div>` +
    `<div>Registros guardados: <b>${memoria?.totalRegistros ?? 0}</b></div>` +
    `<div>Consultas realizadas: <b>${memoria?.consultasRealizadas ?? 0}</b></div>` +
    `<div class="mMeta">Última act.: ${esc(fmtHoraCorta(memoria?.ultimaActualizacionRegistro))}</div></div>` +

    `<div class="aCard"><div><b>⚙️ 11·CODEX</b> <span class="aBadge">${codex?.disponible ? 'listo' : 'bloqueado/off'}</span></div>` +
    `<div>Versión: <b>${esc(codex?.version || 'no_detectado')}</b></div>` +
    `<div>Autenticación: <b>${esc(codex?.autenticacion || 'no_verificada')}</b></div>` +
    `<div>Coste API facturable: <b>${codex?.apiFacturable ? 'sí' : 'no (ChatGPT)'}</b></div>` +
    `<div>Modificados: <b>${(codex?.archivosModificados || []).length}</b> · Pruebas: <b>${(codex?.pruebasEjecutadas || []).length}</b></div>` +
    `<div class="mMeta">${esc(codex?.limites || '')}</div></div>` +

    `<div class="aCard"><div><b>🗜️ 13·RESUMIDOR</b> <span class="aBadge">activo</span></div>` +
    `<div>Mensajes procesados: <b>${resumidor?.mensajesProcesados ?? 0}</b></div>` +
    `<div>Archivos resumidos: <b>${resumidor?.archivosResumidos ?? 0}</b> · Reutilizados: <b>${resumidor?.resumenesReutilizados ?? 0}</b></div>` +
    `<div>Cambios detectados: <b>${resumidor?.cambiosDetectados ?? 0}</b></div>` +
    `<div>Contexto reducido: <b>${resumidor?.ahorroBytes ?? 0} bytes</b></div>` +
    `<div class="mMeta">Última act.: ${esc(fmtHoraCorta(resumidor?.ultimaActualizacion))}</div></div>`;
}

function abreFase7(abierto) {
  if (!fase7Back) return;
  fase7Back.style.display = abierto ? 'flex' : 'none';
  fase7Back.setAttribute('aria-hidden', String(!abierto));
  if (abierto) { cargarFase7(); renderFase7Modal(); }
}

document.getElementById('btnFase7')?.addEventListener('click', () => abreFase7(true));
document.getElementById('cerrarFase7')?.addEventListener('click', () => abreFase7(false));
fase7Back?.addEventListener('click', (e) => { if (e.target === fase7Back) abreFase7(false); });

cargarFase7();
setInterval(cargarFase7, 5000);

cargarTareas();
setInterval(cargarTareas, 4000);

cargarProyectoActivo();

DEMO ? demo() : sondea();
cargarMetricas();
setInterval(cargarMetricas, 60000);
window.oficina = {
  agentes,
  procesa,
  mapearDestino,
  plan,
  geminiMonitor,
  clasificaActividadGemini,
  encuadre,
  seleccionaAgente,
  reunionActiva,
  usuario,
  construyeRuta,
  SALA_SILLAS,
  USUARIO,
  abreMetricas,
  abreAuditoria,
  abreTareas,
  abreFase7,
  abreMovil,
  colisionesAudit: () => {
    const errores = [];
    for (const id of ESPECIALISTAS_IDS) {
      const ag = agentes[id];
      if (!ag) continue;
      ag.fig.root.updateWorldMatrix(true, true);
      const minY = new THREE.Box3().setFromObject(ag.fig.root).min.y;
      if (minY < -0.02) errores.push({ id, tipo: 'suelo', minY });
      if (ag.desk?.silla) {
        // La silla (z_rel=+0.88, prof 0.65 -> z>=+0.555) no debe invadir el tablero del escritorio (z_rel<=+0.575, y=0.90)
        const chairMinZ = ag.cfg.z + 0.88 - 0.325;
        const deskMaxZ = ag.cfg.z + 0.56;
        if (chairMinZ < deskMaxZ - 0.05) errores.push({ id, tipo: 'silla_escritorio', chairMinZ, deskMaxZ });
      }
      // Verificar que manos en reposo/idle no queden debajo del tablero del escritorio
      const handWorld = new THREE.Vector3(0, -0.38, 0.04);
      ag.fig.brazos[1].localToWorld(handWorld);
      if (handWorld.z < ag.cfg.z + 0.52 && handWorld.y < 0.88) {
        errores.push({ id, tipo: 'brazo_escritorio', y: handWorld.y, z: handWorld.z });
      }
    }
    return { totalRevisados: ESPECIALISTAS_IDS.size, ok: errores.length === 0, errores };
  },
  getFase7: () => fase7Data,
  getTareas: () => tareasReales,
  getMetricas: () => metricasReales,
  aplicarTema,
  temaActual: () => temaActivoId,
  temasDisponibles: () => Object.keys(TEMAS_PROYECTO),
  decoracionAudit: () => {
    decoracionContextual.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(decoracionContextual);
    return {
      tema: temaActivoId,
      hijos: decoracionContextual.children.length,
      vacia: decoracionContextual.children.length === 0,
      bounds: { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z },
    };
  },
  idleInfo: (id) => {
    const ag = agentes[id];
    if (!ag) return null;
    return {
      estado: ag.estado,
      idleActual: ag.idleActual,
      idleAnterior: ag.idleAnterior,
      catalogoCount: (IDLE_CATALOGO[id] || IDLE_CATALOGO._default).length,
      historial: [...ag.idleHistorial],
    };
  },
  especialistasActivos: () => [...ESPECIALISTAS_IDS].filter((id) => agentes[id] && !['desconocido', 'libre', 'desconectado'].includes(agentes[id].estado)),
  subagentesActivos: () => Object.keys(agentes).filter((id) => id.startsWith('gemini/') || id.startsWith('claude/')),
  geometriaAudit: () => {
    const boxes = [];
    for (const id of ESPECIALISTAS_IDS) {
      const ag = agentes[id];
      if (!ag) continue;
      ag.desk.g.updateWorldMatrix(true, true);
      const box = new THREE.Box3().setFromObject(ag.desk.g);
      boxes.push({ id, minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z, x: ag.cfg.x, z: ag.cfg.z });
    }
    const solapes = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const ox = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
        const oz = Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ);
        if (ox > 0.01 && oz > 0.01) solapes.push({ a: a.id, b: b.id, ox, oz });
      }
    }
    const fueraLimites = boxes.filter((b) => b.minX < -W / 2 || b.maxX > W / 2 || b.minZ < -D / 2 || b.maxZ > D / 2);
    return { W, D, totalEspecialistas: boxes.length, solapes, fueraLimites, boxes };
  },
  estadoIdle: (id) => {
    const ag = agentes[id];
    if (!ag) return null;
    const f = ag.fig;
    return {
      estado: ag.estado,
      bix: f.brazos[0].rotation.x,
      bdx: f.brazos[1].rotation.x,
      hy: f.cabeza.rotation.y,
      hx: f.cabeza.rotation.x,
      papel: f.papel.visible,
      pos: { x: ag.cfg.x, z: ag.cfg.z },
    };
  },
  setTechoModo,
  getTechoModo: () => techoModo,
  techoAudit: () => ({
    modo: techoModo,
    visible: techoGrupo.visible,
    opacity: techoMatSolido.opacity,
    transparent: techoMatSolido.transparent,
  }),
  abreCamaras: (v) => abreCamaras(v),
  setCamLayout: (l) => setCamLayout(l),
  setCamActiva: (id) => setCamActiva(id),
  camarasAudit: () => CAMARAS_CCTV.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    pos: c.pos,
    target: c.target,
    fov: c.cam.fov,
    dentroLimites: Math.abs(c.pos[0]) < W / 2 && Math.abs(c.pos[2]) < D / 2 && c.pos[1] > 0 && c.pos[1] < 5.4,
  })),
};

// ---------------- 6 Cámaras Físicas y Virtuales CCTV (Fase 9) ----------------
const CAMARAS_DEF = [
  { id: 'cam01', nombre: 'CAM 01 · PANORÁMICA', pos: [-15.6, 4.7, 9.6], target: [-1.5, 1.0, -3.0], fov: 48 },
  { id: 'cam02', nombre: 'CAM 02 · CENITAL', pos: [0.0, 5.05, -2.5], target: [0.0, 0.0, -2.6], fov: 68 },
  { id: 'cam03', nombre: 'CAM 03 · PRODUCCIÓN AV', pos: [-15.5, 3.6, 0.2], target: [-4.0, 1.0, -3.2], fov: 46 },
  { id: 'cam04', nombre: 'CAM 04 · OPERACIONES', pos: [-15.5, 3.8, -9.6], target: [-4.5, 1.0, -2.5], fov: 46 },
  { id: 'cam05', nombre: 'CAM 05 · CLAUDE', pos: [4.8, 3.6, -9.6], target: [7.4, 1.0, -3.2], fov: 48 },
  { id: 'cam06', nombre: 'CAM 06 · GEMINI', pos: [15.5, 3.6, -2.5], target: [11.2, 1.1, -3.2], fov: 50 },
];

const CAMARAS_CCTV = CAMARAS_DEF.map((def) => {
  const cam = new THREE.PerspectiveCamera(def.fov, 16 / 9, 0.2, 120);
  cam.position.set(...def.pos);
  cam.lookAt(...def.target);
  // Modelo físico LEGO montado en pared/techo
  const g = new THREE.Group();
  g.position.set(...def.pos);
  g.lookAt(...def.target);
  g.add(caja(0.24, 0.2, 0.42, '#f8fafc', 0, 0, 0));
  const lente = cil(0.08, 0.14, '#0f172a', 0, 0, 0.24, 12);
  lente.rotation.x = Math.PI / 2; g.add(lente);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshBasicMaterial({ color: '#22c55e' })).translateX(0.08).translateY(0.06).translateZ(0.22));
  scene.add(g);
  return { ...def, cam, baseFov: def.fov, mesh: g, yawOffset: 0, pitchOffset: 0, patrulla: false };
});

// Controles de Techo + OFICINA CAM CONTROL
document.getElementById('btnTecho')?.addEventListener('click', () => {
  const orden = ['translucido', 'visible', 'oculto'];
  setTechoModo(orden[(orden.indexOf(techoModo) + 1) % orden.length]);
});
document.getElementById('camTechoBtn')?.addEventListener('click', () => {
  const orden = ['translucido', 'visible', 'oculto'];
  setTechoModo(orden[(orden.indexOf(techoModo) + 1) % orden.length]);
});

const camBack = document.getElementById('camBack');
const camGrid = document.getElementById('camGrid');
const camList = document.getElementById('camList');
const camAgenteSel = document.getElementById('camAgenteSel');
const camAgentInfo = document.getElementById('camAgentInfo');
const camSelectedLbl = document.getElementById('camSelectedLbl');
const camFpsLbl = document.getElementById('camFpsLbl');

let camAbierto = false;
let camLayout = '3x2'; // '3x2' | '2x2' | '1x1' | 'follow'
let camActivaId = 'cam01';
let camFollowAgente = 'gemini';
const camCanvases = new Map();

function pueblaSelectAgentesCam() {
  if (!camAgenteSel) return;
  camAgenteSel.innerHTML = Object.entries(agentes)
    .filter(([id]) => !id.includes('/'))
    .map(([id, ag]) => `<option value="${esc(id)}" ${id === camFollowAgente ? 'selected' : ''}>${esc(ag.cfg.nombre)}</option>`)
    .join('');
}
pueblaSelectAgentesCam();

function renderCamAgentInfo() {
  if (!camAgentInfo) return;
  const ag = agentes[camFollowAgente];
  if (!ag) { camAgentInfo.textContent = 'Agente no encontrado.'; return; }
  const ultTarea = (tareasReales?.tareas || []).filter((t) => t.specialist === camFollowAgente || t.agent_id === camFollowAgente).at(-1);
  camAgentInfo.innerHTML =
    `<div><b>${esc(ag.cfg.nombre)}</b> · <span style="color:${COLOR_ESTADO[ag.estado] || '#94a3b8'}">${esc((NOMBRE_ESTADO[ag.estado] || ag.estado).toUpperCase())}</span></div>` +
    `<div>Tarea: ${esc(ultTarea?.description || ag.tarea || ag.texto || 'Sin tarea activa')}</div>` +
    `<div>Última señal: ${ag.ultimo ? fmtHoraCorta(new Date(ag.ultimo).toISOString()) : 'sin eventos'}</div>` +
    (ultTarea?.evidence?.length ? `<div>Entrega: ${esc(ultTarea.evidence.slice(0, 2).join(', '))}</div>` : '') +
    `<button id="camCentrarAgBtn" type="button" style="margin-top:6px;padding:4px 9px;border-radius:7px;border:0;background:#2563eb;color:#fff;font:700 11px Nunito,sans-serif;cursor:pointer;">🎯 Seguir puesto</button>`;
  document.getElementById('camCentrarAgBtn')?.addEventListener('click', () => setCamLayout('follow'));
}

function renderCamGridDOM() {
  if (!camGrid || !camList) return;
  const esMovil = innerWidth <= 760;
  let visibles = CAMARAS_CCTV;
  if (camLayout === '2x2') visibles = CAMARAS_CCTV.slice(0, 4);
  else if (camLayout === '1x1' || camLayout === 'follow' || (esMovil && camLayout === '3x2')) {
    visibles = [CAMARAS_CCTV.find((c) => c.id === camActivaId) || CAMARAS_CCTV[0]];
  }

  camGrid.style.gridTemplateColumns = visibles.length === 1 ? '1fr' : visibles.length === 4 ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)';
  camGrid.innerHTML = '';
  camCanvases.clear();
  for (const c of visibles) {
    const card = document.createElement('div');
    Object.assign(card.style, { background: '#0f172a', border: `2px solid ${c.id === camActivaId ? '#38bdf8' : '#1e293b'}`, borderRadius: '10px', display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: '0' });
    const bar = document.createElement('div');
    Object.assign(bar.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px', fontSize: '11px', fontWeight: '700', background: '#111c33' });
    const lbl = camLayout === 'follow' ? `SEGUIMIENTO · ${agentes[camFollowAgente]?.cfg.nombre || camFollowAgente}` : c.nombre;
    bar.innerHTML = `<span>🟢 ${esc(lbl)}</span><button type="button" style="padding:2px 7px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#fff;font:700 10px Nunito,sans-serif;cursor:pointer;">${camLayout === '1x1' ? '3×2' : 'Ampliar'}</button>`;
    bar.querySelector('button').onclick = () => {
      if (camLayout === '1x1') setCamLayout('3x2');
      else { camActivaId = c.id; setCamLayout('1x1'); }
    };
    const cv = document.createElement('canvas');
    const esUnica = visibles.length === 1;
    cv.width = esUnica ? 1280 : 640;
    cv.height = esUnica ? 720 : 360;
    Object.assign(cv.style, { width: '100%', height: '100%', objectFit: 'contain', background: '#020617', flex: '1', minHeight: '0', touchAction: 'none', cursor: 'grab' });
    let dragCam = null;
    cv.addEventListener('pointerdown', (e) => {
      dragCam = { x: e.clientX, y: e.clientY };
      cv.setPointerCapture?.(e.pointerId);
      camActivaId = c.id;
      c.patrulla = false;
    });
    cv.addEventListener('pointermove', (e) => {
      if (!dragCam) return;
      const dx = e.clientX - dragCam.x, dy = e.clientY - dragCam.y;
      dragCam = { x: e.clientX, y: e.clientY };
      c.yawOffset = Math.max(-0.95, Math.min(0.95, c.yawOffset - dx * 0.0045));
      c.pitchOffset = Math.max(-0.55, Math.min(0.55, c.pitchOffset + dy * 0.004));
    });
    cv.addEventListener('pointerup', () => { dragCam = null; });
    cv.addEventListener('pointercancel', () => { dragCam = null; });
    card.append(bar, cv);
    camGrid.appendChild(card);
    camCanvases.set(c.id, { camObj: c, cv, ctx: cv.getContext('2d') });
  }

  camList.innerHTML = '';
  for (const c of CAMARAS_CCTV) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c.nombre;
    Object.assign(b.style, { textAlign: 'left', padding: '6px 9px', borderRadius: '8px', border: `1px solid ${c.id === camActivaId ? '#38bdf8' : '#1e293b'}`, background: c.id === camActivaId ? '#1e3a5f' : '#111c33', color: '#f8fafc', font: '700 11px Nunito,sans-serif', cursor: 'pointer' });
    b.onclick = () => setCamActiva(c.id);
    camList.appendChild(b);
  }
  const act = CAMARAS_CCTV.find((c) => c.id === camActivaId) || CAMARAS_CCTV[0];
  if (camSelectedLbl) camSelectedLbl.textContent = camLayout === 'follow' ? `SEGUIMIENTO · ${agentes[camFollowAgente]?.cfg.nombre || camFollowAgente}` : act.nombre;
  renderCamAgentInfo();
}

function ajustarRendererCamaras() {
  if (camAbierto) {
    const esUnica = camLayout === '1x1' || camLayout === 'follow' || (innerWidth <= 760 && camLayout === '3x2');
    const rw = esUnica ? 1280 : 640;
    const rh = esUnica ? 720 : 360;
    renderer.setPixelRatio(1);
    renderer.setSize(rw, rh, false);
  } else {
    renderer.setPixelRatio(dprActual);
    renderer.setSize(innerWidth, innerHeight);
  }
}

function setCamLayout(l) {
  camLayout = ['3x2', '2x2', '1x1', 'follow'].includes(l) ? l : '3x2';
  renderCamGridDOM();
  ajustarRendererCamaras();
}
function setCamActiva(id) {
  if (CAMARAS_CCTV.some((c) => c.id === id)) camActivaId = id;
  if (camLayout === 'follow') camLayout = '1x1';
  renderCamGridDOM();
  ajustarRendererCamaras();
}
function abreCamaras(abierto) {
  camAbierto = Boolean(abierto);
  if (!camBack) return;
  camBack.style.display = camAbierto ? 'flex' : 'none';
  camBack.setAttribute('aria-hidden', String(!camAbierto));
  if (camAbierto) { pueblaSelectAgentesCam(); renderCamGridDOM(); }
  ajustarRendererCamaras();
}

document.getElementById('btnCamaras')?.addEventListener('click', () => abreCamaras(true));
document.getElementById('cerrarCamaras')?.addEventListener('click', () => abreCamaras(false));
document.querySelectorAll('.camLayoutBtn').forEach((b) => b.addEventListener('click', () => setCamLayout(b.dataset.layout)));
camAgenteSel?.addEventListener('change', (e) => { camFollowAgente = e.target.value; renderCamAgentInfo(); if (camLayout === 'follow') renderCamGridDOM(); });
document.getElementById('camZoomIn')?.addEventListener('click', () => {
  const c = CAMARAS_CCTV.find((x) => x.id === camActivaId); if (c) { c.cam.fov = Math.max(22, c.cam.fov - 6); c.cam.updateProjectionMatrix(); }
});
document.getElementById('camZoomOut')?.addEventListener('click', () => {
  const c = CAMARAS_CCTV.find((x) => x.id === camActivaId); if (c) { c.cam.fov = Math.min(78, c.cam.fov + 6); c.cam.updateProjectionMatrix(); }
});
document.getElementById('camPatrolBtn')?.addEventListener('click', () => {
  const c = CAMARAS_CCTV.find((x) => x.id === camActivaId);
  if (c) {
    c.patrulla = !c.patrulla;
    const b = document.getElementById('camPatrolBtn');
    if (b) b.style.background = c.patrulla ? '#0284c7' : '#1e293b';
  }
});
document.getElementById('camResetBtn')?.addEventListener('click', () => {
  const c = CAMARAS_CCTV.find((x) => x.id === camActivaId);
  if (c) { c.yawOffset = 0; c.pitchOffset = 0; c.patrulla = false; c.cam.fov = c.baseFov; c.cam.updateProjectionMatrix(); }
});
document.getElementById('camFullBtn')?.addEventListener('click', () => {
  if (!document.fullscreenElement) camBack?.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.().catch(() => {});
});

// ---------------- Web Audio API Local + Animación de Parlantes (Fase 10) ----------------
let audioCtx = null, audioEl = null, audioGain = null, audioAnalyser = null, audioFreq = null, audioActivo = false;
const audioChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('oficina-audio-lock') : null;
if (audioChannel) {
  audioChannel.onmessage = (e) => {
    if (e.data === 'play' && audioActivo) detenerAudio();
  };
}
function detenerAudio() {
  audioActivo = false;
  try { audioEl?.pause(); } catch {}
  parlantesAudio.forEach((p) => p.scale.set(1, 1, 1));
  const b = document.getElementById('btnAudio');
  if (b) b.textContent = '🔇 Audio';
}
async function toggleAudio() {
  if (audioActivo) { detenerAudio(); return; }
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      audioEl = new Audio('/audio/estudio-ambiente.wav');
      audioEl.loop = true;
      const src = audioCtx.createMediaElementSource(audioEl);
      audioGain = audioCtx.createGain();
      audioGain.gain.value = Number(document.getElementById('audioVol')?.value ?? 0.35);
      audioAnalyser = audioCtx.createAnalyser();
      audioAnalyser.fftSize = 64;
      audioFreq = new Uint8Array(audioAnalyser.frequencyBinCount);
      src.connect(audioAnalyser);
      audioAnalyser.connect(audioGain);
      audioGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    audioChannel?.postMessage('play');
    await audioEl.play();
    audioActivo = true;
    const b = document.getElementById('btnAudio');
    if (b) b.textContent = '🔊 Audio';
  } catch { detenerAudio(); }
}
document.getElementById('btnAudio')?.addEventListener('click', toggleAudio);
document.getElementById('audioVol')?.addEventListener('input', (e) => {
  if (audioGain) audioGain.gain.value = Number(e.target.value);
});

// ---------------- Bucle principal Web-First ----------------
const reloj = new THREE.Clock();
let fpsSuave = 60, ultimoRenderMs = 0, ultimoCamRender = 0, frameCountAdapt = 0;

window.oficina.webStats = () => ({
  fps: Math.round(fpsSuave),
  renderMs: Number(ultimoRenderMs.toFixed(2)),
  drawCalls: renderer.info.render.calls,
  triangles: renderer.info.render.triangles,
  geometries: renderer.info.memory.geometries,
  textures: renderer.info.memory.textures,
  dpr: renderer.getPixelRatio(),
  effectiveRes: { w: renderer.domElement.width, h: renderer.domElement.height },
  hiddenPaused: document.hidden,
  contextLost: pausadoPorContexto,
  audioActivo,
  capabilities: {
    maxTextureSize: renderer.capabilities.maxTextureSize,
    cores: navigator.hardwareConcurrency || null,
    devicePixelRatio: devicePixelRatio || 1,
  },
});

function buclePrincipal() {
  if (pausadoPorContexto || document.hidden) return;
  const tRender0 = performance.now();
  const rawDt = reloj.getDelta();
  const dt = Math.min(rawDt, 0.05), t = reloj.elapsedTime;
  if (rawDt > 0.001) fpsSuave = fpsSuave * 0.92 + (1 / rawDt) * 0.08;
  const modoLigeroDecor = fpsSuave < 24;

  // Ajuste adaptativo suave de DPR cada 90 frames sin escalado borroso
  frameCountAdapt++;
  if (frameCountAdapt % 90 === 0) {
    const nuevoDpr = fpsSuave < 20 ? Math.max(1, dprBase * 0.75) : dprBase;
    if (Math.abs(nuevoDpr - dprActual) > 0.1) {
      dprActual = nuevoDpr;
      renderer.setPixelRatio(dprActual);
    }
  }

  // Animar parlantes solo cuando Web Audio está activo
  if (audioActivo && audioAnalyser && audioFreq && parlantesAudio.length) {
    audioAnalyser.getByteFrequencyData(audioFreq);
    const avg = audioFreq.slice(0, 8).reduce((a, b) => a + b, 0) / (8 * 255);
    const sc = 1 + avg * 0.22;
    parlantesAudio.forEach((p) => p.scale.set(sc, sc, sc));
  }

  for (const a of Object.values(agentes)) a.update(dt, t);
  for (const fn of decorAnimables) fn(t, modoLigeroDecor);

  if (celebrando > 0) {
    celebrando -= dt; const s = Math.sin(t * 12);
    usuario.brazos[0].rotation.set(-2.7 + s * 0.2, 0, 0.3);
    usuario.brazos[1].rotation.set(-2.7 - s * 0.2, 0, -0.3);
    usuario.cuerpo.position.y = Math.abs(s) * 0.12;
  } else {
    usuario.brazos.forEach((b) => b.rotation.set(-0.1, 0, 0));
    usuario.cuerpo.position.y = 0; usuario.cabeza.rotation.y = Math.sin(t * 0.5) * 0.35;
  }

  for (let i = vuelos.length - 1; i >= 0; i--) {
    const v = vuelos[i]; v.t += dt / 1.4; const k = Math.min(1, v.t);
    v.m.position.lerpVectors(v.a, v.b, k); v.m.position.y += Math.sin(k * Math.PI) * 2.5; v.m.rotation.y = k * 6;
    if (k >= 1) { scene.remove(v.m); if (agentes[v.hasta]) apilaPapel(agentes[v.hasta].desk.monton); vuelos.splice(i, 1); }
  }

  if (camAbierto && camCanvases.size > 0) {
    const intervalo = camCanvases.size > 1 ? 0.08 : 0.033;
    if (t - ultimoCamRender >= intervalo) {
      ultimoCamRender = t;
      const prevTechoVis = techoGrupo.visible;
      for (const { camObj, cv, ctx } of camCanvases.values()) {
        const w = cv.width, h = cv.height;
        if (camObj.id === 'cam02') techoGrupo.visible = false;
        camObj.mesh.visible = false;
        let activeCam = camObj.cam;
        activeCam.aspect = w / Math.max(1, h);
        activeCam.updateProjectionMatrix();
        if (camLayout === 'follow' && agentes[camFollowAgente]) {
          const p = agentes[camFollowAgente].fig.root.position;
          activeCam.position.set(p.x + 2.8, 3.1, p.z + 3.2);
          activeCam.lookAt(p.x, 1.0, p.z);
        } else {
          if (camObj.patrulla) camObj.yawOffset = Math.sin(t * 0.5) * 0.35;
          camObj.cam.position.set(...camObj.pos);
          const tx = camObj.target[0] + Math.sin(camObj.yawOffset) * 8;
          const ty = camObj.target[1] + camObj.pitchOffset * 5;
          const tz = camObj.target[2] + (Math.cos(camObj.yawOffset) - 1) * 4;
          camObj.cam.lookAt(tx, ty, tz);
        }
        renderer.render(scene, activeCam);
        ctx.drawImage(renderer.domElement, 0, 0, renderer.domElement.width, renderer.domElement.height, 0, 0, w, h);
        camObj.mesh.visible = true;
        techoGrupo.visible = prevTechoVis;
      }
      if (camFpsLbl) camFpsLbl.textContent = `${Math.round(fpsSuave)} FPS`;
    }
    ultimoRenderMs = performance.now() - tRender0;
    return;
  }

  controls.update();
  renderer.render(scene, camera);
  labels.render(scene, camera);
  ultimoRenderMs = performance.now() - tRender0;
}

renderer.setAnimationLoop(buclePrincipal);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    renderer.setAnimationLoop(null);
  } else {
    reloj.getDelta();
    renderer.setAnimationLoop(buclePrincipal);
  }
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; encuadre(); camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); labels.setSize(innerWidth, innerHeight);
});
