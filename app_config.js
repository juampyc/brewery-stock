// app_config.js content (CRUD de estilos con SweetAlert)
const API = "https://script.google.com/macros/s/AKfycbxUStfukZGj5m4uLpgTC8xzBcdaz_HxzHyd8zFX8rSXOQfx4sBg7rQC328_vptPziT_/exec";

async function loadStyles(){
  const r = await fetch(API);
  const data = await r.json();
  const tbody = document.querySelector("#stylesTable tbody");
  tbody.innerHTML = "";
  data.config.forEach(s=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.Brand}</td>
      <td>${s.Style}</td>
      <td>${s.Show}</td>
      <td><div style="width:20px;height:20px;background:${s.Color}"></div></td>
      <td>${s["Mutation Date/Time"]||""}</td>
      <td>
        <button class="btn btn-sm btn-warning btn-edit">Editar</button>
        <button class="btn btn-sm btn-danger btn-del">Eliminar</button>
      </td>`;
    tr.querySelector(".btn-edit").onclick=()=>editStyle(s);
    tr.querySelector(".btn-del").onclick=()=>deleteStyle(s);
    tbody.appendChild(tr);
  });
}

async function editStyle(s){
  const { value: formValues } = await Swal.fire({
    title: "Editar estilo",
    html: `
      <input id="sw-brand" class="swal2-input" value="${s.Brand}">
      <input id="sw-style" class="swal2-input" value="${s.Style}">
      <label><input type="checkbox" id="sw-show" ${s.Show?"checked":""}> Mostrar</label>
      <input type="color" id="sw-color" class="swal2-input" value="${s.Color}">
    `,
    focusConfirm: false,
    preConfirm: () => ({
      brand: document.getElementById("sw-brand").value,
      style: document.getElementById("sw-style").value,
      show: document.getElementById("sw-show").checked,
      color: document.getElementById("sw-color").value
    })
  });
  if(formValues){
    await fetch(API,{method:"POST",body:JSON.stringify({
      action:"config_update_style",
      oldBrand:s.Brand, oldStyle:s.Style,
      ...formValues
    })});
    loadStyles();
  }
}

async function deleteStyle(s){
  await fetch(API,{method:"POST",body:JSON.stringify({
    action:"config_delete_style",
    brand:s.Brand, style:s.Style
  })});
  loadStyles();
}

document.getElementById("btn-add").onclick=async ()=>{
  const { value: formValues } = await Swal.fire({
    title: "Nuevo estilo",
    html: `
      <input id="sw-brand" class="swal2-input" placeholder="Marca">
      <input id="sw-style" class="swal2-input" placeholder="Estilo">
      <label><input type="checkbox" id="sw-show"> Mostrar</label>
      <input type="color" id="sw-color" class="swal2-input" value="#9e9e9e">
    `,
    focusConfirm: false,
    preConfirm: () => ({
      brand: document.getElementById("sw-brand").value,
      style: document.getElementById("sw-style").value,
      show: document.getElementById("sw-show").checked,
      color: document.getElementById("sw-color").value
    })
  });
  if(formValues){
    await fetch(API,{method:"POST",body:JSON.stringify({action:"config_add_style",...formValues})});
    loadStyles();
  }
};

loadStyles();
