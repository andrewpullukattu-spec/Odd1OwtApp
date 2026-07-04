// ─── FIREBASE IMPORTS ─────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore, doc, setDoc, updateDoc, getDoc, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCaJ-2d3r_qKcSs4aCdhvzZtjAImnZ8YM",
  authDomain: "odd1owt-ed87d.firebaseapp.com",
  projectId: "odd1owt-ed87d",
  storageBucket: "odd1owt-ed87d.appspot.com",
  messagingSenderId: "615629953512",
  appId: "1:615629953512:web:046f611961e7c1e556ec5d"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ─── PLAYER IDENTITY ──────────────────────────────────────────────────────────
const playerId = localStorage.getItem("odd1owt_pid") || crypto.randomUUID();
localStorage.setItem("odd1owt_pid", playerId);

// ─── MODULE STATE ─────────────────────────────────────────────────────────────
let roomId             = null;
let unsub              = null;
let timerInterval      = null;
let revealTimeouts     = [];   // all reveal step timeouts so we can cancel them
let revealRunning      = false;

// ─── TOAST SYSTEM — replaces all alert() calls ────────────────────────────────
function toast(msg, type = "info") {
  const container = document.getElementById("toastContainer");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function roomRef() { return doc(db, "rooms", roomId); }

function getName() {
  const typed = document.getElementById("nameInput").value.trim();
  if (typed) localStorage.setItem("odd1owt_name", typed);
  return localStorage.getItem("odd1owt_name");
}

function show(id) {
  document.querySelectorAll("section").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}
window.show = show;

function getOrder(state) {
  const players = state.players || {};
  const order   = Array.isArray(state.playerOrder) && state.playerOrder.length
    ? state.playerOrder.filter(pid => players[pid])
    : Object.keys(players);
  return order;
}

function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function fmtTime(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, m =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m])
  );
}

function clearRevealTimeouts() {
  revealTimeouts.forEach(clearTimeout);
  revealTimeouts = [];
  revealRunning = false;
  // Hide all steps
  document.querySelectorAll(".reveal-step").forEach(s => s.classList.remove("active"));
}

function revealStep(id, delay) {
  const t = setTimeout(() => {
    document.querySelectorAll(".reveal-step").forEach(s => s.classList.remove("active"));
    document.getElementById(id)?.classList.add("active");
  }, delay);
  revealTimeouts.push(t);
}

// ─── QUESTION PICKING (per-deck, no repeats) ──────────────────────────────────
function pickTwoQuestions(state) {
  const deckKey = state.activeDeck || "all";
  const deck    = DECKS[deckKey] || DECKS.all;
  const pool    = deck.questions;

  const usedKey = `usedQ_${deckKey}`;
  const lastKey = `lastQ_${deckKey}`;
  const used    = Array.isArray(state[usedKey]) ? state[usedKey] : [];

  let available = pool.map((_, i) => i).filter(i => !used.includes(i));
  if (available.length < 2) available = pool.map((_, i) => i);

  const last  = Array.isArray(state[lastKey]) ? state[lastKey] : [];
  const fresh = available.filter(i => !last.includes(i));
  if (fresh.length >= 2) available = fresh;

  const idx1      = available[Math.floor(Math.random() * available.length)];
  let   remaining = available.filter(i => i !== idx1);
  if (!remaining.length) remaining = pool.map((_, i) => i).filter(i => i !== idx1);
  const idx2 = remaining[Math.floor(Math.random() * remaining.length)];

  const currentUsed = Array.isArray(state[usedKey]) ? state[usedKey] : [];
  const nextUsed    = (currentUsed.length + 2 >= pool.length)
    ? [idx1, idx2]
    : [...new Set([...currentUsed, idx1, idx2])];

  return {
    normalQuestion: pool[idx1],
    oddQuestion:    pool[idx2],
    usedKey, nextUsed, lastKey,
    nextLast: [idx1, idx2]
  };
}

// ─── KICK PLAYER ──────────────────────────────────────────────────────────────
window.kickPlayer = async function(targetId) {
  const snap  = await getDoc(roomRef());
  if (!snap.exists()) return;
  const state = snap.data();
  if (state.hostId !== playerId) return;
  if (targetId === playerId) return toast("Can't kick yourself!", "error");

  const players = { ...state.players };
  const scores  = { ...state.scores };
  const order   = (state.playerOrder || []).filter(pid => pid !== targetId);
  const p1Votes = { ...(state.p1Votes || {}) };
  const p3Votes = { ...(state.p3Votes || {}) };

  delete players[targetId];
  delete scores[targetId];
  delete p1Votes[targetId];
  delete p3Votes[targetId];
  Object.keys(p1Votes).forEach(k => { if (p1Votes[k] === targetId) delete p1Votes[k]; });
  Object.keys(p3Votes).forEach(k => { if (p3Votes[k] === targetId) delete p3Votes[k]; });

  await updateDoc(roomRef(), { players, scores, playerOrder: order, p1Votes, p3Votes });
  toast(`${state.players[targetId]} was kicked`, "info");
};

// ─── LEAVE ROOM (self-service, works from lobby or mid-game) ─────────────────
window.leaveRoom = async function() {
  if (!roomId) { show("home"); return; }

  const ref  = roomRef();
  const snap = await getDoc(ref);

  // Block leaving mid-vote until the player has actually voted, so they
  // can't dodge a Phase 1 or Phase 3 vote by bailing out.
  if (snap.exists()) {
    const checkState = snap.data();
    if (checkState.phase === "p1_vote" && !checkState.p1Votes?.[playerId]) {
      return toast("Cast your vote before leaving.", "error");
    }
    if (checkState.phase === "p3_finalvote" && !checkState.p3Votes?.[playerId]) {
      return toast("Cast your final vote before leaving.", "error");
    }
  }

  if (!confirm("Leave this game? You'll be taken back to the home screen.")) return;

  // Stop listening BEFORE we write, so our own "you were removed" branch
  // in listenRoom() never fires for our own voluntary exit.
  if (unsub) { unsub(); unsub = null; }
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  clearRevealTimeouts();

  if (snap.exists()) {
    const state   = snap.data();
    const players = { ...state.players };
    const scores  = { ...state.scores };
    const order   = (state.playerOrder || []).filter(pid => pid !== playerId);
    const p1Votes = { ...(state.p1Votes || {}) };
    const p3Votes = { ...(state.p3Votes || {}) };

    delete players[playerId];
    delete scores[playerId];
    delete p1Votes[playerId];
    delete p3Votes[playerId];
    Object.keys(p1Votes).forEach(k => { if (p1Votes[k] === playerId) delete p1Votes[k]; });
    Object.keys(p3Votes).forEach(k => { if (p3Votes[k] === playerId) delete p3Votes[k]; });

    const update = { players, scores, playerOrder: order, p1Votes, p3Votes };

    // Hand off host duties if the host is the one leaving
    if (state.hostId === playerId) {
      update.hostId = order.length ? order[0] : null;
    }

    // If the Odd1Owt leaves mid-round, or too few players remain to
    // continue, cancel the round cleanly back to the lobby rather than
    // stranding everyone else.
    const midRound      = state.phase && state.phase !== "lobby";
    const oddLeft        = midRound && state.oddId === playerId;
    const tooFewPlayers  = midRound && order.length < 3;

    if (oddLeft || tooFewPlayers) {
      update.phase          = "lobby";
      update.results        = null;
      update.oddId          = null;
      update.normalQuestion = null;
      update.oddQuestion    = null;
      update.p2EndsAt       = null;
      update.p1Votes        = {};
      update.p3Votes        = {};
    }

    await updateDoc(ref, update);
  }

  roomId = null;
  show("home");
  toast("You left the game.", "info");
};

// ─── DECK SELECTION (host only) ───────────────────────────────────────────────
window.selectDeck = async function(deckKey) {
  const snap = await getDoc(roomRef());
  if (!snap.exists()) return;
  if (snap.data().hostId !== playerId) return;
  await updateDoc(roomRef(), { activeDeck: deckKey });
};

// ─── DECK UNLOCKS (ad-gated, tracked per-device via localStorage) ─────────────
// Casual 1 ships free for everyone. Every other deck (including "All Decks",
// since it mixes in the locked content) requires watching a rewarded ad once
// per device to unlock. Swap out showRewardedAd()'s body for the real
// @capacitor-community/admob call once Capacitor is installed — nothing else
// in this flow needs to change.
const FREE_DECKS = ["casual1"];

function getUnlockedDecks() {
  try {
    const raw = localStorage.getItem("odd1owt_unlockedDecks");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function isDeckUnlocked(key) {
  return FREE_DECKS.includes(key) || getUnlockedDecks().includes(key);
}

function unlockDeckLocally(key) {
  const unlocked = getUnlockedDecks();
  if (!unlocked.includes(key)) {
    unlocked.push(key);
    localStorage.setItem("odd1owt_unlockedDecks", JSON.stringify(unlocked));
  }
}

// ─── REWARDED AD — PLACEHOLDER ────────────────────────────────────────────────
// TEMP STUB: always resolves true after a short delay, simulating a completed
// ad watch. Replace this body with the real rewarded-ad call once Capacitor +
// @capacitor-community/admob are set up. Keep the same function signature
// (returns a Promise<boolean> — true if the reward was earned) and nothing
// else in the app needs to change.
async function showRewardedAd(deckKey) {
  toast("Loading ad… (placeholder)", "info");
  return new Promise(resolve => {
    setTimeout(() => resolve(true), 1200);
  });
}

// ─── DECK SELECTION ENTRY POINT — ad-gates locked decks before selecting ──────
window.attemptSelectDeck = async function(deckKey) {
  const snap = await getDoc(roomRef());
  if (!snap.exists()) return;
  if (snap.data().hostId !== playerId) return;

  if (isDeckUnlocked(deckKey)) {
    return selectDeck(deckKey);
  }

  const rewarded = await showRewardedAd(deckKey);

  if (rewarded) {
    unlockDeckLocally(deckKey);
    toast(`${DECKS[deckKey]?.name || "Deck"} unlocked!`, "success");
    await selectDeck(deckKey);
  } else {
    toast("Ad wasn't available — deck stays locked for now.", "error");
  }
};

// ─── ROOM CREATION / JOINING ──────────────────────────────────────────────────
window.createRoom = async function() {
  const name = getName();
  if (!name) return toast("Enter your name first.", "error");
  roomId = randomCode();
  await joinRoomInternal(true);
};

window.joinRoom = async function() {
  const name = getName();
  if (!name) return toast("Enter your name first.", "error");
  // codeInput may be hidden but still holds the value (set by invite link or manual entry)
  roomId = (document.getElementById("codeInput")?.value || "").trim().toUpperCase();
  if (!roomId) return toast("Enter a lobby code.", "error");
  await joinRoomInternal(false);
};

// Show/hide manual code entry on the home screen
window.showJoinInput = function() {
  document.getElementById("homeButtons").style.display = "none";
  document.getElementById("joinManual").style.display  = "flex";
  document.getElementById("codeInput").focus();
};

window.hideJoinInput = function() {
  document.getElementById("joinManual").style.display  = "none";
  document.getElementById("homeButtons").style.display = "block";
};

// Clear the invite-link pre-fill and go back to normal home
window.clearInvite = function() {
  document.getElementById("joinFromLink").style.display  = "none";
  document.getElementById("homeButtons").style.display   = "block";
  document.getElementById("codeInput").value             = "";
  history.replaceState({}, "", location.pathname);
};

async function joinRoomInternal(isHost) {
  const name = getName();
  const ref  = roomRef();
  const snap = await getDoc(ref);
  const data = snap.exists() ? snap.data() : null;

  if (data?.players) {
    const taken = Object.entries(data.players).some(([pid, pname]) =>
      pid !== playerId && (pname || "").toLowerCase() === name.toLowerCase()
    );
    if (taken) return toast("That name is already taken in this lobby.", "error");
  }

  const existingOrder = Array.isArray(data?.playerOrder) ? data.playerOrder : [];
  const nextOrder     = existingOrder.includes(playerId)
    ? existingOrder
    : [...existingOrder, playerId];

  await setDoc(ref, {
    createdAt:   data?.createdAt  || Date.now(),
    hostId:      isHost ? playerId : (data?.hostId || null),
    phase:       data?.phase      || "lobby",
    round:       data?.round      || 0,
    activeDeck:  data?.activeDeck || "casual1",
    playerOrder: nextOrder,
    players:     { ...(data?.players || {}), [playerId]: name },
    scores:      { ...(data?.scores  || {}), [playerId]: data?.scores?.[playerId] ?? 0 }
  }, { merge: true });

  listenRoom();
  show("lobby");
}

// ─── REAL-TIME LISTENER ───────────────────────────────────────────────────────
function listenRoom() {
  if (unsub) unsub();
  unsub = onSnapshot(roomRef(), snap => {
    if (!snap.exists()) return;
    const state = snap.data();

    if (!state.players?.[playerId]) {
      if (unsub) { unsub(); unsub = null; }
      toast("You were removed from the lobby.", "error");
      show("home");
      return;
    }

    render(state);
    tryHostAdvance(state);
  });
}

// ─── HOST: START ROUND ────────────────────────────────────────────────────────
window.hostStartRound = async function() {
  const snap  = await getDoc(roomRef());
  if (!snap.exists()) return;
  const state = snap.data();
  if (state.hostId !== playerId) return toast("Only the host can start.", "error");

  const ids = (Array.isArray(state.playerOrder) && state.playerOrder.length)
    ? state.playerOrder.filter(pid => state.players?.[pid])
    : Object.keys(state.players || {});

  if (ids.length < 3) return toast("Need at least 3 players.", "error");

  const oddId = ids[Math.floor(Math.random() * ids.length)];
  const { normalQuestion, oddQuestion, usedKey, nextUsed, lastKey, nextLast } =
    pickTwoQuestions(state);

  await updateDoc(roomRef(), {
    phase: "p1_vote",
    round: (state.round || 0) + 1,
    oddId,
    normalQuestion,
    oddQuestion,
    [usedKey]: nextUsed,
    [lastKey]: nextLast,
    p1Votes:  {},
    p3Votes:  {},
    p2EndsAt: null,
    results:  null
  });
};

// ─── HOST: SKIP TO FINAL VOTE ─────────────────────────────────────────────────
window.hostSkipToFinal = async function() {
  const snap  = await getDoc(roomRef());
  if (!snap.exists()) return;
  const state = snap.data();
  if (state.hostId !== playerId) return;
  if (state.phase  !== "p2_interrogate") return;
  await updateDoc(roomRef(), { phase: "p3_finalvote" });
};

// ─── VOTING ───────────────────────────────────────────────────────────────────
async function castP1Vote(targetId) {
  const snap = await getDoc(roomRef());
  if (!snap.exists() || snap.data().phase !== "p1_vote") return;
  await updateDoc(roomRef(), { [`p1Votes.${playerId}`]: targetId });
}

async function castP3Vote(targetId) {
  const snap = await getDoc(roomRef());
  if (!snap.exists() || snap.data().phase !== "p3_finalvote") return;
  await updateDoc(roomRef(), { [`p3Votes.${playerId}`]: targetId });
  toast("Vote locked in!", "success");
}

// ─── HOST AUTO-ADVANCE ────────────────────────────────────────────────────────
let advancingPhase = null; // prevent double-fire from onSnapshot

async function tryHostAdvance(state) {
  if (state.hostId !== playerId) return;
  const playerCount = Object.keys(state.players || {}).length;

  if (state.phase === "p1_vote") {
    const voteCount = Object.keys(state.p1Votes || {}).length;
    // Guard: only advance if we haven't already started advancing this phase
    if (voteCount >= playerCount && playerCount > 0 && advancingPhase !== "p1_vote") {
      advancingPhase = "p1_vote";
      try {
        await updateDoc(roomRef(), {
          phase: "p2_interrogate",
          p2EndsAt: Date.now() + 5 * 60 * 1000
        });
      } finally {
        advancingPhase = null;
      }
    }
    return;
  }

  if (state.phase === "p2_interrogate") {
    if ((state.p2EndsAt || 0) && Date.now() >= state.p2EndsAt && advancingPhase !== "p2_interrogate") {
      advancingPhase = "p2_interrogate";
      try {
        await updateDoc(roomRef(), { phase: "p3_finalvote" });
      } finally {
        advancingPhase = null;
      }
    }
    return;
  }

  if (state.phase === "p3_finalvote") {
    const voteCount = Object.keys(state.p3Votes || {}).length;
    if (voteCount >= playerCount && playerCount > 0 && advancingPhase !== "p3_finalvote") {
      advancingPhase = "p3_finalvote";
      try {
        const { votedOutId, tally } = computeMostVoted(state.p3Votes);
        const caught  = votedOutId === state.oddId;
        const scores  = { ...(state.scores || {}) };
        const players = state.players || {};

        if (caught) {
          Object.keys(players).forEach(pid => {
            if (pid !== state.oddId) scores[pid] = (scores[pid] || 0) + 1;
          });
        } else {
          scores[state.oddId] = (scores[state.oddId] || 0) + 1;
        }

        await updateDoc(roomRef(), {
          phase: "p4_reveal",
          scores,
          results: {
            votedOutId, caught, tally,
            oddId:          state.oddId,
            normalQuestion: state.normalQuestion,
            oddQuestion:    state.oddQuestion
          }
        });
      } finally {
        advancingPhase = null;
      }
    }
  }
}

function computeMostVoted(voteMap) {
  const tally = {};
  Object.values(voteMap).forEach(t => tally[t] = (tally[t] || 0) + 1);
  const entries = Object.entries(tally).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { votedOutId: entries[0]?.[0] || null, tally };
}

// ─── RENDER DISPATCHER ────────────────────────────────────────────────────────
function render(state) {
  // LAG FIX: Clear the interrogation timer immediately if we are not in Phase 2
  if (state.phase !== "p2_interrogate" && timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  const hintEl = document.getElementById("hostHint");
  if (hintEl) hintEl.textContent = state.hostId === playerId
    ? "You are the host."
    : `Host: ${state.players?.[state.hostId] || "—"}`;

  renderScores(state);
  
// Show skip buttons ONLY to the host when in the correct phase
  const isHost = state.hostId === playerId;
  if (document.getElementById("p1SkipBtn")) {
    document.getElementById("p1SkipBtn").style.display = (isHost && state.phase === "p1_vote") ? "block" : "none";
  }
  if (document.getElementById("p3SkipBtn")) {
    document.getElementById("p3SkipBtn").style.display = (isHost && state.phase === "p3_finalvote") ? "block" : "none";
  }

  const phase = state.phase;
  if (!phase || phase === "lobby")  { show("lobby"); renderLobbyPlayers(state); renderDeckSelector(state); return; }
  if (phase === "p1_vote")          { show("p1"); renderPhase1(state); return; }
  if (phase === "p2_interrogate")   { show("p2"); renderPhase2(state); return; }
  if (phase === "p3_finalvote")     { show("p3"); renderPhase3(state); return; }
  if (phase === "p4_reveal")        { show("p4"); renderPhase4(state); return; }

  show("lobby"); renderLobbyPlayers(state); renderDeckSelector(state);
}

// ─── LOBBY ────────────────────────────────────────────────────────────────────
function renderLobbyPlayers(state) {
  const players = state.players || {};
  const order   = getOrder(state);
  const isHost  = state.hostId === playerId;

  // Update code display
  const codeEl = document.getElementById("lobbyCodeDisplay");
  if (codeEl) codeEl.textContent = roomId || "———";

  if (!order.length) {
    document.getElementById("playersBox").innerHTML =
      `<div class="small muted center" style="padding:16px">Waiting for players…</div>`;
    return;
  }

  const half = Math.ceil(order.length / 2);
  const col1 = order.slice(0, half);
  const col2 = order.slice(half);

  const renderCol = (pids) => pids.map(pid => {
    const name = players[pid];
    if (!name) return "";
    const isMe       = pid === playerId;
    const isThisHost = pid === state.hostId;
    return `
      <div class="player-row">
        <span class="player-name-text">
          ${escapeHtml(name)}
          ${isMe       ? '<span class="you-tag">YOU</span>'   : ""}
          ${isThisHost ? '<span class="crown-tag">👑</span>' : ""}
        </span>
        ${isHost && !isMe
          ? `<button class="kick-btn btn-small" onclick="kickPlayer(\'${pid}\')">✕</button>`
          : ""}
      </div>`;
  }).join("");

  document.getElementById("playersBox").innerHTML = `
    <div style="padding:10px 0 4px 14px;font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text2)">
      ${order.length} Player${order.length !== 1 ? "s" : ""}
    </div>
    <div class="player-list-grid">
      <div class="player-col">${renderCol(col1)}</div>
      <div class="player-col">${renderCol(col2)}</div>
    </div>`;
}

function renderDeckSelector(state) {
  const wrap     = document.getElementById("deckSelectorWrap");
  const viewWrap = document.getElementById("deckViewerWrap");
  const isHost   = state.hostId === playerId;
  const current  = state.activeDeck || "all";

  wrap.style.display     = isHost ? "block" : "none";
  viewWrap.style.display = isHost ? "none"  : "block";

  if (isHost) {
    const grid = document.getElementById("deckGrid");
    grid.innerHTML = "";
    Object.entries(DECKS).forEach(([key, deck]) => {
      const usedArr  = state[`usedQ_${key}`];
      const used     = Array.isArray(usedArr) ? usedArr.length : 0;
      const total    = deck.questions.length;
      const locked   = !isDeckUnlocked(key);
      const card     = document.createElement("div");
      card.className = `deck-card ${deck.cls}${current === key ? " active" : ""}${locked ? " locked" : ""}`;
      card.innerHTML = `
        <div class="dk-check">✓</div>
        ${locked ? '<div class="dk-lock">🔒</div>' : ""}
        <div class="dk-icon">${deck.icon}</div>
        <div class="dk-name">${deck.name}</div>
        <div class="dk-desc">${deck.desc}</div>
        <div class="dk-desc" style="margin-top:4px;color:rgba(255,255,255,0.3)">
          ${locked ? "Watch an ad to unlock" : `${total - used}/${total} left`}
        </div>
      `;
      card.onclick = () => attemptSelectDeck(key);
      grid.appendChild(card);
    });
    const used  = Array.isArray(state[`usedQ_${current}`]) ? state[`usedQ_${current}`].length : 0;
    const total = DECKS[current]?.questions.length || 0;
    document.getElementById("deckUsedInfo").textContent =
      `Active: ${DECKS[current]?.name || "All"} — ${total - used}/${total} questions remaining`;
  } else {
    const icon = DECKS[current]?.icon || "🃏";
    const name = DECKS[current]?.name || "All Decks";
    document.getElementById("deckViewerLabel").textContent = `${icon} Deck: ${name}`;
  }
}

// ─── SCOREBOARD ───────────────────────────────────────────────────────────────
function renderScores(state) {
  const players = state.players || {};
  const scores  = state.scores  || {};
  const order   = getOrder(state);

  const rows = order.map(pid => {
    const name = players[pid];
    const sc   = scores[pid] || 0;
    return `<div class="scoreRow"><span>${escapeHtml(name)}</span><span class="scoreVal">${sc}</span></div>`;
  }).join("");

  const html = `<b>Scoreboard</b><div style="margin-top:8px">${rows || "<span class='small'>No scores yet.</span>"}</div>`;
  document.getElementById("scoreBox").innerHTML = html;
  const p4 = document.getElementById("p4Score");
  if (p4) p4.innerHTML = html;
}

// ─── PHASE 1 ──────────────────────────────────────────────────────────────────
// NOTE: no label revealing whether you are the Odd1Owt — intentional.
function renderPhase1(state) {
  const myQ = playerId === state.oddId ? state.oddQuestion : state.normalQuestion;
  document.getElementById("p1Question").textContent = myQ || "…";

  const list    = document.getElementById("p1VoteList");
  list.innerHTML = "";
  const players  = state.players || {};
  const myVote   = state.p1Votes?.[playerId];

  getOrder(state).forEach(pid => {
    const name = players[pid];
    if (!name) return;
    const b       = document.createElement("button");
    b.textContent = pid === playerId ? `${name} (You)` : name;
    b.className   = `vote-btn${myVote === pid ? " selected" : ""}`;
    b.onclick     = () => castP1Vote(pid);
    list.appendChild(b);
  });

  const total = Object.keys(players).length;
  const done  = Object.keys(state.p1Votes || {}).length;
  document.getElementById("p1Status").textContent = `${done}/${total} votes submitted`;
}

// ─── PHASE 2 ──────────────────────────────────────────────────────────────────
function renderPhase2(state) {
  // Show the NORMAL question publicly — the Odd1Owt sees it now and has to keep their cover
  document.getElementById("p2NormalQ").textContent = state.normalQuestion || "";

  const players = state.players || {};
  const p1      = state.p1Votes || {};
  let html = `<div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--text2);margin-bottom:10px">Phase 1 Votes</div>`;
  Object.entries(p1).forEach(([voter, target]) => {
    html += `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="font-size:13px;color:var(--text2);margin-bottom:3px">${escapeHtml(players[voter] || "?")}</div>
      <div style="font-size:16px;font-weight:700">→ ${escapeHtml(players[target] || "?")}</div>
    </div>`;
  });
  if (!Object.keys(p1).length) html += `<div class="small muted center" style="padding:20px">No votes yet</div>`;
  document.getElementById("p2WhoVoted").innerHTML = html;

  if (timerInterval) clearInterval(timerInterval);
  const endsAt = state.p2EndsAt || (Date.now() + 5 * 60 * 1000);

  const timerEl = document.getElementById("p2Timer");
  const tick = () => {
    const left = endsAt - Date.now();
    timerEl.textContent = fmtTime(left);
    // Pulse red in last 30 seconds
    if (left <= 30000) {
      timerEl.classList.add("urgent");
    } else {
      timerEl.classList.remove("urgent");
    }
  };
  tick();
  timerInterval = setInterval(tick, 250);

  document.getElementById("skipBtn").style.display =
    state.hostId === playerId ? "block" : "none";
  document.getElementById("p2Status").textContent =
    `Discuss now. ${Object.keys(p1).length}/${Object.keys(players).length} phase 1 votes.`;
}

// ─── PHASE 3 ──────────────────────────────────────────────────────────────────
function renderPhase3(state) {
  const list     = document.getElementById("p3VoteList");
  list.innerHTML = "";
  const players  = state.players || {};
  const myVote   = state.p3Votes?.[playerId];

  getOrder(state).forEach(pid => {
    const name = players[pid];
    if (!name) return;
    const b       = document.createElement("button");
    b.textContent = pid === playerId ? `${name} (You)` : name;
    b.className   = `vote-btn${myVote === pid ? " selected" : ""}`;
    b.onclick     = () => castP3Vote(pid);
    list.appendChild(b);
  });

  const total = Object.keys(players).length;
  const done  = Object.keys(state.p3Votes || {}).length;
  document.getElementById("p3Status").textContent = `${done}/${total} votes locked in`;
}

// ─── PHASE 4 — DRAMATIC REVEAL ────────────────────────────────────────────────
// Sequence:
//   0ms   → Step 1: "The group voted for…" + countdown 3
//   900ms → countdown 2
//   1800ms→ countdown 1
//   2700ms→ Step 2: Most-voted name appears
//   4200ms→ Step 3: CAUGHT / ESCAPED verdict
//   5800ms→ Step 4: Full reveal — Odd1Owt identity + question comparison + tally

// ─── PHASE 4 — DRAMATIC REVEAL ────────────────────────────────────────────────
let lastRevealRound = null; // prevent re-running the animation on re-render

function renderPhase4(state) {
  const players = state.players || {};
  const res     = state.results;
  if (!res) return;

  // Next round / host controls (always update these immediately)
  document.getElementById("nextRoundBtn").style.display =
    state.hostId === playerId ? "block" : "none";
  document.getElementById("p4HostNote").textContent = state.hostId === playerId
    ? "Start the next round when ready."
    : "Waiting for host to start next round…";

  // SYNC FIX: If a phone drops a frame or loads late, don't lock them out. 
  // If the animation finished globally but they re-rendered, skip straight to the data.
  if (lastRevealRound === state.round && !revealRunning) {
    revealStep("r-step4", 0);
    return;
  }

  // Guard: safely ignore snapshots ONLY if the animation loop is actively running right now
  if (revealRunning && lastRevealRound === state.round) return;
  
  lastRevealRound = state.round;
  clearRevealTimeouts();
  revealRunning = true;

  // Pre-fill all the content before the animation starts
  const votedOutName = players[res.votedOutId] || "Unknown";
  const oddName      = players[res.oddId]      || "Unknown";
  const caught       = res.caught;

  // Step 2
  document.getElementById("r-accusedName").textContent = votedOutName;
  const topVotes = res.tally?.[res.votedOutId] || 0;
  document.getElementById("r-voteCount").textContent =
    `${topVotes} vote${topVotes !== 1 ? "s" : ""}`;

  // Step 3
  const banner = document.getElementById("r-verdictBanner");
  banner.className = `verdict-banner ${caught ? "caught" : "escaped"}`;
  document.getElementById("r-verdictWord").textContent = caught ? "CAUGHT!" : "ESCAPED!";
  document.getElementById("r-verdictSub").textContent  = caught
    ? `${votedOutName} was the Odd1Owt — the group got it right!`
    : `${oddName} slipped through — the group was wrong!`;

  // Step 4
  document.getElementById("r-oddName").textContent  = oddName;
  document.getElementById("r-normalQ").textContent  = res.normalQuestion || "";
  document.getElementById("r-oddQ").textContent     = res.oddQuestion    || "";

  // Build tally with bar widths
  const maxVotes = Math.max(...Object.values(res.tally || {}), 1);
  const tallyRows = Object.entries(res.tally || {})
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([pid, n], i) => {
      const pct = Math.round((n / maxVotes) * 100);
      return `
        <div class="tally-row" style="animation-delay:${i * 120}ms">
          <span>${escapeHtml(players[pid] || "Unknown")}</span>
          <div class="tally-bar-wrap">
            <div class="tally-bar" style="width:${pct}%"></div>
          </div>
          <span class="tally-n">${n}</span>
        </div>`;
    }).join("");
  document.getElementById("r-tally").innerHTML = tallyRows || "<span class='small'>No votes.</span>";

  // ── Animate the sequence ──
  // Step 1: countdown 3
  revealStep("r-step1", 0);
  const countEl = document.getElementById("r-countdown");

  const t1 = setTimeout(() => { countEl.textContent = "2"; countEl.style.animation = "none"; countEl.offsetHeight; countEl.style.animation = ""; }, 900);
  const t2 = setTimeout(() => { countEl.textContent = "1"; countEl.style.animation = "none"; countEl.offsetHeight; countEl.style.animation = ""; }, 1800);
  revealTimeouts.push(t1, t2);

  // Step 2: name
  revealStep("r-step2", 2700);

  // Step 3: verdict
  revealStep("r-step3", 4200);

  // Step 4: full reveal
  revealStep("r-step4", 5800);

  const tDone = setTimeout(() => { revealRunning = false; }, 6200);
  revealTimeouts.push(tDone);
}

// ─── COPY INVITE ──────────────────────────────────────────────────────────────
window.copyInvite = function() {
  navigator.clipboard.writeText(`${location.origin}${location.pathname}?room=${roomId}`);
  toast("Invite link copied!", "success");
};

// ─── INIT ─────────────────────────────────────────────────────────────────────
const savedName = localStorage.getItem("odd1owt_name");
if (savedName) document.getElementById("nameInput").value = savedName;

const params    = new URLSearchParams(location.search);
const roomParam = params.get("room");
if (roomParam) {
  const code = roomParam.toUpperCase();
  document.getElementById("codeInput").value           = code;
  document.getElementById("joinCodeLabel").textContent = code;
  document.getElementById("joinFromLink").style.display = "flex";
  document.getElementById("homeButtons").style.display  = "none";
}
// Always show home on initial load
show("home");

// ─── HOST FORCE ADVANCE (FOR DROP-OUTS) ──────────────────────────────────────
window.hostForceAdvance = async function(currentPhase) {
  const snap = await getDoc(roomRef());
  if (!snap.exists()) return;
  const state = snap.data();
  if (state.hostId !== playerId || state.phase !== currentPhase) return;

  if (currentPhase === "p1_vote") {
    await updateDoc(roomRef(), {
      phase: "p2_interrogate",
      p2EndsAt: Date.now() + 5 * 60 * 1000
    });
    toast("Forced advance to interrogation!", "info");
  } 
  else if (currentPhase === "p3_finalvote") {
    const { votedOutId, tally } = computeMostVoted(state.p3Votes);
    const caught  = votedOutId === state.oddId;
    const scores  = { ...(state.scores || {}) };
    const players = state.players || {};

    if (caught) {
      Object.keys(players).forEach(pid => {
        if (pid !== state.oddId) scores[pid] = (scores[pid] || 0) + 1;
      });
    } else if (votedOutId) {
      scores[state.oddId] = (scores[state.oddId] || 0) + 1;
    }

    await updateDoc(roomRef(), {
      phase: "p4_reveal",
      scores,
      results: {
        votedOutId, caught, tally,
        oddId:          state.oddId,
        normalQuestion: state.normalQuestion,
        oddQuestion:    state.oddQuestion
      }
    });
    toast("Forced final reveal!", "info");
  }
};
