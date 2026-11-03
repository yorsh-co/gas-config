import { expect, test } from '@playwright/test';
import { collectErrors, openReady, type Surface, type Theme } from './ui';

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

test('shows the owner logo on the page surface in the yorsh theme only', async ({
  page,
}) => {
  await openReady(page, { surface: 'page', theme: 'yorsh' });
  await expect(page.locator('img.logo')).toHaveCount(1);

  await openReady(page, { surface: 'page', theme: 'workspace' });
  await expect(page.locator('img.logo')).toHaveCount(0);
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
