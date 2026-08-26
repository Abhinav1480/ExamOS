/* ═══════════════════════════════════════════════════════════════════
   EXAM OS — UX Layer v1
   • Promise-based confirm / prompt / choose dialogs (replace window.confirm/prompt)
   • Global keyboard shortcuts + shortcuts help overlay (?)
   • Keyboard accessibility for nav links
   Load this file BEFORE app.js. Exposes: uiConfirm, uiPrompt, uiChoose
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  let activeDialog = null;
  let lastFocused = null;

  /* ---------- core dialog builder ---------- */
  function buildDialog({ title, message, bodyHTML = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false, icon = '' }) {
    return new Promise(resolve => {
      lastFocused = document.activeElement;

      const overlay = document.createElement('div');
      overlay.className = 'ux-dialog-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.innerHTML = `
        <div class="ux-dialog-card" role="document">
          <div class="ux-dialog-icon ${danger ? 'danger' : ''}">${icon || (danger ? '⚠️' : '❓')}</div>
          <h3 class="ux-dialog-title">${title}</h3>
          ${message ? `<p class="ux-dialog-message">${message}</p>` : ''}
          ${bodyHTML}
          <div class="ux-dialog-actions">
            <button type="button" class="btn-ghost" data-act="cancel">${cancelText}</button>
            <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${confirmText}</button>
          </div>
        </div>`;

      const card = overlay.querySelector('.ux-dialog-card');
      const okBtn = overlay.querySelector('[data-act="ok"]');
      const cancelBtn = overlay.querySelector('[data-act="cancel"]');

      function close(result) {
        if (!activeDialog) return;
        activeDialog = null;
        document.removeEventListener('keydown', onKey, true);
        card.classList.add('closing');
        overlay.classList.add('closing');
        setTimeout(() => {
          overlay.remove();
          if (lastFocused && lastFocused.focus) lastFocused.focus();
        }, 160);
        resolve(result);
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(false); }
        else if (e.key === 'Tab') {
          // simple focus trap
          const focusables = [cancelBtn, okBtn];
          const idx = focusables.indexOf(document.activeElement);
          e.preventDefault();
          const next = e.shiftKey
            ? focusables[(idx - 1 + focusables.length) % focusables.length]
            : focusables[(idx + 1) % focusables.length];
          next.focus();
        } else if (e.key === 'Enter' && document.activeElement !== okBtn && !overlay.querySelector('input, select')) {
          // Enter confirms when no text input present
          e.preventDefault(); close(true);
        }
      }

      overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(false); });
      cancelBtn.addEventListener('click', () => close(false));
      okBtn.addEventListener('click', () => {
        const input = overlay.querySelector('input, select');
        close(input ? input.value : true);
      });

      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(overlay);
      activeDialog = { overlay, close };

      requestAnimationFrame(() => {
        overlay.classList.add('open');
        (overlay.querySelector('input, select') || (danger ? cancelBtn : okBtn)).focus();
        const inp = overlay.querySelector('input'); if (inp) inp.select();
      });
    });
  }

  /* ---------- public API ---------- */
  /** uiConfirm({title, message, confirmText, danger}) -> Promise<boolean> */
  window.uiConfirm = function ({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false, icon = '' } = {}) {
    return buildDialog({ title, message, confirmText, cancelText, danger, icon }).then(v => v === true);
  };

  /** uiPrompt({title, label, value, placeholder, confirmText}) -> Promise<string|null> */
  window.uiPrompt = function ({ title = 'Input', label = '', value = '', placeholder = '', confirmText = 'Save', danger = false } = {}) {
    return buildDialog({
      title,
      message: '',
      bodyHTML: `<label class="ux-dialog-label">${label}</label>
                 <input type="text" class="form-input ux-dialog-input" value="${String(value).replace(/"/g, '&quot;')}" placeholder="${placeholder}" />`,
      confirmText, cancelText, danger
    }).then(v => (typeof v === 'string' && v.trim()) ? v.trim() : null);
  };

  /** uiChoose({title, message, options:[{value,label}], placeholder}) -> Promise<value|null> */
  window.uiChoose = function ({ title = 'Choose', message = '', options = [], confirmText = 'Select' } = {}) {
    const optsHTML = options.map(o => `<option value="${String(o.value).replace(/"/g, '&quot;')}">${o.label}</option>`).join('');
    return buildDialog({
      title,
      message,
      bodyHTML: `<select class="select-field ux-dialog-input" style="width:100%">${optsHTML}</select>`,
      confirmText
    }).then(v => (typeof v === 'string' && v !== '') ? v : null);
  };

  /* ═══════════ KEYBOARD SHORTCUTS ═══════════ */
  function isTyping(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable || !!el.closest('.note-editor-content');
  }

  const VIEW_ORDER = ['dashboard', 'library', 'workspace', 'notes', 'focus', 'schedule', 'learning', 'shared', 'settings'];

  function switchToView(view) {
    const link = document.querySelector(`.nav-link[data-view="${view}"]`);
    if (link) link.click();
  }

  function showShortcutsHelp() {
    if (document.getElementById('ux-help-overlay')) return;
    const rows = [
      ['/', 'Focus search'], ['Ctrl + K', 'Focus search'],
      ['1 – 9', 'Switch section'], ['Esc', 'Close dialog / viewer'],
    ];
    const ov = document.createElement('div');
    ov.id = 'ux-help-overlay';
    ov.className = 'ux-dialog-overlay';
    ov.innerHTML = `
      <div class="ux-dialog-card" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div class="ux-dialog-icon">⌨️</div>
        <h3 class="ux-dialog-title">Keyboard Shortcuts</h3>
        <div class="ux-kbd-grid">
          ${rows.map(([k, d]) => `<span class="ux-kbd">${k}</span><span>${d}</span>`).join('')}
        </div>
        <div class="ux-dialog-actions"><button type="button" class="btn-primary">Got it</button></div>
      </div>`;
    const close = () => { ov.classList.add('closing'); setTimeout(() => ov.remove(), 160); };
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('button')) close(); });
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('open'));
    ov.querySelector('button').focus();
  }

  document.addEventListener('keydown', e => {
    if (activeDialog) return;                       // dialogs handle their own keys
    const typing = isTyping(e.target);

    // "/" focuses search (when not typing)
    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const s = document.getElementById('global-search') || document.getElementById('lib-search');
      if (s && s.offsetParent !== null) { e.preventDefault(); s.focus(); s.select(); }
      return;
    }
    // "?" opens shortcut help
    if ((e.key === '?' ) && !typing) { e.preventDefault(); showShortcutsHelp(); return; }
    // digits 1–9 switch views (when not typing)
    if (/^[1-9]$/.test(e.key) && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const view = VIEW_ORDER[e.key - 1];
      if (view) switchToView(view);
    }
  });

  /* Make sidebar <a class="nav-link"> reachable & activatable by keyboard */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-link').forEach(a => {
      if (!a.hasAttribute('tabindex')) a.setAttribute('tabindex', '0');
      a.setAttribute('role', 'link');
    });
    document.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('nav-link')) {
        e.preventDefault(); e.target.click();
      }
    });
  });
})();
