// === CONFIG ===
const API = 'https://script.google.com/macros/s/AKfycbzT6SIJLlUFjv5Pkg91aB4VFjVX8Wrf5Hp8ja2wWAA0tigQJ99_gPsXfsK39yOGWf4p/exec';

// Helpers
const $ = (s)=>document.querySelector(s);

// Banner de estado (Bootstrap alerts)
function showStatus(msg, type='info'){
  const el = $('#status');
  const map = { info:'alert-info', ok:'alert-success', error:'alert-danger' };
  el.className = `alert ${map[type]||'alert-info'} status show`;
  el.textContent = msg;
  if (type !== 'info') setTimeout(()=> el.classList.remove('show'), 2200);
}

// Reset seguro
function safeReset(id){ const f=document.getElementById(id); if(f && typeof f.reset==='function') f.reset(); }

// API
async function apiGet(){ const r = await fetch(API); return r.json(); }
async function apiPost(payload){ const r = await fetch(API,{method:'POST', body: JSON.stringify(payload)}); return r.json(); }

// Tablas
function renderTables(data){
  const tF = $('#tb-finished'), tL = $('#tb-labels'), empty = $('#empty-box');
  tF.innerHTML = (data.finished||[])
    .map(r=>`<tr><td>${r.Brand}</td><td>${r.Style}</td><td class="text-end">${r.OnHand}</td></tr>`)
    .join('') || `<tr><td colspan="3" class="text-muted">Sin datos</td></tr>`;
  tL.innerHTML = (data.labels||[])
    .map(r=>`<tr><td>${r.Brand}</td><td>${r.Style}</td><td class="text-end">${r.OnHand}</td></tr>`)
    .join('') || `<tr><td colspan="3" class="text-muted">Sin datos</td></tr>`;
  empty.textContent = (data.empty ?? 0);
}

// Gráficos (Terminados + Etiquetas) apilados por marca
let chartFinished, chartLabels;
function stackedByBrand(data, sourceKey){
  const styles = ['IPA','Kolsch','Porter','Honey'];
  const brands = ['Castelo','Big Rock'];
  const rows = (data[sourceKey]||[]);
  const onHand = (brand, style) => Number((rows.find(r=>r.Brand===brand && r.Style===style)?.OnHand)||0);
  const datasets = brands.map(b=>({ label:b, data: styles.map(s=> onHand(b,s)), stack:'s1' }));
  return { labels: styles, datasets };
}
function renderCharts(data){
  // Finished
  const cf = $('#chartFinished');
  const df = stackedByBrand(data,'finished');
  if (chartFinished) chartFinished.destroy();
  chartFinished = new Chart(cf, {
    type:'bar',
    data: df,
    options:{
      responsive:true,
      scales:{ x:{ stacked:true, ticks:{ color:'#e8eaed'} }, y:{ stacked:true, beginAtZero:true, ticks:{ color:'#e8eaed'} } },
      plugins:{ legend:{ labels:{ color:'#e8eaed' } } }
    }
  });
  // Labels
  const cl = $('#chartLabels');
  const dl = stackedByBrand(data,'labels');
  if (chartLabels) chartLabels.destroy();
  chartLabels = new Chart(cl, {
    type:'bar',
    data: dl,
    options:{
      responsive:true,
      scales:{ x:{ stacked:true, ticks:{ color:'#e8eaed'} }, y:{ stacked:true, beginAtZero:true, ticks:{ color:'#e8eaed'} } },
      plugins:{ legend:{ labels:{ color:'#e8eaed' } } }
    }
  });
}

async function load(){
  try{
    $('#tb-finished').innerHTML = `<tr><td colspan="3">Cargando…</td></tr>`;
    $('#tb-labels').innerHTML   = `<tr><td colspan="3">Cargando…</td></tr>`;
    $('#empty-box').textContent = 'Cargando…';
    const data = await apiGet();
    renderTables(data);
    renderCharts(data);
  }catch(e){ showStatus('Error al cargar: '+e.message,'error'); }
}

// --- Formularios ---
async function onProduceSubmit(ev){
  ev.preventDefault();
  const f = ev.currentTarget;
  const fd = new FormData(f);
  const items=[];
  for (const [k,v] of fd.entries()){
    if (k==='note') continue;
    const qty=Number(v||0); if(!qty) continue;
    const [brand,style]=k.split('|'); items.push({brand,style,qty});
  }
  const note = fd.get('note')||'';
  if (!items.length) return showStatus('Ingresá al menos una cantidad','error');

  try{
    showStatus('Guardando producción…','info');
    const res = await apiPost({ action:'batch_produce', items, note });
    if (res.ok){
      showStatus('Producción registrada ✔','ok');
      safeReset('form-produce');
      bootstrap.Modal.getInstance(document.getElementById('modalProduce'))?.hide();
      await load();
    } else showStatus(res.error||'No se pudo registrar','error');
  }catch(e){ showStatus('Error: '+e.message,'error'); }
}

async function onLabelsSubmit(ev){
  ev.preventDefault();
  const f = ev.currentTarget;
  const fd = new FormData(f);
  const items=[];
  for (const [k,v] of fd.entries()){
    if (k==='note') continue;
    const qty=Number(v||0); if(!qty) continue;
    const [brand,style]=k.split('|'); items.push({brand,style,qty});
  }
  const note = fd.get('note')||'';
  if (!items.length) return showStatus('Ingresá al menos una cantidad','error');

  try{
    showStatus('Guardando etiquetas…','info');
    const res = await apiPost({ action:'labels_in', items, note });
    if (res.ok){
      showStatus('Etiquetas ingresadas ✔','ok');
      safeReset('form-labels');
      bootstrap.Modal.getInstance(document.getElementById('modalLabels'))?.hide();
      await load();
    } else showStatus(res.error||'No se pudo registrar','error');
  }catch(e){ showStatus('Error: '+e.message,'error'); }
}

async function onEmptySubmit(ev){
  ev.preventDefault();
  const fd = new FormData(ev.currentTarget);
  const qty = Number(fd.get('qty')||0);
  const note = fd.get('note')||'';
  if (!qty) return showStatus('Ingresá una cantidad','error');

  try{
    showStatus('Guardando latas vacías…','info');
    const res = await apiPost({ action:'empty_in', qty, note });
    if (res.ok){
      showStatus('Latas vacías ingresadas ✔','ok');
      safeReset('form-empty');
      bootstrap.Modal.getInstance(document.getElementById('modalEmpty'))?.hide();
      await load();
    } else showStatus(res.error||'No se pudo registrar','error');
  }catch(e){ showStatus('Error: '+e.message,'error'); }
}

// --- SCRAP ---
function toggleScrapFields(){
  const type = document.querySelector('input[name="scrapType"]:checked')?.value || 'filled';
  $('#scrap-filled-fields').style.display = (type==='filled') ? '' : 'none';
  $('#scrap-empty-fields').style.display  = (type==='empty')  ? '' : 'none';
}

function toggleScrapFields(){
  const type = document.querySelector('input[name="scrapType"]:checked')?.value || 'filled';
  document.getElementById('scrap-filled-fields').style.display = (type==='filled') ? '' : 'none';
  document.getElementById('scrap-empty-fields').style.display  = (type==='empty')  ? '' : 'none';
}

async function onScrapSubmit(ev){
  ev.preventDefault();
  const type   = document.querySelector('input[name="scrapType"]:checked')?.value || 'filled';
  const reason = (document.getElementById('scrap-reason')?.value || '').trim();
  const detail = (document.getElementById('scrap-detail')?.value || '').trim();

  if (!reason) return showStatus('Seleccioná un motivo de scrap','error');

  // Armamos la nota combinando motivo + detalle
  const note = detail ? `[${reason}] ${detail}` : `[${reason}]`;

  const fd = new FormData(ev.currentTarget);

  try{
    if (type === 'filled'){
      // Scrap de latas llenas: descuenta SOLO terminados
      const actions=[];
      for (const [k,v] of fd.entries()){
        if (['note','scrapType','reason','detail'].includes(k)) continue;
        const qty = Number(v||0);
        if (!qty) continue;
        const [brand,style] = k.split('|');
        actions.push(apiPost({ action:'adjust_finished', brand, style, delta: -Math.abs(qty), note }));
      }
      if (!actions.length) return showStatus('Ingresá alguna cantidad','error');

      showStatus('Aplicando scrap (latas llenas)…','info');
      const res = await Promise.all(actions);
      const anyError = res.find(r=>!r.ok);
      if (anyError) return showStatus(anyError.error || 'Error al aplicar scrap','error');

      showStatus('Scrap aplicado ✔','ok');
      safeReset('form-scrap');
      bootstrap.Modal.getInstance(document.getElementById('modalScrap'))?.hide();
      await load();
    } else {
      // Scrap de envases vacíos: descuenta SOLO empty
      const qty = Number(fd.get('qty')||0);
      if (!qty) return showStatus('Ingresá una cantidad','error');

      showStatus('Aplicando scrap (envases)…','info');
      const res = await apiPost({ action:'adjust_empty', delta: -Math.abs(qty), note });
      if (!res.ok) return showStatus(res.error || 'No se pudo aplicar scrap','error');

      showStatus('Scrap aplicado ✔','ok');
      safeReset('form-scrap');
      bootstrap.Modal.getInstance(document.getElementById('modalScrap'))?.hide();
      await load();
    }
  }catch(e){
    showStatus('Error: '+e.message,'error');
  }
}


// Init
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('form-produce').addEventListener('submit', onProduceSubmit);
  document.getElementById('form-labels').addEventListener('submit', onLabelsSubmit);
  document.getElementById('form-empty').addEventListener('submit', onEmptySubmit);
  document.getElementById('btn-refresh').addEventListener('click', load);

  // Scrap
document.getElementById('form-scrap').addEventListener('submit', onScrapSubmit);
document.querySelectorAll('input[name="scrapType"]').forEach(r=> r.addEventListener('change', toggleScrapFields));
toggleScrapFields();

  load();
});
