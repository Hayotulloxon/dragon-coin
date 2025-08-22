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

let app, database, auth, currentUser = null;
let leaderboardListener = null;
let playerDataListener = null;
let tasksListener = null;

function initializeFirebase() {
  try {
    app = initializeApp(firebaseConfig);
    getAnalytics(app);
    database = getDatabase(app);
    auth = getAuth(app);

    signInAnonymously(auth)
      .then(() => console.log("✅ Logged in"))
      .catch(e => showError("Login error: " + e.message));

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        await initializePlayer(user);

        const isAdmin = await checkAdminStatus(user.uid);
        if (isAdmin) {
          document.getElementById("adminTab").style.display = "inline-block";
          loadAdminTasks(); // Admin uchun vazifalarni yuklash
        }
        loadTasks(); // Har bir user uchun tasklar
      } else {
        currentUser = null;
        clearAllListeners();
      }
    });
  } catch (error) {
    showError("Firebase error: " + error.message);
  }
}

// ✅ Admin tekshiruvi
async function checkAdminStatus(uid) {
  try {
    const adminRef = ref(database, `admins/${uid}`);
    const snapshot = await get(adminRef);
    return snapshot.exists() && snapshot.val() === true;
  } catch (error) {
    return false;
  }
}

// ✅ Yangi foydalanuvchi yaratish
async function initializePlayer(user) {
  const playerRef = ref(database, "players/" + user.uid);
  const snapshot = await get(playerRef);

  if (!snapshot.exists()) {
    await set(playerRef, {
      name: "Dragon Miner",
      coins: 0,
      taps: 0,
      level: 1,
      referrals: 0,
      createdAt: Date.now()
    });
  }
  setupPlayerDataListener(user.uid);
}

// ✅ Foydalanuvchi ma'lumotlarini real-time kuzatish
function setupPlayerDataListener(userId) {
  if (playerDataListener) off(playerDataListener);

  const playerRef = ref(database, "players/" + userId);
  playerDataListener = onValue(playerRef, (snap) => {
    if (snap.exists()) updatePlayerDisplayUI(snap.val());
  });
}

function updatePlayerDisplayUI(playerData) {
  document.getElementById("balance").textContent = playerData.coins || 0;
  document.getElementById("level").textContent = playerData.level || 1;
  document.getElementById("referralCount").textContent = playerData.referrals || 0;
  document.getElementById("totalTaps").textContent = playerData.taps || 0;
}

// ✅ Coin bosish
async function tapCoin() {
  if (!currentUser) return showError("Wait for login");

  const playerRef = ref(database, "players/" + currentUser.uid);
  const snap = await get(playerRef);

  if (snap.exists()) {
    const data = snap.val();
    await update(playerRef, {
      coins: (data.coins || 0) + 1,
      taps: (data.taps || 0) + 1
    });
  }
}

// ✅ Vazifalarni yuklash (user ko‘radi)
function loadTasks() {
  const taskList = document.getElementById("taskList");
  const taskRef = ref(database, "globalCustomTasks");

  if (tasksListener) off(tasksListener);
  tasksListener = onValue(taskRef, (snap) => {
    if (snap.exists()) {
      const tasks = snap.val();
      taskList.innerHTML = Object.keys(tasks).map(id => {
        const t = tasks[id];
        if (t.status === "active") {
          return `
            <div class="task">
              <p><strong>${t.name}</strong> - Reward: ${t.reward} 🪙</p>
              <button onclick="completeTask('${id}', ${t.reward})">Complete</button>
            </div>
          `;
        }
        return "";
      }).join("");
    } else {
      taskList.innerHTML = "<p>No active tasks</p>";
    }
  });
}

// ✅ Vazifa bajarish
async function completeTask(taskId, reward) {
  if (!currentUser) return;

  const playerRef = ref(database, "players/" + currentUser.uid);
  const snap = await get(playerRef);

  if (snap.exists()) {
    const data = snap.val();
    await update(playerRef, { coins: (data.coins || 0) + reward });
    alert("Task completed! +" + reward + " coins");
  }
}

// ✅ Admin uchun vazifalarni ko‘rish va boshqarish
function loadAdminTasks() {
  const adminTaskList = document.getElementById("adminTaskList");
  const taskRef = ref(database, "globalCustomTasks");

  onValue(taskRef, (snap) => {
    if (snap.exists()) {
      const tasks = snap.val();
      adminTaskList.innerHTML = Object.keys(tasks).map(id => {
        const t = tasks[id];
        return `
          <div class="task-admin">
            <p>${t.name} (${t.status}) - Reward: ${t.reward}</p>
            <button onclick="deleteTask('${id}')">Delete</button>
          </div>
        `;
      }).join("");
    } else {
      adminTaskList.innerHTML = "<p>No tasks yet</p>";
    }
  });
}

// ✅ Admin yangi vazifa qo‘shishi
async function addTask() {
  const name = document.getElementById("taskName").value;
  const reward = parseInt(document.getElementById("taskReward").value);
  if (!name || !reward) return alert("Fill all fields");

  const taskRef = ref(database, "globalCustomTasks");
  const newTaskRef = push(taskRef);

  await set(newTaskRef, {
    name: name,
    reward: reward,
    status: "active",
    createdAt: Date.now(),
    createdBy: currentUser.uid
  });

  document.getElementById("taskName").value = "";
  document.getElementById("taskReward").value = "";
  alert("Task added!");
}

// ✅ Vazifani o‘chirish
async function deleteTask(taskId) {
  await remove(ref(database, "globalCustomTasks/" + taskId));
  alert("Task deleted");
}

// ✅ Reyting
function showLeaderboard(type = "coins") {
  if (leaderboardListener) off(leaderboardListener);

  const list = document.getElementById("leaderboardList");
  const playersRef = ref(database, "players");

  leaderboardListener = onValue(playersRef, (snap) => {
    if (snap.exists()) {
      const data = snap.val();
      let players = Object.keys(data).map(id => ({ id, ...data[id] }));

      // Duplicate oldini olish
      const seen = new Set();
      players = players.filter(p => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });

      players.sort((a, b) => (b[type] || 0) - (a[type] || 0));
      const top = players.slice(0, 50);

      list.innerHTML = top.map((p, i) => `
        <div class="leaderboard-item ${p.id === currentUser?.uid ? 'me' : ''}">
          #${i + 1} ${p.name} - ${type === "coins" ? p.coins : p.referrals}
        </div>
      `).join("");
    } else {
      list.innerHTML = "<p>No data yet</p>";
    }
  });
}

function clearAllListeners() {
  if (leaderboardListener) off(leaderboardListener);
  if (playerDataListener) off(playerDataListener);
  if (tasksListener) off(tasksListener);
}

window.tapCoin = tapCoin;
window.showLeaderboard = showLeaderboard;
window.addTask = addTask;
window.deleteTask = deleteTask;
window.completeTask = completeTask;

initializeFirebase();
