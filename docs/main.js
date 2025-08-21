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
      let players = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
      if (type === "coins") players.sort((a, b) => (b.coins || 0) - (a.coins || 0));
      if (type === "referrals") players.sort((a, b) => (b.referrals || 0) - (a.referrals || 0));
      const list = document.getElementById("leaderboardList");
      list.innerHTML = players.map((p, i) => 
        `<div style='padding:6px; border-bottom:1px solid #333;'>#${i+1} - ${p.name || 'Dragon Miner'} (${type === "coins" ? (p.coins||0) : (p.referrals||0)})</div>`
      ).join("");
    } else {
      const list = document.getElementById("leaderboardList");
      list.innerHTML = "<div style='padding:10px; text-align:center;'>Ma'lumot topilmadi</div>";
    }
  }).catch(error => {
    console.error("❌ Leaderboard yuklashda xato:", error);
    const list = document.getElementById("leaderboardList");
    list.innerHTML = "<div style='padding:10px; text-align:center; color:red;'>Xato yuz berdi</div>";
  });
}

// ✅ Vazifalarni ko'rsatish funksiyasi
function displayTasks() {
  const tasksRef = ref(database, "globalCustomTasks");
  get(tasksRef).then(snapshot => {
    const tasksList = document.getElementById("tasksList");
    if (!tasksList) {
      // Agar tasksList elementi yo'q bo'lsa, yaratamiz
      const adminSection = document.getElementById("adminSection");
      const tasksDiv = document.createElement("div");
      tasksDiv.innerHTML = `
        <h3 style="margin-top:20px;">📋 Mavjud Vazifalar:</h3>
        <div id="tasksList" style="max-height:200px; overflow-y:auto; border:1px solid #333; padding:10px; margin:10px 0;"></div>
      `;
      adminSection.appendChild(tasksDiv);
    }
    
    const tasksListElement = document.getElementById("tasksList");
    if (snapshot.exists()) {
      const tasks = snapshot.val();
      tasksListElement.innerHTML = Object.keys(tasks).map(key => 
        `<div style='padding:5px; border-bottom:1px solid #444; display:flex; justify-content:space-between;'>
          <span>🎯 ${tasks[key].name} (${tasks[key].reward || 100} coin)</span>
          <span style='font-size:10px; color:#666;'>ID: ${key}</span>
        </div>`
      ).join("");
    } else {
      tasksListElement.innerHTML = "<div style='text-align:center; color:#666;'>Hozircha vazifalar yo'q</div>";
    }
  }).catch(error => {
    console.error("❌ Vazifalarni yuklashda xato:", error);
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
      const taskReward = parseInt(prompt("Vazifa mukofoti (coin):") || "100");
      if (taskName) {
        const tasksRef = ref(db, "globalCustomTasks");
        push(tasksRef, { name: taskName, reward: taskReward })
          .then(() => {
            alert("➕ Vazifa qo'shildi!");
            displayTasks(); // Real vaqtda yangilash
          })
          .catch(error => {
            console.error("❌ Vazifa qo'shishda xato:", error);
            alert("❌ Vazifa qo'shishda xato yuz berdi!");
          });
      }
      break;
    case "removeTask":
      const removeId = prompt("O'chiriladigan vazifa ID:");
      if (removeId) {
        const taskRef = ref(db, "globalCustomTasks/" + removeId);
        remove(taskRef)
          .then(() => {
            alert("➖ Vazifa o'chirildi!");
            displayTasks(); // Real vaqtda yangilash
          })
          .catch(error => {
            console.error("❌ Vazifa o'chirishda xato:", error);
            alert("❌ Vazifa o'chirishda xato yuz berdi!");
          });
      }
      break;
    case "editTask":
      const editId = prompt("Tahrir qilinadigan vazifa ID:");
      const newName = prompt("Yangi nom:");
      const newReward = parseInt(prompt("Yangi mukofot:") || "100");
      if (editId && newName) {
        const editRef = ref(db, "globalCustomTasks/" + editId);
        update(editRef, { name: newName, reward: newReward })
          .then(() => {
            alert("✏️ Vazifa yangilandi!");
            displayTasks(); // Real vaqtda yangilash
          })
          .catch(error => {
            console.error("❌ Vazifa yangilashda xato:", error);
            alert("❌ Vazifa yangilashda xato yuz berdi!");
          });
      }
      break;
    case "viewTasks":
      displayTasks(); // Vazifalarni ko'rsatish
      break;
    default:
      alert("⚠️ Noma'lum action: " + action);
  }
}

// 🔗 Event listenerlar
document.getElementById("tab-tap").addEventListener("click", () => showSection("tap"));
document.getElementById("tab-leaderboard").addEventListener("click", () => { 
  showSection("leaderboard"); 
  loadLeaderboard("coins"); 
});
document.getElementById("tab-admin").addEventListener("click", () => { 
  showSection("admin"); 
  displayTasks(); // Admin bo'limiga kirganda vazifalarni ko'rsatish
});

document.getElementById("tapButton").addEventListener("click", tapCoin);
document.getElementById("btn-leaderboard-coins").addEventListener("click", () => loadLeaderboard("coins"));
document.getElementById("btn-leaderboard-referrals").addEventListener("click", () => loadLeaderboard("referrals"));

document.querySelectorAll("#adminSection button").forEach(btn => {
  btn.addEventListener("click", () => adminAction(btn.dataset.action));
});
