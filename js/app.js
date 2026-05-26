/* ═══════════════════════════════════════════════════════
   app.js — SPA Router, Dashboard, Library, Upload,
            Settings. No chatbot. Auth-first.
   ═══════════════════════════════════════════════════════ */

const App = (() => {
  const VIEWS = ['dashboard', 'library', 'notes', 'focus', 'schedule', 'settings'];
  const TITLES = { dashboard:'Dashboard', library:'Library', notes:'Notes', focus:'Focus', schedule:'Schedule', settings:'Settings' };
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
    VIEWS.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle('hidden', v !== view);
    });
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.view === view));
    document.querySelectorAll('.bn-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));
    document.getElementById('topbar-title').textContent = TITLES[view] || view;
    closeSidebar();
    currentView = view;
    if (view === 'dashboard') refreshDashboard();
    if (view === 'library') renderLibrary();
    if (view === 'notes') Notes.refresh();
    if (view === 'schedule') Timetable.init();
    if (view === 'focus') Pomodoro.renderBars();
  }

  /* ── Sidebar mobile ──────────────────────────────────── */
  function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.remove('hidden');
  }

  function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.add('hidden');
  }

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
    const files = FileMeta.getAll();
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
    if (badge) badge.textContent = FileMeta.getAll().length;
  }

  /* ── Subjects ────────────────────────────────────────── */
  function renderSubjects() {
    const subjects = LS.get('subjects', []);
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
      const count = FileMeta.getAll().filter(f => f.subjectId === s.id).length;
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

  function deleteSubject(id) {
    if (!confirm('Delete this subject? Files will remain in your library.')) return;
    const subjects = LS.get('subjects', []).filter(s => s.id !== id);
    LS.set('subjects', subjects);
    renderSubjects();
    refreshSubjectSelects();
    showToast('Subject deleted', 'info');
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

    let allFiles = FileMeta.getAll();
    let subjects = LS.get('subjects', []);

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
      const count = FileMeta.getAll().filter(f => f.subjectId === s.id).length;
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
  function renameSubject(id) {
    const subjects = LS.get('subjects', []);
    const subj = subjects.find(s => s.id === id);
    if (!subj) return;
    const newName = prompt("Rename Subject:", subj.name);
    if (newName && newName.trim()) {
      subj.name = newName.trim();
      LS.set('subjects', subjects);
      showToast("Subject renamed", "success");
      renderLibrary();
      refreshSubjectSelects();
    }
  }

  function toggleSubjectFavorite(id) {
    const subjects = LS.get('subjects', []);
    const subj = subjects.find(s => s.id === id);
    if (!subj) return;
    subj.favorite = !subj.favorite;
    LS.set('subjects', subjects);
    showToast(subj.favorite ? "⭐ Added to Favorites" : "Removed from Favorites", "info");
    renderLibrary();
  }

  function toggleSubjectPin(id) {
    const subjects = LS.get('subjects', []);
    const subj = subjects.find(s => s.id === id);
    if (!subj) return;
    subj.pinned = !subj.pinned;
    LS.set('subjects', subjects);
    showToast(subj.pinned ? "📌 Pinned Subject" : "Unpinned Subject", "info");
    renderLibrary();
  }

  function deleteSubjectInLib(id) {
    if (!confirm('Delete this subject? Files will remain in your library.')) return;
    const subjects = LS.get('subjects', []).filter(s => s.id !== id);
    LS.set('subjects', subjects);
    currentSubjectId = null;
    showToast('Subject deleted', 'info');
    renderLibrary();
    refreshSubjectSelects();
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
  }

  function buildLibCard(f) {
    const color = getFileColor(f.type);
    const subj = (LS.get('subjects', []) || []).find(s => s.id === f.subjectId);
    const isYt = f.type === 'youtube';
    return `
      <div class="lib-card" data-id="${f.id}">
        <div class="lib-card-actions">
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
    if (!meta || !confirm(`Delete "${meta.name}"?`)) return;
    await FileStore.delete(fileId);
    FileMeta.delete(fileId);
    showToast(`"${meta.name}" deleted`, 'info');
    updateBadge();
    if (currentView === 'library') renderLibrary();
    else renderRecentFiles();
    updateStats();
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

    for (const item of uploadQueue) {
      try {
        const id = Date.now().toString() + Math.random().toString(36).slice(2);
        const meta = { id, name: item.name, type: item.type, subjectId, label, pinned: false,
          uploadedAt: new Date().toISOString(), youtubeUrl: item.youtubeUrl || null, youtubeId: item.youtubeId || null, size: item.size || 0 };
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
    showToast(`${count} file${count > 1 ? 's' : ''} uploaded!`, 'success');
    refreshDashboard(); renderLibrary(); updateBadge();
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
      const subjects = LS.get('subjects', []);
      subjects.push({ id: Date.now().toString(), name, color: subjectColor, icon: subjectIcon });
      LS.set('subjects', subjects);
      overlay.classList.add('hidden');
      renderSubjects(); refreshSubjectSelects();
      showToast(`Subject "${name}" created!`, 'success');
    });
  }

  /* ── Settings ────────────────────────────────────────── */
  function initSettings() {
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
      if (!confirm('Permanently delete ALL your data? This cannot be undone.')) return;
      if (!confirm('Are you absolutely sure?')) return;
      await DataPortability.clearAll();
      showToast('All data deleted.', 'info');
      setTimeout(() => location.reload(), 800);
    });

    // Logout buttons
    ['logout-btn', 'logout-settings-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', () => { if (confirm('Sign out?')) Auth.logout(); });
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
    document.getElementById('topbar-menu-btn').addEventListener('click', openSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
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

    Viewer.init();
    await Notes.init();
    Pomodoro.init();

    refreshDashboard();
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

  return { navigate, refreshDashboard, renderLibrary, bootstrap, init };
})();

/* ── Subject select refresh ─────────────────────────── */
function refreshSubjectSelects() {
  const subjects = LS.get('subjects', []);
  ['upload-subject-select', 'sched-subject'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">No subject</option>`;
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
