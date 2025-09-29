// js/index_supabase_only.js (actualizado con PIE real por estilo)
(function(){
  'use strict';

  function $(s,el){ if(!el) el=document; return el.querySelector(s); }
  function palette(n){
    const base = ['#60a5fa','#34d399','#f59e0b','#a78bfa','#f87171','#fbbf24','#22d3ee','#fb7185','#4ade80','#93c5fd','#c084fc','#fda4af'];
    const out=[]; for(let i=0;i<n;i++) out.push(base[i%base.length]); return out;
  }
  async function waitSB(){ return new Promise(res=>{ (function w(){ if (window.SB && window.SBData) return res(); setTimeout(w,60); })(); }); }

  async function loadKPIs(){
    const [empty, labels, totals] = await Promise.all([
      SBData.getEmptyCansNet(),
      SBData.getLabelsNet(),
      SBData.getProdStatusTotals()
    ]);
    const emptyEl  = $('#kpiEmpty');  if (emptyEl)  emptyEl.textContent  = empty ?? 0;
    const labelsEl = $('#kpiLabels'); if (labelsEl) labelsEl.textContent = labels ?? 0;
    return totals;
  }

  async function loadLabelsPieReal(){
    const ctx = $('#labelsPie'); if (!ctx) return;
    const { data, error } = await SB.from('v_label_stock_by_style').select('style_name, stock');
    if (error) { console.error(error); return; }
    if (!data || !data.length){
      if (ctx._chartInstance) ctx._chartInstance.destroy();
      ctx._chartInstance = new Chart(ctx, {
        type:'doughnut',
        data:{ labels:['Sin datos'], datasets:[{ data:[1], backgroundColor:palette(1) }]},
        options:{ maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{ position:'bottom' } } }
      });
      return;
    }
    const byStyle = new Map();
    data.forEach(r=>{
      const name = r.style_name || '(sin estilo)';
      const q = Number(r.stock||0)||0;
      byStyle.set(name, (byStyle.get(name)||0)+q);
    });
    const pairs = Array.from(byStyle.entries()).sort((a,b)=>b[1]-a[1]);
    const top = pairs.slice(0,12);
    const rest = pairs.slice(12);
    const restSum = rest.reduce((a,[,v])=>a+v,0);
    const labels = top.map(([k])=>k).concat(restSum>0?['Otros']:[]);
    const values = top.map(([,v])=>v).concat(restSum>0?[restSum]:[]);

    if (ctx._chartInstance) ctx._chartInstance.destroy();
    ctx._chartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: palette(labels.length) }] },
      options: { maintainAspectRatio:false, cutout:'60%', plugins: { legend: { position:'bottom' } } }
    });
  }

  async function loadStyleStateBars(){
    const [{ data:prods, error:ep }, { data:styles, error:es }, { data:brands, error:eb }] = await Promise.all([
      SB.from('productions').select('brand_id,style_id,qty,status,label_brand_id,label_style_id,label_name,created_at'),
      SB.from('styles').select('style_id,brand_id,name'),
      SB.from('brands').select('id,name')
    ]);
    if (ep||es||eb) throw (ep||es||eb);

    const brandName = {}; (brands||[]).forEach(b=> brandName[b.id]=b.name);
    const styleMeta = {}; (styles||[]).forEach(s=> styleMeta[s.style_id] = { brandId:s.brand_id, styleId:s.style_id, name:s.name });

    const ESTADOS = ['ENLATADO','PAUSTERIZADO','ETIQUETADO','FINAL'];
    const acc = {};
    (prods||[]).forEach(p=>{
      const key = (p.brand_id||'') + '|' + (p.style_id||'');
      if (!acc[key]){
        const s = styleMeta[p.style_id] || { name: p.style_id, brandId: p.brand_id };
        const bName = brandName[s.brandId] || s.brandId || '';
        acc[key] = { label: (bName ? bName+' - ' : '') + (s.name||p.style_id||''), ENLATADO:0, PAUSTERIZADO:0, ETIQUETADO:0, FINAL:0 };
      }
      const st = String(p.status||'').toUpperCase();
      if (acc[key][st]==null) acc[key][st]=0;
      acc[key][st] += Number(p.qty||0) || 0;
    });

    const keys = Object.keys(acc);
    const labels = keys.map(k=> acc[k].label);
    const dataByEstado = ESTADOS.map(st => keys.map(k => acc[k][st]||0));
    const colors = { ENLATADO:'#60a5fa', PAUSTERIZADO:'#34d399', ETIQUETADO:'#f59e0b', FINAL:'#a78bfa' };

    const ctx = $('#styleStateBars'); if (!ctx) return;
    if (ctx._chartInstance) ctx._chartInstance.destroy();
    ctx._chartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: ESTADOS.map(st=>({ label:st, data:dataByEstado[ESTADOS.indexOf(st)], backgroundColor: colors[st] }))
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: { legend:{ position:'bottom' } },
        scales: {
          x:{ stacked:true, grid:{ color:'rgba(255,255,255,.06)' } },
          y:{ stacked:true, grid:{ color:'rgba(255,255,255,.06)' } }
        }
      }
    });
  }


  // Avanzar producción (RPC y fallback)
  SBData.advanceProduction = async function({ prodId, to, labelBrandId='', labelStyleId='', labelName='' }){
    if (!prodId || !to) throw new Error('Faltan parámetros');
    // 1) Intento RPC (si la creaste en Supabase)
    try {
      const { data, error } = await SB.rpc('advance_production', {
        p_prod_id: prodId,
        p_to: to,
        p_label_brand_id: labelBrandId || null,
        p_label_style_id: labelStyleId || null,
        p_label_name: labelName || null
      });
      if (!error) return { ok:true, data };
    } catch(_) { /* sigo al fallback */ }

    // 2) Fallback: update simple + prod_history
    const { data:cur, error:ge } = await SB.from('productions')
      .select('status').eq('id', prodId).single();
    if (ge) throw ge;
    const prev = (cur && cur.status) || null;

    const now = new Date().toISOString();
    const upd = { status: to, updated_at: now };
    if (to === 'ETIQUETADO'){
      upd.label_brand_id = labelBrandId || null;
      upd.label_style_id = labelStyleId || null;
      upd.label_name     = labelName || null;
    }
    const { error:ue } = await SB.from('productions').update(upd).eq('id', prodId);
    if (ue) throw ue;

    await SB.from('prod_history').insert({
      prod_id: prodId, from: prev, to, date_time: now, note: ''
    });

    return { ok:true };
  };


  document.addEventListener('DOMContentLoaded', async ()=>{
    await waitSB();
    try{
      await loadKPIs();
      await loadLabelsPieReal();
      await loadStyleStateBars();
    }catch(err){ console.error('[index_supabase_only] ', err); }
  });
})();
