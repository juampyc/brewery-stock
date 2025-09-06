// ID de tu Spreadsheet
const SPREADSHEET_ID = "1eML8y0shrdheQ3bISwV3bnimsAVDruR1x1JFUKNWcog";

function doGet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const configSheet = ss.getSheetByName("Config");
  const config = configSheet.getDataRange().getValues();
  const headers = config.shift(); // quitar encabezado

  // armo un diccionario {brand+style -> color}
  const colors = {};
  config.forEach(r=>{
    const key = r[0]+"|"+r[1];
    colors[key] = r[3] || "#9e9e9e";
  });

  function mapWithColor(sheetName, cols){
    const sh = ss.getSheetByName(sheetName);
    const vals = sh.getDataRange().getValues();
    const head = vals.shift();
    return vals.map(r=>{
      const obj={};
      head.forEach((h,i)=> obj[h]=r[i]);
      // agrego color desde config
      const key = (r[0]||"")+"|"+(r[1]||"");
      obj.Color = colors[key] || "#9e9e9e";
      return obj;
    });
  }

  return ContentService.createTextOutput(
    JSON.stringify({
      finished: mapWithColor("Finished"),
      labels: mapWithColor("Labels"),
      empty: readEmpty(ss.getSheetByName("Empty")),
      unlabeled: mapWithColor("Unlabeled"),
      packed: mapWithColor("Packed"),
      config: mapWithColor("Config")
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const body = JSON.parse(e.postData.contents);
  let res = { ok: true };

  switch (body.action) {
    case "batch_produce":
      res = produce(ss, body.items, body.state, body.consume, body.note);
      break;
    case "labels_in":
      res = adjustLabels(ss, body.items, +1, body.note);
      break;
    case "empty_in":
      res = adjustEmpty(ss, body.qty, +1, body.note);
      break;
    case "adjust_finished":
      res = adjustFinished(ss, body.brand, body.style, body.delta, body.note);
      break;
    case "adjust_empty":
      res = adjustEmpty(ss, body.delta, +0, body.note);
      break;
    case "config_add_style":
      res = configAddStyle(ss, body.brand, body.style, body.show, body.color);
      break;
    case "pack":
      res = pack(ss, body.brand, body.style, body.qtyBoxes, body.boxSize, body.source, body.withLabels, body.note);
      break;
    default:
      res = { ok: false, error: "Acción desconocida" };
  }

  return ContentService.createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}

// === Helpers ===
function readEmpty(sheet) {
  const v = sheet.getRange(2,1).getValue();
  return v || 0;
}
function logMovement(ss, action, brand, style, qty, note) {
  const sh = ss.getSheetByName("Movements");
  sh.appendRow([new Date(), action, brand, style, qty, note]);
}

// === Ajustes ===
function adjustFinished(ss, brand, style, delta, note) {
  const sh = ss.getSheetByName("Finished");
  const data = sh.getDataRange().getValues();
  for (let i=1; i<data.length; i++) {
    if (data[i][0]==brand && data[i][1]==style) {
      sh.getRange(i+1, 3).setValue((data[i][2]||0)+delta);
      logMovement(ss,"finished",brand,style,delta,note);
      return { ok:true };
    }
  }
  sh.appendRow([brand, style, delta]);
  logMovement(ss,"finished",brand,style,delta,note);
  return { ok:true };
}

function adjustLabels(ss, items, sign, note) {
  const sh = ss.getSheetByName("Labels");
  const data = sh.getDataRange().getValues();
  items.forEach(it=>{
    let found=false;
    for (let i=1; i<data.length; i++) {
      if (data[i][0]==it.brand && data[i][1]==it.style) {
        const newVal=(data[i][2]||0)+(sign*it.qty);
        sh.getRange(i+1,3).setValue(newVal);
        found=true;
        logMovement(ss,"labels",it.brand,it.style,sign*it.qty,note);
      }
    }
    if (!found) {
      sh.appendRow([it.brand, it.style, sign*it.qty]);
      logMovement(ss,"labels",it.brand,it.style,sign*it.qty,note);
    }
  });
  return { ok:true };
}

function adjustEmpty(ss, qty, sign, note) {
  const sh = ss.getSheetByName("Empty");
  let val = sh.getRange(2,1).getValue() || 0;
  val += (sign==0?qty:sign*qty);
  sh.getRange(2,1).setValue(val);
  logMovement(ss,"empty","", "", (sign==0?-qty:qty), note);
  return { ok:true };
}

// === Producción ===
function produce(ss, items, state, consume, note) {
  if (!items || !items.length) return { ok:false, error:"Sin items" };

  items.forEach(it=>{
    if (state==="final") {
      adjustFinished(ss,it.brand,it.style,it.qty,note);
      if (consume) adjustLabels(ss,[it],-1,"Consumo por producción");
      adjustEmpty(ss,it.qty,-1,"Uso de envases");
    } else {
      // Unlabeled
      const sh = ss.getSheetByName("Unlabeled");
      const data = sh.getDataRange().getValues();
      let found=false;
      for (let i=1; i<data.length; i++) {
        if (data[i][0]==it.brand && data[i][1]==it.style && 
            data[i][2]==(state==="unlabeled-pasteurized") &&
            data[i][3]==consume) {
          sh.getRange(i+1,5).setValue((data[i][4]||0)+it.qty);
          found=true;
        }
      }
      if (!found) sh.appendRow([it.brand,it.style,(state==="unlabeled-pasteurized"),consume,it.qty]);
      adjustEmpty(ss,it.qty,-1,"Uso de envases");
      if (consume) adjustLabels(ss,[it],-1,"Consumo por producción");
      logMovement(ss,"unlabeled",it.brand,it.style,it.qty,note);
    }
  });

  return { ok:true };
}

// === Config ===
function configAddStyle(ss, brand, style, show, color) {
  const sh = ss.getSheetByName("Config");
  sh.appendRow([brand, style, show, color || "#9e9e9e"]);
  return { ok:true };
}

// === Empaquetado ===
function pack(ss, brand, style, qtyBoxes, boxSize, source, withLabels, note) {
  const totalLatas = qtyBoxes * boxSize;
  if (source === "final") {
    adjustFinished(ss, brand, style, -totalLatas, "Empaquetado " + note);
  } else {
    const sh = ss.getSheetByName("Unlabeled");
    const data = sh.getDataRange().getValues();
    for (let i=1; i<data.length; i++) {
      if (data[i][0]==brand && data[i][1]==style &&
          data[i][2]==(source==="unlabeled-pasteurized") &&
          data[i][3]==withLabels) {
        const newVal = (data[i][4]||0) - totalLatas;
        if (newVal < 0) return { ok:false, error:"No hay suficiente stock para empaquetar" };
        sh.getRange(i+1,5).setValue(newVal);
        logMovement(ss,"pack-source",brand,style,-totalLatas,note);
        break;
      }
    }
  }

  const shP = ss.getSheetByName("Packed");
  const dataP = shP.getDataRange().getValues();
  let found=false;
  for (let i=1; i<dataP.length; i++) {
    if (dataP[i][0]==brand && dataP[i][1]==style && dataP[i][2]==boxSize) {
      shP.getRange(i+1,4).setValue((dataP[i][3]||0)+qtyBoxes);
      found=true;
    }
  }
  if (!found) shP.appendRow([brand, style, boxSize, qtyBoxes]);

  logMovement(ss,"pack",brand,style,qtyBoxes,`Cajas x${boxSize} - ${note}`);
  return { ok:true };
}

