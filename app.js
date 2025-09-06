const API = "https://script.google.com/macros/s/AKfycbxUStfukZGj5m4uLpgTC8xzBcdaz_HxzHyd8zFX8rSXOQfx4sBg7rQC328_vptPziT_/exec";

function showStatus(msg, type='info'){
  Swal.fire({
    text: msg,
    icon: type==='ok' ? 'success' : type==='error' ? 'error' : 'info',
    timer: 2000,
    showConfirmButton: false,
    position: 'center'
  });
}

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

// Ejemplo: carga de gráficos usando color desde backend
async function load(){
  const r=await fetch(API);
  const data=await r.json();

  new Chart(document.getElementById("chartFinished"),{
    type:"bar",
    data:{
      labels:data.finished.map(r=>r.Style),
      datasets:[{
        label:"Terminados",
        data:data.finished.map(r=>r.OnHand),
        backgroundColor:data.finished.map(r=>r.Color || "#9e9e9e")
      }]
    }
  });

  new Chart(document.getElementById("chartLabels"),{
    type:"bar",
    data:{
      labels:data.labels.map(r=>r.Style),
      datasets:[{
        label:"Etiquetas",
        data:data.labels.map(r=>r.OnHand),
        backgroundColor:data.labels.map(r=>r.Color || "#9e9e9e")
      }]
    }
  });

  new Chart(document.getElementById("chartUnlabeled"),{
    type:"bar",
    data:{
      labels:data.unlabeled.map(r=>r.Style+"-"+(r.Pasteurized?"P":"NP")),
      datasets:[{
        label:"Unlabeled",
        data:data.unlabeled.map(r=>r.OnHand),
        backgroundColor:data.unlabeled.map(r=>r.Color || "#9e9e9e")
      }]
    }
  });

  new Chart(document.getElementById("chartPacked"),{
    type:"bar",
    data:{
      labels:data.packed.map(r=>r.Style+" x"+r.BoxSize),
      datasets:[{
        label:"Cajas",
        data:data.packed.map(r=>r.OnHand),
        backgroundColor:data.packed.map(r=>r.Color || "#9e9e9e")
      }]
    }
  });
}
load();