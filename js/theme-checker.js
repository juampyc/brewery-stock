(()=>{
  const doc=document.documentElement;
  function apply(){ const t=doc.getAttribute('data-theme')||'light'; document.body.classList.remove('theme-light','theme-dark'); document.body.classList.add(`theme-${t}`); }
  const obs=new MutationObserver(apply);
  document.addEventListener('DOMContentLoaded',()=>{ apply(); obs.observe(doc,{attributes:true,attributeFilter:['data-theme']}); });
})();