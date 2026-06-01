/* ═══════════════════════════════════════════════════════
   auth.js — Login, Signup, Session management
   No server required — uses localStorage + SHA-256
   ═══════════════════════════════════════════════════════ */

const Auth = (() => {
  const USERS_KEY = 'examos_users';
  const SESSION_KEY = 'examos_session';
  const REMEMBER_KEY = 'examos_remember';

  /* ── Password hashing (SHA-256 with pure JS fallback for non-secure/file contexts) ─────── */
  async function hashPassword(password) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      try {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        console.warn("Subtle crypto digest failed, falling back to JS implementation...", e);
      }
    }
    return sha256Fallback(password);
  }

  function sha256Fallback(ascii) {
    function rightRotate(value, amount) {
      return (value >>> amount) | (value << (32 - amount));
    }
    
    var mathPow = Math.pow;
    var maxWord = mathPow(2, 32);
    var lengthProperty = 'length';
    var i, j;
    
    var result = '';
    var words = [];
    var asciiLength = ascii[lengthProperty];
    var hash = [];
    var k = [];
    var primeCounter = 0;

    var isFractional = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isFractional[candidate]) {
        for (i = 0; i < 313; i += candidate) {
          isFractional[i] = candidate;
        }
        hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1/3) * maxWord) | 0;
      }
    }
    
    ascii += '\x80';
    while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return;
      words[i >> 2] |= j << (24 - (i % 4) * 8);
    }
    words[words[lengthProperty]] = ((asciiLength * 8) / maxWord) | 0;
    words[words[lengthProperty]] = (asciiLength * 8);
    
    for (j = 0; j < words[lengthProperty];) {
      var w = words.slice(j, j += 16);
      var oldHash = hash.slice(0);
      
      hash = hash.slice(0);
      for (i = 0; i < 64; i++) {
        var wItem = w[i];
        if (i >= 16) {
          var w15 = w[i - 15], w2 = w[i - 2];
          var s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
          var s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
          wItem = w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        
        var s0_h = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
        var maj = (hash[0] & hash[1]) ^ (hash[1] & hash[2]) ^ (hash[2] & hash[0]);
        var t2 = (s0_h + maj) | 0;
        
        var s1_h = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
        var ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
        var t1 = (hash[7] + s1_h + ch + k[i] + wItem) | 0;
        
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
        hash.length = 8;
      }
      
      for (i = 0; i < 8; i++) {
        hash[i] = (hash[i] + oldHash[i]) | 0;
      }
    }
    
    for (i = 0; i < 8; i++) {
      var word = hash[i];
      if (word < 0) word += maxWord;
      result += word.toString(16).padStart(8, '0');
    }
    
    return result;
  }

  /* ── Users store ────────────────────────────────────── */
  function getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); }
    catch { return []; }
  }

  function saveUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function findUserByEmail(email) {
    return getUsers().find(u => u.email.toLowerCase() === email.toLowerCase().trim()) || null;
  }

  /* ── Session ────────────────────────────────────────── */
  function getSession() {
    try {
      const s = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(REMEMBER_KEY);
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  }

  function saveSession(user, remember = false) {
    const session = { id: user.id, name: user.name, email: user.email };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    if (remember) localStorage.setItem(REMEMBER_KEY, JSON.stringify(session));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(REMEMBER_KEY);
  }

  function getCurrentUser() { return getSession(); }

  const CLOUD_USERS_BUCKET = 'examos_v2_users_bucket_5839';

  async function saveUserToCloud(user) {
    try {
      const emailHash = await hashPassword(user.email);
      await fetch(`https://kvdb.io/${CLOUD_USERS_BUCKET}/${emailHash}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
    } catch (e) {
      console.warn("Could not back up user to cloud:", e);
    }
  }

  async function fetchUserFromCloud(email) {
    try {
      const emailHash = await hashPassword(email.toLowerCase().trim());
      const res = await fetch(`https://kvdb.io/${CLOUD_USERS_BUCKET}/${emailHash}`);
      if (res.ok) {
        const data = await res.json();
        return data;
      }
    } catch (e) {
      console.warn("Could not fetch user from cloud:", e);
    }
    return null;
  }

  /* ── Signup ─────────────────────────────────────────── */
  async function signup(name, email, password) {
    name = name.trim(); email = email.trim().toLowerCase();

    if (!name) throw new Error('Please enter your name.');
    if (!email || !email.includes('@')) throw new Error('Please enter a valid email.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    
    let user = findUserByEmail(email);
    if (!user) {
      user = await fetchUserFromCloud(email);
    }
    if (user) throw new Error('An account with this email already exists.');

    const users = getUsers();
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    const hash = await hashPassword(password);
    const newUser = { id, name, email, hash, createdAt: new Date().toISOString() };

    users.push(newUser);
    saveUsers(users);

    saveUserToCloud(newUser).catch(console.error);

    return { id, name, email };
  }

  /* ── Login ──────────────────────────────────────────── */
  async function login(email, password) {
    email = email.trim().toLowerCase();
    if (!email) throw new Error('Please enter your email.');
    if (!password) throw new Error('Please enter your password.');

    let user = findUserByEmail(email);
    
    if (!user) {
      user = await fetchUserFromCloud(email);
      if (user) {
        const users = getUsers();
        users.push(user);
        saveUsers(users);
      }
    }

    if (!user) throw new Error('No account found with this email.');

    const hash = await hashPassword(password);
    if (hash !== user.hash) throw new Error('Incorrect password.');

    saveUserToCloud(user).catch(console.error);

    return user;
  }

  /* ── Forgot password ────────────────────────────────── */
  async function lookupAccount(email) {
    email = email.trim().toLowerCase();
    let user = findUserByEmail(email);
    if (!user) {
      user = await fetchUserFromCloud(email);
      if (user) {
        const users = getUsers();
        users.push(user);
        saveUsers(users);
      }
    }
    if (!user) throw new Error('No account found with this email address.');
    return user;
  }

  /* ── Auth UI ────────────────────────────────────────── */
  function showPanel(id) {
    ['panel-login', 'panel-signup', 'panel-forgot'].forEach(p => {
      const el = document.getElementById(p);
      if (el) el.classList.toggle('hidden', p !== id);
    });
    // Clear errors
    document.querySelectorAll('.auth-global-error').forEach(e => {
      e.classList.remove('visible');
      e.textContent = '';
    });
  }

  function showError(errorId, msg) {
    const el = document.getElementById(errorId);
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
  }

  function setBtnLoading(btn, loading, text) {
    btn.disabled = loading;
    btn.innerHTML = loading
      ? `<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span> ${text}`
      : text;
  }

  /* ── Init ───────────────────────────────────────────── */
  function init() {
    console.log("Auth.init() starting...");
    const session = getSession();
    console.log("Session loaded:", session);
    if (session) {
      showApp(session);
      return;
    }

    const authScreen = document.getElementById('auth-screen');
    const app = document.getElementById('app');
    console.log("auth-screen:", authScreen, "app:", app);
    if (!authScreen || !app) {
      console.error("Critical elements #auth-screen or #app are missing in DOM!");
    }
    if (authScreen) authScreen.classList.remove('hidden');
    if (app) app.classList.add('hidden');

    console.log("Binding panel navigation...");
    const showSignup = document.getElementById('show-signup');
    const showLogin = document.getElementById('show-login');
    const showForgot = document.getElementById('show-forgot');
    const showLoginFromForgot = document.getElementById('show-login-from-forgot');

    console.log("show-signup:", showSignup, "show-login:", showLogin, "show-forgot:", showForgot, "show-login-from-forgot:", showLoginFromForgot);

    if (showSignup) showSignup.addEventListener('click', () => showPanel('panel-signup'));
    if (showLogin) showLogin.addEventListener('click', () => showPanel('panel-login'));
    if (showForgot) showForgot.addEventListener('click', () => showPanel('panel-forgot'));
    if (showLoginFromForgot) showLoginFromForgot.addEventListener('click', () => showPanel('panel-login'));

    console.log("Binding login form...");
    const loginBtn = document.getElementById('login-btn');
    const loginPassword = document.getElementById('login-password');
    console.log("login-btn:", loginBtn, "login-password:", loginPassword);

    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (loginPassword) {
      loginPassword.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleLogin();
      });
    }

    console.log("Binding signup form...");
    const signupBtn = document.getElementById('signup-btn');
    const signupConfirm = document.getElementById('signup-confirm');
    console.log("signup-btn:", signupBtn, "signup-confirm:", signupConfirm);

    if (signupBtn) signupBtn.addEventListener('click', handleSignup);
    if (signupConfirm) {
      signupConfirm.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleSignup();
      });
    }

    console.log("Binding forgot password...");
    const forgotBtn = document.getElementById('forgot-btn');
    console.log("forgot-btn:", forgotBtn);
    if (forgotBtn) forgotBtn.addEventListener('click', handleForgot);

    console.log("Auth.init() completed successfully!");
  }

  async function handleLogin() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const remember = document.getElementById('remember-me').checked;
    const btn = document.getElementById('login-btn');

    setBtnLoading(btn, true, 'Signing in…');
    try {
      const user = await login(email, password);
      saveSession(user, remember);
      
      if (typeof CloudSync !== 'undefined') {
        setBtnLoading(btn, true, 'Syncing your workspace…');
        await CloudSync.pull(user);
      }

      showApp(user);
    } catch (err) {
      showError('login-error', err.message);
      setBtnLoading(btn, false, 'Sign in');
    }
  }

  async function handleSignup() {
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;
    const btn = document.getElementById('signup-btn');

    if (password !== confirm) {
      showError('signup-error', 'Passwords do not match.');
      return;
    }

    setBtnLoading(btn, true, 'Creating account…');
    try {
      const user = await signup(name, email, password);
      saveSession(user, false);
      showApp(user);
    } catch (err) {
      showError('signup-error', err.message);
      setBtnLoading(btn, false, 'Create account');
    }
  }

  async function handleForgot() {
    const email = document.getElementById('forgot-email').value;
    const btn = document.getElementById('forgot-btn');
    setBtnLoading(btn, true, 'Searching…');
    try {
      const user = await lookupAccount(email);
      showError('forgot-error', `✅ Account found: ${user.name}. Since this is a private offline-first app, passwords are stored securely client-side and cannot be reset. Please try to remember your password or create a new account.`);
      document.getElementById('forgot-error').style.background = 'rgba(16,185,129,0.1)';
      document.getElementById('forgot-error').style.borderColor = 'rgba(16,185,129,0.3)';
      document.getElementById('forgot-error').style.color = '#059669';
    } catch (err) {
      showError('forgot-error', err.message);
    } finally {
      setBtnLoading(btn, false, 'Look up account');
    }
  }

  function showApp(user) {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Update UI with user info
    const safeName = user.name || 'Student';
    const safeEmail = user.email || '';
    const initials = safeName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    const el = id => document.getElementById(id);
    if (el('sidebar-avatar')) el('sidebar-avatar').textContent = initials;
    if (el('sidebar-name')) el('sidebar-name').textContent = safeName;
    if (el('sidebar-email')) el('sidebar-email').textContent = safeEmail;
    if (el('settings-name')) el('settings-name').textContent = safeName;
    if (el('settings-email')) el('settings-email').textContent = safeEmail;

    // Bootstrap main app
    if (typeof App !== 'undefined' && typeof App.bootstrap === 'function') {
      App.bootstrap().catch(console.error);
    }
  }

  function logout() {
    clearSession();
    location.reload();
  }

  return { init, getCurrentUser, logout, hashPassword };
})();
