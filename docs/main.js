// ===== Firebase SDK =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
import {
  getDatabase, ref, set, get, push, update, remove, onValue,
  onChildAdded, onChildRemoved, onChildChanged
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

// ===== Config =====
const firebaseConfig = {
  apiKey: "AIzaSyDShZAo9lg-SxpQViCT27uXVni1UK7TGYU",
  authDomain: "dragon-92897.firebaseapp.com",
  databaseURL: "https://dragon-92897-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dragon-92897",
  storageBucket: "dragon-92897.firebasestorage.app",
  messagingSenderId: "40351345340",
  appId: "1:40351345340:web:632388a9b45d3c7905feb9",
  measurementId: "G-FXT1F3NPCD"
};

// ===== Init =====
const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch {}
const db = getDatabase(app);
const auth = getAuth(app);

// ===== Auth (anonymous) =====
signInAnonymously(auth)
  .then(() => console.log("✅ Anonymous login yuborildi"))
  .catch(err => console.error("❌ Login xatosi:", err));

// ===== Global state =====
let CURRENT_UID = null;

// ===== DOM READY: event listenerlarni shu yerda ulang =====
document.addEventListener("DOMContentLoaded", () => {
  // Tabs
  document.getElementById("tab-tap")?.addEventListener("click", () => showSection("tap"));
  document.getElementById("tab-leaderboard")?.addEventListener("click", () => {
    showSection("leaderboard");
    startLeaderboard("coins");
  });
  document.getElementById("tab-admin")?.addEventListener("click", () => showSection("admin"));

  // Buttons
  document.getElementById("tapButton")?.addEventListener("click", tapCoin);
  document.getElementById("btn-leaderboard-coins")?.addEventListener("click", () => startLeaderboard("coins"));
  document.getElementById("btn-leaderboard-referrals")?.addEventListener("click", () => startLeaderboard("referrals"));
});

// ===== Auth state =====
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  CURRENT_UID = user.uid;
  console.log("👤 Auth UID:", CURRENT_UID);

  // O'yinchi profilini yaratish (agar bo'lmasa)
  const meRef = ref(db, `players/${CURRENT_UID}`);
  const meSnap = await get(meRef);
  if (!meSnap.exists()) {
    await set(meRef, {
      name: "Dragon Miner",
      coins: 0,
      level: 1,
      referrals: 0,
      createdAt: Date.now()
    });
    console.log("✅ Yangi o'yinchi yozildi");
  } else {
    console.log("🔄 O'yinchi mavjud:", meSnap.val());
  }

  // Referalni 1 marta ishlatish
  await handleReferralOnce(CURRENT_UID);

  // GLOBAL TASKS — real-time child listenerlar
  listenGlobalTasks();

  // Reytingni start qilib qo'yamiz (coins bo'yicha default)
  startLeaderboard("coins");
});

// =====================
//   GLOBAL TASKS (RTDB)
// =====================
/**
 * Admin vazifani qo'shganda hamma ko'rishi, o'chirganda hamma joydan ketishi uchun
 * faqat bitta joydan ishlaymiz: /globalTasks
 * UI real-time uchun child listenerlar ishlatiladi (kechikish muammolari yo'q).
 */
const taskDomCache = new Set(); // DOMga qo'yilgan item id'lar

function listenGlobalTasks() {
  const list = document.getElementById("customTasksList");
  if (!list) return;

  list.innerHTML = "";
  taskDomCache.clear();

  const tasksRef = ref(db, "globalTasks");

  // Qo'shilganda:
  onChildAdded(tasksRef, (snap) => {
    const id = snap.key;
    const task = snap.val() || {};
    if (taskDomCache.has(id)) return;

    const el = document.createElement("div");
    el.className = "condition-item";
    el.id = `task-${id}`;
    el.innerHTML = `
      <div class="condition-text">${escapeHtml(task.name || "No name")}</div>
      <div class="condition-reward">+${Number(task.reward || 0)} DRC</div>
    `;
    list.appendChild(el);
    taskDomCache.add(id);
  });

  // O'chirilganda:
  onChildRemoved(tasksRef, (snap) => {
    const id = snap.key;
    const el = document.getElementById(`task-${id}`);
    if (el) el.remove();
    taskDomCache.delete(id);
  });

  // Yangilanganda:
  onChildChanged(tasksRef, (snap) => {
    const id = snap.key;
    const task = snap.val() || {};
    const el = document.getElementById(`task-${id}`);
    if (el) {
      el.querySelector(".condition-text").textContent = task.name || "No name";
      el.querySelector(".condition-reward").textContent = `+${Number(task.reward || 0)} DRC`;
    }
  });
}

// =====================
//   LEADERBOARD (RTDB)
// =====================
/**
 * Hamma foydalanuvchilar ko'rinsin: /players ni tinglaymiz,
 * har o'zgarishda qayta sort + render.
 */
let leaderboardUnsub = null; // onValue ni bitta marta ulash uchun

function startLeaderboard(type = "coins") {
  const list = document.getElementById("leaderboardList");
  if (!list) return;

  // Eski listener bo'lsa, UI tomonda qayta ishlov beramiz; onValue qayta ulanishi xavfsiz.
  const playersRef = ref(db, "players");
  onValue(playersRef, (snap) => {
    if (!snap.exists()) {
      list.innerHTML = `<div class="leaderboard-item">Hozircha o'yinchilar yo'q</div>`;
      return;
    }
    const data = snap.val() || {};
    const players = Object.entries(data).map(([uid, p]) => ({
      uid,
      name: p?.name || "Unknown",
      coins: Number(p?.coins || 0),
      referrals: Number(p?.referrals || 0)
    }));

    // Sort
    if (type === "referrals") {
      players.sort((a, b) => b.referrals - a.referrals || b.coins - a.coins);
    } else {
      players.sort((a, b) => b.coins - a.coins || b.referrals - a.referrals);
    }

    // Render
    list.innerHTML = players.map((p, i) => `
      <div class="leaderboard-item" data-uid="${p.uid}">
        <span class="rank">#${i + 1}</span>
        <span class="name">${escapeHtml(p.name)}</span>
        <span class="score">${type === "referrals" ? p.referrals : p.coins}</span>
      </div>
    `).join("");
  });
}

// =====================
//   REFERRAL (once)
// =====================
/**
 * ?ref=UID kelsa:
 * - referer (ref=UID egasi) ga +1 referral va +100 coin
 * - hozirgi foydalanuvchiga refererId yoziladi
 * - BUNI FAQAT BIR MARTA qilamiz: players/{myUid}/refClaimed = true bo'lsa, qayta yozmaydi
 */
async function handleReferralOnce(myUid) {
  const meRef = ref(db, `players/${myUid}`);
  const meSnap = await get(meRef);
  const me = meSnap.val() || {};

  if (me.refClaimed) {
    // allaqachon ishlatilgan
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const refId = urlParams.get("ref");

  if (!refId || refId === myUid) {
    // referal yo'q yoki o'zini refer qildi
    await update(meRef, { refClaimed: true }); // keyingi safar tekshirmasin
    return;
  }

  console.log("👥 Referal orqali kirilgan:", refId);

  const refPlayerRef = ref(db, `players/${refId}`);
  const refSnap = await get(refPlayerRef);

  if (refSnap.exists()) {
    const r = refSnap.val();
    const newReferrals = Number(r.referrals || 0) + 1;
    const newCoins = Number(r.coins || 0) + 100;

    await update(refPlayerRef, { referrals: newReferrals, coins: newCoins });
    await update(meRef, { refererId: refId, refClaimed: true });
    console.log(`✅ ${refId} ga +1 referral va +100 coin berildi`);
  } else {
    // referer topilmadi — baribir flag qo'yamiz, loop bo'lmasin
    await update(meRef, { refClaimed: true });
  }
}

// =====================
//   ADMIN ACTIONS
// =====================
/**
 * Eslatma: tasklar faqat /globalTasks da saqlanadi.
 * Shuning uchun qo'shish/o'chirish ham shu yo'lda.
 */
function adminAction(action) {
  switch (action) {
    case "addCoins": {
      const targetId = prompt("O'yinchi UID kiriting:");
      const amount = parseInt(prompt("Nechta coin qo'shilsin?"), 10);
      if (!targetId || !amount) return;
      const pRef = ref(db, `players/${targetId}`);
      get(pRef).then(s => {
        if (!s.exists()) return alert("❌ O'yinchi topilmadi!");
        const d = s.val() || {};
        update(pRef, { coins: Number(d.coins || 0) + amount });
        alert(`💰 ${amount} coin qo'shildi!`);
      });
      break;
    }
    case "resetPlayer": {
      const resetId = prompt("O'yinchi UID kiriting:");
      if (!resetId) return;
      const resetRef = ref(db, `players/${resetId}`);
      set(resetRef, { name: "Dragon Miner", coins: 0, level: 1, referrals: 0, refClaimed: true });
      alert("🔄 O'yinchi qayta tiklandi!");
      break;
    }
    case "addTask": {
      const name = prompt("Yangi vazifa nomi:");
      const reward = parseInt(prompt("Mukofot (DRC):"), 10) || 100;
      if (!name) return;
      const tRef = ref(db, "globalTasks");
      push(tRef, { name, reward, createdAt: Date.now() }).then(() => {
        alert("➕ Vazifa qo'shildi (global)!");
      });
      break;
    }
    case "removeTask": {
      const id = prompt("O'chiriladigan vazifa ID:");
      if (!id) return;
      const tRef = ref(db, `globalTasks/${id}`);
      remove(tRef).then(() => alert("➖ Vazifa o'chirildi (global)!"));
      break;
    }
    case "editTask": {
      const id = prompt("Tahrir qilinadigan vazifa ID:");
      if (!id) return;
      const newName = prompt("Yangi nom:");
      const newReward = parseInt(prompt("Yangi mukofot (DRC):"), 10);
      const payload = {};
      if (newName) payload.name = newName;
      if (!Number.isNaN(newReward)) payload.reward = newReward;
      if (Object.keys(payload).length === 0) return;
      const eRef = ref(db, `globalTasks/${id}`);
      update(eRef, payload).then(() => alert("✏️ Vazifa yangilandi!"));
      break;
    }
    case "viewTasks": {
      get(ref(db, "globalTasks")).then(s => {
        if (!s.exists()) return alert("❌ Vazifalar topilmadi");
        console.log("📋 Vazifalar:", s.val());
        alert("👁️ Vazifalar konsolda ko'rsatildi");
      });
      break;
    }
    case "systemMaintenance":
      alert("🔧 Tizim texnik xizmat rejimida!");
      break;
    case "broadcastMessage": {
      const msg = prompt("Xabar matnini kiriting:");
      if (msg) alert("📢 Barcha foydalanuvchilarga yuboriladi: " + msg);
      break;
    }
    default:
      alert("⚠️ Noma'lum action: " + action);
  }
}

// Admin tugmalari (DOM yuklangach)
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("#adminSection button")?.forEach(btn => {
    btn.addEventListener("click", () => adminAction(btn.dataset.action));
  });
});

// =====================
//   UI helpers
// =====================
function showSection(id) {
  document.querySelectorAll(".section").forEach(sec => sec.style.display = "none");
  if (id === "tap") document.getElementById("tapSection")?.style.setProperty("display", "block");
  if (id === "leaderboard") document.getElementById("leaderboardSection")?.style.setProperty("display", "block");
  if (id === "admin") document.getElementById("adminSection")?.style.setProperty("display", "block");
}

function tapCoin() {
  alert("🐉 Coin tapped!");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
