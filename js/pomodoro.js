/* ═══════════════════════════════════════════════════════
   pomodoro.js — Deep Work Focus Studio, Timer, Zen Fullscreen,
   Guided Breathing Coach, Fleeting Thoughts, and Micro-Goals.
   ═══════════════════════════════════════════════════════ */

const Pomodoro = (() => {
  const CIRCUMFERENCE = 553; // 2 * π * 88

  let mode = 'pomodoro';
  let focusMins = 25;
  let breakMins = 5;
  let longBreakMins = 15;
  let timeLeft = 25 * 60;
  let totalDuration = 25 * 60;
  let isRunning = false;
  let interval = null;
  let sessionsToday = 0;
  let audioCtx = null;
  let isZenMode = false;

  // Breathing Coach State
  let breathingActive = true;
  let breathingPhase = 'inhale'; // 'inhale', 'hold1', 'exhale', 'hold2'
  let breathingTimer = null;
  let breathingSecondsLeft = 4;

  const MOTIVATIONAL_QUOTES = [
    { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
    { text: "Focus is a muscle. The more you practice deep work, the stronger it gets.", author: "Cal Newport" },
    { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
    { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
    { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
    { text: "Do what you have to do until you can do what you want to do.", author: "Oprah Winfrey" },
    { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" }
  ];

  const el = id => document.getElementById(id);

  /* ── Rolling Timer Helper (React Bits Odometer effect) ── */
  function updateRollingTimer(container, timeStr) {
    if (!container) return;
    
    if (!container.classList.contains('counter-container')) {
      container.classList.add('counter-container');
      container.innerHTML = '';
      
      for (let i = 0; i < timeStr.length; i++) {
        const char = timeStr[i];
        if (char === ':') {
          const sep = document.createElement('span');
          sep.className = 'counter-separator';
          sep.textContent = ':';
          container.appendChild(sep);
        } else if (/\d/.test(char)) {
          const digitCol = document.createElement('span');
          digitCol.className = 'counter-digit';
          
          const reel = document.createElement('span');
          reel.className = 'counter-reel';
          reel.dataset.value = '-1';
          
          for (let d = 0; d <= 9; d++) {
            const digitSpan = document.createElement('span');
            digitSpan.textContent = d;
            reel.appendChild(digitSpan);
          }
          digitCol.appendChild(reel);
          container.appendChild(digitCol);
        }
      }
    }
    
    const reels = container.querySelectorAll('.counter-reel');
    let reelIdx = 0;
    for (let i = 0; i < timeStr.length; i++) {
      const char = timeStr[i];
      if (/\d/.test(char)) {
        const reel = reels[reelIdx];
        if (reel && reel.dataset.value !== char) {
          reel.dataset.value = char;
          const digit = parseInt(char);
          reel.style.transform = `translateY(-${digit * 10}%)`;
        }
        reelIdx++;
      }
    }
  }

  /* ── Display ─────────────────────────────────────────── */
  function updateDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    const timeStr = `${m}:${s}`;
    
    const display = el('pom-display');
    if (display) updateRollingTimer(display, timeStr);

    const zenDisplay = el('zen-timer-display');
    if (zenDisplay) updateRollingTimer(zenDisplay, timeStr);

    const globalDisplay = el('global-timer-display');
    if (globalDisplay) updateRollingTimer(globalDisplay, timeStr);

    const progress = totalDuration > 0 ? (timeLeft / totalDuration) : 0;
    const offset = CIRCUMFERENCE * (1 - progress);

    const ring = el('pom-ring');
    if (ring) ring.style.strokeDashoffset = offset;

    const zenRing = el('zen-pom-ring');
    if (zenRing) zenRing.style.strokeDashoffset = offset;
  }

  function getDuration(m) {
    if (m === 'pomodoro') return focusMins * 60;
    if (m === 'short') return breakMins * 60;
    return longBreakMins * 60;
  }

  /* ── Mode Switch ─────────────────────────────────────── */
  function setMode(m) {
    mode = m;
    document.querySelectorAll('.pom-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === m));
    document.querySelectorAll('.zen-mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === m));
    
    const labels = { pomodoro: 'Focus Time', short: 'Short Break', long: 'Long Break' };
    const labelEl = el('pom-label');
    if (labelEl) labelEl.textContent = labels[m] || '';
    const zenLabelEl = el('zen-session-label');
    if (zenLabelEl) zenLabelEl.textContent = labels[m] || '';

    resetTimer();
  }

  /* ── Quick Preset Selector ────────────────────────────── */
  function applyFocusPreset(fMins, bMins, elTarget) {
    focusMins = fMins;
    breakMins = bMins;
    
    const fDurInput = el('focus-dur');
    if (fDurInput) fDurInput.value = focusMins;
    const fDurVal = el('focus-dur-val');
    if (fDurVal) fDurVal.textContent = focusMins;

    const bDurInput = el('break-dur');
    if (bDurInput) bDurInput.value = breakMins;
    const bDurVal = el('break-dur-val');
    if (bDurVal) bDurVal.textContent = breakMins;

    document.querySelectorAll('.focus-preset-pill').forEach(p => p.classList.remove('active'));
    if (elTarget) elTarget.classList.add('active');

    if (mode === 'pomodoro' && !isRunning) resetTimer();
    showToast(`Timer set: ${focusMins}m Focus / ${breakMins}m Break`, 'info');
  }

  /* ── Timer Controls ──────────────────────────────────── */
  function resetTimer() {
    stop();
    totalDuration = getDuration(mode);
    timeLeft = totalDuration;
    
    const btn = el('pom-start');
    if (btn) btn.textContent = 'Start';
    const zenBtn = el('zen-start-btn');
    if (zenBtn) zenBtn.textContent = 'Start';

    updateDisplay();
  }

  function start() {
    isRunning = true;
    const btn = el('pom-start');
    if (btn) btn.textContent = 'Pause';
    const zenBtn = el('zen-start-btn');
    if (zenBtn) zenBtn.textContent = 'Pause';

    const pill = el('global-timer-pill');
    if (pill) {
      pill.classList.add('running');
      const pauseIcon = el('global-timer-play')?.querySelector('.pause-icon');
      const playIcon = el('global-timer-play')?.querySelector('.play-icon');
      if (pauseIcon) pauseIcon.classList.remove('hidden');
      if (playIcon) playIcon.classList.add('hidden');
    }

    interval = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        clearInterval(interval);
        interval = null;
        isRunning = false;
        onComplete();
        return;
      }
      updateDisplay();
      if (mode === 'pomodoro') {
        const total = LS.get('total_focus_seconds', 0) + 1;
        LS.set('total_focus_seconds', total);
      }
    }, 1000);
  }

  function stop() {
    isRunning = false;
    clearInterval(interval);
    interval = null;
    const btn = el('pom-start');
    if (btn) btn.textContent = 'Resume';
    const zenBtn = el('zen-start-btn');
    if (zenBtn) zenBtn.textContent = 'Resume';

    const pill = el('global-timer-pill');
    if (pill) {
      pill.classList.remove('running');
      const pauseIcon = el('global-timer-play')?.querySelector('.pause-icon');
      const playIcon = el('global-timer-play')?.querySelector('.play-icon');
      if (pauseIcon) pauseIcon.classList.add('hidden');
      if (playIcon) playIcon.classList.remove('hidden');
    }
  }

  function toggle() {
    if (isRunning) stop();
    else start();
  }

  function skip() {
    stop();
    onComplete(true);
  }

  function onComplete(skipped = false) {
    playBellSound();
    if (el('pom-start')) el('pom-start').textContent = 'Start';
    if (el('zen-start-btn')) el('zen-start-btn').textContent = 'Start';

    if (mode === 'pomodoro' && !skipped) {
      sessionsToday++;
      LS.set('pomodoro_sessions', (LS.get('pomodoro_sessions', 0) + 1));
      logStudy(focusMins);
      updateStats();
      showToast(`🎉 Focus session complete! Session #${sessionsToday}`, 'success');

      rotateMotivationalQuote();

      const nextMode = sessionsToday % 4 === 0 ? 'long' : 'short';
      setTimeout(() => setMode(nextMode), 1500);
    } else if (mode !== 'pomodoro' && !skipped) {
      showToast('Break over! Ready to focus? 💪', 'info');
      setTimeout(() => setMode('pomodoro'), 1500);
    }
  }

  /* ── Study Log & Streak ──────────────────────────────── */
  function logStudy(minutes) {
    const today = new Date().toISOString().split('T')[0];
    const log = LS.get('study_log', []);
    const entry = log.find(l => l.date === today);
    if (entry) entry.minutes = (entry.minutes || 0) + minutes;
    else log.push({ date: today, minutes });
    LS.set('study_log', log.slice(-90));
  }

  function calculateStreak() {
    const log = LS.get('study_log', []);
    if (!log.length) return 0;

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 90; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const entry = log.find(l => l.date === key);
      if (entry && entry.minutes > 0) {
        streak++;
      } else if (i === 0) {
        // Today not done yet, don't break streak if yesterday was done
        continue;
      } else {
        break;
      }
    }
    return streak;
  }

  /* ── Stats Update ────────────────────────────────────── */
  function updateStats() {
    const secs = LS.get('total_focus_seconds', 0);
    const mins = Math.round(secs / 60);
    const sessions = LS.get('pomodoro_sessions', 0);
    const streak = calculateStreak();

    const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    set('pom-sessions', sessions);
    set('pom-total-time', mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`);
    set('pom-streak-display', streak);
    set('stat-focus', mins >= 60 ? `${Math.floor(mins / 60)}h` : `${mins}m`);

    // Target calculation
    const today = new Date().toISOString().split('T')[0];
    const log = LS.get('study_log', []);
    const todayEntry = log.find(l => l.date === today);
    const todayMins = todayEntry ? (todayEntry.minutes || 0) : 0;
    const targetMins = (LS.get('daily_target', 4) || 4) * 60;
    const targetPct = Math.min(100, Math.round((todayMins / targetMins) * 100));

    const targetEl = el('pom-daily-target-pct');
    if (targetEl) targetEl.textContent = `${targetPct}%`;
    const targetBar = el('pom-daily-target-bar');
    if (targetBar) targetBar.style.width = `${targetPct}%`;

    renderBars();
  }

  /* ── Progress Bars ───────────────────────────────────── */
  function renderBars() {
    const container = el('daily-progress-bars');
    if (!container) return;

    const log = LS.get('study_log', []);
    const target = (LS.get('daily_target', 4) || 4) * 60; // in minutes
    const today = new Date();
    const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

    const bars = DAYS.map((label, i) => {
      const d = new Date(today);
      const dow = today.getDay() === 0 ? 6 : today.getDay() - 1;
      d.setDate(today.getDate() - dow + i);
      const key = d.toISOString().split('T')[0];
      const entry = log.find(l => l.date === key);
      const mins = entry ? (entry.minutes || 0) : 0;
      const pct = Math.min(100, (mins / target) * 100);
      const done = pct >= 100;
      const isToday = key === today.toISOString().split('T')[0];

      return `
        <div class="week-bar-col ${isToday ? 'today' : ''}">
          <div class="week-bar-track">
            <div class="week-bar-fill ${done ? 'done' : ''}" style="height:${pct}%;"></div>
          </div>
          <div class="week-bar-day">${label}</div>
          <div class="week-bar-val">${mins >= 60 ? Math.floor(mins / 60) + 'h' : mins + 'm'}</div>
        </div>`;
    });

    container.innerHTML = bars.join('');
  }

  /* ── Guided Breathing Coach (4-4-4-4 Box Breathing) ───── */
  function initBreathingCoach() {
    const sphere = el('breathing-sphere');
    const phaseLabel = el('breathing-phase-label');
    const secLabel = el('breathing-seconds');
    const toggleBtn = el('breathing-toggle-btn');

    if (!sphere || !phaseLabel) return;

    const phases = [
      { id: 'inhale', name: 'Inhale deeply...', duration: 4, scale: 'scale(1.4)', cls: 'phase-inhale' },
      { id: 'hold1', name: 'Hold breath...', duration: 4, scale: 'scale(1.4)', cls: 'phase-hold' },
      { id: 'exhale', name: 'Exhale slowly...', duration: 4, scale: 'scale(0.8)', cls: 'phase-exhale' },
      { id: 'hold2', name: 'Hold breath...', duration: 4, scale: 'scale(0.8)', cls: 'phase-hold' }
    ];

    let currentPhaseIdx = 0;
    breathingSecondsLeft = phases[0].duration;

    function applyPhase(idx) {
      const p = phases[idx];
      phaseLabel.textContent = p.name;
      sphere.className = `breathing-sphere ${p.cls}`;
      sphere.style.transform = p.scale;
    }

    applyPhase(0);

    if (breathingTimer) clearInterval(breathingTimer);
    breathingTimer = setInterval(() => {
      if (!breathingActive) return;

      breathingSecondsLeft--;
      if (secLabel) secLabel.textContent = `${breathingSecondsLeft}s`;

      if (breathingSecondsLeft <= 0) {
        currentPhaseIdx = (currentPhaseIdx + 1) % phases.length;
        breathingSecondsLeft = phases[currentPhaseIdx].duration;
        applyPhase(currentPhaseIdx);
      }
    }, 1000);

    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        breathingActive = !breathingActive;
        toggleBtn.textContent = breathingActive ? 'Pause' : 'Resume';
        toggleBtn.classList.toggle('active', breathingActive);
        if (!breathingActive) {
          phaseLabel.textContent = 'Paused';
        } else {
          applyPhase(currentPhaseIdx);
        }
      });
    }
  }

  /* ── Fleeting Thoughts / Brain Dump Scratchpad ───────── */
  function initScratchpad() {
    const textarea = el('focus-scratchpad');
    const clearBtn = el('focus-scratch-clear');
    const sendBtn = el('focus-scratch-send-notes');

    if (!textarea) return;

    // Load saved thoughts
    const saved = LS.get('focus_scratchpad_content', '');
    textarea.value = saved;

    // Auto-save on typing with debounce
    let saveTimeout = null;
    textarea.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        LS.set('focus_scratchpad_content', textarea.value);
      }, 300);
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (!textarea.value.trim()) return;
        if (confirm('Clear fleeting thoughts scratchpad?')) {
          textarea.value = '';
          LS.set('focus_scratchpad_content', '');
          showToast('Scratchpad cleared', 'info');
        }
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const text = textarea.value.trim();
        if (!text) {
          showToast('Scratchpad is empty', 'warning');
          return;
        }

        // Export to Notes
        const title = `Focus Session Thoughts — ${new Date().toLocaleDateString()}`;
        const newNote = {
          id: 'note_' + Date.now(),
          title: title,
          subjectId: '',
          body: `<p>${text.replace(/\n/g, '<br>')}</p>`,
          plainText: text,
          pinned: false,
          created: new Date().toISOString(),
          updated: new Date().toISOString()
        };

        const notes = LS.get('notes', []);
        notes.unshift(newNote);
        LS.set('notes', notes);

        showToast('Created new note from scratchpad! 📝', 'success');
      });
    }
  }

  /* ── Focus Session Micro-Goals Checklist ─────────────── */
  function initMicroGoals() {
    const input = el('micro-goal-input');
    const addBtn = el('micro-goal-add-btn');
    const list = el('micro-goals-list');
    const progressFill = el('micro-goals-progress-fill');
    const progressLabel = el('micro-goals-progress-label');

    if (!list) return;

    let goals = LS.get('focus_micro_goals', [
      { id: 'g1', text: 'Review Chapter key terms & formulas', done: false },
      { id: 'g2', text: 'Solve 5 practice problems without notes', done: false },
      { id: 'g3', text: 'Write 3-minute summary breakdown', done: false }
    ]);

    function renderGoals() {
      if (!goals.length) {
        list.innerHTML = `<div class="micro-goals-empty">No goals yet. Add 2–3 micro-tasks for this session!</div>`;
      } else {
        list.innerHTML = goals.map(g => `
          <div class="micro-goal-item ${g.done ? 'completed' : ''}" data-id="${g.id}">
            <label class="micro-goal-checkbox-label">
              <input type="checkbox" class="micro-goal-cb" ${g.done ? 'checked' : ''} />
              <span class="micro-goal-custom-cb">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <span class="micro-goal-text">${escapeHtml(g.text)}</span>
            </label>
            <button class="micro-goal-del-btn" title="Remove goal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        `).join('');
      }

      // Update progress
      const total = goals.length;
      const completed = goals.filter(g => g.done).length;
      const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

      if (progressFill) progressFill.style.width = `${pct}%`;
      if (progressLabel) progressLabel.textContent = `${completed}/${total} completed (${pct}%)`;

      // Save
      LS.set('focus_micro_goals', goals);
    }

    function addGoal() {
      if (!input) return;
      const text = input.value.trim();
      if (!text) return;

      goals.push({
        id: 'g_' + Date.now(),
        text: text,
        done: false
      });
      input.value = '';
      renderGoals();
    }

    if (addBtn) addBtn.addEventListener('click', addGoal);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addGoal();
      });
    }

    list.addEventListener('click', (e) => {
      const item = e.target.closest('.micro-goal-item');
      if (!item) return;
      const id = item.dataset.id;
      const goal = goals.find(g => g.id === id);
      if (!goal) return;

      if (e.target.closest('.micro-goal-del-btn')) {
        goals = goals.filter(g => g.id !== id);
        renderGoals();
        return;
      }

      if (e.target.closest('.micro-goal-cb') || e.target.closest('.micro-goal-custom-cb')) {
        goal.done = !goal.done;
        renderGoals();
        if (goal.done) {
          showToast('Goal completed! Keep going! 🚀', 'success');
        }
      }
    });

    renderGoals();
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  /* ── Zen Fullscreen Focus Mode ───────────────────────── */
  function toggleZenMode() {
    isZenMode = !isZenMode;
    const overlay = el('zen-focus-overlay');
    if (!overlay) return;

    if (isZenMode) {
      overlay.classList.remove('hidden');
      document.body.classList.add('zen-fullscreen-active');
      updateDisplay();
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } else {
      overlay.classList.add('hidden');
      document.body.classList.remove('zen-fullscreen-active');
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  }

  /* ── Motivational Quote ───────────────────────────────── */
  function rotateMotivationalQuote() {
    const quoteEl = el('focus-motivational-quote');
    const authorEl = el('focus-motivational-author');
    if (!quoteEl) return;

    const randomIndex = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
    const q = MOTIVATIONAL_QUOTES[randomIndex];
    quoteEl.textContent = `"${q.text}"`;
    if (authorEl) authorEl.textContent = `— ${q.author}`;
  }

  /* ── Bell Sound ───────────────────────────────────────── */
  function playBellSound() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();

      // Dual harmonic bell chime
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc1.frequency.setValueAtTime(528, audioCtx.currentTime); // 528Hz Solfeggio frequency
      osc2.frequency.setValueAtTime(1056, audioCtx.currentTime);
      osc1.type = 'sine';
      osc2.type = 'sine';

      gain.gain.setValueAtTime(0.4, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1.8);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(audioCtx.destination);

      osc1.start();
      osc2.start();
      osc1.stop(audioCtx.currentTime + 1.8);
      osc2.stop(audioCtx.currentTime + 1.8);
    } catch {}
  }

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    // Mode tabs (Main & Zen)
    document.querySelectorAll('.pom-tab').forEach(t => {
      t.addEventListener('click', () => setMode(t.dataset.mode));
    });
    document.querySelectorAll('.zen-mode-tab').forEach(t => {
      t.addEventListener('click', () => setMode(t.dataset.mode));
    });

    // Preset pills (25/5, 50/10, 90/15)
    document.querySelectorAll('.focus-preset-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const f = parseInt(pill.dataset.focus);
        const b = parseInt(pill.dataset.break);
        applyFocusPreset(f, b, pill);
      });
    });

    // Start / Pause / Reset / Skip (Main)
    const mainStart = el('pom-start');
    if (mainStart) {
      mainStart.addEventListener('click', () => {
        if (!isRunning && timeLeft === totalDuration && mainStart.textContent === 'Start') start();
        else toggle();
      });
    }
    const mainReset = el('pom-reset');
    if (mainReset) mainReset.addEventListener('click', resetTimer);
    const mainSkip = el('pom-skip');
    if (mainSkip) mainSkip.addEventListener('click', skip);

    // Zen Fullscreen Buttons & Shortcut
    const zenToggleBtn = el('focus-enter-zen-btn');
    if (zenToggleBtn) zenToggleBtn.addEventListener('click', toggleZenMode);
    const zenExitBtn = el('zen-exit-btn');
    if (zenExitBtn) zenExitBtn.addEventListener('click', toggleZenMode);

    const zenStart = el('zen-start-btn');
    if (zenStart) {
      zenStart.addEventListener('click', () => {
        if (!isRunning && timeLeft === totalDuration && zenStart.textContent === 'Start') start();
        else toggle();
      });
    }
    const zenReset = el('zen-reset-btn');
    if (zenReset) zenReset.addEventListener('click', resetTimer);
    const zenSkip = el('zen-skip-btn');
    if (zenSkip) zenSkip.addEventListener('click', skip);

    // Global Floating Widget buttons
    const globalPlay = el('global-timer-play');
    if (globalPlay) {
      globalPlay.addEventListener('click', () => {
        if (!isRunning && timeLeft === totalDuration && el('pom-start')?.textContent === 'Start') start();
        else toggle();
      });
    }
    const globalReset = el('global-timer-reset');
    if (globalReset) {
      globalReset.addEventListener('click', resetTimer);
    }

    // Sliders
    const focusDurInput = el('focus-dur');
    if (focusDurInput) {
      focusDurInput.addEventListener('input', () => {
        focusMins = parseInt(focusDurInput.value);
        if (el('focus-dur-val')) el('focus-dur-val').textContent = focusMins;
        if (mode === 'pomodoro' && !isRunning) resetTimer();
      });
    }

    const breakDurInput = el('break-dur');
    if (breakDurInput) {
      breakDurInput.addEventListener('input', () => {
        breakMins = parseInt(breakDurInput.value);
        if (el('break-dur-val')) el('break-dur-val').textContent = breakMins;
        if (mode === 'short' && !isRunning) resetTimer();
      });
    }

    // Keyboard shortcut (F for fullscreen zen mode when on focus view)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isZenMode) {
        toggleZenMode();
      }
    });

    // Sub-modules
    initBreathingCoach();
    initScratchpad();
    initMicroGoals();
    rotateMotivationalQuote();

    // Soundboard
    if (typeof FocusAudio !== 'undefined') {
      FocusAudio.init();
      FocusAudio.renderSoundboard('focus-soundboard-container');
    }

    // Restore stats
    sessionsToday = LS.get('pomodoro_sessions', 0);
    resetTimer();
    updateStats();
  }

  return {
    init,
    renderBars,
    toggleZenMode,
    start,
    stop,
    resetTimer,
    setMode
  };
})();
