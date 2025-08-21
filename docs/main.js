import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getDatabase, ref, set, get, push, update, remove, onValue, onChildAdded, onChildRemoved, onChildChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDShZAo9lg-SxpQViCT27uXVni1UK7TGYU",
  authDomain: "dragon-92897.firebaseapp.com",
  databaseURL: "https://dragon-92897-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dragon-92897",
  storageBucket: "dragon-92897.firebasestorage.app",
  messagingSenderId: "40351345340",
  appId: "1:40351345340:web:632388a9b45d3c7905feb9"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let CURRENT_UID = null;

// 🔐 Login
signInAnonymously(auth).then(() => console.log("✅ Login anonymous")).catch(console.error);

// 📌 DOM eventlar
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("tab-tap").addEventListener("click", () => showSection("tap"));
  document.getElementById("tab-leaderboard").addEventListener("click", () => {
    showSection("leaderboard"); startLeaderboard("coins");
  });
  document.getElementById("tab-admin").addEventListener("click", () => showSection("admin"));
  document.getElementById("tapButton").addEventListener("click", tapCoin);
  document.getElementById("btn-leaderboard-coins").addEventListener("click", () => startLeaderboard("coins"));
  document.getElementById("btn-leaderboard-referrals").addEventListener("click", () => startLeaderboard("referrals"));
  document.querySelectorAll("#adminSection button").forEach(btn => btn.addEventListener("click", () => adminAction(btn.dataset.action)));
});

// 🔐 User
onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  CURRENT_UID = user.uid;
  console.log("👤 UID:", CURRENT_UID);

  const meRef = ref(db, `players/${CURRENT_UID}`);
  const meSnap = await get(meRef);
  if (!meSnap.exists()) {
    await set(meRef, { name: "Dragon Miner", coins: 0, level: 1, referrals: 0, refClaimed: true });
  }

  await handleReferralOnce(CURRENT_UID);

  listenGlobalTasks();
  startLeaderboard("coins");
});

// 📋 Vazifalar (real-time)
function listenGlobalTasks() {
  const list = document.getElementById("customTasksList");
  list.innerHTML = "";

  const tasksRef = ref(db, "globalTasks");

  onChildAdded(tasksRef, (snap) => {
    const t = snap.val(); const id = snap.key;
    const el = document.createElement("div");
    el.id = "task-" + id; el.className = "condition-item";
    el.innerHTML = `<div class="condition-text">${t.name}</div><div class="condition-reward">+${t.reward} DRC</div>`;
    list.appendChild(el);
  });

  onChildRemoved(tasksRef, (snap) => {
    const el = document.getElementById("task-" + snap.key);
    if (el) el.remove();
  });

  onChildChanged(tasksRef, (snap) => {
    const t = snap.val(); const el = document.getElementById("task-" + snap.key);
    if (el) {
      el.querySelector(".condition-text").textContent = t.name;
      el.querySelector(".condition-reward").textContent = "+" + t.reward + " DRC";
    }
  });
}

// 📊 Reyting
function startLeaderboard(type) {
  const list = document.getElementById("leaderboardList");
  const playersRef = ref(db, "players");

  onValue(playersRef, (snap) => {
    if (!snap.exists()) { list.innerHTML = "No players"; return; }
    let players = Object.entries(snap.val()).map(([uid, p]) => ({ uid, ...p }));

    if (type === "referrals") players.sort((a,b) => (b.referrals||0) - (a.referrals||0));
    else players.sort((a,b) => (b.coins||0) - (a.coins||0));

    list.innerHTML = players.map((p,i)=>`
      <div class="leaderboard-item">
        <span class="rank">#${i+1}</span>
        <span class="name">${p.name}</span>
        <span class="score">${type==="referrals"? (p.referrals||0):(p.coins||0)}</span>
      </div>
    `).join("");
  });
}

// 🔗 Referral (bir marta)
async function handleReferralOnce(uid) {
  const meRef = ref(db, `players/${uid}`);
  const meSnap = await get(meRef);
  const me = meSnap.val()||{};
  if (me.refClaimed) return;

  const urlParams = new URLSearchParams(window.location.search);
  const refId = urlParams.get("ref");
  if (!refId || refId===uid) { await update(meRef,{refClaimed:true}); return; }

  const refRef = ref(db, `players/${refId}`);
  const refSnap = await get(refRef);
  if (refSnap.exists()) {
    const r = refSnap.val();
    await update(refRef, { referrals:(r.referrals||0)+1, coins:(r.coins||0)+100 });
    await update(meRef, { refererId:refId, refClaimed:true });
  } else {
    await update(meRef, { refClaimed:true });
  }
}

// 🛠 Admin
function adminAction(action) {
  switch(action){
    case "addCoins": {
      const id=prompt("UID:"); const amt=parseInt(prompt("Coins:"),10);
      if(!id||!amt) return;
      const r=ref(db,"players/"+id);
      get(r).then(s=>{ if(!s.exists()) return alert("❌ Topilmadi");
        update(r,{coins:(s.val().coins||0)+amt}); alert("✅ Qo‘shildi");});
      break;
    }
    case "resetPlayer": {
      const id=prompt("UID:"); if(!id) return;
      set(ref(db,"players/"+id),{name:"Dragon Miner",coins:0,level:1,referrals:0,refClaimed:true});
      break;
    }
    case "addTask": {
      const name=prompt("Vazifa nomi:"); if(!name) return;
      push(ref(db,"globalTasks"),{name,reward:100}); break;
    }
    case "removeTask": {
      const id=prompt("Vazifa ID:"); if(!id) return;
      remove(ref(db,"globalTasks/"+id)); break;
    }
    case "editTask": {
      const id=prompt("ID:"); const name=prompt("Yangi nom:"); if(!id||!name) return;
      update(ref(db,"globalTasks/"+id),{name}); break;
    }
    case "viewTasks": {
      get(ref(db,"globalTasks")).then(s=>console.log("📋 Vazifalar:",s.val())); break;
    }
  }
}

// 🔄 UI
function showSection(id) {
  document.querySelectorAll(".section").forEach(s=>s.style.display="none");
  if(id==="tap") document.getElementById("tapSection").style.display="block";
  if(id==="leaderboard") document.getElementById("leaderboardSection").style.display="block";
  if(id==="admin") document.getElementById("adminSection").style.display="block";
}
function tapCoin(){ alert("🐉 Coin tapped!"); }
