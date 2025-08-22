import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
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
   Helpers
   ========================= */
const $ = (id) => document.getElementById(id);
const exists = (el) => !!el;

function safeHTML(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

function safeText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function toast(msg) {
  // oddiy alert o‘rniga istasangiz custom toast qo‘ying
  console.log("[INFO]", msg);
  alert(msg);
}

/* =========================
   Globals
   ========================= */
let app, database, auth, currentUser = null;
let leaderboardListener = null;
let playerDataListener = null;
let tasksListener = null;
let isAdminUser = false;

/* =========================
   Init
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  initializeFirebase();
  bindUI();
});

function bindUI() {
  // Tap
  const tapBtn = $("tapButton");
  if (tapBtn) tapBtn.addEventListener("click", tapCoin);

  // Leaderboard switchers
  const coinsBtn = $("btn-leaderboard-coins");
  const refBtn = $("btn-leaderboard-referrals");
  if (coinsBtn) coinsBtn.addEventListener("click", () => showLeaderboard("coins"));
  if (refBtn) refBtn.addEventListener("click", () => showLeaderboard("referrals"));

  // Admin action buttons (delegation)
  const adminSection = $("adminSection");
  if (adminSection) {
    adminSection.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const action = btn.dataset.action;
      try {
        switch (action) {
          case "addCoins":      await adminAddCoins(); break;
          case "resetPlayer":   await adminResetPlayer(); break;
          case "addTask":       await adminAddTask(); break;
          case "removeTask":    await adminRemoveTask(); break;
          case "editTask":      await adminEditTask(); break;
          case "viewTasks":     await renderTasks("admin"); break;
          default: break;
        }
      } catch (err) {
        console.error(err);
        toast("Admin action error: " + (err?.message || err));
      }
    });
  }
}

/* =========================
   Firebase initialize & auth
   ========================= */
function initializeFirebase() {
  app = initializeApp(firebaseConfig);
  database = getDatabase(app);
  auth = getAuth(app);

  signInAnonymously(auth).catch(e => toast("Login error: " + e.message));

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUser = null;
      clearAllListeners();
      return;
    }
    currentUser = user;

    // create player if not exists
    await ensurePlayerDoc(user.uid);

    // check admin
    isAdminUser = await checkAdminStatus(user.uid);
    const adminTabBtn = document.querySelector("#adminSection") && document.querySelector("#adminTab");
    if (adminTabBtn && isAdminUser) adminTabBtn.style.display = "inline-block";
    if (isAdminUser) {
      // views: only render when asked; but we can prefetch
      // renderTasks("admin"); // faqat "View Tasks" bosilganda render qilamiz
    }

    // live player data -> balance/taps UI (agar HTML’da bo‘lsa)
    listenPlayer(user.uid);

    // user tasks (active) va default leaderboard
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
   Player live data
   ========================= */
function listenPlayer(uid) {
  if (playerDataListener) off(playerDataListener);
  const playerRef = ref(database, "players/" + uid);
  playerDataListener = onValue(playerRef, (snap) => {
    if (!snap.exists()) return;
    const data = snap.val();
    // Bu elementlar HTML’da bo‘lmasa — shunchaki skip
    safeText("balance", (data.coins || 0).toString());
    safeText("totalTaps", (data.taps || 0).toString());
  });
}

/* =========================
   Tap
   ========================= */
async function tapCoin() {
  if (!currentUser) return toast("Wait for login");
  try {
    const pRef = ref(database, "players/" + currentUser.uid);
    const snap = await get(pRef);
    if (!snap.exists()) return;

    const p = snap.val();
    const newCoins = (p.coins || 0) + 1;
    const newTaps  = (p.taps  || 0) + 1;

    await update(pRef, { coins: newCoins, taps: newTaps });
  } catch (e) {
    console.error(e);
    toast("Tap error: " + (e?.message || e));
  }
}

/* =========================
   Tasks (User + Admin)
   ========================= */
async function renderTasks(mode = "user") {
  const containerId = "customTasksList";
  const listEl = $(containerId);
  if (!listEl) return; // sahifada bo‘lmasa — chiqib ketamiz

  // Eski listenerni faqat "user" rendering uchun saqlaymiz
  if (tasksListener && mode === "user") off(tasksListener);

  const tRef = ref(database, "globalCustomTasks");

  const handler = (snap) => {
    if (!exists(listEl)) return; // DOM bo‘lmasa set qilmaymiz
    if (!snap.exists()) {
      safeHTML(containerId, "<p style='color:#aaa'>No tasks</p>");
      return;
    }
    const tasks = snap.val();

    // Admin va User uchun turlicha render
    let html = "";
    Object.keys(tasks).forEach((id) => {
      const t = tasks[id];
      if (mode === "user") {
        if (t.status !== "active") return;
        html += `
          <div class="task" style="background:#222;margin:10px;padding:10px;border-radius:8px;">
            <p><strong>${escapeHTML(t.name)}</strong> – Reward: ${t.reward} 🪙</p>
            <button data-complete="${id}" style="padding:8px 12px;border-radius:6px;border:none;background:#444;color:#fff;cursor:pointer;">Complete</button>
          </div>
        `;
      } else { // admin
        html += `
          <div class="task-admin" style="background:#1f1f1f;margin:10px;padding:10px;border-radius:8px;">
            <p>
              <strong>${escapeHTML(t.name)}</strong> – Reward: ${t.reward} 🪙
              <br/>Status: <em>${t.status}</em>
              <br/>ID: <code>${id}</code>
            </p>
            <button data-admin-edit="${id}" style="padding:6px 10px;border-radius:6px;border:none;background:#555;color:#fff;cursor:pointer;margin-right:6px;">Edit</button>
            <button data-admin-delete="${id}" style="padding:6px 10px;border-radius:6px;border:none;background:#8b0000;color:#fff;cursor:pointer;">Delete</button>
          </div>
        `;
      }
    });

    if (!html) html = "<p style='color:#aaa'>No tasks to show</p>";
    safeHTML(containerId, html);
  };

  // Real-time yoki bir martalik yuklash
  if (mode === "user") {
    tasksListener = onValue(tRef, handler);
  } else {
    const snap = await get(tRef);
    handler(snap);
  }

  // Delegation: complete / admin edit/delete tugmalari
  listEl.onclick = async (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;

    const completeId = btn.dataset.complete;
    const editId = btn.dataset.adminEdit;
    const delId = btn.dataset.adminDelete;

    try {
      if (completeId) {
        // Oddiy client-side complete: anti-cheat yo‘q (rules bilan cheklangan)
        await userCompleteTask(completeId);
      } else if (editId && isAdminUser) {
        await adminEditTaskInline(editId);
        await renderTasks("admin");
      } else if (delId && isAdminUser) {
        await adminRemoveTaskById(delId);
        await renderTasks("admin");
      }
    } catch (err) {
      console.error(err);
      toast("Task action error: " + (err?.message || err));
    }
  };
}

async function userCompleteTask(taskId) {
  if (!currentUser) return toast("Login first");
  // Task reward ni o‘qiymiz
  const tSnap = await get(ref(database, "globalCustomTasks/" + taskId));
  if (!tSnap.exists()) return toast("Task not found");
  const t = tSnap.val();
  if (t.status !== "active") return toast("Task inactive");

  // Coins qo‘shamiz
  const pRef = ref(database, "players/" + currentUser.uid);
  const pSnap = await get(pRef);
  if (!pSnap.exists()) return;
  const p = pSnap.val();
  await update(pRef, { coins: (p.coins || 0) + (t.reward || 0) });

  toast(`Task completed! +${t.reward} 🪙`);
}

/* =========================
   Admin actions (prompt-based)
   ========================= */
function ensureAdmin() {
  if (!isAdminUser) throw new Error("Admin rights required");
}

async function adminAddCoins() {
  ensureAdmin();
  const uid = prompt("Target user UID:");
  if (!uid) return;
  const amount = parseInt(prompt("Amount to add:"), 10);
  if (!Number.isFinite(amount) || amount <= 0) return toast("Invalid amount");

  const pRef = ref(database, "players/" + uid);
  const pSnap = await get(pRef);
  if (!pSnap.exists()) return toast("User not found");

  const p = pSnap.val();
  await update(pRef, { coins: (p.coins || 0) + amount });
  toast(`+${amount} coins added to ${uid}`);
}

async function adminResetPlayer() {
  ensureAdmin();
  const uid = prompt("Target user UID to reset:");
  if (!uid) return;

  const pRef = ref(database, "players/" + uid);
  const pSnap = await get(pRef);
  if (!pSnap.exists()) return toast("User not found");

  await update(pRef, { coins: 0, taps: 0 });
  toast(`Player ${uid} reset to 0`);
}

async function adminAddTask() {
  ensureAdmin();
  const name = prompt("Task name:");
  if (!name) return;
  const reward = parseInt(prompt("Reward (coins):"), 10);
  if (!Number.isFinite(reward) || reward <= 0) return toast("Invalid reward");

  const newRef = push(ref(database, "globalCustomTasks"));
  await set(newRef, {
    name,
    reward,
    status: "active",
    createdAt: Date.now(),
    createdBy: currentUser.uid
  });

  toast("Task added");
}

async function adminRemoveTask() {
  ensureAdmin();
  const id = prompt("Task ID to delete:");
  if (!id) return;
  await adminRemoveTaskById(id);
  toast("Task deleted");
}

async function adminRemoveTaskById(id) {
  ensureAdmin();
  await remove(ref(database, "globalCustomTasks/" + id));
}

async function adminEditTask() {
  ensureAdmin();
  const id = prompt("Task ID to edit:");
  if (!id) return;

  const tRef = ref(database, "globalCustomTasks/" + id);
  const tSnap = await get(tRef);
  if (!tSnap.exists()) return toast("Task not found");
  const t = tSnap.val();

  const name = prompt("New name (leave empty to keep):", t.name || "");
  const rewardStr = prompt("New reward (leave empty to keep):", (t.reward || 0).toString());
  const status = prompt("New status: active/inactive/completed (leave empty to keep):", t.status || "active");

  const upd = {};
  if (name && name !== t.name) upd.name = name;
  if (rewardStr && +rewardStr !== t.reward) upd.reward = +rewardStr;
  if (status && status !== t.status) upd.status = status;

  if (Object.keys(upd).length === 0) return toast("No changes");
  upd.updatedAt = Date.now();

  await update(tRef, upd);
  toast("Task updated");
}

// inline editor from admin list
async function adminEditTaskInline(id) {
  ensureAdmin();
  const tRef = ref(database, "globalCustomTasks/" + id);
  const tSnap = await get(tRef);
  if (!tSnap.exists()) throw new Error("Task not found");
  const t = tSnap.val();
  const name = prompt("Task name:", t.name || "");
  const reward = parseInt(prompt("Reward:", (t.reward || 0).toString()), 10);
  const status = prompt("Status (active/inactive/completed):", t.status || "active");

  if (!name || !Number.isFinite(reward) || reward <= 0 || !status) throw new Error("Invalid fields");
  await update(tRef, { name, reward, status, updatedAt: Date.now() });
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
      safeHTML("leaderboardList", "<p style='color:#aaa'>No data yet</p>");
      return;
    }
    const data = snap.val();
    let players = Object.keys(data).map(id => ({ id, ...data[id] }));

    // duplicate guard (UID bo‘yicha)
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
   Utils
   ========================= */
function escapeHTML(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Expose nothing globally — barcha tugmalar event listener orqali ulanadi.
