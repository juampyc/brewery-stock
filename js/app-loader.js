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
  // Cargamos CSS y JS desde la raíz porque no hay carpetas css/ ni js/.
  addCSS("./styles.css");
  addJS("./app.js");
})();