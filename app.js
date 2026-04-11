/* ================================================================
   AntiProc - Anti-Procrastination Execution System  |  app.js
   ================================================================ */
import { isFirebaseReady, fbSignIn, fbSignOut, onAuthChange, pushState, pullState, deleteState } from './firebase.js';


const XP_PER_TASK = 10;
const XP_PENALTY = 20;
const PENALTY_INC = 15;
const XP_PER_LEVEL = 100;

const LEVEL_NAMES = [
  'Quirkless',        // 1
  'U.A. Hopeful',     // 2
  'Hero Course',      // 3
  'Provisional Hero', // 4
  'Pro Hero',         // 5
  'Top 10 Hero',      // 6
  'No. 1 Candidate',  // 7
  'One For All User', // 8
  'Symbol of Peace',  // 9
  'PLUS ULTRA'        // 10
];

const DEKU_QUOTES = [
  "I have to work harder than anyone else to make it! I'll never catch up otherwise! I want to be like you \u2014 the strongest hero.",
  "I'm not gonna be your worthless punching bag Deku forever. I'm the Deku who always does his best!",
  "Giving help that's not asked for \u2014 that's what makes a true hero!",
  "A smiling, dependable, cool hero \u2014 that's what I wanna be! That's why I'm giving it everything, for everyone!",
  "You'll be fine. After all, didn't you make an effort to reach out with a helping hand? You can be a hero. Do your best, kid!",
  "It's not about whether I can or can't. I have to do it.",
  "Even when I was quirkless, even when I had nothing \u2014 I kept moving forward. That's what makes a hero.",
  "No matter how many times I get knocked down, I'll get back up. That's the path I chose.",
  "My power isn't just mine. Everyone who came before me, everyone fighting alongside me \u2014 it all becomes One For All.",
  "A hero's duty isn't just to win \u2014 it's to protect the smile of every person standing behind you."
];

/* ---- State ---- */
const DEFAULT_CATEGORIES = ['DAA', 'Striver', 'Projects', 'OS', 'Probability', 'COA', 'PFL', 'Others'];

const initState = () => ({
  currentDate: dateKey(new Date()),
  tasks: [],        // today's tasks — frozen after finalization (including done)
  tomorrowQueue: [],        // tasks queued for tomorrow: carry-outs + new adds post-finalization
  streak: 0,
  bestStreak: 0,
  lastStreak: 0,
  streakRestoreUsed: false,
  xp: 0,
  penalty: 0,
  streakShielded: false,
  logs: {},
  focusSessions: [],
  reflections: {},
  categories: [...DEFAULT_CATEGORIES],
  guideDismissed: false,
  redemptions: {},
  badges: []
});

let state = loadState();
advanceDays();

let timerInterval = null;
let timerStartAt = null;
let timerElapsed = 0;
let timerRunning = false;
let timerTargetMs = 90 * 60 * 1000;
let timerAlarmFired = false;
let timerMode = 'ofa';

/* ---- Undo ---- */
let undoSnapshot = null;
let undoTimer = null;
let undoToastEl = null;

/* ---- Break Timer ---- */
let breakInterval = null;
let breakSeconds = 0;

/* ---- Cloud Sync ---- */
let fbUser = null;
let cloudPushTimer = null;
let firebaseInitialized = false;

/* ---- Analytics ---- */
let anDailyRange = 14;
let anEffRange = 20;
let anResizeTimer = null;

/* ---- History Filter ---- */
let histFilter = (() => { const t = dateKey(new Date()); return { from: t, to: t, preset: 'today' }; })();

/* ---- Quotes ---- */
let quoteIndex = 0;
let quoteTimer = null;

/* ---- Modal promise ---- */
let modalResolve = null;

/* ---- Boot ---- */
let appStarted = false;
initLoginScreen();

function initLoginScreen() {
  const screen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainApp');
  const googleBtn = document.getElementById('loginGoogleBtn');
  const offlineBtn = document.getElementById('loginOfflineBtn');

  function showApp(user) {
    if (appStarted) return;
    appStarted = true;
    screen.classList.add('hidden');
    setTimeout(() => { screen.style.display = 'none'; }, 360);
    mainApp.style.display = 'block';
    renderAll();
    wireEvents();
    startCountdown();
    initPersistUI();
    setGreeting();
    initGuide();
    initQuotes();
    requestNotificationPermission();
    if (user) initFirebase(user);
  }

  let unsub = () => { };
  offlineBtn.addEventListener('click', () => {
    // User intentionally chose offline mode; stop waiting for auth callbacks.
    unsub();
    showApp(null);
  });

  if (!isFirebaseReady()) {
    showApp(null);
    return;
  }

  // onAuthChange is the single source of truth — fires after redirect result is
  // processed AND after popup sign-in. Only unsub once we have a user so we
  // don't miss the async redirect-result resolution.
  unsub = onAuthChange((user) => {
    if (user) {
      unsub();
      showApp(user);
    }
  });

  googleBtn.addEventListener('click', async () => {
    googleBtn.disabled = true;
    googleBtn.textContent = 'Signing in…';
    try {
      await fbSignIn();
      // onAuthChange above fires and calls showApp once user is confirmed
    } catch (e) {
      googleBtn.disabled = false;
      googleBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"/></svg> Continue with Google';
      // popup-closed-by-user is not an error worth alerting
      if (e.code && e.code.includes('popup-closed')) return;
      if (e.code && e.code.includes('popup-blocked')) {
        alert('Popup was blocked by your browser. Please allow popups for this site and try again.');
        return;
      }
      alert('Sign-in failed: ' + e.message);
    }
  });
}

/* ==============================================================
   GUIDE
   ============================================================== */
function initGuide() {
  // Use localStorage so this persists across sessions — state resets on every load
  const dismissed = localStorage.getItem('antiproc-guide-dismissed') === '1';
  const panel = document.getElementById('guidePanel');
  const helpBtn = document.getElementById('showGuideBtn');
  if (dismissed) {
    panel.style.display = 'none';
    helpBtn.style.display = 'inline-flex';
  } else {
    panel.style.display = '';
    helpBtn.style.display = 'none';
  }
}

function dismissGuide() {
  localStorage.setItem('antiproc-guide-dismissed', '1');
  saveState();
  const panel = document.getElementById('guidePanel');
  panel.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
  panel.style.opacity = '0';
  panel.style.transform = 'translateY(-6px)';
  setTimeout(() => {
    panel.style.display = 'none';
    panel.style.opacity = '';
    panel.style.transform = '';
    panel.style.transition = '';
    document.getElementById('showGuideBtn').style.display = 'inline-flex';
  }, 260);
}

function showGuide() {
  localStorage.removeItem('antiproc-guide-dismissed');
  saveState();
  const panel = document.getElementById('guidePanel');
  panel.style.display = '';
  panel.style.opacity = '0';
  panel.style.transform = 'translateY(-6px)';
  panel.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
  document.getElementById('showGuideBtn').style.display = 'none';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panel.style.opacity = '1';
      panel.style.transform = 'translateY(0)';
      setTimeout(() => { panel.style.transition = ''; }, 300);
    });
  });
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/* ==============================================================
   PERSISTENCE
   ============================================================== */
const LS_KEY = 'antiproc-state-v2';

function makeId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now() + '-' + Math.floor(Math.random() * 1e9);
}

function normalizeState(raw) {
  const base = initState();
  if (!raw || typeof raw !== 'object') return base;

  const safeNum = (v, fallback) => (Number.isFinite(v) ? v : fallback);
  const safeStr = (v, fallback) => (typeof v === 'string' ? v : fallback);
  const safeBool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
  const safeObj = (v, fallback) => (v && typeof v === 'object' && !Array.isArray(v) ? v : fallback);

  const safeTask = (t) => ({
    id: safeStr(t?.id, makeId()),
    text: safeStr(t?.text, '').trim().slice(0, 100),
    cat: safeStr(t?.cat, 'Others').trim() || 'Others',
    done: !!t?.done,
    carry: !!t?.carry,
    carried: !!t?.carried
  });

  const categories = Array.isArray(raw.categories)
    ? raw.categories.filter(c => typeof c === 'string' && c.trim()).map(c => c.trim()).slice(0, 50)
    : base.categories;

  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map(safeTask).filter(t => t.text)
    : base.tasks;

  const tomorrowQueue = Array.isArray(raw.tomorrowQueue)
    ? raw.tomorrowQueue.map(safeTask).filter(t => t.text).slice(0, 3)
    : base.tomorrowQueue;

  const focusSessions = Array.isArray(raw.focusSessions)
    ? raw.focusSessions
      .filter(s => s && typeof s === 'object')
      .map(s => ({
        id: safeStr(s.id, makeId()),
        date: safeStr(s.date, base.currentDate),
        planned: Math.max(1, Math.min(480, Math.round(safeNum(s.planned, 60)))),
        actual: Math.max(1, Math.min(480, Math.round(safeNum(s.actual, 1)))),
        interruptions: Math.max(0, Math.min(99, Math.round(safeNum(s.interruptions, 0)))),
        startTime: typeof s.startTime === 'string' ? s.startTime : null,
        note: safeStr(s.note, '-')
      }))
    : base.focusSessions;

  return {
    ...base,
    currentDate: /^\d{4}-\d{2}-\d{2}$/.test(raw.currentDate) ? raw.currentDate : base.currentDate,
    tasks,
    tomorrowQueue,
    streak: Math.max(0, Math.round(safeNum(raw.streak, base.streak))),
    bestStreak: Math.max(0, Math.round(safeNum(raw.bestStreak, base.bestStreak))),
    lastStreak: Math.max(0, Math.round(safeNum(raw.lastStreak, base.lastStreak))),
    streakRestoreUsed: safeBool(raw.streakRestoreUsed, base.streakRestoreUsed),
    xp: Math.max(0, Math.round(safeNum(raw.xp, base.xp))),
    penalty: Math.max(0, Math.round(safeNum(raw.penalty, base.penalty))),
    streakShielded: false,
    logs: safeObj(raw.logs, {}),
    focusSessions,
    reflections: safeObj(raw.reflections, {}),
    categories: categories.length ? categories : [...DEFAULT_CATEGORIES],
    guideDismissed: safeBool(raw.guideDismissed, base.guideDismissed),
    redemptions: safeObj(raw.redemptions, {}),
    badges: Array.isArray(raw.badges) ? raw.badges : []
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return normalizeState(parsed);
    }
  } catch (e) {
    console.warn('[AntiProc] Failed to load local state:', e);
  }
  return initState();
}

function saveState() {
  const payload = JSON.stringify(state);
  // Always write to localStorage first (offline safety net)
  try { localStorage.setItem(LS_KEY, payload); } catch (e) { console.warn('[AntiProc] localStorage write failed:', e); }
  const meta = { savedAt: new Date().toISOString(), bytes: payload.length };
  updatePersistUI(meta);
  // Debounced cloud push — 3s after last save
  if (fbUser) {
    clearTimeout(cloudPushTimer);
    updateSyncUI('syncing');
    cloudPushTimer = setTimeout(() => {
      pushState(fbUser.uid, payload, meta.savedAt)
        .then(() => updateSyncUI('synced'))
        .catch(() => updateSyncUI('error'));
    }, 3000);
  }
}

function initPersistUI() {
  // If localStorage already has data, show a meaningful status immediately
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      updatePersistUI({ savedAt: new Date().toISOString(), bytes: raw.length });
      return;
    }
  } catch (_) { }
  updatePersistUI(null);
}

function updatePersistUI(meta) {
  const dot = document.getElementById('persistDot');
  const status = document.getElementById('persistStatus');
  if (!dot || !status) return;
  if (!meta) {
    dot.className = 'persist-dot warn';
    status.textContent = 'No saved data found yet. Add a task to create your first save.';
    return;
  }
  const d = new Date(meta.savedAt);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const kb = (meta.bytes / 1024).toFixed(1);
  dot.className = 'persist-dot ok';
  status.textContent = 'Data safe \u2022 Last saved: ' + date + ' at ' + time + ' \u2022 ' + kb + ' KB \u2022 \u2601 Cloud sync';
}

/* ==============================================================
   DATE UTILS
   ============================================================== */
function dateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}
function pad(n) { return String(n).padStart(2, '0'); }

function addDays(ds, n) {
  const d = new Date(ds + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

function dayDiff(from, to) {
  return Math.max(0, Math.floor(
    (new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000
  ));
}

/* ==============================================================
   XP / LEVEL
   ============================================================== */
function levelFromXp(xp) { return Math.floor(xp / XP_PER_LEVEL) + 1; }
function levelName(lvl) { return LEVEL_NAMES[Math.min(lvl - 1, LEVEL_NAMES.length - 1)]; }
function xpInLevel(xp) { return xp % XP_PER_LEVEL; }
function xpPct(xp) { return (xpInLevel(xp) / XP_PER_LEVEL) * 100; }

/* ==============================================================
   DAY FINALIZATION
   ============================================================== */
function finalizeDay(day) {
  /*
   * ACTIVE = every task NOT carry-marked out.
   * This includes both fresh tasks AND tasks carried-in from previous days.
   * Carry-marked tasks leave the active pool — they go to tomorrow.
   * Streak requires ALL active tasks to be done AND at least 3 planned.
   */
  const activeTasks = state.tasks.filter(t => !t.carry);
  const planned = activeTasks.length;
  const completed = activeTasks.filter(t => t.done).length;
  const allDone = planned >= 3 && completed >= 3;
  const status = allDone ? 'completed' : completed > 0 ? 'partial' : 'missed';

  /* Category breakdown of every done task */
  const cats = {};
  state.tasks.filter(t => t.done).forEach(t => {
    cats[t.cat] = (cats[t.cat] || 0) + 1;
  });

  if (allDone) {
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    state.xp += XP_PER_TASK * 3;
    state.streakShielded = false;
    state.streakRestoreUsed = false; // new success day clears restore state
    state.lastStreak = 0;     // no break to restore anymore
  } else if (state.streakShielded) {
    state.streakShielded = false;
    state.penalty += PENALTY_INC;
    state.xp = Math.max(0, state.xp - XP_PENALTY);
  } else {
    // Only arm a new restore when the streak is freshly broken (streak > 0 → 0).
    // If streak was already 0 (already broken), preserve existing restore state
    // so the user doesn't lose the opportunity they already unlocked.
    if (state.streak > 0) {
      state.lastStreak = state.streak;
      state.streakRestoreUsed = false;
    }
    state.streak = 0;
    state.penalty += PENALTY_INC;
    state.xp = Math.max(0, state.xp - XP_PENALTY);
  }

  state.logs[day] = { planned, completed, status, cats };

  /*
   * Build tomorrowQueue:
   *   a) All undone tasks that are carry-marked or already-carried ? go to tomorrow as carried
   *   b) Any tasks the user manually added to tomorrowQueue after a previous finalization today
   * Cap: max 3 slots.
   * IMPORTANT: state.tasks is NOT modified here — it stays frozen for display.
   * advanceDays() will swap tomorrowQueue ? tasks when the calendar day rolls over.
   */
  const autoCarry = state.tasks
    .filter(t => !t.done && (t.carry || t.carried))
    .map(t => ({ ...t, carry: false, carried: true }));
  const carryIds = new Set(autoCarry.map(t => t.id));
  const keepQueue = (state.tomorrowQueue || []).filter(t => !carryIds.has(t.id));
  state.tomorrowQueue = [...autoCarry, ...keepQueue].slice(0, 3);

  /* state.tasks INTENTIONALLY left frozen — done tasks visible until next day rolls over */
}

function advanceDays() {
  const today = dateKey(new Date());
  const gap = dayDiff(state.currentDate, today);
  if (gap === 0) return;

  for (let i = 0; i < gap; i++) {
    const day = state.currentDate;
    /* Finalize any unfinalized day (overnight tab, multi-day gap) */
    if (!state.logs[day]) finalizeDay(day);
    /*
     * Day rolls over:
     * tomorrowQueue becomes the carried tasks for the new day.
     * state.tasks is replaced — old day's frozen snapshot is discarded.
     */
    state.tasks = (state.tomorrowQueue || []).map(
      // Preserve origin: only true carry-forward items remain marked as carried.
      t => ({ ...t, carry: false, carried: !!t.carried, done: false })
    );
    state.tomorrowQueue = [];
    state.currentDate = addDays(state.currentDate, 1);
  }
  saveState();
}

/* ==============================================================
   TOAST
   ============================================================== */
function toast(msg, type) {
  if (!type) type = 'info';
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function pushUndo(label) {
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
  if (undoToastEl) { undoToastEl.remove(); undoToastEl = null; }
  undoSnapshot = JSON.parse(JSON.stringify(state));
  const el = document.createElement('div');
  el.className = 'toast undo-toast';
  el.innerHTML =
    '<span class="undo-msg">' + label + '</span>' +
    '<button class="undo-btn" type="button">Undo</button>' +
    '<div class="undo-bar"></div>';
  document.getElementById('toastContainer').appendChild(el);
  undoToastEl = el;
  el.querySelector('.undo-btn').addEventListener('click', applyUndo);
  undoTimer = setTimeout(() => {
    if (undoToastEl === el) { el.remove(); undoToastEl = null; undoSnapshot = null; undoTimer = null; }
  }, 5000);
}

function applyUndo() {
  if (!undoSnapshot) return;
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
  if (undoToastEl) { undoToastEl.remove(); undoToastEl = null; }
  state = undoSnapshot;
  undoSnapshot = null;
  saveState(); renderAll();
  toast('Action undone.', 'info');
}

/* ==============================================================
   CUSTOM MODAL  (replaces confirm / prompt)
   resolves: { confirmed: bool, value: string }
   ============================================================== */
function showModal(options) {
  /*
    options: {
      title: string,
      body: string,
      confirmLabel?: string,
      cancelLabel?: string,
      inputPlaceholder?: string   // if set, shows input field
    }
  */
  return new Promise(resolve => {
    modalResolve = resolve;

    document.getElementById('modalTitle').textContent = options.title || '';
    document.getElementById('modalBody').textContent = options.body || '';
    document.getElementById('modalConfirm').textContent = options.confirmLabel || 'Confirm';
    document.getElementById('modalCancel').textContent = options.cancelLabel || 'Cancel';

    const inputWrap = document.getElementById('modalInputWrap');
    const input = document.getElementById('modalInput');

    if (options.inputPlaceholder) {
      inputWrap.style.display = 'block';
      input.placeholder = options.inputPlaceholder;
      input.value = '';
      setTimeout(() => input.focus(), 80);
    } else {
      inputWrap.style.display = 'none';
    }

    document.getElementById('modalOverlay').classList.add('open');
  });
}

function closeModal(confirmed) {
  const value = document.getElementById('modalInput').value;
  document.getElementById('modalOverlay').classList.remove('open');
  if (modalResolve) {
    modalResolve({ confirmed, value });
    modalResolve = null;
  }
}

/* ==============================================================
   COUNTDOWN
   ============================================================== */
function startCountdown() {
  let lastDate = dateKey(new Date());

  function tick() {
    const now = new Date();
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const diff = end - now;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const el = document.getElementById('countdown');
    if (!el) return;
    el.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
    el.className = 'countdown-time' + (h >= 4 ? ' safe' : '');

    /* Auto-advance when the calendar day changes (tab left open overnight) */
    const today = dateKey(now);
    if (today !== lastDate) {
      lastDate = today;
      const hadQueue = (state.tomorrowQueue || []).length > 0;
      advanceDays();
      renderAll();
      setGreeting();
      if (hadQueue) {
        toast('\uD83C\uDF05 New day! Your planned tasks are now active. Go PLUS ULTRA!', 'ok');
      } else {
        toast('\u26A1 New day. Set your 3 targets and go PLUS ULTRA!', 'ok');
      }
    }
  }
  tick();
  setInterval(tick, 1000);
}

/* ==============================================================
   GREETING
   ============================================================== */
function setGreeting() {
  const h = new Date().getHours();
  let msg;
  if (h < 5) msg = 'The night shift. Even heroes need sleep — but you\'re here.';
  else if (h < 9) msg = 'Early training session. Deku would approve. Start your 3 targets.';
  else if (h < 12) msg = 'Morning. Set your 3 training objectives and go PLUS ULTRA.';
  else if (h < 15) msg = 'Midday. No procrastination — real heroes don\'t wait for the right moment.';
  else if (h < 18) msg = 'Afternoon. How many targets are done? There is no izuku-ing out of this.';
  else if (h < 21) msg = 'Evening. Wrap up your session before midnight. OFA doesn\'t sleep.';
  else msg = 'Final hours. Finalize today or break your streak. Your choice, hero.';

  const el = document.getElementById('headerGreeting');
  if (el) el.textContent = msg;
}

/* ==============================================================
   FOCUS TIMER
   ============================================================== */
const TIMER_TARGET_MS = 90 * 60 * 1000;

function timerMs() {
  return timerRunning ? timerElapsed + (Date.now() - timerStartAt) : timerElapsed;
}

function timerTick() {
  const ms = timerMs();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const el = document.getElementById('timerDisplay');
  if (el) el.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);

  const bar = document.getElementById('timerProgressBar');
  if (bar) {
    const pct = Math.min(100, (ms / timerTargetMs) * 100);
    bar.style.width = pct + '%';
    const pctEl = document.getElementById('timerProgressPct');
    if (pctEl) pctEl.textContent = Math.floor(pct) + '%';
  }

  /* Alarm when target reached */
  if (ms >= timerTargetMs && timerRunning && !timerAlarmFired) {
    timerAlarmFired = true;
    triggerTimerAlarm();
  }
}

function setTimerBadge(label, cls) {
  const b = document.getElementById('timerStatusBadge');
  if (!b) return;
  b.textContent = label;
  b.className = 'status-badge' + (cls ? ' ' + cls : '');
}

function timerStart() {
  if (timerRunning) return;
  timerRunning = true;
  timerStartAt = Date.now();
  timerInterval = setInterval(timerTick, 500);
  const d = document.getElementById('timerDisplay');
  if (d) { d.classList.remove('paused'); d.classList.add('running'); }
  document.getElementById('timerStartBtn').disabled = true;
  document.getElementById('timerPauseBtn').disabled = false;
  document.getElementById('timerStopBtn').disabled = false;
  setTimerBadge('Running', 'running');
}

function timerPause() {
  if (!timerRunning) return;
  timerElapsed += Date.now() - timerStartAt;
  timerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  const d = document.getElementById('timerDisplay');
  if (d) { d.classList.remove('running'); d.classList.add('paused'); }
  document.getElementById('timerStartBtn').disabled = false;
  document.getElementById('timerPauseBtn').disabled = true;
  setTimerBadge('Paused', 'paused');
}

function timerStop() {
  timerPause();
  timerAlarmFired = false;
  const ms = timerElapsed;
  const minutes = Math.round(ms / 60000);
  timerElapsed = 0;

  const d = document.getElementById('timerDisplay');
  if (d) { d.textContent = '00:00:00'; d.className = 'timer-display'; }
  const bar = document.getElementById('timerProgressBar');
  if (bar) bar.style.width = '0%';
  const pctEl = document.getElementById('timerProgressPct');
  if (pctEl) pctEl.textContent = '0%';
  document.getElementById('timerStartBtn').disabled = false;
  document.getElementById('timerPauseBtn').disabled = true;
  document.getElementById('timerStopBtn').disabled = true;
  setTimerBadge('Idle');

  if (minutes < 1) { toast('Too short — minimum 1 min to log a session.', 'err'); return; }

  const note = document.getElementById('timerNote').value.trim();
  document.getElementById('timerNote').value = '';

  const plannedMins = timerMode === 'pomo' ? 25
    : timerMode === 'custom' ? Math.round(timerTargetMs / 60000)
      : Math.min(90, Math.max(60, minutes));
  pushUndo('Timer session logged.');
  /* Derive start time from timerStartAt */
  const _timerStartTime = timerStartAt
    ? new Date(timerStartAt).toTimeString().slice(0, 5)
    : null;
  state.focusSessions.unshift({
    id: makeId(),
    date: state.currentDate,
    planned: plannedMins,
    actual: minutes,
    interruptions: 0,
    startTime: _timerStartTime,
    note: note || (timerMode === 'pomo' ? 'Pomodoro session' : 'OFA deep work session')
  });

  /* XP reward: +5 XP per 15 min of real focus, minimum +5 */
  const xpEarned = Math.max(5, Math.floor(minutes / 15) * 5);
  state.xp += xpEarned;

  saveState();
  renderAll();
  toast('\u26A1 Session logged: ' + minutes + ' min \u00B7 +' + xpEarned + ' XP', 'ok');
}

/* ==============================================================
   EXPORT / IMPORT / RESET
   ============================================================== */
function exportData() {
  const payload = JSON.stringify({ apexVersion: 2, exportedAt: new Date().toISOString(), state }, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'antiproc-backup-' + dateKey(new Date()).replace(/-/g, '') + '.json';
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup downloaded.', 'ok');
}

function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed.state || parsed.apexVersion !== 2) {
        toast('Invalid backup file.', 'err'); return;
      }
      const result = await showModal({
        title: 'Restore Backup?',
        body: 'This will REPLACE all current data with the backup file. This cannot be undone.',
        confirmLabel: 'Yes, restore',
        cancelLabel: 'Cancel'
      });
      if (!result.confirmed) { toast('Import cancelled.', 'info'); return; }
      state = normalizeState(parsed.state);
      saveState();
      renderAll();
      toast('Data restored from backup.', 'ok');
    } catch (_) {
      toast('Could not read file. Make sure it is a valid AntiProc backup.', 'err');
    }
  };
  reader.readAsText(file);
}

async function resetData() {
  const result = await showModal({
    title: 'Delete All Data?',
    body: 'This permanently erases ALL streaks, tasks, XP, logs, and reflections. Type RESET to confirm.',
    confirmLabel: 'Delete Everything',
    cancelLabel: 'Cancel',
    inputPlaceholder: 'Type RESET here'
  });
  if (!result.confirmed) { toast('Reset cancelled.', 'info'); return; }
  if (result.value !== 'RESET') { toast('You must type RESET exactly.', 'err'); return; }
  // Wipe cloud data and reload to login screen
  if (fbUser) {
    try { await deleteState(fbUser.uid); } catch (e) { console.warn('[APEX] Cloud delete failed:', e); }
  }
  // Wipe localStorage too
  try { localStorage.removeItem(LS_KEY); } catch (_) { }
  localStorage.removeItem('antiproc-guide-dismissed');
  toast('All data erased. Returning to login\u2026', 'err');
  setTimeout(() => window.location.reload(), 1200);
}

/* ==============================================================
   EVENT WIRING
   ============================================================== */
function wireEvents() {

  /* Pre-fill history date inputs with today */
  const _todayKey = dateKey(new Date());
  const _hFrom = document.getElementById('histFromDate');
  const _hTo = document.getElementById('histToDate');
  if (_hFrom) _hFrom.value = _todayKey;
  if (_hTo) _hTo.value = _todayKey;

  /* Guide buttons */
  document.getElementById('guideDismissBtn').addEventListener('click', dismissGuide);
  document.getElementById('showGuideBtn').addEventListener('click', showGuide);

  /* Cloud Sync button — opens dropdown when signed in */
  const _syncBtn = document.getElementById('syncLoginBtn');
  const _syncDrop = document.getElementById('syncDropdown');
  _syncBtn?.addEventListener('click', async () => {
    if (fbUser) {
      const willShow = _syncDrop.hidden;
      _syncDrop.hidden = !willShow;
      if (willShow) {
        const r = _syncBtn.getBoundingClientRect();
        const gap = 8;
        const dropW = 220; // matches min-width
        // Try to right-align with the button; clamp so it never goes off the left edge
        let rightEdge = window.innerWidth - r.right;
        // If the dropdown would overflow the left side, pin it to a safe margin instead
        const leftEdge = r.right - dropW;
        if (leftEdge < gap) rightEdge = Math.max(gap, window.innerWidth - dropW - gap);
        // Also clamp right so it doesn't overflow on the right
        rightEdge = Math.max(gap, Math.min(rightEdge, window.innerWidth - dropW - gap));
        _syncDrop.style.top = (r.bottom + gap) + 'px';
        _syncDrop.style.right = rightEdge + 'px';
        _syncDrop.style.left = 'unset'; // ensure we're using right-anchor
      }
    } else {
      try {
        const user = await fbSignIn();
        if (user && !firebaseInitialized) {
          await initFirebase(user);
        }
      } catch (e) {
        if (!e.code || !e.code.includes('popup-closed')) {
          toast('Sign-in failed: ' + e.message, 'err');
        }
      }
    }
  });
  document.getElementById('syncSignOutBtn')?.addEventListener('click', async () => {
    _syncDrop.hidden = true;
    await fbSignOut();
    window.location.reload();
  });
  /* Close dropdown when clicking outside */
  document.addEventListener('click', (e) => {
    if (_syncDrop && !_syncDrop.hidden) {
      if (!_syncBtn.contains(e.target) && !_syncDrop.contains(e.target)) {
        _syncDrop.hidden = true;
      }
    }
  }, true);

  /* Hero Quotes toggle */
  document.getElementById('quotesToggleBtn').addEventListener('click', () => {
    const panel = document.getElementById('dekuPanel');
    const btn = document.getElementById('quotesToggleBtn');
    const isOpen = panel.style.display !== 'none';
    if (isOpen) {
      panel.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      panel.style.opacity = '0';
      panel.style.transform = 'translateY(-6px)';
      setTimeout(() => {
        panel.style.display = 'none';
        panel.style.opacity = '';
        panel.style.transform = '';
        panel.style.transition = '';
      }, 210);
      btn.innerHTML = '&#9889; Hero Quotes';
      btn.classList.remove('open');
    } else {
      panel.style.display = 'block';
      panel.style.opacity = '0';
      panel.style.transform = 'translateY(-6px)';
      panel.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        panel.style.opacity = '1';
        panel.style.transform = 'translateY(0)';
        setTimeout(() => { panel.style.transition = ''; }, 280);
      }));
      btn.innerHTML = '&#10005; Close Quotes';
      btn.classList.add('open');
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  });

  /* Modal buttons */
  document.getElementById('modalConfirm').addEventListener('click', () => closeModal(true));
  document.getElementById('modalCancel').addEventListener('click', () => closeModal(false));
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal(false);
  });
  document.getElementById('modalInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') closeModal(true);
    if (e.key === 'Escape') closeModal(false);
  });

  /* -- Level Map Modal -- */
  function openLevelMap() {
    const lvl = levelFromXp(state.xp);
    const pct = xpPct(state.xp);
    const list = document.getElementById('levelMapList');
    list.innerHTML = '';
    LEVEL_NAMES.forEach((name, i) => {
      const n = i + 1;
      const isCurrent = n === lvl;
      const isUnlocked = n < lvl;
      const row = document.createElement('div');
      row.className = 'lmap-row ' + (isCurrent ? 'current' : isUnlocked ? 'unlocked' : 'locked');

      const xpMin = (n - 1) * XP_PER_LEVEL;
      const xpMax = n * XP_PER_LEVEL;
      const tag = isCurrent
        ? '<span class="lmap-current-badge">&#9889; YOU ARE HERE</span>'
        : isUnlocked
          ? '<span class="lmap-tag">CLEARED</span>'
          : '<span class="lmap-tag">LV ' + xpMin + ' XP</span>';

      row.innerHTML =
        '<span class="lmap-num">' + n + '</span>' +
        '<span class="lmap-name">' + name + '</span>' +
        tag;

      if (isCurrent) {
        const barWrap = document.createElement('div');
        barWrap.className = 'lmap-xp-bar-wrap';
        barWrap.style.gridColumn = '2 / -1';
        const bar = document.createElement('div');
        bar.className = 'lmap-xp-bar';
        bar.style.width = pct + '%';
        barWrap.appendChild(bar);
        // rebuild as grid with extra row for bar
        row.style.flexWrap = 'wrap';
        row.appendChild(barWrap);
        // add XP subtitle
        const sub = document.createElement('span');
        sub.style.cssText = 'grid-column:2/-1;font-size:0.67rem;color:var(--muted);font-family:Orbitron,monospace;';
        sub.textContent = xpInLevel(state.xp) + ' / ' + XP_PER_LEVEL + ' XP';
        row.appendChild(sub);
      }

      list.appendChild(row);
    });
    document.getElementById('levelMapOverlay').classList.add('open');
  }

  function closeLevelMap() {
    document.getElementById('levelMapOverlay').classList.remove('open');
  }

  document.getElementById('levelCard').addEventListener('click', openLevelMap);
  document.getElementById('levelCard').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLevelMap(); }
  });
  document.getElementById('levelMapClose').addEventListener('click', closeLevelMap);
  document.getElementById('levelMapOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('levelMapOverlay')) closeLevelMap();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('levelMapOverlay').classList.contains('open')) closeLevelMap();
  });

  /* Info toggle buttons */
  document.addEventListener('click', e => {
    const btn = e.target.closest('.info-toggle-btn');
    if (!btn) return;
    const target = document.getElementById(btn.dataset.info);
    if (!target) return;
    const open = target.style.display !== 'none';
    target.style.display = open ? 'none' : 'block';
    btn.classList.toggle('active', !open);
  });

  /* Edit categories */
  document.getElementById('catCloseBtn').addEventListener('click', () => {
    document.getElementById('catEditor').style.display = 'none';
  });

  document.getElementById('editCatsBtn').addEventListener('click', () => {
    const ed = document.getElementById('catEditor');
    const isOpen = ed.style.display !== 'none';
    ed.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) document.getElementById('catNewInput').focus();
  });

  document.getElementById('catAddBtn').addEventListener('click', () => {
    const inp = document.getElementById('catNewInput');
    const val = inp.value.trim();
    if (!val) return;
    if (!state.categories) state.categories = [...DEFAULT_CATEGORIES];
    if (state.categories.map(c => c.toLowerCase()).includes(val.toLowerCase())) {
      toast('Category already exists.', 'err'); return;
    }
    state.categories.push(val);
    inp.value = '';
    inp.focus();
    pushUndo('Category added.');
    saveState(); renderCategorySelect();
    toast('Category added.', 'ok');
  });

  document.getElementById('catNewInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('catAddBtn').click(); }
    if (e.key === 'Escape') { document.getElementById('catEditor').style.display = 'none'; }
  });

  document.getElementById('catTags').addEventListener('click', e => {
    const cat = e.target.dataset.delCat;
    if (!cat) return;
    if (state.categories.length <= 1) { toast('Keep at least 1 category.', 'err'); return; }
    pushUndo('Category removed.');
    state.categories = state.categories.filter(c => c !== cat);
    saveState(); renderCategorySelect();
    toast('Category removed.', 'info');
  });

  /* Add task — goes to today or tomorrowQueue depending on finalization state */
  document.getElementById('taskForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = document.getElementById('taskInput');
    const text = input.value.trim();
    const cat = document.getElementById('taskCategory').value;
    if (!text) return;

    const isFinalized = !!state.logs[state.currentDate];
    if (!state.tomorrowQueue) state.tomorrowQueue = [];

    if (isFinalized) {
      /* Plan for tomorrow */
      if (state.tomorrowQueue.length >= 3) {
        toast('Tomorrow already has 3 slots filled. Remove a task to add another.', 'err'); return;
      }
      pushUndo('Tomorrow task added.');
      state.tomorrowQueue.push({ id: makeId(), text, cat, done: false, carried: false });
      input.value = '';
      input.focus();
      saveState(); renderAll();
      toast('\uD83C\uDF05 Queued for tomorrow (' + state.tomorrowQueue.length + '/3 slots).', 'ok');
    } else {
      /* Add for today — slot count = ALL active tasks (carried-in count as slots too) */
      const totalActive = state.tasks.filter(t => !t.carry).length;
      if (totalActive >= 3) {
        toast('3 active targets maximum. Mark a task \u21A9 carry to free a slot.', 'err'); return;
      }
      pushUndo('Task added.');
      state.tasks.push({ id: makeId(), text, cat, done: false });
      input.value = '';
      input.focus();
      saveState(); renderAll();
      toast('Target added. Execute it.', 'ok');
    }
  });

  /* Toggle done / delete / edit / carry */
  document.getElementById('taskList').addEventListener('click', e => {
    const isFinalized = !!state.logs[state.currentDate];
    /* All interactions are locked after finalization */
    if (isFinalized) return;

    const doneId = e.target.closest('[data-task-id]') && e.target.dataset.taskId;
    const deleteId = e.target.closest('[data-delete-id]') && e.target.dataset.deleteId;
    const editId = e.target.closest('[data-edit-id]') && e.target.dataset.editId;
    const carryId = e.target.closest('[data-carry-id]') && e.target.dataset.carryId;

    if (doneId) {
      const task = state.tasks.find(t => t.id === doneId);
      if (!task) return;
      pushUndo(task.done ? 'Task unmarked.' : 'Task marked done.');
      task.done = !task.done;
      /* Auto-clear carry flag when task is completed — no point carrying a done task */
      if (task.done && task.carry) task.carry = false;
      saveState(); renderAll();
      /* Confetti: all active (non-carry-marked) tasks done, at least 3 */
      const active = state.tasks.filter(t => !t.carry);
      if (task.done && active.length >= 3 && active.every(t => t.done)) launchConfetti();
      toast(task.done ? 'Target hit! OFA activated on this one.' : 'Target unmarked.', task.done ? 'ok' : 'info');
    }
    if (deleteId) {
      pushUndo('Task deleted.');
      state.tasks = state.tasks.filter(t => t.id !== deleteId);
      saveState(); renderAll();
      toast('Task removed.', 'info');
    }
    if (editId) {
      const task = state.tasks.find(t => t.id === editId);
      if (!task) return;
      const li = e.target.closest('.task-item');
      const textSpan = li.querySelector('[data-task-text-id]');
      if (!textSpan || textSpan.querySelector('input')) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = task.text;
      input.maxLength = 100;
      input.className = 'task-edit-input';
      textSpan.textContent = '';
      textSpan.appendChild(input);
      input.focus();
      input.select();
      const commitEdit = () => {
        const newText = input.value.trim();
        if (newText && newText !== task.text) {
          pushUndo('Task edited.');
          task.text = newText;
          saveState();
        }
        renderTasks();
      };
      input.addEventListener('blur', commitEdit);
      input.addEventListener('keydown', ke => {
        if (ke.key === 'Enter') { ke.preventDefault(); input.removeEventListener('blur', commitEdit); commitEdit(); }
        if (ke.key === 'Escape') { input.value = task.text; input.removeEventListener('blur', commitEdit); renderTasks(); }
      });
    }
    if (carryId) {
      const task = state.tasks.find(t => t.id === carryId);
      if (!task) return;
      if (!task.carry) {
        /*
         * Cap check: total tasks going to tomorrow = 3
         * = (currently carry-marked undone from today)
         * + (already-carried undone from prev days)
         * + (manually added tomorrowQueue)
         * Exclude the current task (it's not carry-marked yet)
         */
        const futureCount =
          state.tasks.filter(t => t.id !== task.id && !t.done && (t.carry || t.carried)).length +
          (state.tomorrowQueue || []).length;
        if (futureCount >= 3) {
          toast('Carry pile is full (3 max). Complete or remove a carried task first.', 'err');
          return;
        }
      }
      task.carry = !task.carry;
      saveState(); renderAll();
      toast(task.carry ? '\u21A9 Carry-marked. A slot is freed for a replacement task today.' : 'Carry-forward removed.', 'info');
    }
  });

  /* Delete from tomorrow queue */
  document.addEventListener('click', e => {
    const delId = e.target.dataset.deleteTomorrowId;
    if (!delId) return;
    if (!state.tomorrowQueue) return;
    pushUndo('Tomorrow task removed.');
    state.tomorrowQueue = state.tomorrowQueue.filter(t => t.id !== delId);
    saveState(); renderAll();
    toast('Removed from tomorrow\u2019s plan.', 'info');
  });

  /* Finalize day */
  document.getElementById('lockDayBtn').addEventListener('click', async () => {
    /*
     * Active = all tasks NOT carry-marked (includes carried-in from previous days).
     * Streak fires when planned >= 3 AND all active done.
     */
    const activeTasks = state.tasks.filter(t => !t.carry);
    const planned = activeTasks.length;
    const done = activeTasks.filter(t => t.done).length;
    const isGood = planned >= 3 && done >= 3;
    const carryOut = state.tasks.filter(t => t.carry && !t.done).length;
    const carryNote = carryOut
      ? '\n(' + carryOut + ' task' + (carryOut > 1 ? 's' : '') + ' will carry to tomorrow.)'
      : '';
    const result = await showModal({
      title: isGood
        ? '\u26A1 Finalize Perfect Day?'
        : planned < 3
          ? 'Finalize Incomplete Day?'
          : 'Finalize with Unfinished Tasks?',
      body: isGood
        ? 'All ' + done + ' tasks done! +' + (XP_PER_TASK * 3) + ' XP and streak extended.' + carryNote
        : planned < 3
          ? 'Only ' + planned + '/3 tasks active. Counts as a missed day \u2014 streak resets, \u221220 XP.' + carryNote
          : done + '/' + planned + ' tasks done. Streak resets, \u221220 XP.' + carryNote,
      confirmLabel: 'Finalize Day',
      cancelLabel: 'Not yet'
    });
    if (!result.confirmed) return;
    finalizeDay(state.currentDate);
    /* currentDate stays as today \u2014 locked. advanceDays() rolls it to tomorrow automatically. */
    saveState(); renderAll();
    if (isGood) {
      launchConfetti();
      toast('PLUS ULTRA! Perfect day! +' + (XP_PER_TASK * 3) + ' XP. Streak extended!', 'ok');
    } else {
      toast('Day finalized. ' + done + '/' + planned + ' done. Crush it tomorrow.', done > 0 ? 'info' : 'err');
    }
  });

  /* Data management */
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('resetBtn').addEventListener('click', resetData);
  document.getElementById('importFile').addEventListener('change', e => {
    importData(e.target.files[0]);
    e.target.value = '';
  });

  /* Timer */
  document.getElementById('timerStartBtn').addEventListener('click', timerStart);
  document.getElementById('timerPauseBtn').addEventListener('click', timerPause);
  document.getElementById('timerStopBtn').addEventListener('click', timerStop);

  /* Timer mode toggle */
  document.getElementById('modeOfa').addEventListener('click', () => setTimerMode('ofa'));
  document.getElementById('modePomo').addEventListener('click', () => setTimerMode('pomo'));

  /* Custom timer duration */
  function applyCustomTimer() {
    const mins = parseInt(document.getElementById('timerCustomMins').value, 10);
    if (!mins || mins < 1 || mins > 480) { toast('Enter a duration between 1 and 480 minutes.', 'err'); return; }
    setTimerMode('custom', mins);
    document.getElementById('timerCustomMins').value = '';
  }
  document.getElementById('timerCustomSetBtn').addEventListener('click', applyCustomTimer);
  document.getElementById('timerCustomMins').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyCustomTimer(); }
  });

  /* Restore Streak */
  document.getElementById('shieldBtn').addEventListener('click', restoreStreak);

  /* Skip break */
  document.getElementById('skipBreakBtn').addEventListener('click', skipBreak);

  /* Delete focus session */
  document.getElementById('focusList').addEventListener('click', e => {
    const id = e.target.dataset.deleteSessionId;
    if (id) deleteSession(id);
  });

  /* Keyboard shortcuts: Space = start/pause timer */
  document.addEventListener('keydown', e => {
    const tag = document.activeElement ? document.activeElement.tagName : '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (timerRunning) timerPause(); else timerStart();
    }
  });

  /* Manual focus */
  /* Pre-fill start time with current time */
  const _focusStartEl = document.getElementById('focusStartTime');
  if (_focusStartEl && !_focusStartEl.value) {
    _focusStartEl.value = new Date().toTimeString().slice(0, 5);
  }

  document.getElementById('focusForm').addEventListener('submit', e => {
    e.preventDefault();
    const planned = Number(document.getElementById('plannedMinutes').value);
    const actual = Number(document.getElementById('actualMinutes').value);
    const interruptions = Number(document.getElementById('interruptions').value);
    const note = document.getElementById('focusNote').value.trim();
    const startTime = document.getElementById('focusStartTime').value.trim();

    if (planned < 1 || planned > 300) {
      toast('Planned duration must be 1\u2013300 minutes.', 'err'); return;
    }
    if (!actual || actual < 1 || actual > 480) {
      toast('Actual duration must be at least 1 minute.', 'err'); return;
    }
    pushUndo('Session logged.');
    state.focusSessions.unshift({
      id: makeId(),
      date: state.currentDate,
      planned, actual, interruptions,
      startTime: startTime || null,
      note: note || '-'
    });
    /* XP reward: same formula as timer — +5 XP per 15 min of actual focus, min +5 */
    const xpEarned = Math.max(5, Math.floor(actual / 15) * 5);
    state.xp += xpEarned;
    e.target.reset();
    /* Re-fill start time after reset */
    document.getElementById('focusStartTime').value = new Date().toTimeString().slice(0, 5);
    saveState(); renderAll();
    const eff = focusEff(actual, planned, interruptions);
    toast('\u26A1 Session logged: ' + actual + ' min \u00B7 +' + xpEarned + ' XP', eff >= 70 ? 'ok' : 'info');
  });

  /* Heatmap tooltip */
  const tooltip = document.getElementById('cellTooltip');
  document.getElementById('heatmap').addEventListener('mouseover', e => {
    const cell = e.target.closest('.cell');
    if (!cell || !tooltip) return;
    tooltip.textContent = cell.dataset.tip || '';
    tooltip.classList.add('visible');
  });
  document.getElementById('heatmap').addEventListener('mousemove', e => {
    if (!tooltip) return;
    tooltip.style.left = (e.clientX + 14) + 'px';
    tooltip.style.top = (e.clientY - 30) + 'px';
  });
  document.getElementById('heatmap').addEventListener('mouseleave', () => {
    if (tooltip) tooltip.classList.remove('visible');
  });

  /* History tabs */
  document.querySelectorAll('.hist-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hist-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.hist-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById('histTab' + btn.dataset.tab.charAt(0).toUpperCase() + btn.dataset.tab.slice(1));
      if (panel) panel.classList.add('active');
    });
  });

  /* CSV Export */
  document.getElementById('exportCsvBtn').addEventListener('click', exportHistoryCSV);

  /* Delete session via history tab */
  document.getElementById('histFocusList').addEventListener('click', e => {
    const id = e.target.dataset.deleteSessionId;
    if (id) deleteSession(id);
  });

  /* History date filter: preset buttons */
  document.querySelectorAll('.hist-preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.hist-preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      histFilter.preset = btn.dataset.preset;
      const today = dateKey(new Date());
      const from = new Date();
      if (btn.dataset.preset === 'today') {
        histFilter.from = today; histFilter.to = today;
      } else if (btn.dataset.preset === '7d') {
        from.setDate(from.getDate() - 6);
        histFilter.from = dateKey(from); histFilter.to = today;
      } else if (btn.dataset.preset === '30d') {
        from.setDate(from.getDate() - 29);
        histFilter.from = dateKey(from); histFilter.to = today;
      } else if (btn.dataset.preset === '90d') {
        from.setDate(from.getDate() - 89);
        histFilter.from = dateKey(from); histFilter.to = today;
      } else {
        histFilter.from = ''; histFilter.to = '';
      }
      document.getElementById('histFromDate').value = histFilter.from;
      document.getElementById('histToDate').value = histFilter.to;
      renderHistory();
    });
  });

  function applyManualFilter() {
    histFilter.from = document.getElementById('histFromDate').value;
    histFilter.to = document.getElementById('histToDate').value;
    histFilter.preset = 'custom';
    document.querySelectorAll('.hist-preset-btn').forEach(b => b.classList.remove('active'));
    renderHistory();
  }
  document.getElementById('histFromDate').addEventListener('change', applyManualFilter);
  document.getElementById('histToDate').addEventListener('change', applyManualFilter);

  document.getElementById('histClearFilter').addEventListener('click', () => {
    histFilter = { from: '', to: '', preset: 'all' };
    document.getElementById('histFromDate').value = '';
    document.getElementById('histToDate').value = '';
    document.querySelectorAll('.hist-preset-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.preset === 'all');
    });
    renderHistory();
  });

  /* Analytics daily range toggle */
  document.querySelectorAll('.an-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.an-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      anDailyRange = parseInt(btn.dataset.range, 10);
      renderAnalytics();
    });
  });

  /* Analytics efficiency range toggle */
  document.querySelectorAll('.an-eff-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.an-eff-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      anEffRange = parseInt(btn.dataset.eff, 10);
      renderAnalytics();
    });
  });

  /* Re-render charts on window resize (debounced) */
  window.addEventListener('resize', () => {
    clearTimeout(anResizeTimer);
    anResizeTimer = setTimeout(renderAnalytics, 220);
  }, { passive: true });

  /* Redemption quest claim */
  document.getElementById('redemptionQuestList').addEventListener('click', e => {
    const btn = e.target.closest('.redeem-claim-btn');
    if (!btn || btn.disabled) return;
    const questId = btn.dataset.quest;
    const reward = parseInt(btn.dataset.reward, 10);
    const today = state.currentDate;
    if (!state.redemptions) state.redemptions = {};
    if (!state.redemptions[today]) state.redemptions[today] = [];
    if (state.redemptions[today].includes(questId)) return;
    state.redemptions[today].push(questId);
    state.penalty = Math.max(0, state.penalty - reward);
    saveState();
    renderAll();
    toast('\u2728 Penalty reduced by ' + reward + '! Now: ' + state.penalty + ' pts', 'ok');
  });
}

/* ==============================================================
   RENDER: CATEGORY CHART
   ============================================================== */
function renderCatChart() {
  const canvas = document.getElementById('catChart');
  if (!canvas) return;

  /* Aggregate completed tasks per category across all history */
  const totals = {};
  Object.values(state.logs).forEach(log => {
    if (log.cats) {
      Object.entries(log.cats).forEach(([cat, count]) => {
        totals[cat] = (totals[cat] || 0) + count;
      });
    }
  });
  /* Also include today's live completed tasks — but ONLY if today is not yet
     finalized. Once finalized, today's cats are already captured in state.logs
     and adding them again would double-count. */
  if (!state.logs[state.currentDate]) {
    state.tasks.filter(t => t.done).forEach(t => {
      totals[t.cat] = (totals[t.cat] || 0) + 1;
    });
  }

  const emptyEl = document.getElementById('catChartEmpty');
  const entries = Object.entries(totals).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const BAR_H = 28;
  const GAP = 10;
  const LABEL_W = 95;
  const PAD = 14;
  const WRAP_W = canvas.parentElement.clientWidth || 600;
  const W = WRAP_W - 2;
  const H = entries.length * (BAR_H + GAP) + PAD * 2;
  const maxVal = entries[0][1];
  const barMaxW = W - LABEL_W - 56;

  canvas.width = W;
  canvas.height = H;
  canvas.style.display = 'block';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  entries.forEach(([cat, count], i) => {
    const y = PAD + i * (BAR_H + GAP);
    const barW = Math.max(6, (count / maxVal) * barMaxW);

    /* Category label */
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(cat.length > 11 ? cat.slice(0, 11) + '\u2026' : cat, LABEL_W - 10, y + BAR_H / 2);

    /* Background track */
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(LABEL_W, y, barMaxW, BAR_H, 5);
    else ctx.rect(LABEL_W, y, barMaxW, BAR_H);
    ctx.fill();

    /* Filled bar */
    const grad = ctx.createLinearGradient(LABEL_W, 0, LABEL_W + barW, 0);
    grad.addColorStop(0, '#3ddc84');
    grad.addColorStop(1, '#22c55e');
    ctx.fillStyle = grad;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(LABEL_W, y, barW, BAR_H, 5);
    else ctx.rect(LABEL_W, y, barW, BAR_H);
    ctx.fill();

    /* Count label */
    ctx.fillStyle = 'rgba(255,255,255,0.80)';
    ctx.textAlign = 'left';
    ctx.font = '12px "Orbitron", monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(count + (count === 1 ? ' task' : ' tasks'), LABEL_W + barW + 8, y + BAR_H / 2);
  });
}

/* ==============================================================
   ANALYTICS HELPERS
   ============================================================== */

/* Get the ISO Monday date key for the week containing dateStr */
function sessionWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return dateKey(mon);
}

/* Format minutes as "2h 30m" */
function fmtMins(m) {
  if (!m) return '0m';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return r + 'm';
  if (r === 0) return h + 'h';
  return h + 'h ' + r + 'm';
}

/* Draw a vertical bar chart on a canvas element
   opts: { goalLine, highlightIdx, labelFmt } */
/* -- Animate a stat pill numeric value counting up from 0 -- */
function animatePill(elId, numVal, fmtFn) {
  const el = document.getElementById(elId);
  if (!el || !numVal) return;
  const duration = 700;
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = fmtFn(Math.round(eased * numVal));
    if (t < 1) requestAnimationFrame(step);
    else el.textContent = fmtFn(numVal);
  }
  requestAnimationFrame(step);
}

/* -- Render trend arrow (week-over-week) on a pill element -- */
function setTrend(elId, thisVal, lastVal) {
  const el = document.getElementById(elId);
  if (!el) return;
  if (!thisVal || !lastVal || lastVal === 0) { el.textContent = ''; return; }
  const pct = Math.round(((thisVal - lastVal) / lastVal) * 100);
  if (Math.abs(pct) < 2) { el.textContent = ''; return; }
  const up = pct > 0;
  el.textContent = (up ? '\u2191' : '\u2193') + ' ' + Math.abs(pct) + '%';
  el.className = 'an-trend ' + (up ? 'an-trend-up' : 'an-trend-dn');
}

/* -- Horizontal bar chart (for DoW and best-hour charts) -- */
function drawHorizBarChart(canvasId, labels, values, barColor, emptyId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const emptyEl = document.getElementById(emptyId);
  if (!values.some(v => v > 0)) {
    if (emptyEl) emptyEl.style.display = 'block';
    canvas.style.display = 'none';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const WRAP_W = Math.max(canvas.parentElement.offsetWidth || canvas.parentElement.clientWidth || 640, 280);
  const W = WRAP_W - 2;
  const rowH = 32;
  const PAD_T = 10, PAD_B = 10, PAD_L = 50, PAD_R = 64;
  const n = labels.length;
  const H = PAD_T + rowH * n + PAD_B;
  const plotW = W - PAD_L - PAD_R;
  const maxVal = Math.max(...values, 1);
  const barH = Math.min(20, rowH - 8);

  canvas.width = W;
  canvas.height = H;
  canvas.style.display = 'block';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  labels.forEach((label, i) => {
    const y = PAD_T + i * rowH;
    const bw = Math.max(0, (values[i] / maxVal) * plotW);
    const bx = PAD_L;
    const by = y + (rowH - barH) / 2;

    const isMax = values[i] === maxVal && values[i] > 0;
    const col = isMax ? '#ffd500' : barColor;

    /* Bar background */
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, plotW, barH, [0, 4, 4, 0]);
    else ctx.rect(bx, by, plotW, barH);
    ctx.fill();

    /* Filled portion */
    if (bw > 0) {
      const grad = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      grad.addColorStop(0, col);
      grad.addColorStop(1, col + '55');
      if (isMax) { ctx.shadowColor = col; ctx.shadowBlur = 8; }
      ctx.fillStyle = grad;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(bx, by, bw, barH, [0, 4, 4, 0]);
      else ctx.rect(bx, by, bw, barH);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    /* Label on left */
    ctx.fillStyle = isMax ? '#ffd500' : 'rgba(255,255,255,0.55)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, PAD_L - 7, y + rowH / 2);

    /* Value label on right */
    if (values[i] > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.font = '9px "Orbitron", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(fmtMins(values[i]), bx + bw + 6, y + rowH / 2);
    }
  });
}

/* -- Floating tooltip on bar charts -- */
function addBarTooltip(canvasId, labels, values, opts = {}) {
  const canvas = document.getElementById(canvasId);
  const tip = document.getElementById('anTooltip');
  if (!canvas || !tip) return;

  /* Store latest data on the element so the single listener always reads fresh values */
  canvas._ttData = { labels, values, opts };

  /* Only bind listeners once per canvas */
  if (canvas._tooltipBound) return;
  canvas._tooltipBound = true;

  canvas.addEventListener('mousemove', e => {
    if (canvas.style.display === 'none') return;
    const { labels: lbs, values: vals, opts: o } = canvas._ttData || {};
    if (!lbs || !lbs.length) { tip.style.display = 'none'; return; }
    const W = canvas.width;
    const PAD_L = 58, PAD_R = 14;
    const plotW = W - PAD_L - PAD_R;
    const n = lbs.length;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const slotW = plotW / n;
    let hovIdx = -1;
    for (let i = 0; i < n; i++) {
      const bx = PAD_L + i * slotW;
      if (mx >= bx && mx < bx + slotW) { hovIdx = i; break; }
    }
    if (hovIdx >= 0 && vals[hovIdx] > 0) {
      const raw = lbs[hovIdx];
      let dateStr = raw;
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const d = new Date(raw + 'T00:00:00');
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const mths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        dateStr = o.labelFmt === 'week'
          ? 'Week of ' + mths[d.getMonth()] + ' ' + d.getDate()
          : days[d.getDay()] + ' ' + mths[d.getMonth()] + ' ' + d.getDate();
      }
      tip.innerHTML = '<span class="an-tip-date">' + dateStr + '</span><span class="an-tip-val">' + fmtMins(vals[hovIdx]) + '</span>';
      tip.style.display = 'flex';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY - 40) + 'px';
    } else {
      tip.style.display = 'none';
    }
  });

  canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

function drawBarChart(canvasId, labels, values, barColor, opts = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const WRAP_W = Math.max(canvas.parentElement.offsetWidth || canvas.parentElement.clientWidth || 640, 280);
  const W = WRAP_W - 2;
  const H = 220;
  const PAD_T = 22, PAD_B = 44, PAD_L = 58, PAD_R = 14;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const n = labels.length;
  const rawMax = Math.max(...values, opts.goalLine || 0, 1);
  /* Round max up to a nice multiple so goal line sits cleanly */
  const nice = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];
  const maxVal = nice.find(v => v >= rawMax) || Math.ceil(rawMax / 30) * 30;

  canvas.width = W;
  canvas.height = H;
  canvas.style.display = 'block';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  /* Y grid + labels — 4 even steps */
  const ySteps = 4;
  for (let i = 0; i <= ySteps; i++) {
    const y = PAD_T + plotH - (i / ySteps) * plotH;
    const val = Math.round((i / ySteps) * maxVal);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(fmtMins(val), PAD_L - 5, y);
  }

  /* Optional dashed goal line */
  if (opts.goalLine) {
    const gy = PAD_T + plotH * (1 - opts.goalLine / maxVal);
    ctx.strokeStyle = 'rgba(255,213,0,0.45)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(PAD_L, gy); ctx.lineTo(W - PAD_R, gy); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,213,0,0.75)';
    ctx.font = '9px "Orbitron", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Goal', PAD_L + 4, gy - 7);
  }

  const slotW = plotW / n;
  const barW = Math.max(4, Math.min(34, slotW - 4));

  /* Bars */
  values.forEach((v, i) => {
    const bh = v > 0 ? Math.max(3, (v / maxVal) * plotH) : 2;
    const x = PAD_L + i * slotW + (slotW - barW) / 2;
    const y = PAD_T + plotH - bh;
    const isToday = i === opts.highlightIdx;

    if (v > 0) {
      const bright = isToday ? barColor : barColor;
      const grad = ctx.createLinearGradient(0, y, 0, y + bh);
      grad.addColorStop(0, isToday ? '#ffffff' : bright);
      grad.addColorStop(isToday ? 0.15 : 0, isToday ? bright : bright);
      grad.addColorStop(1, bright + '44');
      ctx.fillStyle = isToday ? (() => {
        const g2 = ctx.createLinearGradient(0, y, 0, y + bh);
        g2.addColorStop(0, '#ffffff');
        g2.addColorStop(0.12, barColor);
        g2.addColorStop(1, barColor + '55');
        return g2;
      })() : grad;

      /* Glow overlay for today */
      if (isToday) {
        ctx.shadowColor = barColor;
        ctx.shadowBlur = 10;
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
    }

    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, barW, bh, v > 0 ? [4, 4, 0, 0] : [2, 2, 0, 0]);
    else ctx.rect(x, y, barW, bh);
    ctx.fill();
    ctx.shadowBlur = 0;

    /* Value label above bar */
    if (v > 0 && bh > 14 && barW > 10) {
      ctx.fillStyle = isToday ? '#ffffff' : 'rgba(255,255,255,0.60)';
      ctx.font = barW > 20 ? '8px "Orbitron", monospace' : '7px "Orbitron", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fmtMins(v), x + barW / 2, y - 2);
    }

    /* X label */
    const showLabel = n <= 16 || i % Math.ceil(n / 16) === 0 || i === n - 1 || isToday;
    if (showLabel) {
      const raw = labels[i];
      let line1 = raw, line2 = '';
      if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const d = new Date(raw + 'T00:00:00');
        if (opts.labelFmt === 'week') {
          /* Weekly: show abbreviated month + day */
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          line1 = months[d.getMonth()];
          line2 = String(d.getDate());
        } else {
          /* Daily: day abbreviation + date */
          const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
          line1 = (isToday ? '\u25CF' : '') + days[d.getDay()];
          line2 = (d.getMonth() + 1) + '/' + d.getDate();
        }
      }
      ctx.fillStyle = isToday ? barColor : 'rgba(255,255,255,0.35)';
      ctx.font = '9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(line1, x + barW / 2, PAD_T + plotH + 5);
      if (line2) ctx.fillText(line2, x + barW / 2, PAD_T + plotH + 16);
    }
  });
}

/* Catmull-Rom smooth spline through points (modifies ctx path) */
function catmullRom(ctx, pts) {
  if (pts.length < 2) return;
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); return; }
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = 0.5;
    const cp1x = p1.x + (p2.x - p0.x) * t / 3;
    const cp1y = p1.y + (p2.y - p0.y) * t / 3;
    const cp2x = p2.x - (p3.x - p1.x) * t / 3;
    const cp2y = p2.y - (p3.y - p1.y) * t / 3;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

/* Draw an efficiency line/scatter chart with bezier smoothing + moving average */
function drawLineChart(canvasId, labels, values, emptyId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const emptyEl = document.getElementById(emptyId);
  if (values.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    canvas.style.display = 'none';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  const WRAP_W = Math.max(canvas.parentElement.offsetWidth || canvas.parentElement.clientWidth || 640, 280);
  const W = WRAP_W - 2;
  const H = 195;
  const PAD_T = 16, PAD_B = 32, PAD_L = 48, PAD_R = 38;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const n = values.length;

  canvas.width = W;
  canvas.height = H;
  canvas.style.display = 'block';

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, W, H);

  /* Y grid lines */
  [0, 25, 50, 75, 100].forEach(ref => {
    const y = PAD_T + plotH * (1 - ref / 100);
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(ref + '%', PAD_L - 5, y);
  });

  /* Reference threshold lines */
  [[70, 'rgba(61,220,132,0.30)', '#3ddc84'], [45, 'rgba(96,165,250,0.24)', '#60a5fa']].forEach(([ref, stroke, col]) => {
    const y = PAD_T + plotH * (1 - ref / 100);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(W - PAD_R, y); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = col;
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(ref + '%', W - PAD_R + 4, y);
  });

  /* Point positions */
  const pts = values.map((v, i) => ({
    x: PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW),
    y: PAD_T + plotH * (1 - Math.min(100, Math.max(0, v)) / 100),
    v
  }));

  /* Shaded fill under smooth curve */
  if (pts.length > 1) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, PAD_T + plotH);
    ctx.lineTo(pts[0].x, pts[0].y);
    catmullRom(ctx, pts);
    ctx.lineTo(pts[n - 1].x, PAD_T + plotH);
    ctx.closePath();
    const fillG = ctx.createLinearGradient(0, PAD_T, 0, PAD_T + plotH);
    fillG.addColorStop(0, 'rgba(61,220,132,0.18)');
    fillG.addColorStop(1, 'rgba(61,220,132,0.01)');
    ctx.fillStyle = fillG;
    ctx.fill();

    /* Main smooth line */
    ctx.beginPath();
    catmullRom(ctx, pts);
    ctx.strokeStyle = 'rgba(61,220,132,0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /* 5-session moving average overlay */
  const MA_WIN = 5;
  if (n >= MA_WIN) {
    const maPts = [];
    for (let i = MA_WIN - 1; i < n; i++) {
      const sum = values.slice(i - MA_WIN + 1, i + 1).reduce((a, b) => a + b, 0);
      const avg = sum / MA_WIN;
      maPts.push({
        x: PAD_L + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW),
        y: PAD_T + plotH * (1 - Math.min(100, Math.max(0, avg)) / 100)
      });
    }
    ctx.beginPath();
    catmullRom(ctx, maPts);
    ctx.strokeStyle = 'rgba(255,213,0,0.70)';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();
  }

  /* Coloured dots with glow */
  pts.forEach(p => {
    const col = p.v >= 70 ? '#3ddc84' : p.v >= 45 ? '#60a5fa' : '#ef4444';
    ctx.shadowColor = col;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, n <= 20 ? 5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.60)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  /* X axis labels */
  const step = Math.max(1, Math.ceil(n / 10));
  pts.forEach((p, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const raw = labels[i];
    let lbl = '#' + (i + 1);
    if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const d = new Date(raw + 'T00:00:00');
      lbl = (d.getMonth() + 1) + '/' + d.getDate();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(lbl, p.x, PAD_T + plotH + 5);
  });
}

/* ==============================================================
   RENDER: ANALYTICS
   ============================================================== */
function renderAnalytics() {
  const all = state.focusSessions;

  /* Aggregate by day and by week */
  const byDate = {};
  all.forEach(s => { byDate[s.date] = (byDate[s.date] || 0) + (s.actual || 0); });

  const byWeek = {};
  all.forEach(s => {
    const wk = sessionWeekKey(s.date);
    byWeek[wk] = (byWeek[wk] || 0) + (s.actual || 0);
  });

  /* Summary stats */
  const totalMins = all.reduce((sum, s) => sum + (s.actual || 0), 0);
  const dayVals = Object.values(byDate).filter(v => v > 0);
  const weekVals = Object.values(byWeek).filter(v => v > 0);
  const bestDay = dayVals.length ? Math.max(...dayVals) : 0;
  const bestWeek = weekVals.length ? Math.max(...weekVals) : 0;
  const focusDayCount = dayVals.length;
  const avgDay = focusDayCount > 0 ? Math.round(totalMins / focusDayCount) : 0;
  const effs = all.map(s => focusEff(s.actual, s.planned, s.interruptions));
  const avgEff = effs.length ? Math.round(effs.reduce((a, b) => a + b, 0) / effs.length) : 0;

  /* Focus streak: consecutive days (up to today) with any focus logged */
  let focusStreak = 0;
  const streakCheck = new Date();
  for (let i = 0; i < 365; i++) {
    if (byDate[dateKey(streakCheck)]) {
      focusStreak++;
      streakCheck.setDate(streakCheck.getDate() - 1);
    } else {
      break;
    }
  }

  /* Consistency: % of last 30 calendar days with any focus */
  let focusDaysInLast30 = 0;
  const con30 = new Date();
  for (let i = 0; i < 30; i++) {
    if (byDate[dateKey(con30)]) focusDaysInLast30++;
    con30.setDate(con30.getDate() - 1);
  }
  const consistency30 = Math.round((focusDaysInLast30 / 30) * 100);

  /* -- Week-over-week trend data -- */
  const today2 = new Date();
  const todayDow = today2.getDay();
  const thisMonStart = new Date(today2);
  thisMonStart.setDate(today2.getDate() - (todayDow === 0 ? 6 : todayDow - 1));
  const lastMonStart = new Date(thisMonStart);
  lastMonStart.setDate(thisMonStart.getDate() - 7);

  const thisWkKey = dateKey(thisMonStart);
  const lastWkKey = dateKey(lastMonStart);
  const thisWkMins = byWeek[thisWkKey] || 0;
  const lastWkMins = byWeek[lastWkKey] || 0;

  /* Last 7d avg vs prev 7d avg for pill 2 trend */
  let avgDay7 = 0, avgDayPrev7 = 0;
  let sum7 = 0, cnt7 = 0, sumP7 = 0, cntP7 = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today2); d.setDate(today2.getDate() - i);
    const v = byDate[dateKey(d)] || 0;
    if (v > 0) { sum7 += v; cnt7++; }
  }
  for (let i = 7; i < 14; i++) {
    const d = new Date(today2); d.setDate(today2.getDate() - i);
    const v = byDate[dateKey(d)] || 0;
    if (v > 0) { sumP7 += v; cntP7++; }
  }
  avgDay7 = cnt7 ? Math.round(sum7 / cnt7) : 0;
  avgDayPrev7 = cntP7 ? Math.round(sumP7 / cntP7) : 0;

  /* This week + last week avg efficiency */
  const thisWkSessions = all.filter(s => {
    const d = new Date(s.date + 'T00:00:00');
    return d >= thisMonStart;
  });
  const lastWkSessions = all.filter(s => {
    const d = new Date(s.date + 'T00:00:00');
    return d >= lastMonStart && d < thisMonStart;
  });
  const thisWkEffAvg = thisWkSessions.length
    ? Math.round(thisWkSessions.reduce((a, s) => a + focusEff(s.actual, s.planned, s.interruptions), 0) / thisWkSessions.length)
    : 0;
  const lastWkEffAvg = lastWkSessions.length
    ? Math.round(lastWkSessions.reduce((a, s) => a + focusEff(s.actual, s.planned, s.interruptions), 0) / lastWkSessions.length)
    : 0;

  /* -- Set pill values with animated counters -- */
  animatePill('anTotalTime', totalMins, fmtMins);
  animatePill('anAvgDay', avgDay, fmtMins);
  animatePill('anBestDay', bestDay, fmtMins);
  animatePill('anBestWeek', bestWeek, fmtMins);
  animatePill('anFocusDays', focusDayCount, v => v + ' days');
  animatePill('anTotalSessions', all.length, v => String(v));
  animatePill('anFocusStreak', focusStreak, v => v + ' days');

  if (!totalMins) document.getElementById('anTotalTime').textContent = '\u2014';
  if (!avgDay) document.getElementById('anAvgDay').textContent = '\u2014';
  if (!bestDay) document.getElementById('anBestDay').textContent = '\u2014';
  if (!bestWeek) document.getElementById('anBestWeek').textContent = '\u2014';
  if (!effs.length) document.getElementById('anAvgEff').textContent = '\u2014';
  else document.getElementById('anAvgEff').textContent = avgEff + '%';
  if (!focusDayCount) document.getElementById('anFocusDays').textContent = '\u2014';
  if (!all.length) document.getElementById('anTotalSessions').textContent = '\u2014';
  if (!focusStreak) document.getElementById('anFocusStreak').textContent = '\u2014';
  document.getElementById('anConsistency').textContent = all.length ? consistency30 + '%' : '\u2014';

  /* Colour-code avg efficiency pill */
  const effPill = document.querySelector('.an-pill-5 .an-stat-val');
  if (effPill && effs.length) {
    effPill.style.color = avgEff >= 70 ? '#3ddc84' : avgEff >= 45 ? '#60a5fa' : '#ef4444';
  }
  /* Colour-code consistency pill */
  const conPill = document.querySelector('.an-pill-9 .an-stat-val');
  if (conPill && all.length) {
    conPill.style.color = consistency30 >= 60 ? '#3ddc84' : consistency30 >= 30 ? '#60a5fa' : '#ef4444';
  }

  /* -- Week-over-week trend arrows -- */
  setTrend('anTrend1', thisWkMins, lastWkMins);
  setTrend('anTrend2', avgDay7, avgDayPrev7);
  setTrend('anTrend5', thisWkEffAvg, lastWkEffAvg);

  /* Daily bar chart (last anDailyRange days) */
  const today = new Date();
  const dailyLabels = [], dailyVals = [];
  for (let i = anDailyRange - 1; i >= 0; i--) {
    const d = new Date(today); d.setDate(today.getDate() - i);
    const key = dateKey(d);
    dailyLabels.push(key);
    dailyVals.push(byDate[key] || 0);
  }
  const dailyEmpty = document.getElementById('anDailyEmpty');
  const dailyCanvas = document.getElementById('anDailyCanvas');
  if (dailyVals.some(v => v > 0)) {
    dailyEmpty.style.display = 'none';
    dailyCanvas.style.display = 'block';
    drawBarChart('anDailyCanvas', dailyLabels, dailyVals, '#3ddc84', {
      goalLine: 90,
      highlightIdx: anDailyRange - 1
    });
    addBarTooltip('anDailyCanvas', dailyLabels, dailyVals, {});
  } else {
    dailyEmpty.style.display = 'block';
    dailyCanvas.style.display = 'none';
  }

  /* Weekly bar chart — last 8 complete weeks + current partial week */
  const weekLabels = [], weekValsArr = [];
  const thisMonday = new Date(today);
  const dow = today.getDay();
  thisMonday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  for (let i = 8; i >= 0; i--) {
    const mon = new Date(thisMonday);
    mon.setDate(thisMonday.getDate() - i * 7);
    const wk = dateKey(mon);
    weekLabels.push(wk);
    weekValsArr.push(byWeek[wk] || 0);
  }
  const weeklyEmpty = document.getElementById('anWeeklyEmpty');
  const weeklyCanvas = document.getElementById('anWeeklyCanvas');
  if (weekValsArr.some(v => v > 0)) {
    weeklyEmpty.style.display = 'none';
    weeklyCanvas.style.display = 'block';
    drawBarChart('anWeeklyCanvas', weekLabels, weekValsArr, '#60a5fa', {
      labelFmt: 'week',
      highlightIdx: weekLabels.length - 1
    });
    addBarTooltip('anWeeklyCanvas', weekLabels, weekValsArr, { labelFmt: 'week' });
  } else {
    weeklyEmpty.style.display = 'block';
    weeklyCanvas.style.display = 'none';
  }

  /* Efficiency trend: controlled by anEffRange (0 = all) */
  const sorted = [...all].sort((a, b) => a.date.localeCompare(b.date) || 0);
  const sliced = anEffRange > 0 ? sorted.slice(-anEffRange) : sorted;
  const effLabels = sliced.map(s => s.date);
  const effVals = sliced.map(s => focusEff(s.actual, s.planned, s.interruptions));
  drawLineChart('anEffCanvas', effLabels, effVals, 'anEffEmpty');

  /* -- Day-of-week analysis -- */
  const DOW_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dowSum = [0, 0, 0, 0, 0, 0, 0];
  const dowCount = [0, 0, 0, 0, 0, 0, 0];
  Object.entries(byDate).forEach(([dateStr, mins]) => {
    if (!mins) return;
    const d = new Date(dateStr + 'T00:00:00');
    const dow2 = (d.getDay() + 6) % 7;   // 0=Mon — 6=Sun
    dowSum[dow2] += mins;
    dowCount[dow2] += 1;
  });
  const dowAvg = dowSum.map((s, i) => dowCount[i] ? Math.round(s / dowCount[i]) : 0);
  drawHorizBarChart('anDowCanvas', DOW_NAMES, dowAvg, '#a78bfa', 'anDowEmpty');

  /* -- Best focus hours -- */
  const hourSum = new Array(24).fill(0);
  const hourCount = new Array(24).fill(0);
  all.forEach(s => {
    if (!s.startTime) return;
    const match = s.startTime.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return;
    const hr = parseInt(match[1], 10);
    if (hr < 0 || hr > 23) return;
    hourSum[hr] += s.actual || 0;
    hourCount[hr] += 1;
  });
  /* Only render hours that have data */
  const hourLabels = [];
  const hourVals = [];
  for (let h = 4; h <= 23; h++) {
    if (hourSum[h] > 0) {
      const suffix = h < 12 ? 'AM' : 'PM';
      const disp = ((h - 1) % 12 + 1) + suffix;
      hourLabels.push(disp);
      hourVals.push(hourSum[h]);
    }
  }
  drawHorizBarChart('anHourCanvas', hourLabels, hourVals, '#f97316', 'anHourEmpty');
}

/* ==============================================================
   RENDER: MASTER
   ============================================================== */
function renderAll() {
  const lvl = levelFromXp(state.xp);

  document.getElementById('streakValue').textContent = state.streak + ' days';
  document.getElementById('bestStreakLabel').textContent = 'Best: ' + state.bestStreak + ' days';

  /* Restore streak UI (replaces shield button) */
  const shieldBtn = document.getElementById('shieldBtn');
  if (shieldBtn) {
    const canRestore = state.streak === 0 && (state.lastStreak || 0) > 0 && !state.streakRestoreUsed;
    shieldBtn.textContent = '\uD83D\uDD25 Restore Streak (50 XP)';
    shieldBtn.disabled = !canRestore;
    shieldBtn.title = canRestore
      ? 'Spend 50 XP to restore your previous streak'
      : 'Restore unlocks after a streak break';
    shieldBtn.classList.remove('shielded');
  }

  /* Today's focus total */
  const todayFocus = document.getElementById('todayFocusVal');
  if (todayFocus) todayFocus.textContent = todayFocusMinutes() + ' min';
  document.getElementById('xpValue').textContent = String(state.xp);
  document.getElementById('xpToNext').textContent = xpInLevel(state.xp) + '/' + XP_PER_LEVEL + ' XP to Lv ' + (lvl + 1);
  document.getElementById('xpBar').style.width = xpPct(state.xp) + '%';
  document.getElementById('levelValue').textContent = String(lvl);
  document.getElementById('levelName').textContent = levelName(lvl);
  document.getElementById('penaltyValue').textContent = String(state.penalty);
  document.getElementById('todayLabel').textContent = dateKey(new Date());

  const streakCard = document.querySelector('.streak-card');
  if (streakCard) streakCard.classList.toggle('glowing', state.streak >= 3);

  renderCategorySelect();
  renderTasks();
  renderHeatmap();
  renderSummaries();
  renderFocusSessions();
  renderHistory();
  renderCatChart();
  renderAnalytics();
  renderRedemptions();
  renderDayPlan();
}

/* ==============================================================
   RENDER: TODAY'S RESULTS & TOMORROW'S PLAN
   ============================================================== */
function renderDayPlan() {
  const doneList = document.getElementById('todayDoneList');
  const doneEmpty = document.getElementById('todayDoneEmpty');
  const carryList = document.getElementById('tomorrowPlanList');
  const carryEmpty = document.getElementById('tomorrowPlanEmpty');
  if (!doneList) return;

  const isFinalized = !!state.logs[state.currentDate];

  /* Done tasks = tasks marked done */
  const doneTasks = state.tasks.filter(t => t.done);

  /* Tomorrow column:
       - If finalized  → use tomorrowQueue (the authoritative list)
       - If not yet    → use carry-marked + undone carried-in tasks (live preview) */
  const allForward = isFinalized
    ? (state.tomorrowQueue || [])
    : [
      ...state.tasks.filter(t => t.carry && !t.done),
      ...state.tasks.filter(t => t.carried && !t.done)
    ];

  doneList.innerHTML = '';
  if (doneTasks.length === 0) {
    doneList.style.display = 'none';
    doneEmpty.style.display = 'block';
  } else {
    doneList.style.display = 'flex';
    doneEmpty.style.display = 'none';
    doneTasks.forEach(t => {
      const li = document.createElement('li');
      li.className = 'dp-item dp-done';
      li.innerHTML =
        '<span class="dp-check">&#10003;</span>' +
        '<span class="dp-cat">' + escHtml(t.cat) + '</span>' +
        '<span class="dp-text">' + escHtml(t.text) + '</span>';
      doneList.appendChild(li);
    });
  }

  carryList.innerHTML = '';
  if (allForward.length === 0) {
    carryList.style.display = 'none';
    carryEmpty.style.display = 'block';
  } else {
    carryList.style.display = 'flex';
    carryEmpty.style.display = 'none';
    allForward.forEach(t => {
      const li = document.createElement('li');
      li.className = 'dp-item dp-carry';
      /* When finalized tomorrowQueue items don't have carry/carried flags in the same way */
      const badge = isFinalized
        ? '<span class="dp-origin-badge" style="background:rgba(96,165,250,0.18);color:#60a5fa">queued</span>'
        : t.carried
          ? '<span class="dp-origin-badge">prev day</span>'
          : '<span class="dp-origin-badge" style="background:rgba(96,165,250,0.18);color:#60a5fa">today</span>';
      li.innerHTML =
        '<span class="dp-arrow">&#8629;</span>' +
        '<span class="dp-cat">' + escHtml(t.cat) + '</span>' +
        '<span class="dp-text">' + escHtml(t.text) + '</span>' +
        badge;
      carryList.appendChild(li);
    });
  }
}

/* ==============================================================
   RENDER: REDEMPTION QUESTS
   ============================================================== */
const REDEMPTION_QUESTS = [
  { id: 'focus60', icon: '\uD83C\uDFAF', label: '60-Min Deep Work', desc: 'Log a focus session with 60+ actual minutes today', reward: 10 },
  { id: 'focus90', icon: '\u26A1', label: 'OFA Training Block', desc: 'Log a focus session with 90+ actual minutes today', reward: 15 },
];

function renderRedemptions() {
  const wrap = document.getElementById('redemptionCard');
  if (!wrap) return;

  if (state.penalty <= 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  const today = state.currentDate;
  const claimed = (state.redemptions && state.redemptions[today]) || [];

  /* Conditions for each quest being unlocked */
  const todayActual = state.focusSessions
    .filter(s => s.date === today)
    .reduce((sum, s) => sum + (s.actual || 0), 0);
  const unlocked = {
    focus60: todayActual >= 60,
    focus90: todayActual >= 90,
  };

  const list = document.getElementById('redemptionQuestList');
  list.innerHTML = '';

  REDEMPTION_QUESTS.forEach(q => {
    const isClaimed = claimed.includes(q.id);
    const isUnlocked = unlocked[q.id];
    const tile = document.createElement('div');
    tile.className = 'redeem-tile' + (isClaimed ? ' redeem-claimed' : isUnlocked ? ' redeem-ready' : '');
    tile.innerHTML = `
      <span class="redeem-icon">${q.icon}</span>
      <div class="redeem-body">
        <strong class="redeem-label">${q.label}</strong>
        <span class="redeem-desc">${q.desc}</span>
      </div>
      <div class="redeem-right">
        <span class="redeem-reward">-${q.reward} penalty</span>
        <button class="redeem-claim-btn"
          data-quest="${q.id}"
          data-reward="${q.reward}"
          ${isClaimed || !isUnlocked ? 'disabled' : ''}>
          ${isClaimed ? '\u2713 Claimed' : isUnlocked ? 'Claim' : 'Locked'}
        </button>
      </div>`;
    list.appendChild(tile);
  });

  /* Update subtitle */
  const sub = document.getElementById('redemptionSub');
  if (sub) sub.textContent = 'Penalty: ' + state.penalty + ' pts  \u2022  Complete quests below to reduce it';
}

/* ==============================================================
   RENDER: CATEGORY SELECT
   ============================================================== */
function renderCategorySelect() {
  if (!state.categories || !state.categories.length) state.categories = [...DEFAULT_CATEGORIES];

  const sel = document.getElementById('taskCategory');
  const cur = sel.value;
  sel.innerHTML = '';
  state.categories.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    if (c === cur) o.selected = true;
    sel.appendChild(o);
  });

  const tagsEl = document.getElementById('catTags');
  if (!tagsEl) return;
  tagsEl.innerHTML = '';
  state.categories.forEach(c => {
    const span = document.createElement('span');
    span.className = 'cat-tag';
    span.innerHTML = escHtml(c) +
      '<button class="cat-tag-del" data-del-cat="' + escHtml(c) + '" type="button" title="Remove">&times;</button>';
    tagsEl.appendChild(span);
  });
}

/* ==============================================================
   RENDER: TASKS
   ============================================================== */
function renderTasks() {
  const list = document.getElementById('taskList');
  const hint = document.getElementById('taskHint');
  const lockBtn = document.getElementById('lockDayBtn');
  const addInput = document.getElementById('taskInput');
  const emptyState = document.getElementById('taskEmptyState');
  const lockedBanner = document.getElementById('dayLockedBanner');
  const tomorrowSection = document.getElementById('tomorrowQueueSection');
  const tomorrowList = document.getElementById('tomorrowQueueList');
  const tomorrowEmpty = document.getElementById('tomorrowQueueEmpty');
  const tomorrowCount = document.getElementById('tomorrowQueueCount');
  const taskSubmitBtn = document.querySelector('#taskForm button[type="submit"]');

  const isFinalized = !!state.logs[state.currentDate];
  const tomorrowQueue = state.tomorrowQueue || [];

  /* ── SVG ring (always based on active tasks) ── */
  const activeTasks = state.tasks.filter(t => !t.carry);
  const doneCnt = activeTasks.filter(t => t.done).length;
  const planned = activeTasks.length;
  const ringPct = planned > 0 ? (doneCnt / Math.max(planned, 3)) : 0;
  const circum = 2 * Math.PI * 18;
  const fill = document.getElementById('ringFill');
  const ringLabel = document.getElementById('ringLabel');
  if (fill) {
    fill.style.strokeDashoffset = circum * (1 - ringPct);
    fill.style.stroke = doneCnt >= 3 ? 'var(--ok)' : doneCnt > 0 ? 'var(--partial)' : 'var(--muted)';
  }
  if (ringLabel) {
    ringLabel.textContent = doneCnt + '/3';
    ringLabel.style.color = doneCnt >= 3 ? 'var(--ok)' : doneCnt > 0 ? 'var(--partial)' : 'var(--muted)';
  }

  /* ══════════════════════════════════════════════════════════
     BRANCH A — NOT YET FINALIZED
     ════════════════════════════════════════════════════════ */
  if (!isFinalized) {
    /* Hint */
    if (state.tasks.length === 0) {
      hint.textContent = 'Set 3 training targets for today. Deku never trains empty-handed.';
    } else {
      const carriedIn = state.tasks.filter(t => t.carried).length;
      hint.textContent =
        activeTasks.length + '/3 planned  \u00B7  ' + doneCnt + ' completed' +
        (carriedIn ? '  \u00B7  ' + carriedIn + ' carried over' : '');
    }

    /* Task list */
    list.innerHTML = '';
    if (state.tasks.length === 0) {
      emptyState.style.display = 'block';
      list.style.display = 'none';
    } else {
      emptyState.style.display = 'none';
      list.style.display = 'grid';
      state.tasks.forEach((task, idx) => {
        const li = document.createElement('li');
        let cls = 'task-item';
        if (task.done) cls += ' done';
        if (task.carried) cls += ' carried-task';
        if (task.carry) cls += ' carry-marked';
        li.className = cls;

        const carriedBadge = task.carried
          ? '<span class="task-carried-badge" title="Carried over from a previous day">\u21A9 Carried</span>'
          : '';
        /* Carry button: available for undone tasks that aren't already carried-in */
        const carryBtn = !task.done
          ? '<button class="btn-sm carry-toggle-btn' + (task.carry ? ' active' : '') +
          '" data-carry-id="' + task.id + '" type="button" title="Mark to carry forward">\u21A9</button>'
          : '';

        li.innerHTML =
          '<span class="task-num">' + (idx + 1) + '.</span>' +
          carriedBadge +
          '<span class="category-badge badge-' + escHtml(task.cat) + '">' + escHtml(task.cat) + '</span>' +
          '<span class="task-text" data-task-text-id="' + task.id + '">' + escHtml(task.text) + '</span>' +
          '<span class="task-actions">' +
          carryBtn +
          '<button class="btn-sm task-btn-edit" data-edit-id="' + task.id +
          '" type="button" title="Edit">&#9998;</button>' +
          '<button class="btn-sm" data-task-id="' + task.id + '" type="button">' +
          (task.done ? 'Undo' : 'Done') +
          '</button>' +
          '<button class="btn-sm danger" data-delete-id="' + task.id +
          '" type="button" title="Remove">&times;</button>' +
          '</span>';
        list.appendChild(li);
      });
    }

    /* Input & buttons */
    const slotsFull = activeTasks.length >= 3;
    addInput.disabled = slotsFull;
    addInput.placeholder = slotsFull ? 'Max 3 active tasks reached' : 'New target…';
    if (taskSubmitBtn) {
      taskSubmitBtn.disabled = slotsFull;
      taskSubmitBtn.textContent = '+ Add';
    }
    lockBtn.style.display = '';
    lockBtn.disabled = activeTasks.length === 0;

    /* Hide tomorrow section & banner */
    if (tomorrowSection) tomorrowSection.style.display = 'none';
    if (lockedBanner) lockedBanner.style.display = 'none';

    return; /* ← done for pre-finalization */
  }

  /* ══════════════════════════════════════════════════════════
     BRANCH B — DAY IS FINALIZED (frozen view)
     ════════════════════════════════════════════════════════ */

  /* Hint */
  hint.textContent = doneCnt + '/' + Math.max(planned, 3) + ' tasks completed today';

  /* Frozen task list */
  list.innerHTML = '';
  emptyState.style.display = 'none';
  list.style.display = 'grid';

  state.tasks.forEach((task, idx) => {
    const li = document.createElement('li');
    let cls = 'task-item task-frozen';
    let resultIcon = '';

    if (task.done) {
      cls += ' frozen-done';
      resultIcon = '<span class="task-result-icon ok">\u2713 Done</span>';
    } else if (task.carry) {
      cls += ' frozen-carry';
      resultIcon = '<span class="task-result-icon partial">\u2192 Tomorrow</span>';
    } else {
      cls += ' frozen-missed';
      resultIcon = '<span class="task-result-icon danger">\u2715 Missed</span>';
    }
    li.className = cls;

    const carriedBadge = task.carried
      ? '<span class="task-carried-badge">\u21A9 Carried</span>'
      : '';

    li.innerHTML =
      '<span class="task-num">' + (idx + 1) + '.</span>' +
      carriedBadge +
      '<span class="category-badge badge-' + escHtml(task.cat) + '">' + escHtml(task.cat) + '</span>' +
      '<span class="task-text">' + escHtml(task.text) + '</span>' +
      resultIcon;
    list.appendChild(li);
  });

  /* Input morphs into tomorrow planner */
  const tqLen = tomorrowQueue.length;
  addInput.disabled = tqLen >= 3;
  addInput.placeholder = tqLen >= 3 ? 'Tomorrow is full (3/3)' : 'Queue a task for tomorrow\u2026';
  if (taskSubmitBtn) {
    taskSubmitBtn.disabled = tqLen >= 3;
    taskSubmitBtn.textContent = '+ Plan Tomorrow';
  }
  lockBtn.style.display = 'none';

  /* Tomorrow queue section */
  if (tomorrowSection) {
    tomorrowSection.style.display = 'block';
    if (tomorrowCount) tomorrowCount.textContent = tqLen + ' / 3 slots';

    if (tomorrowList) {
      tomorrowList.innerHTML = '';
      if (tqLen === 0) {
        tomorrowList.style.display = 'none';
        if (tomorrowEmpty) tomorrowEmpty.style.display = 'block';
      } else {
        tomorrowList.style.display = 'grid';
        if (tomorrowEmpty) tomorrowEmpty.style.display = 'none';
        tomorrowQueue.forEach((task, idx) => {
          const li = document.createElement('li');
          li.className = 'task-item tomorrow-task-item';
          li.innerHTML =
            '<span class="task-num">' + (idx + 1) + '.</span>' +
            '<span class="task-new-tomorrow-badge">Tomorrow</span>' +
            '<span class="category-badge badge-' + escHtml(task.cat) + '">' + escHtml(task.cat) + '</span>' +
            '<span class="task-text">' + escHtml(task.text) + '</span>' +
            '<span class="task-actions">' +
            '<button class="btn-sm danger" data-delete-tomorrow-id="' + task.id +
            '" type="button" title="Remove">&times;</button>' +
            '</span>';
          tomorrowList.appendChild(li);
        });
      }
    }
  }

  /* Locked banner — show status summary */
  if (lockedBanner) {
    lockedBanner.style.display = 'flex';
    const titleEl = document.getElementById('dayLockedTitle');
    const subEl = document.getElementById('dayLockedSub');
    const isGood = doneCnt >= 3;
    if (titleEl) titleEl.textContent = isGood ? '\uD83D\uDD25 PLUS ULTRA! Day Complete' : '\uD83D\uDCCB Day Locked';
    if (subEl) subEl.textContent = isGood
      ? 'Perfect day! ' + tqLen + '/3 tasks queued for tomorrow.'
      : doneCnt + '/' + Math.max(planned, 3) + ' done. ' + tqLen + '/3 tasks queued for tomorrow.';
  }
}

/* ==============================================================
   RENDER: HEATMAP
   ============================================================== */
function renderHeatmap() {
  const heatmap = document.getElementById('heatmap');
  const emptyState = document.getElementById('heatmapEmptyState');
  heatmap.innerHTML = '';

  const today = dateKey(new Date());
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 139);

  const anyRecord = Object.keys(state.logs).length > 0;
  emptyState.style.display = anyRecord ? 'none' : 'block';
  heatmap.style.display = anyRecord ? 'grid' : 'none';

  for (let i = 0; i < 140; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = dateKey(d);
    const log = state.logs[key];

    const cell = document.createElement('div');
    cell.className = 'cell' + (key === today ? ' today' : '');
    if (log) cell.classList.add(log.status);

    let tip = key;
    if (key === today) tip += ' (Today)';
    if (log) {
      tip += '\n' + log.completed + '/' + Math.max(log.planned, 3) + ' tasks - ' + log.status.toUpperCase();
    } else {
      tip += '\nNo record';
    }
    cell.dataset.tip = tip;
    heatmap.appendChild(cell);
  }
}

/* ==============================================================
   RENDER: SUMMARIES
   ============================================================== */
function weekSummary(baseDate) {
  const e = new Date(baseDate), s = new Date(baseDate);
  s.setDate(e.getDate() - 6);
  return rangeSummary(s, e);
}
function monthSummary(baseDate) {
  const e = new Date(baseDate), s = new Date(baseDate);
  s.setDate(e.getDate() - 29);
  return rangeSummary(s, e);
}
function rangeSummary(startDate, endDate) {
  let completedDays = 0, missedDays = 0, partialDays = 0, planned = 0, completed = 0;
  const d = new Date(startDate);
  while (d <= endDate) {
    const log = state.logs[dateKey(d)];
    if (log) {
      planned += log.planned;
      completed += log.completed;
      if (log.status === 'completed') completedDays++;
      else if (log.status === 'partial') partialDays++;
      else missedDays++;
    }
    d.setDate(d.getDate() + 1);
  }
  return { planned, completed, completedDays, partialDays, missedDays };
}

function renderSummaries() {
  const week = weekSummary(new Date());
  const month = monthSummary(new Date());
  const wPct = week.planned > 0 ? Math.round((week.completed / week.planned) * 100) : 0;
  const mPct = month.planned > 0 ? Math.round((month.completed / month.planned) * 100) : 0;

  document.getElementById('weeklySummaryBlock').innerHTML =
    '<strong>This Week</strong>' +
    '<div class="summary-stat">' +
    week.completed + '/' + Math.max(week.planned, 1) + ' tasks &nbsp;&bull;&nbsp;' +
    '<span style="color:var(--ok)">' + week.completedDays + ' done</span>' +
    ' &nbsp;<span style="color:var(--partial)">' + week.partialDays + ' partial</span>' +
    ' &nbsp;<span style="color:var(--danger)">' + week.missedDays + ' missed</span>' +
    '</div>' +
    '<div class="summary-bar-wrap"><div class="summary-bar" style="width:' + wPct + '%"></div></div>' +
    '<span class="muted" style="font-size:0.76rem">' + wPct + '% completion rate</span>';

  document.getElementById('monthlySummaryBlock').innerHTML =
    '<strong>Last 30 Days</strong>' +
    '<div class="summary-stat">' +
    month.completed + '/' + Math.max(month.planned, 1) + ' tasks &nbsp;&bull;&nbsp;' +
    '<span style="color:var(--ok)">' + month.completedDays + ' done</span>' +
    ' &nbsp;<span style="color:var(--partial)">' + month.partialDays + ' partial</span>' +
    ' &nbsp;<span style="color:var(--danger)">' + month.missedDays + ' missed</span>' +
    '</div>' +
    '<div class="summary-bar-wrap"><div class="summary-bar" style="width:' + mPct + '%"></div></div>' +
    '<span class="muted" style="font-size:0.76rem">' + mPct + '% completion rate</span>';
}

/* ==============================================================
   RENDER: FOCUS SESSIONS
   ============================================================== */
function focusEff(actual, planned, interruptions) {
  // Cap at 100% max efficiency to prevent math exploits when actual > planned
  return Math.min(100, Math.max(0, Math.round((actual / Math.max(planned, 1)) * 100 - interruptions * 8)));
}

function renderFocusSessions() {
  const list = document.getElementById('focusList');
  const empty = document.getElementById('focusEmptyState');
  list.innerHTML = '';

  const todaySessions = state.focusSessions.filter(s => s.date === state.currentDate);

  if (todaySessions.length === 0) {
    empty.style.display = 'block';
    list.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  list.style.display = 'grid';

  todaySessions.forEach(s => {
    const eff = focusEff(s.actual, s.planned, s.interruptions);
    const effClass = eff >= 70 ? 'eff-high' : eff >= 45 ? 'eff-mid' : 'eff-low';
    const timeTag = s.startTime ? '<span class="session-start-time">\u23F0 ' + escHtml(s.startTime) + '</span>' : '';
    const li = document.createElement('li');
    li.className = 'compact-item';
    li.innerHTML =
      '<span>' +
      '<strong>' + escHtml(s.date) + '</strong>' + timeTag +
      ' &mdash; ' + s.actual + '/' + s.planned + ' min' +
      (s.interruptions ? ', ' + s.interruptions + ' interruption' + (s.interruptions > 1 ? 's' : '') : ', no interruptions') +
      (s.note && s.note !== '-' ? '<br><em>' + escHtml(s.note) + '</em>' : '') +
      '</span>' +
      '<span class="eff-badge ' + effClass + '">' + eff + '% eff</span>' +
      '<button class="btn-sm danger" data-delete-session-id="' + s.id + '" type="button" title="Delete session" style="margin-left:6px;padding:2px 7px;font-size:0.7rem">&times;</button>';
    list.appendChild(li);
  });
}

/* ==============================================================
   RENDER: HISTORY
   ============================================================== */
function renderHistory() {
  renderHistDays();
  renderHistFocus();
  updateHistResultCount();
}

/* Returns true if dateStr (YYYY-MM-DD) is within the current histFilter range */
function histDateInRange(dateStr) {
  if (histFilter.from && dateStr < histFilter.from) return false;
  if (histFilter.to && dateStr > histFilter.to) return false;
  return true;
}

/* Update the visible result count badge */
function updateHistResultCount() {
  const badge = document.getElementById('histResultCount');
  if (!badge) return;
  const isFiltered = histFilter.preset !== 'all' || histFilter.from || histFilter.to;
  if (!isFiltered) { badge.textContent = ''; badge.style.display = 'none'; return; }

  /* Count matching entries across all tabs */
  const daysCount = Object.keys(state.logs).filter(d => histDateInRange(d)).length;
  const focusCount = state.focusSessions.filter(s => histDateInRange(s.date)).length;
  const total = daysCount + focusCount;
  badge.textContent = total + ' result' + (total !== 1 ? 's' : '');
  badge.style.display = 'inline-block';
}

/* Convert a YYYY-Www week key back to the Monday date string */
function weekKeyToDate(wk) {
  const m = wk.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  /* ISO week: Jan 4 is always in week 1 */
  const jan4 = new Date(year, 0, 4);
  const w1Mon = new Date(jan4);
  w1Mon.setDate(jan4.getDate() - (jan4.getDay() === 0 ? 6 : jan4.getDay() - 1));
  const mon = new Date(w1Mon);
  mon.setDate(w1Mon.getDate() + (week - 1) * 7);
  return dateKey(mon);
}

function renderHistDays() {
  const list = document.getElementById('histDaysList');
  const empty = document.getElementById('histDaysEmpty');
  const allEntries = Object.entries(state.logs).sort((a, b) => b[0].localeCompare(a[0]));
  const entries = allEntries.filter(([d]) => histDateInRange(d));

  if (entries.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    /* Show a different message when filter is active */
    const p = empty.querySelector('p');
    if (p) p.textContent = allEntries.length > 0
      ? 'No days match the selected filter. Try a wider date range.'
      : 'No finalized days yet. Finalize your first day to start your battle record.';
    return;
  }
  list.style.display = 'flex';
  empty.style.display = 'none';
  list.innerHTML = '';

  entries.forEach(([date, log]) => {
    const focusMins = state.focusSessions
      .filter(s => s.date === date)
      .reduce((sum, s) => sum + (s.actual || 0), 0);

    // finalizeDay always awards XP_PER_TASK*3 (30 XP) for a completed day,
    // regardless of how many tasks were done (could be 3, 4, or 5).
    const xpDelta = log.status === 'completed'
      ? '+' + (XP_PER_TASK * 3) + ' XP'
      : '-' + XP_PENALTY + ' XP';
    const xpClass = log.status === 'completed' ? 'positive' : 'negative';

    const row = document.createElement('div');
    row.className = 'hist-row';
    row.setAttribute('role', 'listitem');
    row.innerHTML =
      '<span class="hist-date">' + escHtml(date) + '</span>' +
      '<div class="hist-main">' +
      '<span class="hist-title">' + log.completed + '/' + Math.max(log.planned, 3) + ' tasks completed</span>' +
      '<span class="hist-sub">' + (focusMins > 0 ? '\u23F1 ' + focusMins + ' min focus' : 'No focus session logged') + '</span>' +
      '</div>' +
      '<span class="hist-badge ' + log.status + '">' + log.status + '</span>' +
      '<span class="hist-xp ' + xpClass + '">' + xpDelta + '</span>';
    list.appendChild(row);
  });
}

function renderHistFocus() {
  const list = document.getElementById('histFocusList');
  const empty = document.getElementById('histFocusEmpty');
  const allSessions = [...state.focusSessions].sort((a, b) => b.date.localeCompare(a.date));
  const sessions = allSessions.filter(s => histDateInRange(s.date));

  if (sessions.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    const p = empty.querySelector('p');
    if (p) p.textContent = allSessions.length > 0
      ? 'No sessions match the selected filter. Try a wider date range.'
      : 'No focus sessions logged yet.';
    return;
  }
  list.style.display = 'flex';
  empty.style.display = 'none';
  list.innerHTML = '';

  sessions.forEach(s => {
    const eff = focusEff(s.actual, s.planned, s.interruptions);
    const effClass = eff >= 70 ? 'eff-high' : eff >= 45 ? 'eff-mid' : 'eff-low';
    const row = document.createElement('div');
    row.className = 'hist-row focus-row';
    row.setAttribute('role', 'listitem');
    row.innerHTML =
      '<span class="hist-date">' + escHtml(s.date) + (s.startTime ? '<br><span class="session-start-time">\u23F0 ' + escHtml(s.startTime) + '</span>' : '') + '</span>' +
      '<div class="hist-main">' +
      '<span class="hist-title">' + s.actual + ' min actual &nbsp;&bull;&nbsp; ' + s.planned + ' min planned</span>' +
      '<span class="hist-sub">' +
      (s.interruptions > 0 ? s.interruptions + ' interruption' + (s.interruptions > 1 ? 's' : '') : 'No interruptions') +
      (s.note && s.note !== '-' ? ' &nbsp;&bull;&nbsp; ' + escHtml(s.note) : '') +
      '</span>' +
      '</div>' +
      '<span class="hist-eff ' + effClass + '">' + eff + '% eff</span>' +
      '<button class="btn-sm danger" data-delete-session-id="' + s.id + '" style="padding:2px 8px;font-size:0.7rem" type="button" title="Remove">&times;</button>';
    list.appendChild(row);
  });
}

function renderHistReflect() {
  const list = document.getElementById('histReflectList');
  const empty = document.getElementById('histReflectEmpty');
  const allEntries = Object.entries(state.reflections).sort((a, b) => b[0].localeCompare(a[0]));
  const entries = allEntries.filter(([wk]) => {
    const mon = weekKeyToDate(wk);
    return mon ? histDateInRange(mon) : true;
  });

  if (entries.length === 0) {
    list.style.display = 'none';
    empty.style.display = 'block';
    const p = empty.querySelector('p');
    if (p) p.textContent = allEntries.length > 0
      ? 'No reflections match the selected filter. Try a wider date range.'
      : 'No reflections written yet.';
    return;
  }
  list.style.display = 'flex';
  empty.style.display = 'none';
  list.innerHTML = '';

  entries.forEach(([key, entry]) => {
    const card = document.createElement('div');
    card.className = 'hist-reflect-card';
    card.setAttribute('role', 'listitem');
    card.innerHTML =
      '<div class="reflect-week">Week: ' + escHtml(key) + '</div>' +
      '<div class="reflect-meta">Tasks: ' + entry.completed + '/' + Math.max(entry.planned, 1) +
      (entry.createdAt ? ' &nbsp;&bull;&nbsp; ' + new Date(entry.createdAt).toLocaleDateString() : '') +
      '</div>' +
      '<div class="reflect-body">' + escHtml(entry.text) + '</div>';
    list.appendChild(card);
  });
}

function exportHistoryCSV() {
  const lines = ['Date,Tasks Completed,Tasks Planned,Status,Focus Minutes,XP Delta'];
  Object.entries(state.logs)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([date, log]) => {
      const focusMins = state.focusSessions
        .filter(s => s.date === date)
        .reduce((sum, s) => sum + (s.actual || 0), 0);
      // finalizeDay always awards XP_PER_TASK*3 for completed days (flat 30 XP).
      const xpDelta = log.status === 'completed'
        ? '+' + (XP_PER_TASK * 3)
        : '-' + XP_PENALTY;
      lines.push([date, log.completed, Math.max(log.planned, 3), log.status, focusMins, xpDelta].join(','));
    });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'antiproc-history-' + dateKey(new Date()) + '.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('History exported as CSV.', 'ok');
}

/* ==============================================================
   RENDER: REFLECTIONS
   ============================================================== */
function currentWeekKey() {
  // Use ISO 8601 week numbering to match weekKeyToDate() decoder.
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0, 0, 0, 0);
  // ISO year = year of the Thursday in this week
  const thu = new Date(mon);
  thu.setDate(mon.getDate() + 3);
  const year = thu.getFullYear();
  // Monday of ISO week 1 for this year
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay();
  const w1Mon = new Date(jan4);
  w1Mon.setDate(jan4.getDate() - (jan4Day === 0 ? 6 : jan4Day - 1));
  const week = Math.round((mon - w1Mon) / (7 * 86400000)) + 1;
  return year + '-W' + String(week).padStart(2, '0');
}

function isReflectionDue() {
  const count = Object.keys(state.logs).length;
  // If no logs, obviously not due
  if (count === 0) return false;

  // They are eligible if they haven't submitted a reflection yet for the current ISO week,
  // AND the number of logged days is >= the expected multiple of 7 based on their first log.
  // A simpler fix to guarantee one reflection per 7 logged days: 
  // Let `targetReflections = Math.floor(count / 7)`.
  // If `Object.keys(state.reflections).length < targetReflections`, it's due.
  const targetReflections = Math.floor(count / 7);
  return count > 0 && Object.keys(state.reflections).length < targetReflections;
}

function renderReflections() {
  const prompt = document.getElementById('reflectionPrompt');
  const list = document.getElementById('reflectionList');
  const dueAlert = document.getElementById('reflectionDueAlert');
  const badge = document.getElementById('reflectionStatusBadge');
  const btn = document.getElementById('reflectionSubmitBtn');
  const empty = document.getElementById('reflectionEmptyState');
  const week = weekSummary(new Date());
  const due = isReflectionDue();

  if (due) {
    dueAlert.style.display = 'block';
    badge.textContent = 'Due Now';
    badge.className = 'status-badge due';
    btn.disabled = false;
  } else {
    dueAlert.style.display = 'none';
    badge.textContent = 'Locked';
    badge.className = 'status-badge';
    btn.disabled = true;
  }

  const logged = Object.keys(state.logs).length;
  const next = 7 - (logged % 7);
  prompt.textContent = due
    ? 'This week: planned ' + week.planned + ', completed ' + week.completed + '.'
    : 'Logged days: ' + logged + '. Next reflection unlocks in ' + (next === 7 ? 0 : next) + ' more logged day' + (next === 1 ? '' : 's') + '.';

  const entries = Object.entries(state.reflections)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 8);

  list.innerHTML = '';
  if (entries.length === 0) {
    empty.style.display = 'block';
    list.style.display = 'none';
  } else {
    empty.style.display = 'none';
    list.style.display = 'grid';
    entries.forEach(([key, entry]) => {
      const li = document.createElement('li');
      li.className = 'compact-item';
      li.innerHTML =
        '<span>' +
        '<strong>' + escHtml(key) + '</strong>' +
        ' &mdash; planned ' + entry.planned + ', completed ' + entry.completed +
        '<br><em>' + escHtml(entry.text) + '</em>' +
        '</span>';
      list.appendChild(li);
    });
  }
}

/* ==============================================================
   UTILITY
   ============================================================== */
function escHtml(t) {
  return String(t || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* ==============================================================
   DEKU QUOTES
   ============================================================== */
function initQuotes() {
  const dots = document.getElementById('dekuQuoteDots');
  if (!dots) return;
  DEKU_QUOTES.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'quote-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', 'Quote ' + (i + 1));
    dot.addEventListener('click', () => setQuote(i));
    dots.appendChild(dot);
  });
  showQuote(0);
  quoteTimer = setInterval(() => setQuote((quoteIndex + 1) % DEKU_QUOTES.length), 7000);
}

function setQuote(idx) {
  quoteIndex = idx;
  clearInterval(quoteTimer);
  showQuote(idx);
  quoteTimer = setInterval(() => setQuote((quoteIndex + 1) % DEKU_QUOTES.length), 7000);
}

function showQuote(idx) {
  const el = document.getElementById('dekuQuoteText');
  if (!el) return;
  el.style.opacity = '0';
  el.style.transition = 'opacity 0.3s ease';
  setTimeout(() => {
    el.textContent = '\u201C' + DEKU_QUOTES[idx] + '\u201D';
    el.style.opacity = '1';
  }, 200);
  document.querySelectorAll('.quote-dot').forEach((d, i) => {
    d.className = 'quote-dot' + (i === idx ? ' active' : '');
  });
}

/* ==============================================================
   CONFETTI (green lightning burst on perfect day)
   ============================================================== */
function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#3ddc84', '#7effc0', '#ffffff', '#60a5fa', '#ffd700', '#3ddc84', '#3ddc84'];
  const particles = Array.from({ length: 110 }, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 200,
    w: 6 + Math.random() * 8,
    h: 4 + Math.random() * 3,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 10,
    vx: (Math.random() - 0.5) * 3.5,
    vy: 2.5 + Math.random() * 3.5,
    alpha: 1
  }));

  let rafId;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let active = false;
    particles.forEach(p => {
      if (p.alpha <= 0) return;
      active = true;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.rotSpeed;
      if (p.y > canvas.height * 0.72) p.alpha -= 0.022;
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.alpha);
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    rafId = active ? requestAnimationFrame(animate) : (() => { canvas.style.display = 'none'; })();
  }
  rafId = requestAnimationFrame(animate);
  setTimeout(() => { cancelAnimationFrame(rafId); canvas.style.display = 'none'; }, 5500);
}

/* ==============================================================
   TIMER ALARM
   ============================================================== */
function triggerTimerAlarm() {
  /* Web Audio beep (3 pulses) */
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach(offset => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ac.currentTime + offset);
      gain.gain.setValueAtTime(0.4, ac.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + offset + 0.3);
      osc.start(ac.currentTime + offset);
      osc.stop(ac.currentTime + offset + 0.3);
    });
    setTimeout(() => ac.close(), 1500);
  } catch (_) { /* no audio ctx fallback */ }

  /* Visual alarm flash */
  const d = document.getElementById('timerDisplay');
  if (d) {
    d.classList.add('alarm');
    setTimeout(() => d.classList.remove('alarm'), 3200);
  }

  const label = timerMode === 'pomo'
    ? '\u{1F345} Pomodoro complete! Take a 5 min break.'
    : timerMode === 'custom'
      ? '\u23F1 Custom session complete! Log it.'
      : '\u26A1 OFA target hit! 90 min session complete. Log it.';
  toast(label, 'ok');

  /* Browser notification (works even in background) */
  sendNotification('AntiProc \u2014 Session Complete!', label);

  /* Auto-start 5-min break after Pomodoro */
  if (timerMode === 'pomo') {
    setTimeout(() => startBreakTimer(5), 800);
  }
}

/* ==============================================================
   TIMER MODE SWITCH
   ============================================================== */
function setTimerMode(mode, customMins) {
  if (timerRunning) { toast('Stop the active session before switching mode.', 'err'); return; }
  timerMode = mode;

  const targetEl = document.getElementById('timerTargetVal');
  const modeEl = document.getElementById('timerModeVal');

  if (mode === 'pomo') {
    timerTargetMs = 25 * 60 * 1000;
    if (targetEl) targetEl.textContent = '25 min (Pomodoro)';
    if (modeEl) modeEl.textContent = '\uD83C\uDF45 Pomodoro';
    toast('\uD83C\uDF45 Pomodoro mode: 25 min sprints.', 'info');
  } else if (mode === 'custom') {
    timerTargetMs = customMins * 60 * 1000;
    if (targetEl) targetEl.textContent = customMins + ' min (Custom)';
    if (modeEl) modeEl.textContent = '\u23F1 Custom';
    toast('\u23F1 Custom timer: ' + customMins + ' min.', 'info');
  } else {
    timerMode = 'ofa';
    timerTargetMs = 90 * 60 * 1000;
    if (targetEl) targetEl.textContent = '90 min (OFA)';
    if (modeEl) modeEl.textContent = '\u26A1 Plus Ultra';
    toast('\u26A1 OFA mode: 90 min deep work blocks.', 'info');
  }

  timerAlarmFired = false;

  document.getElementById('modeOfa').classList.toggle('active', mode === 'ofa');
  document.getElementById('modePomo').classList.toggle('active', mode === 'pomo');
  document.getElementById('timerCustomSetBtn').classList.toggle('active', mode === 'custom');
}

/* ============================================================
   NEW FEATURES — helper functions
   ============================================================ */

/* Returns total focus minutes logged today */
function todayFocusMinutes() {
  return state.focusSessions
    .filter(s => s.date === state.currentDate)
    .reduce((sum, s) => sum + (s.actual || 0), 0);
}

/* Browser notifications */
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}
function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: 'deku1.png' });
  }
}

/* Streak shield */
async function activateStreakShield() {
  const cost = 50;

  // If shield is already active — offer a refund cancellation
  if (state.streakShielded) {
    const { confirmed } = await showModal({
      title: '\uD83D\uDEE1\uFE0F Shield Already Active',
      body: 'Your streak shield is currently armed. Do you want to cancel it and get a full 50 XP refund?',
      confirmLabel: 'Yes, refund 50 XP',
      cancelLabel: 'Keep shield',
    });
    if (!confirmed) return;
    state.streakShielded = false;
    state.xp += cost;
    saveState(); renderAll();
    toast('\uD83D\uDEE1\uFE0F Shield cancelled \u2014 50 XP refunded.', 'info');
    return;
  }

  // Not yet active — confirm before spending XP
  if (state.xp < cost) { toast('Need ' + cost + ' XP to activate a streak shield. Keep grinding.', 'err'); return; }

  const { confirmed } = await showModal({
    title: '\uD83D\uDEE1\uFE0F Activate Streak Shield?',
    body: 'Spends 50 XP. The next time you miss a day the shield absorbs it \u2014 your streak survives. Are you sure?',
    confirmLabel: 'Spend 50 XP',
    cancelLabel: 'Cancel',
  });
  if (!confirmed) return;

  state.xp -= cost;
  state.streakShielded = true;
  saveState(); renderAll();
  toast('\uD83D\uDEE1\uFE0F Streak Shield activated! One missed day won\'t break your streak.', 'ok');
}

/* Restore streak after 1 missed day (costs 50 XP) */
async function restoreStreak() {
  const cost = 50;

  if (state.streakRestoreUsed) {
    toast('Streak already restored once. Earn it back the hard way, hero.', 'err');
    return;
  }
  const prev = state.lastStreak || 0;
  if (prev === 0) {
    toast('No previous streak to restore.', 'err');
    return;
  }
  if (state.xp < cost) {
    toast('Need 50 XP to restore streak. Keep grinding.', 'err');
    return;
  }

  const { confirmed } = await showModal({
    title: '\uD83D\uDD25 Restore Streak?',
    body: 'Spend 50 XP to recover your ' + prev + '-day streak? This undoes 1 missed day.',
    confirmLabel: 'Spend 50 XP',
    cancelLabel: 'Cancel',
    danger: false,
    showInput: false,
  });
  if (!confirmed) return;

  state.xp -= cost;
  state.streak = prev;
  state.bestStreak = Math.max(state.bestStreak, state.streak);
  state.streakRestoreUsed = true;
  state.lastStreak = 0;
  saveState(); renderAll();
  toast('\uD83D\uDD25 Streak restored to ' + state.streak + ' days! Don\'t miss again, hero.', 'ok');
}

/* Delete a focus session by id */
function deleteSession(id) {
  pushUndo('Session deleted.');
  state.focusSessions = state.focusSessions.filter(s => s.id !== id);
  saveState(); renderAll();
  toast('Session removed.', 'info');
}

/* Pomodoro break timer */
function startBreakTimer(mins) {
  breakSeconds = mins * 60;
  const wrap = document.getElementById('breakTimerWrap');
  const count = document.getElementById('breakTimerCount');
  if (wrap) wrap.style.display = 'flex';
  toast('\u2615 ' + mins + '-min break started. Rest up, hero.', 'info');
  clearInterval(breakInterval);
  breakInterval = setInterval(() => {
    breakSeconds--;
    const m = Math.floor(breakSeconds / 60);
    const s = breakSeconds % 60;
    if (count) count.textContent = pad(m) + ':' + pad(s);
    if (breakSeconds <= 0) {
      clearInterval(breakInterval);
      if (wrap) wrap.style.display = 'none';
      toast('\u26A1 Break over! Start your next session.', 'ok');
      sendNotification('Break Over!', 'Time to get back to work, hero!');
    }
  }, 1000);
}

function skipBreak() {
  clearInterval(breakInterval);
  breakSeconds = 0;
  const wrap = document.getElementById('breakTimerWrap');
  if (wrap) wrap.style.display = 'none';
  toast('Break skipped. OFA never rests.', 'info');
}

/* ==============================================================
   FIREBASE CLOUD SYNC
   ============================================================== */
async function initFirebase(initialUser) {
  if (!isFirebaseReady()) return;
  if (firebaseInitialized && fbUser && initialUser && fbUser.uid === initialUser.uid) return;

  firebaseInitialized = true;
  let currentUid = null;

  async function handleUser(user) {
    if (user && user.uid === currentUid) return;
    if (!user && currentUid === null && fbUser === null) return;
    currentUid = user ? user.uid : null;

    fbUser = user;
    updateLoginUI(user);
    if (!user) { updateSyncUI('offline'); return; }

    updateSyncUI('syncing');
    try {
      const remote = await pullState(user.uid);
      if (remote) {
        state = normalizeState(JSON.parse(remote.data));
        // If cloud state is from a previous day, roll it forward immediately.
        // This promotes tomorrowQueue into today's active tasks before first render.
        advanceDays();
        // Persist post-rollover state locally and sync it back to cloud via saveState().
        saveState();
        renderAll();
        toast('\u2601 Synced from cloud \u2014 latest data loaded.', 'ok');
      } else {
        // No cloud data yet — push current in-memory state
        const payload = JSON.stringify(state);
        await pushState(user.uid, payload, new Date().toISOString());
        toast('\u2601 Cloud sync active \u2014 all devices stay in sync.', 'ok');
      }
      updateSyncUI('synced');
    } catch (e) {
      console.warn('[APEX] Cloud sync error:', e);
      updateSyncUI('error');
    }
  }

  await handleUser(initialUser);
  onAuthChange((user) => { handleUser(user); });
}

function updateLoginUI(user) {
  const btn = document.getElementById('syncLoginBtn');
  if (!btn) return;
  const drop = document.getElementById('syncDropdown');
  const emailSpan = document.getElementById('syncDropdownEmail');
  if (user) {
    const name = user.displayName ? user.displayName.split(' ')[0] : 'Signed in';
    btn.textContent = '\u2601 ' + name + ' \u25be';
    btn.title = 'Click to see account options';
    btn.classList.add('sync-active');
    if (emailSpan) emailSpan.textContent = user.email || '';
    if (drop) drop.hidden = true;
  } else {
    btn.textContent = '\u2601 Sync';
    btn.title = 'Sign in with Google to sync your data across all devices';
    btn.classList.remove('sync-active');
    if (drop) drop.hidden = true;
  }
}

function updateSyncUI(status) {
  const dot = document.getElementById('syncStatusDot');
  if (!dot) return;
  dot.className = 'sync-dot sync-' + status;
  dot.title = {
    syncing: 'Syncing to cloud\u2026',
    synced: 'Cloud sync active \u2713',
    error: 'Sync failed \u2014 check your connection',
    offline: 'Not signed in \u2014 local only'
  }[status] || '';
}

/* ==============================================================
   SIDEBAR SCROLL-SPY
   ============================================================== */
(function initScrollSpy() {
  const sectionIds = ['sec-header', 'sec-stats', 'sec-tasks', 'sec-timer', 'sec-log', 'sec-dashboard', 'sec-history', 'sec-analytics'];
  const navItems = document.querySelectorAll('.side-nav-item');

  function getActiveId() {
    const threshold = window.innerHeight * 0.4;
    let activeId = sectionIds[0];
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      const top = el.getBoundingClientRect().top;
      if (top <= threshold) activeId = id;
    }
    return activeId;
  }

  function updateNav() {
    const activeId = getActiveId();
    navItems.forEach(a => {
      const shouldBeActive = a.dataset.section === activeId;
      if (shouldBeActive && !a.classList.contains('active')) {
        navItems.forEach(x => x.classList.remove('active'));
        a.classList.add('active');
      }
    });
  }

  // Listen on both window and document to catch all scroll contexts
  let ticking = false;
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(() => { updateNav(); ticking = false; });
      ticking = true;
    }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('scroll', onScroll, { passive: true });

  // Poll every 250ms as bulletproof fallback
  setInterval(updateNav, 250);

  // Initial state at multiple delays
  updateNav();
  setTimeout(updateNav, 50);
  setTimeout(updateNav, 200);
  setTimeout(updateNav, 500);

  navItems.forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const target = document.getElementById(a.dataset.section);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setTimeout(updateNav, 600);
      }
    });
  });
})();
