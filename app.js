// === CONFIG ===
const API = 'https://script.google.com/macros/s/AKfycbzT6SIJLlUFjv5Pkg91aB4VFjVX8Wrf5Hp8ja2wWAA0tigQJ99_gPsXfsK39yOGWf4p/exec';

// Helpers
const $ = (s)=>document.querySelector(s);

// Banner de estado
function showStatus(msg, type='info'){
  const el = document.getElementById('status');
  if (!el) { console.warn('No existe #status'); return; }
  el.textContent = msg;
  el.className = 'status ' + type;
  el.classList.remove('hidden');
  if(type !== 'info'){
    setTimeout(()=> el.classList.add('hidden'), 3000);
  }
}

// Reset seguro del formulario
function safeReset(id){
  try{
    const form = document.getElementById(id)
              || (document.activeElement && document.activeElement.closest && document.activeElement.closest('form'))
              || document.forms.namedItem(id)
              || document.forms[0];
    if (form && typeof form.reset === 'function') {
      form.reset();
    } else {
      console.warn('No se encontró el form para reset:', id, form);
    }
  }catch(e){
    console.warn('safeReset error:', e);
  }
}

// API
async function apiGet(){ const r = await fetch(API); return r.json(); }
async function apiPost(payload){
  const r = await fetch(API, { method:'POST', body: JSON.stringify(payload) });
  return r.json();
}

// Render
function renderStocks(data){
  const tbF = $('#tb-finished'), tbL = $('#tb-labels'), empty = $('#empty-box');
  if (tbF) tbF.innerHTML = (data.finished||[])
    .map(r=>`<tr><td>${r.Brand}</td><td>${r.Style}</td><td>${r.OnHand}</td></tr>`)
    .join('') || '<tr><td colspan="3" class="muted">Sin datos</td></tr>';

  if (tbL) tbL.innerHTML = (data.labels||[])
    .map(r=>`<tr><td>${r.Brand}</td><td>${r.Style}</td><td>${r.OnHand}</td></tr>`)
    .join('') || '<tr><td colspan="3" class="muted">Sin datos</td></tr>';

  if (empty) empty.textContent = (data.empty ?? 0);
}

async function load(){
  try{
    if ($('#tb-finished')) $('#tb-finished').innerHTML = '<tr><td colspan="3">Cargando…</td></tr>';
    if ($('#tb-labels'))   $('#tb-labels').innerHTML   = '<tr><td colspan="3">Cargando…</td></tr>';
    if ($('#empty-box'))   $('#empty-box').textContent = 'Cargando…';
    const data = await apiGet();
    renderStocks(data);
  }catch(e){
    showStatus('Error al cargar: '+e.message,'error');
  }
}

// Convierte inputs name="Marca|Estilo" en items
function parseGrid(form){
  const fd = new FormData(form);
  const items = [];
  for (const [k,v] of fd.entries()){
    if (k === 'note') continue;
    const qty = Number(v||0);
    if (!qty) continue;
    const [brand, style] = k.split('|');
    items.push({ brand, style, qty });
  }
  const note = fd.get('note') || '';
  return { items, note };
}

// Handlers
async function onProduceSubmit(ev){
  ev.preventDefault();
  const form = ev.currentTarget || document.getElementById('form-produce');
  const payload = parseGrid(form);
  if (!payload.items.length){ showStatus('Ingresá al menos una cantidad','error'); return; }
  try{
    showStatus('Guardando datos…','info');
    const res = await apiPost({ action:'batch_produce', ...payload });
    if (res.ok){
      showStatus('Producción registrada ✔','ok');
      safeReset('form-produce');
      await load();
    } else {
      showStatus(res.error || 'No se pudo registrar','error');
    }
  }catch(e){ showStatus('Error: '+e.message,'error'); }
}

async function onLabelsSubmit(ev){
  ev.preventDefault();
  const form = ev.currentTarget || document.getElementById('form-labels');
  const payload = parseGrid(form);
  if (!payload.items.length){ showStatus('Ingresá al menos una cantidad','error'); return; }
  try{
    showStatus('Guardando datos…','info');
    const res = await apiPost({ action:'labels_in', ...payload });
    if (res.ok){
      showStatus('Etiquetas ingresadas ✔','ok');
      safeReset('form-labels');
      await load();
    } else {
      showStatus(res.error || 'No se pudo registrar','error');
    }
  }catch(e){ showStatus('Error: '+e.message,'error'); }
}

async function onEmptySubmit(ev){
  ev.preventDefault();
  const form = ev.currentTarget || document.getElementById('form-empty');
  const fd = new FormData(form);
  const qty  = Number(fd.get('qty')||0);
  const note = fd.get('note') || '';
  if (!qty){ showStatus('Ingresá una cantidad','error'); return; }
  try{
    showStatus('Guardando datos…','info');
    const res = await apiPost({ action:'empty_in', qty, note });
    if (res.ok){
      showStatus('Latas vacías ingresadas ✔','ok');
      safeReset('form-empty');
      await load();
    } else {
      showStatus(res.error || 'No se pudo registrar','error');
    }
  }catch(e){ showStatus('Error: '+e.message,'error'); }
}

// Init: bindea solo si existen los elementos (por si hay HTML distinto)
document.addEventListener('DOMContentLoaded', ()=>{
  const f1 = document.getElementById('form-produce');
  const f2 = document.getElementById('form-labels');
  const f3 = document.getElementById('form-empty');
  const br = document.getElementById('btn-refresh');

  if (f1) f1.addEventListener('submit', onProduceSubmit);
  if (f2) f2.addEventListener('submit', onLabelsSubmit);
  if (f3) f3.addEventListener('submit', onEmptySubmit);
  if (br) br.addEventListener('click', load);

  load();
});
