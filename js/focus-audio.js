/* ═══════════════════════════════════════════════════════
   focus-audio.js — 100% Offline Web Audio Procedural Synthesizer
   Generates real-time ambient soundscapes: Rain, Waves, Campfire,
   Cafe, White/Pink Noise, and 40Hz Gamma Binaural Beats.
   ═══════════════════════════════════════════════════════ */

const FocusAudio = (() => {
  let ctx = null;
  let masterGain = null;
  let isMasterMuted = false;
  let masterVolume = 0.8;

  // Active track state: { id: { gainNode, nodes: [], volume: float, isPlaying: bool } }
  const tracks = {
    rain: { name: 'Rain & Storm', icon: '🌧️', volume: 0.5, isPlaying: false, gain: null, nodes: [] },
    waves: { name: 'Ocean Waves', icon: '🌊', volume: 0.4, isPlaying: false, gain: null, nodes: [] },
    campfire: { name: 'Campfire', icon: '🔥', volume: 0.5, isPlaying: false, gain: null, nodes: [] },
    cafe: { name: 'Cozy Cafe', icon: '☕', volume: 0.4, isPlaying: false, gain: null, nodes: [] },
    binaural: { name: '40Hz Focus Beats', icon: '🧠', volume: 0.35, isPlaying: false, gain: null, nodes: [] },
    noise: { name: 'Deep Pink Noise', icon: '💨', volume: 0.4, isPlaying: false, gain: null, nodes: [] }
  };

  const PRESETS = {
    deep_work: { name: 'Deep Work', config: { binaural: 0.45, noise: 0.3, rain: 0.2, waves: 0, campfire: 0, cafe: 0 } },
    stormy_night: { name: 'Stormy Night', config: { rain: 0.65, campfire: 0.45, binaural: 0, noise: 0, waves: 0, cafe: 0 } },
    cozy_cafe: { name: 'Cozy Cafe', config: { cafe: 0.55, rain: 0.3, campfire: 0, binaural: 0, noise: 0, waves: 0 } },
    ocean_zen: { name: 'Ocean Zen', config: { waves: 0.6, binaural: 0.3, rain: 0, campfire: 0, cafe: 0, noise: 0 } }
  };

  function getContext() {
    if (!ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        ctx = new AudioContextClass();
        masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);
        masterGain.connect(ctx.destination);
      }
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  }

  /* ── Noise Buffer Helpers ─────────────────────────────── */
  function createWhiteNoiseBuffer(seconds = 5) {
    const audioContext = getContext();
    if (!audioContext) return null;
    const bufferSize = audioContext.sampleRate * seconds;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  function createPinkNoiseBuffer(seconds = 5) {
    const audioContext = getContext();
    if (!audioContext) return null;
    const bufferSize = audioContext.sampleRate * seconds;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  /* ── Sound Synthesizers ───────────────────────────────── */

  // 1. Rain Synthesizer (Pink Noise + Lowpass + Randomized Resonant Drops)
  function createRainSynth(audioContext, trackGain) {
    const pinkBuffer = createPinkNoiseBuffer(6);
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = pinkBuffer;
    noiseSource.loop = true;

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(850, audioContext.currentTime);

    const highpass = audioContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(120, audioContext.currentTime);

    noiseSource.connect(filter);
    filter.connect(highpass);
    highpass.connect(trackGain);
    noiseSource.start();

    // Occasional gentle drops modulation
    const dropTimer = setInterval(() => {
      if (!tracks.rain.isPlaying || !ctx) {
        clearInterval(dropTimer);
        return;
      }
      try {
        const osc = audioContext.createOscillator();
        const dropGain = audioContext.createGain();
        osc.type = 'sine';
        const startFreq = 1200 + Math.random() * 800;
        osc.frequency.setValueAtTime(startFreq, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, audioContext.currentTime + 0.08);

        dropGain.gain.setValueAtTime(0.04 * tracks.rain.volume, audioContext.currentTime);
        dropGain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.08);

        osc.connect(dropGain);
        dropGain.connect(trackGain);
        osc.start();
        osc.stop(audioContext.currentTime + 0.09);
      } catch (e) {}
    }, 280);

    return [noiseSource, { stop: () => clearInterval(dropTimer) }];
  }

  // 2. Ocean Waves Synthesizer (LFO swept lowpass filter over pink noise)
  function createWavesSynth(audioContext, trackGain) {
    const pinkBuffer = createPinkNoiseBuffer(6);
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = pinkBuffer;
    noiseSource.loop = true;

    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, audioContext.currentTime);
    filter.Q.setValueAtTime(3, audioContext.currentTime);

    // LFO to modulate filter frequency slowly (ocean swell)
    const lfo = audioContext.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.12, audioContext.currentTime); // ~8 sec period

    const lfoGain = audioContext.createGain();
    lfoGain.gain.setValueAtTime(320, audioContext.currentTime);

    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    noiseSource.connect(filter);
    filter.connect(trackGain);

    noiseSource.start();
    lfo.start();

    return [noiseSource, lfo];
  }

  // 3. Campfire Synthesizer (Warm low rumble + random crackle transients)
  function createCampfireSynth(audioContext, trackGain) {
    const pinkBuffer = createPinkNoiseBuffer(5);
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = pinkBuffer;
    noiseSource.loop = true;

    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(300, audioContext.currentTime);

    noiseSource.connect(lowpass);
    lowpass.connect(trackGain);
    noiseSource.start();

    // Crackle generator
    const crackleInterval = setInterval(() => {
      if (!tracks.campfire.isPlaying || !ctx) {
        clearInterval(crackleInterval);
        return;
      }
      if (Math.random() > 0.35) {
        try {
          const osc = audioContext.createOscillator();
          const popGain = audioContext.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(150 + Math.random() * 800, audioContext.currentTime);
          popGain.gain.setValueAtTime(0.08 * tracks.campfire.volume, audioContext.currentTime);
          popGain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.03);

          osc.connect(popGain);
          popGain.connect(trackGain);
          osc.start();
          osc.stop(audioContext.currentTime + 0.04);
        } catch (e) {}
      }
    }, 120);

    return [noiseSource, { stop: () => clearInterval(crackleInterval) }];
  }

  // 4. Cafe Murmur (Multitonal filtered murmur noise)
  function createCafeSynth(audioContext, trackGain) {
    const pinkBuffer = createPinkNoiseBuffer(6);
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = pinkBuffer;
    noiseSource.loop = true;

    const bandpass1 = audioContext.createBiquadFilter();
    bandpass1.type = 'bandpass';
    bandpass1.frequency.setValueAtTime(600, audioContext.currentTime);
    bandpass1.Q.setValueAtTime(1.5, audioContext.currentTime);

    const bandpass2 = audioContext.createBiquadFilter();
    bandpass2.type = 'bandpass';
    bandpass2.frequency.setValueAtTime(1400, audioContext.currentTime);
    bandpass2.Q.setValueAtTime(2.0, audioContext.currentTime);

    const merger = audioContext.createGain();
    merger.gain.setValueAtTime(0.6, audioContext.currentTime);

    noiseSource.connect(bandpass1);
    noiseSource.connect(bandpass2);
    bandpass1.connect(merger);
    bandpass2.connect(merger);
    merger.connect(trackGain);

    noiseSource.start();
    return [noiseSource];
  }

  // 5. 40Hz Focus Binaural Beats (210Hz Left ear, 250Hz Right ear => 40Hz Gamma wave differential)
  function createBinauralSynth(audioContext, trackGain) {
    const merger = audioContext.createChannelMerger(2);

    const leftOsc = audioContext.createOscillator();
    leftOsc.type = 'sine';
    leftOsc.frequency.setValueAtTime(200, audioContext.currentTime);

    const rightOsc = audioContext.createOscillator();
    rightOsc.type = 'sine';
    rightOsc.frequency.setValueAtTime(240, audioContext.currentTime); // 40Hz difference for Gamma focus

    const leftGain = audioContext.createGain();
    leftGain.gain.setValueAtTime(0.5, audioContext.currentTime);

    const rightGain = audioContext.createGain();
    rightGain.gain.setValueAtTime(0.5, audioContext.currentTime);

    leftOsc.connect(leftGain);
    rightOsc.connect(rightGain);

    leftGain.connect(merger, 0, 0);
    rightGain.connect(merger, 0, 1);

    merger.connect(trackGain);

    leftOsc.start();
    rightOsc.start();

    return [leftOsc, rightOsc];
  }

  // 6. Deep Pink Noise
  function createNoiseSynth(audioContext, trackGain) {
    const pinkBuffer = createPinkNoiseBuffer(6);
    const noiseSource = audioContext.createBufferSource();
    noiseSource.buffer = pinkBuffer;
    noiseSource.loop = true;

    const lowpass = audioContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(1100, audioContext.currentTime);

    noiseSource.connect(lowpass);
    lowpass.connect(trackGain);
    noiseSource.start();

    return [noiseSource];
  }

  /* ── Track Control ────────────────────────────────────── */
  function startTrack(id) {
    const track = tracks[id];
    if (!track) return;

    const audioContext = getContext();
    if (!audioContext) return;

    if (track.isPlaying) return;

    // Create individual track gain node
    const trackGain = audioContext.createGain();
    trackGain.gain.setValueAtTime(track.volume, audioContext.currentTime);
    trackGain.connect(masterGain);
    track.gain = trackGain;

    let nodes = [];
    if (id === 'rain') nodes = createRainSynth(audioContext, trackGain);
    else if (id === 'waves') nodes = createWavesSynth(audioContext, trackGain);
    else if (id === 'campfire') nodes = createCampfireSynth(audioContext, trackGain);
    else if (id === 'cafe') nodes = createCafeSynth(audioContext, trackGain);
    else if (id === 'binaural') nodes = createBinauralSynth(audioContext, trackGain);
    else if (id === 'noise') nodes = createNoiseSynth(audioContext, trackGain);

    track.nodes = nodes;
    track.isPlaying = true;
    updateUI();
    saveState();
  }

  function stopTrack(id) {
    const track = tracks[id];
    if (!track || !track.isPlaying) return;

    if (track.gain && ctx) {
      try {
        track.gain.gain.setValueAtTime(track.gain.gain.value, ctx.currentTime);
        track.gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      } catch (e) {}
    }

    setTimeout(() => {
      if (track.nodes) {
        track.nodes.forEach(n => {
          try {
            if (typeof n.stop === 'function') n.stop();
            if (typeof n.disconnect === 'function') n.disconnect();
          } catch (e) {}
        });
      }
      track.nodes = [];
      track.gain = null;
      track.isPlaying = false;
      updateUI();
      saveState();
    }, 220);
  }

  function toggleTrack(id) {
    const track = tracks[id];
    if (!track) return;
    if (track.isPlaying) stopTrack(id);
    else startTrack(id);
  }

  function setTrackVolume(id, vol) {
    const track = tracks[id];
    if (!track) return;
    track.volume = Math.max(0, Math.min(1, vol));
    if (track.gain && ctx) {
      try {
        track.gain.gain.setValueAtTime(track.volume, ctx.currentTime);
      } catch (e) {}
    }
    saveState();
  }

  function setMasterVolume(vol) {
    masterVolume = Math.max(0, Math.min(1, vol));
    if (masterGain && ctx) {
      try {
        masterGain.gain.setValueAtTime(isMasterMuted ? 0 : masterVolume, ctx.currentTime);
      } catch (e) {}
    }
    const slider = document.getElementById('ambient-master-volume');
    if (slider) slider.value = Math.round(masterVolume * 100);
  }

  function stopAll() {
    Object.keys(tracks).forEach(id => {
      if (tracks[id].isPlaying) stopTrack(id);
    });
  }

  function applyPreset(presetKey) {
    const preset = PRESETS[presetKey];
    if (!preset) return;

    getContext();
    Object.entries(preset.config).forEach(([id, vol]) => {
      if (vol > 0) {
        setTrackVolume(id, vol);
        if (!tracks[id].isPlaying) startTrack(id);
      } else {
        if (tracks[id].isPlaying) stopTrack(id);
      }
      const slider = document.getElementById(`amb-vol-${id}`);
      if (slider) slider.value = Math.round(vol * 100);
    });
    updateUI();
  }

  /* ── State Persistence ────────────────────────────────── */
  function saveState() {
    const state = {};
    Object.keys(tracks).forEach(id => {
      state[id] = {
        volume: tracks[id].volume,
        isPlaying: tracks[id].isPlaying
      };
    });
    if (typeof LS !== 'undefined') {
      LS.set('focus_ambient_audio', {
        tracks: state,
        masterVolume
      });
    }
  }

  function loadState() {
    if (typeof LS === 'undefined') return;
    const saved = LS.get('focus_ambient_audio', null);
    if (saved && saved.tracks) {
      Object.keys(saved.tracks).forEach(id => {
        if (tracks[id]) {
          tracks[id].volume = saved.tracks[id].volume ?? tracks[id].volume;
        }
      });
      if (typeof saved.masterVolume === 'number') {
        masterVolume = saved.masterVolume;
      }
    }
  }

  /* ── UI Sync ──────────────────────────────────────────── */
  function updateUI() {
    Object.keys(tracks).forEach(id => {
      const card = document.getElementById(`amb-card-${id}`);
      const btn = document.getElementById(`amb-btn-${id}`);
      const waves = document.getElementById(`amb-waves-${id}`);
      const slider = document.getElementById(`amb-vol-${id}`);

      const isPlaying = tracks[id].isPlaying;

      if (card) card.classList.toggle('active', isPlaying);
      if (btn) btn.classList.toggle('active', isPlaying);
      if (waves) waves.classList.toggle('active', isPlaying);
      if (slider) slider.value = Math.round(tracks[id].volume * 100);
    });

    const anyPlaying = Object.values(tracks).some(t => t.isPlaying);
    const masterPlayBtn = document.getElementById('ambient-master-toggle');
    if (masterPlayBtn) {
      masterPlayBtn.innerHTML = anyPlaying
        ? `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg> Stop All`
        : `<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play Preset`;
      masterPlayBtn.classList.toggle('active', anyPlaying);
    }
  }

  function renderSoundboard(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = `
      <div class="ambient-mixer-header">
        <div class="ambient-title-wrap">
          <span class="ambient-badge">✨ Web Audio Synth</span>
          <h3>Ambient Soundscape</h3>
        </div>
        <div class="ambient-master-ctrls">
          <button class="btn-sm btn-ghost ambient-master-btn" id="ambient-master-toggle">
            <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Play Preset
          </button>
        </div>
      </div>

      <!-- Presets Chips -->
      <div class="ambient-presets">
        <button class="amb-preset-chip" data-preset="deep_work">🧠 Deep Work</button>
        <button class="amb-preset-chip" data-preset="stormy_night">🌧️ Stormy Night</button>
        <button class="amb-preset-chip" data-preset="cozy_cafe">☕ Cozy Cafe</button>
        <button class="amb-preset-chip" data-preset="ocean_zen">🌊 Ocean Zen</button>
      </div>

      <!-- Sound Cards Grid -->
      <div class="ambient-tracks-grid">
    `;

    Object.entries(tracks).forEach(([id, t]) => {
      html += `
        <div class="amb-track-card ${t.isPlaying ? 'active' : ''}" id="amb-card-${id}">
          <div class="amb-track-head">
            <div class="amb-track-icon-name" id="amb-btn-${id}" data-track="${id}">
              <span class="amb-icon">${t.icon}</span>
              <span class="amb-name">${t.name}</span>
            </div>
            <div class="amb-wave-eq ${t.isPlaying ? 'active' : ''}" id="amb-waves-${id}">
              <span></span><span></span><span></span><span></span>
            </div>
          </div>
          <div class="amb-slider-row">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="amb-vol-icon"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            <input type="range" class="amb-slider" id="amb-vol-${id}" data-track="${id}" min="0" max="100" value="${Math.round(t.volume * 100)}" />
          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;

    // Attach event listeners
    Object.keys(tracks).forEach(id => {
      const trigger = document.getElementById(`amb-btn-${id}`);
      if (trigger) {
        trigger.addEventListener('click', () => {
          toggleTrack(id);
        });
      }

      const slider = document.getElementById(`amb-vol-${id}`);
      if (slider) {
        slider.addEventListener('input', (e) => {
          const val = parseInt(e.target.value) / 100;
          setTrackVolume(id, val);
          if (!tracks[id].isPlaying && val > 0) {
            startTrack(id);
          }
        });
      }
    });

    // Preset buttons
    container.querySelectorAll('.amb-preset-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        applyPreset(btn.dataset.preset);
      });
    });

    // Master toggle
    const masterBtn = document.getElementById('ambient-master-toggle');
    if (masterBtn) {
      masterBtn.addEventListener('click', () => {
        const anyPlaying = Object.values(tracks).some(t => t.isPlaying);
        if (anyPlaying) {
          stopAll();
        } else {
          applyPreset('deep_work');
        }
      });
    }
  }

  function init() {
    loadState();
  }

  return {
    init,
    renderSoundboard,
    toggleTrack,
    startTrack,
    stopTrack,
    setTrackVolume,
    setMasterVolume,
    stopAll,
    applyPreset,
    getTracks: () => tracks
  };
})();
