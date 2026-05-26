/* ═══════════════════════════════════════════════════════
   timetable.js — Weekly schedule + Exam calendar + Targets
   No chatbot dependency.
   ═══════════════════════════════════════════════════════ */

const Timetable = (() => {
  const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const HOURS = ['08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'];

  let schedules = [];
  let exams = [];
  let activeTab = 'timetable';
  let schedType = 'study';

  const el = id => document.getElementById(id);

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    schedules = LS.get('timetable', []);
    exams     = LS.get('exams', []);
    bindTabs();
    renderTimetable();
    bindSchedModal();
    renderTargets();
  }

  /* ── Tabs ─────────────────────────────────────────────── */
  function bindTabs() {
    document.querySelectorAll('.sched-tab[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sched-tab[data-tab]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        ['timetable','exams','targets'].forEach(t => {
          const panel = el(`tab-${t}`);
          if (panel) panel.classList.toggle('hidden', t !== btn.dataset.tab);
        });
        activeTab = btn.dataset.tab;
        if (activeTab === 'exams') renderExams();
        if (activeTab === 'targets') renderTargets();
      });
    });
  }

  /* ── Weekly grid ──────────────────────────────────────── */
  function renderTimetable() {
    const grid = el('weekly-grid');
    if (!grid) return;

    const todayIdx = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1;
    let html = `<div class="wg-header"></div>`;
    DAYS.forEach((d, i) => html += `<div class="wg-header ${i === todayIdx ? 'today' : ''}">${d}</div>`);

    HOURS.forEach(hour => {
      html += `<div class="wg-time">${hour}</div>`;
      DAYS.forEach(day => {
        const blocks = schedules.filter(s => s.day === day && s.startTime === hour);
        const blockHtml = blocks.map(b => {
          const subj = (LS.get('subjects', []) || []).find(s => s.id === b.subjectId);
          const color = subj ? subj.color : '#4F46E5';
          return `<div class="wg-block" style="background:${color}18;color:${color};border-left:2px solid ${color};" data-id="${b.id}">
            <div>${escapeHtml(b.title)}</div>
            <div style="font-weight:400;font-size:0.62rem;opacity:0.8;">${b.startTime}–${b.endTime}</div>
          </div>`;
        }).join('');
        html += `<div class="wg-cell" data-day="${day}" data-hour="${hour}">${blockHtml}</div>`;
      });
    });

    grid.innerHTML = html;

    grid.querySelectorAll('.wg-cell').forEach(cell => {
      cell.addEventListener('click', () => openSchedModal('study', cell.dataset.day, cell.dataset.hour));
    });

    grid.querySelectorAll('.wg-block').forEach(block => {
      block.addEventListener('click', e => { e.stopPropagation(); removeSchedule(block.dataset.id); });
    });
  }

  function removeSchedule(id) {
    if (!confirm('Remove this session?')) return;
    schedules = schedules.filter(s => s.id !== id);
    LS.set('timetable', schedules);
    renderTimetable();
    showToast('Session removed', 'info');
  }

  /* ── Exam calendar ────────────────────────────────────── */
  function renderExams() {
    const grid = el('exam-grid');
    if (!grid) return;

    if (!exams.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><span class="empty-icon">📅</span><h3>No exams scheduled</h3><p>Add exam dates to track your preparation</p></div>`;
      return;
    }

    const now = new Date();
    grid.innerHTML = exams.sort((a, b) => new Date(a.date) - new Date(b.date)).map(exam => {
      const date = new Date(exam.date);
      const days = Math.ceil((date - now) / 86400000);
      const isPast = days < 0;
      const subj = (LS.get('subjects', []) || []).find(s => s.id === exam.subjectId);
      const countdown = isPast ? 'Past' : days === 0 ? 'Today!' : days === 1 ? 'Tomorrow!' : `${days}d left`;

      return `
        <div class="exam-card" ${isPast ? 'style="opacity:0.55;"' : ''}>
          <div class="exam-date">${date.getDate()} ${date.toLocaleString('default', { month: 'short' })}</div>
          <div class="exam-name">${escapeHtml(exam.title)}</div>
          <div class="exam-subject">${subj ? `${subj.icon} ${escapeHtml(subj.name)}` : 'No subject'}</div>
          <div class="countdown-badge">⏰ ${countdown}</div>
          <button class="btn-ghost" data-id="${exam.id}" style="font-size:0.72rem;padding:4px 10px;margin-top:8px;" onclick="Timetable.removeExam(this.dataset.id)">Remove</button>
        </div>`;
    }).join('');
  }

  function removeExam(id) {
    exams = exams.filter(e => e.id !== id);
    LS.set('exams', exams);
    renderExams();
    showToast('Exam removed', 'info');
  }

  /* ── Targets ─────────────────────────────────────────── */
  function renderTargets() {
    const targetHours = LS.get('daily_target', 4);
    const slider = el('target-slider');
    const label = el('target-label');
    if (slider) { slider.value = targetHours; }
    if (label) label.textContent = targetHours;

    // Streak
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

    const totalMins = log.reduce((s, l) => s + (l.minutes || 0), 0);
    const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    set('streak-val', streak);
    set('total-hours-val', Math.round(totalMins / 60));

    // Week bars
    const weekBars = el('week-bars');
    if (weekBars) {
      const todayDow = today.getDay() === 0 ? 6 : today.getDay() - 1;
      weekBars.innerHTML = DAYS.map((label, i) => {
        const d = new Date(today); d.setDate(today.getDate() - todayDow + i);
        const key = d.toISOString().split('T')[0];
        const entry = log.find(l => l.date === key);
        const mins = entry ? (entry.minutes || 0) : 0;
        const pct = Math.min(100, (mins / (targetHours * 60)) * 100);
        return `
          <div class="week-bar-col">
            <div class="week-bar-track">
              <div class="week-bar-fill ${pct >= 100 ? 'done' : ''}" style="height:${pct}%;"></div>
            </div>
            <div class="week-bar-day">${label}</div>
            <div class="week-bar-val">${mins >= 60 ? Math.floor(mins / 60) + 'h' : mins + 'm'}</div>
          </div>`;
      }).join('');
    }

    if (slider) {
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        if (label) label.textContent = v;
        LS.set('daily_target', v);
      });
    }
  }

  /* ── Schedule modal ───────────────────────────────────── */
  function bindSchedModal() {
    el('add-schedule-btn').addEventListener('click', () => openSchedModal('study'));

    // Type tabs
    document.querySelectorAll('.sched-tab[data-stype]').forEach(t => {
      t.addEventListener('click', () => {
        schedType = t.dataset.stype;
        document.querySelectorAll('.sched-tab[data-stype]').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        el('sched-study-fields').classList.toggle('hidden', schedType !== 'study');
        el('sched-exam-fields').classList.toggle('hidden', schedType !== 'exam');
        el('sched-modal-title').textContent = schedType === 'study' ? 'Add study session' : 'Add exam date';
      });
    });

    el('sched-save-btn').addEventListener('click', saveSchedEntry);
    el('sched-cancel-btn').addEventListener('click', closeSchedModal);
    el('sched-modal-close').addEventListener('click', closeSchedModal);
    el('sched-modal').addEventListener('click', e => { if (e.target.id === 'sched-modal') closeSchedModal(); });
  }

  function openSchedModal(type = 'study', day, hour) {
    schedType = type;
    if (day) el('sched-day').value = day;
    if (hour) el('sched-start').value = hour;
    el('sched-title').value = '';
    el('sched-study-fields').classList.toggle('hidden', type !== 'study');
    el('sched-exam-fields').classList.toggle('hidden', type !== 'exam');
    el('sched-modal-title').textContent = type === 'study' ? 'Add study session' : 'Add exam date';
    document.querySelectorAll('.sched-tab[data-stype]').forEach(t => t.classList.toggle('active', t.dataset.stype === type));
    refreshSubjectSelects();
    el('sched-modal').classList.remove('hidden');
  }

  function closeSchedModal() { el('sched-modal').classList.add('hidden'); }

  function saveSchedEntry() {
    const title = el('sched-title').value.trim();
    if (!title) { showToast('Please enter a title', 'warning'); return; }
    const subjectId = el('sched-subject').value;

    if (schedType === 'study') {
      const day = el('sched-day').value;
      const start = el('sched-start').value;
      const end = el('sched-end').value;
      schedules.push({ id: Date.now().toString(), title, day, startTime: start, endTime: end, subjectId });
      LS.set('timetable', schedules);
      renderTimetable();
      showToast('Session added!', 'success');
    } else {
      const date = el('sched-date').value;
      if (!date) { showToast('Please select a date', 'warning'); return; }
      exams.push({ id: Date.now().toString(), title, date, subjectId });
      LS.set('exams', exams);
      renderExams();
      showToast('Exam added!', 'success');
    }
    closeSchedModal();
  }

  return { init, removeExam };
})();
