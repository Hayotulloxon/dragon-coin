// main.js — Full fix: Permissions, Leaderboard, Global Tasks, Tap Limit

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getDatabase, ref, set, get, push, update, remove, onValue, off, runTransaction
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
const tapLimit = 1000;
let currentTapsToday = 0;

const $ = id => document.getElementById(id);
const safeText = (id, v) => { const e = $(id); if (e) e.textContent = String(v); };
const safeHTML = (id, h) => { const e = $(id); if (e) e.innerHTML = h; };
const esc = s => String(s ?? "").replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const toast = m => alert(m);
const getTodayKey = () => new Date().toISOString().split('T')[0];

/* ============
   Init Firebase
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

    await ensurePlayer(user.uid);

    const tgUser = getTelegramUser();
    if (tgUser) await saveTelegram(user.uid, tgUser);

    isAdminUser = await checkAdmin(user.uid);
    showAdmin(isAdminUser);

    listenPlayer(user.uid);
    startLeaderboard();
    startTasks();

    await loadDailyTaps(user.uid);
  });
}

/* ============
   Player Setup
   ============ */
async function ensurePlayer(uid) {
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

function getTelegramUser() {
  try {
    const tg = window.Telegram?.WebApp;
    return tg?.initDataUnsafe?.user || null;
  } catch { return null; }
}

async function saveTelegram(uid, tgUser) {
  try {
    await update(ref(db, `players/${uid}/telegram`), tgUser);
  } catch (e) {
    console.error("Telegram save failed:", e);
  }
}

/* ============
   Admin Check
   ============ */
async function checkAdmin(uid) {
  const snap = await get(ref(db, `admins/${uid}`));
  return snap.exists() && snap.val() === true;
}

function showAdmin(flag) {
  const adminEl = $("adminSection");
  if (adminEl) adminEl.style.display = flag ? "" : "none";
}

/* ============
   Daily taps
   ============ */
async function loadDailyTaps(uid) {
  const r = ref(db, `players/${uid}/dailyTaps/${getTodayKey()}`);
  const snap = await get(r);
  currentTapsToday = snap.val() || 0;
  enableTapButton();
}

/* ============
   Tap with limit
   ============ */
async function handleTap() {
  if (!currentUser) return toast("Login first");
  if (currentTapsToday >= tapLimit) return toast("Daily tap limit reached!");

  try {
    await runTransaction(ref(db, `players/${currentUser.uid}`), (p) => {
      if (!p) return null;
      const todayKey = getTodayKey();
      const tapsToday = p.dailyTaps?.[todayKey] || 0;
      if (tapsToday >= tapLimit) return p;
      return {
        ...p,
        coins: (p.coins || 0) + 1,
        taps: (p.taps || 0) + 1,
        dailyTaps: { ...(p.dailyTaps || {}), [todayKey]: tapsToday + 1 }
      };
    });
    currentTapsToday++;
  } catch (e) {
    console.error("Tap failed:", e);
  }
}

function enableTapButton() {
  const btn = $("tapButton");
  if (btn) btn.disabled = false;
}

/* ============
   Player listener
   ============ */
function listenPlayer(uid) {
  if (listeners.player) off(listeners.player);
  const r = ref(db, `players/${uid}`);
  listeners.player = onValue(r, snap => {
    if (!snap.exists()) return;
    const data = snap.val();
    safeText("balance", data.coins ?? 0);
    safeText("totalTaps", data.taps ?? 0);
    localStorage.setItem("coins", data.coins ?? 0);
    localStorage.setItem("taps", data.taps ?? 0);
    currentTapsToday = data.dailyTaps?.[getTodayKey()] || 0;
  });
}

/* ============
   Leaderboard
   ============ */
function startLeaderboard(type = "coins") {
  if (listeners.leaderboard) off(listeners.leaderboard);
  const r = ref(db, "players");
  listeners.leaderboard = onValue(r, snap => {
    const target = "leaderboardList";
    if (!snap.exists()) return safeHTML(target, "<p>No players yet</p>");
    const players = Object.entries(snap.val())
      .map(([id, p]) => ({ id, ...p }))
      .filter(p => typeof p[type] === "number")
      .sort((a, b) => (b[type] || 0) - (a[type] || 0))
      .slice(0, 50);

    safeHTML(target, players.map((p, i) => `
      <div style="padding:8px;border-bottom:1px solid #333;${p.id === currentUser?.uid ? 'background:#1f1f1f;color:#ffd700;' : ''}">
        #${i+1} — ${esc(p.name || "Player")} — ${(type === "coins" ? p.coins : p.referrals) || 0}
      </div>
    `).join(""));
  });
}

/* ============
   Tasks
   ============ */
function startTasks() {
  if (listeners.tasks) off(listeners.tasks);
  const r = ref(db, "globalCustomTasks");
  listeners.tasks = onValue(r, snap => {
    const target = "customTasksList";
    if (!snap.exists()) return safeHTML(target, "<p>No tasks</p>");
    const tasks = snap.val() || {};
    let html = "";
    Object.entries(tasks).forEach(([id, t]) => {
      if (t.status !== "active") return;
      html += `
        <div class="task" style="background:#222;padding:10px;border-radius:8px;margin:8px 0">
          <div><b>${esc(t.name)}</b></div>
          <div>Reward: ${t.reward} 🪙</div>
          <button data-id="${id}" data-reward="${t.reward}" class="btn-complete">Complete</button>
        </div>`;
    });
    safeHTML(target, html || "<p>No tasks</p>");
    $(target)?.querySelectorAll(".btn-complete").forEach(btn => {
      btn.onclick = () => completeTask(btn.dataset.id, Number(btn.dataset.reward));
    });
  });
}

async function completeTask(taskId, reward) {
  const uid = currentUser?.uid;
  if (!uid) return toast("Login first");
  const completedRef = ref(db, `players/${uid}/tasksCompleted/${taskId}`);
  if ((await get(completedRef)).exists()) return toast("Already completed");
  await runTransaction(ref(db, `players/${uid}/coins`), c => (c || 0) + reward);
  await set(completedRef, true);
  toast(`+${reward} coins`);
}

/* ============
   Admin Add Task
   ============ */
async function adminAddTask() {
  if (!isAdminUser) return toast("Admin only");
  const name = prompt("Task name:");
  const reward = Number(prompt("Reward:"));
  if (!name || reward <= 0) return toast("Invalid");
  const newRef = push(ref(db, "globalCustomTasks"));
  await set(newRef, { name, reward, status: "active", createdAt: Date.now(), createdBy: currentUser.uid });
  toast("Task added");
}

/* ============
   UI binding
   ============ */
function bindUI() {
  $("tapButton")?.addEventListener("click", handleTap);
  $("btn-leaderboard-coins")?.addEventListener("click", () => startLeaderboard("coins"));
  $("btn-leaderboard-referrals")?.addEventListener("click", () => startLeaderboard("referrals"));
  $("adminSection")?.addEventListener("click", e => {
    if (e.target.closest("[data-action='addTask']")) adminAddTask();
  });

  // Restore cached values
  safeText("balance", localStorage.getItem("coins") || 0);
  safeText("totalTaps", localStorage.getItem("taps") || 0);
}

document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  initializeFirebase();
});
