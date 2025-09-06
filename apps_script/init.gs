/**
 * Initialization and reset helpers for Castelo Stock Control.
 *
 * Run `initCasteloDB()` once to populate your spreadsheet with
 * sensible demo data. Run `resetCasteloDB()` if you wish to clear
 * existing records but keep the headers intact. Both functions
 * operate on the spreadsheet defined in SPREADSHEET_ID (declared in
 * code.gs). You can safely remove this file if you do not need
 * seeded data.
 */

function initCasteloDB() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const NOW = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || "America/Argentina/Buenos_Aires", "yyyy-MM-dd HH:mm:ss");
  // Ensure all sheets exist and headers are correct
  Object.keys(SHEET_MAP).forEach(entity => {
    const sheetName = SHEET_MAP[entity];
    let sh = ss.getSheetByName(sheetName);
    if (!sh) {
      sh = ss.insertSheet(sheetName);
    }
    const headers = HEADERS[entity];
    sh.clear();
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  });
  // Create deterministic ids for brands to link styles
  const idCastelo = Utilities.getUuid();
  const idBogRock = Utilities.getUuid();
  // Demo rows for each entity
  const brandsData = [
    [idCastelo, 'Castelo', '#4f46e5', NOW],
    [idBogRock, 'Bog Rock', '#f59e0b', NOW]
  ];
  const stylesData = [
    [Utilities.getUuid(), idCastelo, 'Castelo', 'IPA', '#10b981', true, NOW],
    [Utilities.getUuid(), idCastelo, 'Castelo', 'Kölsch', '#3b82f6', false, NOW],
    [Utilities.getUuid(), idBogRock, 'Bog Rock', 'Honey Beer', '#f59e0b', true, NOW]
  ];
  const fermentersData = [
    [Utilities.getUuid(), 'Fermentador 1000L', 1000, '#8b5cf6', NOW],
    [Utilities.getUuid(), 'Fermentador 750L', 750, '#ec4899', NOW]
  ];
  const containersData = [
    [Utilities.getUuid(), 'Lata 473cc', 0.473, 'lata', '#2563eb', NOW],
    [Utilities.getUuid(), 'Barril 50L', 50, 'barril', '#9333ea', NOW]
  ];
  // Empty cans start empty; no demo rows
  const entityRows = {
    'brands': brandsData,
    'styles': stylesData,
    'fermenters': fermentersData,
    'containers': containersData,
    'emptycans': []
  };
  // Write each entity
  Object.entries(entityRows).forEach(([entity, rows]) => {
    const sh = ss.getSheetByName(SHEET_MAP[entity]);
    const headers = HEADERS[entity];
    if (rows.length > 0) {
      sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
  });
  SpreadsheetApp.flush();
  Logger.log('Spreadsheet initialised with demo data.');
}

function resetCasteloDB() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  Object.keys(SHEET_MAP).forEach(entity => {
    const sheetName = SHEET_MAP[entity];
    let sh = ss.getSheetByName(sheetName);
    if (!sh) {
      sh = ss.insertSheet(sheetName);
    }
    sh.clear();
    const headers = HEADERS[entity];
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  });
  SpreadsheetApp.flush();
  Logger.log('Spreadsheet reset; only headers remain.');
}