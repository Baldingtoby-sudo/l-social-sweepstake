#!/usr/bin/env bash
# Fetch latest results, update site/index.html, deploy to Netlify.
# Skips the deploy when nothing changed (so it can run on a timer).
# Use --force to deploy regardless.
set -euo pipefail
cd "$(dirname "$0")"

echo "── $(date '+%Y-%m-%d %H:%M:%S') ──"

before=$(shasum site/index.html | cut -d' ' -f1)
node update-results.js
after=$(shasum site/index.html | cut -d' ' -f1)

if [[ "$before" == "$after" && "${1:-}" != "--force" ]]; then
  echo "No new results — skipping deploy."
  exit 0
fi

if ! command -v netlify >/dev/null 2>&1; then
  echo "Netlify CLI not found. Install with: npm install -g netlify-cli"
  echo "(or drag the site/ folder onto https://app.netlify.com/drop)"
  exit 1
fi

# Only the site/ folder is published — never the API key or scripts
netlify deploy --prod --dir=site
