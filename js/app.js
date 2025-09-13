/*
  Cambios clave (2025-09-13):
  - Confirmación al eliminar (todas las entidades)
  - Botón/acción deshabilitado durante operaciones (anti doble click)
  - Agregado "Ingresar latas vacías" (emptycans.add)
  - Config: bloqueo de eliminación de marca si tiene etiquetas asociadas
  - Etiquetas: validación marca–estilo salvo "Es personalizada"; checkbox movido arriba
  - Movimientos: truncar ids en la UI (labelId/brandId/styleId/usados) sin modificar DB
  - Movimientos: columnas más anchas (CSS)
*/

const API_BASE = "https://script.google.com/macros/s/AKfycbwuh9rgICsZMNm_anrc4uPnKkM60MQjhdnP9AAopfPKaIWgDBlH4HWuARgLKuoZOmJs/exec";

const CAN_STATES = [
  "final",
  "pasteurizada_sin_etiquetar",
  "sin_pasteurizar_etiquetada",
  "sin_pasteurizar_sin_etiquetar"
];

/* =========================
   Helpers UI
   ========================= */
const Toast = Swal.mixin({
  toast: true, position: "top-end", showConfirmButton: false, timer: 1700, timerProgressBar: true,
  didOpen: t => { t.addEventListener("mouseenter", Swal.stopTimer); t.addEventListener("mouseleave", Swal.resumeTimer); }
});

function lockBtn(btn){
  if (!btn) return () => {};
  const prev = { disabled: btn.disabled, html: btn.innerHTML };
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${btn.textContent || "Procesando…"}`;
  return () => { btn.disabled = prev.disabled; btn.innerHTML = prev.html; };
}
async function withBtnLock(btn, fn){
  const unlock = lockBtn(btn);
  try{ return await fn(); } finally { unlock(); }
}

function confirmDelete(text="¿Eliminar este registro?"){
  return Swal.fire({ icon:"warning", title:"Confirmar", text, showCancelButton:true, confirmButtonText:"Eliminar", cancelButtonText:"Cancelar" });
}

/* =========================
   API helpers
   ========================= */
async function apiGet(entity, action="getAll", extra={}){
  const params = new URLSearchParams({ entity, action, ...extra });
  const res = await fetch(`${API_BASE}?${params.toString()}`);
  if (!res.ok) throw new Error(`GET ${entity}/${action} ${res.status}`);
  return res.json();
}
async function apiPost(entity, data, action){
  const url = action ? `${API_BASE}?entity=${entity}&action=${action}` : `${API_BASE}?entity=${entity}`;
  const res = await fetch(url, { method:"POST", body: JSON.stringify(data||{}) });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `POST ${entity}/${action||""} ${res.status}`);
  return json;
}
async function apiDelete(entity, id){ return apiPost(entity, { id }, "delete"); }

/* =========================
   Theme
   ========================= */
function initTheme(){
  const sw = document.getElementById("themeSwitch");
  const saved = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  if (sw){
    sw.checked = saved === "dark";
    sw.addEventListener("change", ()=>{
      const theme = sw.checked ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("theme", theme);
    });
  }
}

/* =========================
   Render helpers
   ========================= */
function renderIdShort(id){ return id ? id.slice(0,8) : ""; }
function renderColorSquare(color){ return color ? `<span class="color-box" style="background:${color}"></span>` : ""; }
function renderDateLocal(s){
  if (!s) return "";
  const d = new Date(s);
  if (!isNaN(d)) return d.toLocaleString();
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  return m ? `${m[1]} ${m[2]}:${m[3]}` : s;
}
const nowInputDateTime = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}T${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};
function fromDatetimeLocalValue(v){ if(!v) return null; return v.replace("T"," ")+":00"; }

// Trunca ids tipo UUID en la UI, NO en la base
function truncateIdsInDesc(txt){
  if (!txt) return "";
  let s = String(txt);
  // Truncar patrones clave=uuid
  s = s.replace(/\b(labelId|styleId|brandId)=([0-9a-f]{8})[0-9a-f\-]*/gi, (_,k,p)=>`${k}=${p}`);
  // Truncar lista de usados:id:qty
  s = s.replace(/usados:([0-9a-f\-:,]+)/gi, m => {
    const list = m.split(":")[1] || "";
    const mapped = list.split(",").map(p=>{
      const [id,q] = p.split(":");
      return `${(id||"").slice(0,8)}:${q||""}`;
    }).join(",");
    return `usados:${mapped}`;
  });
  return s;
}

/* =========================
   INDEX
   ========================= */
async function renderIndex(){
  try{
    const [styles, cans, emptycans, labels] = await Promise.all([
      apiGet("styles"), apiGet("cans"), apiGet("emptycans"), apiGet("labels")
    ]);
    const sumByStyle = new Map(styles.map(s=>[String(s.id),0]));
    for(const c of cans){ sumByStyle.set(String(c.styleId),(sumByStyle.get(String(c.styleId))||0)+Number(c.qty||0)); }

    const names=[], qtys=[];
    for(const s of styles){ const tot=sumByStyle.get(String(s.id))||0; if(s.showAlways || tot>0){ names.push(`${s.brandName}-${s.name}`); qtys.push(tot);} }

    const cardC=document.getElementById("idx_total_cans");
    const cardE=document.getElementById("idx_total_emptycans");
    const cardL=document.getElementById("idx_total_labels");
    if(cardC) cardC.textContent = cans.reduce((a,x)=>a+Number(x.qty||0),0);
    if(cardE) cardE.textContent = emptycans.reduce((a,x)=>a+Number(x.qty||0),0);
    if(cardL) cardL.textContent = labels.reduce((a,x)=>a+Number(x.qty||0),0);

    if (window.Chart){
      const ctx=document.getElementById("idx_chart_styles");
      if(ctx) new Chart(ctx,{ type:"bar", data:{ labels:names, datasets:[{label:"Stock de latas por estilo", data:qtys}] }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }});
      const ctx2=document.getElementById("idx_chart_labels");
      if(ctx2){
        const labelTotals=new Map(styles.map(s=>[String(s.id),0]));
        for(const lbl of labels){ if(!lbl.isCustom) labelTotals.set(String(lbl.styleId),(labelTotals.get(String(lbl.styleId))||0)+Number(lbl.qty||0)); }
        const n2=[],q2=[]; for(const s of styles){ const t=labelTotals.get(String(s.id))||0; if(s.showAlways||t>0){ n2.push(`${s.brandName}-${s.name}`); q2.push(t);} }
        new Chart(ctx2,{ type:"bar", data:{ labels:n2, datasets:[{label:"Etiquetas disponibles", data:q2}] }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }});
      }
    }
  }catch(e){ console.error(e); }
}

/* =========================
   MOVIMIENTOS
   ========================= */
function renderMovementsTable(list){
  const tbody=document.querySelector("#movementsTable tbody"); if(!tbody) return; tbody.innerHTML="";
  for(const row of list){
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td>${renderIdShort(row.id)}</td>
      <td>${renderDateLocal(row.dateTime)}</td>
      <td>${row.entity||""}</td>
      <td>${row.type||""}</td>
      <td>${row.qty ?? 0}</td>
      <td>${truncateIdsInDesc(row.description || "")}</td>
      <td>${renderDateLocal(row.lastModified)}</td>`;
    tbody.appendChild(tr);
  }
}
async function bootMovements(){
  try{ const rows = await apiGet("movements"); renderMovementsTable(rows); }catch(e){ console.error(e); }
}

/* =========================
   PRODUCCIÓN + LATAS VACÍAS
   ========================= */
async function loadProductionData(){
  const [styles, cans] = await Promise.all([apiGet("styles"), apiGet("cans")]);
  const byStyle=new Map();
  for(const s of styles) byStyle.set(String(s.id), { style:s, totals:{final:0,pasteurizada_sin_etiquetar:0,sin_pasteurizar_etiquetada:0,sin_pasteurizar_sin_etiquetar:0} });
  for(const c of cans){ if(!byStyle.has(String(c.styleId))) continue; const acc=byStyle.get(String(c.styleId)); const st=String(c.state||""); const q=Number(c.qty||0); if(acc.totals[st]!=null) acc.totals[st]+=q; }
  renderProductionTable(Array.from(byStyle.values()));
}
function renderProductionTable(rows){
  const tb=document.querySelector("#prod_table tbody"); if(!tb) return; tb.innerHTML="";
  for(const r of rows){
    const { style, totals } = r;
    const tr=document.createElement("tr");
    tr.innerHTML = `
      <td>${style.brandName || ""}</td>
      <td>${style.name || ""}</td>
      <td class="text-end">${totals.final}</td>
      <td class="text-end">${totals.pasteurizada_sin_etiquetar}</td>
      <td class="text-end">${totals.sin_pasteurizar_etiquetada}</td>
      <td class="text-end">${totals.sin_pasteurizar_sin_etiquetar}</td>
      <td>—</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-primary me-1" onclick="openRegisterProduction(this,'${style.id}')">Registrar</button>
        <button class="btn btn-sm btn-outline-secondary" onclick="openTransition(this,'${style.id}')">Cambiar estado</button>
      </td>`;
    tb.appendChild(tr);
  }
}
async function openRegisterProduction(btn, styleId){
  await withBtnLock(btn, async ()=>{
    try{
      const [styles, labels] = await Promise.all([apiGet("styles"), apiGet("labels")]);
      const style = styles.find(s=>String(s.id)===String(styleId)) || styles[0];
      const styleOpts = styles.map(s=>`<option value="${s.id}" ${String(s.id)===String(styleId)?"selected":""}>${s.brandName} - ${s.name}</option>`).join("");
      const labelOptsForStyle = labels.filter(l=>!l.isCustom && String(l.styleId)===String(style.id)).map(l=>`<option value="${l.id}">${l.styleName || s.name}</option>`).join("");
      const labelCustomOpts = labels.filter(l=>!!l.isCustom).map(l=>`<option value="${l.id}">(custom) ${l.name}</option>`).join("");

      const html = `
        <div class="mb-2"><label class="form-label fw-semibold">Estilo</label><select id="rp_style" class="form-select">${styleOpts}</select></div>
        <div class="row g-2">
          <div class="col-sm-4"><label class="form-label fw-semibold">Cantidad (latas)</label><input id="rp_qty" type="number" class="form-control" value="24" min="1"></div>
          <div class="col-sm-4"><label class="form-label fw-semibold">Fecha/hora</label><input id="rp_dt" type="datetime-local" class="form-control" value="${nowInputDateTime()}"></div>
        </div>
        <div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="rp_labeled"><label class="form-check-label" for="rp_labeled">Etiquetada</label></div>
        <div class="mb-2 d-none" id="rp_label_wrap">
          <label class="form-label fw-semibold">Etiqueta a consumir</label>
          <select id="rp_label" class="form-select">
            <option value="">(usar etiquetas por estilo)</option>
            ${labelOptsForStyle}
            ${labelCustomOpts ? `<optgroup label="Personalizadas">${labelCustomOpts}</optgroup>` : ""}
          </select>
          <div class="form-text">Se descuenta por FIFO del stock disponible.</div>
        </div>
        <div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="rp_pasteurized"><label class="form-check-label" for="rp_pasteurized">Pasteurizada</label></div>`;

      const result = await Swal.fire({
        title:"Registrar producción", html, focusConfirm:false, showCancelButton:true,
        didOpen:()=>{ const cb=document.getElementById("rp_labeled"); const wrap=document.getElementById("rp_label_wrap"); cb.addEventListener("change",()=>wrap.classList.toggle("d-none",!cb.checked)); },
        preConfirm:()=>({ styleId:document.getElementById("rp_style").value, qty:Math.max(1,Number(document.getElementById("rp_qty").value||0)), dateTime:fromDatetimeLocalValue(document.getElementById("rp_dt").value), labeled:document.getElementById("rp_labeled").checked, pasteurized:document.getElementById("rp_pasteurized").checked, labelId:document.getElementById("rp_label").value })
      });
      if(!result.isConfirmed) return;
      await apiPost("production", result.value, "produce");
      Toast.fire({icon:"success", title:"Producción registrada"});
      await loadProductionData();
    }catch(err){ console.error(err); Swal.fire("Error", err.message || "No se pudo registrar la producción", "error"); }
  });
}
async function openTransition(btn, styleId){
  await withBtnLock(btn, async ()=>{
    try{
      const [styles, labels] = await Promise.all([apiGet("styles"), apiGet("labels")]);
      const style = styles.find(s=>String(s.id)===String(styleId)) || styles[0];
      const labelOptsForStyle = labels.filter(l=>!l.isCustom && String(l.styleId)===String(style.id)).map(l=>`<option value="${l.id}">${l.styleName || style.name}</option>`).join("");
      const labelCustomOpts = labels.filter(l=>!!l.isCustom).map(l=>`<option value="${l.id}">(custom) ${l.name}</option>`).join("");

      const html = `
        <div class="mb-2"><b>${style.brandName} - ${style.name}</b></div>
        <div class="row g-2">
          <div class="col-sm-4"><label class="form-label fw-semibold">Cantidad</label><input id="ts_qty" type="number" class="form-control" value="12" min="1"></div>
          <div class="col-sm-4"><label class="form-label fw-semibold">Fecha/hora</label><input id="ts_dt" type="datetime-local" class="form-control" value="${nowInputDateTime()}"></div>
        </div>
        <div class="mb-2"><label class="form-label fw-semibold">Pasar a estado</label>
          <select id="ts_to" class="form-select">
            <option value="final">Final (lista)</option>
            <option value="pasteurizada_sin_etiquetar">Pasteurizada sin etiquetar</option>
            <option value="sin_pasteurizar_etiquetada">Sin pasteurizar y etiquetada</option>
            <option value="sin_pasteurizar_sin_etiquetar">Sin pasteurizar y sin etiquetar</option>
          </select></div>
        <div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="ts_consume_labels"><label class="form-check-label" for="ts_consume_labels">Consumir etiquetas si el destino es etiquetado</label></div>
        <div class="mb-2 d-none" id="ts_label_wrap"><label class="form-label fw-semibold">Etiqueta a consumir</label>
          <select id="ts_label" class="form-select">
            <option value="">(usar etiquetas por estilo)</option>
            ${labelOptsForStyle}
            ${labelCustomOpts ? `<optgroup label="Personalizadas">${labelCustomOpts}</optgroup>` : ""}
          </select></div>`;

      const result = await Swal.fire({
        title:"Cambiar estado", html, focusConfirm:false, showCancelButton:true,
        didOpen:()=>{ const cb=document.getElementById("ts_consume_labels"); const wrap=document.getElementById("ts_label_wrap"); const selTo=document.getElementById("ts_to");
          function toggle(){ const to=selTo.value; const needs=/etiquetad/i.test(to); wrap.classList.toggle("d-none", !needs || !cb.checked); }
          cb.addEventListener("change",toggle); selTo.addEventListener("change",toggle); toggle(); },
        preConfirm:()=>({ qty:Math.max(1,Number(document.getElementById("ts_qty").value||0)), dateTime:fromDatetimeLocalValue(document.getElementById("ts_dt").value), toState:document.getElementById("ts_to").value, consumeLabels:document.getElementById("ts_consume_labels").checked, labelId:document.getElementById("ts_label").value })
      });
      if(!result.isConfirmed) return;
      const p=result.value;
      await apiPost("cans", { styleId, fromState:"", toState:p.toState, qty:p.qty, dateTime:p.dateTime, consumeLabels:p.consumeLabels, labelId:p.labelId }, "transition_state");
      Toast.fire({icon:"success", title:"Estado actualizado"});
      await loadProductionData();
    }catch(err){ console.error(err); Swal.fire("Error", err.message || "No se pudo cambiar el estado", "error"); }
  });
}

// NUEVO: Ingreso manual de latas vacías
async function openAddEmptyCans(btn){
  await withBtnLock(btn, async ()=>{
    const html = `
      <div class="row g-2">
        <div class="col-sm-4"><label class="form-label fw-semibold">Cantidad</label><input id="ec_qty" type="number" class="form-control" value="24" min="1"></div>
        <div class="col-sm-4"><label class="form-label fw-semibold">Fecha/hora</label><input id="ec_dt" type="datetime-local" class="form-control" value="${nowInputDateTime()}"></div>
      </div>
      <div class="row g-2 mt-1">
        <div class="col-sm-6"><label class="form-label fw-semibold">Proveedor (opcional)</label><input id="ec_provider" class="form-control"></div>
        <div class="col-sm-6"><label class="form-label fw-semibold">Lote (opcional)</label><input id="ec_lot" class="form-control"></div>
      </div>`;
    const result = await Swal.fire({ title:"Ingresar latas vacías", html, showCancelButton:true, focusConfirm:false,
      preConfirm:()=>({ qty:Math.max(1,Number(document.getElementById("ec_qty").value||0)), dateTime:fromDatetimeLocalValue(document.getElementById("ec_dt").value), provider:document.getElementById("ec_provider").value||"", lot:document.getElementById("ec_lot").value||"" }) });
    if(!result.isConfirmed) return;
    await apiPost("emptycans", result.value, "add");
    Toast.fire({icon:"success", title:"Ingreso registrado"});
    await loadProductionData(); // refresca totales visibles
  });
}

async function bootProduction(){
  await loadProductionData();
  document.getElementById("btnNewProduction")?.addEventListener("click", (e)=> openRegisterProduction(e.currentTarget));
  document.getElementById("btnAddEmptyCans")?.addEventListener("click", (e)=> openAddEmptyCans(e.currentTarget));
}

/* =========================
   CONFIG: Brands, Containers, Styles (con confirm y bloqueo en delete)
   ========================= */
function brandModalBody(data={}){
  return `
    <div class="mb-2"><label class="form-label fw-semibold">Nombre</label><input id="brandName" class="form-control" value="${data.name||""}"></div>
    <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
      <input id="brandColor" type="color" class="form-control form-control-color mx-auto" value="${data.color||"#000000"}">
    </div>`;
}
function containersModalBody(data={}){
  return `
    <div class="mb-2"><label class="form-label fw-semibold">Nombre</label><input id="containerName" class="form-control" value="${data.name||""}"></div>
    <div class="mb-2"><label class="form-label fw-semibold">Tamaño (L)</label><input id="containerSize" type="number" class="form-control" value="${data.sizeLiters||0}"></div>
    <div class="mb-2"><label class="form-label fw-semibold">Tipo</label>
      <select id="containerType" class="form-select"><option value="lata" selected>Lata</option></select>
    </div>
    <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
      <input id="containerColor" type="color" class="form-control form-control-color mx-auto" value="${data.color||"#000000"}">
    </div>`;
}
function styleModalBody(brands, data={}){
  const brandOpts = brands.map(b=>`<option value="${b.id}" ${String(b.id)===String(data.brandId)?"selected":""}>${b.name}</option>`).join("");
  return `
    <div class="mb-2"><label class="form-label fw-semibold">Marca</label><select id="styleBrandId" class="form-select">${brandOpts}</select></div>
    <div class="mb-2"><label class="form-label fw-semibold">Nombre del estilo</label><input id="styleName" class="form-control" value="${data.name||""}"></div>
    <div class="mb-2 text-center"><label class="form-label fw-semibold d-block">Color</label>
      <input id="styleColor" type="color" class="form-control form-control-color mx-auto" value="${data.color||"#000000"}">
    </div>
    <div class="form-check mt-2">
      <input class="form-check-input" type="checkbox" id="styleShow" ${data.showAlways?"checked":""}>
      <label class="form-check-label" for="styleShow">Mostrar siempre en gráficos</label>
    </div>`;
}

async function loadConfig(){
  const [brands, containers, styles] = await Promise.all([apiGet("brands"), apiGet("containers"), apiGet("styles")]);
  // Brands
  const tbB=document.querySelector("#brandsTable tbody"); if (tbB){
    tbB.innerHTML="";
    for(const b of brands){
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${renderIdShort(b.id)}</td><td>${b.name}</td><td>${renderColorSquare(b.color)}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-secondary me-1" data-id="${b.id}" data-entity="brands">Editar</button>
        <button class="btn btn-sm btn-danger" data-id="${b.id}" data-entity="brands">Eliminar</button>
      </td>`;
      tbB.appendChild(tr);
    }
    tbB.addEventListener("click", async (e)=>{
      const btn = e.target.closest("button"); if(!btn) return;
      const id = btn.dataset.id, ent = btn.dataset.entity;
      if (btn.classList.contains("btn-danger")){
        await withBtnLock(btn, async ()=>{
          // Validación: bloquear si hay etiquetas vinculadas a esta marca
          const labels = await apiGet("labels");
          const has = labels.some(l => String(l.brandId)===String(id));
          if (has){ Swal.fire("No permitido","No se puede eliminar la marca: tiene etiquetas asociadas.","info"); return; }
          const ok = await confirmDelete("¿Eliminar la marca seleccionada?"); if(!ok.isConfirmed) return;
          await apiDelete(ent, id); Toast.fire({icon:"success", title:"Eliminado"}); await loadConfig();
        });
      } else {
        await withBtnLock(btn, async ()=>{
          const b = brands.find(x=>String(x.id)===String(id));
          const { value, isConfirmed } = await Swal.fire({ title:"Editar marca", html:brandModalBody(b), showCancelButton:true, focusConfirm:false,
            preConfirm:()=>({ name:document.getElementById("brandName").value, color:document.getElementById("brandColor").value }) });
          if (!isConfirmed) return;
          await apiPost("brands", { id, ...value }, "update"); Toast.fire({icon:"success", title:"Guardado"}); await loadConfig();
        });
      }
    });
    document.getElementById("btnAddBrand")?.addEventListener("click", (e)=> withBtnLock(e.currentTarget, async ()=>{
      const { value, isConfirmed } = await Swal.fire({ title:"Agregar marca", html:brandModalBody({}), showCancelButton:true, focusConfirm:false,
        preConfirm:()=>({ name:document.getElementById("brandName").value, color:document.getElementById("brandColor").value }) });
      if (!isConfirmed) return;
      await apiPost("brands", value, "create"); Toast.fire({icon:"success", title:"Agregado"}); await loadConfig();
    }));
  }
  // Containers
  const tbC=document.querySelector("#containersTable tbody"); if (tbC){
    tbC.innerHTML="";
    for(const c of containers){
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${renderIdShort(c.id)}</td><td>${c.name}</td><td>${c.sizeLiters||""}</td><td>${c.type||""}</td><td>${renderColorSquare(c.color)}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-secondary me-1" data-id="${c.id}" data-entity="containers">Editar</button>
        <button class="btn btn-sm btn-danger" data-id="${c.id}" data-entity="containers">Eliminar</button>
      </td>`;
      tbC.appendChild(tr);
    }
    tbC.addEventListener("click", async (e)=>{
      const btn=e.target.closest("button"); if(!btn) return;
      const id=btn.dataset.id, ent=btn.dataset.entity;
      if (btn.classList.contains("btn-danger")){
        await withBtnLock(btn, async ()=>{
          const ok = await confirmDelete("¿Eliminar el envase seleccionado?"); if(!ok.isConfirmed) return;
          await apiDelete(ent, id); Toast.fire({icon:"success", title:"Eliminado"}); await loadConfig();
        });
      } else {
        await withBtnLock(btn, async ()=>{
          const c=containers.find(x=>String(x.id)===String(id));
          const { value, isConfirmed } = await Swal.fire({ title:"Editar envase", html:containersModalBody(c), showCancelButton:true, focusConfirm:false,
            preConfirm:()=>({ name:document.getElementById("containerName").value, sizeLiters:Number(document.getElementById("containerSize").value||0), type:document.getElementById("containerType").value, color:document.getElementById("containerColor").value }) });
          if (!isConfirmed) return;
          await apiPost("containers", { id, ...value }, "update"); Toast.fire({icon:"success", title:"Guardado"}); await loadConfig();
        });
      }
    });
    document.getElementById("btnAddContainer")?.addEventListener("click", (e)=> withBtnLock(e.currentTarget, async ()=>{
      const { value, isConfirmed } = await Swal.fire({ title:"Agregar envase", html:containersModalBody({}), showCancelButton:true, focusConfirm:false,
        preConfirm:()=>({ name:document.getElementById("containerName").value, sizeLiters:Number(document.getElementById("containerSize").value||0), type:document.getElementById("containerType").value, color:document.getElementById("containerColor").value }) });
      if (!isConfirmed) return;
      await apiPost("containers", value, "create"); Toast.fire({icon:"success", title:"Agregado"}); await loadConfig();
    }));
  }
  // Styles
  const tbS=document.querySelector("#stylesTable tbody"); if (tbS){
    tbS.innerHTML="";
    const brandMap=new Map(brands.map(b=>[String(b.id), b]));
    for(const s of styles){
      const tr=document.createElement("tr");
      tr.innerHTML=`<td>${renderIdShort(s.id)}</td><td>${brandMap.get(String(s.brandId))?.name||""}</td><td>${s.name}</td><td>${renderColorSquare(s.color)}</td><td>${s.showAlways?"Sí":"No"}</td>
      <td class="text-nowrap">
        <button class="btn btn-sm btn-outline-secondary me-1" data-id="${s.id}" data-entity="styles">Editar</button>
        <button class="btn btn-sm btn-danger" data-id="${s.id}" data-entity="styles">Eliminar</button>
      </td>`;
      tbS.appendChild(tr);
    }
    tbS.addEventListener("click", async (e)=>{
      const btn=e.target.closest("button"); if(!btn) return;
      const id=btn.dataset.id, ent=btn.dataset.entity;
      if (btn.classList.contains("btn-danger")){
        await withBtnLock(btn, async ()=>{
          const ok = await confirmDelete("¿Eliminar el estilo seleccionado?"); if(!ok.isConfirmed) return;
          await apiDelete(ent, id); Toast.fire({icon:"success", title:"Eliminado"}); await loadConfig();
        });
      } else {
        await withBtnLock(btn, async ()=>{
          const s=styles.find(x=>String(x.id)===String(id));
          const { value, isConfirmed } = await Swal.fire({ title:"Editar estilo", html:styleModalBody(brands, s), showCancelButton:true, focusConfirm:false,
            preConfirm:()=>({ brandId:document.getElementById("styleBrandId").value, name:document.getElementById("styleName").value, color:document.getElementById("styleColor").value, showAlways:document.getElementById("styleShow").checked }) });
          if (!isConfirmed) return;
          await apiPost("styles", { id, ...value }, "update"); Toast.fire({icon:"success", title:"Guardado"}); await loadConfig();
        });
      }
    });
    document.getElementById("btnAddStyle")?.addEventListener("click", (e)=> withBtnLock(e.currentTarget, async ()=>{
      const { value, isConfirmed } = await Swal.fire({ title:"Agregar estilo", html:styleModalBody(brands, {}), showCancelButton:true, focusConfirm:false,
        preConfirm:()=>({ brandId:document.getElementById("styleBrandId").value, name:document.getElementById("styleName").value, color:document.getElementById("styleColor").value, showAlways:document.getElementById("styleShow").checked }) });
      if (!isConfirmed) return;
      await apiPost("styles", value, "create"); Toast.fire({icon:"success", title:"Agregado"}); await loadConfig();
    }));
  }
}
async function bootConfig(){ await loadConfig(); /* botón reset eliminado del frontend */ }

/* =========================
   LABELS (con validación y confirm delete)
   ========================= */
function labelModalBody(brands, styles, data={}){
  const brandOpts=brands.map(b=>`<option value="${b.id}" ${String(b.id)===String(data.brandId)?"selected":""}>${b.name}</option>`).join("");
  const styleOpts=styles.map(s=>`<option value="${s.id}" ${String(s.id)===String(data.styleId)?"selected":""}>${s.name}</option>`).join("");
  return `
    <div class="form-check mt-1 mb-2">
      <input class="form-check-input" type="checkbox" id="lblIsCustom" ${data.isCustom?"checked":""}>
      <label class="form-check-label fw-semibold" for="lblIsCustom">Es personalizada</label>
    </div>
    <div class="row g-2">
      <div class="col-sm-6"><label class="form-label fw-semibold">Marca</label><select id="lblBrandId" class="form-select">${brandOpts}</select></div>
      <div class="col-sm-6"><label class="form-label fw-semibold">Estilo</label><select id="lblStyleId" class="form-select">${styleOpts}</select></div>
    </div>
    <div class="row g-2 mt-1">
      <div class="col-sm-6"><label class="form-label fw-semibold">Nombre (custom opcional)</label><input id="lblName" class="form-control" value="${data.name||""}" placeholder="(si es personalizada)"></div>
      <div class="col-sm-3"><label class="form-label fw-semibold">Cantidad</label><input id="lblQty" type="number" class="form-control" value="${data.qty||0}" min="0"></div>
      <div class="col-sm-3"><label class="form-label fw-semibold">Fecha/hora</label><input id="lblDt" type="datetime-local" class="form-control" value="${nowInputDateTime()}"></div>
    </div>
    <div class="row g-2 mt-1">
      <div class="col-sm-6"><label class="form-label fw-semibold">Proveedor</label><input id="lblProvider" class="form-control" value="${data.provider||""}"></div>
      <div class="col-sm-6"><label class="form-label fw-semibold">Lote</label><input id="lblLot" class="form-control" value="${data.lot||""}"></div>
    </div>`;
}

function validateLabelPayload(isCustom){
  const brandId=document.getElementById("lblBrandId").value;
  const styleId=document.getElementById("lblStyleId").value;
  if (!isCustom){
    if (!brandId || !styleId){
      Swal.showValidationMessage("Debe seleccionar Marca y Estilo (o marcar 'Es personalizada').");
      return null;
    }
  }
  const qty=Number(document.getElementById("lblQty").value||0);
  if (qty < 0){
    Swal.showValidationMessage("Cantidad inválida.");
    return null;
  }
  return {
    brandId, styleId,
    name: document.getElementById("lblName").value,
    qty, dateTime: fromDatetimeLocalValue(document.getElementById("lblDt").value),
    provider: document.getElementById("lblProvider").value,
    lot: document.getElementById("lblLot").value,
    isCustom
  };
}

async function loadLabelsPage(){
  const [brands, styles, labels] = await Promise.all([apiGet("brands"), apiGet("styles"), apiGet("labels")]);
  const brandMap=new Map(brands.map(b=>[String(b.id), b])); const styleMap=new Map(styles.map(s=>[String(s.id), s]));
  const tbody=document.querySelector("#labelsTable tbody"); if(!tbody) return;

  document.getElementById("lbl_total_units").textContent = labels.reduce((a,x)=>a+Number(x.qty||0),0);
  document.getElementById("lbl_total_items").textContent = labels.length;
  document.getElementById("lbl_last_mod").textContent = labels.reduce((max,x)=> max && new Date(max) > new Date(x.lastModified) ? max : x.lastModified, null) || "—";

  tbody.innerHTML="";
  for(const l of labels){
    const tr=document.createElement("tr");
    tr.innerHTML = `<td>${renderIdShort(l.id)}</td><td>${brandMap.get(String(l.brandId))?.name||""}</td><td>${l.isCustom?(l.name||"custom"):(styleMap.get(String(l.styleId))?.name||"")}</td><td>${l.qty||0}</td><td>${l.lot||""}</td><td>${l.provider||""}</td><td>${renderDateLocal(l.dateTime)}</td><td>${renderDateLocal(l.lastModified)}</td>
      <td class="text-nowrap"><button class="btn btn-sm btn-outline-secondary me-1" data-id="${l.id}">Editar</button><button class="btn btn-sm btn-danger" data-id="${l.id}">Eliminar</button></td>`;
    tbody.appendChild(tr);
  }

  document.getElementById("btnAddLabel")?.addEventListener("click", (e)=> withBtnLock(e.currentTarget, async ()=>{
    const { value, isConfirmed } = await Swal.fire({
      title:"Agregar etiqueta",
      html:labelModalBody(brands, styles, {}),
      showCancelButton:true, focusConfirm:false,
      didOpen:()=>{
        const cb=document.getElementById("lblIsCustom");
        const styleSel=document.getElementById("lblStyleId");
        function toggle(){ styleSel.disabled = cb.checked; }
        cb.addEventListener("change", toggle); toggle();
      },
      preConfirm:()=>{
        const isCustom=document.getElementById("lblIsCustom").checked;
        return validateLabelPayload(isCustom);
      }
    });
    if (!isConfirmed || !value) return;
    await apiPost("labels", value, "create"); Toast.fire({icon:"success", title:"Agregado"}); await loadLabelsPage();
  }));

  tbody.addEventListener("click", async (e)=>{
    const btn=e.target.closest("button"); if(!btn) return;
    const id=btn.dataset.id;
    if (btn.classList.contains("btn-danger")){
      await withBtnLock(btn, async ()=>{
        const ok = await confirmDelete("¿Eliminar la etiqueta seleccionada?"); if(!ok.isConfirmed) return;
        await apiDelete("labels", id); // backend guardará un movimiento 'delete'
        Toast.fire({icon:"success", title:"Eliminada"}); await loadLabelsPage();
      });
    } else {
      await withBtnLock(btn, async ()=>{
        // edición
        const labels = await apiGet("labels"); // refrescar
        const l = labels.find(x=>String(x.id)===String(id));
        const { value, isConfirmed } = await Swal.fire({
          title:"Editar etiqueta",
          html:labelModalBody(brands, styles, l),
          showCancelButton:true, focusConfirm:false,
          didOpen:()=>{
            const cb=document.getElementById("lblIsCustom");
            const styleSel=document.getElementById("lblStyleId");
            function toggle(){ styleSel.disabled = cb.checked; }
            cb.addEventListener("change", toggle); toggle();
          },
          preConfirm:()=>{
            const isCustom=document.getElementById("lblIsCustom").checked;
            return validateLabelPayload(isCustom);
          }
        });
        if (!isConfirmed || !value) return;
        await apiPost("labels", { id, ...value }, "update"); Toast.fire({icon:"success", title:"Guardado"}); await loadLabelsPage();
      });
    }
  });
}

/* =========================
   Boot
   ========================= */
async function boot(){
  initTheme();
  if (document.getElementById("idx_chart_styles")) await renderIndex();
  if (document.getElementById("movementsTable")) await bootMovements();
  if (document.getElementById("prod_table")) await bootProduction();
  if (document.getElementById("brandsTable")) await bootConfig();
  if (document.getElementById("labelsTable")) await loadLabelsPage();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
