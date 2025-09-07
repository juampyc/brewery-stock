/*
  JS Control de Stock Castelo – TopNav, dark persistente,
  CRUD con Apps Script, estilos con select de marcas.
*/
const API_BASE = "https://script.google.com/macros/s/AKfycbxqI4TZxWb6ZQ7bfW8k5v5zEpqe57o66zoTfxNEkcyZ74McJkrwpjeSEXK8NJSxhgRo/exec";

const tableState = {
  brands: { items: [], q: "", page: 1, pageSize: 10 },
  styles: { items: [], q: "", page: 1, pageSize: 10 },
  fermenters: { items: [], q: "", page: 1, pageSize: 10 },
  containers: { items: [], q: "", page: 1, pageSize: 10 },
};

function setSearchHandlers(entity) {
  const qIn = document.getElementById(`${entity}Search`);
  const ps  = document.getElementById(`${entity}PageSize`);
  if (qIn) qIn.addEventListener("input", () => { tableState[entity].q = qIn.value; tableState[entity].page = 1; renderTable(entity); });
  if (ps)  ps.addEventListener("change", () => { tableState[entity].pageSize = Number(ps.value); tableState[entity].page = 1; renderTable(entity); });
}

/* ---------- API ---------- */
async function apiGet(entity, action = "getAll", extra = {}) {
  const params = new URLSearchParams({ entity, action, ...extra });
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  return res.json();
}
async function apiPost(entity, data, action) {
  const url = action
    ? `${API_BASE}?entity=${entity}&action=${action}`
    : `${API_BASE}?entity=${entity}`;

  const res = await fetch(url, {
    method: "POST",
    // ⛔️ NO PONGAS headers: {"Content-Type":"application/json"}
    // para evitar el preflight CORS (OPTIONS 405).
    body: JSON.stringify(data || {})
  });
  return res.json();
}

async function apiDelete(entity, id) {
  return apiPost(entity, { id }, "delete");
}

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

/* ---------- Helpers render ---------- */
function renderIdShort(id) { return id ? id.slice(-6) : ""; }
function renderColorSquare(color) {
  if (!color) return "";
  return `<div class="color-box" style="background:${color}; margin:auto;"></div>`;
}
/* “YYYY-MM-DD HH:mm:ss” → local, y si viene ISO/Z también */
function renderDateLocal(s) {
  if (!s) return "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const [_, Y, M, D, h, mm, ss] = m.map(Number);
    return new Date(Y, M - 1, D, h, mm, ss).toLocaleString();
  }
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleString();
}

const LABELS = { brands: "Marca", styles: "Estilo", fermenters: "Fermentador", containers: "Envase" };

/* ---------- Tablas ---------- */
async function loadTable(entity, tableId) {
  const items = await apiGet(entity);
  tableState[entity].items = items;
  renderTable(entity, tableId);
  setSearchHandlers(entity);
}

function rowMatches(row, q) {
  if (!q) return true;
  const s = JSON.stringify(row).toLowerCase();
  return s.includes(q.toLowerCase());
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
      <button class="btn btn-sm btn-warning me-1" onclick="openModal('${entity}','${row.id}')">Editar</button>
      <button class="btn btn-sm btn-danger" onclick="deleteItem('${entity}','${row.id}')">Eliminar</button>`;
    tr.appendChild(tdA);

    tbody.appendChild(tr);
  });

  // paginación
  renderPager(entity, pages);
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
    a.className = "page-link";
    a.href = "#";
    a.textContent = label;
    a.onclick = (e) => { e.preventDefault(); if (disabled || active) return; st.page = page; renderTable(entity); };
    li.appendChild(a);
    ul.appendChild(li);
  };

  add("«", 1, st.page === 1, false);
  add("‹", Math.max(1, st.page - 1), st.page === 1, false);
  for (let p = 1; p <= pages; p++) add(String(p), p, false, p === st.page);
  add("›", Math.min(pages, st.page + 1), st.page === pages, false);
  add("»", pages, st.page === pages, false);
}


/* ---------- Modales ---------- */
function modalHtml(entity, data = {}, brands = []) {
  const title = (id) => (id ? "Editar " : "Agregar ") + LABELS[entity];

  const brandsSelect = (selId, value) => `
    <select id="${selId}" class="form-select">
      ${brands.map(b => `<option value="${b.id}" ${b.id === value ? "selected" : ""}>${b.name}</option>`).join("")}
    </select>`;

  const htmlPieces = {
    brands: `
      <div class="mb-2"><label class="form-label fw-semibold">Nombre</label>
        <input id="brandName" class="form-control" value="${data.name || ""}"></div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="brandColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color || "#000000"}"></div>
    `,
    styles: `
      <div class="mb-2"><label class="form-label fw-semibold">Marca</label>
        ${brandsSelect("styleBrandId", data.brandId)}</div>
      <div class="mb-2"><label class="form-label fw-semibold">Nombre del estilo</label>
        <input id="styleName" class="form-control" value="${data.name || ""}"></div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="styleColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color || "#000000"}"></div>
      <div class="form-check"><input class="form-check-input" type="checkbox" id="styleShowAlways" ${data.showAlways ? "checked" : ""}>
        <label class="form-check-label" for="styleShowAlways">Mostrar siempre (aunque no haya stock)</label></div>
    `,
    fermenters: `
      <div class="mb-2"><label class="form-label fw-semibold">Nombre</label>
        <input id="fermenterName" class="form-control" value="${data.name || ""}"></div>
      <div class="mb-2"><label class="form-label fw-semibold">Capacidad (L)</label>
        <input id="fermenterSize" type="number" class="form-control" value="${data.sizeLiters || 0}"></div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="fermenterColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color || "#000000"}"></div>
    `,
    containers: `
      <div class="mb-2"><label class="form-label fw-semibold">Nombre</label>
        <input id="containerName" class="form-control" value="${data.name || ""}"></div>
      <div class="mb-2"><label class="form-label fw-semibold">Tamaño (L)</label>
        <input id="containerSize" type="number" class="form-control" value="${data.sizeLiters || 0}"></div>
      <div class="mb-2"><label class="form-label fw-semibold">Tipo</label>
        <input id="containerType" class="form-control" value="${data.type || "lata"}" placeholder="lata / barril"></div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="containerColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color || "#000000"}"></div>
    `,
  };

  return { title: title(!!data.id), html: htmlPieces[entity] };
}

async function openModal(entity, id = null) {
  let data = {};
  if (id) data = await apiGet(entity, "getById", { id });

  // para estilos: select de marcas
  let brands = [];
  if (entity === "styles") brands = await apiGet("brands");

  const cfg = modalHtml(entity, data, brands);
  const result = await Swal.fire({
    title: cfg.title,
    html: cfg.html,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",
    width: 640,
    showLoaderOnConfirm: true,
    allowOutsideClick: () => !Swal.isLoading(),
    preConfirm: async () => {
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
      return saved.item;
    }
  });

  if (result.isConfirmed) {
    Swal.fire("Guardado", `${LABELS[entity]} guardado correctamente`, "success");
    // recargar datos
    const tableId = entity + "Table";
    await loadTable(entity, tableId);
  }
}

async function deleteItem(entity, id) {
  let htmlExtra = "";
  let cascade = false;

  if (entity === "brands") {
    const styles = await apiGet("styles");
    const linkedCount = styles.filter(s => String(s.brandId) === String(id)).length;
    if (linkedCount > 0) {
      htmlExtra = `
        <p class="mb-2">Esta marca tiene <b>${linkedCount}</b> estilo(s) vinculados.</p>
        <div class="form-check">
          <input class="form-check-input" type="checkbox" id="cascadeDelete">
          <label class="form-check-label" for="cascadeDelete">Eliminar también los estilos vinculados</label>
        </div>`;
    }
  }

  const r = await Swal.fire({
    title: "¿Eliminar?",
    html: htmlExtra || "Esta acción no se puede deshacer.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
    showLoaderOnConfirm: true,
    allowOutsideClick: () => !Swal.isLoading(),
    preConfirm: async () => {
      cascade = document.getElementById("cascadeDelete")?.checked || false;
      const res = await apiPost(entity, { id, cascade }, "delete");
      if (!res.ok) throw new Error(res.error || "No se pudo eliminar");
      return true;
    }
  });

  if (r.isConfirmed) {
    Swal.fire("Eliminado", `${LABELS[entity]} eliminado`, "success");
    renderTable(entity); // refresco actual
    const tableId = entity + "Table";
    await loadTable(entity, tableId); // garantizo refresco desde backend
  }
}

/* ---------- Index: latas vacías ---------- */
async function loadEmptyCans() {
  const el = document.getElementById("emptyCansCount");
  if (!el) return;
  try {
    const data = await apiGet("emptycans", "emptycans_count");
    el.textContent = data.count ?? 0;
  } catch (e) { console.error(e); }
}
function initEmptyCansButton() {
  const btn = document.getElementById("btnAddEmptyCan");
  if (!btn) return;
  btn.addEventListener("click", () => {
    Swal.fire({
      title: "Agregar latas vacías",
      html: `
        <div class="mb-2"><label class="form-label fw-semibold">Cantidad</label>
          <input id="ec_qty" type="number" class="form-control" value="1" min="1"></div>
        <div class="mb-2"><label class="form-label fw-semibold">Lote (opcional)</label>
          <input id="ec_batch" class="form-control"></div>
        <div class="mb-2"><label class="form-label fw-semibold">Fabricante / Compra (opcional)</label>
          <input id="ec_manu" class="form-control"></div>
      `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar"
    }).then(async (r) => {
      if (!r.isConfirmed) return;
      const qty = Math.max(1, Number(document.getElementById("ec_qty").value || 1));
      const batch = document.getElementById("ec_batch").value.trim();
      const manufacturer = document.getElementById("ec_manu").value.trim();
      for (let i = 0; i < qty; i++) await apiPost("emptycans", { batch, manufacturer });
      Swal.fire("Guardado", "Latas registradas", "success");
      loadEmptyCans();
    });
  });
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  loadEmptyCans();
  initEmptyCansButton();

  if (document.getElementById("brandsTable")) {
    loadTable("brands", "brandsTable");
    loadTable("styles", "stylesTable");
    loadTable("fermenters", "fermentersTable");
    loadTable("containers", "containersTable");
  }
});
