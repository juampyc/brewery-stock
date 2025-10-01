// js/index_enhancements.js — v9.0 (Supabase-only week KPIs + week selector)
(function(){
  'use strict';

  function $(sel, el){ if(!el) el=document; return el.querySelector(sel); }
  function $all(sel, el){ if(!el) el=document; return Array.from(el.querySelectorAll(sel)); }

  const STATE_COLORS = { ENLATADO:'#1f77b4', PAUSTERIZADO:'#ff7f0e', ETIQUETADO:'#2ca02c', FINAL:'#d62728' };

  async function waitForSB(maxWaitMs){ 
    const t0=Date.now(); 
    while(!(window.SB && window.SBData)){ 
      if(Date.now()-t0>maxWaitMs) throw new Error('SB timeout'); 
      await new Promise(r=>setTimeout(r,80)); 
    } 
  }

  document.addEventListener('DOMContentLoaded', function(){
    removeStyleBreakdownCards();
    ensureProdStatesCard().then(function(){
      moveEtiquetasCardNextToStates();
      ensureWeekSalesCard();   // <-- ahora 100% Supabase + selector
      buildTopRowEqual();
      compactTopKPIs();
    });
    registerBarValuePlugin();
    registerStateColorsPlugin();
    setTimeout(removeStyleBreakdownCards, 700);
  });

  function compactTopKPIs(){
    var row = $('#topRow'); if (!row) return;
    var cards = $all('.card', row);
    if (cards[0]) cards[0].classList.add('compact');
    if (cards[2]) cards[2].classList.add('compact');
  }

  function removeStyleBreakdownCards(){
    var t = $('#styleCountsCard'); if (t && t.parentNode) t.parentNode.removeChild(t);
    var donut = document.querySelector('#labelsPie, [data-widget="labels-donut"]');
    if (donut) { var card = donut.closest('.card'); if (card && card.parentNode) card.parentNode.removeChild(card); }
    $all('main .card').forEach(function(c){
      var h = c.querySelector('h3, h2, header, .title');
      if (h && /Etiquetas por estilo/i.test(h.textContent||'')) {
        if (c.parentNode) c.parentNode.removeChild(c);
      }
    });
  }

  function findCardByTitle(t){
    t = (t||'').toLowerCase();
    var cards = $all('main .card');
    for (var i=0;i<cards.length;i++){
      var h = cards[i].querySelector('h3, h2, header, .title');
      if (!h) continue;
      var txt = (h.textContent||'').trim().toLowerCase();
      if (txt === t) return cards[i];
      if (txt.indexOf(t)===0) return cards[i];
    }
    return null;
  }

  function moveEtiquetasCardNextToStates(){
    var states = $('#prodStatesCard');
    var etiquetas = findCardByTitle('Etiquetas');
    if (!states || !etiquetas) return;
    if (states.parentNode) states.parentNode.insertBefore(etiquetas, states.nextSibling);
  }

  function buildTopRowEqual(){
    var wrap = $('#topRow');
    var latas = findCardByTitle('Latas vacías') || $all('main .card')[0];
    var states = $('#prodStatesCard');
    var etiquetas = findCardByTitle('Etiquetas');
    var week = $('#weekSalesCard');
    if (!latas || !states || !etiquetas || !week) return;
    if (!wrap){
      wrap = document.createElement('div');
      wrap.id = 'topRow'; wrap.className = 'top-row';
      var anchor = latas; if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor);
    }
    wrap.appendChild(latas); 
    wrap.appendChild(states); 
    wrap.appendChild(etiquetas); 
    wrap.appendChild(week);
  }

  // ===== Estados (KPI card)
  async function ensureProdStatesCard(){
    if ($('#prodStatesCard')) return;
    var container = document.querySelector('main.container') || document.querySelector('main'); if (!container) return;
    var sec = document.createElement('section');
    sec.className = 'card'; sec.id = 'prodStatesCard';
    sec.innerHTML = [
      '<div class="flex" style="align-items:center; gap:12px;">',
      '  <h3 style="margin:0;">Estados de producción</h3>',
      '  <div class="spacer"></div>',
      '</div>',
      '<div class="kpi-states-vert">',
      '  <div class="kpi-row"><div class="left"><span class="dot" style="background:'+STATE_COLORS.ENLATADO+'"></span><span class="label">Enlatado</span></div><span class="num" id="kpi-enlatado">—</span></div>',
      '  <div class="kpi-row"><div class="left"><span class="dot" style="background:'+STATE_COLORS.PAUSTERIZADO+'"></span><span class="label">Pausterizado</span></div><span class="num" id="kpi-paus">—</span></div>',
      '  <div class="kpi-row"><div class="left"><span class="dot" style="background:'+STATE_COLORS.ETIQUETADO+'"></span><span class="label">Etiquetado</span></div><span class="num" id="kpi-etiq">—</span></div>',
      '  <div class="kpi-row"><div class="left"><span class="dot" style="background:'+STATE_COLORS.FINAL+'"></span><span class="label">Final</span></div><span class="num" id="kpi-final">—</span></div>',
      '</div>'
    ].join('');
    var firstCard = $all('main .card')[0];
    if (firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(sec, firstCard);
    else container.appendChild(sec);
    await loadProdStatesTotals();
  }

  async function loadProdStatesTotals(){
    try{
      await waitForSB(5000);
      const data = await window.SBData.getProdStatusTotals();
      $('#kpi-enlatado').textContent = Number(data.ENLATADO || 0);
      $('#kpi-paus').textContent     = Number(data.PAUSTERIZADO || 0);
      $('#kpi-etiq').textContent     = Number(data.ETIQUETADO || 0);
      $('#kpi-final').textContent    = Number(data.FINAL || 0);
    }catch(err){
      console.error('[prodStates] retry in 600ms:', err);
      setTimeout(loadProdStatesTotals, 600);
    }
  }

  // ===== Ventas semana (Supabase-only + selector) – versión estilizada
  function ensureWeekSalesCard(){
    if ($('#weekSalesCard')) return;
    var container = document.querySelector('main.container') || document.querySelector('main'); if (!container) return;

    var sec = document.createElement('section');
    sec.className = 'card compact week-card';
    sec.id = 'weekSalesCard';

    sec.innerHTML = [
      '<div class="week-head">',
      '  <h3 class="week-title">Ventas (semana)</h3>',
      '  <span class="week-range" id="weekRange">—</span>',
      '  <div class="week-actions">',
      '    <button class="btn ghost sm" id="btnPrevWeek">« Semana anterior</button>',
      '    <button class="btn ghost sm" id="btnThisWeek">Esta semana</button>',
      // Si querés, podés agregar “Siguiente semana”:
      // '    <button class="btn ghost sm" id="btnNextWeek">Siguiente »</button>',
      '  </div>',
      '</div>',

      '<div class="week-kpis">',
      '  <div class="kpi-tile">',
      '    <div class="kpi-title"><span class="kpi-dot sold"></span> Vendidas (latas)</div>',
      '    <div class="kpi-value" id="soldQty">—</div>',
      '    <div></div>',
      '    <div class="kpi-sub" id="soldRemitos">remitos —</div>',
      '  </div>',

      '  <div class="kpi-tile">',
      '    <div class="kpi-title"><span class="kpi-dot deliv"></span> Entregadas (latas)</div>',
      '    <div class="kpi-value" id="delivQty">—</div>',
      '    <div></div>',
      '    <div class="kpi-sub" id="delivRemitos">remitos —</div>',
      '  </div>',
      '</div>'
    ].join('');

    ( $all('main .card')[0]?.parentNode || container )
      .insertBefore(sec, $all('main .card')[0] || null);

    // Estado de navegación por semanas (offset 0 = actual, -1 = anterior, etc.)
    var weekOffset = 0;

    function weekRangeFromOffset(offset){
      // lunes a domingo
      var today = new Date();
      var d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      var day = d.getDay(); var diff = (day===0 ? -6 : 1-day);
      var monday = new Date(d); monday.setDate(d.getDate()+diff + (offset*7)); monday.setHours(0,0,0,0);
      var sunday = new Date(monday); sunday.setDate(monday.getDate()+6); sunday.setHours(23,59,59,999);
      return { start: monday, end: sunday };
    }

    async function loadWeek(offset){
      try{
        await waitForSB(7000);
        const R = weekRangeFromOffset(offset);
        const k = await window.SBData.getWeekKPIs({ start: R.start, end: R.end });
        $('#weekRange').textContent     = k.rangeLabel;
        $('#soldQty').textContent       = k.soldQty;
        $('#soldRemitos').textContent   = 'remitos ' + k.soldRemitos;
        $('#delivQty').textContent      = k.deliveredQty;
        $('#delivRemitos').textContent  = 'remitos ' + k.deliveredRemitos;
      }catch(err){
        console.error('[week KPIs]', err);
        $('#weekRange').textContent = 'error';
      }
    }

    // Eventos
    $('#btnPrevWeek').addEventListener('click', function(){
      weekOffset -= 1; loadWeek(weekOffset);
    });
    $('#btnThisWeek').addEventListener('click', function(){
      weekOffset = 0; loadWeek(weekOffset);
    });
    // Si activás el botón “Siguiente semana”, agregá también:
    // $('#btnNextWeek').addEventListener('click', function(){
    //   weekOffset += 1; loadWeek(weekOffset);
    // });

    // Primera carga
    loadWeek(weekOffset);
  }


  // ==== Chart.js plugins (valores dentro + colores fijos por estado) ===
  function registerBarValuePlugin(){
    if (!window.Chart) return;
    var plugin = { id:'insideValue', afterDatasetsDraw: function(chart){
      var ctx=chart.ctx, isHor=chart.options&&chart.options.indexAxis==='y';
      if (chart.config.type!=='bar') return;
      ctx.save(); ctx.fillStyle='#fff'; ctx.font='12px system-ui, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
      (chart.data.datasets||[]).forEach(function(ds,di){
        var meta=chart.getDatasetMeta(di); if(!meta||meta.hidden) return;
        (meta.data||[]).forEach(function(el,i){
          var v=ds.data&&ds.data[i]; if(v==null||v===0) return;
          var p=el.getProps?el.getProps(['x','y','base'],true):{x:el.x,y:el.y,base:el.base};
          if(isHor){ var xb=Math.min(p.x,p.base)+Math.abs(p.x-p.base)/2; ctx.fillText(String(v), xb, p.y); }
          else { var yb=Math.min(p.y,p.base)+Math.abs(p.y-p-base)/2; ctx.fillText(String(v), p.x, yb); }
        });
      });
      ctx.restore();
    }};
    Chart.register(plugin);
  }

  function registerStateColorsPlugin(){
    if (!window.Chart) return;
    var C=STATE_COLORS;
    var plugin = { id:'stateColors', beforeUpdate:function(chart){
      try{
        (chart.data.datasets||[]).forEach(function(d){
          var col=C[(d.label||'').toString().trim().toUpperCase()]; if(!col) return;
          d.backgroundColor = col; d.borderColor = col; d.hoverBackgroundColor = col;
        });
      }catch(e){}
    }};
    Chart.register(plugin);
  }
})();
