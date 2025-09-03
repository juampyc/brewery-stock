# Brewery Stock App (Frontend + Apps Script)

**Entidades**:
- Terminados: por Marca (Castelo/Big Rock) y Estilo (IPA/Kolsch/Porter/Honey)
- Etiquetas: por Marca/Estilo (1 etiqueta por lata)
- Latas vacías: stock global

**Hojas (se crean solas):**
- Stock_Finished: Key | Brand | Style | OnHand
- Stock_Labels:   Key | Brand | Style | OnHand
- Stock_EmptyCans: OnHand
- Movements: Date | Type | Brand | Style | Qty | Note | MoveId

**Backend (Apps Script):**
1) Abrí tu Google Sheet → Extensiones → Apps Script.
2) Pegá `apps_script_code.gs` y reemplazá `SPREADSHEET_ID` por el ID de tu hoja.
3) Deploy → Web app → Execute as: *Me* | Who has access: *Anyone with the link*.
4) Copiá la URL `/exec`.

**Frontend:**
1) En `app.js`, reemplazá `API` por tu URL de Web App.
2) Abrí `index.html` con un servidor local (Live Server) y probá.
3) Publicá en GitHub Pages / Netlify si querés.

**Reglas:**
- `Producción` aumenta terminados y descuenta 1 etiqueta del combo y 1 lata vacía por unidad.
- Si faltan etiquetas o latas vacías, bloquea el movimiento.
- `Ingreso de etiquetas` y `Ingreso de latas vacías` suman insumos.
- Las bajas de terminados (ventas) no devuelven etiquetas/latas (consumo irreversible).