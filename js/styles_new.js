// js/styles_new.js
(function(){
  'use strict';

  // ------------- helpers -------------
  const qs  = (s, r)=> (r||document).querySelector(s);
  const qsa = (s, r)=> Array.from((r||document).querySelectorAll(s));
  const on  = (el, ev, fn)=> el && el.addEventListener(ev, fn, false);

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

  // ------------- modales (accesibles) -------------
  function setLastOpener(btn){ hideModal._lastOpener = btn; }

  function showModal(id){
    const m  = qs('#'+id);
    const bd = qs('#backdrop');
    if (!m) return;

    m.removeAttribute('inert');            // habilita foco/inputs
    m.setAttribute('aria-hidden','false');
    if (bd) bd.classList.add('show');

    // foco inicial
    setTimeout(()=>{
      const f = m.querySelector('[autofocus], input, select, textarea, button, [tabindex]');
      if (f) try { f.focus(); } catch(_){}
    }, 0);
  }

  function hideModal(id){
    const m  = qs('#'+id);
    const bd = qs('#backdrop');
    if (!m) return;

    // mover foco fuera del modal si el activo está adentro
    const opener = hideModal._lastOpener;
    const active = document.activeElement;
    if (active && m.contains(active)) {
      if (opener && document.contains(opener)) {
        try { opener.focus(); } catch(_){}
      } else {
        try { document.body.focus(); } catch(_){}
        try { active.blur(); } catch(_){}
      }
    }

    m.setAttribute('aria-hidden','true');
    m.setAttribute('inert','');            // bloquea foco/inputs
    if (bd) bd.classList.remove('show');
  }

  // ------------- Sweet toast -------------
  const Toast = Swal.mixin({
    toast:true, position:'top-end', showConfirmButton:false, timer:2200, timerProgressBar:true
  });

  // ------------- state -------------
  const STATE = {
    brands: [],
    styles: []
  };

  // ------------- cargar marcas al combo -------------
  async function fillBrands(){
    const sel = qs('#brandSelect');
    if (!sel) return;
    const brands = await window.SBData.listBrands();
    STATE.brands = brands || [];
    if (!brands.length){
      sel.innerHTML = '<option value="">(no hay marcas)</option>';
      return;
    }
    const html = '<option value="">Seleccionar…</option>' + brands.map(b=>(
      `<option value="${b.id}">${b.name}</option>`
    )).join('');
    sel.innerHTML = html;
  }

  // ------------- tabla de estilos -------------
  async function loadStylesTable(){
    const tbody = qs('#stylesTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:18px;">Cargando...</td></tr>';

    const rows = await window.SBData.listStyles(); // {brandId, styleId, name, color, showAlways, brandName}
    STATE.styles = rows || [];

    if (!rows.length){
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:18px;">Sin datos</td></tr>';
      return;
    }

    // ordenar por marca + estilo
    rows.sort((a,b)=>{
      const A = (a.brandName||'') + ' ' + (a.name||'');
      const B = (b.brandName||'') + ' ' + (b.name||'');
      return A.localeCompare(B);
    });

    tbody.innerHTML = rows.map(r=>{
      const clr = r.color || '#000000';
      const sw = `<span style="display:inline-block;width:18px;height:18px;border-radius:50%;border:1px solid #ddd;vertical-align:middle;background:${clr}"></span>
                  <span class="muted small" style="margin-left:6px;">${clr}</span>`;
      return `
        <tr>
          <td>${r.brandName || ''}</td>
          <td>${r.name || ''}</td>
          <td>${sw}</td>
          <td>${r.showAlways ? 'Sí' : 'No'}</td>
        </tr>
      `;
    }).join('');
  }

  // ------------- validación duplicado (marca + nombre) -------------
  function isDuplicateStyle(brandId, name){
    const target = String(name||'').trim().toLowerCase();
    return (STATE.styles||[]).some(s=>{
      return String(s.brandId||'')===String(brandId||'') &&
             String(s.name||'').trim().toLowerCase()===target;
    });
  }

  // ------------- init -------------
  document.addEventListener('DOMContentLoaded', async ()=>{
    try{
      await waitForSB();

      // botones top
      const addBtn = qs('#addStyleBtn');
      const newBtn = qs('#newStyleBtn'); // por si tu HTML usa este id
      on(addBtn, 'click', (e)=>{ setLastOpener(e.currentTarget); showModal('styleModal'); });
      on(newBtn, 'click', (e)=>{ setLastOpener(e.currentTarget); showModal('styleModal'); });

      on(qs('#refreshBtn'), 'click', ()=> loadStylesTable());

      // modal close/cancel
      on(qs('#closeStyleModal'), 'click', ()=> hideModal('styleModal'));
      on(qs('#cancelStyleBtn'), 'click', ()=> hideModal('styleModal'));

      // cargar data
      await fillBrands();
      await loadStylesTable();

      // submit nuevo estilo
      on(qs('#styleForm'), 'submit', async (ev)=>{
        ev.preventDefault();
        try{
          const form = ev.currentTarget || qs('#styleForm');

          const brandId    = (qs('#brandSelect')?.value || '').toString();
          const name       = (qs('#styleName')?.value || '').toString().trim();
          const colorInput = qs('#styleColor');
          const color      = (colorInput?.value || '#000000').toString();
          const showAlways = !!qs('#styleShowAlways')?.checked;

          if (!brandId || !name){
            return Swal.fire('Completar', 'Seleccioná la marca e ingresá el nombre del estilo.', 'info');
          }

          // duplicado por (marca + nombre), como en GAS
          if (isDuplicateStyle(brandId, name)){
            return Swal.fire('Duplicado', 'Ya existe un estilo con ese nombre para la marca.', 'warning');
          }

          await window.SBData.createStyle({ brandId, name, color, showAlways });

          hideModal('styleModal');
          Toast.fire({ icon:'success', title:'Estilo creado' });

          // recargar tabla
          await loadStylesTable();

          // limpiar form de manera segura
          if (form && typeof form.reset === 'function') form.reset();
          if (colorInput) colorInput.value = '#000000';

        }catch(err){
          console.error('[createStyle]', err);
          Swal.fire('Error', 'No pude crear el estilo', 'error');
        }
      });

    }catch(err){
      console.error('[styles_new init]', err);
      Swal.fire('Error', 'No pude inicializar la página de Estilos', 'error');
    }
  });
})();
