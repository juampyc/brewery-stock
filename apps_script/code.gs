
/**
 * Castelo Stock Control - Apps Script backend
 * Storage: Google Spreadsheet with sheets: Brands, Styles, Fermenters, Containers
 * Unique keys:
 *  - Brands: name
 *  - Styles: brandId + name
 *  - Fermenters: name
 *  - Containers: name
 * All entities include: id, name, color, extra fields per type, showAlways (styles), sizeLiters (fermenters/containers), lastModified
 */

const SHEET_MAP = {
  "brands": "Brands",
  "styles": "Styles",
  "fermenters": "Fermenters",
  "containers": "Containers"
};

const HEADERS = {
  "brands": ["id","name","color","lastModified"],
  "styles": ["id","brandId","brandName","name","color","showAlways","lastModified"],
  "fermenters": ["id","name","sizeLiters","color","lastModified"],
  "containers": ["id","name","sizeLiters","type","color","lastModified"] // type: can/barril
};

function _getSpreadsheet() {
  // If you already have a Spreadsheet, put its ID here; otherwise this will use the container-bound one.
  return SpreadsheetApp.getActive();
}

function _getSheet(entity) {
  const ss = _getSpreadsheet();
  const name = SHEET_MAP[entity];
  if (!name) throw new Error("Unknown entity: " + entity);
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1,1,1,HEADERS[entity].length).setValues([HEADERS[entity]]);
  }
  // Ensure headers exist
  const headerRange = sh.getRange(1,1,1,HEADERS[entity].length);
  const currentHeaders = headerRange.getValues()[0];
  if (JSON.stringify(currentHeaders) !== JSON.stringify(HEADERS[entity])) {
    sh.clear();
    sh.getRange(1,1,1,HEADERS[entity].length).setValues([HEADERS[entity]]);
  }
  return sh;
}

function _nowISO() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "America/Argentina/Buenos_Aires", "yyyy-MM-dd HH:mm:ss");
}

function _readAll(entity) {
  const sh = _getSheet(entity);
  const vals = sh.getDataRange().getValues();
  const headers = vals.shift();
  const idx = {};
  headers.forEach((h,i)=>idx[h]=i);
  const items = vals.filter(r => r[idx['id']]).map(r => {
    const obj = {};
    headers.forEach((h,i)=>{ obj[h] = r[i]; });
    // normalize booleans/numbers
    if (entity === "styles") obj.showAlways = String(obj.showAlways) === "TRUE";
    if (entity === "fermenters" || entity === "containers") obj.sizeLiters = Number(obj.sizeLiters || 0);
    return obj;
  });
  return items;
}

function _writeAll(entity, rows) {
  const sh = _getSheet(entity);
  sh.clear();
  const headers = HEADERS[entity];
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  if (!rows || rows.length===0) return;
  const out = rows.map(o => headers.map(h => o[h] ?? ""));
  sh.getRange(2,1,out.length, headers.length).setValues(out);
}

function getAll(entity) {
  return _readAll(entity);
}

function upsert(entity, payload) {
  if (!payload) throw new Error("Missing payload");
  const items = _readAll(entity);
  const now = _nowISO();
  // Uniqueness checks
  function existsBrandName(name, excludeId) {
    return items.some(x => x.name?.toString().trim().toLowerCase() === name.toString().trim().toLowerCase() && x.id !== excludeId);
  }
  function existsStyle(brandId, name, excludeId) {
    return items.some(x => x.brandId === brandId && x.name?.toString().trim().toLowerCase() === name.toString().trim().toLowerCase() && x.id !== excludeId);
  }
  function existsGenericName(name, excludeId) {
    return items.some(x => x.name?.toString().trim().toLowerCase() === name.toString().trim().toLowerCase() && x.id !== excludeId);
  }

  if (!payload.id) {
    payload.id = Utilities.getUuid();
  }
  payload.lastModified = now;

  if (entity === "brands") {
    if (!payload.name) throw new Error("Brand name is required");
    if (existsBrandName(payload.name, payload.id)) {
      throw new Error("Brand with that name already exists");
    }
  } else if (entity === "styles") {
    if (!payload.brandId) throw new Error("Style must be linked to a Brand");
    if (!payload.name) throw new Error("Style name is required");
    if (existsStyle(payload.brandId, payload.name, payload.id)) {
      throw new Error("Style for that brand already exists");
    }
    payload.showAlways = !!payload.showAlways;
    // add brandName denormalized
    const brands = _readAll("brands");
    const b = brands.find(b => b.id === payload.brandId);
    payload.brandName = b ? b.name : "";
  } else if (entity === "fermenters") {
    if (!payload.name) throw new Error("Fermenter name is required");
    if (existsGenericName(payload.name, payload.id)) throw new Error("Fermenter already exists");
    payload.sizeLiters = Number(payload.sizeLiters || 0);
  } else if (entity === "containers") {
    if (!payload.name) throw new Error("Container name is required");
    if (existsGenericName(payload.name, payload.id)) throw new Error("Container already exists");
    payload.sizeLiters = Number(payload.sizeLiters || 0);
    payload.type = payload.type || "lata";
  }

  const idx = items.findIndex(x => x.id === payload.id);
  if (idx >= 0) {
    items[idx] = Object.assign({}, items[idx], payload);
  } else {
    items.push(payload);
  }
  _writeAll(entity, items);
  return payload;
}

function removeById(entity, id) {
  if (!id) throw new Error("Missing id");
  const items = _readAll(entity);
  const newItems = items.filter(x => x.id !== id);
  if (newItems.length === items.length) throw new Error("Item not found");
  _writeAll(entity, newItems);
  return { ok: true };
}

/**
 * Web App router to serve HTML files by ?page=
 */
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) ? e.parameter.page : "index";
  const allowed = ["index","config"];
  const file = allowed.indexOf(page) >= 0 ? page : "index";
  return HtmlService.createTemplateFromFile(file).evaluate()
    .setTitle("Castelo Stock Control")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
