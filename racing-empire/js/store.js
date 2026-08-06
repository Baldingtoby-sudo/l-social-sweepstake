/*
 * store.js — single source of truth, persisted to localStorage.
 *
 * The whole app state lives in one versioned object. Views subscribe and
 * re-render on commit. In production this module is the seam for a real
 * backend: replace load/save with API calls and keep the same shape.
 */

const KEY = 'racing_empire_v1';
const listeners = new Set();

export const STARTING_CREDITS = 1000;
export const COMP_BANKROLL = 500;

let state = null;

export function getState() { return state; }
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function commit(reason = '') {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { console.warn('persist failed', e); }
  listeners.forEach((fn) => fn(state, reason));
}

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ------------------------------------------------------------------ bootstrap
export function initStore() {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      state = JSON.parse(raw);
      if (state && state.version === 1) return state;
    } catch { /* fall through to fresh state */ }
  }
  state = freshState();
  commit('init');
  return state;
}

function freshState() {
  return {
    version: 1,
    profiles: {},          // id → profile
    session: { activeProfileId: null },
    day: { index: 0, isoDate: null, clockMin: 12 * 60 + 30 },
    meetings: [],
    races: {},             // raceId → race
    bets: {},              // betId → bet
    leagues: {},           // leagueId → league
    competitions: {},      // compId → competition
    ledger: [],            // credit movements, newest first
  };
}

/** Hard reset (Steward panel) — wipes everything including profiles. */
export function resetAll() {
  state = freshState();
  commit('reset');
}

// ------------------------------------------------------------------- profiles
export function createProfile({ name, email, isBot = false, style = null }) {
  const id = uid('usr');
  state.profiles[id] = {
    id, name, email: email || '', isBot, style,
    credits: STARTING_CREDITS,
    createdAt: Date.now(),
  };
  if (!isBot) recordLedger(id, STARTING_CREDITS, 'Welcome bonus');
  return state.profiles[id];
}

export function activeProfile() {
  return state.session.activeProfileId
    ? state.profiles[state.session.activeProfileId] || null : null;
}

export function recordLedger(userId, delta, reason) {
  const p = state.profiles[userId];
  state.ledger.unshift({
    id: uid('led'), userId, delta,
    balanceAfter: p ? p.credits : null,
    reason, ts: Date.now(),
  });
  if (state.ledger.length > 400) state.ledger.length = 400;
}

/** Move credits with a ledger entry. Throws if funds are short. */
export function adjustCredits(userId, delta, reason) {
  const p = state.profiles[userId];
  if (!p) throw new Error('no such profile');
  if (p.credits + delta < 0) throw new Error('Insufficient credits');
  p.credits = Math.round((p.credits + delta) * 100) / 100;
  recordLedger(userId, delta, reason);
}

// -------------------------------------------------------------- demo denizens
// Bot players make leagues and competitions feel alive in demo mode. Their
// betting styles bias which runners they back (see engine.botPickRunner).
const BOT_SEED = [
  { name: 'Arthur "The Colonel" Vane', style: 'favourites' },
  { name: 'Marguerite Chase', style: 'value' },
  { name: 'Sam Okafor', style: 'form' },
  { name: 'Priya Natarajan', style: 'longshots' },
  { name: 'Declan Moore', style: 'favourites' },
  { name: 'Yuki Tanaka', style: 'form' },
  { name: 'Rosa Delgado', style: 'value' },
];

export function ensureBots() {
  const bots = Object.values(state.profiles).filter((p) => p.isBot);
  if (bots.length) return bots;
  return BOT_SEED.map((b) => createProfile({ ...b, isBot: true }));
}

export function ensureOpenLeague(botIds) {
  let open = Object.values(state.leagues).find((l) => l.isOpenLeague);
  if (!open) {
    open = {
      id: uid('lg'), name: 'Racing Empire Open', code: 'EMPIRE',
      ownerId: null, memberIds: [...botIds], isOpenLeague: true,
      createdAt: Date.now(),
    };
    state.leagues[open.id] = open;
  }
  return open;
}
