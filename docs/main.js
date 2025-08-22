// main.js — final, Telegram-aware, Firebase-safe implementation

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getDatabase, ref, set, get, push, update, remove, onValue, off, runTransaction
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

/* ============
   CONFIG — o'zingiznikiga almashtiring
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
   Globals & helpers
   ============ */
let app, db, auth, currentUser = null;
let isAdminUser = false;
let listeners = { player: null, leaderboard: null, tasks: null };

const $ = id => document.getElementById(id);
const safeText = (id, v) => { const e = $(id); if (e) e.textContent = String(v); };
const safeHTML = (id, h) => { const e = $(id); if (e) e.innerHTML = h; };
const esc = s => String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const toast = m => { try { alert(m); } catch(e){ console.log(m); } };

/* ============
   Init Firebase + auth persistence
   ============ */
function initializeFirebase() {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    console.log("✅ Firebase initialized");
  } else {
    app = getApps()[0];
    console.log("ℹ️ Firebase already initialized");
  }
  db = getDatabase(app);
  auth = getAuth(app);

  // keep auth persistent across reloads
  setPersistence(auth, browserLocalPersistence)
    .then(() => signInAnonymously(auth))
    .catch(err => console.error("Auth/persistence error:", err));

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUser = null;
      detachAllListeners();
      showAdmin(false);
      return;
    }
    currentUser = user;

    // Ensure player's DB node exists (only create if missing)
    await ensurePlayerDoc(user.uid);

    // attempt to detect Telegram WebApp user (if present) and store/display it
    attachTelegramInfoIfPresent(user.uid);

    // check admin status (reads admins/<uid> — rules allow user to read own admin flag)
    isAdminUser = await safeCheckAdmin(user.uid);
    showAdmin(isAdminUser);

    // start real-time listeners
    listenPlayer(user.uid);
    startLeaderboardListener("coins");
    startTasksListener();

    // if admin, attempt to read globalTaskSettings (try/catch inside)
    if (isAdminUser) {
      try { await readGlobalTaskSettings(); } catch(e){ console.warn("Global settings read failed:", e); }
    }
  });
}

/* ============
   Ensure player node exists (no overwrite)
   ============ */
async function ensurePlayerDoc(uid) {
  const pRef = ref(db, `players/${uid}`);
  const snap = await get(pRef);
  if (!snap.exists()) {
    await set(pRef, {
      name: "Dragon Miner",
      coins: 0,
      taps: 0,
      level: 1,
      referrals: 0,
      createdAt: Date.now()
    });
  }
}

/* ============
   Telegram integration (optional)
   - if inside Telegram WebApp, grabs initDataUnsafe.user and stores a copy under players/<uid>/telegram
   - safe fallback: does nothing in normal browser
   ============ */
function attachTelegramInfoIfPresent(uid) {
  try {
    const tg = window.Telegram?.WebApp;
    if (!tg) {
      console.warn("⚠️ Telegram WebApp not available (running in browser).");
      return;
    }
    const u = tg.initDataUnsafe?.user ?? null;
    if (!u) {
      console.warn("⚠️ Telegram user info not provided inside WebApp.");
      return;
    }
    // store some visible info in DB (non-sensitive)
    const telegramData = {
      id: u.id,
      first_name: u.first_name || null,
      last_name: u.last_name || null,
      username: u.username || null
    };
    // write as update so we don't overwrite other fields
    update(ref(db, `players/${uid}/telegram`), telegramData).catch(e => {
      console.warn("Telegram data write failed:", e);
    });
    console.log("📱 Telegram user attached:", telegramData);
  } catch (e) {
    console.warn("Telegram attach error:", e);
  }
}

/* ============
   Safe check admin (reads admins/<uid>)
   rules must allow user to read own admins/$uid
   ============ */
async function safeCheckAdmin(uid) {
  try {
    const snap = await get(ref(db, `admins/${uid}`));
    return snap.exists() && snap.val() === true;
  } catch (e) {
    console.warn("safeCheckAdmin error:", e);
    return false;
  }
}

/* ============
   UI: show/hide admin section
   ============ */
function showAdmin(flag) {
  const adminEl = $("adminSection");
  if (adminEl) adminEl.style.display = flag ? "" : "none";
}

/* ============
   Player real-time listener (balance + taps)
   ============ */
function listenPlayer(uid) {
  if (listeners.player) off(listeners.player);
  const r = ref(db, `players/${uid}`);
  listeners.player = onValue(r, snap => {
    if (!snap.exists()) return;
    const data = snap.val() || {};
    safeText("balance", data.coins ?? 0);
    safeText("totalTaps", data.taps ?? 0);
    // local cache for instant UX on reload
    localStorage.setItem("coins", String(data.coins ?? 0));
    localStorage.setItem("taps", String(data.taps ?? 0));
  }, err => {
    console.error("player listener error:", err);
  });
}

/* ============
   Tap (use transaction to avoid race)
   ============ */
async function handleTap() {
  if (!currentUser) return toast("Please wait until login completes");
  const basePath = `players/${currentUser.uid}`;
  const coinsRef = ref(db, `${basePath}/coins`);
  const tapsRef  = ref(db, `${basePath}/taps`);
  try {
    await runTransaction(coinsRef, cur => (cur || 0) + 1);
    await runTransaction(tapsRef, cur => (cur || 0) + 1);
  } catch (e) {
    console.error("tap transaction failed:", e);
    toast("Tap failed: " + (e.message || e));
  }
}

/* ============
   Tasks: real-time listen (users see active tasks)
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
      if (!t) return;
      if (t.status !== "active") return;
      html += `
        <div class="task" style="background:#222;padding:10px;border-radius:8px;margin:8px 0">
          <div style="font-weight:700">${esc(t.name)}</div>
          <div style="opacity:.8">Reward: ${Number(t.reward)||0} 🪙</div>
          <div style="margin-top:8px"><button data-task-id="${id}" data-reward="${Number(t.reward)||0}" class="btn-complete">Complete</button></div>
        </div>
      `;
    });
    safeHTML(target, html || "<p style='color:#999'>No tasks</p>");

    // attach complete handlers
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
  }, err => {
    console.error("tasks listener error:", err);
  });
}

/* ============
   Complete task (transaction add coins)
   - Optional anti-cheat or one-time-per-user logic not included by default
   ============ */
async function completeTask(taskId, reward) {
  if (!currentUser) return toast("Login first");
  try {
    const coinsRef = ref(db, `players/${currentUser.uid}/coins`);
    await runTransaction(coinsRef, cur => (cur || 0) + (Number(reward) || 0));
    // Optionally record completion to prevent reuse (requires DB rules support)
    // await set(ref(db, `players/${currentUser.uid}/tasksCompleted/${taskId}`), true);
    toast(`Task completed: +${reward} 🪙`);
  } catch (e) {
    console.error("completeTask error:", e);
    toast("Could not complete task: " + (e.message || e));
  }
}

/* ============
   Admin actions (all guarded by isAdminUser check)
   ============ */
async function adminAddTask() {
  if (!isAdminUser) return toast("Admin only");
  const name = prompt("Task name:");
  const reward = Number(prompt("Reward (coins):"));
  if (!name || !Number.isFinite(reward) || reward <= 0) return toast("Invalid task");
  try {
    const newRef = push(ref(db, "globalCustomTasks"));
    await set(newRef, {
      name,
      reward,
      status: "active",
      createdAt: Date.now(),
      createdBy: currentUser.uid
    });
    toast("Task added");
  } catch (e) {
    console.error("adminAddTask error:", e);
    toast("Add task failed: " + (e.message || e));
  }
}

async function adminDeleteTask() {
  if (!isAdminUser) return toast("Admin only");
  const id = prompt("Task ID to delete:");
  if (!id) return;
  try {
    await remove(ref(db, `globalCustomTasks/${id}`));
    toast("Task deleted");
  } catch (e) {
    console.error("adminDeleteTask error:", e);
    toast("Delete failed: " + (e.message || e));
  }
}

async function adminEditTask() {
  if (!isAdminUser) return toast("Admin only");
  const id = prompt("Task ID to edit:");
  if (!id) return;
  try {
    const s = await get(ref(db, `globalCustomTasks/${id}`));
    if (!s.exists()) return toast("Task not found");
    const cur = s.val();
    const name = prompt("New name (leave blank keep)", cur.name || "");
    const rewardStr = prompt("New reward (leave blank keep)", String(cur.reward || ""));
    const status = prompt("New status (active/inactive/completed)", cur.status || "active");
    const upd = { updatedAt: Date.now() };
    if (name) upd.name = name;
    if (rewardStr && Number.isFinite(Number(rewardStr))) upd.reward = Number(rewardStr);
    if (status) upd.status = status;
    await update(ref(db, `globalCustomTasks/${id}`), upd);
    toast("Task updated");
  } catch (e) {
    console.error("adminEditTask error:", e);
    toast("Edit failed: " + (e.message || e));
  }
}

/* ============
   Leaderboard (real-time, avoids duplicates)
   ============ */
function startLeaderboardListener(type = "coins") {
  if (listeners.leaderboard) off(listeners.leaderboard);
  const r = ref(db, "players");
  listeners.leaderboard = onValue(r, snap => {
    const target = "leaderboardList";
    if (!snap.exists()) return safeHTML(target, "<p style='color:#999'>No players yet</p>");
    const data = snap.val() || {};
    const arr = Object.entries(data).map(([id, p]) => ({ id, ...p }));
    // filter duplicates by id (defensive)
    const seen = new Set();
    const uniq = [];
    for (const p of arr) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      uniq.push(p);
    }
    uniq.sort((a,b) => (b[type] || 0) - (a[type] || 0));
    const top = uniq.slice(0, 50);
    const html = top.map((p,i) => `
      <div style="padding:8px;border-bottom:1px solid #333;${p.id === currentUser?.uid ? 'background:#1f1f1f;color:#ffd700;' : ''}">
        #${i+1} — ${esc(p.name || "Player")} — ${type === "coins" ? (p.coins||0) + " 🪙" : (p.referrals||0) + " 👥"}
      </div>
    `).join("");
    safeHTML(target, html);
  }, err => { console.error("leaderboard listen error:", err); });
}

/* ============
   Read globalTaskSettings (admin only)
   ============ */
async function readGlobalTaskSettings() {
  try {
    const snap = await get(ref(db, "globalTaskSettings"));
    if (snap.exists()) console.log("GlobalTaskSettings:", snap.val());
  } catch (e) {
    console.error("readGlobalTaskSettings error:", e);
  }
}

/* ============
   Detach listeners
   ============ */
function detachAllListeners() {
  Object.values(listeners).forEach(l => { if (l) off(l); });
  listeners = { player: null, leaderboard: null, tasks: null };
}

/* ============
   UI binding + start
   ============ */
function bindUI() {
  const tapBtn = $("tapButton");
  if (tapBtn) tapBtn.addEventListener("click", handleTap);

  const coinsBtn = $("btn-leaderboard-coins");
  const refBtn = $("btn-leaderboard-referrals");
  if (coinsBtn) coinsBtn.addEventListener("click", () => startLeaderboardListener("coins"));
  if (refBtn) refBtn.addEventListener("click", () => startLeaderboardListener("referrals"));

  // admin section delegation
  const adminSec = $("adminSection");
  if (adminSec) {
    adminSec.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      switch(action) {
        case "addTask": return adminAddTask();
        case "delTask": return adminDeleteTask();
        case "editTask": return adminEditTask();
        case "addCoins": return adminAddCoins();
        case "resetPlayer": return adminResetPlayer();
        case "viewTasks": return adminViewTasks();
      }
    });
  }

  // restore cached UI quickly
  const cachedCoins = localStorage.getItem("coins");
  const cachedTaps = localStorage.getItem("taps");
  if (cachedCoins) safeText("balance", cachedCoins);
  if (cachedTaps) safeText("totalTaps", cachedTaps);
}

/* ============
   Extra admin helpers (example)
   ============ */
async function adminAddCoins() {
  if (!isAdminUser) return toast("Admin only");
  const uid = prompt("Target UID:");
  const amount = Number(prompt("Amount:"));
  if (!uid || !Number.isFinite(amount)) return toast("Invalid");
  const r = ref(db, `players/${uid}/coins`);
  await runTransaction(r, cur => (cur || 0) + amount);
  toast("Added");
}
async function adminResetPlayer() {
  if (!isAdminUser) return toast("Admin only");
  const uid = prompt("UID to reset:");
  if (!uid) return;
  await update(ref(db, `players/${uid}`), { coins: 0, taps: 0 });
  toast("Reset done");
}
async function adminViewTasks() {
  if (!isAdminUser) return toast("Admin only");
  const s = await get(ref(db, "globalCustomTasks"));
  if (!s.exists()) return safeHTML("customTasksList", "<p>No tasks</p>");
  const tasks = s.val() || {};
  let html = "";
  Object.entries(tasks).forEach(([id,t]) => {
    html += `<div><b>${esc(t.name)}</b> — ${Number(t.reward)||0} 🪙 — <small>${esc(t.status)}</small><br/><code>${id}</code></div><hr/>`;
  });
  safeHTML("customTasksList", html);
}

/* ============
   Start on DOM ready
   ============ */
document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  initializeFirebase();
});
/* ============
   Expose a few functions globally for HTML buttons if needed
   ============ */
window.completeTask = completeTask;
window.adminAddTask = adminAddTask;
window.adminDeleteTask = adminDeleteTask;
window.adminEditTask = adminEditTask;
window.tapCoin = handleTap;
window.showLeaderboard = startLeaderboardListener;
