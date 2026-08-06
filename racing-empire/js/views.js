/*
 * views.js — one render function per screen. Views read state, call engine
 * actions, and are re-rendered wholesale on every store commit (the state is
 * small enough that this stays instant and keeps the code honest).
 */

import { getState, activeProfile, createProfile, commit, resetAll } from './store.js';
import {
  placeBet, potentialReturns, placeTerms, userStats, openBets,
  createLeague, joinLeagueByCode, leagueTable,
  enterCompetition, compPot, compTable,
  nextRace, runNextRace, runFullDay, startNewRaceDay, ensureWorld,
} from './engine.js';
import { dec, fracStr } from './data.js';
import {
  h, silks, stars, flagChips, toast, modal, statTile, profitBar,
  fmtCr, fmtSigned, fmtPct, fmtOdds, fmtDec, fmtPrize, timeAgo,
} from './ui.js';

const go = (hash) => { location.hash = hash; };
const clockStr = () => {
  const m = getState().day.clockMin;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

// ================================================================= AUTH
export function viewAuth() {
  const s = getState();
  const existing = Object.values(s.profiles).filter((p) => !p.isBot);

  const nameIn = h('input', { class: 'input', placeholder: 'Display name', maxlength: 24 });
  const emailIn = h('input', { class: 'input', placeholder: 'Email (optional)', type: 'email' });

  const signUp = () => {
    const name = nameIn.value.trim();
    if (!name) { toast('Choose a display name', 'warn'); return; }
    const p = createProfile({ name, email: emailIn.value.trim() });
    s.session.activeProfileId = p.id;
    const open = Object.values(s.leagues).find((l) => l.isOpenLeague);
    if (open && !open.memberIds.includes(p.id)) open.memberIds.push(p.id);
    commit('signed-up');
    toast(`Welcome to Racing Empire, ${name} — ${fmtCr(p.credits)} to play with`);
    go('#/home');
  };

  return h('div', { class: 'auth-hero' },
    h('div', { class: 'auth-panel card' },
      h('div', { class: 'brand-mark' }, '🏇'),
      h('h1', { class: 'brand' }, 'Racing Empire'),
      h('p', { class: 'tagline' },
        'Back your judgement. Join a league, manage your credits, and out-tip the field in pot competitions.'),
      h('div', { class: 'stack' },
        nameIn, emailIn,
        h('button', { class: 'btn primary big', onclick: signUp }, 'Create account'),
      ),
      existing.length ? h('div', { class: 'auth-existing' },
        h('div', { class: 'muted small' }, 'Or continue as'),
        existing.map((p) => h('button', {
          class: 'btn ghost',
          onclick: () => { s.session.activeProfileId = p.id; commit('signed-in'); go('#/home'); },
        }, `${p.name} · ${fmtCr(p.credits)}`)),
      ) : null,
      h('p', { class: 'micro muted' },
        'Demo build: accounts live in this browser only. Credits are play money — see the README for the production auth, payments and licensing notes.'),
    ));
}

// ================================================================= HOME
export function viewHome() {
  const me = activeProfile();
  const s = getState();
  const stats = userStats(me.id);
  const next = nextRace();
  const myOpen = openBets(me.id);
  const liveComps = Object.values(s.competitions).filter((c) => c.status === 'live');

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {},
        h('h2', {}, `Good racing, ${me.name.split(' ')[0]}`),
        h('p', { class: 'muted' }, `Race day ${s.day.index} · ${clockStr()} · ${s.meetings.length} meetings`)),
      h('button', { class: 'btn primary', onclick: () => go('#/races') }, 'View racecards')),

    h('div', { class: 'stat-row' },
      statTile('Bankroll', fmtCr(me.credits)),
      statTile('Season profit', fmtSigned(stats.profit),
        { tone: stats.profit > 0 ? 'pos' : stats.profit < 0 ? 'neg' : null, sub: `${stats.bets} settled bets` }),
      statTile('ROI', fmtPct(stats.roi),
        { tone: stats.roi > 0 ? 'pos' : stats.roi < 0 ? 'neg' : null }),
      statTile('Strike rate', fmtPct(stats.strike), { sub: 'winners / bets' })),

    next ? h('section', { class: 'card next-race', onclick: () => go(`#/race/${next.id}`) },
      h('div', { class: 'nr-left' },
        h('div', { class: 'eyebrow' }, 'Next off'),
        h('h3', {}, `${next.time} ${next.course}`),
        h('p', { class: 'muted' }, `${next.name} · ${next.distance} · ${next.runners.length} runners · Going: ${next.going}`),
        h('p', { class: 'verdict' }, '“', next.verdict, '”')),
      h('div', { class: 'nr-right' },
        favouriteChip(next),
        h('span', { class: 'btn ghost' }, 'Open racecard →')))
      : h('section', { class: 'card empty-day' },
        h('h3', {}, 'That’s the card completed'),
        h('p', { class: 'muted' }, 'All races have run. Start the next race day from the Steward panel.'),
        h('button', { class: 'btn primary', onclick: () => go('#/steward') }, 'Steward panel')),

    myOpen.length ? h('section', {},
      h('h3', { class: 'section-title' }, `Open bets (${myOpen.length})`),
      h('div', { class: 'card' }, betList(myOpen.slice(0, 4))),
    ) : null,

    liveComps.length ? h('section', {},
      h('h3', { class: 'section-title' }, 'Live competitions'),
      h('div', { class: 'comp-row' }, liveComps.map((c) => compCard(c, me)))) : null,
  );
}

function favouriteChip(race) {
  const fav = race.runners.slice().sort((a, b) => dec(a.odds) - dec(b.odds))[0];
  return h('div', { class: 'fav-chip' },
    silks(fav.silks),
    h('div', {}, h('strong', {}, fav.name),
      h('div', { class: 'muted small' }, `Favourite · ${fmtOdds(fav.odds)}`)));
}

// ================================================================ RACES
export function viewRaces(params) {
  const s = getState();
  const meetingId = params[0] || (s.meetings[0] && s.meetings[0].id);
  const meeting = s.meetings.find((m) => m.id === meetingId) || s.meetings[0];

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {}, h('h2', {}, 'Racecards'),
        h('p', { class: 'muted' }, `Race day ${s.day.index} · course time ${clockStr()}`)),
    ),
    h('div', { class: 'meeting-tabs', role: 'tablist' },
      s.meetings.map((m) => h('button', {
        class: `tab${m.id === meeting.id ? ' active' : ''}`,
        role: 'tab', 'aria-selected': m.id === meeting.id ? 'true' : 'false',
        onclick: () => go(`#/races/${m.id}`),
      }, h('strong', {}, m.course), h('span', { class: 'small muted' }, `Going: ${m.going}`)))),

    meeting ? h('div', { class: 'race-list' },
      meeting.raceIds.map((rid) => raceRow(s.races[rid]))) :
      h('p', { class: 'muted' }, 'No meetings today.'),
  );
}

function raceRow(race) {
  const done = race.status === 'result';
  const winner = done && race.runners.find((r) => r.id === race.result.order[0]);
  return h('div', { class: `card race-row${done ? ' done' : ''}`, onclick: () => go(`#/race/${race.id}`) },
    h('div', { class: 'race-time' }, race.time),
    h('div', { class: 'race-main' },
      h('strong', {}, race.name),
      h('div', { class: 'muted small' },
        `${race.distance} · ${race.raceClass} · ${race.runners.length} runners · ${fmtPrize(race.prize)}`)),
    done
      ? h('div', { class: 'race-status won' }, silks(winner.silks), h('span', {}, `1st ${winner.name}`))
      : h('div', { class: 'race-status' }, h('span', { class: 'pill' }, 'Open')));
}

// ============================================================ RACE DETAIL
export function viewRace(params) {
  const s = getState();
  const race = s.races[params[0]];
  if (!race) return h('p', { class: 'muted' }, 'Race not found.');
  const me = activeProfile();
  const done = race.status === 'result';
  const terms = placeTerms(race);
  const positions = done ? race.result.order : [];

  const sorted = race.runners.slice().sort((a, b) =>
    done ? positions.indexOf(a.id) - positions.indexOf(b.id) : dec(a.odds) - dec(b.odds));

  return h('div', { class: 'page' },
    h('button', { class: 'btn ghost small', onclick: () => go(`#/races/${race.meetingId}`) }, '← Racecards'),
    h('div', { class: 'race-hero card' },
      h('div', {},
        h('div', { class: 'eyebrow' }, `${race.time} · ${race.course}`),
        h('h2', {}, race.name),
        h('p', { class: 'muted' },
          `${race.distance} · ${race.raceClass} · ${fmtPrize(race.prize)} · Going: ${race.going}`,
          terms.places > 1 ? ` · Each-way: ${terms.places} places at 1/${Math.round(1 / terms.fraction)} odds` : ' · Win only'),
      ),
      done ? h('span', { class: 'pill result' }, 'Result') : h('span', { class: 'pill live' }, 'Betting open')),

    h('div', { class: 'card verdict-card' },
      h('div', { class: 'eyebrow' }, 'The verdict'), h('p', {}, race.verdict)),

    h('div', { class: 'runner-table card' },
      sorted.map((r) => runnerRow(race, r, me, done, positions))),

    myBetsOnRace(race, me),
  );
}

function runnerRow(race, r, me, done, positions) {
  const pos = done ? positions.indexOf(r.id) + 1 : 0;
  const posLabel = pos === 1 ? '1st' : pos === 2 ? '2nd' : pos === 3 ? '3rd' : pos ? `${pos}th` : '';
  return h('div', { class: `runner${pos === 1 ? ' winner' : ''}` },
    h('div', { class: 'runner-no mono' }, done ? posLabel : r.number),
    silks(r.silks),
    h('div', { class: 'runner-main' },
      h('div', { class: 'runner-name' }, h('strong', {}, r.name), stars(r.stars), flagChips(r.flags)),
      h('div', { class: 'muted small' },
        `${r.jockey} · ${r.trainer} · ${r.age}yo · ${r.weight} · draw ${r.draw}`)),
    h('div', { class: 'runner-form mono', title: 'Recent form, latest on the right' }, r.form),
    h('div', { class: 'runner-rating mono', title: 'Racing Empire rating' }, r.rating),
    done
      ? h('div', { class: 'odds-btn static mono' }, fmtOdds(race.result.sp[r.id] || r.odds))
      : h('button', {
        class: 'odds-btn mono',
        title: `Decimal ${fmtDec(r.odds)}`,
        onclick: () => openBetSlip(race, r, me),
      }, fmtOdds(r.odds)));
}

function myBetsOnRace(race, me) {
  const mine = Object.values(getState().bets)
    .filter((b) => b.userId === me.id && b.raceId === race.id)
    .sort((a, b) => b.placedAt - a.placedAt);
  if (!mine.length) return null;
  return h('section', {},
    h('h3', { class: 'section-title' }, 'Your bets in this race'),
    h('div', { class: 'card' }, betList(mine)));
}

// ------------------------------------------------------------------ bet slip
function openBetSlip(race, runner, me) {
  const s = getState();
  const myComps = Object.values(s.competitions).filter((c) =>
    c.status === 'live' && c.raceIds.includes(race.id) &&
    c.entrants.some((e) => e.userId === me.id));

  let type = 'win';
  let source = 'main';
  const stakeIn = h('input', {
    class: 'input mono', type: 'number', min: '1', step: '1', value: '25',
    oninput: refresh, inputmode: 'numeric',
  });

  const summary = h('p', { class: 'slip-summary muted' });
  const balanceLine = h('p', { class: 'small muted' });
  const typeBtns = ['win', 'each-way'].map((t) => h('button', {
    class: 'btn ghost seg', dataset: { t },
    onclick: (e) => { type = t; segs.forEach((b) => b.classList.toggle('active', b.dataset.t === type)); refresh(); },
  }, t === 'win' ? 'Win' : `Each-way`));
  const segs = typeBtns;
  segs[0].classList.add('active');

  const sourceSel = h('select', { class: 'input', onchange: (e) => { source = e.target.value; refresh(); } },
    h('option', { value: 'main' }, `Main bankroll · ${fmtCr(me.credits)}`),
    myComps.map((c) => {
      const en = c.entrants.find((e) => e.userId === me.id);
      return h('option', { value: c.id }, `${c.name} · ${fmtCr(en.bankroll)}`);
    }));

  function refresh() {
    const stake = Number(stakeIn.value) || 0;
    const bet = { runnerId: runner.id, type, stake };
    const ret = stake > 0 ? potentialReturns(bet, race) : 0;
    const terms = placeTerms(race);
    summary.textContent = type === 'win'
      ? `Returns ${fmtCr(ret)} if ${runner.name} wins at ${fmtOdds(runner.odds)}.`
      : `Half win, half place (${terms.places} places at 1/${Math.round(1 / terms.fraction)} odds). Returns up to ${fmtCr(ret)}.`;
    const avail = source === 'main' ? me.credits
      : myComps.find((c) => c.id === source)?.entrants.find((e) => e.userId === me.id)?.bankroll || 0;
    balanceLine.textContent = `Available in this bankroll: ${fmtCr(avail)}`;
  }
  refresh();

  const body = h('div', { class: 'stack slip' },
    h('div', { class: 'slip-runner' },
      silks(runner.silks),
      h('div', {}, h('strong', {}, runner.name),
        h('div', { class: 'muted small' }, `${race.time} ${race.course} · ${fmtOdds(runner.odds)} (${fmtDec(runner.odds)})`))),
    h('div', { class: 'seg-row' }, segs),
    h('label', { class: 'field' }, h('span', {}, 'Stake (credits)'), stakeIn),
    myComps.length ? h('label', { class: 'field' }, h('span', {}, 'Bet from'), sourceSel) : null,
    summary, balanceLine,
  );

  modal('Bet slip', body, [{
    label: 'Place bet',
    onClick: (close) => {
      try {
        placeBet({
          userId: me.id, raceId: race.id, runnerId: runner.id,
          type, stake: Number(stakeIn.value), source,
        });
        toast(`Bet placed: ${runner.name} at ${fmtOdds(runner.odds)}`);
        close();
      } catch (e) { toast(e.message, 'warn'); return false; }
    },
  }]);
}

// ================================================================= BETS
export function viewBets() {
  const me = activeProfile();
  const all = Object.values(getState().bets)
    .filter((b) => b.userId === me.id)
    .sort((a, b) => b.placedAt - a.placedAt);
  const open = all.filter((b) => b.status === 'open');
  const settled = all.filter((b) => b.status !== 'open');
  const stats = userStats(me.id);

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', {}, 'My bets')),
    h('div', { class: 'stat-row' },
      statTile('Open bets', String(open.length), { sub: `${fmtCr(open.reduce((a, b) => a + b.stake, 0))} staked` }),
      statTile('Profit', fmtSigned(stats.profit), { tone: stats.profit > 0 ? 'pos' : stats.profit < 0 ? 'neg' : null }),
      statTile('ROI', fmtPct(stats.roi)),
      statTile('Strike rate', fmtPct(stats.strike))),
    open.length ? h('section', {}, h('h3', { class: 'section-title' }, 'Open'),
      h('div', { class: 'card' }, betList(open))) : null,
    settled.length ? h('section', {}, h('h3', { class: 'section-title' }, 'Settled'),
      h('div', { class: 'card' }, betList(settled.slice(0, 40)))) : null,
    !all.length ? h('div', { class: 'card empty-day' },
      h('h3', {}, 'No bets yet'),
      h('p', { class: 'muted' }, 'Open a racecard and tap a price to build your first slip.'),
      h('button', { class: 'btn primary', onclick: () => go('#/races') }, 'View racecards')) : null,
  );
}

function betList(bets) {
  const s = getState();
  return h('div', { class: 'bet-list' }, bets.map((b) => {
    const race = s.races[b.raceId];
    const runner = race && race.runners.find((r) => r.id === b.runnerId);
    if (!race || !runner) return null;
    const comp = b.source !== 'main' ? s.competitions[b.source] : null;
    const statusCls = { open: '', won: 'won', placed: 'placed', lost: 'lost', void: '' }[b.status];
    return h('div', { class: 'bet-item', onclick: () => go(`#/race/${race.id}`) },
      silks(runner.silks),
      h('div', { class: 'bet-main' },
        h('strong', {}, runner.name),
        h('div', { class: 'muted small' },
          `${race.time} ${race.course} · ${b.type === 'win' ? 'Win' : 'E/W'} · ${fmtOdds(b.oddsAtPlacement)}${comp ? ` · ${comp.name}` : ''}`)),
      h('div', { class: 'bet-nums mono' },
        h('div', {}, `${fmtCr(b.stake)}`),
        b.status === 'open'
          ? h('div', { class: 'muted small' }, `to return ${fmtCr(potentialReturns(b, race))}`)
          : h('div', { class: `small ${statusCls}` },
            b.status === 'void' ? 'void' : `${b.status} · ${fmtSigned(b.returns - b.stake)}`)));
  }));
}

// =============================================================== LEAGUES
export function viewLeagues() {
  const me = activeProfile();
  const s = getState();
  const mine = Object.values(s.leagues).filter((l) => l.memberIds.includes(me.id));

  const nameIn = h('input', { class: 'input', placeholder: 'League name', maxlength: 30 });
  const codeIn = h('input', { class: 'input mono', placeholder: 'Invite code', maxlength: 8 });

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', {}, 'Leagues'),
      h('p', { class: 'muted' }, 'Season-long tables ranked by main-bankroll profit.')),
    h('div', { class: 'two-col' },
      h('div', { class: 'card stack' },
        h('h3', {}, 'Create a league'),
        nameIn,
        h('button', {
          class: 'btn primary',
          onclick: () => {
            const name = nameIn.value.trim();
            if (!name) { toast('Give your league a name', 'warn'); return; }
            const l = createLeague(name, me.id);
            toast(`League created — invite code ${l.code}`);
            go(`#/league/${l.id}`);
          },
        }, 'Create')),
      h('div', { class: 'card stack' },
        h('h3', {}, 'Join with a code'),
        codeIn,
        h('button', {
          class: 'btn ghost',
          onclick: () => {
            try { const l = joinLeagueByCode(codeIn.value, me.id); toast(`Joined ${l.name}`); go(`#/league/${l.id}`); }
            catch (e) { toast(e.message, 'warn'); }
          },
        }, 'Join'))),
    h('h3', { class: 'section-title' }, 'Your leagues'),
    mine.map((l) => {
      const table = leagueTable(l);
      const myRank = table.findIndex((r) => r.profile.id === me.id) + 1;
      return h('div', { class: 'card league-row', onclick: () => go(`#/league/${l.id}`) },
        h('div', {}, h('strong', {}, l.name),
          h('div', { class: 'muted small' }, `${l.memberIds.length} members · code ${l.code}`)),
        h('div', { class: 'mono' }, myRank ? `#${myRank}` : '—'));
    }));
}

export function viewLeague(params) {
  const s = getState();
  const league = s.leagues[params[0]];
  if (!league) return h('p', { class: 'muted' }, 'League not found.');
  const me = activeProfile();
  const table = leagueTable(league);
  const maxAbs = Math.max(1, ...table.map((r) => Math.abs(r.profit)));

  return h('div', { class: 'page' },
    h('button', { class: 'btn ghost small', onclick: () => go('#/leagues') }, '← Leagues'),
    h('div', { class: 'page-head' },
      h('div', {}, h('h2', {}, league.name),
        h('p', { class: 'muted' }, `${league.memberIds.length} members · invite code `,
          h('strong', { class: 'mono' }, league.code))),
    ),
    h('div', { class: 'card' },
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {},
          h('th', {}, '#'), h('th', {}, 'Player'), h('th', { class: 'num' }, 'Bets'),
          h('th', { class: 'num' }, 'ROI'), h('th', { class: 'num wide' }, 'Profit (cr)'))),
        h('tbody', {}, table.map((r, i) => h('tr', { class: r.profile.id === me.id ? 'me' : '' },
          h('td', { class: 'mono' }, i + 1),
          h('td', {}, r.profile.name, r.profile.isBot ? h('span', { class: 'bot-tag' }, 'AI') : null),
          h('td', { class: 'num mono' }, r.bets),
          h('td', { class: 'num mono' }, fmtPct(r.roi)),
          h('td', { class: 'num' }, profitBar(r.profit, maxAbs))))))));
}

// ========================================================== COMPETITIONS
export function viewComps() {
  const me = activeProfile();
  const s = getState();
  const comps = Object.values(s.competitions).sort((a, b) =>
    (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1) || b.dayIndex - a.dayIndex);

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', {}, 'Competitions'),
      h('p', { class: 'muted' },
        `Buy in with credits, take a fixed ${fmtCr(500)} tournament bankroll, finish top three to share the pot (60 / 25 / 15).`)),
    comps.length
      ? h('div', { class: 'comp-grid' }, comps.map((c) => compCard(c, me)))
      : h('p', { class: 'muted' }, 'No competitions yet — start a race day from the Steward panel.'));
}

function compCard(comp, me) {
  const s = getState();
  const entered = comp.entrants.some((e) => e.userId === me.id);
  const racesDone = comp.raceIds.filter((id) => s.races[id]?.status === 'result').length;
  const total = comp.raceIds.length;

  return h('div', { class: 'card comp-card', onclick: () => go(`#/comp/${comp.id}`) },
    h('div', { class: 'comp-top' },
      h('div', {},
        h('strong', {}, comp.name),
        h('div', { class: 'muted small' }, comp.blurb)),
      h('span', { class: `pill ${comp.status === 'live' ? 'live' : ''}` },
        comp.status === 'live' ? 'Live' : 'Settled')),
    h('div', { class: 'comp-nums' },
      h('div', {}, h('div', { class: 'muted micro' }, 'Pot'), h('strong', { class: 'mono' }, fmtCr(compPot(comp)))),
      h('div', {}, h('div', { class: 'muted micro' }, 'Entry'), h('strong', { class: 'mono' }, fmtCr(comp.entryFee))),
      h('div', {}, h('div', { class: 'muted micro' }, 'Entrants'), h('strong', { class: 'mono' }, comp.entrants.length)),
      h('div', {}, h('div', { class: 'muted micro' }, 'Races'), h('strong', { class: 'mono' }, `${racesDone}/${total}`))),
    comp.status === 'live' && !entered ? h('button', {
      class: 'btn primary',
      onclick: (e) => {
        e.stopPropagation();
        try { enterCompetition(comp.id, me.id); toast(`Entered ${comp.name} — ${fmtCr(500)} tournament bankroll ready`); }
        catch (err) { toast(err.message, 'warn'); }
      },
    }, `Enter · ${fmtCr(comp.entryFee)}`) : null,
    entered ? h('div', { class: 'pill entered' }, 'Entered') : null);
}

export function viewComp(params) {
  const s = getState();
  const comp = s.competitions[params[0]];
  if (!comp) return h('p', { class: 'muted' }, 'Competition not found.');
  const me = activeProfile();
  const table = compTable(comp);
  const entered = comp.entrants.some((e) => e.userId === me.id);
  const racesDone = comp.raceIds.filter((id) => s.races[id]?.status === 'result').length;

  return h('div', { class: 'page' },
    h('button', { class: 'btn ghost small', onclick: () => go('#/comps') }, '← Competitions'),
    h('div', { class: 'page-head' },
      h('div', {}, h('h2', {}, comp.name), h('p', { class: 'muted' }, comp.blurb))),
    h('div', { class: 'stat-row' },
      statTile('Pot', fmtCr(compPot(comp)), { sub: `${comp.entrants.length} × ${fmtCr(comp.entryFee)}` }),
      statTile('Prizes', '60 / 25 / 15', { sub: 'share of pot, top 3' }),
      statTile('Races', `${racesDone}/${comp.raceIds.length}`),
      statTile('Status', comp.status === 'live' ? 'Live' : 'Settled')),

    comp.status === 'live' && !entered ? h('div', { class: 'card stack' },
      h('p', {}, `Enter for ${fmtCr(comp.entryFee)} and you get a fixed ${fmtCr(500)} tournament bankroll. Bet it on the competition’s races from any bet slip (choose the competition under “Bet from”). Biggest bankroll when the last race settles takes the lion’s share.`),
      h('button', {
        class: 'btn primary',
        onclick: () => {
          try { enterCompetition(comp.id, me.id); toast('You’re in — good luck'); }
          catch (e) { toast(e.message, 'warn'); }
        },
      }, `Enter · ${fmtCr(comp.entryFee)}`)) : null,

    h('div', { class: 'card' },
      h('table', { class: 'table' },
        h('thead', {}, h('tr', {},
          h('th', {}, '#'), h('th', {}, 'Player'),
          h('th', { class: 'num' }, 'Bankroll'), h('th', { class: 'num' }, comp.status === 'settled' ? 'Prize' : 'P/L'))),
        h('tbody', {}, table.map((row, i) => h('tr', { class: row.profile.id === me.id ? 'me' : '' },
          h('td', { class: 'mono' },
            comp.status === 'settled' && i < 3 && row.prize > 0 ? ['🥇', '🥈', '🥉'][i] : i + 1),
          h('td', {}, row.profile.name, row.profile.isBot ? h('span', { class: 'bot-tag' }, 'AI') : null),
          h('td', { class: 'num mono' }, fmtCr(row.bankroll)),
          comp.status === 'settled'
            ? h('td', { class: `num mono ${row.prize ? 'tone-pos' : 'muted'}` }, row.prize ? fmtCr(row.prize) : '—')
            : h('td', { class: `num mono ${row.bankroll - 500 > 0 ? 'tone-pos' : row.bankroll - 500 < 0 ? 'tone-neg' : ''}` },
              fmtSigned(row.bankroll - 500))))))),
  );
}

// =============================================================== ACCOUNT
export function viewAccount() {
  const me = activeProfile();
  const s = getState();
  const myLedger = s.ledger.filter((l) => l.userId === me.id).slice(0, 30);

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' }, h('h2', {}, 'Account')),
    h('div', { class: 'card stack' },
      h('div', { class: 'acct-head' },
        h('div', { class: 'avatar' }, me.name[0].toUpperCase()),
        h('div', {}, h('strong', {}, me.name), h('div', { class: 'muted small' }, me.email || 'no email set')),
        h('div', { class: 'mono acct-balance' }, fmtCr(me.credits))),
      h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn ghost',
          onclick: () => { s.session.activeProfileId = null; commit('signed-out'); go('#/auth'); },
        }, 'Sign out'),
        h('button', { class: 'btn ghost', onclick: () => go('#/steward') }, 'Steward panel'))),
    h('h3', { class: 'section-title' }, 'Credit ledger'),
    h('div', { class: 'card' },
      myLedger.length ? h('div', { class: 'ledger' }, myLedger.map((l) =>
        h('div', { class: 'ledger-row' },
          h('div', {}, l.reason, h('div', { class: 'micro muted' }, timeAgo(l.ts))),
          h('div', { class: `mono ${l.delta > 0 ? 'tone-pos' : 'tone-neg'}` }, fmtSigned(l.delta)))))
        : h('p', { class: 'muted' }, 'No movements yet.')),
    h('div', { class: 'card notice' },
      h('strong', {}, 'Play responsibly. '),
      'Racing Empire’s credits are play money. A real-money version of this product is a licensed gambling operation in most jurisdictions — see the README before taking a penny from anyone.'));
}

// =============================================================== STEWARD
export function viewSteward() {
  const s = getState();
  const next = nextRace();
  const busy = { on: false };

  const run = async (fn, label) => {
    if (busy.on) return;
    busy.on = true;
    try { await fn(); } finally { busy.on = false; }
    if (label) toast(label);
  };

  return h('div', { class: 'page' },
    h('div', { class: 'page-head' },
      h('div', {}, h('h2', {}, 'Steward panel'),
        h('p', { class: 'muted' }, 'Demo-mode race control. With a live data feed connected, results arrive on their own and this panel disappears.'))),
    h('div', { class: 'card stack' },
      h('p', {}, next
        ? `Next off: ${next.time} at ${next.course} — ${next.name}.`
        : 'All races on the current card have run.'),
      h('div', { class: 'btn-row' },
        h('button', {
          class: 'btn primary', disabled: !next,
          onclick: () => run(async () => {
            const r = await runNextRace();
            if (r) {
              const w = r.runners.find((x) => x.id === r.result.order[0]);
              toast(`${r.time} ${r.course}: ${w.name} wins at ${fracStr(r.result.sp[w.id])}`);
            }
          }),
        }, 'Run next race'),
        h('button', {
          class: 'btn ghost', disabled: !next,
          onclick: () => run(runFullDay, 'Full card completed — bets and competitions settled'),
        }, 'Run the full card'),
        h('button', {
          class: 'btn ghost',
          onclick: () => run(startNewRaceDay, 'Fresh racecards published'),
        }, 'Start next race day'))),
    h('div', { class: 'card stack' },
      h('h3', {}, 'Danger zone'),
      h('p', { class: 'muted small' }, 'Wipes every profile, bet, league and competition in this browser.'),
      h('button', {
        class: 'btn danger',
        onclick: () => modal('Reset everything?',
          h('p', {}, 'This deletes all local Racing Empire data. There is no undo.'),
          [{
            label: 'Reset', kind: 'danger',
            onClick: (close) => { resetAll(); ensureWorld().then(() => { close(); go('#/auth'); }); },
          }]),
      }, 'Reset all data')));
}
