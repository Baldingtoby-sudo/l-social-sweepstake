# Base World Cup Sweepstake

Single-file sweepstake app for 8 players tracking World Cup 2026 results, with a
script that pulls results from football-data.org and rewrites the data arrays
automatically.

```
site/index.html     the app (this is the only thing that gets deployed)
update-results.js   fetches WC2026 results and rewrites the arrays in site/index.html
deploy.sh           update + deploy to Netlify in one command
fixtures/           sample API payloads for offline testing
```

## One-time setup

1. Get a free API key: https://www.football-data.org/client/register
2. Create `.env` in this folder:
   ```
   FOOTBALL_DATA_API_KEY=your_key_here
   ```
3. For one-command deploys: `npm install -g netlify-cli && netlify login`,
   then `netlify link` (or `netlify init`) in this folder to connect the site.

## After each game week

```sh
./deploy.sh
```

That fetches all finished matches, rebuilds RESULTS / GROUP_FINISHES / EXITS,
rewrites `site/index.html`, and deploys to Netlify. Or run the steps separately:

```sh
node update-results.js --dry-run    # preview what would change
node update-results.js              # rewrite site/index.html only
netlify deploy --prod --dir=site    # deploy
```

You can also skip the CLI entirely and drag the `site/` folder onto
https://app.netlify.com/drop

## Automatic updates (installed)

A macOS LaunchAgent (`~/Library/LaunchAgents/com.lsocial.sweepstake.update.plist`)
runs `deploy.sh` every 30 minutes while the laptop is awake. The script only
deploys when results actually changed, so most runs are no-ops. Activity is
logged to `deploy.log` in this folder.

```sh
tail -20 deploy.log                                                  # see recent runs
launchctl kickstart gui/$(id -u)/com.lsocial.sweepstake.update       # run right now
launchctl bootout gui/$(id -u)/com.lsocial.sweepstake.update         # turn off (after the final!)
```

## How the script maps things

- The script rebuilds all three arrays from scratch on every run (idempotent),
  splicing them between `/* AUTO:...:START/END */` markers in the HTML.
- API team names are normalised (Czechia → Czech Rep., Türkiye → Turkey,
  Côte d'Ivoire → Ivory Coast, Korea Republic → South Korea, Cabo Verde →
  Cape Verde, etc). Unrecognised names are skipped with a warning — if you see
  one, add it to `ALIASES` in update-results.js.
- Group matches get gw 1–3 from the API matchday; knockout rounds get gw 4–9
  and the Results tab shows them as round names.
- Knockout games decided on penalties keep the level scoreline but carry a
  `winner` field so the right team gets the win points and the loser exits.
- GROUP_FINISHES is filled per group as soon as all four teams have played 3.
- EXITS: R32/R16/QF losers exit at that round; semi-final losers wait for the
  3rd-place game (winner → '3rd', loser → '4th'); the final produces
  'win' and 'final'.

## Local preview

```sh
python3 -m http.server 8181 --directory site
```
