(() => {
  const $ = (sel, el=document) => el.querySelector(sel);
  const modal = $("#modal");
  const backdrop = $("#backdrop");
  const addBtn = $("#addEmptyBtn");
  const closeBtn = $("#closeModal");
  const cancelBtn = $("#cancelBtn");
  const form = $("#emptyForm");
  const submitBtn = $("#submitBtn");
  const refreshBtn = $("#refreshBtn");
  const emptyCansCount = $("#emptyCansCount");
  const labelsCount = $("#labelsCount");

  const WEB_APP_URL = window.GAS_WEB_APP_URL; // set in index.html
  const TOAST = (icon, title) => {
    return Swal.fire({
      toast: true, position: 'top-end', icon, title,
      showConfirmButton: false, timer: 2000, timerProgressBar: true
    });
  };

  const openModal = () => {
    modal.setAttribute('aria-hidden', 'false');
    backdrop.setAttribute('aria-hidden', 'false');
    form.reset();
    submitBtn.disabled = false;
  };
  const closeModal = () => {
    modal.setAttribute('aria-hidden', 'true');
    backdrop.setAttribute('aria-hidden', 'true');
  };

  addBtn.addEventListener('click', openModal);
  closeBtn.addEventListener('click', closeModal);
  cancelBtn.addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);

  // Avoid redeclare issues
  async function callGAS(action, payload = {}) {
    if (!WEB_APP_URL || WEB_APP_URL.startsWith("PUT_")) {
      console.warn("Configura window.GAS_WEB_APP_URL en index.html");
      TOAST('warning', 'Configura la URL del Web App en index.html');
      return { ok: false, error: 'MISSING_WEB_APP_URL' };
    }
    const body = new URLSearchParams();
    body.set('action', action);
    body.set('payload', JSON.stringify(payload));
    try {
      const res = await fetch(WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        return { ok:false, error:'INVALID_JSON', raw:text };
      }
    } catch (err) {
      return { ok:false, error:String(err) };
    }
  }

  async function refreshCounts() {
    refreshBtn.disabled = true;
    const r = await callGAS('getSummaryCounts', {});
    if (r && r.ok) {
      emptyCansCount.textContent = r.data.emptyCansTotal ?? 0;
      labelsCount.textContent = r.data.labelsTotal ?? 0;
      TOAST('success', 'Datos actualizados');
    } else {
      TOAST('error', 'No se pudo actualizar');
    }
    refreshBtn.disabled = false;
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;

    const fd = new FormData(form);
    const qty = Number(fd.get('qty'));
    const provider = (fd.get('provider')||'').trim();
    const lot = (fd.get('lot')||'').trim();
    if (!qty || qty <= 0 || !provider || !lot) {
      submitBtn.disabled = false;
      return TOAST('warning', 'Completá todos los campos');
    }

    const resp = await callGAS('addEmptyCans', { qty, provider, lot });
    if (resp && resp.ok) {
      TOAST('success', 'Ingreso registrado');
      closeModal();
      await refreshCounts();
    } else {
      TOAST('error', 'No se pudo guardar');
      submitBtn.disabled = false;
    }
  });

  // Initial load
  document.addEventListener('DOMContentLoaded', refreshCounts);
  refreshBtn.addEventListener('click', refreshCounts);
})();