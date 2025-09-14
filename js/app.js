
/* Castelo CRUD - App JS (no Production) - v5 */
(function(){ 'use strict';
  const API_BASE = 'https://script.google.com/macros/s/AKfycbzzITfZwQNYadZz05moOfJ-ZIzXtF6O0VdV2L4nI7cKohIuf6pXols1JQI2idAPbLP9/exec';
  const TZ_AR = 'America/Argentina/Buenos_Aires';

  var Toast = window.Toast || Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 2500, timerProgressBar: true,
    didOpen: (t) => { t.addEventListener('mouseenter', Swal.stopTimer); t.addEventListener('mouseleave', Swal.resumeTimer); }
  });
  window.Toast = Toast;

  const $ = (s, r) => (r||document).querySelector(s);
  const qsId = (id) => document.getElementById(id);
  const shortId = (id) => id ? String(id).slice(0,8) : '';
  const colorDot = (c) => c ? '<span class="d-inline-block rounded-circle border" style="width:14px;height:14px;background:'+c+'"></span>' : '';

  async function apiGet(entity, action='getAll', params={}) {
    const sp = new URLSearchParams(Object.entries(params));
    const url = API_BASE + '?entity=' + encodeURIComponent(entity) + '&action=' + encodeURIComponent(action) + (sp.toString()?('&'+sp.toString()):'');
    const r = await fetch(url); if(!r.ok) throw new Error('GET '+entity+'/'+action+' '+r.status);
    const j = await r.json(); if(j && j.error) throw new Error(j.error);
    return j && (j.data||j.rows||j.list||j);
  }
  async function apiPost(entity, data, action='create') {
    const url = API_BASE + '?entity=' + encodeURIComponent(entity) + '&action=' + encodeURIComponent(action);
    const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data||{}) });
    if(!r.ok) throw new Error('POST '+entity+'/'+action+' '+r.status);
    const j = await r.json(); if(j && j.error) throw new Error(j.error);
    return j && (j.data||j);
  }
  const apiDelete = (entity, id) => apiPost(entity, { id }, 'delete');
  const fmtAR = (iso) => { try{const d=new Date(iso); return d.toLocaleString('es-AR',{timeZone:TZ_AR,hour12:false}).slice(0,16);}catch{return iso||'';} };

  // CONFIG: Brands
  async function loadBrands(){ const rows=await apiGet('brands'); const tb=$('#brandsTable tbody'); if(!tb) return;
    tb.innerHTML=''; (rows||[]).forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`
      <td>${shortId(r.id)}</td><td>${r.name||''}</td><td>${colorDot(r.color||'')}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${r.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-act="del" data-id="${r.id}">Eliminar</button>
      </td>`; tb.appendChild(tr); });
  }
  async function addBrand(){ const { value: formValues } = await Swal.fire({
      title:'Agregar marca', html:`
      <div class="mb-2 text-start"><label class="form-label">Nombre</label><input id="sw_name" class="form-control"></div>
      <div class="mb-2 text-start"><label class="form-label">Color</label><input id="sw_color" type="color" class="form-control form-control-color" value="#000000"></div>`,
      showCancelButton:true, confirmButtonText:'Guardar', preConfirm:()=>({ name:$('#sw_name').value.trim(), color:$('#sw_color').value })
  }); if(!formValues||!formValues.name) return; await apiPost('brands',formValues,'create'); Toast.fire({icon:'success',title:'Marca creada'}); await loadBrands(); }
  async function editBrand(id){ const d=(await apiGet('brands','get',{id}))||{}; const { value: formValues } = await Swal.fire({
      title:'Editar marca', html:`
      <div class="mb-2 text-start"><label class="form-label">Nombre</label><input id="sw_name" class="form-control" value="${d.name||''}"></div>
      <div class="mb-2 text-start"><label class="form-label">Color</label><input id="sw_color" type="color" class="form-control form-control-color" value="${d.color||'#000000'}"></div>`,
      showCancelButton:true, confirmButtonText:'Guardar', preConfirm:()=>({ id, name:$('#sw_name').value.trim(), color:$('#sw_color').value })
  }); if(!formValues||!formValues.name) return; await apiPost('brands',formValues,'update'); Toast.fire({icon:'success',title:'Marca actualizada'}); await loadBrands(); }
  async function deleteBrand(id){ const ok=await Swal.fire({icon:'warning',title:'Confirmar',text:'¿Eliminar la marca?',showCancelButton:true,confirmButtonText:'Eliminar',cancelButtonText:'Cancelar'}).then(r=>r.isConfirmed); if(!ok) return; await apiDelete('brands',id); Toast.fire({icon:'success',title:'Eliminado'}); await loadBrands(); }
  function bindBrands(){ const t=$('#brandsTable'); if(!t) return;
    t.addEventListener('click',e=>{ const b=e.target.closest('button[data-act]'); if(!b) return; const id=b.getAttribute('data-id'); const a=b.getAttribute('data-act'); if(a==='edit') editBrand(id); if(a==='del') deleteBrand(id); });
    const add=qsId('btnAddBrand'); if(add) add.addEventListener('click',()=>addBrand());
  }

  // CONFIG: Containers
  async function loadContainers(){ const rows=await apiGet('containers'); const tb=$('#containersTable tbody'); if(!tb) return;
    tb.innerHTML=''; (rows||[]).forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`
      <td>${shortId(r.id)}</td><td>${r.name||''}</td><td>${r.size_l||''}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${r.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-act="del" data-id="${r.id}">Eliminar</button>
      </td>`; tb.appendChild(tr); });
  }
  async function addContainer(){ const { value: formValues } = await Swal.fire({
      title:'Agregar envase', html:`
      <div class="mb-2 text-start"><label class="form-label">Nombre</label><input id="sw_name" class="form-control" placeholder="Lata 473cc"></div>
      <div class="mb-2 text-start"><label class="form-label">Tamaño (L)</label><input id="sw_size" type="number" step="0.001" class="form-control" value="0.473"></div>`,
      showCancelButton:true, confirmButtonText:'Guardar', preConfirm:()=>({ name:$('#sw_name').value.trim(), size_l: parseFloat($('#sw_size').value)||0 })
  }); if(!formValues||!formValues.name) return; await apiPost('containers',formValues,'create'); Toast.fire({icon:'success',title:'Envase creado'}); await loadContainers(); }
  async function editContainer(id){ const d=(await apiGet('containers','get',{id}))||{}; const { value: formValues } = await Swal.fire({
      title:'Editar envase', html:`
      <div class="mb-2 text-start"><label class="form-label">Nombre</label><input id="sw_name" class="form-control" value="${d.name||''}"></div>
      <div class="mb-2 text-start"><label class="form-label">Tamaño (L)</label><input id="sw_size" type="number" step="0.001" class="form-control" value="${d.size_l||0}"></div>`,
      showCancelButton:true, confirmButtonText:'Guardar', preConfirm:()=>({ id, name:$('#sw_name').value.trim(), size_l: parseFloat($('#sw_size').value)||0 })
  }); if(!formValues||!formValues.name) return; await apiPost('containers',formValues,'update'); Toast.fire({icon:'success',title:'Envase actualizado'}); await loadContainers(); }
  async function deleteContainer(id){ const ok=await Swal.fire({icon:'warning',title:'Confirmar',text:'¿Eliminar el envase?',showCancelButton:true,confirmButtonText:'Eliminar',cancelButtonText:'Cancelar'}).then(r=>r.isConfirmed); if(!ok) return; await apiDelete('containers',id); Toast.fire({icon:'success',title:'Eliminado'}); await loadContainers(); }
  function bindContainers(){ const t=$('#containersTable'); if(!t) return;
    t.addEventListener('click',e=>{ const b=e.target.closest('button[data-act]'); if(!b) return; const id=b.getAttribute('data-id'); const a=b.getAttribute('data-act'); if(a==='edit') editContainer(id); if(a==='del') deleteContainer(id); });
    const add=qsId('btnAddContainer'); if(add) add.addEventListener('click',()=>addContainer());
  }

  // CONFIG: Styles
  async function loadStyles(){ const rows=await apiGet('styles'); const tb=$('#stylesTable tbody'); if(!tb) return;
    tb.innerHTML=''; (rows||[]).forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`
      <td>${shortId(r.id)}</td><td>${r.brand_name||r.brand||''}</td><td>${r.name||''}</td><td>${colorDot(r.color||'')}</td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${r.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-act="del" data-id="${r.id}">Eliminar</button>
      </td>`; tb.appendChild(tr); });
  }
  async function addStyle(){ const brands=await apiGet('brands'); const brandOpts=(brands||[]).map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    const { value: formValues } = await Swal.fire({
      title:'Agregar estilo', html:`
      <div class="mb-2 text-start"><label class="form-label">Marca</label><select id="sw_brand" class="form-select">${brandOpts}</select></div>
      <div class="mb-2 text-start"><label class="form-label">Nombre del estilo</label><input id="sw_name" class="form-control" placeholder="IPA, Kölsch, etc."></div>
      <div class="mb-2 text-start"><label class="form-label">Color</label><input id="sw_color" type="color" class="form-control form-control-color" value="#000000"></div>`,
      showCancelButton:true, confirmButtonText:'Guardar', preConfirm:()=>({ brand_id:$('#sw_brand').value, name:$('#sw_name').value.trim(), color:$('#sw_color').value })
    }); if(!formValues||!formValues.name) return; await apiPost('styles',formValues,'create'); Toast.fire({icon:'success',title:'Estilo creado'}); await loadStyles(); }
  async function editStyle(id){ const d=(await apiGet('styles','get',{id}))||{}; const brands=await apiGet('brands');
    const brandOpts=(brands||[]).map(b=>`<option value="${b.id}" ${(str=>str)(String(b.id)===String(d.brand_id)?'selected':'')}>${b.name}</option>`).join('');
    const { value: formValues } = await Swal.fire({
      title:'Editar estilo', html:`
        <div class="mb-2 text-start"><label class="form-label">Marca</label><select id="sw_brand" class="form-select">${brandOpts}</select></div>
        <div class="mb-2 text-start"><label class="form-label">Nombre del estilo</label><input id="sw_name" class="form-control" value="${d.name||''}"></div>
        <div class="mb-2 text-start"><label class="form-label">Color</label><input id="sw_color" type="color" class="form-control form-control-color" value="${d.color||'#000000'}"></div>`,
      showCancelButton:true, confirmButtonText:'Guardar', preConfirm:()=>({ id, brand_id:$('#sw_brand').value, name:$('#sw_name').value.trim(), color:$('#sw_color').value })
    }); if(!formValues||!formValues.name) return; await apiPost('styles',formValues,'update'); Toast.fire({icon:'success',title:'Estilo actualizado'}); await loadStyles(); }
  async function deleteStyle(id){ const ok=await Swal.fire({icon:'warning',title:'Confirmar',text:'¿Eliminar el estilo?',showCancelButton:true,confirmButtonText:'Eliminar',cancelButtonText:'Cancelar'}).then(r=>r.isConfirmed); if(!ok) return; await apiDelete('styles',id); Toast.fire({icon:'success',title:'Eliminado'}); await loadStyles(); }
  function bindStyles(){ const t=$('#stylesTable'); if(!t) return;
    t.addEventListener('click',e=>{ const b=e.target.closest('button[data-act]'); if(!b) return; const id=b.getAttribute('data-id'); const a=b.getAttribute('data-act'); if(a==='edit') editStyle(id); if(a==='del') deleteStyle(id); });
    const add=qsId('btnAddStyle'); if(add) add.addEventListener('click',()=>addStyle());
  }

  // INSUMOS: Labels
  async function loadLabels(){ const list=await apiGet('labels'); const tb=$('#labelsTable tbody'); if(tb){ tb.innerHTML=''; (list||[]).forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`
        <td>${shortId(r.id)}</td><td>${r.brand_name||r.brand||''}</td><td>${r.style_name||r.style||''}</td><td class="text-end">${Number(r.qty||0)}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${r.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-act="del" data-id="${r.id}">Eliminar</button></td>`; tb.appendChild(tr); }); }
    const tot=(list||[]).reduce((a,x)=>a+Number(x.qty||0),0); if(qsId('lbl_total_units')) qsId('lbl_total_units').textContent=tot;
    if(qsId('lbl_total_items')) qsId('lbl_total_items').textContent=(list||[]).length;
    if(qsId('idx_total_labels')) qsId('idx_total_labels').textContent=tot;
  }
  async function addLabel(){ const brands=await apiGet('brands'); const styles=await apiGet('styles');
    const brandOpts=(brands||[]).map(b=>`<option value="${b.id}">${b.name}</option>`).join('');
    const styleOpts=(styles||[]).map(s=>`<option value="${s.id}">${(s.brand_name||'')+' - '+(s.name||'')}</option>`).join('');
    const { value: formValues } = await Swal.fire({
      title:'Agregar etiqueta', html:`
      <div class="mb-2 text-start"><label class="form-label">Marca</label><select id="sw_brand" class="form-select">${brandOpts}</select></div>
      <div class="mb-2 text-start"><label class="form-label">Estilo</label><select id="sw_style" class="form-select">${styleOpts}</select></div>
      <div class="mb-2 text-start"><label class="form-label">Cantidad</label><input id="sw_qty" type="number" min="0" step="1" class="form-control" value="0"></div>`,
      showCancelButton:true, confirmButtonText:'Guardar', preConfirm:()=>({ brand_id:$('#sw_brand').value, style_id:$('#sw_style').value, qty: parseInt($('#sw_qty').value)||0 })
    }); if(!formValues) return; await apiPost('labels',formValues,'create'); Toast.fire({icon:'success',title:'Etiqueta creada'}); await loadLabels(); }
  async function editLabel(id){ const d=(await apiGet('labels','get',{id}))||{}; const brands=await apiGet('brands'); const styles=await apiGet('styles');
    const brandOpts=(brands||[]).map(b=>`<option value="${b.id}" ${(String(b.id)===String(d.brand_id)?'selected':'')}>${b.name}</option>`).join('');
    const styleOpts=(styles||[]).map(s=>`<option value="${s.id}" ${(String(s.id)===String(d.style_id)?'selected':'')}>${(s.brand_name||'')+' - '+(s.name||'')}</option>`).join('');
    const { value: formValues } = await Swal.fire({
      title:'Editar etiqueta', html:`
      <div class="mb-2 text-start"><label class="form-label">Marca</label><select id="sw_brand" class="form-select">${brandOpts}</select></div>
      <div class="mb-2 text-start"><label class="form-label">Estilo</label><select id="sw_style" class="form-select">${styleOpts}</select></div>
      <div class="mb-2 text-start"><label class="form-label">Cantidad</label><input id="sw_qty" type="number" min="0" step="1" class="form-control" value="${d.qty||0}"></div>`,
      showCancelButton:true, confirmButtonText:'Guardar', preConfirm:()=>({ id, brand_id:$('#sw_brand').value, style_id:$('#sw_style').value, qty: parseInt($('#sw_qty').value)||0 })
    }); if(!formValues) return; await apiPost('labels',formValues,'update'); Toast.fire({icon:'success',title:'Etiqueta actualizada'}); await loadLabels(); }
  async function deleteLabel(id){ const ok=await Swal.fire({icon:'warning',title:'Confirmar',text:'¿Eliminar la etiqueta?',showCancelButton:true,confirmButtonText:'Eliminar',cancelButtonText:'Cancelar'}).then(r=>r.isConfirmed); if(!ok) return; await apiDelete('labels',id); Toast.fire({icon:'success',title:'Eliminado'}); await loadLabels(); }
  function bindLabels(){ const t=$('#labelsTable'); if(!t) return;
    t.addEventListener('click',e=>{ const b=e.target.closest('button[data-act]'); if(!b) return; const id=b.getAttribute('data-id'); const a=b.getAttribute('data-act'); if(a==='edit') editLabel(id); if(a==='del') deleteLabel(id); });
    const add=qsId('btnAddLabel'); if(add) add.addEventListener('click',()=>addLabel());
  }

  // INSUMOS: Empty Cans
  async function loadEmptyCans(){ const list=await apiGet('emptycans'); const tb=$('#emptycansTable tbody'); if(tb){ tb.innerHTML=''; (list||[]).forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`
        <td>${shortId(r.id)}</td><td>${r.provider||''}</td><td>${r.lot||''}</td><td class="text-end">${Number(r.qty||0)}</td>
        <td class="text-end"><button class="btn btn-sm btn-outline-secondary me-1" data-act="edit" data-id="${r.id}">Editar</button>
        <button class="btn btn-sm btn-danger" data-act="del" data-id="${r.id}">Eliminar</button></td>`; tb.appendChild(tr); }); }
    const tot=(list||[]).reduce((a,x)=>a+Number(x.qty||0),0); if(qsId('idx_total_emptycans')) qsId('idx_total_emptycans').textContent=tot;
  }
  async function addEmptyCan(){ const { value: formValues } = await Swal.fire({
      title:'Agregar latas vacías', html:`
      <div class="mb-2 text-start"><label class="form-label">Proveedor</label><input id="sw_provider" class="form-control"></div>
      <div class="mb-2 text-start"><label class="form-label">Lote</label><input id="sw_lot" class="form-control"></div>
      <div class="mb-2 text-start"><label class="form-label">Cantidad</label><input id="sw_qty" type="number" min="0" step="1" class="form-control" value="0"></div>`,
      showCancelButton:true, confirmButtonText:'Guardar', preConfirm:()=>({ provider:$('#sw_provider').value.trim(), lot:$('#sw_lot').value.trim(), qty: parseInt($('#sw_qty').value)||0 })
  }); if(!formValues) return; await apiPost('emptycans',formValues,'create'); Toast.fire({icon:'success',title:'Latas vacías agregadas'}); await loadEmptyCans(); }
  async function editEmptyCan(id){ const d=(await apiGet('emptycans','get',{id}))||{}; const { value: formValues } = await Swal.fire({
      title:'Editar latas vacías', html:`
      <div class="mb-2 text-start"><label class="form-label">Proveedor</label><input id="sw_provider" class="form-control" value="${d.provider||''}"></div>
      <div class="mb-2 text-start"><label class="form-label">Lote</label><input id="sw_lot" class="form-control" value="${d.lot||''}"></div>
      <div class="mb-2 text-start"><label class="form-label">Cantidad</label><input id="sw_qty" type="number" min="0" step="1" class="form-control" value="${d.qty||0}"></div>`,
      showCancelButton:true, confirmButtonText:'Guardar', preConfirm:()=>({ id, provider:$('#sw_provider').value.trim(), lot:$('#sw_lot').value.trim(), qty: parseInt($('#sw_qty').value)||0 })
  }); if(!formValues) return; await apiPost('emptycans',formValues,'update'); Toast.fire({icon:'success',title:'Registro actualizado'}); await loadEmptyCans(); }
  async function deleteEmptyCan(id){ const ok=await Swal.fire({icon:'warning',title:'Confirmar',text:'¿Eliminar registro de latas vacías?',showCancelButton:true,confirmButtonText:'Eliminar',cancelButtonText:'Cancelar'}).then(r=>r.isConfirmed); if(!ok) return; await apiDelete('emptycans',id); Toast.fire({icon:'success',title:'Eliminado'}); await loadEmptyCans(); }
  function bindEmptyCans(){ const t=$('#emptycansTable'); if(!t) return;
    t.addEventListener('click',e=>{ const b=e.target.closest('button[data-act]'); if(!b) return; const id=b.getAttribute('data-id'); const a=b.getAttribute('data-act'); if(a==='edit') editEmptyCan(id); if(a==='del') deleteEmptyCan(id); });
    const add=qsId('btnAddEmptyCan'); if(add) add.addEventListener('click',()=>addEmptyCan());
  }

  // MOVEMENTS
  async function loadMovements(){ const rows=await apiGet('movements'); const tb=$('#movementsTable tbody'); if(!tb) return;
    tb.innerHTML=''; (rows||[]).forEach(r=>{ const tr=document.createElement('tr'); tr.innerHTML=`
      <td>${shortId(r.id)}</td><td>${r.entity||''}</td><td>${r.action||''}</td><td>${r.desc||r.description||''}</td><td>${fmtAR(r.createdAt||r.date||'')}</td>`; tb.appendChild(tr); });
  }

  // INDEX totals
  async function loadHomeTotals(){ try{ const [ec,lb]=await Promise.all([apiGet('emptycans'),apiGet('labels')]);
      if(qsId('idx_total_emptycans')) qsId('idx_total_emptycans').textContent=(ec||[]).reduce((a,x)=>a+Number(x.qty||0),0);
      if(qsId('idx_total_labels')) qsId('idx_total_labels').textContent=(lb||[]).reduce((a,x)=>a+Number(x.qty||0),0);
    }catch(e){ console.error(e); } }

  // Boot
  async function boot(){ 
    if(qsId('brandsTable')||qsId('containersTable')||qsId('stylesTable')){ bindBrands(); bindContainers(); bindStyles(); await Promise.all([loadBrands(),loadContainers(),loadStyles()]); }
    if(qsId('labelsTable')||qsId('emptycansTable')){ bindLabels(); bindEmptyCans(); await Promise.all([loadLabels(),loadEmptyCans()]); }
    if(qsId('movementsTable')){ await loadMovements(); }
    if(qsId('idx_total_emptycans') || qsId('idx_total_labels')){ await loadHomeTotals(); }
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
