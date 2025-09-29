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
  };

  // ---- modals ----
  function showModal(id){
    var m = qs('#'+id); var bd = qs('#backdrop');
    if (!m) return;
    m.removeAttribute('inert');
    m.setAttribute('aria-hidden','false');
    if (bd) bd.classList.add('show');
    // focus primer elemento
    var f = m.querySelector('input,select,button,textarea,[tabindex]');
    if (f) setTimeout(function(){ try{ f.focus(); }catch(_){ } }, 0);
  }

  function hideModal(id){
    var m = qs('#'+id); var bd = qs('#backdrop');
    if (!m) return;
    // Evita warning de aria-hidden con foco retenido
    if (m.contains(document.activeElement)) { try { document.activeElement.blur(); } catch(_){ } }
    m.setAttribute('aria-hidden','true');
    m.setAttribute('inert',''); // bloquea foco/inputs mientras está oculto
    if (bd) bd.classList.remove('show');

    if (hideModal._lastOpener && document.body.contains(hideModal._lastOpener)){
      try{ hideModal._lastOpener.focus(); }catch(_){}
    }
  }

  function setLastOpener(btn){ hideModal._lastOpener = btn; }

  // ---- rendering ----
  function statusPill(st){
    var s = String(st||'').toUpperCase();
    var cls = 'pill status ' + s.toLowerCase(); // ej: "pill status enlatado"
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
        + '<td>'+ (ns.brand||'') +'</td>'
        + '<td>'+ (ns.style || (r.labelName||'')) +'</td>'
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

  // --- mini helper de toast (usa SweetAlert2 ya cargado) ---
  function toast(icon, title, ms){
    if (window.Swal){
      const T = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: ms || 1800,
        timerProgressBar: true
      });
      T.fire({ icon, title });
    } else {
      console[(icon==='error'?'error':'log')](title);
    }
  }

  // ---- data loaders ----
  async function loadStyleMap(){
    // build from listStyles + listBrands para no depender de getStyleMap
    var styles = await window.SBData.listStyles();
    var brands = await window.SBData.listBrands();
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
    // pageSize de la UI
    var sel = qs('#pageSize'); 
    STATE.pageSize = sel ? Number(sel.value||20) : 20;

    // nombres / colores
    await loadStyleMap();

    // productions
    var res = await window.SBData.listProductions({ page: STATE.page, pageSize: STATE.pageSize });
    STATE.items = res.items||[];
    STATE.total = Number(res.total||0);
    STATE.byId = {}; STATE.items.forEach(function(it){ STATE.byId[it.id] = it; });

    // combo modal
    await fillStyleCombo();

    renderTable();
  }

  async function fillStyleCombo(){
    var select = qs('#prodStyleCombo'); if (!select) return;
    var styles = await window.SBData.listStyles();
    // ordenar por marca + estilo
    styles.sort(function(a,b){
      var A = (a.brandName||'') + ' ' + (a.name||'');
      var B = (b.brandName||'') + ' ' + (b.name||'');
      return A.localeCompare(B);
    });
    var html = '<option value="">Seleccionar…</option>' + styles.map(function(s){
      var v = String(s.brandId)+'|'+String(s.styleId);
      var label = (s.brandName||'') + ' — ' + (s.name||'');
      return '<option value="'+v+'" data-color="'+(s.color||'#000')+'" data-b="'+s.brandId+'" data-s="'+s.styleId+'" data-style="'+(s.name||'')+'">'+label+'</option>';
    }).join('');
    select.innerHTML = html;
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
      var code = (err && (err.code||err.message||'')).toString();
      if (code.indexOf('NO_LABEL_STOCK')!==-1){
        msg = 'No hay stock suficiente de etiquetas para esta producción.';
      } else if (code.indexOf('BACKWARD_NOT_ALLOWED_ONCE_VISITED')!==-1){
        msg = 'No se puede volver a un estado ya visitado (regla P↔E).';
      } else if (code.indexOf('FINAL_REQUIRES_P_OR_E')!==-1){
        msg = 'Para finalizar, debe pasar por Pausterizado o Etiquetado.';
      } else if (code.indexOf('FINAL_IS_TERMINAL')!==-1){
        msg = 'La producción ya está en FINAL.';
      }
      toast('error', msg, 2500);
      throw err; // por si el caller necesita manejarlo
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
      var styleName = opt.getAttribute('data-style')||'';
      var brandId = opt.getAttribute('data-b')||'';
      var brandName = STATE.brandMap[String(brandId)] || '';
      prev.textContent = brandName ? (brandName + ' — ' + styleName) : styleName;
    });
    on(qs('#newProdForm'), 'submit', async function(ev){
      ev.preventDefault();
      try{
        var fd = new FormData(ev.currentTarget);
        var qty = Number(fd.get('qty')||0) || 0;
        var combo = (fd.get('styleCombo')||'').toString();
        if (!(qty>0) || !combo){
          return Swal ? Swal.fire('Completar', 'Ingresá cantidad y estilo', 'info') : alert('Ingresá cantidad y estilo');
        }
        var parts = combo.split('|');
        var brandId = parts[0]||''; var styleId = parts[1]||'';
        await window.SBData.createProduction({ qty: qty, brandId: brandId, styleId: styleId });
        hideModal('newProdModal');
        toast('success', 'Producción creada', 1800); // toast top-right, autocierra
        await loadPage();
      }catch(err){
        console.error('createProduction', err);
        var msg = 'No pude crear la producción';
        var code = (err && (err.code||err.message||'')).toString();
        if (code.indexOf('NO_EMPTY_STOCK')!==-1){
          msg = 'No hay latas vacías suficientes.';
        } else if (code.indexOf('foreign key')!==-1 || code.indexOf('23503')!==-1){
          msg = 'La marca/estilo seleccionados no existen.';
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
        var grp = qs('#customLabelGroup');
        if (grp) grp.style.display = isCustom ? '' : 'none';
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

      // cerrar modal y limpiar foco ANTES del async (así no se reabre ni hay warning)
      try { document.activeElement && document.activeElement.blur(); } catch(_){}
      hideModal('labelProdModal');

      try{
        if (mode === 'same'){
          // usamos el nombre del estilo del enlatado para registrar labelName (como en GAS)
          var ns = nameFor(row.brandId, row.styleId);
          var styleName = ns.style || row.labelName || '';
          await doAdvance(String(prodId), 'ETIQUETADO', {
            labelBrandId: row.brandId,
            labelStyleId: row.styleId,
            labelName: styleName
          });
        } else {
          var sel = qs('#customLabelSelect');
          var name = sel ? (sel.value||'') : '';
          if (!name){
            toast('info','Seleccioná un nombre personalizado', 1800);
            // si falta el nombre, sí reabrimos para que el usuario elija
            showModal('labelProdModal');
            return;
          }
          await doAdvance(String(prodId), 'ETIQUETADO', {
            labelBrandId: row.brandId,
            labelStyleId: '',
            labelName: name
          });
        }
        // éxito → el modal queda cerrado y doAdvance ya refrescó la tabla
      }catch(err){
        // si falla (p.ej. NO_LABEL_STOCK), solo mostramos toast; no reabrimos
        // (así evitamos el comportamiento de “se vuelve a abrir solo”)
        // el mensaje específico ya lo muestra doAdvance → toast('error', ...)
      }
    });


    // init
    loadPage().catch(function(e){ console.error('loadPage', e); });
  });

  // open label modal helper
  async function openLabelModal(row){
    // setear prodId oculto
    var hid = document.querySelector('#labelProdForm input[name="prodId"]');
    if (hid) hid.value = row.id;

    // info de "mismo estilo"
    var ns = nameFor(row.brandId, row.styleId);
    var el = document.querySelector('#sameStyleName');
    if (el) el.textContent = (ns.brand ? (ns.brand+' — ') : '') + (ns.style||'');

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
