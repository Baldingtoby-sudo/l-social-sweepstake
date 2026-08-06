/*
 * app.js — boot, hash router, and chrome (top bar + tab bar).
 * Views re-render wholesale on every store commit.
 */

import { initStore, subscribe, getState, activeProfile } from './store.js';
import { ensureWorld, nextRace } from './engine.js';
import { h, fmtCr } from './ui.js';
import {
  viewAuth, viewHome, viewRaces, viewRace, viewBets,
  viewLeagues, viewLeague, viewComps, viewComp, viewAccount, viewSteward,
} from './views.js';

const ROUTES = {
  auth: { render: viewAuth, public: true },
  home: { render: viewHome, nav: 'Today', icon: '◈' },
  races: { render: viewRaces, nav: 'Racecards', icon: '🏇' },
  race: { render: viewRace },
  bets: { render: viewBets, nav: 'My bets', icon: '🎫' },
  leagues: { render: viewLeagues, nav: 'Leagues', icon: '🏆' },
  league: { render: viewLeague },
  comps: { render: viewComps, nav: 'Competitions', icon: '💰' },
  comp: { render: viewComp },
  account: { render: viewAccount },
  steward: { render: viewSteward },
};

function parseHash() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  return { name: parts[0] || 'home', params: parts.slice(1) };
}

function chrome(routeName) {
  const me = activeProfile();
  const next = nextRace();
  const tabs = Object.entries(ROUTES).filter(([, r]) => r.nav);

  const top = h('header', { class: 'topbar' },
    h('a', { class: 'brand-sm', href: '#/home' }, '🏇 ', h('span', {}, 'Racing Empire')),
    next ? h('div', { class: 'topbar-next muted small' },
      'Next off ', h('strong', {}, `${next.time} ${next.course}`)) : null,
    h('a', { class: 'topbar-acct', href: '#/account' },
      h('span', { class: 'mono' }, fmtCr(me.credits)),
      h('span', { class: 'avatar sm' }, me.name[0].toUpperCase())));

  const nav = h('nav', { class: 'tabbar' },
    tabs.map(([name, r]) => h('a', {
      class: `tabbar-item${routeName === name || routeName === name.replace(/s$/, '') ? ' active' : ''}`,
      href: `#/${name}`,
    }, h('span', { class: 'tab-icon' }, r.icon), h('span', {}, r.nav))));

  return { top, nav };
}

let lastHash = null;

function render() {
  const root = document.getElementById('app');
  const me = activeProfile();
  let { name, params } = parseHash();

  if (!me && !ROUTES[name]?.public) { location.hash = '#/auth'; return; }
  if (me && name === 'auth') { location.hash = '#/home'; return; }
  const route = ROUTES[name] || ROUTES.home;

  root.replaceChildren();
  if (me && route !== ROUTES.auth) {
    const { top, nav } = chrome(name);
    root.append(top, h('main', { class: 'main' }, route.render(params)), nav);
  } else {
    root.append(h('main', { class: 'main full' }, route.render(params)));
  }
  if (location.hash !== lastHash) window.scrollTo(0, 0);   // keep scroll on same-view commits
  lastHash = location.hash;
}

async function boot() {
  initStore();
  await ensureWorld();
  subscribe(() => render());
  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = getState().session.activeProfileId ? '#/home' : '#/auth';
  render();
}

boot();
