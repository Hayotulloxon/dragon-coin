// main.js — Fixed: UID persistence, leaderboard duplicates, global tasks, tap limit

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getDatabase, ref, set, get, push, update, remove, onValue, off, runTransaction, query, orderByChild, equalTo
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

/* ============
   CONFIG
   ============ */
const firebaseConfig = {
  apiKey: "AIzaSyDShZAo9lg-SxpQViCT27uXVni1UK7TGYU",
  authDomain: "dragon-92897.firebaseapp.com",
  databaseURL: "https://dragon-92897-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dragon-92897",
  storageBucket: "dragon-92897.firebasestorage.app",
  messagingSenderId: "40351345340",
  appId: "1:40351345340:web:632388a9b45d3c7905feb9"
};

/* ============
   Globals
   ============ */
let app, db, auth, currentUser = null;
let isAdminUser = false;
let listeners = { player: null, leaderboard: null, tasks: null };
let tapLimit = 1000;
let currentTapsToday = 0;

const $ = id => document.getElementById(id);
const safeText = (id, v) => { const e = $(id); if (e) e.textContent = String(v); };
const safeHTML = (id, h) => { const e = $(id); if (e) e.innerHTML = h; };
const esc = s => String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const toast = m => { try { alert(m); } catch(e) { console.log(m); } };
const getTodayKey = () => new Date().toISOString().split('T')[0];

/* ============
   Init Firebase + Auth
   ============ */
function initializeFirebase() {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  db = getDatabase(app);
  auth = getAuth(app);

  setPersistence(auth, browserLocalPersistence)
    .then(() => signInAnonymously(auth))
    .catch(err => console.error("Auth error:", err));

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    currentUser = user;

    await ensurePlayerDoc(user.uid);
    const tgUser = getTelegramUser();
    if (tgUser) await saveTelegramInfo(user.uid, tgUser);

    isAdminUser = await checkAdmin(user.uid);
    showAdmin(isAdminUser);

    listenPlayer(user.uid);
    startLeaderboardListener("coins");
    startTasksListener();

    await loadDailyTaps(user.uid);
  });
}

/* ============
   Get Telegram user info
   ============ */
function getTelegramUser() {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg) return null;
    const u = tg.initDataUnsafe?.user ?? null;
    if (!u) return null;
    return { id: u.id, first_name: u.first_name, last_name: u.last_name, username: u.username };
  } catch { return null; }
}

async function saveTelegramInfo(uid, tgUser) {
  try {
    await update(ref(db, `players/${uid}/telegram`), tgUser);
  } catch (e) {
    console.error("Failed to save Telegram info:", e);
  }
}

/* ============
   Ensure player exists
   ============ */
async function ensurePlayerDoc(uid) {
  const r = ref(db, `players/${uid}`);
  const snap = await get(r);
  if (!snap.exists()) {
    await set(r, {
      name: "Dragon Miner",
      coins: 0,
      taps: 0,
      level: 1,
      referrals: 0,
      createdAt: Date.now(),
      dailyTaps: {}
    });
  }
}

/* ============
   Load daily taps
   ============ */
async function loadDailyTaps(uid) {
  const r = ref(db, `players/${uid}/dailyTaps/${getTodayKey()}`);
  const snap = await get(r);
  currentTapsToday = snap.val() || 0;
  enableTapButton();
}

/* ============
   Admin check
   ============ */
async function checkAdmin(uid) {
  const s = await get(ref(db, `admins/${uid}`));
  return s.exists() && s.val() === true;
}

function showAdmin(flag) {
  const adminEl = $("adminSection");
  if (adminEl) adminEl.style.display = flag ? "" : "none";
}

/* ============
   Player listener
   ============ */
function listenPlayer(uid) {
  if (listeners.player) off(listeners.player);
  const r = ref(db, `players/${uid}`);
  listeners.player = onValue(r, snap => {
    if (!snap.exists()) return;
    const data = snap.val() || {};
    safeText("balance", data.coins ?? 0);
    safeText("totalTaps", data.taps ?? 0);
    localStorage.setItem("coins", data.coins ?? 0);
    localStorage.setItem("taps", data.taps ?? 0);
    currentTapsToday = data.dailyTaps?.[getTodayKey()] || 0;
  });
}

/* ============
   Tap with limit + transaction
   ============ */
async function handleTap() {
  if (!currentUser) return toast("Login first");
  if (currentTapsToday >= tapLimit) return toast("Daily tap limit reached!");

  const uid = currentUser.uid;
  const todayKey = getTodayKey();

  try {
    await runTransaction(ref(db, `players/${uid}`), (player) => {
      if (!player) return null;
      const tapsToday = player.dailyTaps?.[todayKey] || 0;
      if (tapsToday >= tapLimit) return player; // prevent cheating
      return {
        ...player,
        coins: (player.coins || 0) + 1,
        taps: (player.taps || 0) + 1,
        dailyTaps: {
          ...(player.dailyTaps || {}),
          [todayKey]: tapsToday + 1
        }
      };
    });
    currentTapsToday++;
  } catch (e) {
    console.error("Tap error:", e);
    toast("Tap failed");
  }
}

/* ============
   Enable Tap Button after data load
   ============ */
function enableTapButton() {
  const btn = $("tapButton");
  if (btn) btn.disabled = false;
}

/* ============
   Tasks listener
   ============ */
function startTasksListener() {
  if (listeners.tasks) off(listeners.tasks);
  const r = ref(db, "globalCustomTasks");
  listeners.tasks = onValue(r, snap => {
    const target = "customTasksList";
    if (!snap.exists()) return safeHTML(target, "<p style='color:#999'>No tasks</p>");
    const tasks = snap.val() || {};
    let html = "";
    Object.entries(tasks).forEach(([id, t]) => {
      if (!t || t.status !== "active") return;
      html += `
        <div class="task" style="background:#222;padding:10px;border-radius:8px;margin:8px 0">
          <div style="font-weight:700">${esc(t.name)}</div>
          <div style="opacity:.8">Reward: ${Number(t.reward)||0} 🪙</div>
          <div style="margin-top:8px"><button data-task-id="${id}" data-reward="${Number(t.reward)||0}" class="btn-complete">Complete</button></div>
        </div>
      `;
    });
    safeHTML(target, html || "<p>No tasks</p>");
    const wrap = $(target);
    if (wrap) {
      wrap.querySelectorAll(".btn-complete").forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute("data-task-id");
          const reward = Number(btn.getAttribute("data-reward")) || 0;
          await completeTask(id, reward);
        };
      });
    }
  });
}

/* ============
   Complete Task
   ============ */
async function completeTask(taskId, reward) {
  if (!currentUser) return toast("Login first");
  const uid = currentUser.uid;
  const completedRef = ref(db, `players/${uid}/tasksCompleted/${taskId}`);
  const snap = await get(completedRef);
  if (snap.exists()) return toast("Task already completed");
  await runTransaction(ref(db, `players/${uid}/coins`), c => (c || 0) + reward);
  await set(completedRef, true);
  toast(`Task completed: +${reward} 🪙`);
}

/* ============
   Leaderboard
   ============ */
function startLeaderboardListener(type = "coins") {
  if (listeners.leaderboard) off(listeners.leaderboard);
  const r = ref(db, "players");
  listeners.leaderboard = onValue(r, snap => {
    const target = "leaderboardList";
    if (!snap.exists()) return safeHTML(target, "<p>No players yet</p>");
    const data = snap.val() || {};
    const players = Object.entries(data)
      .map(([id, p]) => ({ id, ...p }))
      .filter(p => p && typeof p[type] === "number")
      .sort((a, b) => (b[type] || 0) - (a[type] || 0))
      .slice(0, 50);

    const html = players.map((p, i) => `
      <div style="padding:8px;border-bottom:1px solid #333;${p.id === currentUser?.uid ? 'background:#1f1f1f;color:#ffd700;' : ''}">
        #${i+1} — ${esc(p.name || "Player")} — ${(type === "coins" ? p.coins : p.referrals) || 0}
      </div>
    `).join("");
    safeHTML(target, html);
  });
}

/* ============
   Admin actions
   ============ */
async function adminAddTask() {
  if (!isAdminUser) return toast("Admin only");
  const name = prompt("Task name:");
  const reward = Number(prompt("Reward:"));
  if (!name || reward <= 0) return toast("Invalid");
  const newRef = push(ref(db, "globalCustomTasks"));
  await set(newRef, {
    name, reward,
    status: "active",
    createdAt: Date.now(),
    createdBy: currentUser.uid
  });
  toast("Task added");
}

/* ============
   UI binding
   ============ */
function bindUI() {
  const tapBtn = $("tapButton");
  if (tapBtn) tapBtn.addEventListener("click", handleTap);

  $("btn-leaderboard-coins")?.addEventListener("click", () => startLeaderboardListener("coins"));
  $("btn-leaderboard-referrals")?.addEventListener("click", () => startLeaderboardListener("referrals"));

  const adminSec = $("adminSection");
  if (adminSec) {
    adminSec.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      if (btn.dataset.action === "addTask") adminAddTask();
    });
  }

  const cachedCoins = localStorage.getItem("coins");
  const cachedTaps = localStorage.getItem("taps");
  if (cachedCoins) safeText("balance", cachedCoins);
  if (cachedTaps) safeText("totalTaps", cachedTaps);
}

document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  initializeFirebase();
});
