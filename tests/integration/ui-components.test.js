import { describe, it, expect, afterEach } from 'vitest';
import { bootSetup, startHotseatGame, q, click, text, setPlayer, SB, bottomButtons, clickBottom, current, waitFor, waitForHumanTurn } from '../helpers/ui.js';

let w;
afterEach(() => w && w.close());

describe('UI components: setup screen', () => {
  it('renders a panel per player, plus AI-level and turn-count controls', () => {
    w = bootSetup();
    for (let p = 0; p < 4; p++) {
      expect(q(w, 'pl' + p)).not.toBeNull();
      expect(q(w, `sb${p}0`)).not.toBeNull();
      expect(q(w, `sb${p}1`)).not.toBeNull();
      expect(q(w, `sb${p}2`)).not.toBeNull();
    }
    expect([0, 1, 2, 3].map((i) => q(w, 'ai' + i))).not.toContain(null);
    expect([0, 1, 2, 3].map((i) => q(w, 'tc' + i))).not.toContain(null);
  });

  it('highlights the default selections (human, 2 AIs, off, Nice AI, 12 turns)', () => {
    w = bootSetup();
    const selected = (id) => q(w, id).classList.contains('selected');
    expect(selected('sb01')).toBe(true);
    expect(selected('sb12')).toBe(true);
    expect(selected('sb22')).toBe(true);
    expect(selected('sb30')).toBe(true);
    expect(selected('ai0')).toBe(true);
    expect(selected('tc1')).toBe(true); // 12 turns
  });

  it('clicking a player button changes the controller and moves the highlight', () => {
    w = bootSetup();
    setPlayer(w, 1, SB.HUMAN);
    expect(w.gameSetup.p[1]).toBe(w.PLAYER_HUMAN);
    expect(q(w, 'sb11').classList.contains('selected')).toBe(true);
    expect(q(w, 'sb12').classList.contains('selected')).toBe(false);
  });

  it('turn count and AI level buttons update the setup and are exclusive', () => {
    w = bootSetup();
    click(w, 'tc0'); // "9"
    expect(w.gameSetup.tc).toBe(9);
    expect(q(w, 'tc0').classList.contains('selected')).toBe(true);
    expect(q(w, 'tc1').classList.contains('selected')).toBe(false);
    click(w, 'ai3');
    expect(w.gameSetup.l).toBe(3);
    expect(q(w, 'ai3').classList.contains('selected')).toBe(true);
    expect(q(w, 'ai0').classList.contains('selected')).toBe(false);
    click(w, 'ai0');
    expect(w.gameSetup.l).toBe(0);
    click(w, 'tc3'); // "Endless"
    expect(w.gameSetup.tc).toBe(w.UNLIMITED_TURNS);
  });

  it('shows "Change map" and "Start game" buttons, enabled by default', () => {
    w = bootSetup();
    const labels = bottomButtons(w).map((a) => a.textContent.trim());
    expect(labels).toEqual(['Change map', 'Start game']);
    expect(bottomButtons(w).some((a) => a.classList.contains('off'))).toBe(false);
  });

  it('validation: fewer than two players disables the action buttons', () => {
    w = bootSetup();
    setPlayer(w, 1, SB.OFF);
    setPlayer(w, 2, SB.OFF);
    expect(bottomButtons(w).every((a) => a.classList.contains('off'))).toBe(true);
    setPlayer(w, 1, SB.AI);
    expect(bottomButtons(w).some((a) => a.classList.contains('off'))).toBe(false);
  });

  it('switching a player between Human and AI keeps the same map but changes the controller', () => {
    w = bootSetup();
    const mapBefore = q(w, 'm').innerHTML;
    setPlayer(w, 1, SB.HUMAN);
    expect(q(w, 'm').innerHTML).toBe(mapBefore);
    setPlayer(w, 0, SB.AI);
    expect(q(w, 'm').innerHTML).toBe(mapBefore);
    expect(w.gameSetup.p.slice(0, 2)).toEqual([w.PLAYER_AI, w.PLAYER_HUMAN]);
  });

  it('a controller switched during setup applies to the started game', async () => {
    w = bootSetup();
    setPlayer(w, 1, SB.HUMAN);
    setPlayer(w, 0, SB.AI);
    clickBottom(w, 'Start game');
    await waitFor(() => w.displayedState);
    const players = current(w).p;
    expect(players[0].u).toBe(w.aiPickMove);
    expect(players[0].p).toBeDefined();
    expect(players[1].u).toBe(w.uiPickMove);
    expect(players[1].p).toBeUndefined();
  });

  it('turning a player On or Off still regenerates the map', () => {
    w = bootSetup();
    const mapBefore = q(w, 'm').innerHTML;
    setPlayer(w, 3, SB.AI);
    expect(q(w, 'm').innerHTML).not.toBe(mapBefore);
  });

  it('"Change map" regenerates the board', () => {
    w = bootSetup();
    const before = q(w, 'm').innerHTML;
    clickBottom(w, 'Change map');
    expect(q(w, 'm').innerHTML).not.toBe(before);
  });

  it('draws one temple element per temple on the map', () => {
    w = bootSetup();
    expect(q(w, 'm').querySelectorAll('.temple').length).toBeGreaterThanOrEqual(5);
  });
});

describe('UI components: title screen and tutorial', () => {
  it('shows the tutorial card controls and hides "previous" on the first card', () => {
    w = bootSetup();
    expect(q(w, 'prv').style.display).toBe('none');
    expect(q(w, 'nxt').style.display).toBe('block');
  });

  it('next/previous move through the 5 cards and hide at the ends', () => {
    w = bootSetup();
    for (let i = 0; i < 10; i++) click(w, 'nxt');
    expect(w.currentCard).toBe(4);
    expect(q(w, 'nxt').style.display).toBe('none');
    expect(q(w, 'prv').style.display).toBe('block');
    expect(q(w, 'tuc').style.transform).toContain('-80%');
    for (let i = 0; i < 10; i++) click(w, 'prv');
    expect(w.currentCard).toBe(0);
  });

  it('"Got it!" hides the title screen after its fade', async () => {
    w = bootSetup();
    click(w, 'cb');
    await waitFor(() => q(w, 'ts').style.display === 'none');
  });

  it('the sound button toggles and persists the preference', () => {
    w = bootSetup();
    const initial = w.gameSetup.s;
    click(w, 'snd');
    expect(w.gameSetup.s).toBe(!initial);
    expect(JSON.parse(w.localStorage.getItem('s')).s).toBe(!initial);
    expect(q(w, 'snd').textContent.trim()).toBe('');
  });
});

describe('UI components: in-game sidebar and buttons', () => {
  it('shows player panels, turn counter, moves and faith', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    expect(text(w, 'tc')).toMatch(/Turn\s*1\s*\/\s*12/);
    expect(q(w, 'pl0')).not.toBeNull();
    expect(q(w, 'pl1')).not.toBeNull();
    expect(q(w, 'pl2')).toBeNull();
    expect(text(w, 'pr0')).toContain('1');
    expect(text(w, 'mc')).toContain('3');
    expect(text(w, 'in')).toContain('Click on a region');
  });

  it('shows "Cancel move" (hidden) and "End turn" buttons while idle', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    expect(bottomButtons(w).map((a) => a.textContent.trim())).toEqual(['End turn']);
  });

  it('selecting an army reveals the Cancel button and updates the hint text', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    const s = current(w);
    const home = s.r.find((r) => w.owner(s, r) === s.p[0] && w.soldierCount(s, r));
    w.uiCallbacks.c(home);
    expect(bottomButtons(w).map((a) => a.textContent.trim())).toEqual(['Cancel move', 'End turn']);
    expect(text(w, 'in')).toContain('target region');
    clickBottom(w, 'Cancel move');
    expect(bottomButtons(w).map((a) => a.textContent.trim())).toEqual(['End turn']);
  });

  it('clicking the selected region again cycles through the soldier counts', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    const s = current(w);
    const home = s.r.find((r) => w.owner(s, r) === s.p[0] && w.soldierCount(s, r));
    w.uiCallbacks.c(home);
    expect(current(w).d.c).toBe(3);
    w.uiCallbacks.c(home);
    expect(current(w).d.c).toBe(1);
    w.uiCallbacks.c(home);
    expect(current(w).d.c).toBe(2);
  });

  it('temple click opens the upgrade menu; unaffordable upgrades are disabled', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    const s = current(w);
    const home = s.r.find((r) => w.owner(s, r) === s.p[0] && s.t[r.i]);
    w.uiCallbacks.t(home);
    const labels = bottomButtons(w).map((a) => a.textContent);
    expect(labels.some((l) => l.includes('Extra soldier'))).toBe(true);
    expect(labels.some((l) => l.includes('Done'))).toBe(true);
    expect(bottomButtons(w).filter((a) => a.classList.contains('off')).length).toBeGreaterThan(0);
    expect(text(w, 'tc')).toContain('Basic Temple');
    clickBottom(w, 'Done');
    expect(text(w, 'tc')).toMatch(/Turn/);
  });

  it('player stats reflect the end of the game: skull for the eliminated, crown for the winner', async () => {
    w = startHotseatGame();
    await waitForHumanTurn(w);
    const s = current(w);
    w.updateDisplay(Object.assign(w.copyState(s), { e: s.p[0], o: Object.fromEntries(Object.entries(s.o).filter(([, p]) => p === s.p[0])) }));
    expect(q(w, 'pc0').innerHTML).toBe('♛');
    expect(q(w, 'pr1').textContent).toBe('☠');
  });
});
