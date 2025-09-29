// js/index_enhancements.js — v8.1 (fix: wait SB + keep 4 cards + colors)
(function(){
  'use strict';

  var SALES_URL = (window.APP_CONFIG && window.APP_CONFIG.GAS_WEB_APP_URL_SALES) || window.GAS_WEB_APP_URL_SALES || '';

  function $(sel, el){ if(!el) el=document; return el.querySelector(sel); }
  function $all(sel, el){ if(!el) el=document; return Array.from(el.querySelectorAll(sel)); }
  var STATE_COLORS = { ENLATADO:'#1f77b4', PAUSTERIZADO:'#ff7f0e', ETIQUETADO:'#2ca02c', FINAL:'#d62728' };

  async function waitForSB(maxWaitMs){ const t0=Date.now(); while(!(window.SB && window.SBData)){ if(Date.now()-t0>maxWaitMs) throw new Error('SB timeout'); await new Promise(r=>setTimeout(r,80)); } }

  document.addEventListener('DOMContentLoaded', function(){
    removeStyleBreakdownCards();
    ensureProdStatesCard().then(function(){
      moveEtiquetasCardNextToStates();
      ensureWeekSalesCard();
      buildTopRowEqual();
      compactTopKPIs();
    });
    registerBarValuePlugin();
    registerStateColorsPlugin();
    setTimeout(removeStyleBreakdownCards, 700); // por si el donut aparece después
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
    wrap.appendChild(latas); wrap.appendChild(states); wrap.appendChild(etiquetas); wrap.appendChild(week);
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
      document.querySelector('#kpi-enlatado').textContent = Number(data.ENLATADO || 0);
      document.querySelector('#kpi-paus').textContent     = Number(data.PAUSTERIZADO || 0);
      document.querySelector('#kpi-etiq').textContent     = Number(data.ETIQUETADO || 0);
      document.querySelector('#kpi-final').textContent    = Number(data.FINAL || 0);
    }catch(err){
      console.error('[prodStates] retry in 600ms:', err);
      setTimeout(loadProdStatesTotals, 600);
    }
  }

  // ===== Ventas semana (usa GAS si lo tenés configurado)
  function ensureWeekSalesCard(){
    if ($('#weekSalesCard')) return;
    var container = document.querySelector('main.container') || document.querySelector('main'); if (!container) return;
    var sec = document.createElement('section');
    sec.className = 'card compact'; sec.id = 'weekSalesCard';
    sec.innerHTML = [
      '<div>',
      '  <div class="flex" style="align-items:center; gap:12px;">',
      '    <h3 style="margin:0;">Ventas (semana)</h3>',
      '    <div class="spacer"></div>',
      '  </div>',
      '  <div id="wk-range" class="wk-range"></div>',
      '</div>',
      '<div class="kpi-week">',
      '  <div class="row"><div class="left"><span>Vendidas (latas)</span><small>remitos</small></div><div style="text-align:right"><div class="val" id="wk-sold-qty">—</div><div class="muted" id="wk-sold-refs"></div></div></div>',
      '  <div class="row"><div class="left"><span>Entregadas (latas)</span><small>remitos</small></div><div style="text-align:right"><div class="val" id="wk-deliv-qty">—</div><div class="muted" id="wk-deliv-refs"></div></div></div>',
      '</div>'
    ].join('');
    ( $all('main .card')[0]?.parentNode || container ).insertBefore(sec, $all('main .card')[0] || null);
    loadWeekSales();
  }
  function pad2(n){ return String(n).padStart(2,'0'); }
  function fmtDDMM(d){ return pad2(d.getDate()) + '/' + pad2(d.getMonth()+1); }
  function weekRange(now){
    var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var day=d.getDay(); var diff=(day===0?-6:1-day);
    var monday=new Date(d); monday.setDate(d.getDate()+diff); monday.setHours(0,0,0,0);
    var sunday=new Date(monday); sunday.setDate(monday.getDate()+6); sunday.setHours(23,59,59,999);
    return {start:monday, end:sunday, label: fmtDDMM(monday)+' – '+fmtDDMM(sunday)};
  }
  function parseDate(dstr){
    if (!dstr) return null;
    var d = new Date(dstr); if (!isNaN(d)) return d;
    var m = String(dstr).match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (m){ return new Date(+m[3], (+m[2])-1, +m[1], +(m[4]||0), +(m[5]||0), 0, 0); }
    return null;
  }
  async function loadWeekSales(){
    if (!SALES_URL) return;
    var R = weekRange(new Date());
    $('#wk-range').textContent = 'Semana: ' + R.label;
    var startIso = R.start.toISOString().slice(0,10);
    var endIso   = R.end.toISOString().slice(0,10);
    try{
      var fast = SALES_URL + (SALES_URL.includes('?')?'&':'?') + 'action=sales_week_summary&start='+encodeURIComponent(startIso)+'&end='+encodeURIComponent(endIso);
      var fres = await fetch(fast, {method:'GET'});
      if (fres.ok){
        var f = await fres.json();
        if (f && f.ok && f.data){
          $('#wk-sold-qty').textContent  = Number(f.data.soldQty||0);
          $('#wk-sold-refs').textContent = 'remitos: ' + Number(f.data.soldRefs||0);
          $('#wk-deliv-qty').textContent = Number(f.data.delivQty||0);
          $('#wk-deliv-refs').textContent= 'remitos: ' + Number(f.data.delivRefs||0);
          return;
        }
      }
    }catch(e){ /* fallback abajo */ }
    try{
      var purl = SALES_URL + (SALES_URL.includes('?') ? '&' : '?') + 'action=sales_pending&start='+startIso+'&end='+endIso;
      var durl = SALES_URL + (SALES_URL.includes('?') ? '&' : '?') + 'action=sales_delivered&start='+startIso+'&end='+endIso;
      var [pres, dres] = await Promise.all([ fetch(purl), fetch(durl) ]);
      var pjson = pres.ok ? await pres.json() : { remitos: [] };
      var djson = dres.ok ? await dres.json() : { delivered: [] };
      var pend = (pjson && pjson.remitos) || [];
      var delivered = (djson && djson.delivered) || [];
      var start = R.start, end=R.end;
      function inRange(dt){ var d=parseDate(dt); return d && d>=start && d<=end; }
      var weekPend = pend.filter(function(r){ return inRange(r.timestamp); });
      var weekDel  = delivered.filter(function(r){ return inRange(r.assignedAt || r.timestamp); });
      var soldRefs = Object.create(null), soldQty=0;
      weekPend.forEach(function(r){ soldRefs[r.remito]=1; (r.lines||[]).forEach(l=>soldQty+=Number(l.qty||0)||0); });
      weekDel.forEach(function(r){ soldRefs[r.remito]=1; (r.lines||[]).forEach(l=>soldQty+=Number(l.qty||0)||0); });
      var delivQty=0; weekDel.forEach(function(r){ (r.lines||[]).forEach(l=>delivQty+=Number(l.qty||0)||0); });
      $('#wk-sold-qty').textContent  = soldQty;
      $('#wk-sold-refs').textContent = 'remitos: ' + Object.keys(soldRefs).length;
      $('#wk-deliv-qty').textContent = delivQty;
      $('#wk-deliv-refs').textContent= 'remitos: ' + weekDel.length;
    }catch(err){ console.error(err); }
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
          else { var yb=Math.min(p.y,p.base)+Math.abs(p.y-p.base)/2; ctx.fillText(String(v), p.x, yb); }
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