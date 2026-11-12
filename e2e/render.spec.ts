import { expect, test } from '@playwright/test';
import {
  collectErrors,
  fillRequired,
  openReady,
  type Surface,
  type Theme,
} from './ui';

const SURFACES: Surface[] = ['sidebar', 'dialog', 'page'];
const THEMES: Theme[] = ['workspace', 'yorsh'];

for (const surface of SURFACES) {
  for (const theme of THEMES) {
    test(`renders the ${surface} in the ${theme} theme`, async ({ page }) => {
      const errors = collectErrors(page);

      await openReady(page, { surface, theme });

      await expect(page.locator('html')).toHaveAttribute(
        'data-surface',
        surface,
      );
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await expect(
        page.getByRole('heading', { name: 'Google Form' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
    });
  }
}

test('shows the owner logo on every surface in the yorsh theme only', async ({
  page,
}) => {
  for (const surface of SURFACES) {
    await openReady(page, { surface, theme: 'yorsh' });
    await expect(page.locator('img.logo')).toHaveCount(1);
    if (surface !== 'page') {
      const box = await page.locator('img.logo').boundingBox();
      expect([box!.width, box!.height]).toEqual([32, 32]);
    }

    await openReady(page, { surface, theme: 'workspace' });
    await expect(page.locator('img.logo')).toHaveCount(0);
  }
});

test('keeps the page footer content off the screen edges on a phone', async ({
  page,
}) => {
  await openReady(page, { surface: 'page', theme: 'workspace' });
  await page.setViewportSize({ width: 375, height: 700 });

  const status = await page.locator('.footer-inner .status').boundingBox();
  const save = await page.getByRole('button', { name: 'Save' }).boundingBox();
  expect(status!.x).toBeGreaterThanOrEqual(16);
  expect(375 - (save!.x + save!.width)).toBeGreaterThanOrEqual(16);
});

test('shows no pointer cursor on the label of a disabled switch', async ({
  page,
}) => {
  await openReady(page, { scenario: 'readonly' });

  const label = page
    .locator('.switch-row')
    .filter({ hasText: 'Email results to respondents' })
    .locator('.label');
  await expect(label).toHaveCSS('cursor', 'default');
});

test('shows the app name before the title on the page surface only', async ({
  page,
}) => {
  await openReady(page, { surface: 'page', theme: 'workspace' });
  const appName = page.locator('.page-heading > p.app-name');
  await expect(appName).toHaveText('Quiz marker');
  const order = await page
    .locator('.page-heading')
    .evaluate((heading) =>
      Array.from(heading.children).map((child) => child.tagName),
    );
  expect(order.slice(0, 2)).toEqual(['P', 'H1']);

  for (const surface of ['dialog', 'sidebar'] as const) {
    await openReady(page, { surface, theme: 'workspace' });
    await expect(page.locator('.app-name')).toHaveCount(0);
  }
});

for (const theme of THEMES) {
  test(`drives focus from --color-brand in the ${theme} theme`, async ({
    page,
  }) => {
    await openReady(page, { theme });
    await fillRequired(page);
    const save = page.getByRole('button', { name: 'Save' });
    const saveBackground = await save.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    await page.evaluate(() =>
      document.documentElement.style.setProperty('--color-brand', '#123456'),
    );
    const input = page.getByLabel('Organisation name');
    await input.focus();

    await expect(input).toHaveCSS('border-color', 'rgb(18, 52, 86)');
    await expect(save).toHaveCSS('background-color', saveBackground);
  });
}

test('recolours the filled button and focus from --color-primary in the workspace theme', async ({
  page,
}) => {
  await openReady(page, { theme: 'workspace' });
  await fillRequired(page);
  await page.evaluate(() =>
    document.documentElement.style.setProperty('--color-primary', '#7a1f5c'),
  );
  const input = page.getByLabel('Organisation name');
  await input.focus();

  await expect(input).toHaveCSS('border-color', 'rgb(122, 31, 92)');
  await expect(page.getByRole('button', { name: 'Save' })).toHaveCSS(
    'background-color',
    'rgb(122, 31, 92)',
  );
});

test('applies the Yorsh brand palette in the yorsh theme', async ({ page }) => {
  await openReady(page, { surface: 'page', theme: 'yorsh' });
  await fillRequired(page);
  const input = page.getByLabel('Organisation name');
  await input.focus();

  await expect(page.getByRole('button', { name: 'Save' })).toHaveCSS(
    'background-color',
    'rgb(163, 74, 28)',
  );
  await expect(input).toHaveCSS('border-color', 'rgb(15, 85, 99)');
  await expect(page.locator('body')).toHaveCSS(
    'background-color',
    'rgb(247, 246, 243)',
  );
});

for (const [theme, family] of [
  ['yorsh', '"Space Grotesk"'],
  ['workspace', 'Roboto'],
] as const) {
  test(`sets the ${theme} page title in ${family}`, async ({ page }) => {
    await openReady(page, { surface: 'page', theme });
    const fontFamily = await page
      .locator('.page-title')
      .evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily.startsWith(family)).toBe(true);

    if (theme === 'yorsh') {
      // check() is true when no matching face exists, so assert the faces are declared and loaded.
      const loaded = await page.evaluate(async () => {
        const faces = [...document.fonts].map((f) =>
          f.family.replace(/"/g, ''),
        );
        await Promise.all(
          ['700 22px "Space Grotesk"', '400 16px "DM Sans"'].map((f) =>
            document.fonts.load(f),
          ),
        );
        await document.fonts.ready;
        return {
          faces,
          display: document.fonts.check('700 22px "Space Grotesk"'),
          body: document.fonts.check('400 16px "DM Sans"'),
          statuses: [...document.fonts].map((f) => f.status),
        };
      });
      expect(loaded.faces).toEqual(
        expect.arrayContaining(['Space Grotesk', 'DM Sans']),
      );
      expect(loaded.statuses.every((s) => s === 'loaded')).toBe(true);
      expect(loaded.display).toBe(true);
      expect(loaded.body).toBe(true);
    }
  });
}
