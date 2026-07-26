/*
 * data.js — racing data layer.
 *
 * Everything the app knows about horses arrives through a RacingDataProvider.
 * The bundled LocalFixtureProvider generates realistic, Timeform-shaped
 * racecards (ratings, stars, flags, verdicts, going, form figures) so the app
 * is fully usable offline. To go live, implement the same three methods
 * against a real feed (Timeform, The Racing API, Betfair) — see
 * TimeformProvider at the bottom and README.md for the mapping guide.
 */

// ---------------------------------------------------------------- odds ladder
// Standard British fractional ladder. Odds are stored as {num, den}; decimal
// and implied probability are derived, so fractional display is always exact.
export const ODDS_LADDER = [
  [1, 8], [1, 6], [1, 4], [2, 7], [1, 3], [2, 5], [1, 2], [8, 15], [4, 7],
  [8, 13], [4, 6], [8, 11], [4, 5], [5, 6], [10, 11], [1, 1], [11, 10],
  [6, 5], [5, 4], [11, 8], [6, 4], [13, 8], [7, 4], [15, 8], [2, 1],
  [9, 4], [5, 2], [11, 4], [3, 1], [10, 3], [7, 2], [4, 1], [9, 2],
  [5, 1], [11, 2], [6, 1], [13, 2], [7, 1], [15, 2], [8, 1], [9, 1],
  [10, 1], [11, 1], [12, 1], [14, 1], [16, 1], [18, 1], [20, 1], [25, 1],
  [33, 1], [40, 1], [50, 1], [66, 1],
];

export const dec = (o) => o.num / o.den + 1;
export const fracStr = (o) => (o.num === o.den ? 'Evs' : `${o.num}/${o.den}`);
export const implied = (o) => 1 / dec(o);

function nearestOdds(decimal) {
  let best = ODDS_LADDER[0];
  for (const o of ODDS_LADDER) {
    if (Math.abs(dec({ num: o[0], den: o[1] }) - decimal) <
        Math.abs(dec({ num: best[0], den: best[1] }) - decimal)) best = o;
  }
  return { num: best[0], den: best[1] };
}

// ------------------------------------------------------------------ seed pools
const COURSES = [
  { name: 'Ascot', country: 'UK', style: 'Galloping, right-handed' },
  { name: 'York', country: 'UK', style: 'Flat, left-handed' },
  { name: 'Cheltenham', country: 'UK', style: 'Undulating, left-handed' },
  { name: 'Newmarket', country: 'UK', style: 'Wide, galloping' },
  { name: 'Goodwood', country: 'UK', style: 'Sharp, undulating' },
  { name: 'The Curragh', country: 'IRE', style: 'Galloping, right-handed' },
  { name: 'Doncaster', country: 'UK', style: 'Flat, left-handed' },
  { name: 'Sandown Park', country: 'UK', style: 'Stiff, right-handed' },
  { name: 'Leopardstown', country: 'IRE', style: 'Galloping, left-handed' },
  { name: 'Haydock Park', country: 'UK', style: 'Flat, left-handed' },
];

const HORSE_A = ['Midnight', 'Golden', 'Silent', 'Royal', 'Velvet', 'Iron',
  'Crimson', 'Northern', 'Whispering', 'Emerald', 'Thunder', 'Silver',
  'Wandering', 'Bold', 'Lucky', 'Winter', 'Dancing', 'Highland', 'Rebel',
  'Sovereign', 'Atlantic', 'Copper', 'Mystic', 'Gallant', 'Amber'];
const HORSE_B = ['Empire', 'Runner', 'Whisper', 'Storm', 'Duchess', 'Baron',
  'Arrow', 'Lights', 'Meadow', 'Crown', 'Voyage', 'Shadow', 'Promise',
  'Harbour', 'Legend', 'Sonata', 'Falcon', 'Mirage', 'Tempest', 'Ridge',
  'Comet', 'Fable', 'Banner', 'Echo', 'Drift'];

const JOCKEYS = ['R. Kingscote', 'H. Doyle', 'W. Buick', 'T. Marquand',
  'O. Murphy', 'S. De Sousa', 'L. Morris', 'D. Probert', 'C. Fallon',
  'R. Havlin', 'K. Shoemark', 'N. Currie', 'J. Watson', 'P. Cosgrave',
  'B. Curtis', 'D. Muscutt'];
const TRAINERS = ['A. Balding', 'J. Gosden', 'C. Appleby', 'W. Haggas',
  'R. Varian', 'A. O’Brien', 'K. Burke', 'D. O’Meara', 'R. Beckett',
  'E. Walker', 'H. Palmer', 'G. Boughey'];

const GOINGS = ['Firm', 'Good to Firm', 'Good', 'Good to Soft', 'Soft', 'Heavy'];

const RACE_NAMES = [
  '{s} Maiden Stakes', '{s} Handicap', '{s} Novice Stakes',
  '{s} Conditions Stakes', '{s} Fillies’ Handicap', '{s} Nursery Handicap',
  '{s} Classified Stakes', '{s} Listed Stakes',
];
const SPONSORS = ['Golden Mile', 'Summer Series', 'Racing Empire', 'Champions Day',
  'Silver Salver', 'Founders’ Cup', 'Twilight', 'Heritage', 'Guineas Trial',
  'Autumn Double'];

const DISTANCES = ['5f', '6f', '7f', '1m', '1m 2f', '1m 4f', '1m 6f', '2m'];

// Timeform-style short flags → meaning (surfaced as tooltips in the UI).
export const FLAG_DEFS = {
  hf: 'Horse in Focus — strong recent performance worth marking up',
  wo: 'Warning horse — market drift or negative signals last time',
  jc: 'Jockey uplift — significant rider booking',
  ts: 'Top-rated on Timeform-style figures for this race',
  fg: 'Flag: improver — open to further progress',
  cd: 'Course & distance winner',
  bf: 'Beaten favourite last time out',
};

const SILK_COLOURS = ['#c8493f', '#2f6fb2', '#2e8a5c', '#d8a531', '#7b4fa6',
  '#d97b2f', '#3aa6a6', '#a63a6b', '#5a6b3a', '#28323c', '#e0dccc', '#8a5a3a'];
const SILK_PATTERNS = ['plain', 'stripes', 'hoops', 'chevron', 'star', 'sash',
  'quarters', 'spots'];

// ------------------------------------------------------------- seeded random
// Deterministic PRNG so a given race day is reproducible from its seed.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const shuffled = (rnd, arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function formFigures(rnd, ability) {
  // Better horses draw lower finishing figures more often.
  let s = '';
  for (let i = 0; i < 5; i++) {
    if (rnd() < 0.08) { s += '-'; continue; }
    const r = rnd();
    const bias = ability / 140;
    let fig;
    if (r < 0.28 * bias + 0.06) fig = 1;
    else if (r < 0.5 * bias + 0.16) fig = 1 + Math.ceil(rnd() * 2);
    else fig = 1 + Math.ceil(rnd() * 8);
    s += fig > 9 ? '0' : String(fig);
  }
  return s;
}

// -------------------------------------------------------- racecard generation
function makeRunner(rnd, i, usedNames) {
  let name;
  do { name = `${pick(rnd, HORSE_A)} ${pick(rnd, HORSE_B)}`; }
  while (usedNames.has(name));
  usedNames.add(name);

  const rating = 70 + Math.round(rnd() * 65);           // Timeform-ish 70–135
  const flags = Object.keys(FLAG_DEFS).filter(() => rnd() < 0.14);
  return {
    id: `rn_${Math.floor(rnd() * 1e9).toString(36)}_${i}`,
    number: i + 1,
    draw: 0,                                            // assigned later
    name,
    age: 3 + Math.floor(rnd() * 6),
    weight: `${8 + Math.floor(rnd() * 2)}-${Math.floor(rnd() * 14)}`,
    jockey: pick(rnd, JOCKEYS),
    trainer: pick(rnd, TRAINERS),
    form: formFigures(rnd, rating),
    rating,
    stars: 0,                                           // assigned from rank
    flags,
    silks: {
      c1: pick(rnd, SILK_COLOURS),
      c2: pick(rnd, SILK_COLOURS),
      pattern: pick(rnd, SILK_PATTERNS),
    },
    odds: { num: 1, den: 1 },                           // assigned later
    nonRunner: false,
  };
}

function priceField(rnd, runners) {
  // Convert ratings to implied win chances, add market noise, apply a bookish
  // ~112% overround, then snap each price to the fractional ladder.
  const strengths = runners.map((r) => Math.exp((r.rating + rnd() * 14) / 11));
  const total = strengths.reduce((a, b) => a + b, 0);
  runners.forEach((r, i) => {
    const p = (strengths[i] / total) * 1.12;
    const decimal = Math.min(67, Math.max(1.12, 1 / p));
    r.odds = nearestOdds(decimal);
  });
  // Stars: 5 for the top-rated, down to 1 for the rest of the field.
  const byRating = runners.slice().sort((a, b) => b.rating - a.rating);
  byRating.forEach((r, idx) => {
    r.stars = idx === 0 ? 5 : idx === 1 ? 4 : idx <= 3 ? 3 : idx <= 5 ? 2 : 1;
  });
  byRating[0].flags = [...new Set(['ts', ...byRating[0].flags])];
}

function verdictFor(rnd, race) {
  const fav = race.runners.slice().sort((a, b) => dec(a.odds) - dec(b.odds))[0];
  const danger = race.runners.slice().sort((a, b) => b.rating - a.rating)
    .find((r) => r.id !== fav.id);
  const lines = [
    `${fav.name} sets the standard on these figures and is feared most.`,
    `${fav.name} brings the strongest profile and should go close.`,
    `Hard to get away from ${fav.name}, who ticks the most boxes here.`,
  ];
  return `${pick(rnd, lines)} ${danger ? `${danger.name} is the chief danger for ${danger.trainer}.` : ''}`;
}

/** Generate one full race day (several meetings) from a numeric seed. */
export function generateRaceDay(dayIndex, isoDate) {
  const rnd = mulberry32(0xE11 + dayIndex * 7919);
  const meetings = [];
  const races = {};
  const usedCourses = shuffled(rnd, COURSES).slice(0, 3 + (dayIndex % 2));

  usedCourses.forEach((course, mi) => {
    const meetingId = `mtg_${dayIndex}_${mi}`;
    const going = pick(rnd, GOINGS);
    const raceIds = [];
    const nRaces = 5 + Math.floor(rnd() * 3);
    const firstOff = 13 * 60 + mi * 10;                 // stagger meetings

    for (let ri = 0; ri < nRaces; ri++) {
      const raceId = `race_${dayIndex}_${mi}_${ri}`;
      const offMin = firstOff + ri * 35;
      const usedNames = new Set();
      const n = 6 + Math.floor(rnd() * 9);              // 6–14 runners
      const runners = Array.from({ length: n }, (_, i) => makeRunner(rnd, i, usedNames));
      shuffled(rnd, runners.map((_, i) => i + 1)).forEach((d, i) => { runners[i].draw = d; });
      priceField(rnd, runners);

      const race = {
        id: raceId,
        meetingId,
        course: course.name,
        offMin,
        time: `${Math.floor(offMin / 60)}:${String(offMin % 60).padStart(2, '0')}`,
        name: pick(rnd, RACE_NAMES).replace('{s}', pick(rnd, SPONSORS)),
        distance: pick(rnd, DISTANCES),
        raceClass: `Class ${1 + Math.floor(rnd() * 5)}`,
        prize: 5000 + Math.floor(rnd() * 18) * 2500,
        going,
        runners,
        verdict: '',
        status: 'open',                                 // open | result
        result: null,                                   // {order:[runnerId], sp:{}}
      };
      race.verdict = verdictFor(rnd, race);
      races[raceId] = race;
      raceIds.push(raceId);
    }

    meetings.push({
      id: meetingId, course: course.name, country: course.country,
      style: course.style, going, date: isoDate, raceIds,
    });
  });

  return { meetings, races };
}

/**
 * Simulate a race result with a Plackett–Luce draw over implied win chances,
 * lightly blended with ratings. Used by the demo provider; a live provider
 * returns real results instead and none of this runs.
 */
export function simulateResult(race, rndFn) {
  const rnd = rndFn || Math.random;
  const field = race.runners.filter((r) => !r.nonRunner);
  const weights = field.map((r) => implied(r.odds) * 0.75 + (r.rating / 135) * 0.25);
  const order = [];
  const pool = field.map((r, i) => ({ r, w: weights[i] }));
  while (pool.length) {
    const total = pool.reduce((a, b) => a + b.w, 0);
    let t = rnd() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) { t -= pool[i].w; if (t <= 0) { idx = i; break; } }
    order.push(pool[idx].r.id);
    pool.splice(idx, 1);
  }
  const sp = {};
  field.forEach((r) => { sp[r.id] = { ...r.odds }; });
  return { order, sp };
}

// ------------------------------------------------------------------ providers
/**
 * Provider contract. All app code goes through these methods; swapping the
 * demo fixture provider for a live feed touches nothing else.
 */
export class RacingDataProvider {
  /** @returns {Promise<{meetings: object[], races: Record<string, object>}>} */
  async getRaceDay() { throw new Error('not implemented'); }
  /** @returns {Promise<object|null>} result for a race that has run */
  async getResult() { throw new Error('not implemented'); }
}

/** Bundled demo provider — generated cards + simulated results. */
export class LocalFixtureProvider extends RacingDataProvider {
  async getRaceDay(dayIndex, isoDate) { return generateRaceDay(dayIndex, isoDate); }
  async getResult(race) { return simulateResult(race); }
}

/**
 * Live-data skeleton. Timeform licenses its data feed commercially
 * (https://www.timeform.com) — you receive credentials and REST endpoints
 * under contract. Popular alternatives with self-serve keys: The Racing API
 * (theracingapi.com) and Betfair's Exchange API. Map their payloads into the
 * shapes produced by generateRaceDay() above; the rest of the app is agnostic.
 */
export class TimeformProvider extends RacingDataProvider {
  constructor({ baseUrl, apiKey }) { super(); this.baseUrl = baseUrl; this.apiKey = apiKey; }
  async getRaceDay() {
    // GET {baseUrl}/racecards?date=YYYY-MM-DD  → map to {meetings, races}
    throw new Error('Connect your licensed racing feed (see README.md).');
  }
  async getResult() {
    // GET {baseUrl}/results/{raceId}           → map to {order, sp}
    throw new Error('Connect your licensed racing feed (see README.md).');
  }
}

export const provider = new LocalFixtureProvider();
