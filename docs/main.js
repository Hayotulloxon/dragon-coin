import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getDatabase, ref, set, get, push, update, remove, onValue, off
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

/* =========================
   Firebase Config
   ========================= */
const firebaseConfig = {
  apiKey: "AIzaSyDShZAo9lg-SxpQViCT27uXVni1UK7TGYU",
  authDomain: "dragon-92897.firebaseapp.com",
  databaseURL: "https://dragon-92897-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dragon-92897",
  storageBucket: "dragon-92897.firebasestorage.app",
  messagingSenderId: "40351345340",
  appId: "1:40351345340:web:632388a9b45d3c7905feb9"
};

/* =========================
   Global variables
   ========================= */
let app, database, auth, currentUser = null;
let leaderboardListener = null;
let playerDataListener = null;
let tasksListener = null;
let isAdminUser = false;

/* =========================
   Helpers
   ========================= */
const $ = (id) => document.getElementById(id);
function safeHTML(id, html) { const el = $(id); if (el) el.innerHTML = html; }
function safeText(id, text) { const el = $(id); if (el) el.textContent = text; }
function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function toast(msg) { alert(msg); }

/* =========================
   Initialize Firebase
   ========================= */
function initializeFirebase() {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    console.log("✅ Firebase initialized");
  } else {
    app = getApps()[0];
    console.log("ℹ️ Firebase already initialized");
  }

  database = getDatabase(app);
  auth = getAuth(app);

  signInAnonymously(auth)
    .then(() => console.log("✅ Anonymous login successful"))
    .catch((e) => console.error("Login error:", e));

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUser = null;
      clearAllListeners();
      return;
    }

    currentUser = user;
    await ensurePlayerDoc(user.uid);

    // Admin tekshiruv
    isAdminUser = await checkAdminStatus(user.uid);
    const adminTabBtn = document.querySelector("#adminTab");
    if (adminTabBtn && isAdminUser) adminTabBtn.style.display = "inline-block";

    listenPlayer(user.uid);
    renderTasks("user");
    showLeaderboard("coins");
  });
}

async function ensurePlayerDoc(uid) {
  const r = ref(database, "players/" + uid);
  const snap = await get(r);
  if (!snap.exists()) {
    await set(r, {
      name: "Dragon Miner",
      coins: 0,
      taps: 0,
      level: 1,
      referrals: 0,
      createdAt: Date.now()
    });
  }
}

async function checkAdminStatus(uid) {
  try {
    const adminRef = ref(database, `admins/${uid}`);
    const snap = await get(adminRef);
    return snap.exists() && snap.val() === true;
  } catch {
    return false;
  }
}

/* =========================
   Player data listener
   ========================= */
function listenPlayer(uid) {
  if (playerDataListener) off(playerDataListener);
  const playerRef = ref(database, "players/" + uid);
  playerDataListener = onValue(playerRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.val();
    safeText("balance", (data.coins || 0).toString());
    safeText("totalTaps", (data.taps || 0).toString());
  });
}

/* =========================
   Tap function
   ========================= */
async function tapCoin() {
  if (!currentUser) return toast("Please wait...");
  try {
    const pRef = ref(database, "players/" + currentUser.uid);
    const snap = await get(pRef);
    if (!snap.exists()) return;
    const p = snap.val();
    await update(pRef, {
      coins: (p.coins || 0) + 1,
      taps: (p.taps || 0) + 1
    });
  } catch (e) {
    console.error(e);
    toast("Tap error: " + (e?.message || e));
  }
}

/* =========================
   Render tasks (User & Admin)
   ========================= */
async function renderTasks(mode = "user") {
  const containerId = "customTasksList";
  const listEl = $(containerId);
  if (!listEl) return;

  if (tasksListener && mode === "user") off(tasksListener);
  const tRef = ref(database, "globalCustomTasks");

  const handler = (snap) => {
    if (!listEl) return;
    if (!snap.exists()) {
      safeHTML(containerId, "<p style='color:#aaa'>No tasks</p>");
      return;
    }
    const tasks = snap.val();
    let html = "";
    Object.keys(tasks).forEach((id) => {
      const t = tasks[id];
      if (mode === "user") {
        if (t.status !== "active") return;
        html += `
          <div class="task" style="background:#222;margin:10px;padding:10px;border-radius:8px;">
            <p><strong>${escapeHTML(t.name)}</strong> – Reward: ${t.reward} 🪙</p>
            <button onclick="completeTask('${id}', ${t.reward})">Complete</button>
          </div>
        `;
      } else {
        html += `
          <div class="task-admin" style="background:#1f1f1f;margin:10px;padding:10px;border-radius:8px;">
            <p>
              <strong>${escapeHTML(t.name)}</strong> – Reward: ${t.reward} 🪙
              <br/>Status: ${t.status}
            </p>
            <button onclick="deleteTask('${id}')">Delete</button>
          </div>
        `;
      }
    });
    if (!html) html = "<p>No tasks available</p>";
    safeHTML(containerId, html);
  };

  if (mode === "user") {
    tasksListener = onValue(tRef, handler);
  } else {
    const snap = await get(tRef);
    handler(snap);
  }
}

async function completeTask(taskId, reward) {
  if (!currentUser) return toast("Login first");
  const playerRef = ref(database, "players/" + currentUser.uid);
  const snap = await get(playerRef);
  if (!snap.exists()) return;
  const p = snap.val();
  await update(playerRef, { coins: (p.coins || 0) + reward });
  toast(`Task completed! +${reward} coins`);
}

/* =========================
   Admin functions
   ========================= */
async function addTask() {
  if (!isAdminUser) return toast("Admin only");
  const name = prompt("Task name:");
  const reward = parseInt(prompt("Reward (coins):"), 10);
  if (!name || !reward) return toast("Invalid input");
  const newTaskRef = push(ref(database, "globalCustomTasks"));
  await set(newTaskRef, {
    name,
    reward,
    status: "active",
    createdAt: Date.now(),
    createdBy: currentUser.uid
  });
  toast("Task added");
}

async function deleteTask(taskId) {
  if (!isAdminUser) return toast("Admin only");
  await remove(ref(database, "globalCustomTasks/" + taskId));
  toast("Task deleted");
}

/* =========================
   Leaderboard
   ========================= */
function showLeaderboard(type = "coins") {
  const list = $("leaderboardList");
  if (!list) return;
  if (leaderboardListener) off(leaderboardListener);

  const playersRef = ref(database, "players");
  leaderboardListener = onValue(playersRef, (snap) => {
    if (!snap.exists()) {
      safeHTML("leaderboardList", "<p>No data yet</p>");
      return;
    }
    const data = snap.val();
    let players = Object.keys(data).map(id => ({ id, ...data[id] }));

    const seen = new Set();
    players = players.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    players.sort((a, b) => (b[type] || 0) - (a[type] || 0));
    const top = players.slice(0, 50);

    const html = top.map((p, i) => `
      <div style="padding:10px;border-bottom:1px solid #333;${p.id === currentUser?.uid ? 'background:#1f1f1f;color:#ffd700;' : ''}">
        #${i + 1} — ${escapeHTML(p.name || "Player")} — ${type === "coins" ? (p.coins || 0) + " 🪙" : (p.referrals || 0) + " 👥"}
      </div>
    `).join("");

    safeHTML("leaderboardList", html);
  });
}

/* =========================
   Cleanup
   ========================= */
function clearAllListeners() {
  if (leaderboardListener) off(leaderboardListener);
  if (playerDataListener) off(playerDataListener);
  if (tasksListener) off(tasksListener);
  leaderboardListener = null;
  playerDataListener = null;
  tasksListener = null;
}

/* =========================
   Expose functions globally
   ========================= */
window.tapCoin = tapCoin;
window.showLeaderboard = showLeaderboard;
window.addTask = addTask;
window.deleteTask = deleteTask;
window.completeTask = completeTask;

/* =========================
   Start after DOM ready
   ========================= */
document.addEventListener("DOMContentLoaded", initializeFirebase);
