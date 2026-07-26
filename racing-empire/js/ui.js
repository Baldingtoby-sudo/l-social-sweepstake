/*
 * ui.js — small rendering toolkit: element builder, formatters, silks,
 * stars, toasts and modals. No app state in here.
 */

import { fracStr, dec, FLAG_DEFS } from './data.js';

// ------------------------------------------------------------ element builder
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;           // trusted, app-built strings only
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------------------------------------------------------------- formatters
export const fmtCr = (n) => `${Number(n).toLocaleString('en-GB', {
  minimumFractionDigits: 0, maximumFractionDigits: 2,
})} cr`;

export const fmtSigned = (n) => `${n > 0 ? '+' : ''}${Number(n).toLocaleString('en-GB', {
  minimumFractionDigits: 0, maximumFractionDigits: 2,
})}`;

export const fmtPct = (x) => `${Math.round(x * 100)}%`;
export const fmtOdds = fracStr;
export const fmtDec = (o) => dec(o).toFixed(2);
export const fmtPrize = (n) => `£${Number(n).toLocaleString('en-GB')}`;

export function timeAgo(ts) {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const hrs = Math.round(m / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.round(hrs / 24)}d ago`;
}

// --------------------------------------------------------------------- silks
const SILK_PATHS = {
  stripes: '<rect x="9" y="2" width="3.5" height="16" /><rect x="15.5" y="2" width="3.5" height="16" />',
  hoops: '<rect x="4" y="6" width="20" height="3" /><rect x="4" y="12" width="20" height="3" />',
  chevron: '<path d="M4 12 L14 5 L24 12 L24 16 L14 9 L4 16 Z" />',
  star: '<path d="M14 4.5 L16 9.5 L21.5 9.8 L17.3 13.2 L18.8 18.5 L14 15.4 L9.2 18.5 L10.7 13.2 L6.5 9.8 L12 9.5 Z" />',
  sash: '<path d="M4 3 L10 3 L24 17 L24 18 L18 18 Z" />',
  quarters: '<path d="M14 2 L14 18 L24 18 L24 10 L14 10 L14 2 L4 2 L4 10 L14 10 Z" fill-rule="evenodd" />',
  spots: '<circle cx="9" cy="7" r="2.2"/><circle cx="19" cy="7" r="2.2"/><circle cx="14" cy="12" r="2.2"/><circle cx="9" cy="16" r="2.2"/><circle cx="19" cy="16" r="2.2"/>',
  plain: '',
};

/** Jockey silks as a small inline SVG jersey. */
let silkSeq = 0;
export function silks({ c1, c2, pattern }) {
  const overlay = (SILK_PATHS[pattern] || '')
    ? `<g fill="${c2}">${SILK_PATHS[pattern]}</g>` : '';
  const clipId = `silk-clip-${++silkSeq}`;
  const svg = `
    <svg viewBox="0 0 28 20" width="28" height="20" aria-hidden="true">
      <path d="M8 2 Q14 5 20 2 L26 6 L23 10 L21 8 L21 18 L7 18 L7 8 L5 10 L2 6 Z"
            fill="${c1}" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>
      <clipPath id="${clipId}"><path d="M8 2 Q14 5 20 2 L26 6 L23 10 L21 8 L21 18 L7 18 L7 8 L5 10 L2 6 Z"/></clipPath>
      <g clip-path="url(#${clipId})">${overlay}</g>
    </svg>`;
  return h('span', { class: 'silks', html: svg });
}

// --------------------------------------------------------------------- stars
export function stars(n) {
  return h('span', {
    class: 'stars',
    title: `${n} of 5 on Racing Empire figures`,
    'aria-label': `${n} out of 5 stars`,
  }, '★'.repeat(n) + '☆'.repeat(5 - n));
}

export function flagChips(flags) {
  return flags.map((f) => h('abbr', { class: 'flag', title: FLAG_DEFS[f] || f }, f));
}

// --------------------------------------------------------------------- toast
let toastTimer = null;
export function toast(msg, kind = 'ok') {
  let el = document.querySelector('.toast');
  if (!el) { el = h('div', { class: 'toast', role: 'status' }); document.body.append(el); }
  el.textContent = msg;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3400);
}

// --------------------------------------------------------------------- modal
export function modal(title, bodyEl, actions = []) {
  const close = () => wrap.remove();
  const wrap = h('div', { class: 'modal-wrap', onclick: (e) => { if (e.target === wrap) close(); } },
    h('div', { class: 'modal card', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', {}, h('h3', {}, title),
        h('button', { class: 'btn ghost icon', onclick: close, 'aria-label': 'Close' }, '✕')),
      h('div', { class: 'modal-body' }, bodyEl),
      actions.length ? h('footer', {}, actions.map(({ label, kind, onClick }) =>
        h('button', {
          class: `btn ${kind || 'primary'}`,
          onclick: () => { if (onClick(close) !== false) { /* action decides */ } },
        }, label))) : null,
    ));
  document.body.append(wrap);
  return { close };
}

// ------------------------------------------------------------------ stat tile
/** Hero-number stat tile (dataviz: a single headline is a tile, not a chart). */
export function statTile(label, value, { sub = null, tone = null } = {}) {
  return h('div', { class: 'stat card' },
    h('div', { class: 'stat-label' }, label),
    h('div', { class: `stat-value${tone ? ` tone-${tone}` : ''}` }, value),
    sub ? h('div', { class: 'stat-sub' }, sub) : null);
}

/**
 * Signed profit bar for leaderboard rows — a diverging encoding (positive /
 * negative poles around a zero midline) with the number always printed, so
 * colour never carries the value alone.
 */
export function profitBar(profit, maxAbs) {
  const scale = maxAbs > 0 ? Math.min(1, Math.abs(profit) / maxAbs) : 0;
  const bar = h('div', { class: 'pbar', 'aria-hidden': 'true' },
    h('div', {
      class: `pbar-fill ${profit >= 0 ? 'pos' : 'neg'}`,
      style: `width:${Math.round(scale * 50)}%;${profit >= 0 ? 'left:50%' : `right:50%`}`,
    }));
  return h('div', { class: 'pbar-cell' },
    h('span', { class: `mono ${profit > 0 ? 'tone-pos' : profit < 0 ? 'tone-neg' : ''}` },
      fmtSigned(profit)), bar);
}
