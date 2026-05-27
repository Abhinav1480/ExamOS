/* ═══════════════════════════════════════════════════════
   storage.js — User-namespaced IndexedDB + LocalStorage
   All data is isolated per user via Auth.getCurrentUser()
   ═══════════════════════════════════════════════════════ */

const DB_NAME = 'ExamOS_v2';
const DB_VERSION = 1;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', { keyPath: 'id' });
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e.target.error);
  });
}

/* ── User prefix ────────────────────────────────────── */
function uid() {
  const user = Auth.getCurrentUser();
  return user ? user.id : 'guest';
}

function ukey(key) { return `examos_${uid()}_${key}`; }

/* ── LocalStorage helper (user-scoped) ──────────────── */
const LS = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem(ukey(key)); return v !== null ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, val) { try { localStorage.setItem(ukey(key), JSON.stringify(val)); } catch (e) { console.warn(e); } },
  remove(key) { localStorage.removeItem(ukey(key)); },
  clearUser() {
    const prefix = `examos_${uid()}_`;
    Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
  }
};

/* ── File blobs in IndexedDB (key includes userId) ──── */
const FileStore = {
  async save(fileObj) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('files', 'readwrite');
      tx.objectStore('files').put({ id: `${uid()}_${fileObj.id}`, data: fileObj.data, userId: uid() });
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  },
  async get(fileId) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(`${uid()}_${fileId}`);
      req.onsuccess = () => resolve(req.result);
      req.onerror = e => reject(e.target.error);
    });
  },
  async delete(fileId) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('files', 'readwrite');
      tx.objectStore('files').delete(`${uid()}_${fileId}`);
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  },
  async clearUser() {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      const req = store.openCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor) { resolve(); return; }
        if (cursor.value.userId === uid()) cursor.delete();
        cursor.continue();
      };
      req.onerror = e => reject(e.target.error);
    });
  }
};

/* ── Notes in IndexedDB (user-scoped IDs) ───────────── */
const NoteStore = {
  async save(note) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('notes', 'readwrite');
      tx.objectStore('notes').put({ ...note, id: `${uid()}_${note.localId}`, userId: uid() });
      tx.oncomplete = () => resolve(note);
      tx.onerror = e => reject(e.target.error);
    });
  },
  async getAll() {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('notes', 'readonly');
      const req = tx.objectStore('notes').getAll();
      req.onsuccess = () => resolve(req.result.filter(n => n.userId === uid()));
      req.onerror = e => reject(e.target.error);
    });
  },
  async delete(localId) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('notes', 'readwrite');
      tx.objectStore('notes').delete(`${uid()}_${localId}`);
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  },
  async clearUser() {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('notes', 'readwrite');
      const store = tx.objectStore('notes');
      const req = store.openCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor) { resolve(); return; }
        if (cursor.value.userId === uid()) cursor.delete();
        cursor.continue();
      };
      req.onerror = e => reject(e.target.error);
    });
  }
};

/* ── File metadata (lightweight, in LocalStorage) ───── */
const FileMeta = {
  getAll() { return LS.get('files_meta', []); },
  getById(id) { return this.getAll().find(f => f.id === id) || null; },
  save(meta) {
    const all = this.getAll().filter(f => f.id !== meta.id);
    all.push(meta);
    LS.set('files_meta', all);
  },
  delete(id) { LS.set('files_meta', this.getAll().filter(f => f.id !== id)); },
  pin(id) {
    const all = this.getAll();
    const f = all.find(f => f.id === id);
    if (f) { f.pinned = !f.pinned; LS.set('files_meta', all); }
    return f?.pinned;
  },
  clear() { LS.set('files_meta', []); }
};

/* ── Data export/import ─────────────────────────────── */
const DataPortability = {
  async export() {
    const notes = await NoteStore.getAll();
    const data = {
      version: 2,
      exportedAt: new Date().toISOString(),
      userId: uid(),
      settings: {
        subjects: LS.get('subjects', []),
        timetable: LS.get('timetable', []),
        exams: LS.get('exams', []),
        bookmarks: LS.get('bookmarks', []),
        dailyTarget: LS.get('daily_target', 4),
        studyLog: LS.get('study_log', []),
        theme: LS.get('theme', 'dark'),
        shared_spaces: LS.get('shared_spaces', []),
        friends: LS.get('friends', []),
        friend_requests: LS.get('friend_requests', []),
        workspace_tabs: LS.get('workspace_tabs', null)
      },
      filesMeta: FileMeta.getAll(),
      notes: notes.map(n => ({ ...n, id: n.localId }))
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `examos_backup_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  },

  async import(jsonStr) {
    const data = JSON.parse(jsonStr);
    const s = data.settings || {};
    if (s.subjects) LS.set('subjects', s.subjects);
    if (s.timetable) LS.set('timetable', s.timetable);
    if (s.exams) LS.set('exams', s.exams);
    if (s.bookmarks) LS.set('bookmarks', s.bookmarks);
    if (s.dailyTarget) LS.set('daily_target', s.dailyTarget);
    if (s.studyLog) LS.set('study_log', s.studyLog);
    if (s.theme) LS.set('theme', s.theme);
    if (s.shared_spaces) LS.set('shared_spaces', s.shared_spaces);
    if (s.friends) LS.set('friends', s.friends);
    if (s.friend_requests) LS.set('friend_requests', s.friend_requests);
    if (s.workspace_tabs) LS.set('workspace_tabs', s.workspace_tabs);
    if (data.filesMeta) LS.set('files_meta', data.filesMeta);
    if (data.notes) {
      for (const note of data.notes) {
        await NoteStore.save({ ...note, localId: note.id || note.localId });
      }
    }
  },

  async clearAll() {
    LS.clearUser();
    await FileStore.clearUser();
    await NoteStore.clearUser();
  }
};

/* ── Shared Spaces metadata ─────────────────────────── */
const SharedMeta = {
  getAll() { return LS.get('shared_spaces', []); },
  getById(id) { return this.getAll().find(s => s.id === id) || null; },
  save(space) {
    const all = this.getAll().filter(s => s.id !== space.id);
    all.push(space);
    LS.set('shared_spaces', all);
  },
  delete(id) {
    LS.set('shared_spaces', this.getAll().filter(s => s.id !== id));
    // Delete folders (subjects) and files associated with this space
    const folders = (LS.get('subjects', []) || []).filter(f => f.spaceId !== id);
    LS.set('subjects', folders);
    const files = FileMeta.getAll().filter(f => f.spaceId !== id);
    LS.set('files_meta', files);
  },
  initDefaults() {
    // Keep it clean - no pre-populated default data
  }
};

/* ── Friends metadata ────────────────────────────────── */
const FriendMeta = {
  getAll() { return LS.get('friends', []); },
  save(friend) {
    const all = this.getAll().filter(f => f.email.toLowerCase() !== friend.email.toLowerCase());
    all.push(friend);
    LS.set('friends', all);
  },
  delete(email) {
    LS.set('friends', this.getAll().filter(f => f.email.toLowerCase() !== email.toLowerCase()));
  },
  getRequests() { return LS.get('friend_requests', []); },
  saveRequest(req) {
    const all = this.getRequests().filter(r => r.email.toLowerCase() !== req.email.toLowerCase());
    all.push(req);
    LS.set('friend_requests', all);
  },
  deleteRequest(email) {
    LS.set('friend_requests', this.getRequests().filter(r => r.email.toLowerCase() !== email.toLowerCase()));
  },
  getInvitations() { return LS.get('space_invitations', []); },
  saveInvitation(inv) {
    const all = this.getInvitations().filter(i => i.id !== inv.id);
    all.push(inv);
    LS.set('space_invitations', all);
  },
  deleteInvitation(id) {
    LS.set('space_invitations', this.getInvitations().filter(i => i.id !== id));
  },
  initDefaults() {
    // Keep it clean - no pre-populated default data
  }
};

/* ── Storage estimate ───────────────────────────────── */
async function estimateStorage() {
  if (navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    return { used: est.usage || 0, quota: est.quota || 0, pct: est.quota ? Math.round((est.usage / est.quota) * 100) : 0 };
  }
  return { used: 0, quota: 0, pct: 0 };
}

function fmtBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

/* ── Global helpers ─────────────────────────────────── */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getFileIcon(type) {
  const m = { pdf:'📄', docx:'📝', doc:'📝', pptx:'📊', ppt:'📊', txt:'📃', image:'🖼️', youtube:'▶️' };
  return m[type] || '📁';
}

function getFileColor(type) {
  const m = { pdf:'#EF4444', docx:'#2563EB', doc:'#2563EB', pptx:'#F59E0B', ppt:'#F59E0B', txt:'#6B7280', image:'#10B981', youtube:'#EF4444' };
  return m[type] || '#6B7280';
}

function getTypeFromFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['doc','docx'].includes(ext)) return 'docx';
  if (['ppt','pptx'].includes(ext)) return 'pptx';
  if (ext === 'txt') return 'txt';
  if (['png','jpg','jpeg','gif','webp','bmp','svg'].includes(ext)) return 'image';
  return 'pdf';
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date(), diff = now - d;
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  return d.toLocaleDateString();
}

function capitalizeFirst(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

function getLabelIcon(label) {
  return { important:'⭐', revision:'🔄', assignment:'📋', exam:'📝' }[label] || '';
}

function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || '';
}

function showToast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toasts');
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// Initialize DB on load
openDB().catch(console.error);
