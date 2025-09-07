// js/app-loader.js
(function () {
  const V = window.APP_VER || String(Date.now());
  const addCSS = (href) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = `${href}?v=${V}`;
    document.head.appendChild(l);
  };
  const addJS = (src) => {
    const s = document.createElement("script");
    s.src = `${src}?v=${V}`;
    s.defer = true;
    document.body.appendChild(s);
  };

  addCSS("./css/styles.css");
  addJS("./js/theme-checker.js"); // cache-busting para el theme-checker
  addJS("./js/app.js");           // tu app
})();
