// js/app-loader.js  (versión robusta)
(function () {
  // Usa la versión definida en window.APP_VER; si no hay, timestamp
  const V = window.APP_VER || String(Date.now());

  // Archivos LOCALES a versionar (sumá aquí los que quieras)
  const assets = [
    { type: "css", href: "./css/styles.css" },
    { type: "js",  src:  "./js/app.js" }
  ];

  function inject() {
    assets.forEach(a => {
      if (a.type === "css") {
        // CSS SIEMPRE en <head>
        const l = document.createElement("link");
        l.rel  = "stylesheet";
        l.href = `${a.href}?v=${V}`;
        document.head.appendChild(l);
      } else if (a.type === "js") {
        // JS: si hay <body>, ahí; si no, a <head>. Siempre defer.
        const s = document.createElement("script");
        s.src   = `${a.src}?v=${V}`;
        s.defer = true;
        (document.body || document.head).appendChild(s);
      }
    });
  }

  // Si el DOM aún se está cargando, esperamos; si no, inyectamos ya.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();
