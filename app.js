// === CONFIG === (URL /exec de tu Apps Script)
const API = 'https://script.google.com/macros/s/AKfycbzT6SIJLlUFjv5Pkg91aB4VFjVX8Wrf5Hp8ja2wWAA0tigQJ99_gPsXfsK39yOGWf4p/exec';

// Helpers
const $ = (s)=>document.querySelector(s);
const todayStr = ()=> new Date().toISOString().slice(0,10); // AAAA-MM-DD

// Banner de estado
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

// Datos para gráficas (AGRUPADAS)
function groupedByBrand(data, sourceKey){
  const styles = ['IPA','Kolsch','Porter','Honey'];
  const brands = ['Castelo','Big Rock'];
  const rows = (data[sourceKey]||[]);
  const val = (brand, style)=>
    Number((rows.find(r=>r.Brand===brand && r.Style===style)?.OnHand)||0);

  const datasets = brands.map(b=>({
    label: b,
    data: styles.map(s=> val(b,s)),
    // barPercentage: 0.85, categoryPercentage: 0.6
  }));
  return { labels: styles, datasets };
}

// Gráficos
let chartFinished, chartLabels;
function renderCharts(data){
  // Terminados
  const cf = $('#chartFinished');
  const df = groupedByBrand(data,'finished');
  if (chartFinished) chartFinished.destroy();
  chartFinished = new Chart(cf, {
    type:'bar',
    data: df,
    options:{
      responsive:true,
      scales:{
        x:{ stacked:false, ticks:{ color:'#e8eaed' } },
        y:{ stacked:false, beginAtZero:true, ticks:{ color:'#e8eaed' } }
      },
      plugins:{ legend:{ labels:{ color:'#e8eaed' } } }
    }
  });

  // Etiquetas
  const cl = $('#chartLabels');
  const dl = groupedByBrand(data,'labels');
  if (chartLabels) chartLabels.destroy();
  chartLabels = new Chart(cl, {
    type:'bar',
    data: dl,
    options:{
      responsive:true,
      scales:{
        x:{ stacked:false, ticks:{ color:'#e8eaed' } },
        y:{ stacked:false, beginAtZero:true, ticks:{ color:'#e8eaed' } }
      },
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

// ---------- Exportar CSV ----------
function toCSV(rows, headers){
  const sc = (v)=> `"${String(v??'').replace(/"/g,'""')}"`;
  const head = headers.map(sc).join(',');
  const body = rows.map(r=> headers.map(h=> sc(r[h])).join(',')).join('\n');
  return head + '\n' + body;
}
function downloadCSV(filename, csv){
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 0);
}
async function exportCSV(){
  try{
    showStatus('Generando CSV…','info');
    const data = await apiGet();
    const finishedCSV = toCSV((data.finished||[]), ['Brand','Style','OnHand']);
    const labelsCSV   = toCSV((data.labels||[]),   ['Brand','Style','OnHand']);
    const emptyCSV    = `Metric,Value\nEmptyCans,${data.empty ?? 0}\n`;

    downloadCSV(`terminados_${todayStr()}.csv`, finishedCSV);
    downloadCSV(`etiquetas_${todayStr()}.csv`,   labelsCSV);
    downloadCSV(`latas_vacias_${todayStr()}.csv`, emptyCSV);
    showStatus('CSV exportado ✔','ok');
  }catch(e){
    showStatus('Error al exportar: '+e.message,'error');
  }
}

// ---------- Formularios ----------
function withDateInNote(note, dateStr){
  const d = (dateStr && dateStr.trim()) ? dateStr.trim() : todayStr();
  const base = note ? String(note).trim() : '';
  return `[Fecha: ${d}] ${base}`.trim();
}

async function onProduceSubmit(ev){
  ev.preventDefault();
  const f = ev.currentTarget;
  const fd = new FormData(f);
  const items=[];
  for (const [k,v] of fd.entries()){
    if (k==='note' || k==='date') continue;
    const qty=Number(v||0); if(!qty) continue;
    const [brand,style]=k.split('|'); items.push({brand,style,qty});
  }
  const note = withDateInNote(fd.get('note')||'', fd.get('date'));
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
    if (k==='note' || k==='date') continue;
    const qty=Number(v||0); if(!qty) continue;
    const [brand,style]=k.split('|'); items.push({brand,style,qty});
  }
  const note = withDateInNote(fd.get('note')||'', fd.get('date'));
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
  const note = withDateInNote(fd.get('note')||'', fd.get('date'));
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
  document.getElementById('scrap-filled-fields').style.display = (type==='filled') ? '' : 'none';
  document.getElementById('scrap-empty-fields').style.display  = (type==='empty')  ? '' : 'none';
}

async function onScrapSubmit(ev){
  ev.preventDefault();
  const type   = document.querySelector('input[name="scrapType"]:checked')?.value || 'filled';
  const reason = (document.getElementById('scrap-reason')?.value || '').trim();
  const detail = (document.getElementById('scrap-detail')?.value || '').trim();
  const date   = (document.getElementById('scrap-date')?.value || '').trim();
  if (!reason) return showStatus('Seleccioná un motivo de scrap','error');
  const note = withDateInNote(detail ? `[${reason}] ${detail}` : `[${reason}]`, date);

  const fd = new FormData(ev.currentTarget);
  try{
    if (type === 'filled'){
      const actions=[];
      for (const [k,v] of fd.entries()){
        if (['note','scrapType','reason','detail','date'].includes(k)) continue;
        const qty = Number(v||0);
        if (!qty) continue;
        const [brand,style]=k.split('|');
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
  // Set defaults de fecha = hoy
  ['prod-date','label-date','empty-date','scrap-date'].forEach(id=>{
    const el = document.getElementById(id); if (el) el.value = todayStr();
  });

  document.getElementById('form-produce').addEventListener('submit', onProduceSubmit);
  document.getElementById('form-labels').addEventListener('submit', onLabelsSubmit);
  document.getElementById('form-empty').addEventListener('submit', onEmptySubmit);
  document.getElementById('form-scrap').addEventListener('submit', onScrapSubmit);

  document.querySelectorAll('input[name="scrapType"]').forEach(r=> r.addEventListener('change', toggleScrapFields));
  document.getElementById('btn-refresh').addEventListener('click', load);
  document.getElementById('btn-export').addEventListener('click', exportCSV);

  toggleScrapFields();
  load();
});
