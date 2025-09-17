(function () {
  'use strict';

  // Helpers
  function $(sel, el) { if (!el) el = document; return el.querySelector(sel); }
  function createEl(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  }
  function TOAST(icon, title) {
    return Swal.fire({
      toast: true,
      position: 'top-end',
      icon: icon,
      title: title,
      showConfirmButton: false,
      timer: 2000,
      timerProgressBar: true
    });
  }
  function yyyymm(d) {
    var y = d.getFullYear();
    var m = (d.getMonth()+1); if (m < 10) m = '0' + m;
    return '' + y + m;
  }
  function sanitizeToken(s) {
    return String(s || '').trim().replace(/\s+/g, '').replace(/[^A-Za-z0-9_-]/g, '').toUpperCase();
  }

  // Elements (comunes)
  var modal = $('#modal');
  var backdrop = $('#backdrop');
  var addBtn = $('#addEmptyBtn');
  var closeBtn = $('#closeModal');
  var cancelBtn = $('#cancelBtn');
  var form = $('#emptyForm');
  var submitBtn = $('#submitBtn');
  var refreshBtn = $('#refreshBtn');
  var emptyCansCount = $('#emptyCansCount');
  var labelsCount = $('#labelsCount');

  // Labels modal
  var labelsModal = $('#labelsModal');
  var addLabelBtn = $('#addLabelBtn');
  var closeLabelsModal = $('#closeLabelsModal');
  var labelsForm = $('#labelsForm');
  var cancelLabelsBtn = $('#cancelLabelsBtn');
  var submitLabelsBtn = $('#submitLabelsBtn');
  var isCustomChk = $('#isCustomChk');
  var styleCombo = $('#styleCombo');
  var nonCustomFields = $('#nonCustomFields');
  var customFields = $('#customFields');

  // Inputs inside labels form
  var lotInput = labelsForm ? labelsForm.querySelector('input[name="lot"]') : null;
  var nameInput = labelsForm ? labelsForm.querySelector('input[name="name"]') : null;

  // Preview node under the dropdown (created dynamically)
  var stylePreview = null;

  // GAS web app URL
  var WEB_APP_URL = (window.GAS_WEB_APP_URL || '');

  // In-memory index of styles keyed by option value
  // value: "brandId|styleId" OR "brandId"
  // item: { brandId, styleId, name }
  var STYLE_INDEX = {};

  // GAS call
  async function callGAS(action, payload) {
    if (!payload) payload = {};
    if (!WEB_APP_URL || WEB_APP_URL.indexOf('PUT_') === 0) {
      console.warn('Configura window.GAS_WEB_APP_URL en index.html');
      TOAST('warning', 'Configura la URL del Web App en index.html');
      return { ok: false, error: 'MISSING_WEB_APP_URL' };
    }
    var body = new URLSearchParams();
    body.set('action', action);
    body.set('payload', JSON.stringify(payload));
    try {
      var res = await fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
      });
      var text = await res.text();
      if (!res.ok) return { ok: false, error: 'HTTP_' + res.status, raw: text };
      try {
        return JSON.parse(text);
      } catch (e) {
        console.error('Invalid JSON from GAS:', text);
        return { ok: false, error: 'INVALID_JSON', raw: text };
      }
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // Modal latas vacías
  function openModal() {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.setAttribute('aria-hidden', 'false');
    if (form) form.reset();
    if (submitBtn) submitBtn.disabled = false;
  }
  function closeModalFn() {
    if (!modal) return;
    modal.setAttribute('aria-hidden', 'true');
    if (backdrop) backdrop.setAttribute('aria-hidden', 'true');
  }

  // Modal etiquetas
  function openLabelsModal() {
    if (!labelsModal) return;
    labelsModal.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.setAttribute('aria-hidden', 'false');
    if (labelsForm) labelsForm.reset();
    if (submitLabelsBtn) submitLabelsBtn.disabled = false;
    loadStylesIntoCombo();
  }
  function closeLabels() {
    if (!labelsModal) return;
    labelsModal.setAttribute('aria-hidden', 'true');
    if (backdrop) backdrop.setAttribute('aria-hidden', 'true');
  }

  // Eventos (con guards)
  if (addBtn) addBtn.addEventListener('click', openModal);
  if (closeBtn) closeBtn.addEventListener('click', closeModalFn);
  if (cancelBtn) cancelBtn.addEventListener('click', closeModalFn);
  if (backdrop) {
    backdrop.addEventListener('click', function () {
      if (modal) modal.setAttribute('aria-hidden', 'true');
      if (labelsModal) labelsModal.setAttribute('aria-hidden', 'true');
      backdrop.setAttribute('aria-hidden', 'true');
    });
  }
  if (addLabelBtn) addLabelBtn.addEventListener('click', openLabelsModal);
  if (closeLabelsModal) closeLabelsModal.addEventListener('click', closeLabels);
  if (cancelLabelsBtn) cancelLabelsBtn.addEventListener('click', closeLabels);

  if (isCustomChk) {
    isCustomChk.addEventListener('change', function () {
      var custom = isCustomChk.checked;
      if (custom) {
        if (customFields) customFields.style.display = 'grid';
        if (nonCustomFields) nonCustomFields.style.display = 'none';
        if (styleCombo) styleCombo.removeAttribute('required');
      } else {
        if (customFields) customFields.style.display = 'none';
        if (nonCustomFields) nonCustomFields.style.display = 'grid';
        if (styleCombo) styleCombo.setAttribute('required', 'required');
      }
      updateStylePreviewAndLot();
    });
  }

  // Refrescar cards
  async function refreshCounts() {
    if (refreshBtn) refreshBtn.disabled = true;
    var r = await callGAS('getSummaryCounts', {});
    if (r && r.ok) {
      if (emptyCansCount) emptyCansCount.textContent = (r.data.emptyCansTotal != null ? r.data.emptyCansTotal : 0);
      if (labelsCount) labelsCount.textContent = (r.data.labelsTotal != null ? r.data.labelsTotal : 0);
      TOAST('success', 'Datos actualizados');
    } else {
      TOAST('error', 'No se pudo actualizar');
    }
    if (refreshBtn) refreshBtn.disabled = false;
  }

  // Submit latas vacías
  if (form) {
    form.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (!submitBtn || submitBtn.disabled) return;
      submitBtn.disabled = true;

      var fd = new FormData(form);
      var qty = Number(fd.get('qty'));
      var provider = String(fd.get('provider') || '').trim();
      var lot = String(fd.get('lot') || '').trim();

      if (!qty || qty <= 0 || !provider || !lot) {
        submitBtn.disabled = false;
        TOAST('warning', 'Completá todos los campos');
        return;
      }

      var resp = await callGAS('addEmptyCans', { qty: qty, provider: provider, lot: lot });
      if (resp && resp.ok) {
        TOAST('success', 'Ingreso registrado');
        closeModalFn();
        await refreshCounts();
      } else {
        console.error('Guardar latas vacías error', resp);
        TOAST('error', 'No se pudo guardar' + (resp && resp.error ? (': ' + resp.error) : ''));
        submitBtn.disabled = false;
      }
    });
  }

  // Cargar estilos en combo (brandId + styleId opcional + name)
  async function loadStylesIntoCombo() {
    if (!styleCombo) return;
    styleCombo.innerHTML = '<option value=\"\">Cargando...</option>';
    var r = await callGAS('listStyles', {});
    if (!r || !r.ok) {
      styleCombo.innerHTML = '<option value=\"\">No se pudo cargar</option>';
      return;
    }
    var items = Array.isArray(r.data) ? r.data : [];
    if (!items.length) {
      styleCombo.innerHTML = '<option value=\"\">Sin datos en styles</option>';
      return;
    }
    STYLE_INDEX = {};
    var opts = [];
    opts.push('<option value=\"\">Seleccionar marca/estilo</option>');
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var brandId = (it && it.brandId != null) ? String(it.brandId) : '';
      var styleId = (it && it.styleId != null) ? String(it.styleId) : '';
      var name = (it && it.name != null) ? String(it.name) : '';

      // value: si hay styleId -> "brandId|styleId", sino solo "brandId"
      var val = styleId ? (brandId + '|' + styleId) : brandId;

      STYLE_INDEX[val] = { brandId: brandId, styleId: styleId, name: name };

      var labelParts = [];
      if (brandId) labelParts.push(brandId);
      if (styleId) labelParts.push(styleId);
      if (name) labelParts.push(name);
      var label = labelParts.join(' \u00B7 ');

      opts.push('<option value=\"' + val + '\">' + label + '</option>');
    }
    styleCombo.innerHTML = opts.join('');

    // preview node
    ensurePreviewNode();
    updateStylePreviewAndLot();
    styleCombo.addEventListener('change', updateStylePreviewAndLot);
    if (nameInput) nameInput.addEventListener('input', updateStylePreviewAndLot);
  }

  function ensurePreviewNode() {
    if (!nonCustomFields) return;
    if (!stylePreview) {
      stylePreview = createEl('div', 'muted small', '');
      stylePreview.style.marginTop = '6px';
      nonCustomFields.appendChild(stylePreview);
    }
  }

  function currentSuggestion(isCustom, it) {
    var brand = it && it.brandId ? sanitizeToken(it.brandId) : 'GEN';
    var suffix = 'GEN';
    if (isCustom && nameInput && nameInput.value) {
      suffix = sanitizeToken(nameInput.value);
    } else if (it) {
      suffix = it.styleId ? sanitizeToken(it.styleId) : sanitizeToken(it.name || 'GEN');
    }
    return 'L-ETI-' + brand + '-' + suffix + '-' + yyyymm(new Date());
  }

  function updateStylePreviewAndLot() {
    var isCustom = !!(isCustomChk && isCustomChk.checked);
    if (isCustom) {
      if (stylePreview) {
        var customText = 'Personalizada';
        if (nameInput && nameInput.value) customText += ': ' + nameInput.value;
        stylePreview.textContent = customText;
      }
      // placeholder suggestion for custom
      if (lotInput) lotInput.placeholder = currentSuggestion(true, null);
      return;
    }
    if (!styleCombo) return;
    var val = styleCombo.value || '';
    var item = STYLE_INDEX[val];
    if (!item) {
      if (stylePreview) stylePreview.textContent = '';
      if (lotInput) lotInput.placeholder = 'Ej: L-ETI-CASTELO-IPA-202509';
      return;
    }
    var parts = [];
    if (item.brandId) parts.push(item.brandId);
    if (item.styleId) parts.push(item.styleId);
    if (item.name) parts.push(item.name);
    if (stylePreview) stylePreview.textContent = 'Seleccionado: ' + parts.join(' \u00B7 ');

    // Placeholder always updated; actual value only if empty
    if (lotInput) {
      var suggestion = currentSuggestion(false, item);
      lotInput.placeholder = suggestion;
      if (!lotInput.value) lotInput.value = suggestion;
    }
  }

  // Submit etiquetas
  if (labelsForm) {
    labelsForm.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      if (!submitLabelsBtn || submitLabelsBtn.disabled) return;
      submitLabelsBtn.disabled = true;

      var fd = new FormData(labelsForm);
      var qty = Number(fd.get('qty'));
      var provider = String(fd.get('provider') || '').trim();
      var lot = String(fd.get('lot') || '').trim();
      var isCustom = !!fd.get('isCustom');

      if (!qty || qty <= 0 || !provider || !lot) {
        submitLabelsBtn.disabled = false;
        TOAST('warning', 'Completá cantidad, proveedor y lote');
        return;
      }

      var brandId = '';
      var styleId = '';
      var name = '';

      if (isCustom) {
        name = String(fd.get('name') || '').trim();
        if (!name) {
          submitLabelsBtn.disabled = false;
          TOAST('warning', 'Ingresá el nombre de la etiqueta personalizada');
          return;
        }
      } else {
        var comboVal = String(fd.get('styleCombo') || '');
        if (!comboVal) {
          submitLabelsBtn.disabled = false;
          TOAST('warning', 'Seleccioná marca/estilo');
          return;
        }
        if (comboVal.indexOf('|') !== -1) {
          var parts = comboVal.split('|');
          brandId = parts[0] || '';
          styleId = parts[1] || '';
        } else {
          brandId = comboVal;
          styleId = '';
        }
        // If no explicit name, use styles.name for more context
        var it = STYLE_INDEX[comboVal];
        if (it && it.name) name = it.name;
      }

      var payload = {
        qty: qty,
        provider: provider,
        lot: lot,
        isCustom: isCustom,
        brandId: brandId,
        styleId: styleId,
        name: name
      };
      var resp = await callGAS('addLabel', payload);
      if (resp && resp.ok) {
        TOAST('success', 'Etiquetas registradas');
        closeLabels();
        await refreshCounts();
      } else {
        console.error('Guardar etiquetas error', resp);
        TOAST('error', 'No se pudo guardar' + (resp && resp.error ? (': ' + resp.error) : ''));
        submitLabelsBtn.disabled = false;
      }
    });
  }

  // Carga inicial
  document.addEventListener('DOMContentLoaded', function () {
    refreshCounts();
    if (labelsModal) loadStylesIntoCombo();
  });
  if (refreshBtn) refreshBtn.addEventListener('click', refreshCounts);
})();