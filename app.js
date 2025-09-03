// Reemplazar por tu URL de Web App de Apps Script
const API = 'https://script.google.com/macros/s/AKfycbwelmBTwB2ctPuEOSyiggZmo2T5AQKZ2oFp55lsUwHrHV6PJK_z25HF2t9W50PfzZg2/exec';

const $ = (s)=>document.querySelector(s);
function showStatus(msg,type='info'){const el=$('#status');el.textContent=msg;el.classList.remove('hidden');el.className='status ' + (type==='error'?'err':(type==='ok'?'ok':'')); if(type!=='loading'){ setTimeout(()=>el.classList.add('hidden'),3000); }}

async function apiGet(){ const r = await fetch(API); return r.json(); }
async function apiPost(payload){ const r = await fetch(API, { method:'POST', body: JSON.stringify(payload) }); return r.json(); }

function renderStocks(data){
  const tbF = $('#tb-finished'), tbL = $('#tb-labels'), empty = $('#empty-box');
  tbF.innerHTML = (data.finished||[]).map(r=>`<tr><td>${r.Brand}</td><td>${r.Style}</td><td>${r.OnHand}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sin datos</td></tr>';
  tbL.innerHTML = (data.labels||[]).map(r=>`<tr><td>${r.Brand}</td><td>${r.Style}</td><td>${r.OnHand}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sin datos</td></tr>';
  empty.textContent = (data.empty ?? 0);
}

async function load(){
  try{
    $('#tb-finished').innerHTML = '<tr><td colspan="3">Cargando…</td></tr>';
    $('#tb-labels').innerHTML = '<tr><td colspan="3">Cargando…</td></tr>';
    $('#empty-box').textContent = 'Cargando…';
    const data = await apiGet();
    renderStocks(data);
  }catch(e){ showStatus('Error al cargar: '+e.message,'error'); }
}

function parseGrid(form){
  const fd = new FormData(form);
  const items = [];
  for (const [k,v] of fd.entries()){
    if (k==='note') continue;
    const qty = Number(v||0);
    if (!qty) continue;
    const [brand,style] = k.split('|');
    items.push({brand, style, qty});
  }
  const note = fd.get('note') || '';
  return { items, note };
}

async function onProduceSubmit(ev){
  ev.preventDefault();
  const payload = parseGrid(ev.currentTarget);
  if (!payload.items.length){ showStatus('Ingresá al menos una cantidad','error'); return; }
  try{
    showStatus('Procesando producción…','loading');
    const res = await apiPost({ action:'batch_produce', ...payload });
    if (res.ok){ showStatus('Producción registrada ✔','ok'); ev.currentTarget.reset(); await load(); }
    else showStatus(res.error||'No se pudo registrar','error');
  }catch(e){ showStatus('Error: '+e.message,'error'); }
}

async function onLabelsSubmit(ev){
  ev.preventDefault();
  const payload = parseGrid(ev.currentTarget);
  if (!payload.items.length){ showStatus('Ingresá al menos una cantidad','error'); return; }
  try{
    showStatus('Ingresando etiquetas…','loading');
    const res = await apiPost({ action:'labels_in', ...payload });
    if (res.ok){ showStatus('Etiquetas ingresadas ✔','ok'); ev.currentTarget.reset(); await load(); }
    else showStatus(res.error||'No se pudo registrar','error');
  }catch(e){ showStatus('Error: '+e.message,'error'); }
}

async function onEmptySubmit(ev){
  ev.preventDefault();
  const fd = new FormData(ev.currentTarget);
  const qty = Number(fd.get('qty')||0);
  const note = fd.get('note')||'';
  if (!qty){ showStatus('Ingresá una cantidad','error'); return; }
  try{
    showStatus('Ingresando latas vacías…','loading');
    const res = await apiPost({ action:'empty_in', qty, note });
    if (res.ok){ showStatus('Latas vacías ingresadas ✔','ok'); ev.currentTarget.reset(); await load(); }
    else showStatus(res.error||'No se pudo registrar','error');
  }catch(e){ showStatus('Error: '+e.message,'error'); }
}

document.addEventListener('DOMContentLoaded', ()=>{
  document.getElementById('form-produce').addEventListener('submit', onProduceSubmit);
  document.getElementById('form-labels').addEventListener('submit', onLabelsSubmit);
  document.getElementById('form-empty').addEventListener('submit', onEmptySubmit);
  document.getElementById('btn-refresh').addEventListener('click', load);
  load();
});