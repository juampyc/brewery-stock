// js/config.js
// ====== Configuración global Brewery Stock ======
(function () {
  const C = {
    GAS_WEB_APP_URL: "https://script.google.com/macros/s/AKfycbzxhd8eQ54BrLoi0PVqGmfRP1G3vHQm2ORfNeedQ37guLJYbJGLkzdX3tK3pDgtD_F8/exec",
    SPREADSHEET_ID: "1eML8y0shrdheQ3bISwV3bnimsAVDruR1x1JFUKNWcog",
    APP_NAME: "Brewery Stock",
    VERSION: "1.0.2",
    TIMEZONE: "America/Argentina/Buenos_Aires"
  };

  // API pública
  window.APP_CONFIG = C;
  window.getAppConfig = function (key) { return C[key]; };

  // 🔁 Compatibilidad con código existente:
  // Mantiene la variable que tus páginas ya usan hoy.
  window.GAS_WEB_APP_URL = C.GAS_WEB_APP_URL;

  // (Opcional) Log para chequear que cargó
  console.log(`${C.APP_NAME} v${C.VERSION} — config cargada`);
})();
