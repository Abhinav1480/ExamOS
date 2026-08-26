/* ═══════════════════════════════════════════════════════
   storage.js — User-namespaced IndexedDB + LocalStorage
   All data is isolated per user via Auth.getCurrentUser()
   Single Source of Truth for Persistent User Data
   ═══════════════════════════════════════════════════════ */

const DB_NAME = 'ExamOS_v2';
const DB_VERSION = 3;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) { resolve(db); return; }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('files')) d.createObjectStore('files', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('courses')) d.createObjectStore('courses', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('learning_logs')) d.createObjectStore('learning_logs', { keyPath: 'id' });
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

function markLocalMutation() {
  try {
    localStorage.setItem(ukey('last_local_mutation'), Date.now().toString());
  } catch (_) {}
}

function getLastLocalMutation() {
  try {
    const val = localStorage.getItem(ukey('last_local_mutation'));
    return val ? parseInt(val, 10) : 0;
  } catch (_) {
    return 0;
  }
}

/* ── LocalStorage helper (user-scoped) ──────────────── */
const LS = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(ukey(key));
      return v !== null ? JSON.parse(v) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(ukey(key), JSON.stringify(val));
      markLocalMutation();
      triggerCloudSync();
    } catch (e) {
      console.warn('LS.set error:', e);
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(ukey(key));
      markLocalMutation();
      triggerCloudSync();
    } catch (e) {
      console.warn('LS.remove error:', e);
    }
  },
  clearUser() {
    const prefix = `examos_${uid()}_`;
    Object.keys(localStorage).filter(k => k.startsWith(prefix)).forEach(k => localStorage.removeItem(k));
    markLocalMutation();
  }
};

/* ── File blobs in IndexedDB (key includes userId) ──── */
const FileStore = {
  async save(fileObj) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('files', 'readwrite');
      tx.objectStore('files').put({ id: `${uid()}_${fileObj.id}`, localId: fileObj.id, data: fileObj.data, userId: uid() });
      tx.oncomplete = () => {
        markLocalMutation();
        resolve();
      };
      tx.onerror = e => reject(e.target.error);
      tx.onabort = e => reject(e.target.error || new Error('Transaction aborted'));
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
      tx.oncomplete = () => {
        markLocalMutation();
        resolve();
      };
      tx.onerror = e => reject(e.target.error);
      tx.onabort = e => reject(e.target.error || new Error('Transaction aborted'));
    });
  },
  async deleteMany(fileIds) {
    if (!Array.isArray(fileIds) || !fileIds.length) return;
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('files', 'readwrite');
      const store = tx.objectStore('files');
      fileIds.forEach(id => store.delete(`${uid()}_${id}`));
      tx.oncomplete = () => {
        markLocalMutation();
        resolve();
      };
      tx.onerror = e => reject(e.target.error);
      tx.onabort = e => reject(e.target.error || new Error('Transaction aborted'));
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
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e.target.error);
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
      tx.oncomplete = () => {
        markLocalMutation();
        triggerCloudSync();
        resolve(note);
      };
      tx.onerror = e => reject(e.target.error);
      tx.onabort = e => reject(e.target.error || new Error('Transaction aborted'));
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
      tx.oncomplete = () => {
        markLocalMutation();
        triggerCloudSync(true);
        resolve();
      };
      tx.onerror = e => reject(e.target.error);
      tx.onabort = e => reject(e.target.error || new Error('Transaction aborted'));
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
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  }
};

/* ── File metadata (in LocalStorage, synchronized) ──── */
const FileMeta = {
  getAll() {
    return LS.get('files_meta', []);
  },
  getById(id) {
    return this.getAll().find(f => f.id === id) || null;
  },
  save(meta) {
    const all = this.getAll().filter(f => f.id !== meta.id);
    all.push(meta);
    LS.set('files_meta', all);
  },
  delete(id) {
    LS.set('files_meta', this.getAll().filter(f => f.id !== id));
  },
  deleteMany(ids) {
    if (!Array.isArray(ids) || !ids.length) return;
    const idSet = new Set(ids);
    LS.set('files_meta', this.getAll().filter(f => !idSet.has(f.id)));
  },
  deleteBySubject(subjectId) {
    LS.set('files_meta', this.getAll().filter(f => f.subjectId !== subjectId));
  },
  pin(id) {
    const all = this.getAll();
    const f = all.find(f => f.id === id);
    if (f) { f.pinned = !f.pinned; LS.set('files_meta', all); }
    return f?.pinned;
  },
  clear() {
    LS.set('files_meta', []);
  }
};

/* ── Persistent Courses in IndexedDB ─────────────────── */
const CourseDB = {
  async save(course) {
    if (!course || !course.id) return;
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('courses', 'readwrite');
      tx.objectStore('courses').put({ ...course, id: `${uid()}_${course.id}`, localId: course.id, userId: uid() });
      tx.oncomplete = () => {
        markLocalMutation();
        resolve();
      };
      tx.onerror = e => reject(e.target.error);
      tx.onabort = e => reject(e.target.error || new Error('Transaction aborted'));
    });
  },
  async saveAll(courses) {
    if (!Array.isArray(courses) || !courses.length) return;
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('courses', 'readwrite');
      const store = tx.objectStore('courses');
      courses.forEach(c => {
        if (c && c.id) store.put({ ...c, id: `${uid()}_${c.id}`, localId: c.id, userId: uid() });
      });
      tx.oncomplete = () => {
        markLocalMutation();
        resolve();
      };
      tx.onerror = e => reject(e.target.error);
      tx.onabort = e => reject(e.target.error || new Error('Transaction aborted'));
    });
  },
  async getAll() {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('courses', 'readonly');
      const req = tx.objectStore('courses').getAll();
      req.onsuccess = () => {
        const results = (req.result || [])
          .filter(c => c.userId === uid())
          .map(c => ({
            ...c,
            id: c.localId || (typeof c.id === 'string' && c.id.startsWith(`${uid()}_`) ? c.id.slice(uid().length + 1) : c.id)
          }));
        resolve(results);
      };
      req.onerror = e => reject(e.target.error);
    });
  },
  async delete(courseId) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('courses', 'readwrite');
      tx.objectStore('courses').delete(`${uid()}_${courseId}`);
      tx.oncomplete = () => {
        markLocalMutation();
        resolve();
      };
      tx.onerror = e => reject(e.target.error);
      tx.onabort = e => reject(e.target.error || new Error('Transaction aborted'));
    });
  },
  async clearUser() {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('courses', 'readwrite');
      const store = tx.objectStore('courses');
      const req = store.openCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor) { resolve(); return; }
        if (cursor.value.userId === uid()) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  }
};

/* ── Persistent Learning Activity Logs in IndexedDB ─── */
const LearningLogDB = {
  async save(log) {
    if (!log || !log.courseId) return;
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('learning_logs', 'readwrite');
      const logId = `${uid()}_${log.date}_${log.courseId}`;
      tx.objectStore('learning_logs').put({ ...log, id: logId, userId: uid() });
      tx.oncomplete = () => {
        markLocalMutation();
        resolve();
      };
      tx.onerror = e => reject(e.target.error);
      tx.onabort = e => reject(e.target.error || new Error('Transaction aborted'));
    });
  },
  async saveAll(logs) {
    if (!Array.isArray(logs) || !logs.length) return;
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('learning_logs', 'readwrite');
      const store = tx.objectStore('learning_logs');
      logs.forEach(l => {
        if (l && l.courseId) {
          const logId = `${uid()}_${l.date}_${l.courseId}`;
          store.put({ ...l, id: logId, userId: uid() });
        }
      });
      tx.oncomplete = () => {
        markLocalMutation();
        resolve();
      };
      tx.onerror = e => reject(e.target.error);
      tx.onabort = e => reject(e.target.error || new Error('Transaction aborted'));
    });
  },
  async getAll() {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('learning_logs', 'readonly');
      const req = tx.objectStore('learning_logs').getAll();
      req.onsuccess = () => resolve((req.result || []).filter(l => l.userId === uid()));
      req.onerror = e => reject(e.target.error);
    });
  },
  async deleteForCourse(courseId) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('learning_logs', 'readwrite');
      const store = tx.objectStore('learning_logs');
      const req = store.openCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor) { resolve(); return; }
        if (cursor.value.userId === uid() && cursor.value.courseId === courseId) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => {
        markLocalMutation();
        resolve();
      };
      tx.onerror = e => reject(e.target.error);
      tx.onabort = e => reject(e.target.error || new Error('Transaction aborted'));
    });
  },
  async clearUser() {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction('learning_logs', 'readwrite');
      const store = tx.objectStore('learning_logs');
      const req = store.openCursor();
      req.onsuccess = e => {
        const cursor = e.target.result;
        if (!cursor) { resolve(); return; }
        if (cursor.value.userId === uid()) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = e => reject(e.target.error);
    });
  }
};

/* ── Courses & Learning Tracker metadata ─────────────── */
const CourseStore = {
  getAll() {
    const raw = LS.get('courses', null);
    if (Array.isArray(raw)) return raw;
    return [];
  },
  getById(id) {
    return this.getAll().find(c => c.id === id) || null;
  },
  async save(course) {
    if (!course || !course.id) return;
    const all = this.getAll().filter(c => c.id !== course.id);
    all.push(course);
    LS.set('courses', all);
    try { localStorage.setItem(ukey('courses_backup'), JSON.stringify(all)); } catch (_) {}
    await CourseDB.save(course).catch(console.warn);
  },
  async saveAll(courses) {
    if (!Array.isArray(courses)) return;
    LS.set('courses', courses);
    try { localStorage.setItem(ukey('courses_backup'), JSON.stringify(courses)); } catch (_) {}
    await CourseDB.saveAll(courses).catch(console.warn);
  },
  async delete(id) {
    const remaining = this.getAll().filter(c => c.id !== id);
    LS.set('courses', remaining);
    try { localStorage.setItem(ukey('courses_backup'), JSON.stringify(remaining)); } catch (_) {}
    await CourseDB.delete(id).catch(console.warn);
    await LearningLogStore.deleteForCourse(id);
    markLocalMutation();
    triggerCloudSync(true);
  },
  updatePosition(id, position, furthest = null, skipCloudSync = false) {
    const all = this.getAll();
    const c = all.find(item => item.id === id);
    if (c) {
      c.playbackPosition = position;
      if (furthest !== null) {
        c.furthestPosition = Math.max(c.furthestPosition || 0, furthest);
      } else {
        c.furthestPosition = Math.max(c.furthestPosition || 0, position);
      }
      c.lastWatchedAt = new Date().toISOString();
      if (skipCloudSync) {
        try {
          localStorage.setItem(ukey('courses'), JSON.stringify(all));
          localStorage.setItem(ukey('courses_backup'), JSON.stringify(all));
        } catch (_) {}
      } else {
        LS.set('courses', all);
        try { localStorage.setItem(ukey('courses_backup'), JSON.stringify(all)); } catch (_) {}
      }
      CourseDB.save(c).catch(console.warn);
    }
  },
  async init() {
    try {
      const stored = LS.get('courses', null);
      if (stored !== null && Array.isArray(stored)) {
        // LocalStorage is initialized and authoritative. Keep CourseDB in sync.
        return;
      }
      // If LocalStorage was never set, try hydrating from IndexedDB
      const dbCourses = await CourseDB.getAll();
      if (dbCourses && dbCourses.length > 0) {
        LS.set('courses', dbCourses);
        try { localStorage.setItem(ukey('courses_backup'), JSON.stringify(dbCourses)); } catch (_) {}
      } else {
        LS.set('courses', []);
      }
    } catch (e) {
      console.warn("CourseStore.init error:", e);
    }
  }
};

/* ── Daily Learning Activity Logs ───────────────────── */
const LearningLogStore = {
  getAll() { return LS.get('learning_logs', []); },
  getForToday() {
    const today = new Date().toISOString().slice(0, 10);
    return this.getAll().filter(l => l.date === today);
  },
  getTodaySecondsForCourse(courseId) {
    const today = new Date().toISOString().slice(0, 10);
    const entry = this.getAll().find(l => l.date === today && l.courseId === courseId);
    return entry ? entry.secondsWatched || 0 : 0;
  },
  getTodayTotalSeconds() {
    return this.getForToday().reduce((sum, l) => sum + (l.secondsWatched || 0), 0);
  },
  addWatchSeconds(courseId, seconds, skipCloudSync = false) {
    if (!seconds || seconds <= 0) return;
    const today = new Date().toISOString().slice(0, 10);
    const all = this.getAll();
    let entry = all.find(l => l.date === today && l.courseId === courseId);
    if (entry) {
      entry.secondsWatched = (entry.secondsWatched || 0) + seconds;
      entry.lastUpdated = new Date().toISOString();
    } else {
      entry = {
        date: today,
        courseId,
        secondsWatched: seconds,
        lastUpdated: new Date().toISOString()
      };
      all.push(entry);
    }
    if (skipCloudSync) {
      try { localStorage.setItem(ukey('learning_logs'), JSON.stringify(all)); } catch (_) {}
    } else {
      LS.set('learning_logs', all);
    }
    LearningLogDB.save(entry).catch(console.warn);
  },
  async deleteForCourse(courseId) {
    LS.set('learning_logs', this.getAll().filter(l => l.courseId !== courseId));
    await LearningLogDB.deleteForCourse(courseId).catch(console.warn);
    markLocalMutation();
  },
  async init() {
    try {
      const stored = LS.get('learning_logs', null);
      if (stored !== null && Array.isArray(stored)) {
        return;
      }
      const dbLogs = await LearningLogDB.getAll();
      if (dbLogs && dbLogs.length > 0) {
        LS.set('learning_logs', dbLogs);
      } else {
        LS.set('learning_logs', []);
      }
    } catch (e) {
      console.warn("LearningLogStore.init error:", e);
    }
  }
};

/* ── Centralized Subject Store with Cascade Deletion ─── */
const SubjectStore = {
  getAll() {
    return LS.get('subjects', []) || [];
  },
  getPersonal() {
    return this.getAll().filter(s => !s.spaceId);
  },
  getById(id) {
    return this.getAll().find(s => s.id === id) || null;
  },
  save(subject) {
    const all = this.getAll().filter(s => s.id !== subject.id);
    all.push(subject);
    LS.set('subjects', all);
    markLocalMutation();
    triggerCloudSync(true);
  },
  rename(id, newName) {
    const all = this.getAll();
    const s = all.find(sub => sub.id === id);
    if (!s) return false;
    s.name = newName;
    LS.set('subjects', all);
    markLocalMutation();
    triggerCloudSync(true);
    return true;
  },
  toggleFavorite(id) {
    const all = this.getAll();
    const s = all.find(sub => sub.id === id);
    if (!s) return false;
    s.favorite = !s.favorite;
    LS.set('subjects', all);
    markLocalMutation();
    triggerCloudSync(true);
    return s.favorite;
  },
  togglePin(id) {
    const all = this.getAll();
    const s = all.find(sub => sub.id === id);
    if (!s) return false;
    s.pinned = !s.pinned;
    LS.set('subjects', all);
    markLocalMutation();
    triggerCloudSync(true);
    return s.pinned;
  },
  async delete(id, cascadeFiles = true) {
    // 1. Remove subject from subjects list
    const remainingSubjects = this.getAll().filter(s => s.id !== id);
    LS.set('subjects', remainingSubjects);

    // 2. Cascade delete files if required
    if (cascadeFiles) {
      const subjectFiles = FileMeta.getAll().filter(f => f.subjectId === id && !f.spaceId);
      if (subjectFiles.length > 0) {
        const fileIds = subjectFiles.map(f => f.id);
        await FileManager.deleteFiles(fileIds, false);
      }
    }

    // 3. Remove subject association from timetable
    const timetable = (LS.get('timetable', []) || []).map(t => {
      if (t.subjectId === id) return { ...t, subjectId: '' };
      return t;
    });
    LS.set('timetable', timetable);

    // 4. Remove subject association from exams
    const exams = (LS.get('exams', []) || []).map(e => {
      if (e.subjectId === id) return { ...e, subjectId: '' };
      return e;
    });
    LS.set('exams', exams);

    markLocalMutation();
    triggerCloudSync(true);
  }
};

/* ── Centralized File Manager with Atomic Deletion ───── */
const FileManager = {
  async deleteFile(fileId, syncImmediately = true) {
    if (!fileId) return;

    // 1. Delete binary blob from IndexedDB
    await FileStore.delete(fileId);

    // 2. Delete file metadata from LocalStorage
    FileMeta.delete(fileId);

    // 3. Close & remove tab from Workspace if currently open
    if (typeof Workspace !== 'undefined' && Workspace.removeFile) {
      Workspace.removeFile(fileId);
    }

    // 4. Close Viewer modal if this file is currently open
    if (typeof Viewer !== 'undefined') {
      if (typeof Viewer.getCurrentFileId === 'function' && Viewer.getCurrentFileId() === fileId) {
        Viewer.close();
      }
    }

    // 5. Remove bookmarks for this file
    const bookmarks = (LS.get('bookmarks', []) || []).filter(b => b.fileId !== fileId);
    LS.set('bookmarks', bookmarks);

    // 6. Remove cached scroll position
    try {
      localStorage.removeItem(ukey('scroll_' + fileId));
    } catch (_) {}

    markLocalMutation();
    if (syncImmediately) {
      triggerCloudSync(true);
    }
  },

  async deleteFiles(fileIds, syncImmediately = true) {
    if (!Array.isArray(fileIds) || !fileIds.length) return;

    // 1. Delete binary blobs in batch from IndexedDB
    await FileStore.deleteMany(fileIds);

    // 2. Delete metadata in batch from LocalStorage
    FileMeta.deleteMany(fileIds);

    // 3. Remove all tabs from Workspace
    if (typeof Workspace !== 'undefined' && Workspace.removeFiles) {
      Workspace.removeFiles(fileIds);
    }

    // 4. Close Viewer modal if viewing any deleted file
    if (typeof Viewer !== 'undefined') {
      if (typeof Viewer.getCurrentFileId === 'function' && fileIds.includes(Viewer.getCurrentFileId())) {
        Viewer.close();
      }
    }

    // 5. Remove bookmarks for all deleted files
    const fileIdSet = new Set(fileIds);
    const bookmarks = (LS.get('bookmarks', []) || []).filter(b => !fileIdSet.has(b.fileId));
    LS.set('bookmarks', bookmarks);

    // 6. Remove cached scroll positions
    fileIds.forEach(id => {
      try { localStorage.removeItem(ukey('scroll_' + id)); } catch (_) {}
    });

    markLocalMutation();
    if (syncImmediately) {
      triggerCloudSync(true);
    }
  }
};

/* ── Guest to User Data Migration ───────────────────── */
const StorageMigrate = {
  migrateGuestData(userId) {
    if (!userId || userId === 'guest') return;
    try {
      const guestPrefix = 'examos_guest_';
      const userPrefix = `examos_${userId}_`;
      
      const guestCourses = JSON.parse(localStorage.getItem(`${guestPrefix}courses`) || '[]');
      if (guestCourses && guestCourses.length > 0) {
        const userCourses = JSON.parse(localStorage.getItem(`${userPrefix}courses`) || '[]');
        const merged = [...userCourses];
        guestCourses.forEach(gc => {
          if (!merged.some(c => c.id === gc.id)) merged.push(gc);
        });
        localStorage.setItem(`${userPrefix}courses`, JSON.stringify(merged));
        localStorage.setItem(`${userPrefix}courses_backup`, JSON.stringify(merged));
        localStorage.removeItem(`${guestPrefix}courses`);
        localStorage.removeItem(`${guestPrefix}courses_backup`);
      }

      const guestLogs = JSON.parse(localStorage.getItem(`${guestPrefix}learning_logs`) || '[]');
      if (guestLogs && guestLogs.length > 0) {
        const userLogs = JSON.parse(localStorage.getItem(`${userPrefix}learning_logs`) || '[]');
        const mergedLogs = [...userLogs];
        guestLogs.forEach(gl => {
          const idx = mergedLogs.findIndex(l => l.date === gl.date && l.courseId === gl.courseId);
          if (idx === -1) mergedLogs.push(gl);
          else mergedLogs[idx].secondsWatched = Math.max(mergedLogs[idx].secondsWatched || 0, gl.secondsWatched || 0);
        });
        localStorage.setItem(`${userPrefix}learning_logs`, JSON.stringify(mergedLogs));
        localStorage.removeItem(`${guestPrefix}learning_logs`);
      }
    } catch (e) {
      console.warn("Guest data migration error:", e);
    }
  }
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
        workspace_tabs: LS.get('workspace_tabs', null),
        courses: CourseStore.getAll(),
        learning_logs: LearningLogStore.getAll()
      },
      filesMeta: FileMeta.getAll(),
      notes: notes.map(n => ({ ...n, id: n.localId || n.id }))
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
    if (s.courses && Array.isArray(s.courses)) {
      await CourseStore.saveAll(s.courses);
    }
    if (s.learning_logs && Array.isArray(s.learning_logs)) {
      LS.set('learning_logs', s.learning_logs);
      await LearningLogDB.saveAll(s.learning_logs).catch(console.warn);
    }
    if (data.filesMeta) LS.set('files_meta', data.filesMeta);
    if (data.notes) {
      for (const note of data.notes) {
        await NoteStore.save({ ...note, localId: note.id || note.localId });
      }
    }
    markLocalMutation();
    triggerCloudSync(true);
  },

  async clearAll() {
    LS.clearUser();
    await FileStore.clearUser();
    await NoteStore.clearUser();
    await CourseDB.clearUser();
    await LearningLogDB.clearUser();
    markLocalMutation();
    triggerCloudSync(true);
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
    markLocalMutation();
    triggerCloudSync(true);
  },
  async delete(id) {
    // 1. Remove space
    LS.set('shared_spaces', this.getAll().filter(s => s.id !== id));

    // 2. Cascade delete space files from IndexedDB and LocalStorage
    const spaceFiles = FileMeta.getAll().filter(f => f.spaceId === id);
    if (spaceFiles.length > 0) {
      const fileIds = spaceFiles.map(f => f.id);
      await FileManager.deleteFiles(fileIds, false);
    }

    // 3. Delete folders (subjects) associated with this space
    const folders = (LS.get('subjects', []) || []).filter(f => f.spaceId !== id);
    LS.set('subjects', folders);

    markLocalMutation();
    triggerCloudSync(true);
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
    markLocalMutation();
    triggerCloudSync(true);
  },
  delete(email) {
    LS.set('friends', this.getAll().filter(f => f.email.toLowerCase() !== email.toLowerCase()));
    markLocalMutation();
    triggerCloudSync(true);
  },
  getRequests() { return LS.get('friend_requests', []); },
  saveRequest(req) {
    const all = this.getRequests().filter(r => r.email.toLowerCase() !== req.email.toLowerCase());
    all.push(req);
    LS.set('friend_requests', all);
    markLocalMutation();
    triggerCloudSync(true);
  },
  deleteRequest(email) {
    LS.set('friend_requests', this.getRequests().filter(r => r.email.toLowerCase() !== email.toLowerCase()));
    markLocalMutation();
    triggerCloudSync(true);
  },
  getInvitations() { return LS.get('space_invitations', []); },
  saveInvitation(inv) {
    const all = this.getInvitations().filter(i => i.id !== inv.id);
    all.push(inv);
    LS.set('space_invitations', all);
    markLocalMutation();
    triggerCloudSync(true);
  },
  deleteInvitation(id) {
    LS.set('space_invitations', this.getInvitations().filter(i => i.id !== id));
    markLocalMutation();
    triggerCloudSync(true);
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
  if (!container) return;
  const icons = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  while (container.children.length >= 4) container.firstElementChild.remove();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML = `<span class="toast-icon">${icons[type]||'ℹ️'}</span><span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// Initialize DB on load
openDB().catch(console.error);

/* ── Cloud Sync & Encryption Manager (Multi-Device) ── */
const CLOUD_DATA_BUCKET = 'examos_v2_data_bucket_8392';

function encryptPayload(plaintext, key) {
  const S = [];
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key.charCodeAt(i % key.length)) % 256;
    const temp = S[i]; S[i] = S[j]; S[j] = temp;
  }
  let i = 0;
  j = 0;
  let ciphertext = '';
  for (let k = 0; k < plaintext.length; k++) {
    i = (i + 1) % 256;
    j = (j + S[i]) % 256;
    const temp = S[i]; S[i] = S[j]; S[j] = temp;
    const K = S[(S[i] + S[j]) % 256];
    ciphertext += String.fromCharCode(plaintext.charCodeAt(k) ^ K);
  }
  return btoa(unescape(encodeURIComponent(ciphertext)));
}

function decryptPayload(ciphertextBase64, key) {
  const ciphertext = decodeURIComponent(escape(atob(ciphertextBase64)));
  const S = [];
  for (let i = 0; i < 256; i++) S[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key.charCodeAt(i % key.length)) % 256;
    const temp = S[i]; S[i] = S[j]; S[j] = temp;
  }
  let i = 0;
  j = 0;
  let plaintext = '';
  for (let k = 0; k < ciphertext.length; k++) {
    i = (i + 1) % 256;
    j = (j + S[i]) % 256;
    const temp = S[i]; S[i] = S[j]; S[j] = temp;
    const K = S[(S[i] + S[j]) % 256];
    plaintext += String.fromCharCode(ciphertext.charCodeAt(k) ^ K);
  }
  return plaintext;
}

const CloudSync = {
  isEnabled() {
    const user = Auth.getCurrentUser();
    if (!user) return false;
    return localStorage.getItem(`examos_${user.id}_cloud_sync_enabled`) !== 'false';
  },

  setEnabled(val) {
    const user = Auth.getCurrentUser();
    if (!user) return;
    localStorage.setItem(`examos_${user.id}_cloud_sync_enabled`, val ? 'true' : 'false');
    if (val) this.push().catch(console.error);
  },

  getLastSync() {
    const user = Auth.getCurrentUser();
    if (!user) return null;
    return localStorage.getItem(`examos_${user.id}_last_sync`) || null;
  },

  updateSyncUI(status, message = '') {
    const pill = document.getElementById('cloud-sync-pill');
    if (!pill) return;
    pill.className = `cloud-sync-pill ${status}`;
    const text = pill.querySelector('.sync-text');
    if (text) text.textContent = message || (status === 'synced' ? 'Synced' : status === 'syncing' ? 'Syncing...' : 'Sync Enabled');
  },

  async push() {
    const user = Auth.getCurrentUser();
    if (!user || !this.isEnabled()) return;

    this.updateSyncUI('syncing');

    try {
      const notes = await NoteStore.getAll();
      const syncTimestamp = new Date().toISOString();
      const syncPayload = {
        version: 2,
        syncedAt: syncTimestamp,
        userId: user.id,
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
          workspace_tabs: LS.get('workspace_tabs', null),
          courses: CourseStore.getAll(),
          learning_logs: LearningLogStore.getAll()
        },
        filesMeta: FileMeta.getAll(),
        notes: notes.map(n => ({ ...n, id: n.localId || n.id }))
      };

      const encrypted = encryptPayload(JSON.stringify(syncPayload), user.id);
      const emailHash = await Auth.hashPassword(user.email);

      const res = await fetch(`https://mantledb.sh/v2/examos_data_v2/${emailHash}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: encrypted, syncedAt: syncTimestamp })
      });

      if (!res.ok) throw new Error('Cloud storage returned ' + res.status);

      localStorage.setItem(`examos_${user.id}_last_sync`, syncTimestamp);
      this.updateSyncUI('synced');
      
      const lastSyncLabel = document.getElementById('settings-last-sync');
      if (lastSyncLabel) {
        lastSyncLabel.textContent = `Last synced: ${new Date(syncTimestamp).toLocaleString()}`;
      }
    } catch (e) {
      console.warn("Could not sync data to cloud:", e);
      this.updateSyncUI('error', 'Sync Failed');
    }
  },

  async pull(user) {
    if (!user) user = Auth.getCurrentUser();
    if (!user || !this.isEnabled()) return;

    // Check if this device has active local data/mutations
    const hasLocalSubjects = (LS.get('subjects', null) !== null);
    const hasLocalFiles = (LS.get('files_meta', null) !== null);
    const hasLocalCourses = (LS.get('courses', null) !== null);
    const hasLocalData = hasLocalSubjects || hasLocalFiles || hasLocalCourses;
    const lastLocalMutation = getLastLocalMutation();
    const lastSyncTime = this.getLastSync() ? new Date(this.getLastSync()).getTime() : 0;

    // If local has mutations newer than last sync, do not pull from stale cloud! Push instead.
    if (hasLocalData && lastLocalMutation > lastSyncTime) {
      console.log("Local workspace has newer modifications. Pushing authoritative state to cloud.");
      await this.push();
      return;
    }

    this.updateSyncUI('syncing');

    try {
      const emailHash = await Auth.hashPassword(user.email);
      const res = await fetch(`https://mantledb.sh/v2/examos_data_v2/${emailHash}`);
      if (res.status === 404) {
        console.log("No cloud sync backup found for this user.");
        this.updateSyncUI('synced', 'Synced');
        return;
      }
      if (!res.ok) throw new Error('Cloud storage returned ' + res.status);

      const wrapper = await res.json();
      if (!wrapper || !wrapper.data) return;

      const cloudSyncTime = wrapper.syncedAt ? new Date(wrapper.syncedAt).getTime() : 0;

      // If this device already has local data and cloud isn't newer, keep local state
      if (hasLocalData && cloudSyncTime <= lastSyncTime) {
        this.updateSyncUI('synced');
        return;
      }

      const decryptedStr = decryptPayload(wrapper.data, user.id);
      const payload = JSON.parse(decryptedStr);

      if (payload && payload.settings) {
        const s = payload.settings;
        
        // Authoritative clean restore from cloud on initial device load
        if (s.courses && Array.isArray(s.courses)) {
          await CourseStore.saveAll(s.courses);
        } else if (!hasLocalCourses) {
          LS.set('courses', []);
        }

        if (s.learning_logs && Array.isArray(s.learning_logs)) {
          LS.set('learning_logs', s.learning_logs);
          await LearningLogDB.saveAll(s.learning_logs).catch(console.warn);
        } else if (!hasLocalData) {
          LS.set('learning_logs', []);
        }

        if (s.subjects && Array.isArray(s.subjects)) {
          localStorage.setItem(`examos_${user.id}_subjects`, JSON.stringify(s.subjects));
        } else if (!hasLocalSubjects) {
          LS.set('subjects', []);
        }

        if (s.timetable && Array.isArray(s.timetable)) {
          localStorage.setItem(`examos_${user.id}_timetable`, JSON.stringify(s.timetable));
        }
        if (s.exams && Array.isArray(s.exams)) {
          localStorage.setItem(`examos_${user.id}_exams`, JSON.stringify(s.exams));
        }
        if (s.bookmarks && Array.isArray(s.bookmarks)) {
          localStorage.setItem(`examos_${user.id}_bookmarks`, JSON.stringify(s.bookmarks));
        }
        if (s.dailyTarget) localStorage.setItem(`examos_${user.id}_daily_target`, JSON.stringify(s.dailyTarget));
        if (s.studyLog && Array.isArray(s.studyLog)) {
          localStorage.setItem(`examos_${user.id}_study_log`, JSON.stringify(s.studyLog));
        }
        if (s.theme) localStorage.setItem(`examos_${user.id}_theme`, JSON.stringify(s.theme));
        if (s.shared_spaces && Array.isArray(s.shared_spaces)) {
          localStorage.setItem(`examos_${user.id}_shared_spaces`, JSON.stringify(s.shared_spaces));
        }
        if (s.friends && Array.isArray(s.friends)) {
          localStorage.setItem(`examos_${user.id}_friends`, JSON.stringify(s.friends));
        }
        if (s.friend_requests && Array.isArray(s.friend_requests)) {
          localStorage.setItem(`examos_${user.id}_friend_requests`, JSON.stringify(s.friend_requests));
        }
        if (s.workspace_tabs) localStorage.setItem(`examos_${user.id}_workspace_tabs`, JSON.stringify(s.workspace_tabs));

        if (payload.filesMeta && Array.isArray(payload.filesMeta)) {
          localStorage.setItem(`examos_${user.id}_files_meta`, JSON.stringify(payload.filesMeta));
        } else if (!hasLocalFiles) {
          LS.set('files_meta', []);
        }

        if (payload.notes && payload.notes.length) {
          for (const note of payload.notes) {
            await NoteStore.save({ ...note, localId: note.id || note.localId });
          }
        }

        localStorage.setItem(`examos_${user.id}_last_sync`, wrapper.syncedAt || new Date().toISOString());
        this.updateSyncUI('synced');
        console.log("Workspace state loaded from cloud!");
      }
    } catch (e) {
      console.warn("Could not pull data from cloud:", e);
      this.updateSyncUI('error', 'Pull Failed');
    }
  }
};

let syncTimeout = null;
let lastSyncPushTime = 0;
const SYNC_THROTTLE_MS = 15000;

function triggerCloudSync(immediate = false) {
  if (immediate) {
    if (syncTimeout) { clearTimeout(syncTimeout); syncTimeout = null; }
    if (typeof CloudSync !== 'undefined') CloudSync.push().catch(console.error);
    lastSyncPushTime = Date.now();
    return;
  }
  
  const now = Date.now();
  if (now - lastSyncPushTime > SYNC_THROTTLE_MS) {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      lastSyncPushTime = Date.now();
      if (typeof CloudSync !== 'undefined') CloudSync.push().catch(console.error);
    }, 1200);
  } else {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      lastSyncPushTime = Date.now();
      if (typeof CloudSync !== 'undefined') CloudSync.push().catch(console.error);
    }, 3000);
  }
}
