// === CONFIG === (tu URL de Apps Script /exec)
const API = 'https://script.google.com/macros/s/AKfycbzT6SIJLlUFjv5Pkg91aB4VFjVX8Wrf5Hp8ja2wWAA0tigQJ99_gPsXfsK39yOGWf4p/exec';

// Helpers
const $ = (s)=>document.querySelector(s);

// Banner de estado (Bootstrap alerts)
function showStatus(msg, type='info'){
  const el = $('#status');
  const map = { info:'alert-info', ok:'alert-success', error:'alert-danger' };
  el.className = `alert ${map[type]||'alert-info'} status show`;
  el.textContent = msg;
  if (type !== 'info') setTimeout(()=> el.classList.remove('show'), 2500);
}

// Reset seguro de form
function safeReset(id){
  try{
    const form = document.getElementById(id);
    if (form && typeof form.reset === 'function') form.reset();
  }catch{}
}

// API
async function apiGet(){ const r = await fetch(API); return r.json(); }
async function apiPost(payload){ const r = await fetch(API,{method:'POST', body: JSON.stringify(payload)}); return r.json(); }

// Render tablas
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

// Render gráfico (Terminados por estilo, apilado por marca)
let chartFinished;
function renderChart(data){
  const styles = ['IPA','Kolsch','Porter','Honey'];
  const brands = ['Castelo','Big Rock'];
  const onHandBy = (brand, style) => {
    const row = (data.finished||[]).find(r => r.Brand===brand && r.Style===style);
    return Number(row?.OnHand||0);
  };
  const ds = brands.map((b)=>({
    label: b,
    data: styles.map(s=> onHandBy(b,s)),
    // Chart.js asigna colores por defecto; no seteamos para mantenerlo simple
    stack: 'stack1'
  }));
  const ctx = document.getElementById('chartFinished');
  if (chartFinished) chartFinished.destroy();
  chartFinished = new Chart(ctx, {
    type:'bar',
    data:{ labels: styles, datasets: ds },
    options:{
      responsive:true,
      scales:{ x:{ stacked:true }, y:{ stacked:true, beginAtZero:true } },
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
    renderChart(data);
  }catch(e){ showStatus('Error al cargar: '+e.message,'error'); }
}

// Handlers
async function onProduceSubmit(ev){
  ev.preventDefault();
  const form = ev.currentTarget;
  const fd = new FormData(form);
  const items = [];
  for (const [k,v] of fd.entries()){
    if (k==='note') continue;
    const qty = Number(v||0);
    if (!qty) continue;
    const [brand,style] = k.split('|');
    items.push({brand, style, qty});
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
  const form = ev.currentTarget;
  const fd = new FormData(form);
  const items = [];
  for (const [k,v] of fd.entries()){
    if (k==='note') continue;
    const qty = Number(v||0);
    if (!qty) continue;
    const [brand,style] = k.split('|');
    items.push({brand, style, qty});
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
  const qty  = Number(fd.get('qty')||0);
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

// Init
document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('form-produce').addEventListener('submit', onProduceSubmit);
  document.getElementById('form-labels').addEventListener('submit', onLabelsSubmit);
  document.getElementById('form-empty').addEventListener('submit', onEmptySubmit);
  document.getElementById('btn-refresh').addEventListener('click', load);
  load();
});