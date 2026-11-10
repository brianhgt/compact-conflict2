import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { loadGame, makeLineState, place, stubDisplay, seed } from '../helpers/loadGame.js';
import { bootSetup, startHotseatGame, q, click, setPlayer, SB, bottomButtons, clickBottom, waitForHumanTurn, current } from '../helpers/ui.js';

let w;
afterEach(() => w && w.close());

describe('Edge cases: empty and invalid stored data', () => {
  const cases = {
    'no saved game': null,
    'empty string': '',
    'JSON null': 'null',
    'truncated JSON': '{"v":1,"r":[',
    'unknown save version': JSON.stringify({ v: 999 }),
    'valid JSON of the wrong shape': JSON.stringify({ v: 1 }),
    'an array': '[]',
    'a number': '42'
  };
  for (const [name, raw] of Object.entries(cases)) {
    it(`loadGame returns null and does not throw for: ${name}`, () => {
      w = loadGame({ storage: raw === null ? {} : { g: raw } });
      expect(() => w.loadGame()).not.toThrow();
      expect(w.loadGame()).toBeNull();
    });
  }

  it('falls back to default setup when nothing is stored', () => {
    w = loadGame();
    const setup = w.getSetupFromStorage();
    expect(setup.tc).toBe(12);
    expect(setup.p).toEqual([1, 2, 2, 0]);
  });

  it('saving silently survives a full / unavailable storage', () => {
    w = loadGame();
    stubDisplay(w);
    w.Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    const s = makeLineState(w);
    place(w, s, 0, 0, 1);
    place(w, s, 3, 1, 1);
    expect(() => w.saveGame(s)).not.toThrow();
  });

  it('clearing a missing save is a no-op', () => {
    w = loadGame();
    expect(() => w.clearSavedGame()).not.toThrow();
  });

  it('a corrupt settings record makes the game scripts fail at load (known limitation of getSetupFromStorage)', () => {
    expect(() => loadGame({ storage: { s: '{not json' } })).toThrow();
  });
});

describe('Edge cases: helper functions with empty or degenerate input', () => {
  beforeEach(() => { w = loadGame(); });

  it('range, sum and pairwise handle empty and single inputs', () => {
    expect(Array.from(w.range(0, 0))).toEqual([]);
    expect(w.sum([], (x) => x)).toBe(0);
    expect(Array.from(w.pairwise([], (a, b) => a))).toEqual([]);
    expect(Array.from(w.pairwise([1], (a, b) => a))).toEqual([]);
  });

  it('contains tolerates missing sequences', () => {
    expect(w.contains(undefined, 1)).toBeFalsy();
    expect(w.contains([], 1)).toBe(false);
  });

  it('min/max keep the last of equal elements (documented by <=)', () => {
    const items = [{ k: 1, n: 'a' }, { k: 1, n: 'b' }];
    expect(w.min(items, (x) => x.k).n).toBe('b');
  });

  it('shuffle of 0 or 1 elements is a no-op', () => {
    expect(Array.from(w.shuffle([]))).toEqual([]);
    expect(Array.from(w.shuffle([7]))).toEqual([7]);
  });

  it('elem builds attributes, supports shorthand and empty content', () => {
    expect(w.elem('div', { c: 'x', i: 'y' })).toBe("<div class='x'id='y'></div>");
  });

  it('append to an unknown container returns undefined instead of throwing', () => {
    expect(w.append('does-not-exist', '<p></p>')).toBeUndefined();
  });

  it('deepCopy of primitives and depth 0 returns the same value', () => {
    expect(w.deepCopy(5, 3)).toBe(5);
    const o = {};
    expect(w.deepCopy(o, 0)).toBe(o);
  });

  it('clamp with the tutorial index never leaves the card range', () => {
    expect(w.clamp(-10, 0, 4)).toBe(0);
    expect(w.clamp(10, 0, 4)).toBe(4);
  });
});

describe('Edge cases: unexpected game states', () => {
  beforeEach(() => {
    w = loadGame();
    stubDisplay(w);
  });

  it('a dead player\'s turn is ended automatically', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 2);
    let reported;
    w.pickMove(s.p[1], s, (m) => { reported = m; });
    expect(reported).toEqual({ t: w.END_TURN });
  });

  it('dead players are skipped when passing the turn', () => {
    const s = makeLineState(w);
    const third = w.deepCopy(w.PLAYER_TEMPLATES[2], 1);
    third.i = 2; third.u = w.aiPickMove;
    s.p.push(third);
    s.c[2] = 0; s.l[2] = 0;
    place(w, s, 0, 0, 2, true);
    place(w, s, 3, 2, 2, true);
    // player 1 owns nothing
    const next = w.makeMove(s, { t: w.END_TURN });
    expect(next.m.p).toBe(2);
  });

  it('income and faith events are safe for a player without temples at end of turn', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 2);
    place(w, s, 3, 1, 2);
    const next = w.makeMove(s, { t: w.END_TURN });
    expect(next.c[0]).toBe(0);
  });

  it('upgrade levels are capped: no upgrade options beyond the highest level', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 1, true);
    place(w, s, 3, 1, 1);
    s.t[0].u = w.EARTH; s.t[0].l = 1;
    s.c[0] = 1000;
    w.uiCallbacks = {};
    w.updateDisplay = () => {};
    s.p[0].u = (p, st, cb) => {};
    // reuse the real UI to build the menu
    w.document.body.insertAdjacentHTML('beforeend', '');
    expect(w.EARTH.c.length).toBe(2);
    expect(w.EARTH.c[s.t[0].l + 1]).toBeUndefined();
  });

  it('a turn with unlimited turns never ends by the turn counter', () => {
    const s = makeLineState(w, { setup: { tc: w.UNLIMITED_TURNS } });
    place(w, s, 0, 0, 1, true);
    place(w, s, 3, 1, 1, true);
    s.m.t = 5000;
    const next = w.makeMove(w.makeMove(s, { t: w.END_TURN }), { t: w.END_TURN });
    expect(next.e).toBeUndefined();
  });

  it('a draw between two equal players is represented by DRAW_GAME', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 1);
    place(w, s, 3, 1, 1);
    expect(w.determineGameWinner(s)).toBe(w.DRAW_GAME);
  });

  it('duplicate soldier ids are never produced by repeated adds', () => {
    const s = makeLineState(w);
    for (let i = 0; i < 20; i++) w.addSoldiers(s, s.r[i % 4], 3);
    const ids = Object.values(s.s).flat().map((x) => x.i);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a different seed never breaks map invariants (200 random maps)', () => {
    let seen = 0;
    for (let seedValue = 1; seedValue <= 200; seedValue += 25) {
      seed(w, seedValue);
      const state = w.makeInitialState({ p: [1, 2, 2, 2], l: 0, tc: 12 });
      const homes = state.p.map((p) => w.temples(state, p)[0].r.i);
      expect(new Set(homes).size).toBe(4);
      seen++;
    }
    expect(seen).toBe(8);
  });
});

describe('Edge cases: duplicate and repeated UI actions', () => {
  it('clicking the same setup button repeatedly is idempotent', () => {
    w = bootSetup();
    for (let i = 0; i < 5; i++) setPlayer(w, 1, SB.HUMAN);
    expect(w.gameSetup.p[1]).toBe(w.PLAYER_HUMAN);
    expect(document_selected(w, 'sb1').length).toBe(1);
  });

  it('"Start game" is ignored while setup is invalid', () => {
    w = bootSetup();
    setPlayer(w, 1, SB.OFF);
    setPlayer(w, 2, SB.OFF);
    clickBottom(w, 'Start game');
    expect(w.appState).toBe(w.APP_SETUP_SCREEN);
    expect(q(w, 'sb01')).not.toBeNull();
  });

  it('a UI callback with nothing registered is harmless', () => {
    w = bootSetup();
    w.uiCallbacks = {};
    expect(() => click(w, 'und')).not.toThrow();
  });

  it('undo does nothing before any move has been made', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    w.previousState = null;
    const before = current(w);
    click(w, 'und');
    expect(current(w)).toBe(before);
  });

  it('clicking an unrelated region cancels a move in progress rather than moving', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    const s = current(w);
    const home = s.r.find((r) => w.owner(s, r) === s.p[0]);
    const far = s.r.find((r) => r !== home && !home.n.includes(r));
    w.uiCallbacks.c(home);
    expect(current(w).d.s).toBe(home);
    w.uiCallbacks.c(far);
    expect(current(w).d.s).toBeUndefined();
    expect(current(w).m.l).toBe(3);
  });

  it('clicking an opponent\'s region without selecting an army does nothing', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    const s = current(w);
    const enemy = s.r.find((r) => w.owner(s, r) === s.p[1]);
    w.uiCallbacks.c(enemy);
    expect(current(w).d.s).toBeUndefined();
  });

  it('opponent temples show no purchasable upgrades', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    const s = current(w);
    const enemyTemple = s.r.find((r) => w.owner(s, r) === s.p[1] && s.t[r.i]);
    w.uiCallbacks.t(enemyTemple);
    expect(bottomButtons(w).map((a) => a.textContent.trim())).toEqual(['Done']);
  });
});

function document_selected(w, prefix) {
  return Array.from(w.document.querySelectorAll(`[id^="${prefix}"].selected`));
}
