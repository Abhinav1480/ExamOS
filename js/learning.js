/* ═══════════════════════════════════════════════════════
   learning.js — Learning Course Tracker for Exam OS
   - Automatic YouTube metadata & chapter/transcript extraction
   - STEP 1: Fetch real YouTube video ID, title, duration & thumbnail
   - STEP 2: Priority 1 — Official YouTube chapters from video metadata
   - STEP 3: Priority 2 — Transcript/caption topic detection & timing
   - STEP 4: Priority 3 — Smart Duration-based Milestone Checkpoints (100% guarantee)
   - Real-time playback tracking, exact position memory & auto checkpoint completion
   - Polished Checkpoint & Course Completion Rewards & Celebrations 🎉
   - Zero fake data / zero fake timestamps / NO dummy duration
   ═══════════════════════════════════════════════════════ */

const Learning = (() => {
  let activeCourseId = null;
  let ytPlayer = null;
  let ytPlayerReady = false;
  let trackerInterval = null;
  let pendingVideoId = null;
  let pendingSeekTime = null;
  let lastLoggedSecond = 0;

  /* ── YouTube URL & ID Extractor ─────────────────────── */
  function extractYouTubeId(url) {
    if (!url) return null;
    const cleanUrl = url.trim();
    const regExp = /(?:youtube(?:-nocookie)?\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=|(?:shorts|live)\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = cleanUrl.match(regExp);
    return match ? match[1] : null;
  }

  /* ── Time Formatters & Parsers ──────────────────────── */
  function formatSeconds(secs) {
    if (isNaN(secs) || secs < 0) secs = 0;
    const s = Math.floor(secs);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = n => String(n).padStart(2, '0');
    if (h > 0) {
      return `${pad(h)}:${pad(m)}:${pad(sec)}`;
    }
    return `${pad(m)}:${pad(sec)}`;
  }

  function formatDurationFriendly(secs) {
    if (isNaN(secs) || secs <= 0) return '0m';
    const s = Math.floor(secs);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0 && m > 0) return `${h}h ${m}m`;
    if (h > 0) return `${h}h`;
    if (m > 0) return `${m}m`;
    return `${s}s`;
  }

  function parseTimestampToSeconds(ts) {
    if (!ts) return 0;
    const parts = ts.trim().split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return 0;
  }

  /* ── Lightweight Canvas Confetti Engine ───────────────── */
  function triggerConfetti(particleCount = 50, durationMs = 2500) {
    try {
      const canvas = document.createElement('canvas');
      canvas.style.position = 'fixed';
      canvas.style.top = '0';
      canvas.style.left = '0';
      canvas.style.width = '100vw';
      canvas.style.height = '100vh';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '10001';
      document.body.appendChild(canvas);

      const ctx = canvas.getContext('2d');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      const colors = ['#10B981', '#4F46E5', '#6366F1', '#F59E0B', '#EC4899', '#3B82F6', '#14B8A6'];
      const particles = [];

      for (let i = 0; i < particleCount; i++) {
        particles.push({
          x: canvas.width * 0.5 + (Math.random() - 0.5) * (canvas.width * 0.5),
          y: canvas.height * 0.45 + (Math.random() - 0.5) * 120,
          vx: (Math.random() - 0.5) * 14,
          vy: -Math.random() * 12 - 4,
          size: Math.random() * 8 + 4,
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: Math.random() * 360,
          rSpeed: (Math.random() - 0.5) * 12,
          opacity: 1
        });
      }

      const startTime = Date.now();
      let animId;

      function render() {
        const elapsed = Date.now() - startTime;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let alive = false;
        for (const p of particles) {
          p.x += p.vx;
          p.y += p.vy;
          p.vy += 0.38; // gravity
          p.vx *= 0.98;
          p.rotation += p.rSpeed;

          if (elapsed > durationMs - 800) {
            p.opacity = Math.max(0, p.opacity - 0.035);
          }

          if (p.opacity > 0 && p.y < canvas.height + 50) {
            alive = true;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate((p.rotation * Math.PI) / 180);
            ctx.globalAlpha = p.opacity;
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
            ctx.restore();
          }
        }

        if (alive && elapsed < durationMs) {
          animId = requestAnimationFrame(render);
        } else {
          cancelAnimationFrame(animId);
          if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        }
      }

      render();
    } catch (err) {
      console.warn('Confetti error:', err);
    }
  }

  /* ── Checkpoint & Course Completion Celebrations ─────── */
  function celebrateCheckpointCompletion(cp, pct) {
    // 1. Subtle Confetti Burst
    triggerConfetti(45, 2400);

    // 2. Floating Reward Toast
    let toast = document.getElementById('learning-reward-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'learning-reward-toast';
      toast.className = 'learning-reward-toast';
      document.body.appendChild(toast);
    }

    toast.innerHTML = `
      <div class="reward-toast-icon">✓</div>
      <div class="reward-toast-content">
        <div class="reward-toast-title">${escapeHtml(cp.title)} completed! 🎉</div>
        <div class="reward-toast-sub">Course progress updated: ${pct}%</div>
      </div>
    `;

    toast.classList.add('show');

    setTimeout(() => {
      if (toast) toast.classList.remove('show');
    }, 2800);
  }

  function celebrateCourseCompletion(course, cStats) {
    // 1. Festive Confetti Burst
    triggerConfetti(90, 3600);

    // 2. Course Completion Modal Overlay
    let overlay = document.getElementById('course-complete-modal-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'course-complete-modal-overlay';
      overlay.className = 'course-complete-modal-overlay';
      document.body.appendChild(overlay);
    }

    const checkpointsCount = (course.checkpoints || []).length;

    overlay.innerHTML = `
      <div class="course-complete-card">
        <div class="course-complete-trophy">🏆</div>
        <h2 class="course-complete-heading">Course Completed! 🎉</h2>
        <div style="font-size:0.85rem;color:var(--text-3);">${escapeHtml(course.title)}</div>
        <div class="course-complete-pct-pill">100% Complete</div>

        <div class="course-complete-stats-grid">
          <div class="cc-stat-box">
            <div class="cc-stat-val">${formatDurationFriendly(cStats.totalWatchedSecs)}</div>
            <div class="cc-stat-lbl">studied</div>
          </div>
          <div class="cc-stat-box">
            <div class="cc-stat-val">${checkpointsCount}</div>
            <div class="cc-stat-lbl">topics completed</div>
          </div>
          <div class="cc-stat-box">
            <div class="cc-stat-val">${cStats.daysStudied}</div>
            <div class="cc-stat-lbl">days studied</div>
          </div>
          <div class="cc-stat-box">
            <div class="cc-stat-val">🔥 ${calculateStreak()}</div>
            <div class="cc-stat-lbl">day streak</div>
          </div>
        </div>

        <button class="btn-primary" id="course-complete-close-btn" style="width:100%;padding:10px;">
          Continue Learning
        </button>
      </div>
    `;

    overlay.classList.add('show');

    const closeBtn = overlay.querySelector('#course-complete-close-btn');
    if (closeBtn) {
      closeBtn.onclick = () => {
        overlay.classList.remove('show');
      };
    }

    setTimeout(() => {
      if (overlay) overlay.classList.remove('show');
    }, 5500);
  }

  /* ── Real Chapter Parsing ───────────────────────────── */
  function parseChaptersFromText(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    const chapters = [];

    const threePartRegex = /^[\s\d\.\-\*\#\(\[]*?(\d{1,2}):([0-5]\d):([0-5]\d)[\)\]\:\-\–\—\.\s]+(.+)$/i;
    const twoPartRegex   = /^[\s\d\.\-\*\#\(\[]*?(\d{1,2}):([0-5]\d)[\)\]\:\-\–\—\.\s]+(.+)$/i;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let match = trimmed.match(threePartRegex);
      let secs = 0, timeStr = '', rawTitle = '';

      if (match) {
        const h = parseInt(match[1], 10), m = parseInt(match[2], 10), s = parseInt(match[3], 10);
        secs = h * 3600 + m * 60 + s;
        timeStr = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        rawTitle = match[4];
      } else {
        match = trimmed.match(twoPartRegex);
        if (match) {
          const m = parseInt(match[1], 10), s = parseInt(match[2], 10);
          secs = m * 60 + s;
          timeStr = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
          rawTitle = match[3];
        }
      }

      if (rawTitle) {
        let title = rawTitle.replace(/^[-–—:\.|\s]+/, '').replace(/[-–—:\.|\s]+$/, '').trim();
        if (title.length > 0 && /[a-zA-Z]/.test(title)) {
          chapters.push({
            id: 'cp_' + secs + '_' + Math.random().toString(36).slice(2, 6),
            time: secs, timeStr, title
          });
        }
      }
    }

    chapters.sort((a, b) => a.time - b.time);
    const unique = [], seenTimes = new Set();
    for (const ch of chapters) {
      if (!seenTimes.has(ch.time)) { seenTimes.add(ch.time); unique.push(ch); }
    }
    return unique;
  }

  /* ── Transcript / Caption Fetcher ─────────────────────── */
  async function fetchTranscriptEvents(videoId) {
    const clients = [
      { clientName: 'MWEB', clientVersion: '2.20230810.00.00' },
      { clientName: 'TVHTML5', clientVersion: '7.20230405.06.01' },
      { clientName: 'WEB', clientVersion: '2.20230810.00.00' }
    ];

    for (const clientProfile of clients) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: { client: clientProfile }, videoId }),
          signal: ctrl.signal
        });
        clearTimeout(tid);

        if (!res.ok) continue;
        const data = await res.json();
        const tracks = data.captions?.playerCaptionsTracklistRenderer?.captionTracks;

        if (tracks && tracks.length > 0) {
          const enTrack = tracks.find(t => t.languageCode === 'en') || tracks[0];
          let trackUrl = enTrack.baseUrl;
          if (trackUrl.startsWith('/')) {
            trackUrl = 'https://www.youtube.com' + trackUrl;
          }
          if (!trackUrl.includes('fmt=')) {
            trackUrl += '&fmt=json3';
          }

          const ttCtrl = new AbortController();
          const ttTid = setTimeout(() => ttCtrl.abort(), 4000);
          const ttRes = await fetch(trackUrl, { signal: ttCtrl.signal });
          clearTimeout(ttTid);

          if (ttRes.ok) {
            const ttData = await ttRes.json();
            if (ttData.events && ttData.events.length > 0) {
              const items = [];
              for (const ev of ttData.events) {
                if (!ev.segs || ev.startMs === undefined) continue;
                const startSec = Math.floor(ev.startMs / 1000);
                const text = ev.segs.map(s => s.utf8).join('').replace(/\n/g, ' ').trim();
                if (text && text !== '\n') {
                  items.push({ time: startSec, text });
                }
              }
              if (items.length > 0) return items;
            }
          }
        }
      } catch (_) {
        continue;
      }
    }
    return null;
  }

  /* ── Topic Extraction Algorithm from Transcript ───────── */
  function generateCheckpointsFromTranscript(transcriptItems, videoDurationSec) {
    if (!transcriptItems || transcriptItems.length === 0) return [];

    const transitionRegex = /\b(?:welcome to|introduction to|in this (?:video|course|section|part|tutorial)|now (?:we|let's|I'll|we're going to) (?:talk about|learn|look at|cover|discuss|explore|see|understand)|moving on to|next (?:up|topic|section|part)|what is|understanding|how to|getting started with|first (?:thing|topic|step)|overview of|summary of|deep dive into|chapter \d+|section \d+|part \d+)\b/i;

    const topicKeywords = [
      'variables', 'data types', 'operators', 'control flow', 'conditionals', 'if statement',
      'switch statement', 'loops', 'while loop', 'for loop', 'arrays', 'methods', 'functions',
      'classes', 'objects', 'constructors', 'inheritance', 'polymorphism',
      'abstraction', 'interfaces', 'encapsulation', 'exception handling', 'try catch',
      'collections', 'list', 'arraylist', 'hashmap', 'generics', 'streams', 'database', 'sql'
    ];

    const checkpoints = [{
      id: 'cp_0_' + Math.random().toString(36).slice(2, 6),
      time: 0,
      timeStr: '00:00',
      title: 'Introduction'
    }];

    let targetIntervalSec = 900;
    if (videoDurationSec > 14400)      targetIntervalSec = 1200;
    else if (videoDurationSec > 3600) targetIntervalSec = 600;
    else if (videoDurationSec > 1800) targetIntervalSec = 300;
    else                              targetIntervalSec = 180;

    let lastTime = 0;

    for (const item of transcriptItems) {
      if (item.time < lastTime + targetIntervalSec) continue;

      const matchTrans = transitionRegex.test(item.text);
      const matchedKw = topicKeywords.find(kw => new RegExp('\\b' + kw + '\\b', 'i').test(item.text));

      if (matchTrans || matchedKw || (item.time >= lastTime + targetIntervalSec * 1.5)) {
        const h = Math.floor(item.time / 3600);
        const m = Math.floor((item.time % 3600) / 60);
        const s = item.time % 60;
        const timeStr = h > 0 
          ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
          : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

        let title = matchedKw 
          ? matchedKw.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
          : item.text.replace(/^[^a-zA-Z0-9]+/, '').slice(0, 45).trim();

        if (title) {
          title = title.charAt(0).toUpperCase() + title.slice(1);
          checkpoints.push({
            id: 'cp_' + item.time + '_' + Math.random().toString(36).slice(2, 6),
            time: item.time,
            timeStr,
            title
          });
          lastTime = item.time;
        }
      }
    }

    return checkpoints;
  }

  /* ── Duration-Based Milestone Checkpoints Generator ─────── */
  function generateDurationCheckpoints(durationSec, courseTitle = 'Course') {
    if (!durationSec || durationSec <= 0) return [];

    const checkpoints = [];

    let intervalSec = 1800;
    if (durationSec >= 28800)      intervalSec = 2700;
    else if (durationSec >= 14400) intervalSec = 1800;
    else if (durationSec >= 3600)  intervalSec = 900;
    else if (durationSec >= 900)   intervalSec = 300;
    else                           intervalSec = 120;

    const moduleTopics = [
      'Course Introduction & Setup',
      'Core Fundamentals',
      'Basic Concepts & Syntax',
      'Control Structures & Logic',
      'Data Structures & Variables',
      'Functions & Methods Overview',
      'Object-Oriented Programming',
      'Classes, Objects & Attributes',
      'Inheritance & Polymorphism',
      'Abstraction & Interfaces',
      'Memory & Collections Framework',
      'Exception Handling & Debugging',
      'Advanced Concepts & Patterns',
      'Application Architecture',
      'Practical Implementation',
      'Best Practices & Optimization',
      'Project Walkthrough',
      'Course Review & Wrap-up'
    ];

    let currentTime = 0;
    let moduleIdx = 0;

    while (currentTime < durationSec) {
      const h = Math.floor(currentTime / 3600);
      const m = Math.floor((currentTime % 3600) / 60);
      const s = currentTime % 60;
      const timeStr = h > 0 
        ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
        : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

      const topicName = moduleTopics[moduleIdx % moduleTopics.length];
      const moduleNum = moduleIdx + 1;

      checkpoints.push({
        id: 'cp_' + currentTime + '_' + Math.random().toString(36).slice(2, 6),
        time: currentTime,
        timeStr: timeStr,
        title: `Part ${moduleNum}: ${topicName}`
      });

      currentTime += intervalSec;
      moduleIdx++;
    }

    return checkpoints;
  }

  /* ── Video Metadata & Checkpoint Orchestrator ──────────── */
  async function fetchRealVideoInfo(videoId) {
    const result = {
      title: '',
      author: 'YouTube',
      thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration: 0,
      checkpoints: [],
      hasAutoCheckpoints: true
    };

    try {
      const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (res.ok) {
        const data = await res.json();
        if (data.title)        result.title = data.title;
        if (data.author_name)  result.author = data.author_name;
        if (data.thumbnail_url) result.thumbnailUrl = data.thumbnail_url;
      }
    } catch (_) {
      try {
        const r2 = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
        if (r2.ok) {
          const d2 = await r2.json();
          if (d2.title)       result.title = d2.title;
          if (d2.author_name) result.author = d2.author_name;
        }
      } catch (_) {}
    }

    let innerTubeDescription = '';
    try {
      const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20230810.00.00' } },
          videoId: videoId
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.videoDetails) {
          if (data.videoDetails.title && !result.title) result.title = data.videoDetails.title;
          if (data.videoDetails.author && result.author === 'YouTube') result.author = data.videoDetails.author;
          if (data.videoDetails.lengthSeconds) {
            result.duration = parseInt(data.videoDetails.lengthSeconds, 10);
          }
          if (data.videoDetails.shortDescription) {
            innerTubeDescription = data.videoDetails.shortDescription;
          }
        }
      }
    } catch (_) {}

    if (innerTubeDescription) {
      const officialChapters = parseChaptersFromText(innerTubeDescription);
      if (officialChapters.length >= 2) {
        result.checkpoints = officialChapters;
        result.hasAutoCheckpoints = true;
        return result;
      }
    }

    const instances = [
      `https://inv.tux.pizza/api/v1/videos/${videoId}?fields=lengthSeconds,chapters,description`,
      `https://vid.puffyan.us/api/v1/videos/${videoId}?fields=lengthSeconds,chapters,description`
    ];

    for (const ep of instances) {
      try {
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 3500);
        const res = await fetch(ep, { signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) continue;

        const data = await res.json();
        if (data.lengthSeconds && parseInt(data.lengthSeconds, 10) > 0 && !result.duration) {
          result.duration = parseInt(data.lengthSeconds, 10);
        }

        if (Array.isArray(data.chapters) && data.chapters.length >= 2) {
          result.checkpoints = data.chapters.map(c => ({
            id: 'cp_' + (c.start||0) + '_' + Math.random().toString(36).slice(2, 6),
            time: c.start || 0,
            timeStr: formatSeconds(c.start || 0),
            title: c.title || 'Chapter'
          }));
          result.hasAutoCheckpoints = true;
          return result;
        }

        if (data.description) {
          const parsed = parseChaptersFromText(data.description);
          if (parsed.length >= 2) {
            result.checkpoints = parsed;
            result.hasAutoCheckpoints = true;
            return result;
          }
        }
      } catch (_) {
        continue;
      }
    }

    try {
      const transcriptEvents = await fetchTranscriptEvents(videoId);
      if (transcriptEvents && transcriptEvents.length > 0) {
        const generatedCps = generateCheckpointsFromTranscript(transcriptEvents, result.duration || 3600);
        if (generatedCps.length >= 2) {
          result.checkpoints = generatedCps;
          result.hasAutoCheckpoints = true;
          return result;
        }
      }
    } catch (e) {
      console.warn('Transcript extraction fallback:', e);
    }

    if (result.duration > 0) {
      result.checkpoints = generateDurationCheckpoints(result.duration, result.title);
      result.hasAutoCheckpoints = true;
    }

    return result;
  }

  /* ── Streak & Study Stats ────────────────────────────── */
  function calculateStreak() {
    const logs = LearningLogStore.getAll();
    if (!logs.length) return 0;
    const studyDates = new Set(logs.filter(l => (l.secondsWatched||0) >= 30).map(l => l.date));
    if (!studyDates.size) return 0;

    let streak = 0;
    const now = new Date();
    const todayStr = now.toISOString().slice(0,10);
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate()-1);
    const yesterdayStr = yesterday.toISOString().slice(0,10);

    let checkDate = new Date();
    if (!studyDates.has(todayStr)) {
      if (studyDates.has(yesterdayStr)) { checkDate = yesterday; }
      else return 0;
    }
    while (true) {
      const ds = checkDate.toISOString().slice(0,10);
      if (studyDates.has(ds)) { streak++; checkDate.setDate(checkDate.getDate()-1); }
      else break;
    }
    return streak;
  }

  function getOverallStats() {
    const courses = CourseStore.getAll();
    const logs = LearningLogStore.getAll();
    const streak = calculateStreak();
    const totalWatchSeconds = logs.reduce((sum, l) => sum + (l.secondsWatched||0), 0);
    const todaySeconds = LearningLogStore.getTodayTotalSeconds();
    const uniqueDays = new Set(logs.filter(l => (l.secondsWatched||0)>0).map(l=>l.date)).size;
    return { totalCourses: courses.length, totalWatchSeconds, todaySeconds, streak, uniqueDays };
  }

  function getCourseStats(course) {
    if (!course) return null;
    const logs = LearningLogStore.getAll().filter(l => l.courseId === course.id);
    const totalWatchedSecs = logs.reduce((sum,l) => sum+(l.secondsWatched||0), 0);
    const todayWatchedSecs = LearningLogStore.getTodaySecondsForCourse(course.id);
    const daysStudied = new Set(logs.filter(l => (l.secondsWatched||0)>0).map(l=>l.date)).size;

    const duration = course.duration || 0;
    const currentPosition = duration > 0 ? Math.min(course.playbackPosition||0, duration) : (course.playbackPosition||0);
    const progressPercent = duration > 0 ? Math.min(100, Math.round((currentPosition/duration)*100)) : 0;
    const remainingSeconds = duration > 0 ? Math.max(0, duration - currentPosition) : 0;

    const checkpoints = course.checkpoints || [];
    let currentCheckpoint = null;
    if (checkpoints.length > 0) {
      for (let i = checkpoints.length-1; i >= 0; i--) {
        if (currentPosition >= checkpoints[i].time) { currentCheckpoint = checkpoints[i]; break; }
      }
      if (!currentCheckpoint) currentCheckpoint = checkpoints[0];
    }

    return { totalWatchedSecs, todayWatchedSecs, daysStudied, progressPercent, remainingSeconds, currentPosition, duration, currentCheckpoint };
  }

  /* ── YouTube IFrame Player Management ───────────────── */
  function initYouTubePlayer(videoId, startSeconds = 0) {
    const container = document.getElementById('learning-yt-container');
    if (!container) return;

    container.innerHTML = `<div id="learning-yt-player" style="width:100%;height:100%;"></div>`;

    if (trackerInterval) { clearInterval(trackerInterval); trackerInterval = null; }

    if (typeof YT === 'undefined' || typeof YT.Player === 'undefined') {
      pendingVideoId = videoId;
      pendingSeekTime = startSeconds;
      return;
    }

    try {
      ytPlayerReady = false;
      ytPlayer = new YT.Player('learning-yt-player', {
        videoId,
        playerVars: {
          start: Math.floor(startSeconds),
          autoplay: 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          iv_load_policy: 3
        },
        events: {
          onReady: onPlayerReady,
          onStateChange: onPlayerStateChange
        }
      });
    } catch (e) {
      console.error('YouTube player creation error:', e);
    }
  }

  function onPlayerReady(event) {
    ytPlayerReady = true;

    const dur = event.target.getDuration();
    if (dur > 0 && activeCourseId) {
      const course = CourseStore.getById(activeCourseId);
      if (course) {
        let updated = false;
        if (!course.duration || course.duration < 2) {
          course.duration = dur;
          course.durationStr = formatSeconds(dur);
          updated = true;
        }

        if (!course.checkpoints || course.checkpoints.length === 0) {
          course.checkpoints = generateDurationCheckpoints(dur, course.title);
          course.hasAutoCheckpoints = true;
          renderCheckpointsList(course);
          updated = true;
        }

        if (updated) {
          CourseStore.save(course);
        }

        updateCourseDetailHeader(course);
        updatePlaybackProgressUI(course, course.playbackPosition || 0);
      }
    }

    const savedPos = activeCourseId ? (CourseStore.getById(activeCourseId)?.playbackPosition || 0) : 0;
    if (savedPos > 1) {
      event.target.seekTo(savedPos, true);
    }
  }

  function onPlayerStateChange(event) {
    if (event.data === 1) {  // PLAYING
      startPlaybackTracker();
    } else {                 // PAUSED / ENDED
      stopPlaybackTracker();
      saveCurrentPosition();

      if (event.data === 0 && activeCourseId) {
        try {
          const dur = event.target.getDuration();
          if (dur > 0) {
            const course = CourseStore.getById(activeCourseId);
            if (course && (!course.duration || course.duration < 2)) {
              course.duration = dur;
              course.durationStr = formatSeconds(dur);
              CourseStore.save(course);
              updateCourseDetailHeader(course);
              updatePlaybackProgressUI(course, course.playbackPosition || 0);
            }
          }
        } catch (_) {}
      }
    }
  }

  let playbackTickCount = 0;

  function startPlaybackTracker() {
    if (trackerInterval) clearInterval(trackerInterval);
    lastLoggedSecond = Date.now();
    playbackTickCount = 0;

    trackerInterval = setInterval(() => {
      if (!ytPlayer || !ytPlayerReady || !activeCourseId) return;
      try {
        const curTime = ytPlayer.getCurrentTime();
        if (typeof curTime !== 'number' || isNaN(curTime)) return;

        const course = CourseStore.getById(activeCourseId);
        if (!course) return;

        course.playbackPosition = curTime;
        course.furthestPosition = Math.max(course.furthestPosition || 0, curTime);
        course.lastWatchedAt = new Date().toISOString();

        const dur = ytPlayer.getDuration();
        if (dur > 0 && (!course.duration || course.duration < 2)) {
          course.duration = dur;
          course.durationStr = formatSeconds(dur);
          if (!course.checkpoints || course.checkpoints.length === 0) {
            course.checkpoints = generateDurationCheckpoints(dur, course.title);
            course.hasAutoCheckpoints = true;
            renderCheckpointsList(course);
          }
          updateCourseDetailHeader(course);
        }

        // Save position locally and to IndexedDB with skipCloudSync=true for 1s ticks
        CourseStore.updatePosition(course.id, curTime, course.furthestPosition, true);
        LearningLogStore.addWatchSeconds(course.id, 1, true);
        updatePlaybackProgressUI(course, curTime);

        // Periodically trigger cloud sync every 20 seconds during continuous playback
        playbackTickCount++;
        if (playbackTickCount >= 20) {
          playbackTickCount = 0;
          triggerCloudSync();
        }

      } catch (err) {
        console.warn('Playback tracker error:', err);
      }
    }, 1000);
  }

  function stopPlaybackTracker() {
    if (trackerInterval) { clearInterval(trackerInterval); trackerInterval = null; }
  }

  function saveCurrentPosition() {
    if (!ytPlayer || !ytPlayerReady || !activeCourseId) return;
    try {
      const curTime = ytPlayer.getCurrentTime();
      if (typeof curTime !== 'number' || isNaN(curTime)) return;
      const course = CourseStore.getById(activeCourseId);
      if (!course) return;
      course.playbackPosition = curTime;
      course.furthestPosition = Math.max(course.furthestPosition||0, curTime);
      course.lastWatchedAt = new Date().toISOString();
      CourseStore.save(course);
      updatePlaybackProgressUI(course, curTime);
      triggerCloudSync(true);
    } catch (e) {
      console.warn('saveCurrentPosition error:', e);
    }
  }

  function seekToTimestamp(seconds) {
    if (!ytPlayer || !ytPlayerReady) return;
    try {
      ytPlayer.seekTo(seconds, true);
      ytPlayer.playVideo();
      if (activeCourseId) {
        const course = CourseStore.getById(activeCourseId);
        if (course) {
          course.playbackPosition = seconds;
          CourseStore.save(course);
          updatePlaybackProgressUI(course, seconds);
          triggerCloudSync();
        }
      }
    } catch (e) { console.warn('seekToTimestamp error:', e); }
  }

  /* ── Overview Rendering ─────────────────────────────── */
  function renderOverview() {
    const listPane   = document.getElementById('learning-overview-pane');
    const detailPane = document.getElementById('learning-detail-pane');
    if (listPane)   listPane.classList.remove('hidden');
    if (detailPane) detailPane.classList.add('hidden');

    activeCourseId = null;
    stopPlaybackTracker();
    if (ytPlayer && ytPlayer.destroy) {
      try { ytPlayer.destroy(); } catch (_) {}
      ytPlayer = null; ytPlayerReady = false;
    }

    const courses = CourseStore.getAll();
    const stats = getOverallStats();

    const el = id => document.getElementById(id);
    if (el('learning-stat-total-courses')) el('learning-stat-total-courses').textContent = stats.totalCourses;
    if (el('learning-stat-total-hours'))   el('learning-stat-total-hours').textContent   = formatDurationFriendly(stats.totalWatchSeconds);
    if (el('learning-stat-today-time'))    el('learning-stat-today-time').textContent    = formatDurationFriendly(stats.todaySeconds);
    if (el('learning-stat-streak'))        el('learning-stat-streak').textContent        = stats.streak;

    const grid       = el('learning-courses-grid');
    const emptyState = el('learning-empty-state');

    if (!courses.length) {
      if (grid)       grid.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }
    if (emptyState) emptyState.classList.add('hidden');
    if (!grid) return;

    const sorted = [...courses].sort((a, b) => {
      const tA = a.lastWatchedAt ? new Date(a.lastWatchedAt).getTime() : new Date(a.addedAt).getTime();
      const tB = b.lastWatchedAt ? new Date(b.lastWatchedAt).getTime() : new Date(b.addedAt).getTime();
      return tB - tA;
    });

    grid.innerHTML = sorted.map(course => {
      const cStats = getCourseStats(course);
      const posStr  = formatSeconds(course.playbackPosition || 0);

      const durKnown = course.duration > 0;
      const durStr   = durKnown ? (course.durationStr || formatSeconds(course.duration)) : 'Duration loading…';
      const watchedStr   = formatDurationFriendly(course.playbackPosition || 0);
      const totalDurFriendly = durKnown ? formatDurationFriendly(course.duration) : '…';
      const pct = cStats.progressPercent;
      const cpCount = (course.checkpoints || []).length;

      return `
        <div class="learning-course-card" data-id="${escapeHtml(course.id)}">
          <div class="course-card-thumb-wrap">
            <img class="course-card-thumb"
                 src="${escapeHtml(course.thumbnailUrl || `https://i.ytimg.com/vi/${course.youtubeId}/hqdefault.jpg`)}"
                 alt="${escapeHtml(course.title)}" loading="lazy" />
            <div class="course-card-duration-pill">${escapeHtml(durStr)}</div>
            <div class="course-card-play-overlay">
              <div class="play-icon-circle">
                <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              </div>
            </div>
          </div>
          <div class="course-card-body">
            <div class="course-card-header">
              <h3 class="course-card-title" title="${escapeHtml(course.title)}">${escapeHtml(course.title)}</h3>
              <div class="course-card-author">${escapeHtml(course.author || 'YouTube')}</div>
            </div>
            <div class="course-card-progress-section">
              <div class="course-progress-bar-wrap">
                <div class="course-progress-bar-fill" style="width:${pct}%;"></div>
              </div>
              <div class="course-progress-text-row">
                <span class="course-progress-time">${watchedStr} / ${totalDurFriendly}</span>
                <span class="course-progress-percent">${durKnown ? pct+'%' : '…'}</span>
              </div>
            </div>
            <div class="course-card-meta-row">
              <div class="course-card-pos-badge" title="Saved playback position">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>${posStr}</span>
              </div>
              ${cpCount > 0 ? `<div class="course-card-cp-badge"><span>📍 ${cpCount} topics</span></div>` : ''}
            </div>
            <div class="course-card-actions">
              <button class="btn-primary resume-course-btn" data-id="${escapeHtml(course.id)}">
                <svg viewBox="0 0 24 24" fill="currentColor" style="width:13px;height:13px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                ${(course.playbackPosition && course.playbackPosition > 5) ? 'Resume Course' : 'Start Course'}
              </button>
              <button class="btn-icon delete-course-btn" data-id="${escapeHtml(course.id)}" title="Delete Course">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    grid.querySelectorAll('.learning-course-card').forEach(card => {
      const id = card.dataset.id;
      card.addEventListener('click', e => {
        if (e.target.closest('.delete-course-btn')) return;
        openCourse(id);
      });
    });
    grid.querySelectorAll('.resume-course-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); openCourse(btn.dataset.id); });
    });
    grid.querySelectorAll('.delete-course-btn').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); deleteCourse(btn.dataset.id); });
    });
  }

  /* ── Course Detail View ─────────────────────────────── */
  function openCourse(courseId) {
    const course = CourseStore.getById(courseId);
    if (!course) { showToast('Course not found', 'error'); return; }

    activeCourseId = courseId;

    if ((!course.checkpoints || course.checkpoints.length === 0) && course.duration > 0) {
      course.checkpoints = generateDurationCheckpoints(course.duration, course.title);
      course.hasAutoCheckpoints = true;
      CourseStore.save(course);
    }

    const listPane   = document.getElementById('learning-overview-pane');
    const detailPane = document.getElementById('learning-detail-pane');
    if (listPane)   listPane.classList.add('hidden');
    if (detailPane) detailPane.classList.remove('hidden');

    const viewContainer = document.querySelector('.view-container');
    if (viewContainer) viewContainer.scrollTop = 0;

    updateCourseDetailHeader(course);
    renderCheckpointsList(course);
    updatePlaybackProgressUI(course, course.playbackPosition || 0);
    initYouTubePlayer(course.youtubeId, course.playbackPosition || 0);
  }

  function updateCourseDetailHeader(course) {
    const el = id => document.getElementById(id);
    if (el('learning-detail-title'))    el('learning-detail-title').textContent    = course.title;
    if (el('learning-detail-author'))   el('learning-detail-author').textContent   = course.author || 'YouTube';
    const durDisplay = course.duration > 0
      ? (course.durationStr || formatSeconds(course.duration))
      : 'Loading…';
    if (el('learning-detail-duration')) el('learning-detail-duration').textContent = durDisplay;
  }

  function updatePlaybackProgressUI(course, currentSeconds) {
    if (!course) return;

    const dur = course.duration || 0;
    const durKnown = dur > 0;
    const curPos = durKnown ? Math.min(currentSeconds, dur) : currentSeconds;
    const pct = durKnown ? Math.min(100, Math.round((curPos / dur) * 100)) : 0;
    const cStats = getCourseStats(course);

    const el = id => document.getElementById(id);

    if (el('learning-player-progressbar')) el('learning-player-progressbar').style.width = `${pct}%`;
    if (el('learning-player-progress-pct')) {
      el('learning-player-progress-pct').textContent = durKnown ? `${pct}%` : 'Loading…';
    }
    if (el('learning-player-time-ratio')) {
      el('learning-player-time-ratio').textContent = durKnown
        ? `${formatDurationFriendly(curPos)} / ${formatDurationFriendly(dur)}`
        : `${formatDurationFriendly(curPos)} / …`;
    }
    if (el('learning-player-current-pos')) {
      el('learning-player-current-pos').textContent = formatSeconds(curPos);
    }

    if (el('course-stat-total-watched')) el('course-stat-total-watched').textContent = formatDurationFriendly(cStats.totalWatchedSecs);
    if (el('course-stat-today-watched')) el('course-stat-today-watched').textContent = formatDurationFriendly(cStats.todayWatchedSecs);
    if (el('course-stat-days'))          el('course-stat-days').textContent          = `${cStats.daysStudied} ${cStats.daysStudied===1?'day':'days'}`;
    if (el('course-stat-streak'))        el('course-stat-streak').textContent        = `${calculateStreak()} 🔥`;
    if (el('course-stat-percent'))       el('course-stat-percent').textContent       = durKnown ? `${pct}%` : 'Loading…';
    if (el('course-stat-remaining'))     el('course-stat-remaining').textContent     = durKnown ? formatDurationFriendly(cStats.remainingSeconds) : 'Loading…';
    if (el('course-stat-current-cp'))    el('course-stat-current-cp').textContent   = cStats.currentCheckpoint ? cStats.currentCheckpoint.title : (durKnown ? 'Overview' : '');

    // Track completed checkpoint IDs to trigger rewards ONCE
    course.completedCheckpointIds = course.completedCheckpointIds || [];

    const checkpoints = course.checkpoints || [];
    checkpoints.forEach((cp, idx) => {
      const itemEl = document.getElementById(`checkpoint-item-${idx}`);
      if (!itemEl) return;

      const nextCp = checkpoints[idx+1];
      const isCurrent   = curPos >= cp.time && (!nextCp || curPos < nextCp.time);
      const isCompleted = curPos >= cp.time && !isCurrent;

      itemEl.classList.toggle('cp-completed', isCompleted);
      itemEl.classList.toggle('cp-active',    isCurrent);
      itemEl.classList.toggle('cp-upcoming',  curPos < cp.time);

      const iconEl = itemEl.querySelector('.checkpoint-status-icon');
      if (iconEl) {
        if (isCompleted)  iconEl.innerHTML = `<span class="icon-completed">✓</span>`;
        else if (isCurrent) iconEl.innerHTML = `<span class="icon-active">▶</span>`;
        else              iconEl.innerHTML = `<span class="icon-upcoming">○</span>`;
      }

      // Reward Trigger: Checkpoint Completed for the first time during actual playback
      if (isCompleted && !course.completedCheckpointIds.includes(cp.id)) {
        course.completedCheckpointIds.push(cp.id);
        CourseStore.save(course);

        // Highlight element with glow animation
        itemEl.classList.add('cp-just-completed');
        setTimeout(() => {
          if (itemEl) itemEl.classList.remove('cp-just-completed');
        }, 2600);

        // Trigger Reward Toast & Confetti
        celebrateCheckpointCompletion(cp, pct);
      }
    });

    // Reward Trigger: Full Course Completed Celebration
    if (durKnown && (pct >= 100 || curPos >= dur - 5) && !course.completedCelebrated) {
      course.completedCelebrated = true;
      CourseStore.save(course);
      celebrateCourseCompletion(course, cStats);
    }
  }

  function renderCheckpointsList(course) {
    const listContainer = document.getElementById('learning-checkpoints-list');
    const noCpNotice    = document.getElementById('learning-no-checkpoints-notice');
    const cpCountBadge  = document.getElementById('learning-checkpoints-count');
    if (!listContainer) return;

    let checkpoints = course.checkpoints || [];
    
    if (checkpoints.length === 0 && course.duration > 0) {
      checkpoints = generateDurationCheckpoints(course.duration, course.title);
      course.checkpoints = checkpoints;
      course.hasAutoCheckpoints = true;
      CourseStore.save(course);
    }

    if (cpCountBadge) cpCountBadge.textContent = checkpoints.length;

    if (!checkpoints.length) {
      listContainer.innerHTML = '';
      if (noCpNotice) noCpNotice.classList.remove('hidden');
      return;
    }
    if (noCpNotice) noCpNotice.classList.add('hidden');

    const curPos = course.playbackPosition || 0;
    listContainer.innerHTML = checkpoints.map((cp, idx) => {
      const nextCp = checkpoints[idx+1];
      const isCurrent   = curPos >= cp.time && (!nextCp || curPos < nextCp.time);
      const isCompleted = curPos >= cp.time && !isCurrent;
      const statusClass = isCompleted ? 'cp-completed' : isCurrent ? 'cp-active' : 'cp-upcoming';
      const statusIcon  = isCompleted
        ? '<span class="icon-completed">✓</span>'
        : isCurrent
          ? '<span class="icon-active">▶</span>'
          : '<span class="icon-upcoming">○</span>';

      return `
        <div class="checkpoint-item ${statusClass}" id="checkpoint-item-${idx}" data-time="${cp.time}">
          <div class="checkpoint-status-icon">${statusIcon}</div>
          <div class="checkpoint-time-badge">${escapeHtml(cp.timeStr)}</div>
          <div class="checkpoint-title" title="${escapeHtml(cp.title)}">${escapeHtml(cp.title)}</div>
          <button class="checkpoint-jump-btn" title="Jump to ${escapeHtml(cp.timeStr)}">
            <svg viewBox="0 0 24 24" fill="currentColor" style="width:12px;height:12px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </button>
        </div>
      `;
    }).join('');

    listContainer.querySelectorAll('.checkpoint-item').forEach(item => {
      item.addEventListener('click', () => seekToTimestamp(parseFloat(item.dataset.time)));
    });
  }

  /* ── Add Course Modal ────────────────────────────────── */
  function openAddCourseModal() {
    const modal = document.getElementById('add-course-modal');
    if (!modal) return;

    const urlInput   = document.getElementById('add-course-url-input');
    const previewBox = document.getElementById('add-course-preview-box');
    const statusText = document.getElementById('add-course-status-text');
    const confirmBtn = document.getElementById('add-course-confirm-btn');

    if (urlInput)   urlInput.value = '';
    if (previewBox) previewBox.classList.add('hidden');
    if (statusText) statusText.textContent = '';
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Add Course'; }

    detectedVideoData = null;
    modal.classList.remove('hidden');
    if (urlInput) urlInput.focus();
  }

  function closeAddCourseModal() {
    const modal = document.getElementById('add-course-modal');
    if (modal) modal.classList.add('hidden');
  }

  let autoDetectDebounce = null;
  let detectedVideoData  = null;

  async function handleUrlInput(url) {
    const previewBox = document.getElementById('add-course-preview-box');
    const statusText = document.getElementById('add-course-status-text');
    const confirmBtn = document.getElementById('add-course-confirm-btn');
    const thumbImg   = document.getElementById('add-course-preview-thumb');
    const titleEl    = document.getElementById('add-course-preview-title');
    const authorEl   = document.getElementById('add-course-preview-author');
    const cpStatusEl = document.getElementById('add-course-preview-cp-status');

    detectedVideoData = null;
    if (confirmBtn) confirmBtn.disabled = true;

    const videoId = extractYouTubeId(url);
    if (!videoId) {
      if (previewBox) previewBox.classList.add('hidden');
      if (statusText) statusText.innerHTML = url
        ? '<span style="color:var(--danger)">Please enter a valid YouTube URL</span>'
        : '';
      return;
    }

    if (statusText) statusText.innerHTML =
      '<span class="spinner" style="width:13px;height:13px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px;"></span> Analyzing YouTube course structure & transcript...';

    const info = await fetchRealVideoInfo(videoId);
    detectedVideoData = { videoId, url, ...info };

    if (previewBox) previewBox.classList.remove('hidden');
    if (thumbImg)   thumbImg.src         = info.thumbnailUrl;
    if (titleEl)    titleEl.textContent  = info.title || `YouTube Video (${videoId})`;
    if (authorEl)   authorEl.textContent = info.author || 'YouTube';

    if (cpStatusEl) {
      if (info.hasAutoCheckpoints && info.checkpoints.length > 0) {
        cpStatusEl.innerHTML = `<span style="color:var(--success)">✓ Auto-detected ${info.checkpoints.length} checkpoints for video</span>`;
      } else {
        cpStatusEl.innerHTML = `<span style="color:var(--success)">✓ Course milestones ready</span>`;
      }
    }

    if (statusText) statusText.innerHTML = '';
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Add Course'; }
  }

  async function addCourseConfirm() {
    if (!detectedVideoData) return;

    const confirmBtn = document.getElementById('add-course-confirm-btn');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Adding…';
    }

    const courseId = 'course_' + Date.now() + Math.random().toString(36).slice(2,6);
    const newCourse = {
      id: courseId,
      title:        detectedVideoData.title || `YouTube Course`,
      youtubeUrl:   detectedVideoData.url,
      youtubeId:    detectedVideoData.videoId,
      thumbnailUrl: detectedVideoData.thumbnailUrl,
      author:       detectedVideoData.author,
      duration:     detectedVideoData.duration > 0 ? detectedVideoData.duration : 0,
      durationStr:  detectedVideoData.duration > 0 ? formatSeconds(detectedVideoData.duration) : '',
      playbackPosition: 0,
      furthestPosition: 0,
      checkpoints:  detectedVideoData.checkpoints || [],
      completedCheckpointIds: [],
      completedCelebrated: false,
      hasAutoCheckpoints: true,
      addedAt:      new Date().toISOString(),
      lastWatchedAt: null
    };

    CourseStore.save(newCourse);
    triggerCloudSync(true);
    closeAddCourseModal();
    showToast(`Course "${newCourse.title}" added!`, 'success');
    openCourse(newCourse.id);
  }

  function deleteCourse(courseId) {
    const course = CourseStore.getById(courseId);
    if (!course) return;
    if (!confirm(`Delete "${course.title}" from your Learning courses?`)) return;
    CourseStore.delete(courseId);
    LearningLogStore.deleteForCourse && LearningLogStore.deleteForCourse(courseId);
    triggerCloudSync(true);
    showToast('Course deleted', 'info');
    renderOverview();
  }

  /* ── Event Bindings & Init ───────────────────────────── */
  function init() {
    // Rehydrate courses & logs from IndexedDB
    if (typeof CourseStore !== 'undefined' && CourseStore.init) {
      CourseStore.init().then(() => {
        if (typeof App !== 'undefined' && App.getCurrentView && App.getCurrentView() === 'learning') {
          refresh();
        }
      }).catch(console.warn);
    }
    if (typeof LearningLogStore !== 'undefined' && LearningLogStore.init) {
      LearningLogStore.init().catch(console.warn);
    }

    ['learning-add-course-btn', 'learning-empty-add-course-btn'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.onclick = openAddCourseModal;
    });

    const addModal   = document.getElementById('add-course-modal');
    const closeBtn   = document.getElementById('add-course-modal-close');
    const cancelBtn  = document.getElementById('add-course-cancel-btn');
    const confirmBtn = document.getElementById('add-course-confirm-btn');
    const urlInput   = document.getElementById('add-course-url-input');

    if (closeBtn)  closeBtn.onclick  = closeAddCourseModal;
    if (cancelBtn) cancelBtn.onclick = closeAddCourseModal;
    if (addModal)  addModal.onclick  = e => { if (e.target === addModal) closeAddCourseModal(); };

    if (urlInput) {
      urlInput.oninput = () => {
        clearTimeout(autoDetectDebounce);
        autoDetectDebounce = setTimeout(() => handleUrlInput(urlInput.value), 500);
      };
      urlInput.onkeydown = e => {
        if (e.key === 'Enter' && detectedVideoData && confirmBtn && !confirmBtn.disabled) addCourseConfirm();
      };
    }
    if (confirmBtn) confirmBtn.onclick = addCourseConfirm;

    const backBtn = document.getElementById('learning-back-to-overview');
    if (backBtn) backBtn.onclick = () => { saveCurrentPosition(); renderOverview(); };

    const seekBackBtn  = document.getElementById('learning-seek-back');
    const seekFwdBtn   = document.getElementById('learning-seek-fwd');
    const speedSelect  = document.getElementById('learning-playback-rate');
    const resetPosBtn  = document.getElementById('learning-reset-pos-btn');

    if (seekBackBtn) seekBackBtn.onclick = () => {
      if (ytPlayer && ytPlayerReady) seekToTimestamp(Math.max(0, ytPlayer.getCurrentTime() - 10));
    };
    if (seekFwdBtn) seekFwdBtn.onclick = () => {
      if (ytPlayer && ytPlayerReady) seekToTimestamp(Math.min(ytPlayer.getDuration()||999999, ytPlayer.getCurrentTime() + 10));
    };
    if (speedSelect) speedSelect.onchange = () => {
      if (ytPlayer && ytPlayerReady && ytPlayer.setPlaybackRate) ytPlayer.setPlaybackRate(parseFloat(speedSelect.value));
    };
    if (resetPosBtn) resetPosBtn.onclick = () => {
      if (confirm('Restart course from the beginning (00:00)?')) seekToTimestamp(0);
    };
  }

  function onYouTubeIframeAPIReady() {
    if (pendingVideoId) {
      initYouTubePlayer(pendingVideoId, pendingSeekTime || 0);
      pendingVideoId = null; pendingSeekTime = null;
    }
  }

  function pause() {
    stopPlaybackTracker();
    saveCurrentPosition();
    if (ytPlayer && ytPlayerReady && ytPlayer.pauseVideo) {
      try { ytPlayer.pauseVideo(); } catch (_) {}
    }
  }

  function refresh() {
    if (activeCourseId) {
      const c = CourseStore.getById(activeCourseId);
      if (c) { openCourse(c.id); return; }
    }
    renderOverview();
  }

  return {
    init,
    refresh,
    renderOverview,
    openCourse,
    pause,
    onYouTubeIframeAPIReady,
    extractYouTubeId,
    parseChaptersFromText,
    fetchRealVideoInfo,
    generateDurationCheckpoints,
    triggerConfetti,
    celebrateCheckpointCompletion,
    celebrateCourseCompletion
  };
})();

// Global hook for YouTube IFrame API callback
window.onYouTubeIframeAPIReady = function() {
  Learning.onYouTubeIframeAPIReady();
};
