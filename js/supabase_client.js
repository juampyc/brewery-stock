// js/supabase_client.js
(function () {
  'use strict';
  var url  = window.SUPABASE_URL || (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.url);
  var key  = window.SUPABASE_ANON_KEY || (window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.anonKey);

  if (!url || !key) {
    console.error('[SB] SUPABASE_CONFIG incompleto');
    return;
  }
  if (!window.supabase) {
    console.error('[SB] Falta librería supabase-js (CDN)');
    return;
  }
  if (!window.SB) {
    window.SB = window.supabase.createClient(url, key);
    console.log('[SB] cliente inicializado', url);
  }
})();
