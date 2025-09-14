(function(){
  'use strict';
  const DOC = document.documentElement;
  const LS_KEY = 'castelo_theme';

  function detectPreferred(){
    try{
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }catch(e){ return 'light'; }
  }

  function applyTheme(theme){
    const t = (theme==='dark') ? 'dark' : 'light';
    DOC.setAttribute('data-theme', t);
    DOC.setAttribute('data-bs-theme', t); // Bootstrap 5.3 color mode
    document.body && document.body.classList.toggle('dark', t==='dark');
    try{ localStorage.setItem(LS_KEY, t); }catch(e){}
  }

  function getTheme(){
    try{ return localStorage.getItem(LS_KEY) || detectPreferred(); }catch(e){ return detectPreferred(); }
  }

  function bindSwitches(){
    const sw = document.getElementById('themeSwitch') || document.querySelector('[data-role="theme-switch"]');
    if(!sw) return;
    try{ sw.checked = (getTheme()==='dark'); }catch{}
    sw.addEventListener('change', function(){
      applyTheme(this.checked ? 'dark' : 'light');
    });
  }

  // Observe external changes to attribute (if any other script changes it)
  const obs = new MutationObserver(function(mutations){
    for(const m of mutations){
      if(m.attributeName==='data-theme' || m.attributeName==='data-bs-theme'){
        // keep checkbox in sync
        const sw = document.getElementById('themeSwitch') || document.querySelector('[data-role="theme-switch"]');
        if(sw) sw.checked = (DOC.getAttribute('data-theme')==='dark' || DOC.getAttribute('data-bs-theme')==='dark');
      }
    }
  });

  function boot(){
    applyTheme(getTheme());
    bindSwitches();
    try{ obs.observe(DOC, { attributes:true, attributeFilter:['data-theme','data-bs-theme'] }); }catch(e){}
    // Expose helper
    window.setTheme = applyTheme;
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
