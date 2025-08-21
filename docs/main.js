// ===================== Firebase SDK =====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getDatabase, ref, set, get, push, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

// ===================== Config =====================
const firebaseConfig = {
  apiKey: "AIzaSyDShZAo9lg-SxpQViCT27uXVni1UK7TGYU",
  authDomain: "dragon-92897.firebaseapp.com",
  databaseURL: "https://dragon-92897-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dragon-92897",
  storageBucket: "dragon-92897.firebasestorage.app",
  messagingSenderId: "40351345340",
  appId: "1:40351345340:web:632388a9b45d3c7905feb9"
};

// ===================== Init =====================
const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);
const auth = getAuth(app);

let CURRENT_UID = null;

// ===================== Auth (anonymous) =====================
signInAnonymously(auth)
  .then(() => console.log("✅ Anonymous login"))
  .catch(err => console.error("❌ Login xatosi:", err));

// ===================== DOM: Eventlarni ulash =====================
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

  // Admin buttons
  document.querySelectorAll("#adminSection button")?.forEach(btn => {
    btn.addEventListener("click", () => adminAction(btn.dataset.action));
  });
});

// ===================== Auth state =====================
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  CURRENT_UID = user.uid;
  console.log("👤 UID:", CURRENT_UID);

  // O'yinchi profili — faqat bir marta yaratish
  const meRef = ref(db, `players/${CURRENT_UID}`);
  const meSnap = await get(meRef);
  if (!meSnap.exists()) {
    await set(meRef, {
      name: "Dragon Miner",
      coins: 0,
      level: 1,
      referrals: 0,
      refClaimed: false,
      createdAt: Date.now()
    });
  }

  // Referral (faqat 1 marta)
  await handleReferralOnce(CURRENT_UID);

  // Global vazifalarni tinglash (real-time, onValue bilan)
  listenGlobalTasks();

  // Reytingni ishga tushirish
  startLeaderboard("coins");
});

// ===================== GLOBAL TASKS (REAL-TIME onValue) =====================
/**
 * /globalTasks dan butun ro'yxatni o'qib, har o'zgarishda DOMni qayta chizamiz.
 * Bu usul qo'shish, o'chirish, tahrirlarni darhol aks ettiradi va "kechikib ko'rinish" muammosini yo'qotadi.
 */
function listenGlobalTasks() {
  const list = document.getElementById("customTasksList");
  if (!list) return;

  const tasksRef = ref(db, "globalTasks");
  onValue(tasksRef, (snap) => {
    list.innerHTML = "";

    if (!snap.exists()) {
      list.innerHTML = `<div class="condition-item">Hozircha vazifalar yo‘q</div>`;
      return;
    }

    const tasks = snap.val() || {};
    // Xohlasangiz, bu yerda sort ham qilishingiz mumkin (masalan createdAt bo‘yicha)
    Object.entries(tasks).forEach(([id, t]) => {
      const el = document.createElement("div");
      el.className = "condition-item";
      el.id = "task-" + id;
      el.innerHTML = `
        <div class="condition-text">
          ${t?.type === "referral" ? "👥 " : ""}${escapeHtml(t?.name || "No name")}
        </div>
        <div class="condition-reward">+${Number(t?.reward || 0)} DRC</div>
      `;
      list.appendChild(el);
    });
  }, (err) => {
    console.error("❌ Tasks listen error:", err);
  });
}

// ===================== LEADERBOARD =====================
/**
 * Barcha foydalanuvchilarni /players dan olib, tanlangan mezon bo‘yicha saralaymiz.
 * type: "coins" | "referrals"
 */
function startLeaderboard(type = "coins") {
  const list = document.getElementById("leaderboardList");
  if (!list) return;

  const playersRef = ref(db, "players");
  onValue(playersRef, (snap) => {
    if (!snap.exists()) {
      list.innerHTML = `<div class="leaderboard-item">Hozircha o'yinchilar yo'q</div>`;
      return;
    }

    const players = Object.entries(snap.val() || {}).map(([uid, p]) => ({
      uid,
      name: p?.name || "Unknown",
      coins: Number(p?.coins || 0),
      referrals: Number(p?.referrals || 0)
    }));

    if (type === "referrals") {
      players.sort((a, b) => b.referrals - a.referrals || b.coins - a.coins);
    } else {
      players.sort((a, b) => b.coins - a.coins || b.referrals - a.referrals);
    }

    list.innerHTML = players.map((p, i) => `
      <div class="leaderboard-item" data-uid="${p.uid}">
        <span class="rank">#${i + 1}</span>
        <span class="name">${escapeHtml(p.name)}</span>
        <span class="score">${type === "referrals" ? p.referrals : p.coins}</span>
      </div>
    `).join("");
  }, (err) => {
    console.error("❌ Leaderboard listen error:", err);
  });
}

// ===================== REFERRAL (faqat 1 marta) =====================
/**
 * ?ref=UID bo'lsa:
 *  - refererga (+100 coin, +1 referral)
 *  - hozirgi foydalanuvchiga { refererId, refClaimed:true }
 * Qayta yozilmasligi uchun refClaimed flag tekshiriladi.
 */
async function handleReferralOnce(myUid) {
  const meRef = ref(db, `players/${myUid}`);
  const meSnap = await get(meRef);
  const me = meSnap.val() || {};

  if (me.refClaimed) return; // allaqachon ishlatilgan

  const urlParams = new URLSearchParams(window.location.search);
  const refId = urlParams.get("ref");

  if (!refId || refId === myUid) {
    await update(meRef, { refClaimed: true });
    return;
  }

  console.log("👥 Referral orqali kirildi:", refId);

  const refPlayerRef = ref(db, `players/${refId}`);
  const refSnap = await get(refPlayerRef);

  if (refSnap.exists()) {
    const r = refSnap.val() || {};
    const newReferrals = Number(r.referrals || 0) + 1;
    const newCoins     = Number(r.coins || 0) + 100;

    await update(refPlayerRef, { referrals: newReferrals, coins: newCoins });
    await update(meRef, { refererId: refId, refClaimed: true });
    console.log(`✅ ${refId} ga +1 referral va +100 coin berildi`);
  } else {
    await update(meRef, { refClaimed: true });
  }
}

// ===================== ADMIN ACTIONS =====================
/**
 * Tasklar faqat /globalTasks da.
 * Qo'shish, o‘chirish, tahrir — hammasi shu yo‘lda.
 * "Referral vazifa" ham shu bo‘limga type:"referral" bilan qo‘shiladi.
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
      set(ref(db, `players/${resetId}`), {
        name: "Dragon Miner",
        coins: 0,
        level: 1,
        referrals: 0,
        refClaimed: true, // qayta refer olmasin
        createdAt: Date.now()
      });
      alert("🔄 O'yinchi qayta tiklandi!");
      break;
    }
    case "addTask": {
      const name = prompt("Yangi vazifa nomi:"); if (!name) return;
      const reward = parseInt(prompt("Mukofot (DRC):"), 10) || 100;
      push(ref(db, "globalTasks"), { name, reward, type: "default", createdAt: Date.now() })
        .then(() => alert("➕ Vazifa qo'shildi!"));
      break;
    }
    case "addReferralTask": { // YANGI: referral turidagi vazifa
      const name = prompt("Referral vazifa nomi:"); if (!name) return;
      const reward = parseInt(prompt("Mukofot (DRC):"), 10) || 100;
      push(ref(db, "globalTasks"), { name, reward, type: "referral", createdAt: Date.now() })
        .then(() => alert("👥 Referral vazifa qo'shildi!"));
      break;
    }
    case "removeTask": {
      const id = prompt("O'chiriladigan vazifa ID:");
      if (!id) return;
      remove(ref(db, `globalTasks/${id}`))
        .then(() => alert("➖ Vazifa o'chirildi!"));
      break;
    }
    case "editTask": {
      const id = prompt("Tahrir qilinadigan vazifa ID:"); if (!id) return;
      const newName = prompt("Yangi nom (bo'sh qoldirsangiz o'zgarmaydi):");
      const newRewardStr = prompt("Yangi mukofot (DRC) — bo'sh qoldirsangiz o'zgarmaydi:");
      const payload = {};
      if (newName) payload.name = newName;
      if (newRewardStr !== null && newRewardStr.trim() !== "") {
        const nr = parseInt(newRewardStr, 10);
        if (!Number.isNaN(nr)) payload.reward = nr;
      }
      if (Object.keys(payload).length === 0) return;
      update(ref(db, `globalTasks/${id}`), payload)
        .then(() => alert("✏️ Vazifa yangilandi!"));
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

// ===================== UI HELPERS =====================
function showSection(id) {
  document.querySelectorAll(".section").forEach(sec => (sec.style.display = "none"));
  if (id === "tap")        document.getElementById("tapSection")?.style.setProperty("display", "block");
  if (id === "leaderboard")document.getElementById("leaderboardSection")?.style.setProperty("display", "block");
  if (id === "admin")      document.getElementById("adminSection")?.style.setProperty("display", "block");
}

function tapCoin() {
  alert("🐉 Coin tapped!");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[m]));
}
