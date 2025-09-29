// js/movements.js (Supabase)
(function(){
  'use strict';

  const qs  = (s, r)=> (r||document).querySelector(s);
  const on  = (el, ev, fn)=> el && el.addEventListener(ev, fn, false);
  const fmtInt = n => (Number(n||0)||0).toString();

  function fmtDateAR(iso){
    if (!iso) return '';
    const d = new Date(iso);
    const offMin = 3*60; // -03:00
    const ms = d.getTime() - offMin*60*1000;
    const a = new Date(ms);
    const DD = String(a.getUTCDate()).padStart(2,'0');
    const MM = String(a.getUTCMonth()+1).padStart(2,'0');
    const YYYY = a.getUTCFullYear();
    const HH = String(a.getUTCHours()).padStart(2,'0');
    const Min = String(a.getUTCMinutes()).padStart(2,'0');
    return `${DD}-${MM}-${YYYY} ${HH}:${Min}`;
  }

  function waitForSB(timeoutMs=7000){
    return new Promise((res, rej)=>{
      const t0 = Date.now();
      (function spin(){
        if (window.SB && window.SBData) return res();
        if (Date.now() - t0 > timeoutMs) return rej(new Error('SB timeout'));
        setTimeout(spin, 60);
      })();
    });
  }

  const Toast = Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false, timer:2200, timerProgressBar:true });

  const STATE = {
    page: 1,
    pageSize: 20,
    total: 0,
    type: ''
  };

  // UI refs
  const tblBody   = qs('#movsTable tbody');
  const pageInfo  = qs('#pageInfo');
  const prevBtn   = qs('#prevPage');
  const nextBtn   = qs('#nextPage');
  const refreshBt = qs('#refreshMovs');
  const typeSel   = qs('#typeFilter');
  const sizeSel   = qs('#pageSize');
  const activeBox = qs('#activeFilters');

  function renderRows(items){
    if (!tblBody) return;
    if (!items || !items.length){
      tblBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px;">Sin datos</td></tr>';
      return;
    }
    tblBody.innerHTML = items.map(it=>{
      const id  = it.id||'';
      const ref = it.refId||'';
      return `
        <tr>
          <td><span title="${id.replace(/"/g,'&quot;')}">${id.slice(0,8)}</span></td>
          <td>${it.type||''}</td>
          <td><span title="${ref.replace(/"/g,'&quot;')}">${ref ? ref.slice(0,8) : ''}</span></td>
          <td>${fmtInt(it.qty)}</td>
          <td>${it.provider||''}</td>
          <td>${it.lot||''}</td>
          <td>${fmtDateAR(it.dateTime)}</td>
        </tr>
      `;
    }).join('');
  }

  function updatePager(){
    const pages = Math.max(1, Math.ceil(STATE.total / STATE.pageSize));
    if (pageInfo) pageInfo.textContent = `Página ${STATE.page} de ${pages} (${STATE.total} registros)`;
    if (prevBtn) prevBtn.disabled = (STATE.page<=1);
    if (nextBtn) nextBtn.disabled = (STATE.page>=pages);
  }

  function updateActiveFilterUI(){
    if (!activeBox) return;
    activeBox.innerHTML = '';
    if (!STATE.type){ activeBox.style.display='none'; return; }
    activeBox.style.display='flex';
    const chip = document.createElement('div');
    chip.className = 'btn ghost';
    chip.style.cursor = 'default';
    chip.style.display = 'inline-flex';
    chip.style.alignItems = 'center';
    chip.style.gap = '8px';
    chip.innerHTML = `<span>Filtro: ${STATE.type}</span>`;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'icon-btn';
    x.setAttribute('aria-label','Quitar filtro');
    x.textContent = '✕';
    x.onclick = ()=>{
      STATE.type = '';
      if (typeSel) typeSel.value = '';
      STATE.page = 1;
      updateActiveFilterUI();
      loadPage();
    };
    chip.appendChild(x);
    activeBox.appendChild(chip);
  }

  async function loadPage(){
    try{
      if (refreshBt) refreshBt.disabled = true;
      const sz = sizeSel ? Number(sizeSel.value||20) : 20;
      STATE.pageSize = sz;

      const res = await window.SBData.listMovements({
        page: STATE.page, pageSize: STATE.pageSize,
        type: STATE.type || ''
      });
      STATE.total = Number(res.total||0);
      renderRows(res.items||[]);
      updatePager();
    }catch(err){
      console.error('[movements]', err);
      renderRows([]);
      Toast.fire({ icon:'error', title:'No se pudo cargar' });
    }finally{
      if (refreshBt) refreshBt.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      await waitForSB();

      // init filter (si viene por query ?type=...)
      const q = new URLSearchParams(location.search);
      STATE.type = q.get('type') || '';
      if (typeSel && STATE.type) typeSel.value = STATE.type;
      updateActiveFilterUI();

      on(prevBtn, 'click', ()=>{ if (STATE.page>1){ STATE.page--; loadPage(); }});
      on(nextBtn, 'click', ()=>{
        const pages = Math.max(1, Math.ceil(STATE.total/STATE.pageSize));
        if (STATE.page<pages){ STATE.page++; loadPage(); }
      });
      on(refreshBt, 'click', ()=> loadPage());
      on(sizeSel, 'change', ()=>{ STATE.page=1; loadPage(); });
      on(typeSel, 'change', ()=>{
        STATE.type = typeSel.value || '';
        STATE.page = 1;
        updateActiveFilterUI();
        loadPage();
      });

      loadPage();
    }catch(err){
      console.error('[init movements]', err);
      Swal.fire('Error','No pude inicializar Movimientos','error');
    }
  });
})();
