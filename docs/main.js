import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getDatabase, ref, set, get, push, update, remove, onValue, off, runTransaction
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

/* ====== YOUR FIREBASE CONFIG (o'zingizniki bilan almashtiring) ====== */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxxxxxxxx"
};

/* ====== Globals ====== */
let app, db, auth, currentUser = null;
let isAdminUser = false;
let listeners = { player:null, tasks:null, leaderboard:null };

/* ====== Helpers ====== */
const $ = (id) => document.getElementById(id);
const setText = (id, v) => { const el = $(id); if (el) el.textContent = String(v); };
const setHTML = (id, h) => { const el = $(id); if (el) el.innerHTML = h; };
const show = (id, on) => { const el = $(id); if (el) el.style.display = on ? "" : "none"; };
const esc = (s) => String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const toast = (m) => alert(m);

/* ====== Init ====== */
function initFirebase() {
  app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  db = getDatabase(app);
  auth = getAuth(app);

  setPersistence(auth, browserLocalPersistence)
    .then(() => signInAnonymously(auth))
    .catch(e => console.error("Auth error:", e));

  onAuthStateChanged(auth, async (user) => {
    if (!user) { currentUser = null; detachAll(); return; }
    currentUser = user;

    await ensurePlayerDoc(user.uid);
    isAdminUser = await safeIsAdmin(user.uid);
    show("adminSection", isAdminUser);

    listenPlayer(user.uid);
    listenTasksForUser();
    listenLeaderboard("coins");

    if (isAdminUser) readGlobalTaskSettingsOnce();
  });
}

async function ensurePlayerDoc(uid){
  const r = ref(db, `players/${uid}`);
  const s = await get(r);
  if (!s.exists()) {
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

async function safeIsAdmin(uid){
  try {
    const s = await get(ref(db, `admins/${uid}`));
    return s.exists() && s.val() === true;
  } catch {
    return false;
  }
}

/* ====== Live player ====== */
function listenPlayer(uid){
  if (listeners.player) off(listeners.player);
  const r = ref(db, `players/${uid}`);
  listeners.player = onValue(r, (snap)=>{
    if (!snap.exists()) return;
    const p = snap.val() || {};
    setText("balance", p.coins ?? 0);
    setText("totalTaps", p.taps ?? 0);
    localStorage.setItem("coins", String(p.coins ?? 0));
    localStorage.setItem("taps", String(p.taps ?? 0));
  });
}

/* ====== Tap (transaction) ====== */
async function tap(){
  if (!currentUser) return toast("Please wait...");
  const coinsRef = ref(db, `players/${currentUser.uid}/coins`);
  const tapsRef  = ref(db, `players/${currentUser.uid}/taps`);
  await runTransaction(coinsRef, (cur)=> (cur||0)+1 );
  await runTransaction(tapsRef,  (cur)=> (cur||0)+1 );
}

/* ====== Tasks (Firebase’dan real-time) ====== */
function listenTasksForUser(){
  if (listeners.tasks) off(listeners.tasks);
  const r = ref(db, "globalCustomTasks");
  listeners.tasks = onValue(r, (snap)=>{
    if (!snap.exists()) return setHTML("customTasksList","<p style='color:#999'>No tasks</p>");
    const tasks = snap.val() || {};
    let html = "";
    Object.entries(tasks).forEach(([id,t])=>{
      if (!t || t.status !== "active") return;
      html += `
        <div class="task">
          <div><b>${esc(t.name)}</b></div>
          <div style="opacity:.8;margin:6px 0">Reward: ${Number(t.reward)||0} 🪙</div>
          <button class="btn-complete" data-id="${id}" data-reward="${Number(t.reward)||0}">Complete</button>
        </div>
      `;
    });
    setHTML("customTasksList", html || "<p style='color:#999'>No tasks</p>");
    const wrap = $("customTasksList");
    if (wrap) {
      wrap.querySelectorAll(".btn-complete").forEach(btn=>{
        btn.onclick = async ()=>{
          const taskId = btn.getAttribute("data-id");
          const reward = Number(btn.getAttribute("data-reward"))||0;
          await completeTask(taskId, reward);
        };
      });
    }
  });
}

/* (ixtiyoriy) takror mukofotni oldini olish uchun rules bilan tasksCompleted’ni yoqing */
async function completeTask(taskId, reward){
  if (!currentUser) return toast("Login first");

  // Agar bir marta berish kerak bo‘lsa:
  // const doneRef = ref(db, `players/${currentUser.uid}/tasksCompleted/${taskId}`);
  // const doneSnap = await get(doneRef);
  // if (doneSnap.exists()) return toast("Already completed");

  const coinsRef = ref(db, `players/${currentUser.uid}/coins`);
  await runTransaction(coinsRef, (cur)=> (cur||0) + (Number(reward)||0) );

  // await set(doneRef, true);
  toast(`+${reward} 🪙`);
}

/* ====== Admin CRUD ====== */
async function adminAddCoins(){
  if (!isAdminUser) return toast("Admin only");
  const uid = prompt("Target UID:");
  const amount = Number(prompt("Add coins (number):"));
  if (!uid || !Number.isFinite(amount)) return toast("Invalid input");
  const coinsRef = ref(db, `players/${uid}/coins`);
  await runTransaction(coinsRef, (cur)=> (cur||0)+amount );
  toast("Coins added");
}
async function adminResetPlayer(){
  if (!isAdminUser) return toast("Admin only");
  const uid = prompt("Target UID to reset:");
  if (!uid) return;
  await update(ref(db, `players/${uid}`), { coins:0, taps:0, level:1, referrals:0 });
  toast("Player reset");
}
async function adminAddTask(){
  if (!isAdminUser) return toast("Admin only");
  const name = prompt("Task name:");
  const reward = Number(prompt("Reward (coins):"));
  if (!name || !Number.isFinite(reward) || reward<=0) return toast("Invalid task");
  const tRef = push(ref(db, "globalCustomTasks"));
  await set(tRef, { name, reward, status:"active", createdAt:Date.now(), createdBy: currentUser.uid });
  toast("Task added");
}
async function adminRemoveTask(){
  if (!isAdminUser) return toast("Admin only");
  const id = prompt("Task ID to remove:");
  if (!id) return;
  await remove(ref(db, `globalCustomTasks/${id}`));
  toast("Task removed");
}
async function adminEditTask(){
  if (!isAdminUser) return toast("Admin only");
  const id = prompt("Task ID to edit:");
  if (!id) return;
  const s = await get(ref(db, `globalCustomTasks/${id}`));
  if (!s.exists()) return toast("Task not found");
  const cur = s.val();
  const name = prompt("New name (blank=keep)", cur.name||"");
  const rewardStr = prompt("New reward (blank=keep)", String(cur.reward||""));
  const status = prompt("Status (active/inactive/completed, blank=keep)", cur.status||"active");
  const patch = { updatedAt: Date.now() };
  if (name) patch.name = name;
  if (rewardStr && Number.isFinite(Number(rewardStr))) patch.reward = Number(rewardStr);
  if (status && ["active","inactive","completed"].includes(status)) patch.status = status;
  await update(ref(db, `globalCustomTasks/${id}`), patch);
  toast("Task updated");
}
async function adminViewTasks(){
  if (!isAdminUser) return toast("Admin only");
  const s = await get(ref(db, "globalCustomTasks"));
  if (!s.exists()) return setHTML("customTasksList","<p style='color:#999'>No tasks</p>");
  const tasks = s.val() || {};
  let html = "";
  Object.entries(tasks).forEach(([id,t])=>{
    html += `
      <div class="task">
        <div><b>${esc(t?.name)}</b> — ${Number(t?.reward)||0} 🪙</div>
        <div style="opacity:.8">Status: ${esc(t?.status)}</div>
        <div style="margin-top:8px;">
          <button data-edit="${id}">Edit</button>
          <button data-remove="${id}">Remove</button>
        </div>
      </div>
    `;
  });
  setHTML("customTasksList", html);
  const wrap = $("customTasksList");
  if (wrap){
    wrap.querySelectorAll("[data-edit]").forEach(b=>{
      b.onclick = async ()=>{
        const id = b.getAttribute("data-edit");
        await adminEditTaskDirect(id);
      };
    });
    wrap.querySelectorAll("[data-remove]").forEach(b=>{
      b.onclick = async ()=>{
        const id = b.getAttribute("data-remove");
        await remove(ref(db, `globalCustomTasks/${id}`));
        toast("Task removed");
        adminViewTasks();
      };
    });
  }
}
async function adminEditTaskDirect(id){
  if (!isAdminUser) return toast("Admin only");
  const s = await get(ref(db, `globalCustomTasks/${id}`));
  if (!s.exists()) return toast("Task not found");
  const cur = s.val();
  const name = prompt("New name (blank=keep)", cur.name||"");
  const rewardStr = prompt("New reward (blank=keep)", String(cur.reward||""));
  const status = prompt("Status (active/inactive/completed, blank=keep)", cur.status||"active");
  const patch = { updatedAt: Date.now() };
  if (name) patch.name = name;
  if (rewardStr && Number.isFinite(Number(rewardStr))) patch.reward = Number(rewardStr);
  if (status && ["active","inactive","completed"].includes(status)) patch.status = status;
  await update(ref(db, `globalCustomTasks/${id}`), patch);
  toast("Task updated");
}

/* ====== Leaderboard (no duplicates) ====== */
function listenLeaderboard(type="coins"){
  if (listeners.leaderboard) off(listeners.leaderboard);
  const r = ref(db,"players");
  listeners.leaderboard = onValue(r,(snap)=>{
    if (!snap.exists()) return setHTML("leaderboardList","<p style='color:#999'>No data</p>");
    const data = snap.val() || {};
    const arr = Object.entries(data).map(([id,p])=>({id,...p}));

    const seen = new Set(), uniq = [];
    for (const p of arr){ if (seen.has(p.id)) continue; seen.add(p.id); uniq.push(p); }

    uniq.sort((a,b)=>((b?.[type]||0)-(a?.[type]||0)));
    const top = uniq.slice(0,50);

    const html = top.map((p,i)=>`
      <div style="${p.id===currentUser?.uid ? 'background:#1f1f1f;color:#ffd700;' : ''}">
        #${i+1} — ${esc(p.name||"Player")} — ${type==='coins'?(p.coins||0)+' 🪙':(p.referrals||0)+' 👥'}
      </div>
    `).join("");
    setHTML("leaderboardList", html);
  });
}

/* ====== Admin-only: globalTaskSettings (optional read) ====== */
async function readGlobalTaskSettingsOnce(){
  try{
    const s = await get(ref(db,"globalTaskSettings"));
    if (s.exists()) console.log("Global settings:", s.val());
  }catch(e){
    console.warn("Global settings read error:", e?.message||e);
  }
}

/* ====== Detach ====== */
function detachAll(){
  Object.values(listeners).forEach(l=> l && off(l));
  listeners = { player:null, tasks:null, leaderboard:null };
}

/* ====== Bind UI ====== */
function bindUI(){
  const tapBtn = $("tapButton");
  if (tapBtn) tapBtn.addEventListener("click", tap);

  const b1 = $("btn-leaderboard-coins");
  const b2 = $("btn-leaderboard-referrals");
  if (b1) b1.addEventListener("click", ()=> listenLeaderboard("coins"));
  if (b2) b2.addEventListener("click", ()=> listenLeaderboard("referrals"));

  const admin = $("adminSection");
  if (admin){
    admin.addEventListener("click", async (e)=>{
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const act = t.getAttribute("data-action");
      if (!act) return;
      try{
        if (act==="addCoins")      await adminAddCoins();
        if (act==="resetPlayer")   await adminResetPlayer();
        if (act==="addTask")       await adminAddTask();
        if (act==="removeTask")    await adminRemoveTask();
        if (act==="editTask")      await adminEditTask();
        if (act==="viewTasks")     await adminViewTasks();
      }catch(err){
        console.error(err); toast(err?.message||String(err));
      }
    });
  }

  // Fast UI from cache
  const c = localStorage.getItem("coins");
  const t = localStorage.getItem("taps");
  if (c) setText("balance", c);
  if (t) setText("totalTaps", t);
}

/* ====== Start ====== */
document.addEventListener("DOMContentLoaded", ()=>{
  bindUI();
  initFirebase();
});
