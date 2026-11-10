import { describe, it, expect, beforeEach } from 'vitest';
import { loadGame, reloadGame, makeLineState, place, stubDisplay, seedAttackerWins } from '../helpers/loadGame.js';

let w;
beforeEach(() => {
  w = loadGame();
  stubDisplay(w);
});

function richState() {
  const s = makeLineState(w, { setup: { tc: 15, l: w.AI_MEAN } });
  place(w, s, 0, 0, 3, true);
  place(w, s, 1, 0, 2);
  place(w, s, 2, null, 4, true);
  place(w, s, 3, 1, 5, true);
  s.t[0].u = w.WATER; s.t[0].l = 1;
  s.t[3].u = w.EARTH; s.t[3].l = 0;
  s.c = { 0: 42, 1: 17 };
  s.l = { 0: 1, 1: 2 };
  s.m = { t: 4, p: 1, m: w.MOVE_ARMY, l: 2 };
  return s;
}

describe('Data integrity: saving and loading a game', () => {
  it('saveGame writes a single versioned record under the save key', () => {
    w.saveGame(richState());
    expect(w.localStorage.length).toBe(1);
    const data = JSON.parse(w.localStorage.getItem(w.SAVE_KEY));
    expect(data.v).toBe(w.SAVE_VERSION);
  });

  it('round-trips every part of the state', () => {
    const s = richState();
    const restored = w.deserializeState(JSON.parse(JSON.stringify(w.serializeState(s))));

    expect(restored.r.length).toBe(4);
    restored.r.forEach((r, i) => expect(r.n.map((n) => n.i)).toEqual(s.r[i].n.map((n) => n.i)));
    expect(restored.p.map((p) => p.n)).toEqual(['Amber', 'Crimson']);
    expect(restored.p[0].u).toBe(w.uiPickMove);
    expect(restored.p[1].u).toBe(w.aiPickMove);
    expect(restored.p[1].p.u).toEqual([w.WATER]);
    expect(restored.p[1].p.s).toBe(0.3);

    expect(Object.keys(restored.o).map((k) => `${k}:${restored.o[k].i}`).sort()).toEqual(['0:0', '1:0', '3:1']);
    expect(restored.t[0].u).toBe(w.WATER);
    expect(restored.t[0].l).toBe(1);
    expect(restored.t[2].u).toBeUndefined();
    expect(restored.t[3].u).toBe(w.EARTH);
    [0, 1, 2, 3].forEach((i) => expect(w.soldierCount(restored, restored.r[i])).toBe(w.soldierCount(s, s.r[i])));
    expect(restored.c).toEqual({ 0: 42, 1: 17 });
    expect(restored.m).toEqual({ t: 4, p: 1, m: w.MOVE_ARMY, l: 2 });
  });

  it('keeps conquered-region markers (cannot-move-again) across a save', () => {
    const s = richState();
    s.m.z = [s.r[1]];
    const restored = w.deserializeState(JSON.parse(JSON.stringify(w.serializeState(s))));
    expect(restored.m.z.map((r) => r.i)).toEqual([1]);
    expect(restored.m.z[0]).toBe(restored.r[1]);
  });

  it('restored state is playable: derived values and moves match the original', () => {
    const s = richState();
    s.m = { t: 1, p: 0, m: w.MOVE_ARMY, l: 3 };
    const restored = w.deserializeState(JSON.parse(JSON.stringify(w.serializeState(s))));
    expect(w.income(restored, restored.p[0])).toBe(w.income(s, s.p[0]));
    const moved = w.makeMove(restored, { t: w.MOVE_ARMY, s: restored.r[1], d: restored.r[0], c: 2 });
    expect(w.soldierCount(moved, moved.r[0])).toBe(5);
    expect(w.owner(moved, moved.r[0])).toBe(moved.p[0]);
  });

  it('loadGame restores the state and the matching setup (turn limit, AI level)', () => {
    w.saveGame(richState());
    w.gameSetup.tc = 9;
    w.gameSetup.l = w.AI_NICE;
    const loaded = w.loadGame();
    expect(loaded).not.toBeNull();
    expect(w.gameSetup.tc).toBe(15);
    expect(w.gameSetup.l).toBe(w.AI_MEAN);
  });

  it('soldier ids stay unique after loading and then adding soldiers', () => {
    w.saveGame(richState());
    const loaded = w.loadGame();
    w.addSoldiers(loaded, loaded.r[0], 3);
    const ids = Object.values(loaded.s).flat().map((x) => x.i);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('a saved game survives a page refresh', () => {
    w.saveGame(richState());
    const w2 = reloadGame(w);
    const loaded = w2.loadGame();
    expect(loaded.m.t).toBe(4);
    expect(w2.regionCount(loaded, loaded.p[0])).toBe(2);
  });

  it('saveGame overwrites rather than duplicates', () => {
    const s = richState();
    w.saveGame(s);
    s.c[0] = 99;
    w.saveGame(s);
    expect(w.localStorage.length).toBe(1);
    expect(JSON.parse(w.localStorage.getItem('g')).c[0]).toBe(99);
  });
});

describe('Data integrity: updating without losing unrelated data', () => {
  it('a move does not change cash, other regions, or other players\' upgrades', () => {
    const s = richState();
    s.m = { t: 1, p: 0, m: w.MOVE_ARMY, l: 3 };
    const next = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[1], d: s.r[0], c: 2 });
    expect(next.c).toEqual(s.c);
    expect(next.t[3].u).toBe(w.EARTH);
    expect(w.soldierCount(next, next.r[3])).toBe(5);
    expect(w.soldierCount(next, next.r[2])).toBe(4);
  });

  it('building a soldier only touches the target region and the payer\'s cash', () => {
    const s = richState();
    s.m = { t: 1, p: 0, m: w.MOVE_ARMY, l: 3 };
    const next = w.makeMove(s, { t: w.BUILD_ACTION, r: s.r[0], u: w.SOLDIER });
    expect(next.c).toEqual({ 0: 42 - 8, 1: 17 });
    expect(w.soldierCount(next, next.r[0])).toBe(4);
    [1, 2, 3].forEach((i) => expect(w.soldierCount(next, next.r[i])).toBe(w.soldierCount(s, s.r[i])));
    expect(next.t[0].u).toBe(w.WATER);
    expect(next.t[3].u).toBe(w.EARTH);
  });

  it('changing a setup option keeps all other stored options', () => {
    w.gameSetup.tc = 9;
    w.storeSetupInLocalStorage();
    const w2 = reloadGame(w);
    const stored = w2.getSetupFromStorage();
    expect(stored.tc).toBe(9);
    expect(stored.p).toEqual([w.PLAYER_HUMAN, w.PLAYER_AI, w.PLAYER_AI, w.PLAYER_OFF]);
    expect(stored.l).toBe(w.AI_NICE);
    expect(stored.s).toBe(true);
  });

  it('fills in defaults for options missing from an older stored setup', () => {
    const w2 = loadGame({ storage: { s: JSON.stringify({ tc: 15, version: 1 }) } });
    const stored = w2.getSetupFromStorage();
    expect(stored.tc).toBe(15);
    expect(stored.p.length).toBe(4);
    expect(stored.s).toBe(true);
  });

  it('copyState produces an independent copy of mutable parts', () => {
    const s = richState();
    const c = w.copyState(s);
    c.c[0] = 0;
    c.s[0].pop();
    c.t[0].l = 0;
    expect(s.c[0]).toBe(42);
    expect(s.s[0].length).toBe(3);
    expect(s.t[0].l).toBe(1);
  });
});

describe('Data integrity: deleting', () => {
  it('clearSavedGame removes the saved game and loadGame then returns null', () => {
    w.saveGame(richState());
    w.clearSavedGame();
    expect(w.localStorage.getItem('g')).toBeNull();
    expect(w.loadGame()).toBeNull();
  });

  it('clearing a saved game does not delete the user\'s settings', () => {
    w.storeSetupInLocalStorage();
    w.saveGame(richState());
    w.clearSavedGame();
    expect(w.localStorage.getItem('s')).not.toBeNull();
  });

  it('a finished game clears its save', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 3);
    place(w, s, 1, 1, 0); // opponent has no soldiers: game ends after the next move
    w.saveGame(s);
    w.oneAtATime = (d, fn) => fn();
    w.showEndGame = () => {};
    w.pickMove = (player, state, cb) => cb({ t: w.END_TURN });
    w.playOneMove(s);
    expect(w.localStorage.getItem('g')).toBeNull();
  });

  it('conquering the last region of a player removes ownership from every view', () => {
    seedAttackerWins(w);
    let s = makeLineState(w);
    place(w, s, 0, 0, 3);
    place(w, s, 1, 1, 1);
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 3 });
    expect(w.regionCount(s, s.p[1])).toBe(0);
    expect(w.totalSoldiers(s, s.p[1])).toBe(0);
    expect(w.temples(s, s.p[1])).toEqual([]);
  });
});
