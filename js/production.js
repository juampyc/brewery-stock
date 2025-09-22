// js/production.js
(function () {
  'use strict';

  var WEB_APP_URL =
    window.GAS_WEB_APP_URL ||
    (window.getAppConfig && getAppConfig('GAS_WEB_APP_URL')) ||
    '';

  function $(sel, el) { return (el || document).querySelector(sel); }
  function TOAST(icon, title) {
    return Swal.fire({
      toast: true, position: 'top-end', icon, title,
      showConfirmButton: false, timer: 2000, timerProgressBar: true
    });
  }
  function short(v) { return v ? String(v).substring(0, 8) : ''; }

  // Tabla + pager
  var tbl = $('#prodTable tbody');
  var pagerInfo = $('#pageInfo'), prevBtn = $('#prevPage'), nextBtn = $('#nextPage');
  var refreshBtn = $('#refreshBtn'), pageSizeSel = $('#pageSize');
  var state = { page: 1, pageSize: 20, total: 0 };

  // Mapa estilos legibles
  var STYLE_MAP = {}; // key: brandId|styleId -> { brandName, name }

  // ===== Modales =====
  var backdrop;

  // Nueva producción
  var newBtn, newModal, closeNewBtn, cancelNewBtn, newForm, submitNewBtn, prodStyleCombo, prodStylePreview;

  // Etiquetado (nuevo modal)
  var labelModal, closeLabelBtn, cancelLabelBtn, labelForm, submitLabelBtn;
  var sameStyleNameEl, sameStyleInfoEl, customGroupEl, customSelectEl;

  // Guardamos contexto de la producción que se está etiquetando
  var CURRENT_PROD = { id: '', brandId: '', styleId: '', qty: 0 };

  function modalOpen(modal){
    if(!modal) return;
    modal.setAttribute('aria-hidden','false');
    if (backdrop) backdrop.setAttribute('aria-hidden','false');
  }
  function modalClose(modal){
    if(!modal) return;
    modal.setAttribute('aria-hidden','true');
    var anyOpen = document.querySelector('.modal[aria-hidden="false"]');
    if (!anyOpen && backdrop) backdrop.setAttribute('aria-hidden','true');
  }

  // ===== GAS =====
  async function callGAS(action, payload){
    var body = new URLSearchParams();
    body.set('action', action);
    body.set('payload', JSON.stringify(payload||{}));
    try{
      var res = await fetch(WEB_APP_URL, {
        method:'POST',
        headers:{'Content-Type':'application/x-www-form-urlencoded'},
        body
      });
      var text = await res.text();
      if (!res.ok) return { ok:false, error:'HTTP_'+res.status, raw:text };
      try { return JSON.parse(text); } catch(e){ return { ok:false, error:'INVALID_JSON', raw:text }; }
    }catch(err){ return { ok:false, error:String(err) }; }
  }

  async function loadStyleMap(){
    var r = await callGAS('listStyles', {});
    STYLE_MAP = {};
    if (r && r.ok && Array.isArray(r.data)){
      r.data.forEach(function(it){
        var k = (it.brandId||'') + '|' + (it.styleId||'');
        STYLE_MAP[k] = { brandName: it.brandName||'', name: it.name||'' };
      });
    }
  }

  // ===== Select estilos para "Nueva producción" =====
  async function loadStylesForNew(){
    if(!prodStyleCombo) return;
    prodStyleCombo.innerHTML = '<option value="">Cargando...</option>';
    var r = await callGAS('listStyles', {});
    if (!r || !r.ok){ prodStyleCombo.innerHTML = '<option value="">No se pudo cargar</option>'; return; }
    var items = Array.isArray(r.data)? r.data : [];
    if (!items.length){ prodStyleCombo.innerHTML = '<option value="">Sin datos</option>'; return; }

    var opts = ['<option value="">Seleccionar marca/estilo</option>'];
    for (var i=0;i<items.length;i++){
      var it = items[i];
      var val = (it.brandId||'') + '|' + (it.styleId||'');
      var label = [it.brandName||'', it.name||''].filter(Boolean).join(' - ');
      opts.push('<option value="'+val+'">'+label+'</option>');
    }
    prodStyleCombo.innerHTML = opts.join('');
    prodStyleCombo.addEventListener('change', function(){
      var v = prodStyleCombo.value;
      if (prodStylePreview){
        if (!v) { prodStylePreview.textContent = ''; return; }
        var parts = v.split('|'); var k = (parts[0]||'') + '|' + (parts[1]||'');
        var it = STYLE_MAP[k] || {};
        prodStylePreview.textContent = it.brandName && it.name
          ? ('Seleccionado: ' + it.brandName + ' · ' + it.name)
          : '';
      }
    });
  }

  // ===== Custom labels loader (solo nombres personalizados con stock/independiente del stock) =====
  async function loadCustomLabelNames(){
    // Usamos labelsSummary y tomamos los que vienen como "Personalizada"
    var r = await callGAS('labelsSummary', {});
    var names = [];
    if (r && r.ok && Array.isArray(r.data)){
      r.data.forEach(function(row){
        if ((row.marca||'').toLowerCase() === 'personalizada' && row.estilo){
          names.push(row.estilo);
        }
      });
    }
    // Si no hubiese ninguna personalizada en stock, al menos dejamos seleccionar algo manual?
    // Por ahora solo mostramos las existentes:
    names.sort(function(a,b){ return a.localeCompare(b); });
    return names;
  }

  // ===== Render listado =====
  function resolveNames(brandId, styleId, labelName, status, labelStyleId){
    var k  = (brandId||'') + '|' + (styleId||'');
    var bn = (STYLE_MAP[k] && STYLE_MAP[k].brandName) || brandId || '';
    var baseStyle = (STYLE_MAP[k] && STYLE_MAP[k].name) || styleId || '';

    var isCustom = !!labelName && !labelStyleId; // personalizada si no hay styleId
    var sn = baseStyle;

    if (isCustom) {
      // Mostrar: Estilo base | Nombre etiqueta personalizada
      sn = (baseStyle ? (baseStyle + ' | ') : '') + labelName;
    } else if ((status||'').toUpperCase() === 'ETIQUETADO' && labelName) {
      // Mismo estilo (no personalizada): si querés priorizar el nombre de la etiqueta
      sn = labelName;
    }

    return { brandName: bn, styleName: sn };
  }


  function badge(status){
    var s = (status||'').toUpperCase();
    return '<span class="badge '+s+'"><span class="dot"></span>'+s+'</span>';
  }

  function renderRows(items){
    if (!items || !items.length){
      tbl.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;">Sin datos</td></tr>';
      return;
    }
    var out = [];
    for (var i=0;i<items.length;i++){
      var it = items[i];
      var id = String(it.id||'');
      var qty = Number(it.qty||0);
      var status = String(it.status||'');
      var names = resolveNames(it.brandId, it.styleId, it.labelName, status, it.labelStyleId);

      // flags (vienen desde GAS) + fallback por estado
      var visitedP = !!it.visitedP || status === 'PAUSTERIZADO';
      var visitedE = !!it.visitedE || status === 'ETIQUETADO';

      var canP = status !== 'FINAL' && !visitedP;
      var canE = status !== 'FINAL' && !visitedE;
      var canF = status !== 'FINAL' && (visitedP || visitedE || status==='PAUSTERIZADO' || status==='ETIQUETADO');

      out.push(
        '<tr>',
          '<td><span title="', id.replace(/"/g,'&quot;'), '">', short(id), '</span></td>',
          '<td>', names.brandName || '—', '</td>',
          '<td>', names.styleName || '—', '</td>',
          '<td>', qty, '</td>',
          '<td>', badge(status), '</td>',
          '<td>',
            '<button class="btn ghost" data-act="to-p" data-id="', id, '" ',
              canP? '' : 'disabled aria-disabled="true"', '>Pausterizar</button> ',
            '<button class="btn ghost" data-act="to-e" data-id="', id,
              '" data-brand="', (it.labelBrandId||it.brandId||''),
              '" data-style="', (it.labelStyleId||it.styleId||''),
              '" data-qty="', qty, '" ',
              canE? '' : 'disabled aria-disabled="true"', '>Etiquetar</button> ',
            '<button class="btn ghost" data-act="to-f" data-id="', id, '" ',
              canF? '' : 'disabled aria-disabled="true"', '>Final</button>',
          '</td>',
        '</tr>'
      );
    }
    tbl.innerHTML = out.join('');

    // acciones
    tbl.querySelectorAll('button[data-act]').forEach(function(btn){
      btn.addEventListener('click', async function(){
        var act = this.getAttribute('data-act');
        var id  = this.getAttribute('data-id');
        this.disabled = true;
        try{
          if (act === 'to-p'){
            var r1 = await callGAS('advanceProduction', { prodId:id, to:'PAUSTERIZADO' });
            if (r1 && r1.ok){ TOAST('success','Pasó a Pausterizado'); await loadPage(); }
            else { TOAST('error','No se pudo avanzar'); this.disabled=false; }
          } else if (act === 'to-e'){
            // abrimos modal con contexto
            CURRENT_PROD = {
              id: id,
              brandId: String(this.getAttribute('data-brand')||''),
              styleId: String(this.getAttribute('data-style')||''),
              qty: Number(this.getAttribute('data-qty')||0)
            };
            await openLabelModal();
            this.disabled = false;
          } else if (act === 'to-f'){
            var r2 = await callGAS('advanceProduction', { prodId:id, to:'FINAL' });
            if (r2 && r2.ok){
              TOAST('success', (r2.data && r2.data.merged) ? 'Finalizado (fusionado por estilo)' : 'Producción finalizada');
              await loadPage();
            } else { TOAST('error','No se pudo avanzar'); this.disabled=false; }
          }
        }catch(_){ this.disabled = false; }
      });
    });
  }

  function updatePager(){
    var pages = Math.max(1, Math.ceil(state.total/state.pageSize));
    if (state.page>pages) state.page = pages;
    pagerInfo.textContent = 'Página '+state.page+' de '+pages+' ('+state.total+' registros)';
    prevBtn.disabled = (state.page<=1);
    nextBtn.disabled = (state.page>=pages);
  }

  async function loadPage(){
    if (refreshBtn) refreshBtn.disabled = true;
    if (!Object.keys(STYLE_MAP).length) await loadStyleMap();
    var r = await callGAS('listProductions', { page:state.page, pageSize:state.pageSize });
    if (r && r.ok){
      state.total = r.data.total||0;
      renderRows(r.data.items||[]);
      updatePager();
    } else {
      renderRows([]); TOAST('error','No se pudo cargar');
    }
    if (refreshBtn) refreshBtn.disabled = false;
  }

  // ===== Nueva producción =====
  function openNew(){
    if (!newModal) return;
    if (newForm) newForm.reset();
    if (submitNewBtn) submitNewBtn.disabled = false;
    loadStylesForNew();
    modalOpen(newModal);
  }
  function closeNewModal(){ modalClose(newModal); }

  // ===== Etiquetado =====
  async function openLabelModal(){
    if (!labelModal) return;

    // Mismo estilo: mostrar nombre legible
    var k = (CURRENT_PROD.brandId||'') + '|' + (CURRENT_PROD.styleId||'');
    var readable = STYLE_MAP[k] || {};
    if (sameStyleNameEl){
      var txt = (readable.brandName && readable.name) ? (readable.brandName + ' · ' + readable.name) : '—';
      sameStyleNameEl.textContent = txt;
    }

    // Cargar personalizadas
    if (customSelectEl){
      customSelectEl.innerHTML = '<option value="">Cargando...</option>';
      var names = await loadCustomLabelNames();
      var opts = ['<option value="">Seleccionar etiqueta personalizada</option>'];
      names.forEach(function(n){ opts.push('<option value="'+n+'">'+n+'</option>'); });
      if (!names.length){ opts = ['<option value="">No hay personalizadas</option>']; }
      customSelectEl.innerHTML = opts.join('');
    }

    // reset UI
    var sameRadio = labelForm.querySelector('input[name="labelMode"][value="same"]');
    if (sameRadio) sameRadio.checked = true;
    if (sameStyleInfoEl) sameStyleInfoEl.style.display = '';
    if (customGroupEl) customGroupEl.style.display = 'none';

    modalOpen(labelModal);
  }
  function closeLabeling(){ modalClose(labelModal); }

  // ===== Formularios =====
  function bindForms(){
    // Nueva producción
    if (newForm){
      newForm.addEventListener('submit', async function(ev){
        ev.preventDefault();
        if (!submitNewBtn || submitNewBtn.disabled) return;
        submitNewBtn.disabled = true;

        var fd = new FormData(newForm);
        var qty = Number(fd.get('qty'));
        var comboVal = String(fd.get('styleCombo')||'');
        if (!qty || !comboVal){
          TOAST('warning','Completá cantidad y estilo'); submitNewBtn.disabled=false; return;
        }
        var parts = comboVal.split('|');
        var brandId = parts[0]||'', styleId = parts[1]||'';

        var resp = await callGAS('createProduction', { qty, brandId, styleId });
        if (resp && resp.ok){
          TOAST('success','Producción creada (ENLATADO)');
          closeNewModal();
          if (newForm) newForm.reset();
          state.page = 1;
          await loadPage();
        } else {
          if (resp && resp.error === 'NO_EMPTY_STOCK'){
            TOAST('error','Stock de latas insuficiente. Disponible: '+(resp.available||0));
          } else {
            TOAST('error','No se pudo crear');
          }
          submitNewBtn.disabled=false;
        }
      });
    }

    // Cambios de radio en etiquetado
    if (labelForm){
      labelForm.addEventListener('change', function(ev){
        var t = ev.target;
        if (t && t.name === 'labelMode'){
          var mode = t.value;
          if (mode === 'custom'){
            if (customGroupEl) customGroupEl.style.display = '';
            if (sameStyleInfoEl) sameStyleInfoEl.style.display = 'none';
          } else {
            if (customGroupEl) customGroupEl.style.display = 'none';
            if (sameStyleInfoEl) sameStyleInfoEl.style.display = '';
          }
        }
      });

      // Submit de etiquetado
      labelForm.addEventListener('submit', async function(ev){
        ev.preventDefault();
        if (!submitLabelBtn || submitLabelBtn.disabled) return;
        submitLabelBtn.disabled = true;

        var modeEl = labelForm.querySelector('input[name="labelMode"]:checked');
        var mode = modeEl ? modeEl.value : 'same';

        var labelBrandId = CURRENT_PROD.brandId;
        var labelStyleId = CURRENT_PROD.styleId;
        var labelName = '';

        if (mode === 'same'){
          // mismo estilo: usamos el nombre del estilo original
          var k = (CURRENT_PROD.brandId||'') + '|' + (CURRENT_PROD.styleId||'');
          labelName = (STYLE_MAP[k] && STYLE_MAP[k].name) || '';
        } else {
          // personalizada: brand = producción, styleId vacío, name = selección
          if (!customSelectEl || !customSelectEl.value){
            TOAST('warning','Elegí una etiqueta personalizada'); submitLabelBtn.disabled=false; return;
          }
          labelStyleId = ''; // importante: personalizada
          labelName = customSelectEl.value;
        }

        var r = await callGAS('advanceProduction', {
          prodId: CURRENT_PROD.id,
          to: 'ETIQUETADO',
          labelBrandId, labelStyleId, labelName
        });

        if (r && r.ok){
          TOAST('success', 'Etiquetado OK (consumo de etiquetas)');
          closeLabeling();
          await loadPage();
        } else {
          if (r && r.error === 'NO_LABEL_STOCK'){
            TOAST('error','Stock de etiquetas insuficiente');
          } else if (r && r.error === 'BACKWARD_NOT_ALLOWED_ONCE_VISITED'){
            TOAST('error','No se puede volver a un estado ya visitado');
          } else if (r && r.error === 'MISSING_LABEL_SELECTION'){
            TOAST('error','Falta seleccionar etiqueta');
          } else {
            TOAST('error','No se pudo etiquetar');
          }
          submitLabelBtn.disabled = false;
        }
      });
    }
  }

  // ===== Bind inicial =====
  document.addEventListener('DOMContentLoaded', function(){
    backdrop = $('#backdrop');

    // Nueva producción
    newBtn = $('#newProdBtn'); newModal = $('#newProdModal');
    closeNewBtn = $('#closeNewProd'); cancelNewBtn = $('#cancelNewProd');
    newForm = $('#newProdForm'); submitNewBtn = $('#submitNewProd');
    prodStyleCombo = $('#prodStyleCombo'); prodStylePreview = $('#prodStylePreview');

    if (newBtn) newBtn.addEventListener('click', openNew);
    if (closeNewBtn) closeNewBtn.addEventListener('click', function(){ modalClose(newModal); });
    if (cancelNewBtn) cancelNewBtn.addEventListener('click', function(){ modalClose(newModal); });

    // Etiquetado
    labelModal = $('#labelProdModal');
    closeLabelBtn = $('#closeLabelProd'); cancelLabelBtn = $('#cancelLabelProd');
    labelForm = $('#labelProdForm'); submitLabelBtn = $('#submitLabelProd');
    sameStyleNameEl = $('#sameStyleName');
    sameStyleInfoEl = $('#sameStyleInfo');
    customGroupEl = $('#customLabelGroup');
    customSelectEl = $('#customLabelSelect');

    if (closeLabelBtn) closeLabelBtn.addEventListener('click', closeLabeling);
    if (cancelLabelBtn) cancelLabelBtn.addEventListener('click', closeLabeling);

    // Backdrop cierra
    var bd = $('#backdrop');
    if (bd){
      bd.addEventListener('click', function(){
        modalClose(newModal);
        modalClose(labelModal);
      });
    }
    // ESC
    document.addEventListener('keydown', function(ev){
      if (ev.key === 'Escape'){
        modalClose(newModal);
        modalClose(labelModal);
      }
    });

    // Pager
    if (prevBtn) prevBtn.addEventListener('click', function(){ if (state.page>1){ state.page--; loadPage(); } });
    if (nextBtn) nextBtn.addEventListener('click', function(){ var pages=Math.ceil(state.total/state.pageSize); if(state.page<pages){ state.page++; loadPage(); } });
    if (refreshBtn) refreshBtn.addEventListener('click', loadPage);
    if (pageSizeSel) pageSizeSel.addEventListener('change', function(){ state.pageSize=Number(pageSizeSel.value)||20; state.page=1; loadPage(); });

    bindForms();
    loadPage();
  });
})();
