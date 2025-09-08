// app.js (completo) – Control de Stock + Producción
// API base (Apps Script)
const API_BASE = "https://script.google.com/macros/s/AKfycbxQENpsg7GZKUZC7yVNhBhRvFvAAVls9mAfOmrT95TIqY7fS3G4uD0iuXoSmRLT2Ro1/exec";
const JSZIP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

/* =========================
   API helpers
   ========================= */
async function apiGet(entity, action = "getAll", extra = {}) {
  const params = new URLSearchParams({ entity, action, ...extra });
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error(`GET ${entity}/${action} ${res.status}`);
  return res.json();
}
async function apiPost(entity, data, action) {
  const url = action ? `${API_BASE}?entity=${entity}&action=${action}` : `${API_BASE}?entity=${entity}`;
  const res = await fetch(url, { method: "POST", body: JSON.stringify(data || {}) });
  if (!res.ok) throw new Error(`POST ${entity}${action?"/"+action:""} ${res.status}`);
  return res.json();
}
async function apiDelete(entity, id) { return apiPost(entity, { id }, "delete"); }
function escapeHtml(s){ 
  return String(s||"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
}

// Reemplaza cualquier UUID por sus últimos 6 caracteres (mantiene ":cantidad")
function shortenUUIDs(text){
  return String(text || "").replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    (m)=> m.slice(-6)
  );
}

// Formatea la descripción de movimientos: acorta UUIDs y trunca largo
function renderMovementDesc(desc){
  const s = shortenUUIDs(desc);
  const MAX = 90;
  if (s.length > MAX) {
    const short = s.slice(0, MAX) + "…";
    return `<span title="${escapeHtml(s)}">${escapeHtml(short)}</span>`;
  }
  return escapeHtml(s);
}

/* =========================
   Toast
   ========================= */
const Toast = Swal.mixin({
  toast: true, position: "top-end", showConfirmButton: false,
  timer: 1800, timerProgressBar: true,
  didOpen: t => { t.addEventListener("mouseenter", Swal.stopTimer); t.addEventListener("mouseleave", Swal.resumeTimer); }
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
   Estado/paginación tablas
   ========================= */
const tableState = {
  brands:      { items: [], q: "", page: 1, pageSize: 10 },
  styles:      { items: [], q: "", page: 1, pageSize: 10 },
  fermenters:  { items: [], q: "", page: 1, pageSize: 10 },
  containers:  { items: [], q: "", page: 1, pageSize: 10 },
  labels:      { items: [], q: "", page: 1, pageSize: 10 },
  movements:   { items: [], q: "", page: 1, pageSize: 10, entity: "", itemId: "", from: "", to: "" }
};
const LABELS = {
  brands: "Marca", styles: "Estilo", fermenters: "Fermentador",
  containers: "Envase", labels: "Etiqueta", movements: "Movimiento"
};

/* =========================
   Helpers UI y fechas
   ========================= */
function renderIdShort(id){ return id ? String(id).slice(-6) : ""; }
function renderColorSquare(color){ return color ? `<div class="color-box mx-auto" style="width:18px;height:18px;border-radius:4px;background:${color};"></div>` : ""; }
function renderDateLocal(s){
  if (!s) return "";
  if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(Z|[+\-]\d{2}:\d{2})$/.test(s)) {
    const d = new Date(s); return isNaN(d) ? s : d.toLocaleString();
  }
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m){ const d = new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +(m[6]||0)); return d.toLocaleString(); }
  const d = new Date(s); return isNaN(d) ? s : d.toLocaleString();
}
const todayInputValue = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
};
const nowInputDateTime = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  const hh = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};
function fromDatetimeLocalValue(v){
  if (!v) return null;
  return String(v).replace("T"," ") + ":00";
}

/* =========================
   CSV + ZIP
   ========================= */
function csvEscape(v){ let s = v == null ? "" : String(v); if (/[",\n]/.test(s)) s = `"${s.replace(/"/g,'""')}"`; return s; }
function downloadFile(name, content){
  const blob = new Blob([content], {type:"text/csv;charset=utf-8;"}); const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
}
async function ensureJSZip(){
  if (window.JSZip) return;
  await new Promise((resolve, reject)=>{
    const s = document.createElement("script");
    s.src = JSZIP_CDN; s.onload = resolve; s.onerror = ()=>reject(new Error("No se pudo cargar JSZip"));
    document.head.appendChild(s);
  });
}
async function exportAllCSVsZip(){
  try{
    await ensureJSZip();
    const zip = new JSZip();
    const entities = ["brands","styles","fermenters","containers","emptycans","labels","movements"];
    for (const e of entities){
      const rows = await apiGet(e);
      if (!Array.isArray(rows)) continue;
      const headers = Object.keys(rows[0] || {});
      const lines = [headers.join(",")].concat(rows.map(r=>headers.map(h=>csvEscape(r[h])).join(",")));
      zip.file(`${e}.csv`, lines.join("\n"));
    }
    const blob = await zip.generateAsync({type:"blob"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download=`backup_castelo_${Date.now()}.zip`;
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
  } catch(err){
    console.error(err);
    Swal.fire("Error", err.message || "No se pudo exportar ZIP", "error");
  }
}

/* =========================
   Movimientos (kardex)
   ========================= */
function applyMovementFilters(list){
  const st = tableState.movements;
  const entity = st.entity || "";
  const itemId = st.itemId || "";
  const from = st.from || "";
  const to = st.to || "";
  return list.filter(r=>{
    if (entity && String(r.entity)!==entity) return false;
    if (itemId && String(r.entityId)!==String(itemId)) return false;
    const d = String(r.dateTime || "").slice(0,10);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}
function getFilteredMovements(){
  const st = tableState.movements;
  let list = (st.items || []).filter(r => rowMatches(r, st.q || ""));
  list = applyMovementFilters(list);
  return list;
}
function exportMovementsCSV(){
  const list = getFilteredMovements();
  const headers = ["id","entity","entityId","type","qty","dateTime","description","lastModified"];
  const lines = [headers.join(",")].concat(list.map(r => headers.map(h => csvEscape(r[h])).join(",")));
  downloadFile(`movimientos_${Date.now()}.csv`, lines.join("\n"));
}
function exportMovementsDailyCSV(){
  const days = computeDailyWithBalance();
  const headers = ["date","in","out","net","balance"];
  const lines = [headers.join(",")].concat(days.map(d => [d.date,d.in,d.out,d.net,d.balance].join(",")));
  downloadFile(`movimientos_diario_${Date.now()}.csv`, lines.join("\n"));
}
function computeTotals(list){
  let inSum = 0, outSum = 0;
  for (const r of list){
    const t = String(r.type||"").toLowerCase();
    const q = Number(r.qty||0);
    if (t==="alta") inSum += q; else if (t==="baja") outSum += q;
  }
  return { in: inSum, out: outSum, net: inSum - outSum };
}
function renderMovementsTotals(){
  const list = getFilteredMovements();
  const t = computeTotals(list);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("mv_total_in",  t.in);
  set("mv_total_out", t.out);
  set("mv_total_net", t.net);

  const wrap = document.getElementById("mv_breakdown_wrap");
  const tbody = document.querySelector("#mv_breakdown_table tbody");
  const title = document.getElementById("mv_breakdown_title");
  if (!wrap || !tbody || !title) return;

  const st = tableState.movements;
  tbody.innerHTML = "";
  if (list.length === 0){ wrap.classList.add("d-none"); return; }

  if (!st.entity){
    title.textContent = "Desglose por entidad";
    const map = new Map();
    for (const r of list){
      const key = String(r.entity||"");
      if (!map.has(key)) map.set(key, {in:0,out:0});
      const obj = map.get(key);
      const q = Number(r.qty||0);
      const t = String(r.type||"").toLowerCase();
      if (t==="alta") obj.in += q; else if (t==="baja") obj.out += q;
    }
    for (const [k,v] of map.entries()){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${k||"(sin entidad)"}</td><td>${v.in}</td><td>${v.out}</td><td>${v.in - v.out}</td>`;
      tbody.appendChild(tr);
    }
    wrap.classList.remove("d-none");
  } else if (st.entity === "labels") {
    title.textContent = "Desglose por estilo";
    const map = new Map();
    for (const r of list){
      let key = "(labels)";
      const desc = String(r.description||"");
      if (desc.startsWith("estilo:")) key = desc.slice(7);
      else if (desc.startsWith("custom:")) key = "(custom) " + desc.slice(7);
      if (!map.has(key)) map.set(key, {in:0,out:0});
      const obj = map.get(key);
      const q = Number(r.qty||0);
      const t = String(r.type||"").toLowerCase();
      if (t==="alta") obj.in += q; else if (t==="baja") obj.out += q;
    }
    for (const [k,v] of map.entries()){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${k}</td><td>${v.in}</td><td>${v.out}</td><td>${v.in - v.out}</td>`;
      tbody.appendChild(tr);
    }
    wrap.classList.remove("d-none");
  } else {
    wrap.classList.add("d-none");
  }
}
function getOpeningBalance(){
  const st = tableState.movements;
  const from = st.from || "";
  if (!from) return 0;
  let list = st.items || [];
  if (st.entity) list = list.filter(r => String(r.entity) === String(st.entity));
  if (st.itemId) list = list.filter(r => String(r.entityId) === String(st.itemId));
  list = list.filter(r => String(r.dateTime||"").slice(0,10) < from);
  let altas = 0, bajas = 0;
  for (const r of list){
    const t = String(r.type||"").toLowerCase();
    const q = Number(r.qty||0);
    if (t==="alta") altas += q; else if (t==="baja") bajas += q;
  }
  return altas - bajas;
}
function computeDailyWithBalance(){
  const list = getFilteredMovements();
  const map = new Map();
  for (const r of list){
    const d = String(r.dateTime || "").slice(0,10);
    const t = String(r.type || "").toLowerCase();
    const q = Number(r.qty || 0);
    if (!map.has(d)) map.set(d, { in:0, out:0 });
    if (t==="alta") map.get(d).in += q; else if (t==="baja") map.get(d).out += q;
  }
  const days = Array.from(map.entries())
    .map(([date, v]) => ({ date, in: v.in, out: v.out, net: v.in - v.out }))
    .sort((a,b) => a.date.localeCompare(b.date));
  let balance = getOpeningBalance();
  for (const d of days){ balance += d.net; d.balance = balance; }
  return days;
}
function renderMovementsDaily(){
  const wrap = document.getElementById("mv_daily_wrap");
  const tbody = document.querySelector("#mv_daily_table tbody");
  if (!wrap || !tbody) return;
  const days = computeDailyWithBalance();
  tbody.innerHTML = "";
  if (days.length === 0){ wrap.classList.add("d-none"); return; }
  for (const d of days){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${d.date}</td><td>${d.in}</td><td>${d.out}</td><td>${d.net}</td><td>${d.balance}</td>`;
    tbody.appendChild(tr);
  }
  wrap.classList.remove("d-none");
}

/* =========================
   Buscador + paginación tablas
   ========================= */
function setSearchHandlers(entity){
  const qIn = document.getElementById(`${entity}Search`);
  const ps  = document.getElementById(`${entity}PageSize`);
  if (qIn) qIn.addEventListener("input", ()=>{ tableState[entity].q=qIn.value; tableState[entity].page=1; renderTable(entity); });
  if (ps)  ps.addEventListener("change", ()=>{ tableState[entity].pageSize=Number(ps.value); tableState[entity].page=1; renderTable(entity); });
}
function rowMatches(row,q){ if(!q) return true; return JSON.stringify(row).toLowerCase().includes(q.toLowerCase()); }
function renderPager(entity, pages){
  const ul = document.getElementById(`${entity}Pager`); if(!ul) return;
  const st = tableState[entity]; ul.innerHTML = "";
  const add = (label, page, disabled, active) => {
    const li = document.createElement("li");
    li.className = `page-item ${disabled?"disabled":""} ${active?"active":""}`;
    const a = document.createElement("a"); a.className="page-link"; a.href="#"; a.textContent=label;
    a.onclick = (e)=>{ e.preventDefault(); if(disabled||active) return; st.page=page; renderTable(entity); };
    li.appendChild(a); ul.appendChild(li);
  };
  add("«",1, st.page===1,false); add("‹",Math.max(1,st.page-1), st.page===1,false);
  for(let p=1;p<=pages;p++) add(String(p),p,false,p===st.page);
  add("›",Math.min(pages,st.page+1), st.page===pages,false); add("»",pages, st.page===pages,false);
}

/* =========================
   Movimientos: cargar ÍTEMS según ENTIDAD
   ========================= */
async function loadItemsForEntity(entity){
  if (!entity) return [];
  if (entity === "labels"){
    const rows = await apiGet("labels");
    return rows.map(r => ({
      id: r.id,
      label: r.isCustom ? `(custom) ${r.name || renderIdShort(r.id)}`
                        : `${r.brandName || ""} - ${r.styleName || ""}`.replace(/^ - /,"")
    }));
  }
  if (entity === "emptycans"){
    const rows = await apiGet("emptycans");
    return rows.map(r => ({
      id: r.id,
      label: `Lote ${r.batch || "s/d"} • ${r.entryDate || ""} • ${renderIdShort(r.id)}`
    }));
  }
  const rows = await apiGet(entity);
  return rows.map(r => ({ id: r.id, label: r.name || renderIdShort(r.id) }));
}
function setMovementsHandlers(){
  const selEntity = document.getElementById("mv_entity");
  const selItem   = document.getElementById("mv_item");
  const from = document.getElementById("mv_from");
  const to   = document.getElementById("mv_to");
  const btnClear = document.getElementById("mv_clear");
  const btnCSV   = document.getElementById("mv_export");
  const btnZIP   = document.getElementById("mv_export_all");
  const btnDailyCSV = document.getElementById("mv_daily_csv");

  selEntity?.addEventListener("change", async ()=>{
    tableState.movements.entity = selEntity.value;
    tableState.movements.itemId = "";
    if (selItem){
      selItem.innerHTML = `<option value="">Todos los ítems</option>`;
      if (selEntity.value){
        const items = await loadItemsForEntity(selEntity.value);
        for (const it of items){
          const opt = document.createElement("option"); opt.value = it.id; opt.textContent = it.label;
          selItem.appendChild(opt);
        }
      }
    }
    tableState.movements.page = 1;
    renderTable("movements");
  });
  selItem?.addEventListener("change", ()=>{
    tableState.movements.itemId = selItem.value;
    tableState.movements.page = 1;
    renderTable("movements");
  });
  from?.addEventListener("change", ()=>{ tableState.movements.from = from.value; tableState.movements.page=1; renderTable("movements"); });
  to  ?.addEventListener("change", ()=>{ tableState.movements.to   = to.value;   tableState.movements.page=1; renderTable("movements"); });

  btnClear?.addEventListener("click", ()=>{
    if (selEntity) selEntity.value="";
    if (selItem)   selItem.innerHTML = `<option value="">Todos los ítems</option>`;
    if (from) from.value=""; if (to) to.value="";
    tableState.movements.entity=""; tableState.movements.itemId=""; tableState.movements.from=""; tableState.movements.to="";
    renderTable("movements");
  });

  btnCSV ?.addEventListener("click", exportMovementsCSV);
  btnZIP ?.addEventListener("click", exportAllCSVsZip);
  btnDailyCSV?.addEventListener("click", exportMovementsDailyCSV);
  setSearchHandlers("movements");
}

/* =========================
   Render tablas
   ========================= */
function renderTable(entity, tableId = entity + "Table"){
  const st = tableState[entity];
  let filtered = st.items.filter(r => rowMatches(r, st.q.trim()));
  if (entity === "movements") filtered = applyMovementFilters(filtered);
  const pages = Math.max(1, Math.ceil(filtered.length / st.pageSize));
  if (st.page > pages) st.page = pages;
  const rows = filtered.slice((st.page-1)*st.pageSize, (st.page)*st.pageSize);
  const tbody = document.querySelector(`#${tableId} tbody`); if (!tbody) return;
  tbody.innerHTML = "";
  rows.forEach(row=>{
    const tr = document.createElement("tr");
    const pushTD = html => { const td=document.createElement("td"); td.innerHTML=html; td.style.verticalAlign="middle"; tr.appendChild(td); };
    if (entity==="brands") {
      pushTD(renderIdShort(row.id)); pushTD(row.name||""); pushTD(renderColorSquare(row.color)); pushTD(renderDateLocal(row.lastModified));
    } else if (entity==="styles") {
      pushTD(renderIdShort(row.id)); pushTD(row.brandName||""); pushTD(row.name||""); pushTD(renderColorSquare(row.color)); pushTD(row.showAlways?"✔":""); pushTD(renderDateLocal(row.lastModified));
    } else if (entity==="fermenters") {
      pushTD(renderIdShort(row.id)); pushTD(row.name||""); pushTD(row.sizeLiters||""); pushTD(renderColorSquare(row.color)); pushTD(renderDateLocal(row.lastModified));
    } else if (entity==="containers") {
      pushTD(renderIdShort(row.id)); pushTD(row.name||""); pushTD(row.sizeLiters||""); pushTD(row.type||""); pushTD(renderColorSquare(row.color)); pushTD(renderDateLocal(row.lastModified));
    } else if (entity==="labels") {
      pushTD(renderIdShort(row.id)); pushTD(row.brandName || ""); pushTD(row.isCustom ? (row.name||"(custom)") : (row.styleName||""));
      pushTD(row.qty ?? 0); pushTD(row.batch || ""); pushTD(row.provider || ""); pushTD(row.entryDate || ""); pushTD(renderDateLocal(row.lastModified));
    } else if (entity==="movements") {
      pushTD(renderIdShort(row.id)); pushTD(renderDateLocal(row.dateTime)); pushTD(row.entity || ""); pushTD(row.type || ""); pushTD(row.qty ?? 0); pushTD(renderMovementDesc(row.description || "")); pushTD(renderDateLocal(row.lastModified));
    } else if (entity==="emptyboxes") {
      pushTD(renderIdShort(row.id));
      pushTD(row.type === "box24" ? "x24" : "x12");
      pushTD(row.batch || "");
      pushTD(row.provider || "");
      pushTD(renderDateLocal(row.entryDate));
      pushTD(renderDateLocal(row.lastModified));
      pushTD(row.qty ?? 0);
      }
    if (entity!=="movements") {
      const tdA = document.createElement("td");
      tdA.innerHTML = `
        <button class="btn btn-sm btn-warning me-1" onclick="handleEditClick(this,'${entity}','${row.id}')">Editar</button>
        <button class="btn btn-sm btn-danger" onclick="handleDeleteClick(this,'${entity}','${row.id}')">Eliminar</button>`;
      tr.appendChild(tdA);
    }
    tbody.appendChild(tr);
  });
  renderPager(entity, pages);
  if (entity === "movements") { renderMovementsTotals(); renderMovementsDaily(); }
  if (entity === "labels") { renderLabelsSummary(tableState.labels.items); }
}
async function loadTable(entity, tableId){
  tableState[entity].items = await apiGet(entity);
  renderTable(entity, tableId);
  setSearchHandlers(entity);
}
async function loadMovements(){
  tableState.movements.items = await apiGet("movements");
  renderTable("movements");
  setMovementsHandlers();
}

/* =========================
   Resumen de stock – Labels
   ========================= */
function renderLabelsSummary(list){
  const totalUnits = list.reduce((a,x)=>a + (Number(x.qty)||0), 0);
  const totalItems = list.length;
  const last = list.reduce((mx,x)=>{
    const d = new Date(x.lastModified || 0);
    return isNaN(d) ? mx : Math.max(mx, d.getTime());
  }, 0);
  const lastStr = last ? new Date(last).toLocaleString() : "—";
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set("lbl_total_units", totalUnits);
  set("lbl_total_items", totalItems);
  const lm = document.getElementById("lbl_last_mod"); if (lm) lm.textContent = lastStr;
  const byBrand = new Map();
  for (const r of list){
    const k = String(r.brandName || "(s/marca)");
    const q = Number(r.qty || 0);
    byBrand.set(k, (byBrand.get(k) || 0) + q);
  }
  const top = Array.from(byBrand.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const tb = document.getElementById("lbl_by_brand_tbody");
  if (tb){
    tb.innerHTML = "";
    for (const [name, qty] of top){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${name}</td><td class="text-end">${qty}</td>`;
      tb.appendChild(tr);
    }
  }
}

/* =========================
   Modal CRUD reutilizable
   ========================= */
let entityModal, entityModalEl, saveBtn;
function initEntityModal(){ entityModalEl=document.getElementById('entityModal'); if(!entityModalEl) return; entityModal=new bootstrap.Modal(entityModalEl); saveBtn=document.getElementById('entityModalSave'); }
function modalBodyHtml(entity, data={}, brands=[], styles=[]){
  if (entity==="brands"){
    return `
      <div class="mb-2"><label class="form-label fw-semibold">Nombre</label><input id="brandName" class="form-control" value="${data.name||""}"></div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="brandColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color||"#000000"}">
      </div>`;
  }
  if (entity==="styles"){
    const opts = brands.map(b=>`<option value="${b.id}" ${b.id===data.brandId?"selected":""}>${b.name}</option>`).join("");
    return `
      <div class="mb-2"><label class="form-label fw-semibold">Marca</label><select id="styleBrandId" class="form-select">${opts}</select></div>
      <div class="mb-2"><label class="form-label fw-semibold">Nombre del estilo</label><input id="styleName" class="form-control" value="${data.name||""}"></div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="styleColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color||"#000000"}">
      </div>
      <div class="form-check"><input class="form-check-input" type="checkbox" id="styleShowAlways" ${data.showAlways?"checked":""}>
        <label class="form-check-label" for="styleShowAlways">Mostrar siempre (aunque no haya stock)</label></div>`;
  }
  if (entity==="fermenters"){
    return `
      <div class="mb-2"><label class="form-label fw-semibold">Nombre</label><input id="fermenterName" class="form-control" value="${data.name||""}"></div>
      <div class="mb-2"><label class="form-label fw-semibold">Capacidad (L)</label><input id="fermenterSize" type="number" class="form-control" value="${data.sizeLiters||0}"></div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="fermenterColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color||"#000000"}">
      </div>`;
  }
  if (entity==="containers"){
    return `
      <div class="mb-2"><label class="form-label fw-semibold">Nombre</label><input id="containerName" class="form-control" value="${data.name||""}"></div>
      <div class="mb-2"><label class="form-label fw-semibold">Tamaño (L)</label><input id="containerSize" type="number" class="form-control" value="${data.sizeLiters||0}"></div>
      <div class="mb-2"><label class="form-label fw-semibold">Tipo</label><input id="containerType" class="form-control" value="${data.type||"lata"}" placeholder="lata / barril"></div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="containerColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color||"#000000"}">
      </div>`;
  }
  if (entity==="emptyboxes"){
  return `
    <div class="mb-2">
      <label class="form-label fw-semibold">Tipo de caja</label>
      <select id="eb_type" class="form-select">
        <option value="box12" ${data.type==="box24"?"":"selected"}>x12</option>
        <option value="box24" ${data.type==="box24"?"selected":""}>x24</option>
      </select>
    </div>
    <div class="row g-2">
      <div class="col-sm-6">
        <label class="form-label fw-semibold">Cantidad de cajas</label>
        <input id="eb_qty" type="number" class="form-control" min="1" value="${data.qty||1}">
      </div>
      <div class="col-sm-6">
        <label class="form-label fw-semibold">Fecha de ingreso</label>
        <input id="eb_entry" type="datetime-local" class="form-control"
               value="${toDatetimeLocalValue(data.entryDate)}">
      </div>
    </div>
    <div class="row g-2 mt-1">
      <div class="col-sm-6">
        <label class="form-label fw-semibold">Lote (opcional)</label>
        <input id="eb_batch" class="form-control" value="${data.batch||""}">
      </div>
      <div class="col-sm-6">
        <label class="form-label fw-semibold">Proveedor (opcional)</label>
        <input id="eb_provider" class="form-control" value="${data.provider||""}">
      </div>
    </div>`;
  } 
  if (entity==="labels"){
    const brandOpts = brands.map(b=>`<option value="${b.id}" ${b.id===data.brandId?"selected":""}>${b.name}</option>`).join("");
    const styleOptions = (brandId)=> styles.filter(s=>String(s.brandId)===String(brandId))
      .map(s=>`<option value="${s.id}" ${s.id===data.styleId?"selected":""}>${s.name}</option>`).join("");
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

// ==== Empaquetado ====
async function initPackaging(){
  if (!document.getElementById("pk_style")) return;

  // carga base
  const [styles, labels, cans, boxes] = await Promise.all([
    apiGet("styles"), apiGet("labels"), apiGet("cans","getAll",{action:"cans_stock"}).catch(()=>apiGet("cans_stock")), // compat
    apiGet("emptyboxes")
  ]);

  // helpers
  const byStyle = new Map();
  cans.forEach(c=>{
    const key = String(c.styleId);
    if (!byStyle.has(key)) byStyle.set(key, []);
    byStyle.get(key).push(c);
  });

  const styleSel = document.getElementById("pk_style");
  const labelSel = document.getElementById("pk_label");
  const stateSel = document.getElementById("pk_state");
  const labelHint= document.getElementById("pk_label_stock_hint");

  // estilo
  styleSel.innerHTML = styles.map(s=>`<option value="${s.id}">${s.brandName || ""} - ${s.name}</option>`).join("");
  const ensureLabelList = ()=>{
    const sid = styleSel.value;
    // etiquetas del estilo (no-custom) + custom distintas (únicas por id)
    const lbls = labels.filter(l => (!l.isCustom && String(l.styleId)===String(sid)) || l.isCustom);
    const seen = new Set();
    labelSel.innerHTML = `<option value="">— Por estilo —</option>` + lbls
      .filter(l=>{ if(seen.has(l.id)) return false; seen.add(l.id); return true; })
      .map(l=>{
        const name = l.isCustom ? `(custom) ${l.name}` : l.styleName;
        return `<option value="${l.id}">${name}</option>`;
      }).join("");
    updateLabelHint();
  };
  const countLabelsByStyle = (sid)=> labels
    .filter(l => !l.isCustom && String(l.styleId)===String(sid))
    .reduce((a,x)=>a + (Number(x.qty)||0), 0);

  const countLabelsById = (id)=> labels
    .filter(l => String(l.id)===String(id))
    .reduce((a,x)=>a + (Number(x.qty)||0), 0);

  function updateLabelHint(){
    const sid = styleSel.value;
    const lid = labelSel.value;
    const n = lid ? countLabelsById(lid) : countLabelsByStyle(sid);
    labelHint.textContent = `Stock etiquetas: ${n}`;
    const fh = document.getElementById("pk_final_label_hint"); if (fh) fh.textContent = `Stock etiquetas: ${n}`;
  }

  styleSel.addEventListener("change", ()=>{
    ensureLabelList();
    paintCansStock();
  });
  labelSel.addEventListener("change", updateLabelHint);

  ensureLabelList();

  // pintar cards cajas
  const sumBoxes = (t)=> boxes.filter(b => b.type===t).reduce((a,x)=>a + (Number(x.qty)||0),0);
  document.getElementById("pk_box12").textContent = sumBoxes("box12");
  document.getElementById("pk_box24").textContent = sumBoxes("box24");

  // pintar latas por estado del estilo
  function paintCansStock(){
    const sid = styleSel.value;
    const list = byStyle.get(String(sid)) || [];
    const q = (state)=> list.filter(c=>c.state===state).reduce((a,x)=>a + (Number(x.qty)||0),0);
    document.getElementById("pk_cans_final").textContent = q("final");
    document.getElementById("pk_cans_p1").textContent = q("sin_pasteurizar_sin_etiquetar");
    document.getElementById("pk_cans_p2").textContent = q("sin_pasteurizar_etiquetada");
    document.getElementById("pk_cans_p3").textContent = q("pasteurizada_sin_etiquetar");

    // tabla por estado+etiqueta
    const tbody = document.querySelector("#pk_cans_table tbody"); tbody.innerHTML = "";
    const byKey = new Map();
    list.forEach(r=>{
      const key = r.state + "|" + (r.labelName||"");
      byKey.set(key, (byKey.get(key)||0) + (Number(r.qty)||0));
    });
    Array.from(byKey.entries()).forEach(([k,qty])=>{
      const [st, ln] = k.split("|");
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${st}</td><td>${ln||"—"}</td><td class="text-end">${qty}</td>`;
      tbody.appendChild(tr);
    });
  }
  paintCansStock();

  // tabla packages (acumuladas)
  const pk = await apiGet("packages");
  const tbodyPk = document.querySelector("#pk_packages_table tbody");
  const key = (x)=> [x.type,x.styleId,x.labelId||""].join("|");
  const acc = new Map();
  pk.forEach(p=> acc.set(key(p), (acc.get(key(p)) || { type:p.type, styleName:p.styleName, labelName:p.labelName||"", boxes:0, cans:0 }),
                         acc.get(key(p)) && (acc.get(key(p)).boxes += Number(p.boxes||0), acc.get(key(p)).cans += Number(p.qtyCans||0)) ));
  tbodyPk.innerHTML = "";
  Array.from(acc.values()).forEach(r=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${r.type==="box24"?"x24":"x12"}</td><td>${r.styleName}</td><td>${r.labelName||"—"}</td>
                    <td class="text-end">${r.boxes}</td><td class="text-end">${r.cans}</td>`;
    tbodyPk.appendChild(tr);
  });

  // === Transición a FINAL (modal) ===
  const modalFinal = new bootstrap.Modal(document.getElementById("pkModalFinal"));
  document.getElementById("btn_transition_final").addEventListener("click", ()=>{
    // Replica lista de labels en el modal
    const lblModal = document.getElementById("pk_final_label");
    lblModal.innerHTML = labelSel.innerHTML;
    updateLabelHint();
    document.getElementById("pk_pkg_dt")?.value || (document.getElementById("pk_pkg_dt").value = nowInputDateTime());
    modalFinal.show();
  });

  document.getElementById("pk_final_save").addEventListener("click", async ()=>{
    try{
      const styleId = styleSel.value;
      const qty = Math.max(1, Number(document.getElementById("pk_final_qty").value||0));
      const consume = document.getElementById("pk_final_consume").value; // auto|no
      const labelId = document.getElementById("pk_final_label").value || "";
      await apiPost("cans", {
        styleId, qty,
        fromState: "",               // desde cualquiera de los pendientes
        toState: "final",
        labelId,
        consumeLabels: (consume !== "no"),
        dateTime: nowInputDateTime()
      }, "transition_state");
      modalFinal.hide();
      Toast.fire({icon:"success", title:"Transición aplicada"});
      location.href = "movements.html?entity=cans&from=today&to=today";
    } catch(e){
      Swal.fire("Error", e.message || "No se pudo aplicar la transición", "error");
    }
  });

  // === Empaquetar (modal) ===
  const modalPkg = new bootstrap.Modal(document.getElementById("pkModalPackage"));
  const pkgType = document.getElementById("pk_pkg_type");
  const pkgHint = document.getElementById("pk_pkg_boxes_hint");
  const boxAvail = (t)=> boxes.filter(b=>b.type===t).reduce((a,x)=>a + (Number(x.qty)||0),0);
  const updHint = ()=> pkgHint.textContent = `Cajas disponibles: ${boxAvail(pkgType.value)}`;
  pkgType.addEventListener("change", updHint);
  updHint();

  document.getElementById("btn_package").addEventListener("click", ()=>{
    document.getElementById("pk_pkg_dt").value = nowInputDateTime();
    updHint();
    modalPkg.show();
  });

  document.getElementById("pk_pkg_save").addEventListener("click", async ()=>{
    try{
      const type  = pkgType.value; // box12|box24
      const boxesN= Math.max(1, Number(document.getElementById("pk_pkg_boxes").value||0));
      const styleId = styleSel.value;
      const labelId = labelSel.value || "";
      const state   = stateSel.value || ""; // tomar de este estado (o cualquiera)
      await apiPost("packages", {
        type, boxes: boxesN, styleId, labelId, state, dateTime: nowInputDateTime()
      }, "package");
      modalPkg.hide();
      Toast.fire({icon:"success", title:"Empaquetado registrado"});
      location.href = "movements.html?entity=cans&from=today&to=today";
    } catch(e){
      Swal.fire("Error", e.message || "No se pudo empaquetar", "error");
    }
  });
}

async function openEntityModal(entity, id=null){
  if (!entityModal) initEntityModal();
  if (entity==="brands" && id){
    const styles = tableState.styles.items.length ? tableState.styles.items : await apiGet("styles");
    const linkedCount = styles.filter(s => String(s.brandId)===String(id)).length;
    if (linkedCount>0) { await Swal.fire({icon:"info",title:"No se puede editar",html:`Esta marca tiene <b>${linkedCount}</b> estilo(s) vinculados.<br>Primero eliminá los estilos.`}); return; }
  }
  const titleEl = document.getElementById('entityModalTitle');
  const bodyEl  = document.getElementById('entityModalBody');
  let data = {};
  if (id) data = await apiGet(entity, "getById", { id });
  let brands=[], styles=[];
  if (["styles","labels"].includes(entity)) {
    brands = await apiGet("brands");
    styles = await apiGet("styles");
  }
  titleEl.textContent = (id ? "Editar " : "Agregar ") + LABELS[entity];
  bodyEl.innerHTML = modalBodyHtml(entity, data, brands, styles);
  if (entity==="labels"){
    const brandSel = bodyEl.querySelector("#labelBrandId");
    const styleSel = bodyEl.querySelector("#labelStyleId");
    const isCustom = bodyEl.querySelector("#labelIsCustom");
    const wrapStyle = bodyEl.querySelector("#labelStyleWrap");
    const wrapName  = bodyEl.querySelector("#labelNameWrap");
    const rebuildStyles = ()=> {
      const brandId = brandSel.value;
      const opts = styles.filter(s=>String(s.brandId)===String(brandId))
        .map(s=>`<option value="${s.id}">${s.name}</option>`).join("");
      styleSel.innerHTML = opts;
    };
    brandSel?.addEventListener("change", rebuildStyles);
    const toggleCustom = ()=>{
      const checked = isCustom.checked;
      if (checked){ wrapStyle.classList.add("d-none"); wrapName.classList.remove("d-none"); }
      else        { wrapStyle.classList.remove("d-none"); wrapName.classList.add("d-none"); }
    };
    isCustom?.addEventListener("change", toggleCustom);
    toggleCustom();
  }
  saveBtn.disabled = false;
  saveBtn.onclick = async ()=>{
    try{
      saveBtn.disabled = true;
      let obj = { id };
      if (entity==="brands"){
        obj.name = document.getElementById("brandName").value.trim();
        obj.color = document.getElementById("brandColor").value;
      } else if (entity==="styles"){
        const sel = document.getElementById("styleBrandId");
        obj.brandId = sel.value; obj.brandName = sel.options[sel.selectedIndex].text;
        obj.name = document.getElementById("styleName").value.trim();
        obj.color = document.getElementById("styleColor").value;
        obj.showAlways = document.getElementById("styleShowAlways").checked;
      } else if (entity==="fermenters"){
        obj.name = document.getElementById("fermenterName").value.trim();
        obj.sizeLiters = Number(document.getElementById("fermenterSize").value);
        obj.color = document.getElementById("fermenterColor").value;
      } else if (entity==="containers"){
        return `
          <div class="mb-2"><label class="form-label fw-semibold">Nombre</label>
            <input id="containerName" class="form-control" value="${data.name||""}">
          </div>
          <div class="mb-2"><label class="form-label fw-semibold">Tamaño (L)</label>
            <input id="containerSize" type="number" class="form-control" value="${data.sizeLiters||0}">
          </div>
          <div class="mb-2">
            <label class="form-label fw-semibold">Tipo</label>
            <select id="containerType" class="form-select">
              <option value="lata" ${data.type==="barril"?"":"selected"}>lata</option>
              <option value="barril" ${data.type==="barril"?"selected":""}>barril</option>
            </select>
          </div>
          <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
            <input id="containerColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color||"#000000"}">
          </div>`;
      } else if (entity==="emptyboxes"){
        obj.type      = document.getElementById("eb_type").value;       // box12 | box24
        obj.qty       = Math.max(1, Number(document.getElementById("eb_qty").value||1));
        obj.entryDate = fromDatetimeLocalValue(document.getElementById("eb_entry").value);
        obj.batch     = document.getElementById("eb_batch").value.trim();
        obj.provider  = document.getElementById("eb_provider").value.trim();
      } else if (entity==="labels"){
        const brandId = document.getElementById("labelBrandId").value;
        const isCustom = document.getElementById("labelIsCustom").checked;
        obj.isCustom = isCustom;
        obj.brandId = brandId;
        if (isCustom){
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
      Toast.fire({ icon:"success", title:`${LABELS[entity]} guardado` });
      await loadTable(entity, entity+"Table");
    } catch(err){
      console.error(err); Swal.fire("Error", err.message || "No se pudo guardar", "error");
    } finally { saveBtn.disabled = false; }
  };
  entityModal.show();
}
function openModal(entity, id=null){ return openEntityModal(entity,id); }
async function disableDuring(btn, fn){ if(!btn) return fn(); const prev=btn.innerHTML; btn.disabled=true; btn.innerHTML=`<span class="spinner-border spinner-border-sm me-1"></span>${btn.textContent}`; try{ await fn(); } finally{ btn.disabled=false; btn.innerHTML=prev; } }
function handleAddClick(btn, entity){ disableDuring(btn, ()=>openEntityModal(entity)); }
function handleEditClick(btn, entity, id){ disableDuring(btn, ()=>openEntityModal(entity,id)); }
function handleDeleteClick(btn, entity, id){ disableDuring(btn, ()=>deleteItem(entity,id)); }
async function deleteItem(entity, id){
  if (entity==="brands"){
    const styles = tableState.styles.items.length ? tableState.styles.items : await apiGet("styles");
    const linkedCount = styles.filter(s=>String(s.brandId)===String(id)).length;
    if (linkedCount>0){ await Swal.fire({icon:"info",title:"No se puede eliminar",html:`Esta marca tiene <b>${linkedCount}</b> estilo(s) vinculados.<br>Primero eliminá los estilos.`}); return; }
  }
  const r = await Swal.fire({
    title:"¿Eliminar?", text:"Esta acción no se puede deshacer.", icon:"warning",
    showCancelButton:true, confirmButtonText:"Sí, eliminar", cancelButtonText:"Cancelar",
    showLoaderOnConfirm:true, allowOutsideClick:()=>!Swal.isLoading(),
    preConfirm:async()=>{ const res=await apiDelete(entity,id); if(!res.ok) throw new Error(res.error||"No se pudo eliminar"); return true; }
  });
  if (r.isConfirmed){ Toast.fire({icon:"success", title:`${LABELS[entity]} eliminado`}); await loadTable(entity, entity+"Table"); }
}

/* =========================
   Index: Latas vacías (modal)
   ========================= */
function initEmptyCans(){
  const btn = document.getElementById("btnAddEmptyCan");
  if (!btn) return;
  const modalEl = document.getElementById("emptyCansModal");
  const modal = new bootstrap.Modal(modalEl);
  const save = document.getElementById("ec_save");
  btn.addEventListener("click", ()=>{
    document.getElementById("ec_qty").value = 1;
    document.getElementById("ec_batch").value = "";
    document.getElementById("ec_manu").value = "";
    const dt = document.getElementById("ec_dt");
    if (dt) dt.value = nowInputDateTime();
    save.disabled = false;
    modal.show();
  });
  save.addEventListener("click", async ()=>{
    try{
      save.disabled = true;
      const qty = Math.max(1, Number(document.getElementById("ec_qty").value || 1));
      const batch = document.getElementById("ec_batch").value.trim();
      const manufacturer = document.getElementById("ec_manu").value.trim();
      const entryDate = fromDatetimeLocalValue(document.getElementById("ec_dt").value);
      const res = await apiPost("emptycans", { qty, batch, manufacturer, entryDate });
      if (!res.ok) throw new Error(res.error || "No se pudo guardar");
      bootstrap.Modal.getInstance(document.getElementById("emptyCansModal"))?.hide();
      Toast.fire({ icon:"success", title:"Latas registradas" });
      await loadEmptyCans();
    } catch(e){
      console.error(e); Swal.fire("Error", e.message || "No se pudo guardar", "error");
    } finally { save.disabled = false; }
  });
}
async function loadEmptyCans(){
  const el = document.getElementById("emptyCansCount"); if(!el) return;
  try{ const data = await apiGet("emptycans","emptycans_count"); el.textContent = data.count ?? 0; } catch(e){ console.error(e); }
}

/* =========================
   PACKAGING / PRODUCCIÓN
   ========================= */
const packagingState = {
  brands: [], styles: [], containers: [], labels: [],
};
function typeIsCan(t){ return /lata/i.test(String(t||"")); }
function setQtyLabelForContainer(container){
  const lbl = document.getElementById("pk_qty_label");
  if (!lbl || !container) return;
  lbl.textContent = `Cantidad (${typeIsCan(container.type) ? "latas" : "barriles"})`;
}
async function updateContainerStock(){
  const sel = document.getElementById("pk_container");
  const badge = document.getElementById("pk_container_stock");
  if (!sel || !badge) return;
  const id = sel.value;
  if (!id){ badge.textContent = "—"; return; }
  const c = packagingState.containers.find(x => String(x.id)===String(id));
  setQtyLabelForContainer(c);
  if (c && typeIsCan(c.type)){
    try {
      const data = await apiGet("emptycans","emptycans_count");
      badge.textContent = (data.count ?? 0);
    } catch(e){
      console.error(e); badge.textContent = "—";
    }
  } else {
    badge.textContent = "—";
  }
}
function buildLabelOptions(){
  const sel = document.getElementById("pk_labelSel");
  const styleSel = document.getElementById("pk_style");
  if (!sel) return;
  const styleId = styleSel?.value || "";
  const all = packagingState.labels || [];
  // Agrupar: por estilo (no custom) y por nombre (custom). Sumar stock.
  const byStyle = new Map();
  const byCustom = new Map();
  for (const r of all){
    const qty = Number(r.qty||0);
    if (r.isCustom){
      const key = (String(r.name||"").trim().toLowerCase());
      byCustom.set(key, (byCustom.get(key)||{name:r.name, qty:0}));
      byCustom.get(key).qty += qty;
    } else {
      const key = String(r.styleId||"");
      if (!key) continue;
      if (!byStyle.has(key)) byStyle.set(key, {styleId:key, styleName:r.styleName, qty:0});
      byStyle.get(key).qty += qty;
    }
  }
  // Construir opciones (únicas)
  const opt = [];
  opt.push(`<option value="">— Sin etiqueta —</option>`);
  // sugerida por estilo seleccionado primero
  if (styleId && byStyle.has(styleId)){
    const v = byStyle.get(styleId);
    opt.push(`<option value="style:${v.styleId}">${v.styleName} — ${v.qty}</option>`);
    opt.push(`<option disabled>──────────</option>`);
  }
  // todas por estilo (excluye la sugerida)
  Array.from(byStyle.values())
    .filter(v => v.styleId !== styleId)
    .sort((a,b)=>a.styleName.localeCompare(b.styleName))
    .forEach(v => opt.push(`<option value="style:${v.styleId}">${v.styleName} — ${v.qty}</option>`));
  // custom
  if (byCustom.size){
    if (!styleId) opt.push(`<option disabled>──────────</option>`);
    Array.from(byCustom.values())
      .sort((a,b)=>a.name.localeCompare(b.name))
      .forEach(v => opt.push(`<option value="custom:${v.name}">(custom) ${v.name} — ${v.qty}</option>`));
  }
  sel.innerHTML = opt.join("");
}
function toggleLabelEnable(){
  const chk = document.getElementById("pk_labeled");
  const sel = document.getElementById("pk_labelSel");
  const contSel = document.getElementById("pk_container");
  const c = packagingState.containers.find(x => String(x.id)===String(contSel.value));
  const isCan = c && typeIsCan(c.type);
  const enabled = !!chk?.checked && isCan;
  if (sel) { sel.disabled = !enabled; if (!enabled) sel.value=""; }
}
async function loadPackagingCatalogs(){
  const [brands, styles, containers, labels] = await Promise.all([
    apiGet("brands"), apiGet("styles"), apiGet("containers"), apiGet("labels")
  ]);
  packagingState.brands = brands;
  packagingState.styles = styles;
  packagingState.containers = containers;
  packagingState.labels = labels;
  // fill selects
  const bSel = document.getElementById("pk_brand");
  const sSel = document.getElementById("pk_style");
  const cSel = document.getElementById("pk_container");
  if (bSel){
    bSel.innerHTML = `<option value="">— Elegí marca —</option>` + brands.map(b=>`<option value="${b.id}">${b.name}</option>`).join("");
  }
  if (sSel){
    sSel.innerHTML = `<option value="">— Elegí marca primero —</option>`;
    sSel.disabled = true;
  }
  if (cSel){
    cSel.innerHTML = `<option value="">— Seleccionar —</option>` + containers.map(c=>`<option value="${c.id}">${c.name} (${c.type||"?"})</option>`).join("");
  }
  buildLabelOptions();
  await updateContainerStock();
}
function wiringPackagingUI(){
  const bSel = document.getElementById("pk_brand");
  const sSel = document.getElementById("pk_style");
  const cSel = document.getElementById("pk_container");
  const qty = document.getElementById("pk_qty");
  const chkLbl = document.getElementById("pk_labeled");
  const chkPas = document.getElementById("pk_pasteurized");
  const btnClear = document.getElementById("pk_clear");
  const btnSubmit = document.getElementById("pk_submit");

  bSel?.addEventListener("change", ()=>{
    const brandId = bSel.value;
    if (!brandId){ sSel.innerHTML = `<option value="">— Elegí marca primero —</option>`; sSel.disabled = true; return; }
    const styles = packagingState.styles.filter(s=>String(s.brandId)===String(brandId));
    sSel.innerHTML = styles.map(s=>`<option value="${s.id}">${s.name}</option>`).join("") || `<option value="">(sin estilos)</option>`;
    sSel.disabled = false;
    buildLabelOptions();
  });
  sSel?.addEventListener("change", buildLabelOptions);
  cSel?.addEventListener("change", ()=>{ updateContainerStock(); toggleLabelEnable(); });
  chkLbl?.addEventListener("change", toggleLabelEnable);
  btnClear?.addEventListener("click", ()=>{
    bSel.value=""; sSel.innerHTML=`<option value="">— Elegí marca primero —</option>`; sSel.disabled=true;
    cSel.value=""; qty.value="24"; chkLbl.checked=false; chkPas.checked=false;
    updateContainerStock(); buildLabelOptions(); toggleLabelEnable();
  });
  btnSubmit?.addEventListener("click", async ()=>{
    try{
      const brandId = bSel.value;
      const styleId = sSel.value;
      const containerId = cSel.value;
      const container = packagingState.containers.find(c=>String(c.id)===String(containerId));
      const qtyVal = Math.max(1, Number(qty.value||0));
      const pasteurized = !!document.getElementById("pk_pasteurized").checked;
      const labeled = !!document.getElementById("pk_labeled").checked;
      if (!brandId || !styleId || !containerId || !qtyVal){ Swal.fire("Datos incompletos","Completá marca, estilo, envase y cantidad.","warning"); return; }
      let labelChoice = "";
      if (labeled && container && typeIsCan(container.type)){
        labelChoice = document.getElementById("pk_labelSel").value || "";
      }
      const style = packagingState.styles.find(s=>String(s.id)===String(styleId));
      const brand = packagingState.brands.find(b=>String(b.id)===String(brandId));
      const payload = {
        brandId, brandName: brand?.name||"", styleId, styleName: style?.name||"",
        containerId, qty: qtyVal, pasteurized, labeled, labelChoice
      };
      const res = await apiPost("production", payload, "produce");
      if (!res.ok) throw new Error(res.error || "Backend no aceptó la operación");
      Toast.fire({icon:"success", title:"Producción registrada"});
      // refrescos rápidos
      if (container && typeIsCan(container.type)) await updateContainerStock();
      packagingState.labels = await apiGet("labels"); // por si descontó etiquetas
      buildLabelOptions();
    } catch(e){
      console.error(e); Swal.fire("Error", e.message || "No se pudo registrar", "error");
    }
  });
  toggleLabelEnable();
}
async function initPackaging(){
  if (!document.getElementById("pk_brand")) return;
  await loadPackagingCatalogs();
  wiringPackagingUI();
}

/* =========================
   Boot
   ========================= */
async function boot(){
  initTheme();
  initEntityModal();
  initEmptyCans();
  await loadEmptyCans();
  if (document.getElementById("brandsTable")) {
    await loadTable("brands","brandsTable");
    await loadTable("styles","stylesTable");
    await loadTable("fermenters","fermentersTable");
    await loadTable("containers","containersTable");
  }
  if (document.getElementById("emptyboxesTable")) {
    await loadTable("emptyboxes","emptyboxesTable");
  }
  if (document.getElementById("labelsTable")) {
    await loadTable("labels","labelsTable");
  }
  if (document.getElementById("movementsTable")) {
    await loadMovements();
  }
  await initPackaging();
}
if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", boot); } else { boot(); }
