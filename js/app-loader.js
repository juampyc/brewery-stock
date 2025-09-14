(function(){ 
  if (window.__CASTELO_LOADER_DONE__) return; 
  window.__CASTELO_LOADER_DONE__ = true;
  const V = window.APP_VER || "202509142200";
  const d = document;

  function hasEl(selector){ return !!d.querySelector(selector); }

  function addCSSOnce(key, hrefs){ 
    return new Promise((resolve, reject)=>{
      if (d.querySelector('link[data-key="'+key+'"]')) return resolve();
      const tryNext = (i)=>{
        if (i>=hrefs.length) return reject(new Error('CSS not found: '+key));
        const href = hrefs[i];
        const el = d.createElement('link');
        el.rel='stylesheet';
        el.setAttribute('data-key', key);
        el.href = href + (href.includes('?') ? '' : ('?v='+V));
        el.onload = ()=> resolve();
        el.onerror = ()=> { el.remove(); tryNext(i+1); };
        d.head.appendChild(el);
      };
      tryNext(0);
    });
  }

  function addJSOnce(key, srcs){ 
    return new Promise((resolve, reject)=>{
      if (d.querySelector('script[data-key="'+key+'"]')) return resolve();
      const tryNext = (i)=>{
        if (i>=srcs.length) return reject(new Error('JS not found: '+key));
        const src = srcs[i];
        const el = d.createElement('script');
        el.defer = true;
        el.setAttribute('data-key', key);
        el.src = src + (src.includes('://') ? '' : (src.includes('?') ? '' : ('?v='+V)));
        el.onload = ()=> resolve();
        el.onerror = ()=> { el.remove(); tryNext(i+1); };
        d.body.appendChild(el);
      };
      tryNext(0);
    });
  }

  // Load order: CSS -> SweetAlert2 -> theme-checker -> app
  addCSSOnce('styles', ['./styles.css','./css/styles.css'])
  .then(()=> addJSOnce('swal','https://cdn.jsdelivr.net/npm/sweetalert2@11'.split(',')))
  .then(()=> addJSOnce('theme',['./theme-checker.js','./js/theme-checker.js']))
  .then(()=> addJSOnce('app',['./app.js','./js/app.js']))
  .catch(err=> console.error('[loader]', err));
})();