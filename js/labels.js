// js/labels.js
(function(){
  'use strict';

  var WEB_APP_URL = (window.GAS_WEB_APP_URL || (window.getAppConfig && getAppConfig('GAS_WEB_APP_URL')) || '');
  function $(sel, el){ if(!el) el=document; return el.querySelector(sel); }
  function TOAST(icon, title){
    return Swal.fire({ toast:true, position:'top-end', icon:icon, title:title, showConfirmButton:false, timer:2000, timerProgressBar:true });
  }

  // Summary table (Marca | Estilo | Total)
  var summaryTbody = $('#labelsSummary tbody');

  // Movements table
  var tbl = $('#movsTable tbody');
  var pagerInfo = $('#pageInfo');
  var prevBtn = $('#prevPage');
  var nextBtn = $('#nextPage');
  var refreshBtn = $('#refreshMovs');
  var pageSizeSel = $('#pageSize');

  // Modal
  var labelsModal = $('#labelsModal');
  var backdrop = $('#backdrop');
  var addLabelBtn = $('#addLabelBtn');
  var closeLabelsModal = $('#closeLabelsModal');
  var labelsForm = $('#labelsForm');
  var cancelLabelsBtn = $('#cancelLabelsBtn');
  var submitLabelsBtn = $('#submitLabelsBtn');
  var isCustomChk = $('#isCustomChk');
  var styleCombo = $('#styleCombo');
  var nonCustomFields = $('#nonCustomFields');
  var customFields = $('#customFields');
  var lotInput = labelsForm ? labelsForm.querySelector('input[name="lot"]') : null;
  var nameInput = labelsForm ? labelsForm.querySelector('input[name="name"]') : null;
  var stylePreview = $('#stylePreview');

  var state = { page: 1, pageSize: 20, total: 0 };

  // ==== GAS call
  async function callGAS(action, payload){
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

  // ==== Summary
  function renderSummary(rows){
    // ahora rows puede tener negativos; filtro solo los 0
    rows = (rows || []).filter(r => Number(r.totalQty) !== 0);

    if (!rows.length){
      summaryTbody.innerHTML = '<tr><td colspan="3" class="muted">Sin datos</td></tr>';
      return;
    }
    summaryTbody.innerHTML = rows.map(r => `
      <tr>
        <td>${r.marca}</td>
        <td>${r.estilo}</td>
        <td class="${Number(r.totalQty)<0 ? 'danger' : ''}">${r.totalQty}</td>
      </tr>`).join('');
  }


  async function loadSummary(){
    var r = await callGAS('labelsSummary', {});
    if(r && r.ok) renderSummary(r.data||[]);
    else {
      renderSummary([]);
      TOAST('error','No se pudo cargar resumen');
    }
  }

  // ==== Movements
  function fmtDate(dateStr){
    if(!dateStr) return '';
    var d = new Date(dateStr);
    if(isNaN(d.getTime())) return dateStr;
    var dd = String(d.getDate()).padStart(2,'0');
    var mm = String(d.getMonth()+1).padStart(2,'0');
    var yy = String(d.getFullYear()).slice(-2);
    var hh = String(d.getHours()).padStart(2,'0');
    var mi = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  }
  function short(v){ return v ? String(v).substring(0,8) : ''; }

  function renderRows(items){
    if(!tbl) return;
    if(!items || !items.length){
      tbl.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:18px;">Sin datos</td></tr>';
      return;
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
        '<td><span title="', fullId.replace(/"/g,'&quot;'), '">', shortId, '</span></td>',
        '<td>', (it.type||''), '</td>',
        '<td><span title="', fullRef.replace(/"/g,'&quot;'), '">', shortRef, '</span></td>',
        '<td>', (it.qty!=null?it.qty:''), '</td>',
        '<td>', (it.provider||''), '</td>',
        '<td>', (it.lot||''), '</td>',
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
    // Cargar solo movimientos de etiquetas (LABEL_*)
    const r = await callGAS('listMovements', {
      page: state.page,
      pageSize: state.pageSize,
      typePrefix: 'LABEL_'   // <- clave
    });

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

  // ==== Modal open/close
  function openLabelsModal(){ labelsModal.setAttribute('aria-hidden','false'); backdrop.setAttribute('aria-hidden','false'); labelsForm.reset(); if(submitLabelsBtn) submitLabelsBtn.disabled=false; loadStylesIntoCombo(); }
  function closeLabels(){ labelsModal.setAttribute('aria-hidden','true'); backdrop.setAttribute('aria-hidden','true'); }

  if(addLabelBtn) addLabelBtn.addEventListener('click', openLabelsModal);
  if(closeLabelsModal) closeLabelsModal.addEventListener('click', closeLabels);
  if(cancelLabelsBtn) cancelLabelsBtn.addEventListener('click', closeLabels);
  if(backdrop) backdrop.addEventListener('click', closeLabels);

  if(isCustomChk){
    isCustomChk.addEventListener('change', function(){
      var custom = isCustomChk.checked;
      customFields.style.display = custom? 'block' : 'none';
      nonCustomFields.style.display = custom? 'none' : 'block';
      if(styleCombo) custom ? styleCombo.removeAttribute('required') : styleCombo.setAttribute('required','required');
      updateStylePreviewAndLot();
    });
  }

  // ==== Styles combo (Marca – Estilo)
  var STYLE_INDEX = {}; // key: "brandId|styleId" o "brandId" → {brandId, styleId, name, brandName}

  async function loadStylesIntoCombo(){
    if(!styleCombo) return;
    styleCombo.innerHTML = '<option value="">Cargando...</option>';
    var r = await callGAS('listStyles', {});
    if(!r || !r.ok){
      styleCombo.innerHTML = '<option value="">No se pudo cargar</option>';
      return;
    }
    var items = Array.isArray(r.data)? r.data : [];
    if(!items.length){
      styleCombo.innerHTML = '<option value="">Sin datos en styles</option>';
      return;
    }
    STYLE_INDEX = {};
    var opts = ['<option value="">Seleccionar marca/estilo</option>'];
    for(var i=0;i<items.length;i++){
      var it = items[i];
      var brandId = String(it.brandId||'');
      var styleId = String(it.styleId||'');
      var name    = String(it.name||'');       // nombre del estilo
      var brandNm = String(it.brandName||'');  // nombre de la marca

      var val = styleId ? (brandId + '|' + styleId) : brandId;
      STYLE_INDEX[val] = { brandId: brandId, styleId: styleId, name: name, brandName: brandNm };

      // 👇 etiqueta visible solo con nombres legibles
      var label = [brandNm, name].filter(Boolean).join(' - ');
      opts.push('<option value="'+val+'">'+label+'</option>');
    }
    styleCombo.innerHTML = opts.join('');

    // preview y sugerencia de lote
    updateStylePreviewAndLot();
    styleCombo.addEventListener('change', updateStylePreviewAndLot);
    if(nameInput) nameInput.addEventListener('input', updateStylePreviewAndLot);
  }

  function yyyymm(d){ var y=d.getFullYear(); var m=d.getMonth()+1; return y + (m<10?('0'+m):m); }
  function sanitizeToken(s){ return String(s||'').trim().replace(/\s+/g,'').replace(/[^A-Za-z0-9_-]/g,'').toUpperCase(); }

  function currentSuggestion(isCustom, it){
    var brand = it && it.brandName ? sanitizeToken(it.brandName) : 'GEN';
    var suffix = 'GEN';
    if(isCustom && nameInput && nameInput.value){
      suffix = sanitizeToken(nameInput.value);
    } else if (it) {
      suffix = it.name ? sanitizeToken(it.name) : 'GEN';
    }
    return 'L-ETI-' + brand + '-' + suffix + '-' + yyyymm(new Date());
  }

  function updateStylePreviewAndLot(){
    var custom = !!(isCustomChk && isCustomChk.checked);
    if(custom){
      if(stylePreview){
        var txt = 'Personalizada';
        if(nameInput && nameInput.value) txt += ': ' + nameInput.value;
        stylePreview.textContent = txt;
      }
      if(lotInput) lotInput.placeholder = currentSuggestion(true, null);
      return;
    }
    if(!styleCombo) return;
    var val = styleCombo.value || '';
    var it = STYLE_INDEX[val];
    if(!it){
      if(stylePreview) stylePreview.textContent = '';
      if(lotInput) lotInput.placeholder = 'Ej: L-ETI-CASTELO-IPA-202509';
      return;
    }
    if(stylePreview) stylePreview.textContent = 'Seleccionado: ' + [it.brandName, it.name].filter(Boolean).join(' · ');
    if(lotInput){
      var suggestion = currentSuggestion(false, it);
      lotInput.placeholder = suggestion;
      if(!lotInput.value) lotInput.value = suggestion;
    }
  }

  // ==== Submit etiquetas
  if(labelsForm){
    labelsForm.addEventListener('submit', async function(ev){
      ev.preventDefault();
      if(!submitLabelsBtn || submitLabelsBtn.disabled) return;
      submitLabelsBtn.disabled = true;

      var fd = new FormData(labelsForm);
      var qty = Number(fd.get('qty'));
      var provider = String(fd.get('provider')||'').trim();
      var lot = String(fd.get('lot')||'').trim();
      var isCustom = !!fd.get('isCustom');

      if(!qty || !provider || !lot){
        TOAST('warning','Completá cantidad, proveedor y lote');
        submitLabelsBtn.disabled=false;
        return;
      }

      var brandId = '', styleId = '', name = '';
      if(isCustom){
        name = String(fd.get('name')||'').trim();
        if(!name){
          TOAST('warning','Ingresá el nombre de la etiqueta personalizada');
          submitLabelsBtn.disabled=false;
          return;
        }
      } else {
        var comboVal = String(fd.get('styleCombo')||'');
        if(!comboVal){
          TOAST('warning','Seleccioná marca/estilo');
          submitLabelsBtn.disabled=false;
          return;
        }
        if(comboVal.indexOf('|')!==-1){
          var parts = comboVal.split('|');
          brandId = parts[0]||'';
          styleId = parts[1]||'';
        } else {
          brandId = comboVal;
          styleId = '';
        }
        var it = STYLE_INDEX[comboVal];
        if(it && it.name) name = it.name;
      }

      var resp = await callGAS('addLabel', { qty, provider, lot, isCustom, brandId, styleId, name });
      if(resp && resp.ok){
        TOAST('success','Etiquetas registradas');
        closeLabels();
        await loadSummary();
        await loadPage();
      }else{
        TOAST('error','No se pudo guardar');
        submitLabelsBtn.disabled=false;
      }
    });
  }

  // ==== Eventos de paginación
  if(prevBtn) prevBtn.addEventListener('click', function(){ if(state.page>1){ state.page--; loadPage(); } });
  if(nextBtn) nextBtn.addEventListener('click', function(){ var pages=Math.max(1, Math.ceil(state.total/state.pageSize)); if(state.page<pages){ state.page++; loadPage(); } });
  if(refreshBtn) refreshBtn.addEventListener('click', function(){ loadSummary(); loadPage(); });
  if(pageSizeSel) pageSizeSel.addEventListener('change', function(){ state.pageSize=parseInt(pageSizeSel.value,10)||20; state.page=1; loadPage(); });

  document.addEventListener('DOMContentLoaded', function(){
    loadSummary();
    loadPage();
  });
})();
