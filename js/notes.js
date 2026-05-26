/* ═══════════════════════════════════════════════════════
   notes.js — Manual notes editor with labels, auto-save,
   export. No AI/chatbot dependency.
   ═══════════════════════════════════════════════════════ */

const Notes = (() => {
  let allNotes = [];
  let currentId = null;
  let saveTimer = null;

  /* ── Elements ───────────────────────────────────────── */
  const el = id => document.getElementById(id);

  /* ── Load ───────────────────────────────────────────── */
  async function load() {
    const raw = await NoteStore.getAll();
    // NoteStore uses prefixed IDs; expose localId for use
    allNotes = raw.map(n => ({ ...n, localId: n.localId || n.id.replace(`${uid()}_`, '') }));
    renderList();
  }

  /* ── Render list ─────────────────────────────────────── */
  function renderList() {
    const list = el('notes-list');
    const empty = el('notes-list-empty');
    if (!list) return;

    const sorted = [...allNotes].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    if (!sorted.length) {
      list.innerHTML = '';
      list.classList.add('hidden');
      if (empty) empty.classList.remove('hidden');
      return;
    }
    list.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');

    list.innerHTML = sorted.map(n => `
      <div class="note-item ${n.localId === currentId ? 'active' : ''}" data-id="${n.localId}">
        <div class="note-item-title">${escapeHtml(n.title || 'Untitled Note')}</div>
        <div class="note-item-preview">${escapeHtml(stripHtml(n.content || '').substring(0, 55))}</div>
        ${n.label ? `<div class="note-item-label"><span class="file-label-tag label-${n.label}">${getLabelIcon(n.label)} ${capitalizeFirst(n.label)}</span></div>` : ''}
      </div>`).join('');

    list.querySelectorAll('.note-item').forEach(item => {
      item.addEventListener('click', () => openNote(item.dataset.id));
    });
  }

  /* ── Open note ───────────────────────────────────────── */
  function openNote(localId) {
    const note = allNotes.find(n => n.localId === localId);
    if (!note) return;

    currentId = localId;
    el('note-title').value = note.title || '';
    el('note-label').value = note.label || '';
    el('note-content').innerHTML = note.content || '';

    el('notes-editor-empty').classList.add('hidden');
    el('notes-editor-active').classList.remove('hidden');
    el('notes-editor-active').style.display = 'flex';
    renderList();
  }

  /* ── New note ─────────────────────────────────────────── */
  async function newNote() {
    const localId = Date.now().toString();
    const note = {
      localId,
      title: '',
      content: '',
      label: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    allNotes.push(note);
    await NoteStore.save(note);
    openNote(localId);
    el('note-title').focus();
  }

  /* ── Save ────────────────────────────────────────────── */
  async function save() {
    if (!currentId) return;
    const note = allNotes.find(n => n.localId === currentId);
    if (!note) return;

    note.title   = el('note-title').value || '';
    note.label   = el('note-label').value || '';
    note.content = el('note-content').innerHTML || '';
    note.updatedAt = new Date().toISOString();

    await NoteStore.save(note);
    renderList();
  }

  function schedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 1200);
  }

  /* ── Delete ──────────────────────────────────────────── */
  async function deleteNote() {
    if (!currentId || !confirm('Delete this note?')) return;
    await NoteStore.delete(currentId);
    allNotes = allNotes.filter(n => n.localId !== currentId);
    currentId = null;

    el('notes-editor-empty').classList.remove('hidden');
    el('notes-editor-active').classList.add('hidden');
    renderList();
    showToast('Note deleted', 'info');
  }

  /* ── Export ──────────────────────────────────────────── */
  function exportNote() {
    if (!currentId) return;
    const note = allNotes.find(n => n.localId === currentId);
    if (!note) return;

    const content = `${note.title || 'Untitled Note'}\n${'='.repeat(40)}\n${stripHtml(note.content || '')}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${note.title || 'note'}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast('Note exported!', 'success');
  }

  /* ── Bind ────────────────────────────────────────────── */
  function bind() {
    ['new-note-btn', 'new-note-cta'].forEach(id => {
      const e = el(id); if (e) e.addEventListener('click', newNote);
    });

    el('note-title').addEventListener('input', schedSave);
    el('note-content').addEventListener('input', schedSave);
    el('note-label').addEventListener('change', save);
    el('export-note-btn').addEventListener('click', exportNote);
    el('delete-note-btn').addEventListener('click', deleteNote);
  }

  async function init() {
    bind();
    await load();
  }

  function refresh() { load(); }

  return { init, refresh };
})();
