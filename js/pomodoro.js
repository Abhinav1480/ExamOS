/* ═══════════════════════════════════════════════════════
   pomodoro.js — Focus timer. No chatbot dependency.
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

  const el = id => document.getElementById(id);

  /* ── Rolling Timer helper (React Bits Odometer effect) ── */
  function updateRollingTimer(container, timeStr) {
    if (!container) return;
    
    // Initialize if not already initialized
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
    
    // Update values with hardware accelerated vertical translation
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

    const globalDisplay = el('global-timer-display');
    if (globalDisplay) updateRollingTimer(globalDisplay, timeStr);

    const ring = el('pom-ring');
    if (ring) {
      const progress = timeLeft / totalDuration;
      ring.style.strokeDashoffset = CIRCUMFERENCE * (1 - progress);
    }
  }

  function getDuration(m) {
    if (m === 'pomodoro') return focusMins * 60;
    if (m === 'short') return breakMins * 60;
    return longBreakMins * 60;
  }

  /* ── Mode switch ─────────────────────────────────────── */
  function setMode(m) {
    mode = m;
    document.querySelectorAll('.pom-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === m));
    const labels = { pomodoro: 'Focus Time', short: 'Short Break', long: 'Long Break' };
    const labelEl = el('pom-label');
    if (labelEl) labelEl.textContent = labels[m] || '';
    resetTimer();
  }

  /* ── Timer ───────────────────────────────────────────── */
  function resetTimer() {
    stop();
    totalDuration = getDuration(mode);
    timeLeft = totalDuration;
    const btn = el('pom-start');
    if (btn) btn.textContent = 'Start';
    updateDisplay();
  }

  function start() {
    isRunning = true;
    const btn = el('pom-start');
    if (btn) btn.textContent = 'Pause';

    const pill = el('global-timer-pill');
    if (pill) {
      pill.classList.add('running');
      const pauseIcon = el('global-timer-play').querySelector('.pause-icon');
      const playIcon = el('global-timer-play').querySelector('.play-icon');
      if (pauseIcon) pauseIcon.classList.remove('hidden');
      if (playIcon) playIcon.classList.add('hidden');
    }

    interval = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) { clearInterval(interval); interval = null; isRunning = false; onComplete(); return; }
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

    const pill = el('global-timer-pill');
    if (pill) {
      pill.classList.remove('running');
      const pauseIcon = el('global-timer-play').querySelector('.pause-icon');
      const playIcon = el('global-timer-play').querySelector('.play-icon');
      if (pauseIcon) pauseIcon.classList.add('hidden');
      if (playIcon) playIcon.classList.remove('hidden');
    }
  }

  function toggle() {
    if (isRunning) stop();
    else start();
  }

  function skip() { stop(); onComplete(true); }

  function onComplete(skipped = false) {
    playBeep();
    el('pom-start').textContent = 'Start';

    if (mode === 'pomodoro' && !skipped) {
      sessionsToday++;
      LS.set('pomodoro_sessions', (LS.get('pomodoro_sessions', 0) + 1));
      logStudy(focusMins);
      updateStats();
      showToast(`🎉 Focus session complete! Session #${sessionsToday}`, 'success');

      const nextMode = sessionsToday % 4 === 0 ? 'long' : 'short';
      setTimeout(() => setMode(nextMode), 1500);
    } else if (mode !== 'pomodoro' && !skipped) {
      showToast('Break over! Ready to focus? 💪', 'info');
      setTimeout(() => setMode('pomodoro'), 1500);
    }
  }

  /* ── Study log ───────────────────────────────────────── */
  function logStudy(minutes) {
    const today = new Date().toISOString().split('T')[0];
    const log = LS.get('study_log', []);
    const entry = log.find(l => l.date === today);
    if (entry) entry.minutes = (entry.minutes || 0) + minutes;
    else log.push({ date: today, minutes });
    LS.set('study_log', log.slice(-90));
  }

  /* ── Stats update ────────────────────────────────────── */
  function updateStats() {
    const secs = LS.get('total_focus_seconds', 0);
    const mins = Math.round(secs / 60);
    const sessions = LS.get('pomodoro_sessions', 0);

    const set = (id, v) => { const e = el(id); if (e) e.textContent = v; };
    set('pom-sessions', sessions);
    set('pom-total-time', mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`);
    set('stat-focus', mins >= 60 ? `${Math.floor(mins / 60)}h` : `${mins}m`);

    renderBars();
  }

  /* ── Progress bars ───────────────────────────────────── */
  function renderBars() {
    const container = el('daily-progress-bars');
    if (!container) return;

    const log = LS.get('study_log', []);
    const target = LS.get('daily_target', 4) * 60; // in minutes
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
      return `
        <div class="week-bar-col">
          <div class="week-bar-track">
            <div class="week-bar-fill ${done ? 'done' : ''}" style="height:${pct}%;"></div>
          </div>
          <div class="week-bar-day">${label}</div>
          <div class="week-bar-val">${mins >= 60 ? Math.floor(mins / 60) + 'h' : mins + 'm'}</div>
        </div>`;
    });

    container.innerHTML = bars.join('');
  }

  /* ── Sound ───────────────────────────────────────────── */
  function playBeep() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.frequency.value = 880; osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
      osc.start(); osc.stop(audioCtx.currentTime + 0.8);
    } catch {}
  }

  /* ── Init ────────────────────────────────────────────── */
  function init() {
    // Mode tabs
    document.querySelectorAll('.pom-tab').forEach(t => {
      t.addEventListener('click', () => setMode(t.dataset.mode));
    });

    el('pom-start').addEventListener('click', () => {
      if (!isRunning && timeLeft === totalDuration && el('pom-start').textContent === 'Start') start();
      else toggle();
    });
    el('pom-reset').addEventListener('click', resetTimer);
    el('pom-skip').addEventListener('click', skip);

    // Global floating widget buttons
    const globalPlay = el('global-timer-play');
    if (globalPlay) {
      globalPlay.addEventListener('click', () => {
        if (!isRunning && timeLeft === totalDuration && el('pom-start').textContent === 'Start') start();
        else toggle();
      });
    }
    const globalReset = el('global-timer-reset');
    if (globalReset) {
      globalReset.addEventListener('click', resetTimer);
    }

    // Sliders
    el('focus-dur').addEventListener('input', () => {
      focusMins = parseInt(el('focus-dur').value);
      el('focus-dur-val').textContent = focusMins;
      if (mode === 'pomodoro' && !isRunning) resetTimer();
    });

    el('break-dur').addEventListener('input', () => {
      breakMins = parseInt(el('break-dur').value);
      el('break-dur-val').textContent = breakMins;
      if (mode === 'short' && !isRunning) resetTimer();
    });

    // Restore stats
    sessionsToday = LS.get('pomodoro_sessions', 0);
    resetTimer();
    updateStats();
  }

  return { init, renderBars };
})();
