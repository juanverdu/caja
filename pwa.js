/* Gestión del Dinero · funciones de la versión instalable
   (copia de seguridad, datos del titular, actualizaciones). Se carga después de la app. */
(function () {
  'use strict';

  /* ---------- Sin zoom: ni pellizcar ni doble toque ---------- */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));
  document.addEventListener('touchmove', (e) => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, { passive: false });
  let ultimoToque = 0;
  document.addEventListener('touchend', (e) => {
    const t = Date.now();
    if (t - ultimoToque < 300 && !(e.target.closest && e.target.closest('input,select,textarea,button,a,label,[role="switch"]'))) e.preventDefault();
    ultimoToque = t;
  }, { passive: false });

  /* ---------- Pegar un extracto ---------- */
  // Tabla en texto (copiada de Excel/Numbers o de la web del banco) → filas como las del Excel
  window.tablaTexto = function (txt) {
    const lines = String(txt).replace(/\r/g, '').split('\n').filter((l) => l.trim());
    const sep = lines.some((l) => l.includes('\t')) ? '\t' : lines.some((l) => l.split(';').length > 3) ? ';' : ',';
    const rows = lines.map((l) => l.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1')));
    const esFecha = (c) => /^\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}$/.test(String(c || '').trim());
    if (!rows.some((r) => r.some((c) => /^fecha operaci/i.test(c)))) {
      const datos = rows.filter((r) => esFecha(r[0]));
      if (datos.length) {
        const w = datos[0].length;
        const head = esFecha(datos[0][1]) ? ['Fecha operación', 'Fecha valor', 'Concepto', 'Importe', 'Saldo'] : ['Fecha operación', 'Concepto', 'Importe', 'Saldo'];
        rows.unshift(head.slice(0, Math.max(4, Math.min(head.length, w))));
      }
    }
    return rows;
  };
  async function pegarTexto(txt) {
    if (txt && /\n/.test(txt.trim()) && /\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}/.test(txt)) { importFile(new File([txt], 'pegado.tsv', { type: 'text/tab-separated-values' })); return true; }
    return false;
  }
  window.pegarExtracto = async function () {
    try {
      if (navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const it of items) {
          const t = it.types.find((x) => /sheet|excel|csv|octet-stream|zip/i.test(x));
          if (t) { const blob = await it.getType(t); importFile(new File([blob], /csv/i.test(t) ? 'pegado.csv' : 'pegado.xlsx', { type: t })); return; }
        }
        for (const it of items) if (it.types.includes('text/plain')) { if (await pegarTexto(await (await it.getType('text/plain')).text())) return; }
      } else if (navigator.clipboard && navigator.clipboard.readText) {
        if (await pegarTexto(await navigator.clipboard.readText())) return;
      }
      toast('Lo que has copiado no es un extracto. Copia el archivo Excel del banco o las filas de movimientos y vuelve a pulsar Pegar.');
    } catch (e) {
      toast('El iPhone no ha dejado leer lo copiado. Pulsa «Pegar» en el aviso que aparece o usa Extracto.');
    }
  };
  // Con teclado (iPad, ordenador): pegar en cualquier sitio también importa
  document.addEventListener('paste', (e) => {
    const a = document.activeElement; if (a && /INPUT|TEXTAREA/.test(a.tagName)) return;
    const f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0];
    if (f) { e.preventDefault(); importFile(f); return; }
    const t = e.clipboardData && e.clipboardData.getData('text/plain');
    if (t) pegarTexto(t).then((ok) => { if (ok) e.preventDefault(); });
  });

  /* ---------- Copia de seguridad ---------- */
  const hoy = () => new Date().toISOString().slice(0, 10);
  window.backupExport = async function () {
    try {
      const data = await window.LOCAL_DB.dump();
      const name = 'gestion-dinero-copia-' + hoy() + '.json';
      const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); }
        catch (e) { if (e && e.name === 'AbortError') return; throw e; }
      } else {
        const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name;
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
      try { S.cfg.ultimaCopia = hoy(); await saveCfg(); } catch (e) {}
      toast('Copia lista. Guárdala en Archivos o en iCloud Drive.');
    } catch (e) { console.error(e); toast('No se ha podido crear la copia.'); }
  };
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.json,application/json'; inp.hidden = true;
  document.body.appendChild(inp);
  window.backupPick = function () { inp.value = ''; inp.click(); };
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const n = Object.keys((data && data.docs) || {}).length;
      if (!n) { toast('Ese archivo no es una copia de esta app.'); return; }
      const hay = await window.LOCAL_DB.count();
      if (hay && !confirm('Se sustituirán los datos que hay ahora en la app por los de la copia. ¿Continuar?')) return;
      await window.LOCAL_DB.restore(data);
      toast('Copia restaurada.');
      setTimeout(() => location.reload(), 600);
    } catch (e) { console.error(e); toast('No he podido leer la copia.'); }
  });

  /* ---------- Datos para reconocer tus movimientos ---------- */
  window.savePerfil = function () {
    const v = (id) => (document.getElementById(id) || {}).value || '';
    S.cfg.yo = { santander: v('yoS').trim().toUpperCase(), tr: v('yoT').trim(), empresa: v('yoE').trim().toUpperCase(), empresaNombre: v('yoN').trim() };
    saveCfg().then(() => { toast('Guardado.'); render(); });
  };

  /* ---------- Ajustes: menú por apartados ---------- */
  const IC = {
    nomina: 'M4 7h16v12H4zM9 7V5h6v2M4 12h16',
    ahorro: 'M5 11a7 6 0 0 1 13-2h2v4h-2a7 6 0 0 1-3 3v3h-3v-2H9v2H6v-3a6 6 0 0 1-1-5zM15 10h.01',
    cuotas: 'M4 12a8 8 0 0 1 14-5l2 2M20 12a8 8 0 0 1-14 5l-2-2M18 4v5h-5M6 20v-5h5',
    reparto: 'M12 3v18M5 8h11a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h11',
    vehiculos: 'M5 16l1.5-5A2 2 0 0 1 8.4 9.6h7.2a2 2 0 0 1 1.9 1.4L19 16v3h-2v-2H7v2H5zM7.5 14h.01M16.5 14h.01',
    huchas: 'M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6',
    limites: 'M12 4l9 16H3zM12 10v4M12 17h.01',
    reglas: 'M4 6h16M4 12h10M4 18h6',
    datos: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
    copia: 'M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 10a4 4 0 0 1-1 8H7z',
    titular: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8M4 20a8 8 0 0 1 16 0',
    seguridad: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3M12 15v2',
  };
  function infoSec(t) {
    const c = S.cfg || {}; const n = c.nomina || {}; const T = t.toLowerCase();
    const cnt = (a, s1, s2) => { const k = (a || []).length; return k + ' ' + (k === 1 ? s1 : s2); };
    try {
      if (T.startsWith('nómina')) return ['nomina', money(n.base) + ' · guardia cada ' + n.cadaSemanas + ' semanas'];
      if (T.startsWith('ahorro')) return ['ahorro', 'Ahorro ' + money(saldoAhorro()) + ' · Trade Republic'];
      if (T.startsWith('cuotas')) return ['cuotas', cnt((c.fijos || []).filter((f) => f.activo !== false), 'activa', 'activas')];
      if (T.startsWith('reparto')) return ['reparto', 'Colchón ' + money((c.reparto || {}).colchon, { dec: 0 }) + ' · ' + ((c.reparto || {}).pctAhorro ?? 50) + ' % a ahorro'];
      if (T.startsWith('vehículos')) return ['vehiculos', cnt((c.vehiculos || {}).seguros, 'seguro', 'seguros')];
      if (T.startsWith('huchas')) return ['huchas', cnt(c.huchas, 'hucha', 'huchas')];
      if (T.startsWith('límites')) return ['limites', cnt(c.limites, 'límite', 'límites')];
      if (T.startsWith('reglas')) return ['reglas', cnt(c.reglas, 'regla', 'reglas')];
      if (T.startsWith('datos')) return ['datos', todosMovs().length + ' movimientos · importar extractos'];
      if (T.startsWith('seguridad')) return ['seguridad', (window.segResumen && segResumen()) || 'Código, Face ID e importes ocultos'];
      if (T.startsWith('copia')) return ['copia', c.ultimaCopia ? 'Última: ' + fshort(parseD(c.ultimaCopia)) : 'Aún no has guardado ninguna'];
      if (T.startsWith('tus datos')) return ['titular', 'Para reconocer tus traspasos y la nómina'];
    } catch (e) {}
    return ['reglas', ''];
  }
  const vAjOrig = window.vAjustes;
  window.vAjustes = function (el) {
    vAjOrig(el);
    // Agrupa cada título con lo que hay debajo hasta el siguiente título
    const groups = []; let cur = null;
    for (const node of Array.from(el.children)) {
      if (node.matches('h2.sec')) { cur = { title: node.textContent.trim(), id: node.id, nodes: [node] }; groups.push(cur); }
      else if (cur) cur.nodes.push(node);
    }
    if (!groups.length) return;
    if (S.ajFoco) { const g = groups.find((x) => x.id === 'aj-' + S.ajFoco); if (g) S.ajSec = g.title; }
    const open = groups.find((g) => g.title === S.ajSec);
    if (!open) {
      S.ajSec = null;
      el.innerHTML = '<h2 class="sec" style="margin:2px 0 0">Ajustes</h2><nav class="ajmenu card" aria-label="Apartados de ajustes">' + groups.map((g, i) => {
        const [ic, sub] = infoSec(g.title);
        return '<button type="button" data-i="' + i + '"><span class="aic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + IC[ic] + '"/></svg></span>' +
          '<span class="at"><b>' + esc(g.title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span><span class="chev" aria-hidden="true">›</span></button>';
      }).join('') + '</nav>';
      el.querySelectorAll('.ajmenu button').forEach((b) => b.addEventListener('click', () => { S.ajSec = groups[+b.dataset.i].title; render(); window.scrollTo(0, 0); }));
      return;
    }
    el.innerHTML = '';
    const back = document.createElement('button');
    back.type = 'button'; back.className = 'ajback'; back.innerHTML = '<span aria-hidden="true">‹</span> Ajustes';
    back.addEventListener('click', () => { S.ajSec = null; render(); window.scrollTo(0, 0); });
    el.appendChild(back);
    open.nodes.forEach((n) => el.appendChild(n));
  };
  const tabAj = document.querySelector('.tab[data-v="ajustes"]');
  if (tabAj) tabAj.addEventListener('click', () => { S.ajSec = null; }, true);

  /* ---------- Aviso de copia pendiente ---------- */
  window.copiaPendiente = function () {
    const u = S.cfg && S.cfg.ultimaCopia;
    if (!u) return true;
    return (Date.now() - new Date(u + 'T00:00:00').getTime()) / 86400000 > 30;
  };

  /* ---------- Actualizaciones (service worker) ---------- */
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    let recargado = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargado) return; recargado = true;
      const a = document.activeElement;
      if (document.getElementById('sheetHost').innerHTML || (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName))) {
        toast('Hay una versión nueva. Se aplicará la próxima vez que abras la app.'); return;
      }
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').then((reg) => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch((e) => console.warn('SW', e));
  }
})();
