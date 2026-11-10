import { loadGame } from './loadGame.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(cond, timeout = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const v = cond();
    if (v) return v;
    await sleep(5);
  }
  throw new Error('waitFor timed out: ' + cond);
}

export const q = (w, id) => w.document.getElementById(id);
export const click = (w, id) => q(w, id).click();
export const text = (w, id) => q(w, id).textContent;

// Player button ids are "sb<player><n>": n = 2 AI, 1 Human, 0 Off.
export const SB = { AI: 2, HUMAN: 1, OFF: 0 };
export const setPlayer = (w, player, kind) => click(w, `sb${player}${kind}`);

// Buttons rendered into #u (the bottom action bar).
export const bottomButtons = (w) => Array.from(w.document.querySelectorAll('#u a'));
export const clickBottom = (w, label) => {
  const b = bottomButtons(w).find((a) => a.textContent.trim().startsWith(label));
  if (!b) throw new Error('No button "' + label + '" in: ' + bottomButtons(w).map((a) => a.textContent));
  b.click();
};

// Boots the setup screen the way erisk.js does after window.onload (without the 500ms delay).
export function bootSetup(opts) {
  const w = loadGame(opts);
  w.gameSetup = w.getSetupFromStorage();
  w.setupAudio();
  w.runSetupScreen();
  w.setupTitleScreen();
  return w;
}

// Two human players, so a whole game can be played without any AI thinking delays.
export function startHotseatGame(opts) {
  const w = bootSetup(opts);
  setPlayer(w, 0, SB.HUMAN);
  setPlayer(w, 1, SB.HUMAN);
  setPlayer(w, 2, SB.OFF);
  setPlayer(w, 3, SB.OFF);
  clickBottom(w, 'Start game');
  return w;
}

// The latest state shown on screen.
export const current = (w) => w.displayedState;

// Waits until the active player is waiting for a human (UI callbacks registered).
export const waitForHumanTurn = (w) => waitFor(() => w.uiCallbacks.c && w.uiCallbacks.b);

export function regionOwnedBy(w, state, playerIndex, minSoldiers = 1) {
  return state.r.find((r) => w.owner(state, r) === state.p[playerIndex] && w.soldierCount(state, r) >= minSoldiers);
}
