import { test, expect } from '@playwright/test';

// End-to-end tests drive the real page in Chromium. Player buttons: sb<player><n>, n = 2 AI / 1 Human / 0 Off.
async function openGame(page) {
  await page.goto('./index.html');
  await page.waitForFunction(() => document.querySelector('#ts') && document.querySelector('#nxt'));
  await page.click('#cb'); // dismiss the title/tutorial overlay
  await expect(page.locator('#ts')).toBeHidden();
}

async function startHotseat(page) {
  await page.click('#sb11');
  await page.click('#sb20');
  await page.click('#sb30');
  await page.locator('#u a', { hasText: 'Start game' }).click();
  await expect(page.locator('#tc')).toContainText('Turn');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('cleared')) { localStorage.clear(); sessionStorage.setItem('cleared', '1'); } });
});

test.describe('E2E: setup and tutorial', () => {
  test('loads, shows the tutorial and the setup screen behind it', async ({ page }) => {
    await page.goto('./index.html');
    await expect(page.locator('#ts')).toBeVisible();
    await expect(page.locator('h1')).toContainText('Compact Conflict');
    await page.click('#nxt');
    await expect(page.locator('#prv')).toBeVisible();
    await page.click('#cb');
    await expect(page.locator('#ts')).toBeHidden();
    await expect(page.locator('#u a')).toHaveText(['Change map', 'Start game']);
  });

  test('setup choices persist across a page refresh', async ({ page }) => {
    await openGame(page);
    await page.click('#tc0'); // 9 turns
    await page.click('#ai3'); // evil AI
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#tc0'));
    await expect(page.locator('#tc0')).toHaveClass(/selected/);
    await expect(page.locator('#ai3')).toHaveClass(/selected/);
  });

  test('cannot start with fewer than two players', async ({ page }) => {
    await openGame(page);
    await page.click('#sb10');
    await page.click('#sb20');
    await expect(page.locator('#u a.off')).toHaveCount(2);
  });
});

test.describe('E2E: playing', () => {
  test('start a hotseat game, play a full round, and see turn 2', async ({ page }) => {
    await openGame(page);
    await startHotseat(page);
    await expect(page.locator('#tc')).toContainText('Turn 1');
    await page.locator('#u a', { hasText: 'End turn' }).click();
    await page.waitForFunction(() => displayedState.m.p === 1 && uiCallbacks.b, null, { timeout: 10000 });
    await page.locator('#u a', { hasText: 'End turn' }).click();
    await expect(page.locator('#tc')).toContainText('Turn 2', { timeout: 15000 });
  });

  test('moving an army onto empty ground uses a move', async ({ page }) => {
    await openGame(page);
    await startHotseat(page);
    await expect(page.locator('#mc')).toContainText('3');
    const moved = await page.evaluate(() => {
      const s = displayedState, p = s.p[0];
      const home = s.r.find((r) => owner(s, r) === p && soldierCount(s, r));
      const target = home.n.find((n) => !owner(s, n) && !soldierCount(s, n));
      uiCallbacks.c(home);
      uiCallbacks.c(target);
      return !!target;
    });
    expect(moved).toBe(true);
    await expect(page.locator('#mc')).toContainText('2', { timeout: 10000 });
  });

  test('a game in progress survives a refresh and the restart button clears it', async ({ page }) => {
    await openGame(page);
    await startHotseat(page);
    await page.locator('#u a', { hasText: 'End turn' }).click();
    await expect(page.locator('#in')).toContainText('Click on a region', { timeout: 10000 });
    expect(await page.evaluate(() => localStorage.getItem('g'))).not.toBeNull();

    await page.reload();
    await expect(page.locator('#tc')).toContainText('Turn', { timeout: 10000 });
    await page.click('#cb').catch(() => {});
    await expect(page.locator('#pl1')).toBeVisible();

    await page.click('#end');
    await expect(page.locator('#u a')).toHaveText(['Change map', 'Start game']);
    expect(await page.evaluate(() => localStorage.getItem('g'))).toBeNull();
  });

  test('buying a soldier from the temple menu', async ({ page }) => {
    await openGame(page);
    await startHotseat(page);
    const result = await page.evaluate(() => {
      const s = displayedState;
      s.c[0] = 20;
      const temple = s.r.find((r) => owner(s, r) === s.p[0] && s.t[r.i]);
      uiCallbacks.t(temple);
      return { temple: temple.i, before: soldierCount(s, temple) };
    });
    await page.locator('#u a', { hasText: 'Extra soldier' }).click();
    await expect.poll(() => page.evaluate((i) => soldierCount(displayedState, displayedState.r[i]), result.temple), { timeout: 10000 })
      .toBe(result.before + 1);
    expect(await page.evaluate(() => displayedState.c[0])).toBe(12);
  });
});
