const API = "https://script.google.com/macros/s/AKfycbxUStfukZGj5m4uLpgTC8xzBcdaz_HxzHyd8zFX8rSXOQfx4sBg7rQC328_vptPziT_/exec";

function showStatus(msg, type='info'){
  const el=document.getElementById("status");
  el.textContent=msg;
  el.className="alert status show alert-"+(type==='ok'?'success':type==='error'?'danger':'info');
  if(type!=='info') setTimeout(()=>el.classList.remove("show"),2000);
}

// === Tema oscuro / claro ===
document.addEventListener("DOMContentLoaded",()=>{
  document.getElementById("btn-theme").addEventListener("click",()=>{
    const link=document.getElementById("theme-style");
    if(link.getAttribute("href").includes("dark.css")){
      link.setAttribute("href","./light.css");
      document.getElementById("btn-theme").textContent="Modo Oscuro";
    } else {
      link.setAttribute("href","./dark.css");
      document.getElementById("btn-theme").textContent="Modo Claro";
    }
  });
});

// === Producción ===
document.getElementById("form-produce").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const payload={
    action:"batch_produce",
    items:[{
      brand:document.getElementById("prod-brand").value,
      style:document.getElementById("prod-style").value,
      qty:Number(document.getElementById("prod-qty").value)
    }],
    state:document.getElementById("prod-state").value,
    consume:document.getElementById("consume-labels").checked,
    note:""
  };
  const r=await fetch(API,{method:"POST",body:JSON.stringify(payload)});
  const d=await r.json();
  showStatus(d.ok?"Producción ok":"Error producción",d.ok?"ok":"error");
  if(d.ok){
    const modalEl = document.getElementById("modalProduce");
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
  }
});

// === Ingresar etiquetas ===
document.getElementById("form-labels").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const payload={
    action:"labels_in",
    items:[{
      brand:document.getElementById("labels-brand").value,
      style:document.getElementById("labels-style").value,
      qty:Number(document.getElementById("labels-qty").value)
    }],
    note:""
  };
  const r=await fetch(API,{method:"POST",body:JSON.stringify(payload)});
  const d=await r.json();
  showStatus(d.ok?"Etiquetas ingresadas":"Error etiquetas",d.ok?"ok":"error");
  if(d.ok){
    const modalEl = document.getElementById("modalLabels");
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
  }
});

// === Latas vacías ===
document.getElementById("form-empty").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const btn = ev.submitter; // el botón que disparó el submit
  btn.disabled = true;
  btn.textContent = "Guardando...";

  const payload={
    action:"empty_in",
    qty:Number(document.getElementById("empty-qty").value),
    note:""
  };
  const r=await fetch(API,{method:"POST",body:JSON.stringify(payload)});
  const d=await r.json();

  showStatus(d.ok?"Latas vacías ingresadas":"Error latas vacías",d.ok?"ok":"error");

  if(d.ok){
    const modalEl = document.getElementById("modalEmpty");
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
  }

  // restaurar botón
  btn.disabled = false;
  btn.textContent = "Guardar";
});

// === Configuración estilos ===
document.getElementById("form-config").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const payload={
    action:"config_add_style",
    brand:document.getElementById("cfg-brand").value,
    style:document.getElementById("cfg-style").value,
    show:document.getElementById("cfg-show").checked
  };
  const r=await fetch(API,{method:"POST",body:JSON.stringify(payload)});
  const d=await r.json();
  showStatus(d.ok?"Estilo agregado":"Error config",d.ok?"ok":"error");
  if(d.ok){
    const modalEl = document.getElementById("modalConfig");
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
  }
});

// === Empaquetado ===
document.getElementById("form-pack").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const payload={
    action:"pack",
    brand:document.getElementById("pack-brand").value,
    style:document.getElementById("pack-style").value,
    boxSize:Number(document.getElementById("pack-boxsize").value),
    qtyBoxes:Number(document.getElementById("pack-qty").value),
    source:document.getElementById("pack-source").value,
    withLabels:document.getElementById("pack-withlabels").checked,
    note:document.getElementById("pack-note").value
  };
  const r=await fetch(API,{method:"POST",body:JSON.stringify(payload)});
  const d=await r.json();
  showStatus(d.ok?"Empaquetado ok":"Error empaquetado",d.ok?"ok":"error");
  if(d.ok){
    const modalEl = document.getElementById("modalPack");
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
  }
});

// === Scrap ===
document.getElementById("form-scrap").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const payload={
    action:"adjust_finished",
    brand:document.getElementById("scrap-brand").value,
    style:document.getElementById("scrap-style").value,
    delta:-Math.abs(Number(document.getElementById("scrap-qty").value)),
    note:"Scrap"
  };
  const r=await fetch(API,{method:"POST",body:JSON.stringify(payload)});
  const d=await r.json();
  showStatus(d.ok?"Scrap aplicado":"Error scrap",d.ok?"ok":"error");
  if(d.ok){
    const modalEl = document.getElementById("modalScrap");
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
  }
});

// === Cargar gráficos ===
async function load(){
  const r=await fetch(API);
  const data=await r.json();

  new Chart(document.getElementById("chartFinished"),{
    type:"bar",
    data:{
      labels:data.finished.map(r=>r.Style),
      datasets:[{label:"Terminados",data:data.finished.map(r=>r.OnHand)}]
    }
  });

  new Chart(document.getElementById("chartLabels"),{
    type:"bar",
    data:{
      labels:data.labels.map(r=>r.Style),
      datasets:[{label:"Etiquetas",data:data.labels.map(r=>r.OnHand)}]
    }
  });

  new Chart(document.getElementById("chartUnlabeled"),{
    type:"bar",
    data:{
      labels:data.unlabeled.map(r=>r.Style+"-"+(r.Pasteurized?"P":"NP")),
      datasets:[{label:"Unlabeled",data:data.unlabeled.map(r=>r.OnHand)}]
    }
  });

  new Chart(document.getElementById("chartPacked"),{
    type:"bar",
    data:{
      labels:data.packed.map(r=>r.Style+" x"+r.BoxSize),
      datasets:[{label:"Cajas",data:data.packed.map(r=>r.OnHand)}]
    }
  });
}
load();
