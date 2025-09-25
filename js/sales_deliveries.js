(function(){
  'use strict';

  const WEB_APP_URL = (window.APP_CONFIG && window.APP_CONFIG.GAS_WEB_APP_URL_SALES)
    || window.GAS_WEB_APP_URL_SALES
    || (window.APP_CONFIG && window.APP_CONFIG.GAS_WEB_APP_URL)
    || window.GAS_WEB_APP_URL
    || '';

  function $(sel, el){ if(!el) el=document; return el.querySelector(sel); }
  function $all(sel, el){ if(!el) el=document; return Array.from(el.querySelectorAll(sel)); }
  function Toast(icon, title){ return Swal.fire({ toast:true, position:'top-end', icon, title, showConfirmButton:false, timer:2000, timerProgressBar:true }); }

  const container = $('#remitosContainer');
  const refreshBtn = $('#refreshBtn');
  const deliveredTBody = $('#deliveredTable tbody');
  const deliveredItemsTBody = $('#deliveredItemsTable tbody');
  refreshBtn?.addEventListener('click', () => { loadRemitos(); loadDelivered(); });

  async function loadRemitos(){
    if (!WEB_APP_URL){ container.innerHTML = '<div class="card">Configura GAS_WEB_APP_URL_SALES en js/config.js</div>'; return; }
    container.innerHTML = '<div class="card">Cargando...</div>';
    try {
      const url = WEB_APP_URL + (WEB_APP_URL.includes('?') ? '&' : '?') + 'action=sales_pending';
      const res = await fetch(url, { method:'GET' });
      if (!res.ok) throw new Error('GET ' + res.status + ' ' + res.statusText);
      const data = await res.json();
      renderRemitos(data);
    } catch (err) {
      console.error(err);
      container.innerHTML = '<div class="card">Error cargando datos</div>';
      Toast('error', 'Error al cargar pendientes');
    }
  }

  async function loadDelivered(){
    if (!WEB_APP_URL){ return; }
    if (deliveredTBody) deliveredTBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;">Cargando...</td></tr>';
    if (deliveredItemsTBody) deliveredItemsTBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;">Cargando...</td></tr>';
    try{
      const url = WEB_APP_URL + (WEB_APP_URL.includes('?') ? '&' : '?') + 'action=sales_delivered';
      const res = await fetch(url, { method:'GET' });
      if (!res.ok) throw new Error('GET ' + res.status + ' ' + res.statusText);
      const data = await res.json();
      renderDelivered((data && data.delivered) || []);
      renderDeliveredItems((data && data.items) || []);
    } catch(err){
      console.error(err);
      if (deliveredTBody) deliveredTBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;">Error</td></tr>';
      if (deliveredItemsTBody) deliveredItemsTBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;">Error</td></tr>';
      Toast('error', 'Error al cargar entregados');
    }
  }

  function renderRemitos(data){
    const remitos = (data && data.remitos) || [];
    if (remitos.length === 0){
      container.innerHTML = '<div class="card">Sin remitos pendientes para descontar.</div>';
      return;
    }
    container.innerHTML = '';
    remitos.forEach(r => container.appendChild(remitoCard(r)));
  }

  function remitoCard(r){
    const rowsHtml = r.lines.map(line => `
      <tr data-id="${escapeHtml(line.lineId)}"
          data-brandid="${escapeHtml(line.brandId||'')}"
          data-brandname="${escapeHtml(line.brandName||'')}"
          data-styleid="${escapeHtml(line.styleId||'')}"
          data-stylename="${escapeHtml(line.styleName||'')}"
          data-uom="${escapeHtml(line.uom||'')}"
          data-available="${line.available==null?'':Number(line.available)}"
          data-ok="${line.okToSelect?'1':'0'}"
          title="${escapeHtml(line.note||'')}">
        <td><input type="checkbox" class="chk-line" ${line.okToSelect?'':'disabled'}></td>
        <td>${escapeHtml(line.itemCode)}</td>
        <td>${escapeHtml(line.brandName||line.brandId||'')}</td>
        <td>${escapeHtml(line.styleName||line.styleId||'')}</td>
        <td style="text-align:right;">${Number(line.qty||0)}</td>
        <td>${escapeHtml(line.uom||'')}</td>
        <td style="text-align:right;">${line.available==null?'—':Number(line.available)}</td>
      </tr>
    `).join('');

    const card = document.createElement('section');
    card.className = 'card';
    card.innerHTML = `
      <div class="flex" style="align-items:baseline;">
        <h3 style="margin:0;">Remito ${escapeHtml(r.remito)}</h3>
        <span class="badge badge-pending">Pendiente</span>
        <div class="spacer"></div>
        <div class="muted">Cliente: <strong>${escapeHtml(r.cliente||r.client||'')}</strong>${r.timestamp ? ' · Fecha: '+escapeHtml(r.timestamp) : ''}</div>
      </div>
      <div style="overflow:auto; margin-top:12px;">
        <table class="table">
          <thead>
            <tr>
              <th style="width:34px;"><input type="checkbox" class="chk-all"></th>
              <th>Ítem</th>
              <th>Marca</th>
              <th>Estilo</th>
              <th style="text-align:right;">Cantidad</th>
              <th>U.M.</th>
              <th style="text-align:right;">Stock</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
      <div class="actions" style="margin-top:12px; display:flex; gap:8px;">
        <button class="btn btn-primary btn-proc">Descontar seleccionados</button>
        <button class="btn btn-primary btn-proc-all">Descontar TODO</button>
      </div>
    `;

    const chkAll = card.querySelector('.chk-all');
    const rows = $all('tbody tr', card);
    const btnProc = card.querySelector('.btn-proc');
    const btnProcAll = card.querySelector('.btn-proc-all');

    function enabledRows(){ return rows.filter(tr => !tr.querySelector('.chk-line').disabled); }

    chkAll.addEventListener('change', (e)=>{
      const on = e.target.checked;
      rows.forEach(tr => {
        const c = tr.querySelector('.chk-line');
        if (!c.disabled) c.checked = on;
      });
    });

    btnProc.addEventListener('click', () => process(r, rows.filter(tr => tr.querySelector('.chk-line').checked)));
    btnProcAll.addEventListener('click', () => process(r, enabledRows()));

    if (enabledRows().length === 0){
      btnProc.disabled = true;
      btnProcAll.disabled = true;
    }

    return card;
  }

  async function process(remito, rowEls){
    if (!rowEls || rowEls.length === 0){
      Toast('warning', 'No hay ítems seleccionados');
      return;
    }

    const lines = rowEls.map(tr => {
      const id = tr.getAttribute('data-id');
      const tds = tr.children;
      return {
        lineId: id,
        itemCode: tds[1].textContent.trim(),
        brandId: tr.getAttribute('data-brandid') || '',
        brandName: tr.getAttribute('data-brandname') || '',
        styleId: tr.getAttribute('data-styleid') || '',
        styleName: tr.getAttribute('data-stylename') || '',
        qty: Number(tds[4].textContent.trim()||0),
        uom: tr.getAttribute('data-uom') || ''
      };
    });

    const confirm = await Swal.fire({
      icon: 'question',
      title: '¿Confirmar descuento de stock?',
      html: `Remito <b>${escapeHtml(remito.remito)}</b> · Ítems: <b>${lines.length}</b>`,
      showCancelButton: true,
      confirmButtonText: 'Sí, descontar',
      cancelButtonText: 'Cancelar'
    });
    if (!confirm.isConfirmed) return;

    try {
      disableAll(true);
      const payload = { action:'process_sale', remito: remito.remito, client: (remito.client || remito.cliente || ''), lines, user: (window.APP_USER||'web') };
      const res = await fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type':'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('POST ' + res.status + ' ' + res.statusText);
      const data = await res.json();
      if (data && data.ok){
        Toast('success', `Descontado (${data.processed||0})`);
        loadRemitos();
        loadDelivered();
      } else {
        throw new Error(data && data.error || 'Error desconocido');
      }
    } catch (err) {
      console.error(err);
      Swal.fire('Error', String(err.message||err), 'error');
    } finally {
      disableAll(false);
    }
  }

  function renderDelivered(items){
    if (!deliveredTBody) return;
    if (!items || !items.length){
      deliveredTBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:18px;">Sin entregas aún</td></tr>';
      return;
    }
    function fmtDate(dateStr){
      if(!dateStr) return '';
      const d = new Date(dateStr);
      if(isNaN(d.getTime())) return dateStr;
      const dd = String(d.getDate()).padStart(2,'0');
      const mm = String(d.getMonth()+1).padStart(2,'0');
      const yy = String(d.getFullYear()).slice(-2);
      const hh = String(d.getHours()).padStart(2,'0');
      const mi = String(d.getMinutes()).padStart(2,'0');
      return `${dd}/${mm}/${yy} ${hh}:${mi}`;
    }
    const out = items.map(it => `
      <tr>
        <td>${escapeHtml(it.remito||'')}</td>
        <td>${escapeHtml(it.client||'')}</td>
        <td style="text-align:right;">${Number(it.items||0)}</td>
        <td style="text-align:right;">${Number(it.qty||0)}</td>
        <td>${fmtDate(it.assignedAt||'')}</td>
        <td>${escapeHtml(it.user||'')}</td>
      </tr>
    `);
    deliveredTBody.innerHTML = out.join('');
  }

  function renderDeliveredItems(items){
    if (!deliveredItemsTBody) return;
    if (!items || !items.length){
      deliveredItemsTBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:18px;">Sin datos</td></tr>';
      return;
    }
    const out = items.map(it => `
      <tr>
        <td>${escapeHtml(it.brandName||it.brandId||'')}</td>
        <td>${escapeHtml(it.styleName||it.styleId||'')}</td>
        <td>${escapeHtml(it.uom||'')}</td>
        <td style="text-align:right;">${Number(it.remitos||0)}</td>
        <td style="text-align:right;">${Number(it.qty||0)}</td>
      </tr>
    `);
    deliveredItemsTBody.innerHTML = out.join('');
  }

  function disableAll(disabled){
    $all('button').forEach(b => b.disabled = disabled);
    $all('input[type=checkbox]').forEach(c => c.disabled = disabled || c.getAttribute('disabled')!=null);
  }

  function escapeHtml(s){
    return (s==null?'':String(s))
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#39;');
  }

  // init
  loadRemitos();
  loadDelivered();
})();