/*
 * engine.js — the rules of the game.
 *
 * Betting, settlement (win + each-way with standard place terms), the credits
 * economy, leagues, pot competitions, and the demo race-day lifecycle.
 * Pure domain logic: no DOM in this file.
 */

import { provider, dec, implied, simulateResult } from './data.js';
import {
  getState, commit, uid, adjustCredits, activeProfile,
  ensureBots, ensureOpenLeague, COMP_BANKROLL,
} from './store.js';

// -------------------------------------------------------------- place terms
// Standard UK each-way terms by field size (handicaps get extra places).
export function placeTerms(race) {
  const n = race.runners.filter((r) => !r.nonRunner).length;
  const handicap = /handicap|nursery/i.test(race.name);
  if (n <= 4) return { places: 1, fraction: 0 };
  if (n <= 7) return { places: 2, fraction: 1 / 4 };
  if (!handicap) return { places: 3, fraction: 1 / 5 };
  if (n <= 15) return { places: 3, fraction: 1 / 4 };
  return { places: 4, fraction: 1 / 4 };
}

export function potentialReturns(bet, race) {
  const runner = race.runners.find((r) => r.id === bet.runnerId);
  const d = dec(runner.odds);
  if (bet.type === 'win') return bet.stake * d;
  const { fraction } = placeTerms(race);
  const half = bet.stake / 2;
  return half * d + half * ((d - 1) * fraction + 1);   // if it wins outright
}

// ------------------------------------------------------------------- betting
/**
 * Place a bet. source is 'main' (bankroll credits) or a competitionId, in
 * which case the stake draws from that entrant's competition bankroll.
 */
export function placeBet({ userId, raceId, runnerId, type, stake, source = 'main' }) {
  const s = getState();
  const race = s.races[raceId];
  if (!race || race.status !== 'open') throw new Error('Betting is closed for this race');
  if (!(stake > 0)) throw new Error('Enter a stake');
  stake = Math.round(stake * 100) / 100;
  const runner = race.runners.find((r) => r.id === runnerId);
  if (!runner || runner.nonRunner) throw new Error('Runner unavailable');
  if (type === 'each-way' && placeTerms(race).places < 2) {
    throw new Error('No each-way betting in fields of 4 or fewer');
  }

  if (source === 'main') {
    adjustCredits(userId, -stake, `Bet: ${runner.name} (${race.time} ${race.course})`);
  } else {
    const comp = s.competitions[source];
    const entrant = comp && comp.entrants.find((e) => e.userId === userId);
    if (!entrant) throw new Error('Not entered in that competition');
    if (comp.status !== 'live') throw new Error('Competition is not live');
    if (!comp.raceIds.includes(raceId)) throw new Error('Race is outside this competition');
    if (entrant.bankroll < stake) throw new Error('Insufficient competition bankroll');
    entrant.bankroll = Math.round((entrant.bankroll - stake) * 100) / 100;
  }

  const bet = {
    id: uid('bet'), userId, raceId, runnerId, type, stake, source,
    oddsAtPlacement: { ...runner.odds },
    placedAt: Date.now(),
    status: 'open',                    // open | won | placed | lost | void
    returns: 0,
  };
  s.bets[bet.id] = bet;
  commit('bet-placed');
  return bet;
}

// ---------------------------------------------------------------- settlement
function settleBet(bet, race) {
  const { order } = race.result;
  const pos = order.indexOf(bet.runnerId) + 1;         // 0 → didn't run
  const d = dec(bet.oddsAtPlacement);
  const { places, fraction } = placeTerms(race);
  let returns = 0;
  let status = 'lost';

  if (pos === 0) { status = 'void'; returns = bet.stake; }
  else if (bet.type === 'win') {
    if (pos === 1) { status = 'won'; returns = bet.stake * d; }
  } else {                                             // each-way
    const half = bet.stake / 2;
    if (pos === 1) { status = 'won'; returns = half * d + half * ((d - 1) * fraction + 1); }
    else if (pos <= places) { status = 'placed'; returns = half * ((d - 1) * fraction + 1); }
  }

  bet.status = status;
  bet.returns = Math.round(returns * 100) / 100;

  if (bet.returns > 0) {
    const runner = race.runners.find((r) => r.id === bet.runnerId);
    const label = `${status === 'void' ? 'Void' : 'Returns'}: ${runner.name} ${status !== 'void' ? `(${status})` : ''}`;
    if (bet.source === 'main') {
      adjustCredits(bet.userId, bet.returns, label);
    } else {
      const comp = getState().competitions[bet.source];
      const entrant = comp && comp.entrants.find((e) => e.userId === bet.userId);
      if (entrant) entrant.bankroll = Math.round((entrant.bankroll + bet.returns) * 100) / 100;
    }
  }
}

// --------------------------------------------------------------------- stats
export function userStats(userId, { source = 'main' } = {}) {
  const s = getState();
  const settled = Object.values(s.bets).filter((b) =>
    b.userId === userId && b.source === source && b.status !== 'open');
  const scored = settled.filter((b) => b.status !== 'void');
  const staked = scored.reduce((a, b) => a + b.stake, 0);
  const returned = scored.reduce((a, b) => a + b.returns, 0);
  const wins = scored.filter((b) => b.status === 'won').length;
  return {
    bets: scored.length,
    staked,
    profit: Math.round((returned - staked) * 100) / 100,
    roi: staked > 0 ? (returned - staked) / staked : 0,
    strike: scored.length ? wins / scored.length : 0,
  };
}

export function openBets(userId) {
  return Object.values(getState().bets)
    .filter((b) => b.userId === userId && b.status === 'open')
    .sort((a, b) => a.placedAt - b.placedAt);
}

// ------------------------------------------------------------------- leagues
export function createLeague(name, ownerId) {
  const s = getState();
  const code = Array.from({ length: 6 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
  const league = {
    id: uid('lg'), name, code, ownerId,
    memberIds: [ownerId], isOpenLeague: false, createdAt: Date.now(),
  };
  s.leagues[league.id] = league;
  commit('league-created');
  return league;
}

export function joinLeagueByCode(code, userId) {
  const s = getState();
  const league = Object.values(s.leagues)
    .find((l) => l.code.toUpperCase() === code.trim().toUpperCase());
  if (!league) throw new Error('No league found for that code');
  if (!league.memberIds.includes(userId)) league.memberIds.push(userId);
  commit('league-joined');
  return league;
}

export function leagueTable(league) {
  return league.memberIds
    .map((id) => ({ profile: getState().profiles[id], ...userStats(id) }))
    .filter((r) => r.profile)
    .sort((a, b) => b.profit - a.profit || b.roi - a.roi);
}

// -------------------------------------------------------------- competitions
export function seedCompetitionsForDay() {
  const s = getState();
  const allRaceIds = Object.keys(s.races);
  const meetings = s.meetings;
  const defs = [
    {
      name: `Day ${s.day.index} Showdown`, entryFee: 100,
      blurb: 'Every race, every course. The full card is your battlefield.',
      raceIds: allRaceIds,
    },
    meetings[0] && {
      name: `${meetings[0].course} Sprint`, entryFee: 50,
      blurb: `A single-meeting shootout at ${meetings[0].course}. Fewer races, sharper edges.`,
      raceIds: meetings[0].raceIds,
    },
  ].filter(Boolean);

  defs.forEach((d) => {
    const comp = {
      id: uid('cmp'), ...d,
      dayIndex: s.day.index,
      status: 'live',                    // live | settled
      entrants: [],                      // {userId, bankroll, joinedAt, prize}
      prizeSplit: [0.6, 0.25, 0.15],
      settledAt: null,
    };
    s.competitions[comp.id] = comp;
    // Bots buy in to make the pot real.
    ensureBots().forEach((bot) => {
      if (Math.random() < 0.75 && bot.credits >= comp.entryFee) {
        enterCompetitionInternal(comp, bot.id);
      }
    });
  });
}

function enterCompetitionInternal(comp, userId) {
  adjustCredits(userId, -comp.entryFee, `Entry: ${comp.name}`);
  comp.entrants.push({ userId, bankroll: COMP_BANKROLL, joinedAt: Date.now(), prize: 0 });
}

export function enterCompetition(compId, userId) {
  const s = getState();
  const comp = s.competitions[compId];
  if (!comp || comp.status !== 'live') throw new Error('Competition unavailable');
  if (comp.entrants.some((e) => e.userId === userId)) throw new Error('Already entered');
  if (comp.raceIds.every((id) => s.races[id] && s.races[id].status === 'result')) {
    throw new Error('This competition has finished');
  }
  enterCompetitionInternal(comp, userId);
  commit('comp-entered');
  return comp;
}

export function compPot(comp) { return comp.entryFee * comp.entrants.length; }

export function compTable(comp) {
  return comp.entrants
    .map((e) => ({ ...e, profile: getState().profiles[e.userId] }))
    .filter((e) => e.profile)
    .sort((a, b) => b.bankroll - a.bankroll);
}

function maybeSettleCompetitions() {
  const s = getState();
  Object.values(s.competitions).forEach((comp) => {
    if (comp.status !== 'live') return;
    const done = comp.raceIds.every((id) => s.races[id] && s.races[id].status === 'result');
    if (!done) return;
    const table = compTable(comp);
    const pot = compPot(comp);
    // Fewer entrants than prize tiers → renormalise the split over those present.
    const split = comp.prizeSplit.slice(0, Math.max(1, Math.min(3, table.length)));
    const norm = split.reduce((a, b) => a + b, 0);
    table.slice(0, split.length).forEach((row, i) => {
      const prize = Math.round((pot * split[i] / norm) * 100) / 100;
      const entrant = comp.entrants.find((e) => e.userId === row.userId);
      entrant.prize = prize;
      adjustCredits(row.userId, prize, `Prize: ${comp.name} (${['1st', '2nd', '3rd'][i]})`);
    });
    comp.status = 'settled';
    comp.settledAt = Date.now();
  });
}

// ----------------------------------------------------------------- bot brains
function botPickRunner(bot, race) {
  const field = race.runners.filter((r) => !r.nonRunner);
  const scored = field.map((r) => {
    let w;
    switch (bot.style) {
      case 'favourites': w = implied(r.odds) ** 2; break;
      case 'longshots': w = 1 / (implied(r.odds) + 0.05); break;
      case 'form': w = Math.exp(r.rating / 12); break;
      default: w = (r.rating / 135) / (implied(r.odds) + 0.04);   // value hunter
    }
    return { r, w };
  });
  const total = scored.reduce((a, b) => a + b.w, 0);
  let t = Math.random() * total;
  for (const x of scored) { t -= x.w; if (t <= 0) return x.r; }
  return scored[scored.length - 1].r;
}

function botsBetOnRace(race) {
  const s = getState();
  ensureBots().forEach((bot) => {
    // Competition bankroll bets.
    Object.values(s.competitions).forEach((comp) => {
      if (comp.status !== 'live' || !comp.raceIds.includes(race.id)) return;
      const entrant = comp.entrants.find((e) => e.userId === bot.id);
      if (!entrant || entrant.bankroll <= 5 || Math.random() > 0.6) return;
      const stake = Math.max(5, Math.round(entrant.bankroll * (0.08 + Math.random() * 0.1)));
      try {
        placeBet({
          userId: bot.id, raceId: race.id, runnerId: botPickRunner(bot, race).id,
          type: Math.random() < 0.3 ? 'each-way' : 'win',
          stake: Math.min(stake, entrant.bankroll), source: comp.id,
        });
      } catch { /* bot skips on any rule violation */ }
    });
    // League (main bankroll) bets.
    if (Math.random() < 0.35 && bot.credits > 20) {
      const stake = Math.max(5, Math.round(bot.credits * (0.02 + Math.random() * 0.04)));
      try {
        placeBet({
          userId: bot.id, raceId: race.id, runnerId: botPickRunner(bot, race).id,
          type: Math.random() < 0.25 ? 'each-way' : 'win',
          stake, source: 'main',
        });
      } catch { /* insufficient funds etc. */ }
    }
  });
}

// ---------------------------------------------------------- race day lifecycle
/** Idempotent world setup: bots, the open league, and a first race day. */
export async function ensureWorld() {
  const s = getState();
  const bots = ensureBots();
  ensureOpenLeague(bots.map((b) => b.id));
  if (s.day.index === 0) await startNewRaceDay();
  else commit('world-ready');
}

export async function startNewRaceDay() {
  const s = getState();
  // Retire any unfinished competitions from the previous day (refund entries).
  Object.values(s.competitions).forEach((comp) => {
    if (comp.status === 'live') {
      comp.entrants.forEach((e) => {
        if (!e.refunded) adjustCredits(e.userId, comp.entryFee, `Refund: ${comp.name} (abandoned)`);
        e.refunded = true;
      });
      comp.status = 'settled';
    }
  });
  // Void any open bets on races that never ran.
  Object.values(s.bets).forEach((b) => {
    if (b.status === 'open') {
      b.status = 'void'; b.returns = b.stake;
      if (b.source === 'main') adjustCredits(b.userId, b.stake, 'Void: race abandoned');
    }
  });

  s.day.index += 1;
  s.day.clockMin = 12 * 60 + 30;
  s.day.isoDate = new Date().toISOString().slice(0, 10);
  const { meetings, races } = await provider.getRaceDay(s.day.index, s.day.isoDate);
  s.meetings = meetings;
  s.races = races;
  seedCompetitionsForDay();
  commit('new-day');
}

export function nextRace() {
  const s = getState();
  return Object.values(s.races)
    .filter((r) => r.status === 'open')
    .sort((a, b) => a.offMin - b.offMin)[0] || null;
}

/** Demo steward: run the next race — bots bet, result simulated, all settled. */
export async function runNextRace() {
  const s = getState();
  const race = nextRace();
  if (!race) return null;
  botsBetOnRace(race);
  race.result = await provider.getResult(race);
  race.status = 'result';
  s.day.clockMin = race.offMin + 3;
  Object.values(s.bets)
    .filter((b) => b.raceId === race.id && b.status === 'open')
    .forEach((b) => settleBet(b, s.races[race.id]));
  maybeSettleCompetitions();
  commit('race-run');
  return race;
}

export async function runFullDay() {
  let last = null;
  for (;;) {
    const r = await runNextRace();
    if (!r) break;
    last = r;
  }
  return last;
}

// Re-export bits views need without importing three modules.
export { dec, implied, simulateResult, activeProfile };
