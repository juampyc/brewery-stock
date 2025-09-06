
// THEME
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  // SweetAlert2 theme via custom classes
  Swal.update({
    customClass: {
      popup: theme === 'dark' ? 'swal2-dark' : 'swal2-light'
    }
  });
}

function initThemeSwitch() {
  const switchEl = document.getElementById('themeSwitch');
  const saved = localStorage.getItem('theme') || 'light';
  applyTheme(saved);
  if (switchEl) {
    switchEl.checked = (saved === 'dark');
    switchEl.addEventListener('change', (e) => {
      applyTheme(e.target.checked ? 'dark' : 'light');
    });
  }
}

// SIDEBAR
function initSidebar() {
  const btn = document.getElementById('btnToggleSidebar');
  const sidebar = document.getElementById('sidebar');
  if (!btn || !sidebar) return;
  const collapsed = localStorage.getItem('sidebarCollapsed') === '1';
  if (collapsed) sidebar.classList.add('collapsed');
  btn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed') ? '1' : '0');
  });
}

// HELPERS
function showError(err) {
  console.error(err);
  Swal.fire({
    icon: 'error',
    title: 'Error',
    text: (err && err.message) ? err.message : (err || 'Ocurrió un error'),
  });
}

function toastOK(msg) {
  Swal.fire({
    icon: 'success',
    title: msg || 'Listo',
    timer: 1200,
    showConfirmButton: false
  });
}

// Apps Script bridges
function gs() {
  if (typeof google !== 'undefined' && google.script && google.script.run) {
    return google.script.run;
  } else {
    // Fallback for local testing (no-op)
    return {
      withSuccessHandler: function(cb){ this._cb = cb; return this; },
      withFailureHandler: function(cb){ this._fb = cb; return this; },
      getAll: function(){ console.warn('No GAS context'); return this; },
      upsert: function(){ console.warn('No GAS context'); return this; },
      removeById: function(){ console.warn('No GAS context'); return this; }
    };
  }
}

// LOADERS
function loadAll() {
  loadBrands();
  loadStyles();
  loadFermenters();
  loadContainers();
}

function loadBrands() {
  gs().withSuccessHandler(renderBrands).withFailureHandler(showError).getAll('brands');
}

function loadStyles() {
  gs().withSuccessHandler(renderStyles).withFailureHandler(showError).getAll('styles');
}

function loadFermenters() {
  gs().withSuccessHandler(renderFermenters).withFailureHandler(showError).getAll('fermenters');
}

function loadContainers() {
  gs().withSuccessHandler(renderContainers).withFailureHandler(showError).getAll('containers');
}

// RENDERERS
function renderBrands(items) {
  const tbody = document.querySelector('#tblBrands tbody');
  if (!tbody) return;
  tbody.innerHTML = (items||[]).map(row => `
    <tr>
      <td><span class="color-dot" style="background:${row.color||'#999'}"></span></td>
      <td>${row.name||''}</td>
      <td><span class="text-muted">${row.lastModified||''}</span></td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-secondary me-1" title="Editar" onclick='openBrandModal(${JSON.stringify(row)})'>
          <span class="material-icons">edit</span>
        </button>
        <button class="btn btn-sm btn-outline-danger" title="Eliminar" onclick="deleteItem('brands','${row.id}')">
          <span class="material-icons">delete</span>
        </button>
      </td>
    </tr>
  `).join('');
  // fill brand selects (for styles form)
  window._brandsCache = items || [];
}

function renderStyles(items) {
  const tbody = document.querySelector('#tblStyles tbody');
  if (!tbody) return;
  tbody.innerHTML = (items||[]).map(row => `
    <tr>
      <td><span class="color-dot" style="background:${row.color||'#999'}"></span></td>
      <td>${row.brandName||''}</td>
      <td>${row.name||''}</td>
      <td>${row.showAlways ? 'Sí' : 'No'}</td>
      <td><span class="text-muted">${row.lastModified||''}</span></td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-secondary me-1" title="Editar" onclick='openStyleModal(${JSON.stringify(row)})'>
          <span class="material-icons">edit</span>
        </button>
        <button class="btn btn-sm btn-outline-danger" title="Eliminar" onclick="deleteItem('styles','${row.id}')">
          <span class="material-icons">delete</span>
        </button>
      </td>
    </tr>
  `).join('');
}

function renderFermenters(items) {
  const tbody = document.querySelector('#tblFermenters tbody');
  if (!tbody) return;
  tbody.innerHTML = (items||[]).map(row => `
    <tr>
      <td><span class="color-dot" style="background:${row.color||'#999'}"></span></td>
      <td>${row.name||''}</td>
      <td>${Number(row.sizeLiters||0)}</td>
      <td><span class="text-muted">${row.lastModified||''}</span></td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-secondary me-1" title="Editar" onclick='openFermenterModal(${JSON.stringify(row)})'>
          <span class="material-icons">edit</span>
        </button>
        <button class="btn btn-sm btn-outline-danger" title="Eliminar" onclick="deleteItem('fermenters','${row.id}')">
          <span class="material-icons">delete</span>
        </button>
      </td>
    </tr>
  `).join('');
}

function renderContainers(items) {
  const tbody = document.querySelector('#tblContainers tbody');
  if (!tbody) return;
  tbody.innerHTML = (items||[]).map(row => `
    <tr>
      <td><span class="color-dot" style="background:${row.color||'#999'}"></span></td>
      <td>${row.name||''}</td>
      <td>${Number(row.sizeLiters||0)}</td>
      <td>${row.type||'lata'}</td>
      <td><span class="text-muted">${row.lastModified||''}</span></td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-secondary me-1" title="Editar" onclick='openContainerModal(${JSON.stringify(row)})'>
          <span class="material-icons">edit</span>
        </button>
        <button class="btn btn-sm btn-outline-danger" title="Eliminar" onclick="deleteItem('containers','${row.id}')">
          <span class="material-icons">delete</span>
        </button>
      </td>
    </tr>
  `).join('');
}

// CRUD ACTIONS
function deleteItem(entity, id) {
  Swal.fire({
    icon: 'warning',
    title: 'Eliminar registro',
    text: 'Esta acción no se puede deshacer',
    showCancelButton: true,
    confirmButtonText: 'Eliminar',
    cancelButtonText: 'Cancelar'
  }).then(res => {
    if (res.isConfirmed) {
      gs().withSuccessHandler(() => {
        toastOK('Eliminado');
        reloadEntity(entity);
      }).withFailureHandler(showError).removeById(entity, id);
    }
  });
}

function reloadEntity(entity) {
  if (entity==='brands') loadBrands();
  else if (entity==='styles') loadStyles();
  else if (entity==='fermenters') loadFermenters();
  else if (entity==='containers') loadContainers();
}

// MODALS (SweetAlert forms)
function colorInput(defaultColor) {
  return `<input type="color" id="swColor" class="form-control form-control-color" value="${defaultColor||'#4f46e5'}" />`;
}

function openBrandModal(data={}) {
  Swal.fire({
    title: data.id ? 'Editar Marca' : 'Nueva Marca',
    html: `
      <div class="mb-2 text-start">
        <label class="form-label">Nombre</label>
        <input id="swName" class="form-control" value="${data.name||''}" />
      </div>
      <div class="mb-2 text-start">
        <label class="form-label">Color</label>
        ${colorInput(data.color)}
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    preConfirm: () => {
      const name = document.getElementById('swName').value.trim();
      const color = document.getElementById('swColor').value;
      if (!name) return Swal.showValidationMessage('Nombre requerido');
      return { id: data.id, name, color };
    }
  }).then(res => {
    if (res.isConfirmed) {
      gs().withSuccessHandler(() => {
        toastOK('Guardado');
        loadBrands();
      }).withFailureHandler(showError).upsert('brands', res.value);
    }
  });
}

function openStyleModal(data={}) {
  const brands = (window._brandsCache||[]);
  const options = ['<option value="">Seleccionar marca...</option>'].concat(brands.map(b=>`
    <option value="${b.id}" ${data.brandId===b.id?'selected':''}>${b.name}</option>
  `)).join('');
  Swal.fire({
    title: data.id ? 'Editar Estilo' : 'Nuevo Estilo',
    html: `
      <div class="mb-2 text-start">
        <label class="form-label">Marca</label>
        <select id="swBrand" class="form-select">${options}</select>
      </div>
      <div class="mb-2 text-start">
        <label class="form-label">Estilo</label>
        <input id="swName" class="form-control" value="${data.name||''}" />
      </div>
      <div class="mb-2 text-start">
        <label class="form-label">Color</label>
        ${colorInput(data.color)}
      </div>
      <div class="form-check text-start">
        <input class="form-check-input" type="checkbox" id="swShow" ${data.showAlways?'checked':''}>
        <label class="form-check-label" for="swShow">Mostrar siempre (aunque stock = 0)</label>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    preConfirm: () => {
      const brandId = document.getElementById('swBrand').value;
      const name = document.getElementById('swName').value.trim();
      const color = document.getElementById('swColor').value;
      const showAlways = document.getElementById('swShow').checked;
      if (!brandId) return Swal.showValidationMessage('Seleccioná una marca');
      if (!name) return Swal.showValidationMessage('Estilo requerido');
      return { id: data.id, brandId, name, color, showAlways };
    }
  }).then(res => {
    if (res.isConfirmed) {
      gs().withSuccessHandler(() => {
        toastOK('Guardado');
        loadStyles();
      }).withFailureHandler(showError).upsert('styles', res.value);
    }
  });
}

function openFermenterModal(data={}) {
  Swal.fire({
    title: data.id ? 'Editar Fermentador' : 'Nuevo Fermentador',
    html: `
      <div class="mb-2 text-start">
        <label class="form-label">Nombre</label>
        <input id="swName" class="form-control" value="${data.name||''}" />
      </div>
      <div class="mb-2 text-start">
        <label class="form-label">Capacidad (L)</label>
        <input id="swLiters" type="number" min="0" class="form-control" value="${data.sizeLiters||0}" />
      </div>
      <div class="mb-2 text-start">
        <label class="form-label">Color</label>
        ${colorInput(data.color)}
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    preConfirm: () => {
      const name = document.getElementById('swName').value.trim();
      const sizeLiters = Number(document.getElementById('swLiters').value || 0);
      const color = document.getElementById('swColor').value;
      if (!name) return Swal.showValidationMessage('Nombre requerido');
      return { id: data.id, name, sizeLiters, color };
    }
  }).then(res => {
    if (res.isConfirmed) {
      gs().withSuccessHandler(() => {
        toastOK('Guardado');
        loadFermenters();
      }).withFailureHandler(showError).upsert('fermenters', res.value);
    }
  });
}

function openContainerModal(data={}) {
  Swal.fire({
    title: data.id ? 'Editar Envase' : 'Nuevo Envase',
    html: `
      <div class="mb-2 text-start">
        <label class="form-label">Nombre</label>
        <input id="swName" class="form-control" value="${data.name||''}" />
      </div>
      <div class="mb-2 text-start">
        <label class="form-label">Tamaño (L)</label>
        <input id="swLiters" type="number" min="0" class="form-control" value="${data.sizeLiters||0}" />
      </div>
      <div class="mb-2 text-start">
        <label class="form-label">Tipo</label>
        <select id="swType" class="form-select">
          <option value="lata" ${data.type==='lata'?'selected':''}>Lata</option>
          <option value="barril" ${data.type==='barril'?'selected':''}>Barril</option>
        </select>
      </div>
      <div class="mb-2 text-start">
        <label class="form-label">Color</label>
        ${colorInput(data.color)}
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    preConfirm: () => {
      const name = document.getElementById('swName').value.trim();
      const sizeLiters = Number(document.getElementById('swLiters').value || 0);
      const type = document.getElementById('swType').value;
      const color = document.getElementById('swColor').value;
      if (!name) return Swal.showValidationMessage('Nombre requerido');
      return { id: data.id, name, sizeLiters, type, color };
    }
  }).then(res => {
    if (res.isConfirmed) {
      gs().withSuccessHandler(() => {
        toastOK('Guardado');
        loadContainers();
      }).withFailureHandler(showError).upsert('containers', res.value);
    }
  });
}

// INIT
document.addEventListener('DOMContentLoaded', () => {
  initThemeSwitch();
  initSidebar();
});
