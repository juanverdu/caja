/* Gestión del Dinero · funciones de la versión instalable
   (copia de seguridad, datos del titular, actualizaciones). Se carga después de la app. */
(function () {
  'use strict';

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
