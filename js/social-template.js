// ============================================================================
// PLANTILLA REUTILIZABLE DE INTERACCIÓN EN REDES SOCIALES 3D LOW-POLY
// (Instagram / TikTok / YouTube / Twitch / Kick -> Mundo 3D en Tiempo Real)
// ============================================================================
// Uso en este o próximos proyectos:
//   const social = new SocialIslandEngine({ world, getRedActiva, onNewFollower });
//   social.start();
//   window.IslaSocial.pedir({ autor: '@usuario', tipo: 'edificio', titulo: 'Torre Pizza', texto: 'Quiero una torre' });
// ============================================================================

export const DEFAULT_SOCIAL_TEMPLATE_CONFIG = {
  projectId: 'isla-ia-lowpoly',
  channelName: 'isla-social-live',
  petitionsUrl: './data/peticiones-vivo.json',
  pollIntervalMs: 6000,
  networks: {
    instagram: { name: 'Instagram', badge: '📸', accent: '#ec4899' },
    youtube: { name: 'YouTube', badge: '▶️', accent: '#ef4444' },
    tiktok: { name: 'TikTok', badge: '🎵', accent: '#06b6d4' },
  },
};

export class SocialIslandEngine {
  constructor(options = {}) {
    this.config = { ...DEFAULT_SOCIAL_TEMPLATE_CONFIG, ...options };
    this.world = options.world;
    this.getRedActiva = options.getRedActiva || (() => 'instagram');
    this.onNewState = options.onNewState || null;
    this.seenIds = new Set();
    this.history = [];
    this.channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel(this.config.channelName)
      : null;
    this._timer = null;
  }

  start() {
    if (this.channel) {
      this.channel.onmessage = (ev) => {
        const msg = ev?.data;
        if (msg?.type === 'PETICION_VIVO' && msg.payload) {
          this.applyPetition(msg.payload, { broadcast: false, notify: true });
        }
      };
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('isla:peticion', (ev) => {
        if (ev?.detail) this.applyPetition(ev.detail, { broadcast: true, notify: true });
      });

      // API pública global para consola, webhooks, paneles de stream o próximos proyectos
      window.IslaSocial = {
        pedir: (pet) => this.applyPetition(pet, { broadcast: true, notify: true, volarCamara: pet?.volarCamara ?? true }),
        lote: (lista = []) => lista.map((p) => this.applyPetition(p, { broadcast: false, notify: false })),
        historial: () => [...this.history],
        config: this.config,
      };
    }

    // Primera carga silenciosa de peticiones persistidas + polling en vivo
    this.poll(false);
    this._timer = setInterval(() => this.poll(true), this.config.pollIntervalMs);
    return this;
  }

  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  async poll(notifyNew = true) {
    try {
      const r = await fetch(`${this.config.petitionsUrl}?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const data = await r.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data?.peticiones) ? data.peticiones : []);
      const redActiva = this.getRedActiva();
      for (const pet of list) {
        if (pet.red && pet.red !== 'todas' && pet.red !== redActiva) continue;
        const id = String(pet.id || `${pet.autor || 'anon'}:${pet.titulo || pet.texto || 'item'}`);
        const isNew = !this.seenIds.has(id);
        this.applyPetition(pet, { broadcast: false, notify: notifyNew && isNew, volarCamara: notifyNew && isNew });
      }
    } catch (_) {
      // Silencioso en caso de estar offline
    }
  }

  applyPetition(pet = {}, opts = {}) {
    if (!this.world || typeof this.world.applyLivePetition !== 'function') return null;
    const id = String(pet.id || `${pet.autor || 'anon'}:${pet.titulo || pet.texto || Date.now()}`);
    this.seenIds.add(id);

    const payload = {
      ...pet,
      id,
      volarCamara: opts.volarCamara ?? pet.volarCamara ?? false,
    };

    const res = this.world.applyLivePetition(payload);
    if (res && !this.history.some((x) => x.id === id)) {
      this.history.push(payload);
      if (opts.notify) this.#showToast(payload);
      if (opts.broadcast && this.channel) {
        this.channel.postMessage({ type: 'PETICION_VIVO', payload });
      }
    }
    return res;
  }

  reapplyForActiveNetwork() {
    const redActiva = this.getRedActiva();
    for (const pet of this.history) {
      if (pet.red && pet.red !== 'todas' && pet.red !== redActiva) continue;
      this.world.applyLivePetition({ ...pet, volarCamara: false });
    }
  }

  #showToast(pet) {
    if (typeof document === 'undefined') return;
    let box = document.getElementById('live-petition-toast');
    if (!box) {
      box = document.createElement('div');
      box.id = 'live-petition-toast';
      Object.assign(box.style, {
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '9999',
        background: 'rgba(15, 23, 42, 0.92)',
        color: '#f8fafc',
        padding: '10px 18px',
        borderRadius: '999px',
        border: '2px solid #38bdf8',
        boxShadow: '0 10px 25px rgba(0,0,0,0.35)',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        fontWeight: '700',
        pointerEvents: 'none',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
      });
      document.body.appendChild(box);
    }
    const autor = String(pet.autor || 'comunidad').replace(/^@/, '');
    const titulo = pet.titulo || pet.texto || 'Nueva construcción';
    box.textContent = `✨ ¡PETICIÓN EN VIVO! @${autor} → ${titulo}`;
    box.style.opacity = '1';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      if (box) box.style.opacity = '0';
    }, 4500);
  }
}

