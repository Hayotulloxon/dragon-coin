// main.js — Tuzatilgan, Telegram-aware, Firebase-safe implementation

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getDatabase, ref, set, get, push, update, remove, onValue, off, runTransaction, query, orderByChild, equalTo
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

/* ============
   CONFIG — Replace with your own
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
let tapLimit = 1000; // Kunlik tap limit
let currentTapsToday = 0;
let playerData = {}; // Local cache for player data

const $ = id => document.getElementById(id);
const safeText = (id, v) => { const e = $(id); if (e) e.textContent = String(v); };
const safeHTML = (id, h) => { const e = $(id); if (e) e.innerHTML = h; };
const esc = s => String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#39;");
const toast = m => { try { alert(m); } catch(e) { console.log(m); } };
const getTodayKey = () => new Date().toISOString().split('T')[0]; // YYYY-MM-DD

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

  // Keep auth persistent across reloads
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

    // Get Telegram user info if available
    const tgUser = getTelegramUser();

    // Find or create player based on Telegram ID or Firebase UID
    const playerUid = await findOrCreatePlayer(user.uid, tgUser);

    // Update currentUser.uid to the merged/found UID
    currentUser.uid = playerUid;

    // Check admin status
    isAdminUser = await safeCheckAdmin(playerUid);
    showAdmin(isAdminUser);

    // Start real-time listeners
    listenPlayer(playerUid);
    startLeaderboardListener("coins");
    startTasksListener();

    // Load daily tap count
    await loadDailyTaps(playerUid);
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
    return {
      id: u.id,
      first_name: u.first_name || null,
      last_name: u.last_name || null,
      username: u.username || null
    };
  } catch (e) {
    console.warn("Telegram user fetch error:", e);
    return null;
  }
}

/* ============
   Find or create player (FIXED: to prevent duplicates)
   ============ */
async function findOrCreatePlayer(firebaseUid, tgUser) {
  let playerUid = firebaseUid;
  
  if (tgUser && tgUser.id) {
    try {
      // Search for existing player with this Telegram ID
      const tgIdQuery = query(ref(db, 'players'), orderByChild('telegram/id'), equalTo(tgUser.id));
      const snap = await get(tgIdQuery);
      
      if (snap.exists()) {
        const existingPlayers = snap.val();
        const existingUid = Object.keys(existingPlayers)[0]; // Take the first match
        
        // If different from current Firebase UID, use the existing one
        if (existingUid !== firebaseUid) {
          playerUid = existingUid;
          console.log(`Using existing player: ${existingUid} for Telegram user: ${tgUser.id}`);
        }
      } else {
        // Attach Telegram info to current player
        await update(ref(db, `players/${playerUid}/telegram`), tgUser);
      }
    } catch (e) {
      console.error("Error finding player by Telegram ID:", e);
    }
  }
  
  // Ensure player doc exists
  await ensurePlayerDoc(playerUid);
  return playerUid;
}

/* ============
   Ensure player node exists (FIXED: preserve existing data completely)
   ============ */
async function ensurePlayerDoc(uid) {
  try {
    const pRef = ref(db, `players/${uid}`);
    const snap = await get(pRef);
    
    if (!snap.exists()) {
      const newPlayer = {
        name: "Dragon Miner",
        coins: 0,
        taps: 0,
        level: 1,
        referrals: 0,
        createdAt: Date.now(),
        dailyTaps: {}
      };
      await set(pRef, newPlayer);
      console.log(`✅ Created new player: ${uid}`);
    } else {
      console.log(`✅ Player exists: ${uid}`);
      const currentData = snap.val();
      
      // Only add missing fields without overwriting existing ones
      const updates = {};
      if (typeof currentData.dailyTaps === 'undefined') {
        updates.dailyTaps = {};
      }
      if (typeof currentData.coins === 'undefined') {
        updates.coins = 0;
      }
      if (typeof currentData.taps === 'undefined') {
        updates.taps = 0;
      }
      if (typeof currentData.level === 'undefined') {
        updates.level = 1;
      }
      if (typeof currentData.referrals === 'undefined') {
        updates.referrals = 0;
      }
      
      // Only update if there are missing fields
      if (Object.keys(updates).length > 0) {
        await update(pRef, updates);
        console.log(`✅ Updated missing fields for player: ${uid}`, updates);
      }
    }
  } catch (e) {
    console.error("❌ Error ensuring player doc:", e);
  }
}

/* ============
   Load daily taps for limit (FIXED)
   ============ */
async function loadDailyTaps(uid) {
  try {
    const today = getTodayKey();
    const tapsRef = ref(db, `players/${uid}/dailyTaps/${today}`);
    const snap = await get(tapsRef);
    currentTapsToday = snap.val() || 0;
    
    // Update UI with remaining taps
    const remaining = Math.max(0, tapLimit - currentTapsToday);
    safeText("remainingTaps", remaining);
    console.log(`Daily taps: ${currentTapsToday}/${tapLimit}`);
  } catch (e) {
    console.error("Error loading daily taps:", e);
    currentTapsToday = 0;
  }
}

/* ============
   Safe check admin
   ============ */
async function safeCheckAdmin(uid) {
  try {
    const snap = await get(ref(db, `admins/${uid}`));
    const isAdmin = snap.exists() && snap.val() === true;
    console.log(`Admin check for ${uid}: ${isAdmin}`);
    return isAdmin;
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
  if (adminEl) {
    adminEl.style.display = flag ? "block" : "none";
    console.log(`Admin section: ${flag ? 'shown' : 'hidden'}`);
  }
}

/* ============
   Player real-time listener (FIXED: better persistence and caching)
   ============ */
function listenPlayer(uid) {
  if (listeners.player) {
    off(listeners.player);
  }
  
  const r = ref(db, `players/${uid}`);
  listeners.player = onValue(r, snap => {
    if (!snap.exists()) {
      console.warn(`❌ Player data not found: ${uid}`);
      return;
    }
    
    const data = snap.val() || {};
    playerData = { ...data }; // Deep copy to cache
    
    // Update UI immediately
    safeText("balance", data.coins ?? 0);
    safeText("totalTaps", data.taps ?? 0);
    
    // Cache in localStorage for faster loading
    try {
      localStorage.setItem("playerData", JSON.stringify({
        coins: data.coins ?? 0,
        taps: data.taps ?? 0,
        uid: uid,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.warn("Failed to cache player data:", e);
    }
    
    // Update daily taps count
    const today = getTodayKey();
    currentTapsToday = data.dailyTaps?.[today] || 0;
    const remaining = Math.max(0, tapLimit - currentTapsToday);
    safeText("remainingTaps", remaining);
    
    // Update tap button state
    const tapBtn = $("tapButton");
    if (tapBtn) {
      if (currentTapsToday >= tapLimit) {
        tapBtn.disabled = true;
        tapBtn.textContent = "Limit tugadi";
        tapBtn.style.background = "#666";
      } else {
        tapBtn.disabled = false;
        tapBtn.textContent = `Tap! (${remaining} qoldi)`;
        tapBtn.style.background = "#4CAF50";
      }
    }
    
    console.log(`✅ Player data updated - Coins: ${data.coins}, Taps: ${data.taps}, Daily: ${currentTapsToday}/${tapLimit}`);
  }, err => {
    console.error("❌ Player listener error:", err);
    
    // Try to load from cache if listener fails
    try {
      const cached = localStorage.getItem("playerData");
      if (cached) {
        const cachedData = JSON.parse(cached);
        // Only use cache if it's recent (less than 5 minutes old)
        if (Date.now() - cachedData.timestamp < 5 * 60 * 1000) {
          safeText("balance", cachedData.coins);
          safeText("totalTaps", cachedData.taps);
          console.log("⚡ Using cached player data");
        }
      }
    } catch (e) {
      console.warn("Failed to load cached data:", e);
    }
  });
}

/* ============
   Tap (FIXED: proper energy/limit handling)
   ============ */
async function handleTap() {
  if (!currentUser) {
    return toast("Please wait until login completes");
  }
  
  if (currentTapsToday >= tapLimit) {
    return toast(`Daily tap limit reached! (${tapLimit})`);
  }

  const today = getTodayKey();
  const basePath = `players/${currentUser.uid}`;
  
  try {
    // Update coins, taps, and daily taps atomically
    const updates = {};
    updates[`${basePath}/coins`] = (playerData.coins || 0) + 1;
    updates[`${basePath}/taps`] = (playerData.taps || 0) + 1;
    updates[`${basePath}/dailyTaps/${today}`] = currentTapsToday + 1;
    
    await update(ref(db), updates);
    
    console.log("Tap successful!");
    
    // Haptic feedback for Telegram
    if (window.Telegram?.WebApp?.HapticFeedback) {
      window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    }
    
  } catch (e) {
    console.error("tap transaction failed:", e);
    toast("Tap failed: " + (e.message || e));
  }
}

/* ============
   Tasks: real-time listener (FIXED)
   ============ */
function startTasksListener() {
  if (listeners.tasks) {
    off(listeners.tasks);
  }
  
  const r = ref(db, "globalCustomTasks");
  listeners.tasks = onValue(r, async (snap) => {
    const target = "customTasksList";
    
    if (!snap.exists()) {
      console.log("No tasks found in globalCustomTasks");
      return safeHTML(target, "<p style='color:#999'>Vazifalar yo'q</p>");
    }
    
    const tasks = snap.val() || {};
    console.log("Tasks data:", tasks);
    
    // Get completed tasks for current user
    let completedTasks = {};
    if (currentUser) {
      try {
        const completedSnap = await get(ref(db, `players/${currentUser.uid}/tasksCompleted`));
        completedTasks = completedSnap.val() || {};
      } catch (e) {
        console.warn("Error loading completed tasks:", e);
      }
    }
    
    let html = "";
    Object.entries(tasks).forEach(([id, t]) => {
      if (!t || t.status !== "active") return;
      
      const isCompleted = completedTasks[id] === true;
      const buttonText = isCompleted ? "Bajarilgan ✅" : "Bajarish";
      const buttonDisabled = isCompleted ? "disabled" : "";
      
      html += `
        <div class="task" style="background:#222;padding:10px;border-radius:8px;margin:8px 0;${isCompleted ? 'opacity:0.7;' : ''}">
          <div style="font-weight:700">${esc(t.name)}</div>
          <div style="opacity:.8">Mukofot: ${Number(t.reward)||0} 🪙</div>
          <div style="margin-top:8px">
            <button ${buttonDisabled} data-task-id="${id}" data-reward="${Number(t.reward)||0}" class="btn-complete" style="padding:8px 16px;background:${isCompleted ? '#666' : '#4CAF50'};color:white;border:none;border-radius:4px;">
              ${buttonText}
            </button>
          </div>
        </div>
      `;
    });
    
    safeHTML(target, html || "<p style='color:#999'>Vazifalar yo'q</p>");

    // Bind click events
    const wrap = $(target);
    if (wrap) {
      wrap.querySelectorAll(".btn-complete:not([disabled])").forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute("data-task-id");
          const reward = Number(btn.getAttribute("data-reward")) || 0;
          await completeTask(id, reward);
        };
      });
    }
  }, err => {
    console.error("tasks listener error:", err);
    safeHTML("customTasksList", "<p style='color:#f44'>Vazifalarni yuklashda xatolik</p>");
  });
}

/* ============
   Complete task (FIXED: proper completion check)
   ============ */
async function completeTask(taskId, reward) {
  if (!currentUser) return toast("Avval tizimga kiring");
  
  try {
    const completedRef = ref(db, `players/${currentUser.uid}/tasksCompleted/${taskId}`);
    const snap = await get(completedRef);
    
    if (snap.exists()) {
      return toast("Vazifa allaqachon bajarilgan");
    }
    
    // Use atomic update to prevent race conditions
    const updates = {};
    updates[`players/${currentUser.uid}/coins`] = (playerData.coins || 0) + (Number(reward) || 0);
    updates[`players/${currentUser.uid}/tasksCompleted/${taskId}`] = true;
    
    await update(ref(db), updates);
    
    toast(`Vazifa bajarildi: +${reward} 🪙`);
    console.log(`Task ${taskId} completed, reward: ${reward}`);
    
  } catch (e) {
    console.error("completeTask error:", e);
    toast("Vazifani bajarishda xatolik: " + (e.message || e));
  }
}

/* ============
   Leaderboard (FIXED: duplicate prevention)
   ============ */
function startLeaderboardListener(type = "coins") {
  if (listeners.leaderboard) {
    off(listeners.leaderboard);
  }
  
  const r = ref(db, "players");
  listeners.leaderboard = onValue(r, snap => {
    const target = "leaderboardList";
    
    if (!snap.exists()) {
      return safeHTML(target, "<p style='color:#999'>Hali o'yinchilar yo'q</p>");
    }
    
    const data = snap.val() || {};
    console.log("Leaderboard raw data count:", Object.keys(data).length);
    
    // Filter and process players to prevent duplicates
    const seen = new Set();
    const seenTelegramIds = new Set();
    const players = [];
    
    Object.entries(data).forEach(([id, p]) => {
      if (!p) return;
      
      // Skip if we've already seen this Firebase UID
      if (seen.has(id)) {
        console.warn(`Duplicate Firebase UID detected: ${id}`);
        return;
      }
      seen.add(id);
      
      // Skip if we've already seen this Telegram user
      if (p.telegram && p.telegram.id) {
        if (seenTelegramIds.has(p.telegram.id)) {
          console.warn(`Duplicate Telegram ID detected: ${p.telegram.id} (UID: ${id})`);
          return;
        }
        seenTelegramIds.add(p.telegram.id);
      }
      
      players.push({ id, ...p });
    });
    
    // Sort and take top 50
    const sortedPlayers = players
      .sort((a, b) => (b[type] || 0) - (a[type] || 0))
      .slice(0, 50);

    console.log(`Leaderboard processed: ${sortedPlayers.length} unique players`);
    
    const html = sortedPlayers.map((p, i) => {
      const isCurrentUser = p.id === currentUser?.uid;
      const displayName = p.telegram?.first_name || p.name || "Player";
      const score = type === "coins" ? (p.coins || 0) + " 🪙" : (p.referrals || 0) + " 👥";
      
      return `
        <div style="padding:12px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;${isCurrentUser ? 'background:#1f1f1f;border-left:4px solid #ffd700;' : ''}">
          <div>
            <span style="color:#888;margin-right:8px;">#${i+1}</span>
            <span style="font-weight:${isCurrentUser ? 'bold' : 'normal'};color:${isCurrentUser ? '#ffd700' : 'inherit'};">${esc(displayName)}</span>
          </div>
          <div style="font-weight:bold;color:${isCurrentUser ? '#ffd700' : '#4CAF50'};">${score}</div>
        </div>
      `;
    }).join("");
    
    safeHTML(target, html || "<p style='color:#999'>Hali o'yinchilar yo'q</p>");
  }, err => { 
    console.error("leaderboard listen error:", err);
    safeHTML("leaderboardList", "<p style='color:#f44'>Reytingni yuklashda xatolik</p>");
  });
}

/* ============
   Admin actions (FIXED: better error handling)
   ============ */
async function adminAddTask() {
  if (!isAdminUser) return toast("Faqat admin");
  
  const name = prompt("Vazifa nomi:");
  if (!name || name.trim().length === 0) return toast("Noto'g'ri vazifa nomi");
  
  const reward = Number(prompt("Mukofot (tangalar):"));
  if (!Number.isFinite(reward) || reward <= 0 || reward > 50000) {
    return toast("Noto'g'ri mukofot miqdori (1-50000)");
  }
  
  try {
    const newRef = push(ref(db, "globalCustomTasks"));
    await set(newRef, {
      name: name.trim(),
      reward,
      status: "active",
      createdAt: Date.now(),
      createdBy: currentUser.uid
    });
    toast("Vazifa qo'shildi");
    console.log(`Admin added task: ${name}, reward: ${reward}`);
  } catch (e) {
    console.error("adminAddTask error:", e);
    toast("Vazifa qo'shishda xatolik: " + (e.message || e));
  }
}

async function adminDeleteTask() {
  if (!isAdminUser) return toast("Faqat admin");
  
  const id = prompt("O'chiriladigan vazifa ID si:");
  if (!id) return;
  
  try {
    // Check if task exists
    const taskSnap = await get(ref(db, `globalCustomTasks/${id}`));
    if (!taskSnap.exists()) {
      return toast("Vazifa topilmadi");
    }
    
    await remove(ref(db, `globalCustomTasks/${id}`));
    toast("Vazifa o'chirildi");
    console.log(`Admin deleted task: ${id}`);
  } catch (e) {
    console.error("adminDeleteTask error:", e);
    toast("O'chirishda xatolik: " + (e.message || e));
  }
}

/* ============
   Detach listeners
   ============ */
function detachAllListeners() {
  Object.entries(listeners).forEach(([key, listener]) => {
    if (listener) {
      off(listener);
      console.log(`Detached ${key} listener`);
    }
  });
  listeners = { player: null, leaderboard: null, tasks: null };
}

/* ============
   UI binding + start (FIXED: Load cached data immediately)
   ============ */
function bindUI() {
  const tapBtn = $("tapButton");
  if (tapBtn) {
    tapBtn.addEventListener("click", handleTap);
  }

  const coinsBtn = $("btn-leaderboard-coins");
  const refBtn = $("btn-leaderboard-referrals");
  if (coinsBtn) coinsBtn.addEventListener("click", () => startLeaderboardListener("coins"));
  if (refBtn) refBtn.addEventListener("click", () => startLeaderboardListener("referrals"));

  // Admin section delegation
  const adminSec = $("adminSection");
  if (adminSec) {
    adminSec.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      
      const action = btn.dataset.action;
      console.log(`Admin action: ${action}`);
      
      switch(action) {
        case "addTask": 
          await adminAddTask(); 
          break;
        case "delTask": 
          await adminDeleteTask(); 
          break;
        case "viewTasks": 
          await adminViewTasks(); 
          break;
        default:
          console.warn(`Unknown admin action: ${action}`);
      }
    });
  }

  // Load cached data immediately for faster UI response
  try {
    const cached = localStorage.getItem("playerData");
    if (cached) {
      const cachedData = JSON.parse(cached);
      // Use cache if it's recent (less than 10 minutes old)
      if (Date.now() - cachedData.timestamp < 10 * 60 * 1000) {
        safeText("balance", cachedData.coins);
        safeText("totalTaps", cachedData.taps);
        console.log("⚡ Loaded cached UI data for faster startup");
      }
    }
  } catch (e) {
    console.warn("Failed to load cached UI data:", e);
  }
}

async function adminViewTasks() {
  if (!isAdminUser) return toast("Faqat admin");
  
  try {
    const s = await get(ref(db, "globalCustomTasks"));
    if (!s.exists()) {
      return safeHTML("customTasksList", "<p>Vazifalar yo'q</p>");
    }
    
    const tasks = s.val() || {};
    let html = "<div style='background:#333;padding:10px;border-radius:8px;margin:10px 0;'><h3>Admin: Barcha vazifalar</h3>";
    
    Object.entries(tasks).forEach(([id, t]) => {
      const statusColor = t.status === 'active' ? '#4CAF50' : '#999';
      html += `
        <div style='border:1px solid #555;padding:8px;margin:5px 0;border-radius:4px;'>
          <div><strong>${esc(t.name)}</strong></div>
          <div>Mukofot: ${Number(t.reward)||0} 🪙</div>
          <div style='color:${statusColor}'>Status: ${esc(t.status)}</div>
          <div style='font-size:12px;color:#888;font-family:monospace;'>ID: ${id}</div>
        </div>
      `;
    });
    
    html += "</div>";
    safeHTML("customTasksList", html);
  } catch (e) {
    console.error("adminViewTasks error:", e);
    toast("Vazifalarni ko'rishda xatolik: " + (e.message || e));
  }
}

/* ============
   Start on DOM ready
   ============ */
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, initializing...");
  bindUI();
  initializeFirebase();
});

/* ============
   Expose functions globally for HTML buttons
   ============ */
window.completeTask = completeTask;
window.adminAddTask = adminAddTask;
window.adminDeleteTask = adminDeleteTask;
window.tapCoin = handleTap;
window.showLeaderboard = startLeaderboardListener;
