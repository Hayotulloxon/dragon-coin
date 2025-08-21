import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-analytics.js";
import { getDatabase, ref, set, get, push, update, remove, onValue, off } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
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

// Global o'zgaruvchilar
let app, database, auth, currentUser = null;
let leaderboardListener = null;
let tasksListener = null;
let playerDataListener = null;
let taskSettingsListener = null;

// Firebase initializatsiyasi
function initializeFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    getAnalytics(app);
    database = getDatabase(app);
    auth = getAuth(app);
    
    console.log("✅ Firebase muvaffaqiyatli ishga tushirildi");
    
    // Anonymous login
    signInAnonymously(auth)
      .then(() => {
        console.log("✅ Anonymous login muvaffaqiyatli");
      })
      .catch((error) => {
        console.error("❌ Login xatosi:", error.message);
        showError("Tizimga kirish xatosi: " + error.message);
      });

    // Auth state o'zgarishlarini kuzatish
    onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("👤 Foydalanuvchi tizimga kirdi:", user.uid);
        currentUser = user;
        initializePlayer(user);
      } else {
        console.log("👤 Foydalanuvchi tizimdan chiqdi");
        currentUser = null;
        clearAllListeners();
      }
    });
    
  } catch (error) {
    console.error("❌ Firebase initializatsiya xatosi:", error);
    showError("Firebase ulanish xatosi: " + error.message);
  }
}

// Foydalanuvchi ma'lumotlarini yaratish/yangilash
async function initializePlayer(user) {
  try {
    const playerRef = ref(database, "players/" + user.uid);
    const snapshot = await get(playerRef);
    
    if (!snapshot.exists()) {
      await set(playerRef, { 
        name: "Dragon Miner", 
        coins: 0, 
        level: 1, 
        referrals: 0,
        createdAt: Date.now()
      });
      console.log("✅ Yangi player yaratildi");
    } else {
      console.log("✅ Mavjud player topildi");
    }
    
    setupPlayerDataListener(user.uid);
    
  } catch (error) {
    console.error("❌ Player initializatsiya xatosi:", error);
    showError("Foydalanuvchi ma'lumotlarini yuklashda xato");
  }
}

// Real-time player data listener
function setupPlayerDataListener(userId) {
  if (playerDataListener) {
    off(playerDataListener);
  }
  
  const playerRef = ref(database, "players/" + userId);
  playerDataListener = onValue(playerRef, (snapshot) => {
    if (snapshot.exists()) {
      const playerData = snapshot.val();
      updatePlayerDisplayUI(playerData);
      console.log("🔄 Player data real-time yangilandi:", playerData.coins);
    }
  }, (error) => {
    console.error("❌ Player data listener xatosi:", error);
    showError("Ma'lumotlar yangilanishida xato");
  });
  
  console.log("✅ Player data real-time listener o'rnatildi");
}

// UI ni yangilash
function updatePlayerDisplayUI(playerData) {
  try {
    const coinsElement = document.getElementById("playerCoins");
    const levelElement = document.getElementById("playerLevel");
    const referralsElement = document.getElementById("playerReferrals");
    
    if (coinsElement) coinsElement.textContent = playerData.coins || 0;
    if (levelElement) levelElement.textContent = playerData.level || 1;
    if (referralsElement) referralsElement.textContent = playerData.referrals || 0;
    
    console.log("🔄 Player UI yangilandi:", playerData.coins);
  } catch (error) {
    console.error("❌ Player UI yangilashda xato:", error);
  }
}

// Barcha listenerlarni tozalash
function clearAllListeners() {
  if (leaderboardListener) {
    off(leaderboardListener);
    leaderboardListener = null;
    console.log("🔇 Leaderboard listener o'chirildi");
  }
  
  if (tasksListener) {
    off(tasksListener);
    tasksListener = null;
    console.log("🔇 Tasks listener o'chirildi");
  }
  
  if (playerDataListener) {
    off(playerDataListener);
    playerDataListener = null;
    console.log("🔇 Player data listener o'chirildi");
  }
  
  if (taskSettingsListener) {
    off(taskSettingsListener);
    taskSettingsListener = null;
    console.log("🔇 Task settings listener o'chirildi");
  }
}

function showError(message) {
  let errorDiv = document.getElementById("errorMessage");
  if (!errorDiv) {
    errorDiv = document.createElement("div");
    errorDiv.id = "errorMessage";
    errorDiv.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: #ff4444; color: white; padding: 10px 20px;
      border-radius: 5px; z-index: 1000; display: none;
    `;
    document.body.appendChild(errorDiv);
  }
  
  errorDiv.textContent = message;
  errorDiv.style.display = "block";
  
  setTimeout(() => {
    errorDiv.style.display = "none";
  }, 5000);
}

// Section ko'rsatish funksiyasi
function showSection(id) {
  try {
    document.querySelectorAll(".section").forEach(sec => {
      sec.style.display = "none";
    });
    
    const targetSection = document.getElementById(id + "Section");
    if (targetSection) {
      targetSection.style.display = "block";
      console.log("✅ Section ko'rsatildi:", id);
    } else {
      console.error("❌ Section topilmadi:", id + "Section");
    }
  } catch (error) {
    console.error("❌ Section ko'rsatishda xato:", error);
  }
}

// Coin tap funksiyasi
async function tapCoin() {
  if (!currentUser) {
    showError("Iltimos, tizimga kirish kutilsin");
    return;
  }
  
  try {
    const playerRef = ref(database, "players/" + currentUser.uid);
    const snapshot = await get(playerRef);
    
    if (snapshot.exists()) {
      const playerData = snapshot.val();
      const newCoins = (playerData.coins || 0) + 1;
      
      await update(playerRef, { coins: newCoins });
      
      // Animatsiya
      const tapButton = document.getElementById("tapButton");
      if (tapButton) {
        tapButton.style.transform = "scale(0.95)";
        setTimeout(() => {
          tapButton.style.transform = "scale(1)";
        }, 100);
      }
      
      console.log("🐉 Coin tapped! Yangi coins:", newCoins);
    }
  } catch (error) {
    console.error("❌ Coin tap xatosi:", error);
    showError("Coin tap xatosi");
  }
}

// Real-time Leaderboard (tuzatilgan)
function loadLeaderboard(type = "coins") {
  try {
    console.log("🔄 Real-time leaderboard o'rnatilmoqda:", type);
    
    if (leaderboardListener) {
      off(leaderboardListener);
    }
    
    let list = document.getElementById("leaderboardList");
    if (!list) {
      const leaderboardSection = document.getElementById("leaderboardSection");
      if (leaderboardSection) {
        const listDiv = document.createElement("div");
        listDiv.id = "leaderboardList";
        listDiv.style.cssText = `
          max-height: 400px; 
          overflow-y: auto; 
          border: 1px solid #333; 
          padding: 10px; 
          margin: 10px 0; 
          background: #1a1a1a;
          border-radius: 8px;
        `;
        leaderboardSection.appendChild(listDiv);
        list = listDiv;
      }
    }
    
    if (!list) return;
    
    list.innerHTML = "<div style='text-align:center; color:#666; padding:20px;'>🔄 Real-time ma'lumotlar yuklanmoqda...</div>";
    
    const playersRef = ref(database, "players");
    leaderboardListener = onValue(playersRef, (snapshot) => {
      try {
        if (snapshot.exists()) {
          const data = snapshot.val();
          let players = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
          
          // Sorting
          if (type === "coins") {
            players.sort((a, b) => (b.coins || 0) - (a.coins || 0));
          } else if (type === "referrals") {
            players.sort((a, b) => (b.referrals || 0) - (a.referrals || 0));
          }
          
          players = players.slice(0, 50);
          
          list.innerHTML = `
            <div style='text-align:center; color:#0f0; font-size:12px; margin-bottom:10px;'>
              🟢 Real-time yangilanmoqda
            </div>
            ${players.map((p, i) => {
              const isCurrentUser = currentUser && p.id === currentUser.uid;
              const backgroundColor = isCurrentUser ? "#2a2a2a" : "transparent";
              
              return `
                <div style='
                  padding: 12px; 
                  border-bottom: 1px solid #333; 
                  color: #fff;
                  background: ${backgroundColor};
                  border-radius: 4px;
                  margin-bottom: 2px;
                  transition: background-color 0.3s ease;
                '>
                  <span style='color: #ffd700; font-weight: bold;'>#${i+1}</span> - 
                  <span style='color: #00ff00;'>${p.name || 'Dragon Miner'}</span> 
                  <span style='color: #00bfff; float: right;'>
                    ${type === "coins" ? (p.coins || 0) + " 🪙" : (p.referrals || 0) + " 👥"}
                  </span>
                  ${isCurrentUser ? '<span style="color: #ff6b6b; font-size: 12px;"> (Siz)</span>' : ''}
                </div>
              `;
            }).join("")}
          `;
          
          console.log("✅ Real-time leaderboard yangilandi, players:", players.length);
        } else {
          list.innerHTML = "<div style='padding:20px; text-align:center; color:#666;'>Hozircha ma'lumot yo'q</div>";
        }
      } catch (error) {
        console.error("❌ Leaderboard listener ichida xato:", error);
        list.innerHTML = "<div style='padding:20px; text-align:center; color:red;'>Xato yuz berdi</div>";
      }
    }, (error) => {
      console.error("❌ Leaderboard listener xatosi:", error);
      const list = document.getElementById("leaderboardList");
      if (list) {
        list.innerHTML = "<div style='padding:20px; text-align:center; color:red;'>Ma'lumotlarni yuklashda xato</div>";
      }
    });
    
  } catch (error) {
    console.error("❌ Leaderboard o'rnatishda xato:", error);
  }
}

// Real-time Tasks Display (tuzatilgan)
function displayTasks() {
  try {
    if (tasksListener) {
      off(tasksListener);
    }
    
    let tasksList = document.getElementById("tasksList");
    
    if (!tasksList) {
      const adminSection = document.getElementById("adminSection");
      if (adminSection) {
        const tasksDiv = document.createElement("div");
        tasksDiv.innerHTML = `
          <h3 style="margin-top:20px; color: #fff;">📋 Mavjud Vazifalar:</h3>
          <div id="tasksList" style="
            max-height:300px; 
            overflow-y:auto; 
            border:1px solid #333; 
            padding:10px; 
            margin:10px 0;
            background:#1a1a1a;
            border-radius:8px;
          "></div>
        `;
        adminSection.appendChild(tasksDiv);
        tasksList = document.getElementById("tasksList");
      }
    }
    
    if (!tasksList) return;
    
    tasksList.innerHTML = "<div style='text-align:center; color:#666; padding:10px;'>🔄 Real-time vazifalar yuklanmoqda...</div>";
    
    const tasksRef = ref(database, "globalCustomTasks");
    
    tasksListener = onValue(tasksRef, (snapshot) => {
      try {
        if (snapshot.exists()) {
          const tasks = snapshot.val();
          const taskCount = Object.keys(tasks).length;
          const currentTime = Date.now();
          
          tasksList.innerHTML = `
            <div style='text-align:center; color:#0f0; font-size:12px; margin-bottom:10px;'>
              🟢 ${taskCount} ta vazifa (Real-time)
            </div>
            ${Object.keys(tasks).map(key => {
              const task = tasks[key];
              const createdTime = task.createdAt || 0;
              const isNew = (currentTime - createdTime) < 10000;
              
              return `
                <div style='
                  padding:12px; 
                  border-bottom:1px solid #444; 
                  display:flex; 
                  justify-content:space-between;
                  align-items:center;
                  color: #fff;
                  background: ${isNew ? '#1e4d2b' : 'transparent'};
                  border-radius: 4px;
                  margin-bottom: 4px;
                  transition: all 0.3s ease;
                  ${isNew ? 'border-left: 3px solid #00ff00; animation: taskGlow 2s ease-in-out;' : ''}
                '>
                  <div>
                    <div style="display:flex; align-items:center;">
                      <span>🎯 ${task.name}</span>
                      ${isNew ? '<span style="color:#0f0; font-size:10px; margin-left:8px; animation: pulse 1s infinite;">YANGI!</span>' : ''}
                    </div>
                    <div style="font-size:12px; color:#00bfff; margin-top:4px;">
                      💰 ${task.reward || 100} coin mukofot
                    </div>
                    ${task.createdAt ? `<div style="font-size:10px; color:#666; margin-top:2px;">
                      📅 ${new Date(task.createdAt).toLocaleString()}
                    </div>` : ''}
                  </div>
                  <div style="text-align:right;">
                    <div style='font-size:10px; color:#666;'>ID: ${key.substring(0, 8)}...</div>
                    ${task.createdBy ? `<div style='font-size:9px; color:#888; margin-top:2px;'>
                      👤 ${task.createdBy.substring(0, 8)}...
                    </div>` : ''}
                  </div>
                </div>
              `;
            }).join("")}
          `;
          
          console.log("✅ Vazifalar DARHOL yangilandi:", taskCount);
          
        } else {
          tasksList.innerHTML = `
            <div style='text-align:center; color:#0f0; font-size:12px; margin-bottom:10px;'>
              🟢 Real-time aktiv
            </div>
            <div style='text-align:center; color:#666; padding:20px;'>Hozircha vazifalar yo'q</div>
          `;
        }
      } catch (error) {
        console.error("❌ Tasks listener ichida xato:", error);
        tasksList.innerHTML = "<div style='text-align:center; color:red; padding:10px;'>Xato yuz berdi</div>";
      }
    }, (error) => {
      console.error("❌ Tasks listener xatosi:", error);
      const tasksList = document.getElementById("tasksList");
      if (tasksList) {
        tasksList.innerHTML = "<div style='text-align:center; color:red; padding:10px;'>Ma'lumotlarni yuklashda xato</div>";
      }
    });
    
  } catch (error) {
    console.error("❌ Vazifalar listenerini o'rnatishda xato:", error);
  }
}

// Admin actions (tuzatilgan)
async function adminAction(action) {
  if (!currentUser) {
    showError("Admin funksiyalari uchun tizimga kirish kerak");
    return;
  }

  try {
    switch(action) {
      case "addCoins":
        const targetId = prompt("O'yinchi UID kiriting:");
        const amount = parseInt(prompt("Nechta coin qo'shilsin?"));
        
        if (targetId && !isNaN(amount) && amount > 0) {
          const playerRef = ref(database, "players/" + targetId);
          const snap = await get(playerRef);
          
          if (snap.exists()) {
            const data = snap.val();
            const newCoins = (data.coins || 0) + amount;
            await update(playerRef, { coins: newCoins });
            alert("💰 " + amount + " coin qo'shildi!");
          } else {
            alert("❌ O'yinchi topilmadi!");
          }
        } else {
          alert("❌ Noto'g'ri ma'lumot kiritildi");
        }
        break;

      case "resetPlayer":
        const resetId = prompt("O'yinchi UID kiriting:");
        if (resetId && confirm("Rostdan ham bu o'yinchini qayta tiklaysizmi?")) {
          const resetRef = ref(database, "players/" + resetId);
          await set(resetRef, { 
            name: "Dragon Miner", 
            coins: 0, 
            level: 1, 
            referrals: 0,
            resetAt: Date.now()
          });
          alert("🔄 O'yinchi qayta tiklandi!");
        }
        break;

      case "addTask":
        const taskName = prompt("Yangi vazifa nomi:");
        const taskReward = parseInt(prompt("Vazifa mukofoti (coin):") || "100");
        
        if (taskName && !isNaN(taskReward) && taskReward > 0) {
          const tasksRef = ref(database, "globalCustomTasks");
          const newTaskRef = await push(tasksRef, { 
            name: taskName, 
            reward: taskReward,
            createdAt: Date.now(),
            createdBy: currentUser.uid
          });
          
          // Success feedback with better animation
          const successMsg = document.createElement('div');
          successMsg.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: linear-gradient(45deg, #00ff00, #00aa00); 
            color: white; padding: 20px 30px; border-radius: 15px; 
            z-index: 10000; font-size: 18px; font-weight: bold;
            box-shadow: 0 8px 32px rgba(0,255,0,0.3);
            animation: successBounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
          `;
          successMsg.innerHTML = `
            ✅ Vazifa qo'shildi!<br>
            <div style="font-size:14px; margin-top:5px;">📋 "${taskName}" - 💰${taskReward} coin</div>
            <div style="font-size:12px; color:#ccc; margin-top:5px;">🔄 DARHOL ko'rsatiladi</div>
          `;
          
          document.body.appendChild(successMsg);
          setTimeout(() => {
            successMsg.remove();
          }, 4000);
          
          console.log("➕ Yangi vazifa qo'shildi:", taskName, "ID:", newTaskRef.key);
          
        } else {
          alert("❌ Noto'g'ri ma'lumot kiritildi");
        }
        break;

      case "removeTask":
        const removeId = prompt("O'chiriladigan vazifa ID (to'liq):");
        if (removeId && confirm("Rostdan ham bu vazifani o'chirasizmi?")) {
          const taskRef = ref(database, "globalCustomTasks/" + removeId);
          await remove(taskRef);
          
          // Success feedback
          const removeMsg = document.createElement('div');
          removeMsg.style.cssText = `
            position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            background: linear-gradient(45deg, #ff4444, #aa0000); 
            color: white; padding: 20px 30px; border-radius: 15px; 
            z-index: 10000; font-size: 18px; font-weight: bold;
            box-shadow: 0 8px 32px rgba(255,68,68,0.3);
            animation: removeBounce 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
          `;
          removeMsg.innerHTML = `
            🗑️ Vazifa o'chirildi!<br>
            <div style="font-size:12px; color:#ffccc; margin-top:5px;">🔄 DARHOL yangilanadi</div>
          `;
          
          document.body.appendChild(removeMsg);
          setTimeout(() => {
            removeMsg.remove();
          }, 3000);
          
          console.log("➖ Vazifa o'chirildi:", removeId);
        }
        break;

      case "viewTasks":
        displayTasks();
        break;

      default:
        console.warn("⚠️ Noma'lum action:", action);
    }
  } catch (error) {
    console.error("❌ Admin action xatosi:", error);
    alert("❌ Xato yuz berdi: " + error.message);
  }
}

// Event listenerlarni o'rnatish
function setupEventListeners() {
  console.log("🔗 Event listenerlar o'rnatilmoqda...");

  // Navigation tabs
  const tabTap = document.getElementById("tab-tap");
  const tabLeaderboard = document.getElementById("tab-leaderboard");
  const tabAdmin = document.getElementById("tab-admin");

  if (tabTap) {
    tabTap.addEventListener("click", () => showSection("tap"));
    console.log("✅ Tab Tap listener qo'shildi");
  }

  if (tabLeaderboard) {
    tabLeaderboard.addEventListener("click", async () => { 
      showSection("leaderboard");
      setTimeout(() => {
        loadLeaderboard("coins");
      }, 100); // Kichikroq delay
    });
    console.log("✅ Tab Leaderboard listener qo'shildi");
  }

  if (tabAdmin) {
    tabAdmin.addEventListener("click", async () => { 
      showSection("admin");
      setTimeout(() => {
        displayTasks(); // Darhol tasks ko'rsatish
      }, 50);
    });
    console.log("✅ Tab Admin listener qo'shildi");
  }

  // Tap button
  const tapButton = document.getElementById("tapButton");
  if (tapButton) {
    tapButton.addEventListener("click", tapCoin);
    console.log("✅ Tap button listener qo'shildi");
  }

  // Leaderboard buttons
  const btnCoins = document.getElementById("btn-leaderboard-coins");
  const btnReferrals = document.getElementById("btn-leaderboard-referrals");

  if (btnCoins) {
    btnCoins.addEventListener("click", () => loadLeaderboard("coins"));
    console.log("✅ Coins button listener qo'shildi");
  }

  if (btnReferrals) {
    btnReferrals.addEventListener("click", () => loadLeaderboard("referrals"));
    console.log("✅ Referrals button listener qo'shildi");
  }

  // Admin buttons
  const adminButtons = document.querySelectorAll("#adminSection button[data-action]");
  console.log("🔧 Admin buttons topildi:", adminButtons.length);

  adminButtons.forEach(btn => {
    const action = btn.dataset.action;
    if (action) {
      btn.addEventListener("click", () => adminAction(action));
      console.log("✅ Admin button listener qo'shildi:", action);
    }
  });
}

// DOM yuklangandan keyin ishga tushirish
document.addEventListener("DOMContentLoaded", function() {
  console.log("🚀 DOM yuklandi, ilovani ishga tushiryapman...");
  
  // CSS animatsiyalarni qo'shish
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.5; }
      100% { opacity: 1; }
    }
    @keyframes successBounce {
      0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
      50% { transform: translate(-50%, -50%) scale(1.05); }
      70% { transform: translate(-50%, -50%) scale(0.9); }
      100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    }
    @keyframes removeBounce {
      0% { transform: translate(-50%, -50%) scale(0.3); opacity: 0; }
      50% { transform: translate(-50%, -50%) scale(1.05); }
      70% { transform: translate(-50%, -50%) scale(0.9); }
      100% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
    }
    @keyframes taskGlow {
      0% { box-shadow: 0 0 5px rgba(0,255,0,0.3); }
      50% { box-shadow: 0 0 20px rgba(0,255,0,0.6); }
      100% { box-shadow: 0 0 5px rgba(0,255,0,0.3); }
    }
  `;
  document.head.appendChild(style);
  
  // Firebase ni ishga tushirish
  initializeFirebase();
  
  // Event listenerlarni o'rnatish
  setupEventListeners();
  
  console.log("✅ Ilova muvaffaqiyatli ishga tushdi");
});

// Window error handlers
window.addEventListener('error', function(e) {
  console.error('❌ Global xato:', e.error);
  showError('Kutilmagan xato yuz berdi');
});

window.addEventListener('unhandledrejection', function(e) {
  console.error('❌ Unhandled promise rejection:', e.reason);
  showError('Ma\'lumotlarni yuklashda xato');
  e.preventDefault();
});

window.addEventListener('beforeunload', function() {
  clearAllListeners();
  console.log("🔇 Barcha listenerlar tozalandi");
});
