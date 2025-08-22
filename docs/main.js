import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getDatabase, ref, set, get, push, update, remove, onValue, off, runTransaction, child
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

/* -----------------------------
   Firebase Config
------------------------------ */
const firebaseConfig = {
  apiKey: "AIzaSyDShZAo9lg-SxpQViCT27uXVni1UK7TGYU",
  authDomain: "dragon-92897.firebaseapp.com",
  databaseURL: "https://dragon-92897-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dragon-92897",
  storageBucket: "dragon-92897.firebasestorage.app",
  messagingSenderId: "40351345340",
  appId: "1:40351345340:web:632388a9b45d3c7905feb9"
};

/* -----------------------------
   Globals
------------------------------ */
let app, db, auth, currentUser = null;
let isAdminUser = false;
let listeners = {
  player: null,
  leaderboard: null,
  tasks: null
};

/* -----------------------------
   Small helpers (null-safe)
------------------------------ */
const $ = (id) => document.getElementById(id);
const setText = (id, val) => { const el = $(id); if (el) el.textContent = String(val); };
const setHTML = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };
const show = (id, on) => { const el = $(id); if (el) el.style.display = on ? "" : "none"; };
const esc = (s) => String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const toast = (msg) => alert(msg);

/* -----------------------------
   Init (with persistence)
------------------------------ */
function initFirebase() {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);

  setPersistence(auth, browserLocalPersistence)
    .then(() => signInAnonymously(auth))
    .catch(err => console.error("Auth error:", err));

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentUser = null;
      detachAll();
      return;
    }
    currentUser = user;

    // Player doc create-if-missing
    await ensurePlayerDoc(user.uid);

    // Admin check (rules: admins/$uid .read faqat o‘zi)
    isAdminUser = await safeIsAdmin(user.uid);
    show("adminSection", isAdminUser);

    // Live listeners
    listenPlayer(user.uid);
    listenLeaderboard("coins");
    listenTasksForUser();

    // Admin bo‘lsa, globalTaskSettings’ni o‘qishi mumkin
    if (isAdminUser) readGlobalTaskSettingsOnce();
  });
}

/* -----------------------------
   Player doc ensure
------------------------------ */
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
      createdAt: Date.now()
    });
  }
}

/* -----------------------------
   Admin check (no permission error)
------------------------------ */
async function safeIsAdmin(uid) {
  try {
    const s = await get(ref(db, `admins/${uid}`));
    return s.exists() && s.val() === true;
  } catch (e) {
    console.warn("Admin check error (treated as false):", e?.message || e);
    return false;
  }
}

/* -----------------------------
   Live: Player (balance/taps)
------------------------------ */
function listenPlayer(uid) {
  if (listeners.player) off(listeners.player);
  const r = ref(db, `players/${uid}`);
  listeners.player = onValue(r, (snap) => {
    if (!snap.exists()) return;
    const p = snap.val() || {};
    // UI elementlari bo‘lmasa ham xato bermaydi
    setText("balance", p.coins ?? 0);
    setText("totalTaps", p.taps ?? 0);
    // tezkor UX
    localStorage.setItem("coins", String(p.coins ?? 0));
    localStorage.setItem("taps", String(p.taps ?? 0));
  });
}

/* -----------------------------
   Tap (transaction, lost update yo‘q)
------------------------------ */
async function tap() {
  if (!currentUser) return toast("Please wait...");
  const coinsRef = ref(db, `players/${currentUser.uid}/coins`);
  const tapsRef  = ref(db, `players/${currentUser.uid}/taps`);
  await runTransaction(coinsRef, (cur) => (cur || 0) + 1);
  await runTransaction(tapsRef,  (cur) => (cur || 0) + 1);
}

/* -----------------------------
   Tasks (user taraf)
------------------------------ */
function listenTasksForUser() {
  if (listeners.tasks) off(listeners.tasks);
  const r = ref(db, "globalCustomTasks");
  listeners.tasks = onValue(r, (snap) => {
    const elId = "customTasksList";
    if (!snap.exists()) return setHTML(elId, "<p style='color:#999'>No tasks</p>");
    const tasks = snap.val() || {};
    let html = "";
    Object.entries(tasks).forEach(([id, t]) => {
      if (!t || t.status !== "active") return;
      html += `
        <div class="task" style="background:#222;border-radius:10px;padding:12px;margin:10px 0;text-align:left;">
          <div style="font-weight:700">${esc(t.name)}</div>
          <div style="opacity:.8;margin:6px 0">Reward: ${Number(t.reward)||0} 🪙</div>
          <button data-task-id="${id}" data-reward="${Number(t.reward)||0}" class="btn-complete">Complete</button>
        </div>
      `;
    });
    setHTML(elId, html || "<p style='color:#999'>No tasks</p>");
    // Delegatsiya: complete bosish
    const wrap = $(elId);
    if (wrap) {
      wrap.querySelectorAll(".btn-complete").forEach(btn => {
        btn.onclick = async () => {
          const taskId = btn.getAttribute("data-task-id");
          const reward = Number(btn.getAttribute("data-reward")) || 0;
          await completeTask(taskId, reward);
        };
      });
    }
  });
}

async function completeTask(taskId, reward) {
  if (!currentUser) return toast("Login first");
  // (ixtiyoriy) takror taqdirlashni cheklashni xohlasangiz, quyidagidan foydalaning:
  // const doneRef = ref(db, `players/${currentUser.uid}/tasksCompleted/${taskId}`);
  // const doneSnap = await get(doneRef);
  // if (doneSnap.exists()) return toast("Already claimed");

  const coinsRef = ref(db, `players/${currentUser.uid}/coins`);
  await runTransaction(coinsRef, (cur) => (cur || 0) + (Number(reward) || 0));

  // await set(doneRef, true); // agar cheklamoqchi bo‘lsangiz, rules moslashini unutmang
  toast(`+${reward} 🪙`);
}

/* -----------------------------
   Admin: CRUD
------------------------------ */
async function adminAddCoins() {
  if (!isAdminUser) return toast("Admin only");
  const uid = prompt("Target UID:");
  const amount = Number(prompt("Add coins (number):"));
  if (!uid || !Number.isFinite(amount)) return toast("Invalid input");
  const coinsRef = ref(db, `players/${uid}/coins`);
  await runTransaction(coinsRef, (cur) => (cur || 0) + amount);
  toast("Coins added");
}

async function adminResetPlayer() {
  if (!isAdminUser) return toast("Admin only");
  const uid = prompt("Target UID to reset:");
  if (!uid) return;
  await update(ref(db, `players/${uid}`), { coins: 0, taps: 0, level: 1, referrals: 0 });
  toast("Player reset");
}

async function adminAddTask() {
  if (!isAdminUser) return toast("Admin only");
  const name = prompt("Task name:");
  const reward = Number(prompt("Reward (coins):"));
  if (!name || !Number.isFinite(reward) || reward <= 0) return toast("Invalid task");
  const tRef = push(ref(db, "globalCustomTasks"));
  await set(tRef, {
    name,
    reward,
    status: "active",
    createdAt: Date.now(),
    createdBy: currentUser.uid
  });
  toast("Task added");
}

async function adminRemoveTask() {
  if (!isAdminUser) return toast("Admin only");
  const taskId = prompt("Task ID to remove:");
  if (!taskId) return;
  await remove(ref(db, `globalCustomTasks/${taskId}`));
  toast("Task removed");
}

async function adminEditTask() {
  if (!isAdminUser) return toast("Admin only");
  const taskId = prompt("Task ID to edit:");
  if (!taskId) return;
  const snap = await get(ref(db, `globalCustomTasks/${taskId}`));
  if (!snap.exists()) return toast("Task not found");

  const cur = snap.val();
  const name = prompt("New name (blank = keep)", cur.name || "");
  const rewardStr = prompt("New reward (blank = keep)", String(cur.reward || ""));
  const status = prompt("Status (active/inactive/completed, blank = keep)", cur.status || "active");

  const patch = {};
  if (name) patch.name = name;
  if (rewardStr && Number.isFinite(Number(rewardStr))) patch.reward = Number(rewardStr);
  if (status && ["active","inactive","completed"].includes(status)) patch.status = status;
  patch.updatedAt = Date.now();

  if (Object.keys(patch).length === 1 && patch.updatedAt) return toast("Nothing changed");
  await update(ref(db, `globalCustomTasks/${taskId}`), patch);
  toast("Task updated");
}

async function adminViewTasks() {
  if (!isAdminUser) return toast("Admin only");
  // Bitta marotaba o‘qib, admin ko‘rinishida chiqaramiz
  const s = await get(ref(db, "globalCustomTasks"));
  if (!s.exists()) return setHTML("customTasksList", "<p style='color:#999'>No tasks</p>");
  const tasks = s.val() || {};
  let html = "";
  Object.entries(tasks).forEach(([id,t])=>{
    html += `
      <div style="background:#1c1c1c;border-radius:10px;padding:12px;margin:10px 0;text-align:left;">
        <div><b>${esc(t?.name)}</b> — ${Number(t?.reward)||0} 🪙</div>
        <div style="opacity:.8">Status: ${esc(t?.status)}</div>
        <div style="margin-top:8px;">
          <button data-admin-edit="${id}">Edit</button>
          <button data-admin-remove="${id}">Remove</button>
        </div>
      </div>
    `;
  });
  setHTML("customTasksList", html);

  const wrap = $("customTasksList");
  if (wrap) {
    wrap.querySelectorAll("[data-admin-edit]").forEach(b=>{
      b.onclick = async () => { 
        const id = b.getAttribute("data-admin-edit");
        await adminEditTaskDirect(id);
      };
    });
    wrap.querySelectorAll("[data-admin-remove]").forEach(b=>{
      b.onclick = async () => {
        const id = b.getAttribute("data-admin-remove");
        await remove(ref(db, `globalCustomTasks/${id}`));
        toast("Task removed");
        adminViewTasks();
      };
    });
  }
}
async function adminEditTaskDirect(taskId){
  if (!isAdminUser) return toast("Admin only");
  const snap = await get(ref(db, `globalCustomTasks/${taskId}`));
  if (!snap.exists()) return toast("Task not found");
  const cur = snap.val();
  const name = prompt("New name (blank = keep)", cur.name || "");
  const rewardStr = prompt("New reward (blank = keep)", String(cur.reward || ""));
  const status = prompt("Status (active/inactive/completed, blank = keep)", cur.status || "active");

  const patch = {};
  if (name) patch.name = name;
  if (rewardStr && Number.isFinite(Number(rewardStr))) patch.reward = Number(rewardStr);
  if (status && ["active","inactive","completed"].includes(status)) patch.status = status;
  patch.updatedAt = Date.now();

  await update(ref(db, `globalCustomTasks/${taskId}`), patch);
  toast("Task updated");
}

/* -----------------------------
   Leaderboard (no duplicates)
------------------------------ */
function listenLeaderboard(type = "coins") {
  if (listeners.leaderboard) off(listeners.leaderboard);
  const r = ref(db, "players");
  listeners.leaderboard = onValue(r, (snap) => {
    if (!snap.exists()) return setHTML("leaderboardList", "<p style='color:#999'>No data</p>");
    const data = snap.val() || {};
    const arr = Object.entries(data).map(([id, p]) => ({ id, ...p }));

    // UID bo‘yicha dublikatni tozalash
    const seen = new Set();
    const uniq = [];
    for (const p of arr) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      uniq.push(p);
    }

    uniq.sort((a,b)=>((b?.[type]||0)-(a?.[type]||0)));
    const top = uniq.slice(0, 50);

    const html = top.map((p, i) => `
      <div style="padding:10px;border-bottom:1px solid #333;${p.id===currentUser?.uid ? 'background:#1f1f1f;color:#ffd700;' : ''}">
        #${i+1} — ${esc(p.name || "Player")} — ${type === "coins" ? (p.coins||0)+" 🪙" : (p.referrals||0)+" 👥"}
      </div>
    `).join("");
    setHTML("leaderboardList", html || "<p style='color:#999'>No data</p>");
  });
}

/* -----------------------------
   Optional (admin only)
------------------------------ */
async function readGlobalTaskSettingsOnce(){
  try{
    const s = await get(ref(db, "globalTaskSettings"));
    if (s.exists()) console.log("Global settings:", s.val());
  }catch(e){
    // Oddiy user bu yerga umuman bormaydi; admin bo‘lsa ruxsat bor
    console.warn("Global settings read error:", e?.message || e);
  }
}

/* -----------------------------
   Detach all listeners
------------------------------ */
function detachAll() {
  Object.values(listeners).forEach(l => l && off(l));
  listeners = { player: null, leaderboard: null, tasks: null };
}

/* -----------------------------
   Bind UI
------------------------------ */
function bindUI() {
  // Tap
  const tapBtn = $("tapButton");
  if (tapBtn) tapBtn.addEventListener("click", tap);

  // Leaderboard toggles
  const btnCoins = $("btn-leaderboard-coins");
  const btnRefs  = $("btn-leaderboard-referrals");
  if (btnCoins) btnCoins.addEventListener("click", () => listenLeaderboard("coins"));
  if (btnRefs)  btnRefs.addEventListener("click",  () => listenLeaderboard("referrals"));

  // Admin actions
  const admin = $("adminSection");
  if (admin) {
    admin.addEventListener("click", async (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      const action = target.getAttribute("data-action");
      if (!action) return;
      try {
        if (action === "addCoins")      await adminAddCoins();
        if (action === "resetPlayer")   await adminResetPlayer();
        if (action === "addTask")       await adminAddTask();
        if (action === "removeTask")    await adminRemoveTask();
        if (action === "editTask")      await adminEditTask();
        if (action === "viewTasks")     await adminViewTasks();
      } catch (err) {
        console.error(err);
        toast(err?.message || String(err));
      }
    });
  }

  // Tezkor UX: local cache
  const cachedCoins = localStorage.getItem("coins");
  const cachedTaps  = localStorage.getItem("taps");
  if (cachedCoins) setText("balance", cachedCoins);
  if (cachedTaps)  setText("totalTaps", cachedTaps);
}

/* -----------------------------
   Start
------------------------------ */
document.addEventListener("DOMContentLoaded", () => {
  bindUI();
  initFirebase();
});
