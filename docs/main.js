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

// Global variables
let app, database, auth, currentUser = null;
let leaderboardListener = null;
let tasksListener = null;
let playerDataListener = null;
let taskSettingsListener = null;

// Firebase initialization
function initializeFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    getAnalytics(app);
    database = getDatabase(app);
    auth = getAuth(app);
    
    console.log("✅ Firebase initialized");
    
    signInAnonymously(auth)
      .then(() => console.log("✅ Anonymous login successful"))
      .catch((error) => {
        console.error("❌ Login error:", error.message);
        showError("Login error: " + error.message);
      });

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        console.log("👤 User logged in:", user.uid);
        currentUser = user;
        await initializePlayer(user);
        
        const isAdmin = await checkAdminStatus(user.uid);
        if (isAdmin) {
          const adminTab = document.getElementById("adminTab");
          if (adminTab) {
            adminTab.style.display = "inline-block";
          }
        }
      } else {
        console.log("👤 User logged out");
        currentUser = null;
        clearAllListeners();
      }
    });
    
  } catch (error) {
    console.error("❌ Firebase initialization error:", error);
    showError("Firebase connection error: " + error.message);
  }
}

// Check admin status
async function checkAdminStatus(uid) {
  try {
    const adminRef = ref(database, `admins/${uid}`);
    const snapshot = await get(adminRef);
    return snapshot.exists() && snapshot.val() === true;
  } catch (error) {
    console.error("❌ Admin status check error:", error);
    return false;
  }
}

// Initialize player data
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
      console.log("✅ New player created");
    } else {
      console.log("✅ Existing player found");
    }
    
    setupPlayerDataListener(user.uid);
    
  } catch (error) {
    console.error("❌ Player initialization error:", error);
    showError("Error loading player data");
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
    }
  }, (error) => {
    console.error("❌ Player data listener error:", error);
  });
}

// Update UI with player data
function updatePlayerDisplayUI(playerData) {
  try {
    const coinsElement = document.getElementById("balance");
    const levelElement = document.getElementById("level");
    const referralsElement = document.getElementById("referralCount");
    
    if (coinsElement) coinsElement.textContent = playerData.coins || 0;
    if (levelElement) levelElement.textContent = playerData.level || 1;
    if (referralsElement) referralsElement.textContent = playerData.referrals || 0;
    
  } catch (error) {
    console.error("❌ UI update error:", error);
  }
}

// Clear all listeners
function clearAllListeners() {
  if (leaderboardListener) { off(leaderboardListener); leaderboardListener = null; }
  if (tasksListener) { off(tasksListener); tasksListener = null; }
  if (playerDataListener) { off(playerDataListener); playerDataListener = null; }
  if (taskSettingsListener) { off(taskSettingsListener); taskSettingsListener = null; }
}

// Show error message
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
  setTimeout(() => errorDiv.style.display = "none", 5000);
}

// Show section
function showSection(id) {
  document.querySelectorAll(".section").forEach(sec => sec.style.display = "none");
  const targetSection = document.getElementById(id + "Section");
  if (targetSection) targetSection.style.display = "block";
}

// Tap coin
async function tapCoin() {
  if (!currentUser) return showError("Please wait for login");
  
  try {
    const playerRef = ref(database, "players/" + currentUser.uid);
    const snapshot = await get(playerRef);
    
    if (snapshot.exists()) {
      const playerData = snapshot.val();
      const newCoins = (playerData.coins || 0) + 1;
      await update(playerRef, { coins: newCoins });
    }
  } catch (error) {
    console.error("❌ Tap error:", error);
  }
}

// Show leaderboard with unique players
function showLeaderboard(type = "coins") {
  if (leaderboardListener) off(leaderboardListener);
  
  const list = document.getElementById("leaderboardList");
  list.innerHTML = "<div style='text-align:center; color:#666; padding:20px;'>Loading...</div>";
  
  const playersRef = ref(database, "players");
  leaderboardListener = onValue(playersRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      let players = Object.keys(data).map(id => ({ id, ...data[id] }));
      
      // ✅ Remove duplicates
      const seen = new Set();
      players = players.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      
      // Sort by type
      if (type === "coins") players.sort((a, b) => (b.coins || 0) - (a.coins || 0));
      if (type === "referrals") players.sort((a, b) => (b.referrals || 0) - (a.referrals || 0));
      
      const topPlayers = players.slice(0, 50);
      let userRank = "-";
      if (currentUser) {
        const idx = players.findIndex(p => p.id === currentUser.uid);
        if (idx !== -1) userRank = idx + 1;
      }
      
      list.innerHTML = topPlayers.map((p, i) => `
        <div style='padding:12px; border-bottom:1px solid #333; color:#fff; ${p.id === currentUser?.uid ? "background:#2a2a2a;" : ""}'>
          <span style='color:#ffd700;'>#${i + 1}</span> - ${p.name || "Dragon Miner"}
          <span style='float:right;'>${type === "coins" ? (p.coins || 0) + " 🪙" : (p.referrals || 0) + " 👥"}</span>
          ${p.id === currentUser?.uid ? "<span style='color:#ff6b6b;'> (You)</span>" : ""}
        </div>
      `).join("");
      
      const rankElement = document.getElementById("playerRank");
      if (rankElement) rankElement.textContent = `#${userRank}`;
    } else {
      list.innerHTML = "<div style='padding:20px; text-align:center; color:#666;'>No data yet</div>";
    }
  });
}

initializeFirebase();
