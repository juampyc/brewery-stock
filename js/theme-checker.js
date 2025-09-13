(() => {
  const doc = document.documentElement;
  function applyThemeClass() {
    const theme = doc.getAttribute('data-theme') || 'light';
    document.body.classList.remove('theme-light', 'theme-dark');
    document.body.classList.add(`theme-${theme}`);
  }
  const obs = new MutationObserver(applyThemeClass);
  document.addEventListener('DOMContentLoaded', () => {
    applyThemeClass();
    obs.observe(doc, { attributes: true, attributeFilter: ['data-theme'] });
  });
})();