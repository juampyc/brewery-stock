
/*
  JS Control de Stock Castelo – producción + estados + charts + movimientos truncados
  Requiere: SweetAlert2, Bootstrap, Chart.js (solo en index.html)
*/

const API_BASE = "https://script.google.com/macros/s/AKfycbyEWps7rYKF1uYLcnLwcg0ldKku3HXAM3QCmLD03-RFIY8zrzGdwvFTFLa7viUCV6OS/exec";
const JSZIP_CDN = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js";

/* =========================
   API
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
  const json = await res.json();
  return json;
}
// Overwrite apiDelete to solicitar confirmación antes de eliminar
async function apiDelete(entity, id) {
  // Mostramos un modal de confirmación usando SweetAlert2. Si el usuario cancela, no realizamos la eliminación.
  const result = await Swal.fire({
    title: "¿Confirmar eliminación?",
    text: "Esta acción no se puede deshacer.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Eliminar",
    cancelButtonText: "Cancelar",
    focusCancel: true,
    showLoaderOnConfirm: true,
    preConfirm: async () => {
      // Realizamos la eliminación a través de apiPost con action delete.
      const res = await apiPost(entity, { id }, "delete");
      if (!res.ok && res.error) throw new Error(res.error || "Error al eliminar");
      return res;
    },
    allowOutsideClick: () => !Swal.isLoading(),
  });
  if (result.isConfirmed) {
    Toast.fire({ icon: "success", title: "Eliminado" });
    return result.value;
  }
  return { ok: false, cancelled: true };
}

/* =========================
   Toast
   ========================= */
const Toast = Swal.mixin({
  toast: true, position: "top-end", showConfirmButton: false,
  timer: 1700, timerProgressBar: true,
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
   Helpers
   ========================= */
function renderIdShort(id){ return id ? id.slice(-6) : ""; }
function renderColorSquare(color){ return color ? `<div class="color-box mx-auto" style="background:${color};"></div>` : ""; }
function renderDateLocal(s){
  if (!s) return "";
  const d = new Date(s);
  if (!isNaN(d)) return d.toLocaleString();
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[1]} ${m[2]}:${m[3]}`;
  return s;
}
const todayInputValue = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const nowInputDateTime = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};
function fromDatetimeLocalValue(v){ if(!v) return null; return v.replace("T"," ")+":00"; }

// Trunca "usados:uuid:1,uuid:2" -> "usados:xxxxxx:1,yyyyyy:2"
function shortenUsedRefs(text){
  if (!text) return "";
  return String(text).replace(/usados:([0-9a-f\-:_,]+)/gi, (m, group)=>{
    const parts = group.split(",");
    const mapped = parts.map(p=>{
      const [id,q] = p.split(":");
      const short = id ? id.slice(-6) : id;
      return `${short}:${q}`;
    });
    return "usados:"+mapped.join(",");
  });
}

// Acorta las referencias de labelId y styleId en el texto de movimientos.
// Por ejemplo: labelId=6ee10aff-0f36-4667-810c-157f1475ab40;styleId=9f981d4d-8791-4b59-a36d-fe37bccd44fc;isCustom=false
// Se transformará en: labelId=6ee10aff;styleId=9f981d4d;isCustom=false
function shortenMovementDesc(text){
  if (!text) return "";
  return String(text).replace(/(labelId|styleId)=([0-9a-f]{8})[0-9a-f-]*/gi, (m, key, prefix) => {
    return `${key}=${prefix}`;
  });
}

/* =========================
   Tabla Estado Latas (Production page) + acciones
   ========================= */
const CAN_STATES = [
  "final",
  "pasteurizada_sin_etiquetar",
  "sin_pasteurizar_etiquetada",
  "sin_pasteurizar_sin_etiquetar"
];

async function loadProductionData(){
  // Cambiamos entity "cans_stock" por "cans" porque el backend no reconoce "cans_stock" como entidad.
  const [styles, cans] = await Promise.all([apiGet("styles"), apiGet("cans")]);
  // agrupar por style
  const byStyle = new Map();
  for (const s of styles) {
    byStyle.set(String(s.id), { style:s, totals: {final:0, pasteurizada_sin_etiquetar:0, sin_pasteurizar_etiquetada:0, sin_pasteurizar_sin_etiquetar:0}, labelNames:new Set() });
  }
  for (const c of cans) {
    if (!byStyle.has(String(c.styleId))) continue;
    const acc = byStyle.get(String(c.styleId));
    const st  = String(c.state||"");
    const q   = Number(c.qty||0);
    if (acc.totals[st] != null) acc.totals[st] += q;
    if (c.labelName) acc.labelNames.add(c.labelName);
  }
  renderProductionTable(Array.from(byStyle.values()));
}

function renderProductionTable(rows){
  const tb = document.querySelector("#prod_table tbody"); if (!tb) return;
  tb.innerHTML = "";
  for (const r of rows){
    const { style, totals, labelNames } = r;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${style.brandName || ""}</td>
      <td>${style.name || ""}</td>
      <td class="text-end">${totals.final}</td>
      <td class="text-end">${totals.pasteurizada_sin_etiquetar}</td>
      <td class="text-end">${totals.sin_pasteurizar_etiquetada}</td>
      <td class="text-end">${totals.sin_pasteurizar_sin_etiquetar}</td>
      <td>${[...labelNames].join(", ")}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-primary me-1" data-style="${style.id}" onclick="openRegisterProduction('${style.id}')">Registrar</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="openTransition('${style.id}')">Cambiar estado</button>
      </td>
    `;
    tb.appendChild(tr);
  }
}

/* ===== Registrar producción ===== */
async function openRegisterProduction(styleId){
  try{
    const [styles, labels] = await Promise.all([apiGet("styles"), apiGet("labels")]);
    const style = styles.find(s => String(s.id)===String(styleId)) || styles[0];
    const styleOpts = styles.map(s=>`<option value="${s.id}" ${String(s.id)===String(styleId)?"selected":""}>${s.brandName} - ${s.name}</option>`).join("");
    const labelOptsForStyle = labels
      .filter(l => !l.isCustom && String(l.styleId)===String(style.id))
      .map(l => `<option value="${l.id}">${l.styleName} (estilo)</option>`)
      .join("");
    const labelCustomOpts = labels
      .filter(l => !!l.isCustom)
      .map(l => `<option value="${l.id}">(custom) ${l.name}</option>`).join("");

    const html = `
      <div class="mb-2">
        <label class="form-label fw-semibold">Estilo</label>
        <select id="rp_style" class="form-select">${styleOpts}</select>
      </div>
      <div class="row g-2">
        <div class="col-sm-4">
          <label class="form-label fw-semibold">Cantidad (latas)</label>
          <input id="rp_qty" type="number" class="form-control" value="24" min="1">
        </div>
        <div class="col-sm-4">
          <label class="form-label fw-semibold">Fecha/hora</label>
          <input id="rp_dt" type="datetime-local" class="form-control" value="${nowInputDateTime()}">
        </div>
      </div>
      <div class="form-check mt-2">
        <input class="form-check-input" type="checkbox" id="rp_labeled">
        <label class="form-check-label" for="rp_labeled">Etiquetada</label>
      </div>
      <div class="mb-2 d-none" id="rp_label_wrap">
        <label class="form-label fw-semibold">Etiqueta a consumir</label>
        <select id="rp_label" class="form-select">
          <option value="">(usar etiquetas por estilo)</option>
          ${labelOptsForStyle}
          ${labelCustomOpts ? `<optgroup label="Personalizadas">${labelCustomOpts}</optgroup>` : ""}
        </select>
        <div class="form-text">Se descuenta por FIFO del stock de etiquetas disponible.</div>
      </div>
      <div class="form-check mt-2">
        <input class="form-check-input" type="checkbox" id="rp_pasteurized">
        <label class="form-check-label" for="rp_pasteurized">Pasteurizada</label>
      </div>
    `;

    const result = await Swal.fire({
      title:"Registrar producción",
      html,
      focusConfirm:false,
      showCancelButton:true,
      showLoaderOnConfirm:true,
      didOpen: () => {
        const cb = document.getElementById("rp_labeled");
        const wrap = document.getElementById("rp_label_wrap");
        cb.addEventListener("change", ()=>{
          wrap.classList.toggle("d-none", !cb.checked);
        });
      },
      preConfirm: () => {
        const styleIdSel = document.getElementById("rp_style").value;
        const qty = Math.max(1, Number(document.getElementById("rp_qty").value||0));
        const dt = fromDatetimeLocalValue(document.getElementById("rp_dt").value);
        const labeled = document.getElementById("rp_labeled").checked;
        const pasteurized = document.getElementById("rp_pasteurized").checked;
        const labelId = document.getElementById("rp_label").value;
        return { styleId: styleIdSel, qty, dateTime: dt, labeled, pasteurized, labelId };
      }
    });
    if (!result.isConfirmed) return;

    const payload = result.value;
    const resp = await apiPost("production", payload, "produce");
    if (!resp.ok && resp.error) throw new Error(resp.error);
    Toast.fire({icon:"success", title:"Producción registrada"});
    await loadProductionData();
  } catch(err){
    console.error(err);
    Swal.fire("Error", err.message || "No se pudo registrar la producción", "error");
  }
}

/* ===== Cambiar estado ===== */
async function openTransition(styleId){
  try{
    const styles = await apiGet("styles");
    const style = styles.find(s => String(s.id)===String(styleId)) || styles[0];
    const labels = await apiGet("labels");

    const labelOptsForStyle = labels
      .filter(l => !l.isCustom && String(l.styleId)===String(style.id))
      .map(l => `<option value="${l.id}">${l.styleName} (estilo)</option>`).join("");
    const labelCustomOpts = labels
      .filter(l => !!l.isCustom)
      .map(l => `<option value="${l.id}">(custom) ${l.name}</option>`).join("");

    const html = `
      <div class="mb-2"><b>${style.brandName} - ${style.name}</b></div>
      <div class="row g-2">
        <div class="col-sm-4">
          <label class="form-label fw-semibold">Cantidad</label>
          <input id="ts_qty" type="number" class="form-control" value="12" min="1">
        </div>
        <div class="col-sm-4">
          <label class="form-label fw-semibold">Fecha/hora</label>
          <input id="ts_dt" type="datetime-local" class="form-control" value="${nowInputDateTime()}">
        </div>
      </div>
      <div class="mb-2">
        <label class="form-label fw-semibold">Pasar a estado</label>
        <select id="ts_to" class="form-select">
          <option value="final">Final (lista)</option>
          <option value="pasteurizada_sin_etiquetar">Pasteurizada sin etiquetar</option>
          <option value="sin_pasteurizar_etiquetada">Sin pasteurizar y etiquetada</option>
          <option value="sin_pasteurizar_sin_etiquetar">Sin pasteurizar y sin etiquetar</option>
        </select>
      </div>
      <div class="form-check mt-2">
        <input class="form-check-input" type="checkbox" id="ts_consume_labels">
        <label class="form-check-label" for="ts_consume_labels">Consumir etiquetas si el destino es etiquetado</label>
      </div>
      <div class="mb-2 d-none" id="ts_label_wrap">
        <label class="form-label fw-semibold">Etiqueta a consumir</label>
        <select id="ts_label" class="form-select">
          <option value="">(usar etiquetas por estilo)</option>
          ${labelOptsForStyle}
          ${labelCustomOpts ? `<optgroup label="Personalizadas">${labelCustomOpts}</optgroup>` : ""}
        </select>
      </div>
    `;

    const result = await Swal.fire({
      title:"Cambiar estado",
      html,
      focusConfirm:false,
      showCancelButton:true,
      showLoaderOnConfirm:true,
      didOpen: () => {
        const cb = document.getElementById("ts_consume_labels");
        const wrap = document.getElementById("ts_label_wrap");
        const selTo = document.getElementById("ts_to");
        function toggle(){
          const to = selTo.value;
          const needsLabel = /etiquetad/i.test(to);
          wrap.classList.toggle("d-none", !needsLabel || !cb.checked);
        }
        cb.addEventListener("change", toggle);
        selTo.addEventListener("change", toggle);
        toggle();
      },
      preConfirm: () => {
        const qty = Math.max(1, Number(document.getElementById("ts_qty").value||0));
        const dt  = fromDatetimeLocalValue(document.getElementById("ts_dt").value);
        const to  = document.getElementById("ts_to").value;
        const consumeLabels = document.getElementById("ts_consume_labels").checked;
        const labelId = document.getElementById("ts_label").value;
        return { qty, dateTime: dt, toState: to, consumeLabels, labelId };
      }
    });
    if (!result.isConfirmed) return;

    const p = result.value;
    const resp = await apiPost("cans", {
      styleId, fromState:"", toState: p.toState, qty: p.qty, dateTime: p.dateTime,
      consumeLabels: p.consumeLabels, labelId: p.labelId
    }, "transition_state");
    if (!resp.ok && resp.error) throw new Error(resp.error);
    Toast.fire({icon:"success", title:"Estado actualizado"});
    await loadProductionData();
  } catch(err){
    console.error(err);
    Swal.fire("Error", err.message || "No se pudo cambiar el estado", "error");
  }
}

/* ===== Registrar latas vacías ===== */
async function openRegisterEmptyCans(){
  try{
    // Construimos formulario simple: cantidad, proveedor (opcional), lote (opcional)
    const html = `
      <div class="mb-2">
        <label class="form-label fw-semibold">Cantidad</label>
        <input id="ec_qty" type="number" class="form-control" value="24" min="1" />
      </div>
      <div class="mb-2">
        <label class="form-label fw-semibold">Proveedor (opcional)</label>
        <input id="ec_provider" type="text" class="form-control" placeholder="Proveedor" />
      </div>
      <div class="mb-2">
        <label class="form-label fw-semibold">Lote (opcional)</label>
        <input id="ec_batch" type="text" class="form-control" placeholder="Lote" />
      </div>
    `;
    const result = await Swal.fire({
      title: "Registrar latas vacías",
      html,
      focusConfirm: false,
      showCancelButton: true,
      preConfirm: () => {
        const qty = Math.max(1, Number(document.getElementById("ec_qty").value||0));
        const provider = document.getElementById("ec_provider").value || "";
        const batch = document.getElementById("ec_batch").value || "";
        return { qty, provider, batch };
      }
    });
    if (!result.isConfirmed) return;
    const { qty, provider, batch } = result.value;
    // Obtenemos fecha/hora actual para entryDate
    const dt = fromDatetimeLocalValue(nowInputDateTime());
    const payload = {
      qty,
      batch,
      manufacturer: provider || "",
      purchase: "",
      entryDate: dt
    };
    const resp = await apiPost("emptycans", payload);
    if (!resp.ok && resp.error) throw new Error(resp.error);
    Toast.fire({ icon: "success", title: "Latas vacías registradas" });
    // Actualizamos resumen si estamos en el index
    await renderIndex();
  } catch(err){
    console.error(err);
    Swal.fire("Error", err.message || "No se pudo registrar", "error");
  }
}

/* =========================
   Movements table helpers (IDs truncados)
   ========================= */
function applyMovementFilters(list){ return list; } // placeholder
function rowMatches(row,q){ if(!q) return true; return JSON.stringify(row).toLowerCase().includes(q.toLowerCase()); }

function renderMovementsTable(list){
  const tbody = document.querySelector("#movementsTable tbody");
  const pager = document.getElementById("movementsPager");
  if (!tbody) return;
  tbody.innerHTML = "";
  const rows = list;
  for (const row of rows){
    const tr = document.createElement("tr");
    // Acortamos referencias: tanto "usados:uuid:x" como "labelId=uuid;styleId=uuid". Utilizamos helpers para mejor presentación.
    let desc = row.description || "";
    desc = shortenUsedRefs(desc);
    desc = shortenMovementDesc(desc);
    tr.innerHTML = `
      <td>${renderIdShort(row.id)}</td>
      <td>${renderDateLocal(row.dateTime)}</td>
      <td>${row.entity||""}</td>
      <td>${row.type||""}</td>
      <td>${row.qty ?? 0}</td>
      <td>${desc}</td>
      <td>${renderDateLocal(row.lastModified)}</td>
    `;
    tbody.appendChild(tr);
  }
  if (pager) pager.innerHTML = "";
}

/* =========================
   Config envases: limitar a "lata"
   ========================= */
function containersModalBody(data={}){
  return `
    <div class="mb-2"><label class="form-label fw-semibold">Nombre</label><input id="containerName" class="form-control" value="${data.name||""}"></div>
    <div class="mb-2"><label class="form-label fw-semibold">Tamaño (L)</label><input id="containerSize" type="number" class="form-control" value="${data.sizeLiters||0}"></div>
    <div class="mb-2"><label class="form-label fw-semibold">Tipo</label>
      <select id="containerType" class="form-select">
        <option value="lata" selected>Lata</option>
      </select>
    </div>
    <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
      <input id="containerColor" type="color" class="form-control form-control-color mx-auto" style="width:3.2rem;height:3.2rem;" value="${data.color||"#000000"}">
    </div>`;
}

/* =========================
   Index: charts
   ========================= */
async function renderIndex(){
  try{
    // Cambiamos entity "cans_stock" por "cans" porque el backend no reconoce "cans_stock" como entidad.
    const [styles, cans, emptycans, labels] = await Promise.all([
      apiGet("styles"), apiGet("cans"), apiGet("emptycans"), apiGet("labels")
    ]);
    const styleMap = new Map(styles.map(s=>[String(s.id), s]));
    // sum stock por estilo (todas las variantes)
    const sumByStyle = new Map();
    for (const s of styles){ sumByStyle.set(String(s.id), 0); }
    for (const c of cans){ sumByStyle.set(String(c.styleId), (sumByStyle.get(String(c.styleId))||0) + Number(c.qty||0)); }

    const labelsNames = [];
    const labelsQtys = [];
    for (const s of styles){
      if (s.showAlways || (sumByStyle.get(String(s.id))||0) > 0){
        labelsNames.push(`${s.brandName}-${s.name}`);
        labelsQtys.push(sumByStyle.get(String(s.id))||0);
      }
    }
    // Cards
    const cardCans = document.getElementById("idx_total_cans");
    const cardEmpty = document.getElementById("idx_total_emptycans");
    const cardLabels = document.getElementById("idx_total_labels");
    if (cardCans) cardCans.textContent = (cans.reduce((a,x)=>a+Number(x.qty||0),0));
    if (cardEmpty) cardEmpty.textContent = (emptycans.reduce((a,x)=>a+Number(x.qty||0),0));
    if (cardLabels) cardLabels.textContent = (labels.reduce((a,x)=>a+Number(x.qty||0),0));

    // Chart.js
    if (window.Chart){
      // Gráfico de stock de latas por estilo
      const ctx = document.getElementById("idx_chart_styles");
      if (ctx){
        new Chart(ctx, {
          type: "bar",
          data: {
            labels: labelsNames,
            datasets: [{ label:"Stock de latas por estilo", data: labelsQtys }]
          },
          options: { responsive:true, plugins:{ legend:{ display:false }}, scales:{ y:{ beginAtZero:true } } }
        });
      }
      // Segundo gráfico: etiquetas disponibles por estilo (suma de etiquetas no personalizadas por estilo)
      const ctxLabels = document.getElementById("idx_chart_labels");
      if (ctxLabels){
        // Agrupamos cantidad de etiquetas por styleId (no custom)
        const labelTotals = new Map(styles.map(s=>[String(s.id), 0]));
        for (const lbl of labels){
          if (!lbl.isCustom && labelTotals.has(String(lbl.styleId))){
            labelTotals.set(String(lbl.styleId), (labelTotals.get(String(lbl.styleId))||0) + Number(lbl.qty||0));
          }
        }
        const labelsStyleNames = [];
        const labelsStyleQtys = [];
        for (const s of styles){
          const totalLbl = labelTotals.get(String(s.id)) || 0;
          // Mostramos estilos que se muestran siempre o que tienen etiquetas
          if (s.showAlways || totalLbl > 0){
            labelsStyleNames.push(`${s.brandName}-${s.name}`);
            labelsStyleQtys.push(totalLbl);
          }
        }
        new Chart(ctxLabels, {
          type: "bar",
          data: {
            labels: labelsStyleNames,
            datasets: [{ label:"Etiquetas disponibles", data: labelsStyleQtys }]
          },
          options: { responsive:true, plugins:{ legend:{ display:false }}, scales:{ y:{ beginAtZero:true } } }
        });
      }
    }
  } catch(e){
    console.error(e);
  }
}

/* =========================
   Production page init
   ========================= */
async function bootProduction(){
  await loadProductionData();
  // botón header
  const btn = document.getElementById("btnNewProduction");
  btn?.addEventListener("click", ()=> openRegisterProduction(""));
}

/* =========================
   Movements page init (simple)
   ========================= */
async function bootMovements(){
  try{
    const rows = await apiGet("movements");
    renderMovementsTable(rows);
  }catch(e){ console.error(e); }
}

/* =========================
   Index init
   ========================= */
async function bootIndex(){
  await renderIndex();
  // Botón para registrar latas vacías
  const btnEC = document.getElementById("btnRegisterEmptyCans");
  if (btnEC) {
    btnEC.addEventListener("click", function(){
      const el = this;
      // deshabilitamos el botón durante la operación
      el.disabled = true;
      openRegisterEmptyCans().finally(()=>{ el.disabled = false; });
    });
  }
}

/* =========================
   Generic boot
   ========================= */
async function boot(){
  initTheme();
  if (document.getElementById("prod_table")) await bootProduction();
  if (document.getElementById("movementsTable")) await bootMovements();
  if (document.getElementById("idx_chart_styles")) await bootIndex();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
