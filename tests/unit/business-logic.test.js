import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadGame, makeLineState, place, stubDisplay, seed, seededRandom, seedAttackerWins, seedAttackerLoses
} from '../helpers/loadGame.js';

let w;
beforeEach(() => {
  w = loadGame(); // Math.random is seeded with DEFAULT_SEED
  stubDisplay(w);
});

// Seeded generators whose range guarantees every duel goes to one side.
const attackerLoses = () => seedAttackerLoses(w);
const attackerWins = () => seedAttackerWins(w);

describe('Business logic: helper utilities', () => {
  it('clamp keeps values within bounds, inclusive', () => {
    expect(w.clamp(5, 0, 3)).toBe(3);
    expect(w.clamp(-1, 0, 3)).toBe(0);
    expect(w.clamp(0, 0, 3)).toBe(0);
    expect(w.clamp(3, 0, 3)).toBe(3);
  });

  it('lerp interpolates and clamps alpha outside 0..1', () => {
    expect(w.lerp(0, 10, 20)).toBe(10);
    expect(w.lerp(1, 10, 20)).toBe(20);
    expect(w.lerp(0.5, 10, 20)).toBe(15);
    expect(w.lerp(5, 10, 20)).toBe(20);
    expect(w.lerp(-5, 10, 20)).toBe(10);
  });

  it('range is inclusive of low and exclusive of high', () => {
    expect(Array.from(w.range(2, 5))).toEqual([2, 3, 4]);
    expect(Array.from(w.range(3, 3))).toEqual([]);
  });

  it('min/max pick elements by key function', () => {
    expect(w.min([4, 2, 9])).toBe(2);
    expect(w.max([4, 2, 9])).toBe(9);
    expect(w.max(['a', 'ccc', 'bb'], (s) => s.length)).toBe('ccc');
  });

  it('sum adds mapped values', () => {
    expect(w.sum([1, 2, 3], (x) => x * 2)).toBe(12);
  });

  it('pairwise applies fn once to every unordered pair', () => {
    expect(Array.from(w.pairwise([1, 2, 3], (a, b) => a + '-' + b))).toEqual(['1-2', '1-3', '2-3']);
  });

  it('deepCopy copies only to the requested depth', () => {
    const src = { a: { b: { c: 1 } }, list: [1, 2] };
    const copy = w.deepCopy(src, 2);
    expect(copy).not.toBe(src);
    expect(copy.a).not.toBe(src.a);
    expect(copy.a.b).toBe(src.a.b);
    expect(Array.isArray(copy.list)).toBe(true);
  });

  it('template replaces every X', () => {
    expect(w.template('X of Water, level X', 'Temple')).toBe('Temple of Water, level Temple');
  });

  it('rint stays in [low, high) at both extremes of the generator', () => {
    seed(w, 1, 0.9999999, 1);
    expect(w.rint(3, 7)).toBe(6);
    seed(w, 1, 0, 0.0000001);
    expect(w.rint(3, 7)).toBe(3);
  });

  it('the same seed reproduces the same random sequence; different seeds differ', () => {
    const draw = (s) => { seed(w, s); return [w.rint(0, 1000), w.rint(0, 1000), w.rint(0, 1000)]; };
    expect(draw(7)).toEqual(draw(7));
    expect(draw(7)).not.toEqual(draw(8));
    expect(seededRandom(5)()).toBe(seededRandom(5)());
  });

  it('shuffle preserves elements and is reproducible for a seed', () => {
    seed(w, 42);
    const a = Array.from(w.shuffle([1, 2, 3, 4, 5]));
    seed(w, 42);
    const b = Array.from(w.shuffle([1, 2, 3, 4, 5]));
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(a).toEqual(b);
  });
});

describe('Business logic: income, costs and upgrades', () => {
  it('income = regions + soldiers sitting in temples', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 3, true);
    place(w, s, 1, 0, 5); // soldiers outside temples do not pay
    place(w, s, 3, 1, 1);
    expect(w.income(s, s.p[0])).toBe(2 + 3);
  });

  it('players without temples earn nothing', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 3);
    expect(w.income(s, s.p[0])).toBe(0);
  });

  it('Water upgrade increases income and rounds up', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 3, true);
    s.t[0].u = w.WATER; s.t[0].l = 0; // +20%
    expect(w.income(s, s.p[0])).toBe(Math.ceil(1.2 * 4));
    s.t[0].l = 1; // +40%
    expect(w.income(s, s.p[0])).toBe(Math.ceil(1.4 * 4));
  });

  it('Evil AI gets an income bonus; human does not', () => {
    const s = makeLineState(w, { setup: { l: w.AI_EVIL } });
    place(w, s, 0, 0, 5, true);
    place(w, s, 3, 1, 5, true);
    expect(w.income(s, s.p[0])).toBe(6);
    expect(w.income(s, s.p[1])).toBe(Math.ceil(1.4 * 6));
  });

  it('soldier cost rises with every soldier bought in a turn', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 1, true);
    place(w, s, 3, 1, 1);
    s.c[0] = 100;
    expect(w.soldierCost(s)).toBe(8);
    s = w.makeMove(s, { t: w.BUILD_ACTION, r: s.r[0], u: w.SOLDIER });
    expect(s.c[0]).toBe(92);
    expect(w.soldierCost(s)).toBe(12);
    s = w.makeMove(s, { t: w.BUILD_ACTION, r: s.r[0], u: w.SOLDIER });
    expect(s.c[0]).toBe(80);
    expect(w.soldierCount(s, s.r[0])).toBe(3);
  });

  it('soldier cost resets on the next turn', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 1, true);
    place(w, s, 3, 1, 1);
    s.c[0] = 100;
    s = w.makeMove(s, { t: w.BUILD_ACTION, r: s.r[0], u: w.SOLDIER });
    s = w.makeMove(s, { t: w.END_TURN });
    s = w.makeMove(s, { t: w.END_TURN });
    expect(w.soldierCost(s)).toBe(8);
  });

  it('building an elemental upgrade starts at level 0, then levels up and charges cumulative costs', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 1, true);
    place(w, s, 3, 1, 1);
    s.c[0] = 100;
    s = w.makeMove(s, { t: w.BUILD_ACTION, r: s.r[0], u: w.FIRE });
    expect(s.t[0].u).toBe(w.FIRE);
    expect(s.t[0].l).toBe(0);
    expect(s.c[0]).toBe(80);
    s = w.makeMove(s, { t: w.BUILD_ACTION, r: s.r[0], u: w.FIRE });
    expect(s.t[0].l).toBe(1);
    expect(s.c[0]).toBe(50);
  });

  it('Air upgrade grants an immediate extra move; respec removes the upgrade', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 1, true);
    place(w, s, 3, 1, 1);
    s.c[0] = 100;
    s = w.makeMove(s, { t: w.BUILD_ACTION, r: s.r[0], u: w.AIR });
    expect(s.m.l).toBe(w.movesPerTurn + 1);
    s = w.makeMove(s, { t: w.BUILD_ACTION, r: s.r[0], u: w.RESPEC });
    expect(s.t[0].u).toBeUndefined();
  });

  it('upgradeLevel is zero for neutral and for other upgrade types', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 1, true);
    s.t[0].u = w.EARTH; s.t[0].l = 1;
    place(w, s, 3, 1, 1);
    expect(w.upgradeLevel(s, null, w.EARTH)).toBe(0);
    expect(w.upgradeLevel(s, s.p[0], w.FIRE)).toBe(0);
    expect(w.upgradeLevel(s, s.p[0], w.EARTH)).toBe(2);
    expect(w.upgradeLevel(s, s.p[1], w.EARTH)).toBe(0);
  });

  it('templeInfo describes neutral, basic and upgraded temples', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 1, true);
    place(w, s, 1, null, 1, true);
    expect(w.templeInfo(s, s.t[0]).n).toBe('Basic Temple');
    expect(w.templeInfo(s, s.t[1]).n).toBe('Neutral Temple');
    s.t[0].u = w.WATER; s.t[0].l = 1;
    expect(w.templeInfo(s, s.t[0])).toEqual({ n: 'Cathedral of Water', d: 'Income: 40% more each turn.' });
  });
});

describe('Business logic: moving armies and conflict resolution', () => {
  function duel(attackers, defenders, { defenderTemple, setupFn } = {}) {
    let s = makeLineState(w);
    place(w, s, 0, 0, attackers);
    place(w, s, 1, 1, defenders, defenderTemple);
    place(w, s, 3, 1, 1); // keep both players alive afterwards
    place(w, s, 2, 0, 1);
    if (setupFn) setupFn(s);
    return s;
  }

  it('moving into an empty neutral region conquers it and uses one move', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 2);
    place(w, s, 3, 1, 1);
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 2 });
    expect(w.owner(s, s.r[1])).toBe(s.p[0]);
    expect(w.soldierCount(s, s.r[1])).toBe(2);
    expect(w.soldierCount(s, s.r[0])).toBe(0);
    expect(s.m.l).toBe(w.movesPerTurn - 1);
  });

  it('moving within your own territory does not fight and does not conquer', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 3);
    place(w, s, 1, 0, 1);
    place(w, s, 3, 1, 1);
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 3 });
    expect(w.soldierCount(s, s.r[1])).toBe(4);
    expect(s.m.z).toBeUndefined();
  });

  it('partial moves leave the rest of the army behind', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 5);
    place(w, s, 3, 1, 1);
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 2 });
    expect(w.soldierCount(s, s.r[0])).toBe(3);
    expect(w.soldierCount(s, s.r[1])).toBe(2);
  });

  it('makeMove never mutates the previous state', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 2);
    place(w, s, 3, 1, 1);
    const before = JSON.stringify(w.serializeState(s));
    w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 2 });
    expect(JSON.stringify(w.serializeState(s))).toBe(before);
  });

  it('a conquered region cannot launch another army in the same turn', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 2);
    place(w, s, 3, 1, 1);
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 2 });
    expect(w.regionHasActiveArmy(s, s.p[0], s.r[1])).toBe(false);
  });

  it('a region with no moves left or no soldiers is not active', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 2);
    place(w, s, 1, 0, 0);
    expect(w.regionHasActiveArmy(s, s.p[0], s.r[0])).toBe(true);
    expect(w.regionHasActiveArmy(s, s.p[0], s.r[1])).toBeFalsy();
    s.m.l = 0;
    expect(w.regionHasActiveArmy(s, s.p[0], s.r[0])).toBeFalsy();
  });

  it('attacker wins: defenders die, region is taken, martyr bonus paid to the defender', () => {
    attackerWins();
    let s = duel(3, 1);
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 3 });
    expect(w.owner(s, s.r[1])).toBe(s.p[0]);
    expect(w.soldierCount(s, s.r[1])).toBe(3);
    expect(s.c[1]).toBe(4);
    expect(s.m.z.map((r) => r.i)).toEqual([1]);
  });

  it('attacker loses: attackers die, region stays with the defender', () => {
    attackerLoses();
    let s = duel(2, 3);
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 2 });
    expect(w.owner(s, s.r[1])).toBe(s.p[1]);
    expect(w.soldierCount(s, s.r[0])).toBe(0);
    expect(w.soldierCount(s, s.r[1])).toBe(3);
    expect(s.c[1]).toBe(0);
  });

  it('a random battle disables undo; a peaceful move does not', () => {
    attackerLoses();
    const s = duel(2, 3);
    const battle = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 2 });
    expect(battle.u).toBe(1);
    const peaceful = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[2], d: s.r[2], c: 1 });
    expect(peaceful.u).toBeUndefined();
  });

  it('only as many duels happen as the smaller army allows', () => {
    attackerWins();
    let s = duel(5, 2);
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 5 });
    expect(w.soldierCount(s, s.r[1])).toBe(5);
    expect(w.owner(s, s.r[1])).toBe(s.p[0]);
  });

  it('survivors on defense repel the attack when not all defenders die', () => {
    attackerWins();
    let s = duel(3, 4);
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 3 });
    // three duels won, but one defender remains: the attackers are stuck at home
    expect(w.owner(s, s.r[1])).toBe(s.p[1]);
    expect(w.soldierCount(s, s.r[1])).toBe(1);
    expect(w.soldierCount(s, s.r[0])).toBe(3);
  });

  it('conquering a temple resets its upgrade', () => {
    attackerWins();
    let s = duel(3, 1, {
      defenderTemple: true,
      setupFn: (st) => { st.t[1].u = w.WATER; st.t[1].l = 0; }
    });
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 3 });
    expect(w.owner(s, s.r[1])).toBe(s.p[0]);
    expect(s.t[1].u).toBeUndefined();
  });

  it('Fire protects attackers from losing a duel (one soldier per level)', () => {
    attackerLoses();
    let s = duel(3, 3, {
      setupFn: (st) => { place(w, st, 2, 0, 0, true); st.t[2].u = w.FIRE; st.t[2].l = 0; }
    });
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 3 });
    // 3 duels lost, 1 prevented by Fire -> 2 attackers die
    expect(w.soldierCount(s, s.r[0])).toBe(1);
  });

  it('Earth kills invaders before the fight starts', () => {
    attackerWins();
    let s = duel(1, 2, {
      defenderTemple: true,
      setupFn: (st) => { st.t[1].u = w.EARTH; st.t[1].l = 0; }
    });
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 1 });
    expect(w.soldierCount(s, s.r[0])).toBe(0);
    expect(w.soldierCount(s, s.r[1])).toBe(2);
    expect(w.owner(s, s.r[1])).toBe(s.p[1]);
  });

  it('simulated (AI look-ahead) fights ignore the random seed', () => {
    const outcomes = [1, 2, 3].map((seedValue) => {
      seed(w, seedValue);
      let s = duel(3, 3);
      s.a = s.p[0];
      s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 3 });
      return [w.soldierCount(s, s.r[0]), w.soldierCount(s, s.r[1]), w.owner(s, s.r[1]).i];
    });
    expect(outcomes[1]).toEqual(outcomes[0]);
    expect(outcomes[2]).toEqual(outcomes[0]);
  });

  it('multiple simultaneous attacks in one turn resolve independently', () => {
    attackerWins();
    let s = makeLineState(w, { regions: 5 });
    place(w, s, 2, 0, 6);
    place(w, s, 1, 1, 1);
    place(w, s, 3, 1, 1);
    place(w, s, 0, 1, 1);
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[2], d: s.r[1], c: 3 });
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[2], d: s.r[3], c: 3 });
    expect(w.owner(s, s.r[1])).toBe(s.p[0]);
    expect(w.owner(s, s.r[3])).toBe(s.p[0]);
    expect(s.c[1]).toBe(8);
    expect(s.m.l).toBe(w.movesPerTurn - 2);
    expect(s.m.z.length).toBe(2);
  });
});

describe('Business logic: turn flow and game end', () => {
  it('ending a turn pays income, spawns temple soldiers and passes control', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 3, true);
    place(w, s, 3, 1, 1, true);
    s = w.makeMove(s, { t: w.END_TURN });
    expect(s.c[0]).toBe(1 + 3);
    expect(w.soldierCount(s, s.r[0])).toBe(4);
    expect(s.m.p).toBe(1);
    expect(s.m.t).toBe(1);
    expect(s.m.l).toBe(w.movesPerTurn);
  });

  it('the turn counter advances after the last player moves', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 1, true);
    place(w, s, 3, 1, 1, true);
    s = w.makeMove(w.makeMove(s, { t: w.END_TURN }), { t: w.END_TURN });
    expect(s.m.t).toBe(2);
    expect(s.m.p).toBe(0);
  });

  it('Air upgrade adds moves at the start of the owner\'s turn', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 1, true);
    place(w, s, 3, 1, 1, true);
    s.t[3].u = w.AIR; s.t[3].l = 1;
    s = w.makeMove(s, { t: w.END_TURN });
    expect(s.m.l).toBe(w.movesPerTurn + 2);
  });

  it('game ends when the turn limit passes, winner has more regions', () => {
    w.gameSetup.tc = 1;
    let s = makeLineState(w, { setup: { tc: 1 } });
    place(w, s, 0, 0, 1, true);
    place(w, s, 1, 0, 1);
    place(w, s, 3, 1, 1, true);
    s = w.makeMove(w.makeMove(s, { t: w.END_TURN }), { t: w.END_TURN });
    expect(s.e).toBe(s.p[0]);
    expect(s.m.t).toBe(1);
  });

  it('equal region counts at the turn limit are a draw', () => {
    let s = makeLineState(w, { setup: { tc: 1 } });
    place(w, s, 0, 0, 1, true);
    place(w, s, 3, 1, 1, true);
    s = w.makeMove(w.makeMove(s, { t: w.END_TURN }), { t: w.END_TURN });
    expect(s.e).toBe(w.DRAW_GAME);
  });

  it('the game does not end early with turns remaining', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 1, true);
    place(w, s, 3, 1, 1, true);
    s = w.makeMove(w.makeMove(s, { t: w.END_TURN }), { t: w.END_TURN });
    expect(s.e).toBeUndefined();
  });

  it('a player who loses all soldiers is eliminated and the survivor wins', () => {
    attackerWins();
    let s = makeLineState(w);
    place(w, s, 0, 0, 3);
    place(w, s, 1, 1, 1);
    s = w.makeMove(s, { t: w.MOVE_ARMY, s: s.r[0], d: s.r[1], c: 3 });
    expect(w.regionCount(s, s.p[1])).toBe(0);
    expect(s.e).toBe(s.p[0]);
  });

  it('a player with regions but no soldiers is eliminated even if not attacked', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 2);
    place(w, s, 3, 1, 0); // owner without soldiers
    s = w.makeMove(s, { t: w.END_TURN });
    expect(w.regionCount(s, s.p[1])).toBe(0);
    expect(s.e).toBe(s.p[0]);
  });

  it('determineGameWinner picks the player with most regions', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 1);
    place(w, s, 1, 0, 1);
    place(w, s, 3, 1, 1);
    expect(w.determineGameWinner(s)).toBe(s.p[0]);
  });
});

describe('Business logic: undo rules', () => {
  it('undo is only available to humans, right after their own move, and not after a battle', () => {
    let s = makeLineState(w);
    place(w, s, 0, 0, 2);
    place(w, s, 3, 1, 1);
    w.previousState = null;
    expect(w.undoEnabled(s)).toBeFalsy();
    w.previousState = w.copyState(s);
    expect(w.undoEnabled(s)).toBeTruthy();
    s.u = 1;
    expect(w.undoEnabled(s)).toBeFalsy();
    delete s.u;
    s.m.p = 1; // AI turn
    expect(w.undoEnabled(s)).toBeFalsy();
  });
});

describe('Business logic: AI move generation', () => {
  it('always offers END_TURN, and only END_TURN when out of moves', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 2);
    place(w, s, 3, 1, 1);
    s.m.l = 0;
    expect(w.possibleMoves(s)).toEqual([{ t: w.END_TURN }]);
  });

  it('offers full and half army moves to neighbours', () => {
    const s = makeLineState(w);
    place(w, s, 1, 0, 4);
    place(w, s, 3, 1, 1);
    const moves = w.possibleMoves(s).filter((m) => m.t === w.MOVE_ARMY);
    const keys = moves.map((m) => `${m.s.i}>${m.d.i}x${m.c}`).sort();
    expect(keys).toEqual(['1>0x2', '1>0x4', '1>2x2', '1>2x4']);
  });

  it('never proposes obvious suicide attacks', () => {
    const s = makeLineState(w);
    place(w, s, 1, 0, 2);
    place(w, s, 2, 1, 5);
    place(w, s, 3, 1, 1);
    const attacks = w.possibleMoves(s).filter((m) => m.t === w.MOVE_ARMY && m.d.i === 2);
    expect(attacks).toEqual([]);
  });

  it('shouldBuildSoldier is false when the AI cannot afford a soldier or has no temple', () => {
    const s = makeLineState(w);
    place(w, s, 0, 0, 2, true);
    place(w, s, 3, 1, 2);
    s.c[1] = 1000;
    expect(w.shouldBuildSoldier(s.p[1], s)).toBe(false);
    place(w, s, 2, 1, 1, true);
    s.c[1] = 1;
    expect(w.shouldBuildSoldier(s.p[1], s)).toBe(false);
  });

  it('AI ends its turn when nothing useful is possible', async () => {
    w.minimumAIThinkingTime = 0;
    const s = makeLineState(w);
    s.m.p = 1;
    place(w, s, 0, 0, 3, true);
    place(w, s, 3, 1, 1);
    const move = await new Promise((resolve) => w.aiPickMove(s.p[1], s, resolve));
    expect([w.END_TURN, w.MOVE_ARMY, w.BUILD_ACTION]).toContain(move.t);
  });
});

describe('Business logic: map and initial state generation', () => {
  it.each([1, 2, 3])('map generation is reproducible for seed %i', (seedValue) => {
    const gen = () => {
      seed(w, seedValue);
      w.soldierCounter = 0; // soldier ids come from a global counter, so reset it for comparison
      const st = w.makeInitialState({ p: [1, 2, 2, 0], l: 0, tc: 12 });
      return JSON.stringify(w.serializeState(st));
    };
    expect(gen()).toBe(gen());
  });

  it.each([2, 3, 4])('generates a consistent map for %i players', (n) => {
    const setup = { p: [1, 2, 2, 2].map((v, i) => (i < n ? v : 0)), l: 0, tc: 12 };
    const state = w.makeInitialState(setup);
    expect(state.p.length).toBe(n);
    expect(state.r.length).toBeGreaterThan(10);

    // neighbour relation is symmetric
    state.r.forEach((r) => r.n.forEach((nb) => expect(nb.n).toContain(r)));

    // every player owns exactly one starting region with a temple and 3 soldiers
    state.p.forEach((p) => {
      expect(w.regionCount(state, p)).toBe(1);
      expect(w.temples(state, p).length).toBe(1);
      expect(w.totalSoldiers(state, p)).toBe(3);
    });
    // neutral temples exist: 3 for 2-3 players, 4 for 4 players
    const total = Object.keys(state.t).length;
    expect(total).toBe(n + [3, 3, 4][n - 2]);
    expect(state.m).toEqual({ t: 1, p: 0, m: w.MOVE_ARMY, l: w.movesPerTurn });
  });

  it('assigns human and AI controllers according to setup', () => {
    const state = w.makeInitialState({ p: [1, 2, 0, 2], l: 0, tc: 12 });
    expect(state.p.map((p) => p.n)).toEqual(['Amber', 'Crimson', 'Emerald']);
    expect(state.p[0].u).toBe(w.uiPickMove);
    expect(state.p[1].u).toBe(w.aiPickMove);
    expect(state.p[1].p).toBeDefined();
    expect(state.p[0].p).toBeUndefined();
  });
});
