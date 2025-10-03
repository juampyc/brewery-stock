// js/supabase_data.js
(function(){
  'use strict';
  function sb(){ if(!window.SB) throw new Error('Supabase client no inicializado'); return window.SB; }
  function sum(rows, field){ return (rows||[]).reduce((a,r)=>a+(Number(r[field]||0)||0),0); }
  const SBData = {};
  const _dashCache = { data: null, t: 0 };
  function _invalidateDash(){ _dashCache.data = null; _dashCache.t = 0; }
  function _newId(prefix){ try { return prefix+'-'+crypto.randomUUID(); } catch(_) { return prefix+'-'+Math.random().toString(36).slice(2); } }

  async function _brandNameMap(){ const { data, error } = await sb().from('brands').select('id,name'); if (error) throw error; const m={}; (data||[]).forEach(b=>m[String(b.id)]=b.name); return m; }
  async function _labelsAddsDetail(){
    const { data, error } = await sb().from('labels').select('brand_id,style_id,name,is_custom,qty');
    if (error) throw error;
    const norm = s => String(s||'').trim().toUpperCase();

    const out = {};
    (data||[]).forEach(r=>{
      const brandId = r.brand_id||'';
      const styleId = r.style_id||'';
      const name    = r.name||'';
      const key     = `${norm(brandId)}|${norm(styleId)}|${norm(name)}`;

      if (!out[key]) out[key] = { addQty:0, isCustom: !!r.is_custom, brandId, styleId, name };
      out[key].addQty += Number(r.qty||0)||0;
      out[key].isCustom = out[key].isCustom || !!r.is_custom;
    });
    return out;
  }

  async function _labelsConsMap(){
    const { data, error } = await sb().from('movements').select('type, ref_id, qty').eq('type', 'LABEL_CONS');
    if (error) throw error;
    const normKey = k => String(k||'').trim().toUpperCase();

    const out = {};
    (data||[]).forEach(r=>{
      const ref = String(r.ref_id||'');
      if (!ref.startsWith('LABEL:')) return;
      const key = normKey(ref.substring(6));
      out[key] = (out[key]||0) + (Number(r.qty||0)||0);
    });
    return out;
  }

  async function _fetchDashboardSummary(){
    const [emptyAdds, emptyCons, emptyScrp, labelAdds, labelCons, prods] = await Promise.all([
      sb().from('empty_cans').select('qty'),
      sb().from('movements').select('qty').eq('type','EMPTY_CANS_CONS'),
      sb().from('movements').select('qty').eq('type','EMPTY_CANS_SCRAP'),
      sb().from('labels').select('qty'),
      sb().from('movements').select('qty').eq('type','LABEL_CONS'),
      sb().from('productions').select('status,qty')
    ]);
    [emptyAdds, emptyCons, emptyScrp, labelAdds, labelCons, prods].forEach(r=>{ if(r.error) throw r.error; });
    const emptyCansTotal = Math.max(0, (sum(emptyAdds.data,'qty')||0) - (sum(emptyCons.data,'qty')||0) - (sum(emptyScrp.data,'qty')||0));
    const labelsTotal = Math.max(0, (sum(labelAdds.data,'qty')||0) - (sum(labelCons.data,'qty')||0));
    const prodStatusTotals = { ENLATADO:0, PAUSTERIZADO:0, ETIQUETADO:0, FINAL:0 };
    (prods.data||[]).forEach(r=>{ const s=String(r.status||'').toUpperCase(); prodStatusTotals[s]=(prodStatusTotals[s]||0)+(Number(r.qty||0)||0); });
    return { emptyCansTotal, labelsTotal, prodStatusTotals };
  }
  SBData.getDashboardSummary = async function({ ttlMs=10000, force=false }={}){ const now=Date.now(); if(!force && _dashCache.data && (now-_dashCache.t)<ttlMs) return _dashCache.data; const d=await _fetchDashboardSummary(); _dashCache.data=d; _dashCache.t=now; return d; };
  SBData.getSummaryCounts = async function(){ const s=await SBData.getDashboardSummary(); return { emptyCansTotal:s.emptyCansTotal, labelsTotal:s.labelsTotal }; };
  SBData.getProdStatusTotals = async function(){ const s=await SBData.getDashboardSummary(); return s.prodStatusTotals; };
  SBData.getEmptyCansNet = async function(){ const s=await SBData.getDashboardSummary(); return Number(s.emptyCansTotal||0); };
  SBData.getLabelsNet = async function(){ const s=await SBData.getDashboardSummary(); return Number(s.labelsTotal||0); };

  // === STOCK FINAL EFECTIVO (label_* si existen) ===
  SBData.getFinalStockMap = async function(){
    const { data, error } = await sb().from('productions')
      .select('brand_id,style_id,label_brand_id,label_style_id,qty,status')
      .eq('status','FINAL');
    if (error) throw error;
    const map = {};
    (data||[]).forEach(r=>{
      const b = String(r.label_brand_id||r.brand_id||'');
      const s = String(r.label_style_id||r.style_id||'');
      const k = b+'|'+s;
      map[k] = (map[k]||0) + (Number(r.qty||0)||0);
    });
    return map;
  };

  // ========= LISTADOS =========
  SBData.listMovements = async function({ page=1, pageSize=20, type='', typePrefix='' }={}) {
    const from = (page-1)*pageSize;
    const to   = from + pageSize - 1;

    let q = sb().from('movements')
      .select('id,type,ref_id,qty,provider,lot,date_time', { count:'exact' })
      .order('date_time', { ascending:false })
      .range(from, to);

    if (type) q = q.eq('type', type);

    if (typePrefix) {
      const pref = String(typePrefix).toUpperCase();
      let types = [];
      if (pref === 'LABEL') {
        types = ['LABEL_ADD','LABEL_CONS'];
      } else if (pref === 'EMPTY_CANS' || pref === 'EMPTY') {
        types = ['EMPTY_CANS_ADD','EMPTY_CANS_CONS','EMPTY_CANS_SCRAP'];
      } else if (pref === 'PROD' || pref === 'PRODUCTION') {
        types = ['PROD_FINAL_IN','PROD_SCRAP'];
      } else {
        types = [pref + '_ADD', pref + '_CONS', pref + '_SCRAP'];
      }
      q = q.in('type', types);
    }

    const { data, error, count } = await q;
    if (error) throw error;

    const items = (data||[]).map(r => ({
      id: String(r.id||''),
      type: r.type,
      refId: r.ref_id,
      qty: Number(r.qty||0),
      provider: r.provider||'',
      lot: r.lot||'',
      dateTime: r.date_time||null
    }));

    return { total: count||0, items };
  };

  SBData.listStyles = async function(){
    const [styles, brands] = await Promise.all([
      sb().from('styles').select('brand_id,style_id,name,color,show_always,production_style'), // +production_style
      sb().from('brands').select('id,name')
    ]);
    if (styles.error) throw styles.error; if (brands.error) throw brands.error;
    const bmap={}; (brands.data||[]).forEach(b=>bmap[String(b.id)]=b.name);
    return (styles.data||[]).map(s=>([
      s.brand_id,
      s.style_id,
      s.name,
      s.color||'#000000',
      !!s.show_always,
      bmap[String(s.brand_id)]||String(s.brand_id||''),
      s.production_style || ''
    ])).map(([brand_id,style_id,name,color,show_always,brandName,production_style])=>({
      brandId:brand_id,
      styleId:style_id,
      name,
      color,
      showAlways:show_always,
      brandName,
      productionStyle: production_style
    }));
  };

  SBData.listBrands = async function(){ const { data, error } = await sb().from('brands').select('id,name,color'); if (error) throw error; return (data||[]).map(b=>({ id:b.id, name:b.name, color:b.color||'#000000' })); };

  SBData.listCustomLabels = async function(){
    const adds = await _labelsAddsDetail(); const cons = await _labelsConsMap(); const byName={};
    Object.keys(adds).forEach(k=>{ const a=adds[k]; if(!a.isCustom) return; const consKey='||'+(a.name||''); const stock=(a.addQty||0)-(cons[consKey]||0); const nm=a.name||'(sin nombre)'; byName[nm]=(byName[nm]||0)+stock; });
    return Object.keys(byName).map(n=>({ name:n, stock:byName[n] })).sort((a,b)=>(b.stock||0)-(a.stock||0));
  };
  SBData.labelsSummary = async function(){
    const adds = await _labelsAddsDetail(); const cons = await _labelsConsMap(); const brandsMap = await _brandNameMap(); const out=[];
    Object.keys(adds).forEach(k=>{ const a=adds[k]; const stock=(a.addQty||0)-(cons[k]||0); if(stock===0) return;
      const marca = a.isCustom ? 'Personalizada' : (brandsMap[a.brandId]||'(sin marca)');
      const estilo = a.isCustom ? (a.name||'(sin nombre)') : (a.name||'(sin estilo)');
      out.push({ marca, estilo, totalQty: stock });
    });
    out.sort((A,B)=>(B.totalQty||0)-(A.totalQty||0)); return out;
  };

  // ====== PRODUCCIONES (con production_style) ======
  SBData.listProductions = async function({status='', page=1, pageSize=20}={}){
    const from=(page-1)*pageSize, to=from+pageSize-1;
    let q = sb().from('productions')
      .select('id,brand_id,style_id,qty,status,label_brand_id,label_style_id,label_name,production_style,created_at,updated_at',{count:'exact'})
      .order('created_at',{ascending:false})
      .range(from,to);
    if(status) q=q.eq('status',status);
    const { data, error, count } = await q; if (error) throw error;

    const ids=(data||[]).map(r=>r.id); let visited={};
    if (ids.length){
      const { data:hist, error:hErr } = await sb().from('prod_history').select('prod_id,to').in('prod_id', ids);
      if (hErr) throw hErr;
      (hist||[]).forEach(h=>{
        const pid=String(h.prod_id||'');
        const t=String(h.to||'').toUpperCase();
        if(!visited[pid]) visited[pid]={P:false,E:false};
        if(t==='PAUSTERIZADO') visited[pid].P=true;
        if(t==='ETIQUETADO')  visited[pid].E=true;
      });
    }

    const items=(data||[]).map(r=>({
      id:String(r.id||''),
      brandId:r.brand_id||'',
      styleId:r.style_id||'',
      qty:Number(r.qty||0)||0,
      status:String(r.status||''),
      labelBrandId:r.label_brand_id||'',
      labelStyleId:r.label_style_id||'',
      labelName:r.label_name||'',
      productionStyle: r.production_style || '',     // ← NUEVO
      createdAt:r.created_at||null,
      updatedAt:r.updated_at||null,
      visitedP:(visited[String(r.id)]||{}).P||false,
      visitedE:(visited[String(r.id)]||{}).E||false
    }));
    return { total: count||items.length, items };
  };

  // Alta de producción: por Estilo de Producción
  SBData.createProduction = async function({ qty, productionStyle }){
    const summary = await SBData.getSummaryCounts();
    if ((summary.emptyCansTotal||0) < Number(qty||0)){
      const err = new Error('NO_EMPTY_STOCK'); err.code='NO_EMPTY_STOCK'; err.available=summary.emptyCansTotal; err.needed=qty;
      throw err;
    }
    const now = new Date().toISOString();
    const id  = 'PR-'+(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2));

    // Insert producción con production_style (sin brand/style aún)
    const { error:insProdErr } = await sb().from('productions').insert([{
      id,
      brand_id: null,
      style_id: null,
      production_style: productionStyle || null,   // ← NUEVO
      qty: Number(qty||0)||0,
      status: 'ENLATADO',
      label_brand_id: null,
      label_style_id: null,
      label_name: null,
      created_at: now,
      updated_at: now
    }]); if (insProdErr) throw insProdErr;

    // Consumo de latas vacías
    const { error:movErr } = await sb().from('movements').insert([{
      type:'EMPTY_CANS_CONS', ref_id:'PROD:'+id, qty:Number(qty||0)||0, provider:'', lot:'', date_time:now
    }]); if (movErr) throw movErr;

    // Historia
    const { error:histErr } = await sb().from('prod_history').insert([{
      id:_newId('PH'), prod_id:id, from:null, to:'ENLATADO', date_time:now, note:''
    }]); if (histErr) throw histErr;

    return { id };
  };

  // SCRAP (sin cambios)
  SBData.scrap = async function({ source, prodId, qty }){
    const now=new Date().toISOString(); qty=Number(qty||0)||0;
    if (String(source||'').toUpperCase()==='EMPTY'){ await sb().from('movements').insert([{ id:_newId('MV'), type:'EMPTY_CANS_SCRAP', ref_id:'SCRAP:EMPTY', qty, provider:'', lot:'', date_time:now }]); _invalidateDash(); return {}; }
    if (String(source||'').toUpperCase()==='PROD'){
      const { data, error } = await sb().from('productions').select('id,qty,status').eq('id', prodId).limit(1).single(); if (error) throw error;
      const curQty=Number(data.qty||0)||0; if (qty>curQty){ const e=new Error('OVER_SCRAP'); e.available=curQty; throw e; }
      const newQty=curQty-qty; await sb().from('productions').update({ qty:newQty, updated_at:now }).eq('id', prodId);
      await sb().from('movements').insert([{ id:_newId('MV'), type:'PROD_SCRAP', ref_id:'PROD:'+prodId, qty, provider:'', lot:'', date_time:now }]);
      await sb().from('prod_history').insert([{ id:_newId('PH'), prod_id:prodId, from:data.status||'', to:data.status||'', date_time:now, note:'SCRAP '+qty }]);
      _invalidateDash(); return { prodId, newQty };
    }
    throw new Error('INVALID_SOURCE');
  };

  // Avance: exige etiqueta antes de FINAL y mantiene consumo de etiquetas
  SBData.advanceProduction = async function({ prodId, to, labelBrandId, labelStyleId, labelName }){
    to=String(to||'').toUpperCase(); const now=new Date().toISOString();
    const { data:rec, error } = await sb().from('productions').select('id,brand_id,style_id,qty,status,label_brand_id,label_style_id,label_name,production_style').eq('id', prodId).limit(1).single(); if (error) throw error;
    const from=String(rec.status||'').toUpperCase(); if (from===to) return { id:prodId, status:from }; if (from==='FINAL'){ const e=new Error('FINAL_IS_TERMINAL'); e.code='FINAL_IS_TERMINAL'; throw e; }
    if (to==='PAUSTERIZADO' || to==='ETIQUETADO'){ const { data:hist } = await sb().from('prod_history').select('to').eq('prod_id', prodId); let already=false; (hist||[]).forEach(h=>{ const t=String(h.to||'').toUpperCase(); if (t===to) already=true; }); if (already){ const e=new Error('BACKWARD_NOT_ALLOWED_ONCE_VISITED'); e.from=from; e.to=to; throw e; } }
    const need=Number(rec.qty||0)||0;

    // ETIQUETADO (Marca/Estilo o Personalizada) — fija brand_id/style_id a partir de la etiqueta
    if (to==='ETIQUETADO'){
      if (!labelStyleId && !labelName){ const e=new Error('MISSING_LABEL_SELECTION'); throw e; }
      const norm = s => String(s||'').trim().toUpperCase();
      const isCustom = !labelStyleId;
      let available = 0;

      const adds = await _labelsAddsDetail();
      const cons = await _labelsConsMap();

      const keys = [];
      if (isCustom){
        keys.push(`||${norm(labelName)}`);
        keys.push(`${norm(labelBrandId)}|${norm(labelStyleId)}|${norm(labelName)}`);
      }else{
        keys.push(`${norm(labelBrandId)}|${norm(labelStyleId)}|${norm(labelName)}`);
      }

      keys.forEach(k=>{
        const a = (adds[k] && adds[k].addQty) || 0;
        const c = (cons[k] || 0);
        available += (a - c);
      });

      if (available < need){ const e=new Error('NO_LABEL_STOCK'); e.available=available; e.needed=need; throw e; }

      // Efectivos (qué queda grabado)
      const effBrand = isCustom ? (labelBrandId || rec.brand_id || null) : (labelBrandId || null);
      const effStyle = isCustom ? (rec.style_id || null) : (labelStyleId || null);
      const effName  = labelName || '';

      // Actualiza label_* y también brand_id/style_id
      await sb().from('productions').update({
        status: 'ETIQUETADO',
        label_brand_id: effBrand || '',
        label_style_id: effStyle || '',
        label_name: effName,
        brand_id: effBrand || rec.brand_id || null,
        style_id: effStyle || rec.style_id || null,
        updated_at: now
      }).eq('id', prodId);

      // Movimiento de consumo de etiquetas
      const refKey = isCustom ? `||${norm(labelName)}` : `${norm(labelBrandId)}|${norm(labelStyleId)}|${norm(labelName)}`;
      await sb().from('movements').insert([{ type:'LABEL_CONS', ref_id:'LABEL:'+refKey, qty: need, provider:'', lot:'', date_time: now }]);

      // Historia
      await sb().from('prod_history').insert([{ id:_newId('PH'), prod_id:prodId, from:from, to:'ETIQUETADO', date_time:now, note: isCustom? ('Etiqueta personalizada: '+labelName) : 'Etiqueta marca/estilo' }]);
      _invalidateDash(); return { id:prodId, status:'ETIQUETADO' };
    }

    // FINAL: ahora requiere etiqueta definida
    if (to==='FINAL'){
      if (!(from==='PAUSTERIZADO' || from==='ETIQUETADO')){ const e=new Error('FINAL_REQUIRES_P_OR_E'); e.from=from; throw e; }
      const hasLabel = !!(rec.label_brand_id || rec.label_style_id || rec.label_name);
      if (!hasLabel){ const e=new Error('FINAL_REQUIRES_LABEL'); e.code='FINAL_REQUIRES_LABEL'; throw e; }

      const effBrand=String(rec.label_brand_id||rec.brand_id||'');
      const effStyle=String(rec.label_style_id||rec.style_id||'');

      // Fusionar con FINAL existente del mismo brand/style
      const { data:others } = await sb().from('productions')
        .select('id,qty,status,label_brand_id,label_style_id,brand_id,style_id')
        .eq('status','FINAL');

      let target=null;
      (others||[]).forEach(o=>{
        const b=String(o.label_brand_id||o.brand_id||'');
        const s=String(o.label_style_id||o.style_id||'');
        if (b===effBrand && s===effStyle) target=o;
      });

      if (target){
        const newQty=(Number(target.qty||0)||0)+need;

        // A) sumar al destino
        await sb().from('productions')
          .update({ qty:newQty, updated_at: now })
          .eq('id', target.id);

        // B) movimiento del origen (antes de borrar)
        await sb().from('movements').insert([{
          id:_newId('MV'),
          type:'PROD_FINAL_IN',
          ref_id:'PROD:'+rec.id,
          qty:need, provider:'', lot:'', date_time:now
        }]);

        // C1) evento FINAL explícito del origen
        const finalNote = `Fusionado FINAL en ${String(target.id)} (origen ${String(rec.id)}, qty ${need})`;
        await sb().from('prod_history').insert([{
          id:_newId('PH'),
          prod_id:rec.id,
          from:from || null,
          to:'FINAL',
          date_time:now,
          note: finalNote
        }]);

        // C2) ANOTACIONES por cada evento previo (solo INSERT, sin UPDATE)
        try{
          const { data: prevHist } = await sb()
            .from('prod_history')
            .select('from,to')               // necesitamos from/to para replicar la transición
            .eq('prod_id', rec.id);

          if ((prevHist||[]).length){
            const annot = `Origen ${String(rec.id)} fusionado en ${String(target.id)} (qty ${need})`;
            const rows = prevHist.map(h => ({
              id:_newId('PH'),
              prod_id: rec.id,
              from: h.from || null,
              to:   h.to   || null,
              date_time: now,
              note: annot
            }));
            await sb().from('prod_history').insert(rows);
          }
        }catch(_){ /* si falla, no frenamos la fusión */ }

        // D) borrar el origen (FK está en ON DELETE SET NULL → se preservan las filas)
        await sb().from('productions').delete().eq('id', rec.id);

        _invalidateDash();
        return { id:String(target.id), status:'FINAL', merged:true, qty:newQty };
      }

    }

    // Avance genérico (ENLATADO->PAUSTERIZADO o FINAL sin fusión)
    await sb().from('productions').update({ status:to, updated_at:now }).eq('id', prodId);
    if (to==='FINAL'){ await sb().from('movements').insert([{ id:_newId('MV'), type:'PROD_FINAL_IN', ref_id:'PROD:'+rec.id, qty:need, provider:'', lot:'', date_time:now }]); }
    await sb().from('prod_history').insert([{ id:_newId('PH'), prod_id:rec.id, from:from, to:to, date_time:now, note:'' }]);
    _invalidateDash(); return { id:prodId, status:to };
  };


  // ====== Ventas / Entregas ======
  SBData.salesWeekSummary = async function({ start, end }={}){
    function pad2(n){ return String(n).padStart(2,'0'); }
    function weekRange(now){ const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()); const diff=(d.getDay()===0?-6:1-d.getDay()); const mon=new Date(d); mon.setDate(d.getDate()+diff); mon.setHours(0,0,0,0); const sun=new Date(mon); sun.setDate(mon.getDate()+6); sun.setHours(23,59,59,999); return { start:mon, end:sun }; }
    if (!start || !end){ const R=weekRange(new Date()); start=R.start; end=R.end; }
    const { data, error } = await sb().from('sales_processed').select('processed_at, remito, qty, item_code').gte('processed_at', start.toISOString()).lte('processed_at', end.toISOString()); if (error) throw error;
    const delivRefs=new Set(); let delivQty=0; (data||[]).forEach(r=>{ if (String(r.item_code||'').toUpperCase().startsWith('0.5-')){ delivRefs.add(r.remito); delivQty += Number(r.qty||0)||0; } });
    return { soldQty: delivQty, soldRefs: delivRefs.size, delivQty, delivRefs: delivRefs.size, rangeLabel: pad2(start.getDate())+'/'+pad2(start.getMonth()+1)+' – '+pad2(end.getDate())+'/'+pad2(end.getMonth()+1) };
  };

  // ========= ENTREGAS =========
  SBData.listPendingRemitos = async function(){
    const { data, error } = await sb()
      .from('remitos_pending_view')
      .select('remito, cliente, lines')
      .order('remito', { ascending: true });
    if (error) throw error;

    return (data||[]).map(r => ({
      remito: r.remito,
      cliente: r.cliente,
      items: (r.lines||[]).map(l => ({
        lineId:   `${r.remito}|${l.item_code||''}`,
        itemCode: l.item_code || '',
        brandId:  l.brand_id  || '',
        brandName:l.brand_name|| '',
        styleId:  l.style_id  || '',
        styleName:l.style_name|| '',
        uom:      l.uom       || 'u',
        qty:      Number(l.qty||0)||0,
        available:Number(l.available||0)||0,
        okToSelect: (Number(l.qty||0) <= Number(l.available||0)),
        note:     l.note || ''
      }))
    }));
  };

  SBData.logDeliveries = async function({ remito, client='', lines=[], user='web' }){
    const now = new Date().toISOString();

    const rows = (lines||[]).map((l)=>({
      line_id: (crypto && crypto.randomUUID) ? crypto.randomUUID() : ('ln_' + Math.random().toString(36).slice(2)),
      processed_at: now,
      remito: String(remito||''),
      client: String(client||''),
      item_code: String(l.itemCode||''),
      brand_id: String(l.brandId||''),
      brand_name: String(l.brandName||''),
      style_id: String(l.styleId||''),
      style_name: String(l.styleName||''),
      uom: String(l.uom||'u'),
      qty: Number(l.qty||0)||0,
      user: String(user||'')
    }));

    if (!rows.length) return { inserted: 0 };
    const { error } = await sb().from('sales_processed').insert(rows);
    if (error) throw error;
    return { inserted: rows.length };
  };

  SBData.consumeFinalStock = async function({ lines=[], remito='' }={}){
    if (!lines.length) return { consumed: 0 };

    const { data: finals, error } = await sb()
      .from('productions')
      .select('id, qty, status, brand_id, style_id, label_brand_id, label_style_id, created_at')
      .eq('status','FINAL');
    if (error) throw error;

    const bucket = {};
    (finals||[]).forEach(r=>{
      const b = String(r.label_brand_id||r.brand_id||'');
      const s = String(r.label_style_id||r.style_id||'');
      const k = b+'|'+s;
      (bucket[k] ||= []).push({ id:r.id, qty:Number(r.qty||0)||0, created_at:r.created_at });
    });
    Object.values(bucket).forEach(arr => arr.sort((a,b)=> String(a.created_at).localeCompare(String(b.created_at)))); // FIFO

    const need = {};
    (lines||[]).forEach(l=>{
      const k = String(l.brandId||'') + '|' + String(l.styleId||'');
      need[k] = (need[k]||0) + (Number(l.qty||0)||0);
    });

    for (const k of Object.keys(need)){
      const have = (bucket[k]||[]).reduce((a,r)=>a+(r.qty||0),0);
      if (have < need[k]){
        const e = new Error('NO_FINAL_STOCK'); e.key=k; e.needed=need[k]; e.available=have; throw e;
      }
    }

    const now = new Date().toISOString();
    let total = 0;

    for (const k of Object.keys(need)){
      let rest = need[k];
      const rows = bucket[k]||[];
      for (let i=0; i<rows.length && rest>0; i++){
        const r = rows[i];
        if (r.qty<=0) continue;
        const take = Math.min(r.qty, rest);
        const newQty = r.qty - take;

        const { error: uErr } = await sb().from('productions').update({ qty:newQty, updated_at: now }).eq('id', r.id);
        if (uErr) throw uErr;

        try{
          const { error: mErr } = await sb().from('movements').insert([{
            type: 'PROD_FINAL_OUT',
            ref_id: remito ? ('REM:'+String(remito)) : ('PROD:'+r.id),
            qty: take, provider:'', lot:'', date_time: now
          }]);
          if (mErr && mErr.code === '22P02'){ /* enum no incluye PROD_FINAL_OUT: ignorar */ }
          else if (mErr){ console.warn('[movements warn]', mErr); }
        }catch(_){}

        total += take;
        rest  -= take;
        r.qty  = newQty;
      }
    }

    return { consumed: total };
  };

  SBData.listDelivered = async function({ days=60 }={}){
    const since = new Date(); since.setDate(since.getDate() - Number(days||60));
    const { data, error } = await sb()
      .from('sales_processed')
      .select('remito, client, qty, processed_at, user')
      .gte('processed_at', since.toISOString())
      .order('processed_at', { ascending:false });
    if (error) throw error;
    const byRemito = {};
    (data||[]).forEach(r=>{
      const key = String(r.remito||'');
      if (!byRemito[key]) byRemito[key] = { remito: key, client: r.client||'', items: 0, qty: 0, assignedAt: r.processed_at, user: r.user||'' };
      byRemito[key].items += 1;
      byRemito[key].qty   += Number(r.qty||0)||0;
      if (r.processed_at && (!byRemito[key].assignedAt || r.processed_at < byRemito[key].assignedAt)){
        byRemito[key].assignedAt = r.processed_at;
      }
    });
    return Object.values(byRemito);
  };

  SBData.listDeliveredItems = async function({ days=60 }={}){
    const since = new Date(); since.setDate(since.getDate() - Number(days||60));
    const { data, error } = await sb()
      .from('sales_processed')
      .select('brand_id,brand_name,style_id,style_name,uom,qty,remito,processed_at')
      .gte('processed_at', since.toISOString());
    if (error) throw error;
    const map = {};
    (data||[]).forEach(r=>{
      const b = r.brand_name || r.brand_id || '';
      const s = r.style_name || r.style_id || '';
      const u = r.uom || '';
      const key = b+'|'+s+'|'+u;
      if (!map[key]) map[key] = { brandName:b, styleName:s, uom:u, remitosSet:new Set(), qty:0 };
      map[key].qty += Number(r.qty||0)||0;
      map[key].remitosSet.add(String(r.remito||''));
    });
    return Object.values(map).map(x=>({ brandName: x.brandName, styleName: x.styleName, uom: x.uom, remitos: x.remitosSet.size, qty: x.qty }));
  };

  SBData.listDeliveredRefs = async function({ days=120 } = {}){
    const since = new Date(); since.setDate(since.getDate() - Number(days||120));
    const { data, error } = await sb()
      .from('sales_processed')
      .select('remito,item_code')
      .gte('processed_at', since.toISOString());
    if (error) throw error;

    const map = {};
    (data||[]).forEach(r=>{
      const rem = String(r.remito||'');
      const code = String(r.item_code||'');
      if (!map[rem]) map[rem] = {};
      if (code) map[rem][code] = true;
    });
    return map;
  };

  SBData.getWeekKPIs = async function({ start, end } = {}){
    function pad2(n){ return String(n).padStart(2,'0'); }
    function weekRange(now){
      const d = new Date(now.getFullYear(),now.getMonth(),now.getDate());
      const diff = (d.getDay()===0 ? -6 : 1-d.getDay()); // lunes
      const mon = new Date(d); mon.setDate(d.getDate()+diff); mon.setHours(0,0,0,0);
      const sun = new Date(mon); sun.setDate(mon.getDate()+6); sun.setHours(23,59,59,999);
      return { start: mon, end: sun };
    }
    if (!start || !end){
      const R = weekRange(new Date());
      start = R.start; end = R.end;
    }
    const startIso = start.toISOString();
    const endIso   = end.toISOString();

    const { data: soldRows, error: soldErr } = await sb()
      .from('remitos_lines_view')
      .select('ts, remito, item_code, qty')
      .gte('ts', startIso)
      .lte('ts', endIso);
    if (soldErr) throw soldErr;

    let soldQty = 0;
    const soldRemSet = new Set();
    (soldRows||[]).forEach(r => {
      const code = String(r.item_code||'').toUpperCase();
      if (code.startsWith('0.5-')) {
        soldQty += Number(r.qty||0)||0;
        soldRemSet.add(String(r.remito||''));
      }
    });

    const { data: delivRows, error: delivErr } = await sb()
      .from('sales_processed')
      .select('processed_at, remito, item_code, qty')
      .gte('processed_at', startIso)
      .lte('processed_at', endIso);
    if (delivErr) throw delivErr;

    let delivQty = 0;
    const delivRemSet = new Set();
    (delivRows||[]).forEach(r=>{
      const code = String(r.item_code||'').toUpperCase();
      if (code.startsWith('0.5-')) {
        delivQty += Number(r.qty||0)||0;
        delivRemSet.add(String(r.remito||''));
      }
    });

    const rangeLabel = `${pad2(start.getDate())}/${pad2(start.getMonth()+1)} – ${pad2(end.getDate())}/${pad2(end.getMonth()+1)}`;
    return {
      rangeLabel,
      soldQty,
      soldRemitos: soldRemSet.size,
      deliveredQty: delivQty,
      deliveredRemitos: delivRemSet.size
    };
  };


  window.SBData = SBData;
})();
