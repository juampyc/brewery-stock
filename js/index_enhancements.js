// js/index_enhancements.js (v4)
// - Igualar tamaño de los 3 cards superiores con un contenedor grid (.top-row)
// - Mantiene: estados verticales, colores fijos, valores dentro de barras, reordenamientos previos
(function(){
  'use strict';

  var MAIN_URL = (window.APP_CONFIG && window.APP_CONFIG.GAS_WEB_APP_URL) || window.GAS_WEB_APP_URL || '';

  function $(sel, el){ if(!el) el=document; return el.querySelector(sel); }
  function $all(sel, el){ if(!el) el=document; return Array.from(el.querySelectorAll(sel)); }

  var STATE_COLORS = {
    'ENLATADO':     '#1f77b4',
    'PAUSTERIZADO': '#ff7f0e',
    'ETIQUETADO':   '#2ca02c',
    'FINAL':        '#d62728'
  };

  document.addEventListener('DOMContentLoaded', function(){
    removeStyleBreakdownCards();
    ensureProdStatesCard().then(function(){
      moveEtiquetasCardNextToStates();
      buildTopRowEqual();
      compactTopKPIs();
    });

    registerBarValuePlugin();
    registerStateColorsPlugin();
  });

  function compactTopKPIs(){
    var trio = $('#topRow');
    if (!trio) return;
    var cards = $all('.card', trio);
    if (cards[0]) cards[0].classList.add('compact');
    if (cards[2]) cards[2].classList.add('compact');
  }

  function removeStyleBreakdownCards(){
    var t = $('#styleCountsCard'); if (t && t.parentNode) t.parentNode.removeChild(t);
    var donut = $('#labelsDonut') || document.querySelector('[data-widget="labels-donut"]');
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
    if ($('#topRow')) return; // ya creada
    var main = $('main.container') || $('main');
    if (!main) return;

    var latas = findCardByTitle('Latas vacías') || $all('main .card')[0];
    var states = $('#prodStatesCard');
    var etiquetas = findCardByTitle('Etiquetas');

    if (!latas || !states || !etiquetas) return;

    var wrap = document.createElement('div');
    wrap.id = 'topRow';
    wrap.className = 'top-row';

    var anchor = latas;
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(wrap, anchor);

    wrap.appendChild(latas);
    wrap.appendChild(states);
    wrap.appendChild(etiquetas);
  }

  async function ensureProdStatesCard(){
    if ($('#prodStatesCard')) return;
    var container = $('main.container') || $('main');
    if (!container) return;

    var sec = document.createElement('section');
    sec.className = 'card';
    sec.id = 'prodStatesCard';
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
      if (!MAIN_URL) return;
      var url = MAIN_URL + (MAIN_URL.includes('?') ? '&' : '?') + 'action=prodStatusTotals';
      var res = await fetch(url, { method:'GET' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      var json = await res.json();
      var data = (json && json.data) || {};

      var enlat = Number(data.ENLATADO || 0);
      var paus  = Number(data.PAUSTERIZADO || 0);
      var etiq  = Number(data.ETIQUETADO || 0);
      var fin   = Number(data.FINAL || 0);

      var $en = $('#kpi-enlatado'); if ($en) $en.textContent = enlat;
      var $pa = $('#kpi-paus');     if ($pa) $pa.textContent = paus;
      var $et = $('#kpi-etiq');     if ($et) $et.textContent = etiq;
      var $fi = $('#kpi-final');    if ($fi) $fi.textContent = fin;
    }catch(err){ console.error(err); }
  }

  function registerBarValuePlugin(){
    if (!window.Chart) return;
    var plugin = {
      id: 'insideValue',
      afterDatasetsDraw: function(chart, args, opts){
        var ctx = chart.ctx;
        var isBar = chart.config.type === 'bar' || chart.config.type === 'horizontalBar';
        if (!isBar) return;

        var isHorizontal = chart.options && chart.options.indexAxis === 'y';
        var datasets = chart.data.datasets || [];

        ctx.save();
        ctx.fillStyle = (opts && opts.color) || '#fff';
        ctx.font = (opts && opts.font) || '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        datasets.forEach(function(ds, di){
          var meta = chart.getDatasetMeta(di);
          if (!meta || meta.hidden) return;
          (meta.data || []).forEach(function(el, i){
            var val = ds.data && ds.data[i];
            if (val == null || val === 0) return;
            try{
              var props = el.getProps ? el.getProps(['x','y','base'], true) : { x: el.x, y: el.y, base: el.base };
              if (isHorizontal){
                var xb = Math.min(props.x, props.base) + Math.abs(props.x - props.base)/2;
                ctx.fillText(String(val), xb, props.y);
              } else {
                var yb = Math.min(props.y, props.base) + Math.abs(props.y - props.base)/2;
                ctx.fillText(String(val), props.x, yb);
              }
            }catch(_){}
          });
        });
        ctx.restore();
      }
    };
    if (Chart.register) Chart.register(plugin);
    else if (Chart.plugins && Chart.plugins.register) Chart.plugins.register(plugin);
  }

  function registerStateColorsPlugin(){
    if (!window.Chart) return;
    var plugin = {
      id: 'stateColors',
      beforeUpdate: function(chart){
        try{
          var ds = chart.data && chart.data.datasets;
          if (!ds) return;
          ds.forEach(function(dset){
            var label = (dset.label || '').toString().trim().toUpperCase();
            var col = {
              'ENLATADO':     '#1f77b4',
              'PAUSTERIZADO': '#ff7f0e',
              'ETIQUETADO':   '#2ca02c',
              'FINAL':        '#d62728'
            }[label];
            if (!col) return;
            if (Array.isArray(dset.backgroundColor)){
              dset.backgroundColor = dset.backgroundColor.map(function(){ return col; });
            } else {
              dset.backgroundColor = col;
            }
            dset.borderColor = col;
            dset.hoverBackgroundColor = col;
          });
        }catch(e){}
      }
    };
    if (Chart.register) Chart.register(plugin);
    else if (Chart.plugins && Chart.plugins.register) Chart.plugins.register(plugin);
  }
})();
