/*
  JavaScript for Castelo Stock Control
  This file powers both the index and configuration pages. It
  communicates with the Apps Script backend via fetch(), manages
  dark/light themes, the collapsible sidebar, and renders the CRUD
  interfaces for brands, styles, fermenters, containers and empty
  cans. SweetAlert2 is used for all interactive dialogs.
*/

(function() {
  // Base URL of the Apps Script API. If you deploy a new script
  // version or change the deployment id, update this constant.
  const API_BASE = 'https://script.google.com/macros/s/AKfycbxL-PEivFWIrTl2fH_nTiwg8SnSleVnkghxCYTcQ1_uRWruw2_WH-QlPYraYS2EwOI/exec';

  // Cache for loaded data; used for quick lookups when editing
  const dataCache = {
    brands: [],
    styles: [],
    fermenters: [],
    containers: []
  };

  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initSidebar();
    if (document.getElementById('emptyCansCount')) {
      initIndexPage();
    }
    if (document.getElementById('configTabs')) {
      initConfigPage();
    }
  });

  /**
   * Theme handling: load saved theme from localStorage and apply. The
   * switch toggles between light and dark. CSS variables defined in
   * styles.css react to the data-theme attribute on the <html> element.
   */
  function initTheme() {
    const stored = localStorage.getItem('theme') || 'light';
    setTheme(stored);
    const switchEl = document.getElementById('themeSwitch');
    if (switchEl) {
      switchEl.checked = stored === 'dark';
      switchEl.addEventListener('change', () => {
        const newTheme = switchEl.checked ? 'dark' : 'light';
        setTheme(newTheme);
      });
    }
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }

  /**
   * Sidebar toggling and active link highlighting. The sidebar
   * collapses to a slim bar when the menu button is clicked. The
   * current page is determined from the URL and the corresponding
   * nav-link is marked as active.
   */
  function initSidebar() {
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('btnToggleSidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
      });
    }
    // Highlight the active link
    if (sidebar) {
      const links = sidebar.querySelectorAll('.nav-link');
      const currentPage = window.location.pathname.split('/').pop();
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href === currentPage) {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      });
    }
  }

  /**
   * Helper to build SweetAlert options based on the current theme. This
   * ensures dialogs visually integrate with the light or dark modes.
   */
  function getSwalBaseOptions() {
    const rootStyles = getComputedStyle(document.documentElement);
    return {
      background: rootStyles.getPropertyValue('--card-bg').trim() || '#fff',
      color: rootStyles.getPropertyValue('--text-color').trim() || '#212529',
      confirmButtonColor: '#0d6efd',
      cancelButtonColor: '#6c757d',
      customClass: {
        input: 'form-control',
        select: 'form-select'
      }
    };
  }

  /**
   * Perform a GET request to the Apps Script API. Returns the parsed
   * JSON. If the response contains an error field the promise
   * rejects.
   */
  async function apiGet(action, entity) {
    const url = `${API_BASE}?action=${encodeURIComponent(action)}&entity=${encodeURIComponent(entity)}`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (data && data.error) {
      throw new Error(data.error);
    }
    return data;
  }

  /**
   * Perform a POST request to the Apps Script API. body is JSON and
   * should already match the expected payload. If the response
   * contains an error field the promise rejects.
   */
  async function apiPost(action, entity, body) {
    const url = `${API_BASE}?action=${encodeURIComponent(action)}&entity=${encodeURIComponent(entity)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
    const data = await resp.json();
    if (data && data.error) {
      throw new Error(data.error);
    }
    return data;
  }

  /**
   * Generic error dialog helper
   */
  function showError(title, message) {
    const opts = getSwalBaseOptions();
    Swal.fire(Object.assign({}, opts, { icon: 'error', title: title || 'Error', text: message || 'Ocurrió un error' }));
  }

  /**
   * Index page initialisation: fetch the count of empty cans and
   * attach the add button handler.
   */
  function initIndexPage() {
    loadEmptyCansCount();
    const btn = document.getElementById('btnAddEmptyCan');
    if (btn) {
      btn.addEventListener('click', handleAddEmptyCan);
    }
  }

  async function loadEmptyCansCount() {
    try {
      const count = await apiGet('count', 'emptycans');
      const label = document.getElementById('emptyCansCount');
      if (label) label.innerText = count;
    } catch (err) {
      showError('Error al cargar latas', err.message);
    }
  }

  async function handleAddEmptyCan() {
    const opts = getSwalBaseOptions();
    const { value } = await Swal.fire(Object.assign({}, opts, {
      title: 'Registrar lata vacía',
      html:
        '<input id="swal-input-lote" class="swal2-input" placeholder="Lote" autofocus>' +
        '<input id="swal-input-fabricante" class="swal2-input" placeholder="Fabricante o compra (opcional)">',
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const lote = document.getElementById('swal-input-lote').value.trim();
        const fabricante = document.getElementById('swal-input-fabricante').value.trim();
        if (!lote) {
          Swal.showValidationMessage('Debe ingresar el lote');
          return false;
        }
        return { lote: lote, fabricante: fabricante, compra: fabricante };
      }
    }));
    if (!value) return;
    try {
      await apiPost('addEmptyCan', '', value);
      await loadEmptyCansCount();
      await Swal.fire(Object.assign({}, opts, { icon: 'success', title: 'Registrado', text: 'La lata vacía fue registrada.' }));
    } catch (err) {
      await Swal.fire(Object.assign({}, opts, { icon: 'error', title: 'Error', text: err.message }));
    }
  }

  /**
   * Config page initialisation. Loads all entities and renders the
   * tables. Attaches handlers on the Add buttons. Subsequent
   * operations refresh all tables from the server to keep cache
   * consistent.
   */
  function initConfigPage() {
    refreshAll();
    document.getElementById('btnAddBrand').addEventListener('click', () => openBrandForm());
    document.getElementById('btnAddStyle').addEventListener('click', () => openStyleForm());
    document.getElementById('btnAddFermenter').addEventListener('click', () => openFermenterForm());
    document.getElementById('btnAddContainer').addEventListener('click', () => openContainerForm());
  }

  async function refreshAll() {
    try {
      const [brands, styles, fermenters, containers] = await Promise.all([
        apiGet('getAll', 'brands'),
        apiGet('getAll', 'styles'),
        apiGet('getAll', 'fermenters'),
        apiGet('getAll', 'containers')
      ]);
      dataCache.brands = brands;
      dataCache.styles = styles;
      dataCache.fermenters = fermenters;
      dataCache.containers = containers;
      renderBrands(brands);
      renderStyles(styles, brands);
      renderFermenters(fermenters);
      renderContainers(containers);
    } catch (err) {
      showError('Error al cargar datos', err.message);
    }
  }

  /**
   * Renderers: each function populates its corresponding table and
   * attaches edit/delete handlers via data attributes.
   */
  function renderBrands(list) {
    const tbody = document.querySelector('#tableBrands tbody');
    tbody.innerHTML = '';
    list.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(item.name)}</td>
        <td><span class="color-swatch" style="background-color:${escapeHtml(item.color)}"></span>${escapeHtml(item.color)}</td>
        <td>${escapeHtml(item.lastModified)}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary btn-icon" data-entity="brands" data-id="${item.id}" data-action="edit"><span class="material-icons">edit</span></button>
          <button class="btn btn-sm btn-outline-danger btn-icon ms-1" data-entity="brands" data-id="${item.id}" data-action="delete"><span class="material-icons">delete</span></button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const item = dataCache.brands.find(b => b.id === id);
        openBrandForm(item);
      });
    });
    tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        deleteItem('brands', id);
      });
    });
  }

  function renderStyles(list, brands) {
    const tbody = document.querySelector('#tableStyles tbody');
    tbody.innerHTML = '';
    list.forEach(item => {
      const brandName = item.brandName || (brands.find(b => b.id === item.brandId) || {}).name || '';
      const showAlways = item.showAlways ? 'Sí' : 'No';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(brandName)}</td>
        <td>${escapeHtml(item.name)}</td>
        <td><span class="color-swatch" style="background-color:${escapeHtml(item.color)}"></span>${escapeHtml(item.color)}</td>
        <td>${showAlways}</td>
        <td>${escapeHtml(item.lastModified)}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary btn-icon" data-entity="styles" data-id="${item.id}" data-action="edit"><span class="material-icons">edit</span></button>
          <button class="btn btn-sm btn-outline-danger btn-icon ms-1" data-entity="styles" data-id="${item.id}" data-action="delete"><span class="material-icons">delete</span></button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const item = dataCache.styles.find(s => s.id === id);
        openStyleForm(item);
      });
    });
    tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        deleteItem('styles', id);
      });
    });
  }

  function renderFermenters(list) {
    const tbody = document.querySelector('#tableFermenters tbody');
    tbody.innerHTML = '';
    list.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(item.name)}</td>
        <td>${Number(item.sizeLiters).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
        <td><span class="color-swatch" style="background-color:${escapeHtml(item.color)}"></span>${escapeHtml(item.color)}</td>
        <td>${escapeHtml(item.lastModified)}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary btn-icon" data-entity="fermenters" data-id="${item.id}" data-action="edit"><span class="material-icons">edit</span></button>
          <button class="btn btn-sm btn-outline-danger btn-icon ms-1" data-entity="fermenters" data-id="${item.id}" data-action="delete"><span class="material-icons">delete</span></button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const item = dataCache.fermenters.find(f => f.id === id);
        openFermenterForm(item);
      });
    });
    tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        deleteItem('fermenters', id);
      });
    });
  }

  function renderContainers(list) {
    const tbody = document.querySelector('#tableContainers tbody');
    tbody.innerHTML = '';
    list.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(item.name)}</td>
        <td>${Number(item.sizeLiters).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</td>
        <td>${escapeHtml(item.type)}</td>
        <td><span class="color-swatch" style="background-color:${escapeHtml(item.color)}"></span>${escapeHtml(item.color)}</td>
        <td>${escapeHtml(item.lastModified)}</td>
        <td>
          <button class="btn btn-sm btn-outline-secondary btn-icon" data-entity="containers" data-id="${item.id}" data-action="edit"><span class="material-icons">edit</span></button>
          <button class="btn btn-sm btn-outline-danger btn-icon ms-1" data-entity="containers" data-id="${item.id}" data-action="delete"><span class="material-icons">delete</span></button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody.querySelectorAll('button[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const item = dataCache.containers.find(c => c.id === id);
        openContainerForm(item);
      });
    });
    tbody.querySelectorAll('button[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        deleteItem('containers', id);
      });
    });
  }

  /**
   * Escape HTML special characters to prevent injection into the DOM.
   */
  function escapeHtml(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Generic delete function used by all entities. Confirms and then
   * posts the deletion to the server before refreshing the tables.
   */
  async function deleteItem(entity, id) {
    const opts = getSwalBaseOptions();
    const confirm = await Swal.fire(Object.assign({}, opts, {
      title: '¿Eliminar?',
      text: 'Esta acción no puede deshacerse.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar'
    }));
    if (!confirm.isConfirmed) return;
    try {
      await apiPost('delete', entity, { id: id });
      await refreshAll();
      await Swal.fire(Object.assign({}, opts, { icon: 'success', title: 'Eliminado', text: 'El registro fue eliminado.' }));
    } catch (err) {
      await Swal.fire(Object.assign({}, opts, { icon: 'error', title: 'Error', text: err.message }));
    }
  }

  /**
   * Open a modal to create or edit a brand. existing may be
   * undefined for new records. On save, the server is called via
   * upsert and the tables are refreshed.
   */
  async function openBrandForm(existing) {
    const opts = getSwalBaseOptions();
    const { value } = await Swal.fire(Object.assign({}, opts, {
      title: existing ? 'Editar marca' : 'Agregar marca',
      html:
        `<input id="swal-brand-name" class="swal2-input" placeholder="Nombre" value="${existing ? escapeHtml(existing.name) : ''}">` +
        `<input id="swal-brand-color" class="swal2-input" type="color" value="${existing ? escapeHtml(existing.color) : '#000000'}">`,
      showCancelButton: true,
      confirmButtonText: existing ? 'Actualizar' : 'Guardar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const name = document.getElementById('swal-brand-name').value.trim();
        const color = document.getElementById('swal-brand-color').value;
        if (!name) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }
        return { id: existing ? existing.id : undefined, name: name, color: color };
      }
    }));
    if (!value) return;
    try {
      await apiPost('upsert', 'brands', value);
      await refreshAll();
      await Swal.fire(Object.assign({}, opts, { icon: 'success', title: 'Guardado', text: 'La marca fue guardada.' }));
    } catch (err) {
      await Swal.fire(Object.assign({}, opts, { icon: 'error', title: 'Error', text: err.message }));
    }
  }

  /**
   * Open a modal to create or edit a style. Requires the brands to
   * already be loaded so the user can pick which brand the style
   * belongs to. existing may be undefined for a new record.
   */
  async function openStyleForm(existing) {
    if (dataCache.brands.length === 0) {
      showError('Sin marcas', 'Debe cargar al menos una marca antes de crear estilos.');
      return;
    }
    const opts = getSwalBaseOptions();
    const selectOptions = dataCache.brands.map(b => `<option value="${b.id}" ${existing && existing.brandId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}</option>`).join('');
    const { value } = await Swal.fire(Object.assign({}, opts, {
      title: existing ? 'Editar estilo' : 'Agregar estilo',
      html:
        `<label for="swal-style-brand" class="swal2-label">Marca</label>` +
        `<select id="swal-style-brand" class="swal2-input">${selectOptions}</select>` +
        `<input id="swal-style-name" class="swal2-input" placeholder="Nombre" value="${existing ? escapeHtml(existing.name) : ''}">` +
        `<input id="swal-style-color" class="swal2-input" type="color" value="${existing ? escapeHtml(existing.color) : '#000000'}">` +
        `<div class="form-check mt-2" style="text-align:left;"><input class="form-check-input" type="checkbox" id="swal-style-showAlways" ${existing && existing.showAlways ? 'checked' : ''}><label class="form-check-label" for="swal-style-showAlways"> Mostrar siempre</label></div>`,
      showCancelButton: true,
      confirmButtonText: existing ? 'Actualizar' : 'Guardar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const brandId = document.getElementById('swal-style-brand').value;
        const name = document.getElementById('swal-style-name').value.trim();
        const color = document.getElementById('swal-style-color').value;
        const showAlways = document.getElementById('swal-style-showAlways').checked;
        if (!brandId) {
          Swal.showValidationMessage('Debe seleccionar una marca');
          return false;
        }
        if (!name) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }
        return { id: existing ? existing.id : undefined, brandId: brandId, name: name, color: color, showAlways: showAlways };
      }
    }));
    if (!value) return;
    try {
      await apiPost('upsert', 'styles', value);
      await refreshAll();
      await Swal.fire(Object.assign({}, opts, { icon: 'success', title: 'Guardado', text: 'El estilo fue guardado.' }));
    } catch (err) {
      await Swal.fire(Object.assign({}, opts, { icon: 'error', title: 'Error', text: err.message }));
    }
  }

  /**
   * Modal for fermenters. existing may be undefined for new. Size
   * accepts decimals and is converted to Number before submission.
   */
  async function openFermenterForm(existing) {
    const opts = getSwalBaseOptions();
    const { value } = await Swal.fire(Object.assign({}, opts, {
      title: existing ? 'Editar fermentador' : 'Agregar fermentador',
      html:
        `<input id="swal-fermenter-name" class="swal2-input" placeholder="Nombre" value="${existing ? escapeHtml(existing.name) : ''}">` +
        `<input id="swal-fermenter-size" class="swal2-input" type="number" step="0.01" placeholder="Capacidad (L)" value="${existing ? escapeHtml(existing.sizeLiters) : ''}">` +
        `<input id="swal-fermenter-color" class="swal2-input" type="color" value="${existing ? escapeHtml(existing.color) : '#000000'}">`,
      showCancelButton: true,
      confirmButtonText: existing ? 'Actualizar' : 'Guardar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const name = document.getElementById('swal-fermenter-name').value.trim();
        const size = parseFloat(document.getElementById('swal-fermenter-size').value);
        const color = document.getElementById('swal-fermenter-color').value;
        if (!name) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }
        if (isNaN(size) || size <= 0) {
          Swal.showValidationMessage('Debe ingresar una capacidad válida (> 0)');
          return false;
        }
        return { id: existing ? existing.id : undefined, name: name, sizeLiters: size, color: color };
      }
    }));
    if (!value) return;
    try {
      await apiPost('upsert', 'fermenters', value);
      await refreshAll();
      await Swal.fire(Object.assign({}, opts, { icon: 'success', title: 'Guardado', text: 'El fermentador fue guardado.' }));
    } catch (err) {
      await Swal.fire(Object.assign({}, opts, { icon: 'error', title: 'Error', text: err.message }));
    }
  }

  /**
   * Modal for containers. existing may be undefined for new. Allows
   * selecting type (lata/barril).
   */
  async function openContainerForm(existing) {
    const opts = getSwalBaseOptions();
    const { value } = await Swal.fire(Object.assign({}, opts, {
      title: existing ? 'Editar envase' : 'Agregar envase',
      html:
        `<input id="swal-container-name" class="swal2-input" placeholder="Nombre" value="${existing ? escapeHtml(existing.name) : ''}">` +
        `<input id="swal-container-size" class="swal2-input" type="number" step="0.001" placeholder="Capacidad (L)" value="${existing ? escapeHtml(existing.sizeLiters) : ''}">` +
        `<label for="swal-container-type" class="swal2-label">Tipo</label>` +
        `<select id="swal-container-type" class="swal2-input">
          <option value="lata" ${existing && existing.type === 'lata' ? 'selected' : ''}>Lata</option>
          <option value="barril" ${existing && existing.type === 'barril' ? 'selected' : ''}>Barril</option>
        </select>` +
        `<input id="swal-container-color" class="swal2-input" type="color" value="${existing ? escapeHtml(existing.color) : '#000000'}">`,
      showCancelButton: true,
      confirmButtonText: existing ? 'Actualizar' : 'Guardar',
      cancelButtonText: 'Cancelar',
      focusConfirm: false,
      preConfirm: () => {
        const name = document.getElementById('swal-container-name').value.trim();
        const size = parseFloat(document.getElementById('swal-container-size').value);
        const type = document.getElementById('swal-container-type').value;
        const color = document.getElementById('swal-container-color').value;
        if (!name) {
          Swal.showValidationMessage('El nombre es obligatorio');
          return false;
        }
        if (isNaN(size) || size <= 0) {
          Swal.showValidationMessage('Debe ingresar una capacidad válida (> 0)');
          return false;
        }
        return { id: existing ? existing.id : undefined, name: name, sizeLiters: size, type: type, color: color };
      }
    }));
    if (!value) return;
    try {
      await apiPost('upsert', 'containers', value);
      await refreshAll();
      await Swal.fire(Object.assign({}, opts, { icon: 'success', title: 'Guardado', text: 'El envase fue guardado.' }));
    } catch (err) {
      await Swal.fire(Object.assign({}, opts, { icon: 'error', title: 'Error', text: err.message }));
    }
  }

})();