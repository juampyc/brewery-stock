/*
  JavaScript para Control de Stock Castelo
  CRUD + integración con Apps Script vía fetch.
  Modales HTML para agregar/editar entidades.
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

// ---------- Utilidades ----------
function renderIdShort(id) {
  return id ? id.slice(-6) : "";
}

function renderColorSquare(color) {
  if (!color) return "";
  return `<div style="width:20px; height:20px; border-radius:4px; background:${color};"></div>`;
}

function renderDateLocal(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString();
  } catch {
    return dateStr;
  }
}

// ---------- Tablas ----------
async function loadTable(entity, tableId) {
  try {
    const items = await apiGet(entity);
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = "";
    items.forEach((row) => {
      const tr = document.createElement("tr");

      if (entity === "brands") {
        tr.innerHTML = `
          <td>${renderIdShort(row.id)}</td>
          <td>${row.name || ""}</td>
          <td>${renderColorSquare(row.color)}</td>
          <td>${renderDateLocal(row.lastModified)}</td>
          <td>
            <button class="btn btn-sm btn-warning me-1" onclick="openModal('${entity}', '${row.id}')">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="deleteItem('${entity}','${row.id}')">Eliminar</button>
          </td>`;
      } else if (entity === "styles") {
        tr.innerHTML = `
          <td>${renderIdShort(row.id)}</td>
          <td>${row.brandName || ""}</td>
          <td>${row.name || ""}</td>
          <td>${renderColorSquare(row.color)}</td>
          <td>${row.showAlways ? "✔" : ""}</td>
          <td>${renderDateLocal(row.lastModified)}</td>
          <td>
            <button class="btn btn-sm btn-warning me-1" onclick="openModal('${entity}', '${row.id}')">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="deleteItem('${entity}','${row.id}')">Eliminar</button>
          </td>`;
      } else if (entity === "fermenters") {
        tr.innerHTML = `
          <td>${renderIdShort(row.id)}</td>
          <td>${row.name || ""}</td>
          <td>${row.sizeLiters || ""}</td>
          <td>${renderColorSquare(row.color)}</td>
          <td>${renderDateLocal(row.lastModified)}</td>
          <td>
            <button class="btn btn-sm btn-warning me-1" onclick="openModal('${entity}', '${row.id}')">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="deleteItem('${entity}','${row.id}')">Eliminar</button>
          </td>`;
      } else if (entity === "containers") {
        tr.innerHTML = `
          <td>${renderIdShort(row.id)}</td>
          <td>${row.name || ""}</td>
          <td>${row.sizeLiters || ""}</td>
          <td>${row.type || ""}</td>
          <td>${renderColorSquare(row.color)}</td>
          <td>${renderDateLocal(row.lastModified)}</td>
          <td>
            <button class="btn btn-sm btn-warning me-1" onclick="openModal('${entity}', '${row.id}')">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="deleteItem('${entity}','${row.id}')">Eliminar</button>
          </td>`;
      }
      tbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    Swal.fire("Error", "No se pudieron cargar los datos de " + entity, "error");
  }
}

// ---------- Modales ----------
function modalHtml(entity, data = {}) {
  if (entity === "brands") {
    return `
      <div class="mb-3"><label>Nombre</label><input id="brandName" class="form-control" value="${data.name || ""}"></div>
      <div class="mb-3"><label>Color</label><input id="brandColor" type="color" class="form-control form-control-color" value="${data.color || "#000000"}"></div>`;
  }
  if (entity === "styles") {
    return `
      <div class="mb-3"><label>Marca</label><input id="styleBrandName" class="form-control" value="${data.brandName || ""}" placeholder="Nombre marca"></div>
      <div class="mb-3"><label>Nombre</label><input id="styleName" class="form-control" value="${data.name || ""}"></div>
      <div class="mb-3"><label>Color</label><input id="styleColor" type="color" class="form-control form-control-color" value="${data.color || "#000000"}"></div>
      <div class="mb-3"><label><input type="checkbox" id="styleShowAlways" ${data.showAlways ? "checked" : ""}> Mostrar siempre</label></div>`;
  }
  if (entity === "fermenters") {
    return `
      <div class="mb-3"><label>Nombre</label><input id="fermenterName" class="form-control" value="${data.name || ""}"></div>
      <div class="mb-3"><label>Capacidad (L)</label><input id="fermenterSize" type="number" class="form-control" value="${data.sizeLiters || 0}"></div>
      <div class="mb-3"><label>Color</label><input id="fermenterColor" type="color" class="form-control form-control-color" value="${data.color || "#000000"}"></div>`;
  }
  if (entity === "containers") {
    return `
      <div class="mb-3"><label>Nombre</label><input id="containerName" class="form-control" value="${data.name || ""}"></div>
      <div class="mb-3"><label>Tamaño (L)</label><input id="containerSize" type="number" class="form-control" value="${data.sizeLiters || 0}"></div>
      <div class="mb-3"><label>Tipo</label><input id="containerType" class="form-control" value="${data.type || "lata"}"></div>
      <div class="mb-3"><label>Color</label><input id="containerColor" type="color" class="form-control form-control-color" value="${data.color || "#000000"}"></div>`;
  }
}

async function openModal(entity, id = null) {
  let data = {};
  if (id) {
    data = await apiGet(entity, "getById", { id });
  }
  const { value: confirmed } = await Swal.fire({
    title: id ? "Editar " + entity : "Agregar " + entity,
    html: modalHtml(entity, data),
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: "Guardar",
    preConfirm: () => true,
  });
  if (confirmed) {
    await saveModal(entity, id, data);
  }
}

async function saveModal(entity, id, oldData = {}) {
  let obj = { id: id || undefined };
  if (entity === "brands") {
    obj.name = document.getElementById("brandName").value;
    obj.color = document.getElementById("brandColor").value;
  }
  if (entity === "styles") {
    obj.brandName = document.getElementById("styleBrandName").value;
    obj.name = document.getElementById("styleName").value;
    obj.color = document.getElementById("styleColor").value;
    obj.showAlways = document.getElementById("styleShowAlways").checked;
  }
  if (entity === "fermenters") {
    obj.name = document.getElementById("fermenterName").value;
    obj.sizeLiters = Number(document.getElementById("fermenterSize").value);
    obj.color = document.getElementById("fermenterColor").value;
  }
  if (entity === "containers") {
    obj.name = document.getElementById("containerName").value;
    obj.sizeLiters = Number(document.getElementById("containerSize").value);
    obj.type = document.getElementById("containerType").value;
    obj.color = document.getElementById("containerColor").value;
  }

  const saved = await apiPost(entity, obj);
  if (saved.ok) {
    Swal.fire("Guardado", "Registro actualizado", "success");
    loadTable(entity, entity + "Table");
  } else {
    Swal.fire("Error", saved.error || "No se pudo guardar", "error");
  }
}

// ---------- Delete ----------
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
  if (document.getElementById("brandsTable")) {
    loadTable("brands", "brandsTable");
    loadTable("styles", "stylesTable");
    loadTable("fermenters", "fermentersTable");
    loadTable("containers", "containersTable");
  }
});
