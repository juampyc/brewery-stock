/*
  JS Control de Stock Castelo – núcleo + Producción/Empaquetado
  Esta versión agrega:
    • Registrar producción (consume latas vacías y opcionalmente etiquetas)
    • Ingreso de cajas x12 / x24 (emptyboxes)
    • Empaquetado (consume latas + cajas y crea Packages)
    • Vistas de stock en packaging.html
    • Render de movimientos con IDs abreviados en 'usados:'
    • En config: el modal de Envases usa <select> 'lata' | 'barril'
*/

const API_BASE = "https://script.google.com/macros/s/AKfycbyC5R2_esM9BwXZLRmF2gcqrLU163eBh_rK-8GOb_gzuJkKj4E8gR0g8BhsgsFf-wqi/exec";
const JSZIP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

/* =========================
   API helpers
   ========================= */
async function apiGet(entity, action = "getAll", extra = {}) {
  const params = new URLSearchParams({ entity, action, ...extra });
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error(`GET ${entity}/${action} HTTP ${res.status}`);
  return res.json();
}
async function apiPost(entity, data, action) {
  const url = action ? `${API_BASE}?entity=${entity}&action=${action}` : `${API_BASE}?entity=${entity}`;
  const res = await fetch(url, { method: "POST", body: JSON.stringify(data || {}) });
  if (!res.ok) throw new Error(`POST ${entity}/${action||"upsert"} HTTP ${res.status}`);
  return res.json();
}
async function apiDelete(entity, id) { return apiPost(entity, { id }, "delete"); }

/* =========================
   UI utils
   ========================= */
const Toast = Swal.mixin({
  toast: true, position: "top-end", showConfirmButton: false,
  timer: 1700, timerProgressBar: true,
  didOpen: t => { t.addEventListener("mouseenter", Swal.stopTimer); t.addEventListener("mouseleave", Swal.resumeTimer); }
});
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

// helpers fechas/strings
function renderIdShort(id){ return id ? String(id).slice(-6) : ""; }
function renderDateLocal(s){
  if (!s) return "";
  const d = new Date(s);
  if (!isNaN(d)) return d.toLocaleString();
  const m = String(s).match(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/);
  return m ? s.replace("T"," ") : s;
}
const todayInputValue = () => {
  const d = new Date(); const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
};
const nowInputDateTime = () => {
  const d = new Date(); const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  const hh = String(d.getHours()).padStart(2,"0");
  const mi = String(d.getMinutes()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
};

/* =========================
   Movimientos: abreviar referencias en 'usados:'
   ========================= */
function shortenUsedRefs(desc){
  if (!desc) return "";
  // Busca patrones id:qty separados por coma tras 'usados:'
  // y se queda con los últimos 6 caracteres del id
  try {
    return String(desc).replace(/usados:([^\s]+)/g, (m, list) => {
      const parts = list.split(",");
      const short = parts.map(p => {
        const [id, qty] = p.split(":");
        const s = id ? id.slice(-6) : "";
        return `${s}:${qty||""}`;
      }).join(",");
      return `usados:${short}`;
    });
  } catch { return desc; }
}

/* =========================
   CONFIG MODAL – sólo lata/barril
   ========================= */
function modalBodyHtml(entity, data={}, brands=[], styles=[]){
  if (entity==="containers"){
    const type = String(data.type||"lata");
    return `
      <div class="mb-2"><label class="form-label fw-semibold">Nombre</label>
        <input id="containerName" class="form-control" value="${data.name||""}"></div>
      <div class="mb-2"><label class="form-label fw-semibold">Tamaño (L)</label>
        <input id="containerSize" type="number" class="form-control" value="${data.sizeLiters||0}"></div>
      <div class="mb-2"><label class="form-label fw-semibold">Tipo</label>
        <select id="containerType" class="form-select">
          <option value="lata" ${type==="lata"?"selected":""}>lata</option>
          <option value="barril" ${type==="barril"?"selected":""}>barril</option>
        </select>
      </div>
      <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
        <input id="containerColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color||"#000000"}">
      </div>`;
  }
  // … el resto de entidades se definen más abajo si este archivo se usa como reemplazo total
  return window.__modalBodyHtmlFallback ? window.__modalBodyHtmlFallback(entity,data,brands,styles) : "";
}

/* =======================================================
   PACKAGING (Producción / Empaquetado / Cajas)
   ======================================================= */
const pkg = {
  styles: [], brands: [], containers: [], labels: [], cans: [], packages: [], boxes: [],
};

function canContainers(){ return pkg.containers.filter(c => String(c.type||"").toLowerCase() === "lata"); }
function setSel(sel, items, labelFn, valueKey="id"){
  if (!sel) return;
  sel.innerHTML = items.map(o => `<option value="${o[valueKey]}">${labelFn(o)}</option>`).join("");
}

function labelsForSelect(styleId){
  const res = [];
  // Opción no etiquetada
  res.push({ id:"__none__", name:"— Sin etiqueta —" });
  // Opción "por estilo" (agregada si hay stock total > 0, pero igual la mostramos)
  res.push({ id:"__by_style__", name:"— Por estilo (todas) —" });
  // Custom labels (únicamente)
  const customs = pkg.labels.filter(l => !!l.isCustom);
  // Mostrar todos los custom, sin duplicados por nombre
  const seen = new Set();
  customs.forEach(l => {
    const key = (l.name||"").trim().toLowerCase();
    if (key && !seen.has(key)){
      seen.add(key);
      res.push({ id: l.id, name: `(custom) ${l.name}` });
    }
  });
  return res;
}

// disponibilidad de insumos
function emptyCansAvailable(){
  return pkg.emptycans_total || 0;
}
function labelsAvailable(styleId, labelId){
  if (labelId && !labelId.startsWith("__")){
    return pkg.labels.filter(l => String(l.id)===String(labelId))
      .reduce((a,x)=>a+(Number(x.qty)||0),0);
  }
  // por estilo
  return pkg.labels.filter(l => !l.isCustom && String(l.styleId)===String(styleId))
    .reduce((a,x)=>a+(Number(x.qty)||0),0);
}
function boxesAvailable(type){
  return pkg.boxes.filter(b => String(b.type)===String(type))
    .reduce((a,x)=>a+(Number(x.qty)||0),0);
}
function cansAvailable(styleId, state="", labelId=""){
  let rows = pkg.cans.filter(c => String(c.styleId)===String(styleId));
  if (state) rows = rows.filter(c => String(c.state)===String(state));
  if (labelId) rows = rows.filter(c => String(c.labelId||"")===String(labelId));
  return rows.reduce((a,x)=>a+(Number(x.qty)||0),0);
}

async function loadPackagingData(){
  const [brands, styles, containers, labels, cans, emptyboxes, packages, emptycans] = await Promise.all([
    apiGet("brands"), apiGet("styles"), apiGet("containers"), apiGet("labels"),
    apiGet("cans"), apiGet("emptyboxes"), apiGet("packages"), apiGet("emptycans")
  ]);
  pkg.brands = brands; pkg.styles = styles; pkg.containers = containers;
  pkg.labels = labels; pkg.cans = cans; pkg.boxes = emptyboxes; pkg.packages = packages;
  pkg.emptycans_total = Array.isArray(emptycans) ? emptycans.reduce((a,x)=>a+(Number(x.qty)||0),0) : 0;

  // Totales header
  const ecEl = document.getElementById("ec_stock");
  const b12  = document.getElementById("bx12_stock");
  const b24  = document.getElementById("bx24_stock");
  if (ecEl) ecEl.textContent = pkg.emptycans_total;
  if (b12) b12.textContent = boxesAvailable("box12");
  if (b24) b24.textContent = boxesAvailable("box24");

  // Poblar selects en pestañas
  const styleOpts = pkg.styles.map(s => ({ id:s.id, name:`${s.brandName||""} ${s.name||""}`.trim() }));
  setSel(document.getElementById("prod_style"), styleOpts, o=>o.name);
  setSel(document.getElementById("pack_style"), styleOpts, o=>o.name);

  // Envases (solo lata)
  const canOpts = canContainers().map(c => ({ id:c.id, name:`${c.name||"lata"} ${c.sizeLiters?`(${c.sizeLiters}L)`: ""}`.trim() }));
  setSel(document.getElementById("prod_container"), canOpts, o=>o.name);

  // Labels (depende del estilo seleccionado)
  rebuildLabelSelects();

  // fechas por defecto
  const dtEls = ["prod_dt","pack_dt","bx_dt"].map(id=>document.getElementById(id));
  dtEls.forEach(el => { if (el) el.value = nowInputDateTime(); });

  // stocks en tablas
  renderPackagingStocks();
  updateProduceHelpers();
  updatePackageHelpers();
  renderBoxesStockTable();
}

function rebuildLabelSelects(){
  const styleId = document.getElementById("prod_style")?.value || "";
  const ls = labelsForSelect(styleId);
  setSel(document.getElementById("prod_label"), ls, o=>o.name);
  // empaquetado: permitimos elegir también etiqueta para filtrar (incluye '— cualquiera —')
  const pkSel = document.getElementById("pack_label");
  if (pkSel){
    const pk = [{id:"", name:"— Cualquiera —"}].concat(ls.filter(o => o.id!=="__none__"));
    pkSel.innerHTML = pk.map(o=>`<option value="${o.id}">${o.name}</option>`).join("");
  }
  updateLabelAvail();
}

function updateProduceHelpers(){
  const ecAvail = emptyCansAvailable();
  const el = document.getElementById("prod_ec_avail"); if (el) el.textContent = ecAvail;
  updateLabelAvail();
}
function updateLabelAvail(){
  const styleId = document.getElementById("prod_style")?.value || "";
  const opt = document.getElementById("prod_label")?.value || "__none__";
  const avail = labelsAvailable(styleId, opt==="__by_style__" ? "" : opt);
  const el = document.getElementById("prod_lbl_avail"); if (el) el.textContent = avail;
}

function renderPackagingStocks(){
  // CANS
  const tb = document.getElementById("stock_cans_tbody");
  if (tb){
    tb.innerHTML = "";
    const rows = pkg.cans.slice().sort((a,b)=> String(a.styleName||"").localeCompare(b.styleName||"") || String(a.state||"").localeCompare(b.state||""));
    for (const r of rows){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.styleName||""}</td><td>${r.state||""}</td><td>${r.labelName||""}</td><td class="text-end">${r.qty||0}</td>`;
      tb.appendChild(tr);
    }
  }
  // PACKAGES
  const tp = document.getElementById("stock_pk_tbody");
  if (tp){
    tp.innerHTML = "";
    const rows = pkg.packages.slice().sort((a,b)=> String(a.styleName||"").localeCompare(b.styleName||""));
    for (const r of rows){
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.styleName||""}</td><td>${r.labelName||""}</td><td>${r.type||""}</td><td class="text-end">${r.boxes||0}</td><td class="text-end">${r.qtyCans||0}</td>`;
      tp.appendChild(tr);
    }
  }
}
function renderBoxesStockTable(){
  const tb = document.getElementById("stock_boxes_tbody");
  if (!tb) return;
  const total12 = boxesAvailable("box12");
  const total24 = boxesAvailable("box24");
  tb.innerHTML = `<tr><td>Caja x12</td><td class="text-end">${total12}</td></tr><tr><td>Caja x24</td><td class="text-end">${total24}</td></tr>`;
}

async function submitProduction(){
  const styleId = document.getElementById("prod_style").value;
  const containerId = document.getElementById("prod_container").value || "";
  const qty = Math.max(1, Number(document.getElementById("prod_qty").value||0));
  const pasteurized = document.getElementById("prod_pasteurized").checked;
  const labeled = document.getElementById("prod_labeled").checked;
  const labelSel = document.getElementById("prod_label").value;
  const dateTime = document.getElementById("prod_dt").value;

  const payload = { styleId, qty, pasteurized, labeled, dateTime, containerId };
  if (labeled){
    if (labelSel && labelSel !== "__by_style__" && labelSel !== "__none__") payload.labelId = labelSel;
    // si es "__by_style__", no enviamos labelId para consumir por estilo
  }

  const res = await apiPost("production", payload, "produce");
  if (!res.ok && res.error) throw new Error(res.error);
  Toast.fire({ icon:"success", title:"Producción registrada" });
  await loadPackagingData();
}

function updatePackUnits(){
  const type = document.getElementById("pack_type").value;
  const boxes = Math.max(1, Number(document.getElementById("pack_boxes").value||0));
  const units = (type === "box24" ? 24 : 12) * boxes;
  const u = document.getElementById("pack_units"); if (u) u.value = units;
}
function updatePackageHelpers(){
  const type = document.getElementById("pack_type")?.value || "box12";
  const boxesAvail = boxesAvailable(type);
  const el = document.getElementById("pack_boxes_avail"); if (el) el.textContent = boxesAvail;
  updatePackUnits();
  // disponibilidad de latas con filtros actuales
  const styleId = document.getElementById("pack_style")?.value || "";
  const state = document.getElementById("pack_state")?.value || "";
  const label = document.getElementById("pack_label")?.value || "";
  const avail = cansAvailable(styleId, state, (label==="__by_style__"?"":label));
  const ael = document.getElementById("pack_avail"); if (ael) ael.textContent = avail;
}

async function submitBoxes(){
  const type = document.getElementById("bx_type").value;
  const qty = Math.max(1, Number(document.getElementById("bx_qty").value||0));
  const dt = document.getElementById("bx_dt").value;
  const res = await apiPost("emptyboxes", { type, qty, entryDate: dt });
  if (!res.ok && res.error) throw new Error(res.error);
  Toast.fire({ icon:"success", title:"Cajas ingresadas" });
  await loadPackagingData();
}

async function submitPackage(){
  const styleId = document.getElementById("pack_style").value;
  const state = document.getElementById("pack_state").value;
  const label = document.getElementById("pack_label").value;
  const type = document.getElementById("pack_type").value;
  const boxes = Math.max(1, Number(document.getElementById("pack_boxes").value||0));
  const dt = document.getElementById("pack_dt").value;

  const payload = { styleId, state, labelId: (label==="__by_style__"?"":label), type, boxes, dateTime: dt };
  const res = await apiPost("packages", payload, "package");
  if (!res.ok && res.error) throw new Error(res.error);
  Toast.fire({ icon:"success", title:"Empaquetado registrado" });
  await loadPackagingData();
}

/* =========================
   INIT – engancha packaging si está esa página
   ========================= */
async function initPackagingPage(){
  // listeners
  const els = {
    prod_style: "#prod_style", prod_label: "#prod_label", prod_labeled: "#prod_labeled",
    prod_submit: "#prod_submit",
    pack_style: "#pack_style", pack_state: "#pack_state", pack_label: "#pack_label",
    pack_type: "#pack_type", pack_boxes: "#pack_boxes", pack_submit: "#pack_submit",
    bx_submit: "#bx_submit"
  };
  const q = sel => document.querySelector(sel);
  q(els.prod_style)?.addEventListener("change", ()=>{ rebuildLabelSelects(); updateProduceHelpers(); updatePackageHelpers(); });
  q(els.prod_label)?.addEventListener("change", updateLabelAvail);
  q(els.prod_labeled)?.addEventListener("change", ()=>{
    const on = q(els.prod_labeled).checked;
    q("#prod_label").disabled = !on;
  });
  q(els.prod_submit)?.addEventListener("click", async ()=>{
    try{ await submitProduction(); } catch(e){ console.error(e); Swal.fire("Error", e.message || "No se pudo registrar producción","error"); }
  });

  ["pack_style","pack_state","pack_label","pack_type","pack_boxes"].forEach(id=>{
    q("#"+id)?.addEventListener("change", updatePackageHelpers);
    q("#"+id)?.addEventListener("input", updatePackUnits);
  });
  q(els.pack_submit)?.addEventListener("click", async ()=>{
    try{ await submitPackage(); } catch(e){ console.error(e); Swal.fire("Error", e.message || "No se pudo empaquetar","error"); }
  });

  q(els.bx_submit)?.addEventListener("click", async ()=>{
    try{ await submitBoxes(); } catch(e){ console.error(e); Swal.fire("Error", e.message || "No se pudo ingresar cajas","error"); }
  });

  await loadPackagingData();
}

/* =========================
   BOOT
   ========================= */
async function boot(){
  initTheme();

  // Packaging page?
  if (document.getElementById("pkg_tabs")) {
    await initPackagingPage();
  }
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
