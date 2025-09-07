/*
  JS Control de Stock Castelo – Bootstrap modals nativos + SweetAlert: confirm/TOAST
*/
const API_BASE = "https://script.google.com/macros/s/AKfycbxqI4TZxWb6ZQ7bfW8k5v5zEpqe57o66zoTfxNEkcyZ74McJkrwpjeSEXK8NJSxhgRo/exec";

/* ---------- API ---------- */
async function apiGet(entity, action = "getAll", extra = {}) {
  const params = new URLSearchParams({ entity, action, ...extra });
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  return res.json();
}
async function apiPost(entity, data, action) {
  const url = action ? `${API_BASE}?entity=${entity}&action=${action}` : `${API_BASE}?entity=${entity}`;
  const res = await fetch(url, { method: "POST", body: JSON.stringify(data || {}) });
  return res.json();
}
async function apiDelete(entity, id, cascade=false) {
  return apiPost(entity, { id, cascade }, "delete");
}

/* ---------- SweetAlert TOAST ---------- */
const Toast = Swal.mixin({
  toast: true,
  position: "top-end",
  showConfirmButton: false,
  timer: 1700,
  timerProgressBar: true,
  didOpen: (t) => {
    t.addEventListener("mouseenter", Swal.stopTimer);
    t.addEventListener("mouseleave", Swal.resumeTimer);
  }
});

/* ---------- Tema ---------- */
function initTheme() {
  const sw = document.getElementById("themeSwitch");
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  if (sw) {
    sw.checked = saved === "dark";
    sw.addEventListener("change", () => {
      const theme = sw.checked ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("theme", theme);
    });
  }
}

/* ---------- Estado tablas (búsqueda/paginación) ---------- */
const tableState = {
  brands: { items: [], q: "", page: 1, pageSize: 10 },
  styles: { items: [], q: "", page: 1, pageSize: 10 },
  fermenters: { items: [], q: "", page: 1, pageSize: 10 },
  containers: { items: [], q: "", page: 1, pageSize: 10 },
};
const LABELS = { brands: "Marca", styles: "Estilo", fermenters: "Fermentador", containers: "Envase" };

/* ---------- Helpers render ---------- */
function renderIdShort(id) { return id ? id.slice(-6) : ""; }
function renderColorSquare(color) {
  if (!color) return "";
  return `<div class="color-box mx-auto" style="background:${color};"></div>`;
}

function renderDateLocal(s) {
  if (!s) return "";
  // Si viene ISO con zona (Z o ±hh:mm) -> dejar que JS convierta a local
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(Z|[+\-]\d{2}:\d{2})$/.test(s)) {
    const d = new Date(s);
    return isNaN(d) ? s : d.toLocaleString();
  }
  // Si viene "yyyy-MM-dd HH:mm:ss" (sin zona) -> interpretarlo como hora local tal cual
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const Y = Number(m[1]), M = Number(m[2]), D = Number(m[3]);
    const h = Number(m[4]), mm = Number(m[5]), ss = Number(m[6] || 0);
    const d = new Date(Y, M - 1, D, h, mm, ss);
    return d.toLocaleString();
  }
  // fallback
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString();
}

/* ---------- Búsqueda + paginación ---------- */
function setSearchHandlers(entity) {
  const qIn = document.getElementById(`${entity}Search`);
  const ps  = document.getElementById(`${entity}PageSize`);
  if (qIn) qIn.addEventListener("input", () => { tableState[entity].q = qIn.value; tableState[entity].page = 1; renderTable(entity); });
  if (ps)  ps.addEventListener("change", () => { tableState[entity].pageSize = Number(ps.value); tableState[entity].page = 1; renderTable(entity); });
}
function rowMatches(row, q) {
  if (!q) return true;
  const s = JSON.stringify(row).toLowerCase();
  return s.includes(q.toLowerCase());
}
function renderPager(entity, pages) {
  const ul = document.getElementById(`${entity}Pager`);
  if (!ul) return;
  const st = tableState[entity];
  ul.innerHTML = "";
  const add = (label, page, disabled, active) => {
    const li = document.createElement("li");
    li.className = `page-item ${disabled ? "disabled" : ""} ${active ? "active" : ""}`;
    const a = document.createElement("a");
    a.className = "page-link"; a.href = "#"; a.textContent = label;
    a.onclick = (e) => { e.preventDefault(); if (disabled || active) return; st.page = page; renderTable(entity); };
    li.appendChild(a); ul.appendChild(li);
  };
  add("«", 1, st.page === 1, false);
  add("‹", Math.max(1, st.page - 1), st.page === 1, false);
  for (let p = 1; p <= pages; p++) add(String(p), p, false, p === st.page);
  add("›", Math.min(pages, st.page + 1), st.page === pages, false);
  add("»", pages, st.page === pages, false);
}
function renderTable(entity, tableId = entity + "Table") {
  const st = tableState[entity];
  const q = st.q.trim();
  const filtered = st.items.filter(r => rowMatches(r, q));
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / st.pageSize));
  if (st.page > pages) st.page = pages;
  const start = (st.page - 1) * st.pageSize;
  const pageRows = filtered.slice(start, start + st.pageSize);

  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = "";

  pageRows.forEach((row) => {
    const tr = document.createElement("tr");
    const pushTD = (html) => {
      const td = document.createElement("td");
      td.innerHTML = html;
      td.style.verticalAlign = "middle";
      tr.appendChild(td);
    };

    if (entity === "brands") {
      pushTD(renderIdShort(row.id));
      pushTD(row.name || "");
      pushTD(renderColorSquare(row.color));
      pushTD(renderDateLocal(row.lastModified));
    } else if (entity === "styles") {
      pushTD(renderIdShort(row.id));
      pushTD(row.brandName || "");
      pushTD(row.name || "");
      pushTD(renderColorSquare(row.color));
      pushTD(row.showAlways ? "✔" : "");
      pushTD(renderDateLocal(row.lastModified));
    } else if (entity === "fermenters") {
      pushTD(renderIdShort(row.id));
      pushTD(row.name || "");
      pushTD(row.sizeLiters || "");
      pushTD(renderColorSquare(row.color));
      pushTD(renderDateLocal(row.lastModified));
    } else if (entity === "containers") {
      pushTD(renderIdShort(row.id));
      pushTD(row.name || "");
      pushTD(row.sizeLiters || "");
      pushTD(row.type || "");
      pushTD(renderColorSquare(row.color));
      pushTD(renderDateLocal(row.lastModified));
    }

    const tdA = document.createElement("td");
    tdA.innerHTML = `
      <button class="btn btn-sm btn-warning me-1" onclick="handleEditClick(this,'${entity}','${row.id}')">Editar</button>
      <button class="btn btn-sm btn-danger" onclick="handleDeleteClick(this,'${entity}','${row.id}')">Eliminar</button>`;
    tr.appendChild(tdA);

    tbody.appendChild(tr);
  });

  renderPager(entity, pages);
}
async function loadTable(entity, tableId) {
  const items = await apiGet(entity);
  tableState[entity].items = items;
  renderTable(entity, tableId);
  setSearchHandlers(entity);
}

/* ---------- Bootstrap modal reutilizable (Agregar/Editar) ---------- */
let entityModal, entityModalEl, saveBtn;
function initEntityModal() {
  entityModalEl = document.getElementById('entityModal');
  if (!entityModalEl) return;
  entityModal = new bootstrap.Modal(entityModalEl);
  saveBtn = document.getElementById('entityModalSave');
}

function modalBodyHtml(entity, data = {}, brands = []) {
  if (entity === "brands") {
    return `
      <div class="mb-2">
        <label class="form-label fw-semibold">Nombre</label>
        <input id="brandName" class="form-control" value="${data.name || ""}">
      </div>
      <div class="mb-2 text-center">
        <label class="form-label fw-semibold d-block">Color</label>
        <input id="brandColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color || "#000000"}">
      </div>`;
  }
  if (entity === "styles") {
    const options = brands.map(b => `<option value="${b.id}" ${b.id===data.brandId?"selected":""}>${b.name}</option>`).join("");
    return `
      <div class="mb-2">
        <label class="form-label fw-semibold">Marca</label>
        <select id="styleBrandId" class="form-select">${options}</select>
      </div>
      <div class="mb-2">
        <label class="form-label fw-semibold">Nombre del estilo</label>
        <input id="styleName" class="form-control" value="${data.name || ""}">
      </div>
      <div class="mb-2 text-center">
        <label class="form-label fw-semibold d-block">Color</label>
        <input id="styleColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color || "#000000"}">
      </div>
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="styleShowAlways" ${data.showAlways ? "checked" : ""}>
        <label class="form-check-label" for="styleShowAlways">Mostrar siempre (aunque no haya stock)</label>
      </div>`;
  }
  if (entity === "fermenters") {
    return `
      <div class="mb-2">
        <label class="form-label fw-semibold">Nombre</label>
        <input id="fermenterName" class="form-control" value="${data.name || ""}">
      </div>
      <div class="mb-2">
        <label class="form-label fw-semibold">Capacidad (L)</label>
        <input id="fermenterSize" type="number" class="form-control" value="${data.sizeLiters || 0}">
      </div>
      <div class="mb-2 text-center">
        <label class="form-label fw-semibold d-block">Color</label>
        <input id="fermenterColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color || "#000000"}">
      </div>`;
  }
  if (entity === "containers") {
    return `
      <div class="mb-2">
        <label class="form-label fw-semibold">Nombre</label>
        <input id="containerName" class="form-control" value="${data.name || ""}">
      </div>
      <div class="mb-2">
        <label class="form-label fw-semibold">Tamaño (L)</label>
        <input id="containerSize" type="number" class="form-control" value="${data.sizeLiters || 0}">
      </div>
      <div class="mb-2">
        <label class="form-label fw-semibold">Tipo</label>
        <input id="containerType" class="form-control" value="${data.type || "lata"}" placeholder="lata / barril">
      </div>
      <div class="mb-2 text-center">
        <label class="form-label fw-semibold d-block">Color</label>
        <input id="containerColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color || "#000000"}">
      </div>`;
  }
}

async function openEntityModal(entity, id = null) {
  if (!entityModal) initEntityModal();

  // 🔒 Bloquear edición de MARCA si tiene estilos vinculados
  if (entity === "brands" && id) {
    const styles = tableState.styles.items.length ? tableState.styles.items : await apiGet("styles");
    const linkedCount = styles.filter(s => String(s.brandId) === String(id)).length;
    if (linkedCount > 0) {
      await Swal.fire({
        icon: "info",
        title: "No se puede editar",
        html: `Esta marca tiene <b>${linkedCount}</b> estilo(s) vinculados.<br>Primero eliminá los estilos asociados.`
      });
      return;
    }
  }

  const titleEl = document.getElementById('entityModalTitle');
  const bodyEl  = document.getElementById('entityModalBody');

  let data = {};
  if (id) data = await apiGet(entity, "getById", { id });

  let brands = [];
  if (entity === "styles") brands = await apiGet("brands");

  titleEl.textContent = (id ? "Editar " : "Agregar ") + LABELS[entity];
  bodyEl.innerHTML = modalBodyHtml(entity, data, brands);

  // Evitar doble click en Guardar
  saveBtn.disabled = false;
  saveBtn.onclick = async () => {
    try {
      saveBtn.disabled = true;
      let obj = { id };
      if (entity === "brands") {
        obj.name = document.getElementById("brandName").value.trim();
        obj.color = document.getElementById("brandColor").value;
      } else if (entity === "styles") {
        const sel = document.getElementById("styleBrandId");
        obj.brandId = sel.value;
        obj.brandName = sel.options[sel.selectedIndex].text;
        obj.name = document.getElementById("styleName").value.trim();
        obj.color = document.getElementById("styleColor").value;
        obj.showAlways = document.getElementById("styleShowAlways").checked;
      } else if (entity === "fermenters") {
        obj.name = document.getElementById("fermenterName").value.trim();
        obj.sizeLiters = Number(document.getElementById("fermenterSize").value);
        obj.color = document.getElementById("fermenterColor").value;
      } else if (entity === "containers") {
        obj.name = document.getElementById("containerName").value.trim();
        obj.sizeLiters = Number(document.getElementById("containerSize").value);
        obj.type = document.getElementById("containerType").value.trim();
        obj.color = document.getElementById("containerColor").value;
      }

      const saved = await apiPost(entity, obj);
      if (!saved.ok) throw new Error(saved.error || "No se pudo guardar");
      entityModal.hide();
      Toast.fire({ icon: "success", title: `${LABELS[entity]} guardado` });
      await loadTable(entity, entity + "Table");
    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.message || "No se pudo guardar", "error");
    } finally {
      saveBtn.disabled = false;
    }
  };

  entityModal.show();
}

/* ---------- Botones con bloqueo inmediato ---------- */
async function disableDuring(btn, fn) {
  if (!btn) return fn();
  const prevHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>${btn.textContent}`;
  try {
    await fn();
  } finally {
    btn.disabled = false;
    btn.innerHTML = prevHtml;
  }
}

function handleAddClick(btn, entity) {
  disableDuring(btn, () => openEntityModal(entity));
}
function handleEditClick(btn, entity, id) {
  disableDuring(btn, () => openEntityModal(entity, id));
}
function handleDeleteClick(btn, entity, id) {
  disableDuring(btn, () => deleteItem(entity, id));
}

/* ---------- Delete con confirmación ---------- */
async function deleteItem(entity, id) {
  // 🔒 Bloquear eliminación de MARCA si tiene estilos vinculados
  if (entity === "brands") {
    const styles = tableState.styles.items.length ? tableState.styles.items : await apiGet("styles");
    const linkedCount = styles.filter(s => String(s.brandId) === String(id)).length;
    if (linkedCount > 0) {
      await Swal.fire({
        icon: "info",
        title: "No se puede eliminar",
        html: `Esta marca tiene <b>${linkedCount}</b> estilo(s) vinculados.<br>Primero eliminá los estilos asociados.`
      });
      return;
    }
  }

  const r = await Swal.fire({
    title: "¿Eliminar?",
    text: "Esta acción no se puede deshacer.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
    showLoaderOnConfirm: true,
    allowOutsideClick: () => !Swal.isLoading(),
    preConfirm: async () => {
      const res = await apiDelete(entity, id, false); // sin cascada
      if (!res.ok) throw new Error(res.error || "No se pudo eliminar");
      return true;
    }
  });

  if (r.isConfirmed) {
    Toast.fire({ icon: "success", title: `${LABELS[entity]} eliminado` });
    await loadTable(entity, entity + "Table");
  }
}

/* ---------- Index: Latas vacías (modal Bootstrap + toasts) ---------- */
function initEmptyCans() {
  const btn = document.getElementById("btnAddEmptyCan");
  if (!btn) return;

  const modalEl = document.getElementById("emptyCansModal");
  const modal = new bootstrap.Modal(modalEl);
  const save = document.getElementById("ec_save");

  btn.addEventListener("click", () => {
    document.getElementById("ec_qty").value = 1;
    document.getElementById("ec_batch").value = "";
    document.getElementById("ec_manu").value = "";
    save.disabled = false;
    modal.show();
  });

  save.addEventListener("click", async () => {
    try {
      save.disabled = true;
      const qty = Math.max(1, Number(document.getElementById("ec_qty").value || 1));
      const batch = document.getElementById("ec_batch").value.trim();
      const manufacturer = document.getElementById("ec_manu").value.trim();
      for (let i = 0; i < qty; i++) await apiPost("emptycans", { batch, manufacturer });
      modal.hide();
      Toast.fire({ icon: "success", title: "Latas registradas" });
      await loadEmptyCans();
    } catch (e) {
      console.error(e);
      Swal.fire("Error", "No se pudo guardar", "error");
    } finally {
      save.disabled = false;
    }
  });
}
async function loadEmptyCans() {
  const el = document.getElementById("emptyCansCount");
  if (!el) return;
  try {
    const data = await apiGet("emptycans", "emptycans_count");
    el.textContent = data.count ?? 0;
  } catch (e) { console.error(e); }
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initEntityModal();
  initEmptyCans();
  await loadEmptyCans();

  if (document.getElementById("brandsTable")) {
    await loadTable("brands", "brandsTable");
    await loadTable("styles", "stylesTable");
    await loadTable("fermenters", "fermentersTable");
    await loadTable("containers", "containersTable");
  }
});
