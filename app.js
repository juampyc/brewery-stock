const API = "https://script.google.com/macros/s/AKfycbxUStfukZGj5m4uLpgTC8xzBcdaz_HxzHyd8zFX8rSXOQfx4sBg7rQC328_vptPziT_/exec";

function showStatus(msg, type='info'){
  const el=document.getElementById("status");
  el.textContent=msg;
  el.className="alert status show alert-"+(type==='ok'?'success':type==='error'?'danger':'info');
  if(type!=='info') setTimeout(()=>el.classList.remove("show"),2000);
}

// Tema
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

// Producción
document.getElementById("form-produce").addEventListener("submit", async ev=>{
  ev.preventDefault();
  const payload={
    action:"batch_produce",
    items:[{brand:document.getElementById("prod-brand").value,style:document.getElementById("prod-style").value,qty:Number(document.getElementById("prod-qty").value)}],
    state:document.getElementById("prod-state").value,
    consume:document.getElementById("consume-labels").checked,
    note:""
  };
  const r=await fetch(API,{method:"POST",body:JSON.stringify(payload)});
  const d=await r.json();
  showStatus(d.ok?"Producción ok":"Error","ok");
});

// Empaquetado
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
  showStatus(d.ok?"Empaquetado ok":"Error empaquetado","ok");
});

// Charts (ejemplo simple)
async function load(){
  const r=await fetch(API);
  const data=await r.json();

  // Terminados
  const ctx=document.getElementById("chartFinished");
  new Chart(ctx,{type:"bar",data:{
    labels:data.finished.map(r=>r.Style),
    datasets:[{label:"Terminados",data:data.finished.map(r=>r.OnHand)}]
  }});

  // Etiquetas
  const ctx2=document.getElementById("chartLabels");
  new Chart(ctx2,{type:"bar",data:{
    labels:data.labels.map(r=>r.Style),
    datasets:[{label:"Etiquetas",data:data.labels.map(r=>r.OnHand)}]
  }});

  // Unlabeled
  const ctx3=document.getElementById("chartUnlabeled");
  new Chart(ctx3,{type:"bar",data:{
    labels:data.unlabeled.map(r=>r.Style+"-"+(r.Pasteurized?"P":"NP")),
    datasets:[{label:"Unlabeled",data:data.unlabeled.map(r=>r.OnHand)}]
  }});

  // Packed
  const ctx4=document.getElementById("chartPacked");
  new Chart(ctx4,{type:"bar",data:{
    labels:data.packed.map(r=>r.Style+" x"+r.BoxSize),
    datasets:[{label:"Cajas",data:data.packed.map(r=>r.OnHand)}]
  }});
}
load();
