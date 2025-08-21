import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
import { getDatabase, ref, set, get, push, update, remove } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

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

const app = initializeApp(firebaseConfig);
getAnalytics(app);
const database = getDatabase(app);
const auth = getAuth(app);

signInAnonymously(auth)
  .then(() => console.log("✅ Anonymous login yuborildi"))
  .catch((error) => console.error("❌ Login xatosi:", error));

onAuthStateChanged(auth, (user) => {
  if (user) {
    console.log("👤 Auth UID:", user.uid);
    const playerRef = ref(database, "players/" + user.uid);
    set(playerRef, { name: "Dragon Miner", coins: 0, level: 1, referrals: 0 })
      .then(() => console.log("✅ Player ma'lumotlari yozildi"))
      .catch((err) => console.error("❌ Player yozishda xato:", err));
  }
});

function showSection(id) {
  document.querySelectorAll(".section").forEach(sec => sec.style.display = "none");
  if (id === "tap") document.getElementById("tapSection").style.display = "block";
  if (id === "leaderboard") document.getElementById("leaderboardSection").style.display = "block";
  if (id === "admin") document.getElementById("adminSection").style.display = "block";
}

function tapCoin() {
  alert("🐉 Coin tapped!");
}

// ✅ Reyting yuklash funksiyasi
function loadLeaderboard(type) {
  const playersRef = ref(database, "players");
  get(playersRef).then(snapshot => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      let players = Object.values(data);
      if (type === "coins") players.sort((a, b) => (b.coins || 0) - (a.coins || 0));
      if (type === "referrals") players.sort((a, b) => (b.referrals || 0) - (a.referrals || 0));
      const list = document.getElementById("leaderboardList");
      list.innerHTML = players.map((p, i) => 
        `<div style='padding:6px; border-bottom:1px solid #333;'>#${i+1} - ${p.name} (${type === "coins" ? (p.coins||0) : (p.referrals||0)})</div>`
      ).join("");
    }
  });
}

// ✅ Admin actions
function adminAction(action) {
  const db = database;
  switch(action) {
    case "addCoins":
      const targetId = prompt("O'yinchi UID kiriting:");
      const amount = parseInt(prompt("Nechta coin qo'shilsin?"));
      if (targetId && amount) {
        const playerRef = ref(db, "players/" + targetId);
        get(playerRef).then(snap => {
          if (snap.exists()) {
            let data = snap.val();
            let newCoins = (data.coins || 0) + amount;
            update(playerRef, { coins: newCoins });
            alert("💰 " + amount + " coin qo'shildi!");
          } else {
            alert("❌ O'yinchi topilmadi!");
          }
        });
      }
      break;
    case "resetPlayer":
      const resetId = prompt("O'yinchi UID kiriting:");
      if (resetId) {
        const resetRef = ref(db, "players/" + resetId);
        set(resetRef, { name: "Dragon Miner", coins: 0, level: 1, referrals: 0 });
        alert("🔄 O'yinchi qayta tiklandi!");
      }
      break;
    case "broadcastMessage":
      const msg = prompt("Xabar matnini kiriting:");
      if (msg) alert("📢 Barcha foydalanuvchilarga yuboriladi: " + msg);
      break;
    case "systemMaintenance":
      alert("🔧 Tizim texnik xizmat rejimida!");
      break;
    case "addTask":
      const taskName = prompt("Yangi vazifa nomi:");
      if (taskName) {
        const tasksRef = ref(db, "globalCustomTasks");
        push(tasksRef, { name: taskName, reward: 100 });
        alert("➕ Vazifa qo'shildi!");
      }
      break;
    case "removeTask":
      const removeId = prompt("O'chiriladigan vazifa ID:");
      if (removeId) {
        const taskRef = ref(db, "globalCustomTasks/" + removeId);
        remove(taskRef).then(() => alert("➖ Vazifa o'chirildi!"));
      }
      break;
    case "editTask":
      const editId = prompt("Tahrir qilinadigan vazifa ID:");
      const newName = prompt("Yangi nom:");
      if (editId && newName) {
        const editRef = ref(db, "globalCustomTasks/" + editId);
        update(editRef, { name: newName });
        alert("✏️ Vazifa yangilandi!");
      }
      break;
    case "viewTasks":
      const tasksRef = ref(db, "globalCustomTasks");
      get(tasksRef).then(snap => {
        if (snap.exists()) {
          console.log("📋 Vazifalar:", snap.val());
          alert("👁️ Vazifalar konsolda ko'rsatildi");
        } else {
          alert("❌ Vazifalar topilmadi");
        }
      });
      break;
    default:
      alert("⚠️ Noma'lum action: " + action);
  }
}

// 🔗 Event listenerlar
document.getElementById("tab-tap").addEventListener("click", () => showSection("tap"));
document.getElementById("tab-leaderboard").addEventListener("click", () => { showSection("leaderboard"); loadLeaderboard("coins"); });
document.getElementById("tab-admin").addEventListener("click", () => showSection("admin"));

document.getElementById("tapButton").addEventListener("click", tapCoin);
document.getElementById("btn-leaderboard-coins").addEventListener("click", () => loadLeaderboard("coins"));
document.getElementById("btn-leaderboard-referrals").addEventListener("click", () => loadLeaderboard("referrals"));

document.querySelectorAll("#adminSection button").forEach(btn => {
  btn.addEventListener("click", () => adminAction(btn.dataset.action));
});
