// js/labels.js (versión Supabase)
(function () {
  'use strict';

  // ---------- helpers ----------
  const qs  = (s, r) => (r||document).querySelector(s);
  const qsa = (s, r) => Array.from((r||document).querySelectorAll(s));
  const on  = (el, ev, fn) => el && el.addEventListener(ev, fn, false);
  const fmtInt = n => (Number(n||0) || 0).toString();

  function fmtDateAR(iso){
    if (!iso) return '';
    const d = new Date(iso);
    // Mostrar en AR (-03)
    const offMin = 3*60; // -03:00
    const ms = d.getTime() - offMin*60*1000;
    const a = new Date(ms);
    const DD = String(a.getUTCDate()).padStart(2,'0');
    const MM = String(a.getUTCMonth()+1).padStart(2,'0');
    const YYYY = a.getUTCFullYear();
    const HH = String(a.getUTCHours()).padStart(2,'0');
    const Min = String(a.getUTCMinutes()).padStart(2,'0');
    return `${DD}-${MM}-${YYYY} ${HH}:${Min}`;
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

  // Toast SweetAlert (arriba derecha, auto-cierra)
  const Toast = (window.Swal && Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 2200,
    timerProgressBar: true
  })) || { fire: ({icon, title}) => console.log((icon||'info').toUpperCase()+':', title) };

  // ---------- estado ----------
  const STATE = {
    page: 1,
    pageSize: 20,
    total: 0,
    movements: [],
    styles: [],
    brandMap: {}, // id -> name
    lastOpener: null
  };

  // ---------- modal helpers ----------
  function showModal(id, opener){
    const m = qs('#'+id); const bd = qs('#backdrop');
    if (!m) return;
    STATE.lastOpener = opener || document.activeElement || null;
    m.setAttribute('aria-hidden','false');
    bd && bd.classList.add('show');
    // focus inicial
    const f = m.querySelector('input,select,button,textarea,[tabindex]');
    f && setTimeout(()=>{ try{ f.focus(); }catch(e){} }, 0);
  }
  function hideModal(id){
    const m = qs('#'+id); const bd = qs('#backdrop');
    if (!m) return;
    m.setAttribute('aria-hidden','true');
    bd && bd.classList.remove('show');
    // restaurar foco para evitar aria-hidden warning
    if (STATE.lastOpener && document.body.contains(STATE.lastOpener)) {
      try{ STATE.lastOpener.focus(); }catch(_){}
    }
  }

  // ---------- UI: resumen ----------
  async function refreshLabelsSummary(){
    const tbody = qs('#labelsSummary tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:12px;">Cargando…</td></tr>';
    try{
      const rows = await window.SBData.labelsSummary(); // [{marca, estilo, totalQty}]
      if (!rows.length){
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:12px;">Sin datos</td></tr>';
        return;
      }
      tbody.innerHTML = rows.map(r=>(
        `<tr>
          <td>${r.marca||''}</td>
          <td>${r.estilo||''}</td>
          <td>${fmtInt(r.totalQty)}</td>
        </tr>`
      )).join('');
    }catch(err){
      console.error('[labelsSummary]', err);
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:12px;color:#b00;">Error</td></tr>';
    }
  }

  // ---------- UI: movimientos (opcional) ----------
  async function refreshMovements(){
    const tbody = qs('#movsTable tbody');
    if (!tbody) return;
    const szSel = qs('#pageSize'); STATE.pageSize = szSel ? Number(szSel.value||20) : 20;
    const refBtn = qs('#refreshMovs'); if (refBtn) refBtn.disabled = true;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:12px;">Cargando…</td></tr>';
    try{
      const res = await window.SBData.listMovements({ page: STATE.page, pageSize: STATE.pageSize, typePrefix: 'LABEL' });
      STATE.movements = res.items||[]; STATE.total = Number(res.total||0);

      if (!STATE.movements.length){
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:12px;">Sin datos</td></tr>';
      }else{
        tbody.innerHTML = STATE.movements.map(m=>(
          `<tr>
            <td>${m.id||''}</td>
            <td>${m.type||''}</td>
            <td>${fmtInt(m.qty)}</td>
            <td>${m.provider||''}</td>
            <td>${m.lot||''}</td>
            <td>${fmtDateAR(m.dateTime)}</td>
          </tr>`
        )).join('');
      }

      const pages = Math.max(1, Math.ceil(STATE.total / STATE.pageSize));
      const info = qs('#movPageInfo');
      if (info) info.textContent = `Página ${STATE.page} de ${pages} (${STATE.total} registros)`;
      const prev = qs('#movPrev'); const next = qs('#movNext');
      if (prev) prev.disabled = (STATE.page<=1);
      if (next) next.disabled = (STATE.page>=pages);
    }catch(err){
      console.error('[movements]', err);
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:12px;color:#b00;">Error</td></tr>';
    }finally{
      const btn = qs('#refreshMovs'); if (btn) btn.disabled = false;
    }
  }

  // ---------- cargar estilos para el combo ----------
  async function fillStyleCombo(){
    const sel = qs('#styleCombo');
    if (!sel) return;
    const styles = await window.SBData.listStyles();
    // brand map
    const brands = await window.SBData.listBrands();
    const bmap = {}; (brands||[]).forEach(b=> bmap[String(b.id)] = b.name );
    STATE.brandMap = bmap;

    // ordenar por marca + estilo
    styles.sort((a,b)=>{
      const A = (a.brandName||'') + ' ' + (a.name||'');
      const B = (b.brandName||'') + ' ' + (b.name||'');
      return A.localeCompare(B);
    });

    const html = '<option value="">Seleccionar…</option>' + styles.map(s=>{
      const v = String(s.brandId)+'|'+String(s.styleId);
      const label = (s.brandName||'') + ' — ' + (s.name||'');
      return `<option value="${v}" data-b="${s.brandId}" data-s="${s.styleId}" data-style="${s.name||''}">${label}</option>`;
    }).join('');
    sel.innerHTML = html;
  }

  // ---------- init ----------
  document.addEventListener('DOMContentLoaded', async function(){
    try{
      await waitForSB();

      // Botones top
      on(qs('#addLabelBtn'), 'click', (e)=>{ showModal('labelsModal', e.currentTarget); });
      on(qs('#refreshMovs'), 'click', ()=>{ refreshMovements(); });
      on(qs('#pageSize'), 'change', ()=>{ STATE.page=1; refreshMovements(); });
      on(qs('#movPrev'), 'click', ()=>{ if (STATE.page>1){ STATE.page--; refreshMovements(); } });
      on(qs('#movNext'), 'click', ()=>{ const pages=Math.max(1, Math.ceil(STATE.total/STATE.pageSize)); if(STATE.page<pages){ STATE.page++; refreshMovements(); } });

      // Modal
      on(qs('#closeLabelsModal'), 'click', ()=> hideModal('labelsModal'));
      on(qs('#cancelLabelsBtn'), 'click', ()=> hideModal('labelsModal'));

      // toggle custom/non custom
      const isCustom = qs('#isCustomChk');
      const customToggle = qs('#customToggle');
      const nonCustomWrap = qs('#nonCustomFields');
      const customWrap = qs('#customFields');

      function applyCustomToggle(){
        const custom = !!(isCustom && isCustom.checked);
        if (nonCustomWrap) nonCustomWrap.style.display = custom ? 'none' : '';
        if (customWrap)    customWrap.style.display    = custom ? '' : 'none';
      }
      if (isCustom) on(isCustom, 'change', applyCustomToggle);
      if (customToggle) on(customToggle, 'click', ()=>{ if(isCustom){ isCustom.checked = !isCustom.checked; applyCustomToggle(); }});
      applyCustomToggle();

      // style combo + preview
      await fillStyleCombo();
      on(qs('#styleCombo'), 'change', (e)=>{
        const opt = e.target.selectedOptions && e.target.selectedOptions[0];
        const prev = qs('#stylePreview');
        if (!prev) return;
        if (!opt){ prev.textContent=''; return; }
        const bId = opt.getAttribute('data-b')||'';
        const sName = opt.getAttribute('data-style')||'';
        const bName = STATE.brandMap[bId] || '';
        prev.textContent = bName ? `${bName} — ${sName}` : sName;
      });

      // submit alta
      on(qs('#labelsForm'), 'submit', async (ev)=>{
        ev.preventDefault();
        const form = ev.currentTarget;
        try{
          const fd = new FormData(form);
          const qty = Number(fd.get('qty')||0) || 0;
          const provider = (fd.get('provider')||'').toString().trim();
          const lot      = (fd.get('lot')||'').toString().trim();

          const custom = !!(isCustom && isCustom.checked);
          let brandId='', styleId='', name='';

          if (custom){
            const nmInp = qs('#customFields input[type="text"], #customFields input[name="name"]');
            name = (nmInp && nmInp.value || '').trim();
            if (!qty || !provider || !lot || !name){
              return Toast.fire({ icon:'info', title:'Ingresá cantidad, proveedor, lote y nombre' });
            }
          }else{
            const sel = qs('#styleCombo');
            const opt = sel && sel.selectedOptions && sel.selectedOptions[0];
            if (!qty || !provider || !lot || !opt){
              return Toast.fire({ icon:'info', title:'Ingresá cantidad, proveedor, lote y estilo' });
            }
            brandId = opt.getAttribute('data-b')||'';
            styleId = opt.getAttribute('data-s')||'';
          }

          await window.SBData.addLabel({ qty, provider, lot, isCustom: custom, brandId, styleId, name });

          // éxito
          hideModal('labelsModal');
          Toast.fire({ icon:'success', title: 'Etiqueta cargada' });

          // refrescar
          refreshLabelsSummary();
          refreshMovements();

          // limpiar form y preview
          form.reset();
          applyCustomToggle();
          const prev = qs('#stylePreview'); if (prev) prev.textContent = '';
        }catch(err){
          console.error('[addLabel]', err);
          Toast.fire({ icon:'error', title:'No pude registrar la etiqueta' });
        }
      });

      // primera carga
      refreshLabelsSummary();
      refreshMovements();

    }catch(err){
      console.error('[labels init]', err);
      Toast.fire({ icon:'error', title:'No pude inicializar Etiquetas' });
    }
  });

})();
