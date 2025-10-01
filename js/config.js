// js/config.js
// ====== Configuración global Brewery Stock ======
(function () {
  const C = {
    APP_NAME: "Brewery Stock",
    VERSION: "1.0.3",
    TIMEZONE: "America/Argentina/Buenos_Aires",
  };
  window.APP_CONFIG = C;
  window.getAppConfig = function (key) { return C[key]; };
  console.log(`${C.APP_NAME} v${C.VERSION} — config cargada`);
})();