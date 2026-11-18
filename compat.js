/* Gestión del Dinero · compatibilidad con iPhone/Android más antiguos
   y aviso visible si algo falla, para poder mandarlo en una captura. */
(function () {
  'use strict';
  if (typeof window.structuredClone !== 'function') {
    window.structuredClone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));
  }
  if (!Array.prototype.flatMap) {
    Array.prototype.flatMap = function (fn, t) { return this.reduce((a, x, i, arr) => a.concat(fn.call(t, x, i, arr)), []); };
  }
  function aviso(msg) {
    try {
      let el = document.getElementById('errorBox');
      if (!el) {
        el = document.createElement('div'); el.id = 'errorBox';
        el.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));z-index:200;background:#3A1E1A;color:#FFD9D2;border:1px solid #F08270;border-radius:14px;padding:12px 14px;font:13px/1.4 system-ui,sans-serif;white-space:pre-wrap';
        el.addEventListener('click', () => el.remove());
        (document.body || document.documentElement).appendChild(el);
      }
      const ua = navigator.userAgent.match(/(iPhone OS|Android) [\d_.]+/);
      el.textContent = 'Algo ha fallado. Haz una captura y mándasela a Juan.\n\n' + String(msg).slice(0, 300) + (ua ? '\n(' + ua[0].replace(/_/g, '.') + ')' : '') + '\n\nToca para cerrar.';
    } catch (e) {}
  }
  window.addEventListener('error', (e) => aviso(e.message || e.error || 'Error'));
  window.addEventListener('unhandledrejection', (e) => aviso((e.reason && (e.reason.message || e.reason)) || 'Error'));
})();
