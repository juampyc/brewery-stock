// js/app-loader.js
(function () {
  // Usa la versión definida en window.APP_VER
  const V = window.APP_VER || String(Date.now());

  // Archivos locales que querés versionar
  const assets = [
    { type: "css", href: "./css/styles.css" },
    { type: "js",  src:  "./js/app.js" }
  ];

  assets.forEach(a => {
    if (a.type === "css") {
      const l = document.createElement("link");
      l.rel  = "stylesheet";
      l.href = `${a.href}?v=${V}`;
      document.head.appendChild(l);
    } else if (a.type === "js") {
      const s = document.createElement("script");
      s.src   = `${a.src}?v=${V}`;
      s.defer = true;
      document.body.appendChild(s);
    }
  });
})();
