/* ═══════════════════════════════════════════════════════
   workspace.js — Multi-File Workspace
   Tab system, split-screen, persistence, mobile swipe.
   ═══════════════════════════════════════════════════════ */

const Workspace = (() => {
  const MAX_TABS = 12;
  const EVICT_THRESHOLD = 8;
  const LS_KEY = 'workspace_tabs';
  const LS_SPLIT_KEY = 'workspace_split';

  /* ── State ──────────────────────────────────────────── */
  let tabs = []; // { id, fileId, pinned, scrollPos, viewerState }
  let activeTabId = null;
  let splitMode = false;
  let splitActiveTabId = null; // active tab in right pane
  let splitRatio = 0.5;
  let cleanupFns = {}; // tabId -> cleanup function from Viewer.renderInto
  let isDraggingSplit = false;
  let touchStartX = 0;
  let isMobile = false;

  const el = id => document.getElementById(id);

  /* ── Persistence ────────────────────────────────────── */
  let saveStateTimeout = null;
  function debouncedSaveState() {
    clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(saveState, 500);
  }

  function saveState() {
    const state = tabs.map(t => ({
      id: t.id, fileId: t.fileId, pinned: t.pinned,
      scrollPos: t.scrollPos || 0,
      viewerState: t.viewerState || null
    }));
    LS.set(LS_KEY, { tabs: state, activeTabId, splitMode, splitActiveTabId, splitRatio });
  }

  function getScrollableElement(paneEl) {
    if (!paneEl) return null;
    const textViewer = paneEl.querySelector('.text-viewer');
    if (textViewer) return textViewer;
    const imgViewer = paneEl.querySelector('.image-viewer');
    if (imgViewer) return imgViewer;
    return paneEl;
  }

  function loadState() {
    const saved = LS.get(LS_KEY, null);
    if (!saved || !saved.tabs || !saved.tabs.length) return false;

    // Validate that the files still exist
    const validTabs = saved.tabs.filter(t => FileMeta.getById(t.fileId));
    if (!validTabs.length) return false;

    tabs = validTabs.map(t => ({
      id: t.id,
      fileId: t.fileId,
      pinned: t.pinned || false,
      scrollPos: t.scrollPos || 0,
      viewerState: t.viewerState || null
    }));

    activeTabId = saved.activeTabId && tabs.find(t => t.id === saved.activeTabId) ? saved.activeTabId : tabs[0].id;
    splitMode = saved.splitMode || false;
    splitActiveTabId = saved.splitActiveTabId && tabs.find(t => t.id === saved.splitActiveTabId) ? saved.splitActiveTabId : null;
    splitRatio = saved.splitRatio || 0.5;

    return true;
  }

  /* ── Generate unique tab ID ─────────────────────────── */
  function genId() { return 'wt_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  /* ── Open a file in workspace ───────────────────────── */
  function openFile(fileId, opts = {}) {
    const meta = FileMeta.getById(fileId);
    if (!meta) { showToast('File not found', 'error'); return; }

    // Check if already open
    const existing = tabs.find(t => t.fileId === fileId);
    if (existing) {
      if (opts.splitRight && splitMode) {
        splitActiveTabId = existing.id;
      } else {
        activeTabId = existing.id;
      }
      saveState();
      render();
      return;
    }

    // Enforce max tabs
    if (tabs.length >= MAX_TABS) {
      showToast(`Maximum ${MAX_TABS} tabs reached. Close a tab first.`, 'warning');
      return;
    }

    const tab = { id: genId(), fileId, pinned: false, scrollPos: 0, viewerState: null };
    tabs.push(tab);

    if (opts.splitRight && splitMode) {
      splitActiveTabId = tab.id;
    } else {
      activeTabId = tab.id;
    }

    // Navigate to workspace view if not already there
    if (typeof App !== 'undefined' && App.getCurrentView() !== 'workspace') {
      App.navigate('workspace');
    }

    saveState();
    render();
    showToast(`Opened "${meta.name}"`, 'success');
  }

  /* ── Close tab ──────────────────────────────────────── */
  function closeTab(tabId) {
    const idx = tabs.findIndex(t => t.id === tabId);
    if (idx === -1) return;

    // Cleanup rendered content
    if (cleanupFns[tabId]) { cleanupFns[tabId](); delete cleanupFns[tabId]; }

    tabs.splice(idx, 1);

    // If we closed the active tab, select nearest
    if (activeTabId === tabId) {
      if (tabs.length > 0) {
        activeTabId = tabs[Math.min(idx, tabs.length - 1)].id;
      } else {
        activeTabId = null;
      }
    }

    // If we closed the split active tab
    if (splitActiveTabId === tabId) {
      splitActiveTabId = tabs.length > 0 ? tabs[0].id : null;
      if (splitActiveTabId === activeTabId && tabs.length > 1) {
        splitActiveTabId = tabs.find(t => t.id !== activeTabId)?.id || null;
      }
    }

    // Turn off split mode if not enough tabs
    if (tabs.length < 2) { splitMode = false; splitActiveTabId = null; }

    saveState();
    render();
  }

  /* ── Close all tabs ─────────────────────────────────── */
  function closeAll() {
    Object.values(cleanupFns).forEach(fn => fn());
    cleanupFns = {};
    tabs = [];
    activeTabId = null;
    splitMode = false;
    splitActiveTabId = null;
    saveState();
    render();
  }

  /* ── Pin / Unpin ────────────────────────────────────── */
  function togglePin(tabId) {
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;
    tab.pinned = !tab.pinned;

    // Sort: pinned first
    tabs.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    saveState();
    renderTabBar();
  }

  /* ── Toggle split mode ──────────────────────────────── */
  function toggleSplit() {
    if (isMobile) { showToast('Split view is not available on mobile', 'info'); return; }
    if (tabs.length < 2) { showToast('Open at least 2 files to use split view', 'info'); return; }

    splitMode = !splitMode;

    if (splitMode) {
      // Assign the second tab to the right pane if needed
      if (!splitActiveTabId || splitActiveTabId === activeTabId) {
        splitActiveTabId = tabs.find(t => t.id !== activeTabId)?.id || null;
      }
    } else {
      splitActiveTabId = null;
    }

    saveState();
    render();
  }

  /* ── Evict background tabs ──────────────────────────── */
  function evictIfNeeded() {
    if (tabs.length <= EVICT_THRESHOLD) return;
    const activeTabs = new Set([activeTabId, splitActiveTabId]);
    const bg = tabs.filter(t => !activeTabs.has(t.id) && !t.pinned);
    // Evict oldest background tab
    if (bg.length > 0) {
      const oldest = bg[0];
      if (cleanupFns[oldest.id]) {
        cleanupFns[oldest.id]();
        delete cleanupFns[oldest.id];
      }
    }
  }

  /* ══════════════════════════════════════════════════════
     RENDERING
     ══════════════════════════════════════════════════════ */

  function render() {
    checkMobile();
    renderTabBar();
    renderContent();
    renderEmptyState();
  }

  /* ── Capture viewer state from DOM before switching ── */
  function captureViewerState(tabId, paneEl) {
    if (!tabId || !paneEl) return;
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const state = tab.viewerState || {};

    // Capture scroll position from the correct scrollable element
    const scrollEl = getScrollableElement(paneEl);
    if (scrollEl) {
      tab.scrollPos = scrollEl.scrollTop;
    }
    // Also capture container scroll (for PDF which scrolls the pane itself)
    if (paneEl.scrollTop > 0) {
      tab.scrollPos = paneEl.scrollTop;
    }

    // Capture PDF state
    const pdfZoomLabel = paneEl.querySelector('.ws-pdf-zoom-label');
    if (pdfZoomLabel) {
      state.zoomLevel = parseFloat(pdfZoomLabel.textContent) / 100;
    }
    const pdfPageInput = paneEl.querySelector('.ws-pdf-page-input');
    if (pdfPageInput) {
      state.currentPage = parseInt(pdfPageInput.value) || 1;
    }

    // Capture Image zoom state
    const imgZoomLabel = paneEl.querySelector('.ws-img-zoom-label');
    if (imgZoomLabel) {
      state.imgScale = parseFloat(imgZoomLabel.textContent) / 100;
    }

    // Capture TXT/DOCX zoom state
    const docZoomLabel = paneEl.querySelector('.ws-doc-zoom-label');
    if (docZoomLabel) {
      state.docScale = parseFloat(docZoomLabel.textContent) / 100;
    }

    // Capture PPTX state
    const pptZoomLabel = paneEl.querySelector('.ws-ppt-zoom-label');
    if (pptZoomLabel) {
      state.zoomLevel = parseFloat(pptZoomLabel.textContent) / 100;
    }
    const pptCurrent = paneEl.querySelector('.ws-ppt-current');
    if (pptCurrent) {
      state.currentPage = parseInt(pptCurrent.textContent) - 1; // 0-indexed for slides
    }

    // Capture fullscreen state
    state.fullscreen = !!document.fullscreenElement;

    tab.viewerState = state;
  }

  /* ── Capture all currently visible panes ──────────── */
  function captureAllVisibleStates() {
    // Capture left/full pane
    const fullPane = el('ws-pane-full');
    const leftPane = el('ws-pane-left');
    const rightPane = el('ws-pane-right');

    if (fullPane && activeTabId) {
      captureViewerState(activeTabId, fullPane);
    }
    if (leftPane && activeTabId) {
      captureViewerState(activeTabId, leftPane);
    }
    if (rightPane && splitActiveTabId) {
      captureViewerState(splitActiveTabId, rightPane);
    }
  }

  function checkMobile() {
    isMobile = window.innerWidth < 768;
    if (isMobile && splitMode) { splitMode = false; splitActiveTabId = null; saveState(); }
  }

  /* ── Tab bar ────────────────────────────────────────── */
  function renderTabBar() {
    const bar = el('ws-tab-bar');
    if (!bar) return;

    const strip = bar.querySelector('.ws-tab-strip');
    if (!strip) return;

    strip.innerHTML = tabs.map(tab => {
      const meta = FileMeta.getById(tab.fileId);
      const name = meta ? meta.name : 'Unknown';
      const icon = meta ? getFileIcon(meta.type) : '📁';
      const isActive = tab.id === activeTabId;
      const isSplitActive = splitMode && tab.id === splitActiveTabId;
      const cls = [
        'ws-tab',
        isActive ? 'active' : '',
        isSplitActive ? 'split-active' : '',
        tab.pinned ? 'pinned' : ''
      ].filter(Boolean).join(' ');

      return `
        <div class="${cls}" data-tab-id="${tab.id}" draggable="true">
          <span class="ws-tab-icon">${icon}</span>
          <span class="ws-tab-name" title="${escapeHtml(name)}">${escapeHtml(name.length > 22 ? name.slice(0, 20) + '…' : name)}</span>
          ${tab.pinned ? '<span class="ws-tab-pin-badge">📌</span>' : ''}
          <button class="ws-tab-close" data-close-id="${tab.id}" title="Close tab">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>`;
    }).join('');

    // Update split toggle
    const splitBtn = bar.querySelector('.ws-split-btn');
    if (splitBtn) splitBtn.classList.toggle('active', splitMode);

    // Bind events
    strip.querySelectorAll('.ws-tab').forEach(tabEl => {
      const tabId = tabEl.dataset.tabId;

      tabEl.addEventListener('click', e => {
        if (e.target.closest('.ws-tab-close')) return;
        // Capture current state before switching
        captureAllVisibleStates();
        if (splitMode && e.shiftKey) {
          // Shift+click to assign to right pane
          splitActiveTabId = tabId;
        } else {
          activeTabId = tabId;
        }
        saveState();
        render();
      });

      // Right-click context menu (pin/close)
      tabEl.addEventListener('contextmenu', e => {
        e.preventDefault();
        showTabContextMenu(tabId, e.clientX, e.clientY);
      });

      // Drag to reorder
      tabEl.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', tabId);
        tabEl.classList.add('dragging');
      });
      tabEl.addEventListener('dragend', () => tabEl.classList.remove('dragging'));
      tabEl.addEventListener('dragover', e => { e.preventDefault(); tabEl.classList.add('drag-over'); });
      tabEl.addEventListener('dragleave', () => tabEl.classList.remove('drag-over'));
      tabEl.addEventListener('drop', e => {
        e.preventDefault();
        tabEl.classList.remove('drag-over');
        const draggedId = e.dataTransfer.getData('text/plain');
        reorderTab(draggedId, tabId);
      });
    });

    // Close buttons
    strip.querySelectorAll('.ws-tab-close').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        closeTab(btn.dataset.closeId);
      });
    });
  }

  function reorderTab(draggedId, targetId) {
    const dragIdx = tabs.findIndex(t => t.id === draggedId);
    const targetIdx = tabs.findIndex(t => t.id === targetId);
    if (dragIdx === -1 || targetIdx === -1 || dragIdx === targetIdx) return;
    const [dragged] = tabs.splice(dragIdx, 1);
    tabs.splice(targetIdx, 0, dragged);
    saveState();
    renderTabBar();
  }

  /* ── Context menu ───────────────────────────────────── */
  function showTabContextMenu(tabId, x, y) {
    removeContextMenu();
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const menu = document.createElement('div');
    menu.className = 'ws-context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.innerHTML = `
      <button class="ws-ctx-item" data-action="pin">${tab.pinned ? '📌 Unpin tab' : '📌 Pin tab'}</button>
      ${splitMode ? `<button class="ws-ctx-item" data-action="move-split">↔ Move to ${tab.id === splitActiveTabId ? 'left' : 'right'} pane</button>` : ''}
      <button class="ws-ctx-item" data-action="close">✕ Close tab</button>
      <button class="ws-ctx-item" data-action="close-others">Close other tabs</button>
      <button class="ws-ctx-item" data-action="close-right">Close tabs to the right</button>
    `;
    document.body.appendChild(menu);

    // Adjust position if overflows
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + 'px';

    menu.querySelectorAll('.ws-ctx-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        if (action === 'pin') togglePin(tabId);
        else if (action === 'close') closeTab(tabId);
        else if (action === 'close-others') {
          const keep = tabs.filter(t => t.id === tabId || t.pinned);
          const remove = tabs.filter(t => t.id !== tabId && !t.pinned);
          remove.forEach(t => { if (cleanupFns[t.id]) { cleanupFns[t.id](); delete cleanupFns[t.id]; } });
          tabs = keep;
          activeTabId = tabId;
          if (splitMode) { splitMode = false; splitActiveTabId = null; }
          saveState();
          render();
        } else if (action === 'close-right') {
          const idx = tabs.findIndex(t => t.id === tabId);
          const remove = tabs.slice(idx + 1).filter(t => !t.pinned);
          remove.forEach(t => { if (cleanupFns[t.id]) { cleanupFns[t.id](); delete cleanupFns[t.id]; } });
          tabs = tabs.filter(t => !remove.find(r => r.id === t.id));
          saveState();
          render();
        } else if (action === 'move-split') {
          if (tab.id === splitActiveTabId) {
            // Move to left
            const oldActive = activeTabId;
            activeTabId = tab.id;
            splitActiveTabId = oldActive;
          } else {
            splitActiveTabId = tab.id;
            if (activeTabId === tab.id) {
              activeTabId = tabs.find(t => t.id !== tab.id)?.id || tab.id;
            }
          }
          saveState();
          render();
        }
        removeContextMenu();
      });
    });

    // Close on click outside
    setTimeout(() => {
      document.addEventListener('click', removeContextMenu, { once: true });
    }, 10);
  }

  function removeContextMenu() {
    document.querySelectorAll('.ws-context-menu').forEach(m => m.remove());
  }

  /* ── Content area ───────────────────────────────────── */
  async function renderContent() {
    const content = el('ws-content');
    if (!content) return;

    if (tabs.length === 0) {
      content.innerHTML = '';
      content.className = 'ws-content';
      return;
    }

    // Capture state from currently visible panes before re-rendering
    captureAllVisibleStates();

    evictIfNeeded();

    if (splitMode && splitActiveTabId && splitActiveTabId !== activeTabId) {
      content.className = 'ws-content ws-split-mode';
      content.innerHTML = `
        <div class="ws-pane ws-pane-left" id="ws-pane-left" style="flex:${splitRatio}"></div>
        <div class="ws-split-divider" id="ws-split-divider">
          <div class="ws-split-grip"></div>
        </div>
        <div class="ws-pane ws-pane-right" id="ws-pane-right" style="flex:${1 - splitRatio}"></div>
      `;

      // Render both panes
      await renderTabContent(activeTabId, el('ws-pane-left'));
      await renderTabContent(splitActiveTabId, el('ws-pane-right'));

      // Bind divider drag
      bindSplitDivider();
    } else {
      content.className = 'ws-content';
      content.innerHTML = `<div class="ws-pane ws-pane-full" id="ws-pane-full"></div>`;
      await renderTabContent(activeTabId, el('ws-pane-full'));
    }
  }

  async function renderTabContent(tabId, paneEl) {
    if (!tabId || !paneEl) return;
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Cleanup previous render in this tab
    if (cleanupFns[tabId]) { cleanupFns[tabId](); delete cleanupFns[tabId]; }

    paneEl.innerHTML = `<div class="spinner" style="margin-top:60px;"></div>`;

    // Pass saved viewerState to the renderer for restoration
    const cleanup = await Viewer.renderInto(tab.fileId, paneEl, tab.viewerState || null);
    if (cleanup) cleanupFns[tabId] = cleanup;

    // Get the correct scrollable element (.text-viewer, .image-viewer, or paneEl itself)
    const scrollEl = getScrollableElement(paneEl);

    // Restore scroll position (after a short delay for rendering to complete)
    if (tab.scrollPos > 0) {
      setTimeout(() => {
        // For PDFs the container itself scrolls, for others the inner element does
        if (paneEl.scrollTop !== undefined && paneEl.querySelector('.ws-pdf-toolbar')) {
          paneEl.scrollTop = tab.scrollPos;
        } else if (scrollEl) {
          scrollEl.scrollTop = tab.scrollPos;
        }
      }, 150);
    }

    // Track scroll position for persistence
    if (scrollEl) {
      scrollEl.addEventListener('scroll', () => {
        tab.scrollPos = scrollEl.scrollTop;
        debouncedSaveState();
      }, { passive: true });
    }
    // Also track container scroll for PDFs
    paneEl.addEventListener('scroll', () => {
      if (paneEl.querySelector('.ws-pdf-toolbar')) {
        tab.scrollPos = paneEl.scrollTop;
        debouncedSaveState();
      }
    }, { passive: true });
  }

  /* ── Split divider drag ─────────────────────────────── */
  function bindSplitDivider() {
    const divider = el('ws-split-divider');
    const content = el('ws-content');
    if (!divider || !content) return;

    const onMouseDown = e => {
      e.preventDefault();
      isDraggingSplit = true;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    };

    const onMouseMove = e => {
      if (!isDraggingSplit) return;
      const rect = content.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0.2, Math.min(0.8, x / rect.width));
      splitRatio = ratio;

      const leftPane = el('ws-pane-left');
      const rightPane = el('ws-pane-right');
      if (leftPane) leftPane.style.flex = ratio;
      if (rightPane) rightPane.style.flex = 1 - ratio;
    };

    const onMouseUp = () => {
      if (isDraggingSplit) {
        isDraggingSplit = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        saveState();
      }
    };

    divider.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // Touch support
    divider.addEventListener('touchstart', e => {
      e.preventDefault();
      isDraggingSplit = true;
    }, { passive: false });
    document.addEventListener('touchmove', e => {
      if (!isDraggingSplit) return;
      const touch = e.touches[0];
      const rect = content.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const ratio = Math.max(0.2, Math.min(0.8, x / rect.width));
      splitRatio = ratio;
      const leftPane = el('ws-pane-left');
      const rightPane = el('ws-pane-right');
      if (leftPane) leftPane.style.flex = ratio;
      if (rightPane) rightPane.style.flex = 1 - ratio;
    }, { passive: true });
    document.addEventListener('touchend', onMouseUp);
  }

  /* ── Empty state ────────────────────────────────────── */
  function renderEmptyState() {
    const empty = el('ws-empty-state');
    const content = el('ws-content');
    const tabBar = el('ws-tab-bar');

    if (tabs.length === 0) {
      if (empty) empty.classList.remove('hidden');
      if (content) content.classList.add('hidden');
      if (tabBar) tabBar.classList.add('hidden');
    } else {
      if (empty) empty.classList.add('hidden');
      if (content) content.classList.remove('hidden');
      if (tabBar) tabBar.classList.remove('hidden');
    }
  }

  /* ── Mobile swipe ───────────────────────────────────── */
  function initMobileSwipe() {
    const content = el('ws-content');
    if (!content) return;

    content.addEventListener('touchstart', e => {
      if (!isMobile || tabs.length < 2) return;
      touchStartX = e.touches[0].clientX;
    }, { passive: true });

    content.addEventListener('touchend', e => {
      if (!isMobile || tabs.length < 2) return;
      const diff = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(diff) < 80) return; // minimum swipe distance

      // Capture current state before switching
      captureAllVisibleStates();

      const currentIdx = tabs.findIndex(t => t.id === activeTabId);
      if (diff > 0 && currentIdx > 0) {
        // Swipe right → previous tab
        activeTabId = tabs[currentIdx - 1].id;
      } else if (diff < 0 && currentIdx < tabs.length - 1) {
        // Swipe left → next tab
        activeTabId = tabs[currentIdx + 1].id;
      } else {
        return;
      }
      saveState();
      render();
    }, { passive: true });
  }

  /* ── Keyboard shortcuts ─────────────────────────────── */
  function initKeyboard() {
    document.addEventListener('keydown', e => {
      // Only active in workspace view
      if (typeof App !== 'undefined' && App.getCurrentView() !== 'workspace') return;
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      if (tabs.length === 0) return;

      // Ctrl+W — close active tab
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) closeTab(activeTabId);
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        // Capture current state before switching
        captureAllVisibleStates();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        if (e.shiftKey) {
          activeTabId = tabs[(idx - 1 + tabs.length) % tabs.length].id;
        } else {
          activeTabId = tabs[(idx + 1) % tabs.length].id;
        }
        saveState();
        render();
      }

      // Ctrl+\ — toggle split
      if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        toggleSplit();
      }
    });
  }

  /* ── File picker (opens library in side panel) ──────── */
  function openFilePicker() {
    // Show a quick file picker modal
    const allFiles = FileMeta.getAll().filter(f => !f.spaceId);
    if (!allFiles.length) { showToast('No files in library. Upload some files first.', 'info'); return; }

    const overlay = document.createElement('div');
    overlay.className = 'ws-picker-overlay';
    overlay.innerHTML = `
      <div class="ws-picker-card">
        <div class="ws-picker-header">
          <h3>Open file in workspace</h3>
          <button class="btn-icon ws-picker-close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="ws-picker-search-wrap">
          <input class="form-input ws-picker-search" placeholder="Search files…" type="search" autofocus />
        </div>
        <div class="ws-picker-list"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    const listEl = overlay.querySelector('.ws-picker-list');
    const searchInput = overlay.querySelector('.ws-picker-search');

    function renderPickerList(query = '') {
      const q = query.toLowerCase();
      const filtered = allFiles.filter(f => !q || f.name.toLowerCase().includes(q));
      const openIds = new Set(tabs.map(t => t.fileId));

      listEl.innerHTML = filtered.slice(0, 30).map(f => `
        <div class="ws-picker-item ${openIds.has(f.id) ? 'already-open' : ''}" data-fid="${f.id}">
          <span class="ws-picker-item-icon">${getFileIcon(f.type)}</span>
          <div class="ws-picker-item-info">
            <div class="ws-picker-item-name">${escapeHtml(f.name)}</div>
            <div class="ws-picker-item-meta">${f.type.toUpperCase()} · ${formatDate(f.uploadedAt)}</div>
          </div>
          ${openIds.has(f.id) ? '<span class="ws-picker-item-badge">Open</span>' : ''}
        </div>
      `).join('');

      if (filtered.length === 0) {
        listEl.innerHTML = `<div class="ws-picker-empty">No files found</div>`;
      }

      listEl.querySelectorAll('.ws-picker-item').forEach(item => {
        item.addEventListener('click', () => {
          openFile(item.dataset.fid);
          overlay.remove();
        });
      });
    }

    renderPickerList();

    searchInput.addEventListener('input', () => renderPickerList(searchInput.value));

    overlay.querySelector('.ws-picker-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Keyboard
    overlay.addEventListener('keydown', e => {
      if (e.key === 'Escape') overlay.remove();
    });

    setTimeout(() => searchInput.focus(), 50);
  }

  /* ── Activate (called when navigating to workspace) ── */
  function activate() {
    checkMobile();
    render();
  }

  /* ── Initialize ─────────────────────────────────────── */
  function init() {
    loadState();
    initKeyboard();
    initMobileSwipe();

    // Bind toolbar buttons
    const addBtn = el('ws-add-tab-btn');
    if (addBtn) addBtn.addEventListener('click', openFilePicker);

    const splitBtn = el('ws-split-toggle-btn');
    if (splitBtn) splitBtn.addEventListener('click', toggleSplit);

    const closeAllBtn = el('ws-close-all-btn');
    if (closeAllBtn) closeAllBtn.addEventListener('click', () => {
      if (tabs.length > 0 && confirm('Close all tabs?')) closeAll();
    });

    // Responsive check
    window.addEventListener('resize', () => {
      const wasMobile = isMobile;
      checkMobile();
      if (wasMobile !== isMobile) render();
    });
  }

  /* ── Public API ─────────────────────────────────────── */
  return {
    init,
    activate,
    openFile,
    closeTab,
    closeAll,
    toggleSplit,
    getTabs: () => tabs,
    getActiveTabId: () => activeTabId,
    isFileOpen: (fileId) => tabs.some(t => t.fileId === fileId)
  };
})();
