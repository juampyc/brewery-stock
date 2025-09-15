// Google Apps Script backend for simple stock CRUD (empty cans + labels summary)
// Spreadsheet ID provided by the user:
const SPREADSHEET_ID = "1eML8y0shrdheQ3bISwV3bnimsAVDruR1x1JFUKNWcog";
const TZ = "America/Argentina/Buenos_Aires";

const SHEETS = {
  EMPTY: "empty_cans",
  LABELS: "labels",
  MOVES: "movements"
};

const EMPTY_HEADERS = ["id","qty","provider","lot","dateTime","lastModified"];
const LABELS_HEADERS = ["id","brandId","styleId","name","isCustom","qty","provider","lot","dateTime","lastModified"];
const MOVES_HEADERS  = ["id","type","refId","qty","provider","lot","dateTime"];

function _ss() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function _getOrCreateSheet(name, headers) {
  const ss = _ss();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  // Ensure headers
  const firstRow = sh.getRange(1,1,1,headers.length).getValues()[0];
  const needsHeaders = headers.some((h,i)=> firstRow[i] !== h);
  if (needsHeaders) {
    sh.clear();
    sh.getRange(1,1,1,headers.length).setValues([headers]);
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

function doGet(e) {
  // Simple health check
  return ContentService.createTextOutput(JSON.stringify({ok:true, ping:true}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action || "";
    let payload = {};
    if (params.payload) {
      try { payload = JSON.parse(params.payload); } catch (err) {}
    }

    let result;
    switch(action) {
      case "getSummaryCounts":
        result = handleGetSummaryCounts();
        break;
      case "addEmptyCans":
        result = handleAddEmptyCans(payload);
        break;
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

function handleGetSummaryCounts() {
  const emptySh = _getOrCreateSheet(SHEETS.EMPTY, EMPTY_HEADERS);
  const labelsSh = _getOrCreateSheet(SHEETS.LABELS, LABELS_HEADERS);
  // sum qty (col 2 for EMPTY, col 6 for LABELS)
  const emptyTotal = _sumQty(emptySh, 2);
  const labelsTotal = _sumQty(labelsSh, 6);
  return { ok:true, data:{ emptyCansTotal: emptyTotal, labelsTotal } };
}

function handleAddEmptyCans(payload) {
  const qty = Number(payload.qty || 0);
  const provider = (payload.provider || "").toString().trim();
  const lot = (payload.lot || "").toString().trim();
  if (!qty || qty <= 0 || !provider || !lot) {
    return { ok:false, error:"INVALID_INPUT" };
  }

  const nowStr = _nowStr();
  const emptySh = _getOrCreateSheet(SHEETS.EMPTY, EMPTY_HEADERS);
  const movesSh = _getOrCreateSheet(SHEETS.MOVES, MOVES_HEADERS);

  try {
    const id = _genId("EC");
    emptySh.appendRow([id, qty, provider, lot, nowStr, nowStr]);

    // Movement log
    const moveId = _genId("MV");
    movesSh.appendRow([moveId, "EMPTY_CANS_ADD", id, qty, provider, lot, nowStr]);

    return { ok:true, data:{ id } };
  } catch (err) {
    console.error('handleAddEmptyCans error:', err);
    return { ok:false, error:String(err) };
  }
}
