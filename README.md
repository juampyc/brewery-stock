# CRUD Simple · Stock de Latas (GitHub Pages + Google Sheets)

Este paquete incluye:

- **index.html**: 2 cards (latas vacías, etiquetas) y un botón para **Ingresar latas vacías** (modal).
- **styles.css**: Estilos minimalistas (dark) y responsive.
- **app.js**: Fetch al Web App de Apps Script. Desactiva botones durante el procesamiento, usa **SweetAlert2** (toast arriba a la derecha), refresca datos al terminar.
- **code.gs**: Backend (Apps Script). Endpoints:
  - `getSummaryCounts`: suma `qty` en `empty_cans` y `labels`.
  - `addEmptyCans`: agrega fila a `empty_cans` y registra movimiento en `movements`.

## Requisitos

- Google Spreadsheet: **1eML8y0shrdheQ3bISwV3bnimsAVDruR1x1JFUKNWcog**
  - Hojas usadas/creadas automáticamente: `empty_cans`, `labels`, `movements`.
  - Timezone: `America/Argentina/Buenos_Aires` (formato `YYYY-MM-DD HH:mm:ss`).

## Pasos

1) **Apps Script**
   - En tu Spreadsheet (ID arriba) → Extensiones → Apps Script → pega `code.gs`.
   - Implementá como **Web App**: `Implementar` → `Nueva implementación` → Tipo `Aplicación web` → Ejecutar como **tú** y Acceso **Cualquiera**.
   - Copiá la URL de despliegue y reemplazá `window.GAS_WEB_APP_URL` en `index.html`.

2) **GitHub Pages**
   - Subí `index.html`, `styles.css`, `app.js` al repo (ej: `brewery-stock/`).
   - Activá GitHub Pages (branch `main`, carpeta `/root` o `/docs`).
   - Abrí la página y probá: Refrescar (↻) y **+ Ingresar latas vacías**.

## Notas

- Usé `application/x-www-form-urlencoded` para evitar preflight CORS.
- Se deshabilitan botones mientras se procesa.
- Los toasts aparecen **arriba a la derecha** y se cierran solos.
- Los registros guardan `dateTime` y `lastModified` con hora Argentina.
- Todo **ingreso** de stock genera un registro en `movements` (`EMPTY_CANS_ADD`).

## Próximos pasos (sugerencias)
- Listado y edición de ingresos (actualizando `lastModified` y registrando movimiento).
- Confirmación con SweetAlert para eliminaciones (y registrar movimiento `DELETE`).
- Reportes por rango de fechas.
