/** ============================
 *  Brewery Stock · code.gs
 *  Backend Google Apps Script
 *  ============================ */

/** ====== CONFIG ====== */
var SPREADSHEET_ID = "1eML8y0shrdheQ3bISwV3bnimsAVDruR1x1JFUKNWcog";
var TZ = "America/Argentina/Buenos_Aires";

var SHEETS = {
  EMPTY:  "empty_cans",
  LABELS: "labels",
  MOVES:  "movements",
  STYLES: "styles",
  BRANDS: "brands",
  PRODUCTIONS: "productions",
  PROD_HISTORY: "prod_history"
};

// Encabezados esperados (se crean si no existen)
var EMPTY_HEADERS  = ["id","qty","provider","lot","dateTime","lastModified"];
var LABELS_HEADERS = ["id","brandId","styleId","name","isCustom","qty","provider","lot","dateTime","lastModified"];
var MOVES_HEADERS  = ["id","type","refId","qty","provider","lot","dateTime"];
var STYLES_HEADERS = ["brandId","styleId","name"];
var BRANDS_HEADERS = ["id","name","color","createdAt","updatedAt"];

// Producción
var PROD_HEADERS = ["id","brandId","styleId","qty","status","labelBrandId","labelStyleId","labelName","createdAt","updatedAt"];
var PROD_HIST_HEADERS = ["id","prodId","from","to","dateTime","note"];

/** ====== ENTRYPOINTS ====== */
function doPost(e) {
  try {
    var payload = {};
    var action = "";

    if (e && e.postData && e.postData.contents) {
      var ctype = (e.postData.type || "").toLowerCase();
      if (ctype.indexOf("application/json") !== -1) {
        var j = JSON.parse(e.postData.contents || "{}");
        action = j.action || "";
        payload = j.payload || {};
      } else {
        // x-www-form-urlencoded
        action = (e.parameter && e.parameter.action) || "";
        var p = (e.parameter && e.parameter.payload) || "{}";
        try { payload = JSON.parse(p); } catch(_) { payload = {}; }
      }
    }

    var result = _route(action, payload);
    return ContentService.createTextOutput(JSON.stringify(result))
                         .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    var fail = { ok:false, error: String(err && err.message || err) };
    return ContentService.createTextOutput(JSON.stringify(fail))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

// (Opcional) Health check y pruebas rápidas con ?action=...
function doGet(e){
  try {
    var action = (e && e.parameter && e.parameter.action) || "";
    var payload = {};

    if (e && e.parameter && typeof e.parameter.payload === "string") {
      try { payload = JSON.parse(e.parameter.payload); } catch(_) { payload = {}; }
    } else if (e && e.parameter) {
      payload = {};
      Object.keys(e.parameter).forEach(function(k){
        if (k !== "action" && k !== "payload") payload[k] = e.parameter[k];
      });
      ["page","pageSize","qty"].forEach(function(nk){
        if (payload[nk] != null && payload[nk] !== "") {
          var n = Number(payload[nk]); if (!isNaN(n)) payload[nk] = n;
        }
      });
    }

    var result = action ? _route(action, payload)
                        : { ok:true, info:"Brewery Stock API (GET). Usa ?action=... y payload/params." };

    return ContentService.createTextOutput(JSON.stringify(result))
                         .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    var fail = { ok:false, error: String(err && err.message || err) };
    return ContentService.createTextOutput(JSON.stringify(fail))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

// Router
function _route(action, payload){
  switch (action) {
    // Producción
    case "createProduction":  return createProduction(payload);
    case "advanceProduction": return handleAdvanceProduction(payload);
    case "listProductions":   return handleListProductions(payload);
    case "prodStatusTotals":  return handleProdStatusTotals();

    // Stock base
    case "addEmptyCans":      return handleAddEmptyCans(payload);
    case "addLabel":          return handleAddLabel(payload);
    case "listMovements":     return handleListMovements(payload);
    case "getSummaryCounts":  return handleGetSummaryCounts();
    case "listStyles":        return handleListStyles();
    case "labelsSummary":     return handleLabelsSummary();

    default: return { ok:false, error:"UNKNOWN_ACTION", action:action };
  }
}

/** ====== ACTIONS ====== */

// Alta de latas vacías
function handleAddEmptyCans(p) {
  var qty = Number(p.qty || 0);
  var provider = String(p.provider || "").trim();
  var lot = String(p.lot || "").trim();

  if (!qty || qty <= 0 || !provider || !lot) {
    return { ok: false, error: "MISSING_FIELDS" };
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = _getOrCreateSheet(ss, SHEETS.EMPTY, EMPTY_HEADERS);

  var now = _now();
  var id = "EC-" + _uuid();

  var row = [id, qty, provider, lot, now, now];
  _appendRow(sh, row, EMPTY_HEADERS.length);

  // Movimiento alta latas vacías
  _appendMovement(ss, {
    type: "EMPTY_CANS_ADD",
    refId: id,
    qty: qty,
    provider: provider,
    lot: lot,
    dateTime: now
  });

  return { ok: true, data: { id: id } };
}

// Alta de etiquetas
function handleAddLabel(p) {
  var qty = Number(p.qty || 0);
  var provider = String(p.provider || "").trim();
  var lot = String(p.lot || "").trim();

  var isCustom = !!p.isCustom;
  var brandId = String(p.brandId || "").trim();
  var styleId = String(p.styleId || "").trim();
  var name = String(p.name || "").trim();

  if (!qty || qty <= 0 || !provider || !lot) {
    return { ok: false, error: "MISSING_FIELDS" };
  }
  if (isCustom && !name) {
    return { ok: false, error: "MISSING_CUSTOM_NAME" };
  }

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = _getOrCreateSheet(ss, SHEETS.LABELS, LABELS_HEADERS);

  var now = _now();
  var id = "LB-" + _uuid();

  var row = [id, brandId, styleId, name, isCustom, qty, provider, lot, now, now];
  _appendRow(sh, row, LABELS_HEADERS.length);

  // Movimiento alta etiquetas
  _appendMovement(ss, {
    type: "LABEL_ADD",
    refId: id,
    qty: qty,
    provider: provider,
    lot: lot,
    dateTime: now
  });

  return { ok: true, data: { id: id } };
}

// Paginación de movimientos (con filtro por tipo o prefijo)
function handleListMovements(p){
  var page     = Math.max(1, Number(p.page || 1));
  var pageSize = Math.max(1, Math.min(500, Number(p.pageSize || 20)));
  var type     = String(p.type || "").trim();        // match exacto
  var typePref = String(p.typePrefix || "").trim();  // comienza con (opcional)

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = _getOrCreateSheet(ss, SHEETS.MOVES, MOVES_HEADERS);

  var map = _headerIndexMap(sh);
  var last = sh.getLastRow();
  if (last <= 1) return { ok:true, data:{ total:0, items:[] } };

  var width = Math.max(map["id"], map["type"], map["refId"], map["qty"], map["provider"], map["lot"], map["dateTime"]);
  var rows = sh.getRange(2,1,last-1,width).getValues();

  var filtered = rows.filter(function(r){
    var t = map["type"] ? String(r[map["type"]-1] || "") : "";
    if (type)     return t === type;
    if (typePref) return t.indexOf(typePref) === 0; // empieza con
    return true;
  });

  var total = filtered.length;
  var start = (page - 1) * pageSize;
  var end   = Math.min(start + pageSize, total);
  var slice = (start < end) ? filtered.slice(start, end) : [];

  var items = slice.map(function(r){
    return {
      id:        map["id"]        ? String(r[map["id"]-1]        || "") : "",
      type:      map["type"]      ? String(r[map["type"]-1]      || "") : "",
      refId:     map["refId"]     ? String(r[map["refId"]-1]     || "") : "",
      qty:       map["qty"]       ? Number(r[map["qty"]-1]       || 0)  : 0,
      provider:  map["provider"]  ? String(r[map["provider"]-1]  || "") : "",
      lot:       map["lot"]       ? String(r[map["lot"]-1]       || "") : "",
      dateTime:  map["dateTime"]  ? String(r[map["dateTime"]-1]  || "") : ""
    };
  });

  return { ok:true, data:{ total: total, items: items } };
}


// Totales de stock (NETO = altas - consumos)
function handleGetSummaryCounts() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Latas vacías: ALTAS - CONSUMOS
  var emptyNet = _currentEmptyStock(ss);

  // Etiquetas: ALTAS - CONSUMOS
  var adds = _labelsAddsDetail(ss);
  var cons = _labelsConsMap(ss);
  var labelsNet = 0;
  Object.keys(adds).forEach(function(k){
    var stock = (adds[k].addQty||0) - (cons[k]||0);
    if (!isNaN(stock) && stock>0) labelsNet += stock;
  });

  return { ok:true, data:{ emptyCansTotal: emptyNet, labelsTotal: labelsNet } };
}


// Catálogo de estilos con nombre de marca legible
function handleListStyles() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = _getOrCreateSheet(ss, SHEETS.STYLES, STYLES_HEADERS);

  var last = sh.getLastRow();
  if (last <= 1) return { ok:true, data: [] };

  var brandsMap = _brandNameMap(ss); // id → nombre

  var map = _headerIndexMap(sh);
  var brandCol = map["brandId"] || 0;
  var styleCol = map["styleId"] || 0;
  var nameCol  = map["name"]    || 0;

  var width = Math.max(brandCol, styleCol, nameCol);
  var rows = sh.getRange(2,1,last-1,width).getValues();

  var out = [];
  for (var i=0;i<rows.length;i++) {
    var r = rows[i];
    var brandId = brandCol ? String(r[brandCol-1]||"") : "";
    var styleId = styleCol ? String(r[styleCol-1]||"") : "";
    var name    = nameCol  ? String(r[nameCol-1]||"")  : "";
    out.push({
      brandId:   brandId,
      styleId:   styleId,
      name:      name,
      brandName: brandsMap[brandId] || brandId
    });
  }
  return { ok:true, data: out };
}

// Resumen de etiquetas por Marca/Estilo con STOCK ACTUAL (altas - consumos)
function handleLabelsSummary(){
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var adds = _labelsAddsDetail(ss); // key -> { addQty, isCustom, brandId, styleId, name }
  var cons = _labelsConsMap(ss);    // key -> consQty
  var brandsMap = _brandNameMap(ss);

  var out = [];
  Object.keys(adds).forEach(function(k){
    var a = adds[k];
    var stock = (a.addQty || 0) - (cons[k] || 0);
    if (stock <= 0) return; // oculto sin stock
    var marca, estilo;
    if (a.isCustom){
      marca  = "Personalizada";
      estilo = a.name || "(sin nombre)";
    } else {
      marca  = brandsMap[a.brandId] || "(sin marca)";
      estilo = a.name || "(sin estilo)";
    }
    out.push({ marca: marca, estilo: estilo, totalQty: stock });
  });

  out.sort(function(a,b){ return (b.totalQty||0) - (a.totalQty||0); });
  return { ok:true, data: out };
}


/*************** PRODUCCIÓN ***************/

// Crear producción en estado ENLATADO (consume latas vacías)
function createProduction(p){
  var qty = Math.max(0, Number(p.qty||0));
  var brandId = String(p.brandId||"").trim();
  var styleId = String(p.styleId||"").trim();
  if (!qty) return { ok:false, error:"MISSING_QTY" };

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Verifico stock neto de latas vacías
  var avail = _currentEmptyStock(ss);
  if (avail < qty){
    return { ok:false, error:"NO_EMPTY_STOCK", available: avail, needed: qty };
  }

  // Hoja PRODUCTIONS
  if (!SHEETS.PRODUCTIONS){ SHEETS.PRODUCTIONS = "productions"; }
  var sh = _getOrCreateSheet(ss, SHEETS.PRODUCTIONS, PROD_HEADERS);

  var now = _now();
  var id  = "PR-" + _uuid();
  var row = [id, brandId, styleId, qty, "ENLATADO", "", "", "", now, now];
  _appendRow(sh, row, PROD_HEADERS.length);

  // Movimiento: consumo de latas vacías
  _appendMovement(ss, {
    type: "EMPTY_CANS_CONS",
    refId: "PROD:"+id,
    qty: qty,
    provider: "", lot: "", dateTime: now
  });

  // Historial
  _appendProdHistory(ss, id, "", "ENLATADO", now, "");

  return { ok:true, data:{ id:id } };
}

// Avanzar estado (PAUSTERIZADO, ETIQUETADO, FINAL)
function handleAdvanceProduction(p){
  var prodId = String(p.prodId||"").trim();
  var to = String(p.to||"").trim().toUpperCase();
  if (!prodId || !to) return { ok:false, error:"MISSING_FIELDS" };

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = _getOrCreateSheet(ss, SHEETS.PRODUCTIONS, PROD_HEADERS);
  var map = _headerIndexMap(sh);
  var last = sh.getLastRow();
  if (last <= 1) return { ok:false, error:"NOT_FOUND" };

  var idCol = map["id"]||0;
  if (!idCol) return { ok:false, error:"MISSING_HEADERS" };

  var width = PROD_HEADERS.reduce(function(m,h){ return Math.max(m, map[h]||0); }, 0);
  var rows = sh.getRange(2,1,last-1,width).getValues();
  var rowIndex = -1, rec = {};
  for (var i=0;i<rows.length;i++){
    if (String(rows[i][idCol-1]||"") === prodId){ rowIndex = i; break; }
  }
  if (rowIndex === -1) return { ok:false, error:"NOT_FOUND" };

  PROD_HEADERS.forEach(function(h){
    var c = map[h]||0; rec[h] = c ? rows[rowIndex][c-1] : "";
  });

  var from = String(rec.status||"").toUpperCase();
  var now = _now();
  if (from === to) return { ok:true, data:{ id:prodId, status:from } };

  // FINAL es terminal
  if (from === "FINAL") return { ok:false, error:"FINAL_IS_TERMINAL" };

  // Permitir primera vez ENLATADO -> (P o E). Bloquear solo si YA visitó el destino alguna vez.
  if (to === "PAUSTERIZADO" || to === "ETIQUETADO") {
    var alreadyVisitedTo = false;
    var shHist = _getOrCreateSheet(ss, SHEETS.PROD_HISTORY, PROD_HIST_HEADERS);
    var mapH = _headerIndexMap(shHist);
    var lastH = shHist.getLastRow();
    if (lastH > 1) {
      var wH = Math.max(mapH["prodId"]||0, mapH["to"]||0);
      var rowsH = shHist.getRange(2,1,lastH-1,wH).getValues();
      for (var hi=0; hi<rowsH.length; hi++){
        var pid = mapH["prodId"] ? String(rowsH[hi][mapH["prodId"]-1]||"") : "";
        if (pid !== prodId) continue;
        var toState = mapH["to"] ? String(rowsH[hi][mapH["to"]-1]||"").toUpperCase() : "";
        if (toState === to) { alreadyVisitedTo = true; break; }
      }
    }
    // Si venís de ENLATADO, se permite la primera vez SIEMPRE (aunque el historial tenga basura antigua).
    if (from === "ENLATADO") alreadyVisitedTo = false;

    if (alreadyVisitedTo) {
      return { ok:false, error:"BACKWARD_NOT_ALLOWED_ONCE_VISITED", from:from, to:to };
    }
  }

  // ETIQUETADO consume etiquetas
  if (to === "ETIQUETADO"){
    var labelBrandId = String(p.labelBrandId||"").trim();
    var labelStyleId = String(p.labelStyleId||"").trim();
    var labelName    = String(p.labelName||"").trim();
    if (!labelBrandId && !labelStyleId && !labelName){
      return { ok:false, error:"MISSING_LABEL_SELECTION" };
    }

    var need = Number(rec.qty||0);
    var availL = _currentLabelsStock(ss);
    if (availL < need){
      return { ok:false, error:"NO_LABEL_STOCK", available: availL, needed: need };
    }

    if (map["labelBrandId"]) sh.getRange(rowIndex+2, map["labelBrandId"]).setValue(labelBrandId);
    if (map["labelStyleId"]) sh.getRange(rowIndex+2, map["labelStyleId"]).setValue(labelStyleId);
    if (map["labelName"])    sh.getRange(rowIndex+2, map["labelName"]).setValue(labelName);

    var refKey = "LABEL:" + labelBrandId + "|" + labelStyleId + "|" + labelName;
    _appendMovement(ss, { type:"LABEL_CONS", refId:refKey, qty:need, provider:"", lot:"", dateTime:now });
  }

  // Para FINAL: debe venir de P o E
  if (to === "FINAL"){
    var prev = String(rec.status||"").toUpperCase();
    if (prev !== "PAUSTERIZADO" && prev !== "ETIQUETADO"){
      return { ok:false, error:"FINAL_REQUIRES_P_OR_E", from: prev };
    }
  }

  // Merge de FINAL por estilo efectivo
  if (to === "FINAL"){
    var effBrand = String(rec.labelBrandId||rec.brandId||"");
    var effStyle = String(rec.labelStyleId||rec.styleId||"");
    var effName  = String(rec.labelName||"");

    var statusCol = map["status"]||0;
    var brandCol  = map["brandId"]||0, styleCol = map["styleId"]||0;
    var lBrandCol = map["labelBrandId"]||0, lStyleCol = map["labelStyleId"]||0, lNameCol = map["labelName"]||0;
    var qtyCol    = map["qty"]||0;

    var targetRow = -1;
    for (var i=0;i<rows.length;i++){
      if (i === rowIndex) continue;
      var st = statusCol ? String(rows[i][statusCol-1]||"").toUpperCase() : "";
      if (st !== "FINAL") continue;

      var cEffBrand = lBrandCol ? String(rows[i][lBrandCol-1]||"") : "";
      var cEffStyle = lStyleCol ? String(rows[i][lStyleCol-1]||"") : "";
      var cEffName  = lNameCol  ? String(rows[i][lNameCol-1] ||"") : "";
      if (!cEffBrand && brandCol) cEffBrand = String(rows[i][brandCol-1]||"");
      if (!cEffStyle && styleCol) cEffStyle = String(rows[i][styleCol-1]||"");

      var same = (cEffBrand === effBrand) && (cEffStyle === effStyle) && (cEffName  === effName);
      if (same){ targetRow = i; break; }
    }

    if (targetRow !== -1 && qtyCol){
      var curQty = Number(rec.qty||0);
      var tgtQty = Number(rows[targetRow][qtyCol-1]||0);
      var newQty = (isNaN(tgtQty)?0:tgtQty) + (isNaN(curQty)?0:curQty);
      sh.getRange(targetRow+2, qtyCol).setValue(newQty);

      _appendMovement(ss, { type:"PROD_FINAL_IN", refId:"PROD:"+rec.id, qty:curQty, provider:"", lot:"", dateTime:now });

      sh.deleteRow(rowIndex+2);
      _appendProdHistory(ss, rec.id, from, "FINAL", now, "Fusionado con FINAL existente");
      return { ok:true, data:{ id:String(rows[targetRow][idCol-1]||""), status:"FINAL", merged:true, qty:newQty } };
    }
  }

  // Caso normal: set status + updatedAt
  if (map["status"])    sh.getRange(rowIndex+2, map["status"]).setValue(to);
  if (map["updatedAt"]) sh.getRange(rowIndex+2, map["updatedAt"]).setValue(now);

  // FINAL sin fusión → movimiento de ingreso
  if (to === "FINAL") {
    var finQty = Number(rec.qty||0);
    _appendMovement(ss, { type:"PROD_FINAL_IN", refId:"PROD:"+rec.id, qty:finQty, provider:"", lot:"", dateTime:now });
  }

  _appendProdHistory(ss, rec.id, from, to, now, "");
  return { ok:true, data:{ id:rec.id, status:to } };
}



// Listado/paginado de producciones
function handleListProductions(p){
  var page     = Math.max(1, Number(p.page || 1));
  var pageSize = Math.max(1, Math.min(200, Number(p.pageSize || 20)));
  var status   = String(p.status||"").trim().toUpperCase(); // opcional

  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = _getOrCreateSheet(ss, SHEETS.PRODUCTIONS, PROD_HEADERS);
  var map = _headerIndexMap(sh);
  var last = sh.getLastRow();
  if (last <= 1) return { ok:true, data:{ total:0, items:[] } };

  var width = PROD_HEADERS.reduce(function(m, h){ return Math.max(m, map[h]||0); }, 0);
  var rows = sh.getRange(2,1,last-1,width).getValues();

  var filtered = rows.filter(function(r){
    var st = map["status"] ? String(r[map["status"]-1]||"") : "";
    return status ? (st.toUpperCase() === status) : true;
  });

  var total = filtered.length;
  var start = (page - 1) * pageSize;
  var end   = Math.min(start + pageSize, total);
  var slice = (start < end) ? filtered.slice(start, end) : [];

  var items = slice.map(function(r){
    var out = {};
    PROD_HEADERS.forEach(function(h){ var c = map[h]||0; out[h] = c ? r[c-1] : ""; });
    return out;
  });

  return { ok:true, data:{ total: total, items: items } };
}

/** ====== HELPERS ====== */

function _now() {
  var d = new Date();
  return Utilities.formatDate(d, TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
}
function _uuid() { return Utilities.getUuid(); }
function _getOrCreateSheet(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  _ensureHeaders(sh, headers);
  return sh;
}
function _ensureHeaders(sh, headers) {
  if (!headers || !headers.length) return;
  var firstRow = sh.getRange(1,1,1,headers.length).getValues()[0];
  var mismatch = false;
  for (var i=0;i<headers.length;i++) { if (firstRow[i] !== headers[i]) { mismatch = true; break; } }
  if (mismatch) sh.getRange(1,1,1,headers.length).setValues([headers]);
}
function _appendRow(sh, row, width) { sh.appendRow(row.slice(0, width)); }
function _headerIndexMap(sh) {
  var lastCol = sh.getLastColumn();
  var headers = sh.getRange(1,1,1,lastCol).getValues()[0];
  var map = {};
  for (var i=0;i<headers.length;i++) {
    var h = (headers[i] || "").toString().trim();
    if (h) map[h] = (i+1); // 1-based
  }
  return map;
}
function _sumColumn(sh, headerName) {
  var map = _headerIndexMap(sh);
  var c = map[headerName] || 0;
  var last = sh.getLastRow();
  if (!c || last <= 1) return 0;
  var vals = sh.getRange(2,c,last-1,1).getValues();
  var total = 0;
  for (var i=0;i<vals.length;i++) {
    var n = Number(vals[i][0] || 0);
    if (!isNaN(n)) total += n;
  }
  return total;
}
function _appendMovement(ss, mov) {
  var sh = _getOrCreateSheet(ss, SHEETS.MOVES, MOVES_HEADERS);
  var id = "MV-" + _uuid();
  var row = [
    id,
    String(mov.type || ""),
    String(mov.refId || ""),
    Number(mov.qty || 0),
    String(mov.provider || ""),
    String(mov.lot || ""),
    String(mov.dateTime || _now())
  ];
  _appendRow(sh, row, MOVES_HEADERS.length);
}
// Devuelve mapa brandId → brandName (desde hoja brands)
function _brandNameMap(ss) {
  var sh = _getOrCreateSheet(ss, SHEETS.BRANDS, BRANDS_HEADERS);
  var last = sh.getLastRow();
  var mapIdx = _headerIndexMap(sh);
  var idCol = mapIdx["id"] || 0;
  var nameCol = mapIdx["name"] || 0;
  if (!idCol || !nameCol || last <= 1) return {};
  var rows = sh.getRange(2,1,last-1,Math.max(idCol,nameCol)).getValues();
  var out = {};
  for (var i=0;i<rows.length;i++){
    var r = rows[i];
    var id = String(r[idCol-1] || "");
    var nm = String(r[nameCol-1] || "");
    if (id) out[id] = nm;
  }
  return out;
}

// --- Helpers de etiquetas (ALTAS - CONSUMOS) ---
function _labelsAddsDetail(ss){
  var sh = _getOrCreateSheet(ss, SHEETS.LABELS, LABELS_HEADERS);
  var last = sh.getLastRow();
  var out = {};
  if (last <= 1) return out;

  var map = _headerIndexMap(sh);
  var bCol = map["brandId"]||0, sCol = map["styleId"]||0, nCol = map["name"]||0, qCol = map["qty"]||0, cCol = map["isCustom"]||0;
  var w = Math.max(bCol,sCol,nCol,qCol,cCol);
  var rows = sh.getRange(2,1,last-1,w).getValues();

  for (var i=0;i<rows.length;i++){
    var r = rows[i];
    var brandId  = bCol? String(r[bCol-1]||"") : "";
    var styleId  = sCol? String(r[sCol-1]||"") : "";
    var name     = nCol? String(r[nCol-1]||"") : "";
    var qty      = qCol? Number(r[qCol-1]||0)  : 0;
    var isCustom = cCol? !!r[cCol-1]          : false;
    var key = brandId + "|" + styleId + "|" + name;
    if (!out[key]) out[key] = { addQty:0, isCustom:isCustom, brandId:brandId, styleId:styleId, name:name };
    out[key].addQty += (isNaN(qty)?0:qty);
    out[key].isCustom = out[key].isCustom || isCustom;
  }
  return out;
}

// --- Stock de latas vacías (ALTAS - CONSUMOS) ---
function _emptyAddsTotal(ss){
  var sh = _getOrCreateSheet(ss, SHEETS.EMPTY, EMPTY_HEADERS);
  var map = _headerIndexMap(sh);
  var qCol = map["qty"]||0;
  var last = sh.getLastRow();
  if (!qCol || last<=1) return 0;
  var vals = sh.getRange(2,qCol,last-1,1).getValues();
  var t=0; for (var i=0;i<vals.length;i++){ var n=Number(vals[i][0]||0); if(!isNaN(n)) t+=n; }
  return t;
}
function _emptyConsTotal(ss){
  var sh = _getOrCreateSheet(ss, SHEETS.MOVES, MOVES_HEADERS);
  var map = _headerIndexMap(sh);
  var tCol = map["type"]||0, qCol = map["qty"]||0;
  var last = sh.getLastRow();
  if (!tCol || !qCol || last<=1) return 0;
  var w = Math.max(tCol,qCol);
  var rows = sh.getRange(2,1,last-1,w).getValues();
  var t=0;
  for (var i=0;i<rows.length;i++){
    var r = rows[i];
    var type = String(r[tCol-1]||"");
    if (type==="EMPTY_CANS_CONS"){
      var n = Number(r[qCol-1]||0); if(!isNaN(n)) t+=n;
    }
  }
  return t;
}
function _currentEmptyStock(ss){
  return _emptyAddsTotal(ss) - _emptyConsTotal(ss);
}

// Mapa de consumos de etiquetas desde movements: key -> consQty (solo LABEL_CONS)
function _labelsConsMap(ss){
  var sh = _getOrCreateSheet(ss, SHEETS.MOVES, MOVES_HEADERS);
  var last = sh.getLastRow();
  var out = {};
  if (last <= 1) return out;

  var map = _headerIndexMap(sh);
  var tCol = map["type"]||0, rCol = map["refId"]||0, qCol = map["qty"]||0;
  var w = Math.max(tCol, rCol, qCol);
  var rows = sh.getRange(2,1,last-1,w).getValues();

  for (var i=0;i<rows.length;i++){
    var r = rows[i];
    var type = tCol? String(r[tCol-1]||"") : "";
    if (type !== "LABEL_CONS") continue;
    var ref  = rCol? String(r[rCol-1]||"") : "";
    if (ref.indexOf("LABEL:") !== 0) continue;
    var key = ref.substring(6); // quita "LABEL:"
    var qty = qCol? Number(r[qCol-1]||0) : 0;
    if (!out[key]) out[key] = 0;
    out[key] += (isNaN(qty)?0:qty);
  }
  return out;
}

// Sumatoria por tipo en movements
function _sumMovementsByType(ss, typeName){
  var sh = _getOrCreateSheet(ss, SHEETS.MOVES, MOVES_HEADERS);
  var map = _headerIndexMap(sh);
  var last = sh.getLastRow();
  if (last <= 1 || !map["type"] || !map["qty"]) return 0;
  var width = Math.max(map["type"], map["qty"]);
  var rows = sh.getRange(2,1,last-1,width).getValues();
  var total = 0;
  for (var i=0;i<rows.length;i++){
    var t = String(rows[i][map["type"]-1]||"");
    if (t === typeName){
      var n = Number(rows[i][map["qty"]-1]||0);
      if (!isNaN(n)) total += n;
    }
  }
  return total;
}
function _currentEmptyCansStock(ss){
  var shE = _getOrCreateSheet(ss, SHEETS.EMPTY, EMPTY_HEADERS);
  var added = _sumColumn(shE, "qty");
  var consumed = _sumMovementsByType(ss, "EMPTY_CANS_CONS");
  return Math.max(0, added - consumed);
}
function _currentLabelsStock(ss){
  var shL = _getOrCreateSheet(ss, SHEETS.LABELS, LABELS_HEADERS);
  var added = _sumColumn(shL, "qty");
  var consumed = _sumMovementsByType(ss, "LABEL_CONS");
  return Math.max(0, added - consumed);
}

// Historial de producción
function _appendProdHistory(ss, prodId, from, to, dt, note){
  var sh = _getOrCreateSheet(ss, SHEETS.PROD_HISTORY, PROD_HIST_HEADERS);
  var id = "PH-" + _uuid();
  var row = [id, prodId, from, to, dt, note||""];
  _appendRow(sh, row, PROD_HIST_HEADERS.length);
}

// Suma de cantidades por estado de producción
function handleProdStatusTotals(){
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = _getOrCreateSheet(ss, SHEETS.PRODUCTIONS, PROD_HEADERS);
  var map = _headerIndexMap(sh);
  var last = sh.getLastRow();
  var out = { ENLATADO:0, PAUSTERIZADO:0, ETIQUETADO:0, FINAL:0 };

  if (last <= 1) return { ok:true, data: out };

  var statusCol = map["status"]||0;
  var qtyCol    = map["qty"]||0;
  var width = Math.max(statusCol, qtyCol);
  var rows = sh.getRange(2,1,last-1,width).getValues();

  for (var i=0;i<rows.length;i++){
    var st = statusCol ? String(rows[i][statusCol-1]||"").toUpperCase() : "";
    var q  = qtyCol    ? Number(rows[i][qtyCol-1]||0)                      : 0;
    if (out.hasOwnProperty(st)) out[st] += (isNaN(q)?0:q);
  }
  return { ok:true, data: out };
}

