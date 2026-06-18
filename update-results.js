#!/usr/bin/env node
// update-results.js — fetch World Cup 2026 results from football-data.org and
// rewrite the RESULTS / GROUP_FINISHES / EXITS arrays inside site/index.html.
//
// Usage:
//   node update-results.js                  fetch live data and rewrite site/index.html
//   node update-results.js --dry-run        fetch and print arrays, don't touch the file
//   node update-results.js --fixtures DIR   read DIR/matches.json + DIR/standings.json instead of the API
//
// Requires FOOTBALL_DATA_API_KEY in the environment or in a .env file next to
// this script. Free key: https://www.football-data.org/client/register

'use strict';

const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, 'site', 'data.json');
const API_BASE = 'https://api.football-data.org/v4';
const COMPETITION = 'WC';

// ── Sweepstake teams (must match the names in index.html exactly) ──────────
const SWEEPSTAKE_TEAMS = [
  'Argentina','Japan','Norway','Panama','DR Congo','New Zealand',
  'Spain','Uruguay','USA','Egypt','Czech Rep.','Bosnia & H.',
  'England','Switzerland','Ecuador','Scotland','Qatar','Haiti',
  'France','Germany','Austria','Paraguay','Ivory Coast','Iraq',
  'Brazil','Morocco','South Korea','Australia','Uzbekistan','Cape Verde',
  'Netherlands','Colombia','Turkey','Sweden','Saudi Arabia','Jordan',
  'Belgium','Senegal','Mexico','Algeria','Tunisia','Curaçao',
  'Portugal','Croatia','Iran','Canada','Ghana','South Africa',
];

// API name → sweepstake name. Keys are pre-normalised (lowercase, no
// diacritics/punctuation) by normKey(), so 'Türkiye' and 'Curaçao' both match.
const ALIASES = {
  'czechia': 'Czech Rep.',
  'czech republic': 'Czech Rep.',
  'turkiye': 'Turkey',
  "cote d'ivoire": 'Ivory Coast',
  'ivory coast': 'Ivory Coast',
  'bosnia and herzegovina': 'Bosnia & H.',
  'bosnia herzegovina': 'Bosnia & H.',
  'bosnia hercegovina': 'Bosnia & H.',
  'dr congo': 'DR Congo',
  'congo dr': 'DR Congo',
  'democratic republic of the congo': 'DR Congo',
  'congo democratic republic': 'DR Congo',
  'cabo verde': 'Cape Verde',
  'cape verde islands': 'Cape Verde',
  'usa': 'USA',
  'united states': 'USA',
  'united states of america': 'USA',
  'korea republic': 'South Korea',
  'republic of korea': 'South Korea',
  'south korea': 'South Korea',
  'ir iran': 'Iran',
  'iran islamic republic of': 'Iran',
  'islamic republic of iran': 'Iran',
  'holland': 'Netherlands',
  'saudi': 'Saudi Arabia',
  'curacao': 'Curaçao',
  'new zealand': 'New Zealand',
  'south africa': 'South Africa',
};

// API stage → sweepstake stage (covering the naming variants football-data uses)
const STAGE_MAP = {
  GROUP_STAGE: 'group',
  LAST_32: 'r32', ROUND_OF_32: 'r32',
  LAST_16: 'r16', ROUND_OF_16: 'r16',
  QUARTER_FINALS: 'qf', QUARTER_FINAL: 'qf',
  SEMI_FINALS: 'sf', SEMI_FINAL: 'sf',
  THIRD_PLACE: '3rd', THIRD_PLACE_PLAYOFF: '3rd', PLAY_OFF_FOR_THIRD_PLACE: '3rd',
  FINAL: 'final',
};

// Knockout rounds get fixed "game week" numbers (index.html labels them by round name)
const KO_GW = { r32: 4, r16: 5, qf: 6, sf: 7, '3rd': 8, final: 9 };

// ── Name normalisation ──────────────────────────────────────────────────────
function normKey(name) {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')                      // punctuation → space
    .replace(/\s+/g, ' ')
    .trim();
}

const NAME_LOOKUP = {};
for (const t of SWEEPSTAKE_TEAMS) NAME_LOOKUP[normKey(t)] = t;
for (const [k, v] of Object.entries(ALIASES)) NAME_LOOKUP[normKey(k)] = v;

function mapTeam(apiName) {
  return NAME_LOOKUP[normKey(apiName)] || null;
}

// ── Data fetching ────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

async function apiGet(endpoint, token) {
  const res = await fetch(`${API_BASE}${endpoint}`, { headers: { 'X-Auth-Token': token } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${endpoint} returned ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

async function fetchData(args) {
  if (args.fixtures) {
    const dir = path.resolve(args.fixtures);
    return {
      matches: JSON.parse(fs.readFileSync(path.join(dir, 'matches.json'), 'utf8')),
      standings: JSON.parse(fs.readFileSync(path.join(dir, 'standings.json'), 'utf8')),
    };
  }
  loadEnv();
  const token = process.env.FOOTBALL_DATA_API_KEY;
  if (!token) {
    console.error('Missing FOOTBALL_DATA_API_KEY.');
    console.error('Get a free key at https://www.football-data.org/client/register');
    console.error(`then either export it or put FOOTBALL_DATA_API_KEY=... in ${path.join(__dirname, '.env')}`);
    process.exit(1);
  }
  const matches = await apiGet(`/competitions/${COMPETITION}/matches`, token);
  const standings = await apiGet(`/competitions/${COMPETITION}/standings`, token);
  return { matches, standings };
}

// ── Build the three arrays ───────────────────────────────────────────────────
function buildResults(matchesPayload) {
  const results = [];
  const warnings = [];
  const finished = (matchesPayload.matches || []).filter(m => m.status === 'FINISHED');

  for (const m of finished) {
    const stage = STAGE_MAP[m.stage];
    if (!stage) {
      warnings.push(`Unknown stage "${m.stage}" — skipped ${m.homeTeam?.name} v ${m.awayTeam?.name}`);
      continue;
    }
    const home = mapTeam(m.homeTeam.name);
    const away = mapTeam(m.awayTeam.name);
    if (!home || !away) {
      warnings.push(`Unmapped team name — skipped "${m.homeTeam.name}" v "${m.awayTeam.name}"`);
      continue;
    }

    // fullTime includes extra time; a knockout game level after ET is decided on pens
    const homeScore = m.score.fullTime.home;
    const awayScore = m.score.fullTime.away;
    // Guard against the provider briefly flagging a match FINISHED before scores
    // populate — skip until real numbers arrive rather than publishing nulls.
    if (homeScore == null || awayScore == null) {
      warnings.push(`FINISHED but no score yet — skipped ${home} v ${away}`);
      continue;
    }
    const entry = {
      gw: stage === 'group' ? (m.matchday || 1) : KO_GW[stage],
      stage, home, homeScore, away, awayScore,
    };
    if (stage !== 'group' && homeScore === awayScore) {
      if (m.score.winner === 'HOME_TEAM') entry.winner = 'home';
      else if (m.score.winner === 'AWAY_TEAM') entry.winner = 'away';
      else warnings.push(`Level knockout game with no winner from API: ${home} v ${away}`);
    }
    results.push(entry);
  }

  results.sort((a, b) => (a.gw - b.gw) || a.home.localeCompare(b.home));
  return { results, warnings };
}

function buildGroupFinishes(standingsPayload) {
  const finishes = [];
  const warnings = [];
  for (const s of standingsPayload.standings || []) {
    if (s.type && s.type !== 'TOTAL') continue;
    const table = s.table || [];
    // Only record a group once every team in it has played all 3 games
    if (!table.length || !table.every(row => row.playedGames >= 3)) continue;
    for (const row of table) {
      const country = mapTeam(row.team.name);
      if (!country) { warnings.push(`Unmapped team in standings: "${row.team.name}"`); continue; }
      finishes.push({ country, finish: row.position });
    }
  }
  finishes.sort((a, b) => a.country.localeCompare(b.country));
  return { finishes, warnings };
}

function buildExits(results) {
  // Derive eliminations from finished knockout results.
  // r32/r16/qf loser: exits at that stage. SF losers wait for the 3rd-place game.
  // 3rd place: winner exits as '3rd', loser as '4th'. Final: winner 'win', loser 'final'.
  const exits = [];
  for (const r of results) {
    if (r.stage === 'group' || r.stage === 'sf') continue;
    const homeWon = r.winner ? r.winner === 'home' : r.homeScore > r.awayScore;
    const winner = homeWon ? r.home : r.away;
    const loser = homeWon ? r.away : r.home;
    if (r.stage === '3rd') {
      exits.push({ country: winner, stage: '3rd' }, { country: loser, stage: '4th' });
    } else if (r.stage === 'final') {
      exits.push({ country: winner, stage: 'win' }, { country: loser, stage: 'final' });
    } else {
      exits.push({ country: loser, stage: r.stage });
    }
  }
  exits.sort((a, b) => a.country.localeCompare(b.country));
  return exits;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const args = {
    dryRun: argv.includes('--dry-run'),
    fixtures: argv.includes('--fixtures') ? argv[argv.indexOf('--fixtures') + 1] : null,
  };

  const { matches, standings } = await fetchData(args);
  const { results, warnings: w1 } = buildResults(matches);
  const { finishes, warnings: w2 } = buildGroupFinishes(standings);
  const exits = buildExits(results);

  for (const w of [...w1, ...w2]) console.warn(`⚠ ${w}`);

  // The page fetches this JSON from GitHub on load — no site redeploy needed.
  const core = { results, groupFinishes: finishes, exits };

  if (args.dryRun) {
    console.log(JSON.stringify({ updated: '(dry-run)', ...core }, null, 2));
    console.log(`\n(dry run) ${results.length} results, ${finishes.length} group finishes, ${exits.length} exits — file not written`);
    return;
  }

  // Only rewrite (and re-stamp) when the data actually changed, so unchanged
  // runs leave data.json byte-identical → no commit, no churn.
  let prevCore = null;
  if (fs.existsSync(DATA_PATH)) {
    try {
      const p = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
      prevCore = { results: p.results, groupFinishes: p.groupFinishes, exits: p.exits };
    } catch { /* malformed — treat as changed */ }
  }

  if (JSON.stringify(core) === JSON.stringify(prevCore)) {
    console.log(`data.json unchanged: ${results.length} results, ${finishes.length} group finishes, ${exits.length} exits`);
    return;
  }

  const d = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad = n => String(n).padStart(2, '0');
  const updated = `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;

  fs.writeFileSync(DATA_PATH, JSON.stringify({ updated, ...core }, null, 2) + '\n');
  console.log(`✓ data.json updated: ${results.length} results, ${finishes.length} group finishes, ${exits.length} exits`);
}

main().catch(err => { console.error(err.message || err); process.exit(1); });
