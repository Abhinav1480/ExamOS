/* ═══════════════════════════════════════════════════════
   app.js — SPA Router, Dashboard, Library, Upload,
            Settings. No chatbot. Auth-first.
   ═══════════════════════════════════════════════════════ */

const App = (() => {
  const VIEWS = ['dashboard', 'library', 'workspace', 'notes', 'focus', 'schedule', 'learning', 'settings', 'shared'];
  const TITLES = { dashboard:'Dashboard', library:'Library', workspace:'Workspace', notes:'Notes', focus:'Focus', schedule:'Schedule', learning:'Learning', settings:'Settings', shared:'Shared Spaces' };
  let currentView = 'dashboard';
  let libFilter = 'all';
  let libGrid = true;
  let currentSubjectId = null;
  let uploadQueue = [];
  let subjectColor = '#4F46E5';
  let subjectIcon = '📚';

  /* ── Navigate ────────────────────────────────────────── */
  function navigate(view) {
    if (!VIEWS.includes(view)) return;

    // Pause video playback if navigating away from learning
    if (currentView === 'learning' && view !== 'learning' && typeof Learning !== 'undefined') {
      Learning.pause();
    }

    VIEWS.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== view);
    });
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));
    document.querySelectorAll('.bn-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));
    document.getElementById('topbar-title').textContent = TITLES[view] || view;

    // Auto-collapse sidebar for workspace/document views
    const autoCollapseViews = ['workspace', 'library', 'notes'];
    if (autoCollapseViews.includes(view)) {
      Sidebar.autoCollapse();
    } else {
      // On mobile: close drawer after any navigation
      if (typeof Sidebar !== 'undefined' && window.innerWidth <= 768) Sidebar.close();
    }

    currentView = view;
    if (view === 'dashboard') refreshDashboard();
    if (view === 'library') renderLibrary();
    if (view === 'notes') Notes.refresh();
    if (view === 'schedule') Timetable.init();
    if (view === 'focus') Pomodoro.renderBars();
    if (view === 'shared') renderSharedView();
    if (view === 'workspace') Workspace.activate();
    if (view === 'learning' && typeof Learning !== 'undefined') {
      Learning.init();
      Learning.refresh();
    }
  }

  /* ── Sidebar State Manager ────────────────────────────── */
  const Sidebar = (() => {
    const COLLAPSED_KEY = 'sidebar_collapsed';
    let _collapsed = LS.get(COLLAPSED_KEY, false);

    function isMobile() {
      return window.innerWidth <= 768;
    }

    function applyState() {
      const sidebar   = document.getElementById('sidebar');
      const overlay   = document.getElementById('sidebar-overlay');
      const appEl     = document.getElementById('app');

      if (isMobile()) {
        // Mobile: drawer mode (slide in/out)
        sidebar.classList.remove('collapsed');
        // Don't change mobile-open here; that's handled by open/close
        appEl.classList.remove('sidebar-collapsed-layout');
      } else {
        // Desktop: icon-only collapse
        sidebar.classList.toggle('collapsed', _collapsed);
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('active');
        appEl.classList.toggle('sidebar-collapsed-layout', _collapsed);
      }
    }

    function toggle() {
      if (isMobile()) {
        // Mobile: toggle drawer
        const sidebar = document.getElementById('sidebar');
        const isOpen = sidebar.classList.contains('mobile-open');
        if (isOpen) close(); else open();
        return;
      }
      _collapsed = !_collapsed;
      LS.set(COLLAPSED_KEY, _collapsed);
      applyState();
    }

    function open() {
      // Mobile only: slide drawer in
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar.classList.add('mobile-open');
      overlay.classList.add('active');
    }

    function close() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    }

    function autoCollapse() {
      // Auto-collapse on desktop when navigating to document-heavy views
      if (!isMobile() && !_collapsed) {
        _collapsed = true;
        LS.set(COLLAPSED_KEY, _collapsed);
        applyState();
      }
      // Mobile: always close the drawer after navigation
      if (isMobile()) close();
    }

    function init() {
      // Restore persisted state
      applyState();

      // Sidebar toggle button (hamburger inside sidebar)
      const toggleBtn = document.getElementById('sidebar-toggle-btn');
      if (toggleBtn) toggleBtn.addEventListener('click', toggle);

      // Mobile topbar hamburger button
      const topbarBtn = document.getElementById('topbar-menu-btn');
      if (topbarBtn) topbarBtn.addEventListener('click', () => {
        if (isMobile()) open();
        else toggle();
      });

      // Overlay click: close on mobile
      const overlay = document.getElementById('sidebar-overlay');
      if (overlay) overlay.addEventListener('click', close);

      // Responsive: re-apply state on resize
      window.addEventListener('resize', () => applyState(), { passive: true });
    }

    return { init, toggle, open, close, autoCollapse, isCollapsed: () => _collapsed };
  })();

  /* ── Theme ───────────────────────────────────────────── */
  function initTheme() {
    const saved = LS.get('theme', 'dark');
    applyTheme(saved);
    document.getElementById('theme-toggle').addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      applyTheme(cur === 'dark' ? 'light' : 'dark');
    });
    document.querySelectorAll('.theme-opt').forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    LS.set('theme', theme);
    document.querySelectorAll('.theme-opt').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === theme));
  }

  /* ── Dashboard ───────────────────────────────────────── */
  function refreshDashboard() {
    updateGreeting();
    updateStats();
    renderSubjects();
    renderRecentFiles();
    updateBadge();
    // Update settings user info
    const user = Auth.getCurrentUser();
    if (user) {
      const sn = document.getElementById('settings-name');
      const se = document.getElementById('settings-email');
      if (sn) sn.textContent = user.name;
      if (se) se.textContent = user.email;
    }
  }

  function updateGreeting() {
    const user = Auth.getCurrentUser();
    const name = user ? user.name.split(' ')[0] : 'there';
    const h = new Date().getHours();
    let greeting = `Good morning, ${name} 👋`;
    if (h >= 12 && h < 17) greeting = `Good afternoon, ${name} ☀️`;
    else if (h >= 17 && h < 21) greeting = `Good evening, ${name} 🌆`;
    else if (h >= 21 || h < 5) greeting = `Burning midnight oil, ${name} 🌙`;
    const el = document.getElementById('welcome-greeting');
    if (el) el.textContent = greeting;
  }

  function updateStats() {
    const files = FileMeta.getAll().filter(f => !f.spaceId);
    const focusSecs = LS.get('total_focus_seconds', 0);
    const focusMins = Math.round(focusSecs / 60);
    const streak = calcStreak();

    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('stat-docs', files.length);
    set('stat-focus', focusMins >= 60 ? `${Math.floor(focusMins / 60)}h` : `${focusMins}m`);
    set('stat-streak', streak);
    set('pom-streak-display', streak);
  }

  function calcStreak() {
    const log = LS.get('study_log', []);
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const entry = log.find(l => l.date === key);
      if (entry && entry.minutes >= 25) streak++;
      else if (i > 0) break;
    }
    return streak;
  }

  function updateBadge() {
    const badge = document.getElementById('lib-badge');
    if (badge) badge.textContent = FileMeta.getAll().filter(f => !f.spaceId).length;
  }

  /* ── Subjects ────────────────────────────────────────── */
  function renderSubjects() {
    const subjects = LS.get('subjects', []).filter(s => !s.spaceId);
    const grid = document.getElementById('subjects-grid');
    const empty = document.getElementById('subject-empty');
    if (!grid) return;

    if (!subjects.length) {
      grid.innerHTML = '';
      grid.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }
    grid.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');

    grid.innerHTML = subjects.map(s => {
      const count = FileMeta.getAll().filter(f => f.subjectId === s.id && !f.spaceId).length;
      return `
        <div class="subject-card" data-id="${s.id}" style="--card-color:${s.color};">
          <style>.subject-card[data-id="${s.id}"]::before{background:${s.color};}</style>
          <div class="subject-card-menu">
            <button class="btn-icon danger del-subject" data-id="${s.id}" title="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
            </button>
          </div>
          <span class="subject-icon">${s.icon}</span>
          <div class="subject-name">${escapeHtml(s.name)}</div>
          <div class="subject-count">${count} file${count !== 1 ? 's' : ''}</div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.subject-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.del-subject')) return;
        libFilter = 'all';
        navigate('library');
        // filter by subject after render
        setTimeout(() => filterBySubject(card.dataset.id), 50);
      });
    });

    grid.querySelectorAll('.del-subject').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        deleteSubject(btn.dataset.id);
      });
    });
  }

  function filterBySubject(subjectId) {
    // Temporarily override library render to show subject filter
    const search = document.getElementById('lib-search');
    if (search) { search.value = ''; search.placeholder = 'Showing subject files…'; }
    const allFiles = FileMeta.getAll().filter(f => f.subjectId === subjectId);
    renderLibraryWithFiles(allFiles);
  }

  async function deleteSubject(id) {
    const subj = SubjectStore.getById(id);
    const subjName = subj ? subj.name : 'this subject';
    const count = FileMeta.getAll().filter(f => f.subjectId === id && !f.spaceId).length;
    const msg = count > 0 
      ? `"${escapeHtml(subjName)}" and all ${count} file${count > 1 ? 's' : ''} in it will be permanently deleted from storage.`
      : `"${escapeHtml(subjName)}" will be permanently removed from your library.`;
    
    if (!(await uiConfirm({ title: 'Delete subject?', message: msg, confirmText: 'Delete', danger: true }))) return;

    try {
      await SubjectStore.delete(id, true);
      renderSubjects();
      refreshSubjectSelects();
      updateBadge();
      updateStats();
      if (currentView === 'library') renderLibrary();
      showToast('Subject deleted', 'info');
    } catch (err) {
      console.error('Failed to delete subject:', err);
      showToast('Failed to delete subject: ' + err.message, 'error');
    }
  }

  /* ── Recent files ────────────────────────────────────── */
  function renderRecentFiles() {
    const files = FileMeta.getAll()
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .slice(0, 6);
    const container = document.getElementById('recent-files');
    const empty = document.getElementById('files-empty');
    if (!container) return;

    if (!files.length) {
      container.innerHTML = '';
      container.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }
    container.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    container.innerHTML = files.map(f => buildFileRow(f)).join('');
    bindFileRowEvents(container);
  }

  function buildFileRow(f) {
    const subj = (LS.get('subjects', []) || []).find(s => s.id === f.subjectId);
    const color = getFileColor(f.type);
    return `
      <div class="file-row" data-id="${f.id}">
        <div class="file-type-badge" style="background:${color}15;">${getFileIcon(f.type)}</div>
        <div class="file-row-info">
          <div class="file-row-name">${escapeHtml(f.name)}</div>
          <div class="file-row-meta">
            ${subj ? `${subj.icon} ${escapeHtml(subj.name)} · ` : ''}${f.type.toUpperCase()} · ${formatDate(f.uploadedAt)}
          </div>
        </div>
        ${f.pinned ? '<span class="pinned-badge">📌 Pinned</span>' : ''}
        ${f.label ? `<span class="file-label-tag label-${f.label}">${getLabelIcon(f.label)} ${capitalizeFirst(f.label)}</span>` : ''}
        <div class="file-row-actions">
          <button class="open-ws-btn" data-id="${f.id}" title="Open in Workspace">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="2" y1="12" x2="12" y2="12"/></svg>
          </button>
          <button class="btn-icon pin-btn" data-id="${f.id}" title="${f.pinned ? 'Unpin' : 'Pin'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </button>
          <button class="btn-icon danger del-file-btn" data-id="${f.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
      </div>`;
  }

  function bindFileRowEvents(container) {
    container.querySelectorAll('.file-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('.file-row-actions')) return;
        Viewer.open(row.dataset.id);
      });
    });
    container.querySelectorAll('.pin-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); togglePin(btn.dataset.id); });
    });
    container.querySelectorAll('.del-file-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); deleteFile(btn.dataset.id); });
    });
    container.querySelectorAll('.open-ws-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); Workspace.openFile(btn.dataset.id); });
    });
  }

  /* ── Library ─────────────────────────────────────────── */
  function renderLibrary() {
    const searchVal = (document.getElementById('lib-search')?.value || '').toLowerCase();
    const breadcrumbs = document.getElementById('lib-breadcrumbs');
    const titleText = document.getElementById('lib-title-text');
    const subjectsSection = document.getElementById('lib-subjects-section');
    const libRecentSection = document.getElementById('lib-recent-section');
    const libRecentGrid = document.getElementById('lib-recent-grid');
    const toolbarRow = document.getElementById('lib-toolbar-row');
    const actionsBar = document.getElementById('subject-actions-bar');
    const filesTitle = document.getElementById('lib-files-title');

    let allFiles = FileMeta.getAll().filter(f => !f.spaceId);
    let subjects = LS.get('subjects', []).filter(s => !s.spaceId);

    // Bind breadcrumb home click
    const bHome = document.getElementById('breadcrumb-home');
    if (bHome) {
      bHome.onclick = () => {
        currentSubjectId = null;
        renderLibrary();
      };
    }

    const isFilteredOrSearched = libFilter !== 'all' || searchVal.length > 0;

    if (currentSubjectId === null) {
      // Root View
      if (breadcrumbs) breadcrumbs.style.display = 'none';
      if (titleText) titleText.textContent = 'Library';
      if (subjectsSection) subjectsSection.style.display = isFilteredOrSearched ? 'none' : 'block';
      if (toolbarRow) toolbarRow.style.display = 'block';
      if (actionsBar) actionsBar.classList.add('hidden');
      if (filesTitle) filesTitle.style.display = 'block';

      // Render subjects folders
      renderSubjectFolders(subjects);

      // Render Recently Uploaded Section
      if (libRecentGrid && !isFilteredOrSearched) {
        const recentFiles = FileMeta.getAll()
          .filter(f => !f.spaceId)
          .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
          .slice(0, 3);

        if (recentFiles.length > 0) {
          if (libRecentSection) libRecentSection.style.display = 'block';
          libRecentGrid.className = libGrid ? 'lib-grid' : 'lib-list';
          if (libGrid) {
            libRecentGrid.innerHTML = recentFiles.map(f => buildLibCard(f)).join('');
          } else {
            libRecentGrid.innerHTML = recentFiles.map(f => buildFileRow(f)).join('');
          }

          // Bind click & actions on the recent grid
          libRecentGrid.querySelectorAll('[data-id]').forEach(card => {
            card.addEventListener('click', e => {
              if (e.target.closest('.lib-card-actions') || e.target.closest('.file-row-actions')) return;
              Viewer.open(card.dataset.id);
            });
          });
          libRecentGrid.querySelectorAll('.lib-pin-btn, .pin-btn').forEach(btn => {
            btn.addEventListener('click', e => { e.stopPropagation(); togglePin(btn.dataset.id); });
          });
          libRecentGrid.querySelectorAll('.lib-del-btn, .del-file-btn').forEach(btn => {
            btn.addEventListener('click', e => { e.stopPropagation(); deleteFile(btn.dataset.id); });
          });
          libRecentGrid.querySelectorAll('.open-ws-btn').forEach(btn => {
            btn.addEventListener('click', e => { e.stopPropagation(); Workspace.openFile(btn.dataset.id); });
          });
        } else {
          if (libRecentSection) libRecentSection.style.display = 'none';
        }
      } else {
        if (libRecentSection) libRecentSection.style.display = 'none';
      }

      // Filters
      if (libFilter === 'pinned') allFiles = allFiles.filter(f => f.pinned);
      else if (libFilter === 'important') allFiles = allFiles.filter(f => f.label === 'important');
      else if (['pdf','docx','pptx','image','youtube','txt'].includes(libFilter)) allFiles = allFiles.filter(f => f.type === libFilter);

      // Search
      if (searchVal) allFiles = allFiles.filter(f => f.name.toLowerCase().includes(searchVal));

      // Sort
      allFiles = allFiles.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.uploadedAt) - new Date(a.uploadedAt);
      });

      renderLibraryWithFiles(allFiles);
    } else {
      // Inside Subject View
      const activeSubject = subjects.find(s => s.id === currentSubjectId);
      if (!activeSubject) {
        currentSubjectId = null;
        renderLibrary();
        return;
      }

      if (breadcrumbs) {
        breadcrumbs.style.display = 'flex';
        document.getElementById('breadcrumb-current').textContent = `${activeSubject.icon} ${activeSubject.name}`;
      }
      if (titleText) titleText.textContent = '';
      if (subjectsSection) subjectsSection.style.display = 'none';
      if (libRecentSection) libRecentSection.style.display = 'none';
      if (toolbarRow) toolbarRow.style.display = 'block';
      if (actionsBar) {
        actionsBar.classList.remove('hidden');
        // Render badges
        const favB = document.getElementById('subj-favorite-badge');
        const pinB = document.getElementById('subj-pinned-badge');
        if (favB) favB.style.display = activeSubject.favorite ? 'inline-block' : 'none';
        if (pinB) pinB.style.display = activeSubject.pinned ? 'inline-block' : 'none';

        // Bind buttons
        document.getElementById('subj-rename-btn').onclick = () => renameSubject(activeSubject.id);
        document.getElementById('subj-fav-btn').onclick = () => toggleSubjectFavorite(activeSubject.id);
        document.getElementById('subj-pin-btn').onclick = () => toggleSubjectPin(activeSubject.id);
        document.getElementById('subj-del-btn').onclick = () => deleteSubjectInLib(activeSubject.id);
      }
      if (filesTitle) filesTitle.style.display = 'none';

      // Filter files strictly to this subject
      let subjectFiles = allFiles.filter(f => f.subjectId === currentSubjectId);

      // Apply type filters
      if (libFilter === 'pinned') subjectFiles = subjectFiles.filter(f => f.pinned);
      else if (libFilter === 'important') subjectFiles = subjectFiles.filter(f => f.label === 'important');
      else if (['pdf','docx','pptx','image','youtube','txt'].includes(libFilter)) subjectFiles = subjectFiles.filter(f => f.type === libFilter);

      // Search inside subject
      if (searchVal) subjectFiles = subjectFiles.filter(f => f.name.toLowerCase().includes(searchVal));

      // Sort
      subjectFiles = subjectFiles.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.uploadedAt) - new Date(a.uploadedAt);
      });

      renderLibraryWithFiles(subjectFiles, true);
    }
  }

  function renderSubjectFolders(subjects) {
    const grid = document.getElementById('lib-subjects-grid');
    if (!grid) return;

    if (!subjects.length) {
      grid.innerHTML = `
        <div class="empty-state" style="padding: 24px 16px; grid-column: 1/-1; background: var(--surface); border: 1px dashed var(--border); box-shadow: none;">
          <span class="empty-icon" style="font-size: 1.8rem; display: block; margin-bottom: 8px;">📁</span>
          <h3 style="font-size: 0.85rem; font-weight: 700; margin-bottom: 2px;">No subject folders</h3>
          <p style="font-size: 0.75rem; color: var(--text-3); margin-bottom: 10px;">Create a subject folder card below to organize your files</p>
          <button class="btn-primary" id="lib-onboard-create-subject" style="font-size:0.75rem; padding: 5px 12px;">Create Subject</button>
        </div>`;
      const btn = document.getElementById('lib-onboard-create-subject');
      if (btn) {
        btn.onclick = () => {
          const mBtn = document.getElementById('lib-create-subject-btn');
          if (mBtn) mBtn.click();
        };
      }
      return;
    }

    // Sort: pinned first, then favorites, then name
    const sorted = [...subjects].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      if (a.favorite && !b.favorite) return -1;
      if (!a.favorite && b.favorite) return 1;
      return a.name.localeCompare(b.name);
    });

    grid.innerHTML = sorted.map(s => {
      const count = FileMeta.getAll().filter(f => f.subjectId === s.id && !f.spaceId).length;
      return `
        <div class="subject-folder-card" data-id="${s.id}" style="--card-color:${s.color};">
          <div class="folder-icon">${s.icon}</div>
          <div class="folder-info">
            <div class="folder-name">${escapeHtml(s.name)}</div>
            <div class="folder-count">${count} file${count !== 1 ? 's' : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
            ${s.pinned ? '<span style="font-size:0.75rem;" title="Pinned">📌</span>' : ''}
            ${s.favorite ? '<span style="font-size:0.75rem;" title="Favorite">⭐</span>' : ''}
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.subject-folder-card').forEach(card => {
      card.addEventListener('click', () => {
        currentSubjectId = card.dataset.id;
        renderLibrary();
      });
    });
  }

  /* Subject actions */
  async function renameSubject(id) {
    const subj = SubjectStore.getById(id);
    if (!subj) return;
    const newName = await uiPrompt({ title: 'Rename subject', label: 'Subject name', value: subj.name, placeholder: 'Enter subject name', confirmText: 'Rename' });
    if (newName && newName.trim()) {
      SubjectStore.rename(id, newName.trim());
      showToast("Subject renamed", "success");
      renderLibrary();
      renderSubjects();
      refreshSubjectSelects();
    }
  }

  function toggleSubjectFavorite(id) {
    const isFav = SubjectStore.toggleFavorite(id);
    showToast(isFav ? "⭐ Added to Favorites" : "Removed from Favorites", "info");
    renderLibrary();
    renderSubjects();
  }

  function toggleSubjectPin(id) {
    const isPinned = SubjectStore.togglePin(id);
    showToast(isPinned ? "📌 Pinned Subject" : "Unpinned Subject", "info");
    renderLibrary();
    renderSubjects();
  }

  async function deleteSubjectInLib(id) {
    const subj = SubjectStore.getById(id);
    const subjName = subj ? subj.name : 'this subject';
    const count = FileMeta.getAll().filter(f => f.subjectId === id && !f.spaceId).length;
    const msg = count > 0 
      ? `"${escapeHtml(subjName)}" and all ${count} file${count > 1 ? 's' : ''} in it will be permanently deleted from storage.`
      : `"${escapeHtml(subjName)}" will be permanently removed from your library.`;

    if (!(await uiConfirm({ title: 'Delete subject?', message: msg, confirmText: 'Delete permanently', danger: true }))) return;

    try {
      await SubjectStore.delete(id, true);
      currentSubjectId = null;
      renderLibrary();
      renderSubjects();
      refreshSubjectSelects();
      updateBadge();
      updateStats();
      showToast('Subject deleted', 'info');
    } catch (err) {
      console.error('Failed to delete subject:', err);
      showToast('Failed to delete subject: ' + err.message, 'error');
    }
  }

  function renderLibraryWithFiles(files, isSubDir = false) {
    const grid = document.getElementById('lib-grid');
    const empty = document.getElementById('lib-empty');
    if (!grid) return;

    if (!files.length) {
      grid.innerHTML = '';
      grid.className = libGrid ? 'lib-grid' : 'lib-list';
      if (isSubDir) {
        grid.classList.remove('hidden');
        if (empty) empty.classList.add('hidden');
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1; padding: 36px 20px;">
            <span class="empty-icon" style="font-size:2.2rem;">📂</span>
            <h3 style="font-size:0.9rem; font-weight:700;">Folder is empty</h3>
            <p style="font-size:0.78rem; color:var(--text-3); max-width:280px; margin:0 auto 12px;">No files inside this subject folder yet. Upload study materials directly into this folder!</p>
            <button class="btn-primary" id="lib-folder-upload-cta">Upload files</button>
          </div>`;
        const btn = document.getElementById('lib-folder-upload-cta');
        if (btn) {
          btn.onclick = () => {
            const mBtn = document.getElementById('lib-upload-btn');
            if (mBtn) mBtn.click();
          };
        }
      } else {
        grid.classList.add('hidden');
        if (empty) empty.classList.remove('hidden');
      }
      return;
    }
    grid.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');

    if (libGrid) {
      grid.className = 'lib-grid';
      grid.innerHTML = files.map(f => buildLibCard(f)).join('');
    } else {
      grid.className = 'lib-list';
      grid.innerHTML = files.map(f => buildFileRow(f)).join('');
    }

    grid.querySelectorAll('[data-id]').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('.lib-card-actions') || e.target.closest('.file-row-actions') || e.target.closest('.folder-actions')) return;
        Viewer.open(card.dataset.id);
      });
    });
    grid.querySelectorAll('.pin-btn, .lib-pin-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); togglePin(btn.dataset.id); });
    });
    grid.querySelectorAll('.del-file-btn, .lib-del-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); deleteFile(btn.dataset.id); });
    });
    grid.querySelectorAll('.open-ws-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); Workspace.openFile(btn.dataset.id); });
    });
  }

  function buildLibCard(f) {
    const color = getFileColor(f.type);
    const subj = (LS.get('subjects', []) || []).find(s => s.id === f.subjectId);
    const isYt = f.type === 'youtube';
    return `
      <div class="lib-card" data-id="${f.id}">
        <div class="lib-card-actions">
          <button class="open-ws-btn" data-id="${f.id}" title="Open in Workspace">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><line x1="2" y1="12" x2="12" y2="12"/></svg>
          </button>
          <button class="btn-icon lib-pin-btn" data-id="${f.id}" title="${f.pinned ? 'Unpin' : 'Pin'}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          </button>
          <button class="btn-icon danger lib-del-btn" data-id="${f.id}" title="Delete">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>
        ${f.pinned ? '<div class="lib-card-pin">📌</div>' : ''}
        ${isYt ? `
          <div class="lib-card-yt-badge">
            <svg viewBox="0 0 24 24"><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>
          </div>` : ''}
        <div class="lib-card-icon" style="background:${color}15;">${getFileIcon(f.type)}</div>
        <div class="lib-card-name">${escapeHtml(f.name)}</div>
        <div class="lib-card-meta">
          ${subj ? `${subj.icon} ${escapeHtml(subj.name)} · ` : ''}${f.type.toUpperCase()}<br>
          ${formatDate(f.uploadedAt)}
          ${f.label ? `<br><span class="file-label-tag label-${f.label}" style="margin-top:4px;display:inline-flex;">${getLabelIcon(f.label)} ${capitalizeFirst(f.label)}</span>` : ''}
        </div>
      </div>`;
  }

  /* ── File actions ────────────────────────────────────── */
  function togglePin(fileId) {
    const pinned = FileMeta.pin(fileId);
    showToast(pinned ? '📌 File pinned' : 'File unpinned', 'info');
    if (currentView === 'library') renderLibrary();
    if (currentView === 'dashboard') renderRecentFiles();
  }

  async function deleteFile(fileId) {
    const meta = FileMeta.getById(fileId);
    if (!meta || !(await uiConfirm({ title: 'Delete file?', message: `"${escapeHtml(meta.name)}" will be permanently removed from storage.`, confirmText: 'Delete', danger: true }))) return;
    try {
      await FileManager.deleteFile(fileId);
      showToast(`"${meta.name}" deleted`, 'info');
      updateBadge();
      if (currentView === 'library') renderLibrary();
      else if (currentView === 'dashboard') renderRecentFiles();
      updateStats();
    } catch (err) {
      console.error('Failed to delete file:', err);
      showToast('Failed to delete file: ' + err.message, 'error');
    }
  }

  /* ── Upload ──────────────────────────────────────────── */
  function initUpload() {
    const overlay = document.getElementById('upload-modal');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    // Open triggers
    ['upload-btn', 'quick-upload-btn', 'lib-upload-btn', 'lib-upload-cta', 'files-upload-cta'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', openUploadModal);
    });

    document.getElementById('browse-btn').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => { addToQueue(fileInput.files); fileInput.value = ''; });

    // Drag & drop
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('drag-over'); addToQueue(e.dataTransfer.files); });

    // YouTube
    document.getElementById('yt-add-btn').addEventListener('click', addYT);
    document.getElementById('yt-input').addEventListener('keydown', e => { if (e.key === 'Enter') addYT(); });

    // Modal
    document.getElementById('upload-cancel-btn').addEventListener('click', closeUploadModal);
    document.getElementById('upload-modal-close').addEventListener('click', closeUploadModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeUploadModal(); });
    document.getElementById('upload-confirm-btn').addEventListener('click', processUpload);
  }

  function openUploadModal() {
    uploadQueue = [];
    renderQueue();
    refreshSubjectSelects();
    if (currentSubjectId) {
      const select = document.getElementById('upload-subject-select');
      if (select) select.value = currentSubjectId;
    }
    document.getElementById('upload-modal').classList.remove('hidden');
  }

  function closeUploadModal() {
    document.getElementById('upload-modal').classList.add('hidden');
    uploadQueue = [];
    document.getElementById('yt-input').value = '';
  }

  function addToQueue(files) {
    Array.from(files).forEach(f => {
      uploadQueue.push({ file: f, name: f.name, type: getTypeFromFile(f), size: f.size });
    });
    renderQueue();
  }

  function addYT() {
    const input = document.getElementById('yt-input');
    const url = input.value.trim();
    if (!url) return;
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
      showToast('Please enter a valid YouTube URL', 'warning'); return;
    }
    const match = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
    const videoId = match ? match[1] : null;
    uploadQueue.push({ file: null, name: `YouTube: ${videoId || 'Video'}`, type: 'youtube', youtubeUrl: url, youtubeId: videoId });
    input.value = '';
    renderQueue();
  }

  function renderQueue() {
    const c = document.getElementById('upload-queue');
    c.innerHTML = uploadQueue.map((item, i) => `
      <div class="queue-item">
        <span>${getFileIcon(item.type)}</span>
        <span class="queue-item-name">${escapeHtml(item.name)}</span>
        <span class="queue-remove" data-i="${i}">✕</span>
      </div>`).join('');
    c.querySelectorAll('.queue-remove').forEach(btn => {
      btn.addEventListener('click', () => { uploadQueue.splice(parseInt(btn.dataset.i), 1); renderQueue(); });
    });
  }

  async function processUpload() {
    if (!uploadQueue.length) { showToast('No files to upload', 'warning'); return; }
    const btn = document.getElementById('upload-confirm-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Uploading…';

    const subjectId = document.getElementById('upload-subject-select').value;
    const label = document.getElementById('upload-label-select').value;

    const isShared = (currentView === 'shared' && currentSpaceId);

    for (const item of uploadQueue) {
      try {
        const id = Date.now().toString() + Math.random().toString(36).slice(2);
        const meta = { 
          id, 
          name: item.name, 
          type: item.type, 
          subjectId, 
          label, 
          pinned: false,
          uploadedAt: new Date().toISOString(), 
          youtubeUrl: item.youtubeUrl || null, 
          youtubeId: item.youtubeId || null, 
          size: item.size || 0 
        };
        
        if (isShared) {
          meta.spaceId = currentSpaceId;
        }

        if (item.file) {
          const ab = await item.file.arrayBuffer();
          await FileStore.save({ id, data: ab });
        }
        FileMeta.save(meta);
      } catch (err) {
        showToast(`Failed: ${item.name}`, 'error');
      }
    }

    btn.disabled = false; btn.textContent = 'Upload all';
    const count = uploadQueue.length;
    closeUploadModal();
    
    if (isShared) {
      showToast(`${count} file${count > 1 ? 's' : ''} uploaded to shared workspace!`, 'success');
      renderSpaceDetail();
    } else {
      showToast(`${count} file${count > 1 ? 's' : ''} uploaded!`, 'success');
      refreshDashboard(); renderLibrary(); updateBadge();
    }
  }

  /* ── Subject modal ───────────────────────────────────── */
  function initSubjectModal() {
    const overlay = document.getElementById('subject-modal');

    const open = () => {
      subjectColor = '#4F46E5'; subjectIcon = '📚';
      document.getElementById('subject-name').value = '';
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.toggle('active', s.dataset.color === subjectColor));
      document.querySelectorAll('.icon-swatch').forEach(s => s.classList.toggle('active', s.dataset.icon === subjectIcon));
      overlay.classList.remove('hidden');
    };

    ['add-subject-btn', 'create-first-subject', 'lib-create-subject-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', open);
    });

    document.getElementById('subject-cancel-btn').addEventListener('click', () => overlay.classList.add('hidden'));
    document.getElementById('subject-modal-close').addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); });

    document.querySelectorAll('.color-swatch').forEach(s => {
      s.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(x => x.classList.remove('active'));
        s.classList.add('active'); subjectColor = s.dataset.color;
      });
    });

    document.querySelectorAll('.icon-swatch').forEach(s => {
      s.addEventListener('click', () => {
        document.querySelectorAll('.icon-swatch').forEach(x => x.classList.remove('active'));
        s.classList.add('active'); subjectIcon = s.dataset.icon;
      });
    });

    document.getElementById('subject-create-btn').addEventListener('click', () => {
      const name = document.getElementById('subject-name').value.trim();
      if (!name) { showToast('Enter a subject name', 'warning'); return; }
      const newSubject = { id: Date.now().toString(), name, color: subjectColor, icon: subjectIcon };
      SubjectStore.save(newSubject);
      overlay.classList.add('hidden');
      renderSubjects();
      refreshSubjectSelects();
      if (currentView === 'library') renderLibrary();
      showToast(`Subject "${name}" created!`, 'success');
    });
  }

  /* ── Settings ────────────────────────────────────────── */
  function initSettings() {
    const syncToggle = document.getElementById('settings-cloud-sync-toggle');
    const syncNowBtn = document.getElementById('settings-sync-now-btn');
    const lastSyncLabel = document.getElementById('settings-last-sync');

    if (syncToggle) {
      syncToggle.checked = CloudSync.isEnabled();
      syncToggle.addEventListener('change', e => {
        CloudSync.setEnabled(e.target.checked);
        showToast(e.target.checked ? 'Cloud sync enabled' : 'Cloud sync disabled', 'info');
      });
    }

    if (syncNowBtn) {
      syncNowBtn.addEventListener('click', async () => {
        syncNowBtn.disabled = true;
        const oldTxt = syncNowBtn.textContent;
        syncNowBtn.textContent = 'Syncing...';
        try {
          await CloudSync.push();
          showToast('Workspace synced to the cloud!', 'success');
        } catch (err) {
          showToast('Sync failed: ' + err.message, 'error');
        } finally {
          syncNowBtn.disabled = false;
          syncNowBtn.textContent = oldTxt;
        }
      });
    }

    if (lastSyncLabel) {
      const lastSync = CloudSync.getLastSync();
      lastSyncLabel.textContent = lastSync ? `Last synced: ${new Date(lastSync).toLocaleString()}` : 'Last synced: Never';
    }

    document.getElementById('export-btn').addEventListener('click', async () => {
      await DataPortability.export();
      showToast('Data exported!', 'success');
    });

    document.getElementById('import-btn').addEventListener('click', () => {
      document.getElementById('import-input').click();
    });

    document.getElementById('import-input').addEventListener('change', async e => {
      const file = e.target.files[0]; if (!file) return;
      try {
        await DataPortability.import(await file.text());
        showToast('Data imported! Refreshing…', 'success');
        setTimeout(() => location.reload(), 1000);
      } catch (err) { showToast('Import failed: ' + err.message, 'error'); }
    });

    document.getElementById('clear-all-btn').addEventListener('click', async () => {
      if (!(await uiConfirm({ title: 'Delete ALL your data?', message: 'Subjects, files, notes, courses and settings will be permanently erased. This cannot be undone.', confirmText: 'Delete everything', danger: true }))) return;
      if (!(await uiConfirm({ title: 'Are you absolutely sure?', message: 'This is your final warning — all data will be gone forever.', confirmText: 'Yes, delete it all', cancelText: 'Keep my data', danger: true, icon: '🚨' }))) return;
      await DataPortability.clearAll();
      showToast('All data deleted.', 'info');
      setTimeout(() => location.reload(), 800);
    });

    // Logout buttons
    ['logout-btn', 'logout-settings-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', async () => {
        if (await uiConfirm({ title: 'Sign out?', message: 'Your data is saved locally and in the cloud.', confirmText: 'Sign out', icon: '👋' })) Auth.logout();
      });
    });
  }

  /* ── Library controls ────────────────────────────────── */
  function initLibraryControls() {
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        libFilter = chip.dataset.filter;
        renderLibrary();
      });
    });

    document.getElementById('lib-search').addEventListener('input', () => renderLibrary());
    document.getElementById('lib-grid-btn').addEventListener('click', () => { libGrid = true; renderLibrary(); });
    document.getElementById('lib-list-btn').addEventListener('click', () => { libGrid = false; renderLibrary(); });
    document.getElementById('view-all-btn').addEventListener('click', () => navigate('library'));
  }

  /* ── Nav ─────────────────────────────────────────────── */
  function initNav() {
    document.querySelectorAll('.nav-link, .bn-item').forEach(item => {
      item.addEventListener('click', () => { if (item.dataset.view) navigate(item.dataset.view); });
    });

    document.getElementById('logo-btn').addEventListener('click', () => navigate('dashboard'));

    // Initialize the collapsible sidebar (handles toggle, mobile drawer, resize)
    Sidebar.init();
  }

  /* ── Global search ───────────────────────────────────── */
  function initSearch() {
    const input = document.getElementById('global-search');
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (!q) return;
      navigate('library');
      setTimeout(() => {
        const libSearch = document.getElementById('lib-search');
        if (libSearch) { libSearch.value = q; renderLibrary(); }
      }, 50);
    });

    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); input.focus(); }
    });
  }

  /* ── Shared Study Spaces logic ─────────────────────── */
  let currentSpaceId = null;
  let sharedActiveTab = 'spaces';
  let selectedSpaceIcon = '👥';
  let currentSharedSubjectId = null;

  function renderSharedView() {
    SharedMeta.initDefaults();
    FriendMeta.initDefaults();

    const spacesTab = document.getElementById('shared-tab-spaces');
    const friendsTab = document.getElementById('shared-tab-friends');
    const detailView = document.getElementById('shared-space-detail');

    if (currentSpaceId) {
      if (spacesTab) spacesTab.classList.add('hidden');
      if (friendsTab) friendsTab.classList.add('hidden');
      if (detailView) detailView.classList.remove('hidden');
      renderSpaceDetail();
    } else {
      if (detailView) detailView.classList.add('hidden');
      if (sharedActiveTab === 'spaces') {
        if (spacesTab) spacesTab.classList.remove('hidden');
        if (friendsTab) friendsTab.classList.add('hidden');
        renderSharedSpacesGrid();
      } else {
        if (spacesTab) spacesTab.classList.add('hidden');
        if (friendsTab) friendsTab.classList.remove('hidden');
        renderFriendsTab();
      }
    }
  }

  function renderSharedSpacesGrid() {
    const grid = document.getElementById('shared-spaces-grid');
    const empty = document.getElementById('shared-spaces-empty');
    if (!grid) return;

    const spaces = SharedMeta.getAll();
    if (spaces.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.classList.remove('hidden');
      return;
    }
    if (empty) empty.classList.add('hidden');

    grid.innerHTML = spaces.map(s => {
      const spaceFiles = FileMeta.getAll().filter(f => f.spaceId === s.id);
      const spaceFolders = LS.get('subjects', []).filter(f => f.spaceId === s.id);
      
      const avatarsMarkup = s.members.slice(0, 3).map(m => {
        const initial = m.avatar || (m.name ? m.name[0].toUpperCase() : '?');
        return `<div class="member-avatar" title="${escapeHtml(m.name)}">${initial}</div>`;
      }).join('');
      
      const remaining = s.members.length - 3;
      const moreMarkup = remaining > 0 ? `<div class="member-avatar more" title="${remaining} more">+${remaining}</div>` : '';

      return `
        <div class="shared-space-card" data-id="${s.id}">
          <div class="shared-space-card-top">
            <div class="shared-space-card-icon">${s.icon || '👥'}</div>
            <div style="flex: 1; min-width: 0;">
              <div class="shared-space-card-name">${escapeHtml(s.name)}</div>
              <div class="shared-space-card-desc">${escapeHtml(s.description || 'No description provided')}</div>
            </div>
          </div>
          <div class="shared-space-card-bottom">
            <div class="shared-space-card-stats">
              📁 ${spaceFolders.length} folders · 📄 ${spaceFiles.length} files
            </div>
            <div class="member-avatars-row">
              ${avatarsMarkup}
              ${moreMarkup}
            </div>
          </div>
        </div>`;
    }).join('');

    grid.querySelectorAll('.shared-space-card').forEach(card => {
      card.addEventListener('click', () => {
        currentSpaceId = card.dataset.id;
        currentSharedSubjectId = null;
        renderSharedView();
      });
    });
  }

  function renderFriendsTab() {
    const reqsList = document.getElementById('incoming-requests-list');
    const reqsTitle = document.getElementById('incoming-requests-title');
    const requests = FriendMeta.getRequests();
    
    if (reqsTitle) reqsTitle.textContent = `Friend Requests (${requests.length})`;
    if (reqsList) {
      if (requests.length === 0) {
        reqsList.innerHTML = `<div style="font-size:0.78rem;color:var(--text-3);text-align:center;padding:12px;border:1px dashed var(--border);border-radius:var(--r-md);">No pending requests</div>`;
      } else {
        reqsList.innerHTML = requests.map(r => `
          <div class="friend-req-item">
            <div class="friend-item-info">
              <div class="friend-item-avatar">${r.avatar || r.name[0].toUpperCase()}</div>
              <div>
                <div class="friend-item-name">${escapeHtml(r.name)}</div>
                <div class="friend-item-email" style="font-size:0.7rem;">${escapeHtml(r.email)}</div>
              </div>
            </div>
            <div style="display:flex;gap:4px;">
              <button class="btn-primary accept-request-btn" data-email="${r.email}" style="font-size:0.7rem;padding:3px 8px;">Accept</button>
              <button class="btn-ghost reject-request-btn" data-email="${r.email}" style="font-size:0.7rem;padding:3px 8px;">Reject</button>
            </div>
          </div>`).join('');
          
        reqsList.querySelectorAll('.accept-request-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const email = btn.dataset.email;
            const req = requests.find(r => r.email === email);
            if (req) {
              FriendMeta.save(req);
              FriendMeta.deleteRequest(email);
              showToast(`Accepted friend request from ${req.name}!`, 'success');
              renderFriendsTab();
            }
          });
        });
        
        reqsList.querySelectorAll('.reject-request-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const email = btn.dataset.email;
            FriendMeta.deleteRequest(email);
            showToast('Friend request rejected.', 'info');
            renderFriendsTab();
          });
        });
      }
    }

    const friendsList = document.getElementById('friends-list-container');
    const friendsTitle = document.getElementById('friends-list-title');
    const emptyState = document.getElementById('friends-empty');
    const friends = FriendMeta.getAll();
    
    if (friendsTitle) friendsTitle.textContent = `Your Friends (${friends.length})`;
    if (friendsList) {
      if (friends.length === 0) {
        friendsList.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
      } else {
        if (emptyState) emptyState.classList.add('hidden');
        friendsList.innerHTML = friends.map(f => `
          <div class="friend-list-item">
            <div class="friend-item-info">
              <div class="friend-item-avatar">${f.avatar || (f.name ? f.name[0].toUpperCase() : '👤')}</div>
              <div>
                <div class="friend-item-name">${escapeHtml(f.name)}</div>
                <div class="friend-item-email">${escapeHtml(f.code || f.email)}</div>
              </div>
            </div>
            <button class="btn-icon danger remove-friend-btn" data-email="${f.email}" title="Remove Friend">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>`).join('');
          
        friendsList.querySelectorAll('.remove-friend-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const email = btn.dataset.email;
            const friend = friends.find(f => f.email === email);
            if (friend && await uiConfirm({ title: 'Remove friend?', message: `Remove <b>${escapeHtml(friend.name)}</b> from your friends?`, confirmText: 'Remove', danger: true })) {
              FriendMeta.delete(email);
              showToast(`${friend.name} removed.`, 'info');
              renderFriendsTab();
            }
          });
        });
      }
    }

    // Display and Copy My Friend Code
    const myCodeText = document.getElementById('my-friend-code-text');
    if (myCodeText) {
      myCodeText.textContent = getMyFriendCode();
    }
    const copyBtn = document.getElementById('copy-friend-code-btn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(getMyFriendCode()).then(() => {
          showToast('Friend code copied to clipboard!', 'success');
        });
      };
    }
  }

  function renderSpaceDetail() {
    const space = SharedMeta.getById(currentSpaceId);
    if (!space) {
      currentSpaceId = null;
      renderSharedView();
      return;
    }

    const sName = document.getElementById('shared-space-name-text');
    const sIcon = document.getElementById('shared-space-icon');
    const sDesc = document.getElementById('shared-space-desc');
    if (sName) sName.textContent = space.name;
    if (sIcon) sIcon.textContent = space.icon || '👥';
    if (sDesc) sDesc.textContent = space.description || 'Collaborative workspace';

    const membersList = document.getElementById('shared-space-members');
    if (membersList) {
      membersList.innerHTML = space.members.map(m => {
        const initial = m.avatar || (m.name ? m.name[0].toUpperCase() : '?');
        return `<div class="member-avatar" title="${escapeHtml(m.name)}">${initial}</div>`;
      }).join('');
    }

    const folderGrid = document.getElementById('shared-folders-grid');
    const folders = LS.get('subjects', []).filter(f => f.spaceId === currentSpaceId);
    if (folderGrid) {
      if (folders.length === 0) {
        folderGrid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;padding:20px;background:var(--surface-2);border:1px dashed var(--border);box-shadow:none;">
            <span style="font-size:1.5rem;">📁</span>
            <h4 style="font-size:0.82rem;margin-bottom:2px;">No shared folders</h4>
            <p style="font-size:0.72rem;color:var(--text-3);">Create a folder to group related shared files together.</p>
          </div>`;
      } else {
        folderGrid.innerHTML = folders.map(f => {
          const filesCount = FileMeta.getAll().filter(doc => doc.subjectId === f.id && doc.spaceId === currentSpaceId).length;
          const isActive = currentSharedSubjectId === f.id;
          return `
            <div class="subject-folder-card ${isActive ? 'active' : ''}" data-id="${f.id}" style="--card-color:${f.color}; padding: 12px 14px; display:flex; align-items:center; gap:10px; background:${isActive ? 'var(--primary-soft)' : 'var(--surface)'}; border: 1px solid ${isActive ? 'var(--primary)' : 'var(--border)'};">
              <style>.subject-folder-card[data-id="${f.id}"]::before{background:${f.color};}</style>
              <div class="folder-icon" style="font-size:1.25rem;">${f.icon}</div>
              <div style="flex:1;min-width:0;">
                <div class="folder-name" style="font-size:0.85rem;font-weight:700;">${escapeHtml(f.name)}</div>
                <div style="font-size:0.7rem;color:var(--text-3);">${filesCount} file${filesCount !== 1 ? 's' : ''}</div>
              </div>
              <button class="btn-icon danger del-shared-folder" data-id="${f.id}" title="Delete" style="width:24px;height:24px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
              </button>
            </div>`;
        }).join('');

        folderGrid.querySelectorAll('.subject-folder-card').forEach(card => {
          card.addEventListener('click', e => {
            if (e.target.closest('.del-shared-folder')) return;
            const fid = card.dataset.id;
            currentSharedSubjectId = currentSharedSubjectId === fid ? null : fid;
            renderSpaceDetail();
          });
        });

        folderGrid.querySelectorAll('.del-shared-folder').forEach(btn => {
          btn.addEventListener('click', async e => {
            e.stopPropagation();
            const folderId = btn.dataset.id;
            const count = FileMeta.getAll().filter(f => f.subjectId === folderId && f.spaceId === currentSpaceId).length;
            const msg = count > 0 
              ? `Delete this folder and its ${count} file${count > 1 ? 's' : ''} permanently from the shared space?` 
              : 'Delete this folder from the shared space?';
            if (await uiConfirm({ title: 'Delete folder?', message: msg, confirmText: 'Delete', danger: true })) {
              try {
                const spaceFiles = FileMeta.getAll().filter(f => f.subjectId === folderId && f.spaceId === currentSpaceId);
                if (spaceFiles.length > 0) {
                  await FileManager.deleteFiles(spaceFiles.map(f => f.id));
                }
                const allSubj = (LS.get('subjects', []) || []).filter(s => s.id !== folderId);
                LS.set('subjects', allSubj);
                if (currentSharedSubjectId === folderId) currentSharedSubjectId = null;
                showToast('Folder deleted.', 'info');
                renderSpaceDetail();
              } catch (err) {
                console.error('Failed to delete shared folder:', err);
                showToast('Failed to delete folder: ' + err.message, 'error');
              }
            }
          });
        });
      }
    }

    const filesGrid = document.getElementById('shared-space-files-grid');
    const filesEmpty = document.getElementById('shared-space-files-empty');
    let spaceFiles = FileMeta.getAll().filter(f => f.spaceId === currentSpaceId);

    if (currentSharedSubjectId) {
      spaceFiles = spaceFiles.filter(f => f.subjectId === currentSharedSubjectId);
      const activeFolder = folders.find(f => f.id === currentSharedSubjectId);
      document.getElementById('shared-files-section-title').textContent = activeFolder 
        ? `Files in ${activeFolder.icon} ${activeFolder.name}`
        : 'Shared Files';
    } else {
      document.getElementById('shared-files-section-title').textContent = 'All Shared Files';
    }

    if (filesGrid) {
      if (spaceFiles.length === 0) {
        filesGrid.innerHTML = '';
        filesGrid.classList.add('hidden');
        if (filesEmpty) filesEmpty.classList.remove('hidden');
      } else {
        filesGrid.classList.remove('hidden');
        if (filesEmpty) filesEmpty.classList.add('hidden');
        
        filesGrid.innerHTML = spaceFiles.map(f => {
          const color = getFileColor(f.type);
          const isYt = f.type === 'youtube';
          const folder = folders.find(fd => fd.id === f.subjectId);
          return `
            <div class="lib-card" data-id="${f.id}">
              <div class="lib-card-actions">
                <button class="btn-icon danger lib-del-btn" data-id="${f.id}" title="Delete">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>
                </button>
              </div>
              ${isYt ? `
                <div class="lib-card-yt-badge">
                  <svg viewBox="0 0 24 24"><polygon points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02"/></svg>
                </div>` : ''}
              <div class="lib-card-icon" style="background:${color}15;">${getFileIcon(f.type)}</div>
              <div class="lib-card-name">${escapeHtml(f.name)}</div>
              <div class="lib-card-meta">
                ${folder ? `${folder.icon} ${escapeHtml(folder.name)} · ` : ''}${f.type.toUpperCase()}<br>
                ${formatDate(f.uploadedAt)}
                ${f.label ? `<br><span class="file-label-tag label-${f.label}" style="margin-top:4px;display:inline-flex;">${getLabelIcon(f.label)} ${capitalizeFirst(f.label)}</span>` : ''}
              </div>
            </div>`;
        }).join('');

        filesGrid.querySelectorAll('[data-id]').forEach(card => {
          card.addEventListener('click', e => {
            if (e.target.closest('.lib-card-actions')) return;
            Viewer.open(card.dataset.id);
          });
        });
        
        filesGrid.querySelectorAll('.lib-del-btn').forEach(btn => {
          btn.addEventListener('click', async e => {
            e.stopPropagation();
            const meta = FileMeta.getById(btn.dataset.id);
            if (meta && await uiConfirm({ title: 'Delete file?', message: `Delete <b>"${escapeHtml(meta.name)}"</b> permanently from this shared workspace?`, confirmText: 'Delete', danger: true })) {
              try {
                await FileManager.deleteFile(btn.dataset.id);
                showToast(`"${meta.name}" deleted from workspace`, 'info');
                renderSpaceDetail();
              } catch (err) {
                console.error('Failed to delete shared file:', err);
                showToast('Failed to delete file: ' + err.message, 'error');
              }
            }
          });
        });
      }
    }
  }

  function initShared() {
    document.querySelectorAll('.shared-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.shared-tab').forEach(t => {
          t.classList.remove('active');
          t.style.color = 'var(--text-3)';
          t.style.borderBottomColor = 'transparent';
        });
        tab.classList.add('active');
        tab.style.color = 'var(--primary)';
        tab.style.borderBottomColor = 'var(--primary)';
        sharedActiveTab = tab.dataset.tab;
        currentSpaceId = null;
        renderSharedView();
      });
    });

    const createModal = document.getElementById('create-space-modal');
    const joinModal = document.getElementById('join-space-modal');

    const openCreate = () => {
      document.getElementById('space-name-input').value = '';
      document.getElementById('space-desc-input').value = '';
      selectedSpaceIcon = '👥';
      document.querySelectorAll('#create-space-modal .icon-swatch').forEach(s => s.classList.toggle('active', s.dataset.icon === selectedSpaceIcon));
      
      const checklist = document.getElementById('space-invite-friends-list');
      if (checklist) {
        const friends = FriendMeta.getAll();
        if (friends.length === 0) {
          checklist.innerHTML = `<div style="font-size:0.75rem;color:var(--text-3);padding:4px;">No friends to invite yet. Add some in the Friends tab!</div>`;
        } else {
          checklist.innerHTML = friends.map((f, idx) => `
            <label style="display:flex;align-items:center;gap:8px;font-size:0.8rem;cursor:pointer;color:var(--text-2);">
              <input type="checkbox" value="${escapeHtml(f.email)}" class="space-invite-friend-checkbox" />
              <span>👤 ${escapeHtml(f.name)} (${escapeHtml(f.email)})</span>
            </label>`).join('');
        }
      }

      createModal.classList.remove('hidden');
    };

    const openJoin = () => {
      document.getElementById('space-code-input').value = '';
      
      const pendingList = document.getElementById('pending-invitations-list');
      if (pendingList) {
        const invitations = FriendMeta.getInvitations();
        if (invitations.length === 0) {
          pendingList.innerHTML = `<div style="font-size:0.78rem;color:var(--text-3);text-align:center;padding:12px;border:1px dashed var(--border);border-radius:var(--r-md);width:100%;">No pending invitations</div>`;
        } else {
          pendingList.innerHTML = invitations.map(inv => `
            <div class="friend-req-item" style="background:var(--surface);width:100%;display:flex;justify-content:space-between;align-items:center;gap:12px;">
              <div style="flex:1;">
                <div style="font-size:0.85rem;font-weight:700;color:var(--text);">${escapeHtml(inv.name)}</div>
                <div style="font-size:0.72rem;color:var(--text-3);">Invited by ${escapeHtml(inv.invitedBy)} (${escapeHtml(inv.email)})</div>
              </div>
              <button class="btn-primary accept-space-inv-btn" data-id="${inv.id}" style="font-size:0.7rem;padding:4px 8px;">Join</button>
            </div>
          `).join('');
          
          pendingList.querySelectorAll('.accept-space-inv-btn').forEach(btn => {
            btn.onclick = () => {
              const invId = btn.dataset.id;
              const inv = invitations.find(i => i.id === invId);
              if (inv) {
                const newSpace = {
                  id: inv.spaceId || ('space-' + Date.now()),
                  name: inv.name,
                  description: inv.description || 'Collaborative group',
                  icon: inv.icon || '👥',
                  members: [
                    { name: 'You', avatar: 'Y' },
                    { name: inv.invitedBy, avatar: inv.invitedBy[0].toUpperCase() }
                  ],
                  code: inv.code || (inv.name.slice(0, 4).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900)),
                  createdAt: new Date().toISOString()
                };
                SharedMeta.save(newSpace);
                FriendMeta.deleteInvitation(invId);
                joinModal.classList.add('hidden');
                showToast(`Joined "${inv.name}"!`, 'success');
                currentSpaceId = newSpace.id;
                renderSharedView();
              }
            };
          });
        }
      }

      joinModal.classList.remove('hidden');
    };

    const addBtn1 = document.getElementById('shared-create-space-btn');
    const addBtn2 = document.getElementById('create-first-space-btn');
    if (addBtn1) addBtn1.onclick = openCreate;
    if (addBtn2) addBtn2.onclick = openCreate;

    const joinBtn = document.getElementById('shared-join-space-btn');
    if (joinBtn) joinBtn.onclick = openJoin;

    document.getElementById('create-space-close').onclick = () => createModal.classList.add('hidden');
    document.getElementById('create-space-cancel').onclick = () => createModal.classList.add('hidden');
    document.getElementById('create-space-confirm').onclick = handleCreateSpace;

    // Backdrop click dismiss for modals
    createModal.addEventListener('click', e => {
      if (e.target === createModal) createModal.classList.add('hidden');
    });
    joinModal.addEventListener('click', e => {
      if (e.target === joinModal) joinModal.classList.add('hidden');
    });

    document.querySelectorAll('#space-icon-picker .icon-swatch').forEach(s => {
      s.addEventListener('click', () => {
        document.querySelectorAll('#space-icon-picker .icon-swatch').forEach(x => x.classList.remove('active'));
        s.classList.add('active');
        selectedSpaceIcon = s.dataset.icon;
      });
    });

    document.getElementById('join-space-close').onclick = () => joinModal.classList.add('hidden');
    document.getElementById('join-space-cancel').onclick = () => joinModal.classList.add('hidden');
    document.getElementById('join-space-confirm').onclick = handleJoinSpace;

    document.getElementById('shared-space-back-btn').onclick = () => {
      currentSpaceId = null;
      currentSharedSubjectId = null;
      renderSharedView();
    };

    document.getElementById('friend-send-request-btn').onclick = handleSendFriendRequest;

    document.getElementById('shared-space-invite-btn').onclick = async () => {
      const space = SharedMeta.getById(currentSpaceId);
      if (!space) return;
      const friends = FriendMeta.getAll().filter(f => !space.members.some(m => m.name === f.name));
      if (friends.length === 0) {
        showToast('All your friends are already in this workspace, or you have no friends added yet!', 'info');
        return;
      }
      // UX: dropdown picker instead of typing an exact name
      const inviteName = await uiChoose({
        title: 'Invite a friend',
        message: `Pick a friend to invite to <b>${escapeHtml(space.name)}</b>:`,
        options: friends.map(f => ({ value: f.name, label: f.name + (f.email ? ` — ${f.email}` : '') })),
        confirmText: 'Send invite'
      });
      if (inviteName) {
        const found = friends.find(f => f.name.toLowerCase() === inviteName.toLowerCase().trim());
        if (found) {
          space.members.push({ name: found.name, avatar: found.avatar || found.name[0].toUpperCase() });
          SharedMeta.save(space);
          showToast(`Invited ${found.name} to this workspace!`, 'success');
          renderSpaceDetail();
        } else {
          showToast('Invalid friend name selected.', 'warning');
        }
      }
    };

    document.getElementById('shared-space-leave-btn').onclick = async () => {
      const space = SharedMeta.getById(currentSpaceId);
      if (space && await uiConfirm({ title: `Leave "${escapeHtml(space.name)}"?`, message: 'You can be re-invited later by a member.', confirmText: 'Leave workspace', danger: true, icon: '🚪' })) {
        try {
          await SharedMeta.delete(currentSpaceId);
          currentSpaceId = null;
          showToast(`Left workspace "${space.name}"`, 'info');
          renderSharedView();
        } catch (err) {
          console.error('Failed to delete/leave space:', err);
          showToast('Failed to leave workspace: ' + err.message, 'error');
        }
      }
    };

    document.getElementById('shared-create-folder-btn').onclick = async () => {
      const folderName = await uiPrompt({ title: 'New folder', label: 'Folder name', placeholder: 'e.g. Semester 5 Notes', confirmText: 'Create' });
      if (folderName && folderName.trim()) {
        const subjects = LS.get('subjects', []);
        const newFolder = {
          id: 'shared-folder-' + Date.now(),
          name: folderName.trim(),
          color: '#8B5CF6',
          icon: '📁',
          spaceId: currentSpaceId
        };
        subjects.push(newFolder);
        LS.set('subjects', subjects);
        showToast(`Folder "${folderName}" created!`, 'success');
        renderSpaceDetail();
      }
    };

    document.getElementById('shared-upload-file-btn').onclick = () => {
      uploadQueue = [];
      renderQueue();
      
      // Refresh options to show current space subjects/folders
      refreshSubjectSelects();
      
      // Auto-select the current active folder if one is clicked/active
      if (currentSharedSubjectId) {
        const select = document.getElementById('upload-subject-select');
        if (select) select.value = currentSharedSubjectId;
      }
      
      document.getElementById('upload-modal').classList.remove('hidden');
    };
  }

  function handleCreateSpace() {
    const name = document.getElementById('space-name-input').value.trim();
    const desc = document.getElementById('space-desc-input').value.trim();
    if (!name) {
      showToast('Workspace name is required', 'warning');
      return;
    }

    const members = [{ name: 'You', avatar: 'Y' }];
    
    document.querySelectorAll('.space-invite-friend-checkbox:checked').forEach(cb => {
      const email = cb.value;
      const friend = FriendMeta.getAll().find(f => f.email === email);
      if (friend) {
        const avatar = friend.avatar || (friend.name ? friend.name[0].toUpperCase() : '👤');
        members.push({ name: friend.name, avatar });
      }
    });

    const newSpace = {
      id: 'space-' + Date.now(),
      name,
      description: desc || 'Collaborative group',
      icon: selectedSpaceIcon,
      members,
      code: name.slice(0, 4).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900),
      createdAt: new Date().toISOString()
    };

    SharedMeta.save(newSpace);
    document.getElementById('create-space-modal').classList.add('hidden');
    showToast(`Shared space "${name}" created successfully!`, 'success');
    currentSpaceId = newSpace.id;
    renderSharedView();
  }

  function handleJoinSpace() {
    const code = document.getElementById('space-code-input').value.trim().toUpperCase();
    if (!code) {
      showToast('Invite code is required', 'warning');
      return;
    }

    if (code === 'DBMS-101' || code === 'AI-NETS' || code === 'JAVA-101') {
      showToast('You are already a member of this workspace!', 'info');
      return;
    }

    const mockName = code.split('-')[0] + ' Collaboration Group';
    const joinedSpace = {
      id: 'space-' + Date.now(),
      name: mockName + ' 🚀',
      description: 'Collaborative study space joined via code: ' + code,
      icon: '🚀',
      members: [
        { name: 'You', avatar: 'Y' },
        { name: 'Friend', avatar: 'F' }
      ],
      code,
      createdAt: new Date().toISOString()
    };

    SharedMeta.save(joinedSpace);
    document.getElementById('join-space-modal').classList.add('hidden');
    showToast(`Joined workspace "${mockName}" via code!`, 'success');
    currentSpaceId = joinedSpace.id;
    renderSharedView();
  }

  function getMyFriendCode() {
    const user = Auth.getCurrentUser();
    if (!user) return 'OFFLINE-0000';
    let hash = 0;
    const str = user.id + user.email;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const codeNum = Math.abs(hash % 9000) + 1000;
    const first = (user.name.split(' ')[0] || 'STUDENT').toUpperCase().replace(/[^A-Z]/g, '');
    return `${first}-${codeNum}`;
  }

  function handleSendFriendRequest() {
    const input = document.getElementById('friend-search-input');
    const val = input.value.trim().toUpperCase();
    if (!val) {
      showToast('Please enter a friend code', 'warning');
      return;
    }

    const match = val.match(/^([A-Z]+)-(\d{4})$/);
    if (!match) {
      showToast('Invalid format. Friend code must be in the format: NAME-1234 (e.g. ALICE-4521)', 'warning');
      return;
    }

    const myCode = getMyFriendCode();
    if (val === myCode) {
      showToast('You cannot add your own friend code!', 'warning');
      return;
    }

    const friends = FriendMeta.getAll();
    if (friends.some(f => (f.code && f.code.toUpperCase() === val) || f.email.toLowerCase() === val.toLowerCase())) {
      showToast('This user is already your friend!', 'info');
      return;
    }

    showToast(`Friend request sent to code ${val}!`, 'success');
    input.value = '';

    setTimeout(() => {
      const parsedName = match[1];
      const newFriend = {
        name: capitalizeFirst(parsedName.toLowerCase()),
        email: parsedName.toLowerCase() + '@examos.com',
        avatar: parsedName.slice(0, 2).toUpperCase(),
        code: val
      };
      FriendMeta.save(newFriend);
      showToast(`🎉 ${newFriend.name} accepted your friend request!`, 'success', 4500);
      if (currentView === 'shared' && !currentSpaceId && sharedActiveTab === 'friends') {
        renderFriendsTab();
      }
    }, 4000);
  }

  let bootstrapped = false;

  async function bootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;

    initTheme();
    initNav();
    initSearch();
    initUpload();
    initSubjectModal();
    initSettings();
    initLibraryControls();
    initShared();

    Viewer.init();
    Workspace.init();
    await Notes.init();
    Pomodoro.init();
    if (typeof CourseStore !== 'undefined' && CourseStore.init) await CourseStore.init();
    if (typeof LearningLogStore !== 'undefined' && LearningLogStore.init) await LearningLogStore.init();
    if (typeof Learning !== 'undefined') Learning.init();

    refreshDashboard();

    // Wire up workspace empty-state picker button
    const wsPicker = document.getElementById('ws-open-picker-btn');
    if (wsPicker) wsPicker.addEventListener('click', () => {
      Workspace.openFile._picker ? Workspace.openFile._picker() : null;
      const addBtn = document.getElementById('ws-add-tab-btn');
      if (addBtn) addBtn.click();
    });

    // Passive Cloud Sync Pull
    if (typeof CloudSync !== 'undefined') {
      const user = Auth.getCurrentUser();
      if (user) {
        CloudSync.updateSyncUI(CloudSync.isEnabled() ? 'synced' : 'disabled', CloudSync.isEnabled() ? 'Synced' : 'Sync Off');
        CloudSync.pull(user).then(() => {
          refreshDashboard();
          renderLibrary();
          if (typeof Notes !== 'undefined' && Notes.load) Notes.load().catch(console.error);
          if (typeof Learning !== 'undefined' && App.getCurrentView() === 'learning') {
            Learning.refresh();
          }
        }).catch(console.error);
      }
    }
  }

  /* ── Bootstrap ───────────────────────────────────────── */
  async function init() {
    // Auth must come first
    Auth.init();

    // Only proceed if user is logged in
    const user = Auth.getCurrentUser();
    if (user) {
      await bootstrap();
    }
  }

  return { 
    navigate, 
    refreshDashboard, 
    renderLibrary, 
    bootstrap, 
    init,
    getCurrentView: () => currentView,
    getCurrentSpaceId: () => currentSpaceId
  };
})();

/* ── Unload & Visibility flush listeners ────────────── */
window.addEventListener('beforeunload', () => {
  if (typeof Learning !== 'undefined' && Learning.pause) Learning.pause();
  if (typeof triggerCloudSync === 'function') triggerCloudSync(true);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    if (typeof Learning !== 'undefined' && Learning.pause) Learning.pause();
    if (typeof triggerCloudSync === 'function') triggerCloudSync(true);
  }
});

/* ── Subject select refresh ─────────────────────────── */
function refreshSubjectSelects() {
  const isShared = (typeof App !== 'undefined' && App.getCurrentView && App.getCurrentView() === 'shared' && App.getCurrentSpaceId());
  const spaceId = isShared ? App.getCurrentSpaceId() : null;
  
  const subjects = LS.get('subjects', []).filter(s => {
    if (isShared) {
      return s.spaceId === spaceId;
    } else {
      return !s.spaceId;
    }
  });

  ['upload-subject-select', 'sched-subject'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    
    // For scheduling subject, we always want personal subjects
    if (id === 'sched-subject') {
      const personalSubjects = LS.get('subjects', []).filter(s => !s.spaceId);
      sel.innerHTML = `<option value="">No subject</option>`;
      personalSubjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id; opt.textContent = `${s.icon} ${s.name}`;
        sel.appendChild(opt);
      });
      if (cur) sel.value = cur;
      return;
    }
    
    sel.innerHTML = isShared ? `<option value="">No folder</option>` : `<option value="">No subject</option>`;
    subjects.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id; opt.textContent = `${s.icon} ${s.name}`;
      sel.appendChild(opt);
    });
    if (cur) sel.value = cur;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init().catch(console.error));
} else {
  App.init().catch(console.error);
}
