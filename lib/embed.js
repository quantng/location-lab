// Embedded mode for Location Lab modules: ?embed=1&tab=<start tab>&tabs=<comma list of tabs to keep>
(function () {
  const q = new URLSearchParams(location.search);
  if (!q.has('embed')) return;
  const start = q.get('tab'), keep = (q.get('tabs') || start || '').split(',').filter(Boolean);
  const st = document.createElement('style');
  st.textContent = '.ga-top{display:none!important}.ga-tabs button span{display:none!important}' + (keep.length < 2 ? '.ga-tabs{display:none!important}' : '');
  document.head.appendChild(st);
  document.addEventListener('DOMContentLoaded', () => {
    if (keep.length > 1) document.querySelectorAll('.ga-tabs button').forEach(b => { if (!keep.includes(b.dataset.t)) b.style.display = 'none'; });
    const nav = document.querySelector('.ga-tabs'); if (nav && keep.length > 1) nav.style.gridTemplateColumns = `repeat(${keep.length},1fr)`;
  });
  const go = () => {
    const m = window.__map, b = document.querySelector(`.ga-tabs button[data-t="${start}"]`), busy = document.querySelector('#busy');
    if (m && b && m.loaded() && (!busy || busy.hidden)) { setTimeout(() => { b.click(); window.__embedReady = true; }, 300); return; }
    setTimeout(go, 250);
  };
  window.addEventListener('load', () => setTimeout(go, 400));
})();
