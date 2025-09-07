// js/theme-checker.js
(() => {
  const SHOW_BADGE = false; // poné true si querés ver un badge en pantalla
  const doc = document.documentElement;

  function applyThemeClass() {
    const theme = doc.getAttribute('data-theme') || 'light';
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${theme}`);
    console.log(`[theme-checker] theme: ${theme}`);
    if (SHOW_BADGE) showBadge(theme);
  }

  function showBadge(theme) {
    let b = document.getElementById('theme-badge');
    if (!b) {
      b = document.createElement('div');
      b.id = 'theme-badge';
      b.style.cssText = 'position:fixed;right:10px;bottom:10px;padding:4px 8px;border-radius:6px;font-size:12px;z-index:2000;background:#00000066;color:#fff;backdrop-filter: blur(4px)';
      document.body.appendChild(b);
    }
    b.textContent = `Tema: ${theme}`;
  }

  const obs = new MutationObserver(applyThemeClass);

  document.addEventListener('DOMContentLoaded', () => {
    applyThemeClass();
    obs.observe(doc, { attributes: true, attributeFilter: ['data-theme'] });
  });
})();
