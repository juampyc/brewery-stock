// js/empty_cans.js
(function(){
  'use strict';

  // ------- helpers -------
  function qs(sel, root){ return (root||document).querySelector(sel); }
  function qsa(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function on(el, ev, fn){ el && el.addEventListener(ev, fn, false); }
  function fmtInt(n){ n = Number(n||0) || 0; return n.toString(); }
  function sb(){ if(!window.SB) throw new Error('Supabase client no inicializado'); return window.SB; }

  function waitForSB(timeoutMs){
    return new Promise(function(resolve, reject){
      var t0 = Date.now();
      (function spin(){
        if (window.SB && window.SBData){ return resolve(); }
        if (Date.now() - t0 > (timeoutMs||6000)) return reject(new Error('SB timeout'));
        setTimeout(spin, 60);
      })();
    });
  }

  function toast(title, icon){
    icon = icon || 'success';
    if (window.Swal) {
      return Swal.fire({
        toast: true, position: 'top-end', icon,
        title: String(title||'Listo'),
        showConfirmButton: false, timer: 1800, timerProgressBar: true
      });
    }
    alert(String(title||'OK'));
  }

  // ------- state -------
  var STATE = {
    page: 1,
    pageSize: 20,
    total: 0,
    items: [],
    byId: {}
  };

  // ------- rendering -------
  function renderTotals(n){
    var el = qs('#emptyCansTotal');
    if (el) el.textContent = fmtInt(n);
  }

  // ----- FECHA AR (UTC-3) -----
  function fmtDateAR(iso){
    if (!iso) return '';
    try{
      const d = new Date(iso);
      const parts = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(d).reduce((a,p)=>{ a[p.type]=p.value; return a; },{});
      return `${parts.day}-${parts.month}-${parts.year} ${parts.hour}:${parts.minute}`;
    }catch(_){ return iso; }
  }

  // ----- RENDER TABLA (5 columnas) -----
  function renderTable(){
    var tbody = qs('#emptyTable tbody');
    if (!tbody) return;

    if (!STATE.items.length){
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;">Sin datos</td></tr>';
    } else {
      tbody.innerHTML = STATE.items.map(function(r){
        var dt = r.date_time || r.dateTime || '';
        return '<tr>'
          + '<td>'+ (r.id||'') +'</td>'
          + '<td>'+ fmtInt(r.qty) +'</td>'
          + '<td>'+ (r.provider||'') +'</td>'
          + '<td>'+ (r.lot||'') +'</td>'
          + '<td>'+ fmtDateAR(dt) +'</td>'
          + '</tr>';
      }).join('');
    }

    var pages = Math.max(1, Math.ceil(STATE.total / STATE.pageSize));
    var pageInfo = qs('#pageInfo');
    if (pageInfo) pageInfo.textContent = 'Página '+STATE.page+' de '+pages+' ('+STATE.total+' registros)';
    var prev = qs('#prevPage'), next = qs('#nextPage');
    if (prev) prev.disabled = (STATE.page<=1);
    if (next) next.disabled = (STATE.page>=pages);
  }

  // === Helpers modal + toast (igual que producción) ===
  function showModal(id){
    var m = document.getElementById(id), bd = document.getElementById('backdrop');
    if (!m) return;
    m.removeAttribute('inert');
    m.setAttribute('aria-hidden','false');
    bd && bd.classList.add('show');
    setTimeout(function(){
      var f = m.querySelector('input,select,button,textarea,[tabindex]');
      if (f) try { f.focus(); } catch(_){}
    }, 0);
  }

  function hideModal(id){
    var m = document.getElementById(id), bd = document.getElementById('backdrop');
    // mover foco ANTES de aria-hidden para evitar warning de accesibilidad
    if (hideModal._opener && document.body.contains(hideModal._opener)) {
      try { hideModal._opener.focus(); } catch(_){}
    } else if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
    if (m){
      m.setAttribute('aria-hidden','true');
      m.setAttribute('inert','');
    }
    bd && bd.classList.remove('show');
  }
  function setLastOpener(btn){ hideModal._opener = btn; }

  // Toasts arriba a la derecha
  function toastOK(txt){ return window.Swal && Swal.fire({ icon:'success', title: txt||'OK', toast:true, position:'top-end', timer:1800, showConfirmButton:false }); }
  function toastERR(txt){ return window.Swal && Swal.fire({ icon:'error', title: txt||'Error', toast:true, position:'top-end', timer:2200, showConfirmButton:false }); }

  // === Wire-up modal ===
  document.addEventListener('DOMContentLoaded', function(){

    // Botón abrir (admite ambos ids por compatibilidad)
    ['#newEmptyBtn','#addEmptyBtn'].forEach(function(sel){
      var btn = document.querySelector(sel);
      if (btn) btn.addEventListener('click', function(e){
        setLastOpener(e.currentTarget);
        // detecto id del modal presente
        var modalId = document.getElementById('newEmptyModal') ? 'newEmptyModal'
                    : (document.getElementById('addEmptyModal') ? 'addEmptyModal' : null);
        if (modalId) showModal(modalId);
      }, false);
    });

    // Cerrar/cancelar
    var closeBtn = document.getElementById('closeNewEmpty') || document.getElementById('closeAddEmpty');
    if (closeBtn) closeBtn.addEventListener('click', function(){
      var id = document.getElementById('newEmptyModal') ? 'newEmptyModal' : 'addEmptyModal';
      hideModal(id);
    }, false);

    var cancelBtn = document.getElementById('cancelNewEmpty') || document.getElementById('cancelAddEmpty');
    if (cancelBtn) cancelBtn.addEventListener('click', function(){
      var id = document.getElementById('newEmptyModal') ? 'newEmptyModal' : 'addEmptyModal';
      hideModal(id);
    }, false);

    // Submit (admite ambos ids)
    var form = document.getElementById('newEmptyForm') || document.getElementById('addEmptyForm');
    if (form) form.addEventListener('submit', async function(ev){
      ev.preventDefault();
      try{
        var fd = new FormData(form);
        var qty = Number(fd.get('qty')||0) || 0;
        var provider = (fd.get('provider')||'').toString().trim();
        var lot = (fd.get('lot')||'').toString().trim();
        if (!(qty>0) || !provider || !lot) {
          return window.Swal ? Swal.fire({icon:'info', title:'Completá todos los campos', toast:true, position:'top-end', timer:1800, showConfirmButton:false}) : alert('Completá todos los campos');
        }

        await window.SBData.addEmptyCans({ qty, provider, lot });

        // limpiar form y cerrar
        form.reset();
        var id = document.getElementById('newEmptyModal') ? 'newEmptyModal' : 'addEmptyModal';
        hideModal(id);

        // refrescar lista (asumo tenés loadPage(); si se llama distinto, usá tu función)
        if (typeof loadPage === 'function') { await loadPage(); }

        toastOK('Latas registradas');

      }catch(err){
        console.error('addEmptyCans', err);
        toastERR('No pude guardar');
      }
    }, false);

  }, false);



  // ------- data loaders -------
  async function loadTotals(){
    var n = 0;
    try{
      // usa cache del dashboard si está; si no, cae a summary
      if (window.SBData.getEmptyCansNet){
        n = await window.SBData.getEmptyCansNet();
      }else{
        var s = await window.SBData.getSummaryCounts();
        n = Number((s && s.emptyCansTotal) || 0);
      }
    }catch(_){}
    renderTotals(n);
  }

  async function loadList(){
    // Leemos directamente de la tabla empty_cans con paginado
    var from = (STATE.page-1) * STATE.pageSize;
    var to   = from + STATE.pageSize - 1;

    const { data, error, count } = await sb()
      .from('empty_cans')
      .select('id, qty, provider, lot, date_time', { count: 'exact' })
      .order('date_time', { ascending: false })
      .range(from, to);

    if (error) throw error;

    STATE.items = (data||[]).map(function(r){
      return {
        id: String(r.id||''),
        qty: Number(r.qty||0)||0,
        provider: r.provider||'',
        lot: r.lot||'',
        date_time: r.date_time || null
      };
    });
    STATE.total = Number(count||STATE.items.length);
    STATE.byId = {}; STATE.items.forEach(function(it){ STATE.byId[it.id] = it; });

    renderTable();
  }

  async function loadPage(){
    await waitForSB(7000);

    var sel = qs('#pageSize');
    STATE.pageSize = sel ? (Number(sel.value||20)||20) : 20;

    await Promise.all([ loadTotals(), loadList() ]);
  }

  // ------- modal helpers -------
  function showModal(id){
    var m = qs('#'+id); var bd = qs('#backdrop');
    if (!m) return;
    m.setAttribute('aria-hidden', 'false');
    if (bd) bd.classList.add('show');
    var f = m.querySelector('input,select,button,textarea,[tabindex]');
    if (f) setTimeout(function(){ try{ f.focus(); }catch(_){ } }, 0);
  }
  function hideModal(id){
    var m = qs('#'+id); var bd = qs('#backdrop');
    if (!m) return;
    // Importante: limpiar focus ANTES de aria-hidden (evita warning de aria-hidden)
    try{ if (document.activeElement && m.contains(document.activeElement)){ document.activeElement.blur(); } }catch(_){}
    m.setAttribute('aria-hidden', 'true');
    if (bd) bd.classList.remove('show');
  }

  // ------- wire up -------
  document.addEventListener('DOMContentLoaded', function(){
    // Refresh
    on(qs('#refreshBtn'), 'click', function(){ loadPage(); });

    // Page size
    on(qs('#pageSize'), 'change', function(){
      STATE.page = 1;
      STATE.pageSize = Number(this.value||20)||20;
      loadPage();
    });

    // Pager
    on(qs('#prevPage'), 'click', function(){
      if (STATE.page>1){ STATE.page--; loadPage(); }
    });
    on(qs('#nextPage'), 'click', function(){
      var pages = Math.max(1, Math.ceil(STATE.total / STATE.pageSize));
      if (STATE.page < pages){ STATE.page++; loadPage(); }
    });

    // Modal alta
    on(qs('#addEmptyBtn'), 'click', function(){ showModal('emptyModal'); });
    on(qs('#closeEmpty'), 'click', function(){ hideModal('emptyModal'); });
    on(qs('#cancelEmpty'), 'click', function(){ hideModal('emptyModal'); });

    on(qs('#emptyForm'), 'submit', async function(ev){
      ev.preventDefault();
      try{
        var fd = new FormData(ev.currentTarget);
        var qty = Number(fd.get('qty')||0)||0;
        var provider = (fd.get('provider')||'').toString().trim();
        var lot = (fd.get('lot')||'').toString().trim();

        if (!(qty>0) || !provider || !lot){
          return toast('Completá cantidad, proveedor y lote', 'info');
        }

        await window.SBData.addEmptyCans({ qty, provider, lot });
        hideModal('emptyModal');
        toast('Alta registrada');
        await loadPage();
      }catch(err){
        console.error('[empty_cans:add]', err);
        toast('No pude guardar el movimiento', 'error');
      }
    });

    // Init
    loadPage().catch(function(e){ console.error('empty_cans load', e); });
  });

})();
