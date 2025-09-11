/**
 * Castelo Stock Control - Apps Script backend (REST API)
 * Spreadsheet: set by ID below
 */

const SPREADSHEET_ID = "1eML8y0shrdheQ3bISwV3bnimsAVDruR1x1JFUKNWcog";

// Zona horaria del sistema
const TIMEZONE = "America/Argentina/Buenos_Aires";

// Helper de fecha y hora local (BA)
function _now() {
  return Utilities.formatDate(new Date(), TIMEZONE, "yyyy-MM-dd HH:mm:ss");
}

const SHEET_MAP = {
  brands:      "Brands",
  styles:      "Styles",
  fermenters:  "Fermenters",
  containers:  "Containers",
  emptycans:   "EmptyCans",
  labels:      "Labels",
  movements:   "Movements",
  // NUEVOS
  cans:        "Cans",       // stock de latas por estilo/estado/etiqueta
  packages:    "Packages",   // paquetes armados
  emptyboxes:  "EmptyBoxes", // insumo: cajas x12/x24
};

const HEADERS = {
  brands:      ["id","name","color","lastModified"],
  styles:      ["id","brandId","brandName","name","color","showAlways","lastModified"],
  fermenters:  ["id","name","sizeLiters","color","lastModified"],
  containers:  ["id","name","sizeLiters","type","color","lastModified"],

  // Insumos
  emptycans:   ["id","qty","batch","manufacturer","purchase","entryDate","lastModified"],
  labels:      ["id","brandId","brandName","styleId","styleName","isCustom","name","batch","provider","qty","entryDate","lastModified"],
  emptyboxes:  ["id","type","batch","provider","qty","entryDate","lastModified"], // type: box12 | box24

  // Movimientos
  movements:   ["id","entity","entityId","type","qty","dateTime","description","lastModified"],

  // Stock/resultados
  cans:        ["id","brandId","brandName","styleId","styleName","state","labelId","labelName","qty","lastModified"],
  packages:    ["id","type","brandId","brandName","styleId","styleName","labelId","labelName","boxes","unitsPerBox","qtyCans","dateTime","lastModified"],
};

function _getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function _getSheet(entity) {
  const ss = _getSpreadsheet();
  const name = SHEET_MAP[entity];
  if (!name) throw new Error("Unknown entity: " + entity);
  let sh = ss.getSheetByName(name);
  const expected = HEADERS[entity];

  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1,1,1,expected.length).setValues([expected]);
    return sh;
  }

  const firstRow = sh.getRange(1,1,1,expected.length).getValues()[0];
  const same = JSON.stringify(firstRow) === JSON.stringify(expected);
  if (!same) {
    sh.clear();
    sh.getRange(1,1,1,expected.length).setValues([expected]);
  }
  return sh;
}

// Normaliza texto
function _normBasic(s) {
  s = String(s || "");
  try { s = s.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (_) {}
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}
function _normNoDigits(s) { return _normBasic(s).replace(/\d+/g, "").replace(/\s+/g, " ").trim(); }

// Lee todas las filas
function _readAll(entity) {
  const sh = _getSheet(entity);
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return [];
  const headers = vals.shift();
  return vals.filter(r => r[0]).map(r => {
    const obj = {};
    headers.forEach((h,i) => obj[h] = r[i]);
    return obj;
  });
}

// Escribe todo
function _writeAll(entity, rows) {
  const sh = _getSheet(entity);
  sh.clear();
  const headers = HEADERS[entity];
  sh.getRange(1,1,1,headers.length).setValues([headers]);
  if (!rows || rows.length === 0) return;
  const out = rows.map(o => headers.map(h => o[h] ?? ""));
  sh.getRange(2,1,out.length,headers.length).setValues(out);
}

// Normaliza valores de fecha provenientes del frontend
// Acepta: "YYYY-MM-DD", "YYYY-MM-DD HH:mm:ss", "YYYY-MM-DDTHH:mm"
function _normalizeStamp(s) {
  let v = String(s || "").trim();
  if (!v) return _now();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return v.replace("T"," ") + ":00";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v + " 00:00:00";
  // Si ya viene con segundos o es ISO, lo intentamos parsear y devolver formateado
  const d = new Date(v);
  if (!isNaN(d)) return Utilities.formatDate(d, TIMEZONE, "yyyy-MM-dd HH:mm:ss");
  return _now();
}

// Log de movimientos
function _logMovement(entity, entityId, type, qty, dateTime, description){
  const items = _readAll("movements");
  const mov = {
    id: Utilities.getUuid(),
    entity,
    entityId,
    type, // "alta" | "baja" | "transferencia" ...
    qty: Number(qty || 0),
    dateTime: String(dateTime || _now()),
    description: String(description || ""),
    lastModified: _now(),
  };
  items.push(mov);
  _writeAll("movements", items);
}

/**
 * FIFO genérico para insumos:
 * - emptycans: sin filtros
 * - labels: por labelId específico o por styleId (no-custom)
 * - emptyboxes: por type (box12 | box24)
 */
function _consumeFIFO(entity, amount, filter){
  // Devuelve {used:[{id,used}], remaining}
  amount = Math.max(0, Number(amount||0));
  if (amount === 0) return { used:[], remaining:0 };
  const rows = _readAll(entity);

  let pool = rows.slice();
  if (entity === "labels") {
    if (filter?.labelId) pool = pool.filter(r => String(r.id) === String(filter.labelId));
    else if (filter?.styleId) pool = pool.filter(r => !r.isCustom && String(r.styleId) === String(filter.styleId));
  } else if (entity === "emptyboxes") {
    if (filter?.type) pool = pool.filter(r => String(r.type) === String(filter.type));
  }

  // Orden FIFO: por entryDate asc, fallback por lastModified asc
  pool.sort((a,b)=>{
    const da = new Date(a.entryDate || a.lastModified || 0).getTime();
    const db = new Date(b.entryDate || b.lastModified || 0).getTime();
    return da - db;
  });

  const used = [];
  let need = amount;

  for (const r of pool){
    const q = Math.max(0, Number(r.qty||0));
    if (q <= 0) continue;
    const take = Math.min(need, q);
    if (take > 0){
      const all = rows;
      const idx = all.findIndex(x => String(x.id) === String(r.id));
      all[idx].qty = q - take;
      need -= take;
      used.push({ id:r.id, used:take });
      if (need === 0) break;
    }
  }
  if (need > 0) {
    throw new Error("Stock insuficiente en " + entity + " (faltan " + need + ")");
  }
  _writeAll(entity, rows);
  return { used, remaining: need };
}

// Suma/resta al stock de latas por clave (styleId+state+labelId)
function _addToCans({brandId,brandName,styleId,styleName,state,labelId,labelName}, delta){
  const items = _readAll("cans");
  const key = (x)=> [x.styleId, x.state, x.labelId||""].join("|");
  const target = {brandId,brandName,styleId,styleName,state, labelId: (labelId||""), labelName: (labelName||"")};
  const idx = items.findIndex(x => key(x) === key(target));
  if (idx >= 0){
    const next = Math.max(0, Number(items[idx].qty||0) + Number(delta||0));
    if (next < 0) throw new Error("Stock negativo de latas");
    items[idx] = Object.assign({}, items[idx], { qty: next, lastModified: _now() });
  } else {
    if (delta < 0) throw new Error("Sin stock de latas para descontar");
    items.push(Object.assign({ id: Utilities.getUuid(), qty: Number(delta||0), lastModified:_now() }, target));
  }
  _writeAll("cans", items);
}

/**
 * API endpoints
 */
function doGet(e){
  try{
    const entity = e?.parameter?.entity;
    const action = e?.parameter?.action || "ping";
    const id     = e?.parameter?.id;

    let payload;
    if (action === "ping") {
      payload = { ok:true, msg:"pong" };
    } else if (action === "getAll") {
      payload = _readAll(entity);
    } else if (action === "getById") {
      const all = _readAll(entity);
      payload = all.find(x => String(x.id) === String(id)) || null;
    } else if (action === "emptycans_count") {
      const all = _readAll("emptycans");
      const total = all.reduce((a,x)=>a + (Number(x.qty)||0), 0);
      payload = { count: total };
    } else if (action === "cans_stock") {
      payload = _readAll("cans");
    } else {
      payload = { ok:false, error:"Unknown action" };
    }

    return ContentService.createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err){
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e){
  const lock = LockService.getScriptLock(); lock.tryLock(30000);
  try{
    const entity = e?.parameter?.entity;
    const action = (e?.parameter?.action || "upsert").toLowerCase();
    if (!entity) throw new Error("Missing entity");

    const bodyRaw = e.postData?.contents || "{}";
    const data = JSON.parse(bodyRaw);

    // -------- DELETE --------
    if (action === "delete") {
      const id = String((e?.parameter?.id || data?.id || "")).trim();
      if (!id) throw new Error("Missing id");

      if (entity === "brands") {
        const styles = _readAll("styles");
        const linked = styles.some(s => String(s.brandId) === id);
        if (linked) throw new Error("No se puede eliminar la marca: tiene estilos vinculados. Eliminá primero los estilos.");
      }

      const items = _readAll(entity);
      const newItems = items.filter(x => String(x.id) !== id);
      if (newItems.length === items.length) throw new Error("Item not found");
      _writeAll(entity, newItems);
      SpreadsheetApp.flush();

      return ContentService.createTextOutput(JSON.stringify({ ok:true, deleted:id }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // -------- ACCIONES ESPECIALES --------

    // === REGISTRAR PRODUCCIÓN ===
    if (entity === "production" && (action === "register_production" || action === "produce")) {
      const now = _now();

      const style = _readAll("styles").find(s => String(s.id) === String(data.styleId));
      if (!style) throw new Error("Estilo no encontrado");
      const brand = _readAll("brands").find(b => String(b.id) === String(style.brandId));
      if (!brand) throw new Error("Marca no encontrada");

      const qty         = Math.max(1, Number(data.qty||0));
      const labeled     = !!data.labeled;
      const pasteurized = !!data.pasteurized;

      // (opcional) envase elegido desde el front
      const containerId = String(data.containerId||"");
      let isCan = true; // por compatibilidad: si no mandan containerId asumimos lata
      if (containerId) {
        const co = _readAll("containers").find(c => String(c.id) === containerId);
        isCan = !co ? true : (_normBasic(co.type||"") === "lata");
      }

      // timestamp elegido desde el front: "YYYY-MM-DD", "YYYY-MM-DD HH:mm:ss" o "YYYY-MM-DDTHH:mm"
      const dt = _normalizeStamp(data.dateTime || now);

      // Estado destino
      let state = "sin_pasteurizar_sin_etiquetar";
      if (pasteurized && labeled) state = "final";
      else if (!pasteurized && labeled) state = "sin_pasteurizar_etiquetada";
      else if (pasteurized && !labeled) state = "pasteurizada_sin_etiquetar";

      let labelName = "", labelId = "";

      if (isCan) {
        // 1) Descontar latas vacías (FIFO)
        const ec = _consumeFIFO("emptycans", qty, null);
        _logMovement("emptycans", "(multiple)", "baja", qty, dt, `produccion estilo:${style.name} usados:${ec.used.map(u=>u.id+":"+u.used).join(",")}`);

        // 2) Si etiquetada: descontar etiquetas (por labelId explícito o por styleId)
        if (labeled) {
          if (data.labelId) {
            labelId = String(data.labelId);
            const lbl = _readAll("labels").find(l => String(l.id) === labelId);
            if (!lbl) throw new Error("Etiqueta no encontrada");
            labelName = lbl.isCustom ? `(custom) ${lbl.name}` : lbl.styleName;
            const lc = _consumeFIFO("labels", qty, { labelId });
            _logMovement("labels", "(multiple)", "baja", qty, dt, `produccion estilo:${style.name} etiqueta:${labelName} usados:${lc.used.map(u=>u.id+":"+u.used).join(",")}`);
          } else {
            const lc = _consumeFIFO("labels", qty, { styleId: style.id });
            labelName = "(por estilo)";
            _logMovement("labels", "(multiple)", "baja", qty, dt, `produccion estilo:${style.name} etiqueta:${labelName} usados:${lc.used.map(u=>u.id+":"+u.used).join(",")}`);
          }
        }

        // 3) Sumar al stock de latas (CANS)
        _addToCans({
          brandId: brand.id, brandName: brand.name,
          styleId: style.id, styleName: style.name,
          state, labelId, labelName
        }, qty);

        _logMovement("cans", style.id, "alta", qty, dt, `estado:${state} estilo:${style.name} etiqueta:${labelName||"—"}`);
      } else {
        // Si no es lata (barril, etc.): por ahora sólo registramos el movimiento general
        _logMovement("production", style.id, "alta", qty, dt, `envase:no-lata estado:${state} estilo:${style.name}`);
      }

      return ContentService
        .createTextOutput(JSON.stringify({ ok:true, produced: qty, state, isCan }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // === EMPAQUETAR (usa cajas vacías + descuenta latas) ===
    if (entity === "packages" && action === "package"){
      const now = _now();
      const style = _readAll("styles").find(s => String(s.id) === String(data.styleId));
      if (!style) throw new Error("Estilo no encontrado");
      const brand = _readAll("brands").find(b => String(b.id) === String(style.brandId));
      if (!brand) throw new Error("Marca no encontrada");

      const type = String(data.type||"box12");              // box12 | box24
      const unitsPerBox = (type === "box24") ? 24 : 12;
      const boxes = Math.max(1, Number(data.boxes||0));
      const qtyCans = boxes * unitsPerBox;
      const dt = _normalizeStamp(data.dateTime || now);
      const labelId = String(data.labelId||"");
      const label = labelId ? _readAll("labels").find(l => String(l.id) === labelId) : null;
      const stateFilter = String(data.state||""); // "" = cualquiera

      // 0) Consumir cajas vacías (requerido)
      const bx = _consumeFIFO("emptyboxes", boxes, { type });
      _logMovement("emptyboxes", "(multiple)", "baja", boxes, dt, `empaquetado ${type} usados:${bx.used.map(u=>u.id+":"+u.used).join(",")}`);

      // 1) Consumir latas desde CANS (FIFO por lastModified)
      let cans = _readAll("cans")
        .filter(c => String(c.styleId) === String(style.id));
      if (labelId) cans = cans.filter(c => String(c.labelId) === String(labelId));
      if (stateFilter) cans = cans.filter(c => String(c.state) === String(stateFilter));

      // ordenar FIFO por lastModified asc
      cans.sort((a,b)=> new Date(a.lastModified||0) - new Date(b.lastModified||0));

      let need = qtyCans;
      const taken = [];
      const all = _readAll("cans"); // para reescritura
      for (const r of cans){
        const q = Math.max(0, Number(r.qty||0));
        if (q<=0) continue;
        const take = Math.min(need, q);
        if (take>0){
          const idx = all.findIndex(x => String(x.id) === String(r.id));
          all[idx].qty = q - take;
          all[idx].lastModified = now;
          need -= take;
          taken.push({ id:r.id, used:take, state:r.state, labelId:r.labelId||"" });
          if (need===0) break;
        }
      }
      if (need>0) throw new Error("Stock de latas insuficiente para empaquetar (faltan "+need+")");
      _writeAll("cans", all);

      // 2) Registrar paquetes (acumulo por llave styleId+labelId+type)
      const pk = _readAll("packages");
      const key = (x)=> [x.styleId, x.labelId||"", x.type].join("|");
      const target = {
        type,
        brandId: brand.id, brandName: brand.name,
        styleId: style.id, styleName: style.name,
        labelId: labelId || "", labelName: (label ? (label.isCustom?`(custom) ${label.name}`: label.styleName) : ""),
      };
      const idx = pk.findIndex(x => key(x) === key(target));
      if (idx>=0){
        pk[idx].boxes = Math.max(0, Number(pk[idx].boxes||0) + boxes);
        pk[idx].qtyCans = Math.max(0, Number(pk[idx].qtyCans||0) + qtyCans);
        pk[idx].unitsPerBox = unitsPerBox;
        pk[idx].dateTime = dt;
        pk[idx].lastModified = now;
      } else {
        pk.push(Object.assign({
          id: Utilities.getUuid(),
          boxes, unitsPerBox, qtyCans, dateTime: dt, lastModified: now
        }, target));
      }
      _writeAll("packages", pk);

      // Movimientos
      _logMovement("cans", style.id, "baja", qtyCans, dt, `empaquetado ${type} tomados:${taken.map(t=>t.state+":"+t.used).join(",")}`);
      _logMovement("packages", style.id, "alta", boxes, dt, `boxes:${type} x${unitsPerBox} -> latas:${qtyCans}`);

      return ContentService.createTextOutput(JSON.stringify({ ok:true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // === TRANSICIÓN DE ESTADO DE LATAS (con consumo opcional de etiquetas) ===
    if (entity === "cans" && action === "transition_state"){
      const now = _now();
      const style = _readAll("styles").find(s => String(s.id) === String(data.styleId));
      if (!style) throw new Error("Estilo no encontrado");
      const brand = _readAll("brands").find(b => String(b.id) === String(style.brandId));
      if (!brand) throw new Error("Marca no encontrada");

      const fromState = String(data.fromState || ""); // "" = cualquier
      const toState   = String(data.toState || "").trim();
      if (!toState) throw new Error("Debe indicar toState");
      const qty      = Math.max(1, Number(data.qty||0));
      const dt       = _normalizeStamp(data.dateTime || now);
      const labelId  = String(data.labelId||"");
      const consumeLabels = !!data.consumeLabels;

      // 1) Bajar de CANS origen (por estilo + opcional estado + opcional labelId)
      let cans = _readAll("cans").filter(c => String(c.styleId) === String(style.id));
      if (fromState) cans = cans.filter(c => String(c.state) === String(fromState));
      if (labelId)   cans = cans.filter(c => String(c.labelId) === String(labelId));
      // FIFO por lastModified
      cans.sort((a,b)=> new Date(a.lastModified||0) - new Date(b.lastModified||0));

      let need = qty;
      const taken = [];
      const all = _readAll("cans");
      for (const r of cans){
        const q = Math.max(0, Number(r.qty||0));
        if (q<=0) continue;
        const take = Math.min(need, q);
        if (take>0){
          const idx = all.findIndex(x => String(x.id) === String(r.id));
          all[idx].qty = q - take;
          all[idx].lastModified = now;
          need -= take;
          taken.push({ id:r.id, used:take, state:r.state, labelId:r.labelId||"", labelName:r.labelName||"" });
          if (need===0) break;
        }
      }
      if (need>0) throw new Error("Stock insuficiente para transición (faltan "+need+")");
      _writeAll("cans", all);

      _logMovement("cans", style.id, "baja", qty, dt, `transition from:${fromState||"(cualquiera)"} -> ${toState} usados:${taken.map(t=>t.state+":"+t.used).join(",")}`);

      // 2) Consumir etiquetas si corresponde (de unlabeled a labeled)
      let destLabelId = labelId;
      let destLabelName = "";
      const toHasLabel = /etiquetad/i.test(toState);
      const fromHasLabel = /etiquetad/i.test(fromState || "");
      if (consumeLabels && toHasLabel && !fromHasLabel){
        if (destLabelId){
          const lbl = _readAll("labels").find(l => String(l.id) === String(destLabelId));
          if (!lbl) throw new Error("Etiqueta no encontrada");
          destLabelName = lbl.isCustom ? `(custom) ${lbl.name}` : lbl.styleName;
          const lc = _consumeFIFO("labels", qty, { labelId: destLabelId });
          _logMovement("labels", "(multiple)", "baja", qty, dt, `transition estilo:${style.name} etiqueta:${destLabelName} usados:${lc.used.map(u=>u.id+":"+u.used).join(",")}`);
        } else {
          const lc = _consumeFIFO("labels", qty, { styleId: style.id });
          destLabelName = "(por estilo)";
          _logMovement("labels", "(multiple)", "baja", qty, dt, `transition estilo:${style.name} etiqueta:${destLabelName} usados:${lc.used.map(u=>u.id+":"+u.used).join(",")}`);
        }
      } else {
        // Si no se consumen etiquetas, y el destino requiere etiqueta, heredamos si las piezas tomadas ya tenían label
        // (si hubo mezcla de labels, dejamos vacío y se recombina por clave al sumar)
        if (toHasLabel && taken.length === 1) {
          destLabelId = taken[0].labelId || destLabelId || "";
          destLabelName = taken[0].labelName || destLabelName || "";
        }
      }

      // 3) Subir a CANS destino
      _addToCans({
        brandId: brand.id, brandName: brand.name,
        styleId: style.id, styleName: style.name,
        state: toState,
        labelId: destLabelId || "",
        labelName: destLabelName || ""
      }, qty);

      _logMovement("cans", style.id, "alta", qty, dt, `transition to:${toState} etiqueta:${destLabelName||"—"}`);

      return ContentService.createTextOutput(JSON.stringify({ ok:true }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // -------- UPSERT GENÉRICO & ENTIDADES NORMALES --------
    const items = _readAll(entity);
    const now   = _now();

    if (!data.id) data.id = Utilities.getUuid();
    data.lastModified = now;

    if (entity === "brands") {
      if (!data.name) throw new Error("Brand name is required");
      data.color = data.color || "#000000";

      const editing = items.some(x => String(x.id) === String(data.id));
      if (editing) {
        const styles = _readAll("styles");
        const linked = styles.some(s => String(s.brandId) === String(data.id));
        if (linked) throw new Error("No se puede editar la marca: tiene estilos vinculados. Eliminá primero los estilos.");
      }
      const exists = items.some(x => _normBasic(x.name) === _normBasic(data.name) && String(x.id) !== String(data.id));
      if (exists) throw new Error("Ya existe una marca con ese nombre.");

    } else if (entity === "styles") {
      if (!data.brandId) throw new Error("Style must have brandId");
      const b = _readAll("brands").find(x => String(x.id) === String(data.brandId));
      if (!b) throw new Error("Brand not found for brandId");
      data.brandName = b.name;

      if (!data.name) throw new Error("Style name is required");
      data.color = data.color || "#000000";
      data.showAlways = !!data.showAlways;

      const exists = items.some(x =>
        String(x.brandId) === String(data.brandId) &&
        _normBasic(x.name)  === _normBasic(data.name) &&
        String(x.id)        !== String(data.id)
      );
      if (exists) throw new Error("Ya existe un estilo con ese nombre para esa marca.");

    } else if (entity === "fermenters") {
      if (!data.name) throw new Error("Fermenter name is required");
      data.sizeLiters = Number(data.sizeLiters||0);
      data.color = data.color || "#000000";

      const exists = items.some(x => _normBasic(x.name) === _normBasic(data.name) && String(x.id)!==String(data.id));
      if (exists) throw new Error("Ya existe un fermentador con ese nombre.");

    } else if (entity === "containers") {
      if (!data.name) throw new Error("Container name is required");
      data.sizeLiters = Number(data.sizeLiters||0);
      data.type = data.type || "lata";
      data.color = data.color || "#000000";

      const exists = items.some(x => _normBasic(x.name) === _normBasic(data.name) && String(x.id)!==String(data.id));
      if (exists) throw new Error("Ya existe un envase con ese nombre.");

    } else if (entity === "emptycans") {
      // Latas vacías con fecha/hora opcional
      data.qty = Math.max(1, Number(data.qty||0));
      data.batch = data.batch || "";
      data.manufacturer = data.manufacturer || "";
      data.purchase = data.purchase || "";

      // Normaliza a "YYYY-MM-DD HH:mm:ss"
      data.entryDate = _normalizeStamp(data.entryDate);

      const idx = items.findIndex(x => String(x.id) === String(data.id));
      if (idx >= 0) { items[idx] = Object.assign({}, items[idx], data); }
      else { items.push(data); }

      _writeAll(entity, items);

      // movimiento usa exactamente el timestamp elegido
      _logMovement("emptycans", data.id, "alta", data.qty, data.entryDate, `lote:${data.batch} / fab:${data.manufacturer}`);

      return ContentService.createTextOutput(JSON.stringify({ ok:true, item:data }))
        .setMimeType(ContentService.MimeType.JSON);

    } else if (entity === "labels") {
      // Etiquetas (estilo o custom)
      data.isCustom  = !!data.isCustom;
      data.qty       = Math.max(1, Number(data.qty || 0));
      data.batch     = data.batch || "";
      data.provider  = data.provider || "";

      // Normaliza fecha/hora de ingreso
      const entryStamp = _normalizeStamp(data.entryDate);
      data.entryDate = entryStamp;

      // Completar brandName si mandan brandId
      if (data.brandId) {
        const b = _readAll("brands").find(x => String(x.id) === String(data.brandId));
        if (b) data.brandName = b.name;
      }

      if (data.isCustom) {
        if (!data.name) throw new Error("Label custom name is required");
        const itemsAll = _readAll("labels");
        const existsCustom = itemsAll.some(x => !!x.isCustom &&
          _normBasic(x.name) === _normBasic(data.name) &&
          String(x.id) !== String(data.id));
        if (existsCustom) throw new Error("Ya existe una etiqueta personalizada con ese nombre.");
        data.styleId = "";
        data.styleName = "";
      } else {
        if (!data.styleId) throw new Error("Label must have styleId (o marcar personalizada)");
        const st = _readAll("styles").find(s => String(s.id) === String(data.styleId));
        if (!st) throw new Error("Style not found");
        data.styleName = st.name;
        data.brandId = st.brandId;
        data.brandName = st.brandName;
        data.name = "";
      }

      const allLabels = _readAll("labels");
      const idx = allLabels.findIndex(x => String(x.id) === String(data.id));
      let delta = data.qty;

      if (idx >= 0) {
        const prevQty = Number(allLabels[idx].qty || 0);
        delta = Number(data.qty) - prevQty;
        allLabels[idx] = Object.assign({}, allLabels[idx], data);
      } else {
        allLabels.push(data);
      }
      _writeAll("labels", allLabels);

      if (delta !== 0) {
        const type = delta > 0 ? "alta" : "baja";
        _logMovement(
          "labels",
          data.id,
          type,
          Math.abs(delta),
          entryStamp,   // usa el timestamp elegido
          data.isCustom ? `custom:${data.name}` : `estilo:${data.styleName}`
        );
      }

      return ContentService
        .createTextOutput(JSON.stringify({ ok:true, item:data }))
        .setMimeType(ContentService.MimeType.JSON);

    } else if (entity === "emptyboxes") {
      // Altas/ediciones de cajas vacías (insumo empaquetado)
      // type: box12 | box24
      data.type = (String(data.type||"box12") === "box24") ? "box24" : "box12";
      data.qty  = Math.max(1, Number(data.qty||0));
      data.batch = data.batch || "";
      data.provider = data.provider || "";
      data.entryDate = _normalizeStamp(data.entryDate);

      const idx = items.findIndex(x => String(x.id) === String(data.id));
      if (idx >= 0) items[idx] = Object.assign({}, items[idx], data);
      else items.push(data);

      _writeAll("emptyboxes", items);
      _logMovement("emptyboxes", data.id, "alta", data.qty, data.entryDate, `tipo:${data.type} lote:${data.batch} prov:${data.provider}`);

      return ContentService
        .createTextOutput(JSON.stringify({ ok:true, item:data }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // -------- UPSERT GENÉRICO (resto de entidades) --------
    const idx = items.findIndex(x => String(x.id) === String(data.id));
    if (idx >= 0) items[idx] = Object.assign({}, items[idx], data);
    else items.push(data);

    _writeAll(entity, items);
    SpreadsheetApp.flush();

    return ContentService.createTextOutput(JSON.stringify({ ok:true, item:data }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err){
    return ContentService.createTextOutput(JSON.stringify({ ok:false, error:err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally { try{ lock.releaseLock(); }catch(_){ } }
}

function doDelete(e) {
  try {
    const entity = e?.parameter?.entity;
    const id = e?.parameter?.id;
    if (!entity || !id) throw new Error("Missing entity or id");

    const items = _readAll(entity);
    const newItems = items.filter(x => x.id !== id);
    _writeAll(entity, newItems);

    return ContentService
      .createTextOutput(JSON.stringify({ ok:true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok:false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// OPTIONS (CORS)
function doOptions(e) {
  return ContentService.createTextOutput("")
    .setMimeType(ContentService.MimeType.JSON);
}
