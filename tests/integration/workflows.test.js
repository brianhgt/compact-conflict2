import { describe, it, expect, afterEach } from 'vitest';
import { bootSetup, startHotseatGame, q, click, text, setPlayer, SB, bottomButtons, clickBottom, current, waitFor, waitForHumanTurn, regionOwnedBy } from '../helpers/ui.js';
import { reloadGame, seed, seedAttackerWins } from '../helpers/loadGame.js';

let w;
afterEach(() => w && w.close());

describe('User workflows: setting up and starting a game', () => {
  it('configure -> start -> first human turn is ready', async () => {
    w = bootSetup();
    click(w, 'tc0'); // "9"
    setPlayer(w, 1, SB.HUMAN);
    setPlayer(w, 2, SB.OFF);
    clickBottom(w, 'Start game');
    await waitForHumanTurn(w);
    expect(w.appState).toBe(w.APP_INGAME);
    expect(text(w, 'tc')).toMatch(/Turn\s*1\s*\/\s*9/);
    expect(current(w).p.length).toBe(2);
  });

  it('settings chosen in a previous visit are restored after a refresh', () => {
    w = bootSetup();
    click(w, 'tc0'); // "9"
    click(w, 'ai3');
    setPlayer(w, 3, SB.AI);
    const w2 = reloadGame(w);
    w2.gameSetup = w2.getSetupFromStorage();
    w2.runSetupScreen();
    expect(w2.gameSetup.tc).toBe(9);
    expect(q(w2, 'tc0').classList.contains('selected')).toBe(true);
    expect(q(w2, 'ai3').classList.contains('selected')).toBe(true);
    expect(q(w2, 'sb32').classList.contains('selected')).toBe(true);
    w = w2;
  });
});

describe('User workflows: playing turns', () => {
  it('select an army, move it to a neighbour, and the board updates', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    const s = current(w);
    const home = regionOwnedBy(w, s, 0);
    const target = home.n.find((n) => !w.owner(s, n) && !w.soldierCount(s, n));
    expect(target).toBeDefined();

    w.uiCallbacks.c(home);
    w.uiCallbacks.c(target);
    await waitFor(() => current(w).m.l === 2 && w.uiCallbacks.c);
    const after = current(w);
    expect(w.owner(after, after.r[target.i])).toBe(after.p[0]);
    expect(text(w, 'mc')).toContain('2');
  });

  it('a conquered region cannot be used again this turn, and ending the turn passes control', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    const s = current(w);
    const home = regionOwnedBy(w, s, 0);
    const target = home.n.find((n) => !w.owner(s, n) && !w.soldierCount(s, n));
    w.uiCallbacks.c(home);
    w.uiCallbacks.c(target);
    await waitFor(() => current(w).m.l === 2 && w.uiCallbacks.c);
    expect(w.regionHasActiveArmy(current(w), current(w).p[0], current(w).r[target.i])).toBeFalsy();

    clickBottom(w, 'End turn');
    await waitFor(() => current(w).m.p === 1 && w.uiCallbacks.c);
    expect(text(w, 'mc')).toContain('3');
    expect(q(w, 'in').style.background).not.toBe('');
  });

  it('player 1 and player 2 alternate and the turn counter advances after both', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    clickBottom(w, 'End turn');
    await waitFor(() => current(w).m.p === 1 && w.uiCallbacks.c);
    clickBottom(w, 'End turn');
    await waitFor(() => current(w).m.t === 2 && current(w).m.p === 0 && w.uiCallbacks.c);
    expect(text(w, 'tc')).toMatch(/Turn\s*2/);
  });

  it('buy a soldier at a temple (needs faith), then the cost goes up', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    clickBottom(w, 'End turn');
    await waitFor(() => current(w).m.p === 1 && w.uiCallbacks.c);
    clickBottom(w, 'End turn');
    await waitFor(() => current(w).m.t === 2 && w.uiCallbacks.c);

    const s = current(w);
    s.c[0] = 20; // enough faith for two soldiers (8 + 12)
    const temple = s.r.find((r) => w.owner(s, r) === s.p[0] && s.t[r.i]);
    const before = w.soldierCount(s, temple), cash = s.c[0];
    w.uiCallbacks.t(temple);
    clickBottom(w, 'Extra soldier');
    await waitFor(() => w.soldierCount(current(w), current(w).r[temple.i]) === before + 1);
    expect(current(w).c[0]).toBe(cash - 8);
    // the upgrade menu stays open for the next purchase, now at a higher price
    expect(bottomButtons(w).find((a) => a.textContent.includes('Extra soldier')).textContent).toContain('12');
  });

  it('undo reverts a safe move', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    const s = current(w);
    const home = regionOwnedBy(w, s, 0);
    const target = home.n.find((n) => !w.owner(s, n) && !w.soldierCount(s, n));
    w.uiCallbacks.c(home);
    w.uiCallbacks.c(target);
    await waitFor(() => current(w).m.l === 2 && w.uiCallbacks.c && w.undoEnabled(current(w)));
    expect(q(w, 'und').textContent.trim()).not.toBe('');
    click(w, 'und');
    await waitFor(() => current(w).m.l === 3 && w.uiCallbacks.c);
    expect(w.owner(current(w), current(w).r[target.i])).toBeUndefined();
  });
});

describe('User workflows: persistence, navigation and recovery', () => {
  it('an interrupted game is saved each move and resumes after a refresh', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    clickBottom(w, 'End turn');
    await waitFor(() => current(w).m.p === 1 && w.uiCallbacks.c);
    expect(w.localStorage.getItem('g')).not.toBeNull();

    const w2 = reloadGame(w);
    w = w2;
    w2.gameSetup = w2.getSetupFromStorage();
    const saved = w2.loadGame();
    expect(saved).not.toBeNull();
    w2.prepareIngameUI(saved);
    w2.showMap(q(w2, 'm'), saved);
    w2.updateDisplay(saved);
    w2.playOneMove(saved);
    await waitFor(() => w2.uiCallbacks.c);
    expect(w2.displayedState.m.p).toBe(1);
    expect(w2.displayedState.m.t).toBe(1);
    expect(q(w2, 'pl1')).not.toBeNull();
  });

  it('the Restart button abandons the game, clears the save and returns to setup', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    click(w, 'end');
    expect(w.localStorage.getItem('g')).toBeNull();
    expect(w.appState).toBe(w.APP_SETUP_SCREEN);
    expect(bottomButtons(w).map((a) => a.textContent.trim())).toEqual(['Change map', 'Start game']);
    expect(q(w, 'sb01')).not.toBeNull();
  });

  it('opening the instructions mid-game and closing them keeps the game state', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    const before = JSON.stringify(w.serializeState(current(w)));
    click(w, 'tub');
    expect(q(w, 'ts').style.display).toBe('block');
    click(w, 'cb');
    await waitFor(() => q(w, 'ts').style.display === 'none');
    expect(JSON.stringify(w.serializeState(current(w)))).toBe(before);
  });

  it('recovers from a corrupted save by discarding it and showing a fresh setup', () => {
    w = bootSetup({ storage: { g: '{"v":1,"r":"garbage' } });
    expect(w.loadGame()).toBeNull();
    expect(w.localStorage.getItem('g')).toBeNull();
    expect(q(w, 'sb01')).not.toBeNull();
  });

  it('finishing a game (winner by elimination) offers a new game', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    const s = current(w);
    // rearrange the live state so Amber is one winning attack away from eliminating Crimson
    const home0 = regionOwnedBy(w, s, 0);
    const neighbour = home0.n[0];
    s.o = { [home0.i]: s.p[0], [neighbour.i]: s.p[1] };
    s.s = {};
    w.addSoldiers(s, home0, 5);
    w.addSoldiers(s, neighbour, 1);

    seedAttackerWins(w);
    w.uiCallbacks.c(home0);
    w.uiCallbacks.c(neighbour);
    await waitFor(() => bottomButtons(w).some((a) => a.textContent.includes('New game')));
    expect(current(w).e).toBe(current(w).p[0]);
    expect(text(w, 'tc')).toBe('Game complete');
    expect(w.localStorage.getItem('g')).toBeNull();
    seed(w); // the biased fight generator would stall map generation, so restore a uniform seed
    clickBottom(w, 'New game');
    expect(w.appState).toBe(w.APP_SETUP_SCREEN);
  });
});
