// === CONFIG ===
const API = "https://script.google.com/macros/s/AKfycbxUStfukZGj5m4uLpgTC8xzBcdaz_HxzHyd8zFX8rSXOQfx4sBg7rQC328_vptPziT_/exec";

// === Tema oscuro/claro (igual que index) ===
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("btn-theme");
  btn.addEventListener("click", () => {
    const link = document.getElementById("theme-style");
    if (link.getAttribute("href").includes("dark.css")) {
      link.setAttribute("href", "./light.css");
      btn.textContent = "Modo Oscuro";
    } else {
      link.setAttribute("href", "./dark.css");
      btn.textContent = "Modo Claro";
    }
  });
});

// === Helpers ===
function showToast(text, type = "info") {
  Swal.fire({
    text,
    icon: type === "ok" ? "success" : type === "error" ? "error" : "info",
    timer: 2000,
    showConfirmButton: false,
    position: "center"
  });
}

function norm(s) {
  return (s || "").toString().trim();
}
function normKey(brand, style) {
  return `${norm(brand)}|${norm(style)}`.toUpperCase();
}

// Leer Show tolerando distintos encabezados
function readShowField(row) {
  if ("Show" in row) return !!row.Show;
  if ("ShowAlways" in row) return !!row.ShowAlways;
  if ("ShowAlwa" in row) return !!row.ShowAlwa;
  return false;
}

// === Carga y render ===
let CONFIG_CACHE = [];

async function loadStyles() {
  const r = await fetch(API);
  const data = await r.json();

  CONFIG_CACHE = (data.config || []).map(x => ({
    Brand: x.Brand,
    Style: x.Style,
    Show: readShowField(x),
    Color: x.Color || "#9e9e9e",
    Mutation: x["Mutation Date/Time"] || ""
  }));

  renderTable(CONFIG_CACHE);
}

function renderTable(rows) {
  const tbody = document.querySelector("#stylesTable tbody");
  tbody.innerHTML = "";

  rows.forEach(s => {
    const tr = document.createElement("tr");
    tr.dataset.brand = s.Brand;
    tr.dataset.style = s.Style;

    tr.innerHTML = `
      <td>${s.Brand}</td>
      <td>${s.Style}</td>
      <td><span class="badge ${s.Show ? "bg-success" : "bg-secondary"}">${s.Show ? "Sí" : "No"}</span></td>
      <td>
        <div style="width:20px;height:20px;border-radius:3px;display:inline-block;background:${s.Color};border:1px solid #aaa"></div>
        <span class="ms-2">${s.Color}</span>
      </td>
      <td>${s.Mutation ? new Date(s.Mutation).toLocaleString() : ""}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-warning me-2" data-action="edit">Editar</button>
        <button class="btn btn-sm btn-danger" data-action="del">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// === Alta ===
document.getElementById("btn-add").addEventListener("click", async () => {
  const { value: formValues } = await Swal.fire({
    title: "Nuevo estilo",
    html: `
      <input id="sw-brand" class="swal2-input" placeholder="Marca">
      <input id="sw-style" class="swal2-input" placeholder="Estilo">
      <label class="d-block mt-2">
        <input type="checkbox" id="sw-show" class="form-check-input"> Mostrar siempre
      </label>
      <input type="color" id="sw-color" class="swal2-input" value="#9e9e9e">
    `,
    focusConfirm: false,
    preConfirm: () => ({
      brand: norm(document.getElementById("sw-brand").value),
      style: norm(document.getElementById("sw-style").value),
      show: document.getElementById("sw-show").checked,
      color: document.getElementById("sw-color").value
    }),
    confirmButtonText: "Guardar",
    showCancelButton: true,
    cancelButtonText: "Cancelar"
  });

  if (!formValues) return;

  const exists = CONFIG_CACHE.some(
    s => normKey(s.Brand, s.Style) === normKey(formValues.brand, formValues.style)
  );
  if (exists) {
    showToast("Ya existe ese estilo", "error");
    return;
  }

  const r = await fetch(API, {
    method: "POST",
    body: JSON.stringify({ action: "config_add_style", ...formValues })
  });
  const d = await r.json();
  showToast(d.ok ? "Estilo agregado" : d.error, d.ok ? "ok" : "error");
  if (d.ok) loadStyles();
});

// === Editar y Eliminar con delegación ===
document.querySelector("#stylesTable tbody").addEventListener("click", async (ev) => {
  const btn = ev.target.closest("button");
  if (!btn) return;
  const tr = btn.closest("tr");
  const brand = tr.dataset.brand;
  const style = tr.dataset.style;

  if (btn.dataset.action === "del") {
    const confirm = await Swal.fire({
      title: "¿Eliminar estilo?",
      text: `${brand} - ${style}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar"
    });
    if (!confirm.isConfirmed) return;

    const r = await fetch(API, {
      method: "POST",
      body: JSON.stringify({ action: "config_delete_style", brand, style })
    });
    const d = await r.json();
    showToast(d.ok ? "Estilo eliminado" : d.error, d.ok ? "ok" : "error");
    if (d.ok) loadStyles();
  }

  if (btn.dataset.action === "edit") {
    const row = CONFIG_CACHE.find(s => normKey(s.Brand, s.Style) === normKey(brand, style));
    if (!row) return;

    const { value: formValues } = await Swal.fire({
      title: "Editar estilo",
      html: `
        <input id="sw-brand" class="swal2-input" value="${row.Brand}">
        <input id="sw-style" class="swal2-input" value="${row.Style}">
        <label class="d-block mt-2">
          <input type="checkbox" id="sw-show" class="form-check-input" ${row.Show ? "checked" : ""}> Mostrar siempre
        </label>
        <input type="color" id="sw-color" class="swal2-input" value="${row.Color}">
      `,
      focusConfirm: false,
      preConfirm: () => ({
        brand: norm(document.getElementById("sw-brand").value),
        style: norm(document.getElementById("sw-style").value),
        show: document.getElementById("sw-show").checked,
        color: document.getElementById("sw-color").value
      }),
      confirmButtonText: "Guardar",
      showCancelButton: true,
      cancelButtonText: "Cancelar"
    });

    if (!formValues) return;

    const r = await fetch(API, {
      method: "POST",
      body: JSON.stringify({
        action: "config_update_style",
        oldBrand: row.Brand,
        oldStyle: row.Style,
        ...formValues
      })
    });
    const d = await r.json();
    showToast(d.ok ? "Estilo actualizado" : d.error, d.ok ? "ok" : "error");
    if (d.ok) loadStyles();
  }
});

// === Iniciar ===
loadStyles();
