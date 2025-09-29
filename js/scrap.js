// js/scrap.js (versión Supabase)
(function(){
  'use strict';

  // ---------- helpers ----------
  const qs  = (s, r) => (r||document).querySelector(s);
  const qsa = (s, r) => Array.from((r||document).querySelectorAll(s));
  const on  = (el, ev, fn) => el && el.addEventListener(ev, fn, false);
  const fmtInt = n => (Number(n||0) || 0).toString();

  function fmtDateAR(iso){
    if (!iso) return '';
    const d = new Date(iso);
    const offMin = 3*60; // -03:00
    const ms = d.getTime() - offMin*60*1000;
    const a = new Date(ms);
    const DD  = String(a.getUTCDate()).padStart(2,'0');
    const MM  = String(a.getUTCMonth()+1).padStart(2,'0');
    const YY  = a.getUTCFullYear();
    const HH  = String(a.getUTCHours()).padStart(2,'0');
    const Min = String(a.getUTCMinutes()).padStart(2,'0');
    return `${DD}-${MM}-${YY} ${HH}:${Min}`;
  }

  function waitForSB(timeoutMs=7000){
    return new Promise((res, rej)=>{
      const t0 = Date.now();
      (function spin(){
        if (window.SB && window.SBData) return res();
        if (Date.now() - t0 > timeoutMs) return rej(new Error('SB timeout'));
        setTimeout(spin, 60);
      })();
    });
  }

  // Toast (SweetAlert)
  const Toast = Swal.mixin({
    toast:true, position:'top-end', showConfirmButton:false, timer:2200, timerProgressBar:true
  });

  // ---------- state ----------
  const STATE = {
    prods: [],
    brandMap: {},
    styleMap: {} // key "brandId|styleId" -> { name, brandName, color }
  };

  async function buildStyleMaps(){
    const styles = await window.SBData.listStyles();
    const brands = await window.SBData.listBrands();
    const bmap = {}; (brands||[]).forEach(b => { bmap[String(b.id)] = b.name; });
    const smap = {};
    (styles||[]).forEach(s=>{
      const k = String(s.brandId||'')+'|'+String(s.styleId||'');
      smap[k] = { name:s.name, brandName:bmap[String(s.brandId)]||'', color:s.color||'#000' };
    });
    STATE.brandMap = bmap;
    STATE.styleMap = smap;
  }

  function nameFor(brandId, styleId, labelName){
    const k = String(brandId||'')+'|'+String(styleId||'');
    const st = STATE.styleMap[k];
    const brand = STATE.brandMap[String(brandId)||''] || '';
    const style = st ? (st.name||'') : (labelName||'');
    return { brand, style };
  }

  // ---------- combos ----------
  async function loadProdsForScrap(){
    const sel = qs('#prodSelect'); if (!sel) return;
    sel.innerHTML = '<option value="">Cargando…</option>';

    await buildStyleMaps();

    // traigo bastantes por si acaso
    const res = await window.SBData.listProductions({ page:1, pageSize:500 });
    STATE.prods = res.items || [];

    // orden por fecha desc si viene createdAt
    STATE.prods.sort((a,b)=>{
      const da = new Date(a.createdAt||0).getTime();
      const db = new Date(b.createdAt||0).getTime();
      return db - da;
    });

    const opts = ['<option value="">Seleccionar…</option>'].concat(
      STATE.prods.map(p=>{
        const ns = nameFor(p.brandId, p.styleId, p.labelName);
        const label = `${p.id} — ${ns.brand ? ns.brand+' — ' : ''}${ns.style||''} [${p.status}] (${fmtInt(p.qty)})`;
        return `<option value="${p.id}">${label}</option>`;
      })
    );
    sel.innerHTML = opts.join('');
  }

  // ---------- tabla de scraps ----------
  async function refreshScrapTable(){
    const tbody = qs('#scrapTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:12px;">Cargando…</td></tr>';

    try{
      // juntamos EMPTY_CANS_SCRAP y PROD_SCRAP
      const [a, b] = await Promise.all([
        window.SBData.listMovements({ page:1, pageSize:50, type:'EMPTY_CANS_SCRAP' }),
        window.SBData.listMovements({ page:1, pageSize:50, type:'PROD_SCRAP' })
      ]);
      const items = [].concat(a.items||[], b.items||[]);
      // ordenar por fecha desc
      items.sort((A,B)=> new Date(B.dateTime||0) - new Date(A.dateTime||0));

      if (!items.length){
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:12px;">Sin datos</td></tr>';
        return;
      }
      tbody.innerHTML = items.map(m=>(
        `<tr>
          <td>${m.id||''}</td>
          <td>${m.type||''}</td>
          <td>${fmtInt(m.qty)}</td>
          <td>${fmtDateAR(m.dateTime)}</td>
        </tr>`
      )).join('');
    }catch(err){
      console.error('[scrap movements]', err);
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:12px;color:#b00;">Error</td></tr>';
    }
  }

  // ---------- init ----------
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      await waitForSB();

      // radios: mostrar/ocultar grupo producción
      qsa('input[name="source"]').forEach(radio=>{
        on(radio, 'change', ()=>{
          const val = radio.checked ? radio.value : (qs('input[name="source"]:checked')?.value || 'EMPTY');
          const showProd = (val === 'PROD');
          const grp = qs('#prodGroup');
          if (grp) grp.style.display = showProd ? '' : 'none';
        });
      });

      // cargar combos + tabla
      await loadProdsForScrap();
      await refreshScrapTable();

      // submit
      on(qs('#scrapForm'), 'submit', async (ev)=>{
        ev.preventDefault();
        try{
          const src = qs('input[name="source"]:checked')?.value || 'EMPTY';
          const qty = Number(qs('#qtyInput')?.value || 0) || 0;
          if (!qty || qty <= 0){
            return Swal.fire('Completar', 'Ingresá una cantidad válida.', 'info');
          }

          if (src === 'EMPTY'){
            await window.SBData.scrap({ source:'EMPTY', qty });
          } else {
            const prodId = qs('#prodSelect')?.value || '';
            if (!prodId){
              return Swal.fire('Completar', 'Seleccioná la producción.', 'info');
            }
            await window.SBData.scrap({ source:'PROD', prodId, qty });
          }

          Toast.fire({ icon:'success', title: 'Scrap registrado' });

          // refresh UI
          await Promise.all([ refreshScrapTable(), loadProdsForScrap() ]);

          // limpiar form
          const f = ev.currentTarget;
          if (f && typeof f.reset === 'function') f.reset();
          const grp = qs('#prodGroup'); if (grp) grp.style.display = 'none';
        }catch(err){
          console.error('[scrap submit]', err);
          let msg = 'No pude registrar el scrap.';
          if (err && err.message === 'OVER_SCRAP'){
            msg = 'La cantidad supera lo disponible en esa producción.';
          }
          Swal.fire('Error', msg, 'error');
        }
      });

    }catch(err){
      console.error('[scrap init]', err);
      Swal.fire('Error', 'No pude inicializar la pantalla de Scrap', 'error');
    }
  });

})();
