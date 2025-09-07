/*
  JS Control de Stock Castelo – Bootstrap modals nativos + SweetAlert (confirm/Toast)
  ► Ajustado con: Movimientos + Totales, Desglose, Diario con saldo acumulado y CSV
*/
const API_BASE = "https://script.google.com/macros/s/AKfycbyC5R2_esM9BwXZLRmF2gcqrLU163eBh_rK-8GOb_gzuJkKj4E8gR0g8BhsgsFf-wqi/exec";

/* =========================
   API
   ========================= */
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
  return apiPost(entity, { id }, "delete");
}

/* =========================
   Toast
   ========================= */
const Toast = Swal.mixin({
  toast: true, position: "top-end", showConfirmButton: false,
  timer: 1700, timerProgressBar: true,
  didOpen: t => {
    t.addEventListener("mouseenter", Swal.stopTimer);
    t.addEventListener("mouseleave", Swal.resumeTimer);
  }
});

/* =========================
   Tema
   ========================= */
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

/* =========================
   Estado tablas
   ========================= */
const tableState = {
  brands:      { items: [], q: "", page: 1, pageSize: 10 },
  styles:      { items: [], q: "", page: 1, pageSize: 10 },
  fermenters:  { items: [], q: "", page: 1, pageSize: 10 },
  containers:  { items: [], q: "", page: 1, pageSize: 10 },
  labels:      { items: [], q: "", page: 1, pageSize: 10 },
  // Movimientos (kardex)
  movements:   { items: [], q: "", page: 1, pageSize: 10, entity: "", from: "", to: "" }
};

const LABELS = {
  brands: "Marca", styles: "Estilo", fermenters: "Fermentador",
  containers: "Envase", labels: "Etiqueta", movements: "Movimiento"
};

/* =========================
   Helpers UI
   ========================= */
function renderIdShort(id) { return id ? id.slice(-6) : ""; }
function renderColorSquare(color) {
  return color ? `<div class="color-box mx-auto" style="background:${color};"></div>` : "";
}
function renderDateLocal(s) {
  if (!s) return "";
  // ISO con Z o +/-TZ
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(Z|[+\-]\d{2}:\d{2})$/.test(s)) {
    const d = new Date(s); return isNaN(d) ? s : d.toLocaleString();
  }
  // "yyyy-MM-dd HH:mm:ss"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const d = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +(m[6]||0));
    return d.toLocaleString();
  }
  const d = new Date(s); return isNaN(d) ? s : d.toLocaleString();
}
const todayInputValue = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
};

/* =========================
   Movimientos: filtros + CSV + Totales + Diario
   ========================= */
function applyMovementFilters(list) {
  const st = tableState.movements;
  const entity = st.entity || "";
  const from = st.from || "";
  const to = st.to || "";
  return list.filter(r => {
    if (entity && String(r.entity) !== entity) return false;
    const d = String(r.dateTime || "").slice(0, 10); // "YYYY-MM-DD"
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

// CSV utils (compartido)
function csvEscape(v) {
  let s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) s = `"${s.replace(/"/g,'""')}"`;
  return s;
}
function downloadFile(name, content) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

// Lista filtrada (búsqueda + entidad + fecha)
function getFilteredMovements() {
  const st = tableState.movements;
  let list = (st.items || []).filter(r => rowMatches(r, st.q || ""));
  list = applyMovementFilters(list);
  return list;
}

// Export CSV listado
function exportMovementsCSV() {
  const list = getFilteredMovements();
  const headers = ["id","entity","entityId","type","qty","dateTime","description","lastModified"];
  const lines = [headers.join(",")].concat(
    list.map(r => headers.map(h => csvEscape(r[h])).join(","))
  );
  downloadFile(`movimientos_${Date.now()}.csv`, lines.join("\n"));
}

// Totales generales + Desglose
function computeTotals(list) {
  let inSum = 0, outSum = 0;
  for (const r of list) {
    const t = String(r.type || "").toLowerCase();
    const q = Number(r.qty || 0);
    if (t === "alta") inSum += q;
    else if (t === "baja") outSum += q;
  }
  return { in: inSum, out: outSum, net: inSum - outSum };
}

function renderMovementsTotals() {
  const list = getFilteredMovements();
  const t = computeTotals(list);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("mv_total_in",  t.in);
  set("mv_total_out", t.out);
  set("mv_total_net", t.net);

  // Desglose
  const wrap = document.getElementById("mv_breakdown_wrap");
  const tbody = document.querySelector("#mv_breakdown_table tbody");
  const title = document.getElementById("mv_breakdown_title");
  if (!wrap || !tbody || !title) return;

  const st = tableState.movements;
  tbody.innerHTML = "";

  if (list.length === 0) {
    wrap.classList.add("d-none");
    return;
  }

  if (!st.entity) {
    // Por ENTIDAD
    title.textContent = "Desglose por entidad";
    const map = new Map(); // key -> {in,out}
    for (const r of list) {
      const key = String(r.entity || "");
      if (!map.has(key)) map.set(key, { in: 0, out: 0 });
      const obj = map.get(key);
      const q = Number(r.qty || 0);
      const tt = String(r.type || "").toLowerCase();
      if (tt === "alta") obj.in += q; else if (tt === "baja") obj.out += q;
    }
    for (const [k, v] of map.entries()) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${k || "(sin entidad)"}</td><td>${v.in}</td><td>${v.out}</td><td>${v.in - v.out}</td>`;
      tbody.appendChild(tr);
    }
    wrap.classList.remove("d-none");
  } else if (st.entity === "labels") {
    // Por ESTILO (o custom)
    title.textContent = "Desglose por estilo";
    const map = new Map(); // estilo/custom -> {in,out}
    for (const r of list) {
      let key = "(labels)";
      const desc = String(r.description || "");
      if (desc.startsWith("estilo:")) key = desc.slice(7);
      else if (desc.startsWith("custom:")) key = "(custom) " + desc.slice(7);
      if (!map.has(key)) map.set(key, { in: 0, out: 0 });
      const obj = map.get(key);
      const q = Number(r.qty || 0);
      const tt = String(r.type || "").toLowerCase();
      if (tt === "alta") obj.in += q; else if (tt === "baja") obj.out += q;
    }
    for (const [k, v] of map.entries()) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${k}</td><td>${v.in}</td><td>${v.out}</td><td>${v.in - v.out}</td>`;
      tbody.appendChild(tr);
    }
    wrap.classList.remove("d-none");
  } else {
    wrap.classList.add("d-none");
  }
}

// Saldo de apertura: movimientos anteriores al "Desde"
function getOpeningBalance() {
  const st = tableState.movements;
  const from = st.from || "";
  if (!from) return 0; // sin "desde", 0
  let list = st.items || [];
  if (st.entity) list = list.filter(r => String(r.entity) === String(st.entity));
  // (No aplicamos búsqueda texto al saldo de apertura)
  list = list.filter(r => String(r.dateTime || "").slice(0,10) < from);

  let altas = 0, bajas = 0;
  for (const r of list) {
    const t = String(r.type || "").toLowerCase();
    const q = Number(r.qty || 0);
    if (t === "alta") altas += q; else if (t === "baja") bajas += q;
  }
  return altas - bajas;
}

// Totales por día + saldo acumulado
function computeDailyWithBalance() {
  const list = getFilteredMovements();
  // Agrupar por fecha
  const map = new Map();
  for (const r of list) {
    const d = String(r.dateTime || "").slice(0,10);
    const t = String(r.type || "").toLowerCase();
    const q = Number(r.qty || 0);
    if (!map.has(d)) map.set(d, { in: 0, out: 0 });
    if (t === "alta") map.get(d).in += q;
    else if (t === "baja") map.get(d).out += q;
  }
  const days = Array.from(map.entries())
    .map(([date, v]) => ({ date, in: v.in, out: v.out, net: v.in - v.out }))
    .sort((a,b) => a.date.localeCompare(b.date));

  // Saldo apertura + acumulado
  let balance = getOpeningBalance();
  for (const d of days) {
    balance += d.net;
    d.balance = balance;
  }
  return days;
}

function renderMovementsDaily() {
  const wrap = document.getElementById("mv_daily_wrap");
  const tbody = document.querySelector("#mv_daily_table tbody");
  if (!wrap || !tbody) return;

  const days = computeDailyWithBalance();
  tbody.innerHTML = "";

  if (days.length === 0) {
    wrap.classList.add("d-none");
    return;
  }
  for (const d of days) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${d.date}</td><td>${d.in}</td><td>${d.out}</td><td>${d.net}</td><td>${d.balance}</td>`;
    tbody.appendChild(tr);
  }
  wrap.classList.remove("d-none");
}

function exportMovementsDailyCSV() {
  const rows = computeDailyWithBalance();
  const headers = ["date","in","out","net","balance"];
  const lines = [headers.join(",")].concat(
    rows.map(r => [r.date, r.in, r.out, r.net, r.balance].map(csvEscape).join(","))
  );
  downloadFile(`movimientos_diario_${Date.now()}.csv`, lines.join("\n"));
}

/* =========================
   Search + pager
   ========================= */
function setSearchHandlers(entity) {
  const qIn = document.getElementById(`${entity}Search`);
  const ps  = document.getElementById(`${entity}PageSize`);
  if (qIn) qIn.addEventListener("input", () => {
    tableState[entity].q = qIn.value; tableState[entity].page = 1; renderTable(entity);
  });
  if (ps) ps.addEventListener("change", () => {
    tableState[entity].pageSize = Number(ps.value); tableState[entity].page = 1; renderTable(entity);
  });
}

// Filtros / acciones de Movimientos
function setMovementsHandlers() {
  const sel = document.getElementById("mv_entity");
  const from = document.getElementById("mv_from");
  const to = document.getElementById("mv_to");
  const btnClear = document.getElementById("mv_clear");
  const btnCSV = document.getElementById("mv_export");

  sel?.addEventListener("change", () => {
    tableState.movements.entity = sel.value; tableState.movements.page = 1; renderTable("movements");
  });
  from?.addEventListener("change", () => {
    tableState.movements.from = from.value; tableState.movements.page = 1; renderTable("movements");
  });
  to?.addEventListener("change", () => {
    tableState.movements.to = to.value; tableState.movements.page = 1; renderTable("movements");
  });

  btnClear?.addEventListener("click", () => {
    if (sel) sel.value = ""; if (from) from.value = ""; if (to) to.value = "";
    tableState.movements.entity = ""; tableState.movements.from = ""; tableState.movements.to = "";
    renderTable("movements");
  });

  btnCSV?.addEventListener("click", exportMovementsCSV);
  setSearchHandlers("movements");

  const btnDailyCSV = document.getElementById("mv_daily_csv");
  btnDailyCSV?.addEventListener("click", exportMovementsDailyCSV);
}

function rowMatches(row, q) {
  if (!q) return true;
  return JSON.stringify(row).toLowerCase().includes(q.toLowerCase());
}

function renderPager(entity, pages) {
  const ul = document.getElementById(`${entity}Pager`); if (!ul) return;
  const st = tableState[entity]; ul.innerHTML = "";
  const add = (label, page, disabled, active) => {
    const li = document.createElement("li");
    li.className = `page-item ${disabled?"disabled":""} ${active?"active":""}`;
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

/* =========================
   Render tablas
   ========================= */
function renderTable(entity, tableId = entity + "Table") {
  const st = tableState[entity];

  let filtered = st.items.filter(r => rowMatches(r, st.q.trim()));
  if (entity === "movements") filtered = applyMovementFilters(filtered);

  const pages = Math.max(1, Math.ceil(filtered.length / st.pageSize));
  if (st.page > pages) st.page = pages;
  const rows = filtered.slice((st.page-1)*st.pageSize, (st.page)*st.pageSize);

  const tbody = document.querySelector(`#${tableId} tbody`); if (!tbody) return;
  tbody.innerHTML = "";

  rows.forEach(row => {
    const tr = document.createElement("tr");
    const pushTD = html => { const td = document.createElement("td"); td.innerHTML = html; td.style.verticalAlign = "middle"; tr.appendChild(td); };

    if (entity === "brands") {
      pushTD(renderIdShort(row.id)); pushTD(row.name || ""); pushTD(renderColorSquare(row.color)); pushTD(renderDateLocal(row.lastModified));
    } else if (entity === "styles") {
      pushTD(renderIdShort(row.id)); pushTD(row.brandName || ""); pushTD(row.name || ""); pushTD(renderColorSquare(row.color)); pushTD(row.showAlways ? "✔" : ""); pushTD(renderDateLocal(row.lastModified));
    } else if (entity === "fermenters") {
      pushTD(renderIdShort(row.id)); pushTD(row.name || ""); pushTD(row.sizeLiters || ""); pushTD(renderColorSquare(row.color)); pushTD(renderDateLocal(row.lastModified));
    } else if (entity === "containers") {
      pushTD(renderIdShort(row.id)); pushTD(row.name || ""); pushTD(row.sizeLiters || ""); pushTD(row.type || ""); pushTD(renderColorSquare(row.color)); pushTD(renderDateLocal(row.lastModified));
    } else if (entity === "labels") {
      pushTD(renderIdShort(row.id));
      pushTD(row.brandName || "");
      pushTD(row.isCustom ? (row.name || "(custom)") : (row.styleName || ""));
      pushTD(row.qty ?? 0);
      pushTD(row.batch || "");
      pushTD(row.provider || "");
      pushTD(row.entryDate || "");
      pushTD(renderDateLocal(row.lastModified));
    } else if (entity === "movements") {
      pushTD(renderIdShort(row.id));
      pushTD(renderDateLocal(row.dateTime));
      pushTD(row.entity || "");
      pushTD(row.type || "");
      pushTD(row.qty ?? 0);
      pushTD(row.description || "");
      pushTD(renderDateLocal(row.lastModified));
    }

    if (entity !== "movements") {
      const tdA = document.createElement("td");
      tdA.innerHTML = `
        <button class="btn btn-sm btn-warning me-1" onclick="handleEditClick(this,'${entity}','${row.id}')">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="handleDeleteClick(this,'${entity}','${row.id}')">Eliminar</button>`;
      tr.appendChild(tdA);
    }

    tbody.appendChild(tr);
  });

  renderPager(entity, pages);

  if (entity === "movements") {
    renderMovementsTotals();
    renderMovementsDaily();
  }
}

async function loadTable(entity, tableId) {
  tableState[entity].items = await apiGet(entity);
  renderTable(entity, tableId);
  setSearchHandlers(entity);
}

async function loadMovements() {
  tableState.movements.items = await apiGet("movements");
  renderTable("movements");
  setMovementsHandlers();
}

/* =========================
   Modal nativo (reutilizable)
   ========================= */
let entityModal, entityModalEl, saveBtn;
function initEntityModal() {
  entityModalEl = document.getElementById('entityModal');
  if (!entityModalEl) return;
  entityModal = new bootstrap.Modal(entityModalEl);
  saveBtn = document.getElementById('entityModalSave');
}

function modalBodyHtml(entity, data = {}, brands = [], styles = []) {
  if (entity === "brands") {
    return `
      <div class="mb-2"><label class="form-label fw-semibold">Nombre</label><input id="brandName" class="form-control" value="${data.name||""}"></div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="brandColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color||"#000000"}">
      </div>`;
  }
  if (entity === "styles") {
    const opts = brands.map(b => `<option value="${b.id}" ${b.id===data.brandId?"selected":""}>${b.name}</option>`).join("");
    return `
      <div class="mb-2"><label class="form-label fw-semibold">Marca</label><select id="styleBrandId" class="form-select">${opts}</select></div>
      <div class="mb-2"><label class="form-label fw-semibold">Nombre del estilo</label><input id="styleName" class="form-control" value="${data.name||""}"></div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="styleColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color||"#000000"}">
      </div>
      <div class="form-check"><input class="form-check-input" type="checkbox" id="styleShowAlways" ${data.showAlways?"checked":""}>
        <label class="form-check-label" for="styleShowAlways">Mostrar siempre (aunque no haya stock)</label></div>`;
  }
  if (entity === "fermenters") {
    return `
      <div class="mb-2"><label class="form-label fw-semibold">Nombre</label><input id="fermenterName" class="form-control" value="${data.name||""}"></div>
      <div class="mb-2"><label class="form-label fw-semibold">Capacidad (L)</label><input id="fermenterSize" type="number" class="form-control" value="${data.sizeLiters||0}"></div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="fermenterColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color||"#000000"}">
      </div>`;
  }
  if (entity === "containers") {
    return `
      <div class="mb-2"><label class="form-label fw-semibold">Nombre</label><input id="containerName" class="form-control" value="${data.name||""}"></div>
      <div class="mb-2"><label class="form-label fw-semibold">Tamaño (L)</label><input id="containerSize" type="number" class="form-control" value="${data.sizeLiters||0}"></div>
      <div class="mb-2"><label class="form-label fw-semibold">Tipo</label><input id="containerType" class="form-control" value="${data.type||"lata"}" placeholder="lata / barril"></div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="containerColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color||"#000000"}">
      </div>`;
  }
  if (entity === "labels") {
    const brandOpts = brands.map(b => `<option value="${b.id}" ${b.id===data.brandId?"selected":""}>${b.name}</option>`).join("");
    const styleOptions = (brandId) => styles
      .filter(s => String(s.brandId) === String(brandId))
      .map(s => `<option value="${s.id}" ${s.id===data.styleId?"selected":""}>${s.name}</option>`).join("");
    const currentBrandId = data.brandId || (brands[0]?.id || "");
    const styleOpts = styleOptions(currentBrandId);
    return `
      <div class="mb-2"><label class="form-label fw-semibold">Marca</label>
        <select id="labelBrandId" class="form-select">${brandOpts}</select></div>

      <div class="form-check mb-2">
        <input class="form-check-input" type="checkbox" id="labelIsCustom" ${data.isCustom?"checked":""}>
        <label class="form-check-label" for="labelIsCustom">Etiqueta personalizada (no usar estilo)</label>
      </div>

      <div class="mb-2" id="labelStyleWrap">
        <label class="form-label fw-semibold">Estilo</label>
        <select id="labelStyleId" class="form-select">${styleOpts}</select>
      </div>

      <div class="mb-2 d-none" id="labelNameWrap">
        <label class="form-label fw-semibold">Nombre etiqueta</label>
        <input id="labelName" class="form-control" value="${data.name||""}">
      </div>

      <div class="row g-2">
        <div class="col-sm-6">
          <label class="form-label fw-semibold">Cantidad</label>
          <input id="labelQty" type="number" class="form-control" value="${data.qty||1}" min="1">
        </div>
        <div class="col-sm-6">
          <label class="form-label fw-semibold">Fecha de ingreso</label>
          <input id="labelEntryDate" type="date" class="form-control" value="${data.entryDate || todayInputValue()}">
        </div>
      </div>

      <div class="row g-2 mt-1">
        <div class="col-sm-6">
          <label class="form-label fw-semibold">Lote (opcional)</label>
          <input id="labelBatch" class="form-control" value="${data.batch||""}">
        </div>
        <div class="col-sm-6">
          <label class="form-label fw-semibold">Proveedor (opcional)</label>
          <input id="labelProvider" class="form-control" value="${data.provider||""}">
        </div>
      </div>`;
  }
}

async function openEntityModal(entity, id = null) {
  if (!entityModal) initEntityModal();

  // Bloquear edición de marca si tiene estilos vinculados
  if (entity === "brands" && id) {
    const styles = tableState.styles.items.length ? tableState.styles.items : await apiGet("styles");
    const linkedCount = styles.filter(s => String(s.brandId) === String(id)).length;
    if (linkedCount > 0) {
      await Swal.fire({
        icon: "info",
        title: "No se puede editar",
        html: `Esta marca tiene <b>${linkedCount}</b> estilo(s) vinculados.<br>Primero eliminá los estilos.`
      });
      return;
    }
  }

  const titleEl = document.getElementById('entityModalTitle');
  const bodyEl  = document.getElementById('entityModalBody');

  let data = {};
  if (id) data = await apiGet(entity, "getById", { id });

  let brands = [], styles = [];
  if (["styles","labels"].includes(entity)) {
    brands = await apiGet("brands");
    styles = await apiGet("styles");
  }

  titleEl.textContent = (id ? "Editar " : "Agregar ") + LABELS[entity];
  bodyEl.innerHTML = modalBodyHtml(entity, data, brands, styles);

  // Dinámica para labels
  if (entity === "labels") {
    const brandSel = bodyEl.querySelector("#labelBrandId");
    const styleSel = bodyEl.querySelector("#labelStyleId");
    const isCustom = bodyEl.querySelector("#labelIsCustom");
    const wrapStyle = bodyEl.querySelector("#labelStyleWrap");
    const wrapName  = bodyEl.querySelector("#labelNameWrap");

    const rebuildStyles = () => {
      const brandId = brandSel.value;
      const opts = styles.filter(s => String(s.brandId) === String(brandId))
        .map(s => `<option value="${s.id}">${s.name}</option>`).join("");
      styleSel.innerHTML = opts;
    };
    brandSel?.addEventListener("change", rebuildStyles);

    const toggleCustom = () => {
      const checked = isCustom.checked;
      if (checked) { wrapStyle.classList.add("d-none"); wrapName.classList.remove("d-none"); }
      else { wrapStyle.classList.remove("d-none"); wrapName.classList.add("d-none"); }
    };
    isCustom?.addEventListener("change", toggleCustom);
    toggleCustom();
  }

  // Guardar (anti doble-click)
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
        obj.brandId = sel.value; obj.brandName = sel.options[sel.selectedIndex].text;
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
      } else if (entity === "labels") {
        const brandId = document.getElementById("labelBrandId").value;
        const isCustom = document.getElementById("labelIsCustom").checked;
        obj.isCustom = isCustom;
        obj.brandId = brandId;
        if (isCustom) {
          obj.name = document.getElementById("labelName").value.trim();
          obj.styleId = "";
        } else {
          obj.styleId = document.getElementById("labelStyleId").value;
          obj.name = "";
        }
        obj.qty = Math.max(1, Number(document.getElementById("labelQty").value || 1));
        obj.entryDate = document.getElementById("labelEntryDate").value || todayInputValue();
        obj.batch = document.getElementById("labelBatch").value.trim();
        obj.provider = document.getElementById("labelProvider").value.trim();
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

// Alias por compatibilidad (si algún HTML aún llama openModal)
function openModal(entity, id = null) {
  return openEntityModal(entity, id);
}

/* =========================
   Botones bloqueados (UX)
   ========================= */
async function disableDuring(btn, fn) {
  if (!btn) return fn();
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${btn.textContent}`;
  try { await fn(); }
  finally { btn.disabled = false; btn.innerHTML = prev; }
}
function handleAddClick(btn, entity)         { disableDuring(btn, () => openEntityModal(entity)); }
function handleEditClick(btn, entity, id)    { disableDuring(btn, () => openEntityModal(entity, id)); }
function handleDeleteClick(btn, entity, id)  { disableDuring(btn, () => deleteItem(entity, id)); }

/* =========================
   Delete con confirmación
   ========================= */
async function deleteItem(entity, id) {
  if (entity === "brands") {
    const styles = tableState.styles.items.length ? tableState.styles.items : await apiGet("styles");
    const linkedCount = styles.filter(s => String(s.brandId) === String(id)).length;
    if (linkedCount > 0) {
      await Swal.fire({ icon: "info", title: "No se puede eliminar", html: `Esta marca tiene <b>${linkedCount}</b> estilo(s) vinculados.<br>Primero eliminá los estilos.` });
      return;
    }
  }
  const r = await Swal.fire({
    title: "¿Eliminar?", text: "Esta acción no se puede deshacer.", icon: "warning",
    showCancelButton: true, confirmButtonText: "Sí, eliminar", cancelButtonText: "Cancelar",
    showLoaderOnConfirm: true, allowOutsideClick: () => !Swal.isLoading(),
    preConfirm: async () => {
      const res = await apiDelete(entity, id);
      if (!res.ok) throw new Error(res.error || "No se pudo eliminar");
      return true;
    }
  });
  if (r.isConfirmed) {
    Toast.fire({ icon: "success", title: `${LABELS[entity]} eliminado` });
    await loadTable(entity, entity + "Table");
  }
}

/* =========================
   Index: Latas vacías (modal nativo)
   ========================= */
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
    document.getElementById("ec_date").value = todayInputValue();
    save.disabled = false;
    modal.show();
  });

  save.addEventListener("click", async () => {
    try {
      save.disabled = true;
      const qty = Math.max(1, Number(document.getElementById("ec_qty").value || 1));
      const batch = document.getElementById("ec_batch").value.trim();
      const manufacturer = document.getElementById("ec_manu").value.trim();
      const entryDate = document.getElementById("ec_date").value || todayInputValue();

      const res = await apiPost("emptycans", { qty, batch, manufacturer, entryDate });
      if (!res.ok) throw new Error(res.error || "No se pudo guardar");

      modal.hide();
      Toast.fire({ icon: "success", title: "Latas registradas" });
      await loadEmptyCans();
    } catch (e) {
      console.error(e);
      Swal.fire("Error", e.message || "No se pudo guardar", "error");
    } finally {
      save.disabled = false;
    }
  });
}

async function loadEmptyCans() {
  const el = document.getElementById("emptyCansCount"); if (!el) return;
  try {
    const data = await apiGet("emptycans", "emptycans_count");
    el.textContent = data.count ?? 0;
  } catch (e) { console.error(e); }
}

/* =========================
   Init
   ========================= */
document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initEntityModal();
  initEmptyCans();
  await loadEmptyCans();

  // Config
  if (document.getElementById("brandsTable")) {
    await loadTable("brands", "brandsTable");
    await loadTable("styles", "stylesTable");
    await loadTable("fermenters", "fermentersTable");
    await loadTable("containers", "containersTable");
  }
  // Etiquetas
  if (document.getElementById("labelsTable")) {
    await loadTable("labels", "labelsTable");
  }
  // Movimientos
  if (document.getElementById("movementsTable")) {
    await loadMovements();
  }
});
