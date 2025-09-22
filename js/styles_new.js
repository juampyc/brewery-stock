// js/styles_new.js
(function(){
  'use strict';
  const WEB_APP_URL = (window.GAS_WEB_APP_URL || (window.getAppConfig && getAppConfig('GAS_WEB_APP_URL')) || '');

  function TOAST(icon, title){ return Swal.fire({toast:true, position:'top-end', icon, title, showConfirmButton:false, timer:2000}); }
  async function callGAS(action, payload){
    const body = new URLSearchParams();
    body.set('action', action);
    body.set('payload', JSON.stringify(payload||{}));
    const res = await fetch(WEB_APP_URL, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
    const text = await res.text();
    if(!res.ok){ throw new Error(text || ('HTTP_'+res.status)); }
    return JSON.parse(text);
  }
  function short(v){ return v ? String(v).substring(0,10) : ''; }

  const form = document.getElementById('styleForm');
  const brandSel = document.getElementById('brandSel');
  const styleName = document.getElementById('styleName');
  const styleColor = document.getElementById('styleColor');
  const showAlways = document.getElementById('showAlways');
  const reloadBtn = document.getElementById('reloadBtn');
  const tblBody = document.querySelector('#stylesTable tbody');

  async function loadBrands(){
    const r = await callGAS('listBrands', {});
    const items = (r && r.ok && r.data) ? r.data : [];
    if (!items.length){
      brandSel.innerHTML = '<option value="">(no hay marcas)</option>';
      return;
    }
    brandSel.innerHTML = items.map(b => `<option value="${b.id}">${b.name}</option>`).join('');
  }

  async function loadStylesTable(){
    const r = await callGAS('listStyles', {});
    const items = (r && r.ok && r.data) ? r.data : [];
    if (!items.length){
      tblBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px">Sin datos</td></tr>';
      return;
    }
    // ordenar: Marca, Estilo
    items.sort((a,b)=> (a.brandName||'').localeCompare(b.brandName||'') || (a.name||'').localeCompare(b.name||''));
    tblBody.innerHTML = items.map(it=>{
      const hex = it.color || '#999999';
      const show = it.showAlways ? 'Sí' : 'No';
      return `<tr>
        <td>${it.brandName || it.brandId}</td>
        <td>${it.name || ''}</td>
        <td><span class="swatch" style="background:${hex}"></span>${hex}</td>
        <td>${show}</td>
        <td><span title="${it.styleId||''}">${short(it.styleId||'')}</span></td>
      </tr>`;
    }).join('');
  }

  async function onSubmit(ev){
    ev.preventDefault();
    const brandId = String(brandSel.value||'').trim();
    const name    = String(styleName.value||'').trim();
    const color   = String(styleColor.value||'#147500').trim();
    const show    = !!showAlways.checked;
    if (!brandId || !name){ TOAST('warning','Completá marca y estilo'); return; }

    try{
      const r = await callGAS('createStyle', { brandId, name, color, showAlways: show });
      if (r && r.ok){
        TOAST('success','Estilo guardado');
        styleName.value = '';
        await loadStylesTable();
      } else {
        if (r && r.error === 'STYLE_EXISTS') TOAST('error','La marca ya tiene ese estilo');
        else TOAST('error','No se pudo guardar');
      }
    }catch(e){ console.error(e); TOAST('error','Error de red'); }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    form.addEventListener('submit', onSubmit);
    reloadBtn.addEventListener('click', loadStylesTable);
    await Promise.all([ loadBrands(), loadStylesTable() ]);
  });
})();
