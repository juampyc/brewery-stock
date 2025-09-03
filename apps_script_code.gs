// === CONFIG ===
const SPREADSHEET_ID = 'PONER_AQUI_EL_ID_DE_TU_HOJA'; // Cambiar por el ID real
const SHEETS = { FINISHED:'Stock_Finished', LABELS:'Stock_Labels', EMPTY:'Stock_EmptyCans', MOVES:'Movements' };
const STYLES = ['IPA','Kolsch','Porter','Honey'];
const BRANDS = ['Castelo','Big Rock'];

function _ss(){ return SpreadsheetApp.openById(SPREADSHEET_ID); }
function _sh(name){ const ss=_ss(); let sh=ss.getSheetByName(name); if(!sh) sh=ss.insertSheet(name); return sh; }
function _ensureHeaders(sh, headers){ const r=sh.getRange(1,1,1,headers.length); const cur=r.getValues()[0]; const same=cur.length===headers.length&&cur.every((h,i)=>String(h).trim()===headers[i]); if(!same){ r.setValues([headers]); sh.setFrozenRows(1);} }
function _key(brand, style){ return brand + '|' + style; }
function _now(){ return new Date(); }
function _uuid(){ return Utilities.getUuid(); }

function initIfNeeded(){
  const f=_sh(SHEETS.FINISHED); _ensureHeaders(f, ['Key','Brand','Style','OnHand']);
  if (f.getLastRow()<2){ const rows=[]; BRANDS.forEach(b=>STYLES.forEach(s=>rows.push([_key(b,s),b,s,0]))); if(rows.length) f.getRange(2,1,rows.length,4).setValues(rows); }
  const l=_sh(SHEETS.LABELS); _ensureHeaders(l, ['Key','Brand','Style','OnHand']);
  if (l.getLastRow()<2){ const rows=[]; BRANDS.forEach(b=>STYLES.forEach(s=>rows.push([_key(b,s),b,s,0]))); if(rows.length) l.getRange(2,1,rows.length,4).setValues(rows); }
  const e=_sh(SHEETS.EMPTY); _ensureHeaders(e, ['OnHand']); if (e.getLastRow()<2){ e.getRange(2,1,1,1).setValues([[0]]); }
  const m=_sh(SHEETS.MOVES); _ensureHeaders(m, ['Date','Type','Brand','Style','Qty','Note','MoveId']);
}
function _readTable(name){ const sh=_sh(name); const v=sh.getDataRange().getValues(); if(v.length<2) return []; const [h,...rows]=v; return rows.map(r=>Object.fromEntries(h.map((x,i)=>[String(x),r[i]]))); }
function _writeOnHand(name,key,delta){ const sh=_sh(name); const v=sh.getDataRange().getValues(); const [h,...rows]=v; const ik=h.indexOf('Key'); const io=h.indexOf('OnHand'); for (let i=0;i<rows.length;i++){ if(String(rows[i][ik])===String(key)){ const nv=Number(rows[i][io])+Number(delta); if(nv<0) return {ok:false,error:'Stock negativo no permitido',key,onhand:rows[i][io]}; rows[i][io]=nv; sh.getRange(i+2,1,1,h.length).setValues([rows[i]]); return {ok:true,onhand:nv}; } } return {ok:false,error:'Key no encontrado: '+key}; }
function _getOnHandEmpty(){ const sh=_sh(SHEETS.EMPTY); return Number(sh.getRange(2,1).getValue()||0); }
function _setOnHandEmpty(n){ if(n<0) return {ok:false,error:'Stock negativo no permitido (latas vacías)'}; const sh=_sh(SHEETS.EMPTY); sh.getRange(2,1).setValue(n); return {ok:true,onhand:n}; }
function _addMove(type,b,s,qty,note){ const sh=_sh(SHEETS.MOVES); sh.appendRow([_now(),type,b||'',s||'',Number(qty||0),note||'',_uuid()]); }

function doGet(){ try{ initIfNeeded(); const finished=_readTable(SHEETS.FINISHED); const labels=_readTable(SHEETS.LABELS); const empty=_getOnHandEmpty(); return ContentService.createTextOutput(JSON.stringify({finished,labels,empty})).setMimeType(ContentService.MimeType.JSON);}catch(err){ return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err)})).setMimeType(ContentService.MimeType.JSON);} }
function doPost(e){ try{ initIfNeeded(); const b=JSON.parse(e.postData.contents||'{}'); const a=b.action; const lock=LockService.getScriptLock(); lock.tryLock(30000); let res;
  if(a==='batch_produce'){ const items=b.items||[]; const need=items.reduce((x,it)=>x+Number(it.qty||0),0); const empty=_getOnHandEmpty(); if(empty<need){ lock.releaseLock(); return _json({ok:false,error:`Latas vacías insuficientes. Necesarias ${need}, disponibles ${empty}`}); }
    const labelsMap=new Map(_readTable(SHEETS.LABELS).map(r=>[r.Key,Number(r.OnHand||0)]));
    for(const it of items){ const k=_key(it.brand,it.style); const n=Number(it.qty||0), have=labelsMap.get(k)||0; if(have<n){ lock.releaseLock(); return _json({ok:false,error:`Etiquetas insuficientes para ${k}. Necesarias ${n}, disponibles ${have}`}); } }
    for(const it of items){ const q=Number(it.qty||0); if(!q) continue; const k=_key(it.brand,it.style);
      const r1=_writeOnHand(SHEETS.FINISHED,k,q); if(!r1.ok){ lock.releaseLock(); return _json(r1); }
      const r2=_writeOnHand(SHEETS.LABELS,k,-q); if(!r2.ok){ lock.releaseLock(); return _json(r2); }
      const r3=_setOnHandEmpty(_getOnHandEmpty()-q); if(!r3.ok){ lock.releaseLock(); return _json(r3); }
      _addMove('PRODUCE',it.brand,it.style,q,b.note||''); }
    res={ok:true}; }
  else if(a==='labels_in'){ const items=b.items||[]; for(const it of items){ const q=Number(it.qty||0); if(!q) continue; const k=_key(it.brand,it.style); const r=_writeOnHand(SHEETS.LABELS,k,q); if(!r.ok){ lock.releaseLock(); return _json(r);} _addMove('LABEL_IN',it.brand,it.style,q,b.note||''); } res={ok:true}; }
  else if(a==='empty_in'){ const q=Number(b.qty||0); const r=_setOnHandEmpty(_getOnHandEmpty()+q); if(!r.ok){ lock.releaseLock(); return _json(r);} _addMove('EMPTY_IN','', '', q, b.note||''); res={ok:true}; }
  else if(a==='adjust_finished'){ const r=_writeOnHand(SHEETS.FINISHED,_key(b.brand,b.style),Number(b.delta||0)); if(!r.ok){ lock.releaseLock(); return _json(r);} _addMove('ADJ_FINISHED',b.brand,b.style,Number(b.delta||0),b.note||''); res={ok:true}; }
  else if(a==='adjust_labels'){ const r=_writeOnHand(SHEETS.LABELS,_key(b.brand,b.style),Number(b.delta||0)); if(!r.ok){ lock.releaseLock(); return _json(r);} _addMove('ADJ_LABELS',b.brand,b.style,Number(b.delta||0),b.note||''); res={ok:true}; }
  else if(a==='adjust_empty'){ const r=_setOnHandEmpty(_getOnHandEmpty()+Number(b.delta||0)); if(!r.ok){ lock.releaseLock(); return _json(r);} _addMove('ADJ_EMPTY','', '', Number(b.delta||0),b.note||''); res={ok:true}; }
  else { lock.releaseLock(); return _json({ok:false,error:'Acción no soportada'}); }
  lock.releaseLock(); return _json(res);
} catch(err){ return _json({ok:false,error:String(err)}); } }
function _json(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }