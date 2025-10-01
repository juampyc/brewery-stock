// js/sales_deliveries.js
(function(){
  'use strict';

  const $  = (s, r=document)=> r.querySelector(s);
  const $$ = (s, r=document)=> Array.from(r.querySelectorAll(s));
  const on = (el, ev, fn)=> el && el.addEventListener(ev, fn, false);

  const Toast = Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false, timer:2200, timerProgressBar:true });

  function waitForSB(timeoutMs=7000){
    return new Promise((res, rej)=>{
      const t0 = Date.now();
      (function spin(){
        if (window.SB && window.SBData) return res();
        if (Date.now()-t0 > timeoutMs) return rej(new Error('SB timeout'));
        setTimeout(spin, 60);
      })();
    });
  }

  function normalizeApi(data){
    let list = [];
    if (Array.isArray(data)) list = data;
    else if (data && Array.isArray(data.remitos)) list = data.remitos;
    else if (data && Array.isArray(data.orders))  list = data.orders;

    return list.map(r => ({
      remito:  r.remito || r.Remito || r.id || '',
      client:  r.client || r.cliente || '',
      cliente: r.cliente || r.client || '',
      items:   r.lines || r.items || r.detalle || r.details || []
    }));
  }

  // Fila: checkbox habilitado SOLO si puede entregarse completo (stock >= pendiente)
  function rowHtml(it){
    const pending = Number(it.qty||0) || 0;
    const stock   = Number(it.available||0) || 0;
    const deliverable = stock >= pending;
    const note  = it.note ? `<div class="small muted">${it.note||''}</div>` : '';
    const rowCls = deliverable ? '' : ' class="muted"';
    const badge = deliverable ? `<span class="chip ok" title="Entregable">✓</span>`
                              : `<span class="chip no" title="Sin stock suficiente">×</span>`;

    return `
      <tr data-item-code="${it.itemCode||''}"
          data-brand-id="${it.brandId||''}"
          data-style-id="${it.styleId||''}"
          data-pending="${pending}"
          data-available="${stock}"
          data-deliverable="${deliverable?'1':'0'}"${rowCls}>
        <td class="center">
          <input type="checkbox" class="chk" ${deliverable ? '' : 'disabled'}>
        </td>
        <td>${it.brandName||''}</td>
        <td>${it.styleName||''}${note}</td>
        <td class="right">${pending}</td>
        <td>${it.uom||'u'}</td>
        <td class="right">${stock}</td>
        <td class="center">${badge}</td>
      </tr>`;
  }

  function cardHtml(rem){
    const hasItems = (rem.items||[]).length>0;
    const itemsHtml = hasItems
      ? rem.items.map(rowHtml).join('')
      : `<tr><td colspan="7" class="center muted">Sin ítems</td></tr>`;

    return `
      <div class="card remito" data-remito="${rem.remito}">
        <div class="card__header" style="gap:12px; align-items:center;">
          <div>
            <div class="muted small">Remito</div>
            <div class="h5">${rem.remito||''}</div>
          </div>
          <div>
            <div class="muted small">Cliente</div>
            <div class="cliente">${rem.cliente||rem.client||''}</div>
          </div>
          <div class="spacer"></div>
          <div class="btns">
            <button class="btn btn-primary btn-process" data-remito="${rem.remito}">Registrar entrega</button>
          </div>
        </div>
        <div class="card__content">
          <table class="table compact lines">
            <thead>
              <tr>
                <th class="center" style="width:42px;">
                  <input type="checkbox" class="chk-all" title="Marcar todos">
                </th>
                <th>Marca</th>
                <th>Estilo</th>
                <th class="right">Pend.</th>
                <th>U.M.</th>
                <th class="right">Stock</th>
                <th class="center">Estado</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
        </div>
      </div>`;
  }

  // Construye las líneas seleccionadas: entrega SIEMPRE cantidad completa pendiente del ítem
  function collectSelectedLines(card){
    const rows = $$('tbody tr', card);
    const out = [];
    rows.forEach(tr=>{
      const deliverable = tr.getAttribute('data-deliverable') === '1';
      if (!deliverable) return;
      const chk = $('.chk', tr);
      if (!chk || !chk.checked) return;

      const pending = Number(tr.getAttribute('data-pending')||0)||0;
      if (pending <= 0) return;

      out.push({
        itemCode:  tr.getAttribute('data-item-code')||'',
        brandId:   tr.getAttribute('data-brand-id')||'',
        styleId:   tr.getAttribute('data-style-id')||'',
        brandName: $('td:nth-child(2)', tr)?.textContent.trim() || '',
        styleName: $('td:nth-child(3)', tr)?.textContent.trim() || '',
        uom:       $('td:nth-child(5)', tr)?.textContent.trim() || 'u',
        qty:       pending  // cantidades iguales a lo pendiente
      });
    });
    return out;
  }

  async function renderRemitos(rows){
    const cont = $('#remitosContainer');
    if (!cont) return;

    const list = normalizeApi(rows);

    if (!list.length){
      cont.innerHTML = `<div class="muted center" style="padding:16px;">No hay remitos pendientes.</div>`;
      return;
    }

    cont.innerHTML = list.map(cardHtml).join('');

    // Estado visual de entregados (marca ✓ si ya se entregó esa línea alguna vez)
    let deliveredMap = {};
    try{
      await waitForSB();
      deliveredMap = await window.SBData.listDeliveredRefs({ days: 180 });
    }catch(e){ console.warn('[delivered refs]', e); }

    $$('.card.remito').forEach(card=>{
      const rem = card.getAttribute('data-remito') || '';
      const dset = deliveredMap[rem] || {};
      $$('tbody tr', card).forEach(tr=>{
        const code = tr.getAttribute('data-item-code') || '';
        const chip = $('.chip', tr);
        if (!chip) return;
        if (code && dset[code]){
          chip.classList.remove('no'); chip.classList.add('ok');
          chip.textContent = '✓'; chip.setAttribute('title','Entregado');
          tr.classList.add('delivered');
        }
      });

      // “Marcar todos”: solo afecta filas entregables
      const master = $('.chk-all', card);
      if (master){
        on(master, 'change', ()=>{
          const check = master.checked;
          $$('tbody tr', card).forEach(tr=>{
            if (tr.getAttribute('data-deliverable')!=='1') return;
            const cb = $('.chk', tr);
            if (cb) cb.checked = check;
          });
        });
      }
    });

    // Delegación: Registrar entrega
    on(cont, 'click', async (ev)=>{
      const btn = ev.target.closest('.btn-process');
      if (!btn) return;

      const card = btn.closest('.card.remito'); if (!card) return;
      const remito = card.getAttribute('data-remito')||'';
      const cliente = $('.cliente', card)?.textContent || '';

      const selected = collectSelectedLines(card);
      if (!selected.length){
        return Swal.fire('Sin selección', 'Marcá al menos un ítem entregable.', 'info');
      }

      try{
        await waitForSB();

        // 1) Log en sales_processed
        await window.SBData.logDeliveries({ remito, client: cliente, lines: selected, user: 'web' });

        // 2) Descuento de FINAL (FIFO)
        await window.SBData.consumeFinalStock({
          lines: selected.map(l=>({ brandId:l.brandId, styleId:l.styleId, qty:l.qty })),
          remito
        });

        Toast.fire({ icon:'success', title:`Entregado ${selected.length} ítems` });
        await loadRemitos();
        await refreshDelivered();
        await refreshDeliveredItems();
      }catch(err){
        console.error('[process]', err);
        Swal.fire('Error', 'No pude registrar la entrega', 'error');
      }
    });
  }

  // ========= Tablas inferiores =========
  async function refreshDelivered(){
    const tb = $('#deliveredTable tbody'); if (!tb) return;
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:12px;">Cargando...</td></tr>';
    try{
      await waitForSB();
      const rows = await window.SBData.listDelivered({ days: 180 });
      if (!rows.length){
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:12px;">Sin datos</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(r=>{
        const d = new Date(r.assignedAt||Date.now());
        const dd = String(d.getDate()).padStart(2,'0');
        const mm = String(d.getMonth()+1).padStart(2,'0');
        const yyyy = d.getFullYear();
        const hh = String(d.getHours()).padStart(2,'0');
        const mi = String(d.getMinutes()).padStart(2,'0');
        return `<tr>
          <td>${r.remito||''}</td>
          <td>${r.client||''}</td>
          <td>${r.items||0}</td>
          <td>${r.qty||0}</td>
          <td>${dd}-${mm}-${yyyy} ${hh}:${mi}</td>
          <td>${r.user||''}</td>
        </tr>`;
      }).join('');
    }catch(err){
      console.error('[delivered]', err);
      tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:12px;color:#b00;">Error</td></tr>';
    }
  }

  async function refreshDeliveredItems(){
    const tb = $('#deliveredItemsTable tbody'); if (!tb) return;
    tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:12px;">Cargando...</td></tr>';
    try{
      await waitForSB();
      const rows = await window.SBData.listDeliveredItems({ days: 180 });
      if (!rows.length){
        tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:12px;">Sin datos</td></tr>';
        return;
      }
      tb.innerHTML = rows.map(r=>`
        <tr>
          <td>${r.brandName||''}</td>
          <td>${r.styleName||''}</td>
          <td>${r.uom||''}</td>
          <td>${r.remitos||0}</td>
          <td>${r.qty||0}</td>
        </tr>
      `).join('');
    }catch(err){
      console.error('[delivered items]', err);
      tb.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:12px;color:#b00;">Error</td></tr>';
    }
  }

  // ========= Carga =========
  async function loadRemitos(){
    const cont = $('#remitosContainer');
    if (cont) cont.innerHTML = `<div class="center muted" style="padding:16px;">Cargando los remitos…</div>`;

    try{
      await waitForSB();
      const rows = await window.SBData.listPendingRemitos();
      await renderRemitos(rows);
    }catch(err){
      console.error('[loadRemitos]', err);
      if (cont) cont.innerHTML = `<div class="center" style="color:#b00;padding:16px;">Error cargando remitos</div>`;
      Toast.fire({ icon:'error', title:'No pude cargar los remitos' });
    }
  }

  // ========= Init =========
  document.addEventListener('DOMContentLoaded', ()=>{
    on($('#refreshBtn'), 'click', ()=>{ loadRemitos(); refreshDelivered(); refreshDeliveredItems(); });
    loadRemitos().catch(e=>console.error('init remitos', e));
    refreshDelivered().catch(e=>console.error('init delivered', e));
    refreshDeliveredItems().catch(e=>console.error('init delivered items', e));
  });
})();
