/**
 * Google Apps Script backend para Castelo Stock
 * - Crea y formatea la planilla
 * - Endpoints CRUD por entidad
 * - Movimientos centralizados
 * Desplegar como Web App y pegar la URL en app.js (API_BASE)
 */

const SS_NAME = 'Castelo_Stock';
const SHEETS = {
  brands: 'brands',
  containers: 'containers',
  styles: 'styles',
  labels: 'labels',
  emptycans: 'emptycans',
  movements: 'movements'
};

function _ss() {
  const files = DriveApp.getFilesByName(SS_NAME);
  if (files.hasNext()) return SpreadsheetApp.open(files.next());
  return SpreadsheetApp.create(SS_NAME);
}
function _sheet(name){ const ss=_ss(); const sh = ss.getSheetByName(name) || ss.insertSheet(name); return sh; }
function _uuid(){ return Utilities.getUuid(); }
function _now(){ return new Date(); }

function doGet(e){
  try{
    const entity = (e.parameter.entity||'').toLowerCase();
    const action = (e.parameter.action||'getAll').toLowerCase();
    let result;
    switch(entity){
      case 'styles': result = getStyles(); break;
      case 'brands': result = getBrands(); break;
      case 'containers': result = getContainers(); break;
      case 'labels': result = getLabels(); break;
      case 'emptycans': result = getEmptyCansAgg(); break;
      case 'cans': result = getCansAgg(); break;
      case 'movements': result = getMovements(); break;
      default: result = { error:`Entidad desconocida: ${entity}` };
    }
    return _json(result);
  }catch(err){ return _json({ error:String(err) }, 500); }
}

function doPost(e){
  try{
    const entity = (e.parameter.entity||'').toLowerCase();
    const action = (e.parameter.action||'').toLowerCase();
    const body = e.postData?.contents ? JSON.parse(e.postData.contents) : {};
    let result;
    if (entity === 'setup' && action === 'init'){ result = initSheets(); return _json({ ok:true, result }); }

    switch(entity){
      case 'brands': result = crudGeneric(SHEETS.brands, body, action); break;
      case 'containers': result = crudGeneric(SHEETS.containers, body, action); break;
      case 'styles': result = crudGeneric(SHEETS.styles, body, action); break;
      case 'labels': result = labelsCrud(body, action); break;
      case 'production':
        if (action === 'produce') { result = productionProduce(body); }
        else { result = { error:`Acción desconocida: ${action}` }; }
        break;
      case 'cans':
        if (action === 'transition_state') { result = cansTransition(body); }
        else { result = { error:`Acción desconocida: ${action}` }; }
        break;
      default: result = { error:`Entidad desconocida: ${entity}` };
    }
    if (result && result.error) return _json(result, 400);
    return _json({ ok:true, result });
  }catch(err){ return _json({ error:String(err) }, 500); }
}

function _json(obj, code){
  const out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  const resp = out;
  if (code) resp.setMimeType(ContentService.MimeType.JSON);
  return resp;
}

/* =========================
   INIT / RESET
   ========================= */
function initSheets(){
  const ss = _ss();
  // brands
  const shB = _sheet(SHEETS.brands);
  shB.clear(); shB.getRange(1,1,1,5).setValues([['id','name','color','createdAt','updatedAt']]);
  // containers
  const shC = _sheet(SHEETS.containers);
  shC.clear(); shC.getRange(1,1,1,6).setValues([['id','name','sizeLiters','type','color','updatedAt']]);
  // styles
  const shS = _sheet(SHEETS.styles);
  shS.clear(); shS.getRange(1,1,1,7).setValues([['id','brandId','name','color','showAlways','createdAt','updatedAt']]);
  // labels (insumos)
  const shL = _sheet(SHEETS.labels);
  shL.clear(); shL.getRange(1,1,1,10).setValues([['id','brandId','styleId','name','isCustom','qty','provider','lot','dateTime','lastModified']]);
  // emptycans: registros de ingresos de latas vacías (o consumos negativos)
  const shE = _sheet(SHEETS.emptycans);
  shE.clear(); shE.getRange(1,1,1,6).setValues([['id','qty','provider','lot','dateTime','lastModified']]);
  // movements
  const shM = _sheet(SHEETS.movements);
  shM.clear(); shM.getRange(1,1,1,8).setValues([['id','dateTime','entity','type','qty','description','refIds','lastModified']]);
  return true;
}

/* =========================
   GETTERS (READ)
   ========================= */
function getSheetRows(name){
  const sh = _sheet(name);
  const rg = sh.getDataRange().getValues();
  const head = rg.shift();
  return rg.filter(r=>r[0]).map(r => Object.fromEntries(head.map((h,i)=> [h, r[i]])));
}
function getBrands(){ return getSheetRows(SHEETS.brands); }
function getContainers(){ return getSheetRows(SHEETS.containers); }
function getStyles(){
  const brands = getBrands();
  const bMap = {};
  brands.forEach(b=> bMap[String(b.id)] = b);
  return getSheetRows(SHEETS.styles).map(s => ({
    ...s,
    showAlways: String(s.showAlways) === 'true',
    brandName: bMap[String(s.brandId)]?.name || ''
  }));
}
function getLabels(){ return getSheetRows(SHEETS.labels); }
function getMovements(){ return getSheetRows(SHEETS.movements); }

function getEmptyCansAgg(){
  const rows = getSheetRows(SHEETS.emptycans);
  return rows; // se muestran como registros; index sumará totales
}

// Agregado de stock de latas por estilo y estado desde movements
function getCansAgg(){
  const styles = getStyles();
  const rows = getMovements().filter(m => String(m.entity)==='cans');
  const out = [];
  const sums = {}; // key = styleId|state
  rows.forEach(m=>{
    const mQty = Number(m.qty||0);
    // description ejemplo: "styleId=xxx;state=final" ó "from=sin...;to=final;styleId=xxx"
    let styleId = (m.description||'').match(/styleId=([a-z0-9\-]+)/i)?.[1] || '';
    let state = (m.description||'').match(/state=([a-z_]+)/i)?.[1] || '';
    let from = (m.description||'').match(/from=([a-z_]+)/i)?.[1] || '';
    let to = (m.description||'').match(/to=([a-z_]+)/i)?.[1] || '';

    if (m.type==='add'){
      const k = `${styleId}|${state}`;
      sums[k] = (sums[k]||0) + mQty;
    } else if (m.type==='transition'){
      if (from){ const kf = `${styleId}|${from}`; sums[kf] = (sums[kf]||0) - mQty; }
      if (to){ const kt = `${styleId}|${to}`; sums[kt] = (sums[kt]||0) + mQty; }
    }
  });
  Object.entries(sums).forEach(([k,v])=>{
    const [styleId, state] = k.split('|');
    if (v!==0) out.push({ styleId, state, qty: v });
  });
  return out;
}

/* =========================
   CRUD genérico simple
   ========================= */
function crudGeneric(sheetName, body, action){
  const sh = _sheet(sheetName);
  const rows = getSheetRows(sheetName);
  const now = _now();
  if (action==='create'){
    const id = _uuid();
    let payload;
    switch(sheetName){
      case SHEETS.brands:
        payload = [id, body.name||'', body.color||'#000000', now, now]; break;
      case SHEETS.containers:
        payload = [id, body.name||'', Number(body.sizeLiters||0), body.type||'lata', body.color||'#000000', now]; break;
      case SHEETS.styles:
        payload = [id, String(body.brandId||''), body.name||'', body.color||'#000000', Boolean(body.showAlways), now, now]; break;
      default: throw new Error('create no soportado');
    }
    sh.appendRow(payload);
    return { id };
  } else if (action==='update'){
    const id = String(body.id);
    const head = sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0];
    const rg = sh.getDataRange().getValues();
    for (let i=1;i<rg.length;i++){
      if (String(rg[i][0])===id){
        if (sheetName===SHEETS.brands){
          rg[i][1]=body.name||rg[i][1]; rg[i][2]=body.color||rg[i][2]; rg[i][4]=now;
        } else if (sheetName===SHEETS.containers){
          rg[i][1]=body.name||rg[i][1]; rg[i][2]=Number(body.sizeLiters||rg[i][2]); rg[i][3]=body.type||rg[i][3]; rg[i][4]=body.color||rg[i][4]; rg[i][5]=now;
        } else if (sheetName===SHEETS.styles){
          rg[i][1]=String(body.brandId||rg[i][1]); rg[i][2]=body.name||rg[i][2]; rg[i][3]=body.color||rg[i][3]; rg[i][4]=Boolean(body.showAlways); rg[i][6]=now;
        }
        sh.getRange(1,1,rg.length,rg[0].length).setValues(rg);
        return { id };
      }
    }
    return { error:'No encontrado' };
  } else if (action==='delete'){
    const id = String(body.id);
    const rg = sh.getDataRange().getValues();
    for (let i=1;i<rg.length;i++){ if (String(rg[i][0])===id){ sh.deleteRow(i+1); return { ok:true }; } }
    return { error:'No encontrado' };
  } else {
    return { error:`Acción no soportada: ${action}` };
  }
}

/* =========================
   LABELS CRUD (registrar ingresos, editar, eliminar) + FIFO consumo
   ========================= */
function labelsCrud(body, action){
  const sh = _sheet(SHEETS.labels);
  const now = _now();
  if (action==='create'){
    const id = _uuid();
    const row = [id, String(body.brandId||''), String(body.styleId||''), body.name||'', Boolean(body.isCustom), Number(body.qty||0), body.provider||'', body.lot||'', body.dateTime||now, now];
    sh.appendRow(row);
    // Movimiento
    appendMovement({ entity:'labels', type:'add', qty:Number(body.qty||0), description:`labelId=${id};styleId=${body.styleId||''};isCustom=${Boolean(body.isCustom)}` });
    return { id };
  } else if (action==='update'){
    const id = String(body.id);
    const rg = sh.getDataRange().getValues();
    for (let i=1;i<rg.length;i++){
      if (String(rg[i][0])===id){
        rg[i][1]=String(body.brandId||rg[i][1]);
        rg[i][2]=String(body.styleId||rg[i][2]);
        rg[i][3]=body.name||rg[i][3];
        rg[i][4]=Boolean(body.isCustom);
        rg[i][5]=Number(body.qty||rg[i][5]);
        rg[i][6]=body.provider||rg[i][6];
        rg[i][7]=body.lot||rg[i][7];
        rg[i][8]=body.dateTime||rg[i][8];
        rg[i][9]=now;
        sh.getRange(1,1,rg.length,rg[0].length).setValues(rg);
        return { id };
      }
    }
    return { error:"Etiqueta no encontrada" };
  } else if (action==='delete'){
    const id = String(body.id);
    const rg = sh.getDataRange().getValues();
    for (let i=1;i<rg.length;i++){ if (String(rg[i][0])===id){ sh.deleteRow(i+1); return { ok:true }; } }
    return { error:'No encontrada' };
  } else {
    return { error:`Acción no soportada: ${action}` };
  }
}

/* =========================
   PRODUCCIÓN: produce (consume latas vacías, agrega latas por estado y consume etiquetas opcionalmente)
   ========================= */
function productionProduce(body){
  const qty = Number(body.qty||0);
  const dt  = body.dateTime || _now();
  const styleId = String(body.styleId||'');
  const pasteurized = Boolean(body.pasteurized);
  const labeled = Boolean(body.labeled);
  const labelId = body.labelId || null;

  if (!styleId) return { error:'styleId requerido' };
  if (!qty || qty<=0) return { error:'qty inválida' };

  // 1) consumir latas vacías (registro negativo en emptycans)
  const shE = _sheet(SHEETS.emptycans);
  const rowE = [_uuid(), -qty, '', '', dt, _now()];
  shE.appendRow(rowE);
  appendMovement({ entity:'emptycans', type:'consume', qty: qty, description:`consume enlatado;styleId=${styleId}`, dateTime:dt });

  // 2) agregar latas con estado
  const state = labeled ? (pasteurized ? 'sin_pasteurizar_etiquetada' : 'sin_pasteurizar_etiquetada') : (pasteurized ? 'pasteurizada_sin_etiquetar' : 'sin_pasteurizar_sin_etiquetar');
  // Nota: si se quiere un estado específico para "labeled + pasteurized", se puede añadir.
  appendMovement({ entity:'cans', type:'add', qty: qty, description:`styleId=${styleId};state=${state}`, dateTime:dt });

  // 3) si labeled => consumir etiquetas (FIFO simplificado por cantidad total)
  if (labeled){
    consumeLabelsFIFO(styleId, qty, labelId, dt);
  }

  return { ok:true };
}

function consumeLabelsFIFO(styleId, qty, labelId, dt){
  // FIFO simple: restamos desde la más antigua (labels sheet) que coincida por styleId o por id (si labelId está)
  const sh = _sheet(SHEETS.labels);
  const rg = sh.getDataRange().getValues();
  const head = rg.shift();
  const idx = Object.fromEntries(head.map((h,i)=>[h,i]));
  let remaining = qty;
  let usedRefs = [];
  for (let i=0;i<rg.length && remaining>0;i++){
    const row = rg[i];
    const thisId = String(row[idx.id]);
    const thisStyle = String(row[idx.styleId]);
    let canUse = false;
    if (labelId) canUse = (thisId===String(labelId));
    else canUse = (thisStyle===String(styleId) && !Boolean(row[idx.isCustom])); // mismas del estilo, no custom

    if (!canUse) continue;
    const avail = Number(row[idx.qty]||0);
    if (avail<=0) continue;
    const take = Math.min(avail, remaining);
    row[idx.qty] = avail - take;
    usedRefs.push(`${thisId}:${take}`);
    remaining -= take;
  }
  // guardar cambios
  sh.getRange(2,1,rg.length,rg[0].length).setValues(rg);
  // movimiento
  appendMovement({ entity:'labels', type:'consume', qty: qty, description:`usados:${usedRefs.join(',')};styleId=${styleId}`, dateTime:dt });
}

/* =========================
   LATAS: transición de estados
   ========================= */
function cansTransition(body){
  const qty = Number(body.qty||0);
  const dt  = body.dateTime || _now();
  const styleId = String(body.styleId||'');
  const toState = String(body.toState||'');
  const consumeLabels = Boolean(body.consumeLabels);
  const labelId = body.labelId || null;

  if (!styleId) return { error:'styleId requerido' };
  if (!toState) return { error:'toState requerido' };
  if (!qty || qty<=0) return { error:'qty inválida' };

  appendMovement({ entity:'cans', type:'transition', qty: qty, description:`styleId=${styleId};from=;to=${toState}`, dateTime:dt });
  if (consumeLabels && /etiquetad/i.test(toState)){
    consumeLabelsFIFO(styleId, qty, labelId, dt);
  }
  return { ok:true };
}

/* =========================
   MOVIMIENTOS util
   ========================= */
function appendMovement({ entity, type, qty, description, dateTime }){
  const sh = _sheet(SHEETS.movements);
  sh.appendRow([_uuid(), dateTime || _now(), entity, type, Number(qty||0), description||'', '', _now()]);
}
