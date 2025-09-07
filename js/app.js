/*
  JS Control de Stock Castelo – TopNav, dark persistente,
  CRUD con Apps Script, estilos con select de marcas.
*/
const API_BASE = "https://script.google.com/macros/s/AKfycbwuCNU6Tf7E_l16zEiDDUdI0pqbGu_VYiGLkhzF66K3q0-ZSd6dX1d850TTTQVAxw0/exec";

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
async function apiDelete(entity, id) {
  return apiPost(entity, { id }, "delete"); // Apps Script no usa doDelete
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
  try {
    const items = await apiGet(entity);
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = "";

    items.forEach((row) => {
      const tr = document.createElement("tr");
      const cells = [];

      if (entity === "brands") {
        cells.push(renderIdShort(row.id), row.name || "", renderColorSquare(row.color), renderDateLocal(row.lastModified));
      } else if (entity === "styles") {
        cells.push(renderIdShort(row.id), row.brandName || "", row.name || "", renderColorSquare(row.color), row.showAlways ? "✔" : "", renderDateLocal(row.lastModified));
      } else if (entity === "fermenters") {
        cells.push(renderIdShort(row.id), row.name || "", row.sizeLiters || "", renderColorSquare(row.color), renderDateLocal(row.lastModified));
      } else if (entity === "containers") {
        cells.push(renderIdShort(row.id), row.name || "", row.sizeLiters || "", row.type || "", renderColorSquare(row.color), renderDateLocal(row.lastModified));
      }

      cells.forEach((html) => {
        const td = document.createElement("td");
        td.innerHTML = html;
        td.style.verticalAlign = "middle";
        tr.appendChild(td);
      });

      const tdA = document.createElement("td");
      tdA.innerHTML = `
        <button class="btn btn-sm btn-warning me-1" onclick="openModal('${entity}','${row.id}')">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="deleteItem('${entity}','${row.id}')">Eliminar</button>`;
      tr.appendChild(tdA);

      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudieron cargar " + LABELS[entity] + "s", "error");
  }
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

  // Para estilos, traemos marcas para el select
  let brands = [];
  if (entity === "styles") brands = await apiGet("brands");

  const cfg = modalHtml(entity, data, brands);
  const { isConfirmed } = await Swal.fire({
    title: cfg.title,
    html: cfg.html,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",
    width: 640
  });
  if (!isConfirmed) return;

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
  if (saved.ok) {
    Swal.fire("Guardado", `${LABELS[entity]} guardado correctamente`, "success");
    loadTable(entity, entity + "Table");
  } else {
    Swal.fire("Error", saved.error || "No se pudo guardar", "error");
  }
}

/* ---------- Delete ---------- */
async function deleteItem(entity, id) {
  const r = await Swal.fire({
    title: "¿Eliminar?",
    text: `Vas a eliminar este ${LABELS[entity].toLowerCase()}.`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  });
  if (!r.isConfirmed) return;

  const res = await apiDelete(entity, id);
  if (res.ok) {
    Swal.fire("Eliminado", `${LABELS[entity]} eliminado`, "success");
    loadTable(entity, entity + "Table");
  } else {
    Swal.fire("Error", res.error || "No se pudo eliminar", "error");
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
