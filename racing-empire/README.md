# Racing Empire 🏇

A tipping-competition app for horse racing: sign up, join a league, manage a
bankroll of credits, back your judgement on the day's racecards, and buy in to
pot competitions where the top three tipsters share the prize pool.

Zero build step, zero dependencies — static files that run anywhere
(`site/`-style, same as the sweepstake app in this repo). Open `index.html`
over any static server and play.

```sh
python3 -m http.server 8282 --directory racing-empire
# → http://localhost:8282
```

## What's in the box

| Feature | Detail |
|---|---|
| **Accounts & credits** | Sign up, get a 1,000-credit welcome bankroll. Every credit movement is written to an auditable ledger. |
| **Racecards** | Timeform-shaped cards: ratings, 1–5 stars, analyst flags (course-and-distance, top-rated, improver…), form figures, going, draw, jockey/trainer, generated jockey silks, and a written verdict per race. |
| **Betting** | Win and each-way at fixed fractional odds, with real UK place terms by field size (2 places at 1/4 in fields of 5–7, 3 at 1/5 in non-handicaps of 8+, up to 4 places in big-field handicaps). Settlement is automatic when results arrive. |
| **Leagues** | Create a league, share its invite code, and compete on a season table ranked by profit and ROI. A public "Racing Empire Open" league is always on. |
| **Competitions** | Daily pot competitions: pay the entry fee in credits, receive a fixed 500-credit tournament bankroll, and bet it across the competition's races. Pot = entries × fee; the top three take 60 / 25 / 15. Unfinished competitions refund automatically. |
| **AI field** | Seven bot tipsters with distinct styles (favourite-backers, value hunters, form students, longshot romantics) enter competitions and populate league tables, so the game is alive from the first minute. |
| **Steward panel** | Demo-mode race control: run the next race, run the whole card, publish the next day's cards, or reset the world. |

## Architecture

```
racing-empire/
  index.html        app shell
  css/style.css     design system (racing green / ivory / gold, serif display type)
  js/
    data.js         racing data: provider interface, odds ladder, racecard
                    generator, race simulator, Timeform-style flags
    store.js        single persisted state tree (localStorage), ledger, pub/sub
    engine.js       domain rules: betting, place terms, settlement, leagues,
                    pot competitions, bot brains, race-day lifecycle
    ui.js           rendering toolkit: element builder, formatters, silks SVG,
                    stat tiles, diverging profit bars, toasts, modals
    views.js        one function per screen
    app.js          boot + hash router + chrome
```

Design decisions worth knowing:

- **One state tree, re-render on commit.** State is small; views re-render
  wholesale on every mutation. No framework, no stale-UI bugs.
- **Odds are fractions, not floats.** Prices live on the standard British
  ladder (`{num, den}`), so `13/8` displays exactly and settlement maths is
  derived, never parsed.
- **All racing data flows through `RacingDataProvider`** — three methods.
  The bundled `LocalFixtureProvider` generates deterministic, realistic cards
  and simulates results (Plackett–Luce over implied probabilities). Swapping
  in a live feed touches nothing outside `data.js`.

## Connecting a real racing data feed

Timeform's data feed is licensed commercially (contact
[timeform.com](https://www.timeform.com) — you get REST endpoints and
credentials under contract). Self-serve alternatives that work the same way:
[The Racing API](https://www.theracingapi.com) and
[Betfair's Exchange API](https://developer.betfair.com).

Implement the `TimeformProvider` skeleton at the bottom of `js/data.js`:

1. `getRaceDay(dayIndex, isoDate)` → fetch the day's racecards and map them to
   the `{meetings, races}` shape produced by `generateRaceDay()` (each runner
   needs `name / jockey / trainer / form / rating / odds:{num,den}`; stars and
   flags map from the feed's ratings and analyst symbols).
2. `getResult(race)` → fetch the official result and return
   `{order: [runnerId…], sp: {runnerId: {num,den}}}`.
3. Set `export const provider = new TimeformProvider({...})`.

With a live feed, results arrive on their own schedule, so hide the Steward
panel and settle on a poll or webhook instead of the "Run next race" button.
Keep API keys server-side — put a tiny proxy (Netlify/Cloudflare function) in
front of the feed rather than shipping credentials to the browser.

## Going to production — read this before taking real money

The demo keeps everything client-side on purpose. A real deployment needs:

- **A backend.** `store.js` is the seam: replace localStorage with an API
  (Postgres + a thin server, or Supabase/Firebase). Settlement, competition
  payouts and the ledger **must** run server-side — anything in the browser
  can be forged. The engine module is deliberately DOM-free so it can move to
  the server as-is.
- **Real auth.** The current sign-in is a demo profile switcher, not security.
- **A gambling licence.** Paid-entry competitions with cash prizes are
  regulated gambling in most places (UKGC pool-betting/gaming licence in the
  UK, state-by-state rules in the US and Australia). Genuinely free-to-play
  leagues with credits are generally fine; the moment entry fees and payouts
  are real money you need a licence, KYC/age verification, segregated player
  funds, and responsible-gambling tooling. Ship the credits version first.
- **Payments.** Once licensed, entry fees and payouts slot in where
  `adjustCredits` is called for competition entry and prizes (Stripe or a
  gambling-friendly PSP; many mainstream PSPs prohibit gambling flows).

## Deploying

Same options as the sweepstake site: `netlify deploy --prod --dir=racing-empire`,
drag the folder onto https://app.netlify.com/drop, or serve it from GitHub
Pages. Everything is relative-pathed, so it works from any subpath.
