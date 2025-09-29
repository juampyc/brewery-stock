// js/gas_shim.js
// Emula el endpoint de Apps Script: callGAS(action, payload) -> { ok, data?, error? }
(function(){
  'use strict';
  if (window.callGAS) return; // no doble-definir

  async function callGAS(action, payload){
    try{
      switch(String(action||'')){
        case 'getSummaryCounts': {
          const data = await SBData.getSummaryCounts();
          return { ok:true, data };
        }
        case 'prodStatusTotals': {
          const data = await SBData.getProdStatusTotals();
          return { ok:true, data };
        }
        case 'listMovements': {
          const data = await SBData.listMovements(payload||{});
          return { ok:true, data };
        }
        case 'addEmptyCans': {
          const data = await SBData.addEmptyCans(payload||{});
          return { ok:true, data };
        }
        case 'addLabel': {
          const data = await SBData.addLabel(payload||{});
          return { ok:true, data };
        }
        case 'labelsSummary': {
          const data = await SBData.labelsSummary();
          return { ok:true, data };
        }
        case 'listStyles': {
          const data = await SBData.listStyles();
          return { ok:true, data };
        }
        case 'createStyle': {
          const data = await SBData.createStyle(payload||{});
          return { ok:true, data };
        }
        case 'listBrands': {
          const data = await SBData.listBrands();
          return { ok:true, data };
        }
        case 'listProductions': {
          const data = await SBData.listProductions(payload||{});
          return { ok:true, data };
        }
        case 'createProduction': {
          const data = await SBData.createProduction(payload||{});
          return { ok:true, data };
        }
        case 'advanceProduction': {
          const data = await SBData.advanceProduction(payload||{});
          return { ok:true, data };
        }
        case 'scrap': {
          const data = await SBData.scrap(payload||{});
          return { ok:true, data };
        }
        default:
          return { ok:false, error:'UNKNOWN_ACTION:'+String(action||'') };
      }
    }catch(err){
      // Normalizo error
      return { ok:false, error: String(err && (err.code||err.message) || err), details: err };
    }
  }

  window.callGAS = callGAS;
})();