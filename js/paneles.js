// Pestañas con cuenta: 👤 Perfil (PIN, inventario, tienda de aspecto, mudanza), 🏪 Negocios y 🏛️ Democracia / juntas.
// Todo gasto es una SOLICITUD: el servidor comprueba PIN y saldo, y el ciclo la registra en la historia (cada 6 h).
import { ZONES, zoneName, COSTO_DEMOCRACIA, COSTO_JUNTA, costoNegocio, produccionNegocio, TIENDA } from './state.js';
import { OFICIOS, vidaDe } from './vida.js';
import { cuentasActivas, cuenta, entrar, crearCuenta, salir, solicitar, votar, votacionesWeb, refrescar } from './cuenta.js';
import { COMERCIO } from './world3d.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const EDIFICIOS = { hospital: 'Hospital', escuela: 'Escuela', mercado: 'Mercado', muelle: 'Muelle', faro: 'Faro', granja: 'Granja', fogata: 'Fogata comunal',
  ayuntamiento: 'Ayuntamiento', estadio: 'Estadio', taller: 'Taller', comisaria: 'Comisaría', bomberos: 'Cuartel de bomberos', torre: 'Torre', plaza: 'Plaza' };
const ESTADO = { pendiente: '⏳ en la próxima actualización', aplicada: '✅ hecho', rechazada: '❌ rechazada' };
const TIPO = { democracia: '🏛️ Democracia', junta: '🏘️ Junta vecinal', negocio: '🏪 Negocio', aspecto: '👕 Aspecto', mudanza: '🏠 Mudanza' };

export function crearPaneles({ state: s, world, toast, reabrir, findHouse }) {
  const yo = () => { const c = cuenta(); return c ? s.byHandle.get(c.handle) : null; };
  const login = (motivo) => `<div class="entry"><p>${motivo}</p><button class="btn" data-act="ir-perfil">👤 Entrar con mi @ y PIN</button></div>`;

  // ---------- 👤 Perfil ----------
  const perfil = () => {
    if (!cuentasActivas) return '<h2>👤 Perfil</h2><p>Las cuentas aún no están activas en esta isla.</p>';
    const c = cuenta();
    if (!c) return `<h2>👤 Perfil</h2>
      <p>Para ver la isla no hace falta cuenta. Con cuenta puedes <b>gastar tus monedas</b>: abrir negocios, convocar una Democracia o una junta vecinal, votar en ellas y cambiar el aspecto de tu personaje.</p>
      <form class="form" data-form="entrar">
        <label>Tu @ de Instagram<input name="h" placeholder="@usuario" autocomplete="username" required maxlength="31"></label>
        <label>PIN (4 a 8 números)<input name="p" type="password" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="current-password" required></label>
        <div class="row"><button class="btn" data-modo="entrar">Entrar</button><button class="btn sec" data-modo="crear">Crear mi cuenta</button></div>
      </form>
      <p class="mono">Solo pueden crear cuenta los seguidores de @gambitoia (los que ya tienen casa). Para demostrar que el @ es tuyo, comentarás un código en el último Reel.</p>`;
    const p = c.perfil || {}; const r = yo(); const v = r ? vidaDe(r, s) : null; const eco = world.eco?.get(c.handle);
    const neg = s.negocios.find((n) => n.handle === c.handle); const look = r ? { ...(world.walkers.find((w) => w.handle === c.handle)?.look || {}), ...(r.look || {}) } : {};
    const pend = p.estado === 'pendiente';
    return `<h2>👤 @${esc(c.handle)}</h2>
      ${pend ? `<div class="entry aviso"><b>Falta verificar que eres tú</b><p>Comenta este código en el <b>último Reel de @gambitoia</b> desde tu cuenta:</p>
        <p class="codigo">${esc(p.codigo)}</p><p class="mono">Se verifica en la próxima actualización (cada 6 h: 00, 06, 12 y 18 h de Chile). Mientras tanto puedes mirar, pero no gastar.</p></div>`
        : '<p class="ok">✔ Cuenta verificada</p>'}
      <h3>Inventario</h3>
      <div class="inv">
        <div><b>${r?.ahorros ?? p.saldo?.ahorros ?? 0} 🪙</b><span>ahorros</span></div>
        <div><b>${p.disponible ?? 0} 🪙</b><span>disponibles</span></div>
        <div><b>${eco?.ingreso ?? 0} 🪙</b><span>sueldo/día</span></div>
      </div>
      ${r ? `<p>🏠 Casa en <b>${esc(zoneName(s, r.zone))}</b>, parcela ${r.slot + 1} · ${esc(eco?.clase?.nombre || '')}</p>
      <p>💼 ${esc(v.titulo || OFICIOS[v.oficio].nombre)}${v.enEspera ? ` <span class="mono">(${v.elegido ? 'su profesión' : `sueña con ser ${esc(OFICIOS[v.vocacion].nombre.toLowerCase())}`}: falta ${esc(v.sinEdificio || OFICIOS[v.vocacion].requiere)})</span>` : ''} · 🧠 ${esc(v.rasgo.texto)}</p>
      ${neg ? `<p>🏪 «${esc(neg.nombre)}» · nivel ${neg.nivel} · produce ${produccionNegocio(neg.nivel)} 🪙/día</p>` : ''}
      <p><a href="#" data-act="mi-casa">📍 Ver mi casa en el mapa</a></p>` : '<p class="mono">Tu casa aparecerá en la próxima actualización.</p>'}
      ${pend ? '' : tienda(look, p)}
      ${pend || !r ? '' : `<h3>Mudarme</h3><form class="form" data-form="mudanza"><label>Nueva zona<select name="z">${ZONES.filter((z) => z.id !== r.zone).map((z) => `<option value="${z.id}">${esc(zoneName(s, z.id))}</option>`).join('')}</select></label>
        <button class="btn sec">Pedir mudanza (gratis)</button></form><p class="mono">Tu parcela antigua queda vacía como recuerdo. También puedes comentar «me mudo a ZONA» en el último Reel.</p>`}
      ${(p.solicitudes || []).length ? `<h3>Mis solicitudes</h3>${p.solicitudes.map((q) => `<div class="res"><span>${TIPO[q.tipo] || esc(q.tipo)}${q.datos?.pregunta ? ` «${esc(q.datos.pregunta)}»` : q.datos?.nombre ? ` «${esc(q.datos.nombre)}»` : ''}${q.costo ? ` · ${q.costo} 🪙` : ''}</span><span class="mono">${ESTADO[q.estado] || esc(q.estado)}${q.motivo ? ` · ${esc(q.motivo)}` : ''}</span></div>`).join('')}` : ''}
      <p><button class="btn sec" data-act="refrescar">↻ Actualizar</button> <button class="btn sec" data-act="salir">Salir</button></p>`;
  };
  const precio = (cambios) => Object.entries(cambios).reduce((t, [k, v]) => t + (k === 'hat' ? (TIENDA.hat[v === 'ninguno' ? 'null' : v] ?? 10) : k === 'hairStyle' ? (TIENDA.hairStyle[v] ?? 5) : TIENDA.color), 0);
  const tienda = (look) => `<h3>Tienda de aspecto</h3>
    <form class="form" data-form="aspecto">
      <label>Sombrero<select name="hat"><option value="">— igual —</option>${['gorra', 'sombrero', 'gorro', 'corona', 'ninguno'].map((h) => `<option value="${h}">${h} · ${TIENDA.hat[h === 'ninguno' ? 'null' : h]} 🪙</option>`).join('')}</select></label>
      <label>Peinado<select name="hairStyle"><option value="">— igual —</option>${Object.entries(TIENDA.hairStyle).map(([h, c]) => `<option value="${h}">${h} · ${c} 🪙</option>`).join('')}</select></label>
      <div class="row colores">
        <label>Pelo<input type="color" name="hair" value="${esc(look.hair || '#3b2a20')}" data-orig="${esc(look.hair || '#3b2a20')}"></label>
        <label>Camiseta<input type="color" name="shirt" value="${esc(look.shirt || '#e76f51')}" data-orig="${esc(look.shirt || '#e76f51')}"></label>
        <label>Pantalón<input type="color" name="pants" value="${esc(look.pants || '#264653')}" data-orig="${esc(look.pants || '#264653')}"></label>
      </div>
      <button class="btn" data-precio>Comprar · 0 🪙</button>
      <p class="mono">Cada color cuesta ${TIENDA.color} 🪙. Tu personaje cambia en la próxima actualización (queda en la historia).</p>
    </form>`;
  const cambiosAspecto = (f) => {
    const out = {};
    for (const k of ['hat', 'hairStyle']) if (f[k].value) out[k] = f[k].value;
    for (const k of ['hair', 'shirt', 'pants']) if (f[k].value.toLowerCase() !== f[k].dataset.orig.toLowerCase()) out[k] = f[k].value;
    return out;
  };

  // ---------- 🏪 Negocios ----------
  const negocios = () => {
    const c = cuenta(); const r = yo(); const mio = c && s.negocios.find((n) => n.handle === c.handle);
    const lista = [...s.negocios].sort((a, b) => b.nivel - a.nivel || a.desde - b.desde);
    return `<h2>🏪 Negocios</h2>
      <p>Cualquier habitante puede abrir su emprendimiento en la <b>Calle del Comercio</b> (junto al puente, camino a la playa). Producen poco y siempre: <b>${produccionNegocio(1)} 🪙/día</b> en nivel 1, una más por cada nivel.</p>
      <p>🏢 <b>¿Quieres un edificio? Un edificio es un negocio.</b> Ábrelo aquí (o comenta «quiero un edificio» / «quiero abrir un restaurante» en el Reel). Según el rubro se construye un <b>puesto</b>, un <b>restaurante</b> con mesas en la vereda o un <b>edificio</b> que gana un piso por nivel.</p>
      <p><a href="#" data-act="ver-comercio">📍 Ir a la Calle del Comercio</a></p>
      <h3>Precios</h3><p class="mono">${[1, 2, 3, 4, 5].map((n) => `nivel ${n}: ${costoNegocio(n)} 🪙 → ${produccionNegocio(n)} 🪙/día`).join(' · ')}</p>
      ${!c ? login('Entra para abrir el tuyo.') : !r ? '<p>Tu casa aún no está en la isla.</p>' : c.perfil?.estado !== 'verificada' ? '<p class="mono">Verifica tu cuenta (pestaña Perfil) para invertir.</p>' : `
      <h3>${mio ? `Tu negocio: «${esc(mio.nombre)}» (nivel ${mio.nivel})` : 'Abrir mi negocio'}</h3>
      <form class="form" data-form="negocio">
        <label>Nombre<input name="nombre" maxlength="28" required value="${esc(mio?.nombre || '')}" placeholder="Cocos Express"></label>
        <label>Rubro (opcional)<input name="rubro" maxlength="24" value="${esc(mio?.rubro || '')}" placeholder="edificio, restaurante, tienda, hotel…" list="rubros"><datalist id="rubros"><option value="edificio"><option value="restaurante"><option value="tienda"><option value="hotel"><option value="café"><option value="panadería"></datalist></label>
        <label>Color<input type="color" name="color" value="${esc(mio?.color || '#e76f51')}"></label>
        <button class="btn">${mio ? `Subir a nivel ${mio.nivel + 1} · ${costoNegocio(mio.nivel + 1)} 🪙` : `Abrir · ${costoNegocio(1)} 🪙`}</button>
      </form>`}
      <h3>En la calle (${lista.length})</h3>
      ${lista.length ? lista.map((n) => `<div class="res" data-h="${esc(n.handle)}"><span><i class="dot" style="background:${esc(n.color)}"></i> «${esc(n.nombre)}»${n.rubro ? ` · ${esc(n.rubro)}` : ''}</span><span class="mono">@${esc(n.handle)} · nv ${n.nivel} · ${produccionNegocio(n.nivel)} 🪙/día</span></div>`).join('') : '<p class="mono">Todavía ninguno. El primero quedará en la historia.</p>'}`;
  };

  // ---------- 🏛️ Democracia y juntas (dentro de la pestaña Votación) ----------
  const democracia = () => {
    const c = cuenta(); const r = yo(); const ok = c && r && c.perfil?.estado === 'verificada';
    const zona = r ? zoneName(s, r.zone) : 'tu zona';
    return `<h2>🏛️ Democracia y juntas vecinales</h2>
      <p>Cualquier habitante puede convocar una votación <b>SÍ/NO</b> pagando monedas: una <b>Democracia</b> (vota toda la isla, ${COSTO_DEMOCRACIA} 🪙) o una <b>Junta vecinal</b> (solo vota tu zona, ${COSTO_JUNTA} 🪙). Duran hasta el siguiente vídeo; si gana el SÍ, se hace.</p>
      <div id="webVotos"><p class="mono">Cargando votaciones…</p></div>
      ${!c ? login('Entra para votar o convocar.') : !ok ? '<p class="mono">Verifica tu cuenta (pestaña Perfil) para votar o convocar.</p>' : `
      <h3>Convocar</h3>
      <form class="form" data-form="convocar">
        <label>Tipo<select name="tipo"><option value="democracia">🏛️ Democracia · toda la isla · ${COSTO_DEMOCRACIA} 🪙</option><option value="junta">🏘️ Junta vecinal · ${esc(zona)} · ${COSTO_JUNTA} 🪙</option></select></label>
        <label>Pregunta<input name="pregunta" maxlength="120" required placeholder="¿Construimos un hospital?"></label>
        <label>Si gana el SÍ…<select name="efecto"><option value="">Lo decide el narrador (cambio, elecciones, ley…)</option>
          ${Object.entries(EDIFICIOS).filter(([k]) => !s.buildings.some((b) => b.kind === k)).map(([k, l]) => `<option value="construir:${k}:${esc(l)}">Construir: ${esc(l)}</option>`).join('')}
          <option value="zona-nombre">Junta: ponerle nombre a ${esc(zona)}</option></select></label>
        <label class="hidden" data-nombre-zona>Nombre para la zona<input name="nombreZona" maxlength="24"></label>
        <button class="btn">Convocar</button>
      </form>`}`;
  };
  const pintarVotos = async () => {
    const el = document.getElementById('webVotos'); if (!el) return;
    if (!cuentasActivas) { el.innerHTML = ''; return; }
    try {
      const vs = await votacionesWeb(); const c = cuenta(); const r = yo(); const mis = c?.perfil?.votos || {};
      el.innerHTML = vs.length ? vs.map((v) => {
        const tot = (v.si + v.no) || 1; const puede = c && r && (v.ambito === 'global' || v.ambito === `zona:${r.zone}`);
        const lugar = v.ambito === 'global' ? 'toda la isla' : zoneName(s, v.ambito.slice(5));
        return `<div class="entry"><div class="meta">${v.ambito === 'global' ? '🏛️ Democracia' : '🏘️ Junta vecinal'} · vota ${esc(lugar)}${v.autor ? ` · convocó @${esc(v.autor)}` : ''}</div><b>${esc(v.pregunta)}</b>
          <div class="opt">✅ SÍ <div class="bar"><i style="width:${(v.si / tot) * 100}%"></i></div><span class="mono">${v.si}</span></div>
          <div class="opt">❌ NO <div class="bar"><i style="width:${(v.no / tot) * 100}%"></i></div><span class="mono">${v.no}</span></div>
          ${puede ? `<div class="row"><button class="btn${mis[v.id] === 'si' ? '' : ' sec'}" data-act="votar" data-v="${esc(v.id)}" data-o="si">Voto SÍ</button><button class="btn${mis[v.id] === 'no' ? '' : ' sec'}" data-act="votar" data-v="${esc(v.id)}" data-o="no">Voto NO</button></div>` : ''}</div>`;
      }).join('') : '<p class="mono">No hay ninguna abierta ahora mismo.</p>';
    } catch (e) { el.innerHTML = `<p class="mono">No se pudieron cargar: ${esc(e.message)}</p>`; }
  };

  // ---------- acciones ----------
  const ocupado = (btn, on) => { if (btn) { btn.disabled = on; btn.classList.toggle('cargando', on); } };
  async function accion(e) {
    const a = e.target.closest('[data-act]'); const f = e.target.closest('form[data-form]');
    if (a) {
      e.preventDefault(); const act = a.dataset.act;
      try {
        if (act === 'ir-perfil') return reabrir('perfil');
        if (act === 'salir') { salir(); return reabrir('perfil'); }
        if (act === 'refrescar') { ocupado(a, true); await refrescar(); return reabrir('perfil'); }
        if (act === 'mi-casa') return findHouse(cuenta().handle);
        if (act === 'ver-comercio') { const p = world.figurePos.clone().set(COMERCIO.x0 - 6, world.height(COMERCIO.x0 - 6, COMERCIO.z), COMERCIO.z); return world.flyTo(p, 18); }
        if (act === 'votar') { ocupado(a, true); await votar(a.dataset.v, a.dataset.o); toast('🗳️ Voto guardado. Puedes cambiarlo hasta que cierre.'); return pintarVotos(); }
      } catch (err) { toast(`⚠️ ${err.message}`); ocupado(a, false); }
    }
  }
  async function enviar(e) {
    const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
    const btn = e.submitter || f.querySelector('button'); ocupado(btn, true);
    try {
      switch (f.dataset.form) {
        case 'entrar': {
          const crear = btn?.dataset.modo === 'crear';
          const p = crear ? await crearCuenta(f.h.value, f.p.value) : await entrar(f.h.value, f.p.value);
          toast(crear ? '🏠 Cuenta creada. Falta verificarla con tu código.' : p.estado === 'pendiente' ? 'Entraste. Falta verificar tu cuenta.' : `👋 Hola, @${p.handle}`);
          return reabrir('perfil');
        }
        case 'aspecto': {
          const c = cambiosAspecto(f); if (!Object.keys(c).length) throw new Error('Elige algún cambio.');
          const r = await solicitar('aspecto', c); toast(`👕 Pedido: ${r.costo} 🪙. Lo verás en la próxima actualización.`); return reabrir('perfil');
        }
        case 'mudanza': { await solicitar('mudanza', { zona: f.z.value }); toast('🏠 Mudanza pedida.'); return reabrir('perfil'); }
        case 'negocio': {
          const r = await solicitar('negocio', { nombre: f.nombre.value.trim(), rubro: f.rubro.value.trim(), color: f.color.value });
          toast(`🏪 Inversión de ${r.costo} 🪙 registrada: abre en la próxima actualización.`); return reabrir('negocios');
        }
        case 'convocar': {
          let ef = f.efecto.value;
          if (ef === 'zona-nombre') { if (f.tipo.value !== 'junta') throw new Error('Nombrar la zona es cosa de una junta vecinal.'); ef = `zona-nombre:${f.nombreZona.value.trim()}`; }
          const r = await solicitar(f.tipo.value, { pregunta: f.pregunta.value.trim(), ...(ef ? { efecto: ef } : {}) });
          toast(`📣 Convocada (${r.costo} 🪙). Se abre en la próxima actualización.`); return reabrir('votacion');
        }
      }
    } catch (err) { toast(`⚠️ ${err.message}`); } finally { ocupado(btn, false); }
  }
  function cambio(e) {
    const f = e.target.closest('form[data-form]'); if (!f) return;
    if (f.dataset.form === 'aspecto') { const b = f.querySelector('[data-precio]'); b.textContent = `Comprar · ${precio(cambiosAspecto(f))} 🪙`; }
    if (f.dataset.form === 'convocar') f.querySelector('[data-nombre-zona]').classList.toggle('hidden', f.efecto.value !== 'zona-nombre');
  }
  const body = document.getElementById('panelBody');
  body.addEventListener('click', accion); body.addEventListener('submit', enviar); body.addEventListener('input', cambio); body.addEventListener('change', cambio);
  return { perfil, negocios, democracia, pintarVotos };
}
