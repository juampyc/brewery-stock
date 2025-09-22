// js/header.js
(function () {
  'use strict';

  const NAV = [
    { href: 'index.html',        label: 'Dashboard',   icon: '🏠' },
    { href: 'production.html',   label: 'Producción',  icon: '🛠️' },
    { href: 'empty_cans.html',        label: 'Latas',       icon: '🥫' },
    { href: 'labels.html',       label: 'Etiquetas',   icon: '🏷️' },
    { href: 'movements.html',    label: 'Movimientos', icon: '📜' },
    { href: 'styles_new.html',   label: 'Nuevo estilo',icon: '🎨' },
    { href: 'scrap.html',        label: 'Scrap',       icon: '🧹' },
  ];

  function renderHeader() {
    const wrap = document.getElementById('site-header');
    if (!wrap) return;

    const cur = (location.pathname || '').split('/').pop() || 'index.html';

    wrap.innerHTML = `
      <header class="topbar" style="display:flex;align-items:center;gap:16px;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--border);background:var(--bg)">
        <div style="display:flex;align-items:center;gap:10px;font-weight:700">
          <span style="font-size:18px">🍺 Brewery Stock</span>
        </div>
        <nav style="display:flex;flex-wrap:wrap;gap:6px">
          ${NAV.map(it => {
            const active = cur === it.href ? 'background:var(--card);border-color:var(--primary);' : '';
            return `<a href="${it.href}" class="btn ghost" style="padding:6px 10px;${active}">
              <span style="margin-right:6px">${it.icon}</span>${it.label}
            </a>`;
          }).join('')}
        </nav>
      </header>
    `;
  }

  document.addEventListener('DOMContentLoaded', renderHeader);
})();

