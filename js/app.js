/*
  JavaScript para Control de Stock Castelo
  Conexión a Apps Script publicado como API REST.
*/

const API_BASE = "https://script.google.com/macros/s/AKfycbwuCNU6Tf7E_l16zEiDDUdI0pqbGu_VYiGLkhzF66K3q0-ZSd6dX1d850TTTQVAxw0/exec";

// ---------- Helpers API ----------
async function apiGet(entity, action = "getAll", extra = {}) {
  const params = new URLSearchParams({ entity, action, ...extra });
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  return res.json();
}

async function apiPost(entity, data) {
  const res = await fetch(`${API_BASE}?entity=${entity}`, {
    method: "POST",
    body: JSON.stringify(data),
  });
  return res.json();
}

async function apiDelete(entity, id) {
  const res = await fetch(`${API_BASE}?entity=${entity}&id=${id}`, {
    method: "DELETE",
  });
  return res.json();
}

// ---------- UI ----------
function initTheme() {
  const toggle = document.getElementById("themeSwitch");
  if (!toggle) return;
  toggle.addEventListener("change", () => {
    document.documentElement.setAttribute("data-theme", toggle.checked ? "dark" : "light");
    localStorage.setItem("theme", toggle.checked ? "dark" : "light");
  });
  const saved = localStorage.getItem("theme") || "light";
  toggle.checked = saved === "dark";
  document.documentElement.setAttribute("data-theme", saved);
}

function initSidebar() {
  const btn = document.getElementById("btnToggleSidebar");
  if (!btn) return;
  btn.addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("collapsed");
  });
}

// ---------- Latas Vacías ----------
async function loadEmptyCans() {
  try {
    const data = await apiGet("emptycans", "emptycans_count");
    document.getElementById("emptyCansCount").textContent = data.count;
  } catch (err) {
    Swal.fire("Error al cargar latas", err.message || "Failed to fetch", "error");
  }
}

function addEmptyCan() {
  Swal.fire({
    title: "Agregar lata vacía",
    html: `
      <input id="batch" class="swal2-input" placeholder="Lote (opcional)">
      <input id="manufacturer" class="swal2-input" placeholder="Fabricante (opcional)">
      <input id="purchase" class="swal2-input" placeholder="Compra (opcional)">
    `,
    focusConfirm: false,
    preConfirm: () => {
      return {
        batch: document.getElementById("batch").value,
        manufacturer: document.getElementById("manufacturer").value,
        purchase: document.getElementById("purchase").value,
      };
    },
    showCancelButton: true,
    confirmButtonText: "Guardar",
  }).then(async (result) => {
    if (result.isConfirmed) {
      const saved = await apiPost("emptycans", result.value);
      if (saved.ok) {
        Swal.fire("Guardado", "Lata vacía registrada", "success");
        loadEmptyCans();
      } else {
        Swal.fire("Error", saved.error || "No se pudo guardar", "error");
      }
    }
  });
}

// ---------- CRUD Configuración ----------
async function loadTable(entity, tableId) {
  try {
    const items = await apiGet(entity);
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = "";
    items.forEach((row) => {
      const tr = document.createElement("tr");
      Object.values(row).forEach((val) => {
        const td = document.createElement("td");
        td.textContent = val;
        tr.appendChild(td);
      });
      const tdActions = document.createElement("td");
      tdActions.innerHTML = `
        <button class="btn btn-sm btn-warning me-1" onclick="editItem('${entity}','${row.id}')">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="deleteItem('${entity}','${row.id}')">Eliminar</button>
      `;
      tr.appendChild(tdActions);
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudieron cargar los datos de " + entity, "error");
  }
}

async function editItem(entity, id) {
  const item = await apiGet(entity, "getById", { id });
  Swal.fire({
    title: "Editar " + entity,
    input: "text",
    inputValue: item.name || "",
    showCancelButton: true,
    confirmButtonText: "Guardar",
  }).then(async (r) => {
    if (r.isConfirmed) {
      item.name = r.value;
      const saved = await apiPost(entity, item);
      if (saved.ok) {
        Swal.fire("Guardado", "Registro actualizado", "success");
        loadTable(entity, entity + "Table");
      }
    }
  });
}

async function deleteItem(entity, id) {
  const confirm = await Swal.fire({
    title: "¿Eliminar?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
  });
  if (confirm.isConfirmed) {
    const res = await apiDelete(entity, id);
    if (res.ok) {
      Swal.fire("Eliminado", "Registro borrado", "success");
      loadTable(entity, entity + "Table");
    }
  }
}

// ---------- Inicialización ----------
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initSidebar();

  if (document.getElementById("emptyCansCount")) {
    loadEmptyCans();
    document.getElementById("btnAddEmptyCan").addEventListener("click", addEmptyCan);
  }

  if (document.getElementById("brandsTable")) {
    loadTable("brands", "brandsTable");
    loadTable("styles", "stylesTable");
    loadTable("fermenters", "fermentersTable");
    loadTable("containers", "containersTable");
  }
});
