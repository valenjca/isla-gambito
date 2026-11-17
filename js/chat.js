// Chats en vivo de la isla: 🌍 global y 🏘️ vecinal (uno por zona) + 💭 charla automática de la isla.
// Proveedor: Supabase (en línea) si hay configuración en web/config.js; si no, el servidor local de desarrollo.
import { moderarMensaje, moderarNombre } from './moderacion.js';
import { ZONES, zoneName, normalizeHandle } from './state.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// ---------- proveedores ----------
// Supabase "a prueba de todo": historial y envío por REST (sin librerías que puedan fallar al cargar),
// tiempo real con supabase-js si carga y, si se corta o no carga, consulta cada 5 s (plan B) y reintenta.
async function supabaseProvider(cfg) {
  const base = cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/mensajes';
  const H = { apikey: cfg.supabaseAnonKey, 'Content-Type': 'application/json' };
  const COLS = 'id,canal,autor,texto,verificado,creado';
  const rest = async (url, opt = {}) => {
    const r = await fetch(url, { ...opt, headers: { ...H, ...(opt.headers || {}) } });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.message || 'No se pudo conectar con el chat'); }
    return r.status === 204 ? null : r.json();
  };
  let ultimoId = 0; let onEstado = () => {};
  const recibir = (cb, m) => { if (m.id > ultimoId) ultimoId = m.id; cb(m); };
  return {
    nombre: 'en línea',
    estado(fn) { onEstado = fn; },
    async historial(canal) {
      const data = await rest(`${base}?select=${COLS}&canal=eq.${encodeURIComponent(canal)}&order=creado.desc&limit=60`);
      for (const m of data) if (m.id > ultimoId) ultimoId = m.id;
      return data.reverse();
    },
    async escuchar(cb) {
      let enVivo = false;
      // Plan B: cada 5 s pide lo nuevo si el tiempo real no está conectado (o no cargó)
      setInterval(async () => {
        if (enVivo && !document.hidden) return;
        try { const nuevos = await rest(`${base}?select=${COLS}&id=gt.${ultimoId}&order=id.asc&limit=100`); nuevos.forEach((m) => recibir(cb, m)); if (!enVivo) onEstado('consultando'); }
        catch { onEstado('sin conexión'); }
      }, 5000);
      try {
        const mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm')
          .catch(() => import('https://esm.sh/@supabase/supabase-js@2.118.0'));
        const sb = mod.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: false } });
        const conectar = () => sb.channel('mensajes-isla-' + Date.now())
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, (p) => recibir(cb, p.new))
          .subscribe((st) => {
            enVivo = st === 'SUBSCRIBED'; onEstado(enVivo ? 'en vivo' : 'reconectando');
            if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') setTimeout(conectar, 4000);
          });
        conectar();
      } catch (e) { console.warn('tiempo real no disponible, uso plan B', e); onEstado('consultando'); }
    },
    async enviar(m) { await rest(base, { method: 'POST', body: JSON.stringify(m), headers: { Prefer: 'return=minimal' } }); },
  };
}
function localProvider() {
  return {
    nombre: 'local',
    async historial(canal) { const r = await fetch(`/api/chat?canal=${encodeURIComponent(canal)}`); if (!r.ok) throw new Error('sin servidor de chat'); return r.json(); },
    escuchar(cb) { const es = new EventSource('/api/chat/stream'); es.onmessage = (e) => cb(JSON.parse(e.data)); },
    async enviar(m) {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo enviar');
    },
  };
}

// ---------- interfaz ----------
export async function setupLiveChat({ state, world, ambient }) {
  const $ = (s) => document.querySelector(s);
  const log = $('#chatLog'); const form = $('#chatForm'); const nameIn = $('#chatName'); const textIn = $('#chatText');
  const zonaSel = $('#chatZona'); const foot = $('#chatFoot');
  $('#chatToggle').onclick = () => {
    const min = $('#chat').classList.toggle('min');
    if (!min && innerWidth <= 720 && !$('#panel')?.classList.contains('hidden')) $('#panelClose')?.click();
  };
  if (innerWidth <= 720) $('#chat').classList.add('min'); // en el móvil empieza plegado

  const cfg = window.ISLA_CONFIG || {};
  let prov = null;
  try { prov = cfg.supabaseUrl && cfg.supabaseAnonKey ? await supabaseProvider(cfg) : localProvider(); } catch (e) { console.warn('chat', e); }

  let autor = store.get('isla.autor') || '';
  const residente = () => state.byHandle.get(normalizeHandle(autor));
  let zona = store.get('isla.zona') || ZONES[0].id;
  const miZona = () => residente()?.zone || zona;
  let tab = store.get('isla.tab') || 'global';
  const canalDe = (t) => (t === 'zona' ? `zona:${miZona()}` : 'global');
  const cache = new Map(); // canal → mensajes

  zonaSel.innerHTML = ZONES.map((z) => `<option value="${z.id}">${esc(zoneName(state, z.id))}</option>`).join('');
  const paintHead = () => {
    document.querySelectorAll('.chat-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('#zonaLabel').textContent = zoneName(state, miZona()).replace(/^Zona /, '');
    zonaSel.value = miZona(); zonaSel.classList.toggle('hidden', tab !== 'zona' || !!residente());
    form.classList.toggle('hidden', tab === 'isla' || !prov);
    nameIn.classList.toggle('hidden', !!autor);
    foot.innerHTML = tab === 'isla' ? 'Charla automática de los vecinos según lo que hacen.'
      : !prov ? 'Chat sin conexión.'
      : autor ? `Escribes como <b>@${esc(autor)}</b>${residente() ? ' 🏠' : ' (invitado)'} · <a href="#" id="chatCambiar">cambiar</a>`
      : 'Elige un nombre o tu @ para escribir. Sé amable: Gambito lo lee todo.';
    if (tab === 'zona') foot.insertAdjacentHTML('beforeend', ' · <a href="#" id="chatJunta">📊 Convocar junta vecinal</a>'); // votación solo para esta zona
    $('#chatJunta')?.addEventListener('click', (e) => { e.preventDefault(); dispatchEvent(new CustomEvent('isla:junta')); });
    $('#chatCambiar')?.addEventListener('click', (e) => { e.preventDefault(); autor = ''; store.set('isla.autor', ''); paintHead(); nameIn.focus(); });
  };
  const linea = (m) => {
    const r = state.byHandle.get(normalizeHandle(m.autor)); const hora = new Date(m.creado).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    const sello = m.verificado ? ' <span title="Verificado">✓</span>' : r ? ' <span title="Habitante de la isla">🏠</span>' : ' <span class="mono">invitado</span>';
    return `<div class="m"><b>@${esc(m.autor)}</b>${sello} ${esc(m.texto)} <span class="mono">${hora}</span></div>`;
  };
  const render = async () => {
    paintHead();
    if (tab === 'isla') { log.innerHTML = ''; ambient.show(log); return; }
    ambient.hide();
    if (!prov) { log.innerHTML = '<div class="m sys">El chat en vivo no está disponible ahora mismo.</div>'; return; }
    const canal = canalDe(tab);
    if (!cache.has(canal)) { try { cache.set(canal, await prov.historial(canal)); } catch (e) { log.innerHTML = `<div class="m sys">${esc(e.message)}</div>`; return; } }
    const msgs = cache.get(canal);
    log.innerHTML = msgs.length ? msgs.map(linea).join('') : `<div class="m sys">${tab === 'zona' ? `Nadie ha escrito todavía en ${esc(zoneName(state, miZona()))}. Saluda a tus vecinos.` : 'Nadie ha escrito todavía. Rompe el hielo.'}</div>`;
    log.scrollTop = log.scrollHeight;
  };

  document.querySelectorAll('.chat-tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; store.set('isla.tab', tab); render(); }; });
  zonaSel.onchange = () => { zona = zonaSel.value; store.set('isla.zona', zona); render(); };

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!autor) {
      const n = moderarNombre(nameIn.value); if (!n.ok) return toast(`Nombre: ${n.motivo}`);
      autor = n.nombre; store.set('isla.autor', autor); paintHead();
    }
    const texto = textIn.value.trim(); if (!texto) return;
    const ok = moderarMensaje(texto); if (!ok.ok) return toast(ok.motivo);
    textIn.disabled = true;
    try { await prov.enviar({ canal: canalDe(tab), autor, texto }); textIn.value = ''; }
    catch (err) { toast(err.message); }
    finally { textIn.disabled = false; textIn.focus(); }
  };

  const dot = document.querySelector('#chatEstado');
  prov?.estado?.((e) => { if (!dot) return; dot.textContent = '● ' + e; dot.dataset.e = e === 'en vivo' ? 'ok' : e === 'sin conexión' ? 'mal' : 'medio'; });
  prov?.escuchar((m) => {
    if (!cache.has(m.canal)) cache.set(m.canal, []);
    const arr = cache.get(m.canal); if (arr.some((x) => x.id === m.id)) return; arr.push(m);
    if (arr.length > 200) arr.shift();
    if (canalDe(tab) === m.canal && tab !== 'isla') { log.querySelectorAll('.m.sys').forEach((n) => n.remove()); log.insertAdjacentHTML('beforeend', linea(m)); log.scrollTop = log.scrollHeight; }
    world.say?.(normalizeHandle(m.autor), m.texto); // bocadillo sobre su personaje, si está a la vista
  });
  if (!autor && state.residents.length === 0) nameIn.placeholder = 'Tu nombre o @';
  await render();
}

function toast(msg) { const t = document.querySelector('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 3200); }
