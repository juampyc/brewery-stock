// js/scrap.js
(function(){
  'use strict';
  const WEB_APP_URL = (window.GAS_WEB_APP_URL || (window.getAppConfig && getAppConfig('GAS_WEB_APP_URL')) || '');

  function TOAST(icon, title){ return Swal.fire({toast:true, position:'top-end', icon, title, showConfirmButton:false, timer:2000}); }
  function short(v){ return v? String(v).substring(0,8):''; }
  function fmtDate(s){ const d=new Date(s); if(isNaN(d)) return s||''; return d.toLocaleString(); }

  async function callGAS(action, payload){
    const body = new URLSearchParams();
    body.set('action', action);
    body.set('payload', JSON.stringify(payload||{}));
    const res = await fetch(WEB_APP_URL, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
    const text = await res.text();
    if(!res.ok) throw new Error(text||('HTTP_'+res.status));
    return JSON.parse(text);
  }

  const form = document.getElementById('scrapForm');
  const radios = form.querySelectorAll('input[name="source"]');
  const prodPick = document.getElementById('prodPick');
  const prodSel = document.getElementById('prodSel');
  const qtyInp = document.getElementById('scrapQty');
  const reloadMovsBtn = document.getElementById('reloadMovs');
  const tblBody = document.querySelector('#scrapTable tbody');
  const prodAvail = document.getElementById('prodAvail');
  const emptyAvail = document.getElementById('emptyAvail');

  let emptyStock = 0;
  let prodMap = {}; // id -> qty

  radios.forEach(r => r.addEventListener('change', ()=>{
    const val = form.source.value;
    const isProd = (val==='PROD');
    prodPick.style.display = isProd ? '' : 'none';
    emptyAvail.style.display = isProd ? 'none' : '';
    // limpiar cantidad
    qtyInp.value = '';
  }));

  prodSel.addEventListener('change', ()=>{
    const id = prodSel.value || '';
    const avail = prodMap[id] || 0;
    prodAvail.textContent = 'Disponible: ' + avail + ' u';
  });

  async function loadEmptyStock(){
    const r = await callGAS('getSummaryCounts', {});
    emptyStock = (r && r.ok && r.data && r.data.emptyCansTotal) ? Number(r.data.emptyCansTotal||0) : 0;
    emptyAvail.textContent = 'Disponible: ' + emptyStock + ' u';
  }

  async function loadProductions(){
    const r = await callGAS('listProductions', { page:1, pageSize:10000 });
    const items = (r && r.ok && r.data && r.data.items) ? r.data.items : [];
    items.sort((a,b)=> String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
    const opts = ['<option value="">Seleccionar lote…</option>'];
    prodMap = {};
    items.forEach(it=>{
      const id = it.id || '';
      const label = `${short(id)} · ${it.status} · ${it.qty}u`;
      prodMap[id] = Number(it.qty||0);
      opts.push(`<option value="${id}">${label}</option>`);
    });
    prodSel.innerHTML = opts.join('');
    prodAvail.textContent = 'Disponible: —';
  }

  async function loadScraps(){
    const r = await callGAS('listMovements', { page:1, pageSize:500, typePrefix:'' });
    const rows = (r && r.ok && r.data && r.data.items) ? r.data.items : [];
    const scraps = rows.filter(x => (x.type==='EMPTY_CANS_SCRAP' || x.type==='PROD_SCRAP'));
    scraps.sort((a,b)=> new Date(b.dateTime||0) - new Date(a.dateTime||0));
    if(!scraps.length){ tblBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:16px">Sin datos</td></tr>'; return; }
    tblBody.innerHTML = scraps.map(m=>(
      `<tr>
        <td><span title="${m.id}">${short(m.id)}</span></td>
        <td>${m.type}</td>
        <td><span title="${m.refId||''}">${short(m.refId||'')}</span></td>
        <td>${m.qty||0}</td>
        <td>${fmtDate(m.dateTime||'')}</td>
      </tr>`
    )).join('');
  }

  async function onSubmit(ev){
    ev.preventDefault();
    const source = form.source.value;
    const qty = Number(qtyInp.value||0);
    if (!qty || qty<=0){ TOAST('warning','Ingresá cantidad'); return; }

    if (source==='EMPTY'){
      if (qty > emptyStock){ TOAST('error', 'Cantidad mayor al stock ('+emptyStock+')'); return; }
    } else {
      const prodId = String(prodSel.value||'');
      if (!prodId){ TOAST('warning','Elegí un lote de producción'); return; }
      const avail = prodMap[prodId]||0;
      if (qty > avail){ TOAST('error','Cantidad mayor al disponible ('+avail+')'); return; }
    }

    try{
      const payload = { source, qty };
      if (source==='PROD') payload.prodId = String(prodSel.value||'');
      const r = await callGAS('scrap', payload);
      if (r && r.ok){
        TOAST('success','Scrap guardado');
        // refresco datos
        await Promise.all([ loadScraps(), loadProductions(), loadEmptyStock() ]);
        // reset
        form.reset();
        prodPick.style.display = 'none';
        emptyAvail.style.display = '';
      } else {
        if (r && r.error === 'OVER_SCRAP'){
          TOAST('error', 'Cantidad mayor al disponible');
        } else {
          TOAST('error', (r && r.error) || 'No se pudo guardar');
        }
      }
    }catch(e){ console.error(e); TOAST('error','Error de red'); }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    form.addEventListener('submit', onSubmit);
    reloadMovsBtn.addEventListener('click', loadScraps);
    await Promise.all([ loadProductions(), loadScraps(), loadEmptyStock() ]);
    // Modo inicial: EMPTY
    emptyAvail.style.display = '';
  });
})();
