/* Gestión del Dinero · seguridad y privacidad
   - Bloqueo con código y Face ID (passkey del propio iPhone).
   - Importes ocultos al abrir; se muestran con el interruptor del ojo o sacudiendo el móvil.
   Ajustes en IndexedDB «local/seguridad» (solo de este teléfono, no va en las copias). */
(function () {
  'use strict';
  const DOC = 'local/seguridad';
  const DEF = { ocultar: true, sacudir: true, bloqueo: 0, pinHash: null, salt: null, pinLen: 0, credId: null };
  let cfg = { ...DEF };
  let ready = false;
  const $id = (id) => document.getElementById(id);
  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };

  /* ---------- Estilos ---------- */
  const css = `
  .eye{position:relative;width:76px;height:44px;border-radius:999px;border:1px solid var(--line);background:var(--surface);padding:0;cursor:pointer;touch-action:none;flex:none}
  .eye .knob{position:absolute;top:5px;left:5px;width:32px;height:32px;border-radius:50%;background:var(--sunk);color:var(--muted);display:grid;place-items:center;transition:transform .18s ease,background .18s}
  .eye .knob svg{width:18px;height:18px}
  .eye[aria-checked="true"]{background:var(--accent-soft);border-color:var(--accent)}
  .eye[aria-checked="true"] .knob{transform:translateX(32px);background:var(--accent);color:#fff}
  .eye.drag .knob{transition:none}
  #lock{position:fixed;inset:0;z-index:100;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:calc(24px + env(safe-area-inset-top,0px)) 24px calc(24px + env(safe-area-inset-bottom,0px))}
  #lock .lg{width:72px;height:72px;border-radius:20px;overflow:hidden}
  #lock .lg img{width:100%;height:100%;display:block}
  #lock h2{margin:0;font-size:20px;font-weight:800}
  #lock .msg{font-size:14px;color:var(--muted);min-height:20px;text-align:center}
  #lock .dots{display:flex;gap:14px}
  #lock .dots i{width:14px;height:14px;border-radius:50%;border:2px solid var(--muted)}
  #lock .dots i.on{background:var(--ink);border-color:var(--ink)}
  #lock .dots.err{animation:shk .35s}
  @keyframes shk{20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
  #lock .pad{display:grid;grid-template-columns:repeat(3,76px);gap:14px 22px}
  #lock .pad button{width:76px;height:76px;border-radius:50%;border:0;background:var(--surface);color:var(--ink);font:700 28px var(--f-body);cursor:pointer;display:grid;place-items:center}
  #lock .pad button.alt{background:none;font-size:14px;color:var(--accent-tx)}
  #lock .pad button.alt svg{width:30px;height:30px}
  #lock .pad button:disabled{visibility:hidden}
  #lock .cancel{border:0;background:none;color:var(--muted);font:600 14px var(--f-body);min-height:44px;cursor:pointer}
  .tgl{width:52px;height:32px;border-radius:999px;border:0;background:var(--sunk);position:relative;cursor:pointer;flex:none}
  .tgl::after{content:"";position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:50%;background:#fff;transition:left .15s}
  .tgl[aria-checked="true"]{background:var(--accent)}
  .tgl[aria-checked="true"]::after{left:23px}
  .segrow{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px}
  .segrow > div{min-width:0}
  .segrow b{font-weight:700}
  .segrow small{display:block;font-size:12px;color:var(--muted)}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a10 10 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const FACE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9v1M15 9v1M12 9v4h-1M9 16a4 4 0 0 0 6 0"/></svg>';

  /* ---------- Importes ocultos ---------- */
  S.oculto = ls.get('gd-ocultar') !== '0';
  const moneyOrig = window.money;
  window.money = function (n, opt) {
    const r = moneyOrig(n, opt);
    return S.oculto && r !== '—' ? r.replace(/\d[\d.,]*/, '•••') : r;
  };
  function setOculto(v, aviso) {
    if (S.oculto === v) return;
    S.oculto = v; pintaOjo();
    if (!document.getElementById('sheetHost').innerHTML) render();
    if (aviso) toast(v ? 'Importes ocultos' : 'Importes visibles');
  }
  window.toggleOculto = () => setOculto(!S.oculto, true);

  // Interruptor del ojo en la cabecera: se toca o se arrastra a izquierda/derecha
  const eye = document.createElement('button');
  eye.type = 'button'; eye.className = 'eye'; eye.setAttribute('role', 'switch');
  eye.innerHTML = '<span class="knob"></span>';
  const acts = document.querySelector('header.top .top-actions');
  if (acts) acts.insertBefore(eye, acts.firstChild);
  function pintaOjo() {
    eye.setAttribute('aria-checked', String(!S.oculto));
    eye.setAttribute('aria-label', S.oculto ? 'Mostrar importes' : 'Ocultar importes');
    eye.querySelector('.knob').innerHTML = S.oculto ? EYE_OFF : EYE;
    eye.querySelector('.knob').style.transform = '';
  }
  pintaOjo();
  let drag = null;
  eye.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, moved: false, start: S.oculto ? 0 : 32 }; eye.setPointerCapture(e.pointerId); });
  eye.addEventListener('pointermove', (e) => {
    if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 4) drag.moved = true;
    if (drag.moved) { eye.classList.add('drag'); eye.querySelector('.knob').style.transform = 'translateX(' + Math.max(0, Math.min(32, drag.start + dx)) + 'px)'; }
  });
  eye.addEventListener('pointerup', (e) => {
    if (!drag) return; const d = drag; drag = null; eye.classList.remove('drag');
    if (d.moved) { const pos = Math.max(0, Math.min(32, d.start + e.clientX - d.x)); setOculto(pos < 16); pintaOjo(); }
    else setOculto(!S.oculto);
    pedirMovimiento();
  });
  eye.addEventListener('pointercancel', () => { drag = null; eye.classList.remove('drag'); pintaOjo(); });
  eye.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOculto(!S.oculto); } });

  /* ---------- Sacudir para mostrar u ocultar ---------- */
  let motionOk = false, picos = [], espera = 0;
  function onMotion(e) {
    const a = e.accelerationIncludingGravity || e.acceleration; if (!a || !cfg.sacudir) return;
    const g = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
    const now = Date.now(); if (now < espera) return;
    if (Math.abs(g - 9.81) > 14) { picos = picos.filter((t) => now - t < 900); picos.push(now); }
    if (picos.length >= 3) { picos = []; espera = now + 1500; if (!document.getElementById('lock')) window.toggleOculto(); }
  }
  function activarMovimiento() { if (motionOk) return; motionOk = true; window.addEventListener('devicemotion', onMotion); }
  function pedirMovimiento() {
    if (motionOk || !cfg.sacudir || typeof DeviceMotionEvent === 'undefined') return;
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      DeviceMotionEvent.requestPermission().then((r) => { if (r === 'granted') activarMovimiento(); }).catch(() => {});
    } else activarMovimiento();
  }
  // iOS solo deja pedir el permiso tras un toque: se pide en el primer toque de cada apertura
  document.addEventListener('click', pedirMovimiento, { once: true, capture: true });

  /* ---------- Código ---------- */
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
  async function hash(pin, salt) { return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin))); }
  async function guarda() {
    await window.LOCAL_DB.setDoc(DOC, cfg);
    ls.set('gd-lock', cfg.pinHash ? '1' : null);
    ls.set('gd-ocultar', cfg.ocultar ? '1' : '0');
  }

  /* ---------- Face ID (passkey de este iPhone) ---------- */
  async function faceDisponible() {
    try { return !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { return false; }
  }
  async function faceRegistrar() {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: rnd(32), rp: { name: 'Gestión del Dinero', id: location.hostname },
      user: { id: rnd(16), name: 'gestion-del-dinero', displayName: 'Gestión del Dinero' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
    } });
    return b64(cred.rawId);
  }
  async function faceComprobar() {
    const r = await navigator.credentials.get({ publicKey: {
      challenge: rnd(32), rpId: location.hostname, timeout: 60000, userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: unb64(cfg.credId), transports: ['internal', 'hybrid'] }],
    } });
    const flags = new Uint8Array(r.response.authenticatorData)[32];
    return !!(flags & 0x04); // el usuario se ha verificado (Face ID o código del iPhone)
  }

  /* ---------- Pantalla de bloqueo / teclado ---------- */
  let fallos = 0, bloqueadoHasta = 0;
  function pantalla({ titulo, msg, onPin, onFace, onCancel, len }) {
    const prev = $id('lock'); if (prev) prev.remove();
    const el = document.createElement('div'); el.id = 'lock'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
    el.innerHTML = `<div class="lg"><img src="icons/icon-192.png" alt=""></div><h2>${titulo}</h2><div class="msg">${msg || ''}</div>
      <div class="dots" aria-hidden="true">${'<i></i>'.repeat(len)}</div>
      <div class="pad">${[1,2,3,4,5,6,7,8,9].map((n) => `<button type="button" data-n="${n}">${n}</button>`).join('')}
      <button type="button" class="alt" data-a="face" ${onFace ? '' : 'disabled'} aria-label="Desbloquear con Face ID">${FACE}</button>
      <button type="button" data-n="0">0</button><button type="button" class="alt" data-a="del" aria-label="Borrar">⌫</button></div>
      ${onCancel ? '<button type="button" class="cancel" data-a="cancel">Cancelar</button>' : ''}`;
    document.body.appendChild(el);
    let pin = '';
    const dots = el.querySelector('.dots');
    const pinta = () => dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < pin.length));
    el.setMsg = (t, err) => { el.querySelector('.msg').textContent = t; if (err) { dots.classList.remove('err'); void dots.offsetWidth; dots.classList.add('err'); } };
    el.reset = () => { pin = ''; pinta(); };
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'del') { pin = pin.slice(0, -1); pinta(); return; }
      if (b.dataset.a === 'face') { onFace && onFace(el); return; }
      if (b.dataset.a === 'cancel') { cerrarPantalla(); onCancel(); return; }
      if (b.dataset.n == null || pin.length >= len) return;
      pin += b.dataset.n; pinta();
      if (pin.length === len) { const p = pin; setTimeout(() => onPin(p, el), 120); }
    });
    return el;
  }
  function cerrarPantalla() { const l = $id('lock'); if (l) l.remove(); document.documentElement.classList.remove('locked'); }

  async function desbloquearFace(el, auto) {
    try { if (await faceComprobar()) { fallos = 0; cerrarPantalla(); if (!document.getElementById('sheetHost').innerHTML) render(); return; } }
    catch (e) { if (el) el.setMsg(auto ? 'Toca el icono de Face ID o escribe tu código' : 'Face ID no disponible ahora. Usa tu código.'); }
  }
  function bloquear() {
    if (!cfg.pinHash || $id('lock')) return;
    document.documentElement.classList.add('locked');
    if (cfg.ocultar) { S.oculto = true; pintaOjo(); }
    const el = pantalla({
      titulo: 'Gestión del Dinero', msg: 'Introduce tu código', len: cfg.pinLen,
      onFace: cfg.credId ? desbloquearFace : null,
      onPin: async (p, el) => {
        if (Date.now() < bloqueadoHasta) { el.reset(); el.setMsg('Espera unos segundos e inténtalo de nuevo.', true); return; }
        if (await hash(p, cfg.salt) === cfg.pinHash) { fallos = 0; cerrarPantalla(); if (!document.getElementById('sheetHost').innerHTML) render(); return; }
        fallos++; el.reset();
        if (fallos >= 5) { bloqueadoHasta = Date.now() + 30000; fallos = 0; el.setMsg('Demasiados intentos. Espera 30 segundos.', true); }
        else el.setMsg('Código incorrecto', true);
      },
    });
    if (cfg.credId) desbloquearFace(el, true); // Face ID directamente; si iOS pide un toque, queda el botón
  }

  /* ---------- Cuándo bloquear y ocultar ---------- */
  let ocultoDesde = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      ocultoDesde = Date.now();
      if (cfg.pinHash && Number(cfg.bloqueo) === 0) bloquear();
      if (cfg.ocultar && !S.oculto) { S.oculto = true; pintaOjo(); render(); }
    } else if (cfg.pinHash && Date.now() - ocultoDesde >= Number(cfg.bloqueo) * 60000) bloquear();
  });

  /* ---------- Ajustes ---------- */
  window.segHTML = function () {
    const sw = (on, fn, label) => `<button class="tgl" type="button" role="switch" aria-checked="${on}" aria-label="${label}" onclick="${fn}"></button>`;
    return `<h2 class="sec" id="aj-seguridad">Seguridad y privacidad</h2>
    <section class="card">
      <div class="segrow"><div><b>Código de acceso</b><small>${cfg.pinHash ? 'Activado · ' + cfg.pinLen + ' cifras' : 'Pide un código al abrir la app'}</small></div>
        <div class="row" style="gap:8px;flex:none">${cfg.pinHash ? '<button class="btn" type="button" onclick="segPin()">Cambiar</button><button class="btn ghost" type="button" onclick="segQuitarPin()">Quitar</button>' : '<button class="btn primary" type="button" onclick="segPin()">Activar</button>'}</div></div>
      <div class="segrow" id="segFace"><div><b>Face ID</b><small>${cfg.credId ? 'Activado' : cfg.pinHash ? 'Desbloquea sin escribir el código' : 'Primero activa un código'}</small></div>
        ${cfg.credId ? '<button class="btn ghost" type="button" onclick="segFace(false)">Quitar</button>' : `<button class="btn" type="button" onclick="segFace(true)" ${cfg.pinHash ? '' : 'disabled'}>Activar</button>`}</div>
      <div class="field"><label for="segBloq">Bloquear al salir de la app</label><select id="segBloq" onchange="segSet('bloqueo', +this.value)" ${cfg.pinHash ? '' : 'disabled'}>
        ${[[0, 'Al momento'], [1, 'Tras 1 minuto'], [5, 'Tras 5 minutos'], [15, 'Tras 15 minutos']].map(([v, l]) => `<option value="${v}" ${Number(cfg.bloqueo) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="segrow"><div><b>Ocultar importes al abrir</b><small>Se ven con el ojo de arriba o sacudiendo el móvil</small></div>${sw(cfg.ocultar, "segSet('ocultar', !(this.getAttribute('aria-checked')==='true'))", 'Ocultar importes al abrir')}</div>
      <div class="segrow"><div><b>Sacudir para mostrar u ocultar</b><small>Agita el móvil con fuerza dos o tres veces</small></div>${sw(cfg.sacudir, "segSet('sacudir', !(this.getAttribute('aria-checked')==='true'))", 'Sacudir para mostrar u ocultar')}</div>
      <div class="hint">El código y Face ID impiden que otra persona abra la app en tu móvil. Solo se guardan en este teléfono: no van en las copias de seguridad.</div>
    </section>`;
  };
  window.segResumen = () => [cfg.pinHash ? (cfg.credId ? 'Face ID y código' : 'Código') : 'Sin bloqueo', cfg.ocultar ? 'importes ocultos' : 'importes visibles'].join(' · ');
  window.segSet = async (k, v) => { cfg[k] = v; await guarda(); if (k === 'sacudir' && v) pedirMovimiento(); render(); };
  window.segPin = function () {
    const len = 4;
    let primero = null;
    pantalla({ titulo: cfg.pinHash ? 'Nuevo código' : 'Crea un código', msg: 'Elige 4 cifras', len, onCancel: () => render(),
      onPin: async (p, el) => {
        if (!primero) { primero = p; el.reset(); el.setMsg('Repítelo para confirmar'); return; }
        if (p !== primero) { primero = null; el.reset(); el.setMsg('No coinciden. Vuelve a elegir 4 cifras.', true); return; }
        cfg.salt = b64(rnd(16)); cfg.pinHash = await hash(p, cfg.salt); cfg.pinLen = len;
        await guarda(); cerrarPantalla(); render(); toast('Código activado');
      } });
  };
  window.segQuitarPin = async function () {
    if (!confirm('¿Quitar el código? La app se abrirá sin pedir nada.')) return;
    cfg.pinHash = null; cfg.salt = null; cfg.pinLen = 0; cfg.credId = null; await guarda(); render(); toast('Código quitado');
  };
  window.segFace = async function (on) {
    if (!on) { cfg.credId = null; await guarda(); render(); return; }
    if (!(await faceDisponible())) { toast('Este dispositivo no permite usar Face ID aquí.'); return; }
    try { cfg.credId = await faceRegistrar(); await guarda(); render(); toast('Face ID activado'); }
    catch (e) { toast(e && e.name === 'NotAllowedError' ? 'Se ha cancelado la activación de Face ID.' : 'No se ha podido activar Face ID.'); }
  };

  /* ---------- Arranque ---------- */
  (async () => {
    try { const d = await window.LOCAL_DB.getDoc(DOC); if (d) cfg = { ...DEF, ...d }; } catch (e) {}
    ready = true;
    ls.set('gd-lock', cfg.pinHash ? '1' : null);
    if (cfg.ocultar === false && ls.get('gd-ocultar') !== '0') { ls.set('gd-ocultar', '0'); }
    if (cfg.pinHash) bloquear(); else document.documentElement.classList.remove('locked');
    if (!cfg.ocultar && S.oculto) { S.oculto = false; pintaOjo(); render(); }
  })();
})();
