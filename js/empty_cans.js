// js/empty_cans.js
(function(){
  'use strict';

  const WEB_APP_URL = (window.GAS_WEB_APP_URL || (window.getAppConfig && getAppConfig('GAS_WEB_APP_URL')) || '');

  function $(sel, el){ if(!el) el=document; return el.querySelector(sel); }
  function TOAST(icon, title){
    return Swal.fire({ toast:true, position:'top-end', icon, title, showConfirmButton:false, timer:2000, timerProgressBar:true });
  }
  function short(v){ return v ? String(v).substring(0,8) : ''; }
  function fmtDate(dateStr){
    if(!dateStr) return '';
    const d = new Date(dateStr);
    if(isNaN(d.getTime())) return dateStr;
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  }

  async function callGAS(action, payload){
    const body = new URLSearchParams();
    body.set('action', action);
    body.set('payload', JSON.stringify(payload||{}));
    const res = await fetch(WEB_APP_URL, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
    const text = await res.text();
    if(!res.ok) return { ok:false, error:'HTTP_'+res.status, raw:text };
    try { return JSON.parse(text); } catch(e){ return { ok:false, error:'INVALID_JSON', raw:text }; }
  }

  // DOM
  const totalEl   = $('#emptyCansTotal');
  const tblBody   = $('#emptyTable tbody');
  const pageSizeSel = $('#pageSize');
  const refreshBtn  = $('#refreshBtn');
  const pageInfo  = $('#pageInfo');
  const prevBtn   = $('#prevPage');
  const nextBtn   = $('#nextPage');

  const addBtn    = $('#addEmptyBtn');
  const modal     = $('#modal');
  const backdrop  = $('#backdrop');
  const form      = $('#emptyForm');
  const cancelBtn = $('#cancelBtn');
  const submitBtn = $('#submitBtn');

  const state = {
    page: 1,
    pageSize: Number((pageSizeSel && pageSizeSel.value) || 20),
    total: 0,
    // Para traer todas las operaciones de latas vacías:
    typePrefix: 'EMPTY_CANS_',
    // Para cargar inicialmente la última página (más recientes arriba)
    firstLoadJumped: false
  };

  // ====== KPI ======
  async function loadKPI(){
    const r = await callGAS('getSummaryCounts', {});
    if (r && r.ok){
      totalEl.textContent = r.data && typeof r.data.emptyCansTotal === 'number'
        ? r.data.emptyCansTotal
        : 0;
    }
  }

  // ====== Tabla Movimientos (solo EMPTY_CANS_*) ======
  function renderRows(items){
    if (!tblBody) return;
    if (!items || !items.length){
      tblBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px;">Sin datos</td></tr>';
      return;
    }
    const out = [];
    for (const it of items){
      const fullId  = it.id || '';
      const fullRef = it.refId || '';
      out.push(
        '<tr>',
          '<td><span title="', fullId.replace(/"/g,'&quot;'), '">', short(fullId), '</span></td>',
          '<td>', (it.type||''), '</td>',
          '<td><span title="', fullRef.replace(/"/g,'&quot;'), '">', short(fullRef), '</span></td>',
          '<td>', (it.qty!=null?it.qty:''), '</td>',
          '<td>', (it.provider||''), '</td>',
          '<td>', (it.lot||''), '</td>',
          '<td>', fmtDate(it.dateTime||''), '</td>',
        '</tr>'
      );
    }
    tblBody.innerHTML = out.join('');
  }

  function updatePager(){
    const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if (state.page > pages) state.page = pages;
    if (pageInfo) pageInfo.textContent = `Página ${state.page} de ${pages} (${state.total} registros)`;
    if (prevBtn) prevBtn.disabled = (state.page <= 1);
    if (nextBtn) nextBtn.disabled = (state.page >= pages);
  }

  async function loadPage(){
    if (refreshBtn) refreshBtn.disabled = true;

    // Si es la primera vez, salto a la última página para ver "lo más reciente"
    if (!state.firstLoadJumped){
      const r0 = await callGAS('listMovements', { page: 1, pageSize: state.pageSize, typePrefix: state.typePrefix });
      if (r0 && r0.ok){
        state.total = r0.data.total || 0;
        state.page  = Math.max(1, Math.ceil(state.total / state.pageSize));
        state.firstLoadJumped = true;
      }
    }

    // ahora traigo la página solicitada
    const r = await callGAS('listMovements', {
      page: state.page,
      pageSize: state.pageSize,
      typePrefix: state.typePrefix
    });

    if (r && r.ok){
      state.total = r.data.total || 0;

      // Queremos “más recientes arriba”: como el backend devuelve del más viejo al más nuevo,
      // invertimos el orden SOLO dentro de la página y recorremos desde la última página hacia atrás.
      const items = Array.isArray(r.data.items) ? r.data.items.slice().reverse() : [];
      renderRows(items);
      updatePager();
    } else {
      renderRows([]);
      TOAST('error', 'No se pudo cargar');
    }

    if (refreshBtn) refreshBtn.disabled = false;
  }

  // ====== Modal ======
  function openModal(){
    if (form) form.reset();
    if (submitBtn) submitBtn.disabled = false;
    if (modal) modal.setAttribute('aria-hidden','false');
    if (backdrop) backdrop.setAttribute('aria-hidden','false');
  }
  function closeModal(){
    if (modal) modal.setAttribute('aria-hidden','true');
    // si no hay otros modales abiertos, cierro backdrop
    const anyOpen = document.querySelector('.modal[aria-hidden="false"]');
    if (!anyOpen && backdrop) backdrop.setAttribute('aria-hidden','true');
  }

  // ====== Bindings ======
  document.addEventListener('DOMContentLoaded', async function(){
    // KPI
    loadKPI();

    // Botón abrir modal
    if (addBtn) addBtn.addEventListener('click', openModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', (ev)=>{ if(ev.key==='Escape') closeModal(); });

    // Submit alta
    if (form){
      form.addEventListener('submit', async function(ev){
        ev.preventDefault();
        if (!submitBtn || submitBtn.disabled) return;
        submitBtn.disabled = true;

        const fd = new FormData(form);
        const qty = Number(fd.get('qty'));
        const provider = String(fd.get('provider')||'').trim();
        const lot = String(fd.get('lot')||'').trim();
        if (!qty || !provider || !lot){
          TOAST('warning','Completá todos los campos'); submitBtn.disabled=false; return;
        }

        const resp = await callGAS('addEmptyCans', { qty, provider, lot });
        if (resp && resp.ok){
          TOAST('success','Ingreso registrado');
          closeModal();
          await loadKPI();

          // tras grabar, saltá a la última página y recargá
          state.firstLoadJumped = false;
          await loadPage();
        } else {
          TOAST('error','No se pudo registrar');
          submitBtn.disabled = false;
        }
      });
    }

    // Paginación (recordá que estamos navegando “hacia atrás” en el tiempo)
    if (prevBtn) prevBtn.addEventListener('click', async function(){
      // prev = ir a una página más reciente (hacia el final)
      const pages = Math.max(1, Math.ceil(state.total / state.pageSize));
      if (state.page < pages){ state.page++; await loadPage(); }
    });
    if (nextBtn) nextBtn.addEventListener('click', async function(){
      // next = ir a una página más vieja (hacia el inicio)
      if (state.page > 1){ state.page--; await loadPage(); }
    });

    if (refreshBtn) refreshBtn.addEventListener('click', async function(){ await loadPage(); });
    if (pageSizeSel) pageSizeSel.addEventListener('change', async function(){
      state.pageSize = Number(pageSizeSel.value) || 20;
      state.firstLoadJumped = false; // recalcular “última página” con el nuevo tamaño
      await loadPage();
    });

    // Carga inicial
    await loadPage();
  });

})();
