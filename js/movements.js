(function(){
  'use strict';

  var WEB_APP_URL = (window.GAS_WEB_APP_URL || '');

  function $(sel, el){ if(!el) el=document; return el.querySelector(sel); }
  function TOAST(icon, title){
    return Swal.fire({ toast:true, position:'top-end', icon:icon, title:title, showConfirmButton:false, timer:2000, timerProgressBar:true });
  }

  var tbl = $('#movsTable tbody');
  var pagerInfo = $('#pageInfo');
  var prevBtn = $('#prevPage');
  var nextBtn = $('#nextPage');
  var refreshBtn = $('#refreshMovs');
  var typeFilter = $('#typeFilter');
  var pageSizeSel = $('#pageSize');

  var state = { page: 1, pageSize: 20, total: 0, type: '' };

  async function callGAS(action, payload){
    if (!WEB_APP_URL || WEB_APP_URL.indexOf('PUT_')===0){
      TOAST('warning','Configurá la URL del Web App en movements.html');
      return { ok:false, error:'MISSING_WEB_APP_URL' };
    }
    var body = new URLSearchParams();
    body.set('action', action);
    body.set('payload', JSON.stringify(payload||{}));
    try{
      var res = await fetch(WEB_APP_URL, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body: body });
      var text = await res.text();
      if(!res.ok) return { ok:false, error:'HTTP_'+res.status, raw:text };
      try { return JSON.parse(text); } catch(e){ return { ok:false, error:'INVALID_JSON', raw:text }; }
    }catch(err){ return { ok:false, error:String(err) }; }
  }

  function renderRows(items){
    if(!tbl) return;
    if(!items || !items.length){
      tbl.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px;">Sin datos</td></tr>';
      return;
    }

    function short(v){ return v ? String(v).substring(0,8) : ''; }
    function fmtDate(dateStr){
      if(!dateStr) return '';
      var d = new Date(dateStr);
      if(isNaN(d.getTime())) return dateStr; // fallback si no parsea
      var dd = String(d.getDate()).padStart(2,'0');
      var mm = String(d.getMonth()+1).padStart(2,'0');
      var yy = String(d.getFullYear()).slice(-2);
      var hh = String(d.getHours()).padStart(2,'0');
      var mi = String(d.getMinutes()).padStart(2,'0');
      return `${dd}/${mm}/${yy} ${hh}:${mi}`;
    }

    var out = [];
    for(var i=0;i<items.length;i++){
      var it = items[i];
      var fullId = it.id || '';
      var fullRef = it.refId || '';
      var shortId = short(fullId);
      var shortRef = short(fullRef);
      var dateStr = it.dateTime || '';
      var formattedDate = fmtDate(dateStr);

      out.push('<tr>',
        // Tooltip con el valor completo
        '<td><span title="', fullId.replace(/"/g,'&quot;'), '">', shortId, '</span></td>',
        '<td>', (it.type||''), '</td>',
        '<td><span title="', fullRef.replace(/"/g,'&quot;'), '">', shortRef, '</span></td>',
        '<td>', (it.qty!=null?it.qty:''), '</td>',
        '<td>', (it.provider||''), '</td>',
        '<td>', (it.lot||''), '</td>',
        // Si querés tooltip con la fecha original, descomentá la línea con <span title=...>
        // '<td><span title="', dateStr.replace(/"/g,'&quot;'), '">', formattedDate, '</span></td>',
        '<td>', formattedDate, '</td>',
      '</tr>');
    }
    tbl.innerHTML = out.join('');
  }

  function updatePager(){
    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if(state.page > pages) state.page = pages;
    if(pagerInfo) pagerInfo.textContent = 'Página ' + state.page + ' de ' + pages + ' (' + state.total + ' registros)';
    if(prevBtn) prevBtn.disabled = (state.page <= 1);
    if(nextBtn) nextBtn.disabled = (state.page >= pages);
  }

  async function loadPage(){
    if(refreshBtn) refreshBtn.disabled = true;
    var r = await callGAS('listMovements', { page: state.page, pageSize: state.pageSize, type: state.type });
    if(r && r.ok){
      state.total = r.data.total || 0;
      renderRows(r.data.items||[]);
      updatePager();
    }else{
      renderRows([]);
      TOAST('error','No se pudo cargar');
    }
    if(refreshBtn) refreshBtn.disabled = false;
  }

  if(prevBtn) prevBtn.addEventListener('click', function(){
    if(state.page>1){ state.page--; loadPage(); }
  });
  if(nextBtn) nextBtn.addEventListener('click', function(){
    var pages = Math.max(1, Math.ceil(state.total / state.pageSize));
    if(state.page<pages){ state.page++; loadPage(); }
  });
  if(refreshBtn) refreshBtn.addEventListener('click', function(){ loadPage(); });
  if(typeFilter) typeFilter.addEventListener('change', function(){
    state.type = typeFilter.value||''; state.page = 1; loadPage();
  });
  if(pageSizeSel) pageSizeSel.addEventListener('change', function(){
    var n = parseInt(pageSizeSel.value,10) || 20; state.pageSize = n; state.page = 1; loadPage();
  });

  document.addEventListener('DOMContentLoaded', function(){
    loadPage();
  });
})();