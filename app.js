const API = "https://script.google.com/macros/s/AKfycbxUStfukZGj5m4uLpgTC8xzBcdaz_HxzHyd8zFX8rSXOQfx4sBg7rQC328_vptPziT_/exec";

// === SweetAlert2 para status ===
function showStatus(msg, type='info'){
  Swal.fire({
    text: msg,
    icon: type==='ok' ? 'success' : type==='error' ? 'error' : 'info',
    timer: 2000,
    showConfirmButton: false,
    position: 'center'
  });
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

// === Función genérica para manejar formularios ===
async function handleForm(ev, payloadBuilder, modalId, formId, successMsg, errorMsg){
  ev.preventDefault();
  const btn = ev.submitter;
  btn.disabled = true;
  btn.textContent = "Guardando...";

  const payload = payloadBuilder();
  const r = await fetch(API,{method:"POST",body:JSON.stringify(payload)});
  const d = await r.json();

  showStatus(d.ok ? successMsg : errorMsg, d.ok ? "ok" : "error");

  if(d.ok){
    const modalEl = document.getElementById(modalId);
    const modal = bootstrap.Modal.getInstance(modalEl);
    modal.hide();
    document.getElementById(formId).reset();
  }

  btn.disabled = false;
  btn.textContent = "Guardar";
}

// === Producción ===
document.getElementById("form-produce").addEventListener("submit", ev=>{
  handleForm(ev, ()=>({
    action:"batch_produce",
    items:[{
      brand:document.getElementById("prod-brand").value,
      style:document.getElementById("prod-style").value,
      qty:Number(document.getElementById("prod-qty").value)
    }],
    state:document.getElementById("prod-state").value,
    consume:document.getElementById("consume-labels").checked,
    note:""
  }), "modalProduce", "form-produce", "Producción ok", "Error producción");
});

// === Ingresar etiquetas ===
document.getElementById("form-labels").addEventListener("submit", ev=>{
  handleForm(ev, ()=>({
    action:"labels_in",
    items:[{
      brand:document.getElementById("labels-brand").value,
      style:document.getElementById("labels-style").value,
      qty:Number(document.getElementById("labels-qty").value)
    }],
    note:""
  }), "modalLabels", "form-labels", "Etiquetas ingresadas", "Error etiquetas");
});

// === Latas vacías ===
document.getElementById("form-empty").addEventListener("submit", ev=>{
  handleForm(ev, ()=>({
    action:"empty_in",
    qty:Number(document.getElementById("empty-qty").value),
    note:""
  }), "modalEmpty", "form-empty", "Latas vacías ingresadas", "Error latas vacías");
});

// === Configuración estilos ===
document.getElementById("form-config").addEventListener("submit", ev=>{
  handleForm(ev, ()=>({
    action:"config_add_style",
    brand:document.getElementById("cfg-brand").value,
    style:document.getElementById("cfg-style").value,
    show:document.getElementById("cfg-show").checked
  }), "modalConfig", "form-config", "Estilo agregado", "Error config");
});

// === Empaquetado ===
document.getElementById("form-pack").addEventListener("submit", ev=>{
  handleForm(ev, ()=>({
    action:"pack",
    brand:document.getElementById("pack-brand").value,
    style:document.getElementById("pack-style").value,
    boxSize:Number(document.getElementById("pack-boxsize").value),
    qtyBoxes:Number(document.getElementById("pack-qty").value),
    source:document.getElementById("pack-source").value,
    withLabels:document.getElementById("pack-withlabels").checked,
    note:document.getElementById("pack-note").value
  }), "modalPack", "form-pack", "Empaquetado ok", "Error empaquetado");
});

// === Scrap ===
document.getElementById("form-scrap").addEventListener("submit", ev=>{
  handleForm(ev, ()=>({
    action:"adjust_finished",
    brand:document.getElementById("scrap-brand").value,
    style:document.getElementById("scrap-style").value,
    delta:-Math.abs(Number(document.getElementById("scrap-qty").value)),
    note:"Scrap"
  }), "modalScrap", "form-scrap", "Scrap aplicado", "Error scrap");
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
