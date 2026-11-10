import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const SCRIPTS = ['js/util.js', 'js/engine.js', 'js/map.js', 'js/ai.js', 'js/audio.js', 'js/ui.js'];

// Pull the <body> markup out of index.html so we test the real DOM structure.
const html = read('index.html');
const bodyMarkup = html.slice(html.indexOf('<body'), html.lastIndexOf('<script'));

export const DEFAULT_SEED = 20241109;

// Game delays (animation queue, AI "thinking" time) in ms. Zero by default so tests run instantly;
// override with e.g. `TEST_WAIT_MS=150 npm test` to watch behaviour at a realistic pace.
export const WAIT_TIME = Number(process.env.TEST_WAIT_MS ?? 0);

// Overrides the game's timing so every scheduled step runs after `ms` instead of its normal delay.
export function setWaitTime(w, ms = WAIT_TIME) {
  w.minimumAIThinkingTime = ms;
  w.maximumAIThinkingTime = ms;
  const original = w.oneAtATime;
  if (!original.isWaitTimeWrapper) {
    w.oneAtATime = (duration, fn) => original(ms, fn);
    w.oneAtATime.isWaitTimeWrapper = true;
  }
}

// mulberry32: small, fast, reproducible PRNG. Returns values in [lo, hi) (default [0, 1)).
export function seededRandom(seed, lo = 0, hi = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return lo + r * (hi - lo);
  };
}

// Replaces the window's Math.random with a seeded generator.
export function seed(w, value = DEFAULT_SEED, lo = 0, hi = 1) {
  w.Math.random = seededRandom(value, lo, hi);
}

// Seeded generators biased so that every duel in a fight goes to the attacker / defender.
export const seedAttackerWins = (w, value = DEFAULT_SEED) => seed(w, value, 0.9, 1);
export const seedAttackerLoses = (w, value = DEFAULT_SEED) => seed(w, value, 0, 0.01);

/**
 * Boots the game's classic (global-scope) scripts inside a fresh jsdom window.
 * erisk.js is skipped (it only wires window.onload); tests drive startup explicitly.
 * `storage` lets a test pre-populate localStorage.
 */
export function loadGame({ storage = {}, randomSeed = DEFAULT_SEED, waitTime = WAIT_TIME } = {}) {
  const dom = new JSDOM(`<!DOCTYPE html><html>${bodyMarkup}</html>`, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const w = dom.window;
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  w.console.log = () => {};
  w.eval(SCRIPTS.map(read).join('\n;\n'));
  seed(w, randomSeed);
  setWaitTime(w, waitTime);
  return w;
}

// Simulates a refresh: new window and scripts, but the same localStorage contents.
export function reloadGame(oldWindow) {
  const saved = {};
  for (let i = 0; i < oldWindow.localStorage.length; i++) {
    const key = oldWindow.localStorage.key(i);
    saved[key] = oldWindow.localStorage.getItem(key);
  }
  oldWindow.close();
  return loadGame({ storage: saved });
}

// Builds a small, fully deterministic board:  0 - 1 - 2 - 3 (a line of regions).
// Players: 0 = Amber (human), 1 = Crimson (AI).
export function makeLineState(w, { regions = 4, setup = {} } = {}) {
  Object.assign(w.gameSetup, { tc: 12, l: 0 }, setup);
  const rs = [];
  for (let i = 0; i < regions; i++) rs.push({ i, p: [], n: [], d: [] });
  rs.forEach((r, i) => {
    if (i > 0) r.n.push(rs[i - 1]);
    if (i < regions - 1) r.n.push(rs[i + 1]);
  });
  const players = [0, 1].map((i) => {
    const p = w.deepCopy(w.PLAYER_TEMPLATES[i], 1);
    p.i = i;
    p.u = i === 0 ? w.uiPickMove : w.aiPickMove;
    if (i === 1) p.p = { s: 0.3, u: [w.WATER] };
    return p;
  });
  return {
    p: players, r: rs, o: {}, t: {}, s: {}, c: { 0: 0, 1: 0 }, l: { 0: 0, 1: 0 },
    m: { t: 1, p: 0, m: w.MOVE_ARMY, l: w.movesPerTurn }
  };
}

// Assigns a region to a player with N soldiers (player may be null for neutral).
export function place(w, state, regionIndex, playerIndex, soldiers, temple) {
  if (playerIndex !== null) state.o[regionIndex] = state.p[playerIndex];
  if (soldiers) w.addSoldiers(state, state.r[regionIndex], soldiers);
  if (temple) state.t[regionIndex] = { r: state.r[regionIndex], i: regionIndex };
  return state;
}

// Silences the animation queue so engine calls never schedule timers in unit tests.
export function stubDisplay(w) {
  w.oneAtATime = () => {};
  w.showBanner = () => {};
  w.updateDisplay = () => {};
}
