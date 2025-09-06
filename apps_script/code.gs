/**
 * Castelo Stock Control - Apps Script backend for GitHub‑hosted frontend
 *
 * This script exposes a simple REST‑style API which the static HTML/JS
 * application (served from GitHub Pages or any other static host) can
 * consume via fetch(). All data is persisted into a single Google
 * Spreadsheet referenced by the constant SPREADSHEET_ID. Each logical
 * entity (brands, styles, fermenters, containers and empty cans) is
 * stored in its own sheet. When a sheet does not exist it will be
 * created on demand and seeded with the appropriate header row.
 *
 * The API supports the following actions:
 *   GET  ?action=getAll&entity=…        → returns an array of records
 *   GET  ?action=count&entity=…         → returns a count of records
 *   POST ?action=upsert&entity=…        → create or update a record
 *   POST ?action=delete&entity=…        → remove a record by id
 *   POST ?action=addEmptyCan            → append a new empty can record
 *
 * Responses are JSON and CORS headers are added to allow access from
 * third party domains. Errors are returned as objects with an "error"
 * property describing what went wrong.
 */

const SPREADSHEET_ID = "1eML8y0shrdheQ3bISwV3bnimsAVDruR1x1JFUKNWcog";

// Map logical entities to sheet names. If you add a new entity
// remember to add its header definition to HEADERS below.
const SHEET_MAP = {
  "brands": "Brands",
  "styles": "Styles",
  "fermenters": "Fermenters",
  "containers": "Containers",
  "emptycans": "EmptyCans"
};

// Header rows for each entity. When creating a new sheet the
// corresponding header row will be written into row 1. If you change
// these headers please also update the client side code to match.
const HEADERS = {
  "brands": ["id", "name", "color", "lastModified"],
  "styles": ["id", "brandId", "brandName", "name", "color", "showAlways", "lastModified"],
  "fermenters": ["id", "name", "sizeLiters", "color", "lastModified"],
  "containers": ["id", "name", "sizeLiters", "type", "color", "lastModified"],
  "emptycans": ["id", "lote", "fabricante", "compra", "lastModified"]
};

/**
 * Obtain a Spreadsheet instance by id. In the event the spreadsheet
 * cannot be opened this function will throw an exception.
 */
function _getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Retrieve a worksheet for a given entity. If the sheet does not
 * already exist it will be created and initialised with the header
 * row defined in HEADERS. If the header row exists but does not
 * exactly match the expected header, the sheet will be cleared and
 * rewritten with the expected header. This ensures data integrity
 * across deployments.
 *
 * @param {string} entity Logical name (e.g. 'brands')
 * @return {Sheet} The Google Sheet for that entity
 */
function _getSheet(entity) {
  const ss = _getSpreadsheet();
  const sheetName = SHEET_MAP[entity];
  if (!sheetName) throw new Error("Unknown entity: " + entity);
  let sh = ss.getSheetByName(sheetName);
  if (!sh) {
    sh = ss.insertSheet(sheetName);
  }
  const headers = HEADERS[entity];
  // Read the existing header row (if any)
  const current = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  // If the header is missing or mismatched then reinitialise
  if (current.join("") === "" || JSON.stringify(current) !== JSON.stringify(headers)) {
    sh.clear();
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

/**
 * Convert the rows of a sheet into an array of objects keyed by the
 * header row. Empty id rows are skipped. Type conversions are
 * performed for booleans and numbers where relevant. For example,
 * styles.showAlways will be a boolean and sizeLiters will be a
 * number.
 *
 * @param {string} entity Logical name of the entity
 * @return {Object[]} Array of record objects
 */
function _readAll(entity) {
  const sh = _getSheet(entity);
  const data = sh.getDataRange().getValues();
  const headers = data.shift();
  const index = {};
  headers.forEach((h, i) => { index[h] = i; });
  const list = [];
  data.forEach(row => {
    if (!row[index['id']]) return;
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    if (entity === 'styles') {
      obj.showAlways = String(obj.showAlways) === 'TRUE';
    }
    if (entity === 'fermenters' || entity === 'containers') {
      obj.sizeLiters = Number(obj.sizeLiters || 0);
    }
    return list.push(obj);
  });
  return list;
}

/**
 * Persist an array of objects back to the sheet. The sheet will be
 * cleared before data is written. It is assumed that each object has
 * a key corresponding to each header defined for the entity. Missing
 * values will be written as empty strings. If no items are passed
 * only the header row will remain.
 *
 * @param {string} entity Logical entity name
 * @param {Object[]} items Array of objects to persist
 */
function _writeAll(entity, items) {
  const sh = _getSheet(entity);
  sh.clear();
  const headers = HEADERS[entity];
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (!items || items.length === 0) return;
  const rows = items.map(item => headers.map(h => item[h] !== undefined ? item[h] : ""));
  sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
}

/**
 * Return a timestamp in the spreadsheet's timezone formatted as
 * YYYY-MM-DD HH:mm:ss. This is used to mark the last modification
 * time of records.
 */
function _now() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "America/Argentina/Buenos_Aires", "yyyy-MM-dd HH:mm:ss");
}

/**
 * Public function to return all records for an entity. Called via
 * GET request with action=getAll.
 *
 * @param {string} entity Logical name
 * @return {Object[]} Array of records
 */
function getAll(entity) {
  return _readAll(entity);
}

/**
 * Create or update a record. If payload.id is supplied and matches
 * an existing record then the existing record will be updated. If
 * payload.id is absent a new record will be created with a UUID.
 * Validations are performed to ensure uniqueness on certain fields.
 * Brands must have a unique name. Styles must have a unique
 * (brandId, name) combination. Fermenters and containers must have
 * unique names. Empty cans are always appended as new records.
 *
 * @param {string} entity Logical name
 * @param {Object} payload Data to persist
 * @return {Object} The persisted record
 */
function upsert(entity, payload) {
  if (!payload) throw new Error("Missing payload");
  const items = _readAll(entity);
  const now = _now();
  function existsName(list, name, excludeId) {
    return list.some(item => item.name && String(item.name).trim().toLowerCase() === String(name).trim().toLowerCase() && item.id !== excludeId);
  }
  function existsStyle(list, brandId, name, excludeId) {
    return list.some(item => item.brandId === brandId && String(item.name).trim().toLowerCase() === String(name).trim().toLowerCase() && item.id !== excludeId);
  }
  // Always generate an id if missing
  if (!payload.id) {
    payload.id = Utilities.getUuid();
  }
  payload.lastModified = now;
  if (entity === 'brands') {
    if (!payload.name) throw new Error("Brand name required");
    if (existsName(items, payload.name, payload.id)) throw new Error("Brand with that name already exists");
  } else if (entity === 'styles') {
    if (!payload.brandId) throw new Error("Style must link to brand");
    if (!payload.name) throw new Error("Style name required");
    if (existsStyle(items, payload.brandId, payload.name, payload.id)) throw new Error("Style with that name for this brand already exists");
    payload.showAlways = !!payload.showAlways;
    // maintain brandName reference for easier display on client
    const brands = _readAll('brands');
    const b = brands.find(b => b.id === payload.brandId);
    payload.brandName = b ? b.name : "";
  } else if (entity === 'fermenters') {
    if (!payload.name) throw new Error("Fermenter name required");
    if (existsName(items, payload.name, payload.id)) throw new Error("Fermenter with that name already exists");
    payload.sizeLiters = Number(payload.sizeLiters || 0);
  } else if (entity === 'containers') {
    if (!payload.name) throw new Error("Container name required");
    if (existsName(items, payload.name, payload.id)) throw new Error("Container with that name already exists");
    payload.sizeLiters = Number(payload.sizeLiters || 0);
    payload.type = payload.type || "lata";
  } else if (entity === 'emptycans') {
    // always treat as new record; duplicates allowed
    payload.id = Utilities.getUuid();
  }
  // apply update or insert
  const index = items.findIndex(item => item.id === payload.id);
  if (index >= 0) {
    items[index] = Object.assign({}, items[index], payload);
  } else {
    items.push(payload);
  }
  _writeAll(entity, items);
  return payload;
}

/**
 * Remove a record by id. Throws an error if not found.
 *
 * @param {string} entity Logical name
 * @param {string} id Record identifier
 * @return {{ok: boolean}}
 */
function removeById(entity, id) {
  if (!id) throw new Error("Missing id");
  const items = _readAll(entity);
  const newItems = items.filter(item => item.id !== id);
  if (newItems.length === items.length) throw new Error("Item not found");
  _writeAll(entity, newItems);
  return { ok: true };
}

/**
 * Return the count of records for a given entity. Useful for showing
 * statistics without transferring the entire dataset.
 *
 * @param {string} entity
 * @return {number}
 */
function count(entity) {
  const items = _readAll(entity);
  return items.length;
}

/**
 * Handle GET requests. The expected parameters are "action" and
 * optionally "entity". Currently supported GET actions are:
 *  - getAll: returns an array of records
 *  - count: returns an integer count of records
 * If an unknown action is supplied an error object is returned.
 */
function doGet(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || "";
  const entity = params.entity || "";
  let result;
  try {
    if (action === 'getAll') {
      result = getAll(entity);
    } else if (action === 'count') {
      result = count(entity);
    } else {
      result = { error: 'Unknown action' };
    }
  } catch (err) {
    result = { error: err.message || err.toString() };
  }
  // Support JSONP callback if provided (for legacy usage). If no
  // callback parameter is given a plain JSON string is returned.
  const callback = params.callback;
  let payload = JSON.stringify(result);
  if (callback) {
    payload = callback + '(' + payload + ')';
  }
  const output = ContentService.createTextOutput(payload).setMimeType(ContentService.MimeType.JSON);
  // CORS headers for public access
  output.setHeader('Access-Control-Allow-Origin', '*');
  output.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return output;
}

/**
 * Handle POST requests. The expected parameters are "action" and
 * "entity". The request body is expected to be JSON encoded. The
 * following actions are supported:
 *  - upsert: create or update a record
 *  - delete: remove a record (requires {id})
 *  - addEmptyCan: alias for upsert on emptycans
 */
function doPost(e) {
  const params = e && e.parameter ? e.parameter : {};
  const action = params.action || "";
  const entity = params.entity || "";
  let result;
  try {
    const body = (e && e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : {};
    if (action === 'upsert') {
      result = upsert(entity, body);
    } else if (action === 'delete') {
      result = removeById(entity, body.id);
    } else if (action === 'addEmptyCan') {
      result = upsert('emptycans', body);
    } else {
      result = { error: 'Unknown action' };
    }
  } catch (err) {
    result = { error: err.message || err.toString() };
  }
  const output = ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  output.setHeader('Access-Control-Allow-Origin', '*');
  output.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  output.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  return output;
}