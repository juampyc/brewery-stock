/* v3.2 - Patch only files: app.js
 - Reglas de borrado más estrictas
 - Producción: quitar botón de latas, agregar botón Finalizar y endpoint cans/finalize
*/
const API_BASE = "https://script.google.com/macros/s/AKfycbw6rNr8nxQgLxnAE8fQPTbw1Qhc04-9iXog-xWBm8ufcPPrX1Y8iEuyIekLrv6le0Bm/exec";
const TZ_AR = "America/Argentina/Buenos_Aires";

const Toast=Swal.mixin({toast:true,position:"top-end",showConfirmButton:false,timer:1700,timerProgressBar:true,didOpen:t=>{t.addEventListener("mouseenter",Swal.stopTimer);t.addEventListener("mouseleave",Swal.resumeTimer);}});
function lockBtn(btn){if(!btn)return()=>{};const prev={d:btn.disabled,h:btn.innerHTML};btn.disabled=true;btn.innerHTML=`<span class="spinner-border spinner-border-sm"></span> ${btn.textContent||"Procesando…"}`;return()=>{btn.disabled=prev.d;btn.innerHTML=prev.h};}
async function withBtnLock(btn,fn){const u=lockBtn(btn);try{return await fn();}finally{u();}}
function confirmDelete(text="¿Eliminar este registro?"){return Swal.fire({icon:"warning",title:"Confirmar",text,showCancelButton:true,confirmButtonText:"Eliminar",cancelButtonText:"Cancelar"});}

async function apiGet(entity,action="getAll",extra={}){const p=new URLSearchParams({entity,action,...extra});const r=await fetch(`${API_BASE}?${p.toString()}`);if(!r.ok)throw new Error(`GET ${entity}/${action} ${r.status}`);return r.json();}
async function apiPost(entity,data,action){const url=action?`${API_BASE}?entity=${entity}&action=${action}`:`${API_BASE}?entity=${entity}`;const r=await fetch(url,{method:"POST",body:JSON.stringify(data||{})});const j=await r.json();if(!r.ok||j.error)throw new Error(j.error||`POST ${entity}/${action||""} ${r.status}`);return j;}
async function apiDelete(entity,id){return apiPost(entity,{id},"delete");}

function initTheme(){const sw=document.getElementById("themeSwitch");const saved=localStorage.getItem("theme")||"light";document.documentElement.setAttribute("data-theme",saved);if(sw){sw.checked=saved==="dark";sw.addEventListener("change",()=>{const t=sw.checked?"dark":"light";document.documentElement.setAttribute("data-theme",t);localStorage.setItem("theme",t);});}}
function renderIdShort(id){return id?id.slice(0,8):""}
function renderColorSquare(c){return c?`<span class="color-box" style="background:${c}"></span>`:""}
function formatAR(iso){if(!iso)return"";try{const d=new Date(iso);const s=d.toLocaleString('sv-SE',{timeZone:TZ_AR,hour12:false});return s.slice(0,16);}catch(e){return iso;}}
function renderDateLocal(s){return formatAR(s);}
const nowInputDateTime=()=>{const d=new Date();const s=d.toLocaleString('sv-SE',{timeZone:TZ_AR,hour12:false});return s.slice(0,16).replace(" ","T");}
function fromDatetimeLocalValue(v){if(!v)return null;return v.replace("T"," ")+":00";}
function truncateIdsInDesc(txt){if(!txt)return"";let s=String(txt);s=s.replace(/\b(labelId|styleId|brandId|emptyId)=([0-9a-f]{8})[0-9a-f\-]*/gi,(_,k,p)=>`${k}=${p}`);s=s.replace(/usados:([0-9a-f\-:,]+)/gi,m=>{const list=m.split(":")[1]||"";const mapped=list.split(",").map(p=>{const[a,q]=p.split(":");return `${(a||"").slice(0,8)}:${q||""}`}).join(",");return`usados:${mapped}`});return s;}

/* ===== Movements ===== */
function renderMovementsTable(list){const tb=document.querySelector("#movementsTable tbody");if(!tb)return;tb.innerHTML="";for(const row of list){const tr=document.createElement("tr");tr.innerHTML=`<td>${renderIdShort(row.id)}</td><td>${renderDateLocal(row.dateTime)}</td><td>${row.entity||""}</td><td>${row.type||""}</td><td>${row.qty??0}</td><td>${truncateIdsInDesc(row.description||"")}</td><td>${renderDateLocal(row.lastModified)}</td>`;tb.appendChild(tr);}}
async function bootMovements(){try{const rows=await apiGet("movements");renderMovementsTable(rows);}catch(e){console.error(e);}}

/* ===== Producción ===== */
async function loadProductionData(){const[styles,cans]=await Promise.all([apiGet("styles"),apiGet("cans")]);const byStyle=new Map();for(const s of styles)byStyle.set(String(s.id),{style:s,totals:{final:0,pasteurizada_sin_etiquetar:0,sin_pasteurizar_etiquetada:0,sin_pasteurizar_sin_etiquetar:0}});for(const c of cans){if(!byStyle.has(String(c.styleId)))continue;const acc=byStyle.get(String(c.styleId));const st=String(c.state||"");const q=Number(c.qty||0);if(acc.totals[st]!=null)acc.totals[st]+=q;}renderProductionTable(Array.from(byStyle.values()));}
function renderProductionTable(rows){const tb=document.querySelector("#prod_table tbody");if(!tb)return;tb.innerHTML="";for(const r of rows){const{style,totals}=r;const tr=document.createElement("tr");tr.innerHTML=`<td>${style.brandName||""}</td><td>${style.name||""}</td><td class="text-end">${totals.final}</td><td class="text-end">${totals.pasteurizada_sin_etiquetar}</td><td class="text-end">${totals.sin_pasteurizar_etiquetada}</td><td class="text-end">${totals.sin_pasteurizar_sin_etiquetar}</td><td class="text-nowrap"><button class="btn btn-sm btn-primary me-1" onclick="openRegisterProduction(this,'${style.id}')">Registrar</button><button class="btn btn-sm btn-outline-secondary" onclick="openTransition(this,'${style.id}')">Cambiar estado</button><button class="btn btn-sm btn-success ms-1" onclick="openFinalize(this,'${style.id}')">Finalizar</button></td>`;tb.appendChild(tr);}}
async function openRegisterProduction(btn,styleId){await withBtnLock(btn,async()=>{try{const[brands,styles,labels]=await Promise.all([apiGet("brands"),apiGet("styles"),apiGet("labels")]);const brandMap=new Map(brands.map(b=>[String(b.id),b.name]));const styleMap=new Map(styles.map(s=>[String(s.id),s.name]));const style=styles.find(s=>String(s.id)===String(styleId))||styles[0];const styleOpts=styles.map(s=>`<option value="${s.id}" ${String(s.id)===String(styleId)?"selected":""}>${s.brandName} - ${s.name}</option>`).join("");const optStyle=labels.filter(l=>!l.isCustom&&l.styleId).map(l=>({id:l.id,txt:`${brandMap.get(String(l.brandId))||""} - ${styleMap.get(String(l.styleId))||""} - stock ${l.qty||0}`}));const optCustom=labels.filter(l=>!!l.isCustom).map(l=>({id:l.id,txt:`${brandMap.get(String(l.brandId))||""} - (custom ${l.name||""}) - stock ${l.qty||0}`}));const optStyleHtml=optStyle.map(o=>`<option value="${o.id}">${o.txt}</option>`).join("");const optCustomHtml=optCustom.map(o=>`<option value="${o.id}">${o.txt}</option>`).join("");const html=`<div class="mb-2"><label class="form-label fw-semibold">Estilo</label><select id="rp_style" class="form-select">${styleOpts}</select></div><div class="row g-2"><div class="col-sm-4"><label class="form-label fw-semibold">Cantidad</label><input id="rp_qty" type="number" class="form-control" value="24" min="1"></div><div class="col-sm-4"><label class="form-label fw-semibold">Fecha/hora</label><input id="rp_dt" type="datetime-local" class="form-control" value="${nowInputDateTime()}"></div></div><div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="rp_labeled"><label class="form-check-label" for="rp_labeled">Etiquetada</label></div><div class="mb-2 d-none" id="rp_label_wrap"><label class="form-label fw-semibold">Etiqueta a consumir (opcional)</label><select id="rp_label" class="form-select"><option value="">(usar FIFO del estilo)</option><optgroup label="Del estilo">${optStyleHtml}</optgroup>${optCustomHtml?`<optgroup label="Personalizadas">${optCustomHtml}</optgroup>`:""}</select></div><div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="rp_pasteurized"><label class="form-check-label" for="rp_pasteurized">Pasteurizada</label></div>`;const res=await Swal.fire({title:"Registrar producción",html,showCancelButton:true,focusConfirm:false,didOpen:()=>{const cb=document.getElementById("rp_labeled");const w=document.getElementById("rp_label_wrap");cb.addEventListener("change",()=>w.classList.toggle("d-none",!cb.checked));},preConfirm:()=>({styleId:document.getElementById("rp_style").value,qty:Math.max(1,Number(document.getElementById("rp_qty").value||0)),dateTime:fromDatetimeLocalValue(document.getElementById("rp_dt").value),labeled:document.getElementById("rp_labeled").checked,pasteurized:document.getElementById("rp_pasteurized").checked,labelId:document.getElementById("rp_label").value})});if(!res.isConfirmed)return;await apiPost("production",res.value,"produce");Toast.fire({icon:"success",title:"Producción registrada"});await loadProductionData();}catch(err){console.error(err);Swal.fire("Error",err.message||"No se pudo registrar la producción","error");}});}
async function openTransition(btn,styleId){await withBtnLock(btn,async()=>{try{const[styles,labels]=await Promise.all([apiGet("styles"),apiGet("labels")]);const style=styles.find(s=>String(s.id)===String(styleId))||styles[0];const optStyle=labels.filter(l=>!l.isCustom&&String(l.styleId)===String(style.id)).map(l=>`<option value="${l.id}">${l.styleName||style.name} - stock ${l.qty||0}</option>`).join("");const optCustom=labels.filter(l=>!!l.isCustom).map(l=>`<option value="${l.id}">(custom) ${l.name} - stock ${l.qty||0}</option>`).join("");const html=`<div class="mb-2"><b>${style.brandName} - ${style.name}</b></div><div class="row g-2"><div class="col-sm-4"><label class="form-label fw-semibold">Cantidad</label><input id="ts_qty" type="number" class="form-control" value="12" min="1"></div><div class="col-sm-4"><label class="form-label fw-semibold">Fecha/hora</label><input id="ts_dt" type="datetime-local" class="form-control" value="${nowInputDateTime()}"></div></div><div class="mb-2"><label class="form-label fw-semibold">Pasar a estado</label><select id="ts_to" class="form-select"><option value="final">Final (lista)</option><option value="pasteurizada_sin_etiquetar">Pasteurizada sin etiquetar</option><option value="sin_pasteurizar_etiquetada">Sin pasteurizar y etiquetada</option><option value="sin_pasteurizar_sin_etiquetar">Sin pasteurizar y sin etiquetar</option></select></div><div class="form-check mt-2"><input class="form-check-input" type="checkbox" id="ts_consume_labels"><label class="form-check-label" for="ts_consume_labels">Consumir etiquetas si el destino es etiquetado</label></div><div class="mb-2 d-none" id="ts_label_wrap"><label class="form-label fw-semibold">Etiqueta a consumir</label><select id="ts_label" class="form-select"><option value="">(usar FIFO del estilo)</option>${optStyle}${optCustom?`<optgroup label="Personalizadas">${optCustom}</optgroup>`:""}</select></div>`;const res=await Swal.fire({title:"Cambiar estado",html,showCancelButton:true,focusConfirm:false,didOpen:()=>{const cb=document.getElementById("ts_consume_labels");const wrap=document.getElementById("ts_label_wrap");const sel=document.getElementById("ts_to");function t(){const needs=/etiquetad/i.test(sel.value);wrap.classList.toggle("d-none",!needs||!cb.checked);}cb.addEventListener("change",t);sel.addEventListener("change",t);t();},preConfirm:()=>({qty:Math.max(1,Number(document.getElementById("ts_qty").value||0)),dateTime:fromDatetimeLocalValue(document.getElementById("ts_dt").value),toState:document.getElementById("ts_to").value,consumeLabels:document.getElementById("ts_consume_labels").checked,labelId:document.getElementById("ts_label").value})});if(!res.isConfirmed)return;const p=res.value;await apiPost("cans",{styleId,fromState:"",toState:p.toState,qty:p.qty,dateTime:p.dateTime,consumeLabels:p.consumeLabels,labelId:p.labelId},"transition_state");Toast.fire({icon:"success",title:"Estado actualizado"});await loadProductionData();}catch(err){console.error(err);Swal.fire("Error",err.message||"No se pudo cambiar el estado","error");}});}
async function openFinalize(btn,styleId){
  await withBtnLock(btn, async ()=>{
    try{
      const [styles,labels]=await Promise.all([apiGet("styles"),apiGet("labels")]);
      const style=styles.find(s=>String(s.id)===String(styleId))||styles[0];
      const optStyle=labels.filter(l=>!l.isCustom&&String(l.styleId)===String(style.id)).map(l=>`<option value="${l.id}">${style.name} - stock ${l.qty||0}</option>`).join("");
      const optCustom=labels.filter(l=>!!l.isCustom).map(l=>`<option value="${l.id}">(custom) ${l.name} - stock ${l.qty||0}</option>`).join("");
      const html=`
        <div class="mb-2"><b>${style.brandName} - ${style.name}</b></div>
        <div class="row g-2">
          <div class="col-sm-4"><label class="form-label fw-semibold">De pasteurizada sin etiquetar</label><input id="fz_pse" type="number" class="form-control" value="0" min="0"></div>
          <div class="col-sm-4"><label class="form-label fw-semibold">De sin pasteurizar y etiquetada</label><input id="fz_spe" type="number" class="form-control" value="0" min="0"></div>
          <div class="col-sm-4"><label class="form-label fw-semibold">De sin pasteurizar y sin etiquetar</label><input id="fz_sps" type="number" class="form-control" value="0" min="0"></div>
        </div>
        <div class="row g-2 mt-1">
          <div class="col-sm-6"><label class="form-label fw-semibold">Fecha/hora</label><input id="fz_dt" type="datetime-local" class="form-control" value="${nowInputDateTime()}"></div>
        </div>
        <div class="form-check mt-2">
          <input class="form-check-input" type="checkbox" id="fz_consume"><label class="form-check-label" for="fz_consume">Consumir etiquetas para unidades no etiquetadas</label>
        </div>
        <div class="mb-2 d-none" id="fz_label_wrap">
          <label class="form-label fw-semibold">Etiqueta a consumir (opcional)</label>
          <select id="fz_label" class="form-select">
            <option value="">(usar FIFO del estilo)</option>
            <optgroup label="Del estilo">${optStyle}</optgroup>
            ${optCustom?`<optgroup label="Personalizadas">${optCustom}</optgroup>`:""}
          </select>
        </div>`;
      const res=await Swal.fire({
        title:"Finalizar producción",
        html,
        showCancelButton:true,
        focusConfirm:false,
        didOpen:()=>{
          const cb=document.getElementById("fz_consume");
          const wrap=document.getElementById("fz_label_wrap");
          cb.addEventListener("change",()=>wrap.classList.toggle("d-none",!cb.checked));
        },
        preConfirm:()=>{
          const pse=Math.max(0,Number(document.getElementById("fz_pse").value||0));
          const spe=Math.max(0,Number(document.getElementById("fz_spe").value||0));
          const sps=Math.max(0,Number(document.getElementById("fz_sps").value||0));
          if((pse+spe+sps)<=0){Swal.showValidationMessage("Indicá al menos una cantidad a finalizar."); return null;}
          return {
            styleId, dateTime:fromDatetimeLocalValue(document.getElementById("fz_dt").value),
            from_pasteurizada_sin_etiquetar:pse,
            from_sin_pasteurizar_etiquetada:spe,
            from_sin_pasteurizar_sin_etiquetar:sps,
            consumeLabels: document.getElementById("fz_consume").checked,
            labelId: document.getElementById("fz_label").value||""
          };
        }
      });
      if(!res.isConfirmed) return;
      await apiPost("cans", res.value, "finalize");
      Toast.fire({icon:"success",title:"Finalizado"});
      await loadProductionData();
    }catch(err){
      console.error(err);
      Swal.fire("Error", err.message||"No se pudo finalizar", "error");
    }
  });
}

async function bootProduction(){await loadProductionData();document.getElementById("btnNewProduction")?.addEventListener("click",e=>openRegisterProduction(e.currentTarget));}

/* ===== Simple boots for other pages present en tu proyecto ===== */
async function boot(){initTheme();if(document.getElementById("movementsTable"))await bootMovements();if(document.getElementById("prod_table"))await bootProduction();}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
