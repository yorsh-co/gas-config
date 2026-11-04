import { expect, test } from '@playwright/test';
import { fillRequired, openReady, recordSaveIds, VALID_FORM_URL } from './ui';

test.describe('saving', () => {
  test('edits, saves and confirms with a snackbar', async ({ page }) => {
    await openReady(page);
    await page.getByLabel('Organisation name').fill('Harbour Trust');
    await fillRequired(page);
    await expect(page.getByText('Unsaved changes')).toBeVisible();

    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Saving…')).toBeVisible();
    await expect(
      page.getByRole('status').filter({ hasText: 'Settings saved' }),
    ).toBeVisible();
    await expect(page.getByText('All changes saved')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  test('sends a fresh saveId per user-initiated save', async ({ page }) => {
    const saveIds = await recordSaveIds(page);
    await openReady(page);
    await fillRequired(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('All changes saved')).toBeVisible();
    await page.getByLabel('Organisation name').fill('Second Trust');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('All changes saved')).toBeVisible();

    expect(saveIds).toHaveLength(2);
    expect(new Set(saveIds).size).toBe(2);
    for (const id of saveIds) expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

test.describe('validation', () => {
  test('shows an error on blur', async ({ page }) => {
    await openReady(page);
    const name = page.getByLabel('Organisation name');

    await name.fill('');
    await expect(page.getByText('This field is required')).toHaveCount(0);
    await name.blur();

    await expect(page.getByText('This field is required')).toBeVisible();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Fix 1 error to save')).toBeVisible();
  });

  test('shows errors on save and focuses the first invalid field', async ({
    page,
  }) => {
    await openReady(page);
    await page.getByLabel('Organisation name').fill('Changed');

    await page.getByRole('button', { name: 'Save' }).click();

    const link = page.getByLabel('Form link');
    await expect(link).toBeFocused();
    await expect(link).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('This field is required')).toBeVisible();
  });

  test('clears an error live while typing', async ({ page }) => {
    await openReady(page);
    const link = page.getByLabel('Form link');
    await link.fill('nope');
    await link.blur();
    await expect(
      page.getByText('Enter a link starting with https://'),
    ).toBeVisible();

    await link.fill(VALID_FORM_URL);

    await expect(link).toHaveAttribute('aria-invalid', 'false');
  });

  test('maps a server rejection to its field', async ({ page }) => {
    await openReady(page, { scenario: 'invalid' });
    await fillRequired(page);

    await page.getByRole('button', { name: 'Save' }).click();

    const link = page.getByLabel('Form link');
    await expect(
      page.getByText(
        'This form could not be opened. Check that you have access to it.',
      ),
    ).toBeVisible();
    await expect(link).toHaveAttribute('aria-invalid', 'true');
    await expect(link).toBeFocused();
  });

  test('shows an invalid stored value flagged on first render', async ({
    page,
  }) => {
    await openReady(page, { scenario: 'stored-invalid' });

    const link = page.getByLabel('Form link');
    await expect(link).toHaveValue('http://docs.google.com/forms/d/abc/edit');
    await expect(link).toHaveAttribute('aria-invalid', 'true');
    await expect(
      page.getByText('Enter a link starting with https://'),
    ).toBeVisible();
    await expect(page.getByText('Fix 1 error to save')).toBeVisible();
  });
});

test.describe('failures', () => {
  test('recovers from a conflict through Reload', async ({ page }) => {
    await openReady(page, { scenario: 'conflict' });
    await fillRequired(page);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(
      page.getByText('Someone else changed these settings'),
    ).toBeVisible();
    await expect(page.getByText('Reload to continue')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();

    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByLabel('Organisation name')).toBeVisible();
    await fillRequired(page);
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('All changes saved')).toBeVisible();
    await expect(
      page.getByText('Someone else changed these settings'),
    ).toHaveCount(0);
  });

  test('is read-only for a user who cannot edit', async ({ page }) => {
    await openReady(page, { scenario: 'readonly' });

    await expect(
      page.getByText('Only listed editors can change these settings.'),
    ).toBeVisible();
    await expect(page.getByLabel('Organisation name')).toHaveJSProperty(
      'readOnly',
      true,
    );
    await expect(page.getByLabel('Language and region')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
  });

  test('switches to read-only when a save is unauthorized', async ({
    page,
  }) => {
    await openReady(page, { scenario: 'unauthorized' });
    await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
    await fillRequired(page);

    await page.getByRole('button', { name: 'Save' }).click();

    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: "You can't change these settings." }),
    ).toBeVisible();
    await expect(page.getByLabel('Organisation name')).toHaveJSProperty(
      'readOnly',
      true,
    );
    await expect(page.getByRole('button', { name: 'Save' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
  });

  test('hides the footer of a page that became read-only', async ({ page }) => {
    await openReady(page, { surface: 'page', scenario: 'unauthorized' });
    await fillRequired(page);

    await page.getByRole('button', { name: 'Save' }).click();

    await expect(
      page.getByText("You can't change these settings."),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close' })).toBeHidden();
  });

  test('retries a timed-out save once with the same saveId', async ({
    page,
  }) => {
    const saveIds = await recordSaveIds(page);
    await page.clock.install();
    await openReady(page, { scenario: 'timeout' });
    await fillRequired(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saving…')).toBeVisible();

    await page.clock.fastForward(30_000);

    await expect(
      page.getByText("Couldn't confirm the save. Retrying…"),
    ).toBeVisible();
    await page.clock.fastForward(1_000);
    await expect(page.getByText('All changes saved')).toBeVisible();
    await expect(page.getByText('Settings saved')).toBeVisible();
    expect(saveIds).toHaveLength(2);
    expect(saveIds[1]).toBe(saveIds[0]);
  });

  test('offers Try again when the retry times out too', async ({ page }) => {
    const saveIds = await recordSaveIds(page);
    await page.clock.install();
    await openReady(page, { scenario: 'timeout-twice' });
    await fillRequired(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Saving…')).toBeVisible();

    await page.clock.fastForward(30_000);
    await expect(
      page.getByText("Couldn't confirm the save. Retrying…"),
    ).toBeVisible();
    await page.clock.fastForward(30_000);

    await expect(
      page.getByText(
        'Your changes may not have been saved. Try again to check.',
      ),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Try again' }).click();
    await page.clock.fastForward(1_000);

    await expect(page.getByText('All changes saved')).toBeVisible();
    expect(saveIds).toHaveLength(3);
    expect(new Set(saveIds).size).toBe(1);
  });

  test('retries a load failure with Try again', async ({ page }) => {
    await openReady(page, { scenario: 'load-error' }).catch(() => undefined);

    await expect(page.getByRole('alert')).toContainText(
      'Settings could not be loaded.',
    );
    await page.getByRole('button', { name: 'Try again' }).click();

    await expect(page.getByLabel('Organisation name')).toBeVisible();
  });
});

test.describe('leaving', () => {
  test('asks before discarding edits on Cancel', async ({ page }) => {
    await openReady(page);
    await page.getByLabel('Organisation name').fill('Changed');

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByText('Discard unsaved changes?')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Keep editing' }),
    ).toBeFocused();

    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
    await expect(page.getByLabel('Organisation name')).toHaveValue('Changed');
  });

  test('discards page edits with Discard changes', async ({ page }) => {
    await openReady(page, { surface: 'page' });
    const name = page.getByLabel('Organisation name');
    const discard = page.getByRole('button', { name: 'Discard changes' });
    await expect(discard).toBeDisabled();

    await name.fill('Changed');
    await expect(discard).toBeEnabled();
    await discard.click();

    await expect(name).toHaveValue('Riverside Learning Trust');
    await expect(discard).toBeDisabled();
  });

  test('closes the harness surface after confirming Discard', async ({
    page,
  }) => {
    await page.route('https://fonts.googleapis.com/**', (route) =>
      route.fulfill({ contentType: 'text/css', body: '' }),
    );
    await page.goto(
      '/dev/index.html?surface=dialog&theme=workspace&scenario=normal',
    );
    const frame = page.frameLocator('iframe');
    await frame.getByLabel('Organisation name').fill('Changed');
    await frame.getByRole('button', { name: 'Cancel' }).click();

    await frame.getByRole('button', { name: 'Discard' }).click();

    await expect(page.getByText('Settings closed')).toBeVisible();
    await page.getByRole('button', { name: 'Reopen' }).click();
    await expect(frame.getByLabel('Organisation name')).toBeVisible();
  });
});
