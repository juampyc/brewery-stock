// js/production.js
(function(){
  'use strict';

  // ---- helpers ----
  function qs(sel, root){ return (root||document).querySelector(sel); }
  function qsa(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function on(el, ev, fn){ el && el.addEventListener(ev, fn, false); }
  function fmtInt(n){ n = Number(n||0) || 0; return n.toString(); }
  function waitForSB(timeoutMs){
    return new Promise(function(resolve, reject){
      var t0 = Date.now();
      (function spin(){
        if (window.SB && window.SBData){ return resolve(); }
        if (Date.now() - t0 > (timeoutMs||5000)) return reject(new Error('SB timeout'));
        setTimeout(spin, 60);
      })();
    });
  }

  // ---- state ----
  var STATE = {
    page: 1,
    pageSize: 20,
    total: 0,
    items: [],
    styleMap: {},   // key "brandId|styleId" -> { brandId, styleId, name, color, brandName }
    brandMap: {},   // id -> name
    byId: {},       // id -> item (para acciones)
    allStyles: [],  // [{brandId, styleId, name, brandName, color, productionStyle}]
    brands: []      // [{id,name}]
  };

  // ---- modals ----
  function showModal(id){
    var m = qs('#'+id); var bd = qs('#backdrop');
    if (!m) return;
    m.removeAttribute('inert');
    m.setAttribute('aria-hidden','false');
    if (bd) bd.classList.add('show');
    var f = m.querySelector('input,select,button,textarea,[tabindex]');
    if (f) setTimeout(function(){ try{ f.focus(); }catch(_){ } }, 0);
  }
  function hideModal(id){
    var m = qs('#'+id); var bd = qs('#backdrop');
    if (!m) return;
    if (m.contains(document.activeElement)) { try { document.activeElement.blur(); } catch(_){ } }
    m.setAttribute('aria-hidden','true');
    m.setAttribute('inert','');
    if (bd) bd.classList.remove('show');
    if (hideModal._lastOpener && document.body.contains(hideModal._lastOpener)){
      try{ hideModal._lastOpener.focus(); }catch(_){}
    }
  }
  function setLastOpener(btn){ hideModal._lastOpener = btn; }

  // ---- rendering ----
  function statusPill(st){
    var s = String(st||'').toUpperCase();
    var cls = 'pill status ' + s.toLowerCase();
    var nice = s.charAt(0)+s.slice(1).toLowerCase();
    return '<span class="'+cls+'">'+nice+'</span>';
  }
  function nameFor(brandId, styleId){
    var k = String(brandId||'') + '|' + String(styleId||'');
    var st = STATE.styleMap[k];
    return { brand: STATE.brandMap[String(brandId)||'']||'', style: st ? (st.name||'') : '' };
  }
  function renderTable(){
    var tbody = qs('#prodTable tbody');
    if (!tbody) return;
    if (!STATE.items.length){
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;">Sin datos</td></tr>';
      qs('#pageInfo').textContent = 'Página 1 de 1 (0 registros)';
      return;
    }
    var html = STATE.items.map(function(r){
      var ns = nameFor(r.brandId, r.styleId);
      // Si no está etiquetado, mostramos el productionStyle
      var styleLabel = ns.style || r.labelName || (r.productionStyle ? ('['+r.productionStyle+']') : '');
      var brandLabel = ns.brand || '';

      var isFinal = String(r.status||'').toUpperCase()==='FINAL';
      var canP = !r.visitedP && !isFinal;
      var canE = !r.visitedE && !isFinal;
      var canF = (String(r.status||'').toUpperCase()==='PAUSTERIZADO' || String(r.status||'').toUpperCase()==='ETIQUETADO');

      var btnP = '<button class="btn ghost act-p" data-id="'+r.id+'" '+(canP?'':'disabled title="Ya pasó por Pausterizado o está en FINAL"')+'>Pausterizar</button>';
      var btnE = '<button class="btn ghost act-e" data-id="'+r.id+'" '+(canE?'':'disabled title="Ya pasó por Etiquetado o está en FINAL"')+'>Etiquetar</button>';
      var btnF = '<button class="btn ghost act-f" data-id="'+r.id+'" '+(canF?'':'disabled title="Finalizar disponible solo desde Pausterizado o Etiquetado"')+'>Finalizar</button>';

      var actions = [btnP, btnE, btnF].join(' ');

      return '<tr>'
        + '<td>'+r.id+'</td>'
        + '<td>'+ (brandLabel||'') +'</td>'
        + '<td>'+ (styleLabel||'') +'</td>'
        + '<td>'+ fmtInt(r.qty) +'</td>'
        + '<td>'+ statusPill(r.status) +'</td>'
        + '<td>'+ actions +'</td>'
        + '</tr>';
    }).join('');
    tbody.innerHTML = html;

    var pages = Math.max(1, Math.ceil(STATE.total / STATE.pageSize));
    qs('#pageInfo').textContent = 'Página '+STATE.page+' de '+pages+' ('+STATE.total+' registros)';
    qs('#prevPage').disabled = (STATE.page<=1);
    qs('#nextPage').disabled = (STATE.page>=pages);
  }

  // --- mini helper de toast ---
  function toast(icon, title, ms){
    if (window.Swal){
      const T = Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false, timer:ms||1800, timerProgressBar:true });
      T.fire({ icon, title });
    } else {
      console[(icon==='error'?'error':'log')](title);
    }
  }

  // ---- data loaders ----
  async function loadStyleMap(){
    var styles = await window.SBData.listStyles(); // trae productionStyle también
    var brands = await window.SBData.listBrands();
    STATE.allStyles = styles||[];
    STATE.brands = brands||[];

    var bmap = {}; (brands||[]).forEach(function(b){ bmap[String(b.id)] = b.name; });
    var smap = {};
    (styles||[]).forEach(function(s){
      var k = String(s.brandId||'') + '|' + String(s.styleId||'');
      smap[k] = { brandId:s.brandId, styleId:s.styleId, name:s.name, color:s.color||'#000', brandName:bmap[String(s.brandId)||'']||'' };
    });
    STATE.styleMap = smap;
    STATE.brandMap = bmap;
  }

  async function loadPage(){
    await waitForSB(7000);
    // pageSize UI
    var sel = qs('#pageSize'); 
    STATE.pageSize = sel ? Number(sel.value||20) : 20;

    // nombres / colores
    await loadStyleMap();

    // productions
    var res = await window.SBData.listProductions({ page: STATE.page, pageSize: STATE.pageSize });
    STATE.items = res.items||[];
    STATE.total = Number(res.total||0);
    STATE.byId = {}; STATE.items.forEach(function(it){ STATE.byId[it.id] = it; });

    // combos modal
    await fillProductionStyleCombo();
    await fillBrandStyleSelectors();

    renderTable();
  }

  // Combo de "Estilo de producción"
  async function fillProductionStyleCombo(){
    var select = qs('#prodStyleCombo'); if (!select) return;
    var opts = ['HONEY','IPA','PORTER','LAGER'];
    var html = '<option value="">Seleccionar…</option>' + opts.map(function(v){ return '<option value="'+v+'">'+v+'</option>'; }).join('');
    select.innerHTML = html;
  }

  // Marca/Estilo (para el etiquetado)
  async function fillBrandStyleSelectors(){
    var bSel = qs('#labelBrandSelect');
    var sSel = qs('#labelStyleSelect');
    if (!bSel || !sSel) return;

    // marcas
    var bhtml = '<option value="">Seleccionar marca…</option>' + (STATE.brands||[]).map(function(b){
      return '<option value="'+b.id+'">'+(b.name||b.id)+'</option>';
    }).join('');
    bSel.innerHTML = bhtml;

    // estilos filtrados por marca
    function refreshStyles(){
      var bid = bSel.value || '';
      var list = (STATE.allStyles||[]).filter(function(s){ return String(s.brandId)===String(bid); });
      list.sort(function(a,b){
        var A = (a.name||''); var B = (b.name||''); return A.localeCompare(B);
      });
      var shtml = '<option value="">Seleccionar estilo…</option>' + list.map(function(s){
        return '<option value="'+s.styleId+'">'+(s.name||s.styleId)+'</option>';
      }).join('');
      sSel.innerHTML = shtml;
    }
    refreshStyles();
    on(bSel, 'change', refreshStyles);
  }

  // ---- actions ----
  async function doAdvance(prodId, to, extra){
    try{
      await window.SBData.advanceProduction(Object.assign({ prodId: prodId, to: to }, extra||{}));
      var nice = (to==='PAUSTERIZADO' ? 'Pausterizado' : (to==='ETIQUETADO' ? 'Etiquetado' : 'Finalizado'));
      toast('success', 'Estado actualizado: ' + nice, 1800);
      await loadPage();
    }catch(err){
      console.error('[advance]', err);
      var msg = 'No se pudo cambiar el estado.';
      var code = (err && (err.code||err.message||'')).toString().toUpperCase();
      if (code.indexOf('NO_LABEL_STOCK')!==-1){
        msg = 'No hay stock suficiente de etiquetas para esta producción.';
      } else if (code.indexOf('BACKWARD_NOT_ALLOWED_ONCE_VISITED')!==-1){
        msg = 'No se puede volver a un estado ya visitado (regla P↔E).';
      } else if (code.indexOf('FINAL_REQUIRES_P_OR_E')!==-1){
        msg = 'Para finalizar, debe pasar por Pausterizado o Etiquetado.';
      } else if (code.indexOf('FINAL_REQUIRES_LABEL')!==-1){
        msg = 'Para finalizar sin etiquetar no es posible con la nueva lógica. Debe etiquetar primero.';
      } else if (code.indexOf('FINAL_IS_TERMINAL')!==-1){
        msg = 'La producción ya está en FINAL.';
      }
      toast('error', msg, 2500);
      throw err;
    }
  }

  // ---- wire up ----
  document.addEventListener('DOMContentLoaded', function(){
    // botones
    on(qs('#refreshBtn'), 'click', function(){ loadPage(); });
    on(qs('#newProdBtn'), 'click', function(e){ setLastOpener(e.currentTarget); showModal('newProdModal'); });

    // page size
    on(qs('#pageSize'), 'change', function(){ STATE.page = 1; loadPage(); });

    // pager
    on(qs('#prevPage'), 'click', function(){ if (STATE.page>1){ STATE.page--; loadPage(); } });
    on(qs('#nextPage'), 'click', function(){ var pages=Math.max(1, Math.ceil(STATE.total/STATE.pageSize)); if(STATE.page<pages){ STATE.page++; loadPage(); } });

    // acciones de tabla (delegación)
    var tbody = qs('#prodTable tbody');
    on(tbody, 'click', function(ev){
      var t = ev.target;
      if (!(t && t.matches('button'))) return;
      var id = t.getAttribute('data-id');
      var row = STATE.byId[id]; if (!row) return;
      setLastOpener(t);

      if (t.classList.contains('act-p')){
        // Pausterizar
        doAdvance(id, 'PAUSTERIZADO');
      } else if (t.classList.contains('act-e')){
        // Etiquetar
        openLabelModal(row);
      } else if (t.classList.contains('act-f')){
        // Finalizar
        doAdvance(id, 'FINAL');
      }
    });

    // ---- modal: nueva producción ----
    on(qs('#closeNewProd'), 'click', function(){ hideModal('newProdModal'); });
    on(qs('#cancelNewProd'), 'click', function(){ hideModal('newProdModal'); });
    on(qs('#prodStyleCombo'), 'change', function(e){
      var opt = e.target.selectedOptions && e.target.selectedOptions[0];
      var prev = qs('#prodStylePreview');
      if (!prev) return;
      if (!opt){ prev.textContent = ''; return; }
      prev.textContent = 'Estilo: ' + (opt.value||'');
    });
    on(qs('#newProdForm'), 'submit', async function(ev){
      ev.preventDefault();
      try{
        var fd = new FormData(ev.currentTarget);
        var qty = Number(fd.get('qty')||0) || 0;
        var productionStyle = (fd.get('styleCombo')||'').toString();
        if (!(qty>0) || !productionStyle){
          return (window.Swal ? Swal.fire('Completar', 'Ingresá cantidad y estilo de producción', 'info') : alert('Ingresá cantidad y estilo de producción'));
        }
        await window.SBData.createProduction({ qty: qty, productionStyle: productionStyle });
        hideModal('newProdModal');
        toast('success', 'Producción creada', 1800);
        await loadPage();
      }catch(err){
        console.error('createProduction', err);
        var msg = 'No pude crear la producción';
        var code = (err && (err.code||err.message||'')).toString();
        if (code.indexOf('NO_EMPTY_STOCK')!==-1){
          msg = 'No hay latas vacías suficientes.';
        }
        if (window.Swal){ Swal.fire('Error', msg, 'error'); } else { alert(msg); }
      }
    });

    // ---- modal: etiquetar ----
    on(qs('#closeLabelProd'), 'click', function(){ hideModal('labelProdModal'); });
    on(qs('#cancelLabelProd'), 'click', function(){ hideModal('labelProdModal'); });

    // radios
    qsa('input[name="labelMode"]').forEach(function(radio){
      on(radio, 'change', function(e){
        var mode = e.currentTarget.value;
        var isCustom = (mode === 'custom');
        var grpCustom = qs('#customLabelGroup');
        var grpBrand = qs('#brandGroup');
        var grpStyle = qs('#styleGroup');
        if (grpCustom) grpCustom.style.display = isCustom ? '' : 'none';
        if (grpBrand)  grpBrand.style.display  = isCustom ? 'none' : '';
        if (grpStyle)  grpStyle.style.display  = isCustom ? 'none' : '';
      });
    });

    on(qs('#labelProdForm'), 'submit', async function(ev){
      ev.preventDefault();

      var fd = new FormData(ev.currentTarget);
      var prodId = fd.get('prodId');
      var mode = fd.get('labelMode') || 'same';
      var row = STATE.byId[String(prodId)||''];
      if (!row){
        toast('error','Producción no encontrada', 2200);
        return;
      }

      try { document.activeElement && document.activeElement.blur(); } catch(_){}
      hideModal('labelProdModal');

      try{
        if (mode === 'custom'){
          var selC = qs('#customLabelSelect');
          var name = selC ? (selC.value||'') : '';
          if (!name){
            toast('info','Seleccioná un nombre personalizado', 1800);
            showModal('labelProdModal');
            return;
          }
          await doAdvance(String(prodId), 'ETIQUETADO', {
            labelBrandId: row.brandId || '',   // se consume stock personalizado global (por nombre)
            labelStyleId: '',
            labelName: name
          });
        } else {
          // Marca / Estilo
          var bSel = qs('#labelBrandSelect');
          var sSel = qs('#labelStyleSelect');
          var b = bSel ? (bSel.value||'') : '';
          var s = sSel ? (sSel.value||'') : '';
          if (!b || !s){
            toast('info','Seleccioná marca y estilo', 1800);
            showModal('labelProdModal');
            return;
          }
          // nombre: usaremos el nombre del estilo elegido
          var styleObj = (STATE.allStyles||[]).find(function(x){ return String(x.styleId)===String(s); });
          var styleName = styleObj ? (styleObj.name||'') : '';
          await doAdvance(String(prodId), 'ETIQUETADO', {
            labelBrandId: b,
            labelStyleId: s,
            labelName: styleName
          });
        }
      }catch(err){
        // doAdvance ya toastea el caso específico
      }
    });
    // --- UI niceties: recordar modo, preview, búsqueda sin romper selects nativos ---
    /* === Label modal enhancements (sin buscador) === */
    (function enhanceLabelModalUI(){
      function toggleLabelMode(mode){
        var isCustom = (mode === 'custom');
        var customBox = qs('#customLabelBox');
        var brandBox  = qs('#brandStyleBox');
        if (customBox) customBox.style.display = isCustom ? '' : 'none';
        if (brandBox)  brandBox.style.display  = isCustom ? 'none' : '';
      }

      function refreshPreview(){
        var prev = qs('#labelProdPreview');
        if (!prev) return;
        var radios = qsa('input[name="labelMode"]');
        var mode = 'same';
        for (var i=0; i<radios.length; i++){
          if (radios[i].checked) { mode = radios[i].value; break; }
        }
        if (mode === 'custom'){
          var c = qs('#customLabelSelect');
          var name = (c && c.value) ? c.value : '';
          prev.textContent = name ? ('· Personalizada: ' + name) : '';
          return;
        }
        var bSel = qs('#labelBrandSelect');
        var sSel = qs('#labelStyleSelect');
        var bTxt = (bSel && bSel.selectedIndex >= 0) ? bSel.options[bSel.selectedIndex].text : '';
        var sTxt = (sSel && sSel.selectedIndex >= 0) ? sSel.options[sSel.selectedIndex].text : '';
        prev.textContent = (bTxt && sTxt) ? ('· ' + bTxt + ' / ' + sTxt) : '';
      }

      function bindKeys(id){
        var el = qs('#' + id);
        if (!el) return;
        on(el, 'keydown', function(ev){
          if (ev.key === 'Enter'){
            ev.preventDefault();
            var btn = qs('#submitLabelProd');
            if (btn) btn.click();
          }
          if (ev.key === 'Escape'){
            ev.preventDefault();
            var cb = qs('#cancelLabelProd');
            if (cb) cb.click();
          }
        });
      }

      function onChangeMode(e){
        var m = e.currentTarget.value;
        try { localStorage.setItem('labelMode', m); } catch(_){}
        toggleLabelMode(m);
        refreshPreview();
      }

      // recordar modo
      var radios = qsa('input[name="labelMode"]');
      var last = 'same';
      try { last = localStorage.getItem('labelMode') || 'same'; } catch(_){}
      var found = false;
      for (var i=0; i<radios.length; i++){
        if (radios[i].value === last){ radios[i].checked = true; found = true; }
        on(radios[i], 'change', onChangeMode);
      }
      if (!found && radios.length) radios[0].checked = true;
      toggleLabelMode(last);
      refreshPreview();

      // cambios → actualizar preview y hint
      on(qs('#labelBrandSelect'), 'change', function(){
        if (typeof refreshStylesForBrand === 'function') refreshStylesForBrand();
        refreshPreview();
      });
      on(qs('#labelStyleSelect'), 'change', function(){
        var hint = qs('#labelHint');
        var sSel = qs('#labelStyleSelect');
        var txt = (sSel && sSel.selectedIndex >= 0) ? sSel.options[sSel.selectedIndex].text : '';
        if (hint) hint.textContent = txt ? ('Vas a etiquetar como: ' + txt) : 'Elegí un estilo para etiquetar.';
        refreshPreview();
      });
      on(qs('#customLabelSelect'), 'change', refreshPreview);

      // atajos de teclado
      bindKeys('labelStyleSelect');
      bindKeys('customLabelSelect');
    })();

    /* Refrescar estilos por marca (texto plano en <option>) */
    if (!window.refreshStylesForBrand) {
      window.refreshStylesForBrand = function(){
        var bSel = qs('#labelBrandSelect');
        var sSel = qs('#labelStyleSelect');
        if (!bSel || !sSel) return;
        var bid = bSel.value || '';
        var list = (STATE.allStyles||[]).filter(function(s){
          return String(s.brandId) === String(bid);
        });
        list.sort(function(a,b){
          var A = (a.name||''); var B = (b.name||''); return A.localeCompare(B);
        });
        var html = '<option value="">Seleccionar estilo…</option>';
        for (var i=0; i<list.length; i++){
          var s = list[i];
          var meta = s.productionStyle ? (' – ' + s.productionStyle) : '';
          html += '<option value="'+s.styleId+'">'+ (s.name||s.styleId) + meta +'</option>';
        }
        sSel.innerHTML = html;
      };
    }


    // Reutilizamos tu función de refrescar estilos por marca, sin spans dentro de <option>
    window.refreshStylesForBrand = function(){
      var bSel = qs('#labelBrandSelect');
      var sSel = qs('#labelStyleSelect');
      if (!bSel || !sSel) return;
      var bid = bSel.value || '';
      var list = (STATE.allStyles||[]).filter(function(s){ return String(s.brandId)===String(bid); });
      list.sort(function(a,b){ return (a.name||'').localeCompare(b.name||''); });

      // Mostramos "Nombre del Estilo – PRODSTYLE" como texto plano (opciones no soportan HTML)
      var shtml = '<option value="">Seleccionar estilo…</option>' + list.map(function(s){
        var meta = s.productionStyle ? (' – '+s.productionStyle) : '';
        return '<option value="'+s.styleId+'">'+(s.name||s.styleId)+ meta +'</option>';
      }).join('');
      sSel.innerHTML = shtml;

      // limpiar búsqueda
      var search = qs('#styleSearch'); if (search) search.value = '';
    };


    // init
    loadPage().catch(function(e){ console.error('loadPage', e); });
  });

  // open label modal helper
  async function openLabelModal(row){
    var hid = document.querySelector('#labelProdForm input[name="prodId"]');
    if (hid) hid.value = row.id;

    // cargar etiquetas personalizadas con stock
    try{
      var list = await window.SBData.listCustomLabels();
      var sel = document.querySelector('#customLabelSelect');
      if (sel){
        var opts = list.map(function(it){
          var dis = (Number(it.stock||0) <= 0) ? ' disabled' : '';
          return '<option value="'+(it.name||'')+'"'+dis+'>'+ (it.name||'(sin nombre)') +' ('+(Number(it.stock||0))+')</option>';
        }).join('');
        sel.innerHTML = '<option value="">Seleccionar…</option>' + opts;
      }
    }catch(_){ /* ignore */ }

    showModal('labelProdModal');
  }

})();
