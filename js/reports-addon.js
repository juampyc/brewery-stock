
/* reports-addon.js - v3.6
   - Aislado en un IIFE
   - No re-declara Toast/TZ_AR ni helpers globales del proyecto
   - Requiere apiGet() del app.js existente
*/
(function(){
  'use strict';
  if(!document.getElementById('rep_prod_table')) return; // sólo en reports.html

  // Reutiliza o crea Toast en window sin re-declarar const
  window.Toast = window.Toast || Swal.mixin({
    toast:true, position:"top-end", showConfirmButton:false, timer:1800, timerProgressBar:true,
    didOpen: t=>{ t.addEventListener("mouseenter",Swal.stopTimer); t.addEventListener("mouseleave",Swal.resumeTimer); }
  });
  const toast = window.Toast;

  const TZ_AR = window.TZ_AR || "America/Argentina/Buenos_Aires";

  // Helpers locales
  const renderIdShort = id => id ? String(id).slice(0,8) : "";
  const renderDateLocal = s => {
    try{ const d=new Date(s); const out=d.toLocaleString("sv-SE",{timeZone:TZ_AR,hour12:false}); return out.slice(0,16); }
    catch{ return s||""; }
  };
  const truncateIdsInDesc = txt => {
    if(!txt) return "";
    let s=String(txt);
    s=s.replace(/\b(labelId|styleId|brandId|emptyId)=([0-9a-f]{8})[0-9a-f\-]*/gi,(_,k,p)=>`${k}=${p}`);
    s=s.replace(/used:([0-9a-f\-:,]+)/gi,m=>{
      const list=m.split(":")[1]||"";
      const mapped=list.split(",").map(p=>{const[a,q]=p.split(":");return `${(a||"").slice(0,8)}:${q||""}`}).join(",");
      return`used:${mapped}`
    });
    return s;
  };
  const nowInputDate = () => {
    const d=new Date();
    return d.toLocaleString('sv-SE',{timeZone:TZ_AR,hour12:false}).slice(0,10);
  };
  const arDateRangeStrings = (fromDateStr,toDateStr) => {
    if(!fromDateStr && !toDateStr) return [null,null];
    const from = fromDateStr? `${fromDateStr} 00:00:00` : null;
    const to   = toDateStr?   `${toDateStr} 23:59:59`   : null;
    return [from,to];
  };
  const inRangeAR = (dtStr,fromStr,toStr) => {
    if(!dtStr) return false;
    if(fromStr && dtStr<fromStr) return false;
    if(toStr && dtStr>toStr) return false;
    return true;
  };
  const exportTableToCSV = (tableId, filename) => {
    const tbl=document.getElementById(tableId); if(!tbl)return;
    const rows=tbl.querySelectorAll('tr');
    const csv=[];
    rows.forEach(tr=>{
      const cols=[...tr.querySelectorAll('th,td')].map(td=>`"${String(td.innerText).replaceAll('"','""')}"`);
      csv.push(cols.join(','));
    });
    const blob=new Blob([csv.join('\n')],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=filename||'export.csv'; document.body.appendChild(a); a.click();
    setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},500);
  };
  document.addEventListener('click',e=>{
    const btn=e.target.closest('.btnExportCsv'); if(!btn) return;
    exportTableToCSV(btn.dataset.table, `${btn.dataset.table}.csv`);
  });

  // Boot
  (async function bootReports(){
    try{
      const [styles, labels, movements] = await Promise.all([apiGet('styles'), apiGet('labels'), apiGet('movements')]);
      const styleMap = new Map(styles.map(s=>[String(s.id), {name:s.name, brandName:s.brandName}]));
      const fromI = document.getElementById('rep_from');
      const toI = document.getElementById('rep_to');
      // default últimos 30 días
      const now = new Date();
      fromI.value = new Date(now.getTime()-29*24*3600*1000).toLocaleString('sv-SE',{timeZone:TZ_AR,hour12:false}).slice(0,10);
      toI.value   = now.toLocaleString('sv-SE',{timeZone:TZ_AR,hour12:false}).slice(0,10);

      function applyPreset(p){
        const today = new Date().toLocaleString('sv-SE',{timeZone:TZ_AR,hour12:false}).slice(0,10);
        if(p==='today'){ fromI.value=today; toI.value=today; }
        else if(p==='7'){ const d=new Date(); d.setDate(d.getDate()-6); fromI.value=d.toLocaleString('sv-SE',{timeZone:TZ_AR,hour12:false}).slice(0,10); toI.value=today; }
        else if(p==='30'){ const d=new Date(); d.setDate(d.getDate()-29); fromI.value=d.toLocaleString('sv-SE',{timeZone:TZ_AR,hour12:false}).slice(0,10); toI.value=today; }
        else if(p==='month'){ const d=new Date(); const y=d.getFullYear(); const m=d.getMonth()+1; fromI.value=`${y}-${String(m).padStart(2,'0')}-01`; toI.value=today; }
        else if(p==='year'){ const y=new Date().getFullYear(); fromI.value=`${y}-01-01`; toI.value=today; }
        else if(p==='all'){ fromI.value=''; toI.value=''; }
      }
      document.querySelectorAll('.preset').forEach(btn=>btn.addEventListener('click',()=>applyPreset(btn.dataset.preset)));

      function render(){
        const [fromStr, toStr] = arDateRangeStrings(fromI.value, toI.value);
        const inR = movements.filter(m=>inRangeAR(m.dateTime, fromStr, toStr));

        // Producción por estilo
        const prodAgg = new Map(); // styleId -> {enl,pas,eti,fin}
        inR.filter(m=>m.entity==='cans').forEach(m=>{
          const qty = Number(m.qty||0);
          const desc = String(m.description||'');
          const styleId = (desc.match(/styleId=([0-9a-f\-]+)/i)||[])[1]||'';
          const state = (desc.match(/state=([a-z_]+)/i)||[])[1]||'';
          const from = (desc.match(/from=([a-z_]+)/i)||[])[1]||'';
          const to = (desc.match(/to=([a-z_]+)/i)||[])[1]||'';
          if(!prodAgg.has(styleId)) prodAgg.set(styleId, {enl:0,pas:0,eti:0,fin:0});
          const acc = prodAgg.get(styleId);
          if(m.type==='add' && state==='enlatada') acc.enl += qty;
          if(m.type==='transition' && from==='enlatada' && to==='pasteurizada') acc.pas += qty;
          if(m.type==='transition' && to==='etiquetada') acc.eti += qty;
          if(m.type==='transition' && to==='final') acc.fin += qty;
        });
        const tbProd = document.querySelector('#rep_prod_table tbody'); tbProd.innerHTML='';
        let sum_enl=0,sum_pas=0,sum_eti=0,sum_fin=0;
        const labelsChart=[]; const dataChartEnl=[], dataChartFin=[];
        prodAgg.forEach((v,styleId)=>{
          const style = styleMap.get(String(styleId))||{name:'(sin estilo)',brandName:'—'};
          sum_enl+=v.enl; sum_pas+=v.pas; sum_eti+=v.eti; sum_fin+=v.fin;
          const tr=document.createElement('tr');
          tr.innerHTML = `<td>${style.brandName}</td><td>${style.name}</td><td class="text-end">${v.enl}</td><td class="text-end">${v.pas}</td><td class="text-end">${v.eti}</td><td class="text-end">${v.fin}</td>`;
          tbProd.appendChild(tr);
          labelsChart.push(`${style.brandName} - ${style.name}`);
          dataChartEnl.push(v.enl); dataChartFin.push(v.fin);
        });
        document.getElementById('rep_prod_sum_enl').innerText=sum_enl;
        document.getElementById('rep_prod_sum_pas').innerText=sum_pas;
        document.getElementById('rep_prod_sum_etiq').innerText=sum_eti;
        document.getElementById('rep_prod_sum_fin').innerText=sum_fin;
        if(window.Chart){
          const ctx=document.getElementById('rep_prod_chart');
          if(ctx){
            if(window.__repChart) window.__repChart.destroy();
            window.__repChart=new Chart(ctx,{type:'bar',data:{labels:labelsChart,datasets:[{label:'Enlatadas',data:dataChartEnl},{label:'Finalizadas',data:dataChartFin}]},options:{responsive:true,plugins:{legend:{position:'top'}},scales:{y:{beginAtZero:true}}}});
          }
        }

        // Etiquetas por estilo
        const lblAgg = new Map(); // key -> {ing,cons,adj}
        inR.filter(m=>m.entity==='labels').forEach(m=>{
          const qty=Number(m.qty||0);
          const desc=String(m.description||'');
          const styleId=(desc.match(/styleId=([0-9a-f\-]+)/i)||[])[1]||'';
          let key=styleId||'custom';
          if(!lblAgg.has(key)) lblAgg.set(key, {ing:0,cons:0,adj:0});
          const acc=lblAgg.get(key);
          if(m.type==='add') acc.ing+=qty;
          else if(m.type==='consume') acc.cons+=qty;
          else if(m.type==='adjust') acc.adj+=qty;
        });
        const tbLbl=document.querySelector('#rep_lbl_table tbody'); tbLbl.innerHTML='';
        lblAgg.forEach((v,key)=>{
          let brand='—', est=(key==='custom'?'Personalizada':'(sin estilo)');
          if(key!=='custom' && styleMap.get(String(key))){ brand=styleMap.get(String(key)).brandName; est=styleMap.get(String(key)).name; }
          const net=v.ing - v.cons + v.adj;
          const tr=document.createElement('tr');
          tr.innerHTML=`<td>${brand}</td><td>${est}</td><td class="text-end">${v.ing}</td><td class="text-end">${v.cons}</td><td class="text-end">${v.adj}</td><td class="text-end">${net}</td>`;
          tbLbl.appendChild(tr);
        });

        // Latas vacías (por fecha)
        const cansAgg = new Map(); // date -> {ing,cons,adj}
        inR.filter(m=>m.entity==='emptycans').forEach(m=>{
          const qty=Number(m.qty||0);
          const d=(String(m.dateTime||'').slice(0,10));
          if(!cansAgg.has(d)) cansAgg.set(d, {ing:0,cons:0,adj:0});
          const acc=cansAgg.get(d);
          if(m.type==='add') acc.ing+=qty;
          else if(m.type==='consume') acc.cons+=qty;
          else if(m.type==='adjust') acc.adj+=qty;
        });
        const tbEC=document.querySelector('#rep_cans_empty_table tbody'); tbEC.innerHTML='';
        Array.from(cansAgg.entries()).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([d,v])=>{
          const net=v.ing - v.cons + v.adj;
          const tr=document.createElement('tr');
          tr.innerHTML=`<td>${d}</td><td class="text-end">${v.ing}</td><td class="text-end">${v.cons}</td><td class="text-end">${v.adj}</td><td class="text-end">${net}</td>`;
          tbEC.appendChild(tr);
        });

        // Detalle
        const tbDet=document.querySelector('#rep_mov_table tbody'); tbDet.innerHTML='';
        inR.forEach(m=>{
          const tr=document.createElement('tr');
          tr.innerHTML=`<td>${renderIdShort(m.id)}</td><td>${renderDateLocal(m.dateTime)}</td><td>${m.entity}</td><td>${m.type}</td><td class="text-end">${m.qty}</td><td>${truncateIdsInDesc(m.description)}</td><td>${renderDateLocal(m.createdAt)}</td>`;
          tbDet.appendChild(tr);
        });
      }

      document.getElementById('btnRepApply')?.addEventListener('click',()=>{render();toast.fire({icon:'success',title:'Reporte actualizado'});} );
      document.querySelectorAll('.preset').forEach(btn=>btn.addEventListener('click',()=>{render();}));
      render();
    }catch(e){
      console.error(e);
      Swal.fire({icon:'error',title:'Error cargando reportes',text:String(e)});
    }
  })();
})();
