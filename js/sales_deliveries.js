// js/sales_deliveries.js
(function(){
  'use strict';

  // URL del GAS que devuelve pendientes (DB_pedidos)
  const WEB_APP_URL = (window.APP_CONFIG && (window.APP_CONFIG.GAS_WEB_APP_URL_SALES || window.APP_CONFIG.GAS_WEB_APP_URL))
    || window.GAS_WEB_APP_URL_SALES
    || window.GAS_WEB_APP_URL
    || '';

  // helpers
  const qs  = (s, r) => (r||document).querySelector(s);
  const qsa = (s, r) => Array.from((r||document).querySelectorAll(s));
  const on  = (el, ev, fn) => el && el.addEventListener(ev, fn, false);
  const Toast = (icon, title) => Swal.fire({ toast:true, position:'top-end', icon, title, showConfirmButton:false, timer:2000, timerProgressBar:true });

  function esc(s){
    return (s==null?'':String(s))
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }

  const container = qs('#remitosContainer');
  const refreshBtn = qs('#refreshBtn');
  const deliveredTBody = qs('#deliveredTable tbody');
  const deliveredItemsTBody = qs('#deliveredItemsTable tbody');

  on(refreshBtn, 'click', () => { loadRemitos(); loadDelivered(); });

  // ---------- Pendientes (GAS) ----------
  async function loadRemitos(){
    if (!WEB_APP_URL){
      container.innerHTML = '<div class="card">Configura GAS_WEB_APP_URL_SALES en js/config.js</div>';
      return;
    }
    container.innerHTML = '<div class="card">Cargando…</div>';

    try{
      // stock FINAL por marca/estilo
      const stockMap = await (window.SBData?.getFinalStockMap ? window.SBData.getFinalStockMap() : Promise.resolve({}));

      const url = WEB_APP_URL + (WEB_APP_URL.includes('?') ? '&' : '?') + 'action=sales_pending';
      const res = await fetch(url, { method:'GET' });
      if (!res.ok) throw new Error('GET '+res.status+' '+res.statusText);
      const data = await res.json();
      renderRemitos(data, stockMap||{});
    }catch(err){
      console.error(err);
      container.innerHTML = '<div class="card">Error cargando datos</div>';
      Toast('error','Error al cargar pendientes');
    }
  }

  async function renderRemitos(remitos){
    const container = qs('#remitos');
    if (!container) return;

    if (!remitos || remitos.length === 0){
      container.innerHTML = '<div class="card">Sin remitos pendientes para descontar.</div>';
      return;
    }

    container.innerHTML = '';

    // 👇 Pre-cargamos mapa de líneas entregadas por remito
    const deliveredMaps = await Promise.all(remitos.map(r => deliveredMapFor(r.remito)));

    remitos.forEach((r, i) => {
      container.appendChild(remitoCard(r, deliveredMaps[i] || {}));
    });
  }


  function remitoCard(r, deliveredByKey = {}){
    // r.lines: [{ lineId, brandId, brandName, styleId, styleName, uom, qty, stock }]
    const rowsHtml = (r.lines||[]).map(line => {
      const key = String(line.brandId||'') + '|' + String(line.styleId||'') + '|' + String((line.uom||'').toUpperCase());
      const deliveredQty = Number(deliveredByKey[key]||0);
      const orderedQty   = Number(line.qty||0);
      const done = deliveredQty >= orderedQty && orderedQty > 0;

      const statusCell = done
        ? '<span class="ok" title="Entregado">✓</span>'
        : '<input type="checkbox" class="chk-line">';

      const qtyCell = done
        ? `<span class="muted">${orderedQty}</span>`
        : `<input type="number" class="qty-inp" min="1" max="${orderedQty}" value="${orderedQty}">`;

      const rowCls = done ? ' class="delivered"' : '';

      return `
        <tr${rowCls}
            data-id="${escapeHtml(line.lineId)}"
            data-brandid="${escapeHtml(line.brandId||'')}"
            data-brandname="${escapeHtml(line.brandName||'')}"
            data-styleid="${escapeHtml(line.styleId||'')}"
            data-stylename="${escapeHtml(line.styleName||'')}"
            data-uom="${escapeHtml(line.uom||'')}"
            data-qty="${orderedQty}">
          <td>${statusCell}</td>
          <td>${escapeHtml(line.brandName||'')}</td>
          <td>${escapeHtml(line.styleName||'')}</td>
          <td>${qtyCell}</td>
          <td>${escapeHtml(line.uom||'')}</td>
          <td class="right">${fmtInt(line.stock||0)}</td>
        </tr>
      `;
    }).join('');

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card__title">
        <div>
          <div class="muted small">Remito</div>
          <div><strong>${escapeHtml(r.remito||'')}</strong></div>
        </div>
        <div>
          <div class="muted small">Cliente</div>
          <div>${escapeHtml(r.client||'')}</div>
        </div>
        <div class="grow"></div>
        <div>
          <button class="btn ghost btn-select-all">Descontar TODO</button>
          <button class="btn primary btn-process">Descontar seleccionados</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table lines">
          <thead>
            <tr>
              <th style="width:60px;">Sel./OK</th>
              <th>Marca</th>
              <th>Estilo</th>
              <th style="width:120px;">Cantidad</th>
              <th style="width:80px;">U.M.</th>
              <th style="width:120px;" class="right">Stock</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;

    // Botón "Descontar TODO" => tilda solo las filas NO entregadas (las que tienen checkbox)
    on(card.querySelector('.btn-select-all'), 'click', ()=>{
      card.querySelectorAll('input.chk-line').forEach(cb=>{
        cb.checked = true;
        const tr = cb.closest('tr');
        const q = tr && tr.querySelector('.qty-inp');
        if (q) {
          const max = Number(tr.getAttribute('data-qty')||0) || 0;
          if (max>0) q.value = String(max);
        }
      });
    });

    // Botón procesar (tu lógica existente que arma lines desde los checkboxes)
    on(card.querySelector('.btn-process'), 'click', async ()=>{
      await processRemito(r, card);
    });

    return card;
  }


  // ---------- Entregados (Supabase) ----------
  function fmtDate(dateStr){
    if(!dateStr) return '';
    const d = new Date(dateStr);
    if(isNaN(d)) return dateStr;
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2,'0');
    const mi = String(d.getMinutes()).padStart(2,'0');
    return `${dd}/${mm}/${yy} ${hh}:${mi}`;
  }

  // Devuelve un mapa por remito: "brandId|styleId|UOM" -> qty entregada (sumada)
  async function deliveredMapFor(remito){
    try{
      const { data, error } = await window.SB
        .from('sales_processed')
        .select('brand_id,style_id,uom,qty')
        .eq('remito', remito);
      if (error) throw error;
      const map = {};
      (data||[]).forEach(r=>{
        const key = String(r.brand_id||'') + '|' + String(r.style_id||'') + '|' + String((r.uom||'').toUpperCase());
        map[key] = (map[key]||0) + (Number(r.qty||0)||0);
      });
      return map;
    }catch(e){
      console.error('[deliveredMapFor]', e);
      return {};
    }
  }


  async function loadDelivered(){
    try{
      if (deliveredTBody) deliveredTBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;">Cargando…</td></tr>';
      if (deliveredItemsTBody) deliveredItemsTBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;">Cargando…</td></tr>';

      const [remitos, items] = await Promise.all([
        window.SBData.listDelivered({ days: 90 }),
        window.SBData.listDeliveredItems({ days: 90 })
      ]);

      if (deliveredTBody){
        deliveredTBody.innerHTML = remitos.length ? remitos.map(it=>`
          <tr>
            <td>${esc(it.remito||'')}</td>
            <td>${esc(it.client||'')}</td>
            <td style="text-align:right;">${Number(it.items||0)}</td>
            <td style="text-align:right;">${Number(it.qty||0)}</td>
            <td>${fmtDate(it.assignedAt||'')}</td>
            <td>${esc(it.user||'')}</td>
          </tr>
        `).join('') : '<tr><td colspan="6" style="text-align:center;padding:18px;">Sin entregas aún</td></tr>';
      }

      if (deliveredItemsTBody){
        deliveredItemsTBody.innerHTML = items.length ? items.map(it=>`
          <tr>
            <td>${esc(it.brandName||'')}</td>
            <td>${esc(it.styleName||'')}</td>
            <td>${esc(it.uom||'')}</td>
            <td style="text-align:right;">${Number(it.remitos||0)}</td>
            <td style="text-align:right;">${Number(it.qty||0)}</td>
          </tr>
        `).join('') : '<tr><td colspan="5" style="text-align:center;padding:18px;">Sin datos</td></tr>';
      }

    }catch(err){
      console.error('[delivered]', err);
      if (deliveredTBody) deliveredTBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;">Error</td></tr>';
      if (deliveredItemsTBody) deliveredItemsTBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;">Error</td></tr>';
      Toast('error','Error al cargar entregados');
    }
  }

  // ---------- Procesar (descontar y loguear) ----------
  async function process(remito, rowEls){
    if (!rowEls || !rowEls.length){
      Toast('warning','No hay ítems seleccionados');
      return;
    }
    const lines = rowEls.map(tr=>{
      const tds = tr.children;
      return {
        lineId: tr.getAttribute('data-id'),
        itemCode: tds[1].textContent.trim(),
        brandId: tr.getAttribute('data-brandid')||'',
        brandName: tr.getAttribute('data-brandname')||'',
        styleId: tr.getAttribute('data-styleid')||'',
        styleName: tr.getAttribute('data-stylename')||'',
        qty: Number(tds[4].textContent.trim()||0),
        uom: tr.getAttribute('data-uom')||''
      };
    });

    const ok = await Swal.fire({
      icon:'question',
      title:'¿Confirmar descuento de stock?',
      html:`Remito <b>${esc(remito.remito)}</b> · Ítems: <b>${lines.length}</b>`,
      showCancelButton:true, confirmButtonText:'Sí, descontar', cancelButtonText:'Cancelar'
    });
    if (!ok.isConfirmed) return;

    try{
      disableAll(true);

      // 1) baja de FINAL
      await window.SBData.consumeFinalStock({ lines, remito: remito.remito||'' });

      // 2) log de entregas
      await window.SBData.logDeliveries({
        remito: remito.remito,
        client: remito.client || remito.cliente || '',
        lines,
        user: (window.APP_USER||'web')
      });

      // 3) marcar en GAS (opcional)
      try{
        if (WEB_APP_URL){
          const url = WEB_APP_URL + (WEB_APP_URL.includes('?') ? '&' : '?') + 'action=sales_mark_delivered';
          await fetch(url, {
            method:'POST',
            headers:{'Content-Type':'text/plain;charset=utf-8'},
            body: JSON.stringify({ remito: remito.remito, lineIds: lines.map(l=>l.lineId) })
          });
        }
      }catch(_){ /* si falla igual quedó en Supabase */ }

      Toast('success','Descontado');
      loadRemitos();
      loadDelivered();

    }catch(err){
      console.error('[process]', err);
      if (String(err.message||'').includes('NO_FINAL_STOCK')){
        Swal.fire('Sin stock','No hay stock FINAL suficiente para al menos uno de los ítems.','error');
      }else{
        Swal.fire('Error', String(err.message||err), 'error');
      }
    }finally{
      disableAll(false);
    }
  }

  function disableAll(dis){
    qsa('button').forEach(b=> b.disabled = dis);
    qsa('input[type=checkbox]').forEach(c=>{
      if (c.getAttribute('disabled')==null) c.disabled = dis;
    });
  }

  // init
  loadRemitos();
  loadDelivered();
})();
