// ==== Google Apps Script backend (de-duplicated, guarded) ====
// Guarded globals to avoid "already declared" when multiple files are combined.
if (typeof SPREADSHEET_ID === 'undefined') var SPREADSHEET_ID = "1eML8y0shrdheQ3bISwV3bnimsAVDruR1x1JFUKNWcog";
if (typeof TZ === 'undefined') var TZ = "America/Argentina/Buenos_Aires";

if (typeof SHEETS === 'undefined') var SHEETS = {
  EMPTY: "empty_cans",
  LABELS: "labels",
  MOVES: "movements"
};

// Headers
if (typeof EMPTY_HEADERS === 'undefined') var EMPTY_HEADERS = ["id","qty","provider","lot","dateTime","lastModified"];
if (typeof LABELS_HEADERS === 'undefined') var LABELS_HEADERS = ["id","brandId","styleId","name","isCustom","qty","provider","lot","dateTime","lastModified"];
if (typeof MOVES_HEADERS  === 'undefined') var MOVES_HEADERS  = ["id","type","refId","qty","provider","lot","dateTime"];

// Styles sheet name
if (typeof STYLES === 'undefined') var STYLES = "styles";

// ===== Utils =====
function _ss() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function _getOrCreateSheet(name, headers) {
  const ss = _ss();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);

  if (headers && headers.length) {
    const firstRow = sh.getRange(1,1,1,headers.length).getValues()[0];
    const needsHeaders = headers.some((h,i)=> firstRow[i] !== h);
    if (needsHeaders) {
      sh.clear();
      sh.getRange(1,1,1,headers.length).setValues([headers]);
    }
  }
  return sh;
}

function _nowStr() {
  const now = new Date();
  return Utilities.formatDate(now, TZ, "yyyy-MM-dd HH:mm:ss");
}

function _genId(prefix) {
  return prefix + "-" + Utilities.getUuid();
}

function _sumQty(sh, qtyColIndex) {
  const last = sh.getLastRow();
  if (last <= 1) return 0;
  const range = sh.getRange(2, qtyColIndex, last-1, 1);
  const vals = range.getValues().flat().map(n => Number(n)||0);
  return vals.reduce((a,b)=>a+b,0);
}

function _headerIndexMap(sh) {
  const lastCol = sh.getLastColumn();
  if (lastCol < 1) return {};
  const headers = sh.getRange(1,1,1,lastCol).getValues()[0].map(String);
  const map = {};
  headers.forEach((h, i) => { map[h] = i+1; });
  return map;
}

// ===== HTTP =====
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ok:true, ping:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action || "";
    let payload = {};
    if (params.payload) { try { payload = JSON.parse(params.payload); } catch (err) {} }

    let result;
    switch(action) {
      case "getSummaryCounts":
        result = handleGetSummaryCounts(); break;
      case "addEmptyCans":
        result = handleAddEmptyCans(payload); break;
      case "listStyles":
        result = handleListStyles(); break;
      case "addLabel":
        result = handleAddLabel(payload); break;
      default:
        result = { ok:false, error:"UNKNOWN_ACTION" };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    const out = { ok:false, error:String(err) };
    return ContentService.createTextOutput(JSON.stringify(out))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== Handlers =====
function handleGetSummaryCounts() {
  const emptySh = _getOrCreateSheet(SHEETS.EMPTY, EMPTY_HEADERS);
  const labelsSh = _getOrCreateSheet(SHEETS.LABELS, LABELS_HEADERS);
  const emptyTotal = _sumQty(emptySh, 2); // qty at col 2
  const labelsTotal = _sumQty(labelsSh, 6); // qty at col 6
  return { ok:true, data:{ emptyCansTotal: emptyTotal, labelsTotal } };
}

function handleAddEmptyCans(payload) {
  const qty = Number(payload.qty || 0);
  const provider = (payload.provider || "").toString().trim();
  const lot = (payload.lot || "").toString().trim();
  if (!qty || qty <= 0 || !provider || !lot) return { ok:false, error:"INVALID_INPUT" };

  const nowStr = _nowStr();
  const emptySh = _getOrCreateSheet(SHEETS.EMPTY, EMPTY_HEADERS);
  const movesSh = _getOrCreateSheet(SHEETS.MOVES, MOVES_HEADERS);

  try {
    const id = _genId("EC");
    emptySh.appendRow([id, qty, provider, lot, nowStr, nowStr]);

    const moveId = _genId("MV");
    movesSh.appendRow([moveId, "EMPTY_CANS_ADD", id, qty, provider, lot, nowStr]);

    return { ok:true, data:{ id } };
  } catch (err) {
    console.error('handleAddEmptyCans error:', err);
    return { ok:false, error:String(err) };
  }
}

// List styles: supports sheets having brandId + name (styleId optional)
function handleListStyles() {
  const sh = _getOrCreateSheet(STYLES, []);
  const map = _headerIndexMap(sh);
  const brandCol = map['brandId'] || 0;
  const styleCol = map['styleId'] || 0; // optional
  const nameCol  = map['name']    || 0;
  const last = sh.getLastRow();
  if (last <= 1 || (!brandCol && !nameCol && !styleCol)) return { ok:true, data: [] };
  const width = Math.max(brandCol, styleCol, nameCol);
  const data = sh.getRange(2,1,last-1, width).getValues();
  const out = data.map(row => ({
    brandId: brandCol ? String(row[brandCol-1] ?? "") : "",
    styleId: styleCol ? String(row[styleCol-1] ?? "") : "",
    name:    nameCol  ? String(row[nameCol-1] ?? "")   : ""
  }));
  return { ok:true, data: out };
}

function handleAddLabel(payload) {
  const qty = Number(payload.qty || 0);
  const provider = (payload.provider || "").toString().trim();
  const lot = (payload.lot || "").toString().trim();
  const isCustom = !!payload.isCustom;
  let brandId = (payload.brandId || "").toString().trim();
  let styleId = (payload.styleId || "").toString().trim();
  let name = (payload.name || "").toString().trim();

  if (!qty || qty <= 0 || !provider || !lot) return { ok:false, error:"INVALID_INPUT" };

  if (isCustom) {
    if (!name) return { ok:false, error:"CUSTOM_NAME_REQUIRED" };
    brandId = brandId || "";
    styleId = styleId || "";
  } else {
    if (!brandId) return { ok:false, error:"BRAND_REQUIRED" };
    // Resolve name (and optional style) from styles sheet
    const sh = _getOrCreateSheet(STYLES, []);
    const map = _headerIndexMap(sh);
    const brandCol = map['brandId'] || 0;
    const styleCol = map['styleId'] || 0; // optional
    const nameCol  = map['name']    || 0;
    const last = sh.getLastRow();
    if (last > 1 && brandCol) {
      const width = Math.max(brandCol, styleCol, nameCol);
      const vals = sh.getRange(2,1,last-1, width).getValues();
      for (let i=0;i<vals.length;i++) {
        const row = vals[i];
        const b = String(row[brandCol-1] || "");
        const s = styleCol ? String(row[styleCol-1] || "") : "";
        const n = nameCol  ? String(row[nameCol-1]  || "") : "";
        if (b === brandId && (!styleId || s === styleId)) {
          if (!name) name = n;
          if (!styleId && styleCol) styleId = s;
          break;
        }
      }
    }
  }

  const labelsSh = _getOrCreateSheet(SHEETS.LABELS, LABELS_HEADERS);
  const movesSh = _getOrCreateSheet(SHEETS.MOVES, MOVES_HEADERS);
  const nowStr = _nowStr();
  try {
    const id = _genId("LB");
    labelsSh.appendRow([id, brandId, styleId, name, isCustom ? "TRUE" : "FALSE", qty, provider, lot, nowStr, nowStr]);

    const moveId = _genId("MV");
    movesSh.appendRow([moveId, "LABEL_ADD", id, qty, provider, lot, nowStr]);

    return { ok:true, data:{ id } };
  } catch (err) {
    console.error('handleAddLabel error:', err);
    return { ok:false, error:String(err) };
  }
}
